/* Novie — 导出引擎：TXT / Markdown / DOCX / 打印 PDF / 分章 ZIP / 加密备份 */

import {
  escapeXml, htmlToText, sanitizeHtml, countChars, concatBytes, safeFileName
} from './utils.js';
import { createZip } from './zip.js';
import { encodeGbk } from './gbk.js';

/* ============================= TXT ============================= */

export function buildTxt({ title = '', author = '', items = [], encoding = 'utf-8', bom = false }) {
  const lines = [];
  if (title) {
    lines.push(title);
    if (author) lines.push(`作者：${author}`);
    lines.push('');
    lines.push('');
  }
  let lastVolume = null;
  for (const item of items) {
    if (item.volumeTitle && item.volumeTitle !== lastVolume) {
      lastVolume = item.volumeTitle;
      lines.push(item.volumeTitle);
      lines.push('');
    }
    if (item.chapterTitle) {
      lines.push(item.chapterTitle);
      lines.push('');
    }
    const body = htmlToText(item.html || '');
    if (body) {
      lines.push(body);
      lines.push('');
    }
  }
  const text = lines.join('\r\n').replace(/(\r\n){3,}/g, '\r\n\r\n').trim() + '\r\n';
  if (String(encoding).toLowerCase() === 'gbk') {
    const { bytes, missing } = encodeGbk(text);
    return { bytes, missing, text };
  }
  const encoded = new TextEncoder().encode(text);
  if (bom) {
    const bytes = new Uint8Array(encoded.length + 3);
    bytes.set([0xEF, 0xBB, 0xBF], 0);
    bytes.set(encoded, 3);
    return { bytes, missing: [], text };
  }
  return { bytes: encoded, missing: [], text };
}

/* ============================= Markdown ============================= */

function inlineMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/\u00a0/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName;
  const inner = Array.from(node.childNodes).map(inlineMarkdown).join('');
  switch (tag) {
    case 'B': case 'STRONG': return inner.trim() ? `**${inner}**` : inner;
    case 'I': case 'EM': return inner.trim() ? `*${inner}*` : inner;
    case 'U': return `<u>${inner}</u>`;
    case 'S': case 'STRIKE': return `~~${inner}~~`;
    case 'BR': return '  \n';
    case 'CODE': return `\`${inner}\``;
    default: return inner;
  }
}

export function htmlToMarkdown(html = '') {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeHtml(html)}</body>`, 'text/html');
  const parts = [];
  let inlineBuffer = [];
  const flushInline = () => {
    if (!inlineBuffer.length) return;
    const text = inlineBuffer.map(n => inlineMarkdown(n)).join('').trim();
    if (text) parts.push(text);
    inlineBuffer = [];
  };
  for (const child of Array.from(doc.body.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) { inlineBuffer.push(child); continue; }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName;
    if (['P', 'DIV'].includes(tag)) {
      flushInline();
      const text = Array.from(child.childNodes).map(n => inlineMarkdown(n)).join('').trim();
      if (text) parts.push(text);
    } else if (/^H[1-3]$/.test(tag)) {
      flushInline();
      const level = Number(tag[1]);
      const text = inlineMarkdown(child).trim();
      if (text) parts.push(`${'#'.repeat(level)} ${text}`);
    } else if (tag === 'BLOCKQUOTE') {
      flushInline();
      const text = inlineMarkdown(child).trim();
      if (text) parts.push(text.split('\n').map(l => `> ${l}`).join('\n'));
    } else if (tag === 'HR') {
      flushInline();
      parts.push('---');
    } else if (tag === 'UL' || tag === 'OL') {
      flushInline();
      Array.from(child.children).forEach((li, i) => {
        const text = inlineMarkdown(li).trim();
        if (text) parts.push(`${tag === 'OL' ? `${i + 1}.` : '-'} ${text}`);
      });
    } else if (tag === 'BR') {
      inlineBuffer.push(child);
    } else {
      inlineBuffer.push(child);
    }
  }
  flushInline();
  return parts.join('\n\n');
}

export function buildMarkdown({ title = '', author = '', items = [] }) {
  const parts = [];
  if (title) {
    parts.push(`# ${title}`);
    if (author) parts.push(`*作者：${author}*`);
  }
  let lastVolume = null;
  for (const item of items) {
    if (item.volumeTitle && item.volumeTitle !== lastVolume) {
      lastVolume = item.volumeTitle;
      parts.push(`## ${item.volumeTitle}`);
    }
    if (item.chapterTitle) parts.push(`### ${item.chapterTitle}`);
    const md = htmlToMarkdown(item.html || '');
    if (md) parts.push(md);
  }
  const text = parts.join('\n\n') + '\n';
  return { bytes: new TextEncoder().encode(text), text };
}

/* ============================= DOCX ============================= */

function collectRuns(node, style, runs) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue.replace(/\r/g, '').replace(/\n/g, ' ');
    if (text) runs.push({ ...style, text });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const tag = node.tagName;
  if (tag === 'BR') { runs.push({ ...style, br: true }); return; }
  const next = { ...style };
  if (tag === 'B' || tag === 'STRONG') next.bold = true;
  if (tag === 'I' || tag === 'EM') next.italic = true;
  if (tag === 'U') next.underline = true;
  if (tag === 'S' || tag === 'STRIKE') next.strike = true;
  for (const child of Array.from(node.childNodes)) collectRuns(child, next, runs);
}

function blocksFromHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeHtml(html)}</body>`, 'text/html');
  const blocks = [];
  let inlineNodes = [];
  const flush = () => {
    if (!inlineNodes.length) return;
    const runs = [];
    inlineNodes.forEach(n => collectRuns(n, {}, runs));
    const hasContent = runs.some(r => r.br || (r.text && r.text.trim()));
    if (hasContent) blocks.push({ style: 'Body', runs });
    inlineNodes = [];
  };
  const addBlock = (node, style) => {
    const runs = [];
    collectRuns(node, {}, runs);
    const hasContent = runs.some(r => r.br || (r.text && r.text.trim()));
    if (hasContent) blocks.push({ style, runs });
  };
  for (const child of Array.from(doc.body.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) { inlineNodes.push(child); continue; }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName;
    if (tag === 'P' || tag === 'DIV') { flush(); addBlock(child, 'Body'); }
    else if (tag === 'H1') { flush(); addBlock(child, 'Heading1'); }
    else if (tag === 'H2') { flush(); addBlock(child, 'Heading2'); }
    else if (tag === 'H3') { flush(); addBlock(child, 'Heading3'); }
    else if (tag === 'BLOCKQUOTE') { flush(); addBlock(child, 'Quote'); }
    else if (tag === 'HR') { flush(); blocks.push({ hr: true }); }
    else if (tag === 'UL' || tag === 'OL') {
      flush();
      Array.from(child.children).forEach(li => {
        const runs = [];
        collectRuns(li, {}, runs);
        if (runs.some(r => r.br || (r.text && r.text.trim()))) {
          blocks.push({ style: 'Body', runs: [{ text: '· ', ...{} }, ...runs] });
        }
      });
    } else if (tag === 'BR') inlineNodes.push(child);
    else inlineNodes.push(child);
  }
  flush();
  return blocks;
}

function runXml(run) {
  if (run.br) return '<w:r><w:br/></w:r>';
  let props = '';
  if (run.bold) props += '<w:b/>';
  if (run.italic) props += '<w:i/>';
  if (run.underline) props += '<w:u w:val="single"/>';
  if (run.strike) props += '<w:strike/>';
  const text = escapeXml(run.text).replace(/\u00a0/g, ' ');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function paragraphXml(block, { pageBreak = false } = {}) {
  if (block.hr) {
    return `<w:p><w:pPr><w:pStyle w:val="Body"/><w:jc w:val="center"/></w:pPr><w:r><w:t>＊ ＊ ＊</w:t></w:r></w:p>`;
  }
  const runs = (block.runs || []).map(runXml).join('');
  const pPr = `<w:pPr><w:pStyle w:val="${block.style || 'Body'}"/>${pageBreak ? '<w:pageBreakBefore/>' : ''}</w:pPr>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function docxStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
  <w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
    <w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/>
  </w:rPr></w:rPrDefault>
  <w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="0"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:latentStyles w:defLockedState="0" w:defUIPriority="99" w:defSemiHidden="0" w:defUnhideWhenUsed="0" w:defQFormat="0" w:count="1"/>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Body"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/>
  <w:pPr><w:spacing w:before="0" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:firstLineChars="200" w:firstLine="480"/><w:jc w:val="both"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/>
  <w:pPr><w:spacing w:before="2400" w:after="480" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="黑体" w:hAnsi="Arial"/><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
  <w:rPr><w:color w:val="555555"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:spacing w:before="600" w:after="360" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="黑体" w:hAnsi="Arial"/><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:spacing w:before="480" w:after="240" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="1"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="黑体" w:hAnsi="Arial"/><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:spacing w:before="360" w:after="180" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="2"/></w:pPr>
  <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:spacing w:before="120" w:after="120"/><w:ind w:left="480" w:right="480"/><w:jc w:val="both"/></w:pPr>
  <w:rPr><w:i/><w:color w:val="595959"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:spacing w:before="0" w:after="360" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
  <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="TOC2"/>
  <w:pPr><w:spacing w:before="140" w:after="60"/></w:pPr>
  <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="TOC2"/>
  <w:pPr><w:spacing w:before="40" w:after="40"/><w:ind w:left="420"/></w:pPr>
  <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
</w:style>
</w:styles>`;
}

function tocEntriesXml(items) {
  const parts = [];
  let lastVolume = null;
  for (const item of items) {
    if (item.volumeTitle && item.volumeTitle !== lastVolume) {
      lastVolume = item.volumeTitle;
      parts.push(`<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(item.volumeTitle)}</w:t></w:r></w:p>`);
    }
    if (item.chapterTitle) {
      parts.push(`<w:p><w:pPr><w:pStyle w:val="TOC2"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(item.chapterTitle)}</w:t></w:r></w:p>`);
    }
  }
  return parts.join('');
}

export function buildDocx({
  title = '未命名作品', author = '', items = [], wordCount = 0, date = new Date(),
}) {
  const xmlParts = [];
  xmlParts.push('<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t xml:space="preserve">'
    + escapeXml(title) + '</w:t></w:r></w:p>');
  xmlParts.push(`<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r><w:t>${escapeXml(author ? `作者：${author}` : '')}</w:t></w:r></w:p>`);
  xmlParts.push(`<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r><w:t>${wordCount ? `${wordCount.toLocaleString('zh-CN')} 字` : ''}${wordCount ? ' · ' : ''}${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}</w:t></w:r></w:p>`);
  xmlParts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  xmlParts.push('<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t>目录</w:t></w:r></w:p>');
  xmlParts.push(tocEntriesXml(items));
  xmlParts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');

  let lastVolume = null;
  let firstVolume = true;
  for (const item of items) {
    if (item.volumeTitle && item.volumeTitle !== lastVolume) {
      lastVolume = item.volumeTitle;
      const pageBreak = !firstVolume;
      xmlParts.push(paragraphXml({ style: 'Heading1', runs: [{ text: item.volumeTitle }] }, { pageBreak }));
      firstVolume = false;
    }
    if (item.chapterTitle) {
      xmlParts.push(paragraphXml({ style: 'Heading2', runs: [{ text: item.chapterTitle }] }));
    }
    const blocks = blocksFromHtml(item.html || '');
    if (!blocks.length) {
      xmlParts.push('<w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr></w:p>');
    } else {
      blocks.forEach(block => xmlParts.push(paragraphXml(block)));
    }
  }

  const sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1440" w:right="1418" w:bottom="1440" w:left="1418" w:header="720" w:footer="720" w:gutter="0"/>'
    + '<w:cols w:space="720"/><w:docGrid w:linePitch="312"/></w:sectPr>';

  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<w:body>${xmlParts.join('')}${sectPr}</w:body></w:document>`;

  const created = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const coreXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    + 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    + 'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${escapeXml(title)}</dc:title><dc:creator>${escapeXml(author || 'Novie')}</dc:creator>`
    + `<cp:lastModifiedBy>${escapeXml(author || 'Novie')}</cp:lastModifiedBy>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>`
    + `<dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>`
    + '</cp:coreProperties>';

  const appXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
    + 'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    + '<Application>Novie</Application><AppVersion>1.0</AppVersion></Properties>';

  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    + '</Types>';

  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
    + '</Relationships>';

  const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';

  return createZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/styles.xml', data: docxStyles() },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'docProps/core.xml', data: coreXml },
    { name: 'docProps/app.xml', data: appXml },
  ]);
}

/* ============================= 分章打包 ============================= */

export function buildChapterArchive({ items, format = 'txt', encoding = 'utf-8' }) {
  const files = [];
  const missing = new Set();
  items.forEach((item, index) => {
    const seq = String(index + 1).padStart(3, '0');
    const name = `${seq}-${safeFileName(item.chapterTitle || `第${index + 1}章`)}.${format}`;
    let data;
    if (format === 'md') {
      data = buildMarkdown({ items: [item] }).text;
    } else {
      // 必须打包字节流：GBK / 带 BOM 的内容若先转成字符串，会被 ZIP 重新编码成 UTF-8 而失真
      const built = buildTxt({ items: [item], encoding });
      data = built.bytes;
      (built.missing || []).forEach(ch => missing.add(ch));
    }
    files.push({ name, data });
  });
  return { bytes: createZip(files), missing: Array.from(missing) };
}

/* ============================= 打印 / PDF ============================= */

export function buildPrintHtml({
  title = '未命名作品', author = '', items = [], toc = true, indent = true,
}) {
  let lastTocVolume = null;
  const tocRows = items.map((item, i) => {
    const isNewVolume = item.volumeTitle && item.volumeTitle !== lastTocVolume;
    if (isNewVolume) lastTocVolume = item.volumeTitle;
    const vol = isNewVolume ? `<span class="toc-vol">${escapeXml(item.volumeTitle)}</span>` : '<span class="toc-vol"></span>';
    return `<li>${vol}<span class="toc-title">${escapeXml(item.chapterTitle || `第 ${i + 1} 章`)}</span></li>`;
  }).join('');
  let lastVolume = null;
  const content = items.map((item, i) => {
    let volumeHead = '';
    if (item.volumeTitle && item.volumeTitle !== lastVolume) {
      lastVolume = item.volumeTitle;
      volumeHead = `<h1 class="volume-title">${escapeXml(item.volumeTitle)}</h1>`;
    }
    return `<section class="chapter">${volumeHead}<h2>${escapeXml(item.chapterTitle || `第 ${i + 1} 章`)}</h2>
      <div class="body">${sanitizeHtml(item.html || '')}</div></section>`;
  }).join('');

  const style = `
  @page { size: A4; margin: 22mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1e1a16; font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif; font-size: 12pt; line-height: 1.9; }
  .cover { height: 247mm; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; }
  .cover h1 { font-size: 30pt; margin: 0 0 10mm; letter-spacing: .12em; font-family: "Noto Serif SC", "Source Han Serif SC", SimSun, serif; }
  .cover .author { color: #666; font-size: 12pt; }
  .cover .meta { color: #999; font-size: 10pt; margin-top: 18mm; }
  .toc { page-break-after: always; }
  .toc h2 { text-align: center; font-size: 20pt; margin: 0 0 10mm; letter-spacing: .2em; }
  .toc ul { list-style: none; padding: 0; margin: 0; }
  .toc li { display: flex; justify-content: space-between; gap: 6mm; padding: 1.5mm 0; border-bottom: .2mm dotted #ccc; font-size: 10.5pt; }
  .toc-vol { color: #888; font-size: 9pt; }
  .toc-title { flex: 1; text-align: right; }
  .chapter { page-break-before: always; }
  .chapter:first-of-type { page-break-before: auto; }
  .volume-title { text-align: center; font-size: 18pt; margin: 0 0 12mm; padding-bottom: 6mm; border-bottom: .3mm solid #bbb; }
  .chapter h2 { font-size: 16pt; text-align: center; margin: 0 0 8mm; letter-spacing: .05em; }
  .body p, .body div { margin: 0 0 .32em; text-align: justify; ${indent ? 'text-indent: 2em;' : ''} }
  .body blockquote { margin: .5em 2em; color: #555; font-style: italic; }
  .body h1, .body h2, .body h3 { font-size: 14pt; margin: .8em 0 .4em; text-indent: 0; }
  .body hr { border: 0; text-align: center; margin: 1em 0; }
  .body hr:after { content: "＊ ＊ ＊"; color: #999; }
  .body mark.sw-mark { background: #ffe58a; }
  .body strong, .body b { font-weight: 700; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `;

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>${style}</style></head>
  <body>
    <div class="cover"><h1>${escapeXml(title)}</h1><div class="author">${escapeXml(author || '')}</div>
    <div class="meta">Novie 导出 · ${items.length} 章</div></div>
    ${toc && items.length > 1 ? `<div class="toc"><h2>目录</h2><ul>${tocRows}</ul></div>` : ''}
    ${content}
  </body></html>`;
}

/* ============================= 工程备份 / 加密 ============================= */

export function buildProjectJson(bundle) {
  const text = JSON.stringify(bundle, null, 2);
  return { text, bytes: new TextEncoder().encode(text) };
}

const MAGIC = new TextEncoder().encode('NOVIEENC');
const PBKDF2_ITERATIONS = 210000;

async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return concatBytes(MAGIC, salt, iv, ciphertext);
}

export function isEncryptedBackup(bytes) {
  if (!bytes || bytes.length < MAGIC.length) return false;
  return MAGIC.every((b, i) => bytes[i] === b);
}

export async function decryptBackup(bytes, password) {
  if (!isEncryptedBackup(bytes)) throw new Error('不是有效的加密备份文件');
  const salt = bytes.slice(MAGIC.length, MAGIC.length + 16);
  const iv = bytes.slice(MAGIC.length + 16, MAGIC.length + 28);
  const ciphertext = bytes.slice(MAGIC.length + 28);
  const key = await deriveKey(password, salt);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new Error('密码错误，或文件已损坏');
  }
  const text = new TextDecoder().decode(plaintext);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('备份内容不是有效的 JSON');
  }
}

export async function hashPassword(password, saltHex = null) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256
  );
  return { salt: bytesToHex(salt), hash: bytesToHex(new Uint8Array(bits)) };
}

export async function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const { hash } = await hashPassword(password, record.salt);
  if (hash.length !== record.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ record.hash.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

/* ============================= 纯文本导入 ============================= */

const CHAPTER_HEADING_RE = /^[ \t　]*(第[0-9零一二三四五六七八九十百千万两〇]+[章节回卷集][^\n]{0,50}|序章[^\n]{0,30}|楔子[^\n]{0,30}|尾声[^\n]{0,30}|后记[^\n]{0,30}|番外[^\n]{0,30})[ \t　]*$/gm;

export function splitPlainText(text) {
  const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const matches = Array.from(normalized.matchAll(CHAPTER_HEADING_RE));
  if (!matches.length) return null;
  const chapters = [];
  if (matches[0].index > 0) {
    const preface = normalized.slice(0, matches[0].index).trim();
    if (preface) chapters.push({ title: '前言', content: preface });
  }
  matches.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : normalized.length;
    const content = normalized.slice(start, end).trim();
    chapters.push({ title: m[1].trim(), content });
  });
  return chapters;
}
