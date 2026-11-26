'use strict';
// Lift/run network + skier simulation.

const TIME_SCALE = 30;                 // world seconds per real second at 1x
const DAY_START = 8.5 * 3600, LAST_ARRIVAL = 14.5 * 3600, DAY_END = 16.5 * 3600;
const SNAP = 70, RUN_WIDTH = 34, RUN_COST_PER_M = 25, RUN_OP_PER_M = 2;
const FIXED_OP = 3000;                 // lodges, staff, ticket office per day
const TREE_COST = 150;                 // felling + hauling one tree
const EARTH_COST = 0.5;                // € per m³ of cut-and-fill
const GRADE_HALF = RUN_WIDTH / 2 + 5, GRADE_MARGIN = 22;   // levelled half-width, blend back to the slope
const MAX_DEBT = 100000, DEBT_DAYS = 3, MIN_REP = 15;
const TICKET = 38, START_MONEY = 900000, MAX_SKIERS = 1500;

const DIFF = [
  { name: 'Blue', color: 0x2f7de1, css: '#2f7de1' },
  { name: 'Red', color: 0xe0393e, css: '#e0393e' },
  { name: 'Black', color: 0x18181c, css: '#18181c' },
];
// crowd: how much a queue puts them off a lift (better skiers know the mountain and go where it's quiet)
const SKILL = [
  { name: 'Beginners', maxDiff: 0, speed: 7, color: 0x3fb0ff, pref: [6, 0, 0], crowd: 0 },
  { name: 'Intermediates', maxDiff: 1, speed: 10, color: 0xff6a3d, pref: [3, 7, 0], crowd: 0.8 },
  { name: 'Experts', maxDiff: 2, speed: 13, color: 0x9b4dff, pref: [1, 5, 9], crowd: 2 },
  { name: 'Freeriders', maxDiff: 2, speed: 14, color: 0xc8f03c, pref: [0, 2, 6], crowd: 3, offPiste: 10 },
];
const FREERIDER = 3;

// Places to eat. Lodges at the base always have a restaurant; huts and restaurants are built on the mountain.
const FOOD_TYPES = {
  hut: { name: 'Mountain hut', icon: '🛖', seats: 90, cost: 180000, op: 900, w: 22, d: 16,
         desc: 'A wooden hut with a sunny terrace. Coffee, soup and apple strudel.' },
  restaurant: { name: 'Panorama restaurant', icon: '🍽', seats: 260, cost: 520000, op: 2400, w: 40, d: 26,
                desc: 'A big self-service restaurant with glass walls and a huge terrace.' },
};
const LODGE_SEATS = 300, FOOD_REACH = 160;
const FOOD_NAMES = ['Edelweiss', 'Gipfelstube', 'Enzian', 'Murmeltier', 'Sonnenalm', 'Bergkristall', 'Adlerhorst', 'Schneerose', 'Gamsstube', 'Almrausch'];
// what guests eat and when (seconds since midnight), how long they stay, what they spend
const MEALS = {
  morning: { name: 'a morning coffee', spend: 5, mins: [10, 20], happy: 5, chance: 0.45, from: 9.75, to: 10.75 },
  lunch: { name: 'lunch', spend: 21, mins: [30, 50], happy: 12, chance: 0.92, from: 11.5, to: 13.25 },
  afternoon: { name: 'an afternoon coffee', spend: 6, mins: [15, 25], happy: 6, chance: 0.4, from: 14.25, to: 15.5 },
};
const FREE_MAX_G = 1.0;                // freeride lines take pitches up to 45°, never cliffs
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const money = (n) => (n < 0 ? '−€' : '€') + fmt(Math.abs(n));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

class Path {
  constructor(pts) {
    this.pts = pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    this.cum = cum;
    this.length = cum[cum.length - 1];
  }
  at(d, out) {
    const { cum, pts } = this;
    d = clamp(d, 0, this.length);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi], seg = cum[hi] - cum[lo] || 1, t = (d - cum[lo]) / seg;
    out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
    out.dx = (b.x - a.x) / seg; out.dy = (b.y - a.y) / seg; out.dz = (b.z - a.z) / seg;
    return out;
  }
}

// Centripetal Catmull-Rom through the clicked/drawn points, resampled every `step` metres.
function smoothLine(points, step = 8) {
  const out = [{ x: points[0].x, z: points[0].z }];
  const n = points.length;
  const P = (i) => {
    if (i < 0) return { x: 2 * points[0].x - points[1].x, z: 2 * points[0].z - points[1].z };
    if (i >= n) return { x: 2 * points[n - 1].x - points[n - 2].x, z: 2 * points[n - 1].z - points[n - 2].z };
    return points[i];
  };
  const kd = (a, b) => Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)) || 1e-3;
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const t1 = kd(p0, p1), t2 = t1 + kd(p1, p2), t3 = t2 + kd(p2, p3);
    const L = (A, B, ta, tb, u) => ({ x: (A.x * (tb - u) + B.x * (u - ta)) / (tb - ta), z: (A.z * (tb - u) + B.z * (u - ta)) / (tb - ta) });
    const segs = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 1; k <= segs; k++) {
      const u = t1 + ((t2 - t1) * k) / segs;
      const A1 = L(p0, p1, 0, t1, u), A2 = L(p1, p2, t1, t2, u), A3 = L(p2, p3, t2, t3, u);
      const B1 = L(A1, A2, 0, t2, u), B2 = L(A2, A3, t1, t3, u);
      out.push(L(B1, B2, t1, t2, u));
    }
  }
  return out;
}

// Grade a run so no pitch is steeper than maxG, keeping both ends (the stations) at their real height.
// Each point is pulled toward the natural ground but kept inside the band that still lets the run
// reach the bottom without exceeding maxG and without going uphill.
function gradeProfile(dense, maxG) {
  const n = dense.length, s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
  const L = s[n - 1], y0 = dense[0].y, yn = dense[n - 1].y;
  const avg = (y0 - yn) / (L || 1);
  if (avg > maxG) return { pts: null, avg };
  const out = [{ x: dense[0].x, z: dense[0].z, y: y0 }];
  for (let i = 1; i < n; i++) {
    const prev = out[i - 1].y, ds = s[i] - s[i - 1];
    const lo = Math.max(yn, y0 - maxG * s[i], prev - maxG * ds);
    const hi = Math.min(y0, yn + maxG * (L - s[i]), prev);
    out.push({ x: dense[i].x, z: dense[i].z, y: clamp(dense[i].y, lo, hi) });
  }
  out[n - 1].y = yn;
  return { pts: out, avg };
}

// Next point when drawing at a held angle: head across the fall line so the natural ground drops
// at exactly `maxG`, on whichever side is closer to where the player is pointing.
function traverseStep(from, toward, maxG, prev = null, step = 25) {
  const e = 8;
  const gx = (Terrain.height(from.x + e, from.z) - Terrain.height(from.x - e, from.z)) / (2 * e);
  const gz = (Terrain.height(from.x, from.z + e) - Terrain.height(from.x, from.z - e)) / (2 * e);
  const S = Math.hypot(gx, gz);
  let tx = toward.x - from.x, tz = toward.z - from.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
  if (S < 0.01) return null;
  const fx = -gx / S, fz = -gz / S;                               // fall line
  if (S <= maxG) {                                                  // gentle ground: go straight if it is downhill
    return tx * fx + tz * fz > 0 ? { x: from.x + tx * step, z: from.z + tz * step, dx: tx, dz: tz } : null;
  }
  const th = Math.acos(maxG / S), c = Math.cos(th), sn = Math.sin(th);
  const opts = [[fx * c - fz * sn, fz * c + fx * sn], [fx * c + fz * sn, fz * c - fx * sn]];
  // keep traversing the same way (no zig-zag) unless the other side is clearly closer to the target
  const score = (o) => o[0] * tx + o[1] * tz + (prev ? 0.6 * (o[0] * prev.dx + o[1] * prev.dz) : 0);
  const [dx, dz] = opts.sort((p, q) => score(q) - score(p))[0];
  if (dx * tx + dz * tz < 0.15) return null;                        // can't head that way at this angle
  return { x: from.x + dx * step, z: from.z + dz * step, dx, dz, fallAngle: (th * 180) / Math.PI };
}

// An off-piste line from one node down to a lower one, found on the real terrain: always downhill,
// never steeper than FREE_MAX_G, keeping enough height to still reach the target, and seeking out the
// steeper ground freeriders like. Returns null when the mountain doesn't allow it.
function traceFreeride(from, to) {
  const step = 18, ty = Terrain.height(to.x, to.z);
  let x = from.x, z = from.z, y = Terrain.height(x, z), hx = 0, hz = 0, maxG = 0;
  const y0 = y, pts = [{ x, z }];
  for (let k = 0; k < 400; k++) {
    const dx = to.x - x, dz = to.z - z, d = Math.hypot(dx, dz);
    if (d < 40) {
      if (y < ty) return null;
      pts.push({ x: to.x, z: to.z });
      const dense = smoothLine(pts, 8).map((p) => ({ x: p.x, z: p.z, y: Terrain.height(p.x, p.z) }));
      return { from, to, path: new Path(dense), drop: y0 - ty, maxG };
    }
    const bx = dx / d, bz = dz / d;
    let best = null, bs = -Infinity;
    for (let a = -80; a <= 80; a += 10) {
      const r = (a * Math.PI) / 180, ux = bx * Math.cos(r) - bz * Math.sin(r), uz = bx * Math.sin(r) + bz * Math.cos(r);
      const nx = x + ux * step, nz = z + uz * step;
      if (!Terrain.inside(nx, nz)) continue;
      const ny = Terrain.height(nx, nz), g = (y - ny) / step;
      if (g < 0.03 || g > FREE_MAX_G) continue;                              // keep moving downhill, no cliffs
      if (ny - ty < 0.04 * Math.hypot(to.x - nx, to.z - nz)) continue;      // don't run out of height
      const s = ux * bx + uz * bz + 0.8 * Math.min(g, 0.7) + (k ? 0.5 * (ux * hx + uz * hz) : 0);
      if (s > bs) { bs = s; best = { nx, nz, ny, ux, uz, g }; }
    }
    if (!best) return null;
    x = best.nx; z = best.nz; y = best.ny; hx = best.ux; hz = best.uz; maxG = Math.max(maxG, best.g);
    pts.push({ x, z });
  }
  return null;
}

const degToGrade = (d) => Math.tan((d * Math.PI) / 180);
const gradeToDeg = (g) => (Math.atan(g) * 180) / Math.PI;

const GRADE_COLORS = [0x2f7de1, 0xe0393e, 0x18181c, 0xc04dff, 0xffa31a]; // blue, red, black, too steep, uphill
function gradeClass(g) { return g < -0.06 ? 4 : g <= 0.25 ? 0 : g <= 0.4 ? 1 : g <= 0.9 ? 2 : 3; }

// ---------- shared geometry / materials ----------
const GEO = {}, MAT = {};
function initAssets() {
  if (GEO.box) return;
  GEO.box = new THREE.BoxGeometry(1, 1, 1);
  GEO.tower = new THREE.CylinderGeometry(1.2, 1.8, 1, 6).translate(0, 0.5, 0);
  GEO.disc = new THREE.CylinderGeometry(11, 11, 2, 18);
  GEO.roof = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  MAT.tower = new THREE.MeshLambertMaterial({ color: 0x5a5f66 });
  MAT.cable = new THREE.LineBasicMaterial({ color: 0x222428 });
  MAT.node = new THREE.MeshLambertMaterial({ color: 0x3a4048 });
  MAT.lodge = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
  MAT.roof = new THREE.MeshLambertMaterial({ color: 0x4a2a1c });
}

function makeRibbon(pts, color, opacity = 0.62, width = RUN_WIDTH, colors = null, flat = false) {
  const n = pts.length, across = 7, pos = new Float32Array(n * across * 3);
  const col = colors ? new Float32Array(n * across * 3) : null, tc = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (let c = 0; c < across; c++) {
      const o = (c / (across - 1) - 0.5) * width;
      const x = pts[i].x - dz * o, z = pts[i].z + dx * o, k = (i * across + c) * 3;
      pos[k] = x; pos[k + 1] = (flat ? pts[i].y : Terrain.height(x, z)) + 2; pos[k + 2] = z;
      if (col) { tc.set(colors[i]); col[k] = tc.r; col[k + 1] = tc.g; col[k + 2] = tc.b; }
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let c = 0; c < across - 1; c++) {
    const a = i * across + c, b = a + 1, d = a + across, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: col ? 0xffffff : color, vertexColors: !!col, transparent: true, opacity, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = 2;
  return mesh;
}

function disposeGroup(obj) {
  const shared = new Set([...Object.values(GEO), MAT.tower, MAT.cable, MAT.node, MAT.lodge, MAT.roof, ...Object.values(makeFoodVisual.M || {})]);
  obj.traverse((o) => {
    if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
    if (o.material && !shared.has(o.material)) o.material.dispose();
  });
}

function makeNodeVisual(n) {
  const g = new THREE.Group();
  g.position.set(n.x, n.y, n.z);
  if (n.base) {
    const body = new THREE.Mesh(GEO.box, MAT.lodge); body.scale.set(46, 18, 30); body.position.y = 9;
    const roof = new THREE.Mesh(GEO.roof, MAT.roof); roof.scale.set(36, 16, 26); roof.position.y = 18;
    g.add(body, roof);
  } else if (n.food) {
    g.add(makeFoodVisual(n));
  } else {
    g.add(new THREE.Mesh(GEO.disc, MAT.node));
  }
  return g;
}

// Hut: log walls on a stone plinth, steep roof, terrace on the downhill side with parasols.
// Restaurant: glass ground floor, timber upper floor, flat roof, a long terrace.
function makeFoodVisual(n) {
  const T = FOOD_TYPES[n.food.type], g = new THREE.Group(), M = makeFoodVisual.M || (makeFoodVisual.M = {
    stone: new THREE.MeshLambertMaterial({ color: 0x8d8a85 }), log: new THREE.MeshLambertMaterial({ color: 0x7a4b26 }),
    deck: new THREE.MeshLambertMaterial({ color: 0xa8754a }), roof: new THREE.MeshLambertMaterial({ color: 0x5a3a28 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x9fc7ff, transparent: true, opacity: 0.6 }), flat: new THREE.MeshLambertMaterial({ color: 0x3d434b }),
    red: new THREE.MeshLambertMaterial({ color: 0xc0392b }), white: new THREE.MeshLambertMaterial({ color: 0xf2efe8 }),
  });
  const add = (mat, w, h, d, x, y, z, geo = GEO.box) => { const m = new THREE.Mesh(geo, mat); m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m); return m; };
  const W = T.w, D = T.d, drop = n.food.drop || 0;        // drop: how far the ground falls away under the building
  add(M.stone, W + 1, 3 + drop, D + 1, 0, (3 - drop) / 2 - 0.5, -2);
  if (n.food.type === 'hut') {
    add(M.log, W, 8, D, 0, 5, -2);
    for (const x of [-W / 4, W / 4]) add(M.glass, 3, 3, 0.4, x, 5, D / 2 - 1.9);
    add(M.roof, W * 0.82, 9, D * 0.82, 0, 9, -2, GEO.roof).rotation.y = 0;
    add(M.stone, 2.2, 6, 2.2, W / 3, 14, -4);                 // chimney
  } else {
    add(M.glass, W, 6, D, 0, 4.5, -2);
    add(M.log, W + 1, 6, D + 1, 0, 10.5, -2);
    for (let x = -W / 2 + 4; x < W / 2; x += 6) add(M.glass, 3.4, 3, 0.4, x, 10.5, D / 2 - 1.4);
    add(M.flat, W + 3, 1, D + 3, 0, 14, -2);
  }
  // terrace in front (+z), on stilts where the ground drops
  const tw = W + 4, td = n.food.type === 'hut' ? 12 : 16;
  add(M.deck, tw, 0.6, td, 0, 1.2, D / 2 - 2 + td / 2);
  add(M.stone, tw, 1 + drop, 0.8, 0, (1 - drop) / 2, D / 2 - 2 + td);
  for (let k = 0; k < (n.food.type === 'hut' ? 3 : 5); k++) {
    const x = -tw / 2 + (tw * (k + 0.5)) / (n.food.type === 'hut' ? 3 : 5), z = D / 2 - 2 + td / 2;
    add(M.white, 0.3, 4.5, 0.3, x, 3.7, z);
    add(k % 2 ? M.white : M.red, 6, 1.4, 6, x, 6.2, z, GEO.roof);
  }
  g.rotation.y = n.food.rot || 0;
  return g;
}

// ---------- network ----------
const Net = {
  reset(scene) {
    this.nodes = []; this.lifts = []; this.runs = []; this.paths = [];
    this.seq = { lift: 1, run: 1, node: 1 }; this.version = 0;
    this.group = new THREE.Group(); scene.add(this.group);
  },

  nearestNode(x, z, r = SNAP) {
    let best = null, bd = r;
    for (const n of this.nodes) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  },

  addNode(x, z, opts = {}) {
    const n = Object.assign({ id: this.seq.node++, x, z, y: Terrain.height(x, z), base: false, name: null, lifts: [], runs: [], links: [] }, opts);
    n.vis = makeNodeVisual(n); this.group.add(n.vis);
    if (n.base) n.label = Labels.add(`<span class="ico">⌂</span>${n.name}`, 'base', { x: n.x, y: n.y + 40, z: n.z });
    if (n.food) n.label = Labels.add(`<span class="ico">${FOOD_TYPES[n.food.type].icon}</span>${n.food.name}`, 'base', { x: n.x, y: n.y + 30, z: n.z });
    this.nodes.push(n);
    return n;
  },

  pointNode(p) {
    if (p.node) return p.node;
    const n = this.addNode(p.x, p.z);
    if (p.home) {                                    // a station moved off its spot: footpath back to it
      this.resolveJunction(p.home);                  // the spot may be a point on a piste, split it there
      if (p.home.node) this.linkNodes(n, p.home.node);
    }
    p.node = n;
    return n;
  },
  pointY(p) { return p.node ? p.node.y : Terrain.height(p.x, p.z); },

  pruneNodes() {
    this.nodes = this.nodes.filter((n) => {
      if (n.base || n.food || n.lifts.length || n.runs.length) return true;
      this.unlinkNode(n);
      this.group.remove(n.vis); return false;
    });
  },

  liftPlan(type, p, q, free = false, manual = false, place = true) {
    type = LIFT_ALIASES[type] || type;
    const T = LIFT_TYPES[type];
    let a = p, b = q, ya = this.pointY(p), yb = this.pointY(q);
    if (yb < ya) { [a, b] = [b, a]; [ya, yb] = [yb, ya]; }
    // starting at the top of (or ending at the bottom of) a lift of the same type continues that line,
    // through a shared angle station
    let joinWith = null, bendDeg = 0;
    if (Lifts.canHaveStations(T)) {
      if (a.node) joinWith = this.lifts.find((x) => x.type === type && x.b === a.node && !Lifts.partnerAbove(x));
      if (!joinWith && b.node) joinWith = this.lifts.find((x) => x.type === type && x.a === b.node && !Lifts.partnerBelow(x));
      if (joinWith) {
        const h0 = Math.hypot(b.x - a.x, b.z - a.z) || 1, dx = (b.x - a.x) / h0, dz = (b.z - a.z) / h0, j = joinWith.dir;
        bendDeg = Math.acos(clamp(dx * j.ux + dz * j.uz, -1, 1)) * 180 / Math.PI;
      }
    }
    // don't build a station on top of a lodge or another station: move it to free ground next to it
    if (place) {
      const shared = (pt) => joinWith && pt.node && (joinWith.a === pt.node || joinWith.b === pt.node);
      if (!shared(a)) a = this.freeStationSpot(T, a, b, true);
      if (!shared(b)) b = this.freeStationSpot(T, b, a, false);
      if (a.moved || b.moved) var crossed = this.crossings(a, b);
      ya = this.pointY(a); yb = this.pointY(b);
    }
    const hl = Math.hypot(b.x - a.x, b.z - a.z), vert = yb - ya, len = Math.hypot(hl, vert);
    const P = Lifts.profile(T, a, ya, b, yb, manual && T.kind !== 'belt' ? [] : null);
    const trees = Terrain.treesNear([a, b], T.gauge + 8).length;
    let towersCost = 0;
    for (const t of P.prof.slice(1, -1)) towersCost += Lifts.towerPrice(T, t.y - P.ground(t.s));
    const build = T.baseCost + T.perM * len + towersCost, cost = build + trees * TREE_COST;
    const grade = T.kind === 'belt' || T.kind === 'surface' ? Lifts.maxGroundGrade(P) : 0;
    const aName = (/^[aeiou8]/i.test(T.name) ? 'An ' : 'A ') + T.name.toLowerCase();
    let msg = null;
    if (a.node && a.node === b.node) msg = 'Both ends are on the same spot';
    else if (hl < T.minLen) msg = `Too short. ${aName} needs at least ${T.minLen} m`;
    else if (len > T.maxLen) msg = `Too long. ${aName} can be at most ${fmt(T.maxLen)} m`;
    else if (vert < T.minVert) msg = `${aName} needs at least ${T.minVert} m of climb`;
    else if (T.maxGrade && grade > T.maxGrade) msg = `Too steep for ${aName.toLowerCase()} (${Math.round(grade * 100)}% here, max ${Math.round(T.maxGrade * 100)}%)`;
    else if (joinWith && bendDeg > 90) msg = `An angle station can turn the line by at most 90° (this is ${Math.round(bendDeg)}°)`;
    let shared = joinWith ? T.baseCost * 0.4 : 0;           // one station building instead of two terminals
    if (!msg && !free && cost - shared > Game.money) msg = 'Not enough money';
    return { ok: !msg, msg, a, b, hl, len, vert, cost: cost - shared, build: build - shared, trees, towers: P.towers, T, type,
             manual: manual && T.kind !== 'belt', joinWith, bendDeg, crossed: typeof crossed !== 'undefined' ? crossed : [] };
  },

  // Buildings already standing: lodges and every lift station (planned ones too).
  footprints(except = null) {
    const out = [];
    for (const n of this.nodes) if (n.base) out.push(Lifts.lodgeFootprint(n));
    for (const n of this.nodes) if (n.food) out.push(this.foodFootprint(n));
    for (const l of this.lifts) {
      if (l === except) continue;
      out.push(Lifts.partnerBelow(l) ? Lifts.junctionFootprint(l.T, l.a, l.dir.ux, l.dir.uz, false) : Lifts.stationFootprint(l.T, l.a, l.dir.ux, l.dir.uz, true));
      out.push(Lifts.partnerAbove(l) ? Lifts.junctionFootprint(l.T, l.b, l.dir.ux, l.dir.uz, true) : Lifts.stationFootprint(l.T, l.b, l.dir.ux, l.dir.uz, false));
    }
    return out;
  },

  // If the station at point `pt` (towards `other`) would overlap a building, find the nearest free
  // spot around it (sideways first) and return it linked to the original node by a footpath.
  // lifts whose lines cross the segment p-q (shared stations and touching ends don't count)
  crossings(p, q, except = null) {
    const out = [];
    const cross = (a, b, c, d) => {
      const o = (p1, p2, p3) => (p2.x - p1.x) * (p3.z - p1.z) - (p2.z - p1.z) * (p3.x - p1.x);
      const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
      return d1 * d2 < 0 && d3 * d4 < 0;
    };
    for (const l of this.lifts) {
      if (l === except || (except && except.line && l.line === except.line)) continue;
      if (cross(p, q, l.a, l.b)) out.push(l);
    }
    return out;
  },

  freeStationSpot(T, pt, other, bottom, fps = this.footprints(), except = null) {
    const fpAt = (x, z) => {
      const dx = other.x - x, dz = other.z - z, d = Math.hypot(dx, dz) || 1;
      return Lifts.stationFootprint(T, { x, z }, dx / d, dz / d, bottom);
    };
    const clashes = (x, z) => { const f = fpAt(x, z); return fps.some((g) => Lifts.overlaps(f, g)); };
    if (!clashes(pt.x, pt.z)) return pt;
    const d0 = Math.hypot(other.x - pt.x, other.z - pt.z) || 1, ux = (other.x - pt.x) / d0, uz = (other.z - pt.z) / d0;
    // first look for a spot whose lift line crosses no other lift, then settle for any free spot
    for (const avoidCrossing of [true, false]) {
      for (const dist of [30, 42, 55, 70, 88, 110, 135, 160]) {
        for (const deg of [90, -90, 60, -60, 120, -120, 30, -30, 150, -150, 0, 180]) {
          const r = deg * Math.PI / 180, dx = ux * Math.cos(r) - uz * Math.sin(r), dz = ux * Math.sin(r) + uz * Math.cos(r);
          const x = pt.x + dx * dist, z = pt.z + dz * dist;
          if (!Terrain.inside(x, z) || clashes(x, z)) continue;
          if (avoidCrossing && this.crossings({ x, z }, other, except).length) continue;
          return { x, z, home: pt.node || pt.junction ? pt : null, moved: true };
        }
      }
    }
    return pt;
  },

  // Move stations that overlap a lodge or an earlier station (e.g. from saves made before stations
  // were kept apart). Free of charge; the first-built station keeps its spot. Returns notes.
  untangleStations() {
    const accepted = this.nodes.filter((n) => n.base).map((n) => Lifts.lodgeFootprint(n));
    const notes = { moved: 0, reset: [] };
    const P = (n) => ({ x: n.x, z: n.z, node: n });
    for (const l of [...this.lifts].sort((a, b) => a.id - b.id)) {
      let changed = false;
      const oldA = { x: l.a.x, z: l.a.z }, oldDir = { ...l.dir };
      for (const end of ['a', 'b']) {
        const node = l[end], bottom = end === 'a', other = bottom ? l.b : l.a;
        const shared = bottom ? Lifts.partnerBelow(l) : Lifts.partnerAbove(l);     // stations on a line share one hall
        const fp = Lifts.stationFootprint(l.T, node, l.dir.ux, l.dir.uz, bottom);
        if (!shared && accepted.some((g) => Lifts.overlaps(fp, g))) {
          const spot = this.freeStationSpot(l.T, P(node), other, bottom, accepted, l);
          if (spot.moved) {
            this.evacuate(l);
            const N = this.addNode(spot.x, spot.z);
            this.linkNodes(N, node);
            node.lifts = node.lifts.filter((x) => x !== l);
            l[end] = N; N.lifts.push(l);
            changed = true; notes.moved++;
          }
        }
        const dx = l.b.x - l.a.x, dz = l.b.z - l.a.z, d = Math.hypot(dx, dz) || 1;
        accepted.push(Lifts.stationFootprint(l.T, l[end], dx / d, dz / d, bottom));
      }
      if (!changed) continue;
      const plan = this.liftPlan(l.type, P(l.a), P(l.b), true, false, false);
      l.len = plan.len; l.vert = plan.vert;
      this.reprojectTowers(l, oldA, oldDir);
      this.rebuildLift(l);
      if (l.customTowers && l.issues.length) { l.customTowers = null; this.rebuildLift(l); notes.reset.push(l.name); }
      const up = Lifts.partnerAbove(l), down = Lifts.partnerBelow(l);
      if (up) this.rebuildLift(up);
      if (down) this.rebuildLift(down);
    }
    if (notes.moved) { this.pruneNodes(); this.version++; }
    return notes;
  },

  // keep the player's pylons when a lift end moves: same ground positions, re-measured along the new line
  reprojectTowers(l, oldA, oldDir) {
    if (!l.customTowers) return;
    const hl = Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z), ux = (l.b.x - l.a.x) / hl, uz = (l.b.z - l.a.z) / hl;
    l.customTowers = l.customTowers.map((t) => {
      const wx = oldA.x + oldDir.ux * t.s, wz = oldA.z + oldDir.uz * t.s;
      return { ...t, s: +((wx - l.a.x) * ux + (wz - l.a.z) * uz).toFixed(1) };
    }).filter((t) => t.s > 15 && t.s < hl - 15);
  },

  // The node a station belongs to: a moved station hangs off its home node by a footpath.
  stationHome(l, end) {
    const n = l[end];
    if (!n.base && n.links.length === 1 && n.lifts.length === 1 && !n.runs.length) return n.links[0];
    return n;
  },

  // Player moves one end station of a lift (within walking distance of its home node).
  moveStationPlan(l, end, x, z) {
    const T = l.T, home = this.stationHome(l, end), bottom = end === 'a';
    if (bottom ? Lifts.partnerBelow(l) : Lifts.partnerAbove(l)) return { ok: false, msg: 'This station is shared with the next section of the line' };
    const atHome = Math.hypot(x - home.x, z - home.z) < 25;
    const px = atHome ? home.x : x, pz = atHome ? home.z : z;
    const P = (n) => ({ x: n.x, z: n.z, node: n });
    const here = atHome ? P(home) : { x: px, z: pz };
    const other = bottom ? l.b : l.a;
    const out = { ok: true, msg: null, x: px, z: pz, atHome, home, crossings: [], cost: 0 };
    if (Math.hypot(px - home.x, pz - home.z) > 220) return { ...out, ok: false, msg: 'Too far from its lodge or runs (max 220 m of footpath)' };
    if (!Terrain.inside(px, pz)) return { ...out, ok: false, msg: 'Outside the map' };
    const dx = other.x - px, dz = other.z - pz, d = Math.hypot(dx, dz) || 1;
    const fp = Lifts.stationFootprint(T, { x: px, z: pz }, (bottom ? 1 : -1) * dx / d, (bottom ? 1 : -1) * dz / d, bottom);
    if (this.footprints(l).some((g) => Lifts.overlaps(fp, g))) return { ...out, ok: false, msg: 'It would overlap another building' };
    const plan = this.liftPlan(l.type, bottom ? here : P(l.a), bottom ? P(l.b) : here, true, false, false);
    if (!plan.ok) return { ...out, ok: false, msg: plan.msg };
    const now = this.liftPlan(l.type, P(l.a), P(l.b), true, false, false);
    out.cost = l.planned ? 0 : Math.max(0, plan.build - now.build);   // only extra length is paid for
    if (out.cost > Game.money) return { ...out, ok: false, msg: `Not enough money (${money(out.cost)} for the extra length)` };
    out.crossings = this.crossings(bottom ? { x: px, z: pz } : l.a, bottom ? l.b : { x: px, z: pz }, l);
    out.fp = fp; out.plan = plan;
    return out;
  },
  moveStation(l, end, x, z) {
    const mp = this.moveStationPlan(l, end, x, z);
    if (!mp.ok) return mp;
    this.evacuate(l);
    const oldA = { x: l.a.x, z: l.a.z }, oldDir = { ...l.dir }, old = l[end];
    old.lifts = old.lifts.filter((x2) => x2 !== l);
    let N = mp.home;
    if (!mp.atHome) { N = this.addNode(mp.x, mp.z); this.linkNodes(N, mp.home); }
    l[end] = N; N.lifts.push(l);
    l.len = mp.plan.len; l.vert = mp.plan.vert;
    this.reprojectTowers(l, oldA, oldDir);
    this.rebuildLift(l);
    if (l.customTowers && l.issues.length) { l.customTowers = null; this.rebuildLift(l); mp.reset = true; }
    if (mp.cost) { Game.spend(mp.cost); l.cost += mp.cost; }
    this.pruneNodes();
    this.version++;
    return mp;
  },

  // ---------- flattening (the Flatten tool) ----------
  // A brush stroke along pts, levelling the ground to height y: flat within `half`, blending back
  // to the natural slope over `margin`. Stored with the other earthworks, so it is saved and replayed.
  flattenOp(pts, y, r) {
    const P = pts.length === 1 ? [pts[0], pts[0]] : pts;
    return { pts: P.map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +y.toFixed(2) })), half: +(r * 0.65).toFixed(1), margin: +(r * 0.55).toFixed(1) };
  },
  flattenPlan(op) {
    const ew = Terrain.computeEarthwork(op), trees = Terrain.treesNear(op.pts, op.half).length;
    const volume = ew.cut + ew.fill, cost = volume * EARTH_COST + trees * TREE_COST;
    const out = { op, ew, trees, volume, cost, ok: false };
    if (volume < 1) return { ...out, msg: 'The ground here is already level' };
    if (cost > Game.money) return { ...out, msg: `Not enough money (${money(cost)})` };
    return { ...out, ok: true, msg: null };
  },
  flatten(plan) {
    Terrain.clearTrees(plan.op.pts, plan.op.half);
    Terrain.applyEarthwork(plan.op);
    Game.earthworks.push(plan.op);
    Game.spend(plan.cost);
    this.refreshHeights();                          // stations, runs and lifts follow the new ground
    this.version++;
  },

  // ---------- restaurants ----------
  foodFootprint(n, type = n.food.type, rot = n.food.rot || 0) {
    const T = FOOD_TYPES[type], ux = Math.sin(rot), uz = Math.cos(rot), td = type === 'hut' ? 12 : 16;
    const back = T.d / 2 + 2, ahead = T.d / 2 - 2 + td, mid = (ahead - back) / 2;   // building behind, terrace ahead
    return { cx: n.x + ux * mid, cz: n.z + uz * mid, ux, uz, hl: (ahead + back) / 2, hw: T.w / 2 + 2 };
  },
  // Where a restaurant of this type would go at (x, z): it joins the nearest station, lodge or piste
  // within FOOD_REACH by a footpath, and faces its terrace down the fall line.
  foodPlan(type, x, z) {
    const T = FOOD_TYPES[type], out = { ok: false, type, T, x, z, cost: T.cost };
    if (!Terrain.inside(x, z)) return { ...out, msg: 'Outside the map' };
    let attach = null, bd = FOOD_REACH;
    for (const n of this.nodes) {
      if (n.food) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; attach = { x: n.x, z: n.z, y: n.y, node: n }; }
    }
    const j = this.nearestRunPoint(x, z, Math.min(bd, FOOD_REACH));
    if (j && Math.hypot(j.x - x, j.z - z) < bd - 20) { bd = Math.hypot(j.x - x, j.z - z); attach = { x: j.x, z: j.z, y: j.y, junction: j }; }
    if (!attach) return { ...out, msg: `Build it within ${FOOD_REACH} m of a lift station, a piste or a lodge, so guests can get there` };
    if (Terrain.slope(x, z) > 0.7) return { ...out, attach, msg: 'Too steep to build here' };
    const e = 10, gx = Terrain.height(x + e, z) - Terrain.height(x - e, z), gz = Terrain.height(x, z + e) - Terrain.height(x, z - e);
    const rot = Math.hypot(gx, gz) > 0.5 ? Math.atan2(-gx, -gz) : Math.atan2(attach.x - x, attach.z - z);   // terrace downhill
    const fp = this.foodFootprint({ x, z }, type, rot);
    if (this.footprints().some((f) => Lifts.overlaps(fp, f))) return { ...out, attach, rot, fp, msg: 'It would overlap another building' };
    const trees = Terrain.treesNear([{ x, z }], T.w / 2 + 8).length, cost = T.cost + trees * TREE_COST;
    let drop = 0;
    for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cx = fp.cx + fp.ux * fp.hl * px - fp.uz * fp.hw * pz, cz = fp.cz + fp.uz * fp.hl * px + fp.ux * fp.hw * pz;
      drop = Math.max(drop, Terrain.height(x, z) - Terrain.height(cx, cz));
    }
    const res = { ...out, attach, rot, fp, trees, cost, walk: bd, drop: Math.min(drop + 1, 30) };
    if (cost > Game.money) return { ...res, msg: 'Not enough money' };
    return { ...res, ok: true, msg: null };
  },
  buildFood(plan) {
    const p = { ...plan.attach };
    this.resolveJunction(p);
    if (!p.node) return null;
    const used = new Set(this.nodes.filter((n) => n.food).map((n) => n.food.name));
    const name = FOOD_NAMES.find((x) => !used.has(x)) || `${plan.T.name} ${this.nodes.filter((n) => n.food).length + 1}`;
    const n = this.addNode(plan.x, plan.z, { food: { type: plan.type, name, rot: plan.rot, drop: plan.drop } });
    this.linkNodes(n, p.node);
    Terrain.clearTrees([{ x: plan.x, z: plan.z }], plan.T.w / 2 + 8);
    Game.spend(plan.cost);
    this.version++;
    return n;
  },
  foodNear(x, z, r = 30) {
    let best = null, bd = r;
    for (const n of this.nodes) if (n.food) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  },
  removeFood(n) {
    const exit = n.links.find((m) => !m.food) || n.links[0] || null;
    for (const s of Game.skiers) if (s.node === n && (s.state === 'eat' || s.state === 'atNode')) {
      Game.leaveTable(s); s.state = 'atNode'; s.node = exit || s.node;
    }
    Game.money += FOOD_TYPES[n.food.type].cost * 0.5;
    if (n.label) n.label.remove();
    delete n.food; n.label = null;
    this.group.remove(n.vis); disposeGroup(n.vis);
    if (n.runs.length || n.lifts.length) { n.vis = makeNodeVisual(n); this.group.add(n.vis); }
    else { this.nodes = this.nodes.filter((x) => x !== n); this.unlinkNode(n); }
    this.version++;
  },

  // A lift end that nothing leads to or from: no lodge, run, footpath or other lift section.
  isolatedEnd(l, end) {
    const n = l[end];
    return !n.base && !n.runs.length && !n.links.length && n.lifts.every((x) => x === l);
  },

  // Player joins a station to a lodge, another station or a point on a piste with a footpath (free).
  footpathPlan(l, end, t) {
    const n = l[end];
    if (!t || !(t.node || t.junction)) return { ok: false, msg: 'Point at a lodge, a lift station or a piste' };
    if (t.node === n) return { ok: false, msg: 'That is this station itself' };
    if (t.node && n.links.includes(t.node)) return { ok: false, msg: 'Already joined by a footpath' };
    const d = Math.hypot(t.x - n.x, t.z - n.z);
    if (d > 220) return { ok: false, msg: `Too far (${Math.round(d)} m, max 220 m of footpath)` };
    return { ok: true, msg: null, n, t, d };
  },
  addFootpath(l, end, t) {
    const fp = this.footpathPlan(l, end, t);
    if (!fp.ok) return fp;
    const p = { ...t };
    this.resolveJunction(p);
    if (!p.node) return { ok: false, msg: 'That piste changed, point at it again' };
    this.linkNodes(fp.n, p.node);
    this.version++;
    return fp;
  },

  // footpath between a moved station and the node it belongs to; skiers walk it freely
  linkNodes(a, b) {
    if (!a || !b || a === b || a.links.includes(b)) return;
    a.links.push(b); b.links.push(a);
    const pts = [], n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 6));
    for (let k = 0; k <= n; k++) { const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n; pts.push({ x, y: Terrain.height(x, z), z }); }
    const vis = makeRibbon(pts, 0x8d7a66, 0.85, 6);
    this.group.add(vis);
    this.paths.push({ a, b, vis });
  },
  unlinkNode(n) {
    for (const m of n.links) m.links = m.links.filter((x) => x !== n);
    n.links = [];
    this.paths = this.paths.filter((p) => {
      if (p.a !== n && p.b !== n) return true;
      this.group.remove(p.vis); disposeGroup(p.vis); return false;
    });
  },
  // Every node a skier can walk to from n: the whole network of footpaths, not just the next hop
  // (a station moved beside another moved station hangs two paths away from the lodge).
  hubOf(n) {
    if (!n.links || !n.links.length) return [n];
    const out = [n];
    for (let i = 0; i < out.length; i++) for (const m of out[i].links) if (!out.includes(m)) out.push(m);
    return out;
  },

  buildLift(plan, free = false, opt = null, name = null) {
    this.resolveJunction(plan.a); this.resolveJunction(plan.b);
    const A = this.pointNode(plan.a), B = this.pointNode(plan.b), T = plan.T;
    const l = { kind: 'lift', id: this.seq.lift++, type: plan.type, T, a: A, b: B, len: plan.len, vert: plan.vert,
                cost: plan.build, queue: [], carriers: [], clock: 0, dist: 0, nextD: 0, next: T.dwell || 0,
                opt: Object.assign(Lifts.defaultOpt(), opt || {}), ridesToday: 0, customTowers: plan.customTowers || (plan.manual ? [] : null),
                planned: !!plan.planned };
    if (l.planned) { l.opt.open = false; l.cost = 0; free = true; }
    if (plan.manual) l.opt.open = false;           // opens once the pylons pass inspection
    l.name = name || `L${l.id}`;
    if (plan.joinWith) {
      const j = plan.joinWith;
      l.line = j.line = j.line || this.newLine();
      l.name = name || j.name;
      for (const k of ['color', 'pylon']) if (j.opt[k] != null && l.opt[k] == null) l.opt[k] = j.opt[k];
      if (T.kind !== 'tram') { l.opt.speed = j.opt.speed; l.opt.density = j.opt.density; }   // carriers ride through: one rope speed
    } else if (plan.line) l.line = plan.line;
    Lifts.build(l);
    if (plan.joinWith) this.rebuildLift(plan.joinWith);   // its terminal at the shared node becomes the station
    if (l.issues.length || l.planned) l.opt.open = false;
    this.group.add(l.vis);
    l.label = Labels.add('', 'queue', { x: A.x, y: A.y + Math.max(T.towerH, 6) + 26, z: A.z });
    A.lifts.push(l); B.lifts.push(l); this.lifts.push(l);
    if (!free) Terrain.clearTrees([A, B], T.gauge + 8);
    if (!free) Game.spend(plan.cost);
    this.version++;
    return l;
  },

  refreshHeights() {
    for (const n of this.nodes) {
      n.y = Terrain.height(n.x, n.z); n.vis.position.y = n.y;
      if (n.label) n.label.pos.y = n.y + 40;
    }
    for (const p of this.paths.splice(0)) {          // footpaths follow the new ground
      this.group.remove(p.vis); disposeGroup(p.vis);
      p.a.links = p.a.links.filter((x) => x !== p.b); p.b.links = p.b.links.filter((x) => x !== p.a);
      this.linkNodes(p.a, p.b);
    }
    for (const r of this.runs) {
      if (!(r.planned && r.gradeDeg)) for (const p of r.dense) p.y = Terrain.height(p.x, p.z);   // graded plans keep their target
      r.path = new Path(r.dense);
      this.group.remove(r.vis); disposeGroup(r.vis);
      r.vis = this.ribbonFor(r); this.group.add(r.vis);
      const s = r.dense[Math.min(6, r.dense.length - 1)]; r.label.pos.y = s.y + 22;
    }
    for (const l of this.lifts) {
      this.group.remove(l.vis); Lifts.dispose(l.vis);
      Lifts.build(l); this.group.add(l.vis);
      l.label.pos.y = l.a.y + Math.max(l.T.towerH, 6) + 26;
    }
  },

  newLine() { return 'ln-' + Math.random().toString(36).slice(2, 10); },

  rebuildLift(l) {
    this.group.remove(l.vis); Lifts.dispose(l.vis); Lifts.build(l); this.group.add(l.vis);
  },

  lineOf(l) {
    if (!l.line) return [l];
    let first = l; while (Lifts.partnerBelow(first)) first = Lifts.partnerBelow(first);
    const out = [first]; let x = first; while ((x = Lifts.partnerAbove(x))) out.push(x);
    return out;
  },

  // Insert a station at distance s along lift l: the lift becomes two sections of one line.
  midStationPlan(l, s) {
    const T = l.T, hl = Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z);
    if (!Lifts.canHaveStations(T)) return { ok: false, msg: `${T.name}s can't have intermediate stations` };
    if (s < 150 || s > hl - 150) return { ok: false, msg: 'A station needs at least 150 m of line on both sides' };
    const x = l.a.x + l.dir.ux * s, z = l.a.z + l.dir.uz * s, y = Terrain.height(x, z);
    if (y < l.a.y + 8 || y > l.b.y - 8) return { ok: false, msg: 'The station must be higher than the bottom and lower than the top' };
    const cost = l.planned ? 0 : T.baseCost * 0.45 + 40000;
    if (cost > Game.money) return { ok: false, msg: 'Not enough money', cost };
    return { ok: true, x, z, y, s, cost };
  },
  addMidStation(l, s) {
    const plan = this.midStationPlan(l, s);
    if (!plan.ok) return plan;
    this.evacuate(l);
    const M = this.addNode(plan.x, plan.z);
    const top = l.b, P = (n) => ({ x: n.x, z: n.z, node: n });
    const p2 = this.liftPlan(l.type, P(M), P(top), true, false, false);
    p2.planned = l.planned;
    if (l.customTowers) p2.customTowers = l.customTowers.filter((t) => t.s > s + 20).map((t) => ({ ...t, s: t.s - s }));
    // shorten l to the lower section
    top.lifts = top.lifts.filter((x) => x !== l);
    l.b = M; M.lifts.push(l);
    const p1 = this.liftPlan(l.type, P(l.a), P(M), true, false, false);
    if (l.customTowers) l.customTowers = l.customTowers.filter((t) => t.s < s - 20);
    l.len = p1.len; l.vert = p1.vert;
    l.line = l.line || this.newLine();
    p2.line = l.line;
    const l2 = this.buildLift(p2, true, { ...l.opt }, l.name);
    l2.cost = l.planned ? 0 : p2.build * 0.3;      // the existing rope and pylons were re-used
    this.rebuildLift(l);
    this.rebuildLift(l2);
    if (!l.planned) Game.spend(plan.cost);
    this.version++;
    return { ok: true, cost: plan.cost, node: M, upper: l2 };
  },
  // Remove a mid/angle station: the two sections become one straight lift.
  removeStation(node) {
    const low = this.lifts.find((x) => x.b === node && Lifts.partnerAbove(x)), up = low && Lifts.partnerAbove(low);
    if (!low || !up) return { ok: false, msg: 'This is not a station on a lift line' };
    if (node.runs.length || node.lifts.length > 2) return { ok: false, msg: 'Runs or other lifts use this station; remove them first' };
    const P = (n) => ({ x: n.x, z: n.z, node: n });
    const plan = this.liftPlan(low.type, P(low.a), P(up.b), true, false, false);
    if (!plan.ok) return plan;
    this.evacuate(low); this.evacuate(up);
    this.lifts.splice(this.lifts.indexOf(up), 1);
    up.b.lifts = up.b.lifts.filter((x) => x !== up);
    this.group.remove(up.vis); Lifts.dispose(up.vis); up.label.remove();
    node.lifts = [];
    low.b = up.b; up.b.lifts.push(low);
    low.len = plan.len; low.vert = plan.vert; low.customTowers = null;
    if (!this.lineOf(low).some((x) => x !== low)) low.line = null;
    this.rebuildLift(low);
    this.pruneNodes();
    this.version++;
    return { ok: true };
  },

  evacuate(l) {
    for (const s of Game.skiers) if (s.edge === l) { const top = s.down && s.state === 'queue'; s.state = 'atNode'; s.edge = null; s.node = top ? l.b : l.a; s.down = false; }
    l.queue.length = 0; l.carriers.length = 0; l.downQueue = []; l.downCarriers = [];
  },

  // swap the lift machinery, keeping the stations; half the old lift's value is credited
  upgradePlan(l, type) {
    if (l.line && this.lineOf(l).length > 1) return { ok: false, msg: 'Remove the stations on this line before changing its type', cost: 0 };
    const P = (n) => ({ x: n.x, z: n.z, node: n });
    const plan = this.liftPlan(type, P(l.a), P(l.b), true, false, false);
    plan.cost = l.planned ? 0 : Math.max(0, plan.cost - l.cost * 0.5);
    if (plan.ok && plan.cost > Game.money) { plan.ok = false; plan.msg = 'Not enough money'; }
    return plan;
  },
  upgradeLift(l, type) {
    const plan = this.upgradePlan(l, type);
    if (!plan.ok) return plan;
    this.evacuate(l);
    this.group.remove(l.vis); Lifts.dispose(l.vis);
    l.type = plan.type; l.T = plan.T; l.cost = l.planned ? 0 : plan.build; l.len = plan.len; l.customTowers = null;
    if (!(l.T.pylons || []).includes(l.opt.pylon)) delete l.opt.pylon;
    l.clock = l.dist = l.nextD = 0; l.next = l.T.dwell || 0;
    Lifts.build(l);
    this.group.add(l.vis);
    if (!l.planned) { Terrain.clearTrees([l.a, l.b], l.T.gauge + 8); Game.spend(plan.cost); }
    this.version++;
    this.untangleStations();             // a bigger terminal may now overlap a neighbour
    return plan;
  },
  setLiftOpen(l, open) {
    if (open && l.planned) return false;                             // still only a plan
    if (open && l.issues && l.issues.length) return false;        // failed safety inspection
    if (l.opt.open === open) return true;
    l.opt.open = open;
    if (!open) for (const s of [...l.queue, ...(l.downQueue || [])]) { s.state = 'atNode'; s.edge = null; s.down = false; }
    if (!open) { l.queue.length = 0; l.downQueue = []; }
    this.version++;
    return true;
  },

  // Change the pylon style of the whole lift (pylons without their own style follow it).
  pylonStylePlan(l, style) {
    const towers = l.customTowers || Lifts.autoTowers(l.T, l.a, l.a.y, l.b, l.b.y);
    const now = Lifts.towersValue(l.T, towers, Lifts.pylonType(l));
    const next = Lifts.towersValue(l.T, towers.map((t) => ({ ...t, type: t.type && PYLONS[t.type].perPylon ? t.type : undefined })), style);
    const tooTall = towers.some((t) => t.h > Lifts.maxPylonH(l.T, style));
    const diff = l.planned ? 0 : next - now;
    return { diff, charge: diff > 0 ? diff : diff / 2, tooTall };
  },
  setPylonStyle(l, style) {
    if (PYLONS[style] && PYLONS[style].perPylon) return { ok: false, msg: `${PYLONS[style].name} is chosen per pylon in the pylon editor` };
    const p = this.pylonStylePlan(l, style);
    if (p.tooTall) return { ok: false, msg: `Some pylons are taller than ${PYLONS[style].name.toLowerCase()} pylons allow (${Lifts.maxPylonH(l.T, style)} m)` };
    if (p.charge > Game.money) return { ok: false, msg: 'Not enough money' };
    if (p.charge > 0) Game.spend(p.charge); else Game.money -= p.charge;
    l.opt.pylon = style;
    // keep wheels, lean, links and per-pylon-only types (Y-pylons); other pylons follow the new style
    if (l.customTowers) l.customTowers = l.customTowers.map(({ type, ...rest }) => (type && PYLONS[type] && PYLONS[type].perPylon ? { ...rest, type } : rest));
    this.group.remove(l.vis); Lifts.dispose(l.vis); Lifts.build(l); this.group.add(l.vis);
    return { ok: true, charge: p.charge };
  },
  recolorLift(l, hex) { for (const x of this.lineOf(l)) x.opt.color = hex; },
  // carriers ride through the stations of a line, so all its sections run at one speed and spacing
  // (each section of an aerial tramway is its own tramway with its own cabins, so those stay separate)
  sharesSpeed(l) { return l.T.kind !== 'tram' && this.lineOf(l).length > 1; },
  syncLine(l) {
    if (l.T.kind === 'tram') return;
    for (const x of this.lineOf(l)) { x.opt.speed = l.opt.speed; x.opt.density = l.opt.density; }
  },

  // Replace a lift's pylons (from the pylon editor) and rebuild it.
  setTowers(l, towers) {
    l.customTowers = towers.map((t) => {
      const o = { s: +t.s.toFixed(1), h: Math.round(t.h) };
      if (t.type) o.type = t.type;
      if (t.wheels) o.wheels = t.wheels;
      if (t.mode && t.mode !== 'auto') o.mode = t.mode;
      if (t.lean) o.lean = Math.round(t.lean * 10) / 10;
      if (t.link) o.link = true;
      if ((t.type === 'y' || t.type === 'twin') && t.spread) o.spread = Math.round(t.spread);
      return o;
    });
    this.group.remove(l.vis); Lifts.dispose(l.vis);
    Lifts.build(l); this.group.add(l.vis);
    if (l.issues.length) this.setLiftOpen(l, false);
  },

  runPlan(points, free = false, gradeDeg = null) {
    if (points.length < 2) return { ok: false, msg: 'Click more points down the slope' };
    let dense = smoothLine(points).map((p) => ({ x: p.x, y: Terrain.height(p.x, p.z), z: p.z }));
    let earth = null;
    if (gradeDeg) {
      earth = gradeProfile(dense, degToGrade(gradeDeg));
      if (!earth.pts) {
        return { ok: false, dense, path: new Path(dense), len: 0, drop: 0, maxG: earth.avg, diff: 2, cost: 0, colors: dense.map(() => GRADE_COLORS[3]), steepAt: 0, points, trees: 0, gradeDeg, volume: 0, earthCost: 0,
                 msg: `This line averages ${gradeToDeg(earth.avg).toFixed(0)}°. Grading can't make it ≤ ${gradeDeg}° without moving the stations, so draw it across the slope (try Hold angle).` };
      }
      dense = earth.pts;
      // exact cut-and-fill on the 20 m grid: the same numbers the preview overlay shows
      const ew = Terrain.computeEarthwork({ pts: dense, half: GRADE_HALF, margin: GRADE_MARGIN });
      earth.volume = ew.cut + ew.fill; earth.cut = ew.cut; earth.fill = ew.fill;
    }
    const hc = [0];
    for (let i = 1; i < dense.length; i++) hc.push(hc[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
    let maxG = 0, j = 0;
    for (let i = 0; i < dense.length; i++) {
      while (j < dense.length - 1 && hc[j] - hc[i] < 48) j++;
      if (hc[j] - hc[i] < 20) break;
      maxG = Math.max(maxG, (dense[i].y - dense[j].y) / (hc[j] - hc[i]));
    }
    // skiers coast over small bumps; reject only a sustained climb
    let low = dense[0].y, climb = 0;
    for (const p of dense) { low = Math.min(low, p.y); climb = Math.max(climb, p.y - low); if (p.y < low + 0.01) low = p.y; }
    // local grade around each point, for the colour-coded preview
    const colors = dense.map((_, i) => {
      const a = Math.max(0, i - 3), b = Math.min(dense.length - 1, i + 3), h = hc[b] - hc[a] || 1;
      return GRADE_COLORS[gradeClass((dense[a].y - dense[b].y) / h)];
    });
    let steepAt = 0;
    for (let i = 0, j = 0, best = -1; i < dense.length; i++) {
      while (j < dense.length - 1 && hc[j] - hc[i] < 48) j++;
      const g = hc[j] - hc[i] > 20 ? (dense[i].y - dense[j].y) / (hc[j] - hc[i]) : -1;
      if (g > best) { best = g; steepAt = (i + j) >> 1; }
    }
    // side-hill: how much the piste would lean sideways (worst ~50 m stretch); a graded piste is level
    let cross = 0;
    if (!earth) {
      const cs = dense.map((p, i) => {
        const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)];
        let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const o = RUN_WIDTH / 2;
        return Math.abs(Terrain.height(p.x - dz * o, p.z + dx * o) - Terrain.height(p.x + dz * o, p.z - dx * o)) / RUN_WIDTH;
      });
      for (let i = 0; i + 6 <= cs.length; i++) { let m = 0; for (let q = i; q < i + 6; q++) m += cs[q]; cross = Math.max(cross, m / 6); }
    }
    const trees = Terrain.treesNear(dense, RUN_WIDTH * 0.65).length;
    const path = new Path(dense), len = path.length;
    const drop = dense[0].y - dense[dense.length - 1].y;
    const diff = maxG <= 0.25 ? 0 : maxG <= 0.4 ? 1 : 2;
    const earthCost = earth ? earth.volume * EARTH_COST : 0;
    const build = len * RUN_COST_PER_M + earthCost, cost = build + trees * TREE_COST;
    let msg = null;
    if (drop < 25) msg = 'A run has to go downhill';
    else if (climb > 10) msg = `This line climbs ${Math.round(climb)} m uphill — follow the slope down`;
    else if (maxG > 0.9) msg = earth ? 'Too steep to groom (over 42°)' : 'Too steep to groom (over 42°). Turn on grading to flatten it.';
    else if (!free && cost > Game.money) msg = 'Not enough money';
    return { ok: !msg, msg, dense, path, len, drop, maxG, diff, cost, build, trees, colors, steepAt, points,
             gradeDeg, volume: earth ? earth.volume : 0, earthCost, cross };
  },

  buildRun(plan, free = false) {
    if (plan.planned) free = true;                 // a plan: no earthworks, no felling, no payment
    if (plan.gradeDeg && !free) {
      const op = { pts: plan.dense.map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +p.y.toFixed(2) })),
                   half: GRADE_HALF, margin: GRADE_MARGIN };
      Terrain.applyEarthwork(op);
      Game.earthworks.push(op);
      this.refreshHeights();
      for (const p of plan.dense) p.y = Terrain.height(p.x, p.z);
      plan.path = new Path(plan.dense);
      plan.len = plan.path.length;
    }
    // branching off / joining another piste: split it there and use the junction
    const ends = [plan.points[0], plan.points[plan.points.length - 1]];
    for (const p of ends) this.resolveJunction(p);
    const A = this.pointNode(ends[0]), B = this.pointNode(ends[1]);
    plan.dense[0] = { x: A.x, y: A.y, z: A.z };
    plan.dense[plan.dense.length - 1] = { x: B.x, y: B.y, z: B.z };
    const r = this.addRunEdge({
      a: A, b: B, dense: plan.dense, diff: plan.diff, drop: plan.drop, maxG: plan.maxG, cost: plan.build,
      gradeDeg: plan.gradeDeg || null, cross: plan.cross || 0, piste: plan.piste || null, planned: !!plan.planned,
      points: plan.points.map((p) => ({ x: p.x, z: p.z })),
    });
    if (!free) Terrain.clearTrees(plan.dense, RUN_WIDTH * 0.65);
    this.version++;
    if (free) return r;
    Game.spend(plan.cost);
    const fed = A.base || A.lifts.some((l) => l.b === A) || A.runs.some((x) => x.b === A);
    if (!fed) UI.toast('Nothing brings skiers to the top of this run yet — end a lift there.');
    return r;
  },

  addRunEdge(o) {
    const r = Object.assign({ kind: 'run', id: this.seq.run++ }, o);
    r.piste = r.piste || r.id;                 // segments of one piste share its number
    r.name = `Run ${r.piste}`;
    r.path = new Path(r.dense); r.len = r.path.length;
    if (r.planned) r.cost = 0;
    r.vis = this.ribbonFor(r);
    this.group.add(r.vis);
    const s = r.dense[Math.min(6, r.dense.length - 1)];
    r.label = Labels.add(String(r.piste), `run run-${r.diff}${r.planned ? ' planned' : ''}`, { x: s.x, y: s.y + 22, z: s.z });
    r.a.runs.push(r); r.b.runs.push(r); this.runs.push(r);
    return r;
  },

  // planned runs are a faint blueprint; graded plans show the target surface (flat, not yet dug)
  ribbonFor(r) {
    return r.planned ? makeRibbon(r.dense, DIFF[r.diff].color, 0.3, RUN_WIDTH, null, !!r.gradeDeg) : makeRibbon(r.dense, DIFF[r.diff].color);
  },

  // What confirming a plan costs right now (trees and earthworks are counted on today's terrain).
  planCost(e) {
    if (e.kind === 'lift') {
      const T = e.T, towers = e.customTowers || Lifts.autoTowers(T, e.a, e.a.y, e.b, e.b.y);
      const build = T.baseCost + T.perM * e.len + Lifts.towersValue(T, towers, Lifts.pylonType(e));
      return { build, total: build + Terrain.treesNear([e.a, e.b], T.gauge + 8).length * TREE_COST };
    }
    let earth = 0;
    if (e.gradeDeg) earth = (() => { const w = Terrain.computeEarthwork({ pts: e.dense, half: GRADE_HALF, margin: GRADE_MARGIN }); return (w.cut + w.fill) * EARTH_COST; })();
    const build = e.len * RUN_COST_PER_M + earth;
    return { build, total: build + Terrain.treesNear(e.dense, RUN_WIDTH * 0.65).length * TREE_COST };
  },

  plans() { return [...this.lifts, ...this.runs].filter((e) => e.planned); },

  // Turn a plan into the real thing: pay, fell, dig, and open it.
  confirmPlan(e) {
    if (!e.planned) return { ok: true };
    const c = this.planCost(e);
    if (c.total > Game.money) return { ok: false, msg: `Not enough money to build ${e.name} (${money(c.total)})` };
    if (e.kind === 'lift') {
      Terrain.clearTrees([e.a, e.b], e.T.gauge + 8);
      e.planned = false; e.cost = c.build;
      this.group.remove(e.vis); Lifts.dispose(e.vis); Lifts.build(e); this.group.add(e.vis);
      if (!e.issues.length) e.opt.open = true;
    } else {
      if (e.gradeDeg) {
        const op = { pts: e.dense.map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +p.y.toFixed(2) })), half: GRADE_HALF, margin: GRADE_MARGIN };
        Terrain.applyEarthwork(op); Game.earthworks.push(op);
      }
      e.planned = false; e.cost = c.build;
      Terrain.clearTrees(e.dense, RUN_WIDTH * 0.65);
      this.refreshHeights();                       // this run now sits on the real (dug) ground
      e.label.el.classList.remove('planned');
    }
    Game.spend(c.total);
    this.version++;
    return { ok: true, cost: c.total, issues: e.issues || [] };
  },

  // Closest point on a piste's centreline, away from its ends (those snap to the end nodes instead).
  nearestRunPoint(x, z, r = RUN_WIDTH * 0.8) {
    let best = null, bd = r;
    for (const run of this.runs) {
      const d = run.dense, edge = 40;
      for (let i = 1; i < d.length - 1; i++) {
        const dd = Math.hypot(d[i].x - x, d[i].z - z);
        if (dd < bd && run.path.cum[i] > edge && run.path.length - run.path.cum[i] > edge) { bd = dd; best = { run, i, x: d[i].x, z: d[i].z, y: d[i].y }; }
      }
    }
    return best;
  },

  resolveJunction(p) {
    if (p.node || !p.junction) return;
    const j = this.nearestRunPoint(p.x, p.z, 10);   // look again: an earlier split may have renumbered things
    if (j) { p.node = this.splitRun(j.run, j.i); p.x = p.node.x; p.z = p.node.z; }
  },

  // Cut a piste in two at dense index i; returns the junction node. Skiers on it carry on seamlessly.
  splitRun(r, i) {
    const d = r.dense, J = this.addNode(d[i].x, d[i].z);
    const jp = { x: J.x, y: J.y, z: J.z };
    const first = d.slice(0, i).concat([jp]), second = [jp].concat(d.slice(i + 1));
    const cutAt = r.path.cum[i], frac = cutAt / r.path.length;
    const sub = (pts) => pts.filter((_, k) => k % 3 === 0 || k === pts.length - 1).map((p) => ({ x: p.x, z: p.z }));
    const base = { diff: r.diff, maxG: r.maxG, gradeDeg: r.gradeDeg, cross: r.cross, piste: r.piste, planned: r.planned };
    // detach the old segment (no refund: it is being re-used)
    this.runs.splice(this.runs.indexOf(r), 1);
    for (const n of [r.a, r.b]) n.runs = n.runs.filter((x) => x !== r);
    this.group.remove(r.vis); disposeGroup(r.vis); r.label.remove();
    const r1 = this.addRunEdge(Object.assign({ a: r.a, b: J, dense: first, drop: r.a.y - J.y, cost: r.cost * frac, points: sub(first) }, base));
    const r2 = this.addRunEdge(Object.assign({ a: J, b: r.b, dense: second, drop: J.y - r.b.y, cost: r.cost * (1 - frac), points: sub(second) }, base));
    for (const s of Game.skiers) {
      if (s.edge !== r) continue;
      if (s.d < cutAt) s.edge = r1; else { s.edge = r2; s.d -= cutAt; }
    }
    this.version++;
    return J;
  },

  remove(e) {
    const partners = e.kind === 'lift' ? [Lifts.partnerBelow(e), Lifts.partnerAbove(e)].filter(Boolean) : [];
    const list = e.kind === 'lift' ? this.lifts : this.runs, key = e.kind === 'lift' ? 'lifts' : 'runs';
    list.splice(list.indexOf(e), 1);
    for (const n of [e.a, e.b]) n[key] = n[key].filter((x) => x !== e);
    this.group.remove(e.vis); (e.kind === 'lift' ? Lifts.dispose(e.vis) : disposeGroup(e.vis)); e.label.remove();
    Game.money += e.cost * 0.5;
    for (const s of Game.skiers) {
      if (s.edge !== e) continue;
      s.state = 'atNode'; s.edge = null;
      s.node = e.kind === 'lift' ? e.a : e.b;
    }
    if (e.kind === 'lift') { e.queue.length = 0; e.carriers.length = 0; e.downQueue = []; e.downCarriers = []; }
    for (const x of partners) { if (!this.lineOf(x).some((y) => y !== x)) x.line = null; this.rebuildLift(x); }
    this.pruneNodes();
    this.version++;
  },

  edgeNear(x, z, r = 45) {
    let best = null, bd = r;
    for (const l of this.lifts) {
      const d = segDist(x, z, l.a.x, l.a.z, l.b.x, l.b.z); if (d < bd) { bd = d; best = l; }
    }
    for (const run of this.runs) {
      const p = run.path.pts;
      for (let i = 0; i < p.length - 2; i += 2) {
        const d = segDist(x, z, p[i].x, p[i].z, p[i + 2].x, p[i + 2].z); if (d < bd) { bd = d; best = run; }
      }
    }
    return best;
  },
};

// ---------- simulation ----------
const TMP = {}, TMP2 = {}, QP = {};
const Game = {
  init(map, scene) {
    initAssets();
    this.map = map; this.scene = scene;
    this.money = START_MONEY; this.day = 1; this.time = DAY_START; this.rep = 50;
    this.skiers = []; this.speed = 1; this.paused = false; this.dayOver = false; this.arrivalAcc = 0;
    this.debtDays = 0; this.over = null; this.earthworks = [];
    this.newDayStats();
    Net.reset(scene);
    for (const p of map.places) if (p.kind === 'base') Net.addNode(p.x, p.z, { base: true, name: p.name });

    this.skierMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(2.6, 5, 3, 6), new THREE.MeshLambertMaterial(), MAX_SKIERS);
    this.skierMesh.setColorAt(0, new THREE.Color()); this.skierMesh.count = 0; this.skierMesh.frustumCulled = false;
    scene.add(this.skierMesh);
    this.carMeshes = Lifts.makeCarrierMeshes(scene);
    this.skillColors = SKILL.map((s) => new THREE.Color(s.color));
    this._m = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._q = new THREE.Quaternion();
  },

  newDayStats() {
    this.stats = { visitors: 0, revenue: 0, built: 0, left: 0, happySum: 0, angry: 0, stranded: 0, refunds: 0, freeride: 0, food: 0, meals: 0, hungry: 0, downs: 0 };
    this.warned = {};
  },

  spend(c) { this.money -= c; this.stats.built += c; },

  get open() { return Net.lifts.some((l) => l.opt.open && !l.planned) && Net.runs.some((r) => !r.planned); },

  forestLeft() { const t = Terrain.trees; return t ? t.left / t.total : 1; },
  // guests come for the views: clear more than 10 % of the forest and demand drops
  scenery() { return 1 - clamp(1 - this.forestLeft() - 0.1, 0, 0.5) * 1.2; },

  cutAt(x, z, r) {
    const idx = Terrain.treesNear([{ x, z }], r);
    const n = Math.min(idx.length, Math.floor(Math.max(0, this.money) / TREE_COST));
    if (!n) return 0;
    Terrain.cutTrees(idx.slice(0, n));
    this.spend(n * TREE_COST);
    return n;
  },

  liftCapacity() { return Net.lifts.reduce((s, l) => s + Lifts.capacity(l), 0); },

  demandPerHour() {
    let km = 0; const kinds = new Set();
    for (const r of Net.runs) if (!r.planned) { km += r.len / 1000; kinds.add(r.diff); }
    const d = (30 + km * 55) * (0.35 + (1.3 * this.rep) / 100) * (0.7 + 0.15 * kinds.size) * this.scenery();
    const h = this.time / 3600, tod = h < 11 ? 1.5 : h < 13 ? 0.9 : 0.4;
    return Math.min(d * tod, this.liftCapacity() * 0.35);
  },

  update(dtReal) {
    if (this.paused || this.dayOver || this.over) return;
    let dt = dtReal * TIME_SCALE * this.speed;
    while (dt > 0 && !this.dayOver) { const h = Math.min(dt, 2); this.step(h); dt -= h; }
  },

  step(dt) {
    this.time += dt;
    if (this.open && this.time < LAST_ARRIVAL) {
      this.arrivalAcc += (this.demandPerHour() / 3600) * dt;
      while (this.arrivalAcc >= 1) { this.arrivalAcc -= 1; if (this.skiers.length < MAX_SKIERS) this.spawn(); }
    }
    for (const l of Net.lifts) this.stepLift(l, dt);
    // how busy each piste and restaurant is right now: guests choose the quieter ones
    for (const r of Net.runs) r.load = 0;
    for (const n of Net.nodes) n.waiting = 0;
    for (const s of this.skiers) {
      if (s.state === 'ski') s.edge.load++;
      else if (s.state === 'eat' && !s.seated && s.place) s.place.waiting++;
    }
    this._gone = false;
    for (const s of this.skiers) this.stepSkier(s, dt);
    if (this._gone) this.skiers = this.skiers.filter((s) => s.state !== 'gone');
    if (this.time >= DAY_END) this.endDay();
  },

  // Where guests wait for a lift: a grid 6 wide whose rows grow outward, standing outside the
  // buildings. A few spots around the station are tried (behind it or beside it; beside the hall at a
  // mid-station) and the one clear of other buildings is kept, until something is built or moved.
  queueLayout(l, down) {
    const c = l._ql || (l._ql = {});
    if (c.v !== Net.version) { c.v = Net.version; c.up = c.down = null; }
    const key = down ? 'down' : 'up';
    if (c[key]) return c[key];
    const { ux, uz, px, pz } = l.dir, n = down ? l.b : l.a;
    const lay = (ox, oz, rx, rz, cx, cz) => ({ ox: n.x + ox, oz: n.z + oz, rx, rz, cx, cz });
    const cand = [];
    if (down) {                                        // beside the top station, a little down the line
      const w = Lifts.queueClearance(l, false) + 4;
      for (const sd of [-1, 1]) cand.push(lay(-ux * 14 + sd * px * w, -uz * 14 + sd * pz * w, -ux * 5, -uz * 5, sd * px * 2.5, sd * pz * 2.5));
    } else if (Lifts.partnerBelow(l)) {                // mid / angle station: alongside its own wing of the hall
      const w = Lifts.queueClearance(l, true) + 5;
      for (const sd of [1, -1]) cand.push(lay(sd * px * w + ux * 4, sd * pz * w + uz * 4, sd * px * 4, sd * pz * 4, ux * 4, uz * 4));
    } else {                                           // terminal: behind the station, else beside it
      const back = Lifts.queueClearance(l, true), w = Lifts.stationFootprint(l.T, l.a, ux, uz, true).hw + 5;
      cand.push(lay(-ux * back - px * 15, -uz * back - pz * 15, -ux * 7, -uz * 7, px * 6, pz * 6));
      for (const sd of [1, -1]) cand.push(lay(sd * px * w - ux * 8, sd * pz * w - uz * 8, sd * px * 4, sd * pz * 4, -ux * 4, -uz * 4));
    }
    const fps = Net.footprints(), p = {};
    const blocked = (x, z) => !Terrain.inside(x, z) || fps.some((F) => {
      const dx = x - F.cx, dz = z - F.cz;
      return Math.abs(dx * F.ux + dz * F.uz) < F.hl + 1 && Math.abs(-dx * F.uz + dz * F.ux) < F.hw + 1;
    });
    let best = cand[0], score = Infinity;
    for (const q of cand) {
      let bad = 0;
      for (let k = 0; k < 60 && bad < score; k++) { this.queueSpot(q, k, p); if (blocked(p.x, p.z)) bad += k < 18 ? 3 : 1; }
      if (bad < score) { score = bad; best = q; }
    }
    return (c[key] = best);
  },
  queueSpot(q, k, out) {
    const r = Math.floor(k / 6), c = k % 6;
    out.x = q.ox + q.rx * r + q.cx * c; out.z = q.oz + q.rz * r + q.cz * c;
    return out;
  },

  stepLift(l, dt) {
    if (l.planned) return;
    const T = l.T, open = l.opt.open, v = Lifts.speed(l), L = l.upPath.length;
    if (!l.downQueue) { l.downQueue = []; l.downCarriers = []; }
    if (!open && !l.carriers.length && !l.downCarriers.length) return;          // stopped
    l.clock += dt;
    // each carrier passing the top station takes riders down (gondolas, funitels, 3S and trams)
    const loadDown = (offset = 0) => {
      if (!open || !l.downQueue.length) return;
      const riders = l.downQueue.splice(0, T.seats);
      for (const s of riders) s.state = 'lift';
      l.downCarriers.push({ d: offset, riders }); l.downsToday = (l.downsToday || 0) + riders.length; this.stats.downs += riders.length;
    };
    const load = () => {
      loadDown();
      if (!open || !l.queue.length) return null;
      const riders = l.queue.splice(0, T.seats);
      for (const s of riders) s.state = 'lift';
      const c = { d: 0, riders }; l.carriers.push(c); l.ridesToday += riders.length;
      return c;
    };
    for (const c of l.downCarriers) c.d += v * dt;
    while (l.downCarriers.length && l.downCarriers[0].d >= l.downPath.length) {
      for (const s of l.downCarriers.shift().riders) {
        if (s.state !== 'lift') continue;
        s.state = 'atNode'; s.node = l.a; s.edge = null; s.down = false; s.cameBy = null;
      }
    }
    if (T.kind === 'tram') {
      // jig-back: the cabin leaves the valley once per round trip
      while (l.clock >= l.next) { l.next += Lifts.interval(l); load(); }
    } else {
      const sp = v * Lifts.interval(l);
      l.dist += v * dt;
      while (l.dist >= l.nextD) { const c = load(); if (c) c.d = l.dist - l.nextD; l.nextD += sp; }
    }
    for (const c of l.carriers) c.d += v * dt;
    while (l.carriers.length && l.carriers[0].d >= L) {
      for (const s of l.carriers.shift().riders) {
        if (s.state !== 'lift') continue;
        s.state = 'atNode'; s.node = l.b; s.edge = null; s.cameBy = l;
        // ride comfort: long open rides are cold, cabins are cosy, T-bars are hard for beginners
        const mins = L / v / 60;
        let h = 1 + (T.comfort || 0) * 0.5 - T.cold * Math.max(0, mins - 5) * 1.2;
        if (T.beginnerPenalty && s.skill === 0) h -= T.beginnerPenalty;
        s.happy = clamp(s.happy + h, 0, 100);
      }
    }
  },

  spawn() {
    const u = Math.random(), skill = u < 0.33 ? 0 : u < 0.74 ? 1 : u < 0.92 ? 2 : FREERIDER;
    const bases = Net.nodes.filter((n) => n.base);
    const good = bases.filter((b) => this.canStart(b, skill));
    const pool = good.length ? good : bases;
    // guests check the queues before they set off: a base area with short queues draws more of them
    const ws = pool.map((b) => this.dodge(this.baseHassle(b, skill), skill) + 0.05);
    let t = Math.random() * ws.reduce((x, y) => x + y, 0), node = pool[0];
    for (let i = 0; i < pool.length; i++) { t -= ws[i]; if (t <= 0) { node = pool[i]; break; } }
    this.skiers.push({
      skill, node, happy: 60 + Math.random() * 10, want: 4 + ((Math.random() * 7) | 0), done: 0,
      state: 'atNode', edge: null, d: 0, wait: 0, pace: 0.85 + Math.random() * 0.3, wig: Math.random() * 6.28, last: null,
      meals: this.mealPlan(), need: null,
    });
    this.money += TICKET; this.stats.visitors++; this.stats.revenue += TICKET;
  },

  // ---------- food ----------
  // Each guest's day: maybe a coffee mid-morning, lunch, maybe a coffee in the afternoon. A meal
  // whose window has passed by the time they arrive is skipped (they ate before coming up).
  mealPlan() {
    const out = [];
    for (const kind in MEALS) {
      const m = MEALS[kind];
      if (Math.random() > m.chance) continue;
      const at = (m.from + Math.random() * (m.to - m.from)) * 3600;
      if (at < this.time + 20 * 60) { if (kind === 'lunch' && this.time < m.to * 3600) out.push({ kind, at: this.time + 25 * 60 }); continue; }
      out.push({ kind, at });
    }
    return out.sort((a, b) => a.at - b.at);
  },
  seats(n) { return n.base ? LODGE_SEATS : n.food ? FOOD_TYPES[n.food.type].seats : 0; },
  hasFood(n) { return !!(n.base || n.food); },
  // expected wait for a table: none while seats are free, else the guests ahead share the tables
  seatWait(n) {
    const seats = this.seats(n);
    if ((n.eating || 0) < seats) return 0;
    return ((n.waiting || 0) + 1) / seats * 35 * 60;
  },

  // ---------- spreading out ----------
  // how much a guest minds crowds: everyone a little, better skiers a lot
  crowdAversion(skill) { return 0.5 + (SKILL[skill].crowd || 0); },
  // skiers per 100 m of piste right now
  runCrowd(r) { return (r.load || 0) / Math.max(1, r.path.length / 100); },
  // what a crowded piste costs, in seconds of queueing it feels like: the ride is that much less fun
  runCrowdCost(r, skill) {
    const d = this.runCrowd(r) / 6;                  // up to 6 skiers per 100 m feels fine
    return Math.min(300, (r.path.length / (SKILL[skill].speed * 0.9)) * d * d);
  },
  // From node n: the hassle ahead (queueing, crowded pistes) on the best way on from here, in
  // seconds, skiing down to the next lift. 0 where there's no lift ahead (the end of the day).
  hassleAhead(n, skill) {
    const key = Net.version + ':' + Math.floor(this.time / 30);
    if (this._waKey !== key) { this._waKey = key; this._wa = new Map(); }
    const k = n.id * 4 + skill;
    if (this._wa.has(k)) return this._wa.get(k);
    this._wa.set(k, 0);                                  // guards against loops through footpaths
    const max = SKILL[skill].maxDiff, hubs = Net.hubOf(n);
    let best = Infinity, any = false;
    for (const h of hubs) {
      for (const l of h.lifts) if (l.a === h && l.opt.open && !l.planned && this.liftUseful(l, skill)) { any = true; best = Math.min(best, Lifts.waitTime(l)); }
      for (const r of h.runs) if (r.a === h && !r.planned && r.diff <= max && !hubs.includes(r.b)) { any = true; best = Math.min(best, this.runCrowdCost(r, skill) + this.hassleAhead(r.b, skill)); }
    }
    const v = Math.min(1800, any ? best : 0);
    this._wa.set(k, v);
    return v;
  },
  // at a base area: the shortest queue for a lift that leads somewhere for this guest, plus what's above it
  baseHassle(b, skill) {
    let best = 1800;
    for (const h of Net.hubOf(b)) for (const l of h.lifts) if (l.a === h && l.opt.open && !l.planned && this.liftUseful(l, skill))
      best = Math.min(best, Lifts.waitTime(l) + 0.25 * this.hassleAhead(l.b, skill));
    return best;
  },
  // weight multiplier for heading into `cost` seconds of hassle
  dodge(cost, skill) { return Math.exp(-this.crowdAversion(skill) * cost / 600); },

  // Travel time from every node to the nearest place to eat, for one skill level: skiing (only
  // runs they can ski), lifts (queue + ride) and footpaths. Refreshed every few game minutes, since
  // queues change. Reverse Dijkstra from all the restaurants and lodges.
  canRideDown(l) { return !!(l.T.enclosed && l.opt.open && !l.planned); },
  downWait(l) { return Math.ceil(((l.downQueue || []).length + 1) / l.T.seats) * Lifts.interval(l); },
  // ways a guest can ride down from these hub nodes: enclosed lifts whose top station is here
  downRides(hubs) {
    const out = [];
    for (const h of hubs) for (const l of h.lifts) if (l.b === h && this.canRideDown(l)) out.push({ kind: 'down', lift: l, a: h, b: l.a });
    return out;
  },
  foodTime(skill) { return this.routeTime(skill, 'food'); },
  routeTime(skill, goal) {
    const key = Net.version + ':' + Math.floor(this.time / 120);
    if (this._ftKey !== key) { this._ftKey = key; this._ft = {}; }
    if (this._ft[goal + skill]) return this._ft[goal + skill];
    const sk = SKILL[skill], dist = new Map(), done = new Set();
    // a full restaurant counts as further away by the wait for a table, so guests head for one with room
    for (const n of Net.nodes) if (goal === 'food' ? this.hasFood(n) : n.base) dist.set(n, goal === 'food' ? this.seatWait(n) : 0);
    const into = new Map();                          // node -> [ [from node, seconds] ] edges arriving here
    const edge = (a, b, t) => { if (!into.has(b)) into.set(b, []); into.get(b).push([a, t]); };
    for (const r of Net.runs) if (!r.planned && r.diff <= sk.maxDiff) edge(r.a, r.b, r.path.length / (sk.speed * 0.9));
    for (const l of Net.lifts) if (!l.planned && l.opt.open) edge(l.a, l.b, Lifts.waitTime(l) + Lifts.rideTime(l));
    for (const l of Net.lifts) if (this.canRideDown(l)) edge(l.b, l.a, this.downWait(l) + Lifts.rideTime(l));
    for (const p of Net.paths) { const t = Math.hypot(p.a.x - p.b.x, p.a.z - p.b.z) / 1.4; edge(p.a, p.b, t); edge(p.b, p.a, t); }
    for (;;) {
      let u = null, ud = Infinity;
      for (const [n, d] of dist) if (!done.has(n) && d < ud) { ud = d; u = n; }
      if (!u) break;
      done.add(u);
      for (const [a, t] of into.get(u) || []) if (ud + t < (dist.has(a) ? dist.get(a) : Infinity)) dist.set(a, ud + t);
    }
    return (this._ft[goal + skill] = dist);
  },

  // Sit down if there's a free seat, otherwise wait for one.
  sitDown(s, place) {
    place.eating = place.eating || 0; s.recheck = 0;
    if (place !== s.leftFull) s.leftFull = null;
    s.state = 'eat'; s.node = place; s.edge = null; s.place = place; s.d = 0;
    s.seated = place.eating < this.seats(place);
    if (s.seated) this.takeSeat(s);
    else s.queued = 0;
  },
  takeSeat(s) {
    const m = MEALS[s.need.kind], place = s.place;
    place.eating = (place.eating || 0) + 1; s.seated = true; s.seat = Math.floor(Math.random() * 1e6);
    s.eatLeft = (m.mins[0] + Math.random() * (m.mins[1] - m.mins[0])) * 60;
    const late = Math.max(0, (this.time - s.need.at) / 60 - 20);     // got there long after they got hungry
    s.happy = clamp(s.happy + m.happy - Math.min(10, late / 4), 0, 100);
    this.money += m.spend; this.stats.food += m.spend; this.stats.meals++;
    if (place.food) place.food.today = (place.food.today || 0) + m.spend;
  },
  // waiting at a full place: go and eat somewhere else if getting there is quicker than the wait here
  eatElsewhere(s) {
    s.recheck = 0;
    const place = s.place, wait = this.seatWait(place);
    if (wait < 5 * 60) return false;
    const hubs = Net.hubOf(place), max = SKILL[s.skill].maxDiff;
    const next = hubs.find((h) => h !== place && this.hasFood(h) && !this.seatWait(h));
    if (next) { s.place = null; this.sitDown(s, next); return true; }          // room next door
    const opts = [];
    for (const h of hubs) {
      for (const r of h.runs) if (r.a === h && !r.planned && r.diff <= max) opts.push([r, 1]);
      for (const l of h.lifts) if (l.a === h && l.opt.open && !l.planned) opts.push([l, 1]);
    }
    for (const d of this.downRides(hubs)) opts.push([d, 1]);
    const go = this.toward(s, opts, 'food');
    if (!go || this.towardTime + 120 > wait) return false;
    s.state = 'atNode'; s.seated = false; s.place = null; s.node = place; s.leftFull = place;
    this.decide(s);                                  // s.need is kept, so this heads for the other place
    return true;
  },
  leaveTable(s) {
    s.leftFull = null;
    if (s.state === 'eat' && s.seated && s.place) s.place.eating = Math.max(0, (s.place.eating || 1) - 1);
    s.seated = false; s.place = null; s.need = null;
  },
  // A hungry guest's best next step towards food: the option whose travel time plus the remaining
  // time to food from where it ends is lowest. null if no food can be reached from here.
  towardFood(s, opts) { return this.toward(s, opts, 'food'); },
  toward(s, opts, goal) {
    const dist = this.routeTime(s.skill, goal);
    let best = null, bt = Infinity;
    for (const [e] of opts) {
      if (!e.kind) continue;                         // no freeride lines when they're heading somewhere
      const rest = dist.get(e.b);
      if (rest == null) continue;
      const ride = e.kind === 'lift' ? Lifts.waitTime(e) + Lifts.rideTime(e) : e.kind === 'down' ? this.downWait(e.lift) + Lifts.rideTime(e.lift) : e.path.length / (SKILL[s.skill].speed * 0.9);
      const t = ride + rest + Math.random() * 30;
      if (t < bt) { bt = t; best = e; }
    }
    this.towardTime = bt;
    return best;
  },

  reach(node, skill) {
    const seen = new Set(Net.hubOf(node)), q = [...seen], max = SKILL[skill].maxDiff;
    while (q.length) {
      const n = q.shift();
      for (const m of n.links) if (!seen.has(m)) { seen.add(m); q.push(m); }
      for (const r of n.runs) if (r.a === n && !r.planned && r.diff <= max) return true;
      if (SKILL[skill].offPiste && this.freeLines(n).length) return true;
      for (const l of n.lifts) if (l.a === n && l.opt.open && !l.planned && !seen.has(l.b)) { seen.add(l.b); q.push(l.b); }
    }
    return false;
  },

  liftUseful(l, skill) {
    if (l._uv !== Net.version) { l._uv = Net.version; l._u = SKILL.map(() => null); }
    if (l._u[skill] === null) l._u[skill] = this.reach(l.b, skill);
    return l._u[skill];
  },

  // ---------- freeride ----------
  // Off-piste lines from node n down to a lodge or a lift bottom: cached until the network changes.
  freeLines(n) {
    if (this._flv !== Net.version) { this._flv = Net.version; this._fl = new Map(); }
    if (this._fl.has(n)) return this._fl.get(n);
    const out = [];
    for (const t of Net.nodes) {
      if (t === n || n.y - t.y < 120) continue;
      const d = Math.hypot(t.x - n.x, t.z - n.z);
      if (d < 250 || d > 3500) continue;
      if (!Net.hubOf(t).some((h) => h.base || h.lifts.some((l) => l.a === h && !l.planned))) continue;
      const line = traceFreeride(n, t);
      if (line) out.push(line);
    }
    out.sort((a, b) => b.drop - a.drop);
    out.length = Math.min(out.length, 4);           // the few biggest lines from here
    this._fl.set(n, out);
    return out;
  },

  canStart(n0, skill) {
    return Net.hubOf(n0).some((n) => n.runs.some((r) => r.a === n && !r.planned && r.diff <= SKILL[skill].maxDiff) ||
           n.lifts.some((l) => l.a === n && l.opt.open && !l.planned && this.liftUseful(l, skill)));
  },

  decide(s) {
    const n = s.node, sk = SKILL[s.skill], tired = s.done >= s.want, hubs = Net.hubOf(n), atBase = hubs.some((h) => h.base);
    if (!s.need && s.meals && s.meals.length && this.time >= s.meals[0].at) s.need = s.meals.shift();
    if (s.need && this.time - s.need.at > 75 * 60) {          // gave up looking for food
      s.happy -= s.need.kind === 'lunch' ? 12 : 4; this.stats.hungry++; s.need = null;
      this.warn('hungry', 'Guests are hungry and can\'t get to anywhere to eat in time. Build a mountain hut or a restaurant near your lifts.');
    }
    let fullHere = null;
    if (s.need) {
      const places = hubs.filter((h) => this.hasFood(h) && h !== s.leftFull);
      if (places.length) {
        // the place with the shortest wait, then the most free seats (a hut beside a lodge: whichever is emptier)
        places.sort((a, b) => (this.seatWait(a) - this.seatWait(b)) || ((this.seats(b) - (b.eating || 0)) - (this.seats(a) - (a.eating || 0))));
        if (!this.seatWait(places[0])) return this.sitDown(s, places[0]);
        fullHere = places[0];                            // full: eat elsewhere if that's quicker, decided below
      }
    }
    if (atBase && tired) return this.leave(s);
    if (s.done >= s.want + 4) return this.leave(s);
    const opts = [];
    for (const h of hubs) for (const r of h.runs) {
      if (r.a !== h || r.planned || r.diff > sk.maxDiff) continue;
      let w = 1 + sk.pref[r.diff] + (r !== s.last ? 2 : 0);
      if (tired && r.b.base) w *= 4;
      w *= this.dodge(this.runCrowdCost(r, s.skill) + this.hassleAhead(r.b, s.skill), s.skill);   // a quieter piste, a short queue at the bottom
      opts.push([r, w]);
    }
    for (const h of hubs) for (const l of h.lifts) {
      if (l.a !== h || !l.opt.open || l.planned || !this.liftUseful(l, s.skill)) continue;
      // pick by expected wait + ride time; beginners avoid T-bars, everyone likes a warm cabin
      let w = 3 / (1 + (Lifts.waitTime(l) + Lifts.rideTime(l) * 0.3) / 300);
      if (l.T.beginnerPenalty && s.skill === 0) w *= 0.3;
      // everyone dodges queues and crowded pistes, better skiers most: this queue, and the pistes from the top
      w *= this.dodge(Lifts.waitTime(l) + 0.25 * this.hassleAhead(l.b, s.skill), s.skill);
      if (s.cameBy && s.cameBy.line && s.cameBy.line === l.line && !tired) w *= 4;   // stay seated through the station
      w *= 1 + (l.T.comfort || 0) * 0.05;
      opts.push([l, w]);
    }
    if (sk.offPiste) for (const h of hubs) for (const line of this.freeLines(h)) {
      const t = line.to, end = Net.hubOf(t);
      if (!end.some((x) => x.base) && !this.canStart(t, s.skill)) continue;     // must lead somewhere open
      let w = sk.offPiste * clamp(line.drop / 300, 0.5, 2) * (line !== s.lastLine ? 1 : 0.5);
      if (tired && end.some((x) => x.base)) w *= 4;
      opts.push([line, w]);
    }
    // heading somewhere (food, or home when tired): any run they can ski, any open lift, or a ride down
    const downs = this.downRides(hubs);
    const goalOpts = () => {
      const all = opts.filter(([e]) => e.kind === 'run').map(([e]) => [e, 1]);
      for (const h of hubs) for (const l of h.lifts) if (l.a === h && l.opt.open && !l.planned) all.push([l, 1]);
      return all.concat(downs.map((d) => [d, 1]));
    };
    if (s.need) {
      const go = this.toward(s, goalOpts(), 'food');
      if (fullHere && (!go || this.towardTime + 120 > this.seatWait(fullHere))) return this.sitDown(s, fullHere);
      if (go) { opts.length = 0; opts.push([go, 1]); }
    } else if (tired && !atBase) {
      const go = this.toward(s, goalOpts(), 'home');
      if (go) { opts.length = 0; opts.push([go, 1]); }
    }
    if (!opts.length && downs.length) {
      // nothing they can ski from here: ride down rather than walk, ideally to where they can carry on
      const ok = downs.filter((d) => Net.hubOf(d.b).some((h) => h.base) || this.canStart(d.b, s.skill));
      opts.push([(ok.length ? ok : downs)[0], 1]);
    }
    if (!opts.length) {
      if (atBase) {
        if (!s.done) { s.happy -= 50; this.money -= TICKET; this.stats.revenue -= TICKET; this.stats.refunds++; this.warn('skill' + s.skill, `${sk.name} can't find anything to ski — they need ${sk.maxDiff ? 'easier' : 'blue'} runs from a lift.`); }
        return this.leave(s);
      }
      return this.strand(s);
    }
    let t = Math.random() * opts.reduce((a, o) => a + o[1], 0), pick = opts[0][0];
    for (const [e, w] of opts) { t -= w; if (t <= 0) { pick = e; break; } }
    if (pick.kind === 'down') {                       // ride an enclosed lift back down
      const l = pick.lift;
      if (!l.downQueue) { l.downQueue = []; l.downCarriers = []; }
      s.edge = l; s.down = true; s.state = 'queue'; s.wait = 0; s.cameBy = null; s.node = pick.a;
      l.downQueue.push(s);
      return;
    }
    if (pick.path && !pick.kind) {                   // an off-piste line
      s.line = pick; s.lastLine = pick; s.state = 'free'; s.d = 0; s.cameBy = null; s.edge = null;
      return;
    }
    s.edge = pick;
    const through = pick.kind === 'lift' && s.cameBy && s.cameBy.line && s.cameBy.line === pick.line;
    s.cameBy = null;
    if (pick.kind === 'lift') { s.state = 'queue'; s.wait = 0; if (through) pick.queue.unshift(s); else pick.queue.push(s); }
    else { s.state = 'ski'; s.d = 0; }
  },

  strand(s) {
    let best = null, bd = Infinity;
    for (const n of Net.nodes) if (n.base) { const d = Math.hypot(n.x - s.node.x, n.z - s.node.z); if (d < bd) { bd = d; best = n; } }
    s.walk = { x: s.node.x, z: s.node.z, to: best, len: bd };
    s.state = 'walk'; s.d = 0; s.happy -= 20; this.stats.stranded++;
    this.warn('strand', 'Skiers are stuck at a dead end and walking back. Connect run ends to a lift or a lodge.');
  },

  leave(s) {
    if (s.state === 'queue' && s.edge) { const q = s.down ? s.edge.downQueue || [] : s.edge.queue, i = q.indexOf(s); if (i >= 0) q.splice(i, 1); }
    s.state = 'gone'; this._gone = true;
    s.happy = clamp(s.happy, 0, 100);
    this.rep += (s.happy - this.rep) * (s.happy < this.rep ? 0.03 : 0.015); // bad news travels faster
    this.stats.left++; this.stats.happySum += s.happy;
    if (s.happy < 35) this.stats.angry++;
  },

  warn(key, msg) { if (!this.warned[key]) { this.warned[key] = true; UI.toast(msg); } },

  stepSkier(s, dt) {
    switch (s.state) {
      case 'atNode': this.decide(s); break;
      case 'queue':
        s.wait += dt;
        if (s.wait > 480) s.happy -= dt * 0.025;
        if (s.happy < 8) { this.warn('queue', `Long queues at ${s.edge.name} — skiers are giving up and going home.`); this.leave(s); }
        break;
      case 'ski': {
        const r = s.edge, p = r.path.at(s.d, TMP);
        const steep = clamp(-p.dy / Math.max(0.2, Math.hypot(p.dx, p.dz)), 0, 1);
        s.d += SKILL[s.skill].speed * s.pace * (0.75 + 0.7 * Math.min(1, steep / 0.4)) * dt;
        if (s.d >= r.path.length) {
          const hb = Net.hubOf(r.b), junction = !hb.some((h) => h.base || h.lifts.some((x) => !x.planned)) && r.b.runs.some((x) => x.a === r.b && !x.planned);
          const lean = Math.max(0, r.cross - 0.3) * (s.skill === 0 ? 30 : 15);   // tilted side-hill piste
          // enjoyment scales with the vertical skied, so splitting a piste into segments changes nothing
          const share = clamp(r.drop / 300, 0.25, 1.5);
          s.happy = clamp(s.happy + (SKILL[s.skill].pref[r.diff] - lean) * share, 0, 100);
          s.route = (s.route || '') + r.piste + ',';
          if (!junction) {
            s.done++;
            if (s.route !== s.lastRoute) s.happy = clamp(s.happy + 2, 0, 100);   // likes variety
            s.lastRoute = s.route; s.route = '';
          }
          s.last = r; s.state = 'atNode'; s.node = r.b; s.edge = null;
        }
        break;
      }
      case 'eat':
        if (!s.seated) {                               // waiting for a table
          s.queued += dt; s.happy -= dt * 0.006;
          if ((s.place.eating || 0) < this.seats(s.place)) this.takeSeat(s);
          else if (s.queued > 5 * 60 && (s.recheck = (s.recheck || 0) + dt) > 120 && this.eatElsewhere(s)) { /* heading off to another place */ }
          else if (s.queued > 20 * 60) { this.warn('full', `${s.place.food ? s.place.food.name : s.place.name} is full and guests are walking away hungry. Build more restaurants.`); this.stats.hungry++; s.happy -= 6; this.leaveTable(s); s.state = 'atNode'; }
        } else {
          s.eatLeft -= dt;
          if (s.eatLeft <= 0) { const p = s.place; this.leaveTable(s); s.state = 'atNode'; s.node = p.food && p.links.length ? p.links.find((m) => !m.food) || p.links[0] : p; }
        }
        break;
      case 'free': {
        const L = s.line, p = L.path.at(s.d, TMP);
        const steep = clamp(-p.dy / Math.max(0.2, Math.hypot(p.dx, p.dz)), 0, 1);
        s.d += SKILL[s.skill].speed * s.pace * (0.6 + 0.6 * Math.min(1, steep / 0.6)) * dt;
        if (s.d >= L.path.length) {
          s.happy = clamp(s.happy + 9 * clamp(L.drop / 300, 0.25, 1.5) + 2, 0, 100);   // fresh tracks
          s.done++; this.stats.freeride = (this.stats.freeride || 0) + 1;
          s.state = 'atNode'; s.node = L.to; s.line = null; s.last = null;
          if (!Net.nodes.includes(L.to)) this.strand(s);                      // that lift was removed meanwhile
        }
        break;
      }
      case 'walk':
        s.d += 2.5 * dt;
        if (s.d >= s.walk.len) { s.state = 'atNode'; s.node = s.walk.to; }
        break;
    }
  },

  endDay() {
    for (const s of this.skiers) if (s.state !== 'gone') this.leave(s);
    this.skiers = [];
    for (const l of Net.lifts) { l.queue.length = 0; l.carriers.length = 0; l.downQueue = []; l.downCarriers = []; l.ridesYesterday = l.ridesToday; l.ridesToday = 0; l.downsYesterday = l.downsToday || 0; l.downsToday = 0; }
    for (const n of Net.nodes) { n.eating = 0; if (n.food) { n.food.yesterday = n.food.today || 0; n.food.today = 0; } }
    const ops = this.dailyCost();
    this.money -= ops;
    this.stats.ops = ops;
    this.dayOver = true;
    this.debtDays = this.money < 0 ? this.debtDays + 1 : 0;
    if (this.money < -MAX_DEBT) this.over = `The bank called in your ${money(-this.money)} debt. The resort is bankrupt.`;
    else if (this.debtDays >= DEBT_DAYS) this.over = `You were in debt for ${DEBT_DAYS} days in a row. The resort is bankrupt.`;
    else if (this.rep < MIN_REP) this.over = 'Your reputation collapsed. Nobody wants to ski here any more.';
    if (this.over) { Save.clear(this.map.key); Save.record(this.map.key, this.day); UI.gameOver(this.over, this.stats); }
    else { Save.record(this.map.key, this.day); Save.write(); UI.daySummary(this.stats); }
  },

  dailyCost() {
    let ops = Net.lifts.some((l) => !l.planned) || Net.runs.some((r) => !r.planned) ? FIXED_OP : 0;
    for (const l of Net.lifts) if (!l.planned) ops += Lifts.dailyCost(l);
    for (const r of Net.runs) if (!r.planned) ops += r.len * RUN_OP_PER_M;
    for (const n of Net.nodes) if (n.food) ops += FOOD_TYPES[n.food.type].op;
    return ops;
  },

  serialize() {
    return {
      v: 1, key: this.map.key, money: this.money, day: this.day, time: this.dayOver ? DAY_END : this.time,
      rep: this.rep, debtDays: this.debtDays, stats: this.stats,
      nodes: Net.nodes.filter((n) => !n.base).map((n) => Object.assign({ id: n.id, x: n.x, z: n.z },
        n.links.length ? { links: n.links.map((m) => m.id) } : {},
        n.food ? { food: { type: n.food.type, name: n.food.name, rot: n.food.rot, drop: n.food.drop } } : {})),
      bases: Net.nodes.filter((n) => n.base).map((n) => ({ id: n.id, name: n.name })),
      lifts: Net.lifts.map((l) => ({ type: l.type, a: l.a.id, b: l.b.id, opt: l.opt, name: l.name, towers: l.customTowers, planned: l.planned || undefined, line: l.line || undefined })),
      runs: Net.runs.map((r) => ({ a: r.a.id, b: r.b.id, points: r.points, gradeDeg: r.gradeDeg, diff: r.diff, maxG: r.maxG, piste: r.piste, planned: r.planned || undefined })),
      trees: Terrain.treeMask(),
      earthworks: this.earthworks,
    };
  },

  restore(d) {
    // replay terrain edits first so everything is rebuilt on the graded ground
    for (const op of d.earthworks || []) { Terrain.applyEarthwork(op); this.earthworks.push(op); }
    if (this.earthworks.length) Net.refreshHeights();
    const byId = new Map();
    for (const b of d.bases) { const n = Net.nodes.find((x) => x.base && x.name === b.name); if (n) byId.set(b.id, n); }
    for (const n of d.nodes) byId.set(n.id, Net.addNode(n.x, n.z, n.food ? { food: { ...n.food } } : {}));
    for (const n of d.nodes) for (const m of n.links || []) if (byId.get(m)) Net.linkNodes(byId.get(n.id), byId.get(m));
    const P = (n) => ({ x: n.x, z: n.z, node: n });
    for (const l of d.lifts) {
      const plan = Net.liftPlan(l.type, P(byId.get(l.a)), P(byId.get(l.b)), true, false, false);
      if (l.towers) plan.customTowers = l.towers;
      plan.planned = !!l.planned;
      plan.joinWith = null; plan.line = l.line || null;
      Net.buildLift(plan, true, l.opt, l.name);
    }
    for (const r of d.runs) {
      const pts = r.points.map((p) => ({ ...p }));
      pts[0].node = byId.get(r.a); pts[pts.length - 1].node = byId.get(r.b);
      // built runs: the terrain is already graded, recompute on the real surface; graded plans: target profile
      const plan = Net.runPlan(pts, true, r.planned ? r.gradeDeg : null);
      plan.planned = !!r.planned;
      if (plan.dense) {
        if (r.gradeDeg) plan.gradeDeg = r.gradeDeg;
        if (r.diff != null) { plan.diff = r.diff; plan.maxG = r.maxG; }
        if (r.piste) plan.piste = r.piste;
        Net.buildRun(plan, true);
      }
    }
    for (const l of Net.lifts) if (l.line) Net.rebuildLift(l);   // stations need both sections to exist
    for (const l of Net.lifts) if (l.line && !Lifts.partnerBelow(l)) Net.syncLine(l);   // older saves: the bottom section sets the speed
    this.untangled = Net.untangleStations();                       // older saves: pull overlapping stations apart
    Net.pruneNodes();
    for (const r of Net.runs) Net.seq.run = Math.max(Net.seq.run, r.piste + 1, r.id + 1);
    if (d.trees) Terrain.applyTreeMask(d.trees);
    Object.assign(this, { money: d.money, day: d.day, time: d.time, rep: d.rep, debtDays: d.debtDays || 0 });
    if (d.stats) this.stats = Object.assign(this.stats, d.stats);
    if (this.time >= DAY_END) this.nextDay();
  },

  nextDay() {
    this.day++; this.time = DAY_START; this.dayOver = false; this.arrivalAcc = 0;
    this.newDayStats();
  },

  avgHappy() {
    if (!this.skiers.length) return null;
    return this.skiers.reduce((a, s) => a + s.happy, 0) / this.skiers.length;
  },

  // ---------- rendering of moving things ----------
  render() {
    const M = this._m, V = this._v, S = this._s, sm = this.skierMesh;
    const ident = new THREE.Quaternion();
    let si = 0;
    const putSkier = (x, y, z, sc, skill) => {
      if (si >= MAX_SKIERS) return;
      M.compose(V.set(x, y, z), ident, S.set(sc, sc, sc)); sm.setMatrixAt(si, M); S.set(1, 1, 1); sm.setColorAt(si, this.skillColors[skill]); si++;
    };
    for (const s of this.skiers) {
      if (s.state === 'ski') {
        const p = s.edge.path.at(s.d, TMP), h = Math.hypot(p.dx, p.dz) || 1;
        const off = Math.sin(s.d / 28 + s.wig) * RUN_WIDTH * 0.33;
        const x = p.x - (p.dz / h) * off, z = p.z + (p.dx / h) * off;
        putSkier(x, Terrain.height(x, z) + 5.5, z, 1, s.skill);
      } else if (s.state === 'eat' && s.seated && s.place) {
        const p = s.place, k = s.seat;
        if (p.food) {
          const T = FOOD_TYPES[p.food.type], td = p.food.type === 'hut' ? 12 : 16, cols = Math.floor((T.w + 2) / 3), rows = Math.floor(td / 3) - 1;
          if (k % 3 === 0 || (k >> 2) % (cols * rows) >= cols * rows) continue;   // some sit inside
          const c = (k >> 2) % cols, r = Math.floor(((k >> 2) % (cols * rows)) / cols);
          const lx = -T.w / 2 - 1 + 1.5 + c * 3, lz = T.d / 2 - 0.5 + r * 3, ro = p.food.rot || 0;
          putSkier(p.x + lx * Math.cos(ro) + lz * Math.sin(ro), p.y + 3.6, p.z - lx * Math.sin(ro) + lz * Math.cos(ro), 0.8, s.skill);
        } else {
          if (k % 2) continue;                          // half sit inside the lodge
          const a = (k % 360) * Math.PI / 180, rr = 30 + (k % 13);
          putSkier(p.x + Math.cos(a) * rr * 0.9, Terrain.height(p.x + Math.cos(a) * rr * 0.9, p.z + Math.sin(a) * rr * 0.7) + 3.5, p.z + Math.sin(a) * rr * 0.7, 0.8, s.skill);
        }
      } else if (s.state === 'free') {
        const p = s.line.path.at(s.d, TMP), h = Math.hypot(p.dx, p.dz) || 1;
        const off = Math.sin(s.d / 12 + s.wig) * 7;                          // short, quick turns
        const x = p.x - (p.dz / h) * off, z = p.z + (p.dx / h) * off;
        putSkier(x, Terrain.height(x, z) + 5.5, z, 1, s.skill);
      } else if (s.state === 'walk') {
        const t = s.d / (s.walk.len || 1), x = s.walk.x + (s.walk.to.x - s.walk.x) * t, z = s.walk.z + (s.walk.to.z - s.walk.z) * t;
        putSkier(x, Terrain.height(x, z) + 5.5, z, 1, s.skill);
      }
    }
    const cm = this.carMeshes, cnt = {};
    for (const k in cm) cnt[k] = 0;
    let col = null;
    const putCar = (model, x, y, z, q, sy = 1) => {
      const im = cm[model];
      if (cnt[model] >= im.instanceMatrix.count) return;
      M.compose(V.set(x, y, z), q, S.set(1, sy, 1)); im.setColorAt(cnt[model], col); im.setMatrixAt(cnt[model]++, M);
      if (model === 'chair6') cm.bubble.setMatrixAt(cnt.bubble++, M);
    };
    for (const l of Net.lifts) {
      if (l.planned) continue;
      const T = l.T, L = l.upPath.length, { ux, uz, px, pz } = l.dir, v = Lifts.speed(l);
      col = Lifts.colorOf(l);
      if (T.kind === 'tram') {
        // cabin A on the uphill track, cabin B mirrored on the other one
        const tUp = L / v, period = Lifts.interval(l), ph = (l.clock - (l.next - period) + period) % period;
        const d = ph < tUp ? ph * v : ph < tUp + T.dwell ? L : ph < 2 * tUp + T.dwell ? L - (ph - tUp - T.dwell) * v : 0;
        let p = l.upPath.at(d, TMP); putCar('tram', p.x, p.y, p.z, l.quat);
        p = l.downPath.at(d, TMP); putCar('tram', p.x, p.y, p.z, l.quatDown);
      } else if (T.kind === 'surface') {
        // spring box on the rope; going up its rod is pulled out down to the rider's hips, coming back
        // it is reeled in, with the T / platter just under the box
        const sp = v * Lifts.interval(l), Lr = l.ropeUp.length, end = T.model + 'End', box = 0.56 * CS;
        const hang = (p, q, lenY) => {
          putCar(T.model, p.x, p.y, p.z, q);
          const top = p.y - box, len = Math.max(0.4, top - lenY);
          putCar('surfRod', p.x, top, p.z, q, len / CS);
          putCar(end, p.x, top - len, p.z, q);
        };
        for (let d = (l.dist % sp); d < Lr; d += sp) {
          let p = l.ropeUp.at(d, TMP);
          hang(p, l.quat, Terrain.height(p.x, p.z) + 4.5);
          p = l.downPath.at(d, TMP);
          hang(p, l.quatDown, p.y - box - 1.2);
        }
      } else if (T.model) {
        const sp = v * Lifts.interval(l), up = l.upPath, Lr = up.length;
        for (let d = (l.dist % sp); d < Lr; d += sp) {
          let p = up.at(d, TMP); putCar(T.model, p.x, p.y, p.z, l.quat);
          p = l.downPath.at(d, TMP); putCar(T.model, p.x, p.y, p.z, l.quatDown);
        }
      }
      const visible = !T.enclosed;
      if (visible) for (const c of l.carriers) {
        const p = l.upPath.at(c.d, TMP), n = c.riders.length;
        c.riders.forEach((s, k) => {
          if (T.kind === 'aerial') {
            const o = (k - (n - 1) / 2) * 0.62 * CS;
            putSkier(p.x + px * o, p.y - 2.75 * CS, p.z + pz * o, 0.55, s.skill);
          } else { const o = n > 1 ? (k ? 1.5 : -1.5) : 0; putSkier(p.x + px * o, p.y + 5.5, p.z + pz * o, 0.8, s.skill); }
        });
      }
      if (l.downQueue && l.downQueue.length) {                    // waiting at the top to ride down
        const q = this.queueLayout(l, true);
        l.downQueue.forEach((s, k) => { if (k < 60) { const p = this.queueSpot(q, k, QP); putSkier(p.x, Terrain.height(p.x, p.z) + 5.5, p.z, 1, s.skill); } });
      }
      if (l.queue.length) {
        const q = this.queueLayout(l, false);
        l.queue.forEach((s, k) => { const p = this.queueSpot(q, k, QP); putSkier(p.x, Terrain.height(p.x, p.z) + 5.5, p.z, 1, s.skill); });
      }
    }
    for (const k in cm) { cm[k].count = cnt[k]; cm[k].instanceMatrix.needsUpdate = true; if (cm[k].instanceColor) cm[k].instanceColor.needsUpdate = true; }
    sm.count = si;
    sm.instanceMatrix.needsUpdate = true;
    if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
  },
};

// ---------- persistence (browser localStorage, one save per resort) ----------
const Save = {
  key: (k) => 'skiresort.save.' + k,
  get(name) { try { return JSON.parse(localStorage.getItem(name)); } catch { return null; } },
  set(name, v) { try { localStorage.setItem(name, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  read(k) { return this.get(this.key(k)); },
  // sync bookkeeping per resort: rev counts local writes, pushed = rev the cloud has, syncedAt = cloud version we're based on
  meta(k) { return Object.assign({ rev: 0, pushed: 0, syncedAt: null, savedAt: null }, this.get('skiresort.meta.' + k)); },
  setMeta(k, m) { this.set('skiresort.meta.' + k, m); },
  changed(k) { const m = this.meta(k); m.rev++; m.savedAt = Date.now(); this.setMeta(k, m); return m; },
  lastWrite: null,
  write(final) {
    if (!Game.map || Game.over) return;
    const k = Game.map.key;
    this.set(this.key(k), Game.serialize());
    this.changed(k);
    this.lastWrite = Date.now();
    Cloud.queue(k, final);
    if (Cloud.onState) Cloud.onState();
  },
  clear(k) {
    try { localStorage.removeItem(this.key(k)); } catch { /* ignore */ }
    const m = this.meta(k); m.rev = m.pushed = 0; m.force = true; this.setMeta(k, m);  // the next save replaces the cloud copy
    Cloud.remove(k);
  },
  best(k) { return this.get('skiresort.best.' + k); },
  record(k, days) { const b = this.best(k); if (!b || days > b.days) this.set('skiresort.best.' + k, { days }); },

  // ---- moving a save between computers: a small JSON file ----
  exportFile() {
    if (!Game.map || Game.over) return null;
    const data = { format: 'ski-resort-save', version: 1, resort: Game.map.key, resortName: Game.map.name,
                   savedAt: new Date().toISOString(), best: this.best(Game.map.key), save: Game.serialize() };
    const name = `ski-resort-${Game.map.key}-day${Game.day}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return name;
  },
  // check a loaded file; returns the parsed data or an error message
  parseFile(text) {
    let d;
    try { d = JSON.parse(text); } catch { return { error: 'That file is not a ski resort save (it is not valid JSON).' }; }
    if (!d || d.format !== 'ski-resort-save' || !d.save || !d.resort) return { error: 'That file is not a ski resort save.' };
    if (!window.SKI_MAPS[d.resort]) return { error: `This save is for a resort this version doesn't have (${d.resort}).` };
    return { data: d };
  },
  importData(d) {
    this.set(this.key(d.resort), d.save);
    if (d.best) this.record(d.resort, d.best.days);
    const m = this.changed(d.resort); m.force = true; this.setMeta(d.resort, m);   // an imported file wins over the cloud copy
    Cloud.queue(d.resort, true);
  },
};

// ---------- cloud saves: progress stored on the save server (server.js) under a player ID ----------
const PLAYER_ID_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const Cloud = {
  ALPHA: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',      // Crockford base32: no I, L, O, U
  PUSH_GAP: 15000,
  state: 'off',            // off (no server) · checking · ok · saving · offline · conflict
  lastSync: null, onState: null, onConflict: null, playing: null,
  timers: {}, lastPush: {}, blocked: {}, inflight: {},

  server() {
    let s = null;
    try { s = localStorage.getItem('skiresort.server'); } catch { /* ignore */ }
    if (s) return s.replace(/\/+$/, '');
    if (/^https?:$/.test(location.protocol)) return location.origin;      // the game was opened from server.js
    return this.found;                                                    // opened as a file: a server found on this computer
  },
  found: null, count: 0, DETECT_PORTS: [8642, 8643, 8644],
  // opened as index.html: look for server.js running on this computer
  async detect() {
    if (this.server()) return;
    for (const port of this.DETECT_PORTS) {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 1200);
        const r = await fetch(`http://localhost:${port}/api/ping`, { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        if (r.ok && (await r.json()).ok) { this.found = `http://localhost:${port}`; return; }
      } catch { /* not there */ }
    }
  },
  setServer(url) {
    try { if (url) localStorage.setItem('skiresort.server', url); else localStorage.removeItem('skiresort.server'); } catch { /* ignore */ }
  },
  normalizeServer(text) {
    let t = String(text || '').trim();
    if (!t) return null;
    if (!/^https?:\/\//i.test(t)) t = 'http://' + t;
    try { const u = new URL(t); return u.origin; } catch { return null; }
  },

  // ---- player ID ----
  id() {
    let v = null;
    try { v = localStorage.getItem('skiresort.player'); } catch { /* ignore */ }
    if (!PLAYER_ID_RE.test(v || '')) {
      const r = new Uint8Array(10); crypto.getRandomValues(r);
      v = Array.from(r, (b) => this.ALPHA[b & 31]).join('');
      try { localStorage.setItem('skiresort.player', v); } catch { /* ignore */ }
    }
    return v;
  },
  setId(v) { try { localStorage.setItem('skiresort.player', v); } catch { /* ignore */ } },
  pretty(id) { return id.slice(0, 5) + '-' + id.slice(5); },
  // accept what people type: spaces, dashes, lower case, O for 0, I/L for 1
  parseId(text) {
    const v = String(text || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    return PLAYER_ID_RE.test(v) ? v : null;
  },

  set(state) { this.state = state; if (this.onState) this.onState(); },
  url(id, resort) { return `${this.server()}/api/players/${id}` + (resort ? '/' + resort : ''); },

  // GET a player's saves: the doc, null (no such player), or throws when the server can't be reached
  async fetchPlayer(id) {
    const r = await fetch(this.url(id), { cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('server error ' + r.status);
    return r.json();
  },

  // take the cloud copy of one resort into this browser
  take(k, c) {
    Save.set(Save.key(k), c.save);
    if (c.best) Save.record(k, c.best.days);
    const m = Save.meta(k); m.pushed = m.rev; m.syncedAt = c.updatedAt; m.savedAt = c.savedAt; delete m.force;
    Save.setMeta(k, m); delete this.blocked[k];
  },

  // menu: bring this browser and the cloud up to date. Returns { conflicts: { resort: cloudEntry } }
  async sync() {
    const out = { conflicts: {} };
    if (!this.server()) { this.set('checking'); await this.detect(); }
    if (!this.server()) { this.set('off'); return out; }
    this.set('checking');
    let doc;
    try {
      doc = await this.fetchPlayer(this.id());
      if (!doc) await fetch(this.url(this.id()), { method: 'POST' });     // register the ID right away
    } catch { this.set('offline'); return out; }
    if (this.playing) return out;            // a game was started meanwhile: don't swap saves under it
    const resorts = (doc && doc.resorts) || {};
    for (const k of Object.keys(window.SKI_MAPS)) {
      const c = resorts[k], m = Save.meta(k), local = Save.read(k), dirty = !!local && m.rev !== m.pushed;
      if (c && c.updatedAt !== m.syncedAt && !m.force) {
        if (!dirty) this.take(k, c);           // saved on another computer, nothing new here: use it
        else out.conflicts[k] = c;             // both changed since they last agreed: the player chooses
      } else if (local && (dirty || !c)) {
        if (!c) {                              // the cloud doesn't have it (an older save, or removed there): upload it
          const m2 = Save.changed(k); if (m.syncedAt) { m2.syncedAt = null; m2.force = true; } Save.setMeta(k, m2);
        }
        this.queue(k, true);                   // progress made here (maybe offline) that the cloud lacks
      }
    }
    this.count = Object.keys(window.SKI_MAPS).filter((k) => resorts[k] || Save.read(k)).length;
    this.lastSync = Date.now();
    this.set(Object.keys(out.conflicts).length ? 'conflict' : 'ok');
    return out;
  },

  // player picked one side of a conflict
  keepLocal(k) { const m = Save.meta(k); m.force = true; Save.setMeta(k, m); delete this.blocked[k]; this.queue(k, true); },

  queue(k, now) {
    if (!this.server() || this.blocked[k]) return;
    if (now) { clearTimeout(this.timers[k]); this.timers[k] = null; this.push(k, true); return; }
    if (this.timers[k]) return;
    const wait = Math.max(0, this.PUSH_GAP - (Date.now() - (this.lastPush[k] || 0)));
    this.timers[k] = setTimeout(() => { this.timers[k] = null; this.push(k); }, wait);
  },

  async push(k, keepalive) {
    if (!this.server() || this.blocked[k]) return;
    if (this.inflight[k]) { this.inflight[k].again = true; return; }
    const m = Save.meta(k), save = Save.read(k);
    if (!save || (m.rev === m.pushed && !m.force)) return;
    const rev = m.rev;
    const body = JSON.stringify({ base: m.syncedAt, force: !!m.force, save, best: Save.best(k), savedAt: m.savedAt });
    let done; const job = this.inflight[k] = { again: false, p: new Promise((r) => { done = r; }) };
    this.lastPush[k] = Date.now();
    if (this.state !== 'conflict') this.set('saving');
    try {
      // POST with a text body is a "simple" request: no preflight, and keepalive lets it finish while the tab closes
      const r = await fetch(this.url(this.id(), k), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body,
        keepalive: !!keepalive && body.length < 60000 });
      if (r.status === 409) {
        this.blocked[k] = true; this.set('conflict');
        if (this.onConflict) this.onConflict(k);
        return;
      }
      if (!r.ok) throw new Error('server error ' + r.status);
      const j = await r.json();
      const m2 = Save.meta(k);
      m2.syncedAt = j.updatedAt; m2.pushed = rev; delete m2.force;
      Save.setMeta(k, m2);
      this.lastSync = Date.now();
      this.set('ok');
    } catch {
      this.set('offline');
    } finally {
      this.inflight[k] = null; done();
      if (job.again) this.queue(k);
    }
  },

  // push now and wait for it (at most `ms`), e.g. before leaving the page
  async flush(k, ms = 4000) {
    clearTimeout(this.timers[k]); this.timers[k] = null;
    const go = async () => { if (this.inflight[k]) await this.inflight[k].p; await this.push(k); };
    await Promise.race([go(), new Promise((r) => setTimeout(r, ms))]);
  },

  // a new game replaces the old one: drop the cloud copy right away (the next save would overwrite it anyway)
  async remove(k) {
    if (!this.server()) return;
    clearTimeout(this.timers[k]); this.timers[k] = null; delete this.blocked[k];
    try {
      const r = await fetch(this.url(this.id(), k) + '?force=1', { method: 'DELETE' });
      if (r.ok) { const m = Save.meta(k); if (m.rev === 0) { m.syncedAt = null; delete m.force; Save.setMeta(k, m); } }
    } catch { /* offline: the forced next save replaces it */ }
  },

  // switch this computer to another player ID: its saves replace the ones here; resorts it doesn't have are kept and uploaded
  adopt(id, doc) {
    this.setId(id);
    this.blocked = {};
    const resorts = (doc && doc.resorts) || {};
    for (const k of Object.keys(window.SKI_MAPS)) {
      if (resorts[k]) this.take(k, resorts[k]);
      else if (Save.read(k)) { const m = Save.changed(k); m.syncedAt = null; m.force = true; Save.setMeta(k, m); this.queue(k, true); }
      else { Save.setMeta(k, { rev: 0, pushed: 0, syncedAt: null, savedAt: null }); }
    }
  },
};
