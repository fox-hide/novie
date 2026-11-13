const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

function extFilter(filename) {
  const ext = path.extname(filename || '').replace('.', '').toLowerCase();
  if (!ext) return [];
  const map = {
    txt: [{ name: '文本文件', extensions: ['txt'] }],
    md: [{ name: 'Markdown', extensions: ['md'] }],
    docx: [{ name: 'Word 文档', extensions: ['docx'] }],
    zip: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
    novie: [{ name: 'Novie 工程', extensions: ['novie'] }],
    noviebak: [{ name: 'Novie 加密备份', extensions: ['noviebak'] }],
    json: [{ name: 'JSON', extensions: ['json'] }],
    pdf: [{ name: 'PDF', extensions: ['pdf'] }],
  };
  return map[ext] || [{ name: '文件', extensions: [ext] }];
}

function mimeOf(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  const map = {
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip', '.pdf': 'application/pdf', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  };
  return map[ext] || 'application/octet-stream';
}

function httpRequest(method, url, headers = {}, bodyBuffer = null, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('重定向次数过多'));
    let parsed;
    try { parsed = new URL(url); } catch { return reject(new Error('WebDAV 地址格式不正确')); }
    if (!/^https?:$/.test(parsed.protocol)) return reject(new Error('仅支持 http/https'));
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers,
      timeout: 45000,
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        const nextMethod = res.statusCode === 303 ? 'GET' : method;
        httpRequest(nextMethod, next, headers, nextMethod === 'GET' ? null : bodyBuffer, redirects + 1)
          .then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 300 * 1024 * 1024) {
          req.destroy(new Error('文件超过 300MB 限制'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          headers: res.headers,
          body: buf.toString('base64'),
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

/** 校验 IPC 调用来自应用自身的顶层主框架。 */
function isTrustedSender(event) {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    return Boolean(win && event.senderFrame && event.senderFrame === win.webContents.mainFrame);
  } catch {
    return false;
  }
}

/** 注册文件保存/打开、备份目录、WebDAV 等 IPC。 */
function setupIpc() {
  ipcMain.handle('save-file', async (event, filename, base64, filters) => {
    if (!isTrustedSender(event)) throw new Error('IPC 调用来源不受信任');
    const win = BrowserWindow.fromWebContents(event.sender);
    const safeName = String(filename || 'novie-export').replace(/[\\/:*?"<>|]/g, '_');
    const result = await dialog.showSaveDialog(win, {
      title: '保存文件',
      defaultPath: path.join(app.getPath('documents'), safeName),
      filters: (Array.isArray(filters) && filters.length ? filters : extFilter(safeName)),
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.promises.writeFile(result.filePath, Buffer.from(base64 || '', 'base64'));
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('open-file', async (event, filters) => {
    if (!isTrustedSender(event)) throw new Error('IPC 调用来源不受信任');
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: '打开文件',
      properties: ['openFile'],
      filters: (Array.isArray(filters) && filters.length
        ? filters
        : [{ name: 'Novie 工程 / 备份', extensions: ['novie', 'noviebak', 'json', 'txt', 'md'] }]),
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filePath = result.filePaths[0];
    const buf = await fs.promises.readFile(filePath);
    return {
      canceled: false,
      name: path.basename(filePath),
      data: buf.toString('base64'),
      mime: mimeOf(filePath),
      filePath,
    };
  });

  ipcMain.handle('pick-directory', async event => {
    if (!isTrustedSender(event)) throw new Error('IPC 调用来源不受信任');
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: '选择自动备份文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('write-backup', async (event, dir, filename, base64) => {
    if (!isTrustedSender(event)) throw new Error('IPC 调用来源不受信任');
    if (!dir || typeof dir !== 'string') throw new Error('备份目录无效');
    const safeName = String(filename || 'novie-backup.novie').replace(/[\\/:*?"<>|]/g, '_');
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, safeName);
    await fs.promises.writeFile(filePath, Buffer.from(base64 || '', 'base64'));
    // 只保留最近 10 份 Novie 自动备份，避免无限增长
    try {
      const entries = await fs.promises.readdir(dir);
      const ours = entries
        .filter(name => /^novie-.*\.novie$/i.test(name))
        .map(name => {
          const full = path.join(dir, name);
          return { full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      for (const item of ours.slice(10)) {
        await fs.promises.unlink(item.full).catch(() => {});
      }
    } catch { /* 清理失败不影响备份 */ }
    return { filePath };
  });

  ipcMain.handle('webdav', async (event, { method, url, headers, body }) => {
    if (!isTrustedSender(event)) throw new Error('IPC 调用来源不受信任');
    const bodyBuffer = body ? Buffer.from(body, 'base64') : null;
    const finalHeaders = { ...(headers || {}) };
    if (bodyBuffer) finalHeaders['Content-Length'] = String(bodyBuffer.length);
    finalHeaders['User-Agent'] = 'Novie/1.0';
    return httpRequest(String(method || 'GET').toUpperCase(), String(url), finalHeaders, bodyBuffer);
  });
}

module.exports = { setupIpc };
