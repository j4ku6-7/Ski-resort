'use strict';
// Lift types, pylon styles, cable geometry (towers, clearance, sag), 3D models and per-lift settings.

// Pylon styles: cost multiplier and how much taller than the lift's standard height they may go.
const PYLONS = {
  mgd: { name: 'Modern MGD tube', cost: 1.15, hMult: 1.15, desc: 'Conical galvanised tube with a box crossarm, catwalks along the sheave trains, a caged ladder and a maintenance gantry, like on modern 8-person gondolas.' },
  tube: { name: 'Classic tube', cost: 1, hMult: 1, desc: 'Slim single tube. Cheapest, standard height.' },
  lattice: { name: 'Lattice truss', cost: 1.5, hMult: 1.6, desc: 'Classic four-legged truss. Expensive, can be built much taller.' },
  portal: { name: 'Portal frame', cost: 1.3, hMult: 1.25, desc: 'Two legs and a cross beam, straddling wide ropes.' },
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
    name: 'Detachable quad', icon: '⑃', kind: 'aerial', model: 'chair4', pylons: ['mgd', 'y', 'tube', 'lattice'],
    maxSpan: 350, maxTowerH: 45,
    speed: 5, interval: 6, seats: 4, minLen: 150, maxLen: 3000, minVert: 20,
    baseCost: 120000, perM: 70, towerCost: 9000, opBase: 3000, opPerM: 1.6, cold: 1,
    gauge: 6.5, towerGap: 120, towerH: 18, hang: 3.7, maxClear: 50, sag: 0.02, comfort: 1, station: 0x4f6d8f, color: 0x3d6fb6,
    desc: 'High-speed chairs that slow down in the stations. The workhorse lift.',
  },
  chair6: {
    name: '6-seat bubble chair', icon: '⑆', kind: 'aerial', model: 'chair6', bubble: true, pylons: ['mgd', 'y', 'tube', 'lattice'],
    maxSpan: 350, maxTowerH: 45,
    speed: 5, interval: 5.4, seats: 6, minLen: 150, maxLen: 3200, minVert: 20,
    baseCost: 200000, perM: 90, towerCost: 12000, opBase: 4500, opPerM: 2, cold: 0.3,
    gauge: 8.5, towerGap: 125, towerH: 19, hang: 3.7, maxClear: 55, sag: 0.02, comfort: 2, station: 0x2f6bb3, color: 0x2b2f35,
    desc: 'High capacity, with weather bubbles and heated seats.',
  },
  gondola6: {
    name: '6-person gondola', icon: '▢', kind: 'aerial', model: 'cabin6', enclosed: true, pylons: ['mgd', 'y', 'tube', 'lattice', 'portal'],
    maxSpan: 500, maxTowerH: 60,
    speed: 5, interval: 9, seats: 6, minLen: 300, maxLen: 5000, minVert: 30,
    baseCost: 190000, perM: 100, towerCost: 12000, opBase: 4500, opPerM: 2, cold: 0,
    gauge: 5.5, towerGap: 200, towerH: 20, hang: 3.6, maxClear: 85, sag: 0.025, comfort: 2, station: 0x3c8d5a, color: 0x2e9e5b,
    desc: 'Compact enclosed cabins. A cheaper gondola for medium-length lifts.',
  },
  gondola: {
    name: '8-person gondola', icon: '▣', kind: 'aerial', model: 'gondola', enclosed: true, pylons: ['mgd', 'y', 'tube', 'lattice', 'portal'],
    maxSpan: 600, maxTowerH: 65,
    speed: 6, interval: 10, seats: 8, minLen: 300, maxLen: 6000, minVert: 30,
    baseCost: 250000, perM: 120, towerCost: 15000, opBase: 6000, opPerM: 2.5, cold: 0,
    gauge: 6, towerGap: 220, towerH: 22, hang: 3.9, maxClear: 90, sag: 0.025, comfort: 3, station: 0xb83a32, color: 0xc0392b,
    desc: 'Enclosed cabins for long lifts from the valley. Warm and comfortable.',
  },
  gondola10: {
    name: '10-person gondola', icon: '▤', kind: 'aerial', model: 'cabin10', enclosed: true, pylons: ['mgd', 'y', 'tube', 'lattice', 'portal'],
    maxSpan: 650, maxTowerH: 70,
    speed: 6, interval: 10, seats: 10, minLen: 300, maxLen: 6500, minVert: 30,
    baseCost: 330000, perM: 140, towerCost: 18000, opBase: 7000, opPerM: 2.8, cold: 0,
    gauge: 6.8, towerGap: 230, towerH: 24, hang: 4.3, maxClear: 95, sag: 0.025, comfort: 4, station: 0x24476b, color: 0xf0f0f0,
    desc: 'Big panoramic cabins with lots of glass. High capacity on long lines.',
  },
  funitel: {
    name: 'Funitel', icon: '⧈', kind: 'aerial', model: 'funitel', enclosed: true, ropes: [-3.2, 3.2], pylons: ['portal', 'y', 'mgd', 'lattice'],
    maxSpan: 900, maxTowerH: 80,
    speed: 7, interval: 18, seats: 24, minLen: 500, maxLen: 4500, minVert: 50,
    baseCost: 900000, perM: 260, towerCost: 60000, opBase: 12000, opPerM: 4, cold: 0,
    gauge: 9, towerGap: 380, towerH: 30, hang: 4.4, maxClear: 120, sag: 0.02, comfort: 5, station: 0x5b2d82, color: 0xffc81e,
    desc: 'Wide cabins hung from two ropes: very stable in wind, fast, and 24 people per cabin.',
  },
  gondola3s: {
    name: '3S tricable gondola', icon: '⫴', kind: 'aerial', model: 'cabin3s', enclosed: true, ropes: [-2.8, 0, 2.8], pylons: ['lattice', 'y', 'portal'],
    maxSpan: 3000, maxTowerH: 150,
    speed: 7.5, interval: 24, seats: 32, minLen: 800, maxLen: 8000, minVert: 80,
    baseCost: 1500000, perM: 320, towerCost: 220000, opBase: 15000, opPerM: 4.5, cold: 0,
    gauge: 11, towerGap: 1200, towerH: 48, hang: 5.3, maxClear: Infinity, sag: 0.012, comfort: 6, station: 0x1f2f3f, color: 0xd8202a,
    desc: 'Two track ropes and a haul rope: kilometre-long spans with only a few huge pylons, 32 people per cabin.',
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
const WHEEL_R = 0.42 * CS, WHEEL_SP = WHEEL_R * 2.15;
const MAX_LEAN = 30, MAX_LINK_GAP = 45, MAX_LINKED = 4;
const SHEAVE_MODES = { auto: 'Automatic', support: 'Bottom (support)', hold: 'Top (hold-down)', both: 'Top and bottom' };
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
    return l.T.interval / l.opt.density;
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
    const out = { hl, ux, uz, px: -uz, pz: ux, ground, prof: [], towers: 0, sag: T.sag };
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
        if (t.type === 'y') {
          const sp2 = clamp(t.spread || 16, 8, 30) / 2, y = ground(t.s) + t.h;
          prof.push({ s: clamp(t.s - sp2, 1, hl - 1), foot: t.s, y, type: 'y', ypair: 'a', link: true, wheels: t.wheels, mode: t.mode, src: t });
          prof.push({ s: clamp(t.s + sp2, 1, hl - 1), foot: t.s, y, type: 'y', ypair: 'b', link: !!t.link, src: t });
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
        // the linked group acts as one long train: a single even curve centred on the group, at the
        // members' mean head height; every member's head then rides on that curve
        const sA = first.s, sB = Math.max(last.s, sA + 1), c = (sA + sB) / 2;
        let yC = 0; for (let m = i; m <= j; m++) yC += pr[m].y; yC /= j - i + 1;
        const v = { s: c, y: yC };
        const b1 = Math.atan2(yC - P.cableY(prev, v, c - 4), 4), b2 = Math.atan2(P.cableY(v, next, c + 4) - yC, 4);
        a1 = b1; a2 = b2; bend = a1 - a2; deg = Math.abs(bend) * 180 / Math.PI; press = bend >= 0;
        if (!(first.mode && first.mode !== 'auto')) mode = press ? 'support' : 'hold';
        s0 = sA - sp; s1 = sB + sp;
        const Lt = s1 - s0, tilt = (a1 + a2) / 2;
        yAt = (s) => yC + Math.tan(tilt) * (s - c) - (bend / (2 * Lt)) * (s - c) * (s - c);
        slopeAt = (s) => Math.tan(tilt) - (bend / Lt) * (s - c);
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
        if (t.mode === 'support' && !t.press && t.deg > 0.3) issues.push(`${name}: the rope lifts off the support wheels. Use top or top-and-bottom wheels.`);
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
      wood: lam(0x9a6a3c), wall: lam(0xe9e4da), belt: lam(0x2a2d31), galv: lam(0xa9b1b8), grate: lam(0x6f767d),
      glass: lam(0x9fd0ff, { transparent: true, opacity: 0.35, depthWrite: false }),
      glassy: lam(0x9fc7ff, { transparent: true, opacity: 0.55 }),
      cable: new THREE.LineBasicMaterial({ color: 0x15171a }),
      ropeMesh: lam(0x1d2024),
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
      box(1.9, 0.45, 3.2, 0, -0.35, 0, 0x50565e);                // carriage riding on the track ropes
      for (const x of [-0.8, 0.8]) for (const z of [-1.2, 1.2]) box(0.25, 0.4, 0.5, x, -0.1, z, DARK);
      cabin(2.7, 2.4, 3.5, 2.6);
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
  _walkway(parts, FL, l, t) {
    const T = l.T, ext = Math.max(0, ...(T.ropes || [0]).map(Math.abs));
    const x = T.gauge + ext + 2.0, drop = t.mode === 'hold' ? 1.6 : 2 * t.r + 0.55;
    const yAt = (s) => t.yAt(s) - drop;
    t.walk = { x, yAt };
    const s0 = t.s0 - 2, s1 = t.s1 + 2, n = Math.max(2, Math.ceil((s1 - s0) / 2.5));
    for (const sgn of [1, -1]) {
      const X = sgn * x;
      let prev = null, prevPost = null;
      for (let k = 0; k <= n; k++) {
        const s = s0 + ((s1 - s0) * k) / n, y = yAt(s), pt = [X, y, s];
        if (prev) this._plank(parts, 'grate', FL, prev, pt, 1.4, 0.14);
        const post = [X + sgn * 0.68, y + 1.1, s];
        if (k % 1 === 0) this._strut(parts, 'galv', FL, [X + sgn * 0.68, y, s], post, 0.09);       // railing post
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
      for (const sgn of surface ? [-1] : [1, -1]) for (const o of T.ropes || [0]) {
        const x = sgn * (T.gauge + o), bx = x + sgn * 0.55;
        for (const [cz, cy] of centres) {
          const g = new THREE.CylinderGeometry(t.r, t.r, 0.5, 16); g.rotateZ(Math.PI / 2); g.translate(x, cy, cz); parts.add('rubber', g, FL);
          const hub = new THREE.CylinderGeometry(t.r * 0.35, t.r * 0.35, 0.62, 8); hub.rotateZ(Math.PI / 2); hub.translate(x, cy, cz); parts.add('steel', hub, FL);
        }
        for (let w = 0; w + 1 < centres.length; w += 2) this._strut(parts, 'steel', FL, [bx, centres[w][1], centres[w][0]], [bx, centres[w + 1][1], centres[w + 1][0]], 0.45);
        for (const [z, y] of bal) this._strut(parts, 'steel', FL, [bx, y - off, z], [bx, y, z], 0.35);
        for (let k = 0; k + 1 < bal.length; k++) this._strut(parts, 'steel', FL, [bx, bal[k][1], bal[k][0]], [bx, bal[k + 1][1], bal[k + 1][0]], 0.55);
      }
    }
  },

  // crossarm height (absolute) for profile point i
  _armY(P, i, t) {
    const p = P.prof[i];
    if (t.mode === 'hold') return p.y + 2 * t.r + 1.6;
    return p.y - 2 * t.r - (t.mode === 'both' ? 1.6 : 1.2);
  },

  pylon(parts, l, P, i, rotY, FL) {
    const T = l.T, p = P.prof[i], a = l.a, t = this.trainFor(P, i);
    const foot = p.foot != null ? p.foot : p.s, gy = P.ground(foot);
    const x = a.x + P.ux * foot, z = a.z + P.uz * foot;
    const style = this.pylonType(l, p), surface = T.kind === 'surface';
    const ext = Math.max(0, ...(T.ropes || [0]).map(Math.abs)), reach = T.gauge + ext + 1.2;
    const armAbs = this._armY(P, i, t), H = armAbs - gy, dz = p.s - foot;
    // foot frame, sheared so the structure leans and its top lands under the head
    const F = new THREE.Matrix4().makeRotationY(rotY).premultiply(new THREE.Matrix4().makeTranslation(x, gy, z));
    const shear = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, H > 0 ? dz / H : 0, 1, 0, 0, 0, 0, 1);
    const FS = F.clone().multiply(shear);
    // hangers from the arm to the balancer of each set, on every rope
    for (const set of t.mode === 'both' ? ['support', 'hold'] : [t.mode]) {
      const bal = t.bal[set].reduce((b, q) => (Math.abs(q[0] - p.s) < Math.abs(b[0] - p.s) ? q : b));
      for (const sgn of surface ? [-1] : [1, -1]) for (const o of T.ropes || [0]) {
        const bx = sgn * (T.gauge + o) + sgn * 0.55;
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
    const head = (M, Hh, key = 'galv') => {
      this._box(parts, key, M, reach * 2 + 1.5, 1.5, 1.4, 0, Hh + 0.2, 0);                     // box crossarm
      this._cyl(parts, key, M, 1.1, 1.1, 2.2, 0, Hh - 0.9, 0, 16);                              // head cap
      // trapezoidal lattice truss over the ropes: bottom chord on the crossarm, sides rising from the
      // crossarm ends (and past the walkways) to a shorter top chord, braced with verticals and diagonals
      const clear = t.mode === 'hold' ? Hh + 1 : t.mode === 'both' ? ropeTop + 2 * t.r + 1.2 : ropeTop + 1.3;
      const xb = reach + 1.6, yb = Hh + 0.95, yp = Math.max(yb + 0.8, clear), xt = Math.max(1.6, reach * 0.45);
      const yt = yp + Math.max(2.4, (xb - xt) * 0.55), D = 0.75;
      const side = (u) => [xb + (xt - xb) * u, yp + (yt - yp) * u];                     // point up the slanted side
      for (const zz of [-D, D]) {
        this._strut(parts, key, M, [-xb, yb, zz], [xb, yb, zz], 0.4);                     // bottom chord
        this._strut(parts, key, M, [-xt, yt, zz], [xt, yt, zz], 0.45);                    // top chord
        for (const sx of [-1, 1]) {
          this._strut(parts, key, M, [sx * xb, yb, zz], [sx * xb, yp, zz], 0.42);          // end posts beside the walkways
          this._strut(parts, key, M, [sx * xb, yp, zz], [sx * xt, yt, zz], 0.42);          // slanted sides
          const [mx, my] = side(0.5);
          this._strut(parts, key, M, [sx * mx, my, zz], [sx * mx, yb, zz], 0.24);          // vertical
          this._strut(parts, key, M, [sx * xb, yb, zz], [sx * mx, my, zz], 0.18);          // diagonals
          this._strut(parts, key, M, [sx * mx, yb, zz], [sx * xt, yt, zz], 0.18);
          this._strut(parts, key, M, [sx * xt, yt, zz], [sx * xt, yb, zz], 0.24);
        }
        this._strut(parts, key, M, [-xt, yb, zz], [0, yt, zz], 0.18);
        this._strut(parts, key, M, [xt, yb, zz], [0, yt, zz], 0.18);
      }
      for (const x of [-xt, 0, xt]) this._strut(parts, key, M, [x, yt, -D], [x, yt, D], 0.3);   // ties between the two planes
      for (const sx of [-1, 1]) this._strut(parts, key, M, [sx * xt, yt, -D], [0, yt, D], 0.14);
      const eye = new THREE.TorusGeometry(0.35, 0.09, 6, 12); eye.translate(0, yt + 0.55, 0); parts.add(key, eye, M);   // lifting eye
      this._box(parts, 'accent', M, 0.6, 0.45, 0.6, xt, yt + 0.45, 0);                                     // obstruction light
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
    if (p.ypair) {
      // Y-pylon: one foundation and trunk, two standard pylon branches splayed along the line, each with a head
      const hf = Math.max(3, Math.min(H * 0.3, 14)), rb = 1.5 + H * 0.018;
      if (p.ypair === 'a') {
        this._box(parts, 'concrete', F, 7, 1.8, 7, 0, 0.1, 0);
        this._cyl(parts, 'galv', F, rb + 0.6, rb + 0.6, 0.5, 0, 0.9, 0, 20);
        this._cyl(parts, 'galv', F, rb * 0.92, rb, hf - 1.4, 0, 1.4, 0, 20);                    // trunk
        this._box(parts, 'galv', F, rb * 2.2, 1.4, rb * 2.4, 0, hf, 0);                          // fork node
        ladder(F, rb, 1.5, hf - 0.6);
      }
      const k = H - hf > 0 ? dz / (H - hf) : 0;
      const FB = F.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -k * hf))
        .multiply(new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, k, 1, 0, 0, 0, 0, 1));
      this._cyl(parts, 'galv', FB, 0.85, 1.1, H - hf - 0.4, 0, hf, 0, 18);                       // branch tube
      head(FB, H);
    } else if (style === 'mgd') {
      const rb = 1.25 + H * 0.018, rt = 0.85;
      this._box(parts, 'concrete', F, 5, 1.8, 5, 0, 0.1, 0);                                    // foundation
      this._cyl(parts, 'galv', F, rb + 0.5, rb + 0.5, 0.5, 0, 0.9, 0, 20);                     // flange plate
      this._cyl(parts, 'galv', FS, rt, rb, H - 0.6, 0, 1.4, 0, 20);                             // conical tube
      head(FS, H);
      ladder(FS, rb, 1.5, H - 1.5);
    } else if (style === 'lattice' || style === 'portal' || style === 'tube') {
      this._box(parts, 'concrete', F, 5, 1.8, 5, 0, 0.1, 0);
    }
    if (p.ypair || style === 'mgd' || (style === 'lattice' && !surface)) {
      // brackets from the crossarm ends out to the walkways beside the sheave trains
      for (const sgn of surface ? [-1] : [1, -1]) {
        const w = t.walk;
        if (!w) continue;
        const wy = w.yAt(p.s), wx = sgn * (w.x - 0.75);
        this._strut(parts, 'galv', FL, [sgn * (reach + 0.4), armAbs, p.s], [wx, wy - 0.1, p.s], 0.32);
        this._strut(parts, 'galv', FL, [sgn * (reach + 0.4), armAbs - 1.4, p.s], [wx, wy - 0.1, p.s], 0.22);
      }
    }
    if (p.ypair || style === 'mgd') {
      // drawn above
    } else if (style === 'lattice') {
      const wb = Math.max(2.4, H * 0.13), wt = 1.3, segs = Math.max(2, Math.ceil(H / 7)), r0 = 0.45;
      const corner = (u, sx, sz) => { const w = wb + (wt - wb) * u; return [sx * w, H * u, sz * w]; };
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
      if (surface) this._box(parts, 'steel', FS, reach * 2, 1.2, 1.6, -reach / 2, H, 0);
      else head(FS, H, 'steel');
    } else if (style === 'portal') {
      const lx = reach, splay = H * 0.07;
      for (const sx of [-1, 1]) {
        this._strut(parts, 'steel', FS, [sx * (lx + splay), 0, 0], [sx * lx, H, 0], 1.6);
        this._box(parts, 'concrete', F, 3.5, 1.4, 3.5, sx * (lx + splay), 0.2, 0);
      }
      this._box(parts, 'steel', FS, lx * 2 + 2.4, 1.8, 2, 0, H, 0);
      this._box(parts, 'steel', FS, lx * 2, 0.8, 0.9, 0, H * 0.55, 0);
    } else {
      const rb = surface ? 0.8 : 1.4 + H * 0.02, rt = surface ? 0.55 : 1.0;
      this._cyl(parts, 'steel', FS, rt, rb, H + 0.4, 0, -0.4, 0, 12);
      if (surface) this._box(parts, 'steel', FS, reach + 0.5, 0.5, 0.5, -reach / 2, H, 0);
      else this._box(parts, 'steel', FS, reach * 2, 1.0, 1.0, 0, H, 0);
      if (!surface) for (let y = 2; y < H - 2; y += 1.4) this._box(parts, 'dark', FS, 0.6, 0.08, 0.08, 0, y, rb + 0.25);
    }
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
    if (T.kind === 'tram') {
      const W = g * 2 + 26, L = 50, hgt = H + 10, zc = o * 18;
      this._box(parts, 'concrete', F, W, hgt, L, 0, hgt / 2 - 2, zc);
      this._box(parts, 'glass', F, W * 0.7, hgt * 0.6, 0.5, 0, hgt * 0.55, zc - o * (L / 2 + 0.3));   // big glass front
      this._box(parts, 'dark', F, g * 2 + 8, 9, 0.6, 0, H - 5, zc - o * (L / 2 + 0.4));              // cabin bay
      this._box(parts, accent, F, W + 1, 1.6, L + 1, 0, hgt - 1.2, zc);
      this._box(parts, 'roof', F, W + 2, 0.8, L + 2, 0, hgt - 0.2, zc);
      for (const sx of [-1, 1]) this._box(parts, 'dark', F, 2, 2, 6, sx * g, H, zc + o * (L / 2 - 4));  // rope anchors
      return;
    }
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

  // station hall: plinth, columns, glass side walls (+ an end wall at `endWall` = ±1), fascia, gabled roof
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

  canHaveStations(T) { return T.kind === 'aerial' && T.station3d !== 'fixed'; },

  // the sections of one lift line meeting at a node: lower (ends here) and upper (starts here)
  partnerBelow(l) { return l.line ? Net.lifts.find((x) => x !== l && x.line === l.line && x.b === l.a) : null; },
  partnerAbove(l) { return l.line ? Net.lifts.find((x) => x !== l && x.line === l.line && x.a === l.b) : null; },
  bendAngle(low, up) {
    const d = clamp(low.dir.ux * up.dir.ux + low.dir.uz * up.dir.uz, -1, 1);
    return Math.acos(d) * 180 / Math.PI;
  },

  // Mid-station (straight) or angle station (the line turns): one hall along the bisector of the two
  // sections, the lower section's bullwheel just past the node, the upper section's just before it.
  junction(parts, up, low, node) {
    const T = up.T, H = T.towerH, g = T.gauge, ext = Math.max(0, ...(T.ropes || [0]).map(Math.abs));
    const u1 = low.dir, u2 = up.dir;
    let bx = u1.ux + u2.ux, bz = u1.uz + u2.uz; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
    const bend = this.bendAngle(low, up) * Math.PI / 180;
    const at = (rot) => new THREE.Matrix4().makeRotationY(rot).premultiply(new THREE.Matrix4().makeTranslation(node.x, node.y, node.z));
    const FB = at(Math.atan2(bx, bz));
    const W = (g + ext) * 2 + 14 + 26 * Math.sin(bend / 2), L = 56 + 20 * Math.sin(bend / 2);
    this._hall(parts, FB, T, W, L, 0, 0);
    this._box(parts, 'wood', FB, W - 4, 0.5, L * 0.5, 0, 1.45, 0);                                   // platform for getting on/off
    this._box(parts, 'wall', FB, 10, 7, 8, W / 2 + 6, 3.5, 0);                                      // control room
    this._box(parts, 'accent', FB, 10.6, 0.8, 8.6, W / 2 + 6, 7.2, 0);
    const F1 = at(Math.atan2(u1.ux, u1.uz)), F2 = at(Math.atan2(u2.ux, u2.uz));
    this._bullwheel(parts, F1, g, 0, H, 10);                                                       // lower loop returns here
    this._bullwheel(parts, F2, g, 0, H, -10);                                                      // upper loop is driven from here
    for (const sx of [-1, 1]) {
      this._box(parts, 'dark', F1, 0.5, 0.5, 14, sx * g, H + 0.6, 2);                              // detach rails into the hall
      this._box(parts, 'dark', F2, 0.5, 0.5, 14, sx * g, H + 0.6, -2);
    }
    this._box(parts, 'dark', FB, 3, 2.2, 4, 0, H + 1.8, -L / 2 + 6);                              // drive motor for the upper loop
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
      const st = P.prof[t.i].ypair ? 'y' : this.pylonType(l, P.prof[t.i]);
      t.walk = null;
      if ((st === 'mgd' || st === 'y' || st === 'lattice') && T.kind !== 'surface') this._walkway(parts, FL, l, t);
    }
    for (let i = 1; i < prof.length - 1; i++) this.pylon(parts, l, P, i, rotY, FL);
    if (below) this.junction(parts, l, below, a); else this.station(parts, l, a, 0, true, rotY, P);
    if (!above) this.station(parts, l, b, hl, false, rotY, P);
    parts.build(g, mat);

    // ropes: one per side, or two/three for funitels, 3S and trams
    const ropeParts = new Parts();
    for (const sgn of [1, -1]) for (const o of T.ropes || [0]) {
      const line = this.ropeLine(P, a, 1, sgn * (T.gauge + o)).map((p) => new THREE.Vector3(p.x, p.y, p.z));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), M.cable));
      const path = new THREE.CurvePath();
      for (let k = 0; k < line.length - 1; k++) if (line[k].distanceToSquared(line[k + 1]) > 0.01) path.add(new THREE.LineCurve3(line[k], line[k + 1]));
      if (path.curves.length) ropeParts.add('rope', new THREE.TubeGeometry(path, path.curves.length, 0.22, 5, false));
    }
    ropeParts.build(g, (k) => M.ropeMesh);
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
