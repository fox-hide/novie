// 1112 整改回归测试：级联删除 / 合并重指向 / 星图定焦数学 / 日均口径 / 颜色白名单
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyChapterDeletionCascade, repointChapterReferences
} from '../src/js/db.js';
import {
  averageDailyWords, safeColor, findInText, recentDateKeys, dateKey, addDays
} from '../src/js/utils.js';
import { inferRelationType } from '../src/js/star-map.js';

/* ---------------- P1-7：删章级联 ---------------- */

test('applyChapterDeletionCascade 置空剧情节点与伏笔三段章引用', () => {
  const plotnodes = [
    { id: 'n1', chapterId: 'ch-a' },
    { id: 'n2', chapterId: 'ch-b' },
  ];
  const foreshadows = [
    { id: 'f1', plantChapterId: 'ch-a', targetChapterId: 'ch-a', resolvedChapterId: null },
    { id: 'f2', plantChapterId: 'ch-b', targetChapterId: null, resolvedChapterId: 'ch-a' },
    { id: 'f3', plantChapterId: 'ch-c', targetChapterId: null, resolvedChapterId: null },
  ];
  const out = applyChapterDeletionCascade({ plotnodes, foreshadows }, 'ch-a');
  assert.deepEqual(out.plotnodes[0], { id: 'n1', chapterId: null });
  assert.equal(out.plotnodes[1], plotnodes[1], '未命中的节点应保持原引用');
  assert.equal(out.foreshadows[0].plantChapterId, null);
  assert.equal(out.foreshadows[0].targetChapterId, null);
  assert.equal(out.foreshadows[1].resolvedChapterId, null);
  assert.equal(out.foreshadows[2].plantChapterId, 'ch-c');
  // n1 + f1(记 1 次) + f2(记 1 次) = 3 处引用被断开
  assert.equal(out.cleared, 3);
});

test('repointChapterReferences 合并章时把引用改指向目标章', () => {
  const plotnodes = [{ id: 'n1', chapterId: 'ch-next' }, { id: 'n2', chapterId: 'ch-x' }];
  const foreshadows = [
    { id: 'f1', plantChapterId: 'ch-next', targetChapterId: 'ch-elsewhere' },
  ];
  const out = repointChapterReferences({ plotnodes, foreshadows }, 'ch-next', 'ch-main');
  assert.equal(out.plotnodes[0].chapterId, 'ch-main');
  assert.equal(out.plotnodes[1].chapterId, 'ch-x');
  assert.equal(out.foreshadows[0].plantChapterId, 'ch-main');
  assert.equal(out.foreshadows[0].targetChapterId, 'ch-elsewhere');
});

/* ---------------- P1-8：星图定焦数学 ---------------- */

// 复刻 star-map._project 的投影公式，验证 targetRot 对准后 x1/y2 归零
function project(sx, sy, sz, rotX, rotY) {
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const x1 = sx * cosY + sz * sinY;
  const z1 = -sx * sinY + sz * cosY;
  const y2 = sy * cosX - z1 * sinX;
  const z2 = sy * sinX + z1 * cosX;
  return { x1, y2, z2 };
}

function targetAngles(sx, sy, sz) {
  const r = Math.hypot(sx, sy, sz) || 1;
  const rotY = Math.atan2(-sx, sz);
  const rotX = Math.max(-1.42, Math.min(1.42, Math.asin(Math.max(-1, Math.min(1, sy / r)))));
  return { rotX, rotY };
}

test('星图定焦目标角把星体投到屏幕中心（x1/y2 ≈ 0，且朝向观察者）', () => {
  const corners = [
    [0.8, 0.0, 0.6],
    [-0.8, 0.0, 0.6],
    [0.0, 0.6, 0.8],
    [0.6, -0.6, -0.5],
    [0.0, 0.0, 1.0],
    [-0.5, 0.5, -0.7],
  ];
  for (const [sx, sy, sz] of corners) {
    const { rotX, rotY } = targetAngles(sx, sy, sz);
    const { x1, y2, z2 } = project(sx, sy, sz, rotX, rotY);
    assert.ok(Math.abs(x1) < 1e-9, `x1 应为 0（${sx},${sy},${sz}）→ ${x1}`);
    if (Math.abs(sy) < 0.95) {
      // rotX 被拖拽限位 clamp 的情况下，极高纬度的星允许残余 y2
      assert.ok(Math.abs(y2) < 1e-9, `y2 应为 0（${sx},${sy},${sz}）→ ${y2}`);
    }
    assert.ok(z2 > 0, '定焦的星应转向观察者一侧而不是背面');
  }
});

test('inferRelationType 关键词归类', () => {
  assert.equal(inferRelationType(['亦师亦父']), 'kin');
  assert.equal(inferRelationType(['师父']), 'kin');
  assert.equal(inferRelationType(['队长与老大']), 'bond');
  assert.equal(inferRelationType(['由爱生恨']), 'enemy');
  assert.equal(inferRelationType(['青梅竹马 / 恋人']), 'love');
  assert.equal(inferRelationType(['杀母之仇']), 'enemy');
});

/* ---------------- P2-22：近 7 天日均按日历日 ---------------- */

test('averageDailyWords 按日历日取均值，跳写的日子按 0 计', () => {
  const now = new Date('2026-11-13T12:00:00');
  const d = n => dateKey(addDays(now, -n));
  // 只有一条记录落在 6 天前：近 7 条记录口径会虚高成 700/1；日历日口径应为 100
  const daily = [{ date: d(6), words: 700 }];
  assert.equal(averageDailyWords(daily, 7, now), 100);
  const daily2 = [
    { date: d(0), words: 300 },
    { date: d(1), words: 700 },
    { date: d(3), words: 500 },
  ];
  // (300 + 700 + 500) / 7 = 214.28… → 214
  assert.equal(averageDailyWords(daily2, 7, now), 214);
  assert.equal(averageDailyWords([], 7, now), 0);
});

test('recentDateKeys 生成含今天的升序日历日', () => {
  const now = new Date('2026-11-13T12:00:00');
  const keys = recentDateKeys(7);
  assert.equal(keys.length, 7);
  assert.equal(keys[6], dateKey(now));
  assert.equal(keys[0], dateKey(addDays(now, -6)));
});

/* ---------------- P3-12 / P3-34：颜色白名单与大小写折叠 ---------------- */

test('safeColor 只放行 #rrggbb，其余回退默认值', () => {
  assert.equal(safeColor('#b4552d'), '#b4552d');
  assert.equal(safeColor('#B4552D'), '#B4552D');
  assert.equal(safeColor('url(https://evil.example/x.png)'), '#8a5a3b');
  assert.equal(safeColor('red'), '#8a5a3b');
  assert.equal(safeColor('#b45', '#4d7d7a'), '#4d7d7a');
  assert.equal(safeColor(null, '#123456'), '#123456');
  assert.equal(safeColor('javascript:alert(1)'), '#8a5a3b');
});

test('findInText 在大小写折叠改变长度时回退精确匹配', () => {
  // 'İ'.toLowerCase() 长度变为 2：不应崩溃或错位
  const text = 'İİab';
  const hits = findInText(text, 'ab', 10, false);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].match, 'ab');
  assert.equal(text.slice(hits[0].index, hits[0].index + 2), 'ab');
});
