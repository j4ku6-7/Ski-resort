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
const SKILL = [
  { name: 'Beginners', maxDiff: 0, speed: 7, color: 0x3fb0ff, pref: [6, 0, 0] },
  { name: 'Intermediates', maxDiff: 1, speed: 10, color: 0xff6a3d, pref: [3, 7, 0] },
  { name: 'Experts', maxDiff: 2, speed: 13, color: 0x9b4dff, pref: [1, 5, 9] },
];
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
  const shared = new Set([...Object.values(GEO), MAT.tower, MAT.cable, MAT.node, MAT.lodge, MAT.roof]);
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
  } else {
    g.add(new THREE.Mesh(GEO.disc, MAT.node));
  }
  return g;
}

// ---------- network ----------
const Net = {
  reset(scene) {
    this.nodes = []; this.lifts = []; this.runs = [];
    this.seq = { lift: 1, run: 1, node: 1 }; this.version = 0;
    this.group = new THREE.Group(); scene.add(this.group);
  },

  nearestNode(x, z, r = SNAP) {
    let best = null, bd = r;
    for (const n of this.nodes) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  },

  addNode(x, z, opts = {}) {
    const n = Object.assign({ id: this.seq.node++, x, z, y: Terrain.height(x, z), base: false, name: null, lifts: [], runs: [] }, opts);
    n.vis = makeNodeVisual(n); this.group.add(n.vis);
    if (n.base) n.label = Labels.add(`<span class="ico">⌂</span>${n.name}`, 'base', { x: n.x, y: n.y + 40, z: n.z });
    this.nodes.push(n);
    return n;
  },

  pointNode(p) { return p.node || this.addNode(p.x, p.z); },
  pointY(p) { return p.node ? p.node.y : Terrain.height(p.x, p.z); },

  pruneNodes() {
    this.nodes = this.nodes.filter((n) => {
      if (n.base || n.lifts.length || n.runs.length) return true;
      this.group.remove(n.vis); return false;
    });
  },

  liftPlan(type, p, q, free = false, manual = false) {
    type = LIFT_ALIASES[type] || type;
    const T = LIFT_TYPES[type];
    let a = p, b = q, ya = this.pointY(p), yb = this.pointY(q);
    if (yb < ya) { [a, b] = [b, a]; [ya, yb] = [yb, ya]; }
    const hl = Math.hypot(b.x - a.x, b.z - a.z), vert = yb - ya, len = Math.hypot(hl, vert);
    const P = Lifts.profile(T, a, ya, b, yb, manual && T.kind !== 'belt' ? [] : null);
    const trees = Terrain.treesNear([a, b], T.gauge + 8).length;
    let towersCost = 0;
    for (const t of P.prof.slice(1, -1)) towersCost += Lifts.towerPrice(T, t.y - P.ground(t.s));
    const build = T.baseCost + T.perM * len + towersCost, cost = build + trees * TREE_COST;
    const grade = T.kind === 'belt' || T.kind === 'surface' ? Lifts.maxGroundGrade(P) : 0;
    const aName = (/^[aeiou8]/i.test(T.name) ? 'An ' : 'A ') + T.name.toLowerCase();
    // starting at the top of (or ending at the bottom of) a lift of the same type continues that line,
    // through a shared angle station
    let joinWith = null, bendDeg = 0;
    if (Lifts.canHaveStations(T)) {
      if (a.node) joinWith = this.lifts.find((x) => x.type === type && x.b === a.node && !Lifts.partnerAbove(x));
      if (!joinWith && b.node) joinWith = this.lifts.find((x) => x.type === type && x.a === b.node && !Lifts.partnerBelow(x));
      if (joinWith) {
        const dx = (b.x - a.x) / (hl || 1), dz = (b.z - a.z) / (hl || 1), j = joinWith.dir;
        bendDeg = Math.acos(clamp(dx * j.ux + dz * j.uz, -1, 1)) * 180 / Math.PI;
      }
    }
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
             manual: manual && T.kind !== 'belt', joinWith, bendDeg };
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
    const p2 = this.liftPlan(l.type, P(M), P(top), true);
    p2.planned = l.planned;
    if (l.customTowers) p2.customTowers = l.customTowers.filter((t) => t.s > s + 20).map((t) => ({ ...t, s: t.s - s }));
    // shorten l to the lower section
    top.lifts = top.lifts.filter((x) => x !== l);
    l.b = M; M.lifts.push(l);
    const p1 = this.liftPlan(l.type, P(l.a), P(M), true);
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
    const plan = this.liftPlan(low.type, P(low.a), P(up.b), true);
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
    for (const s of Game.skiers) if (s.edge === l) { s.state = 'atNode'; s.edge = null; s.node = l.a; }
    l.queue.length = 0; l.carriers.length = 0;
  },

  // swap the lift machinery, keeping the stations; half the old lift's value is credited
  upgradePlan(l, type) {
    if (l.line && this.lineOf(l).length > 1) return { ok: false, msg: 'Remove the stations on this line before changing its type', cost: 0 };
    const P = (n) => ({ x: n.x, z: n.z, node: n });
    const plan = this.liftPlan(type, P(l.a), P(l.b), true);
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
    return plan;
  },
  setLiftOpen(l, open) {
    if (open && l.planned) return false;                             // still only a plan
    if (open && l.issues && l.issues.length) return false;        // failed safety inspection
    if (l.opt.open === open) return true;
    l.opt.open = open;
    if (!open) for (const s of l.queue) { s.state = 'atNode'; s.edge = null; }
    if (!open) l.queue.length = 0;
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
    if (e.kind === 'lift') { e.queue.length = 0; e.carriers.length = 0; }
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
const TMP = {}, TMP2 = {};
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
    this.stats = { visitors: 0, revenue: 0, built: 0, left: 0, happySum: 0, angry: 0, stranded: 0, refunds: 0 };
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
    this._gone = false;
    for (const s of this.skiers) this.stepSkier(s, dt);
    if (this._gone) this.skiers = this.skiers.filter((s) => s.state !== 'gone');
    if (this.time >= DAY_END) this.endDay();
  },

  stepLift(l, dt) {
    if (l.planned) return;
    const T = l.T, open = l.opt.open, v = Lifts.speed(l), L = l.upPath.length;
    if (!open && !l.carriers.length) return;          // stopped
    l.clock += dt;
    const load = () => {
      if (!open || !l.queue.length) return null;
      const riders = l.queue.splice(0, T.seats);
      for (const s of riders) s.state = 'lift';
      const c = { d: 0, riders }; l.carriers.push(c); l.ridesToday += riders.length;
      return c;
    };
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
    const u = Math.random(), skill = u < 0.35 ? 0 : u < 0.8 ? 1 : 2;
    const bases = Net.nodes.filter((n) => n.base);
    const good = bases.filter((b) => this.canStart(b, skill));
    const pool = good.length ? good : bases;
    const node = pool[(Math.random() * pool.length) | 0];
    this.skiers.push({
      skill, node, happy: 60 + Math.random() * 10, want: 4 + ((Math.random() * 7) | 0), done: 0,
      state: 'atNode', edge: null, d: 0, wait: 0, pace: 0.85 + Math.random() * 0.3, wig: Math.random() * 6.28, last: null,
    });
    this.money += TICKET; this.stats.visitors++; this.stats.revenue += TICKET;
  },

  reach(node, skill) {
    const seen = new Set([node]), q = [node], max = SKILL[skill].maxDiff;
    while (q.length) {
      const n = q.shift();
      for (const r of n.runs) if (r.a === n && !r.planned && r.diff <= max) return true;
      for (const l of n.lifts) if (l.a === n && l.opt.open && !l.planned && !seen.has(l.b)) { seen.add(l.b); q.push(l.b); }
    }
    return false;
  },

  liftUseful(l, skill) {
    if (l._uv !== Net.version) { l._uv = Net.version; l._u = [null, null, null]; }
    if (l._u[skill] === null) l._u[skill] = this.reach(l.b, skill);
    return l._u[skill];
  },

  canStart(n, skill) {
    return n.runs.some((r) => r.a === n && !r.planned && r.diff <= SKILL[skill].maxDiff) ||
           n.lifts.some((l) => l.a === n && l.opt.open && this.liftUseful(l, skill));
  },

  decide(s) {
    const n = s.node, sk = SKILL[s.skill], tired = s.done >= s.want;
    if (n.base && tired) return this.leave(s);
    if (s.done >= s.want + 4) return this.leave(s);
    const opts = [];
    for (const r of n.runs) {
      if (r.a !== n || r.planned || r.diff > sk.maxDiff) continue;
      let w = 1 + sk.pref[r.diff] + (r !== s.last ? 2 : 0);
      if (tired && r.b.base) w *= 4;
      opts.push([r, w]);
    }
    for (const l of n.lifts) {
      if (l.a !== n || !l.opt.open || !this.liftUseful(l, s.skill)) continue;
      // pick by expected wait + ride time; beginners avoid T-bars, everyone likes a warm cabin
      let w = 3 / (1 + (Lifts.waitTime(l) + Lifts.rideTime(l) * 0.3) / 300);
      if (l.T.beginnerPenalty && s.skill === 0) w *= 0.3;
      if (s.cameBy && s.cameBy.line && s.cameBy.line === l.line && !tired) w *= 4;   // stay seated through the station
      w *= 1 + (l.T.comfort || 0) * 0.05;
      opts.push([l, w]);
    }
    if (!opts.length) {
      if (n.base) {
        if (!s.done) { s.happy -= 50; this.money -= TICKET; this.stats.revenue -= TICKET; this.stats.refunds++; this.warn('skill' + s.skill, `${sk.name} can't find anything to ski — they need ${sk.maxDiff ? 'easier' : 'blue'} runs from a lift.`); }
        return this.leave(s);
      }
      return this.strand(s);
    }
    let t = Math.random() * opts.reduce((a, o) => a + o[1], 0), pick = opts[0][0];
    for (const [e, w] of opts) { t -= w; if (t <= 0) { pick = e; break; } }
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
    if (s.state === 'queue' && s.edge) { const q = s.edge.queue, i = q.indexOf(s); if (i >= 0) q.splice(i, 1); }
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
          const junction = !r.b.base && !r.b.lifts.some((x) => !x.planned) && r.b.runs.some((x) => x.a === r.b && !x.planned);
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
      case 'walk':
        s.d += 2.5 * dt;
        if (s.d >= s.walk.len) { s.state = 'atNode'; s.node = s.walk.to; }
        break;
    }
  },

  endDay() {
    for (const s of this.skiers) if (s.state !== 'gone') this.leave(s);
    this.skiers = [];
    for (const l of Net.lifts) { l.queue.length = 0; l.carriers.length = 0; l.ridesYesterday = l.ridesToday; l.ridesToday = 0; }
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
    return ops;
  },

  serialize() {
    return {
      v: 1, key: this.map.key, money: this.money, day: this.day, time: this.dayOver ? DAY_END : this.time,
      rep: this.rep, debtDays: this.debtDays, stats: this.stats,
      nodes: Net.nodes.filter((n) => !n.base).map((n) => ({ id: n.id, x: n.x, z: n.z })),
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
    for (const n of d.nodes) byId.set(n.id, Net.addNode(n.x, n.z));
    const P = (n) => ({ x: n.x, z: n.z, node: n });
    for (const l of d.lifts) {
      const plan = Net.liftPlan(l.type, P(byId.get(l.a)), P(byId.get(l.b)), true);
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
      } else if (s.state === 'walk') {
        const t = s.d / (s.walk.len || 1), x = s.walk.x + (s.walk.to.x - s.walk.x) * t, z = s.walk.z + (s.walk.to.z - s.walk.z) * t;
        putSkier(x, Terrain.height(x, z) + 5.5, z, 1, s.skill);
      }
    }
    const cm = this.carMeshes, cnt = {};
    for (const k in cm) cnt[k] = 0;
    let col = null;
    const putCar = (model, x, y, z, q) => {
      const im = cm[model];
      if (cnt[model] >= im.instanceMatrix.count) return;
      M.compose(V.set(x, y, z), q, S.set(1, 1, 1)); im.setColorAt(cnt[model], col); im.setMatrixAt(cnt[model]++, M);
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
      } else if (T.model) {
        const sp = v * Lifts.interval(l), up = T.kind === 'surface' ? l.ropeUp : l.upPath, Lr = up.length;
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
          } else putSkier(p.x + px * (k ? 1.5 : -1.5), p.y + 5.5, p.z + pz * (k ? 1.5 : -1.5), 0.8, s.skill);
        });
      }
      l.queue.forEach((s, k) => {
        const row = Math.floor(k / 6), col = (k % 6) - 2.5;
        const x = l.a.x - ux * (34 + row * 7) + px * col * 6, z = l.a.z - uz * (34 + row * 7) + pz * col * 6;
        putSkier(x, Terrain.height(x, z) + 5.5, z, 1, s.skill);
      });
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
  write() { if (Game.map && !Game.over) this.set(this.key(Game.map.key), Game.serialize()); },
  clear(k) { try { localStorage.removeItem(this.key(k)); } catch { /* ignore */ } },
  best(k) { return this.get('skiresort.best.' + k); },
  record(k, days) { const b = this.best(k); if (!b || days > b.days) this.set('skiresort.best.' + k, { days }); },
};
