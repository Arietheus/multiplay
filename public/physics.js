// Shared, deterministic, fixed-timestep platformer physics.
//
// This SAME file runs on the server (require) and in the browser (script tag).
// Client-side prediction only works if both sides compute identical results
// for the same inputs, so there must be exactly one copy of this logic. Every
// value is integer-tick or fixed-DT based (no wall-clock) to stay deterministic.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Physics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DT = 1 / 60;                 // fixed simulation step
  const GRAV = 2200;
  const MOVE_ACCEL = 7000, AIR_ACCEL = 4200;
  const MAX_RUN = 340, FRICTION = 4200;
  const JUMP_VEL = -780, JUMP_CUTOFF = 0.45, MAX_FALL = 1500;
  const COYOTE_TICKS = 6, BUFFER_TICKS = 7;
  const PW = 26, PH = 38;

  const overlap = (ax, ay, aw, ah, b) =>
    ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;

  // Fresh movement state at a spawn point.
  function newState(spawn) {
    return { x: spawn.x, y: spawn.y, vx: 0, vy: 0,
      grounded: false, coyote: 0, buffer: 0, pjump: false, facing: 1 };
  }

  // Advance ONE state by ONE tick given a held-input snapshot. Mutates s.
  // input = { left, right, jump }; level = { platforms, width, height, spawn }.
  function step(s, input, level) {
    const plats = level.platforms;

    if (input.jump && !s.pjump) s.buffer = BUFFER_TICKS;      // jump pressed
    if (!input.jump && s.pjump && s.vy < 0) s.vy *= JUMP_CUTOFF; // released early
    s.pjump = input.jump;
    if (s.buffer > 0) s.buffer--;

    const dir = (input.left && !input.right) ? -1 : (input.right && !input.left) ? 1 : 0;
    const accel = s.grounded ? MOVE_ACCEL : AIR_ACCEL;
    if (dir !== 0) {
      s.vx += dir * accel * DT;
      if (s.vx > MAX_RUN) s.vx = MAX_RUN;
      if (s.vx < -MAX_RUN) s.vx = -MAX_RUN;
      s.facing = dir;
    } else if (s.grounded) {
      if (s.vx > 0) s.vx = Math.max(0, s.vx - FRICTION * DT);
      else if (s.vx < 0) s.vx = Math.min(0, s.vx + FRICTION * DT);
    }

    if (s.buffer > 0 && (s.grounded || s.coyote > 0)) {
      s.vy = JUMP_VEL; s.buffer = 0; s.coyote = 0; s.grounded = false;
    }

    s.vy += GRAV * DT;
    if (s.vy > MAX_FALL) s.vy = MAX_FALL;

    // X axis
    s.x += s.vx * DT;
    for (const pl of plats)
      if (overlap(s.x, s.y, PW, PH, pl)) { s.x = s.vx > 0 ? pl.x - PW : pl.x + pl.w; s.vx = 0; }

    // Y axis
    s.grounded = false;
    s.y += s.vy * DT;
    for (const pl of plats)
      if (overlap(s.x, s.y, PW, PH, pl)) {
        if (s.vy > 0) { s.y = pl.y - PH; s.grounded = true; }
        else if (s.vy < 0) s.y = pl.y + pl.h;
        s.vy = 0;
      }
    if (s.grounded) s.coyote = COYOTE_TICKS; else if (s.coyote > 0) s.coyote--;

    if (s.x < 0) s.x = 0;
    if (s.x > level.width - PW) s.x = level.width - PW;
    if (s.y > level.height + 200) { s.x = level.spawn.x; s.y = level.spawn.y; s.vx = 0; s.vy = 0; }
    return s;
  }

  return { DT, PW, PH, MAX_FALL, newState, step };
});
