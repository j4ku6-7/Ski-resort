#!/usr/bin/env node
// Ski Resort save server: serves the game and stores each player's progress under a player ID.
// No dependencies. Run:  node server.js   (optional: PORT=8642 SAVES_DIR=./saves)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
// keep the port the same between runs: the browser keeps its saves per address, port included
const FIXED = !!process.env.PORT;
const PORT = +process.env.PORT || 8642;
const SAVES = path.resolve(process.env.SAVES_DIR || path.join(ROOT, 'saves'));
const MAX_BODY = 8 * 1024 * 1024;
const ID_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;     // Crockford base32, 10 characters
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
// only the game itself is served, never the saves folder or tools
const PUBLIC = ['index.html', 'css/', 'js/', 'vendor/', 'data/'];

fs.mkdirSync(SAVES, { recursive: true });

const file = (id) => path.join(SAVES, id + '.json');
function load(id) {
  try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch { return null; }
}
function store(id, doc) {
  const tmp = file(id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc));
  fs.renameSync(tmp, file(id));         // atomic, so a crash never leaves half a save
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { fail(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { fail(new Error('bad json')); } });
    req.on('error', fail);
  });
}

// GET    /api/players/ID              -> { id, resorts: { key: { save, best, savedAt, updatedAt } } }
// POST   /api/players/ID              -> registers the ID (no saves yet)
// PUT    /api/players/ID/RESORT       body { base, force, save, best, savedAt }  -> { updatedAt } or 409 { updatedAt }
//        (POST works the same, so the game can send it as a simple request that survives closing the tab)
// DELETE /api/players/ID/RESORT?base=&force=1  -> { updatedAt: null } or 409
// `base` is the updatedAt the client last synced; a mismatch means another computer saved in between.
async function api(req, res, parts, url) {
  const [id, resort] = parts;
  if (!ID_RE.test(id || '')) return send(res, 400, { error: 'bad player id' });
  if (resort !== undefined && !/^[a-z0-9_-]{1,40}$/.test(resort)) return send(res, 400, { error: 'bad resort' });
  const doc = load(id);
  if (req.method === 'GET' && resort === undefined) {
    if (!doc) return send(res, 404, { error: 'no such player' });
    return send(res, 200, doc);
  }
  if (resort === undefined && req.method === 'POST') {          // register an ID, so lookups can tell "empty" from "unknown"
    if (!doc) store(id, { id, created: new Date().toISOString(), resorts: {} });
    return send(res, 200, { id, created: !doc });
  }
  if (resort === undefined) return send(res, 405, { error: 'method not allowed' });
  const cur = doc && doc.resorts[resort];
  const at = cur ? cur.updatedAt : null;
  if (req.method === 'PUT' || req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    if (!body || typeof body.save !== 'object') return send(res, 400, { error: 'missing save' });
    if (!body.force && (body.base || null) !== at) return send(res, 409, { error: 'changed elsewhere', updatedAt: at });
    const d = doc || { id, created: new Date().toISOString(), resorts: {} };
    const updatedAt = Math.max(Date.now(), (at || 0) + 1);
    d.resorts[resort] = { save: body.save, best: body.best || null, savedAt: body.savedAt || null, updatedAt };
    store(id, d);
    return send(res, 200, { updatedAt });
  }
  if (req.method === 'DELETE') {
    const base = url.searchParams.get('base');
    if (!url.searchParams.get('force') && (base ? +base : null) !== at) return send(res, 409, { error: 'changed elsewhere', updatedAt: at });
    if (doc && cur) { delete doc.resorts[resort]; store(id, doc); }
    return send(res, 200, { updatedAt: null });
  }
  return send(res, 405, { error: 'method not allowed' });
}

function serveStatic(res, rel) {
  if (rel === '') rel = 'index.html';
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep) || !PUBLIC.some((p) => rel === p || (p.endsWith('/') && rel.startsWith(p))))
    return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
    return res.end();
  }
  const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
  if (parts[0] === 'api') {
    if (parts[1] === 'ping') return send(res, 200, { ok: true });
    if (parts[1] === 'players') return api(req, res, parts.slice(2), url).catch((e) => send(res, 500, { error: String(e) }));
    return send(res, 404, { error: 'not found' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  serveStatic(res, parts.join('/'));
});

// addresses other computers can use (not Docker / VM bridges)
function addresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/^(docker|br-|veth|virbr|vmnet|vboxnet|lxc|cni|flannel)/.test(name)) continue;
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal)
      out.push({ ip: a.address, note: /^tailscale/.test(name) || a.address.startsWith('100.') ? ' (Tailscale, works from anywhere on your tailnet)' : '' });
  }
  return out;
}

function listen(port, tries) {
  const onError = (e) => {
    server.removeListener('listening', onListening);
    if (e.code === 'EADDRINUSE' && !FIXED && tries > 0) {
      console.log(`Port ${port} is already used by another program, trying ${port + 1}…`);
      return listen(port + 1, tries - 1);
    }
    if (e.code === 'EADDRINUSE') console.error(`Port ${port} is already used by another program. Pick another one, for example:  PORT=${port + 1} node server.js`);
    else console.error(e.message);
    process.exit(1);
  };
  const onListening = () => {
    server.removeListener('error', onError);
    if (port !== PORT) console.log(`Note: the address is different from usual (port ${port} instead of ${PORT}). Your player ID still works: enter it in the menu.`);
    console.log(`Ski Resort is running. Saves are kept in ${SAVES}`);
    console.log(`  On this computer:   http://localhost:${port}/`);
    for (const a of addresses()) console.log(`  On your network:    http://${a.ip}:${port}/${a.note}`);
    console.log('Press Ctrl+C to stop.');
  };
  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(port, '0.0.0.0');
}
listen(PORT, 10);
