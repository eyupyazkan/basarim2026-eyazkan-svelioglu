import { esc } from './format.js';

function niceLin(max) {
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw || 1)), n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  const ticks = []; for (let v = 0; v <= max * 1.0001 + step; v += step) { ticks.push(Number(v.toPrecision(10))); if (v >= max) break; }
  return ticks;
}

export function gauge(o) {
  const W = 320, H = 200, cx = 160, cy = 168, r = 124, sw = 26, L = Math.PI * r;
  const p = Math.max(0, Math.min(1, o.p)), th = Math.PI * (1 - o.thr);
  const tx = (rr) => cx + rr * Math.cos(th), ty = (rr) => cy - rr * Math.sin(th);
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  let s = `<svg class="gauge${o.grow ? ' grow' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" style="--arc-len:${L.toFixed(1)}">`;
  s += `<path class="track" d="${arc}" fill="none" stroke-width="${sw}" stroke-linecap="butt"/>`;
  s += `<path class="fillarc ${o.kind}" d="${arc}" fill="none" stroke-width="${sw}" stroke-linecap="butt" stroke-dasharray="${(p * L).toFixed(2)} ${L.toFixed(2)}" stroke-dashoffset="0"/>`;
  s += `<line class="thr" x1="${tx(r - sw / 2 - 6).toFixed(1)}" y1="${ty(r - sw / 2 - 6).toFixed(1)}" x2="${tx(r + sw / 2 + 6).toFixed(1)}" y2="${ty(r + sw / 2 + 6).toFixed(1)}" stroke-width="2.5"/>`;
  s += `<text x="${tx(r + sw / 2 + 12).toFixed(1)}" y="${(ty(r + sw / 2 + 12) - 2).toFixed(1)}" text-anchor="middle">${esc(o.thrLabel)}</text>`;
  s += `<text class="gv" x="${cx}" y="${cy - 34}" text-anchor="middle">${esc(o.value)}</text>`;
  s += `<text class="gl" x="${cx}" y="${cy - 10}" text-anchor="middle">${esc(o.sub)}</text>`;
  s += `<text x="${cx - r}" y="${cy + 22}" text-anchor="middle">0</text><text x="${cx + r}" y="${cy + 22}" text-anchor="middle">1</text>`;
  return `${s}</svg>`;
}

function colPath(x, y, w, y0) {
  const h = y0 - y, r = Math.max(0, Math.min(4, h, w / 2));
  if (h <= 0) return '';
  return `M${x.toFixed(2)} ${y0.toFixed(2)}V${(y + r).toFixed(2)}Q${x.toFixed(2)} ${y.toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)}`
    + `H${(x + w - r).toFixed(2)}Q${(x + w).toFixed(2)} ${y.toFixed(2)} ${(x + w).toFixed(2)} ${(y + r).toFixed(2)}V${y0.toFixed(2)}Z`;
}

export function barChart(o) {
  const W = 264, H = 196, ml = 30, mr = 4, mt = 22, mb = 24;
  const vals = [];
  for (const g of o.groups) for (const b of g.bars) for (const v of [b.value, b.ref]) if (v !== null && v !== undefined && Number.isFinite(v)) vals.push(v);
  if (!vals.length) return '';
  const ticks = niceLin(Math.max(...vals) * 1.08 || 1), top = ticks[ticks.length - 1];
  const Y = (v) => mt + (1 - v / top) * (H - mt - mb), y0 = Y(0);
  const band = (W - ml - mr) / o.groups.length;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}">`;
  for (const t of ticks) s += `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text x="${ml - 5}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end">${esc(o.fmtTick(t))}</text>`;
  o.groups.forEach((g, gi) => {
    const k = g.bars.length, gap = k > 1 ? 7 : 0, bw = Math.min(24, (band * 0.62 - gap * (k - 1)) / k);
    const x0 = ml + gi * band + (band - (bw * k + gap * (k - 1))) / 2;
    g.bars.forEach((b, bi) => {
      const x = x0 + bi * (bw + gap), has = b.value !== null && b.value !== undefined && Number.isFinite(b.value);
      const hasRef = b.ref !== null && b.ref !== undefined && Number.isFinite(b.ref);
      s += `<g class="bar"><title>${esc(b.title)}</title><rect class="hit" x="${(x - gap / 2).toFixed(1)}" y="${mt}" width="${(bw + gap).toFixed(1)}" height="${(y0 - mt).toFixed(1)}"/>`;
      if (has) s += `<path class="mark" d="${colPath(x, Y(Math.max(b.value, 0)), bw, y0)}" fill="${b.color}"/>`;
      if (hasRef) s += `<circle cx="${(x + bw / 2).toFixed(1)}" cy="${Y(b.ref).toFixed(1)}" r="4.5" fill="var(--prov-gcmc)" stroke="var(--surface)" stroke-width="2"/>`;
      const ly = Math.min(has ? Y(Math.max(b.value, 0)) : y0, hasRef ? Y(b.ref) - 5 : y0) - 6;
      if (has) s += `<text class="val" x="${(x + bw / 2).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${esc(o.fmt(b.value))}</text>`;
      s += '</g>';
    });
    s += `<text x="${(ml + gi * band + band / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(g.label)}</text>`;
  });
  s += `<line class="axis" x1="${ml}" x2="${W - mr}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}"/>`;
  return `${s}</svg>`;
}

function hex2rgb(hx) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hx).trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const Z_CLIP = 2;

export function divColor(z, neg, mid, pos) {
  if (z === null || !Number.isFinite(z)) return null;
  const u = Math.max(-1, Math.min(1, z / Z_CLIP)), a = hex2rgb(mid), b = hex2rgb(u < 0 ? neg : pos), w = Math.abs(u);
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * w));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function barcode(o) {
  const items = [];
  let k = 0;
  for (const b of o.blocks) for (let j = 0; j < b.n; j++) items.push({ block: b.block, z: o.z[k++] });
  const n = items.length, W = 1000, bh = 46, H = 96, bw = W / n;
  let s = `<svg class="barcode${o.reveal ? ' reveal' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">`;
  items.forEach((it, i) => {
    const col = divColor(it.z, o.colors.neg, o.colors.mid, o.colors.pos) || o.colors.na;
    s += `<rect data-i="${i}" x="${(i * bw + 0.5).toFixed(2)}" y="2" width="${Math.max(bw - 1.2, 0.8).toFixed(2)}" height="${bh}" rx="1.2" fill="${col}"${o.reveal ? ` style="animation-delay:${Math.round(i * 9)}ms"` : ''}/>`;
  });
  let i0 = 0, row = 0;
  const spans = [];
  items.forEach((it, i) => {
    if (i === n - 1 || items[i + 1].block !== it.block) { spans.push({ b: it.block, a: i0, z: i, n: i - i0 + 1 }); i0 = i + 1; }
  });
  for (const sp of spans) {
    const xa = sp.a * bw + 1, xz = (sp.z + 1) * bw - 1, xm = (xa + xz) / 2, wide = xz - xa > 46;
    const ly = wide ? 74 : (row++ % 2 ? 90 : 74);
    s += `<path d="M${xa} ${bh + 7}v4H${xz}v-4" fill="none" stroke="var(--axis)" stroke-width="1"/>`;
    if (!wide) s += `<line x1="${xm}" x2="${xm}" y1="${bh + 11}" y2="${ly - 10}" stroke="var(--axis)" stroke-width="1"/>`;
    s += `<text class="blk" x="${xm}" y="${ly}" text-anchor="middle">${esc(o.blockLabel(sp.b))}</text>`;
  }
  s += `<rect class="hov" x="0" y="0" width="0" height="${bh + 4}" fill="none" stroke="var(--ink)" stroke-width="1.6" rx="2" visibility="hidden"/>`;
  return { svg: `${s}</svg>`, spans, n, bw };
}

export function parityChart(o) {
  const W = 420, H = 360, ml = 52, mr = 18, mt = 26, mb = 46;
  const pts = o.pts.filter((p) => p.x > 0 && p.y > 0);
  let lo = -3, hi = 1;
  if (pts.length) {
    const v = pts.flatMap((p) => [Math.log10(p.x), Math.log10(p.y)]);
    lo = Math.floor(Math.min(...v) - 0.1); hi = Math.ceil(Math.max(...v) + 0.1);
    if (hi - lo < 2) hi = lo + 2;
  }
  const X = (v) => ml + (Math.log10(v) - lo) / (hi - lo) * (W - ml - mr);
  const Y = (v) => mt + (1 - (Math.log10(v) - lo) / (hi - lo)) * (H - mt - mb);
  let s = `<svg class="chart parity" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.labels.aria)}">`;
  for (let e = lo; e <= hi; e++) {
    const v = 10 ** e;
    s += `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}"/><line class="grid" y1="${mt}" y2="${H - mb}" x1="${X(v)}" x2="${X(v)}"/>`;
    s += `<text x="${ml - 7}" y="${Y(v) + 4}" text-anchor="end">${esc(o.fmtTick(v))}</text>`;
    s += `<text x="${X(v)}" y="${H - mb + 16}" text-anchor="middle">${esc(o.fmtTick(v))}</text>`;
  }
  s += `<line x1="${X(10 ** lo)}" y1="${Y(10 ** lo)}" x2="${X(10 ** hi)}" y2="${Y(10 ** hi)}" stroke="var(--axis)" stroke-width="1.4" stroke-dasharray="5 4"/>`;
  s += `<text x="${(ml + W - mr) / 2}" y="${H - 8}" text-anchor="middle">${esc(o.labels.x)}</text>`;
  s += `<text x="4" y="${mt - 12}" text-anchor="start">${esc(o.labels.y)}</text>`;
  for (const p of pts) {
    const col = p.gas === 'CO2' ? 'var(--gas-co2)' : 'var(--gas-ch4)';
    s += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4" fill="${col}" stroke="var(--surface)" stroke-width="1.4"><title>${esc(p.title)}</title></circle>`;
  }
  return `${s}</svg>`;
}
