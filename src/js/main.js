import { initDiskStorage } from './disk-store.js';
import { NoteStore, plainSnippet, relativeTime } from './notes.js';
import { GUIDE_NOTE, GUIDE_VERSION, addGuide } from './seed-notes.js';
import { bindEditor } from './editor.js';
import { initTheme } from './theme.js';
import { on } from './bus.js';
import { initDock } from './dock.js';
import { initToolbar } from './toolbar.js';
import { initSlashMenu } from './slash-menu.js';
import { initShapes } from './shapes.js';
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
  const store = new NoteStore({ allowSeed: disk.ok && disk.empty });
  // When the guide is genuinely new to this vault, open it — otherwise the one
  // note the user was told to look at is the one they never see.
  if (disk.ok && store.ensureGuide(GUIDE_NOTE, GUIDE_VERSION)) {
    store.setActive(store.notes[0].id);
  }
  const titleEl = $('title');
  const saveEl = $('savestate');
  const listEl = $('note-list');
  const filterEl = $('side-filter');
  const editorEl = $('editor');

  let listFilter = '';

  function setSaveState(state) {
    saveEl.textContent = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : '';
    saveEl.classList.toggle('saving', state === 'saving');
  }

  const editor = bindEditor(editorEl, store, setSaveState);

  initDock();
  // The app's own undo stack. Everything that edits the note by script
  // announces itself to this first; Chromium's stack cannot see any of it.
  const history = initHistory(editorEl, {
    onRestore: () => {
      // A restored snapshot is just markup — code blocks and equations are
      // painted from their stored source, the same as when a note opens.
      paintAllCode(editorEl);
      paintAllEquations(editorEl);
      shapes?.reset();
      editor.flush();
      renderList();
    },
  });
  // Shapes first: the toolbar's shape buttons go through this controller so a
  // new shape arrives selected, with its colour bar already open.
  const shapes = initShapes(editorEl, { history });
  const toolbar = initToolbar(editorEl, {
    shapes,
    history,
    onSave: () => { editor.flush(); setSaveState('saved'); },
    noteTitle: () => store.active()?.title ?? '',
    // An imported file becomes a new note, never an edit to the open one.
    onImport: ({ title, content }) => {
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
  initSlashMenu(editorEl, { history, shapes });
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
    titleEl.value = note?.title ?? '';
    titleEl.disabled = !note;
    editor.load(note);
    // Both are regenerated from their stored source, never trusted from the
    // saved HTML — and the shape bar belongs to a note that is now gone.
    paintAllCode(editorEl);
    paintAllEquations(editorEl);
    shapes?.reset();
    history?.reset(); // this note's history is not the next note's
    find?.close();    // its ranges point into the note that just closed
    setSaveState('');
    renderList();
  }

  let titleTimer = null;

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
    titleTimer = null;
    if (!store.active()) return;
    store.updateActive({ title: titleEl.value || 'Untitled' });
  }

  titleEl.addEventListener('input', () => {
    setSaveState('saving');
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => {
      titleTimer = null;
      store.updateActive({ title: titleEl.value || 'Untitled' });
      setSaveState('saved');
      renderList();
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
  menu = initAppMenu({
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
  on('note-changed', () => renderList());

  openNote(store.activeId);

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
