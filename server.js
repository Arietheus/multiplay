// Minimal real-time multiplayer game server.
// One HTTP server does double duty: serves the client files AND upgrades
// to WebSocket connections. Render gives you exactly one port, so this
// single-port design is what makes it deploy cleanly.

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Game constants ---
const WORLD = { width: 1600, height: 1600 };
const SPEED = 260;          // pixels per second
const TICK_RATE = 30;       // server updates per second
const PLAYER_RADIUS = 22;

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6',
                '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// The whole game state lives here on the server. This is what "authoritative
// server" means: the server owns the truth, clients just send intent + draw.
const players = new Map(); // id -> { x, y, color, name, input }
let nextId = 1;

function randomSpawn() {
  return {
    x: Math.random() * (WORLD.width - 200) + 100,
    y: Math.random() * (WORLD.height - 200) + 100,
  };
}

wss.on('connection', (ws) => {
  const id = nextId++;
  const spawn = randomSpawn();
  players.set(id, {
    x: spawn.x,
    y: spawn.y,
    color: COLORS[(id - 1) % COLORS.length],
    name: `Player ${id}`,
    input: { up: false, down: false, left: false, right: false },
  });

  // First thing the client hears: who it is and how big the world is.
  ws.send(JSON.stringify({ type: 'welcome', id, world: WORLD }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = players.get(id);
    if (!p) return;

    if (msg.type === 'input' && msg.input) {
      // We only trust key state, never a position the client claims to be at.
      p.input = {
        up: !!msg.input.up,
        down: !!msg.input.down,
        left: !!msg.input.left,
        right: !!msg.input.right,
      };
    } else if (msg.type === 'name' && typeof msg.name === 'string') {
      p.name = msg.name.trim().slice(0, 16) || p.name;
    }
  });

  const drop = () => players.delete(id);
  ws.on('close', drop);
  ws.on('error', drop);
});

// --- Authoritative game loop ---
// Runs TICK_RATE times per second: move everyone based on their held keys,
// then broadcast one snapshot of the whole world to every client.
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;

  for (const p of players.values()) {
    let dx = 0, dy = 0;
    if (p.input.up) dy -= 1;
    if (p.input.down) dy += 1;
    if (p.input.left) dx -= 1;
    if (p.input.right) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy); // normalize so diagonals aren't faster
      p.x += (dx / len) * SPEED * dt;
      p.y += (dy / len) * SPEED * dt;
      p.x = Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, p.x));
      p.y = Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, p.y));
    }
  }

  const snapshot = JSON.stringify({
    type: 'state',
    players: Array.from(players.entries()).map(([id, p]) => ({
      id, x: Math.round(p.x), y: Math.round(p.y), color: p.color, name: p.name,
    })),
  });

  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) client.send(snapshot);
  }
}, 1000 / TICK_RATE);

// Render injects PORT. Falling back to 3000 lets it run locally too.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Game server listening on :${PORT}`));
