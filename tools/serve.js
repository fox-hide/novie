/* 极简静态服务器：npm run serve → http://127.0.0.1:5178 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const port = Number(process.env.PORT) || 5178;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = path.normalize(path.join(root, urlPath === '/' ? 'index.html' : urlPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500); res.end('Server error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Novie 已启动：http://127.0.0.1:${port}`);
  console.log('提示：浏览器模式下数据存储在 IndexedDB；正式使用建议 npm start 启动桌面版。');
});
