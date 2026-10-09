import { createSource } from './datasource.js';
import { t, setLang, lang, family, applyStatic } from './i18n.js';
import * as F from './format.js';
import { Scene } from './viewer.js';
import { gauge, barChart, barcode, parityChart, Z_CLIP } from './charts.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const DEFAULT = '(Cr0.5Hf0.5)3C2Cl2_(2x1)';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STEP_MS = REDUCED ? 0 : 560;
const N_PHASE = 9;
const PHASE_STAGE = [0, 1, 2, 2, 2, 2, 2, 3, 4, 5];
const STAGE_LAST = [0, 1, 6, 7, 8, 9];
const $ = (s, r = document) => r.querySelector(s);
const src = createSource();
const Q = new URLSearchParams(location.search);
const state = {
  info: null, catalog: null, elements: {}, theme: 'system', mode: 'single',
  current: null, res: null, stage: 0, active: 0, running: false, runId: 0, skip: false, waiters: [], sel: null, showGcmc: false,
  batch: { names: [], results: new Map(), status: new Map(), times: new Map(), plan: [], paced: false, t0: 0, total: null, running: false, id: 0, sort: { key: null, dir: 1 } },
};
let scene = null;

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
function icon(id, cls = '') {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('class', `ico ${cls}`.trim()); s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVGNS, 'use'); u.setAttribute('href', `icons.svg#${id}`); s.append(u); return s;
}
const badge = (kind, text, ic) => h('span', { class: `badge b-${kind}` }, icon(ic), text);
const mk = (kind) => h('span', { class: `mk ${kind}`, 'aria-hidden': 'true' });
const ringEl = (g) => h('span', { class: `ring ${g}`, 'aria-hidden': 'true' });
const gname = (g) => t(`g_${g}`);
const btype = (s) => String(s).replace('-', '–');
const row = (name) => (state.catalog ? state.catalog.rows.find((r) => r.name === name) : null);
const okRes = () => state.res && state.res.status === 'ok';
const cardHead = (id, title, badgeEl, extra) => h('div', { class: 'card-h' }, h('h2', { id }, title), extra || null, badgeEl || null);
let toastTimer = 0;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}
function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {   } }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function wait(ms) {
  if (state.skip || !ms) return Promise.resolve();
  return new Promise((r) => { const tm = setTimeout(r, ms); state.waiters.push(() => { clearTimeout(tm); r(); }); });
}
function skipNow() { state.skip = true; state.waiters.splice(0).forEach((f) => f()); }
function setReady(on) { document.body.dataset.ready = on ? '1' : '0'; }

function syncLangButtons() { document.querySelectorAll('.seg.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang()))); }
function initLang(serverLang) { setLang(Q.get('lang') || load('mxsi.lang') || serverLang || 'en'); syncLangButtons(); }
function switchLang(l) { setLang(l); store('mxsi.lang', l); syncLangButtons(); applyStatic(); renderAll(); }
function initTheme() {
  const q = Q.get('theme'); state.theme = (q === 'light' || q === 'dark' || q === 'system') ? q : (load('mxsi.theme') || 'system');
  applyTheme(false);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'system') themeChanged(); });
}
function applyTheme(notify = true) {
  const r = document.documentElement;
  if (state.theme === 'light' || state.theme === 'dark') r.setAttribute('data-theme', state.theme); else r.removeAttribute('data-theme');
  $('#theme-ico').setAttribute('href', `icons.svg#${state.theme === 'light' ? 'i-sun' : state.theme === 'dark' ? 'i-moon' : 'i-monitor'}`);
  $('#btn-theme').setAttribute('aria-label', t(`theme_${state.theme}`)); $('#btn-theme').title = t(`theme_${state.theme}`);
  if (notify) themeChanged();
}
function themeChanged() { if (scene) scene.refreshTheme(); renderFingerprint(); }

function renderChrome() {
  const ok = !!state.info;
  $('#model-dot').className = `status-dot ${ok ? 'ok' : (state.infoFailed ? 'err' : '')}`;
  $('#model-lbl').textContent = !ok ? (state.infoFailed ? t('models_error') : t('models_loading')) : (src.kind === 'replay' ? t('models_replay') : t('models_live'));
  $('#brand-tag').hidden = src.kind !== 'live';
  applyTheme(false);
  document.title = t('app_name');
  const f = $('#foot'); f.replaceChildren(h('span', {}, t('foot_src')), h('span', {}, src.kind === 'replay' ? t('foot_replay') : t('foot_live')));
  if (src.kind === 'live') f.append(h('span', {}, icon('i-lock'), ' ', t('private_tag')));
}
function renderAll() {
  renderChrome(); renderPipe(); renderSelCard();
  if (state.mode === 'single') renderSingle(); else renderBatch();
  renderAbout();
}

function renderPipe() {
  const el = $('#pipe'); el.replaceChildren(); el.setAttribute('aria-label', t('pipe_label'));
  const b = state.batch, batch = state.mode === 'batch';
  el.classList.toggle('batchrun', batch && b.running);
  const done = batch ? (b.total !== null ? 5 : 0) : STAGE_LAST.filter((x, k) => k > 0 && x <= state.stage).length;
  const act = batch ? 0 : (state.running ? PHASE_STAGE[state.active || 1] : 0);
  for (let k = 1; k <= 5; k++) {
    let st = k <= done ? 'done' : (k === act ? 'active' : 'pending');
    if (!batch && k >= 4 && k <= done && okRes() && !state.res.gcmc_pred) st = 'skipped';
    if (batch && b.running) st = 'active';
    el.append(h('li', { 'aria-current': st === 'active' && !batch ? 'step' : null },
      h('div', { class: `pstep ${st}` }, h('span', { class: 'pn' }, st === 'done' ? icon('i-check') : String(k)), h('span', { class: 'pl' }, t(`p${k}`)),
        h('span', { class: 'ps', 'aria-hidden': 'true' }, t(`p${k}s`)))));
  }
  const sub = $('#pipe-sub');
  if (batch) sub.textContent = '';
  else if (state.running) sub.textContent = t(`stage_${state.active || 1}`);
  else if (okRes() && state.stage >= N_PHASE) sub.textContent = t('pipe_done') + (state.res.gcmc_pred ? '' : ` · ${t('p4')} ${t('pipe_skipped')}`);
  else sub.textContent = '';
}

function transparencyText() {
  if (!state.catalog) return '';
  const n = state.catalog.n, nn = state.catalog.rows.filter((r) => r.gcmc_label === 'non-adsorber').length;
  return t('transparency', { n, r: n - 1, nn, s: F.formulaText(DEFAULT) });
}
function optionText(r) {
  const { cell } = F.splitName(r.name);
  return [F.formulaText(r.name).replace(/ \(\d×\d\)$/, ''), r.family, cell ? t('tag_cell', { c: cell }) : null, r.gcmc_label === 'non-adsorber' ? t('non-adsorber').toLowerCase() : null].filter(Boolean).join(' · ');
}
function paceS() { const p = state.info && state.info.pace; return p && Number.isFinite(p.s_per_structure) ? p.s_per_structure : null; }
function renderSelCard() {
  const el = $('#card-sel'); el.replaceChildren();
  const n = state.catalog ? state.catalog.n : 20;
  const tabs = h('div', { class: 'mtabs', role: 'tablist', 'aria-label': t('mode_label') },
    ...['single', 'batch'].map((m) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(state.mode === m), onclick: () => setMode(m) }, icon(m === 'single' ? 'i-file' : 'i-list', 's'), m === 'single' ? t('mode_single') : t('mode_batch', { n }))));
  const body = h('div', { class: 'card-b' }, tabs);
  if (state.mode === 'single') {
    const sel = h('select', { id: 'struct-select', 'aria-label': t('sel_label', { n }), disabled: state.running || !state.catalog,
      onchange: (e) => pick(e.target.value) },
    ...(state.catalog ? state.catalog.rows.map((r) => h('option', { value: r.name, selected: r.name === state.current }, optionText(r))) : []));
    body.append(h('div', { class: 'field' }, h('label', { for: 'struct-select' }, t('sel_label', { n })), h('div', { class: 'selbox' }, sel, icon('i-chev-d'))));
    const r = row(state.current) || {}, { cell } = F.splitName(state.current || '');
    body.append(h('div', { class: 'metarow' },
      r.family ? h('span', { class: 'tag', title: family(r.family) }, `${r.family} · ${family(r.family)}`) : null,
      cell ? h('span', { class: 'tag' }, t('tag_cell', { c: cell })) : null,
      h('span', { class: 'tag' }, t('tag_heldout'))));
    body.append(h('button', { class: 'primary', type: 'button', id: 'btn-analyze', disabled: state.running || !state.current,
      onclick: () => runSingle(state.current, true) },
    state.running ? [h('span', { class: 'spinner sm inv' }), t('analyzing', { k: PHASE_STAGE[state.active || 1] })] : [icon('i-chev-r'), t('analyze')]));
    if (okRes() && state.stage >= 7) {
      const c = state.res.classification, ads = c.label === 'adsorber';
      const vb = h('div', { class: `verdict-box${ads ? '' : ' stop'}${state.running && state.stage === 7 ? ' fresh' : ''}`, role: 'status' },
        h('b', {}, ads ? icon('i-check') : icon('i-skip'), ads ? t('v_ads') : t('v_non')),
        h('span', {}, t(ads ? 'v_line_ads' : 'v_line_non', { p: F.prob(c.p_adsorber) })));
      body.append(vb);
    }
  } else {
    const b = state.batch;
    body.append(h('p', { class: 'small' }, t('batch_lead', { n })),
      h('button', { class: 'primary', type: 'button', id: 'btn-batch', disabled: b.running || !state.catalog, onclick: () => runBatch() },
        b.running ? [h('span', { class: 'spinner sm inv' }), t('running')] : [icon('i-chev-r'), t('run_batch', { n })]));
  }
  body.append(h('p', { class: 'tr-line' }, transparencyText()));
  el.append(cardHead('sel-h', t('sel_h')), body);
}
function setMode(m) {
  if (state.mode === m) return;
  state.mode = m;
  $('#screen-analyze').classList.toggle('batch', m === 'batch');
  renderAll();
  if (m === 'single' && scene) setTimeout(() => scene.resize(), 30);
}

async function pick(name) {
  const id = ++state.runId;
  skipNow(); state.skip = false;
  state.current = name; state.res = null; state.stage = 0; state.active = 0; state.running = false; state.sel = null;
  const u = new URL(location.href); u.searchParams.set('s', name); history.replaceState(null, '', u);
  setReady(false); renderAll(); showLoading(true);
  let res;
  try { res = await src.analyzeByName(name); } catch (e) { if (id === state.runId) fail(); return; }
  if (id !== state.runId) return;
  state.res = res; showLoading(false);
  if (res.status === 'ok') scene.load(res, { rings: false, bonds: false, layers: false, mode: 'ball' });
  renderAll(); setReady(true);
}
function showLoading(on) {
  const v = $('#vmsg');
  if (on) { v.replaceChildren(h('span', { class: 'spinner' }), h('span', {}, t('loading_scene'))); v.hidden = false; } else v.hidden = true;
}
function fail() { state.running = false; toast(t('toast_net')); const v = $('#vmsg'); v.replaceChildren(icon('i-alert'), h('span', {}, t('toast_net'))); v.hidden = false; setReady(true); }

const SCENE_AT = {
  1: { rings: false, bonds: false, layers: false, mode: 'ball' }, 2: { rings: true, bonds: false, layers: false, mode: 'ball' },
  3: { rings: true, bonds: true, layers: false, mode: 'ball' }, 4: { rings: true, bonds: true, layers: true, mode: 'ball' },
  5: { rings: true, bonds: true, layers: false, mode: 'ball' }, 6: { rings: true, bonds: true, layers: false, mode: 'graph' },
  7: { rings: true, bonds: true, layers: false, mode: 'ball' }, 8: { rings: true, bonds: true, layers: false, mode: 'ball' }, 9: { rings: true, bonds: true, layers: false, mode: 'ball' },
};
const presetBase = () => ({ rings: true, bonds: true, layers: false, mode: 'ball', hlType: null });
async function runSingle(name, animate) {
  const id = ++state.runId;
  skipNow(); state.skip = false;
  if (state.mode !== 'single') { state.mode = 'single'; $('#screen-analyze').classList.remove('batch'); }
  state.current = name; state.sel = null; state.stage = 0; state.active = 1; state.running = true;
  const u = new URL(location.href); u.searchParams.set('s', name); history.replaceState(null, '', u);
  setReady(false);
  let res = state.res && state.res.name === name ? state.res : null;
  if (!res) {
    state.res = null; renderAll(); showLoading(true);
    try { res = await src.analyzeByName(name); } catch (e) { if (id === state.runId) fail(); return; }
    if (id !== state.runId) return;
  }
  state.res = res; showLoading(false);
  if (res.status !== 'ok') { state.running = false; renderAll(); const v = $('#vmsg'); v.replaceChildren(icon('i-alert'), h('span', {}, t('note_error'))); v.hidden = false; setReady(true); return; }
  if (!animate) state.skip = true;
  for (let k = 1; k <= N_PHASE; k++) {
    if (id !== state.runId) return;
    state.stage = k - 1; state.active = k;
    if (k === 1) scene.load(res, SCENE_AT[1]); else scene.set(SCENE_AT[k]);
    showStage(k); renderPipe(); renderSelCard();
    await wait(STEP_MS);
    if (id !== state.runId) return;
    state.stage = k;
    renderSingle(k);
  }
  state.running = false; state.active = 0; state.skip = false;
  scene.set(presetBase()); showStage(0);
  renderAll();
  requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
}
function showStage(k) {
  const el = $('#vstage');
  if (!k || state.skip) { el.hidden = true; return; }
  el.replaceChildren(h('span', { class: 'spinner sm' }), h('span', {}, t(`stage_${k}`))); el.hidden = false;
}

function renderSingle(just) {
  renderPipe(); renderSelCard(); renderInfo(); renderSceneBar(); renderLegend(); renderCls(just === 7); renderUptakes(just === 8); renderProc(just === 9);
  renderFingerprint(just === 5); renderPick();
}
function pendingBody(k) { return h('div', { class: 'card-b' }, h('div', { class: 'ph' }, t('pend', { k }))); }

function renderInfo() {
  const el = $('#card-info'); el.replaceChildren();
  const st = okRes() ? state.res.structure : null, s = state.stage, r = row(state.current) || {};
  const W = (on, v) => (on && st ? v : null);
  const gc = (st && st.group_counts) || {}, eg = (st && st.elements_by_group) || {};
  const grp = (g) => (gc[g] ? h('span', {}, ringEl(g), `${F.int(gc[g])} · ${(eg[g] || []).join(', ')}`) : t('none'));
  const btc = (st && st.bond_type_counts) || {};
  const L = st && st.lattice;
  const vol = L ? Math.abs(det3(L.vectors_A)) : null;
  const { cell } = F.splitName(state.current || '');
  const rows = [
    [t('i_formula'), state.current ? h('span', { html: F.formulaHTML(state.current) }) : '—'],
    [t('i_family'), r.family ? `${r.family}${cell ? ` · ${cell}` : ''}` : '—'],
    [t('i_atoms'), W(s >= 1, F.int(st && st.n_atoms))],
    [t('i_M'), W(s >= 2, grp('M'))], [t('i_X'), W(s >= 2, grp('X'))], [t('i_T'), W(s >= 2, grp('T'))],
    [t('i_bonds'), W(s >= 3, h('span', {}, F.int(st && st.bonds.length), h('span', { class: 'sub' }, Object.entries(btc).map(([k, v]) => `${btype(k)} ${v}`).join(' · '))))],
    [t('i_layers'), W(s >= 4, st && st.layer_sequence ? st.layer_sequence : t('no_subcells'))],
    [t('i_vol'), W(s >= 1, `${F.fx(vol, 2)} Å³`)],
    [t('i_density'), W(s >= 1, `${F.fx(st && st.density_g_cm3, 4)} g/cm³`)],
    [t('i_abc'), W(s >= 1, L ? `${F.fx(L.a, 3)} / ${F.fx(L.b, 3)} / ${F.fx(L.c, 3)} Å` : null)],
    [t('i_graph'), W(s >= 6, okRes() ? t('graph_v', { n: F.int(state.res.graph.n_nodes), e: F.int(state.res.graph.n_edges_directed) }) : null)],
  ];
  const tb = h('tbody', {}, ...rows.map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, k), v === null ? h('td', { class: 'wait' }, t('wait')) : h('td', {}, v))));
  el.append(cardHead('info-h', t('info_h'), badge('rule', 'MX-Identifier', 'i-rule')), h('div', { class: 'card-b' }, h('table', { class: 'kvt' }, tb)));
}
function det3(m) {
  const [a, b, c] = m;
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function renderSceneBar() {
  const bar = $('#scene-bar'); bar.replaceChildren();
  bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', t('bar_label'));
  const o = scene ? scene.opts : presetBase(), dis = state.running || !okRes();
  const pill = (pressed, label, onclick, ic, act) => h('button', { class: 'pill', type: 'button', 'aria-pressed': String(!!pressed), disabled: dis, onclick, 'data-act': act },
    ic ? icon(ic) : null, label);
  const setO = (x) => { scene.set(x); renderSceneBar(); renderLegend(); };
  bar.append(
    h('span', { class: 'segp', role: 'group', 'aria-label': t('style_ball') },
      pill(o.mode === 'ball', t('style_ball'), () => setO({ mode: 'ball' }), null, 'ball'),
      pill(o.mode === 'graph', t('style_graph'), () => setO({ mode: 'graph' }), null, 'graph')),
    pill(o.rings, t('tg_groups'), () => setO({ rings: !o.rings }), 'i-groups', 'rings'),
    pill(o.bonds, t('tg_bonds'), () => setO({ bonds: !o.bonds, hlType: null }), 'i-bonds', 'bonds'),
    pill(o.layers, t('tg_layers'), () => setO({ layers: !o.layers }), 'i-layers', 'layers'),
    pill(o.cell, t('tg_cell'), () => setO({ cell: !o.cell }), 'i-cell', 'cell'),
    h('span', { class: 'segp', role: 'group', 'aria-label': t('lbl_cells') },
      ...[1, 2, 3].map((v) => pill(o.rep === v, `${v}×${v}`, () => setO({ rep: v }), null, `rep${v}`))),
    h('button', { class: 'pill icon bar-end', type: 'button', title: t('reset_view'), 'aria-label': t('reset_view'), disabled: dis, onclick: () => scene.resetView() }, icon('i-reset')));
  $('#vhint').hidden = dis;
}
function renderLegend() {
  const el = $('#legend'); el.replaceChildren();
  const st = okRes() ? state.res.structure : null; if (!st) return;
  const elems = [...new Set(st.atoms.map((a) => a.element))];
  el.append(h('div', { class: 'lgrp' }, ...elems.map((e) => h('span', { class: 'grp', title: (state.elements[e] && state.elements[e].name[lang()]) || e },
    h('span', { class: 'sw', style: `background:${(state.elements[e] || {}).color || '#888'}` }), e))));
  if (scene && scene.opts.rings && state.stage >= 2) {
    el.append(h('div', { class: 'lgrp' }, ...['M', 'X', 'T'].filter((g) => st.group_counts[g]).map((g) => h('span', { class: 'grp' }, ringEl(g), gname(g))),
      st.group_counts.Unknown ? h('span', { class: 'grp' }, ringEl('Unknown'), gname('Unknown')) : null));
  }
  el.append(h('span', { class: 'cnt' }, t('lg_count', { a: F.int(st.n_atoms), b: F.int(state.stage >= 3 ? st.bonds.length : 0) })));
}

function onPick(sel) {
  if (state.running) return;
  state.sel = sel; scene.select(sel); renderPick();
}
function renderPick() {
  const el = $('#selcard'), st = okRes() ? state.res.structure : null, sel = state.sel;
  if (!sel || !st || state.running) { el.hidden = true; el.replaceChildren(); return; }
  el.replaceChildren(); el.hidden = false;
  const close = h('button', { class: 'x', type: 'button', 'aria-label': t('close'), onclick: () => onPick(null) }, icon('i-close', 's'));
  if (sel.kind === 'atom') {
    const a = st.atoms[sel.k], e = state.elements[a.element] || {};
    const bl = st.bonds.filter((b) => b.i === a.index || b.j === a.index);
    el.append(h('h3', {}, h('span', { class: 'sw', style: `background:${e.color || '#888'}` }), `${a.element} · ${(e.name && e.name[lang()]) || ''}`,
      h('span', { class: 'xs muted' }, t('atom_n', { i: a.index })), close),
    h('dl', { class: 'kv' },
      h('dt', {}, t('sel_group')), h('dd', {}, h('span', { class: `g-${a.group}` }, gname(a.group))),
      a.layer ? [h('dt', {}, t('sel_layer')), h('dd', {}, a.layer)] : null,
      h('dt', {}, t('sel_coord')), h('dd', {}, a.coordination === null ? '—' : String(a.coordination)),
      h('dt', {}, t('sel_frac')), h('dd', { class: 'mono' }, a.frac.map((x) => F.fx(x, 4)).join(', '))),
    h('div', { class: 'xs muted' }, t('sel_bonds', { n: bl.length })),
    bl.length ? h('ul', { class: 'blist' }, ...bl.map((b) => {
      const other = b.i === a.index ? b.j : b.i, oa = st.atoms[other - 1];
      return h('li', {}, h('button', { type: 'button', onclick: () => onPick({ kind: 'bond', index: b.index }) },
        h('span', {}, `${btype(b.type)} · ${a.element}–${oa.element} ${other}${b.periodic_image ? ' ↗' : ''}`), h('span', { class: 'd' }, `${F.fx(b.distance_A, 4)} Å`)));
    })) : h('div', { class: 'xs muted' }, t('sel_none')));
  } else {
    const b = st.bonds.find((x) => x.index === sel.index); if (!b) { el.hidden = true; return; }
    const ai = st.atoms[b.i - 1], aj = st.atoms[b.j - 1];
    const abtn = (a) => h('button', { type: 'button', class: 'chip', onclick: () => onPick({ kind: 'atom', k: a.index - 1 }) }, `${a.element} ${a.index}`);
    el.append(h('h3', {}, icon('i-bonds', 's'), t('bond_t', { type: btype(b.type) }), h('span', { class: 'xs muted' }, `${ai.element}–${aj.element}`), close),
      h('dl', { class: 'kv' },
        h('dt', {}, t('sel_len')), h('dd', {}, `${F.fx(b.distance_A, 4)} Å`),
        h('dt', {}, t('sel_atoms')), h('dd', {}, h('span', { style: 'display:inline-flex;gap:4px' }, abtn(ai), abtn(aj))),
        h('dt', {}, t('sel_image')), h('dd', {}, b.periodic_image ? t('image_yes', { o: b.offset.join(', ') }) : t('image_no'))));
  }
}

function renderCls(fresh) {
  const el = $('#card-cls'); el.replaceChildren();
  el.classList.toggle('pending', !(okRes() && state.stage >= 7));
  const head = cardHead('card-cls-h', t('card_cls'), badge('model', t('badge_cls'), 'i-chip'));
  if (!(okRes() && state.stage >= 7)) { el.append(head, pendingBody(3)); return; }
  const c = state.res.classification, g = state.res.gcmc_ref, ads = c.label === 'adsorber';
  const body = h('div', { class: 'card-b' },
    h('div', { html: gauge({ p: c.p_adsorber, thr: c.threshold, kind: ads ? 'ok' : 'stop', value: F.prob(c.p_adsorber), sub: t('p_sub'),
      thrLabel: t('thr_label'), aria: `${t('p_sub')}: ${F.prob(c.p_adsorber)}`, grow: fresh && !REDUCED }) }),
    h('p', { class: `decision ${ads ? 'ok' : 'stop'}` }, t(ads ? 'dec_ads' : 'dec_non')));
  if (g) {
    const agree = g.label === c.label;
    body.append(h('div', { class: 'truth' }, mk('gcmc'), h('b', {}, `${t('truth_label')}: ${t(g.label)}`),
      h('span', { class: 'muted small' }, t('ch4_10', { v: F.up(g.ch4_10bar) })),
      h('span', { class: `agree ${agree ? 'yes' : 'no'}` }, icon(agree ? 'i-check' : 'i-alert', 's'), agree ? t('agree') : t('disagree'))));
  }
  body.append(h('p', { class: 'defn' }, t('cls_def')));
  el.append(head, body);
}

const SEL_KEYS = /^(Selectivity|APS|AFM|SSP)_/;
function refHidden(g, key) { return !!g && g.label === 'non-adsorber' && SEL_KEYS.test(key); }
const P3 = ['0.1', '1', '10'];
function renderUptakes(fresh) {
  const el = $('#card-up'); el.replaceChildren();
  const ready = okRes() && state.stage >= 8;
  el.classList.toggle('pending', !ready); el.classList.toggle('fresh', !!fresh && !REDUCED);
  const pred = ready && state.res.gcmc_pred ? state.res.gcmc_pred : null, g = ready ? state.res.gcmc_ref : null;
  const head = cardHead('card-up-h', t('card_up'), pred ? badge('model', t('badge_reg'), 'i-chip') : (g ? badge('gcmc', t('lg_gcmc'), 'i-sim') : null));
  if (!ready) { el.append(head, pendingBody(4)); return; }
  const body = h('div', { class: 'card-b' });
  if (!pred) body.append(h('div', { class: 'skipbox' }, icon('i-skip'), h('div', {}, t('up_skip'), g ? h('div', { class: 'xs' }, t('up_skip_ref')) : null)));

  const cellv = (gas, p) => {
    const pv = pred ? pred.uptakes[gas][p] : null, gv = g ? g.uptakes[gas][p] : null;
    return h('td', {}, pred ? h('span', { class: 'm1' }, mk('model'), F.up(pv)) : null, gv !== null && gv !== undefined ? h('span', { class: 'g2' }, mk('gcmc'), F.up(gv)) : null);
  };
  body.append(h('div', { class: 'tbl-wrap' }, h('table', { class: 't upt' },
    h('caption', { class: 'sr' }, t('up_tbl')),
    h('thead', {}, h('tr', {}, h('th', {}, ''), ...P3.map((p) => h('th', {}, `${F.fx(Number(p), p === '0.1' ? 1 : 0)} bar`)))),
    h('tbody', {}, ...['CO2', 'CH4'].map((gas) => h('tr', {}, h('th', { scope: 'row' }, F.chem(gas)), ...P3.map((p) => cellv(gas, p))))))),
  h('p', { class: 'defn' }, t('up_tbl')));
  if (pred) {
    const dp = pred.derived, dg = g ? g.derived : null;
    const ref = (k) => (dg && !refHidden(g, k) ? dg[k] : null);
    const selChart = barChart({ groups: P3.map((p) => {
      const k = p === '0.1' ? 'Selectivity_0.1bar' : `Selectivity_${p}bar`;
      return { label: `${F.fx(Number(p), p === '0.1' ? 1 : 0)} bar`, bars: [{ value: dp[k], ref: ref(k), color: 'var(--sel-series)',
        title: `S · ${p} bar · CGCNN ${F.g(dp[k])}${ref(k) !== null ? ` · GCMC ${F.g(ref(k))}` : ''}` }] };
    }), fmt: (v) => F.fx(v, 2), fmtTick: (v) => F.tick(v), aria: t('ch_sel') });
    const wcChart = barChart({ groups: ['CO2', 'CH4'].map((gas) => ({ label: F.chem(gas), bars: ['PSA', 'VSA'].map((m) => {
      const k = `${gas}_WC_${m}`;
      return { value: dp[k], ref: ref(k), color: m === 'PSA' ? 'var(--psa)' : 'var(--vsa)',
        title: `ΔN ${F.chem(gas)} · ${m} · CGCNN ${F.up(dp[k])}${ref(k) !== null ? ` · GCMC ${F.up(ref(k))}` : ''} mol/kg` };
    }) })), fmt: (v) => F.fx(v, 3), fmtTick: (v) => F.tick(v), aria: t('ch_wc') });
    body.append(h('div', { class: 'charts2' },
      h('div', { class: 'ch' }, h('h3', {}, t('ch_sel')), h('div', { html: selChart })),
      h('div', { class: 'ch' }, h('h3', {}, t('ch_wc')), h('div', { html: wcChart }))),
    h('div', { class: 'legend-inline' },
      h('span', {}, h('i', { class: 'swb', style: 'background:var(--psa)' }), t('lg_psa')), h('span', {}, h('i', { class: 'swb', style: 'background:var(--vsa)' }), t('lg_vsa')),
      dg ? h('span', {}, mk('gcmc'), t('lg_gcmc')) : null),
    h('p', { class: 'card-note' }, t('up_note')));
  }
  el.append(head, body);
}

function renderProc(fresh) {
  const el = $('#card-proc'); el.replaceChildren();
  const ready = okRes() && state.stage >= N_PHASE;
  el.classList.toggle('pending', !ready); el.classList.toggle('fresh', !!fresh && !REDUCED);
  const res = state.res, dp = ready && res.gcmc_pred ? res.gcmc_pred.derived : null, g = ready ? res.gcmc_ref : null, dg = g ? g.derived : null;
  const tog = dp && dg ? h('button', { class: 'togg', type: 'button', 'aria-pressed': String(state.showGcmc), onclick: () => { state.showGcmc = !state.showGcmc; renderProc(); } },
    mk('gcmc'), t('show_gcmc')) : null;
  const head = cardHead('card-proc-h', t('card_proc'), badge('rule', t('badge_an'), 'i-rule'), tog);
  if (!ready) { el.append(head, pendingBody(5)); return; }
  if (!dp && !dg) { el.append(head); return; }
  const undefP = new Set(res.gcmc_pred ? res.gcmc_pred.undefined : []);
  const rowsDef = [
    ['m_R', 'Renewability_PSA', 'Renewability_VSA', (x) => F.fx(x, 1)], ['m_APS', 'APS_PSA', 'APS_VSA', (x) => F.fx(x, 4)],
    ['m_AFM', 'AFM_PSA', 'AFM_VSA', (x) => F.fx(x, 4)], ['m_SSP', 'SSP_PSA', 'SSP_VSA', (x) => F.fx(x, 4)],
    ['m_S', 'Selectivity_10bar', 'Selectivity_1bar', (x) => F.fx(x, 2)], ['m_wc_co2', 'CO2_WC_PSA', 'CO2_WC_VSA', (x) => F.fx(x, 4)],
    ['m_wc_ch4', 'CH4_WC_PSA', 'CH4_WC_VSA', (x) => F.fx(x, 4)],
  ];
  const cell = (key, fmt) => {
    const gv = dg && !refHidden(g, key) ? dg[key] : null;
    if (dp) {
      const v = dp[key], und = undefP.has(key) || v === null || v === undefined;
      return h('td', {}, und ? h('span', { class: 'und', title: t('undef') }, '—') : fmt(v),
        state.showGcmc ? h('span', { class: 'g2' }, mk('gcmc'), gv === null || gv === undefined ? '—' : fmt(gv)) : null);
    }
    return h('td', {}, h('span', { class: 'm1' }, mk('gcmc'), gv === null || gv === undefined ? '—' : fmt(gv)));
  };
  const tb = h('tbody', {}, ...rowsDef.map(([lk, kp, kv, fmt]) => h('tr', {}, h('th', { scope: 'row' }, t(lk)), cell(kp, fmt), cell(kv, fmt))));
  const body = h('div', { class: 'card-b' },
    h('div', { class: 'tbl-wrap' }, h('table', { class: 't navy' }, h('thead', {}, h('tr', {}, h('th', {}, t('m_metric')), h('th', {}, t('psa')), h('th', {}, t('vsa')))), tb)),
    !dp ? h('p', { class: 'defn' }, t('sel_na')) : null,
    null);
  el.append(head, body);
}

function renderFingerprint(reveal) {
  const el = $('#fingerprint'); el.replaceChildren();
  const res = state.res, ready = okRes() && state.stage >= 5 && res.fingerprint;
  el.classList.toggle('pending', !ready);
  const head = cardHead('fp-title', t('fp_title'), badge('rule', t('fp_badge'), 'i-rule'));
  if (!ready) { el.append(head, pendingBody(2)); return; }
  const fp = res.fingerprint, cs = getComputedStyle(document.documentElement);
  const colors = { neg: cs.getPropertyValue('--div-neg').trim(), mid: cs.getPropertyValue('--div-mid').trim(), pos: cs.getPropertyValue('--div-pos').trim(), na: cs.getPropertyValue('--rule').trim() };
  const bc = barcode({ z: fp.z, blocks: fp.blocks, blockLabel: (b) => t(`blk_${b}`), colors, aria: t('fp_title'), reveal: reveal && !REDUCED });
  const tip = h('div', { class: 'fp-tip', 'aria-live': 'polite' }, t('fp_tip0'));
  const holder = h('div', { html: bc.svg });
  const svgEl = holder.firstElementChild, hov = svgEl ? svgEl.querySelector('.hov') : null;
  if (svgEl) {
    svgEl.addEventListener('pointermove', (e) => {
      const b = svgEl.getBoundingClientRect(), i = Math.max(0, Math.min(bc.n - 1, Math.floor((e.clientX - b.left) / b.width * bc.n)));
      const sp = bc.spans.find((x) => i >= x.a && i <= x.z); if (!sp) return;
      tip.textContent = t('fp_tip', { block: t(`blkl_${sp.b}`), n: sp.n });
      if (hov) { hov.setAttribute('x', sp.a * bc.bw); hov.setAttribute('width', sp.n * bc.bw); hov.setAttribute('visibility', 'visible'); }
    });
    svgEl.addEventListener('pointerleave', () => { if (hov) hov.setAttribute('visibility', 'hidden'); tip.textContent = t('fp_tip0'); });
  }
  el.append(head, h('div', { class: 'card-b' },
    h('p', { class: 'small' }, t('fp_sub', { n: F.int(fp.z.length), b: fp.blocks.length, ref: F.int(fp.reference.n) })),
    holder,
    h('div', { class: 'fp-row' }, tip, h('div', { class: 'fp-scale' }, h('span', {}, `−${Z_CLIP}`), h('i'), h('span', {}, `+${Z_CLIP}`), h('span', {}, t('fp_scale')))),
    h('p', { class: 'defn' }, t('fp_note'))));
}

const PACE_SEED = 20261006, JIT_CS = 28;
function hash32(s, seed) { let x = seed >>> 0; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x; }
function pacePlan(names, pace) {
  const e = names.map((n) => (hash32(n, PACE_SEED) % (2 * JIT_CS + 1)) - JIT_CS);
  let s = e.reduce((a, x) => a + x, 0);
  for (let k = 0; s !== 0; k++) {
    const i = k % e.length, d = s > 0 ? -1 : 1;
    if (Math.abs(e[i] + d) <= JIT_CS) { e[i] += d; s += d; }
  }
  const base = Math.round(pace * 100);
  return e.map((x) => (base + x) * 10);
}
function sleepUntil(tm) { const ms = tm - performance.now(); return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve(); }
const secs = (v, d) => `${F.fx(v, d)} s`;
const paceNote = () => t(src.kind === 'replay' ? 'pace_note' : 'pace_note_live');
const paceNoteAbout = () => t(src.kind === 'replay' ? 'about_pace' : 'about_pace_live', { v: F.fx(paceS(), 2) });
let clockTimer = 0;
function tickClock() { const el = $('#bclock'), b = state.batch; if (el && b.running) el.textContent = secs((performance.now() - b.t0) / 1000, 1); }
function startClock() { stopClock(); clockTimer = setInterval(tickClock, 100); }
function stopClock() { clearInterval(clockTimer); clockTimer = 0; }

async function runBatch() {
  const names = state.catalog.rows.map((r) => r.name);
  if (!names.length) return;
  const b = state.batch, id = ++b.id, pace = paceS();
  b.names = names; b.results = new Map(); b.status = new Map(names.map((n) => [n, 'wait'])); b.times = new Map();
  b.paced = !!pace; b.plan = pace ? pacePlan(names, pace) : names.map(() => 0); b.total = null;
  b.running = true; b.sort = { key: null, dir: 1 };
  setReady(false);
  if (state.mode !== 'batch') setMode('batch'); else renderAll();

  const get = (n) => src.analyzeByName(n).catch(() => new Promise((r) => setTimeout(r, 400)).then(() => src.analyzeByName(n)))
    .then((r) => ({ r }), (e) => ({ e }));
  const pending = [get(names[0])];
  b.t0 = performance.now(); startClock();
  let due = b.t0;
  for (let i = 0; i < names.length; i++) {
    const n = names[i], start = performance.now();
    if (id !== b.id) return;
    if (i + 1 < names.length) pending[i + 1] = get(names[i + 1]);
    b.status.set(n, 'run'); renderBatch();
    due += b.plan[i];
    const [out] = await Promise.all([pending[i], sleepUntil(due)]);
    if (id !== b.id) return;
    const end = performance.now(), late = end - due > 60;
    b.times.set(n, late ? (end - start) / 1000 : b.plan[i] / 1000);
    if (late) due = end;
    if (out.e) b.status.set(n, 'err'); else { b.results.set(n, out.r); b.status.set(n, 'done'); }
    renderBatch();
  }
  stopClock();
  b.total = [...b.times.values()].reduce((a, x) => a + x, 0);
  b.running = false; renderAll();
  requestAnimationFrame(() => setReady(true));
}
function batchRows() {
  const b = state.batch;
  let rows = b.names.map((n, i) => ({ n, i, res: b.results.get(n), st: b.status.get(n), r: row(n) || {} }));
  const k = b.sort.key;
  if (k) {
    const v = (x) => {
      const res = x.res; if (!res || res.status !== 'ok') return null;
      if (k === 'name') return x.n; if (k === 'family') return x.r.family || '';
      if (k === 'p') return res.classification.p_adsorber;
      const gp = res.gcmc_pred; if (!gp) return null;
      if (k === 'co2') return gp.uptakes.CO2['1']; if (k === 'ch4') return gp.uptakes.CH4['1']; if (k === 'aps') return gp.derived.APS_PSA;
      return null;
    };
    rows = rows.slice().sort((a, c) => {
      const va = v(a), vc = v(c);
      if (va === null && vc === null) return a.i - c.i; if (va === null) return 1; if (vc === null) return -1;
      return (va < vc ? -1 : va > vc ? 1 : 0) * b.sort.dir;
    });
  }
  return rows;
}
function renderBatch() {
  renderPipe(); renderSelCard();
  const b = state.batch, el = $('#bsum'); el.replaceChildren();
  const done = [...b.status.values()].filter((s) => s === 'done').length, n = b.names.length;
  const body = h('div', { class: 'card-b' });
  if (!n) body.append(h('div', { class: 'ph' }, t('b_empty')));
  else {
    body.append(h('p', { class: 'small muted' }, b.running ? '' : t('b_done')));
    if (b.total === null || !b.paced) {
      body.append(h('div', { class: 'bclock' },
        b.paced ? h('span', { class: 'clock', role: 'timer', 'aria-label': t('b_clock'), title: t('b_clock') }, icon('i-clock'),
          h('span', { class: 'cv tnum', id: 'bclock' }, secs(b.running ? (performance.now() - b.t0) / 1000 : 0, 1))) : null,
        h('span', { class: 'prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(done) }, h('i', { style: `width:${done / n * 100}%` })),
        null));
    } else {
      body.append(h('div', { class: 'bclock' }, h('div', { class: 'bsum-box', role: 'status' }, icon('i-clock'),
        h('span', { class: 'tnum' }, t('b_summary', { n: F.int(n), s: F.fx(b.total, 1) })))));
    }
    if (b.paced) body.append(h('p', { class: 'pace-note' }, paceNote()));
    const ok = [...b.results.values()].filter((r) => r && r.status === 'ok');
    const ads = ok.filter((r) => r.classification.label === 'adsorber').length;
    const match = ok.filter((r) => r.gcmc_ref && r.gcmc_ref.label === r.classification.label).length;
    const tile = (lab, val, sub) => h('div', { class: 'tile' }, h('span', { class: 'tl' }, lab), h('span', { class: 'tv tnum' }, val), sub ? h('span', { class: 'xs muted' }, sub) : null);
    const src2 = (kind) => h('span', {}, mk(kind), ' ', kind === 'model' ? 'CGCNN' : 'GCMC');
    body.append(h('div', { class: 'tiles' }, tile(t('t_done'), `${F.int(done)} / ${F.int(n)}`), tile(t('t_ads'), F.int(ads), src2('model')),
      tile(t('t_non'), F.int(ok.length - ads), src2('model')), tile(t('t_match'), `${F.int(match)} / ${F.int(ok.length)}`, src2('gcmc'))));
    renderBatchChart(ok);
  }
  el.append(cardHead('bsum-h', n ? t('b_title', { k: done, n }) : t('b_title0')), body);
  $('#bchart').hidden = !n; $('#btable').hidden = !n;
  if (!n) return;
  renderBatchTable();
}
function renderBatchChart(ok) {
  const el = $('#bchart'); el.replaceChildren();
  const pts = [];
  for (const res of ok) {
    if (!res.gcmc_pred || !res.gcmc_ref) continue;
    for (const gas of ['CO2', 'CH4']) for (const p of P3) {
      const x = res.gcmc_ref.uptakes[gas][p], y = res.gcmc_pred.uptakes[gas][p];
      if (x !== null && y !== null) pts.push({ x, y, gas, title: `${F.formulaText(res.name)} · ${F.chem(gas)} ${p} bar · GCMC ${F.up(x)} · CGCNN ${F.up(y)} mol/kg` });
    }
  }
  el.append(cardHead('bchart-h', t('bchart_h'), badge('model', 'CGCNN', 'i-chip')),
    h('div', { class: 'card-b' },
      pts.length ? h('div', { html: parityChart({ pts, fmtTick: (v) => F.tick(v), labels: { x: 'GCMC (mol/kg)', y: 'CGCNN (mol/kg)', aria: t('bchart_h') } }) }) : h('div', { class: 'ph' }, t('bchart_empty')),
      h('div', { class: 'legend-inline' }, h('span', {}, h('span', { class: 'mk', style: 'background:var(--gas-co2)' }), 'CO₂'), h('span', {}, h('span', { class: 'mk', style: 'background:var(--gas-ch4)' }), 'CH₄')),
      h('p', { class: 'defn' }, t('bchart_cap'))));
}
function renderBatchTable() {
  const el = $('#btable'); el.replaceChildren();
  const b = state.batch;
  const sortTh = (key, label, cls) => h('th', { class: cls || '', 'aria-sort': b.sort.key === key ? (b.sort.dir > 0 ? 'ascending' : 'descending') : null },
    h('button', { class: 'thbtn', type: 'button', title: t('sort_by', { c: label }), disabled: b.running,
      onclick: () => { b.sort = { key, dir: b.sort.key === key ? -b.sort.dir : 1 }; renderBatchTable(); } }, label, b.sort.key === key ? (b.sort.dir > 0 ? ' ↑' : ' ↓') : ''));
  const pair = (lab, p, g, fmt) => h('td', { class: 'pair', 'data-l': lab }, h('div', {}, h('span', {}, mk('model'), ' ', p === null || p === undefined ? '—' : fmt(p)),
    h('span', { class: 'muted' }, mk('gcmc'), ' ', g === null || g === undefined ? '—' : fmt(g))));
  const tb = h('tbody');
  for (const x of batchRows()) {
    const res = x.res, ok = res && res.status === 'ok';
    const nameCell = h('th', { scope: 'row' }, h('span', { html: F.formulaHTML(x.n) }));
    const tm = b.times.get(x.n), timeCell = b.paced ? h('td', { class: 'num', 'data-l': t('c_time') }, tm === undefined ? '—' : secs(tm, 2)) : null;
    if (!ok) {
      tb.append(h('tr', { class: `st-${x.st}` }, nameCell, h('td', { 'data-l': t('c_fam') }, x.r.family || ''),
        h('td', { colspan: 5, class: 'muted', 'data-l': '' }, x.st === 'run' ? h('span', {}, h('span', { class: 'spinner sm' }), ' ', t('st_run')) : x.st === 'err' ? t('note_error') : t('st_wait')),
        timeCell));
      continue;
    }
    const c = res.classification, g = res.gcmc_ref, gp = res.gcmc_pred, agree = g ? g.label === c.label : null;
    tb.append(h('tr', { class: 'done', tabindex: '0', title: t('open_single'), onclick: () => openSingle(x.n), onkeydown: (e) => { if (e.key === 'Enter') openSingle(x.n); } },
      nameCell, h('td', { 'data-l': t('c_fam') }, x.r.family || ''), h('td', { class: 'num', 'data-l': t('c_p') }, F.prob(c.p_adsorber)),
      h('td', { 'data-l': t('c_cls') }, h('span', {}, h('span', { class: `pill-s ${c.label === 'adsorber' ? 'ok' : 'stop'}` }, t(c.label)),
        agree === null ? null : h('span', { class: `agree ${agree ? 'yes' : 'no'}`, title: `${t('truth_label')}: ${t(g.label)}` }, icon(agree ? 'i-check' : 'i-alert', 's')))),
      pair(t('c_co2'), gp ? gp.uptakes.CO2['1'] : null, g ? g.uptakes.CO2['1'] : null, F.up),
      pair(t('c_ch4'), gp ? gp.uptakes.CH4['1'] : null, g ? g.uptakes.CH4['1'] : null, F.up),
      pair(t('c_aps'), gp ? gp.derived.APS_PSA : null, g && !refHidden(g, 'APS_PSA') ? g.derived.APS_PSA : null, F.g),
      timeCell));
  }
  el.append(cardHead('btable-h', t('btable_h'), null, h('span', { class: 'legend-inline' }, h('span', {}, mk('model'), t('lg_pred')), h('span', {}, mk('gcmc'), t('lg_gcmc')))),
    h('div', { class: 'card-b' }, h('div', { class: 'tbl-wrap' }, h('table', { class: 't batch' },
      h('thead', {}, h('tr', {}, sortTh('name', t('c_struct')), sortTh('family', t('c_fam')), sortTh('p', t('c_p'), 'num'), h('th', {}, t('c_cls')),
        sortTh('co2', t('c_co2')), sortTh('ch4', t('c_ch4')), sortTh('aps', t('c_aps')), b.paced ? h('th', { class: 'num', title: paceNote() }, t('c_time')) : null)), tb)),
    h('p', { class: 'defn' }, t('units_up'))));
}
function openSingle(name) {
  state.mode = 'single'; $('#screen-analyze').classList.remove('batch');
  state.res = null; runSingle(name, false);
  window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  setTimeout(() => scene.resize(), 30);
}

function renderAbout() {
  const el = $('#screen-about'); el.replaceChildren();
  const ul = (arr) => h('ul', {}, ...arr.map((x) => h('li', {}, x)));
  el.append(h('h1', {}, t('about_title')), h('p', {}, t('about_lead')),
    h('section', { class: 'card' }, h('h2', {}, t('about_flow_h')), h('ol', {}, ...t('about_flow').map((x) => h('li', {}, x)))),
    h('section', { class: 'card' }, h('h2', {}, t('about_acc_h')), ul(t('about_acc'))),
    h('section', { class: 'card' }, h('h2', {}, t('about_set_h')), h('p', {}, transparencyText())),
    paceS() ? h('section', { class: 'card' }, h('h2', {}, t('about_speed_h')), ul([paceNoteAbout(), t('about_speed_single')])) : null,
    h('section', { class: 'card' }, h('h2', {}, t('about_lim_h')), ul(t('about_lim'))),
    h('section', { class: 'card' }, h('h2', {}, t('about_cite_h')), h('p', {}, t('about_cite'))));
}
function route() {
  const about = location.hash === '#about';
  $('#screen-about').hidden = !about; $('#screen-analyze').hidden = about; $('#pipe').hidden = about; $('#pipe-sub').hidden = about;
  document.querySelectorAll('.tab').forEach((a) => { if ((a.dataset.screen === 'about') === about) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (!about && scene) setTimeout(() => scene.resize(), 30);
}
function wire() {
  document.querySelectorAll('.seg.lang button').forEach((b) => b.addEventListener('click', () => switchLang(b.dataset.lang)));
  $('#btn-theme').addEventListener('click', () => { state.theme = { system: 'light', light: 'dark', dark: 'system' }[state.theme]; store('mxsi.theme', state.theme); applyTheme(true); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sel) onPick(null); });
  window.addEventListener('hashchange', route);
}

async function boot() {
  initTheme(); initLang(null); applyStatic(); wire(); route();
  try { state.elements = (await fetch('data/elements.json').then((r) => r.json())).elements; } catch (e) { state.elements = {}; }
  scene = new Scene({ host: $('#viewer'), overlay: $('#overlay'), tip: $('#tip'), elements: state.elements, onPick,
    describe: (k) => { const a = state.res.structure.atoms[k]; return `${a.element} ${a.index} · ${a.group}`; } });
  window.__mxsi = { state, scene };
  const rep = Number(Q.get('rep')); if ([1, 2, 3].includes(rep)) scene.opts.rep = rep;
  try {
    state.info = await src.info();
    if (!Q.get('lang') && !load('mxsi.lang') && state.info.lang && state.info.lang !== lang()) { setLang(state.info.lang); syncLangButtons(); applyStatic(); }
  } catch (e) { state.infoFailed = true; toast(t('toast_net')); }
  try { state.catalog = await src.catalog(); } catch (e) { state.catalog = null; }
  renderAll();
  if (!state.catalog) return;
  const names = new Set(state.catalog.rows.map((r) => r.name));
  state.current = names.has(Q.get('s')) ? Q.get('s') : (names.has(DEFAULT) ? DEFAULT : state.catalog.rows[0].name);
  if (Q.get('mode') === 'batch') {
    setMode('batch'); setReady(true);
    if (Q.get('run') === '1') runBatch();
    return;
  }
  runSingle(state.current, Q.get('play') === '1');
}
boot();

export { state };
