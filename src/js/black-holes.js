/**
 * Black holes in the note list (0.9.4): notes kept encrypted.
 *
 * The owner's Ideas note: "a black hole section beside the folders … opening
 * one in the app asks for a password: a 4-digit PIN, set when the black hole
 * is made — or a passkey (fingerprint, the computer's PIN)." On the first
 * build: "six digits, not four", "say passkey, not Windows Hello", "no
 * counters beside them, and the lock at the left — it runs into the three
 * dots", "an arrow beside Black holes that folds the whole section". And
 * later: "in a black hole the 6-digit PIN is compulsory and the passkey
 * optional, as with the app's lock; deleting a black hole must need its
 * password; a note put into one can be dragged back up among the notes the
 * same way — and that asks for the password too."
 *
 * The keys and the files are the main process's (electron/black-holes.js).
 * This draws the black holes under the notes — locked: a name and nothing
 * else; open: its notes, as a folder shows them — and holds the dialogs that
 * make, open and lock one. While a black hole is open its notes are in the
 * note store like any others, marked `hole`; the disk mirror seals them into
 * the black hole instead of writing them to the notes' folder (disk-store.js).
 * Locking takes them out of the store again, saved first.
 *
 * A black hole locks itself when the app has not been touched for ten
 * minutes, and all of them are locked when the app starts.
 */

import { t } from './i18n.js';
import { adoptHoleNotes, forgetNotes, flushNote } from './disk-store.js';
import { plainVideosOf, sealedVideosOf } from './file-video.js';
import { icon } from './icons.js';
import { on } from './bus.js';
import { readSettings } from './settings.js';

const IDLE_KEY = 'nebula:holes-idle-minutes';
const IDLE_MINUTES = 10;
/** Whether the section is folded: its black holes are still there, open or locked, only not drawn. */
const FOLDED_KEY = 'nebula:holes-folded';
/** A new PIN's length; a black hole made by the first build says its own (four). */
const PIN_DIGITS = 6;

export const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
export const button = (text, cls, run) => {
  const b = el('button', cls, text);
  b.type = 'button';
  if (run) b.addEventListener('click', run);
  return b;
};
export const pinField = (label, digits = PIN_DIGITS) => {
  const input = el('input', 'hole-pin');
  input.type = 'password';
  input.inputMode = 'numeric';
  input.maxLength = digits;
  input.autocomplete = 'off';
  input.placeholder = '•'.repeat(digits);
  input.setAttribute('aria-label', label);
  // Digits only, whatever is typed or pasted.
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, digits); });
  return input;
};
export const isPin = (value, digits = PIN_DIGITS) => new RegExp(`^\\d{${digits}}$`).test(value);
/**
 * A new PIN and the same once more, one under the other, each with a line
 * saying what goes in it — two bare boxes side by side did not say that the
 * second is the first again.
 */
export const newPinFields = (first) => {
  const pins = el('div', 'hole-pins');
  const pin1 = pinField(first);
  const pin2 = pinField(t('PIN again'));
  pin1.dataset.pin = 'new';
  pin2.dataset.pin = 'again';
  pins.append(pin1, el('p', 'hole-hint', t('Six digits.')), pin2, el('p', 'hole-hint', t('The same PIN once more.')));
  return { pins, pin1, pin2 };
};

/** How long a wait is, in words short enough for a line under the PIN. */
export function waitWords(ms) {
  const s = Math.ceil(ms / 1000);
  return s >= 90 ? `${Math.ceil(s / 60)} min` : `${s} s`;
}

/** What a refusal means, said plainly. */
export function refusalWords(res, lock = 'pin') {
  switch (res?.error) {
    case 'wrong': {
      if (res.waitMs > 0) return t(`Wrong. Wait ${waitWords(res.waitMs)} before the next try.`);
      return res.triesLeft === 1 ? t('Wrong. One more try before a wait.') : t(`Wrong. ${res.triesLeft} more tries before a wait.`);
    }
    case 'wait': return t(`Too many wrong tries. Wait ${waitWords(res.waitMs)}.`);
    case 'pin': return t('A PIN is six digits.');
    case 'hint': return t('The hint must not give the PIN away.');
    case 'other-computer': return t('This black hole was locked on another computer. Open it with its recovery key.');
    case 'hello-refused': return t('Not confirmed.');
    case 'hello-unavailable': return t('No passkey is set up on this computer.');
    case 'storage-unavailable': return t('Secure storage is unavailable on this computer. Try again when it is available.');
    case 'in-use': return t('This black hole has a file open. Close it and try again.');
    case 'locked': return t('The black hole is locked.');
    case 'name': return t('Give it a name.');
    default: return lock === 'hello' ? t('Not confirmed.') : t('That did not work.');
  }
}

/**
 * @param {object} deps
 * @param {HTMLElement} deps.listEl the note list; the black holes are drawn at its end
 * @param {import('./notes.js').NoteStore} deps.store
 * @param {(note: object) => HTMLElement} deps.noteItem a note's row, as the list draws it
 * @param {() => void} deps.onChanged draw the list again
 * @param {(id: string|null) => void} deps.openNote
 * @param {(holeId: string) => void} deps.newNote a new note in a black hole
 * @param {() => Promise<void>} deps.saveNow everything typed, on the disk
 * @param {HTMLElement} [deps.addButton] "New black hole", beside New folder
 */
export function initBlackHoles({ listEl, store, noteItem, onChanged, openNote, newNote, saveNow, addButton }) {
  const api = window.nebula?.holes;
  if (!api || !listEl) { addButton?.remove(); return null; }

  /** @type {{id: string, name: string, lock: 'pin'|'hello', pin: boolean, passkey: boolean, notes: number, open: boolean, waitMs: number}[]} */
  let holes = [];
  /** Those in the Trash: whole and locked, drawn there and nowhere else (note-actions.js). */
  let binned = [];
  let hello = false;
  // Put away in Settings (0.9.4: "hide the black holes entirely"): nothing of them is drawn or offered.
  let away = readSettings().hideHoles;
  if (addButton) addButton.hidden = away;
  const say = (text) => window.dispatchEvent(new CustomEvent('nebula-toast', { detail: text }));
  const holeOf = (id) => holes.find((h) => h.id === id) ?? null;
  // The owner's word for it, on every system: the fingerprint, the face or the computer's own PIN.
  const helloName = () => t('Passkey');

  // Left alone, they lock themselves: ten minutes without a key, a click or the wheel.
  const stored = Number(localStorage.getItem(IDLE_KEY));
  const idleMs = (localStorage.getItem(IDLE_KEY) !== null && Number.isFinite(stored) && stored >= 0 ? stored : IDLE_MINUTES) * 60_000;
  let idleTimer = 0;
  function touched() {
    clearTimeout(idleTimer);
    if (idleMs > 0 && holes.some((h) => h.open)) idleTimer = setTimeout(() => { void lockAll(); }, idleMs);
  }

  async function refresh() {
    try {
      const res = await api.list();
      if (res?.ok) {
        holes = res.holes.filter((h) => !h.trashedAt);
        binned = res.holes.filter((h) => h.trashedAt);
        hello = !!res.hello;
      }
    } catch { /* the list stays as it was */ }
    // From the moment one is open the clock runs: opened and left alone, it locks itself too.
    touched();
    onChanged();
  }

  // ---- the dialog ------------------------------------------------------------
  const overlay = el('div', 'overlay hole-overlay');
  overlay.id = 'ov-hole';
  overlay.hidden = true;
  const modal = el('div', 'modal hole-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  overlay.append(modal);
  document.body.append(overlay);
  let onClose = null;
  function closeDialog() {
    overlay.hidden = true;
    modal.replaceChildren();
    const then = onClose;
    onClose = null;
    then?.();
  }
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && !overlay.dataset.keep) closeDialog(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden && !overlay.dataset.keep) { e.preventDefault(); e.stopPropagation(); closeDialog(); }
  }, true);
  function dialog(title, { keep = false } = {}) {
    modal.replaceChildren(el('p', 'dlg-title', title));
    if (keep) overlay.dataset.keep = '1'; else delete overlay.dataset.keep;
    overlay.hidden = false;
    const error = el('p', 'hole-error');
    error.setAttribute('role', 'alert');
    const actions = el('div', 'dlg-actions');
    return { error, actions, fail: (text) => { error.textContent = text; } };
  }

  /** The recovery key, shown once: nothing else can open the black hole off this computer. */
  function showRecoveryKey(name, key) {
    const d = dialog(t('Recovery key'), { keep: true });
    const why = el('p', 'hole-note', t(`Write this key down and keep it somewhere safe. It opens “${name}” on another computer, after Windows is installed again, or when the PIN is forgotten. It is shown only now.`));
    const code = el('p', 'hole-key', key);
    code.dataset.noI18n = '';
    const copy = button(t('Copy'), 'btn ghost', async () => {
      try { await navigator.clipboard.writeText(key); say('Recovery key copied'); } catch { /* it can be read off the screen */ }
    });
    const done = button(t('I have written it down'), 'btn primary', closeDialog);
    d.actions.append(copy, done);
    modal.append(why, code, d.actions);
    done.focus();
  }

  /** New black hole: a name, and how it is locked. */
  function createDialog() {
    const d = dialog(t('New black hole'));
    const what = el('p', 'hole-note', t('Notes in a black hole are kept encrypted. Opening it asks for its 6-digit PIN — or, if you add one, for a passkey: your fingerprint, face or the computer’s own PIN.'));
    const name = el('input', 'hole-name');
    name.type = 'text';
    name.maxLength = 60;
    name.placeholder = t('Name');
    name.setAttribute('aria-label', t('Name'));
    name.autocomplete = 'off';
    const { pins, pin1, pin2 } = newPinFields(t('PIN'));
    // A hint for the PIN, if one is wanted: shown to whoever is asked for the PIN, so it is a reminder and no secret.
    const hint = el('input', 'hole-hint-field');
    hint.type = 'text';
    hint.maxLength = 80;
    hint.autocomplete = 'off';
    hint.placeholder = t('Hint (optional)');
    hint.setAttribute('aria-label', t('Hint (optional)'));
    pins.append(hint, el('p', 'hole-hint', t('Shown when the PIN is asked for. Anyone can read it: a reminder, not the PIN.')));
    // The PIN is the lock, always; a passkey is an addition — with it, either opens the black hole.
    const also = el('label', 'set-check hole-also');
    const box = el('input');
    box.type = 'checkbox';
    box.id = 'hole-passkey';
    also.append(box, el('span', '', t('Also open with a passkey')));
    if (!hello) { box.disabled = true; also.title = t('No passkey is set up on this computer.'); also.classList.add('off'); }
    const make = button(t('Create'), 'btn primary');
    let busy = false;
    async function submit() {
      if (busy) return;
      if (!name.value.trim()) { d.fail(t('Give it a name.')); name.focus(); return; }
      if (!isPin(pin1.value)) { d.fail(t('A PIN is six digits.')); pin1.focus(); return; }
      if (pin1.value !== pin2.value) { d.fail(t('The two PINs are not the same.')); pin2.value = ''; pin2.focus(); return; }
      const lock = box.checked ? 'hello' : 'pin';
      busy = true;
      make.disabled = true;
      d.fail(box.checked ? t('Waiting for passkey…') : '');
      let res = null;
      try { res = await api.create({ name: name.value, pin: pin1.value, hint: hint.value, passkey: box.checked }); } catch { res = null; }
      busy = false;
      make.disabled = false;
      if (!res?.ok) { d.fail(refusalWords(res, lock)); return; }
      const made = res.hole;
      await refresh();
      showRecoveryKey(made.name, res.recoveryKey);
    }
    make.addEventListener('click', submit);
    for (const input of [name, pin1, pin2, hint]) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } });
    d.actions.append(button(t('Cancel'), 'btn ghost', closeDialog), make);
    modal.append(what, name, pins, also, d.error, d.actions);
    name.focus();
  }

  /** What a black hole handed over goes into the store, and the list is drawn with it. */
  function take(id, res) {
    const notes = adoptHoleNotes(id, res.notes ?? []);
    store.addHoleNotes(id, notes);
    if (res.damaged) say(`${res.damaged} notes of this black hole could not be read`);
    if (res.backupProtectionIncomplete) say(t('Some older backups could not be protected. Check the backup folder permissions.'));
  }

  /** Open a black hole: its PIN, the system's yes, or its recovery key. */
  function unlockDialog(id, { recovery = false } = {}) {
    const hole = holeOf(id);
    if (!hole) return;
    const d = dialog(t(`Open “${hole.name}”`));
    if (hole.needsProtection) modal.append(el('p', 'hole-note', t('This black hole uses an older key wrapper. Opening it with its PIN while secure storage is available will strengthen it.')));
    let busy = false;
    const finish = async (by) => {
      if (busy) return null;
      busy = true;
      let res = null;
      try { res = await api.unlock(id, by); } catch { res = null; }
      busy = false;
      if (!res?.ok) return res ?? { error: 'failed' };
      take(id, res);
      closeDialog();
      await refresh();
      return res;
    };
    const cancel = button(t('Cancel'), 'btn ghost', closeDialog);
    if (recovery) {
      const why = el('p', 'hole-note', hole.lock === 'pin'
        ? t('Type the recovery key that was shown when this black hole was made, and a new PIN for it.')
        : t('Type the recovery key that was shown when this black hole was made.'));
      const key = el('input', 'hole-recovery');
      key.type = 'text';
      key.autocomplete = 'off';
      key.spellcheck = false;
      key.placeholder = 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX';
      key.setAttribute('aria-label', t('Recovery key'));
      const pin = pinField(t('New PIN'));
      pin.hidden = hole.lock !== 'pin';
      const open = button(t('Open'), 'btn primary');
      const submit = async () => {
        if (hole.lock === 'pin' && !isPin(pin.value)) { d.fail(t('A PIN is six digits.')); pin.focus(); return; }
        const res = await finish({ recovery: key.value, pin: hole.lock === 'pin' ? pin.value : undefined });
        if (res && !res.ok) d.fail(['wrong', 'wait', 'storage-unavailable'].includes(res.error) ? refusalWords(res) : t('That key does not open this black hole.'));
      };
      open.addEventListener('click', submit);
      for (const input of [key, pin]) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } });
      d.actions.append(cancel, open);
      modal.append(why, key, pin, d.error, d.actions);
      key.focus();
      return;
    }
    const other = button(t('Use the recovery key'), 'hole-link', () => unlockDialog(id, { recovery: true }));
    // Its PIN — its last digit opens it — and, where it has one, the passkey at a press:
    // nothing is asked of the system before that (as on the app's own lock screen).
    const pin = answerFields(hole, d, (by) => finish(by));
    if (hole.waitMs > 0) d.fail(refusalWords({ error: 'wait', waitMs: hole.waitMs }));
    d.actions.append(cancel);
    modal.append(other, d.actions);
    (pin ?? modal.querySelector('[data-hole-passkey]'))?.focus();
  }

  /**
   * What a black hole is answered with, put into the open dialog: the PIN's
   * box (and the hint kept with it), the line a refusal is said on, and a
   * button for the passkey where the black hole has one. `run(by)` is what is
   * done with an answer; it resolves to the main process's word.
   * @returns {HTMLInputElement|null} the PIN's box, where there is one
   */
  function answerFields(hole, d, run, { confirm } = {}) {
    let pin = null;
    let yes = null;
    // Its own PIN's length: six, or the four of a black hole made by the first build.
    const digits = hole.digits === 4 ? 4 : PIN_DIGITS;
    if (hole.lock === 'pin') {
      pin = pinField(t('PIN'), digits);
      if (!confirm) {
        pin.addEventListener('input', async () => {
          if (pin.value.length !== digits || !isPin(pin.value, digits)) return;
          const res = await run({ pin: pin.value });
          if (res && !res.ok) { d.fail(refusalWords(res)); pin.value = ''; pin.focus(); }
        });
      }
      modal.append(pin);
      if (hole.hint) {
        const reminder = el('p', 'hole-hint hole-reminder');
        const words = el('span', '', hole.hint);
        words.dataset.noI18n = '';
        reminder.append(`${t('Hint')}: `, words);
        modal.append(reminder);
      }
    }
    modal.append(d.error);
    if (confirm) {
      // A destructive answer is never the typing of a PIN alone, nor a passkey at
      // its own press: ONE button, pressed deliberately, does it — with the whole
      // PIN in the box, or with the passkey the system then asks for. A black hole
      // of the first builds, opened by its passkey alone, has only this button.
      yes = button(confirm, 'btn primary');
      const typed = () => !!pin && isPin(pin.value, digits);
      const byPasskey = () => !typed() && (hole.passkey === true || hole.lock === 'hello');
      const wake = () => { yes.disabled = !typed() && !byPasskey(); };
      wake();
      if (pin) pin.addEventListener('input', wake);
      yes.addEventListener('click', async () => {
        if (!typed() && !byPasskey()) return;
        const hello = !typed();
        yes.disabled = true;
        if (hello) d.fail(t('Waiting for passkey…'));
        const res = await run(hello ? { hello: true } : { pin: pin.value });
        if (res && !res.ok) { d.fail(refusalWords(res, hello ? 'hello' : 'pin')); if (pin) { pin.value = ''; pin.focus(); } wake(); }
        else { wake(); }
      });
    }
    if (hole.passkey && !confirm) {
      const byPasskey = button(t('Use the passkey'), 'btn app-lock__passkey');
      byPasskey.dataset.holePasskey = '';
      byPasskey.addEventListener('click', async () => {
        byPasskey.disabled = true;
        d.fail(t('Waiting for passkey…'));
        const res = await run({ hello: true });
        byPasskey.disabled = false;
        if (res && !res.ok) d.fail(refusalWords(res, 'hello'));
      });
      modal.append(byPasskey);
    }
    if (yes) d.actions.append(yes);
    return pin;
  }

  /**
   * The black hole's answer, asked once more before something is done with it
   * — a note taken out, the black hole deleted: whoever only found the app
   * open does neither. `run(by)` does it with the answer in hand.
   * @returns {Promise<object|null>} the main process's yes, or null when it was given up
   */
  function askAnswer(hole, title, note, run, opts = {}) {
    return new Promise((resolve) => {
      const d = dialog(title);
      let settled = false;
      const settle = (value) => { if (!settled) { settled = true; resolve(value); } };
      onClose = () => settle(null);
      let busy = false;
      modal.append(el('p', 'hole-note', note));
      const pin = answerFields(hole, d, async (by) => {
        if (busy) return null;
        busy = true;
        let res = null;
        try { res = await run(by); } catch { res = null; }
        busy = false;
        if (!res?.ok) return res ?? { error: 'failed' };
        settle(res);
        closeDialog();
        return res;
      }, opts);
      if (hole.waitMs > 0) d.fail(refusalWords({ error: 'wait', waitMs: hole.waitMs }));
      d.actions.append(button(t('Cancel'), 'btn ghost', closeDialog));
      modal.append(d.actions);
      (pin ?? modal.querySelector('[data-hole-passkey]'))?.focus();
    });
  }

  /**
   * A new PIN for an open black hole — after its old answer: the current PIN
   * in the first box, or the passkey for whoever does not know it (the owner,
   * 2026-10-18). One of the first builds, opened by its passkey alone, has no
   * current box: its answer is the passkey.
   */
  function changePinDialog(id) {
    const hole = holeOf(id);
    if (!hole?.open) return;
    const digits = hole.digits === 4 ? 4 : PIN_DIGITS;
    const d = dialog(t(`New PIN for “${hole.name}”`));
    const current = hole.lock === 'pin' ? pinField(t('Current PIN'), digits) : null;
    if (current) current.dataset.pin = 'current';
    const { pins, pin1, pin2 } = newPinFields(t('New PIN'));
    const ok = button(t('Change'), 'btn primary');
    const finish = async (by) => {
      if (!isPin(pin1.value)) { d.fail(t('A PIN is six digits.')); pin1.focus(); return null; }
      if (pin1.value !== pin2.value) { d.fail(t('The two PINs are not the same.')); pin2.value = ''; pin2.focus(); return null; }
      ok.disabled = true;
      if (by.hello) d.fail(t('Waiting for passkey…'));
      const res = await api.changePin(id, pin1.value, by).catch(() => null);
      ok.disabled = false;
      if (res && !res.ok) { d.fail(refusalWords(res, by.hello ? 'hello' : 'pin')); if (current) { current.value = ''; current.focus(); } }
      return res;
    };
    const submit = async () => {
      if (current && !isPin(current.value, digits)) { d.fail(t('The current PIN is needed — or the passkey.')); current.focus(); return; }
      const res = await finish(current ? { pin: current.value } : { hello: true });
      if (res?.ok) { closeDialog(); await refresh(); say('PIN changed'); }
    };
    ok.addEventListener('click', submit);
    for (const input of [current, pin1, pin2].filter(Boolean)) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } });
    const actions = [button(t('Cancel'), 'btn ghost', closeDialog)];
    // For a PIN black hole with a passkey, the passkey answers for whoever
    // does not know the current PIN; a passkey-only one asks for it on Change.
    if (hole.lock === 'pin' && hole.passkey === true) {
      const byPasskey = button(t('Use the passkey'), 'btn ghost');
      byPasskey.addEventListener('click', async () => {
        const res = await finish({ hello: true });
        if (res?.ok) { closeDialog(); await refresh(); say('PIN changed'); }
      });
      actions.push(byPasskey);
    }
    actions.push(ok);
    d.actions.append(...actions);
    if (current && hole.hint) {
      const reminder = el('p', 'hole-hint hole-reminder');
      const words = el('span', '', hole.hint);
      words.dataset.noI18n = '';
      reminder.append(`${t('Hint')}: `, words);
      modal.append(current, reminder);
    } else if (current) modal.append(current);
    modal.append(pins, d.error, d.actions);
    (current ?? pin1).focus();
  }

  /** The hint of an open black hole: set, changed, or taken away by leaving it empty. */
  async function changeHint(id) {
    const hole = holeOf(id);
    if (!hole?.open || hole.lock !== 'pin') return;
    const { askText } = await import('./dialog.js');
    const hint = await askText(t('Hint for the PIN — anyone can read it'), hole.hint ?? '');
    if (hint === null) return;
    const res = await api.setHint(id, hint).catch(() => null);
    if (!res?.ok) { say('That did not work.'); return; }
    await refresh();
    say(hint.trim() ? 'Hint saved' : 'Hint removed');
  }

  /**
   * A new recovery key for an open black hole. The old one stops working at
   * once — a key written down or left with someone is made wrong again — and
   * the new one is shown once, as at creation.
   */
  async function newRecovery(id) {
    const hole = holeOf(id);
    if (!hole?.open) return;
    const d = dialog(t(`New recovery key for “${hole.name}”`));
    const why = el('p', 'hole-note', t('The recovery key that was shown before stops working. Write the new one down and keep it somewhere safe.'));
    const ok = button(t('New key'), 'btn primary', async () => {
      const res = await api.newRecovery(id).catch(() => null);
      if (!res?.ok) { d.fail(refusalWords(res)); return; }
      closeDialog();
      await refresh();
      showRecoveryKey(hole.name, res.recoveryKey);
    });
    d.actions.append(button(t('Cancel'), 'btn ghost', closeDialog), ok);
    modal.append(why, d.error, d.actions);
    ok.focus();
  }

  // ---- locking ---------------------------------------------------------------
  /** Its notes saved, then out of the window's memory; the main process lets go of the key. */
  async function lock(id) {
    const hole = holeOf(id);
    if (!hole?.open) return false;
    try { await saveNow(); } catch { say('Could not save: the black hole stays open'); return false; }
    const wasActive = store.active()?.hole === id;
    const ids = store.dropHole(id);
    forgetNotes(ids);
    try { await api.lock(id); } catch { /* its key goes when the app closes */ }
    hole.open = false;
    if (wasActive) openNote(store.activeId);
    await refresh();
    return true;
  }
  async function lockAll() {
    for (const hole of holes.filter((h) => h.open)) await lock(hole.id);
  }

  for (const name of ['keydown', 'mousedown', 'wheel']) window.addEventListener(name, touched, { capture: true, passive: true });

  // ---- moving notes in and out -------------------------------------------------
  /**
   * Into a black hole: sealed there, and its plain file gone from the vault and
   * every backup. Its video files are sealed first, each beside the note, and
   * the note names the sealed ones; the plain ones go with the note's folder.
   */
  const movingInto = new Map();
  async function moveIn(noteId, holeId) {
    if (movingInto.has(noteId)) return false;
    movingInto.set(noteId, holeId);
    try { return await moveInOnce(noteId, holeId); }
    finally { movingInto.delete(noteId); }
  }
  async function moveInOnce(noteId, holeId) {
    const hole = holeOf(holeId);
    if (!store.get(noteId) || !hole) return false;
    if (!hole.open) { say('Open the black hole first'); return false; }
    if (store.get(noteId).hole) { say('Take it out of its black hole first'); return false; }
    // What is typed is saved first: the note is sealed as it is on the disk.
    try { await saveNow(); } catch { say('Could not save: the note stays where it is'); return false; }
    const note = store.get(noteId);
    if (!note) return false;
    const originalContent = note.content;
    const originalFolder = note.folder;
    let content = String(note.content ?? '');
    const videos = plainVideosOf(content);
    const videoReplacements = [];
    if (videos.some(([, from]) => from !== noteId)) { say('The video could not be sealed'); return false; }
    if (videos.length) say('Sealing the video into the black hole…');
    for (const [address, , file] of videos) {
      const res = await api.importVideo(holeId, noteId, file).catch(() => null);
      // What was sealed so far is nobody's, and goes when the black hole is next opened.
      if (!res?.ok) { say('The video could not be sealed'); return false; }
      videoReplacements.push([res.url, address]);
      content = content.split(address).join(res.url);
    }
    // Its pictures are files in its folder, which goes with its plain file:
    // they are written into the note, and sealed with it.
    if (content.includes('nebula-media://note/') && window.nebula?.media?.inline) {
      content = await window.nebula.media.inline(content).catch(() => content);
    }
    if (content.includes('nebula-media://note/') || store.get(noteId) !== note || note.content !== originalContent || !holeOf(holeId)?.open) {
      say('Could not save: the note stays where it is');
      return false;
    }
    if (content !== note.content) note.content = content;
    say(t('Sealing the note into the black hole…'));
    // Do not draw the note under the hole until the sealed file is committed
    // AND the old plain file and its backups are gone.
    try {
      store.setHole(noteId, holeId, { notify: false });
      await flushNote(noteId);
    } catch {
      // Typing can continue while the disk is sealing. Keep those edits on
      // failure, but turn imported video addresses back to their plain files.
      const current = store.get(noteId);
      if (!current || (current.hole && current.hole !== holeId)) { say('Could not save: the note stays where it is'); return false; }
      let latest = current === note && current.content === content ? originalContent : String(current.content ?? '');
      for (const [sealed, plain] of videoReplacements) latest = latest.split(sealed).join(plain);
      current.content = latest;
      if (originalFolder === undefined) delete current.folder;
      else if (!current.folder) current.folder = originalFolder;
      if (current.hole) store.setHole(noteId, null, { notify: false });
      else store.save([noteId]);
      await flushNote(noteId).catch(() => {});
      say('Could not save: the note stays where it is');
      return false;
    }
    touched();
    if (store.activeId === noteId) openNote(noteId); else onChanged();
    say(t('Note moved into the black hole'));
    return true;
  }
  /**
   * Out of its black hole: a plain note again, its videos files in its own
   * folder. The black hole's answer is asked first — from its menu, or when
   * the note is dragged up among the notes (note-list.js): a sealed note is
   * not made a plain one by whoever only found the black hole open.
   */
  async function moveOut(noteId) {
    const from = holeOf(store.get(noteId)?.hole);
    if (!from) return false;
    const yes = await askAnswer(from, t('Take out of the black hole'),
      t(`The note leaves “${from.name}” and is kept as an ordinary note again, not encrypted.`),
      (by) => api.prove(from.id, by));
    if (!yes) return false;
    try { await saveNow(); } catch { say('Could not save: the note stays where it is'); return false; }
    const note = store.get(noteId);
    if (!note?.hole) return false;
    let content = String(note.content ?? '');
    for (const [address, holeId, owner, file] of sealedVideosOf(content)) {
      if (holeId !== note.hole || owner !== noteId) continue;
      const res = await api.exportVideo(holeId, noteId, file).catch(() => null);
      if (!res?.ok) { say('The video could not be taken out'); return false; }
      content = content.split(address).join(res.url);
    }
    if (content !== note.content) note.content = content;
    store.setHole(noteId, null);
    if (store.activeId === noteId) openNote(noteId); else onChanged();
    return true;
  }

  // ---- menus -------------------------------------------------------------------
  const menu = el('div', 'float-menu folder-menu hole-menu');
  menu.id = 'hole-menu';
  menu.hidden = true;
  document.body.append(menu);
  const closeMenu = () => { menu.hidden = true; menu.replaceChildren(); };
  document.addEventListener('mousedown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest?.('.hole-more')) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); closeMenu(); } }, true);
  function place(anchor) {
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = menu.offsetWidth || 200;
    const h = menu.offsetHeight || 120;
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    menu.style.top = `${r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
    menu.querySelector('button')?.focus();
  }

  async function rename(id) {
    const hole = holeOf(id);
    if (!hole) return;
    const { askText } = await import('./dialog.js');
    const name = await askText(t('Rename black hole'), hole.name);
    if (name === null || !name.trim()) return;
    await api.rename(id, name).catch(() => null);
    await refresh();
  }

  function holeMenu(id, anchor) {
    closeMenu();
    const hole = holeOf(id);
    if (!hole) return;
    if (hole.open) menu.append(button(t('Lock'), '', () => { closeMenu(); void lock(id); }));
    else menu.append(button(t('Open'), '', () => { closeMenu(); unlockDialog(id); }));
    menu.append(button(t('Rename black hole'), '', () => { closeMenu(); void rename(id); }));
    // One of the first builds, opened by a passkey alone, is given its PIN here.
    if (hole.open) menu.append(button(t(hole.lock === 'pin' ? 'Change PIN' : 'Set a PIN'), '', () => { closeMenu(); changePinDialog(id); }));
    if (hole.open && hole.lock === 'pin') menu.append(button(t(hole.hint ? 'Change hint' : 'Add a hint'), '', () => { closeMenu(); void changeHint(id); }));
    // The passkey beside the PIN: added — the system asks at once — or taken away.
    if (hole.open && hole.lock === 'pin' && (hole.passkey || hello)) {
      menu.append(button(t(hole.passkey ? 'Remove the passkey' : 'Add a passkey'), '', () => { closeMenu(); void setPasskey(id, !hole.passkey); }));
    }
    // The recovery key, made new while it is open: the old one dies, the new one is shown once.
    if (hole.open) menu.append(button(t('New recovery key'), '', () => { closeMenu(); void newRecovery(id); }));
    // Not deleted from here: it goes to the Trash, as a note does, and is deleted there.
    menu.append(button(t('Move to trash'), 'fm-delete', () => { closeMenu(); void toTrash(id); }));
    place(anchor);
  }

  async function setPasskey(id, on) {
    if (on) say('Waiting for passkey…');
    const res = await api.passkey(id, on).catch(() => null);
    await refresh();
    say(res?.ok ? (on ? 'Passkey added' : 'Passkey removed') : refusalWords(res, 'hello'));
  }

  // ---- the Trash ---------------------------------------------------------------
  /** Into the Trash, whole: locked first — its notes saved and out of the window — then out of the list. */
  async function toTrash(id) {
    const hole = holeOf(id);
    if (!hole) return false;
    if ([...movingInto.values()].includes(id)) { say(t('Wait for the note to finish moving')); return false; }
    if (hole.open && !(await lock(id))) return false;       // what was typed could not be saved: it stays
    const res = await api.trash(id).catch(() => null);
    await refresh();
    if (!res?.ok) { say('That did not work.'); return false; }
    say('Black hole moved to the trash');
    return true;
  }
  /** Out of the Trash: back in its section, locked. */
  async function restore(id) {
    const res = await api.restore(id).catch(() => null);
    await refresh();
    return !!res?.ok;
  }
  /**
   * Deleted from the Trash: every file of it overwritten and removed, in the
   * backups too — with its answer, asked for here, and not without.
   */
  async function destroy(id) {
    const hole = binned.find((h) => h.id === id) ?? holeOf(id);
    if (!hole) return false;
    const res = await askAnswer(hole, t('Delete the black hole'),
      t(`“${hole.name}” and every note in it are deleted for good. Nothing brings them back.`),
      (by) => api.delete(id, by), { confirm: t('Delete for good?') });
    await refresh();
    if (res?.ok) say('Black hole deleted');
    return !!res?.ok;
  }

  /** A note's ⋯ → the black holes it can go into, or out of the one it is in. */
  function noteHoleMenu(noteId, anchor) {
    closeMenu();
    const note = store.get(noteId);
    if (!note || !anchor) return;
    if (note.hole) menu.append(button(t('Take out of the black hole'), '', () => { closeMenu(); void moveOut(noteId); }));
    for (const hole of holes) {
      if (hole.id === note.hole) continue;
      const b = button('', '', () => { closeMenu(); void moveIn(noteId, hole.id); });
      b.innerHTML = '<span class="fm-ic"><span class="hole-disc"></span></span><span data-no-i18n></span>';
      b.lastChild.textContent = hole.name;
      if (!hole.open) b.classList.add('is-locked');
      menu.append(b);
    }
    if (!menu.children.length) return;
    place(anchor);
  }

  /** What a note's menu says for it: null when there is nothing to offer. */
  function noteMenuLabel(note) {
    if (!note || away) return null;
    // In a black hole the way out is to the notes — the words say where it
    // goes, not what it is in (the owner, 2026-10-18).
    if (note.hole) return 'Move to notes';
    return holes.length ? 'Move into a black hole' : null;
  }

  // ---- drawing -----------------------------------------------------------------
  function holeBlock(hole) {
    const block = el('div', `folder-block hole-block${hole.open ? ' open' : ''}`);
    block.dataset.hole = hole.id;
    const head = el('div', 'note-item folder-item hole-item');
    const row = button('', 'folder-row hole-row');
    row.setAttribute('aria-expanded', String(hole.open));
    row.title = hole.name;
    row.dataset.initial = hole.name.trim().charAt(0).toUpperCase() || 'B';
    row.innerHTML = '<span class="hole-disc" aria-hidden="true"></span><span class="fr-name" data-no-i18n></span>';
    row.querySelector('.fr-name').textContent = hole.name;
    const inside = hole.open ? store.inHole(hole.id) : [];
    row.addEventListener('click', () => { if (!hole.open) unlockDialog(hole.id); });
    // The lock stands at the left, before the name: shut on a locked one (a
    // click opens it), open on an open one (a click locks it).
    const lockBtn = button('', 'hole-lock', (e) => { e.stopPropagation(); if (hole.open) void lock(hole.id); else unlockDialog(hole.id); });
    lockBtn.innerHTML = icon(hole.open ? 'unlock' : 'lock', 'ic');
    lockBtn.title = hole.open ? 'Lock this black hole' : 'Open this black hole';
    lockBtn.setAttribute('aria-label', lockBtn.title);
    lockBtn.dataset.state = hole.open ? 'open' : 'locked';
    const more = button('⋯', 'nr-more fr-more hole-more');
    more.title = 'Black hole actions';
    more.setAttribute('aria-label', 'Black hole actions');
    more.addEventListener('click', (e) => { e.stopPropagation(); holeMenu(hole.id, more); });
    head.append(lockBtn, row, more);
    block.append(head);
    if (hole.open) {
      const body = el('div', 'folder-notes hole-notes');
      body.setAttribute('role', 'group');
      body.setAttribute('aria-label', hole.name);
      body.append(button(`+ ${t('Add a note')}`, 'folder-add hole-add', () => newNote(hole.id)));
      if (!inside.length) body.append(el('div', 'folder-empty', t('Drag notes here')));
      for (const note of inside) {
        // A note of it can be dragged up among the notes (note-list.js), which takes it out.
        const item = noteItem(note);
        const noteRow = item.querySelector('.note-row');
        if (noteRow) noteRow.draggable = true;
        body.append(item);
      }
      block.append(body);
    }
    // A note dragged from the list and let go on an open black hole goes into it.
    block.addEventListener('dragover', (e) => {
      if (![...(e.dataTransfer?.types || [])].includes('application/x-nebula-item')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = hole.open ? 'move' : 'none';
      block.classList.toggle('drop-into', hole.open);
    });
    block.addEventListener('dragleave', (e) => { if (!block.contains(e.relatedTarget)) block.classList.remove('drop-into'); });
    block.addEventListener('drop', (e) => {
      const what = e.dataTransfer?.getData('application/x-nebula-item') || '';
      if (!what) return;
      e.preventDefault();
      e.stopPropagation();
      block.classList.remove('drop-into');
      // Let go on the black hole it is in already: nothing to do.
      if (what.startsWith('note:') && store.get(what.slice(5))?.hole !== hole.id) void moveIn(what.slice(5), hole.id);
    });
    block.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.note-item[data-id]')) return;     // a note's own menu
      e.preventDefault();
      e.stopPropagation();
      holeMenu(hole.id, { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) });
    });
    return block;
  }

  /** Drawn at the end of the list, when nothing filters it. @returns {number} rows drawn */
  function render() {
    listEl.querySelector(':scope > .holes')?.remove();
    if (away || !holes.length) return 0;
    let folded = false;
    try { folded = localStorage.getItem(FOLDED_KEY) === '1'; } catch { /* drawn open */ }
    const section = el('div', `holes${folded ? ' folded' : ''}`);
    // The arrow beside the heading folds the whole section away, and brings it back.
    const head = button('', 'holes-head', () => {
      try { localStorage.setItem(FOLDED_KEY, folded ? '0' : '1'); } catch { /* it folds until the list is drawn again */ }
      onChanged();
    });
    head.innerHTML = '<span class="fr-caret" aria-hidden="true"></span><span class="holes-title"></span>';
    head.querySelector('.holes-title').textContent = t('Black holes');
    head.setAttribute('aria-expanded', String(!folded));
    head.title = folded ? 'Show the black holes' : 'Hide the black holes';
    section.append(head);
    if (!folded) for (const hole of holes) section.append(holeBlock(hole));
    listEl.append(section);
    return folded ? 0 : holes.length;
  }

  addButton?.addEventListener('click', createDialog);

  // Settings → Hide the black holes: the open ones are locked first — a note
  // of one must not stay in the list with its section gone — then they leave.
  on('settings-changed', ({ settings } = {}) => {
    const hide = !!settings?.hideHoles;
    if (hide === away) return;
    void (async () => {
      if (hide) await lockAll();
      // What could not be saved keeps its black hole open, and so in sight.
      away = hide && !holes.some((h) => h.open);
      if (addButton) addButton.hidden = away;
      closeMenu();
      onChanged();
    })();
  });

  // Every black hole is locked when the app starts: a page loaded again holds no notes of one.
  void Promise.resolve(api.lockAll()).catch(() => {}).then(refresh);

  return { render, refresh, lock, lockAll, holeMenu, noteHoleMenu, noteMenuLabel, moveIn, moveOut, list: () => holes, create: createDialog, unlock: unlockDialog, toTrash, restore, destroy, trashed: () => (away ? [] : binned) };
}
