// SWAT: hole up in a building once they know you're in there and, two minutes later, an armoured van
// turns up with a squad in riot gear. Shields stop everything from the front, rifles fire in bursts,
// and pepper-smoke canisters through the door mean you can't just sit in a corner shooting the doorway.
// Knockdowns stay cartoony like everyone else's (they go through the same Hunter.die / knockFX path).
import * as THREE from '../vendor/three.module.min.js';
import { scene } from './core.js';
import { emitPuff } from './fx.js';
import { zoneAt } from './interiors.js';
import { safeAt } from './safehouses.js';
import { randomOpenPoint, navCutOff, navTarget, los, pointBlocked } from './world.js';

export const SWAT_DELAY = 120; // seconds you can stay holed up once they know you're there
export const SWT = {
  phase: 'none', // none | siege (countdown) | deployed
  t: 0, B: null, outT: 0, coolT: 0, squad: [], van: null, gas: null, gasCd: 0, tinkMsg: false, deployT: 0, toSpawn: 0, lostT: 0,
};
const SWAT_LINES = ['ARMED POLICE!', 'COME OUT WITH YOUR HANDS UP!', 'SHIELDS UP!', 'MOVE MOVE MOVE!', 'HOLD THE LINE!', 'STAY DOWN!', 'CONTACT FRONT!', 'GAS GOING IN!'];
const COUGH = ['*COUGH* *COUGH*', 'EYES! MY EYES!', 'PEPPER! SO MUCH PEPPER!', 'CAN\'T BREATHE IN HERE!', '*SNEEZE*'];

// ---------------------------------------------------------------------------------------------
// gear
const shieldMat = new THREE.MeshLambertMaterial({ color: 0x9fb6c8, transparent: true, opacity: 0.55, depthWrite: false });
const shieldRimMat = new THREE.MeshLambertMaterial({ color: 0x1a1d24 });
const rifleMat = new THREE.MeshLambertMaterial({ color: 0x15171c });
const swatGeo = { shield: new THREE.BoxGeometry(0.62, 1.05, 0.05), rim: new THREE.BoxGeometry(0.66, 0.06, 0.07), rifle: new THREE.BoxGeometry(0.07, 0.1, 0.72), mag: new THREE.BoxGeometry(0.05, 0.16, 0.08), visor: new THREE.BoxGeometry(0.4, 0.1, 0.06) };
const visorMat = new THREE.MeshLambertMaterial({ color: 0x223040, emissive: 0x0a1018 });
export function kitOutSwat(h) {
  const p = h.p;
  const sh = new THREE.Group();
  sh.add(new THREE.Mesh(swatGeo.shield, shieldMat));
  for (const y of [-0.52, 0.52]) { const r = new THREE.Mesh(swatGeo.rim, shieldRimMat); r.position.y = y; sh.add(r); }
  sh.position.set(-0.1, 1.05, 0.42); p.group.add(sh); h.shield = sh; // carried out front, so it shows which way they're covering
  const rf = new THREE.Mesh(swatGeo.rifle, rifleMat); rf.position.set(0, -0.62, 0.28); p.armR.add(rf);
  const mg = new THREE.Mesh(swatGeo.mag, rifleMat); mg.position.set(0, -0.72, 0.22); p.armR.add(mg);
  const vz = new THREE.Mesh(swatGeo.visor, visorMat); vz.position.set(0, 0.06, 0.22); p.head.add(vz);
}

// the van: dark blue box on wheels with a light bar that flashes red and blue
const vanMat = new THREE.MeshLambertMaterial({ color: 0x1b2a44 }), vanDark = new THREE.MeshLambertMaterial({ color: 0x111317 });
const vanRed = new THREE.MeshBasicMaterial({ color: 0xff2a2a }), vanBlue = new THREE.MeshBasicMaterial({ color: 0x2a6aff }), vanGlass = new THREE.MeshLambertMaterial({ color: 0x223040 });
function buildVan() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.1, 5.4), vanMat); body.position.y = 1.45; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.1), vanGlass); cab.position.set(0, 1.9, 2.71); g.add(cab);
  const bump = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.3), vanDark); bump.position.set(0, 0.55, 2.75); g.add(bump);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.25, 4.6), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 })); stripe.position.y = 1.2; g.add(stripe);
  for (const [x, z] of [[-1, 1.7], [1, 1.7], [-1, -1.7], [1, -1.7]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10), vanDark); w.rotation.z = Math.PI / 2; w.position.set(x * 1.05, 0.45, z); g.add(w); }
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), vanRed); red.position.set(-0.45, 2.6, 1.6); g.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), vanBlue); blue.position.set(0.45, 2.6, 1.6); g.add(blue);
  g.userData = { red, blue };
  scene.add(g);
  return g;
}

// ---------------------------------------------------------------------------------------------
// where are you holed up? a shop, warehouse, venue or a safehouse
function swBuildingAt(P) {
  if (P.car || !P.alive) return null;
  const Z = zoneAt(P.x, P.y, P.z); if (Z) return { x0: Z.x0, x1: Z.x1, z0: Z.z0, z1: Z.z1, name: Z.name };
  const S = safeAt(P.x, P.y, P.z); if (S) return { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, name: S.name };
  return null;
}
const swIn = (B, x, z, pad = 0) => !!B && x > B.x0 - pad && x < B.x1 + pad && z > B.z0 - pad && z < B.z1 + pad;
const swSame = (a, b) => !!a && !!b && Math.abs(a.x0 - b.x0) < 0.5 && Math.abs(a.z0 - b.z0) < 0.5;
const swCx = (B) => (B.x0 + B.x1) / 2, swCz = (B) => (B.z0 + B.z1) / 2;

let hudEl = null;
function swHud(text, hot) {
  if (!hudEl) {
    if (typeof document === 'undefined') return;
    hudEl = document.createElement('div'); hudEl.id = 'swat-timer';
    hudEl.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);padding:5px 14px;border-radius:14px;font:bold 15px/1.2 Arial,sans-serif;letter-spacing:1px;color:#fff;background:rgba(20,30,60,.82);pointer-events:none;z-index:30;display:none;text-align:center';
    document.body.appendChild(hudEl);
  }
  if (!text) { hudEl.style.display = 'none'; return; }
  hudEl.style.display = 'block'; hudEl.textContent = text;
  hudEl.style.background = hot ? 'rgba(170,25,25,.88)' : 'rgba(20,30,60,.82)';
}

export function swatReset() {
  for (const h of SWT.squad) if (!h.dead) h.remove();
  if (SWT.van) scene.remove(SWT.van.g);
  Object.assign(SWT, { phase: 'none', t: 0, B: null, outT: 0, coolT: 0, squad: [], van: null, gas: null, gasCd: 0, tinkMsg: false, deployT: 0, toSpawn: 0, lostT: 0 });
  swHud(null);
}

// does a hit from direction (ux, uz) (pointing from the attacker to them) land on the shield?
export function swatBlocks(h, ux, uz, K) {
  if (!h.swat || h.dead || h.stun > 0.6) return false;
  const fx = Math.sin(h.face), fz = Math.cos(h.face);
  if (-(fx * ux + fz * uz) < 0.3) return false; // from the side or behind: no shield there
  emitPuff(h.x + fx * 0.5, h.y + 1.2, h.z + fz * 0.5, { life: 0.18, vy: 0.4, size0: 0.15, size1: 0.45, alpha: 0.9, color: 0xffe080 });
  K.sfx.hit();
  if (!SWT.tinkMsg) { SWT.tinkMsg = true; K.showMsg('THE SHIELDS STOP EVERYTHING FROM THE FRONT. GET ROUND THE SIDE, OR RUN', 4); }
  if (Math.random() < 0.15) K.say(h, 'SHIELD!');
  return true;
}

// one SWAT operator's move this tick (they're Hunters in chase with h.swat set): returns the velocity
export function swatSteer(h, dt, d, dx, dz, tp, K) {
  const P = K.player, T = h.T;
  h.lastSeen += dt;
  // over to you: through the door, not into the wall
  let tx = tp.x, tz = tp.z;
  if (!(h.hasLOS && d < 30) && !los(h.x, h.z, tx, tz)) { const n = navTarget(h.x, h.z, 2); if (n) { tx = n.x; tz = n.z; } }
  // holding the line at the door while the gas goes in: wait just outside rather than piling into the smoke
  if (SWT.gas && swIn(SWT.gas.B, tp.x, tp.z) && !swIn(SWT.gas.B, h.x, h.z, 0.3) && d < 9) { tx = h.x; tz = h.z; }
  const ex = tx - h.x, ez = tz - h.z, ed = Math.hypot(ex, ez) || 1;
  let spd = T.speed * K.dayMult();
  if (h.hasLOS && d < 10) spd = 1.6; // shield up, steady advance
  let vx = (ex / ed) * spd, vz = (ez / ed) * spd;
  if (d < 1.3) { vx = 0; vz = 0; }
  // rifles: three-round bursts, accurate, from behind the shield
  h.swBurst = h.swBurst || 0;
  if (h.hasLOS && d < 45 && !P.hide && h.noticeT <= 0) {
    if (h.swBurst > 0) { h.swBurstT -= dt; if (h.swBurstT <= 0) { h.swBurst--; h.swBurstT = 0.11; K.swatShot(h, d); } }
    else if (h.fireCd <= 0) { h.swBurst = 3; h.swBurstT = 0; h.fireCd = (1.25 + Math.random() * 0.6) / Math.min(1.5, K.dayMult()); }
  }
  if (P.hide && d < 1.8) K.forceOutOfHiding(h); // a bin lid's no match for a riot squad
  // shield bash up close
  if (d < 1.6 && h.attackCd <= 0 && P.alive && !P.hide && Math.abs(P.y - h.y) < 1.3) { h.attackCd = 1.1; K.bash(h); }
  h.shoutT = (h.shoutT || Math.random() * 3) - dt;
  if (h.shoutT <= 0) { h.shoutT = 3.5 + Math.random() * 4; K.say(h, SWAT_LINES[(Math.random() * SWAT_LINES.length) | 0]); }
  return { x: vx, z: vz };
}

function swSpawnSquad(K) {
  const tp = K.targetPos(), B = SWT.B;
  const n = SWT.toSpawn; if (n <= 0 || !SWT.van) return;
  const V = SWT.van, rx = V.g.position.x - Math.sin(V.g.rotation.y) * 3.6, rz = V.g.position.z - Math.cos(V.g.rotation.y) * 3.6; // out of the back doors
  const p = !pointBlocked(rx, rz, 0.4) ? { x: rx, z: rz } : randomOpenPoint(V.g.position.x, V.g.position.z, 2.5, 6, 12);
  if (!p) return;
  const h = K.makeSwat(p.x, p.z);
  h.face = Math.atan2(tp.x - p.x, tp.z - p.z);
  SWT.squad.push(h); SWT.toSpawn--;
  if (SWT.toSpawn === 0) { K.say(h, 'ARMED POLICE! COME OUT!'); K.reportSighting(B ? swCx(B) : tp.x, B ? swCz(B) : tp.z); }
}

function swPlaceVan(K) {
  const B = SWT.B, tp = K.targetPos(), cx = B ? swCx(B) : tp.x, cz = B ? swCz(B) : tp.z;
  // somewhere on open ground 16-30m out, ideally where you can't see it pull up
  let best = null;
  for (let t = 0; t < 30 && !best; t++) {
    const c = randomOpenPoint(cx, cz, 16, 30, 4); if (!c) continue;
    if (navCutOff(c.x, c.z) || swIn(B, c.x, c.z, 3)) continue;
    let ok = true; for (const [ox, oz] of [[1.4, 3], [-1.4, 3], [1.4, -3], [-1.4, -3], [0, 0]]) if (pointBlocked(c.x + ox, c.z + oz, 0.2)) ok = false; // room for the van itself
    if (ok || t > 22) best = c;
  }
  if (!best) best = randomOpenPoint(cx, cz, 10, 40, 30) || { x: tp.x + 20, z: tp.z };
  const g = buildVan(), yaw = Math.atan2(cx - best.x, cz - best.z) + Math.PI / 2;
  g.rotation.y = yaw;
  const sx = best.x - Math.sin(yaw) * 26, sz = best.z - Math.cos(yaw) * 26; // screeches in sideways along its own nose
  g.position.set(sx, 0, sz);
  SWT.van = { g, fx: sx, fz: sz, tx: best.x, tz: best.z, t: 0 };
}

function swGasStep(dt, K) {
  const G = SWT.gas, P = K.player;
  if (!G) return;
  G.t -= dt; G.fuse -= dt;
  if (G.fuse > 0) { // canister skittering in
    emitPuff(G.x, 0.3, G.z, { life: 0.5, vy: 0.6, size0: 0.2, size1: 0.6, alpha: 0.5, color: 0xd8e8b0 });
    return;
  }
  G.puffT -= dt;
  if (G.puffT <= 0) {
    G.puffT = 0.07;
    const B = G.B;
    for (let k = 0; k < 2; k++) emitPuff(B.x0 + Math.random() * (B.x1 - B.x0), 0.4 + Math.random() * 1.6, B.z0 + Math.random() * (B.z1 - B.z0), { life: 2.2, vy: 0.15, vx: Math.random() - 0.5, vz: Math.random() - 0.5, size0: 1.2, size1: 3.6, alpha: 0.32, color: 0xdfe8b8 });
  }
  if (swIn(G.B, P.x, P.z) && P.y < 4 && !P.car) {
    if (P.hide) K.forceOutOfHiding(); // nobody stays in a wardrobe full of pepper
    G.coughT -= dt;
    if (G.coughT <= 0) { G.coughT = 1.1; K.hurt(5); K.showMsg(COUGH[(Math.random() * COUGH.length) | 0] + '  GET OUT!', 1.1); }
  }
  for (const h of K.hunters()) if (!h.dead && !h.swat && swIn(G.B, h.x, h.z) && !(h.panicT > 0)) { h.panicT = 3; K.say(h, '*COUGH*'); }
  if (G.t <= 0) SWT.gas = null;
}

export function updateSwat(dt, K) {
  const P = K.player, Gs = K.G;
  if (Gs.super || Gs.mode !== 'playing') { if (SWT.phase !== 'none' && Gs.super) swatReset(); return; }
  SWT.coolT = Math.max(0, SWT.coolT - dt);
  SWT.squad = SWT.squad.filter((h) => !h.dead);
  const B = swBuildingAt(P), tp = K.targetPos();
  if (SWT.phase === 'none') {
    if (!B || SWT.coolT > 0 || !P.alive) { swHud(null); return; }
    // they know you're in here: someone saw you, or the last sighting is right on this building
    const seen = K.hunters().some((h) => !h.dead && h.state === 'chase' && (h.hasLOS || h.lastSeen < 2) && Math.hypot(h.x - P.x, h.z - P.z) < 45);
    const known = seen || (Gs.lastSeenT < 6 && swIn(B, Gs.lkp.x, Gs.lkp.z, 4));
    if (!known) { swHud(null); return; }
    SWT.phase = 'siege'; SWT.t = SWAT_DELAY; SWT.B = B; SWT.outT = 0;
    K.showMsg(`THEY KNOW YOU'RE IN ${B.name || 'HERE'}. SWAT IN 2 MINUTES`, 4); K.sfx.alarm();
  }
  if (SWT.phase === 'siege') {
    if (swIn(SWT.B, P.x, P.z, 1) && P.alive) { SWT.outT = 0; SWT.t -= dt; }
    else {
      SWT.outT += dt;
      const far = Math.hypot(P.x - swCx(SWT.B), P.z - swCz(SWT.B)) > 30;
      if (B && !swSame(B, SWT.B)) { SWT.B = B; } // ducked next door: they follow the trail, clock keeps running
      else if (SWT.outT > 12 && far && Gs.unseenT > 8) { SWT.phase = 'none'; SWT.B = null; swHud(null); K.showMsg('YOU SLIPPED OUT. THE SIEGE IS STOOD DOWN', 3); return; }
    }
    const m = Math.max(0, Math.ceil(SWT.t)), mm = Math.floor(m / 60), ss = String(m % 60).padStart(2, '0');
    swHud(`SWAT EN ROUTE ${mm}:${ss}`, m <= 20);
    if (SWT.t <= 0) {
      SWT.phase = 'deployed'; SWT.deployT = 0; SWT.lostT = 0;
      SWT.toSpawn = Math.min(10, 6 + Math.floor(Gs.day / 4));
      swPlaceVan(K); K.sfx.alarm(); K.sfx.horn();
      K.showBanner('SWAT<small>RIOT SHIELDS AND RIFLES. THEY\'RE COMING IN</small>', 3.5);
    }
    return;
  }
  // deployed
  SWT.deployT += dt;
  const V = SWT.van;
  if (V) {
    V.t = Math.min(1, V.t + dt / 2.2);
    const k = 1 - Math.pow(1 - V.t, 3);
    V.g.position.x = V.fx + (V.tx - V.fx) * k; V.g.position.z = V.fz + (V.tz - V.fz) * k;
    const on = Math.floor(Gs.elapsed * 6) % 2 === 0; V.g.userData.red.visible = on; V.g.userData.blue.visible = !on;
    if (V.t >= 1 && SWT.toSpawn > 0) { V.spawnT = (V.spawnT ?? 0.3) - dt; if (V.spawnT <= 0) { V.spawnT = 0.45; swSpawnSquad(K); } }
  }
  if (B) SWT.B = B;
  const inside = swIn(SWT.B, P.x, P.z, 0.3) && !!B;
  swHud(inside ? 'SWAT ON SCENE. GET OUT!' : SWT.squad.length ? `SWAT: ${SWT.squad.length} ON YOUR TAIL` : null, true);
  // gas in through the door once they're stacked up close
  SWT.gasCd -= dt;
  if (inside && !SWT.gas && SWT.gasCd <= 0 && SWT.toSpawn === 0) {
    const thrower = SWT.squad.find((h) => Math.hypot(h.x - P.x, h.z - P.z) < 16);
    if (thrower) {
      SWT.gasCd = 20;
      SWT.gas = { B: { ...SWT.B }, t: 22, fuse: 1.4, x: P.x + (Math.random() - 0.5) * 3, z: P.z + (Math.random() - 0.5) * 3, puffT: 0, coughT: 0.6 };
      K.say(thrower, 'GAS GOING IN!'); K.sfx.shove(); K.showMsg('PEPPER SMOKE! YOU CAN\'T STAY IN HERE', 2.5);
    }
  }
  swGasStep(dt, K);
  // stand down once you've given them the slip (or the whole team's on the floor)
  const close = SWT.squad.some((h) => Math.hypot(h.x - tp.x, h.z - tp.z) < 70);
  SWT.lostT = !close && Gs.unseenT > 10 ? SWT.lostT + dt : 0;
  if ((SWT.toSpawn === 0 && SWT.squad.length === 0) || SWT.lostT > 25 || !P.alive) {
    const beaten = SWT.toSpawn === 0 && SWT.squad.length === 0;
    for (const h of SWT.squad) if (!h.dead) { h.remove(); }
    if (SWT.van) scene.remove(SWT.van.g);
    Object.assign(SWT, { phase: 'none', squad: [], van: null, gas: null, B: null, coolT: beaten ? 90 : 45, toSpawn: 0 });
    swHud(null);
    if (P.alive) K.showMsg(beaten ? 'THE WHOLE SWAT TEAM IS DOWN. THEY\'LL SEND MORE NEXT TIME' : 'SWAT STOOD DOWN. YOU LOST THEM', 3.5);
  }
}

export function swatDebug() { return { phase: SWT.phase, t: SWT.t, squad: SWT.squad.length, toSpawn: SWT.toSpawn, gas: !!SWT.gas, van: !!SWT.van, B: SWT.B }; }
