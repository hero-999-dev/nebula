/**
 * The Tools sheet (1.0.3): Tools, beside Settings — what Nebula does with
 * other apps. The first is Tailscale: your devices, one vault each, kept
 * alike over the tailnet (electron/sync.js). Settings is Nebula itself; Tools
 * is where it meets something else.
 *
 * Pairing is one code for the whole group: made on one device, typed on each
 * of the others. It is kept wrapped by the system, like the key it makes, so
 * any paired device can show it again for the next one (the owner,
 * 2026-11-04: "telefonumu da bağlayacağım… iki bilgisayara göre olmamalı").
 * Each device on the list says whether it answers: Tailscale up, the same
 * Nebula, the same code.
 */
import { t } from './i18n.js';
import { askConfirm } from './dialog.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (text, cls = 'btn') => {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
};

/** Setting Tailscale sync up, in the order it is done — for two devices or ten. */
export const TAILSCALE_STEPS = [
  'Install Tailscale on every device you want to sync (tailscale.com/download) and sign in to the same Tailscale account on all of them.',
  'Find each device’s Tailscale name or its 100.x.y.z address: the Tailscale icon by the clock, then this device. This sheet shows this computer’s address at the top.',
  'Open the same version of Nebula on each and tick “Sync with your other devices”.',
  'On one device press “Make a code”. On each of the others, type that code under “Enter a code” and press Pair. All your devices share this one code.',
  'Under “Your other devices”, add each of the others by name or address — on every device. With three, each one lists the other two.',
  'Press Sync now. Each device on the list says whether it is connected. From then on Nebula syncs when it opens and when it closes, and whenever you press it again.',
];
/** One more device later: a third computer, or a phone when Nebula comes to phones. */
export const TAILSCALE_ADD = 'One more device later — a third computer, or a phone once Nebula comes to phones: install Tailscale on it with the same account and the same Nebula. On a paired device press “Show the code” and enter it on the new one. Then add the new one to the list on each device, and the others to its list.';
export const TAILSCALE_REMOVE = 'A device lost or given away: take it off every list, then make a new code on one device and enter it on each one you keep. The old code then opens nothing.';
export const TAILSCALE_TROUBLE = 'If a device does not answer: Tailscale must be connected and Nebula open on it. If Windows asks whether Nebula may use the network, allow it.';

/**
 * Which of two versions is older: below 0 when `a` is, above 0 when `b` is, 0
 * when they are the same. Two computers sync only on the same one (the owner,
 * 2026-11-04: "sürüm güncellemeden sync olmasın, bir tanesi gerideyse önce
 * güncelleyin desin"). Pure — tested.
 */
export function compareVersions(a, b) {
  const parts = (v) => String(v ?? '').split(/[.+-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** What went wrong, said plainly. */
export function syncError(code, theirs, mine) {
  switch (code) {
    case 'locked': return t('Nebula is locked.');
    case 'off': return t('Sync is off.');
    case 'no-peer': return t('No other device is on the list.');
    case 'unreachable': return t('The other computer did not answer. Is it on, with Tailscale and Nebula running?');
    case 'outside': return t('That name does not lead into your tailnet.');
    case 'unpaired': return t('The other computer is paired with another code.');
    case 'peer-locked': return t('Nebula is locked on the other computer.');
    case 'peer-off': return t('Sync is off on the other computer.');
    case 'peer-starting': return t('Nebula is still opening on the other computer.');
    case 'version': {
      // Which one is behind, and that it is to be updated before they sync (the owner, 2026-11-04).
      const order = theirs && mine ? compareVersions(theirs, mine) : 0;
      if (!order) return t('Both computers need the same version of Nebula.') + (theirs ? ` (${theirs})` : '');
      const words = order < 0
        ? t('The other computer has an older Nebula ({theirs}; this one has {mine}). Update Nebula there first, then sync.')
        : t('This computer has an older Nebula ({mine}; the other has {theirs}). Update Nebula here first, then sync.');
      return words.replace('{theirs}', theirs).replace('{mine}', mine);
    }
    case 'protocol': return t('Both computers need the same version of Nebula.');
    case 'self': return t('That is this computer.');
    case 'twice': return t('That device is already on the list under another name.');
    case 'too-many': return t('That is as many devices as one Nebula syncs with.');
    case 'no-code': return t('This device was paired before codes were kept: make a new code here and enter it on each of the others.');
    case 'starting': return t('Nebula is still opening.');
    case 'protect': return t('This computer cannot keep the pairing safe.');
    case 'code': return t('That code is not right: 24 letters and numbers.');
    case 'peer': return t('Type a Tailscale address or name.');
    default: return t('Sync failed.');
  }
}

const when = (at, now = Date.now()) => {
  const mins = Math.max(0, Math.round((now - at) / 60_000));
  return mins < 1 ? t('just now') : mins < 60 ? t(`${mins} min ago`) : new Date(at).toLocaleString();
};

/** What one device on the list said, in a few words: connected, else why not. Pure — tested. */
export function deviceLine(device, now = Date.now()) {
  const reach = device?.reach;
  const seen = device?.seen;
  const synced = seen && !seen.error ? ` · ${t('synced')} ${when(seen.at, now)}` : '';
  if (reach?.ok) return { ok: true, text: `${t('Connected')} · Nebula ${reach.version}${synced}` };
  const code = reach?.error ?? seen?.error;
  if (!code) return { ok: null, text: seen ? `${t('Synced')} ${when(seen.at, now)}` : t('Not checked yet') };
  const short = {
    unreachable: t('Not answering: is it on, with Tailscale and Nebula open?'),
    unpaired: t('Paired with another code'),
    'peer-locked': t('Nebula is locked there'),
    'peer-off': t('Sync is off there'),
    'peer-starting': t('Nebula is still opening there'),
  }[code];
  return { ok: false, text: short ?? syncError(code, (reach ?? seen)?.theirs, (reach ?? seen)?.mine) };
}

/** A device this one has reached or synced with — taking it away then asks first (the owner, 2026-11-05). */
export function isConnected(device) {
  return !!(device?.reach?.ok || (device?.seen && !device.seen.error));
}

/** What one sync did, as its parts: taken, kept side by side, let go, next time, not reached. */
function resultParts(last, away) {
  const parts = [t(`${last.took ?? 0} taken`)];
  if (last.copies) parts.push(t(`${last.copies} kept side by side`));
  if (last.dropped) parts.push(t(`${last.dropped} let go`));
  if (last.skipped) parts.push(t(`${last.skipped} next time`));
  if (away) parts.push(t(`${away} not reached`));
  return parts;
}

/** The last sync, in one line. */
export function lastLine(last, now = Date.now()) {
  if (!last) return t('Not synced yet.');
  const at = when(last.at, now);
  if (last.error) return `${at}: ${syncError(last.error, last.theirs, last.mine)}`;
  return `${at}: ${resultParts(last, (last.devices ?? []).filter((d) => d.error).length).join(', ')}`;
}

const mb = (n) => (Math.max(0, Number(n) || 0) / 1048576).toFixed(1);

/**
 * The sync card at the bottom right (the owner, 2026-11-05: "sağ altta bir progress bar olarak"):
 * one progress message from the main process as a head, a line under it, and how full
 * the bar is (null: still finding out). `end` says it is over. Pure — tested.
 */
export function syncCardLine(p = {}) {
  const device = String(p.device ?? '');
  const syncing = device ? `${t('Syncing with')} ${device}…` : t('Syncing…');
  switch (p.phase) {
    case 'looking': return { head: syncing, line: t('Looking at what changed'), share: null, end: false };
    case 'notes': return { head: syncing, line: t(`note ${Math.min(p.total, (p.done ?? 0) + 1)} of ${p.total}`), share: p.total > 0 ? p.done / p.total : null, end: false };
    case 'apply': return { head: syncing, line: t('Putting the notes in place'), share: 1, end: false };
    case 'files': {
      const left = Math.max(0, (p.left ?? 1) - 1);
      return {
        head: String(p.name ?? t('Syncing…')),
        line: t(`${mb(p.got)} of ${mb(p.size)} MB`) + (left ? ` · ${t(`${left} files still coming`)}` : ''),
        share: p.size > 0 ? Math.min(1, p.got / p.size) : null,
        end: false,
      };
    }
    case 'others': return { head: t('Synced'), line: t('Asking the other devices to sync too'), share: null, end: false };
    case 'others-done': return p.told
      ? { head: t('Synced on all your devices'), line: p.told < p.devices ? t(`${p.devices - p.told} not reached`) : '', share: 1, end: true }
      : { head: t('Synced here'), line: t('The other devices did not sync back yet: they will when they open or press Sync now.'), share: 1, end: true };
    case 'done': {
      if (p.error) return { head: t('Sync failed.'), line: syncError(p.error, p.theirs, p.mine), share: null, end: true, failed: true };
      const quiet = !p.took && !p.copies && !p.dropped && !p.skipped;
      const line = quiet ? t('Already up to date') : resultParts(p, p.away).join(', ');
      return { head: t('Synced'), line: quiet && p.away ? `${line} · ${t(`${p.away} not reached`)}` : line, share: 1, end: true };
    }
    default: return null;
  }
}

/**
 * @param {object} deps
 * @param {HTMLElement} deps.overlay
 * @param {HTMLElement} deps.body
 * @param {HTMLElement} [deps.closeButton]
 */
export function initToolsPanel({ overlay, body, closeButton }) {
  const api = window.nebula?.sync;

  const group = (title) => {
    const section = el('section', 'set-group');
    section.append(el('h3', 'set-head', title));
    body.append(section);
    return section;
  };
  const hint = (section, text) => { const p = el('p', 'set-hint', text); section.append(p); return p; };
  const check = (section, label) => {
    const line = el('label', 'set-check');
    const box = document.createElement('input');
    box.type = 'checkbox';
    line.append(box, el('span', '', label));
    section.append(line);
    return box;
  };

  // ── Tailscale ─────────────────────────────────────────────────────────────
  const ts = group(t('Tailscale sync'));
  hint(ts, t('Your devices, one vault each, kept alike over your tailnet. Nothing goes through anyone’s server.'));
  // The way there, step by step (the owner, 2026-11-04: "a guide for the
  // Tailscale connection in Tools"), for any number of devices. Open until paired.
  const guide = el('details', 'tool-guide');
  guide.id = 'tool-guide';
  guide.append(el('summary', null, t('How to set it up')));
  const steps = el('ol', 'tool-steps');
  for (const step of TAILSCALE_STEPS) steps.append(el('li', null, t(step)));
  guide.append(steps);
  for (const more of [TAILSCALE_ADD, TAILSCALE_REMOVE, TAILSCALE_TROUBLE]) guide.append(el('p', 'set-hint', t(more)));
  ts.append(guide);
  const status = el('p', 'tool-status');
  status.id = 'tool-status';
  status.setAttribute('data-no-i18n', '');
  ts.append(status);
  const enabled = check(ts, t('Sync with your other devices'));

  // The other devices, each saying whether it answers.
  ts.append(el('h4', 'tool-sub', t('Your other devices')));
  const list = el('ul', 'tool-devices');
  list.id = 'tool-devices';
  ts.append(list);
  const addLine = el('label', 'set-row');
  const peer = el('input', 'set-input');
  peer.type = 'text';
  peer.spellcheck = false;
  peer.placeholder = t('laptop, phone or 100.x.y.z');
  peer.setAttribute('data-no-i18n', '');
  const peerAdd = button(t('Add'));
  addLine.append(el('span', 'set-label', t('Add a device')), peer, peerAdd);
  ts.append(addLine);

  const pair = el('div', 'tool-pair');
  ts.append(pair);
  const openSync = check(ts, t('Sync when Nebula opens'));
  const actions = el('div', 'tool-actions');
  const now = button(t('Sync now'), 'btn primary');
  const recheck = button(t('Check again'), 'btn ghost');
  actions.append(now, recheck);
  ts.append(actions);
  const last = el('p', 'set-hint tool-last');
  last.setAttribute('data-no-i18n', '');
  ts.append(last);
  const message = el('p', 'tool-message');
  message.setAttribute('role', 'alert');
  message.setAttribute('data-no-i18n', '');
  ts.append(message);
  hint(ts, t('Black holes stay on their own device. All devices need the same version of Nebula. When two changed a note, the newer stays and the other is kept beside it, its title dated. Big videos come after the notes, in the background.'));

  // ── what comes next ───────────────────────────────────────────────────────
  const more = group(t('More connections'));
  hint(more, t('Other apps will be connected here.'));

  let state = null;
  let code = null;      // shown until the sheet closes
  let checking = false;
  const say = (text) => { message.textContent = text ?? ''; };

  function paintPair() {
    pair.replaceChildren();
    if (state?.paired) {
      const line = el('div', 'tool-row');
      line.append(el('span', 'tool-paired', t('Paired')));
      // The group's code again, for the next device (a third computer, a phone).
      // Shown, it hides again with the same button (the owner, 2026-11-05).
      const show = button(code ? t('Hide the code') : t('Show the code'), 'btn ghost');
      show.id = 'tool-show-code';
      show.addEventListener('click', async () => {
        if (code) { code = null; paintPair(); return; }
        const r = await run(() => api.showCode());
        if (r?.ok) { code = r.code; paintPair(); }
      });
      const unpair = button(t('Unpair'), 'btn ghost');
      unpair.addEventListener('click', async () => {
        if ((state?.devices ?? []).some(isConnected)
          && !await askConfirm(t('Unpair this device? It stops syncing with your other devices until a code is entered again.'), 'Unpair')) return;
        code = null;
        await run(() => api.unpair());
      });
      line.append(show, unpair);
      pair.append(line);
      if (code) {
        const shown = el('div', 'tool-row');
        const value = el('code', 'tool-code', code);
        value.setAttribute('data-no-i18n', '');
        const copy = button(t('Copy'), 'btn ghost');
        copy.addEventListener('click', () => { void navigator.clipboard?.writeText(code); copy.textContent = t('Copied'); });
        shown.append(value, copy);
        pair.append(shown, el('p', 'set-hint', t('Type this code on each of your other devices: Tools → Tailscale → Enter a code. Keep it to yourself: it lets a device into your notes.')));
      }
      return;
    }
    if (!state?.canPair) { pair.append(el('p', 'set-hint', syncError('protect'))); return; }
    const make = button(t('Make a code'));
    make.addEventListener('click', async () => {
      const r = await run(() => api.makeCode());
      if (r?.ok) { code = r.code; paintPair(); }
    });
    const line = el('label', 'set-row');
    const input = el('input', 'set-input');
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.placeholder = 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX';
    input.setAttribute('data-no-i18n', '');
    const enter = button(t('Pair'));
    enter.addEventListener('click', async () => { const r = await run(() => api.setCode(input.value)); if (r?.ok) void checkDevices(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enter.click(); } });
    line.append(el('span', 'set-label', t('Enter a code')), input, enter);
    const first = el('div', 'tool-row');
    first.append(make, el('span', 'set-hint', t('on one device, then enter it on each of the others')));
    pair.append(first, line);
  }

  function paintDevices() {
    list.replaceChildren();
    const devices = state?.devices ?? [];
    if (!devices.length) { list.append(el('li', 'tool-device tool-device--none', t('None yet: add each of your other devices by its Tailscale name or address.'))); return; }
    for (const d of devices) {
      const row = el('li', 'tool-device');
      row.dataset.name = d.name;
      const said = checking && !d.reach ? { ok: null, text: t('Checking…') } : deviceLine(d);
      row.classList.toggle('tool-device--ok', said.ok === true);
      row.classList.toggle('tool-device--bad', said.ok === false);
      const name = el('span', 'tool-device__name', d.name);
      name.setAttribute('data-no-i18n', '');
      const line = el('span', 'tool-device__state', said.text);
      line.setAttribute('data-no-i18n', '');
      const remove = button('×', 'btn ghost tool-device__remove');
      remove.title = t('Take off the list');
      remove.setAttribute('aria-label', `${t('Take off the list')}: ${d.name}`);
      remove.addEventListener('click', async () => {
        if (isConnected(d) && !await askConfirm(t(`Take ${d.name} off the list? It stops syncing with this device.`), 'Take off the list')) return;
        await run(() => api.configure({ removeDevice: d.name }));
      });
      row.append(name, line, remove);
      list.append(row);
    }
  }

  function paint() {
    if (!api) {
      status.textContent = t('Tailscale sync needs the desktop app.');
      for (const c of [enabled, peer, peerAdd, openSync, now, recheck]) c.disabled = true;
      return;
    }
    if (!state) return;
    if (!guide.dataset.set) { guide.open = !state.paired; guide.dataset.set = '1'; }
    // Tailscale itself, then how many of the devices answer (the owner, 2026-11-04:
    // "bilgisayarlar birbirine bağlı ise Tailscale bağlı olduğunu feedback versin").
    const devices = state.devices ?? [];
    const up = devices.filter((d) => d.reach?.ok).length;
    const parts = [];
    if (state.address) {
      parts.push(`${t('Tailscale is connected')} · ${t('this computer')} ${state.address}`);
      if (state.enabled) parts.push(state.listening ? t('answering') : t('not answering yet'));
      if (state.enabled && state.paired && devices.some((d) => d.reach)) parts.push(t(`${up} of ${devices.length} connected`));
    } else parts.push(t('Tailscale is not running on this computer.'));
    status.textContent = parts.join(' · ');
    status.classList.toggle('tool-status--off', !state.address);
    status.classList.toggle('tool-status--linked', !!state.address && up > 0);
    enabled.checked = state.enabled;
    openSync.checked = state.openSync;
    peerAdd.disabled = devices.length >= (state.maxDevices ?? 12);
    now.disabled = !state.enabled || !state.paired || !devices.length || state.busy;
    now.textContent = state.busy ? t('Syncing…') : t('Sync now');
    recheck.disabled = !state.enabled || !state.paired || !devices.length || checking;
    last.textContent = lastLine(state.last) + (state.waiting ? ` · ${t(`${state.waiting} files still coming`)}` : '');
    paintDevices();
    paintPair();
  }

  async function refresh() {
    if (!api) { paint(); return; }
    const s = await api.state().catch(() => null);
    if (s && s.ok !== false) state = s;
    paint();
  }
  /** Each device asked whether it is there: Tailscale up, the same Nebula, the same code. */
  async function checkDevices() {
    if (!api?.check || checking || !state?.enabled || !state.paired || !state.devices?.length) return;
    checking = true;
    paint();
    try { const s = await api.check(); if (s && s.ok !== false) state = s; } catch { /* said beside each device next time */ }
    checking = false;
    if (!overlay.hidden) paint();
  }
  /** One call to the main process; what it says goes under the buttons. */
  async function run(call) {
    say('');
    let r;
    try { r = await call(); } catch { r = { ok: false, error: 'failed' }; }
    if (r?.ok === false) say(syncError(r.error));
    await refresh();
    return r;
  }

  enabled.addEventListener('change', async () => { await run(() => api.configure({ enabled: enabled.checked })); void checkDevices(); });
  openSync.addEventListener('change', () => run(() => api.configure({ openSync: openSync.checked })));
  peerAdd.addEventListener('click', async () => {
    const r = await run(() => api.configure({ addDevice: peer.value }));
    if (r?.ok) { peer.value = ''; void checkDevices(); }
  });
  peer.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); peerAdd.click(); } });
  recheck.addEventListener('click', () => checkDevices());
  now.addEventListener('click', async () => {
    const r = await run(() => api.now());
    if (r?.error && r.ok !== false) say(syncError(r.error, r.theirs, r.mine));
    void checkDevices();
  });
  api?.on('state', (s) => { state = s; if (!overlay.hidden) paint(); });

  // While the sheet is open, each device is asked again now and then.
  let ticking = null;
  function close() { overlay.hidden = true; code = null; say(''); clearInterval(ticking); ticking = null; }
  function open() {
    overlay.hidden = false;
    void refresh().then(checkDevices);
    clearInterval(ticking);
    ticking = setInterval(() => { if (!overlay.hidden) void checkDevices(); }, 20_000);
    enabled.focus({ preventScroll: true });
  }
  closeButton?.addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) { e.preventDefault(); close(); }
  });

  return {
    open, close,
    refresh,
  };
}
