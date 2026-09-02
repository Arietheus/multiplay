const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const db = require('./db');
const auth = require('./auth');
const game = require('./game');

const app = express();
app.set('trust proxy', 1);          // Render terminates TLS in front of us
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/register', auth.register);
app.post('/api/login', auth.login);
app.post('/api/logout', auth.logout);
app.get('/api/me', auth.me);

const server = http.createServer(app);

// Manual upgrade handling so we can authenticate BEFORE accepting the socket.
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', async (req, socket, head) => {
  try {
    const user = await auth.authenticateWs(req);
    if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => game.onConnection(ws, user));
  } catch (e) {
    console.error('upgrade error', e);
    try { socket.destroy(); } catch {}
  }
});

const PORT = process.env.PORT || 3000;
db.init()
  .then(() => auth.init())
  .then(() => {
    game.start();
    server.listen(PORT, () => console.log(`Server listening on :${PORT}`));
  })
  .catch((e) => { console.error('Startup failed:', e); process.exit(1); });
