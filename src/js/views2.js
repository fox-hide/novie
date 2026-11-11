/* Novie — 素材 / 剧情线 / 统计 */

import {
  el, icon, makeButton, makeIconButton, contextMenu, showModal,
  confirmDialog, emptyState, toast, badge, copyText
} from './ui.js';
import { makePage, statTile, toolbarRow } from './view-kit.js';
import {
  fmtNumber, fmtWan, fmtDuration, truncate, uid, parseTags, addDays, dateKey, recentDateKeys, todayKey, htmlToText
} from './utils.js';
import { put, del, getAll } from './db.js';
import { chapterBalanceHint, analyzeChapterHook } from './generators.js';

/* ============================= 素材库 ============================= */

export function renderMaterialsView(app) {
  const tab = app.state.materialsTab || 'materials';
  const { page, body } = makePage({
    title: '素材',
    subtitle: '灵感便签、描写片段、快捷短语。写作时随取随用。',
    actions: [
      tab === 'snippets'
        ? makeButton('新建短语', { iconName: 'plus', primary: true, onClick: () => openSnippetEditor(app, null) })
        : makeButton('新建素材', { iconName: 'plus', primary: true, onClick: () => openMaterialEditor(app, null) }),
    ],
  });

  const tabs = el('div', { class: 'segmented' });
  tabs.appendChild(el('button', {
    class: `segmented-item ${tab === 'materials' ? 'active' : ''}`.trim(),
    type: 'button', text: `素材库 ${app.state.materials.length}`,
    onClick: () => { app.state.materialsTab = 'materials'; app.renderMain(); },
  }));
  tabs.appendChild(el('button', {
    class: `segmented-item ${tab === 'snippets' ? 'active' : ''}`.trim(),
    type: 'button', text: `快捷短语 ${app.state.snippets.length}`,
    onClick: () => { app.state.materialsTab = 'snippets'; app.renderMain(); },
  }));
  body.appendChild(tabs);

  if (tab === 'snippets') {
    renderSnippets(app, body);
  } else {
    renderMaterials(app, body);
  }
  return page;
}

function renderMaterials(app, body) {
  const search = el('input', { class: 'input search-input', placeholder: '搜索素材内容、标题、标签…' });
  const categories = Array.from(new Set(app.state.materials.map(m => m.category || '未分类')));
  let selected = '全部';
  const chips = el('div', { class: 'chip-row' });
  const grid = el('div', { class: 'material-grid' });

  const paint = () => {
    chips.innerHTML = '';
    ['全部', ...categories].forEach(cat => {
      chips.appendChild(el('button', {
        class: `chip ${selected === cat ? 'active' : ''}`.trim(),
        type: 'button', text: cat,
        onClick: () => { selected = cat; paint(); },
      }));
    });
    grid.innerHTML = '';
    const keyword = search.value.trim();
    const mats = app.state.materials.filter(m => {
      const inCat = selected === '全部' || (m.category || '未分类') === selected;
      const kw = !keyword || [m.title, m.category, (m.tags || []).join(' '), m.content].join(' ').includes(keyword);
      return inCat && kw;
    });
    if (!mats.length) {
      grid.appendChild(emptyState({
        iconName: 'folder',
        title: app.state.materials.length ? '没有匹配的素材' : '素材库还是空的',
        desc: app.state.materials.length ? '换个关键词。' : '把喜欢的描写、对话、资料摘抄放进来。',
        actionLabel: '新建素材', onAction: () => openMaterialEditor(app, null),
      }));
      return;
    }
    for (const m of mats) {
      const card = el('article', { class: 'material-card' });
      const head = el('div', { class: 'material-head' }, [
        el('div', {}, [
          el('h3', { text: m.title || '未命名素材' }),
          el('span', { class: 'muted tiny', text: m.category || '未分类' }),
        ]),
      ]);
      const more = makeIconButton('more', '素材操作', e => {
        const r = e.currentTarget.getBoundingClientRect();
        contextMenu(r.right - 160, r.bottom + 4, [
          { label: '编辑', icon: 'edit', onClick: () => openMaterialEditor(app, m) },
          { label: '复制内容', icon: 'copy', onClick: () => copyText(m.content || '') },
          { separator: true },
          { label: '删除…', icon: 'trash', danger: true, onClick: () => deleteMaterial(app, m) },
        ]);
      }, { small: true });
      head.appendChild(more);
      card.appendChild(head);
      card.appendChild(el('p', { class: 'material-content', text: truncate(m.content, 150) }));
      const tags = el('div', { class: 'tag-row' });
      (m.tags || []).forEach(t => tags.appendChild(el('span', { class: 'tag', text: t })));
      card.appendChild(tags);
      const foot = el('div', { class: 'material-foot' });
      foot.appendChild(makeButton('插入正文', { small: true, primary: true, onClick: () => app.insertIntoEditor(m.content) }));
      foot.appendChild(makeButton('复制', { small: true, ghost: true, onClick: () => copyText(m.content) }));
      card.appendChild(foot);
      grid.appendChild(card);
    }
  };
  search.addEventListener('input', paint);
  body.appendChild(toolbarRow([search]));
  body.appendChild(chips);
  body.appendChild(grid);
  paint();
}

function openMaterialEditor(app, material) {
  const isNew = !material;
  const title = el('input', { class: 'input', value: material?.title || '', placeholder: '例如：雪夜描写 / 反派台词' });
  const category = el('input', { class: 'input', value: material?.category || '描写', placeholder: '分类：描写 / 对话 / 资料…' });
  const tags = el('input', { class: 'input', value: (material?.tags || []).join('，'), placeholder: '标签，逗号分隔' });
  const content = el('textarea', { class: 'input', rows: 10, placeholder: '把内容放在这里。插入正文时会按纯文本粘贴。' });
  content.value = material?.content || '';
  const body = el('div', { class: 'form-stack' }, [
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '标题' }), title]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '分类' }), category]),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '标签' }), tags]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '内容' }), content]),
  ]);
  showModal({
    title: isNew ? '新建素材' : '编辑素材',
    body,
    width: 640,
    actions: [
      isNew ? null : {
        label: '删除', danger: true, ghost: true, close: false,
        onClick: async () => {
          await deleteMaterial(app, material);
          modal.close();
          return false;
        },
      },
      { label: '取消', ghost: true },
      {
        label: '保存', primary: true,
        onClick: async () => {
          const t = title.value.trim() || content.value.trim().slice(0, 20);
          if (!t) { title.focus(); return false; }
          const obj = {
            ...(isNew ? { id: uid('mat'), projectId: app.state.project.id, createdAt: Date.now() } : { id: material.id, projectId: material.projectId, createdAt: material.createdAt }),
            title: t,
            category: category.value.trim() || '未分类',
            tags: parseTags(tags.value),
            content: content.value.trim(),
            updatedAt: Date.now(),
          };
          await put('materials', obj);
          if (isNew) app.state.materials.push(obj);
          else app.state.materials = app.state.materials.map(x => x.id === obj.id ? obj : x);
          modal.close();
          app.renderSidebar();
          app.renderMain();
          toast(isNew ? '素材已保存' : '素材已更新', 'success');
        },
      },
    ].filter(Boolean),
  });
}

async function deleteMaterial(app, material) {
  const ok = await confirmDialog(`删除素材「${material.title || '未命名'}」？`, { danger: true, okLabel: '删除' });
  if (!ok) return;
  await del('materials', material.id);
  app.state.materials = app.state.materials.filter(m => m.id !== material.id);
  app.renderSidebar();
  app.renderMain();
  toast('素材已删除', 'info');
}

function renderSnippets(app, body) {
  body.appendChild(el('div', { class: 'notice-box' }, [
    el('span', { class: 'notice-icon', html: icon('zap', 16) }),
    el('p', {}, [
      el('strong', { text: '触发词展开：' }),
      el('span', { text: ' 在正文里输入触发词（如 ' }),
      el('code', { text: ';xj' }),
      el('span', { text: '）后按 Tab，会自动替换为短语内容。' }),
    ]),
  ]));
  const list = el('div', { class: 'snippet-table' });
  if (!app.state.snippets.length) {
    body.appendChild(emptyState({
      iconName: 'zap', title: '还没有快捷短语',
      desc: '把常用描写、口头禅、转场句做成短语，写作时按 Tab 展开。',
      actionLabel: '新建短语', onAction: () => openSnippetEditor(app, null),
    }));
    return;
  }
  const head = el('div', { class: 'snippet-table-head' });
  head.appendChild(el('span', { text: '触发词' }));
  head.appendChild(el('span', { text: '名称' }));
  head.appendChild(el('span', { text: '内容' }));
  head.appendChild(el('span', { text: '操作' }));
  list.appendChild(head);
  for (const s of app.state.snippets) {
    const row = el('div', { class: 'snippet-table-row' });
    row.appendChild(el('code', { class: 'snippet-code', text: s.trigger || '—' }));
    row.appendChild(el('span', { text: s.title || '未命名' }));
    row.appendChild(el('span', { class: 'muted', text: truncate(s.content, 60) }));
    const actions = el('div', { class: 'snippet-actions' });
    actions.appendChild(makeButton('插入', { small: true, primary: true, onClick: () => app.insertIntoEditor(s.content) }));
    actions.appendChild(makeButton('编辑', { small: true, ghost: true, onClick: () => openSnippetEditor(app, s) }));
    actions.appendChild(makeIconButton('trash', '删除', async () => {
      const ok = await confirmDialog(`删除快捷短语「${s.title || s.trigger}」？`, { danger: true, okLabel: '删除' });
      if (!ok) return;
      await del('snippets', s.id);
      app.state.snippets = app.state.snippets.filter(x => x.id !== s.id);
      app.renderSidebar();
      app.renderMain();
    }, { small: true }));
    row.appendChild(actions);
    list.appendChild(row);
  }
  body.appendChild(list);
}

function openSnippetEditor(app, snippet) {
  const isNew = !snippet;
  const trigger = el('input', { class: 'input', value: snippet?.trigger || ';', placeholder: '例如 ;xj（建议以符号开头）' });
  const title = el('input', { class: 'input', value: snippet?.title || '', placeholder: '例如：雪景描写' });
  const content = el('textarea', { class: 'input', rows: 6, placeholder: '按 Tab 后插入的完整内容…' });
  content.value = snippet?.content || '';
  const body = el('div', { class: 'form-stack' }, [
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '触发词' }), trigger]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '名称' }), title]),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '内容' }), content]),
    el('p', { class: 'muted tiny', text: '触发词需以空格或行首为界；按 Tab 展开。' }),
  ]);
  const modal = showModal({
    title: isNew ? '新建快捷短语' : '编辑快捷短语',
    body,
    width: 560,
    actions: [
      { label: '取消', ghost: true },
      {
        label: '保存', primary: true,
        onClick: async () => {
          const trig = trigger.value.trim();
          if (!trig) { trigger.focus(); return false; }
          if (!content.value.trim()) { content.focus(); return false; }
          const obj = {
            ...(isNew ? { id: uid('snip'), projectId: app.state.project.id, createdAt: Date.now() } : { id: snippet.id, projectId: snippet.projectId, createdAt: snippet.createdAt }),
            trigger: trig,
            title: title.value.trim() || trig,
            content: content.value.trim(),
          };
          await put('snippets', obj);
          if (isNew) app.state.snippets.push(obj);
          else app.state.snippets = app.state.snippets.map(x => x.id === obj.id ? obj : x);
          modal.close();
          app.renderSidebar();
          app.renderMain();
          toast('快捷短语已保存', 'success');
        },
      },
    ],
  });
}

/* ============================= 剧情线 ============================= */

export function renderPlotView(app) {
  const tab = app.state.plotTab || 'plotlines';
  const overdue = countOverdueForeshadows(app);
  const tabs = el('div', { class: 'segmented plot-tabs' });
  const mkTab = (key, label) => el('button', {
    class: `segmented-item ${tab === key ? 'active' : ''}`.trim(),
    type: 'button', text: label,
    onClick: () => { app.state.plotTab = key; app.renderMain(); },
  });
  tabs.appendChild(mkTab('plotlines', app.state.plotlines.length ? `剧情线 ${app.state.plotlines.length}` : '剧情线'));
  tabs.appendChild(mkTab('foreshadows', overdue ? `伏笔 · ${overdue} 超期` : (app.state.foreshadows.length ? `伏笔 ${app.state.foreshadows.length}` : '伏笔')));

  if (tab === 'foreshadows') {
    const fsPage = makePage({
      title: '伏笔',
      subtitle: '埋下的线索要记得收：超过 50 章或到达预计回收章仍未回收会标红。',
      actions: [
        makeButton('新建伏笔', { iconName: 'plus', primary: true, onClick: () => openForeshadowEditor(app, null) }),
      ],
    });
    fsPage.body.appendChild(tabs);
    fsPage.body.appendChild(renderForeshadowList(app));
    return fsPage.page;
  }

  const timeline = Boolean(app.state.plotTimeline);
  const { page, body } = makePage({
    title: '剧情线',
    subtitle: '主线、支线、感情线分开看，避免顾此失彼。',
    actions: [
      makeButton(timeline ? '按剧情线查看' : '总时间轴', {
        iconName: 'branch', ghost: true,
        onClick: () => { app.state.plotTimeline = !timeline; app.renderMain(); },
      }),
      makeButton('新建剧情线', { iconName: 'plus', primary: true, onClick: () => openPlotlineEditor(app, null) }),
    ],
  });
  body.appendChild(tabs);

  if (!app.state.plotlines.length) {
    body.appendChild(emptyState({
      iconName: 'branch', title: '还没有剧情线',
      desc: '为故事建一条主线，再把关键节点挂到章节上。',
      actionLabel: '新建剧情线', onAction: () => openPlotlineEditor(app, null),
    }));
    return page;
  }

  if (timeline) {
    body.appendChild(renderTimeline(app));
    return page;
  }

  const chapterOrder = new Map(app.orderedChapters().map((c, i) => [c.id, { index: i, title: c.title }]));
  for (const line of app.state.plotlines) {
    const nodes = app.state.plotnodes
      .filter(n => n.plotlineId === line.id)
      .sort((a, b) => (chapterOrder.get(a.chapterId)?.index ?? 999) - (chapterOrder.get(b.chapterId)?.index ?? 999));
    const card = el('section', { class: 'plotline-card' });
    const head = el('div', { class: 'plotline-head' });
    const doneCount = nodes.filter(n => n.done).length;
    const progressPct = nodes.length ? Math.round((doneCount / nodes.length) * 100) : 0;
    head.appendChild(el('span', { class: 'plot-color-bar', style: { background: line.color || '#b4552d' } }));
    head.appendChild(el('div', { class: 'plotline-title-box' }, [
      el('h2', { text: line.name }),
      el('span', { class: 'muted small', text: `${nodes.length} 个节点 · ${doneCount} 已完成` }),
    ]));
    if (line.description) head.appendChild(el('p', { class: 'plotline-desc', text: line.description }));
    const actions = el('div', { class: 'plotline-actions' });
    actions.appendChild(makeButton('添加节点', { small: true, primary: true, iconName: 'plus', onClick: () => openPlotNodeEditor(app, null, line.id) }));
    actions.appendChild(makeIconButton('edit', '编辑剧情线', () => openPlotlineEditor(app, line), { small: true }));
    actions.appendChild(makeIconButton('trash', '删除剧情线', () => deletePlotline(app, line), { small: true }));
    head.appendChild(actions);
    card.appendChild(head);
    card.appendChild(el('div', { class: 'plotline-progress' }, [
      el('div', { class: 'progress' }, [
        el('span', { class: 'progress-bar', style: { width: `${progressPct}%`, background: line.color || undefined } }),
      ]),
      el('span', { class: 'plotline-progress-label', text: `完成 ${progressPct}%` }),
    ]));

    const list = el('div', { class: 'plot-nodes' });
    if (!nodes.length) {
      list.appendChild(el('p', { class: 'muted small', text: '还没有节点。把这一条线的关键事件挂到章节上。' }));
    }
    for (const node of nodes) {
      const chapter = chapterOrder.get(node.chapterId);
      const row = el('div', { class: `plot-node ${node.done ? 'done' : ''}`.trim() });
      const check = el('input', { class: 'plot-node-check', type: 'checkbox', title: '标记该节点是否完成' });
      check.checked = Boolean(node.done);
      check.addEventListener('change', async () => {
        node.done = check.checked;
        node.updatedAt = Date.now();
        await put('plotnodes', node);
        app.state.plotnodes = app.state.plotnodes.map(n => n.id === node.id ? node : n);
        const scroll = document.querySelector('#view-host .page')?.scrollTop || 0;
        app.renderMain();
        requestAnimationFrame(() => {
          const page = document.querySelector('#view-host .page');
          if (page) page.scrollTop = scroll;
        });
      });
      row.appendChild(check);
      row.appendChild(el('span', { class: 'plot-node-dot', style: { background: node.color || line.color || '#b4552d' } }));
      row.appendChild(el('div', { class: 'plot-node-main' }, [
        el('div', { class: 'plot-node-title' }, [
          el('strong', { text: node.title || '未命名节点' }),
          chapter ? el('button', {
            class: 'link-btn', type: 'button', text: chapter.title,
            onClick: () => app.openChapter(node.chapterId),
          }) : el('span', { class: 'muted tiny', text: '未关联章节' }),
        ]),
        node.note ? el('p', { class: 'plot-node-note', text: node.note }) : null,
      ]));
      row.appendChild(el('div', { class: 'plot-node-actions' }, [
        makeIconButton('edit', '编辑节点', () => openPlotNodeEditor(app, node, line.id), { small: true }),
        makeIconButton('trash', '删除节点', () => deletePlotNode(app, node), { small: true }),
      ]));
      list.appendChild(row);
    }
    card.appendChild(list);
    body.appendChild(card);
  }
  return page;
}

function renderTimeline(app) {
  const chapterOrder = new Map(app.orderedChapters().map((c, i) => [c.id, { index: i, title: c.title, volumeTitle: c.volumeTitle }]));
  const nodes = [...app.state.plotnodes].sort((a, b) =>
    (chapterOrder.get(a.chapterId)?.index ?? 999) - (chapterOrder.get(b.chapterId)?.index ?? 999)
  );
  const wrap = el('div', { class: 'timeline-wrap' });
  if (!nodes.length) {
    wrap.appendChild(emptyState({ iconName: 'branch', title: '还没有剧情节点', desc: '回到剧情线视图添加节点。' }));
    return wrap;
  }
  let lastChapter = null;
  for (const node of nodes) {
    const chapter = chapterOrder.get(node.chapterId);
    const chapterKey = node.chapterId || 'none';
    if (chapterKey !== lastChapter) {
      lastChapter = chapterKey;
      wrap.appendChild(el('div', { class: 'timeline-chapter' }, [
        el('span', { class: 'timeline-chapter-index', text: chapter ? `#${chapter.index + 1}` : '—' }),
        el('span', { text: chapter ? chapter.title : '未关联章节' }),
      ]));
    }
    const line = app.state.plotlines.find(p => p.id === node.plotlineId);
    const row = el('div', { class: `timeline-node ${node.done ? 'done' : ''}`.trim() });
    row.appendChild(el('span', { class: 'timeline-dot', style: { background: node.color || line?.color || '#b4552d' } }));
    const box = el('div', { class: 'timeline-node-box' });
    box.appendChild(el('div', { class: 'timeline-node-head' }, [
      el('strong', { text: node.title || '未命名节点' }),
      badge(line?.name || '未归类', 'accent'),
    ]));
    if (node.note) box.appendChild(el('p', { class: 'muted small', text: node.note }));
    row.appendChild(box);
    wrap.appendChild(row);
  }
  return wrap;
}

function openPlotlineEditor(app, line) {
  const isNew = !line;
  const name = el('input', { class: 'input', value: line?.name || '', placeholder: '例如：主线 · 残灯为何不灭' });
  const desc = el('textarea', { class: 'input', rows: 3, placeholder: '这条线要解决什么问题？' });
  desc.value = line?.description || '';
  const color = el('input', { class: 'input color-input', type: 'color', value: line?.color || '#b4552d' });
  const body = el('div', { class: 'form-stack' }, [
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '剧情线名称 *' }), name]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '颜色' }), color]),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '说明' }), desc]),
  ]);
  const modal = showModal({
    title: isNew ? '新建剧情线' : '编辑剧情线',
    body,
    width: 520,
    actions: [
      isNew ? null : {
        label: '删除', danger: true, ghost: true, close: false,
        onClick: async () => {
          await deletePlotline(app, line);
          modal.close();
          return false;
        },
      },
      { label: '取消', ghost: true },
      {
        label: '保存', primary: true,
        onClick: async () => {
          const n = name.value.trim();
          if (!n) { name.focus(); return false; }
          const obj = {
            ...(isNew ? { id: uid('pl'), projectId: app.state.project.id, createdAt: Date.now() } : { id: line.id, projectId: line.projectId, createdAt: line.createdAt }),
            name: n,
            description: desc.value.trim(),
            color: color.value,
            updatedAt: Date.now(),
          };
          await put('plotlines', obj);
          if (isNew) app.state.plotlines.push(obj);
          else app.state.plotlines = app.state.plotlines.map(x => x.id === obj.id ? obj : x);
          modal.close();
          app.renderSidebar();
          app.renderMain();
          toast(isNew ? '剧情线已创建' : '剧情线已更新', 'success');
        },
      },
    ].filter(Boolean),
  });
}

async function deletePlotline(app, line) {
  const ok = await confirmDialog(`删除剧情线「${line.name}」及其 ${app.state.plotnodes.filter(n => n.plotlineId === line.id).length} 个节点？章节正文不会受影响。`, {
    danger: true, okLabel: '删除',
  });
  if (!ok) return;
  for (const node of app.state.plotnodes.filter(n => n.plotlineId === line.id)) {
    await del('plotnodes', node.id);
  }
  await del('plotlines', line.id);
  app.state.plotnodes = app.state.plotnodes.filter(n => n.plotlineId !== line.id);
  app.state.plotlines = app.state.plotlines.filter(l => l.id !== line.id);
  const affected = app.state.chapters
    .filter(ch => (ch.plotlineIds || []).includes(line.id))
    .map(ch => ({ ...ch, plotlineIds: (ch.plotlineIds || []).filter(id => id !== line.id) }));
  for (const ch of affected) await put('chapters', ch);
  app.state.chapters = app.state.chapters.map(ch => {
    const updated = affected.find(x => x.id === ch.id);
    return updated || ch;
  });
  if (app.state.activeChapter) {
    const active = app.state.chapters.find(c => c.id === app.state.activeChapter.id);
    if (active) app.state.activeChapter = active;
  }
  app.renderSidebar();
  app.renderMain();
  toast('剧情线已删除', 'info');
}

function openPlotNodeEditor(app, node, presetLineId = null) {
  const isNew = !node;
  const lineSelect = el('select', { class: 'input' }, app.state.plotlines.map(l =>
    el('option', { value: l.id, text: l.name })
  ));
  lineSelect.value = node?.plotlineId || presetLineId || app.state.plotlines[0]?.id;
  const chapterSelect = el('select', { class: 'input' });
  chapterSelect.appendChild(el('option', { value: '', text: '不关联章节' }));
  app.orderedChapters().forEach(c => {
    chapterSelect.appendChild(el('option', {
      value: c.id,
      text: `${c.volumeTitle ? c.volumeTitle + ' · ' : ''}${c.title}`,
    }));
  });
  chapterSelect.value = node?.chapterId || app.state.chapterId || '';
  const title = el('input', { class: 'input', value: node?.title || '', placeholder: '例如：残灯认主' });
  const note = el('textarea', { class: 'input', rows: 4, placeholder: '这个节点发生了什么？推动了什么？' });
  note.value = node?.note || '';
  const color = el('input', { class: 'input color-input', type: 'color', value: node?.color || app.state.plotlines.find(l => l.id === lineSelect.value)?.color || '#b4552d' });
  lineSelect.addEventListener('change', () => {
    const line = app.state.plotlines.find(l => l.id === lineSelect.value);
    if (line?.color) color.value = line.color;
  });
  const doneCb = el('input', { type: 'checkbox' });
  doneCb.checked = Boolean(node?.done);
  const body = el('div', { class: 'form-stack' }, [
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '所属剧情线' }), lineSelect]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '关联章节' }), chapterSelect]),
    ]),
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '节点标题 *' }), title]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '颜色' }), color]),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '备注' }), note]),
    el('label', { class: 'check-item' }, [doneCb, el('span', { text: '该节点已完成' })]),
  ]);
  const modal = showModal({
    title: isNew ? '添加剧情节点' : '编辑剧情节点',
    body,
    width: 560,
    actions: [
      isNew ? null : {
        label: '删除', danger: true, ghost: true, close: false,
        onClick: async () => { await deletePlotNode(app, node); modal.close(); return false; },
      },
      { label: '取消', ghost: true },
      {
        label: '保存', primary: true,
        onClick: async () => {
          const t = title.value.trim();
          if (!t) { title.focus(); return false; }
          const obj = {
            ...(isNew ? { id: uid('node'), projectId: app.state.project.id, createdAt: Date.now() } : { id: node.id, projectId: node.projectId, createdAt: node.createdAt }),
            plotlineId: lineSelect.value,
            chapterId: chapterSelect.value || null,
            title: t,
            note: note.value.trim(),
            color: color.value,
            done: doneCb.checked,
            order: node?.order ?? app.state.plotnodes.length,
            updatedAt: Date.now(),
          };
          await put('plotnodes', obj);
          if (isNew) app.state.plotnodes.push(obj);
          else app.state.plotnodes = app.state.plotnodes.map(x => x.id === obj.id ? obj : x);
          modal.close();
          app.renderMain();
          if (app.state.activeChapter) app.renderInspector();
          toast(isNew ? '剧情节点已添加' : '剧情节点已更新', 'success');
        },
      },
    ].filter(Boolean),
  });
}

async function deletePlotNode(app, node) {
  const ok = await confirmDialog(`删除剧情节点「${node.title || '未命名'}」？`, { danger: true, okLabel: '删除' });
  if (!ok) return;
  await del('plotnodes', node.id);
  app.state.plotnodes = app.state.plotnodes.filter(n => n.id !== node.id);
  app.renderMain();
}

/* ============================= 伏笔管理 ============================= */

/** 已写到的进度：最后一个有正文字数的章节下标（没有则 -1）。 */
function writtenProgressIndex(app) {
  const ordered = app.orderedChapters();
  for (let i = ordered.length - 1; i >= 0; i--) {
    if ((ordered[i].wordCount || 0) > 0) return i;
  }
  return -1;
}

/** 伏笔状态：resolved / overdue（超期）/ soon（临近回收）/ open。 */
export function foreshadowState(app, f) {
  if (f.resolved) return { key: 'resolved' };
  const ordered = app.orderedChapters();
  const idx = new Map(ordered.map((c, i) => [c.id, i]));
  const progress = writtenProgressIndex(app);
  const plant = f.plantChapterId != null ? idx.get(f.plantChapterId) ?? null : null;
  const target = f.targetChapterId != null ? idx.get(f.targetChapterId) ?? null : null;
  if (target != null && progress >= target) return { key: 'overdue', reason: '已到预计回收章仍未回收' };
  if (plant != null && progress - plant >= 50) return { key: 'overdue', reason: `已埋 ${progress - plant} 章未回收` };
  if (target != null && progress >= target - 3) return { key: 'soon', reason: `距预计回收章还有 ${Math.max(0, target - progress)} 章` };
  return { key: 'open' };
}

export function countOverdueForeshadows(app) {
  return (app.state.foreshadows || []).filter(f => foreshadowState(app, f).key === 'overdue').length;
}

function renderForeshadowList(app) {
  const wrap = el('div', { class: 'foreshadow-list' });
  const items = app.state.foreshadows || [];
  if (!items.length) {
    wrap.appendChild(emptyState({
      iconName: 'branch', title: '还没有伏笔',
      desc: '把“埋了但还没收”的线索记下来，写到几十章后也不怕忘。',
      actionLabel: '新建伏笔', onAction: () => openForeshadowEditor(app, null),
    }));
    return wrap;
  }
  const ordered = app.orderedChapters();
  const order = new Map(ordered.map((c, i) => [c.id, i]));
  const sorted = [...items].sort((a, b) => {
    const pa = a.plantChapterId != null ? order.get(a.plantChapterId) ?? 9999 : 9999;
    const pb = b.plantChapterId != null ? order.get(b.plantChapterId) ?? 9999 : 9999;
    return pa - pb || (a.createdAt || 0) - (b.createdAt || 0);
  });
  const chapterBtn = (chapterId, label) => {
    const i = order.get(chapterId);
    if (i == null) return null;
    return el('button', {
      class: 'link-btn', type: 'button', text: label.replace('{t}', ordered[i].title),
      onClick: () => app.openChapter(chapterId),
    });
  };
  for (const f of sorted) {
    const st = foreshadowState(app, f);
    const row = el('div', { class: `foreshadow-row state-${st.key}` });
    row.appendChild(el('span', { class: `fs-dot ${st.key}`, title: st.reason || st.key }));
    const metaBits = [];
    const plantBtn = f.plantChapterId ? chapterBtn(f.plantChapterId, '埋于 {t}') : null;
    metaBits.push(plantBtn || el('span', { text: '未关联埋设章' }));
    const targetBtn = f.targetChapterId ? chapterBtn(f.targetChapterId, '预计 {t} 回收') : null;
    if (targetBtn) metaBits.push(targetBtn);
    if (f.resolved && f.resolvedChapterId) {
      const backBtn = chapterBtn(f.resolvedChapterId, '收于 {t}');
      if (backBtn) metaBits.push(backBtn);
    }
    const main = el('div', { class: 'fs-main' }, [
      el('div', { class: 'fs-title' }, [
        el('strong', { text: f.title || '未命名伏笔' }),
        st.key === 'overdue' ? badge(st.reason || '超期未收', 'danger')
          : st.key === 'soon' ? badge(st.reason || '临近回收', 'warn')
            : st.key === 'resolved' ? badge('已回收', 'success') : badge('进行中', 'accent'),
      ]),
      f.clue ? el('p', { class: 'muted small', text: f.clue }) : null,
      el('div', { class: 'fs-meta muted tiny' }, metaBits),
    ]);
    row.appendChild(main);
    const actions = el('div', { class: 'fs-actions' });
    if (!f.resolved) {
      actions.appendChild(makeButton('标记已回收', {
        small: true, ghost: true, iconName: 'check',
        onClick: () => resolveForeshadow(app, f),
      }));
    }
    actions.appendChild(makeIconButton('edit', '编辑伏笔', () => openForeshadowEditor(app, f), { small: true }));
    actions.appendChild(makeIconButton('trash', '删除伏笔', () => deleteForeshadow(app, f), { small: true }));
    row.appendChild(actions);
    wrap.appendChild(row);
  }
  return wrap;
}

async function resolveForeshadow(app, f) {
  const resolvedChapterId = app.state.chapterId || null;
  const chapterTitle = resolvedChapterId
    ? (app.state.chapters.find(c => c.id === resolvedChapterId)?.title || '当前章') : null;
  const obj = {
    ...f, resolved: true, resolvedChapterId,
    resolvedAt: Date.now(), updatedAt: Date.now(),
  };
  await put('foreshadows', obj);
  app.state.foreshadows = app.state.foreshadows.map(x => (x.id === f.id ? obj : x));
  app.renderSidebar();
  app.renderMain();
  toast(chapterTitle ? `已标记回收（${chapterTitle}）` : '已标记回收', 'success');
}

function openForeshadowEditor(app, f) {
  const isNew = !f;
  const title = el('input', { class: 'input', value: f?.title || '', placeholder: '例如：玄天令的来历' });
  const clue = el('textarea', { class: 'input', rows: 3, placeholder: '埋设时的线索 / 暗示（可选）' });
  clue.value = f?.clue || '';
  const notes = el('textarea', { class: 'input', rows: 3, placeholder: '回收方式、注意事项（可选）' });
  notes.value = f?.notes || '';
  const chapterSelect = (selected, placeholder) => {
    const sel = el('select', { class: 'input' });
    sel.appendChild(el('option', { value: '', text: placeholder }));
    app.orderedChapters().forEach(c => sel.appendChild(el('option', {
      value: c.id,
      text: `${c.volumeTitle ? c.volumeTitle + ' · ' : ''}${c.title}`,
    })));
    sel.value = selected || '';
    return sel;
  };
  const plantSelect = chapterSelect(f?.plantChapterId, '选择埋设章节');
  const targetSelect = chapterSelect(f?.targetChapterId, '预计回收章节（可选）');
  const resolvedSelect = chapterSelect(f?.resolvedChapterId, '回收章节（可选）');
  const resolvedCb = el('input', { type: 'checkbox' });
  resolvedCb.checked = Boolean(f?.resolved);
  const syncResolved = () => { resolvedSelect.disabled = !resolvedCb.checked; };
  resolvedCb.addEventListener('change', syncResolved);
  syncResolved();
  const body = el('div', { class: 'form-stack' }, [
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '伏笔内容 *' }), title]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '埋设线索' }), clue]),
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '埋设章节' }), plantSelect]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '预计回收章节' }), targetSelect]),
    ]),
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '回收章节' }), resolvedSelect]),
      el('label', { class: 'field' }, [
        el('span', { class: 'field-label', text: '状态' }),
        el('label', { class: 'check-item' }, [resolvedCb, el('span', { text: '已回收' })]),
      ]),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '备注' }), notes]),
  ]);
  const modal = showModal({
    title: isNew ? '新建伏笔' : '编辑伏笔',
    subtitle: '超过 50 章或到达预计回收章仍未回收会标红提醒。',
    body,
    width: 600,
    actions: [
      isNew ? null : {
        label: '删除', danger: true, ghost: true, close: false,
        onClick: async () => { await deleteForeshadow(app, f); modal.close(); return false; },
      },
      { label: '取消', ghost: true },
      {
        label: '保存', primary: true,
        onClick: async () => {
          const t = title.value.trim();
          if (!t) { title.focus(); return false; }
          const obj = {
            ...(isNew
              ? { id: uid('fsh'), projectId: app.state.project.id, createdAt: Date.now() }
              : { id: f.id, projectId: f.projectId, createdAt: f.createdAt }),
            title: t,
            clue: clue.value.trim(),
            notes: notes.value.trim(),
            plantChapterId: plantSelect.value || null,
            targetChapterId: targetSelect.value || null,
            resolved: resolvedCb.checked,
            resolvedChapterId: resolvedCb.checked ? (resolvedSelect.value || null) : null,
            resolvedAt: resolvedCb.checked ? (f?.resolvedAt || Date.now()) : null,
            updatedAt: Date.now(),
          };
          await put('foreshadows', obj);
          if (isNew) app.state.foreshadows.push(obj);
          else app.state.foreshadows = app.state.foreshadows.map(x => (x.id === obj.id ? obj : x));
          modal.close();
          app.renderSidebar();
          app.renderMain();
          toast(isNew ? '伏笔已创建' : '伏笔已更新', 'success');
        },
      },
    ].filter(Boolean),
  });
}

async function deleteForeshadow(app, f) {
  const ok = await confirmDialog(`删除伏笔「${f.title || '未命名'}」？`, { danger: true, okLabel: '删除' });
  if (!ok) return;
  await del('foreshadows', f.id);
  app.state.foreshadows = app.state.foreshadows.filter(x => x.id !== f.id);
  app.renderSidebar();
  app.renderMain();
  toast('伏笔已删除', 'info');
}

/* ============================= 统计 ============================= */

export function renderStatsView(app) {
  const record = app.getTodayRecord();
  const goal = app.state.project?.dailyGoal || 0;
  const total = app.projectWordCount();
  const days = recentDateKeys(14);
  const dailyMap = new Map(app.state.daily.map(d => [d.date, d]));
  const weekDays = [];
  const now = new Date();
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    weekDays.push(dailyMap.get(dateKey(d))?.words || 0);
  }
  const weekTotal = weekDays.reduce((a, b) => a + b, 0);
  const pct = goal ? Math.min(100, (record.words / goal) * 100) : 0;

  const { page, body } = makePage({
    title: '统计',
    subtitle: '看得见的进度，比“感觉写了挺多”更可靠。',
    actions: [
      makeButton('导出中心', { iconName: 'download', ghost: true, onClick: () => app.switchView('export') }),
    ],
  });

  const cards = el('div', { class: 'stat-row stat-row-4' }, [
    statTile('今日码字', `${fmtNumber(record.words)} 字`, goal ? `目标 ${fmtNumber(goal)} 字` : '点击设置目标'),
    statTile('本周', `${fmtWan(weekTotal)}字`, '周一起算'),
    statTile('全书', `${fmtWan(total)}字`, `${app.state.chapters.length} 章 / ${app.state.volumes.length} 卷`),
    statTile('连续打卡', `${app.streak()} 天`, '每天写 1 字也算'),
  ]);
  body.appendChild(cards);

  const top = el('div', { class: 'stats-top' });
  const goalCard = el('div', { class: 'panel goal-panel' });
  goalCard.appendChild(el('div', { class: 'panel-title', text: '今日目标' }));
  goalCard.appendChild(goalRing(record.words, goal));
  goalCard.appendChild(el('p', { class: 'muted small center', text: goal ? `${fmtNumber(record.words)} / ${fmtNumber(goal)} 字 · ${pct.toFixed(0)}%` : '尚未设置每日目标' }));
  goalCard.appendChild(makeButton('调整目标', {
    small: true, ghost: true,
    onClick: async () => {
      const input = el('input', { class: 'input', type: 'number', min: 0, step: 500, value: goal || 3000 });
      const modal = showModal({
        title: '每日码字目标',
        body: el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '目标字数' }), input]),
        width: 380,
        actions: [
          { label: '取消', ghost: true },
          {
            label: '保存', primary: true, onClick: async () => {
              await app.updateProject({ dailyGoal: Math.max(0, Number(input.value) || 0) });
              modal.close();
              app.renderMain();
              app.renderGoalCard();
            },
          },
        ],
      });
    },
  }));

  const speedCard = el('div', { class: 'panel' });
  speedCard.appendChild(el('div', { class: 'panel-title', text: '码字速度与时间' }));
  speedCard.appendChild(el('div', { class: 'speed-big' }, [
    el('strong', { text: app.speed() ? fmtNumber(app.speed()) : '—' }),
    el('span', { text: '字 / 小时' }),
  ]));
  speedCard.appendChild(el('div', { class: 'kv-list' }, [
    el('div', { class: 'kv' }, [el('span', { text: '今日投入' }), el('strong', { text: fmtDuration(record.seconds) })]),
    el('div', { class: 'kv' }, [el('span', { text: '日均（近 7 天）' }), el('strong', {
      text: `${fmtNumber(Math.round(app.state.daily.slice(-7).reduce((n, d) => n + d.words, 0) / 7))} 字`,
    })]),
    el('div', { class: 'kv' }, [el('span', { text: '目标差额' }), el('strong', {
      text: goal ? (record.words >= goal ? `已超额 ${fmtNumber(record.words - goal)} 字` : `还差 ${fmtNumber(goal - record.words)} 字`) : '—',
    })]),
  ]));
  top.appendChild(goalCard);
  top.appendChild(speedCard);
  body.appendChild(top);

  // 14 天柱状图
  const chartPanel = el('div', { class: 'panel' });
  chartPanel.appendChild(el('div', { class: 'panel-head' }, [
    el('div', { class: 'panel-title', text: '近 14 天码字' }),
    el('span', { class: 'muted tiny', text: goal ? `虚线为目标 ${fmtNumber(goal)} 字` : '' }),
  ]));
  const max = Math.max(goal || 0, ...days.map(d => dailyMap.get(d)?.words || 0), 1);
  const chart = el('div', { class: 'bar-chart' });
  days.forEach(d => {
    const value = dailyMap.get(d)?.words || 0;
    const h = Math.max(value ? 3 : 0, (value / max) * 100);
    const col = el('div', { class: 'bar-col', title: `${d} · ${fmtNumber(value)} 字` });
    col.appendChild(el('span', { class: 'bar-value', text: value ? fmtNumber(value) : '' }));
    const track = el('div', { class: 'bar-track' });
    if (goal) {
      track.appendChild(el('span', {
        class: 'bar-goal-line',
        style: { bottom: `${Math.min(100, (goal / max) * 100)}%` },
      }));
    }
    track.appendChild(el('span', {
      class: `bar-fill ${value >= goal && goal ? 'done' : ''}`.trim(),
      style: { height: `${h}%` },
    }));
    col.appendChild(track);
    col.appendChild(el('span', { class: 'bar-label', text: d.slice(5).replace('-', '/') }));
    chart.appendChild(col);
  });
  chartPanel.appendChild(chart);
  body.appendChild(chartPanel);

  // 热力图
  const heatPanel = el('div', { class: 'panel' });
  heatPanel.appendChild(el('div', { class: 'panel-head' }, [
    el('div', { class: 'panel-title', text: '打卡日历（近 12 周）' }),
    el('div', { class: 'heat-legend' }, [
      el('span', { class: 'muted tiny', text: '少' }),
      ...[0, 1, 2, 3, 4].map(l => el('span', { class: `heat-cell level-${l}` })),
      el('span', { class: 'muted tiny', text: '多' }),
    ]),
  ]));
  const heat = el('div', { class: 'heatmap' });
  const heatStartMonday = addDays(new Date(), -((new Date().getDay() + 6) % 7) - 11 * 7);
  for (let i = 0; i < 84; i++) {
    const d = addDays(heatStartMonday, i);
    const key = dateKey(d);
    const value = dailyMap.get(key)?.words || 0;
    const effectiveGoal = goal || 3000;
    const level = value <= 0 ? 0 : value < effectiveGoal * 0.25 ? 1 : value < effectiveGoal * 0.6 ? 2 : value < effectiveGoal ? 3 : 4;
    const cell = el('span', {
      class: `heat-cell level-${level}`,
      title: `${key} · ${fmtNumber(value)} 字`,
    });
    if (key === todayKey()) cell.classList.add('today');
    heat.appendChild(cell);
  }
  heatPanel.appendChild(heat);
  body.appendChild(heatPanel);

  // 成就徽章
  const maxDaily = Math.max(0, ...app.state.daily.map(d => d.words || 0));
  const doneChapters = app.state.chapters.filter(c => c.status === 'done').length;
  const achievements = [
    { icon: '🖋️', title: '初次落笔', desc: '全书至少 1 字', unlocked: total > 0 },
    { icon: '📚', title: '小有积蓄', desc: '全书累计 2,000 字', unlocked: total >= 2000 },
    { icon: '🔥', title: '三日不辍', desc: '连续打卡 3 天', unlocked: app.streak() >= 3 },
    { icon: '⚡', title: '千字冲刺', desc: '单日码字 1,000 字', unlocked: maxDaily >= 1000 },
    { icon: '🏆', title: '万字长篇', desc: '全书累计 10,000 字', unlocked: total >= 10000 },
    { icon: '🧱', title: '百章连载', desc: '写到 100 章', unlocked: app.state.chapters.length >= 100 },
  ];
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const achievementPanel = el('div', { class: 'panel' });
  achievementPanel.appendChild(el('div', { class: 'panel-head' }, [
    el('div', { class: 'panel-title', text: '创作成就' }),
    el('span', { class: 'muted tiny', text: `${unlockedCount} / ${achievements.length} 已解锁` }),
  ]));
  const achGrid = el('div', { class: 'achievement-grid' });
  achievements.forEach(a => {
    achGrid.appendChild(el('div', { class: `achievement ${a.unlocked ? 'unlocked' : 'locked'}` }, [
      el('span', { class: 'achievement-icon', text: a.icon }),
      el('div', { class: 'achievement-body' }, [
        el('strong', { text: a.title }),
        el('span', { text: a.unlocked ? a.desc : `未解锁 · ${a.desc}` }),
      ]),
    ]));
  });
  achievementPanel.appendChild(achGrid);
  achievementPanel.appendChild(el('p', { class: 'muted tiny', text: `已完成章节 ${doneChapters} 章，这些数字只保存在本机。` }));
  body.appendChild(achievementPanel);

  // 章节字数
  const chapterPanel = el('div', { class: 'panel' });
  chapterPanel.appendChild(el('div', { class: 'panel-title', text: '章节字数分布' }));
  const counts = app.state.chapters.map(c => ({ id: c.id, title: c.title, count: app.chapterWordCount(c) })).sort((a, b) => b.count - a.count);
  if (!counts.length) {
    chapterPanel.appendChild(el('p', { class: 'muted small', text: '还没有章节。' }));
  } else {
    const maxCount = Math.max(...counts.map(c => c.count), 1);
    const list = el('div', { class: 'chapter-bars' });
    counts.slice(0, 8).forEach(c => {
      const row = el('div', { class: 'chapter-bar-row', title: `${c.count} 字` });
      row.appendChild(el('span', { class: 'chapter-bar-title', text: c.title }));
      const track = el('div', { class: 'chapter-bar-track' }, [
        el('span', { class: 'chapter-bar-fill', style: { width: `${(c.count / maxCount) * 100}%` } }),
      ]);
      row.appendChild(track);
      row.appendChild(el('span', { class: 'chapter-bar-count', text: fmtNumber(c.count) }));
      list.appendChild(row);
    });
    chapterPanel.appendChild(list);
    chapterPanel.appendChild(el('p', { class: 'muted small', text: chapterBalanceHint(app.state.chapters.map(c => ({ wordCount: app.chapterWordCount(c) }))) }));
  }
  body.appendChild(chapterPanel);

  // 章末钩子（断章力度）：本地规则分析每章结尾
  const hookPanel = el('div', { class: 'panel hook-panel' });
  hookPanel.appendChild(el('div', { class: 'panel-head' }, [
    el('div', { class: 'panel-title', text: '章末钩子（断章力度）' }),
    el('span', { class: 'muted tiny', text: '本地规则 · 不联网' }),
  ]));
  hookPanel.appendChild(el('p', {
    class: 'muted small',
    text: '对话 / 悬念收尾得分高；总结式平铺收尾容易让读者弃书。按得分从低到高列出最弱的章节。',
  }));
  const hookList = el('div', { class: 'hook-list' });
  const hookBtn = makeButton('分析全书章节', { small: true, primary: true, iconName: 'search' });
  const hookLabel = hookBtn.querySelector('span');
  hookBtn.addEventListener('click', async () => {
    hookBtn.disabled = true;
    const originalLabel = hookLabel.textContent;
    hookLabel.textContent = '分析中…';
    try {
      const contents = await getAll('contents');
      const htmlMap = new Map(contents.map(c => [c.id, c.html]));
      const rows = [];
      for (const c of app.orderedChapters()) {
        const text = htmlToText(htmlMap.get(c.id) || '');
        if (!text.trim()) continue;
        rows.push({ chapter: c, ...analyzeChapterHook(text) });
      }
      rows.sort((a, b) => a.score - b.score);
      hookList.innerHTML = '';
      if (!rows.length) {
        hookList.appendChild(el('p', { class: 'muted small', text: '还没有可分析的正文。' }));
        return;
      }
      const avg = Math.round(rows.reduce((n, r) => n + r.score, 0) / rows.length);
      hookList.appendChild(el('p', {
        class: 'muted small',
        text: `共 ${rows.length} 章 · 平均 ${avg} 分 · 从最弱的开始看`,
      }));
      for (const r of rows.slice(0, 30)) {
        const row = el('div', { class: `hook-row ${r.score < 42 ? 'weak' : ''}`.trim() });
        row.appendChild(el('span', {
          class: `hook-score ${r.score >= 75 ? 'good' : r.score >= 58 ? 'ok' : r.score >= 42 ? 'mid' : 'bad'}`,
          text: String(r.score),
        }));
        row.appendChild(el('div', { class: 'hook-main' }, [
          el('div', { class: 'hook-head' }, [
            el('strong', { text: r.chapter.title }),
            badge(r.tag, r.score >= 75 ? 'success' : r.score >= 58 ? 'accent' : r.score >= 42 ? 'warn' : 'danger'),
            r.signals.length ? el('span', { class: 'muted tiny', text: r.signals.join(' · ') }) : null,
          ]),
          r.hint ? el('p', { class: 'muted tiny', text: r.hint }) : null,
        ]));
        row.appendChild(makeIconButton('pen', '打开章节', () => app.openChapter(r.chapter.id), { small: true }));
        hookList.appendChild(row);
      }
      if (rows.length > 30) {
        hookList.appendChild(el('p', { class: 'muted tiny', text: `仅列出最弱的 30 章，其余 ${rows.length - 30} 章未展示。` }));
      }
    } catch (err) {
      hookList.innerHTML = '';
      hookList.appendChild(el('p', { class: 'muted small', text: `分析失败：${err.message || err}` }));
    } finally {
      hookBtn.disabled = false;
      hookLabel.textContent = originalLabel;
    }
  });
  hookPanel.appendChild(hookBtn);
  hookPanel.appendChild(hookList);
  body.appendChild(hookPanel);

  body.appendChild(el('p', {
    class: 'muted tiny',
    text: `作品创建于 ${app.state.project?.createdAt ? new Date(app.state.project.createdAt).toLocaleDateString('zh-CN') : '—'} · 统计只保存在本机，不会上传。`,
  }));
  return page;
}

function goalRing(words, goal) {
  const pct = goal ? Math.min(1, words / goal) : 0;
  const r = 54;
  const c = 2 * Math.PI * r;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 140 140');
  svg.setAttribute('class', 'goal-ring');
  const bg = document.createElementNS(ns, 'circle');
  bg.setAttribute('cx', '70'); bg.setAttribute('cy', '70'); bg.setAttribute('r', String(r));
  bg.setAttribute('class', 'ring-bg');
  svg.appendChild(bg);
  const fg = document.createElementNS(ns, 'circle');
  fg.setAttribute('cx', '70'); fg.setAttribute('cy', '70'); fg.setAttribute('r', String(r));
  fg.setAttribute('class', 'ring-fg');
  fg.setAttribute('stroke-dasharray', `${c}`);
  fg.setAttribute('stroke-dashoffset', `${c * (1 - pct)}`);
  fg.setAttribute('transform', 'rotate(-90 70 70)');
  svg.appendChild(fg);
  const label = document.createElementNS(ns, 'text');
  label.setAttribute('x', '70'); label.setAttribute('y', '66');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('class', 'ring-value');
  label.textContent = `${Math.round(pct * 100)}%`;
  svg.appendChild(label);
  const sub = document.createElementNS(ns, 'text');
  sub.setAttribute('x', '70'); sub.setAttribute('y', '86');
  sub.setAttribute('text-anchor', 'middle');
  sub.setAttribute('class', 'ring-sub');
  sub.textContent = '今日目标';
  svg.appendChild(sub);
  return svg;
}
