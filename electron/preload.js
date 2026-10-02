import { contextBridge, ipcRenderer, webFrame } from 'electron';

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
  spell: {
    replace: (word) => ipcRenderer.invoke('spell:replace', word),
    add: (word) => ipcRenderer.invoke('spell:add', word),
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
