/* Novie — 侧边栏、章节树、项目切换 */

import { $, fmtNumber, fmtWan, truncate, debounce } from './utils.js';
import {
  icon, el, contextMenu, confirmDialog, promptDialog, showModal,
  emptyState, makeButton, makeIconButton, badge
} from './ui.js';
import { countOverdueForeshadows } from './views2.js';

const NAV_ITEMS = [
  { key: 'write', label: '写作', icon: 'pen' },
  { key: 'outline', label: '大纲', icon: 'outline' },
  { key: 'characters', label: '人物', icon: 'users' },
  { key: 'lore', label: '设定', icon: 'book' },
  { key: 'materials', label: '素材', icon: 'folder' },
  { key: 'plot', label: '剧情线', icon: 'branch' },
  { key: 'stats', label: '统计', icon: 'chart' },
  { key: 'export', label: '导出', icon: 'download' },
  { key: 'settings', label: '设置', icon: 'settings' },
];

export function renderSidebar(app) {
  renderNav(app);
  renderProjectButton(app);
  renderTree(app);
  renderGoalCard(app);
}

function navBadge(app, key) {
  const s = app.state;
  switch (key) {
    case 'write': return s.chapters.length || '';
    case 'outline': return s.volumes.length ? `${s.volumes.length}卷` : '';
    case 'characters': return s.characters.length || '';
    case 'lore': return s.lore.length || '';
    case 'materials': return (s.materials.length + s.snippets.length) || '';
    case 'plot': {
      const overdue = countOverdueForeshadows(app);
      if (overdue) return `${overdue}超期`;
      return s.plotlines.length || '';
    }
    default: return '';
  }
}

function renderNav(app) {
  const nav = $('#main-nav');
  if (!nav) return;
  nav.innerHTML = '';
  for (const item of NAV_ITEMS) {
    const active = app.state.view === item.key;
    const btn = el('button', {
      class: `nav-item ${active ? 'active' : ''}`.trim(),
      type: 'button',
      title: item.label,
      dataset: { view: item.key },
    }, [
      el('span', { class: 'nav-ico', html: icon(item.icon, 17) }),
      el('span', { class: 'nav-label', text: item.label }),
    ]);
    const b = navBadge(app, item.key);
    if (b) btn.appendChild(el('span', { class: 'nav-badge', text: String(b) }));
    btn.addEventListener('click', () => app.switchView(item.key));
    nav.appendChild(btn);
  }
}

function projectInitial(name) {
  const cleaned = String(name || '未命名').replace(/^[《〈「【\s]+/, '').trim();
  return (cleaned[0] || '未');
}

function renderProjectButton(app) {
  const host = $('#project-switch');
  if (!host) return;
  const project = app.state.project;
  host.innerHTML = '';
  if (!project) {
    host.appendChild(el('button', { class: 'project-empty', text: '选择作品', onclick: () => openProjectModal(app) }));
    return;
  }
  const total = app.state.chapters.reduce((n, c) => n + (c.wordCount || 0), 0);
  const btn = el('button', { class: 'project-switch', type: 'button', title: '切换 / 管理作品' }, [
    el('span', { class: 'project-avatar', style: { background: project.color || '#8a5a3b' }, text: projectInitial(project.name) }),
    el('span', { class: 'project-meta' }, [
      el('strong', { class: 'project-name', text: project.name || '未命名作品' }),
      el('span', { class: 'project-sub', text: `${project.author || '佚名'} · ${fmtWan(total)}字` }),
    ]),
    el('span', { class: 'project-caret', html: icon('chevronDown', 14) }),
  ]);
  btn.addEventListener('click', () => openProjectMenu(app, btn));
  host.appendChild(btn);
}

export function openProjectMenu(app, anchor) {
  const rect = anchor.getBoundingClientRect();
  const projects = app.state.projects;
  const items = [];
  projects.forEach(p => {
    items.push({
      label: p.id === app.state.project?.id ? `✓ ${p.name}` : p.name,
      hint: p.author || '',
      onClick: () => app.openProject(p.id),
    });
  });
  items.push({ separator: true });
  items.push({ label: '新建作品…', icon: 'plus', onClick: () => app.createProjectFlow() });
  items.push({ label: '导入工程备份…', icon: 'upload', onClick: () => app.importProjectFlow() });
  items.push({ label: '管理所有作品…', icon: 'layers', onClick: () => openProjectModal(app) });
  if (app.state.project) {
    items.push({ separator: true });
    items.push({
      label: app.state.lock ? '退出小黑屋…' : '开启小黑屋…',
      icon: 'lock',
      onClick: () => app.openBlackroomFlow(),
    });
    items.push({
      label: '锁定作品',
      icon: 'lock',
      disabled: !app.state.project.password,
      onClick: () => app.lockProject(),
    });
    items.push({
      label: '作品信息与删除…',
      icon: 'settings',
      onClick: () => openProjectSettings(app),
    });
  }
  contextMenu(rect.left, rect.bottom + 6, items, { header: '作品' });
}

function openProjectModal(app) {
  const body = el('div', { class: 'project-list' });
  const projects = [...app.state.projects].sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
  if (!projects.length) body.appendChild(el('p', { class: 'muted', text: '还没有作品。' }));
  for (const p of projects) {
    const row = el('div', { class: `project-row ${p.id === app.state.project?.id ? 'active' : ''}`.trim() });
    row.appendChild(el('span', { class: 'project-avatar', style: { background: p.color || '#8a5a3b' }, text: projectInitial(p.name) }));
    const info = el('div', { class: 'project-row-meta' }, [
      el('strong', { text: p.name || '未命名作品' }),
      el('span', { class: 'muted small', text: `${p.author || '佚名'} · 更新于 ${new Date(p.updatedAt || Date.now()).toLocaleDateString('zh-CN')}` }),
    ]);
    row.appendChild(info);
    row.appendChild(el('div', { class: 'project-row-actions' }, [
      makeButton('打开', {
        small: true, primary: p.id !== app.state.project?.id,
        onClick: async () => { modal.close(); await app.openProject(p.id); },
      }),
      makeIconButton('trash', '删除作品', async () => {
        const ok = await confirmDialog(`确定删除《${p.name}》吗？该作品的全部章节、设定与历史版本都会被删除，且不可恢复。建议先导出备份。`, {
          title: '删除作品', danger: true, okLabel: '永久删除',
        });
        if (!ok) return;
        await app.deleteProject(p.id);
        modal.close();
        openProjectModal(app);
      }, { small: true }),
    ]));
    body.appendChild(row);
  }
  const modal = showModal({
    title: '作品管理',
    subtitle: '所有数据保存在本机，不会上传到任何服务器。',
    body,
    width: 620,
    actions: [
      { label: '关闭', ghost: true },
      { label: '导入备份', icon: 'upload', onClick: () => { modal.close(); app.importProjectFlow(); } },
      { label: '新建作品', icon: 'plus', primary: true, onClick: () => { modal.close(); app.createProjectFlow(); } },
    ],
  });
}

function openProjectSettings(app) {
  const p = app.state.project;
  if (!p) return;
  const nameInput = el('input', { class: 'input', value: p.name });
  const authorInput = el('input', { class: 'input', value: p.author || '' });
  const descInput = el('textarea', { class: 'input', rows: 3 });
  descInput.value = p.description || '';
  const goalInput = el('input', { class: 'input', type: 'number', min: 0, value: p.dailyGoal || 3000 });
  const body = el('div', { class: 'form-stack' }, [
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '书名' }), nameInput]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '作者' }), authorInput]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '简介' }), descInput]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '每日目标（字）' }), goalInput]),
  ]);
  const modal = showModal({
    title: '作品信息',
    body,
    width: 520,
    actions: [
      {
        label: '删除作品', danger: true, ghost: true, onClick: async () => {
          const ok = await confirmDialog(`确定永久删除《${p.name}》？此操作不可恢复。`, { danger: true, okLabel: '永久删除' });
          if (!ok) return false;
          await app.deleteProject(p.id);
          modal.close();
          return false;
        },
        close: false,
      },
      { label: '取消', ghost: true },
      {
        label: '保存', primary: true, onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) { nameInput.focus(); return false; }
          await app.updateProject({
            name,
            author: authorInput.value.trim(),
            description: descInput.value.trim(),
            dailyGoal: Math.max(0, Number(goalInput.value) || 0),
          });
          modal.close();
        },
      },
    ],
  });
}

export function renderGoalCard(app) {
  const host = $('#sidebar-goal');
  if (!host) return;
  const s = app.state;
  const today = app.getTodayRecord();
  const words = today?.words || 0;
  const goal = s.project?.dailyGoal || 0;
  const pct = goal > 0 ? Math.min(100, (words / goal) * 100) : 0;
  host.innerHTML = '';
  host.appendChild(el('div', { class: 'goal-card' }, [
    el('div', { class: 'goal-top' }, [
      el('span', { class: 'goal-label', text: '今日码字' }),
      el('span', { class: 'goal-streak', html: `${icon('flame', 13)}<span>${app.streak()} 天</span>` }),
    ]),
    el('div', { class: 'goal-number' }, [
      el('strong', { text: fmtNumber(words) }),
      el('span', { class: 'muted', text: goal ? ` / ${fmtNumber(goal)} 字` : ' 字' }),
    ]),
    el('div', { class: 'progress' }, [
      el('span', { class: 'progress-bar', style: { width: `${pct}%` } }),
    ]),
    el('button', {
      class: 'goal-link', type: 'button', text: pct >= 100 ? '目标已达成 · 查看统计 →' : '查看码字统计 →',
      onclick: () => app.switchView('stats'),
    }),
  ]));
}

const collapsedCache = new Map();

function getCollapsed(app) {
  const pid = app.state.project?.id || 'none';
  if (!collapsedCache.has(pid)) {
    try {
      const raw = localStorage.getItem(`novie:collapsed:${pid}`);
      collapsedCache.set(pid, new Set(raw ? JSON.parse(raw) : []));
    } catch {
      collapsedCache.set(pid, new Set());
    }
  }
  return collapsedCache.get(pid);
}

function saveCollapsed(app, set) {
  const pid = app.state.project?.id || 'none';
  try { localStorage.setItem(`novie:collapsed:${pid}`, JSON.stringify(Array.from(set))); } catch { /* ignore */ }
}

function statusLabel(status) {
  return status === 'done' ? '已完成' : status === 'writing' ? '写作中' : '未写';
}

export function renderTree(app) {
  const host = $('#chapter-tree');
  const wrap = $('#tree-wrap');
  if (!host || !wrap) return;
  const inWrite = app.state.view === 'write';
  wrap.classList.toggle('hidden', !inWrite);
  if (!inWrite) return;
  host.innerHTML = '';
  const s = app.state;
  const filterInput = $('#chapter-filter');
  if (filterInput) {
    if (filterInput.value !== (s.chapterFilter || '')) filterInput.value = s.chapterFilter || '';
    if (!filterInput.dataset.bound) {
      filterInput.dataset.bound = '1';
      // 防抖：过滤输入不逐键全量重建章节树，大目录下避免卡顿
      filterInput.addEventListener('input', debounce(() => {
        app.state.chapterFilter = filterInput.value;
        renderTree(app);
      }, 120));
    }
  }
  if (!s.volumes.length) {
    host.appendChild(emptyState({
      iconName: 'layers', title: '还没有分卷', desc: '先建一卷，再开始写第一章。',
      actionLabel: '新建卷', onAction: () => app.createVolumeFlow(),
    }));
    return;
  }
  const filter = (s.chapterFilter || '').trim().toLowerCase();
  const collapsed = getCollapsed(app);
  const volumes = [...s.volumes].sort((a, b) => a.order - b.order);
  let renderedVolumes = 0;
  for (const volume of volumes) {
    const allChapters = s.chapters.filter(c => c.volumeId === volume.id).sort((a, b) => a.order - b.order);
    const volumeMatches = volume.title.toLowerCase().includes(filter);
    const chapters = filter && !volumeMatches
      ? allChapters.filter(c => `${c.title} ${c.summary || ''} ${(c.tags || []).join(' ')}`.toLowerCase().includes(filter))
      : allChapters;
    if (filter && !chapters.length) continue;
    renderedVolumes++;
    const isCollapsed = filter ? false : collapsed.has(volume.id);
    const total = chapters.reduce((n, c) => n + app.chapterWordCount(c), 0);
    const section = el('div', { class: 'volume', dataset: { volumeId: volume.id } });
    const head = el('div', { class: 'volume-head', title: volume.title });
    const toggle = el('button', {
      class: 'volume-toggle', type: 'button', title: isCollapsed ? '展开' : '收起',
      html: icon(isCollapsed ? 'chevronRight' : 'chevronDown', 13),
    });
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      const set = getCollapsed(app);
      if (set.has(volume.id)) set.delete(volume.id); else set.add(volume.id);
      saveCollapsed(app, set);
      renderTree(app);
    });
    head.appendChild(toggle);
    head.appendChild(el('span', { class: 'volume-title', text: volume.title }));
    head.appendChild(el('span', { class: 'volume-count', text: `${chapters.length}` }));
    const addBtn = makeIconButton('plus', '在本卷新建章节', e => {
      e.stopPropagation();
      app.createChapter({ volumeId: volume.id });
    }, { small: true });
    head.appendChild(addBtn);
    const moreBtn = makeIconButton('more', '卷操作', e => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      openVolumeMenu(app, volume, rect);
    }, { small: true });
    head.appendChild(moreBtn);
    head.addEventListener('click', () => {
      const set = getCollapsed(app);
      if (set.has(volume.id)) set.delete(volume.id); else set.add(volume.id);
      saveCollapsed(app, set);
      renderTree(app);
    });
    head.addEventListener('contextmenu', e => {
      e.preventDefault();
      openVolumeMenu(app, volume, { left: e.clientX, bottom: e.clientY });
    });
    // 拖拽到卷标题 = 追加到本卷
    head.addEventListener('dragover', e => {
      if (!s.draggedChapterId) return;
      e.preventDefault();
      head.classList.add('drop-target');
    });
    head.addEventListener('dragleave', () => head.classList.remove('drop-target'));
    head.addEventListener('drop', e => {
      e.preventDefault();
      head.classList.remove('drop-target');
      if (!s.draggedChapterId) return;
      const index = chapters.filter(c => c.id !== s.draggedChapterId).length;
      app.moveChapter(s.draggedChapterId, volume.id, index);
      s.draggedChapterId = null;
    });
    section.appendChild(head);
    if (!isCollapsed) {
      const list = el('div', { class: 'chapter-list' });
      if (!chapters.length && !filter) {
        list.appendChild(el('button', {
          class: 'chapter-add-empty', type: 'button', text: '＋ 新建第一章',
          onclick: () => app.createChapter({ volumeId: volume.id }),
        }));
      }
      for (const chapter of chapters) {
        list.appendChild(chapterRow(app, chapter, chapters, volume));
      }
      section.appendChild(list);
    }
    host.appendChild(section);
  }

  if (filter && !renderedVolumes) {
    host.appendChild(emptyState({
      iconName: 'search', title: '没有匹配的章节',
      desc: '换个关键词，或清空上方筛选框。',
    }));
  }

  const addVol = el('button', {
    class: 'tree-add-volume', type: 'button',
    html: `${icon('plus', 14)}<span>新建卷</span>`,
    onclick: () => app.createVolumeFlow(),
  });
  host.appendChild(addVol);
}

function chapterRow(app, chapter, siblings, volume) {
  const active = chapter.id === app.state.chapterId;
  const row = el('div', {
    class: `chapter-item status-${chapter.status || 'todo'} ${active ? 'active' : ''}`.trim(),
    title: `${chapter.title}\n${chapter.summary || '暂无摘要'}`,
    draggable: 'true',
    dataset: { chapterId: chapter.id },
  });
  row.appendChild(el('span', { class: 'status-dot', title: statusLabel(chapter.status) }));
  const main = el('span', { class: 'chapter-item-main' });
  main.appendChild(el('span', { class: 'chapter-item-title', text: chapter.title || '未命名章节' }));
  main.appendChild(el('span', {
    class: 'chapter-item-count',
    text: `${fmtNumber(app.chapterWordCount(chapter))} 字`,
  }));
  row.appendChild(main);
  row.appendChild(el('button', {
    class: 'chapter-more', type: 'button', title: '章节操作', html: icon('more', 14),
  }));
  row.addEventListener('click', e => {
    if (e.target.closest('.chapter-more')) return;
    app.openChapter(chapter.id);
  });
  row.querySelector('.chapter-more').addEventListener('click', e => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    openChapterMenu(app, chapter, rect);
  });
  row.addEventListener('contextmenu', e => {
    e.preventDefault();
    openChapterMenu(app, chapter, { left: e.clientX, bottom: e.clientY });
  });
  row.addEventListener('dblclick', async e => {
    if (e.target.closest('.chapter-more')) return;
    await app.renameChapter(chapter.id);
  });
  row.addEventListener('dragstart', e => {
    app.state.draggedChapterId = chapter.id;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', chapter.id); } catch { /* ignore */ }
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    app.state.draggedChapterId = null;
    document.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after'));
  });
  row.addEventListener('dragover', e => {
    if (!app.state.draggedChapterId || app.state.draggedChapterId === chapter.id) return;
    e.preventDefault();
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    row.classList.toggle('drop-before', before);
    row.classList.toggle('drop-after', !before);
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
  row.addEventListener('drop', e => {
    e.preventDefault();
    const before = row.classList.contains('drop-before');
    row.classList.remove('drop-before', 'drop-after');
    const dragged = app.state.draggedChapterId;
    if (!dragged || dragged === chapter.id) return;
    const rest = app.state.chapters
      .filter(c => c.volumeId === volume.id && c.id !== dragged)
      .sort((a, b) => a.order - b.order);
    const targetPos = rest.findIndex(c => c.id === chapter.id);
    let index = targetPos + (before ? 0 : 1);
    if (index < 0) index = rest.length;
    app.moveChapter(dragged, volume.id, index);
    app.state.draggedChapterId = null;
  });
  return row;
}

function openVolumeMenu(app, volume, pos) {
  contextMenu(pos.left, (pos.bottom || pos.top || 0) + 4, [
    { label: '新建章节', icon: 'plus', onClick: () => app.createChapter({ volumeId: volume.id }) },
    { label: '重命名本卷…', icon: 'edit', onClick: () => app.renameVolume(volume.id) },
    { separator: true },
    { label: '删除本卷…', icon: 'trash', danger: true, onClick: () => app.deleteVolumeConfirm(volume.id) },
  ], { header: volume.title });
}

export function openChapterMenu(app, chapter, pos) {
  contextMenu(pos.left, (pos.bottom || pos.top || 0) + 4, [
    { label: '打开', icon: 'pen', onClick: () => app.openChapter(chapter.id) },
    { label: '章节信息 / 摘要…', icon: 'edit', onClick: () => app.openChapterInfo(chapter.id) },
    { label: '重命名…', icon: 'type', onClick: () => app.renameChapter(chapter.id) },
    { label: '复制章节', icon: 'copy', onClick: () => app.duplicateChapter(chapter.id) },
    { separator: true },
    { label: '创建历史快照', icon: 'history', onClick: () => app.snapshotChapter(chapter.id) },
    { label: '在光标处拆分为两章', icon: 'columns', onClick: () => app.splitChapterAtCaret(chapter.id) },
    { label: '与下一章合并', icon: 'layers', onClick: () => app.mergeChapterWithNext(chapter.id) },
    { label: '导出本章 TXT', icon: 'download', onClick: () => app.exportChapterTxt(chapter.id) },
    { separator: true },
    { label: '删除章节…', icon: 'trash', danger: true, onClick: () => app.deleteChapterConfirm(chapter.id) },
  ], { header: chapter.title });
}

export function showChapterInfo(app, chapterId) {
  const chapter = app.state.chapters.find(c => c.id === chapterId);
  if (!chapter) return;
  const title = el('input', { class: 'input', value: chapter.title });
  const summary = el('textarea', { class: 'input', rows: 4, placeholder: '本章梗概、关键事件…' });
  summary.value = chapter.summary || '';
  const status = el('select', { class: 'input' }, [
    el('option', { value: 'todo', text: '未写' }),
    el('option', { value: 'writing', text: '写作中' }),
    el('option', { value: 'done', text: '已完成' }),
  ]);
  status.value = chapter.status || 'todo';
  const target = el('input', { class: 'input', type: 'number', min: 0, step: 100, value: chapter.targetWords || 0 });
  const tags = el('input', { class: 'input', value: (chapter.tags || []).join('，'), placeholder: '用逗号分隔' });
  const plotBox = el('div', { class: 'check-list' });
  for (const line of app.state.plotlines) {
    const cb = el('input', { type: 'checkbox', value: line.id });
    cb.checked = (chapter.plotlineIds || []).includes(line.id);
    plotBox.appendChild(el('label', { class: 'check-item' }, [
      cb, el('span', { class: 'color-dot', style: { background: line.color || '#b4552d' } }),
      el('span', { text: line.name }),
    ]));
  }
  if (!app.state.plotlines.length) plotBox.appendChild(el('p', { class: 'muted small', text: '还没有剧情线，可在“剧情线”页创建。' }));
  const body = el('div', { class: 'form-stack' }, [
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '章节标题' }), title]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '本章摘要' }), summary]),
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '状态' }), status]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '目标字数' }), target]),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '标签' }), tags]),
    el('div', { class: 'field' }, [el('span', { class: 'field-label', text: '关联剧情线' }), plotBox]),
    el('p', { class: 'muted small', text: '摘要会显示在大纲卡片中，也是前后文对照时最有用的信息。' }),
  ]);
  const modal = showModal({
    title: '章节信息',
    subtitle: `${chapter.title} · 当前 ${fmtNumber(app.chapterWordCount(chapter))} 字`,
    body,
    width: 560,
    actions: [
      { label: '取消', ghost: true },
      {
        label: '保存', primary: true, onClick: async () => {
          const t = title.value.trim();
          if (!t) { title.focus(); return false; }
          await app.updateChapterMeta(chapter.id, {
            title: t,
            summary: summary.value.trim(),
            status: status.value,
            targetWords: Math.max(0, Number(target.value) || 0),
            tags: tags.value,
            plotlineIds: Array.from(plotBox.querySelectorAll('input:checked')).map(cb => cb.value),
          });
          modal.close();
        },
      },
    ],
  });
}
