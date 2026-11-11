/* 开发工具：本地 WebDAV 冒烟测试（不依赖外部网盘）
   用法：npx electron tools/webdav-smoke.js
   原理：启动一个最小的 WebDAV 服务 → 在 Electron 渲染进程中测试 连接 / 加密上传 / 云端恢复
*/
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { setupIpc } = require('../electron/ipc');

const port = 5199;
const baseDir = path.join(os.tmpdir(), 'novie-webdav-smoke');
fs.rmSync(baseDir, { recursive: true, force: true });
fs.mkdirSync(baseDir, { recursive: true });

function localPath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/dav\/?/, '');
  const full = path.join(baseDir, clean);
  if (!full.startsWith(baseDir)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  const filePath = localPath(req.url || '/');
  if (!filePath) { res.writeHead(403); res.end(); return; }
  if (req.method === 'MKCOL') {
    fs.mkdirSync(filePath, { recursive: true });
    res.writeHead(201); res.end(); return;
  }
  if (req.method === 'PROPFIND') {
    res.writeHead(207, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(`<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:"><D:response><D:href>/dav/</D:href>
<D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>
<D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`);
    return;
  }
  if (req.method === 'PUT') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.concat(chunks));
      res.writeHead(201); res.end();
    });
    return;
  }
  if (req.method === 'GET') {
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200); res.end(fs.readFileSync(filePath)); return;
  }
  res.writeHead(405); res.end();
});

const testProfile = path.join(os.tmpdir(), 'novie-electron-webdav-test');
fs.rmSync(testProfile, { recursive: true, force: true });
app.setPath('userData', testProfile);

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
    await new Promise(r => setTimeout(r, 3200));
    const result = await win.webContents.executeJavaScript(`
      (async () => {
        const app = window.__novie;
        const { sync, db } = window.__novieTest;
        app.settings.webdav = {
          url: 'http://127.0.0.1:${port}/dav',
          user: 'tester', pass: 'secret',
          dir: 'novie', filename: 'backup.noviebak',
          encrypt: true, password: 'wd-test-1234'
        };
        const test = await sync.webdavTest(app);
        const up = await sync.webdavUpload(app);
        const before = (await db.getAll('projects')).length;
        const restore = await sync.webdavRestore(app);
        const after = (await db.getAll('projects')).length;
        const fileBackup = await window.novie.writeBackup(
          ${JSON.stringify(path.join(baseDir, 'file-backup'))},
          'novie-test.novie',
          btoa('{"hello":"world"}')
        );
        return {
          test, up, restore, before, after, fileBackup,
          restoredName: app.state.project?.name,
          restoredChapters: app.state.chapters.length,
          bridge: Boolean(window.novie && window.novie.isDesktop)
        };
      })()
    `);
    const files = fs.existsSync(path.join(baseDir, 'novie'))
      ? fs.readdirSync(path.join(baseDir, 'novie')) : [];
    const uploadedSize = files.length
      ? fs.statSync(path.join(baseDir, 'novie', files[0])).size : 0;
    const fileBackupPath = path.join(baseDir, 'file-backup', 'novie-test.novie');
    const fileBackupBytes = fs.existsSync(fileBackupPath) ? fs.readFileSync(fileBackupPath, 'utf8') : null;
    console.log('WEBDAV_RESULT ' + JSON.stringify({ ...result, files, uploadedSize, fileBackupBytes }));
    const ok = result.test.ok && result.up.ok && result.restore.ok
      && result.after === result.before + 1 && fileBackupBytes === '{"hello":"world"}';
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('WEBDAV_ERROR', err);
    app.exit(1);
  } finally {
    server.close();
  }
});
