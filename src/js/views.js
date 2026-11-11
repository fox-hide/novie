/* Novie — 大纲 / 人物 / 设定 视图，以及视图分发 */

import {
  el, icon, makeButton, makeIconButton, contextMenu, showModal,
  confirmDialog, emptyState, toast, badge, copyText
} from './ui.js';
import { makePage, statTile, toolbarRow } from './view-kit.js';
import { fmtNumber, fmtWan, truncate, uid, parseTags } from './utils.js';
import { put, del } from './db.js';
import { showChapterInfo } from './sidebar.js';
import { renderMaterialsView } from './views2.js';
import { renderPlotView, renderStatsView } from './views2.js';
import { renderExportView, renderSettingsView } from './views3.js';
import { renderStarMap } from './star-map.js';

export const VIEW_META = {
  write: { label: '写作', icon: 'pen', sub: '沉浸式正文编辑' },
  outline: { label: '大纲', icon: 'outline', sub: '卷、章与剧情节奏' },
  characters: { label: '人物', icon: 'users', sub: '人物档案与关系' },
  lore: { label: '设定', icon: 'book', sub: '世界观、势力、功法与地点' },
  materials: { label: '素材', icon: 'folder', sub: '灵感、描写片段与快捷短语' },
  plot: { label: '剧情线', icon: 'branch', sub: '多线并行的剧情时间轴' },
  stats: { label: '统计', icon: 'chart', sub: '码字数据与打卡记录' },
  export: { label: '导出', icon: 'download', sub: '成稿导出、备份与迁移' },
  settings: { label: '设置', icon: 'settings', sub: '外观、目标、安全与同步' },
};

export function renderView(app) {
  switch (app.state.view) {
    case 'outline': return renderOutlineView(app);
    case 'characters': return renderCharactersView(app);
    case 'lore': return renderLoreView(app);
    case 'materials': return renderMaterialsView(app);
    case 'plot': return renderPlotView(app);
    case 'stats': return renderStatsView(app);
    case 'export': return renderExportView(app);
    case 'settings': return renderSettingsView(app);
    default: return el('div');
  }
}

/* ============================= 大纲 ============================= */

function renderOutlineView(app) {
  const total = app.state.chapters.reduce((n, c) => n + app.chapterWordCount(c), 0);
  const done = app.state.chapters.filter(c => c.status === 'done').length;
  const { page, body } = makePage({
    title: '大纲',
    subtitle: '把故事拆成卷、章和一个个可执行的目标。',
    actions: [
      makeButton('新建卷', { iconName: 'layers', ghost: true, onClick: () => app.createVolumeFlow() }),
      makeButton('新建章节', { iconName: 'plus', primary: true, onClick: () => app.createChapter({}) }),
    ],
  });

  const search = el('input', { class: 'input search-input', placeholder: '搜索章节标题或摘要…' });
  const statsRow = el('div', { class: 'stat-row' }, [
    statTile('总字数', `${fmtWan(total)}字`),
    statTile('章节', `${app.state.chapters.length} 章 / ${app.state.volumes.length} 卷`),
    statTile('已完成', `${done} 章`, app.state.chapters.length ? `${Math.round((done / app.state.chapters.length) * 100)}%` : ''),
    statTile('今日', `${fmtNumber(app.getTodayRecord().words)} 字`),
  ]);
  body.appendChild(statsRow);
  body.appendChild(toolbarRow([search]));

  const volumesHost = el('div', { class: 'outline-volumes' });
  const paint = () => {
    const keyword = search.value.trim();
    volumesHost.innerHTML = '';
    const volumes = [...app.state.volumes].sort((a, b) => a.order - b.order);
    if (!volumes.length) {
      volumesHost.appendChild(emptyState({
        iconName: 'layers', title: '还没有卷', desc: '先创建一卷，再安排章节。',
        actionLabel: '新建卷', onAction: () => app.createVolumeFlow(),
      }));
      return;
    }
    for (const volume of volumes) {
      const chapters = app.state.chapters
        .filter(c => c.volumeId === volume.id)
        .sort((a, b) => a.order - b.order)
        .filter(c => !keyword || (c.title + ' ' + (c.summary || '')).includes(keyword));
      const allChapters = app.state.chapters.filter(c => c.volumeId === volume.id);
      if (keyword && !chapters.length) continue;
      const words = allChapters.reduce((n, c) => n + app.chapterWordCount(c), 0);
      const section = el('section', { class: 'outline-volume' });
      const head = el('div', { class: 'outline-volume-head' });
      head.appendChild(el('div', { class: 'outline-volume-title' }, [
        el('span', { class: 'outline-vol-index', text: `卷 ${volume.order + 1}` }),
        el('h2', { text: volume.title }),
        el('span', { class: 'muted small', text: `${allChapters.length} 章 · ${fmtWan(words)}字` }),
      ]));
      const btns = el('div', { class: 'outline-volume-actions' });
      btns.appendChild(makeButton('重命名', { small: true, ghost: true, onClick: () => app.renameVolume(volume.id) }));
      btns.appendChild(makeButton('新建章节', { small: true, ghost: true, iconName: 'plus', onClick: () => app.createChapter({ volumeId: volume.id }) }));
      head.appendChild(btns);
      section.appendChild(head);

      const grid = el('div', { class: 'outline-grid' });
      for (const chapter of chapters) {
        grid.appendChild(outlineCard(app, chapter));
      }
      if (!keyword) {
        grid.appendChild(el('button', {
          class: 'outline-card add-card', type: 'button',
          html: `${icon('plus', 18)}<span>新建章节</span>`,
          onclick: () => app.createChapter({ volumeId: volume.id }),
        }));
      }
      if (!chapters.length) {
        grid.appendChild(el('p', { class: 'muted small outline-empty-hint', text: '这一卷还没有章节。' }));
      }
      section.appendChild(grid);
      volumesHost.appendChild(section);
    }
    if (!volumesHost.children.length) {
      volumesHost.appendChild(emptyState({ iconName: 'search', title: '没有匹配的章节', desc: '换个关键词试试。' }));
    }
  };
  search.addEventListener('input', paint);
  body.appendChild(volumesHost);
  paint();
  return page;
}

function outlineCard(app, chapter) {
  const counts = app.chapterWordCount(chapter);
  const target = chapter.targetWords || 0;
  const pct = target ? Math.min(100, (counts / target) * 100) : 0;
  const volume = app.state.volumes.find(v => v.id === chapter.volumeId);
  const card = el('article', { class: 'outline-card', title: '点击打开本章' });
  const top = el('div', { class: 'outline-card-top' });
  top.appendChild(el('span', {
    class: `status-pill status-${chapter.status || 'todo'}`,
    text: chapter.status === 'done' ? '已完成' : chapter.status === 'writing' ? '写作中' : '未写',
  }));
  const actions = el('div', { class: 'outline-card-actions' });
  actions.appendChild(makeIconButton('edit', '章节信息', async e => {
    e.stopPropagation();
    showChapterInfo(app, chapter.id);
  }, { small: true }));
  actions.appendChild(makeIconButton('more', '更多', e => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    contextMenu(r.left, r.bottom + 4, [
      { label: '在写作页打开', icon: 'pen', onClick: () => app.openChapter(chapter.id) },
      { label: '章节信息 / 摘要…', icon: 'edit', onClick: () => showChapterInfo(app, chapter.id) },
      { label: '重命名…', icon: 'type', onClick: () => app.renameChapter(chapter.id) },
      { label: '复制章节', icon: 'copy', onClick: () => app.duplicateChapter(chapter.id) },
      { separator: true },
      { label: '创建快照', icon: 'history', onClick: () => app.snapshotChapter(chapter.id) },
      { label: '删除章节…', icon: 'trash', danger: true, onClick: () => app.deleteChapterConfirm(chapter.id) },
    ], { header: chapter.title });
  }, { small: true }));
  top.appendChild(actions);
  card.appendChild(top);
  card.appendChild(el('h3', { class: 'outline-card-title', text: chapter.title }));
  card.appendChild(el('p', {
    class: 'outline-card-summary',
    text: chapter.summary || '暂无摘要。点右上角编辑，写下这一章要完成的事。',
  }));
  const plotDots = el('div', { class: 'outline-plot-dots' });
  for (const id of chapter.plotlineIds || []) {
    const line = app.state.plotlines.find(p => p.id === id);
    if (line) plotDots.appendChild(el('span', { class: 'color-dot', title: line.name, style: { background: line.color || '#b4552d' } }));
  }
  if (plotDots.children.length) card.appendChild(plotDots);
  card.appendChild(el('div', { class: 'outline-card-foot' }, [
    el('span', { text: `${fmtNumber(counts)} 字${target ? ` / ${fmtNumber(target)}` : ''}` }),
    target ? el('span', { class: 'mini-progress' }, [el('span', { style: { width: `${pct}%` } })]) : null,
  ]));
  card.addEventListener('click', () => app.openChapter(chapter.id));
  return card;
}

/* ============================= 人物 ============================= */

function renderCharactersView(app) {
  const { page, body } = makePage({
    title: '人物',
    subtitle: '把人物的来历、口吻与关系放在手边，写作时不再前后矛盾。',
    actions: [
      makeButton(app.state.charView === 'graph' ? '卡片视图' : '人物星图', {
        iconName: app.state.charView === 'graph' ? 'grid' : 'starmap', ghost: true,
        onClick: () => { app.state.charView = app.state.charView === 'graph' ? 'cards' : 'graph'; app.renderMain(); },
      }),
      makeButton('新建人物', { iconName: 'plus', primary: true, onClick: () => openCharacterEditor(app, null) }),
    ],
  });

  const search = el('input', { class: 'input search-input', placeholder: '搜索姓名、身份、标签…' });
  if (app.state.charView === 'graph') search.classList.add('hidden');
  body.appendChild(toolbarRow([search, el('span', {
    class: 'muted tiny',
    text: app.state.charView === 'graph'
      ? '星图：拖动旋转 / 滚轮缩放 / 双击星体定焦；下方可切到 2D 引力星云。'
      : '人物出场会随章节保存自动关联。',
  })]));

  const host = el('div');
  body.appendChild(host);
  const paint = () => {
    const keyword = search.value.trim();
    host.innerHTML = '';
    const chars = app.state.characters.filter(c =>
      !keyword || [c.name, c.alias, c.role, c.identity, ...(c.tags || [])].join(' ').includes(keyword)
    );
    if (!app.state.characters.length) {
      host.appendChild(emptyState({
        iconName: 'users', title: '还没有人物档案',
        desc: '给主角建一张档案卡，写作时可以从右侧“人物”面板快速插入姓名。',
        actionLabel: '新建人物', onAction: () => openCharacterEditor(app, null),
      }));
      return;
    }
    if (!chars.length) {
      host.appendChild(emptyState({ iconName: 'search', title: '没有匹配的人物', desc: '换个关键词试试。' }));
      return;
    }
    if (app.state.charView === 'graph') {
      host.appendChild(renderStarMap(app, app.state.characters, {
        onEdit: character => openCharacterEditor(app, character),
      }));
      return;
    }
    const grid = el('div', { class: 'character-grid' });
    for (const c of chars) {
      const mentioned = app.state.chapters.some(ch => (ch.mentions || []).includes(c.id));
      const card = el('article', { class: 'character-card' });
      const head = el('div', { class: 'character-head' });
      head.appendChild(el('div', {
        class: 'character-avatar',
        style: { background: c.color || '#8a5a3b' },
        text: (c.name || '?').slice(0, 1),
      }));
      head.appendChild(el('div', { class: 'character-head-meta' }, [
        el('h3', { text: c.name }),
        el('span', { class: 'character-alias', text: [c.alias, c.role].filter(Boolean).join(' · ') || '人物' }),
      ]));
      if (mentioned) head.appendChild(badge('已出场', 'success'));
      card.appendChild(head);
      card.appendChild(el('p', {
        class: 'character-bio',
        text: truncate(c.identity || c.personality || c.bio || '暂无档案。', 62),
      }));
      const tags = el('div', { class: 'tag-row' });
      (c.tags || []).slice(0, 4).forEach(t => tags.appendChild(el('span', { class: 'tag', text: t })));
      card.appendChild(tags);
      const foot = el('div', { class: 'character-foot' });
      const appearances = app.state.chapters.filter(ch => (ch.mentions || []).includes(c.id)).length;
      foot.appendChild(el('span', { class: 'muted tiny', text: appearances ? `出场 ${appearances} 章` : '尚未关联出场' }));
      const actions = el('div', { class: 'character-actions' });
      actions.appendChild(makeButton('插入姓名', { small: true, ghost: true, onClick: () => app.insertIntoEditor(c.name) }));
      actions.appendChild(makeButton('编辑档案', { small: true, onClick: () => openCharacterEditor(app, c) }));
      foot.appendChild(actions);
      card.appendChild(foot);
      card.addEventListener('dblclick', () => openCharacterEditor(app, c));
      grid.appendChild(card);
    }
    host.appendChild(grid);
  };
  search.addEventListener('input', paint);
  paint();
  return page;
}

export function openCharacterEditor(app, character) {
  const isNew = !character;
  const draft = character ? { ...character } : {
    id: uid('chr'), projectId: app.state.project.id, name: '', alias: '', role: '配角', gender: '男',
    identity: '', appearance: '', personality: '', bio: '', tags: [], color: '#8a5a3b',
    relations: [], createdAt: Date.now(),
  };
  const name = el('input', { class: 'input', value: draft.name, placeholder: '姓名' });
  const alias = el('input', { class: 'input', value: draft.alias || '', placeholder: '别名、外号，用 / 分隔' });
  const role = el('select', { class: 'input' }, ['主角', '女主', '配角', '反派', '龙套'].map(r => el('option', { value: r, text: r })));
  role.value = draft.role || '配角';
  const gender = el('select', { class: 'input' }, ['男', '女', '未知'].map(g => el('option', { value: g, text: g })));
  gender.value = draft.gender || '男';
  const identity = el('input', { class: 'input', value: draft.identity || '', placeholder: '身份、阵营、职业…' });
  const appearance = el('textarea', { class: 'input', rows: 2, placeholder: '外貌、衣着、标志性细节…' });
  appearance.value = draft.appearance || '';
  const personality = el('textarea', { class: 'input', rows: 2, placeholder: '性格、说话方式、在意的事…' });
  personality.value = draft.personality || '';
  const bio = el('textarea', { class: 'input', rows: 4, placeholder: '人物小传、前史、秘密…' });
  bio.value = draft.bio || '';
  const tags = el('input', { class: 'input', value: (draft.tags || []).join('，'), placeholder: '标签，逗号分隔' });
  const color = el('input', { class: 'input color-input', type: 'color', value: draft.color || '#8a5a3b' });

  const relationsBox = el('div', { class: 'relation-editor' });
  const relations = (draft.relations || []).map(r => ({ ...r }));
  const addRelationRow = (rel = {}) => {
    const row = el('div', { class: 'relation-row' });
    const select = el('select', { class: 'input' }, [
      el('option', { value: '', text: '选择人物' }),
      ...app.state.characters.filter(c => c.id !== draft.id).map(c => el('option', { value: c.id, text: c.name })),
    ]);
    select.value = rel.targetId || '';
    const label = el('input', { class: 'input', value: rel.label || '', placeholder: '关系描述，如：青梅竹马' });
    const remove = makeIconButton('x', '删除这条关系', () => {
      const idx = relations.indexOf(item);
      if (idx >= 0) relations.splice(idx, 1);
      row.remove();
    }, { small: true });
    const item = { targetId: select.value, label: label.value };
    const sync = () => { item.targetId = select.value; item.label = label.value.trim(); };
    select.addEventListener('change', sync);
    label.addEventListener('input', sync);
    const idx = relations.indexOf(rel);
    if (idx >= 0) relations.splice(idx, 1);
    relations.push(item);
    row.appendChild(select);
    row.appendChild(label);
    row.appendChild(remove);
    relationsBox.appendChild(row);
  };
  // 清空后按实际内容重建，避免重复
  relations.length = 0;
  const initialRelations = (draft.relations || []).map(r => ({ ...r }));
  relationsBox.innerHTML = '';
  initialRelations.forEach(r => addRelationRow(r));
  if (!initialRelations.length) {
    // 空状态提示
    relationsBox.appendChild(el('p', { class: 'muted tiny relation-empty', text: '还没有关系。可以从下方添加。' }));
  }
  const addBtn = makeButton('添加关系', {
    small: true, ghost: true, iconName: 'plus',
    onClick: () => {
      relationsBox.querySelector('.relation-empty')?.remove();
      addRelationRow({});
    },
  });

  const appearancesBox = el('div', { class: 'appearance-list' });
  const renderAppearances = (chapters) => {
    appearancesBox.innerHTML = '';
    if (!chapters.length) {
      appearancesBox.appendChild(el('p', { class: 'muted small', text: '暂无出场记录。保存章节或点击“重新扫描”后会自动关联。' }));
      return;
    }
    chapters.forEach(ch => {
      const row = el('div', { class: 'appearance-row' });
      row.appendChild(el('span', { text: ch.title }));
      row.appendChild(makeButton('打开', { small: true, ghost: true, onClick: () => { modal.close(); app.openChapter(ch.id); } }));
      appearancesBox.appendChild(row);
    });
  };
  const initialAppearances = app.state.chapters
    .filter(ch => (ch.mentions || []).includes(draft.id))
    .sort((a, b) => a.order - b.order);
  renderAppearances(initialAppearances);

  const scanBtn = makeButton('重新扫描出场', {
    small: true, ghost: true, iconName: 'refresh',
    onClick: async () => {
      if (isNew) { toast('先保存人物，再扫描出场', 'info'); return; }
      await app.saveCurrent('scan');
      const obj = { ...draft, name: name.value.trim(), alias: alias.value.trim() };
      const found = await app.scanCharacterAppearances(obj);
      renderAppearances(found.sort((a, b) => a.order - b.order));
      toast(`扫描完成：共 ${found.length} 章出场`, 'success');
    },
  });

  const body = el('div', { class: 'form-stack character-editor' }, [
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '姓名 *' }), name]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '别名' }), alias]),
    ]),
    el('div', { class: 'form-grid-3' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '定位' }), role]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '性别' }), gender]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '代表色' }), color]),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '身份 / 阵营' }), identity]),
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '外貌' }), appearance]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '性格与口吻' }), personality]),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '人物小传' }), bio]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '标签' }), tags]),
    el('div', { class: 'editor-section' }, [
      el('div', { class: 'editor-section-head' }, [
        el('span', { class: 'editor-section-title', text: '人物关系' }),
        addBtn,
      ]),
      relationsBox,
    ]),
    el('div', { class: 'editor-section' }, [
      el('div', { class: 'editor-section-head' }, [
        el('span', { class: 'editor-section-title', text: '登场章节' }),
        scanBtn,
      ]),
      appearancesBox,
    ]),
  ]);

  const modal = showModal({
    title: isNew ? '新建人物' : `编辑人物 · ${draft.name}`,
    subtitle: '档案会保存在本机，不会上传。',
    body,
    width: 700,
    actions: [
      isNew ? null : {
        label: '删除人物', danger: true, ghost: true, close: false,
        onClick: async () => {
          const ok = await confirmDialog(`删除「${draft.name}」的档案？不会删除正文中出现的名字。`, { danger: true, okLabel: '删除' });
          if (!ok) return false;
          await del('characters', draft.id);
          app.state.characters = app.state.characters.filter(c => c.id !== draft.id);
          // 清理其他人物指向此人的关系
          for (const other of app.state.characters) {
            const cleaned = (other.relations || []).filter(r => r.targetId !== draft.id);
            if (cleaned.length !== (other.relations || []).length) {
              other.relations = cleaned;
              await put('characters', other);
            }
          }
          // 清理各章节出场记录中对该人物的引用，避免徽章残留
          for (const ch of app.state.chapters) {
            if (!Array.isArray(ch.mentions) || !ch.mentions.includes(draft.id)) continue;
            const cleaned = ch.mentions.filter(id => id !== draft.id);
            await put('chapters', { ...ch, mentions: cleaned });
            app.state.chapters = app.state.chapters.map(c => (c.id === ch.id ? { ...c, mentions: cleaned } : c));
          }
          modal.close();
          app.renderSidebar();
          if (app.state.view === 'characters') app.renderMain();
          app.renderInspector();
          toast('人物已删除', 'info');
          return false;
        },
      },
      { label: '取消', ghost: true },
      {
        label: '保存', primary: true,
        onClick: async () => {
          const n = name.value.trim();
          if (!n) { name.focus(); name.classList.add('shake'); setTimeout(() => name.classList.remove('shake'), 400); return false; }
          const obj = {
            ...draft,
            id: draft.id,
            projectId: draft.projectId || app.state.project.id,
            createdAt: draft.createdAt || Date.now(),
            name: n,
            alias: alias.value.trim(),
            role: role.value,
            gender: gender.value,
            identity: identity.value.trim(),
            appearance: appearance.value.trim(),
            personality: personality.value.trim(),
            bio: bio.value.trim(),
            tags: parseTags(tags.value),
            color: color.value,
            relations: relations.filter(r => r.targetId && r.targetId !== draft.id),
            updatedAt: Date.now(),
          };
          await put('characters', obj);
          if (isNew) app.state.characters.push(obj);
          else app.state.characters = app.state.characters.map(c => c.id === obj.id ? obj : c);
          modal.close();
          app.renderSidebar();
          if (app.state.view === 'characters') app.renderMain();
          app.renderInspector();
          toast(isNew ? '人物已创建' : '人物档案已更新', 'success');
        },
      },
    ].filter(Boolean),
  });
}

/* ============================= 设定 ============================= */

function renderLoreView(app) {
  const categories = Array.from(new Set([
    '世界观', '势力', '功法', '物品', '地点',
    ...app.state.lore.map(x => x.category).filter(Boolean),
  ]));
  let selected = '全部';
  const { page, body } = makePage({
    title: '设定',
    subtitle: '世界观、势力、功法、地点……写到一个东西时，能立刻查回它的规则。',
    actions: [
      makeButton('新建设定', { iconName: 'plus', primary: true, onClick: () => openLoreEditor(app, null) }),
    ],
  });
  const search = el('input', { class: 'input search-input', placeholder: '搜索名称、标签、内容…' });
  const chips = el('div', { class: 'chip-row' });
  const grid = el('div', { class: 'lore-grid' });

  const paint = () => {
    const keyword = search.value.trim();
    chips.innerHTML = '';
    ['全部', ...categories].forEach(cat => {
      chips.appendChild(el('button', {
        class: `chip ${selected === cat ? 'active' : ''}`.trim(),
        type: 'button', text: cat,
        onClick: () => { selected = cat; paint(); },
      }));
    });
    grid.innerHTML = '';
    const entries = app.state.lore.filter(entry => {
      const inCat = selected === '全部' || entry.category === selected;
      const kw = !keyword || [entry.name, entry.category, (entry.tags || []).join(' '), entry.content].join(' ').includes(keyword);
      return inCat && kw;
    });
    if (!entries.length) {
      grid.appendChild(emptyState({
        iconName: 'book',
        title: app.state.lore.length ? '没有匹配的设定' : '还没有设定条目',
        desc: app.state.lore.length ? '换个分类或关键词。' : '先写下世界的基本规则，比如“魂环如何获得”。',
        actionLabel: '新建设定', onAction: () => openLoreEditor(app, null),
      }));
      return;
    }
    for (const entry of entries) {
      const card = el('article', { class: 'lore-card' });
      const head = el('div', { class: 'lore-card-head' }, [
        badge(entry.category || '未分类', 'accent'),
        el('h3', { text: entry.name }),
      ]);
      card.appendChild(head);
      card.appendChild(el('p', { class: 'lore-content', text: truncate(entry.content, 180) }));
      const tags = el('div', { class: 'tag-row' });
      (entry.tags || []).forEach(t => tags.appendChild(el('span', { class: 'tag', text: t })));
      card.appendChild(tags);
      const foot = el('div', { class: 'lore-foot' }, [
        el('span', { class: 'muted tiny', text: `更新于 ${new Date(entry.updatedAt || Date.now()).toLocaleDateString('zh-CN')}` }),
        makeButton('编辑', { small: true, ghost: true, onClick: () => openLoreEditor(app, entry) }),
      ]);
      card.appendChild(foot);
      grid.appendChild(card);
    }
  };
  search.addEventListener('input', paint);
  body.appendChild(toolbarRow([search]));
  body.appendChild(chips);
  body.appendChild(grid);
  paint();
  return page;
}

function openLoreEditor(app, entry) {
  const isNew = !entry;
  const categories = Array.from(new Set(['世界观', '势力', '功法', '物品', '地点', ...app.state.lore.map(x => x.category)]));
  const name = el('input', { class: 'input', value: entry?.name || '', placeholder: '例如：魂环、青麓学院' });
  const category = el('input', { class: 'input', value: entry?.category || '世界观', list: 'lore-categories' });
  const datalist = el('datalist', { id: 'lore-categories' });
  categories.forEach(c => datalist.appendChild(el('option', { value: c })));
  const tags = el('input', { class: 'input', value: (entry?.tags || []).join('，'), placeholder: '标签，逗号分隔' });
  const content = el('textarea', { class: 'input', rows: 10 });
  content.value = entry?.content || '';
  const body = el('div', { class: 'form-stack' }, [
    el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '名称 *' }), name]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '分类' }), category, datalist]),
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '标签' }), tags]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '内容' }), content]),
  ]);
  const modal = showModal({
    title: isNew ? '新建设定' : '编辑设定',
    body,
    width: 620,
    actions: [
      isNew ? null : {
        label: '删除', danger: true, ghost: true, close: false,
        onClick: async () => {
          const ok = await confirmDialog(`删除设定「${entry.name}」？`, { danger: true, okLabel: '删除' });
          if (!ok) return false;
          await del('lore', entry.id);
          app.state.lore = app.state.lore.filter(x => x.id !== entry.id);
          modal.close();
          app.renderSidebar();
          app.renderMain();
          toast('设定已删除', 'info');
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
            ...(isNew ? { id: uid('lore'), projectId: app.state.project.id, createdAt: Date.now() } : {}),
            name: n,
            category: category.value.trim() || '未分类',
            tags: parseTags(tags.value),
            content: content.value.trim(),
            updatedAt: Date.now(),
          };
          await put('lore', obj);
          if (isNew) app.state.lore.push(obj);
          else app.state.lore = app.state.lore.map(x => x.id === obj.id ? obj : x);
          modal.close();
          app.renderSidebar();
          app.renderMain();
          toast(isNew ? '设定已创建' : '设定已更新', 'success');
        },
      },
    ].filter(Boolean),
  });
}
