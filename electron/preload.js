import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nebula', {
  platform: process.platform,
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
  },
  // The app draws its own File/Edit/View/Window/Help beside the logo, so it
  // needs what the native menu roles used to do. Each call acts on the window
  // that sent it — the renderer cannot name another one.
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    fullscreen: () => ipcRenderer.invoke('window:fullscreen'),
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
  quit: () => ipcRenderer.invoke('app:quit'),
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
