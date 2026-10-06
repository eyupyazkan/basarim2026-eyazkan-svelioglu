/* MXene library viewer · one structure at a time from the local API (server.py). No list of the library and no
   totals anywhere: each step asks the server which values the next site can take, the last step opens one structure.
   3D: 3Dmol.js with the companion page's camera (mx_view.js); atoms are picked by 3Dmol, bonds by the nearest
   projected segment to the tap. */
(function () {
  'use strict';
  var API = (window.MX_API || '') + '/api/';
  var app = document.getElementById('app');
  var EL = null;                                   // elements.json
  var viewer = null, vbox = null, scene = null, hl = null, hit = null;

  var FAMILIES = [
    { id: 'SS', code: 'SS · single TM', ex: 'Ti<sub>2</sub>CO<sub>2</sub>', desc: 'One metal on every M site.' },
    { id: 'OPDT', code: 'OPDT · out-of-plane double TM', ex: 'Nb<sub>2</sub>TiC<sub>2</sub>O<sub>2</sub>', desc: 'The outer and the inner metal layers hold different metals.' },
    { id: 'IPDT', code: 'IPDT · in-plane double TM', ex: '(Ti<sub>0.66</sub>Nb<sub>0.33</sub>)<sub>2</sub>CO<sub>2</sub>', desc: 'Two metals ordered 2 : 1 within each metal layer.' },
    { id: 'IPV', code: 'IPV · in-plane vacancy', ex: 'Ti<sub>1.33</sub>CO<sub>2</sub>', desc: 'One third of the metal sites are ordered vacancies.' },
    { id: 'SSM', code: 'SSM · solid solution, M site', ex: '(Nb<sub>0.5</sub>Ti<sub>0.5</sub>)<sub>3</sub>C<sub>2</sub>O<sub>2</sub>', desc: 'Two metals share the M sites 50 : 50.' },
    { id: 'SSX', code: 'SSX · solid solution, X site', ex: 'Ti<sub>3</sub>(C<sub>0.5</sub>N<sub>0.5</sub>)<sub>2</sub>O<sub>2</sub>', desc: 'C and N share the X sites 50 : 50.' }
  ];
  var FAM = {}; FAMILIES.forEach(function (f) { FAM[f.id] = f; });
  var MSS = 'M′<sub>0.5</sub>M″<sub>0.5</sub>';
  var TPL = {
    SS2: { f: 'M<sub>2</sub>XT<sub>x</sub>', n: 2 }, SS3: { f: 'M<sub>3</sub>X<sub>2</sub>T<sub>x</sub>', n: 3 },
    SS4: { f: 'M<sub>4</sub>X<sub>3</sub>T<sub>x</sub>', n: 4 }, SS5: { f: 'M<sub>5</sub>X<sub>4</sub>T<sub>x</sub>', n: 5 },
    OPDT3: { f: 'M′<sub>2</sub>M″X<sub>2</sub>T<sub>x</sub>', n: 3, d: 'M′ in the two outer layers, M″ in the middle one' },
    OPDT4: { f: 'M′<sub>2</sub>M″<sub>2</sub>X<sub>3</sub>T<sub>x</sub>', n: 4, d: 'M′ in the two outer layers, M″ in the two inner ones' },
    IPDT2: { f: '(M′<sub>2/3</sub>M″<sub>1/3</sub>)<sub>2</sub>XT<sub>x</sub>', n: 2 },
    IPV2: { f: 'M<sub>4/3</sub>XT<sub>x</sub>', n: 2 },
    SSM2a: { f: '(' + MSS + ')<sub>2</sub>XT<sub>x</sub>', n: 2, cell: '2 × 1' },
    SSM2b: { f: '(' + MSS + ')<sub>2</sub>XT<sub>x</sub>', n: 2, cell: '2 × 2' },
    SSM3a: { f: '(' + MSS + ')<sub>3</sub>X<sub>2</sub>T<sub>x</sub>', n: 3, cell: '2 × 1' },
    SSM3b: { f: '(' + MSS + ')<sub>3</sub>X<sub>2</sub>T<sub>x</sub>', n: 3, cell: '2 × 2' },
    SSX2: { f: 'M<sub>2</sub>(C<sub>0.5</sub>N<sub>0.5</sub>)T<sub>x</sub>', n: 2 },
    SSX3a: { f: 'M<sub>3</sub>(C<sub>0.5</sub>N<sub>0.5</sub>)<sub>2</sub>T<sub>x</sub>', n: 3, cell: '2 × 1' },
    SSX3b: { f: 'M<sub>3</sub>(C<sub>0.5</sub>N<sub>0.5</sub>)<sub>2</sub>T<sub>x</sub>', n: 3, cell: '2 × 2' }
  };
  var DOUBLE = { OPDT: 1, IPDT: 1, SSM: 1 };
  var ORDER = ['fam', 'tpl', 'm1', 'm2', 'x', 't'];
  var MGRID = { cols: ['3', '4', '5', '6'], rows: [['4', ['Sc', 'Ti', 'V', 'Cr']], ['5', ['Y', 'Zr', 'Nb', 'Mo']], ['6', [null, 'Hf', 'Ta', 'W']]] };
  var XGRID = { cols: ['14', '15'], rows: [['2', ['C', 'N']]] };
  // 0 = empty cell, null = dashed placeholder (an element we do not use), '' = the narrow 'groups in between' column
  var TGRID = { cols: ['1', '…', '16', '17'], rows: [['1', ['H', '', 0, 0]], ['2', [0, '', 'O', 'F']], ['3', [0, '', 'S', 'Cl']],
                                                    ['4', [0, '', 'Se', 'Br']], ['5', [0, '', 'Te', 'I']]] };
  var T_LABEL = { bare: 'No T<sub>x</sub> (bare)', OH: '–OH', NH2: '–NH<sub>2</sub>' };

  // ------------------------------------------------------------------ helpers
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sub(s) { return esc(s).replace(/(\d+(?:\.\d+)?)/g, '<sub>$1</sub>'); }
  function pretty(name) {
    var m = name.match(/_\((2x1|2x2)\)$/), cell = '';
    if (m) { cell = m[1].replace('x', ' × '); name = name.slice(0, m.index); }
    return { html: sub(name), cell: cell };
  }
  function fmt(v, sg) {
    if (v == null || !isFinite(v)) return '–';
    sg = sg || 3;
    var a = Math.abs(v), s;
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) {
      var e = Math.floor(Math.log10(a)), mant = v / Math.pow(10, e);
      s = mant.toFixed(sg - 1) + ' × 10<sup>' + e + '</sup>';
    } else s = String(Number(v.toPrecision(sg)));
    return s.replace(/^-/, '−');
  }
  function charge(q) { return q == null ? '–' : (q > 0 ? '+' : q < 0 ? '−' : '') + Math.abs(q).toFixed(3) + ' e'; }
  function conf(s) { return esc(s).replace(/([spdf])(\d+)/g, '$1<sup>$2</sup>'); }
  function color(e) { return (EL && EL[e] && EL[e].color) || '#888888'; }
  function isMetal(e) { return EL && EL[e] && EL[e].role === 'M'; }
  function h(tag, attrs, html) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) { if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
    if (html != null) n.innerHTML = html;
    return n;
  }

  function fetchJSON(path) {
    return fetch(API + path, { cache: 'no-store' }).then(function (r) {
      if (r.status === 429) return r.json().then(function (j) { var e = new Error('rate'); e.retry = j.retry; throw e; });
      if (!r.ok) { var e = new Error('http'); e.status = r.status; throw e; }
      return r.json();
    }, function () { throw new Error('offline'); });
  }
  function errorCard(e) {
    var msg;
    if (e.message === 'rate') msg = 'Many structures were opened from your connection in a short time. Please try again in about ' +
      Math.max(1, Math.round((e.retry || 60) / 60)) + ' min.';
    else if (e.message === 'offline') msg = 'The library server cannot be reached right now. It runs on the authors’ workstation and is online only part of the day.';
    else if (e.status === 404) msg = 'This structure is not in the library viewer.';
    else msg = 'Something went wrong while loading. Please try again.';
    return '<div class="note">' + esc(msg) + '</div>';
  }

  // ------------------------------------------------------------------ routing
  function parseHash() {
    var hsh = location.hash.replace(/^#\/?/, '');
    if (hsh.indexOf('s/') === 0) return { detail: decodeURIComponent(hsh.slice(2)) };
    if (hsh === 'make' || hsh.indexOf('make/') === 0) return { make: hsh.slice(5) };
    var sel = {}, q = hsh.replace(/^\?/, '');
    q.split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); if (ORDER.indexOf(p[0]) >= 0) sel[p[0]] = decodeURIComponent(p[1] || ''); });
    return { sel: sel };
  }
  function selHash(sel) {
    var parts = [];
    ORDER.forEach(function (k) { if (sel[k]) parts.push(k + '=' + encodeURIComponent(sel[k])); });
    return '#/?' + parts.join('&');
  }
  function go(sel, replace) {
    var hsh = selHash(sel);
    if (replace) { history.replaceState(null, '', hsh); route(); } else location.hash = hsh;
  }
  function route() {
    var r = parseHash();
    stopMake();
    if (r.detail) renderDetail(r.detail); else if (r.make != null) renderMake(r.make); else renderWizard(r.sel);
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ wizard
  function nextStep(sel) {
    for (var i = 0; i < ORDER.length; i++) {
      var k = ORDER[i];
      if (k === 'm2' && sel.fam && !DOUBLE[sel.fam]) continue;
      if (!sel[k]) return k;
    }
    return null;
  }
  function optsQuery(sel) {
    var parts = [];
    for (var i = 0; i < ORDER.length; i++) {
      var k = ORDER[i], v = sel[k];
      if (k === 'm2' && sel.fam && !DOUBLE[sel.fam] && sel.m1) v = '-';
      if (!v) break;
      parts.push(k + '=' + encodeURIComponent(v));
    }
    return 'opts?' + parts.join('&');
  }
  function mRole(fam, which) {
    if (fam === 'OPDT') return which === 1 ? 'M′ · outer metal layers' : 'M″ · inner metal layer(s)';
    if (fam === 'IPDT') return which === 1 ? 'M′ · two thirds of each metal layer' : 'M″ · one third of each metal layer';
    if (fam === 'SSM') return which === 1 ? 'M′ · first metal (50 %)' : 'M″ · second metal (50 %)';
    return 'M · transition metal';
  }
  function stepTitle(step, sel) {
    return { fam: 'MXene family', tpl: 'Metal layers and cell', m1: DOUBLE[sel.fam] ? 'M site · ' + mRole(sel.fam, 1) : 'M site · transition metal', m2: 'M site · ' + mRole(sel.fam, 2),
             x: sel.fam === 'SSX' ? 'X site · C/N arrangement' : 'X site · carbide or nitride', t: 'T<sub>x</sub> site · surface termination' }[step];
  }
  // the choices panel (round 2): one card per choice (label, value, pencil) that reopens that step, plus
  // Previous step and Start over as real buttons; the same panel heads the structure screen
  var SINGLE_TPL = { IPDT: 1, IPV: 1 };              // one template: the wizard passes that step on its own
  function stepsFor(fam) {
    return ORDER.filter(function (k) { return !(k === 'm2' && !DOUBLE[fam]) && !(k === 'tpl' && SINGLE_TPL[fam]); });
  }
  function upTo(sel, k) {
    var s = {};
    for (var i = 0; i < ORDER.indexOf(k); i++) if (sel[ORDER[i]]) s[ORDER[i]] = sel[ORDER[i]];
    return s;
  }
  function prevSel(sel) {
    var keys = ORDER.filter(function (k) { return sel[k]; }), last = keys[keys.length - 1];
    return last === 'tpl' && SINGLE_TPL[sel.fam] ? {} : upTo(sel, last);
  }
  function crumb(k, sel) {
    var v = sel[k], lab, val, say;
    if (k === 'fam') { lab = 'Family'; val = esc(v); say = 'family'; }
    else if (k === 'tpl') { lab = 'Layers'; val = TPL[v] ? TPL[v].f + (TPL[v].cell ? ' · ' + TPL[v].cell : '') : esc(v); say = 'layers'; }
    else if (k === 'm1') { lab = DOUBLE[sel.fam] ? 'M′' : 'M'; val = esc(v); say = 'metal'; }
    else if (k === 'm2') { lab = 'M″'; val = esc(v); say = 'second metal'; }
    else if (k === 'x') { lab = 'X'; val = v === 'CN' ? 'C<sub>0.5</sub>N<sub>0.5</sub>' : v === 'NC' ? 'N<sub>0.5</sub>C<sub>0.5</sub>' : esc(v); say = 'X site'; }
    else { lab = 'T<sub>x</sub>'; val = T_LABEL[v] || esc(v); say = 'termination'; }
    var b = h('button', { 'class': 'crumb', type: 'button', 'aria-label': 'Change the ' + say + ' (' + v + ')' },
      '<span class="cw"><span class="ck">' + lab + '</span><span class="cv">' + val + '</span></span><span class="ce" aria-hidden="true">✎</span>');
    b.addEventListener('click', function () { go(upTo(sel, k)); });
    return b;
  }
  function selPanel(sel, current) {
    var keys = ORDER.filter(function (k) {
      return sel[k] && k !== current && !(k === 'm2' && !DOUBLE[sel.fam]) && !(k === 'tpl' && SINGLE_TPL[sel.fam]);
    });
    if (!keys.length) return null;
    var box = h('nav', { 'class': 'selpanel', 'aria-label': 'Your choices' });
    box.appendChild(h('p', { 'class': 'sp-h' }, 'Your choices <span>· tap one to change it</span>'));
    var row = h('div', { 'class': 'crumbs' });
    keys.forEach(function (k) { row.appendChild(crumb(k, sel)); });
    box.appendChild(row);
    var act = h('div', { 'class': 'sp-actions' });
    var pv = h('button', { 'class': 'btn2 prev', type: 'button' }, '<span class="ico" aria-hidden="true">←</span> Previous step');
    pv.addEventListener('click', function () { go(prevSel(sel)); });
    var so = h('button', { 'class': 'btn2 reset', type: 'button' }, '<span class="ico" aria-hidden="true">↺</span> Start over');
    so.addEventListener('click', function () { go({}); });
    act.appendChild(pv); act.appendChild(so);
    box.appendChild(act);
    return box;
  }

  function renderWizard(sel) {
    detachViewer();
    var step = nextStep(sel);
    if (!step) step = 't';
    app.innerHTML = '';
    var panel = selPanel(sel, step), steps = sel.fam ? stepsFor(sel.fam) : null;
    var k = steps ? Math.max(1, steps.indexOf(step) + 1) : 1;
    var card = h('section', { 'class': 'card' });
    card.appendChild(h('div', { 'class': 'step-h' }, '<span class="k">Step ' + k + (steps ? ' of ' + steps.length : '') + '</span>' +
      (steps ? '<span class="prog" aria-hidden="true"><i style="width:' + Math.round(100 * k / steps.length) + '%"></i></span>' : '') +
      '<h2>' + stepTitle(step, sel) + '</h2>'));
    var body = h('div', null, '<p class="loading">Loading…</p>');
    card.appendChild(body);
    if (panel) app.appendChild(panel);
    if (step === 'fam') app.appendChild(makeEntry());       // the way into "See how MXenes are made"
    app.appendChild(card);

    fetchJSON(optsQuery(sel)).then(function (r) {
      var vals = r.values;
      if (step === 'tpl' && vals.length === 1) { var s1 = Object.assign({}, sel, { tpl: vals[0] }); return go(s1, true); }
      body.innerHTML = '';
      var pick = function (v) {
        var s = Object.assign({}, sel); s[step] = v;
        if (step === 't') { location.hash = '#/s/' + encodeURIComponent(r.names[v]); return; }
        go(s);
      };
      if (step === 'fam') body.appendChild(familyChoices(vals, pick));
      else if (step === 'tpl') body.appendChild(templateChoices(vals, pick));
      else if (step === 'm1' || step === 'm2') {
        body.appendChild(ptable(MGRID, vals, pick, step === 'm2' ? sel.m1 : null));
        if (TPL[sel.tpl] && TPL[sel.tpl].d) body.appendChild(h('p', { 'class': 'muted small' }, TPL[sel.tpl].f + ': ' + TPL[sel.tpl].d + '.'));
        body.appendChild(h('p', { 'class': 'muted small' }, 'Groups 3–6 of the periodic table; greyed elements have no structure for the choices so far.'));
      } else if (step === 'x') {
        if (sel.fam === 'SSX') body.appendChild(pills(['CN', 'NC'], vals, pick, { CN: 'C<sub>0.5</sub>N<sub>0.5</sub>', NC: 'N<sub>0.5</sub>C<sub>0.5</sub>' }));
        else body.appendChild(ptable(XGRID, vals, pick));
        if (sel.fam === 'SSX') body.appendChild(h('p', { 'class': 'muted small' }, 'Both arrangements hold C and N 50 : 50; they differ in which X positions carry C and which carry N.'));
      } else if (step === 't') {
        body.appendChild(ptable(TGRID, vals, pick));
        body.appendChild(pills(['bare', 'OH', 'NH2'], vals, pick, T_LABEL));
        body.appendChild(h('p', { 'class': 'muted small' }, 'Pick a termination to open the structure.'));
      }
    }, function (e) { body.innerHTML = errorCard(e); });
  }

  function familyChoices(vals, pick) {
    var g = h('div', { 'class': 'choices' });
    FAMILIES.forEach(function (f) {
      var b = h('button', { 'class': 'choice', type: 'button', disabled: vals.indexOf(f.id) < 0 },
        '<span class="code">' + esc(f.code) + '</span><span class="formula">e.g. ' + f.ex + '</span><span class="desc">' + esc(f.desc) + '</span>');
      b.addEventListener('click', function () { pick(f.id); });
      g.appendChild(b);
    });
    return g;
  }
  function templateChoices(vals, pick) {
    var g = h('div', { 'class': 'choices' });
    vals.sort(function (a, b) { return Object.keys(TPL).indexOf(a) - Object.keys(TPL).indexOf(b); });
    vals.forEach(function (v) {
      var t = TPL[v] || { f: esc(v), n: '?' };
      var b = h('button', { 'class': 'choice', type: 'button' },
        '<span class="formula">' + t.f + '</span><span class="desc">n = ' + t.n + ' metal layers' + (t.cell ? ' · ' + t.cell + ' cell' : '') + '</span>');
      b.addEventListener('click', function () { pick(v); });
      g.appendChild(b);
    });
    return g;
  }
  function ptable(grid, vals, pick, taken) {
    var n = grid.cols.length;
    var t = h('div', { 'class': 'ptable', role: 'group' });
    t.style.gridTemplateColumns = '1.6em ' + grid.cols.map(function (c) { return c === '…' ? '1.2em' : 'minmax(0, 1fr)'; }).join(' ');
    t.appendChild(h('span', { 'class': 'lab' }, ''));
    grid.cols.forEach(function (c) { t.appendChild(h('span', { 'class': 'lab' }, c === '…' ? '…' : 'g' + c)); });
    grid.rows.forEach(function (row) {
      t.appendChild(h('span', { 'class': 'lab' }, 'p' + row[0]));
      for (var i = 0; i < n; i++) {
        var e = row[1][i];
        if (e === '' || e === 0) { t.appendChild(h('span', { 'class': 'lab' }, '')); continue; }
        if (e === null) { t.appendChild(h('span', { 'class': 'tile gap', 'aria-hidden': 'true' }, '')); continue; }
        var d = EL[e] || {}, ok = vals.indexOf(e) >= 0, isTaken = taken === e;
        var b = h('button', { 'class': 'tile' + (isTaken ? ' taken' : ''), type: 'button', disabled: !ok || isTaken,
                              'aria-label': (d.name || e) + (ok ? '' : ', not available') },
          '<span class="z">' + (d.z || '') + '</span><span class="dot" style="background:' + color(e) + '"></span>' +
          '<span class="sym">' + esc(e) + '</span><span class="nm">' + esc(d.name || '') + '</span>');
        (function (el) { b.addEventListener('click', function () { pick(el); }); })(e);
        t.appendChild(b);
      }
    });
    return t;
  }
  function pills(keys, vals, pick, labels) {
    var p = h('div', { 'class': 'pills' });
    keys.forEach(function (k) {
      var b = h('button', { 'class': 'pill', type: 'button', disabled: vals.indexOf(k) < 0 }, labels[k] || esc(k));
      b.addEventListener('click', function () { pick(k); });
      p.appendChild(b);
    });
    return p;
  }

  // ------------------------------------------------------------------ structure analysis
  function add(u, v) { return [u[0] + v[0], u[1] + v[1], u[2] + v[2]]; }
  function mul(u, s) { return [u[0] * s, u[1] * s, u[2] * s]; }
  function analyze(p) {
    var V = mxCellVectors(p.cell), nrm = mxNorm(mxCross(V.a, V.b));
    if (mxDot(nrm, V.c) < 0) nrm = mul(nrm, -1);
    var atoms = p.atoms.map(function (a, i) {
      var r = add(add(mul(V.a, a[1]), mul(V.b, a[2])), mul(V.c, a[3]));
      return { i: i, e: a[0], r: r, hz: mxDot(r, nrm), q: a[4], l: a[5] };
    });
    var mh = atoms.filter(function (a) { return isMetal(a.e); }).map(function (a) { return a.hz; }).sort(function (x, y) { return x - y; });
    var layers = [];
    mh.forEach(function (z) { if (!layers.length || z - layers[layers.length - 1].hi > 0.5) layers.push({ lo: z, hi: z }); else layers[layers.length - 1].hi = z; });
    var lo = mh[0], hi = mh[mh.length - 1];
    atoms.forEach(function (a) {
      if (isMetal(a.e)) {
        a.site = 'M';
        for (var k = 0; k < layers.length; k++) if (a.hz >= layers[k].lo - 0.01 && a.hz <= layers[k].hi + 0.01) a.layer = k + 1;
      } else a.site = (a.hz > lo - 0.6 && a.hz < hi + 0.6) ? 'X' : 'T';
    });
    var nb = atoms.map(function () { return []; });
    p.bonds.forEach(function (b, bi) { nb[b[0]].push({ j: b[1], d: b[3], b: bi }); nb[b[1]].push({ j: b[0], d: b[3], b: bi }); });
    var hz = atoms.map(function (a) { return a.hz; });
    return { V: V, nrm: nrm, atoms: atoms, layers: layers.length, nb: nb, thick: Math.max.apply(null, hz) - Math.min.apply(null, hz) };
  }
  function siteText(a, A, fam) {
    if (a.site === 'M') {
      var where = A.layers > 1 ? ', metal layer ' + a.layer + ' of ' + A.layers : '';
      if (fam === 'OPDT') where += (a.layer === 1 || a.layer === A.layers) ? ' (outer)' : ' (inner)';
      return 'M site' + where;
    }
    if (a.site === 'X') return 'X site (inside the sheet)';
    return 'T<sub>x</sub> site (surface)';
  }
  function bondType(a, b) {
    var s = [a.site, b.site].sort().join('–');
    if (s === 'M–X') return 'Metal–X bond, inside the sheet';
    if (s === 'M–T') return 'Metal–termination bond, at the surface';
    if (s === 'T–T') { var e = [a.e, b.e].sort().join(''); return e === 'HO' ? 'O–H bond inside the –OH group' : e === 'HN' ? 'N–H bond inside the –NH<sub>2</sub> group' : 'Bond inside the termination'; }
    return 'Bond';
  }

  // ------------------------------------------------------------------ viewer
  function ensureViewer() {
    if (viewer) return true;
    if (!window.$3Dmol) return false;
    vbox = h('div', { 'class': 'viewer', id: 'mx-viewer' });
    document.body.appendChild(vbox);
    viewer = $3Dmol.createViewer(vbox, { backgroundColor: 'white', antialias: true });
    var down = null;
    /* a tap: 3Dmol reports the atom under it, also when the tap lands on that atom's half of a stick; so the tap is an
       atom only if it falls inside the drawn sphere, otherwise the nearest bond on screen is taken */
    vbox.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, t: Date.now() }; hit = null; });
    vbox.addEventListener('pointerup', function (e) {
      if (!down || !scene) return;
      var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = Date.now() - down.t; down = null;
      if (moved > 8 || dt > 600) return;
      var px = e.pageX, py = e.pageY, touch = e.pointerType !== 'mouse';
      setTimeout(function () {
        if (hit && inSphere(hit, px, py)) return showAtom(hit.properties.i, hit);
        if (!pickBond(px, py, touch ? 18 : 10) && hit) showAtom(hit.properties.i, hit);
      }, 80);
    });
    return true;
  }
  function detachViewer() {
    scene = null; hl = null;
    if (vbox && vbox.parentNode) { viewer.clear(); document.body.appendChild(vbox); vbox.style.display = 'none'; }
  }
  function buildScene(p, A, rep) {
    viewer.clear(); hl = null;
    var list = [], idx = {}, segs = [];
    for (var u = 0; u < rep; u++) for (var v = 0; v < rep; v++) A.atoms.forEach(function (a) {
      var r = add(a.r, add(mul(A.V.a, u), mul(A.V.b, v))), k = list.length;
      idx[a.i + ',' + u + ',' + v] = k;
      list.push({ index: k, serial: k, elem: a.e, x: r[0], y: r[1], z: r[2], bonds: [], bondOrder: [], properties: { i: a.i } });
    });
    p.bonds.forEach(function (b, bi) {
      if (b[2][2] !== 0) return;
      for (var u = 0; u < rep; u++) for (var v = 0; v < rep; v++) {
        var k1 = idx[b[0] + ',' + u + ',' + v], k2 = idx[b[1] + ',' + (u + b[2][0]) + ',' + (v + b[2][1])];
        if (k2 === undefined) continue;
        list[k1].bonds.push(k2); list[k1].bondOrder.push(1); list[k2].bonds.push(k1); list[k2].bondOrder.push(1);
        segs.push({ b: bi, k1: k1, k2: k2 });
      }
    });
    var m = viewer.addModel();
    m.addAtoms(list);
    var col = function (at) { return color(at.elem); };
    viewer.setStyle({}, { sphere: { scale: MX_VIEW.sphere, colorfunc: col }, stick: { radius: MX_VIEW.stick, colorfunc: col } });
    viewer.setClickable({}, true, function (atom) { hit = atom; });
    scene = { p: p, A: A, m: m, list: list, segs: segs, rep: rep };
    camera();
    return scene;
  }
  function camera() {
    var c = scene.p.cell, az = MX_VIEW.azimuth, el = MX_VIEW.elevation;
    viewer.resize();
    viewer.zoomTo();
    var v = viewer.getView(), q = mxQuaternion(c, az, el);
    v[4] = q[0]; v[5] = q[1]; v[6] = q[2]; v[7] = q[3];
    viewer.setView(v);
    viewer.zoomTo();
    mxFrame(viewer, scene.m, mxAxes(c, az, el), MX_VIEW.span, 0.88);
    viewer.render();
  }
  function pickBond(px, py, tol) {
    var L = scene.list, best = null, bd = tol;
    var pts = viewer.modelToScreen(L.map(function (a) { return { x: a.x, y: a.y, z: a.z }; }));
    scene.segs.forEach(function (s) {
      var a = pts[s.k1], b = pts[s.k2], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      var t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0;
      var d = Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
      if (d < bd && t > 0.12 && t < 0.88) { bd = d; best = s; }
    });
    if (best) showBond(best);
    return !!best;
  }
  function inSphere(at, px, py) {
    var P = { x: at.x, y: at.y, z: at.z };
    var s = viewer.modelToScreen([P, { x: P.x + 1, y: P.y, z: P.z }, { x: P.x, y: P.y + 1, z: P.z }, { x: P.x, y: P.y, z: P.z + 1 }]);
    var pxA = Math.max(Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y), Math.hypot(s[2].x - s[0].x, s[2].y - s[0].y), Math.hypot(s[3].x - s[0].x, s[3].y - s[0].y));
    var r = ((EL[at.elem] && EL[at.elem].r_vdw) || 1.6) * MX_VIEW.sphere * pxA;
    return Math.hypot(px - s[0].x, py - s[0].y) <= r * 1.1 + 2;
  }
  function highlightAtom(at) {
    if (hl) viewer.removeShape(hl);
    var rv = (EL[at.elem] && EL[at.elem].r_vdw) || 1.6;
    hl = viewer.addSphere({ center: { x: at.x, y: at.y, z: at.z }, radius: rv * MX_VIEW.sphere + 0.28, color: '#F0A866', opacity: 0.55 });
    viewer.render();
  }
  function highlightBond(s) {
    if (hl) viewer.removeShape(hl);
    var a = scene.list[s.k1], b = scene.list[s.k2];
    hl = viewer.addCylinder({ start: { x: a.x, y: a.y, z: a.z }, end: { x: b.x, y: b.y, z: b.z }, radius: 0.3, color: '#F0A866', opacity: 0.55, fromCap: 1, toCap: 1 });
    viewer.render();
  }

  // ------------------------------------------------------------------ cards
  function elementRows(e) {
    var d = EL[e] || {};
    return '<dt>Atomic number</dt><dd>' + (d.z || '–') + '</dd>' +
      '<dt>Atomic mass</dt><dd>' + (d.mass != null ? d.mass + ' u' : '–') + '</dd>' +
      '<dt>Electronegativity (Pauling)</dt><dd>' + (d.en != null ? d.en : '–') + '</dd>' +
      '<dt>Atomic radius</dt><dd>' + (d.r_at != null ? d.r_at.toFixed(2) + ' Å' : '–') + '</dd>' +
      '<dt>van der Waals radius</dt><dd>' + (d.r_vdw != null ? d.r_vdw.toFixed(2) + ' Å' : '–') + '</dd>' +
      '<dt>Electron configuration</dt><dd>' + (d.conf ? conf(d.conf) : '–') + '</dd>' +
      '<dt>Period · group</dt><dd>' + (d.period || '–') + ' · ' + (d.group || '–') + '</dd>';
  }
  function selCard(html) {
    var c = document.getElementById('selcard');
    if (c) { c.innerHTML = html; c.hidden = false; }
  }
  function showAtom(i, at) {
    var A = scene.A, a = A.atoms[i], d = EL[a.e] || {}, p = scene.p;
    highlightAtom(at);
    var groups = {};
    A.nb[i].forEach(function (n) { var e = A.atoms[n.j].e, k = e + ' ' + n.d.toFixed(2); groups[k] = groups[k] || { e: e, d: n.d, n: 0 }; groups[k].n++; });
    var nbs = Object.keys(groups).map(function (k) { var g = groups[k]; return g.n + ' × ' + esc(g.e) + ' at ' + g.d.toFixed(3) + ' Å'; });
    selCard('<h3><span class="sw" style="background:' + color(a.e) + '"></span>' + esc(a.e) + ' · ' + esc(d.name || '') +
      ' <span class="muted small mono">' + esc(a.l) + '</span></h3>' +
      '<dl class="kv"><dt>Site</dt><dd>' + siteText(a, A, p.fam) + '</dd>' +
      '<dt>Partial charge (DFT-ESP)</dt><dd>' + charge(a.q) + '</dd>' +
      '<dt>Bonded to</dt><dd>' + (nbs.length ? nbs.join('<br>') : '–') + '</dd>' + elementRows(a.e) + '</dl>' +
      (d.note ? '<p class="muted small">' + esc(d.note) + '</p>' : ''));
  }
  function showBond(s) {
    var A = scene.A, b = scene.p.bonds[s.b], a1 = A.atoms[b[0]], a2 = A.atoms[b[1]];
    if (!isMetal(a1.e) && isMetal(a2.e)) { var sw = a1; a1 = a2; a2 = sw; }        // metal first: Sc–H, not H–Sc
    highlightBond(s);
    var key = [a1.e, a2.e].sort().join('–'), same = scene.p.bonds.filter(function (x) { return [A.atoms[x[0]].e, A.atoms[x[1]].e].sort().join('–') === key; });
    var ds = same.map(function (x) { return x[3]; }), mn = Math.min.apply(null, ds), mx = Math.max.apply(null, ds);
    selCard('<h3><span class="sw" style="background:' + color(a1.e) + '"></span><span class="sw" style="background:' + color(a2.e) + '"></span>' +
      esc(a1.e) + '–' + esc(a2.e) + ' bond <span class="muted small mono">' + esc(a1.l) + '–' + esc(a2.l) + '</span></h3>' +
      '<dl class="kv"><dt>Length</dt><dd>' + b[3].toFixed(3) + ' Å</dd>' +
      '<dt>Type</dt><dd>' + bondType(a1, a2) + '</dd>' +
      '<dt>Charge on ' + esc(a1.e) + ' · ' + esc(a2.e) + '</dt><dd>' + charge(a1.q) + ' · ' + charge(a2.q) + '</dd>' +
      '<dt>' + esc(key) + ' bonds in the unit cell</dt><dd>' + same.length + (same.length > 1 ? ', ' + mn.toFixed(3) + (mx - mn > 5e-4 ? '–' + mx.toFixed(3) : '') + ' Å' : '') + '</dd></dl>' +
      '<p class="muted small">' + (b[4] ? 'This bond is not in the structure file’s bond list; it joins the atom to its nearest neighbours, and the length is computed from the atomic coordinates.'
                                        : 'Bond list and lengths of the optimized structure (Materials Studio).') + '</p>');
  }
  function showElement(e) {
    var A = scene.A, d = EL[e] || {}, at = A.atoms.filter(function (a) { return a.e === e; });
    var qs = at.map(function (a) { return a.q; }).filter(function (q) { return q != null; });
    var sites = {}; at.forEach(function (a) { sites[a.site] = 1; });
    var siteNames = Object.keys(sites).map(function (s) { return s === 'M' ? 'M' : s === 'X' ? 'X' : 'T<sub>x</sub>'; }).join(', ');
    if (hl) { viewer.removeShape(hl); hl = null; viewer.render(); }
    selCard('<h3><span class="sw" style="background:' + color(e) + '"></span>' + esc(e) + ' · ' + esc(d.name || '') + '</h3>' +
      '<dl class="kv"><dt>Site in this structure</dt><dd>' + siteNames + '</dd>' +
      '<dt>Atoms in the unit cell</dt><dd>' + at.length + '</dd>' +
      '<dt>Partial charge (DFT-ESP)</dt><dd>' + (qs.length ? charge(Math.min.apply(null, qs)) + (qs.length > 1 && Math.max.apply(null, qs) - Math.min.apply(null, qs) > 5e-4 ? ' to ' + charge(Math.max.apply(null, qs)) : '') : '–') + '</dd>' +
      elementRows(e) + '</dl>' + (d.note ? '<p class="muted small">' + esc(d.note) + '</p>' : ''));
  }

  function gcmcCard(g) {
    var r3 = function (lab, a) { return '<tr><th scope="row">' + lab + '</th>' + a.map(function (v) { return '<td>' + fmt(v) + '</td>'; }).join('') + '</tr>'; };
    var r2 = r3;
    return '<section class="card"><h2>GCMC · CO<sub>2</sub>/CH<sub>4</sub> 50 : 50, 308 K</h2>' +
      '<table><thead><tr><th></th><th>0.1 bar</th><th>1 bar</th><th>10 bar</th></tr></thead><tbody>' +
      r3('CO<sub>2</sub> uptake (mol/kg)', g.co2) + r3('CH<sub>4</sub> uptake (mol/kg)', g.ch4) + r3('Selectivity S', g.sel) +
      '</tbody></table>' +
      '<table><thead><tr><th></th><th>PSA · 10 → 1 bar</th><th>VSA · 1 → 0.1 bar</th></tr></thead><tbody>' +
      r2('ΔN CO<sub>2</sub> (mol/kg)', g.wc_co2) + r2('ΔN CH<sub>4</sub> (mol/kg)', g.wc_ch4) + r2('Regenerability R (%)', g.r) +
      r2('APS (mol/kg)', g.aps) + r2('AFM (mol/kg)', g.afm) + r2('SSP', g.ssp) + '</tbody></table>' +
      (g.mol10 && g.mol10[0] != null ? '<p class="muted small">Average molecules in the simulation box at 10 bar: CO<sub>2</sub> ' + fmt(g.mol10[0]) + ', CH<sub>4</sub> ' + fmt(g.mol10[1]) + '.</p>' : '') +
      '<details><summary>What the metrics mean</summary><div class="defs">' +
      '<p>S = N(CO<sub>2</sub>) / N(CH<sub>4</sub>) at each pressure (equimolar gas).</p>' +
      '<p>ΔN: working capacity, uptake at the adsorption pressure minus uptake at the desorption pressure.</p>' +
      '<p>R = ΔN(CO<sub>2</sub>) / N<sub>ads</sub>(CO<sub>2</sub>) × 100.</p>' +
      '<p>APS = S<sub>ads</sub> × ΔN(CO<sub>2</sub>) · AFM = ΔN(CO<sub>2</sub>) × S<sub>ads</sub><sup>2</sup> / S<sub>des</sub> · SSP = S<sub>ads</sub> × ΔN(CO<sub>2</sub>) / ΔN(CH<sub>4</sub>).</p>' +
      '<p>A dash means the value is undefined (a zero denominator) or was not in the simulation output.</p></div></details></section>';
  }
  function mlCard(ml, g) {
    if (!ml) return '';
    var r = function (lab, a, b) { return '<tr><th scope="row">' + lab + '</th>' + a.map(function (v, i) { return '<td>' + fmt(v) + ' <span class="muted">/ ' + fmt(b[i]) + '</span></td>'; }).join('') + '</tr>'; };
    return '<section class="card"><h2>Machine-learning prediction</h2>' +
      '<p>This structure was in the held-out test set, so the models never saw it in training.</p>' +
      '<dl class="kv"><dt>Predicted class</dt><dd>' + esc(ml.cls || '–') + '</dd><dt>P(adsorber)</dt><dd>' + fmt(ml.p, 4) + '</dd></dl>' +
      '<table><thead><tr><th>predicted / GCMC</th><th>0.1 bar</th><th>1 bar</th><th>10 bar</th></tr></thead><tbody>' +
      r('CO<sub>2</sub> (mol/kg)', ml.co2, g.co2) + r('CH<sub>4</sub> (mol/kg)', ml.ch4, g.ch4) + '</tbody></table></section>';
  }

  // ------------------------------------------------------------------ detail
  function renderDetail(name) {
    detachViewer();
    app.innerHTML = '<p class="loading">Loading the structure…</p>';
    fetchJSON('s/' + encodeURIComponent(name)).then(function (p) {
      var A = analyze(p), pn = pretty(p.name), t = TPL[p.tpl] || {}, f = FAM[p.fam] || { code: p.fam };
      var back = { fam: p.fam, tpl: p.tpl, m1: p.m1, x: p.x }; if (p.m2) back.m2 = p.m2;
      var counts = {}; A.atoms.forEach(function (a) { counts[a.e] = (counts[a.e] || 0) + 1; });
      var siteOf = {}; A.atoms.forEach(function (a) { siteOf[a.e] = siteOf[a.e] || {}; siteOf[a.e][a.site] = 1; });
      var els = Object.keys(counts).sort(function (x, y) {
        var o = { M: 0, X: 1, T: 2 }, sx = Object.keys(siteOf[x]).sort()[0], sy = Object.keys(siteOf[y]).sort()[0];
        return (o[sx] - o[sy]) || x.localeCompare(y);
      });
      var rep = p.cell.a < 4.5 ? 3 : 2;
      app.innerHTML =
        '<div id="selp"></div>' +
        '<div class="title"><h1>' + pn.html + '</h1><p class="muted">' + esc(f.code) + ' · ' + (t.f || '') + ' · n = ' + p.layers +
        (pn.cell ? ' · ' + pn.cell + ' cell' : '') + '</p></div>' +
        '<div class="viewer-wrap" id="vwrap"><div class="vbar"><button class="btn" type="button" id="reset">Reset view</button>' +
        '<span class="seg" role="group" aria-label="Cells shown">' + [1, 2, 3].map(function (k) {
          return '<button type="button" data-rep="' + k + '" aria-pressed="' + (k === rep) + '">' + k + ' × ' + k + '</button>'; }).join('') +
        '</span><span class="hint">Tap an atom or a bond</span></div></div>' +
        '<section class="card sel" id="selcard"><p class="muted">Tap an atom or a bond in the 3D view, or an element below, to see its properties.</p></section>' +
        '<section class="card"><h2>Elements</h2><div class="legend" id="legend"></div></section>' +
        '<section class="card"><h2>Structure</h2><dl class="kv">' +
        '<dt>Unit cell a · b · c</dt><dd>' + p.cell.a.toFixed(3) + ' · ' + p.cell.b.toFixed(3) + ' · ' + p.cell.c.toFixed(1) + ' Å</dd>' +
        '<dt>Angles α · β · γ</dt><dd>' + [p.cell.alpha, p.cell.beta, p.cell.gamma].map(function (x) { return x.toFixed(1); }).join(' · ') + '°</dd>' +
        '<dt>Atoms in the unit cell</dt><dd>' + p.atoms.length + '</dd>' +
        '<dt>Metal layers</dt><dd>' + p.layers + '</dd>' +
        '<dt>Sheet thickness, outermost atoms</dt><dd>' + A.thick.toFixed(2) + ' Å</dd>' +
        '<dt>Bonds in the unit cell</dt><dd>' + p.bonds.length + '</dd></dl>' +
        '<p class="muted small">c includes the vacuum gap between periodic sheets.</p></section>' +
        gcmcCard(p.gcmc) + mlCard(p.ml, p.gcmc);
      document.getElementById('selp').replaceWith(selPanel(Object.assign({}, back, { t: p.t }), null));
      var lg = document.getElementById('legend');
      els.forEach(function (e) {
        var s = Object.keys(siteOf[e]).map(function (k) { return k === 'T' ? 'T<sub>x</sub>' : k; }).join('/');
        var b = h('button', { type: 'button' }, '<span class="sw" style="background:' + color(e) + '"></span>' + esc(e) +
          ' <span class="site">' + s + ' · ' + counts[e] + '</span>');
        b.addEventListener('click', function () { if (scene) showElement(e); });
        lg.appendChild(b);
      });
      if (!ensureViewer()) {
        document.getElementById('vwrap').insertAdjacentHTML('afterbegin', '<div class="viewer"><div class="vmsg">The 3D viewer could not load (no WebGL or no connection to cdnjs).</div></div>');
        return;
      }
      var wrap = document.getElementById('vwrap');
      wrap.insertBefore(vbox, wrap.firstChild);
      vbox.style.display = '';
      buildScene(p, A, rep);
      document.getElementById('reset').addEventListener('click', function () { camera(); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-rep]'), function (btn) {
        btn.addEventListener('click', function () {
          Array.prototype.forEach.call(document.querySelectorAll('[data-rep]'), function (x) { x.setAttribute('aria-pressed', x === btn); });
          buildScene(p, A, +btn.getAttribute('data-rep'));
        });
      });
    }, function (e) {
      app.innerHTML = errorCard(e) + '<div class="sp-actions"><button class="btn2 prev" type="button" onclick="history.back()">' +
        '<span class="ico" aria-hidden="true">←</span> Back</button><a class="btn2 reset" href="#/"><span class="ico" aria-hidden="true">↺</span> Start over</a></div>';
    });
  }

  // ------------------------------------------------------------------ make: "See how MXenes are made" (AO5, 05.10.2026)
  /* Experimental routes from the MAX phase to single-layer flakes as an interactive illustration, in the language of
     the companion page's Section 4 panel: a light scene in both themes, Run | Step | Reset, 44 px controls, still
     frames under prefers-reduced-motion. Every condition and number shown is quoted from the paper cited next to it
     (content table and checked quotes: team/LIBRARY_SYNTH_CONTENT_v1.md); where a source gives no number the text
     stays qualitative, and a step a route does not have is greyed with the reason. Citations are written {KEY KEY}. */
  var MK_SRC = {
    N11: ['Naguib 2011', 'M. Naguib et al., “Two-dimensional nanocrystals produced by exfoliation of Ti<sub>3</sub>AlC<sub>2</sub>”, <i>Adv. Mater.</i> 23, 4248 (2011)', '10.1002/adma.201102306'],
    N12: ['Naguib 2012', 'M. Naguib et al., “Two-dimensional transition metal carbides”, <i>ACS Nano</i> 6, 1322 (2012)', '10.1021/nn204153h'],
    M13: ['Mashtalir 2013', 'O. Mashtalir et al., “Intercalation and delamination of layered carbides and carbonitrides”, <i>Nat. Commun.</i> 4, 1716 (2013)', '10.1038/ncomms2664'],
    G14: ['Ghidiu 2014', 'M. Ghidiu et al., “Conductive two-dimensional titanium carbide ‘clay’ with high volumetric capacitance”, <i>Nature</i> 516, 78 (2014)', '10.1038/nature13970'],
    H14: ['Halim 2014', 'J. Halim et al., “Transparent conductive two-dimensional titanium carbide epitaxial thin films”, <i>Chem. Mater.</i> 26, 2374 (2014)', '10.1021/cm500641a'],
    N15: ['Naguib 2015', 'M. Naguib et al., “Large-scale delamination of multi-layers transition metal carbides and carbonitrides ‘MXenes’”, <i>Dalton Trans.</i> 44, 9353 (2015)', '10.1039/C5DT01247C'],
    L16: ['Lipatov 2016', 'A. Lipatov et al., “Effect of synthesis on quality, electronic properties and environmental stability of individual monolayer Ti<sub>3</sub>C<sub>2</sub> MXene flakes”, <i>Adv. Electron. Mater.</i> 2, 1600255 (2016)', '10.1002/aelm.201600255'],
    S16: ['Sang 2016', 'X. Sang et al., “Atomic defects in monolayer titanium carbide (Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>) MXene”, <i>ACS Nano</i> 10, 9193 (2016)', '10.1021/acsnano.6b05240'],
    Ho16: ['Hope 2016', 'M. A. Hope et al., “NMR reveals the surface functionalisation of Ti<sub>3</sub>C<sub>2</sub> MXene”, <i>Phys. Chem. Chem. Phys.</i> 18, 5099 (2016)', '10.1039/C6CP00330C'],
    A17: ['Alhabeb 2017', 'M. Alhabeb et al., “Guidelines for synthesis and processing of two-dimensional titanium carbide (Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> MXene)”, <i>Chem. Mater.</i> 29, 7633 (2017)', '10.1021/acs.chemmater.7b02847'],
    L18: ['Li 2018', 'T. Li et al., “Fluorine-free synthesis of high-purity Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> (T = OH, O) via alkali treatment”, <i>Angew. Chem. Int. Ed.</i> 57, 6115 (2018)', '10.1002/anie.201800887'],
    Y18: ['Yang 2018', 'S. Yang et al., “Fluoride-free synthesis of two-dimensional titanium carbide (MXene) using a binary aqueous system”, <i>Angew. Chem. Int. Ed.</i> 57, 15491 (2018)', '10.1002/anie.201809662'],
    L19: ['Li 2019', 'M. Li et al., “Element replacement approach by reaction with Lewis acidic molten salts to synthesize nanolaminated MAX phases and MXenes”, <i>J. Am. Chem. Soc.</i> 141, 4730 (2019)', '10.1021/jacs.9b00574'],
    L20: ['Li 2020', 'Y. Li et al., “A general Lewis acidic etching route for preparing MXenes with enhanced electrochemical performance in non-aqueous electrolyte”, <i>Nat. Mater.</i> 19, 894 (2020)', '10.1038/s41563-020-0657-0'],
    K20: ['Kamysbayev 2020', 'V. Kamysbayev et al., “Covalent surface modifications and superconductivity of two-dimensional metal carbide MXenes”, <i>Science</i> 369, 979 (2020)', '10.1126/science.aba8311'],
    V21: ['VahidMohammadi 2021', 'A. VahidMohammadi, J. Rosen, Y. Gogotsi, “The world of two-dimensional carbides and nitrides (MXenes)”, <i>Science</i> 372, eabf1581 (2021)', '10.1126/science.abf1581'],
    N21: ['Naguib 2021', 'M. Naguib, M. W. Barsoum, Y. Gogotsi, “Ten years of progress in the synthesis and development of MXenes”, <i>Adv. Mater.</i> 33, 2103393 (2021)', '10.1002/adma.202103393'],
    CDC: ['CDC', 'U.S. Centers for Disease Control and Prevention, “Hydrogen Fluoride”, Chemical Emergencies fact sheet (2024)', null,
          'https://www.cdc.gov/chemical-emergencies/chemical-fact-sheets/hydrogen-fluoride.html']
  };
  var MK_STEPS = ['MAX phase', 'Etching', 'Washing and neutralising', 'Multilayer MXene', 'Intercalation', 'Delamination',
                  'Centrifugation', 'Delaminated flakes (colloid)', 'Film (optional)'];
  var T3AC2 = 'Ti<sub>3</sub>AlC<sub>2</sub>', T3C2 = 'Ti<sub>3</sub>C<sub>2</sub>', T3C2TX = 'Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>';
  /* scene: what the canvas draws for a route. tx: termination pattern (OH = O with its H); etch: incoming species;
     prod: product labels where the Al leaves; guest2 / guest5: what sits between the layers after step 2 / step 5;
     gap4 / gap5: layer spacing (illustrative units); fan: accordion opening; delam: sonication or shaking;
     film: membrane, glass or the film on its substrate; chips: the short sourced labels on the scene. */
  var MK_METHODS = [
    { id: 'hf', name: 'HF etching', etch: 'HF (aqueous)', from: ['N11', 'A17'],
      lead: 'Hydrofluoric acid dissolves the Al layers of ' + T3AC2 + '. This is how the first MXene was made.',
      rows: [['Precursor', T3AC2 + ' powder {N11}'],
             ['Etchant', 'Aqueous HF {N11 A17}'],
             ['Typical conditions', '50 % HF, room temperature, 2 h {N11}; or 30, 10 or 5 wt % HF at room temperature (~23 °C) for 5, 18 or 24 h {A17}'],
             ['Terminations T<sub>x</sub>', '–F, –O, –OH; mostly –F {L16 Ho16}'],
             ['Product', 'Multilayer, usually accordion-like with ≥ 10 wt % HF, most clearly at 30 wt % {A17}; single flakes need a guest molecule between the layers first {M13 A17 N15}'],
             ['Safety', 'HF passes easily and quickly through the skin into the tissues. Skin contact may cause no immediate pain or visible damage; visible damage may appear only 12 to 24 hours later. Calcium gluconate is used to treat HF poisoning {CDC}. Risk assessment and safety protocols are needed at any HF concentration {A17}.']],
      extra: 'Ti<sub>2</sub>CT<sub>x</sub> is etched the same way under milder conditions, 10 % HF for 10 h; in 50 % HF for 2 h, Ti<sub>2</sub>AlC dissolved completely {N12}.',
      links: ['Ti3C2F2', 'Ti3C2(OH)2', 'Ti3C2O2', 'Ti2CF2', 'Ti2C(OH)2', 'Ti2CO2'],
      steps: [
        T3AC2 + ': ' + T3C2 + ' layers held together by Al atoms. Made by ball-milling Ti<sub>2</sub>AlC and TiC (1 : 1) for 24 h and heating at 1350 °C for 2 h under argon {N11}.',
        'HF removes the Al: ' + T3AC2 + ' + 3 HF → AlF<sub>3</sub> + 3/2 H<sub>2</sub> + ' + T3C2 + '; the bare surfaces then take up –OH and –F {N11}. About 10 g of powder in about 100 mL of 50 % HF, room temperature, 2 h {N11}. The powder is added gradually because the reaction is exothermic and bubbles {A17}.',
        'Repeated washing with water by centrifugation, 5 min at 3500 rpm per cycle, until the supernatant reaches pH ~6 {A17}.',
        'Multilayer ' + T3C2TX + '. The accordion-like shape usually appears with ≥ 10 wt % HF, most clearly at 30 wt % {A17}; it comes from the hydrogen gas released during etching {V21}.',
        'HF-etched multilayers need a guest molecule between the layers. Dimethyl sulfoxide (DMSO), stirred for 18 h at room temperature, raises the c lattice parameter from 19.5 to 35.0 Å {M13}; it works for ' + T3C2TX + ' but does not appear to enter other MXenes {N15}. Alternatives: TMAOH, 12 h at room temperature {A17}, or TBAOH, stirred for 2.5 days and then sonicated {A17}; Naguib et al. used TBAOH on other MXenes, V<sub>2</sub>CT<sub>x</sub> and Ti<sub>3</sub>CNT<sub>x</sub> {N15}.',
        'The DMSO-intercalated powder is mixed with water (1 : 500 by weight) and bath-sonicated for 6 h {M13}.',
        'Centrifugation removes the large, undelaminated particles; the flakes stay in the supernatant {M13}. In the TMAOH route the colloid is collected after 1 h at 3500 rpm {A17}.',
        'The flakes stay dispersed in water: their terminations charge them negatively (zeta potential below −30 mV) {V21}, and a laser beam through the colloid shows the Tyndall effect {M13}. TMAOH route: about 0.5 mg/mL, flakes 0.2–0.7 µm {A17}.',
        'Vacuum filtration through a porous alumina membrane (0.2 µm pores) gives free-standing “MXene paper” that detaches easily from the membrane {M13}.'],
      scene: { tx: ['F', 'F', 'O', 'F', 'OH', 'F', 'O'], etch: 'hf', prod: ['AlF₃', 'H₂'], etchName: 'HF', prodMol: 'AlF3', txName: '–F, –OH, –O bind to the bare Ti',
               eq: ['Ti₃AlC₂ + 3 HF → AlF₃ + 3/2 H₂ + Ti₃C₂'], ph: 'pH ~6', gapNote: 'c: 19.5 → 35.0 Å', sed: 'large, undelaminated particles', sedShort: 'large particles', gap2: 1.6, gap4: 1.7, fan: 1, guest5: 'dmso', gap5: 2.6,
               delam: 'sonic', beam: true, film: 'membrane',
               chips: [null, '50 % HF · room temp. · 2 h', 'water · 5-min spins at 3500 rpm', 'accordion-like multilayer', 'DMSO · 18 h', 'sonication · 6 h',
                       'large particles removed', 'zeta < −30 mV · Tyndall effect', 'vacuum filtration'] } },
    { id: 'lif-hcl', name: 'In situ HF · LiF + HCl', etch: 'LiF + HCl', from: ['G14', 'L16', 'A17'],
      lead: 'LiF and HCl form HF in the solution. Li<sup>+</sup> and water enter between the layers while the Al is etched.',
      rows: [['Precursor', T3AC2 + ' powder {G14 A17}'],
             ['Etchant', 'LiF dissolved in HCl; HF forms in the solution and LiCl is a by-product {A17}'],
             ['Typical conditions', 'Clay route: LiF in 6 M HCl, 40 °C, 45 h {G14}. MILD route: 0.8 g LiF in 10 mL of 9 M HCl with 0.5 g ' + T3AC2 + ', room temperature, 24 h {A17}.'],
             ['Terminations T<sub>x</sub>', '–O, –F, –OH; mostly –O {L16 Ho16}'],
             ['Product', 'Multilayer but not accordion-like; it behaves like clay {V21 G14}. It delaminates without a separate intercalation step {V21 A17}.'],
             ['Safety', 'Avoids handling concentrated HF {G14}, but etchants of this kind contain 3–5 wt % HF {A17}, and the HF safety protocols still apply {N21}.']],
      extra: 'MILD (minimally intensive layer delamination) uses more LiF than the clay route: the LiF : ' + T3AC2 + ' molar ratio goes from 5 to 7.5 {L16}, or ≥ 7.5 {A17}. Lipatov et al. kept 6 M HCl but doubled its volume, 20 mL per 1 g of MAX phase {L16}; the Alhabeb protocol shown here uses 9 M HCl {A17}. The name was given by Sang et al. {S16}.',
      links: ['Ti3C2O2', 'Ti3C2(OH)2', 'Ti3C2F2'],
      steps: [
        T3AC2 + ' powder, the same MAX phase as for HF etching {G14 A17}.',
        'LiF is dissolved in HCl first, then the ' + T3AC2 + ' powder is added slowly {G14 A17}; LiF must be the limiting reagent {A17}. The HF formed in the solution removes the Al, and Li<sup>+</sup> ions hydrated by water enter between the layers {V21 N21}. MILD: 0.8 g LiF, 10 mL of 9 M HCl, 0.5 g ' + T3AC2 + ', room temperature, 24 h {A17}.',
        'Washing by centrifugation, 5 min at 3500 rpm per cycle, until pH 4–5. From pH ≥ 5 a dark-green supernatant appears: delamination has already begun {A17}.',
        'Multilayer ' + T3C2TX + ' without the accordion shape of HF-etched powder {V21}. The wet sediment behaves like clay and can be rolled into films {G14}. Air-dried, its c lattice parameter is 27–28 Å (up to about 40 Å while still wet), against about 20 Å after HF etching {G14}.',
        'No separate step: Li<sup>+</sup> and water entered the layers during etching {V21}.',
        'MILD: shaking by hand is enough; sonication, which breaks flakes into smaller pieces, is not needed {A17 L16}. The clay route used 30–60 min of sonication {G14}.',
        'A 2-min spin at 3500 rpm removes unetched ' + T3AC2 + '; spinning the supernatant for 1 h at 3500 rpm leaves mainly single-layer flakes in the dark supernatant {A17}.',
        'A colloid of about 1–2 mg/mL {A17}; the flakes are often larger than 2 µm {A17}, 4–15 µm in Lipatov’s modified route {L16}.',
        'Vacuum filtration through a porous polymer membrane (Celgard or PVDF) gives a free-standing film {A17}; the clay itself can be rolled into films from below 1 µm to about 100 µm thick {G14}.'],
      scene: { tx: ['O', 'O', 'F', 'O', 'OH', 'O', 'O', 'F'], etch: 'lif', prod: ['Al removed'], note2: 'HF forms in the solution', etchName: 'LiF + HCl', txName: '–O, –F, –OH bind to the bare Ti',
               ph: 'pH 4–5', sed: 'unetched Ti₃AlC₂', sedShort: 'unetched MAX', guest2: 'liw', gap2: 1.95, gap4: 2.25, guest5: 'pre',
               delam: 'shake', film: 'membrane',
               chips: [null, 'LiF + 9 M HCl · room temp. · 24 h', 'water · 5-min spins at 3500 rpm', 'clay-like multilayer, no accordion', 'Li⁺ and water already in place',
                       'shaking by hand', '3500 rpm · 1 h', '1–2 mg/mL', 'vacuum filtration'] } },
    { id: 'nh4hf2', name: 'Bifluoride · NH<sub>4</sub>HF<sub>2</sub>', etch: 'NH<sub>4</sub>HF<sub>2</sub> (aqueous)', from: ['H14'],
      lead: 'A milder fluoride etchant, first used on epitaxial ' + T3AC2 + ' thin films.',
      rows: [['Precursor', 'Epitaxial ' + T3AC2 + ' thin films, 15–60 nm thick, sputtered at 780 °C onto sapphire {H14}'],
             ['Etchant', '1 M NH<sub>4</sub>HF<sub>2</sub> (aqueous) {H14}'],
             ['Typical conditions', 'Room temperature, 150–660 min depending on film thickness; 50 % HF needed 10–160 min {H14}. For powder: 0.5 g in 10 mL of 2 M NH<sub>4</sub>HF<sub>2</sub>, room temperature, 24 h {A17}.'],
             ['Terminations T<sub>x</sub>', '–O, –OH, –F {H14}'],
             ['Product', 'A transparent, conductive ' + T3C2TX + ' film of about 1 × 1 cm<sup>2</sup> on sapphire, with NH<sub>4</sub><sup>+</sup> and NH<sub>3</sub> between the layers {H14}'],
             ['Safety', 'Less hazardous than HF and a milder etchant {H14}; still a fluoride salt that forms HF in the etchant {A17}.']],
      links: ['Ti3C2O2', 'Ti3C2(OH)2', 'Ti3C2F2'],
      steps: [
        'A ' + T3AC2 + ' film grown by DC magnetron sputtering at 780 °C on sapphire, on top of a thin TiC(111) seed layer {H14}.',
        T3AC2 + ' + 3 NH<sub>4</sub>HF<sub>2</sub> → (NH<sub>4</sub>)<sub>3</sub>AlF<sub>6</sub> + ' + T3C2 + ' + 3/2 H<sub>2</sub>, in 1 M NH<sub>4</sub>HF<sub>2</sub> at room temperature; etching is stopped when the ' + T3AC2 + ' X-ray peaks have disappeared {H14}.',
        'The films are rinsed in deionized water, then in ethanol {H14}.',
        'The layers stay on the substrate as a multilayer film. Its c lattice parameter grows from 18.6 Å (' + T3AC2 + ') to 24.7 Å, against 19.8 Å after HF etching {H14}.',
        'No separate step: NH<sub>4</sub><sup>+</sup> and NH<sub>3</sub> enter between the layers during etching {H14}.',
        null, null, null,
        'The etched film itself is the product: transparent and electrically conductive, about 1 × 1 cm<sup>2</sup> {H14}.'],
      na: 'Not part of this route: the product is kept as a film on its substrate {H14}.',
      scene: { tx: ['O', 'OH', 'F', 'O', 'OH', 'F'], etch: 'nh4hf2', prod: ['(NH₄)₃AlF₆', 'H₂'], etchName: 'NH₄HF₂', txName: '–O, –OH, –F bind to the bare Ti',
               eq: ['Ti₃AlC₂ + 3 NH₄HF₂ → (NH₄)₃AlF₆ + Ti₃C₂ + 3/2 H₂'], guest2: 'nh4', gap2: 1.95, gap4: 2.1, guest5: 'pre',
               substrate: true, film: 'substrate',
               chips: ['Ti₃AlC₂ film on sapphire', '1 M NH₄HF₂ · room temp.', 'water, then ethanol', 'c = 24.7 Å', 'NH₄⁺ / NH₃ already in place',
                       null, null, null, 'transparent, conductive film'] } },
    { id: 'molten', name: 'Lewis-acid molten salt', etch: 'ZnCl<sub>2</sub> · CuCl<sub>2</sub> melts', from: ['L19', 'L20', 'K20'],
      lead: 'Fluorine-free: a molten chloride salt takes the A layer out and leaves –Cl terminations.',
      rows: [['Precursor', T3AC2 + ' for ZnCl<sub>2</sub> {L19}; Ti<sub>3</sub>SiC<sub>2</sub> in the main CuCl<sub>2</sub> example {L20}'],
             ['Etchant', 'Molten ZnCl<sub>2</sub>, which melts at ~280 °C {L19}; CuCl<sub>2</sub> mixed with NaCl and KCl {L20}'],
             ['Typical conditions', T3AC2 + ' : ZnCl<sub>2</sub> = 1 : 6 (molar), 550 °C, 5 h, argon {L19}. Ti<sub>3</sub>SiC<sub>2</sub> : CuCl<sub>2</sub> : NaCl : KCl = 1 : 3 : 2 : 2 (molar), 750 °C for 24 h under argon {L20}.'],
             ['Terminations T<sub>x</sub>', '–Cl only with ZnCl<sub>2</sub> {L19}; –Cl and –O, no –OH, with CuCl<sub>2</sub> {L20}'],
             ['Product', 'Multilayer ' + T3C2 + 'Cl<sub>2</sub> {L19}; accordion-like with CuCl<sub>2</sub> {L20}. Single flakes were obtained in a later study, from ' + T3C2 + 'Cl<sub>2</sub> made in molten CdCl<sub>2</sub>, after a further Li<sup>+</sup> intercalation step {K20}.'],
             ['Safety', 'No fluoride {N21}; described as considerably safer and cleaner than HF etching {L19}. The reactions run at 550–750 °C {L19 L20}.']],
      extra: 'CdBr<sub>2</sub> melts give ' + T3C2 + 'Br<sub>2</sub> (610 °C); heating ' + T3C2 + 'Br<sub>2</sub> with LiH at 300 °C in a bromide salt melt then removes the Br and leaves bare ' + T3C2 + ' {K20}.',
      links: ['Ti3C2Cl2', 'Ti3C2Br2', 'Ti3C2'],
      steps: [
        T3AC2 + ', itself made in a NaCl/KCl salt melt at 1100 °C for 3 h {L19}. The main CuCl<sub>2</sub> example of Li et al. 2020 starts from Ti<sub>3</sub>SiC<sub>2</sub>; the same melt also etched ' + T3AC2 + ' {L20}.',
        'Mixed with excess ZnCl<sub>2</sub> (1 : 6, molar) and held at 550 °C for 5 h under argon {L19}. Zn first takes the place of Al, ' + T3AC2 + ' + 1.5 ZnCl<sub>2</sub> → Ti<sub>3</sub>ZnC<sub>2</sub> + 0.5 Zn + AlCl<sub>3</sub>, and the AlCl<sub>3</sub> (boiling point ~180 °C) evaporates; then Ti<sub>3</sub>ZnC<sub>2</sub> + ZnCl<sub>2</sub> → ' + T3C2 + 'Cl<sub>2</sub> + 2 Zn {L19}. In molten CuCl<sub>2</sub>, the Si of Ti<sub>3</sub>SiC<sub>2</sub> leaves as volatile SiCl<sub>4</sub> {V21}.',
        'Water washes out the leftover ZnCl<sub>2</sub>; the Zn metal is dissolved in 5 wt % HCl at 25 °C for 2 h {L19}. In the CuCl<sub>2</sub> route the Cu is removed with 0.1 M ammonium persulfate (APS) {L20}.',
        'Multilayer ' + T3C2 + 'Cl<sub>2</sub> with only –Cl terminations, opened along the basal planes; c = 22.24 Å {L19}.',
        'A separate step, from a later study that made its ' + T3C2 + 'Cl<sub>2</sub> in molten CdCl<sub>2</sub>: the multilayer powder stirred in 2.5 M n-butyllithium at 50 °C for 24 h takes up Li<sup>+</sup> between the layers {K20}.',
        'The Li<sup>+</sup>-intercalated powder is put in N-methylformamide (NMF) and bath-sonicated for 1 h below 10 °C {K20}.',
        'The supernatant is collected after 15 min at 1500 rpm; a second spin at 9000 rpm for 15 min removes small impurities {K20}.',
        'Redispersed in fresh NMF, the flakes form stable colloidal solutions of single-layer ' + T3C2 + 'Cl<sub>2</sub>; kept in a nitrogen-filled glovebox, the colloid stayed stable for several months {K20}.',
        'Spin-coating the colloid onto glass gives a thin film {K20}.'],
      scene: { tx: ['Cl'], etch: 'zncl2', prod: ['AlCl₃ ↑', 'Zn'], etchName: 'molten ZnCl₂', prodMol: 'AlCl3', txName: '–Cl binds to the bare Ti',
               eq: ['Ti₃AlC₂ + 1.5 ZnCl₂ → Ti₃ZnC₂ + 0.5 Zn + AlCl₃', 'Ti₃ZnC₂ + ZnCl₂ → Ti₃C₂Cl₂ + 2 Zn'], eqSwitch: 0.5, sed: 'settled particles', sedShort: 'settled', heat: true, gap2: 1.6, gap4: 1.75, guest5: 'li', gap5: 2.3, delam: 'sonic', film: 'glass', beam: true,
               chips: [null, 'ZnCl₂ melt · 550 °C · 5 h · argon', 'Zn dissolved in HCl', 'Ti₃C₂Cl₂ multilayer · –Cl only', 'n-butyllithium · 50 °C · 24 h',
                       'in NMF · sonication · 1 h', '1500 rpm · 15 min', 'stable for months under N₂', 'spin-coating on glass'] } },
    { id: 'naoh', name: 'Alkali · NaOH', etch: 'NaOH (aqueous)', from: ['L18'],
      lead: 'Fluorine-free: hot, concentrated NaOH removes the Al, as in the Bayer process that refines bauxite.',
      rows: [['Precursor', T3AC2 + ' powder {L18}'],
             ['Etchant', '27.5 M NaOH (aqueous) {L18}'],
             ['Typical conditions', '270 °C for 12 h in an autoclave purged with argon; 100 mg of powder in 25 mL {L18}'],
             ['Terminations T<sub>x</sub>', '–OH, –O; no fluorine {L18}'],
             ['Product', 'Multilayer ' + T3C2TX + ', about 92 wt % pure by an X-ray diffraction estimate {L18}; a review describes the result as a mixture of MAX phase and MXene, i.e. partial etching {N21}'],
             ['Safety', 'No fluoride {L18}, but 27.5 M NaOH at 270 °C in a sealed autoclave {L18}.']],
      links: ['Ti3C2(OH)2', 'Ti3C2O2'],
      steps: [
        T3AC2 + ' powder {L18}.',
        'Hydrothermal treatment in 27.5 M NaOH at 270 °C for 12 h, in an autoclave sealed under argon {L18}. As in the Bayer process, hot concentrated NaOH dissolves the Al, which ends up in the solution as Al(OH)<sub>4</sub><sup>−</sup> {L18}.',
        'The powder is filtered (PVDF membrane, 0.1 µm pores), rinsed with water several times and dried in vacuum at 65 °C for 12 h {L18}.',
        'Multilayer ' + T3C2TX + ' with –OH and –O terminations, about 92 wt % pure by an X-ray diffraction estimate {L18}; some unreacted ' + T3AC2 + ' is left {L18 N21}.',
        '100 mg of the NaOH-etched powder is stirred in 5 mL of dimethyl sulfoxide (DMSO) for 18 h; the excess DMSO is removed by centrifugation {L18}.',
        'Water is added (MXene : water = 1 : 500 by weight) and the mixture is bath-sonicated for 6 h {L18}.',
        'Centrifugation at 3500 rpm for 60 min; the colloid in the supernatant is collected {L18}.',
        'Few-layer ' + T3C2TX + ' flakes, characterised by AFM and TEM {L18}.',
        null],
      na: 'Not part of this route as reported: Li et al. made their film electrodes by pressing the multilayer powder with carbon black (Super-P) and PTFE binder, 80 : 10 : 10 by weight, not by filtering flakes {L18}.',
      scene: { tx: ['OH', 'O', 'OH', 'OH', 'O'], etch: 'naoh', prod: ['Al(OH)₄⁻'], etchName: 'NaOH', txName: '–OH, –O bind to the bare Ti', sed: 'settled particles', sedShort: 'settled', heat: true, gap2: 1.6, gap4: 1.65, guest5: 'dmso', gap5: 2.6, delam: 'sonic',
               chips: [null, '27.5 M NaOH · 270 °C · 12 h', 'filtered and rinsed', '~92 wt % pure', 'DMSO · 18 h', 'sonication · 6 h',
                       '3500 rpm · 60 min', 'few-layer flakes', null] } },
    { id: 'echem', name: 'Electrochemical', etch: 'NH<sub>4</sub>Cl + TMAOH', from: ['Y18'],
      lead: 'Fluorine-free: a voltage etches the Al out of a bulk ' + T3AC2 + ' anode in a binary aqueous electrolyte (NH<sub>4</sub>Cl + TMAOH).',
      rows: [['Precursor', 'Two pieces of bulk ' + T3AC2 + ' as anode and cathode, 2.0 cm apart; only the anode is etched {Y18}'],
             ['Etchant', '1.0 M NH<sub>4</sub>Cl + 0.2 M TMAOH, pH > 9 {Y18}'],
             ['Typical conditions', '+5.0 V, room temperature, 5 h, stirred at 300 rpm {Y18}'],
             ['Terminations T<sub>x</sub>', '–O, –OH {Y18}'],
             ['Product', 'Stacked ' + T3C2TX + '; after TMAOH and sonication, flakes up to 18.6 µm; over 90 % of the more than 50 flakes measured by AFM are about 1.2 nm thick, i.e. single layers {Y18}'],
             ['Safety', 'No fluoride {Y18}.']],
      links: ['Ti3C2O2', 'Ti3C2(OH)2'],
      steps: [
        'Two pieces of bulk ' + T3AC2 + ' are the electrodes, 2.0 cm apart {Y18}.',
        'At +5.0 V in 1.0 M NH<sub>4</sub>Cl + 0.2 M TMAOH (pH > 9), room temperature, 5 h, the anode loses its Al, followed by in situ intercalation of ammonium hydroxide between the layers {Y18}.',
        'The black sediment is collected, ground and washed with deionized water three times, until the supernatant reaches pH 7 {Y18}.',
        'Stacked (multilayer) ' + T3C2TX + ' with –O and –OH terminations {Y18}.',
        '1 g of the powder is stirred in 30 mL of 25 wt % TMAOH for 12 h at room temperature {Y18}.',
        'Sonication (140 W, 1 h) in degassed water under a continuous argon flow {Y18}.',
        'Centrifugation at 2000 rpm for 30 min removes the unexfoliated particles {Y18}.',
        'Flakes up to 18.6 µm; over 90 % of the more than 50 flakes measured by AFM are about 1.2 nm thick, i.e. single layers; the colloid in degassed water is stable for at least four weeks {Y18}.',
        'The dispersion (~1 mg/mL) is vacuum-filtered onto a 0.2 µm PTFE membrane to give a thin film, which is moved, still moist, onto gold-coated PET as a supercapacitor electrode {Y18}.'],
      scene: { tx: ['O', 'OH', 'O', 'O', 'OH'], etch: 'echem', prod: ['Al dissolves'], etchName: 'NH₄Cl + TMAOH', txName: '–O, –OH bind to the bare Ti', ph: 'pH 7', sed: 'unexfoliated particles', sedShort: 'unexfoliated', guest2: 'nh4', gap2: 1.75, gap4: 1.8, guest5: 'tma', gap5: 2.5, delam: 'sonic', anode: true, film: 'membrane', beam: true,
               chips: ['bulk Ti₃AlC₂ anode', '+5.0 V · room temp. · 5 h', 'washed 3 times with water', 'stacked multilayer', 'TMAOH · 12 h', 'sonication · 1 h',
                       '2000 rpm · 30 min', 'up to 18.6 µm', 'vacuum filtration'] } }
  ];
  var MK_BY = {}; MK_METHODS.forEach(function (m) { MK_BY[m.id] = m; });
  var MK_DOC = {};                                      // the procedure documents' content (see mkDocPages)
  var MK_SHORT = ['MAX phase', 'Etching', 'Washing', 'Multilayer', 'Intercalation', 'Delamination', 'Centrifugation', 'Flakes', 'Film'];

  // the scene: Jmol colours (pymatgen ElementColorSchemes.yaml, the scheme of elements.json; test_library.py compares
  // them), illustrative radii in units of the column spacing dx, durations in ms
  var MK_JMOL = { Ti: '#BFC2C7', Al: '#BFA6A6', Zn: '#7D80B0', C: '#909090', N: '#3050F8', O: '#FF0D0D', H: '#FFFFFF',
                  F: '#90E050', Cl: '#1FF01F', Li: '#CC80FF', Na: '#AB5CF2', S: '#FFFF30' };
  var MK_RAD = { Ti: 0.34, Al: 0.31, Zn: 0.31, C: 0.25, N: 0.24, O: 0.23, H: 0.14, F: 0.22, Cl: 0.27, Li: 0.21, Na: 0.27, S: 0.27 };
  var MK_ROWS = ['Ti', 'C', 'Ti', 'C', 'Ti'], MK_OFF = [0, 1 / 3, 2 / 3, 0, 1 / 3];    // side view of the five atomic rows
  var MK_ETCH = { hf: [['H', 'F']], lif: [['Li'], ['H', 'F'], ['Cl']], nh4hf2: [['NH4'], ['F', 'H', 'F']], zncl2: [['Cl', 'Zn', 'Cl']],
                  naoh: [['Na'], ['O', 'H']], echem: [['Cl'], ['NH4']] };
  var MK_GUEST_EL = { liw: ['Li', 'O', 'H'], li: ['Li'], nh4: ['N', 'H'], dmso: ['S', 'O', 'C'], tma: ['N', 'C'] };
  var MK_DUR = [2400, 8400, 5400, 4500, 5400, 5100, 6300, 5400, 5700];   // Normal speed (Eyüp, 06.10: slower than before)
  var MK_HOLD = 1600, MK_HOLD_STILL = 2600;
  var MK_SPEEDS = [['Slow', 1.6], ['Normal', 1], ['Fast', 0.55]];        // duration factors
  var MK_POSTER = { eyebrow: 'BAŞARIM 2026 · Poster 40 · İTÜ, 14–16 October 2026', title: 'From Grand Canonical Monte Carlo', title2: 'to Graph Neural Networks',
                    sub: 'An HPC-Driven Screening Framework for MXene-Based CO₂/CH₄ Separation', authors: 'Eyüp YAZKAN · Sadiye VELİOĞLU' };   // as on the companion page
  var MK_FONT = 'px Carlito, Calibri, "Segoe UI", system-ui, sans-serif';

  function mkMix(a, b, f) {
    var o = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(parseInt(a.substr(1 + 2 * i, 2), 16) * (1 - f) + parseInt(b.substr(1 + 2 * i, 2), 16) * f);
      o += (v < 16 ? '0' : '') + v.toString(16);
    }
    return o;
  }
  function mkEase(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function mkSeg(t, a, b) { return t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a); }          // progress through [a, b]
  function mkRand(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function mkStill() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function mkRR(g, x, y, w, ht, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + ht - r);
    g.quadraticCurveTo(x + w, y + ht, x + w - r, y + ht); g.lineTo(x + r, y + ht); g.quadraticCurveTo(x, y + ht, x, y + ht - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function mkEls(m) {          // elements drawn for a route, for the key under the scene
    var s = m.scene, set = { Ti: 1, C: 1, Al: 1, O: 1, H: 1 };     // O and H: the wash water
    s.tx.forEach(function (e) { if (e === 'OH') { set.O = set.H = 1; } else set[e] = 1; });
    (MK_ETCH[s.etch] || []).forEach(function (k) { k.forEach(function (e) { if (e === 'NH4') { set.N = set.H = 1; } else if (e === 'TMA') { set.N = set.C = 1; } else set[e] = 1; }); });
    [s.guest2, s.guest5].forEach(function (g) { (MK_GUEST_EL[g] || []).forEach(function (e) { set[e] = 1; }); });
    if (s.etch === 'zncl2') set.Zn = 1;
    return ['Ti', 'Al', 'Zn', 'C', 'N', 'O', 'H', 'F', 'Cl', 'Li', 'Na', 'S'].filter(function (e) { return set[e]; });
  }
  function mkPoses(m) {        // the scene at the end of each step; a step the route lacks keeps the previous one
    var s = m.scene, p = { gap: 1.5, fan: 0, al: 1, tx: 0, guest: 0, gtype: null, spread: 0, heat: 0, view: 'stack' }, P = [];
    var set = function (k, o) { if (m.steps[k] != null) p = Object.assign({}, p, o); P[k] = p; };
    set(0, {});
    set(1, { gap: s.gap2 || 1.6, al: 0, tx: 1, heat: s.heat ? 1 : 0, guest: s.guest2 ? 1 : 0, gtype: s.guest2 || null });
    set(2, { heat: 0 });
    set(3, { gap: s.gap4 || 1.7, fan: s.fan || 0 });
    set(4, s.guest5 && s.guest5 !== 'pre' ? { gap: s.gap5 || 2.5, guest: 1, gtype: s.guest5 } : {});
    set(5, { spread: 1, fan: 0 });                        // single flakes lie flat
    set(6, { view: 'tube' });
    set(7, { view: 'vial' });
    set(8, { view: s.film === 'substrate' ? 'stack' : 'film' });
    return P;
  }
  function mkPose(P, k, t) {
    var a = k > 0 ? P[k - 1] : P[0], b = P[k], e = mkEase(t), o = { al: b.al, gtype: b.gtype, view: b.view };
    ['gap', 'fan', 'tx', 'guest', 'spread', 'heat'].forEach(function (f) { o[f] = a[f] + (b[f] - a[f]) * e; });
    return o;
  }

  function mkEngine(cv) {
    var E = { cv: cv, g: cv.getContext('2d'), W: 0, H: 0, dpr: 1, L: null, sprites: {}, flakes: {}, am: 1, m: null, P: null };
    E.resize = function () {
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      E.W = r.width; E.H = r.height; E.dpr = Math.min(2, window.devicePixelRatio || 1); E.sprites = {}; E.flakes = {};
      cv.width = Math.round(E.W * E.dpr); cv.height = Math.round(E.H * E.dpr);
      // top: step line, conditions chip, equation strip; bottom: caption and element key (HTML over the canvas)
      var top = 86, bot = E.W < 420 ? 82 : 70, avail = E.H - top - bot, dxH = avail / 14, frac = E.W < 420 ? 0.5 : 0.58;
      var ncol = Math.max(7, Math.min(15, Math.floor(frac * E.W / dxH) + 1)), dx = Math.min(dxH, frac * E.W / (ncol - 1));
      E.L = { dx: dx, ncol: ncol, hw: (ncol - 1) / 2 * dx, cx: E.W / 2, cy: top + avail / 2, top: top, bot: E.H - bot, avail: avail };
      return true;
    };
    E.setRoute = function (m) { E.m = m; E.P = mkPoses(m); };
    E.draw = function (k, t) {
      if (!E.L) return;
      var g = E.g, m = E.m, P = E.P, s = m.scene;
      g.setTransform(E.dpr, 0, 0, E.dpr, 0, 0); g.globalAlpha = 1;
      var bg = g.createLinearGradient(0, 0, 0, E.H);                // light in both page themes, as in Section 4
      bg.addColorStop(0, '#FFFFFF'); bg.addColorStop(1, '#EEF3F8');
      g.fillStyle = bg; g.fillRect(0, 0, E.W, E.H);
      var j = k; while (j > 0 && m.steps[j] == null) j--;          // (steps a route lacks are never shown; safety net)
      var view = P[j].view, prev = j > 0 ? P[j - 1].view : view;
      if (view !== prev && t < 1) {                                 // a change of view cross-fades
        var c = mkSeg(t, 0, 0.3);
        E.am = 1 - c; if (E.am > 0.01) mkScene(E, j - 1, 1);
        E.am = c; mkScene(E, j, t);
      } else { E.am = 1; mkScene(E, j, t); }
      E.am = 1;
      var chip = s.chips[j] || (j === 0 ? 'Ti₃AlC₂ · MAX phase' : null);
      if (chip) mkLabel(E, chip, E.W / 2, 41, j === 0 ? 1 : mkSeg(t, 0.06, 0.24), { pill: '#0F766E', color: '#0F766E', bold: true, size: 12 });
      var eq = j === 1 && s.eq ? (s.eq.length > 1 && t >= (s.eqSwitch || 0.5) ? s.eq[1] : s.eq[0]) : null;
      if (eq) mkLabel(E, eq, E.W / 2, 68, mkSeg(t, 0.04, 0.2), { size: 11, color: '#1E3A5F', wrap: true });
    };
    return E;
  }
  function mkScene(E, k, t) {
    var p = mkPose(E.P, k, t), v = E.P[k].view;
    if (v === 'stack') mkStack(E, p, k, t, k > 0 ? E.P[k - 1] : E.P[0]);
    else if (v === 'tube') mkCentrifuge(E, k === 6 ? t : 1);
    else if (v === 'vial') mkColloid(E, k === 7 ? t : 1);
    else mkFilm(E, k === 8 ? t : 1);
  }
  function mkSprite(E, el, r) {
    var key = el + Math.round(r * 4), sp = E.sprites[key];
    if (sp) return sp;
    var R = r + 1, n = Math.ceil(2 * R * E.dpr), c = document.createElement('canvas'), col = MK_JMOL[el] || '#888888';
    c.width = c.height = n;
    var g = c.getContext('2d'), mid = n / 2, rr = r * E.dpr;
    var gr = g.createRadialGradient(mid - 0.35 * rr, mid - 0.4 * rr, 0.1 * rr, mid, mid, rr);
    gr.addColorStop(0, mkMix(col, '#FFFFFF', 0.7)); gr.addColorStop(0.5, col); gr.addColorStop(1, mkMix(col, '#000000', 0.42));
    g.fillStyle = gr; g.beginPath(); g.arc(mid, mid, rr, 0, 2 * Math.PI); g.fill();
    g.lineWidth = Math.max(0.7, 0.07 * rr); g.strokeStyle = 'rgba(31, 41, 55, 0.45)'; g.stroke();
    c.R = R;
    return (E.sprites[key] = c);
  }
  function mkAtom(E, el, x, y, a, r) {
    if (a <= 0.01) return;
    var sp = mkSprite(E, el, r || MK_RAD[el] * E.L.dx);
    E.g.globalAlpha = Math.min(1, a) * E.am;
    E.g.drawImage(sp, x - sp.R, y - sp.R, 2 * sp.R, 2 * sp.R);
  }
  /* a text label on the scene: one or more lines ('\n'), optionally in a pill; o.wrap breaks a long one-line
     equation after its arrow; o.align left/right/center refers to x */
  function mkLabel(E, s, x, y, a, o) {
    if (a <= 0.01) return;
    o = o || {};
    var g = E.g, size = o.size || 11, font = function () { g.font = (o.bold ? '700 ' : '600 ') + size + MK_FONT; };
    font();
    var lines = s.split('\n'), wid = function () { return Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; })); };
    if (o.wrap && lines.length === 1 && wid() > E.W - 20 && s.indexOf('→') > 0) lines = [s.slice(0, s.indexOf('→') - 1), s.slice(s.indexOf('→'))];
    var w = wid();
    while (w + 14 > E.W - 8 && size > 9) { size -= 1; font(); w = wid(); }
    var lh = size * 1.2, ht = lines.length * lh, x0 = o.align === 'left' ? x : o.align === 'right' ? x - w - 12 : x - w / 2 - 6;
    x0 = Math.max(3, Math.min(E.W - w - 15, x0));
    g.globalAlpha = Math.min(1, a) * E.am;
    if (o.pill) {
      mkRR(g, x0, y - ht / 2 - 5, w + 12, ht + 10, Math.min(12, (ht + 10) / 2));
      g.fillStyle = 'rgba(255, 255, 255, 0.95)'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = o.pill; g.stroke();
    }
    g.fillStyle = o.color || '#1F2937'; g.textBaseline = 'middle'; g.textAlign = 'left';
    lines.forEach(function (l, i) { g.fillText(l, x0 + 6 + (o.align === 'center' || !o.align ? (w - g.measureText(l).width) / 2 : 0), y - ht / 2 + lh * (i + 0.5) + 0.5); });
    return { x0: x0, w: w + 12 };
  }
  function mkCall(E, s, ax, ay, lx, ly, a, o) {          // a label with a leader line to what it names
    if (a <= 0.01) return;
    var g = E.g;
    g.globalAlpha = Math.min(1, a) * E.am; g.strokeStyle = '#4B5563'; g.fillStyle = '#4B5563'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(lx, ly); g.stroke();
    g.beginPath(); g.arc(ax, ay, 2.2, 0, 2 * Math.PI); g.fill();
    mkLabel(E, s, lx, ly, a, Object.assign({ pill: '#9AA3AE', size: 11, align: lx < ax ? 'right' : 'left' }, o || {}));
  }
  function mkArrow(E, x0, y0, x1, y1, a, both, col) {    // a straight arrow (both: double-headed)
    if (a <= 0.01) return;
    var g = E.g, an = Math.atan2(y1 - y0, x1 - x0), hd = function (x, y, d) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 7 * Math.cos(d - 0.45), y - 7 * Math.sin(d - 0.45)); g.lineTo(x - 7 * Math.cos(d + 0.45), y - 7 * Math.sin(d + 0.45)); g.closePath(); g.fill();
    };
    g.globalAlpha = Math.min(1, a) * E.am; g.strokeStyle = g.fillStyle = col || '#0F766E'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    hd(x1, y1, an); if (both) hd(x0, y0, an + Math.PI);
  }
  function mkMol(E, kind, x, y, a, sc) {
    var d = E.L.dx * (sc || 1), r = function (e) { return MK_RAD[e] * d; };
    if (typeof kind !== 'string' && kind.length === 1 && !MK_RAD[kind[0]]) kind = kind[0];    // ['NH4'] from MK_ETCH
    if (kind === 'NH4' || kind === 'TMA') {
      var o = kind === 'NH4' ? 'H' : 'C', q = kind === 'NH4' ? 0.24 : 0.3;
      mkAtom(E, o, x - q * d, y - q * d, a, r(o)); mkAtom(E, o, x + q * d, y - q * d, a, r(o));
      mkAtom(E, 'N', x, y, a, r('N'));
      mkAtom(E, o, x - q * d, y + q * d, a, r(o)); mkAtom(E, o, x + q * d, y + q * d, a, r(o));
      return;
    }
    if (kind === 'H2O') { mkAtom(E, 'H', x - 0.2 * d, y + 0.15 * d, a, r('H')); mkAtom(E, 'H', x + 0.2 * d, y + 0.15 * d, a, r('H')); mkAtom(E, 'O', x, y, a, r('O')); return; }
    if (kind === 'DMSO') {
      mkAtom(E, 'C', x - 0.33 * d, y + 0.13 * d, a, r('C')); mkAtom(E, 'C', x + 0.33 * d, y + 0.13 * d, a, r('C'));
      mkAtom(E, 'S', x, y, a, r('S')); mkAtom(E, 'O', x, y - 0.33 * d, a, r('O'));
      return;
    }
    if (kind === 'AlF3' || kind === 'AlCl3') {           // a product molecule: Al with three halogens around it
      var X = kind === 'AlF3' ? 'F' : 'Cl', q2 = 0.36 * d;
      mkAtom(E, X, x, y - q2, a, r(X)); mkAtom(E, 'Al', x, y, a, r('Al'));
      mkAtom(E, X, x - q2 * 0.87, y + q2 * 0.5, a, r(X)); mkAtom(E, X, x + q2 * 0.87, y + q2 * 0.5, a, r(X));
      return;
    }
    var rs = kind.map(function (e) { return MK_RAD[e] * d; }), len = 0;     // a linear chain such as H–F or Cl–Zn–Cl
    rs.forEach(function (rr, i) { if (i) len += 0.8 * (rs[i - 1] + rr); });
    var xx = x - len / 2;
    kind.forEach(function (e, i) { if (i) xx += 0.8 * (rs[i - 1] + rs[i]); mkAtom(E, e, xx, y, a, rs[i]); });
  }
  function mkGuest(E, type, x, y, a, i) {
    if (type === 'liw') { if (i % 2) mkMol(E, 'H2O', x, y, a); else mkAtom(E, 'Li', x, y, a); }
    else if (type === 'li') mkAtom(E, 'Li', x, y, a);
    else if (type === 'nh4') mkMol(E, 'NH4', x, y, a);
    else if (type === 'dmso') mkMol(E, 'DMSO', x, y + 0.08 * E.L.dx, a);
    else if (type === 'tma') mkMol(E, 'TMA', x, y, a);
  }
  var MK_GUEST_NAME = { liw: 'Li⁺ and water', li: 'Li⁺', nh4: 'NH₄⁺', dmso: 'DMSO', tma: 'TMA⁺' };

  function mkStack(E, p, k, t, pk) {
    var L = E.L, dx = L.dx, g = E.g, s = E.m.scene, hw = L.hw, th = 2 * dx, pitch = th + p.gap * dx, narrow = E.W < 420;
    var cy = L.cy - (s.substrate ? 0.9 * dx : 0) - (k === 5 && s.delam === 'sonic' ? 0.3 * dx * p.spread : 0);
    var spreadMax = Math.max(pitch, 0.44 * (L.avail - th - (s.delam === 'sonic' ? 2.2 : 1.4) * dx));
    var pitchS = pitch + (spreadMax - pitch) * p.spread;
    var jig = (k === 5 && s.delam === 'shake' && t < 1) ? Math.sin(t * Math.PI * 16) * 0.22 * dx * (1 - t) : 0;
    var SH = [0, 1, 2].map(function (i) {
      return { x: L.cx + [-0.07, 0.08, -0.03][i] * E.W * p.spread + jig * (i - 1), y: cy + (i - 1) * pitchS, a: [-0.05, 0.04, -0.03][i] * p.spread, f: i - 1 };
    });
    var pt = function (sh, u, v) {                       // a point of a sheet: u along it, v across it (px)
      var w = v + p.fan * sh.f * Math.pow(Math.min(1, Math.abs(u) / hw), 1.7) * 1.15 * dx, c = Math.cos(sh.a), si = Math.sin(sh.a);
      return [sh.x + u * c - w * si, sh.y + u * si + w * c];
    };
    var gapPt = function (i, u, f) {                     // a point between sheet i and sheet i + 1 (f = 0.5: the middle)
      var a = pt(SH[i], u, th / 2), b = pt(SH[i + 1], u, -th / 2);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };
    var cols = function (off) { var out = []; for (var j = 0; j < L.ncol; j++) { var u = (j - (L.ncol - 1) / 2 + off) * dx; if (u <= hw + 0.45 * dx) out.push(u); } return out; };
    var rnd = mkRand(11 + MK_METHODS.indexOf(E.m) * 7 + k);
    var eA = k === 1, left = L.cx - hw - 0.9 * dx, right = L.cx + hw + 0.9 * dx;
    var lab = function (sx, side) { return side < 0 ? Math.max(6, left - (narrow ? 4 : 14)) : Math.min(E.W - 6, right + (narrow ? 4 : 14)); };

    if (p.heat > 0.01) {                                 // molten salt / hot NaOH
      g.globalAlpha = 0.55 * p.heat * E.am;
      var hg = g.createLinearGradient(0, cy - 2 * pitch, 0, cy + 2 * pitch);
      hg.addColorStop(0, 'rgba(253, 232, 210, 0)'); hg.addColorStop(0.5, '#FBD9B5'); hg.addColorStop(1, 'rgba(253, 232, 210, 0)');
      g.fillStyle = hg; g.fillRect(0, cy - 2 * pitch, E.W, 4 * pitch);
    }
    if (k === 5 && s.delam === 'sonic') mkBath(E, t, p.spread);
    if (s.substrate) {                                   // the sapphire substrate under the film
      var sy = SH[2].y + th / 2 + 0.75 * dx;
      g.globalAlpha = E.am; mkRR(g, L.cx - hw - 1.2 * dx, sy, 2 * hw + 2.4 * dx, 1.5 * dx, 4);
      g.fillStyle = '#DCE6F0'; g.fill(); g.lineWidth = 1; g.strokeStyle = '#A9B9CB'; g.stroke();
      mkLabel(E, 'sapphire substrate', L.cx, sy + 0.75 * dx, 1, { size: 10, color: '#4B5563' });
    }
    if (s.anode && k <= 3) {                             // the bulk anode of the electrochemical cell
      var ax = left - 0.4 * dx, ay = cy - pitch - th / 2 - 0.9 * dx;
      g.globalAlpha = E.am; g.beginPath(); g.arc(ax, ay, 0.45 * dx, 0, 2 * Math.PI); g.lineWidth = 1.6; g.strokeStyle = '#0F766E'; g.stroke();
      mkLabel(E, '+', ax, ay, 1, { size: 13, bold: true, color: '#0F766E', align: 'center' });
      if (k <= 1) mkLabel(E, 'anode', ax + 0.6 * dx, ay, 1, { size: 10, color: '#0F766E', align: 'left' });
    }
    SH.forEach(function (sh) {                           // a pale band behind each Ti3C2 sheet, so the layers read as layers
      g.globalAlpha = E.am; g.beginPath();
      for (var u = -hw - 0.3 * dx; u <= hw + 0.31 * dx; u += dx / 2) { var q = pt(sh, u, 0); if (u === -hw - 0.3 * dx) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]); }
      g.lineWidth = th + 0.75 * dx; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(30, 58, 95, 0.075)'; g.stroke();
    });
    // the A layer sites: above, between and below the sheets
    var aSites = [];
    cols(2 / 3).forEach(function (u) {
      aSites.push([0, u, pt(SH[0], u, -(th / 2 + 0.55 * dx))]);
      aSites.push([1, u, gapPt(0, u, 0.5)]); aSites.push([1, u, gapPt(1, u, 0.5)]);
      aSites.push([2, u, pt(SH[2], u, th / 2 + 0.55 * dx)]);
    });
    if (k === 0 || (eA && t < 0.45)) {                   // the Al layers: an amber band so they stand out from the Ti3C2 sheets
      var ab = k === 0 ? 1 : 1 - mkSeg(t, 0.25, 0.45);
      [[0, -(th / 2 + 0.55 * dx)], [2, th / 2 + 0.55 * dx]].concat([[-1, 0], [-2, 1]]).forEach(function (row) {
        g.globalAlpha = 0.5 * ab * E.am; g.beginPath();
        for (var u = -hw - 0.2 * dx; u <= hw + 0.21 * dx; u += dx / 2) {
          var q = row[0] >= 0 ? pt(SH[row[0]], u, row[1]) : gapPt(-row[0] - 1, u, 0.5);
          if (u === -hw - 0.2 * dx) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]);
        }
        g.lineWidth = 0.75 * dx; g.lineCap = 'round'; g.strokeStyle = '#F6D9A6'; g.stroke();
      });
    }
    // the sheets, C rows first so the Ti rows sit on top
    [1, 3, 0, 2, 4].forEach(function (r) {
      var v = (r - 2) * 0.5 * dx;
      SH.forEach(function (sh) { cols(MK_OFF[r]).forEach(function (u) { var q = pt(sh, u, v); mkAtom(E, MK_ROWS[r], q[0], q[1], 1); }); });
    });
    // terminations
    var txA = eA ? mkSeg(t, s.etch === 'zncl2' ? 0.6 : 0.55, 0.95) : p.tx, txAt = null;
    if (txA > 0.01) SH.forEach(function (sh, i) {
      [-1, 1].forEach(function (side) {
        cols(0.5).forEach(function (u, j) {
          var e = s.tx[(j + 2 * i + (side > 0 ? 3 : 0)) % s.tx.length], v = side * (th / 2 + (e === 'Cl' ? 0.5 : 0.42) * dx), q = pt(sh, u, v);
          if (i === 0 && side < 0 && j === Math.floor(cols(0.5).length * 0.7)) txAt = q;
          if (e === 'OH') { var h2 = pt(sh, u + 0.16 * dx, v + side * 0.3 * dx); mkAtom(E, 'H', h2[0], h2[1], txA); mkAtom(E, 'O', q[0], q[1], txA); }
          else mkAtom(E, e, q[0], q[1], txA);
        });
      });
    });
    // the A layer atoms
    if (k === 0) aSites.forEach(function (a) { mkAtom(E, 'Al', a[2][0], a[2][1], 1); });
    else if (eA) aSites.forEach(function (a) {
      var u = a[1], edge = 1 - Math.abs(u) / hw, dir = u < 0 ? -1 : 1;
      if (s.etch === 'zncl2') {                          // Al is replaced by Zn first, then the Zn leaves
        var c = mkSeg(t, 0.12 + 0.16 * edge, 0.28 + 0.16 * edge), st = 0.5 + 0.18 * edge, d = mkEase(mkSeg(t, st, st + 0.25));
        mkAtom(E, 'Al', a[2][0], a[2][1], 1 - c);
        mkAtom(E, 'Zn', a[2][0] + dir * d * (hw * 0.2 + 1.2 * dx), a[2][1] + d * 0.9 * dx, c * (1 - mkSeg(d, 0.3, 0.8)));
      } else {
        var st2 = 0.2 + 0.3 * edge, d2 = mkEase(mkSeg(t, st2, st2 + 0.28));
        mkAtom(E, 'Al', a[2][0] + dir * d2 * (hw * 0.2 + 1.2 * dx), a[2][1] - d2 * 0.5 * dx, 1 - mkSeg(d2, 0.25, 0.75));   // leaves, then becomes the product
      }
    });
    // guests between the layers
    var nq = Math.max(3, Math.floor(L.ncol / 2)), sp = 2 * hw / nq, gAt = null;
    var guests = function (type, alpha, slide) {
      if (!type || alpha <= 0.01) return;
      [0, 1].forEach(function (gi) {
        for (var q = 0; q < nq; q++) {
          var u = (q - (nq - 1) / 2) * sp, uu = u + (u < 0 ? -1 : 1) * (1 - slide) * (hw + 2 * dx), xy = gapPt(gi, uu, 0.5);
          if (gi === 0 && q === nq - 1) gAt = xy;
          mkGuest(E, type, xy[0], xy[1], alpha * (1 - p.spread), q + gi);
        }
      });
    };
    var entering = (eA && s.guest2) || (k === 4 && p.gtype && p.gtype !== pk.gtype);
    if (entering) {
      if (k === 4 && pk.gtype) guests(pk.gtype, pk.guest * (1 - mkSeg(t, 0.2, 0.6)), 1);
      guests(p.gtype, mkSeg(t, 0.3, 0.55), mkEase(mkSeg(t, 0.3, 0.95)));
    } else guests(p.gtype, p.guest, 1);
    if (k === 4 && s.guest5 === 'pre' && t < 1) {        // already in place: a short highlight
      g.globalAlpha = Math.sin(Math.PI * t) * 0.7 * E.am; g.lineWidth = 1.5; g.strokeStyle = '#0F766E';
      [0, 1].forEach(function (gi) { for (var q = 0; q < nq; q++) { var xy = gapPt(gi, (q - (nq - 1) / 2) * sp, 0.5); g.beginPath(); g.arc(xy[0], xy[1], 0.5 * dx, 0, 2 * Math.PI); g.stroke(); } });
    }

    // ---- what the step shows, named on the scene
    if (k === 0) {
      var b0 = pt(SH[1], hw + 0.5 * dx, -th / 2), b1 = pt(SH[1], hw + 0.5 * dx, th / 2), bx = b0[0] + 0.25 * dx;
      g.globalAlpha = E.am; g.strokeStyle = '#1E3A5F'; g.lineWidth = 1.6; g.beginPath();
      g.moveTo(bx - 4, b0[1]); g.lineTo(bx, b0[1]); g.lineTo(bx, b1[1]); g.lineTo(bx - 4, b1[1]); g.stroke();
      mkLabel(E, narrow ? 'one\nTi₃C₂\nlayer' : 'one Ti₃C₂ layer\n(Ti–C–Ti–C–Ti)', bx + 6, (b0[1] + b1[1]) / 2, 1, { align: 'left', size: narrow ? 10 : 11, color: '#1E3A5F' });
      var a0 = gapPt(0, -hw + dx / 3, 0.5);
      mkCall(E, narrow ? 'Al\nlayer' : 'Al layer', a0[0] - 0.2 * dx, a0[1], lab(a0[0], -1), a0[1] - 0.9 * dx, 1, { pill: '#D9A65A', size: narrow ? 10 : 11 });
    }
    if (eA) {                                            // etchant in, products out
      var kinds = MK_ETCH[s.etch], room = Math.max(0, E.W / 2 - hw - 1.6 * dx), mol1 = null;
      for (var i = 0; i < 10; i++) {
        var side = i % 2 ? 1 : -1, yy = cy + (rnd() * 2 - 1) * pitch * 1.15, xs = L.cx + side * (hw + 1.0 * dx + rnd() * room), di = rnd() * 0.12;
        var e = mkEase(mkSeg(t, di, di + 0.32)), x = xs + (L.cx + side * (hw - 0.4 * dx) - xs) * e, al = mkSeg(t, di, di + 0.06) * (1 - mkSeg(t, 0.42 + di, 0.56 + di));
        mkMol(E, kinds[i % kinds.length], x, yy, al);
        if (i === 0) mol1 = [x, yy, al];
      }
      if (mol1 && s.etchName) mkCall(E, s.etchName, mol1[0], mol1[1] - 0.35 * dx, mol1[0] + 0.2 * dx, L.top + 4, mol1[2] * (1 - mkSeg(t, 0.36, 0.44)), { align: 'left' });
      if (s.prod.indexOf('H₂') >= 0) for (var b = 0; b < 8; b++) {
        var bs = 0.34 + rnd() * 0.36, by = cy + (rnd() * 2 - 1) * pitch, bx2 = L.cx + (b % 2 ? 1 : -1) * (hw + 0.3 * dx + rnd() * dx), bp = mkSeg(t, bs, bs + 0.4);
        if (bp > 0 && bp < 1) { g.globalAlpha = (1 - bp) * 0.8 * E.am; g.beginPath(); g.arc(bx2, by - bp * 3 * dx, (0.14 + 0.1 * rnd()) * dx, 0, 2 * Math.PI); g.lineWidth = 1.2; g.strokeStyle = '#5C8DB8'; g.stroke(); }
      }
      if (s.prodMol) for (var q3 = 0; q3 < 4; q3++) {    // the Al leaves as a product molecule
        var ps = 0.32 + q3 * 0.08, pp = mkEase(mkSeg(t, ps, ps + 0.4)), sd = q3 % 2 ? 1 : -1, gy = gapPt(q3 % 2, sd * hw, 0.5)[1];
        mkMol(E, s.prodMol, L.cx + sd * (hw + 0.6 * dx + pp * (room + 0.4 * dx)), gy - pp * 1.4 * dx, mkSeg(t, ps, ps + 0.06) * (1 - mkSeg(t, 0.9, 1) * 0.3));
      }
      if (s.etch === 'zncl2') {
        mkLabel(E, 'Zn replaces Al: Ti₃ZnC₂', L.cx, cy - pitch - th / 2 - 0.9 * dx, mkSeg(t, 0.22, 0.32) * (1 - mkSeg(t, 0.5, 0.6)), { pill: '#7D80B0', color: '#3F4377', bold: true });
        mkLabel(E, s.prod[0], lab(0, -1), cy - pitch - mkEase(mkSeg(t, 0.2, 0.6)) * 1.2 * dx, mkSeg(t, 0.2, 0.32), { pill: '#B4C3D3', align: 'right' });
        mkLabel(E, s.prod[1], lab(0, 1), cy + pitch + th / 2 + 0.9 * dx, mkSeg(t, 0.62, 0.75), { pill: '#B4C3D3', align: 'left' });
      } else s.prod.forEach(function (lb, i2) {
        var side2 = i2 ? 1 : -1;
        mkLabel(E, lb, lab(0, side2), cy - 0.6 * pitch - mkEase(mkSeg(t, 0.45, 1)) * 1.3 * dx, mkSeg(t, 0.45, 0.58), { pill: '#B4C3D3', align: i2 ? 'left' : 'right' });
      });
      if (s.note2) mkLabel(E, s.note2, L.cx, L.bot - 10, mkSeg(t, 0.05, 0.18) * (1 - mkSeg(t, 0.5, 0.62)), { size: 11, color: '#374151', pill: '#B4C3D3' });
      if (txAt) mkCall(E, s.txName || 'terminations bind to Ti', txAt[0], txAt[1], txAt[0] - 0.3 * dx, L.top + 4, mkSeg(t, 0.72, 0.84), { pill: '#0F766E', color: '#0F766E', align: 'right' });
      if (gAt && s.guest2) mkCall(E, MK_GUEST_NAME[s.guest2] + ' enter', gAt[0], gAt[1], lab(0, 1), gAt[1] + 1.1 * dx, mkSeg(t, 0.7, 0.82), { align: 'left' });
    }
    if (k === 2) {                                       // washing: water carries the acid and the products away
      for (var w = 0; w < 16; w++) {                     // (at the end of the step a few stay, for the still picture)
        var row = w % 4, wx = t < 1 ? -1.5 * dx - rnd() * E.W * 0.7 + mkEase(t) * E.W * 1.75 : (rnd(), L.cx + ((w * 0.37) % 1 - 0.5) * 2 * hw), wu = wx - L.cx;
        if (t >= 1 && (row === 0 || row === 3 || w > 11)) continue;
        var wy = row === 0 ? SH[0].y - th / 2 - 1.1 * dx : row === 3 ? SH[2].y + th / 2 + 1.1 * dx : gapPt(row - 1, Math.max(-hw, Math.min(hw, wu)), 0.5)[1];
        mkMol(E, 'H2O', wx, wy + Math.sin(wx / (2 * dx)) * 0.12 * dx, 0.9);
      }
      if (s.prodMol || (MK_ETCH[s.etch] || []).length) for (var r2 = 0; r2 < 4; r2++) {  // leftovers leave to the right
        var rx = L.cx + (r2 % 2 ? 1 : -1) * (hw + 0.8 * dx) + mkEase(mkSeg(t, 0.05 + r2 * 0.08, 0.6 + r2 * 0.08)) * E.W, ry = cy + (r2 - 1.5) * 0.8 * pitch;
        mkMol(E, r2 % 2 && s.prodMol ? s.prodMol : (MK_ETCH[s.etch] || [['H', 'F']])[0], rx, ry, 1 - mkSeg(t, 0.55, 0.85));
      }
      if (t < 0.9) mkLabel(E, 'water', L.cx - hw - 0.5 * dx, SH[0].y - th / 2 - 1.1 * dx, mkSeg(t, 0.05, 0.15) * (1 - mkSeg(t, 0.75, 0.9)), { size: 10, color: '#1E3A5F', align: 'right' });
      if (s.ph) {                                        // the pH the washing reaches (as the source states it)
        var pa = mkSeg(t, 0.55, 0.8);
        mkLabel(E, 'acidic', E.W - 8, L.top + 6, 1 - pa, { pill: '#D7263D', color: '#9B1C2E', align: 'right', bold: true, size: 11 });
        mkLabel(E, s.ph, E.W - 8, L.top + 6, pa, { pill: '#0F766E', color: '#0F766E', align: 'right', bold: true, size: 11 });
      }
    }
    if (k === 3) {                                       // multilayer: what holds the sheets now, and the gap
      var m0 = pt(SH[0], -hw * 0.15, th / 2 + 0.05 * dx), m1 = pt(SH[1], -hw * 0.15, -th / 2 - 0.05 * dx), ma = mkSeg(t, 0.4, 0.7);
      mkArrow(E, m0[0], m0[1], m1[0], m1[1], ma, true);
      mkLabel(E, 'gap', m0[0] + 5, (m0[1] + m1[1]) / 2, ma, { align: 'left', size: 10, color: '#0F766E', bold: true });
      if (s.fan) { var fp = pt(SH[0], hw, -th / 2); mkCall(E, narrow ? 'accordion-\nlike edge' : 'layers splay open:\naccordion-like', fp[0], fp[1], lab(0, 1), L.top + 6, mkSeg(t, 0.55, 0.8)); }
    }
    if (k === 4 && t >= 0) {                             // intercalation: name the guest, show the gap growing
      if (gAt && p.gtype) mkCall(E, MK_GUEST_NAME[p.gtype], gAt[0], gAt[1], lab(0, 1), gAt[1] - 1.3 * dx, s.guest5 === 'pre' ? 1 : mkSeg(t, 0.55, 0.75), { align: 'left' });
      var i0 = pt(SH[1], -hw * 0.3, th / 2 + 0.05 * dx), i1 = pt(SH[2], -hw * 0.3, -th / 2 - 0.05 * dx);
      mkArrow(E, i0[0], i0[1], i1[0], i1[1], mkSeg(t, 0.5, 0.75), true);
      if (s.gapNote) mkLabel(E, s.gapNote, lab(0, -1), (i0[1] + i1[1]) / 2, mkSeg(t, 0.6, 0.8), { align: 'right', size: 10, color: '#0F766E', bold: true, pill: '#0F766E' });
    }
    if (k === 5 && t < 1 && s.delam === 'shake') {      // shaking by hand
      mkLabel(E, '⟷', L.cx + Math.sin(t * Math.PI * 16) * 0.4 * dx, L.bot - 8, 1 - mkSeg(t, 0.85, 1), { size: 20, bold: true, color: '#0F766E' });
      mkLabel(E, 'shaken by hand', L.cx, L.bot - 26, 1 - mkSeg(t, 0.85, 1), { size: 11, color: '#0F766E' });
    }
    if (k === 8 && s.substrate) mkLabel(E, narrow ? 'etched\nfilm' : 'etched film\n(Ti₃C₂Tₓ)', lab(0, 1), SH[0].y, 1, { align: 'left', pill: '#0F766E', color: '#0F766E', size: 11 });
  }
  function mkBath(E, t, spread) {                        // an ultrasonic bath under the sheets
    var L = E.L, g = E.g, w = Math.min(E.W - 24, 2 * L.hw + 4 * L.dx), x0 = L.cx - w / 2, y0 = L.top - 12, y1 = L.bot - 2;
    g.globalAlpha = E.am; g.fillStyle = '#E4F1F4'; g.fillRect(x0, y0, w, y1 - y0 - 10);
    g.lineWidth = 2; g.strokeStyle = '#7C8A9C'; g.beginPath(); g.moveTo(x0, y0 - 6); g.lineTo(x0, y1 - 10); g.lineTo(x0 + w, y1 - 10); g.lineTo(x0 + w, y0 - 6); g.stroke();
    g.fillStyle = '#5B6472'; g.fillRect(x0 + w * 0.25, y1 - 9, w * 0.5, 8);
    var fade = t < 1 ? 1 - mkSeg(t, 0.85, 1) : 0;
    for (var q = 0; q < 4; q++) {                        // ultrasound rising from the transducer
      var f = (t * 4 + q / 4) % 1;
      g.globalAlpha = (1 - f) * 0.55 * fade * E.am; g.beginPath(); g.arc(L.cx, y1 - 10, 12 + f * (y1 - y0) * 0.9, Math.PI * 1.2, Math.PI * 1.8);
      g.lineWidth = 2; g.strokeStyle = '#0F766E'; g.stroke();
    }
    mkLabel(E, E.W < 420 ? 'ultrasonic\nbath' : 'ultrasonic bath', x0 + 4, y0 + 14, 1, { size: 10, color: '#374151', align: 'left' });
    mkLabel(E, 'ultrasound', L.cx, y1 - 5, 1, { size: 9, color: '#FFFFFF', bold: true });
  }

  function mkFlakeSprite(E, w, r) {                      // one single-layer flake, side view, drawn once per size
    var key = Math.round(w) + ':' + Math.round(r * 4), c = E.flakes[key];
    if (c) return c;
    var tx = E.m.scene.tx.map(function (e) { return e === 'OH' ? 'O' : e; }), ht = 8 * r, dpr = E.dpr;
    c = document.createElement('canvas'); c.width = Math.ceil((w + 2 * r + 2) * dpr); c.height = Math.ceil(ht * dpr);
    var sub = { g: c.getContext('2d'), am: 1, sprites: E.sprites, dpr: dpr, L: E.L };
    sub.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.max(4, Math.round(w / (2.3 * r))), stp = w / n, x0 = r + 1 + stp / 2, mid = ht / 2;
    for (var i = 0; i < n; i++) {                       // Ti rows, the C row between them, terminations on both faces
      mkAtom(sub, 'Ti', x0 + i * stp, mid - 1.7 * r, 1, r); mkAtom(sub, 'Ti', x0 + i * stp, mid + 1.7 * r, 1, r);
      mkAtom(sub, 'C', x0 + i * stp, mid, 1, 0.75 * r);
      mkAtom(sub, tx[i % tx.length], x0 + i * stp, mid - 3.05 * r, 1, 0.62 * r); mkAtom(sub, tx[(i + 2) % tx.length], x0 + i * stp, mid + 3.05 * r, 1, 0.62 * r);
    }
    c.cw = w + 2 * r + 2; c.ch = ht;
    return (E.flakes[key] = c);
  }
  function mkFlake(E, x, y, w, ang, a, r) {
    if (a <= 0.01) return;
    var c = mkFlakeSprite(E, w, r || Math.max(1.3, Math.min(2.6, w / 24))), g = E.g;
    g.save(); g.globalAlpha = Math.min(1, a) * E.am; g.translate(x, y); g.rotate(ang); g.drawImage(c, -c.cw / 2, -c.ch / 2, c.cw, c.ch); g.restore();
  }
  function mkSpin(E, x, y, r, t) {                       // a turning arrow (spin-coater)
    var g = E.g, a0 = t * Math.PI * 4;
    g.globalAlpha = E.am; g.lineWidth = 2; g.strokeStyle = '#0F766E';
    g.beginPath(); g.arc(x, y, r, a0, a0 + Math.PI * 1.5); g.stroke();
    var ax = x + r * Math.cos(a0 + Math.PI * 1.5), ay = y + r * Math.sin(a0 + Math.PI * 1.5), tg = a0 + Math.PI * 2;
    g.beginPath(); g.moveTo(ax + 4 * Math.cos(tg), ay + 4 * Math.sin(tg)); g.lineTo(ax + 4 * Math.cos(tg + 2.4), ay + 4 * Math.sin(tg + 2.4));
    g.lineTo(ax + 4 * Math.cos(tg - 2.4), ay + 4 * Math.sin(tg - 2.4)); g.closePath(); g.fillStyle = '#0F766E'; g.fill();
  }
  function mkCentrifuge(E, t) {                          // a spinning rotor, and the tube: heavy particles sink, flakes stay up
    var L = E.L, g = E.g, s = E.m.scene, rnd = mkRand(5), narrow = E.W < 420;
    var th = Math.min(L.avail + 30, 320), tw = Math.min(0.24 * E.W, 92), tx = E.W * (narrow ? 0.56 : 0.55), x0 = tx - tw / 2, y0 = L.top - 14 + (L.avail + 30 - th) / 2;
    var rB = tw / 2, yb = y0 + th - rB, R = Math.min(0.2 * E.W, 0.28 * th, 84), rx = Math.max(R + 6, x0 - R - (narrow ? 10 : 40)), ry = y0 + th * 0.42;
    // the rotor, seen from above
    var spin = (t < 1 ? mkEase(t) : 1) * Math.PI * 10;
    g.globalAlpha = E.am; g.beginPath(); g.arc(rx, ry, R, 0, 2 * Math.PI); g.fillStyle = '#EEF2F6'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#7C8A9C'; g.stroke();
    for (var a = 0; a < 4; a++) {
      var an = spin + a * Math.PI / 2, cx = rx + Math.cos(an) * R * 0.62, cyy = ry + Math.sin(an) * R * 0.62;
      g.save(); g.translate(cx, cyy); g.rotate(an); mkRR(g, -R * 0.26, -R * 0.11, R * 0.52, R * 0.22, R * 0.1);
      g.fillStyle = a === 0 ? '#9CCFC6' : '#C9D4E0'; g.fill(); g.lineWidth = 1; g.strokeStyle = '#7C8A9C'; g.stroke(); g.restore();
    }
    g.beginPath(); g.arc(rx, ry, R * 0.12, 0, 2 * Math.PI); g.fillStyle = '#5B6472'; g.fill();
    if (t < 1) { g.globalAlpha = E.am * (1 - mkSeg(t, 0.85, 1)); g.beginPath(); g.arc(rx, ry, R + 6, spin, spin + Math.PI * 0.7); g.lineWidth = 2.5; g.strokeStyle = '#0F766E'; g.stroke(); }
    mkLabel(E, 'centrifuge', rx, ry + R + 12, 1, { size: 10, color: '#374151' });
    // the tube
    var path = function (top) { g.beginPath(); g.moveTo(x0, top); g.lineTo(x0, yb); g.arc(tx, yb, rB, Math.PI, 0, true); g.lineTo(x0 + tw, top); };
    var sep = mkEase(mkSeg(t, 0.15, 0.85));
    g.globalAlpha = E.am; path(y0 + 0.1 * th); g.closePath();
    var lg = g.createLinearGradient(0, y0, 0, yb + rB);
    lg.addColorStop(0, '#D4E5E1'); lg.addColorStop(0.7, mkMix('#D4E5E1', '#9FB8B1', 0.35 * sep)); lg.addColorStop(1, '#D4E5E1');
    g.fillStyle = lg; g.fill();
    for (var q = 0; q < 7; q++) {                        // heavy stacks sink
      var sx = tx + (rnd() - 0.5) * (tw - 26), sy = y0 + 0.2 * th + rnd() * 0.5 * th, ex = tx + (q - 3) * (tw - 30) / 6, ey = yb + rB * 0.42 - (q % 2) * 6;
      var e = mkEase(mkSeg(t, 0.12 + q * 0.04, 0.62 + q * 0.04)), x = sx + (ex - sx) * e, y = sy + (ey - sy) * e;
      for (var l = 0; l < 3; l++) mkFlake(E, x, y - l * 5, tw * 0.24, 0, 1, 1.2);
    }
    for (var f = 0; f < 7; f++) {                        // single flakes stay up
      var fx = tx + (rnd() - 0.5) * (tw - 30), fy = y0 + 0.18 * th + rnd() * 0.4 * th + Math.sin(t * 6 + f) * 2;
      mkFlake(E, fx, fy, tw * 0.46, (rnd() - 0.5) * 0.5, 1, 1.3);
    }
    path(y0); g.globalAlpha = E.am; g.lineWidth = 2; g.strokeStyle = '#7C8A9C'; g.stroke();
    g.fillStyle = '#5B6472'; g.fillRect(x0 - 3, y0 - 8, tw + 6, 8);
    var lx = x0 + tw + 6;
    mkCall(E, narrow ? 'supernatant:\nflakes' : 'supernatant:\ndelaminated flakes', x0 + tw - 6, y0 + 0.32 * th, lx + 4, y0 + 0.22 * th, mkSeg(t, 0.55, 0.75), { size: narrow ? 10 : 11, align: 'left' });
    mkCall(E, narrow ? 'sediment:\n' + (s.sedShort || 'heavy particles') : 'sediment:\n' + (s.sed || 'heavier particles'), x0 + tw - 8, yb + rB * 0.3, lx + 4, yb - 0.05 * th, mkSeg(t, 0.6, 0.8), { size: narrow ? 10 : 11, align: 'left' });
  }
  function mkColloid(E, t) {                             // flakes dispersed in the liquid; a magnified flake shows the charge
    var L = E.L, g = E.g, s = E.m.scene, rnd = mkRand(9), narrow = E.W < 420;
    var vw = Math.min(0.66 * E.W, 300), vh = Math.min(L.avail + 20, 270), x0 = (narrow ? 0.4 : 0.42) * E.W - vw / 2, y0 = L.top - 6 + (L.avail + 20 - vh) / 2;
    x0 = Math.max(8, x0);
    var shape = function () {
      g.beginPath(); g.moveTo(x0, y0 + 0.1 * vh); g.lineTo(x0, y0 + vh - 16); g.quadraticCurveTo(x0, y0 + vh, x0 + 16, y0 + vh);
      g.lineTo(x0 + vw - 16, y0 + vh); g.quadraticCurveTo(x0 + vw, y0 + vh, x0 + vw, y0 + vh - 16); g.lineTo(x0 + vw, y0 + 0.1 * vh);
    };
    g.globalAlpha = E.am; shape(); g.closePath(); g.fillStyle = '#D4E5E1'; g.fill();
    if (s.beam) {                                        // a laser beam through the colloid: the Tyndall effect
      var ba = mkSeg(t, 0.25, 0.45), by = y0 + 0.66 * vh;
      g.globalAlpha = ba * E.am; g.lineWidth = 1.5; g.strokeStyle = '#D7263D';
      g.beginPath(); g.moveTo(2, by); g.lineTo(x0, by); g.moveTo(x0 + vw, by); g.lineTo(E.W - 2, by); g.stroke();
      g.globalAlpha = ba * 0.3 * E.am; g.lineWidth = 10; g.beginPath(); g.moveTo(x0, by); g.lineTo(x0 + vw, by); g.stroke();
      g.globalAlpha = ba * E.am; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, by); g.lineTo(x0 + vw, by); g.stroke();
      mkLabel(E, 'laser', 3, by - 11, ba, { align: 'left', size: 10, color: '#9B1C2E' });
      mkLabel(E, narrow ? 'visible beam:\nTyndall effect' : 'the beam is visible:\nTyndall effect', x0 + vw + 4, by + 22, ba, { align: 'left', size: 10, color: '#9B1C2E' });
    }
    var big = null;
    for (var f = 0; f < 7; f++) {
      var fw = vw * (0.26 + 0.06 * rnd()), fx = x0 + 12 + fw / 2 + rnd() * (vw - 24 - fw), fy = y0 + 0.2 * vh + rnd() * 0.68 * vh, ph = rnd() * 6.28;
      var x = fx + Math.sin(t * 5 + ph) * 3, y = fy + Math.cos(t * 4 + ph) * 2, an = (rnd() - 0.5) * 0.6;
      mkFlake(E, x, y, fw, an, 1, 1.6);
      if (f === 2) big = [x, y];
    }
    g.globalAlpha = E.am; g.lineWidth = 2; g.strokeStyle = '#7C8A9C';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y0 + vh - 16); g.quadraticCurveTo(x0, y0 + vh, x0 + 16, y0 + vh);
    g.lineTo(x0 + vw - 16, y0 + vh); g.quadraticCurveTo(x0 + vw, y0 + vh, x0 + vw, y0 + vh - 16); g.lineTo(x0 + vw, y0); g.stroke();
    // the magnifier: one flake, its negatively charged faces
    var ma = mkSeg(t, 0.3, 0.55), R = Math.min(0.22 * E.W, 0.28 * vh, 84), mx = Math.min(E.W - R - 6, x0 + vw + (narrow ? -R * 0.35 : R * 0.6)), my = y0 + R + 18;
    if (big && ma > 0.01) {
      g.globalAlpha = ma * 0.6 * E.am; g.strokeStyle = '#4B5563'; g.lineWidth = 1; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(big[0], big[1]); g.lineTo(mx - R * 0.7, my + R * 0.7); g.stroke(); g.setLineDash([]);
      g.globalAlpha = ma * E.am; g.beginPath(); g.arc(mx, my, R, 0, 2 * Math.PI); g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1E3A5F'; g.stroke();
      g.save(); g.beginPath(); g.arc(mx, my, R - 2, 0, 2 * Math.PI); g.clip();
      mkFlake(E, mx, my, R * 1.6, 0, ma, Math.max(2.4, R / 13));
      for (var c = -2; c <= 2; c++) {
        mkLabel(E, '−', mx + c * R * 0.32, my - R * 0.42, ma, { size: 14, bold: true, color: '#1E3A5F', align: 'center' });
        mkLabel(E, '−', mx + c * R * 0.32 + R * 0.16, my + R * 0.42, ma, { size: 14, bold: true, color: '#1E3A5F', align: 'center' });
      }
      g.restore();
      mkLabel(E, narrow ? 'charged surfaces' : 'negatively charged surfaces', mx, my - R - 9, ma, { size: 10, color: '#1E3A5F', bold: true });
    }
  }
  function mkFilm(E, t) {                                // vacuum filtration (funnel, membrane, flask) or spin-coating on glass
    var L = E.L, g = E.g, s = E.m.scene, rnd = mkRand(13), narrow = E.W < 420, glass = s.film === 'glass';
    var fw = Math.min(narrow ? 0.62 * E.W : 0.44 * E.W, 240), fx = L.cx - fw / 2, ym = L.top + L.avail * (glass ? 0.62 : 0.5);
    var r = Math.max(1.3, Math.min(2.0, 0.095 * L.dx)), pitch = 6.6 * r, n = glass ? 3 : 5;
    g.globalAlpha = E.am;
    if (glass) {
      g.fillStyle = '#5B6472'; g.fillRect(L.cx - fw * 0.18, ym + 12, fw * 0.36, 26);          // the spinning chuck
      mkRR(g, fx, ym, fw, 12, 3); g.fillStyle = '#E3EEF6'; g.fill(); g.lineWidth = 1; g.strokeStyle = '#A9B9CB'; g.stroke();
      if (t < 1) mkSpin(E, L.cx, ym + 52, 12, t);
      mkCall(E, 'glass', fx + fw - 6, ym + 6, Math.min(E.W - 8, fx + fw + 10), ym + 30, 1, { size: 10, align: 'left' });
    } else {
      g.lineWidth = 2; g.strokeStyle = '#7C8A9C';                                           // funnel above the membrane
      g.fillStyle = '#E4F1F4'; g.fillRect(fx, L.top + 4, fw, ym - L.top - 4);
      g.beginPath(); g.moveTo(fx, L.top); g.lineTo(fx, ym); g.moveTo(fx + fw, L.top); g.lineTo(fx + fw, ym); g.stroke();
      g.fillStyle = '#C9D4E0'; g.fillRect(fx - 6, ym, fw + 12, 8);
      g.fillStyle = '#FFFFFF'; for (var px = fx; px < fx + fw - 2; px += 5) g.fillRect(px, ym + 1, 1.4, 6);
      var fy = ym + 10, fh = Math.min(L.bot - fy - 6, 90);                                  // the flask and the vacuum line
      g.beginPath(); g.moveTo(L.cx - 10, fy); g.lineTo(L.cx - 10, fy + 10); g.lineTo(L.cx - fw * 0.36, fy + fh); g.lineTo(L.cx + fw * 0.36, fy + fh); g.lineTo(L.cx + 10, fy + 10); g.lineTo(L.cx + 10, fy);
      g.lineWidth = 2; g.strokeStyle = '#7C8A9C'; g.stroke();
      mkArrow(E, L.cx + fw * 0.2, fy + fh * 0.45, Math.min(E.W - 6, L.cx + fw * 0.2 + (narrow ? 44 : 70)), fy + fh * 0.45, 1, false, '#1E3A5F');
      mkLabel(E, 'vacuum', Math.min(E.W - 6, L.cx + fw * 0.2 + (narrow ? 44 : 70)), fy + fh * 0.45 - 12, 1, { size: 10, color: '#1E3A5F', align: 'right' });
      mkCall(E, 'membrane', fx + 4, ym + 4, Math.max(6, fx - 8), ym + 26, 1, { size: 10, align: 'right' });
    }
    for (var q = 0; q < n; q++) {                        // flakes settle flat, one on another
      var w = fw * (0.8 + 0.12 * rnd()), sx = L.cx + (rnd() - 0.5) * fw * 0.4, sy = L.top + 10 + rnd() * 0.25 * L.avail, sa = (rnd() - 0.5) * 0.8;
      var ex = L.cx + (rnd() - 0.5) * fw * 0.06, ey = ym - 2 - pitch / 2 - q * pitch, e = mkEase(mkSeg(t, q * 0.08, q * 0.08 + 0.42));
      mkFlake(E, sx + (ex - sx) * e, sy + (ey - sy) * e, w, sa * (1 - e), mkSeg(t, q * 0.08 - 0.06, q * 0.08 + 0.02), r);
    }
    var top = ym - 2 - n * pitch;
    mkCall(E, glass ? 'thin film' : (narrow ? 'stacked\nflakes: film' : 'stacked flakes:\nfree-standing film'), L.cx + fw * 0.3, top + pitch, Math.min(E.W - 8, L.cx + fw / 2 + 8), top - 14, mkSeg(t, 0.7, 0.9), { align: 'left', pill: '#0F766E', color: '#0F766E', size: narrow ? 10 : 11 });
  }

  // the page: route picker, scene with Run | Step | Reset, the nine steps, the route card and its sources
  var mk = null;                                         // the mounted page: { state(), stop() }
  function stopMake() { if (mk) { mk.stop(); mk = null; } }
  function cite(s) {
    return s.replace(/\{([A-Za-z0-9 ]+)\}/g, function (_, keys) {
      var ks = keys.split(' ');                          // each label keeps its bracket or semicolon on its own line
      return ks.map(function (k, i) {
        var b = MK_SRC[k] ? '<a class="mk-ref" href="#mk-src-' + k + '" data-ref="' + k + '">' + esc(MK_SRC[k][0]) + '</a>' : esc(k);   // inline text: wraps with the sentence
        return '<span class="mk-c">' + (i ? '' : '(') + b + (i < ks.length - 1 ? ';' : ')') + '</span>';
      }).join(' ');
    });
  }
  function citedKeys(m) {                                // every source the route cites, oldest first
    var txt = [m.lead, m.extra || '', m.na || ''].concat(m.rows.map(function (r) { return r[1]; }), m.steps.filter(Boolean)).join(' '), keys = {};
    txt.replace(/\{([A-Za-z0-9 ]+)\}/g, function (_, ks) { ks.split(' ').forEach(function (k) { keys[k] = 1; }); return ''; });
    m.from.forEach(function (k) { keys[k] = 1; });
    return Object.keys(MK_SRC).filter(function (k) { return keys[k]; });
  }
  function srcLink(k) {
    var r = MK_SRC[k], url = r[2] ? 'https://doi.org/' + r[2] : r[3];
    return '<a href="' + url + '" target="_blank" rel="noopener">' + (r[2] ? 'doi:' + esc(r[2]) : esc(url.replace(/^https:\/\//, ''))) + '</a>';
  }
  function libName(n) { return n === 'Ti3C2' ? sub(n) + ' (bare)' : sub(n); }
  function mkIcon() {                                    // MAX phase (Al between the layers) → MXene (opened, terminated)
    var bar = function (x, y) { return '<rect x="' + x + '" y="' + y + '" width="22" height="5" rx="1.5" fill="' + MK_JMOL.Ti + '" stroke="#5B6472" stroke-width="0.8"/>'; };
    var dot = function (x, y, c) { return '<circle cx="' + x + '" cy="' + y + '" r="1.7" fill="' + c + '" stroke="#5B6472" stroke-width="0.5"/>'; };
    var s = '<svg viewBox="0 0 66 40" width="66" height="40" aria-hidden="true" focusable="false">';
    [6, 17, 28].forEach(function (y) { s += bar(2, y); });
    [14, 25].forEach(function (y) { [5, 10, 15, 20].forEach(function (x) { s += dot(x, y, MK_JMOL.Al); }); });
    s += '<path d="M28 20h8m-3-3.5 3.5 3.5-3.5 3.5" fill="none" stroke="#0F766E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
    [3, 17.5, 32].forEach(function (y) { s += bar(42, y); [45, 51, 57, 63].forEach(function (x, i) { s += dot(x, y - 1.6, i % 2 ? MK_JMOL.O : MK_JMOL.F) + dot(x - 2, y + 6.6, i % 2 ? MK_JMOL.F : MK_JMOL.O); }); });
    return s + '</svg>';
  }
  function makeEntry() {
    return h('a', { 'class': 'mk-entry', href: '#/make' },
      '<span class="mk-ei">' + mkIcon() + '</span><span class="mk-et"><span class="mk-eh">See how MXenes are made</span>' +
      '<span class="mk-ed">From MAX phase to MXene flakes and films: six experimental routes, step by step, each with its sources.</span></span>' +
      '<span class="mk-ea" aria-hidden="true">→</span>');
  }

  /* The procedure documents (Eyüp, 05.10 evening): one per route, read as pages in a dialog like the companion page's
     extended abstract. Built from MK_DOC, which holds only sentences checked against the papers (the verbatim
     supporting quotes are kept with the content files in team/LIBRARY_SYNTH_PROC/). Each item is
     [text, source key, page]; the citation prints as (Author year, p. N). */
  function docCite(it) { var r = MK_SRC[it[1]]; return ' <span class="doc-src">(' + (r ? esc(r[0]) : esc(it[1])) + (it[2] ? ', ' + esc(it[2]) : '') + ')</span>'; }
  function docList(items, tag) { return '<' + (tag || 'ul') + '>' + items.map(function (it) { return '<li>' + it[0] + docCite(it) + '</li>'; }).join('') + '</' + (tag || 'ul') + '>'; }
  function docParas(items) { return items.map(function (it) { return '<p>' + it[0] + docCite(it) + '</p>'; }).join(''); }
  var DOC_PHASE = { deposition: 'Film', mixing: 'Mixing', cell: 'Cell', etching: 'Etching', washing: 'Washing', drying: 'Drying', intercalation: 'Intercalation',
                    delamination: 'Delamination', centrifugation: 'Centrifugation', colloid: 'Colloid', film: 'Film', other: 'Step' };
  function docFlow(D) {                                  // the flowchart: one box per stage, arrows between
    return '<figure class="doc-fig"><ol class="doc-flow">' + D.flow.map(function (f, i) {
      return '<li><span class="doc-fn">' + (i + 1) + '</span><span class="doc-ft"><b>' + f[0] + '</b>' + (f[1] ? '<span>' + f[1] + '</span>' : '') + '</span></li>';
    }).join('') + '</ol><figcaption>Flowchart of the procedure on the next page; conditions as reported in the cited papers.</figcaption></figure>';
  }
  function docMech(D) {                                  // the reaction as a picture: the A layer leaves, terminations bind
    var M = D.mech, bar = function (x, y) { return '<rect x="' + x + '" y="' + y + '" width="120" height="16" rx="4" fill="' + MK_JMOL.Ti + '" stroke="#5B6472"/>'; };
    var dot = function (x, y, c, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 4.5) + '" fill="' + c + '" stroke="#5B6472" stroke-width="0.8"/>'; };
    var s = '<svg viewBox="0 0 520 190" role="img" aria-label="' + esc(M.alt) + '"><g font-family="Carlito, Calibri, sans-serif" font-size="13" fill="#1F2937">';
    [30, 80, 130].forEach(function (y) { s += bar(10, y); });
    [64, 114].forEach(function (y) { for (var x = 18; x < 130; x += 15) s += dot(x, y, MK_JMOL[M.a] || MK_JMOL.Al); });
    s += '<text x="70" y="172" text-anchor="middle" font-weight="700">' + M.from + '</text>';
    s += '<path d="M150 88h196" stroke="#0F766E" stroke-width="3"/><path d="M346 80l14 8-14 8z" fill="#0F766E"/>';
    s += '<text x="253" y="74" text-anchor="middle" font-weight="700" fill="#0F766E">' + M.agent + '</text>';
    s += '<text x="253" y="112" text-anchor="middle" fill="#5B6472">' + M.out + '</text>';
    [18, 80, 142].forEach(function (y) {
      s += bar(380, y);
      for (var x = 388, i = 0; x < 500; x += 15, i++) { var e = M.tx[i % M.tx.length]; s += dot(x, y - 6, MK_JMOL[e] || '#888888', 4) + dot(x + 6, y + 22, MK_JMOL[M.tx[(i + 1) % M.tx.length]] || '#888888', 4); }
    });
    s += '<text x="440" y="186" text-anchor="middle" font-weight="700">' + M.to + '</text></g></svg>';
    return '<figure class="doc-fig">' + s + '<figcaption>' + M.cap + '</figcaption></figure>';
  }
  function mkDocPages(m, D) {
    var refs = {}, add = function (arr) { (arr || []).forEach(function (it) { refs[it[1]] = 1; }); };
    ['summary', 'materials', 'precursor', 'procedure', 'variants', 'equations', 'explanation', 'terminations', 'product', 'safety'].forEach(function (k) { add(D[k]); });
    var head = '<h1>' + D.title + '</h1><p class="doc-meta">Laboratory procedure as reported in the literature · ' + D.basis + '</p>';
    var p1 = head + '<h2>Overview</h2>' + docParas(D.summary) + '<h2>Flowchart</h2>' + docFlow(D);
    var p2 = '<h2>Materials</h2>' + docList(D.materials) + (D.precursor && D.precursor.length ? '<h2>Starting material</h2>' + docList(D.precursor) : '') +
      '<h2>Procedure</h2><ol class="doc-proc">' + D.procedure.map(function (it) {
        return '<li><span class="doc-phase">' + (DOC_PHASE[it[3]] || 'Step') + '</span>' + it[0] + docCite(it) + '</li>'; }).join('') + '</ol>';
    var p3 = '<h2>Mechanism</h2>' + (D.mech ? docMech(D) : '') + D.equations.map(function (it) { return '<p class="doc-eq">' + it[0] + docCite(it) + '</p>'; }).join('') +
      docList(D.explanation) + '<h2>Surface terminations</h2>' + docList(D.terminations) + '<h2>Product</h2>' + docList(D.product);
    var p4 = (D.variants && D.variants.length ? '<h2>Other reported conditions</h2><table><thead><tr><th>Variant</th><th>Conditions</th></tr></thead><tbody>' +
      D.variants.map(function (v) { return '<tr><td>' + v[3] + '</td><td>' + v[0] + docCite(v) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      '<h2>Safety</h2><div class="doc-note">' + docList(D.safety) + '</div>' +
      '<h2>References</h2><ol class="doc-refs">' + Object.keys(MK_SRC).filter(function (k) { return refs[k]; }).map(function (k) {
        return '<li><b>' + esc(MK_SRC[k][0]) + '</b> ' + MK_SRC[k][1] + '. ' + srcLink(k) + '</li>'; }).join('') + '</ol>' +
      '<p class="doc-meta">Compiled for the BAŞARIM 2026 poster page from the papers above; every statement is cited to its page. Not a substitute for the original papers or for your institution’s safety rules.</p>';
    return [p1, p2, p3, p4];
  }

  // ---- MK_DOC: generated by team/LIBRARY_SYNTH_PROC/make_proc_js.py, do not edit by hand
  MK_DOC["hf"] = {"title": "HF etching of Ti<sub>3</sub>AlC<sub>2</sub> to Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>", "basis": "main protocol: Alhabeb et al., <i>Chem. Mater.</i> 2017 · reactions: Naguib et al., <i>Adv. Mater.</i> 2011 · other conditions: Naguib et al. 2011 and 2012, Mashtalir et al. 2013, Hope et al. 2016", "teaser": "A step-by-step protocol for HF etching, from Ti<sub>3</sub>AlC<sub>2</sub> powder to a free-standing film, following Alhabeb et al. 2017, with the reactions of Naguib et al. 2011, other reported conditions and the safety notes. Every line cites the page it comes from.", "summary": [["HF etching makes the MXene Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> by selectively removing the one-atom-thick Al layers from the layered Ti<sub>3</sub>AlC<sub>2</sub> MAX phase in hydrofluoric acid.", "V21", "p. 1 of 14"], ["It works because the metallic bonding between the M (Ti) and A (Al) layers is weaker than the ionic and/or covalent bonding between M and X (C) atoms, so it can be broken by a favourable chemical reaction in an etchant that dissolves the reaction products.", "V21", "p. 4 of 14"], ["Etching leaves a multilayered Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> powder whose 2D layers carry surface terminations and are held together by hydrogen and van der Waals bonds.", "A17", "p. 7634"], ["Unlike MXene made in LiF–HCl, HF-made MXene needs an extra intercalation step with organic molecules (such as DMSO or amines) before it can be delaminated.", "L16", "p. 2 of 9"]], "materials": [["Hydrofluoric acid (HF, 49.5 wt %), Acros Organics (main protocol).", "A17", "p. 7635"], ["Tetramethylammonium hydroxide (TMAOH), 25 wt % in water (main protocol intercalant).", "A17", "p. 7635"], ["Tetrabutylammonium hydroxide (TBAOH), 40 wt % in water, Sigma-Aldrich.", "A17", "p. 7636"], ["Deionized water purified with an Elix Essential 3 UV system (Millipore).", "A17", "p. 7636"], ["Teflon magnetic stirring bar for the etching step.", "A17", "p. 7636"], ["PVDF filter membrane, 0.22 µm pore size (Durapore, Millipore), for the filtration rinse.", "A17", "p. 7636"], ["20-mL glass vial for the TMAOH intercalation.", "A17", "p. 7639"], ["Vacuum-filtration set-up for films: a Büchner funnel with a porous polymer membrane (typically Celgard or PVDF) whose pores are small enough to retain the flakes.", "A17", "p. 7641"], ["Argon-sealed vials for storing the colloid.", "A17", "p. 7641"]], "precursor": [["No pressing is needed when powder is wanted, because a less dense MAX block is easier to mill.", "A17", "p. 7635"]], "procedure": [["Add 0.5 g of Ti<sub>3</sub>AlC<sub>2</sub> powder gradually (over 5 min) to 10 mL of HF etchant while stirring with a Teflon magnetic bar; slow addition keeps down the strong bubbling caused by the exothermic reaction.", "A17", "p. 7636", "etching"], ["Let the reaction run at room temperature (~23 °C): 5 h with 30 wt % HF, 18 h with 10 wt % HF, or 24 h with 5 wt % HF.", "A17", "p. 7636", "etching"], ["Wash the product with deionized water by centrifugation, 5 min per cycle at 3500 rpm (Alhabeb et al. 2017 used five cycles, equivalent to 1000 mL of water in total).", "A17", "p. 7636", "washing"], ["After each centrifuge cycle the Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> powder settles as a sediment under a water-like supernatant; decant the acidic supernatant into waste.", "A17", "p. 7636", "centrifugation"], ["Redisperse the sediment in another 150 mL of deionized water and centrifuge again; repeat until the supernatant pH is ~6 (five cycles were enough for 0.5 g of powder in a 175-mL graduated conical tube).", "A17", "p. 7636", "washing"], ["Rinse the sediment with 1000 mL of deionized water by vacuum-assisted filtration over a PVDF membrane (0.22 µm pore size, Durapore, Millipore), then collect the material.", "A17", "p. 7636", "washing"], ["Dry the multilayer powder in vacuum at 80 °C for 24 h (label it 30F-, 10F- or 5F-Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> after the HF concentration) and keep it under vacuum until further processing.", "A17", "p. 7636", "drying"], ["Mix 100 mg of the dried multilayer powder with 10 mL of deionized water containing 100 mg of TMAOH in a 20-mL glass vial and stir for 12 h at room temperature.", "A17", "p. 7639", "intercalation"], ["Wash the basic mixture (~pH 10) twice by centrifugation (3500 rpm, 5 min per cycle) in 50-mL tubes to bring the pH to ~7.", "A17", "p. 7639", "washing"], ["Centrifuge for 1 h at 3500 rpm and collect the stable MXene colloidal solution; the sediment can be collected by vacuum-assisted filtration and dried in vacuum at 120 °C.", "A17", "p. 7639", "centrifugation"], ["Store the colloid in argon-sealed vials in a refrigerator: removing dissolved oxygen, lowering the temperature and excluding UV light all suppress oxidation.", "A17", "p. 7641", "colloid"], ["Make a free-standing film by vacuum-filtering the colloid in a Büchner funnel through a porous polymer membrane (e.g., Celgard or PVDF) with pores small enough to stop the flakes.", "A17", "p. 7641", "film"], ["Keep the filtered film under vacuum; it can be redispersed later by shaking or sonication, but drying it at elevated temperature can bond the layers strongly and make redispersion difficult.", "A17", "p. 7642", "film"]], "variants": [["About 10 g of Ti<sub>3</sub>AlC<sub>2</sub> powder was immersed in ~100 mL of 50% HF at room temperature for 2 h, then washed several times with deionized water and centrifuged to separate the powder.", "N11", "p. 4252", "First report: 50% HF, 2 h (Naguib et al. 2011)"], ["In the first report the HF-treated product was ultrasonicated in methanol for 300 s, which strongly weakened the XRD peaks.", "N11", "p. 4249", "First report: methanol sonication (Naguib et al. 2011)"], ["In some cases, the treated powders were cold-pressed in a steel die at a stress of 1 GPa to align the flakes and make free-standing discs.", "N11", "p. 4252", "First report: cold-pressed discs instead of a film (Naguib et al. 2011)"], ["Non-sieved Ti<sub>3</sub>AlC<sub>2</sub> powder was treated with 50% aqueous HF at room temperature for 22 h, washed five times with deionized water and centrifuged until the liquid reached pH ~4.", "M13", "SI p. S13, Supplementary Methods, Synthesis of MXene", "50% HF, 22 h, wash to pH ~4 (Mashtalir et al. 2013, DMSO study)"], ["Ti<sub>3</sub>AlC<sub>2</sub> was added slowly to concentrated HF (48–51 wt%, Acros), 10 mL per 1 g, stirred at ~25 °C for 18 h, washed by centrifugation/decantation and given a final ethanol wash before drying.", "Ho16", "ESI p. 4, 6. Synthesis", "48–51 wt% HF, 18 h, ethanol final wash (Hope et al. 2016)"], ["Most published protocols use 10 or 50 wt % HF, although lower concentrations are enough to remove Al from Ti<sub>3</sub>AlC<sub>2</sub>.", "A17", "p. 7636", "Literature HF concentrations (Alhabeb et al. 2017)"], ["Ti<sub>2</sub>AlC, Ta<sub>4</sub>AlC<sub>3</sub>, (Ti<sub>0.5</sub>,Nb<sub>0.5</sub>)2AlC, (V<sub>0.5</sub>,Cr<sub>0.5</sub>)3AlC2 and Ti<sub>3</sub>AlCN were converted by immersing the powders at room temperature in HF of varying concentration for 10 to 72 h, followed by sonication.", "N12", "p. 1322", "Other MAX phases: general conditions (Naguib et al. 2012)"], ["Al was etched out of Ti<sub>2</sub>AlC with 10% HF for 10 h.", "N12", "p. 1324", "Ti<sub>2</sub>AlC: 10% HF, 10 h (Naguib et al. 2012)"], ["Ti<sub>2</sub>AlC powder placed in 50% HF for 2 h dissolved completely. (Alternatively, add Naguib et al. 2012's 'main challenge ... acid strength and immersion times' sentence to the quote and keep the inference.)", "N12", "p. 1324", "Ti<sub>2</sub>AlC in 50% HF dissolves (Naguib et al. 2012)"], ["Ta<sub>4</sub>AlC<sub>3</sub> was etched with 50% HF for 72 h.", "N12", "p. 1325", "Ta<sub>4</sub>AlC<sub>3</sub>: 50% HF, 72 h (Naguib et al. 2012)"], ["TiNbAlC was etched with 50% HF for 28 h.", "N12", "p. 1325", "TiNbAlC: 50% HF, 28 h (Naguib et al. 2012)"], ["(V<sub>0.5</sub>,Cr<sub>0.5</sub>)3AlC2 was still not fully reacted after 65 h in 50% HF.", "N12", "p. 1324", "(V<sub>0.5</sub>,Cr<sub>0.5</sub>)3AlC2: incomplete in 50% HF (Naguib et al. 2012)"]], "equations": [["Ti<sub>3</sub>AlC<sub>2</sub> + 3 HF → AlF<sub>3</sub> + 3/2 H<sub>2</sub> + Ti<sub>3</sub>C<sub>2</sub>", "N11", "p. 4249, Reaction, 1"], ["Ti<sub>3</sub>C<sub>2</sub> + 2 H<sub>2</sub>O → Ti<sub>3</sub>C<sub>2</sub>(OH)<sub>2</sub> + H<sub>2</sub>", "N11", "p. 4249, Reaction, 2"], ["Ti<sub>3</sub>C<sub>2</sub> + 2 HF → Ti<sub>3</sub>C<sub>2</sub>F<sub>2</sub> + H<sub>2</sub>", "N11", "p. 4249, Reaction, 3"], ["M<sub>n+1</sub>AlX<sub>n</sub> + 3 HF → AlF<sub>3</sub> + M<sub>n+1</sub>X<sub>n</sub> + 1.5 H<sub>2</sub> (general form for Al-containing MAX phases)", "N12", "p. 1323, Eq., 2"], ["Ti<sub>2</sub>AlC + 3 HF → Ti<sub>2</sub>C + AlF<sub>3</sub> + 3/2 H<sub>2</sub>", "N12", "p. 1325, Eq., 5"], ["Ta<sub>4</sub>AlC<sub>3</sub> + 3 HF → Ta<sub>4</sub>C<sub>3</sub> + AlF<sub>3</sub> + 1.5 H<sub>2</sub>", "N12", "p. 1327, Eq., 6"]], "explanation": [["In a MAX phase the M<sub>n+1</sub>X<sub>n</sub> (here Ti<sub>3</sub>C<sub>2</sub>) layers are chemically stable, whereas the A-group (Al) atoms are relatively weakly bound and are therefore the most reactive species.", "N11", "p. 4248"], ["The metallic M–A bonding is weaker than the ionic/covalent M–X bonding, so it can be broken by a favourable reaction in an etchant that can dissolve the reaction products.", "V21", "p. 4 of 14"], ["Chemical etching is needed because the A–M bonds are still strong enough to make mechanical exfoliation hardly possible.", "A17", "p. 7633"], ["Reaction (1) removes the Al atoms from between the layers, so the Ti<sub>3</sub>C<sub>2</sub> layers separate because the metallic bonding that held them together is lost.", "N11", "p. 4249"], ["Gas bubbles, presumably H<sub>2</sub>, form as soon as Ti<sub>3</sub>AlC<sub>2</sub> enters the HF solution, a sign of the reaction.", "N11", "p. 4249"], ["Reactions (2) and (3) are simplifications: they assume pure –OH or pure –F terminations, whereas the real terminations are most probably a combination of both.", "N11", "p. 4249"], ["The freshly exposed Ti surfaces do not stay bare: aqueous etching leaves them terminated with functional groups (T), hence the name Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>.", "Ho16", "p. 5099"], ["Calculations show that if Al were simply removed without adding surface groups, the structure would contract by 19%, which is not observed.", "N11", "p. 4249"]], "terminations": [["HF and HF-forming etchants add surface groups such as –O, –F and –OH, written as Tx in M<sub>n+1</sub>X<sub>n</sub>Tx.", "A17", "p. 7633"], ["The chemistry of HF-etched Ti<sub>3</sub>C<sub>2</sub> is much closer to Ti<sub>3</sub>C<sub>2</sub>(OH)xOyFz than to the idealized structure of a pure Ti<sub>3</sub>C<sub>2</sub> carbide layer.", "M13", "p. 2"], ["EDAX always found F in the HF-treated product, so the terminations are most likely a mixture of F and OH.", "N11", "p. 4251"], ["NMR shows that –F and –OH terminations are intimately mixed, that –OH is much less common than –F and –O, and that the proportions depend strongly on the synthesis method.", "Ho16", "p. 5099"], ["HF-made Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> carries almost four times as much –F as LiF–HCl-made material.", "Ho16", "p. 5102"]], "product": [["Etched Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> powders are dark grey to black, unlike the graphitic-grey Ti<sub>3</sub>AlC<sub>2</sub>.", "A17", "p. 7636"], ["30 wt % HF gives an accordion-like morphology even after only 5 h of etching.", "A17", "p. 7636"], ["With 5 wt % HF no accordion morphology forms; the Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> particles are barely distinguishable from the MAX powder.", "A17", "p. 7636"], ["An accordion shape is not the only proof of etching; XRD and EDX should both be used to confirm Al removal.", "A17", "p. 7637"], ["After etching, the (002) XRD peak moves from 9.5° (Ti<sub>3</sub>AlC<sub>2</sub>) to 9.0° (Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>) and no Ti<sub>3</sub>AlC<sub>2</sub> peaks remain for 5F-, 10F- and 30F-Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>.", "A17", "p. 7636"], ["Vacuum drying at 80 °C removed the intercalated water; wet or partly dried powders show larger (00l) shifts because of trapped water.", "A17", "p. 7637"], ["In the first report the crystallite size along [000l] after HF treatment was 11 ± 3 nm, about ten Ti<sub>3</sub>C<sub>2</sub>(OH)<sub>2</sub> layers.", "N11", "p. 4249"]], "safety": [["Whatever its concentration, handling HF requires a risk assessment and the required safety protocols.", "A17", "p. 7636"]], "flow": [["HF etching", "0.5 g in 10 mL HF; 30/10/5 wt %, 5/18/24 h, RT"], ["Centrifuge washing to pH ~6", "3500 rpm, 5 min cycles, 150 mL water each"], ["Filter rinse, vacuum drying", "1000 mL water over 0.22 µm PVDF; 80 °C, 24 h"], ["TMAOH intercalation", "100 mg MXene, 100 mg TMAOH, 10 mL water, 12 h"], ["Wash to pH ~7", "two centrifuge cycles, 3500 rpm, 5 min, 50-mL tubes"], ["Centrifuge, collect colloid", "1 h at 3500 rpm; colloid ~0.5 mg/mL"], ["Store colloid cold under Ar", "argon-sealed vials in refrigerator to slow oxidation"], ["Vacuum-filter free-standing film", "Celgard or PVDF membrane; store film under vacuum"]], "mech": {"a": "Al", "from": "Ti₃AlC₂", "agent": "HF (aqueous)", "out": "AlF₃ + 3/2 H₂", "tx": ["F", "O", "F", "O"], "to": "Ti₃C₂Tₓ", "alt": "Ti3AlC2 layers with Al between them react with HF to give Ti3C2Tx layers with surface terminations, AlF3 and hydrogen gas.", "cap": "Reaction (1) of Naguib et al. 2011 (p. 4249): HF removes the Al layers as AlF<sub>3</sub> and hydrogen is released; reactions (2) and (3) then give –OH- and –F-terminated surfaces. XPS also shows –O terminations (Hope et al. 2016)."}};
  MK_BY["hf"].plain = ["Ti<sub>3</sub>AlC<sub>2</sub> is a layered crystal: Ti<sub>3</sub>C<sub>2</sub> layers stacked with single layers of Al atoms in between. {N11} The bonds between the Al and Ti layers are too strong to peel the layers apart mechanically, so the Al has to be removed chemically. {A17}", "HF attacks the Al: Ti<sub>3</sub>AlC<sub>2</sub> + 3 HF gives AlF<sub>3</sub>, hydrogen gas (3/2 H<sub>2</sub>) and Ti<sub>3</sub>C<sub>2</sub>. {N11} The Al is attacked preferentially because the Al atoms are relatively weakly bound and are the most reactive species, whereas the Ti<sub>3</sub>C<sub>2</sub> layers are chemically stable. {N11} Gas bubbles (presumably hydrogen) appear as soon as the powder meets the acid. {N11}", "Washing removes leftover acid and reaction products (salts) until the pH is safe (~6). {A17} Each wash means centrifuging so the MXene settles, pouring off the acidic liquid on top, and adding fresh water. {A17}", "With the Al gone, the Ti<sub>3</sub>C<sub>2</sub> layers are held together only by much weaker hydrogen or van der Waals bonds. {N11} The exposed Ti surfaces do not stay bare: they become covered with –O, –OH and –F groups, written Tx. {Ho16} HF-etched particles usually open into an 'accordion' shape because hydrogen gas is released during the reaction. {V21}", "Because the layers are now held by weak secondary (hydrogen and van der Waals) bonds, molecules can slip in between them, unlike in the pristine MAX phase. {N21} HF-made MXene needs this extra intercalation step (for example DMSO or amines) before it can be delaminated. {L16} In the main protocol, TMA+ ions from TMAOH entered 5F-Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> (5 wt % HF) and shifted the (002) peak from 9.0° to 6.0°, a d-spacing change from 9.7 Å to 14.7 Å. {A17}", "The wider spacing weakens the attraction between neighbouring layers, so they can come apart as single 2D sheets. {A17} With TMAOH, stirring delaminates the HF-made Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> but can also break the flakes into smaller pieces. {A17} With DMSO, the intercalated stacks are split into separate sheets by sonication in water. {M13}", "Centrifugation separates the delaminated flakes from the material that stayed multilayered. {A17} Centrifuging removes the large particles, and the delaminated flakes left in the liquid form a stable colloid. {M13} In the main protocol, the stable colloid is collected after 1 h of centrifugation at 3500 rpm. {A17}", "The colloid contains separate MXene sheets that are stabilized by electric charge and so do not clump together. {A17} The negatively charged (anionic) surface groups give a zeta potential below −30 mV, which keeps the flakes dispersed. {V21} In water with dissolved oxygen the flakes degrade, especially when warm or in sunlight. {A17}", "Vacuum-filtering the colloid through a porous membrane turns the nanosheets into a free-standing film. {A17} XRD of a filtered 'paper' showed order only along the stacking direction [000l], evidence of full delamination. {M13} Films filtered from TMAOH-delaminated flakes conduct electricity (~200 S/cm), though much less than MILD films (~8000 S/cm). {A17}"];
  MK_BY["hf"].scene.caps = {"0": [[0, "MAX phase Ti₃AlC₂: Ti₃C₂ layers stacked with single layers of Al atoms in between"]], "1": [[0, "HF moves in and attacks the Al layers"], [0.3, "The Al leaves as AlF₃; hydrogen gas bubbles off"], [0.68, "The bare Ti surfaces bind –F, –OH and –O"]], "2": [[0, "Water washes out the leftover acid and the reaction products"], [0.6, "Centrifuge, pour off, add fresh water: repeated until pH ~6"]], "3": [[0, "Without the Al, the sheets are held only by weak hydrogen or van der Waals bonds"], [0.5, "Hydrogen gas released during etching usually opens the stack like an accordion"]], "4": [[0, "Guest molecules (here DMSO) slip in between the weakly bound sheets"], [0.55, "The gap widens: c grows from 19.5 to 35.0 Å"]], "5": [[0, "In water, ultrasound splits the widened stacks into separate sheets"]], "6": [[0, "The centrifuge spins the suspension"], [0.45, "Large, undelaminated particles sink; the flakes stay in the liquid"]], "7": [[0, "Negatively charged surfaces keep the flakes apart: a stable colloid"], [0.4, "A laser beam through it is visible: the Tyndall effect"]], "8": [[0, "Vacuum pulls the liquid through a porous membrane; the flakes stack up"], [0.6, "The stacked flakes form a free-standing film"]]};
  MK_DOC["lif-hcl"] = {"title": "In situ HF etching with LiF + HCl (MILD and clay routes)", "basis": "main protocol: Alhabeb et al., <i>Chem. Mater.</i> 2017 (MILD) · clay route: Ghidiu et al., <i>Nature</i> 2014 · Lipatov et al. 2016, Sang et al. 2016", "teaser": "A step-by-step protocol for the MILD route of Alhabeb et al. 2017, from Ti<sub>3</sub>AlC<sub>2</sub> powder to a free-standing film, with the original clay route of Ghidiu et al. 2014 (its MXene synthesis Methods), how HF and Li<sup>+</sup> act, other reported conditions and the safety notes. Every line cites the page it comes from.", "summary": [["In this route Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> MXene is made by adding lithium fluoride (LiF) salt to hydrochloric acid (HCl), so that the etchant, hydrofluoric acid (HF), forms in situ; this considerably simplified MXene synthesis.", "A17", "p. 2, 7634"], ["Mixing the acid with the fluoride salt produces both HF (the etchant) and an intercalant, Li<sup>+</sup> ions, so etching and intercalation/delamination happen at the same time.", "V21", "p. 6, 5 of 14"], ["The original 2014 LiF/HCl recipe gives a Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> that behaves like clay and is therefore called the clay method.", "A17", "p. 2, 7634, Figure 1 caption"], ["The MILD method (minimally intensive layer delamination), introduced in 2016, separates the multilayers into single flakes by manual shaking alone, without sonication, which gives larger and less defective flakes.", "A17", "p. 2, 7634"]], "materials": [["Ti<sub>3</sub>AlC<sub>2</sub> MAX phase powder is the precursor of Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>.", "A17", "p. 3, 7635"], ["Lithium fluoride (LiF) powder, 98.5% grade, and hydrochloric acid (HCl), 37 wt %, both from Alfa Aesar, used as received.", "A17", "p. 4, 7636"], ["Deionized (DI) water (Alhabeb et al. 2017 purified it with an Elix Essential 3 UV system, Millipore).", "A17", "p. 4, 7636"], ["Etchant for the optimised MILD protocol: 0.8 g LiF in 10 mL of 9 M HCl.", "A17", "p. 6, 7638"], ["Magnetic stirring with a Teflon stir bar (used in the original clay recipe to dissolve the LiF).", "G14", "p. 5, Methods"], ["Plastic reaction vessel: Sang et al. prepared the etchant in a 100 mL polypropylene plastic vial.", "S16", "p. 6, 9198, Methods"], ["Centrifuge and tubes: Alhabeb et al. 2017 washed in 175-mL graduated conical tubes or 50-mL centrifuge tubes.", "A17", "p. 6, 7638"], ["Vacuum-assisted filtration set-up: a Büchner funnel with a porous polymer membrane such as Celgard or PVDF.", "A17", "p. 9, 7641"]], "precursor": [["Check the precursor by XRD: Ti<sub>2</sub>AlC is a common impurity, recognisable because its first (002) peak is at about 13° instead of about 9.5° for Ti<sub>3</sub>AlC<sub>2</sub>.", "A17", "p. 3, 7635"]], "procedure": [["Prepare the etchant: add 0.8 g of LiF to 10 mL of 9 M HCl and leave it under continuous stirring for 5 min.", "A17", "p. 6, 7638", "etching"], ["Keep LiF as the limiting reagent when it is added to the HCl: no excess of LiF may be present (not vice versa).", "A17", "p. 8, 7640", "etching"], ["Gradually add 0.5 g of Ti<sub>3</sub>AlC<sub>2</sub> powder to the etchant over the course of about 5 min.", "A17", "p. 6, 7638", "etching"], ["Let the reaction run for 24 h at room temperature.", "A17", "p. 6, 7638", "etching"], ["Wash the acidic mixture with DI water by centrifugation (3500 rpm, 5 min per cycle): after each cycle decant the acidic supernatant as waste, add fresh DI water and centrifuge again.", "A17", "p. 6, 7638", "washing"], ["Repeat the washing cycles until the supernatant reaches pH 4–5: about two cycles in a 175-mL centrifuge tube or seven cycles in a 50-mL tube.", "A17", "p. 6, 7638", "washing"], ["Keep washing and watch for the onset of delamination: once the pH is ≥ 5, a dark-green supernatant appears that stays stable even when centrifugation is extended from 5 min to 1 h; delamination has started during washing, with no extra processing.", "A17", "p. 6, 7638", "delamination"], ["Check the sediment: it should have swollen to almost twice its earlier volume, with a black Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> slurry layer on top of a grayish layer of non-etched Ti<sub>3</sub>AlC<sub>2</sub>/Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>.", "A17", "p. 6, 7638", "intercalation"], ["First harvest: after the third centrifuge wash, centrifuged for 1 h in a 175-mL tube, collect the stable dark-green supernatant directly as a colloidal solution of about 1 mg/mL.", "A17", "p. 8, 7640", "colloid"], ["Add 50 mL of DI water to the whole remaining sediment (black Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> slurry plus non-etched Ti<sub>3</sub>AlC<sub>2</sub>) and shake by hand until all of it is redispersed; no sonication is used.", "A17", "p. 8, 7640", "delamination"], ["Centrifuge at 3500 rpm for 2 min to settle the non-etched Ti<sub>3</sub>AlC<sub>2</sub> (gray sediment) and collect the dark, concentrated supernatant of Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> flakes.", "A17", "p. 8, 7640", "centrifugation"], ["Centrifuge the collected supernatant for 1 h at 3500 rpm: a black clay sediment forms, and the stable dark supernatant, mainly single-layer Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> flakes at about 1–2 mg/mL, is the delaminated colloid.", "A17", "p. 8, 7640", "centrifugation"], ["Store the colloid refrigerated in vials sealed under argon; in this condition degradation was minimal over 24 days.", "A17", "p. 9, 7641", "colloid"], ["Make a free-standing film by vacuum-assisted filtration of the colloid through a porous polymer membrane (e.g., Celgard or PVDF) on a Büchner funnel; the pores must be small enough to retain the flakes.", "A17", "p. 9, 7641", "film"], ["Dry the filtered film ('MXene paper') in vacuum.", "L16", "p. 2, 2 of 9", "drying"], ["Note that drying the film at elevated temperature can bond the layers strongly and make it difficult to redisperse the film later.", "A17", "p. 10, 7642", "drying"]], "variants": [["Add concentrated HCl (Fisher, technical grade) to distilled water to make 30 mL of 6 M HCl; add 1.98 g LiF (5 molar equivalents; Alfa Aesar, 98+%) and stir for 5 min with a magnetic Teflon stir bar to dissolve the salt.", "G14", "p. 5, Methods", "Clay route (Ghidiu 2014) – etchant"], ["Add 3 g Ti<sub>3</sub>AlC<sub>2</sub> carefully over 10 min so that the exothermic reaction does not overheat the solution, then hold the mixture at 40 °C for 45 h.", "G14", "p. 5, Methods", "Clay route (Ghidiu 2014) – etching"], ["Wash through about 5 cycles of distilled-water addition, centrifugation (3,500 rpm × 5 min per cycle) and decanting until the supernatant reaches pH ≈ 6; filter the product, with a little water, on cellulose nitrate (0.22 μm pores). The filtered material is clay-like and can be rolled directly into films.", "G14", "p. 5, Methods", "Clay route (Ghidiu 2014) – washing and clay"], ["Disperse the flakes in distilled water (2 g MXene per 0.5 L), deaerate with argon and sonicate for 1 h; centrifuge for 1 h at 3,500 rpm and collect the dark-green supernatant.", "G14", "p. 5, Methods", "Clay route (Ghidiu 2014) – delamination by sonication"], ["Filter this dispersion through a Celgard 3501 coated polypropylene membrane to obtain flexible, free-standing Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> paper; about 45 wt% of the MXene had been delaminated into stable suspension.", "G14", "p. 5, Methods", "Clay route (Ghidiu 2014) – 'paper' by filtration"], ["Hydrate dried, crushed Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> powder to a thick paste (roughly two parts powder to one part water); the plastic 'clay' is rolled in a roller mill between water-permeable Celgard sheets into a free-standing film that lifts off the membrane on drying.", "G14", "p. 5, Methods", "Clay route (Ghidiu 2014) – rolled clay films"], ["With rolling, film size is not limited by the size of a filtration apparatus; films of any dimensions can readily be made.", "G14", "p. 1, 78", "Clay route (Ghidiu 2014) – rolling speed and film size"], ["Etching at 35 °C for 24 h instead of 40 °C for 45 h left persistent MAX-phase XRD peaks and more Al, but reliably gave high yields of delaminated flakes on sonication; higher etching temperatures lowered the Al content but the product did not always delaminate readily.", "G14", "p. 5, Methods", "Clay route (Ghidiu 2014) – 35 °C/24 h vs 40 °C/45 h"], ["The method also worked, to varying degrees, with other fluoride salts in HCl (NaF, KF, CsF, tetrabutylammonium fluoride, CaF2), and MXenes were still obtained with H<sub>2</sub>SO<sub>4</sub> instead of HCl.", "G14", "p. 4, 81", "Clay route (Ghidiu 2014) – other salts and acids"], ["Dissolve 0.67 g LiF in 10 mL of 6 M HCl and mix for a few minutes at room temperature; add 1 g Ti<sub>3</sub>AlC<sub>2</sub> slowly over 5 min (exothermic); then react at 35 °C under continuous stirring (550 rpm) for 24 h.", "L16", "p. 8, 8 of 9, Experimental Section", "Lipatov 2016 Route 1 (original clay procedure) – etching"], ["Wash with DI water until almost neutral (pH ≥ 6); collect by vacuum filtration on a PVDF membrane (0.45 μm, Millipore) and dry in a vacuum desiccator at room temperature for 24 h. To delaminate 0.2 g, bath-sonicate in 50 mL DI water for 1 h under argon bubbling, centrifuge at 3500 rpm for 1 h and collect the supernatant.", "L16", "p. 8, 8 of 9, Experimental Section", "Lipatov 2016 Route 1 – washing, collection, sonication"], ["Route 1: 1 g Ti<sub>3</sub>AlC<sub>2</sub>, 0.67 g LiF, 10 mL 6 M HCl; molar ratio Ti<sub>3</sub>AlC<sub>2</sub>:LiF:HCl = 1.0:5.0:11.7; 24 h; centrifugation 3500 rpm/1 h; sonication 1 h.", "L16", "p. 2, 2 of 9, Table 1", "Lipatov 2016 Route 1 – Table 1 row"]], "equations": [["–OH + –OH → –O + H<sub>2</sub>O", "Ho16", "p. 3, 5101"]], "explanation": [["Etching is necessary because the bonds between the A (Al) and M (Ti) atoms in the MAX phase are strong, so the layers cannot be peeled apart mechanically.", "A17", "p. 1, 7633"], ["The metallic M–A bonding is weaker than the M–X bonding, so a suitable chemical reaction in an etchant that dissolves the reaction products can break it selectively.", "V21", "p. 5, 4 of 14"], ["The LiF/HCl etchant is still an HF etchant: in situ HF formation from fluoride salts such as LiF gives etchants containing about 3–5 wt % HF.", "A17", "p. 5, 7637"], ["As the Al is etched out, the exposed MX layers are spontaneously terminated by surface groups, which lowers their chemical potential and stabilises them.", "V21", "p. 6, 5 of 14"], ["In Lipatov's Route 2 the LiF:MAX molar ratio was raised to 7.5:1 to supply excess Li<sup>+</sup> for intercalation, and the HCl:LiF ratio was doubled to help etch the aluminium.", "L16", "p. 2, 2 of 9"], ["The excess HCl left in the etchant supplies protons (H<sup>+</sup>) that exchange with Li<sup>+</sup>, giving swollen clay-like Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> that can be delaminated by manual shaking; more delaminated MXene was obtained with 9 M than with 6 M HCl.", "A17", "p. 8, 7640"], ["With lithium-containing etchants (clay and MILD), delamination is driven by the intercalation of solvated (water-surrounded) Li<sup>+</sup> ions.", "A17", "p. 8, 7640"], ["The sediment swelling during washing was not seen in the earlier clay synthesis (LiF:Ti<sub>3</sub>AlC<sub>2</sub> = 5, written '5 M of LiF:Ti<sub>3</sub>AlC<sub>2</sub>') with either 6 M or 12 M HCl; Alhabeb et al. 2017 concludes that a minimum Li<sup>+</sup> concentration, besides a certain HCl concentration, is required when etching at room temperature for ≤ 24 h.", "A17", "p. 6, 7638"]], "terminations": [["HF-containing or HF-forming etchants add surface groups such as –O, –F and –OH, written collectively as Tx.", "A17", "p. 1, 7633"], ["In Ghidiu's clay, EDS found F and O and XPS showed Ti–F and Ti–O bonding, pointing to O<sup>−</sup> and F-containing terminations.", "G14", "p. 1, 78"], ["The HF-made sample has almost four times as much –F termination and more –OH, hence fewer –O terminations, than the LiF–HCl sample.", "Ho16", "p. 4, 5102"], ["–OH is only a minor termination; –F and –O dominate.", "Ho16", "p. 4, 5102"], ["The terminations are intimately mixed within the layers rather than forming regions of a single type.", "Ho16", "p. 3, 5101"]], "product": [["The washed sediment is a clay-like paste that can be rolled while wet between water-permeable membranes in a roller mill into flexible, free-standing films within minutes.", "G14", "p. 1, 78"], ["Air-dried clay has a c lattice parameter of 27–28 Å (about 20 Å for HF-made Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>); still-hydrated sediment reaches about 40 Å.", "G14", "p. 1, 78"], ["The etching yield of MXene was around 100%, comparable to HF etching.", "G14", "p. 1, 78"], ["In the clay route, 30–60 min of sonication gave stable suspensions of up to 2 g per litre, and about 45% by mass of the multilayer became dispersed flakes.", "G14", "p. 2, 79"], ["Of 321 clay-route flakes analysed by TEM, over 70% were 0.5–1.5 μm across; single layers about 10 Å thick were imaged.", "G14", "p. 2, 79"], ["Lipatov's Route 1 flakes were mostly 200–500 nm, whereas Route 2 flakes were 4–15 μm.", "L16", "p. 2, 2 of 9"], ["Individual Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> flakes measured by Lipatov showed a conductivity of 4600 ± 1100 S/cm.", "L16", "p. 1, 1 of 9, abstract"], ["MILD flakes have distinctive straight edges that mimic the shape of the original Ti<sub>3</sub>AlC<sub>2</sub> grains.", "A17", "p. 8, 7640"]], "safety": [["Treat the LiF + HCl mixture like HF: the same safety protocols apply.", "N21", "p. 2, 2 of 10"], ["The in situ etchant contains about 3–5 wt % HF.", "A17", "p. 5, 7637"], ["HF is very corrosive and poses severe health risks.", "V21", "p. 6, 5 of 14"]], "flow": [["Prepare LiF/HCl etchant", "0.8 g LiF into 10 mL 9 M HCl, stir 5 min"], ["Add Ti<sub>3</sub>AlC<sub>2</sub> slowly", "0.5 g over ~5 min; reaction is exothermic"], ["Etch at room temperature", "24 h; in situ HF removes Al, Li<sup>+</sup> enters"], ["Swelling and self-delamination", "pH ≥ 5: dark-green supernatant, sediment swells ~2×"], ["Redisperse by hand shaking", "50 mL DI water, manual shaking, no sonication"], ["Remove unetched MAX", "3500 rpm, 2 min; keep dark supernatant"], ["Collect single-flake colloid", "3500 rpm, 1 h; supernatant ~1–2 mg/mL"], ["Vacuum-filter free-standing film", "Celgard or PVDF membrane on Büchner funnel"], ["Dry the film", "dry in vacuum; avoid high T if redispersing"]], "mech": {"a": "Al", "from": "Ti₃AlC₂", "agent": "LiF + HCl (HF forms in situ)", "out": "LiCl; Li⁺ and water enter", "tx": ["O", "F", "O", "O"], "to": "Ti₃C₂Tₓ", "alt": "Ti3AlC2 layers with Al between them are etched by HF formed from LiF and HCl; Li+ ions and water enter between the Ti3C2Tx layers.", "cap": "LiF and HCl give HF, the etchant, and Li<sup>+</sup>, the intercalant, so etching and intercalation can be done simultaneously (VahidMohammadi et al. 2021, p. 5 of 14); LiCl is a by-product that must be washed out (Alhabeb et al. 2017). None of the sources used here prints a balanced equation for this route."}};
  MK_BY["lif-hcl"].plain = ["The starting powder, Ti<sub>3</sub>AlC<sub>2</sub>, is a MAX phase: stacked Ti<sub>3</sub>C<sub>2</sub> layers (three titanium sublayers with carbon in between) connected by layers of more reactive aluminium atoms. {S16} The Ti–Al bonds are too strong to peel the layers apart mechanically, so the aluminium has to be removed chemically. {A17} Etching works because the metallic Ti–Al bonding is weaker than the Ti–C bonding, so a reaction can break it selectively and the etchant dissolves what is removed. {V21}", "LiF dissolved in HCl forms hydrofluoric acid in the solution itself, together with Li<sup>+</sup> ions that act as the intercalant. {V21} As the aluminium layers are etched away, the exposed Ti<sub>3</sub>C<sub>2</sub> layers spontaneously pick up surface groups (Tx), which makes them more stable. {V21} The reaction releases heat, so the powder is added slowly to keep the solution from overheating. {G14}", "Washing removes leftover acid and reaction products (salts) and brings the pH up to a safe value of about 6. {A17} It is done by repeated centrifugation: the MXene settles, the acidic liquid on top is poured off, and fresh water is added. {A17} The reaction makes lithium chloride (LiCl), which has to be washed out completely with plenty of water. {A17}", "What remains is multilayer Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>: the aluminium is gone and the sheets are held together only by hydrogen and van der Waals bonds. {A17} Unlike HF-made MXene, the particles do not open up into an 'accordion'; they stay tightly stacked, presumably because water and/or cations sit between the sheets. {G14} The layers are farther apart than in HF-made MXene: the repeat distance (c lattice parameter) is 27–28 Å instead of about 20 Å. {G14}", "With LiF/HCl, delamination is driven by the intercalation of solvated (water-surrounded) Li<sup>+</sup> ions from the etchant. {A17} The extra HCl supplies protons (H<sup>+</sup>) that exchange with Li<sup>+</sup>, leaving a swollen, clay-like multilayer. {A17} During washing, water also enters between the sheets and the sediment visibly swells. {A17}", "Once enough acid is washed out (pH ≥ 5), a stable dark-green supernatant appears: delamination has already started during washing, with no extra step. {A17} Gentle hand shaking in water is enough to free single flakes; ultrasound is not needed, so the flakes are not shredded. {L16} This needs a minimum Li<sup>+</sup> concentration, besides a certain HCl concentration, when etching at room temperature for 24 h or less. {A17}", "Centrifugation separates the free single flakes from material that is still multilayer. {A17} A short spin (3500 rpm, 2 min) settles the unetched gray Ti<sub>3</sub>AlC<sub>2</sub>, and the dark liquid full of flakes is kept. {A17} A long spin (1 h at 3500 rpm) settles the rest as a black clay; the liquid on top holds mainly single-layer flakes. {A17}", "The flakes carry negatively charged (anionic) surface groups, which give a zeta potential below −30 mV, so they form a stable colloid. {V21} MILD colloids often contain large flakes, more than 2 μm across. {A17} Oxygen dissolved in the water degrades the flakes, especially when warm or in sunlight, which makes storing them in water a challenge. {A17}", "Vacuum-filtering the colloid through a membrane turns the nanosheets into a free-standing film. {A17} Films made of large MILD flakes conduct electricity very well, about 8000 S/cm. {A17} In the clay route the wet multilayer can also be rolled into a film; the water between the sheets is proposed to act as a lubricant that lets them slide. {G14}"];
  MK_BY["lif-hcl"].scene.caps = {"0": [[0, "MAX phase Ti₃AlC₂: Ti₃C₂ layers connected by layers of more reactive Al atoms"]], "1": [[0, "LiF and HCl form HF in the solution itself"], [0.3, "HF removes the Al; Li⁺ ions and water move in between the layers"], [0.68, "The bare Ti surfaces bind –O, –F and –OH"]], "2": [[0, "Water washes out the acid and the LiCl by-product"], [0.6, "Washing by centrifugation until pH 4–5"]], "3": [[0, "Multilayer Ti₃C₂Tₓ: no accordion, the sheets stay stacked, clay-like"], [0.5, "Water and probably Li⁺ between the sheets: in the clay route c is 27–28 Å, not about 20 Å as after HF"]], "4": [[0, "No separate step: Li⁺ and water already sit between the layers"]], "5": [[0, "Gentle hand shaking in water frees single flakes"], [0.5, "No ultrasound, so the flakes are not shredded"]], "6": [[0, "A short spin settles the unetched Ti₃AlC₂"], [0.5, "A 1-h spin leaves mainly single-layer flakes in the dark liquid"]], "7": [[0, "Negatively charged flakes stay dispersed: a colloid of about 1–2 mg/mL"], [0.5, "MILD colloids often contain flakes larger than 2 µm"]], "8": [[0, "Vacuum filtration stacks the flakes into a free-standing film"], [0.6, "Films of large MILD flakes conduct well, about 8000 S/cm"]]};
  MK_DOC["nh4hf2"] = {"title": "Bifluoride (NH<sub>4</sub>HF<sub>2</sub>) etching of sputtered Ti<sub>3</sub>AlC<sub>2</sub> films", "basis": "thin-film protocol: Halim et al., <i>Chem. Mater.</i> 2014 · powder variant: Alhabeb et al., <i>Chem. Mater.</i> 2017", "teaser": "A step-by-step protocol for etching epitaxial Ti<sub>3</sub>AlC<sub>2</sub> thin films in NH<sub>4</sub>HF<sub>2</sub> (Halim et al. 2014), from the sputtered film to a transparent, conductive Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> film, with the reactions, how NH<sub>4</sub><sup>+</sup> and NH<sub>3</sub> enter the layers, and the powder variant of Alhabeb et al. 2017. Every line cites the page it comes from.", "summary": [["Halim et al. (2014) made about 1 × 1 cm2 Ti<sub>3</sub>C<sub>2</sub> films by selectively etching Al out of sputter-deposited, epitaxial Ti<sub>3</sub>AlC<sub>2</sub> films in aqueous HF or NH<sub>4</sub>HF<sub>2</sub>.", "H14", "p. 1"], ["Before this work HF was the only reported MXene etchant; Halim et al. 2014 showed that ammonium bifluoride (NH<sub>4</sub>HF<sub>2</sub>) works too. It is less hazardous than HF and milder, and it intercalates cations while it etches.", "H14", "p. 3"], ["The paper presents this as a one-step synthesis of an MXene that is already intercalated with ammonia.", "H14", "p. 2"], ["NH<sub>4</sub>HF<sub>2</sub>-etched films (named Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>-IC) are intercalated with NH<sub>3</sub> and NH<sub>4</sub><sup>+</sup>. Their c lattice parameter (~25 Å) is 25% larger than that of HF-etched films, and they are more transparent but also more resistive.", "H14", "p. 7"]], "materials": [["Sputter targets: elemental Ti, Al and C (diameters 75, 50 and 75 mm). Process gas: Ar, 99.9999% purity.", "H14", "p. 2"], ["Substrates: c-axis-oriented sapphire, Al<sub>2</sub>O<sub>3</sub> (0001), 10 × 10 mm2, 'thicknesses of 0.5 cm' as printed (MTI Corp.).", "H14", "p. 2"], ["Substrate cleaning: acetone, isopropanol and nitrogen gas.", "H14", "p. 2"], ["Etchant: 1 M NH<sub>4</sub>HF<sub>2</sub> (Sigma Aldrich, Stockholm, Sweden), used at room temperature.", "H14", "p. 2"], ["Comparison etchant: 50% concentrated HF (Sigma Aldrich).", "H14", "p. 2"], ["Rinsing liquids: deionized water, then ethanol.", "H14", "p. 2"], ["Film XRD was run on an X’Pert Powder diffractometer (PANalytical).", "H14", "p. 2"], ["Alhabeb et al. 2017 powder variant: NH<sub>4</sub>HF<sub>2</sub> powder (95% grade) and TMAOH (25 wt % in water), both from Sigma-Aldrich.", "A17", "pp. 3–4"], ["Alhabeb et al. 2017 powder variant: Ti<sub>3</sub>AlC<sub>2</sub> MAX powder made from TiC:Ti:Al in a 2:1:1 stoichiometric ratio.", "A17", "p. 3"], ["Alhabeb et al. 2017 powder variant: deionized water purified with an Elix Essential 3 UV system (Millipore).", "A17", "p. 4"]], "precursor": [["Method: DC magnetron sputtering from three elemental targets (Ti, Al, C) in an ultrahigh-vacuum system. Ar (99.9999%) is the process gas at a constant pressure of '4.8 mbar' (as printed).", "H14", "p. 2"], ["Substrate: c-axis-oriented sapphire Al<sub>2</sub>O<sub>3</sub> (0001), 10 × 10 mm2.", "H14", "p. 2"], ["Substrate preparation: clean with acetone, rinse with isopropanol, dry with nitrogen gas, then preheat in the deposition chamber at 780 °C for 60 min.", "H14", "p. 2"], ["Deposition runs at 780 °C. The Ti and C targets are ignited 5 s before the Al target. This sequence first grows a 5–10 nm TiC(111) incubation (seed) layer and then Ti<sub>3</sub>AlC<sub>2</sub>.", "H14", "p. 2"], ["The TiC incubation layer helps epitaxial Ti<sub>3</sub>AlC<sub>2</sub> to grow.", "H14", "p. 2"]], "procedure": [["Clean the c-axis-oriented sapphire Al<sub>2</sub>O<sub>3</sub> (0001) substrates (10 × 10 mm2) with acetone, rinse them with isopropanol and dry them with nitrogen gas.", "H14", "p. 2", "deposition"], ["Preheat the substrates inside the deposition chamber at 780 °C for 60 min.", "H14", "p. 2", "deposition"], ["Set up DC magnetron sputtering in the ultrahigh-vacuum system with three elemental targets: Ti (75 mm), Al (50 mm) and C (75 mm). Use Ar (99.9999%) as process gas at a constant pressure of 4.8 mbar (value as printed).", "H14", "p. 2", "deposition"], ["At 780 °C, ignite the Ti and C targets for 5 s, then ignite the Al target. A 5−10 nm TiC(111) incubation layer forms first, and Ti<sub>3</sub>AlC<sub>2</sub> then grows on top of it.", "H14", "p. 2", "deposition"], ["Deposit for 5, 10, 20 or 30 min. In Halim et al. 2014 this gave Ti<sub>3</sub>AlC<sub>2</sub> films of 15.2 ± 0.5, 27.7 ± 0.8, 43.4 ± 3.6 and 60.0 ± 5.4 nm.", "H14", "p. 2", "deposition"], ["Etch the Ti<sub>3</sub>AlC<sub>2</sub> film at room temperature in 1 M NH<sub>4</sub>HF<sub>2</sub>.", "H14", "p. 2", "etching"], ["Etch 15, 28, 43 and 60 nm (nominal) films for 150, 160, 420 and 660 min respectively. 50% HF needs only 10, 15, 60 and 160 min for the same thicknesses.", "H14", "p. 2", "etching"], ["Interrupt the etch at intervals and record XRD. Stop when the Ti<sub>3</sub>AlC<sub>2</sub> peaks have disappeared, which marks full MAX-to-MXene conversion.", "H14", "p. 6", "etching"], ["Rinse the etched film in deionized water, then in ethanol.", "H14", "p. 2", "washing"]], "variants": [["Films of 15, 28, 43 and 60 nm nominal thickness were etched in 50% HF for 10, 15, 60 and 160 min at room temperature.", "H14", "p. 2", "Halim et al. 2014 comparison: 50% HF etch times"], ["Table 1 gives 9.5 min, not 10 min, as the HF etching time of the set-1 (5-min deposition) film.", "H14", "p. 2", "Halim et al. 2014 comparison: Table 1 HF time for set 1"], ["HF etching raises c only from 18.6 Å to 19.8 Å. NH<sub>4</sub>HF<sub>2</sub> etching raises it to 24.7 Å.", "H14", "p. 4", "Halim et al. 2014 comparison: HF-etched film product"], ["At 28 nm nominal thickness, HF-etched films have a resistivity of 2.3 μΩ m and NH<sub>4</sub>HF<sub>2</sub>-etched films 5.0 μΩ m.", "H14", "p. 6", "Halim et al. 2014 comparison: HF vs NH<sub>4</sub>HF<sub>2</sub> resistivity"], ["To identify the by-products, Halim et al. 2014 soaked 0.5 g Ti<sub>3</sub>AlC<sub>2</sub> powder in 5 ml of 1 M NH<sub>4</sub>HF<sub>2</sub> at room temperature and left the mixture untouched until the solvent evaporated.", "H14", "SI §III, SI p. 8", "Halim et al. 2014 SI: powder by-product test (1 M NH<sub>4</sub>HF<sub>2</sub>, unwashed)"], ["XRD of the dry powder shows (NH<sub>4</sub>)<sub>3</sub>AlF<sub>6</sub> and AlF<sub>3</sub>·3H2O in a peak-intensity ratio of about 7:1, so (NH<sub>4</sub>)<sub>3</sub>AlF<sub>6</sub> is the major by-product.", "H14", "SI §III, SI p. 8", "Halim et al. 2014 SI: powder by-product test, result"], ["The salt was not washed away in this test. The powder still showed unreacted Ti<sub>3</sub>AlC<sub>2</sub> and TiC impurity peaks.", "H14", "SI Fig. S4 caption, SI p. 9", "Halim et al. 2014 SI: powder by-product test, notes"], ["HF-made Ti<sub>3</sub>C<sub>2</sub> powder was stirred for 24 h at room temperature in 1 M NH<sub>4</sub>F or 5 M NH<sub>4</sub>OH. c rose from 19.8 Å to 25 Å in both, as with NH<sub>4</sub>HF<sub>2</sub> etching, so NH<sub>4</sub><sup>+</sup> is taken to be the common intercalant.", "H14", "SI §IV, SI p. 9", "Halim et al. 2014 SI: NH<sub>4</sub>F / NH<sub>4</sub>OH intercalation of HF-made Ti<sub>3</sub>C<sub>2</sub> powder"], ["Heating a 43 nm Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>-IC film in vacuum at 250 °C for 90 min lowers c to 21 Å, so ammonia can be de-intercalated.", "H14", "SI §IV, SI p. 9", "Halim et al. 2014 SI: optional de-intercalation of a film"], ["The Fig. S5 caption gives 2 h for the 250 °C vacuum heating of the same 43 nm film. The SI text says 90 min.", "H14", "SI Fig. S5 caption, SI p. 10", "Halim et al. 2014 SI: de-intercalation time in the Fig. S5 caption"], ["Add 0.5 g Ti<sub>3</sub>AlC<sub>2</sub> powder to 10 mL of 2 M NH<sub>4</sub>HF<sub>2</sub> while stirring continuously. React for 24 h at room temperature (~23 °C).", "A17", "p. 5", "Alhabeb et al. 2017 NH<sub>4</sub>HF<sub>2</sub> powder etch"]], "equations": [["Ti<sub>3</sub>AlC<sub>2</sub> + 3 NH<sub>4</sub>HF<sub>2</sub> = (NH<sub>4</sub>)<sub>3</sub>AlF<sub>6</sub> + Ti<sub>3</sub>C<sub>2</sub> + 3/2 H<sub>2</sub>", "H14", "p. 4"], ["Ti<sub>3</sub>C<sub>2</sub> + a NH<sub>4</sub>HF<sub>2</sub> + b H<sub>2</sub>O = (NH<sub>3</sub>)c(NH<sub>4</sub>)d Ti<sub>3</sub>C<sub>2</sub>(OH)xFy", "H14", "p. 5"], ["Ti<sub>3</sub>AlC<sub>2</sub> + 3 HF = AlF<sub>3</sub> + 3/2 H<sub>2</sub> + Ti<sub>3</sub>C<sub>2</sub>", "H14", "p. 4"], ["Ti<sub>3</sub>C<sub>2</sub> + 2 H<sub>2</sub>O = Ti<sub>3</sub>C<sub>2</sub>(OH)<sub>2</sub> + H<sub>2</sub>", "H14", "p. 4"], ["Ti<sub>3</sub>C<sub>2</sub> + 2 HF = Ti<sub>3</sub>C<sub>2</sub>F<sub>2</sub> + H<sub>2</sub>", "H14", "p. 4"]], "explanation": [["NH<sub>4</sub>HF<sub>2</sub> is less hazardous and milder than HF, and it intercalates cations while it etches.", "H14", "p. 3"], ["Etching of Al and intercalation of ammonium species happen together, which is why Halim et al. 2014 proposes reactions (4) and (5).", "H14", "p. 4"], ["Etching and intercalation are a single step, which considerably simplifies intercalation compared with the two-step NH<sub>4</sub>OH route of earlier work.", "H14", "p. 4"], ["Unlike HF etching, NH<sub>4</sub>HF<sub>2</sub> etching forms (NH<sub>4</sub>)<sub>3</sub>AlF<sub>6</sub> (reaction 4). Reaction 5 represents NH<sub>3</sub> and NH<sub>4</sub><sup>+</sup> entering between the Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> layers.", "H14", "p. 5"], ["A powder test identifies (NH<sub>4</sub>)<sub>3</sub>AlF<sub>6</sub> as the major by-product, about 7:1 relative to AlF<sub>3</sub>·3H2O.", "H14", "SI §III, SI p. 8"], ["The c lattice parameter rises from 18.6 Å (Ti<sub>3</sub>AlC<sub>2</sub>) to 19.8 Å after HF etching and to 24.7 Å after NH<sub>4</sub>HF<sub>2</sub> etching.", "H14", "p. 4"], ["NH<sub>4</sub>OH or NH<sub>4</sub>F give a similar ~25% expansion on HF-etched powder. Because the expansion does not depend on the anion, the cations (NH<sub>4</sub><sup>+</sup> and/or NH<sub>3</sub>), not the anions, are taken to be the intercalated species.", "H14", "p. 4"], ["The N 1s XPS spectrum fits two components, NH<sub>4</sub><sup>+</sup> (55.8%) and NH<sub>3</sub> (44.2%), so both species intercalate.", "H14", "p. 5"]], "terminations": [["HF and NH<sub>4</sub>HF<sub>2</sub> etching both give near-stoichiometric Ti<sub>3</sub>C<sub>2</sub> terminated by a mixture of fluoride and hydroxyl groups. NH<sub>4</sub>HF<sub>2</sub> etching also intercalates NH<sub>4</sub><sup>+</sup> and NH<sub>3</sub>.", "H14", "SI §II, SI p. 8"], ["Surface oxidation and contamination peaks are left out of this composition, including TiO<sub>2</sub>, H<sub>2</sub>O, hydrocarbons, alcohols, carboxylates and aluminium fluoride.", "H14", "SI §II, SI p. 8"], ["F 1s: mostly Ti–F (fluorinated titanium), plus a small aluminium fluoride (Al–F) component.", "H14", "SI §II, SI p. 5"], ["In the NH<sub>4</sub>HF<sub>2</sub> film the aluminium fluoride peak is shifted and broadened, which may mean (NH<sub>4</sub>)<sub>3</sub>AlF<sub>6</sub> rather than AlF<sub>3</sub>.", "H14", "SI Table S3 footnote, SI p. 7"], ["O 1s: titanium oxide components, plus signs of Ti–OH formation and H<sub>2</sub>O uptake.", "H14", "SI §II, SI p. 4"]], "product": [["NH<sub>4</sub>HF<sub>2</sub>-etched films are called Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>-IC, where IC stands for the intercalated NH<sub>3</sub> and NH<sub>4</sub><sup>+</sup>.", "H14", "p. 3"], ["Table 1, Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>-IC films (sets 1–4): thicknesses 18.7, 31.3, 52.8 and 74.7 nm after 150, 160, 420 and 660 min. Resistivity 4472, 5.01, 31 and 54 μΩm. Transmittance at 700 nm 85, 37, 28 and 14%.", "H14", "p. 2"], ["The 74.7 nm value was measured by TEM and corrected for thinning caused by partial de-intercalation.", "H14", "p. 2"], ["Etched films are thicker than the starting films because c increases and the layers separate.", "H14", "p. 5"], ["c = 24.7 Å by XRD, about 25% larger than in HF-etched films.", "H14", "p. 4"], ["c does not change with etching time.", "H14", "p. 6"], ["Cross-sectional STEM images show the Ti<sub>3</sub>AlC<sub>2</sub>, Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> and Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>-IC films (60 nm nominal thickness) on the sapphire substrate with its TiC incubation layer.", "H14", "p. 4"], ["At 15 nm nominal thickness, HF films are 68% and NH<sub>4</sub>HF<sub>2</sub> films 85% transparent.", "H14", "p. 7"]], "safety": [["Halim et al. 2014 describes NH<sub>4</sub>HF<sub>2</sub> as less hazardous than HF and a milder etchant.", "H14", "p. 3"], ["Alhabeb et al. 2017 calls NH<sub>4</sub>HF<sub>2</sub> an HF-containing etchant.", "A17", "p. 1"], ["Fluoride salts such as NH<sub>4</sub>HF<sub>2</sub> form HF in situ, giving etchants with 3–5 wt % HF.", "A17", "p. 5"]], "flow": [["Clean and preheat sapphire", "Acetone, isopropanol, N<sub>2</sub> dry; 780 °C for 60 min"], ["Sputter TiC seed layer", "Ti and C targets ignited 5 s before Al"], ["Grow epitaxial Ti<sub>3</sub>AlC<sub>2</sub> film", "780 °C; 5–30 min gives about 15–60 nm"], ["Etch in 1 M NH<sub>4</sub>HF<sub>2</sub>", "Room temperature; Al removed, NH<sub>4</sub>+/NH<sub>3</sub> intercalate simultaneously"], ["Etch 150–660 min", "Longer for thicker films; 50% HF needs 10–160 min"], ["Stop when Ti<sub>3</sub>AlC<sub>2</sub> peaks vanish", "Intermittent XRD checks confirm full MAX-to-MXene conversion"], ["Rinse: water, then ethanol", "Deionized water rinse followed by ethanol rinse"], ["Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>-IC film on sapphire", "c = 24.7 Å; transparent; metallic down to ~100 K"]], "mech": {"a": "Al", "from": "Ti₃AlC₂ film", "agent": "1 M NH₄HF₂", "out": "(NH₄)₃AlF₆ + 3/2 H₂", "tx": ["O", "F", "O"], "to": "Ti₃C₂Tₓ + NH₄⁺, NH₃", "alt": "A Ti3AlC2 film reacts with NH4HF2; the Al leaves as (NH4)3AlF6 with hydrogen, and NH3 and NH4+ enter between the Ti3C2Tx layers.", "cap": "Equations (4) and (5) of Halim et al. 2014 (pp. 4–5): NH<sub>4</sub>HF<sub>2</sub> removes the Al as (NH<sub>4</sub>)<sub>3</sub>AlF<sub>6</sub> and hydrogen is released; NH<sub>3</sub> and NH<sub>4</sub><sup>+</sup> enter between the terminated layers."}};
  MK_BY["nh4hf2"].plain = ["MAX phases have the formula M<sub>n+1</sub>AX<sub>n</sub>. M is an early transition metal (here Ti), A is an A-group element (here Al) and X is carbon and/or nitrogen (here C). {H14} A MAX phase is built in layers: sheets of M atoms alternate with layers of pure A, and the X atoms sit between the M atoms. {H14} Here the MAX phase is a thin film, not a powder. Ti, Al and C are sputtered onto a (0001) sapphire substrate. A nanometre-thin TiC layer forms first, and Ti<sub>3</sub>AlC<sub>2</sub> grows on top of it. {H14}", "A chemical etch is needed because the A–M bonds in a MAX phase are too strong to peel the layers apart mechanically. {A17} The film sits in a 1 M ammonium bifluoride (NH<sub>4</sub>HF<sub>2</sub>) solution at room temperature. {H14} The solution removes only the Al layers and leaves the Ti<sub>3</sub>C<sub>2</sub> layers in place. {H14}", "After etching, the film is simply rinsed: first in deionized water, then in ethanol. {H14} For etched powders, Alhabeb et al. 2017 says washing removes leftover acid and reaction salts and brings the pH to a safe value of about 6. {A17} If the product is not washed, the salt stays in it. In Halim et al. 2014's powder test the salt was left unwashed and appeared in the XRD pattern. {H14}", "Cross-sectional STEM images show the etched Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>-IC film (60 nm nominal thickness) on the sapphire substrate with its TiC incubation layer. {H14} With the Al gone, the layers interact only weakly: the larger, non-uniform spacing seen in STEM images of the etched films indirectly confirms this. {H14} The new layer surfaces carry hydroxyl and fluoride groups, the 'Tx' in Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>. {H14}", "In this route intercalation needs no separate step: guest species enter between the layers during etching. {H14} The guests are ammonium ions (NH<sub>4</sub><sup>+</sup>) and ammonia molecules (NH<sub>3</sub>). XPS assigns 55.8% of the nitrogen signal to NH<sub>4</sub><sup>+</sup> and 44.2% to NH<sub>3</sub>. {H14} The guests push the layers apart. c grows from 18.6 Å (Ti<sub>3</sub>AlC<sub>2</sub>) to 19.8 Å after HF etching and to 24.7 Å after NH<sub>4</sub>HF<sub>2</sub> etching. {H14}", null, null, null, "Earlier MXenes were powders, flakes or colloids. Here the ~1 × 1 cm2 film is made directly, by etching a sputtered Ti<sub>3</sub>AlC<sub>2</sub> film. {H14} The film is see-through: ~19 nm NH<sub>4</sub>HF<sub>2</sub>-etched films let ~90% of visible-to-infrared light pass and still conduct like a metal down to ~100 K. {H14} The MXene film is much more transparent than the Ti<sub>3</sub>AlC<sub>2</sub> film of the same starting thickness. {H14}"];
  MK_BY["nh4hf2"].scene.caps = {"0": [[0, "A Ti₃AlC₂ film, grown on sapphire on a thin TiC seed layer"]], "1": [[0, "The film sits in 1 M NH₄HF₂ at room temperature"], [0.3, "Only the Al layers are removed, as (NH₄)₃AlF₆; hydrogen is released"], [0.68, "NH₄⁺ and NH₃ enter between the layers while they are etched"]], "2": [[0, "The film is rinsed in deionized water, then in ethanol"]], "3": [[0, "A layered Ti₃C₂Tₓ film stays on the substrate; STEM indirectly shows weak bonding between its layers"]], "4": [[0, "The NH₄⁺ and NH₃ guests push the layers apart: c is 24.7 Å, against 19.8 Å after HF etching (18.6 Å in Ti₃AlC₂)"]], "8": [[0, "A ~19 nm film lets ~90% of the light through and conducts like a metal down to ~100 K"]]};
  MK_DOC["molten"] = {"title": "Lewis-acid molten-salt etching: Ti<sub>3</sub>AlC<sub>2</sub> in ZnCl<sub>2</sub> to Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub>", "basis": "etching: Li M. et al., <i>J. Am. Chem. Soc.</i> 2019 (ZnCl<sub>2</sub>) · delamination and film: Kamysbayev et al., <i>Science</i> 2020 (on Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> made in molten CdCl<sub>2</sub>) · CuCl<sub>2</sub> route: Li Y. et al., <i>Nat. Mater.</i> 2020", "teaser": "A step-by-step protocol for etching Ti<sub>3</sub>AlC<sub>2</sub> in molten ZnCl<sub>2</sub> (Li et al. 2019), followed by the n-butyllithium delamination and spin-coating that Kamysbayev et al. 2020 applied to Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> made in molten CdCl<sub>2</sub>, with the CuCl<sub>2</sub> recipe of Li et al. 2020 and the reactions the papers give. Every line cites the page it comes from.", "summary": [["Heating a MAX phase (Ti<sub>3</sub>AlC<sub>2</sub>) with an excess of molten ZnCl<sub>2</sub> first swaps Al for Zn (Ti<sub>3</sub>ZnC<sub>2</sub>) and then etches the Zn out, leaving Cl-terminated MXene (Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub>); this happens because of the strong Lewis acidity of molten ZnCl<sub>2</sub>.", "L19", "p. 1, Abstract"], ["The route needs no HF: the Lewis acid in the molten salt does the etching.", "L19", "p. 1, Abstract"], ["Li et al. 2019 reports this as the first time MXenes with exclusively Cl terminations were made.", "L19", "p. 1, Abstract"], ["Li Y. et al. (2020) proposed a redox-controlled A-site etching in Lewis-acidic melts and validated it with MAX phases whose A element is Si, Zn or Ga.", "L20", "p. 1, Abstract"]], "materials": [["MAX-phase precursor powder: Ti<sub>3</sub>AlC<sub>2</sub> (Li et al. 2019 also used Ti<sub>2</sub>AlC, Ti<sub>2</sub>AlN and V<sub>2</sub>AlC, together called Al-MAX), reacted with ZnCl<sub>2</sub>.", "L19", "p. 2, Experimental"], ["Mortar for mixing; glovebox with nitrogen protection.", "L19", "p. 2, Experimental"], ["Alumina crucible, tube furnace, Ar gas.", "L19", "p. 2, Experimental"], ["Deionized water for washing.", "L19", "p. 2, Experimental"], ["5 wt % HCl solution (to dissolve the metallic Zn by-product).", "L19", "p. 5"], ["ZnCl<sub>2</sub> grade: Li et al. 2019 states none; the ZnCl<sub>2</sub> of the Li et al. 2020 group was anhydrous, &gt;98 wt.% purity.", "L20", "SI p. 2, Materials"], ["Delamination chemicals (Kamysbayev et al. 2020): n-butyllithium 2.5 M in hexanes, anhydrous hexane, anhydrous THF and N-methylformamide (NMF) purified by distillation.", "K20", "SM p. 2, Chemicals and materials"], ["Delamination hardware (Kamysbayev et al. 2020): sealed vial, centrifuge tube, bath sonicator, centrifuge, N<sub>2</sub>-filled glovebox.", "K20", "SM p. 3, Delamination of Ti3C2Tn MXenes"], ["Film (Kamysbayev et al. 2020): glass substrates, piranha solution (H<sub>2</sub>SO<sub>4</sub>:H<sub>2</sub>O<sub>2</sub> = 5:2), DI water, oxygen plasma, spin coater.", "K20", "SM p. 4, Thin film fabrication"], ["Salts for the Kamysbayev et al. 2020 variant: ultra-dry CdCl<sub>2</sub> (99.996 %), ZnCl<sub>2</sub> (99.999 %) and CdBr<sub>2</sub> (99.999 %).", "K20", "SM p. 2, Chemicals and materials"]], "precursor": [["A MAX phase has the formula M<sub>n+1</sub>AX<sub>n</sub> (n = 1–3): M is an early transition metal, A is an element traditionally from groups 13–16, X is carbon or nitrogen.", "L19", "p. 1"], ["Its structure: M6X octahedra (e.g. Ti<sub>6</sub>C) interleaved with layers of A atoms (e.g. Al).", "L19", "p. 1"], ["In Li et al. 2019 the Ti<sub>3</sub>AlC<sub>2</sub> precursor powder was itself made by a molten-salt method.", "L19", "p. 2, Experimental"], ["Starting composition for Ti<sub>3</sub>AlC<sub>2</sub> (Li et al. 2019 Table 1): TiC/Ti/Al/NaCl/KCl = 2:1:1.1:4:4.", "L19", "p. 2, Table 1"], ["A 1:1 molar mixture of NaCl and KCl forms the molten-salt bath for the precursor synthesis.", "L19", "p. 2, Experimental"]], "procedure": [["Weigh Ti<sub>3</sub>AlC<sub>2</sub> and ZnCl<sub>2</sub> in a 1:6 molar ratio (Al-MAX : ZnCl<sub>2</sub>) — the ratio Li et al. 2019 used for the Cl-terminated MXene.", "L19", "p. 2, Experimental", "mixing"], ["Mix the powders thoroughly in a mortar under nitrogen inside a glovebox.", "L19", "p. 2, Experimental", "mixing"], ["Take the mixture out of the glovebox and place it in an alumina crucible.", "L19", "p. 2, Experimental", "other"], ["Load the crucible into a tube furnace and heat at 550 °C for 5 h under Ar gas.", "L19", "p. 2, Experimental", "etching"], ["After the reaction, wash the product with deionized water to remove the residual ZnCl<sub>2</sub>.", "L19", "p. 2, Experimental", "washing"], ["Dry the product at 40 °C.", "L19", "p. 2, Experimental", "drying"], ["To remove the metallic Zn by-product, treat the as-reacted product with 5 wt % HCl solution at 25 °C for 2 h, then wash with deionized water.", "L19", "p. 5", "washing"], ["[Kamysbayev et al. 2020] Immerse 500 mg Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> in 5 mL of 2.5 M n-butyllithium (hexanes solution) in a sealed vial.", "K20", "SM p. 3, Delamination of Ti3C2Tn MXenes", "intercalation"], ["[Kamysbayev et al. 2020] Stir the mixture at 50 °C for 24 h inside an N<sub>2</sub>-filled glovebox.", "K20", "SM p. 3, Delamination of Ti3C2Tn MXenes", "intercalation"], ["[Kamysbayev et al. 2020] Wash the lithium-intercalated MXene with hexane, then with THF, to remove excess lithium and organic residues.", "K20", "SM p. 3, Delamination of Ti3C2Tn MXenes", "washing"], ["[Kamysbayev et al. 2020] Put 100 mg of the intercalated powder and 10 mL anhydrous NMF in a centrifuge tube and seal it inside the N<sub>2</sub>-filled glovebox.", "K20", "SM p. 3, Delamination of Ti3C2Tn MXenes", "delamination"], ["[Kamysbayev et al. 2020] Bath-sonicate for 1 h, keeping the temperature below 10 °C to avoid possible oxidation.", "K20", "SM p. 3, Delamination of Ti3C2Tn MXenes", "delamination"], ["[Kamysbayev et al. 2020] Centrifuge at 1500 r.p.m. for 15 min and collect the supernatant.", "K20", "SM p. 3, Delamination of Ti3C2Tn MXenes", "centrifugation"], ["[Kamysbayev et al. 2020] Centrifuge the collected supernatant at 9000 r.p.m. for 15 min to remove small impurities.", "K20", "SM p. 3, Delamination of Ti3C2Tn MXenes", "centrifugation"], ["[Kamysbayev et al. 2020] Redisperse the sediment in fresh NMF or hydrazine to form a stable colloidal solution.", "K20", "SM pp. 3–4, Delamination of Ti3C2Tn MXenes", "colloid"], ["[Kamysbayev et al. 2020] Store the delaminated MXene in anhydrous NMF or hydrazine inside an N<sub>2</sub>-filled glovebox to avoid possible oxidation of the surface groups.", "K20", "SM p. 4, Delamination of Ti3C2Tn MXenes", "colloid"], ["[Kamysbayev et al. 2020] Clean glass substrates in piranha solution (H<sub>2</sub>SO<sub>4</sub>:H<sub>2</sub>O<sub>2</sub> = 5:2) for 30 min, wash thoroughly with DI water, then treat with oxygen plasma for 30 min.", "K20", "SM p. 4, Thin film fabrication", "film"], ["[Kamysbayev et al. 2020] Use a highly concentrated colloidal MXene ink (~10 mg/mL) for the film.", "K20", "SM p. 34, Fig. S18 caption", "film"], ["[Kamysbayev et al. 2020] Spin-coat the colloidal Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> in NMF onto the substrate at ~90 °C inside an N<sub>2</sub>-filled glovebox.", "K20", "SM p. 4, Thin film fabrication", "film"]], "variants": [["With only 1:1.5 Al-MAX : ZnCl<sub>2</sub> (same 550 °C, 5 h) the product is the Zn-MAX phase (e.g. Ti<sub>3</sub>ZnC<sub>2</sub>), not the MXene.", "L19", "p. 2, Experimental", "Li et al. 2019 — Zn-MAX instead of MXene (less ZnCl<sub>2</sub>)"], ["Ti<sub>2</sub>AlC with ZnCl<sub>2</sub> at 1:6 gives Ti<sub>2</sub>CCl<sub>2</sub>.", "L19", "p. 5", "Li et al. 2019 — Ti<sub>2</sub>AlC → Ti<sub>2</sub>CCl<sub>2</sub>"], ["Ti<sub>2</sub>AlN and V<sub>2</sub>AlC at 1:6 stopped at the Zn-MAX phases Ti<sub>2</sub>ZnN and V<sub>2</sub>ZnC; no Cl-MXene formed.", "L19", "p. 5", "Li et al. 2019 — Ti<sub>2</sub>AlN and V<sub>2</sub>AlC: no MXene"], ["Grind 1 g Ti<sub>3</sub>SiC<sub>2</sub> with 2.1 g CuCl<sub>2</sub> (stoichiometric molar ratio 1:3) for 10 min; add 0.6 g NaCl and 0.76 g KCl and grind another 10 min.", "L20", "p. 7, Methods", "Li et al. 2020 CuCl<sub>2</sub> recipe (published Methods) — mixing"], ["Place the mixture in an alumina boat inside an alumina tube under argon flow; heat to 750 °C at 4 °C/min and hold for 24 h.", "L20", "p. 7, Methods", "Li et al. 2020 CuCl<sub>2</sub> recipe — heating, atmosphere, time"], ["Wash with deionized water to remove the salts; this leaves MXene/Cu mixed particles.", "L20", "p. 7, Methods", "Li et al. 2020 CuCl<sub>2</sub> recipe — salt removal"], ["Wash the MXene/Cu mixture with 0.1 M ammonium persulfate (APS) solution to remove the residual Cu particles.", "L20", "p. 7, Methods", "Li et al. 2020 CuCl<sub>2</sub> recipe — Cu removal with APS (0.1 M)"], ["The APS treatment is done at room temperature; the MXene keeps its layered structure.", "L20", "SI p. 4, Fig. S2 caption", "Li et al. 2020 CuCl<sub>2</sub> recipe — APS step at room temperature"], ["Clean five times with deionized water and five times with alcohol, filter on a 0.45 μm PVDF membrane, and dry the MS-Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> powder under vacuum at room temperature for 24 h.", "L20", "p. 7, Methods", "Li et al. 2020 CuCl<sub>2</sub> recipe — rinsing, filtration, drying"], ["As an alternative to APS, the MXene was washed in 0.1 M aqueous FeCl<sub>3</sub> for 4 h right after the CuCl<sub>2</sub> bath.", "L20", "SI p. 29, Replacement of APS as etching agent", "Li et al. 2020 — Cu removal with FeCl<sub>3</sub> instead of APS"], ["SI Table S7 gives every recipe as a molar composition MAX : salt : NaCl : KCl; most entries are 1:3:2:2 (see 'gaps' for the row-by-row reading).", "L20", "SI p. 20, Table S7", "Li et al. 2020 — general salt mixture (SI Table S7)"], ["Ti<sub>2</sub>AlC, Ti<sub>3</sub>AlC<sub>2</sub>, Ti<sub>3</sub>AlCN, Nb<sub>2</sub>AlC, Ta<sub>2</sub>AlC, Ti<sub>2</sub>ZnC and Ti<sub>3</sub>ZnC<sub>2</sub> were etched into the corresponding MXenes with CdCl<sub>2</sub>, FeCl<sub>2</sub>, CoCl<sub>2</sub>, CuCl<sub>2</sub>, AgCl or NiCl<sub>2</sub> melts.", "L20", "p. 3", "Li et al. 2020 — other MAX phases and chloride salts"]], "equations": [["Ti<sub>3</sub>AlC<sub>2</sub> + 1.5 ZnCl<sub>2</sub> = Ti<sub>3</sub>ZnC<sub>2</sub> + 0.5 Zn + AlCl<sub>3</sub>↑", "L19", "p. 5"], ["Ti<sub>3</sub>AlC<sub>2</sub> + 1.5 ZnCl<sub>2</sub> = Ti<sub>3</sub>C<sub>2</sub> + 1.5 Zn + AlCl<sub>3</sub>↑", "L19", "p. 5"], ["Ti<sub>3</sub>C<sub>2</sub> + Zn = Ti<sub>3</sub>ZnC<sub>2</sub>", "L19", "p. 5"], ["Ti<sub>3</sub>ZnC<sub>2</sub> + ZnCl<sub>2</sub> = Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> + 2 Zn", "L19", "p. 6"], ["Ti<sub>3</sub>ZnC<sub>2</sub> + Zn<sub>2</sub><sup>+</sup> = Ti<sub>3</sub>C<sub>2</sub> + Zn<sub>2</sub>²⁺", "L19", "p. 6"], ["Ti<sub>3</sub>C<sub>2</sub> + 2 Cl<sup>−</sup> = Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> + 2 e−", "L19", "p. 6"], ["Zn<sub>2</sub>²⁺ + 2 e− = 2 Zn", "L19", "p. 6"], ["Zn + 2 HCl = ZnCl<sub>2</sub> + H<sub>2</sub>↑", "L19", "p. 5"], ["Ti<sub>3</sub>SiC<sub>2</sub> + 2 CuCl<sub>2</sub> → Ti<sub>3</sub>C<sub>2</sub> + SiCl<sub>4</sub>(g)↑ + 2 Cu", "L20", "p. 2"], ["Ti<sub>3</sub>C<sub>2</sub> + CuCl<sub>2</sub> → Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> + Cu", "L20", "p. 2"], ["Si + 2 CuCl<sub>2</sub> = SiCl<sub>4</sub> (gas) + 2 Cu", "L20", "SI p. 13, Guidelines for preparing various MXenes"], ["A + y/x BCl<sub>x</sub> = ACl<sub>y</sub> + y/x B", "L20", "p. 3"]], "explanation": [["Late transition-metal halides such as ZnCl<sub>2</sub> behave as Lewis acids when molten.", "L19", "p. 2"], ["The melt supplies strong electron acceptors that react with the A element, while atoms or ions from the melt bond to the exposed M<sub>n+1</sub>X<sub>n</sub> sheets.", "L19", "p. 2"], ["ZnCl<sub>2</sub> melts at about 280 °C and in the melt is ionised to Zn<sub>2</sub><sup>+</sup> and ZnCl<sub>4</sub> 2− tetrahedra.", "L19", "p. 5"], ["The coordinately unsaturated Zn<sub>2</sub><sup>+</sup> accepts Cl<sup>−</sup> and electrons: it is the Lewis acid of the melt.", "L19", "p. 5"], ["A-element oxidation and volatile chloride: weakly bonded Al is oxidised to Al<sub>3</sub><sup>+</sup>, forms AlCl<sub>3</sub> (b.p. about 180 °C), which evaporates at 550 °C.", "L19", "p. 5"], ["Evaporation of AlCl<sub>3</sub> drives Al out; the vacated A sites let Zn in.", "L19", "p. 5"], ["Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> forms in two steps: Ti<sub>3</sub>ZnC<sub>2</sub> first, then etching of Ti<sub>3</sub>ZnC<sub>2</sub> in the excess ZnCl<sub>2</sub>.", "L19", "p. 5"], ["Time series at 550 °C (1:6): still Ti<sub>3</sub>AlC<sub>2</sub> after 0.5 h, Ti<sub>3</sub>ZnC<sub>2</sub> after 1.0 h, Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> appears at 1.5 h, and Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> + Zn at 3.0 h.", "L19", "p. 6"]], "terminations": [["ZnCl<sub>2</sub> route: the surface of Ti<sub>3</sub>C<sub>2</sub> is terminated by Cl atoms (STEM).", "L19", "p. 5"], ["XPS gives Ti:Cl = 2.94:2, consistent with Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub>.", "L19", "p. 5"], ["EDS: Ti/C/Cl = 43.2:21.5:25.3 (at.), with small amounts of Zn (0.7 at.%), Al (2.9 at.%) and O (6.3 at.%).", "L19", "p. 4"], ["Some O may come from Al(OH)<sub>3</sub> (hydrolysis of AlCl<sub>3</sub>) and from Cl replaced by O-containing groups during water washing.", "L19", "p. 4"], ["CuCl<sub>2</sub> route: the final MS-Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> carries O and Cl groups.", "L20", "p. 2"]], "product": [["As-reacted product (1:6, 550 °C): Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> MXene sheets mixed with Zn spheres.", "L19", "p. 4"], ["The particles are exfoliated along the basal planes (SEM, TEM).", "L19", "p. 4"], ["c lattice parameter 22.24 Å (DFT: 22.34 Å), larger than HF-made Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>.", "L19", "p. 5"], ["Sharp, intense (000l) XRD peaks: a well-ordered crystal structure.", "L19", "p. 5"], ["Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> is stable in the HCl solution used to remove Zn.", "L19", "p. 5"], ["Calculated single-layer Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> is metallic.", "L19", "p. 5"], ["Kamysbayev et al. 2020 (Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> made in molten CdCl<sub>2</sub>): multilayer Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> stacks have d = 11.25 Å and a van der Waals gap of about 2.8 Å.", "K20", "p. 2"], ["Kamysbayev et al. 2020 (Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> made in molten CdCl<sub>2</sub>): after n-butyllithium treatment, dispersion in NMF gave stable colloidal solutions of single-layer flakes.", "K20", "p. 2"]], "safety": [["Li et al. 2019 describes the molten-salt process as considerably safer and cleaner than HF etching.", "L19", "p. 5"], ["Li et al. 2020 names HF as hazardous and a non-hazardous route as a main goal.", "L20", "p. 1"], ["Gas leaves the hot charge: AlCl<sub>3</sub> (b.p. about 180 °C) is expected to evaporate rapidly at the 550 °C reaction temperature (ZnCl<sub>2</sub> route).", "L19", "p. 5"], ["Gas leaves the hot charge: volatile SiCl<sub>4</sub> (b.p. 57.6 °C) forms in the CuCl<sub>2</sub> route.", "L20", "p. 2"], ["The Zn-removal step with HCl follows reaction 1, which releases H<sub>2</sub> gas (see mechanism, Li et al. 2019 eq. 1).", "L19", "p. 5"], ["Kamysbayev et al. 2020 ran its own molten-salt etching (CdCl<sub>2</sub>/CdBr<sub>2</sub>) in an Ar-filled glovebox with oxygen and moisture below 1 ppm.", "K20", "SM p. 2"]], "flow": [["Ti<sub>3</sub>AlC<sub>2</sub> + ZnCl<sub>2</sub> (1:6)", "Grind in mortar under nitrogen in a glovebox"], ["550 °C, 5 h, argon", "Alumina crucible in tube furnace; Al leaves as AlCl<sub>3</sub>"], ["Water wash, dry 40 °C", "Removes residual ZnCl<sub>2</sub>"], ["Dilute HCl removes Zn", "5 wt% HCl, 25 °C, 2 h; Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> unchanged"], ["n-BuLi intercalation (Kamysbayev et al. 2020)", "2.5 M n-BuLi, 50 °C, 24 h, N<sub>2</sub> glovebox; hexane/THF wash"], ["Sonicate in NMF (Kamysbayev et al. 2020)", "100 mg in 10 mL NMF, 1 h, below 10 °C"], ["Centrifuge 1500, then 9000 r.p.m.", "15 min each; keep supernatant, then sediment"], ["Colloid in NMF (Kamysbayev et al. 2020)", "Redisperse sediment; store under N<sub>2</sub>"], ["Spin-coated film (Kamysbayev et al. 2020)", "~10 mg/mL ink, ~90 °C, cleaned glass, N<sub>2</sub>"]], "mech": {"a": "Al", "from": "Ti₃AlC₂", "agent": "molten ZnCl₂, 550 °C", "out": "AlCl₃↑ + Zn", "tx": ["Cl"], "to": "Ti₃C₂Cl₂", "alt": "Ti3AlC2 layers with Al between them react in molten ZnCl2; the Al leaves as volatile AlCl3, Zn forms, and the Ti3C2 surfaces carry Cl.", "cap": "Equations (2)–(8) of Li et al. 2019 (pp. 5–6): Zn first takes the place of Al (Ti<sub>3</sub>ZnC<sub>2</sub>) and AlCl<sub>3</sub> evaporates; then the Zn is oxidised away, metallic Zn forms and Cl<sup>−</sup> binds to the Ti surfaces."}};
  MK_BY["molten"].plain = ["A MAX phase is a layered crystal with the formula M<sub>n+1</sub>AX<sub>n</sub>: M is an early transition metal, A is an element traditionally from groups 13–16, and X is carbon or nitrogen. {L19} Inside the crystal, M6X octahedra (e.g. Ti<sub>6</sub>C) alternate with layers of A atoms (e.g. Al). {L19} The covalent M–X (Ti–C) bonds in a MAX phase are very strong and the M–A bonds much weaker, so Li et al. 2020 assumes the Ti–C bonding stays unchanged while the A element is etched. {L20}", "Above about 280 °C, ZnCl<sub>2</sub> melts and splits into Zn<sub>2</sub><sup>+</sup> ions and ZnCl<sub>4</sub> 2− groups. {L19} The Zn<sub>2</sub><sup>+</sup> ions are hungry for electrons and Cl<sup>−</sup> — that is what makes the melt a Lewis acid. {L19} In this acidic melt the weakly bonded Al atoms are oxidised to Al<sub>3</sub><sup>+</sup>, which grab Cl<sup>−</sup> to form AlCl<sub>3</sub>; AlCl<sub>3</sub> boils at about 180 °C, so at 550 °C it evaporates. {L19}", "Rinsing with deionized water dissolves the leftover ZnCl<sub>2</sub> salt. {L19} Dilute HCl then dissolves the metallic Zn; the Zn signals disappear while the Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> is unchanged — it is stable in HCl. {L19} Water washing may swap a small part of the Cl groups for O-containing groups. {L19}", "What comes out of the furnace are Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> particles that are exfoliated (opened up) along their basal planes. {L19} Molten-salt etching usually gives multilayer MXene particles, which can then be delaminated through intercalation. {V21} The Cl-terminated stack is very ordered: its (000l) XRD peaks are sharp and intense. {L19}", "In a later study on Ti<sub>3</sub>C<sub>2</sub>Cl<sub>2</sub> made in molten CdCl<sub>2</sub> (Kamysbayev et al. 2020), n-butyllithium pushed Li<sup>+</sup> ions between the sheets and left them with a negative surface charge. {K20} As the Li<sup>+</sup> ions enter, the spacing between the layers grows. {K20} The negative charge was confirmed later by a negative zeta potential, consistent with electrons injected by n-BuLi. {K20}", "In a polar organic solvent (N-methylformamide, NMF) the charged sheets come apart into single-layer flakes that stay dispersed. {K20} Bath sonication (1 h) helps; the bath is kept below 10 °C to avoid possible oxidation. {K20} Several solvents were tested; anhydrous NMF and hydrazine were the good ones for dispersing the flakes. {K20}", "First a gentle spin (1500 r.p.m., 15 min): the liquid on top (supernatant) is collected. {K20} Then a fast spin (9000 r.p.m., 15 min) removes small impurities; this time the flakes in the sediment are kept and redispersed in fresh NMF or hydrazine. {K20}", "The result is a stable colloidal solution of flakes in NMF that shows the Tyndall effect. {K20} The flakes keep their Cl surface groups after delamination. {K20} A slightly higher Ti/Cl ratio in the flakes may mean some Ti–Cl bonds broke. {K20}", "The colloid in NMF is spin-coated onto a substrate at about 90 °C under N<sub>2</sub> to make a film. {K20} In the film the flakes lie flat: XRD shows a single (0002) peak — the distance between neighbouring sheets — and the absence of (10-1l) and (11-20) reflections is consistent with flakes parallel to the substrate. {K20} Raman on a film of the flakes deposited on Si/SiO<sub>2</sub> from NMF showed no TiO<sub>2</sub> or amorphous carbon, suggesting the Cl-terminated flakes are stable as a thin film. {K20}"];
  MK_BY["molten"].scene.caps = {"0": [[0, "MAX phase Ti₃AlC₂: strongly bonded Ti–C layers with weakly bonded Al layers"]], "1": [[0, "Above about 280 °C ZnCl₂ melts; its Zn²⁺ ions make it a Lewis acid"], [0.25, "Zn takes the place of Al (Ti₃ZnC₂); AlCl₃ evaporates at 550 °C"], [0.55, "Then the Zn leaves too and Cl⁻ binds to the bare Ti: Ti₃C₂Cl₂"]], "2": [[0, "Water dissolves the leftover ZnCl₂"], [0.5, "Dilute HCl dissolves the metallic Zn; Ti₃C₂Cl₂ is stable in it"]], "3": [[0, "Ti₃C₂Cl₂ particles, opened along their basal planes, terminated by Cl"]], "4": [[0, "From a later study (Ti₃C₂Cl₂ made in molten CdCl₂): n-butyllithium pushes Li⁺ between the sheets"], [0.5, "The sheets become negatively charged and the gap grows"]], "5": [[0, "In N-methylformamide, with 1 h of bath sonication below 10 °C, the sheets come apart"]], "6": [[0, "A gentle spin (1500 rpm) keeps the liquid with the flakes"], [0.5, "A fast spin (9000 rpm) removes small impurities"]], "7": [[0, "A stable colloid of single-layer Ti₃C₂Cl₂ in NMF; it shows the Tyndall effect"]], "8": [[0, "The colloid is spin-coated onto glass at about 90 °C under N₂"], [0.6, "In the film the flakes lie flat on the substrate"]]};
  MK_DOC["naoh"] = {"title": "Alkali (NaOH) hydrothermal etching of Ti<sub>3</sub>AlC<sub>2</sub>", "basis": "protocol: Li et al., <i>Angew. Chem. Int. Ed.</i> 2018 (main text and Supporting Information) · assessment: Naguib et al. 2021", "teaser": "A step-by-step protocol for the fluorine-free NaOH route of Li et al. 2018, from Ti<sub>3</sub>AlC<sub>2</sub> powder through the 270 °C autoclave to few-layer flakes and a pressed electrode, with the Bayer-process mechanism and the conditions that fail. Every line cites the page it comes from.", "summary": [["A later review classes the product as a mixture of MAX and MXene, i.e. partial etching of the MAX phase.", "N21", "p. 3"], ["An alkali-assisted hydrothermal method turns the MAX phase Ti<sub>3</sub>AlC<sub>2</sub> into the MXene Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> with OH and O surface groups (T = OH, O).", "L18", "p. 1"], ["The route is inspired by the Bayer process used to refine bauxite, uses no fluorine, and gives multilayer Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> of about 92 wt% purity with 27.5 M NaOH at 270 °C.", "L18", "p. 1"], ["Temperature is the key factor for whether Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> forms; the NaOH concentration affects how pure it is.", "L18", "p. 2"]], "materials": [["Ti<sub>3</sub>AlC<sub>2</sub> powder (MAX phase), purchased from Beijing Forsman Scientific Co. Ltd.", "L18", "SI p. 3, §1 Experimental Procedures"], ["Sodium hydroxide, NaOH (analytical reagent, ≥99.5 %, Sinopharm Chemical Reagent Co. Ltd).", "L18", "SI p. 3, §1 Experimental Procedures"], ["Deionized water, boiled for 30 min under argon before the NaOH is added.", "L18", "SI p. 3, §1 Experimental Procedures"], ["Argon gas, used to expel air from the autoclave before sealing.", "L18", "SI p. 3, §1 Experimental Procedures"], ["50 mL autoclave holding 25 mL of NaOH solution.", "L18", "SI p. 3, §1 Experimental Procedures"], ["Electric thermostatic drying oven to heat the autoclave.", "L18", "SI p. 3, §1 Experimental Procedures"], ["PVDF filter membrane, 0.1 µm pore size.", "L18", "SI p. 3, §1 Experimental Procedures"], ["Vacuum oven (65 °C) for drying.", "L18", "SI p. 3, §1 Experimental Procedures"], ["Dimethyl sulfoxide (DMSO) as intercalation agent.", "L18", "SI p. 3, §1 Experimental Procedures"], ["Bath sonicator and centrifuge (3500 rpm).", "L18", "SI p. 3, §1 Experimental Procedures"]], "precursor": [["The MAX phase Ti<sub>3</sub>AlC<sub>2</sub> was bought as a powder (Beijing Forsman Scientific Co. Ltd); its synthesis is not described.", "L18", "SI p. 3, §1 Experimental Procedures"], ["MAX phases are three-component compounds: layers of transition-metal carbide (in Ti<sub>3</sub>AlC<sub>2</sub>: Ti and C) interleaved with layers of A-group atoms (in Ti<sub>3</sub>AlC<sub>2</sub>: Al).", "L18", "p. 1"], ["The raw Ti<sub>3</sub>AlC<sub>2</sub> powder already contained α-Al<sub>2</sub>O<sub>3</sub>, identified by XRD.", "L18", "SI p. 4, §2.2 XRD characterization of Ti3AlC2"], ["XRF composition of the pristine Ti<sub>3</sub>AlC<sub>2</sub>: 15.87 wt% C, 69.24 wt% Ti, 14.52 wt% Al (the second number in each row is the Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> product).", "L18", "SI p. 8, §5.1, Table S5"], ["Specific surface area of the pristine Ti<sub>3</sub>AlC<sub>2</sub> is about 9 m2 g−1.", "L18", "SI p. 8, §5.3, Figure S6"]], "procedure": [["Heat deionized water to boiling and keep it for 30 min in an argon (Ar) atmosphere.", "L18", "SI p. 3, §1 Experimental Procedures", "etching"], ["Add the calculated amount of NaOH (analytical reagent, ≥99.5 %) to this water to make the NaOH solution.", "L18", "SI p. 3, §1 Experimental Procedures", "etching"], ["Put 100 mg of Ti<sub>3</sub>AlC<sub>2</sub> powder into 25 mL of the NaOH solution in a 50 mL autoclave.", "L18", "SI p. 3, §1 Experimental Procedures", "etching"], ["Expel the air by flowing Ar gas, then seal the autoclave.", "L18", "SI p. 3, §1 Experimental Procedures", "etching"], ["Use 27.5 M NaOH and 270 °C under argon (the condition that gave 92 wt% Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>); the argon is there to alleviate sample oxidation.", "L18", "p. 2", "etching"], ["Heat the sealed autoclave in an electric thermostatic drying oven at the chosen temperature for 12 h.", "L18", "SI p. 3, §1 Experimental Procedures", "etching"], ["After the hydrothermal step, separate the suspension into its two layers: a transparent upper solution and a black lower suspension; keep the lower suspension.", "L18", "SI p. 3, §1 Experimental Procedures", "other"], ["Filter the black lower suspension through a PVDF membrane (0.1 µm pore size) and rinse it in deionized water several times.", "L18", "SI p. 3, §1 Experimental Procedures", "washing"], ["Dry the Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>-rich powder in a vacuum oven at 65 °C for 12 h.", "L18", "SI p. 3, §1 Experimental Procedures", "drying"], ["Stir 100 mg of the dried Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> powder in 5 mL of DMSO for 18 h.", "L18", "SI p. 3, §1 Experimental Procedures", "intercalation"], ["Centrifuge the resulting colloidal suspension to separate off the excess DMSO (speed and time not given).", "L18", "SI p. 3, §1 Experimental Procedures", "centrifugation"], ["Add deionized water to the residue at a Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> : water weight ratio of 1 : 500.", "L18", "SI p. 3, §1 Experimental Procedures", "delamination"], ["Bath-sonicate the suspension for 6 h.", "L18", "SI p. 3, §1 Experimental Procedures", "delamination"], ["Centrifuge at 3500 rpm (r min−1) for 60 min.", "L18", "SI p. 3, §1 Experimental Procedures", "centrifugation"], ["Collect the supernatant colloidal solution (few-layer Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>).", "L18", "SI p. 3, §1 Experimental Procedures", "colloid"], ["For the electrode, use the multilayer Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> powder from step 9 (270 °C, 27.5 M), not the colloid.", "L18", "p. 3", "film"], ["Make a pre-mixed slurry of Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>, Super-P and PTFE binder (60 wt% H<sub>2</sub>O) in ethanol (99.7 %), and press it mechanically into film electrodes.", "L18", "SI p. 3, §1 Experimental Procedures", "film"], ["Keep the final electrode composition at 80 wt% Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>, 10 wt% Super-P and 10 wt% PTFE.", "L18", "SI p. 3, §1 Experimental Procedures", "film"], ["Press electrodes ~51–108 µm thick and ~1.41–1.65 g cm−3 dense, with Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> loadings of ~8.48–15.56 mg cm−2 (range reported).", "L18", "SI p. 3, §1 Experimental Procedures", "film"], ["Press the electrodes onto Cu foam (current collector) and soak them in 1 M H<sub>2</sub>SO<sub>4</sub> for more than 12 h before measuring.", "L18", "SI p. 3, §1 Experimental Procedures", "film"], ["Test in a three-electrode cell in 1 M H<sub>2</sub>SO<sub>4</sub>: Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> working electrode, carbon-rod counter electrode, Hg/Hg2SO4 (saturated K<sub>2</sub>SO<sub>4</sub>) reference.", "L18", "SI p. 3, §1 Experimental Procedures", "other"]], "variants": [["Highest MXene content: 92 % Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> (XRD intensity ratio 0.405).", "L18", "SI p. 7, §4.2, Table S3", "270 °C, 27.5 M NaOH (reference)"], ["Lower purity: 81 % Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> (XRD intensity ratio 1.020).", "L18", "SI p. 7, §4.2, Table S3", "270 °C, 20 M NaOH"], ["More water in the solution oxidizes Ti; sodium titanates (NTOs) such as Na<sub>2</sub>Ti<sub>3</sub>O<sub>7</sub> and Na<sub>2</sub>Ti<sub>5</sub>O<sub>11</sub> form instead of MXene.", "L18", "p. 2", "270 °C, 10 M and 5 M NaOH"], ["Needle-shaped NTOs are found everywhere in SEM and TEM.", "L18", "SI p. 10, §5.5, Figure S10", "270 °C, 10 M NaOH (morphology)"], ["At 250 °C the weak Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> {002} peak disappears when NaOH is below 10 M.", "L18", "p. 2", "250 °C"], ["The MXene yield falls when the temperature drops from 270 °C to 250 °C, because the endothermic dissolution of Al (oxide) hydroxides slows.", "L18", "p. 2", "250 °C vs 270 °C"], ["No MXene at any NaOH concentration.", "L18", "p. 2", "100–220 °C"], ["Screened at 270, 250, 220, 180, 140 and 100 °C with various NaOH concentrations; Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> first appears at 250 °C and peaks at 270 °C in 27.5 M NaOH.", "L18", "SI p. 7, §4.1, Figure S4", "Temperature series"], ["Products of 24 batches fall into roughly three regions: MXene, MAX (unreacted) and NTOs.", "L18", "p. 2", "Map of 24 batches"], ["All hydrothermal treatments were run under argon to alleviate sample oxidation.", "L18", "p. 2", "Argon atmosphere"], ["Removing the oxide cover with 10 wt% HF (room temperature, 30 min) and then treating in 1 M NaOH left most of the Ti<sub>3</sub>AlC<sub>2</sub> unreacted.", "L18", "SI p. 4, §3.1, Figure S3", "HF pre-cleaning, then 1 M NaOH"], ["Temperature is the key factor for whether Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> forms; NaOH concentration affects its purity.", "L18", "p. 2", "Rule of thumb"]], "equations": [["Ti<sub>3</sub>AlC<sub>2</sub> + OH<sup>−</sup> + 5 H<sub>2</sub>O → Ti<sub>3</sub>C<sub>2</sub>(OH)<sub>2</sub> + Al(OH)<sub>4</sub><sup>−</sup> + 2.5 H<sub>2</sub>", "L18", "SI p. 5, §3.2.1"], ["Ti<sub>3</sub>AlC<sub>2</sub> + OH<sup>−</sup> + 5 H<sub>2</sub>O → Ti<sub>3</sub>C<sub>2</sub>O<sub>2</sub> + Al(OH)<sub>4</sub><sup>−</sup> + 7/2 H<sub>2</sub>", "L18", "SI p. 5, §3.2.1"], ["Al(OH)<sub>3</sub> (gibbsite) + OH<sup>−</sup> → Al(OH)<sub>4</sub><sup>−</sup>", "L18", "SI p. 6, §3.2.2"], ["AlO(OH) (boehmite, γ-AlO(OH)) + OH<sup>−</sup> + H<sub>2</sub>O → Al(OH)<sub>4</sub><sup>−</sup>", "L18", "SI p. 6, §3.2.2"], ["AlO(OH) (diaspore, α-AlO(OH)) + OH<sup>−</sup> + H<sub>2</sub>O → Al(OH)<sub>4</sub><sup>−</sup>", "L18", "SI p. 6, §3.2.2"]], "explanation": [["Alkali binds strongly to the amphoteric element Al (stability constants: Al(OH)<sub>4</sub><sup>−</sup>, lg β4 = 33.3; AlF<sub>6</sub>^3−, lg β6 = 19.84), so in theory alkali is a feasible etchant for Ti<sub>3</sub>AlC<sub>2</sub>.", "L18", "p. 1"], ["Thermodynamically, Ti<sub>3</sub>AlC<sub>2</sub> can react with OH<sup>−</sup> even at standard conditions.", "L18", "p. 1"], ["Yet no MXene formed at low temperatures, so the reaction is held back by dynamical (kinetic) factors; insoluble Al (oxide) hydroxides are named as the most likely cause.", "L18", "SI p. 6, §3.2.1"], ["The difficulty is kinetic and could be attributed to oxide/hydroxide layers forming on the Ti<sub>3</sub>AlC<sub>2</sub> surface.", "L18", "p. 1"], ["Even after the existing oxide cover was removed with 10 wt% HF, the NaOH yield stayed very low.", "L18", "p. 1"], ["This suggests that new Al (oxide) hydroxide layers (Al(OH)<sub>3</sub>, AlO(OH)) forming during the alkali exposure might further hinder the Al extraction, so these protective layers must be cleaned away.", "L18", "p. 1"], ["OH<sup>−</sup> attacks the Al layers in two steps: Al is oxidized to Al (oxide) hydroxides, which then dissolve in the alkali.", "L18", "p. 2"], ["Outer Al atoms dissolve as soluble Al(OH)<sub>4</sub><sup>−</sup>; the exposed Ti and Al atoms are left terminated by OH or O.", "L18", "p. 2"]], "terminations": [["The product is Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> with OH and O terminations.", "L18", "p. 2"], ["Mechanism: when outer Al dissolves, the exposed Ti and Al atoms are terminated by OH or O.", "L18", "p. 2"], ["XPS: Ti–O signals grow (from C–Ti–OH, C–Ti–O and TiO<sub>2</sub>).", "L18", "p. 3"], ["XPS O 1s fitting: the surface is mainly OH<sup>−</sup> and O-terminated.", "L18", "p. 3"], ["Raman and IR together: OH and O terminations, with the surface partly oxidized to TiO<sub>2</sub>.", "L18", "p. 3"]], "product": [["TEM: nonuniform interlayer spacing of about 1.2 nm (Ti<sub>3</sub>AlC<sub>2</sub> ca. 0.93 nm), similar to Na-intercalated HF-Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>.", "L18", "p. 3"], ["About 92 wt% purity: OH<sup>−</sup> and O-terminated multilayer Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> after 27.5 M NaOH at 270 °C.", "L18", "p. 2"], ["Because XRD shows no significant TiO<sub>2</sub> peaks, the authors suppose the product is mostly Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> plus unreacted Ti<sub>3</sub>AlC<sub>2</sub>, and estimate about 70–80 mg of NaOH–Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> per 100 mg of MAX phase.", "L18", "SI p. 3, §1 Experimental Procedures"], ["About 80–90 mg of a Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> + Ti<sub>3</sub>AlC<sub>2</sub> + TiO<sub>2</sub> mixture is recovered from 100 mg Ti<sub>3</sub>AlC<sub>2</sub>.", "L18", "SI p. 3, §1 Experimental Procedures"], ["Al is almost gone and C is kept: XRF Ti : Al : C ≈ 3 : 0.02 : 2.", "L18", "SI p. 8, §5.1"], ["ICP: Al/Ti weight ratio falls from 0.25 to 0.03 and Na/Ti rises from 0.001 to 0.10.", "L18", "SI p. 8, §5.1"], ["EDS: Ti, C, O and Na spread uniformly on the flakes, with only slight Al, so most Al layers were removed.", "L18", "p. 3"], ["Morphology: a compact layered structure, not the accordion-like form made by 50 wt% HF; it resembles Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> made with 5 wt% HF.", "L18", "p. 3"]], "safety": [["The route avoids HF, which the authors call highly corrosive.", "L18", "p. 1"], ["Background: hydrofluoric acid is a dangerous chemical that must be handled with extreme care.", "N21", "p. 2"], ["HF-based etching is also described as environmentally harmful.", "L18", "p. 1"], ["The industrial process this route copies (Bayer) digests bauxite with concentrated NaOH at elevated temperature and high pressure.", "L18", "p. 2"], ["In the authors' reaction equations, hydrogen gas (H<sub>2</sub>) is a product of the etching reaction.", "L18", "SI p. 5, §3.2.1"]], "flow": [["Ti<sub>3</sub>AlC<sub>2</sub> powder", "100 mg commercial MAX phase, carries some Al<sub>2</sub>O<sub>3</sub>"], ["NaOH in boiled water", "Water boiled 30 min under Ar; 27.5 M NaOH"], ["Hydrothermal etching, 270 °C", "Sealed Ar-filled 50 mL autoclave, 12 h"], ["Separate, filter, rinse", "Black lower layer on 0.1 µm PVDF, water rinses"], ["Vacuum dry at 65 °C", "12 h; multilayer Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>, about 92 wt%"], ["DMSO intercalation", "100 mg in 5 mL DMSO, stirred 18 h"], ["Sonicate in water", "Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> : water 1 : 500, bath, 6 h"], ["Centrifuge, keep supernatant", "3500 rpm, 60 min; few-layer flake colloid"], ["Pressed film electrode", "Multilayer powder, Super-P, PTFE 80:10:10 on Cu foam"]], "mech": {"a": "Al", "from": "Ti₃AlC₂", "agent": "27.5 M NaOH, 270 °C", "out": "Al(OH)₄⁻ (dissolved)", "tx": ["O", "O"], "to": "Ti₃C₂Tₓ (T = OH, O)", "alt": "Ti3AlC2 layers with Al between them react with hot concentrated NaOH; the Al ends up dissolved as aluminate and the Ti3C2 surfaces carry OH and O groups.", "cap": "Hydroxide removes the Al, which ends up in the solution as aluminate, Al(OH)<sub>4</sub><sup>−</sup>; the surfaces carry –OH and –O (Li et al. 2018, Supporting Information §3)."}};
  MK_BY["naoh"].plain = ["Ti<sub>3</sub>AlC<sub>2</sub> is a MAX phase: layers of titanium carbide stacked with layers of aluminium atoms in between. {L18} In MAX phases the metal–A bonds (here Ti–Al) are usually weaker than the metal–carbon bonds, so the A layers (here Al) can be removed selectively. {L18} Alkali binds strongly to aluminium, an amphoteric element, so in theory an alkali such as NaOH can act as the etchant. {L18}", "Hydroxide ions attack the Al layers in two stages: first Al turns into Al (oxide) hydroxides, then these dissolve in the alkali. {L18} Al at the surface leaves as dissolved aluminate, Al(OH)<sub>4</sub><sup>−</sup>, and the exposed Ti and Al atoms are capped by OH or O groups. {L18} Deeper inside, newly formed Al(OH)<sub>3</sub> and AlO(OH) are confined by the Ti layers and cannot readily react on to dissolved Al(OH)<sub>4</sub><sup>−</sup>; this jamming effect blocks MXene formation and must be eliminated. {L18}", "After 12 h the mixture separates into a clear upper liquid and a black lower suspension. {L18} The clear liquid holds the removed aluminium; because its pH is far above 10, the aluminium should be present as aluminate, Al(OH)<sub>4</sub><sup>−</sup>. {L18} The black solid is caught on a fine PVDF filter (0.1 µm pores) and rinsed several times with deionized water. {L18}", "The authors suppose that the dried powder is mostly MXene plus some MAX phase that did not react (about 70–80 mg of MXene per 100 mg of MAX phase, estimated). {L18} Aluminium is almost gone while carbon stays: Ti : Al : C ≈ 3 : 0.02 : 2. {L18} The layers stay as a compact stack, not the open 'accordion' made by strong HF. {L18}", "The multilayer powder is stirred in DMSO, which acts as the intercalation agent that goes in between the layers. {L18} In HF-etched MXene multilayers the sheets are held together by a mixture of hydrogen and van der Waals bonds; unlike in the MAX phase, these secondary bonds allow intercalation between the layers (review, Naguib et al. 2021). {N21} The authors expect larger and thinner flakes if the ion exchange between alkali-metal ions and the intercalation agent is pushed further. {L18}", "The DMSO-treated solid is diluted with lots of water (1 part MXene to 500 parts water by weight). {L18} The suspension is bath-sonicated for 6 h. {L18} In general (review, Naguib et al. 2021), DMSO intercalation followed by sonication gives a colloidal solution of delaminated Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> in water. {N21}", "A first spin separates off the excess DMSO. {L18} A second spin at 3500 rpm for 60 min leaves a colloid on top (the supernatant), which is collected. {L18}", "The collected liquid holds few-layer Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>: stacks about 8–25 nm thick made of small flakes about 80–200 nm wide. {L18} These flakes are similar to few-layer flakes made from HF-etched Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>. {L18} In general, MXenes are hydrophilic and disperse easily in water without any surfactant. {N21}", "The electrode is made from the multilayer powder, not from the colloid: Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> is mixed with conductive carbon (Super-P) and PTFE binder. {L18} The pre-mixed slurry is mechanically pressed into film electrodes. {L18} Recipe: 80 % MXene, 10 % Super-P, 10 % PTFE by weight. {L18}"];
  MK_BY["naoh"].scene.caps = {"0": [[0, "MAX phase Ti₃AlC₂: titanium carbide layers with layers of Al atoms in between"]], "1": [[0, "Hot (270 °C), very concentrated NaOH attacks the Al layers"], [0.3, "The Al dissolves as aluminate, Al(OH)₄⁻, as in the Bayer process"], [0.68, "The exposed surfaces are capped by –OH and –O"]], "2": [[0, "The black solid is filtered off and rinsed several times with water"]], "3": [[0, "A compact stack, not an accordion; TEM shows a nonuniform layer spacing of about 1.2 nm"]], "4": [[0, "DMSO goes in between the layers"]], "5": [[0, "Diluted with water and bath-sonicated for 6 h, the sheets separate"]], "6": [[0, "A spin at 3500 rpm for 60 min"], [0.45, "The colloid stays on top and is collected"]], "7": [[0, "Few-layer flakes, about 80–200 nm wide, dispersed in water"]]};
  MK_DOC["echem"] = {"title": "Electrochemical etching of bulk Ti<sub>3</sub>AlC<sub>2</sub> in NH<sub>4</sub>Cl + TMAOH", "basis": "protocol: Yang et al., <i>Angew. Chem. Int. Ed.</i> 2018 (main text and Supporting Information)", "teaser": "A step-by-step protocol for the fluoride-free electrochemical route of Yang et al. 2018, from a bulk Ti<sub>3</sub>AlC<sub>2</sub> anode to single-layer flakes and a filtered film, with the reactions the paper proposes and what the chloride and the base each do. Every line cites the page it comes from.", "summary": [["Instead of HF or fluoride salts, Ti<sub>3</sub>AlC<sub>2</sub> is made the anode of an electrochemical cell, and its Al is etched away (anodic corrosion) in a water-based electrolyte with two components.", "Y18", "p. 1"], ["The electrolyte is 1.0 M ammonium chloride (NH<sub>4</sub>Cl) plus 0.2 M tetramethylammonium hydroxide (TMAOH), pH &gt; 9.", "Y18", "SI p. S1, Experimental: Electrochemical Etching"], ["Chloride ions drive the rapid anodic removal of Al and break the Ti–Al bonds.", "Y18", "p. 1"], ["Intercalation of ammonium hydroxide (NH<sub>4</sub>OH) between the layers opens the edges of the etched anode, so etching can continue below the surface.", "Y18", "p. 1"]], "materials": [["Bulk Ti<sub>3</sub>AlC<sub>2</sub> (purity 98 %, density 3.44 g cm−3), purchased from Forsman Scientific (Beijing) Co. Ltd.", "Y18", "SI p. S1, Experimental: Electrochemical Etching"], ["Ammonium chloride (NH<sub>4</sub>Cl), 1.0 M, and tetramethylammonium hydroxide (TMAOH), 0.2 M, in water (etching electrolyte, pH &gt; 9).", "Y18", "SI p. S1, Experimental: Electrochemical Etching"], ["Porous plastic gauze to wrap the anode.", "Y18", "SI p. S1, Experimental: Electrochemical Etching"], ["Magnetic stirrer (300 rpm) for the electrolyte; a constant +5.0 V potential source.", "Y18", "SI p. S1, Experimental: Electrochemical Etching"], ["Deionized water for washing.", "Y18", "SI p. S1, Experimental: Delamination"], ["25 wt% TMAOH solution (30 mL per 1 g of washed solid) for delamination.", "Y18", "SI p. S1, Experimental: Delamination"], ["Centrifuge (5000 rpm and 2000 rpm steps; see procedure steps 12 and 15).", "Y18", "SI p. S1, Experimental: Delamination"], ["Ultrasonicator (140 W), degassed water and a continuous argon flow.", "Y18", "SI p. S1, Experimental: Delamination"], ["Vacuum filtration set-up with PTFE membrane (0.2 μm, 47 mm).", "Y18", "SI p. S2, Experimental: All-solid-state supercapacitors, ASSSs"], ["Flexible gold-coated PET film (Ti/Au: 5 nm/80 nm) as electrode support.", "Y18", "SI p. S2, Experimental: All-solid-state supercapacitors, ASSSs"]], "precursor": [["Bulk Ti<sub>3</sub>AlC<sub>2</sub>, 98 % purity, density 3.44 g cm−3, bought from Forsman Scientific (Beijing).", "Y18", "SI p. S1, Experimental: Electrochemical Etching"], ["The large lump is cut into pieces of ca. 1 cm × 3 cm × 0.5 cm (ca. 5.0 g) and rinsed with deionized water to remove adsorbed powder.", "Y18", "SI p. S1, Experimental: Electrochemical Etching"], ["Figure 1c of the paper shows the as-received bulk Ti<sub>3</sub>AlC<sub>2</sub>.", "Y18", "p. 2"], ["Drexel University supplied bulk Ti<sub>3</sub>AlC<sub>2</sub> for the initial tests (acknowledgements).", "Y18", "p. 4"], ["In the DFT model, Ti<sub>3</sub>AlC<sub>2</sub> is one layer of Al atoms sandwiched between two Ti<sub>3</sub>C<sub>2</sub> layers.", "Y18", "p. 3"]], "procedure": [["Cut the bulk Ti<sub>3</sub>AlC<sub>2</sub> lump into small pieces of ca. 1 cm × 3 cm × 0.5 cm (ca. 5.0 g) and rinse them carefully with deionized water to remove adsorbed powder.", "Y18", "SI p. S1, Experimental: Electrochemical Etching", "cell"], ["Set up a two-electrode cell from two pieces of bulk Ti<sub>3</sub>AlC<sub>2</sub>: one is the working electrode (anode), the other the counter electrode (cathode).", "Y18", "SI p. S1, Experimental: Electrochemical Etching", "cell"], ["Place the two electrodes parallel to each other at a constant distance of 2.0 cm.", "Y18", "SI p. S1, Experimental: Electrochemical Etching", "cell"], ["Wrap the anode in a porous plastic gauze so that bulk Ti<sub>3</sub>AlC<sub>2</sub> cannot fall off during etching.", "Y18", "SI p. S1, Experimental: Electrochemical Etching", "cell"], ["Fill the cell with the aqueous electrolyte: 1.0 M NH<sub>4</sub>Cl + 0.2 M TMAOH (pH &gt; 9).", "Y18", "SI p. S1, Experimental: Electrochemical Etching", "cell"], ["Apply a constant potential of +5.0 V and keep the electrolyte under magnetic stirring (300 rpm) at room temperature.", "Y18", "SI p. S1, Experimental: Electrochemical Etching", "etching"], ["Etch for 5 h. The electrolyte turns grey-white with a suspended gelatinous precipitate; black powders and fragments (stacked Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>) collect at the bottom of the reactor.", "Y18", "SI p. S1, Experimental: Electrochemical Etching", "etching"], ["Carefully collect the black sediment and grind it.", "Y18", "SI p. S1, Experimental: Delamination", "other"], ["Wash the ground solid with deionized water three times, until the pH of the supernatant reaches 7.", "Y18", "SI p. S1, Experimental: Delamination", "washing"], ["Transfer 1 g of the washed solid into 30 mL of 25 wt% TMAOH solution.", "Y18", "SI p. S1, Experimental: Delamination", "delamination"], ["Stir for 12 h at room temperature (constant stirring, 300 rpm).", "Y18", "SI p. S1, Experimental: Delamination", "delamination"], ["Centrifuge at 5000 rpm for 10 min and discard the dark brown solution.", "Y18", "SI p. S1, Experimental: Delamination", "centrifugation"], ["Wash the sediment with an excess of deionized water to remove residual salts.", "Y18", "SI p. S1, Experimental: Delamination", "washing"], ["Disperse the powder in degassed water by ultrasonication (140 W, 1 h) while pumping a continuous argon flow.", "Y18", "SI p. S1, Experimental: Delamination", "delamination"], ["Centrifuge the dispersion at 2000 rpm for 30 min to remove unexfoliated particles and thick layered flakes.", "Y18", "SI p. S1, Experimental: Delamination", "centrifugation"], ["Decant the supernatant; this is the delaminated Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> dispersion used for further characterisation.", "Y18", "SI p. S1, Experimental: Delamination", "colloid"], ["Vacuum-filter the aqueous Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> suspension (~1 mg mL−1) onto a PTFE membrane (0.2 μm, 47 mm) to form a thin MXene film.", "Y18", "SI p. S2, Experimental: All-solid-state supercapacitors, ASSSs", "film"], ["Transfer the still-moist film directly onto a flexible gold-coated PET film (Ti/Au: 5 nm/80 nm), which serves as the electrode.", "Y18", "SI p. S2, Experimental: All-solid-state supercapacitors, ASSSs", "film"], ["For the supercapacitor, prepare the PVA/H<sub>2</sub>SO<sub>4</sub> electrolyte: mix 6 g PVA (molecular weight 85,000–124,000) and 6 g H<sub>2</sub>SO<sub>4</sub> in 60 mL deionized water and heat at 85 °C until the solution is clear.", "Y18", "SI p. S2, Experimental: All-solid-state supercapacitors, ASSSs", "other"], ["Assemble the all-solid-state supercapacitor: separate two flexible MXene electrodes with a separator and the PVA/H<sub>2</sub>SO<sub>4</sub> electrolyte.", "Y18", "SI p. S2, Experimental: All-solid-state supercapacitors, ASSSs", "other"]], "variants": [["Several aqueous electrolytes were tested while looking for a suitable one: sulfuric acid, nitric acid, sodium hydroxide, ammonium chloride and ferric chloride.", "Y18", "p. 1", "Single electrolytes screened: H<sub>2</sub>SO<sub>4</sub>, HNO<sub>3</sub>, NaOH, NH<sub>4</sub>Cl, FeCl<sub>3</sub>"], ["Although they etch Al foils well, conventional acids/bases failed to etch the atomically thin Al layers out of Ti<sub>3</sub>AlC<sub>2</sub>, mostly because of kinetic problems.", "Y18", "p. 1", "Conventional acids/bases"], ["With chloride-containing electrolytes the etching reactions occur preferentially at the surfaces, as in the earlier HCl study.", "Y18", "p. 2", "Chloride-containing electrolytes alone"], ["Etching was still incomplete after 10 hours.", "Y18", "p. 2", "Hydroxide concentration &lt; 0.1 M"], ["Only amorphous carbon was obtained, after a short time.", "Y18", "p. 2", "Hydroxide concentration &gt; 0.5 M"], ["SEM shows an amorphous structure after 1 hour of etching in this electrolyte.", "Y18", "SI p. S5, Figure S3/S4 captions and text below Figure S4", "1.0 M NH<sub>4</sub>Cl + 0.5 M TMAOH, 1 h (SI Figure S<sub>3</sub>)"], ["Etching was efficient and complete within 5 hours.", "Y18", "p. 2", "Hydroxide concentration = 0.2 M (the recipe used)"], ["Both Ti and Al atoms were removed, leaving amorphous carbon.", "Y18", "p. 1", "Earlier work: anodic etching in dilute NaCl, HCl or HF (Yang et al. 2018 ref. 12)"], ["Al was extracted selectively, but only from the outer surfaces of bulk Ti<sub>3</sub>AlC<sub>2</sub>.", "Y18", "p. 1", "Earlier work: 2 M HCl, +0.6 V, 5 days (Yang et al. 2018 ref. 13)"], ["By recycling the used sediments, at least 60 % of the bulk material can be converted into Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>.", "Y18", "p. 2", "Recycling the used sediments"]], "equations": [["Ti<sub>3</sub>AlC<sub>2</sub> − 3 e− + 3 Cl<sup>−</sup> = Ti<sub>3</sub>C<sub>2</sub> + AlCl<sub>3</sub>", "Y18", "p. 2"], ["Ti<sub>3</sub>C<sub>2</sub> + 2 OH<sup>−</sup> − 2 e− = Ti<sub>3</sub>C<sub>2</sub>(OH)<sub>2</sub>", "Y18", "p. 2"], ["Ti<sub>3</sub>C<sub>2</sub> + 2 H<sub>2</sub>O = Ti<sub>3</sub>C<sub>2</sub>(OH)<sub>2</sub> + H<sub>2</sub>", "Y18", "p. 2"], ["AlCl<sub>3</sub> + 3 NH<sub>3</sub> + 2 H<sub>2</sub>O ↔ AlO(OH) + 3 NH<sub>4</sub><sup>+</sup> + 3 Cl<sup>−</sup>", "Y18", "p. 2"], ["AlCl<sub>3</sub> + 2 OH<sup>−</sup> ↔ AlO(OH) + H<sup>+</sup> + 3 Cl<sup>−</sup>", "Y18", "p. 2"]], "explanation": [["Only the anode is etched; the second Ti<sub>3</sub>AlC<sub>2</sub> piece (the cathode) only serves as the counter electrode.", "Y18", "p. 1"], ["Although 5 V is applied across the cell, the actual working bias on the anode is +2.48 V vs. SCE.", "Y18", "p. 2"], ["Chloride (Cl<sup>−</sup>) is the etching agent: chloride ions enable rapid anodic Al etching and break the Ti–Al bonds.", "Y18", "p. 1"], ["Chloride-containing electrolytes etch because Cl<sup>−</sup> binds strongly to Al.", "Y18", "p. 2"], ["At the anode, chloride is hardly discharged (negligible) because it competes with the dissolution of Al.", "Y18", "p. 2"], ["Reaction (1) removes the Al layers from the Ti<sub>3</sub>AlC<sub>2</sub> anode (Al leaves as AlCl<sub>3</sub>).", "Y18", "p. 2"], ["Reactions (2) and (3) then put –OH terminations on the Ti<sub>3</sub>C<sub>2</sub> surfaces.", "Y18", "p. 2"], ["Limitation of chloride alone: the etching reactions occur preferentially at the surfaces.", "Y18", "p. 2"]], "terminations": [["Terminations are O and OH only; the flakes contain no fluorine terminations.", "Y18", "p. 1"], ["Reactions (2) and (3) produce –OH terminations on Ti<sub>3</sub>C<sub>2</sub>.", "Y18", "p. 2"], ["The hydroxyl groups come from nucleophilic attack by surrounding OH<sup>−</sup> anions.", "Y18", "p. 3"], ["XPS (C 1s, Ti 2p) shows C–O and Ti–O bonds from the surface groups.", "Y18", "p. 3"], ["Chloride content is negligible (SI Figure S<sub>11</sub>), probably because chloride atoms prefer to attach to the boundaries.", "Y18", "p. 3"]], "product": [["After etching: black powders and fragments of stacked Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> at the bottom of the reactor.", "Y18", "SI p. S1, Experimental: Electrochemical Etching"], ["Multilayer Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> stays tightly stacked like bulk Ti<sub>3</sub>AlC<sub>2</sub>, without the accordion-like structure of HF-etched samples.", "Y18", "p. 2"], ["XRD: the (002) peak moves from 2θ = 9.8° to 7.8°, i.e. the c lattice parameter grows from 18.0 to 22.6 Å (new surface groups plus intercalated NH<sub>4</sub>OH).", "Y18", "p. 2"], ["TEM: interlayer distance grows from (17 ± 0.8) Å in Ti<sub>3</sub>AlC<sub>2</sub> to (21 ± 2.5) Å in Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>.", "Y18", "p. 2"], ["After TMAOH delamination the out-of-plane order is lost: the most intense (104) peak at 2θ = 39° vanishes.", "Y18", "p. 2"], ["XPS shows no Al peak, attributed to complete etching.", "Y18", "p. 3"], ["Colloid: 0.15 mg mL−1 aqueous dispersion with a clear Tyndall effect and zeta potential of −37.9 mV.", "Y18", "p. 2"], ["This zeta potential is comparable to HF-etched Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> (−34.7 mV).", "Y18", "p. 2"]], "safety": [["The motivation: established routes need hazardous HF or fluoride-based compounds.", "Y18", "p. 1"], ["Fluoride routes produce highly toxic liquid waste.", "Y18", "p. 1"], ["This method needs no dangerous fluoride-containing agents and no harsh etching conditions.", "Y18", "p. 4"], ["Etching runs at room temperature / ambient conditions.", "Y18", "p. 1"], ["Practical point: wrap the anode in porous plastic gauze so bulk Ti<sub>3</sub>AlC<sub>2</sub> does not fall off during etching.", "Y18", "SI p. S1, Experimental: Electrochemical Etching"], ["Background: HF is a very good Al etchant but very corrosive and a severe health risk.", "V21", "p. 6"]], "flow": [["Cut and rinse bulk Ti<sub>3</sub>AlC<sub>2</sub>", "ca. 1×3×0.5 cm pieces, ca. 5 g; water rinse"], ["Build two-electrode cell", "Ti<sub>3</sub>AlC<sub>2</sub> anode and cathode, 2.0 cm apart; gauze-wrapped anode"], ["Anodic etching at +5 V", "1 M NH<sub>4</sub>Cl + 0.2 M TMAOH (pH &gt; 9), 5 h"], ["Collect, grind, wash to pH 7", "Black sediment; three deionized-water washes"], ["Delaminate in 25 wt% TMAOH", "1 g in 30 mL; 12 h stirring, room temperature"], ["Centrifuge and wash", "5000 rpm, 10 min; discard brown liquid; wash out salts"], ["Sonicate under argon", "Degassed water, 140 W, 1 h"], ["Centrifuge, keep supernatant", "2000 rpm, 30 min removes unexfoliated particles and thick flakes"], ["Vacuum-filter into film", "~1 mg/mL onto PTFE membrane; transfer to Au-coated PET"], ["Assemble supercapacitor", "Two MXene electrodes, separator, PVA/H<sub>2</sub>SO<sub>4</sub> electrolyte"]], "mech": {"a": "Al", "from": "Ti₃AlC₂ (anode)", "agent": "+5 V, NH₄Cl + TMAOH", "out": "AlCl₃ → AlO(OH)", "tx": ["O", "O"], "to": "Ti₃C₂Tₓ (T = O, OH)", "alt": "At the anode, chloride ions remove the Al from Ti3AlC2 as AlCl3; hydroxide gives OH terminations and the AlCl3 turns into AlO(OH).", "cap": "Equations (1)–(5) proposed by Yang et al. 2018 (p. 2): chloride removes the Al as AlCl<sub>3</sub> at the anode, hydroxide or water gives –OH terminations, and the AlCl<sub>3</sub> is proposed to turn into AlO(OH)."}};
  MK_BY["echem"].plain = ["The starting material is a solid piece of the MAX phase Ti<sub>3</sub>AlC<sub>2</sub>, not a powder. The lump is cut into pieces about 1 × 3 × 0.5 cm (about 5 g). {Y18} In the paper's computer (DFT) model, Ti<sub>3</sub>AlC<sub>2</sub> is one layer of aluminium atoms sandwiched between two Ti<sub>3</sub>C<sub>2</sub> layers. {Y18} The paper's DFT bonding analysis (electron localisation function) finds Ti–C bonds very strong (ELF 0.8–0.9) and Ti–Al bonds relatively weak (ELF 0.4–0.6). {Y18}", "The Ti<sub>3</sub>AlC<sub>2</sub> piece is the positive electrode (anode) of a two-electrode cell. A second Ti<sub>3</sub>AlC<sub>2</sub> piece is the counter electrode and is not etched. {Y18} A computer (DFT) simulation shows how: when the anode is positively charged, chloride ions attack its exposed edges and pull aluminium out as AlCl<sub>3</sub>. {Y18} Chloride works because it binds strongly to aluminium. {Y18}", "The black sediment at the bottom of the cell is collected, ground, and washed with deionized water three times until the water above it reaches pH 7. {Y18} This washing starts from a basic electrolyte (pH above 9). {Y18}", "The etched solid is now multilayer Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub>. Unlike HF-etched MXene it does not puff up into an accordion shape; it stays tightly stacked, like the original MAX phase. {Y18} The authors think this is because the conditions are mild, with no violent gas release. {Y18} Not seeing the accordion shape does not necessarily mean etching failed (background, review). {V21}", "Intercalation is not a separate step here: the paper states, citing earlier work, that Al etching and the intercalation of ammonium species take place simultaneously. {Y18} The paper calls this the in situ intercalation of ammonium hydroxide, which follows the dissolution of aluminium and leads to the extraction of the carbide flakes. {Y18} Why it is needed: with chloride alone, etching happens preferentially at the surfaces. Cations entering the etched anode expand the interlayer spacing so the electrolyte ions can diffuse inside. {Y18}", "The washed powder is stirred for 12 hours in concentrated (25 wt%) TMAOH. {Y18} The positively charged TMA+ ions weaken the attraction between the 2D layers. This is the key step for separating single sheets. {Y18} X-ray diffraction confirms the layers lose their regular stacking after this treatment. {Y18}", "A first spin (5000 rpm, 10 min) separates the solid from the dark-brown solution, which is thrown away. {Y18} The solid is then washed with plenty of deionized water to remove leftover salts. {Y18} After sonication, a gentler spin (2000 rpm, 30 min) makes un-exfoliated particles and thick flakes sink. {Y18}", "The supernatant is a colloidal dispersion of separated Ti<sub>3</sub>C<sub>2</sub>T<sub>x</sub> sheets: it shows a clear Tyndall effect and has a zeta potential of −37.9 mV. {Y18} For comparison, a review notes that delaminated MXenes from wet chemical etching, with their anionic surface terminations, have zeta potentials below −30 mV and form stable colloids. {V21} Most flakes (over 90 % of the more than 50 measured by AFM) are about 1.2 nm thick, i.e. single layers. {Y18}", "Pulling the dispersion (~1 mg/mL) through a PTFE membrane by vacuum filtration stacks the flakes into a thin film. {Y18} These stacked films conduct electricity well (1330 ± 110 S/cm), close to films from the LiF/HCl route. {Y18} The moist film is moved onto gold-coated plastic (PET) and used as a supercapacitor electrode. {Y18}"];
  MK_BY["echem"].scene.caps = {"0": [[0, "A solid piece of Ti₃AlC₂ is the anode (+) of an electrochemical cell"]], "1": [[0, "At +5 V, chloride ions attack the anode and pull the Al out as AlCl₃"], [0.4, "Ammonium species slip in between the layers and open the edges"], [0.68, "The surfaces carry –O and –OH, no fluorine"]], "2": [[0, "The black sediment is washed with water until pH 7"]], "3": [[0, "Multilayer Ti₃C₂Tₓ stays tightly stacked: no accordion"], [0.5, "Yet the layers moved apart: c grows from 18.0 to 22.6 Å"]], "4": [[0, "In 25 wt % TMAOH, TMA⁺ ions weaken the attraction between the layers"]], "5": [[0, "Sonication in degassed water under argon disperses the sheets"]], "6": [[0, "A gentle spin: 2000 rpm, 30 min"], [0.45, "Unexfoliated particles sink; the flakes stay in the liquid"]], "7": [[0, "Over 90 % of the flakes measured are single layers, about 1.2 nm thick"], [0.5, "The colloid shows the Tyndall effect"]], "8": [[0, "Vacuum filtration stacks the flakes into a thin film on a PTFE membrane"]]};
  // ---- /MK_DOC
  function renderMake(id) {
    detachViewer();
    var m = (Object.prototype.hasOwnProperty.call(MK_BY, id) && MK_BY[id]) || MK_METHODS[0];
    if (id !== m.id) history.replaceState(null, '', '#/make/' + m.id);
    app.innerHTML =
      '<section class="card mk-head"><div class="step-h"><span class="k">Synthesis</span><h2>See how MXenes are made</h2></div>' +
      '<p>Experimental routes from a MAX phase to MXene flakes and films, step by step. Pick a route; every condition shown comes from the paper cited next to it.</p>' +
      '<div class="mk-methods" role="group" aria-label="Synthesis route">' + MK_METHODS.map(function (x) {
        return '<button type="button" class="mk-m" data-m="' + x.id + '" aria-pressed="false"><span class="mk-mn">' + x.name + '</span>' +
          '<span class="mk-me">' + x.etch + '</span><span class="mk-ms">' + x.from.map(function (k) { return esc(MK_SRC[k][0]); }).join(' · ') + '</span></button>';
      }).join('') + '</div></section>' +
      '<section class="card mk-sim"><div class="mk-route" id="mk-route"></div>' +
      '<div class="mk-stage" id="mk-stage" role="img"><canvas id="mk-cv"></canvas><p class="mk-flow" id="mk-flow"></p>' +
      '<p class="mk-cap" id="mk-cap" hidden></p><p class="mk-key" id="mk-key"></p></div>' +
      '<div class="mk-prog" id="mk-prog" aria-hidden="true"></div>' +
      '<div class="mk-seg" role="group" aria-label="Animation"><button type="button" class="mk-btn mk-run" id="mk-run">Run</button>' +
      '<button type="button" class="mk-btn" id="mk-step">Step</button><button type="button" class="mk-btn" id="mk-reset">Reset</button></div>' +
      '<div class="mk-speed" role="group" aria-label="Animation speed"><span class="mk-speed-l" aria-hidden="true">Speed</span>' + MK_SPEEDS.map(function (sp) {
        return '<button type="button" class="mk-sp" data-f="' + sp[1] + '" aria-pressed="false">' + sp[0] + '</button>'; }).join('') + '</div>' +
      '<p class="mk-status" id="mk-status" aria-live="polite"></p><div class="mk-now" id="mk-now"></div>' +
      '<ol class="mk-steps" id="mk-steps" aria-label="The steps of this route"></ol><p class="mk-fewer muted small" id="mk-fewer" hidden></p>' +
      '<p class="mk-note">Interactive illustration, not a simulation — atoms are not to scale, times are compressed and the mix of terminations is drawn schematically. Every condition and number comes from the paper cited next to it.</p></section>' +
      '<section class="card mk-proc" id="mk-proc" hidden></section>' +
      '<section class="card mk-card" id="mk-card"></section><section class="card mk-refs" id="mk-refs"></section>' +
      '<div class="sp-actions"><a class="btn2 prev" href="#/"><span class="ico" aria-hidden="true">←</span> Back to the library</a></div>';
    var $ = function (i) { return document.getElementById(i); };
    var stage = $('mk-stage'), E = mkEngine($('mk-cv'));
    var C = { k: 0, t: 1, running: false, anim: false, raf: 0, timer: 0, last: 0, frames: 0, f: 1 };
    try { var sf = +window.localStorage.getItem('mxlib-make-speed'); if (MK_SPEEDS.some(function (x) { return x[1] === sf; })) C.f = sf; } catch (e) { /* no storage */ }
    var vis = [];                                        // the steps this route has; a step it lacks is not shown at all
    var pos = function (k) { return vis.indexOf(k); };
    var last = function () { return vis[vis.length - 1]; };
    var next = function (k) { var i = pos(k); return vis[Math.min(vis.length - 1, i + 1)]; };

    function caption() {                                 // the line under the scene: what is happening now
      var caps = (m.scene.caps || {})[C.k] || [], s = '';
      caps.forEach(function (c) { if (C.t >= c[0]) s = c[1]; });
      var el = $('mk-cap'); el.hidden = !s; put(el, s);
    }
    function frame(now) {
      C.raf = 0;
      if (!C.anim) return;
      var dt = C.last ? Math.min(100, now - C.last) : 16; C.last = now;
      C.t = Math.min(1, C.t + dt / (MK_DUR[C.k] * C.f));
      E.draw(C.k, C.t); C.frames++; caption();
      if (C.t >= 1) { C.anim = false; done(); } else C.raf = requestAnimationFrame(frame);
    }
    function halt() { if (C.raf) cancelAnimationFrame(C.raf); if (C.timer) clearTimeout(C.timer); C.raf = C.timer = 0; C.anim = false; }
    function play(k) {                                   // step k from its start (reduced motion: at once)
      halt(); C.k = k;
      if (mkStill()) { C.t = 1; E.draw(k, 1); C.frames++; done(); return; }
      C.t = 0; C.anim = true; C.last = 0; ui(); C.raf = requestAnimationFrame(frame);
    }
    function done() {
      if (C.running && C.k === last()) C.running = false;
      ui();
      if (!C.running) return;
      C.timer = setTimeout(function () { C.timer = 0; if (C.running) play(next(C.k)); }, (mkStill() ? MK_HOLD_STILL : MK_HOLD) * C.f);
    }
    function run() {
      if (C.running) { C.running = false; halt(); ui(); return; }           // pause where it is
      C.running = true;
      if (C.t < 1) { if (!C.anim) { C.anim = true; C.last = 0; C.raf = requestAnimationFrame(frame); } ui(); }   // one frame loop only
      else play(C.k === last() ? vis[0] : next(C.k));
    }
    function step() { C.running = false; if (C.k !== last()) play(next(C.k)); else { halt(); C.t = 1; E.draw(C.k, 1); ui(); } }
    function reset() { C.running = false; halt(); C.k = vis[0]; C.t = 1; E.draw(C.k, 1); ui(); }
    function go(k) { C.running = false; play(k); }

    function put(el, s) { if (el.textContent !== s) el.textContent = s; }   // text changes only when it changes
    function ui() {
      var k = C.k, n = vis.length, i = pos(k) + 1, title = 'Step ' + i + ' of ' + n + ' · ' + MK_SHORT[k];
      put($('mk-flow'), title);
      stage.setAttribute('aria-label', 'Illustration, ' + m.name.replace(/<[^>]+>/g, '') + '. ' + title + '. ' + (m.scene.chips[k] || ''));
      put($('mk-run'), C.running ? 'Pause' : 'Run');
      var sb = $('mk-step');
      if (k === last() && document.activeElement === sb) $('mk-reset').focus();   // keep the keyboard focus on a live button
      sb.disabled = k === last();
      put($('mk-status'), C.running ? 'Running · step ' + i + ' of ' + n
        : C.anim ? 'Step ' + i + ' of ' + n + ' · playing'
        : C.t < 1 ? 'Paused at step ' + i + ' of ' + n + ' · press Run to continue'
        : i === 1 ? 'Press Run to play all ' + n + ' steps, or Step to go one at a time'
        : k === last() ? 'Done · press Reset to start again, or pick a step below'
        : 'Step ' + i + ' of ' + n + ' · press Run or Step to go on');
      if (C.shown !== m.id + ':' + k) {
        C.shown = m.id + ':' + k;
        var plain = (m.plain || [])[k];
        $('mk-now').innerHTML = '<h3>' + i + ' · ' + MK_STEPS[k] + '</h3>' + (plain ? '<p class="mk-what"><b>What happens:</b> ' + cite(plain) + '</p>' : '') +
          '<p>' + (plain ? '<b>Conditions:</b> ' : '') + cite(m.steps[k]) + '</p>';
      }
      caption();
      Array.prototype.forEach.call($('mk-prog').children, function (x, j) { x.className = j < i - 1 || (j === i - 1 && C.t >= 1) ? 'on' : j === i - 1 ? 'cur' : ''; });
      Array.prototype.forEach.call($('mk-steps').querySelectorAll('button'), function (b) { if (+b.getAttribute('data-k') === k) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    }
    function setRoute(x) {
      m = x; E.setRoute(m);
      vis = []; m.steps.forEach(function (s, k) { if (s != null) vis.push(k); });
      Array.prototype.forEach.call(app.querySelectorAll('.mk-m'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-m') === m.id)); });
      $('mk-route').innerHTML = '<h3>' + m.name + '</h3><p class="mk-lead">' + m.lead + '</p><p class="mk-from">Based on ' +
        m.from.map(function (k) { var r = MK_SRC[k]; return '<a href="https://doi.org/' + r[2] + '" target="_blank" rel="noopener">' + esc(r[0].replace(/ (\d{4})$/, ' et al. $1')) + '</a>'; }).join(', ') + '</p>';
      $('mk-key').innerHTML = mkEls(m).map(function (e) { return '<span class="mk-dot" style="background:' + MK_JMOL[e] + '"></span>' + e; }).join(' ');
      $('mk-prog').innerHTML = vis.map(function () { return '<i></i>'; }).join('');
      var half = Math.ceil(vis.length / 2), list = $('mk-steps');
      list.style.setProperty('--mk-rows', half);
      list.innerHTML = vis.map(function (k, i) {
        return '<li><button type="button" class="mk-st" data-k="' + k + '"><span class="mk-sn">' + (i + 1) + '</span><span class="mk-stt">' + MK_STEPS[k] + '</span></button></li>';
      }).join('');
      var fw = $('mk-fewer'); fw.hidden = !m.na; fw.innerHTML = m.na ? 'This route has ' + vis.length + ' steps. ' + cite(m.na) : '';
      renderProc(m);
      $('mk-card').innerHTML = '<h2>' + m.name + ' · at a glance</h2><dl class="mk-kv">' + m.rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + cite(r[1]) + '</dd>'; }).join('') + '</dl>' +
        (m.extra ? '<p class="mk-extra">' + cite(m.extra) + '</p>' : '') +
        '<div class="mk-lib"><p class="mk-lib-h">Open in the library</p><div class="mk-links">' +
        m.links.map(function (n) { return '<a class="mk-link" href="#/s/' + encodeURIComponent(n) + '"><span>' + libName(n) + '</span></a>'; }).join('') + '</div></div>';
      $('mk-refs').innerHTML = '<h2>Sources for this route</h2><ol class="mk-src">' + citedKeys(m).map(function (k) {
        return '<li id="mk-src-' + k + '"><span class="mk-sk">' + esc(MK_SRC[k][0]) + '</span> ' + MK_SRC[k][1] + '. ' + srcLink(k) + '</li>'; }).join('') + '</ol>' +
        '<p class="muted small">Not a laboratory protocol: work from the original papers and your institution’s safety rules.</p>';
      C.shown = null;
      if (E.resize()) reset(); else { C.k = vis[0]; C.t = 1; ui(); }
    }

    app.querySelector('.mk-methods').addEventListener('click', function (e) {
      var b = e.target.closest('.mk-m');
      if (!b || b.getAttribute('data-m') === m.id) return;
      halt(); history.replaceState(null, '', '#/make/' + b.getAttribute('data-m')); setRoute(MK_BY[b.getAttribute('data-m')]);
    });
    $('mk-run').addEventListener('click', run);
    $('mk-step').addEventListener('click', step);
    $('mk-reset').addEventListener('click', reset);
    var speedUi = function () { Array.prototype.forEach.call(app.querySelectorAll('.mk-sp'), function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-f') === C.f)); }); };
    app.querySelector('.mk-speed').addEventListener('click', function (e) {
      var b = e.target.closest('.mk-sp'); if (!b) return;
      C.f = +b.getAttribute('data-f'); speedUi();                  // takes effect at once, also mid-step
      try { window.localStorage.setItem('mxlib-make-speed', String(C.f)); } catch (e2) { /* no storage */ }
    });
    speedUi();
    $('mk-steps').addEventListener('click', function (e) { var b = e.target.closest('.mk-st'); if (b) go(+b.getAttribute('data-k')); });
    app.addEventListener('click', refJump);
    var ro = window.ResizeObserver ? new ResizeObserver(function () { if (E.resize()) E.draw(C.k, C.t); }) : null;
    if (ro) ro.observe(stage);
    var dq = null;                                       // a new devicePixelRatio (another screen, zoom) re-sizes the canvas
    var watchDpr = function () {
      var q = window.matchMedia && window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
      if (!q || !q.addEventListener) return;
      var f = function () { if (E.resize()) E.draw(C.k, C.t); watchDpr(); };
      q.addEventListener('change', f, { once: true }); dq = { q: q, f: f };
    };
    watchDpr();
    app.setAttribute('aria-live', 'off');
    setRoute(m);
    mk = {
      state: function () { return { route: m.id, step: pos(C.k) + 1, k: C.k + 1, steps: vis.length, t: C.t, running: C.running, animating: C.anim, frames: C.frames, still: mkStill(), speed: C.f }; },
      stop: function () {
        C.running = false; halt(); if (ro) ro.disconnect(); if (dq) dq.q.removeEventListener('change', dq.f);
        app.removeEventListener('click', refJump); app.setAttribute('aria-live', 'polite');
        var d = document.getElementById('mk-doc'); if (d && d.open) d.close();
      }
    };
  }
  function renderProc(m) {                               // the laboratory procedure of the route, read as document pages
    var box = document.getElementById('mk-proc'), D = MK_DOC[m.id], P = D ? { teaser: D.teaser, pages: mkDocPages(m, D) } : null;
    if (!box) return;
    box.hidden = !P;
    if (!P) { box.innerHTML = ''; return; }
    box.innerHTML = '<h2>Laboratory procedure</h2><p>' + P.teaser + '</p>' +
      '<button type="button" class="abs-open mk-doc-open" id="mk-doc-open" aria-haspopup="dialog">Read the full procedure (' + P.pages.length + ' pages)</button>';
    document.getElementById('mk-doc-open').addEventListener('click', function () { openDoc(m, P); });
  }
  // the MEM-CES group logo (companion page assets/image3.png), 150 px, white ground made transparent, for the watermark
  var MK_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAACiCAMAAACUNMRrAAAAwFBMVEUAAABYV1Tx8/JSoEsRXo4iIB51dXWpqqnd4t+Ynpmsravp6+mjqKRaWlhDlzlmZmRekqfK1Mski5CZyZodTXir46w8kDZunm8RN3GBi35+/X6XuMFUc5EmJSMoJyUOeXur4uL//X9BQD2nyKy2z8xwnZ5unnCpxq+10Mvf1bJnlJp5iovSrp0A//9hYSO0zsYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAhjZyWAAAAMHRSTlMA/A39/foFCY3vTFydlvpd+OH99f0I+g39+QL291uSAwsC8J3ZDaJgrB6rYSYBDV3VfMqOAAAVUklEQVR42s1cC2PaMA62BbHjOCFQYIwNKKNru3Zb9///3UmynTgPktDt7qquayE0+SLLeitC/C19AwEKAL+1wB9nUPRDCE0vBQh8H18Bv0fHNP6m6Z87DoIOu/8ahJ99F729vSk+XXXG6NSq8cORbp1ANX5V4p8SWGKFtcQOy78I+mZWhENC0xF8Ddpa9yGgz4FnGJ8FGVnzDG+4OAlRvI9OORgDRuTSFIUBaVIppcbvN/wd3wWTGYm/aZkLkwlT6r2UOb6zwm9tctjnyhQCSimzBsOVyGTyfjJWntKLKJKjOl3SRJrkJMukkMZepDWJkUdzPOKtJ/syMTqReLU8k6VYIc4yyfRFClkIK+WR2Eby9k9gSTyjlCXiSAv8xZgEX+E3vSqRUXhVZIsQ9ClRGJlZY1NkLXH1UWZ4WCMsgR8thTXSgFLawbJ/xy2DJzsVcpXjRQ29kEdZSrpXvLpJVrhgK4SFEFeEze5ThGVWl1xmySq5yIJuhhaVtoQSjUUk0XgXZZBryMrydDpmGahcnE65LqDMc3yRZ1Do/HRCsckByvRJ2FKU1qIw4/FClXkpshw/gN+FZdHKjkXm8DEsK/4XpBpKpKNBBOBuSKRGleVhpUqr9xBqRYXyoMQbvcAvVE/8PmnMFy1YVOif07d4HA8p1rH4Kda6TvUqknaQtCfKehFTAeL/TlqUEgqJau6fw/orZQ0CxZQs1j+GpcXfnack2YJItv4JLLQn+q/4dZKor3pki3wBT92LetIA13iFyhVU46iGcdKVAJTyhGcQQ9yCW6QIePmgSGbwfnbhHa1WxrI7FMPCPZAHaq8GQBoOpXCFWRkpQN34o3wKVYawJDORtbkFQGbMkWmuoxZpfcia2WwNInJDnHciEwO6KWtyCr340wA5H0VXQUSwZBrDQmW3rw+tP80Ws1xsawEiiRAiSbIGj+HbNFg63AWeZwWR8emBZSJ24IXz6DQzpE8zG45rkeO2ViKlzd1kMeAnx2GdvXxCblBBZB0FEcNCj0jVqwGyBWthghihpMoETTOCa9yKgC+wnk3BBeEi+fF4LLUYhFVLFzSZZVC0FjMDOwhOSMIWI8CCmlnm0xRctcijn1OMwEJ26V7RNbQ0ua1kC/VCgY44wioottmFaILW8CZYUBaXU486bcJiFjg9apqwYIuQvlTbUCap0F1uiR3ks8Vi6iK6U8lxWDlUHmxMe4jjK0U7kFlKIo8/n9cPXsTwrRtE3gtL0VGnbVh+5yp8ezOfzzfV3bnYiXypneAd6CQ2SdDWGJY75fRgKqKz4Tn6Yf2qdgnGT2JMtmi58PJn/Aie8e7ublMxvWEBVolfhn1ixDOims0y+OK5Vd2KmdM5XkWPUaxsDwp8gSKvx2BhnKmIWXzKu7sYFgp0Tk76mTaiY2qWXJxKIBvgYFVKWBw+0znmP4ZMopTNEOMKLJJuDCGk59Y8gqXEy4HeQylXMgHON6DsFylvvocAqzphSWIwv5ubEX+LAtmxRZQce+CPz3OmCtY3+rRjYU5ocucB5slFPM0qgxnD+jlnXMOwhM0yMwUWijdp0s+fI1i4E7+hb3VwLFxirJ4UTjMQu8TDOoegt+tFtAd3ij9XHR88BUX84wqCWereI1ybWkF8Qw3rrzPHe0SHRrOBzRuxHURuh8jw85u5AH3NkcMjdKlkEizp39psNrIBC/yqLAXZROPVOq7nucq8xLA0BfPLFAbcS1w73GKmnLKIPbR3spVtiIUHsthWJD4YLpJjP7fUuNNLCuJIeae/gYVR3YFRkeYxZA7BuzjVpZuwKKwddsWVSIyUMKq3rtqwby6iSHFRHikqtpI9QIhgqfOuj1vDvrzzTtV7YfFF7kOkwR6XARHDcnaz3onTAg9ZusDpb2CJynBosWYDRIsofFgMNrOR3tpNCTPBWooTB7hlruzIHptIwmqTBFhoKxWGvqLJbcWtx0mJAox8pBiCle/bCmwAlhBnmbicS0I3ix4ielqzxbr2iCZxC4U1H1anq0y2fC/vxPfDAoKFEVWSWFrYHdug2ez5FljeH8mGdqKBtnF0qAhXDCvYGYYljPdxNMJaUHR0uUHkUevRhQdhrUSDXZTE7oOlPTCNPg25/D5SVOh3IZnbFhFgZXqC/SasxrbMdIBVaXn6/NbrKK8YOF707Ho2T9/PrZ0Iu92XIW6VIYK4DgviIGwGxC3ZhoVuoHlKgXdg7pml41JKU53yNXYD+gH9Tjsi8hC/ygTnB6p4+5u7d3gip+8Z7WNCG5Ekq3IQ1E61tDyecbs7i9/XbSJ7/lSlGlhEXJnaLdFCt001bWizoLAfSF3h52U7BxF7EBSWoC6bIbZ+X55gl8ej7uQgVLRuK/bqArPQyHZhaZG5TYCxT4Js6uQgGv4WEgVFCwNDslUI2RP5NGAFdl3wTL9EzyIKuybH3bBTqpreQxsWmhXrYuwftk0hxQJZTh6EHoalQ0KEw9geWFt4IFTnTDZyEL2wqpwK/gFSZUNm+72sdklWyFJ3Ms2tRQzpI8MpI912bNxWe32wbAhVBOtRVxnEfQfW9fyWvqpOVw1YPn9kWI51j010ksQ5CPCwXA4crmQD+0P/Cla+yixX7wZ2otNLHCu2YL3UhWTQW63Zewg5iPPDw3NwuUDckg0U4pggs2AUlla/SLJYcetOJqfaQRgdsofFOYglx4k+DU4R7nRYqGJQ9Y3YRLc5ipA8jmC1PHIVchAGw9g1m+hnQeF47gLcqbA4fpfZYO50FXIBuQeh68TLcvmj1k9vCCtxSpo0hOHE6poYag/zRkZlFJYoCgt9OYiyLVuV51LB4kstf4hzXYSPchDiYUEZzEzscLt7WPNpsEIqtBPsexPegFVJka6SVBziwz1E2UCfg0BtTzn7meEKTBV3j8H6FWyPkWVfSlfoR+ELmOd7Tyr8dHXNuUu8LK3TevTlchC8jKju7do8CL8TOUUwN3qnd2LXJEoO4L3s6EAV2p5MbyJpAh18iE+wtlVRJclcDkJfEgixM7JriYH353zqqfEM+T3XZJuwzmBX35FWTN9jWnn6s/zMuF7hEf/kj5kZzUySdYYelXzlE2TLpRGrMdrW1ooi767If52PE3EAmXVGbrCJ2+KeS5z/9yhCQObCIa5ijJOv0yAW258NnAJrvlnmwEuY+5PuGI0SnRyESsViFNSihlVQ4greCWtJJqYOup4E+qGJz0GwAaqzM+nsBlgcv0pW3++C9eIl9IHcOtJR5JjK2i6qEH5ol0mduIhcvSW3Sb0L1uGXvzDkjlloNmwMq3J7JnErglWIHG6ULTGbbVqwBPwRzx4AxRjkoHnZwv3w4+kpnyJbFSzAOIrz8t0cxBCqgCvAagX7KTXOlUnpfS1O0H+/ZScKOBb7pDcBfhWWiyVasGB3v4tgce40RIozDoqqRVwsPnlaxERvVNwCm8uyN6qu5bpFbs+431+6LQcOFmRJ4g/t3B9UsNZXyawzF9Oigrj0lwsq2XptRycGb2z25AOVniYJyc4NpZx9So4dHON34mJmB6jSoW+i11TXsLr1hWWo5Lj85P3vexXX/aschIO1A44hV55bn2Ypf0z3GsMvIXWaOzdnABY8NgJfXHy6q3YYXKeAKLywUViNr7JnDA0DLAscva3heoWMApqy6MtBXOcW31VV6/5xmC+/V+rcGUXgHISCuKuk1lv4qTUp3/VQxuZoskJkN3CrSTm7gms4h86cgrUpSVa9TBjdRlpeM7PIQ9zCtRyEzjhW7u7EYW4Fejk4DzXoAtC0DzkTAa5TuGsThchYZZiBdh2o/nTyTmykDNhDvZvnznMmi2gg5CCiQnYMy9p0Sc0mq+s7sQH0ivFZDtCj99Ff4T70QdioPYNu+bHjQVD3BL3aMxn6Mvs9fWydO73lAjKj32uqs7lzUX/y1YNkeacLfiLwP6HMWdlEUu+s7GsFH37xWt7l+ZLBnTgI6yWfo4eKzFJQRT4hB+FK5YhLT/W3ZhGslTnuj++FhQgOy8PrS4gTMa6oqmNZFLDdCAs1TM4t2e/2t6jJvFKnyvdBpOTcmFAqJsMtbnEDqfpaCN2XSJoMi7JY7RwEL6YPWZfkVN8GizoWqHD3HpHfbDbs2KiorU35PghBom/cbqDQ6MZF5J0ohtUpAeiBRM7gpu0GKqdGKRmNJujwmbZDDi2RX/T4WuxuLT5FslWIdNCxWX415mtFxpglfn9lr2v2qiMLQ9kG9kwDu/RyvjnkHXW6HqBwdZHTwIId8E5fe22hi8Ay8aXRBeqa3dhysKrY8sBKC9Zg52lIanJmpq+KMWwTc86pPcRhc5qlrOVdgF+0+yAimzilRAYyH3ZsQHxpkFJfgEuqdfcdfubbEj0cg25N6YZiXA6i9rlqWPrL7ks/qagTAFwb1m0eBP7Zw9ND5TOjWLmGlldBTOI5pL3rPKhgiRu4hXsmy8yq22odwTo/6haJs+YM4H0dYPz0rkR2SVxJIcpB/NbbBre210hvq47MUZs4MSXlYX33bcMAVbDvinS1Op1U2Dc0YDJkE5cp0Q9PaZPq0Mf32XyFhMNWNkAhB/Gc2ohb6VX6kbrGWlr8lVF9lf1pqRGvTpV4YQ9ncxC+SF3DAs6h7uxE4+NbI99KJD2o5Qc9CBW0Fno4m/kPoNSIK/I42dpx7mtRBWTkaLlvTvLUSaRFnN8KeuudHoT4vaua9HOR+9QIUGtl4RznHbig9XlxSzYQ0Cjm8r3+1t2P7riON0C+PQNhGc4/2JtgUTYwke91mufLV/HoK87weC+gTo1gAGsVJ1EfaIFyO7stkZTa3oaDadxCBQq/OzkI69ozQu7r2awfJvtbOmo46PMgNqMOl+tAbdfkIblQfE81Mp+xIcu9uxGWzsosJdPdNtVjsLil8m5+Z1vVX1YQMHMJZ6Yt/UNYHNugNm2GPbHbFcmWkb2zGF9bAWIcM1JhabnxIWJopubFBPIES9QSUXuGU492Tep9NqN7EdeYJR48t5QyMul2jeC10hEym8/opH42dZ3q0adMLbdn1Ianan1C8smBayeNmvCS1c3DWuyxfd2gAl1aXqt7Du0Vu3+GT5pSfLwTO9VjOud32zF3qzStQUBfuBOlJwzYGv7jGZ0D42izyYNkZcvvr8+IzrD3l/qatbA+CUF9t3iubOlX3vwsS/ETKasIX4hMhAYiGr88qaFut31TqClTd5GX0AehXTsCLc4ye7FOieZOLvQrujF+MV1H0sZFQ1frir7AS30QRZH3qFPR6pWPhKQ9mfQontEJdJFqwq0eHOw7szPzyXnfnoHrvonGALqwdBht6/e34patPxBvKtPp0q3ySd+5l8XnINjfJ1UUw5IUpF0vWYdyuDitTK+/1RioiXOjttsOC7kXGYSVAnjP1LcDUcml28wyBuuYa12M9Z3WOkg1DzCse3SZHa6SRB1Cewa6WAtKLEOzMX0CLBT54kpxpdm7rEK3a6NPULieZgCuxG7MC7dn4F9fUEFs4UFwQlncDIumC3BPazXS05y58Nn1Grdhse+NsFCePCy2QJrbc6vpgltgUWJfluBCu6HmYa/LVdbXak2nebzH7apDDiJLKuMDofp60yIWV8oFLVgh+d/X0wyh0ybkIFjNS/dgimroYVYPnl2nNMBSZVkMt8PWirM51+Zh+ev+puQkonlylWquGkTG5Llu2JqSgxCw1TRdMNoBnsM3PyLRhPXmai3BlLmg2vk3UZado59ZLA8TunQnzWJQ5J13G9Mp3lrn9TweujWKG8HRSQVdZyBqWEMj9lVbjM5wM07pl8+FgE6LOlBtlVx1HsnCxSMmhaRzWVeC/rDCn9zTjHGTySDVU6YLbEeyCNbOVQuDHgilsVYfhDCoWsdhVT1Pwtd8Jsxi5CDHYDnpAh4YTiNY6IitZ7c0poduNzV9zqe1iIZrzFDlWpJLFjo60TzutmGGrNItj9dFy0LdG5gYPT6feHWgBp7XPL9Wsd/4EZFUXl7iEXF5k5bPV77m/O4REYgLW3jHUTelfXh64BmDGz0INX3irkMb9OZe3J7excPKCWn6Mw+RGTdzt73dsbnSVjYKa+MbA1khN1vdKdi/p4Zdp60eQP03YJnrsO6W8LuqSDPjIG7P4HaRT99v97dQQWRKKBiC1dFWPKa4cY2BIX6Ds0uD+9SIizIylyVHVRuPTU7i1rXqa32WNGu3OwZYSHVYCY+/SP3BG+e3XLlg7WRL3wqLjKjO1eBONHbf+lMZcG0OtupZPtxRqfWR5+Mds5DSp6y/MX1ctvIRdWraE+naRzCban5VU02Tsjcc5xvXDgvqd1Wsp/rCEDVh8YiIHIl8TGtO37fDUr/iAXxaBg6fOatkXFIEfPwKsNtOyZ6btsiT+R0ZyTXNQX0L3VkMIfxQ8hJcHslUjT9THlgCpuvLo1+7GoMVSZeBnqEH8eJrjsvUdSyiSr3lkWymuxOPx+NwVC0acz62b85H+FLrJt+zU2opHQvvh+WGHkZgUXNUlI/oGajBWIJLrYcVufChWap56d2AT2p69dbwpLBLPUYRUA+38E1zWL66VuuXpguoAcYehtOVLVucRibuqko741C7BqzwqD/3jECgqQINMbdU+E9lP3+WfSREZnrixLFgn+0dRMkI3X3aRVBPnBphWNtqQuwPF6zsjep07wtdA3qrzj20J1dwF6/N2aewtHiRPh6j/fibm+q4TIv3cpuphuw05m+ZOg2XdeZ8MHT4NPPP3+GhBz9+7NvKtmJNrT7m1hwEbhtjVnZwyLTu4+jM+TxTEeCTCWK0lYl7+mTmw1jBTdifZn9uTSRRzWc4fDXVo1Iy1R6ocZm1JURlKKo8vLmHJAFn4rkQdbOp3gOM2UQ/PxUmISNYrnhp4HcFq+BNgRLOMRr1hmOA+PQeXz7pq+ybVg4JLVDWnvNBdfqdZrmhatIoQ3812OoBV2vOBdzGLQRTPPU+uunS5FZkbhs7ER6ez3VQnyWX8MAkVfcecv8W3v0UWD4uOJ5Op4sW3UHAyheqhqF0ZfCDl2Sg+biy0MQv2s80JXdzjOjBkKJ6Gg8NjHQqZG6WP3Q3QvvBpnUrJddUYnbGKtZ7+T6wthMIGnGi+lcP6HNPVO0/ctuT8IyX6hYsesYtUd+DSsB3j/Qcu+5kaQ16lKCGZUSPgnj/cwz/xWMHaZrTUte9+lDPpKRHoGTy3z9l8W+f0Qgcy8eLCB+AtKZH3cZdI1Z8DCrQMERJylX6McjaNHq8TiI/ENWNUh+JIu/0w8Eid/1DLaELaMg6Zx+KLHwE1X5VueoPRsir/wCM+X5Am6WEkAAAAABJRU5ErkJggg==';
  function mkWatermark() {                               // the poster's header and the group logo, diagonal, faint red, repeated
    var T = MK_POSTER, t = function (y, size, w, s, col) {
      return '<text x="320" y="' + y + '" font-size="' + size + '" font-weight="' + w + '" fill="' + (col || '#9B1C1C') + '">' + esc(s) + '</text>'; };
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="600" viewBox="0 0 640 600">' +
      '<g transform="rotate(-24 320 190)" fill-opacity="0.11" font-family="Carlito, Calibri, Segoe UI, Arial, sans-serif" text-anchor="middle">' +
      t(140, 13, 700, T.eyebrow.toUpperCase(), '#B42318') + t(174, 24, 700, T.title) + t(204, 24, 700, T.title2) + t(232, 14, 400, T.sub, '#B42318') + t(258, 14, 700, T.authors) + '</g>' +
      '<image x="90" y="380" width="120" height="130" opacity="0.14" transform="rotate(-24 150 445)" href="' + MK_LOGO + '" xlink:href="' + MK_LOGO + '"/></svg>';
    return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
  }
  function openDoc(m, P) {
    var d = document.getElementById('mk-doc');
    if (!d) { d = h('dialog', { 'class': 'mk-doc', id: 'mk-doc', 'aria-modal': 'true', 'aria-labelledby': 'mk-doc-title' }); document.body.appendChild(d); }
    var T = MK_POSTER, head = '<header class="doc-mast"><p class="doc-eyebrow">' + T.eyebrow + '</p><p class="doc-ptitle">' + T.title + '<br>' + T.title2 + '</p>' +
      '<p class="doc-psub">An HPC-Driven Screening Framework for MXene-Based CO<sub>2</sub>/CH<sub>4</sub> Separation</p>' +
      '<p class="doc-pauth">Eyüp YAZKAN<sup>1</sup> · Sadiye VELİOĞLU<sup>2</sup></p><p class="doc-paff"><sup>1</sup> Gebze Technical University · <sup>2</sup> Istanbul Technical University</p></header>';
    var run = '<p class="doc-run">' + T.eyebrow + ' · ' + T.title + ' ' + T.title2 + '</p>';
    d.innerHTML = '<div class="mk-doc-bar"><h2 id="mk-doc-title">Procedure · ' + m.name + '</h2>' +
      '<button type="button" class="mk-doc-close" id="mk-doc-close" aria-label="Close the procedure">×</button></div>' +
      '<div class="mk-doc-pages">' + P.pages.map(function (pg, i) {
        return '<article class="mk-page" aria-label="Page ' + (i + 1) + ' of ' + P.pages.length + '">' + (i ? run : head) + pg + '<p class="mk-page-no">' + (i + 1) + ' / ' + P.pages.length + '</p></article>';
      }).join('') + '</div>';
    d.style.setProperty('--mk-wm', mkWatermark());
    var close = function () { d.close(); };
    document.getElementById('mk-doc-close').addEventListener('click', close);
    d.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });   // read on the page, not saved (as the extended abstract)
    d.addEventListener('click', function (ev) { if (ev.target === d) close(); });
    d.addEventListener('close', function () { document.documentElement.classList.remove('abs-lock'); var b = document.getElementById('mk-doc-open'); if (b) b.focus(); }, { once: true });
    if (typeof d.showModal === 'function') { document.documentElement.classList.add('abs-lock'); d.showModal(); document.getElementById('mk-doc-close').focus(); }
    else d.setAttribute('open', '');
  }
  function refJump(e) {                                  // a citation scrolls to its entry in the source list
    var b = e.target.closest && e.target.closest('.mk-ref');
    if (!b) return;
    e.preventDefault();                                  // the hash is the page's router: scroll instead of navigating
    var li = document.getElementById('mk-src-' + b.getAttribute('data-ref'));
    if (!li) return;
    li.scrollIntoView({ behavior: mkStill() ? 'auto' : 'smooth', block: 'center' });
    li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
  }

  window.__mxlib = { scene: function () { return scene; }, viewer: function () { return viewer; },   // read by test_library.py
                     make: function () { return mk ? mk.state() : null; } };
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', function () { if (scene) { viewer.resize(); viewer.render(); } });
  fetch('elements.json').then(function (r) { return r.json(); }).then(function (j) { EL = j.elements; route(); },
    function () { app.innerHTML = errorCard(new Error('offline')); });
})();
