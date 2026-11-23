'use strict';
// HTML labels pinned to 3D positions.
const Labels = {
  root: null, items: new Set(), v: null,

  init(root) { this.root = root; this.v = new THREE.Vector3(); },

  add(html, cls, pos) {
    const el = document.createElement('div');
    el.className = 'label ' + (cls || '');
    el.innerHTML = html;
    this.root.appendChild(el);
    const it = {
      el, pos, visible: true, html,
      set(h) { if (h !== it.html) { it.html = h; el.innerHTML = h; } },
      show(b) { it.visible = b; },
      remove: () => { el.remove(); this.items.delete(it); },
    };
    this.items.add(it);
    return it;
  },

  clear() { for (const it of this.items) it.el.remove(); this.items.clear(); },

  update(camera, w, h) {
    const v = this.v;
    for (const it of this.items) {
      const p = typeof it.pos === 'function' ? it.pos() : it.pos;
      v.set(p.x, p.y, p.z).project(camera);
      const off = !it.visible || v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      if (off) { if (it.el.style.display !== 'none') it.el.style.display = 'none'; continue; }
      if (it.el.style.display === 'none') it.el.style.display = '';
      it.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  },
};
