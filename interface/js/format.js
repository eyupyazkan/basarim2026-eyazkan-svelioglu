import { locale } from './i18n.js';

const nf = new Map();
function fmtr(min, max, sig) {
  const k = `${locale()}|${min}|${max}|${sig || ''}`;
  if (!nf.has(k)) {
    nf.set(k, new Intl.NumberFormat(locale(), sig ? { maximumSignificantDigits: sig, minimumSignificantDigits: sig }
      : { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  return nf.get(k);
}
const DASH = '—';

export function fx(x, d = 2) { return (x === null || x === undefined || !Number.isFinite(x)) ? DASH : fmtr(d, d).format(x); }

export function up(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const a = Math.abs(x);
  if (a === 0) return fmtr(0, 0).format(0);
  if (a >= 100) return fmtr(1, 1).format(x);
  if (a >= 10) return fmtr(2, 2).format(x);
  if (a >= 0.01) return fmtr(4, 4).format(x);
  return fmtr(0, 0, 3).format(x);
}

export function g(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const a = Math.abs(x);
  if (a >= 1000) return fmtr(0, 0).format(x);
  if (a === 0) return fmtr(0, 0).format(0);
  return fmtr(0, 0, 4).format(x);
}

export function prob(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return DASH;
  if (p >= 0.99995) return `> ${fmtr(4, 4).format(0.9999)}`;
  if (p < 0.00005) return `< ${fmtr(4, 4).format(0.0001)}`;
  return fmtr(4, 4).format(p);
}

export function tick(x) { return (x === null || x === undefined || !Number.isFinite(x)) ? DASH : fmtr(0, 4).format(Number(x.toPrecision(6))); }
export function int(x) { return (x === null || x === undefined) ? DASH : fmtr(0, 0).format(x); }

const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '.': '.' };
export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function splitName(name) {
  const m = /_\((\d)x(\d)\)$/.exec(name || '');
  return { core: m ? name.slice(0, m.index) : (name || ''), cell: m ? `${m[1]}×${m[2]}` : null };
}

export function formulaHTML(name) {
  const { core } = splitName(name);
  return esc(core).replace(/\d+(?:\.\d+)?/g, (n) => `<sub>${n}</sub>`);
}

export function formulaText(name) {
  const { core, cell } = splitName(name);
  const f = core.replace(/\d+(?:\.\d+)?/g, (n) => n.split('').map((c) => SUB[c] || c).join(''));
  return cell ? `${f} (${cell})` : f;
}

export function chem(s) { return String(s).replace(/CO2/g, 'CO₂').replace(/CH4/g, 'CH₄'); }
