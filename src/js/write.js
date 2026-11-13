/* Novie — 写作视图、顶部栏、右侧辅助栏、状态栏 */

import {
  $, $$, fmtNumber, fmtWan, escapeHtml, truncate, sanitizeHtml, fmtDate, fmtRelative, fmtClock, safeColor
} from './utils.js';
import {
  icon, el, toast, contextMenu, makeButton, makeIconButton, emptyState,
  showModal, confirmDialog, badge, copyText
} from './ui.js';
import { Editor } from './editor.js';
import { getAllBy } from './db.js';
import { mergeSensitiveWords, findDuplicateParagraphs } from './generators.js';
import { openToolsMenu } from './tools.js';
import { openCharacterEditor } from './views.js';

function chapterLabel(app) {
  const ch = app.state.activeChapter;
  if (!ch) return '';
  const vol = app.state.volumes.find(v => v.id === ch.volumeId);
  return vol ? `${vol.title} / ${ch.title}` : ch.title;
}

export function renderWriteTopbar(app) {
  const wrap = el('div', { class: 'topbar-inner' });
  const active = app.state.activeChapter;
  const breadcrumb = el('div', { class: 'breadcrumb' });
  breadcrumb.appendChild(el('span', { class: 'crumb-project', text: app.state.project?.name || '' }));
  breadcrumb.appendChild(el('span', { class: 'crumb-sep', html: icon('chevronRight', 13) }));
  breadcrumb.appendChild(el('span', {
    class: 'crumb-current',
    text: active ? (app.state.volumes.find(v => v.id === active.volumeId)?.title || '正文') : '未选择章节',
  }));
  if (active) {
    breadcrumb.appendChild(el('span', { class: 'crumb-sep', html: icon('chevronRight', 13) }));
    const titleBtn = el('button', {
      class: 'crumb-title', type: 'button', title: '编辑章节信息',
      text: active.title,
      onclick: () => app.openChapterInfoById(active.id),
    });
    breadcrumb.appendChild(titleBtn);
  }
  wrap.appendChild(breadcrumb);

  const actions = el('div', { class: 'topbar-actions' });
  actions.appendChild(makeButton('新建章节', {
    iconName: 'plus', small: true,
    onClick: () => app.createChapter({}),
  }));
  actions.appendChild(makeIconButton('search', '全文搜索 / 替换 (Ctrl+F)', () => import('./tools.js').then(m => m.openSearchModal(app))));
  actions.appendChild(makeIconButton('wand', '写作工具', e => openToolsMenu(app, e.currentTarget), {}));
  actions.appendChild(makeIconButton('columns', '前后文对照', () => app.openCompareFlow()));
  actions.appendChild(makeIconButton(app.state.inspectorOpen ? 'chevronRight' : 'chevronLeft', app.state.inspectorOpen ? '收起辅助栏' : '展开辅助栏', () => {
    app.state.inspectorOpen = !app.state.inspectorOpen;
    app.applyClasses();
    app.renderTopbar();
    setTimeout(() => app.state.editor?.focus(), 20);
  }));
  actions.appendChild(makeIconButton('maximize', '专注模式 (Ctrl+Shift+F)', () => app.toggleFocus(), { active: app.state.focusMode }));
  actions.appendChild(makeIconButton('type', '打字机模式 (Ctrl+Shift+T)', () => app.toggleTypewriter(), { active: app.state.typewriter }));
  actions.appendChild(makeIconButton('lock', '小黑屋', () => app.openBlackroomFlow(), { active: app.isLocked() }));
  actions.appendChild(makeIconButton('more', '更多操作', e => {
    const rect = e.currentTarget.getBoundingClientRect();
    contextMenu(rect.right - 220, rect.bottom + 6, [
      { label: '章节信息 / 摘要…', icon: 'edit', onClick: () => active && app.openChapterInfoById(active.id) },
      { label: '历史快照…', icon: 'history', onClick: () => active && app.snapshotChapter(active.id) },
      { label: '在光标处拆分为两章', icon: 'columns', onClick: () => active && app.splitChapterAtCaret(active.id) },
      { label: '与下一章合并', icon: 'layers', onClick: () => active && app.mergeChapterWithNext(active.id) },
      { separator: true },
      { label: '导出本章 TXT', icon: 'download', onClick: () => active && app.exportCurrentChapterTxt(active.id) },
      { label: '打开导出 / 备份中心', icon: 'upload', onClick: () => app.switchView('export') },
      { separator: true },
      { label: '键盘快捷键', icon: 'keyboard', onClick: () => app.showShortcuts() },
    ], { header: '章节操作' });
  }));
  wrap.appendChild(actions);
  return wrap;
}

export function renderWriteView(app) {
  const wrap = el('div', { class: 'write-view' });
  const active = app.state.activeChapter;

  if (!active) {
    const host = el('div', { class: 'write-empty' });
    host.appendChild(emptyState({
      iconName: 'pen',
      title: '从第一章开始',
      desc: app.state.chapters.length ? '从左侧目录选择一章，或新建一章。' : '这部作品还没有章节。新建一章，写下第一句话。',
      actionLabel: '新建章节',
      onAction: () => app.createChapter({}),
    }));
    const tip = el('p', { class: 'muted small', text: '提示：所有内容会自动保存到本机，Ctrl+S 可手动保存，Ctrl+Shift+S 创建快照。' });
    host.appendChild(tip);
    wrap.appendChild(host);
    return wrap;
  }

  const tabbar = el('div', { id: 'tabbar', class: 'tabbar' });
  wrap.appendChild(tabbar);
  renderTabsInto(app, tabbar);

  if (app.state.lock) {
    const lock = app.state.lock;
    const banner = el('div', { id: 'lock-banner', class: 'lock-banner' });
    banner.appendChild(el('div', { class: 'lock-banner-icon', html: icon('lock', 18) }));
    banner.appendChild(el('div', { class: 'lock-banner-main' }, [
      el('strong', { text: '小黑屋进行中' }),
      el('span', { class: 'muted small', text: `《${lock.chapterTitle || active.title}》 · 完成目标后才能离开` }),
    ]));
    banner.appendChild(el('div', { class: 'lock-banner-stats' }, [
      el('span', { id: 'lock-words', class: 'lock-pill' }),
      el('span', { id: 'lock-time', class: 'lock-pill' }),
    ]));
    banner.appendChild(makeButton('紧急退出', {
      ghost: true, small: true, danger: true,
      onClick: () => app.showEmergencyExit(),
    }));
    wrap.appendChild(banner);
  }

  if (app.state.focusMode) {
    const exit = makeButton('退出专注 · Esc', {
      small: true, ghost: true,
      onClick: () => app.toggleFocus(false),
    });
    exit.classList.add('focus-exit');
    wrap.appendChild(exit);
  }

  const area = el('div', { class: 'writing-area' });
  if (app.state.compare.enabled) area.classList.add('has-compare');

  const editorPanel = el('div', { class: 'editor-panel' });
  const toolbar = el('div', { class: 'editor-toolbar' });
  const toolGroup = (buttons) => {
    const g = el('div', { class: 'tool-group' });
    buttons.forEach(b => g.appendChild(b));
    return g;
  };
  const fmtBtn = (label, title, cmd, value = null) => {
    const b = el('button', {
      class: 'tool-btn tool-text', type: 'button', title,
      text: label,
      onclick: () => app.state.editor?.exec(cmd, value),
    });
    if (cmd === 'bold') b.style.fontWeight = '800';
    if (cmd === 'italic') b.style.fontStyle = 'italic';
    if (cmd === 'underline') b.style.textDecoration = 'underline';
    if (cmd === 'strikeThrough') b.style.textDecoration = 'line-through';
    return b;
  };
  toolbar.appendChild(toolGroup([
    makeIconButton('undo', '撤销 (Ctrl+Z)', () => app.state.editor?.undo(), { small: true }),
    makeIconButton('redo', '重做 (Ctrl+Y)', () => app.state.editor?.redo(), { small: true }),
    el('span', { class: 'tool-sep' }),
    fmtBtn('B', '加粗 (Ctrl+B)', 'bold'),
    fmtBtn('I', '斜体 (Ctrl+I)', 'italic'),
    fmtBtn('U', '下划线 (Ctrl+U)', 'underline'),
    fmtBtn('S', '删除线', 'strikeThrough'),
    el('span', { class: 'tool-sep' }),
    makeIconButton('quote', '引用段落', () => app.state.editor?.exec('formatBlock', 'blockquote'), { small: true }),
    makeIconButton('minus', '分割线', () => app.state.editor?.exec('insertHorizontalRule'), { small: true }),
    el('span', { class: 'tool-sep' }),
    makeIconButton('alignLeft', '一键排版：清理段首尾空格、规范引号、删除空段 (Ctrl+J)', () => app.smartTypeset()),
  ]));
  const spacer = el('div', { class: 'toolbar-spacer' });
  toolbar.appendChild(spacer);
  toolbar.appendChild(toolGroup([
    el('span', { class: 'tool-hint', text: '自动保存' }),
    makeIconButton('save', '保存', () => app.saveCurrent('manual'), { small: true }),
    makeIconButton('wand', '工具：取名 / 搜索 / 素材', e => openToolsMenu(app, e.currentTarget), { small: true }),
  ]));

  editorPanel.appendChild(toolbar);
  const scroll = el('div', { class: 'editor-scroll', id: 'editor-scroll' });
  const editor = el('div', {
    class: `editor ${app.settings.indent ? 'indent' : ''}`.trim(),
    id: 'main-editor',
    contenteditable: 'true',
    spellcheck: 'false',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': '正文编辑器',
    'data-placeholder': '从这里开始…',
  });
  scroll.appendChild(editor);
  editorPanel.appendChild(scroll);
  area.appendChild(editorPanel);

  if (app.state.compare.enabled) {
    const chapter = app.state.chapters.find(c => c.id === app.state.compare.chapterId);
    const pane = el('div', { class: 'compare-panel' });
    const head = el('div', { class: 'compare-head' });
    const select = el('select', { class: 'compare-select' });
    app.orderedChapters().forEach(c => {
      const opt = el('option', { value: c.id, text: `${c.volumeTitle ? c.volumeTitle + ' · ' : ''}${c.title}` });
      if (c.id === app.state.compare.chapterId) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => app.openCompare(select.value));
    head.appendChild(el('span', { class: 'compare-label', html: `${icon('columns', 14)}<span>前后文对照（只读）</span>` }));
    head.appendChild(select);
    head.appendChild(makeIconButton('x', '关闭对照', () => app.closeCompare(), { small: true }));
    pane.appendChild(head);
    const content = el('div', { class: 'compare-content' });
    content.innerHTML = sanitizeHtml(app.state.compare.html || '<p class="muted">（空章节）</p>');
    pane.appendChild(content);
    area.appendChild(pane);
  }

  wrap.appendChild(area);

  // 初始化编辑器（DOM 尚未挂载也可正常工作）
  const instance = new Editor({
    root: editor,
    scrollRoot: scroll,
    onChange: counts => app.handleEditorChange(counts),
    getSnippets: () => app.state.snippets,
    onSelectText: text => app.handleTextSelection(text),
    onKey: e => app.handleEditorKey(e),
  });
  instance.setContent(app.state.currentHtml || '');
  app.afterEditorInit(instance);
  return wrap;
}

export function renderTabs(app) {
  const host = document.getElementById('tabbar');
  if (host) renderTabsInto(app, host);
}

function renderTabsInto(app, host) {
  host.innerHTML = '';
  const tabs = app.state.openTabs
    .map(id => app.state.chapters.find(c => c.id === id))
    .filter(Boolean);
  for (const chapter of tabs) {
    const active = chapter.id === app.state.chapterId;
    const tab = el('div', {
      class: `tab ${active ? 'active' : ''}`.trim(),
      title: chapter.title,
    });
    const title = el('button', {
      class: 'tab-title', type: 'button', text: chapter.title,
      onClick: () => app.openChapter(chapter.id),
    });
    tab.appendChild(title);
    const close = el('button', {
      class: 'tab-close', type: 'button', title: '关闭标签页', 'aria-label': '关闭标签页',
      html: icon('x', 12),
      onClick: e => { e.stopPropagation(); app.closeTab(chapter.id); },
    });
    tab.appendChild(close);
    if (active) setTimeout(() => tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 0);
    host.appendChild(tab);
  }
  host.appendChild(el('button', {
    class: 'tab-add', type: 'button', title: '新建章节', html: icon('plus', 14),
    onClick: () => app.createChapter({}),
  }));
}

/* ============================= Inspector ============================= */

export function renderInspector(app) {
  const chapter = app.state.activeChapter;
  const wrap = el('div', { class: 'inspector-inner' });
  const head = el('div', { class: 'inspector-head' });
  const tabs = [
    { key: 'meta', label: '概要' },
    { key: 'people', label: '人物' },
    { key: 'materials', label: '素材' },
    { key: 'checks', label: '检查' },
  ];
  const tabBox = el('div', { class: 'inspector-tabs' });
  for (const t of tabs) {
    tabBox.appendChild(el('button', {
      class: `inspector-tab ${app.state.rightTab === t.key ? 'active' : ''}`.trim(),
      type: 'button', text: t.label,
      onClick: () => { app.state.rightTab = t.key; app.renderInspector(); },
    }));
  }
  head.appendChild(tabBox);
  head.appendChild(makeIconButton('x', '收起辅助栏', () => {
    app.state.inspectorOpen = false;
    app.applyClasses();
    app.renderTopbar();
  }, { small: true }));
  wrap.appendChild(head);

  const body = el('div', { class: 'inspector-body' });
  if (!chapter) {
    body.appendChild(el('p', { class: 'muted small', text: '选择章节后显示辅助信息。' }));
  } else if (app.state.rightTab === 'meta') {
    renderMetaPanel(app, body, chapter);
  } else if (app.state.rightTab === 'people') {
    renderPeoplePanel(app, body);
  } else if (app.state.rightTab === 'materials') {
    renderMaterialsPanel(app, body);
  } else {
    renderChecksPanel(app, body);
  }
  wrap.appendChild(body);
  return wrap;
}

function renderMetaPanel(app, host, chapter) {
  const volume = app.state.volumes.find(v => v.id === chapter.volumeId);
  const counts = app.state.editor?.getCounts();
  const chars = counts ? (app.settings.countNoPunct ? counts.charsNoPunct : counts.chars) : app.chapterWordCount(chapter);
  const target = chapter.targetWords || 0;
  const pct = target ? Math.min(100, (chars / target) * 100) : 0;

  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-chapter-title', text: chapter.title }),
    el('div', { class: 'insp-chapter-sub' }, [
      el('span', { text: volume?.title || '未分卷' }),
      badge(chapter.status === 'done' ? '已完成' : chapter.status === 'writing' ? '写作中' : '未写',
        chapter.status === 'done' ? 'success' : chapter.status === 'writing' ? 'accent' : ''),
    ]),
  ]));

  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-stats' }, [
      el('div', { class: 'insp-stat' }, [
        el('strong', { id: 'insp-word', text: fmtNumber(chars) }),
        el('span', { text: `本章字数${app.settings.countNoPunct ? '（不含标点）' : ''}` }),
      ]),
      el('div', { class: 'insp-stat' }, [
        el('strong', { id: 'insp-word-punct', text: fmtNumber(counts ? counts.charsNoPunct : chapter.wordCountNoPunct || 0) }),
        el('span', { text: '不含标点' }),
      ]),
    ]),
    target ? el('div', { class: 'target-box' }, [
      el('div', { class: 'target-top' }, [
        el('span', { class: 'muted small', text: `目标 ${fmtNumber(target)} 字` }),
        el('span', { class: 'muted small', text: `${pct.toFixed(0)}%` }),
      ]),
      el('div', { class: 'progress' }, [
        el('span', { id: 'insp-target-bar', class: 'progress-bar', style: { width: `${pct}%` } }),
      ]),
    ]) : null,
  ]));

  const summary = el('textarea', {
    class: 'input textarea', rows: 4, placeholder: '本章梗概、关键事件、埋下的伏笔…',
  });
  summary.value = chapter.summary || '';
  summary.addEventListener('blur', () => {
    const val = summary.value.trim();
    if (val !== (chapter.summary || '')) app.updateChapterMeta(chapter.id, { summary: val });
  });
  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-label-row' }, [
      el('span', { class: 'insp-label', text: '本章摘要' }),
      el('span', { class: 'muted tiny', text: '失焦自动保存' }),
    ]),
    summary,
  ]));

  const status = el('select', { class: 'input' }, [
    el('option', { value: 'todo', text: '未写' }),
    el('option', { value: 'writing', text: '写作中' }),
    el('option', { value: 'done', text: '已完成' }),
  ]);
  status.value = chapter.status || 'todo';
  status.addEventListener('change', () => app.updateChapterMeta(chapter.id, { status: status.value }));
  const targetInput = el('input', {
    class: 'input', type: 'number', min: 0, step: 500,
    value: chapter.targetWords || 0,
  });
  targetInput.addEventListener('change', () => {
    app.updateChapterMeta(chapter.id, { targetWords: Math.max(0, Number(targetInput.value) || 0) });
  });
  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field compact' }, [el('span', { class: 'field-label', text: '状态' }), status]),
      el('label', { class: 'field compact' }, [el('span', { class: 'field-label', text: '目标字数' }), targetInput]),
    ]),
  ]));

  const tagsInput = el('input', {
    class: 'input', value: (chapter.tags || []).join('，'), placeholder: '逗号分隔',
  });
  tagsInput.addEventListener('blur', () => {
    app.updateChapterMeta(chapter.id, { tags: tagsInput.value });
  });
  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-label', text: '标签' }),
    tagsInput,
  ]));

  if (app.state.plotlines.length) {
    const list = el('div', { class: 'insp-plotlist' });
    for (const line of app.state.plotlines) {
      const checked = (chapter.plotlineIds || []).includes(line.id);
      const row = el('label', { class: 'insp-plotline' });
      const cb = el('input', { type: 'checkbox' });
      cb.checked = checked;
      cb.addEventListener('change', () => {
        const ids = new Set(chapter.plotlineIds || []);
        if (cb.checked) ids.add(line.id); else ids.delete(line.id);
        app.updateChapterMeta(chapter.id, { plotlineIds: Array.from(ids) });
      });
      row.appendChild(cb);
      row.appendChild(el('span', { class: 'color-dot', style: { background: line.color || '#b4552d' } }));
      row.appendChild(el('span', { text: line.name }));
      list.appendChild(row);
    }
    host.appendChild(el('div', { class: 'insp-section' }, [
      el('div', { class: 'insp-label', text: '关联剧情线' }),
      list,
    ]));
  }

  const ordered = app.orderedChapters();
  const currentIdx = ordered.findIndex(c => c.id === chapter.id);
  const previous = currentIdx > 0 ? ordered.slice(Math.max(0, currentIdx - 2), currentIdx).reverse() : [];
  if (previous.length) {
    const prevList = el('div', { class: 'prev-chapter-list' });
    previous.forEach(prev => {
      const row = el('div', { class: 'prev-chapter' });
      row.appendChild(el('div', { class: 'prev-chapter-main' }, [
        el('strong', { text: prev.title }),
        el('p', { class: 'prev-chapter-summary', text: prev.summary || '上一章暂无摘要。' }),
      ]));
      row.appendChild(makeIconButton('arrowRight', '打开前文', () => app.openChapter(prev.id), { small: true }));
      prevList.appendChild(row);
    });
    host.appendChild(el('div', { class: 'insp-section' }, [
      el('div', { class: 'insp-label-row' }, [
        el('span', { class: 'insp-label', text: '前文回看' }),
        el('span', { class: 'muted tiny', text: '来自章节摘要' }),
      ]),
      prevList,
    ]));
  }

  const snapBox = el('div', { class: 'snapshot-mini' });
  snapBox.appendChild(el('p', { class: 'muted tiny', text: '加载中…' }));
  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-label-row' }, [
      el('span', { class: 'insp-label', text: '历史快照' }),
      makeButton('查看全部', {
        small: true, ghost: true,
        onClick: () => app.snapshotChapter(chapter.id),
      }),
    ]),
    snapBox,
    makeButton('创建当前快照', {
      small: true, iconName: 'history', ghost: true,
      onClick: () => app.createSnapshot(chapter.id),
    }),
  ]));
  loadSnapshotMini(app, snapBox, chapter.id);

  host.appendChild(el('div', { class: 'insp-section insp-tips' }, [
    el('p', { class: 'muted tiny', text: '写作时按 Ctrl+S 保存，Ctrl+Shift+S 保存并快照。所有正文自动保存在本机。' }),
  ]));
}

async function loadSnapshotMini(app, host, chapterId) {
  try {
    const versions = (await getAllBy('versions', 'chapterId', chapterId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 3);
    if (!host.isConnected) return;
    host.innerHTML = '';
    if (!versions.length) {
      host.appendChild(el('p', { class: 'muted tiny', text: '暂无快照' }));
      return;
    }
    for (const v of versions) {
      const row = el('div', { class: 'snapshot-mini-row' });
      row.appendChild(el('div', { class: 'snapshot-mini-meta' }, [
        el('span', { text: v.label || '快照' }),
        el('span', { class: 'muted tiny', text: fmtRelative(v.createdAt) }),
      ]));
      row.appendChild(makeButton('恢复', {
        small: true, ghost: true,
        onClick: async () => {
          const ok = await confirmDialog(`恢复 ${fmtRelative(v.createdAt)} 的「${v.label}」？当前内容会先自动备份。`, { okLabel: '恢复' });
          if (ok) app.restoreSnapshot(v);
        },
      }));
      host.appendChild(row);
    }
  } catch (err) {
    console.warn(err);
  }
}

function renderPeoplePanel(app, host, keyword = '') {
  host.innerHTML = '';
  const search = el('input', { class: 'input', placeholder: '搜索人物…', value: keyword });
  search.addEventListener('input', () => {
    renderPeoplePanel(app, host, search.value.trim());
    host.querySelector('input').focus();
    host.querySelector('input').setSelectionRange(keyword.length, keyword.length);
  });
  const addBtn = makeButton('管理人物', {
    small: true, ghost: true,
    onClick: () => app.switchView('characters'),
  });
  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-label-row' }, [
      el('span', { class: 'insp-label', text: '人物速查' }),
      addBtn,
    ]),
    search,
  ]));
  const list = el('div', { class: 'mini-people' });
  const chars = app.state.characters.filter(c =>
    !keyword || c.name.includes(keyword) || (c.alias || '').includes(keyword) || (c.role || '').includes(keyword)
  );
  if (!chars.length) {
    list.appendChild(el('p', { class: 'muted small', text: app.state.characters.length ? '没有匹配的人物。' : '还没有人物档案。' }));
  }
  for (const c of chars) {
    const card = el('div', { class: 'mini-person' });
    card.appendChild(el('span', {
      class: 'mini-avatar', style: { background: safeColor(c.color) },
      text: (c.name || '?').slice(0, 1),
    }));
    const info = el('div', { class: 'mini-person-info' });
    info.appendChild(el('div', { class: 'mini-person-name' }, [
      el('strong', { text: c.name }),
      el('span', { class: 'tag', text: c.role || '人物' }),
    ]));
    info.appendChild(el('p', { class: 'mini-person-bio', text: truncate(c.personality || c.identity || c.bio || '暂无档案', 44) }));
    card.appendChild(info);
    const actions = el('div', { class: 'mini-person-actions' });
    actions.appendChild(makeIconButton('plus', '插入姓名', () => app.insertIntoEditor(c.name), { small: true }));
    actions.appendChild(makeIconButton('edit', '编辑档案', () => openCharacterEditor(app, c), { small: true }));
    card.appendChild(actions);
    const mentioned = (app.state.activeChapter?.mentions || []).includes(c.id);
    if (mentioned) card.classList.add('mentioned');
    if (app.state.selectedCharacterId === c.id) card.classList.add('selected');
    list.appendChild(card);
  }
  host.appendChild(list);
  host.appendChild(el('p', { class: 'muted tiny', text: '点击“＋”把人物名插入正文；在正文中选中人名可定位档案。' }));
  requestAnimationFrame(() => {
    list.querySelector('.mini-person.selected')?.scrollIntoView({ block: 'nearest' });
  });
}

function renderMaterialsPanel(app, host) {
  host.innerHTML = '';
  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-label-row' }, [
      el('span', { class: 'insp-label', text: '快捷短语' }),
      makeButton('管理', { small: true, ghost: true, onClick: () => app.switchView('materials') }),
    ]),
  ]));
  const snips = el('div', { class: 'snippet-list' });
  if (!app.state.snippets.length) snips.appendChild(el('p', { class: 'muted small', text: '还没有快捷短语。' }));
  app.state.snippets.forEach(s => {
    const row = el('button', { class: 'snippet-row', type: 'button', title: s.content });
    row.appendChild(el('span', { class: 'snippet-trigger', text: s.trigger || '•' }));
    row.appendChild(el('span', { class: 'snippet-content', text: truncate(s.title || s.content, 26) }));
    row.appendChild(el('span', { class: 'snippet-insert', html: icon('plus', 13) }));
    row.addEventListener('click', () => app.insertIntoEditor(s.content));
    snips.appendChild(row);
  });
  host.appendChild(snips);
  host.appendChild(el('p', { class: 'muted tiny', text: '在正文输入触发词后按 Tab 可直接展开，例如 “;xj”。' }));

  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-label-row' }, [
      el('span', { class: 'insp-label', text: '素材库' }),
      makeButton('管理', { small: true, ghost: true, onClick: () => app.switchView('materials') }),
    ]),
  ]));
  const mats = el('div', { class: 'mini-materials' });
  if (!app.state.materials.length) mats.appendChild(el('p', { class: 'muted small', text: '还没有素材。' }));
  app.state.materials.slice(0, 12).forEach(m => {
    const card = el('div', { class: 'mini-material' });
    card.appendChild(el('div', { class: 'mini-material-head' }, [
      el('strong', { text: m.title || '素材' }),
      el('span', { class: 'tag', text: m.category || '未分类' }),
    ]));
    card.appendChild(el('p', { class: 'mini-material-body', text: truncate(m.content, 70) }));
    const actions = el('div', { class: 'mini-material-actions' });
    actions.appendChild(makeButton('插入', { small: true, ghost: true, onClick: () => app.insertIntoEditor(m.content) }));
    actions.appendChild(makeButton('复制', { small: true, ghost: true, onClick: () => copyText(m.content) }));
    card.appendChild(actions);
    mats.appendChild(card);
  });
  host.appendChild(mats);
}

function renderChecksPanel(app, host) {
  host.innerHTML = '';
  const words = mergeSensitiveWords(app.settings.sensitiveWords || []);
  const resultBox = el('div', { class: 'check-results' });
  const summary = el('p', { class: 'muted small', text: '在内置示例词库与自定义词库中检查本章。检测结果仅供参考，请人工复核。' });

  const runCheck = () => {
    if (!app.state.editor) return;
    const result = app.state.editor.markSensitive(words);
    resultBox.innerHTML = '';
    if (!result.total) {
      resultBox.appendChild(el('div', { class: 'check-ok', html: `${icon('check', 16)}<span>未发现敏感词命中</span>` }));
      return;
    }
    resultBox.appendChild(el('div', { class: 'check-summary' }, [
      el('strong', { text: `命中 ${result.total} 处` }),
      el('span', { class: 'muted small', text: '正文已临时标黄，切换章节后自动清除。' }),
    ]));
    const list = el('div', { class: 'check-word-list' });
    result.byWord.forEach(item => {
      const row = el('div', { class: 'check-word' });
      row.appendChild(el('span', { class: 'check-word-text', text: item.word }));
      row.appendChild(el('span', { class: 'check-word-count', text: `${item.count} 次` }));
      let occ = 0;
      row.appendChild(makeButton('定位', {
        small: true, ghost: true,
        onClick: () => {
          const editor = app.state.editor;
          if (!editor) return;
          // 每次点击轮换到下一处；超出实际数量时回到第一处
          if (editor.selectText(item.word, occ)) occ += 1;
          else { occ = 1; editor.selectText(item.word, 0); }
        },
      }));
      row.appendChild(makeButton('打码', {
        small: true, ghost: true, danger: true,
        onClick: async () => {
          if (!app.state.editor || !app.state.activeChapter) return;
          await app.createSnapshot(app.state.activeChapter.id, { label: '打码前快照', silent: true });
          const masked = '＊'.repeat(Array.from(item.word).length);
          const count = app.state.editor.replaceAll(item.word, masked);
          toast(`已将「${item.word}」替换为「${masked}」共 ${count} 处，并保留打码前快照`, 'success', 3200);
          runCheck();
        },
      }));
      list.appendChild(row);
    });
    resultBox.appendChild(list);
  };

  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-label-row' }, [
      el('span', { class: 'insp-label', text: '敏感词检测' }),
      makeButton('词库设置', { small: true, ghost: true, onClick: () => app.switchView('settings') }),
    ]),
    summary,
    el('div', { class: 'btn-row' }, [
      makeButton('检测并标黄', { small: true, primary: true, iconName: 'eye', onClick: runCheck }),
      makeButton('清除标黄', { small: true, ghost: true, onClick: () => {
        app.state.editor?.clearSensitiveMarks();
        resultBox.innerHTML = '';
        toast('已清除标黄', 'info', 1200);
      } }),
    ]),
    resultBox,
  ]));

  const dupBox = el('div', { class: 'check-results' });
  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-label', text: '重复段落检测' }),
    el('p', { class: 'muted small', text: '找出本章中重复出现的较长段落，帮助发现复制粘贴残留或前后矛盾。' }),
    makeButton('开始检测', {
      small: true, ghost: true, iconName: 'copy',
      onClick: () => {
        const text = app.state.editor?.getText() || '';
        const dups = findDuplicateParagraphs(text);
        dupBox.innerHTML = '';
        if (!dups.length) {
          dupBox.appendChild(el('div', { class: 'check-ok', html: `${icon('check', 16)}<span>没有发现重复段落</span>` }));
          return;
        }
        dups.forEach(d => {
          dupBox.appendChild(el('div', { class: 'dup-item' }, [
            el('div', { class: 'dup-meta', text: `出现 ${d.count} 次 · ${d.text.length} 字` }),
            el('p', { class: 'dup-text', text: truncate(d.text, 80) }),
          ]));
        });
      },
    }),
    dupBox,
  ]));

  host.appendChild(el('div', { class: 'insp-section' }, [
    el('div', { class: 'insp-label', text: '本章信息' }),
    el('div', { class: 'kv-list' }, [
      el('div', { class: 'kv row' }, [el('span', { text: '状态' }), el('strong', { text: app.state.activeChapter?.status === 'done' ? '已完成' : app.state.activeChapter?.status === 'writing' ? '写作中' : '未写' })]),
      el('div', { class: 'kv' }, [el('span', { text: '创建时间' }), el('span', { text: fmtDate(app.state.activeChapter?.createdAt, true) })]),
      el('div', { class: 'kv' }, [el('span', { text: '最后保存' }), el('span', { text: fmtDate(app.state.lastSavedAt, true) })]),
      el('div', { class: 'kv' }, [el('span', { text: '本章目标' }), el('span', { text: app.state.activeChapter?.targetWords ? `${fmtNumber(app.state.activeChapter.targetWords)} 字` : '未设置' })]),
    ]),
  ]));
}

/* ============================= Statusbar ============================= */

export function renderStatusbar(app) {
  const wrap = el('div', { class: 'statusbar-inner' });
  const left = el('div', { class: 'status-left' });
  left.appendChild(el('span', { class: 'save-dot' }));
  left.appendChild(el('span', { id: 'live-save', class: 'save-text', text: '已保存' }));
  left.appendChild(el('span', { class: 'status-sep' }));
  left.appendChild(el('span', { class: 'muted tiny', text: '上次保存' }));
  left.appendChild(el('span', { id: 'live-saved-at', class: 'muted tiny', text: '—' }));
  wrap.appendChild(left);

  const mid = el('div', { class: 'status-mid' });
  if (app.state.view === 'write' && app.state.activeChapter) {
    mid.appendChild(el('span', { text: '本章' }));
    mid.appendChild(el('strong', { id: 'live-chapter', text: `${fmtNumber(app.chapterWordCount(app.state.activeChapter))} 字` }));
    mid.appendChild(el('span', { class: 'status-sep' }));
  }
  mid.appendChild(el('span', { text: '全书' }));
  mid.appendChild(el('strong', { text: `${fmtWan(app.projectWordCount())}字` }));
  wrap.appendChild(mid);

  const right = el('div', { class: 'status-right' });
  right.appendChild(el('span', { class: 'status-goal', html: `${icon('target', 13)}<span>今日 <strong id="live-today">${fmtNumber(app.state.project ? app.getTodayRecord().words : 0)}</strong> 字</span>` }));
  right.appendChild(el('span', { class: 'status-sep' }));
  right.appendChild(el('span', { class: 'status-speed', html: `${icon('zap', 13)}<span id="live-speed">${app.speed() ? `${fmtNumber(app.speed())} 字/时` : '—'}</span>` }));
  right.appendChild(el('span', { class: 'status-sep' }));
  right.appendChild(el('span', { class: 'status-clock', html: `${icon('clock', 13)}<span id="live-clock">${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>` }));
  right.appendChild(el('span', { class: 'status-sep' }));
  right.appendChild(el('span', { class: 'status-session', html: `${icon('timer', 13)}<span>本次 <strong id="live-session">${fmtClock(app.state.session.activeSeconds || 0)}</strong></span>` }));
  right.appendChild(el('span', { class: 'status-sep' }));
  right.appendChild(makeIconButton(app.settings.typeSound ? 'volume2' : 'volumeX', app.settings.typeSound ? '关闭打字音效' : '开启打字音效', () => app.toggleTypeSound(), { small: true, active: app.settings.typeSound }));
  const focusBtn = makeIconButton('maximize', '专注模式', () => app.toggleFocus(), { small: true, active: app.state.focusMode });
  const typeBtn = makeIconButton('type', '打字机模式', () => app.toggleTypewriter(), { small: true, active: app.state.typewriter });
  right.appendChild(focusBtn);
  right.appendChild(typeBtn);
  wrap.appendChild(right);
  return wrap;
}
