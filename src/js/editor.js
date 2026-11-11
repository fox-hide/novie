/* Novie — 轻量富文本编辑器（contenteditable + 纯文本粘贴 + 打字机/小黑屋支持） */

import { sanitizeHtml, countChars, escapeHtml, replaceInHtml, debounce } from './utils.js';

const ALLOWED_ATTRS = new Set([]);

export function cleanContentHtml(html) {
  const clean = sanitizeHtml(html || '');
  const container = document.createElement('div');
  container.innerHTML = clean;
  // 去掉全部属性
  container.querySelectorAll('*').forEach(node => {
    Array.from(node.attributes).forEach(attr => {
      if (!ALLOWED_ATTRS.has(attr.name)) node.removeAttribute(attr.name);
    });
  });
  // 顶层 div 统一成段落；嵌套 div 拆平
  container.querySelectorAll('div').forEach(div => {
    if (div.parentElement === container) {
      const p = document.createElement('p');
      while (div.firstChild) p.appendChild(div.firstChild);
      div.replaceWith(p);
    } else {
      div.replaceWith(...Array.from(div.childNodes));
    }
  });
  container.querySelectorAll('span,mark').forEach(node => node.replaceWith(...Array.from(node.childNodes)));
  // 去掉空段落，只保留有内容的
  container.querySelectorAll('p,h1,h2,h3,blockquote').forEach(node => {
    if (!node.textContent.replace(/\u200b/g, '').trim() && !node.querySelector('br,hr')) node.remove();
  });
  const result = container.innerHTML.trim();
  if (!result || !container.textContent.replace(/\u200b/g, '').trim()) return '';
  return result;
}

export class Editor {
  constructor({
    root, scrollRoot, onChange = null, onActivity = null, getSnippets = null,
    onSelectText = null, onKey = null,
  }) {
    this.root = root;
    this.scrollRoot = scrollRoot || root.parentElement;
    this.onChange = onChange;
    this.onActivity = onActivity;
    this.getSnippets = getSnippets;
    this.onSelectText = onSelectText;
    this.onKey = onKey;
    this.typewriter = false;
    this.lastSelection = null;
    this._selectionTimer = null;
    this._typewriterTimer = null;
    this._disposed = false;
    // 应用级撤销栈：只记录程序性改写（替换/排版/拆章等 innerHTML 覆盖），
    // 打字撤销仍走浏览器原生栈；程序性改写会清空原生栈，由这里兜底
    this._undoStack = [];
    this._redoStack = [];
    this._pendingProgrammatic = false;
    this._restoredFromProgrammatic = false;

    this._onInput = () => {
      this._pendingProgrammatic = false;
      this._restoredFromProgrammatic = false;
      this.updateEmptyState();
      this.emitChange();
      if (this.typewriter) this.scrollCaretToCenter();
    };
    this._onPaste = e => {
      const text = e.clipboardData?.getData('text/plain');
      if (text === undefined) return;
      e.preventDefault();
      this.insertPlainText(text);
    };
    this._onDrop = e => {
      const text = e.dataTransfer?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      this.insertPlainText(text);
    };
    this._onDragOver = e => {
      if (e.dataTransfer?.types?.includes('text/plain')) e.preventDefault();
    };
    this._onKeyDown = e => {
      if (this.onKey) this.onKey(e);
      if (e.key === 'Tab' && !e.shiftKey && this.getSnippets) {
        if (this.expandSnippet()) e.preventDefault();
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (this._pendingProgrammatic && this._undoStack.length) {
          e.preventDefault();
          this.undo();
        }
        return;
      }
      if (mod && !e.altKey && ((e.key === 'y' || e.key === 'Y')
        || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        if (this._restoredFromProgrammatic && this._redoStack.length) {
          e.preventDefault();
          this.redo();
        }
      }
    };
    this._onSelectionChange = () => {
      if (document.activeElement !== this.root) return;
      if (this.typewriter) {
        clearTimeout(this._typewriterTimer);
        this._typewriterTimer = setTimeout(() => this.scrollCaretToCenter(), 40);
      }
      if (this.onSelectText) {
        clearTimeout(this._selectionTimer);
        this._selectionTimer = setTimeout(() => {
          const text = this.getSelectionText().trim();
          if (text && text.length <= 8) this.onSelectText(text);
        }, 420);
      }
    };

    root.addEventListener('input', this._onInput);
    root.addEventListener('paste', this._onPaste);
    root.addEventListener('drop', this._onDrop);
    root.addEventListener('dragover', this._onDragOver);
    root.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('selectionchange', this._onSelectionChange);
  }

  destroy() {
    this._disposed = true;
    this.root.removeEventListener('input', this._onInput);
    this.root.removeEventListener('paste', this._onPaste);
    this.root.removeEventListener('drop', this._onDrop);
    this.root.removeEventListener('dragover', this._onDragOver);
    this.root.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('selectionchange', this._onSelectionChange);
    clearTimeout(this._selectionTimer);
    clearTimeout(this._typewriterTimer);
    this._undoStack.length = 0;
    this._redoStack.length = 0;
  }

  /** 在程序性覆盖 DOM 前调用，保存可撤销的状态。 */
  _pushProgrammatic(html = this.root.innerHTML) {
    this._undoStack.push({ html, scrollTop: this.scrollRoot ? this.scrollRoot.scrollTop : 0 });
    if (this._undoStack.length > 60) this._undoStack.shift();
    this._redoStack.length = 0;
    this._pendingProgrammatic = true;
    this._restoredFromProgrammatic = false;
  }

  _restoreEntry(entry) {
    this.root.innerHTML = entry.html;
    if (this.scrollRoot && entry.scrollTop != null) this.scrollRoot.scrollTop = entry.scrollTop;
    this.updateEmptyState();
    this.emitChange();
  }

  /** 撤销：优先回退最近一次程序性改写，否则走浏览器原生撤销（打字）。 */
  undo() {
    if (this._pendingProgrammatic && this._undoStack.length) {
      const entry = this._undoStack.pop();
      this._redoStack.push({ html: this.root.innerHTML, scrollTop: this.scrollRoot ? this.scrollRoot.scrollTop : 0 });
      this._restoreEntry(entry);
      this._pendingProgrammatic = this._undoStack.length > 0;
      this._restoredFromProgrammatic = true;
      return true;
    }
    this.exec('undo');
    return false;
  }

  /** 重做：程序性改写与原生重做按来源分别路由。 */
  redo() {
    if (this._restoredFromProgrammatic && this._redoStack.length) {
      const entry = this._redoStack.pop();
      this._undoStack.push({ html: this.root.innerHTML, scrollTop: this.scrollRoot ? this.scrollRoot.scrollTop : 0 });
      this._restoreEntry(entry);
      this._pendingProgrammatic = this._undoStack.length > 0;
      this._restoredFromProgrammatic = this._redoStack.length > 0;
      return true;
    }
    this.exec('redo');
    return false;
  }

  setContent(html, { silent = true } = {}) {
    this.root.innerHTML = sanitizeHtml(html || '');
    this.updateEmptyState();
    if (!silent) this.emitChange();
  }

  updateEmptyState() {
    const has = this.root.textContent.replace(/\u200b/g, '').trim().length > 0
      || Boolean(this.root.querySelector('hr,blockquote'));
    this.root.dataset.empty = has ? 'false' : 'true';
  }

  getText() {
    return (this.root.innerText || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  getCounts() {
    const text = this.getText();
    const chars = countChars(text, false);
    return {
      chars,
      charsNoPunct: countChars(text, true),
      paragraphs: text ? text.split(/\n{2,}/).filter(Boolean).length : 0,
    };
  }

  getHtml() {
    return cleanContentHtml(this.root.innerHTML);
  }

  emitChange() {
    if (this.onChange) this.onChange(this.getCounts());
  }

  focus() { this.root.focus(); }

  isFocused() { return document.activeElement === this.root; }

  exec(command, value = null) {
    this.root.focus();
    try {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(command, false, value);
    } catch (err) {
      console.warn('execCommand failed', command, err);
    }
    this.emitChange();
  }

  insertPlainText(text) {
    if (!text) return;
    this.root.focus();
    const html = String(text)
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => escapeHtml(line))
      .join('<br>');
    document.execCommand('insertHTML', false, html);
    this.emitChange();
  }

  insertHtml(html) {
    this.root.focus();
    document.execCommand('insertHTML', false, html);
    this.emitChange();
  }

  insertText(text) {
    this.insertPlainText(text);
  }

  selectText(query, occurrence = 0, caseSensitive = false) {
    if (!query) return false;
    const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT);
    let node;
    let count = 0;
    while ((node = walker.nextNode())) {
      const source = node.nodeValue || '';
      const hay = caseSensitive ? source : source.toLowerCase();
      const needle = caseSensitive ? query : query.toLowerCase();
      let idx = 0;
      while (true) {
        const found = hay.indexOf(needle, idx);
        if (found < 0) break;
        if (count === occurrence) {
          const range = document.createRange();
          range.setStart(node, found);
          range.setEnd(node, found + query.length);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          this.scrollRangeIntoView(range);
          return true;
        }
        count++;
        idx = found + Math.max(1, needle.length);
      }
    }
    return false;
  }

  scrollRangeIntoView(range) {
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height && !rect.top)) return;
    const scrollRect = this.scrollRoot.getBoundingClientRect();
    if (rect.top < scrollRect.top + 80 || rect.bottom > scrollRect.bottom - 80) {
      this.scrollRoot.scrollTop += rect.top - scrollRect.top - scrollRect.height / 2;
    }
  }

  scrollCaretToCenter() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0).cloneRange();
    if (!this.root.contains(range.startContainer)) return;
    let rect = range.getBoundingClientRect();
    if (!rect || (!rect.height && !rect.top)) {
      const span = document.createElement('span');
      span.textContent = '\u200b';
      range.insertNode(span);
      rect = span.getBoundingClientRect();
      span.remove();
    }
    if (!rect || !this.scrollRoot) return;
    const sr = this.scrollRoot.getBoundingClientRect();
    const target = sr.top + sr.height * 0.46;
    const delta = rect.top - target;
    if (Math.abs(delta) > 10) this.scrollRoot.scrollTop += delta;
  }

  setTypewriter(enabled) {
    this.typewriter = Boolean(enabled);
    if (enabled) setTimeout(() => this.scrollCaretToCenter(), 60);
  }

  clearSensitiveMarks() {
    this.root.querySelectorAll('mark.sw-mark').forEach(mark => {
      mark.replaceWith(...Array.from(mark.childNodes));
    });
    this.root.normalize();
  }

  markSensitive(words = []) {
    this.clearSensitiveMarks();
    const list = Array.from(new Set(words.map(w => String(w).trim()).filter(w => w.length >= 1)))
      .sort((a, b) => b.length - a.length);
    if (!list.length) return { total: 0, byWord: [] };
    const escaped = list.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    let regex;
    try {
      regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    } catch {
      return { total: 0, byWord: [] };
    }
    const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => (node.parentElement && node.parentElement.closest('mark.sw-mark'))
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    const counts = new Map();
    let total = 0;
    for (const textNode of nodes) {
      const text = textNode.nodeValue;
      if (!text || !text.trim()) continue;
      regex.lastIndex = 0;
      if (!regex.test(text)) continue;
      regex.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
        const mark = document.createElement('mark');
        mark.className = 'sw-mark';
        mark.textContent = match[0];
        frag.appendChild(mark);
        counts.set(match[0], (counts.get(match[0]) || 0) + 1);
        total++;
        last = match.index + match[0].length;
        if (match[0].length === 0) regex.lastIndex++;
        if (total > 3000) break;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.replaceWith(frag);
      if (total > 3000) break;
    }
    return {
      total,
      byWord: Array.from(counts.entries())
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)),
    };
  }

  replaceAll(search, replacement, caseSensitive = true) {
    if (!search) return 0;
    const current = this.root.innerHTML;
    const { html, count } = replaceInHtml(current, search, replacement, true, caseSensitive);
    if (!count) return 0;
    this._pushProgrammatic(current);
    const scroll = this.scrollRoot.scrollTop;
    this.root.innerHTML = html;
    this.clearSensitiveMarks();
    this.updateEmptyState();
    this.emitChange();
    this.scrollRoot.scrollTop = scroll;
    return count;
  }

  getSelectionText() {
    const sel = window.getSelection();
    return sel ? sel.toString() : '';
  }

  /**
   * 一键网文排版：
   * - 去掉段首/段尾多余空格与全角空格（首行缩进交给 CSS / 导出样式）
   * - 中文段落里的英文直引号成对转成中文弯引号
   * - 清理空段落
   * 不改动加粗、引用等已有排版。
   */
  smartTypeset() {
    const holder = this.root;
    const beforeHtml = holder.innerHTML;
    let changed = 0;
    let removed = 0;
    const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI']);

    const trimEdgeWhitespace = element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const texts = [];
      let n;
      while ((n = walker.nextNode())) texts.push(n);
      if (!texts.length) return;
      const first = texts[0];
      const last = texts[texts.length - 1];
      const beforeFirst = first.nodeValue;
      first.nodeValue = first.nodeValue.replace(/^[\s\u3000\u00a0]+/, '');
      if (first === last) {
        last.nodeValue = last.nodeValue.replace(/[\s\u3000\u00a0]+$/, '');
      } else {
        const beforeLast = last.nodeValue;
        last.nodeValue = last.nodeValue.replace(/[\s\u3000\u00a0]+$/, '');
        if (beforeLast !== last.nodeValue) changed++;
      }
      if (beforeFirst !== first.nodeValue) changed++;
    };

    const fixQuotes = element => {
      if (!/[\u4e00-\u9fff]/.test(element.textContent || '')) return;
      let open = true;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.nodeValue.includes('"')) continue;
        const replaced = n.nodeValue.replace(/"/g, () => {
          const q = open ? '“' : '”';
          open = !open;
          return q;
        });
        if (replaced !== n.nodeValue) {
          n.nodeValue = replaced;
          changed++;
        }
      }
    };

    const processBlock = el => {
      trimEdgeWhitespace(el);
      fixQuotes(el);
      const hasText = (el.textContent || '').replace(/\u200b/g, '').trim();
      if (!hasText && !el.querySelector('br,hr')) {
        el.remove();
        removed++;
      }
    };

    for (const child of Array.from(holder.children)) {
      if (BLOCKS.has(child.tagName)) {
        if (child.tagName === 'DIV' && Array.from(child.children).some(c => BLOCKS.has(c.tagName))) {
          // 嵌套结构交给子元素处理，避免父级重复修剪
          continue;
        }
        processBlock(child);
      } else if (child.tagName === 'UL' || child.tagName === 'OL') {
        Array.from(child.children).forEach(li => {
          if (li.tagName === 'LI') processBlock(li);
        });
      }
    }
    holder.normalize();
    this.updateEmptyState();
    if (changed || removed) {
      this._pushProgrammatic(beforeHtml);
      this.emitChange();
    }
    return { changed, removed };
  }

  splitAtCaret() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!this.root.contains(range.startContainer)) return null;
    const afterRange = range.cloneRange();
    afterRange.selectNodeContents(this.root);
    afterRange.setStart(range.endContainer, range.endOffset);
    this._pushProgrammatic();
    const frag = afterRange.extractContents();
    const holder = document.createElement('div');
    holder.appendChild(frag);
    const before = cleanContentHtml(this.root.innerHTML);
    const after = cleanContentHtml(holder.innerHTML);
    this.root.innerHTML = before;
    this.updateEmptyState();
    this.emitChange();
    return { before, after };
  }

  expandSnippet() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    const before = (node.nodeValue || '').slice(0, range.startOffset);
    const snippets = this.getSnippets() || [];
    const hit = snippets.find(s => s.trigger && before.endsWith(s.trigger)
      && (before.length === s.trigger.length || /\s/.test(before[before.length - s.trigger.length - 1])));
    if (!hit) return false;
    const start = range.startOffset - hit.trigger.length;
    const replaceRange = document.createRange();
    replaceRange.setStart(node, start);
    replaceRange.setEnd(node, range.startOffset);
    sel.removeAllRanges();
    sel.addRange(replaceRange);
    this.insertPlainText(hit.content || '');
    return true;
  }

  destroySelectionListener() { /* kept for API symmetry */ }
}
