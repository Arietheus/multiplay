// Shared, deterministic physics — ported from Void Shell's per-frame model so
// the feel is identical. Runs on the server (require) and client (script tag);
// client-side prediction depends on both computing the same result.
//
// Void Shell values (per 60fps frame): GRAVITY 0.48, JUMP_V -9, friction
// .75 ground / .92 air, runMax 3.6, runAccel 0.85, coyote/buffer 7, one-way
// ledges (only `solid` platforms block and stop bullets).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Physics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 760, H = 440, FLOOR_TOP = 416;
  const GRAVITY = 0.48, MAX_FALL = 12;
  const FRICTION_GROUND = 0.75, FRICTION_AIR = 0.92;
  const JUMP_V = -9, HOP_V = -9;
  const RUN_MAX = 3.6, RUN_ACCEL = 0.85;
  const COYOTE = 7, BUFFER = 7, JUMPS = 1;
  const PW = 15, PH = 21;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hit = (s, b) => s.x < b.x + b.w && s.x + PW > b.x && s.y < b.y + b.h && s.y + PH > b.y;

  function newState(spawn) {
    return { x: spawn.x, y: spawn.y, vx: 0, vy: 0,
      onGround: false, coyote: 0, jumps: JUMPS, face: 1,
      dropThru: 0, buffer: 0, pjump: false };
  }

  // input = { left, right, jump, down }; level = { platforms, width, height, spawn }
  function step(s, input, level) {
    const plats = level.platforms;

    if (input.jump && !s.pjump) s.buffer = BUFFER;
    s.pjump = input.jump;
    if (s.buffer > 0) s.buffer--;
    if (s.dropThru > 0) s.dropThru--;

    const ix = (input.left && !input.right) ? -1 : (input.right && !input.left) ? 1 : 0;
    if (ix !== 0) { s.vx = clamp(s.vx + ix * RUN_ACCEL, -RUN_MAX, RUN_MAX); s.face = ix; }
    else { s.vx *= s.onGround ? FRICTION_GROUND : FRICTION_AIR; if (Math.abs(s.vx) < 0.05) s.vx = 0; }

    // drop through a one-way ledge: hold down + jump
    if (s.buffer > 0 && input.down && s.onGround && s.dropThru <= 0) {
      const under = plats.find((p) => !p.solid &&
        Math.abs(s.y + PH - p.y) < 3 && s.x + PW > p.x && s.x < p.x + p.w);
      if (under) { s.dropThru = 10; s.y += 3; s.vy = 1.4; s.onGround = false; s.buffer = 0; }
    }

    if (s.buffer > 0) {
      if (s.onGround || s.coyote > 0) { s.vy = JUMP_V; s.jumps = JUMPS - 1; s.coyote = 0; s.buffer = 0; }
      else if (s.jumps > 0) { s.vy = HOP_V; s.jumps--; s.buffer = 0; }
    }

    s.vy = Math.min(s.vy + GRAVITY, MAX_FALL);

    // X move + solid resolve + world clamp
    s.x += s.vx;
    for (const p of plats) if (p.solid && hit(s, p)) { s.x = s.vx > 0 ? p.x - PW : p.x + p.w; s.vx = 0; }
    if (s.x < 0) { s.x = 0; s.vx = 0; }
    if (s.x > level.width - PW) { s.x = level.width - PW; s.vx = 0; }

    // Y move + one-way / solid resolve
    const prevBottom = s.y + PH;
    s.onGround = false;
    s.y += s.vy;
    for (const p of plats) {
      if (!hit(s, p)) continue;
      if (!p.solid) {
        if (s.vy <= 0 || prevBottom > p.y + 1 || s.dropThru > 0) continue;
        s.y = p.y - PH; s.onGround = true; s.jumps = JUMPS; s.vy = 0;
      } else {
        if (s.vy > 0) { s.y = p.y - PH; s.onGround = true; s.jumps = JUMPS; }
        else if (s.vy < 0) s.y = p.y + p.h;
        s.vy = 0;
      }
    }
    if (s.onGround) s.coyote = COYOTE; else if (s.coyote > 0) s.coyote--;
    return s;
  }

  return { W, H, FLOOR_TOP, PW, PH, MAX_FALL, JUMP_V, newState, step };
});
