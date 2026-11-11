/* 开发工具：启动桌面版并截图，用于文档
   用法：npx electron tools/screenshot.js docs/screenshot.png
*/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const out = process.argv[2] || path.join(__dirname, '..', 'docs', 'screenshot.png');
// 使用独立 profile，保证截到的是全新示例数据，不影响用户实际作品
const profile = path.join(os.tmpdir(), 'novie-screenshot-profile');
fs.rmSync(profile, { recursive: true, force: true });
app.setPath('userData', profile);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    show: false,
    backgroundColor: '#f4eee3',
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      offscreen: true,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await new Promise(r => setTimeout(r, 3200));
  try {
    await win.webContents.executeJavaScript(`
      (() => {
        if (window.__novie?.settings?.theme !== 'paper') window.__novie?.saveSettings({ theme: 'paper' });
        if (window.__novie?.state?.view !== 'write') window.__novie?.switchView('write');
      })()
    `);
    await new Promise(r => setTimeout(r, 900));
    const image = await win.webContents.capturePage();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, image.toPNG());
    console.log('SCREENSHOT_OK', out, image.getSize());
    app.exit(0);
  } catch (err) {
    console.error('SCREENSHOT_ERROR', err);
    app.exit(1);
  }
});
