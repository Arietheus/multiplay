# Run Lobby — platformer lobby + runs, accounts, chat

A side-scrolling multiplayer platformer with momentum-based movement, a walkable
lobby, doors that drop you into shared **run** instances with friends, per-room
chat, rebindable controls, and a **secure account system**. Server-authoritative,
built to deploy on Render's free tier with a free Neon Postgres database.

```
server.js          Express routes + authenticated WebSocket upgrade
auth.js            Register/login/logout, argon2id hashing, sessions, rate limiting
db.js              Postgres pool + schema
game.js            Physics, rooms, doors, run instances, chat (the game loop)
public/index.html  Auth screen, canvas, HUD, chat, controls + run-browser overlays
public/game.js     Client: auth, WebSocket, rendering, rebindable input, chat
```

## 1. Set up the database (Neon — free, persistent)

1. Go to https://neon.tech and sign up (free, no card).
2. Create a new project. Neon makes a Postgres database for you.
3. On the project dashboard, find **Connection string** and copy it. It looks like
   `postgresql://user:password@ep-xxx.aws.neon.tech/dbname?sslmode=require`.
4. Keep it handy — it's your `DATABASE_URL`. The app creates its own tables on
   first start, so there's nothing else to configure.

## 2. Run locally (optional)

```bash
npm install
DATABASE_URL="postgresql://...your neon string..." npm start
```

Open http://localhost:3000, create an account, and you're in the lobby. Open a
second browser (or an incognito window) to test multiplayer with a second account.

## 3. Deploy to Render

1. Push this folder to a **GitHub** repo (the `.gitignore` keeps `node_modules`
   and `.env` out).
2. Render → **New** → **Web Service** → connect the repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. Open the **Environment** section and add one variable:
   - Key `DATABASE_URL`, value = your Neon connection string.
5. **Create Web Service.** First build takes a couple minutes; when the log shows
   `Database ready.` then `Server listening`, open your `*.onrender.com` URL.

Cold-start note still applies: the free web service sleeps after ~15 min idle. Use
the cron-job.org ping (every 10 min) from before to keep it warm. Your accounts
live in Neon, so they persist across sleeps, restarts, and redeploys.

## Controls

Arrow keys move · **Space** jump · **A** interact (doors) · **Enter** chat ·
**Esc** settings. Every key is rebindable in the Controls menu and saved in your
browser. Slots for **Shoot (D)**, **Secondary (S)**, and **Inventory (Tab)** are
already present and rebindable — they just don't do anything yet.

## How the security works (the account system)

- **Passwords**: hashed with **argon2id** (memory-hard; OWASP-recommended
  defaults `m=19456, t=2, p=1`). Plaintext is never stored or logged.
- **Sessions**: a 256-bit random token in an **httpOnly + Secure + SameSite=Lax**
  cookie. The database stores only the token's **SHA-256**, so a DB leak can't be
  replayed into live logins. Sessions expire after 7 days and are swept hourly.
- **No username enumeration**: login always runs a hash verify (against a dummy
  hash if the user doesn't exist) and returns one generic error, so timing and
  wording don't reveal which usernames exist.
- **Rate limiting**: register and login are throttled per IP.
- **Injection-safe**: every query is parameterized. Chat and names are rendered
  with `textContent`, never `innerHTML`, so messages can't inject markup.
- **Authoritative server**: clients send key intent only; the server owns all
  positions, so players can't teleport or move faster by editing the client.

If you later add a custom domain or email flows, the two things to add next are a
CSRF token on the JSON POSTs (SameSite=Lax already covers the common cases) and
email verification.

## Where to take it next

- **Run content**: enemies, objectives, loot, a boss — this is the natural next
  build. The run rooms and instancing already exist; the gameplay goes in `game.js`.
- **Combat wiring**: the Shoot/Secondary/Inventory binds are ready to hook up.
- **Procedural runs**: replace `runLevel()` with a generator.
- **Smoothing**: the client already interpolates; add server reconciliation if you
  want client-side prediction for zero-latency local movement.
