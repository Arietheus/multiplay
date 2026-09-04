// Void-Shell-style runs: co-op gravity bullet-hell waves. Authoritative sim
// using the shared physics, the emit/lob pattern system, enemy KINDS, and the
// brood maw boss — all ported from the uploaded game. Lobby stays a social room.

const crypto = require('crypto');
const Physics = require('./public/physics');
const db = require('./db');
const { PW, PH, FLOOR_TOP, W, H } = Physics;

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- player combat constants (Void Shell BASE) ----
const MAX_HP = 5, IFRAMES = 92, CORE = 7.5;
// Difficulty depths (Void Shell): count/speed/hp/bossHp/maxHp/score multipliers.
const DIFFS = [
  { id: 'shallow', name: 'Shallow',       count: 0.70, speed: 0.75, hpAdd: 0, bossMul: 0.70, maxHp: 7, score: 0.6 },
  { id: 'working', name: 'Working depth', count: 1.00, speed: 1.00, hpAdd: 0, bossMul: 1.00, maxHp: 5, score: 1.0 },
  { id: 'deep',    name: 'Deep cut',      count: 1.35, speed: 1.35, hpAdd: 1, bossMul: 1.35, maxHp: 4, score: 2.5 },
  { id: 'abyssal', name: 'Abyssal',       count: 1.70, speed: 1.70, hpAdd: 2, bossMul: 1.75, maxHp: 3, score: 3.8 },
];
// Admin accounts (comma-separated usernames in the ADMIN_USERS env var).
const ADMINS = new Set((process.env.ADMIN_USERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const FIRE_CD = 7, BULLET_SPEED = 8.4, BULLET_LIFE = 64, BULLET_DMG = 1;
const DASH_CD = 150, DASH_TIME = 10, DASH_SPEED = 11;
const CHAT_MAX = 200, RUN_CAP = 8;
const BOSS_EVERY = +process.env.VS_BOSS_EVERY || 5;   // every Nth wave is the boss

// ---- geometry: larger scrolling arenas (Void Shell ledges, bigger world) ----
const ledge = (x, y, w) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: 14 });
const ARENA_W = 1560, ARENA_H = 880;
const ARENA_NAMES = ['Ledges', 'Spine', 'Terraces', 'Chasm', 'Pillars'];
function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function genArena(name, seed) {
  const W2 = ARENA_W, H2 = ARENA_H, floorTop = H2 - 26, rng = mulberry(seed);
  const plats = [];
  if (name === 'Chasm') {
    plats.push({ x: 0, y: floorTop, w: Math.round(W2 * 0.32), h: 26, solid: true });
    plats.push({ x: Math.round(W2 * 0.68), y: floorTop, w: W2 - Math.round(W2 * 0.68), h: 26, solid: true });
    plats.push(ledge(W2 / 2 - 90, floorTop - 70, 180));   // island to fight over
  } else plats.push({ x: 0, y: floorTop, w: W2, h: 26, solid: true });
  const density = name === 'Pillars' ? 0.72 : name === 'Spine' ? 0.55 : 0.6;
  for (let r = 0; r < 6; r++) {
    const y = floorTop - 80 * (r + 1), step = name === 'Pillars' ? 150 : 200;
    const off = (r % 2) * (step / 2) + (name === 'Terraces' ? r * 60 : 0);
    for (let x = 70 + (off % step); x < W2 - 130; x += step) if (rng() < density) plats.push(ledge(x, y, 120 + rng() * 60));
  }
  return { name, width: W2, height: H2, floorTop, spawn: { x: W2 / 2 - PW / 2, y: floorTop - 60 }, platforms: plats };
}
function arenaLevel(i) { return genArena(ARENA_NAMES[i % ARENA_NAMES.length], ((i * 2654435761) >>> 0) ^ (Date.now() & 0xffff)); }

// Lobby: a large hall with a central gate that opens the runs.
const LOBBY_W = 1680, LOBBY_H = 900;
function lobbyLevel() {
  const floorTop = LOBBY_H - 26, gx = Math.round(LOBBY_W / 2 - 70), gy = floorTop - 150;
  return { name: 'Lobby', width: LOBBY_W, height: LOBBY_H, floorTop,
    spawn: { x: 160, y: floorTop - 60 },
    platforms: [{ x: 0, y: floorTop, w: LOBBY_W, h: 26, solid: true },
      ledge(180, floorTop - 90, 180), ledge(470, floorTop - 170, 170),
      ledge(LOBBY_W - 360, floorTop - 90, 180), ledge(LOBBY_W - 640, floorTop - 170, 170),
      ledge(gx - 60, floorTop - 250, 260)],
    doors: [{ x: gx, y: gy, w: 140, h: 150, type: 'run-browser', label: 'RUNS', gate: true }] };
}

// ---- enemies + bosses (Void Shell) ----
const KINDS = {
  drifter: { w: 15, h: 13, hp: 2, points: 10 },
  spitter: { w: 19, h: 17, hp: 4, points: 18 },
  diver:   { w: 17, h: 11, hp: 2, points: 14 },
};
const BOSSES = {
  maw:    { name: 'brood maw', w: 76, h: 54, hpMul: 1.00 },
  anvil:  { name: 'the anvil', w: 86, h: 56, hpMul: 1.95 },
  vesper: { name: 'vesper',    w: 54, h: 34, hpMul: 0.72 },
  chorus: { name: 'the chorus', w: 44, h: 40, hpMul: 0.74 },
  bore:   { name: 'the bore',  w: 40, h: 34, hpMul: 0.95 },
};
const BOSS_ORDER = ['maw', 'anvil', 'vesper', 'chorus'];   // fixed teaching rotation
const LATE_POOL = ['anvil', 'vesper', 'chorus', 'bore'];   // random past the rotation
const ADD_CAP = 22;
const C_EMBER = '#9e2b45', C_RUST = '#c0562e';

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
  const room = { id, level, players: new Set(), foes: [], foeShots: [], pBullets: [], quakes: [],
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
    hp: MAX_HP, maxHp: MAX_HP, god: false, isAdmin: ADMINS.has(user.username.toLowerCase()),
    iframes: 0, dead: false, score: 0, kills: 0, bossKills: 0, slag: 0, bestWave: 0,
    aim: { x: 1, y: 0 }, firing: false, fireCd: 0, dashCd: 0, dashT: 0, dashX: 1, dashY: 0 };
  players.set(uid, p);
  ws.on('pong', () => { p.alive = true; });

  send(p, { type: 'welcome', user: { id: uid, username: user.username } });
  db.getProgress(uid).then((pr) => { p.slag = pr.slag; p.bestWave = pr.bestWave;
    send(p, { type: 'progress', slag: pr.slag, bestWave: pr.bestWave }); }).catch(() => {});
  joinRoom(p, ensureLobby());

  ws.on('message', (raw) => { if (raw.length > 2048) return; let m; try { m = JSON.parse(raw); } catch { return; } handle(p, m); });
  const bye = () => { if (players.get(uid) === p) { leaveRoom(p); players.delete(uid); } };
  ws.on('close', bye); ws.on('error', bye);
}

function joinRoom(p, room) {
  p.roomId = room.id; room.players.add(p.userId);
  Object.assign(p, Physics.newState(room.level.spawn));
  p.maxHp = room.kind === 'run' ? (DIFFS[room.diff] || DIFFS[1]).maxHp : MAX_HP;
  p.queue.length = 0; p.hp = p.maxHp; p.dead = false; p.god = false; p.iframes = 60; p.firing = false;
  if (room.kind === 'run') { p.score = 0; p.kills = 0; p.bossKills = 0; }
  send(p, { type: 'room', id: room.id, name: room.level.name, kind: room.kind,
    width: room.level.width, height: room.level.height, floorTop: room.level.floorTop,
    host: room.host || null, youHost: room.host === p.username,
    diff: room.diff || 0, diffName: room.kind === 'run' ? (DIFFS[room.diff] || DIFFS[1]).name : null,
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
      const inp = { seq: m.seq | 0, left: !!(k & 1), right: !!(k & 2), jump: !!(k & 4), down: !!(k & 8) };
      if (m.dash) { inp.dash = true; inp.ax = +m.ax || 0; inp.ay = +m.ay || 0; }
      p.queue.push(inp);
      if (p.queue.length > 180) p.queue.shift();
      break;
    }
    case 'aim': { const x = +m.x, y = +m.y, l = Math.hypot(x, y); if (l > 0) p.aim = { x: x / l, y: y / l }; break; }
    case 'fire': p.firing = !!m.down; break;
    case 'interact': tryInteract(p); break;
    case 'endRun': { const room = rooms.get(p.roomId); if (room && room.kind === 'run' && room.host === p.username) endRun(room, 'ended'); break; }
    case 'createRun': createRun(p, m.diff | 0); break;
    case 'joinRun': joinRun(p, m.id); break;
    case 'listRuns': sendRunList(p); break;
    case 'chat': { let t = typeof m.text === 'string' ? m.text : ''; t = t.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CHAT_MAX);
      if (t[0] === '/') { handleCommand(p, t); break; }
      if (t) broadcast(p.roomId, { type: 'chat', from: p.username, color: p.color, text: t }); break; }
  }
}

function doorUnder(p) { const room = rooms.get(p.roomId); if (!room || !room.level.doors) return null;
  return room.level.doors.find((d) => overlap({ x: p.x, y: p.y, w: PW, h: PH }, d)) || null; }
function tryInteract(p) { const d = doorUnder(p); if (!d) return;
  if (d.type === 'leave') switchRoom(p, ensureLobby()); else if (d.type === 'run-browser') sendRunList(p); }
function sendRunList(p) { const runs = [];
  for (const r of rooms.values()) if (r.kind === 'run') runs.push({ id: r.id, host: r.host, count: r.players.size, cap: RUN_CAP, wave: r.wave, diff: r.diff || 0, diffName: (DIFFS[r.diff] || DIFFS[1]).name });
  send(p, { type: 'runList', runs }); }
function createRun(p, diff) {
  const d = DIFFS[diff] ? diff : 1, cfg = DIFFS[d];
  const id = 'run:' + crypto.randomBytes(3).toString('hex');
  const room = makeRoom(id, arenaLevel(0), { kind: 'run', host: p.username, arena: 0, diff: d,
    speedMul: cfg.speed, countMul: cfg.count, hpAdd: cfg.hpAdd, bossMul: cfg.bossMul, scoreMul: cfg.score });
  switchRoom(p, room);
}
// ---- admin commands (accounts listed in ADMIN_USERS) ----
function handleCommand(p, text) {
  const parts = text.slice(1).split(/\s+/), cmd = (parts[0] || '').toLowerCase(), arg = parts[1];
  const say = (t) => send(p, { type: 'system', text: t });
  if (!p.isAdmin) return say('Unknown command.');
  const room = rooms.get(p.roomId), inRun = room && room.kind === 'run';
  switch (cmd) {
    case 'help': return say('admin: /skip · /wave N · /slag N · /heal · /god · /kill · /boss <maw|anvil|vesper|chorus|bore>');
    case 'skip': if (!inRun) return say('Not in a run.'); room.foes.length = 0; room.foeShots.length = 0; room.quakes.length = 0; room.phase = 'fight'; startWave(room); return say('Skipped to wave ' + room.wave + '.');
    case 'wave': { if (!inRun) return say('Not in a run.'); const n = Math.max(1, parseInt(arg, 10) || 1); room.foes.length = 0; room.foeShots.length = 0; room.quakes.length = 0; room.wave = n - 1; room.phase = 'fight'; startWave(room); return say('Jumped to wave ' + n + '.'); }
    case 'slag': { const n = parseInt(arg, 10) || 0; db.bankRun(p.userId, n, 0).then((tot) => { if (tot) { p.slag = tot.slag; send(p, { type: 'progress', slag: tot.slag, bestWave: tot.bestWave }); } }).catch(() => {}); return say('+' + n + ' slag.'); }
    case 'heal': p.hp = p.maxHp; p.dead = false; p.iframes = 40; return say('Healed.');
    case 'god': p.god = !p.god; return say('God mode ' + (p.god ? 'ON' : 'OFF') + '.');
    case 'kill': if (!inRun) return say('Not in a run.'); room.foes.length = 0; return say('Foes cleared.');
    case 'boss': { if (!inRun) return say('Not in a run.'); if (!BOSSES[arg]) return say('Unknown boss.'); spawnBossOf(room, arg, Math.max(1, Math.ceil(room.wave / BOSS_EVERY)), false); return say('Spawned ' + BOSSES[arg].name + '.'); }
    default: return say('Unknown command. Try /help.');
  }
}
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
  for (const uid of room.players) { const p = players.get(uid); if (p) { p.dead = false; p.hp = p.maxHp; p.iframes = 60; } }
  if (room.wave % BOSS_EVERY === 0) { spawnBoss(room); return; }
  const party = 1 + 0.4 * (room.players.size - 1);
  const n = Math.max(1, Math.round((3 + Math.floor(room.wave * 1.3)) * (room.countMul || 1) * party));
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
    hp: k.hp + Math.floor(room.wave / 3) + (room.hpAdd || 0), t: Math.floor(rand(0, 60)), phase: 'in', cd: Math.floor(rand(40, 110)), hit: 0 };
}
function spawnFoe(room, kind) {
  const LW = room.level.width, FT = room.level.floorTop, s = Math.random(); let x, y;
  if (s < 0.4) { x = -26; y = rand(50, FT - 150); } else if (s < 0.8) { x = LW + 26; y = rand(50, FT - 150); } else { x = rand(60, LW - 60); y = -26; }
  room.foes.push(makeFoe(room, kind, x, y));
}
function spawnBoss(room) {
  const tier = Math.ceil(room.wave / BOSS_EVERY);
  const type = process.env.VS_FORCE_BOSS || (tier <= BOSS_ORDER.length ? BOSS_ORDER[(tier - 1) % BOSS_ORDER.length]
                                         : LATE_POOL[Math.floor(Math.random() * LATE_POOL.length)]);
  spawnBossOf(room, type, tier, true);
}
function spawnBossOf(room, type, tier, announce) {
  const cfg = BOSSES[type]; if (!cfg) return; const LW = room.level.width;
  const party = 1 + 0.5 * (room.players.size - 1);
  const hp = Math.round((84 + 82 * (Math.max(1, tier) - 1)) * cfg.hpMul * (room.bossMul || 1) * party);
  const base = () => ({ id: nextId++, kind: 'boss', boss: type, w: cfg.w, h: cfg.h, vx: 0, vy: 0,
    hp, maxHp: hp, t: 0, phase: 'entry', pt: 0, charge: 0, volley: 0, hit: 0, tier: Math.max(1, tier) });
  if (type === 'chorus') {
    const mk = (role, twin, orbit, guard) => Object.assign(base(), { role, twin, orbit, guard,
      x: LW / 2 - cfg.w / 2 + (twin ? 40 : -40), y: -60, blade: 0, dive: 0, cycle: 0, guardX: 0, guardY: 1 });
    room.foes.push(mk('sword', 0, 0, false));
    room.foes.push(mk('shield', 1, Math.PI, true));
  } else {
    const f = Object.assign(base(), { x: LW / 2 - cfg.w / 2, y: -80 });
    if (type === 'bore') { f.trail = []; f.armored = true; f.fromX = LW / 2; f.fromY = 0; f.aimX = 0; f.aimY = 1; f.phase = 'entry'; }
    if (type === 'vesper') { f.blinkT = 0; f.blinkX = 0; f.blinkY = 0; f.aimX = 0; f.aimY = 1; }
    room.foes.push(f);
  }
  if (announce) broadcast(room.id, { type: 'wave', wave: room.wave, boss: cfg.name });
}

// ---- pattern emitters (Void Shell emit/lob) ----
function emit(room, x, y, spec) {
  const sm = room.speedMul || 1, n = spec.n ?? 1, speed = (spec.speed ?? 3) * sm, arc = spec.arc ?? TAU;
  const ring = arc >= TAU - 0.001, base = spec.aim ? Math.atan2(spec.aim.y, spec.aim.x) : 0;
  const spin = spec.spin ?? 0, jitter = spec.jitter ?? 0;
  for (let i = 0; i < n; i++) {
    const off = ring ? (i / n) * TAU : (n === 1 ? 0 : (i / (n - 1) - 0.5) * arc);
    const a = base + spin + off + (jitter ? rand(-jitter, jitter) : 0);
    room.foeShots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: spec.life ?? 180, r: spec.r ?? 3, g: spec.g ?? 0 });
  }
}
function lob(room, x, y, spec) {
  const sm = room.speedMul || 1, n = spec.n ?? 1, spread = spec.spread * sm, lift = spec.lift * sm;
  for (let i = 0; i < n; i++) room.foeShots.push({ x, y, vx: rand(-spread, spread), vy: -rand(lift * 0.75, lift), g: spec.g ?? 0.19, life: spec.life ?? 280, r: spec.r ?? 3.6 });
}

// ---- foe AI ----
function stepFoe(room, f) {
  f.t++; if (f.hit > 0) f.hit--;
  const tgt = nearestPlayer(room, f.x + f.w / 2, f.y + f.h / 2);
  const pc = tgt ? { x: tgt.x + PW / 2, y: tgt.y + PH / 2 } : { x: room.level.width / 2, y: room.level.height / 2 };
  const c = centerOf(f);
  if (f.kind === 'boss') return stepBoss(room, f, pc);

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
  f.x = clamp(f.x, -30, room.level.width + 30 - f.w); f.y = clamp(f.y, -30, room.level.floorTop - f.h - 2);
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
    else { f.vx *= 0.97; f.vy += 0.3; if (f.y + f.h >= room.level.floorTop - 2 || f.t % 140 === 0) { emit(room, c.x, c.y + 10, { n: 12, speed: 3.1, arc: Math.PI, aim: { x: 0, y: -1 }, life: 150 }); f.phase = 'hover'; f.pt = 0; } }
  }
  f.x += f.vx; f.y += f.vy;
  f.x = clamp(f.x, 8, room.level.width - f.w - 8); f.y = clamp(f.y, 0, room.level.floorTop - f.h - 2);
}

function stepBoss(room, f, pc) {
  if (f.boss === 'anvil') return stepAnvil(room, f, pc);
  if (f.boss === 'vesper') return stepVesper(room, f, pc);
  if (f.boss === 'chorus') return stepChorus(room, f, pc);
  if (f.boss === 'bore') return stepBore(room, f, pc);
  return stepMaw(room, f, pc);
}

// shared boss helpers
function fx(room, shake) { broadcast(room.id, { type: 'fx', shake }); }
function quake(room, x, dir) { room.quakes.push({ x, dir, t: 0 }); }
function roomForAdds(room) { return Math.max(0, ADD_CAP - room.foes.filter((x) => x.kind === 'drifter').length); }
function bossHit(room, x, y, r) {
  for (const uid of room.players) { const p = players.get(uid); if (!p || p.dead || p.iframes > 0 || p.dashT > 0) continue;
    if (Math.abs(p.x + PW / 2 - x) < r && Math.abs(p.y + PH / 2 - y) < r) { hurtPlayer(p); return; } }
}
function stepQuakes(room) {
  const FT = room.level.floorTop, LW = room.level.width;
  for (let i = room.quakes.length - 1; i >= 0; i--) {
    const q = room.quakes[i]; q.t++; q.x += q.dir * 5.6;
    if (q.x < -30 || q.x > LW + 30 || q.t > 150) { room.quakes.splice(i, 1); continue; }
    for (const uid of room.players) { const p = players.get(uid); if (!p || p.dead || p.iframes > 0 || p.dashT > 0) continue;
      if (Math.abs(p.x + PW / 2 - q.x) < 16 && p.y + PH > FT - 40) hurtPlayer(p); }
  }
}

// --- the anvil: a ground bruiser that hammers shockwaves down the floor ---
function stepAnvil(room, f, pc) {
  const c = centerOf(f), FT = room.level.floorTop, LW = room.level.width;
  const enraged = f.hp < f.maxHp * 0.4, ground = FT - f.h;
  if (f.phase === 'entry') { f.vy += 0.8; f.y += f.vy; if (f.y >= ground) { f.y = ground; f.vy = 0; f.phase = 'walk'; f.pt = 0; quake(room, c.x, -1); quake(room, c.x, 1); fx(room, 9); } return; }
  if (!f.airborne) f.y = ground;
  if (f.phase === 'walk') { f.pt++; f.vx += Math.sign(pc.x - c.x) * 0.07; f.vx = clamp(f.vx * 0.95, -1.5, 1.5);
    if (f.pt > (enraged ? 48 : 74)) { f.pt = 0; f.volley = 0; const roll = Math.random();
      f.phase = roll < 0.26 ? 'slam' : roll < 0.46 ? 'flak' : roll < 0.64 ? 'vent' : roll < 0.82 ? 'leap' : 'charge'; f.charge = f.phase === 'charge' ? 30 : 34; } }
  else if (f.phase === 'slam') { f.vx *= 0.85; f.charge--; if (f.charge === 12) f.vy = -6;
    if (f.charge <= 0) { quake(room, c.x, -1); quake(room, c.x, 1); fx(room, 11); f.phase = 'walk'; f.pt = 0; } }
  else if (f.phase === 'flak') { f.vx *= 0.88; if (f.charge > 0) { f.charge--; if (f.charge === 0) f.pt = 0; }
    else { f.pt++; if (f.pt % 9 === 0) { lob(room, c.x, c.y - 10, { n: 3 + Math.min(4, f.tier), spread: 5, lift: 11.8 }); f.volley++; if (f.volley >= (enraged ? 6 : 4)) { f.phase = 'walk'; f.pt = 0; } } } }
  else if (f.phase === 'leap') { if (f.charge > 0) { f.charge--; f.vx *= 0.8; if (f.charge === 0) { f.vy = -14; f.vx = clamp((pc.x - c.x) * 0.055, -7.5, 7.5); f.airborne = true; fx(room, 5); } }
    else if (f.airborne) { f.vy += 0.62; if (f.y >= ground && f.vy > 0) { f.airborne = false; f.y = ground; f.vy = 0; fx(room, 14); quake(room, c.x, -1); quake(room, c.x, 1); lob(room, c.x, c.y - 10, { n: 4 + Math.min(3, f.tier), spread: 3.4, lift: 10.5 }); f.phase = 'walk'; f.pt = 0; } } }
  else if (f.phase === 'vent') { f.vx *= 0.88; f.charge--; if (f.charge <= 0) { const n = Math.min(roomForAdds(room), 3 + Math.ceil(f.tier / 2) + (enraged ? 3 : 0));
    for (let i = 0; i < n; i++) { const bug = makeFoe(room, 'drifter', c.x - 8 + rand(-42, 42), c.y - rand(2, 16)); bug.vy = rand(-2.6, -0.8); bug.vx = rand(-1.4, 1.4); room.foes.push(bug); } fx(room, 5); f.phase = 'walk'; f.pt = 0; } }
  else if (f.phase === 'charge') { if (f.charge > 0) { f.charge--; f.vx *= 0.8; if (f.charge === 0) f.vx = Math.sign(pc.x - c.x) * (enraged ? 8.4 : 6.8); }
    else if (f.x <= 4 || f.x >= LW - f.w - 4) { fx(room, 8); quake(room, c.x, -Math.sign(f.vx)); f.vx = 0; f.phase = 'walk'; f.pt = 0; } }
  f.x = clamp(f.x + f.vx, 4, LW - f.w - 4);
  if (f.airborne) f.y += f.vy;
  else { f.y += f.vy; if (f.y > ground) { f.y = ground; f.vy = 0; } else if (f.y < ground) f.vy += 0.55; }
}

// --- vesper: blinks around you, paints a line, then sweeps a hot trail ---
function stepVesper(room, f, pc) {
  const c = centerOf(f), FT = room.level.floorTop, LW = room.level.width;
  const enraged = f.hp < f.maxHp * 0.4, dx = pc.x - c.x, dy = pc.y - c.y, dist = Math.hypot(dx, dy) || 1;
  if (f.phase === 'entry') { f.vy = 2.2; f.y += f.vy; if (f.y >= 72) { f.y = 72; f.vy = 0; f.phase = 'stalk'; f.pt = 0; } return; }
  if (f.phase === 'stalk') { f.pt++; f.vx += (dx / dist) * 0.05; f.vy += (dy / dist) * 0.04 + Math.sin(f.t * 0.05) * 0.08; f.vx *= 0.94; f.vy *= 0.94;
    if (f.blinkT > 0) { f.blinkT--; if (f.blinkT === 0) { f.x = f.blinkX; f.y = f.blinkY; f.vx *= 0.3; f.vy *= 0.3; fx(room, 2); } }
    else if (f.pt % (enraged ? 44 : 66) === 0) { const a = Math.random() * Math.PI * 2; f.blinkX = clamp(pc.x + Math.cos(a) * 205 - f.w / 2, 8, LW - f.w - 8); f.blinkY = clamp(pc.y + Math.sin(a) * 170 - f.h / 2, 10, FT - f.h - 20); f.blinkT = enraged ? 12 : 16; }
    if (f.blinkT === 0 && f.pt > (enraged ? 70 : 104)) { f.pt = 0; f.volley = 0; f.phase = Math.random() < 0.58 ? 'lance' : 'sweep'; f.charge = f.phase === 'lance' ? 30 : 26; f.aimX = dx / dist; f.aimY = dy / dist; } }
  else if (f.phase === 'lance') { f.vx *= 0.86; f.vy *= 0.86; if (f.charge > 0) { f.charge--; if (f.charge === 0) { emit(room, c.x, c.y, { n: 3, arc: 0.32, aim: { x: f.aimX, y: f.aimY }, speed: enraged ? 9 : 7.6, life: 130, r: 4.4, color: C_EMBER }); fx(room, 3); f.volley++; if (f.volley < (enraged ? 3 : 2)) { f.charge = 22; f.aimX = dx / dist; f.aimY = dy / dist; } else { f.phase = 'stalk'; f.pt = 0; } } } }
  else if (f.phase === 'sweep') { if (f.charge > 0) { f.charge--; f.vx *= 0.8; f.vy *= 0.8; if (f.charge === 0) { const sp = enraged ? 10.5 : 8.8; f.vx = f.aimX * sp; f.vy = f.aimY * sp; f.pt = 46; } }
    else { f.pt--; if (f.pt % 4 === 0) room.foeShots.push({ x: c.x, y: c.y, vx: 0, vy: 0, life: 62, r: 5, color: C_EMBER }); if (f.pt <= 0 || f.x <= 4 || f.x >= LW - f.w - 4) { f.vx *= -0.4; f.vy *= 0.3; f.phase = 'stalk'; f.pt = 0; } } }
  f.x = clamp(f.x + f.vx, 4, LW - f.w - 4); f.y = clamp(f.y + f.vy, 6, FT - f.h - 6);
}

// --- the chorus: sword + shield twins orbiting a shared hub ---
function stepChorus(room, f, pc) {
  const c = centerOf(f), FT = room.level.floorTop, LW = room.level.width;
  const alone = room.foes.filter((x) => x.boss === 'chorus').length === 1;
  const enraged = alone || f.hp < f.maxHp * 0.4, sword = f.role === 'sword';
  if (f.phase === 'entry') { f.y += 2.4; if (f.y >= 110) { f.phase = 'spiral'; f.pt = 0; f.cycle = 0; } return; }
  const gx = pc.x - c.x, gy = pc.y - c.y, glen = Math.hypot(gx, gy) || 1; f.guardX = gx / glen; f.guardY = gy / glen;
  const diving = f.phase === 'converge' && f.charge <= 0, pressing = f.phase === 'press';
  if (!diving) { f.orbit += alone ? 0.036 : 0.026; const hubX = clamp(pc.x, 150, LW - 150);
    const hubY = pressing ? clamp(pc.y - 40, 90, FT - 130) : 150 + Math.sin(f.t * 0.02) * 30;
    const R = alone ? 68 : pressing ? 74 : 118, lerp = pressing ? 0.075 : 0.055;
    f.x += ((hubX + Math.cos(f.orbit) * R - f.w / 2) - f.x) * lerp; f.y += ((hubY + Math.sin(f.orbit) * R * 0.55 - f.h / 2) - f.y) * lerp; }
  if (f.phase === 'spiral' || pressing) { f.pt++; const gap = (pressing ? 11 : sword ? 14 : 18) - (enraged ? 3 : 0);
    if (f.pt % Math.max(6, gap) === 0) emit(room, c.x, c.y, { spin: f.orbit * 2.4 + (f.twin ? Math.PI : 0), speed: sword ? (enraged ? 3.8 : 3.2) : (enraged ? 2.7 : 2.3), life: 190, r: sword ? 3 : 4.2 });
    const vg = pressing ? 34 : enraged ? 40 : 52; if (f.pt % vg === 0) emit(room, c.x, c.y, { n: enraged ? 3 : 2, arc: enraged ? 0.38 : 0.19, aim: { x: gx / glen, y: gy / glen }, speed: sword ? 4.4 : 3.6, life: 170, r: 3.4, color: C_EMBER }); }
  if (f.phase === 'spiral') { if (f.openAfter > 0) { f.openAfter--; f.guard = false; } else f.guard = !sword;
    if (f.pt > (enraged ? 108 : 148)) { f.pt = 0; f.cycle = (f.cycle || 0) + 1;
      if (((f.cycle + f.twin) % 2) === 0) { f.phase = 'converge'; f.charge = sword ? 26 : 52; } else { f.phase = 'press'; f.pressT = sword ? 96 : 112; } } }
  else if (pressing) { f.guard = !sword; if (--f.pressT <= 0) { f.phase = 'spiral'; f.pt = 0; } }
  else if (f.phase === 'converge') { if (f.charge > 0) { f.guard = false; f.charge--; if (f.charge === 0) { const sp = sword ? (enraged ? 11.4 : 9.6) : (enraged ? 9.2 : 7.6); f.vx = (gx / glen) * sp; f.vy = (gy / glen) * sp; f.dive = sword ? 34 : 42; fx(room, 3); } }
    else { f.x = clamp(f.x + f.vx, 4, LW - f.w - 4); f.y = clamp(f.y + f.vy, 6, FT - f.h - 46); f.vy += 0.07; if (--f.dive <= 0) { f.phase = 'spiral'; f.pt = 0; f.vx = 0; f.vy = 0; if (!sword) { f.guard = false; f.openAfter = 70; } } } }
  if (sword) { f.blade = (f.blade || 0) + (enraged ? 0.155 : 0.115) + (diving ? 0.09 : 0); const br = 66;
    bossHit(room, c.x + Math.cos(f.blade) * br, c.y + Math.sin(f.blade) * br, 17); }
  f.guardInvuln = (!sword && f.guard);   // shield only takes damage when its guard drops
}

// --- the bore: tunnels offscreen, telegraphs a lane, then streaks through it ---
function boreLine(room, f, pc) {
  const FT = room.level.floorTop, LW = room.level.width, side = Math.floor(Math.random() * 4), m = 70; let x, y;
  if (side === 0) { x = -m; y = rand(60, FT - 40); } else if (side === 1) { x = LW + m; y = rand(60, FT - 40); }
  else if (side === 2) { x = rand(80, LW - 80); y = -m; } else { x = rand(80, LW - 80); y = FT + m; }
  const dx = pc.x - x, dy = pc.y - y, len = Math.hypot(dx, dy) || 1; f.fromX = x; f.fromY = y; f.aimX = dx / len; f.aimY = dy / len;
}
function boreSegments(f) {
  if (!f.trail || f.phase !== 'dive') return [];
  const out = [{ x: f.x + f.w / 2, y: f.y + f.h / 2, r: 21, head: true }];
  for (let i = 6; i < f.trail.length; i += 6) { const p = f.trail[i]; out.push({ x: p.x, y: p.y, r: 17 * (1 - i / 110) + 4 }); }
  return out;
}
function stepBore(room, f, pc) {
  const FT = room.level.floorTop, LW = room.level.width, enraged = f.hp < f.maxHp * 0.45;
  if (f.phase === 'entry') { f.phase = 'lurk'; f.charge = 34; f.armored = true; f.trail = []; boreLine(room, f, pc); return; }
  if (f.phase === 'lurk') { f.armored = true; f.x = -999; f.y = -999; if (--f.charge <= 0) { f.phase = 'dive'; f.armored = false; f.x = f.fromX; f.y = f.fromY; f.trail = []; const sp = (enraged ? 17 : 14) + f.tier * 0.5; f.vx = f.aimX * sp; f.vy = f.aimY * sp; fx(room, 6); } return; }
  f.x += f.vx; f.y += f.vy; f.trail.unshift({ x: f.x + f.w / 2, y: f.y + f.h / 2 }); if (f.trail.length > 108) f.trail.pop();
  const c = centerOf(f);
  for (const seg of boreSegments(f)) bossHit(room, seg.x, seg.y, seg.r);
  if (f.t % 9 === 0) emit(room, c.x, c.y, { n: 2, speed: 2.2, spin: f.t * 0.1, life: 130, r: 3, color: C_RUST });
  if (f.x < -220 || f.x > LW + 220 || f.y < -220 || f.y > FT + 220) { f.phase = 'lurk'; f.armored = true; f.charge = enraged ? 16 : 26; boreLine(room, f, pc); }
}

// ---- damage ----
function damageFoe(room, f, amount, owner) {
  f.hp -= amount; f.hit = 5;
  if (f.hp <= 0) {
    room.foes.splice(room.foes.indexOf(f), 1);
    const pts = f.kind === 'boss' ? 200 + room.wave * 10 : (KINDS[f.kind]?.points || 5);
    if (owner) { owner.score += pts; owner.kills++; if (f.kind === 'boss') owner.bossKills++; }
    if (f.kind === 'boss') broadcast(room.id, { type: 'system', text: `${BOSSES[f.boss].name} down!` });
  }
}
function hurtPlayer(p) {
  if (p.dead || p.god || p.iframes > 0 || p.dashT > 0) return;
  p.hp--; p.iframes = IFRAMES;
  if (p.hp <= 0) { p.dead = true; p.hp = 0; broadcast(p.roomId, { type: 'system', text: `${p.username} went down.` }); }
}

// Void Shell slag formula.
function slagFor(score, bossKills) { return Math.floor(score / 130) + bossKills * 6; }

// End a run for everyone: bank each player's earnings, hand back a postmortem,
// then return them to the lobby. `reason` is 'ended' (host) or 'wiped'.
function endRun(room, reason) {
  if (room.ending) return; room.ending = true;
  const wave = room.wave;
  for (const uid of [...room.players]) {
    const p = players.get(uid); if (!p) continue;
    const earned = Math.round(slagFor(p.score, p.bossKills) * (room.scoreMul || 1));
    const summary = { type: 'runEnd', reason, wave, score: p.score, kills: p.kills, bossKills: p.bossKills, slag: earned };
    db.bankRun(uid, earned, wave).then((tot) => {
      if (tot) { p.slag = tot.slag; p.bestWave = tot.bestWave; summary.total = tot.slag; summary.bestWave = tot.bestWave; }
      send(p, summary); send(p, { type: 'progress', slag: p.slag, bestWave: p.bestWave });
    }).catch(() => send(p, summary));
    switchRoom(p, ensureLobby());
  }
}

// ---- main sim (60Hz) ----
function simulate() {
  for (const room of rooms.values()) {
    // players
    for (const uid of room.players) {
      const p = players.get(uid); if (!p) continue;
      if (p.iframes > 0) p.iframes--;
      if (p.fireCd > 0) p.fireCd--;

      // dash + movement are both in the shared physics now (predicted + reconciled)
      while (p.queue.length) { const inp = p.queue.shift(); if (!p.dead) Physics.step(p, inp, room.level); p.lastSeq = inp.seq; p.input = inp; }

      // firing — Void Shell spawn: offset along aim, tiny jitter
      if (room.kind === 'run' && p.firing && !p.dead && p.fireCd <= 0) {
        const a = p.aim, c = { x: p.x + PW / 2, y: p.y + PH / 2 };
        const ang = (Math.random() - 0.5) * 0.06, cos = Math.cos(ang), sin = Math.sin(ang);
        room.pBullets.push({ x: c.x + a.x * 7, y: c.y + a.y * 7,
          vx: (a.x * cos - a.y * sin) * BULLET_SPEED, vy: (a.x * sin + a.y * cos) * BULLET_SPEED,
          life: BULLET_LIFE, owner: p.userId, color: p.color });
        p.fireCd = FIRE_CD;
      }
      // fell into chasm
      if (p.y > room.level.height + 40 && !p.dead) { hurtPlayer(p); Object.assign(p, Physics.newState(room.level.spawn)); }
    }

    if (room.kind !== 'run') continue;

    // foes
    for (const f of [...room.foes]) stepFoe(room, f);
    stepQuakes(room);
    // foe contact damage
    for (const uid of room.players) { const p = players.get(uid); if (!p || p.dead || p.dashT > 0) continue;
      const core = { x: p.x + PW / 2 - CORE / 2, y: p.y + PH / 2 - CORE / 2, w: CORE, h: CORE };
      for (const f of room.foes) if (overlap(f, core)) { hurtPlayer(p); break; } }

    // foe shots
    const fs = [];
    for (const b of room.foeShots) {
      if (b.g) b.vy += b.g; b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0 || b.x < -20 || b.x > room.level.width + 20 || b.y < -20 || b.y > room.level.height + 20) continue;
      // solid platforms stop shots
      let dead = false; for (const pl of room.level.platforms) if (pl.solid && b.x > pl.x && b.x < pl.x + pl.w && b.y > pl.y && b.y < pl.y + pl.h) { dead = true; break; }
      if (dead) continue;
      // hit player cores
      let struck = false;
      for (const uid of room.players) { const p = players.get(uid); if (!p || p.dead || p.iframes > 0 || p.dashT > 0) continue;
        const bx = p.x + PW / 2 - CORE / 2, by = p.y + PH / 2 - CORE / 2;
        if (b.x > bx && b.x < bx + CORE && b.y > by && b.y < by + CORE) { hurtPlayer(p); struck = true; break; } }
      if (!struck) fs.push(b);
    }
    room.foeShots = fs;

    // player bullets
    const pb = [];
    for (const b of room.pBullets) {
      b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0 || b.x < -10 || b.x > room.level.width + 10 || b.y < -10 || b.y > room.level.height + 10) continue;
      let dead = false; for (const pl of room.level.platforms) if (pl.solid && b.x > pl.x && b.x < pl.x + pl.w && b.y > pl.y && b.y < pl.y + pl.h) { dead = true; break; }
      if (dead) continue;
      let struck = false;
      for (const f of room.foes) if (b.x > f.x && b.x < f.x + f.w && b.y > f.y && b.y < f.y + f.h) {
        if (!f.armored && !f.guardInvuln) damageFoe(room, f, BULLET_DMG, players.get(b.owner));
        struck = true; break; }
      if (!struck) pb.push(b);
    }
    room.pBullets = pb;

    // wave progression
    if (room.phase === 'fight' && room.foes.length === 0) { room.phase = 'interlude'; room.timer = 90; }
    else if (room.phase === 'interlude' && --room.timer <= 0) startWave(room);

    // all players down -> run ends (banked), back to lobby
    if (room.players.size > 0 && alivePlayers(room).length === 0) endRun(room, 'wiped');
  }
}

// ---- broadcast (30Hz), per-recipient reconciliation ----
function broadcastStates() {
  for (const room of rooms.values()) {
    if (room.players.size === 0) continue;
    const list = Array.from(room.players, (uid) => { const p = players.get(uid); return p && {
      id: p.userId, name: p.username, color: p.color, x: Math.round(p.x), y: Math.round(p.y),
      face: p.face, hp: p.hp, dead: p.dead, iframes: p.iframes, aimx: +p.aim.x.toFixed(2), aimy: +p.aim.y.toFixed(2) }; }).filter(Boolean);
    const foes = room.foes.map((f) => { const o = { id: f.id, kind: f.kind, boss: f.boss || null, x: Math.round(f.x), y: Math.round(f.y),
      w: f.w, h: f.h, hp: f.hp, maxHp: f.maxHp || 0, hit: f.hit || 0,
      t: f.t || 0, ph: f.phase || '', ch: f.charge || 0, vx: +(f.vx || 0).toFixed(2), vy: +(f.vy || 0).toFixed(2) };
      if (f.kind === 'boss') { o.role = f.role; o.guard = !!f.guard; o.airborne = !!f.airborne; o.armored = !!f.armored;
        o.blade = +(f.blade || 0).toFixed(2); o.twin = f.twin || 0; o.blinkT = f.blinkT || 0;
        o.bx = Math.round(f.blinkX || 0); o.by = Math.round(f.blinkY || 0);
        o.ax = +(f.aimX || 0).toFixed(2); o.ay = +(f.aimY || 0).toFixed(2);
        o.gx = +(f.guardX || 0).toFixed(2); o.gy = +(f.guardY || 0).toFixed(2);
        o.fx = Math.round(f.fromX || 0); o.fy = Math.round(f.fromY || 0);
        if (f.boss === 'bore' && f.trail && f.phase === 'dive') o.tr = f.trail.filter((_, i) => i % 6 === 0).slice(0, 20).map((p) => [Math.round(p.x), Math.round(p.y)]); }
      return o; });
    const fshots = room.foeShots.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), r: b.r, color: b.color || null,
      vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2), g: b.g || 0 }));
    const pshots = room.pBullets.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), color: b.color, owner: b.owner,
      vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2) }));
    const quakes = room.quakes.map((q) => ({ x: Math.round(q.x), t: q.t }));
    for (const uid of room.players) {
      const p = players.get(uid); if (!p || p.ws.readyState !== 1) continue;
      p.ws.send(JSON.stringify({ type: 'state', players: list, foes, fshots, pshots, quakes, wave: room.wave,
        you: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, coyote: p.coyote, jumps: p.jumps,
          face: p.face, dropThru: p.dropThru, buffer: p.buffer, pjump: p.pjump, hp: p.hp, maxHp: p.maxHp, dead: p.dead,
          dashT: p.dashT, dashCd: p.dashCd, dashX: p.dashX, dashY: p.dashY, score: p.score, lastSeq: p.lastSeq } }));
    }
  }
}

function heartbeat() { for (const p of players.values()) { if (p.alive === false) { try { p.ws.terminate(); } catch {} continue; } p.alive = false; try { p.ws.ping(); } catch {} } }

function start() { ensureLobby(); setInterval(simulate, 1000 / 60); setInterval(broadcastStates, 1000 / 30); setInterval(heartbeat, 25000); }

module.exports = { onConnection, start };
