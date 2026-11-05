/**
 * A card at the bottom right when the window goes onto another screen (1.0.3).
 *
 * Soften for the screen is off until asked (the owner: "soften for the screen
 * never olsun doğal ayarı"), and an external screen can show the picture's
 * smooth colours in green specks and steps that this page cannot see. So when
 * the window is moved onto an external screen while a picture is behind it and
 * not softened, a card says where to soften it; "Don't show again for this
 * screen" keeps it from coming back for that screen ("o harici ekran için
 * tekrardan göstermesin"). The screen is told by its name, which stays the same
 * from one start to the next where its id need not.
 */

import { hasBackdrop, isSmooth } from './backdrop.js';
import { readSettings, writeSettings } from './settings.js';

const OFF_KEY = 'nebula:screen-tip-off';
// The test builds of 1.0.3 kept "auto" as the default; it is taken back to Never once.
const DEFAULT_KEY = 'nebula:smooth-default-off';

/** The name a screen is remembered by: its label, else its id. Pure — tested. */
export const screenKey = (info) => (info?.label ? `label:${info.label}` : info?.id != null ? `id:${info.id}` : null);

/**
 * Whether the card is due for a screen the window has just moved onto. Pure — tested.
 * @param {{ok?: boolean, id?: number, internal?: boolean, label?: string}|null} info the new screen
 * @param {number|null|undefined} before the id of the screen it was on
 * @param {{picture: boolean, smooth: boolean, off: string[]}} now
 */
export function tipDue(info, before, { picture, smooth, off }) {
  if (!info?.ok || before == null || info.id === before) return false;
  if (info.internal !== false || !picture || smooth) return false;
  const key = screenKey(info);
  return !!key && !off.includes(key);
}

const readOff = () => {
  try { const v = JSON.parse(localStorage.getItem(OFF_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
};
const writeOff = (list) => { try { localStorage.setItem(OFF_KEY, JSON.stringify(list.slice(-50))); } catch { /* shown again next time */ } };

export function initScreenTip({ openSettings }) {
  try {
    if (!localStorage.getItem(DEFAULT_KEY)) {
      if (readSettings().smoothScreen === 'auto') writeSettings({ smoothScreen: 'off' });
      localStorage.setItem(DEFAULT_KEY, '1');
    }
  } catch { /* the setting as it was */ }

  let card = null;
  let shownFor = null;
  const hide = () => { if (card) card.hidden = true; shownFor = null; };
  const build = () => {
    card = document.createElement('div');
    card.className = 'update-card screen-tip';
    card.id = 'screen-tip';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    const text = document.createElement('p');
    text.className = 'uc-text';
    text.textContent = 'Nebula is on another screen now. If the picture shows green specks or steps there, soften it in Settings → Appearance → Soften for the screen.';
    const actions = document.createElement('div');
    actions.className = 'uc-actions';
    const button = (id, cls, words, run) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${cls}`;
      b.dataset.tip = id;
      b.textContent = words;
      b.addEventListener('click', run);
      return b;
    };
    actions.append(
      button('off', 'ghost', 'Don’t show again for this screen', () => { if (shownFor) writeOff([...readOff().filter((k) => k !== shownFor), shownFor]); hide(); }),
      button('later', 'ghost', 'Later', hide),
      button('open', 'primary', 'Open Settings', () => { hide(); openSettings?.('look'); }),
    );
    card.append(text, actions);
    card.hidden = true;
    document.body.append(card);
  };

  let before = null;
  const show = (info) => {
    if (!card) build();
    // Above the update card when that one is up.
    const update = document.getElementById('update-card');
    card.style.bottom = update && !update.hidden ? `${18 + update.offsetHeight + 10}px` : '';
    shownFor = screenKey(info);
    card.hidden = false;
  };
  const changed = (info) => {
    if (!info?.ok) return;
    const was = before;
    before = info.id;
    if (info.internal !== false && shownFor) hide();
    if (tipDue(info, was, { picture: hasBackdrop(), smooth: isSmooth(), off: readOff() })) show(info);
  };
  void Promise.resolve(window.nebula?.screen?.get?.()).then((info) => { if (info?.ok && before == null) before = info.id; }).catch(() => {});
  window.nebula?.screen?.onChanged?.(changed);
}
