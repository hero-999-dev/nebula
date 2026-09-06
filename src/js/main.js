import { initDiskStorage } from './disk-store.js';
import { NoteStore, plainSnippet, relativeTime } from './notes.js';
import { bindEditor } from './editor.js';
import { initTheme } from './theme.js';
import { on } from './bus.js';
import { initDock } from './dock.js';
import { initToolbar } from './toolbar.js';
import { initSlashMenu } from './slash-menu.js';
import { initShapes } from './shapes.js';
import { initCodeBlocks, paintAllCode } from './codeblock.js';
import { initAiPanel } from './ai-panel.js';
import { initDialog, askText } from './dialog.js';
import { injectIcons } from './icons.js';
import { initUpdater, showAppVersion } from './updater.js';
import { initAbout } from './about.js';

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

  // Seed the sample notes only for a vault we know is genuinely empty.
  const store = new NoteStore({ allowSeed: disk.ok && disk.empty });
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
  initAiPanel({ askText });
  initToolbar(editorEl, {
    onSave: () => { editor.flush(); setSaveState('saved'); },
  });
  initSlashMenu(editorEl);
  initShapes(editorEl);
  initCodeBlocks(editorEl);

  function renderList() {
    const notes = store.filter(listFilter);
    listEl.innerHTML = '';
    if (!notes.length) {
      listEl.innerHTML = '<div class="note-list-empty">No notes match</div>';
      return;
    }
    for (const note of notes) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `note-row${note.id === store.activeId ? ' active' : ''}`;
      row.innerHTML = '<div class="nr-title"></div><div class="nr-meta"></div>';
      row.children[0].textContent = note.title || 'Untitled';
      row.children[1].textContent = `${relativeTime(note.updatedAt)} · ${plainSnippet(note.content, 48) || 'Empty'}`;
      row.addEventListener('click', () => openNote(note.id));
      listEl.appendChild(row);
    }
  }

  function openNote(id) {
    editor.flush();
    store.setActive(id);
    const note = store.active();
    titleEl.value = note?.title ?? '';
    editor.load(note);
    paintAllCode(editorEl); // colors come back after a reload
    setSaveState('');
    renderList();
  }

  let titleTimer = null;
  titleEl.addEventListener('input', () => {
    setSaveState('saving');
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => {
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
    editor.flush();
    store.createNote('Untitled');
    openNote(store.activeId);
    titleEl.focus();
    titleEl.select();
  });

  initTheme($('theme-pick'));
  // The update button lives inside About: one place that answers "which build
  // is this, where is it, and is there a newer one".
  const checkButton = $('btn-check-updates');
  initUpdater({ checkButton });
  initAbout({ trigger: $('app-version'), checkButton });
  showAppVersion($('app-version'));
  on('note-changed', () => renderList());

  openNote(store.activeId);
}

boot().catch((err) => console.error('[nebula] boot failed', err));
