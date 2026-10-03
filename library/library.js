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
    if (r.detail) renderDetail(r.detail); else renderWizard(r.sel);
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
  function chipText(k, sel) {
    var v = sel[k];
    if (k === 'fam') return '<b>' + esc(v) + '</b>';
    if (k === 'tpl') return TPL[v] ? TPL[v].f + (TPL[v].cell ? ' · ' + TPL[v].cell : '') : esc(v);
    if (k === 'm1') return (DOUBLE[sel.fam] ? 'M′ ' : 'M ') + '<b>' + esc(v) + '</b>';
    if (k === 'm2') return 'M″ <b>' + esc(v) + '</b>';
    if (k === 'x') return 'X <b>' + (v === 'CN' ? 'C<sub>0.5</sub>N<sub>0.5</sub>' : v === 'NC' ? 'N<sub>0.5</sub>C<sub>0.5</sub>' : esc(v)) + '</b>';
    return esc(v);
  }

  function renderWizard(sel) {
    detachViewer();
    var step = nextStep(sel);
    if (!step) step = 't';
    app.innerHTML = '';
    var path = h('div', { 'class': 'path' });
    var stepNo = 1;
    ORDER.forEach(function (k) {
      if (k === step || !sel[k] || (k === 'm2' && !DOUBLE[sel.fam])) return;
      stepNo++;
      var c = h('button', { 'class': 'chip', type: 'button', title: 'Change this choice' }, chipText(k, sel));
      c.addEventListener('click', function () {
        var s = {}; for (var i = 0; i < ORDER.indexOf(k); i++) if (sel[ORDER[i]]) s[ORDER[i]] = sel[ORDER[i]];
        go(s);
      });
      path.appendChild(c);
    });
    if (path.children.length) {
      var r = h('button', { 'class': 'chip reset', type: 'button' }, 'Start over');
      r.addEventListener('click', function () { go({}); });
      path.appendChild(r);
    }
    var card = h('section', { 'class': 'card' });
    card.appendChild(h('div', { 'class': 'step-h' }, '<span class="k">Step ' + stepNo + '</span><h2>' + stepTitle(step, sel) + '</h2>'));
    var body = h('div', null, '<p class="loading">Loading…</p>');
    card.appendChild(body);
    if (path.children.length) app.appendChild(path);
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
        '<button class="back" type="button" id="back">‹ Change the selection</button>' +
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
      document.getElementById('back').addEventListener('click', function () { go(back); });
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
      app.innerHTML = '<button class="back" type="button" onclick="history.back()">‹ Back</button>' + errorCard(e);
    });
  }

  window.__mxlib = { scene: function () { return scene; }, viewer: function () { return viewer; } };   // read by test_library.py
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', function () { if (scene) { viewer.resize(); viewer.render(); } });
  fetch('elements.json').then(function (r) { return r.json(); }).then(function (j) { EL = j.elements; route(); },
    function () { app.innerHTML = errorCard(new Error('offline')); });
})();
