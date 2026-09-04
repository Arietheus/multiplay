# Void Runs — co-op bullet-hell runs, accounts, chat

A multiplayer gravity **bullet-hell platformer**. A walkable lobby, a door that
drops you into shared **run** instances with friends, and co-op waves of enemies
that build to a boss. The physics, palette, controls, arenas, enemy patterns and
the first boss are ported to match the single-player game **Void Shell**.
Server-authoritative, built to deploy free on Render with a free Neon database.

```
server.js          Express routes + authenticated WebSocket upgrade
auth.js            Register/login/logout, argon2id hashing, sessions, rate limiting
db.js              Postgres pool + schema
game.js            Authoritative sim: rooms, waves, enemies, the maw boss, emit/lob
public/physics.js  SHARED deterministic physics (Void Shell model; server + client)
public/index.html  Auth, canvas, hearts/wave HUD, boss bar, options (skins + rebind)
public/game.js     Client: prediction/reconciliation, aim, Void Shell rendering
```

## What was ported from Void Shell

- **Physics** — exact per-frame model: GRAVITY 0.48, JUMP_V −9, friction .75/.92,
  runMax 3.6, runAccel 0.85, coyote/buffer 7, one-way ledges (rise through, land
  on top; hold **down + jump** to drop through). 760×440 single screen.
- **Combat feel** — 5 hearts, the signature tiny **core hurtbox** (only your
  centre dot takes damage, so dense patterns have threadable gaps), 92-frame
  i-frames, fire (bulletSpeed 8.4, cooldown 7), and a dash with i-frames.
- **Netcode juice** — your movement, **dash**, and **your own shots** are all
  predicted client-side and reconciled against the authoritative server, so they
  feel instant. Enemies and enemy bullets are extrapolated between snapshots for
  smooth 60fps motion. Screen **shake** and particle **bursts** (both copied from
  Void Shell) fire on hits, dashes, and kills.
- **Scrolling worlds** — the lobby and arenas are large; a zoomed-in camera
  follows the player and clamps to the world edges.
- **Slag currency** — earn Void Shell's slag (`floor(score/130) + bosses×6`),
  banked to your account when a run ends; your total and best wave persist.
- **Host controls + save** — the run's host gets an **End run** button that ends
  it for everyone, banks each player's slag and best wave, and shows a postmortem
  summary before returning to the lobby (a party wipe does the same). Runs are
  entered through a **gate** in the centre of the lobby.
- **Difficulty depths + party scaling** — the host picks a depth when creating a
  run (Shallow / Working / Deep cut / Abyssal, from Void Shell), which sets your
  max hearts (7/5/4/3), enemy count, projectile speed, enemy and boss health, and
  the slag payout. On top of that, runs scale with party size: more players means
  more and tougher enemies.
- **Void Shell hitbox** — only a 7.5px core at your centre takes damage, and an
  enemy shot must land its centre inside that box (no radius padding) — the exact,
  forgiving hurtbox from the original.
- **One session per account** — logging in again kicks the older connection
  (which shows "Signed in from another tab"), so an account is only ever live once.
- **Admin commands** — accounts listed in the `ADMIN_USERS` env var can type
  commands in chat: `/skip`, `/wave N`, `/slag N`, `/heal`, `/god`, `/kill`,
  `/boss <maw|anvil|vesper|chorus|bore>`, `/help`. Non-admins get "Unknown command".
- **Palette + 5 skins** — the `C` palette (sulfur/ash/oxide/brine/bloom),
  switchable live in Options; the whole game repaints, sprites and chrome alike.
- **Controls** — StarBreak-style: arrows move, ↑/↓ aim, **Space/F** jump, **D**
  fire, **Shift** dash, **A** interact, **M** mouse-aim, plus **S** grenade
  reserved. All rebindable, saved in your browser.
- **Six arenas** — Ledges, Spine, Terraces, Chasm (no centre floor), Pillars
  (and Lifts is the next drop — see below).
- **Pattern system** — the `emit()` (rings/fans) and `lob()` (arced) emitters, so
  every hostile pattern is a description, not a hand-rolled loop.
- **Enemies** — drifter, spitter, diver, with the wave/tier structure.
- **Bosses** — five, on Void Shell's rotation (tier = every 5th wave): the
  **brood maw** (barrage / brood / slam), **the anvil** (a ground bruiser that
  hammers shockwaves down the floor, leaps, vents drifters and charges), **vesper**
  (blinks around you, paints a firing line, sweeps a burning trail), **the chorus**
  (sword + shield twins orbiting a shared hub — the shield only opens when its
  guard drops, and the survivor enrages), and **the bore** (tunnels off-screen,
  telegraphs a lane, then streaks through it — only vulnerable mid-dive). Each
  boss's AI and sprite are ported from the source.

## 1. Database (Neon — free, persistent)

1. Sign up at https://neon.tech (free, no card).
2. Create a project; Neon provisions Postgres.
3. Copy the **Connection string** (`postgresql://user:pass@ep-xxx.aws.neon.tech/db?sslmode=require`).
   That's your `DATABASE_URL`. The app creates its own tables on first boot.

## 2. Run locally (optional)

```bash
npm install
DATABASE_URL="postgresql://...your neon string..." npm start
```

Open http://localhost:3000, make an account, walk to the **RUNS** door, and create
a run. Open a second browser/incognito with another account to fight a wave together.

## 3. Deploy to Render

1. Push this folder to a **GitHub** repo (`.gitignore` keeps `node_modules`/`.env` out).
2. Render → **New** → **Web Service** → connect the repo.
3. **Build Command** `npm install` · **Start Command** `npm start` · **Instance** Free.
4. **Environment** → add `DATABASE_URL` = your Neon string.
5. **Create Web Service.** When the log shows `Database ready.` then
   `Server listening`, open the `*.onrender.com` URL.

Free web services sleep after ~15 min idle; a cron-job.org ping every 10 min keeps
it warm. Accounts live in Neon, so they persist across sleeps and redeploys.

> **Uploading the update:** this replaces existing files, so overwrite them all in
> your repo. Note the shared **`public/physics.js`** — both server and browser load
> it, so the game won't start if it's missing.

## Security (the account system)

- **Passwords** hashed with **argon2id** (`m=19456, t=2, p=1`); plaintext never stored.
- **Sessions**: a 256-bit token in an **httpOnly + Secure + SameSite=Lax** cookie;
  the DB stores only its **SHA-256**, so a leak can't be replayed. 7-day expiry, hourly sweep.
- **No username enumeration** — login always runs a verify (dummy hash if needed) and
  returns one generic error.
- **Rate limiting** on register/login; **parameterized** SQL; chat rendered with
  `textContent`, never `innerHTML`.
- **Authoritative server + client prediction** — the client predicts its own movement
  instantly with the same deterministic physics, then reconciles to the server, which
  owns every position and validates shots (no teleport/speed/fire-rate hacks).

## Where to take it next

- **More bosses** — the anvil, vesper, the chorus twins, the bore, and the rest drop
  into the `BOSSES` map + a `stepXxx` function, same shape as `stepMaw`.
- **Full enemy roster** — splitter, lancer, warden, seeder, howler: add to `KINDS` + a
  branch in `stepFoe`.
- **Grenade + secondary** — the **S** bind is reserved; `lob()` already exists to build on.
- **Lifts arena** — the 6th Void Shell arena has moving platforms; add a mover field to
  the platform format and step them in `simulate()`.
- **Depths/shells** — Void Shell's difficulties and player classes tune the same `BASE`
  stat block per player.

## Testing

`det_test.js` checks physics determinism (prediction replay == full sim). `itest.js`
boots the real server on an in-memory Postgres and checks auth, movement, waves,
firing, enemy patterns, kills, and dash. `btest.js` (with `VS_BOSS_EVERY=1`) checks the
maw spawns, descends, patterns, and takes damage. Run `node <file>` from this folder.
