'use strict';
// Lift types, cable geometry (towers, clearance, sag), 3D models and per-lift settings.

// Real-world-ish specs. speed in m/s, interval = seconds between carriers, seats per carrier.
// cold: how much skiers suffer on long rides (open chairs 1, bubble 0.3, cabins 0).
const LIFT_TYPES = {
  carpet: {
    name: 'Magic carpet', icon: '▭', kind: 'belt', model: null,
    speed: 0.9, interval: 2.2, seats: 1, minLen: 20, maxLen: 220, minVert: 2, maxGrade: 0.25,
    baseCost: 15000, perM: 150, towerCost: 0, opBase: 400, opPerM: 2, cold: 0.5,
    gauge: 0, towerGap: 0, towerH: 0, sag: 0, comfort: 1, station: 0x6d7a88,
    desc: 'A conveyor belt for the beginner area. Short and gentle only.',
  },
  tbar: {
    maxSpan: 150, maxTowerH: 14,
    name: 'T-bar', icon: '⊤', kind: 'surface', model: 'tbar',
    speed: 3, interval: 4.5, seats: 2, minLen: 100, maxLen: 1500, minVert: 10, maxGrade: 0.6,
    baseCost: 30000, perM: 45, towerCost: 3000, opBase: 1200, opPerM: 0.8, cold: 1.2,
    gauge: 4.5, towerGap: 100, towerH: 10, maxClear: 13, sag: 0.008, comfort: -1, beginnerPenalty: 5, station: 0x7c8794,
    desc: 'A cheap surface lift that drags skiers uphill. Beginners hate it, and slopes are limited to 60%.',
  },
  chair2: {
    maxSpan: 300, maxTowerH: 40,
    name: 'Double chair', icon: '⑂', kind: 'aerial', model: 'chair2',
    speed: 2.3, interval: 5.5, seats: 2, minLen: 150, maxLen: 2200, minVert: 20,
    baseCost: 40000, perM: 45, towerCost: 6000, opBase: 1500, opPerM: 1.0, cold: 1,
    gauge: 4.6, towerGap: 95, towerH: 17, hang: 3.7, maxClear: 45, sag: 0.02, comfort: 0, station: 0x8a96a3,
    desc: 'Fixed-grip double chair. Cheap but slow; long rides get cold.',
  },
  chair4: {
    maxSpan: 350, maxTowerH: 45,
    name: 'Detachable quad', icon: '⑃', kind: 'aerial', model: 'chair4',
    speed: 5, interval: 6, seats: 4, minLen: 150, maxLen: 3000, minVert: 20,
    baseCost: 120000, perM: 70, towerCost: 9000, opBase: 3000, opPerM: 1.6, cold: 1,
    gauge: 6.5, towerGap: 120, towerH: 18, hang: 3.7, maxClear: 50, sag: 0.02, comfort: 1, station: 0x4f6d8f,
    desc: 'High-speed chairs that slow down in the stations. The workhorse lift.',
  },
  chair6: {
    maxSpan: 350, maxTowerH: 45,
    name: '6-seat bubble chair', icon: '⑆', kind: 'aerial', model: 'chair6', bubble: true,
    speed: 5, interval: 5.4, seats: 6, minLen: 150, maxLen: 3200, minVert: 20,
    baseCost: 200000, perM: 90, towerCost: 12000, opBase: 4500, opPerM: 2, cold: 0.3,
    gauge: 8.5, towerGap: 125, towerH: 19, hang: 3.7, maxClear: 55, sag: 0.02, comfort: 2, station: 0x2f6bb3,
    desc: 'High capacity, with weather bubbles and heated seats.',
  },
  gondola: {
    maxSpan: 600, maxTowerH: 65,
    name: '8-person gondola', icon: '▣', kind: 'aerial', model: 'gondola',
    speed: 6, interval: 10, seats: 8, minLen: 300, maxLen: 6000, minVert: 30,
    baseCost: 250000, perM: 120, towerCost: 15000, opBase: 6000, opPerM: 2.5, cold: 0,
    gauge: 6, towerGap: 220, towerH: 22, hang: 3.9, maxClear: 90, sag: 0.025, comfort: 3, station: 0xb83a32,
    desc: 'Enclosed cabins for long lifts from the valley. Warm and comfortable.',
  },
  tram: {
    maxSpan: 3000, maxTowerH: 120,
    name: 'Aerial tramway', icon: '⛫', kind: 'tram', model: 'tram',
    speed: 10, seats: 80, dwell: 90, minLen: 400, maxLen: 5000, minVert: 100,
    baseCost: 600000, perM: 250, towerCost: 90000, opBase: 9000, opPerM: 3, cold: 0,
    gauge: 10, towerGap: 1400, towerH: 36, hang: 6.3, maxClear: Infinity, sag: 0.035, comfort: 5, station: 0x9a2f2f,
    desc: 'Two big cabins shuttle back and forth, with spans over cliffs and very few towers. Low capacity, but the views are spectacular.',
  },
};
const LIFT_ALIASES = { chair: 'chair4' };   // saves from before the lift overhaul
const CS = 3.5;                             // carriers drawn 3.5x real size so they read at map scale

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

  // Cable profile along the lift line: towers wherever the rope would touch the snow, or (for chairs)
  // float too high above it. Returns spans with sag, and the tower list.
  // Pylon price grows with height (taller = more steel and a bigger foundation).
  towerPrice(T, h) { return T.towerCost * (0.4 + 0.6 * h / T.towerH); },
  towersValue(T, towers) { return towers.reduce((v, t) => v + this.towerPrice(T, t.h), 0); },

  // Interior pylons of the automatic layout, as editable {s, h} (s = metres along the line, h = height).
  autoTowers(T, a, ya, b, yb) {
    const P = this.profile(T, a, ya, b, yb);
    return P.prof.slice(1, -1).map((p) => ({ s: p.s, h: Math.round(p.y - P.ground(p.s)) }));
  },

  // `custom`: null = automatic pylons, or an explicit [{s, h}] list placed by the player.
  profile(T, a, ya, b, yb, custom = null) {
    const hl = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / hl, uz = (b.z - a.z) / hl;
    const ground = (s) => Terrain.height(a.x + ux * s, a.z + uz * s);
    const H = T.towerH;
    const out = { hl, ux, uz, px: -uz, pz: ux, ground, prof: [], towers: 0 };
    if (T.kind === 'belt') { out.prof = [{ s: 0, y: ya }, { s: hl, y: yb }]; return out; }
    const prof = [{ s: 0, y: ya + H }, { s: hl, y: yb + H }];
    const minClear0 = T.kind === 'surface' ? 2.5 : (T.hang || 1) * CS + 3;
    const cy0 = (p, q, s) => {
      const span = q.s - p.s, u = (s - p.s) / span;
      return p.y + (q.y - p.y) * u - 4 * T.sag * span * u * (1 - u);
    };
    if (custom) {
      for (const t of custom) if (t.s > 0 && t.s < hl) prof.push({ s: t.s, y: ground(t.s) + t.h });
      prof.sort((p, q) => p.s - q.s);
      Object.assign(out, { prof, towers: prof.length - 2, cableY: cy0, minClear: minClear0 });
      return out;
    }
    const n = Math.floor(hl / T.towerGap);
    for (let k = 1; k <= n; k++) { const s = (hl * k) / (n + 1); prof.push({ s, y: ground(s) + H }); }
    prof.sort((p, q) => p.s - q.s);
    const minClear = T.kind === 'surface' ? 2.5 : (T.hang || 1) * CS + 3;
    const cy = (p, q, s) => {
      const span = q.s - p.s, u = (s - p.s) / span;
      return p.y + (q.y - p.y) * u - 4 * T.sag * span * u * (1 - u);
    };
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
    out.towers = prof.length - 2;
    out.cableY = cy;
    return out;
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
        samples.push({ x: a.x + P.ux * s, y, z: a.z + P.uz * s, st });
      }
    }
    if (hitRuns) issues.push(T.kind === 'surface' ? `The rope drags on the snow in ${hitRuns} place${hitRuns > 1 ? 's' : ''}` :
      `Carriers would hit the snow in ${hitRuns} place${hitRuns > 1 ? 's' : ''}`);
    if (high) issues.push(T.kind === 'surface' ? 'The rope is too high, so the T-bars can\'t reach the skiers' :
      `${T.model === 'gondola' ? 'Cabins hang' : 'Chairs hang'} ${Math.round(high)} m above the ground (max ${T.maxClear} m), too high to evacuate`);
    if (longest > T.maxSpan) issues.push(`A span of ${Math.round(longest)} m is too long (max ${T.maxSpan} m)`);
    return { issues, samples };
  },

  // sampled rope polyline on one side (+1 uphill side, -1 downhill side)
  ropeLine(P, a, sgn, gauge) {
    const pts = [], { prof, ux, uz, px, pz } = P;
    for (let i = 0; i < prof.length - 1; i++) {
      const p = prof[i], q = prof[i + 1], n = Math.max(1, Math.ceil((q.s - p.s) / 15));
      for (let k = i ? 1 : 0; k <= n; k++) {
        const s = p.s + ((q.s - p.s) * k) / n;
        const y = P.cableY ? P.cableY(p, q, s) : p.y + ((q.y - p.y) * k) / n;
        pts.push({ x: a.x + ux * s + px * gauge * sgn, y, z: a.z + uz * s + pz * gauge * sgn });
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
      steel: lam(0x6b7178), dark: lam(0x2b2f35), concrete: lam(0xa9a59d), roof: lam(0x3b4048),
      wheel: lam(0x23262b), belt: lam(0x2a2d31), glassy: lam(0x9fc7ff, { transparent: true, opacity: 0.55 }),
      cable: new THREE.LineBasicMaterial({ color: 0x1c1e22 }),
      station: {},
    };
    for (const k in LIFT_TYPES) this.M.station[k] = lam(LIFT_TYPES[k].station);
    this.G = {
      box: new THREE.BoxGeometry(1, 1, 1),
      pole: new THREE.CylinderGeometry(0.55, 0.9, 1, 8).translate(0, 0.5, 0),
      pylon: new THREE.CylinderGeometry(1.2, 4.5, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
      wheel: new THREE.CylinderGeometry(1, 1, 0.6, 28),
    };
    this.shared = new Set([...Object.values(this.G), ...Object.values(this.M).filter((m) => m.isMaterial), ...Object.values(this.M.station)]);
  },

  // carrier models hang from the grip at y = 0, travel along +z
  carrierGeometry(model) {
    const parts = [], C = new THREE.Color();
    const part = (geo, color, x, y, z) => {
      geo.translate(x, y, z);
      const n = geo.attributes.position.count, col = new Float32Array(n * 3);
      C.set(color);
      for (let i = 0; i < n; i++) { col[3 * i] = C.r; col[3 * i + 1] = C.g; col[3 * i + 2] = C.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(geo);
    };
    const box = (w, h, d, x, y, z, c) => part(new THREE.BoxGeometry(w, h, d), c, x, y, z);
    if (model.startsWith('chair')) {
      const seats = +model.slice(5), w = seats * 0.62 + 0.2;
      box(0.09, 2.6, 0.09, 0, -1.3, 0, 0x3a3f46);              // hanger
      box(w, 0.08, 0.08, 0, -2.6, 0.0, 0x3a3f46);              // top bar
      box(0.08, 0.6, 0.08, -w / 2, -2.9, 0, 0x3a3f46);
      box(0.08, 0.6, 0.08, w / 2, -2.9, 0, 0x3a3f46);
      box(w, 0.1, 0.6, 0, -3.2, 0.05, 0x2b2f35);               // seat
      box(w, 0.6, 0.08, 0, -2.9, -0.27, 0x2b2f35);             // backrest
      box(w, 0.06, 0.06, 0, -2.75, 0.55, 0x8a9099);            // safety bar
      box(w * 0.9, 0.05, 0.2, 0, -3.65, 0.6, 0x8a9099);        // footrest
      if (model === 'chair6') box(w, 0.06, 0.6, 0, -3.18, 0.05, 0xc8102e);  // heated red seats
    } else if (model === 'gondola') {
      box(0.1, 1.6, 0.1, 0, -0.8, 0, 0x3a3f46);
      box(1.9, 0.12, 1.7, 0, -1.65, 0, 0x3a3f46);
      box(1.9, 2.1, 1.7, 0, -2.75, 0, 0xc0392b);               // cabin
      box(1.95, 0.75, 1.75, 0, -2.4, 0, 0x26313d);             // window band
      box(1.92, 0.2, 1.72, 0, -3.75, 0, 0x7d1f17);
    } else if (model === 'tram') {
      box(0.6, 3, 0.6, 0, -1.5, 0, 0x3a3f46);                  // hanger
      box(2.4, 0.8, 5, 0, -0.4, 0, 0x50565e);                  // carriage
      box(4.2, 3.2, 7.4, 0, -4.6, 0, 0xb3221d);                // cabin
      box(4.25, 1.2, 7.45, 0, -4.1, 0, 0x26313d);              // windows
      box(4.3, 0.3, 7.5, 0, -6.15, 0, 0x5f1210);
    } else if (model === 'tbar') {
      box(0.06, 2.3, 0.06, 0, -1.15, 0, 0x8a9099);             // spring box + rod
      box(0.18, 0.5, 0.18, 0, -0.25, 0, 0x2b2f35);
      box(1.1, 0.08, 0.08, 0, -2.3, 0, 0x2b2f35);              // the T
    }
    const geo = THREE.BufferGeometryUtils.mergeBufferGeometries(parts.map((g) => g.toNonIndexed()));
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
    for (const m of ['chair2', 'chair4', 'chair6', 'gondola', 'tram', 'tbar']) {
      const im = new THREE.InstancedMesh(this.carrierGeometry(m), mat, m === 'tram' ? 64 : 5000);
      im.count = 0; im.frustumCulled = false; scene.add(im); meshes[m] = im;
    }
    const bub = new THREE.InstancedMesh(this.bubbleGeometry(), this.M.glassy, 5000);
    bub.count = 0; bub.frustumCulled = false; scene.add(bub); meshes.bubble = bub;
    return meshes;
  },

  build(l) {
    this.initAssets();
    const T = l.T, a = l.a, b = l.b, g = new THREE.Group(), M = this.M, G = this.G;
    const P = this.profile(T, a, a.y, b, b.y, l.customTowers || null);
    const { hl, ux, uz, px, pz, prof, ground } = P;
    l.profileP = P;
    l.issues = l.customTowers ? this.inspect(T, P, a).issues : [];   // automatic layouts are certified
    const rotY = Math.atan2(ux, uz);
    l.towers = P.towers;
    l.quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    l.quatDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY + Math.PI);
    l.dir = { ux, uz, px, pz };
    const mesh = (geo, mat, x, y, z, sx, sy, sz, ry = rotY) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; g.add(m); return m;
    };
    const at = (s) => ({ x: a.x + ux * s, z: a.z + uz * s });

    if (T.kind === 'belt') {
      const line = this.groundLine(P, a, 0, 0);
      const belt = makeRibbon(line, 0x2a2d31, 1, 2.4 * CS);
      belt.material.depthWrite = true; belt.material.transparent = false;
      g.add(belt);
      mesh(G.box, M.station.carpet, a.x - ux * 6, a.y + 2, a.z - uz * 6, 6, 4, 5);   // operator hut
      l.upPath = new Path(line.map((p) => ({ ...p, y: p.y + 0.5 })));
      l.downPath = l.upPath;
      l.vis = g;
      return;
    }

    // towers
    for (let i = 1; i < prof.length - 1; i++) {
      const { x, z } = at(prof[i].s), gy = ground(prof[i].s), top = prof[i].y;
      if (T.kind === 'tram') {
        mesh(G.pylon, M.steel, x, gy - 2, z, 2.2, top - gy + 6, 2.2);
        mesh(G.box, M.steel, x, top + 3, z, T.gauge * 2 + 6, 2, 3);
      } else if (T.kind === 'surface') {
        mesh(G.pole, M.steel, x, gy - 1, z, 1.1, top - gy + 1.5, 1.1);
        mesh(G.box, M.steel, x + px * T.gauge / 2, top + 0.3, z + pz * T.gauge / 2, T.gauge + 1, 0.4, 0.4);
      } else {
        const r = T.towerH > 20 ? 2.6 : 2;
        mesh(G.pole, M.steel, x, gy - 1, z, r, top - gy + 3, r);
        mesh(G.box, M.steel, x, top + 2, z, T.gauge * 2 + 2.5, 1.1, 1.1);
        for (const sgn of [1, -1]) mesh(G.box, M.dark, x + px * T.gauge * sgn, top + 0.8, z + pz * T.gauge * sgn, 1, 1.3, 8);
      }
    }

    // terminals: bottom = drive station, top = return station
    for (const [n, s, drive] of [[a, 0, true], [b, hl, false]]) {
      const { x, z } = at(s), cableY = n.y + T.towerH;
      const back = drive ? -1 : 1;                       // the bullwheel sits at the outer end
      if (T.kind === 'tram') {
        mesh(G.box, M.concrete, x + ux * back * 14, n.y + T.towerH / 2, z + uz * back * 14, T.gauge * 2 + 24, T.towerH + 8, 48);
        mesh(G.box, M.station.tram, x + ux * back * 14, n.y + T.towerH + 5, z + uz * back * 14, T.gauge * 2 + 28, 4, 52);
      } else if (T.kind === 'surface') {
        mesh(G.wheel, M.wheel, x + ux * back * 2, cableY, z + uz * back * 2, T.gauge, 1, T.gauge, 0);
        mesh(G.pole, M.steel, x + ux * back * 2, n.y - 1, z + uz * back * 2, 1, T.towerH + 1, 1);
        if (drive) mesh(G.box, M.station.tbar, x - ux * 10 - px * 14, n.y + 4, z - uz * 10 - pz * 14, 11, 8, 9);
      } else {
        const wx = x + ux * back * 3, wz = z + uz * back * 3;
        mesh(G.wheel, M.wheel, wx, cableY + 0.5, wz, T.gauge, 1, T.gauge, 0);       // bullwheel
        if (l.type === 'chair2') {
          mesh(G.pole, M.steel, wx, n.y - 1, wz, 2.4, T.towerH + 1.5, 2.4);
          mesh(G.box, M.roof, wx, cableY + 3, wz, T.gauge * 2 + 6, 1.5, 11);
        } else {                                          // detachable/gondola terminal building
          const len = T.model === 'gondola' ? 52 : 40;
          const cx = x + ux * back * (len / 2 - 6), cz = z + uz * back * (len / 2 - 6);
          mesh(G.box, M.station[l.type], cx, cableY + 4, cz, T.gauge * 2 + 12, 7, len);
          mesh(G.box, M.roof, cx, cableY + 8, cz, T.gauge * 2 + 15, 1.5, len + 4);
          for (const sgn of [1, -1]) {
            mesh(G.pole, M.concrete, cx + px * (T.gauge + 5) * sgn, n.y - 1, cz + pz * (T.gauge + 5) * sgn, 2.6, cableY - n.y + 2, 2.6);
          }
          if (drive) mesh(G.box, M.concrete, cx - ux * 6, n.y + 4, cz - uz * 6, T.gauge * 2 + 10, 8, 18);
        }
      }
    }

    const up = this.ropeLine(P, a, 1, T.gauge), down = this.ropeLine(P, a, -1, T.gauge).reverse();
    for (const line of [up, down]) {
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line.map((p) => new THREE.Vector3(p.x, p.y, p.z))), M.cable));
    }
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
  },

  dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry && !this.shared.has(o.geometry)) o.geometry.dispose();
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
