'use strict';
// Lift types, pylon styles, cable geometry (towers, clearance, sag), 3D models and per-lift settings.

// Pylon styles: cost multiplier and how much taller than the lift's standard height they may go.
const PYLONS = {
  mgd: { name: 'Modern MGD tube', cost: 1.15, hMult: 1.15, desc: 'Conical galvanised tube with a box crossarm, catwalks along the sheave trains, a caged ladder and a maintenance gantry, like on modern 8-person gondolas.' },
  tube: { name: 'Classic tube', cost: 1, hMult: 1, desc: 'Slim single tube. Cheapest, standard height.' },
  lattice: { name: 'Lattice truss', cost: 1.5, hMult: 1.6, desc: 'Classic four-legged truss. Expensive, can be built much taller.' },
  portal: { name: 'Portal frame', cost: 1.3, hMult: 1.25, desc: 'Two legs and a cross beam, straddling wide ropes.' },
  twin: { name: 'Twin-leg compression pylon', cost: 2.2, hMult: 1.1, perPylon: true, desc: 'Two box legs one behind the other along the line, under one long platform head with long sheave trains, wide walkways and a gantry over the ropes at each end: for big bends.' },
  y: { name: 'Y-pylon (two heads, one base)', cost: 1.8, hMult: 1, perPylon: true, desc: 'Two standard pylons branching from one foundation along the line, each with its own head: for big bends.' },
};

// Real-world-ish specs. speed in m/s, interval = seconds between carriers, seats per carrier.
// cold: how much skiers suffer on long rides (open chairs 1, bubble 0.3, cabins 0).
// ropes: extra rope offsets around each side (twin-rope funitel, tricable 3S).
const LIFT_TYPES = {
  carpet: {
    name: 'Magic carpet', icon: '▭', kind: 'belt', model: null, pylons: [],
    speed: 0.9, interval: 2.2, seats: 1, minLen: 20, maxLen: 220, minVert: 2, maxGrade: 0.25,
    baseCost: 15000, perM: 150, towerCost: 0, opBase: 400, opPerM: 2, cold: 0.5,
    gauge: 0, towerGap: 0, towerH: 0, sag: 0, comfort: 1, station: 0x6d7a88, color: 0x2a2d31,
    desc: 'A conveyor belt for the beginner area. Short and gentle only.',
  },
  tbar: {
    name: 'T-bar', icon: '⊤', kind: 'surface', model: 'tbar', pylons: ['tube'],
    maxSpan: 150, maxTowerH: 14,
    speed: 3, interval: 4.5, seats: 2, minLen: 100, maxLen: 1500, minVert: 10, maxGrade: 0.6,
    baseCost: 30000, perM: 45, towerCost: 3000, opBase: 1200, opPerM: 0.8, cold: 1.2,
    gauge: 4.5, towerGap: 100, towerH: 10, maxClear: 13, sag: 0.008, comfort: -1, beginnerPenalty: 5, station: 0x7c8794, color: 0x9aa3ad,
    desc: 'A cheap surface lift that drags skiers uphill. Beginners hate it, and slopes are limited to 60%.',
  },
  chair2: {
    name: 'Double chair', icon: '⑂', kind: 'aerial', model: 'chair2', station3d: 'fixed', pylons: ['tube', 'y', 'lattice'],
    maxSpan: 300, maxTowerH: 40,
    speed: 2.3, interval: 5.5, seats: 2, minLen: 150, maxLen: 2200, minVert: 20,
    baseCost: 40000, perM: 45, towerCost: 6000, opBase: 1500, opPerM: 1.0, cold: 1,
    gauge: 4.6, towerGap: 95, towerH: 17, hang: 3.7, maxClear: 45, sag: 0.02, comfort: 0, station: 0x8a96a3, color: 0x9aa3ad,
    desc: 'Fixed-grip double chair. Cheap but slow; long rides get cold.',
  },
  chair4: {
    name: 'Detachable quad', icon: '⑃', kind: 'aerial', model: 'chair4', pylons: ['mgd', 'y', 'twin', 'tube', 'lattice'],
    maxSpan: 350, maxTowerH: 45,
    speed: 5, interval: 6, seats: 4, minLen: 150, maxLen: 3000, minVert: 20,
    baseCost: 120000, perM: 70, towerCost: 9000, opBase: 3000, opPerM: 1.6, cold: 1,
    gauge: 6.5, towerGap: 120, towerH: 18, hang: 3.7, maxClear: 50, sag: 0.02, comfort: 1, station: 0x4f6d8f, color: 0x3d6fb6,
    desc: 'High-speed chairs that slow down in the stations. The workhorse lift.',
  },
  chair6: {
    name: '6-seat bubble chair', icon: '⑆', kind: 'aerial', model: 'chair6', bubble: true, pylons: ['mgd', 'y', 'twin', 'tube', 'lattice'],
    maxSpan: 350, maxTowerH: 45,
    speed: 5, interval: 5.4, seats: 6, minLen: 150, maxLen: 3200, minVert: 20,
    baseCost: 200000, perM: 90, towerCost: 12000, opBase: 4500, opPerM: 2, cold: 0.3,
    gauge: 8.5, towerGap: 125, towerH: 19, hang: 3.7, maxClear: 55, sag: 0.02, comfort: 2, station: 0x2f6bb3, color: 0x2b2f35,
    desc: 'High capacity, with weather bubbles and heated seats.',
  },
  gondola6: {
    name: '6-person gondola', icon: '▢', kind: 'aerial', model: 'cabin6', enclosed: true, pylons: ['mgd', 'y', 'twin', 'tube', 'lattice', 'portal'],
    maxSpan: 500, maxTowerH: 60,
    speed: 5, interval: 9, seats: 6, minLen: 300, maxLen: 5000, minVert: 30,
    baseCost: 190000, perM: 100, towerCost: 12000, opBase: 4500, opPerM: 2, cold: 0,
    gauge: 5.5, towerGap: 200, towerH: 20, hang: 3.6, maxClear: 85, sag: 0.025, comfort: 2, station: 0x3c8d5a, color: 0x2e9e5b,
    desc: 'Compact enclosed cabins. A cheaper gondola for medium-length lifts.',
  },
  gondola: {
    name: '8-person gondola', icon: '▣', kind: 'aerial', model: 'gondola', enclosed: true, pylons: ['mgd', 'y', 'twin', 'tube', 'lattice', 'portal'],
    maxSpan: 600, maxTowerH: 65,
    speed: 6, interval: 10, seats: 8, minLen: 300, maxLen: 6000, minVert: 30,
    baseCost: 250000, perM: 120, towerCost: 15000, opBase: 6000, opPerM: 2.5, cold: 0,
    gauge: 6, towerGap: 220, towerH: 22, hang: 3.9, maxClear: 90, sag: 0.025, comfort: 3, station: 0xb83a32, color: 0xc0392b,
    desc: 'Enclosed cabins for long lifts from the valley. Warm and comfortable.',
  },
  gondola10: {
    name: '10-person gondola', icon: '▤', kind: 'aerial', model: 'cabin10', enclosed: true, pylons: ['mgd', 'y', 'twin', 'tube', 'lattice', 'portal'],
    maxSpan: 650, maxTowerH: 70,
    speed: 6, interval: 10, seats: 10, minLen: 300, maxLen: 6500, minVert: 30,
    baseCost: 330000, perM: 140, towerCost: 18000, opBase: 7000, opPerM: 2.8, cold: 0,
    gauge: 6.8, towerGap: 230, towerH: 24, hang: 4.3, maxClear: 95, sag: 0.025, comfort: 4, station: 0x24476b, color: 0xf0f0f0,
    desc: 'Big panoramic cabins with lots of glass. High capacity on long lines.',
  },
  funitel: {
    name: 'Funitel', icon: '⧈', kind: 'aerial', model: 'funitel', enclosed: true, ropes: [-3.2, 3.2], pylons: ['portal', 'y', 'twin', 'mgd', 'lattice'],
    maxSpan: 900, maxTowerH: 80,
    speed: 7, interval: 18, seats: 24, minLen: 500, maxLen: 4500, minVert: 50,
    baseCost: 900000, perM: 260, towerCost: 60000, opBase: 12000, opPerM: 4, cold: 0,
    gauge: 9, towerGap: 380, towerH: 30, hang: 4.4, maxClear: 120, sag: 0.02, comfort: 5, station: 0x5b2d82, color: 0xffc81e,
    desc: 'Wide cabins hung from two ropes: very stable in wind, fast, and 24 people per cabin.',
  },
  gondola3s: {
    name: '3S tricable gondola', icon: '⫴', kind: 'aerial', model: 'cabin3s', enclosed: true, pylons: ['lattice', 'y', 'portal'],
    // per track: two track ropes the carriage rolls on, the haul rope centred between them and lower,
    // clamped by the grip. On the pylons the track ropes lie in saddles, the haul rope runs on sheaves.
    ropes: [-1.2, 0, 1.2], ropeY: [0, -1.3, 0], haulRope: 1, saddles: true,
    maxSpan: 3000, maxTowerH: 150,
    speed: 7.5, interval: 24, seats: 32, minLen: 800, maxLen: 8000, minVert: 80,
    baseCost: 1500000, perM: 320, towerCost: 220000, opBase: 15000, opPerM: 4.5, cold: 0,
    gauge: 11, towerGap: 1200, towerH: 48, hang: 5.3, maxClear: Infinity, sag: 0.012, comfort: 6, station: 0x1f2f3f, color: 0xd8202a,
    desc: 'Two track ropes per direction carry the cabins, a haul rope pulls them: kilometre-long spans with only a few huge pylons, 32 people per cabin.',
  },
  tram: {
    name: 'Aerial tramway', icon: '⛫', kind: 'tram', model: 'tram', enclosed: true, ropes: [-2, 2], pylons: ['lattice', 'portal'],
    maxSpan: 3000, maxTowerH: 120,
    speed: 10, seats: 80, dwell: 90, minLen: 400, maxLen: 5000, minVert: 100,
    baseCost: 600000, perM: 250, towerCost: 90000, opBase: 9000, opPerM: 3, cold: 0,
    gauge: 10, towerGap: 1400, towerH: 36, hang: 6.3, maxClear: Infinity, sag: 0.035, comfort: 5, station: 0x9a2f2f, color: 0xb3221d,
    desc: 'Two big cabins shuttle back and forth, with spans over cliffs and very few towers. Low capacity, but the views are spectacular.',
  },
};
const LIFT_ALIASES = { chair: 'chair4' };   // saves from before the lift overhaul
const CS = 3.5;                             // carriers drawn 3.5x real size so they read at map scale
const MAX_BEND = 4.5;                       // max rope deflection per sheave, degrees (inspection rule)
const WHEEL_R = 0.3 * CS, WHEEL_SP = WHEEL_R * 2.2;
const MAX_LEAN = 30, MAX_LINK_GAP = 45, MAX_LINKED = 4;
const SHEAVE_MODES = { auto: 'Automatic', support: 'Bottom (support)', hold: 'Top (hold-down)', both: 'Top and bottom' };
const SADDLE_MODES = { auto: 'Automatic (hold-down near the stations)', support: 'Saddles only', both: 'Saddles + haul rope hold-down' };
const LIFT_COLORS = [0xc0392b, 0xe67e22, 0xffc81e, 0x2e9e5b, 0x3d6fb6, 0x5b2d82, 0xf0f0f0, 0x9aa3ad, 0x2b2f35];

// Collects transformed geometry per material and merges it, so a whole lift is a handful of meshes.
class Parts {
  constructor() { this.by = {}; }
  add(key, geo, matrix) {
    if (matrix) geo.applyMatrix4(matrix);
    (this.by[key] || (this.by[key] = [])).push(geo.index ? geo.toNonIndexed() : geo);
    if (geo.index) geo.dispose();
  }
  build(group, mat) {
    for (const key in this.by) {
      const list = this.by[key];
      const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(list);
      for (const g of list) g.dispose();
      const m = new THREE.Mesh(merged, mat(key));
      if (key === 'glass') m.renderOrder = 3;
      group.add(m);
    }
  }
}

// rope sag ratio stored on the profile (set from the lift type in profile())
function T_sag(P) { return P.sag || 0; }

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

const Lifts = {
  speed(l) { return l.T.speed * l.opt.speed; },
  interval(l) {
    if (l.T.kind === 'tram') return 2 * ((l.upPath ? l.upPath.length : l.len) / this.speed(l) + l.T.dwell);
    // the carriers sit at a fixed spacing on the rope, so a slower rope sends them out less often
    return l.T.interval / (l.opt.density * l.opt.speed);
  },
  capacity(l) { return l.opt.open ? (l.T.seats / this.interval(l)) * 3600 : 0; },
  rideTime(l) { return (l.upPath ? l.upPath.length : l.len) / this.speed(l); },
  waitTime(l) { return l.opt.open ? Math.ceil(l.queue.length / l.T.seats) * this.interval(l) : Infinity; },
  dailyCost(l) {
    const T = l.T, full = T.opBase + T.opPerM * l.len + (l.towers || 0) * T.towerCost * 0.002;
    if (!l.opt.open) return full * 0.25;
    return full * (0.6 + 0.4 * l.opt.speed) * (T.kind === 'tram' ? 1 : 0.7 + 0.3 * l.opt.density);
  },
  defaultOpt() { return { speed: 1, density: 1, open: true }; },

  // Station look for detachable chairs and gondolas: 'hood' (a long glass canopy on a girder, like modern
  // gondola stations), 'building' (stone-clad ground floor, clad hall with a window band and leaning
  // ends) or 'classic' (the open gabled hall). Gondolas default to the canopy, chairs to the classic hall.
  STATION_STYLES: { hood: 'Modern canopy', building: 'Station building', classic: 'Classic hall' },
  stationStyle(l) {
    const T = l.T;
    if (T.kind !== 'aerial' || T.station3d === 'fixed') return 'classic';
    return l.opt.station || (T.enclosed ? 'hood' : 'classic');
  },

  // per-lift look
  pylonType(l, t = null) {
    const ok = l.T.pylons || [];
    if (t && t.type && ok.includes(t.type)) return t.type;
    const whole = ok.filter((k) => !PYLONS[k].perPylon);           // styles a whole lift can use
    return whole.includes(l.opt.pylon) ? l.opt.pylon : whole[0] || 'tube';
  },
  colorOf(l) {
    const hex = l.opt.color != null ? l.opt.color : l.T.color;
    if (!l._color || l._colorHex !== hex) { l._color = new THREE.Color(hex); l._colorHex = hex; }
    return l._color;
  },
  maxPylonH(T, type) { return Math.round(T.maxTowerH * (PYLONS[type] || PYLONS.tube).hMult); },

  // Pylon price grows with height (taller = more steel and a bigger foundation) and depends on style.
  towerPrice(T, h, type = (T.pylons && T.pylons[0]) || 'tube') {
    return T.towerCost * (0.4 + 0.6 * h / T.towerH) * (PYLONS[type] || PYLONS.tube).cost;
  },
  wheelPrice(T) { return T.towerCost * 0.025; },
  // explicit wheel counts are paid on top of the pylon (automatic sheaves are included in its price)
  towersValue(T, towers, defType) {
    return towers.reduce((v, t) => v + this.towerPrice(T, t.h, t.type || defType) * (1 + Math.abs(t.lean || 0) / 90) +
      (t.link ? T.towerCost * 0.2 : 0) +
      (t.wheels ? t.wheels * this.wheelPrice(T) * (t.mode === 'both' ? 2 : 1) : t.mode === 'both' ? 4 * this.wheelPrice(T) : 0), 0);
  },

  // Interior pylons of the automatic layout, as editable {s, h} (s = metres along the line, h = height).
  autoTowers(T, a, ya, b, yb) {
    const P = this.profile(T, a, ya, b, yb);
    return P.prof.slice(1, -1).map((p) => (p.link ? { s: p.s, h: Math.round(p.y - P.ground(p.s)), link: true } : { s: p.s, h: Math.round(p.y - P.ground(p.s)) }));
  },

  // Cable profile along the lift line: towers wherever the rope would touch the snow, or (for chairs)
  // float too high above it. `custom`: null = automatic pylons, or an explicit [{s, h}] list.
  profile(T, a, ya, b, yb, custom = null) {
    const hl = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / hl, uz = (b.z - a.z) / hl;
    const ground = (s) => Terrain.height(a.x + ux * s, a.z + uz * s);
    const H = T.towerH;
    const out = { hl, ux, uz, px: -uz, pz: ux, ground, prof: [], towers: 0, sag: T.sag, drop: this.ropeDrop(T), saddles: !!T.saddles };
    if (T.kind === 'belt') { out.prof = [{ s: 0, y: ya }, { s: hl, y: yb }]; return out; }
    const prof = [{ s: 0, y: ya + H }, { s: hl, y: yb + H }];
    const minClear = T.kind === 'surface' ? 2.5 : (T.hang || 1) * CS + 3;
    const cy = (p, q, s) => {
      const span = q.s - p.s, u = (s - p.s) / span;
      return p.y + (q.y - p.y) * u - 4 * T.sag * span * u * (1 - u);
    };
    out.cableY = cy;
    if (custom) {
      for (const t of custom) {
        if (!(t.s > 0 && t.s < hl)) continue;
        if (t.type === 'y' || t.type === 'twin') {
          const twin = t.type === 'twin', sp2 = (twin ? clamp(t.spread || 22, 12, 40) : clamp(t.spread || 16, 8, 30)) / 2, y = ground(t.s) + t.h;
          // a Y can lean: both heads shift along the line by h * tan(lean), keeping their spread
          const lean = twin ? 0 : clamp(t.lean || 0, -MAX_LEAN * 1.5, MAX_LEAN * 1.5), shift = t.h * Math.tan(lean * Math.PI / 180);
          const sa = clamp(t.s + shift - sp2, 1, hl - 1), sb = clamp(t.s + shift + sp2, 1, hl - 1);
          prof.push({ s: sa, foot: twin ? sa : t.s, y, type: t.type, ypair: 'a', link: true, wheels: t.wheels, mode: t.mode, src: t, lean, yShift: shift, yH: t.h });
          prof.push({ s: sb, foot: twin ? sb : t.s, y, type: t.type, ypair: 'b', link: !!t.link, src: t, yShift: shift, yH: t.h });
          continue;
        }
        const lean = clamp(t.lean || 0, -MAX_LEAN * 1.5, MAX_LEAN * 1.5), head = clamp(t.s + t.h * Math.tan(lean * Math.PI / 180), 1, hl - 1);
        prof.push({ s: head, foot: t.s, y: ground(t.s) + t.h, lean, type: t.type, wheels: t.wheels, mode: t.mode, link: !!t.link, src: t });
      }
      prof.sort((p, q) => p.s - q.s);
      Object.assign(out, { prof, towers: prof.length - 2, custom: true });
      out.trains = this.trains(T, out);
      return out;
    }
    const n = Math.floor(hl / T.towerGap);
    for (let k = 1; k <= n; k++) { const s = (hl * k) / (n + 1); prof.push({ s, y: ground(s) + H }); }
    prof.sort((p, q) => p.s - q.s);
    for (let iter = 0; iter < 80; iter++) {
      let low = null, lowC = minClear, high = null, highC = T.maxClear;
      for (let i = 0; i < prof.length - 1; i++) {
        const p = prof[i], q = prof[i + 1];
        if (q.s - p.s < 30) continue;
        for (let s = p.s + 10; s < q.s - 10; s += 10) {
          const c = cy(p, q, s) - ground(s);
          if (c < lowC) { lowC = c; low = s; }
          if (c > highC) { highC = c; high = s; }
        }
      }
      const s = low !== null ? low : high;
      if (s === null) break;
      prof.push({ s, y: ground(s) + H });
      prof.sort((p, q) => p.s - q.s);
    }
    out.prof = prof;
    // bend relief: where one pylon would turn the rope more than its wheels allow, add close
    // neighbours and link their sheaves into one battery (up to 4 pylons) to share the bend
    for (let iter = 0; iter < 12 && T.kind !== 'surface'; iter++) {
      const worst = this.trains(T, out).reduce((w, t) => (!w || t.perWheel > w.perWheel ? t : w), null);
      if (!worst || worst.perWheel <= MAX_BEND) break;
      const members = worst.j - worst.i + 1;
      if (members >= MAX_LINKED) break;
      let added = 0;
      for (const sNew of members === 1 ? [worst.s - 30, worst.s + 30] : [worst.s0 - 28, worst.s1 + 28]) {
        if (members + added >= MAX_LINKED) break;
        if (sNew < 15 || sNew > hl - 15 || prof.some((q) => Math.abs(q.s - sNew) < 18)) continue;
        prof.push({ s: sNew, y: ground(sNew) + H }); added++;
      }
      prof.sort((p, q) => p.s - q.s);
      // link every pylon within the grown span
      const lo = worst.s0 - 34, hi = worst.s1 + 34, idx = [];
      for (let k = 1; k < prof.length - 1; k++) if (prof[k].s >= lo && prof[k].s <= hi) idx.push(k);
      for (let q = 0; q < idx.length - 1 && q < MAX_LINKED - 1; q++) if (prof[idx[q + 1]].s - prof[idx[q]].s <= MAX_LINK_GAP) prof[idx[q]].link = true;
      if (!added && idx.length <= members) break;
    }
    out.towers = prof.length - 2;
    out.trains = this.trains(T, out);
    return out;
  },

  // Sheave trains. A single pylon gets a parabolic train centred on its head, turning the rope from the
  // incoming angle a1 to the outgoing a2. Linked pylons (up to 4) share one long battery: the rope follows
  // a smooth curve through their heads, so a big bend is spread over all their wheels.
  trains(T, P) {
    // twice: the second pass lets each linked train aim at the trains that are actually beside it
    const first = this.trainsPass(T, P, null);
    return first.some((t) => t.linked) ? this.trainsPass(T, P, first) : first;
  },
  trainsPass(T, P, prior) {
    const out = [], pr = P.prof;
    if (T.kind === 'belt') return out;
    const surface = T.kind === 'surface', r = surface ? 0.9 : WHEEL_R, sp = surface ? 2.2 : WHEEL_SP;
    let i = 1;
    while (i < pr.length - 1) {
      let j = i;
      while (!surface && j < pr.length - 2 && pr[j].link && j - i < MAX_LINKED - 1) j++;
      const first = pr[i], last = pr[j], prev = pr[i - 1], next = pr[j + 1];
      let a1 = Math.atan2(first.y - P.cableY(prev, first, first.s - 4), 4), a2 = Math.atan2(P.cableY(last, next, last.s + 4) - last.y, 4);
      let bend = a1 - a2, deg = Math.abs(bend) * 180 / Math.PI, press = bend >= 0;
      let mode = first.mode && first.mode !== 'auto' ? first.mode : press ? 'support' : 'hold';
      // 3S: the carriage rolls on top of the track ropes, so they only ever lie in saddles. The haul rope
      // can also get hold-down rollers ('both'): by default on the pylons near the stations' exits.
      const mode3s = () => (first.mode === 'both' || first.mode === 'support' ? first.mode : first.s < 300 || first.s > P.hl - 300 ? 'both' : 'support');
      if (T.saddles) mode = mode3s();
      let yAt, slopeAt, s0, s1, wheelS = [], n, perWheel;
      if (i === j) {
        const autoN = Math.max(2, 2 * Math.ceil(Math.max(1, deg / MAX_BEND) / 2));
        n = surface ? 2 : Math.max(2, Math.min(16, first.wheels || autoN));
        const Lt = (n - 1) * sp, c = first.s, y = first.y, tilt = (a1 + a2) / 2;
        yAt = (s) => y + Math.tan(tilt) * (s - c) - (Lt > 0 ? (bend / (2 * Lt)) * (s - c) * (s - c) : 0);
        slopeAt = (s) => Math.tan(tilt) - (Lt > 0 ? (bend / Lt) * (s - c) : 0);
        s0 = c - Lt / 2; s1 = c + Lt / 2;
        for (let w = 0; w < n; w++) wheelS.push(s0 + w * sp);
        perWheel = deg / n;
      } else {
        // The linked group acts as one long train: a single even curve through the members' heads
        // (at their mean height). It reaches out past the outer pylons, as each pylon's own train
        // would, as far as the bend needs, and its ends are tangent to the spans running onto and off
        // it, so the whole deflection is shared by its wheels with no kink where the rope arrives.
        const sA = first.s, sB = Math.max(last.s, sA + 1), c = (sA + sB) / 2;
        let yC = 0; for (let m = i; m <= j; m++) yC += pr[m].y; yC /= j - i + 1;
        const before = out.length && out[out.length - 1].j === i - 1 ? out[out.length - 1] : null;
        const from = before ? { s: before.s1, y: before.yAt(before.s1) } : prev;   // where the incoming span starts
        a1 = Math.atan2(first.y - P.cableY(from, first, first.s - 4), 4);
        const after = prior && prior.find((t) => t.i === j + 1);
        const to = after ? { s: after.s0, y: after.yAt(after.s0) } : next;            // where the outgoing span ends
        a2 = Math.atan2(P.cableY(last, to, last.s + 4) - last.y, 4);
        // Solve for the curve y(s) = Y0 + m0 (s - s0) + (m1 - m0) / (2 L) (s - s0)^2: through the heads'
        // mean height at the centre, tangent at s0 to the sagging span coming in and at s1 to the one
        // going out. Three linear equations in Y0, m0, m1.
        const sag = P.sag || 0;
        const fit = (ext) => {
          s0 = sA - ext; s1 = sB + ext;
          const L = s1 - s0, Din = s0 - from.s, Dout = to.s - s1;
          const M = [[1, 3 * L / 8, L / 8], [1, -Din, 0], [-1, -L / 2, -(L / 2 + Dout)]];
          const v = [yC, from.y - 4 * sag * Din, 4 * sag * Dout - to.y];
          const det = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
          const D = det(M), col = (k) => M.map((row, r) => row.map((x, c2) => (c2 === k ? v[r] : x)));
          return { L, Y0: det(col(0)) / D, m0: det(col(1)) / D, m1: det(col(2)) / D };
        };
        // reach out past the outer pylons as far as the bend needs, but stay clear of the neighbours
        const room = Math.max(sp, Math.min(sA - from.s, to.s - sB) - 6);
        let f = fit(Math.min(2 * sp, room));
        for (let it = 0; it < 2; it++) {
          const dg = Math.abs(Math.atan(f.m0) - Math.atan(f.m1)) * 180 / Math.PI;
          const need = (Math.ceil(dg / (MAX_BEND * 0.8)) - 1) * sp;          // keeps every wheel well inside the limit
          f = fit(Math.min(room, clamp((need - (sB - sA)) / 2, 2 * sp, 7 * sp)));
        }
        a1 = Math.atan(f.m0); a2 = Math.atan(f.m1);
        bend = a1 - a2; deg = Math.abs(bend) * 180 / Math.PI; press = bend >= 0;
        if (!(first.mode && first.mode !== 'auto')) mode = press ? 'support' : 'hold';
        if (T.saddles) mode = mode3s();
        const Lt = f.L, k = (f.m1 - f.m0) / Lt, S0 = s0, m = f.m0, Y0 = f.Y0;
        yAt = (s) => Y0 + m * (s - S0) + (k / 2) * (s - S0) * (s - S0);
        slopeAt = (s) => m + k * (s - S0);
        const nMax = Math.floor(Lt / sp) + 1;
        n = Math.max(2, Math.min(nMax, first.wheels || nMax));
        for (let w = 0; w < n; w++) wheelS.push(s0 + (Lt * w) / (n - 1));
        for (let m = i; m <= j; m++) pr[m].y = yAt(pr[m].s);
        perWheel = deg / n;
      }
      out.push({ i, j, s0, s1, Lt: s1 - s0, s: (s0 + s1) / 2, y: yAt((s0 + s1) / 2), yAt, slopeAt, wheelS, a1, a2, bend, deg,
                 perWheel, press, mode, n, r, sp, auto: !first.wheels, linked: j > i });
      i = j + 1;
    }
    return out;
  },

  // the train that carries interior profile point i
  // how far below the track the lowest rope runs (the 3S haul rope), and one rope's height offset
  ropeDrop(T) { return Math.max(0, ...(T.ropeY || [0]).map((v) => -v)); },
  ropeDY(T, k) { return T.ropeY ? T.ropeY[k] || 0 : 0; },
  isSaddle(T, k) { return !!T.saddles && k !== T.haulRope; },
  trainFor(P, i) { return (P.trains || []).find((t) => i >= t.i && i <= t.j); },

  // Lean that lines a pylon up with the combined pull of its two ropes (degrees).
  alignedLean(t) {
    const vx = Math.cos(t.a2) - Math.cos(t.a1), vy = Math.sin(t.a2) - Math.sin(t.a1);
    if (Math.abs(vy) < 1e-4) return 0;
    return clamp(Math.atan(vx / vy) * 180 / Math.PI, -MAX_LEAN, MAX_LEAN);
  },

  // Safety inspection of a rope profile. Returns issues (strings) and coloured rope samples.
  inspect(T, P, a) {
    const issues = [], samples = [];
    if (T.kind === 'belt' || !P.cableY) return { issues, samples };
    const hang = T.kind === 'surface' ? 0 : (T.hang || 1) * CS;
    let hitRuns = 0, inHit = false, high = 0, longest = 0;
    for (let i = 0; i < P.prof.length - 1; i++) {
      const p = P.prof[i], q = P.prof[i + 1];
      longest = Math.max(longest, q.s - p.s);
      for (let s = p.s; s <= q.s; s += 5) {
        const y = P.cableY(p, q, s), g = P.ground(s), clear = y - hang - g;
        let st;
        if (T.kind === 'surface') st = clear < 2 ? 'hit' : clear > T.maxClear ? 'high' : 'ok';
        else st = clear < 1 ? 'hit' : clear < 3 ? 'low' : y - g > T.maxClear ? 'high' : 'ok';
        if (st === 'hit' && !inHit) hitRuns++;
        inHit = st === 'hit';
        if (st === 'high') high = Math.max(high, y - g);
        samples.push({ s, x: a.x + P.ux * s, y, z: a.z + P.uz * s, st });
      }
    }
    if (hitRuns) issues.push(T.kind === 'surface' ? `The rope drags on the snow in ${hitRuns} place${hitRuns > 1 ? 's' : ''}` :
      `Carriers would hit the snow in ${hitRuns} place${hitRuns > 1 ? 's' : ''}`);
    if (high) issues.push(T.kind === 'surface' ? 'The rope is too high, so the T-bars can\'t reach the skiers' :
      `${T.enclosed ? 'Cabins hang' : 'Chairs hang'} ${Math.round(high)} m above the ground (max ${T.maxClear} m), too high to evacuate`);
    if (longest > T.maxSpan) issues.push(`A span of ${Math.round(longest)} m is too long (max ${T.maxSpan} m)`);
    if (P.custom && P.trains && T.kind !== 'surface') {
      for (let i = 1; i < P.prof.length - 1; i++) {
        const q = P.prof[i];
        if (Math.abs(q.lean || 0) > MAX_LEAN) issues.push(`P${i}: leans ${Math.abs(q.lean).toFixed(0)}° (max ${MAX_LEAN}°)`);
        if (q.link && i < P.prof.length - 2 && P.prof[i + 1].s - q.s > MAX_LINK_GAP) issues.push(`P${i} and P${i + 1} are ${Math.round(P.prof[i + 1].s - q.s)} m apart, too far to link their sheaves (max ${MAX_LINK_GAP} m)`);
      }
      P.trains.forEach((t) => {
        if (t.j - t.i === MAX_LINKED - 1 && P.prof[t.j].link && t.j < P.prof.length - 2) issues.push(`At most ${MAX_LINKED} pylons can share one sheave train`);
        const name = t.linked ? `P${t.i}–P${t.j}` : `P${t.i}`;
        if (t.perWheel > MAX_BEND) issues.push(`${name}: the rope bends ${t.perWheel.toFixed(1)}° per wheel (max ${MAX_BEND}°). Add wheels.`);
        if (T.saddles ? !t.press && t.deg > 0.3 : t.mode === 'support' && !t.press && t.deg > 0.3) issues.push(T.saddles
          ? `${name}: the track ropes lift off the saddles. A 3S carriage rolls on top of them, so only the haul rope can be held down. Make this pylon taller.`
          : `${name}: the rope lifts off the support wheels. Use top or top-and-bottom wheels.`);
        if (t.mode === 'hold' && t.press && t.deg > 0.3) issues.push(`${name}: the rope presses down but only has top wheels. Use bottom or both.`);
      });
    }
    return { issues, samples };
  },

  // sampled rope polyline at lateral offset `off` (metres, + = uphill side)
  ropeLine(P, a, sgn, gauge) {
    const pts = [], { prof, ux, uz, px, pz } = P, off = sgn * gauge;
    const at = (s, y) => pts.push({ x: a.x + ux * s + px * off, y, z: a.z + uz * s + pz * off });
    if (P.trains && P.trains.length && P.cableY) {
      // station -> [train contact points] -> ... -> station; spans sag between the trains
      const sup = [{ s: 0, y: prof[0].y, Lt: 0 }, ...P.trains, { s: P.hl, y: prof[prof.length - 1].y, Lt: 0 }];
      const exitOf = (t) => (t.Lt ? { s: t.s1, y: t.yAt(t.s1) } : { s: t.s, y: t.y });
      const entryOf = (t) => (t.Lt ? { s: t.s0, y: t.yAt(t.s0) } : { s: t.s, y: t.y });
      at(sup[0].s, sup[0].y);
      for (let k = 0; k < sup.length - 1; k++) {
        const A = exitOf(sup[k]), B = entryOf(sup[k + 1]), span = Math.max(1, B.s - A.s), n = Math.max(1, Math.ceil(span / 15));
        const sag = T_sag(P);
        for (let j = 1; j <= n; j++) {
          const u = j / n;
          at(A.s + span * u, A.y + (B.y - A.y) * u - 4 * sag * span * u * (1 - u));
        }
        const t = sup[k + 1];
        if (t.Lt) for (let w = 1; w < t.n; w++) at(t.wheelS[w], t.yAt(t.wheelS[w]));
      }
      return pts;
    }
    for (let i = 0; i < prof.length - 1; i++) {
      const p = prof[i], q = prof[i + 1], n = Math.max(1, Math.ceil((q.s - p.s) / 15));
      for (let k = i ? 1 : 0; k <= n; k++) {
        const s = p.s + ((q.s - p.s) * k) / n;
        const y = P.cableY ? P.cableY(p, q, s) : p.y + ((q.y - p.y) * k) / n;
        pts.push({ x: a.x + ux * s + px * off, y, z: a.z + uz * s + pz * off });
      }
    }
    return pts;
  },

  // Ground-level path for surface lifts and belts: riders are dragged along the snow.
  groundLine(P, a, sgn, gauge) {
    const pts = [], { hl, ux, uz, px, pz } = P, n = Math.max(1, Math.ceil(hl / 8));
    for (let k = 0; k <= n; k++) {
      const s = (hl * k) / n, x = a.x + ux * s + px * gauge * sgn, z = a.z + uz * s + pz * gauge * sgn;
      pts.push({ x, y: Terrain.height(x, z), z });
    }
    return pts;
  },

  maxGroundGrade(P) {
    let g = 0;
    for (let s = 0; s + 20 <= P.hl; s += 10) g = Math.max(g, Math.abs(P.ground(s + 20) - P.ground(s)) / 20);
    return g;
  },

  // ---------- 3D ----------
  initAssets() {
    if (this.M) return;
    const lam = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
    this.M = {
      steel: lam(0x7b828b), dark: lam(0x2b2f35), rubber: lam(0x1a1c20), concrete: lam(0xb4afa6), roof: lam(0x3d434b),
      wood: lam(0x9a6a3c), wall: lam(0xe9e4da), edge: lam(0xf2c230), stone: lam(0x8e8a83), frame: lam(0xc9ccd0),
      hood: lam(0x4b5f9e, { transparent: true, opacity: 0.78, side: THREE.DoubleSide }), belt: lam(0x2a2d31), galv: lam(0xa9b1b8), grate: lam(0x6f767d), rust: lam(0x6e4a32),
      glass: lam(0x9fd0ff, { transparent: true, opacity: 0.35, depthWrite: false }),
      glassy: lam(0x9fc7ff, { transparent: true, opacity: 0.55 }),
      cable: new THREE.LineBasicMaterial({ color: 0x15171a }),
      ropeMesh: lam(0x1d2024), trackRope: lam(0x6b5444), haulRope: lam(0x7d838b),
      station: {},
    };
    for (const k in LIFT_TYPES) this.M.station[k] = lam(LIFT_TYPES[k].station);
    this.shared = new Set([...Object.values(this.M).filter((m) => m && m.isMaterial), ...Object.values(this.M.station)]);
  },

  // carrier models hang from the grip at y = 0, travel along +z. White parts take the lift's colour.
  carrierGeometry(model) {
    const parts = [], C = new THREE.Color();
    const part = (geo, color, x, y, z) => {
      geo.translate(x, y, z);
      const g = geo.index ? geo.toNonIndexed() : geo;
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      C.set(color);
      for (let i = 0; i < n; i++) { col[3 * i] = C.r; col[3 * i + 1] = C.g; col[3 * i + 2] = C.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g);
    };
    const box = (w, h, d, x, y, z, c) => part(new THREE.BoxGeometry(w, h, d), c, x, y, z);
    const PAINT = 0xffffff, GLASS = 0x1d2a36, DARK = 0x2b2f35, METAL = 0x8a9099;
    const grip = (x = 0) => { box(0.22, 0.28, 0.55, x, -0.1, 0, DARK); };
    const cabin = (w, h, d, hanger, hangX = [0]) => {
      for (const x of hangX) {
        grip(x);
        box(0.1, hanger * 0.55, 0.1, x, -hanger * 0.28, 0, METAL);                       // hanger arm
        box(0.1, 0.1, d * 0.45, x, -hanger * 0.55, -d * 0.2, METAL);                      // elbow
        box(0.1, hanger * 0.45, 0.1, x, -hanger * 0.78, -d * 0.42, METAL);
      }
      box(w * 0.9, 0.16, d * 0.9, 0, -hanger - 0.08, 0, 0xdadfe4);                         // roof
      box(w, h, d, 0, -hanger - h / 2 - 0.16, 0, PAINT);                                   // body
      box(w + 0.03, h * 0.45, d + 0.03, 0, -hanger - 0.16 - h * 0.36, 0, GLASS);           // window band
      box(0.06, h * 0.8, d + 0.05, 0, -hanger - 0.16 - h * 0.5, 0, DARK);                  // door seam
      box(w * 0.96, 0.14, d * 0.96, 0, -hanger - h - 0.23, 0, 0x3a3f46);                   // floor skirt
    };
    if (model.startsWith('chair')) {
      const seats = +model.slice(5), w = seats * 0.62 + 0.2;
      grip();
      box(0.1, 2.5, 0.1, 0, -1.3, 0, METAL);                    // hanger
      box(w, 0.09, 0.09, 0, -2.55, 0.0, PAINT);                 // top bar
      for (const x of [-w / 2, w / 2]) { box(0.09, 0.65, 0.09, x, -2.85, 0, PAINT); box(0.07, 0.07, 0.55, x, -2.95, 0.22, PAINT); }  // frame + armrests
      box(w, 0.1, 0.6, 0, -3.2, 0.05, DARK);                    // seat cushion
      box(w, 0.62, 0.09, 0, -2.88, -0.27, DARK);                // backrest
      box(w, 0.06, 0.06, 0, -2.72, 0.56, PAINT);                // safety bar
      box(w * 0.9, 0.05, 0.22, 0, -3.66, 0.6, METAL);           // footrest
      if (model === 'chair6') box(w, 0.06, 0.6, 0, -3.15, 0.05, 0xc8102e);  // heated red seats
    } else if (model === 'cabin6') cabin(1.7, 2.0, 1.6, 1.5);
    else if (model === 'gondola') cabin(1.9, 2.1, 1.8, 1.6);
    else if (model === 'cabin10') cabin(2.2, 2.25, 2.05, 1.9);
    else if (model === 'funitel') cabin(2.9, 2.2, 2.4, 2.0, [-3.2 / CS, 3.2 / CS]);
    else if (model === 'cabin3s') {
      // 8-wheel carriage rolling on top of the two track ropes (at x = ±1.2 m, y = 0), the grip reaching
      // down between them to the haul rope (1.3 m lower), and the hanger leaving on the outer side (-x)
      // so it passes outside the pylon's saddles and crossarm
      const tx = 1.2 / CS, hy = -1.3 / CS, ox = -0.78, CAR = 0x50565e;
      for (const x of [-tx, tx]) {
        for (const z of [-1.05, -0.35, 0.35, 1.05]) box(0.09, 0.15, 0.24, x, 0.075, z, DARK);   // rollers on the rope
        box(0.14, 0.13, 2.7, x, 0.21, 0, CAR);                                               // side frame
      }
      for (const z of [-0.95, 0, 0.95]) box(tx * 2 + 0.14, 0.11, 0.16, 0, 0.27, z, CAR);       // cross members
      // grip arm between the track ropes, beside the haul rope (so it passes under hold-down rollers),
      // its jaws clamping the rope from the side
      box(0.08, 0.3 - hy, 0.5, 0.15, (0.27 + hy) / 2 + 0.05, 0, DARK);
      box(0.17, 0.1, 0.7, 0.07, hy - 0.02, 0, DARK);
      // the hanger: one curved tube, out from the carriage, down past the pylon, and back in to the roof
      const hang = new THREE.CatmullRomCurve3([[-tx - 0.05, 0.27], [-0.6, 0.12], [-0.86, -0.45], [-0.84, -1.35], [-0.6, -2.05], [-0.2, -2.5], [0, -2.62]]
        .map(([x, y]) => new THREE.Vector3(x, y, 0)));
      part(new THREE.TubeGeometry(hang, 28, 0.085, 7, false), DARK, 0, 0, 0);
      box(0.3, 0.12, 0.5, -tx - 0.1, 0.27, 0, DARK);                                           // hanger head on the carriage
      box(0.5, 0.1, 0.5, 0, -2.62, 0, DARK);                                                   // roof mount
      // panoramic cabin: rounded ends, glazing almost floor to roof between painted corner pillars
      const w = 2.75, h = 2.35, d = 3.6, top = -2.62, bot = top - h;
      const rr = (W, H, D, rt, rb, yTop, c) => {                    // side profile with rounded corners, extruded across
        const S = new THREE.Shape(), z0 = -D / 2, z1 = D / 2, y0 = yTop - H, y1 = yTop;
        S.moveTo(z0 + rb, y0); S.lineTo(z1 - rb, y0); S.quadraticCurveTo(z1, y0, z1, y0 + rb);
        S.lineTo(z1, y1 - rt); S.quadraticCurveTo(z1, y1, z1 - rt, y1); S.lineTo(z0 + rt, y1);
        S.quadraticCurveTo(z0, y1, z0, y1 - rt); S.lineTo(z0, y0 + rb); S.quadraticCurveTo(z0, y0, z0 + rb, y0);
        const g = new THREE.ExtrudeGeometry(S, { depth: W, bevelEnabled: false, curveSegments: 6 });
        g.rotateY(-Math.PI / 2); g.translate(W / 2, 0, 0);
        part(g, c, 0, 0, 0);
      };
      rr(w, h, d, 0.55, 0.3, top, PAINT);                                                      // shell in the lift's colour
      rr(w * 0.9, 0.12, d * 0.86, 0.45, 0.05, top + 0.08, 0x2c3a4e);                           // dark roof cap
      const g0 = bot + 0.62, g1 = top - 0.32, gm = (g0 + g1) / 2, gh = g1 - g0;
      box(w + 0.04, gh, d - 0.62, 0, gm, 0, GLASS);                                            // side windows
      box(w - 0.5, gh, d + 0.04, 0, gm, 0, GLASS);                                             // end windows
      box(w + 0.05, 0.05, d - 0.6, 0, gm, 0, PAINT);                                           // window rail
      box(0.05, gh, d + 0.06, 0, gm, 0, PAINT);                                                // door split in the end glass
      box(w + 0.03, 0.34, d - 0.5, 0, bot + 0.36, 0, 0x2c3a4e);                                // dark lower panel
      box(w * 0.94, 0.12, d * 0.9, 0, bot - 0.04, 0, 0x3a3f46);                                // underbody
    } else if (model === 'tram') {
      box(2.4, 0.8, 5, 0, -0.4, 0, 0x50565e);                   // carriage
      for (const x of [-0.57, 0.57]) for (const z of [-2, 0, 2]) box(0.3, 0.45, 0.6, x, -0.05, z, DARK);
      box(0.6, 2.6, 0.6, 0, -2.1, 0, METAL);                    // hanger
      box(4.2, 3.2, 7.4, 0, -5, 0, PAINT);                      // cabin
      box(4.25, 1.3, 7.45, 0, -4.5, 0, GLASS);                  // windows
      box(4.3, 0.3, 7.5, 0, -6.55, 0, 0x5f1210);
      box(3.8, 0.25, 7.0, 0, -3.3, 0, 0xdadfe4);                // roof
    } else if (model === 'tbar') {
      box(0.06, 2.3, 0.06, 0, -1.15, 0, METAL);                 // spring box + rod
      box(0.18, 0.5, 0.18, 0, -0.25, 0, DARK);
      box(1.1, 0.08, 0.08, 0, -2.3, 0, PAINT);                  // the T
    }
    const geo = THREE.BufferGeometryUtils.mergeBufferGeometries(parts);
    geo.scale(CS, CS, CS);
    return geo;
  },

  bubbleGeometry() {
    const g = new THREE.CylinderGeometry(1.05, 1.05, 6 * 0.62 + 0.4, 16, 1, true, -Math.PI * 0.15, Math.PI * 0.85);
    g.rotateZ(Math.PI / 2).translate(0, -2.75, 0.05).scale(CS, CS, CS);
    return g;
  },

  makeCarrierMeshes(scene) {
    this.initAssets();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const meshes = {};
    for (const m of ['chair2', 'chair4', 'chair6', 'cabin6', 'gondola', 'cabin10', 'funitel', 'cabin3s', 'tram', 'tbar']) {
      const im = new THREE.InstancedMesh(this.carrierGeometry(m), mat, m === 'tram' ? 64 : 5000);
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      im.count = 0; im.frustumCulled = false; scene.add(im); meshes[m] = im;
    }
    const bub = new THREE.InstancedMesh(this.bubbleGeometry(), this.M.glassy, 5000);
    bub.count = 0; bub.frustumCulled = false; scene.add(bub); meshes.bubble = bub;
    return meshes;
  },

  // ---- geometry helpers, all in a local frame F (x = across the line, y = up, z = uphill) ----
  _box(parts, key, F, w, h, d, x, y, z, rotX = 0, rotZ = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotX) g.rotateX(rotX);
    if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z);
    parts.add(key, g, F);
  },
  _cyl(parts, key, F, rt, rb, h, x, y, z, seg = 10) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y + h / 2, z); parts.add(key, g, F);
  },
  _tube(parts, key, F, p1, p2, r) {            // round tube from p1 to p2
    const d = _v.set(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]), L = d.length();
    if (L < 0.01) return;
    const g = new THREE.CylinderGeometry(r, r, L, 8, 1, true);
    _q.setFromUnitVectors(_up, d.normalize());
    g.applyMatrix4(_m4.compose(new THREE.Vector3((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2), _q, new THREE.Vector3(1, 1, 1)));
    parts.add(key, g, F);
  },
  _strut(parts, key, F, p1, p2, r) {           // square beam from p1 to p2
    const d = _v.set(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]), L = d.length();
    if (L < 0.01) return;
    const g = new THREE.BoxGeometry(r, L, r);
    _q.setFromUnitVectors(_up, d.normalize());
    g.applyMatrix4(_m4.compose(new THREE.Vector3((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2), _q, new THREE.Vector3(1, 1, 1)));
    parts.add(key, g, F);
  },
  // horizontal bullwheel with rim, hub and spokes
  _bullwheel(parts, F, R, x, y, z) {
    const rim = new THREE.TorusGeometry(R, 0.45, 6, 40); rim.rotateX(Math.PI / 2); rim.translate(x, y, z); parts.add('rubber', rim, F);
    this._cyl(parts, 'steel', F, 0.9, 0.9, 1.4, x, y - 0.7, z, 12);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      this._strut(parts, 'steel', F, [x - Math.cos(a) * R, y, z - Math.sin(a) * R], [x + Math.cos(a) * R, y, z + Math.sin(a) * R], 0.35);
    }
  },
  // Sheave battery of one train in the line frame FL (x across, y absolute height, z = metres along
  // the line): wheels on the rope curve, paired into bogies, bogies hung from a continuous balancer.
  // Platform head of a twin-leg pylon: main beams under both sheave trains following their curve,
  // cross beams, and a trapezoidal gantry over the ropes at each end.
  _twinHead(parts, FL, l, t, reach) {
    const T = l.T, beamDrop = t.mode === 'hold' ? -(2 * t.r + 1.6) : 2 * t.r + 1.2;
    const yB = (s) => t.yAt(s) - beamDrop, s0 = t.s0 - 1.5, s1 = t.s1 + 1.5, n = Math.max(2, Math.ceil((s1 - s0) / 3));
    const xo = reach + 1.6;
    for (let k = 0; k < n; k++) {
      const a = s0 + ((s1 - s0) * k) / n, b = s0 + ((s1 - s0) * (k + 1)) / n;
      for (const x of [-reach + 0.4, reach - 0.4, -xo, xo]) this._strut(parts, 'galv', FL, [x, yB(a), a], [x, yB(b), b], Math.abs(x) > reach ? 0.45 : 1.0);
      if (k % 2 === 0) this._strut(parts, 'galv', FL, [-xo, yB(a), a], [xo, yB(a), a], 0.55);       // cross beams
      this._strut(parts, 'galv', FL, [-reach + 0.4, yB(a), a], [reach - 0.4, yB(b), b], 0.25);      // plan bracing
    }
    this._strut(parts, 'galv', FL, [-xo, yB(s1), s1], [xo, yB(s1), s1], 0.55);
    // gantries over the ropes at both ends
    for (const sg of [s0 + 1.2, s1 - 1.2]) {
      const yb = yB(sg), clear = t.mode === 'hold' ? yb + 1 : t.yAt(sg) + (t.mode === 'both' ? 2 * t.r : 0) + 1.6;
      const xt = Math.max(1.8, reach * 0.55), yt = Math.max(clear + 1.5, yb + 4.5);
      for (const sx of [-1, 1]) {
        this._strut(parts, 'galv', FL, [sx * xo, yb, sg], [sx * (xo - 0.4), clear, sg], 0.5);          // posts
        this._strut(parts, 'galv', FL, [sx * (xo - 0.4), clear, sg], [sx * xt, yt, sg], 0.5);         // inclined sides
        this._strut(parts, 'galv', FL, [sx * xo, yb, sg], [0, yt, sg], 0.2);                          // diagonals
      }
      this._strut(parts, 'galv', FL, [-xt - 0.6, yt, sg], [xt + 0.6, yt, sg], 0.55);                   // top beam
      for (const sx of [-1, 1]) this._box(parts, 'galv', FL, 0.6, 0.6, 0.6, sx * (xt + 0.6), yt, sg);
    }
  },

  // flat plank from p1 to p2 (direction in the y-z plane), `w` wide across the line, `th` thick
  _plank(parts, key, F, p1, p2, w, th) {
    const dy = p2[1] - p1[1], dzz = p2[2] - p1[2], L = Math.hypot(dy, dzz);
    if (L < 0.01) return;
    const g = new THREE.BoxGeometry(w, th, L);
    g.rotateX(-Math.atan2(dy, dzz));
    g.translate(p1[0], (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2);
    parts.add(key, g, F);
  },

  // walkway beside a sheave train: follows the train's curve just below the wheels, outside the bogies
  _walkway(parts, FL, l, t, wide = false) {
    const T = l.T, ext = Math.max(0, ...(T.ropes || [0]).map(Math.abs));
    // walkways run on the inner side of the trains (outer side for twin-leg platforms)
    const x = wide ? T.gauge + ext + 2.4 : Math.max(1.6, T.gauge - ext - 2.2), drop = T.saddles ? 1.9 : (t.mode === 'hold' ? 1.6 : 2 * t.r + (wide ? 0.95 : 0.55));
    const rail = wide ? 1 : -1;                                                               // railing on the side away from the wheels
    const yAt = (s) => t.yAt(s) - drop;
    t.walk = { x, yAt };
    const s0 = t.s0 - 2, s1 = t.s1 + 2, n = Math.max(2, Math.ceil((s1 - s0) / 2.5));
    for (const sgn of [1, -1]) {
      const X = sgn * x;
      let prev = null, prevPost = null;
      for (let k = 0; k <= n; k++) {
        const s = s0 + ((s1 - s0) * k) / n, y = yAt(s), pt = [X, y, s];
        if (prev) this._plank(parts, 'grate', FL, prev, pt, wide ? 2.4 : 1.4, 0.14);
        const rx = X + sgn * rail * (wide ? 1.15 : 0.68), post = [rx, y + 1.1, s];
        this._strut(parts, 'galv', FL, [rx, y, s], post, 0.09);                                    // railing post
        if (prevPost) {
          this._strut(parts, 'galv', FL, prevPost, post, 0.1);                                      // handrail
          this._strut(parts, 'galv', FL, [prevPost[0], prevPost[1] - 0.55, prevPost[2]], [post[0], post[1] - 0.55, post[2]], 0.06);  // knee rail
        }
        prev = pt; prevPost = post;
      }
    }
  },

  _battery(parts, FL, l, t) {
    const T = l.T, surface = T.kind === 'surface';
    if (T.saddles) { this._saddles3s(parts, FL, T, t); return; }
    const sets = t.mode === 'both' ? ['support', 'hold'] : [t.mode];
    t.bal = {};
    for (const set of sets) {
      const dir = set === 'hold' ? 1 : -1, centres = t.wheelS.map((s) => {
        const th = Math.atan(t.slopeAt(s));
        return [s - Math.sin(th) * t.r * dir, t.yAt(s) + Math.cos(th) * t.r * dir];
      });
      const off = dir * (t.r + 0.6), bal = [];
      for (let w = 0; w + 1 < centres.length; w += 2) bal.push([(centres[w][0] + centres[w + 1][0]) / 2, (centres[w][1] + centres[w + 1][1]) / 2 + off]);
      if (!bal.length) bal.push([centres[0][0], centres[0][1] + off]);
      t.bal[set] = bal;
      // local +x is the downhill-rope side, so a one-sided surface lift (uphill rope) uses -x
      for (const sgn of surface ? [-1] : [1, -1]) (T.ropes || [0]).forEach((o, k) => {
        const x = sgn * (T.gauge + o), bx = x + sgn * 0.55, dy = this.ropeDY(T, k);
        if (this.isSaddle(T, k)) { if (set === 'support') this._saddle(parts, FL, t, x); return; }
        if (dy) {                                          // the 3S haul rope: its own sheaves, lower down
          const c2 = centres.map(([cz, cy]) => [cz, cy + dy]), b2 = bal.map(([z, y]) => [z, y + dy]);
          for (const [cz, cy] of c2) {
            const g = new THREE.CylinderGeometry(t.r * 0.8, t.r * 0.8, 0.3, 14); g.rotateZ(Math.PI / 2); g.translate(x, cy + t.r * 0.2 * (dir < 0 ? 1 : -1), cz); parts.add('rubber', g, FL);
          }
          for (let w = 0; w + 1 < c2.length; w += 2) this._strut(parts, 'steel', FL, [bx, c2[w][1], c2[w][0]], [bx, c2[w + 1][1], c2[w + 1][0]], 0.35);
          for (const [z, y] of b2) this._strut(parts, 'steel', FL, [bx, y - off, z], [bx, y, z], 0.3);
          for (let q = 0; q + 1 < b2.length; q++) this._strut(parts, 'steel', FL, [bx, b2[q][1], b2[q][0]], [bx, b2[q + 1][1], b2[q + 1][0]], 0.45);
          return;
        }
        for (const [cz, cy] of centres) {
          const g = new THREE.CylinderGeometry(t.r, t.r, 0.36, 16); g.rotateZ(Math.PI / 2); g.translate(x, cy, cz); parts.add('rubber', g, FL);
          const hub = new THREE.CylinderGeometry(t.r * 0.35, t.r * 0.35, 0.46, 8); hub.rotateZ(Math.PI / 2); hub.translate(x, cy, cz); parts.add('steel', hub, FL);
        }
        for (let w = 0; w + 1 < centres.length; w += 2) this._strut(parts, 'steel', FL, [bx, centres[w][1], centres[w][0]], [bx, centres[w + 1][1], centres[w + 1][0]], 0.45);
        for (const [z, y] of bal) this._strut(parts, 'steel', FL, [bx, y - off, z], [bx, y, z], 0.35);
        for (let q = 0; q + 1 < bal.length; q++) this._strut(parts, 'steel', FL, [bx, bal[q][1], bal[q][0]], [bx, bal[q + 1][1], bal[q + 1][0]], 0.55);
      });
    }
  },

  // 3S pylon head, after a photo of one: on each track the two track ropes rest on top of tall box
  // girders that follow the bend; between them, lower down, the haul rope runs over a line of sheaves,
  // each on a white cross bracket tying the girders together, with a yellow spring unit.
  _saddles3s(parts, FL, T, t) {
    const s0 = t.s0 - 3, s1 = t.s1 + 3, n = Math.max(4, Math.ceil((s1 - s0) / 1.5)), drop = -this.ropeDY(T, T.haulRope);
    const at = (k) => { const s = s0 + ((s1 - s0) * k) / n; return [s, t.yAt(s)]; };
    const half = Math.max(...T.ropes.map(Math.abs)), rw = 0.42;           // track ropes at ±half, sheave radius
    t.bal = { support: [[(t.s0 + t.s1) / 2, t.yAt((t.s0 + t.s1) / 2) - 1.55]] };   // where the pylon's posts meet the girders
    t.bal.hold = t.bal.support;
    const holdDown = t.mode === 'both';
    for (const sgn of [1, -1]) {
      const xc = sgn * T.gauge;
      for (const sx of [-1, 1]) {
        const x = xc + sx * half;
        for (let k = 0; k < n; k++) {
          const [sa, ya] = at(k), [sb, yb] = at(k + 1);
          this._plank(parts, 'frame', FL, [x, ya - 0.22, sa], [x, yb - 0.22, sb], 0.42, 0.14);              // grooved top the rope lies in
          this._plank(parts, 'galv', FL, [x + sx * 0.08, ya - 0.9, sa], [x + sx * 0.08, yb - 0.9, sb], 0.3, 1.25);   // box girder
          this._plank(parts, 'galv', FL, [x + sx * 0.2, ya - 1.5, sa], [x + sx * 0.2, yb - 1.5, sb], 0.7, 0.12);     // bottom flange
        }
      }
      // cross brackets with the haul rope sheaves, every 1.5 m or so
      for (let k = 1; k < n; k++) {
        const [sk, yk] = at(k), yh = yk - drop;
        this._strut(parts, 'frame', FL, [xc - half, yk - 1.5, sk], [xc + half, yk - 1.5, sk], 0.22);         // tie between the girders
        for (const sx of [-1, 1]) this._strut(parts, 'frame', FL, [xc + sx * 0.35, yk - 1.5, sk], [xc + sx * (half - 0.2), yk - 0.7, sk], 0.16);   // V arms
        const g = new THREE.CylinderGeometry(rw, rw, 0.26, 16); g.rotateZ(Math.PI / 2); g.translate(xc, yh - rw, sk); parts.add('rubber', g, FL);
        const hub = new THREE.CylinderGeometry(rw * 0.4, rw * 0.4, 0.4, 8); hub.rotateZ(Math.PI / 2); hub.translate(xc, yh - rw, sk); parts.add('steel', hub, FL);
        this._strut(parts, 'steel', FL, [xc + 0.25, yh - rw, sk], [xc + 0.25, yk - 1.45, sk], 0.14);               // sheave fork
        this._box(parts, 'edge', FL, 0.22, 0.3, 0.26, xc + 0.42, yh - rw - 0.25, sk);                             // yellow spring unit
        if (holdDown && k % 2 === 0) {
          // hold-down roller pressing on the haul rope from above, on a fork from the outer side; the
          // grips reach down on the inner side of the haul rope and pass under it
          const out = Math.sign(xc), yr = yh + 0.15 + rw * 0.8, fx = xc + out * 0.38;   // grips are on the inner side
          const r2 = new THREE.CylinderGeometry(rw * 0.8, rw * 0.8, 0.24, 16); r2.rotateZ(Math.PI / 2); r2.translate(xc, yr, sk); parts.add('rubber', r2, FL);
          this._strut(parts, 'steel', FL, [fx, yr, sk], [xc, yr, sk], 0.12);                                      // axle
          this._strut(parts, 'frame', FL, [fx, yr + 0.1, sk], [fx, yk - 1.45, sk], 0.18);                         // fork from the bracket
          this._box(parts, 'edge', FL, 0.2, 0.28, 0.24, fx + out * 0.18, yr + 0.3, sk);                          // spring unit
        }
      }
    }
  },

  // crossarm height (absolute) for profile point i
  _armY(P, i, t) {
    const p = P.prof[i];
    if (P.saddles) return p.y - 2.4;                 // 3S: just under the saddle girders and haul rope sheaves
    if (t.mode === 'hold') return p.y + 2 * t.r + 1.6;
    return p.y - 2 * t.r - (t.mode === 'both' ? 1.6 : 1.2) - (P.drop || 0);
  },

  pylon(parts, l, P, i, rotY, FL) {
    const T = l.T, p = P.prof[i], a = l.a, t = this.trainFor(P, i);
    const foot = p.foot != null ? p.foot : p.s, gy = P.ground(foot);
    const x = a.x + P.ux * foot, z = a.z + P.uz * foot;
    const style = this.pylonType(l, p), surface = T.kind === 'surface';
    const ext = Math.max(0, ...(T.ropes || [0]).map(Math.abs)), reach = T.gauge + ext + 1.2;
    const armAbs = this._armY(P, i, t), H = armAbs - gy, dz = p.s - foot;
    // foot frame; a leaning pylon is rotated rigidly about its foot (not sheared), so it keeps its
    // shape: its axis has length HL and tilts by atan(dz / H), which puts its top right under the head
    const F = new THREE.Matrix4().makeRotationY(rotY).premultiply(new THREE.Matrix4().makeTranslation(x, gy, z));
    const HL = Math.hypot(H, dz), FS = F.clone().multiply(new THREE.Matrix4().makeRotationX(Math.atan2(dz, Math.max(1, H))));
    // hangers from the arm to the balancer of each set, on every rope
    for (const set of t.mode === 'both' ? ['support', 'hold'] : [t.mode]) {
      const bal = t.bal[set].reduce((b, q) => (Math.abs(q[0] - p.s) < Math.abs(b[0] - p.s) ? q : b));
      for (const sgn of surface ? [-1] : [1, -1]) for (const [k, o] of (T.ropes || [0]).entries()) {
        const bx = sgn * (T.gauge + o) + sgn * 0.55, dy = this.ropeDY(T, k);
        if (this.isSaddle(T, k)) {                       // saddle girder on posts from the crossarm
          const x = sgn * (T.gauge + o);
          for (const ds of [-2.5, 0, 2.5]) this._strut(parts, 'galv', FL, [x, armAbs, p.s + ds], [x, t.yAt(p.s + ds) - 1.55, p.s + ds], 0.6);
          continue;
        }
        if (T.saddles) continue;                         // the haul rope sheaves hang between the girders
        if (set === 'hold' && t.mode === 'both') {                    // top set of a "both" train: yoke over the rope
          this._strut(parts, 'steel', FL, [bx, armAbs, p.s], [bx + sgn * 1, armAbs, p.s], 0.6);
          this._strut(parts, 'steel', FL, [bx + sgn * 1, armAbs, p.s], [bx + sgn * 1, bal[1], bal[0]], 0.5);
          this._strut(parts, 'steel', FL, [bx + sgn * 1, bal[1], bal[0]], [bx, bal[1], bal[0]], 0.5);
        } else this._strut(parts, 'steel', FL, [bx, armAbs, p.s], [bx, bal[1], bal[0]], 0.6);
      }
    }
    const ropeTop = p.y - gy;                                       // rope height above this pylon's foot
    // MGD-style head on frame M at local height Hh: box crossarm, cap, and the trapezoidal frame that
    // stands on the crossarm ends and arches over the sheave trains (for lifting the rope off the wheels)
    // Head (after the reference photo of a modern gondola pylon): crossarm out to the sheave trains,
    // and above it a lifting gantry: a top beam whose ends sit right over the ropes, carried by struts
    // that flare outwards from the crossarm, two thin posts and knee brackets under the beam ends.
    const head = (M, Hh, key = 'galv') => {
      const xr = T.gauge + ext, yA = Hh + 0.8;                                                 // rope x, crossarm top
      this._box(parts, key, M, (xr + 0.4) * 2, 1.2, 1.3, 0, Hh + 0.2, 0);                     // crossarm
      this._cyl(parts, key, M, 1.1, 1.1, 2.2, 0, Hh - 0.9, 0, 16);                             // head cap on the tube
      const ropeUp = Hh + (ropeTop - H);                                                       // rope height in this frame
      if (T.saddles) {
        // 3S: the carriages roll over the saddles, so nothing may stand above the track ropes. Railed
        // walkways on the crossarm and a short mast in the middle, between the two tracks, for the light.
        for (const sx of [-1, 1]) {
          for (const x of [xr * 0.2, xr * 0.5, xr * 0.78]) this._strut(parts, key, M, [sx * x, yA, -0.6], [sx * x, yA + 1.2, -0.6], 0.08);
          this._strut(parts, key, M, [sx * xr * 0.2, yA + 1.2, -0.6], [sx * xr * 0.78, yA + 1.2, -0.6], 0.08);
        }
        const yM = Math.max(yA + 4, ropeUp + 3);
        for (const sx of [-1, 1]) this._strut(parts, key, M, [sx * 1.2, yA, 0], [sx * 0.3, yM, 0], 0.35);
        this._box(parts, key, M, 1.2, 0.3, 0.6, 0, yM, 0);
        this._box(parts, 'accent', M, 0.6, 0.45, 0.6, 0, yM + 0.4, 0);                                   // obstruction light
        return;
      }
      const clear = t.mode === 'hold' ? Hh + 1.5 : (t.mode === 'both' ? ropeUp + 2 * t.r : ropeUp) + 2.4;
      const yT = Math.max(yA + xr * 0.75, clear), xT = xr + 0.7;
      this._box(parts, key, M, xT * 2, 0.75, 0.75, 0, yT, 0);                                  // top beam over the ropes
      for (const sx of [-1, 1]) {
        this._strut(parts, key, M, [sx * xr * 0.6, yA, 0], [sx * (xr - 0.15), yT - 0.38, 0], 0.55);   // flaring strut
        this._strut(parts, key, M, [sx * (xr - 1.6), yT - 0.38, 0], [sx * (xr - 0.15), yT - 1.9, 0], 0.32);   // knee brace
        this._strut(parts, key, M, [sx * xr * 0.3, yA, 0], [sx * xr * 0.3, yT - 0.38, 0], 0.28); // thin post
        this._box(parts, key, M, 0.5, 0.9, 0.7, sx * (xT - 0.3), yT - 0.8, 0);                   // hoist bracket at the beam end
        // railing hoops on the crossarm
        for (const x of [xr * 0.38, xr * 0.85]) this._strut(parts, key, M, [sx * x, yA, -0.5], [sx * x, yA + 1.2, -0.5], 0.08);
        this._strut(parts, key, M, [sx * xr * 0.38, yA + 1.2, -0.5], [sx * xr * 0.85, yA + 1.2, -0.5], 0.08);
      }
      // ladder carries on from the tube up to the top beam
      for (const lx of [-0.35, 0.35]) this._box(parts, key, M, 0.08, yT - yA, 0.08, lx, (yA + yT) / 2, 0.75);
      for (let y = yA + 0.4; y < yT; y += 0.9) this._box(parts, key, M, 0.7, 0.06, 0.06, 0, y, 0.75);
      this._box(parts, 'accent', M, 0.6, 0.45, 0.6, 0, yT + 0.6, 0);                                     // obstruction light
    };
    const ladder = (M, rb, y0, y1) => {
      const lz = rb + 0.45;
      for (const lx of [-0.35, 0.35]) this._box(parts, 'galv', M, 0.08, y1 - y0, 0.08, lx, (y0 + y1) / 2, lz);
      for (let y = y0 + 0.3; y < y1; y += 0.9) this._box(parts, 'galv', M, 0.7, 0.06, 0.06, 0, y, lz);
      for (let y = y0 + 2.5; y < y1; y += 1.8) {
        const ring = new THREE.TorusGeometry(0.75, 0.05, 4, 12, Math.PI); ring.rotateX(Math.PI / 2); ring.translate(0, y, lz);
        parts.add('galv', ring, M);
      }
    };
    if (p.ypair && p.type === 'twin') {
      // Twin-leg compression pylon: a tapered box leg under each head, flared into the platform,
      // on a lattice anchor frame; the platform + gantries are drawn once per train (twinHead)
      const top = H + 0.2, w0 = 1.25, w1 = 1.75;
      const leg = new THREE.CylinderGeometry(w1, w0, top - 1.2, 4); leg.rotateY(Math.PI / 4); leg.translate(0, 1.2 + (top - 1.2) / 2, 0);
      parts.add('galv', leg, F);
      const cap = new THREE.CylinderGeometry(2.9, w1, 2.4, 4); cap.rotateY(Math.PI / 4); cap.translate(0, top - 1.2, 0); parts.add('galv', cap, F);   // flare into the head
      for (const sx of [-1, 1]) this._box(parts, 'dark', F, 0.06, top - 3, 0.06, sx * 0.62, top / 2, 1.0);                       // panel seams
      this._box(parts, 'dark', F, 0.06, top - 3, 0.06, 0, top / 2, 1.24);
      // anchor frame at the base
      this._box(parts, 'concrete', F, 5.5, 1.2, 5.5, 0, -0.2, 0);
      this._box(parts, 'rust', F, 3.6, 0.5, 3.6, 0, 0.6, 0);
      for (const [gx, gz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        this._strut(parts, 'rust', F, [gx * 1.7, 0.8, gz * 1.7], [gx * 0.9, 3.4, gz * 0.9], 0.25);
        this._strut(parts, 'rust', F, [gx * 1.7 + gz * 1.2, 0.8, gz * 1.7 + gx * 1.2], [gx * 0.9, 2.6, gz * 0.9], 0.18);
        this._strut(parts, 'rust', F, [gx * 1.7 - gz * 1.2, 0.8, gz * 1.7 - gx * 1.2], [gx * 0.9, 2.6, gz * 0.9], 0.18);
      }
      if (p.ypair === 'a') this._twinHead(parts, FL, l, t, reach);
    } else if (p.ypair) {
      // Y-pylon: one foundation and trunk, two standard pylon branches splayed along the line, each with a head
      // the fork height comes from the pylon's own height, so both branches start from the same fork
      const yh = p.yH || H, hf = Math.max(3, Math.min(yh * 0.3, 14)), rb = 1.5 + yh * 0.018;
      // a leaning Y: the trunk is rotated about the foot, so the fork sits off the foot along the line
      const fz = p.yShift && p.yH ? (p.yShift * hf) / p.yH : 0, Lt = Math.hypot(hf, fz);
      const FT = F.clone().multiply(new THREE.Matrix4().makeRotationX(Math.atan2(fz, hf)));
      if (p.ypair === 'a') {
        this._box(parts, 'concrete', F, 7, 1.8, 7, 0, 0.1, 0);
        this._cyl(parts, 'galv', F, rb + 0.6, rb + 0.6, 0.5, 0, 0.9, 0, 20);
        this._cyl(parts, 'galv', FT, rb * 0.92, rb, Lt - 1.4, 0, 1.4, 0, 20);                   // trunk
        this._box(parts, 'galv', FT, rb * 2.2, 1.4, rb * 2.4, 0, Lt, 0);                         // fork node
        ladder(FT, rb, 1.5, Lt - 0.6);
      }
      // each branch is a straight pylon rotated about the fork towards its head
      const hb = Math.max(1, H - hf), db = dz - fz, Lb = Math.hypot(hb, db);
      const FB = F.clone().multiply(new THREE.Matrix4().makeTranslation(0, hf, fz)).multiply(new THREE.Matrix4().makeRotationX(Math.atan2(db, hb)));
      this._cyl(parts, 'galv', FB, 0.85, 1.1, Lb - 0.4, 0, 0, 0, 18);                            // branch tube
      // the head on each branch stays level: both heads carry the same rope through one sheave train
      head(F.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, dz)), H);
    } else if (style === 'mgd') {
      const rb = 1.25 + H * 0.018, rt = 0.85;
      this._box(parts, 'concrete', F, 5, 1.8, 5, 0, 0.1, 0);                                    // foundation
      this._cyl(parts, 'galv', F, rb + 0.5, rb + 0.5, 0.5, 0, 0.9, 0, 20);                     // flange plate
      this._cyl(parts, 'galv', FS, rt, rb, HL - 0.6, 0, 1.4, 0, 20);                            // conical tube
      head(FS, HL);
      ladder(FS, rb, 1.5, HL - 1.5);
    } else if ((style === 'lattice' && !T.saddles) || style === 'portal' || style === 'tube') {
      this._box(parts, 'concrete', F, 5, 1.8, 5, 0, 0.1, 0);
    }
    if ((p.ypair && p.type !== 'twin') || style === 'mgd' || (style === 'lattice' && !surface)) {
      // brackets from the crossarm ends out to the walkways beside the sheave trains
      for (const sgn of surface ? [-1] : [1, -1]) {
        const w = t.walk;
        if (!w) continue;
        const wy = w.yAt(p.s), wx = sgn * w.x;
        this._strut(parts, 'galv', FL, [wx, armAbs - 0.4, p.s], [wx, wy - 0.1, p.s], 0.3);            // hanger from the crossarm
        this._strut(parts, 'galv', FL, [sgn * (w.x * 0.45), armAbs - 0.4, p.s], [wx, wy - 0.1, p.s], 0.2);
      }
    }
    if (p.ypair || style === 'mgd') {
      // drawn above
    } else if (style === 'lattice' && T.saddles) {
      this._lattice3s(parts, T, F, FS, HL, ropeTop - H);
    } else if (style === 'lattice') {
      const wb = Math.max(2.4, HL * 0.13), wt = 1.3, segs = Math.max(2, Math.ceil(HL / 7)), r0 = 0.45;
      const corner = (u, sx, sz) => { const w = wb + (wt - wb) * u; return [sx * w, HL * u, sz * w]; };
      const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (const [sx, sz] of C) this._strut(parts, 'steel', FS, corner(0, sx, sz), corner(1, sx, sz), r0 * 1.5);
      for (let k = 0; k < segs; k++) {
        const u0 = k / segs, u1 = (k + 1) / segs;
        for (let c = 0; c < 4; c++) {
          const [ax, az] = C[c], [bx, bz] = C[(c + 1) % 4];
          this._strut(parts, 'steel', FS, corner(u1, ax, az), corner(u1, bx, bz), r0);
          this._strut(parts, 'steel', FS, corner(u0, ax, az), corner(u1, bx, bz), r0 * 0.8);
          this._strut(parts, 'steel', FS, corner(u0, bx, bz), corner(u1, ax, az), r0 * 0.8);
        }
      }
      if (surface) this._box(parts, 'steel', FS, reach * 2, 1.2, 1.6, -reach / 2, HL, 0);
      else head(FS, HL, 'steel');
    } else if (style === 'portal') {
      const lx = reach, splay = HL * 0.07;
      for (const sx of [-1, 1]) {
        this._strut(parts, 'steel', FS, [sx * (lx + splay), 0, 0], [sx * lx, HL, 0], 1.6);
        this._box(parts, 'concrete', F, 3.5, 1.4, 3.5, sx * (lx + splay), 0.2, 0);
      }
      this._box(parts, 'steel', FS, lx * 2 + 2.4, 1.8, 2, 0, HL, 0);
      this._box(parts, 'steel', FS, lx * 2, 0.8, 0.9, 0, HL * 0.55, 0);
    } else {
      const rb = surface ? 0.8 : 1.4 + HL * 0.02, rt = surface ? 0.55 : 1.0;
      this._cyl(parts, 'steel', FS, rt, rb, HL + 0.4, 0, -0.4, 0, 12);
      if (surface) this._box(parts, 'steel', FS, reach + 0.5, 0.5, 0.5, -reach / 2, HL, 0);
      else head(FS, HL, 'steel');                                   // same crossarm + gantry as the lattice pylon
      if (!surface) for (let y = 2; y < HL - 2; y += 1.4) this._box(parts, 'dark', FS, 0.6, 0.08, 0.08, 0, y, rb + 0.25);
    }
  },

  // 3S lattice pylon, after a photo of one: four splayed legs of galvanised tube tapering to a neck,
  // X-braced with rings; a deep box-truss head across both tracks under the saddles; and on the inner
  // side of each track a lattice frame up past the ropes, with a railed platform, the two joined over
  // the middle by a beam braced down to the head. Nothing stands over the ropes: the carriages roll there.
  // FS: pylon frame (y = 0 at the foot, HL = top of the head), ropeUp: rope height above the head top.
  _lattice3s(parts, T, F, FS, HL, ropeUp) {
    const K = 'galv', half = Math.max(...T.ropes.map(Math.abs));
    const hd = 3.0, yN = HL - hd;                                          // head depth, neck height
    const bx = Math.max(4.5, HL * 0.2), bz = Math.max(3.8, HL * 0.15), nx = 2.4, nz = 2.2;
    const legAt = (u, sx, sz) => [sx * (bx + (nx - bx) * u), yN * u, sz * (bz + (nz - bz) * u)];
    const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (const [sx, sz] of C) {
      this._tube(parts, K, FS, legAt(0, sx, sz), legAt(1, sx, sz), 0.42);
      this._box(parts, 'concrete', F, 2.6, 1.6, 2.6, sx * bx, 0.2, sz * bz);   // footings
    }
    const segs = Math.max(2, Math.round(yN / 8));
    for (let k = 0; k < segs; k++) {
      const u0 = k / segs, u1 = (k + 1) / segs;
      for (let c = 0; c < 4; c++) {
        const [ax, az] = C[c], [cx, cz] = C[(c + 1) % 4];
        this._tube(parts, K, FS, legAt(u1, ax, az), legAt(u1, cx, cz), 0.2);           // ring
        this._tube(parts, K, FS, legAt(u0, ax, az), legAt(u1, cx, cz), 0.16);          // X bracing
        this._tube(parts, K, FS, legAt(u0, cx, cz), legAt(u1, ax, az), 0.16);
      }
    }
    // head: a box truss from one track's outer girder to the other's
    // ends just past the outer saddle posts: the cabins' hangers swing round outside them
    const X = T.gauge + half + 0.35, zd = 2.8, yB = yN, yT = HL;
    for (const y of [yB, yT]) for (const z of [-zd, zd]) this._tube(parts, K, FS, [-X, y, z], [X, y, z], 0.3);   // chords
    const nb = Math.max(4, Math.round((2 * X) / 2.6));
    for (let k = 0; k <= nb; k++) {
      const x = -X + (2 * X * k) / nb, x2 = -X + (2 * X * (k + 1)) / nb;
      for (const z of [-zd, zd]) {
        this._tube(parts, K, FS, [x, yB, z], [x, yT, z], 0.17);                          // verticals
        if (k < nb) this._tube(parts, K, FS, [x, k % 2 ? yB : yT, z], [x2, k % 2 ? yT : yB, z], 0.15);   // diagonals
      }
      for (const y of [yB, yT]) this._tube(parts, K, FS, [x, y, -zd], [x, y, zd], 0.14);    // cross members
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1])                                    // knee braces from the neck out under the head
      this._tube(parts, K, FS, [sx * nx, yN - 4, sz * nz], [sx * X * 0.55, yB, sz * zd], 0.22);
    // lifting gantry over the ropes (like the gondola heads, but in lattice as on the photos): a lattice
    // post on the inner side of each track, up well clear of the carriages, carrying a box-truss top
    // beam that reaches out over both tracks, with knee braces under its overhangs, hoist brackets at
    // its ends right over the ropes, a railed deck on top and the obstruction light.
    const xi = T.gauge - half - 3.6, fw = 0.8, fz = zd * 0.75, yF = yT + ropeUp + 6.5, bd = 1.6, yb = yF - bd;
    const XT = T.gauge + half + 0.9;                                                       // top beam reaches past the outer ropes
    for (const sx of [-1, 1]) {
      const cx = sx * xi;
      for (const ox of [-fw, fw]) for (const oz of [-fz, fz]) this._tube(parts, K, FS, [cx + ox, yT, oz], [cx + ox, yb, oz], 0.2);
      for (let y = yT, k = 0; y < yb - 0.5; y += 2.4, k++) {
        const y2 = Math.min(yb, y + 2.4);
        for (const oz of [-fz, fz]) this._tube(parts, K, FS, [cx - fw, k % 2 ? y : y2, oz], [cx + fw, k % 2 ? y2 : y, oz], 0.1);
        for (const ox of [-fw, fw]) this._tube(parts, K, FS, [cx + ox, y2, -fz], [cx + ox, y2, fz], 0.1);
        for (const ox of [-fw, fw]) this._tube(parts, K, FS, [cx + ox, k % 2 ? y : y2, -fz], [cx + ox, k % 2 ? y2 : y, fz], 0.08);
      }
      this._tube(parts, K, FS, [cx - sx * fw, yb - 1, 0], [sx * 1.2, yT, 0], 0.18);           // brace down to the head centre
      // knee braces from the post out under the overhang (above the carriages, which roll on the ropes)
      for (const oz of [-fz, fz]) {
        this._tube(parts, K, FS, [cx + sx * fw, yb - 3.2, oz], [sx * (T.gauge + half), yb, oz], 0.16);
        this._tube(parts, K, FS, [cx + sx * fw, yb - 3.2, oz], [sx * (T.gauge - half), yb, oz], 0.1);
      }
      // hoist brackets at the beam ends, right over the two track ropes of this track
      for (const ox of [-half, half]) this._box(parts, 'steel', FS, 0.5, 0.8, fz * 2 + 0.4, sx * (T.gauge + ox), yb - 0.45, 0);
    }
    // box-truss top beam: four chords, verticals and alternating diagonals on both faces and on top
    for (const y of [yb, yF]) for (const oz of [-fz, fz]) this._tube(parts, K, FS, [-XT, y, oz], [XT, y, oz], 0.24);
    const nt = Math.max(6, Math.round((2 * XT) / 2.4));
    for (let k = 0; k <= nt; k++) {
      const x = -XT + (2 * XT * k) / nt, x2 = -XT + (2 * XT * (k + 1)) / nt;
      for (const oz of [-fz, fz]) {
        this._tube(parts, K, FS, [x, yb, oz], [x, yF, oz], 0.12);
        if (k < nt) this._tube(parts, K, FS, [x, k % 2 ? yb : yF, oz], [x2, k % 2 ? yF : yb, oz], 0.1);
      }
      for (const y of [yb, yF]) this._tube(parts, K, FS, [x, y, -fz], [x, y, fz], 0.1);
      if (k < nt) this._tube(parts, K, FS, [x, yb, k % 2 ? -fz : fz], [x2, yb, k % 2 ? fz : -fz], 0.08);
    }
    // deck on top with railings along both sides and across the ends
    this._box(parts, 'grate', FS, XT * 2, 0.15, fz * 2 + 0.6, 0, yF + 0.1, 0);
    const rz = fz + 0.3;
    for (const oz of [-rz, rz]) {
      this._tube(parts, K, FS, [-XT, yF + 1.2, oz], [XT, yF + 1.2, oz], 0.05);
      for (let k = 0; k <= nt; k += 2) { const x = -XT + (2 * XT * k) / nt; this._tube(parts, K, FS, [x, yF, oz], [x, yF + 1.2, oz], 0.05); }
    }
    for (const sx of [-1, 1]) this._tube(parts, K, FS, [sx * XT, yF + 1.2, -rz], [sx * XT, yF + 1.2, rz], 0.05);
    this._tube(parts, K, FS, [0, yF, 0], [0, yF + 4, 0], 0.08);                                    // antenna mast
    this._box(parts, 'accent', FS, 0.6, 0.45, 0.6, 0, yF + 0.5, 0);                               // obstruction light
  },

  station(parts, l, node, s, drive, rotY, P) {
    const T = l.T, a = l.a, x = a.x + P.ux * s, z = a.z + P.uz * s;
    const F = new THREE.Matrix4().makeRotationY(rotY).premultiply(new THREE.Matrix4().makeTranslation(x, node.y, z));
    const o = drive ? -1 : 1, H = T.towerH, g = T.gauge, ext = Math.max(0, ...(T.ropes || [0]).map(Math.abs));
    const accent = 'accent';
    if (T.kind === 'surface') {
      this._cyl(parts, 'steel', F, 0.7, 0.9, H + 1, 0, -1, o * 2, 10);
      this._bullwheel(parts, F, g, 0, H, o * 2 + 0);
      if (drive) {
        this._box(parts, 'wall', F, 6, 4, 5, -g - 9, 2, -4); this._box(parts, accent, F, 6.6, 0.6, 5.6, -g - 9, 4.3, -4);
        this._box(parts, 'roof', F, 7, 0.5, 6.4, -g - 9, 4.9, -4, 0, 0);
      }
      return;
    }
    if (T.kind === 'tram') return this.tramStation(parts, F, T, o, drive);
    if (T.station3d === 'fixed') {
      // fixed-grip: open bullwheel on a column, small canopy, wooden loading deck, operator hut
      this._box(parts, 'concrete', F, g * 2 + 10, 1.2, 16, 0, 0, o * 2);
      this._cyl(parts, 'steel', F, 1.4, 1.8, H + 1, 0, -0.5, o * 3, 12);
      this._bullwheel(parts, F, g, 0, H, o * 3);
      this._box(parts, 'roof', F, g * 2 + 7, 0.6, 12, 0, H + 3.2, o * 3, 0.0);
      this._box(parts, accent, F, g * 2 + 7.4, 0.9, 12.4, 0, H + 2.6, o * 3);
      for (const sx of [-1, 1]) this._strut(parts, 'steel', F, [sx * (g + 2.5), 0, o * 3], [sx * (g + 2.5), H + 3, o * 3], 0.6);
      this._box(parts, 'wood', F, g * 2 + 5, 0.8, 12, 0, 0.6, -o * 7);
      this._box(parts, 'wall', F, 5, 3.6, 5, g + 9, 1.8, -o * 4);
      this._box(parts, accent, F, 5.4, 0.5, 5.4, g + 9, 3.7, -o * 4);
      this._box(parts, 'roof', F, 3.4, 0.4, 6, g + 7.8, 4.6, -o * 4, 0, 0.45);
      this._box(parts, 'roof', F, 3.4, 0.4, 6, g + 10.2, 4.6, -o * 4, 0, -0.45);
      if (drive) this._box(parts, 'dark', F, 3, 2.2, 4, 0, H + 1.6, o * 3);   // motor
      return;
    }
    // detachable / gondola terminal: concrete plinth, columns, glass walls, gabled roof, bullwheel inside
    const big = T.model === 'cabin3s' || T.model === 'funitel';
    const W = (g + ext) * 2 + 12, L = big ? 62 : T.enclosed ? 50 : 42, zc = o * (L / 2 - 8);
    const style = this.stationStyle(l);
    if (style !== 'classic') {
      this._shell(parts, F, T, style, o, -8, L - 8, { front: true, back: false });
      this._bullwheel(parts, F, g, 0, H, o * (L - 12));
      for (const sx of [-1, 1]) this._box(parts, 'dark', F, 0.5, 0.5, L - 14, sx * g, H + 0.6, zc - o * 2);
      return;
    }
    this._hall(parts, F, T, W, L, zc, o);
    this._bullwheel(parts, F, g, 0, H, o * (L - 12));
    for (const sx of [-1, 1]) this._box(parts, 'dark', F, 0.5, 0.5, L - 14, sx * g, H + 0.6, zc - o * 2);   // station rail
    this._box(parts, 'wood', F, W - 4, 0.5, L * 0.45, 0, 1.45, zc - o * L * 0.18);                         // boarding platform
    if (drive) {
      this._box(parts, 'wall', F, W * 0.7, 8, 12, 0, 4, zc + o * (L / 2 + 6));                                 // machine house
      this._box(parts, 'accent', F, W * 0.7 + 0.6, 1, 12.6, 0, 8.2, zc + o * (L / 2 + 6));
      this._box(parts, 'roof', F, W * 0.7 + 1, 0.6, 13, 0, 8.9, zc + o * (L / 2 + 6));
      this._box(parts, 'dark', F, 2.4, 2.4, 0.3, W * 0.2, 3.5, zc + o * (L / 2 + 12.2));                       // window
    }
  },

  // Height of the boarding deck: where the carriers' floor hangs at the station (they are drawn
  // CS times real size, so it is well above the ground; the deck is raised to meet them).
  deckY(T) {
    this._deck = this._deck || {};
    if (this._deck[T.model] == null) {
      const g = this.carrierGeometry(T.model); g.computeBoundingBox();
      this._deck[T.model] = Math.max(1.5, T.towerH + g.boundingBox.min.y - 0.25); g.dispose();
    }
    return this._deck[T.model];
  },
  // a straight prism: quad profile [[w, y] x 4] (w = outward distance) extruded across x0..x1
  _prism(parts, key, F, o, x0, x1, prof) {
    const sh = new THREE.Shape(prof.map(([w, y]) => new THREE.Vector2(-o * w, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false });
    g.rotateY(Math.PI / 2); g.translate(x0, 0, 0);
    parts.add(key, g, F);
  },

  // Modern station shells around the rail between outward distances wA..wB (z = o * w).
  // opts.front / opts.back: that end is where the line enters (left open).
  _shell(parts, F, T, style, o, wA, wB, opts = {}) {
    const H = T.towerH, g = T.gauge, ext = Math.max(0, ...(T.ropes || [0]).map(Math.abs));
    if (!opts.back) wB = Math.max(wB, wB - 4 + g + 2);            // the terminal's bullwheel stays inside
    const hw = g + ext + 7 + (opts.extraW || 0), fy = this.deckY(T), len = wB - wA;
    const box = (key, x0, x1, y0, y1, w0, w1, rx = 0) =>
      this._box(parts, key, F, Math.abs(x1 - x0), y1 - y0, Math.abs(w1 - w0), (x0 + x1) / 2, (y0 + y1) / 2, o * (w0 + w1) / 2, rx);
    // how far the ground drops under the building, for foundations and piers
    let low = -3;
    const pv = new THREE.Vector3(), node = new THREE.Vector3().setFromMatrixPosition(F);
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      pv.set(-hw + (2 * hw * i) / 4, 0, o * (wA + (len * j) / 4)).applyMatrix4(F);
      low = Math.min(low, Terrain.height(pv.x, pv.z) - node.y - 2);
    }
    // boarding deck at the carriers' floor: around the cabins' path, with railings
    const xi = g - 3.6, xo = g + 3.6, d0 = wA + 4, d1 = wB - 6;
    box('concrete', -xi, xi, fy - 0.8, fy, d0, d1);
    for (const sx of [-1, 1]) {
      box('concrete', sx * xo, sx * hw, fy - 0.8, fy, d0, d1);
      box('edge', sx * xo, sx * (xo + 0.5), fy, fy + 0.06, d0, d1);
      box('edge', sx * (xi - 0.5), sx * xi, fy, fy + 0.06, d0, d1);
      for (let w = d0; w <= d1; w += 4) this._strut(parts, 'galv', F, [sx * (hw - 0.3), fy, o * w], [sx * (hw - 0.3), fy + 1.1, o * w], 0.1);
      this._strut(parts, 'galv', F, [sx * (hw - 0.3), fy + 1.1, o * d0], [sx * (hw - 0.3), fy + 1.1, o * d1], 0.12);
    }

    if (style === 'hood') {
      // piers under the deck, a stair up to it, the main girder on central columns
      for (const sx of [-1, 1]) for (const w of [d0 + 2, (d0 + d1) / 2, d1 - 2]) box('concrete', sx * (hw - 2.5), sx * (hw - 0.8), low, fy - 0.8, w - 0.9, w + 0.9);
      const steps = Math.max(1, Math.ceil(fy / 0.55)), rise = fy / steps, sx = -1;
      if (opts.joint !== 'front') for (let k = 0; k < steps; k++) box('concrete', sx * (hw + 0.2), sx * (hw + 3.4), low, rise * (k + 1), d0 + 0.9 * k, d0 + 0.9 * (k + 1));
      if (opts.joint !== 'front') this._strut(parts, 'galv', F, [sx * (hw + 3.3), 1.1, o * d0], [sx * (hw + 3.3), fy + 1.1, o * (d0 + 0.9 * steps)], 0.12);
      const gy0 = H + 1.4, gy1 = H + 4.6;
      box('frame', -(g - 3), g - 3, gy0, gy1, wA + 3, wB - 4);
      for (const w of opts.back ? [wA + 8, (wA + wB) / 2, wB - 8] : [wA + 8, wB - 16]) box('frame', -1.3, 1.3, low, gy0, w - 1.3, w + 1.3);
      box('frame', -(g - 1), g - 1, gy0 - 0.4, gy1 + 0.6, wB - 16, wB - 4);          // bullwheel housing
      // the hood: half a stretched capsule over the rail, glass with a red outline and roof rib
      const base = H + 2.2, hh = 6.5 + (T.enclosed ? 0.5 : 0), hwH = g + ext + 4.8 + (opts.extraW || 0) * 0.6;
      // at an angle station the two wings' hoods are cut square where they meet (a mitred joint)
      const mit = opts.bend != null ? hwH * Math.tan(opts.bend / 2) + 1 : 0;
      const hA = opts.joint === 'front' ? -mit : wA - 1, hB = opts.joint === 'back' ? mit : wB + 1;
      const nA = opts.joint === 'front' ? 0 : 8, nB = opts.joint === 'back' ? 0 : 8, bA = hA + nA, bB = hB - nB;
      const sAt = (w) => (w < bA ? Math.sqrt(Math.max(0, 1 - ((bA - w) / nA) ** 2)) : w > bB ? Math.sqrt(Math.max(0, 1 - ((w - bB) / nB) ** 2)) : 1);
      const NW = 48, NV = 12, P = [];
      const vert = (w, v) => { const s = sAt(w), k = Math.pow(s, 0.7); return [hwH * s * Math.cos(v), base + hh * k * Math.sin(v), o * w]; };
      for (let a = 0; a < NW; a++) for (let b = 0; b < NV; b++) {
        const w0 = hA + ((hB - hA) * a) / NW, w1 = hA + ((hB - hA) * (a + 1)) / NW, v0 = (Math.PI * b) / NV, v1 = (Math.PI * (b + 1)) / NV;
        const p00 = vert(w0, v0), p01 = vert(w0, v1), p10 = vert(w1, v0), p11 = vert(w1, v1);
        P.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      }
      const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); hg.computeVertexNormals();
      parts.add('hood', hg, F);
      const outline = [], rib = [];
      for (let a = 0; a <= NW; a++) { const w = hA + ((hB - hA) * a) / NW; outline.push(new THREE.Vector3(...vert(w, 0))); rib.push(new THREE.Vector3(...vert(w, Math.PI / 2))); }
      for (let a = NW; a >= 0; a--) { const w = hA + ((hB - hA) * a) / NW; outline.push(new THREE.Vector3(...vert(w, Math.PI))); }
      parts.add('accent', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outline, true), 160, 0.5, 6, true), F);
      parts.add('accent', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rib), 80, 0.35, 6, false), F);
      // name band under the hood's edge, and hangers from the girder up to the hood
      for (const sx of [-1, 1]) {
        box('accent', sx * (hwH - 0.6), sx * (hwH - 0.1), base - 2.2, base - 0.2, bA + 2, bB - 2);
        box('dark', sx * (hwH - 0.7), sx * (hwH - 0.5), base - 1.8, base - 0.6, bA + 3, bA + 16);
        for (const w of [bA + 4, (bA + bB) / 2, bB - 4]) this._strut(parts, 'steel', F, [sx * (g - 3), gy1, o * w], [sx * (hwH - 0.8), base - 0.2, o * w], 0.45);
      }
      // operator's booth on the deck
      if (opts.joint === 'front') return;
      box('glassy', hw - 6, hw - 1.5, fy, fy + 3.2, d0 + 2, d0 + 6.5);
      box('roof', hw - 6.3, hw - 1.2, fy + 3.2, fy + 3.6, d0 + 1.7, d0 + 6.8);
      return;
    }

    // 'building': stone ground floor up to the deck, the clad hall above with leaning ends and a
    // window band, a dark flat roof. The line's end(s) stay open.
    const top = H + 7, lean = 5;
    const bw0 = opts.joint === 'front' ? wA : wA + (opts.front ? 4 : 1), bw1 = opts.joint === 'back' ? wB : wB - (opts.back ? 4 : 3);
    const leanF = opts.joint === 'front' ? 0 : lean + 2, leanB = opts.joint === 'back' ? 0 : (opts.back ? lean : 0) + 2;
    box('stone', -(hw - 1), hw - 1, low, fy - 0.8, bw0 + 1, bw1 - 1);
    for (const sx of [-1, 1]) {
      for (let w = bw0 + 4; w < bw1 - 4; w += 5) box('glassy', sx * (hw - 1.1), sx * (hw - 0.8), 1.2, Math.max(2, fy - 3), w, w + 2.6);
      // clad side walls: trapezoids, the top edge longer than the bottom (the ends lean outward)
      this._prism(parts, 'accent', F, o, sx > 0 ? hw - 0.6 : -hw, sx > 0 ? hw : -hw + 0.6,
        [[bw0, fy - 1], [bw1, fy - 1], [bw1 + leanB, top], [bw0 - leanF, top]]);
      const g0 = fy + 1.8, g1 = Math.min(top - 2.2, fy + 1.8 + (top - fy) * 0.5);
      box('glass', sx * hw, sx * (hw + 0.35), g0, g1, bw0 + 1, bw1 - 1);
      for (let w = bw0 + 1; w <= bw1 - 1; w += 3.2) box('dark', sx * hw, sx * (hw + 0.45), g0, g1, w - 0.15, w + 0.15);
      box('dark', sx * hw, sx * (hw + 0.45), g0 - 0.25, g0 + 0.05, bw0 + 1, bw1 - 1);
      box('dark', sx * hw, sx * (hw + 0.45), g1 - 0.05, g1 + 0.25, bw0 + 1, bw1 - 1);
    }
    box('roof', -hw - 0.6, hw + 0.6, top, top + 0.9, bw0 - leanF - 0.6, bw1 + leanB + 0.6);
    box('accent', -hw - 0.7, hw + 0.7, top - 0.5, top, bw0 - leanF - 0.7, bw1 + leanB + 0.7);
    if (!opts.back) this._prism(parts, 'accent', F, o, -hw, hw, [[bw1, fy - 1], [bw1 + 0.7, fy - 1], [bw1 + 2.7, top], [bw1 + 2, top]]);
    // entrance: a canopy over a door in the stone floor
    if (opts.joint === 'back') return;
    box('dark', hw - 0.9, hw - 0.5, 0, 3.2, bw1 - 9, bw1 - 5);
    box('roof', hw - 0.5, hw + 3, 3.4, 3.8, bw1 - 10, bw1 - 4);
  },

  // station hall: plinth, columns, glass side walls (+ an end wall at `endWall` = ±1), fascia, gabled roof
  // ---- aerial tramway stations, after real jig-back stations ----
  // A concrete podium holds the ticket hall; the cabin hall sits on top, with an island platform
  // between the two tracks at cabin-floor height (the cabins dock in pits beside it). The track ropes
  // run in over saddles hung from the roof trusses at the open portal, then down to tension weights
  // in shafts (valley) or around anchor bollards (mountain). The haul rope turns on a big horizontal
  // wheel: the tensioned return wheel in the valley, the drive wheel with motor and gearbox on top.
  // Local frame: z = o * w, where w is the distance outward from the line (w < 0 is towards the line).
  tramFloor(T) { return T.towerH - 6.7 * CS; },        // cabin floor above the station node
  _vwheel(parts, key, F, R, x, y, z) {                  // vertical sheave turning along the line
    const t = new THREE.TorusGeometry(R, 0.35, 6, 28); t.rotateY(Math.PI / 2); t.translate(x, y, z); parts.add(key, t, F);
    this._box(parts, 'steel', F, 0.9, 0.9, 0.9, x, y, z);
  },
  tramStation(parts, F, T, o, valley) {
    const H = T.towerH, g = T.gauge, fy = this.tramFloor(T), hw = g + 14, cw = 2.1 * CS + 0.4;
    const box = (key, x0, x1, y0, y1, w0, w1) =>
      this._box(parts, key, F, Math.abs(x1 - x0), y1 - y0, Math.abs(w1 - w0), (x0 + x1) / 2, (y0 + y1) / 2, o * (w0 + w1) / 2);
    const W0 = -14, W1 = 43, BAY = 14, R0 = -17, R1 = W1 + 1.5;
    const roofAt = (w) => H + 9 - 6 * (w - R0) / (R1 - R0);   // roof rises towards the line, like the rope
    // podium: foundation + ground floor, then the upper floor behind the cabin bays. On a slope the
    // foundation becomes a concrete substructure reaching down to the lowest ground under the building.
    let low = -8;
    const pv = new THREE.Vector3(), node = new THREE.Vector3().setFromMatrixPosition(F);
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      pv.set(-hw + (2 * hw * i) / 4, 0, o * (W0 + ((W1 - W0) * j) / 4)).applyMatrix4(F);
      low = Math.min(low, Terrain.height(pv.x, pv.z) - node.y - 3);
    }
    box('concrete', -hw, hw, low, fy - 4, W0, W1);
    box('concrete', -hw, hw, fy - 4, fy, BAY, W1);
    // island platform between the tracks and the side platforms, yellow edges along the cabin pits
    const xi = g - cw, xo = g + cw;
    box('concrete', -xi, xi, fy - 4, fy, W0, BAY);
    for (const sx of [-1, 1]) {
      box('concrete', sx * xo, sx * hw, fy - 4, fy, W0, BAY);
      box('edge', sx * (xi - 0.6), sx * xi, fy, fy + 0.08, W0, BAY);
      box('edge', sx * xo, sx * (xo + 0.6), fy, fy + 0.08, W0, BAY);
      box('glass', sx * hw, sx * (hw + 0.4), 1.5, fy - 6, 0, W1 - 3);           // ticket hall windows
    }
    box('glass', -hw + 4, hw - 4, 1.5, fy - 6, W1, W1 + 0.4);
    box('dark', -5, 5, 0, 5, W1, W1 + 0.5);                                   // entrance doors
    box('accent', -9, 9, fy - 5.6, fy - 4.9, W1, W1 + 6);                     // entrance canopy
    box('glassy', -xi + 0.4, xi - 0.4, fy, fy + 3.4, 8, 13);                  // operator's cabin on the island
    box('roof', -xi + 0.2, xi - 0.2, fy + 3.4, fy + 3.8, 7.8, 13.2);
    // cabin hall: glass curtain walls with mullions, concrete back wall, open portal towards the line
    for (const sx of [-1, 1]) {
      for (let w = -5; w < W1; w += 6) {
        const w2 = Math.min(W1, w + 6);
        box('glass', sx * (hw - 0.4), sx * hw, fy, roofAt(w2) - 0.4, w, w2);
        box('steel', sx * (hw - 0.8), sx * (hw + 0.2), fy, roofAt(w), w - 0.35, w + 0.35);
      }
      box('concrete', sx * (hw - 2.2), sx * hw, -8, roofAt(R0 + 1), R0 + 0.5, W0 + 2);   // portal pillars
    }
    box('concrete', -hw, hw, fy, fy + 2, W1 - 1.2, W1);                    // back wall: glazed above a parapet
    box('glass', -hw + 1, hw - 1, fy + 2, roofAt(W1) - 0.4, W1 - 0.8, W1 - 0.4);
    for (let x = -hw + 6; x < hw - 2; x += 6) box('steel', x - 0.35, x + 0.35, fy + 2, roofAt(W1), W1 - 1, W1 - 0.2);
    const len = R1 - R0, rise = roofAt(R0) - roofAt(R1), th = Math.atan2(rise, len), slant = Math.hypot(len, rise);
    const ym = (roofAt(R0) + roofAt(R1)) / 2, zm = o * (R0 + R1) / 2;
    this._box(parts, 'roof', F, 2 * hw + 3, 1.2, slant, 0, ym + 0.6, zm, o * th);
    this._box(parts, 'accent', F, 2 * hw + 3.6, 1.4, slant + 0.6, 0, ym - 0.4, zm, o * th);
    box('concrete', -hw, hw, roofAt(R0) - 4.2, roofAt(R0) - 0.4, R0 + 0.5, R0 + 3.5);   // portal lintel
    box('accent', -hw * 0.55, hw * 0.55, roofAt(R0) - 3.6, roofAt(R0) - 1.2, R0 + 0.1, R0 + 0.5);   // name board
    // track ropes: in over the saddles, then down to their tension weights or anchors
    const trusses = [-12, -4, 4];
    for (const w of trusses) box('steel', -hw, hw, roofAt(w) - 2.4, roofAt(w) - 1.1, w - 0.5, w + 0.5);
    const ends = [];
    for (const sx of [-1, 1]) for (const ro of T.ropes || [0]) {
      const x = sx * g + ro, out = x + Math.sign(ro || sx) * 1.1;
      const p = (w, y) => [x, y, o * w];
      this._strut(parts, 'dark', F, p(-11, H - 0.9), p(0, H - 0.9), 1.2);     // saddle shoe under the rope
      this._strut(parts, 'dark', F, p(0, H - 0.9), p(7, H - 2.3), 1.2);
      this._strut(parts, 'dark', F, p(7, H - 2.3), p(12, H - 4.5), 1.2);
      for (const w of trusses) this._strut(parts, 'steel', F, [out, roofAt(w) - 2.4, o * w], [out, H - 0.9, o * w], 0.45);
      this._strut(parts, 'dark', F, p(0, H), p(12, H - 4.5), 0.35);            // the rope itself
      ends.push({ x, sx, ro });
    }
    if (valley) {
      // haul rope return wheel on its tension carriage
      this._bullwheel(parts, F, g, 0, H - 2, o * 20);
      box('steel', -1.6, 1.6, fy, H - 2.7, 18.4, 21.6);
      box('dark', -4.5, 4.5, H - 3.6, H - 2.9, 13, 27);
      // tension-weight shafts, one per track, rising through the roof
      for (const sx of [-1, 1]) {
        const x = sx * g, wT = 32, top = roofAt(W1) + 9;
        // open steel frame inside the hall, a concrete shaft through the roof with the sheave house on top
        for (const cx of [-3.5, 3.5]) for (const cz of [wT - 4, wT + 7]) this._strut(parts, 'galv', F, [x + cx, fy, o * cz], [x + cx, roofAt(wT), o * cz], 0.8);
        box('concrete', x - 4.5, x + 4.5, roofAt(wT + 7) - 1, top, wT - 4.5, wT + 7.5);
        box('roof', x - 5, x + 5, top, top + 0.8, wT - 5, wT + 8);
        box('steel', x - 1.6, x + 1.6, top + 0.8, top + 7.4, wT - 3.8, wT + 3.8);   // sheave housing
        box('roof', x - 2, x + 2, top + 7.4, top + 8, wT - 4.2, wT + 4.2);
        this._vwheel(parts, 'rubber', F, 3, x + 1.8, top + 3.6, o * wT);
        const wy = H * 0.45;
        box('concrete', x - 3, x + 3, wy, wy + 7, wT, wT + 6);                // the counterweight
        for (const e of ends.filter((e) => e.sx === sx)) {
          this._strut(parts, 'dark', F, [e.x, H - 4.5, o * 12], [e.x, top + 6.6, o * wT], 0.8);
          this._strut(parts, 'dark', F, [e.x, top + 3.6, o * (wT + 3)], [e.x, wy + 7, o * (wT + 3)], 0.8);
        }
      }
    } else {
      // drive: bullwheel on its shaft, motor and gearbox below; track ropes wrap round anchor bollards
      this._bullwheel(parts, F, g, 0, H - 2, o * 20);
      box('steel', -1.8, 1.8, fy, H - 2.7, 18.2, 21.8);
      box('dark', -5, 5, fy, fy + 4.5, 26, 34);
      box('accent', -5.3, 5.3, fy + 4.5, fy + 5.1, 26, 34);
      box('dark', -1, 1, fy + 4.5, H - 2.7, 20.5, 22);
      for (const sx of [-1, 1]) {
        const bx = sx * (g + 3), bw = 36;
        this._cyl(parts, 'concrete', F, 3.2, 3.6, 6, bx, fy, o * bw, 16);
        for (let k = 0; k < 3; k++) {
          const t = new THREE.TorusGeometry(3.35, 0.35, 5, 20); t.rotateX(Math.PI / 2); t.translate(bx, fy + 1.6 + k * 1.4, o * bw); parts.add('dark', t, F);
        }
        for (const e of ends.filter((e) => e.sx === sx)) this._strut(parts, 'dark', F, [e.x, H - 4.5, o * 12], [bx + e.ro * 0.8, fy + 5.6, o * (bw - 3)], 0.8);
      }
    }
  },

  _hall(parts, F, T, W, L, zc, endWall = 0) {
    const H = T.towerH, big = T.model === 'cabin3s' || T.model === 'funitel';
    const floor = 1.2, eave = H + 5, pitch = big ? 0.22 : 0.3, half = W / 2 + 1.5;
    this._box(parts, 'concrete', F, W + 2, floor + 1, L + 2, 0, floor / 2 - 0.5, zc);
    for (const sx of [-1, 1]) for (const zz of [-L / 2, 0, L / 2]) this._box(parts, 'steel', F, 1, eave - floor, 1, sx * W / 2, floor + (eave - floor) / 2, zc + zz);
    for (const sx of [-1, 1]) this._box(parts, 'glass', F, 0.3, eave - floor - 2.5, L - 1, sx * W / 2, floor + (eave - floor - 2.5) / 2 + 0.3, zc);
    if (endWall) this._box(parts, 'glass', F, W - 1, eave - floor - 2.5, 0.3, 0, floor + (eave - floor - 2.5) / 2 + 0.3, zc + endWall * L / 2);
    for (const sx of [-1, 1]) this._box(parts, 'accent', F, 0.6, 1.6, L + 2, sx * (W / 2 + 0.2), eave - 0.6, zc);
    for (const sx of [-1, 1]) this._box(parts, 'roof', F, half + 0.5, 0.7, L + 3, sx * half / 2 * Math.cos(pitch), eave + 0.3 + half / 2 * Math.sin(pitch), zc, 0, -sx * pitch);
    this._box(parts, 'accent', F, 1.2, 1, L + 3.4, 0, eave + 0.6 + half * Math.sin(pitch), zc);
  },

  // Ground footprint of a station (an oriented rectangle in x/z) for overlap checks. `bottom`: the
  // drive station, whose building extends behind the line; top stations extend ahead of it.
  stationFootprint(T, at, ux, uz, bottom) {
    const g = T.gauge, ext = Math.max(0, ...(T.ropes || [0]).map(Math.abs)), o = bottom ? -1 : 1;
    let back = 8, ahead = 8, hw = 8;                          // extent behind / ahead (along o) and half width
    if (T.kind === 'belt') { back = 3; ahead = 12; hw = 12; }
    else if (T.kind === 'surface') { back = 6; ahead = 14; hw = g + 15; }
    else if (T.kind === 'tram') { back = 7; ahead = 44; hw = g + 14; }
    else if (T.station3d === 'fixed') { back = 10; ahead = 9; hw = g + 12; }
    else { const L = T.model === 'cabin3s' || T.model === 'funitel' ? 62 : T.enclosed ? 50 : 42; back = 9; ahead = L - 8 + (bottom ? 13 : 0); hw = (g + ext) + 7; }
    const mid = o * (ahead - back) / 2;                       // centre offset along the line
    return { cx: at.x + ux * mid, cz: at.z + uz * mid, ux, uz, hl: (ahead + back) / 2, hw };
  },
  // How far from the node a queue must stand to be outside the station building. bottom: the
  // boarding queue (behind a terminal, or the half width of a mid-station hall); otherwise the
  // half width at the top, for the queue to ride down.
  queueClearance(l, bottom) {
    const T = l.T, { ux, uz } = l.dir;
    const shared = bottom ? this.partnerBelow(l) : this.partnerAbove(l);
    if (shared) return this.junctionReach(T).hw;
    const fp = this.stationFootprint(T, bottom ? l.a : l.b, ux, uz, bottom);
    if (!bottom) return fp.hw;
    const behind = fp.hl - ((fp.cx - l.a.x) * ux + (fp.cz - l.a.z) * uz);
    return Math.max(34, behind + 7);
  },
  lodgeFootprint(n) { return { cx: n.x, cz: n.z, ux: 1, uz: 0, hl: 24, hw: 16 }; },
  // separating-axis test for two oriented rectangles (with a little breathing room)
  overlaps(A, B, gap = 3) {
    for (const [ax, az] of [[A.ux, A.uz], [-A.uz, A.ux], [B.ux, B.uz], [-B.uz, B.ux]]) {
      const r = (F) => Math.abs(F.ux * ax + F.uz * az) * F.hl + Math.abs(-F.uz * ax + F.ux * az) * F.hw;
      const d = Math.abs((B.cx - A.cx) * ax + (B.cz - A.cz) * az);
      if (d > r(A) + r(B) + gap) return false;
    }
    return true;
  },

  // detachable chairs, gondolas and 3S get one hall with both bullwheels; a tramway line is split
  // into two tramways, each with its own pair of shuttling cabins, and skiers change cabins there
  canHaveStations(T) { return (T.kind === 'aerial' && T.station3d !== 'fixed') || T.kind === 'tram'; },

  // the sections of one lift line meeting at a node: lower (ends here) and upper (starts here)
  partnerBelow(l) { return l.line ? Net.lifts.find((x) => x !== l && x.line === l.line && x.b === l.a) : null; },
  partnerAbove(l) { return l.line ? Net.lifts.find((x) => x !== l && x.line === l.line && x.a === l.b) : null; },
  bendAngle(low, up) {
    const d = clamp(low.dir.ux * up.dir.ux + low.dir.uz * up.dir.uz, -1, 1);
    return Math.acos(d) * 180 / Math.PI;
  },

  // Mid-station (straight) or angle station (the line turns): one hall along the bisector of the two
  // sections, the lower section's bullwheel just past the node, the upper section's just before it.
  // How far an angle/mid-station wing reaches along its own line: `out` from the node towards its
  // section (the entrance), `past` beyond the node, far enough to hold that section's bullwheel.
  junctionReach(T) {
    const g = T.gauge;
    if (T.kind === 'tram') return { out: 34, past: 16, hw: g + 14 };
    const ext = Math.max(0, ...(T.ropes || [0]).map(Math.abs)), big = T.model === 'cabin3s' || T.model === 'funitel';
    return { out: big ? 46 : 38, past: 10 + g + 5, hw: g + ext + 7 };
  },
  // footprint of one wing: `lower` = the wing of the section that ends here
  junctionFootprint(T, at, ux, uz, lower) {
    const R = this.junctionReach(T), back = lower ? R.out : R.past, ahead = lower ? R.past : R.out, mid = (ahead - back) / 2;
    return { cx: at.x + ux * mid, cz: at.z + uz * mid, ux, uz, hl: (ahead + back) / 2, hw: R.hw };
  },

  // Angle / mid-station: two wings, each lined up with its own section, overlapping at the node where
  // the line turns. Each wing runs from its entrance past the node to its section's bullwheel: the
  // lower section's on a tensioning carriage, the upper section's with motor and gearbox.
  junction(parts, up, low, node) {
    const T = up.T, H = T.towerH, g = T.gauge, ext = Math.max(0, ...(T.ropes || [0]).map(Math.abs));
    const u1 = low.dir, u2 = up.dir;
    const at = (rot) => new THREE.Matrix4().makeRotationY(rot).premultiply(new THREE.Matrix4().makeTranslation(node.x, node.y, node.z));
    const F1 = at(Math.atan2(u1.ux, u1.uz)), F2 = at(Math.atan2(u2.ux, u2.uz));
    const R = this.junctionReach(T);
    // wing of the lower section: z from -out (its entrance) to +past; upper wing: -past to +out
    const wings = [{ F: F1, z0: -R.out, z1: R.past, entry: -1 }, { F: F2, z0: -R.past, z1: R.out, entry: 1 }];
    if (T.kind === 'tram') return this._tramJunction(parts, T, wings, node);

    const style = this.stationStyle(up);
    if (style !== 'classic') {
      const bend = this.bendAngle(low, up) * Math.PI / 180;
      this._shell(parts, F1, T, style, 1, -R.out, R.past, { front: true, back: true, joint: 'back', bend });
      this._shell(parts, F2, T, style, 1, -R.past, R.out, { front: true, back: true, joint: 'front', bend });
    } else {
      const W = (g + ext) * 2 + 14;
      for (const w of wings) {
        this._hall(parts, w.F, T, W, w.z1 - w.z0, (w.z0 + w.z1) / 2, 0);
        this._box(parts, 'wood', w.F, W - 4, 0.5, (w.z1 - w.z0) * 0.6, 0, 1.45, w.entry * (R.out * 0.35));
      }
      this._box(parts, 'wall', F1, 10, 7, 8, W / 2 + 6, 3.5, -R.out * 0.4);                         // control room
      this._box(parts, 'accent', F1, 10.6, 0.8, 8.6, W / 2 + 6, 7.2, -R.out * 0.4);
    }
    // the equipment, in each wing's own frame
    this._bullwheel(parts, F1, g, 0, H, 10);                                                       // lower loop turns back here
    this._bullwheel(parts, F2, g, 0, H, -10);                                                      // upper loop is driven from here
    for (const [F, z0, z1] of [[F1, -R.out + 4, 10], [F2, -10, R.out - 4]]) {
      for (const sx of [-1, 1]) {
        this._box(parts, 'dark', F, 0.5, 0.5, z1 - z0, sx * g, H + 0.6, (z0 + z1) / 2);             // station rail
        for (let z = z0 + 1; z < z1; z += 2.4) this._cyl(parts, 'rubber', F, 0.45, 0.45, 0.35, sx * (g - 0.9), H - 0.2, z, 8);   // tyre conveyor
        this._box(parts, 'steel', F, 0.4, 0.4, z1 - z0, sx * (g - 0.9), H - 0.6, (z0 + z1) / 2);
      }
    }
    for (const sx of [-1, 1]) this._box(parts, 'dark', F1, 0.6, 0.6, 16, sx * 2.2, H + 1.6, 10);      // tensioning carriage rails
    this._box(parts, 'steel', F1, 6, 1.2, 4, 0, H + 1.8, 10);
    this._box(parts, 'dark', F2, 4, 3, 6, 0, H + 2.8, -10);                                         // drive motor + gearbox
    this._box(parts, 'accent', F2, 4.3, 0.5, 6.3, 0, H + 4.5, -10);
    this._box(parts, 'dark', F2, 1.4, 2, 1.4, 0, H + 0.6, -10);
  },

  // tram mid-station as two wings: podium, platforms at cabin floor, glass hall; a portal on each
  // wing's entrance; each section's track ropes over saddles onto bollards near the node
  _tramJunction(parts, T, wings, node) {
    const H = T.towerH, g = T.gauge, fy = this.tramFloor(T), hw = g + 14, cw = 2.1 * CS + 0.4, top = H + 7;
    const xi = g - cw, xo = g + cw;
    wings.forEach((wg, n) => {
      const Fm = wg.F, box = (key, x0, x1, y0, y1, z0, z1) =>
        this._box(parts, key, Fm, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const z0 = wg.z0, z1 = wg.z1, ze = wg.entry > 0 ? z1 : z0;            // ze: the entrance end
      let low = -8;
      const pv = new THREE.Vector3();
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
        pv.set(-hw + (2 * hw * i) / 4, 0, z0 + ((z1 - z0) * j) / 4).applyMatrix4(Fm);
        low = Math.min(low, Terrain.height(pv.x, pv.z) - node.y - 3);
      }
      box('concrete', -hw, hw, low, fy - 4, z0, z1);
      box('concrete', -xi, xi, fy - 4, fy, z0, z1);
      for (const sx of [-1, 1]) {
        box('concrete', sx * xo, sx * hw, fy - 4, fy, z0, z1);
        box('edge', sx * (xi - 0.6), sx * xi, fy, fy + 0.08, z0, z1);
        box('edge', sx * xo, sx * (xo + 0.6), fy, fy + 0.08, z0, z1);
        box('glass', sx * hw, sx * (hw + 0.4), 1.5, fy - 6, z0 + 4, z1 - 4);
        for (let z = z0 + 5; z <= z1 - 3; z += 6) {
          box('glass', sx * (hw - 0.4), sx * hw, fy, top - 0.4, z - 3, z + 3);
          box('steel', sx * (hw - 0.8), sx * (hw + 0.2), fy, top, z - 0.35, z + 0.35);
        }
        box('concrete', sx * (hw - 2.2), sx * hw, low, top, ze - 1.5, ze + 1.5);              // portal pillars
      }
      box('roof', -hw - 1.5, hw + 1.5, top + 0.6, top + 1.8, z0 - (ze === z0 ? 2 : 0), z1 + (ze === z1 ? 2 : 0));
      box('accent', -hw - 1.8, hw + 1.8, top - 0.8, top + 0.6, z0 - (ze === z0 ? 2.3 : 0), z1 + (ze === z1 ? 2.3 : 0));
      box('concrete', -hw, hw, top - 4, top - 0.4, ze - 1.5, ze + 1.5);
      box('accent', -hw * 0.55, hw * 0.55, top - 3.5, top - 1.2, ze + wg.entry * 1.5, ze + wg.entry * 1.9);
      if (n === 0) { box('glassy', -xi + 0.4, xi - 0.4, fy, fy + 3.4, -3, 3); box('roof', -xi + 0.2, xi - 0.2, fy + 3.4, fy + 3.8, -3.2, 3.2); }
      // saddles at the entrance, then the ropes down to bollards near the node
      const dirz = wg.entry;
      for (const sx of [-1, 1]) for (const ro of T.ropes || [0]) {
        const x = sx * g + ro, bxx = sx * (hw - 5);
        this._strut(parts, 'dark', Fm, [x, H - 0.9, dirz * 14], [x, H - 0.9, dirz * 4], 1.2);
        this._strut(parts, 'dark', Fm, [x, H - 0.9, dirz * 4], [bxx, fy + 5.6, dirz * 6], 0.8);
        this._strut(parts, 'steel', Fm, [x + Math.sign(ro || sx) * 1.1, top - 1, dirz * 10], [x + Math.sign(ro || sx) * 1.1, H - 0.9, dirz * 10], 0.45);
      }
      for (const sx of [-1, 1]) {
        const bxx = sx * (hw - 5);
        this._cyl(parts, 'concrete', Fm, 2.6, 3, 5.5, bxx, fy, dirz * 6, 14);
        for (let k = 0; k < 3; k++) { const t = new THREE.TorusGeometry(2.75, 0.3, 5, 18); t.rotateX(Math.PI / 2); t.translate(bxx, fy + 1.4 + k * 1.3, dirz * 6); parts.add('dark', t, Fm); }
      }
    });
  },

  build(l) {
    this.initAssets();
    const T = l.T, a = l.a, b = l.b, g = new THREE.Group(), M = this.M;
    const P = this.profile(T, a, a.y, b, b.y, l.customTowers || null);
    const { hl, ux, uz, px, pz, prof } = P;
    l.profileP = P;
    l.issues = l.customTowers ? this.inspect(T, P, a).issues : [];   // automatic layouts are certified
    const rotY = Math.atan2(ux, uz);
    l.towers = P.towers;
    l.quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    l.quatDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY + Math.PI);
    l.dir = { ux, uz, px, pz };
    const accent = M.station[l.type] || M.steel;
    const mat = (key) => (key === 'accent' ? accent : M[key]);

    if (T.kind === 'belt') {
      const line = this.groundLine(P, a, 0, 0);
      const belt = makeRibbon(line, 0x2a2d31, 1, 2.4 * CS);
      belt.material.depthWrite = true; belt.material.transparent = false;
      g.add(belt);
      const parts = new Parts(), F = new THREE.Matrix4().makeRotationY(rotY).premultiply(new THREE.Matrix4().makeTranslation(a.x, a.y, a.z));
      this._box(parts, 'wall', F, 6, 4, 5, -9, 2, -6); this._box(parts, 'accent', F, 6.5, 0.6, 5.5, -9, 4.2, -6);
      this._box(parts, 'roof', F, 7, 0.5, 6.2, -9, 4.8, -6);
      parts.build(g, mat);
      l.upPath = new Path(line.map((p) => ({ ...p, y: p.y + 0.5 })));
      l.downPath = l.upPath;
      l.vis = g;
      if (l.planned) this.ghostify(g);
      return;
    }

    const parts = new Parts();
    const below = this.partnerBelow(l), above = this.partnerAbove(l);
    const FL = new THREE.Matrix4().makeRotationY(rotY).premultiply(new THREE.Matrix4().makeTranslation(a.x, 0, a.z));
    for (const t of P.trains) {
      this._battery(parts, FL, l, t);
      const st = P.prof[t.i].ypair ? P.prof[t.i].type : this.pylonType(l, P.prof[t.i]);
      t.walk = null;
      if (['mgd', 'y', 'twin', 'lattice'].includes(st) && T.kind !== 'surface') this._walkway(parts, FL, l, t, st === 'twin');
    }
    for (let i = 1; i < prof.length - 1; i++) this.pylon(parts, l, P, i, rotY, FL);
    if (below) this.junction(parts, l, below, a); else this.station(parts, l, a, 0, true, rotY, P);
    if (!above) this.station(parts, l, b, hl, false, rotY, P);
    parts.build(g, mat);

    // ropes: one per side, or two/three for funitels, 3S and trams
    const ropeParts = new Parts();
    for (const sgn of [1, -1]) (T.ropes || [0]).forEach((o, k) => {
      const dy = this.ropeDY(T, k);
      const line = this.ropeLine(P, a, 1, sgn * (T.gauge + o)).map((p) => new THREE.Vector3(p.x, p.y + dy, p.z));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), M.cable));
      const path = new THREE.CurvePath();
      for (let k = 0; k < line.length - 1; k++) if (line[k].distanceToSquared(line[k + 1]) > 0.01) path.add(new THREE.LineCurve3(line[k], line[k + 1]));
      if (path.curves.length) ropeParts.add(this.isSaddle(T, k) ? 'track' : T.saddles ? 'haul' : 'rope', new THREE.TubeGeometry(path, path.curves.length, this.isSaddle(T, k) ? 0.2 : 0.15, 5, false));
    });
    ropeParts.build(g, (k) => (k === 'track' ? M.trackRope : k === 'haul' ? M.haulRope : M.ropeMesh));
    const up = this.ropeLine(P, a, 1, T.gauge), down = this.ropeLine(P, a, -1, T.gauge).reverse();
    if (T.kind === 'surface') {
      // riders are dragged along the snow under the uphill rope
      l.upPath = new Path(this.groundLine(P, a, 1, T.gauge));
      l.ropeUp = new Path(up);
      l.downPath = new Path(down);
    } else {
      l.upPath = new Path(up);
      l.downPath = new Path(down);
    }
    l.vis = g;
    if (l.planned) this.ghostify(g);
  },

  // blueprint look for planned lifts
  ghostify(g) {
    if (!this.M.ghost) {
      this.M.ghost = new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.38, depthWrite: false });
      this.M.ghostLine = new THREE.LineBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.8 });
      this.shared.add(this.M.ghost); this.shared.add(this.M.ghostLine);
    }
    g.traverse((o) => {
      if (o.isLine) o.material = this.M.ghostLine;
      else if (o.isMesh) { if (o.material && !this.shared.has(o.material)) o.material.dispose(); o.material = this.M.ghost; }
    });
  },

  dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !this.shared.has(o.material)) o.material.dispose();
    });
  },

  // line segments showing the planned rope and towers
  previewGeometry(T, a, ya, b, yb, custom = null) {
    const P = this.profile(T, a, ya, b, yb, custom), pts = [];
    const line = T.kind === 'belt' ? this.groundLine(P, a, 0, 0) : this.ropeLine(P, a, 0, 0);
    for (let i = 0; i < line.length - 1; i++) pts.push(line[i].x, line[i].y + 1, line[i].z, line[i + 1].x, line[i + 1].y + 1, line[i + 1].z);
    for (let i = 1; i < P.prof.length - 1; i++) {
      const s = P.prof[i].s, x = a.x + P.ux * s, z = a.z + P.uz * s;
      pts.push(x, P.ground(s), z, x, P.prof[i].y, z);
    }
    return { pts, P };
  },
};
