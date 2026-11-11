/* Novie — 人物关系星图（Canvas 2D，3D 球面投影 / 2D 弹簧引力双模式） */

import { el, icon, makeButton, makeIconButton } from './ui.js';
import { clamp, truncate } from './utils.js';

const FACTION_COLORS = {
  core: '#38BDF8',
  lead: '#F472B6',
  group: '#34D399',
  ally: '#FBBF24',
  enemy: '#F87171',
  neutral: '#94A3B8',
};

const FACTION_LABELS = {
  core: '主角',
  lead: '女主',
  group: '同伴 / 团队',
  ally: '师长 / 盟友',
  enemy: '敌对',
  neutral: '其他',
};

export const REL_TYPES = {
  love: { label: '挚爱', color: '#F472B6', width: 2.1, dash: [], double: true },
  kin: { label: '血脉 / 师徒', color: '#FBBF24', width: 1.8, dash: [], double: false },
  bond: { label: '伙伴', color: '#34D399', width: 1.4, dash: [6, 4, 2, 4], double: false },
  enemy: { label: '宿敌', color: '#F87171', width: 1.8, dash: [5, 4], double: false },
  other: { label: '其他', color: '#94A3B8', width: 1.2, dash: [2, 4], double: false },
};

const REL_ORDER = ['love', 'kin', 'bond', 'enemy', 'other'];

function factionOf(character) {
  const role = character.role || '';
  const tags = (character.tags || []).join(' ');
  if (role.includes('主角')) return 'core';
  if (role.includes('女主')) return 'lead';
  if (role.includes('反派') || /对手|宿敌/.test(tags)) return 'enemy';
  if (/老师|导师|院长|父亲|师父|师傅|前辈/.test(tags)) return 'ally';
  if (/队友|同伴|室友|朋友|同学|伙伴/.test(tags)) return 'group';
  return 'neutral';
}

function inferRelationType(labels) {
  const text = labels.join(' ');
  if (/恋人|挚爱|夫妻|喜欢|伴侣|旧约|爱/.test(text)) return 'love';
  if (/父子|母子|师徒|师生|祖孙|传承|义母/.test(text)) return 'kin';
  if (/仇|宿敌|死敌|对手|冲突|敌对/.test(text)) return 'enemy';
  if (/兄弟|队友|同伴|损友|室友|老友|同事|七舍|盟友|伙伴/.test(text)) return 'bond';
  return 'other';
}

function baseSize(role = '') {
  if (role.includes('主角')) return 20;
  if (role.includes('女主')) return 16;
  if (role.includes('反派')) return 14;
  if (role.includes('配角')) return 13;
  return 10;
}

function buildGraph(characters) {
  const byId = new Map(characters.map(c => [c.id, c]));
  const nodes = characters.map(c => {
    const faction = factionOf(c);
    return {
      id: c.id,
      name: c.name || '未命名',
      role: c.role || '人物',
      identity: c.identity || '',
      color: FACTION_COLORS[faction],
      faction,
      character: c,
      size: baseSize(c.role),
      degree: 0,
    };
  });
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const edgeMap = new Map();
  for (const character of characters) {
    for (const rel of character.relations || []) {
      const target = byId.get(rel.targetId);
      if (!target || target.id === character.id) continue;
      const key = [character.id, rel.targetId].sort().join('|');
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          a: character.id < rel.targetId ? character.id : rel.targetId,
          b: character.id < rel.targetId ? rel.targetId : character.id,
          labels: [],
          type: 'other',
        });
      }
      const edge = edgeMap.get(key);
      const label = String(rel.label || '').trim();
      if (label && !edge.labels.includes(label)) edge.labels.push(label);
    }
  }
  const edges = Array.from(edgeMap.values()).map(edge => {
    edge.type = inferRelationType(edge.labels);
    nodeMap.get(edge.a).degree++;
    nodeMap.get(edge.b).degree++;
    return edge;
  });
  for (const node of nodes) node.size = node.size + Math.min(6, node.degree * 0.7);
  return { nodes, edges, nodeMap };
}

function hexToRgba(hex, alpha) {
  const value = String(hex || '#94A3B8').replace('#', '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function relationLabel(edge) {
  return edge.labels.join(' / ') || REL_TYPES[edge.type].label;
}

class StarMap {
  constructor(canvas, graph, { onSelect, onAutoChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.graph = graph;
    this.onSelect = onSelect || (() => {});
    this.onAutoChange = onAutoChange || (() => {});
    this.nodes = graph.nodes.map((node, i) => {
      const count = graph.nodes.length;
      const y = count > 1 ? 1 - (i / (count - 1)) * 2 : 0;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = Math.PI * (3 - Math.sqrt(5)) * i;
      const angle = (Math.PI * 2 * i) / Math.max(1, count);
      const radius = i === 0 ? 0 : 115 + (i % 4) * 38;
      return {
        ...node,
        sx: Math.cos(theta) * ring,
        sy: y,
        sz: Math.sin(theta) * ring,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        screenX: 0,
        screenY: 0,
        scale: 1,
        depth: 0,
      };
    });
    this.nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    this.mode = '3d';
    this.filter = 'all';
    this.selectedId = this.nodes[0]?.id || null;
    this.hoverId = null;
    this.zoom = 1;
    this.targetZoom = 1;
    this.rotX = 0.25;
    this.rotY = -0.4;
    this.targetRotX = this.rotX;
    this.targetRotY = this.rotY;
    this.autoAlign = false;
    this.autoRotate = false;
    this.showLabels = false;
    this.dragging = null;
    this.dragNode = null;
    this.pointerDown = false;
    this.lastPointer = { x: 0, y: 0 };
    this.panX = 0;
    this.panY = 0;
    this.targetPanX = 0;
    this.targetPanY = 0;
    this.phase = 0;
    this.lastTime = 0;
    this.raf = null;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.stopped = false;
    this.bgStars = [];

    this._loop = this._loop.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onDoubleClick = this._onDoubleClick.bind(this);
    this._onResize = this._onResize.bind(this);

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointerleave', this._onPointerLeave);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('dblclick', this._onDoubleClick);
    this.resizeObserver = new ResizeObserver(this._onResize);
    this.resizeObserver.observe(canvas.parentElement || canvas);
  }

  init() {
    if (this.inited || this.stopped) return;
    this._resize();
    if (!this.w || !this.h) {
      if (this.canvas.isConnected) setTimeout(() => this.init(), 80);
      return;
    }
    this.inited = true;
    this.select(this.selectedId, { center: true, immediate: true });
    this._project();
    this._draw();
    this.raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.stopped = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }

  _onResize() {
    this._resize();
  }

  _resize() {
    if (!this.canvas.isConnected) return;
    const parent = this.canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(0, rect.width);
    const h = Math.max(0, rect.height);
    if (!w || !h) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.bgStars = Array.from({ length: 170 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.5 + Math.random() * 1.6,
      a: 0.18 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
    }));
    this._project();
  }

  setMode(mode) {
    if (mode !== '3d' && mode !== '2d') return;
    this.mode = mode;
    this.autoAlign = false;
    this.autoRotate = false;
    this.targetZoom = 1;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.targetPanX = 0;
    this.targetPanY = 0;
    if (mode === '3d') {
      this.centerNode(this.selectedId, { immediate: true });
    } else {
      this._center2D(this.selectedId, true);
    }
    this.onAutoChange(false);
    this._project();
  }

  setFilter(type) {
    this.filter = type || 'all';
  }

  select(id, { center = false, immediate = false } = {}) {
    if (!this.nodeMap.has(id)) return;
    this.selectedId = id;
    if (center) this.centerNode(id, { immediate });
    this.onSelect(id);
  }

  centerNode(id, { immediate = false } = {}) {
    const node = this.nodeMap.get(id);
    if (!node) return;
    if (this.mode === '3d') {
      const r = Math.hypot(node.sx, node.sy, node.sz) || 1;
      this.targetRotY = Math.atan2(node.sx, node.sz);
      this.targetRotX = -Math.asin(clamp(node.sy / r, -1, 1));
      if (immediate) {
        this.rotX = this.targetRotX;
        this.rotY = this.targetRotY;
        this.autoAlign = false;
      } else {
        this.autoAlign = true;
      }
      this.autoRotate = false;
      this.onAutoChange(false);
    } else {
      this._center2D(id, immediate);
    }
  }

  _center2D(id, immediate = false) {
    const node = this.nodeMap.get(id);
    if (!node) return;
    this.targetPanX = -node.x;
    this.targetPanY = -node.y;
    if (immediate) {
      this.panX = this.targetPanX;
      this.panY = this.targetPanY;
    }
  }

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    if (this.autoRotate) this.autoAlign = false;
    this.onAutoChange(this.autoRotate);
  }

  zoomBy(factor) {
    this.targetZoom = clamp(this.targetZoom * factor, 0.55, 2.4);
  }

  resetView() {
    this.zoom = 1;
    this.targetZoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.targetPanX = 0;
    this.targetPanY = 0;
    this.autoRotate = false;
    this.autoAlign = false;
    this.rotX = 0.25;
    this.rotY = -0.4;
    this.onAutoChange(false);
  }

  _loop(time) {
    if (this.stopped) return;
    if (!this.canvas.isConnected) {
      this.stop();
      return;
    }
    if (!this.w || !this.h) {
      this.raf = requestAnimationFrame(this._loop);
      return;
    }
    const dt = this.lastTime ? Math.min(2.2, (time - this.lastTime) / 16.667) : 1;
    this.lastTime = time;
    this.phase = (this.phase + 0.006 * dt) % 1;
    this.zoom += (this.targetZoom - this.zoom) * 0.14;
    if (this.mode === '3d') {
      if (this.autoAlign) {
        const dx = this.targetRotX - this.rotX;
        const dy = this.targetRotY - this.rotY;
        this.rotX += dx * 0.1 * dt;
        this.rotY += dy * 0.1 * dt;
        if (Math.abs(dx) < 0.003 && Math.abs(dy) < 0.003) {
          this.rotX = this.targetRotX;
          this.rotY = this.targetRotY;
          this.autoAlign = false;
        }
      } else if (this.autoRotate && !this.pointerDown && !this.hoverId) {
        this.rotY += 0.0018 * dt;
      }
    } else {
      this._step2D();
      this.panX += (this.targetPanX - this.panX) * 0.1 * dt;
      this.panY += (this.targetPanY - this.panY) * 0.1 * dt;
    }
    this._project();
    this._draw();
    this.raf = requestAnimationFrame(this._loop);
  }

  _step2D() {
    const nodes = this.nodes;
    const repulsion = 6200;
    const springLength = 145;
    const springK = 0.022;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy + 30;
        const force = repulsion / distSq;
        const dist = Math.sqrt(distSq);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    for (const edge of this.graph.edges) {
      const a = this.nodeMap.get(edge.a);
      const b = this.nodeMap.get(edge.b);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
      const force = (dist - springLength) * springK;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    for (const node of nodes) {
      if (this.dragNode === node.id) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x = clamp(node.x + node.vx, -520, 520);
      node.y = clamp(node.y + node.vy, -380, 380);
    }
  }

  _project() {
    const w = this.w;
    const h = this.h;
    const cx = w / 2;
    const cy = h / 2;
    if (this.mode === '3d') {
      const radius = Math.min(w, h) * 0.43;
      const cosX = Math.cos(this.rotX);
      const sinX = Math.sin(this.rotX);
      const cosY = Math.cos(this.rotY);
      const sinY = Math.sin(this.rotY);
      for (const node of this.nodes) {
        const x1 = node.sx * cosY + node.sz * sinY;
        const z1 = -node.sx * sinY + node.sz * cosY;
        const y2 = node.sy * cosX - z1 * sinX;
        const z2 = node.sy * sinX + z1 * cosX;
        const perspective = 1 / (1 - z2 * 0.32);
        node.screenX = cx + x1 * radius * perspective * this.zoom;
        node.screenY = cy + y2 * radius * perspective * this.zoom;
        node.scale = perspective * this.zoom;
        node.depth = z2;
      }
    } else {
      for (const node of this.nodes) {
        node.screenX = cx + (node.x + this.panX) * this.zoom;
        node.screenY = cy + (node.y + this.panY) * this.zoom;
        node.scale = this.zoom;
        node.depth = 0;
      }
    }
  }

  _hitTest(x, y) {
    const sorted = [...this.nodes].sort((a, b) => b.depth - a.depth);
    for (const node of sorted) {
      const radius = Math.max(9, node.size * 0.76 * node.scale * 1.25);
      if (Math.hypot(x - node.screenX, y - node.screenY) <= radius) return node;
    }
    return null;
  }

  _onPointerDown(event) {
    if (event.button !== 0) return;
    try { this.canvas.setPointerCapture?.(event.pointerId); } catch { /* 合成事件/触控环境可能没有活动 pointer */ }
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.lastPointer = { x, y };
    this.pointerDown = true;
    const hit = this._hitTest(x, y);
    if (hit) {
      this.select(hit.id);
      if (this.mode === '2d') this.dragNode = hit.id;
      else this.dragging = 'rotate';
    } else {
      this.dragging = this.mode === '3d' ? 'rotate' : 'pan';
    }
    this.canvas.classList.add('dragging');
  }

  _onPointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!this.pointerDown) {
      const hit = this._hitTest(x, y);
      this.hoverId = hit ? hit.id : null;
      this.canvas.style.cursor = hit ? 'pointer' : 'grab';
      return;
    }
    const dx = x - this.lastPointer.x;
    const dy = y - this.lastPointer.y;
    this.lastPointer = { x, y };
    if (this.mode === '3d') {
      this.rotY += dx * 0.006;
      this.rotX = clamp(this.rotX - dy * 0.006, -1.42, 1.42);
      this.autoAlign = false;
    } else if (this.dragNode) {
      const node = this.nodeMap.get(this.dragNode);
      if (node) {
        node.x += dx / this.zoom;
        node.y += dy / this.zoom;
        node.vx = 0;
        node.vy = 0;
        this.targetPanX = this.panX;
        this.targetPanY = this.panY;
      }
    } else if (this.dragging === 'pan') {
      this.panX += dx / this.zoom;
      this.panY += dy / this.zoom;
      this.targetPanX = this.panX;
      this.targetPanY = this.panY;
    }
  }

  _onPointerUp() {
    this.pointerDown = false;
    this.dragging = null;
    this.dragNode = null;
    this.canvas.classList.remove('dragging');
  }

  _onPointerLeave() {
    if (!this.pointerDown) this.hoverId = null;
  }

  _onWheel(event) {
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 1.12 : 0.89);
  }

  _onDoubleClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const hit = this._hitTest(event.clientX - rect.left, event.clientY - rect.top);
    if (!hit) return;
    this.select(hit.id);
    this.centerNode(hit.id);
  }

  _visibleEdges() {
    return this.graph.edges.filter(edge => this.filter === 'all' || edge.type === this.filter);
  }

  _draw() {
    if (!this.ctx || !this.w || !this.h) return;
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.clearRect(0, 0, w, h);
    this._drawBackground(ctx, w, h);
    this._project();
    const visibleEdges = this._visibleEdges();
    const focus = this.nodeMap.get(this.selectedId);
    const neighbors = new Set();
    if (focus) {
      neighbors.add(focus.id);
      visibleEdges.forEach(edge => {
        if (edge.a === focus.id) neighbors.add(edge.b);
        if (edge.b === focus.id) neighbors.add(edge.a);
      });
    }
    this._labelRects = [];
    this._drawEdges(ctx, visibleEdges, focus, neighbors);
    this._drawNodes(ctx, focus, neighbors);
    this._drawHoverTip(ctx);
  }

  _drawBackground(ctx, w, h) {
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.78);
    bg.addColorStop(0, '#0c1729');
    bg.addColorStop(0.52, '#070d18');
    bg.addColorStop(1, '#02040a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const nebula = (x, y, r, color) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };
    nebula(w * 0.18, h * 0.2, Math.max(w, h) * 0.5, 'rgba(56,189,248,0.075)');
    nebula(w * 0.82, h * 0.76, Math.max(w, h) * 0.55, 'rgba(244,114,182,0.055)');
    nebula(w * 0.66, h * 0.18, Math.max(w, h) * 0.35, 'rgba(52,211,153,0.04)');

    for (const star of this.bgStars) {
      const twinkle = 0.35 + 0.65 * Math.sin(this.phase * Math.PI * 2 + star.phase);
      ctx.globalAlpha = star.a * twinkle;
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 7]);
    if (this.mode === '3d') {
      const r = Math.min(w, h) * 0.37 * this.zoom;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.18, r * 0.42, this.rotX * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.68, r * 0.9, -this.rotY * 0.12, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      [110, 210, 315].forEach(r => {
        ctx.beginPath();
        ctx.arc(cx, cy, r * this.zoom, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  _drawEdges(ctx, edges, focus, neighbors) {
    for (const edge of edges) {
      const a = this.nodeMap.get(edge.a);
      const b = this.nodeMap.get(edge.b);
      if (!a || !b) continue;
      const style = REL_TYPES[edge.type] || REL_TYPES.other;
      const isFocus = Boolean(focus && (edge.a === focus.id || edge.b === focus.id));
      const avgDepth = this.mode === '3d' ? (a.depth + b.depth) / 2 : 0;
      const depthAlpha = this.mode === '3d' ? 0.42 + ((avgDepth + 1) / 2) * 0.58 : 1;
      let alpha = 0.48 * depthAlpha;
      let width = style.width;
      if (focus) {
        alpha = isFocus ? 0.94 * depthAlpha : 0.08 * depthAlpha;
        width = isFocus ? style.width * 1.18 : style.width * 0.75;
      }
      if (edge.type === 'enemy' && isFocus) {
        alpha *= 0.8 + 0.2 * Math.sin(this.phase * Math.PI * 8);
      }
      const p1 = { x: a.screenX, y: a.screenY };
      const p2 = { x: b.screenX, y: b.screenY };
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.hypot(dx, dy);
      if (length < 1) continue;
      const nx = -dy / length;
      const ny = dx / length;
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const ctrl = {
        x: mid.x + nx * Math.min(70, length * 0.12),
        y: mid.y + ny * Math.min(70, length * 0.12),
      };
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = width;
      ctx.setLineDash(style.dash);
      ctx.lineCap = 'round';
      const drawCurve = (offset = 0) => {
        ctx.beginPath();
        ctx.moveTo(p1.x + nx * offset, p1.y + ny * offset);
        ctx.quadraticCurveTo(ctrl.x + nx * offset, ctrl.y + ny * offset, p2.x + nx * offset, p2.y + ny * offset);
        ctx.stroke();
      };
      if (style.double) {
        drawCurve(2.2);
        drawCurve(-2.2);
      } else {
        drawCurve(0);
      }
      ctx.setLineDash([]);
      ctx.restore();

      if (isFocus) {
        this._drawEdgeParticles(ctx, p1, ctrl, p2, style, edge.type);
      }
      const labelTarget = this.hoverId || (this.showLabels ? this.selectedId : null);
      const showLabel = labelTarget && (edge.a === labelTarget || edge.b === labelTarget);
      if (showLabel) this._drawEdgeLabel(ctx, p1, ctrl, p2, edge, style, alpha);
    }
  }

  _drawEdgeParticles(ctx, p1, ctrl, p2, style, type) {
    const count = type === 'love' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const t = (this.phase * 1.6 + i * 0.5) % 1;
      const x = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * ctrl.x + t * t * p2.x;
      const y = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * ctrl.y + t * t * p2.y;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 7);
      glow.addColorStop(0, '#ffffff');
      glow.addColorStop(0.35, style.color);
      glow.addColorStop(1, hexToRgba(style.color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawEdgeLabel(ctx, p1, ctrl, p2, edge, style, alpha) {
    const text = truncate(edge.labels.join(' / ') || style.label, 10);
    const t = 0.62;
    const point = {
      x: (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * ctrl.x + t * t * p2.x,
      y: (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * ctrl.y + t * t * p2.y,
    };
    ctx.save();
    ctx.globalAlpha = Math.max(0.7, alpha);
    ctx.font = '600 10px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    const width = ctx.measureText(text).width + 14;
    const height = 19;
    const x = point.x - width / 2;
    const y = point.y - height / 2;
    const rect = { x: x - 3, y: y - 2, w: width + 6, h: height + 4 };
    if ((this._labelRects || []).some(r => !(rect.x + rect.w < r.x || r.x + r.w < rect.x || rect.y + rect.h < r.y || r.y + r.h < rect.y))) {
      ctx.restore();
      return;
    }
    this._labelRects.push(rect);
    ctx.fillStyle = 'rgba(8,14,26,0.9)';
    ctx.strokeStyle = hexToRgba(style.color, 0.65);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, width, height, 7) : ctx.rect(x, y, width, height);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, point.x, point.y + 0.5);
    ctx.restore();
  }

  _drawNodes(ctx, focus, neighbors) {
    const sorted = [...this.nodes].sort((a, b) => a.depth - b.depth);
    for (const node of sorted) {
      const isFocus = focus && node.id === focus.id;
      const isNeighbor = !focus || neighbors.has(node.id);
      const isHover = node.id === this.hoverId;
      const depthAlpha = this.mode === '3d' ? 0.42 + ((node.depth + 1) / 2) * 0.58 : 1;
      let alpha = isNeighbor ? depthAlpha : 0.16;
      if (isHover) alpha = 1;
      const radius = Math.max(4.5, node.size * 0.76 * node.scale);
      const x = node.screenX;
      const y = node.screenY;
      const color = node.color;

      ctx.save();
      ctx.globalAlpha = alpha;
      const glowRadius = radius * (isFocus ? 3.8 : 2.7);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      glow.addColorStop(0, hexToRgba(color, 0.72));
      glow.addColorStop(0.35, hexToRgba(color, 0.28));
      glow.addColorStop(1, hexToRgba(color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      if (isFocus) {
        ctx.strokeStyle = hexToRgba('#7dd3fc', 0.75);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(x, y, radius * 2.1, this.phase * Math.PI * 2, this.phase * Math.PI * 2 + Math.PI * 1.7);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(224,242,254,0.8)';
        ctx.lineWidth = 1.2;
        const flare = radius * 2.7;
        ctx.beginPath();
        ctx.moveTo(x - flare, y);
        ctx.lineTo(x + flare, y);
        ctx.moveTo(x, y - flare);
        ctx.lineTo(x, y + flare);
        ctx.stroke();
      }

      const core = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
      core.addColorStop(0, 'rgba(255,255,255,0.98)');
      core.addColorStop(0.5, color);
      core.addColorStop(1, hexToRgba(color, 0.8));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(3, radius * 0.72), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    }
    this._drawNodeLabels(ctx, focus, neighbors, sorted);
  }

  _drawNodeLabels(ctx, focus, neighbors, sorted) {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const rects = [];
    // 选中星体优先，其次悬停，其余按景深从前到后
    const ordered = [...sorted].sort((a, b) => {
      if (a.id === this.selectedId) return -1;
      if (b.id === this.selectedId) return 1;
      if (a.id === this.hoverId) return -1;
      if (b.id === this.hoverId) return 1;
      return b.depth - a.depth;
    });
    for (const node of ordered) {
      const isFocus = focus && node.id === focus.id;
      const isHover = node.id === this.hoverId;
      const isNeighbor = !focus || neighbors.has(node.id);
      const depthAlpha = this.mode === '3d' ? 0.42 + ((node.depth + 1) / 2) * 0.58 : 1;
      const alpha = isNeighbor ? depthAlpha : 0.16;
      if (!isFocus && !isHover && alpha < 0.32) continue;
      const radius = Math.max(4.5, node.size * 0.76 * node.scale);
      const dx = node.screenX - cx;
      const dy = node.screenY - cy;
      const dist = Math.hypot(dx, dy);
      let x;
      let y;
      let align;
      if (isFocus || dist < 12) {
        x = node.screenX;
        y = node.screenY + radius + 7;
        align = 'center';
      } else {
        const nx = dx / dist;
        const ny = dy / dist;
        x = node.screenX + nx * (radius + 13);
        y = node.screenY + ny * (radius + 13);
        align = nx > 0.22 ? 'left' : nx < -0.22 ? 'right' : 'center';
        if (align === 'center') y += 5;
      }
      ctx.font = `${isFocus ? '700' : '600'} ${isFocus ? 12.5 : 10.5}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
      const width = ctx.measureText(node.name).width;
      const left = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
      const box = { x: left - 3, y: y - 9, w: width + 6, h: 16 };
      if (!isFocus && !isHover && rects.some(r => !(box.x + box.w < r.x || r.x + r.w < box.x || box.y + box.h < r.y || r.y + r.h < box.y))) continue;
      rects.push(box);
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isFocus
        ? '#f8fafc'
        : `rgba(226,232,240,${Math.max(0.45, alpha)})`;
      ctx.fillText(node.name, x, y);
    }
  }

  _drawHoverTip(ctx) {
    if (!this.hoverId || this.hoverId === this.selectedId) return;
    const node = this.nodeMap.get(this.hoverId);
    if (!node) return;
    const text = node.identity || node.role;
    ctx.save();
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    const width = Math.max(ctx.measureText(node.name).width, ctx.measureText(text).width) + 24;
    const x = clamp(node.screenX + 18, 8, this.w - width - 8);
    const y = clamp(node.screenY - 46, 8, this.h - 54);
    ctx.fillStyle = 'rgba(8,14,26,0.92)';
    ctx.strokeStyle = hexToRgba(node.color, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, width, 42, 8) : ctx.rect(x, y, width, 42);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 11px "Microsoft YaHei", sans-serif';
    ctx.fillText(node.name, x + 10, y + 14);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px "Microsoft YaHei", sans-serif';
    ctx.fillText(truncate(text, 18), x + 10, y + 29);
    ctx.restore();
  }
}

function relationshipRows(graph, characterId) {
  return graph.edges
    .filter(edge => edge.a === characterId || edge.b === characterId)
    .map(edge => {
      const otherId = edge.a === characterId ? edge.b : edge.a;
      const other = graph.nodeMap.get(otherId);
      return { other, edge, type: REL_TYPES[edge.type] || REL_TYPES.other };
    })
    .filter(row => row.other)
    .sort((a, b) => REL_ORDER.indexOf(a.edge.type) - REL_ORDER.indexOf(b.edge.type));
}

export function renderStarMap(app, characters, { onEdit = null } = {}) {
  if (!characters.length) {
    return el('div', { class: 'empty-state' }, [
      el('h3', { text: '还没有人物档案' }),
      el('p', { text: '先在人物页创建人物和关系，星图会自动生成。' }),
    ]);
  }
  const graph = buildGraph(characters);
  const shell = el('div', { class: 'star-map-shell' });

  const toolbar = el('div', { class: 'star-toolbar' });
  const titleBox = el('div', { class: 'star-toolbar-title' }, [
    el('strong', { text: '人物星图' }),
    el('span', { text: `${graph.nodes.length} 星 · ${graph.edges.length} 轨` }),
  ]);
  toolbar.appendChild(titleBox);

  const modeGroup = el('div', { class: 'star-segmented' });
  const mode3d = el('button', { class: 'star-seg-btn active', type: 'button', text: '3D 星图' });
  const mode2d = el('button', { class: 'star-seg-btn', type: 'button', text: '引力星云' });
  modeGroup.append(mode3d, mode2d);
  toolbar.appendChild(modeGroup);

  const filter = el('select', { class: 'star-select', title: '关系类型筛选' });
  filter.appendChild(el('option', { value: 'all', text: '全部关系' }));
  REL_ORDER.forEach(type => {
    if (type === 'other' && !graph.edges.some(e => e.type === 'other')) return;
    filter.appendChild(el('option', { value: type, text: REL_TYPES[type].label }));
  });
  toolbar.appendChild(filter);

  const jump = el('select', { class: 'star-select star-jump', title: '快速定焦人物' });
  graph.nodes.forEach(node => {
    jump.appendChild(el('option', { value: node.id, text: `${node.name}（${node.role}）` }));
  });
  toolbar.appendChild(jump);

  const zoomOut = makeIconButton('minus', '缩小', () => map.zoomBy(0.86), { small: true });
  const zoomIn = makeIconButton('plus', '放大', () => map.zoomBy(1.16), { small: true });
  const labelsBtn = el('button', { class: 'star-tool-btn', type: 'button', title: '显示/隐藏选中人物的关系标签；鼠标悬停时也会临时显示', text: '标签' });
  const autoBtn = el('button', { class: 'star-tool-btn', type: 'button', title: '自动缓慢旋转', text: '自转' });
  const resetBtn = el('button', { class: 'star-tool-btn', type: 'button', title: '重置视角', text: '重置' });
  toolbar.append(zoomOut, zoomIn, labelsBtn, autoBtn, resetBtn);

  const stage = el('div', { class: 'star-stage' });
  const canvas = el('canvas', {
    class: 'star-canvas',
    tabindex: '0',
    'aria-label': '人物关系星图。拖动空白旋转，滚轮缩放，双击星体定焦。',
  });
  stage.appendChild(canvas);
  stage.appendChild(el('div', {
    class: 'star-hint',
    html: '拖动旋转 · 滚轮缩放 · 双击星体定焦 · 2D 模式可拖拽星体',
  }));

  const panel = el('aside', { class: 'star-panel' });
  panel.appendChild(el('div', { class: 'star-panel-eyebrow', text: 'SELECTED STAR' }));
  const profileHead = el('div', { class: 'star-profile-head' });
  const avatar = el('div', { class: 'star-avatar', text: '' });
  const profileNameBox = el('div', { class: 'star-profile-namebox' });
  const profileName = el('strong', { class: 'star-profile-name', text: '' });
  const profileRole = el('span', { class: 'star-profile-role', text: '' });
  profileNameBox.append(profileName, profileRole);
  profileHead.append(avatar, profileNameBox);
  panel.appendChild(profileHead);
  const aliasEl = el('div', { class: 'star-profile-alias', text: '' });
  const identityEl = el('p', { class: 'star-profile-identity', text: '' });
  const bioEl = el('p', { class: 'star-profile-bio', text: '' });
  const tagBox = el('div', { class: 'star-tags' });
  panel.append(aliasEl, identityEl, bioEl, tagBox);
  const actions = el('div', { class: 'star-panel-actions' });
  const editBtn = makeButton('编辑完整档案', {
    small: true, onClick: () => {
      const id = jump.value;
      const character = app.state.characters.find(c => c.id === id);
      if (character && onEdit) onEdit(character);
    },
  });
  const insertBtn = makeButton('插入姓名', {
    small: true, ghost: true, onClick: () => {
      const character = app.state.characters.find(c => c.id === jump.value);
      if (character) app.insertIntoEditor(character.name);
    },
  });
  actions.append(editBtn, insertBtn);
  panel.appendChild(actions);
  const relTitle = el('div', { class: 'star-panel-subtitle', text: '关系网' });
  const relList = el('div', { class: 'star-rel-list' });
  panel.append(relTitle, relList);

  const legend = el('div', { class: 'star-legend' });
  legend.appendChild(el('div', { class: 'star-panel-subtitle', text: '图例' }));
  REL_ORDER.forEach(type => {
    if (type === 'other' && !graph.edges.some(e => e.type === 'other')) return;
    const style = REL_TYPES[type];
    legend.appendChild(el('div', { class: 'star-legend-row' }, [
      el('span', { class: `star-line star-line-${type}` }),
      el('span', { text: style.label }),
    ]));
  });
  Object.entries(FACTION_LABELS).forEach(([key, label]) => {
    if (!graph.nodes.some(n => n.faction === key)) return;
    legend.appendChild(el('div', { class: 'star-legend-row' }, [
      el('span', { class: 'star-legend-dot', style: { background: FACTION_COLORS[key] } }),
      el('span', { text: label }),
    ]));
  });
  panel.appendChild(legend);

  const body = el('div', { class: 'star-map-body' });
  body.append(stage, panel);

  const ledger = el('details', { class: 'star-ledger' });
  ledger.appendChild(el('summary', { text: `全部关系（${graph.edges.length} 条）· 展开核对` }));
  const ledgerGrid = el('div', { class: 'star-ledger-grid' });
  [...graph.edges]
    .sort((a, b) => REL_ORDER.indexOf(a.type) - REL_ORDER.indexOf(b.type))
    .forEach(edge => {
      const a = graph.nodeMap.get(edge.a);
      const b = graph.nodeMap.get(edge.b);
      if (!a || !b) return;
      const style = REL_TYPES[edge.type] || REL_TYPES.other;
      ledgerGrid.appendChild(el('div', { class: 'star-ledger-row' }, [
        el('span', { class: 'star-ledger-dot', style: { background: style.color } }),
        el('span', { class: 'star-ledger-names', text: `${a.name} — ${b.name}` }),
        el('span', { class: `star-ledger-type type-${edge.type}`, text: style.label }),
        el('span', { class: 'star-ledger-label', text: relationLabel(edge) }),
      ]));
    });
  ledger.appendChild(ledgerGrid);

  shell.append(toolbar, body, ledger);

  const updatePanel = id => {
    const character = app.state.characters.find(c => c.id === id) || app.state.characters[0];
    if (!character) return;
    jump.value = character.id;
    avatar.textContent = (character.name || '?').slice(0, 1);
    avatar.style.background = character.color || '#8a5a3b';
    profileName.textContent = character.name;
    profileRole.textContent = character.role || '人物';
    aliasEl.textContent = character.alias || '暂无别名';
    identityEl.textContent = character.identity || '';
    bioEl.textContent = truncate(character.bio || character.personality || '暂无人物小传。', 150);
    tagBox.innerHTML = '';
    (character.tags || []).forEach(tag => tagBox.appendChild(el('span', { class: 'tag', text: tag })));
    relList.innerHTML = '';
    const rows = relationshipRows(graph, character.id);
    if (!rows.length) relList.appendChild(el('p', { class: 'muted tiny', text: '暂无关系记录。' }));
    rows.forEach(row => {
      const rowNode = el('button', { class: 'star-rel-row', type: 'button' });
      rowNode.appendChild(el('span', { class: 'star-rel-dot', style: { background: row.type.color } }));
      rowNode.appendChild(el('span', { class: 'star-rel-name', text: row.other.name }));
      rowNode.appendChild(el('span', { class: `star-rel-type type-${row.edge.type}`, text: row.type.label }));
      rowNode.appendChild(el('span', { class: 'star-rel-label', text: relationLabel(row.edge) }));
      rowNode.addEventListener('click', () => {
        map.select(row.other.id);
        map.centerNode(row.other.id);
      });
      relList.appendChild(rowNode);
    });
  };

  const map = new StarMap(canvas, graph, {
    onSelect: updatePanel,
    onAutoChange: active => autoBtn.classList.toggle('active', active),
  });
  updatePanel(map.selectedId);

  mode3d.addEventListener('click', () => {
    mode3d.classList.add('active');
    mode2d.classList.remove('active');
    map.setMode('3d');
    autoBtn.disabled = false;
    autoBtn.title = '自动缓慢旋转';
  });
  mode2d.addEventListener('click', () => {
    mode2d.classList.add('active');
    mode3d.classList.remove('active');
    map.setMode('2d');
    autoBtn.disabled = true;
    autoBtn.classList.remove('active');
    autoBtn.title = '2D 模式由弹簧引力驱动，不需要自转';
  });
  filter.addEventListener('change', () => map.setFilter(filter.value));
  jump.addEventListener('change', () => {
    map.select(jump.value);
    map.centerNode(jump.value);
  });
  labelsBtn.addEventListener('click', () => {
    map.showLabels = !map.showLabels;
    labelsBtn.classList.toggle('active', map.showLabels);
  });
  autoBtn.addEventListener('click', () => map.toggleAutoRotate());
  resetBtn.addEventListener('click', () => map.resetView());
  zoomOut.addEventListener('click', () => map.zoomBy(0.86));
  zoomIn.addEventListener('click', () => map.zoomBy(1.16));

  shell.__starMap = map;
  // 不用 rAF 做首帧初始化：后台标签页会暂停 rAF，导致画布一直停在 300×150
  setTimeout(() => map.init(), 30);
  return shell;
}
