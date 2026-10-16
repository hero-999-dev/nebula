import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron';

contextBridge.exposeInMainWorld('nebula', {
  platform: process.platform,
  links: { title: (url) => ipcRenderer.invoke('links:title', url), videoPoster: (url) => ipcRenderer.invoke('links:video-poster', url) },
  // Real size (0.9.3): the zoom that makes a CSS millimetre a real one on this
  // screen, and the window's own zoom (Ctrl + / Ctrl −) it is corrected for.
  display: { realScale: () => ipcRenderer.invoke('display:real-scale'), windowZoom: () => webFrame.getZoomFactor() },
  version: () => ipcRenderer.invoke('app:version'),
  paths: () => ipcRenderer.invoke('app:paths'),
  // Reveal takes a key ('exeDir' | 'userData' | 'storage' | 'backups'), not a
  // path — the renderer cannot ask the main process to open anything else.
  reveal: (key) => ipcRenderer.invoke('app:reveal', key),
  storage: {
    read: (rel) => ipcRenderer.invoke('storage:read', rel),
    write: (rel, content) => ipcRenderer.invoke('storage:write', rel, content),
    list: (relDir) => ipcRenderer.invoke('storage:list', relDir),
    remove: (rel) => ipcRenderer.invoke('storage:delete', rel),
    reveal: (rel) => ipcRenderer.invoke('storage:reveal', rel),
    root: () => ipcRenderer.invoke('storage:root'),
    // A labelled copy of the vault, taken before every note is repaired (heal.js).
    backup: (label) => ipcRenderer.invoke('storage:backup', label),
  },
  lifecycle: {
    onSave: (fn) => {
      const handler = async (_event, requestId) => {
        try {
          await fn();
          ipcRenderer.send('lifecycle:saved', { requestId, ok: true });
        } catch (error) {
          ipcRenderer.send('lifecycle:saved', {
            requestId, ok: false, error: error?.message ?? String(error),
          });
        }
      };
      ipcRenderer.on('lifecycle:save', handler);
      void ipcRenderer.invoke('lifecycle:ready');
      return () => ipcRenderer.off('lifecycle:save', handler);
    },
  },
  // The app draws its own File/Edit/View/Window/Help beside the logo, so it
  // needs what the native menu roles used to do. Each call acts on the window
  // that sent it — the renderer cannot name another one.
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    fullscreen: () => ipcRenderer.invoke('window:fullscreen'),
    snapshot: () => ipcRenderer.invoke('window:snapshot'),
    onSnapshot: (handler) => {
      const listener = (_e, result) => handler(result);
      ipcRenderer.on('window:snapshot-taken', listener);
      return () => ipcRenderer.off('window:snapshot-taken', listener);
    },
    state: () => ipcRenderer.invoke('window:state'),
    overlay: (colors) => ipcRenderer.invoke('window:overlay', colors),
    onChanged: (fn) => {
      const handler = (_e, state) => fn(state);
      ipcRenderer.on('window:changed', handler);
      return () => ipcRenderer.off('window:changed', handler);
    },
  },
  view: {
    // 'in' | 'out' | 'reset'; always this window, never a focused webview guest.
    zoom: (how) => ipcRenderer.invoke('view:zoom', how),
    devtools: () => ipcRenderer.invoke('view:devtools'),
  },
  // Right-click (0.9.3): what was under the pointer arrives from the main
  // process, which alone knows what the spellchecker found.
  contextMenu: {
    on: (fn) => {
      const handler = (_e, facts) => fn(facts);
      ipcRenderer.on('ui:context-menu', handler);
      return () => ipcRenderer.off('ui:context-menu', handler);
    },
  },
  // "Open with Nebula" (0.9.4): the files the app was opened with, each handed
  // over once, read the way File → Import reads one.
  files: {
    take: () => ipcRenderer.invoke('files:take'),
    onOpen: (fn) => {
      const handler = () => fn();
      ipcRenderer.on('files:open', handler);
      return () => ipcRenderer.off('files:open', handler);
    },
  },
  // Black holes (0.9.4): notes kept encrypted. The keys stay in the main
  // process; the window is handed the notes of a black hole while it is open.
  holes: {
    list: () => ipcRenderer.invoke('holes:list'),
    create: (how) => ipcRenderer.invoke('holes:create', how),
    unlock: (id, by) => ipcRenderer.invoke('holes:unlock', id, by),
    lock: (id) => ipcRenderer.invoke('holes:lock', id),
    lockAll: () => ipcRenderer.invoke('holes:lock-all'),
    write: (id, noteId, json) => ipcRenderer.invoke('holes:write', id, noteId, json),
    remove: (id, noteId) => ipcRenderer.invoke('holes:remove', id, noteId),
    rename: (id, name) => ipcRenderer.invoke('holes:rename', id, name),
    addVideo: (id, noteId, source) => ipcRenderer.invoke('holes:add-video', id, noteId, String(source ?? '')),
    addFile: (id, noteId, source) => ipcRenderer.invoke('holes:add-file', id, noteId, String(source ?? '')),
    importVideo: (id, noteId, file) => ipcRenderer.invoke('holes:import-video', id, noteId, file),
    exportVideo: (id, noteId, file) => ipcRenderer.invoke('holes:export-video', id, noteId, file),
    changePin: (id, pin) => ipcRenderer.invoke('holes:change-pin', id, pin),
    setHint: (id, hint) => ipcRenderer.invoke('holes:hint', id, String(hint ?? '')),
    trash: (id) => ipcRenderer.invoke('holes:trash', id),
    restore: (id) => ipcRenderer.invoke('holes:restore', id),
    // Deleted only with its answer: its PIN, its passkey or its recovery key.
    delete: (id, by) => ipcRenderer.invoke('holes:delete', id, by),
    prove: (id, by) => ipcRenderer.invoke('holes:prove', id, by),
    passkey: (id, on) => ipcRenderer.invoke('holes:passkey', id, on === true),
  },
  // The logo in colours of one's own (0.9.4, app-logo.js): the five colours, and
  // the logo drawn in each size an icon holds, as PNG data addresses.
  logo: {
    get: () => ipcRenderer.invoke('logo:get'),
    set: (colors, images) => ipcRenderer.invoke('logo:set', colors, images),
    clear: () => ipcRenderer.invoke('logo:clear'),
    // A shortcut to this copy on the desktop, wearing the logo.
    shortcut: () => ipcRenderer.invoke('logo:shortcut'),
  },
  // The lock on opening the app (0.9.4, app-lock.js): set in Settings, asked for
  // before the window shows anything. A PIN goes to the main process and no further.
  lock: {
    state: (what) => ipcRenderer.invoke('lock:state', what?.hello === true ? { hello: true } : {}),
    set: (how) => ipcRenderer.invoke('lock:set', how),
    unlock: (by) => ipcRenderer.invoke('lock:unlock', by),
    clear: (by) => ipcRenderer.invoke('lock:clear', by),
    turn: (on, by) => ipcRenderer.invoke('lock:turn', on === true, by),
    passkey: (on, by) => ipcRenderer.invoke('lock:passkey', on === true, by),
    now: () => ipcRenderer.invoke('lock:now'),
  },
  // A video file dropped into a note (0.9.4): where the dropped file lies, and
  // its copy into the note's own folder. The answer is the address the note shows it from.
  media: {
    pathOf: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } },
    // The pictures a note names, written into its markup — where the picture itself is needed.
    inline: (html) => ipcRenderer.invoke('media:inline', String(html ?? '')),
    inlineSync: (html) => ipcRenderer.sendSync('media:inline-sync', String(html ?? '')),
    dataUrl: (url) => ipcRenderer.invoke('media:data-url', String(url ?? '')),
    addVideo: (noteId, source) => ipcRenderer.invoke('media:add-video', String(noteId ?? ''), String(source ?? '')),
    pickVideo: () => ipcRenderer.invoke('media:pick-video'),
    openOutside: (url) => ipcRenderer.invoke('media:open-outside', String(url ?? '')),
    // A file attached to a note (0.9.6, file-attach.js): copied in, chosen,
    // saved out as a copy, or opened as a copy by its own program.
    addFile: (noteId, source) => ipcRenderer.invoke('media:add-file', String(noteId ?? ''), String(source ?? '')),
    pickFiles: () => ipcRenderer.invoke('media:pick-files'),
    saveFile: (url, name) => ipcRenderer.invoke('media:save-file', String(url ?? ''), String(name ?? '')),
    openFile: (url, name) => ipcRenderer.invoke('media:open-file', String(url ?? ''), String(name ?? '')),
    forgetFile: (url) => ipcRenderer.invoke('media:forget-file', String(url ?? '')),
    // A copy made for a note the window has left meanwhile: gone at the next start, unasked (hunt B18).
    releaseAdded: (noteId, url) => ipcRenderer.invoke('media:release-added', String(noteId ?? ''), String(url ?? '')),
    // A card pasted from another note: its file copied into this note at once (B4).
    adoptFile: (noteId, hole, url) => ipcRenderer.invoke('media:adopt-file', String(noteId ?? ''), hole == null ? null : String(hole), String(url ?? '')),
    // Notes that lost many pictures at once: kept until the person answers (held-media.js).
    held: () => ipcRenderer.invoke('media:held'),
    dropHeld: (id) => ipcRenderer.invoke('media:drop-held', String(id ?? '')),
    takeHeld: (id) => ipcRenderer.invoke('media:take-held', String(id ?? '')),
  },
  // An AI tab's own session — cookies, site storage, cache — cleared (0.9.4).
  // By the tab's id, never a path or a partition name.
  ai: {
    clearSession: (id) => ipcRenderer.invoke('ai:clear-session', String(id ?? '')),
    // A key was pressed in a tab: which view, and whether it was Enter. Never the key (0.9.4).
    onTyped: (fn) => {
      const handler = (_e, what) => fn({ wc: Number(what?.wc), enter: what?.enter === true });
      ipcRenderer.on('ai:typed', handler);
      return () => ipcRenderer.off('ai:typed', handler);
    },
  },
  // Paste from a menu (0.9.4): 'rich' as Ctrl+V does it, 'plain' the words only.
  edit: {
    paste: (how) => ipcRenderer.invoke('edit:paste', how === 'plain' ? 'plain' : 'rich'),
  },
  spell: {
    replace: (word) => ipcRenderer.invoke('spell:replace', word),
    add: (word) => ipcRenderer.invoke('spell:add', word),
    ignore: (word) => ipcRenderer.invoke('spell:ignore', word),
    language: (lang) => ipcRenderer.invoke('spell:language', lang),
  },
  clipboard: {
    image: (payload) => ipcRenderer.invoke('clipboard:image', payload),
  },
  quit: () => ipcRenderer.invoke('app:quit'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  // Export writes where the user points in the save dialog; the renderer never
  // names a path. Import only reads bytes back — parsing and sanitising happen
  // in the renderer, where the note format is understood.
  note: {
    export: (payload) => ipcRenderer.invoke('note:export', payload),
    pdf: (payload) => ipcRenderer.invoke('note:pdf', payload),
    // The export preview (0.9.3): made, saved as previewed, or put away.
    pdfPreview: (payload) => ipcRenderer.invoke('note:pdf-preview', payload),
    pdfSave: (payload) => ipcRenderer.invoke('note:pdf-save', payload),
    pdfDiscard: (token) => ipcRenderer.invoke('note:pdf-discard', token),
    print: (opts) => ipcRenderer.invoke('note:print', opts ?? {}),
    import: () => ipcRenderer.invoke('note:import'),
  },
  updates: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    open: () => ipcRenderer.invoke('update:open'),
    // Only the status payload crosses the bridge — never the event object.
    onStatus: (fn) => {
      const handler = (_e, status) => fn(status);
      ipcRenderer.on('update:status', handler);
      return () => ipcRenderer.off('update:status', handler);
    },
  },
});
