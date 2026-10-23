import { initDiskStorage, flushDisk, getDiskStatus } from './disk-store.js';
import { NoteStore, plainSnippet, relativeTime } from './notes.js';
import { GUIDE_NOTE, GUIDE_VERSION, addGuide, guideUnedited, guideFor, syncGuideLanguage } from './seed-notes.js';
import { guideTitles } from './guide-i18n.js';
import { migrateNote, MARKUP_VERSION } from './migrate.js';
import { healVault } from './heal.js';
import { initWhatsNew } from './whats-new.js';
import { bindEditor } from './editor.js';
import { initTheme, wearStoredTheme } from './theme.js';
import { initThemeEditor } from './theme-editor.js';
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
import { initLabels } from './labels.js';
import { initLabelFilter, initLabelHits } from './label-filter.js';
import { initDividerSelect } from './dividers.js';
import { initColumns } from './columns.js';
import { initBlockDrag } from './block-drag.js';
import { initBlockHandles } from './block-handle.js';
import { initGapCaret } from './gap-caret.js';
import { initTables } from './table.js';
import { initBlackHoles, holeInitials } from './black-holes.js';
import { initGalaxy } from './galaxy-ui.js';
import { createGalaxyMap } from './galaxy-map.js';
import { setUniverse, refreshUniverses } from './widgets.js';
import { askAboutHeldMedia } from './held-media.js';
import { initI18n, initLanguagePicker, t, getLang } from './i18n.js';
import { initContextMenu } from './context-menu.js';
import { initToggles } from './toggles.js';
import { initAutoArrows } from './auto-arrows.js';
import { initMentions, refreshMentions, removeTagChips } from './mentions.js';
import { initNoteActions } from './note-actions.js';
import { FolderStore } from './folders.js';
import { ProjectStore } from './projects.js';
import { initPageModes, applyPageMode, opensFitted, sheetPx, isFluid, usesRealSize } from './page-mode.js';
import { initSplitView } from './split-view.js';
import { restoreWideOrientation } from './pdf-preview.js';
import { orderPage } from './page-order.js';
import { initZoomControl, setRealScale, normalizeZoom, FIT, DEFAULT_ZOOM } from './page-zoom.js';
import { initNoteList } from './note-list.js';
import { initAppMenu } from './app-menu.js';
import { initPalette, initShortcuts, initBlocks } from './palette.js';
import { newNoteDefaults, readSettings, initSpelling } from './settings.js';
import { initSettingsPanel } from './settings-panel.js';
import { appLockGate, appLockIsOn } from './app-lock.js';

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
  // Where the editing bar stands, before the vault is read: reading it takes a
  // moment, and until then the bar and the page stood side by side — "while the
  // app loads it looks like this, then it joins into one page" (the owner, 0.9.4).
  initDock();
  injectIcons();
  // The interface in the chosen language (i18n.js): translated as it reaches the page.
  initI18n();
  initSpelling();
  // The lock on opening (0.9.4, app-lock.js): where one is set, nothing is read
  // and nothing is started until it has been answered — in the theme and the
  // language of the app, which is why those two come first.
  wearStoredTheme();
  const gate = await appLockGate();
  const disk = await initDiskStorage();
  if (!disk.bridge) $('demo-banner').hidden = false;
  else if (!disk.ok) showStorageError(disk.error);

  initLanguagePicker();
  initDialog();

  // Seed the guide only for a vault we know is genuinely empty. A vault that
  // already has notes gets the guide ADDED instead — once per guide version,
  // never overwriting anything — so an existing copy is not left without it.
  // Both need a vault that was read successfully; an unreadable one is written
  // to under no circumstances.
  // A vault we know is genuinely empty: this is someone's first run.
  const firstRun = disk.ok && disk.empty;
  const store = new NoteStore({ allowSeed: firstRun });
  // Folders in the list (0.9.3): folders.json in the vault, beside the notes.
  const folders = await FolderStore.load();
  // Projects (1.0.0): folders in a folder — projects.json, beside folders.json.
  const projects = await ProjectStore.load();
  // When the guide is genuinely new to this vault, open it — otherwise the one
  // note the user was told to look at is the one they never see.
  // The guide is in the language of the app (0.9.4, guide-i18n.js).
  if (disk.ok && store.ensureGuide(guideFor(getLang()), GUIDE_VERSION, { unedited: guideUnedited, titles: guideTitles(GUIDE_NOTE) })) {
    store.setActive(store.notes[0].id);
  }
  // A guide nobody wrote in follows the language — one seeded in English, or
  // left in another language by an earlier choice.
  if (disk.ok) syncGuideLanguage(store, getLang());
  const titleEl = $('title');
  const saveEl = $('savestate');
  const listEl = $('note-list');
  const filterEl = $('side-filter');
  const editorEl = $('editor');

  let listFilter = '';
  // Filter by label (label-filter.js): set once the list can be drawn.
  let labelFilter = null;
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
  // A short word from anywhere in the app (a picture copied, 0.9.3).
  window.addEventListener('nebula-toast', (e) => {
    if (!toast || !e.detail) return;
    toast.textContent = t(String(e.detail));
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
  });
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
  // The title is written in the note's own writing font (0.9.4) — "I changed
  // the main font in Settings and the title is still in the serif" (the owner).
  // Only on screen: it is the note's name, in the list and in a file as before.
  function paintTitleFont() {
    titleEl.style.fontFamily = store.active()?.font?.family ?? '';
  }
  on('note-changed', ({ id } = {}) => { if (id === store.activeId) { applyReadOnly(); paintTitleFont(); } });
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

  // The app's own undo stack. Everything that edits the note by script
  // announces itself to this first; Chromium's stack cannot see any of it.
  let richPaste = null;
  let columns = null;
  let tables = null;
  let toggles = null;
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
      toggles?.heal();
      richPaste?.refresh();
      columns?.refresh();
      tables?.refresh();
      arrows?.reflow();
      editor.flush();
      renderList();
    },
  });
  // Shapes first: the toolbar's shape buttons go through this controller so a
  // new shape arrives selected, with its colour bar already open.
  const shapes = initShapes(editorEl, { history, onGeometry: () => arrows?.reflow() });
  const arrows = initArrows(editorEl, { history });
  // Nebula Wide's sheet for export and print, as it was last turned (pdf-preview.js).
  restoreWideOrientation();
  const toolbar = initToolbar(editorEl, {
    translate: t,
    onWideOrientation: () => pageModes?.paint(),
    onLink: () => richPaste?.open('url'),
    shapes,
    arrows,
    history,
    onPaste: () => richPaste?.paste(),
    onSave: () => { void saveCurrent().catch(showSaveError); },
    noteTitle: () => store.active()?.title ?? '',
    noteLabels: () => store.active()?.labels ?? [],
    // The note's writing font (0.9.3): the last font and size picked in it.
    noteFont: () => store.active()?.font ?? null,
    setNoteFont: (patch) => { if (store.activeId && !isReadOnly()) store.setFont(store.activeId, patch); },
    // An imported file becomes a new note, never an edit to the open one.
    onImport: ({ title, content, labels }) => {
      flushTitle();
      editor.flush();
      const note = store.createNote(title || 'Imported note');
      store.updateActive({ content, ...(labels?.length ? { labels } : {}) });
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
  richPaste = initRichPaste(editorEl, {
    history,
    // Pasted lines are written in the note's writing font, as typed ones are (0.9.4).
    noteFont: () => store.active()?.font ?? null,
    // A dropped video is copied into the open note's own folder (0.9.4).
    noteId: () => store.active()?.id ?? null,
    // A video dropped on a note in a black hole is sealed there.
    noteHole: () => store.active()?.hole ?? null,
    onGeometry: () => arrows?.reflow(),
    // A page title that arrived is a repair: stored without dating the note,
    // unless there is unsaved typing, whose save carries it anyway.
    onHeal: () => {
      if (editor.pending || !store.activeId) return;
      const healed = editor.adopt();
      if (healed) store.heal(store.activeId, healed, MARKUP_VERSION);
    },
  });
  initSlashMenu(editorEl, { history, shapes, links: richPaste });
  initDividerSelect(editorEl, { history, isLocked: isReadOnly });
  // A divider pulled sideways splits the page into two columns (0.9.4).
  columns = initColumns(editorEl, { history, isLocked: isReadOnly, onGeometry: () => arrows?.reflow() });
  // A card, a video or a code block is moved as a picture is (0.9.4).
  // Every block — a line, a list item, a toggle, columns — has a grip at its left and goes where it is pulled, as in Notion (1.0.0).
  const blockHandles = initBlockHandles(editorEl, { history, isLocked: isReadOnly, onGeometry: () => arrows?.reflow(), label: t('Drag to move · click to select') });
  initBlockDrag(editorEl, { history, isLocked: isReadOnly, onGeometry: () => arrows?.reflow(), mover: blockHandles });
  // A click between, under or beside blocks that take no caret finds a line, or makes one (0.9.4).
  initGapCaret(editorEl, { history, isLocked: isReadOnly, onGeometry: () => arrows?.reflow() });
  // A table: cells to write in, colour, merge and fill; its numbering and grips are drawn here (0.9.4).
  tables = initTables(editorEl, { history, isLocked: isReadOnly, onGeometry: () => arrows?.reflow() });
  toggles = initToggles(editorEl, { history, isLocked: isReadOnly });
  initAutoArrows(editorEl, { history, isLocked: isReadOnly });
  initMentions(editorEl, {
    store,
    history,
    openNote: (id) => openNote(id),
    showLabel: (label) => labelFilter?.set({ kind: 'text', label }),
    isLocked: isReadOnly,
  });
  initContextMenu(editorEl, {
    history,
    images: richPaste,
    // In a table: rows and columns put in beside the clicked cell (0.9.4).
    tables,
    miniBarAt: (x, y) => toolbar?.miniBarAt?.(x, y),
    // Over selected words the bar's buttons are the menu's first row (0.9.4).
    format: { bar: $('mini-bar'), run: (act) => toolbar?.actions?.[act]?.() },
    isLocked: isReadOnly,
  });
  initCodeBlocks(editorEl, { history });
  const find = initFind(editorEl);

  labelFilter = initLabelFilter({
    store,
    button: $('label-filter-btn'),
    panel: $('label-filter'),
    onChange: () => { renderList(); showLabelHits(); },
    onDelete: (label) => deleteLabelEverywhere(label),
  });

  /**
   * With a label picked in "Filter by label", the open note shows where that
   * label is: its #chips in the text are painted, and the label by the title
   * is ringed (0.9.4). `scroll` brings the first one into view — when a note
   * is opened from the filtered list.
   */
  const labelHits = initLabelHits(editorEl, { frame: $('editor-frame') });
  function showLabelHits({ scroll = false } = {}) {
    const label = labelFilter?.active()?.label ?? null;
    // The bar steps from one place to the next when there are several.
    labelHits.show(label, { opened: scroll });
    const want = label ? `#${label}`.toLocaleLowerCase() : null;
    for (const chip of document.querySelectorAll('#note-labels .note-label')) {
      chip.classList.toggle('hit', !!want && chip.textContent.toLocaleLowerCase() === want);
    }
  }
  // After the header's labels have been drawn again (labels.js listens too).
  on('note-changed', () => { void Promise.resolve().then(() => showLabelHits()); });

  /** One note's row in the list: the row itself, and its ⋯ beside it. */
  function noteItem(note) {
    // The row is a <button>; the ⋯ has to be a sibling, not a child — a
    // button inside a button is invalid and never receives the click.
    const item = document.createElement('div');
    item.className = 'note-item';
    item.dataset.id = note.id;      // a right-click on the row finds its note (note-list.js)

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
    // The line under a name is not translated as a whole (it holds the note's
    // words), so its two fixed words are, here.
    const when = relativeTime(note.updatedAt);
    row.children[1].textContent = `${when === 'now' ? t('now') : when} · ${plainSnippet(note.content, 48) || t('Empty')}`;
    row.addEventListener('click', () => openNote(note.id));

    item.append(row);
    if (noteActions) item.append(noteActions.moreButton(note.id));
    return item;
  }

  let noteList = null;
  // Black holes (0.9.4): notes kept encrypted, drawn under the notes.
  let blackHoles = null;
  let galaxy = null;
  let galaxyTimer = 0;
  // The map follows the notes, not every keystroke: rebuilt once typing settles.
  const refreshGalaxy = () => { clearTimeout(galaxyTimer); galaxyTimer = setTimeout(() => { galaxy?.refresh(); refreshUniverses(); }, 250); };
  let pageModes = null;
  let zoomControl = null;
  let splitView = null;
  // The page the note being written in is shown in: its own, or Nebula Wide beside a Nebula Wide one (split-view.js).
  const activePage = () => splitView?.pageOf(store.activeId) ?? store.active()?.page ?? 'nw';
  const defaultZoom = () => (opensFitted(activePage()) ? FIT : DEFAULT_ZOOM);

  function renderList() {
    labelFilter?.render();
    const filtering = !!listFilter.trim() || !!labelFilter?.active();
    const notes = store.filter(listFilter).filter((n) => labelFilter?.matches(n) ?? true);
    listEl.innerHTML = '';
    listEl.classList.toggle('filtered', filtering);
    // Unfiltered, the list is drawn with its folders, and notes can be dragged
    // about in it (note-list.js). A filter shows one flat list of what matches.
    // The black holes live in their own scroll area (1.0.0); a filter hides
    // them as it did when they were drawn at the list's end.
    if (filtering) $('holes-scroll')?.replaceChildren();
    const drawn = (!filtering && noteList ? noteList.render(notes) : 0) + (!filtering && blackHoles ? blackHoles.render() : 0);
    if (!notes.length && !drawn) {
      // NOT an early return: the archive and trash counts have to be redrawn
      // too, and trashing the last note is exactly when they change. Returning
      // here left the trash showing 0 with a note in it.
      const empty = document.createElement('div');
      empty.className = 'note-list-empty';
      empty.textContent = filtering ? t('No notes match') : t('No notes yet');
      listEl.appendChild(empty);
      noteActions?.renderDrawers();
      return;
    }
    if (filtering || !noteList) for (const note of notes) listEl.appendChild(noteItem(note));
    noteActions?.renderDrawers();
    splitView?.sync();
    refreshGalaxy();
  }

  function openNote(id) {
    flushTitle();     // before the active note changes, or it lands on the wrong one
    editor.flush();
    store.setActive(id);
    const note = store.active();
    titleNoteId = note?.id ?? null;
    titleEl.value = note?.title ?? '';
    titleEl.disabled = !note;
    paintTitleFont();
    zoomControl?.paint();        // how close the page is, and with it the page width measured at that zoom
    editor.load(note);
    // Before anything reads the markup: bring what the note SAVED up to what
    // this version writes. A fix that lives in a note's HTML never reaches the
    // notes written before it otherwise — see migrate.js.
    migrateNote(editorEl, { fitShape: shapes?.fit });
    // A mentioned note that was renamed is shown under its name now.
    refreshMentions(editorEl, store);
    applyReadOnly();
    // Both are regenerated from their stored source, never trusted from the
    // saved HTML — and the shape bar belongs to a note that is now gone.
    paintAllCode(editorEl);
    paintAllEquations(editorEl);
    shapes?.reset();
    richPaste?.reset();
    toggles?.heal();
    richPaste?.refresh();
    columns?.refresh();
    tables?.refresh();
    arrows?.reflow();
    // What the note became on the way in IS the note now: written back at once
    // as a repair, not an edit, so a fix reaches this note even if nobody types
    // in it, and its date and place in the list stay (0.9.1).
    const healed = editor.adopt();
    if (healed && note) store.heal(note.id, healed, MARKUP_VERSION);
    history?.reset(); // this note's history is not the next note's
    find?.close();    // its ranges point into the note that just closed
    setSaveState('');
    renderList();
    paintOrder();
    autoOrder(400);              // pictures have their size by then
    showLabelHits({ scroll: true });
    splitView?.sync();           // side by side: the editor goes to this note's pane
    galaxy?.follow(store.activeId); // the map's camera goes to it
  }

  /**
   * Auto order page (0.9.3, page-order.js): the button beside the zoom puts
   * right what a page line falls across, on every page but Nebula Wide; a note
   * with it turned on (its ⋯ menu) is put right by itself — when it opens, when
   * its paper changes, when something is let go, and when typing settles.
   */
  const orderBtn = $('btn-order-page');
  let ordering = false;
  let orderTimer = 0;
  const orderChip = $('order-chip');
  function paintOrder() {
    const paper = 'paper' in editorEl.dataset;
    const on = !!store.active()?.autoOrder && paper;
    if (orderBtn) {
      orderBtn.disabled = !paper;
      orderBtn.classList.toggle('on', on);
      orderBtn.setAttribute('aria-pressed', String(on));
    }
    // Like Only view: a word by the title while it is on.
    if (orderChip) orderChip.hidden = !on;
  }
  orderChip?.addEventListener('click', () => {
    if (store.activeId && store.active()?.autoOrder) store.toggleAutoOrder(store.activeId);
    paintOrder();
  });
  function runOrder({ say = false } = {}) {
    if (isReadOnly() || !('paper' in editorEl.dataset)) return 0;
    ordering = true;
    history.push();
    const moved = orderPage(editorEl);
    if (moved) {
      arrows?.reflow();
      editorEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ordering = false;
    if (say) window.dispatchEvent(new CustomEvent('nebula-toast', { detail: moved ? `Moved to the next page: ${moved}` : 'Nothing crosses a page line' }));
    return moved;
  }
  function autoOrder(delay = 250) {
    clearTimeout(orderTimer);
    if (!store.active()?.autoOrder) return;
    orderTimer = setTimeout(() => { if (store.active()?.autoOrder) runOrder(); }, delay);
  }
  orderBtn?.addEventListener('mousedown', (e) => e.preventDefault());
  orderBtn?.addEventListener('click', () => runOrder({ say: true }));
  editorEl.addEventListener('input', () => { if (!ordering) autoOrder(1200); });
  window.addEventListener('mouseup', (e) => { if (editorEl.contains(e.target)) autoOrder(250); });

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
    pageModes?.paint();          // the PDF's title takes room on page one: the page lines follow it
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

  // Typing in the filter redraws the whole list per character; on a large
  // vault that is a full re-render a keypress. The redraw waits for the typing
  // to settle instead; clearing the filter shows everything at once (perf, 2026-10-23).
  let filterTimer = null;
  filterEl.addEventListener('input', () => {
    const value = filterEl.value;
    if (value === listFilter) return;
    clearTimeout(filterTimer); filterTimer = null;
    if (!value) { listFilter = value; renderList(); return; }
    filterTimer = setTimeout(() => { filterTimer = null; listFilter = filterEl.value; renderList(); }, 150);
  });

  /** A new note, in a folder when one is named ("+ Add a note" in an empty folder, 0.9.4), in a project (1.0.0) — or in an open black hole. */
  function newNote(folderId = null, { hole = null, project = null } = {}) {
    flushTitle();
    editor.flush();
    // Named in the language in use; it is the note's title from then on.
    const note = store.createNote(t('Untitled'), hole ? { hole } : {});
    if (folderId && note) store.setFolder(note.id, folderId);
    else if (project && note && !hole) store.setProject(note.id, project);
    // What Settings says a new note starts with (0.9.4): its font and size, and its page.
    const start = note ? newNoteDefaults() : { font: null, page: null };
    if (start.font) store.setFont(note.id, start.font);
    if (start.page) store.setPage(note.id, start.page);
    openNote(store.activeId);
    titleEl.focus();
    titleEl.select();
  }
  $('btn-new').addEventListener('click', () => newNote());

  // Which OS, so the title strip can leave room for macOS's traffic lights.
  document.documentElement.dataset.platform = window.nebula?.platform ?? 'web';

  const labels = initLabels(store);
  const noteActions = initNoteActions({
    onLabels: (id, button) => labels?.open(id, button),
    onFolder: (id, button) => noteList?.moveMenu(id, button),
    onHole: (id, button) => blackHoles?.noteHoleMenu(id, button),
    holeLabel: (note) => blackHoles?.noteMenuLabel(note) ?? null,
    trashedHoles: () => blackHoles?.trashed() ?? [],
    onHoleRestore: (id) => blackHoles?.restore(id),
    onHoleDelete: (id) => blackHoles?.destroy(id),
    canBeside: (id) => splitView?.canAdd(id) ?? false,
    onBeside: (id) => splitView?.add(id),
    store,
    onChanged: () => { renderList(); openNote(store.activeId); },
    openNote: (id) => openNote(id),
  });

  noteList = initNoteList({
    listEl, store, folders, projects, noteItem,
    onChanged: () => renderList(),
    newNote: (folderId, project = null) => newNote(folderId, { project }),
    noteMenu: (id, x, y) => noteActions?.openAt(id, x, y),
    // A note of an open black hole dragged up among the notes: taken out, with the black hole's answer.
    takeOut: (id) => blackHoles?.moveOut(id) ?? Promise.resolve(false),
  });
  // The filtered list is drawn here, not by note-list.js: its rows open their
  // menu on a right-click too (the listener is the list's own).
  // The page width beside Saved (0.9.3): a setting of the note, allowed in Only view too.
  pageModes = initPageModes({
    group: $('page-modes'),
    editorEl,
    current: activePage,
    choose: (id) => { if (store.activeId) { store.setPage(store.activeId, id); splitView?.choosePage(store.activeId); } zoomControl?.paint(); arrows?.reflow(); paintOrder(); autoOrder(); },
    title: () => titleEl.value,
    translate: t,
  });
  // The page zoom beside the alignment (0.9.3): a setting of the note.
  zoomControl = initZoomControl({
    group: $('tb-zoom'),
    editorEl,
    frameEl: $('editor-frame'),
    // A note nobody zoomed opens as its page says: NW and NN at 100 % (the old
    // size), A4 and the smaller papers at their real size (100 %), the wider
    // ones fitted to the window (0.9.3).
    current: () => normalizeZoom(store.active()?.zoom ?? defaultZoom()),
    sheet: () => (isFluid(activePage()) ? 0 : sheetPx(activePage())),
    realSized: () => usesRealSize(activePage()),
    windowZoom: () => window.nebula?.display?.windowZoom?.() ?? 1,
    choose: (v) => {
      if (store.activeId) store.setZoom(store.activeId, v === defaultZoom() ? null : v);
      requestAnimationFrame(() => arrows?.reflow());
    },
    translate: t,
    // The scroll bar's width is in the page's pixels: the column is measured again at the new zoom.
    after: () => pageModes?.paint(),
  });
  // How big a real millimetre is on this screen, asked once.
  void window.nebula?.display?.realScale?.().then((f) => { setRealScale(f); zoomControl?.paint(); arrows?.reflow(); }).catch(() => {});
  // The map of your notes (1.0.0): its minimap at the foot of the list, and a pane of the split page.
  // The map is a view of the notes, never a way in: one that cannot start leaves the app as it was.
  try { galaxy = initGalaxy({
    mount: $('galaxy-slot'),
    createMap: createGalaxyMap,
    store, folders, projects, holeInitials, icon,
    blackHoles: { list: () => blackHoles?.list() ?? [], unlock: (id) => blackHoles?.unlock(id), lock: (id) => blackHoles?.lock(id) },
    openNote: (id) => openNote(id),
    split: {
      add: (id) => splitView?.add(id),
      mapShown: () => !!splitView?.mapShown(),
      isMapFull: () => !!splitView?.isMapFull(),
      mapFull: (on) => splitView?.mapFull(on),
    },
    translate: t,
  }); } catch (err) { console.error('[nebula] the map could not start', err); galaxy = null; $('galaxy-slot')?.replaceChildren(); }
  // The Universe widget (1.0.0): the same map, live in a note — main space only.
  if (galaxy?.input) setUniverse({ createMap: createGalaxyMap, getInput: galaxy.input, colors: galaxy.colors, openNote: (id) => openNote(id) });
  // Notes side by side (1.0.0): a note dragged from the list onto the page opens beside it.
  splitView = initSplitView({
    map: galaxy?.pane ?? null,
    shell: $('edit-shell'),
    frame: $('editor-frame'),
    titleEl,
    store,
    openNote: (id) => openNote(id),
    translate: t,
    say: (text) => window.dispatchEvent(new CustomEvent('nebula-toast', { detail: text })),
    // A pane shown as saved: its page, and its code and equations drawn from their source.
    render: (ghost, page, title) => {
      applyPageMode(ghost, page, document, title);
      paintAllCode(ghost);
      paintAllEquations(ghost);
      pageModes?.paint();        // the print sheet is the note being written in
    },
    // The editor is wider or narrower now: its page, zoom and arrows measured again.
    onLayout: () => requestAnimationFrame(() => { pageModes?.paint(); zoomControl?.paint(); arrows?.reflow(); columns?.refresh?.(); }),
  });
  $('btn-new-folder')?.addEventListener('click', () => { void noteList.create(); });
  blackHoles = initBlackHoles({
    listEl, store, noteItem,
    onChanged: () => renderList(),
    // Locked: the map lets go of it in the same turn, not after the list's pause (1.0.0).
    onLocked: () => { clearTimeout(galaxyTimer); galaxy?.refresh(); refreshUniverses(); },
    openNote: (id) => openNote(id),
    newNote: (hole) => newNote(null, { hole }),
    saveNow: () => saveCurrent(),
    addButton: $('btn-new-hole'),
  });

  const theme = initTheme($('theme-pick'), { customButton: $('btn-theme-custom') });
  const side = initSideToggle($('side-toggle'));
  // A theme of one's own (0.9.4): the palette at the right of the themes opens
  // its editor upward, over Archive and Trash — where their drawer opens too,
  // so the two give way to each other.
  const themeEditor = initThemeEditor({
    panel: $('theme-editor'),
    button: $('btn-theme-custom'),
    theme,
    beforeOpen: () => {
      if (side?.isCollapsed()) side.toggle();
      document.querySelector('.drawer-tab[aria-expanded="true"]')?.click();
    },
  });
  for (const tab of document.querySelectorAll('.drawer-tab')) {
    tab.addEventListener('click', () => { if (tab.getAttribute('aria-expanded') === 'true') themeEditor?.close(); });
  }

  // File / Edit / View / Window / Help, beside the logo. The same definitions
  // are the only list the command palette reads.
  const shortcuts = initShortcuts();
  const blocks = initBlocks();
  // Settings, beside Help (0.9.4): a new note's font, size and page; what is put away; the lock on opening.
  const settings = initSettingsPanel({
    overlay: $('ov-settings'),
    body: $('settings-body'),
    closeButton: $('settings-close'),
    saveNow: () => saveCurrent(),
  });
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
    aiShown: () => !readSettings().hideAi,
    settings,
    lockSet: () => appLockIsOn(),
    lockNow: () => settings?.lockNow(),
    about: () => $('app-version').click(),
    checkUpdates: () => checkForUpdates(),
    // Works even when the note was deleted — that is the whole point of it.
    guide: () => { const id = addGuide(store, getLang()); renderList(); openNote(id); },
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
  // A body autosave arrives in a stream while someone types; redrawing the
  // whole list per save — every row, a label scan over every note's content,
  // the black-hole sections and the map's refresh — is what made a large note
  // answer late (perf audit, 2026-10-23). The redraw waits for the stream to
  // settle; every other change draws at once.
  let listDebounce = null;
  const settleList = () => {
    clearTimeout(listDebounce);
    listDebounce = setTimeout(() => { listDebounce = null; renderList(); }, 250);
  };
  on('note-changed', ({ contentOnly } = {}) => {
    if (!contentOnly) { clearTimeout(listDebounce); listDebounce = null; renderList(); return; }
    settleList();
  });
  on('lang-changed', () => {
    // The guide follows the language while nobody has written in it (0.9.4).
    if (disk.ok) {
      flushTitle();
      editor.flush();
      const changed = syncGuideLanguage(store, getLang());
      if (changed.includes(store.activeId)) { openNote(store.activeId); return; }
    }
    renderList();
  });

  /**
   * "⋯ -> Delete label" in the label search (0.9.3): the label leaves every
   * note, from the title and from the text. The open note is saved first and
   * shown again after, so what is on screen is what was written.
   */
  function deleteLabelEverywhere(label) {
    flushTitle();
    editor.flush();
    const strip = (html) => {
      const box = document.createElement('div');
      box.innerHTML = html;
      return removeTagChips(box, [label]) ? box.innerHTML : null;
    };
    const changed = store.deleteLabel(label, strip);
    if (changed.includes(store.activeId)) openNote(store.activeId);
    renderList();
    return changed.length;
  }

  openNote(store.activeId);
  // Opened by the recovery key: the lock it stood for is removed, and that is said.
  if (gate.cleared) window.dispatchEvent(new CustomEvent('nebula-toast', { detail: 'The lock was removed — set a new one in Settings' }));

  // Every other note, brought up to this version while the app is idle, after
  // the vault has been put aside (heal.js) — so a bug fixed here does not live
  // on in the notes nobody has opened since. Only for a vault that was read,
  // and only in the app, where there is a backup to make first.
  if (disk.ok && window.nebula?.storage?.backup) {
    const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(() => fn(), { timeout: 500 }) : setTimeout(fn, 0));
    setTimeout(() => {
      healVault(store, {
        backup: (label) => window.nebula.storage.backup(label),
        idle,
        skip: (note) => note.id === store.activeId,
      }).then((result) => {
        if (result.healed || result.refused.length || result.aborted) console.info('[nebula] notes brought up to', MARKUP_VERSION, result);
        if (result.healed) renderList();
      }).catch((err) => console.warn('[nebula] note repair stopped:', err?.message ?? err));
    }, 1500);
  }

  // The list's rows and the search read each note's first words from its
  // markup (plainSnippet → noteText), parsed once and cached by content. On a
  // big vault the first filter or list redraw paid that whole pass at once —
  // ten seconds over 785 notes in the stress run (perf, 2026-10-23). Warmed
  // here in the background while the app is idle, a few milliseconds a slice,
  // so nobody waits for it. New notes are parsed by their first redraw anyway.
  {
    const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(() => fn(null), 0));
    const notes = [...store.notes];
    let i = 0;
    const warm = (deadline) => {
      const left = () => (deadline && typeof deadline.timeRemaining === 'function') ? deadline.timeRemaining() : 8;
      while (i < notes.length && left() > 2) {
        try { plainSnippet(notes[i].content, 48); } catch { /* a snippet is a convenience */ }
        i += 1;
      }
      if (i < notes.length) idle(warm);
    };
    setTimeout(() => idle(warm), 1500);
  }

  // Notes that lost many pictures at once since the last start: asked about before anything is deleted (held-media.js).
  void askAboutHeldMedia({
    noteOf: (id) => store.get(id),
    openNote: (id) => openNote(id),
    // Written at the end of the note as it is on the disk now — what is typed is saved first — and the note shown.
    putBack: async (id, markup) => {
      await saveCurrent();
      const note = store.get(id);
      if (!note) return false;
      store.updateNote(id, { content: `${note.content ?? ''}${markup}` });
      openNote(id);
      return true;
    },
  });

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

  // "Open with Nebula" (0.9.4): the files the app was opened with — now, and
  // whenever another is handed to the running app — come in as File → Import
  // brings one: each a new note, the file itself untouched.
  let takingFiles = Promise.resolve();
  const takeHandedFiles = () => {
    takingFiles = takingFiles.then(async () => {
      const files = await window.nebula?.files?.take?.().catch(() => []);
      for (const res of files ?? []) await toolbar?.actions?.importFile?.(res);
    }).catch((err) => console.warn('[nebula] opening a handed file failed', err));
  };
  window.nebula?.files?.onOpen?.(takeHandedFiles);
  takeHandedFiles();

  // Last, and guarded: this is the only part of the app that loads third-party
  // pages, and a throw in it used to abort the rest of boot() — leaving no
  // toolbar, no notes and only a console line to say why.
  try {
    const ai = initAiPanel({ askText });
    // A click in an AI page never reaches this document, so a menu opened
    // over the panel (a tab's right-click, a note's or folder's ⋯) stayed
    // over the page (the owner, 0.9.3). Focus going into a page counts as a
    // click outside: every menu closes the way it does for one.
    const clickOutside = () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    // Up to Electron 33 a captured `focus` on the <webview> reached this
    // document; from Electron 44 only the window's `blur`, with the webview
    // left as the active element. Both are listened for; a blur that went to
    // another application (nothing here active) closes nothing.
    document.addEventListener('focus', (e) => { if (e.target?.tagName === 'WEBVIEW') clickOutside(); }, true);
    window.addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement?.tagName === 'WEBVIEW') clickOutside();
    }, 0));
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
