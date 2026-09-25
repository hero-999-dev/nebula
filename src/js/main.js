import { initDiskStorage, flushDisk, getDiskStatus } from './disk-store.js';
import { NoteStore, plainSnippet, relativeTime } from './notes.js';
import { GUIDE_NOTE, GUIDE_VERSION, addGuide, guideUnedited } from './seed-notes.js';
import { migrateNote } from './migrate.js';
import { initWhatsNew } from './whats-new.js';
import { bindEditor } from './editor.js';
import { initTheme } from './theme.js';
import { on } from './bus.js';
import { initDock } from './dock.js';
import { initToolbar } from './toolbar.js';
import { initSlashMenu } from './slash-menu.js';
import { initShapes } from './shapes.js';
import { initArrows } from './arrows.js';
import { initCodeBlocks, paintAllCode } from './codeblock.js';
import { paintAllEquations } from './equation.js';
import { initAiPanel } from './ai-panel.js';
import { initDialog, askText } from './dialog.js';
import { injectIcons, icon } from './icons.js';
import { initUpdater, showAppVersion } from './updater.js';
import { initAbout } from './about.js';
import { initSideToggle } from './side-toggle.js';
import { initFind } from './find.js';
import { initHistory } from './history.js';
import { initRichPaste } from './rich-paste.js';
import { initNoteActions } from './note-actions.js';
import { initAppMenu } from './app-menu.js';
import { initPalette, initShortcuts, initBlocks } from './palette.js';

const $ = (id) => document.getElementById(id);
const AUTOSAVE_MS = 400;

/**
 * The vault could not be read. Say so loudly and do nothing else: the disk
 * mirror is already disabled, so whatever is on disk stays untouched until the
 * user (or a restart) resolves it.
 */
function showStorageError(message) {
  const el = $('demo-banner');
  el.className = 'demo-banner storage-error';
  el.textContent = `Your notes could not be read (${message}). Nothing has been changed on disk. `;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Open notes folder';
  btn.addEventListener('click', () => window.nebula?.storage?.reveal(''));
  el.appendChild(btn);
  el.hidden = false;
}

async function boot() {
  const disk = await initDiskStorage();
  if (!disk.bridge) $('demo-banner').hidden = false;
  else if (!disk.ok) showStorageError(disk.error);

  injectIcons();
  initDialog();

  // Seed the guide only for a vault we know is genuinely empty. A vault that
  // already has notes gets the guide ADDED instead — once per guide version,
  // never overwriting anything — so an existing copy is not left without it.
  // Both need a vault that was read successfully; an unreadable one is written
  // to under no circumstances.
  // A vault we know is genuinely empty: this is someone's first run.
  const firstRun = disk.ok && disk.empty;
  const store = new NoteStore({ allowSeed: firstRun });
  // When the guide is genuinely new to this vault, open it — otherwise the one
  // note the user was told to look at is the one they never see.
  if (disk.ok && store.ensureGuide(GUIDE_NOTE, GUIDE_VERSION, { unedited: guideUnedited })) {
    store.setActive(store.notes[0].id);
  }
  const titleEl = $('title');
  const saveEl = $('savestate');
  const listEl = $('note-list');
  const filterEl = $('side-filter');
  const editorEl = $('editor');

  let listFilter = '';
  let titleTimer = null;
  let titleNoteId = null;

  function showSaveError(error) {
    const banner = $('demo-banner');
    banner.className = 'demo-banner storage-error';
    banner.dataset.writeError = 'true';
    banner.textContent = `Your latest changes could not be saved. ${error?.message ?? error ?? ''} `;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry saving';
    retry.addEventListener('click', () => { void saveCurrent().catch(showSaveError); });
    banner.appendChild(retry);
    banner.hidden = false;
    saveEl.textContent = 'Not saved';
    saveEl.classList.remove('saving');
  }

  function setSaveState(state, error) {
    const status = getDiskStatus();
    if (state === 'error') { showSaveError(error); return; }
    if (!status.ok) {
      saveEl.textContent = 'Not saved';
      saveEl.classList.remove('saving');
      if (disk.ok) showSaveError(status.error);
      return;
    }
    const saving = state === 'saving' || status.pending || titleTimer !== null || editor.pending;
    saveEl.textContent = saving ? 'Saving…' : state === 'saved' ? 'Saved' : '';
    saveEl.classList.toggle('saving', saving);
    const banner = $('demo-banner');
    if (!saving && banner.dataset.writeError) {
      banner.hidden = true;
      delete banner.dataset.writeError;
    }
  }

  const editor = bindEditor(editorEl, store, setSaveState);

  /* ---------- Only view (0.8.9) ----------
   * A note marked view-only reads and scrolls, selects and copies, opens links
   * with Ctrl+click and plays its videos — and nothing edits it. contenteditable
   * alone is not enough: code, shape text and captions are editable islands of
   * their own, and the app's Enter/Backspace/drag handlers change the DOM by
   * script. So the lock sits in front of all of them, in the capture phase. */
  const isReadOnly = () => editorEl.dataset.readonly === 'true';
  const readonlyChip = $('readonly-chip');

  // F12 is caught in the main process for real key presses (and then never
  // reaches the page). This is for a press the main process did not see —
  // one synthesised by a test driver, or from an assistive tool.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'F12' || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
    e.preventDefault();
    void window.nebula?.window?.snapshot?.();
  });
  // F12 (caught in the main process): say where the picture went.
  const toast = $('toast');
  let toastTimer = null;
  window.nebula?.window?.onSnapshot?.((result) => {
    if (!toast) return;
    toast.textContent = result?.ok
      ? `Snapshot saved to ${result.path} and copied`
      : 'Snapshot failed';
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  });
  function applyReadOnly() {
    const note = store.active();
    const ro = !!note?.readOnly;
    editorEl.dataset.readonly = ro ? 'true' : '';
    editorEl.contentEditable = String(!!note && !ro);
    titleEl.readOnly = ro;
    document.body.classList.toggle('note-readonly', ro);
    if (readonlyChip) readonlyChip.hidden = !ro;
    if (ro) { shapes?.reset(); richPaste?.reset(); }
  }
  readonlyChip?.addEventListener('click', () => { if (store.activeId) store.setReadOnly(store.activeId, false); });
  on('note-changed', ({ id } = {}) => { if (id === store.activeId) { applyReadOnly(); renderList(); } });
  const READING_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Shift', 'Control', 'Alt', 'Meta', 'F12']);
  const stop = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  editorEl.addEventListener('beforeinput', (e) => { if (isReadOnly()) stop(e); }, true);
  editorEl.addEventListener('keydown', (e) => {
    if (!isReadOnly() || READING_KEYS.has(e.key)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ['c', 'a', 'f', 'k', 's', 'p'].includes(k)) return;   // copy, select all, find, palette, save, print
    stop(e);
  }, true);
  for (const type of ['paste', 'cut', 'drop', 'dragstart', 'dblclick', 'change']) {
    editorEl.addEventListener(type, (e) => { if (isReadOnly()) stop(e); }, true);
  }
  const HANDLES = '.shape, .note-image, .note-arrow, .image-h, .shape-h, .shape-rot, .arrow-end, .link-del, .code-del, .code-lang, .blk-todo';
  for (const type of ['mousedown', 'click']) {
    editorEl.addEventListener(type, (e) => {
      if (!isReadOnly() || e.target.closest('.code-copy')) return;
      if (e.target.closest(HANDLES)) stop(e);
    }, true);
  }
  titleEl.addEventListener('beforeinput', (e) => { if (isReadOnly()) e.preventDefault(); });
  window.addEventListener('nebula-storage-status', () => setSaveState('saved'));

  async function saveCurrent() {
    flushTitle();
    editor.flush();
    await flushDisk();
    setSaveState('saved');
  }

  initDock();
  // The app's own undo stack. Everything that edits the note by script
  // announces itself to this first; Chromium's stack cannot see any of it.
  let richPaste = null;
  const history = initHistory(editorEl, {
    // Only view: the menu's Undo/Redo must not change a locked note either.
    isLocked: isReadOnly,
    onRestore: () => {
      // A restored snapshot is just markup — code blocks and equations are
      // painted from their stored source, the same as when a note opens.
      paintAllCode(editorEl);
      paintAllEquations(editorEl);
      shapes?.reset();
      richPaste?.reset();
      richPaste?.refresh();
      editor.flush();
      renderList();
    },
  });
  // Shapes first: the toolbar's shape buttons go through this controller so a
  // new shape arrives selected, with its colour bar already open.
  const shapes = initShapes(editorEl, { history, onGeometry: () => arrows?.reflow() });
  const arrows = initArrows(editorEl, { history });
  const toolbar = initToolbar(editorEl, {
    onLink: () => richPaste?.open('url'),
    shapes,
    arrows,
    history,
    onPaste: () => richPaste?.paste(),
    onSave: () => { void saveCurrent().catch(showSaveError); },
    noteTitle: () => store.active()?.title ?? '',
    // An imported file becomes a new note, never an edit to the open one.
    onImport: ({ title, content }) => {
      flushTitle();
      editor.flush();
      const note = store.createNote(title || 'Imported note');
      store.updateActive({ content });
      renderList();
      openNote(note.id);
    },
  });
  // Typing is coalesced into one step; Enter, deletes and pastes each start
  // their own, the way they do in every other editor.
  editorEl.addEventListener('beforeinput', (e) => {
    const separate = e.inputType !== 'insertText';
    history?.typed({ separate });
  });
  richPaste = initRichPaste(editorEl, { history, onGeometry: () => arrows?.reflow() });
  initSlashMenu(editorEl, { history, shapes, links: richPaste });
  initCodeBlocks(editorEl, { history });
  const find = initFind(editorEl);

  function renderList() {
    const notes = store.filter(listFilter);
    listEl.innerHTML = '';
    if (!notes.length) {
      // NOT an early return: the archive and trash counts have to be redrawn
      // too, and trashing the last note is exactly when they change. Returning
      // here left the trash showing 0 with a note in it.
      const empty = document.createElement('div');
      empty.className = 'note-list-empty';
      empty.textContent = listFilter ? 'No notes match' : 'No notes yet';
      listEl.appendChild(empty);
      noteActions?.renderDrawers();
      return;
    }
    for (const note of notes) {
      // The row is a <button>; the ⋯ has to be a sibling, not a child — a
      // button inside a button is invalid and never receives the click.
      const item = document.createElement('div');
      item.className = 'note-item';

      const row = document.createElement('button');
      row.type = 'button';
      row.className = `note-row${note.id === store.activeId ? ' active' : ''}`;
      row.innerHTML = '<div class="nr-title"></div><div class="nr-meta"></div>';
      const title = note.title || 'Untitled';
      row.children[0].textContent = title;
      if (note.pinned) {
        const pin = document.createElement('span');
        pin.className = 'nr-pin';
        pin.innerHTML = icon('pin');
        pin.title = 'Pinned';
        row.children[0].prepend(pin);
      }
      // The collapsed rail shows only this; CSS cannot take a first letter out
      // of an inline box reliably, so it is handed over explicitly.
      row.children[0].dataset.initial = title.trim().charAt(0).toUpperCase() || 'U';
      row.title = title; // the full name is still readable as a tooltip
      row.children[1].textContent = `${relativeTime(note.updatedAt)} · ${plainSnippet(note.content, 48) || 'Empty'}`;
      row.addEventListener('click', () => openNote(note.id));

      item.append(row);
      if (noteActions) item.append(noteActions.moreButton(note.id));
      listEl.appendChild(item);
    }
    noteActions?.renderDrawers();
  }

  function openNote(id) {
    flushTitle();     // before the active note changes, or it lands on the wrong one
    editor.flush();
    store.setActive(id);
    const note = store.active();
    titleNoteId = note?.id ?? null;
    titleEl.value = note?.title ?? '';
    titleEl.disabled = !note;
    editor.load(note);
    // Before anything reads the markup: bring what the note SAVED up to what
    // this version writes. A fix that lives in a note's HTML never reaches the
    // notes written before it otherwise — see migrate.js.
    migrateNote(editorEl, { fitShape: shapes?.fit });
    applyReadOnly();
    // Both are regenerated from their stored source, never trusted from the
    // saved HTML — and the shape bar belongs to a note that is now gone.
    paintAllCode(editorEl);
    paintAllEquations(editorEl);
    shapes?.reset();
    richPaste?.reset();
    richPaste?.refresh();
    history?.reset(); // this note's history is not the next note's
    find?.close();    // its ranges point into the note that just closed
    setSaveState('');
    renderList();
  }

  /**
   * Write a pending title now.
   *
   * The title is debounced like the body, but only the body was ever flushed
   * before switching notes. Rename a note and press New note inside the
   * debounce window and the new name was simply dropped — the note stayed
   * "Untitled". Worse, the timer would then fire against whichever note had
   * become active and put the old name on that one instead.
   */
  function flushTitle() {
    if (!titleTimer) return;
    clearTimeout(titleTimer);
    if (store.get(titleNoteId)) store.updateNote(titleNoteId, { title: titleEl.value || 'Untitled' });
    // A failed local save leaves the buffer eligible for the Retry action.
    titleTimer = null;
  }

  titleEl.addEventListener('input', () => {
    setSaveState('saving');
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => {
      try {
        flushTitle();
        setSaveState('saved');
        renderList();
      } catch (err) { showSaveError(err); }
    }, AUTOSAVE_MS);
  });

  filterEl.addEventListener('input', () => {
    listFilter = filterEl.value;
    renderList();
  });

  $('btn-new').addEventListener('click', () => {
    flushTitle();
    editor.flush();
    store.createNote('Untitled');
    openNote(store.activeId);
    titleEl.focus();
    titleEl.select();
  });

  // Which OS, so the title strip can leave room for macOS's traffic lights.
  document.documentElement.dataset.platform = window.nebula?.platform ?? 'web';

  const noteActions = initNoteActions({
    store,
    onChanged: () => { renderList(); openNote(store.activeId); },
    openNote: (id) => openNote(id),
  });

  initTheme($('theme-pick'));
  const side = initSideToggle($('side-toggle'));

  // File / Edit / View / Window / Help, beside the logo. The same definitions
  // are the only list the command palette reads.
  const shortcuts = initShortcuts();
  const blocks = initBlocks();
  let menu = null;
  const palette = initPalette(() => menu?.commands ?? []);
  // Built before the menu, which needs it for Help -> What's new. The version
  // arrives from the main process, so the card opens on its own once it does.
  const whatsNew = initWhatsNew({
    overlay: $('ov-whats-new'),
    body: $('whats-new-body'),
    close: $('whats-new-close'),
  });

  menu = initAppMenu({
    whatsNew,
    actions: toolbar?.actions ?? {},
    history,
    store,
    find,
    palette,
    shortcuts,
    blocks,
    newNote: () => $('btn-new').click(),
    toggleSide: () => side?.toggle(),
    toggleBar: () => document.querySelector('[data-pad="hide"]')?.click(),
    toggleAi: () => document.querySelector('[data-pad="ai"]')?.click(),
    about: () => $('app-version').click(),
    checkUpdates: () => checkForUpdates(),
    // Works even when the note was deleted — that is the whole point of it.
    guide: () => { const id = addGuide(store); renderList(); openNote(id); },
  });

  // The native window buttons are painted by Windows, so their colours have to
  // be handed over whenever the theme changes.
  function paintTitleBar() {
    const css = getComputedStyle(document.documentElement);
    window.nebula?.window?.overlay?.({
      color: css.getPropertyValue('--paper-sunken').trim(),
      symbolColor: css.getPropertyValue('--ink').trim(),
    });
  }
  paintTitleBar();
  on('theme-changed', paintTitleBar);

  // The two accelerators the menus advertise but nothing else owns. The rest
  // live with the feature they belong to (Ctrl+F in find.js, Ctrl+K in
  // palette.js, the formatting keys in toolbar.js).
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !e.shiftKey) {
      e.preventDefault();
      $('btn-new').click();
    } else if (e.key === 'F11') {
      e.preventDefault();
      window.nebula?.window?.fullscreen?.();
    }
  });
  // The update button lives inside About: one place that answers "which build
  // is this, where is it, and is there a newer one".
  const checkButton = $('btn-check-updates');
  const { checkForUpdates } = initUpdater({ checkButton });
  initAbout({ trigger: $('app-version'), checkButton });
  showAppVersion($('app-version'));

  // Once the version is known: say what this build changed, once per version.
  // Deliberately after openNote, so the card is the last thing drawn and lands
  // over a window that is already finished rather than a half-built one.
  void window.nebula?.version?.().then((v) => {
    if (!v) return;
    whatsNew.setVersion(v);
    // First run: stamp it and stay out of the way. There is no older version
    // to have missed, and the guide is what this window is for.
    if (firstRun) whatsNew.acknowledge();
    else whatsNew.maybeOpen();
  }).catch(() => { /* a browser preview has no main process */ });
  on('note-changed', () => renderList());

  openNote(store.activeId);

  // Native close/quit/update waits for both debounce buffers AND the disk
  // acknowledgements. The old window could disappear inside the 400ms delay.
  window.nebula?.lifecycle?.onSave(async () => {
    try { await saveCurrent(); }
    catch (err) { showSaveError(err); throw err; }
  });
  // Reloads and browser previews still commit the synchronous local buffers.
  window.addEventListener('beforeunload', () => {
    flushTitle();
    editor.flush();
  });

  // Last, and guarded: this is the only part of the app that loads third-party
  // pages, and a throw in it used to abort the rest of boot() — leaving no
  // toolbar, no notes and only a console line to say why.
  try {
    const ai = initAiPanel({ askText });
    if (ai) {
      // Attach the guest when the panel is actually visible, never while it is
      // display:none — that detaches it and forces a reload.
      const aiPanel = $('ai-panel');
      new MutationObserver(() => { if (!aiPanel.hidden) ai.open(); })
        .observe(aiPanel, { attributes: true, attributeFilter: ['hidden'] });
      if (!aiPanel.hidden) ai.open();
    }
  } catch (err) {
    console.error('[nebula] AI panel failed to start', err);
  }
}

boot().catch((err) => console.error('[nebula] boot failed', err));
