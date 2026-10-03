/* Copy of poster_v2/companion/src/mx_view.js (03.10.2026) for the library viewer: same camera, scale logic and
   colours as the companion page. Only mxCellVectors / mxAxes / mxQuaternion / mxFrame are used here. */
/* AO2-3 · one view for every structure image: the companion page's 3D viewer and the poster Section 2 render
   (figures/make_structure_render.py) run this same code, so both show the same angle and colours.
   Colours: figures/element_colors.json (Jmol / CPK, QUESTIONS #50). Camera: computed from the cell vectors so that
   the layer normal (a × b) is vertical on screen, the sheet is seen from the side at a fixed 3/4 azimuth measured
   from a, and slightly from above (elevation) so the in-plane order shows; 3Dmol's perspective camera adds the
   slight perspective. 2 × 1 cells have a along the same direction, so they get the same view.
   Note: the thesis cells are triclinic (beta 80-83 deg), so c itself is tilted 7-10 deg off the layer normal;
   putting c upright would show the sheet tilted, hence the normal.
   Scale (01.10, lead note on AO2-3): no fit-everything zoom. Every tab is drawn at the same fixed scale, `span`
   angstrom across the shorter side of the scene, so atoms keep their size from tab to tab and the slab side reads the
   same; the 3 x 3 x 1 sheets of the large in-plane cells (IPDT 9.1 A, IPV 7.9 A vs 2.9 A for SS) run past the left
   and right edges instead of shrinking into a thin plate. The drawn atoms are then centred on screen. */
var MX_VIEW = { azimuth: 30, elevation: 28, span: 19, sphere: 0.3, stick: 0.14 };   // AO2-3: 30° from a, 28° above the sheet

function mxCellVectors(cell) {            // 3Dmol's CIF convention: a along x, b in the xy plane
  var d = Math.PI / 180, ca = Math.cos(cell.alpha * d), cb = Math.cos(cell.beta * d),
      cg = Math.cos(cell.gamma * d), sg = Math.sin(cell.gamma * d);
  var cy = (ca - cb * cg) / sg;
  return { a: [cell.a, 0, 0], b: [cell.b * cg, cell.b * sg, 0],
           c: [cell.c * cb, cell.c * cy, cell.c * Math.sqrt(Math.max(0, 1 - cb * cb - cy * cy))] };
}
function mxNorm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
function mxCross(u, v) { return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; }
function mxDot(u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; }

function mxAxes(cell, azimuth, elevation) {
  /* screen x, screen y (up) and toward-the-viewer directions in model coordinates */
  var V = mxCellVectors(cell), d = Math.PI / 180;
  var up = mxNorm(mxCross(V.a, V.b));                     // layer normal
  if (mxDot(up, V.c) < 0) up = [-up[0], -up[1], -up[2]];  // pointing the way c points (towards the top termination)
  var e1 = mxNorm([V.a[0] - mxDot(V.a, up) * up[0], V.a[1] - mxDot(V.a, up) * up[1], V.a[2] - mxDot(V.a, up) * up[2]]);
  var e2 = mxCross(up, e1);
  var h = [0, 1, 2].map(function (i) { return Math.cos(azimuth * d) * e1[i] + Math.sin(azimuth * d) * e2[i]; });
  var z = mxNorm([0, 1, 2].map(function (i) { return Math.cos(elevation * d) * h[i] + Math.sin(elevation * d) * up[i]; }));
  var y = mxNorm([0, 1, 2].map(function (i) { return up[i] - mxDot(up, z) * z[i]; }));
  return { x: mxCross(y, z), y: y, z: z };
}

function mxQuaternion(cell, azimuth, elevation) {
  /* rotation world -> view (rows = screen x, screen y, toward the viewer) as a quaternion [x, y, z, w] */
  var A = mxAxes(cell, azimuth, elevation), x = A.x, y = A.y, z = A.z;
  var m00 = x[0], m01 = x[1], m02 = x[2], m10 = y[0], m11 = y[1], m12 = y[2], m20 = z[0], m21 = z[1], m22 = z[2];
  var t = m00 + m11 + m22, qw, qx, qy, qz, s;
  if (t > 0) { s = 0.5 / Math.sqrt(t + 1); qw = 0.25 / s; qx = (m21 - m12) * s; qy = (m02 - m20) * s; qz = (m10 - m01) * s; }
  else if (m00 > m11 && m00 > m22) { s = 2 * Math.sqrt(1 + m00 - m11 - m22); qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s; }
  else if (m11 > m22) { s = 2 * Math.sqrt(1 + m11 - m00 - m22); qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s; }
  else { s = 2 * Math.sqrt(1 + m22 - m00 - m11); qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s; }
  return [qx, qy, qz, qw];
}

function mxFrame(viewer, m, axes, span, fill) {
  /* span mode (poster render, default): fixed scale, `span` angstrom across the shorter side of the scene (perspective
     camera: measured at the rotation centre). fill mode (page viewer since 01.10 round 7, a x b x c chosen by the
     visitor): the drawn supercell is fitted to `fill` of the scene, its in-plane width (screen x is perpendicular to the
     layer normal) or, when the stack is taller than wide, its height. Then the model is panned so the projected atoms
     sit in the middle; a few passes because of the perspective. */
  var atoms = m.selectedAtoms({}), pts = atoms.map(function (a) { return { x: a.x, y: a.y, z: a.z }; });
  var cv = viewer.getCanvas(), W = cv.clientWidth || viewer.WIDTH, H = cv.clientHeight || viewer.HEIGHT;
  var off = viewer.canvasOffset(), pxA = 1, lo, hi, tp, bt;
  for (var it = 0; it < 8; it++) {
    var v = viewer.getView(), c = { x: -v[0], y: -v[1], z: -v[2] };
    var p0 = viewer.modelToScreen(c),
        p1 = viewer.modelToScreen({ x: c.x + axes.x[0], y: c.y + axes.x[1], z: c.z + axes.x[2] });
    pxA = Math.abs(p1.x - p0.x);                          // screen px per angstrom at the rotation centre
    var p = viewer.modelToScreen(pts);
    lo = Infinity; hi = -Infinity; tp = Infinity; bt = -Infinity;
    for (var i = 0; i < p.length; i++) {
      lo = Math.min(lo, p[i].x); hi = Math.max(hi, p[i].x); tp = Math.min(tp, p[i].y); bt = Math.max(bt, p[i].y);
    }
    var f = fill ? Math.min(fill * W / Math.max(hi - lo, 1), fill * H / Math.max(bt - tp, 1)) : Math.min(W, H) / span / pxA;
    if (Math.abs(f - 1) > 0.002) { viewer.zoom(f); continue; }
    var dx = (lo + hi) / 2 - (off.left + W / 2), dy = (tp + bt) / 2 - (off.top + H / 2);   // screen y runs down
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
    v = viewer.getView();                                 // modelGroup position = -(rotation centre)
    for (var k = 0; k < 3; k++) v[k] += -dx / pxA * axes.x[k] + dy / pxA * axes.y[k];
    viewer.setView(v);
  }
  // for the tests: scale and the share of the scene the atom centres cover (> 1 = the sheet runs past the edges)
  return { pxA: +pxA.toFixed(2), w: +((hi - lo) / W).toFixed(2), h: +((bt - tp) / H).toFixed(2),
           top: +((tp - off.top) / H).toFixed(2), bottom: +((bt - off.top) / H).toFixed(2) };
}

function mxShow(viewer, cif, cell, colors, opts) {
  /* draw one structure: 3 x 3 x 1 cells, spheres + metal-to-nonmetal sticks, element colours, fixed camera and scale;
     opts: azimuth / elevation / span override MX_VIEW; rep [na, nb, nc] (default 3 x 3 x 1; the page passes the
     visitor's choice, from 1 x 1 x 1); fill: fit the supercell to that share of the scene (page); fit: true = the old
     fit-everything zoom (how the draft6 poster render was framed; make_structure_render.py crops to the atoms anyway) */
  opts = opts || {};
  var METAL = { Ti: 1, Nb: 1, Sc: 1, V: 1, Cr: 1, Y: 1, Zr: 1, Mo: 1, Hf: 1, Ta: 1, W: 1 };
  viewer.clear();
  var m = viewer.addModel(cif, 'cif'), rep = opts.rep || [3, 3, 1];
  viewer.replicateUnitCell(rep[0], rep[1], rep[2], m, true);
  // keep only metal-to-X / metal-to-Tx bonds (distance bonding also joins metal pairs, which clutters the view)
  var atoms = m.selectedAtoms({}), byIdx = {};
  for (var i = 0; i < atoms.length; i++) byIdx[atoms[i].index] = atoms[i];
  for (var j = 0; j < atoms.length; j++) {
    var a = atoms[j], keep = [], order = [];
    for (var k = 0; k < a.bonds.length; k++) {
      var o = byIdx[a.bonds[k]];
      if (o && (!!METAL[a.elem] !== !!METAL[o.elem])) { keep.push(a.bonds[k]); order.push(a.bondOrder ? a.bondOrder[k] : 1); }
    }
    a.bonds = keep; a.bondOrder = order;
  }
  var col = function (at) { return colors[at.elem] || '#888888'; };
  viewer.setStyle({}, { sphere: { scale: opts.sphere || MX_VIEW.sphere, colorfunc: col },
                        stick: { radius: opts.stick || MX_VIEW.stick, colorfunc: col } });
  viewer.zoomTo();
  var az = opts.azimuth != null ? opts.azimuth : MX_VIEW.azimuth, el = opts.elevation != null ? opts.elevation : MX_VIEW.elevation;
  var v = viewer.getView(), q = mxQuaternion(cell, az, el);
  v[4] = q[0]; v[5] = q[1]; v[6] = q[2]; v[7] = q[3];
  viewer.setView(v);
  viewer.zoomTo();
  if (opts.fit) viewer.zoom(opts.zoom || 1.0);
  else m.mxFrame = mxFrame(viewer, m, mxAxes(cell, az, el), opts.span || MX_VIEW.span, opts.fill || 0);
  if (m.mxFrame) { m.mxFrame.rep = rep.slice(); m.mxFrame.atoms = m.selectedAtoms({}).length; }   // for the tests
  viewer.render();
  return m;
}
