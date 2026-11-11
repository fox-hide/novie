/* Novie — 备份与 WebDAV 同步 */

import {
  exportProjectBundle, saveBackupSnapshot, setApp, importProjectBundle, getAll,
} from './db.js';
import { isDesktop, uint8ToBase64, base64ToUint8, safeFileName } from './utils.js';
import { toast } from './ui.js';
import { isEncryptedBackup, decryptBackup, encryptJson } from './exporters.js';

export async function createInternalBackup(app, { silent = false } = {}) {
  if (!app.state.project) return null;
  const bundle = await exportProjectBundle(app.state.project.id, { includeVersions: false });
  const record = await saveBackupSnapshot(app.state.project.id, bundle);
  app.settings.lastAutoBackupAt = Date.now();
  await setApp('settings', app.settings);
  app.logHealth?.('backup', '内部快照');
  if (!silent) toast('已在本地创建备份快照', 'success', 2200);
  return record;
}

export async function maybeAutoBackup(app) {
  if (!app.state.project || !app.state.ready) return;
  const now = Date.now();
  const interval = Math.max(10, Number(app.settings.backupIntervalMin) || 30) * 60 * 1000;
  if (now - (app.settings.lastAutoBackupAt || 0) >= interval) {
    try {
      await createInternalBackup(app, { silent: true });
      if (app.state.view === 'settings' || app.state.view === 'export') app.renderMain();
    } catch (err) {
      console.warn('内部备份失败', err);
    }
  }
  if (isDesktop() && app.settings.autoFileBackup && app.settings.backupDir
    && now - (app.settings.lastFileBackupAt || 0) >= interval) {
    try {
      await writeFileBackup(app, { silent: true });
      app.settings.lastFileBackupAt = now;
      await setApp('settings', app.settings);
    } catch (err) {
      console.warn('文件备份失败', err);
    }
  }
}

export async function writeFileBackup(app, { silent = false } = {}) {
  if (!app.state.project) return null;
  const dir = app.settings.backupDir;
  if (!dir) {
    if (!silent) toast('请先选择自动备份文件夹', 'warn');
    return null;
  }
  if (!isDesktop() || !window.novie.writeBackup) {
    if (!silent) toast('自动文件备份仅桌面版支持；浏览器模式请手动导出', 'warn', 3400);
    return null;
  }
  const bundle = await exportProjectBundle(app.state.project.id, { includeVersions: false });
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  const stamp = new Date();
  const pad = n => String(n).padStart(2, '0');
  const name = `novie-${safeFileName(app.state.project.name)}-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.novie`;
  const res = await window.novie.writeBackup(dir, name, uint8ToBase64(bytes));
  app.logHealth?.('backup', '文件备份');
  if (!silent) toast(`备份已写入：${res?.filePath || name}`, 'success', 3200);
  return res;
}

/* ---------------- WebDAV ---------------- */

function basicAuth(user, pass) {
  const raw = `${user || ''}:${pass || ''}`;
  return `Basic ${uint8ToBase64(new TextEncoder().encode(raw))}`;
}

function wdSettings(app) {
  const wd = app.settings.webdav || {};
  return {
    url: (wd.url || '').trim().replace(/\/+$/, ''),
    user: wd.user || '',
    pass: wd.pass || '',
    dir: (wd.dir || 'novie').replace(/^\/+|\/+$/g, ''),
    filename: wd.filename || 'novie-backup.noviebak',
    encrypt: wd.encrypt !== false,
    password: wd.password || '',
  };
}

async function request(app, method, url, { headers = {}, body = null } = {}) {
  const wd = wdSettings(app);
  const finalHeaders = { ...headers };
  if (wd.user || wd.pass) finalHeaders.Authorization = basicAuth(wd.user, wd.pass);
  if (isDesktop() && window.novie.webdav) {
    return window.novie.webdav({
      method,
      url,
      headers: finalHeaders,
      body: body ? uint8ToBase64(body) : null,
    });
  }
  try {
    const res = await fetch(url, { method, headers: finalHeaders, body });
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      status: res.status,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
      body: uint8ToBase64(buf),
    };
  } catch (err) {
    throw new Error(`网络请求失败（浏览器模式可能受 CORS 限制，建议使用桌面版）：${err.message || err}`);
  }
}

function wdTarget(wd, filename) {
  const dirPath = wd.dir.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const name = filename || wd.filename;
  return `${wd.url}${dirPath ? '/' + dirPath : ''}/${encodeURIComponent(name)}`;
}

function wdDirTarget(wd) {
  const dirPath = wd.dir.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${wd.url}${dirPath ? '/' + dirPath : ''}/`;
}

/** 云端文件名：前缀-书名-时间戳，永不覆盖旧备份。 */
function uploadFileName(wd, projectName) {
  const stamp = stampName();
  const ext = wd.encrypt ? 'noviebak' : 'novie';
  const base = String(wd.filename || 'novie-backup').replace(/\.(noviebak|novie)$/i, '') || 'novie-backup';
  const book = safeFileName(String(projectName || '')).slice(0, 40);
  return `${base}-${book ? book + '-' : ''}${stamp}.${ext}`;
}

function ensureConfigured(app) {
  const wd = wdSettings(app);
  if (!wd.url) throw new Error('请先填写 WebDAV 地址');
  if (!/^https?:\/\//i.test(wd.url)) throw new Error('WebDAV 地址必须以 http:// 或 https:// 开头');
  return wd;
}

async function ensureDir(app, wd) {
  // 逐级 MKCOL：409 表示上级目录缺失（按顺序创建后不应出现），405 通常表示目录已存在。
  // 3xx 表示重定向异常（主进程已跟随过重定向，到这里说明缺 Location），视为失败。
  const parts = wd.dir.split('/').filter(Boolean);
  let acc = wd.url.replace(/\/+$/, '');
  for (const part of parts) {
    acc += '/' + encodeURIComponent(part);
    const mk = await request(app, 'MKCOL', `${acc}/`);
    if (mk.status >= 300 && mk.status < 400) {
      throw new Error(`创建备份目录失败：服务器返回 HTTP ${mk.status}（重定向未完成）`);
    }
    if (![201, 200, 204, 405, 409].includes(mk.status)) {
      console.warn('MKCOL 状态', mk.status);
    }
  }
}

export async function webdavTest(app) {
  try {
    const wd = ensureConfigured(app);
    await ensureDir(app, wd);
    const res = await request(app, 'PROPFIND', wdDirTarget(wd), {
      headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      body: new TextEncoder().encode('<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>'),
    });
    if (res.status === 207 || res.status === 200) {
      return { ok: true, message: `连接成功（HTTP ${res.status}）` };
    }
    const text = res.body ? new TextDecoder().decode(base64ToUint8(res.body)).slice(0, 160) : '';
    return {
      ok: false,
      message: `服务器返回 HTTP ${res.status}${text ? '：' + text.replace(/\s+/g, ' ') : ''}`,
      status: res.status,
    };
  } catch (err) {
    return { ok: false, message: err.message || String(err) };
  }
}

function stampName() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** 列出云端目录中的 Novie 备份文件，按时间戳倒序（无时间戳的旧文件视为最早）。 */
async function listRemoteFiles(app, wd) {
  const res = await request(app, 'PROPFIND', wdDirTarget(wd), {
    headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    body: new TextEncoder().encode('<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>'),
  });
  if (res.status !== 207 && res.status !== 200) {
    throw new Error(`列目录失败：HTTP ${res.status}`);
  }
  const xmlText = res.body ? new TextDecoder().decode(base64ToUint8(res.body)) : '';
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const hrefs = Array.from(doc.getElementsByTagNameNS('DAV:', 'href')).map(n => n.textContent || '');
  const files = [];
  for (const href of hrefs) {
    const decoded = decodeURIComponent((href.split('/').filter(Boolean).pop() || ''));
    if (/\.(noviebak|novie)$/i.test(decoded)) {
      const stamp = (decoded.match(/(\d{8}-\d{4})/) || [])[1] || '';
      files.push({ name: decoded, stamp });
    }
  }
  files.sort((a, b) => (b.stamp || '0').localeCompare(a.stamp || '0'));
  return files;
}

export async function webdavUpload(app) {
  try {
    const wd = ensureConfigured(app);
    if (wd.encrypt && !wd.password) throw new Error('已开启加密上传，请先设置备份密码');
    await ensureDir(app, wd);
    const bundle = await exportProjectBundle(app.state.project.id, { includeVersions: false });
    bundle.project.name = app.state.project.name;
    let bytes;
    if (wd.encrypt) {
      bytes = await encryptJson(bundle, wd.password);
    } else {
      bytes = new TextEncoder().encode(JSON.stringify(bundle));
    }
    const name = uploadFileName(wd, app.state.project.name);
    const res = await request(app, 'PUT', wdTarget(wd, name), {
      headers: { 'Content-Type': wd.encrypt ? 'application/octet-stream' : 'application/json; charset=utf-8' },
      body: bytes,
    });
    // 只把 2xx 视为成功：3xx 到这里说明重定向没有被正确跟随
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, message: `上传失败：HTTP ${res.status}` };
    }
    app.settings.webdav = { ...app.settings.webdav, lastUploadAt: Date.now(), lastUploadName: name };
    await setApp('settings', app.settings);
    app.logHealth?.('backup', 'WebDAV 上传');
    return { ok: true, message: `已上传（HTTP ${res.status} · ${name}）` };
  } catch (err) {
    return { ok: false, message: err.message || String(err) };
  }
}

export async function webdavRestore(app) {
  try {
    const wd = ensureConfigured(app);
    const wdState = app.settings.webdav || {};
    // 候选顺序：本机记录的最近上传优先，其次按云端目录时间戳倒序
    const candidates = [];
    if (wdState.lastUploadName) candidates.push(wdState.lastUploadName);
    try {
      for (const f of await listRemoteFiles(app, wd)) {
        if (!candidates.includes(f.name)) candidates.push(f.name);
      }
    } catch (err) {
      if (!candidates.length) throw err;
    }
    if (!candidates.length) return { ok: false, message: '云端还没有备份文件' };

    let bytes = null;
    let usedName = '';
    let lastStatus = 0;
    for (const name of candidates) {
      const res = await request(app, 'GET', wdTarget(wd, name), { headers: {} });
      if (res.status === 404) continue;
      if (!res.ok) { lastStatus = res.status; continue; }
      bytes = base64ToUint8(res.body || '');
      usedName = name;
      break;
    }
    if (!bytes) {
      return {
        ok: false,
        message: lastStatus ? `下载失败：HTTP ${lastStatus}` : '云端还没有备份文件（或文件已被删除）',
      };
    }
    let bundle;
    if (isEncryptedBackup(bytes)) {
      let bundleOk = null;
      if (wd.password) {
        try { bundleOk = await decryptBackup(bytes, wd.password); } catch { bundleOk = null; }
      }
      if (!bundleOk) {
        const password = await app.askPassword('解密云端备份', '云端备份已加密，请输入导出时设置的密码。', '解密');
        if (password === null) return { ok: false, message: '已取消' };
        bundle = await decryptBackup(bytes, password);
      } else {
        bundle = bundleOk;
      }
    } else {
      try {
        bundle = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return { ok: false, message: '云端文件不是有效的 Novie 备份' };
      }
    }
    if (!bundle.project) return { ok: false, message: '云端文件不是有效的 Novie 备份' };
    const project = await importProjectBundle(bundle, { nameSuffix: '（云端恢复）' });
    app.state.projects = await getAll('projects');
    await app.loadProject(project.id);
    return { ok: true, message: `已从云端恢复《${project.name}》（来源：${usedName}）`, project };
  } catch (err) {
    return { ok: false, message: err.message || String(err) };
  }
}
