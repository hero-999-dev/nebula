/**
 * The lock on opening the app, in the window (0.9.4).
 *
 * The owner's Ideas note: "a PIN or a passkey when the app is opened — as a
 * black hole has"; and on its first build: "the 6-digit PIN is the lock,
 * always; a passkey is added if wanted, and whoever opens the app uses the one
 * they like. Turn the lock off must not delete it — that is Remove lock. And
 * the passkey must not come up by itself when the app is locked: the person
 * presses to log in with it."
 *
 * The lock is the main process's (electron/app-lock.js): it keeps what a right
 * answer hashes to, and hands the window no note while it is shut. This is the
 * two places it is met:
 *
 *   – the gate, before anything else is started: a screen over the whole
 *     window with the PIN's box and, where a passkey was added, a button to
 *     log in with it. Nothing is asked of the system until that button is
 *     pressed, and nothing of a note is in the window before the answer.
 *   – its part of the Settings sheet (settings-panel.js): set it, turn it off
 *     and on again, add or take away the passkey, remove it, shut the app now.
 *
 * The dialogs are the black holes' own (black-holes.js): the same PIN boxes,
 * the same words for a wrong try and a wait, the same recovery key shown once.
 */

import { t } from './i18n.js';
import { icon } from './icons.js';
import { el, button, pinField, isPin, newPinFields, refusalWords } from './black-holes.js';

const api = () => window.nebula?.lock ?? null;
const say = (text) => window.dispatchEvent(new CustomEvent('nebula-toast', { detail: text }));

/**
 * What the main process last said of the lock: whether one is set, whether it
 * is on, what opens it (the PIN — always, but for a passkey-only lock of the
 * first test build — and the passkey, where one was added), and whether this
 * computer has a passkey at all (`hello`: told only to Settings, which asks
 * for it; what was heard before stays).
 */
let known = { set: false, on: false, pin: false, passkey: false, hello: false };
const learn = (state) => {
  if (state?.ok) known = { set: !!state.set, on: !!state.on, pin: !!state.pin, passkey: !!state.passkey, hello: 'hello' in state ? !!state.hello : known.hello };
  return state;
};

/** Whether the app's lock is on — as last heard; the menus ask without waiting. */
export const appLockIsOn = () => known.set && known.on;

/**
 * Before the app starts: where a lock is on, ask, and come back only when it
 * has been answered. Where none is, or outside the desktop app, at once.
 * @returns {Promise<{asked: boolean, cleared?: boolean}>} `cleared`: opened by the recovery key, which removed the lock
 */
export async function appLockGate() {
  const lock = api();
  if (!lock) return { asked: false };
  let state = null;
  try { state = learn(await lock.state()); } catch { state = null; }
  if (!state?.locked) return { asked: false };

  // Nothing under the screen takes a key or a click while it stands.
  const app = document.getElementById('app');
  if (app) app.inert = true;
  const screen = el('div', 'app-lock');
  screen.id = 'app-lock';
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-label', t('Nebula is locked'));
  const card = el('div', 'modal hole-modal app-lock__card');
  screen.append(card);
  document.body.append(screen);

  return new Promise((resolve) => {
    const done = (res) => {
      screen.remove();
      if (app) app.inert = false;
      if (res.cleared) known = { ...known, set: false, on: false, pin: false, passkey: false };
      resolve({ asked: true, cleared: !!res.cleared });
    };
    let busy = false;
    const answer = async (by) => {
      if (busy) return null;
      busy = true;
      let res = null;
      try { res = await lock.unlock(by); } catch { res = null; }
      busy = false;
      if (res?.ok) { done(res); return res; }
      return res ?? { error: 'failed' };
    };

    function show({ recovery = false } = {}) {
      const mark = el('div', 'app-lock__mark');
      mark.innerHTML = icon('lock', 'ic');
      const error = el('p', 'hole-error');
      error.setAttribute('role', 'alert');
      const fail = (text) => { error.textContent = text; };
      const actions = el('div', 'dlg-actions');
      const quit = button(t('Quit Nebula'), 'btn ghost', () => window.nebula?.quit?.());
      card.replaceChildren(mark, el('p', 'dlg-title', t('Nebula is locked')));

      if (recovery) {
        const why = el('p', 'hole-note', t('Type the recovery key that was shown when the lock was set. It opens Nebula and removes the lock — set a new one in Settings.'));
        const key = el('input', 'hole-recovery');
        key.type = 'text';
        key.autocomplete = 'off';
        key.spellcheck = false;
        key.placeholder = 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX';
        key.setAttribute('aria-label', t('Recovery key'));
        const open = button(t('Open'), 'btn primary');
        const submit = async () => {
          const res = await answer({ recovery: key.value });
          if (res && !res.ok) fail(res.error === 'wrong' || res.error === 'wait' ? refusalWords(res) : t('That key does not open Nebula.'));
        };
        open.addEventListener('click', submit);
        key.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } });
        actions.append(button(t('Back'), 'btn ghost', () => show()), open);
        card.append(why, key, error, actions);
        key.focus();
        return;
      }

      // The PIN: the last digit opens it, nothing else to press.
      let pin = null;
      if (state.pin) {
        const digits = state.digits || 6;
        pin = pinField(t('PIN'), digits);
        const submit = async () => {
          if (!isPin(pin.value, digits)) return;
          const res = await answer({ pin: pin.value });
          if (res && !res.ok) { fail(refusalWords(res)); pin.value = ''; pin.focus(); }
        };
        pin.addEventListener('input', () => { if (pin.value.length === digits) void submit(); });
        card.append(pin);
        if (state.hint) {
          const reminder = el('p', 'hole-hint hole-reminder');
          const words = el('span', '', state.hint);
          words.dataset.noI18n = '';
          reminder.append(`${t('Hint')}: `, words);
          card.append(reminder);
        }
      }
      if (state.waitMs > 0) fail(refusalWords({ error: 'wait', waitMs: state.waitMs }));
      card.append(error);
      // The passkey, where one was added: asked of the system only when this is pressed.
      if (state.passkey) {
        const byPasskey = button(t('Log in with passkey'), 'btn app-lock__passkey');
        byPasskey.dataset.lock = 'passkey';
        byPasskey.addEventListener('click', async () => {
          byPasskey.disabled = true;
          fail(t('Waiting for passkey…'));
          const res = await answer({ hello: true });
          byPasskey.disabled = false;
          if (res && !res.ok) { fail(refusalWords(res, 'hello')); pin?.focus(); }
        });
        card.append(byPasskey);
      }
      actions.append(quit);
      card.append(button(t('Use the recovery key'), 'hole-link', () => show({ recovery: true })), actions);
      (pin ?? card.querySelector('.app-lock__passkey'))?.focus();
    }
    show();
  });
}

/**
 * The lock's part of the Settings sheet.
 * @param {object} deps
 * @param {HTMLElement} deps.host where it is drawn
 * @param {() => Promise<void>} deps.saveNow everything typed, on the disk — before the app is shut
 * @returns {{refresh: () => Promise<void>, lockNow: () => Promise<boolean>}|null}
 */
export function initAppLockSettings({ host, saveNow }) {
  const lock = api();
  if (!lock || !host) {
    host?.replaceChildren(el('p', 'set-hint', 'The lock needs the desktop app.'));
    return null;
  }

  // ---- its dialogs, over the Settings sheet ----------------------------------
  const overlay = el('div', 'overlay hole-overlay');
  overlay.id = 'ov-app-lock';
  overlay.hidden = true;
  const modal = el('div', 'modal hole-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  overlay.append(modal);
  document.body.append(overlay);
  function closeDialog() {
    overlay.hidden = true;
    modal.replaceChildren();
  }
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && !overlay.dataset.keep) closeDialog(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || overlay.hidden) return;
    // The sheet under it stays: this Escape is the dialog's alone.
    e.preventDefault();
    e.stopPropagation();
    if (!overlay.dataset.keep) closeDialog();
  }, true);
  function dialog(title, { keep = false } = {}) {
    modal.replaceChildren(el('p', 'dlg-title', title));
    if (keep) overlay.dataset.keep = '1'; else delete overlay.dataset.keep;
    overlay.hidden = false;
    const error = el('p', 'hole-error');
    error.setAttribute('role', 'alert');
    return { error, actions: el('div', 'dlg-actions'), fail: (text) => { error.textContent = text; } };
  }

  /** The recovery key, shown once. */
  function showRecoveryKey(key) {
    const d = dialog(t('Recovery key'), { keep: true });
    const why = el('p', 'hole-note', t('Write this key down and keep it somewhere safe. It opens Nebula when the PIN is forgotten. It is shown only now.'));
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

  /** Set a lock: the PIN, twice; a hint if wanted; and whether a passkey opens the app too. */
  function setDialog() {
    const d = dialog(t('Lock Nebula'));
    const what = el('p', 'hole-note', t('A 6-digit PIN locks Nebula: it is asked for each time the app opens.'));
    const { pins, pin1, pin2 } = newPinFields(t('PIN'));
    const hint = el('input', 'hole-hint-field');
    hint.type = 'text';
    hint.maxLength = 80;
    hint.autocomplete = 'off';
    hint.placeholder = t('Hint (optional)');
    hint.setAttribute('aria-label', t('Hint (optional)'));
    pins.append(hint, el('p', 'hole-hint', t('Shown when the PIN is asked for. Anyone can read it: a reminder, not the PIN.')));
    // The passkey is an addition, never the lock itself: with it, either opens the app.
    const also = el('label', 'set-check app-lock__also');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'app-lock-passkey';
    also.append(box, el('span', '', t('Also open with a passkey')));
    const offer = () => {
      box.disabled = !known.hello;
      also.title = known.hello ? '' : t('No passkey is set up on this computer.');
      also.classList.toggle('off', !known.hello);
    };
    offer();
    // Whether there is one may not be known yet when the dialog opens: it is asked for, and the box follows.
    if (!known.hello) void lock.state({ hello: true }).then(learn).then(offer).catch(() => {});
    const ok = button(t('Set the lock'), 'btn primary');
    let busy = false;
    const submit = async () => {
      if (busy) return;
      if (!isPin(pin1.value)) { d.fail(t('A PIN is six digits.')); pin1.focus(); return; }
      if (pin1.value !== pin2.value) { d.fail(t('The two PINs are not the same.')); pin2.value = ''; pin2.focus(); return; }
      busy = true;
      ok.disabled = true;
      d.fail(box.checked ? t('Waiting for passkey…') : '');
      const res = await lock.set({ pin: pin1.value, hint: hint.value, passkey: box.checked }).catch(() => null);
      busy = false;
      ok.disabled = false;
      if (!res?.ok) { d.fail(refusalWords(res, box.checked ? 'hello' : 'pin')); return; }
      await refresh();
      showRecoveryKey(res.recoveryKey);
    };
    ok.addEventListener('click', submit);
    for (const input of [pin1, pin2, hint]) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } });
    d.actions.append(button(t('Cancel'), 'btn ghost', closeDialog), ok);
    modal.append(what, pins, also, d.error, d.actions);
    pin1.focus();
  }

  /**
   * Whoever changes the lock answers it first: the PIN — its last digit is the
   * answer — or, where one was added and `passkey` allows, the passkey at a
   * press. `run(by)` is what is done with the answer; its refusal is said here.
   */
  function answerDialog(title, note, run, { passkey = true } = {}) {
    const d = dialog(title);
    let busy = false;
    const go = async (by, lockKind) => {
      if (busy) return null;
      busy = true;
      const res = await run(by).catch(() => null);
      busy = false;
      if (res?.ok) { closeDialog(); await refresh(); return res; }
      d.fail(refusalWords(res, lockKind));
      return res ?? { error: 'failed' };
    };
    modal.append(el('p', 'hole-note', note));
    let pin = null;
    if (known.pin) {
      pin = pinField(t('PIN'));
      pin.addEventListener('input', async () => {
        if (pin.value.length !== 6) return;
        const res = await go({ pin: pin.value }, 'pin');
        if (res && !res.ok) { pin.value = ''; pin.focus(); }
      });
      modal.append(pin);
    }
    modal.append(d.error);
    if (passkey && known.passkey) {
      const byPasskey = button(t('Use the passkey'), 'btn app-lock__passkey');
      byPasskey.dataset.lock = 'passkey';
      byPasskey.addEventListener('click', async () => {
        byPasskey.disabled = true;
        d.fail(t('Waiting for passkey…'));
        await go({ hello: true }, 'hello');
        byPasskey.disabled = false;
      });
      modal.append(byPasskey);
    }
    d.actions.append(button(t('Cancel'), 'btn ghost', closeDialog));
    modal.append(d.actions);
    (pin ?? modal.querySelector('.app-lock__passkey'))?.focus();
  }

  /** Shut now: what is typed goes to the disk first, then the window is loaded again and asks. */
  async function lockNow() {
    if (!appLockIsOn()) return false;
    try { await saveNow(); } catch { say('Could not save: Nebula stays open'); return false; }
    const res = await lock.now().catch(() => null);
    return !!res?.ok;
  }

  // ---- its rows in the sheet ---------------------------------------------------
  const line = el('p', 'set-state');
  const note = el('p', 'set-hint');
  const row = el('div', 'set-buttons');
  const message = el('p', 'set-hint set-status');
  message.setAttribute('role', 'status');
  host.replaceChildren(line, row, message, note);
  function status(text, bad = false) {
    message.textContent = text;
    message.classList.toggle('bad', bad);
  }
  const act = (name, label, run) => {
    const b = button(t(label), 'btn', run);
    b.dataset.lock = name;
    row.append(b);
    return b;
  };

  function paint() {
    status('');
    row.replaceChildren();
    note.textContent = t('The lock keeps the app shut on this computer. It does not encrypt the notes’ files — a black hole does that.');
    if (!known.set) {
      line.textContent = t('Nebula opens without asking.');
      act('set', 'Set a lock', setDialog);
      return;
    }
    if (!known.on) {
      // Turned off: the lock is kept, the asking is not.
      line.textContent = t('The lock is turned off: Nebula opens without asking. Its PIN is kept.');
      act('on', 'Turn the lock on', async () => {
        const res = await lock.turn(true).catch(() => null);
        await refresh();
        if (res?.ok) say('The lock is on'); else status(refusalWords(res), true);
      });
    } else {
      line.textContent = !known.pin ? t('Nebula asks for your passkey when it opens.')
        : known.passkey ? t('Nebula asks for its PIN — or your passkey — when it opens.')
          : t('Nebula asks for its PIN when it opens.');
      act('now', 'Lock Nebula now', () => { void lockNow(); });
      act('off', 'Turn the lock off', () => answerDialog(t('Turn the lock off'),
        t('Nebula will open without asking. The lock is kept, to be turned on again.'),
        async (by) => { const res = await lock.turn(false, by); if (res?.ok) say('The lock is off'); return res; }));
    }
    // The passkey beside the PIN: added by whoever knows the PIN, taken away at a press.
    if (known.pin && known.passkey) {
      act('passkey-off', 'Remove the passkey', async () => {
        const res = await lock.passkey(false).catch(() => null);
        await refresh();
        if (res?.ok) say('Passkey removed'); else status(refusalWords(res), true);
      });
    } else if (known.pin) {
      const add = act('passkey-on', 'Add a passkey', () => answerDialog(t('Add a passkey'),
        t('Type the PIN, then confirm with the passkey. After that, either one opens Nebula.'),
        async (by) => { const res = await lock.passkey(true, by); if (res?.ok) say('Passkey added'); return res; }, { passkey: false }));
      if (!known.hello) { add.disabled = true; add.title = t('No passkey is set up on this computer.'); }
    }
    act('remove', 'Remove lock', () => answerDialog(t('Remove lock'),
      t('The lock is deleted: its PIN, its passkey and its recovery key are forgotten.'),
      async (by) => { const res = await lock.clear(by); if (res?.ok) say('Lock removed'); return res; }));
  }

  async function refresh() {
    // At once as far as it is known; then with whether there is a passkey here, which may take a moment to find out.
    try { learn(await lock.state()); } catch { /* as it was */ }
    paint();
    try { learn(await lock.state({ hello: true })); } catch { return; }
    paint();
  }
  paint();

  return { refresh, lockNow };
}
