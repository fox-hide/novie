import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countChars, parseTags, safeFileName, findInText, htmlToText, plainTextToHtml
} from '../src/js/utils.js';
import {
  splitPlainText, buildTxt, buildProjectJson, encryptJson, decryptBackup,
  hashPassword, verifyPassword, isEncryptedBackup
} from '../src/js/exporters.js';
import { analyzeChapterHook, findDuplicateParagraphs } from '../src/js/generators.js';

test('countChars 统计中英文与标点', () => {
  assert.equal(countChars('你好，世界！'), 6);
  assert.equal(countChars('你好，世界！', true), 4);
  assert.equal(countChars('hello world'), 10);
  assert.equal(countChars('你好 world!', true), 7);
  assert.equal(countChars('   \n\t'), 0);
});

test('parseTags 去重并支持中英文分隔符', () => {
  assert.deepEqual(parseTags('主角，雪原、残灯; 主角, 伏笔'), ['主角', '雪原', '残灯', '伏笔']);
});

test('safeFileName 去除非法字符', () => {
  assert.equal(safeFileName('a/b:c*d?e"f<g>h|i'), 'a b c d e f g h i');
  assert.equal(safeFileName('   '), 'novie');
});

test('findInText 返回上下文', () => {
  const hits = findInText('今天下雨了，明天也下雨。', '下雨');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].match, '下雨');
  assert.equal(hits[0].before, '今天');
});

test('plainTextToHtml 转义 HTML 并分段', () => {
  const html = plainTextToHtml('第一段\n第二行\n\n第二段 <script>');
  assert.match(html, /^<p>第一段<br>第二行<\/p><p>第二段 &lt;script&gt;<\/p>$/);
});

test('splitPlainText 识别常见章节标题', () => {
  const text = `第一章 起点

正文一。

第二章 风雪

正文二。

番外

正文三。`;
  const chapters = splitPlainText(text);
  assert.equal(chapters.length, 3);
  assert.equal(chapters[0].title, '第一章 起点');
  assert.equal(chapters[1].title, '第二章 风雪');
  assert.equal(chapters[2].title, '番外');
  assert.match(chapters[1].content, /正文二/);
});

test('splitPlainText 无标题时返回 null', () => {
  assert.equal(splitPlainText('只是一段没有章节标题的文本。'), null);
});

test('buildTxt 支持 GBK 编码并报告缺字', () => {
  const { bytes, missing, text } = buildTxt({
    title: '测试书',
    author: '作者',
    items: [{ volumeTitle: '第一卷', chapterTitle: '第一章', html: '' }],
    encoding: 'gbk',
  });
  assert.equal(missing.length, 0);
  assert.match(text, /测试书/);
  const decoded = new TextDecoder('gbk').decode(bytes);
  assert.match(decoded, /第一章/);
  assert.match(decoded, /第一卷/);
});

test('加密备份可解密，错误密码被拒绝', async () => {
  const bundle = { project: { name: '测试作品' }, chapters: [{ title: '第一章' }] };
  const encrypted = await encryptJson(bundle, 'correct-password');
  assert.equal(isEncryptedBackup(encrypted), true);
  const decrypted = await decryptBackup(encrypted, 'correct-password');
  assert.equal(decrypted.project.name, '测试作品');
  await assert.rejects(() => decryptBackup(encrypted, 'wrong-password'));
});

test('密码哈希可验证且盐值随机', async () => {
  const a = await hashPassword('mypassword');
  const b = await hashPassword('mypassword');
  assert.notEqual(a.salt, b.salt);
  assert.equal(await verifyPassword('mypassword', a), true);
  assert.equal(await verifyPassword('wrong', a), false);
});

test('工程 JSON 可序列化', () => {
  const { text } = buildProjectJson({ project: { name: '书' }, chapters: [] });
  assert.match(text, /"project"/);
  assert.equal(JSON.parse(text).project.name, '书');
});

test('章末钩子：对话/悬念收尾得分高于总结式收尾', () => {
  const dialogueEnd = analyzeChapterHook('他推开门。\n\n“你终于来了。”');
  const summaryEnd = analyzeChapterHook('他推开门，两人聊了很久。\n\n终于，一切都会好起来的，于是他决定从此不再回头。');
  assert.ok(dialogueEnd.score > summaryEnd.score, `${dialogueEnd.score} 应高于 ${summaryEnd.score}`);
  assert.ok(dialogueEnd.score >= 58, `对话收尾应至少合格，实际 ${dialogueEnd.score}`);
  assert.equal(summaryEnd.signals.includes('总结式收尾'), true);
});

test('章末钩子：悬念词与空章处理', () => {
  const suspense = analyzeChapterHook('脚步声停在门外。\n\n就在这时，身后传来一声轻笑。');
  assert.ok(suspense.score >= 75, `悬念收尾应为强钩子，实际 ${suspense.score}`);
  const empty = analyzeChapterHook('   ');
  assert.equal(empty.tag, '空章');
  assert.equal(empty.score, 0);
});

test('重复段落检测可找出重复文本', () => {
  const para = '这一段描写很重要，需要读者记住它，因为它在后面还会再次出现并推动剧情。';
  const dup = findDuplicateParagraphs(`${para}\n\n中间内容。\n\n${para}`);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].count, 2);
});
