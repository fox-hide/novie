const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const { setupIpc } = require('./ipc');

const isDev = !app.isPackaged;
const smokeTest = process.argv.includes('--smoke-test');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 680,
    title: 'Novie',
    backgroundColor: '#f4eee3',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  if (isDev && process.env.NOVIE_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  if (smokeTest) {
    win.webContents.on('console-message', event => {
      if (event && event.level === 'error') console.log('[renderer]', event.message);
    });
    win.webContents.on('did-finish-load', async () => {
      await new Promise(resolve => setTimeout(resolve, 2600));
      try {
        const result = await win.webContents.executeJavaScript(`(() => {
          const app = window.__novie;
          return {
            ready: Boolean(app && app.state && app.state.ready),
            view: app && app.state.view,
            project: app && app.state.project && app.state.project.name,
            chapters: app ? app.state.chapters.length : 0,
            editor: Boolean(document.getElementById('main-editor')),
            desktopBridge: Boolean(window.novie && window.novie.isDesktop)
          };
        })()`);
        console.log('SMOKE_RESULT ' + JSON.stringify(result));
        app.exit(result.ready && result.editor ? 0 : 1);
      } catch (err) {
        console.error('SMOKE_ERROR', err);
        app.exit(1);
      }
    });
  }
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.novie.writer');
    setupIpc();
    Menu.setApplicationMenu(null);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
