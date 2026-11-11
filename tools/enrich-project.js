/* 开发工具：把元数据（摘要/人物/设定/剧情线）写入桌面版已导入的书目
   用法：npx electron tools/enrich-project.js <enrich-data.json>
*/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { setupIpc } = require('../electron/ipc');

const dataPath = process.argv[2];
const port = 5198;

if (!dataPath) {
  console.error('用法: electron tools/enrich-project.js <enrich-data.json>');
  app.exit(2);
} else {
  app.setPath('userData', path.join(app.getPath('appData'), 'novie'));
  const server = http.createServer((req, res) => {
    if (req.url !== '/enrich.json') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(path.resolve(dataPath)).pipe(res);
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
          const data = await (await fetch('http://127.0.0.1:${port}/enrich.json', { cache: 'no-store' })).json();
          app.destroyEditor();
          app.state.activeChapter = null;
          app.state.chapterId = null;
          const res = await window.__novieTest.enrich.applyEnrichment(app, data);
          await app.loadProject(res.projectId);
          return {
            ...res,
            project: app.state.project.name,
            summary0: app.state.chapters[0]?.summary,
            summary49: app.state.chapters[49]?.summary,
            nonEmptySummaries: app.state.chapters.filter(c => c.summary).length,
            charNames: app.state.characters.slice(0, 5).map(c => c.name),
            loreCount: app.state.lore.length,
            plotlineCount: app.state.plotlines.length,
            nodeCount: app.state.plotnodes.length,
          };
        })()
      `);
      console.log('ENRICH_RESULT ' + JSON.stringify(result));
      await new Promise(r => setTimeout(r, 800));
      app.exit(result.chapters === 50 ? 0 : 1);
    } catch (err) {
      console.error('ENRICH_ERROR', err);
      app.exit(1);
    } finally {
      server.close();
    }
  });
}
