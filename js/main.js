'use strict';
const $ = (s) => document.querySelector(s);

const UI = {
  toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  },
  daySummary(st) {
    const avg = st.left ? st.happySum / st.left : 0;
    $('#summary-body').innerHTML = `
      <div class="row"><span>Visitors</span><b>${fmt(st.visitors)}</b></div>
      <div class="row"><span>Ticket sales</span><b class="pos">${money(st.revenue)}</b></div>
      <div class="row"><span>Operating costs</span><b class="neg">${money(-st.ops)}</b></div>
      <div class="row"><span>Construction</span><b class="neg">${money(-st.built)}</b></div>
      <div class="row"><span>Average happiness</span><b>${Math.round(avg)}%</b></div>
      <div class="row"><span>Unhappy guests</span><b>${fmt(st.angry)}</b></div>
      <div class="row"><span>Stranded at dead ends</span><b>${fmt(st.stranded)}</b></div>
      <div class="row"><span>Reputation</span><b>${Math.round(Game.rep)}%</b></div>`;
    $('#summary-title').textContent = `Day ${Game.day} is over`;
    $('#summary').hidden = false;
  },
};

const App = {
  tool: 'select', draft: null, hover: null, preview: null,

  init() {
    const menu = $('#resorts');
    for (const key of Object.keys(window.SKI_MAPS)) {
      const m = window.SKI_MAPS[key];
      const top = m.places.filter((p) => p.kind === 'peak').sort((a, b) => b.elev - a.elev)[0];
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML = `<span class="card-name">${m.name}</span><span class="card-region">${m.region}</span>
        <span class="card-meta">▲ ${top.name} ${top.elev} m · ${((m.w * m.cell) / 1000).toFixed(1)} × ${((m.h * m.cell) / 1000).toFixed(1)} km of real terrain</span>`;
      b.onclick = () => this.start(key);
      menu.appendChild(b);
    }
  },

  start(key) {
    const map = window.SKI_MAPS[key];
    $('#menu').hidden = true; $('#hud').hidden = false;
    Terrain.load(map);

    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    $('#view').appendChild(renderer.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb9d2ec);
    scene.fog = new THREE.Fog(0xb9d2ec, 12000, 30000);
    this.hemi = new THREE.HemisphereLight(0xe6f1ff, 0x7d828c, 0.7);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 0.85);
    scene.add(this.hemi, this.sun);

    scene.add(Terrain.buildMesh(), Terrain.buildSkirt(), Terrain.buildTrees());
    Labels.init($('#labels'));
    for (const p of map.places) {
      if (p.kind === 'base') continue;
      const ico = p.kind === 'peak' ? '▲' : p.kind === 'lake' ? '◆' : '•';
      Labels.add(`<span class="ico">${ico}</span>${p.name}<small>${p.elev} m</small>`, 'place ' + p.kind,
        { x: p.x, y: Terrain.height(p.x, p.z) + 30, z: p.z });
    }
    Game.init(map, scene);

    // camera: look from below the lowest lodge up toward the highest peak
    const camera = this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 5, 60000);
    const peak = map.places.filter((p) => p.kind === 'peak').sort((a, b) => b.elev - a.elev)[0];
    const base = map.places.filter((p) => p.kind === 'base').sort((a, b) => a.elev - b.elev)[0];
    let dx = base.x - peak.x, dz = base.z - peak.z; const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
    const tx = (peak.x + base.x) / 2, tz = (peak.z + base.z) / 2, ty = Terrain.height(tx, tz);
    camera.position.set(tx + dx * 5200, ty + 3400, tz + dz * 5200);
    const controls = this.controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(tx, ty, tz);
    controls.enableDamping = true; controls.dampingFactor = 0.12;
    controls.maxPolarAngle = 1.42; controls.minDistance = 250; controls.maxDistance = 16000;
    controls.screenSpacePanning = false;
    controls.update();

    const ringGeo = new THREE.RingGeometry(14, 20, 32).rotateX(-Math.PI / 2);
    this.cursor = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    this.cursor.renderOrder = 10; scene.add(this.cursor);
    this.snapRing = new THREE.Mesh(new THREE.RingGeometry(SNAP - 8, SNAP, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x3dff9a, depthTest: false, transparent: true, opacity: 0.8 }));
    this.snapRing.renderOrder = 10; scene.add(this.snapRing);
    this.liftLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.liftLine.renderOrder = 11; this.liftLine.visible = false; scene.add(this.liftLine);

    this.bindInput();
    $('#resort-name').textContent = map.name;
    this.setTool('select');
    this.last = performance.now();
    this.hudTimer = 0;
    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
    });
    UI.toast('Build a lift from a lodge (⌂) up the mountain, then draw a run back down to open the resort.');
    requestAnimationFrame(() => this.loop());
  },

  // ---------- input ----------
  bindInput() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
    el.addEventListener('pointerup', (e) => {
      if (down && down.b === 0 && e.button === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) this.click();
      down = null;
    });
    el.addEventListener('pointermove', (e) => { this.mouse = { x: e.clientX, y: e.clientY }; this.updateHover(); });
    el.addEventListener('pointerleave', () => { this.mouse = null; this.updateHover(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => this.setTool(b.dataset.tool);
    for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => this.setSpeed(+b.dataset.speed);
    $('#next-day').onclick = () => { $('#summary').hidden = true; Game.nextDay(); };
    $('#to-menu').onclick = () => location.reload();
    $('#finish-run').onclick = () => this.finishRun();

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const keys = { '1': 'select', '2': 'chair', '3': 'gondola', '4': 'run', '5': 'bulldoze' };
      if (keys[e.key]) this.setTool(keys[e.key]);
      else if (e.key === 'Escape') this.setTool(this.tool === 'select' ? 'select' : this.tool);
      else if (e.key === 'Enter') this.finishRun();
      else if (e.key === 'Backspace' && this.draft && this.draft.pts) { this.draft.pts.pop(); this.updateHover(); e.preventDefault(); }
      else if (e.key === ' ') { this.setSpeed(Game.paused ? Game.speed : 0); e.preventDefault(); }
    });
  },

  setTool(t) {
    this.tool = t;
    this.draft = t === 'chair' || t === 'gondola' ? { a: null } : t === 'run' ? { pts: [] } : null;
    for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === t);
    this.clearPreview();
    this.updateHover();
  },

  setSpeed(s) {
    if (s === 0) Game.paused = true; else { Game.paused = false; Game.speed = s; }
    for (const b of document.querySelectorAll('[data-speed]')) {
      b.classList.toggle('active', Game.paused ? b.dataset.speed === '0' : +b.dataset.speed === Game.speed);
    }
  },

  pickTerrain() {
    if (!this.mouse) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((this.mouse.x - r.left) / r.width) * 2 - 1, -((this.mouse.y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    let prev = 0;
    for (let t = 0; t < 60000;) {
      const step = Math.max(4, t * 0.004);
      t += step;
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (!Terrain.inside(x, z)) { prev = t; continue; }
      if (y < Terrain.height(x, z)) {
        let lo = prev, hi = t;
        for (let i = 0; i < 18; i++) {
          const m = (lo + hi) / 2, mx = o.x + d.x * m, mz = o.z + d.z * m;
          if (o.y + d.y * m < Terrain.height(mx, mz)) hi = m; else lo = m;
        }
        const hx = o.x + d.x * hi, hz = o.z + d.z * hi;
        return { x: hx, z: hz, y: Terrain.height(hx, hz) };
      }
      prev = t;
    }
    return null;
  },

  updateHover() {
    if (!this.camera) return;
    const hit = this.pickTerrain();
    const building = this.tool === 'chair' || this.tool === 'gondola' || this.tool === 'run';
    this.hover = null; this.snapRing.visible = false; this.cursor.visible = !!hit;
    $('#tooltip').hidden = true;
    if (hit) {
      const node = building ? Net.nearestNode(hit.x, hit.z) : null;
      this.hover = node ? { x: node.x, z: node.z, y: node.y, node } : hit;
      this.cursor.position.set(hit.x, hit.y + 3, hit.z);
      if (node) { this.snapRing.visible = true; this.snapRing.position.set(node.x, node.y + 3, node.z); }
      if (this.tool === 'select' || this.tool === 'bulldoze') this.showTooltip(Net.edgeNear(hit.x, hit.z));
    }
    this.updatePreview();
  },

  showTooltip(e) {
    const tt = $('#tooltip');
    if (!e || !this.mouse) return;
    if (e.kind === 'lift') {
      tt.innerHTML = `<b>${e.name} · ${e.T.name}</b><br>${fmt(e.len)} m long · climbs ${fmt(e.vert)} m<br>
        ${fmt((e.T.seats / e.T.interval) * 3600)} skiers/h · queue ${e.queue.length}`;
    } else {
      tt.innerHTML = `<b style="color:${e.diff === 2 ? '#fff' : DIFF[e.diff].css}">${e.name} · ${DIFF[e.diff].name}</b><br>
        ${(e.len / 1000).toFixed(2)} km · drop ${fmt(e.drop)} m<br>steepest ${Math.round(e.maxG * 100)}%`;
    }
    if (this.tool === 'bulldoze') tt.innerHTML += `<br><span class="neg">Click to remove · refund ${money(e.cost / 2)}</span>`;
    tt.style.left = this.mouse.x + 16 + 'px'; tt.style.top = this.mouse.y + 16 + 'px';
    tt.hidden = false;
  },

  clearPreview() {
    if (this.preview) { this.scene.remove(this.preview); this.preview.geometry.dispose(); this.preview.material.dispose(); this.preview = null; }
    if (this.liftLine) this.liftLine.visible = false;
  },

  updatePreview() {
    this.clearPreview();
    const h = this.hover, t = this.tool, d = this.draft;
    let hint = '';
    const at = h ? `<span class="dim">${Math.round(Terrain.elev(h.y))} m · slope ${Math.round(Terrain.slope(h.x, h.z) * 100)}%</span>` : '';
    $('#finish-run').hidden = true;
    if (t === 'select') hint = 'Drag to rotate · right-drag to pan · scroll to zoom. Pick a tool to build.';
    else if (t === 'bulldoze') hint = 'Click a lift or run to remove it (50% refund).';
    else if (t === 'chair' || t === 'gondola') {
      const T = LIFT_TYPES[t];
      if (!d.a) hint = `Click the bottom station of the ${T.name.toLowerCase()} — snap to a lodge or a run end.`;
      else if (h) {
        const plan = Net.liftPlan(t, d.a, h);
        const ya = Net.pointY(d.a), yb = h.y;
        const pos = this.liftLine.geometry.attributes.position;
        pos.setXYZ(0, d.a.x, ya + T.towerH, d.a.z); pos.setXYZ(1, h.x, yb + T.towerH, h.z); pos.needsUpdate = true;
        this.liftLine.geometry.computeBoundingSphere();
        this.liftLine.material.color.set(plan.ok ? 0x3dff9a : 0xff4d4d);
        this.liftLine.visible = true;
        hint = `${fmt(plan.len)} m · climbs ${fmt(plan.vert)} m · <b>${money(plan.cost)}</b>` +
          (plan.ok ? ' — click to build' : ` — <span class="neg">${plan.msg}</span>`) + ' · Esc to cancel';
      }
    } else if (t === 'run') {
      const pts = h ? [...d.pts, h] : d.pts;
      if (!d.pts.length) hint = 'Click the top of the run (snap to a lift top), then click points down the slope.';
      else if (pts.length >= 2) {
        const plan = Net.runPlan(pts);
        if (plan.dense) {
          this.preview = makeRibbon(plan.dense, plan.ok ? DIFF[plan.diff].color : 0xff4d4d, 0.45);
          this.scene.add(this.preview);
          hint = `<b style="color:${DIFF[plan.diff].css === '#18181c' ? '#fff' : DIFF[plan.diff].css}">${DIFF[plan.diff].name}</b> · ${(plan.len / 1000).toFixed(2)} km · drop ${fmt(plan.drop)} m · steepest ${Math.round(plan.maxG * 100)}% · <b>${money(plan.cost)}</b>` +
            (plan.ok ? '' : ` — <span class="neg">${plan.msg}</span>`) +
            '<br><span class="dim">Click to add points · Enter or click a lift/lodge to finish · Backspace undo · Esc cancel</span>';
        }
        $('#finish-run').hidden = d.pts.length < 2;
      }
    }
    $('#hint').innerHTML = hint + (at ? ' ' + at : '');
  },

  click() {
    const h = this.hover, t = this.tool, d = this.draft;
    if (t === 'bulldoze') {
      const e = h && Net.edgeNear(h.x, h.z);
      if (e) { Net.remove(e); UI.toast(`Removed ${e.name}`); }
    } else if ((t === 'chair' || t === 'gondola') && h) {
      if (!d.a) d.a = { ...h };
      else {
        const plan = Net.liftPlan(t, d.a, h);
        if (!plan.ok) return UI.toast(plan.msg);
        const l = Net.buildLift(plan);
        UI.toast(`${l.name} ${l.T.name} built for ${money(plan.cost)}`);
        this.draft = { a: null };
      }
    } else if (t === 'run' && h) {
      const last = d.pts[d.pts.length - 1];
      if (last && Math.hypot(last.x - h.x, last.z - h.z) < 15) return;
      d.pts.push({ ...h });
      if (d.pts.length >= 2 && h.node && h.node !== d.pts[0].node) return this.finishRun();
    }
    this.updateHover();
  },

  finishRun() {
    const d = this.draft;
    if (this.tool !== 'run' || !d || d.pts.length < 2) return;
    const plan = Net.runPlan(d.pts);
    if (!plan.ok) { d.pts.pop(); this.updateHover(); return UI.toast(plan.msg); }
    const r = Net.buildRun(plan);
    UI.toast(`${r.name} (${DIFF[r.diff].name}) built for ${money(plan.cost)}`);
    this.draft = { pts: [] };
    this.updateHover();
  },

  // ---------- loop ----------
  loop() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    Game.update(dt);
    Game.render();
    // sun follows the time of day
    const f = clamp((Game.time - DAY_START) / (DAY_END - DAY_START), 0, 1), ang = Math.PI * (0.15 + 0.7 * f);
    this.sun.position.set(Math.cos(ang) * 10000 + Terrain.W / 2, Math.sin(ang) * 7000 + 2000, Terrain.D / 2 + 6000);
    this.sun.target.position.set(Terrain.W / 2, 0, Terrain.D / 2); this.sun.target.updateMatrixWorld();
    this.sun.intensity = 0.55 + 0.4 * Math.sin(Math.PI * f);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    Labels.update(this.camera, innerWidth, innerHeight);
    if ((this.hudTimer -= dt) <= 0) { this.hudTimer = 0.25; this.updateHud(); }
    requestAnimationFrame(() => this.loop());
  },

  updateHud() {
    const hh = Math.floor(Game.time / 3600), mm = Math.floor((Game.time % 3600) / 60);
    $('#money').textContent = money(Game.money);
    $('#money').classList.toggle('neg', Game.money < 0);
    $('#clock').textContent = `Day ${Game.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    $('#guests').textContent = fmt(Game.skiers.length);
    const a = Game.avgHappy();
    $('#happy').textContent = a === null ? '—' : `${a > 70 ? '😀' : a > 45 ? '🙂' : '😟'} ${Math.round(a)}%`;
    $('#rep').textContent = `${Math.round(Game.rep)}%`;
    $('#status').textContent = Game.open ? (Game.time < LAST_ARRIVAL ? `${Math.round(Game.demandPerHour())} arrivals/h` : 'Ticket office closed') : 'Closed — build a lift and a run';
    for (const l of Net.lifts) {
      const q = l.queue.length;
      l.label.show(q > 0);
      if (q) { l.label.set(`${l.name} · ${q}`); l.label.el.classList.toggle('long', q > l.T.seats * 25); }
    }
  },
};

addEventListener('DOMContentLoaded', () => App.init());
