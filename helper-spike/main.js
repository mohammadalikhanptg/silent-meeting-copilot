// Silent Meeting Copilot - capture spike (main process)
// Proves: microphone + Windows system loopback as two independent streams.
const { app, BrowserWindow, session } = require('electron')
const path = require('path')

function createWindow () {
  const win = new BrowserWindow({
    width: 900,
    height: 620,
    title: 'SMC Capture Spike',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Grant system audio loopback when the renderer calls getDisplayMedia.
  // We attach the (unused) video to the app's OWN frame rather than a screen
  // source. This satisfies getDisplayMedia without triggering Windows monitor
  // capture (WGC), which was failing with access-denied on this machine.
  // The renderer stops the video track immediately and keeps only the
  // loopback audio (the default output device mix), with no screen-share prompt.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (request.frame) {
      callback({ video: request.frame, audio: 'loopback' })
    } else {
      callback({})
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})