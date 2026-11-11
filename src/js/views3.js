/* Novie — 导出中心 / 设置 */

import {
  el, icon, makeButton, makeIconButton, showModal, confirmDialog, toast,
  saveText, saveBytes, printHtmlDocument, emptyState, openFile, setButtonBusy,
  pickDirectory
} from './ui.js';
import { makePage, statTile, toolbarRow } from './view-kit.js';
import {
  fmtNumber, fmtWan, fmtDate, fmtRelative, safeFileName, isDesktop, uint8ToBase64, truncate
} from './utils.js';
import {
  getChapterContent, listBackups, exportProjectBundle, importProjectBundle, getAll, del, getApp
} from './db.js';
import {
  buildTxt, buildMarkdown, buildDocx, buildChapterArchive, buildPrintHtml,
  buildProjectJson, encryptJson
} from './exporters.js';
import {
  createInternalBackup, writeFileBackup, webdavTest, webdavUpload, webdavRestore
} from './sync.js';

const FORMATS = [
  { key: 'txt', label: 'TXT 纯文本', icon: 'file', desc: '兼容所有平台，支持 UTF-8 / GBK 编码与分章。' },
  { key: 'docx', label: 'Word 文档', icon: 'book', desc: '带目录与卷/章样式，可用 Word / WPS 继续排版。' },
  { key: 'md', label: 'Markdown', icon: 'type', desc: '便于同步到博客、知识库或其他写作工具。' },
  { key: 'print', label: '打印 / PDF', icon: 'file', desc: '调用系统打印对话框，选择“另存为 PDF”。' },
  { key: 'zip-txt', label: '分章 ZIP · TXT', icon: 'archive', desc: '每章一个 TXT 文件，适合批量投稿。' },
  { key: 'zip-md', label: '分章 ZIP · MD', icon: 'archive', desc: '每章一个 Markdown 文件。' },
  { key: 'project', label: '工程备份 .novie', icon: 'database', desc: '完整工程 JSON，可在另一台电脑导入。' },
  { key: 'encrypted', label: '加密备份 .noviebak', icon: 'shield', desc: 'AES-GCM 加密，适合上传网盘。' },
];

const THEME_OPTIONS = [
  { key: 'paper', label: '宣纸', color: '#f4eee3' },
  { key: 'green', label: '护眼', color: '#e8efe2' },
  { key: 'white', label: '极简', color: '#ffffff' },
  { key: 'dark', label: '夜间', color: '#1b1a1f' },
];

const FONT_OPTIONS = [
  { key: 'serif', label: '宋体 / 思源宋体' },
  { key: 'sans', label: '黑体 / 微软雅黑' },
  { key: 'kai', label: '楷体' },
  { key: 'fangsong', label: '仿宋' },
  { key: 'mono', label: '等宽' },
];

function dateStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

async function askNewPassword() {
  return new Promise(resolve => {
    let settled = false;
    const finish = v => { if (!settled) { settled = true; resolve(v); } };
    const p1 = el('input', { class: 'input', type: 'password', placeholder: '至少 4 位' });
    const p2 = el('input', { class: 'input', type: 'password', placeholder: '再次输入密码' });
    const err = el('p', { class: 'field-error hidden', text: '两次输入的密码不一致' });
    const body = el('div', { class: 'form-stack' }, [
      el('p', { class: 'muted small', text: '加密备份使用 AES-GCM + PBKDF2。密码无法找回；忘记密码将无法恢复内容，请妥善保管。' }),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '备份密码' }), p1]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '确认密码' }), p2]),
      err,
    ]);
    const modal = showModal({
      title: '设置加密备份密码',
      body,
      width: 440,
      actions: [
        { label: '取消', ghost: true, onClick: () => finish(null) },
        {
          label: '确定', primary: true,
          onClick: () => {
            if (p1.value.length < 4) { p1.focus(); p1.classList.add('shake'); setTimeout(() => p1.classList.remove('shake'), 400); return false; }
            if (p1.value !== p2.value) { err.classList.remove('hidden'); p2.focus(); return false; }
            finish(p1.value);
          },
        },
      ],
      onClose: () => finish(null),
    });
  });
}

async function restoreInternalBackup(app, record) {
  const ok = await confirmDialog(
    `将从本机备份恢复为一部新作品（不会覆盖当前作品），备份时间：${new Date(record.createdAt).toLocaleString('zh-CN')}。继续？`,
    { title: '恢复本机备份', okLabel: '恢复为新作品' }
  );
  if (!ok) return;
  try {
    const project = await importProjectBundle(record.data, { nameSuffix: '（本机恢复）' });
    app.state.projects = await getAll('projects');
    await app.loadProject(project.id);
    toast(`已恢复《${project.name}》`, 'success', 3200);
  } catch (err) {
    console.error(err);
    toast('恢复失败：' + (err.message || err), 'error', 4200);
  }
}

/* ============================= 导出中心 ============================= */

export function renderExportView(app) {
  let format = 'txt';
  let rangeType = 'all';
  let volumeId = app.state.volumes[0]?.id || '';
  const selected = new Set(app.orderedChapters().map(c => c.id));

  const { page, body } = makePage({
    title: '导出与备份',
    subtitle: '成稿导出、工程迁移、加密备份。你的文字，随时能带走。',
    actions: [
      makeButton('回到写作', { iconName: 'pen', ghost: true, onClick: () => app.switchView('write') }),
    ],
  });

  // 导出格式
  const formatGrid = el('div', { class: 'format-grid' });
  const formatCards = new Map();
  for (const f of FORMATS) {
    const card = el('button', {
      class: `format-card ${format === f.key ? 'active' : ''}`.trim(),
      type: 'button',
    });
    card.appendChild(el('span', { class: 'format-icon', html: icon(f.icon, 20) }));
    const info = el('span', { class: 'format-info' }, [
      el('strong', { text: f.label }),
      el('span', { text: f.desc }),
    ]);
    card.appendChild(info);
    card.addEventListener('click', () => {
      format = f.key;
      formatCards.forEach((c, key) => c.classList.toggle('active', key === format));
      updateOptions();
    });
    formatCards.set(f.key, card);
    formatGrid.appendChild(card);
  }
  body.appendChild(formatGrid);

  // 范围
  const rangePanel = el('div', { class: 'panel' });
  rangePanel.appendChild(el('div', { class: 'panel-title', text: '导出范围' }));
  const rangeRow = el('div', { class: 'range-row' });
  const rangeDefs = [
    { key: 'all', label: '全书' },
    { key: 'volume', label: '按卷' },
    { key: 'custom', label: '自定义章节' },
  ];
  const rangeButtons = new Map();
  rangeDefs.forEach(r => {
    const btn = el('button', {
      class: `range-btn ${rangeType === r.key ? 'active' : ''}`.trim(),
      type: 'button', text: r.label,
      onClick: () => {
        rangeType = r.key;
        rangeButtons.forEach((b, k) => b.classList.toggle('active', k === rangeType));
        volumeSelect.classList.toggle('hidden', rangeType !== 'volume');
        customBox.classList.toggle('hidden', rangeType !== 'custom');
        updateSummary();
      },
    });
    rangeButtons.set(r.key, btn);
    rangeRow.appendChild(btn);
  });
  rangePanel.appendChild(rangeRow);

  const volumeSelect = el('select', { class: 'input range-volume' });
  app.state.volumes.forEach(v => {
    const opt = el('option', { value: v.id, text: v.title });
    if (v.id === volumeId) opt.selected = true;
    volumeSelect.appendChild(opt);
  });
  volumeSelect.value = volumeId;
  volumeSelect.classList.add('hidden');
  volumeSelect.addEventListener('change', () => { volumeId = volumeSelect.value; updateSummary(); });
  rangePanel.appendChild(volumeSelect);

  const customBox = el('div', { class: 'custom-range hidden' });
  const customTop = el('div', { class: 'custom-range-top' });
  customTop.appendChild(el('span', { class: 'muted small', text: '勾选要导出的章节' }));
  const toggleAll = makeButton('全选 / 清空', {
    small: true, ghost: true,
    onClick: () => {
      const allChecked = app.state.chapters.every(c => selected.has(c.id));
      app.state.chapters.forEach(c => { if (allChecked) selected.delete(c.id); else selected.add(c.id); });
      customBox.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = !allChecked; });
      updateSummary();
    },
  });
  customTop.appendChild(toggleAll);
  customBox.appendChild(customTop);
  const customList = el('div', { class: 'custom-chapter-list' });
  for (const volume of app.state.volumes) {
    const chapters = app.state.chapters.filter(c => c.volumeId === volume.id).sort((a, b) => a.order - b.order);
    if (!chapters.length) continue;
    customList.appendChild(el('div', { class: 'custom-vol-title', text: volume.title }));
    for (const chapter of chapters) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = selected.has(chapter.id);
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(chapter.id); else selected.delete(chapter.id);
        updateSummary();
      });
      customList.appendChild(el('label', { class: 'custom-chapter' }, [
        cb,
        el('span', { text: chapter.title }),
        el('span', { class: 'muted tiny', text: `${fmtNumber(app.chapterWordCount(chapter))} 字` }),
      ]));
    }
  }
  customBox.appendChild(customList);
  rangePanel.appendChild(customBox);

  const optionsBox = el('div', { class: 'export-options' });
  const encodingWrap = el('label', { class: 'field inline-field' }, [
    el('span', { class: 'field-label', text: 'TXT 编码' }),
    (() => {
      const sel = el('select', { class: 'input small-input' }, [
        el('option', { value: 'utf-8', text: 'UTF-8' }),
        el('option', { value: 'utf-8-bom', text: 'UTF-8（带 BOM）' }),
        el('option', { value: 'gbk', text: 'GBK（部分平台）' }),
      ]);
      sel.id = 'export-encoding';
      return sel;
    })(),
  ]);
  optionsBox.appendChild(encodingWrap);
  const printIndent = el('label', { class: 'check-item' }, [
    (() => { const cb = el('input', { type: 'checkbox' }); cb.id = 'export-indent'; cb.checked = app.settings.indent; return cb; })(),
    el('span', { text: '打印稿首行缩进' }),
  ]);
  optionsBox.appendChild(printIndent);
  rangePanel.appendChild(optionsBox);

  const summary = el('div', { class: 'export-summary' });
  rangePanel.appendChild(summary);
  body.appendChild(rangePanel);

  const exportBtn = makeButton('开始导出', {
    primary: true, iconName: 'download',
    onClick: async () => {
      const isProjectFormat = format === 'project' || format === 'encrypted';
      const items = isProjectFormat ? [] : await getExportItems();
      if (!isProjectFormat && !items.length) { toast('没有可导出的章节', 'warn'); return; }
      await runExport(items, exportBtn);
    },
  });
  const btnRow = el('div', { class: 'export-action-row' }, [
    exportBtn,
    el('span', { class: 'muted tiny', id: 'export-hint', text: '文件会直接保存到本机。' }),
  ]);
  body.appendChild(btnRow);

  function getSelectedChapters() {
    const ordered = app.orderedChapters();
    if (rangeType === 'all') return ordered;
    if (rangeType === 'volume') return ordered.filter(c => c.volumeId === volumeId);
    return ordered.filter(c => selected.has(c.id));
  }

  async function getExportItems() {
    const chapters = getSelectedChapters();
    const items = [];
    for (const chapter of chapters) {
      const html = await getChapterContent(chapter.id);
      const volume = app.state.volumes.find(v => v.id === chapter.volumeId);
      items.push({ volumeTitle: volume?.title || '', chapterTitle: chapter.title, html });
    }
    return items;
  }

  function updateSummary() {
    const chapters = getSelectedChapters();
    const words = chapters.reduce((n, c) => n + app.chapterWordCount(c), 0);
    encodingWrap.classList.toggle('hidden', format !== 'txt' && format !== 'zip-txt');
    printIndent.classList.toggle('hidden', format !== 'print');
    summary.innerHTML = '';
    summary.appendChild(el('span', {
      html: `${icon('file', 14)}<span>${chapters.length} 章 · ${fmtWan(words)}字</span>`,
    }));
    if (format === 'project' || format === 'encrypted') {
      summary.appendChild(el('span', { class: 'muted tiny', text: '此格式导出完整工程（含全部章节、设定、剧情线与统计），忽略上方范围。' }));
    } else {
      summary.appendChild(el('span', { class: 'muted tiny', text: '范围以目录顺序为准。' }));
    }
  }

  function updateOptions() {
    const isProject = format === 'project' || format === 'encrypted';
    rangePanel.classList.toggle('disabled-panel', isProject);
    updateSummary();
    const hint = document.getElementById('export-hint');
    if (hint) {
      hint.textContent = format === 'print'
        ? '将打开打印对话框，选择“另存为 PDF”即可生成 PDF。'
        : format === 'encrypted'
          ? '会要求设置备份密码；忘记密码无法恢复。'
          : '文件会直接保存到本机。';
    }
  }

  async function runExport(items, btn) {
    setButtonBusy(btn, true, '生成中…');
    try {
      const base = safeFileName(app.state.project.name || '未命名作品');
      const stamp = dateStamp();
      const encodingSel = document.getElementById('export-encoding');
      const encoding = encodingSel ? encodingSel.value : 'utf-8';
      const indent = document.getElementById('export-indent')?.checked ?? app.settings.indent;
      if (format === 'txt') {
        const { bytes, missing } = buildTxt({
          title: app.state.project.name,
          author: app.state.project.author,
          items, encoding: encoding === 'gbk' ? 'gbk' : 'utf-8',
          bom: encoding === 'utf-8-bom',
        });
        await saveBytes(bytes, `${base}-${stamp}.txt`, {
          mime: 'text/plain;charset=utf-8',
          filters: [{ name: '文本文件', extensions: ['txt'] }],
        });
        if (missing?.length) toast(`有 ${missing.length} 个字符无法用 GBK 表示，已替换为“?”`, 'warn', 3800);
      } else if (format === 'docx') {
        const words = getSelectedChapters().reduce((n, c) => n + app.chapterWordCount(c), 0);
        const bytes = buildDocx({
          title: app.state.project.name,
          author: app.state.project.author,
          items,
          wordCount: words,
        });
        await saveBytes(bytes, `${base}-${stamp}.docx`, {
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          filters: [{ name: 'Word 文档', extensions: ['docx'] }],
        });
      } else if (format === 'md') {
        const { bytes } = buildMarkdown({
          title: app.state.project.name,
          author: app.state.project.author,
          items,
        });
        await saveBytes(bytes, `${base}-${stamp}.md`, {
          mime: 'text/markdown;charset=utf-8',
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
      } else if (format === 'print') {
        const html = buildPrintHtml({
          title: app.state.project.name,
          author: app.state.project.author,
          items,
          indent,
        });
        printHtmlDocument(html);
        toast('已打开打印视图，请在对话框中选择“另存为 PDF”', 'info', 4200);
      } else if (format === 'zip-txt' || format === 'zip-md') {
        const { bytes, missing } = buildChapterArchive({
          items, format: format === 'zip-md' ? 'md' : 'txt', encoding: encoding === 'gbk' ? 'gbk' : 'utf-8',
        });
        await saveBytes(bytes, `${base}-分章-${stamp}.zip`, {
          mime: 'application/zip',
          filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
        });
        if (missing?.length) toast(`有 ${missing.length} 个字符无法用 GBK 表示，已替换为“?”`, 'warn', 3800);
      } else if (format === 'project') {
        const bundle = await exportProjectBundle(app.state.project.id, { includeVersions: true });
        const { bytes } = buildProjectJson(bundle);
        await saveBytes(bytes, `${base}-${stamp}.novie`, {
          mime: 'application/json',
          filters: [{ name: 'Novie 工程', extensions: ['novie'] }],
        });
      } else if (format === 'encrypted') {
        const password = await askNewPassword();
        if (password === null) return;
        const bundle = await exportProjectBundle(app.state.project.id, { includeVersions: true });
        const bytes = await encryptJson(bundle, password);
        await saveBytes(bytes, `${base}-${stamp}.noviebak`, {
          mime: 'application/octet-stream',
          filters: [{ name: 'Novie 加密备份', extensions: ['noviebak'] }],
        });
      }
    } catch (err) {
      console.error(err);
      toast('导出失败：' + (err.message || err), 'error', 4200);
    } finally {
      setButtonBusy(btn, false);
    }
  }

  updateOptions();
  updateSummary();

  // 迁移导入
  const importPanel = el('div', { class: 'panel' });
  importPanel.appendChild(el('div', { class: 'panel-title', text: '从别处迁移' }));
  importPanel.appendChild(el('p', { class: 'muted small', text: '支持导入 Novie 工程 / 加密备份，或把 TXT、Markdown 按章节导入当前作品。' }));
  const importRow = el('div', { class: 'btn-row' });
  importRow.appendChild(makeButton('导入工程备份', { iconName: 'upload', onClick: () => app.importProjectFlow() }));
  importRow.appendChild(makeButton('导入 TXT / Markdown', { iconName: 'file', onClick: () => app.importTextFlow() }));
  importPanel.appendChild(importRow);
  body.appendChild(importPanel);

  // 内部备份
  const backupPanel = el('div', { class: 'panel' });
  backupPanel.appendChild(el('div', { class: 'panel-head' }, [
    el('div', { class: 'panel-title', text: '本机自动备份' }),
    makeButton('立即备份', {
      small: true, primary: true, iconName: 'save',
      onClick: async () => { await createInternalBackup(app); paintBackups(); },
    }),
  ]));
  const backupStatus = el('p', { class: 'muted small' });
  backupStatus.textContent = `最近自动备份：${app.settings.lastAutoBackupAt ? fmtRelative(app.settings.lastAutoBackupAt) : '尚未创建'} · 自动备份间隔 ${app.settings.backupIntervalMin || 30} 分钟`;
  backupPanel.appendChild(backupStatus);
  const backupList = el('div', { class: 'backup-list' });
  backupPanel.appendChild(backupList);
  const paintBackups = async () => {
    backupList.innerHTML = '';
    const list = await listBackups(app.state.project.id);
    if (!list.length) {
      backupList.appendChild(el('p', { class: 'muted small', text: '还没有本机备份快照。' }));
      return;
    }
    for (const rec of list) {
      const row = el('div', { class: 'backup-row' }, [
        el('div', { class: 'backup-meta' }, [
          el('strong', { text: new Date(rec.createdAt).toLocaleString('zh-CN') }),
          el('span', { class: 'muted tiny', text: `${fmtWan(rec.data?.chapters?.length ? rec.data.chapters.reduce((n, c) => n + (c.wordCount || 0), 0) : 0)}字 · ${(rec.size / 1024).toFixed(0)} KB` }),
        ]),
      ]);
      row.appendChild(makeButton('恢复为新作品', { small: true, ghost: true, onClick: () => restoreInternalBackup(app, rec) }));
      backupList.appendChild(row);
    }
  };
  paintBackups();
  body.appendChild(backupPanel);

  const note = el('div', { class: 'notice-box' });
  note.appendChild(el('span', { class: 'notice-icon', html: icon('shield', 16) }));
  note.appendChild(el('p', {}, [
    el('strong', { text: '关于数据安全：' }),
    el('span', {
      text: '浏览器模式下，数据保存在当前浏览器的 IndexedDB 中，清理浏览器数据会丢失内容。正式创作请使用桌面版，并开启“自动文件备份”或定期导出加密备份。',
    }),
  ]));
  body.appendChild(note);

  return page;
}

/* ============================= 设置 ============================= */

export function renderSettingsView(app) {
  const { page, body } = makePage({
    title: '设置',
    subtitle: '外观、目标、备份与安全。所有设置保存在本机。',
    actions: [
      makeButton('回到写作', { iconName: 'pen', ghost: true, onClick: () => app.switchView('write') }),
    ],
  });

  const s = app.settings;
  const section = (title, desc = '') => {
    const box = el('section', { class: 'settings-section' });
    const head = el('div', { class: 'settings-head' });
    head.appendChild(el('h2', { text: title }));
    if (desc) head.appendChild(el('p', { class: 'muted small', text: desc }));
    box.appendChild(head);
    const content = el('div', { class: 'settings-content' });
    box.appendChild(content);
    body.appendChild(box);
    return content;
  };

  const settingRow = (label, control, hint = '') => {
    const row = el('div', { class: 'setting-row' });
    const left = el('div', { class: 'setting-label' }, [
      el('span', { text: label }),
      hint ? el('span', { class: 'muted tiny', text: hint }) : null,
    ]);
    row.appendChild(left);
    const right = el('div', { class: 'setting-control' });
    if (Array.isArray(control)) control.forEach(c => right.appendChild(c));
    else if (control) right.appendChild(control);
    row.appendChild(right);
    return row;
  };

  /* 外观 */
  const appearance = section('外观', '长时间写作，眼睛舒服比好看更重要。');
  const themeRow = el('div', { class: 'theme-row' });
  for (const t of THEME_OPTIONS) {
    const btn = el('button', {
      class: `theme-card ${s.theme === t.key ? 'active' : ''}`.trim(),
      type: 'button',
    });
    btn.appendChild(el('span', { class: `theme-preview theme-${t.key}` }));
    btn.appendChild(el('span', { text: t.label }));
    btn.addEventListener('click', () => {
      themeRow.querySelectorAll('.theme-card').forEach(n => n.classList.remove('active'));
      btn.classList.add('active');
      app.saveSettings({ theme: t.key });
    });
    themeRow.appendChild(btn);
  }
  appearance.appendChild(themeRow);

  const fontSelect = el('select', { class: 'input' }, FONT_OPTIONS.map(f =>
    ({ ...f })
  ).map(f => el('option', { value: f.key, text: f.label })));
  fontSelect.value = s.font;
  fontSelect.addEventListener('change', () => app.saveSettings({ font: fontSelect.value }));
  appearance.appendChild(settingRow('正文字体', fontSelect));

  const sizeRange = el('input', { class: 'range', type: 'range', min: '14', max: '30', step: '1', value: String(s.fontSize || 18) });
  const sizeVal = el('span', { class: 'range-val', text: `${s.fontSize || 18}px` });
  sizeRange.addEventListener('input', () => {
    sizeVal.textContent = `${sizeRange.value}px`;
    document.documentElement.style.setProperty('--editor-size', `${sizeRange.value}px`);
  });
  sizeRange.addEventListener('change', () => app.saveSettings({ fontSize: Number(sizeRange.value) }));
  appearance.appendChild(settingRow('字号', el('div', { class: 'range-wrap' }, [sizeRange, sizeVal])));

  const lineRange = el('input', { class: 'range', type: 'range', min: '1.4', max: '2.6', step: '0.1', value: String(s.lineHeight || 2) });
  const lineVal = el('span', { class: 'range-val', text: String(s.lineHeight || 2) });
  lineRange.addEventListener('input', () => {
    lineVal.textContent = lineRange.value;
    document.documentElement.style.setProperty('--editor-line', lineRange.value);
  });
  lineRange.addEventListener('change', () => app.saveSettings({ lineHeight: Number(lineRange.value) }));
  appearance.appendChild(settingRow('行距', el('div', { class: 'range-wrap' }, [lineRange, lineVal])));

  const widthRange = el('input', { class: 'range', type: 'range', min: '560', max: '1040', step: '20', value: String(s.width || 780) });
  const widthVal = el('span', { class: 'range-val', text: `${s.width || 780}px` });
  widthRange.addEventListener('input', () => {
    widthVal.textContent = `${widthRange.value}px`;
    document.documentElement.style.setProperty('--editor-width', `${widthRange.value}px`);
  });
  widthRange.addEventListener('change', () => app.saveSettings({ width: Number(widthRange.value) }));
  appearance.appendChild(settingRow('版心宽度', el('div', { class: 'range-wrap' }, [widthRange, widthVal])));

  const indentCb = el('input', { type: 'checkbox' });
  indentCb.checked = Boolean(s.indent);
  indentCb.addEventListener('change', () => app.saveSettings({ indent: indentCb.checked }));
  appearance.appendChild(settingRow('正文首行缩进', indentCb, '仅影响编辑显示与打印稿，不改动正文文本。'));

  const bgBtns = el('div', { class: 'btn-row' });
  bgBtns.appendChild(makeButton(s.bg ? '更换背景图' : '选择背景图', {
    small: true, iconName: 'eye',
    onClick: async () => {
      const file = await openFile({ accept: 'image/*', filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
      if (!file) return;
      if (file.bytes.length > 3 * 1024 * 1024) { toast('背景图请小于 3 MB', 'warn'); return; }
      const mime = file.type || 'image/png';
      const dataUrl = `data:${mime};base64,${uint8ToBase64(file.bytes)}`;
      await app.saveSettings({ bg: dataUrl });
      app.renderMain();
    },
  }));
  if (s.bg) {
    bgBtns.appendChild(makeButton('移除背景', {
      small: true, ghost: true,
      onClick: async () => { await app.saveSettings({ bg: null }); app.renderMain(); },
    }));
  }
  appearance.appendChild(settingRow('自定义背景', bgBtns, '背景会以低透明度显示在编辑区后方。'));
  if (s.bg) {
    const opacity = el('input', { class: 'range', type: 'range', min: '0.03', max: '0.45', step: '0.01', value: String(s.bgOpacity ?? 0.14) });
    opacity.addEventListener('input', () => document.documentElement.style.setProperty('--bg-image-opacity', opacity.value));
    opacity.addEventListener('change', () => app.saveSettings({ bgOpacity: Number(opacity.value) }));
    appearance.appendChild(settingRow('背景透明度', opacity));
  }
  const typeCb = el('input', { type: 'checkbox' });
  typeCb.checked = Boolean(s.typewriter);
  typeCb.addEventListener('change', () => {
    app.state.typewriter = typeCb.checked;
    app.saveSettings({ typewriter: typeCb.checked });
    app.state.editor?.setTypewriter(typeCb.checked);
  });
  appearance.appendChild(settingRow('默认开启打字机模式', typeCb));
  const soundCb = el('input', { type: 'checkbox' });
  soundCb.checked = Boolean(app.settings.typeSound);
  soundCb.addEventListener('change', () => {
    app.saveSettings({ typeSound: soundCb.checked });
    app.renderStatusbar();
  });
  appearance.appendChild(settingRow('打字机音效', soundCb, '使用 Web Audio 合成的轻微按键声，默认关闭。'));

  /* 写作与目标 */
  const writing = section('写作与目标', '目标不是压力，是每天收工时的确定感。');
  const dailyGoal = el('input', { class: 'input small-input', type: 'number', min: 0, step: 500, value: app.state.project?.dailyGoal || 0 });
  dailyGoal.addEventListener('change', async () => {
    await app.updateProject({ dailyGoal: Math.max(0, Number(dailyGoal.value) || 0) });
    app.renderGoalCard();
    toast('每日目标已更新', 'success', 1600);
  });
  writing.appendChild(settingRow('每日目标（字）', dailyGoal));
  const countSelect = el('select', { class: 'input small-input' }, [
    el('option', { value: 'chars', text: '包含标点与符号' }),
    el('option', { value: 'nopunct', text: '不含标点（纯文字）' }),
  ]);
  countSelect.value = s.countNoPunct ? 'nopunct' : 'chars';
  countSelect.addEventListener('change', async () => {
    await app.saveSettings({ countNoPunct: countSelect.value === 'nopunct' });
    app.renderSidebar();
    app.renderStatusbar();
    app.renderInspector();
    toast('字数统计口径已切换', 'info', 2000);
  });
  writing.appendChild(settingRow('字数统计口径', countSelect));
  const totalGoal = el('input', { class: 'input small-input', type: 'number', min: 0, step: 10000, value: app.state.project?.totalGoal || 0 });
  totalGoal.addEventListener('change', () => app.updateProject({ totalGoal: Math.max(0, Number(totalGoal.value) || 0) }));
  writing.appendChild(settingRow('全书目标（字）', totalGoal, '仅作记录，不影响每日进度。'));

  /* 备份 */
  const data = section('数据与备份', '默认每 30 分钟在浏览器/应用中保留一份完整工程快照。');
  data.appendChild(settingRow('本机备份间隔（分钟）', (() => {
    const input = el('input', { class: 'input small-input', type: 'number', min: 10, max: 240, step: 5, value: app.settings.backupIntervalMin || 30 });
    input.addEventListener('change', () => app.saveSettings({ backupIntervalMin: Math.max(10, Number(input.value) || 30) }));
    return input;
  })()));
  const dataBtns = el('div', { class: 'btn-row' });
  dataBtns.appendChild(makeButton('立即创建备份', {
    small: true, primary: true, iconName: 'save',
    onClick: async () => { await createInternalBackup(app); toast('备份已创建', 'success'); },
  }));
  dataBtns.appendChild(makeButton('导出工程', {
    small: true, iconName: 'download',
    onClick: async () => {
      const bundle = await exportProjectBundle(app.state.project.id, { includeVersions: true });
      const { bytes } = buildProjectJson(bundle);
      await saveBytes(bytes, `${safeFileName(app.state.project.name)}-${dateStamp()}.novie`, {
        mime: 'application/json',
        filters: [{ name: 'Novie 工程', extensions: ['novie'] }],
      });
    },
  }));
  dataBtns.appendChild(makeButton('导入工程 / 备份', {
    small: true, iconName: 'upload',
    onClick: () => app.importProjectFlow(),
  }));
  data.appendChild(settingRow('手动操作', dataBtns));

  if (isDesktop()) {
    const dirBtns = el('div', { class: 'btn-row' });
    const dirLabel = el('span', { class: 'muted tiny mono-text', text: app.settings.backupDir || '未选择文件夹' });
    dirBtns.appendChild(makeButton('选择自动备份文件夹', {
      small: true, iconName: 'folder',
      onClick: async () => {
        const dir = await pickDirectory();
        if (!dir) return;
        await app.saveSettings({ backupDir: dir });
        dirLabel.textContent = dir;
      },
    }));
    dirBtns.appendChild(makeButton('立即写入', {
      small: true, ghost: true, iconName: 'save',
      onClick: () => writeFileBackup(app),
    }));
    data.appendChild(settingRow('自动文件备份', dirBtns, '桌面版可用。文件名形如 novie-书名-日期.novie。'));
    const autoCb = el('input', { type: 'checkbox' });
    autoCb.checked = Boolean(app.settings.autoFileBackup);
    autoCb.addEventListener('change', () => app.saveSettings({ autoFileBackup: autoCb.checked }));
    data.appendChild(settingRow('启用定时文件备份', autoCb, '需要先选择文件夹；备份间隔同上。'));
    data.appendChild(el('p', { class: 'muted tiny', text: dirLabel.textContent }));
  } else {
    data.appendChild(el('div', { class: 'notice-box' }, [
      el('span', { class: 'notice-icon', html: icon('info', 16) }),
      el('p', { text: '浏览器模式无法静默写入本地文件夹。请使用桌面版，或定期在“导出”页保存加密备份。' }),
    ]));
  }
  const backupsBox = el('div', { class: 'backup-list' });
  data.appendChild(el('p', { class: 'muted small', text: '最近的本机快照：' }));
  data.appendChild(backupsBox);
  (async () => {
    const list = await listBackups(app.state.project?.id);
    if (!backupsBox.isConnected) return;
    backupsBox.innerHTML = '';
    if (!list.length) { backupsBox.appendChild(el('p', { class: 'muted tiny', text: '暂无备份' })); return; }
    list.slice(0, 5).forEach(rec => {
      const row = el('div', { class: 'backup-row' }, [
        el('span', { text: new Date(rec.createdAt).toLocaleString('zh-CN') }),
        makeButton('恢复为新作品', { small: true, ghost: true, onClick: () => restoreInternalBackup(app, rec) }),
      ]);
      backupsBox.appendChild(row);
    });
  })();

  /* WebDAV */
  const sync = section('WebDAV 备份（可选）', '不绑定任何网盘账号，把备份推到你自己指定的 WebDAV 目录；每次上传都是带时间戳的新文件，不会覆盖云端旧备份。');
  const wd = { ...(app.settings.webdav || {}) };
  const bindWd = (key, input) => input.addEventListener('change', async () => {
    wd[key] = input.value;
    await app.saveSettings({ webdav: wd });
  });
  const wdUrl = el('input', { class: 'input', value: wd.url || '', placeholder: 'https://dav.example.com/remote.php/dav/files/用户名' });
  bindWd('url', wdUrl);
  const wdUser = el('input', { class: 'input', value: wd.user || '', placeholder: '用户名' });
  bindWd('user', wdUser);
  const wdPass = el('input', { class: 'input', type: 'password', value: wd.pass || '', placeholder: '应用密码 / 授权密码' });
  bindWd('pass', wdPass);
  const wdDir = el('input', { class: 'input', value: wd.dir || 'novie', placeholder: 'novie' });
  bindWd('dir', wdDir);
  const wdFile = el('input', { class: 'input', value: wd.filename || 'novie-backup.noviebak', placeholder: 'novie-backup.noviebak' });
  bindWd('filename', wdFile);
  const wdEncrypt = el('input', { type: 'checkbox' });
  wdEncrypt.checked = wd.encrypt !== false;
  wdEncrypt.addEventListener('change', () => { wd.encrypt = wdEncrypt.checked; app.saveSettings({ webdav: wd }); });
  const wdPwd = el('input', { class: 'input', type: 'password', value: wd.password || '', placeholder: '至少 4 位' });
  bindWd('password', wdPwd);
  const syncGrid = el('div', { class: 'form-stack' }, [
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'WebDAV 地址' }), wdUrl]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '远程目录' }), wdDir]),
    ]),
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '用户名' }), wdUser]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '密码' }), wdPass]),
    ]),
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '文件名前缀' }), wdFile]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '加密上传密码' }), wdPwd]),
    ]),
    el('label', { class: 'check-item' }, [wdEncrypt, el('span', { text: '加密上传（强烈建议）' })]),
    el('p', { class: 'muted tiny', text: 'WebDAV 凭据仅保存在本机设置中（明文）。请尽量使用应用专用密码。浏览器模式可能受 CORS 限制，桌面版不受影响。' }),
  ]);
  sync.appendChild(syncGrid);
  const syncStatus = el('p', { class: 'muted small', text: wd.lastUploadAt ? `上次上传：${fmtRelative(wd.lastUploadAt)}` : '尚未上传过。' });
  const syncBtns = el('div', { class: 'btn-row' });
  syncBtns.appendChild(makeButton('测试连接', {
    small: true, iconName: 'cloud',
    onClick: async e => {
      setButtonBusy(e.currentTarget, true, '连接中…');
      const res = await webdavTest(app);
      setButtonBusy(e.currentTarget, false);
      syncStatus.textContent = res.message;
      toast(res.message, res.ok ? 'success' : 'error', 3800);
      syncStatus.classList.toggle('ok-text', res.ok);
    },
  }));
  syncBtns.appendChild(makeButton('上传加密备份', {
    small: true, primary: true, iconName: 'upload',
    onClick: async e => {
      setButtonBusy(e.currentTarget, true, '上传中…');
      const res = await webdavUpload(app);
      setButtonBusy(e.currentTarget, false);
      syncStatus.textContent = res.message;
      toast(res.message, res.ok ? 'success' : 'error', 4200);
    },
  }));
  syncBtns.appendChild(makeButton('从云端恢复', {
    small: true, iconName: 'download',
    onClick: async e => {
      const ok = await confirmDialog('从云端恢复会作为一部新作品导入，不会覆盖当前作品。继续？', { okLabel: '恢复' });
      if (!ok) return;
      setButtonBusy(e.currentTarget, true, '下载中…');
      const res = await webdavRestore(app);
      setButtonBusy(e.currentTarget, false);
      syncStatus.textContent = res.message;
      toast(res.message, res.ok ? 'success' : 'error', 4600);
    },
  }));
  sync.appendChild(syncBtns);
  sync.appendChild(syncStatus);

  /* 数据健康 */
  const health = section('数据健康', '把“防丢稿”变成看得见的：保存、快照、备份的时间线与存储余量。');
  const healthBody = el('div', { class: 'health-body' });
  health.appendChild(healthBody);
  (async () => {
    try {
      const log = (await getApp('healthLog')) || [];
      const s = app.settings;
      const fmtRelOrNever = t => (t ? fmtRelative(t) : '从未');
      const lastOf = type => log.find(e => e.type === type)?.t;
      const tiles = el('div', { class: 'health-tiles' }, [
        el('div', { class: 'health-tile' }, [
          el('span', { class: 'health-label', text: '最近保存' }),
          el('strong', { text: fmtRelOrNever(lastOf('save')) }),
        ]),
        el('div', { class: 'health-tile' }, [
          el('span', { class: 'health-label', text: '最近快照' }),
          el('strong', { text: fmtRelOrNever(lastOf('snapshot')) }),
        ]),
        el('div', { class: 'health-tile' }, [
          el('span', { class: 'health-label', text: '内部备份' }),
          el('strong', { text: fmtRelOrNever(s.lastAutoBackupAt) }),
        ]),
        el('div', { class: 'health-tile' }, [
          el('span', { class: 'health-label', text: '文件备份' }),
          el('strong', { text: isDesktop() ? fmtRelOrNever(s.lastFileBackupAt) : '桌面版专属' }),
        ]),
        el('div', { class: 'health-tile' }, [
          el('span', { class: 'health-label', text: 'WebDAV 上传' }),
          el('strong', { text: fmtRelOrNever(s.webdav?.lastUploadAt) }),
        ]),
      ]);
      healthBody.appendChild(tiles);

      // 备份新鲜度提醒：三类备份全部超过 7 天或从未做过
      const backupTimes = [s.lastAutoBackupAt, s.lastFileBackupAt, s.webdav?.lastUploadAt].filter(Boolean);
      const newest = backupTimes.length ? Math.max(...backupTimes) : 0;
      const stale = Date.now() - newest > 7 * 24 * 60 * 60 * 1000;
      if (stale) {
        healthBody.appendChild(el('p', {
          class: 'health-warn',
          text: newest
            ? `最近一次备份已超过 7 天（${fmtRelative(newest)}）。建议现在创建一次备份。`
            : '还没有做过任何备份。建议立即创建一次内部备份或导出工程文件。',
        }));
      }

      // 存储配额
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const { usage = 0, quota = 0 } = await navigator.storage.estimate();
          if (quota > 0) {
            const pct = Math.min(100, (usage / quota) * 100);
            const fmtBytes = n => (n >= 1024 * 1024
              ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
            const quotaRow = el('div', { class: 'health-quota' }, [
              el('div', { class: 'health-quota-head' }, [
                el('span', { text: '本机数据库占用' }),
                el('span', { class: 'muted tiny', text: `${fmtBytes(usage)} / 约 ${fmtBytes(quota)}` }),
              ]),
              el('div', { class: 'health-quota-track' }, [
                el('span', { class: 'health-quota-fill', style: { width: `${Math.max(1, pct)}%` } }),
              ]),
            ]);
            healthBody.appendChild(quotaRow);
          }
        }
      } catch { /* 配额查询失败不影响面板其余内容 */ }

      // 最近事件时间线
      const events = log.slice(0, 12);
      if (events.length) {
        const typeLabel = { save: '保存', snapshot: '快照', backup: '备份' };
        const timeline = el('div', { class: 'health-timeline' });
        timeline.appendChild(el('div', { class: 'health-timeline-title', text: '最近事件' }));
        for (const e of events) {
          timeline.appendChild(el('div', { class: 'health-event' }, [
            el('span', { class: `health-dot ${e.type}` }),
            el('span', { class: 'health-event-type', text: typeLabel[e.type] || e.type }),
            el('span', { class: 'health-event-label', text: e.label || '' }),
            el('span', { class: 'health-event-time muted tiny', text: fmtRelative(e.t) }),
          ]));
        }
        healthBody.appendChild(timeline);
      } else {
        healthBody.appendChild(el('p', { class: 'muted small', text: '保存或备份几次后，这里会出现事件时间线。' }));
      }
      healthBody.appendChild(el('p', {
        class: 'muted tiny',
        text: '时间线只保存在本机（最近 120 条），用于自查备份习惯，不会上传。',
      }));
    } catch (err) {
      healthBody.appendChild(el('p', { class: 'muted small', text: `数据健康读取失败：${err.message || err}` }));
    }
  })();

  /* 安全 */
  const security = section('安全与隐私', '本地优先不等于自动安全：真正的内容加密请使用加密备份。');
  const pwStatus = el('span', {
    class: 'muted small',
    text: app.state.project?.password ? '已设置打开密码' : '未设置打开密码',
  });
  const secBtns = el('div', { class: 'btn-row' });
  secBtns.appendChild(makeButton(app.state.project?.password ? '修改 / 清除密码' : '设置打开密码', {
    small: true, iconName: 'lock',
    onClick: async () => {
      if (app.state.project?.password) {
        const current = await app.askPassword('验证当前密码', '请输入当前作品密码。', '验证');
        if (current === null) return;
        const ok = await app.verifyCurrentPassword(current);
        if (!ok) { toast('当前密码不正确', 'error'); return; }
      }
      const pwd = await askNewPassword();
      if (pwd === null) return;
      await app.setProjectPassword(pwd);
      app.renderMain();
    },
  }));
  if (app.state.project?.password) {
    secBtns.appendChild(makeButton('清除密码', {
      small: true, ghost: true, danger: true,
      onClick: async () => {
        const ok = await confirmDialog('清除打开密码后，任何人打开本机上的 Novie 都可以直接进入本作品。正文本身仍以明文保存在本地数据库中。', { danger: true, okLabel: '清除密码' });
        if (!ok) return;
        await app.setProjectPassword(null);
        app.renderMain();
      },
    }));
    secBtns.appendChild(makeButton('立即锁定', {
      small: true, ghost: true, iconName: 'lock',
      onClick: () => app.lockProject(),
    }));
  }
  security.appendChild(el('div', { class: 'setting-row' }, [
    el('div', { class: 'setting-label' }, [
      el('span', { text: '作品打开密码' }),
      el('span', { class: 'muted tiny', text: '这是界面锁，不是本地数据库加密。' }),
    ]),
    el('div', { class: 'setting-control' }, [pwStatus, secBtns]),
  ]));
  const lockOnOpen = el('input', { type: 'checkbox' });
  lockOnOpen.checked = app.settings.lockOnOpen !== false;
  lockOnOpen.addEventListener('change', () => app.saveSettings({ lockOnOpen: lockOnOpen.checked }));
  security.appendChild(settingRow('打开作品时要求密码', lockOnOpen));
  const encBtn = makeButton('立即创建加密备份', {
    small: true, iconName: 'shield',
    onClick: async () => {
      const pwd = await askNewPassword();
      if (pwd === null) return;
      const bundle = await exportProjectBundle(app.state.project.id, { includeVersions: true });
      const bytes = await encryptJson(bundle, pwd);
      await saveBytes(bytes, `${safeFileName(app.state.project.name)}-${dateStamp()}.noviebak`, {
        mime: 'application/octet-stream',
        filters: [{ name: 'Novie 加密备份', extensions: ['noviebak'] }],
      });
    },
  });
  security.appendChild(settingRow('加密备份', encBtn, 'AES-GCM 加密后保存，适合放到网盘或 U 盘。'));

  /* 敏感词 */
  const sens = section('自定义敏感词库', '内置词库只是示例，请按目标平台要求维护自己的词表。');
  const sensArea = el('textarea', { class: 'input mono-text', rows: 6, placeholder: '每行一个词，例如：\n超管\n本站\n某平台禁用词' });
  sensArea.value = (app.settings.sensitiveWords || []).join('\n');
  const sensSave = makeButton('保存词库', {
    small: true, primary: true,
    onClick: async () => {
      const words = sensArea.value.split(/\n+/).map(w => w.trim()).filter(Boolean);
      await app.saveSettings({ sensitiveWords: words });
      toast(`已保存 ${words.length} 个自定义词`, 'success');
    },
  });
  sens.appendChild(sensArea);
  sens.appendChild(el('div', { class: 'btn-row' }, [sensSave, el('span', { class: 'muted tiny', text: '检测时会与内置示例词库合并。' })]));

  /* 快捷键 */
  const keys = section('快捷键');
  const table = el('div', { class: 'shortcut-list compact' });
  [
    ['Ctrl + S', '保存'],
    ['Ctrl + Shift + S', '保存并创建快照'],
    ['Ctrl + N', '新建章节'],
    ['Ctrl + F', '全文搜索 / 替换'],
    ['Ctrl + Shift + F', '专注模式'],
    ['Ctrl + Shift + T', '打字机模式'],
    ['Ctrl + J', '一键网文排版'],
    ['Ctrl + Shift + E', '导出中心'],
    ['Alt + 1 ~ 4', '插入快捷短语'],
    ['Alt + ← / →', '上一章 / 下一章'],
    ['F2', '重命名当前章节'],
  ].forEach(([k, v]) => table.appendChild(el('div', { class: 'shortcut-row' }, [
    el('kbd', { text: k }), el('span', { text: v }),
  ])));
  keys.appendChild(table);

  /* 关于 */
  const about = section('关于 Novie');
  about.appendChild(el('p', { class: 'muted small', text: 'Novie 1.0 · 本地优先的网文码字工坊。无账号、无广告、无社区，正文与设定默认只保存在本机。' }));
  about.appendChild(el('p', { class: 'muted tiny', text: '示例作品《魂灯纪》为原创“斗罗风”练笔，仅用于演示功能，不包含任何《斗罗大陆》原文或角色。' }));
  about.appendChild(el('p', { class: 'muted tiny', text: '建议：每周至少导出一次加密备份，并保存到与电脑不同的位置。' }));

  return page;
}
