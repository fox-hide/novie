const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('novie', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  saveFile: (filename, base64, filters) => ipcRenderer.invoke('save-file', filename, base64, filters),
  openFile: (filters) => ipcRenderer.invoke('open-file', filters),
  pickDirectory: () => ipcRenderer.invoke('pick-directory'),
  writeBackup: (dir, filename, base64) => ipcRenderer.invoke('write-backup', dir, filename, base64),
  webdav: (payload) => ipcRenderer.invoke('webdav', payload),
});
