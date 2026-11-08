// Parkour: running, jumping, sliding, vaulting low cover, mantling ledges, climbing walls and ladders,
// and riding ziplines between rooftops. Works on a player-like body {x, y (feet), z, vx, vy, vz, yaw}.
import { clamp, lerp } from './core.js';
import { resolveBody, moveBody, solidAt, floorAt, stackTop, headroom, ladderNear, ladderTopNear, zipNear, groundY, bucketAt } from './world.js';
import { sfx } from './audio.js';

const GRAV = 22, JUMP_V = 7.4;

export function resetParkour(P) {
  Object.assign(P, { mode: 'move', anim: null, ladder: null, zip: null, zipS: 0, zipV: 0, slideT: 0, slideCd: 0, landDip: 0, rollT: 0, grounded: true, crouch: 0, wallRunCd: 0, jumpHeld: false, airT: 0, peakY: 0, climbN: null, climbCd: 0 });
}
export function eyeHeight(P) {
  if (P.mode === 'zip') return -0.35 + 1.9; // hanging under the cable
  return lerp(1.65, 1.0, P.crouch) - P.landDip * 0.35 - (P.rollT > 0 ? Math.sin((P.rollT / 0.5) * Math.PI) * 0.7 : 0);
}

function startAnim(P, kind, tx, ty, tz, dur, peak) {
  P.mode = kind; P.anim = { t: 0, dur, fx: P.x, fy: P.y, fz: P.z, tx, ty, tz, peak: peak ?? Math.max(ty, P.y) };
  P.vy = 0;
}

// Try to get up and over whatever is in front. Returns true if a move started.
function tryLedge(P, fx, fz, inp, sprint, cb) {
  const px = P.x + fx * 0.75, pz = P.z + fz * 0.75;
  const top = stackTop(px, pz, P.y);
  if (top < 0) return false;
  const rel = top - P.y;
  if (!headroom(px, pz, top, 1.7) || !headroom(P.x, P.z, P.y + 0.1, top - P.y + 1.7)) return false; // no pulling yourself up through a ceiling
  // reach depends on what you're doing: a running jump grabs higher, a sprint into a wall lets you scramble up it
  let reach = P.grounded ? 1.3 : 2.45 + (P.vy > 0 ? 0.35 : 0);
  if (P.grounded && inp.jump) reach = 2.45;
  if (sprint && inp.jump && P.wallRunCd <= 0 && cb.stamina() > 15) reach = 4.3;
  if (rel > reach || rel < 0.3) return false;
  const far = stackTop(P.x + fx * 2.3, P.z + fz * 2.3, P.y);
  const beyondX = P.x + fx * 2.7, beyondZ = P.z + fz * 2.7;
  const thin = far < top - 0.5;
  if (thin && rel <= 1.35 && Math.hypot(P.vx, P.vz) > 2.5) {
    // vault: hop over and land on the far side
    const land = floorAt(beyondX, beyondZ, top);
    if (stackTop(beyondX, beyondZ, land) < 0 || stackTop(beyondX, beyondZ, land) <= land + 0.4) {
      startAnim(P, 'vault', beyondX, land, beyondZ, 0.42, top + 0.45);
      P.vaultSpeed = Math.max(6, Math.hypot(P.vx, P.vz));
      sfx.vault(); return true;
    }
  }
  const tx = P.x + fx * 1.25, tz = P.z + fz * 1.25;
  if (floorAt(tx, tz, top + 0.02) < top - 0.05) {
    // narrow top (a wall or fence): stand on it only if it's at least a foot wide, else vault if low
    if (rel <= 1.35) { const land = floorAt(beyondX, beyondZ, top); startAnim(P, 'vault', beyondX, land, beyondZ, 0.45, top + 0.45); P.vaultSpeed = 6; sfx.vault(); return true; }
    if (floorAt(px, pz, top + 0.02) < top - 0.05) return false;
  }
  const mx = floorAt(tx, tz, top + 0.02) >= top - 0.05 ? tx : px, mz = floorAt(tx, tz, top + 0.02) >= top - 0.05 ? tz : pz;
  if (rel > 2.6) { cb.useStamina(18); P.wallRunCd = 1.2; }
  startAnim(P, 'mantle', mx, top, mz, 0.2 + rel * 0.13);
  sfx.climb(); return true;
}

export function parkourMove(dt, P, inp, sprint, speed, cb) {
  P.landDip = Math.max(0, P.landDip - dt * 3);
  P.rollT = Math.max(0, P.rollT - dt);
  P.slideCd -= dt; P.wallRunCd -= dt;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);

  // ---- scripted moves
  if (P.mode === 'mantle' || P.mode === 'vault') {
    const A = P.anim; A.t += dt;
    const k = clamp(A.t / A.dur, 0, 1), e = k * k * (3 - 2 * k);
    P.x = lerp(A.fx, A.tx, P.mode === 'vault' ? k : e); P.z = lerp(A.fz, A.tz, P.mode === 'vault' ? k : e);
    if (P.mode === 'vault') P.y = k < 0.5 ? lerp(A.fy, A.peak, Math.sin(k * Math.PI)) : lerp(A.ty, A.peak, Math.sin(k * Math.PI));
    else P.y = lerp(A.fy, A.ty, Math.min(1, e * 1.4));
    P.crouch = Math.max(P.crouch, Math.sin(k * Math.PI) * 0.45);
    if (k >= 1) {
      P.mode = 'move'; P.y = A.ty; P.grounded = true; P.peakY = P.y;
      if (P.vaultSpeed) { P.vx = fx * P.vaultSpeed; P.vz = fz * P.vaultSpeed; P.vaultSpeed = 0; } else { P.vx *= 0.3; P.vz *= 0.3; }
    }
    return;
  }
  if (P.mode === 'climb') { climbStep(dt, P, inp, cb, fx, fz); return; }
  if (P.mode === 'ladder') {
    const L = P.ladder;
    P.x = L.x + L.nx * 0.05; P.z = L.z + L.nz * 0.05; P.vx = P.vz = 0;
    const facingWall = fx * -L.nx + fz * -L.nz > 0;
    P.y += inp.fwd * (facingWall ? 1 : -1) * 4.2 * dt; P.crouch = Math.max(0, P.crouch - dt * 4);
    if (inp.fwd) cb.stepSound(dt * 3);
    if (inp.jumpEdge) { P.mode = 'move'; P.vy = 5; P.vx = L.nx * 5; P.vz = L.nz * 5; P.grounded = false; P.peakY = P.y; return; }
    if (P.y >= L.y1 - 1.0) { startAnim(P, 'mantle', L.x - L.nx * 1.1, L.y1, L.z - L.nz * 1.1, 0.45); sfx.climb(); return; }
    if (P.y <= L.y0 && inp.fwd * (facingWall ? 1 : -1) < 0) { P.y = Math.max(L.y0, floorAt(P.x, P.z, L.y0 + 0.1)); P.mode = 'move'; }
    return;
  }
  if (P.mode === 'zip') {
    const Z = P.zip;
    P.zipV = Math.min(24, P.zipV + (3 + 30 * -Z.dy) * dt - P.zipV * 0.03 * dt);
    P.zipS += P.zipV * dt;
    const s = Math.min(P.zipS, Z.len);
    P.x = Z.a.x + Z.dx * s; P.z = Z.a.z + Z.dz * s; P.y = Z.a.y + Z.dy * s - 1.9;
    cb.zipSound(P.zipV);
    const hd = Math.hypot(Z.dx, Z.dz) || 1;
    if (inp.jumpEdge || P.zipS >= Z.len - 1.0) {
      const v = P.zipV * (P.zipS >= Z.len - 1.0 ? 0.55 : 0.9);
      P.mode = 'move'; P.vx = (Z.dx / hd) * v; P.vz = (Z.dz / hd) * v; P.vy = 2.5; P.grounded = false; P.peakY = P.y;
      cb.zipSound(0);
    }
    return;
  }

  // ---- free movement
  const moving = inp.fwd !== 0 || inp.side !== 0;
  let mx = fx * inp.fwd + rx * inp.side, mz = fz * inp.fwd + rz * inp.side; const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  // slide: crouch while sprinting
  if (inp.crouch && sprint && P.grounded && P.slideT <= 0 && P.slideCd <= 0 && moving) { P.slideT = 0.85; P.slideCd = 1.1; const sp = Math.max(Math.hypot(P.vx, P.vz), 9); P.slideDX = mx; P.slideDZ = mz; P.vx = mx * (sp + 3.5); P.vz = mz * (sp + 3.5); sfx.slide(); }
  const crouching = inp.crouch || !headroom(P.x, P.z, P.y, 1.8);
  P.crouch = lerp(P.crouch, P.slideT > 0 ? 1.15 : crouching ? 1 : 0, Math.min(1, dt * 12));
  if (P.slideT > 0) {
    P.slideT -= dt;
    const f = Math.max(0, 1 - dt * 1.6); P.vx *= f; P.vz *= f;
    if (!P.grounded || P.slideT <= 0) P.slideT = 0;
  } else {
    const spd = crouching ? Math.min(speed, 3.2) : speed;
    const acc = Math.min(1, dt * (P.grounded ? 12 : 2.6));
    P.vx = lerp(P.vx, mx * spd, acc); P.vz = lerp(P.vz, mz * spd, acc);
  }
  const ox = P.x, oz = P.z;
  P.x += (P.vx + P.kx) * dt; P.z += (P.vz + P.kz) * dt;
  const tall = P.crouch > 0.5 ? 1.1 : 1.8;
  const hit = moveBody(P, ox, oz, 0.4, P.y, tall);
  if (solidAt(P.x, P.y, P.z, 0.02)) { if (P.goodX !== undefined) { P.x = P.goodX; P.z = P.goodZ; } } else { P.goodX = P.x; P.goodZ = P.z; }
  if (hit && inp.fwd > 0) {
    const moved = Math.hypot(P.x - ox, P.z - oz) / Math.max(dt, 1e-4);
    if (moved < Math.hypot(P.vx, P.vz) * 0.85 && tryLedge(P, fx, fz, inp, sprint, cb)) return;
    if ((inp.jump || !P.grounded) && P.climbCd <= 0 && cb.stamina() > 8 && startClimb(P, fx, fz)) return;
  }
  P.climbCd -= dt;
  // ladders: walk into one to grab it
  if (inp.fwd > 0) {
    const L = ladderNear(P.x, P.z, P.y);
    if (L && fx * -L.nx + fz * -L.nz > 0.35) { P.mode = 'ladder'; P.ladder = L; P.vy = 0; P.slideT = 0; sfx.climb(); return; }
    const T = P.grounded ? ladderTopNear(P.x, P.z, P.y) : null;
    if (T && fx * T.nx + fz * T.nz > 0.35) { P.mode = 'ladder'; P.ladder = T; P.y = T.y1 - 1.05; P.vy = 0; P.slideT = 0; P.downLadder = true; sfx.climb(); return; }
  }
  // grab a zipline cable you jump at
  if (!P.grounded && P.vy < 3) {
    const g = zipNear(P.x, P.y + 2.0, P.z, 0.9);
    if (g) { P.mode = 'zip'; P.zip = g.zip; P.zipS = g.s; P.zipV = Math.max(4, Math.hypot(P.vx, P.vz) * 0.7); sfx.climb(); return; }
  }
  // jump
  if (P.grounded && inp.jump && P.slideT <= 0) {
    P.vy = JUMP_V; P.grounded = false; P.peakY = P.y;
    // a running leap goes further, and further still off a rooftop, so gaps between buildings are clearable
    const hs = Math.hypot(P.vx, P.vz);
    if (sprint && hs > 5) { const k = P.y > 2.5 ? 1.32 : 1.15; P.vx *= k; P.vz *= k; P.vy += P.y > 2.5 ? 1.2 : 0.4; P.longJump = true; }
  }
  if (!P.grounded && P.longJump) { const acc = Math.min(1, dt * 1.2); P.vx = lerp(P.vx, P.vx + mx * 2.5, acc); P.vz = lerp(P.vz, P.vz + mz * 2.5, acc); }
  // vertical
  const prevY = P.y;
  P.vy -= GRAV * dt;
  P.y += P.vy * dt;
  if (P.vy > 0 && !headroom(P.x, P.z, prevY, 1.85)) { P.vy = 0; P.y = prevY; }
  const floor = floorAt(P.x, P.z, Math.max(prevY, P.y));
  if (P.grounded && floor < P.y && P.y - floor < 0.5 && P.vy <= 0) { P.y = floor; } // walk down small steps
  if (P.y <= floor) {
    const impact = -P.vy, drop = P.peakY - floor;
    P.y = floor; P.vy = 0;
    if (!P.grounded) {
      P.landDip = Math.min(1, impact / 16);
      if (drop > 7 && impact > 15) {
        const rolled = inp.crouch;
        const dmg = Math.round((impact - 14) * (rolled ? 1.0 : 3.5));
        if (rolled) { P.rollT = 0.5; sfx.roll(); } else sfx.land(1);
        if (dmg > 0) cb.hurt(dmg, rolled);
      } else if (impact > 6) sfx.land(impact / 16);
    }
    P.grounded = true; P.peakY = P.y; P.airT = 0; P.longJump = false;
  } else {
    if (P.grounded && P.vy <= 0 && P.y - floor > 0.5) P.peakY = P.y; // walked off an edge
    P.grounded = false; P.airT += dt; P.peakY = Math.max(P.peakY, P.y);
  }
}

// ---- wall climbing: hold forward into a wall and jump to scramble up it hand over hand, as long as you
// have the stamina. Ledges, balconies and fire escape landings above you are grabbed on the way.
const CLIMB_V = 3.4;
function startClimb(P, fx, fz) {
  const nx = Math.abs(fx) > Math.abs(fz) ? -Math.sign(fx) : 0, nz = nx ? 0 : -Math.sign(fz); // wall normal, toward us
  const wx = P.x - nx * 0.7, wz = P.z - nz * 0.7;
  const top = stackTop(wx, wz, P.y);
  if (top < P.y + 1.2) return false; // nothing tall enough to need climbing
  P.mode = 'climb'; P.airT = 0; P.climbN = { x: nx, z: nz }; P.vx = P.vz = 0; P.vy = 0; P.slideT = 0;
  return true;
}
function climbStep(dt, P, inp, cb, fx, fz) {
  const N = P.climbN, wx = P.x - N.x * 0.7, wz = P.z - N.z * 0.7;
  P.crouch = Math.max(0, P.crouch - dt * 4);
  const facing = fx * -N.x + fz * -N.z;
  // let go: jump kicks you off the wall (handy in alleys to reach the opposite wall), crouch drops
  if (inp.jumpEdge && P.airT > 0.15 || inp.crouch || facing < 0.2) {
    P.mode = 'move'; P.grounded = false; P.peakY = P.y; P.climbCd = 0.4;
    if (inp.jumpEdge) { P.vy = 6.2; P.vx = N.x * 6; P.vz = N.z * 6; }
    return;
  }
  P.airT += dt;
  const top = stackTop(wx, wz, P.y - 0.2);
  // reached the top: pull yourself over
  if (top < 0 || top - P.y < 1.6) {
    const t = top < 0 ? P.y : top, tx = P.x - N.x * 1.0, tz = P.z - N.z * 1.0;
    if (headroom(tx, tz, t, 1.7) && headroom(P.x, P.z, P.y + 0.1, t - P.y + 1.7)) { P.mode = 'mantle'; P.anim = { t: 0, dur: 0.38, fx: P.x, fy: P.y, fz: P.z, tx, ty: t, tz, peak: t }; P.vy = 0; sfx.climb(); return; }
  }
  // something overhead (a balcony or landing sticking out): grab it and climb onto it
  if (!headroom(P.x, P.z, P.y, 2.0)) {
    for (const c of bucketAt(P.x, P.z)) {
      if (c.water || c.y0 < P.y + 1.4 || c.y0 > P.y + 2.4 || P.x < c.x0 - 0.3 || P.x > c.x1 + 0.3 || P.z < c.z0 - 0.3 || P.z > c.z1 + 0.3) continue;
      const tx = Math.min(Math.max(P.x, c.x0 + 0.35), c.x1 - 0.35), tz = Math.min(Math.max(P.z, c.z0 + 0.35), c.z1 - 0.35);
      if (headroom(tx, tz, c.h, 1.7)) { P.mode = 'mantle'; P.anim = { t: 0, dur: 0.42, fx: P.x, fy: P.y, fz: P.z, tx, ty: c.h, tz, peak: c.h }; P.vy = 0; sfx.climb(); return; }
    }
    P.mode = 'move'; P.grounded = false; P.peakY = P.y; P.climbCd = 0.6; return;
  }
  const up = inp.fwd > 0 ? 1 : inp.fwd < 0 ? -1 : 0;
  if (up > 0) { P.y += CLIMB_V * dt; cb.useStamina(28 * dt); cb.stepSound(dt * 2.5); }
  else if (up < 0) { P.y -= CLIMB_V * 1.6 * dt; }
  else { P.y -= 0.35 * dt; cb.useStamina(12 * dt); }
  P.x += (-N.x * 0.5 + (inp.side ? 0 : 0)) * dt; P.z += -N.z * 0.5 * dt; // hug the wall
  resolveBody(P, 0.4, P.y, 1.8);
  P.vx = P.vz = P.vy = 0;
  const floor = floorAt(P.x, P.z, P.y + 0.1);
  if (P.y <= floor) { P.y = floor; P.mode = 'move'; P.grounded = true; P.climbCd = 0.3; return; }
  if (cb.stamina() <= 0) { P.mode = 'move'; P.grounded = false; P.peakY = P.y; P.climbCd = 1.2; } // arms give out
}
