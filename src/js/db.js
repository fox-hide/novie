/* Novie — IndexedDB 数据层（章节元数据与正文分离） */

import { uid } from './utils.js';

const DB_NAME = 'novie-db';
const DB_VERSION = 2;

const SPECS = {
  projects: { keyPath: 'id', indexes: [] },
  volumes: { keyPath: 'id', indexes: ['projectId'] },
  chapters: { keyPath: 'id', indexes: ['projectId', 'volumeId'] },
  contents: { keyPath: 'id', indexes: [] },
  characters: { keyPath: 'id', indexes: ['projectId'] },
  lore: { keyPath: 'id', indexes: ['projectId'] },
  materials: { keyPath: 'id', indexes: ['projectId'] },
  snippets: { keyPath: 'id', indexes: ['projectId'] },
  plotlines: { keyPath: 'id', indexes: ['projectId'] },
  plotnodes: { keyPath: 'id', indexes: ['projectId', 'plotlineId'] },
  foreshadows: { keyPath: 'id', indexes: ['projectId'] },
  versions: { keyPath: 'id', indexes: ['projectId', 'chapterId'] },
  daily: { keyPath: 'id', indexes: ['projectId'] },
  backups: { keyPath: 'id', indexes: ['projectId'] },
  app: { keyPath: null, indexes: [] },
};

export const PROJECT_SCOPED_STORES = [
  'volumes', 'chapters', 'characters', 'lore', 'materials', 'snippets',
  'plotlines', 'plotnodes', 'foreshadows', 'versions', 'daily', 'backups'
];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, spec] of Object.entries(SPECS)) {
        let store;
        if (db.objectStoreNames.contains(name)) {
          store = req.transaction.objectStore(name);
        } else {
          store = db.createObjectStore(name, spec.keyPath ? { keyPath: spec.keyPath } : undefined);
        }
        for (const index of spec.indexes) {
          if (!store.indexNames.contains(index)) store.createIndex(index, index, { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('Novie: IndexedDB 被其他窗口占用');
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('事务中止'));
  });
}

export async function get(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllBy(store, indexName, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readonly');
  const os = tx.objectStore(store);
  if (!os.indexNames.contains(indexName)) {
    return new Promise((resolve, reject) => {
      const req = os.getAll();
      req.onsuccess = () => resolve((req.result || []).filter(r => r[indexName] === value));
      req.onerror = () => reject(req.error);
    });
  }
  return new Promise((resolve, reject) => {
    const req = os.index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, value, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function bulkPut(store, values) {
  if (!values || !values.length) return;
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  values.forEach(v => os.put(v));
  await done(tx);
}

export async function bulkDel(store, keys) {
  if (!keys || !keys.length) return;
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  keys.forEach(k => os.delete(k));
  await done(tx);
}

export async function del(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getApp(key, fallback = null) {
  const row = await get('app', key).catch(() => undefined);
  return row === undefined ? fallback : row;
}

export async function setApp(key, value) {
  await put('app', value, key);
}

export async function getChapterContent(chapterId) {
  const row = await get('contents', chapterId);
  return row ? row.html || '' : '';
}

export async function saveChapterContent(chapterId, html) {
  await put('contents', { id: chapterId, html, updatedAt: Date.now() });
}

/**
 * 纯函数：删除章节时的引用级联。被删章关联的剧情节点 chapterId 置 null、
 * 伏笔的埋设/预计回收/回收三段章 id 置 null——避免"悬挂引用被静默洗白"。
 * 未变化的行返回原引用，方便调用方识别需要回写的行。测试与 deleteChapterDeep 共用。
 */
export function applyChapterDeletionCascade({ plotnodes = [], foreshadows = [] }, chapterId) {
  let cleared = 0;
  const nextNodes = plotnodes.map(n => {
    if (!n || n.chapterId !== chapterId) return n;
    cleared++;
    return { ...n, chapterId: null };
  });
  const nextForeshadows = foreshadows.map(f => {
    if (!f) return f;
    let changed = false;
    const out = { ...f };
    for (const key of ['plantChapterId', 'targetChapterId', 'resolvedChapterId']) {
      if (out[key] === chapterId) { out[key] = null; changed = true; }
    }
    if (changed) cleared++;
    return changed ? out : f;
  });
  return { plotnodes: nextNodes, foreshadows: nextForeshadows, cleared };
}

/** 纯函数：合并章节时，把指向被删章的引用改指向合并后的目标章。 */
export function repointChapterReferences({ plotnodes = [], foreshadows = [] }, fromId, toId) {
  const nextNodes = plotnodes.map(n => {
    if (!n || n.chapterId !== fromId) return n;
    return { ...n, chapterId: toId };
  });
  const nextForeshadows = foreshadows.map(f => {
    if (!f) return f;
    let changed = false;
    const out = { ...f };
    for (const key of ['plantChapterId', 'targetChapterId', 'resolvedChapterId']) {
      if (out[key] === fromId) { out[key] = toId; changed = true; }
    }
    return changed ? out : f;
  });
  return { plotnodes: nextNodes, foreshadows: nextForeshadows };
}

export async function deleteChapterDeep(chapterId) {
  const db = await openDB();
  // 单事务完成：删正文 + 删快照 + 级联清理剧情/伏笔引用
  const tx = db.transaction(['contents', 'versions', 'plotnodes', 'foreshadows'], 'readwrite');
  const contents = tx.objectStore('contents');
  const versions = tx.objectStore('versions');
  const plotnodes = tx.objectStore('plotnodes');
  const foreshadows = tx.objectStore('foreshadows');
  let clearedRefs = 0;
  contents.delete(chapterId);
  const vReq = versions.index('chapterId').getAll(chapterId);
  vReq.onsuccess = () => { (vReq.result || []).forEach(v => versions.delete(v.id)); };
  // plotnodes 没有 chapterId 索引（DB v2 的既有 schema），getAll 后内存过滤；
  // 剧情节点与伏笔统一走级联纯函数
  let nodesResult = null;
  let foreshadowResult = null;
  const applyCascade = () => {
    if (!nodesResult || !foreshadowResult) return;
    const cascade = applyChapterDeletionCascade(
      { plotnodes: nodesResult, foreshadows: foreshadowResult }, chapterId
    );
    clearedRefs += cascade.cleared;
    cascade.plotnodes.forEach((n, i) => { if (n !== nodesResult[i]) plotnodes.put(n); });
    cascade.foreshadows.forEach((f, i) => { if (f !== foreshadowResult[i]) foreshadows.put(f); });
  };
  const nReq = plotnodes.getAll();
  nReq.onsuccess = () => { nodesResult = nReq.result || []; applyCascade(); };
  const fReq = foreshadows.getAll();
  fReq.onsuccess = () => { foreshadowResult = fReq.result || []; applyCascade(); };
  await done(tx);
  return { clearedRefs };
}

/** 导出完整工程包（不含密码哈希与内部备份）。 */
export async function exportProjectBundle(projectId, { includeVersions = true } = {}) {
  const project = await get('projects', projectId);
  if (!project) throw new Error('作品不存在');
  const [volumes, chapters, characters, lore, materials, snippets, plotlines, plotnodes, foreshadows, daily] = await Promise.all([
    getAllBy('volumes', 'projectId', projectId),
    getAllBy('chapters', 'projectId', projectId),
    getAllBy('characters', 'projectId', projectId),
    getAllBy('lore', 'projectId', projectId),
    getAllBy('materials', 'projectId', projectId),
    getAllBy('snippets', 'projectId', projectId),
    getAllBy('plotlines', 'projectId', projectId),
    getAllBy('plotnodes', 'projectId', projectId),
    getAllBy('foreshadows', 'projectId', projectId),
    getAllBy('daily', 'projectId', projectId),
  ]);
  const chapterIds = new Set(chapters.map(c => c.id));
  const allContents = await getAll('contents');
  const contents = allContents.filter(c => chapterIds.has(c.id));
  let versions = [];
  if (includeVersions) {
    versions = (await getAllBy('versions', 'projectId', projectId))
      .filter(v => chapterIds.has(v.chapterId));
  }
  const safeProject = { ...project };
  delete safeProject.password;
  return {
    app: 'Novie',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project: safeProject,
    volumes: volumes.sort((a, b) => a.order - b.order),
    chapters: chapters.sort((a, b) => a.order - b.order),
    contents,
    characters,
    lore,
    materials,
    snippets,
    plotlines,
    plotnodes,
    foreshadows,
    versions,
    daily,
  };
}

/** 导入为一部新作品（内部全部重映射 ID，避免冲突）。 */
export async function importProjectBundle(bundle, { nameSuffix = '（导入）' } = {}) {
  if (!bundle || !bundle.project) throw new Error('不是有效的 Novie 工程备份');
  const now = Date.now();
  const idMap = new Map();
  const mapId = oldId => {
    if (!oldId) return oldId;
    if (!idMap.has(oldId)) idMap.set(oldId, uid());
    return idMap.get(oldId);
  };

  const newProjectId = mapId(bundle.project.id || 'project');
  const baseName = String(bundle.project.name || '未命名作品')
    .replace(/（(导入|云端恢复|本机恢复)）$/g, '');
  const newProject = {
    ...bundle.project,
    id: newProjectId,
    name: `${baseName}${nameSuffix}`,
    createdAt: bundle.project.createdAt || now,
    updatedAt: now,
    lastOpenedAt: now,
    password: null,
  };
  delete newProject.lastChapterId;

  let volumes = (bundle.volumes || []).map(v => ({
    ...v,
    id: mapId(v.id),
    projectId: newProjectId,
  }));
  if (!volumes.length) {
    volumes = [{ id: uid('vol'), projectId: newProjectId, title: '正文', order: 0 }];
  }
  volumes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  volumes.forEach((v, i) => { v.order = i; });

  const fallbackVolume = volumes[0].id;
  const chapterIdMap = new Map();
  const chapters = (bundle.chapters || []).map(c => {
    const nid = mapId(c.id);
    chapterIdMap.set(c.id, nid);
    return {
      ...c,
      id: nid,
      projectId: newProjectId,
      volumeId: volumes.some(v => v.id === mapId(c.volumeId)) ? mapId(c.volumeId) : fallbackVolume,
      updatedAt: c.updatedAt || now,
      createdAt: c.createdAt || now,
    };
  });
  chapters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  chapters.forEach((c, i) => { c.order = i; });

  const characters = (bundle.characters || []).map(ch => ({
    ...ch,
    id: mapId(ch.id),
    projectId: newProjectId,
    relations: (ch.relations || []).map(r => ({
      ...r,
      targetId: r.targetId ? mapId(r.targetId) : null,
    })),
  }));

  const plotlines = (bundle.plotlines || []).map(p => ({ ...p, id: mapId(p.id), projectId: newProjectId }));
  const plotnodes = (bundle.plotnodes || []).map(n => ({
    ...n,
    id: mapId(n.id),
    projectId: newProjectId,
    plotlineId: mapId(n.plotlineId),
    chapterId: n.chapterId ? mapId(n.chapterId) : null,
  }));

  const foreshadows = (bundle.foreshadows || []).map(f => ({
    ...f,
    id: mapId(f.id),
    projectId: newProjectId,
    plantChapterId: f.plantChapterId ? mapId(f.plantChapterId) : null,
    targetChapterId: f.targetChapterId ? mapId(f.targetChapterId) : null,
    resolvedChapterId: f.resolvedChapterId ? mapId(f.resolvedChapterId) : null,
  }));

  const contents = (bundle.contents || [])
    .filter(c => chapterIdMap.has(c.id))
    .map(c => ({ id: chapterIdMap.get(c.id), html: c.html || '', updatedAt: c.updatedAt || now }));

  const versions = (bundle.versions || [])
    .filter(v => chapterIdMap.has(v.chapterId))
    .map(v => ({
      ...v,
      id: mapId(v.id),
      projectId: newProjectId,
      chapterId: chapterIdMap.get(v.chapterId),
      createdAt: v.createdAt || now,
    }));

  const daily = (bundle.daily || []).map(d => ({
    ...d,
    id: `${newProjectId}|${d.date}`,
    projectId: newProjectId,
    words: Number(d.words) || 0,
    seconds: Number(d.seconds) || 0,
  }));

  await put('projects', newProject);
  await bulkPut('volumes', volumes);
  await bulkPut('chapters', chapters);
  await bulkPut('contents', contents);
  await bulkPut('characters', characters);
  await bulkPut('lore', (bundle.lore || []).map(x => ({ ...x, id: mapId(x.id), projectId: newProjectId })));
  await bulkPut('materials', (bundle.materials || []).map(x => ({ ...x, id: mapId(x.id), projectId: newProjectId })));
  await bulkPut('snippets', (bundle.snippets || []).map(x => ({ ...x, id: mapId(x.id), projectId: newProjectId })));
  await bulkPut('plotlines', plotlines);
  await bulkPut('plotnodes', plotnodes);
  await bulkPut('foreshadows', foreshadows);
  await bulkPut('versions', versions);
  await bulkPut('daily', daily);

  return newProject;
}

export async function deleteProjectDeep(projectId) {
  const db = await openDB();
  // 单事务删除整个工程：正文、各业务表与 project 行要么全部成功，要么全部回滚
  const storeNames = ['projects', 'contents', ...PROJECT_SCOPED_STORES];
  const tx = db.transaction(storeNames, 'readwrite');
  await new Promise((resolve, reject) => {
    const fail = () => reject(tx.error || new Error('删除作品失败'));
    tx.onerror = () => fail();
    tx.onabort = () => fail();
    const chReq = tx.objectStore('chapters').index('projectId').getAll(projectId);
    chReq.onsuccess = () => {
      const os = tx.objectStore('contents');
      (chReq.result || []).forEach(c => os.delete(c.id));
    };
    for (const store of PROJECT_SCOPED_STORES) {
      const os = tx.objectStore(store);
      const req = os.index('projectId').getAll(projectId);
      req.onsuccess = () => { (req.result || []).forEach(row => os.delete(row.id)); };
    }
    tx.objectStore('projects').delete(projectId);
    tx.oncomplete = () => resolve();
  });
}

export async function saveBackupSnapshot(projectId, bundle, keep = 4) {
  const record = {
    id: uid('bak'),
    projectId,
    createdAt: Date.now(),
    size: JSON.stringify(bundle).length,
    data: bundle,
  };
  await put('backups', record);
  const all = (await getAllBy('backups', 'projectId', projectId)).sort((a, b) => b.createdAt - a.createdAt);
  await bulkDel('backups', all.slice(keep).map(b => b.id));
  return record;
}

export async function listBackups(projectId) {
  const all = await getAllBy('backups', 'projectId', projectId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
