/* Novie — 写作工具：全文搜索/替换、取名器、快捷插入 */

import {
  el, icon, makeButton, makeIconButton, showModal, contextMenu,
  toast, copyText, emptyState
} from './ui.js';
import {
  debounce, escapeHtml, findInText, htmlToText, countChars, replaceInHtml,
  truncate, parseTags
} from './utils.js';
import { getChapterContent, put } from './db.js';
import { generateNames, NAME_TYPES, mergeSensitiveWords } from './generators.js';

/* ============================= 工具菜单 ============================= */

export function openToolsMenu(app, anchor) {
  const rect = anchor.getBoundingClientRect();
  contextMenu(rect.right - 230, rect.bottom + 6, [
    { label: '一键网文排版', icon: 'alignLeft', hint: 'Ctrl+J', onClick: () => app.smartTypeset() },
    { label: '取个名字…', icon: 'sparkles', onClick: () => openNameGenerator(app) },
    { label: '全文搜索 / 替换…', icon: 'search', onClick: () => openSearchModal(app) },
    {
      label: '敏感词检测', icon: 'shield',
      onClick: () => {
        app.state.rightTab = 'checks';
        app.renderInspector();
        toast('在右侧“检查”面板中点击“检测并标黄”', 'info', 2800);
      },
    },
    { label: '插入快捷短语…', icon: 'zap', onClick: () => openSnippetPicker(app) },
    { label: '插入素材…', icon: 'folder', onClick: () => openMaterialPicker(app) },
    { separator: true },
    { label: '历史快照…', icon: 'history', onClick: () => app.state.activeChapter && app.snapshotChapter(app.state.activeChapter.id) },
    { label: '前后文对照', icon: 'columns', onClick: () => app.openCompareFlow() },
    { label: '开启小黑屋…', icon: 'lock', onClick: () => app.openBlackroomFlow() },
    { separator: true },
    { label: '键盘快捷键', icon: 'keyboard', onClick: () => app.showShortcuts() },
  ], { header: '写作工具' });
}

/* ============================= 搜索 / 替换 ============================= */

export function openSearchModal(app) {
  let scope = 'all';
  let caseSensitive = false;
  let searchToken = 0;
  let lastResults = [];
  let lastQuery = '';
  // 打开弹窗期间缓存各章纯文本，避免每次按键都重读全书 IndexedDB
  let textCache = new Map();

  const searchInput = el('input', { class: 'input search-input', placeholder: '搜索全书…', autofocus: true });
  const scopeRow = el('div', { class: 'segmented small-seg' });
  const scopeAllBtn = el('button', { class: 'segmented-item active', type: 'button', text: '全书' });
  const scopeCurBtn = el('button', { class: 'segmented-item', type: 'button', text: '当前章' });
  scopeRow.appendChild(scopeAllBtn);
  scopeRow.appendChild(scopeCurBtn);
  const caseLabel = el('label', { class: 'check-item' }, [
    (() => { const cb = el('input', { type: 'checkbox' }); cb.addEventListener('change', () => { caseSensitive = cb.checked; runSearch(); }); return cb; })(),
    el('span', { text: '区分大小写' }),
  ]);
  const resultBox = el('div', { class: 'search-results' });
  const resultCount = el('span', { class: 'muted small', text: '输入关键词开始搜索' });
  const replaceInput = el('input', { class: 'input', placeholder: '替换为…（留空即删除）' });
  const replaceBtn = makeButton('替换当前章', {
    small: true, ghost: true,
    onClick: async () => {
      if (!app.state.editor) { toast('请先打开一个章节', 'warn'); return; }
      const query = searchInput.value;
      if (!query) { searchInput.focus(); return; }
      const count = app.state.editor.replaceAll(query, replaceInput.value, caseSensitive);
      if (!count) { toast('当前章没有找到匹配文本', 'info'); return; }
      toast(`当前章已替换 ${count} 处`, 'success');
      app.saveCurrent('replace');
      runSearch();
    },
  });
  const replaceAllBtn = makeButton('替换全书', {
    small: true, danger: true,
    onClick: async () => {
      const query = searchInput.value;
      if (!query) { searchInput.focus(); return; }
      const ok = await import('./ui.js').then(m => m.confirmDialog(
        `将在全书所有章节中把“${query}”替换为“${replaceInput.value}”，操作前会自动保存当前章节。是否继续？`,
        { title: '替换全书', danger: true, okLabel: '开始替换' }
      ));
      if (!ok) return;
      const total = await replaceAcrossProject(app, query, replaceInput.value, caseSensitive);
      textCache = new Map();
      toast(total ? `已替换 ${total} 处` : '没有找到匹配文本', total ? 'success' : 'info', 3000);
      runSearch();
    },
  });

  const modal = showModal({
    title: '搜索与替换',
    subtitle: '正文中的搜索会保留原有排版；替换仅作用于文字节点。',
    width: 780,
    body: el('div', { class: 'search-modal' }, [
      el('div', { class: 'search-top' }, [searchInput, scopeRow, caseLabel]),
      el('div', { class: 'search-meta' }, [resultCount]),
      resultBox,
      el('div', { class: 'replace-row' }, [
        el('div', { class: 'replace-label', text: '替换' }),
        replaceInput,
        replaceBtn,
        replaceAllBtn,
      ]),
    ]),
    actions: [{ label: '关闭', ghost: true }],
  });

  scopeAllBtn.addEventListener('click', () => {
    scope = 'all';
    scopeAllBtn.classList.add('active');
    scopeCurBtn.classList.remove('active');
    runSearch();
  });
  scopeCurBtn.addEventListener('click', () => {
    scope = 'current';
    scopeCurBtn.classList.add('active');
    scopeAllBtn.classList.remove('active');
    runSearch();
  });

  const runSearch = debounce(async () => {
    const query = searchInput.value;
    lastQuery = query;
    if (!query) {
      resultBox.innerHTML = '';
      resultCount.textContent = '输入关键词开始搜索';
      lastResults = [];
      return;
    }
    const token = ++searchToken;
    resultCount.textContent = '搜索中…';
    resultBox.innerHTML = '';
    const results = [];
    const chapters = scope === 'current'
      ? app.orderedChapters().filter(c => c.id === app.state.chapterId)
      : app.orderedChapters();
    for (const chapter of chapters) {
      if (token !== searchToken) return;
      let text = '';
      if (chapter.id === app.state.chapterId && app.state.editor) {
        text = app.state.editor.getText();
      } else if (textCache.has(chapter.id)) {
        text = textCache.get(chapter.id);
      } else {
        const html = await getChapterContent(chapter.id);
        text = htmlToText(html);
        textCache.set(chapter.id, text);
      }
      const hits = findInText(text, query, 40, caseSensitive);
      hits.forEach((hit, i) => {
        results.push({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          volumeTitle: chapter.volumeTitle,
          occurrence: i,
          ...hit,
        });
      });
      if (results.length >= 120) break;
    }
    if (token !== searchToken) return;
    lastResults = results;
    resultCount.textContent = results.length
      ? `找到 ${results.length}${results.length >= 120 ? '+' : ''} 处${scope === 'all' ? '，点击定位到章节' : ''}`
      : '没有找到匹配文本';
    resultBox.innerHTML = '';
    if (!results.length) {
      resultBox.appendChild(emptyState({ iconName: 'search', title: '没有找到', desc: '换个关键词，或切换到全书范围。' }));
      return;
    }
    let lastChapter = null;
    results.slice(0, 120).forEach(res => {
      if (res.chapterId !== lastChapter) {
        lastChapter = res.chapterId;
        resultBox.appendChild(el('div', { class: 'search-chapter-head' }, [
          el('span', { text: res.volumeTitle || '' }),
          el('strong', { text: res.chapterTitle }),
        ]));
      }
      const row = el('button', { class: 'search-hit', type: 'button' });
      const line = el('span', { class: 'search-line' });
      line.appendChild(el('span', { class: 'muted', text: res.before }));
      line.appendChild(el('mark', { text: res.match }));
      line.appendChild(el('span', { class: 'muted', text: res.after }));
      row.appendChild(line);
      row.addEventListener('click', () => {
        modal.close();
        if (res.chapterId === app.state.chapterId && app.state.editor) {
          app.state.editor.selectText(query, res.occurrence, caseSensitive);
          app.state.editor.focus();
        } else {
          app.state.pendingSelect = { query, occurrence: res.occurrence, caseSensitive };
          app.openChapter(res.chapterId);
        }
      });
      resultBox.appendChild(row);
    });
  }, 280);

  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = lastResults[0];
      if (!first) return;
      modal.close();
      if (first.chapterId === app.state.chapterId && app.state.editor) {
        app.state.editor.selectText(lastQuery, first.occurrence, caseSensitive);
        app.state.editor.focus();
      } else {
        app.state.pendingSelect = { query: lastQuery, occurrence: first.occurrence, caseSensitive };
        app.openChapter(first.chapterId);
      }
    }
  });
  setTimeout(() => searchInput.focus(), 80);
}

async function replaceAcrossProject(app, search, replacement, caseSensitive) {
  if (!search) return 0;
  await app.saveCurrent('replaceAll');
  const ordered = app.orderedChapters();
  const activeId = app.state.chapterId;
  const editor = app.state.editor;

  // 1) 先在内存中算出全部命中，确认有结果后才写库
  const pending = [];
  for (const chapter of ordered) {
    const html = await getChapterContent(chapter.id);
    const { html: replaced, count } = replaceInHtml(html, search, replacement, true, caseSensitive);
    if (count) pending.push({ chapter, oldHtml: html, newHtml: replaced, count });
  }
  if (!pending.length) return 0;

  // 2) 写入前为每个受影响章节留快照，可从“历史快照”一键回退
  const label = `替换前快照：${truncate(search, 12)} → ${truncate(replacement, 12)}`;
  for (const p of pending) {
    await app.createSnapshot(p.chapter.id, { label, html: p.oldHtml, silent: true });
  }

  // 3) 应用替换：当前章通过编辑器执行（保留用户输入与撤销能力），其余章直写数据库
  let total = 0;
  for (const p of pending) {
    if (p.chapter.id === activeId && editor) {
      // 快照期间用户可能继续输入，按编辑器当前内容应用替换，避免覆盖新输入
      const applied = editor.replaceAll(search, replacement, caseSensitive);
      if (applied) total += applied;
      continue;
    }
    total += p.count;
    await put('contents', { id: p.chapter.id, html: p.newHtml, updatedAt: Date.now() });
    const chars = countChars(htmlToText(p.newHtml), false);
    const updated = {
      ...app.state.chapters.find(c => c.id === p.chapter.id),
      wordCount: chars,
      wordCountNoPunct: countChars(htmlToText(p.newHtml), true),
      updatedAt: Date.now(),
    };
    await put('chapters', updated);
    app.state.chapters = app.state.chapters.map(c => c.id === updated.id ? updated : c);
  }

  if (editor && activeId) {
    app.state.session.lastCount = editor.getCounts().chars;
    app.state.activeChapter = app.state.chapters.find(c => c.id === activeId) || app.state.activeChapter;
    await app.saveCurrent('replaceAll');
  }
  app.renderSidebar();
  app.renderTabs();
  app.renderStatusbar();
  app.renderInspector();
  return total;
}

/* ============================= 取名器 ============================= */

export function openNameGenerator(app) {
  let type = 'male';
  let results = generateNames(type, 18);
  const listBox = el('div', { class: 'name-grid' });
  const typeRow = el('div', { class: 'chip-row' });
  const typeChips = new Map();
  const paintTypes = () => {
    typeRow.innerHTML = '';
    NAME_TYPES.forEach(t => {
      const chip = el('button', {
        class: `chip ${type === t.key ? 'active' : ''}`.trim(),
        type: 'button', text: t.label,
        onClick: () => { type = t.key; paintTypes(); regenerate(); },
      });
      typeRow.appendChild(chip);
    });
  };
  const regenerate = () => {
    results = generateNames(type, 18);
    paintResults();
  };
  const paintResults = () => {
    listBox.innerHTML = '';
    results.forEach(name => {
      const card = el('div', { class: 'name-card' });
      const label = el('button', { class: 'name-text', type: 'button', text: name, title: '插入到正文' });
      label.addEventListener('click', () => {
        app.insertIntoEditor(name);
        modal.close();
      });
      card.appendChild(label);
      card.appendChild(makeIconButton('copy', '复制', () => copyText(name), { small: true }));
      listBox.appendChild(card);
    });
  };
  const modal = showModal({
    title: '取名器',
    subtitle: '随机组合，仅作灵感起点；可点击名字直接插入正文。',
    width: 700,
    body: el('div', { class: 'name-generator' }, [
      typeRow,
      listBox,
      el('p', { class: 'muted tiny', text: '取名结果不保证唯一，请自行筛选与调整。' }),
    ]),
    actions: [
      { label: '关闭', ghost: true },
      { label: '换一批', icon: 'refresh', onClick: () => { regenerate(); return false; } },
    ],
  });
  paintTypes();
  paintResults();
}

/* ============================= 快捷插入 ============================= */

function openSnippetPicker(app) {
  const body = el('div', { class: 'picker-list' });
  if (!app.state.snippets.length) {
    body.appendChild(emptyState({
      iconName: 'zap', title: '还没有快捷短语',
      desc: '在“素材 → 快捷短语”中创建，或输入触发词后按 Tab。',
    }));
  }
  for (const s of app.state.snippets) {
    const row = el('button', { class: 'picker-row', type: 'button' });
    row.appendChild(el('code', { text: s.trigger }));
    row.appendChild(el('div', { class: 'picker-row-text' }, [
      el('strong', { text: s.title || s.trigger }),
      el('span', { class: 'muted small', text: truncate(s.content, 80) }),
    ]));
    row.addEventListener('click', () => { app.insertIntoEditor(s.content); modal.close(); });
    body.appendChild(row);
  }
  const modal = showModal({ title: '插入快捷短语', body, width: 620, actions: [{ label: '关闭', ghost: true }] });
}

function openMaterialPicker(app) {
  const body = el('div', { class: 'picker-list' });
  if (!app.state.materials.length) {
    body.appendChild(emptyState({
      iconName: 'folder', title: '素材库还是空的',
      desc: '在“素材”页添加描写片段、对话或资料。',
    }));
  }
  for (const m of app.state.materials) {
    const row = el('button', { class: 'picker-row', type: 'button' });
    row.appendChild(el('span', { class: 'tag', text: m.category || '素材' }));
    row.appendChild(el('div', { class: 'picker-row-text' }, [
      el('strong', { text: m.title || '未命名素材' }),
      el('span', { class: 'muted small', text: truncate(m.content, 96) }),
    ]));
    row.addEventListener('click', () => { app.insertIntoEditor(m.content); modal.close(); });
    body.appendChild(row);
  }
  const modal = showModal({ title: '插入素材', body, width: 680, actions: [{ label: '关闭', ghost: true }] });
}
