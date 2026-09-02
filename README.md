# Real-time multiplayer arena

A minimal but complete real-time multiplayer game. Every connected player is a
circle that moves around a shared world; everyone sees everyone else move live.
The server is authoritative (it owns the game state), clients just send key
input and draw snapshots. Built to deploy on Render's free tier.

```
server.js          Node + Express + ws. Serves the client AND runs the game loop.
public/index.html  The whole client: canvas renderer, input, auto-reconnect.
package.json       start script + node engine, so Render knows how to run it.
```

## Run it locally

```bash
npm install
npm start
```

Open http://localhost:3000 in two browser tabs (or two devices on your network)
and move with **WASD** / arrow keys. You'll see both players in each tab.

## Deploy to Render (free)

1. Push this folder to a **GitHub** repo (do not commit `node_modules` — the
   included `.gitignore` handles that).
2. Go to https://render.com → **New** → **Web Service** → connect your repo.
3. Render auto-detects Node. Confirm these settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. Click **Create Web Service**. In ~2 minutes you get a URL like
   `https://your-game.onrender.com` — share it and play.

You don't need to set a PORT variable. Render injects `PORT` automatically and
`server.js` reads it. WebSockets work over the same URL because the client picks
`wss://` automatically when the page is served over HTTPS.

## The one free-tier gotcha: cold starts

Render's free tier spins the server down after ~15 minutes of no traffic. The
next visitor then waits 30–60 seconds for it to wake — rough for a real-time
game. Two options:

- **Keep it warm:** create a free cron job at https://cron-job.org that GETs
  your Render URL every ~10 minutes.
- **Upgrade later:** if the game gets real use, a small always-on box (Render's
  paid starter, or a ~€4/mo Hetzner VPS) removes cold starts entirely.

## Where to take it next

This scaffold is the foundation for most real-time games. Common next steps:

- **Add game rules** in the server loop (collisions, scoring, items, health).
- **Client-side interpolation** so movement looks buttery between the 30 Hz
  snapshots (lerp each player toward its latest server position).
- **Rooms / lobbies** so players are grouped instead of all in one world.
- **Swap `ws` for socket.io** if you want built-in rooms and reconnection
  handling out of the box.
