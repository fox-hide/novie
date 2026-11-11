/* Novie — GBK 编码（浏览器/Node 均可用 TextDecoder 反查构建映射） */

let table = null;
let building = false;

function buildTable() {
  if (table || building) return table;
  building = true;
  table = new Map();
  let decoder;
  try {
    decoder = new TextDecoder('gbk', { fatal: false });
  } catch {
    return table;
  }
  for (let hi = 0x81; hi <= 0xFE; hi++) {
    for (let lo = 0x40; lo <= 0xFE; lo++) {
      if (lo === 0x7F) continue;
      let ch;
      try {
        ch = decoder.decode(Uint8Array.of(hi, lo));
      } catch {
        continue;
      }
      if (ch && ch.length === 1 && ch !== '\uFFFD' && !table.has(ch)) {
        table.set(ch, [hi, lo]);
      }
    }
  }
  building = false;
  return table;
}

/**
 * @param {string} text
 * @returns {{bytes: Uint8Array, missing: string[]}}
 */
export function encodeGbk(text) {
  const map = buildTable();
  const out = [];
  const missing = new Set();
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    if (ch === '\n') { out.push(10); continue; }
    if (ch === '\r') { out.push(13); continue; }
    const pair = map.get(ch);
    if (pair) out.push(pair[0], pair[1]);
    else {
      missing.add(ch);
      out.push(0x3F); // ?
    }
  }
  return { bytes: Uint8Array.from(out), missing: Array.from(missing) };
}

export function canEncodeGbk(text) {
  const map = buildTable();
  for (const ch of String(text)) {
    if (ch.codePointAt(0) < 0x80) continue;
    if (!map.has(ch)) return false;
  }
  return true;
}
