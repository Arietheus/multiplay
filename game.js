// Void-Shell-style runs: co-op gravity bullet-hell waves. Authoritative sim
// using the shared physics, the emit/lob pattern system, enemy KINDS, and the
// brood maw boss — all ported from the uploaded game. Lobby stays a social room.

const crypto = require('crypto');
const Physics = require('./public/physics');
const { PW, PH, FLOOR_TOP, W, H } = Physics;

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- player combat constants (Void Shell BASE) ----
const MAX_HP = 5, IFRAMES = 92, CORE = 7.5;
const FIRE_CD = 7, BULLET_SPEED = 8.4, BULLET_LIFE = 64, BULLET_DMG = 1;
const DASH_CD = 150, DASH_TIME = 10, DASH_SPEED = 11;
const CHAT_MAX = 200, RUN_CAP = 8;
const BOSS_EVERY = +process.env.VS_BOSS_EVERY || 5;   // every Nth wave is the boss

// ---- geometry: floor + arenas (Void Shell LAYOUTS) ----
const FLOOR = { x: 0, y: FLOOR_TOP, w: W, h: H - FLOOR_TOP, solid: true };
const LEDGE_L = { x: 0, y: FLOOR_TOP, w: 268, h: H - FLOOR_TOP, solid: true };
const LEDGE_R = { x: 492, y: FLOOR_TOP, w: W - 492, h: H - FLOOR_TOP, solid: true };
const ledge = (x, y, w) => ({ x, y, w, h: 13 });

const ARENAS = [
  { name: 'Ledges', platforms: [FLOOR,
    ledge(80, 346, 150), ledge(530, 346, 150), ledge(305, 278, 150),
    ledge(30, 210, 120), ledge(610, 210, 120), ledge(300, 144, 160)] },
  { name: 'Spine', platforms: [FLOOR,
    ledge(190, 352, 110), ledge(460, 352, 110), ledge(70, 284, 100),
    ledge(325, 284, 110), ledge(590, 284, 100), ledge(215, 216, 150),
    ledge(495, 216, 150), ledge(355, 150, 120)] },
  { name: 'Terraces', platforms: [FLOOR,
    ledge(25, 348, 140), ledge(210, 312, 140), ledge(395, 276, 140),
    ledge(580, 240, 140), ledge(330, 172, 150)] },
  { name: 'Chasm', platforms: [LEDGE_L, LEDGE_R,
    ledge(300, 352, 160), ledge(96, 282, 120), ledge(544, 282, 120),
    ledge(320, 214, 120), ledge(150, 146, 110), ledge(500, 146, 110)] },
  { name: 'Pillars', platforms: [FLOOR,
    ledge(110, 350, 90), ledge(335, 350, 90), ledge(560, 350, 90),
    ledge(40, 282, 90), ledge(225, 282, 90), ledge(445, 282, 90), ledge(640, 282, 90),
    ledge(170, 214, 100), ledge(490, 214, 100), ledge(330, 148, 110)] },
];
function arenaLevel(i) {
  const a = ARENAS[i % ARENAS.length];
  return { name: a.name, width: W, height: H, spawn: { x: W / 2 - PW / 2, y: 350 }, platforms: a.platforms };
}
// Lobby: a calm single-screen room with a Runs door.
function lobbyLevel() {
  return { name: 'Lobby', width: W, height: H, spawn: { x: 90, y: 360 },
    platforms: [FLOOR, ledge(120, 348, 150), ledge(360, 300, 150), ledge(600, 348, 130), ledge(300, 210, 170)],
    doors: [{ x: 355, y: 250, w: 60, h: 50, type: 'run-browser', label: 'RUNS' }] };
}

// ---- enemies + bosses (Void Shell) ----
const KINDS = {
  drifter: { w: 15, h: 13, hp: 2, points: 10 },
  spitter: { w: 19, h: 17, hp: 4, points: 18 },
  diver:   { w: 17, h: 11, hp: 2, points: 14 },
};
const BOSSES = { maw: { name: 'brood maw', w: 76, h: 54, hpMul: 1.0 } };

let nextId = 1;
const rooms = new Map();
const players = new Map();

function colorFor(uid) {
  const hue = crypto.createHash('md5').update(String(uid)).digest()[0] * 360 / 255;
  return `hsl(${Math.round(hue)},70%,60%)`;
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const centerOf = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

function makeRoom(id, level, meta = {}) {
  const room = { id, level, players: new Set(), foes: [], foeShots: [], pBullets: [],
    wave: 0, phase: 'idle', timer: 0, ...meta };
  rooms.set(id, room);
  return room;
}
function ensureLobby() { if (!rooms.has('lobby')) makeRoom('lobby', lobbyLevel(), { kind: 'lobby' }); return rooms.get('lobby'); }

function send(p, o) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(o)); }
function broadcast(id, o) {
  const room = rooms.get(id); if (!room) return;
  const d = JSON.stringify(o);
  for (const uid of room.players) { const p = players.get(uid); if (p && p.ws.readyState === 1) p.ws.send(d); }
}

// ---- connection lifecycle ----
function onConnection(ws, user) {
  const uid = String(user.id);
  const existing = players.get(uid);
  if (existing) { try { existing.ws.close(4001, 'replaced'); } catch {} leaveRoom(existing, true); }

  const p = { ws, userId: uid, username: user.username, color: colorFor(uid),
    ...Physics.newState({ x: 0, y: 0 }),
    input: { left: false, right: false, jump: false, down: false },
    queue: [], lastSeq: 0, roomId: null, alive: true,
    hp: MAX_HP, iframes: 0, dead: false, score: 0,
    aim: { x: 1, y: 0 }, firing: false, fireCd: 0, dashCd: 0, dashT: 0, dashX: 1, dashY: 0 };
  players.set(uid, p);
  ws.on('pong', () => { p.alive = true; });

  send(p, { type: 'welcome', user: { id: uid, username: user.username } });
  joinRoom(p, ensureLobby());

  ws.on('message', (raw) => { if (raw.length > 2048) return; let m; try { m = JSON.parse(raw); } catch { return; } handle(p, m); });
  const bye = () => { leaveRoom(p); players.delete(uid); };
  ws.on('close', bye); ws.on('error', bye);
}

function joinRoom(p, room) {
  p.roomId = room.id; room.players.add(p.userId);
  Object.assign(p, Physics.newState(room.level.spawn));
  p.queue.length = 0; p.hp = MAX_HP; p.dead = false; p.iframes = 60; p.firing = false;
  send(p, { type: 'room', id: room.id, name: room.level.name, kind: room.kind,
    width: room.level.width, height: room.level.height,
    platforms: room.level.platforms, doors: room.level.doors || [], spawn: room.level.spawn });
  broadcast(room.id, { type: 'system', text: `${p.username} entered.` });
  if (room.kind === 'run' && room.phase === 'idle') startWave(room);
}
function leaveRoom(p, silent) {
  const room = rooms.get(p.roomId); if (!room) return;
  room.players.delete(p.userId);
  if (!silent) broadcast(room.id, { type: 'system', text: `${p.username} left.` });
  if (room.kind === 'run' && room.players.size === 0) rooms.delete(room.id);
  p.roomId = null;
}
function switchRoom(p, room) { leaveRoom(p); joinRoom(p, room); }

// ---- messages ----
function handle(p, m) {
  switch (m.type) {
    case 'input': {
      const k = m.k | 0;
      p.queue.push({ seq: m.seq | 0, left: !!(k & 1), right: !!(k & 2), jump: !!(k & 4), down: !!(k & 8) });
      if (p.queue.length > 180) p.queue.shift();
      break;
    }
    case 'aim': { const x = +m.x, y = +m.y, l = Math.hypot(x, y); if (l > 0) p.aim = { x: x / l, y: y / l }; break; }
    case 'fire': p.firing = !!m.down; break;
    case 'dash': requestDash(p); break;
    case 'interact': tryInteract(p); break;
    case 'createRun': createRun(p); break;
    case 'joinRun': joinRun(p, m.id); break;
    case 'listRuns': sendRunList(p); break;
    case 'chat': { let t = typeof m.text === 'string' ? m.text : ''; t = t.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CHAT_MAX);
      if (t) broadcast(p.roomId, { type: 'chat', from: p.username, color: p.color, text: t }); break; }
  }
}

function requestDash(p) {
  if (p.dead || p.dashCd > 0 || p.dashT > 0) return;
  p.dashT = DASH_TIME; p.dashCd = DASH_CD; p.iframes = Math.max(p.iframes, DASH_TIME + 4);
  let ax = p.aim.x, ay = p.aim.y; const l = Math.hypot(ax, ay) || 1; p.dashX = ax / l; p.dashY = ay / l;
}

function doorUnder(p) { const room = rooms.get(p.roomId); if (!room || !room.level.doors) return null;
  return room.level.doors.find((d) => overlap({ x: p.x, y: p.y, w: PW, h: PH }, d)) || null; }
function tryInteract(p) { const d = doorUnder(p); if (!d) return;
  if (d.type === 'leave') switchRoom(p, ensureLobby()); else if (d.type === 'run-browser') sendRunList(p); }
function sendRunList(p) { const runs = [];
  for (const r of rooms.values()) if (r.kind === 'run') runs.push({ id: r.id, host: r.host, count: r.players.size, cap: RUN_CAP, wave: r.wave });
  send(p, { type: 'runList', runs }); }
function createRun(p) { const id = 'run:' + crypto.randomBytes(3).toString('hex');
  const room = makeRoom(id, arenaLevel(0), { kind: 'run', host: p.username, arena: 0 }); switchRoom(p, room); }
function joinRun(p, id) { const room = rooms.get(id);
  if (!room || room.kind !== 'run') return send(p, { type: 'system', text: 'That run no longer exists.' });
  if (room.players.size >= RUN_CAP) return send(p, { type: 'system', text: 'That run is full.' });
  switchRoom(p, room); }

// ---- wave manager ----
function alivePlayers(room) { return [...room.players].map((u) => players.get(u)).filter((p) => p && !p.dead); }
function nearestPlayer(room, x, y) {
  let best = null, bd = 1e9;
  for (const uid of room.players) { const p = players.get(uid); if (!p || p.dead) continue;
    const d = Math.hypot(p.x + PW / 2 - x, p.y + PH / 2 - y); if (d < bd) { bd = d; best = p; } }
  return best;
}
function startWave(room) {
  room.wave++;
  room.phase = 'fight';
  // revive anyone who died last wave
  for (const uid of room.players) { const p = players.get(uid); if (p) { p.dead = false; p.hp = MAX_HP; p.iframes = 60; } }
  if (room.wave % BOSS_EVERY === 0) { spawnBoss(room); return; }
  const n = 3 + Math.floor(room.wave * 1.3);
  const kinds = ['drifter', 'spitter', 'diver'];
  for (let i = 0; i < n; i++) {
    const kind = kinds[Math.floor(Math.random() * (room.wave < 2 ? 1 : kinds.length))];
    spawnFoe(room, kind);
  }
  broadcast(room.id, { type: 'wave', wave: room.wave });
}
function makeFoe(room, kind, x, y) {
  const k = KINDS[kind];
  return { id: nextId++, kind, x, y, w: k.w, h: k.h, vx: 0, vy: 0,
    hp: k.hp + Math.floor(room.wave / 3), t: Math.floor(rand(0, 60)), phase: 'in', cd: Math.floor(rand(40, 110)), hit: 0 };
}
function spawnFoe(room, kind) {
  const s = Math.random(); let x, y;
  if (s < 0.4) { x = -26; y = rand(50, 300); } else if (s < 0.8) { x = W + 26; y = rand(50, 300); } else { x = rand(60, W - 60); y = -26; }
  room.foes.push(makeFoe(room, kind, x, y));
}
function spawnBoss(room) {
  const cfg = BOSSES.maw, tier = Math.ceil(room.wave / BOSS_EVERY);
  const hp = Math.round((84 + 82 * (tier - 1)) * cfg.hpMul);
  room.foes.push({ id: nextId++, kind: 'boss', boss: 'maw', x: W / 2 - cfg.w / 2, y: -80,
    w: cfg.w, h: cfg.h, vx: 0, vy: 0, hp, maxHp: hp, t: 0, phase: 'entry', pt: 0, charge: 0, volley: 0, hit: 0, tier });
  broadcast(room.id, { type: 'wave', wave: room.wave, boss: cfg.name });
}

// ---- pattern emitters (Void Shell emit/lob) ----
function emit(room, x, y, spec) {
  const n = spec.n ?? 1, speed = spec.speed ?? 3, arc = spec.arc ?? TAU;
  const ring = arc >= TAU - 0.001, base = spec.aim ? Math.atan2(spec.aim.y, spec.aim.x) : 0;
  const spin = spec.spin ?? 0, jitter = spec.jitter ?? 0;
  for (let i = 0; i < n; i++) {
    const off = ring ? (i / n) * TAU : (n === 1 ? 0 : (i / (n - 1) - 0.5) * arc);
    const a = base + spin + off + (jitter ? rand(-jitter, jitter) : 0);
    room.foeShots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: spec.life ?? 180, r: spec.r ?? 3, g: spec.g ?? 0 });
  }
}
function lob(room, x, y, spec) {
  const n = spec.n ?? 1;
  for (let i = 0; i < n; i++) room.foeShots.push({ x, y, vx: rand(-spec.spread, spec.spread), vy: -rand(spec.lift * 0.75, spec.lift), g: spec.g ?? 0.19, life: spec.life ?? 280, r: spec.r ?? 3.6 });
}

// ---- foe AI ----
function stepFoe(room, f) {
  f.t++; if (f.hit > 0) f.hit--;
  const tgt = nearestPlayer(room, f.x + f.w / 2, f.y + f.h / 2);
  const pc = tgt ? { x: tgt.x + PW / 2, y: tgt.y + PH / 2 } : { x: W / 2, y: H / 2 };
  const c = centerOf(f);
  if (f.kind === 'boss') return stepMaw(room, f, pc);

  const dx = pc.x - c.x, dy = pc.y - c.y, dist = Math.hypot(dx, dy) || 1;
  if (f.kind === 'drifter') {
    f.vx += (dx / dist) * 0.05; f.vy += (dy / dist) * 0.05;
    f.vx = clamp(f.vx, -1.7, 1.7); f.vy = clamp(f.vy, -1.5, 1.5);
    if (--f.cd <= 0) { lob(room, c.x, c.y, { n: 1, spread: 1.4, lift: 4.2 }); f.cd = rand(90, 150); }
  } else if (f.kind === 'spitter') {
    const want = 180; const pull = dist > want ? 0.04 : -0.03;
    f.vx += (dx / dist) * pull; f.vy += (dy / dist) * pull * 0.6;
    f.vx *= 0.96; f.vy *= 0.96;
    if (--f.cd <= 0) { emit(room, c.x, c.y, { n: 3, speed: 2.6, arc: 0.5, aim: { x: dx, y: dy } }); f.cd = rand(70, 110); }
  } else if (f.kind === 'diver') {
    if (f.phase === 'in') { f.vx += (dx / dist) * 0.06; f.vy += (dy / dist) * 0.04; f.vx *= 0.95; f.vy *= 0.95;
      if (dist < 190 && --f.cd <= 0) { f.phase = 'dive'; f.dvx = dx / dist; f.dvy = dy / dist; f.charge = 8; } }
    else { if (f.charge > 0) { f.charge--; f.vx *= 0.8; f.vy *= 0.8; } else { f.vx = f.dvx * 6.5; f.vy = f.dvy * 6.5; if (f.t % 90 === 0) f.phase = 'in', f.cd = 60; } }
  }
  f.x += f.vx; f.y += f.vy;
  f.x = clamp(f.x, -30, W + 30 - f.w); f.y = clamp(f.y, -30, FLOOR_TOP - f.h - 2);
}

function stepMaw(room, f, pc) {
  const c = centerOf(f), dx = pc.x - c.x, dy = pc.y - c.y, dist = Math.hypot(dx, dy) || 1;
  const enraged = f.hp < f.maxHp * 0.4;
  if (f.phase === 'entry') { f.vx = 0; f.vy = 1.7; if (f.y >= 52) { f.y = 52; f.vy = 0; f.phase = 'hover'; f.pt = 0; } }
  else if (f.phase === 'hover') {
    f.pt++;
    const tx = pc.x - f.w / 2 + Math.sin(f.t * 0.018) * 205;
    f.vx += Math.sign(tx - f.x) * 0.06; f.vx *= 0.94; f.vx = clamp(f.vx, -2.3, 2.3);
    f.vy = Math.sin(f.t * 0.03) * 0.7;
    if (f.pt > (enraged ? 48 : 84)) { f.pt = 0; f.volley = 0; const r = Math.random();
      f.phase = r < 0.42 ? 'barrage' : r < 0.72 ? 'brood' : 'slam'; f.charge = f.phase === 'slam' ? 30 : 34; }
  } else if (f.phase === 'barrage') {
    f.vx *= 0.9; f.vy *= 0.9;
    if (f.charge > 0) { if (--f.charge === 0) f.pt = 0; }
    else { f.pt++; if (f.pt % 15 === 0) { emit(room, c.x, c.y, { n: 9 + f.tier * 2, speed: 2.75, spin: f.volley * 0.24 + f.t * 0.01, life: 180 }); f.volley++;
      if (f.volley >= (enraged ? 4 : 3)) { f.phase = 'hover'; f.pt = 0; } } }
  } else if (f.phase === 'brood') {
    f.vx *= 0.9; f.vy *= 0.9;
    if (--f.charge <= 0) { const n = Math.min(3 + f.tier, 6); for (let i = 0; i < n; i++) room.foes.push(makeFoe(room, 'drifter', c.x - 8 + rand(-34, 34), c.y + rand(14, 30))); f.phase = 'hover'; f.pt = 0; }
  } else if (f.phase === 'slam') {
    if (f.charge > 0) { f.charge--; f.vx *= 0.85; f.vy = -0.9; if (f.charge === 0) { const s = enraged ? 9.9 : 8.2; f.vx = (dx / dist) * s; f.vy = (dy / dist) * s; } }
    else { f.vx *= 0.97; f.vy += 0.3; if (f.y + f.h >= FLOOR_TOP - 2 || f.t % 140 === 0) { emit(room, c.x, c.y + 10, { n: 12, speed: 3.1, arc: Math.PI, aim: { x: 0, y: -1 }, life: 150 }); f.phase = 'hover'; f.pt = 0; } }
  }
  f.x += f.vx; f.y += f.vy;
  f.x = clamp(f.x, 8, W - f.w - 8); f.y = clamp(f.y, 0, FLOOR_TOP - f.h - 2);
}

// ---- damage ----
function damageFoe(room, f, amount, owner) {
  f.hp -= amount; f.hit = 5;
  if (f.hp <= 0) {
    room.foes.splice(room.foes.indexOf(f), 1);
    const pts = f.kind === 'boss' ? 200 + room.wave * 10 : (KINDS[f.kind]?.points || 5);
    if (owner) owner.score += pts;
    if (f.kind === 'boss') broadcast(room.id, { type: 'system', text: `${BOSSES[f.boss].name} down!` });
  }
}
function hurtPlayer(p) {
  if (p.dead || p.iframes > 0) return;
  p.hp--; p.iframes = IFRAMES;
  if (p.hp <= 0) { p.dead = true; p.hp = 0; broadcast(p.roomId, { type: 'system', text: `${p.username} went down.` }); }
}

// ---- main sim (60Hz) ----
function simulate() {
  for (const room of rooms.values()) {
    // players
    for (const uid of room.players) {
      const p = players.get(uid); if (!p) continue;
      if (p.iframes > 0) p.iframes--;
      if (p.dashCd > 0) p.dashCd--;
      if (p.fireCd > 0) p.fireCd--;

      if (p.dashT > 0) {                        // dash overrides normal movement
        p.dashT--; p.vx = p.dashX * DASH_SPEED; p.vy = p.dashY * DASH_SPEED * 0.72;
        p.x += p.vx; p.y += p.vy;
        p.x = clamp(p.x, 0, W - PW); p.y = clamp(p.y, 0, H);
        while (p.queue.length) { const inp = p.queue.shift(); p.lastSeq = inp.seq; p.input = inp; }
      } else {
        while (p.queue.length) { const inp = p.queue.shift(); if (!p.dead) Physics.step(p, inp, room.level); p.lastSeq = inp.seq; p.input = inp; }
      }
      // firing
      if (room.kind === 'run' && p.firing && !p.dead && p.fireCd <= 0) {
        const a = p.aim, c = { x: p.x + PW / 2, y: p.y + PH / 2 };
        room.pBullets.push({ x: c.x, y: c.y, vx: a.x * BULLET_SPEED, vy: a.y * BULLET_SPEED, life: BULLET_LIFE, owner: p.userId, color: p.color });
        p.fireCd = FIRE_CD;
      }
      // fell into chasm
      if (p.y > H + 40 && !p.dead) { hurtPlayer(p); Object.assign(p, Physics.newState(room.level.spawn)); }
    }

    if (room.kind !== 'run') continue;

    // foes
    for (const f of [...room.foes]) stepFoe(room, f);
    // foe contact damage
    for (const uid of room.players) { const p = players.get(uid); if (!p || p.dead) continue;
      const core = { x: p.x + PW / 2 - CORE / 2, y: p.y + PH / 2 - CORE / 2, w: CORE, h: CORE };
      for (const f of room.foes) if (overlap(f, core)) { hurtPlayer(p); break; } }

    // foe shots
    const fs = [];
    for (const b of room.foeShots) {
      if (b.g) b.vy += b.g; b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) continue;
      // solid platforms stop shots
      let dead = false; for (const pl of room.level.platforms) if (pl.solid && b.x > pl.x && b.x < pl.x + pl.w && b.y > pl.y && b.y < pl.y + pl.h) { dead = true; break; }
      if (dead) continue;
      // hit player cores
      let struck = false;
      for (const uid of room.players) { const p = players.get(uid); if (!p || p.dead || p.iframes > 0) continue;
        const cx = p.x + PW / 2, cy = p.y + PH / 2; if (Math.abs(b.x - cx) < CORE / 2 + b.r && Math.abs(b.y - cy) < CORE / 2 + b.r) { hurtPlayer(p); struck = true; break; } }
      if (!struck) fs.push(b);
    }
    room.foeShots = fs;

    // player bullets
    const pb = [];
    for (const b of room.pBullets) {
      b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0 || b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) continue;
      let dead = false; for (const pl of room.level.platforms) if (pl.solid && b.x > pl.x && b.x < pl.x + pl.w && b.y > pl.y && b.y < pl.y + pl.h) { dead = true; break; }
      if (dead) continue;
      let struck = false;
      for (const f of room.foes) if (b.x > f.x && b.x < f.x + f.w && b.y > f.y && b.y < f.y + f.h) { damageFoe(room, f, BULLET_DMG, players.get(b.owner)); struck = true; break; }
      if (!struck) pb.push(b);
    }
    room.pBullets = pb;

    // wave progression
    if (room.phase === 'fight' && room.foes.length === 0) { room.phase = 'interlude'; room.timer = 90; }
    else if (room.phase === 'interlude' && --room.timer <= 0) startWave(room);

    // all players down -> run fails, back to lobby
    if (room.players.size > 0 && alivePlayers(room).length === 0) {
      broadcast(room.id, { type: 'system', text: 'Run failed — returning to the lobby.' });
      for (const uid of [...room.players]) { const p = players.get(uid); if (p) switchRoom(p, ensureLobby()); }
    }
  }
}

// ---- broadcast (30Hz), per-recipient reconciliation ----
function broadcastStates() {
  for (const room of rooms.values()) {
    if (room.players.size === 0) continue;
    const list = Array.from(room.players, (uid) => { const p = players.get(uid); return p && {
      id: p.userId, name: p.username, color: p.color, x: Math.round(p.x), y: Math.round(p.y),
      face: p.face, hp: p.hp, dead: p.dead, iframes: p.iframes, aimx: +p.aim.x.toFixed(2), aimy: +p.aim.y.toFixed(2) }; }).filter(Boolean);
    const foes = room.foes.map((f) => ({ id: f.id, kind: f.kind, boss: f.boss || null, x: Math.round(f.x), y: Math.round(f.y),
      w: f.w, h: f.h, hp: f.hp, maxHp: f.maxHp || 0, hit: f.hit || 0 }));
    const fshots = room.foeShots.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), r: b.r }));
    const pshots = room.pBullets.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), color: b.color }));
    for (const uid of room.players) {
      const p = players.get(uid); if (!p || p.ws.readyState !== 1) continue;
      p.ws.send(JSON.stringify({ type: 'state', players: list, foes, fshots, pshots, wave: room.wave,
        you: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, coyote: p.coyote, jumps: p.jumps,
          face: p.face, dropThru: p.dropThru, buffer: p.buffer, pjump: p.pjump, hp: p.hp, dead: p.dead,
          dashT: p.dashT, dashCd: p.dashCd, score: p.score, lastSeq: p.lastSeq } }));
    }
  }
}

function heartbeat() { for (const p of players.values()) { if (p.alive === false) { try { p.ws.terminate(); } catch {} continue; } p.alive = false; try { p.ws.ping(); } catch {} } }

function start() { ensureLobby(); setInterval(simulate, 1000 / 60); setInterval(broadcastStates, 1000 / 30); setInterval(heartbeat, 25000); }

module.exports = { onConnection, start };
