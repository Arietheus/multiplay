// Game world: authoritative simulation using the SHARED physics module, with
// input sequencing (for client prediction/reconciliation), bullets, rooms,
// doors, run instances, per-room chat, and a socket heartbeat.

const crypto = require('crypto');
const Physics = require('./public/physics');
const { PW, PH, DT } = Physics;

// ---- bullets ----
const BULLET_SPEED = 1050;
const BULLET_TTL = 78;        // ticks (~1.3s at 60Hz)
const BULLET_R = 5;
const FIRE_COOLDOWN_MS = 120;

const CHAT_MAX = 200;
const RUN_CAP = 8;

// ---- levels (platforms sit lower / closer to the floor now) ----
function lobbyLevel() {
  return {
    name: 'Lobby', width: 1800, height: 1000, spawn: { x: 200, y: 800 },
    platforms: [
      { x: 0, y: 880, w: 1800, h: 120 },   // floor
      { x: 300, y: 800, w: 240, h: 36 },
      { x: 720, y: 760, w: 220, h: 36 },
      { x: 1080, y: 720, w: 260, h: 36 },
      { x: 1440, y: 800, w: 220, h: 36 },
      { x: 0, y: 0, w: 40, h: 1000 },
      { x: 1760, y: 0, w: 40, h: 1000 },
    ],
    doors: [{ x: 1150, y: 590, w: 90, h: 130, type: 'run-browser', label: 'Runs' }],
  };
}
function runLevel() {
  return {
    name: 'Run', width: 2200, height: 1000, spawn: { x: 150, y: 820 },
    platforms: [
      { x: 0, y: 900, w: 2200, h: 100 },
      { x: 260, y: 820, w: 200, h: 36 },
      { x: 560, y: 760, w: 200, h: 36 },
      { x: 880, y: 700, w: 220, h: 36 },
      { x: 1240, y: 760, w: 200, h: 36 },
      { x: 1560, y: 700, w: 240, h: 36 },
      { x: 1900, y: 800, w: 200, h: 36 },
      { x: 0, y: 0, w: 40, h: 1000 },
      { x: 2160, y: 0, w: 40, h: 1000 },
    ],
    doors: [{ x: 60, y: 800, w: 80, h: 100, type: 'leave', label: 'Exit to Lobby' }],
  };
}

const rooms = new Map();
const players = new Map();

function makeRoom(id, level, meta = {}) {
  const room = { id, level, players: new Set(), bullets: [], ...meta };
  rooms.set(id, room);
  return room;
}
function ensureLobby() {
  if (!rooms.has('lobby')) makeRoom('lobby', lobbyLevel(), { kind: 'lobby' });
  return rooms.get('lobby');
}
function colorFor(userId) {
  const hue = crypto.createHash('md5').update(String(userId)).digest()[0] * 360 / 255;
  return `hsl(${Math.round(hue)},70%,55%)`;
}
const overlap = (ax, ay, aw, ah, b) =>
  ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;

function send(p, obj) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(obj)); }
function broadcast(roomId, obj) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(obj);
  for (const uid of room.players) {
    const p = players.get(uid);
    if (p && p.ws.readyState === 1) p.ws.send(data);
  }
}

// ---- lifecycle ----
function onConnection(ws, user) {
  const uid = String(user.id);

  const existing = players.get(uid);
  if (existing) { try { existing.ws.close(4001, 'replaced'); } catch {} leaveRoom(existing, true); }

  const p = {
    ws, userId: uid, username: user.username, color: colorFor(uid),
    ...Physics.newState({ x: 0, y: 0 }),
    input: { left: false, right: false, jump: false },
    queue: [], lastSeq: 0, fireReadyAt: 0, roomId: null, alive: true,
  };
  players.set(uid, p);

  ws.isAliveRef = p;
  ws.on('pong', () => { p.alive = true; });

  send(p, { type: 'welcome', user: { id: uid, username: user.username } });
  joinRoom(p, ensureLobby());

  ws.on('message', (raw) => {
    if (raw.length > 2048) return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    handle(p, msg);
  });
  const bye = () => { leaveRoom(p); players.delete(uid); };
  ws.on('close', bye);
  ws.on('error', bye);
}

function joinRoom(p, room) {
  p.roomId = room.id;
  room.players.add(p.userId);
  const s = room.level.spawn;
  Object.assign(p, Physics.newState(s)); // reset physics to spawn
  p.queue.length = 0;
  send(p, {
    type: 'room', id: room.id, name: room.level.name, kind: room.kind,
    width: room.level.width, height: room.level.height,
    platforms: room.level.platforms, doors: room.level.doors, spawn: s,
  });
  broadcast(room.id, { type: 'system', text: `${p.username} entered.` });
}
function leaveRoom(p, silent) {
  const room = rooms.get(p.roomId);
  if (!room) return;
  room.players.delete(p.userId);
  if (!silent) broadcast(room.id, { type: 'system', text: `${p.username} left.` });
  if (room.kind === 'run' && room.players.size === 0) rooms.delete(room.id);
  p.roomId = null;
}
function switchRoom(p, room) { leaveRoom(p); joinRoom(p, room); }

// ---- messages ----
function handle(p, msg) {
  switch (msg.type) {
    case 'input': {
      const k = msg.k | 0;
      p.queue.push({ seq: msg.seq | 0, left: !!(k & 1), right: !!(k & 2), jump: !!(k & 4) });
      if (p.queue.length > 180) p.queue.shift(); // guard against buildup
      break;
    }
    case 'shoot': fire(p, msg.ax, msg.ay); break;
    case 'interact': tryInteract(p); break;
    case 'createRun': createRun(p); break;
    case 'joinRun': joinRun(p, msg.id); break;
    case 'listRuns': sendRunList(p); break;
    case 'chat': {
      let t = typeof msg.text === 'string' ? msg.text : '';
      t = t.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CHAT_MAX);
      if (t) broadcast(p.roomId, { type: 'chat', from: p.username, color: p.color, text: t });
      break;
    }
  }
}

function fire(p, ax, ay) {
  const now = Date.now();
  if (now < p.fireReadyAt) return;
  ax = +ax; ay = +ay;
  const len = Math.hypot(ax, ay);
  if (!isFinite(len) || len === 0) return;
  ax /= len; ay /= len;
  p.fireReadyAt = now + FIRE_COOLDOWN_MS;
  const room = rooms.get(p.roomId);
  if (!room) return;
  room.bullets.push({
    x: p.x + PW / 2 + ax * 22, y: p.y + PH / 2 + ay * 22,
    vx: ax * BULLET_SPEED, vy: ay * BULLET_SPEED,
    ttl: BULLET_TTL, owner: p.userId, color: p.color,
  });
}

function doorUnder(p) {
  const room = rooms.get(p.roomId);
  if (!room) return null;
  return room.level.doors.find((d) => overlap(p.x, p.y, PW, PH, d)) || null;
}
function tryInteract(p) {
  const d = doorUnder(p);
  if (!d) return;
  if (d.type === 'leave') switchRoom(p, ensureLobby());
  else if (d.type === 'run-browser') sendRunList(p);
}
function sendRunList(p) {
  const runs = [];
  for (const r of rooms.values())
    if (r.kind === 'run') runs.push({ id: r.id, host: r.host, count: r.players.size, cap: RUN_CAP });
  send(p, { type: 'runList', runs });
}
function createRun(p) {
  const id = 'run:' + crypto.randomBytes(3).toString('hex');
  const room = makeRoom(id, runLevel(), { kind: 'run', host: p.username, createdAt: Date.now() });
  switchRoom(p, room);
}
function joinRun(p, id) {
  const room = rooms.get(id);
  if (!room || room.kind !== 'run') return send(p, { type: 'system', text: 'That run no longer exists.' });
  if (room.players.size >= RUN_CAP) return send(p, { type: 'system', text: 'That run is full.' });
  switchRoom(p, room);
}

// ---- simulation (fixed 60Hz) ----
function simulate() {
  for (const room of rooms.values()) {
    for (const uid of room.players) {
      const p = players.get(uid);
      if (!p) continue;
      // apply every queued input this tick (usually ~1); records last seq for acking
      while (p.queue.length) {
        const inp = p.queue.shift();
        Physics.step(p, inp, room.level);
        p.lastSeq = inp.seq;
        p.input = inp;
      }
    }
    // bullets
    const alive = [];
    for (const b of room.bullets) {
      b.x += b.vx * DT; b.y += b.vy * DT; b.ttl--;
      if (b.ttl <= 0) continue;
      if (b.x < 0 || b.x > room.level.width || b.y < 0 || b.y > room.level.height) continue;
      let hit = false;
      for (const pl of room.level.platforms)
        if (overlap(b.x - BULLET_R, b.y - BULLET_R, BULLET_R * 2, BULLET_R * 2, pl)) { hit = true; break; }
      if (!hit) alive.push(b);
    }
    room.bullets = alive;
  }
}

// ---- broadcast (30Hz), per-recipient so each gets their own reconciliation state ----
function broadcastStates() {
  for (const room of rooms.values()) {
    if (room.players.size === 0) continue;
    const list = Array.from(room.players, (uid) => {
      const p = players.get(uid);
      return p && { id: p.userId, name: p.username, color: p.color,
        x: Math.round(p.x), y: Math.round(p.y), facing: p.facing };
    }).filter(Boolean);
    const bullets = room.bullets.map((b) => ({
      x: Math.round(b.x), y: Math.round(b.y), vx: b.vx, vy: b.vy, color: b.color,
    }));
    for (const uid of room.players) {
      const p = players.get(uid);
      if (!p || p.ws.readyState !== 1) continue;
      p.ws.send(JSON.stringify({
        type: 'state', players: list, bullets,
        you: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded,
          coyote: p.coyote, buffer: p.buffer, pjump: p.pjump, facing: p.facing, lastSeq: p.lastSeq },
      }));
    }
  }
}

// ---- heartbeat: reap dead sockets, keep live ones alive through proxies ----
function heartbeat() {
  for (const p of players.values()) {
    if (p.alive === false) { try { p.ws.terminate(); } catch {} continue; }
    p.alive = false;
    try { p.ws.ping(); } catch {}
  }
}

function start() {
  ensureLobby();
  setInterval(simulate, 1000 / 60);
  setInterval(broadcastStates, 1000 / 30);
  setInterval(heartbeat, 25000);
}

module.exports = { onConnection, start };
