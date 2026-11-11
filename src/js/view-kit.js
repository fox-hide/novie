/* Novie — 页面布局小工具 */

import { el } from './ui.js';

export function makePage({ title = '', subtitle = '', actions = [], className = '' } = {}) {
  const page = el('div', { class: `page ${className}`.trim() });
  const head = el('div', { class: 'page-head' });
  const left = el('div', { class: 'page-title-box' });
  left.appendChild(el('h1', { class: 'page-title', text: title }));
  if (subtitle) left.appendChild(el('p', { class: 'page-sub', text: subtitle }));
  head.appendChild(left);
  if (actions.length) {
    const right = el('div', { class: 'page-actions' });
    actions.forEach(a => right.appendChild(a));
    head.appendChild(right);
  }
  const body = el('div', { class: 'page-body' });
  page.appendChild(head);
  page.appendChild(body);
  return { page, head, body };
}

export function statTile(label, value, hint = '') {
  return el('div', { class: 'stat-tile' }, [
    el('span', { class: 'stat-label', text: label }),
    el('strong', { class: 'stat-value', text: value }),
    hint ? el('span', { class: 'stat-hint', text: hint }) : null,
  ]);
}

export function toolbarRow(children = []) {
  return el('div', { class: 'toolbar-row' }, children);
}

export function sectionBox(title, actions = []) {
  const box = el('div', { class: 'section-box' });
  const head = el('div', { class: 'section-head' }, [
    el('h2', { class: 'section-title', text: title }),
  ]);
  if (actions.length) {
    const right = el('div', { class: 'section-actions' });
    actions.forEach(a => right.appendChild(a));
    head.appendChild(right);
  }
  box.appendChild(head);
  return box;
}
