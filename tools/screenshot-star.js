/* 开发工具：截取桌面版“人物星图”页面
   用法：npx electron tools/screenshot-star.js docs/star-map.png
*/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const out = process.argv[2] || path.join(__dirname, '..', 'docs', 'star-map.png');
// 使用桌面版真实数据目录
app.setPath('userData', path.join(app.getPath('appData'), 'novie'));

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
      (async () => {
        const app = window.__novie;
        if (app.settings.theme !== 'paper') await app.saveSettings({ theme: 'paper' });
        app.state.charView = 'graph';
        if (app.state.view !== 'characters') await app.switchView('characters');
        else app.renderMain();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));
    const image = await win.webContents.capturePage();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, image.toPNG());
    console.log('SHOT_OK', out, image.getSize());
    app.exit(0);
  } catch (err) {
    console.error('SHOT_ERROR', err);
    app.exit(1);
  }
});
