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
  grading: false, holdAngle: false, gradeDeg: 13, manualPylons: false, edit: null, planMode: false, pylonFocus: true,

  init() {
    this.bindImport();
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

  bindImport() {
    const input = $('#import-file'), box = $('#import-result');
    $('#import-btn').onclick = () => input.click();
    input.onchange = async () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      const r = Save.parseFile(await f.text());
      box.hidden = false;
      if (r.error) { box.innerHTML = `<p class="danger">${r.error}</p>`; return; }
      const d = r.data, s = d.save, name = window.SKI_MAPS[d.resort].name, existing = Save.read(d.resort);
      box.innerHTML = `<p><b>${name}</b> · day ${s.day} · ${money(s.money)} · ${s.lifts.length} lifts, ${s.runs.length} runs` +
        (d.savedAt ? ` <span class="dim">(saved ${new Date(d.savedAt).toLocaleString()})</span>` : '') + '</p>' +
        (existing ? `<p class="danger">This replaces your current ${name} save (day ${existing.day}, ${money(existing.money)}).</p>` : '') +
        `<div class="btns"><button id="import-ok">${existing ? 'Replace and load' : 'Load this save'}</button><button id="import-cancel" class="ghost">Cancel</button></div>`;
      $('#import-cancel').onclick = () => { box.hidden = true; };
      $('#import-ok').onclick = () => { Save.importData(d); box.hidden = true; this.start(d.resort, Save.read(d.resort)); };
    };
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
    controls.maxPolarAngle = 1.45; controls.minDistance = 40; controls.maxDistance = 16000;
    controls.zoomSpeed = 1.2;
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
    this.bindProfile();
    this.bindRunOptions();
    this.refreshPlans();
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
    const un = save && Game.untangled;
    if (un && un.moved) UI.toast(`Moved ${un.moved} overlapping station${un.moved > 1 ? 's' : ''} to free ground nearby, free of charge. Footpaths connect them to their old spots.` +
      (un.reset.length ? ` ${un.reset.join(', ')} got automatic pylons again, because the hand-placed ones no longer passed inspection.` : ''));
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
    // zoom toward whatever is under the cursor (runs before OrbitControls' own dolly)
    el.addEventListener('wheel', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      const hit = this.pickTerrain();
      if (!hit) return;
      const f = e.deltaY < 0 ? 0.18 : -0.06;
      const t = this.controls.target, dx = (hit.x - t.x) * f, dy = (hit.y - t.y) * f, dz = (hit.z - t.z) * f;
      t.x += dx; t.y += dy; t.z += dz;
      this.camera.position.x += dx; this.camera.position.y += dy; this.camera.position.z += dz;
    }, { capture: true, passive: true });
    el.addEventListener('dblclick', () => {
      if (this.tool !== 'select') return;   // in build tools a double-click is two clicks
      const h = this.pickTerrain(); if (h) this.flyTo(h, Math.min(this.camDist(), 900));
    });
    this.keys = new Set();
    addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT' || e.target.type === 'range') this.keys.add(e.key.toLowerCase()); });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());

    for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => this.setTool(b.dataset.tool);
    for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => this.setSpeed(+b.dataset.speed);
    $('#next-day').onclick = () => { $('#summary').hidden = true; Game.nextDay(); Save.write(); };
    $('#retry').onclick = () => { Save.clear(Game.map.key); location.search = '?new=' + Game.map.key; };
    $('#over-menu').onclick = () => location.replace(location.pathname);
    $('#to-menu').onclick = () => { Save.write(); location.replace(location.pathname); };
    $('#export-save').onclick = () => {
      Save.write();
      const name = Save.exportFile();
      UI.toast(name ? `Saved ${name} to your downloads. On the other computer, choose "Import save file" in the menu.` : 'Nothing to save.');
    };
    $('#finish-run').onclick = () => this.finishRun();
    $('#contours').onclick = () => this.toggleContours();
    $('#earthworks').onclick = () => this.toggleEarthworks();
    $('#plan-mode').onclick = () => this.setPlanMode(!this.planMode);
    $('#plans-btn').onclick = () => { $('#plans-panel').hidden = !$('#plans-panel').hidden; this.refreshPlans(); };
    $('#plans-close').onclick = () => { $('#plans-panel').hidden = true; };
    $('#plans-build-all').onclick = () => this.buildAllPlans();
    $('#grade-it').onclick = () => { this.grading = true; this.syncRunOptions(); };

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      if (this.tool === 'pylons' && this.edit) {
        const ed = this.edit, T = ed.l.T;
        if ((e.key === '+' || e.key === '=' || e.key === '-') && ed.sel != null) {
          const t = ed.towers[ed.sel], step = (e.shiftKey ? 5 : 1) * (e.key === '-' ? -1 : 1);
          t.h = clamp(t.h + step, this.minPylon(T), Lifts.maxPylonH(T, Lifts.pylonType(ed.l, t))); this.applyPylons(); e.preventDefault(); return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && ed.sel != null) { this.removePylon(); e.preventDefault(); return; }
        if (e.key === 'Escape') { ed.sel = null; this.applyPylons(); return; }
        if (e.key === '[' || e.key === ']') { this.stepPylon(e.key === ']' ? 1 : -1); e.preventDefault(); return; }
        if (e.key === 'Enter') { this.finishPylons(); return; }
      }
      const keys = { '1': 'select', '2': 'lift', '3': 'run', '4': 'cut', '5': 'bulldoze' };
      if (keys[e.key]) this.setTool(keys[e.key]);
      else if (e.key === '[' || e.key === ']') {
        this.brush = clamp(this.brush + (e.key === ']' ? 10 : -10), 20, 120);
        this.brushRing.scale.setScalar(this.brush); this.updateHover();
      }
      else if (e.key === 'Escape') { if (this.tool === 'move') { const l = this.moving && this.moving.l; this.setTool('select'); if (l) this.openLiftPanel(l); } else if (this.tool === 'station') { this.stationLift = null; this.setTool('select'); } else this.setTool(this.tool === 'select' ? 'select' : this.tool); }
      else if (e.key === 'Enter') this.finishRun();
      else if (e.key === 'Backspace' && this.draft && this.draft.pts) { this.draft.pts.pop(); this.updateHover(); e.preventDefault(); }
      else if (e.key === 'h' || e.key === 'H') this.toggleContours();
      else if (e.key === ' ') { this.setSpeed(Game.paused ? Game.speed : 0); e.preventDefault(); }
    });
  },

  setTool(t) {
    if (this.edit && t !== 'pylons') this.cancelPylons();
    if (this.moving && t !== 'move') this.endMove();
    this.tool = t;
    this.draft = t === 'lift' ? { a: null } : t === 'run' ? { pts: [] } : null;
    $('#lift-types').hidden = t !== 'lift';
    $('#run-options').hidden = t !== 'run';
    $('#pylon-panel').hidden = t !== 'pylons';
    $('#profile-dock').hidden = t !== 'pylons';
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
    if (this.tool === 'move' && this.moving) this.hoverMove(hit);
    if (this.tool === 'station' && this.stationLift) {
      const l = this.stationLift, hl = Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z);
      this.stationS = null;
      if (hit) {
        const rx = hit.x - l.a.x, rz = hit.z - l.a.z, s = rx * l.dir.ux + rz * l.dir.uz;
        if (Math.abs(rx * l.dir.px + rz * l.dir.pz) < 70 && s > 0 && s < hl) {
          this.stationS = s;
          const x = l.a.x + l.dir.ux * s, z = l.a.z + l.dir.uz * s, ok = Net.midStationPlan(l, s).ok;
          this.snapRing.visible = true; this.snapRing.position.set(x, Terrain.height(x, z) + 3, z);
          this.snapRing.material.color.set(ok ? 0x3dff9a : 0xff4d4d);
        }
      }
    } else if (this.snapRing) this.snapRing.material.color.set(0x3dff9a);
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
    if (e.planned) tt.innerHTML += `<br><span class="plan-tag">📐 plan · about ${money(Net.planCost(e).total)} to build</span>`;
    if (this.tool === 'bulldoze') tt.innerHTML += e.planned ? '<br><span class="neg">Click to delete this plan</span>' : `<br><span class="neg">Click to remove · refund ${money(e.cost / 2)}</span>`;
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
    if (t === 'select') hint = 'Drag to rotate · right-drag to pan · scroll to zoom toward the cursor · WASD/arrows move · Q/E turn · double-click to fly there · click a lift for its options.';
    else if (t === 'bulldoze') hint = 'Click a lift or run to remove it (50% refund).';
    else if (t === 'move' && this.moving) {
      const mp = this.moving.plan, l = this.moving.l, which = this.moving.end === 'a' ? 'bottom' : 'top';
      hint = !mp ? `Point where ${l.name}'s ${which} station should go · Esc to cancel` :
        !mp.ok ? `<span class="neg">${mp.msg}</span>` :
        `Click to move the ${which} station here${mp.atHome ? ' (back on its original spot)' : ''} · ` +
        (mp.cost ? `<b>${money(mp.cost)}</b> for the extra length` : '<b>free</b>') +
        (mp.crossings.length ? ` · <span class="warn">⚠ crosses ${mp.crossings.map((x) => x.name).join(', ')}</span>` : '') + ' · Esc to cancel';
    }
    else if (t === 'station' && this.stationLift) {
      const l = this.stationLift, sp = this.stationS != null ? Net.midStationPlan(l, this.stationS) : null;
      hint = !sp ? `Point at ${l.name}'s line to place an intermediate station` :
        sp.ok ? `Click to build a station here, ${Math.round(sp.s)} m up the line · <b>${money(sp.cost)}</b> · Esc to cancel` : `<span class="neg">${sp.msg}</span>`;
    }
    else if (t === 'pylons' && this.edit) {
      const e = this.edit;
      hint = e.hover != null ? 'Drag to move this pylon along the line · click to select it'
        : e.ghost != null ? `Click to add a pylon here (${money(Lifts.towerPrice(e.l.T, e.l.T.towerH, Lifts.pylonType(e.l)))})`
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
        const plan = Net.liftPlan(this.liftType, d.a, h, this.planMode, this.manualPylons);
        const pa = plan.a, pb = plan.b;
        const { pts } = Lifts.previewGeometry(T, pa, Net.pointY(pa), pb, Net.pointY(pb), plan.manual ? [] : null);
        this.liftLine.geometry.dispose();
        this.liftLine.geometry = new THREE.BufferGeometry();
        this.liftLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        this.liftLine.material.color.set(plan.ok ? 0x3dff9a : 0xff4d4d);
        this.liftLine.visible = true;
        const cap = (T.seats / (T.kind === 'tram' ? 2 * (plan.len / T.speed + T.dwell) : T.interval)) * 3600;
        hint = (plan.joinWith ? `<b class="join">Continues ${plan.joinWith.name} through an ${plan.bendDeg > 3 ? `angle station (turns ${Math.round(plan.bendDeg)}°)` : 'intermediate station'}</b> · ` : '') +
          (plan.a.moved || plan.b.moved ? '<span class="dim">Station moved next to the existing building, joined by a footpath</span> · ' : '') +
          (plan.crossed && plan.crossed.length ? `<span class="warn">⚠ crosses ${plan.crossed.map((x) => x.name).join(', ')}</span> · ` : '') +
          `${fmt(plan.len)} m · climbs ${fmt(plan.vert)} m · ${plan.towers} towers · ${fmt(cap)} skiers/h · ride ${(plan.len / T.speed / 60).toFixed(1)} min · <b>${money(plan.cost)}</b>` +
          (plan.trees ? ` <span class="dim">(incl. ${plan.trees} trees to fell)</span>` : '') +
          (plan.ok ? ' — click to build' : ` — <span class="neg">${plan.msg}</span>`) + ' · Esc to cancel';
      }
    } else if (t === 'run') {
      const pts = h ? (this.holdAngle && d.pts.length ? this.heldPath(d.pts, h) : [...d.pts, h]) : d.pts;
      if (!d.pts.length) hint = h && h.junction
        ? `Start here to <b>branch off ${h.junction.run.name}</b>. Skiers can choose either way at the junction.`
        : 'Drag from a lift top, or from the middle of a piste to branch off, down the slope. The map shows the steepness. <span class="dim">Right-drag to rotate.</span>';
      else if (pts.length >= 2) {
        const plan = Net.runPlan(pts, this.planMode, this.grade());
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
    if (this.planMode && (t === 'lift' || t === 'run')) hint = '<b class="plan-tag">📐 PLANNING</b> nothing is paid until you build it from the Plans panel · ' + hint;
    $('#hint').innerHTML = hint + (at ? ' ' + at : '');
  },

  click() {
    const h = this.hover, t = this.tool, d = this.draft;
    if (t === 'bulldoze') {
      const e = h && Net.edgeNear(h.x, h.z);
      if (e) { if (e === this.panelLift) this.closeLiftPanel(); Net.remove(e); UI.toast(e.planned ? `Deleted the plan for ${e.name}` : `Removed ${e.name}`); Save.write(); this.refreshPlans(); }
    } else if (t === 'move' && this.moving) {
      const { l, end } = this.moving, mp = this.moving.plan;
      if (!mp) return;
      if (!mp.ok) return UI.toast(mp.msg);
      const r = Net.moveStation(l, end, mp.x, mp.z);
      if (!r.ok) return UI.toast(r.msg);
      UI.toast(`${l.name}: ${end === 'a' ? 'bottom' : 'top'} station moved${r.cost ? ` for ${money(r.cost)}` : ''}` +
        (r.crossings.length ? `. It still crosses ${r.crossings.map((x) => x.name).join(', ')}.` : '.') +
        (r.reset ? ' Its hand-placed pylons no longer fitted, so it has automatic pylons again.' : ''));
      this.endMove(); Save.write(); this.setTool('select'); this.openLiftPanel(l);
      return;
    } else if (t === 'station' && this.stationLift) {
      if (this.stationS == null) return;
      const l = this.stationLift, r = Net.addMidStation(l, this.stationS);
      if (!r.ok) return UI.toast(r.msg);
      UI.toast(`Built a station on ${l.name}${r.cost ? ` for ${money(r.cost)}` : ''}. Skiers can get on and off there, or stay on.`);
      this.stationLift = null; Save.write(); this.setTool('select'); this.openLiftPanel(l);
      return;
    } else if (t === 'pylons' && this.edit) {
      const e = this.edit;
      if (e.hover != null) { this.selectPylon(e.hover); return; }
      else if (e.ghost != null) {
        e.towers.push({ s: e.ghost, h: e.l.T.towerH });
        e.hover = null; e.ghost = null;
        this.selectPylon(e.towers.length - 1);
        return;
      }
      this.applyPylons();
      return;
    } else if (t === 'select') {
      const e = h && Net.edgeNear(h.x, h.z);
      if (e && e.kind === 'lift') this.openLiftPanel(e); else this.closeLiftPanel();
    } else if (t === 'lift' && h) {
      if (!d.a) d.a = { ...h };
      else {
        const plan = Net.liftPlan(this.liftType, d.a, h, this.planMode, this.manualPylons);
        if (!plan.ok) return UI.toast(plan.msg);
        plan.planned = this.planMode;
        const l = Net.buildLift(plan);
        UI.toast(plan.planned ? `📐 Planned ${l.name} ${l.T.name}: about ${money(plan.cost)} when you build it` : `${l.name} ${l.T.name} built for ${money(plan.cost)}`);
        this.refreshPlans();
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

  // ---------- plans ----------
  setPlanMode(on) {
    this.planMode = on;
    $('#plan-mode').classList.toggle('active', on);
    this.updateHover();
  },

  buildPlan(e) {
    const r = Net.confirmPlan(e);
    if (!r.ok) return UI.toast(r.msg);
    UI.toast(`🏗 Built ${e.name} for ${money(r.cost)}${r.issues.length ? `, but it failed inspection and stays closed: ${r.issues[0]}` : ''}`);
    if (this.earthOn) this.refreshEarthworks();
    Save.write();
    this.refreshPlans();
    if (this.panelLift === e) this.openLiftPanel(e);
  },

  buildAllPlans() {
    let n = 0, spent = 0;
    for (const e of Net.plans()) {
      const r = Net.confirmPlan(e);
      if (!r.ok) { UI.toast(`${r.msg}. Stopped after ${n} build${n === 1 ? '' : 's'}.`); break; }
      n++; spent += r.cost;
    }
    if (n) UI.toast(`🏗 Built ${n} planned item${n === 1 ? '' : 's'} for ${money(spent)}`);
    if (this.earthOn) this.refreshEarthworks();
    Save.write();
    this.refreshPlans();
  },

  refreshPlans() {
    const plans = Net.plans();
    $('#plans-btn').textContent = `📐 Plans${plans.length ? ` (${plans.length})` : ''}`;
    if ($('#plans-panel').hidden) return;
    let total = 0;
    $('#plans-list').innerHTML = plans.length ? '' : '<p class="dim small">No plans yet. Switch on <b>📐 Plan only</b> in the toolbar and place lifts or runs. Nothing is paid until you build them here.</p>';
    plans.forEach((e, i) => {
      const c = Net.planCost(e); total += c.total;
      const what = e.kind === 'lift' ? `${e.T.icon} ${e.T.name} · ${fmt(e.len)} m` : `${DIFF[e.diff].name} run · ${fmt(e.len)} m${e.gradeDeg ? ` · graded ≤ ${e.gradeDeg}°` : ''}`;
      const warn = e.kind === 'lift' && e.issues && e.issues.length ? `<span class="neg small">⚠ would fail inspection</span>` : '';
      const row = document.createElement('div');
      row.className = 'plan-row';
      row.innerHTML = `<div><b>${e.name}</b> <span class="dim small">${what}</span><br>${money(c.total)} ${warn}</div>
        <div class="plan-btns"><button data-a="show" title="Show">◎</button><button data-a="build">Build</button><button data-a="del" title="Delete plan">✕</button></div>`;
      row.querySelector('[data-a="show"]').onclick = () => {
        const m = e.kind === 'lift' ? { x: (e.a.x + e.b.x) / 2, z: (e.a.z + e.b.z) / 2 } : e.dense[e.dense.length >> 1];
        this.flyTo({ x: m.x, y: Terrain.height(m.x, m.z), z: m.z }, Math.max(500, e.len * 0.9));
        if (e.kind === 'lift') this.openLiftPanel(e);
      };
      row.querySelector('[data-a="build"]').onclick = () => this.buildPlan(e);
      row.querySelector('[data-a="del"]').onclick = () => { if (this.panelLift === e) this.closeLiftPanel(); Net.remove(e); Save.write(); this.refreshPlans(); };
      $('#plans-list').appendChild(row);
    });
    $('#plans-total').innerHTML = `${money(total)}${total > Game.money ? ' <span class="neg">(more than you have)</span>' : ''}`;
    $('#plans-build-all').disabled = !plans.length;
    $('#plans-build-all').textContent = plans.length ? `Build all · ${money(total)}` : 'Build all';
  },

  // ---------- moving a station ----------
  startMove(l, end) {
    this.closeLiftPanel();
    this.moving = { l, end, plan: null };
    this.setTool('move');
    const n = l[end];
    this.flyTo({ x: n.x, y: n.y, z: n.z }, 420);
  },
  endMove() {
    if (this.moveVis) { this.scene.remove(this.moveVis); this.moveVis.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.moveVis = null; }
    this.moving = null;
  },
  hoverMove(hit) {
    const m = this.moving;
    if (this.moveVis) { this.scene.remove(this.moveVis); this.moveVis.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.moveVis = null; }
    m.plan = hit ? Net.moveStationPlan(m.l, m.end, hit.x, hit.z) : null;
    if (!m.plan) return;
    const mp = m.plan, col = !mp.ok ? 0xff4d4d : mp.crossings.length ? 0xffa31a : 0x3dff9a;
    const g = new THREE.Group(), y = (x, z) => Terrain.height(x, z) + 3;
    const other = m.end === 'a' ? m.l.b : m.l.a;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(mp.x, y(mp.x, mp.z) + 15, mp.z), new THREE.Vector3(other.x, other.y + 18, other.z)]);
    g.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: col, depthTest: false })));
    const home = mp.home, pathGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(mp.x, y(mp.x, mp.z), mp.z), new THREE.Vector3(home.x, home.y + 3, home.z)]);
    g.add(new THREE.Line(pathGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 4, gapSize: 3, depthTest: false })));
    g.children[1].computeLineDistances();
    if (mp.fp) {
      const f = mp.fp, px = -f.uz, pz = f.ux, c = [];
      for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]]) {
        const x = f.cx + f.ux * f.hl * a + px * f.hw * b, z = f.cz + f.uz * f.hl * a + pz * f.hw * b;
        c.push(new THREE.Vector3(x, y(x, z), z));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c), new THREE.LineBasicMaterial({ color: col, depthTest: false })));
    }
    g.traverse((o) => { o.renderOrder = 12; });
    this.moveVis = g; this.scene.add(g);
  },

  // ---------- pylon editor ----------
  minPylon(T) { return Math.max(4, Math.round(T.towerH * 0.5)); },

  openPylons(l) {
    if (l.T.kind === 'belt') return UI.toast('A magic carpet has no pylons.');
    const T = l.T, start = (l.customTowers || Lifts.autoTowers(T, l.a, l.a.y, l.b, l.b.y)).map((t) => ({ ...t }));
    this.edit = {
      l, origCustom: l.customTowers ? l.customTowers.map((t) => ({ ...t })) : null,
      origValue: Lifts.towersValue(T, start, Lifts.pylonType(l)), towers: start, sel: null, hover: null, ghost: null, profScale: null,
      wasOpen: l.opt.open || !!l.awaitInspection,
    };
    this.closeLiftPanel();
    this.profScale = null;
    this.setTool('pylons');
    this.applyPylons();
    const hl = Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z), mid = { x: (l.a.x + l.b.x) / 2, z: (l.a.z + l.b.z) / 2 };
    mid.y = Terrain.height(mid.x, mid.z);
    const side = Math.sign((this.camera.position.x - mid.x) * l.dir.px + (this.camera.position.z - mid.z) * l.dir.pz) || 1;
    this.flyTo(mid, Math.max(400, hl * 0.85), { x: l.dir.px * side, y: 0.45, z: l.dir.pz * side });
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

  // profile point (head position, height, train) of draft pylon i
  pylonInfo(i) {
    const e = this.edit, P = e.l.profileP, src = e.l.customTowers && e.l.customTowers[i];
    const pi = P.prof.findIndex((q) => q.src === src);
    if (pi < 1) return null;
    const q = P.prof[pi], heads = P.prof.filter((r) => r.src === src).map((r) => ({ s: r.s, y: r.y }));
    const head = heads.length > 1 ? (heads[0].s + heads[1].s) / 2 : q.s;
    return { pi, head, y: q.y, foot: q.foot, heads, t: Lifts.trainFor(P, pi) };
  },

  drawPylonOverlay() {
    if (this.editGroup) {
      this.scene.remove(this.editGroup);
      this.editGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      this.editGroup = null;
    }
    const e = this.edit;
    if (!e) { for (const lb of this.pylonLabels || []) lb.remove(); this.pylonLabels = []; return; }
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
      const t = e.towers[i], inf = this.pylonInfo(i), hs = inf ? inf.head : t.s;
      const x = l.a.x + l.dir.ux * hs, z = l.a.z + l.dir.uz * hs, fx = l.a.x + l.dir.ux * t.s, fz = l.a.z + l.dir.uz * t.s;
      const gy = Terrain.height(fx, fz), topY = inf ? inf.y : gy + t.h;
      const m = new THREE.Mesh(new THREE.SphereGeometry(T.gauge + 3, 14, 10), new THREE.MeshBasicMaterial({
        color: i === e.sel ? 0x35e0ff : i === e.hover ? 0xffcf5a : 0xffffff, depthTest: false, transparent: true, opacity: 0.85 }));
      m.position.set(x, topY + 2, z); m.renderOrder = 13; m.userData.handle = true; g.add(m);
      // guide line from the foot to the head, so the pylon (and its lean) reads even when tiny on screen
      const hp = (inf ? inf.heads : [{ s: hs, y: topY }]).flatMap((h) => [new THREE.Vector3(fx, gy, fz),
        new THREE.Vector3(l.a.x + l.dir.ux * h.s, h.y, l.a.z + l.dir.uz * h.s)]);
      const vg = new THREE.BufferGeometry().setFromPoints(hp);
      const v = new THREE.LineSegments(vg, new THREE.LineBasicMaterial({ color: i === e.sel ? 0x35e0ff : 0xffffff, depthTest: false }));
      v.renderOrder = 13; g.add(v);
    }
    // labels: P1 · 18 m
    for (const lb of this.pylonLabels || []) lb.remove();
    this.pylonLabels = order.map((i, rank) => {
      const t = e.towers[i], inf = this.pylonInfo(i), hs = inf ? inf.head : t.s;
      const x = l.a.x + l.dir.ux * hs, z = l.a.z + l.dir.uz * hs;
      const extra = (t.lean ? ` ↗${Math.round(t.lean)}°` : '') + (inf && inf.t && inf.t.linked ? ' 🔗' : '');
      return Labels.add(`P${rank + 1} · ${Math.round(t.h)} m${extra}`, 'pylon' + (i === e.sel ? ' sel' : ''), { x, y: (inf ? inf.y : Terrain.height(x, z) + t.h) + 14, z });
    });
    if (e.ghost != null) {
      const x = l.a.x + l.dir.ux * e.ghost, z = l.a.z + l.dir.uz * e.ghost, gy = Terrain.height(x, z);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, T.towerH, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthTest: false }));
      m.position.set(x, gy + T.towerH / 2, z); m.renderOrder = 13; m.userData.handle = true; g.add(m);
    }
    this.editGroup = g; this.scene.add(g);
    this.pylonOrder = order;
    this.drawProfile();
  },

  refreshPylonPanel() {
    const e = this.edit, l = e.l, T = l.T;
    $('#pp-title').textContent = `${l.name} · ${T.name} pylons${l.planned ? ' (plan)' : ''}`;
    $('#pp-count').textContent = e.towers.length;
    const diff = l.planned ? 0 : Lifts.towersValue(T, e.towers, Lifts.pylonType(l)) - e.origValue;
    $('#pp-cost').innerHTML = Math.abs(diff) < 1 ? '—' : diff > 0 ? `<span class="neg">${money(-diff)}</span>` : `<span class="pos">refund ${money(-diff / 2)}</span>`;
    $('#pp-issues').innerHTML = l.issues.length
      ? l.issues.map((i) => `<p class="danger">⚠ ${i}</p>`).join('') + '<p class="dim small">The lift stays closed until it passes inspection.</p>'
      : '<p class="ok">✓ Passes the safety inspection</p>';
    const sel = e.sel != null ? e.towers[e.sel] : null;
    $('#pp-sel').hidden = !sel;
    if (!sel) $('#pp-count-of').textContent = e.towers.length ? `${e.towers.length} pylons · ▶ to start` : 'no pylons yet';
    if (sel) {
      const rank = this.pylonOrder ? this.pylonOrder.indexOf(e.sel) + 1 : e.sel + 1;
      $('#pp-sel-name').textContent = `Pylon ${rank} · ${Math.round(sel.s)} m along the line`;
      $('#pp-count-of').textContent = `${rank} of ${e.towers.length}`;
      const style = Lifts.pylonType(l, sel), maxH = Lifts.maxPylonH(T, style);
      if (sel.h > maxH) sel.h = maxH;
      const r = $('#pp-h'); r.min = this.minPylon(T); r.max = maxH; r.value = sel.h;
      $('#pp-h-v').textContent = `${Math.round(sel.h)} m · ${money(Lifts.towerPrice(T, sel.h, style))}`;
      $('#pp-type').innerHTML = `<option value="">Lift default (${PYLONS[Lifts.pylonType(l)].name})</option>` +
        (T.pylons || []).map((k) => `<option value="${k}">${PYLONS[k].name} · up to ${Lifts.maxPylonH(T, k)} m</option>`).join('');
      $('#pp-type').value = sel.type || '';
      const inf = this.pylonInfo(e.sel), tr = inf && inf.t;
      const middle = tr && tr.linked && inf.pi > tr.i && inf.pi < tr.j;
      r.disabled = !!middle;
      $('#pp-h-note').textContent = middle ? 'This pylon sits inside a linked sheave train; its head follows the rope curve.' : '';
      const isY = sel.type === 'y' || sel.type === 'twin', twin = sel.type === 'twin';
      $('#pp-spread-row').hidden = !isY;
      $('#pp-lean-row').hidden = twin; $('#pp-align').hidden = twin;      // a Y leans as a whole, twin legs stay upright
      $('#pp-spread').min = twin ? 12 : 8; $('#pp-spread').max = twin ? 40 : 30;
      $('#pp-spread').value = sel.spread || (twin ? 22 : 16);
      $('#pp-spread-v').textContent = `${Math.round(sel.spread || (twin ? 22 : 16))} m between the ${twin ? 'legs' : 'heads'}`;
      $('#pp-lean').value = sel.lean || 0;
      $('#pp-lean-v').textContent = `${(sel.lean || 0).toFixed(0)}°${sel.lean ? (sel.lean > 0 ? ' uphill' : ' downhill') : ' (upright)'}`;
      $('#pp-link').checked = !!sel.link;
      $('#pp-link-note').textContent = tr && tr.linked
        ? `Linked train P${tr.i}–P${tr.j}: ${tr.n} wheels share a ${tr.deg.toFixed(1)}° bend.`
        : 'Link this pylon\'s sheaves to the next pylon (up to 4 pylons, at most 45 m apart) to spread a big bend over more wheels.';
      $('#pp-wheels').value = sel.wheels || 0;
      $('#pp-wheels-v').textContent = sel.wheels ? `${sel.wheels} wheels` : `auto (${tr ? tr.n : '?'})`;
      $('#pp-mode').value = sel.mode || 'auto';
      if (tr) {
        const over = tr.perWheel > MAX_BEND;
        $('#pp-bend').innerHTML = `Rope bends <b>${tr.deg.toFixed(1)}°</b> here, ${tr.press ? 'pressing down' : 'lifting up'} · <b class="${over ? 'neg' : ''}">${tr.perWheel.toFixed(1)}° per wheel</b> (max ${MAX_BEND}°) · ${SHEAVE_MODES[tr.mode].toLowerCase()} wheels`;
      }
    }
  },

  // Side view of the lift line: ground, rope (coloured by inspection), pylons. Vertical scale is
  // stretched to fit, so every pylon is visible and can be dragged in both directions.
  profileView() {
    const cv = $('#profile'), dpr = devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const e = this.edit, l = e.l, P = l.profileP, hl = P.hl;
    if (!this.profScale || this.profDrag == null) {
      let lo = Infinity, hi = -Infinity;
      for (let s = 0; s <= hl; s += 5) { const g = P.ground(s); lo = Math.min(lo, g); hi = Math.max(hi, g); }
      for (const p of P.prof) hi = Math.max(hi, p.y);
      hi = Math.max(hi, lo + 30);
      const pad = (hi - lo) * 0.12 + 8;
      this.profScale = { lo: lo - pad * 0.4, hi: hi + pad };
    }
    const { lo, hi } = this.profScale, ml = 46, mr = 14, mt = 12, mb = 22;
    return {
      cv, dpr, W, H, hl, P, l,
      sx: (s) => ml + (s / hl) * (W - ml - mr), xs: (x) => ((x - ml) / (W - ml - mr)) * hl,
      sy: (y) => mt + (1 - (y - lo) / (hi - lo)) * (H - mt - mb), ys: (py) => lo + (1 - (py - mt) / (H - mt - mb)) * (hi - lo),
      ml, mr, mt, mb, lo, hi,
    };
  },

  drawProfile() {
    const e = this.edit;
    if (!e || $('#profile-dock').hidden) return;
    const v = this.profileView(), { cv, dpr, W, H, hl, P, l, sx, sy } = v, T = l.T;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#eef3f8'; ctx.fillRect(0, 0, W, H);
    // elevation grid
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#6b7785'; ctx.strokeStyle = '#d7e0ea'; ctx.lineWidth = 1;
    const step = [10, 20, 50, 100, 200, 500].find((s) => (v.hi - v.lo) / s < 7) || 1000;
    for (let y = Math.ceil(v.lo / step) * step; y < v.hi; y += step) {
      ctx.beginPath(); ctx.moveTo(v.ml, sy(y)); ctx.lineTo(W - v.mr, sy(y)); ctx.stroke();
      ctx.fillText(`${Math.round(Terrain.elev(y))}`, 4, sy(y) + 4);
    }
    ctx.fillText('0 m', v.ml, H - 6);
    ctx.fillText(`${fmt(hl)} m`, W - v.mr - 46, H - 6);
    // ground
    ctx.beginPath(); ctx.moveTo(sx(0), H - v.mb);
    for (let s = 0; s <= hl; s += Math.max(2, hl / 400)) ctx.lineTo(sx(s), sy(P.ground(s)));
    ctx.lineTo(sx(hl), sy(P.ground(hl))); ctx.lineTo(sx(hl), H - v.mb); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#8a9aab'; ctx.lineWidth = 1.5; ctx.stroke();
    // carrier clearance line (bottom of the chairs/cabins)
    const insp = Lifts.inspect(T, P, l.a), hang = T.kind === 'surface' ? 0 : (T.hang || 1) * CS;
    if (hang) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#9aa7b5'; ctx.lineWidth = 1; ctx.beginPath();
      insp.samples.forEach((p, i) => { const X = sx(p.s), Y = sy(p.y - hang); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    // rope, coloured by inspection status
    const col = { ok: '#1fbf6a', low: '#ff9a1a', hit: '#ff3b2f', high: '#e6b800' };
    ctx.lineWidth = 3;
    for (let i = 0; i < insp.samples.length - 1; i++) {
      const p = insp.samples[i], q = insp.samples[i + 1];
      ctx.strokeStyle = col[p.st === 'ok' ? q.st : p.st];
      ctx.beginPath(); ctx.moveTo(sx(p.s), sy(p.y)); ctx.lineTo(sx(q.s), sy(q.y)); ctx.stroke();
    }
    // stations
    ctx.fillStyle = '#4a5562';
    for (const s of [0, hl]) { const g = P.ground(s); ctx.fillRect(sx(s) - 6, sy(g + T.towerH), 12, sy(g) - sy(g + T.towerH)); }
    // pylons
    const order = this.pylonOrder || e.towers.map((_, i) => i);
    e.towers.forEach((t, i) => {
      const inf = this.pylonInfo(i), headS = inf ? inf.head : t.s, g = P.ground(t.s), X = sx(t.s), sel = i === e.sel, hov = i === e.hover;
      const topY = inf ? inf.y : g + t.h, XH = sx(headS);
      ctx.strokeStyle = sel ? '#0aa8d6' : hov ? '#e0a400' : '#2b3440'; ctx.lineWidth = sel || hov ? 4 : 3;
      const style = Lifts.pylonType(l, t), w = Math.max(3, (sy(g) - sy(g + t.h)) * 0.12);
      ctx.beginPath();
      if (style === 'lattice') { ctx.moveTo(X - w, sy(g)); ctx.lineTo(XH, sy(topY)); ctx.lineTo(X + w, sy(g)); }
      else if (style === 'portal') { ctx.moveTo(X - 4, sy(g)); ctx.lineTo(XH - 3, sy(topY)); ctx.lineTo(XH + 3, sy(topY)); ctx.lineTo(X + 4, sy(g)); }
      else if (style === 'twin' && inf && inf.heads.length > 1) {
        for (const h of inf.heads) { ctx.moveTo(sx(h.s), sy(P.ground(h.s))); ctx.lineTo(sx(h.s), sy(h.y)); }
        ctx.moveTo(sx(inf.heads[0].s) - 6, sy(inf.heads[0].y)); ctx.lineTo(sx(inf.heads[1].s) + 6, sy(inf.heads[1].y));
      }
      else if (style === 'y' && inf && inf.heads.length > 1) {
        const fy = g + Math.max(3, Math.min((topY - g) * 0.3, 14));
        const shift = (inf.heads[0].s + inf.heads[1].s) / 2 - t.s, FX = sx(t.s + (shift * (fy - g)) / Math.max(1, t.h));
        ctx.moveTo(X, sy(g)); ctx.lineTo(FX, sy(fy));
        for (const h of inf.heads) { ctx.moveTo(FX, sy(fy)); ctx.lineTo(sx(h.s), sy(h.y)); }
      }
      else { ctx.moveTo(X, sy(g)); ctx.lineTo(XH, sy(topY)); }
      ctx.stroke();
      ctx.fillStyle = sel ? '#35e0ff' : hov ? '#ffcf5a' : '#ffffff';
      ctx.beginPath(); ctx.arc(XH, sy(topY), 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const tr = inf && inf.t;
      if (tr && inf.pi === tr.i) {                     // draw each train once (linked trains span several pylons)
        const over = tr.perWheel > MAX_BEND, bad = over || (tr.mode === 'support' && !tr.press && tr.deg > 0.3) || (tr.mode === 'hold' && tr.press && tr.deg > 0.3);
        const top = sy(topY), wr = Math.min(4, Math.max(2, (sx(tr.sp) - sx(0)) * 0.45));
        if (tr.linked) {
          ctx.strokeStyle = '#0aa8d6'; ctx.lineWidth = 2; ctx.beginPath();
          ctx.moveTo(sx(tr.s0), sy(tr.yAt(tr.s0)) + wr * 2.6); ctx.lineTo(sx(tr.s1), sy(tr.yAt(tr.s1)) + wr * 2.6); ctx.stroke();
        }
        for (const set of tr.mode === 'both' ? ['support', 'hold'] : [tr.mode]) {
          for (const ws of tr.wheelS) {
            const X2 = sx(ws), Y2 = sy(tr.yAt(ws)) + (set === 'hold' ? -wr - 1 : wr + 1);
            ctx.beginPath(); ctx.arc(X2, Y2, wr, 0, Math.PI * 2);
            ctx.fillStyle = bad ? '#ff3b2f' : '#3a3f46'; ctx.fill();
          }
        }
        if (bad) { ctx.fillStyle = '#ff3b2f'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillText('!', X + 8, top + 4); }
      }
      if (sel || hov || e.towers.length <= 14) {
        ctx.fillStyle = '#1b2430'; ctx.font = (sel ? 'bold ' : '') + '11px system-ui, sans-serif';
        ctx.fillText(`P${order.indexOf(i) + 1} ${Math.round(t.h)} m${t.lean ? ` ${Math.round(t.lean)}°` : ''}`, XH - 18, sy(topY) - 10);
      }
    });
    // ghost pylon under the mouse
    if (this.profGhost) {
      const { s, h } = this.profGhost, g = P.ground(s);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#2b3440'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx(s), sy(g)); ctx.lineTo(sx(s), sy(g + h)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#1b2430'; ctx.fillText(`+ ${Math.round(h)} m · ${money(Lifts.towerPrice(T, h, Lifts.pylonType(l)))}`, sx(s) + 6, sy(g + h) - 4);
    }
  },

  bindProfile() {
    const cv = $('#profile');
    const at = (ev) => {
      const r = cv.getBoundingClientRect(), v = this.profileView(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      const s = v.xs(x), T = this.edit.l.T, g = v.P.ground(clamp(s, 0, v.hl));
      return { v, x, y, s, h: clamp(v.ys(y) - g, this.minPylon(T), Lifts.maxPylonH(T, Lifts.pylonType(this.edit.l))) };
    };
    const near = (p) => {
      let best = null, bd = 9;
      this.edit.towers.forEach((t, i) => { const d = Math.abs(p.v.sx(t.s) - p.x); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    cv.addEventListener('pointermove', (ev) => {
      const e = this.edit; if (!e) return;
      const p = at(ev);
      if (this.profDrag != null) {
        const t = e.towers[this.profDrag];
        t.s = clamp(p.s, 12, p.v.hl - 12); t.h = Math.round(p.h);
        if (!this.profRaf) this.profRaf = requestAnimationFrame(() => { this.profRaf = 0; this.applyPylons(); });
        return;
      }
      const hov = near(p);
      e.hover = hov;
      this.profGhost = hov == null && p.s > 12 && p.s < p.v.hl - 12 ? { s: p.s, h: Math.round(p.h) } : null;
      this.drawPylonOverlay();
    });
    cv.addEventListener('pointerleave', () => { if (this.edit && this.profDrag == null) { this.profGhost = null; this.edit.hover = null; this.drawPylonOverlay(); } });
    cv.addEventListener('pointerdown', (ev) => {
      const e = this.edit; if (!e) return;
      const p = at(ev);
      if (ev.button === 2) { const i = near(p); if (i != null) { e.sel = i; this.removePylon(); } return; }
      let i = near(p);
      if (i == null && p.s > 12 && p.s < p.v.hl - 12) { e.towers.push({ s: p.s, h: Math.round(p.h) }); i = e.towers.length - 1; }
      if (i == null) return;
      const changed = e.sel !== i;
      e.sel = i; this.profDrag = i; this.profGhost = null;
      if (changed) this.focusPylon(i);
      cv.setPointerCapture(ev.pointerId);
      this.applyPylons();
    });
    cv.addEventListener('pointerup', () => { if (this.profDrag != null) { this.profDrag = null; this.profScale = null; this.applyPylons(); } });
    cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
    addEventListener('resize', () => this.drawProfile());
  },

  // select pylon i (draft index), refresh, and fly the camera to it
  selectPylon(i, focus = true) {
    const e = this.edit;
    if (!e || i == null || !e.towers[i]) return;
    e.sel = i;
    this.applyPylons();
    if (focus) this.focusPylon(i);
  },

  // side view of one pylon, framed to its height, from whichever side of the line the camera is on
  focusPylon(i) {
    const e = this.edit;
    if (!e || !this.pylonFocus) return;
    const l = e.l, t = e.towers[i], inf = this.pylonInfo(i);
    const hs = inf ? inf.head : t.s, x = l.a.x + l.dir.ux * hs, z = l.a.z + l.dir.uz * hs;
    const g = Terrain.height(l.a.x + l.dir.ux * t.s, l.a.z + l.dir.uz * t.s), top = inf ? inf.y : g + t.h;
    const span = inf && inf.heads.length > 1 ? Math.abs(inf.heads[1].s - inf.heads[0].s) : 0;
    const side = Math.sign((this.camera.position.x - x) * l.dir.px + (this.camera.position.z - z) * l.dir.pz) || 1;
    const dist = Math.max(70, (top - g) * 2.4 + span * 1.2);
    this.flyTo({ x, y: g + (top - g) * 0.6, z }, dist, { x: l.dir.px * side + l.dir.ux * 0.35, y: 0.32, z: l.dir.pz * side + l.dir.uz * 0.35 });
  },

  // previous / next pylon along the line
  stepPylon(dir) {
    const e = this.edit;
    if (!e || !e.towers.length) return;
    const order = e.towers.map((_, i) => i).sort((a, b) => e.towers[a].s - e.towers[b].s);
    const k = e.sel == null ? (dir > 0 ? -1 : order.length) : order.indexOf(e.sel);
    const next = order[clamp(k + dir, 0, order.length - 1)];
    if (next !== e.sel) this.selectPylon(next);
  },

  removePylon() {
    const e = this.edit;
    if (e.sel == null) return;
    e.towers.splice(e.sel, 1); e.sel = null; e.hover = null;
    this.applyPylons();
  },

  finishPylons() {
    const e = this.edit, l = e.l, T = l.T;
    const diff = l.planned ? 0 : Lifts.towersValue(T, e.towers, Lifts.pylonType(l)) - e.origValue;
    if (diff > 0 && diff > Game.money) return UI.toast(`Not enough money for these pylons (${money(diff)}).`);
    if (diff > 0) Game.spend(diff); else Game.money -= diff / 2;
    this.edit = null;
    this.drawPylonOverlay();
    if (l.planned) UI.toast(`📐 ${l.name} plan updated${l.issues.length ? `. It would fail inspection: ${l.issues[0]}` : '. It would pass inspection'}.`);
    else if (l.issues.length) UI.toast(`${l.name} failed the safety inspection and stays closed: ${l.issues[0]}.`);
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
    $('#profile-dock').hidden = true;
  },

  bindPylonPanel() {
    $('#pp-h').oninput = (ev) => { const e = this.edit; if (e && e.sel != null) { e.towers[e.sel].h = +ev.target.value; this.applyPylons(); } };
    $('#pp-del').onclick = () => this.removePylon();
    $('#pp-prev').onclick = () => this.stepPylon(-1);
    $('#pp-next').onclick = () => this.stepPylon(1);
    $('#pp-focus').checked = this.pylonFocus;
    $('#pp-focus').onchange = (ev) => { this.pylonFocus = ev.target.checked; if (this.pylonFocus && this.edit && this.edit.sel != null) this.focusPylon(this.edit.sel); };
    $('#pp-spread').oninput = (ev) => { const e = this.edit; if (e && e.sel != null) { e.towers[e.sel].spread = +ev.target.value; this.applyPylons(); } };
    $('#pp-lean').oninput = (ev) => { const e = this.edit; if (e && e.sel != null) { e.towers[e.sel].lean = +ev.target.value || 0; if (!e.towers[e.sel].lean) delete e.towers[e.sel].lean; this.applyPylons(); } };
    $('#pp-align').onclick = () => {
      const e = this.edit; if (!e || e.sel == null) return;
      const inf = this.pylonInfo(e.sel); if (!inf || !inf.t) return;
      e.towers[e.sel].lean = Math.round(Lifts.alignedLean(inf.t));
      this.applyPylons();
    };
    $('#pp-link').onchange = (ev) => { const e = this.edit; if (e && e.sel != null) { if (ev.target.checked) e.towers[e.sel].link = true; else delete e.towers[e.sel].link; this.applyPylons(); } };
    $('#pp-wheels').oninput = (ev) => {
      const e = this.edit; if (!e || e.sel == null) return;
      const n = +ev.target.value; if (n) e.towers[e.sel].wheels = n; else delete e.towers[e.sel].wheels;
      this.applyPylons();
    };
    $('#pp-mode').onchange = (ev) => {
      const e = this.edit; if (!e || e.sel == null) return;
      if (ev.target.value === 'auto') delete e.towers[e.sel].mode; else e.towers[e.sel].mode = ev.target.value;
      this.applyPylons();
    };
    $('#pp-mode').innerHTML = Object.entries(SHEAVE_MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#pp-type').onchange = (ev) => {
      const e = this.edit; if (!e || e.sel == null) return;
      if (ev.target.value) e.towers[e.sel].type = ev.target.value; else delete e.towers[e.sel].type;
      this.applyPylons();
    };
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
    let lastGroup = null;
    for (const [key, T] of Object.entries(LIFT_TYPES)) {
      const group = T.kind === 'belt' || T.kind === 'surface' ? 'Surface lifts' : T.kind === 'tram' ? 'Cable car' : T.enclosed ? 'Gondolas' : 'Chairlifts';
      if (group !== lastGroup) { const h = document.createElement('div'); h.className = 'pk-group'; h.textContent = group; box.appendChild(h); lastGroup = group; }
      const cap = T.kind === 'tram' ? 'about 400' : fmt((T.seats / T.interval) * 3600);
      const b = document.createElement('button');
      b.className = 'pick' + (key === this.liftType ? ' active' : '');
      b.innerHTML = `<span class="pk-ico">${T.icon}</span><span class="pk-name">${T.name}</span>
        <span class="pk-meta">${cap}/h · ${T.speed} m/s · ≤ ${fmt(T.maxLen)} m${T.cold === 0 ? ' · enclosed' : ''}</span>
        <span class="pk-meta">${money(T.baseCost)} + €${T.perM}/m${T.towerCost ? ` + ${money(T.towerCost)}/pylon` : ''}${T.seats > 4 && T.kind !== 'tram' ? ` · ${T.seats} per ${T.enclosed ? 'cabin' : 'chair'}` : ''}</span>
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
    const ps = $('#lp-pylon');
    ps.innerHTML = (T.pylons || []).filter((k) => !PYLONS[k].perPylon).map((k) => `<option value="${k}">${PYLONS[k].name}</option>`).join('');
    ps.value = Lifts.pylonType(l);
    $('#lp-pylon-row').hidden = !(T.pylons || []).length;
    $('#lp-colors').innerHTML = (T.kind === 'belt' ? [] : LIFT_COLORS).map((c) => {
      const hex = '#' + c.toString(16).padStart(6, '0');
      return `<button class="swatch${(l.opt.color != null ? l.opt.color : T.color) === c ? ' on' : ''}" data-c="${c}" style="background:${hex}" aria-label="Colour ${hex}"></button>`;
    }).join('');
    for (const b of $('#lp-colors').querySelectorAll('.swatch')) b.onclick = () => { Net.recolorLift(l, +b.dataset.c); Save.write(); this.openLiftPanel(l); };
    $('#lp-color-row').hidden = T.kind === 'belt';
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
    const line = Net.lineOf(l), sec = line.indexOf(l) + 1;
    $('#lp-type').textContent = `${T.icon} ${T.name}${l.planned ? ' · 📐 planned' : ''}${line.length > 1 ? ` · section ${sec} of ${line.length}` : ''}`;
    $('#lp-station').hidden = !Lifts.canHaveStations(T);
    $('#lp-unstation').hidden = !Lifts.partnerAbove(l);
    if (Lifts.partnerAbove(l)) {
      const up = Lifts.partnerAbove(l), bend = Lifts.bendAngle(l, up);
      $('#lp-unstation').textContent = `Remove the ${bend > 3 ? `angle station (${Math.round(bend)}°)` : 'station'} at the top of this section`;
    }
    $('#lp-speed-v').textContent = `${(Lifts.speed(l)).toFixed(1)} m/s`;
    $('#lp-density-v').textContent = `${Math.round(l.opt.density * 100)}%`;
    $('#lp-stats').innerHTML = `
      <div class="row"><span>Length / climb</span><b>${fmt(l.len)} m / ${fmt(l.vert)} m</b></div>
      <div class="row"><span>Pylons</span><b>${l.towers}${l.customTowers ? ' <small>(placed by you)</small>' : ''}</b></div>
      <div class="row"><span>Capacity</span><b>${fmt(Lifts.capacity(l))} skiers/h</b></div>
      <div class="row"><span>Ride time</span><b>${(Lifts.rideTime(l) / 60).toFixed(1)} min</b></div>
      <div class="row"><span>Queue</span><b>${l.queue.length}${l.queue.length ? ` · ~${Math.round(Lifts.waitTime(l) / 60)} min` : ''}</b></div>
      <div class="row"><span>Rides today</span><b>${fmt(l.ridesToday)}${l.ridesYesterday != null ? ` <small>(yesterday ${fmt(l.ridesYesterday)})</small>` : ''}</b></div>
      <div class="row"><span>Running cost</span><b class="neg">${money(-Lifts.dailyCost(l))}/day${l.planned ? ' <small>(once built)</small>' : ''}</b></div>`;
    const plan = Net.upgradePlan(l, $('#lp-up').value);
    $('#lp-up-go').textContent = plan.ok ? (l.planned ? 'Change type' : `Upgrade · ${money(plan.cost)}`) : 'Upgrade';
    $('#lp-up-go').disabled = !plan.ok;
    $('#lp-up-msg').textContent = plan.ok ? '' : plan.msg;
    $('#lp-remove').textContent = `Remove lift (refund ${money(l.cost / 2)})`;
    const sp = Net.pylonStylePlan(l, $('#lp-pylon').value);
    $('#lp-pylon-note').textContent = `${PYLONS[Lifts.pylonType(l)].desc} Max height ${Lifts.maxPylonH(T, Lifts.pylonType(l))} m.`;
    $('#lp-inspect').innerHTML = l.issues && l.issues.length ? `<p class="danger">⚠ ${l.planned ? 'Would fail' : 'Failed'} safety inspection: ${l.issues.join('; ')}</p>` : '';
    $('#lp-plan').hidden = !l.planned;
    $('#lp-open-row').hidden = !!l.planned;
    if (l.planned) $('#lp-build').textContent = `Build it · ${money(Net.planCost(l).total)}`;
    $('#lp-remove').hidden = false;
    if (l.planned) $('#lp-remove').textContent = 'Delete plan';
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
    $('#lp-pylon').onchange = (e) => {
      const l = L(), r = Net.setPylonStyle(l, e.target.value);
      if (!r.ok) { UI.toast(r.msg); e.target.value = Lifts.pylonType(l); return; }
      UI.toast(`${l.name}: ${PYLONS[e.target.value].name.toLowerCase()} pylons${r.charge > 0 ? ` for ${money(r.charge)}` : r.charge < 0 ? `, refund ${money(-r.charge)}` : ''}`);
      Save.write(); this.refreshLiftPanel();
    };
    $('#lp-up-go').onclick = () => {
      const l = L(), from = l.T.name, plan = Net.upgradeLift(l, $('#lp-up').value);
      if (!plan.ok) return UI.toast(plan.msg);
      UI.toast(`${l.name}: ${from} → ${l.T.name} for ${money(plan.cost)}`);
      Save.write(); this.openLiftPanel(l);
    };
    $('#lp-build').onclick = () => this.buildPlan(L());
    $('#lp-move-a').onclick = () => this.startMove(L(), 'a');
    $('#lp-move-b').onclick = () => this.startMove(L(), 'b');
    $('#lp-station').onclick = () => { const l = L(); this.closeLiftPanel(); this.stationLift = l; this.setTool('station'); };
    $('#lp-unstation').onclick = () => {
      const l = L(), r = Net.removeStation(l.b);
      if (!r.ok) return UI.toast(r.msg);
      UI.toast('Station removed: the two sections are one lift again'); Save.write(); this.openLiftPanel(l);
    };
    $('#lp-remove').onclick = () => {
      const l = L();
      if (!$('#lp-remove').classList.contains('confirm')) {
        $('#lp-remove').classList.add('confirm'); $('#lp-remove').textContent = 'Click again to remove'; return;
      }
      $('#lp-remove').classList.remove('confirm');
      this.closeLiftPanel(); Net.remove(l); UI.toast(`Removed ${l.name}`); Save.write(); this.refreshPlans();
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
    const plan = Net.runPlan(d.pts, this.planMode, this.grade());
    if (!plan.ok) { d.pts.pop(); this.updateHover(); return UI.toast(plan.msg); }
    plan.planned = this.planMode;
    const r = Net.buildRun(plan);
    UI.toast(plan.planned ? `📐 Planned ${r.name} (${DIFF[r.diff].name}): about ${money(plan.cost)} when you build it` : `${r.name} (${DIFF[r.diff].name}) built for ${money(plan.cost)}`);
    this.refreshPlans();
    this.clearEarthPreview();
    if (plan.gradeDeg) this.refreshEarthworks();
    Save.write();
    this.draft = { pts: [] };
    this.updateHover();
  },

  // ---------- loop ----------
  camDist() { return this.camera.position.distanceTo(this.controls.target); },

  // Smoothly move the orbit centre to `target`, ending `dist` metres away, optionally from direction `dir`.
  flyTo(target, dist, dir = null) {
    const c = this.camera, t = this.controls.target;
    const off = dir ? new THREE.Vector3(dir.x, dir.y, dir.z).normalize() : c.position.clone().sub(t).normalize();
    this.fly = {
      t0: performance.now(), dur: 700,
      fromT: t.clone(), toT: new THREE.Vector3(target.x, target.y, target.z),
      fromP: c.position.clone(), toP: new THREE.Vector3(target.x, target.y, target.z).add(off.multiplyScalar(dist)),
    };
  },

  updateCamera(dt) {
    const c = this.camera, t = this.controls.target;
    if (this.fly) {
      const f = this.fly, u = Math.min(1, (performance.now() - f.t0) / f.dur), e = u * u * (3 - 2 * u);
      t.lerpVectors(f.fromT, f.toT, e); c.position.lerpVectors(f.fromP, f.toP, e);
      if (u >= 1) this.fly = null;
    }
    // keyboard: WASD / arrows pan, Q/E rotate
    const k = this.keys || new Set(), dist = this.camDist();
    let fx = 0, fz = 0, rot = 0;
    if (k.has('w') || k.has('arrowup')) fz += 1;
    if (k.has('s') || k.has('arrowdown')) fz -= 1;
    if (k.has('a') || k.has('arrowleft')) fx -= 1;
    if (k.has('d') || k.has('arrowright')) fx += 1;
    if (k.has('q')) rot += 1;
    if (k.has('e')) rot -= 1;
    if (fx || fz) {
      const fwd = t.clone().sub(c.position); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x), sp = dist * 0.9 * dt;
      const mv = fwd.multiplyScalar(fz * sp).add(right.multiplyScalar(fx * sp));
      t.add(mv); c.position.add(mv);
    }
    if (rot) {
      const off = c.position.clone().sub(t).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * 1.4 * dt);
      c.position.copy(t).add(off);
    }
    // keep the orbit centre on the map and resting on the ground, and the camera above the snow
    const cx = clamp(t.x, 0, Terrain.W), cz = clamp(t.z, 0, Terrain.D);
    if (cx !== t.x || cz !== t.z) { c.position.x += cx - t.x; c.position.z += cz - t.z; t.x = cx; t.z = cz; }
    if (!this.fly) {
      const dy = (Terrain.height(t.x, t.z) - t.y) * Math.min(1, dt * 6);
      t.y += dy; c.position.y += dy;
    }
    const floor = Terrain.inside(c.position.x, c.position.z) ? Terrain.height(c.position.x, c.position.z) + 12 : -Infinity;
    if (c.position.y < floor) c.position.y = floor;
    // near plane follows the zoom so close-ups don't clip and far views don't z-fight
    const near = clamp(dist / 400, 0.5, 20);
    if (Math.abs(near - c.near) / c.near > 0.2) { c.near = near; c.updateProjectionMatrix(); }
    // pylon handles keep a readable on-screen size
    if (this.editGroup) for (const m of this.editGroup.children) if (m.userData.handle) m.scale.setScalar(Math.max(1, c.position.distanceTo(m.position) / 350));
  },

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
    this.updateCamera(dt);
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
    if ((this.planTimer = (this.planTimer || 0) + 1) % 8 === 0) this.refreshPlans();
  },
};

addEventListener('DOMContentLoaded', () => {
  App.init();
  const again = new URLSearchParams(location.search).get('new');
  if (again && window.SKI_MAPS[again]) { history.replaceState(null, '', location.pathname); App.start(again, null); }
});
