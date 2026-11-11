/**
 * 开发辅助：为已导入的书目补齐章节摘要、人物、设定、剧情线与素材。
 * 不复制正文，只写入人工整理的元数据；可重复运行（会先清空该书目的旧元数据）。
 */
import {
  getAll, getAllBy, put, bulkPut, del,
} from './db.js';
import { uid, htmlToText } from './utils.js';

const META_STORES = ['characters', 'lore', 'materials', 'snippets', 'plotlines', 'plotnodes'];

export async function applyEnrichment(app, data) {
  const project = app.state.projects.find(p => p.name === data.projectName);
  if (!project) throw new Error(`没有找到作品：${data.projectName}`);
  const now = Date.now();

  const chapters = (await getAllBy('chapters', 'projectId', project.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!chapters.length) throw new Error('目标作品没有章节');

  const chapterIds = new Set(chapters.map(c => c.id));
  const allContents = await getAll('contents');
  const contentMap = new Map(allContents.filter(c => chapterIds.has(c.id)).map(c => [c.id, c.html || '']));

  // 1) 章节摘要与标签
  chapters.forEach((chapter, index) => {
    const meta = data.chapters?.[index] || {};
    if (meta.summary) chapter.summary = meta.summary;
    if (Array.isArray(meta.tags)) chapter.tags = meta.tags;
    chapter.updatedAt = now;
  });

  // 2) 清理旧元数据，避免重复导入累积
  for (const store of META_STORES) {
    const rows = await getAllBy(store, 'projectId', project.id);
    for (const row of rows) await del(store, row.id);
  }

  // 3) 人物
  const charIdByName = new Map();
  for (const c of data.characters || []) {
    if (!charIdByName.has(c.name)) charIdByName.set(c.name, uid('chr'));
  }
  const characters = (data.characters || []).map((c, index) => ({
    id: charIdByName.get(c.name),
    projectId: project.id,
    name: c.name,
    alias: c.alias || '',
    role: c.role || '配角',
    gender: c.gender || '',
    identity: c.identity || '',
    appearance: c.appearance || '',
    personality: c.personality || '',
    bio: c.bio || '',
    tags: c.tags || [],
    color: c.color || '#8a5a3b',
    relations: (c.relations || [])
      .map(r => ({ targetId: charIdByName.get(r.targetName) || null, label: r.label || '' }))
      .filter(r => r.targetId && r.targetId !== charIdByName.get(c.name)),
    createdAt: now + index,
    updatedAt: now,
  }));
  await bulkPut('characters', characters);

  // 4) 人物出场自动关联
  for (const chapter of chapters) {
    const text = htmlToText(contentMap.get(chapter.id) || '');
    const mentions = [];
    for (const character of characters) {
      const names = [character.name, ...String(character.alias || '').split(/[\/，,、\s]+/)]
        .map(s => s.trim()).filter(s => s.length >= 2);
      if (names.some(name => text.includes(name))) mentions.push(character.id);
    }
    chapter.mentions = mentions;
    await put('chapters', chapter);
  }

  // 5) 设定 / 素材 / 快捷短语
  const lore = (data.lore || []).map((l, index) => ({
    id: uid('lore'), projectId: project.id, ...l, createdAt: now + index, updatedAt: now,
  }));
  const materials = (data.materials || []).map((m, index) => ({
    id: uid('mat'), projectId: project.id, ...m, createdAt: now + index, updatedAt: now,
  }));
  const snippets = (data.snippets || []).map((s, index) => ({
    id: uid('snip'), projectId: project.id, ...s, createdAt: now + index,
  }));
  await bulkPut('lore', lore);
  await bulkPut('materials', materials);
  await bulkPut('snippets', snippets);

  // 6) 剧情线与节点
  const chapterByOrder = new Map(chapters.map(c => [c.order, c]));
  const plotlines = [];
  const plotnodes = [];
  let nodeOrder = 0;
  for (const [lineIndex, line] of (data.plotlines || []).entries()) {
    const lineId = uid('pl');
    plotlines.push({
      id: lineId,
      projectId: project.id,
      name: line.name,
      color: line.color || '#b4552d',
      description: line.description || '',
      createdAt: now + lineIndex,
      updatedAt: now,
    });
    for (const node of line.nodes || []) {
      const chapter = node.chapterOrder === null || node.chapterOrder === undefined
        ? null : chapterByOrder.get(node.chapterOrder);
      plotnodes.push({
        id: uid('node'),
        projectId: project.id,
        plotlineId: lineId,
        chapterId: chapter ? chapter.id : null,
        title: node.title,
        note: node.note || '',
        color: node.color || line.color || '#b4552d',
        done: Boolean(node.done),
        order: nodeOrder++,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  await bulkPut('plotlines', plotlines);
  await bulkPut('plotnodes', plotnodes);

  // 7) 作品说明
  if (data.projectDescription) {
    const updated = { ...project, description: data.projectDescription, updatedAt: now };
    await put('projects', updated);
  }

  return {
    projectId: project.id,
    projectName: project.name,
    chapters: chapters.length,
    characters: characters.length,
    lore: lore.length,
    materials: materials.length,
    snippets: snippets.length,
    plotlines: plotlines.length,
    plotnodes: plotnodes.length,
  };
}
