const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('friogest', {
  savePdf: o => ipcRenderer.invoke('savePdf', o),
  openExternal: u => ipcRenderer.invoke('openExternal', u),
  restart: () => ipcRenderer.invoke('restart'),
  printCupom: o => ipcRenderer.invoke('printCupom', o),
  escolherPasta: o => ipcRenderer.invoke('escolherPasta', o),
});
