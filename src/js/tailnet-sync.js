/**
 * Tailscale sync, the window's half (1.0.3, electron/sync.js).
 *
 * The main process never writes a note into a vault the window holds: it asks
 * the window. "prepare" writes what is being typed and says which notes this
 * copy keeps to itself — its guide (made by each copy in its own language) and
 * the ones marked "Do not sync this note" (1.0.4) — never synced; "apply"
 * takes what came — each note only if it is still as it was when the pull
 * looked, so a word typed meanwhile is never written over.
 *
 * A thin bar under the title bar says a sync is running; on opening, while
 * the first one runs, a card says so and can be skipped.
 *
 * 1.0.4: a video whose big file is still on its way says so on its own player,
 * with how much of it is here (file-video.js) — and so do an attached file's
 * card and a picture; and while both computers are open they keep alike by
 * themselves (sync.js, "live") — that is no news, so no card comes up for it,
 * and the open note that came in newer is taken in where the reader is
 * (note-in-place.js), not opened again.
 */
import { on } from './bus.js';
import { t } from './i18n.js';
import { isGuideTitle } from './seed-notes.js';
import { parseFolders } from './folders.js';
import { parseProjects } from './projects.js';
import { syncCardLine } from './tools-panel.js';
import { comingVideoWords, setComingVideos, videoComing, videoArrived } from './file-video.js';

const NOTE_ID = /^[\w-]{1,120}$/;
/** What a card of a file still coming calls it (file-video.js): "Video syncing · 62 %", "File …", "Picture …". */
const COMING_NAME = { video: 'Video', file: 'File', picture: 'Picture' };

/** Whether a note may be taken: still as the pull saw it, never a black hole's, never over one kept to this computer. */
export function canTake(current, expect) {
  if (current?.hole || current?.noSync) return false;
  if (expect === null) return !current;
  return !!current && Number(current.updatedAt || 0) === Number(expect);
}

/**
 * What came, into the store. Copies first: the losing version is kept before
 * the winning one takes its place.
 * @returns {{applied: string[], dropped: string[], skipped: string[]}}
 */
export function applyIncoming(store, { notes = [], copies = [], drops = [] } = {}) {
  const applied = [];
  const dropped = [];
  const skipped = [];
  for (const item of [...copies, ...notes]) {
    let note;
    try { note = JSON.parse(item.text); } catch { note = null; }
    // One that says it is kept to a computer was never to come: no copy hands it out (sync.js).
    if (!note || note.id !== item.id || !NOTE_ID.test(String(item.id)) || note.hole || note.noSync) { skipped.push(item.id); continue; }
    const at = store.notes.findIndex((n) => n.id === item.id);
    if (!canTake(at < 0 ? null : store.notes[at], item.expect ?? null)) { skipped.push(item.id); continue; }
    if (at < 0) store.notes.push(note); else store.notes[at] = note;
    applied.push(item.id);
  }
  if (applied.length) store.save(applied);
  for (const d of drops) {
    const current = store.get(d.id);
    if (!current || current.hole || current.noSync || Number(current.updatedAt || 0) !== Number(d.expect)) { skipped.push(d.id); continue; }
    if (store.destroy(d.id)) dropped.push(d.id);
  }
  return { applied, dropped, skipped };
}

/** The notes this copy keeps to itself: its guide, and those marked "Do not sync this note" (1.0.4). */
export const keepOutOf = (store) => store.notes.filter((n) => n.noSync || isGuideTitle(n.title)).map((n) => n.id);

/**
 * Whether a note's menu offers "Do not sync this note": once Tailscale sync is
 * on (the owner, 2026-11-15) — and on a note already kept, so it can always be
 * put back. Never on the guide or a black hole's note: those stay on each
 * computer anyway.
 */
export const canKeepOff = (note, syncOn) => !!note && !note.hole && !isGuideTitle(note.title) && (!!note.noSync || !!syncOn);

/**
 * @param {object} o
 * @param {import('./notes.js').NoteStore} o.store
 * @param {object} o.folders   FolderStore
 * @param {object} o.projects  ProjectStore
 * @param {() => Promise<void>} o.saveCurrent  what is typed, into the store and on to the disk
 * @param {() => void} [o.flushTyped]  what is typed, into the store, at once: nothing waited for
 * @param {() => void} o.renderList
 * @param {(id: string, o?: {inPlace?: boolean}) => void} o.openNote  `inPlace`: the open note itself, newer
 */
export function initTailnetSync({ store, folders, projects, saveCurrent, flushTyped = () => {}, renderList, openNote }) {
  const api = window.nebula?.sync;
  if (!api) return null;

  // At the bottom right, like the update card: who it syncs with, a bar, and what came of it.
  const bar = document.createElement('div');
  bar.id = 'sync-card';
  bar.className = 'update-card sync-card';
  bar.hidden = true;
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.innerHTML = '<p class="uc-text sync-card__head" data-no-i18n></p><p class="sync-card__line" data-no-i18n></p><div class="uc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>';
  document.body.appendChild(bar);
  const [head, line, meter] = bar.children;
  meter.setAttribute('aria-label', t('Syncing'));
  let hideTimer = null;
  const hideLater = (ms) => { clearTimeout(hideTimer); hideTimer = setTimeout(() => { bar.hidden = true; }, ms); };
  bar.addEventListener('click', () => { clearTimeout(hideTimer); bar.hidden = true; });

  const sendKeepOut = () => api.keepOut(keepOutOf(store)).catch(() => {});
  let keepTimer = null;
  on('note-changed', () => { clearTimeout(keepTimer); keepTimer = setTimeout(sendKeepOut, 800); });
  void sendKeepOut();

  // Whether sync is switched on, for the note's menu: asked once, then told by Tools at every change.
  let syncOn = false;
  const learn = (s) => { if (s && s.ok !== false) syncOn = !!s.enabled; };
  void api.state().then(learn).catch(() => {});
  on('sync-state', learn);

  api.onAsk(async (kind, payload) => {
    if (kind === 'prepare') {
      await saveCurrent();
      return { keepOut: keepOutOf(store) };
    }
    if (kind !== 'apply') throw new Error('unknown');
    // A word typed since "prepare" and not yet written: written now, so that its note is no
    // longer as the pull saw it and is left alone. Taken all the same, the note that came would
    // have been written over by that word's save, and what the other computer did lost (1.0.4).
    await saveCurrent();
    // And a key pressed while the disk wrote. From here to the open note shown anew nothing is
    // waited for: no key can come between the look at a note, its taking, and its showing.
    flushTyped();
    const active = store.activeId;
    const result = applyIncoming(store, payload);
    // The open note came in new: shown as it is now, where the reader is — the page, the
    // caret and a playing video stay (1.0.4, note-in-place.js). One that went: the list's first.
    if (active && result.applied.includes(active)) openNote(active, { inPlace: true });
    else if (active && result.dropped.includes(active)) openNote(store.activeId);
    let lists = true;
    if (Array.isArray(payload?.folders)) {
      const next = parseFolders(JSON.stringify({ folders: payload.folders }));
      if (next) { folders.folders = next; await folders.save(); } else lists = false;
    }
    if (Array.isArray(payload?.projects)) {
      const next = parseProjects(JSON.stringify({ projects: payload.projects }));
      if (next) { projects.projects = next; await projects.save(); } else lists = false;
    }
    if (result.applied.length || result.dropped.length || payload?.folders || payload?.projects) {
      renderList();
      await saveCurrent();
    }
    return { ...result, lists };
  });

  // The big files still on their way (1.0.4): a player waiting for one says how much of it is here,
  // and so do an attached file's card and a picture. Asked at the start, after every pull (it may
  // have left some to follow) and when the queue stops.
  comingVideoWords((pct, kind) => t(`${COMING_NAME[kind] ?? 'Video'} syncing · ${pct} %`));
  const learnComing = () => Promise.resolve(api.coming?.()).then((list) => { if (Array.isArray(list)) setComingVideos(list); }).catch(() => {});
  void learnComing();

  // A big file arrived after its note: every picture and video naming it loads again.
  api.on('media-ready', ({ id, name } = {}) => {
    videoArrived(id, name);
    const src = `nebula-media://note/${id}/${name}`;
    for (const el of document.querySelectorAll('img, video, source, audio')) {
      if (el.getAttribute('src') !== src) continue;
      el.setAttribute('src', '');
      el.setAttribute('src', src);
      const media = el.tagName === 'SOURCE' ? el.parentElement : el;
      if (typeof media?.load === 'function') media.load();
    }
  });

  const card = document.createElement('div');
  card.className = 'sync-screen';
  card.hidden = true;
  card.setAttribute('role', 'status');
  card.innerHTML = '<div class="sync-screen__card"><span class="sync-screen__text"></span><b class="sync-screen__peer" data-no-i18n></b><span class="opening__bar"><i></i></span><button type="button" class="btn ghost sync-screen__skip"></button></div>';
  document.body.appendChild(card);
  // The button takes the card away and nothing else: the sync goes on, and the button says so.
  card.querySelector('.sync-screen__skip').addEventListener('click', () => { card.hidden = true; });

  api.on('progress', (p = {}) => {
    if (p.phase === 'files') videoComing(p);
    if (p.phase === 'done' || p.phase === 'idle') void learnComing();
    // Live (1.0.4): two computers keeping alike while both are open is no news — no card, whatever came of it.
    if (p.reason === 'live') return;
    if (p.phase === 'done') card.hidden = true;
    // Big files done in the background: the card goes, unless it is saying how a sync ended.
    if (p.phase === 'idle') { if (!bar.hidden && !bar.classList.contains('sync-card--end')) hideLater(1500); return; }
    const said = syncCardLine(p);
    if (!said) return;
    clearTimeout(hideTimer);
    head.textContent = said.head;
    line.textContent = said.line;
    line.hidden = !said.line;
    bar.classList.toggle('sync-card--busy', said.share === null && !said.end);
    bar.classList.toggle('sync-card--end', said.end);
    bar.classList.toggle('sync-card--failed', !!said.failed);
    const pct = said.share === null ? null : Math.round(Math.min(1, Math.max(0, said.share)) * 100);
    meter.firstChild.style.width = pct === null ? '' : `${pct}%`;
    if (pct === null) meter.removeAttribute('aria-valuenow'); else meter.setAttribute('aria-valuenow', String(pct));
    // Above the update card when that one is up.
    const update = document.getElementById('update-card');
    bar.style.bottom = update && !update.hidden ? `${18 + update.offsetHeight + 10}px` : '';
    bar.hidden = false;
    if (said.end) hideLater(said.failed ? 9000 : 6000);
  });

  /** On opening: a pull before work starts, if that is what was chosen. */
  async function onOpening() {
    const s = await api.state().catch(() => null);
    if (!s?.enabled || !s.paired || !s.openSync || !s.devices?.length) return;
    card.querySelector('.sync-screen__text').textContent = t('Syncing with');
    card.querySelector('.sync-screen__peer').textContent = s.devices.map((d) => d.name).join(', ');
    card.querySelector('.sync-screen__skip').textContent = t('Hide (keeps syncing)');
    card.hidden = false;
    // A peer that is off answers in a moment; the card never stays more than half a minute.
    const shown = setTimeout(() => { card.hidden = true; }, 30_000);
    try { await api.now(); } catch { /* said in Tools */ } finally { clearTimeout(shown); card.hidden = true; }
  }

  return { onOpening, keepOut: sendKeepOut, isOn: () => syncOn };
}
