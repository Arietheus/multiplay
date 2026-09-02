// Game world: authoritative platformer physics, lobby + run instances,
// door interactions, and per-room chat.
//
// The server owns every position. Clients send *intent* (which keys are held)
// and draw whatever snapshot the server last sent. That's what keeps movement
// consistent for everyone and makes basic cheating (teleporting) impossible.

const crypto = require('crypto');

// ---- Physics tuning (StarBreak-ish: momentum, not instant, snappy jump) ----
const GRAV = 2200;        // px/s^2
const MOVE_ACCEL = 7000;  // ground horizontal acceleration
const AIR_ACCEL = 4200;   // weaker control in the air
const MAX_RUN = 340;      // top horizontal speed
const FRICTION = 4200;    // ground deceleration when no input
const JUMP_VEL = -780;    // initial jump impulse (up is negative)
const JUMP_CUTOFF = 0.45; // releasing jump early trims upward velocity
const MAX_FALL = 1500;    // terminal velocity
const COYOTE = 0.10;      // s of grace to still jump after leaving a ledge
const JUMP_BUFFER = 0.12; // s a jump press is remembered before landing
const PW = 26, PH = 38;   // player hitbox

const TICK_HZ = 30;
const SUBSTEP = 1 / 120;  // physics integrated in small steps to avoid tunneling
const CHAT_MAX = 200;
const RUN_CAP = 8;

// ---- Levels (swap these for procedural generation later) ----
function lobbyLevel() {
  return {
    name: 'Lobby', width: 1800, height: 1000, spawn: { x: 200, y: 760 },
    platforms: [
      { x: 0, y: 860, w: 1800, h: 140 },   // floor
      { x: 300, y: 700, w: 240, h: 40 },
      { x: 700, y: 600, w: 240, h: 40 },
      { x: 1080, y: 520, w: 280, h: 40 },
      { x: 1460, y: 680, w: 240, h: 40 },
      { x: 0, y: 0, w: 40, h: 1000 },       // left wall
      { x: 1760, y: 0, w: 40, h: 1000 },    // right wall
    ],
    doors: [{ x: 1150, y: 390, w: 90, h: 130, type: 'run-browser', label: 'Runs' }],
  };
}

function runLevel() {
  return {
    name: 'Run', width: 2200, height: 1000, spawn: { x: 150, y: 780 },
    platforms: [
      { x: 0, y: 900, w: 2200, h: 100 },
      { x: 260, y: 760, w: 200, h: 36 },
      { x: 560, y: 640, w: 200, h: 36 },
      { x: 880, y: 540, w: 220, h: 36 },
      { x: 1240, y: 640, w: 200, h: 36 },
      { x: 1560, y: 520, w: 240, h: 36 },
      { x: 1900, y: 660, w: 200, h: 36 },
      { x: 0, y: 0, w: 40, h: 1000 },
      { x: 2160, y: 0, w: 40, h: 1000 },
    ],
    doors: [{ x: 60, y: 780, w: 80, h: 120, type: 'leave', label: 'Exit to Lobby' }],
  };
}

const rooms = new Map();   // roomId -> room
const players = new Map(); // userId -> player

function makeRoom(id, level, meta = {}) {
  const room = { id, level, players: new Set(), ...meta };
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
const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function send(p, obj) {
  if (p.ws.readyState === 1) p.ws.send(JSON.stringify(obj));
}
function broadcast(roomId, obj) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(obj);
  for (const uid of room.players) {
    const p = players.get(uid);
    if (p && p.ws.readyState === 1) p.ws.send(data);
  }
}

// ---- connection lifecycle ----
function onConnection(ws, user) {
  const uid = String(user.id);

  // One live session per account: kick the older socket if they reconnect.
  const existing = players.get(uid);
  if (existing) { try { existing.ws.close(4001, 'replaced'); } catch {} leaveRoom(existing); }

  const p = {
    ws, userId: uid, username: user.username, color: colorFor(uid),
    x: 0, y: 0, vx: 0, vy: 0, grounded: false, facing: 1,
    input: { left: false, right: false, jump: false },
    jumpBufferedUntil: 0, coyoteUntil: 0, roomId: null,
  };
  players.set(uid, p);

  send(p, { type: 'welcome', user: { id: uid, username: user.username } });
  joinRoom(p, ensureLobby());

  ws.on('message', (raw) => {
    if (raw.length > 2048) return; // ignore absurd payloads
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
  p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0; p.grounded = false;
  send(p, {
    type: 'room', id: room.id, name: room.level.name, kind: room.kind,
    width: room.level.width, height: room.level.height,
    platforms: room.level.platforms, doors: room.level.doors,
  });
  broadcast(room.id, { type: 'system', text: `${p.username} entered.` });
}

function leaveRoom(p) {
  const room = rooms.get(p.roomId);
  if (!room) return;
  room.players.delete(p.userId);
  broadcast(room.id, { type: 'system', text: `${p.username} left.` });
  if (room.kind === 'run' && room.players.size === 0) rooms.delete(room.id); // GC empty runs
  p.roomId = null;
}
function switchRoom(p, room) { leaveRoom(p); joinRoom(p, room); }

// ---- message handling ----
function handle(p, msg) {
  switch (msg.type) {
    case 'input': {
      const left = !!msg.left, right = !!msg.right, jump = !!msg.jump;
      const now = Date.now() / 1000;
      if (jump && !p.input.jump) p.jumpBufferedUntil = now + JUMP_BUFFER; // press
      if (!jump && p.input.jump && p.vy < 0) p.vy *= JUMP_CUTOFF;         // release
      if (left && !right) p.facing = -1; else if (right && !left) p.facing = 1;
      p.input = { left, right, jump };
      break;
    }
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

function doorUnder(p) {
  const room = rooms.get(p.roomId);
  if (!room) return null;
  const box = { x: p.x, y: p.y, w: PW, h: PH };
  return room.level.doors.find((d) => aabb(box, d)) || null;
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

// ---- physics ----
function integrate(p, room, dt) {
  const now = Date.now() / 1000;
  const plats = room.level.platforms;

  let dir = 0;
  if (p.input.left && !p.input.right) dir = -1;
  else if (p.input.right && !p.input.left) dir = 1;

  const accel = p.grounded ? MOVE_ACCEL : AIR_ACCEL;
  if (dir !== 0) {
    p.vx = Math.max(-MAX_RUN, Math.min(MAX_RUN, p.vx + dir * accel * dt));
  } else if (p.grounded) {
    if (p.vx > 0) p.vx = Math.max(0, p.vx - FRICTION * dt);
    else if (p.vx < 0) p.vx = Math.min(0, p.vx + FRICTION * dt);
  }

  if (now <= p.jumpBufferedUntil && (p.grounded || now <= p.coyoteUntil)) {
    p.vy = JUMP_VEL; p.jumpBufferedUntil = 0; p.coyoteUntil = 0; p.grounded = false;
  }

  p.vy = Math.min(MAX_FALL, p.vy + GRAV * dt);

  // X axis
  p.x += p.vx * dt;
  let box = { x: p.x, y: p.y, w: PW, h: PH };
  for (const pl of plats) {
    if (aabb(box, pl)) {
      p.x = p.vx > 0 ? pl.x - PW : pl.x + pl.w;
      p.vx = 0; box.x = p.x;
    }
  }
  // Y axis
  const wasGrounded = p.grounded;
  p.grounded = false;
  p.y += p.vy * dt;
  box = { x: p.x, y: p.y, w: PW, h: PH };
  for (const pl of plats) {
    if (aabb(box, pl)) {
      if (p.vy > 0) { p.y = pl.y - PH; p.grounded = true; }
      else if (p.vy < 0) p.y = pl.y + pl.h;
      p.vy = 0; box.y = p.y;
    }
  }
  if (p.grounded || wasGrounded) p.coyoteUntil = now + COYOTE;

  // world bounds / fell out
  p.x = Math.max(0, Math.min(room.level.width - PW, p.x));
  if (p.y > room.level.height + 200) {
    const s = room.level.spawn; p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0;
  }
}

let last = Date.now();
function tick() {
  const now = Date.now();
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;

  for (const room of rooms.values()) {
    let remaining = dt;
    while (remaining > 0) {
      const sdt = Math.min(SUBSTEP, remaining);
      for (const uid of room.players) { const p = players.get(uid); if (p) integrate(p, room, sdt); }
      remaining -= sdt;
    }
    broadcast(room.id, {
      type: 'state',
      players: Array.from(room.players, (uid) => {
        const p = players.get(uid);
        return p && { id: p.userId, name: p.username, color: p.color,
          x: Math.round(p.x), y: Math.round(p.y), facing: p.facing };
      }).filter(Boolean),
    });
  }
}

function start() { ensureLobby(); setInterval(tick, 1000 / TICK_HZ); }

module.exports = { onConnection, start };
