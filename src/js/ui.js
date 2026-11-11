/* Novie — 轻量 UI 基础组件 */

import {
  $, escapeHtml, uint8ToBase64, base64ToUint8, downloadBlob,
  blobToUint8, readFileAsArrayBuffer, isDesktop, safeFileName
} from './utils.js';

const ICONS = {
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  outline: '<rect x="3" y="4" width="7" height="5" rx="1.5"/><rect x="14" y="4" width="7" height="5" rx="1.5"/><rect x="3" y="15" width="7" height="5" rx="1.5"/><rect x="14" y="15" width="7" height="5" rx="1.5"/>',
  users: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  book: '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>',
  folder: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
  branch: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 9v6"/><path d="M18 6a3 3 0 00-3 3v6a3 3 0 01-3 3h-3"/>',
  chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 003.68 15a1.65 1.65 0 00-1.51-1H2a2 2 0 010-4h.09A1.65 1.65 0 003.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09A1.65 1.65 0 0016 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0020.4 9c.14.6.66 1.03 1.28 1.03H22a2 2 0 010 4h-.09c-.62 0-1.14.43-1.28 1.03z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  save: '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>',
  maximize: '<path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/>',
  minimize: '<path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="15.5" cy="10" r="1"/><path d="M12 21a2.5 2.5 0 010-5h1.2a2.3 2.3 0 002.3-2.3V12"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
  edit: '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  zap: '<path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>',
  sparkles: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/><path d="M19 3v3M20.5 4.5h-3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  external: '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6M10 14L21 3"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h0M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  quote: '<path d="M3 21c3 0 7-1 7-8V5H3v7h4c0 3-1 4-4 5zM14 21c3 0 7-1 7-8V5h-7v7h4c0 3-1 4-4 5z"/>',
  minus: '<path d="M5 12h14"/>',
  alignLeft: '<path d="M4 6h16M4 12h11M4 18h16"/>',
  volume2: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14"/>',
  volumeX: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>',
  redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3L21 13"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>',
  play: '<path d="M5 3l14 9-14 9V3z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  flame: '<path d="M12 22c4.4 0 8-3.6 8-8 0-3-1.5-5.5-4-8-1 2-2 3-3 3 0-3-2-6-4-7 0 4-5 7-5 12 0 4.4 3.6 8 8 8z"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
  user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  starmap: '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="1.5"/><circle cx="20" cy="6" r="1.5"/><circle cx="6" cy="20" r="1.5"/><circle cx="19" cy="18" r="1.5"/><path d="M5.2 6.3l4.5 3.5M15.2 9.4l3.3-2.3M10.5 14.8l-3.2 3.6M14 13.8l3.6 3"/>',
  note: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  quoteCard: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
  history: '<path d="M3 3v6h6"/><path d="M3.5 9a9 9 0 1010-5.7L8 8"/>',
  balance: '<path d="M12 3v18M5 8h14M7 8l-3 7h6zM17 8l-3 7h6zM8 21h8"/>',
  archive: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a2 2 0 002 2h12a2 2 0 002-2V9M10 13h4"/>',
  moonStars: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/><path d="M17 3l.5 1.5L19 5l-1.5.5L17 7l-.5-1.5L15 5l1.5-.5z"/>',
};

export function icon(name, size = 16, cls = '') {
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const child of kids) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/* ---------------- Toast ---------------- */

export function toast(message, type = 'info', ms = 2400) {
  const root = $('#toast-root') || document.body;
  const node = el('div', { class: `toast toast-${type}` }, [
    el('span', { class: 'toast-icon', html: icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : type === 'warn' ? 'alert' : 'info', 15) }),
    el('span', { class: 'toast-text', text: message }),
  ]);
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  const remove = () => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 220);
  };
  const timer = setTimeout(remove, ms);
  node.addEventListener('click', () => { clearTimeout(timer); remove(); });
  return remove;
}

/* ---------------- Modal ---------------- */

let modalSeq = 0;

export function showModal({
  title = '',
  subtitle = '',
  body = null,
  width = 560,
  actions = [],
  dismissible = true,
  className = '',
  onClose = null,
  initialFocus = null,
} = {}) {
  const root = $('#overlay-root') || document.body;
  const id = `modal-${++modalSeq}`;
  const overlay = el('div', { class: 'modal-overlay', id });
  overlay.style.zIndex = String(1000 + modalSeq);
  const card = el('div', { class: `modal-card ${className}`, role: 'dialog', 'aria-modal': 'true' });
  card.style.maxWidth = `${width}px`;

  const head = el('div', { class: 'modal-head' });
  const titleBox = el('div', { class: 'modal-titles' });
  if (title) titleBox.appendChild(el('h3', { class: 'modal-title', text: title }));
  if (subtitle) titleBox.appendChild(el('p', { class: 'modal-subtitle', text: subtitle }));
  head.appendChild(titleBox);
  const closeBtn = el('button', { class: 'icon-btn modal-close', title: '关闭', 'aria-label': '关闭', html: icon('x', 17) });
  if (dismissible) head.appendChild(closeBtn);
  card.appendChild(head);

  const bodyEl = el('div', { class: 'modal-body' });
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  card.appendChild(bodyEl);

  const footer = el('div', { class: 'modal-footer' });
  const close = () => {
    overlay.classList.remove('show');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 180);
    if (onClose) onClose();
  };
  const buttons = [];
  for (const action of actions) {
    const btn = el('button', {
      class: `btn ${action.primary ? 'primary' : ''} ${action.danger ? 'danger' : ''} ${action.ghost ? 'ghost' : ''}`.trim(),
      type: 'button',
    }, action.icon ? [el('span', { class: 'btn-ico', html: icon(action.icon, 15) }), action.label] : [action.label]);
    btn.addEventListener('click', async () => {
      if (action.onClick) {
        const result = await action.onClick({ close, btn });
        if (result === false) return;
      }
      if (action.close !== false) close();
    });
    buttons.push(btn);
    footer.appendChild(btn);
  }
  if (actions.length) card.appendChild(footer);
  overlay.appendChild(card);
  root.appendChild(overlay);

  const onKey = e => {
    if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(); }
  };
  document.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('mousedown', e => {
    if (e.target === overlay && dismissible) close();
  });
  requestAnimationFrame(() => {
    overlay.classList.add('show');
    const focusTarget = initialFocus || bodyEl.querySelector('input, textarea, select, button');
    if (focusTarget) focusTarget.focus();
  });

  return { overlay, card, body: bodyEl, footer, close, buttons };
}

export function confirmDialog(message, {
  title = '确认操作',
  okLabel = '确定',
  cancelLabel = '取消',
  danger = false,
} = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    showModal({
      title,
      body: el('p', { class: 'confirm-text', text: message }),
      width: 430,
      actions: [
        { label: cancelLabel, ghost: true, onClick: () => finish(false) },
        { label: okLabel, danger, primary: !danger, onClick: () => finish(true) },
      ],
      onClose: () => finish(false),
    });
  });
}

export function promptDialog({
  title = '请输入',
  label = '',
  value = '',
  placeholder = '',
  multiline = false,
  okLabel = '确定',
  width = 460,
} = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = v => { if (!settled) { settled = true; resolve(v); } };
    const input = el(multiline ? 'textarea' : 'input', {
      class: 'input',
      placeholder,
      rows: multiline ? 5 : undefined,
    });
    input.value = value;
    const body = el('div', { class: 'form-stack' });
    if (label) body.appendChild(el('label', { class: 'field-label', text: label }));
    body.appendChild(input);
    const modal = showModal({
      title,
      body,
      width,
      actions: [
        { label: '取消', ghost: true, onClick: () => finish(null) },
        {
          label: okLabel,
          primary: true,
          onClick: () => {
            const v = input.value.trim();
            if (!v) { input.focus(); input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); return false; }
            finish(v);
          },
        },
      ],
      onClose: () => finish(null),
    });
    input.addEventListener('keydown', e => {
      if (!multiline && e.key === 'Enter') {
        e.preventDefault();
        modal.buttons[1].click();
      }
    });
  });
}

/* ---------------- Context menu ---------------- */

let activeMenu = null;

export function contextMenu(x, y, items, { header = '' } = {}) {
  closeContextMenu();
  const menu = el('div', { class: 'context-menu' });
  if (header) menu.appendChild(el('div', { class: 'context-header', text: header }));
  for (const item of items) {
    if (!item) continue;
    if (item.separator) { menu.appendChild(el('div', { class: 'context-sep' })); continue; }
    const btn = el('button', {
      class: `context-item ${item.danger ? 'danger' : ''}`.trim(),
      type: 'button',
      disabled: item.disabled || false,
    });
    if (item.icon) btn.innerHTML += icon(item.icon, 15);
    btn.appendChild(el('span', { text: item.label }));
    if (item.hint) btn.appendChild(el('span', { class: 'context-hint', text: item.hint }));
    btn.addEventListener('click', async () => {
      closeContextMenu();
      if (item.onClick) await item.onClick();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  requestAnimationFrame(() => menu.classList.add('show'));
  activeMenu = menu;
  setTimeout(() => {
    const onDown = e => { if (!menu.contains(e.target)) closeContextMenu(); };
    const onKey = e => { if (e.key === 'Escape') closeContextMenu(); };
    document.addEventListener('mousedown', onDown, { once: true });
    document.addEventListener('keydown', onKey, { once: true });
    menu._cleanup = () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, 0);
  return menu;
}

export function closeContextMenu() {
  if (!activeMenu) return;
  const menu = activeMenu;
  activeMenu = null;
  if (menu._cleanup) menu._cleanup();
  menu.classList.remove('show');
  setTimeout(() => menu.remove(), 120);
}

/* ---------------- Empty state / helpers ---------------- */

export function emptyState({ iconName = 'file', title = '这里还空着', desc = '', actionLabel = '', onAction = null } = {}) {
  const box = el('div', { class: 'empty-state' }, [
    el('div', { class: 'empty-icon', html: icon(iconName, 30) }),
    el('h3', { text: title }),
    desc ? el('p', { text: desc }) : null,
  ]);
  if (actionLabel && onAction) {
    box.appendChild(el('button', { class: 'btn primary', type: 'button', text: actionLabel, onclick: onAction }));
  }
  return box;
}

export function badge(text, tone = '') {
  return el('span', { class: `badge ${tone ? `badge-${tone}` : ''}`.trim(), text });
}

export function sectionHeading(title, sub = '', actions = []) {
  const head = el('div', { class: 'page-head' });
  const left = el('div');
  left.appendChild(el('h2', { class: 'page-title', text: title }));
  if (sub) left.appendChild(el('p', { class: 'page-sub', text: sub }));
  head.appendChild(left);
  if (actions.length) {
    const right = el('div', { class: 'page-actions' });
    actions.forEach(a => right.appendChild(a));
    head.appendChild(right);
  }
  return head;
}

export function makeButton(label, { iconName = '', primary = false, ghost = false, danger = false, small = false, onClick = null, title = '' } = {}) {
  const btn = el('button', {
    class: `btn ${primary ? 'primary' : ''} ${ghost ? 'ghost' : ''} ${danger ? 'danger' : ''} ${small ? 'small' : ''}`.trim(),
    type: 'button',
    title: title || label,
  });
  if (iconName) btn.innerHTML += icon(iconName, small ? 14 : 15);
  btn.appendChild(el('span', { text: label }));
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

export function makeIconButton(iconName, title, onClick, { small = false, active = false } = {}) {
  const btn = el('button', {
    class: `icon-btn ${small ? 'small' : ''} ${active ? 'active' : ''}`.trim(),
    type: 'button',
    title,
    'aria-label': title,
    html: icon(iconName, small ? 15 : 17),
  });
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制到剪贴板', 'success', 1600);
    return true;
  } catch {
    const ta = el('textarea', { style: { position: 'fixed', left: '-9999px' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(ok ? '已复制到剪贴板' : '复制失败', ok ? 'success' : 'error', 1600);
    return ok;
  }
}

/* ---------------- Files ---------------- */

export async function saveBytes(bytes, filename, {
  filters = [], mime = 'application/octet-stream', silent = false,
} = {}) {
  try {
    if (isDesktop() && window.novie.saveFile) {
      const res = await window.novie.saveFile(filename, uint8ToBase64(bytes), filters);
      if (res && res.canceled) return { canceled: true };
      if (!silent) toast(`已保存：${res.filePath || filename}`, 'success', 3000);
      return res || { canceled: false };
    }
    const blob = new Blob([bytes], { type: mime });
    downloadBlob(blob, filename);
    if (!silent) toast(`已开始下载：${filename}`, 'success', 2600);
    return { canceled: false, browser: true };
  } catch (err) {
    console.error(err);
    toast(`保存失败：${err.message || err}`, 'error', 3800);
    return { canceled: true, error: err };
  }
}

export async function saveText(text, filename, { encoding = 'utf-8', bom = false, filters = [], silent = false } = {}) {
  let bytes;
  if (encoding.toLowerCase() === 'gbk') {
    const { encodeGbk } = await import('./gbk.js');
    const { bytes: gbkBytes, missing } = encodeGbk(text);
    bytes = gbkBytes;
    if (missing.length && !silent) {
      toast(`有 ${missing.length} 个字符不在 GBK 字符集内，已替换为“?”`, 'warn', 3600);
    }
  } else {
    const encoded = new TextEncoder().encode(text);
    if (bom) {
      bytes = new Uint8Array(encoded.length + 3);
      bytes.set([0xEF, 0xBB, 0xBF], 0);
      bytes.set(encoded, 3);
    } else bytes = encoded;
  }
  return saveBytes(bytes, filename, { filters, mime: 'text/plain;charset=utf-8', silent });
}

export async function openFile({ accept = '', filters = [] } = {}) {
  if (isDesktop() && window.novie.openFile) {
    const res = await window.novie.openFile(filters);
    if (!res || res.canceled) return null;
    return { name: res.name, bytes: base64ToUint8(res.data), type: res.mime || '' };
  }
  return new Promise(resolve => {
    const input = el('input', { type: 'file', style: { display: 'none' } });
    if (accept) input.accept = accept;
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return resolve(null);
      resolve({ name: file.name, bytes: await readFileAsArrayBuffer(file), type: file.type, file });
    });
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickDirectory() {
  if (isDesktop() && window.novie.pickDirectory) return window.novie.pickDirectory();
  toast('目录备份仅桌面版可用，浏览器模式请使用手动导出', 'warn', 3200);
  return null;
}

/* ---------------- Print ---------------- */

export function printHtmlDocument(html) {
  const frame = el('iframe', { class: 'print-frame', title: '打印预览' });
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (err) {
      console.error(err);
      toast('打印失败，请使用浏览器菜单打印', 'error');
    }
    setTimeout(() => frame.remove(), 60000);
  };
  if (doc.readyState === 'complete') setTimeout(run, 320);
  else frame.addEventListener('load', () => setTimeout(run, 320), { once: true });
}

export function setButtonBusy(btn, busy, busyText = '处理中…') {
  if (!btn) return;
  if (busy) {
    btn.dataset.oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span><span>${escapeHtml(busyText)}</span>`;
  } else {
    btn.disabled = false;
    if (btn.dataset.oldHtml) btn.innerHTML = btn.dataset.oldHtml;
  }
}

export function closeAllMenus() {
  closeContextMenu();
}
