'use strict';
// Real-world heightfield: x = metres east, z = metres south (from the NW corner),
// y = metres above the lowest point of the map (add map.minH for elevation a.s.l.).

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Terrain = {
  load(map) {
    this.map = map;
    this.nx = map.w; this.nz = map.h; this.cell = map.cell;
    const bin = atob(map.heights), n = this.nx * this.nz;
    const H = new Float32Array(n);
    let max = 0;
    for (let i = 0; i < n; i++) {
      H[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) * map.scale;
      if (H[i] > max) max = H[i];
    }
    this.H = H; this.maxY = max;
    this.W = (this.nx - 1) * this.cell;
    this.D = (this.nz - 1) * this.cell;
  },

  inside(x, z) { return x >= 0 && z >= 0 && x <= this.W && z <= this.D; },
  elev(y) { return y + this.map.minH; },

  height(x, z) {
    const c = this.cell, nx = this.nx, H = this.H;
    const fx = Math.min(Math.max(x / c, 0), nx - 1.0001);
    const fz = Math.min(Math.max(z / c, 0), this.nz - 1.0001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * nx + i;
    return (H[k] * (1 - tx) + H[k + 1] * tx) * (1 - tz) +
           (H[k + nx] * (1 - tx) + H[k + nx + 1] * tx) * tz;
  },

  // gradient as rise/run (0.25 = 25 %)
  slope(x, z) {
    const e = this.cell;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  },

  buildMesh() {
    const { nx, nz, cell: c, H } = this;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
    const at = (i, j) => H[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, y = H[k];
        pos[3 * k] = i * c; pos[3 * k + 1] = y; pos[3 * k + 2] = j * c;
        const g = Math.hypot(at(i + 1, j) - at(i - 1, j), at(i, j + 1) - at(i, j - 1)) / (2 * c);
        const e = this.elev(y);
        const noise = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1 * 0.05;
        const rock = smoothstep(0.72, 1.05, g);
        const forest = 1 - smoothstep(1300, 1650, e);
        let r = 0.95 - forest * 0.07, gr = 0.965 - forest * 0.05, b = 1.0 - forest * 0.04;
        r = r * (1 - rock) + (0.42 + noise) * rock;
        gr = gr * (1 - rock) + (0.41 + noise) * rock;
        b = b * (1 - rock) + (0.43 + noise) * rock;
        col[3 * k] = r; col[3 * k + 1] = gr; col[3 * k + 2] = b;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let p = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1;
        idx[p++] = a; idx[p++] = cc; idx[p++] = b;
        idx[p++] = b; idx[p++] = cc; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.baseColors = col;
    this.slopeColors = this.makeSlopeColors(col);
    this.mesh = null;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    return this.mesh;
  },

  // Piste-grade overlay: blue <= 25 %, red <= 40 %, black <= 90 %, purple = too steep.
  makeSlopeColors(base) {
    const { nx, nz, cell: c, H } = this, out = new Float32Array(base.length);
    const at = (i, j) => H[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
    const tint = [[0.55, 0.72, 1.0], [1.0, 0.62, 0.6], [0.38, 0.38, 0.42], [0.62, 0.35, 0.75]];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const g = Math.hypot(at(i + 2, j) - at(i - 2, j), at(i, j + 2) - at(i, j - 2)) / (4 * c);
      const t = tint[g <= 0.25 ? 0 : g <= 0.4 ? 1 : g <= 0.9 ? 2 : 3];
      for (let q = 0; q < 3; q++) out[3 * k + q] = base[3 * k + q] * 0.35 + t[q] * 0.65;
    }
    return out;
  },

  showSlopeMap(on) {
    if (!this.mesh || this.slopeOn === on) return;
    this.slopeOn = on;
    const attr = this.mesh.geometry.attributes.color;
    attr.array.set(on ? this.slopeColors : this.baseColors);
    attr.needsUpdate = true;
  },

  // Earth-coloured walls around the map so it reads like a diorama block.
  buildSkirt() {
    const { nx, nz, cell: c, H } = this, bottom = -160;
    const pos = [];
    const edge = (pts) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, z0, y0] = pts[k], [x1, z1, y1] = pts[k + 1];
        pos.push(x0, y0, z0, x0, bottom, z0, x1, y1, z1, x1, y1, z1, x0, bottom, z0, x1, bottom, z1);
      }
    };
    const row = (j) => Array.from({ length: nx }, (_, i) => [i * c, j * c, H[j * nx + i]]);
    const colm = (i) => Array.from({ length: nz }, (_, j) => [i * c, j * c, H[j * nx + i]]);
    edge(row(0)); edge(row(nz - 1)); edge(colm(0)); edge(colm(nx - 1));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x6d5f52, side: THREE.DoubleSide }));
  },

  buildTrees() {
    const rnd = mulberry32(1234), step = 30, pts = [];
    for (let z = step / 2; z < this.D; z += step) {
      for (let x = step / 2; x < this.W; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.9, pz = z + (rnd() - 0.5) * step * 0.9;
        const e = this.elev(this.height(px, pz));
        let p = e < 1250 ? 0.92 : e < 1620 ? 0.92 * (1620 - e) / 370 : 0;
        if (this.slope(px, pz) > 0.85) p *= 0.15;
        p *= 0.55 + 0.6 * (0.5 + 0.5 * Math.sin(px * 0.0031 + 1.3) * Math.cos(pz * 0.0027 - 0.4));
        if (rnd() < p) pts.push(px, pz, 0.7 + rnd() * 0.7);
      }
    }
    const count = pts.length / 3;
    const geo = new THREE.ConeGeometry(5.5, 22, 7).translate(0, 11, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    const colA = new THREE.Color(0x26442f), colB = new THREE.Color(0x3d5c3f), tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = pts[3 * i], z = pts[3 * i + 1], k = pts[3 * i + 2];
      m.compose(v.set(x, this.height(x, z) - 1, z), q, s.set(k, k * (0.9 + 0.3 * rnd()), k));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tmp.copy(colA).lerp(colB, rnd()));
    }
    const B = 100, bw = Math.ceil(this.W / B) + 1, buckets = new Map();
    for (let i = 0; i < count; i++) {
      const key = Math.floor(pts[3 * i + 1] / B) * bw + Math.floor(pts[3 * i] / B);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    }
    this.trees = { mesh, pts, alive: new Uint8Array(count).fill(1), total: count, left: count, B, bw, buckets };
    return mesh;
  },

  // indices of standing trees within `radius` of a polyline (a single point works too)
  treesNear(line, radius) {
    const t = this.trees, found = new Set();
    if (!t) return [];
    const { B, bw, buckets, pts, alive } = t, step = Math.min(8, radius / 2), r2 = radius * radius;
    const probe = (x, z) => {
      for (let bz = Math.floor((z - radius) / B); bz <= Math.floor((z + radius) / B); bz++) {
        for (let bx = Math.floor((x - radius) / B); bx <= Math.floor((x + radius) / B); bx++) {
          const list = buckets.get(bz * bw + bx);
          if (list) for (const i of list) {
            if (!alive[i]) continue;
            const dx = pts[3 * i] - x, dz = pts[3 * i + 1] - z;
            if (dx * dx + dz * dz < r2) found.add(i);
          }
        }
      }
    };
    probe(line[0].x, line[0].z);
    for (let k = 0; k < line.length - 1; k++) {
      const a = line[k], b = line[k + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step);
      for (let j = 1; j <= n; j++) probe(a.x + ((b.x - a.x) * j) / n, a.z + ((b.z - a.z) * j) / n);
    }
    return [...found];
  },

  cutTrees(indices) {
    const t = this.trees;
    if (!t || !indices.length) return 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let n = 0;
    for (const i of indices) if (t.alive[i]) { t.alive[i] = 0; t.mesh.setMatrixAt(i, zero); n++; }
    t.left -= n;
    t.mesh.instanceMatrix.needsUpdate = true;
    return n;
  },

  // 1 bit per tree, base64 — trees are generated from a fixed seed, so this restores them exactly
  treeMask() {
    const a = this.trees.alive, bytes = new Uint8Array(Math.ceil(a.length / 8));
    for (let i = 0; i < a.length; i++) if (!a[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  },
  applyTreeMask(mask) {
    const bin = atob(mask), cut = [];
    for (let i = 0; i < this.trees.alive.length; i++) if (bin.charCodeAt(i >> 3) & (1 << (i & 7))) cut.push(i);
    this.cutTrees(cut);
  },

  clearTrees(line, radius) { return this.cutTrees(this.treesNear(line, radius)); },
};

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
