// Street streetPropObjs you can mess with. Bins and wheelie bins get kicked over (a shove, a sprint into them,
// a crowbar, a bullet, a car, the hero), tumble down the street spilling rubbish, lose their lids, and
// bowl over anyone they hit. Fire hydrants burst when a car, a crowbar or enough bullets hit them: the
// cap pings off and a tall jet of water shoots up for half a minute, flinging anyone who steps on it up
// into the air (you included: a free ride up onto a low roof) and soaking anyone who runs through it.
// At the start of each day the council quietly stands the far-off bins back up and fixes the hydrants.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, mr, mpick, scene, GeoBuf } from './core.js';
import { moveBody, floorAt } from './world.js';
import { streetProps } from './streets.js';
import { emitPuff } from './fx.js';
import { comicWord } from './knockfx.js';

const SP_BASE = 0.15; // the pavement top every prop stands on
const spPropMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function spGeo(fn) { const b = new GeoBuf(); fn(b); return b.geometry(); }
// shapes are spBuilt around their middle, so they can tumble about it
const SP_SHAPES = {
  bin: { body: spGeo((b) => b.cyl(0, 0, 0.3, 0.33, -0.425, 0.425, 0x2a4a3a, 10)), lid: spGeo((b) => b.cyl(0, 0, 0.36, 0.2, -0.075, 0.075, 0x1a2a22, 10)), half: 0.425, lidY: 0.5, rad: 0.33 },
  wheelie: { body: spGeo((b) => b.box(-0.3, 0.3, -0.5, 0.5, -0.35, 0.35, 0xffffff, { bottom: true })), lid: spGeo((b) => b.box(-0.33, 0.33, -0.035, 0.035, -0.4, 0.38, 0xc0c0c0, { bottom: true })), half: 0.5, lidY: 0.535, rad: 0.32 },
  hydrant: {
    body: spGeo((b) => { b.cyl(0, 0, 0.16, 0.16, 0, 0.6, 0xc8281e, 8); b.box(-0.27, 0.27, 0.33, 0.45, -0.06, 0.06, 0xd8d8d0); b.box(-0.06, 0.06, 0.33, 0.45, -0.22, 0.22, 0xc8281e); }),
    lid: spGeo((b) => b.cyl(0, 0, 0.2, 0.06, -0.1, 0.1, 0xc8281e, 8)), half: 0, lidY: 0.7, rad: 0.15,
  },
};
const spKinds = {};
const _spM = new THREE.Matrix4(), _spQ = new THREE.Quaternion(), _spE = new THREE.Euler(0, 0, 0, 'YXZ'), _spP = new THREE.Vector3(), _spS = new THREE.Vector3(1, 1, 1), _spC = new THREE.Color();
export const streetPropObjs = [];   // {kind, x, z, y, col, state: 'up'|'loose', vx, vy, vz, rx, ry, spin, lid, burst...}
export const geysers = []; // bursting hydrants
let spBuilt = false;
function spSetMat(mesh, i, x, y, z, rx, ry) { _spE.set(rx, ry, 0); _spQ.setFromEuler(_spE); _spP.set(x, y, z); _spM.compose(_spP, _spQ, _spS); mesh.setMatrixAt(i, _spM); mesh.instanceMatrix.needsUpdate = true; }
export function buildStreetProps() {
  if (spBuilt) return; spBuilt = true;
  for (const k of Object.keys(SP_SHAPES)) {
    const list = streetProps.filter((p) => p.kind === k);
    if (!list.length) continue;
    const S = SP_SHAPES[k], body = new THREE.InstancedMesh(S.body, spPropMat, list.length), lid = new THREE.InstancedMesh(S.lid, spPropMat, list.length);
    body.frustumCulled = lid.frustumCulled = false;
    scene.add(body, lid);
    spKinds[k] = { body, lid };
    list.forEach((sp, i) => {
      const P = { kind: k, i, S, x: sp.x, z: sp.z, ox: sp.x, oz: sp.z, col: sp.col, colH: sp.col.h, state: 'up', y: SP_BASE + S.half, vx: 0, vy: 0, vz: 0, rx: 0, ry: mr(-0.3, 0.3), spin: 0,
        lid: { x: sp.x, z: sp.z, y: SP_BASE + S.half + S.lidY, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, state: 'on' }, hits: 0 };
      if (k === 'wheelie') { body.setColorAt(i, _spC.set(sp.color)); lid.setColorAt(i, _spC.set(sp.color)); }
      streetPropObjs.push(P); spDraw(P);
    });
    if (body.instanceColor) { body.instanceColor.needsUpdate = true; lid.instanceColor.needsUpdate = true; }
  }
}
function spDraw(P) {
  const K = spKinds[P.kind];
  spSetMat(K.body, P.i, P.x, P.y, P.z, P.rx, P.ry);
  const L = P.lid;
  if (L.state === 'gone') spSetMat(K.lid, P.i, 0, -50, 0, 0, 0);
  else if (L.state === 'on') { const up = P.S.lidY; spSetMat(K.lid, P.i, P.x + Math.sin(P.ry) * Math.sin(P.rx) * up, P.y + Math.cos(P.rx) * up, P.z + Math.cos(P.ry) * Math.sin(P.rx) * up, P.rx, P.ry); }
  else spSetMat(K.lid, P.i, L.x, L.y, L.z, L.rx, L.ry);
}

// ---- kicking things over ----
// knock a bin flying in direction (ux, uz) at speed sp
export function kickProp(P, ux, uz, sp, C, up = 4) {
  if (P.kind === 'hydrant') { hitHydrant(P, sp > 8 ? 3 : 1, C); return; }
  const was = P.state;
  P.state = 'loose'; P.col.h = -1; P.restT = 0;
  P.vx = ux * sp + mr(-0.6, 0.6); P.vz = uz * sp + mr(-0.6, 0.6); P.vy = Math.max(P.vy, up + sp * 0.15);
  P.ry = Math.atan2(ux, uz); P.spin = 5 + sp * 0.9;
  if (P.lid.state === 'on') { const L = P.lid; L.state = 'loose'; L.x = P.x; L.z = P.z; L.y = P.y + P.S.lidY; L.vx = P.vx * 0.6 + mr(-2, 2); L.vz = P.vz * 0.6 + mr(-2, 2); L.vy = P.vy + mr(2, 4); L.spin = mr(8, 14); L.ry = P.ry; }
  if (was === 'up') {
    spSpill(P, ux, uz);
    if (C) { C.sfx.bin(); if (Math.hypot(P.x - C.player.x, P.z - C.player.z) < 30 && Math.random() < 0.6) comicWord(mpick(['CLANG!', 'CRASH!', 'BONK!']), P.x, P.y + 1.2, P.z); C.binKicked && C.binKicked(P); }
  }
}
// rubbish everywhere: crisp packets and paper fly out, and a little spLitter is left on the ground
const SP_LITTER_MAX = 240;
const spLitterGeo = new THREE.PlaneGeometry(0.22, 0.16).rotateX(-Math.PI / 2);
const spLitterMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
let spLitter = null, spLitterN = 0;
const SP_LITTER_COLS = [0xe8e0d0, 0xd02a2a, 0x2a5aa0, 0xe0b020, 0xf0f0f0, 0x8a6a4a, 0x2a8a4a];
function spSpill(P, ux, uz) {
  for (let k = 0; k < 6; k++) emitPuff(P.x + mr(-0.4, 0.4), P.y + mr(0, 0.6), P.z + mr(-0.4, 0.4), { life: mr(0.6, 1.1), vx: ux * mr(1, 4) + mr(-1.5, 1.5), vy: mr(1.5, 3.5), vz: uz * mr(1, 4) + mr(-1.5, 1.5), size0: 0.15, size1: 0.35, alpha: 0.9, color: mpick(SP_LITTER_COLS) });
  if (!spLitter) { spLitter = new THREE.InstancedMesh(spLitterGeo, spLitterMat, SP_LITTER_MAX); spLitter.frustumCulled = false; spLitter.count = 0; scene.add(spLitter); }
  const n = 4 + Math.floor(Math.random() * 4);
  for (let k = 0; k < n; k++) {
    const i = spLitterN % SP_LITTER_MAX; spLitterN++;
    const d = mr(0.4, 2.6), x = P.x + ux * d + mr(-0.9, 0.9), z = P.z + uz * d + mr(-0.9, 0.9);
    const y = floorAt(x, z, SP_BASE + 0.5) + 0.02;
    spSetMat(spLitter, i, x, y, z, 0, mr(0, 6.28)); spLitter.setColorAt(i, _spC.set(mpick(SP_LITTER_COLS)));
    spLitter.count = Math.min(SP_LITTER_MAX, spLitterN);
  }
  if (spLitter.instanceColor) spLitter.instanceColor.needsUpdate = true;
}

// ---- hydrants ----
const spJetMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55, depthWrite: false });
const spJetGeo = new THREE.CylinderGeometry(0.16, 0.32, 1, 10, 1, true).translate(0, 0.5, 0);
const spPuddleMat = new THREE.MeshBasicMaterial({ color: 0x5a7a9a, transparent: true, opacity: 0.35, depthWrite: false });
const spPuddleGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
export function hitHydrant(P, n, C) {
  if (P.kind !== 'hydrant' || P.burst) return false;
  P.hits += n;
  if (C) C.sfx.clank();
  if (P.hits < 3) return false;
  P.burst = { t: 0, dur: mr(28, 36) };
  const L = P.lid; L.state = 'loose'; L.x = P.x; L.z = P.z; L.y = SP_BASE + P.S.lidY; L.vx = mr(-1.5, 1.5); L.vz = mr(-1.5, 1.5); L.vy = mr(14, 18); L.spin = mr(10, 16);
  const jet = new THREE.Mesh(spJetGeo, spJetMat); jet.position.set(P.x, SP_BASE + 0.6, P.z); scene.add(jet);
  const pud = new THREE.Mesh(spPuddleGeo, spPuddleMat); pud.position.set(P.x, SP_BASE + 0.015, P.z); pud.scale.setScalar(0.1); scene.add(pud);
  P.burst.jet = jet; P.burst.pud = pud;
  geysers.push(P);
  spDraw(P);
  if (C) {
    C.sfx.gush(); comicWord('SPLOOSH!', P.x, 3, P.z);
    if (Math.hypot(P.x - C.player.x, P.z - C.player.z) < 50) C.showMsg('THE HYDRANT\'S GONE', 1.4);
    C.hydrantBurst && C.hydrantBurst(P);
  }
  return true;
}
function spJetHeight(B) { const left = B.dur - B.t; return B.t < 0.6 ? B.t / 0.6 * 9 : left < 6 ? Math.max(0, left / 6) * 9 : 9 + Math.sin(B.t * 7) * 0.5; }
function spUpdateGeysers(dt, C) {
  for (let i = geysers.length - 1; i >= 0; i--) {
    const P = geysers[i], B = P.burst;
    B.t += dt;
    const h = spJetHeight(B);
    B.jet.scale.set(1 + Math.sin(B.t * 13) * 0.08, Math.max(0.01, h), 1 + Math.cos(B.t * 11) * 0.08);
    B.pud.scale.setScalar(Math.min(4.5, 0.5 + B.t * 0.35) * (B.t > B.dur ? Math.max(0, 1 - (B.t - B.dur) / 20) : 1));
    const near = Math.hypot(P.x - C.player.x, P.z - C.player.z) < 90;
    if (h > 0.5 && near) {
      B.puffT = (B.puffT || 0) - dt;
      if (B.puffT <= 0) {
        B.puffT = 0.06;
        emitPuff(P.x + mr(-0.3, 0.3), SP_BASE + h, P.z + mr(-0.3, 0.3), { life: mr(0.7, 1.2), vx: mr(-3, 3), vy: mr(-1, 2), vz: mr(-3, 3), size0: 0.5, size1: 1.8, alpha: 0.6, color: 0xdff2ff });
        emitPuff(P.x + mr(-1.2, 1.2), SP_BASE + 0.2, P.z + mr(-1.2, 1.2), { life: 0.6, vy: 0.6, size0: 0.3, size1: 0.9, alpha: 0.4, color: 0xdff2ff });
      }
    }
    if (h > 2) {
      // the player standing on it gets shot up into the air
      const Pl = C.player;
      if (!Pl.car && Pl.alive && Math.hypot(Pl.x - P.x, Pl.z - P.z) < 0.75 && Pl.y < SP_BASE + 1.5 && Pl.vy < 6) {
        Pl.vy = 9 + h * 0.75; Pl.grounded = false; Pl.mode = 'move';
        C.showMsg('WHEEEE!', 1); C.sfx.gush();
      } else if (!Pl.car && Pl.alive && Math.hypot(Pl.x - P.x, Pl.z - P.z) < 2.2 && Pl.y < SP_BASE + 2) { // the spray shoves you about a bit
        const dx = Pl.x - P.x, dz = Pl.z - P.z, d = Math.hypot(dx, dz) || 1; Pl.kx += (dx / d) * 6 * dt; Pl.kz += (dz / d) * 6 * dt;
      }
      for (const hh of C.G.hunters) {
        if (hh.dead || hh.inside || Math.abs(hh.x - P.x) > 2.4 || Math.abs(hh.z - P.z) > 2.4) continue;
        const dx = hh.x - P.x, dz = hh.z - P.z, d = Math.hypot(dx, dz);
        if (d < 0.8) { C.setHitKind('water'); C.G.calmHit = !P.byPlayer; C.launchHunter(hh, dx / (d || 1), dz / (d || 1), true, { x: dx * 2 + mr(-1, 1), y: 9 + h * 0.6, z: dz * 2 + mr(-1, 1) }); C.G.calmHit = false; }
        else if (d < 2.2 && (hh.state === 'chase' || Math.hypot(hh.vx || 0, hh.vz || 0) > 3) && !(hh.soakT > 0)) { // ran through the spray
          hh.soakT = 2.5; hh.stun = Math.max(hh.stun, 1.1); hh.kx += (dx / d) * 5; hh.kz += (dz / d) * 5; C.say(hh, mpick(SP_SOAK));
        }
      }
    }
    if (B.t > B.dur + 20) { scene.remove(B.jet, B.pud); geysers.splice(i, 1); P.spent = true; }
    else if (B.t > B.dur) B.jet.visible = false;
  }
}
const SP_SOAK = ['I\'M SOAKED!', 'MY HAIR!', 'COLD COLD COLD!', 'THAT\'S MY GOOD SHIRT!', 'BLEURGH!', 'IT\'S IN MY SHOES!'];

// ---- physics for loose bins and flying lids/caps ----
function spStepBody(o, r, dt, isBody, P, C) {
  o.vy -= 22 * dt;
  const ox = o.x, oz = o.z;
  o.x += o.vx * dt; o.z += o.vz * dt; o.y += o.vy * dt;
  if (moveBody(o, ox, oz, r, o.y - r, 0.6)) { o.vx *= -0.4; o.vz *= -0.4; o.spin *= 0.6; if (isBody && C && Math.hypot(o.vx, o.vz) > 2) C.sfx.thunk(); }
  const fl = floorAt(o.x, o.z, o.y + 0.2) + r;
  const sp = Math.hypot(o.vx, o.vz);
  if (o.y <= fl) {
    o.y = fl;
    if (o.vy < -3) { o.vy *= -0.3; if (isBody && C && Math.hypot(o.x - C.player.x, o.z - C.player.z) < 40) C.sfx.thunk(); } else o.vy = 0;
    const f = Math.max(0, 1 - dt * 3.2); o.vx *= f; o.vz *= f; o.spin *= Math.max(0, 1 - dt * 4);
    if (o.vy === 0 && Math.abs(o.spin) < 2.5) { const tg = Math.round((o.rx - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2; o.rx += (tg - o.rx) * Math.min(1, dt * 8); o.spin *= 0.5; } // settle on its side
    o.grounded = true;
  } else o.grounded = false;
  o.rx += o.spin * dt;
  return sp;
}
export function updateStreetProps(dt, C) {
  if (!spBuilt) return;
  const Pl = C.player;
  for (const P of streetPropObjs) {
    if (P.state === 'up') {
      if (P.kind === 'hydrant') continue;
      // sprint into a bin and it goes flying
      if (!Pl.car && Pl.alive && Math.abs(Pl.x - P.x) < 0.9 && Math.abs(Pl.z - P.z) < 0.9) {
        const sp = Math.hypot(Pl.vx, Pl.vz), d = Math.hypot(Pl.x - P.x, Pl.z - P.z);
        if (d < 0.85 && (sp > 8 || Pl.bike && sp > 5) && Math.abs(Pl.y - SP_BASE) < 1) kickProp(P, Pl.vx / sp, Pl.vz / sp, sp * 0.9, C);
      }
      continue;
    }
    // loose: tumbling down the street, then lying on its side
    const wasAir = !P.grounded;
    const sp = spStepBody(P, P.S.rad, dt, true, P, C);
    if (sp > 5) {
      for (const h of C.G.hunters) {
        if (h.dead || Math.abs(h.x - P.x) > 1 || Math.abs(h.z - P.z) > 1 || Math.abs(h.y + 0.6 - P.y) > 1.2) continue;
        if (Math.hypot(h.x - P.x, h.z - P.z) > 0.8) continue;
        C.setHitKind('shove');
        if (sp > 8) { C.G.calmHit = !P.byPlayer; C.launchHunter(h, P.vx / sp, P.vz / sp, true, { x: P.vx * 0.7, y: 5, z: P.vz * 0.7 }); C.G.calmHit = false; }
        else { h.stun = Math.max(h.stun, 1); h.kx += P.vx * 0.8; h.kz += P.vz * 0.8; }
        comicWord('STRIKE!', h.x, h.y + 2.2, h.z); P.vx *= 0.5; P.vz *= 0.5;
        C.binHit && C.binHit(h);
      }
    }
    // walk into a lying bin and it rolls away from your feet
    if (P.grounded && !Pl.car && Math.abs(Pl.y - P.y) < 1.2) {
      const dx = P.x - Pl.x, dz = P.z - Pl.z, d = Math.hypot(dx, dz);
      if (d < 0.75 && d > 1e-3) { const ps = Math.max(2.5, Math.hypot(Pl.vx, Pl.vz) * 0.9); P.vx = (dx / d) * ps; P.vz = (dz / d) * ps; P.spin = ps * 2; P.ry = Math.atan2(dx, dz); }
    }
    // cars ploughing through lying bins
    for (const c of C.G.cars) if (!c.far && Math.abs(c.speed) > 3 && Math.abs(c.x - P.x) < c.hl + 1 && Math.abs(c.z - P.z) < c.hl + 1 && Math.hypot(c.x - P.x, c.z - P.z) < c.hl * 0.8 + 0.6) { const k = Math.abs(c.speed); P.vx = c.fx * k * 1.1 * Math.sign(c.speed) + mr(-1, 1); P.vz = c.fz * k * 1.1 * Math.sign(c.speed) + mr(-1, 1); P.vy = 3 + k * 0.15; P.spin = 8; }
    P.restT = wasAir ? 0 : (P.restT || 0) + dt;
    spDraw(P);
  }
  for (const P of streetPropObjs) {
    const L = P.lid;
    if (L.state !== 'loose') continue;
    spStepBody(L, P.kind === 'hydrant' ? 0.1 : 0.06, dt, false, P, C);
    if (L.grounded) L.rx = L.rx * 0.9; // lids end up flat
    spDraw(P);
  }
  // cars smash into upright bins and hydrants
  for (const c of C.G.cars) {
    const sp = Math.max(Math.abs(c.speed), Math.abs(c.preSpeed || 0)), sg = Math.sign(c.speed || c.preSpeed || 1);
    if (c.far || sp < 3.5) continue;
    for (const P of propsNear(c.x, c.z, c.hl + 1)) {
      if (P.state !== 'up') continue;
      const dx = P.x - c.x, dz = P.z - c.z, lf = dx * c.fx + dz * c.fz, lr = dx * c.fz - dz * c.fx;
      if (Math.abs(lf) > c.hl + 0.6 || Math.abs(lr) > c.hw + 0.4) continue;
      P.byPlayer = c.driver === 'player';
      if (P.kind === 'hydrant') { if (sp > 5) hitHydrant(P, 3, C); continue; }
      kickProp(P, c.fx * sg, c.fz * sg, sp * 1.15, C, 3);
    }
  }
  if (geysers.length) for (const hh of C.G.hunters) if (hh.soakT > 0) hh.soakT -= dt;
  spUpdateGeysers(dt, C);
}
// a tiny spatial index so per-frame checks stay cheap
const SP_GRID = 24, spGrid = new Map();
function spKey(x, z) { return Math.floor(x / SP_GRID) * 4096 + Math.floor(z / SP_GRID); }
function spIndex() { spGrid.clear(); for (const P of streetPropObjs) { const k = spKey(P.ox, P.oz); if (!spGrid.has(k)) spGrid.set(k, []); spGrid.get(k).push(P); } }
export function propsNear(x, z, r) {
  if (!spGrid.size && streetPropObjs.length) spIndex();
  const out = [], gx0 = Math.floor((x - r - 30) / SP_GRID), gx1 = Math.floor((x + r + 30) / SP_GRID), gz0 = Math.floor((z - r - 30) / SP_GRID), gz1 = Math.floor((z + r + 30) / SP_GRID);
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) { const L = spGrid.get(gx * 4096 + gz); if (L) for (const P of L) if (Math.abs(P.x - x) < r && Math.abs(P.z - z) < r) out.push(P); }
  return out;
}
// the nearest kickable thing in front of you (for shoves and the crowbar)
export function propInFront(x, y, z, fx, fz, range = 2.2) {
  let best = null, bd = range;
  for (const P of propsNear(x, z, range + 1)) {
    if (P.burst && P.kind === 'hydrant') continue;
    const dx = P.x - x, dz = P.z - z, d = Math.hypot(dx, dz);
    if (d > bd || Math.abs(P.y - y - 0.5) > 1.6) continue;
    if (d > 0.5 && (dx * fx + dz * fz) / d < 0.35) continue;
    best = P; bd = d;
  }
  return best;
}
// a bullet along (o + d*t): returns {P, t} for the first prop it hits before maxT
export function rayProps(o, d, maxT) {
  let best = null, bt = maxT;
  const L = Math.min(maxT, 120), steps = Math.ceil(L / 20);
  const seen = new Set();
  for (let s = 0; s <= steps; s++) {
    const t0 = (s / steps) * L;
    for (const P of propsNear(o.x + d.x * t0, o.z + d.z * t0, 12)) {
      if (seen.has(P)) continue; seen.add(P);
      const r = P.S.rad + 0.05, ox = o.x - P.x, oz = o.z - P.z, a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r, disc = b * b - 4 * a * c;
      if (a < 1e-9 || disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t <= 0 || t >= bt) continue;
      const y = o.y + d.y * t, top = P.state === 'up' ? (P.kind === 'hydrant' ? SP_BASE + 0.8 : P.y + P.S.half) : P.y + P.S.rad, bot = P.state === 'up' ? SP_BASE : P.y - P.S.rad;
      if (y < bot || y > top) continue;
      best = P; bt = t;
    }
  }
  return best ? { P: best, t: bt } : null;
}
// every bin stood back up and every hydrant fixed (the council comes round overnight), except the ones you can see
export function tidyStreetProps(px, pz, keepR = 80) {
  for (const P of streetPropObjs) {
    if (Math.hypot(P.x - px, P.z - pz) < keepR || Math.hypot(P.ox - px, P.oz - pz) < keepR) continue;
    if (P.state === 'up' && !P.burst && P.lid.state === 'on') continue;
    spResetProp(P);
  }
}
function spResetProp(P) {
  if (P.burst) { scene.remove(P.burst.jet, P.burst.pud); const gi = geysers.indexOf(P); if (gi >= 0) geysers.splice(gi, 1); P.burst = null; }
  Object.assign(P, { x: P.ox, z: P.oz, y: SP_BASE + P.S.half, vx: 0, vy: 0, vz: 0, rx: 0, spin: 0, state: 'up', hits: 0, spent: false });
  P.col.h = P.colH; P.lid.state = 'on';
  spDraw(P);
}
export function resetStreetProps() { for (const P of streetPropObjs) spResetProp(P); if (spLitter) { spLitter.count = 0; spLitterN = 0; } }
export function streetPropDebug() {
  const by = (k) => streetPropObjs.filter((p) => p.kind === k);
  return { bins: by('bin').length, wheelies: by('wheelie').length, hydrants: by('hydrant').length, loose: streetPropObjs.filter((p) => p.state === 'loose').length, geysers: geysers.length, spLitter: spLitter ? spLitter.count : 0 };
}
