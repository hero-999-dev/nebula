import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nebula', {
  platform: process.platform,
  version: () => ipcRenderer.invoke('app:version'),
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
