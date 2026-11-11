/* 开发工具：把 Novie 工程包导入桌面版真实数据目录
   用法：npx electron tools/import-bundle.js <bundle.json> [expectedProjectName]
*/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { setupIpc } = require('../electron/ipc');

const bundlePath = process.argv[2];
const expectedName = process.argv[3] || '';
const port = 5197;

if (!bundlePath) {
  console.error('用法: electron tools/import-bundle.js <bundle.json> [expectedProjectName]');
  app.exit(2);
} else {
  // 与正式应用使用同一个 userData（Windows 大小写不敏感）
  app.setPath('userData', path.join(app.getPath('appData'), 'novie'));

  const server = http.createServer((req, res) => {
    if (req.url !== '/bundle.json') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(path.resolve(bundlePath)).pipe(res);
  });

  app.whenReady().then(async () => {
    setupIpc();
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'electron', 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        offscreen: true,
      },
    });
    try {
      await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'), { query: { debug: '1' } });
      await new Promise(r => setTimeout(r, 3000));
      const result = await win.webContents.executeJavaScript(`
        (async () => {
          const app = window.__novie;
          const { db } = window.__novieTest;
          const existing = app.state.projects.find(p => p.name === ${JSON.stringify(expectedName || '')});
          if (existing) {
            await app.loadProject(existing.id);
            return { skipped: true, id: existing.id, name: existing.name, chapters: app.state.chapters.length };
          }
          const res = await fetch('http://127.0.0.1:${port}/bundle.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('bundle fetch failed: ' + res.status);
          const bundle = await res.json();
          const project = await db.importProjectBundle(bundle, { nameSuffix: '' });
          app.state.projects = await db.getAll('projects');
          await app.loadProject(project.id);
          return {
            skipped: false,
            id: project.id,
            name: app.state.project.name,
            chapters: app.state.chapters.length,
            volumes: app.state.volumes.length,
            words: app.projectWordCount(),
            last: app.state.chapters[app.state.chapters.length - 1]?.title
          };
        })()
      `);
      console.log('IMPORT_RESULT ' + JSON.stringify(result));
      await new Promise(r => setTimeout(r, 800));
      app.exit(result.chapters > 0 ? 0 : 1);
    } catch (err) {
      console.error('IMPORT_ERROR', err);
      app.exit(1);
    } finally {
      server.close();
    }
  });
}
