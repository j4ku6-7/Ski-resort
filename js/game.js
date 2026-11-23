'use strict';
// Lift/run network + skier simulation.

const TIME_SCALE = 30;                 // world seconds per real second at 1x
const DAY_START = 8.5 * 3600, LAST_ARRIVAL = 14.5 * 3600, DAY_END = 16.5 * 3600;
const SNAP = 70, RUN_WIDTH = 34, RUN_COST_PER_M = 25, RUN_OP_PER_M = 0.12;
const TICKET = 38, START_MONEY = 650000, MAX_SKIERS = 1500;

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
const LIFT_TYPES = {
  chair: { name: 'Chairlift', baseCost: 20000, perM: 55, speed: 5, interval: 7, seats: 4, towerGap: 110,
           towerH: 11, gauge: 4, maxLen: 2600, opBase: 400, opPerM: 0.35, station: 0x8a96a3 },
  gondola: { name: 'Gondola', baseCost: 60000, perM: 120, speed: 6, interval: 10, seats: 8, towerGap: 230,
             towerH: 18, gauge: 6, maxLen: 6000, opBase: 900, opPerM: 0.7, station: 0xb83a32 },
};

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
  MAT.station = {};
  for (const k in LIFT_TYPES) MAT.station[k] = new THREE.MeshLambertMaterial({ color: LIFT_TYPES[k].station });
}

function makeRibbon(pts, color, opacity = 0.62, width = RUN_WIDTH) {
  const n = pts.length, across = 5, pos = new Float32Array(n * across * 3);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (let c = 0; c < across; c++) {
      const o = (c / (across - 1) - 0.5) * width;
      const x = pts[i].x - dz * o, z = pts[i].z + dx * o, k = (i * across + c) * 3;
      pos[k] = x; pos[k + 1] = Terrain.height(x, z) + 2; pos[k + 2] = z;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let c = 0; c < across - 1; c++) {
    const a = i * across + c, b = a + 1, d = a + across, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = 2;
  return mesh;
}

function disposeGroup(obj) {
  const shared = new Set([...Object.values(GEO), MAT.tower, MAT.cable, MAT.node, MAT.lodge, MAT.roof, ...Object.values(MAT.station)]);
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

function buildLiftVisual(l) {
  const T = l.T, a = l.a, b = l.b, g = new THREE.Group();
  const hl = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / hl, uz = (b.z - a.z) / hl, px = -uz, pz = ux;
  const ground = (s) => Terrain.height(a.x + ux * s, a.z + uz * s);
  const prof = [{ s: 0, y: a.y + T.towerH }, { s: hl, y: b.y + T.towerH }];
  const nT = Math.floor(hl / T.towerGap);
  for (let k = 1; k <= nT; k++) { const s = (hl * k) / (nT + 1); prof.push({ s, y: ground(s) + T.towerH }); }
  prof.sort((p, q) => p.s - q.s);
  // add towers wherever the cable would scrape the snow
  for (let iter = 0; iter < 40; iter++) {
    let worst = null, wc = 6;
    for (let i = 0; i < prof.length - 1; i++) {
      const p = prof[i], q = prof[i + 1];
      for (let s = p.s + 10; s < q.s - 10; s += 10) {
        const c = p.y + ((q.y - p.y) * (s - p.s)) / (q.s - p.s) - ground(s);
        if (c < wc) { wc = c; worst = s; }
      }
    }
    if (worst === null) break;
    prof.push({ s: worst, y: ground(worst) + T.towerH });
    prof.sort((p, q) => p.s - q.s);
  }
  const rotY = Math.atan2(ux, uz);
  l.quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  l.dir = { ux, uz, px, pz };
  for (let i = 1; i < prof.length - 1; i++) {
    const s = prof[i].s, x = a.x + ux * s, z = a.z + uz * s, gy = ground(s);
    const t = new THREE.Mesh(GEO.tower, MAT.tower); t.position.set(x, gy - 1, z); t.scale.set(1, prof[i].y - gy + 1, 1);
    const bar = new THREE.Mesh(GEO.box, MAT.tower); bar.position.set(x, prof[i].y, z);
    bar.scale.set(T.gauge * 2 + 2, 1.2, 1.2); bar.rotation.y = rotY;
    g.add(t, bar);
  }
  for (const [n, s] of [[a, 0], [b, hl]]) {
    const st = new THREE.Mesh(GEO.box, MAT.station[l.type]);
    st.scale.set(T.gauge * 2 + 12, T.towerH + 2, 24);
    st.position.set(a.x + ux * s, n.y + (T.towerH + 2) / 2 - 1, a.z + uz * s); st.rotation.y = rotY;
    g.add(st);
  }
  const side = (sgn) => prof.map((p) => ({ x: a.x + ux * p.s + px * T.gauge * sgn, y: p.y, z: a.z + uz * p.s + pz * T.gauge * sgn }));
  const up = side(1), down = side(-1).reverse();
  for (const line of [up, down]) {
    const geo = new THREE.BufferGeometry().setFromPoints(line.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    g.add(new THREE.Line(geo, MAT.cable));
  }
  l.upPath = new Path(up);
  l.downPath = new Path(down);
  l.vis = g;
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

  liftPlan(type, p, q) {
    const T = LIFT_TYPES[type];
    let a = p, b = q, ya = this.pointY(p), yb = this.pointY(q);
    if (yb < ya) { [a, b] = [b, a]; [ya, yb] = [yb, ya]; }
    const hl = Math.hypot(b.x - a.x, b.z - a.z), vert = yb - ya, len = Math.hypot(hl, vert);
    const cost = T.baseCost + T.perM * len;
    let msg = null;
    if (a.node && a.node === b.node) msg = 'Both ends are on the same spot';
    else if (hl < 80) msg = 'Too short';
    else if (len > T.maxLen) msg = `Too long — a ${T.name.toLowerCase()} can be at most ${fmt(T.maxLen)} m`;
    else if (vert < 20) msg = 'A lift needs at least 20 m of climb';
    else if (cost > Game.money) msg = 'Not enough money';
    return { ok: !msg, msg, a, b, hl, len, vert, cost, T, type };
  },

  buildLift(plan) {
    const A = this.pointNode(plan.a), B = this.pointNode(plan.b), T = plan.T;
    const l = { kind: 'lift', id: this.seq.lift++, type: plan.type, T, a: A, b: B, len: plan.len, vert: plan.vert,
                cost: plan.cost, queue: [], carriers: [], clock: 0, next: T.interval };
    l.name = `L${l.id}`;
    buildLiftVisual(l);
    this.group.add(l.vis);
    l.label = Labels.add('', 'queue', { x: A.x, y: A.y + T.towerH + 26, z: A.z });
    A.lifts.push(l); B.lifts.push(l); this.lifts.push(l);
    Terrain.clearTrees([A, B], 14);
    Game.spend(plan.cost);
    this.version++;
    return l;
  },

  runPlan(points) {
    if (points.length < 2) return { ok: false, msg: 'Click more points down the slope' };
    const dense = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 8));
      for (let k = i ? 1 : 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n;
        dense.push({ x, y: Terrain.height(x, z), z });
      }
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
    const path = new Path(dense), len = path.length;
    const drop = dense[0].y - dense[dense.length - 1].y;
    const diff = maxG <= 0.25 ? 0 : maxG <= 0.4 ? 1 : 2;
    const cost = len * RUN_COST_PER_M;
    let msg = null;
    if (drop < 25) msg = 'A run has to go downhill';
    else if (climb > 10) msg = `This line climbs ${Math.round(climb)} m uphill — follow the slope down`;
    else if (maxG > 0.9) msg = 'Too steep to groom (over 42°)';
    else if (cost > Game.money) msg = 'Not enough money';
    return { ok: !msg, msg, dense, path, len, drop, maxG, diff, cost, points };
  },

  buildRun(plan) {
    const A = this.pointNode(plan.points[0]), B = this.pointNode(plan.points[plan.points.length - 1]);
    const r = { kind: 'run', id: this.seq.run++, a: A, b: B, diff: plan.diff, path: plan.path, len: plan.len,
                drop: plan.drop, maxG: plan.maxG, cost: plan.cost };
    r.name = `Run ${r.id}`;
    r.vis = makeRibbon(plan.dense, DIFF[r.diff].color);
    this.group.add(r.vis);
    const s = plan.dense[Math.min(6, plan.dense.length - 1)];
    r.label = Labels.add(String(r.id), `run run-${r.diff}`, { x: s.x, y: s.y + 22, z: s.z });
    A.runs.push(r); B.runs.push(r); this.runs.push(r);
    Terrain.clearTrees(plan.dense, RUN_WIDTH * 0.65);
    Game.spend(plan.cost);
    this.version++;
    const fed = A.base || A.lifts.some((l) => l.b === A) || A.runs.some((x) => x.b === A);
    if (!fed) UI.toast('Nothing brings skiers to the top of this run yet — end a lift there.');
    return r;
  },

  remove(e) {
    const list = e.kind === 'lift' ? this.lifts : this.runs, key = e.kind === 'lift' ? 'lifts' : 'runs';
    list.splice(list.indexOf(e), 1);
    for (const n of [e.a, e.b]) n[key] = n[key].filter((x) => x !== e);
    this.group.remove(e.vis); disposeGroup(e.vis); e.label.remove();
    Game.money += e.cost * 0.5;
    for (const s of Game.skiers) {
      if (s.edge !== e) continue;
      s.state = 'atNode'; s.edge = null;
      s.node = e.kind === 'lift' ? e.a : e.b;
    }
    if (e.kind === 'lift') { e.queue.length = 0; e.carriers.length = 0; }
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
    this.newDayStats();
    Net.reset(scene);
    for (const p of map.places) if (p.kind === 'base') Net.addNode(p.x, p.z, { base: true, name: p.name });

    this.skierMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(2.6, 5, 3, 6), new THREE.MeshLambertMaterial(), MAX_SKIERS);
    this.carMesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshLambertMaterial(), 8000);
    for (const im of [this.skierMesh, this.carMesh]) {
      im.setColorAt(0, new THREE.Color()); im.count = 0; im.frustumCulled = false; scene.add(im);
    }
    this.skillColors = SKILL.map((s) => new THREE.Color(s.color));
    this.chairColor = new THREE.Color(0x30343a);
    this.cabinColor = new THREE.Color(0xd0453a);
    this._m = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._q = new THREE.Quaternion();
  },

  newDayStats() {
    this.stats = { visitors: 0, revenue: 0, built: 0, left: 0, happySum: 0, angry: 0, stranded: 0 };
    this.warned = {};
  },

  spend(c) { this.money -= c; this.stats.built += c; },

  get open() { return Net.lifts.length > 0 && Net.runs.length > 0; },

  liftCapacity() { return Net.lifts.reduce((s, l) => s + (l.T.seats / l.T.interval) * 3600, 0); },

  demandPerHour() {
    let km = 0; const kinds = new Set();
    for (const r of Net.runs) { km += r.len / 1000; kinds.add(r.diff); }
    const d = (30 + km * 55) * (0.35 + (1.3 * this.rep) / 100) * (0.7 + 0.15 * kinds.size);
    const h = this.time / 3600, tod = h < 11 ? 1.5 : h < 13 ? 0.9 : 0.4;
    return Math.min(d * tod, this.liftCapacity() * 0.35);
  },

  update(dtReal) {
    if (this.paused || this.dayOver) return;
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
    const T = l.T;
    l.clock += dt;
    while (l.clock >= l.next) {
      const t0 = l.next; l.next += T.interval;
      if (l.queue.length) {
        const riders = l.queue.splice(0, T.seats);
        for (const s of riders) s.state = 'lift';
        l.carriers.push({ t0, riders });
      }
    }
    const L = l.upPath.length;
    while (l.carriers.length && (l.clock - l.carriers[0].t0) * T.speed >= L) {
      for (const s of l.carriers.shift().riders) {
        if (s.state !== 'lift') continue;
        s.state = 'atNode'; s.node = l.b; s.edge = null; s.happy = Math.min(100, s.happy + 1);
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
      for (const r of n.runs) if (r.a === n && r.diff <= max) return true;
      for (const l of n.lifts) if (l.a === n && !seen.has(l.b)) { seen.add(l.b); q.push(l.b); }
    }
    return false;
  },

  liftUseful(l, skill) {
    if (l._uv !== Net.version) { l._uv = Net.version; l._u = [null, null, null]; }
    if (l._u[skill] === null) l._u[skill] = this.reach(l.b, skill);
    return l._u[skill];
  },

  canStart(n, skill) {
    return n.runs.some((r) => r.a === n && r.diff <= SKILL[skill].maxDiff) ||
           n.lifts.some((l) => l.a === n && this.liftUseful(l, skill));
  },

  decide(s) {
    const n = s.node, sk = SKILL[s.skill], tired = s.done >= s.want;
    if (n.base && tired) return this.leave(s);
    if (s.done >= s.want + 4) return this.leave(s);
    const opts = [];
    for (const r of n.runs) {
      if (r.a !== n || r.diff > sk.maxDiff) continue;
      let w = 1 + sk.pref[r.diff] + (r !== s.last ? 2 : 0);
      if (tired && r.b.base) w *= 4;
      opts.push([r, w]);
    }
    for (const l of n.lifts) {
      if (l.a === n && this.liftUseful(l, s.skill)) opts.push([l, 3 / (1 + l.queue.length / (l.T.seats * 6))]);
    }
    if (!opts.length) {
      if (n.base) {
        if (!s.done) { s.happy -= 50; this.warn('skill' + s.skill, `${sk.name} can't find anything to ski — they need ${sk.maxDiff ? 'easier' : 'blue'} runs from a lift.`); }
        return this.leave(s);
      }
      return this.strand(s);
    }
    let t = Math.random() * opts.reduce((a, o) => a + o[1], 0), pick = opts[0][0];
    for (const [e, w] of opts) { t -= w; if (t <= 0) { pick = e; break; } }
    s.edge = pick;
    if (pick.kind === 'lift') { s.state = 'queue'; s.wait = 0; pick.queue.push(s); }
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
    this.rep += (s.happy - this.rep) * 0.02;
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
          s.done++;
          s.happy = clamp(s.happy + SKILL[s.skill].pref[r.diff] + (s.last !== r ? 2 : -1), 0, 100);
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
    for (const l of Net.lifts) { l.queue.length = 0; l.carriers.length = 0; }
    let ops = 0;
    for (const l of Net.lifts) ops += l.T.opBase + l.T.opPerM * l.len;
    for (const r of Net.runs) ops += r.len * RUN_OP_PER_M;
    this.money -= ops;
    this.stats.ops = ops;
    this.dayOver = true;
    UI.daySummary(this.stats);
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
    const M = this._m, V = this._v, S = this._s, Q = this._q, sm = this.skierMesh, cm = this.carMesh;
    const ident = new THREE.Quaternion();
    let si = 0, ci = 0;
    const putSkier = (x, y, z, sc, skill) => {
      if (si >= MAX_SKIERS) return;
      M.compose(V.set(x, y, z), ident, S.set(sc, sc, sc)); sm.setMatrixAt(si, M); sm.setColorAt(si, this.skillColors[skill]); si++;
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
    for (const l of Net.lifts) {
      const T = l.T, sp = T.speed * T.interval, L = l.upPath.length, { ux, uz, px, pz } = l.dir;
      const gondola = l.type === 'gondola';
      S.set(gondola ? 6 : 9, gondola ? 6 : 1.6, gondola ? 6 : 3.5);
      for (let d = (l.clock * T.speed) % sp; d < L && ci < 7998; d += sp) {
        for (const path of [l.upPath, l.downPath]) {
          const p = path.at(d, TMP);
          M.compose(V.set(p.x, p.y - (gondola ? 7 : 6), p.z), l.quat, S);
          cm.setMatrixAt(ci, M); cm.setColorAt(ci, gondola ? this.cabinColor : this.chairColor); ci++;
        }
      }
      if (!gondola) {
        for (const c of l.carriers) {
          const p = l.upPath.at((l.clock - c.t0) * T.speed, TMP), n = c.riders.length;
          c.riders.forEach((s, k) => {
            const o = (k - (n - 1) / 2) * 2.2;
            putSkier(p.x + px * o, p.y - 3, p.z + pz * o, 0.45, s.skill);
          });
        }
      }
      l.queue.forEach((s, k) => {
        const row = Math.floor(k / 6), col = (k % 6) - 2.5;
        const x = l.a.x - ux * (22 + row * 7) + px * col * 6, z = l.a.z - uz * (22 + row * 7) + pz * col * 6;
        putSkier(x, Terrain.height(x, z) + 5.5, z, 1, s.skill);
      });
    }
    sm.count = si; cm.count = ci;
    sm.instanceMatrix.needsUpdate = cm.instanceMatrix.needsUpdate = true;
    if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
  },
};
