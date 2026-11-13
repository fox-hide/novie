/* Novie — 通用工具函数（无框架、纯浏览器） */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function uid(prefix = 'id') {
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `${prefix}_${rand}`;
}

export function debounce(fn, ms = 300) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
  'BLOCKQUOTE', 'HR', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI'
]);

/** 仅保留安全、可导出的排版标签；去掉所有属性（含事件）。 */
export function sanitizeHtml(html = '') {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = document.createElement('div');
  const walk = (node, parent) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.nodeValue));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (tag === 'MARK' || tag === 'SPAN') {
      Array.from(node.childNodes).forEach(n => walk(n, parent));
      return;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      Array.from(node.childNodes).forEach(n => walk(n, parent));
      return;
    }
    if (tag === 'BR' || tag === 'HR') {
      parent.appendChild(document.createElement(tag));
      return;
    }
    const el = document.createElement(tag === 'DIV' ? 'P' : tag);
    Array.from(node.childNodes).forEach(n => walk(n, el));
    parent.appendChild(el);
  };
  Array.from(doc.body.childNodes).forEach(n => walk(n, out));
  return out.innerHTML;
}

/** HTML → 纯文本（段落之间空行）。 */
export function htmlToText(html = '') {
  if (!html) return '';
  const cleaned = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|blockquote|li)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  const div = document.createElement('div');
  div.innerHTML = cleaned;
  return div.textContent
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function plainTextToHtml(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const PUNCT_RE = /[^\p{L}\p{N}]/gu;

export function countChars(text = '', excludePunctuation = false) {
  const noSpace = String(text).replace(/\s/g, '');
  if (!excludePunctuation) return Array.from(noSpace).length;
  return Array.from(noSpace.replace(PUNCT_RE, '')).length;
}

export function countHtml(html, excludePunctuation = false) {
  const text = htmlToText(html);
  return {
    chars: countChars(text, excludePunctuation),
    charsAll: countChars(text, false),
    paragraphs: text ? text.split(/\n{2,}/).filter(Boolean).length : 0,
  };
}

export function fmtNumber(n = 0) {
  return Number(n || 0).toLocaleString('zh-CN');
}

export function fmtWan(n = 0) {
  const v = Number(n || 0);
  if (v >= 100000000) return `${(v / 100000000).toFixed(2)} 亿`;
  if (v >= 10000) return `${(v / 10000).toFixed(2)} 万`;
  return fmtNumber(v);
}

export function fmtDuration(seconds = 0) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分`;
  return `${s} 秒`;
}

export function fmtClock(seconds = 0) {
  const s = Math.max(0, Math.round(seconds));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

export function pad2(n) { return String(n).padStart(2, '0'); }

/** 本地时区的 YYYY-MM-DD。 */
export function dateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayKey() { return dateKey(new Date()); }

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetweenKeys(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.round((db - da) / 86400000);
}

export function fmtDate(ts, withTime = false) {
  if (!ts) return '—';
  const d = new Date(ts);
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  if (!withTime) return base;
  return `${base} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtRelative(ts) {
  if (!ts) return '—';
  const diff = Date.now() - Number(ts);
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)} 天前`;
  return fmtDate(ts);
}

/** 生成最近 n 天的日期 key（含今天，升序）。 */
export function recentDateKeys(n) {
  const keys = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) keys.push(dateKey(addDays(now, -i)));
  return keys;
}

export function parseTags(str = '') {
  return String(str)
    .split(/[,，、;；\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

export function tagString(tags = []) { return (tags || []).join('，'); }

export function truncate(str = '', len = 80) {
  const s = String(str);
  return Array.from(s).length > len ? Array.from(s).slice(0, len).join('') + '…' : s;
}

export function hashString(str = '') {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function avatarColor(name = '') {
  const palette = ['#b25b3e', '#8a6f3f', '#5b7f63', '#50708c', '#7a5c86', '#9c5a63', '#4d7d7a', '#8b6a4f'];
  return palette[hashString(name) % palette.length];
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * 颜色白名单校验：导入的 .novie 包可能携带任意字符串充当颜色值，
 * 进入 style 前必须收敛为 #rrggbb（无法执行脚本，但可外链 url()）。
 */
export function safeColor(value, fallback = '#8a5a3b') {
  const s = String(value || '').trim();
  return HEX_COLOR_RE.test(s) ? s : fallback;
}

/** 纯函数：按日历日口径计算"近 n 天日均"（跳写的日子按 0 计，而不是被挤掉）。 */
export function averageDailyWords(daily = [], days = 7, now = new Date()) {
  const map = new Map(daily.map(d => [d.date, Number(d.words) || 0]));
  let sum = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(now, -i);
    sum += map.get(dateKey(d)) || 0;
  }
  return Math.round(sum / days);
}

export function safeFileName(name = '未命名', fallback = 'novie') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

export function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function uint8ToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

export function blobToUint8(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export function readFileAsText(file, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, encoding);
  });
}

export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** 逐文本节点替换，保留 HTML 结构；caseSensitive=false 时按小写匹配（长度不变才启用）。 */
export function replaceInHtml(html, search, replacement, all = true, caseSensitive = true) {
  if (!search) return { html, count: 0 };
  const container = document.createElement('div');
  container.innerHTML = html || '';
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  let count = 0;
  for (const textNode of nodes) {
    const original = textNode.nodeValue;
    if (!original) continue;
    const needleRaw = caseSensitive ? search : search.toLowerCase();
    const hayRaw = caseSensitive ? original : original.toLowerCase();
    // 小写转换极少数 Unicode 字符会改变长度，此时回退为精确匹配
    const safeFold = needleRaw.length === search.length && hayRaw.length === original.length;
    const needle = safeFold ? needleRaw : search;
    const hay = safeFold ? hayRaw : original;
    if (!hay.includes(needle)) continue;
    let result = '';
    let idx = 0;
    while (true) {
      const found = hay.indexOf(needle, idx);
      if (found < 0) break;
      result += original.slice(idx, found) + replacement;
      idx = found + needle.length;
      count++;
      if (!all) break;
    }
    if (count > 0 && (all || idx > 0)) {
      result += original.slice(idx);
      if (result !== original) textNode.nodeValue = result;
    }
    if (!all && count >= 1) break;
  }
  return { html: container.innerHTML, count };
}

/** 在纯文本中查找，返回带上下文的命中列表。 */
export function findInText(text, query, limit = 60, caseSensitive = false) {
  if (!query) return [];
  // 与 replaceInHtml 对齐：小写折叠改变字符串长度时（少数 Unicode 字符）回退精确匹配
  const needleRaw = caseSensitive ? query : query.toLowerCase();
  const hayRaw = caseSensitive ? text : text.toLowerCase();
  const safeFold = needleRaw.length === query.length && hayRaw.length === text.length;
  const needle = safeFold ? needleRaw : query;
  const hay = safeFold ? hayRaw : text;
  const results = [];
  let idx = 0;
  while (results.length < limit) {
    const found = hay.indexOf(needle, idx);
    if (found < 0) break;
    results.push({
      index: found,
      before: text.slice(Math.max(0, found - 24), found),
      match: text.slice(found, found + needle.length),
      after: text.slice(found + needle.length, found + needle.length + 30),
    });
    idx = found + Math.max(1, needle.length);
  }
  return results;
}

export function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomItems(arr, n) {
  const pool = [...arr];
  const out = [];
  while (pool.length && out.length < n) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

export function deepClone(obj) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(obj); } catch { /* fallthrough */ }
  }
  return JSON.parse(JSON.stringify(obj));
}

export function isDesktop() {
  return Boolean(typeof window !== 'undefined' && window.novie && window.novie.isDesktop);
}

export function applyCssVars(vars) {
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => {
    if (v === null || v === undefined) root.style.removeProperty(k);
    else root.style.setProperty(k, v);
  });
}
