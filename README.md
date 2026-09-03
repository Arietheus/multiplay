# Run Lobby — platformer lobby + runs, accounts, chat

A side-scrolling multiplayer platformer with momentum-based movement, a walkable
lobby, doors that drop you into shared **run** instances with friends, per-room
chat, rebindable controls, and a **secure account system**. Server-authoritative,
built to deploy on Render's free tier with a free Neon Postgres database.

```
server.js          Express routes + authenticated WebSocket upgrade
auth.js            Register/login/logout, argon2id hashing, sessions, rate limiting
db.js              Postgres pool + schema
game.js            Authoritative sim, rooms, doors, run instances, chat, bullets
public/physics.js  SHARED deterministic physics (required by server, loaded by client)
public/index.html  Auth screen, canvas, HUD, chat, controls + run-browser overlays
public/game.js     Client: auth, prediction/reconciliation, rendering, input, chat
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

Arrow keys move · **Space** jump · **A** interact (doors) · **D** or **left-click**
shoot · **Enter** chat · **Esc** settings. Aim with the mouse — the character's gun
arm and shots follow the cursor. Every key is rebindable in the Controls menu and
saved in your browser. Slots for **Secondary (S)** and **Inventory (Tab)** are
present and rebindable, reserved for later.

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
- **Authoritative server + client prediction**: the client predicts its own
  movement instantly (so it feels lag-free) using the SAME deterministic physics
  as the server, then reconciles against the server's authoritative snapshots.
  The server still owns every position and validates shots, so a hacked client
  can't teleport, move faster, or fire faster than the cooldown allows.

If you later add a custom domain or email flows, the two things to add next are a
CSRF token on the JSON POSTs (SameSite=Lax already covers the common cases) and
email verification.

## Where to take it next

- **Enemies + health/damage**: bullets currently fly and despawn on terrain. Give
  players/enemies health and make bullets deal damage — the projectile loop in
  `game.js` (`simulate()`) is where hit detection goes.
- **Run content**: objectives, loot, a boss. Instancing already exists.
- **Secondary + inventory**: those binds are ready to wire up.
- **Procedural runs**: replace `runLevel()` with a generator.
