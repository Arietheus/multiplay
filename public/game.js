'use strict';

// ============================================================================
// Small helpers + auth screen
// ============================================================================
const $ = (id) => document.getElementById(id);
let mode = 'login';

function setMode(m) {
  mode = m;
  $('tabLogin').classList.toggle('active', m === 'login');
  $('tabRegister').classList.toggle('active', m === 'register');
  $('submit').textContent = m === 'login' ? 'Log in' : 'Create account';
  $('pw').setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
  $('authhint').textContent = m === 'register'
    ? 'Username: 3–20 letters, numbers, or underscores. Password: 8+ characters.' : '';
  $('authmsg').textContent = '';
}
$('tabLogin').onclick = () => setMode('login');
$('tabRegister').onclick = () => setMode('register');

async function submitAuth() {
  const username = $('u').value.trim(), password = $('pw').value;
  $('authmsg').textContent = ''; $('submit').disabled = true;
  try {
    const res = await fetch('/api/' + mode, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { $('authmsg').textContent = data.error || 'Something went wrong.'; return; }
    startGame(data.username);
  } catch { $('authmsg').textContent = 'Network error. Try again.'; }
  finally { $('submit').disabled = false; }
}
$('submit').onclick = submitAuth;
$('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
$('u').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pw').focus(); });

(async function tryResume() {
  try { const r = await fetch('/api/me', { credentials: 'same-origin' });
    if (r.ok) { const d = await r.json(); startGame(d.username); } } catch {}
})();

$('btnLogout').onclick = async () => {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
  location.reload();
};

// ============================================================================
// Rebindable controls (persisted in localStorage)
// ============================================================================
const DEFAULTS = {
  left: 'ArrowLeft', right: 'ArrowRight', jump: 'Space', interact: 'KeyA',
  shoot: 'KeyD', chat: 'Enter', settings: 'Escape',
  secondary: 'KeyS', inventory: 'Tab',
};
const LABELS = {
  left: 'Move left', right: 'Move right', jump: 'Jump', interact: 'Interact',
  shoot: 'Shoot', chat: 'Chat', settings: 'Settings',
  secondary: 'Secondary', inventory: 'Inventory',
};
const ACTIVE = new Set(['left', 'right', 'jump', 'interact', 'shoot', 'chat', 'settings']);

let binds = loadBinds();
function loadBinds() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('sb_controls') || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
function saveBinds() { localStorage.setItem('sb_controls', JSON.stringify(binds)); }
function codeToAction() { const m = {}; for (const a in binds) m[binds[a]] = a; return m; }
let CODE2ACTION = codeToAction();

function prettyKey(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '')
    .replace('ArrowLeft', '←').replace('ArrowRight', '→')
    .replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('Escape', 'Esc');
}

let listeningFor = null;
function renderBinds() {
  const list = $('bindlist'); list.innerHTML = '';
  for (const action of Object.keys(DEFAULTS)) {
    const row = document.createElement('div'); row.className = 'bindrow';
    const left = document.createElement('span'); left.className = 'act'; left.textContent = LABELS[action];
    if (!ACTIVE.has(action)) {
      const soon = document.createElement('span'); soon.className = 'soon';
      soon.textContent = '  (coming soon)'; left.appendChild(soon);
    }
    const btn = document.createElement('button'); btn.className = 'keybtn';
    btn.textContent = listeningFor === action ? 'press a key…' : prettyKey(binds[action]);
    if (listeningFor === action) btn.classList.add('listening');
    btn.onclick = () => { listeningFor = action; renderBinds(); };
    row.appendChild(left); row.appendChild(btn); list.appendChild(row);
  }
}
function openControls() { $('controls').classList.remove('hidden'); renderBinds(); }
function closeControls() { listeningFor = null; $('controls').classList.add('hidden'); }
$('btnControls').onclick = openControls;
$('closeControls').onclick = closeControls;
$('resetBinds').onclick = () => { binds = { ...DEFAULTS }; saveBinds(); CODE2ACTION = codeToAction(); renderBinds(); };

// ============================================================================
// Networking
// ============================================================================
let ws = null, connected = false, me = null, hidden = false;
let level = null;                 // { platforms, doors, width, height, spawn }
const remotes = new Map();        // id -> { buffer:[{t,x,y,facing}], color, name }
let bullets = [], bulletsAt = 0;  // last bullet snapshot + arrival time

// prediction state
let self = null;                  // Physics state for our own player
let inputSeq = 0;
let pending = [];                 // unacked inputs [{seq, input}]

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { connected = true; $('dot').classList.add('on'); };
  ws.onclose = (e) => {
    connected = false; $('dot').classList.remove('on');
    if (e.code === 4001) { addSys('Signed in from another tab or window.'); return; }
    if (!hidden) setTimeout(connect, 1000); // reconnect only while visible
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
}

function onMessage(m) {
  switch (m.type) {
    case 'welcome': me = m.user; $('who').textContent = m.user.username; break;
    case 'room':
      level = m; remotes.clear(); bullets = [];
      self = Physics.newState(m.spawn); pending = [];
      $('room').textContent = '· ' + (m.kind === 'run' ? `Run (${m.id.slice(4)})` : m.name);
      closeRuns();
      break;
    case 'state': onState(m); break;
    case 'chat': addChat(m.from, m.text, m.color); break;
    case 'system': addSys(m.text); break;
    case 'runList': showRuns(m.runs); break;
  }
}

function onState(m) {
  const now = performance.now();
  // remotes -> interpolation buffers
  const seen = new Set();
  for (const p of m.players) {
    if (p.id === (me && me.id)) continue;
    seen.add(p.id);
    let r = remotes.get(p.id);
    if (!r) { r = { buffer: [], color: p.color, name: p.name }; remotes.set(p.id, r); }
    r.color = p.color; r.name = p.name;
    r.buffer.push({ t: now, x: p.x, y: p.y, facing: p.facing });
    if (r.buffer.length > 12) r.buffer.shift();
  }
  for (const id of remotes.keys()) if (!seen.has(id)) remotes.delete(id);

  bullets = m.bullets || []; bulletsAt = now;

  // ---- reconciliation for our own player ----
  if (m.you && self && level) {
    self.x = m.you.x; self.y = m.you.y; self.vx = m.you.vx; self.vy = m.you.vy;
    self.grounded = m.you.grounded; self.coyote = m.you.coyote;
    self.buffer = m.you.buffer; self.pjump = m.you.pjump; self.facing = m.you.facing;
    pending = pending.filter((i) => i.seq > m.you.lastSeq);
    for (const i of pending) Physics.step(self, i.input, level); // replay unacked
  }
}

// ============================================================================
// Input + prediction loop
// ============================================================================
const held = { left: false, right: false, jump: false };
let shootHeld = false, mouseDown = false;
const mouse = { x: 0, y: 0 };
let fireReadyAt = 0;
let promptDoor = null;

function uiBlocking() {
  return chatOpen() || !$('controls').classList.contains('hidden') || !$('runs').classList.contains('hidden');
}
function clearHeld() { held.left = held.right = held.jump = false; shootHeld = false; mouseDown = false; }
function chatOpen() { return !$('chatform').classList.contains('hidden'); }
function openChat() { $('chatform').classList.remove('hidden'); $('chatinput').focus(); clearHeld(); }
function closeChat() { $('chatform').classList.add('hidden'); $('chatinput').value = ''; $('chatinput').blur(); }

$('chatform').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('chatinput').value;
  if (text.trim() && ws && connected) ws.send(JSON.stringify({ type: 'chat', text }));
  closeChat();
});
$('chatinput').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeChat(); } });

// Fixed 60Hz prediction step: sample input, predict locally, send to server.
function simStep() {
  if (hidden || !connected || !level || !self || !me) return;
  const block = uiBlocking();
  const input = {
    left: !block && held.left, right: !block && held.right, jump: !block && held.jump,
  };
  inputSeq++;
  Physics.step(self, input, level);                       // predict now (no lag)
  pending.push({ seq: inputSeq, input });
  if (pending.length > 200) pending.shift();
  const mask = (input.left ? 1 : 0) | (input.right ? 2 : 0) | (input.jump ? 4 : 0);
  ws.send(JSON.stringify({ type: 'input', seq: inputSeq, k: mask }));

  // firing
  if (!block && (shootHeld || mouseDown)) {
    const now = performance.now();
    if (now >= fireReadyAt) {
      const aim = aimVector();
      ws.send(JSON.stringify({ type: 'shoot', ax: aim.x, ay: aim.y }));
      fireReadyAt = now + 120;
      muzzle = { x: self.x + Physics.PW / 2, y: self.y + Physics.PH / 2, t: now };
    }
  }
}

function aimVector() {
  // direction from our on-screen player center toward the mouse
  const sx = self.x + Physics.PW / 2 - camX, sy = self.y + Physics.PH / 2 - camY;
  let dx = mouse.x - sx, dy = mouse.y - sy;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

window.addEventListener('keydown', (e) => {
  if (listeningFor) {
    e.preventDefault();
    if (e.code !== 'Escape') { binds[listeningFor] = e.code; saveBinds(); CODE2ACTION = codeToAction(); }
    listeningFor = null; renderBinds(); return;
  }
  if ($('game').classList.contains('hidden')) return;
  if (e.target === $('chatinput')) return;
  const action = CODE2ACTION[e.code];
  if (!action) return;
  if (e.repeat) { e.preventDefault(); return; }
  e.preventDefault();
  switch (action) {
    case 'settings': $('controls').classList.contains('hidden') ? openControls() : closeControls(); break;
    case 'chat': if (!chatOpen()) openChat(); break;
    case 'left': held.left = true; break;
    case 'right': held.right = true; break;
    case 'jump': held.jump = true; break;
    case 'shoot': shootHeld = true; break;
    case 'interact': if (ws && connected) ws.send(JSON.stringify({ type: 'interact' })); break;
  }
});
window.addEventListener('keyup', (e) => {
  const action = CODE2ACTION[e.code];
  if (!action) return;
  if (action === 'left') held.left = false;
  else if (action === 'right') held.right = false;
  else if (action === 'jump') held.jump = false;
  else if (action === 'shoot') shootHeld = false;
});

// mouse aim + fire
const canvas = $('c');
canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
canvas.addEventListener('mousedown', (e) => { if (e.button === 0 && !uiBlocking()) mouseDown = true; });
window.addEventListener('mouseup', () => { mouseDown = false; });

// ---- the tab-visibility fix ----
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hidden = true; clearHeld(); }
  else { hidden = false; if (!connected) connect(); } // resume cleanly on return
});
window.addEventListener('blur', clearHeld); // releasing focus can't leave keys stuck

// ============================================================================
// Run browser + chat log
// ============================================================================
function showRuns(runs) {
  const list = $('runlist'); list.innerHTML = '';
  if (!runs.length) {
    const e = document.createElement('div'); e.className = 'empty';
    e.textContent = 'No open runs yet. Create one and your friends can join.'; list.appendChild(e);
  }
  for (const r of runs) {
    const row = document.createElement('div'); row.className = 'runrow';
    const meta = document.createElement('div');
    const host = document.createElement('div'); host.textContent = `${r.host}'s run`;
    const sub = document.createElement('div'); sub.className = 'meta'; sub.textContent = `${r.count}/${r.cap} players`;
    meta.appendChild(host); meta.appendChild(sub);
    const btn = document.createElement('button'); btn.className = 'primary small';
    btn.textContent = r.count >= r.cap ? 'Full' : 'Join'; btn.disabled = r.count >= r.cap;
    btn.onclick = () => ws && ws.send(JSON.stringify({ type: 'joinRun', id: r.id }));
    row.appendChild(meta); row.appendChild(btn); list.appendChild(row);
  }
  $('runs').classList.remove('hidden');
}
function closeRuns() { $('runs').classList.add('hidden'); }
$('closeRuns').onclick = closeRuns;
$('createRun').onclick = () => ws && ws.send(JSON.stringify({ type: 'createRun' }));
$('refreshRuns').onclick = () => ws && ws.send(JSON.stringify({ type: 'listRuns' }));

function scrollChat() { const l = $('chatlog'); l.scrollTop = l.scrollHeight; }
function addChat(from, text, color) {
  const line = document.createElement('div');
  const name = document.createElement('span'); name.className = 'name';
  name.style.color = color || '#fff'; name.textContent = from + ': ';
  const body = document.createElement('span'); body.textContent = text; // XSS-safe
  line.appendChild(name); line.appendChild(body);
  $('chatlog').appendChild(line); trimChat(); scrollChat();
}
function addSys(text) {
  const line = document.createElement('div'); line.className = 'sys'; line.textContent = text;
  $('chatlog').appendChild(line); trimChat(); scrollChat();
}
function trimChat() { const l = $('chatlog'); while (l.children.length > 60) l.removeChild(l.firstChild); }

// ============================================================================
// Rendering
// ============================================================================
const ctx = canvas.getContext('2d');
const PW = 26, PH = 38, INTERP = 100; // ms of interpolation delay for remotes
let VW = 0, VH = 0, camX = 0, camY = 0;
let muzzle = null;
function resize() { VW = canvas.width = innerWidth; VH = canvas.height = innerHeight; }
addEventListener('resize', resize); resize();

function aabb(ax, ay, aw, ah, b) { return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y; }

function remoteAt(r, renderT) {
  const b = r.buffer;
  if (!b.length) return null;
  if (b.length === 1) return b[0];
  for (let i = 0; i < b.length - 1; i++) {
    if (b[i].t <= renderT && renderT <= b[i + 1].t) {
      const a = b[i], c = b[i + 1];
      const f = (renderT - a.t) / Math.max(1, c.t - a.t);
      return { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f, facing: c.facing };
    }
  }
  return b[b.length - 1];
}

function drawCharacter(x, y, facing, aimAngle, color, isSelf) {
  const cx = x + PW / 2;
  // legs
  ctx.strokeStyle = shade(color, -35); ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 5, y + PH - 12); ctx.lineTo(cx - 8, y + PH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 5, y + PH - 12); ctx.lineTo(cx + 8, y + PH); ctx.stroke();
  // body
  ctx.fillStyle = color; roundRect(ctx, x + 2, y + 8, PW - 4, PH - 18, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, x + 2, y + 8, PW - 4, 7, 7); ctx.fill();
  // head
  ctx.fillStyle = shade(color, 18);
  ctx.beginPath(); ctx.arc(cx, y + 8, 9, 0, Math.PI * 2); ctx.fill();
  // visor (faces aim/facing)
  ctx.fillStyle = '#0b0f17';
  ctx.beginPath(); ctx.arc(cx + facing * 3, y + 8, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7dd3fc';
  ctx.beginPath(); ctx.arc(cx + facing * 4, y + 7, 1.8, 0, Math.PI * 2); ctx.fill();
  // gun arm along aim
  const ax = Math.cos(aimAngle), ay = Math.sin(aimAngle);
  const gx = cx, gy = y + 20;
  ctx.strokeStyle = shade(color, -20); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + ax * 16, gy + ay * 16); ctx.stroke();
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath(); ctx.arc(gx + ax * 18, gy + ay * 18, 3, 0, Math.PI * 2); ctx.fill();
  // name
  ctx.fillStyle = isSelf ? '#fff' : '#e5e7eb';
  ctx.font = '12px ui-monospace, monospace'; ctx.textAlign = 'center';
}

function shade(hsl, dl) {
  const m = /hsl\((\d+),(\d+)%,(\d+)%\)/.exec(hsl);
  if (!m) return hsl;
  const l = Math.max(0, Math.min(100, +m[3] + dl));
  return `hsl(${m[1]},${m[2]}%,${l}%)`;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function draw() {
  ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, VW, VH);
  if (!level || !me || !self) { requestAnimationFrame(draw); return; }
  const now = performance.now();

  // camera follows predicted self
  const pcx = self.x + PW / 2, pcy = self.y + PH / 2;
  camX = Math.max(0, Math.min(Math.max(0, level.width - VW), pcx - VW / 2));
  camY = Math.max(0, Math.min(Math.max(0, level.height - VH), pcy - VH / 2));
  if (level.width < VW) camX = (level.width - VW) / 2;
  if (level.height < VH) camY = (level.height - VH) / 2;

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  const g = 80;
  for (let x = -camX % g; x < VW; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VH); ctx.stroke(); }
  for (let y = -camY % g; y < VH; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke(); }

  // platforms
  for (const p of level.platforms) {
    ctx.fillStyle = '#1e2a41'; ctx.fillRect(p.x - camX, p.y - camY, p.w, p.h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(p.x - camX, p.y - camY, p.w, 3);
  }

  // doors
  promptDoor = null;
  for (const d of level.doors) {
    const dx = d.x - camX, dy = d.y - camY;
    ctx.fillStyle = 'rgba(59,130,246,0.18)'; ctx.fillRect(dx, dy, d.w, d.h);
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.strokeRect(dx, dy, d.w, d.h);
    ctx.fillStyle = '#93c5fd'; ctx.font = '12px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText(d.label, dx + d.w / 2, dy - 8);
    if (aabb(self.x, self.y, PW, PH, d)) promptDoor = d;
  }

  // bullets (extrapolate from last snapshot)
  const bt = (now - bulletsAt) / 1000;
  for (const b of bullets) {
    const bx = b.x + b.vx * bt - camX, by = b.y + b.vy * bt - camY;
    ctx.fillStyle = b.color || '#fbbf24';
    ctx.shadowColor = b.color || '#fbbf24'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // muzzle flash
  if (muzzle && now - muzzle.t < 60) {
    ctx.fillStyle = 'rgba(255,240,180,0.9)';
    ctx.beginPath(); ctx.arc(muzzle.x - camX, muzzle.y - camY, 6, 0, Math.PI * 2); ctx.fill();
  }

  // remote players (interpolated in the past)
  const renderT = now - INTERP;
  for (const [, r] of remotes) {
    const s = remoteAt(r, renderT); if (!s) continue;
    const x = s.x - camX, y = s.y - camY;
    const aim = s.facing >= 0 ? 0 : Math.PI;
    drawCharacter(x, y, s.facing, aim, r.color, false);
    ctx.fillText(r.name || '', x + PW / 2, y - 8);
  }

  // self (predicted, immediate)
  {
    const x = self.x - camX, y = self.y - camY;
    const aim = aimVector(); const ang = Math.atan2(aim.y, aim.x);
    drawCharacter(x, y, self.facing, ang, remotes.get(me.id)?.color || '#60a5fa', true);
    ctx.fillText($('who').textContent, x + PW / 2, y - 8);
  }

  // door prompt + crosshair
  if (promptDoor && !uiBlocking()) {
    $('prompt').classList.remove('hidden');
    const verb = promptDoor.type === 'leave' ? 'exit' : 'open runs';
    $('prompt').innerHTML = `Press <kbd>${prettyKey(binds.interact)}</kbd> to ${verb}`;
  } else $('prompt').classList.add('hidden');

  if (!uiBlocking()) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mouse.x - 11, mouse.y); ctx.lineTo(mouse.x - 4, mouse.y);
    ctx.moveTo(mouse.x + 4, mouse.y); ctx.lineTo(mouse.x + 11, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 11); ctx.lineTo(mouse.x, mouse.y - 4);
    ctx.moveTo(mouse.x, mouse.y + 4); ctx.lineTo(mouse.x, mouse.y + 11); ctx.stroke();
  }

  requestAnimationFrame(draw);
}

// ============================================================================
// Start
// ============================================================================
function startGame(username) {
  $('auth').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('who').textContent = username;
  connect();
  setInterval(simStep, 1000 / 60); // prediction/send loop
  draw();                          // render loop
}
