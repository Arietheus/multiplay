'use strict';

// ============================================================================
// Auth screen
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
    ? 'Username: 3–20 letters, numbers, or underscores. Password: 8+ characters.'
    : '';
  $('authmsg').textContent = '';
}
$('tabLogin').onclick = () => setMode('login');
$('tabRegister').onclick = () => setMode('register');

async function submitAuth() {
  const username = $('u').value.trim();
  const password = $('pw').value;
  $('authmsg').textContent = '';
  $('submit').disabled = true;
  try {
    const res = await fetch('/api/' + mode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { $('authmsg').textContent = data.error || 'Something went wrong.'; return; }
    startGame(data.username);
  } catch {
    $('authmsg').textContent = 'Network error. Try again.';
  } finally {
    $('submit').disabled = false;
  }
}
$('submit').onclick = submitAuth;
$('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
$('u').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pw').focus(); });

// Auto-login if a valid session cookie already exists.
(async function tryResume() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (res.ok) { const d = await res.json(); startGame(d.username); }
  } catch {}
})();

$('btnLogout').onclick = async () => {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
  location.reload();
};

// ============================================================================
// Rebindable controls (persisted in localStorage — real site, so this is fine)
// ============================================================================
// Only move/jump/interact/chat/settings are wired up today. shoot/secondary/
// inventory are defined so they're already rebindable and persist — behavior
// gets added later without touching this structure.
const DEFAULTS = {
  left: 'ArrowLeft', right: 'ArrowRight', jump: 'Space', interact: 'KeyA',
  chat: 'Enter', settings: 'Escape',
  shoot: 'KeyD', secondary: 'KeyS', inventory: 'Tab',
};
const LABELS = {
  left: 'Move left', right: 'Move right', jump: 'Jump', interact: 'Interact',
  chat: 'Chat', settings: 'Settings',
  shoot: 'Shoot', secondary: 'Secondary', inventory: 'Inventory',
};
const ACTIVE = new Set(['left', 'right', 'jump', 'interact', 'chat', 'settings']);

let binds = loadBinds();
function loadBinds() {
  try {
    const saved = JSON.parse(localStorage.getItem('sb_controls') || '{}');
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}
function saveBinds() { localStorage.setItem('sb_controls', JSON.stringify(binds)); }
function codeToAction() {
  const map = {};
  for (const a in binds) map[binds[a]] = a;
  return map;
}
let CODE2ACTION = codeToAction();

function prettyKey(code) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '').replace(/^Digit/, '')
    .replace('ArrowLeft', '←').replace('ArrowRight', '→')
    .replace('ArrowUp', '↑').replace('ArrowDown', '↓')
    .replace('Space', 'Space').replace('Escape', 'Esc');
}

// Controls overlay UI
let listeningFor = null;
function renderBinds() {
  const list = $('bindlist'); list.innerHTML = '';
  for (const action of Object.keys(DEFAULTS)) {
    const row = document.createElement('div'); row.className = 'bindrow';
    const left = document.createElement('span'); left.className = 'act';
    left.textContent = LABELS[action];
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
let ws = null, connected = false, me = null;
let room = null;                 // { platforms, doors, width, height, ... }
const remote = new Map();        // id -> { x,y,rx,ry,facing,color,name }

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { connected = true; $('dot').classList.add('on'); };
  ws.onclose = (e) => {
    connected = false; $('dot').classList.remove('on');
    if (e.code === 4001) { addSys('Signed in from another tab.'); return; }
    setTimeout(connect, 1000);
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
}
function sendInput() {
  if (ws && connected) ws.send(JSON.stringify({ type: 'input', left: held.left, right: held.right, jump: held.jump }));
}
function onMessage(m) {
  switch (m.type) {
    case 'welcome': me = m.user; $('who').textContent = m.user.username; break;
    case 'room':
      room = m; remote.clear();
      $('room').textContent = '· ' + (m.kind === 'run' ? `Run (${m.id.slice(4)})` : m.name);
      closeRuns();
      break;
    case 'state': {
      const seen = new Set();
      for (const p of m.players) {
        seen.add(p.id);
        let r = remote.get(p.id);
        if (!r) { r = { rx: p.x, ry: p.y }; remote.set(p.id, r); }
        Object.assign(r, { x: p.x, y: p.y, facing: p.facing, color: p.color, name: p.name });
      }
      for (const id of remote.keys()) if (!seen.has(id)) remote.delete(id);
      break;
    }
    case 'chat': addChat(m.from, m.text, m.color); break;
    case 'system': addSys(m.text); break;
    case 'runList': showRuns(m.runs); break;
  }
}

// ============================================================================
// Input
// ============================================================================
const held = { left: false, right: false, jump: false };
let promptDoor = null;

function chatOpen() { return !$('chatform').classList.contains('hidden'); }
function openChat() {
  $('chatform').classList.remove('hidden'); $('chatinput').focus();
  held.left = held.right = held.jump = false; sendInput(); // don't keep moving while typing
}
function closeChat() { $('chatform').classList.add('hidden'); $('chatinput').value = ''; $('chatinput').blur(); }

$('chatform').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('chatinput').value;
  if (text.trim() && ws && connected) ws.send(JSON.stringify({ type: 'chat', text }));
  closeChat();
});
$('chatinput').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeChat(); } });

window.addEventListener('keydown', (e) => {
  // Capturing a new keybind takes priority over everything.
  if (listeningFor) {
    e.preventDefault();
    if (e.code !== 'Escape') { binds[listeningFor] = e.code; saveBinds(); CODE2ACTION = codeToAction(); }
    listeningFor = null; renderBinds();
    return;
  }
  if ($('game').classList.contains('hidden')) return;      // still on auth screen
  if (e.target === $('chatinput')) return;                 // typing in chat
  if (e.repeat) { if (CODE2ACTION[e.code]) e.preventDefault(); return; }

  const action = CODE2ACTION[e.code];
  if (!action) return;
  e.preventDefault();

  switch (action) {
    case 'settings': $('controls').classList.contains('hidden') ? openControls() : closeControls(); break;
    case 'chat': if (!chatOpen()) openChat(); break;
    case 'left': held.left = true; sendInput(); break;
    case 'right': held.right = true; sendInput(); break;
    case 'jump': held.jump = true; sendInput(); break;
    case 'interact':
      if (ws && connected) ws.send(JSON.stringify({ type: 'interact' }));
      break;
    // shoot / secondary / inventory: reserved, no behavior yet
  }
});
window.addEventListener('keyup', (e) => {
  const action = CODE2ACTION[e.code];
  if (!action) return;
  if (action === 'left') { held.left = false; sendInput(); }
  else if (action === 'right') { held.right = false; sendInput(); }
  else if (action === 'jump') { held.jump = false; sendInput(); }
});

// ============================================================================
// Run browser
// ============================================================================
function showRuns(runs) {
  const list = $('runlist'); list.innerHTML = '';
  if (!runs.length) {
    const e = document.createElement('div'); e.className = 'empty';
    e.textContent = 'No open runs yet. Create one and your friends can join.';
    list.appendChild(e);
  }
  for (const r of runs) {
    const row = document.createElement('div'); row.className = 'runrow';
    const meta = document.createElement('div');
    const host = document.createElement('div'); host.textContent = `${r.host}'s run`;
    const sub = document.createElement('div'); sub.className = 'meta';
    sub.textContent = `${r.count}/${r.cap} players`;
    meta.appendChild(host); meta.appendChild(sub);
    const btn = document.createElement('button'); btn.className = 'primary small';
    btn.textContent = r.count >= r.cap ? 'Full' : 'Join';
    btn.disabled = r.count >= r.cap;
    btn.onclick = () => ws && ws.send(JSON.stringify({ type: 'joinRun', id: r.id }));
    row.appendChild(meta); row.appendChild(btn); list.appendChild(row);
  }
  $('runs').classList.remove('hidden');
}
function closeRuns() { $('runs').classList.add('hidden'); }
$('closeRuns').onclick = closeRuns;
$('createRun').onclick = () => ws && ws.send(JSON.stringify({ type: 'createRun' }));
$('refreshRuns').onclick = () => ws && ws.send(JSON.stringify({ type: 'listRuns' }));

// ============================================================================
// Chat log
// ============================================================================
function scrollChat() { const l = $('chatlog'); l.scrollTop = l.scrollHeight; }
function addChat(from, text, color) {
  const line = document.createElement('div');
  const name = document.createElement('span'); name.className = 'name';
  name.style.color = color || '#fff'; name.textContent = from + ': ';
  const body = document.createElement('span'); body.textContent = text; // textContent = XSS-safe
  line.appendChild(name); line.appendChild(body);
  $('chatlog').appendChild(line); trimChat(); scrollChat();
}
function addSys(text) {
  const line = document.createElement('div'); line.className = 'sys';
  line.textContent = text; $('chatlog').appendChild(line); trimChat(); scrollChat();
}
function trimChat() { const l = $('chatlog'); while (l.children.length > 60) l.removeChild(l.firstChild); }

// ============================================================================
// Rendering
// ============================================================================
const canvas = $('c'), ctx = canvas.getContext('2d');
const PW = 26, PH = 38;
let VW = 0, VH = 0;
function resize() { VW = canvas.width = innerWidth; VH = canvas.height = innerHeight; }
addEventListener('resize', resize); resize();

function aabb(ax, ay, aw, ah, b) {
  return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;
}

function draw() {
  ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, VW, VH);
  if (!room || !me) { requestAnimationFrame(draw); return; }

  const self = remote.get(me.id);
  // smooth (lerp) each rendered position toward the latest server position
  for (const r of remote.values()) { r.rx += (r.x - r.rx) * 0.35; r.ry += (r.y - r.ry) * 0.35; }

  const cx = self ? self.rx + PW / 2 : room.width / 2;
  const cy = self ? self.ry + PH / 2 : room.height / 2;
  let camX = cx - VW / 2, camY = cy - VH / 2;
  camX = Math.max(0, Math.min(Math.max(0, room.width - VW), camX));
  camY = Math.max(0, Math.min(Math.max(0, room.height - VH), camY));
  if (room.width < VW) camX = (room.width - VW) / 2;
  if (room.height < VH) camY = (room.height - VH) / 2;

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  const g = 80;
  for (let x = -camX % g; x < VW; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VH); ctx.stroke(); }
  for (let y = -camY % g; y < VH; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke(); }

  // platforms
  for (const p of room.platforms) {
    ctx.fillStyle = '#1e2a41';
    ctx.fillRect(p.x - camX, p.y - camY, p.w, p.h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(p.x - camX, p.y - camY, p.w, 3);
  }

  // doors
  promptDoor = null;
  for (const d of room.doors) {
    const dx = d.x - camX, dy = d.y - camY;
    ctx.fillStyle = 'rgba(59,130,246,0.18)';
    ctx.fillRect(dx, dy, d.w, d.h);
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.strokeRect(dx, dy, d.w, d.h);
    ctx.fillStyle = '#93c5fd'; ctx.font = '12px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText(d.label, dx + d.w / 2, dy - 8);
    if (self && aabb(self.rx, self.ry, PW, PH, d)) promptDoor = d;
  }

  // players
  for (const [id, r] of remote) {
    const x = r.rx - camX, y = r.ry - camY;
    ctx.fillStyle = r.color || '#888';
    roundRect(ctx, x, y, PW, PH, 6); ctx.fill();
    if (id === me.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; roundRect(ctx, x, y, PW, PH, 6); ctx.stroke(); }
    // facing eye
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x + (r.facing >= 0 ? PW - 10 : 4), y + 10, 6, 6);
    // name
    ctx.fillStyle = '#e5e7eb'; ctx.font = '12px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText(r.name || '', x + PW / 2, y - 8);
  }

  // door prompt
  if (promptDoor && !chatOpen()) {
    $('prompt').classList.remove('hidden');
    const verb = promptDoor.type === 'leave' ? 'exit' : 'open runs';
    $('prompt').innerHTML = `Press <kbd>${prettyKey(binds.interact)}</kbd> to ${verb}`;
  } else {
    $('prompt').classList.add('hidden');
  }

  requestAnimationFrame(draw);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
draw();

// ============================================================================
// Start
// ============================================================================
function startGame(username) {
  $('auth').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('who').textContent = username;
  connect();
}
