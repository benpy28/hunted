// Stealth toolkit: ways to slip the net that aren't running.
//  - Hide in a dumpster: climb in, peer out through the gap under the lid. Anyone who watched you go in will
//    come and haul you out; everyone else loses you. Searchers lift lids near where you were last seen, and if
//    you stay in too long you come out smelling of bins (people notice).
//  - Bottles and cans lie about the streets. Pocket a few and throw them: a smash round a corner sends people
//    who have lost sight of you off to look there instead. A good shot to the head bonks someone over.
//  - CCTV cameras over shop doors and cashpoints sweep the pavement. Linger in one's cone looking dodgy (or,
//    once you're a known face, at all) and it reports where you are. Shoot, crowbar or bottle them; the council
//    fixes them overnight, and a power cut kills them.
//  - Pigeons peck about by the benches and bus stops. Run through a flock and it bursts into the air, and
//    anyone hunting nearby looks over to see what spooked them. Walk round them and they don't care.
//  - Pickpocketing: crouch, creep up behind someone who isn't looking and press E. Busy people are easy marks.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, mr, mpick, angDiff, scene, camera, GeoBuf } from './core.js';
import { floorAt, solidAt, losSolid, pointBlocked, randomOpenPoint, cityAt, raycastWorld } from './world.js';
import { hideSpots, lifeSpots, walkIns } from './streets.js';
import { atmSpots } from './shops.js';
import { emitPuff } from './fx.js';
import { comicWord } from './knockfx.js';

export const SK_STATE = { hide: null, junk: [], smellT: 0, hideT: 0, pigeonMsgT: 0, camMsgT: 0, lifted: 0, liftedCash: 0, camsBroken: 0, luredT: 0 };
const stGeo = (fn) => { const b = new GeoBuf(); fn(b); return b.geometry(); };
const stMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const _stM = new THREE.Matrix4(), _stQ = new THREE.Quaternion(), _stE = new THREE.Euler(0, 0, 0, 'YXZ'), _stP = new THREE.Vector3(), _stS = new THREE.Vector3(1, 1, 1);
function stSet(mesh, i, x, y, z, rx, ry, rz = 0, s = 1, sy = s) { _stE.set(rx, ry, rz); _stQ.setFromEuler(_stE); _stP.set(x, y, z); _stS.set(s, sy, s); _stM.compose(_stP, _stQ, _stS); mesh.setMatrixAt(i, _stM); }
const hidden = (mesh, i) => stSet(mesh, i, 0, -80, 0, 0, 0, 0, 0.001);
let stBuilt = false;

// =====================================================================
// Dumpsters
// =====================================================================
// where you stand to climb in: the first open side
function standPoint(S) {
  // the side with the most room in front of it (the yard, not the wall it's backed up against)
  let best = null, bs = 0;
  for (const [ux, uz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const ex = S.x + ux * S.lx, ez = S.z + uz * S.lz, x = ex + ux * 0.75, z = ez + uz * 0.75;
    if (pointBlocked(x, z, 0.25) || solidAt(x, 0.6, z, 0.02)) continue;
    let room = 0; while (room < 6 && !pointBlocked(ex + ux * (room + 1), ez + uz * (room + 1), 0.3)) room += 0.5;
    if (room > bs) { bs = room; best = { x, z, ux, uz }; }
  }
  return bs >= 1.5 ? best : null;
}
export function hideSpotNear(x, y, z, r = 1.0) {
  if (y > 1.2 || y < -0.5) return null;
  let best = null, bd = 1e9;
  for (const S of hideSpots) {
    if (!S.stand) continue;
    const dx = Math.max(0, Math.abs(x - S.x) - S.lx), dz = Math.max(0, Math.abs(z - S.z) - S.lz), d = Math.hypot(dx, dz);
    if (d < r && d < bd) { bd = d; best = S; }
  }
  return best;
}
// the nearest dumpster to a spot (for searchers to check)
function spotAround(x, z, r) {
  let best = null, bd = r;
  for (const S of hideSpots) { if (!S.stand) continue; const d = Math.abs(S.x - x) + Math.abs(S.z - z); if (d < bd && Math.random() < 0.8) { bd = d; best = S; } }
  return best;
}
export function enterHide(S, K) {
  const P = K.player;
  SK_STATE.hide = S; SK_STATE.hideT = 0;
  P.hide = S; P.x = S.stand.x; P.z = S.stand.z; P.vx = P.vz = 0; P.crouch = 0;
  S.lift = 1;
  K.sfx.lid();
  // anyone who watched you climb in knows exactly which bin you're in
  let seen = 0;
  for (const h of K.hunters()) {
    if (h.dead || h.inside) continue;
    const d = Math.hypot(h.x - P.x, h.z - P.z);
    if (d < 30 && h.hasLOS && (h.state === 'chase' || h.sus > 0.35)) { h.checkSpot = S; seen++; if (h.state !== 'chase') h.alert(mr(0.3, 0.8)); }
  }
  K.showMsg(seen ? 'THEY SAW YOU GET IN. NOT GREAT' : 'IN THE BIN. LIE STILL. E TO CLIMB OUT', 2.5);
}
export function leaveHide(K, found = null) {
  const S = SK_STATE.hide; if (!S) return;
  SK_STATE.hide = null; K.player.hide = null; S.lift = 1;
  K.sfx.lid();
  K.player.x = S.stand.x; K.player.z = S.stand.z; K.player.y = Math.max(K.player.y, floorAt(S.stand.x, S.stand.z, 0.5));
  if (SK_STATE.hideT > 40) { SK_STATE.smellT = 70; K.showMsg('YOU SMELL OF BINS. PEOPLE WILL NOTICE', 2.5); }
  for (const h of K.hunters()) if (h.checkSpot === S) h.checkSpot = null;
  if (found) {
    K.say(found, mpick(['GOT YOU!', 'OUT YOU COME', 'FOUND THEM! IN THE BIN!', 'YOU STINK. AND YOU\'RE NICKED']));
    found.alert(); K.shout(found); K.showMsg('THEY HAULED YOU OUT OF THE BIN', 2.5);
    K.hurt(4, found.x, found.z, 4); K.addHeat(3);
  }
}
// a hunter's turn to deal with you being in a bin. Returns true when they've dealt with it.
export function hideHunterThink(h, d, K) {
  const S = SK_STATE.hide;
  if (!S) return false;
  if (h.checkSpot === S) { // they saw you go in: straight over, lid up, out you come
    if (Math.hypot(h.x - S.stand.x, h.z - S.stand.z) < 1.6 || d < 1.4) { leaveHide(K, h); return true; }
    return false;
  }
  return false;
}
// searchers wandering near where you were last seen sometimes go and lift a lid
export function hunterPickPeek(h, lkp) {
  if (Math.random() > 0.3) return false;
  const S = spotAround(lkp.x, lkp.z, 22); if (!S) return false;
  h.wt = { x: S.stand.x, z: S.stand.z }; h.peek = S; return true;
}
export function hunterPeekArrive(h, K) {
  const S = h.peek; h.peek = null;
  if (!S) return;
  S.lift = 0.8; if (Math.abs(S.x - K.player.x) + Math.abs(S.z - K.player.z) < 25) K.sfx.lid();
  h.waitT = 1.2; h.face = Math.atan2(S.x - h.x, S.z - h.z);
  if (SK_STATE.hide === S) { leaveHide(K, h); return; }
  if (Math.random() < 0.35) K.say(h, mpick(['JUST RUBBISH', 'NOTHING. UGH, THE SMELL', 'NOT IN THIS ONE', 'EMPTY. WELL, NOT EMPTY. BUT NO ONE']));
}

// =====================================================================
// Bottles and cans
// =====================================================================
const JUNK_SHAPES = {
  bottle: stGeo((b) => { b.cyl(0, 0, 0.06, 0.06, -0.12, 0.06, 0x2f7a3a, 7); b.cyl(0, 0, 0.06, 0.025, 0.06, 0.12, 0x2f7a3a, 7); b.cyl(0, 0, 0.025, 0.025, 0.12, 0.18, 0x3a8a4a, 6); }),
  can: stGeo((b) => { b.cyl(0, 0, 0.045, 0.045, -0.07, 0.07, 0xc8c8cc, 8); b.cyl(0, 0, 0.046, 0.046, -0.03, 0.04, 0xc0302a, 8, false); }),
};
export const junk = []; // {kind, x, y, z, ry, i, taken, mesh}
const junkMeshes = {};
const flying = []; // thrown {kind, x,y,z, vx,vy,vz, spin, mesh}
const flyMeshes = { bottle: new THREE.Mesh(JUNK_SHAPES.bottle, stMat), can: new THREE.Mesh(JUNK_SHAPES.can, stMat) };
const flyPool = { bottle: [], can: [] };
function junkDraw(J) {
  const M = junkMeshes[J.kind];
  if (J.taken) hidden(M, J.i); else stSet(M, J.i, J.x, J.y, J.z, Math.PI / 2, J.ry);
  M.instanceMatrix.needsUpdate = true;
}
function placeJunk() {
  const spots = [];
  const add = (x, z, kind) => { const p = randomOpenPoint(x, z, 0.3, 1.6, 6); if (p) spots.push({ kind: kind || (Math.random() < 0.5 ? 'bottle' : 'can'), x: p.x, z: p.z }); };
  lifeSpots.forEach((L, i) => { if (i % 2 === 0) add(L.x, L.z); });
  hideSpots.forEach((S) => { if (S.stand) { const x = S.stand.x + S.stand.ux * 1.5, z = S.stand.z + S.stand.uz * 1.5; add(x, z); if (Math.random() < 0.6) add(x, z, 'bottle'); } });
  walkIns.forEach((W, i) => { if (i % 3 === 0) add(W.x, W.z); });
  for (const k of ['bottle', 'can']) {
    const list = spots.filter((s) => s.kind === k);
    const M = new THREE.InstancedMesh(JUNK_SHAPES[k], stMat, Math.max(1, list.length + 40)); M.frustumCulled = false; scene.add(M); junkMeshes[k] = M;
    for (let i = 0; i < M.count; i++) hidden(M, i);
    list.forEach((s, i) => { const J = { kind: k, x: s.x, z: s.z, ox: s.x, oz: s.z, y: floorAt(s.x, s.z, 0.5) + 0.06, ry: mr(0, 6.28), i, taken: false }; junk.push(J); junkDraw(J); });
    M.userData.next = list.length;
  }
}
// what E would do right here: pick a pocket, pick something up or climb into a bin (whichever is closest)
export function stealthUseTarget(K) {
  const P = K.player;
  if (P.car || P.hide || P.mode !== 'move' || P.bike) return null;
  const m = pickMark(K); if (m) return { kind: 'mark', obj: m };
  const J = junkNear(P.x, P.y, P.z), S = K.G.super ? null : hideSpotNear(P.x, P.y, P.z);
  if (J && S) { const dS = Math.hypot(Math.max(0, Math.abs(P.x - S.x) - S.lx), Math.max(0, Math.abs(P.z - S.z) - S.lz)); return Math.hypot(J.x - P.x, J.z - P.z) < dS ? { kind: 'junk', obj: J } : { kind: 'bin', obj: S }; }
  return J ? { kind: 'junk', obj: J } : S ? { kind: 'bin', obj: S } : null;
}
export function junkNear(x, y, z, r = 1.1) {
  let best = null, bd = r;
  for (const J of junk) { if (J.taken || Math.abs(J.y - y) > 1.2) continue; const d = Math.hypot(J.x - x, J.z - z); if (d < bd) { bd = d; best = J; } }
  return best;
}
export function pickJunk(J, K) {
  if (SK_STATE.junk.length >= 4) { K.showMsg('YOUR POCKETS ARE FULL OF RUBBISH ALREADY', 1.6); return false; }
  J.taken = true; junkDraw(J); SK_STATE.junk.push(J.kind); K.sfx.pickup();
  K.showMsg(`${J.kind === 'bottle' ? 'BOTTLE' : 'CAN'} POCKETED. ${K.isTouch() ? 'TAP THROW' : 'PRESS T'} TO THROW IT`, 2);
  return true;
}
// a thing to throw: off it goes in the direction you're looking
export function throwJunk(K) {
  const P = K.player;
  if (P.car || !P.alive || SK_STATE.hide) return false;
  if (!SK_STATE.junk.length) { K.showMsg('NOTHING TO THROW. PICK UP A BOTTLE OR A CAN', 1.6); return false; }
  const kind = SK_STATE.junk.pop();
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  const m = flyPool[kind].pop() || flyMeshes[kind].clone(); scene.add(m); m.visible = true;
  const sp = 17;
  flying.push({ kind, x: camera.position.x + d.x * 0.5, y: camera.position.y - 0.1 + d.y * 0.5, z: camera.position.z + d.z * 0.5, vx: d.x * sp + P.vx * 0.5, vy: d.y * sp + 3.2, vz: d.z * sp + P.vz * 0.5, spin: 0, m, t: 0, seen: false });
  K.sfx.whoosh(); P.shoveAnim = 1;
  return true;
}
// a noise somewhere: people who aren't looking right at you go to see what it was
export function noiseAt(x, z, r, K, what = 'smash') {
  let n = 0;
  for (const h of K.hunters()) {
    if (h.dead || h.guard || h.contract || h.held) continue;
    const d = Math.hypot(h.x - x, h.z - z); if (d > r) continue;
    if (h.state === 'chase') {
      if (h.hasLOS || h.lastSeen < 0.8 || h.checkSpot) continue; // they're still looking at you
      h.state = 'search'; h.alertT = -1; h.huntT = 14; h.sus = 0.5;
    } else { h.huntT = Math.max(h.huntT, 10); K.interrupt(h); }
    h.wt = randomOpenPoint(x, z, 0, 2.5, 6) || { x, z }; h.waitT = 0; h.lured = 6; n++;
    if (n <= 2 && Math.random() < 0.7) K.say(h, mpick(what === 'smash' ? ['WHAT WAS THAT?', 'OVER THERE!', 'WHO\'S THAT?', 'HELLO?'] : ['WHAT\'S THAT?', 'HUH?']));
  }
  if (n && K.G.lastSeenT > 1.5) { K.G.lkp.x = x; K.G.lkp.z = z; } // and the search moves over there too
  if (n) SK_STATE.luredT = 4;
  return n;
}
function landJunk(F, K, hitPerson) {
  if (F.kind === 'bottle') {
    K.sfx.smash();
    for (let k = 0; k < 4; k++) emitPuff(F.x, F.y + 0.05, F.z, { life: 0.4, vx: mr(-1.5, 1.5), vy: mr(0.5, 2), vz: mr(-1.5, 1.5), size0: 0.08, size1: 0.25, alpha: 0.9, color: k % 2 ? 0x7ad08a : 0xe8fff0 });
  } else {
    K.sfx.clank();
    // the can lands and can be picked up again
    const M = junkMeshes.can, J = junk.find((j) => j.kind === 'can' && j.taken && j.spare) || (M.userData.next < M.count ? { kind: 'can', i: M.userData.next++, spare: true, ox: F.x, oz: F.z } : null);
    if (J) { if (!junk.includes(J)) junk.push(J); J.x = F.x; J.z = F.z; J.y = floorAt(F.x, F.z, F.y + 0.3) + 0.05; J.ry = mr(0, 6.28); J.taken = false; junkDraw(J); }
  }
  if (!F.seen && !hitPerson) noiseAt(F.x, F.z, F.kind === 'bottle' ? 24 : 16, K);
  F.m.visible = false; scene.remove(F.m); flyPool[F.kind].push(F.m);
}
function updateFlying(dt, K) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const F = flying[i]; F.t += dt;
    F.vy -= 18 * dt; F.spin += dt * 14;
    const ox = F.x, oy = F.y, oz = F.z;
    F.x += F.vx * dt; F.y += F.vy * dt; F.z += F.vz * dt;
    F.m.position.set(F.x, F.y, F.z); F.m.rotation.set(F.spin, Math.atan2(F.vx, F.vz), 0);
    let done = false, hitP = false;
    // a person: head shots bonk them over
    for (const h of K.hunters()) {
      if (h.dead || F.t < 0.06) continue;
      const s = h.T.scale, hy = h.y + 1.65 * s, dx = h.x - F.x, dz = h.z - F.z;
      if (Math.abs(dx) > 0.8 || Math.abs(dz) > 0.8 || F.y < h.y || F.y > hy + 0.3) continue;
      if (Math.hypot(dx, dz) > 0.4 * s) continue;
      const head = Math.abs(F.y - hy) < 0.25;
      K.bonk(h, head, F.vx, F.vz); done = true; hitP = true; break;
    }
    // a camera
    if (!done) for (const C of cams) { if (!C.broken && Math.abs(C.x - F.x) < 0.4 && Math.abs(C.z - F.z) < 0.4 && Math.abs(C.y - F.y) < 0.4) { breakCam(C, K); done = true; break; } }
    if (!done) {
      const fl = floorAt(F.x, F.z, oy + 0.1);
      if (F.y <= fl + 0.04) { F.y = fl + 0.04; done = true; }
      else if (solidAt(F.x, F.y, F.z, 0.01)) { F.x = ox; F.y = oy; F.z = oz; done = true; }
      else if (F.t > 6) done = true;
    }
    if (done) { flying.splice(i, 1); landJunk(F, K, hitP); }
  }
}

// =====================================================================
// CCTV
// =====================================================================
export const cams = []; // {x,y,z, yaw0, yaw, sweep, period, phase, city, seeT, alarmT, cool, broken, i}
const CAM_RANGE = 24, CAM_HALF = 0.42;
let camBody = null, camLed = null;
const camLedMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const coneGeo = (() => { const g = new THREE.ConeGeometry(Math.tan(CAM_HALF) * CAM_RANGE, CAM_RANGE, 18, 1, true); g.translate(0, -CAM_RANGE / 2, 0); g.rotateX(-Math.PI / 2); return g; })();
const cones = [];
function placeCams() {
  const take = (x, z, nx, nz, city, off) => {
    const px = -nz, pz = nx;
    const cx = x + nx * 0.3 + px * off, cz = z + nz * 0.3 + pz * off;
    if (cams.some((c) => Math.abs(c.x - cx) < 16 && Math.abs(c.z - cz) < 16)) return;
    const base = Math.atan2(nx, nz);
    cams.push({ x: cx, y: 3.7, z: cz, yaw0: base, yaw: base, pitch: -0.32, sweep: mr(0.6, 1.0), period: mr(7, 11), phase: mr(0, 6.28), city, seeT: 0, alarmT: 0, cool: 0, broken: false, i: cams.length });
  };
  for (const W of walkIns) {
    if (W.home || !W.side || (W.city !== 'PORT HALDEN' && W.city !== 'SALTMARSH DOCKS')) continue;
    if ((W.x * 7 + W.z * 3) % 5 > 2.2) continue; // about half the shops
    const nx = W.side[1] === 'x' ? (W.side[0] === 'p' ? 1 : -1) : 0, nz = W.side[1] === 'z' ? (W.side[0] === 'p' ? 1 : -1) : 0;
    take(W.x, W.z, nx, nz, W.city, 1.6);
  }
  for (const A of atmSpots) { const c = cityAt(A.x, A.z, 10); take(A.x - A.nx * 1.1, A.z - A.nz * 1.1, A.nx, A.nz, c ? c.name : null, 0.9); }
  camBody = new THREE.InstancedMesh(stGeo((b) => { b.box(-0.06, 0.06, -0.06, 0.25, -0.1, 0.05, 0x3a3a40); b.box(-0.13, 0.13, -0.11, 0.11, 0.0, 0.42, 0xe0e0dc); b.box(-0.1, 0.1, -0.08, 0.08, 0.42, 0.47, 0x16161a); b.box(-0.16, 0.16, 0.11, 0.14, -0.02, 0.5, 0xd0d0cc); }), stMat, Math.max(1, cams.length));
  camLed = new THREE.InstancedMesh(stGeo((b) => b.box(-0.025, 0.025, 0.06, 0.1, 0.4, 0.44, 0xffffff)), camLedMat, Math.max(1, cams.length));
  camBody.frustumCulled = camLed.frustumCulled = false; scene.add(camBody, camLed);
  for (const C of cams) { drawCam(C); camLed.setColorAt(C.i, new THREE.Color(0x40ff60)); }
  if (camLed.instanceColor) camLed.instanceColor.needsUpdate = true;
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.visible = false; m.renderOrder = 3; scene.add(m); cones.push(m);
  }
}
function drawCam(C) {
  const pitch = C.broken ? -1.1 : C.pitch, yaw = C.yaw, roll = C.broken ? 0.5 : 0;
  // the model points along +z; YXZ euler: yaw then pitch (negative pitch looks down)
  stSet(camBody, C.i, C.x, C.y, C.z, -pitch, yaw, roll, 1.7);
  stSet(camLed, C.i, C.x, C.y, C.z, -pitch, yaw, roll, 1.7);
  camBody.instanceMatrix.needsUpdate = camLed.instanceMatrix.needsUpdate = true;
}
const _ledC = new THREE.Color();
function camLedColor(C, hex) { if (C.led === hex) return; C.led = hex; camLed.setColorAt(C.i, _ledC.set(hex)); camLed.instanceColor.needsUpdate = true; }
export function breakCam(C, K) {
  if (C.broken) return;
  C.broken = true; C.alarmT = 0; C.seeT = 0; drawCam(C); camLedColor(C, 0x111111);
  K.sfx.clank(); SK_STATE.camsBroken++;
  for (let k = 0; k < 5; k++) emitPuff(C.x, C.y, C.z, { life: 0.35, vx: mr(-2, 2), vy: mr(0, 2.5), vz: mr(-2, 2), size0: 0.06, size1: 0.18, alpha: 1, color: k % 2 ? 0xffe060 : 0xffffff });
  comicWord('KRZZT', C.x, C.y + 0.4, C.z);
  K.addHeat(1); K.bumpLocal(0.03);
}
// bullets: the first camera the shot passes close to (before it hits a wall)
export function rayCams(o, d, maxT, K) {
  let best = null, bt = maxT;
  for (const C of cams) {
    if (C.broken) continue;
    const rx = C.x - o.x, ry = C.y - o.y, rz = C.z - o.z, t = rx * d.x + ry * d.y + rz * d.z;
    if (t < 0 || t > bt) continue;
    const ex = rx - d.x * t, ey = ry - d.y * t, ez = rz - d.z * t;
    if (ex * ex + ey * ey + ez * ez < 0.3 * 0.3) { bt = t; best = C; }
  }
  if (!best) return null;
  const w = raycastWorld(o, d, bt); if (w && w.t < bt - 0.3) return null;
  breakCam(best, K); return best;
}
export function meleeCams(x, y, z, fx, fz, K) {
  for (const C of cams) {
    if (C.broken) continue;
    const dx = C.x - x, dz = C.z - z, dd = Math.hypot(dx, dz);
    if (dd < 2.4 && C.y - y < 4.3 && C.y - y > 0.5 && (dx * fx + dz * fz) / (dd || 1) > 0.2) { breakCam(C, K); return C; }
  }
  return null;
}
function updateCams(dt, K) {
  const P = K.player, G = K.G, tp = K.targetPos();
  const eyeY = P.car ? 1.2 : P.y + 1.55;
  const near = [];
  const blackout = K.blackoutCity();
  for (const C of cams) {
    const dx = tp.x - C.x, dz = tp.z - C.z, ad = Math.abs(dx) + Math.abs(dz);
    const off = C.broken || (blackout && blackout === C.city);
    if (ad > 160) continue;
    if (off) { camLedColor(C, 0x111111); continue; }
    C.cool = Math.max(0, C.cool - dt); C.alarmT = Math.max(0, C.alarmT - dt);
    const dist = Math.hypot(dx, dz);
    // sweep (or, while alarmed, follow you)
    if (C.alarmT > 0 && dist < CAM_RANGE + 8) C.yaw += angDiff(C.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 3);
    else C.yaw = C.yaw0 + Math.sin(K.G.elapsed * Math.PI * 2 / C.period + C.phase) * C.sweep;
    if (ad < 70) drawCam(C);
    // can it see you?
    let see = false;
    if (dist < CAM_RANGE && !P.hide && !K.G.inSafe && P.alive && !K.G.super) {
      const ang = Math.abs(angDiff(C.yaw, Math.atan2(dx, dz)));
      const vang = Math.atan2(eyeY - C.y, dist);
      if (ang < CAM_HALF && vang < 0.4 && vang > -1.2 && losSolid(C.x, C.y - 0.2, C.z, tp.x, eyeY, tp.z)) see = true;
    }
    if (see) {
      const face = G.level >= 2 ? 0.55 * (1 - 0.75 * P.disg) : 0;
      const rate = Math.max(0, K.G.conspic - 0.2) * 1.6 + face + (SK_STATE.smellT > 0 ? 0 : 0);
      C.seeT += rate * dt;
      if (C.seeT >= 1 && C.cool <= 0) {
        C.seeT = 0; C.cool = 25; C.alarmT = 10;
        K.reportSighting(tp.x, tp.z); K.sendLooking(tp.x, tp.z, 45, 18); K.addHeat(5); K.bumpLocal(0.04);
        K.sfx.camBeep(); SK_STATE.camAlarms = (SK_STATE.camAlarms || 0) + 1;
        if (SK_STATE.camMsgT <= 0) { SK_STATE.camMsgT = 8; K.showMsg('A CCTV CAMERA CLOCKED YOU. THEY KNOW WHERE YOU ARE', 3); }
      }
    } else C.seeT = Math.max(0, C.seeT - dt * 0.5);
    camLedColor(C, C.alarmT > 0 ? (Math.sin(K.G.elapsed * 14) > 0 ? 0xff2020 : 0x400000) : C.seeT > 0.05 ? 0xffa020 : 0x40ff60);
    if (dist < 45) near.push({ C, dist });
  }
  SK_STATE.camMsgT -= dt;
  near.sort((a, b) => a.dist - b.dist);
  cones.forEach((m, k) => {
    const n = near[k]; m.visible = !!n;
    if (!n) return;
    const C = n.C; m.position.set(C.x, C.y, C.z); m.rotation.set(0, 0, 0, 'YXZ'); m.rotation.order = 'YXZ'; m.rotation.y = C.yaw; m.rotation.x = -C.pitch;
    m.material.color.setHex(C.alarmT > 0 ? 0xff3030 : C.seeT > 0.05 ? 0xffa030 : 0xfff0a0);
    m.material.opacity = (C.alarmT > 0 ? 0.11 : 0.06) * clamp(1.4 - n.dist / 45, 0, 1);
  });
}

// =====================================================================
// Pigeons
// =====================================================================
const flocks = []; // {x,z, birds:[{x,y,z,vx,vy,vz,hop,face}], state:'ground'|'fly', t, i0}
let pigeonBody = null, pigeonWing = null, birdCount = 0;
function placePigeons() {
  const spots = lifeSpots.filter((L, i) => (L.kind === 'bench' && i % 4 === 0) || (L.kind === 'cart' && i % 2 === 0));
  for (const L of spots) {
    if (flocks.some((f) => Math.abs(f.x - L.x) < 34 && Math.abs(f.z - L.z) < 34)) continue;
    const n = 5 + Math.floor(Math.random() * 6), F = { x: L.x, z: L.z, hx: L.x, hz: L.z, birds: [], state: 'ground', t: 0, i0: birdCount, scareCd: 0 };
    for (let k = 0; k < n; k++) { const p = randomOpenPoint(L.x, L.z, 0.6, 3, 5) || { x: L.x, z: L.z }; F.birds.push({ x: p.x, z: p.z, y: floorAt(p.x, p.z, 0.5), vx: 0, vy: 0, vz: 0, face: mr(0, 6.28), hop: mr(0, 2), peck: 0, flap: mr(0, 6) }); }
    birdCount += n; flocks.push(F);
  }
  const bodyG = stGeo((b) => { b.box(-0.06, 0.06, 0.05, 0.15, -0.12, 0.1, 0x8a8a96); b.box(-0.045, 0.045, 0.13, 0.22, 0.07, 0.15, 0x6a6a7a); b.box(-0.015, 0.015, 0.15, 0.17, 0.15, 0.19, 0xd8a040); b.box(-0.05, 0.05, 0.07, 0.11, -0.2, -0.1, 0x5a5a66); b.box(-0.01, 0.01, 0, 0.06, -0.02, 0.02, 0xc06050); });
  const wingG = stGeo((b) => { b.box(0.05, 0.24, 0.12, 0.14, -0.08, 0.06, 0x7a7a88); b.box(-0.24, -0.05, 0.12, 0.14, -0.08, 0.06, 0x7a7a88); });
  pigeonBody = new THREE.InstancedMesh(bodyG, stMat, Math.max(1, birdCount)); pigeonWing = new THREE.InstancedMesh(wingG, stMat, Math.max(1, birdCount));
  pigeonBody.frustumCulled = pigeonWing.frustumCulled = false; scene.add(pigeonBody, pigeonWing);
  for (const F of flocks) drawFlock(F);
}
function drawFlock(F) {
  F.birds.forEach((B, k) => {
    const i = F.i0 + k, air = F.state === 'fly' || B.y - floorAt(B.x, B.z, B.y + 0.2) > 0.1;
    stSet(pigeonBody, i, B.x, B.y, B.z, air ? -0.2 : B.peck, B.face);
    const fl = air ? Math.cos(B.flap) : 0.25;
    stSet(pigeonWing, i, B.x, B.y + (air ? 0.02 : 0), B.z, air ? -0.2 : B.peck, B.face, 0, 1, fl);
  });
  pigeonBody.instanceMatrix.needsUpdate = pigeonWing.instanceMatrix.needsUpdate = true;
}
export function scareFlock(F, K, byPlayer) {
  if (F.state === 'fly') return;
  F.state = 'fly'; F.t = 0; F.scareCd = 20;
  const tp = K.targetPos();
  for (const B of F.birds) { const a = Math.atan2(B.x - tp.x, B.z - tp.z) + mr(-0.9, 0.9), s = mr(3, 6); B.vx = Math.sin(a) * s; B.vz = Math.cos(a) * s; B.vy = mr(4, 7); B.face = a; }
  // land somewhere else later
  const p = randomOpenPoint(F.hx, F.hz, 0, 12, 10) || { x: F.hx, z: F.hz }; F.nx = p.x; F.nz = p.z;
  if (Math.abs(F.x - tp.x) + Math.abs(F.z - tp.z) < 60) K.sfx.flap();
  if (!byPlayer || K.G.super) return;
  // the commotion draws eyes, if anyone's hunting round here
  let n = 0;
  for (const h of K.hunters()) {
    if (h.dead || h.state === 'chase' || h.guard) continue;
    const d = Math.hypot(h.x - F.x, h.z - F.z); if (d > 32) continue;
    if (h.huntT > 0 || K.G.level >= 1 || h.sus > 0.2) { h.sus = Math.max(h.sus, Math.min(0.85, h.sus + 0.35)); h.huntT = Math.max(h.huntT, 8); h.wt = randomOpenPoint(F.x, F.z, 0, 4, 5) || { x: F.x, z: F.z }; h.waitT = 0; K.interrupt(h); n++; }
  }
  if (n && SK_STATE.pigeonMsgT <= 0) { SK_STATE.pigeonMsgT = 25; K.showMsg('THE PIGEONS GAVE YOU AWAY', 2); }
}
function updatePigeons(dt, K) {
  const P = K.player, tp = K.targetPos(), sp = P.car ? Math.abs(P.car.speed) : Math.hypot(P.vx, P.vz);
  SK_STATE.pigeonMsgT -= dt;
  const shot = K.G.shotT < 0.1;
  for (const F of flocks) {
    const ad = Math.abs(F.x - tp.x) + Math.abs(F.z - tp.z);
    if (ad > 110) continue;
    F.scareCd = Math.max(0, F.scareCd - dt);
    if (F.state === 'ground') {
      const d = Math.hypot(F.x - tp.x, F.z - tp.z);
      const scared = (P.car && d < 5 && sp > 3) || (!P.car && !P.hide && Math.abs(P.y - floorAt(F.x, F.z, 0.5)) < 2 && (d < 1.8 || (d < 4.5 && sp > 6.5))) || (shot && d < 35);
      if (scared) { scareFlock(F, K, !shot || d < 4.5); }
      else for (const h of K.hunters()) if (!h.dead && h.state === 'chase' && Math.abs(h.x - F.x) < 2.5 && Math.abs(h.z - F.z) < 2.5) { scareFlock(F, K, false); break; }
      for (const B of F.birds) {
        B.hop -= dt;
        if (B.hop <= 0) {
          B.hop = mr(0.6, 2.5);
          if (Math.random() < 0.6) { const a = mr(0, 6.28), r = 0.25; let nx = B.x + Math.sin(a) * r, nz = B.z + Math.cos(a) * r; if (Math.hypot(nx - F.x, nz - F.z) > 3.2) { nx = B.x + (F.x - B.x) * 0.2; nz = B.z + (F.z - B.z) * 0.2; } if (!pointBlocked(nx, nz, 0.05)) { B.face = Math.atan2(nx - B.x, nz - B.z); B.x = nx; B.z = nz; } }
          else B.peck = 0.6;
        }
        B.peck = Math.max(0, B.peck - dt * 2.5);
        B.y = floorAt(B.x, B.z, B.y + 0.3);
      }
    } else {
      F.t += dt;
      for (const B of F.birds) {
        B.flap += dt * 26;
        if (F.t < 3.5) { B.vy -= 3 * dt; B.x += B.vx * dt; B.y += Math.max(0.3, B.vy) * dt; B.z += B.vz * dt; }
        else { // glide down to the new spot
          const tx = F.nx + Math.sin(B.face * 3) * 1.5, tz = F.nz + Math.cos(B.face * 3) * 1.5, ty = floorAt(tx, tz, 2), k = Math.min(1, dt * 0.9);
          B.face = Math.atan2(tx - B.x, tz - B.z); B.x = lerp(B.x, tx, k); B.z = lerp(B.z, tz, k); B.y = lerp(B.y, ty, k);
        }
      }
      if (F.t > 9) { F.state = 'ground'; F.x = F.nx; F.z = F.nz; for (const B of F.birds) { B.y = floorAt(B.x, B.z, B.y + 0.5); B.hop = mr(0, 1); } }
    }
    if (ad < 80) drawFlock(F);
  }
}

// =====================================================================
// Pickpocketing
// =====================================================================
export function pickMark(K) {
  const P = K.player;
  if (P.car || P.bike || P.hide || K.G.super || P.mode !== 'move' || !(P.crouch > 0.5 || K.input.crouch)) return null;
  let best = null, bd = 1.5;
  for (const h of K.hunters()) {
    if (h.dead || h.state === 'chase' || h.picked || h.guard || h.held || h.bike || h.cowerT > 0 || h.panicT > 0 || Math.abs(h.y - P.y) > 0.8) continue;
    const dx = P.x - h.x, dz = P.z - h.z, d = Math.hypot(dx, dz); if (d > bd) continue;
    const ahead = (Math.sin(h.face) * dx + Math.cos(h.face) * dz) / (d || 1);
    if (ahead > -0.15) continue; // you have to be behind them
    bd = d; best = h;
  }
  return best;
}
export function pickPocket(h, K) {
  h.picked = true;
  const busy = h.act ? 0.15 : 0, odds = clamp(0.62 + busy - h.sus * 0.6 - K.localSus() * 0.5 - (SK_STATE.smellT > 0 ? 0.25 : 0), 0.1, 0.9);
  if (Math.random() < odds) {
    const fat = Math.random() < 0.08, amt = fat ? Math.floor(mr(35, 60)) : Math.floor(mr(3, 19));
    K.addCash(amt); K.sfx.cash(); SK_STATE.lifted++; SK_STATE.liftedCash += amt;
    K.showMsg(fat ? `FAT WALLET! $${amt}` : `LIFTED $${amt}. THEY DIDN'T NOTICE`, 1.8);
    if (Math.random() < 0.3) setTimeout(() => { if (!h.dead) { K.say(h, mpick(['MY WALLET!', 'WHERE\'S MY WALLET?', 'I\'VE BEEN ROBBED!'])); K.bumpLocal(0.03); } }, mr(4000, 9000));
    return true;
  }
  h.face = Math.atan2(K.player.x - h.x, K.player.z - h.z);
  K.say(h, mpick(['THIEF!', 'OI! HANDS OFF!', 'GET YOUR HAND OUT OF MY POCKET!', 'PICKPOCKET!']));
  K.interrupt(h); h.alert(0.2); K.shout(h); K.addHeat(4); K.bumpLocal(0.08); K.sfx.scream();
  K.showMsg('CAUGHT WITH YOUR HAND IN THEIR POCKET', 2);
  return false;
}

// =====================================================================
export function buildStealth() {
  if (stBuilt) return; stBuilt = true;
  for (const S of hideSpots) S.stand = standPoint(S);
  placeJunk(); placeCams(); placePigeons();
}
export function resetStealth(K) {
  SK_STATE.hide = null; SK_STATE.junk.length = 0; SK_STATE.smellT = 0; SK_STATE.hideT = 0; SK_STATE.lifted = 0; SK_STATE.liftedCash = 0; SK_STATE.camsBroken = 0; SK_STATE.camAlarms = 0;
  if (K) K.player.hide = null;
  for (const F of flying) { scene.remove(F.m); flyPool[F.kind].push(F.m); } flying.length = 0;
  stealthNewDay();
}
// overnight: the council fixes the cameras and the streets fill up with rubbish again
export function stealthNewDay() {
  for (const C of cams) if (C.broken) { C.broken = false; C.led = null; if (camBody) drawCam(C); }
  for (const J of junk) if (J.taken && !J.spare) { J.taken = false; J.x = J.ox; J.z = J.oz; junkDraw(J); }
}
export function updateStealth(dt, K) {
  const P = K.player;
  if (SK_STATE.hide) {
    SK_STATE.hideT += dt;
    if (!P.alive || P.car) leaveHide(K);
  }
  for (const S of hideSpots) if (S.lift > 0) S.lift = Math.max(0, S.lift - dt * 1.5);
  if (SK_STATE.smellT > 0) {
    SK_STATE.smellT -= dt;
    if (Math.random() < dt * 3 && !P.car) emitPuff(P.x + mr(-0.5, 0.5), P.y + mr(0.3, 1.4), P.z + mr(-0.5, 0.5), { life: 1.2, vy: 0.4, size0: 0.15, size1: 0.6, alpha: 0.25, color: 0x9ac850 });
  }
  SK_STATE.luredT = Math.max(0, SK_STATE.luredT - dt);
  updateFlying(dt, K);
  updateCams(dt, K);
  updatePigeons(dt, K);
}
// how much the stealth bits make you stand out (the smell, mostly)
export function stealthConspic() { return SK_STATE.smellT > 0 ? 0.3 : 0; }
export function stealthDebug() {
  return { ...SK_STATE, hideSpots: hideSpots.filter((S) => S.stand).length, hideAll: hideSpots.length, junk: junk.filter((J) => !J.taken).length, pocket: SK_STATE.junk.length, cams: cams.length, camsLive: cams.filter((C) => !C.broken).length, flocks: flocks.length, birds: birdCount, flying: flying.length, hide: !!SK_STATE.hide };
}
export { flocks };
