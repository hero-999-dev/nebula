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
