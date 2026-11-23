const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('friogest', {
  titleBar: true,
  savePdf: o => ipcRenderer.invoke('savePdf', o),
  openExternal: u => ipcRenderer.invoke('openExternal', u),
  restart: () => ipcRenderer.invoke('restart'),
  printCupom: o => ipcRenderer.invoke('printCupom', o),
  escolherPasta: o => ipcRenderer.invoke('escolherPasta', o),
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: cb => ipcRenderer.on('update:status', (_, s) => cb(s)),
  },
});
