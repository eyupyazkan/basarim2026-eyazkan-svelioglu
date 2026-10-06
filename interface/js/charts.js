import { esc, up as fmtUp } from './format.js';

const P = ['0.1', '1', '10'];
const GAS = [{ k: 'CO2', lab: 'CO₂', col: 'var(--gas-co2)' }, { k: 'CH4', lab: 'CH₄', col: 'var(--gas-ch4)' }];

function niceLin(max) {
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw || 1)), n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  const ticks = []; for (let v = 0; v <= max * 1.0001 + step; v += step) { ticks.push(v); if (v >= max) break; }
  return ticks;
}

export function uptakeChart(o) {
  const W = 440, H = 228, ml = 48, mr = 46, mt = 24, mb = 40;
  const vals = [];
  for (const src of [o.pred, o.gcmc]) if (src) for (const g of GAS) for (const p of P) { const v = src[g.k][p]; if (v !== null && v !== undefined) vals.push(v); }
  if (!vals.length) return { svg: '', log: true };
  const log = vals.every((v) => v > 0);
  let y0, y1, ticks;
  if (log) {
    const lo = Math.log10(Math.min(...vals)), hi = Math.log10(Math.max(...vals));
    y0 = Math.floor((lo - 0.12) * 2) / 2; y1 = Math.ceil((hi + 0.12) * 2) / 2;
    if (y1 - y0 < 1) y1 = y0 + 1;
    ticks = []; for (let e = Math.ceil(y0); e <= Math.floor(y1); e++) ticks.push(e);
    if (ticks.length < 2) ticks = [y0, y1];
  } else {
    const mx = Math.max(...vals.map((v) => Math.max(v, 0)));
    ticks = niceLin(mx || 1); y0 = Math.min(0, Math.min(...vals)); y1 = ticks[ticks.length - 1];
  }
  const X = (p) => ml + (Math.log10(Number(p)) + 1.15) / 2.3 * (W - ml - mr);
  const Y = (v) => { const u = log ? Math.log10(v) : v; return mt + (1 - (u - y0) / (y1 - y0)) * (H - mt - mb); };
  const tickLab = (e) => (log ? o.fmtTick(10 ** e) : o.fmtTick(e));
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.labels.aria || '')}">`;
  for (const e of ticks) {
    const y = Y(log ? 10 ** e : e);
    s += `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/><text x="${ml - 8}" y="${y + 4}" text-anchor="end">${esc(tickLab(e))}</text>`;
  }
  s += `<line class="axis" x1="${ml}" x2="${W - mr}" y1="${H - mb}" y2="${H - mb}"/>`;
  for (const p of P) s += `<line class="axis" x1="${X(p)}" x2="${X(p)}" y1="${H - mb}" y2="${H - mb + 4}"/><text x="${X(p)}" y="${H - mb + 17}" text-anchor="middle">${esc(o.fmtTick(Number(p)))}</text>`;
  s += `<text x="${(ml + W - mr) / 2}" y="${H - 4}" text-anchor="middle">${esc(o.labels.x)}</text>`;
  s += `<text x="${ml - 8}" y="${mt - 10}" text-anchor="end">${esc(o.labels.y)}</text>`;
  const ends = [];
  for (const g of GAS) {
    if (o.pred) {
      const pts = P.map((p) => [X(p), Y(o.pred[g.k][p]), o.pred[g.k][p], p]).filter((q) => Number.isFinite(q[1]));
      s += `<polyline points="${pts.map((q) => `${q[0]},${q[1]}`).join(' ')}" fill="none" stroke="${g.col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      for (const q of pts) s += `<circle cx="${q[0]}" cy="${q[1]}" r="4.6" fill="var(--surface)" stroke="${g.col}" stroke-width="2.2"><title>${esc(`${g.lab} · ${q[3]} bar · ${o.labels.pred}: ${fmtUp(q[2])} mol/kg`)}</title></circle>`;
      if (pts.length) ends.push({ y: pts[pts.length - 1][1], lab: g.lab });
    }
    if (o.gcmc) {
      const pts = P.map((p) => [X(p), Y(o.gcmc[g.k][p]), o.gcmc[g.k][p], p]).filter((q) => Number.isFinite(q[1]));
      for (const q of pts) s += `<circle cx="${q[0]}" cy="${q[1]}" r="4.2" fill="${g.col}" stroke="var(--surface)" stroke-width="1.6"><title>${esc(`${g.lab} · ${q[3]} bar · ${o.labels.gcmc}: ${fmtUp(q[2])} mol/kg`)}</title></circle>`;
      if (!o.pred && pts.length) ends.push({ y: pts[pts.length - 1][1], lab: g.lab });
    }
  }
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  for (const e of ends) s += `<text class="lab" x="${W - mr + 9}" y="${e.y + 4}">${esc(e.lab)}</text>`;
  s += '</svg>';
  return { svg: s, log };
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
  s += '</svg>';
  return { svg: s, spans, n, bw };
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
  s += '</svg>';
  return s;
}
