const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smc', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setCaptureState: (capturing) => ipcRenderer.send('capture-state', capturing),
  onToggleCapture: (cb) => ipcRenderer.on('toggle-capture', (_, val) => cb(val)),
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
