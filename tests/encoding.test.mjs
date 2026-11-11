import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip, crc32 } from '../src/js/zip.js';
import { encodeGbk, canEncodeGbk } from '../src/js/gbk.js';

test('crc32 与标准值一致', () => {
  const data = new TextEncoder().encode('123456789');
  assert.equal(crc32(data), 0xCBF43926);
});

test('createZip 生成可解析的本地/中央目录结构', () => {
  const bytes = createZip([
    { name: 'a.txt', data: 'hello' },
    { name: 'dir/中文.txt', data: '你好' },
  ]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const eocdOffset = bytes.length - 22;
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50);
  assert.equal(view.getUint16(eocdOffset + 10, true), 2);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  assert.equal(view.getUint32(cdOffset, true), 0x02014b50);
});

test('GBK 编码常见中文', () => {
  const { bytes, missing } = encodeGbk('你好，世界');
  assert.deepEqual(Array.from(bytes), [0xC4, 0xE3, 0xBA, 0xC3, 0xA3, 0xAC, 0xCA, 0xC0, 0xBD, 0xE7]);
  assert.equal(missing.length, 0);
  assert.equal(canEncodeGbk('你好世界'), true);
});

test('GBK 编码 ASCII 与换行', () => {
  const { bytes } = encodeGbk('A\nB');
  assert.deepEqual(Array.from(bytes), [65, 10, 66]);
});

test('GBK 遇到不可编码字符回退为问号并报告', () => {
  const { bytes, missing } = encodeGbk('你好🙂');
  assert.equal(missing[0], '🙂');
  assert.deepEqual(Array.from(bytes.slice(-1)), [0x3F]);
});
