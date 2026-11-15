/**
 * Closing while a big file crosses (Tailscale sync, 1.0.4; the owner,
 * 2026-11-15: "büyük aktarım sürerken kapatmadan önce soru").
 *
 * Nebula asks before it closes only while a big file is on its way right now
 * (sync.js, moving()): one coming here, or one another device is taking from
 * this computer. Staying open is the first button, the default, and what Esc
 * or the dialog's × gives; "Close anyway" loses nothing — a file half here is
 * carried on from where it stopped the next time both have Nebula open. Files
 * that only wait for a device that is away are nothing to ask about.
 */
import { words } from './dialog-words.js';

/** The answers, by the button's place. */
export const STAY = 0;
export const CLOSE = 1;

const mb = (n) => (Math.max(0, Number(n) || 0) / 1048576).toFixed(1);

/**
 * @param {{coming: {name: string, got: number, size: number}|null, going: number}|null} moving  sync.moving()
 * @param {string} [lang] the app's language
 * @returns {object|null} what dialog.showMessageBox is given, or null when nothing crosses: no question
 */
export function closeQuestion(moving, lang) {
  const parts = [];
  if (moving?.coming) {
    parts.push(words('{name}: {got} of {size} MB are here. If you close Nebula now, the rest comes the next time Nebula is open on both computers.', lang, {
      name: String(moving.coming.name ?? ''), got: mb(moving.coming.got), size: mb(moving.coming.size),
    }));
  }
  if (moving?.going > 0) parts.push(words('Another of your devices is still taking a big file from this computer. If you close Nebula now, it carries on the next time Nebula is open on both.', lang));
  if (!parts.length) return null;
  return {
    type: 'question',
    buttons: [words('Keep Nebula open', lang), words('Close anyway', lang)],
    defaultId: STAY,
    cancelId: STAY,
    noLink: true,
    message: words('A big file is still being synced.', lang),
    detail: parts.join('\n\n'),
  };
}
