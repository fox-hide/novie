/* Novie — 取名器、敏感词示例库、重复段落检测 */

import { randomItem, randomItems } from './utils.js';

/* ---------------- 取名 ---------------- */

const SURNAMES = ['沈', '白', '顾', '苏', '陆', '叶', '秦', '林', '谢', '裴', '萧', '楚', '江', '容', '晏', '温',
  '宋', '许', '闻', '商', '宁', '姜', '黎', '柳', '梅', '韩', '程', '梁', '孟', '贺', '钟', '方',
  '唐', '薛', '阮', '季', '卫', '霍', '穆', '靳', '庄', '燕', '薄', '应', '闻人', '上官', '南宫', '诸葛',
  '司徒', '东方', '独孤', '慕容', '长孙', '令狐', '夏侯', '皇甫', '尉迟', '公冶', '澹台', '濮阳'];

const MALE_CHARS = ['烬', '川', '舟', '渊', '衍', '承', '砚', '临', '朔', '野', '珩', '骁', '牧', '峥', '归', '寒',
  '听', '澜', '晏', '彻', '执', '离', '阙', '徵', '玄', '肃', '砺', '南', '照', '燃', '渡', '岑',
  '崇', '霁', '骁', '晏', '珩', '衍', '峥', '北', '珩', '祈', '隽', '漠', '戟', '沉', '阔', '霄',
  '岳', '岭', '栎', '槐', '决', '竞', '锋', '野', '行', '知', '简', '白', '青', '墨', '弦', '歌'];

const FEMALE_CHARS = ['砚', '秋', '棠', '梧', '鸢', '蕖', '菀', '宁', '晚', '昭', '月', '棠', '萤', '若', '微', '澜',
  '绾', '蝉', '萤', '雪', '篱', '萝', '苓', '苏', '蔓', '笙', '笛', '笺', '语', '柔', '漪', '沅',
  '湘', '檀', '砚', '栀', '秀', '禾', '绫', '纨', '素', '锦', '嘉', '央', '澜', '溪', '汀', '萤',
  '翎', '瑶', '琬', '瑾', '璐', '眠', '知', '微', '语', '迟', '宜', '宁', '安', '冉', '桑', '柔'];

const NEUTRAL_CHARS = ['青', '云', '予', '安', '然', '一', '之', '言', '水', '木', '石', '山', '风', '雨', '雪', '夜',
  '星', '川', '原', '平', '和', '明', '清', '远', '长', '新', '初', '意', '思', '问', '真', '常'];

const PLACE_PREFIX = ['青', '云', '落', '幽', '苍', '无', '极', '寒', '赤', '玄', '照', '望', '沉', '碧', '白', '黑',
  '风', '雪', '月', '星', '暮', '朝', '古', '荒', '归', '远', '长', '北', '南', '东', '西', '断'];

const PLACE_SUFFIX = ['州', '城', '山', '谷', '海', '原', '渊', '岭', '崖', '渡', '关', '泽', '陵', '野', '林', '丘',
  '川', '江', '湖', '岛', '津', '台', '门', '谷口', '之巅', '秘境', '旧墟', '长堤'];

const SECT_SUFFIX = ['宗', '门', '派', '阁', '殿', '教', '帮', '盟', '谷', '岛', '楼', '堂', '观', '寺', '书院', '山庄'];

const SKILL_PREFIX = ['九', '天', '玄', '太', '混', '元', '紫', '青', '无', '极', '噬', '焚', '照', '寒', '赤', '幽',
  '归', '断', '碎', '长', '万', '千', '一', '两', '三', '七', '星', '月', '日', '云'];
const SKILL_MID = ['雷', '火', '风', '冰', '剑', '刀', '拳', '掌', '指', '神', '魔', '灵', '魂', '魄', '影', '光',
  '雪', '霜', '雨', '山', '河', '海', '星', '月', '夜', '灯', '鸢', '藤', '药', '阵'];
const SKILL_SUFFIX = ['诀', '经', '法', '功', '典', '咒', '术', '谱', '真解', '秘录', '图', '印', '歌', '篇'];

const ITEM_PREFIX = ['青', '紫', '玄', '赤', '金', '银', '寒', '照', '碎', '归', '无', '九', '千', '万', '天', '星'];
const ITEM_NOUN = ['剑', '刀', '塔', '鼎', '珠', '镜', '印', '幡', '琴', '笛', '灯', '伞', '弓', '箫', '尺', '环'];

function generatePerson(gender = 'male', count = 10) {
  const pool = gender === 'female' ? FEMALE_CHARS : gender === 'neutral' ? NEUTRAL_CHARS : MALE_CHARS;
  const out = new Set();
  let guard = 0;
  while (out.size < count && guard++ < count * 40) {
    const surname = randomItem(SURNAMES);
    const two = Math.random() < 0.62;
    let given = randomItem(pool);
    if (two) given += randomItem(pool);
    out.add(`${surname}${given}`);
  }
  return Array.from(out);
}

function generatePlace(count = 10) {
  const out = new Set();
  let guard = 0;
  while (out.size < count && guard++ < count * 40) {
    out.add(`${randomItem(PLACE_PREFIX)}${randomItem(PLACE_SUFFIX)}`);
  }
  return Array.from(out);
}

function generateSect(count = 10) {
  const out = new Set();
  let guard = 0;
  while (out.size < count && guard++ < count * 40) {
    const prefix = randomItem(PLACE_PREFIX) + (Math.random() < 0.4 ? randomItem(NEUTRAL_CHARS) : '');
    out.add(`${prefix}${randomItem(SECT_SUFFIX)}`);
  }
  return Array.from(out);
}

function generateSkill(count = 10) {
  const out = new Set();
  let guard = 0;
  while (out.size < count && guard++ < count * 40) {
    const pattern = Math.random();
    let name;
    if (pattern < 0.45) name = `${randomItem(SKILL_PREFIX)}${randomItem(SKILL_MID)}${randomItem(SKILL_SUFFIX)}`;
    else if (pattern < 0.8) name = `${randomItem(SKILL_PREFIX)}${randomItem(SKILL_SUFFIX)}`;
    else name = `${randomItem(SKILL_PREFIX)}${randomItem(SKILL_MID)}${randomItem(SKILL_MID)}${randomItem(SKILL_SUFFIX)}`;
    out.add(name);
  }
  return Array.from(out);
}

function generateItem(count = 10) {
  const out = new Set();
  let guard = 0;
  while (out.size < count && guard++ < count * 40) {
    out.add(`${randomItem(ITEM_PREFIX)}${randomItem(ITEM_NOUN)}`);
  }
  return Array.from(out);
}

export const NAME_TYPES = [
  { key: 'male', label: '男性人名', action: () => generatePerson('male', 24) },
  { key: 'female', label: '女性人名', action: () => generatePerson('female', 24) },
  { key: 'neutral', label: '中性人名', action: () => generatePerson('neutral', 24) },
  { key: 'place', label: '地名', action: () => generatePlace(24) },
  { key: 'sect', label: '宗门势力', action: () => generateSect(24) },
  { key: 'skill', label: '功法魂技', action: () => generateSkill(24) },
  { key: 'item', label: '法宝器物', action: () => generateItem(24) },
];

export function generateNames(type = 'male', count = 12) {
  const def = NAME_TYPES.find(t => t.key === type) || NAME_TYPES[0];
  return def.action().slice(0, count);
}

/* ---------------- 敏感词示例库 ---------------- */

/**
 * 内置仅为示例，不构成平台审核标准；请按目标平台词库在设置中补充。
 * 大多数词在正常剧情中也可能出现，检测结果应人工复核。
 */
export const BUILTIN_SENSITIVE = [
  '色情', '情色', '淫秽', '淫乱', '露骨', '裸体', '全裸', '性行为', '性描写', '床戏',
  '强奸', '轮奸', '乱伦', '猥亵', '嫖娼', '卖淫', '召妓', '性交易',
  '吸毒', '贩毒', '毒品', '大麻', '冰毒', '海洛因', '鸦片', '摇头丸', '制毒',
  '枪支', '弹药', '炸药', '爆炸物', '军火', '走私军火', '自制炸弹',
  '恐怖袭击', '恐怖组织', '绑架', '勒索', '拐卖', '人口贩卖', '偷渡', '洗钱', '诈骗',
  '赌博', '赌场', '赌局', '传销', '高利贷', '非法集资',
  '邪教', '招魂', '血祭', '人祭', '活人献祭', '自焚', '自杀', '自残',
  '分尸', '碎尸', '烹尸', '食人', '虐杀', '虐童', '虐待', '家暴',
  '血腥', '残肢', '断肢', '内脏', '脑浆', '肠子', '割喉', '挖眼', '剥皮',
  '杀人', '灭门', '屠城', '屠杀', '斩首', '凌迟', '酷刑',
  '人肉', '吃人', '尸体', '尸变', '奸尸',
  '黑社会', '帮派火并', '保护费', '收保护费',
  '政治', '政变', '颠覆', '暴乱', '示威', '游行',
];

export function mergeSensitiveWords(custom = []) {
  return Array.from(new Set([...BUILTIN_SENSITIVE, ...custom.map(w => String(w).trim()).filter(Boolean)]));
}

/* ---------------- 重复段落检测 ---------------- */

export function findDuplicateParagraphs(text, { minLength = 30 } = {}) {
  const paragraphs = String(text || '')
    .split(/\n{2,}/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length >= minLength);
  const map = new Map();
  for (const p of paragraphs) {
    if (!map.has(p)) map.set(p, { text: p, count: 0 });
    map.get(p).count++;
  }
  return Array.from(map.values())
    .filter(item => item.count > 1)
    .sort((a, b) => b.count - a.count || b.text.length - a.text.length);
}

export function chapterBalanceHint(chapters = []) {
  if (!chapters.length) return '';
  const counts = chapters.map(c => c.wordCount || 0).filter(c => c > 0);
  if (counts.length < 2) return '';
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  if (max > avg * 1.8) return `最长章节约 ${max} 字，是平均值的 ${(max / avg).toFixed(1)} 倍，建议拆分。`;
  if (min > 0 && min < avg * 0.4) return `最短章节约 ${min} 字，明显偏短，可考虑与相邻章节合并。`;
  return '章节字数较为均衡。';
}

/* ---------------- 章末钩子（断章力度）本地规则检测 ---------------- */

const HOOK_SUSPENSE_WORDS = [
  '突然', '骤然', '蓦地', '猛一', '只见', '然而', '就在这时', '此刻', '身后',
  '缓缓', '竟然', '居然', '万万没想到', '万万没料到', '仿佛', '似乎', '难道',
  '莫非', '怎么可能', '不可能', '怎么会', '尸体', '黑影', '失踪', '血迹',
  '笑声', '脚步声', '嗡', '刹那', '猛地', '赫然', '竟然是',
];
const HOOK_SUMMARY_WORDS = [
  '终于', '这才', '于是', '随后', '从此', '就这样', '一切', '最终', '直到',
];

/**
 * 章末钩子评分：纯本地规则，针对“读者会不会翻下一章”给出 0–100 分与提示。
 * @param {string} text 章节纯文本
 * @returns {{score:number, tag:string, hint:string, signals:string[]}}
 */
export function analyzeChapterHook(text) {
  const clean = String(text || '').replace(/\u200b/g, '').trim();
  if (!clean) return { score: 0, tag: '空章', hint: '本章还没有正文。', signals: [] };
  const paras = clean.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const last = paras[paras.length - 1] || '';
  const window = paras.slice(-2).join('\n').slice(-240);

  let score = 48;
  const signals = [];
  const isDialogueEnd = /[”」』）)"']$/.test(last);
  const isQuestionEnd = /[？?]$/.test(last);
  const isEllipsisEnd = /…$/.test(last) || /\.{3,}$/.test(last);
  const suspenseHit = HOOK_SUSPENSE_WORDS.find(w => window.includes(w));
  const lastSummaryHit = HOOK_SUMMARY_WORDS.find(w => last.includes(w));
  const lastLen = Array.from(last).length;

  if (isDialogueEnd) { score += 20; signals.push('对话收尾'); }
  if (isQuestionEnd) { score += 16; signals.push('疑问收尾'); }
  if (isEllipsisEnd) { score += 12; signals.push('悬念省略收尾'); }
  if (suspenseHit) { score += 18; signals.push(`含“${suspenseHit}”`); }
  if (lastLen <= 30 && !isDialogueEnd) score += 6;
  // 短句 + 悬念词的“戛然而止”是网文最经典的断章
  if (suspenseHit && lastLen <= 40 && !isDialogueEnd) { score += 8; signals.push('短句悬念收尾'); }
  // 总结词只看最后一段本身，避免误伤对话内容里的“终于”等
  if (lastSummaryHit && !isDialogueEnd && !isQuestionEnd) { score -= 16; signals.push('总结式收尾'); }
  if (lastLen > 140 && !suspenseHit && !isDialogueEnd) { score -= 8; signals.push('结尾段落过长'); }

  score = Math.max(0, Math.min(100, score));
  const tag = score >= 75 ? '强钩子' : score >= 58 ? '合格' : score >= 42 ? '偏平' : '易弃书';
  let hint = '';
  if (score < 58) {
    hint = (isDialogueEnd || isQuestionEnd || isEllipsisEnd || suspenseHit)
      ? '结尾有信号但力度不足，可尝试把最后一句改为动作、未答之问或新变量。'
      : '建议以对话、动作或悬念收尾，避免平铺总结式结尾。';
  } else if (signals.includes('总结式收尾')) {
    hint = '虽有钩子信号，但总结式收尾会削弱翻页欲，可删掉最后一段概括。';
  }
  return { score, tag, hint, signals };
}
