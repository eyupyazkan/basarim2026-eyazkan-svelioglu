import { createSource } from './datasource.js';
import { t, setLang, lang, family, applyStatic } from './i18n.js';
import * as F from './format.js';
import { Scene } from './viewer.js';
import { uptakeChart, barcode, parityChart, Z_CLIP } from './charts.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const DEFAULT = '(Cr0.5Hf0.5)3C2Cl2_(2x1)';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STEP_MS = REDUCED ? 0 : 620;
const $ = (s, r = document) => r.querySelector(s);
const src = createSource();
const Q = new URLSearchParams(location.search);
const state = {
  info: null, catalog: null, elements: {}, theme: 'system', mode: 'single',
  current: null, res: null, stage: 0, running: false, runId: 0, skip: false, waiters: [], sel: null, step: null,
  selected: new Set(),
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

function syncLangButtons() {
  document.querySelectorAll('.seg.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang())));
}
function initLang(serverLang) { setLang(Q.get('lang') || load('mxsi.lang') || serverLang || 'en'); syncLangButtons(); }
function switchLang(l) {
  setLang(l); store('mxsi.lang', l); syncLangButtons(); applyStatic();
  renderChrome(); renderRail();
  if (state.res) renderSingle();
  renderBatch(); renderAbout();
}
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
function themeChanged() { if (scene) scene.refreshTheme(); if (state.res) { renderResults(); renderFingerprint(); } renderBatch(); }

function renderChrome() {
  const kind = src.kind, ok = !!state.info;
  $('#model-dot').className = `status-dot ${ok ? 'ok' : (state.infoFailed ? 'err' : '')}`;
  $('#model-lbl').textContent = !ok ? (state.infoFailed ? t('models_error') : t('models_loading')) : (kind === 'replay' ? t('models_replay') : t('models_live'));
  $('#brand-tag').hidden = kind !== 'live';
  applyTheme(false);
  document.title = t('app_name');
  renderFoot();
}
function renderFoot() {
  const el = $('#foot'); el.replaceChildren();
  el.append(h('span', {}, t('foot_src')), h('span', {}, src.kind === 'replay' ? t('foot_replay') : t('foot_live')));
  if (src.kind === 'live') el.append(h('span', {}, icon('i-lock'), ' ', t('private_tag')));
}

function transparencyText() {
  if (!state.catalog) return '';
  const n = state.catalog.n, nn = state.catalog.rows.filter((r) => r.gcmc_label === 'non-adsorber').length;
  return t('transparency', { n, r: n - 1, nn, s: F.formulaText(DEFAULT) });
}
function renderRail() {
  const seg = $('#mode-seg'); seg.replaceChildren(); seg.setAttribute('aria-label', t('mode_label'));
  for (const m of ['single', 'batch']) {
    seg.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(state.mode === m), class: 'mode-btn',
      onclick: () => setMode(m) }, icon(m === 'single' ? 'i-file' : 'i-list', 's'), t(`mode_${m}`)));
  }
  $('#rail-lead').replaceChildren(h('span', {}, t(state.mode === 'single' ? 'lead_single' : 'lead_batch')), h('span', { class: 'xs muted tr-line' }, transparencyText()));
  const list = $('#list'); list.replaceChildren();
  list.setAttribute('role', state.mode === 'single' ? 'listbox' : 'group');
  if (!state.catalog) return;
  for (const r of state.catalog.rows) {
    const { cell } = F.splitName(r.name);
    const meta = [r.family, cell ? t('tag_cell', { c: cell }) : null, r.termination ? `T = ${r.termination}` : null].filter(Boolean).join(' · ');
    const lab = r.gcmc_label === 'non-adsorber' ? h('span', { class: 'lab tag stop' }, t('non-adsorber')) : null;
    if (state.mode === 'single') {
      list.append(h('li', {}, h('button', { class: 'item', type: 'button', role: 'option', 'aria-selected': String(r.name === state.current),
        'data-name': r.name, title: F.formulaText(r.name), onclick: () => { closeRail(); runSingle(r.name, true); } },
      h('span', { class: 'f', html: F.formulaHTML(r.name) }), h('span', { class: 'm' }, meta), lab)));
    } else {
      const st = state.batch.status.get(r.name);
      const id = `chk-${r.id}`;
      list.append(h('li', {}, h('label', { class: 'item chk', for: id },
        h('input', { type: 'checkbox', id, checked: state.selected.has(r.name), disabled: state.batch.running,
          onchange: (e) => { if (e.target.checked) state.selected.add(r.name); else state.selected.delete(r.name); renderRailFoot(); } }),
        h('span', { class: 'f', html: F.formulaHTML(r.name) }), h('span', { class: 'm' }, meta),
        st === 'done' ? h('span', { class: 'lab ok-ico', title: t('b_done') }, icon('i-check', 's')) : st === 'run' ? h('span', { class: 'lab spinner sm' }) : lab)));
    }
  }
  renderRailFoot();
}
function renderRailFoot() {
  const f = $('#rail-foot'); f.replaceChildren();
  if (state.mode !== 'batch') { f.hidden = true; return; }
  f.hidden = false;
  const n = state.selected.size;
  f.append(h('div', { class: 'foot-row' },
    h('button', { class: 'linkbtn', type: 'button', disabled: state.batch.running, onclick: () => { state.catalog.rows.forEach((r) => state.selected.add(r.name)); renderRail(); } }, t('sel_all')),
    h('button', { class: 'linkbtn', type: 'button', disabled: state.batch.running, onclick: () => { state.selected.clear(); renderRail(); } }, t('sel_clear'))),
  h('button', { class: 'primary', type: 'button', disabled: !n || state.batch.running, onclick: () => { closeRail(); runBatch(); } },
    state.batch.running ? h('span', { class: 'spinner sm inv' }) : icon('i-chev-r', 's'),
    state.batch.running ? t('running') : (n === 0 ? t('run_batch_none') : n === 1 ? t('run_batch_one') : t('run_batch', { n }))));
}
function setMode(m) {
  state.mode = m;
  $('#view-single').hidden = m !== 'single'; $('#view-batch').hidden = m !== 'batch';
  renderRail(); renderPicker();
  if (m === 'single' && scene) setTimeout(() => scene.resize(), 30);
  if (m === 'batch') renderBatch();
}
function renderPicker() {
  $('#picker-cur').textContent = state.mode === 'single' ? `${t('picker_single')} · ${state.current ? F.formulaText(state.current) : ''}` : t('picker_batch');
}
function openRail() { $('#rail').classList.add('open'); $('#scrim').hidden = false; }
function closeRail() { if (!$('#rail').classList.contains('open')) return; $('#rail').classList.remove('open'); $('#scrim').hidden = true; }

const SCENE_AT = {
  1: { rings: false, bonds: false, layers: false, mode: 'ball' }, 2: { rings: true, bonds: false, layers: false, mode: 'ball' },
  3: { rings: true, bonds: true, layers: false, mode: 'ball' }, 4: { rings: true, bonds: true, layers: true, mode: 'ball' },
  5: { rings: true, bonds: true, layers: false, mode: 'ball' }, 6: { rings: true, bonds: true, layers: false, mode: 'graph' },
  7: { rings: true, bonds: true, layers: false, mode: 'ball' }, 8: { rings: true, bonds: true, layers: false, mode: 'ball' },
};
async function runSingle(name, animate) {
  const id = ++state.runId;
  skipNow(); state.skip = false;
  if (state.mode !== 'single') setMode('single');
  state.current = name; state.sel = null; state.step = null; state.stage = 0; state.running = true; state.res = null;
  setReady(false); markList(); renderPicker();
  const u = new URL(location.href); u.searchParams.set('s', name); history.replaceState(null, '', u);
  renderSingle();
  $('#vmsg').replaceChildren(h('span', { class: 'spinner' }), h('span', {}, t('stage_1'))); $('#vmsg').hidden = false;
  let res;
  try { res = await src.analyzeByName(name); } catch (e) { if (id === state.runId) failSingle(e); return; }
  if (id !== state.runId) return;
  state.res = res;
  if (res.status !== 'ok') { state.running = false; state.stage = 0; renderSingle(); $('#vmsg').replaceChildren(icon('i-alert'), h('span', {}, t('note_error').replace(/<[^>]+>/g, ''))); setReady(true); return; }
  $('#vmsg').hidden = true;
  if (!animate) state.skip = true;
  for (let k = 1; k <= 8; k++) {
    if (id !== state.runId) return;
    state.stage = k - 1; state.active = k;
    renderStripAll();
    if (k === 1) scene.load(res, SCENE_AT[1]); else scene.set(SCENE_AT[k]);
    showStage(k);
    await wait(STEP_MS);
    if (id !== state.runId) return;
    state.stage = k;
    renderSingle(k);
  }
  state.running = false; state.active = 0; state.skip = false;
  scene.set(presetBase()); showStage(0);
  renderSingle(); renderSceneBar();
  requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
}
function failSingle(e) {
  state.running = false;
  toast(t('toast_net'));
  $('#vmsg').replaceChildren(icon('i-alert'), h('span', {}, t('toast_net'))); $('#vmsg').hidden = false;
  setReady(true);
}
function showStage(k) {
  const el = $('#vstage');
  if (!k || state.skip) { el.hidden = true; return; }
  el.replaceChildren(h('span', { class: 'spinner sm' }), h('span', {}, t(`stage_${k}`))); el.hidden = false;
}
function presetBase() { return { rings: true, bonds: true, layers: false, mode: 'ball', hlType: null }; }
function markList() { document.querySelectorAll('#list .item[data-name]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.name === state.current))); }

function renderSingle(just) {
  renderHead(); renderNotes(); renderStripAll(); renderLegend(); renderIdGrid(); renderResults(just); renderFingerprint(just === 5); renderSel(); renderSceneBar();
}
function renderStripAll() { renderStripBar(); renderStrip(); }

function renderHead() {
  const el = $('#head'); el.replaceChildren();
  const name = state.current; if (!name) return;
  const r = row(name) || {}, res = state.res, st = res && res.structure, g = res && res.gcmc_ref;
  const { cell } = F.splitName(name);
  const tags = h('div', { class: 'tags' },
    r.family ? h('span', { class: 'tag outline', title: r.template || '' }, family(r.family)) : null,
    cell ? h('span', { class: 'tag outline' }, t('tag_cell', { c: cell })) : null,
    h('span', { class: 'tag' }, t('tag_heldout')),
    g ? h('span', { class: `tag ${g.label === 'adsorber' ? 'ok' : 'stop'}` }, mk('gcmc'), t('tag_gcmc', { l: t(g.label) })) : null);
  el.append(h('div', { class: 'head-l' }, h('span', { class: 'eyebrow' }, t('eyebrow')),
    h('h1', { class: 'formula', html: F.formulaHTML(name), 'aria-label': F.formulaText(name) }), tags));
  const s = state.stage;
  el.append(h('dl', { class: 'head-r' },
    h('div', { class: 'kv-mini' }, h('dt', {}, t('kv_atoms')), h('dd', {}, st && s >= 1 ? F.int(st.n_atoms) : '—')),
    h('div', { class: 'kv-mini' }, h('dt', {}, t('kv_bonds')), h('dd', {}, st && s >= 3 ? F.int(st.bonds.length) : '—')),
    h('div', { class: 'kv-mini' }, h('dt', {}, t('kv_density')), h('dd', {}, st && s >= 1 ? `${F.fx(st.density_g_cm3, 3)} g/cm³` : '—'))));
}
function renderNotes() {
  const el = $('#notes'); el.replaceChildren();
  if (state.res && state.res.status !== 'ok') el.append(h('div', { class: 'note err' }, icon('i-alert'), h('div', { html: t('note_error') })));
}
function renderStripBar() {
  const el = $('#strip-bar'); el.replaceChildren();
  if (!state.current) return;
  if (state.running) {
    const k = state.active || 1;
    el.append(h('span', { class: 'run-state on' }, h('span', { class: 'spinner sm' }), t('run_step', { k, what: t(`stage_${k}`) })),
      h('span', { class: 'prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '8', 'aria-valuenow': String(state.stage) }, h('i', { style: `width:${state.stage / 8 * 100}%` })),
      h('button', { class: 'linkbtn', type: 'button', onclick: skipNow }, t('run_skip')));
  } else if (state.res && state.res.status === 'ok') {
    const pace = paceS();
    el.append(h('span', { class: 'run-state' }, icon('i-check', 's'), t('run_done')),
      pace ? h('span', { class: 'mtime', title: t('model_time_tip') }, icon('i-clock', 's'), t('model_time', { v: F.fx(pace, 2) })) : null,
      h('button', { class: 'ghostbtn', type: 'button', onclick: () => runSingle(state.current, true) }, icon('i-reset', 's'), t('run_again')));
  }
}
function layerSeq(st) { return st.layer_sequence || t('no_subcells'); }
function stepState(k) {
  if (!state.res && !state.running) return 'pending';
  if (k <= state.stage) return (k === 8 && state.res && !state.res.gcmc_pred) ? 'skipped' : 'done';
  if (state.running && k === state.active) return 'active';
  return 'pending';
}
function renderStrip() {
  const el = $('#strip'); el.replaceChildren();
  const res = state.res, st = res && res.structure, gc = (st && st.group_counts) || {};
  const btc = (st && st.bond_type_counts) || {};
  const cls = res && res.classification, gm = res && res.gcmc_pred;
  const val = (k) => {
    if (stepState(k) === 'pending' || stepState(k) === 'active') return state.running ? (stepState(k) === 'active' ? '…' : t('step_pending')) : '—';
    switch (k) {
      case 1: return t('s1v', { n: F.int(st.n_atoms), a: F.fx(st.lattice.a, 3), b: F.fx(st.lattice.b, 3) });
      case 2: return t('s2v', { m: gc.M, x: gc.X, t: gc.T }) + (gc.Unknown ? ` · ? ${gc.Unknown}` : '');
      case 3: return t('s3v', { n: F.int(st.bonds.length), types: Object.entries(btc).map(([kk, v]) => `${btype(kk)} ${v}`).join(' · ') });
      case 4: return layerSeq(st);
      case 5: return res.fingerprint ? t('s5v', { n: F.int(res.fingerprint.z.length) }) : '—';
      case 6: return t('s6v', { n: F.int(res.graph.n_nodes), e: F.int(res.graph.n_edges_directed) });
      case 7: return t('s7v', { p: F.prob(cls.p_adsorber), label: t(cls.label) });
      case 8: return gm ? t('s8v') : t('s8skip');
      default: return '—';
    }
  };
  const mkStep = (k, key) => {
    const ss = stepState(k);
    return h('li', {}, h('button', {
      class: `step ${ss}`, type: 'button', 'aria-pressed': String(state.step === k), disabled: state.running,
      'aria-label': `${k}. ${t(key)}: ${val(k)}`, onclick: () => applyStep(k),
    }, h('span', { class: 'st' }, h('span', { class: 'sn' }, String(k)), h('span', {}, t(key))), h('span', { class: 'sv' }, val(k)),
    ss === 'skipped' ? h('span', { class: 'ss', title: t('step_skipped') }, icon('i-skip', 's')) : null));
  };
  el.append(
    h('div', {}, h('div', { class: 'strip-lab' }, icon('i-rule', 's'), h('span', {}, h('span', { lang: 'en' }, 'MX-Identifier'), ` · ${t('strip_idf')}`)),
      h('ol', { class: 'steps idf' }, ...[1, 2, 3, 4, 5, 6].map((k) => mkStep(k, `s${k}`)))),
    h('div', {}, h('div', { class: 'strip-lab' }, icon('i-chip', 's'), h('span', {}, h('span', { lang: 'en' }, 'CGCNN'), ` ${t('strip_mdl')}`)),
      h('ol', { class: 'steps mdl' }, mkStep(7, 's7'), mkStep(8, 's8'))));
}
const PRESET = {
  1: { rings: false, bonds: false, layers: false, mode: 'ball', hlType: null }, 2: { rings: true, bonds: false, layers: false, mode: 'ball', hlType: null },
  3: { rings: true, bonds: true, layers: false, mode: 'ball' }, 4: { rings: true, bonds: true, layers: true, mode: 'ball', hlType: null },
  6: { rings: true, bonds: true, layers: false, mode: 'graph', hlType: null },
};
function applyStep(n) {
  if (state.running || !state.res || state.res.status !== 'ok') return;
  state.step = state.step === n ? null : n;
  if (PRESET[n]) { scene.set(state.step === null ? presetBase() : PRESET[n]); renderSceneBar(); renderIdGrid(); }
  const target = { 5: '#fingerprint', 7: '#card-cls', 8: '#card-up' }[n];
  if (target && state.step === n) { const el = $(target); if (el) el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); }
  if (PRESET[n] && state.step === n && matchMedia('(max-width: 1023px)').matches) $('#scene').scrollIntoView({ block: 'start' });
  renderStrip();
}

function renderSceneBar() {
  const bar = $('#scene-bar'); bar.replaceChildren();
  bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', t('bar_label'));
  const o = scene ? scene.opts : presetBase(), dis = state.running || !state.res || state.res.status !== 'ok';
  const tg = (key, ic, label) => h('button', { class: 'tg', type: 'button', 'aria-pressed': String(!!o[key]), title: label, disabled: dis,
    onclick: () => { scene.set({ [key]: !o[key] }); state.step = null; renderSceneBar(); renderStrip(); } }, icon(ic), h('span', { class: 'lbl' }, label));
  const seg = (vals, cur, fn, lab) => h('div', { class: 'seg-s', role: 'group', 'aria-label': lab },
    vals.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(cur === v), disabled: dis, onclick: () => { fn(v); renderSceneBar(); } }, l)));
  bar.append(tg('rings', 'i-groups', t('tg_groups')), tg('bonds', 'i-bonds', t('tg_bonds')), tg('layers', 'i-layers', t('tg_layers')), tg('cell', 'i-cell', t('tg_cell')),
    h('span', { class: 'bar-sep' }),
    seg([[1, '1×1'], [2, '2×2'], [3, '3×3']], o.rep, (v) => scene.set({ rep: v }), t('lbl_cells')),
    seg([['ball', t('style_ball')], ['graph', t('style_graph')]], o.mode, (v) => { scene.set({ mode: v }); state.step = null; renderStrip(); }, t('style_graph')),
    h('button', { class: 'tg icon bar-end', type: 'button', title: t('reset_view'), 'aria-label': t('reset_view'), disabled: dis, onclick: () => scene.resetView() }, icon('i-reset')));
  $('#vhint').hidden = dis;
}
function renderLegend() {
  const el = $('#legend'); el.replaceChildren();
  const st = state.res && state.res.structure; if (!st || state.stage < 1) return;
  const elems = [...new Set(st.atoms.map((a) => a.element))];
  el.append(
    h('div', { class: 'lgrp' }, h('span', { class: 'lt' }, t('lg_fill')),
      ...elems.map((e) => h('span', { class: 'grp', title: (state.elements[e] && state.elements[e].name[lang()]) || e },
        h('span', { class: 'sw', style: `background:${(state.elements[e] || {}).color || '#888'}` }), e))),
    state.stage >= 2 ? h('div', { class: 'lgrp' }, h('span', { class: 'lt' }, t('lg_ring')),
      ...['M', 'X', 'T'].map((g) => h('span', { class: 'grp' }, ringEl(g), gname(g))),
      st.group_counts.Unknown ? h('span', { class: 'grp' }, ringEl('Unknown'), gname('Unknown')) : null) : null);
}
function renderIdGrid() {
  const el = $('#idgrid'); el.replaceChildren();
  const st = state.res && state.res.structure; if (!st || state.stage < 1) return;
  const L = st.lattice, s = state.stage;
  const cellBox = h('div', { class: 'idcell' }, h('h3', {}, t('id_lattice')),
    h('table', { class: 'lat' },
      h('tr', {}, h('th', {}, 'a / Å'), h('th', {}, 'b / Å'), h('th', {}, 'c / Å')),
      h('tr', {}, h('td', {}, F.fx(L.a, 3)), h('td', {}, F.fx(L.b, 3)), h('td', {}, F.fx(L.c, 3))),
      h('tr', {}, h('th', {}, 'α / °'), h('th', {}, 'β / °'), h('th', {}, 'γ / °')),
      h('tr', {}, h('td', {}, F.fx(L.alpha, 1)), h('td', {}, F.fx(L.beta, 1)), h('td', {}, F.fx(L.gamma, 1)))),
    h('span', { class: 'xs muted' }, `${t('id_density')} ${F.fx(st.density_g_cm3, 4)} g/cm³`));
  const gc = st.group_counts, eg = st.elements_by_group || {};
  const groups = h('div', { class: 'idcell' }, h('h3', {}, t('id_groups')), s < 2 ? h('span', { class: 'xs muted' }, t('step_pending')) : null,
    ...(s >= 2 ? ['M', 'X', 'T', 'Unknown'].filter((g) => gc[g]).map((g) => h('div', { class: 'ly' }, ringEl(g), h('b', {}, g), h('span', { class: 'tnum' }, `${gc[g]}`), h('span', { class: 'muted' }, (eg[g] || []).join(', ')))) : []));
  const btc = st.bond_type_counts || {};
  const bonds = h('div', { class: 'idcell' }, h('h3', {}, t('id_bonds')), s < 3 ? h('span', { class: 'xs muted' }, t('step_pending')) : null,
    s >= 3 ? h('div', { class: 'chips' }, ...Object.entries(btc).map(([k, v]) => h('button', { class: 'chip', type: 'button', disabled: state.running,
      'aria-pressed': String(scene && scene.opts.hlType === k), title: t('id_bonds_hint'),
      onclick: () => { const on = scene.opts.hlType === k ? null : k; scene.set({ hlType: on, bonds: true }); renderIdGrid(); renderSceneBar(); } },
    btype(k), h('span', { class: 'n' }, F.int(v))))) : null,
    s >= 3 ? h('span', { class: 'xs muted' }, t('id_bonds_hint')) : null);
  const lo = st.layers_top_down || [];
  const layers = h('div', { class: 'idcell' }, h('h3', {}, t('id_layers')), s < 4 ? h('span', { class: 'xs muted' }, t('step_pending')) : null,
    s >= 4 ? (lo.length ? h('div', { class: 'layerstack' }, ...lo.map((x) => h('div', { class: `ly ${x.group}` }, h('i'), h('b', {}, x.label), h('span', { class: 'muted' }, x.elements.join(', '))))) : h('span', { class: 'small muted' }, t('no_subcells'))) : null);
  el.append(cellBox, groups, bonds, layers);
}

function onPick(sel) { if (state.running) return; state.sel = sel; scene.select(sel); renderSel(); }
function renderSel() {
  const el = $('#selcard'), st = state.res && state.res.structure, sel = state.sel;
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
        h('dt', {}, t('sel_atoms')), h('dd', {}, h('span', { class: 'chips', style: 'justify-content:flex-end' }, abtn(ai), abtn(aj))),
        h('dt', {}, t('sel_image')), h('dd', {}, b.periodic_image ? t('image_yes', { o: b.offset.join(', ') }) : t('image_no'))));
  }
}

function card(id, title, badgeEl, ...body) {
  return h('section', { class: 'card', id, 'aria-labelledby': `${id}-h` },
    h('div', { class: 'card-h' }, h('h2', { id: `${id}-h` }, title), badgeEl), h('div', { class: 'card-b' }, ...body));
}
function pendingCard(id, title, badgeEl, text) {
  return h('section', { class: 'card pending', id, 'aria-labelledby': `${id}-h` },
    h('div', { class: 'card-h' }, h('h2', { id: `${id}-h` }, title), badgeEl), h('div', { class: 'card-b' }, h('p', { class: 'small muted' }, text)));
}
function renderResults(just) {
  const el = $('#results'); el.replaceChildren();
  const res = state.res;
  if (!state.current) return;
  if (res && res.status !== 'ok') return;
  const s = state.stage;
  el.append(s >= 7 ? cardClassification(res, just === 7) : pendingCard('card-cls', t('card_cls'), badge('model', t('badge_cls'), 'i-chip'), t('pend_cls')));
  if (s >= 8) { el.append(cardUptakes(res)); const pc = cardProcess(res); if (pc) el.append(pc); }
  else el.append(pendingCard('card-up', t('card_up'), badge('model', t('badge_reg'), 'i-chip'), t('pend_up')));
  const fresh = just === 7 ? el.querySelector('#card-cls') : just === 8 ? el.querySelector('#card-up') : null;
  if (fresh && !REDUCED) fresh.classList.add('fresh');
}
function cardClassification(res, fresh) {
  const c = res.classification, g = res.gcmc_ref, ads = c.label === 'adsorber';
  const pct = Math.max(0, Math.min(1, c.p_adsorber)) * 100;
  const meter = h('div', { class: `meter${fresh ? ' grow' : ''}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '1', 'aria-valuenow': String(c.p_adsorber), 'aria-label': t('p_label') },
    h('div', { class: 'track' }), h('div', { class: 'fill', style: `width:${pct}%` }),
    h('div', { class: 'thr', style: `left:${c.threshold * 100}%` }, h('span', {}, F.fx(c.threshold, 1))),
    h('div', { class: 'pt', style: `left:${pct}%` }),
    h('span', { class: 'ax', style: 'left:0' }, F.fx(0, 0)), h('span', { class: 'ax', style: 'right:0' }, F.fx(1, 0)));
  const body = [
    h('div', { class: 'cls-top' }, h('span', { class: `verdict ${ads ? 'ok' : 'stop'}` }, mk('model'), t(c.label)),
      h('div', { class: 'pval' }, h('span', { class: 'v tnum' }, F.prob(c.p_adsorber)), h('span', { class: 'l' }, `${t('p_label')} · CGCNN`))),
    meter, h('p', { class: 'defn' }, t('cls_rule'), ' ', t('cls_def')),
  ];
  if (g) {
    const agree = g.label === c.label;
    body.push(h('div', { class: 'truth' }, mk('gcmc'), h('b', {}, `${t('truth_label')}: ${t(g.label)}`),
      h('span', { class: 'muted small' }, t('ch4_10', { v: F.up(g.ch4_10bar) })),
      h('span', { class: `agree ${agree ? 'yes' : 'no'}` }, icon(agree ? 'i-check' : 'i-alert', 's'), agree ? t('agree') : t('disagree'))));
  }
  return card('card-cls', t('card_cls'), badge('model', t('badge_cls'), 'i-chip'), ...body);
}
function cardUptakes(res) {
  const pred = res.gcmc_pred ? res.gcmc_pred.uptakes : null, g = res.gcmc_ref, gu = g ? g.uptakes : null;
  const P = ['0.1', '1', '10'], body = [];
  if (!pred) body.push(h('div', { class: 'skipbox' }, icon('i-skip'), h('div', {}, t('up_skip'), g ? h('div', { class: 'xs' }, t('up_skip_ref')) : null)));
  if (pred || gu) {
    const tb = h('tbody');
    const line = (gas, kind, vals, first) => h('tr', { class: `${kind === 'model' ? 'pred' : 'gcmc'}${first ? ' grpstart' : ''}` },
      first ? h('th', { rowspan: (pred && gu) ? 2 : 1, scope: 'rowgroup' }, F.chem(gas)) : null,
      h('td', { class: 'src' }, mk(kind), kind === 'model' ? t('src_pred') : t('src_gcmc')), ...P.map((p) => h('td', {}, F.up(vals[p]))));
    for (const gas of ['CO2', 'CH4']) {
      let first = true;
      if (pred) { tb.append(line(gas, 'model', pred[gas], first)); first = false; }
      if (gu) tb.append(line(gas, 'gcmc', gu[gas], first));
    }
    const sel = (d) => ({ '0.1': d['Selectivity_0.1bar'], 1: d.Selectivity_1bar, 10: d.Selectivity_10bar });
    const sP = pred ? sel(res.gcmc_pred.derived) : null, sG = g ? sel(g.derived) : null;
    let first = true;
    if (sP) { tb.append(h('tr', { class: 'pred grpstart' }, h('th', { rowspan: sG ? 2 : 1 }, 'S'), h('td', { class: 'src' }, mk('model'), t('src_pred')), ...P.map((p) => h('td', {}, F.g(sP[p]))))); first = false; }
    if (sG) tb.append(h('tr', { class: `gcmc${first ? ' grpstart' : ''}` }, first ? h('th', {}, 'S') : null, h('td', { class: 'src' }, mk('gcmc'), t('src_gcmc')),
      ...P.map((p) => (refHidden(g, 'Selectivity_1bar') ? h('td', { class: 'und', title: t('sel_na') }, '—') : h('td', {}, F.g(sG[p]))))));
    if (sG && refHidden(g, 'Selectivity_1bar')) body.push(h('p', { class: 'defn' }, t('sel_na')));
    body.push(h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('caption', { class: 'cap' }, t('units_up')),
      h('thead', {}, h('tr', {}, h('th', { colspan: 2 }, ''), ...P.map((p) => h('th', {}, `${F.fx(Number(p), p === '0.1' ? 1 : 0)} bar`)))), tb)));
    const ch = uptakeChart({ pred, gcmc: gu, fmtTick: (v) => F.tick(v), labels: { pred: t('lg_pred'), gcmc: t('lg_gcmc'), x: 'p (bar)', y: 'mol/kg', aria: t('card_up') } });
    if (ch.svg) {
      body.push(h('div', { html: ch.svg }), h('div', { class: 'legend-inline' },
        pred ? h('span', {}, mk('model'), t('lg_pred')) : null, gu ? h('span', {}, mk('gcmc'), t('lg_gcmc')) : null,
        h('span', {}, h('i', { class: 'line', style: 'background:var(--gas-co2)' }), 'CO₂'), h('span', {}, h('i', { class: 'line', style: 'background:var(--gas-ch4)' }), 'CH₄')),
      h('p', { class: 'defn' }, t('chart_cap', { axes: ch.log ? t('axes_log') : t('axes_lin') })));
    }
  }
  return card('card-up', t('card_up'), pred ? badge('model', t('badge_reg'), 'i-chip') : (gu ? badge('gcmc', t('lg_gcmc'), 'i-sim') : null), ...body);
}
function cardProcess(res) {
  const dp = res.gcmc_pred ? res.gcmc_pred.derived : null, g = res.gcmc_ref, dg = g ? g.derived : null;
  if (!dp && !dg) return null;
  const undefP = new Set(res.gcmc_pred ? res.gcmc_pred.undefined : []);
  const rowsDef = [
    ['ΔN CO₂', 'm_wc_co2', 'CO2_WC_PSA', 'CO2_WC_VSA', 'mol/kg', F.up], ['ΔN CH₄', 'm_wc_ch4', 'CH4_WC_PSA', 'CH4_WC_VSA', 'mol/kg', F.up],
    ['R', 'm_R', 'Renewability_PSA', 'Renewability_VSA', '%', (x) => F.fx(x, 1)], ['S', 'm_S', 'Selectivity_10bar', 'Selectivity_1bar', '', F.g],
    ['APS', 'm_APS', 'APS_PSA', 'APS_VSA', 'mol/kg', F.g], ['AFM', 'm_AFM', 'AFM_PSA', 'AFM_VSA', '', F.g], ['SSP', 'm_SSP', 'SSP_PSA', 'SSP_VSA', '', F.g],
  ];
  const cell = (vals, key, fmt, und) => {
    if (!vals) return null;
    if (vals === dg && refHidden(g, key)) return h('td', { class: 'und', title: t('sel_na') }, '—');
    const v = vals[key];
    if (und || v === null || v === undefined) return h('td', { class: 'und', title: t('undef') }, '—');
    return h('td', {}, fmt(v));
  };
  const both = dp && dg;
  const head = h('tr', {}, h('th', {}, ''),
    h('th', { colspan: both ? 2 : 1, class: 'grp-h' }, t('psa'), h('span', { class: 'sub' }, t('psa_sub'))),
    h('th', { colspan: both ? 2 : 1, class: 'grp-h' }, t('vsa'), h('span', { class: 'sub' }, t('vsa_sub'))));
  const srcTh = (kind) => h('th', { title: kind === 'model' ? t('lg_pred') : t('lg_gcmc'), 'aria-label': kind === 'model' ? t('lg_pred') : t('lg_gcmc') }, mk(kind));
  const sub = both ? h('tr', {}, h('th', {}, ''), srcTh('model'), srcTh('gcmc'), srcTh('model'), srcTh('gcmc')) : null;
  const tb = h('tbody', {}, ...rowsDef.map(([sym, lk, kp, kv, unit, fmt]) => h('tr', {},
    h('th', { scope: 'row', title: t(lk) }, sym, unit ? h('span', { class: 'src' }, ` ${unit}`) : null),
    cell(dp, kp, fmt, undefP.has(kp)), cell(dg, kp, fmt, false), cell(dp, kv, fmt, undefP.has(kv)), cell(dg, kv, fmt, false))));
  return card('card-proc', t('card_proc'), badge('rule', t('badge_an'), 'i-rule'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 't proc' }, h('thead', {}, head, sub), tb)),
    h('div', { class: 'legend-inline' }, dp ? h('span', {}, mk('model'), t('lg_pred')) : null, dg ? h('span', {}, mk('gcmc'), t('lg_gcmc')) : null),
    g && g.label === 'non-adsorber' ? h('p', { class: 'defn' }, t('sel_na')) : null,
    h('p', { class: 'defn' }, t('proc_defs')));
}

const SEL_KEYS = /^(Selectivity|APS|AFM|SSP)_/;
function refHidden(g, key) { return !!g && g.label === 'non-adsorber' && SEL_KEYS.test(key); }

function renderFingerprint(reveal) {
  const el = $('#fingerprint'); el.replaceChildren();
  const res = state.res;
  const title = h('h2', { id: 'fp-title' }, h('span', { lang: 'en' }, 'MX-Identifier'), ` ${t('fp_title')}`);
  if (!state.current || (res && res.status !== 'ok')) { el.hidden = true; return; }
  el.hidden = false;
  if (!res || state.stage < 5 || !res.fingerprint) {
    el.classList.add('pending');
    el.append(h('div', { class: 'card-h' }, title, badge('rule', t('fp_badge'), 'i-rule')), h('div', { class: 'card-b' }, h('p', { class: 'small muted' }, t('pend_fp'))));
    return;
  }
  el.classList.remove('pending');
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
  el.append(h('div', { class: 'card-h' }, title, badge('rule', t('fp_badge'), 'i-rule')),
    h('div', { class: 'card-b' },
      h('p', { class: 'small' }, t('fp_sub', { n: F.int(fp.z.length), b: fp.blocks.length, ref: F.int(fp.reference.n) })),
      holder, tip,
      h('div', { class: 'fp-scale' }, h('span', {}, `−${Z_CLIP}`), h('i'), h('span', {}, `+${Z_CLIP}`), h('span', {}, t('fp_scale'))),
      h('p', { class: 'defn' }, t('fp_note'))));
}

const PACE_SEED = 20261006, JIT_CS = 28;
function paceS() { const p = state.info && state.info.pace; return p && Number.isFinite(p.s_per_structure) ? p.s_per_structure : null; }
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
const paceNote = () => t(src.kind === 'replay' ? 'pace_note' : 'pace_note_live', { v: F.fx(paceS(), 2) });
let clockTimer = 0;
function tickClock() { const el = $('#bclock'), b = state.batch; if (el && b.running) el.textContent = secs((performance.now() - b.t0) / 1000, 1); }
function startClock() { stopClock(); clockTimer = setInterval(tickClock, 100); }
function stopClock() { clearInterval(clockTimer); clockTimer = 0; }

async function runBatch() {
  const names = state.catalog.rows.map((r) => r.name).filter((n) => state.selected.has(n));
  if (!names.length) return;
  const b = state.batch, id = ++b.id, pace = paceS();
  b.names = names; b.results = new Map(); b.status = new Map(names.map((n) => [n, 'wait'])); b.times = new Map();
  b.paced = !!pace; b.plan = pace ? pacePlan(names, pace) : names.map(() => 0); b.total = null;
  b.running = true; b.sort = { key: null, dir: 1 };
  setReady(false); setMode('batch');

  const get = (n) => src.analyzeByName(n).catch(() => new Promise((r) => setTimeout(r, 400)).then(() => src.analyzeByName(n)))
    .then((r) => ({ r }), (e) => ({ e }));
  const pending = [get(names[0])];
  b.t0 = performance.now(); startClock();
  let due = b.t0;
  for (let i = 0; i < names.length; i++) {
    const n = names[i], start = performance.now();
    if (id !== b.id) return;
    if (i + 1 < names.length) pending[i + 1] = get(names[i + 1]);
    b.status.set(n, 'run'); renderBatch(); renderRail();
    due += b.plan[i];
    const [out] = await Promise.all([pending[i], sleepUntil(due)]);
    if (id !== b.id) return;
    const end = performance.now(), late = end - due > 60;
    b.times.set(n, late ? (end - start) / 1000 : b.plan[i] / 1000);
    if (late) due = end;
    if (out.e) b.status.set(n, 'err'); else { b.results.set(n, out.r); b.status.set(n, 'done'); }
    renderBatch(); renderRail();
  }
  stopClock();
  b.total = [...b.times.values()].reduce((a, x) => a + x, 0);
  b.running = false; renderBatch(); renderRail();
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
  const b = state.batch;
  const head = $('#bhead'); head.replaceChildren();
  const done = [...b.status.values()].filter((s) => s === 'done').length, n = b.names.length;
  head.append(h('div', { class: 'head-l' }, h('span', { class: 'eyebrow' }, t('b_eyebrow')),
    h('h1', { class: 'formula' }, n ? t('b_title', { k: done, n }) : t('b_title0')),
    h('p', { class: 'small muted' }, n ? (b.running ? '' : t('b_done')) : t('b_empty'))));
  const pr = $('#bprog'); pr.replaceChildren();
  if (n) {
    const pace = paceS();
    if (b.total === null || !b.paced) {
      pr.append(b.paced ? h('span', { class: 'clock', role: 'timer', 'aria-label': t('b_clock'), title: t('b_clock') }, icon('i-clock'),
        h('span', { class: 'cv tnum', id: 'bclock' }, secs(b.running ? (performance.now() - b.t0) / 1000 : 0, 1))) : null,
      h('span', { class: 'prog big', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(done) }, h('i', { style: `width:${done / n * 100}%` })),
      b.paced ? h('span', { class: 'pace tnum' }, t('b_pace', { v: F.fx(pace, 2) })) : null);
    } else {
      pr.append(h('div', { class: 'bsum', role: 'status' }, icon('i-clock'),
        h('span', { class: 'tnum' }, t('b_summary', { n: F.int(n), s: F.fx(b.total, 1), v: F.fx(b.total / n, 2) }))));
    }
    if (b.paced) pr.append(h('p', { class: 'pace-note' }, paceNote()));
  }
  const ok = [...b.results.values()].filter((r) => r && r.status === 'ok');
  const ads = ok.filter((r) => r.classification.label === 'adsorber').length;
  const match = ok.filter((r) => r.gcmc_ref && r.gcmc_ref.label === r.classification.label).length;
  const tiles = $('#btiles'); tiles.replaceChildren();
  if (n) {
    const tile = (lab, val, sub) => h('div', { class: 'tile' }, h('span', { class: 'tl' }, lab), h('span', { class: 'tv tnum' }, val), sub ? h('span', { class: 'ts' }, sub) : null);
    tiles.append(tile(t('t_done'), `${F.int(done)} / ${F.int(n)}`), tile(t('t_ads'), F.int(ads), badgeTxt('model')), tile(t('t_non'), F.int(ok.length - ads), badgeTxt('model')),
      tile(t('t_match'), `${F.int(match)} / ${F.int(ok.length)}`, badgeTxt('gcmc')));
  }
  renderBatchChart(ok); renderBatchTable();
}
function badgeTxt(kind) { return h('span', { class: 'xs muted' }, mk(kind), ' ', kind === 'model' ? 'CGCNN' : 'GCMC'); }
function renderBatchChart(ok) {
  const el = $('#bchart'); el.replaceChildren();
  if (!state.batch.names.length) { el.hidden = true; return; }
  el.hidden = false;
  const pts = [];
  for (const res of ok) {
    if (!res.gcmc_pred || !res.gcmc_ref) continue;
    for (const gas of ['CO2', 'CH4']) for (const p of ['0.1', '1', '10']) {
      const x = res.gcmc_ref.uptakes[gas][p], y = res.gcmc_pred.uptakes[gas][p];
      if (x !== null && y !== null) pts.push({ x, y, gas, title: `${F.formulaText(res.name)} · ${F.chem(gas)} ${p} bar · GCMC ${F.up(x)} · CGCNN ${F.up(y)} mol/kg` });
    }
  }
  el.append(h('div', { class: 'card-h' }, h('h2', { id: 'bchart-h' }, t('bchart_h')), badge('model', 'CGCNN', 'i-chip')),
    h('div', { class: 'card-b' },
      pts.length ? h('div', { html: parityChart({ pts, fmtTick: (v) => F.tick(v), labels: { x: `GCMC (mol/kg)`, y: 'CGCNN (mol/kg)', aria: t('bchart_h') } }) }) : h('p', { class: 'small muted' }, t('bchart_empty')),
      h('div', { class: 'legend-inline' }, h('span', {}, h('span', { class: 'mk', style: 'background:var(--gas-co2)' }), 'CO₂'), h('span', {}, h('span', { class: 'mk', style: 'background:var(--gas-ch4)' }), 'CH₄')),
      h('p', { class: 'defn' }, t('bchart_cap'))));
}
function renderBatchTable() {
  const el = $('#btable'); el.replaceChildren();
  const b = state.batch; if (!b.names.length) { el.hidden = true; return; }
  el.hidden = false;
  const sortTh = (key, label, cls) => h('th', { class: cls || '', 'aria-sort': b.sort.key === key ? (b.sort.dir > 0 ? 'ascending' : 'descending') : null },
    h('button', { class: 'thbtn', type: 'button', title: t('sort_by', { c: label }), disabled: b.running,
      onclick: () => { b.sort = { key, dir: b.sort.key === key ? -b.sort.dir : 1 }; renderBatchTable(); } }, label, b.sort.key === key ? (b.sort.dir > 0 ? ' ↑' : ' ↓') : ''));
  const pair = (p, g, fmt) => h('td', { class: 'pair' }, h('span', {}, mk('model'), ' ', p === null || p === undefined ? '—' : fmt(p)), h('span', { class: 'muted' }, mk('gcmc'), ' ', g === null || g === undefined ? '—' : fmt(g)));
  const tb = h('tbody');
  for (const x of batchRows()) {
    const res = x.res, ok = res && res.status === 'ok';
    const nameCell = h('th', { scope: 'row' }, h('span', { class: 'f', html: F.formulaHTML(x.n) }));
    const tm = b.times.get(x.n), timeCell = b.paced ? h('td', { class: 'num tm' }, tm === undefined ? '—' : secs(tm, 2)) : null;
    if (!ok) {
      tb.append(h('tr', { class: `st-${x.st}` }, nameCell, h('td', {}, x.r.family || ''),
        h('td', { colspan: 5, class: 'muted' }, x.st === 'run' ? h('span', {}, h('span', { class: 'spinner sm' }), ' ', t('st_run')) : x.st === 'err' ? t('note_error').replace(/<[^>]+>/g, '') : t('st_wait')),
        timeCell));
      continue;
    }
    const c = res.classification, g = res.gcmc_ref, gp = res.gcmc_pred;
    const agree = g ? g.label === c.label : null;
    tb.append(h('tr', { class: 'done', tabindex: '0', title: t('open_single'), onclick: () => runSingle(x.n, false),
      onkeydown: (e) => { if (e.key === 'Enter') runSingle(x.n, false); } },
    nameCell, h('td', {}, x.r.family || ''),
    h('td', { class: 'num' }, F.prob(c.p_adsorber)),
    h('td', {}, h('span', { class: `pill ${c.label === 'adsorber' ? 'ok' : 'stop'}` }, t(c.label)),
      agree === null ? null : h('span', { class: `agree ${agree ? 'yes' : 'no'}`, title: `${t('truth_label')}: ${t(g.label)}` }, icon(agree ? 'i-check' : 'i-alert', 's'))),
    pair(gp ? gp.uptakes.CO2['1'] : null, g ? g.uptakes.CO2['1'] : null, F.up),
    pair(gp ? gp.uptakes.CH4['1'] : null, g ? g.uptakes.CH4['1'] : null, F.up),
    pair(gp ? gp.derived.APS_PSA : null, g && !refHidden(g, 'APS_PSA') ? g.derived.APS_PSA : null, F.g),
    timeCell));
  }
  el.append(h('div', { class: 'card-h' }, h('h2', { id: 'btable-h' }, t('btable_h')), h('span', { class: 'legend-inline' }, h('span', {}, mk('model'), t('lg_pred')), h('span', {}, mk('gcmc'), t('lg_gcmc')))),
    h('div', { class: 'card-b' }, h('div', { class: 'tbl-wrap' }, h('table', { class: 't batch' },
      h('thead', {}, h('tr', {}, sortTh('name', t('c_struct')), sortTh('family', t('c_fam')), sortTh('p', t('c_p'), 'num'), h('th', {}, t('c_cls')),
        sortTh('co2', `${t('c_co2')}`), sortTh('ch4', t('c_ch4')), sortTh('aps', t('c_aps')), b.paced ? h('th', { class: 'num', title: paceNote() }, t('c_time')) : null)), tb)),
    h('p', { class: 'defn' }, t('units_up'))));
}

function renderAbout() {
  const el = $('#screen-about'); el.replaceChildren();
  const ul = (arr) => h('ul', {}, ...arr.map((x) => h('li', {}, x)));
  el.append(h('h1', {}, t('about_title')), h('p', {}, t('about_lead')),
    h('section', { class: 'card' }, h('h2', {}, t('about_flow_h')), h('ol', {}, ...t('about_flow').map((x) => h('li', {}, x)))),
    h('section', { class: 'card' }, h('h2', {}, t('about_acc_h')), ul(t('about_acc'))),
    h('section', { class: 'card' }, h('h2', {}, t('about_set_h')), h('p', {}, transparencyText())),
    paceS() ? h('section', { class: 'card' }, h('h2', {}, t('about_speed_h')), ul([paceNote(), t('about_speed_single')])) : null,
    h('section', { class: 'card' }, h('h2', {}, t('about_lim_h')), ul(t('about_lim'))),
    h('section', { class: 'card' }, h('h2', {}, t('about_cite_h')), h('p', {}, t('about_cite'))));
}
function route() {
  const about = location.hash === '#about';
  $('#screen-about').hidden = !about; $('#screen-analyze').hidden = about;
  document.querySelectorAll('.tab').forEach((a) => { if ((a.dataset.screen === 'about') === about) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (!about && scene) setTimeout(() => scene.resize(), 30);
}
function wire() {
  document.querySelectorAll('.seg.lang button').forEach((b) => b.addEventListener('click', () => switchLang(b.dataset.lang)));
  $('#btn-theme').addEventListener('click', () => { state.theme = { system: 'light', light: 'dark', dark: 'system' }[state.theme]; store('mxsi.theme', state.theme); applyTheme(true); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('#rail').classList.contains('open')) { closeRail(); $('#picker-btn').focus(); return; }
    if (state.sel) onPick(null);
  });
  $('#picker-btn').addEventListener('click', openRail);
  $('#rail-close').addEventListener('click', closeRail);
  $('#scrim').addEventListener('click', closeRail);
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
  if (state.catalog) state.catalog.rows.forEach((r) => state.selected.add(r.name));
  renderChrome(); renderAbout(); renderRail(); renderSceneBar();
  if (!state.catalog) return;
  const names = new Set(state.catalog.rows.map((r) => r.name));
  const first = names.has(Q.get('s')) ? Q.get('s') : (names.has(DEFAULT) ? DEFAULT : state.catalog.rows[0].name);
  if (Q.get('mode') === 'batch') {
    setMode('batch'); renderBatch(); setReady(true);
    if (Q.get('run') === '1') runBatch();
    return;
  }
  runSingle(first, Q.get('play') === '1');
}
boot();

export { state };
