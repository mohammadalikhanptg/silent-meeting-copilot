const { app, BrowserWindow, Tray, Menu, session, nativeImage, ipcMain } = require('electron');
const path = require('path');

// Engine URL — set via SMC_ENGINE_URL environment variable or falls back to production
const ENGINE_URL = process.env.SMC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';

let tray = null;
let win = null;
let isCapturing = false;

function createTrayIcon() {
  // 16x16 teal square icon (inline PNG as data URI to avoid needing an assets dir at launch)
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/' +
    '9hAAAABmJLR0QA/wD/AP+gvaeTAAAATElEQVQ4jWNgGAWkAkYGBob/DMT' +
    'pDAwMDCRohIGBgYGJgYGBiYGB4T8DA8N/Eqz/T4L1/0mw/j8J1v8nwfr/' +
    'JFj/nwTr/5Ng/X8SAAAh8gkJPOXfkwAAAABJRU5ErkJggg=='
  );
  tray = new Tray(icon);
  updateTrayMenu();
  tray.setToolTip('SMC Helper — idle');
}

function updateTrayMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: isCapturing ? 'Stop Capturing' : 'Start Capturing',
      click: () => {
        if (win) win.webContents.send('toggle-capture', !isCapturing);
      },
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        if (win) { win.show(); win.focus(); }
      },
    },
    { type: 'separator' },
    { label: 'Quit SMC Helper', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function createWindow() {
  win = new BrowserWindow({
    width: 540,
    height: 420,
    title: 'SMC Helper',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Allow WASAPI loopback without screen-capture UI.
  // On Windows, Electron's setDisplayMediaRequestHandler lets us attach
  // the window's own video frame + WASAPI loopback audio, bypassing the
  // screen-picker prompt entirely.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (request.frame) {
      callback({ video: request.frame, audio: 'loopback' });
    } else {
      callback({});
    }
  });

  win.loadFile('index.html');

  // Minimise to tray instead of closing
  win.on('close', (evt) => {
    evt.preventDefault();
    win.hide();
  });
}

// IPC: renderer tells main about capture state changes
ipcMain.on('capture-state', (_, capturing) => {
  isCapturing = capturing;
  tray.setToolTip(capturing ? 'SMC Helper — capturing' : 'SMC Helper — idle');
  updateTrayMenu();
});

// IPC: renderer requests engine URL
ipcMain.handle('get-config', () => ({ engineUrl: ENGINE_URL }));

app.whenReady().then(() => {
  createWindow();
  createTrayIcon();
});

// Prevent default quit when all windows close — we live in the tray
app.on('window-all-closed', (e) => e.preventDefault());
