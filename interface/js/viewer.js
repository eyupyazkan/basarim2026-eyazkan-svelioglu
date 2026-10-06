const VIEW = { azimuth: 90, elevation: 10, fill: 0.80 };
const GRAPH_R = 0.24;
const BOND_R = 0.085, STUB_R = 0.065, HL_R = 0.16, CELL_R = 0.02;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const xyz = (p) => ({ x: p[0], y: p[1], z: p[2] });
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function axesFor(L, az, el) {
  const [a, b, c] = L;
  let up = unit(cross(a, b));
  if (dot(up, c) < 0) up = mul(up, -1);
  const e1 = unit(sub(a, mul(up, dot(a, up))));
  const e2 = cross(up, e1);
  const d = Math.PI / 180;
  const h = add(mul(e1, Math.cos(az * d)), mul(e2, Math.sin(az * d)));
  const z = unit(add(mul(h, Math.cos(el * d)), mul(up, Math.sin(el * d))));
  const y = unit(sub(up, mul(z, dot(up, z))));
  return { x: cross(y, z), y, z };
}

function quat(A) {
  const [m00, m01, m02] = A.x, [m10, m11, m12] = A.y, [m20, m21, m22] = A.z;
  const t = m00 + m11 + m22; let s, qw, qx, qy, qz;
  if (t > 0) { s = 0.5 / Math.sqrt(t + 1); qw = 0.25 / s; qx = (m21 - m12) * s; qy = (m02 - m20) * s; qz = (m10 - m01) * s; }
  else if (m00 > m11 && m00 > m22) { s = 2 * Math.sqrt(1 + m00 - m11 - m22); qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s; }
  else if (m11 > m22) { s = 2 * Math.sqrt(1 + m11 - m00 - m22); qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s; }
  else { s = 2 * Math.sqrt(1 + m22 - m00 - m11); qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s; }
  return [qx, qy, qz, qw];
}

function rows([x, y, z, w]) {
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
}
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  let t = l2 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

export class Scene {

  constructor(o) {
    Object.assign(this, { host: o.host, overlay: o.overlay, tip: o.tip, el: o.elements, onPick: o.onPick, describe: o.describe });

    this.opts = { rings: true, bonds: true, layers: false, layerText: true, cell: true, rep: 2, mode: 'ball', hlType: null };
    this.layerMarks = [];
    this.sel = null; this.D = []; this.segs = []; this._hl = []; this._framed = false;
    this._readColors();
    this.viewer = $3Dmol.createViewer(this.host, { backgroundColor: this.c.plate, antialias: true });
    this.viewer.setHoverDuration(60);
    this.viewer.setViewChangeCallback(() => this._queue());
    this.host.addEventListener('pointerdown', (e) => { this._down = { x: e.clientX, y: e.clientY }; this._picked = false; });
    this.host.addEventListener('pointerup', (e) => {
      const d = this._down; if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      setTimeout(() => { if (!this._picked && this.sel) this.onPick(null); }, 40);
    });
    this.host.addEventListener('pointerleave', () => this._hideTip());
    new ResizeObserver(() => this.resize()).observe(this.host);
  }

  _readColors() {
    this.c = {
      plate: css('--plate') || '#ffffff', bond: css('--bond'), stub: css('--bond-stub'), cell: css('--cell-line'),
      sel: css('--sel'), hl: css('--hl'), ink: css('--ink'), muted: css('--muted'),
      M: css('--grp-M'), X: css('--grp-X'), T: css('--grp-T'), Unknown: css('--grp-U'),
    };
  }
  _radius(elem) {
    if (this.opts.mode === 'graph') return GRAPH_R;
    const e = this.el[elem];
    return Math.max(0.2, e ? e.display_radius_A : 0.6);
  }
  _color(elem) { const e = this.el[elem]; return e ? e.color : '#FF1493'; }

  load(res, opts) {
    const st = res.structure;
    this.L = st.lattice.vectors_A;
    this.atoms = st.atoms; this.bonds = st.bonds || [];
    this.layerOf = {};
    st.atoms.forEach((a) => { if (a.layer) this.layerOf[a.index] = a.layer; });
    this.sel = null; this.opts.hlType = null; this._framed = false;
    if (opts) Object.assign(this.opts, opts);
    this._build();
    this.resetView();
  }
  clear() { this.viewer.clear(); this.D = []; this.segs = []; this._queue(); }

  set(o) {
    const reframe = (o.rep !== undefined && o.rep !== this.opts.rep);
    Object.assign(this.opts, o);
    if (!this.atoms) return;
    this._build();
    if (reframe) this.resetView(); else { this.viewer.render(); this._queue(); }
  }
  select(sel) { this.sel = sel; if (this.atoms) { this._highlights(); this.viewer.render(); this._queue(); } }
  refreshTheme() {
    this._readColors();
    if (!this.atoms) { this.viewer.setBackgroundColor(this.c.plate); this.viewer.render(); return; }
    this._build(); this.viewer.render(); this._queue();
  }

  _pos(k, p, q) { const [A, B] = this.L; return add(this.atoms[k].display_cart, add(mul(A, p), mul(B, q))); }

  _build() {
    const v = this.viewer, n = this.opts.rep;
    v.clear();
    v.setBackgroundColor(this.c.plate);

    const D = [];
    for (let p = 0; p < n; p++) for (let q = 0; q < n; q++) {
      this.atoms.forEach((a, k) => D.push({ k, p, q, elem: a.element, group: a.group, pos: this._pos(k, p, q) }));
    }
    this.D = D;
    const m = v.addModel();
    m.addAtoms(D.map((d, i) => ({ elem: d.elem, x: d.pos[0], y: d.pos[1], z: d.pos[2], index: i, serial: i,
      bonds: [], bondOrder: [], properties: { k: d.k, p: d.p, q: d.q } })));
    [...new Set(D.map((d) => d.elem))].forEach((e) => {
      m.setStyle({ elem: e }, { sphere: { radius: this._radius(e), color: this._color(e) } });
    });
    m.setClickable({}, true, (atom) => { this._picked = true; this.onPick({ kind: 'atom', k: atom.properties.k }); });
    m.setHoverable({}, true, (atom) => this._showTip(atom), () => this._hideTip());
    this.model = m;

    const segs = [], inR = (p, q) => p >= 0 && q >= 0 && p < n && q < n;
    for (const b of this.bonds) {
      const i = b.i - 1, j = b.j - 1, o = b.offset || [0, 0, 0];
      const [, , C] = this.L;
      const cz = mul(C, o[2] || 0);
      for (let p = 0; p < n; p++) for (let q = 0; q < n; q++) {
        const Pi = this._pos(i, p, q), Pj = add(this._pos(j, p + o[0], q + o[1]), cz);
        if (inR(p + o[0], q + o[1])) segs.push({ b, a: Pi, z: Pj, full: true });
        else segs.push({ b, a: Pi, z: mul(add(Pi, Pj), 0.5), full: false });
        if (!inR(p - o[0], q - o[1])) {
          const Pj2 = this._pos(j, p, q), Pi2 = sub(this._pos(i, p - o[0], q - o[1]), cz);
          segs.push({ b, a: Pj2, z: mul(add(Pj2, Pi2), 0.5), full: false });
        }
      }
    }
    this.segs = segs;

    if (this.opts.bonds && segs.length) {
      const full = v.addShape({ color: this.c.bond, clickable: true, callback: () => this._pickBond() });
      const stub = v.addShape({ color: this.c.stub, clickable: true, callback: () => this._pickBond() });
      for (const s of segs) {
        (s.full ? full : stub).addCylinder({ start: xyz(s.a), end: xyz(s.z), radius: s.full ? BOND_R : STUB_R, fromCap: 1, toCap: s.full ? 1 : 0 });
      }
    }
    if (this.opts.cell) {
      const [A, B, C] = this.L, O = [0, 0, 0];
      const P = { O, A, B, C, AB: add(A, B), AC: add(A, C), BC: add(B, C), ABC: add(add(A, B), C) };
      const E = [['O', 'A'], ['O', 'B'], ['O', 'C'], ['A', 'AB'], ['A', 'AC'], ['B', 'AB'], ['B', 'BC'], ['C', 'AC'], ['C', 'BC'],
        ['AB', 'ABC'], ['AC', 'ABC'], ['BC', 'ABC']];
      const cs = v.addShape({ color: this.c.cell });
      E.forEach(([s, e]) => cs.addCylinder({ start: xyz(P[s]), end: xyz(P[e]), radius: CELL_R, fromCap: 0, toCap: 0 }));
    }
    this._hl = [];
    this._highlights();
  }

  _highlights() {
    const v = this.viewer;
    this._hl.forEach((s) => v.removeShape(s));
    this._hl = [];
    const want = [];
    if (this.opts.hlType) this.segs.forEach((s) => { if (s.b.type === this.opts.hlType) want.push([s, this.c.hl]); });
    if (this.sel && this.sel.kind === 'bond') this.segs.forEach((s) => { if (s.b.index === this.sel.index) want.push([s, this.c.sel]); });
    if (!want.length) return;
    const byCol = new Map();
    want.forEach(([s, col]) => { if (!byCol.has(col)) byCol.set(col, []); byCol.get(col).push(s); });
    for (const [col, list] of byCol) {
      const sh = v.addShape({ color: col });
      list.forEach((s) => sh.addCylinder({ start: xyz(s.a), end: xyz(s.z), radius: s.full ? HL_R : HL_R * 0.8, fromCap: 1, toCap: s.full ? 1 : 0 }));
      this._hl.push(sh);
    }
  }

  resetView() {
    const v = this.viewer;
    if (!this.D.length) return;
    const W = this.host.clientWidth, H = this.host.clientHeight;
    if (!W || !H) { this._framed = false; return; }
    const A = axesFor(this.L, VIEW.azimuth, VIEW.elevation);
    v.zoomTo();
    const view = v.getView(), q = quat(A);
    view[4] = q[0]; view[5] = q[1]; view[6] = q[2]; view[7] = q[3];
    v.setView(view);
    v.zoomTo();
    this._fit(A);
    v.render();
    this._framed = true;
    this._queue();
  }

  _fit(axes) {
    const v = this.viewer, pts = this.D.map((d) => xyz(d.pos));
    const W = this.host.clientWidth, H = this.host.clientHeight, off = v.canvasOffset();
    for (let it = 0; it < 10; it++) {
      let view = v.getView();
      const c = { x: -view[0], y: -view[1], z: -view[2] };
      const p0 = v.modelToScreen(c), p1 = v.modelToScreen({ x: c.x + axes.x[0], y: c.y + axes.x[1], z: c.z + axes.x[2] });
      const pxA = Math.abs(p1.x - p0.x) || 1;
      const p = v.modelToScreen(pts);
      let lo = Infinity, hi = -Infinity, tp = Infinity, bt = -Infinity;
      for (const s of p) { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x); tp = Math.min(tp, s.y); bt = Math.max(bt, s.y); }
      const pad = 2 * 0.9 * pxA;
      const f = Math.min(VIEW.fill * W / Math.max(hi - lo + pad, 1), VIEW.fill * H / Math.max(bt - tp + pad, 1));
      if (Math.abs(f - 1) > 0.004) { v.zoom(f); continue; }
      const dx = (lo + hi) / 2 - (off.left + W / 2), dy = (tp + bt) / 2 - (off.top + H / 2);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
      view = v.getView();
      for (let k = 0; k < 3; k++) view[k] += -dx / pxA * axes.x[k] + dy / pxA * axes.y[k];
      v.setView(view);
    }
  }

  frameInfo() {
    if (!this.D.length) return null;
    const v = this.viewer, off = v.canvasOffset(), W = this.host.clientWidth, H = this.host.clientHeight;
    const p = v.modelToScreen(this.D.map((d) => xyz(d.pos)));
    const xs = p.map((s) => s.x - off.left), ys = p.map((s) => s.y - off.top);
    const r2 = (x) => Math.round(x * 100) / 100;
    return { w: r2((Math.max(...xs) - Math.min(...xs)) / W), h: r2((Math.max(...ys) - Math.min(...ys)) / H),
      cx: r2((Math.max(...xs) + Math.min(...xs)) / 2 / W), cy: r2((Math.max(...ys) + Math.min(...ys)) / 2 / H), W, H, n: this.D.length };
  }

  resize() {
    this.viewer.resize();
    if (this.D.length && !this._framed) this.resetView();
    else this._queue();
  }

  _pickBond() {
    this._picked = true;
    const d = this._down; if (!d || !this.segs.length || !this.opts.bonds) return;
    const v = this.viewer, px = d.x + window.scrollX, py = d.y + window.scrollY;
    const A = v.modelToScreen(this.segs.map((s) => xyz(s.a))), Z = v.modelToScreen(this.segs.map((s) => xyz(s.z)));
    let best = -1, bd = Infinity;
    this.segs.forEach((s, i) => { const dd = segDist(px, py, A[i].x, A[i].y, Z[i].x, Z[i].y); if (dd < bd) { bd = dd; best = i; } });
    if (best >= 0) this.onPick({ kind: 'bond', index: this.segs[best].b.index });
  }

  _showTip(atom) {
    if (!this.tip) return;
    const v = this.viewer, off = v.canvasOffset(), s = v.modelToScreen({ x: atom.x, y: atom.y, z: atom.z });
    this.tip.textContent = this.describe ? this.describe(atom.properties.k) : atom.elem;
    this.tip.style.left = `${s.x - off.left}px`;
    this.tip.style.top = `${s.y - off.top - 6}px`;
    this.tip.hidden = false;
  }
  _hideTip() { if (this.tip) this.tip.hidden = true; }

  _queue() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._overlay(); });
  }

  _overlay() {
    const cv = this.overlay, dpr = window.devicePixelRatio || 1;
    const W = this.host.clientWidth, H = this.host.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.D.length || !W || !H) return;
    const v = this.viewer, off = v.canvasOffset(), view = v.getView();
    const R = rows([view[4], view[5], view[6], view[7]]), ex = R[0], ez = R[2];
    const scr = v.modelToScreen(this.D.map((d) => xyz(d.pos)));
    const scr2 = v.modelToScreen(this.D.map((d) => xyz(add(d.pos, mul(ex, this._radius(d.elem))))));
    const items = this.D.map((d, i) => ({ d, x: scr[i].x - off.left, y: scr[i].y - off.top,
      r: Math.hypot(scr2[i].x - scr[i].x, scr2[i].y - scr[i].y), z: dot(ez, d.pos) }));
    items.sort((a, b) => a.z - b.z);
    const lw = W < 520 ? 2.2 : 2.6, gap = 1.6;
    if (this.opts.rings) {
      for (const it of items) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(it.x, it.y, it.r + 0.6, 0, 2 * Math.PI); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        ctx.beginPath(); ctx.arc(it.x, it.y, it.r + gap / 2, 0, 2 * Math.PI);
        ctx.strokeStyle = this.c.plate; ctx.lineWidth = gap; ctx.setLineDash([]); ctx.stroke();
        ctx.beginPath(); ctx.arc(it.x, it.y, it.r + gap + lw / 2, 0, 2 * Math.PI);
        ctx.strokeStyle = this.c[it.d.group] || this.c.Unknown; ctx.lineWidth = lw;
        ctx.setLineDash(it.d.group === 'Unknown' ? [3, 2] : []);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (this.sel && this.sel.kind === 'atom') {
      for (const it of items) {
        if (it.d.k !== this.sel.k) continue;
        ctx.beginPath(); ctx.arc(it.x, it.y, it.r + gap + lw + 3.2, 0, 2 * Math.PI);
        ctx.strokeStyle = this.c.sel; ctx.lineWidth = 2.6; ctx.stroke();
      }
    }
    if (this.opts.layers && Object.keys(this.layerOf).length) this._layerLabels(ctx, items, W);
  }

  _layerLabels(ctx, items, W) {
    const by = new Map();
    let xmax = -Infinity, xmin = Infinity;
    for (const it of items) {
      xmax = Math.max(xmax, it.x + it.r); xmin = Math.min(xmin, it.x - it.r);
      const lab = this.layerOf[this.atoms[it.d.k].index];
      if (!lab) continue;
      if (!by.has(lab)) by.set(lab, []);
      by.get(lab).push(it);
    }
    const font = '700 12px Carlito, Calibri, "Segoe UI", sans-serif';
    ctx.font = font;
    const right = xmax + 64 < W;
    const L = [...by.entries()].map(([lab, arr]) => ({
      lab, y: arr.reduce((s, a) => s + a.y, 0) / arr.length,
      edge: right ? Math.max(...arr.map((a) => a.x + a.r)) : Math.min(...arr.map((a) => a.x - a.r)),
    })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < L.length; i++) L[i].ly = Math.max(L[i].y, (L[i - 1].ly ?? L[i - 1].y) + 17);
    L.forEach((l) => { if (l.ly === undefined) l.ly = l.y; });
    if (this.opts.layerGap) {
      const c = L.reduce((s, l) => s + l.y, 0) / L.length;
      L.forEach((l, i) => { l.ly = c + (i - (L.length - 1) / 2) * this.opts.layerGap; });
    }
    const xl = right ? xmax + 18 : xmin - 18, text = this.opts.layerText !== false;

    this.layerMarks = L.map((l) => ({ label: l.lab, group: l.lab[0], row_y: l.y, edge_x: l.edge, anchor_x: xl, anchor_y: l.ly, side: right ? 'right' : 'left' }));
    for (const l of L) {
      const g = l.lab[0], col = this.c[g] || this.c.muted;
      ctx.strokeStyle = col; ctx.lineWidth = text ? 1 : 1.5; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(right ? l.edge + 4 : l.edge - 4, l.y); ctx.lineTo(right ? xl - 4 : xl + 4, l.ly); ctx.stroke();
      ctx.setLineDash([]);
      if (!text) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(right ? xl - 3 : xl + 3, l.ly, 2.6, 0, 2 * Math.PI); ctx.fill(); continue; }
      const tw = ctx.measureText(l.lab).width + 10, x0 = right ? xl : xl - tw;
      ctx.fillStyle = this.c.plate; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(x0, l.ly - 8, tw, 16, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = this.c.ink; ctx.textBaseline = 'middle'; ctx.fillText(l.lab, x0 + 5, l.ly + 0.5);
    }
  }
}
