// Minimal preload for the spike. Exposes runtime versions to the UI.
const { contextBridge } = require('electron')
contextBridge.exposeInMainWorld('smc', {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
})