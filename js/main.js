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
      <div class="row"><span>Refunds (nothing to ski)</span><b>${fmt(st.refunds || 0)}</b></div>
      <div class="row"><span>Operating costs</span><b class="neg">${money(-st.ops)}</b></div>
      <div class="row"><span>Construction</span><b class="neg">${money(-st.built)}</b></div>
      <div class="row"><span>Average happiness</span><b>${Math.round(avg)}%</b></div>
      <div class="row"><span>Unhappy guests</span><b>${fmt(st.angry)}</b></div>
      <div class="row"><span>Stranded at dead ends</span><b>${fmt(st.stranded)}</b></div>
      <div class="row"><span>Reputation</span><b>${Math.round(Game.rep)}%</b></div>
      <div class="row"><span>Balance</span><b class="${Game.money < 0 ? 'neg' : ''}">${money(Game.money)}</b></div>` +
      UI.dangers().map((d) => `<p class="danger">${d}</p>`).join('');
    $('#summary-title').textContent = `Day ${Game.day} is over`;
    $('#summary').hidden = false;
  },
  dangers() {
    const out = [];
    if (Game.money < 0) {
      const left = DEBT_DAYS - Game.debtDays;
      out.push(`⚠ You're in debt. Get back above €0 within ${left} day${left === 1 ? '' : 's'}, or go below ${money(-MAX_DEBT)}, and the resort goes bankrupt.`);
    }
    if (Game.rep < MIN_REP + 15) out.push(`⚠ Reputation is ${Math.round(Game.rep)}%. Below ${MIN_REP}% at the end of a day, the resort closes for good.`);
    return out;
  },
  gameOver(reason, st) {
    $('#over-reason').textContent = reason;
    $('#over-body').innerHTML = `
      <div class="row"><span>Days survived</span><b>${Game.day}</b></div>
      <div class="row"><span>Lifts / runs built</span><b>${Net.lifts.length} / ${Net.runs.length}</b></div>
      <div class="row"><span>Final balance</span><b class="neg">${money(Game.money)}</b></div>
      <div class="row"><span>Best on this mountain</span><b>${(Save.best(Game.map.key) || { days: Game.day }).days} days</b></div>`;
    $('#gameover').hidden = false;
  },
};

const App = {
  tool: 'select', draft: null, hover: null, preview: null, liftType: 'chair4', panelLift: null,
  grading: false, holdAngle: false, gradeDeg: 13, manualPylons: false, edit: null,

  init() {
    const menu = $('#resorts');
    for (const key of Object.keys(window.SKI_MAPS)) {
      const m = window.SKI_MAPS[key];
      const top = m.places.filter((p) => p.kind === 'peak').sort((a, b) => b.elev - a.elev)[0];
      const save = Save.read(key), best = Save.best(key);
      const b = document.createElement('div');
      b.className = 'card';
      b.innerHTML = `<span class="card-name">${m.name}</span><span class="card-region">${m.region}</span>
        <span class="card-meta">▲ ${top.name} ${top.elev} m · ${((m.w * m.cell) / 1000).toFixed(1)} × ${((m.h * m.cell) / 1000).toFixed(1)} km of real terrain` +
        (best ? ` · best: ${best.days} days` : '') + `</span>
        <span class="card-actions">` +
        (save ? `<button class="primary" data-act="continue">Continue · Day ${save.day} · ${money(save.money)}</button>` : '') +
        `<button class="${save ? '' : 'primary'}" data-act="new">New game</button></span>`;
      b.querySelector('[data-act="new"]').onclick = () => {
        if (save && !b.classList.contains('confirm')) {
          b.classList.add('confirm');
          b.querySelector('[data-act="new"]').textContent = 'Overwrite save? Click again';
          return;
        }
        Save.clear(key); this.start(key, null);
      };
      if (save) b.querySelector('[data-act="continue"]').onclick = () => this.start(key, save);
      menu.appendChild(b);
    }
  },

  start(key, save) {
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
    if (save) Game.restore(save);

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
    this.joinRing = new THREE.Mesh(new THREE.RingGeometry(RUN_WIDTH / 2 + 2, RUN_WIDTH / 2 + 9, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x35e0ff, depthTest: false, transparent: true, opacity: 0.9 }));
    this.joinRing.renderOrder = 10; this.joinRing.visible = false; scene.add(this.joinRing);
    this.liftLine = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.liftLine.renderOrder = 11; this.liftLine.visible = false; scene.add(this.liftLine);

    this.brush = 45;
    this.brushRing = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffc94d, depthTest: false, transparent: true, opacity: 0.9 }));
    this.brushRing.scale.setScalar(this.brush); this.brushRing.renderOrder = 10; this.brushRing.visible = false;
    scene.add(this.brushRing);
    this.steepPos = { x: 0, y: 0, z: 0 };
    this.steepLabel = Labels.add('', 'steep', this.steepPos); this.steepLabel.show(false);

    this.bindInput();
    this.bindLiftPanel();
    this.bindPylonPanel();
    this.bindRunOptions();
    let contours = false;
    try { contours = localStorage.getItem('skiresort.contours') === '1'; } catch { /* ignore */ }
    this.toggleContours(contours);
    this.buildLiftPicker();
    $('#resort-name').textContent = map.name;
    this.setTool('select');
    this.last = performance.now();
    this.hudTimer = 0;
    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
    });
    if (save) UI.toast(`Welcome back: day ${Game.day}, ${money(Game.money)}.`);
    else UI.toast('Build a lift from a lodge (⌂) up the mountain, then draw a run back down to open the resort.');
    setInterval(() => Save.write(), 20000);
    addEventListener('beforeunload', () => Save.write());
    requestAnimationFrame(() => this.loop());
  },

  // ---------- input ----------
  bindInput() {
    const el = this.renderer.domElement;
    let down = null;
    // capture phase: runs before OrbitControls, so a drawing stroke can switch the camera off
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, b: e.button, moved: false };
      this.mouse = { x: e.clientX, y: e.clientY }; this.updateHover();
      if (e.button === 0 && this.tool === 'pylons' && this.edit && this.edit.hover != null) {
        this.edit.sel = this.edit.hover; this.stroke = { pylon: this.edit.hover }; this.controls.enabled = false; this.drawPylonOverlay();
      } else if (e.button === 0 && (this.tool === 'run' || this.tool === 'cut') && this.hover) {
        this.stroke = { cut: 0, last: null }; this.controls.enabled = false;
      }
    }, true);
    el.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      this.updateHover();
      if (down && this.stroke) {
        if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
        if (down.moved) this.strokeMove();
      }
    });
    addEventListener('pointerup', (e) => {
      if (!down) return;
      const click = down.b === 0 && e.button === 0 && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6;
      if (this.stroke) { this.controls.enabled = true; if (down.moved) this.strokeEnd(); else this.click(); this.stroke = null; }
      else if (click) this.click();
      down = null;
    });
    el.addEventListener('pointerleave', () => { this.mouse = null; this.updateHover(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => this.setTool(b.dataset.tool);
    for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => this.setSpeed(+b.dataset.speed);
    $('#next-day').onclick = () => { $('#summary').hidden = true; Game.nextDay(); Save.write(); };
    $('#retry').onclick = () => { Save.clear(Game.map.key); location.search = '?new=' + Game.map.key; };
    $('#over-menu').onclick = () => location.replace(location.pathname);
    $('#to-menu').onclick = () => { Save.write(); location.replace(location.pathname); };
    $('#finish-run').onclick = () => this.finishRun();
    $('#contours').onclick = () => this.toggleContours();
    $('#earthworks').onclick = () => this.toggleEarthworks();
    $('#grade-it').onclick = () => { this.grading = true; this.syncRunOptions(); };

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      if (this.tool === 'pylons' && this.edit) {
        const ed = this.edit, T = ed.l.T;
        if ((e.key === '+' || e.key === '=' || e.key === '-') && ed.sel != null) {
          const t = ed.towers[ed.sel], step = (e.shiftKey ? 5 : 1) * (e.key === '-' ? -1 : 1);
          t.h = clamp(t.h + step, this.minPylon(T), T.maxTowerH); this.applyPylons(); e.preventDefault(); return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && ed.sel != null) { this.removePylon(); e.preventDefault(); return; }
        if (e.key === 'Escape') { ed.sel = null; this.applyPylons(); return; }
        if (e.key === 'Enter') { this.finishPylons(); return; }
      }
      const keys = { '1': 'select', '2': 'lift', '3': 'run', '4': 'cut', '5': 'bulldoze' };
      if (keys[e.key]) this.setTool(keys[e.key]);
      else if (e.key === '[' || e.key === ']') {
        this.brush = clamp(this.brush + (e.key === ']' ? 10 : -10), 20, 120);
        this.brushRing.scale.setScalar(this.brush); this.updateHover();
      }
      else if (e.key === 'Escape') this.setTool(this.tool === 'select' ? 'select' : this.tool);
      else if (e.key === 'Enter') this.finishRun();
      else if (e.key === 'Backspace' && this.draft && this.draft.pts) { this.draft.pts.pop(); this.updateHover(); e.preventDefault(); }
      else if (e.key === 'h' || e.key === 'H') this.toggleContours();
      else if (e.key === ' ') { this.setSpeed(Game.paused ? Game.speed : 0); e.preventDefault(); }
    });
  },

  setTool(t) {
    if (this.edit && t !== 'pylons') this.cancelPylons();
    this.tool = t;
    this.draft = t === 'lift' ? { a: null } : t === 'run' ? { pts: [] } : null;
    $('#lift-types').hidden = t !== 'lift';
    $('#run-options').hidden = t !== 'run';
    $('#pylon-panel').hidden = t !== 'pylons';
    for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === t);
    const drawing = t === 'run' || t === 'cut';
    Terrain.showSlopeMap(t === 'run');
    this.controls.mouseButtons.RIGHT = drawing ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    $('#slope-legend').hidden = t !== 'run';
    this.clearPreview();
    this.clearEarthPreview();
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
    const building = this.tool === 'lift' || this.tool === 'run';
    this.hover = null; this.snapRing.visible = false; this.joinRing.visible = false; this.cursor.visible = !!hit;
    $('#tooltip').hidden = true;
    if (hit) {
      const node = building ? Net.nearestNode(hit.x, hit.z) : null;
      const junction = building && !node ? Net.nearestRunPoint(hit.x, hit.z) : null;
      this.hover = node ? { x: node.x, z: node.z, y: node.y, node }
        : junction ? { x: junction.x, z: junction.z, y: junction.y, junction } : hit;
      this.cursor.position.set(hit.x, hit.y + 3, hit.z);
      if (node) { this.snapRing.visible = true; this.snapRing.position.set(node.x, node.y + 3, node.z); }
      this.joinRing.visible = !!junction;
      if (junction) this.joinRing.position.set(junction.x, junction.y + 3, junction.z);
      if (this.tool === 'select' || this.tool === 'bulldoze') this.showTooltip(Net.edgeNear(hit.x, hit.z));
    }
    if (this.tool === 'pylons' && this.edit) this.hoverPylons(hit);
    this.brushRing.visible = !!hit && this.tool === 'cut';
    if (this.brushRing.visible) this.brushRing.position.set(hit.x, hit.y + 4, hit.z);
    this.updatePreview();
  },

  showTooltip(e) {
    const tt = $('#tooltip');
    if (!e || !this.mouse) return;
    if (e.kind === 'lift') {
      tt.innerHTML = `<b>${e.name} · ${e.T.name}</b>${e.opt.open ? '' : ' <span class="neg">CLOSED</span>'}${e.issues && e.issues.length ? ' <span class="neg">⚠ failed inspection</span>' : ''}<br>
        ${fmt(e.len)} m long · climbs ${fmt(e.vert)} m · ${e.towers} towers<br>
        ${fmt(Lifts.capacity(e))} skiers/h · ride ${(Lifts.rideTime(e) / 60).toFixed(1)} min<br>
        queue ${e.queue.length}${e.queue.length ? ` · wait ~${Math.round(Lifts.waitTime(e) / 60)} min` : ''}` +
        (this.tool === 'select' ? '<br><span class="dim">Click for options</span>' : '');
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
    if (this.steepLabel) this.steepLabel.show(false);
  },

  updatePreview() {
    this.clearPreview();
    const h = this.hover, t = this.tool, d = this.draft;
    let hint = '';
    const at = h ? `<span class="dim">${Math.round(Terrain.elev(h.y))} m · slope ${Math.round(Terrain.slope(h.x, h.z) * 100)}%</span>` : '';
    $('#finish-run').hidden = true;
    $('#grade-it').hidden = true;
    if (t === 'select') hint = 'Drag to rotate · right-drag to pan · scroll to zoom · click a lift for its options.';
    else if (t === 'bulldoze') hint = 'Click a lift or run to remove it (50% refund).';
    else if (t === 'pylons' && this.edit) {
      const e = this.edit;
      hint = e.hover != null ? 'Drag to move this pylon along the line · click to select it'
        : e.ghost != null ? `Click to add a pylon here (${money(Lifts.towerPrice(e.l.T, e.l.T.towerH))})`
        : 'Point at the lift line to add a pylon · drag pylons to move them · <b>+ / −</b> height (Shift = 5 m) · <b>Del</b> removes · <b>Enter</b> done';
    }
    else if (t === 'cut') {
      const n = h ? Terrain.treesNear([h], this.brush).length : 0;
      hint = `Click or drag to fell trees · ${n} under the brush · <b>${money(n * TREE_COST)}</b> · <span class="dim">[ ] brush size · right-drag to rotate</span>` +
        `<br><span class="dim">Forest left: ${Math.round(Game.forestLeft() * 100)}%. Clear more than 10% and the views suffer, so fewer visitors come.</span>`;
    }
    else if (t === 'lift') {
      const T = LIFT_TYPES[this.liftType];
      if (!d.a) hint = `<b>${T.name}</b>: click the bottom station, snapping to a lodge or run end. Pick another type on the right.`;
      else if (h) {
        const plan = Net.liftPlan(this.liftType, d.a, h, false, this.manualPylons);
        const pa = plan.a, pb = plan.b;
        const { pts } = Lifts.previewGeometry(T, pa, Net.pointY(pa), pb, Net.pointY(pb), plan.manual ? [] : null);
        this.liftLine.geometry.dispose();
        this.liftLine.geometry = new THREE.BufferGeometry();
        this.liftLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        this.liftLine.material.color.set(plan.ok ? 0x3dff9a : 0xff4d4d);
        this.liftLine.visible = true;
        const cap = (T.seats / (T.kind === 'tram' ? 2 * (plan.len / T.speed + T.dwell) : T.interval)) * 3600;
        hint = `${fmt(plan.len)} m · climbs ${fmt(plan.vert)} m · ${plan.towers} towers · ${fmt(cap)} skiers/h · ride ${(plan.len / T.speed / 60).toFixed(1)} min · <b>${money(plan.cost)}</b>` +
          (plan.trees ? ` <span class="dim">(incl. ${plan.trees} trees to fell)</span>` : '') +
          (plan.ok ? ' — click to build' : ` — <span class="neg">${plan.msg}</span>`) + ' · Esc to cancel';
      }
    } else if (t === 'run') {
      const pts = h ? (this.holdAngle && d.pts.length ? this.heldPath(d.pts, h) : [...d.pts, h]) : d.pts;
      if (!d.pts.length) hint = h && h.junction
        ? `Start here to <b>branch off ${h.junction.run.name}</b>. Skiers can choose either way at the junction.`
        : 'Drag from a lift top, or from the middle of a piste to branch off, down the slope. The map shows the steepness. <span class="dim">Right-drag to rotate.</span>';
      else if (pts.length >= 2) {
        const plan = Net.runPlan(pts, false, this.grade());
        if (plan.dense) {
          this.preview = makeRibbon(plan.dense, null, 0.7, plan.gradeDeg ? GRADE_HALF * 2 : RUN_WIDTH, plan.colors, !!plan.gradeDeg);
          if (plan.gradeDeg) { this.preview.material.depthTest = false; this.preview.renderOrder = 9; }
          this.scene.add(this.preview);
          const sp = plan.dense[plan.steepAt];
          Object.assign(this.steepPos, { x: sp.x, y: sp.y + 30, z: sp.z });
          this.steepLabel.set(`steepest ${Math.round(plan.maxG * 100)}%`); this.steepLabel.show(plan.maxG > 0.05);
          hint = `<b style="color:${DIFF[plan.diff].css === '#18181c' ? '#fff' : DIFF[plan.diff].css}">${DIFF[plan.diff].name}</b> · ${(plan.len / 1000).toFixed(2)} km · drop ${fmt(plan.drop)} m · steepest ${Math.round(plan.maxG * 100)}% · <b>${money(plan.cost)}</b>` +
            (plan.trees ? ` <span class="dim">(incl. ${plan.trees} trees)</span>` : '') +
            (plan.gradeDeg ? `<br>Grading to ≤ ${plan.gradeDeg}°: ${fmt(plan.volume)} m³ of cut and fill · ${money(plan.earthCost)}` : '') +
            this.gradingNeeds(plan) +
            (this.holdAngle && pts[pts.length - 2] && pts[pts.length - 2].fallAngle ? `<br><span class="dim">Holding ${this.gradeDeg}° by heading ${Math.round(pts[pts.length - 2].fallAngle)}° off the fall line</span>` : '') +
            (plan.ok ? '' : ` — <span class="neg">${plan.msg}</span>`) +
            (h && h.junction ? `<br><b class="join">Release or click to join ${h.junction.run.name} here</b> (shortcut / merge)` : '') +
            '<br><span class="dim">Keep dragging or clicking · end on a lift, a lodge or another piste to finish, or press Enter · Backspace undo · Esc cancel</span>';
        }
        $('#finish-run').hidden = d.pts.length < 2;
        if (plan.gradeDeg && plan.dense && plan.path && plan.len) this.queueEarthPreview(plan.dense);
        else this.clearEarthPreview();
      }
    } else this.clearEarthPreview();
    $('#hint').innerHTML = hint + (at ? ' ' + at : '');
  },

  click() {
    const h = this.hover, t = this.tool, d = this.draft;
    if (t === 'bulldoze') {
      const e = h && Net.edgeNear(h.x, h.z);
      if (e) { if (e === this.panelLift) this.closeLiftPanel(); Net.remove(e); UI.toast(`Removed ${e.name}`); Save.write(); }
    } else if (t === 'pylons' && this.edit) {
      const e = this.edit;
      if (e.hover != null) e.sel = e.hover;
      else if (e.ghost != null) {
        e.towers.push({ s: e.ghost, h: e.l.T.towerH });
        e.sel = e.towers.length - 1; e.hover = e.sel; e.ghost = null;
      }
      this.applyPylons();
      return;
    } else if (t === 'select') {
      const e = h && Net.edgeNear(h.x, h.z);
      if (e && e.kind === 'lift') this.openLiftPanel(e); else this.closeLiftPanel();
    } else if (t === 'lift' && h) {
      if (!d.a) d.a = { ...h };
      else {
        const plan = Net.liftPlan(this.liftType, d.a, h, false, this.manualPylons);
        if (!plan.ok) return UI.toast(plan.msg);
        const l = Net.buildLift(plan);
        UI.toast(`${l.name} ${l.T.name} built for ${money(plan.cost)}`);
        Save.write();
        this.draft = { a: null };
        if (plan.manual) { l.awaitInspection = true; return this.openPylons(l); }
      }
    } else if (t === 'cut' && h) {
      const n = Game.cutAt(h.x, h.z, this.brush);
      if (n) { UI.toast(`Felled ${n} trees for ${money(n * TREE_COST)}`); Save.write(); }
      else if (Terrain.treesNear([h], this.brush).length) UI.toast('Not enough money');
    } else if (t === 'run' && h) {
      const last = d.pts[d.pts.length - 1];
      if (last && Math.hypot(last.x - h.x, last.z - h.z) < 15) return;
      if (this.holdAngle && d.pts.length) { d.pts = this.heldPath(d.pts, h); }
      else d.pts.push({ ...h });
      const end = d.pts[d.pts.length - 1];
      if (d.pts.length >= 2 && ((end.node && end.node !== d.pts[0].node) || end.junction)) return this.finishRun();
    }
    this.updateHover();
  },

  grade() { return this.grading ? this.gradeDeg : null; },

  // Tell the player when a run needs terraforming, and offer a one-click fix.
  gradingNeeds(plan) {
    if (plan.gradeDeg) return '';
    const out = [], target = degToGrade(this.gradeDeg);
    if (plan.cross > 0.3) out.push(`leans ${Math.round(gradeToDeg(plan.cross))}° sideways across the hill, which skiers dislike`);
    if (plan.maxG > target) out.push(`is steeper than your ${this.gradeDeg}° angle (${Math.round(gradeToDeg(plan.maxG))}° at its worst)`);
    if (!out.length) return '';
    $('#grade-it').hidden = false;
    $('#grade-it').textContent = `Terraform to ≤ ${this.gradeDeg}°`;
    return `<br><span class="warn">⚠ Terraforming needed: this run ${out.join(' and ')}.</span>`;
  },

  queueEarthPreview(dense) {
    clearTimeout(this.earthTimer);
    this.earthTimer = setTimeout(() => {
      const ew = Terrain.computeEarthwork({ pts: dense, half: GRADE_HALF, margin: GRADE_MARGIN });
      const changes = new Map(ew.ks.map((k, n) => [k, ew.dhs[n]]));
      this.clearEarthPreview(false);
      this.earthMesh = Terrain.earthOverlay(changes);
      this.scene.add(this.earthMesh);
      $('#earth-info').innerHTML = ew.ks.length
        ? `<span class="cut">■</span> cut ${fmt(ew.cut)} m³ (up to ${ew.maxCut.toFixed(1)} m deep) · <span class="fill">■</span> fill ${fmt(ew.fill)} m³ (up to ${ew.maxFill.toFixed(1)} m high)`
        : 'No earthworks needed. The ground is already within the angle.';
      $('#earth-info').hidden = false;
    }, 90);
  },
  clearEarthPreview(cancel = true) {
    if (cancel) clearTimeout(this.earthTimer);
    if (this.earthMesh) { this.scene.remove(this.earthMesh); this.earthMesh.geometry.dispose(); this.earthMesh.material.dispose(); this.earthMesh = null; }
    if (cancel) $('#earth-info').hidden = true;
  },

  toggleEarthworks(on = !this.earthOn) {
    this.earthOn = on;
    $('#earthworks').classList.toggle('active', on);
    this.refreshEarthworks();
  },
  refreshEarthworks() {
    if (this.allEarth) { this.scene.remove(this.allEarth); this.allEarth.geometry.dispose(); this.allEarth.material.dispose(); this.allEarth = null; }
    if (!this.earthOn) return;
    const changes = Terrain.earthworksSoFar();
    if (!changes.size) { UI.toast('No terraforming yet. Turn on "Terraform this run" in the Ski run tool.'); return; }
    this.allEarth = Terrain.earthOverlay(changes, 0.8);
    this.scene.add(this.allEarth);
  },

  toggleContours(on = !this.contoursOn) {
    this.contoursOn = on;
    Terrain.showContours(on);
    $('#contours').classList.toggle('active', on);
    try { localStorage.setItem('skiresort.contours', on ? '1' : '0'); } catch { /* ignore */ }
  },

  // Extend the run from its last point toward `h`, traversing the hill at the held angle.
  // Snaps onto a lift/lodge when the traverse arrives next to it. `partial` = mid-drag (no snapping).
  heldPath(pts, h, partial = false) {
    const out = pts.slice(), G = degToGrade(this.gradeDeg);
    let cur = out[out.length - 1];
    for (let k = 0; k < 120; k++) {
      if (Math.hypot(h.x - cur.x, h.z - cur.z) < 30) break;
      const n = traverseStep(cur, h, G, cur.dx != null ? cur : null);
      if (!n || !Terrain.inside(n.x, n.z)) break;
      out.push(n); cur = n;
    }
    if (!partial && (h.node || h.junction) && Math.hypot(h.x - cur.x, h.z - cur.z) < 90) {
      if (Math.hypot(h.x - cur.x, h.z - cur.z) < 15) out.pop();
      out.push({ ...h });
    }
    return out;
  },

  bindRunOptions() {
    const sync = this.syncRunOptions = () => {
      const g = degToGrade(this.gradeDeg), cls = g <= 0.25 ? 0 : g <= 0.4 ? 1 : 2;
      $('#ro-grade').checked = this.grading;
      $('#ro-hold').checked = this.holdAngle;
      $('#ro-deg').value = this.gradeDeg;
      $('#ro-deg').disabled = !this.grading && !this.holdAngle;
      $('#ro-deg-v').innerHTML = `${this.gradeDeg}° · ${Math.round(g * 100)}% · <b class="diff-${cls}">${DIFF[cls].name}</b>`;
      for (const b of document.querySelectorAll('[data-deg]')) b.classList.toggle('active', this.grading && +b.dataset.deg === this.gradeDeg);
      this.updateHover();
    };
    $('#ro-grade').onchange = (e) => { this.grading = e.target.checked; sync(); };
    $('#ro-hold').onchange = (e) => { this.holdAngle = e.target.checked; sync(); };
    $('#ro-deg').oninput = (e) => { this.gradeDeg = +e.target.value; sync(); };
    for (const b of document.querySelectorAll('[data-deg]')) b.onclick = () => { this.grading = this.holdAngle = true; this.gradeDeg = +b.dataset.deg; sync(); };
    sync();
  },

  // ---------- pylon editor ----------
  minPylon(T) { return Math.max(4, Math.round(T.towerH * 0.5)); },

  openPylons(l) {
    if (l.T.kind === 'belt') return UI.toast('A magic carpet has no pylons.');
    const T = l.T, start = (l.customTowers || Lifts.autoTowers(T, l.a, l.a.y, l.b, l.b.y)).map((t) => ({ ...t }));
    this.edit = {
      l, origCustom: l.customTowers ? l.customTowers.map((t) => ({ ...t })) : null,
      origValue: Lifts.towersValue(T, start), towers: start, sel: null, hover: null, ghost: null,
      wasOpen: l.opt.open || !!l.awaitInspection,
    };
    this.closeLiftPanel();
    this.setTool('pylons');
    this.applyPylons();
  },

  applyPylons() {
    const e = this.edit;
    Net.setTowers(e.l, e.towers);
    this.drawPylonOverlay();
    this.refreshPylonPanel();
    this.updatePreview();
  },

  hoverPylons(hit) {
    const e = this.edit, l = e.l, d = l.dir, hl = Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z);
    let hov = null, ghost = null;
    this.editS = null;
    if (hit) {
      const rx = hit.x - l.a.x, rz = hit.z - l.a.z, s = rx * d.ux + rz * d.uz, perp = Math.abs(rx * d.px + rz * d.pz);
      this.editS = s;
      if (perp < 55 && s > 12 && s < hl - 12) {
        let bd = 20;
        e.towers.forEach((t, i) => { const dd = Math.abs(t.s - s); if (dd < bd) { bd = dd; hov = i; } });
        if (hov === null) ghost = s;
      }
    }
    if (this.stroke && this.stroke.pylon != null) return;
    if (hov !== e.hover || (ghost === null) !== (e.ghost === null) || (ghost !== null && Math.abs(ghost - (e.ghost || 0)) > 2)) {
      e.hover = hov; e.ghost = ghost; this.drawPylonOverlay();
    }
  },

  drawPylonOverlay() {
    if (this.editGroup) {
      this.scene.remove(this.editGroup);
      this.editGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      this.editGroup = null;
    }
    const e = this.edit;
    if (!e) return;
    const l = e.l, T = l.T, P = l.profileP, g = new THREE.Group();
    const { samples } = Lifts.inspect(T, P, l.a);
    const col = { ok: [0.24, 1, 0.6], low: [1, 0.6, 0.1], hit: [1, 0.2, 0.15], high: [1, 0.85, 0.2] };
    const pos = [], cc = [];
    for (let i = 0; i < samples.length - 1; i++) {
      const p = samples[i], q = samples[i + 1], c = col[p.st === 'ok' ? q.st : p.st];
      pos.push(p.x, p.y + 1, p.z, q.x, q.y + 1, q.z); cc.push(...c, ...c);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    const rope = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    rope.renderOrder = 12; g.add(rope);
    const order = e.towers.map((t, i) => i).sort((a, b) => e.towers[a].s - e.towers[b].s);
    for (const i of e.towers.keys()) {
      const t = e.towers[i], x = l.a.x + l.dir.ux * t.s, z = l.a.z + l.dir.uz * t.s, gy = Terrain.height(x, z);
      const m = new THREE.Mesh(new THREE.SphereGeometry(T.gauge + 3, 14, 10), new THREE.MeshBasicMaterial({
        color: i === e.sel ? 0x35e0ff : i === e.hover ? 0xffcf5a : 0xffffff, depthTest: false, transparent: true, opacity: 0.85 }));
      m.position.set(x, gy + t.h + 2, z); m.renderOrder = 13; g.add(m);
    }
    if (e.ghost != null) {
      const x = l.a.x + l.dir.ux * e.ghost, z = l.a.z + l.dir.uz * e.ghost, gy = Terrain.height(x, z);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, T.towerH, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthTest: false }));
      m.position.set(x, gy + T.towerH / 2, z); m.renderOrder = 13; g.add(m);
    }
    this.editGroup = g; this.scene.add(g);
    this.pylonOrder = order;
  },

  refreshPylonPanel() {
    const e = this.edit, l = e.l, T = l.T;
    $('#pp-title').textContent = `${l.name} · ${T.name} pylons`;
    $('#pp-count').textContent = e.towers.length;
    const diff = Lifts.towersValue(T, e.towers) - e.origValue;
    $('#pp-cost').innerHTML = Math.abs(diff) < 1 ? '—' : diff > 0 ? `<span class="neg">${money(-diff)}</span>` : `<span class="pos">refund ${money(-diff / 2)}</span>`;
    $('#pp-issues').innerHTML = l.issues.length
      ? l.issues.map((i) => `<p class="danger">⚠ ${i}</p>`).join('') + '<p class="dim small">The lift stays closed until it passes inspection.</p>'
      : '<p class="ok">✓ Passes the safety inspection</p>';
    const sel = e.sel != null ? e.towers[e.sel] : null;
    $('#pp-sel').hidden = !sel;
    if (sel) {
      const rank = this.pylonOrder ? this.pylonOrder.indexOf(e.sel) + 1 : e.sel + 1;
      $('#pp-sel-name').textContent = `Pylon ${rank} · ${Math.round(sel.s)} m along the line`;
      const r = $('#pp-h'); r.min = this.minPylon(T); r.max = T.maxTowerH; r.value = sel.h;
      $('#pp-h-v').textContent = `${Math.round(sel.h)} m · ${money(Lifts.towerPrice(T, sel.h))}`;
    }
  },

  removePylon() {
    const e = this.edit;
    if (e.sel == null) return;
    e.towers.splice(e.sel, 1); e.sel = null; e.hover = null;
    this.applyPylons();
  },

  finishPylons() {
    const e = this.edit, l = e.l, T = l.T;
    const diff = Lifts.towersValue(T, e.towers) - e.origValue;
    if (diff > 0 && diff > Game.money) return UI.toast(`Not enough money for these pylons (${money(diff)}).`);
    if (diff > 0) Game.spend(diff); else Game.money -= diff / 2;
    this.edit = null;
    this.drawPylonOverlay();
    if (l.issues.length) UI.toast(`${l.name} failed the safety inspection and stays closed: ${l.issues[0]}.`);
    else {
      if (e.wasOpen) Net.setLiftOpen(l, true);
      l.awaitInspection = false;
      UI.toast(`${l.name} passed the safety inspection${e.wasOpen ? ' and is open' : ''}.`);
    }
    Save.write();
    this.setTool('select');
    this.openLiftPanel(l);
  },

  cancelPylons() {
    const e = this.edit;
    if (!e) return;
    this.edit = null;
    const l = e.l;
    l.customTowers = e.origCustom;
    Net.group.remove(l.vis); Lifts.dispose(l.vis); Lifts.build(l); Net.group.add(l.vis);
    if (e.wasOpen && !l.awaitInspection) Net.setLiftOpen(l, true);
    this.drawPylonOverlay();
    $('#pylon-panel').hidden = true;
  },

  bindPylonPanel() {
    $('#pp-h').oninput = (ev) => { const e = this.edit; if (e && e.sel != null) { e.towers[e.sel].h = +ev.target.value; this.applyPylons(); } };
    $('#pp-del').onclick = () => this.removePylon();
    $('#pp-auto').onclick = () => { const e = this.edit, l = e.l; e.towers = Lifts.autoTowers(l.T, l.a, l.a.y, l.b, l.b.y); e.sel = null; this.applyPylons(); };
    $('#pp-cancel').onclick = () => { this.cancelPylons(); this.setTool('select'); };
    $('#pp-done').onclick = () => this.finishPylons();
    $('#lp-pylons').onclick = () => { const l = this.panelLift; if (l) this.openPylons(l); };
  },

  buildLiftPicker() {
    const box = $('#lift-types');
    box.innerHTML = `<b class="pk-title">Lift type</b>
      <label class="toggle"><input type="checkbox" id="manual-pylons"${this.manualPylons ? ' checked' : ''}> Place pylons myself</label>`;
    box.querySelector('#manual-pylons').onchange = (ev) => { this.manualPylons = ev.target.checked; this.updateHover(); };
    for (const [key, T] of Object.entries(LIFT_TYPES)) {
      const cap = T.kind === 'tram' ? 'about 400' : fmt((T.seats / T.interval) * 3600);
      const b = document.createElement('button');
      b.className = 'pick' + (key === this.liftType ? ' active' : '');
      b.innerHTML = `<span class="pk-ico">${T.icon}</span><span class="pk-name">${T.name}</span>
        <span class="pk-meta">${cap}/h · ${T.speed} m/s · ≤ ${fmt(T.maxLen)} m${T.cold === 0 ? ' · enclosed' : ''}</span>
        <span class="pk-meta">${money(T.baseCost)} + €${T.perM}/m${T.towerCost ? ` + ${money(T.towerCost)}/tower` : ''}</span>
        <span class="pk-desc">${T.desc}</span>`;
      b.onclick = () => { this.liftType = key; this.buildLiftPicker(); this.updateHover(); };
      box.appendChild(b);
    }
  },

  openLiftPanel(l) {
    this.panelLift = l;
    const p = $('#lift-panel'), T = l.T;
    $('#lp-name').value = l.name;
    $('#lp-speed').value = Math.round(l.opt.speed * 100);
    $('#lp-density').value = Math.round(l.opt.density * 100);
    $('#lp-density-row').hidden = T.kind === 'tram' || T.kind === 'belt';
    $('#lp-open').checked = l.opt.open;
    const sel = $('#lp-up');
    sel.innerHTML = Object.entries(LIFT_TYPES).filter(([k]) => k !== l.type)
      .map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');
    p.hidden = false;
    this.refreshLiftPanel();
  },
  closeLiftPanel() { this.panelLift = null; $('#lift-panel').hidden = true; },

  refreshLiftPanel() {
    const l = this.panelLift;
    if (!l || !Net.lifts.includes(l)) return this.closeLiftPanel();
    const T = l.T;
    $('#lp-type').textContent = `${T.icon} ${T.name}`;
    $('#lp-speed-v').textContent = `${(Lifts.speed(l)).toFixed(1)} m/s`;
    $('#lp-density-v').textContent = `${Math.round(l.opt.density * 100)}%`;
    $('#lp-stats').innerHTML = `
      <div class="row"><span>Length / climb</span><b>${fmt(l.len)} m / ${fmt(l.vert)} m</b></div>
      <div class="row"><span>Pylons</span><b>${l.towers}${l.customTowers ? ' <small>(placed by you)</small>' : ''}</b></div>
      <div class="row"><span>Capacity</span><b>${fmt(Lifts.capacity(l))} skiers/h</b></div>
      <div class="row"><span>Ride time</span><b>${(Lifts.rideTime(l) / 60).toFixed(1)} min</b></div>
      <div class="row"><span>Queue</span><b>${l.queue.length}${l.queue.length ? ` · ~${Math.round(Lifts.waitTime(l) / 60)} min` : ''}</b></div>
      <div class="row"><span>Rides today</span><b>${fmt(l.ridesToday)}${l.ridesYesterday != null ? ` <small>(yesterday ${fmt(l.ridesYesterday)})</small>` : ''}</b></div>
      <div class="row"><span>Running cost</span><b class="neg">${money(-Lifts.dailyCost(l))}/day</b></div>`;
    const plan = Net.upgradePlan(l, $('#lp-up').value);
    $('#lp-up-go').textContent = plan.ok ? `Upgrade · ${money(plan.cost)}` : 'Upgrade';
    $('#lp-up-go').disabled = !plan.ok;
    $('#lp-up-msg').textContent = plan.ok ? '' : plan.msg;
    $('#lp-remove').textContent = `Remove lift (refund ${money(l.cost / 2)})`;
    $('#lp-inspect').innerHTML = l.issues && l.issues.length ? `<p class="danger">⚠ Failed safety inspection: ${l.issues.join('; ')}</p>` : '';
    $('#lp-pylons').hidden = l.T.kind === 'belt';
  },

  bindLiftPanel() {
    const L = () => this.panelLift;
    $('#lp-close').onclick = () => this.closeLiftPanel();
    $('#lp-name').oninput = (e) => { if (L()) L().name = e.target.value.slice(0, 24) || L().name; };
    $('#lp-name').onchange = () => Save.write();
    $('#lp-speed').oninput = (e) => { L().opt.speed = e.target.value / 100; this.refreshLiftPanel(); };
    $('#lp-density').oninput = (e) => { L().opt.density = e.target.value / 100; this.refreshLiftPanel(); };
    for (const id of ['#lp-speed', '#lp-density']) $(id).onchange = () => Save.write();
    $('#lp-open').onchange = (e) => {
      if (!Net.setLiftOpen(L(), e.target.checked)) { e.target.checked = false; UI.toast(`${L().name} failed the safety inspection. Fix its pylons first.`); }
      Save.write(); this.refreshLiftPanel();
    };
    $('#lp-up').onchange = () => this.refreshLiftPanel();
    $('#lp-up-go').onclick = () => {
      const l = L(), from = l.T.name, plan = Net.upgradeLift(l, $('#lp-up').value);
      if (!plan.ok) return UI.toast(plan.msg);
      UI.toast(`${l.name}: ${from} → ${l.T.name} for ${money(plan.cost)}`);
      Save.write(); this.openLiftPanel(l);
    };
    $('#lp-remove').onclick = () => {
      const l = L();
      if (!$('#lp-remove').classList.contains('confirm')) {
        $('#lp-remove').classList.add('confirm'); $('#lp-remove').textContent = 'Click again to remove'; return;
      }
      $('#lp-remove').classList.remove('confirm');
      this.closeLiftPanel(); Net.remove(l); UI.toast(`Removed ${l.name}`); Save.write();
    };
  },

  strokeMove() {
    const h = this.hover, st = this.stroke;
    if (st.pylon != null) {
      const e = this.edit, hl = Math.hypot(e.l.b.x - e.l.a.x, e.l.b.z - e.l.a.z);
      if (this.editS != null) { e.towers[st.pylon].s = clamp(this.editS, 12, hl - 12); this.applyPylons(); }
      return;
    }
    if (!h) return;
    if (this.tool === 'cut') {
      if (st.last && Math.hypot(st.last.x - h.x, st.last.z - h.z) < this.brush * 0.4) return;
      st.last = { x: h.x, z: h.z };
      st.cut += Game.cutAt(h.x, h.z, this.brush);
      return;
    }
    const pts = this.draft.pts, last = pts[pts.length - 1];
    if (!last) { pts.push({ ...h }); return; }
    if (this.holdAngle) { this.draft.pts = this.heldPath(pts, h, true); return; }
    const gap = Math.hypot(last.x - h.x, last.z - h.z);
    if (gap >= 30 || (h.node && h.node !== last.node && gap > 5)) { const p = { ...h }; if (pts.length) delete p.junction; pts.push(p); }
  },

  strokeEnd() {
    if (this.stroke.pylon != null) return;
    if (this.tool === 'cut') {
      if (this.stroke.cut) { UI.toast(`Felled ${this.stroke.cut} trees for ${money(this.stroke.cut * TREE_COST)}`); Save.write(); }
      return;
    }
    const h = this.hover;
    if (this.holdAngle && h) this.draft.pts = this.heldPath(this.draft.pts, h);
    const pts = this.draft.pts, last = pts[pts.length - 1];
    if (!this.holdAngle && h && last && Math.hypot(last.x - h.x, last.z - h.z) > 10) pts.push({ ...h });
    const end = pts[pts.length - 1];
    if (pts.length >= 2 && ((end.node && end.node !== pts[0].node) || end.junction)) this.finishRun();
    else this.updateHover();
  },

  finishRun() {
    const d = this.draft;
    if (this.tool !== 'run' || !d || d.pts.length < 2) return;
    const plan = Net.runPlan(d.pts, false, this.grade());
    if (!plan.ok) { d.pts.pop(); this.updateHover(); return UI.toast(plan.msg); }
    const r = Net.buildRun(plan);
    UI.toast(`${r.name} (${DIFF[r.diff].name}) built for ${money(plan.cost)}`);
    this.clearEarthPreview();
    if (plan.gradeDeg) this.refreshEarthworks();
    Save.write();
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
    $('#rep').classList.toggle('neg', Game.rep < MIN_REP + 15);
    $('#costs').textContent = money(-Game.dailyCost());
    $('#forest').textContent = `${Math.round(Game.forestLeft() * 100)}%`;
    $('#forest').classList.toggle('neg', Game.scenery() < 1);
    const danger = UI.dangers()[0];
    $('#danger').hidden = !danger || Game.dayOver;
    if (danger) $('#danger').textContent = danger;
    $('#status').textContent = Game.open ? (Game.time < LAST_ARRIVAL ? `${Math.round(Game.demandPerHour())} arrivals/h` : 'Ticket office closed') : 'Closed — build a lift and a run';
    for (const l of Net.lifts) {
      const q = l.queue.length;
      l.label.show(q > 0);
      if (q) {
        const w = Lifts.waitTime(l) / 60;
        l.label.set(`${l.name} · ${q}${w >= 1 ? ` · ${Math.round(w)} min` : ''}`);
        l.label.el.classList.toggle('long', w > 10);
      }
    }
    if (this.panelLift) this.refreshLiftPanel();
  },
};

addEventListener('DOMContentLoaded', () => {
  App.init();
  const again = new URLSearchParams(location.search).get('new');
  if (again && window.SKI_MAPS[again]) { history.replaceState(null, '', location.pathname); App.start(again, null); }
});
