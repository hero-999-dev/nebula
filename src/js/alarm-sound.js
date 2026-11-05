/**
 * What the Pomodoro and the Clock widgets ring with (1.0.3): nothing, one of
 * the two recordings Nebula ships (wind chimes, a singing bowl), one of the system's sounds,
 * or a file of the user's. Three choices, in Settings and in the widgets
 * themselves: the Clock's alarm, a Pomodoro's focus ending, its break ending
 * (the owner's Bug Find note: "break ile focusun sesi farkli olsun default
 * olarak kullanici ayarlayabilsin"). The files are the main process's to keep
 * (electron/alarm-sound.js).
 */

import { readSettings, writeSettings } from './settings.js';
import { t } from './i18n.js';

/** The three things that ring, by their setting. */
export const SOUND_SLOTS = { alarm: 'alarmSound', focus: 'focusSound', break: 'breakSound' };

const cache = new Map();          // id -> address
let playing = null;               // { stop }

/**
 * The two sounds Nebula ships (1.0.3): real recordings in the public domain from
 * Wikimedia Commons, not drawn tones — the owner wanted no made-up sound. Their
 * ids stay 'chime' and 'bell' so a saved choice keeps ringing. Credits: About
 * Nebula and CREDITS.md.
 */
const BUILT_IN = {
  chime: new URL('../sounds/wind-chimes.ogg', import.meta.url).href,     // "Windchimes.ogg", Esc861
  bell: new URL('../sounds/singing-bowl.ogg', import.meta.url).href,     // "SingingBowl1.ogg", BambooBeast
};

/**
 * The name each of Nebula's sounds is shown by, with who recorded it written
 * right beside it (the owner, 1.0.3: "by esc861 ve by bamboobeast yazilsin direk").
 * A recordist's name is theirs: it is never translated.
 */
const BUILT_IN_NAME = { chime: ['Wind chimes', 'Esc861'], bell: ['Singing bowl', 'BambooBeast'] };
export const builtInLabel = (id) => (BUILT_IN_NAME[id] ? `${t(BUILT_IN_NAME[id][0])} by ${BUILT_IN_NAME[id][1]}` : null);

async function addressOf(id) {
  if (BUILT_IN[id]) return BUILT_IN[id];
  if (cache.has(id)) return cache.get(id);
  const res = await window.nebula?.sound?.get(id)?.catch?.(() => null);
  if (!res?.ok || !res.sound) return null;
  cache.set(id, res.sound);
  return res.sound;
}

/** Stops whatever rings now. */
export function stopRing() {
  playing?.stop();
  playing = null;
}
export const isRinging = () => !!playing;

/**
 * Rings `times` times with the alarm's sound (or `id` instead of it). The wind
 * chimes stand in for a file that cannot be had. Resolves when it has started.
 */
export async function ring({ id = readSettings().alarmSound, times = 1 } = {}) {
  stopRing();
  if (id === 'off') return;
  let stopped = false;
  const me = { stop: () => { stopped = true; } };
  playing = me;
  const address = (await addressOf(id)) ?? BUILT_IN.chime;
  if (stopped) return;
  const audio = new Audio(address);
  let left = Math.max(1, times);
  audio.addEventListener('ended', () => { left -= 1; if (left > 0 && !stopped) void audio.play().catch(() => {}); else if (playing === me) playing = null; });
  me.stop = () => { stopped = true; audio.pause(); };
  await audio.play().catch(() => {});
}

/** The id a sound of the user's is chosen by: the first build's one sound is 'own'. */
const ownValue = (id) => (id === 'own' ? 'own' : `own:${id}`);

/**
 * Every sound there is to choose, looked up now (the system's are found, not
 * listed by hand): [{ value, label, own? }], Nebula's first, the user's, the system's.
 */
export async function soundChoices() {
  const res = await window.nebula?.sound?.list()?.catch?.(() => null);
  const own = Array.isArray(res?.own) ? res.own : [];
  return [
    { value: 'off', label: t('Off') },
    { value: 'chime', label: builtInLabel('chime') },
    { value: 'bell', label: builtInLabel('bell') },
    ...own.map((o) => ({ value: ownValue(o.id), label: o.name.replace(/\.[a-z0-9]+$/i, ''), own: o.id })),
    ...(res?.system ?? []).map((name) => ({ value: `system:${name}`, label: name.replace(/\.[a-z0-9]+$/i, '') })),
  ];
}

/** The name a sound is shown by, from a list of choices; the wind chimes for one that is gone. */
export const soundLabel = (choices, value) => (choices.find((c) => c.value === value) ?? choices[1])?.label ?? '';

/** The sound a slot rings with now. */
export const soundOf = (slot) => readSettings()[SOUND_SLOTS[slot]];

/** A sound chosen for a slot. */
export const chooseSound = (slot, value) => writeSettings({ [SOUND_SLOTS[slot]]: value });

/**
 * A file of the user's added to the shelf and chosen for `slot`.
 * @returns {Promise<string|null>} its value, or null when it could not be kept
 */
export async function addOwnSound(file, slot) {
  if (!file) return null;
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
  const res = await window.nebula?.sound?.setOwn(dataUrl, file.name)?.catch?.(() => null);
  if (!res?.ok || !res.id) {
    window.dispatchEvent(new CustomEvent('nebula-toast', { detail: t(res?.error === 'full' ? 'There are too many sounds of yours — remove one first' : 'That sound could not be used') }));
    return null;
  }
  const value = ownValue(res.id);
  if (slot) chooseSound(slot, value);
  return value;
}

/** A sound of the user's taken away; whatever rang with it rings with its default again. */
export async function removeOwnSound(value) {
  const id = value === 'own' ? 'own' : String(value).replace(/^own:/, '');
  await window.nebula?.sound?.clearOwn(id)?.catch?.(() => null);
  cache.delete(value);
  const now = readSettings();
  const back = {};
  for (const [slot, key] of Object.entries(SOUND_SLOTS)) if (now[key] === value) back[key] = slot === 'break' ? 'bell' : 'chime';
  if (Object.keys(back).length) writeSettings(back);
}
