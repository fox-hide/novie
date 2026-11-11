/* Novie — 应用主控制器 */

import {
  $, uid, todayKey, dateKey, fmtNumber, fmtWan, fmtClock, parseTags, clamp, debounce,
  safeFileName, isDesktop, htmlToText, countChars, plainTextToHtml, addDays
} from './utils.js';
import {
  icon, toast, el, showModal, confirmDialog, promptDialog, emptyState,
  makeButton, makeIconButton, saveText, saveBytes, openFile, copyText
} from './ui.js';
import {
  openDB, getAll, getAllBy, get, put, bulkPut, del, getApp, setApp,
  getChapterContent, saveChapterContent, deleteChapterDeep, exportProjectBundle,
  importProjectBundle, deleteProjectDeep, listBackups
} from './db.js';
import { renderSidebar, renderGoalCard, showChapterInfo, openChapterMenu, openProjectMenu } from './sidebar.js';
import { renderWriteTopbar, renderWriteView, renderInspector, renderTabs, renderStatusbar } from './write.js';
import { renderView, VIEW_META, openCharacterEditor } from './views.js';
import { createDemoProject } from './demo.js';
import {
  buildTxt, buildProjectJson, isEncryptedBackup, decryptBackup,
  hashPassword, verifyPassword, splitPlainText
} from './exporters.js';
import { openSearchModal } from './tools.js';
import { maybeAutoBackup } from './sync.js';

export const FONTS = {
  serif: { label: '宋体 / 思源宋体', value: '"Noto Serif SC","Source Han Serif SC","Songti SC",SimSun,serif' },
  sans: { label: '黑体 / 微软雅黑', value: '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif' },
  kai: { label: '楷体', value: '"Kaiti SC",KaiTi,STKaiti,"Songti SC",serif' },
  fangsong: { label: '仿宋', value: '"FangSong","STFangsong","Noto Serif SC",serif' },
  mono: { label: '等宽', value: '"Sarasa Mono SC","Cascadia Mono",Consolas,monospace' },
};

export const THEMES = [
  { key: 'paper', label: '宣纸', bg: '#f4eee3', accent: '#8a5a3b' },
  { key: 'green', label: '护眼', bg: '#e8efe2', accent: '#4f7559' },
  { key: 'white', label: '极简', bg: '#ffffff', accent: '#2f6f8f' },
  { key: 'dark', label: '夜间', bg: '#1b1a1f', accent: '#d08a5e' },
];

let typeAudioCtx = null;

function playTypeClick() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!typeAudioCtx) typeAudioCtx = new Ctx();
    if (typeAudioCtx.state === 'suspended') typeAudioCtx.resume();
    const ctx = typeAudioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150 + Math.random() * 70, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.024);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  } catch { /* 忽略音频限制 */ }
}

const DEFAULT_SETTINGS = {
  theme: 'paper',
  lastLightTheme: 'paper',
  font: 'serif',
  fontSize: 18,
  lineHeight: 2.0,
  width: 780,
  indent: true,
  typewriter: false,
  countNoPunct: false,
  bg: null,
  bgOpacity: 0.14,
  sensitiveWords: [],
  lastProjectId: null,
  demoSeeded: false,
  douluoDemoV2Seeded: false,
  lockOnOpen: true,
  backupIntervalMin: 30,
  lastAutoBackupAt: 0,
  autoFileBackup: false,
  backupDir: '',
  lastFileBackupAt: 0,
  webdav: {
    url: '', user: '', pass: '', dir: 'novie', filename: 'novie-backup.noviebak',
    encrypt: true, auto: false, password: '',
  },
  goalSound: false,
  typeSound: false,
  compareChapterId: null,
};

export class App {
  constructor() {
    this.state = {
      ready: false,
      projects: [],
      project: null,
      volumes: [],
      chapters: [],
      characters: [],
      lore: [],
      materials: [],
      snippets: [],
      plotlines: [],
      plotnodes: [],
      foreshadows: [],
      daily: [],
      view: 'write',
      chapterId: null,
      activeChapter: null,
      currentHtml: '',
      openTabs: [],
      editor: null,
      rightTab: 'meta',
      inspectorOpen: true,
      focusMode: false,
      typewriter: false,
      saveState: 'saved',
      lastSavedAt: null,
      session: {
        lastCount: 0,
        lastInputAt: 0,
        editRevision: 0,
        saveTimer: null,
        dailyTimer: null,
        cushionTimer: null,
        pendingSeconds: 0,
      },
      lock: null,
      unlocked: true,
      compare: { enabled: false, chapterId: null },
      draggedChapterId: null,
      goalHitDate: null,
      charView: 'graph',
      pendingSelect: null,
      selectedCharacterId: null,
      chapterFilter: '',
    };
    this.settings = { ...DEFAULT_SETTINGS };
    this._saveChain = Promise.resolve();
    this._timers = [];
    this._bound = false;
  }

  /* ============================= Boot ============================= */

  async boot() {
    await openDB();
    const savedSettings = await getApp('settings', {});
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(savedSettings || {}),
      webdav: { ...DEFAULT_SETTINGS.webdav, ...((savedSettings || {}).webdav || {}) },
    };
    this.state.typewriter = Boolean(this.settings.typewriter);
    this.applySettings();
    this.bindGlobal();

    this.state.projects = await getAll('projects');
    let projectId = this.settings.lastProjectId;
    if (!this.state.projects.some(p => p.id === projectId)) projectId = null;

    if (!this.state.projects.length) {
      if (!this.settings.demoSeeded) {
        const demo = await createDemoProject();
        this.settings.demoSeeded = true;
        await setApp('settings', this.settings);
        projectId = demo.id;
        this.state.projects = await getAll('projects');
      } else {
        const blank = await this.createProjectData({ name: '未命名作品', author: '', dailyGoal: 3000 }, { silent: true });
        projectId = blank.id;
        this.state.projects = await getAll('projects');
      }
    }

    // 旧版本用户可能已经有示例工程：补入新版同人示例，但不删除任何旧数据
    let v2DemoAdded = false;
    let v2DemoId = null;
    if (!this.settings.douluoDemoV2Seeded) {
      const existingV2 = this.state.projects.find(p => p.name === '《斗罗大陆1》同人参考');
      if (existingV2) {
        v2DemoId = existingV2.id;
      } else {
        const demo = await createDemoProject();
        this.state.projects = await getAll('projects');
        v2DemoId = demo.id;
        v2DemoAdded = true;
        const oldDemoNames = new Set(['《斗罗大陆1》拆书参考', '魂灯纪']);
        const current = this.state.projects.find(p => p.id === projectId);
        const onlyOldDemo = this.state.projects
          .filter(p => p.id !== v2DemoId)
          .every(p => oldDemoNames.has(p.name));
        if (onlyOldDemo) projectId = v2DemoId;
        else if (current && oldDemoNames.has(current.name)) {
          // 当前正好是旧示例，直接切到新版；用户自己的作品不受影响
          projectId = v2DemoId;
        }
      }
      this.settings.douluoDemoV2Seeded = true;
      await setApp('settings', this.settings);
    }

    if (!projectId) {
      const sorted = [...this.state.projects].sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
      projectId = sorted[0]?.id;
    }
    await this.loadProject(projectId, { initial: true });
    this.startTimers();
    this.state.ready = true;
    setTimeout(() => {
      maybeAutoBackup(this).catch(err => console.warn('自动备份失败', err));
    }, 20000);
    if (v2DemoAdded) {
      setTimeout(() => toast(
        projectId === v2DemoId
          ? '已加入新版《斗罗大陆1》同人示例（8 章）；旧示例仍保留，可在左上角切换。'
          : '已加入新版《斗罗大陆1》同人示例，可在左上角作品菜单中打开。',
        'info', 5600
      ), 800);
    }
  }

  bindGlobal() {
    if (this._bound) return;
    this._bound = true;

    const btnTheme = $('#btn-theme');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => this.toggleTheme());
    }
    const btnThemePicker = $('#btn-theme-picker');
    if (btnThemePicker) {
      btnThemePicker.addEventListener('click', () => this.showThemePicker());
    }
    const btnHelp = $('#btn-help');
    if (btnHelp) btnHelp.addEventListener('click', () => this.showShortcuts());
    const btnAddVolume = $('#btn-add-volume');
    if (btnAddVolume) btnAddVolume.addEventListener('click', () => this.createVolumeFlow());
    const btnSearch = $('#btn-search');
    if (btnSearch) btnSearch.addEventListener('click', () => openSearchModal(this));

    document.addEventListener('keydown', e => this.onKeydown(e));

    window.addEventListener('beforeunload', e => {
      if (this.state.lock) {
        e.preventDefault();
        e.returnValue = '小黑屋尚未完成，确定要离开吗？';
        return '小黑屋尚未完成，确定要离开吗？';
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.saveCurrent('hidden');
        this.persistDaily(true);
      }
    });
  }

  onKeydown(e) {
    const modalOpen = Boolean(document.querySelector('.modal-overlay'));
    if (e.key === 'Escape') {
      if (modalOpen) return;
      if (this.state.focusMode) { e.preventDefault(); this.toggleFocus(false); return; }
      if (this.state.compare.enabled) { e.preventDefault(); this.closeCompare(); return; }
      return;
    }
    if (modalOpen) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 's') {
      e.preventDefault();
      const active = this.state.activeChapter;
      if (this.state.saveState !== 'saved') this.saveCurrent('manual');
      else toast('内容已保存', 'success', 1200);
      if (e.shiftKey && active) this.snapshotChapter(active.id);
      return;
    }
    if (mod && key === 'n') {
      e.preventDefault();
      this.createChapter({});
      return;
    }
    if (mod && key === 'f') {
      e.preventDefault();
      openSearchModal(this);
      return;
    }
    if (mod && e.shiftKey && key === 'f') {
      e.preventDefault();
      this.toggleFocus(true);
      return;
    }
    if (mod && e.shiftKey && key === 't') {
      e.preventDefault();
      this.toggleTypewriter();
      return;
    }
    if (mod && key === 'p') {
      // 不拦截浏览器打印；用 Ctrl+Shift+E 打开导出
      return;
    }
    if (mod && key === 'j') {
      e.preventDefault();
      this.smartTypeset();
      return;
    }
    if (mod && e.shiftKey && key === 'e') {
      e.preventDefault();
      this.switchView('export');
      return;
    }
    if (e.altKey && /^[1-9]$/.test(e.key)) {
      const snippet = this.state.snippets[Number(e.key) - 1];
      if (snippet) {
        e.preventDefault();
        this.insertIntoEditor(snippet.content);
      }
      return;
    }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      this.navigateChapter(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.key === 'F2' && this.state.activeChapter) {
      e.preventDefault();
      this.renameChapter(this.state.activeChapter.id);
    }
  }

  /* ============================= Project ============================= */

  async loadProject(projectId, { initial = false } = {}) {
    if (!projectId) return;
    if (!initial && this.state.activeChapter && this.state.editor) {
      await this.saveCurrent('switchProject');
    }
    this.destroyEditor();
    const project = await get('projects', projectId);
    if (!project) {
      toast('作品不存在或已被删除', 'error');
      return;
    }
    this.state.project = project;
    this.state.projects = await getAll('projects');
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
    this.state.volumes = volumes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.state.chapters = chapters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));
    this.state.characters = characters.sort((a, b) =>
      (a.createdAt || 0) - (b.createdAt || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
    this.state.lore = lore.sort((a, b) =>
      String(a.category || '').localeCompare(String(b.category || ''), 'zh-CN')
      || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
    this.state.materials = materials.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    this.state.snippets = snippets.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    this.state.plotlines = plotlines.sort((a, b) =>
      (a.createdAt || 0) - (b.createdAt || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
    this.state.plotnodes = plotnodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.state.foreshadows = foreshadows.sort((a, b) =>
      (a.createdAt || 0) - (b.createdAt || 0) || String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN'));
    this.state.daily = daily.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    this.state.view = 'write';
    this.state.rightTab = 'meta';
    this.state.openTabs = [];
    this.state.compare = { enabled: false, chapterId: null };
    this.state.focusMode = false;
    this.state.unlocked = !project.password || !this.settings.lockOnOpen;
    this.state.lock = null;
    this.state.chapterFilter = '';
    this.state.selectedCharacterId = null;
    this.state.chapterId = null;
    this.state.activeChapter = null;
    this.state.currentHtml = '';
    this.state.saveState = 'saved';
    this.state.lastSavedAt = null;

    project.lastOpenedAt = Date.now();
    await put('projects', project);
    this.settings.lastProjectId = project.id;
    await setApp('settings', this.settings);

    this.restoreLock(projectId);

    let chapterId = null;
    if (this.state.lock) {
      chapterId = this.state.lock.chapterId;
    } else {
      try {
        chapterId = localStorage.getItem(`novie:lastChapter:${projectId}`);
      } catch { /* ignore */ }
      if (!this.state.chapters.some(c => c.id === chapterId)) chapterId = null;
    }
    if (!chapterId) {
      const ordered = this.orderedChapters();
      chapterId = ordered[0]?.id || null;
    }
    if (chapterId) {
      const chapter = this.state.chapters.find(c => c.id === chapterId);
      const html = await getChapterContent(chapterId);
      this.state.chapterId = chapterId;
      this.state.activeChapter = chapter;
      this.state.currentHtml = html;
      this.state.openTabs = [chapterId];
      this.state.session.lastCount = this.chapterWordCount(chapter);
    }
    this.applySettings();
    this.renderAll();
    if (!this.state.unlocked) this.showLockScreen();
    this.updateDocumentTitle();
    if (this.state.lock) {
      setTimeout(() => this.updateLockUI(), 100);
    }
  }

  async openProject(id) {
    if (id === this.state.project?.id) return;
    if (this.state.lock) {
      toast('小黑屋进行中，无法切换作品', 'warn');
      return;
    }
    this.closeLockScreen();
    await this.loadProject(id);
    toast(`已打开《${this.state.project?.name || ''}》`, 'success', 1600);
  }

  async updateProject(patch) {
    if (!this.state.project) return;
    const updated = { ...this.state.project, ...patch, updatedAt: Date.now() };
    await put('projects', updated);
    this.state.project = updated;
    this.state.projects = this.state.projects.map(p => p.id === updated.id ? updated : p);
    this.renderSidebar();
    this.renderTopbar();
    this.renderGoalCard();
    this.updateDocumentTitle();
  }

  updateDocumentTitle() {
    const p = this.state.project;
    const ch = this.state.activeChapter;
    document.title = p ? `${ch ? ch.title + ' · ' : ''}${p.name} — Novie` : 'Novie · 本地码字工坊';
  }

  async createProjectData({ name, author = '', dailyGoal = 3000, description = '' }, { silent = false } = {}) {
    const projectId = uid('prj');
    const now = Date.now();
    const project = {
      id: projectId,
      name: name || '未命名作品',
      author,
      description,
      dailyGoal: Number(dailyGoal) || 0,
      totalGoal: 0,
      color: '#8a5a3b',
      password: null,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    const volume = { id: uid('vol'), projectId, title: '第一卷', order: 0 };
    const chapter = {
      id: uid('ch'), projectId, volumeId: volume.id,
      title: '第一章', order: 0, summary: '', status: 'writing',
      targetWords: 0, tags: [], plotlineIds: [], wordCount: 0, wordCountNoPunct: 0,
      mentions: [], createdAt: now, updatedAt: now,
    };
    await put('projects', project);
    await put('volumes', volume);
    await put('chapters', chapter);
    await put('contents', { id: chapter.id, html: '', updatedAt: now });
    if (!silent) this.state.projects = await getAll('projects');
    return project;
  }

  async createProjectFlow() {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    const name = el('input', { class: 'input', placeholder: '例如：归墟灯录' });
    const author = el('input', { class: 'input', placeholder: '笔名（可留空）' });
    const goal = el('input', { class: 'input', type: 'number', min: 0, step: 500, value: 3000 });
    const body = el('div', { class: 'form-stack' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '书名' }), name]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '作者' }), author]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '每日码字目标（字）' }), goal]),
      el('p', { class: 'muted small', text: '新作品默认创建第一卷和第一章，数据只保存在本机。' }),
    ]);
    const modal = showModal({
      title: '新建作品',
      body,
      width: 480,
      actions: [
        { label: '取消', ghost: true },
        {
          label: '创建', primary: true,
          onClick: async () => {
            const n = name.value.trim();
            if (!n) { name.focus(); name.classList.add('shake'); setTimeout(() => name.classList.remove('shake'), 400); return false; }
            const project = await this.createProjectData({
              name: n,
              author: author.value.trim(),
              dailyGoal: Math.max(0, Number(goal.value) || 0),
            });
            this.state.projects = await getAll('projects');
            modal.close();
            await this.loadProject(project.id);
            toast(`《${n}》已创建`, 'success');
          },
        },
      ],
    });
  }

  async deleteProject(id) {
    if (this.state.lock && id === this.state.project?.id) {
      toast('小黑屋进行中，无法删除当前作品', 'warn');
      return;
    }
    const wasCurrent = id === this.state.project?.id;
    const name = this.state.projects.find(p => p.id === id)?.name || '该作品';
    await deleteProjectDeep(id);
    this.state.projects = await getAll('projects');
    if (wasCurrent) {
      this.destroyEditor();
      this.closeLockScreen();
      const next = this.state.projects[0];
      if (next) {
        await this.loadProject(next.id);
      } else {
        const blank = await this.createProjectData({ name: '未命名作品', author: '' });
        this.state.projects = await getAll('projects');
        await this.loadProject(blank.id);
      }
    }
    toast(`《${name}》已删除`, 'info');
  }

  /* ============================= Import / Export helpers ============================= */

  async askPassword(title = '输入密码', subtitle = '', confirmLabel = '确定') {
    return new Promise(resolve => {
      let settled = false;
      const finish = v => { if (!settled) { settled = true; resolve(v); } };
      const input = el('input', { class: 'input', type: 'password', placeholder: '密码' });
      const body = el('div', { class: 'form-stack' }, [
        subtitle ? el('p', { class: 'muted small', text: subtitle }) : null,
        input,
      ]);
      const modal = showModal({
        title, body, width: 420,
        actions: [
          { label: '取消', ghost: true, onClick: () => finish(null) },
          {
            label: confirmLabel, primary: true,
            onClick: () => {
              if (!input.value) { input.focus(); return false; }
              finish(input.value);
            },
          },
        ],
        onClose: () => finish(null),
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); modal.buttons[1].click(); }
      });
    });
  }

  async parseBundleBytes(bytes) {
    if (isEncryptedBackup(bytes)) {
      const password = await this.askPassword('解密备份', '这是一份加密备份，请输入导出时设置的密码。', '解密');
      if (password === null) return null;
      return decryptBackup(bytes, password);
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(text);
  }

  async importProjectFlow() {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    const file = await openFile({
      accept: '.novie,.noviebak,.json,application/json',
      filters: [{ name: 'Novie 工程 / 加密备份', extensions: ['novie', 'noviebak', 'json'] }],
    });
    if (!file) return;
    try {
      const bundle = await this.parseBundleBytes(file.bytes);
      if (!bundle) return;
      if (!bundle.project) throw new Error('文件不是 Novie 工程备份');
      const project = await importProjectBundle(bundle, { nameSuffix: '（导入）' });
      this.state.projects = await getAll('projects');
      await this.loadProject(project.id);
      toast(`已导入《${project.name}》`, 'success', 3000);
    } catch (err) {
      console.error(err);
      toast(`导入失败：${err.message || err}`, 'error', 4200);
    }
  }

  async exportCurrentChapterTxt(chapterId) {
    const chapter = this.state.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    let html;
    if (chapterId === this.state.chapterId && this.state.editor) {
      html = this.state.editor.getHtml();
    } else {
      html = await getChapterContent(chapterId);
    }
    const volume = this.state.volumes.find(v => v.id === chapter.volumeId);
    const { bytes, missing } = buildTxt({
      title: this.state.project.name,
      author: this.state.project.author,
      items: [{ volumeTitle: volume?.title, chapterTitle: chapter.title, html }],
    });
    await saveText(new TextDecoder().decode(bytes), `${safeFileName(this.state.project.name)}-${safeFileName(chapter.title)}.txt`, {
      filters: [{ name: '文本文件', extensions: ['txt'] }],
    });
    if (missing?.length) toast(`${missing.length} 个字符无法用当前编码保存`, 'warn');
  }

  async importTextFlow() {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    if (!this.state.project) return;
    const file = await openFile({
      accept: '.txt,.md,text/plain,text/markdown',
      filters: [{ name: '文本文件', extensions: ['txt', 'md'] }],
    });
    if (!file) return;
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    } catch {
      try {
        text = new TextDecoder('gbk').decode(file.bytes);
      } catch {
        toast('无法识别文件编码，请另存为 UTF-8 后重试', 'error');
        return;
      }
    }
    text = text.replace(/^\uFEFF/, '');
    let chapters = splitPlainText(text);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    if (!chapters || !chapters.length) {
      chapters = [{ title: baseName || '导入章节', content: text.trim() }];
    }
    if (!chapters.length) { toast('文件是空的', 'warn'); return; }
    const total = chapters.reduce((n, c) => n + countChars(c.content), 0);
    const list = el('div', { class: 'import-preview' });
    chapters.slice(0, 200).forEach(c => {
      list.appendChild(el('div', { class: 'import-row' }, [
        el('span', { class: 'import-title', text: c.title }),
        el('span', { class: 'muted small', text: `${fmtNumber(countChars(c.content))} 字` }),
      ]));
    });
    if (chapters.length > 200) list.appendChild(el('p', { class: 'muted small', text: `……共 ${chapters.length} 章` }));
    const body = el('div', { class: 'form-stack' }, [
      el('p', { text: `识别到 ${chapters.length} 章，共 ${fmtNumber(total)} 字。将导入当前作品《${this.state.project.name}》，导入后可在目录中整理。` }),
      list,
    ]);
    const modal = showModal({
      title: `导入文本：${baseName}`,
      subtitle: '文件名中的章节标题会被识别为章节；未识别到标题时整体作为一章。',
      body,
      width: 640,
      actions: [
        { label: '取消', ghost: true },
        {
          label: '导入', primary: true,
          onClick: async () => {
            await this.saveCurrent('import');
            const volumeId = uid('vol');
            const baseOrder = this.state.volumes.length;
            const now = Date.now();
            await put('volumes', {
              id: volumeId, projectId: this.state.project.id,
              title: `导入 · ${baseName}`, order: baseOrder,
            });
            let order = 0;
            let firstChapterId = null;
            for (const c of chapters) {
              const id = uid('ch');
              if (!firstChapterId) firstChapterId = id;
              const html = plainTextToHtml(c.content);
              const chars = countChars(c.content);
              await put('chapters', {
                id, projectId: this.state.project.id, volumeId,
                title: c.title, order: order++, summary: '', status: 'todo',
                targetWords: 0, tags: ['导入'], plotlineIds: [],
                wordCount: chars, wordCountNoPunct: countChars(c.content, true),
                mentions: [], createdAt: now, updatedAt: now,
              });
              await put('contents', { id, html, updatedAt: now });
            }
            modal.close();
            await this.reloadProjectData();
            if (firstChapterId) await this.openChapter(firstChapterId);
            toast(`已导入 ${chapters.length} 章`, 'success', 3000);
          },
        },
      ],
    });
  }

  /* ============================= Views / rendering ============================= */

  async switchView(view) {
    if (this.state.lock && view !== 'write') {
      toast('小黑屋进行中，完成目标后才能离开', 'warn', 2600);
      return;
    }
    if (!this.state.project) return;
    if (this.state.view === view) return;
    await this.saveCurrent('switchView');
    this.destroyEditor();
    this.state.view = view;
    this.state.focusMode = false;
    this.state.compare.enabled = false;
    this.renderAll();
    $('#view-host')?.scrollTo({ top: 0 });
  }

  renderAll() {
    this.applyClasses();
    this.renderTopbar();
    this.renderMain();
    this.renderSidebar();
    this.renderInspector();
    this.renderStatusbar();
    this.renderGoalCard();
    this.updateLockUI();
    this.updateDocumentTitle();
  }

  applyClasses() {
    const appEl = $('#app');
    const s = this.state;
    appEl.classList.toggle('in-write', s.view === 'write');
    appEl.classList.toggle('inspector-open', s.view === 'write' && s.inspectorOpen);
    appEl.classList.toggle('focus-mode', s.focusMode && s.view === 'write');
    appEl.classList.toggle('locked', Boolean(s.lock));
    appEl.classList.toggle('no-project', !s.project);
  }

  renderTopbar() {
    const host = $('#topbar');
    if (!host) return;
    host.innerHTML = '';
    if (this.state.view === 'write') {
      host.appendChild(renderWriteTopbar(this));
    } else {
      const meta = VIEW_META[this.state.view] || { label: '', icon: 'file' };
      const wrap = el('div', { class: 'topbar-inner' }, [
        el('div', { class: 'breadcrumb' }, [
          el('span', { class: 'crumb-project', text: this.state.project?.name || '' }),
          el('span', { class: 'crumb-sep', html: icon('chevronRight', 13) }),
          el('span', { class: 'crumb-current', html: `${icon(meta.icon, 14)}<span>${meta.label}</span>` }),
        ]),
        el('div', { class: 'topbar-actions' }, [
          makeIconButton('search', '全文搜索 (Ctrl+F)', () => openSearchModal(this)),
          makeIconButton('palette', '选择主题', () => this.showThemePicker()),
          makeIconButton(this.settings.theme === 'dark' ? 'sun' : 'moon',
            this.settings.theme === 'dark' ? '切换到亮色模式' : '切换到夜间模式',
            () => this.toggleTheme()),
          makeIconButton('arrowLeft', '返回写作', () => this.switchView('write')),
        ]),
      ]);
      host.appendChild(wrap);
    }
  }

  renderMain() {
    const host = $('#view-host');
    if (!host) return;
    this.destroyEditor();
    host.innerHTML = '';
    if (this.state.view === 'write') {
      host.appendChild(renderWriteView(this));
    } else {
      const node = renderView(this);
      if (node) host.appendChild(node);
    }
  }

  renderSidebar() {
    renderSidebar(this);
  }

  renderInspector() {
    const host = $('#inspector');
    if (!host) return;
    host.innerHTML = '';
    if (this.state.view === 'write' && this.state.activeChapter) {
      host.appendChild(renderInspector(this));
    }
  }

  renderTabs() {
    renderTabs(this);
  }

  renderStatusbar() {
    const host = $('#statusbar');
    if (!host) return;
    host.innerHTML = '';
    host.appendChild(renderStatusbar(this));
  }

  renderGoalCard() {
    renderGoalCard(this);
  }

  renderTopbarAndStatus() {
    this.renderTopbar();
    this.renderStatusbar();
  }

  refreshCurrentView() {
    if (this.state.view === 'write') {
      this.renderTopbar();
      this.renderSidebar();
      this.renderTabs();
      this.renderInspector();
      this.renderStatusbar();
      this.renderGoalCard();
    } else {
      this.renderMain();
      this.renderTopbar();
      this.renderSidebar();
      this.renderStatusbar();
    }
  }

  /* ============================= Chapter lifecycle ============================= */

  destroyEditor() {
    if (this.state.editor) {
      try { this.state.editor.destroy(); } catch { /* ignore */ }
      this.state.editor = null;
    }
  }

  async afterEditorInit(editor) {
    this.state.editor = editor;
    editor.setTypewriter(this.state.typewriter);
    const counts = editor.getCounts();
    this.state.session.lastCount = counts.chars;
    this.state.saveState = 'saved';
    this.state.lastSavedAt = this.state.activeChapter?.updatedAt || Date.now();
    this.tryRestoreCushion();
    if (this.state.pendingSelect) {
      const { query, occurrence, caseSensitive } = this.state.pendingSelect;
      this.state.pendingSelect = null;
      setTimeout(() => {
        const ok = editor.selectText(query, occurrence || 0, Boolean(caseSensitive));
        if (!ok) toast('本章未找到该文本', 'warn', 1800);
      }, 60);
    }
    this.renderStatusbar();
    this.updateLockText();
  }

  async openChapter(id, { skipSave = false } = {}) {
    if (this.state.lock && this.state.chapterId && id !== this.state.chapterId) {
      toast('小黑屋进行中，无法切换章节', 'warn');
      return;
    }
    const chapter = this.state.chapters.find(c => c.id === id);
    if (!chapter) return;
    if (id === this.state.chapterId && this.state.view === 'write' && this.state.editor) {
      this.state.editor.focus();
      return;
    }
    if (!skipSave) await this.saveCurrent('switchChapter');
    const html = await getChapterContent(id);
    this.destroyEditor();
    this.state.chapterId = id;
    this.state.activeChapter = chapter;
    this.state.currentHtml = html;
    this.state.session.lastCount = this.chapterWordCount(chapter);
    this.state.view = 'write';
    this.state.focusMode = false;
    if (!this.state.openTabs.includes(id)) {
      this.state.openTabs.push(id);
      if (this.state.openTabs.length > 8) this.state.openTabs.shift();
    }
    try { localStorage.setItem(`novie:lastChapter:${this.state.project.id}`, id); } catch { /* ignore */ }
    this.renderAll();
    this.state.focusEditorPending = true;
    setTimeout(() => {
      if (this.state.focusEditorPending && this.state.editor) {
        this.state.focusEditorPending = false;
        this.state.editor.focus();
      }
      $('#editor-scroll')?.scrollTo({ top: 0 });
    }, 20);
  }

  async closeTab(id) {
    const tabs = this.state.openTabs;
    const index = tabs.indexOf(id);
    if (index < 0) return;
    if (id === this.state.chapterId) {
      await this.saveCurrent('switchChapter');
      const remaining = tabs.filter(t => t !== id);
      const nextId = remaining[index] || remaining[index - 1] || this.nextChapterId(id) || this.prevChapterId(id);
      tabs.splice(index, 1);
      if (nextId) {
        await this.openChapter(nextId, { skipSave: true });
      } else {
        this.state.chapterId = null;
        this.state.activeChapter = null;
        this.state.currentHtml = '';
        this.state.openTabs = [];
        this.state.editor?.destroy();
        this.state.editor = null;
        this.renderAll();
      }
    } else {
      tabs.splice(index, 1);
      this.renderTabs();
    }
  }

  navigateChapter(delta) {
    if (!this.state.chapterId) return;
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    const ordered = this.orderedChapters();
    const idx = ordered.findIndex(c => c.id === this.state.chapterId);
    const next = ordered[idx + delta];
    if (next) this.openChapter(next.id);
    else toast(delta > 0 ? '已经是最后一章' : '已经是第一章', 'info', 1400);
  }

  nextChapterId(id) {
    const ordered = this.orderedChapters();
    const idx = ordered.findIndex(c => c.id === id);
    return ordered[idx + 1]?.id || null;
  }

  prevChapterId(id) {
    const ordered = this.orderedChapters();
    const idx = ordered.findIndex(c => c.id === id);
    return idx > 0 ? ordered[idx - 1].id : null;
  }

  orderedChapters() {
    const vols = [...this.state.volumes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const out = [];
    for (const v of vols) {
      this.state.chapters
        .filter(c => c.volumeId === v.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .forEach(c => out.push({ ...c, volumeTitle: v.title }));
    }
    // 兜底：不属于任何卷的章节
    for (const c of this.state.chapters) {
      if (!out.some(x => x.id === c.id)) out.push({ ...c, volumeTitle: '' });
    }
    return out;
  }

  async createChapter({ volumeId = null, title = null, content = '' } = {}) {
    if (this.state.lock) { toast('小黑屋进行中，无法新建章节', 'warn'); return null; }
    if (!this.state.project) return null;
    await this.saveCurrent('switchChapter');
    let targetVolumeId = volumeId;
    if (!targetVolumeId) targetVolumeId = this.state.activeChapter?.volumeId || this.state.volumes[0]?.id;
    if (!targetVolumeId) {
      const v = { id: uid('vol'), projectId: this.state.project.id, title: '第一卷', order: 0 };
      await put('volumes', v);
      this.state.volumes.push(v);
      targetVolumeId = v.id;
    }
    const siblings = this.state.chapters.filter(c => c.volumeId === targetVolumeId);
    const order = siblings.length ? Math.max(...siblings.map(c => c.order ?? 0)) + 1 : 0;
    const now = Date.now();
    const chapter = {
      id: uid('ch'),
      projectId: this.state.project.id,
      volumeId: targetVolumeId,
      title: title || `第 ${this.state.chapters.length + 1} 章`,
      order,
      summary: '',
      status: 'writing',
      targetWords: 0,
      tags: [],
      plotlineIds: [],
      wordCount: 0,
      wordCountNoPunct: 0,
      mentions: [],
      createdAt: now,
      updatedAt: now,
    };
    await put('chapters', chapter);
    await put('contents', { id: chapter.id, html: content, updatedAt: now });
    this.state.chapters.push(chapter);
    this.state.chapters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    await this.openChapter(chapter.id, { skipSave: true });
    toast('新章节已创建，双击目录标题可重命名', 'success', 2400);
    return chapter;
  }

  async createVolumeFlow() {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    const title = await promptDialog({
      title: '新建卷',
      label: '卷名',
      value: `第 ${this.state.volumes.length + 1} 卷`,
      okLabel: '创建',
    });
    if (!title) return;
    const volume = {
      id: uid('vol'), projectId: this.state.project.id,
      title, order: this.state.volumes.length,
    };
    await put('volumes', volume);
    this.state.volumes.push(volume);
    this.state.volumes.sort((a, b) => a.order - b.order);
    this.renderSidebar();
    if (this.state.view === 'outline') this.renderMain();
    toast('已新建卷', 'success');
  }

  async renameVolume(id) {
    const volume = this.state.volumes.find(v => v.id === id);
    if (!volume) return;
    const title = await promptDialog({ title: '重命名卷', label: '卷名', value: volume.title, okLabel: '保存' });
    if (!title) return;
    volume.title = title;
    await put('volumes', volume);
    this.renderSidebar();
    if (this.state.view === 'outline') this.renderMain();
  }

  async deleteVolumeConfirm(id) {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    const volume = this.state.volumes.find(v => v.id === id);
    if (!volume) return;
    const chapters = this.state.chapters.filter(c => c.volumeId === id);
    if (this.state.volumes.length <= 1) {
      toast('至少保留一卷；可直接删除章节', 'warn', 2600);
      return;
    }
    const ok = await confirmDialog(
      `删除《${volume.title}》将同时删除其中的 ${chapters.length} 个章节及历史快照，且不可恢复。建议先导出备份。`,
      { title: '删除卷', danger: true, okLabel: '删除整卷' }
    );
    if (!ok) return;
    for (const c of chapters) {
      this.state.chapters = this.state.chapters.filter(x => x.id !== c.id);
      this.state.openTabs = this.state.openTabs.filter(t => t !== c.id);
      await deleteChapterDeep(c.id);
    }
    await del('volumes', id);
    this.state.volumes = this.state.volumes.filter(v => v.id !== id);
    if (chapters.some(c => c.id === this.state.chapterId)) {
      this.state.chapterId = null;
      this.state.activeChapter = null;
      const next = this.orderedChapters()[0];
      if (next) await this.openChapter(next.id, { skipSave: true });
      else this.renderAll();
    } else {
      this.refreshCurrentView();
    }
    toast('卷已删除', 'info');
  }

  async renameChapter(id) {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    const chapter = this.state.chapters.find(c => c.id === id);
    if (!chapter) return;
    const title = await promptDialog({ title: '重命名章节', label: '章节标题', value: chapter.title, okLabel: '保存' });
    if (!title) return;
    await this.updateChapterMeta(id, { title });
  }

  async updateChapterMeta(id, patch) {
    const chapter = this.state.chapters.find(c => c.id === id);
    if (!chapter) return;
    const updated = { ...chapter };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) updated[key] = value;
    }
    if (typeof updated.tags === 'string') updated.tags = parseTags(updated.tags);
    updated.updatedAt = Date.now();
    await put('chapters', updated);
    this.state.chapters = this.state.chapters.map(c => c.id === id ? updated : c);
    if (this.state.chapterId === id) this.state.activeChapter = updated;
    this.renderSidebar();
    this.renderTabs();
    this.renderTopbar();
    if (this.state.view !== 'write') this.renderMain();
    else if (this.state.rightTab === 'meta') this.renderInspector();
    this.updateDocumentTitle();
  }

  async duplicateChapter(id) {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    const chapter = this.state.chapters.find(c => c.id === id);
    if (!chapter) return;
    await this.saveCurrent('duplicate');
    const html = id === this.state.chapterId && this.state.editor
      ? this.state.editor.getHtml()
      : await getChapterContent(id);
    const counts = countChars(htmlToText(html), false);
    const now = Date.now();
    const copy = {
      ...chapter,
      id: uid('ch'),
      title: `${chapter.title}（副本）`,
      order: (chapter.order ?? 0) + 0.5,
      wordCount: counts,
      wordCountNoPunct: countChars(htmlToText(html), true),
      createdAt: now,
      updatedAt: now,
    };
    delete copy.volumeTitle;
    await put('chapters', copy);
    await put('contents', { id: copy.id, html, updatedAt: now });
    // 规范化顺序
    const siblings = this.state.chapters
      .filter(c => c.volumeId === copy.volumeId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    siblings.push(copy);
    for (let i = 0; i < siblings.length; i++) {
      const c = siblings[i];
      if (c.order !== i) {
        c.order = i;
        await put('chapters', c);
      }
    }
    this.state.chapters.push(copy);
    this.state.chapters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.renderSidebar();
    if (this.state.view === 'outline') this.renderMain();
    toast('章节已复制', 'success');
  }

  async deleteChapterConfirm(id) {
    if (this.state.lock) { toast('小黑屋进行中，无法删除章节', 'warn'); return; }
    const chapter = this.state.chapters.find(c => c.id === id);
    if (!chapter) return;
    const ok = await confirmDialog(`确定删除「${chapter.title}」吗？该章正文与历史快照都会被删除，且不可恢复。`, {
      title: '删除章节', danger: true, okLabel: '删除',
    });
    if (!ok) return;
    const wasActive = id === this.state.chapterId;
    const ordered = this.orderedChapters();
    const idx = ordered.findIndex(c => c.id === id);
    const fallback = ordered[idx + 1]?.id || ordered[idx - 1]?.id || null;
    this.state.chapters = this.state.chapters.filter(c => c.id !== id);
    this.state.openTabs = this.state.openTabs.filter(t => t !== id);
    if (wasActive) {
      this.destroyEditor();
      this.state.chapterId = null;
      this.state.activeChapter = null;
      this.state.currentHtml = '';
    }
    await deleteChapterDeep(id);
    if (wasActive) {
      if (fallback) await this.openChapter(fallback, { skipSave: true });
      else this.renderAll();
    } else {
      this.refreshCurrentView();
    }
    toast('章节已删除', 'info');
  }

  async moveChapter(id, targetVolumeId, targetIndex) {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    const chapter = this.state.chapters.find(c => c.id === id);
    if (!chapter) return;
    const oldVolumeId = chapter.volumeId;
    const target = this.state.chapters
      .filter(c => c.volumeId === targetVolumeId && c.id !== id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const index = clamp(Number(targetIndex) || 0, 0, target.length);
    target.splice(index, 0, chapter);
    chapter.volumeId = targetVolumeId;
    const updates = [];
    target.forEach((c, i) => {
      if (c.order !== i) { c.order = i; updates.push(c); }
      else if (c.id === id) { c.order = i; updates.push(c); }
    });
    if (oldVolumeId !== targetVolumeId) {
      chapter.volumeId = targetVolumeId;
      if (!updates.includes(chapter)) updates.push(chapter);
      const old = this.state.chapters
        .filter(c => c.volumeId === oldVolumeId && c.id !== id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      old.forEach((c, i) => {
        if (c.order !== i) { c.order = i; updates.push(c); }
      });
    }
    for (const c of updates) await put('chapters', c);
    this.state.chapters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.renderSidebar();
    this.renderTopbar();
    if (this.state.view === 'outline') this.renderMain();
  }

  async splitChapterAtCaret(id) {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    if (id !== this.state.chapterId || this.state.view !== 'write' || !this.state.editor) {
      toast('请先打开本章，并把光标放在要拆分的位置', 'warn', 3000);
      return;
    }
    const chapter = this.state.activeChapter;
    // 拆章是内容搬移：suppress 今日计数，避免后半章被当成“删除”
    this.state.session.suppressTodayDelta = true;
    let parts;
    try {
      parts = this.state.editor.splitAtCaret();
    } finally {
      this.state.session.suppressTodayDelta = false;
    }
    if (!parts || !parts.after.trim()) {
      toast('光标之后没有内容，无法拆分', 'warn');
      return;
    }
    await this.createSnapshot(chapter.id, { label: '拆分前快照', silent: true });
    const countsBefore = this.state.editor.getCounts();
    const beforeChapter = {
      ...chapter,
      wordCount: countsBefore.chars,
      wordCountNoPunct: countsBefore.charsNoPunct,
      updatedAt: Date.now(),
    };
    await saveChapterContent(chapter.id, parts.before);
    await put('chapters', beforeChapter);
    this.replaceChapter(beforeChapter);
    this.state.activeChapter = beforeChapter;
    const siblings = this.state.chapters.filter(c => c.volumeId === chapter.volumeId);
    const newChapter = {
      id: uid('ch'),
      projectId: chapter.projectId,
      volumeId: chapter.volumeId,
      title: `${chapter.title} · 续`,
      order: (chapter.order ?? 0) + 0.5,
      summary: '',
      status: 'writing',
      targetWords: chapter.targetWords || 0,
      tags: [],
      plotlineIds: chapter.plotlineIds || [],
      wordCount: countChars(htmlToText(parts.after), false),
      wordCountNoPunct: countChars(htmlToText(parts.after), true),
      mentions: this.computeMentions(parts.after),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await put('chapters', newChapter);
    await put('contents', { id: newChapter.id, html: parts.after, updatedAt: Date.now() });
    this.state.chapters.push(newChapter);
    const ordered = this.state.chapters
      .filter(c => c.volumeId === chapter.volumeId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].order !== i) {
        ordered[i].order = i;
        await put('chapters', ordered[i]);
      }
    }
    this.state.chapters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.state.session.lastCount = countsBefore.chars;
    this.renderSidebar();
    this.renderTabs();
    this.renderStatusbar();
    this.renderInspector();
    toast(`已拆分为「${chapter.title}」和「${newChapter.title}」`, 'success', 3000);
  }

  async mergeChapterWithNext(id) {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    const chapter = this.state.chapters.find(c => c.id === id);
    if (!chapter) return;
    await this.saveCurrent('merge');
    const ordered = this.orderedChapters();
    const current = ordered.find(c => c.id === id);
    const next = ordered[ordered.findIndex(c => c.id === id) + 1];
    if (!next || next.volumeId !== chapter.volumeId) {
      toast('本章没有同一卷内的下一章可合并', 'warn');
      return;
    }
    const ok = await confirmDialog(
      `将「${next.title}」的全部正文追加到「${chapter.title}」末尾，并删除下一章。是否继续？`,
      { title: '合并章节', okLabel: '合并' }
    );
    if (!ok) return;
    const htmlA = id === this.state.chapterId && this.state.editor
      ? this.state.editor.getHtml()
      : await getChapterContent(id);
    const htmlB = await getChapterContent(next.id);
    const merged = `${htmlA}${htmlA ? '<hr>' : ''}${htmlB}`;
    const counts = { chars: countChars(htmlToText(merged), false), charsNoPunct: countChars(htmlToText(merged), true) };
    const updated = {
      ...chapter,
      wordCount: counts.chars,
      wordCountNoPunct: counts.charsNoPunct,
      mentions: this.computeMentions(merged),
      updatedAt: Date.now(),
    };
    await this.createSnapshot(chapter.id, { label: '合并前快照', silent: true });
    await saveChapterContent(chapter.id, merged);
    await put('chapters', updated);
    this.replaceChapter(updated);
    this.state.chapters = this.state.chapters.filter(c => c.id !== next.id);
    this.state.openTabs = this.state.openTabs.filter(t => t !== next.id);
    await deleteChapterDeep(next.id);
    if (this.state.chapterId === chapter.id) {
      this.state.activeChapter = updated;
      if (this.state.editor) {
        this.state.editor.setContent(merged);
        this.state.session.lastCount = this.state.editor.getCounts().chars;
      }
    }
    this.state.chapters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.renderSidebar();
    this.renderTabs();
    this.renderInspector();
    this.renderStatusbar();
    if (this.state.view !== 'write') this.renderMain();
    toast(`已合并「${next.title}」`, 'success');
  }

  /* ============================= Save / stats ============================= */

  chapterWordCount(chapter) {
    if (!chapter) return 0;
    return this.settings.countNoPunct ? (chapter.wordCountNoPunct || 0) : (chapter.wordCount || 0);
  }

  projectWordCount() {
    return this.state.chapters.reduce((n, c) => n + this.chapterWordCount(c), 0);
  }

  getTodayRecord() {
    const key = todayKey();
    let record = this.state.daily.find(d => d.date === key);
    if (!record) {
      record = {
        id: `${this.state.project.id}|${key}`,
        projectId: this.state.project.id,
        date: key,
        words: 0,
        seconds: 0,
      };
      this.state.daily.push(record);
    }
    return record;
  }

  streak() {
    const written = new Set(this.state.daily.filter(d => d.words > 0).map(d => d.date));
    let cursor = new Date();
    if (!written.has(dateKey(cursor))) cursor = addDays(cursor, -1);
    let count = 0;
    while (written.has(dateKey(cursor))) {
      count++;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  speed() {
    const record = this.getTodayRecord();
    if (!record || record.seconds < 30) return 0;
    return Math.round((record.words / record.seconds) * 3600);
  }

  addTodayWords(n) {
    if (!this.state.project) return;
    const record = this.getTodayRecord();
    // 净变化计数：删除会回落，但今日累计不会低于 0（不会吃掉往日统计）
    record.words = Math.max(0, record.words + n);
    this.scheduleDailySave();
    const goal = this.state.project.dailyGoal || 0;
    if (goal > 0 && record.words >= goal && this.state.goalHitDate !== record.date) {
      this.state.goalHitDate = record.date;
      toast(`今日目标达成：${fmtNumber(record.words)} / ${fmtNumber(goal)} 字`, 'success', 3800);
    }
  }

  addTodaySeconds(seconds) {
    if (!this.state.project) return;
    const record = this.getTodayRecord();
    record.seconds += seconds;
    this.scheduleDailySave();
  }

  scheduleDailySave() {
    clearTimeout(this.state.session.dailyTimer);
    this.state.session.dailyTimer = setTimeout(() => this.persistDaily(), 4000);
  }

  async persistDaily(force = false) {
    if (!this.state.project) return;
    clearTimeout(this.state.session.dailyTimer);
    const record = this.getTodayRecord();
    if (!record) return;
    if (!force && !record.words && !record.seconds) return;
    try { await put('daily', record); } catch (err) { console.warn('保存统计失败', err); }
  }

  handleEditorChange(counts) {
    if (!this.state.activeChapter) return;
    const session = this.state.session;
    const delta = counts.chars - session.lastCount;
    // 净变化入账：输入为正、删除为负；suppressTodayDelta 用于拆章/排版等
    // 结构性操作——内容是搬移或格式调整，不该计入今日码字数
    if (delta !== 0 && !session.suppressTodayDelta) this.addTodayWords(delta);
    session.lastCount = counts.chars;
    session.lastInputAt = Date.now();
    session.editRevision++;
    this.state.saveState = 'dirty';
    this.updateLiveCounts(counts);
    clearTimeout(session.saveTimer);
    session.saveTimer = setTimeout(() => this.saveCurrent('auto'), 900);
    this.scheduleCushion(counts);
    this.checkLockProgress();
    this.renderStatusLive();
  }

  scheduleCushion(counts) {
    clearTimeout(this.state.session.cushionTimer);
    this.state.session.cushionTimer = setTimeout(() => {
      if (!this.state.editor || !this.state.activeChapter) return;
      try {
        const html = this.state.editor.getHtml();
        if (html.length > 3_000_000) return;
        localStorage.setItem('novie:cushion', JSON.stringify({
          projectId: this.state.project.id,
          chapterId: this.state.activeChapter.id,
          html,
          ts: Date.now(),
        }));
      } catch (err) {
        console.warn('缓冲写入失败', err);
      }
    }, 1200);
  }

  tryRestoreCushion() {
    try {
      const raw = localStorage.getItem('novie:cushion');
      if (!raw) return;
      const cushion = JSON.parse(raw);
      const chapter = this.state.activeChapter;
      if (!chapter || !this.state.editor) return;
      if (cushion.projectId !== this.state.project.id || cushion.chapterId !== chapter.id) return;
      if (!cushion.html) return;
      if (Number(cushion.ts) <= Number(chapter.updatedAt || 0) + 1000) return;
      if (cushion.html === this.state.editor.getHtml()) return;
      this.state.editor.setContent(cushion.html);
      const counts = this.state.editor.getCounts();
      this.state.session.lastCount = counts.chars;
      this.state.saveState = 'dirty';
      this.updateLiveCounts(counts);
      this.renderStatusbar();
      this.saveCurrent('recovery');
      toast('检测到上次未写入数据库的内容，已自动恢复', 'success', 4200);
    } catch (err) {
      console.warn('恢复缓冲失败', err);
    }
  }

  async saveCurrent(reason = 'auto') {
    const editor = this.state.editor;
    const chapter = this.state.activeChapter;
    if (!editor || !chapter) return this._saveChain;
    let html = '';
    let counts = { chars: 0, charsNoPunct: 0 };
    let text = '';
    try {
      html = editor.getHtml();
      counts = editor.getCounts();
      text = editor.getText();
    } catch (err) {
      console.warn('读取编辑器内容失败', err);
      return this._saveChain;
    }
    const snapshot = {
      chapter: { ...chapter },
      html,
      counts,
      text,
      reason,
    };
    this.setSaveState('saving');
    const run = async () => {
      try {
        await this.persistChapterSnapshot(snapshot);
      } catch (err) {
        console.error(err);
        this.setSaveState('error');
        toast('保存失败：' + (err.message || err), 'error', 4200);
      }
    };
    this._saveChain = this._saveChain.catch(() => {}).then(run);
    return this._saveChain;
  }

  async persistChapterSnapshot(snapshot) {
    const latest = this.state.chapters.find(c => c.id === snapshot.chapter.id);
    if (!latest) return;
    const now = Date.now();
    await saveChapterContent(latest.id, snapshot.html);
    const updated = {
      ...latest,
      wordCount: snapshot.counts.chars,
      wordCountNoPunct: snapshot.counts.charsNoPunct,
      mentions: this.computeMentionsFromText(snapshot.text),
      updatedAt: now,
    };
    await put('chapters', updated);
    this.replaceChapter(updated);
    const isActive = this.state.chapterId === updated.id;
    if (isActive) {
      this.state.activeChapter = updated;
      this.state.currentHtml = snapshot.html;
      this.state.lastSavedAt = now;
      this.setSaveState('saved');
      this.renderTabs();
      this.renderStatusbar();
      this.renderTopbar();
      this.renderSidebar();
      this.renderGoalCard();
      this.updateDocumentTitle();
    } else {
      this.renderSidebar();
    }
    this.persistDaily();
    this.logHealth('save', updated.title || '');
    if (['switchChapter', 'switchView', 'switchProject', 'merge', 'manual'].includes(snapshot.reason)) {
      await this.maybeAutoSnapshot(updated, snapshot.html, snapshot.counts);
    }
    if (snapshot.reason === 'manual') toast('已保存并记录当前进度', 'success', 1600);
  }

  /** 数据健康时间线：同类事件 1 分钟节流，最多保留 120 条，供“数据健康”面板展示。 */
  async logHealth(type, label = '') {
    try {
      const log = (await getApp('healthLog')) || [];
      const now = Date.now();
      const last = log[0];
      if (last && last.type === type && now - (last.t || 0) < 60000) return;
      log.unshift({ t: now, type, label: String(label || '').slice(0, 60) });
      if (log.length > 120) log.length = 120;
      await setApp('healthLog', log);
    } catch (err) {
      console.warn('健康日志写入失败', err);
    }
  }

  replaceChapter(chapter) {
    let found = false;
    this.state.chapters = this.state.chapters.map(c => {
      if (c.id === chapter.id) { found = true; return chapter; }
      return c;
    });
    if (!found) this.state.chapters.push(chapter);
    this.state.chapters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));
    if (this.state.chapterId === chapter.id) this.state.activeChapter = chapter;
  }

  computeMentionsFromText(text) {
    return this.computeMentions(text);
  }

  computeMentions(htmlOrText) {
    const text = htmlOrText.includes('<') ? htmlToText(htmlOrText) : htmlOrText;
    const ids = [];
    for (const character of this.state.characters) {
      const names = [character.name, ...(character.alias || '').split(/[\/，,、\s]+/)]
        .map(s => String(s || '').trim())
        .filter(s => s.length >= 2);
      if (names.some(name => text.includes(name))) ids.push(character.id);
    }
    return ids;
  }

  setSaveState(state) {
    this.state.saveState = state;
    this.renderStatusLive();
  }

  updateLiveCounts(counts) {
    const chars = this.settings.countNoPunct ? counts.charsNoPunct : counts.chars;
    const elChapter = document.getElementById('live-chapter');
    if (elChapter) elChapter.textContent = `${fmtNumber(chars)} 字`;
    const inspCount = document.getElementById('insp-word');
    if (inspCount) inspCount.textContent = fmtNumber(chars);
    const inspPunct = document.getElementById('insp-word-punct');
    if (inspPunct) inspPunct.textContent = fmtNumber(counts.charsNoPunct);
    const targetBar = document.getElementById('insp-target-bar');
    if (targetBar && this.state.activeChapter?.targetWords) {
      const pct = Math.min(100, (chars / this.state.activeChapter.targetWords) * 100);
      targetBar.style.width = `${pct}%`;
    }
    this.renderGoalCard();
    this.renderStatusLive();
  }

  renderStatusLive() {
    const record = this.state.project ? this.getTodayRecord() : null;
    const todayEl = document.getElementById('live-today');
    if (todayEl && record) todayEl.textContent = fmtNumber(record.words);
    const speedEl = document.getElementById('live-speed');
    if (speedEl) speedEl.textContent = this.speed() ? `${fmtNumber(this.speed())} 字/时` : '—';
    const saveEl = document.getElementById('live-save');
    if (saveEl) {
      const map = { saved: '已保存', saving: '保存中…', dirty: '未保存', error: '保存失败' };
      saveEl.textContent = map[this.state.saveState] || '已保存';
      saveEl.classList.toggle('dirty', this.state.saveState === 'dirty');
      saveEl.classList.toggle('error', this.state.saveState === 'error');
    }
    const savedAtEl = document.getElementById('live-saved-at');
    if (savedAtEl) {
      savedAtEl.textContent = this.state.lastSavedAt
        ? new Date(this.state.lastSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : '—';
    }
    const clockEl = document.getElementById('live-clock');
    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const sessionEl = document.getElementById('live-session');
    if (sessionEl) sessionEl.textContent = fmtClock(this.state.session.activeSeconds || 0);
    this.updateLockText();
  }

  tickSession() {
    if (!this.state.project) return;
    if (document.visibilityState !== 'visible') return;
    const session = this.state.session;
    if (session.lastInputAt && Date.now() - session.lastInputAt < 60000) {
      this.addTodaySeconds(5);
      session.activeSeconds = (session.activeSeconds || 0) + 5;
    }
    this.persistDaily();
    this.checkLockProgress();
    this.renderStatusLive();
  }

  startTimers() {
    this._timers.push(setInterval(() => this.tickSession(), 5000));
    this._timers.push(setInterval(() => this.renderStatusLive(), 1000));
    this._timers.push(setInterval(() => {
      maybeAutoBackup(this).catch(err => console.warn('自动备份失败', err));
    }, 5 * 60 * 1000));
  }

  /* ============================= Snapshots ============================= */

  async createSnapshot(chapterId, { label = '手动快照', html = null, counts = null, silent = false } = {}) {
    const chapter = this.state.chapters.find(c => c.id === chapterId);
    if (!chapter) return null;
    if (html === null) {
      if (chapterId === this.state.chapterId && this.state.editor) html = this.state.editor.getHtml();
      else html = await getChapterContent(chapterId);
    }
    if (!html && !chapter.wordCount) return null;
    if (counts === null) counts = { chars: countChars(htmlToText(html), false), charsNoPunct: countChars(htmlToText(html), true) };
    const version = {
      id: uid('ver'),
      projectId: this.state.project.id,
      chapterId,
      label,
      html,
      wordCount: counts.chars,
      createdAt: Date.now(),
    };
    await put('versions', version);
    const all = await getAllBy('versions', 'chapterId', chapterId);
    const sorted = all.sort((a, b) => b.createdAt - a.createdAt);
    for (const old of sorted.slice(20)) await del('versions', old.id);
    this.logHealth('snapshot', label);
    if (!silent) toast('已创建历史快照', 'success', 1600);
    if (this.state.chapterId === chapterId && this.state.rightTab === 'meta') this.renderInspector();
    return version;
  }

  async snapshotChapter(chapterId) {
    if (this.state.lock) { toast('小黑屋进行中', 'warn'); return; }
    await this.createSnapshot(chapterId);
    openSnapshotsModal(this, chapterId);
  }

  async maybeAutoSnapshot(chapter, html, counts) {
    try {
      const versions = await getAllBy('versions', 'chapterId', chapter.id);
      const latest = versions.sort((a, b) => b.createdAt - a.createdAt)[0];
      if (latest && Date.now() - latest.createdAt < 10 * 60 * 1000) return;
      if (!html || !counts.chars) return;
      await this.createSnapshot(chapter.id, { label: '自动快照', html, counts, silent: true });
    } catch (err) {
      console.warn('自动快照失败', err);
    }
  }

  async restoreSnapshot(version) {
    if (this.state.lock) { toast('小黑屋进行中，无法恢复历史版本', 'warn'); return; }
    const chapter = this.state.chapters.find(c => c.id === version.chapterId);
    if (!chapter) return;
    await this.saveCurrent('restore');
    await this.createSnapshot(chapter.id, { label: '恢复前快照', silent: true });
    if (this.state.chapterId !== chapter.id) {
      await this.openChapter(chapter.id, { skipSave: true });
    }
    const counts = { chars: countChars(htmlToText(version.html), false), charsNoPunct: countChars(htmlToText(version.html), true) };
    if (this.state.editor) {
      this.state.editor.setContent(version.html);
      this.state.session.lastCount = this.state.editor.getCounts().chars;
      this.state.saveState = 'dirty';
      this.updateLiveCounts(counts);
      await this.saveCurrent('restore');
    }
    toast(`已恢复到「${version.label}」的快照`, 'success', 2600);
  }

  /* ============================= Blackroom ============================= */

  isLocked() { return Boolean(this.state.lock); }

  lockStorageKey() {
    return `novie:lock:${this.state.project?.id || 'none'}`;
  }

  restoreLock(projectId) {
    try {
      const raw = localStorage.getItem(`novie:lock:${projectId}`);
      if (!raw) return;
      const lock = JSON.parse(raw);
      if (!lock || !lock.chapterId) return;
      if (!this.state.chapters.some(c => c.id === lock.chapterId)) {
        localStorage.removeItem(`novie:lock:${projectId}`);
        return;
      }
      this.state.lock = lock;
      this.state.view = 'write';
    } catch { /* ignore */ }
  }

  persistLock() {
    try {
      if (this.state.lock) localStorage.setItem(this.lockStorageKey(), JSON.stringify(this.state.lock));
      else localStorage.removeItem(this.lockStorageKey());
    } catch { /* ignore */ }
  }

  openBlackroomFlow() {
    if (this.state.lock) { this.showEmergencyExit(); return; }
    if (!this.state.activeChapter) { toast('先打开一章再开启小黑屋', 'warn'); return; }
    const words = el('input', { class: 'input', type: 'number', min: 0, step: 100, value: 1000 });
    const minutes = el('input', { class: 'input', type: 'number', min: 0, step: 5, value: 30 });
    const body = el('div', { class: 'form-stack' }, [
      el('div', { class: 'blackroom-intro' }, [
        el('div', { class: 'blackroom-icon', html: icon('lock', 26) }),
        el('div', {}, [
          el('strong', { text: '进入小黑屋' }),
          el('p', { class: 'muted small', text: '目标未完成前，章节切换、作品切换与大部分导航会被锁定。' }),
        ]),
      ]),
      el('div', { class: 'form-grid-2' }, [
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '目标字数（从此刻起）' }), words]),
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '目标时长（分钟）' }), minutes]),
      ]),
      el('p', { class: 'muted small', text: '两项都填写时必须同时达成；只填一项则以该项为准。关闭软件后重新打开，小黑屋仍会继续。若确有急事，可在锁定条中选择“紧急退出”。' }),
    ]);
    const modal = showModal({
      title: '小黑屋模式',
      subtitle: `当前章节：${this.state.activeChapter.title}`,
      body,
      width: 500,
      actions: [
        { label: '取消', ghost: true },
        {
          label: '开始锁定', primary: true, danger: true,
          onClick: async () => {
            const w = Math.max(0, Number(words.value) || 0);
            const m = Math.max(0, Number(minutes.value) || 0);
            if (!w && !m) {
              toast('请至少设置字数或时长目标', 'warn');
              return false;
            }
            await this.startBlackroom({ words: w, minutes: m });
          },
        },
      ],
    });
  }

  async startBlackroom({ words = 0, minutes = 0 }) {
    if (!this.state.activeChapter) return;
    await this.saveCurrent('blackroomStart');
    const counts = this.state.editor?.getCounts();
    const startWords = counts ? (this.settings.countNoPunct ? counts.charsNoPunct : counts.chars) : this.chapterWordCount(this.state.activeChapter);
    this.state.lock = {
      chapterId: this.state.activeChapter.id,
      chapterTitle: this.state.activeChapter.title,
      startWords,
      targetWords: Math.max(0, Number(words) || 0),
      minutes: Math.max(0, Number(minutes) || 0),
      startTs: Date.now(),
    };
    this.persistLock();
    this.renderAll();
    setTimeout(() => this.state.editor?.focus(), 80);
    toast('小黑屋已开启。写完再出来。', 'success', 3200);
  }

  lockProgress() {
    const lock = this.state.lock;
    if (!lock) return { wordsDone: 0, seconds: 0 };
    let current = 0;
    if (this.state.editor && this.state.activeChapter?.id === lock.chapterId) {
      const counts = this.state.editor.getCounts();
      current = this.settings.countNoPunct ? counts.charsNoPunct : counts.chars;
    } else if (this.state.activeChapter?.id === lock.chapterId) {
      current = this.chapterWordCount(this.state.activeChapter);
    }
    return {
      wordsDone: Math.max(0, current - lock.startWords),
      seconds: Math.floor((Date.now() - lock.startTs) / 1000),
    };
  }

  updateLockText() {
    const lock = this.state.lock;
    if (!lock) return;
    const { wordsDone, seconds } = this.lockProgress();
    const wordsEl = document.getElementById('lock-words');
    if (wordsEl) {
      wordsEl.textContent = lock.targetWords
        ? `${fmtNumber(wordsDone)} / ${fmtNumber(lock.targetWords)} 字`
        : `${fmtNumber(wordsDone)} 字`;
    }
    const timeEl = document.getElementById('lock-time');
    if (timeEl) {
      const target = lock.minutes ? lock.minutes * 60 : 0;
      const pad = n => String(n).padStart(2, '0');
      const fmt = t => `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
      timeEl.textContent = target ? `${fmt(seconds)} / ${fmt(target)}` : fmt(seconds);
    }
  }

  checkLockProgress() {
    const lock = this.state.lock;
    if (!lock) return;
    this.updateLockText();
    const { wordsDone, seconds } = this.lockProgress();
    const wordsOk = !lock.targetWords || wordsDone >= lock.targetWords;
    const timeOk = !lock.minutes || seconds >= lock.minutes * 60;
    if (wordsOk && timeOk && (lock.targetWords || lock.minutes)) {
      this.endBlackroom(false, 'complete');
    }
  }

  updateLockUI() {
    const appEl = $('#app');
    if (!appEl) return;
    appEl.classList.toggle('locked', Boolean(this.state.lock));
    if (this.state.lock) {
      const banner = document.getElementById('lock-banner');
      if (!banner && this.state.view === 'write' && this.state.activeChapter) {
        // 首次恢复锁定时写视图已带 banner；这里只兜底
        this.renderMain();
      }
      this.updateLockText();
    } else {
      document.getElementById('lock-banner')?.remove();
    }
  }

  showEmergencyExit() {
    if (!this.state.lock) return;
    const input = el('input', { class: 'input', placeholder: '我放弃本次锁定' });
    const body = el('div', { class: 'form-stack' }, [
      el('p', { text: '紧急退出会放弃本次小黑屋目标。为了确认这不是误触，请手动输入下面这句话：' }),
      el('p', { class: 'phrase', text: '我放弃本次锁定' }),
      input,
    ]);
    const modal = showModal({
      title: '紧急退出小黑屋',
      body,
      width: 440,
      actions: [
        { label: '继续坚持', primary: true, onClick: () => modal.close() },
        {
          label: '放弃并退出', danger: true, onClick: () => {
            if (input.value.trim() !== '我放弃本次锁定') {
              input.classList.add('shake');
              setTimeout(() => input.classList.remove('shake'), 400);
              return false;
            }
            this.endBlackroom(true, 'emergency');
            modal.close();
          },
        },
      ],
    });
  }

  endBlackroom(forced = false, reason = 'complete') {
    if (!this.state.lock) return;
    this.state.lock = null;
    this.persistLock();
    document.getElementById('lock-banner')?.remove();
    this.updateLockUI();
    this.renderTopbar();
    this.renderStatusbar();
    this.renderSidebar();
    if (reason === 'complete') {
      toast('目标达成，小黑屋解除。辛苦了。', 'success', 4000);
    } else {
      toast(forced ? '已紧急退出小黑屋' : '小黑屋已解除', 'info', 2400);
    }
  }

  /* ============================= Compare / focus / typewriter ============================= */

  async openCompareFlow() {
    if (!this.state.activeChapter) return;
    const ordered = this.orderedChapters().filter(c => c.id !== this.state.chapterId);
    if (!ordered.length) { toast('没有其他章节可对照', 'info'); return; }
    const select = el('select', { class: 'input' }, ordered.map(c =>
      el('option', { value: c.id, text: `${c.volumeTitle ? c.volumeTitle + ' · ' : ''}${c.title}` })
    ));
    if (this.state.compare.chapterId && ordered.some(c => c.id === this.state.compare.chapterId)) {
      select.value = this.state.compare.chapterId;
    }
    const body = el('div', { class: 'form-stack' }, [
      el('p', { class: 'muted small', text: '在编辑器右侧打开另一个章节，只读对照。适合检查前后文、伏笔和人物口吻。' }),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '对照章节' }), select]),
    ]);
    const modal = showModal({
      title: '前后文分屏对照',
      body,
      width: 480,
      actions: [
        { label: '取消', ghost: true },
        {
          label: '打开对照', primary: true, onClick: async () => {
            await this.openCompare(select.value);
            modal.close();
          },
        },
      ],
    });
  }

  async openCompare(chapterId) {
    if (!chapterId) return;
    await this.saveCurrent('compare');
    const html = await getChapterContent(chapterId);
    this.state.compare = { enabled: true, chapterId, html };
    this.state.compareChapterId = chapterId;
    this.renderMain();
    this.state.editor?.focus();
  }

  async closeCompare() {
    await this.saveCurrent('compare');
    this.state.compare = { enabled: false, chapterId: null };
    this.renderMain();
    this.state.editor?.focus();
  }

  toggleFocus(force = null) {
    const next = force === null ? !this.state.focusMode : Boolean(force);
    if (next && this.state.lock) {
      // 小黑屋下允许隐藏界面，但不能离开
    }
    this.state.focusMode = next;
    this.applyClasses();
    this.renderTopbar();
    this.renderStatusbar();
    if (next) {
      toast('已进入专注模式，按 Esc 退出', 'info', 2000);
    }
    setTimeout(() => this.state.editor?.focus(), 30);
  }

  toggleTypewriter(force = null) {
    const next = force === null ? !this.state.typewriter : Boolean(force);
    this.state.typewriter = next;
    this.settings.typewriter = next;
    setApp('settings', this.settings).catch(() => {});
    this.state.editor?.setTypewriter(next);
    this.renderStatusbar();
    this.renderTopbar();
    toast(next ? '打字机模式已开启：光标保持在屏幕中部' : '打字机模式已关闭', 'info', 1800);
  }

  toggleTheme() {
    if (this.settings.theme === 'dark') {
      const light = this.settings.lastLightTheme && this.settings.lastLightTheme !== 'dark'
        ? this.settings.lastLightTheme : 'paper';
      this.saveSettings({ theme: light });
      toast(`已切换到亮色模式（${THEMES.find(t => t.key === light)?.label || light}）`, 'info', 1600);
    } else {
      this.saveSettings({ lastLightTheme: this.settings.theme, theme: 'dark' });
      toast('已切换到夜间模式', 'info', 1600);
    }
  }

  showThemePicker() {
    const grid = el('div', { class: 'theme-picker-grid' });
    const cards = new Map();
    const paint = () => {
      cards.forEach((card, key) => card.classList.toggle('active', this.settings.theme === key));
    };
    for (const t of THEMES) {
      const card = el('button', { class: 'theme-option', type: 'button' });
      card.appendChild(el('span', { class: `theme-preview theme-${t.key}` }));
      card.appendChild(el('span', { class: 'theme-option-name', text: t.label }));
      card.appendChild(el('span', { class: 'theme-option-sub', text: t.key === 'dark' ? '暗色' : '亮色' }));
      card.addEventListener('click', () => {
        this.saveSettings({ theme: t.key });
        paint();
      });
      cards.set(t.key, card);
      grid.appendChild(card);
    }
    paint();
    showModal({
      title: '选择主题',
      subtitle: '太阳 / 月亮按钮只负责亮暗切换；这里选择具体配色。',
      body: grid,
      width: 480,
      actions: [{ label: '完成', primary: true }],
    });
  }

  async saveSettings(patch) {
    if (patch.theme && patch.theme !== 'dark') {
      patch = { ...patch, lastLightTheme: patch.theme };
    }
    this.settings = { ...this.settings, ...patch };
    await setApp('settings', this.settings);
    this.applySettings();
    this.renderTopbar();
    this.renderStatusbar();
  }

  applySettings() {
    const s = this.settings;
    document.documentElement.dataset.theme = s.theme || 'paper';
    const font = FONTS[s.font] || FONTS.serif;
    document.documentElement.style.setProperty('--editor-font', font.value);
    document.documentElement.style.setProperty('--editor-size', `${s.fontSize || 18}px`);
    document.documentElement.style.setProperty('--editor-line', String(s.lineHeight || 2));
    document.documentElement.style.setProperty('--editor-width', `${s.width || 780}px`);
    document.documentElement.style.setProperty('--bg-image', s.bg ? `url("${s.bg}")` : 'none');
    document.documentElement.style.setProperty('--bg-image-opacity', String(s.bgOpacity ?? 0.14));
    document.body.classList.toggle('has-bg', Boolean(s.bg));
    const themeBtn = $('#btn-theme');
    if (themeBtn) {
      themeBtn.innerHTML = icon(s.theme === 'dark' ? 'sun' : 'moon', 17);
      themeBtn.title = s.theme === 'dark' ? '切换到亮色模式' : '切换到夜间模式';
      themeBtn.setAttribute('aria-label', themeBtn.title);
    }
    const themePickerBtn = $('#btn-theme-picker');
    if (themePickerBtn) {
      themePickerBtn.innerHTML = icon('palette', 17);
      themePickerBtn.title = `选择主题（当前：${THEMES.find(t => t.key === s.theme)?.label || ''}）`;
      themePickerBtn.setAttribute('aria-label', '选择主题');
    }
    document.title = this.state.project ? `${this.state.project.name} — Novie` : 'Novie · 本地码字工坊';
  }

  /* ============================= Misc UI ============================= */

  async smartTypeset() {
    if (!this.state.editor) {
      toast('请先打开一个章节', 'warn');
      return;
    }
    const text = this.state.editor.getText();
    if (!text) {
      toast('本章还没有内容', 'info');
      return;
    }
    await this.createSnapshot(this.state.activeChapter.id, { label: '排版前快照', silent: true });
    // 排版是格式调整（可能删掉段首空格），不计入今日码字增减
    this.state.session.suppressTodayDelta = true;
    let result;
    try {
      result = this.state.editor.smartTypeset();
    } finally {
      this.state.session.suppressTodayDelta = false;
    }
    if (!result.changed && !result.removed) {
      toast('排版检查完成：没有需要修改的地方', 'info', 2200);
      return;
    }
    toast(`排版完成：清理空段 ${result.removed} 个，调整 ${result.changed} 处`, 'success', 2600);
    this.saveCurrent('typeset');
  }

  handleEditorKey(e) {
    if (!this.settings.typeSound) return;
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const isChar = e.key.length === 1;
    const isEdit = e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete';
    if (!isChar && !isEdit) return;
    playTypeClick();
  }

  handleTextSelection(text) {
    if (!text) return;
    const character = this.state.characters.find(c => {
      const aliases = (c.alias || '').split(/[\/，,、\s]+/).filter(Boolean);
      return c.name === text || aliases.includes(text);
    });
    if (!character) return;
    this.state.selectedCharacterId = character.id;
    if (this.state.inspectorOpen && this.state.rightTab === 'people') {
      this.renderInspector();
    }
  }

  toggleTypeSound() {
    const next = !this.settings.typeSound;
    this.saveSettings({ typeSound: next });
    this.renderStatusbar();
    if (next) playTypeClick();
    toast(next ? '已开启打字音效' : '已关闭打字音效', 'info', 1400);
  }

  insertIntoEditor(text) {
    if (!text) return;
    if (!this.state.activeChapter) { toast('请先打开一个章节', 'warn'); return; }
    if (this.state.view !== 'write') {
      this.switchView('write').then(() => {
        setTimeout(() => {
          this.state.editor?.focus();
          this.state.editor?.insertText(text);
        }, 80);
      });
      return;
    }
    this.state.editor?.focus();
    this.state.editor?.insertText(text);
  }

  openChapterInfoById(id) { showChapterInfo(this, id); }

  async scanCharacterAppearances(character) {
    if (!character) return [];
    const names = [character.name, ...(character.alias || '').split(/[\/，,、\s]+/)]
      .map(s => String(s || '').trim()).filter(s => s.length >= 2);
    const contents = await getAll('contents');
    const contentMap = new Map(contents.map(c => [c.id, c.html]));
    const appeared = [];
    for (const chapter of this.state.chapters) {
      const html = contentMap.get(chapter.id) || '';
      const text = htmlToText(html);
      if (!names.some(n => text.includes(n))) continue;
      appeared.push(chapter);
      const mentions = new Set(chapter.mentions || []);
      if (!mentions.has(character.id)) {
        mentions.add(character.id);
        chapter.mentions = Array.from(mentions);
        await put('chapters', chapter);
      }
    }
    this.state.chapters = this.state.chapters.map(c => ({ ...c }));
    return appeared;
  }

  showShortcuts() {
    const rows = [
      ['Ctrl + S', '保存'],
      ['Ctrl + Shift + S', '保存并创建历史快照'],
      ['Ctrl + N', '新建章节'],
      ['Ctrl + F', '全文搜索 / 替换'],
      ['Ctrl + Shift + F', '专注模式（Esc 退出）'],
      ['Ctrl + Shift + T', '打字机模式'],
      ['Ctrl + J', '一键网文排版（清理空格、规范引号、删空段）'],
      ['Ctrl + Shift + E', '打开导出页'],
      ['Alt + 1 ~ 4', '插入前四个快捷短语'],
      ['Alt + ← / →', '上一章 / 下一章'],
      ['F2', '重命名当前章节'],
      ['Tab（输入快捷短语后）', '展开快捷短语'],
      ['双击章节标题', '快速重命名'],
    ];
    const body = el('div', { class: 'shortcut-list' });
    rows.forEach(([k, v]) => {
      body.appendChild(el('div', { class: 'shortcut-row' }, [
        el('kbd', { text: k }),
        el('span', { text: v }),
      ]));
    });
    showModal({ title: '键盘快捷键', body, width: 520, actions: [{ label: '知道了', primary: true }] });
  }

  toast(message, type = 'info', ms = 2400) { toast(message, type, ms); }

  /* ============================= Lock screen (project password) ============================= */

  showLockScreen() {
    if (!this.state.project) return;
    this.closeLockScreen();
    const overlay = el('div', { class: 'lock-screen' });
    const input = el('input', { class: 'input', type: 'password', placeholder: '输入作品密码', autofocus: true });
    const error = el('p', { class: 'field-error hidden', text: '密码不正确' });
    const unlock = makeButton('解锁', { primary: true, onClick: async () => {
      const ok = await verifyPassword(input.value, this.state.project.password);
      if (!ok) {
        error.classList.remove('hidden');
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 400);
        return;
      }
      this.state.unlocked = true;
      this.closeLockScreen();
      this.renderAll();
      toast('已解锁', 'success', 1600);
    } });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') unlock.click(); });
    const switchBtn = makeButton('切换作品', { ghost: true, onClick: () => this.showProjectPickerOverLock() });
    const card = el('div', { class: 'lock-card' }, [
      el('div', { class: 'lock-brand' }, [
        el('div', { class: 'brand-mark', text: 'N' }),
        el('div', {}, [el('strong', { text: 'Novie' }), el('span', { class: 'muted small', text: '本地码字工坊' })]),
      ]),
      el('div', { class: 'lock-icon', html: icon('lock', 28) }),
      el('h2', { text: this.state.project.name || '未命名作品' }),
      el('p', { class: 'muted small', text: '此作品已设置打开密码。' }),
      input,
      error,
      unlock,
      switchBtn,
      el('p', { class: 'muted tiny', text: '密码只用于界面解锁；真正的正文加密请使用“加密备份”。' }),
    ]);
    overlay.appendChild(card);
    document.getElementById('overlay-root').appendChild(overlay);
    requestAnimationFrame(() => input.focus());
  }

  closeLockScreen() {
    document.querySelectorAll('.lock-screen').forEach(n => n.remove());
  }

  showProjectPickerOverLock() {
    const body = el('div', { class: 'project-list' });
    this.state.projects.forEach(p => {
      const row = el('div', { class: 'project-row' }, [
        el('span', { class: 'project-avatar', style: { background: p.color || '#8a5a3b' }, text: (p.name || '未')[0] }),
        el('div', { class: 'project-row-meta' }, [
          el('strong', { text: p.name }),
          el('span', { class: 'muted small', text: p.author || '佚名' }),
        ]),
        makeButton('打开', { small: true, onClick: async () => {
          this.closeLockScreen();
          modal.close();
          await this.loadProject(p.id);
        } }),
      ]);
      body.appendChild(row);
    });
    if (!this.state.projects.length) body.appendChild(el('p', { class: 'muted', text: '暂无其他作品' }));
    const modal = showModal({
      title: '切换作品',
      body,
      width: 520,
      actions: [{ label: '关闭', ghost: true }],
      onClose: () => { if (!this.state.unlocked) this.showLockScreen(); },
    });
  }

  async setProjectPassword(newPassword) {
    if (!this.state.project) return;
    if (!newPassword) {
      const updated = { ...this.state.project, password: null };
      await put('projects', updated);
      this.state.project = updated;
      this.state.projects = this.state.projects.map(p => p.id === updated.id ? updated : p);
      toast('已清除作品打开密码', 'success');
      return;
    }
    const record = await hashPassword(newPassword);
    const updated = { ...this.state.project, password: record };
    await put('projects', updated);
    this.state.project = updated;
    this.state.projects = this.state.projects.map(p => p.id === updated.id ? updated : p);
    toast('已设置作品打开密码', 'success');
  }

  async verifyCurrentPassword(password) {
    return verifyPassword(password, this.state.project?.password);
  }

  lockProject() {
    if (!this.state.project?.password) {
      toast('请先在设置中设置作品密码', 'warn');
      return;
    }
    this.state.unlocked = false;
    this.saveCurrent('lock').finally(() => this.showLockScreen());
  }
}

/* ============================= Snapshot modal ============================= */

export async function openSnapshotsModal(app, chapterId) {
  const versions = (await getAllBy('versions', 'chapterId', chapterId))
    .sort((a, b) => b.createdAt - a.createdAt);
  const chapter = app.state.chapters.find(c => c.id === chapterId);
  const body = el('div', { class: 'version-list' });
  if (!versions.length) {
    body.appendChild(el('p', { class: 'muted', text: '还没有历史快照。切换章节或按 Ctrl+Shift+S 会自动留下快照。' }));
  }
  for (const v of versions) {
    const row = el('div', { class: 'version-row' }, [
      el('div', { class: 'version-meta' }, [
        el('strong', { text: v.label || '快照' }),
        el('span', { class: 'muted small', text: `${new Date(v.createdAt).toLocaleString('zh-CN')} · ${fmtNumber(v.wordCount)} 字` }),
      ]),
      makeButton('恢复', { small: true, onClick: async () => {
        const ok = await confirmDialog(`恢复「${v.label}」的快照？当前内容会先自动存为一个“恢复前快照”。`, { okLabel: '恢复' });
        if (!ok) return;
        await app.restoreSnapshot(v);
        modal.close();
      } }),
    ]);
    body.appendChild(row);
  }
  const modal = showModal({
    title: '历史快照',
    subtitle: chapter ? chapter.title : '',
    body,
    width: 560,
    actions: [
      { label: '关闭', ghost: true },
      {
        label: '立即创建快照', primary: true,
        onClick: async () => {
          await app.createSnapshot(chapterId);
          modal.close();
          openSnapshotsModal(app, chapterId);
        },
      },
    ],
  });
}

/* ============================= Boot ============================= */

const app = new App();
window.__novie = app;

async function setupDebugHooks() {
  try {
    if (!new URLSearchParams(location.search).has('debug')) return;
    const [exp, dbm, syn, enrich] = await Promise.all([
      import('./exporters.js'), import('./db.js'), import('./sync.js'), import('./enrich-apply.js'),
    ]);
    window.__novieTest = { exp, db: dbm, sync: syn, enrich };
  } catch (err) {
    console.warn('调试钩子加载失败', err);
  }
}

async function main() {
  try {
    await app.boot();
    await setupDebugHooks();
  } catch (err) {
    console.error(err);
    const root = document.getElementById('view-host');
    if (root) {
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'fatal' }, [
        el('h2', { text: 'Novie 启动失败' }),
        el('p', { text: err.message || String(err) }),
        el('p', { class: 'muted small', text: '请尝试刷新页面；若桌面版报错，请检查是否以 Electron 启动。' }),
      ]));
    }
    toast('启动失败：' + (err.message || err), 'error', 8000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}
