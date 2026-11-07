// HUNTED — survive 30 days while everyone in three towns hunts you.
import * as THREE from '../vendor/three.module.min.js';
import {
  clamp, lerp, smoothstep, angDiff, mr, mpick, fmtTime, $, canvas, renderer, scene, camera, hemi, sun,
  vmScene, vmCamera, puffTex, GeoBuf, canvasTex,
} from './core.js';
import {
  CITIES, HIGHWAYS, WORLD, RIVER, colliders, blockRects, parkedSpots, beacons, animated, waterRects, lanes, emissiveFacades,
  generateWorld, cityAt, localeName, resolveCircle, pointBlocked, maxHeightNear, groundY,
  navRecenter, computeFlow, navTarget, los, los3D, blockedAt, randomOpenPoint, raycastWorld,
} from './world.js';
import { initAudio, sfx, setAircraftVolume } from './audio.js';
import { emitPuff, updatePuffs, updateAmbientSmoke, spawnTracer, updateTracers } from './fx.js';
import { buildPerson, lam, SKINS, SHIRTS, PANTS, HAIRS, ragdolls, addRagdoll } from './people.js';

const CFG = { days: 30, dayLength: 90, startHour: 16.5 };

generateWorld();

// =====================================================================
// Game state
// =====================================================================
const G = {
  mode: 'menu', elapsed: 0, day: 1, hour: CFG.startHour, dayAmt: 1,
  hunters: [], cars: [], pickups: [], helis: [], drones: [],
  kills: 0, pingT: 40, spawnT: 0, flowT: 0, hunterCarT: 25, heartT: 0, overT: 0, airT: 0,
  shake: 0, hurtFlash: 0, msgT: 0,
  heat: 0, level: 0, lkp: { x: 0, z: 0 }, lastSeenT: 99, airTracking: 0, airAlertT: 0, spottedMsgT: 0,
  locale: '', localeT: 0,
};
const player = {
  x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, hp: 100, stam: 100, exhausted: false,
  lastHurt: 99, shoveCd: 0, kx: 0, kz: 0, alive: true, car: null, mag: 12, reserve: 48, reloadT: 0, fireCd: 0,
  bob: 0, dragT: 0, carHitCd: 0, recoil: 0, shoveAnim: 0, camOff: 0, sprinting: false,
};
const dayMult = () => 1 + (G.day - 1) * 0.016;
const targetPos = () => (player.car ? { x: player.car.x, z: player.car.z } : { x: player.x, z: player.z });
const playerEyeY = () => (player.car ? 1.2 : groundY(player.x, player.z) + player.y + 1.3);

// ---------------------------------------------------------------------
// Profile ("how wanted you are")
// ---------------------------------------------------------------------
const LEVELS = [0, 20, 60, 120, 190, 270];
const LEVEL_NAMES = ['LOW PROFILE', 'NOTICED', 'KNOWN FACE', 'WANTED', 'MOST WANTED', 'PUBLIC ENEMY'];
const HELIS_AT = [0, 0, 1, 1, 2, 3];
const DRONES_AT = [0, 1, 2, 3, 4, 6];
function addHeat(n) { G.heat = clamp(G.heat + n, 0, 330); }
function heatFloor() { return (G.day - 1) * 6.5; }
function reportSighting(x, z) { G.lkp.x = x; G.lkp.z = z; G.lastSeenT = 0; }
const searchRadius = () => clamp(12 + G.lastSeenT * 1.6, 12, 110);

// ---------------------------------------------------------------------
// Day / night clock: nights pass faster than days
// ---------------------------------------------------------------------
const HOUR_TABLE = (() => {
  const steps = 96, cum = [0];
  for (let i = 0; i < steps; i++) { const h = (CFG.startHour + i / 4) % 24; cum.push(cum[i] + (h >= 6 && h < 20 ? 1 : 0.45)); }
  return { steps, cum, total: cum[steps] };
})();
function hourAt(elapsed) {
  const p = ((elapsed / CFG.dayLength) % 1) * HOUR_TABLE.total, c = HOUR_TABLE.cum;
  let i = 0; while (i < HOUR_TABLE.steps - 1 && c[i + 1] < p) i++;
  return (CFG.startHour + (i + (p - c[i]) / (c[i + 1] - c[i])) / 4) % 24;
}

function hurtPlayer(dmg, fromX, fromZ, knock = 0) {
  if (!player.alive || G.mode !== 'playing') return;
  player.hp -= dmg; player.lastHurt = 0;
  G.hurtFlash = Math.min(1, G.hurtFlash + 0.35 + dmg / 40); G.shake = Math.min(0.5, G.shake + dmg / 60);
  if (knock && !player.car) { const dx = player.x - fromX, dz = player.z - fromZ, d = Math.hypot(dx, dz) || 1; player.kx += (dx / d) * knock; player.kz += (dz / d) * knock; }
  sfx.hurt();
  if (player.hp <= 0) { player.hp = 0; killPlayer(); }
}

// =====================================================================
// Hunters (everyone) — civilians, runners, brutes, and police at high profile
// =====================================================================
const HTYPES = {
  civ: { speed: 5.0, walk: 1.6, dmg: 7, scale: 1.0, hp: 2, knock: 1.0, stun: 1.8 },
  runner: { speed: 6.6, walk: 2.0, dmg: 5, scale: 0.95, hp: 2, knock: 1.2, stun: 1.5 },
  brute: { speed: 4.0, walk: 1.3, dmg: 14, scale: 1.28, hp: 5, knock: 0.45, stun: 0.9 },
  cop: { speed: 5.6, walk: 1.8, dmg: 6, scale: 1.04, hp: 3, knock: 0.8, stun: 1.2 },
};
const markerMat = new THREE.SpriteMaterial({
  map: canvasTex(64, 64, (ctx) => { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 32, 34); }),
  depthTest: false, transparent: true,
});

class Hunter {
  constructor(x, z, type, gunner, state = 'search') {
    this.type = type; this.T = HTYPES[type]; this.gunner = gunner || type === 'cop';
    const cop = type === 'cop';
    const look = {
      skin: mpick(SKINS), hair: mpick(HAIRS), gun: this.gunner,
      pants: cop ? 0x1a2238 : mpick(PANTS),
      shirt: cop ? 0x2a3f78 : type === 'runner' ? mpick([0xd6763a, 0xc93030, 0xe0c030]) : type === 'brute' ? mpick([0x333333, 0x4a3a2a, 0x2c3e66]) : mpick(SHIRTS),
      cap: cop ? 0x1a2238 : null, vest: cop ? 0x222222 : null,
    };
    this.p = buildPerson(look); this.g = this.p.group;
    this.g.scale.setScalar(this.T.scale);
    this.marker = new THREE.Sprite(markerMat); this.marker.scale.setScalar(0.55); this.marker.position.y = 2.35; this.marker.visible = false;
    this.g.add(this.marker);
    scene.add(this.g);
    this.x = x; this.z = z; this.vx = 0; this.vz = 0; this.face = Math.random() * 6.28;
    this.hp = this.T.hp; this.state = state; this.thinkT = Math.random() * 0.3;
    this.attackCd = 0; this.fireCd = mr(1.2, 2.4); this.aimT = 0;
    this.stun = 0; this.kx = 0; this.kz = 0; this.phase = Math.random() * 10; this.hasLOS = false; this.lastSeen = 0;
    this.wt = null; this.progT = 0; this.lx = x; this.lz = z; this.alertT = -1; this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.dead = false;
  }
  alert(delay = 0) { if (this.state === 'chase') return; if (delay > 0) { if (this.alertT < 0) this.alertT = delay; } else { this.state = 'chase'; this.lastSeen = 0; } }
  remove() { scene.remove(this.g); this.dead = true; }
  die(impulse, hitY, byPlayer = false) {
    if (this.dead) return;
    this.dead = true; this.marker.visible = false;
    this.g.position.set(this.x, groundY(this.x, this.z), this.z);
    addRagdoll(this.p, this.T.scale, { x: this.vx + this.kx, y: 0, z: this.vz + this.kz }, impulse, hitY);
    if (byPlayer) { G.kills++; addHeat(this.type === 'cop' ? 22 : 14); }
  }
  damage(n, dirX, dirZ, hitY) {
    this.hp -= n; this.alert();
    if (this.hp <= 0) this.die({ x: dirX * 7, y: 2.5, z: dirZ * 7 }, hitY, true);
    else { this.stun = Math.max(this.stun, 0.25); this.kx += dirX * 2.5 * this.T.knock; this.kz += dirZ * 2.5 * this.T.knock; }
  }
  update(dt) {
    const T = this.T, tp = targetPos();
    const dx = tp.x - this.x, dz = tp.z - this.z, d = Math.hypot(dx, dz);
    this.attackCd -= dt; this.fireCd -= dt;
    if (this.alertT >= 0) { this.alertT -= dt; if (this.alertT < 0) this.alert(); }

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.2 + Math.random() * 0.12;
      const see = d < 90 && los(this.x, this.z, tp.x, tp.z);
      this.hasLOS = see;
      if (this.state !== 'chase') {
        const noisy = player.car ? 30 : (player.sprinting ? 16 : 7);
        const sight = lerp(17, 34, G.dayAmt) * (player.car ? 1.5 : 1) * (1 + G.level * 0.08);
        if (d < noisy || (see && d < sight)) { this.alert(); shout(this); }
      } else if (see) { this.lastSeen = 0; if (d < 60) reportSighting(tp.x, tp.z); }
    }

    let tvx = 0, tvz = 0;
    if (this.stun > 0) {
      this.stun -= dt;
    } else if (this.state === 'chase') {
      this.lastSeen += dt;
      if (this.lastSeen > 18 && d > 60) { this.state = 'search'; this.wt = null; }
      let tx = tp.x, tz = tp.z;
      if (!(this.hasLOS || d < 4)) { const n = navTarget(this.x, this.z); if (n) { tx = n.x; tz = n.z; } }
      const ex = tx - this.x, ez = tz - this.z, ed = Math.hypot(ex, ez) || 1;
      const spd = T.speed * dayMult();
      if (this.gunner && this.hasLOS && d < 30) {
        if (d < 13) {
          const px = -dz / (d || 1), pz = dx / (d || 1);
          tvx = px * 1.6 * this.strafe; tvz = pz * 1.6 * this.strafe;
          if (Math.random() < dt * 0.4) this.strafe *= -1;
        } else { tvx = (ex / ed) * spd * 0.8; tvz = (ez / ed) * spd * 0.8; }
        if (this.fireCd <= 0) { this.aimT += dt; if (this.aimT > 0.35) { this.aimT = 0; this.fireCd = mr(1.3, 2.3) / Math.min(1.6, dayMult()); hunterShoot(this, d); } }
      } else { tvx = (ex / ed) * spd; tvz = (ez / ed) * spd; }
      const reach = player.car ? 2.7 : 1.25 + (this.type === 'brute' ? 0.25 : 0);
      if (d < reach && this.attackCd <= 0 && player.alive) {
        this.attackCd = this.type === 'runner' ? 0.7 : 1.0;
        if (player.car) player.car.damage(T.dmg * 0.6);
        else hurtPlayer(T.dmg, this.x, this.z, this.type === 'brute' ? 9 : 3);
      }
      if (player.car && d < 3 && Math.abs(player.car.speed) < 4) player.dragT += dt;
    } else {
      if (!this.wt || Math.hypot(this.wt.x - this.x, this.wt.z - this.z) < 1.5) {
        const guess = Math.random() < 0.6 ? G.lkp : { x: this.x, z: this.z };
        this.wt = randomOpenPoint(guess.x, guess.z, 5, 45) || { x: this.x, z: this.z };
      }
      const ex = this.wt.x - this.x, ez = this.wt.z - this.z, ed = Math.hypot(ex, ez) || 1;
      let ox = ex / ed, oz = ez / ed;
      if (!los(this.x, this.z, this.wt.x, this.wt.z)) { const n = this.navTo(this.wt); if (n) { ox = n.x; oz = n.z; } }
      tvx = ox * T.walk; tvz = oz * T.walk;
      this.progT += dt;
      if (this.progT > 2) { if (Math.hypot(this.x - this.lx, this.z - this.lz) < 0.6) this.wt = null; this.progT = 0; this.lx = this.x; this.lz = this.z; }
    }

    const acc = Math.min(1, dt * (this.stun > 0 ? 2 : 8));
    this.vx = lerp(this.vx, tvx, acc); this.vz = lerp(this.vz, tvz, acc);
    this.kx *= Math.max(0, 1 - dt * 5); this.kz *= Math.max(0, 1 - dt * 5);
    this.x += (this.vx + this.kx) * dt; this.z += (this.vz + this.kz) * dt;
    resolveCircle(this, 0.35 * T.scale);
    for (const c of G.cars) if (Math.abs(c.x - this.x) < 4 && Math.abs(c.z - this.z) < 4) resolveCircleCar(this, 0.35, c);

    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.3) this.face += angDiff(this.face, Math.atan2(this.vx, this.vz)) * Math.min(1, dt * 10);
    if (this.state === 'chase' && (this.hasLOS || d < 10) && d < 30) this.face += angDiff(this.face, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
    this.phase += sp * dt * 2.4;
    const sw = Math.sin(this.phase) * Math.min(1, sp / 3) * 0.8, p = this.p;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    if (this.stun > 0) { p.armL.rotation.x = p.armR.rotation.x = -2.6; }
    else if (this.state === 'chase') {
      if (this.gunner && this.hasLOS && d < 30) { p.armR.rotation.x = -1.5; p.armL.rotation.x = -sw * 0.6; }
      else { p.armL.rotation.x = -1.35 + sw * 0.25; p.armR.rotation.x = -1.35 - sw * 0.25; }
    } else { p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8; }
    this.g.position.set(this.x, groundY(this.x, this.z) + Math.abs(Math.cos(this.phase)) * Math.min(1, sp / 4) * 0.08, this.z);
    this.g.rotation.y = this.face;
    this.marker.visible = this.state === 'chase' && d < 70;
  }
  navTo(t) {
    const a = Math.atan2(t.x - this.x, t.z - this.z);
    for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const nx = this.x + Math.sin(a + off) * 3, nz = this.z + Math.cos(a + off) * 3;
      if (!blockedAt(nx, nz)) return { x: Math.sin(a + off), z: Math.cos(a + off) };
    }
    return null;
  }
}
function shout(h) {
  for (const o of G.hunters) if (o !== h && o.state !== 'chase' && Math.abs(o.x - h.x) < 35 && Math.abs(o.z - h.z) < 35) o.alert(mr(0.4, 1.6));
}
function alertAround(x, z, r, maxDelay = 1.5) {
  for (const h of G.hunters) if (Math.abs(h.x - x) < r && Math.abs(h.z - z) < r) h.alert(mr(0, maxDelay));
}

const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _dir = new THREE.Vector3();
function shootAtPlayer(from, pHit, dmg, color, dist) {
  const tp = targetPos();
  if (!player.car && player.sprinting) pHit *= 0.55;
  const hit = Math.random() < pHit;
  _to.set(tp.x, playerEyeY(), tp.z);
  if (!hit) {
    _to.x += mr(-1.6, 1.6); _to.y += mr(-0.6, 1); _to.z += mr(-1.6, 1.6);
    _dir.subVectors(_to, from).normalize();
    const w = raycastWorld(from, _dir, 120); _to.copy(from).addScaledVector(_dir, w.t);
    emitPuff(_to.x, _to.y, _to.z, { life: 0.4, vy: 0.5, size0: 0.2, size1: 0.8, alpha: 0.6, color: 0xbbbbbb });
  }
  spawnTracer(from.clone(), _to.clone(), color);
  sfx.enemyShot(dist);
  if (hit) { if (player.car) player.car.damage(dmg); else hurtPlayer(dmg, from.x, from.z, 1.5); }
}
function hunterShoot(h, d) {
  const s = h.T.scale;
  _from.set(h.x + Math.cos(h.face) * 0.4 * s + Math.sin(h.face) * 0.6, 1.45 * s, h.z - Math.sin(h.face) * 0.4 * s + Math.cos(h.face) * 0.6);
  shootAtPlayer(_from, (0.3 + G.day * 0.008) * clamp(1.4 - d / 30, 0.4, 1.2), 7, 0xffa060, d);
}

// =====================================================================
// Cars
// =====================================================================
const CAR_COLORS = [0xe8c020, 0xe8c020, 0xb3202a, 0x2a4fa0, 0xdddddd, 0x222226, 0x2f6b45, 0x9aa0a8, 0x7a2a6a, 0xd0703a];
const carGeoCache = new Map();
function carGeometry(color, taxi) {
  const key = color + (taxi ? 't' : '');
  if (carGeoCache.has(key)) return carGeoCache.get(key);
  const b = new GeoBuf();
  b.box(-1, 1, 0.37, 1.03, -2.25, 2.25, color, { bottom: true });
  b.box(-0.89, 0.89, 1.03, 1.64, -1.4, 0.9, 0x1e2638);
  b.box(-0.9, 0.9, 1.6, 1.68, -1.35, 0.85, color);
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) b.box(x - 0.15, x + 0.15, 0, 0.72, z - 0.36, z + 0.36, 0x111111);
  b.box(-0.95, 0.95, 0.3, 0.45, 2.2, 2.32, 0x333333); b.box(-0.95, 0.95, 0.3, 0.45, -2.32, -2.2, 0x333333);
  if (taxi) b.box(-0.35, 0.35, 1.68, 1.92, -0.45, -0.15, 0xfff4c0);
  const g = b.geometry(); carGeoCache.set(key, g); return g;
}
const lightGeo = (() => { const b = new GeoBuf(); for (const x of [-0.65, 0.65]) { b.box(x - 0.22, x + 0.22, 0.72, 0.92, 2.25, 2.29, 0xfff6d0); b.box(x - 0.22, x + 0.22, 0.72, 0.92, -2.29, -2.25, 0xff2020); } return b.geometry(); })();
const carMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const burntMat = new THREE.MeshLambertMaterial({ color: 0x1a1816 });
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });

function resolveCircleCar(p, r, car) {
  const dx = p.x - car.x, dz = p.z - car.z, s = Math.sin(car.heading), c = Math.cos(car.heading);
  const lf = dx * s + dz * c, lr = dx * c - dz * s;
  const qf = clamp(lf, -car.hl, car.hl), qr = clamp(lr, -car.hw, car.hw);
  let ef = lf - qf, er = lr - qr; const d2 = ef * ef + er * er;
  if (d2 > r * r) return false;
  if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; ef *= k; er *= k; }
  else { const pf = car.hl - Math.abs(lf), pr = car.hw - Math.abs(lr); if (pf < pr) { ef = (pf + r) * (Math.sign(lf) || 1); er = 0; } else { er = (pr + r) * (Math.sign(lr) || 1); ef = 0; } }
  p.x += s * ef + c * er; p.z += c * ef - s * er;
  return true;
}

class Car {
  constructor(lane, along, parked) {
    const color = mpick(CAR_COLORS);
    this.taxi = color === 0xe8c020;
    this.g = new THREE.Group();
    this.geo = carGeometry(color, this.taxi);
    this.body = new THREE.Mesh(this.geo, carMat); this.g.add(this.body);
    this.g.add(new THREE.Mesh(lightGeo, lightMat));
    this.marker = new THREE.Sprite(markerMat); this.marker.scale.setScalar(0.9); this.marker.position.y = 2.7; this.marker.visible = false;
    this.g.add(this.marker);
    scene.add(this.g);
    this.hl = 2.25; this.hw = 1.0; this.smokeT = 0; this.far = false;
    if (parked) this.park(parked); else this.placeOnLane(lane, along);
  }
  reset() { this.speed = 0; this.throttle = 0; this.steer = 0; this.reverseT = 0; this.stuckT = 0; this.hp = 100; this.wrecked = false; this.body.material = carMat; this.honkT = 0; }
  park(p) { this.reset(); this.lane = null; this.driver = null; this.x = p.x; this.z = p.z; this.heading = p.heading; }
  placeOnLane(lane, along) {
    this.reset(); this.lane = lane; this.driver = 'traffic';
    this.x = lane.axis === 'z' ? lane.fixed : along; this.z = lane.axis === 'z' ? along : lane.fixed;
    this.heading = lane.axis === 'z' ? (lane.dir > 0 ? 0 : Math.PI) : (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.speed = mr(6, 10); this.cruise = lane.cruise * mr(0.85, 1.15);
  }
  damage(n) { if (this.wrecked) return; this.hp -= n; if (this.hp <= 0) this.wreck(); }
  wreck() {
    this.wrecked = true; this.hp = 0; this.body.material = burntMat; sfx.crash();
    for (let i = 0; i < 8; i++) emitPuff(this.x + mr(-1, 1), 1, this.z + mr(-1, 1), { life: 1.5, vy: mr(1, 3), vx: mr(-2, 2), vz: mr(-2, 2), size0: 1, size1: 4, alpha: 0.7, color: 0x444444 });
    if (this.driver === 'player') { exitCar(true); hurtPlayer(15, this.x, this.z); showMsg('YOUR CAR IS WRECKED'); }
    else if (this.driver === 'hunter') ejectHunter(this, true);
    this.driver = null; this.marker.visible = false;
  }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }
  update(dt) {
    const pd = Math.abs(this.x - player.x) + Math.abs(this.z - player.z);
    this.far = pd > 420 && this.driver !== 'player';
    this.g.visible = pd < 480;
    if (this.far) { // cheap update far from the player
      if (this.driver === 'traffic') { this.x += this.fx * this.cruise * dt; this.z += this.fz * this.cruise * dt; this.wrap(); }
      return;
    }
    let throttle = 0, steer = 0, maxF = 14, brake = false;
    const tp = targetPos();
    if (this.wrecked || !this.driver) {
      brake = true;
      if (this.wrecked) { this.smokeT -= dt; if (this.smokeT < 0) { this.smokeT = 0.25; emitPuff(this.x, 1.4, this.z, { life: 2.5, vy: 2, vx: mr(-0.5, 0.5), size0: 0.8, size1: 3.5, alpha: 0.5, color: 0x333333 }); } }
    } else if (this.driver === 'traffic') {
      maxF = this.cruise; let target = this.cruise;
      for (const o of G.cars) {
        if (o === this || o.far) continue;
        const ax = o.x - this.x, az = o.z - this.z;
        if (Math.abs(ax) > 10 || Math.abs(az) > 10) continue;
        const ahead = ax * this.fx + az * this.fz, side = Math.abs(ax * this.fz - az * this.fx);
        if (ahead > 0 && ahead < 9 && side < 2.2) target = Math.min(target, ahead < 5.5 ? 0 : o.speed * 0.9);
      }
      if (!player.car) {
        const ax = player.x - this.x, az = player.z - this.z, ahead = ax * this.fx + az * this.fz, side = Math.abs(ax * this.fz - az * this.fx);
        if (ahead > 2 && ahead < 11 && side < 1.8) { target = 0; this.honkT -= dt; if (this.honkT < 0 && ahead < 9) { this.honkT = 2.5; if (G.mode === 'playing') sfx.horn(); } }
      }
      throttle = this.speed < target ? 1 : 0; brake = this.speed > target + 0.5;
      this.wrap();
    } else if (this.driver === 'hunter') {
      maxF = 19 * Math.min(1.25, dayMult());
      const dx = tp.x - this.x, dz = tp.z - this.z, d = Math.hypot(dx, dz);
      let ax = tp.x, az = tp.z;
      if (d > 20 && !los(this.x, this.z, tp.x, tp.z)) { const n = navTarget(this.x + this.fx * 3, this.z + this.fz * 3, 4); if (n) { ax = n.x; az = n.z; } }
      const diff = angDiff(this.heading, Math.atan2(ax - this.x, az - this.z));
      steer = clamp(diff * 2.2, -1, 1); throttle = Math.abs(diff) > 1.3 ? 0.5 : 1;
      if (this.reverseT > 0) { this.reverseT -= dt; throttle = -1; steer = -steer; }
      else if (Math.abs(this.speed) < 1.2) { this.stuckT += dt; if (this.stuckT > 1) { this.reverseT = 1.3; this.stuckT = 0; } }
      else this.stuckT = 0;
    } else if (this.driver === 'player') {
      maxF = 28;
      throttle = input.fwd; steer = -input.side; brake = input.jump;
      if (throttle < 0 && this.speed > 1) { brake = true; throttle = 0; }
    }
    if (throttle > 0) this.speed += throttle * (this.driver === 'player' ? 13 : 9) * dt;
    else if (throttle < 0) this.speed = Math.max(-8, this.speed + throttle * 9 * dt);
    if (brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 22 * dt);
    this.speed -= this.speed * 0.2 * dt;
    if (!throttle && !brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2 * dt);
    this.speed = clamp(this.speed, -8, maxF);
    this.heading += steer * 1.9 * clamp(this.speed / 6, -1, 1) * dt;
    this.x += this.fx * this.speed * dt; this.z += this.fz * this.speed * dt;
    let hitWall = false;
    for (const off of [1.25, -1.25]) {
      const c = { x: this.x + this.fx * off, z: this.z + this.fz * off }, ox = c.x, oz = c.z;
      if (resolveCircle(c, 1.05)) { this.x += c.x - ox; this.z += c.z - oz; hitWall = true; }
    }
    if (hitWall && Math.abs(this.speed) > 2) {
      const impact = Math.abs(this.speed);
      if (impact > 9) { this.damage((impact - 8) * 3); if (this.driver === 'player') { G.shake = 0.4; sfx.crash(); } }
      this.speed *= 0.35;
    }
    this.g.position.set(this.x, 0, this.z);
    this.g.rotation.y = this.heading;
    this.marker.visible = this.driver === 'hunter';
  }
  wrap() {
    const l = this.lane; if (!l) return;
    const along = l.axis === 'z' ? this.z : this.x;
    const over = l.dir > 0 ? along > l.a1 + 2 : along < l.a0 - 2;
    if (!over) return;
    const back = l.dir > 0 ? l.a0 : l.a1;
    const bx = l.axis === 'z' ? this.x : back, bz = l.axis === 'z' ? back : this.z;
    if (Math.hypot(bx - player.x, bz - player.z) > 40) { this.x = bx; this.z = bz; }
    else this.speed = 0;
  }
}

function carInteractions() {
  const cars = G.cars.filter((c) => !c.far);
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (Math.abs(a.x - b.x) > 6 || Math.abs(a.z - b.z) > 6) continue;
    let touched = false;
    for (const oa of [1.25, -1.25]) for (const ob of [1.25, -1.25]) {
      const ax = a.x + a.fx * oa, az = a.z + a.fz * oa, bx = b.x + b.fx * ob, bz = b.z + b.fz * ob;
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
      if (d < 2.1 && d > 1e-4) { const k = ((2.1 - d) / d) * 0.5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; touched = true; }
    }
    if (touched) {
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 8) { a.damage(rel * 1.5); b.damage(rel * 1.5); if (a.driver === 'player' || b.driver === 'player') { sfx.crash(); G.shake = 0.35; } }
      a.speed *= 0.6; b.speed *= 0.6;
    }
  }
  for (const c of cars) {
    const sp = Math.abs(c.speed);
    for (const h of G.hunters) {
      if (h.dead || Math.abs(h.x - c.x) > 3.5 || Math.abs(h.z - c.z) > 3.5) continue;
      const before = { x: h.x, z: h.z };
      if (resolveCircleCar(before, 0.4, c)) {
        if (sp > 5) { h.die({ x: c.fx * c.speed * 0.9 + mr(-1, 1), y: 3 + sp * 0.3, z: c.fz * c.speed * 0.9 + mr(-1, 1) }, 0.8, c.driver === 'player'); sfx.thud(); if (c.driver === 'player') c.damage(2); }
        else { h.x = before.x; h.z = before.z; }
      }
    }
    if (!player.car && player.alive && c.driver !== 'player') {
      const p = { x: player.x, z: player.z };
      if (resolveCircleCar(p, 0.4, c)) {
        if (sp > 5 && player.carHitCd <= 0 && player.y < 0.9) {
          player.carHitCd = 1.2;
          hurtPlayer(Math.min(55, sp * 2.4), c.x - c.fx * 3, c.z - c.fz * 3, 6 + sp * 0.5);
          sfx.thud(); c.speed *= 0.5;
        } else { player.x = p.x; player.z = p.z; }
      }
    }
  }
}
function ejectHunter(car, dead) {
  const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
  const p = { x: car.x - rx * 2, z: car.z - rz * 2 };
  resolveCircle(p, 0.4);
  const h = new Hunter(p.x, p.z, 'civ', false, 'chase');
  h.stun = 0.9; G.hunters.push(h);
  if (dead) h.die({ x: -rx * 4, y: 3, z: -rz * 4 }, 1);
}
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of G.cars) { if (c.wrecked || c.far) continue; const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function enterCar() {
  const c = nearestCar(3.6);
  if (!c) return;
  if (c.driver === 'traffic' || c.driver === 'hunter') { ejectHunter(c, false); showMsg('CAR STOLEN'); addHeat(10); }
  c.driver = 'player'; c.lane = null; player.car = c; player.dragT = 0; player.camOff = 0;
  player.yaw = c.heading + Math.PI;
  sfx.pickup();
}
function exitCar(forced = false) {
  const c = player.car; if (!c) return;
  if (!forced && Math.abs(c.speed) > 6) return;
  const rx = Math.cos(c.heading), rz = -Math.sin(c.heading);
  const p = { x: c.x - rx * 2.2, z: c.z - rz * 2.2 };
  resolveCircle(p, 0.4);
  if (resolveCircleCar(p, 0.4, c)) { p.x = c.x + rx * 2.2; p.z = c.z + rz * 2.2; resolveCircle(p, 0.4); }
  player.x = p.x; player.z = p.z; player.y = 0; player.vy = 0;
  player.yaw = c.heading + Math.PI; player.pitch = 0;
  if (!c.wrecked) c.driver = null;
  player.car = null;
}

// =====================================================================
// Police aircraft: helicopters with searchlights, and drones
// =====================================================================
const spotPool = [0, 1, 2].map(() => {
  const s = new THREE.SpotLight(0xeef4ff, 0, 160, 0.2, 0.5, 0);
  s.target = new THREE.Object3D(); scene.add(s, s.target); s.userData.used = false; return s;
});
const beamGeo = new THREE.CylinderGeometry(0.35, 1, 1, 18, 1, true).translate(0, -0.5, 0);
const discGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
const blinkRed = new THREE.SpriteMaterial({ map: puffTex, color: 0xff2020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const blinkBlue = new THREE.SpriteMaterial({ map: puffTex, color: 0x3060ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const UP = new THREE.Vector3(0, -1, 0), _bv = new THREE.Vector3();

class Aircraft {
  constructor(kind, x, z) {
    this.kind = kind; this.x = x; this.z = z; this.vx = 0; this.vz = 0; this.yaw = 0; this.t = Math.random() * 100;
    this.phase = Math.random() * Math.PI * 2; this.state = 'search'; this.lostT = 0; this.bx = x; this.bz = z;
    this.leaving = false; this.dead = false; this.crashing = false; this.vy = 0; this.fireCd = 3; this.seeT = 0; this.wp = null;
    this.g = new THREE.Group(); scene.add(this.g);
    const dark = lam(0x1d2a4a), white = lam(0xe8e8ee), black = lam(0x151515);
    const add = (geo, mat, x2, y2, z2, parent = this.g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x2, y2, z2); parent.add(m); return m; };
    if (kind === 'heli') {
      this.y = 50; this.hp = 26; this.radius = 2.8;
      add(new THREE.BoxGeometry(2.4, 2.2, 5), dark, 0, 0, 0);
      add(new THREE.BoxGeometry(2.3, 1.3, 1.8), lam(0x6a8aaa), 0, 0.2, 2.6);
      add(new THREE.BoxGeometry(2.42, 0.5, 5.02), white, 0, -0.4, 0);
      add(new THREE.BoxGeometry(0.5, 0.6, 5.5), dark, 0, 0.4, -5);
      add(new THREE.BoxGeometry(0.15, 1.6, 1.0), dark, 0, 1.1, -7.4);
      for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.15, 0.15, 4.2), black, s * 1.1, -1.6, 0.3); add(new THREE.BoxGeometry(0.12, 0.6, 0.12), black, s * 1.1, -1.3, 1.4); add(new THREE.BoxGeometry(0.12, 0.6, 0.12), black, s * 1.1, -1.3, -0.8); }
      this.rotor = new THREE.Group(); this.rotor.position.set(0, 1.45, 0.2); this.g.add(this.rotor);
      add(new THREE.BoxGeometry(12, 0.08, 0.45), black, 0, 0, 0, this.rotor); add(new THREE.BoxGeometry(0.45, 0.08, 12), black, 0, 0, 0, this.rotor);
      this.tail = new THREE.Group(); this.tail.position.set(0.3, 0.6, -7.4); this.g.add(this.tail);
      add(new THREE.BoxGeometry(0.06, 2.2, 0.25), black, 0, 0, 0, this.tail);
      this.spot = spotPool.find((s) => !s.userData.used) || null;
      if (this.spot) this.spot.userData.used = true;
      this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      scene.add(this.beam);
      this.disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xeef4ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(this.disc);
    } else {
      this.y = 18; this.hp = 2; this.radius = 0.8;
      add(new THREE.BoxGeometry(0.7, 0.25, 0.7), lam(0x2a2a30), 0, 0, 0);
      add(new THREE.BoxGeometry(0.25, 0.2, 0.25), black, 0, -0.2, 0.2);
      this.props = [];
      for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
        add(new THREE.BoxGeometry(0.5, 0.06, 0.08), black, dx / 2, 0, dz / 2).rotation.y = Math.atan2(dx, dz);
        const pr = add(new THREE.BoxGeometry(0.55, 0.02, 0.06), lam(0x888888), dx, 0.12, dz); this.props.push(pr);
      }
      this.disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(this.disc);
    }
    this.lr = new THREE.Sprite(blinkRed); this.lb = new THREE.Sprite(blinkBlue);
    const ls = kind === 'heli' ? 1.2 : 0.6;
    this.lr.scale.setScalar(ls); this.lb.scale.setScalar(ls);
    this.lr.position.set(-0.5, kind === 'heli' ? -1.2 : 0.1, kind === 'heli' ? 2 : 0); this.lb.position.set(0.5, this.lr.position.y, this.lr.position.z);
    this.g.add(this.lr, this.lb);
  }
  remove() {
    this.dead = true; scene.remove(this.g);
    if (this.beam) scene.remove(this.beam);
    if (this.disc) scene.remove(this.disc);
    if (this.spot) { this.spot.intensity = 0; this.spot.userData.used = false; }
  }
  damage(n) {
    if (this.crashing) return;
    this.hp -= n; sfx.hit();
    if (this.hp <= 0) {
      this.crashing = true; this.vy = 0; addHeat(this.kind === 'heli' ? 40 : 8);
      showMsg(this.kind === 'heli' ? 'HELICOPTER DOWN' : 'DRONE DOWN');
      if (this.beam) this.beam.visible = false;
      if (this.spot) this.spot.intensity = 0;
    }
  }
  update(dt) {
    this.t += dt;
    const heli = this.kind === 'heli';
    const blink = Math.sin(this.t * 9) > 0;
    this.lr.visible = blink; this.lb.visible = !blink;
    if (this.rotor) this.rotor.rotation.y += dt * 28;
    if (this.tail) this.tail.rotation.x += dt * 40;
    if (this.props) for (const p of this.props) p.rotation.y += dt * 50;
    if (this.crashing) {
      this.vy -= 12 * dt; this.y += this.vy * dt; this.g.rotation.y += dt * (heli ? 4 : 8); this.g.rotation.z += dt;
      if (Math.random() < 0.6) emitPuff(this.x, this.y, this.z, { life: 1.6, vy: 1, size0: 1, size1: heli ? 5 : 2, alpha: 0.6, color: 0x333333 });
      this.g.position.set(this.x, this.y, this.z);
      if (this.y <= maxHeightNear(this.x, this.z) * 0 + 0.5) {
        sfx.explode();
        for (let i = 0; i < (heli ? 22 : 8); i++) emitPuff(this.x + mr(-2, 2), 1, this.z + mr(-2, 2), { life: 2.2, vy: mr(2, 6), vx: mr(-4, 4), vz: mr(-4, 4), size0: 2, size1: heli ? 9 : 3, alpha: 0.7, color: i % 3 ? 0x444444 : 0xffa040 });
        for (const h of G.hunters) if (Math.hypot(h.x - this.x, h.z - this.z) < (heli ? 9 : 3)) h.die({ x: (h.x - this.x) * 2, y: 6, z: (h.z - this.z) * 2 }, 1);
        if (!player.car && Math.hypot(player.x - this.x, player.z - this.z) < (heli ? 8 : 2.5)) hurtPlayer(heli ? 45 : 15, this.x, this.z, 12);
        this.remove();
      }
      if (this.disc) this.disc.visible = false;
      return;
    }
    const tp = targetPos(), py = playerEyeY();
    // where the light / camera is pointing
    if (this.state === 'track' && !this.leaving) { this.bx = lerp(this.bx, tp.x, Math.min(1, dt * 4)); this.bz = lerp(this.bz, tp.z, Math.min(1, dt * 4)); }
    else if (heli) {
      const R = searchRadius();
      this.bx = G.lkp.x + Math.cos(this.t * 0.45 + this.phase) * R * 0.8 + Math.sin(this.t * 1.3) * R * 0.2;
      this.bz = G.lkp.z + Math.sin(this.t * 0.37 + this.phase) * R * 0.8 + Math.cos(this.t * 1.1) * R * 0.2;
    }
    // where to fly
    let hx, hz;
    if (this.leaving) { hx = this.x + (this.x - tp.x) * 2; hz = this.z + (this.z - tp.z) * 2; }
    else if (heli) { const a = this.phase + this.t * 0.12; hx = this.bx + Math.cos(a) * 22; hz = this.bz + Math.sin(a) * 22; }
    else {
      if (this.state === 'track') { hx = tp.x + Math.cos(this.phase) * 5; hz = tp.z + Math.sin(this.phase) * 5; }
      else {
        if (!this.wp || Math.hypot(this.wp.x - this.x, this.wp.z - this.z) < 3) { const R = searchRadius(); this.wp = { x: G.lkp.x + mr(-R, R), z: G.lkp.z + mr(-R, R) }; }
        hx = this.wp.x; hz = this.wp.z;
      }
      this.bx = this.x; this.bz = this.z;
    }
    const maxV = heli ? (this.state === 'track' ? 30 : 24) : (this.state === 'track' ? 16 : 11);
    const ddx = hx - this.x, ddz = hz - this.z, dd = Math.hypot(ddx, ddz) || 1;
    const want = Math.min(maxV, dd * 0.8);
    this.vx = lerp(this.vx, (ddx / dd) * want, Math.min(1, dt * 1.5)); this.vz = lerp(this.vz, (ddz / dd) * want, Math.min(1, dt * 1.5));
    this.x += this.vx * dt; this.z += this.vz * dt;
    const floorY = maxHeightNear(this.x, this.z) + (heli ? 16 : 6);
    const ty = Math.max(heli ? 48 : (this.state === 'track' ? 11 : 18), floorY);
    this.y = lerp(this.y, ty, Math.min(1, dt * 1.2));
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 1) this.yaw += angDiff(this.yaw, Math.atan2(this.vx, this.vz)) * Math.min(1, dt * 2);
    this.g.position.set(this.x, this.y, this.z);
    this.g.rotation.set(sp * 0.012, this.yaw, 0, 'YXZ');
    if (this.leaving && Math.hypot(this.x - tp.x, this.z - tp.z) > 320) { this.remove(); return; }

    // detection
    if (!this.leaving && player.alive) {
      const fromY = this.y - (heli ? 1.5 : 0.4);
      const see = los3D(this.x, fromY, this.z, tp.x, py, tp.z);
      const near = heli ? Math.hypot(this.bx - tp.x, this.bz - tp.z) < 9 : Math.hypot(this.x - tp.x, this.z - tp.z) < 17;
      if (this.state !== 'track') {
        if (near && see) { this.seeT += dt; if (this.seeT > 0.25) { this.state = 'track'; this.lostT = 0; onSpotted(this.kind); } }
        else this.seeT = 0;
      } else {
        const dist = Math.hypot(this.x - tp.x, this.z - tp.z);
        if (see && dist < (heli ? 160 : 40)) { this.lostT = 0; reportSighting(tp.x, tp.z); G.airTracking++; }
        else { this.lostT += dt; if (this.lostT > (heli ? 3 : 2)) { this.state = 'search'; if (heli) showMsg('THE HELICOPTER LOST YOU'); } }
        if (heli && G.level >= 4 && see) {
          this.fireCd -= dt;
          if (this.fireCd <= 0) { this.fireCd = mr(1.8, 2.8); _from.set(this.x + Math.sin(this.yaw) * 2, this.y - 1.4, this.z + Math.cos(this.yaw) * 2); shootAtPlayer(_from, 0.28, 10, 0xff7050, 40); }
        }
        if (!heli && Math.random() < dt * 1.5) sfx.drone();
      }
    }
    // light visuals
    if (heli) {
      const ox = this.x, oy = this.y - 1.4, oz = this.z;
      _bv.set(this.bx - ox, 0.05 - oy, this.bz - oz);
      const len = _bv.length(); _bv.normalize();
      this.beam.position.set(ox, oy, oz);
      this.beam.quaternion.setFromUnitVectors(UP, _bv);
      const r = 8;
      this.beam.scale.set(r, len, r);
      this.beam.material.opacity = (this.state === 'track' ? 0.12 : 0.08) * (0.35 + 0.65 * (1 - G.dayAmt));
      this.disc.position.set(this.bx, groundY(this.bx, this.bz) + 0.08, this.bz); this.disc.scale.setScalar(r);
      this.disc.material.opacity = (this.state === 'track' ? 0.35 : 0.22) * (0.4 + 0.6 * (1 - G.dayAmt));
      this.disc.material.color.set(this.state === 'track' ? 0xffe0e0 : 0xeef4ff);
      if (this.spot) {
        this.spot.position.set(ox, oy, oz); this.spot.target.position.set(this.bx, 0, this.bz);
        this.spot.angle = Math.atan(r / len) * 1.15;
        this.spot.intensity = (this.state === 'track' ? 5 : 3.5) * (0.15 + 0.85 * (1 - G.dayAmt));
      }
    } else {
      this.disc.position.set(this.x, groundY(this.x, this.z) + 0.09, this.z);
      this.disc.scale.setScalar(this.state === 'track' ? 4 : 6);
      this.disc.material.color.set(this.state === 'track' ? 0xff3030 : 0x60a0ff);
    }
  }
}
function onSpotted(kind) {
  addHeat(kind === 'heli' ? 12 : 6);
  if (G.spottedMsgT <= 0) { showMsg(kind === 'heli' ? 'SPOTTED BY A POLICE HELICOPTER' : 'A POLICE DRONE SPOTTED YOU', 2.5); sfx.alarm(); G.spottedMsgT = 6; }
  const tp = targetPos(); alertAround(tp.x, tp.z, 110);
}
function manageAircraft(dt) {
  G.airT -= dt;
  if (G.airT > 0) return;
  G.airT = 2;
  const tp = targetPos();
  for (const [list, want, kind] of [[G.helis, HELIS_AT[G.level], 'heli'], [G.drones, DRONES_AT[G.level], 'drone']]) {
    const active = list.filter((a) => !a.leaving && !a.crashing);
    if (active.length < want) {
      const a = Math.random() * Math.PI * 2, d = kind === 'heli' ? 240 : 140;
      list.push(new Aircraft(kind, tp.x + Math.cos(a) * d, tp.z + Math.sin(a) * d));
      if (kind === 'heli' && active.length === 0) showMsg('A POLICE HELICOPTER IS SEARCHING FOR YOU', 3);
    } else if (active.length > want) active[0].leaving = true;
  }
}

// =====================================================================
// Pickups (relocate near the player so the world always has some)
// =====================================================================
const pickGeo = { health: new THREE.CylinderGeometry(0.18, 0.18, 0.5, 10), ammo: new THREE.BoxGeometry(0.55, 0.32, 0.38) };
const pickMat = { health: new THREE.MeshBasicMaterial({ color: 0x3cff6a }), ammo: new THREE.MeshBasicMaterial({ color: 0xffc83a }) };
function sidewalkPointNear(x, z) {
  const c = cityAt(x, z, 30);
  const cands = c ? blockRects.filter((b) => b.city === c && Math.abs(b.x0 - x) < 220 && Math.abs(b.z0 - z) < 220) : [];
  for (let t = 0; t < 12 && cands.length; t++) {
    const b = mpick(cands), side = Math.floor(Math.random() * 4);
    let px, pz;
    if (side < 2) { px = mr(b.x0 + 1, b.x1 - 1); pz = side ? b.z0 + 1.5 : b.z1 - 1.5; } else { pz = mr(b.z0 + 1, b.z1 - 1); px = side === 2 ? b.x0 + 1.5 : b.x1 - 1.5; }
    if (!pointBlocked(px, pz, 0.5)) return { x: px, z: pz };
  }
  return randomOpenPoint(x, z, 30, 150) || { x, z };
}
class Pickup {
  constructor(kind) { this.kind = kind; this.m = new THREE.Mesh(pickGeo[kind], pickMat[kind]); scene.add(this.m); this.respawnT = 0; this.place(); }
  place() { const tp = targetPos(), p = sidewalkPointNear(tp.x, tp.z); this.x = p.x; this.z = p.z; this.m.visible = true; this.active = true; }
  update(dt, t) {
    if (!this.active) { this.respawnT -= dt; if (this.respawnT <= 0) this.place(); return; }
    if (Math.abs(this.x - player.x) > 320 || Math.abs(this.z - player.z) > 320) { this.place(); return; }
    this.m.position.set(this.x, groundY(this.x, this.z) + 0.75 + Math.sin(t * 3 + this.x) * 0.12, this.z);
    this.m.rotation.y = t * 2;
    if (!player.car && Math.hypot(player.x - this.x, player.z - this.z) < 1.4) {
      if (this.kind === 'health') { if (player.hp >= 100) return; player.hp = Math.min(100, player.hp + 35); player.stam = 100; showMsg('+35 HEALTH'); }
      else { player.reserve = Math.min(180, player.reserve + 24); showMsg('+24 AMMO'); }
      sfx.pickup(); this.active = false; this.m.visible = false; this.respawnT = 35;
    }
  }
}

// =====================================================================
// View model: hands + pistol
// =====================================================================
const vm = new THREE.Group(); vmCamera.add(vm);
const vmSkin = new THREE.MeshLambertMaterial({ color: 0xd99a6c }), vmSleeve = new THREE.MeshLambertMaterial({ color: 0x3a4a3a }), vmGunMat = new THREE.MeshLambertMaterial({ color: 0x202024 });
function makeArm(side) {
  const a = new THREE.Group();
  a.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.55).translate(0, 0, 0.12), vmSleeve), new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.16).translate(0, 0, -0.22), vmSkin));
  a.position.set(side * 0.2, -0.24, -0.42); a.rotation.set(0.05, side * 0.18, 0); vm.add(a); return a;
}
const armR = makeArm(1), armL = makeArm(-1);
const gun = new THREE.Group();
gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.3).translate(0, 0.07, -0.33), vmGunMat), new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.08).translate(0, -0.02, -0.24), vmGunMat));
armR.add(gun);
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
flash.position.set(0, 0.07, -0.55); flash.scale.setScalar(0.25); flash.visible = false; armR.add(flash);
armL.position.set(-0.08, -0.27, -0.42); armL.rotation.set(0.1, -0.5, 0);

// =====================================================================
// Shooting
// =====================================================================
function rayCylinder(o, d, cx, cz, r, y0, y1, maxT) {
  const ox = o.x - cx, oz = o.z - cz, a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-8) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxT) return -1;
  const y = o.y + d.y * t;
  return y >= y0 && y <= y1 ? t : -1;
}
function raySphere(o, d, cx, cy, cz, r, maxT) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz, b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c;
  if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t > 0 && t < maxT ? t : -1;
}
function rayCar(o, d, car, maxT) {
  const s = Math.sin(car.heading), c = Math.cos(car.heading), ox = o.x - car.x, oz = o.z - car.z;
  const lo = { f: ox * s + oz * c, r: ox * c - oz * s, y: o.y }, ld = { f: d.x * s + d.z * c, r: d.x * c - d.z * s, y: d.y };
  let t0 = 0, t1 = maxT;
  for (const [k, mn, mx] of [['f', -car.hl, car.hl], ['r', -car.hw, car.hw], ['y', 0.1, 1.7]]) {
    if (Math.abs(ld[k]) < 1e-8) { if (lo[k] < mn || lo[k] > mx) return -1; continue; }
    let a = (mn - lo[k]) / ld[k], b = (mx - lo[k]) / ld[k]; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
  }
  return t0;
}
const _camDir = new THREE.Vector3();
function playerShoot() {
  if (player.car || !player.alive || player.reloadT > 0 || player.fireCd > 0) return;
  if (player.mag <= 0) { if (player.reserve > 0) startReload(); else { sfx.empty(); showMsg('OUT OF AMMO'); } return; }
  player.mag--; player.fireCd = 0.17; player.recoil = 1;
  sfx.shot(); addHeat(2.5);
  flash.visible = true; flash.material.rotation = Math.random() * 6; setTimeout(() => (flash.visible = false), 45);
  camera.getWorldDirection(_camDir);
  const spread = 0.008 + Math.min(0.03, Math.hypot(player.vx, player.vz) * 0.002);
  _camDir.x += mr(-spread, spread); _camDir.y += mr(-spread, spread); _camDir.z += mr(-spread, spread); _camDir.normalize();
  const o = camera.position;
  let tHit = raycastWorld(o, _camDir, 160).t, target = null, carHit = null, airHit = null;
  for (const h of G.hunters) {
    if (h.dead || Math.abs(h.x - o.x) > 160 || Math.abs(h.z - o.z) > 160) continue;
    const s = h.T.scale, t = rayCylinder(o, _camDir, h.x, h.z, 0.36 * s, 0, 1.95 * s, tHit);
    if (t > 0 && t < tHit) { tHit = t; target = h; carHit = null; }
  }
  for (const c of G.cars) { if (c.far) continue; const t = rayCar(o, _camDir, c, tHit); if (t > 0 && t < tHit) { tHit = t; carHit = c; target = null; } }
  for (const a of [...G.helis, ...G.drones]) { if (a.dead) continue; const t = raySphere(o, _camDir, a.x, a.y, a.z, a.radius, tHit); if (t > 0 && t < tHit) { tHit = t; airHit = a; carHit = null; target = null; } }
  const hitP = o.clone().addScaledVector(_camDir, tHit);
  spawnTracer(new THREE.Vector3(0.2, -0.18, -0.6).applyMatrix4(camera.matrixWorld), hitP);
  if (target) {
    const head = hitP.y > 1.5 * target.T.scale, dl = Math.hypot(_camDir.x, _camDir.z) || 1;
    target.damage(head ? 3 : 1, _camDir.x / dl, _camDir.z / dl, hitP.y);
    sfx.hit();
    emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.25, vy: 0.3, size0: 0.15, size1: 0.6, alpha: 0.9, color: 0xffffff });
    if (target.dead) showMsg(head ? 'HEADSHOT' : 'TAKEDOWN');
  } else if (carHit) {
    carHit.damage(5);
    emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.3, vy: 0.4, size0: 0.15, size1: 0.6, alpha: 0.9, color: 0xffe0a0 });
    if (carHit.driver === 'traffic') carHit.driver = 'hunter';
  } else if (airHit) {
    airHit.damage(1);
    emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.3, vy: 0, size0: 0.3, size1: 1, alpha: 0.9, color: 0xffe0a0 });
  } else emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.5, vy: 0.6, size0: 0.2, size1: 0.9, alpha: 0.6, color: 0xbbbbbb });
  alertAround(player.x, player.z, 45, 1);
}
function startReload() { if (player.reloadT > 0 || player.mag >= 12 || player.reserve <= 0 || player.car) return; player.reloadT = 1.3; sfx.reload(); }
function playerShove() {
  if (player.car || player.shoveCd > 0 || !player.alive) return;
  player.shoveCd = 0.55; player.shoveAnim = 1; sfx.shove();
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (const h of G.hunters) {
    if (h.dead) continue;
    const dx = h.x - player.x, dz = h.z - player.z, d = Math.hypot(dx, dz);
    if (d < 2.8 && (dx * fx + dz * fz) / (d || 1) > 0.25) { h.kx += (dx / d) * 13 * h.T.knock; h.kz += (dz / d) * 13 * h.T.knock; h.stun = Math.max(h.stun, h.T.stun); h.alert(); }
  }
}

// =====================================================================
// Input
// =====================================================================
const input = { fwd: 0, side: 0, sprint: false, jump: false, runToggle: false };
const keys = new Set();
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const stick = { id: null, cx: 0, cy: 0 };
let touchJump = false, lookTouch = null;
function recomputeKeys() {
  if (isTouch && stick.id !== null) return;
  input.fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  input.side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || input.runToggle;
  input.jump = keys.has('Space') || touchJump;
}
window.addEventListener('keydown', (e) => {
  if (G.mode !== 'playing') return;
  keys.add(e.code); recomputeKeys();
  if (e.code === 'KeyE') { player.car ? exitCar() : enterCar(); }
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyF') playerShove();
  if (e.code === 'KeyM') G.bigMap = !G.bigMap;
  if (e.code === 'Escape' || e.code === 'KeyP') pauseGame();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); recomputeKeys(); });
window.addEventListener('blur', () => { keys.clear(); recomputeKeys(); });
function look(dx, dy, sens) {
  if (player.car) { player.camOff -= dx * sens; return; }
  player.yaw -= dx * sens; player.pitch = clamp(player.pitch - dy * sens, -1.45, 1.45);
}
let hadLock = false, lockFailed = false;
document.addEventListener('mousemove', (e) => {
  if (G.mode !== 'playing') return;
  if (document.pointerLockElement === canvas) look(e.movementX, e.movementY, 0.0022);
  else if (lockFailed && e.buttons) look(e.movementX, e.movementY, 0.004);
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; });
canvas.addEventListener('mousedown', (e) => {
  if (isTouch || G.mode !== 'playing') return;
  if (document.pointerLockElement !== canvas && !lockFailed) { lockPointer(); return; }
  if (e.button === 0) playerShoot();
  if (e.button === 2) playerShove();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function lockPointer() {
  if (isTouch) return;
  if (!canvas.requestPointerLock) { lockFailed = true; return; }
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { lockFailed = true; }); } catch { lockFailed = true; }
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { hadLock = true; return; }
  if (hadLock && !isTouch && G.mode === 'playing') pauseGame();
  hadLock = false;
});
if (isTouch) {
  document.body.classList.add('is-touch');
  $('controls-desktop').classList.add('hidden'); $('controls-touch').classList.remove('hidden');
  const stickEl = $('stick'), knob = $('stick-knob');
  window.addEventListener('touchstart', (e) => {
    if (G.mode !== 'playing') return;
    for (const t of e.changedTouches) {
      if (t.target.classList && t.target.classList.contains('tbtn')) continue;
      if (t.clientX < window.innerWidth * 0.45 && stick.id === null) { const r = stickEl.getBoundingClientRect(); stick.id = t.identifier; stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2; }
      else if (lookTouch === null) lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) {
        let dx = (t.clientX - stick.cx) / 55, dy = (t.clientY - stick.cy) / 55; const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        input.side = dx; input.fwd = -dy; input.sprint = input.runToggle || l > 0.98;
        knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
      } else if (lookTouch && t.identifier === lookTouch.id) { look(t.clientX - lookTouch.x, t.clientY - lookTouch.y, 0.0055); lookTouch.x = t.clientX; lookTouch.y = t.clientY; }
    }
  }, { passive: true });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) { stick.id = null; input.fwd = input.side = 0; input.sprint = input.runToggle; knob.style.transform = ''; }
      if (lookTouch && t.identifier === lookTouch.id) lookTouch = null;
    }
  };
  window.addEventListener('touchend', endTouch); window.addEventListener('touchcancel', endTouch);
  const btn = (id, down, up) => {
    const el = $(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(el); }, { passive: false });
    if (up) el.addEventListener('touchend', (e) => { e.preventDefault(); up(el); }, { passive: false });
  };
  let fireHeld = null;
  btn('btn-fire', () => { playerShoot(); clearInterval(fireHeld); fireHeld = setInterval(playerShoot, 220); }, () => clearInterval(fireHeld));
  btn('btn-shove', playerShove);
  btn('btn-jump', () => { touchJump = true; input.jump = true; }, () => { touchJump = false; input.jump = false; });
  btn('btn-run', (el) => { input.runToggle = !input.runToggle; input.sprint = input.runToggle; el.classList.toggle('on', input.runToggle); });
  btn('btn-car', () => (player.car ? exitCar() : enterCar()));
  btn('btn-reload', startReload);
  btn('btn-pause', pauseGame);
  btn('btn-map', () => (G.bigMap = !G.bigMap));
}

// =====================================================================
// HUD
// =====================================================================
const hud = {
  city: $('hud-city'), day: $('hud-day'), clock: $('hud-clock'), stars: $('hud-stars'), pname: $('hud-pname'), heat: $('hud-heatfill'), air: $('hud-air'),
  time: $('hud-time'), kills: $('hud-kills'), alert: $('hud-alert'), msg: $('hud-msg'), banner: $('hud-banner'),
  hp: $('bar-health'), st: $('bar-stamina'), vig: $('vignette'), ammo: $('hud-ammo'), prompt: $('hud-prompt'),
  carbar: $('carbar'), carhp: $('bar-car'), cross: $('crosshair'), btnCar: $('btn-car'), map: $('minimap'),
};
function showMsg(t, dur = 2) { hud.msg.textContent = t; hud.msg.classList.add('show'); G.msgT = dur; }
let bannerT = 0;
function showBanner(html, dur = 3) { hud.banner.innerHTML = html; hud.banner.classList.add('show'); bannerT = dur; }

const mm = hud.map.getContext('2d');
function drawMinimap() {
  const big = !!G.bigMap;
  const W = big ? 360 : 170;
  if (hud.map.width !== W) { hud.map.width = W; hud.map.height = W; }
  hud.map.classList.toggle('big', big);
  const tp = targetPos(), range = big ? 700 : (player.car ? 190 : 100), sc = W / 2 / range;
  mm.save();
  mm.clearRect(0, 0, W, W);
  mm.beginPath(); mm.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mm.clip();
  mm.fillStyle = '#3f5c36'; mm.fillRect(0, 0, W, W);
  mm.translate(W / 2, W / 2);
  const yaw = big ? 0 : player.car ? player.car.heading + Math.PI + player.camOff : player.yaw;
  mm.rotate(yaw); mm.scale(sc, sc); mm.translate(-tp.x, -tp.z);
  const inR = (x0, z0, x1, z1, pad) => !(x1 < tp.x - range - pad || x0 > tp.x + range + pad || z1 < tp.z - range - pad || z0 > tp.z + range + pad);
  mm.fillStyle = '#2f5f82'; for (const w of waterRects) if (inR(w.x0, w.z0, w.x1, w.z1, 40)) mm.fillRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0);
  mm.fillStyle = '#34323a';
  for (const c of CITIES) mm.fillRect(c.minX, c.minZ, c.maxX - c.minX, c.maxZ - c.minZ);
  for (const h of HIGHWAYS) { if (h.axis === 'x') mm.fillRect(h.a0, h.fixed - 7, h.a1 - h.a0, 14); else mm.fillRect(h.fixed - 7, h.a0, 14, h.a1 - h.a0); }
  mm.fillStyle = '#7d7886';
  for (const b of blockRects) if (inR(b.x0, b.z0, b.x1, b.z1, 60)) mm.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  if (!big) { mm.fillStyle = '#57535e'; for (const c of colliders) if (c.x1 - c.x0 > 2 && c.z1 - c.z0 > 2 && c.h > 2 && inR(c.x0, c.z0, c.x1, c.z1, 20)) mm.fillRect(c.x0, c.z0, c.x1 - c.x0, c.z1 - c.z0); }
  if (big) { mm.fillStyle = '#fff'; mm.font = `bold ${14 / sc}px Arial`; mm.textAlign = 'center'; for (const c of CITIES) { mm.save(); mm.translate(c.cx, c.cz); mm.fillText(c.name, 0, 0); mm.restore(); } }
  for (const p of G.pickups) if (p.active) { mm.fillStyle = p.kind === 'health' ? '#3cff6a' : '#ffc83a'; mm.fillRect(p.x - 1.5 / sc * 1.2, p.z - 1.5 / sc * 1.2, 3 / sc * 1.2, 3 / sc * 1.2); }
  for (const c of G.cars) {
    if (c.far) continue;
    mm.save(); mm.translate(c.x, c.z); mm.rotate(-c.heading);
    mm.fillStyle = c.driver === 'hunter' ? '#ff3b3b' : c.driver === 'player' ? '#5ab4ff' : c.wrecked ? '#222' : '#e6e6e6';
    mm.fillRect(-1.1, -2.3, 2.2, 4.6); mm.restore();
  }
  const dot = Math.max(1.8, 2.2 / sc);
  for (const h of G.hunters) { if (h.dead) continue; mm.fillStyle = h.type === 'cop' ? '#5a8cff' : h.state === 'chase' ? '#ff3b3b' : '#c9b8b8'; mm.beginPath(); mm.arc(h.x, h.z, h.state === 'chase' ? dot * 1.2 : dot, 0, Math.PI * 2); mm.fill(); }
  for (const a of [...G.helis, ...G.drones]) {
    if (a.dead) continue;
    if (a.kind === 'heli') { mm.fillStyle = a.state === 'track' ? 'rgba(255,80,80,.35)' : 'rgba(230,240,255,.3)'; mm.beginPath(); mm.arc(a.bx, a.bz, 9, 0, Math.PI * 2); mm.fill(); }
    mm.fillStyle = '#fff'; mm.strokeStyle = '#1d2a4a'; mm.lineWidth = 1 / sc;
    mm.beginPath(); mm.arc(a.x, a.z, (a.kind === 'heli' ? 4 : 2.4) / sc * 1.4, 0, Math.PI * 2); mm.fill(); mm.stroke();
  }
  mm.restore();
  mm.save(); mm.translate(W / 2, W / 2); if (big) mm.rotate(-(player.car ? player.car.heading + Math.PI + player.camOff : player.yaw));
  mm.fillStyle = '#5ab4ff'; mm.strokeStyle = '#fff'; mm.lineWidth = 1.5;
  mm.beginPath(); mm.moveTo(0, -8); mm.lineTo(6, 6); mm.lineTo(0, 3); mm.lineTo(-6, 6); mm.closePath(); mm.fill(); mm.stroke();
  mm.restore();
}

let hudT = 0;
function updateHUD(dt) {
  hudT -= dt;
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0) hud.msg.classList.remove('show'); }
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) hud.banner.classList.remove('show'); }
  G.hurtFlash = Math.max(0, G.hurtFlash - dt * 1.4);
  hud.vig.style.opacity = Math.max(G.hurtFlash, player.hp < 30 ? 0.35 + Math.sin(G.elapsed * 6) * 0.1 : 0).toFixed(2);
  hud.hp.style.width = player.hp + '%'; hud.st.style.width = player.stam + '%'; hud.st.style.opacity = player.exhausted ? 0.45 : 1;
  drawMinimap();
  if (hudT > 0) return;
  hudT = 0.1;
  hud.city.textContent = G.locale;
  hud.day.textContent = `DAY ${Math.min(G.day, CFG.days)} / ${CFG.days}`;
  const hh = Math.floor(G.hour), mn = Math.floor(((G.hour - hh) * 60) / 15) * 15;
  hud.clock.textContent = String(hh).padStart(2, '0') + ':' + String(mn).padStart(2, '0') + (G.dayAmt < 0.3 ? ' · NIGHT' : '');
  hud.stars.innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i < G.level ? 'on' : ''}">★</span>`).join('');
  hud.pname.textContent = LEVEL_NAMES[G.level];
  const lo = LEVELS[G.level], hi = LEVELS[G.level + 1] ?? 330;
  hud.heat.style.width = (clamp((G.heat - lo) / (hi - lo), 0, 1) * 100).toFixed(0) + '%';
  const nh = G.helis.filter((a) => !a.dead && !a.leaving).length, nd = G.drones.filter((a) => !a.dead && !a.leaving).length;
  hud.air.textContent = nh || nd ? `${nh ? nh + (nh > 1 ? ' HELICOPTERS' : ' HELICOPTER') : ''}${nh && nd ? ' · ' : ''}${nd ? nd + (nd > 1 ? ' DRONES' : ' DRONE') : ''} SEARCHING` : '';
  hud.time.textContent = fmtTime(G.elapsed) + ' survived';
  hud.kills.textContent = G.kills ? G.kills + (G.kills === 1 ? ' takedown' : ' takedowns') : '';
  const chasing = G.hunters.filter((h) => !h.dead && h.state === 'chase').length + G.cars.filter((c) => c.driver === 'hunter').length;
  if (G.airTracking) { hud.alert.textContent = 'TRACKED FROM THE AIR'; hud.alert.className = 'hot'; }
  else if (chasing) { hud.alert.textContent = `${chasing} HUNTING YOU`; hud.alert.className = 'hot'; }
  else if (G.lastSeenT > 10) { hud.alert.textContent = 'HIDDEN'; hud.alert.className = 'calm'; }
  else { hud.alert.textContent = 'THEY LOST SIGHT OF YOU'; hud.alert.className = 'warm'; }
  hud.ammo.innerHTML = player.car ? '' : player.reloadT > 0 ? 'RELOADING…' : `<b>${player.mag}</b> / ${player.reserve}`;
  hud.carbar.classList.toggle('hidden', !player.car);
  if (player.car) hud.carhp.style.width = player.car.hp + '%';
  hud.cross.classList.toggle('hidden', !!player.car);
  let prompt = '';
  if (player.car) prompt = Math.abs(player.car.speed) > 6 ? '' : (isTouch ? 'Tap CAR to get out' : 'Press E to get out');
  else if (nearestCar(3.6)) prompt = isTouch ? 'Tap CAR to steal it' : 'Press E to steal this car';
  hud.prompt.textContent = prompt;
  if (hud.btnCar) hud.btnCar.classList.toggle('hidden', !(player.car || nearestCar(3.6)));
}

// =====================================================================
// Lighting
// =====================================================================
const C_NIGHT = new THREE.Color(0x0b0e1e), C_DAY = new THREE.Color(0x9cc0e4), C_DUSK = new THREE.Color(0xe0907a), C_DUSK2 = new THREE.Color(0x7a5a9a);
const C_SUN_DAY = new THREE.Color(0xfff0dd), C_SUN_DUSK = new THREE.Color(0xff9a55), C_HEMI = new THREE.Color(0xc8d0ff);
const beaconMat = new THREE.SpriteMaterial({ map: puffTex, color: 0xff2a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const beaconSprites = beacons.map((b) => { const s = new THREE.Sprite(beaconMat); s.position.set(b.x, b.y, b.z); s.scale.setScalar(2.2); scene.add(s); return s; });
function updateLighting(t) {
  const h = G.hour, elev = Math.sin(((h - 6) / 12) * Math.PI);
  const dayAmt = smoothstep(-0.22, 0.22, elev), dusk = Math.exp(-Math.pow((elev - 0.02) / 0.22, 2));
  G.dayAmt = dayAmt;
  const sky = C_NIGHT.clone().lerp(C_DAY, dayAmt).lerp(h > 12 ? C_DUSK2 : C_DUSK, dusk * 0.7);
  scene.background.copy(sky); scene.fog.color.copy(sky);
  scene.fog.near = lerp(15, 40, dayAmt); scene.fog.far = lerp(200, 420, dayAmt);
  hemi.intensity = 0.55 + dayAmt * 0.65 + dusk * 0.15;
  hemi.color.copy(C_NIGHT).lerp(C_HEMI, 0.5 + dayAmt * 0.5);
  sun.intensity = dayAmt * 1.3 + dusk * 0.35;
  sun.color.copy(C_SUN_DAY).lerp(C_SUN_DUSK, dusk);
  const ang = ((h - 6) / 12) * Math.PI;
  sun.position.set(camera.position.x + Math.cos(ang) * 150, Math.max(20, Math.sin(ang) * 160), camera.position.z + 60);
  sun.target.position.set(camera.position.x, 0, camera.position.z); sun.target.updateMatrixWorld();
  const win = 0.04 + (1 - dayAmt) * 1.05 + dusk * 0.2;
  for (const m of emissiveFacades) m.emissiveIntensity = win;
  const blink = Math.sin(t * 3) > 0.2;
  beaconMat.opacity = blink ? 1 : 0.15;
  for (const a of animated) a.obj.rotation.z += a.spin * 0.016;
}

// =====================================================================
// Game flow
// =====================================================================
function localeFactor(x, z) { const c = cityAt(x, z, 20); return c ? c.pop : 0.3; }
function spawnHunter(minD = 55, maxD = 150, state = 'search') {
  const tp = targetPos();
  let p = null;
  for (let t = 0; t < 12 && !p; t++) {
    const c = randomOpenPoint(tp.x, tp.z, minD, maxD, 4);
    if (c && !(Math.hypot(c.x - tp.x, c.z - tp.z) < 70 && los(c.x, c.z, tp.x, tp.z))) p = c;
  }
  if (!p) return;
  const r = Math.random(), copChance = G.level >= 2 ? (G.level - 1) * 0.08 : 0;
  const type = r < copChance ? 'cop' : r < copChance + 0.15 ? 'brute' : r < copChance + 0.4 ? 'runner' : 'civ';
  const gunner = type !== 'brute' && Math.random() < Math.min(0.08 + (G.day - 1) * 0.022, 0.5);
  G.hunters.push(new Hunter(p.x, p.z, type, gunner, state));
}
const targetHunters = () => { const tp = targetPos(); return Math.round(Math.min(22 + G.day * 5, 85) * localeFactor(tp.x, tp.z)); };

function clearWorld() {
  for (const h of G.hunters) h.remove(); G.hunters.length = 0;
  for (const r of ragdolls) r.dispose(); ragdolls.length = 0;
  for (const c of G.cars) scene.remove(c.g); G.cars.length = 0;
  for (const a of [...G.helis, ...G.drones]) a.remove(); G.helis.length = 0; G.drones.length = 0;
}
function spawnTraffic(count) {
  const total = lanes.reduce((s, l) => s + (l.a1 - l.a0), 0);
  for (let i = 0; i < count; i++) {
    for (let t = 0; t < 20; t++) {
      let r = Math.random() * total, lane = lanes[0];
      for (const l of lanes) { r -= l.a1 - l.a0; if (r <= 0) { lane = l; break; } }
      const along = mr(lane.a0, lane.a1);
      const x = lane.axis === 'z' ? lane.fixed : along, z = lane.axis === 'z' ? along : lane.fixed;
      if (Math.hypot(x - player.x, z - player.z) < 14) continue;
      if (G.cars.some((c) => Math.abs(c.x - x) < 12 && Math.abs(c.z - z) < 12)) continue;
      G.cars.push(new Car(lane, along)); break;
    }
  }
  for (const p of parkedSpots) G.cars.push(new Car(null, 0, p));
}
function resetGame() {
  clearWorld();
  Object.assign(player, { x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, yaw: Math.PI / 4, pitch: 0, hp: 100, stam: 100, exhausted: false, lastHurt: 99, shoveCd: 0, kx: 0, kz: 0, alive: true, car: null, mag: 12, reserve: 48, reloadT: 0, fireCd: 0, dragT: 0, carHitCd: 0, camOff: 0 });
  Object.assign(G, { elapsed: 0, day: 1, kills: 0, pingT: 40, spawnT: 0, flowT: 0, hunterCarT: 30, overT: 0, shake: 0, hurtFlash: 0, heat: 0, level: 0, lastSeenT: 99, airT: 3, locale: '', localeT: 0, bigMap: false });
  G.lkp = { x: 0, z: 0 };
  spawnTraffic(70);
  navRecenter(0, 0, true); computeFlow(0, 0);
  for (let i = 0; i < targetHunters(); i++) spawnHunter(40, 170);
  if (!G.pickups.length) { for (let i = 0; i < 10; i++) G.pickups.push(new Pickup('health')); for (let i = 0; i < 10; i++) G.pickups.push(new Pickup('ammo')); }
  else for (const p of G.pickups) p.place();
}
function startGame() {
  initAudio(); resetGame();
  G.mode = 'playing';
  for (const id of ['menu', 'over', 'pause']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  lockPointer();
  showBanner(`DAY 1<small>EVERYONE IS AFTER THE BOUNTY ON YOUR HEAD</small>`, 3.5);
}
function pauseGame() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused'; keys.clear(); recomputeKeys();
  $('pause').classList.remove('hidden');
  setAircraftVolume(0, 0);
}
function resumeGame() { initAudio(); G.mode = 'playing'; $('pause').classList.add('hidden'); lockPointer(); }
function toMenu() {
  G.mode = 'menu';
  for (const id of ['pause', 'over', 'hud', 'touch']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  setAircraftVolume(0, 0); showBest();
}
function killPlayer() { if (!player.alive) return; player.alive = false; if (player.car) exitCar(true); G.overT = 1.8; }
function loadBest() { try { return JSON.parse(localStorage.getItem('hunted.best') || 'null'); } catch { return null; } }
function endGame(won) {
  G.mode = 'over';
  if (document.exitPointerLock) document.exitPointerLock();
  setAircraftVolume(0, 0);
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  const days = won ? CFG.days : G.day;
  $('over-title').textContent = won ? 'YOU SURVIVED' : 'CAUGHT';
  $('over-text').textContent = won ? '30 days. Three towns came for you and nobody collected.' : `Somebody in ${G.locale === 'COUNTRYSIDE' || G.locale.startsWith('ROUTE') ? 'the middle of nowhere' : G.locale} just got very rich.`;
  $('over-stats').innerHTML = `Reached <b>Day ${days}</b> of ${CFG.days}<br>Survived <b>${fmtTime(G.elapsed)}</b><br><b>${G.kills}</b> hunters taken down<br>Peak profile: <b>${LEVEL_NAMES[G.peak || 0]}</b>`;
  const best = loadBest();
  try { if (!best || G.elapsed > best.time) localStorage.setItem('hunted.best', JSON.stringify({ time: G.elapsed, day: days, kills: G.kills })); } catch { /* storage unavailable */ }
  $('over').classList.remove('hidden');
}
function showBest() { const b = loadBest(); $('best').textContent = b ? `Best run: Day ${b.day}, ${fmtTime(b.time)} survived, ${b.kills} takedowns` : ''; }
$('btn-play').addEventListener('click', startGame);
$('btn-again').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-quit').addEventListener('click', toMenu);
$('btn-menu').addEventListener('click', toMenu);
showBest();

// =====================================================================
// Per-frame updates
// =====================================================================
function updatePlayer(dt) {
  player.shoveCd -= dt; player.fireCd -= dt; player.carHitCd -= dt; player.lastHurt += dt;
  player.recoil = Math.max(0, player.recoil - dt * 8); player.shoveAnim = Math.max(0, player.shoveAnim - dt * 4);
  if (player.reloadT > 0) { player.reloadT -= dt; if (player.reloadT <= 0) { const n = Math.min(12 - player.mag, player.reserve); player.mag += n; player.reserve -= n; } }
  if (player.lastHurt > 4 && player.hp < 100 && player.alive) player.hp = Math.min(100, player.hp + 2.5 * dt);
  if (player.car) {
    const c = player.car;
    player.x = c.x; player.z = c.z;
    if (player.dragT > 1.8) { player.dragT = 0; exitCar(true); hurtPlayer(10, c.x, c.z); showMsg('THEY DRAGGED YOU OUT!'); }
    player.dragT = Math.max(0, player.dragT - dt * 0.5);
    if (Math.abs(c.speed) > 3) player.camOff *= Math.max(0, 1 - dt * 2);
    return;
  }
  if (!player.alive) return;
  const moving = input.fwd !== 0 || input.side !== 0;
  const sprint = input.sprint && moving && !player.exhausted && input.fwd >= 0;
  if (sprint) { player.stam -= 20 * dt; if (player.stam <= 0) { player.stam = 0; player.exhausted = true; } }
  else player.stam = Math.min(100, player.stam + (moving ? 10 : 18) * dt);
  if (player.exhausted && player.stam > 30) player.exhausted = false;
  player.sprinting = sprint;
  const speed = sprint ? 10 : 5.8;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  let mx = fx * input.fwd + rx * input.side, mz = fz * input.fwd + rz * input.side; const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const acc = Math.min(1, dt * (player.y > 0.05 ? 3 : 12));
  player.vx = lerp(player.vx, mx * speed, acc); player.vz = lerp(player.vz, mz * speed, acc);
  player.kx *= Math.max(0, 1 - dt * 6); player.kz *= Math.max(0, 1 - dt * 6);
  player.x += (player.vx + player.kx) * dt; player.z += (player.vz + player.kz) * dt;
  resolveCircle(player, 0.4);
  if (input.jump && player.y <= 0.001) player.vy = 7.2;
  player.vy -= 22 * dt; player.y = Math.max(0, player.y + player.vy * dt);
  if (player.y === 0) player.vy = 0;
  for (const h of G.hunters) {
    if (h.dead) continue;
    const dx = player.x - h.x, dz = player.z - h.z, d = Math.hypot(dx, dz), m = 0.4 + 0.35 * h.T.scale;
    if (d < m && d > 1e-4) { const k = ((m - d) / d) * 0.5; player.x += dx * k; player.z += dz * k; h.x -= dx * k; h.z -= dz * k; }
  }
  player.bob += Math.hypot(player.vx, player.vz) * dt * 1.6;
}
function separateHunters() {
  const hs = G.hunters;
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
    const a = hs[i], b = hs[j], dx = b.x - a.x, dz = b.z - a.z;
    if (dx > 0.9 || dx < -0.9 || dz > 0.9 || dz < -0.9) continue;
    const d = Math.hypot(dx, dz);
    if (d < 0.8 && d > 1e-4) { const k = ((0.8 - d) / d) * 0.5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
  }
}
function updateCamera(dt, t) {
  G.shake = Math.max(0, G.shake - dt * 1.5);
  const sx = (Math.random() - 0.5) * G.shake * 0.3, sy = (Math.random() - 0.5) * G.shake * 0.3;
  if (G.mode === 'menu') {
    const a = t * 0.05;
    camera.position.set(-29 + Math.sin(a) * 9, 5 + Math.sin(a * 0.7) * 1.5, -29 + Math.cos(a) * 9);
    camera.lookAt(29, 55, 29);
    vm.visible = false; return;
  }
  if (player.car) {
    const c = player.car, yaw = c.heading + player.camOff;
    const want = new THREE.Vector3(c.x - Math.sin(yaw) * 7.5, 3.3, c.z - Math.cos(yaw) * 7.5);
    const p = { x: want.x, z: want.z }; resolveCircle(p, 0.3); want.x = p.x; want.z = p.z;
    camera.position.lerp(want, Math.min(1, dt * 8));
    camera.lookAt(c.x + Math.sin(yaw) * 3, 1.3, c.z + Math.cos(yaw) * 3);
    camera.position.x += sx; camera.position.y += sy;
    vm.visible = false; return;
  }
  const bobY = Math.sin(player.bob * 2) * 0.05 * (player.y > 0 ? 0 : 1);
  let eye = 1.65;
  if (!player.alive) { G.deathT = (G.deathT || 0) + dt; eye = Math.max(0.3, 1.65 - G.deathT * 1.5); } else G.deathT = 0;
  camera.position.set(player.x + sx, groundY(player.x, player.z) + player.y + eye + bobY + sy, player.z);
  camera.rotation.set(player.pitch + player.recoil * 0.03, player.yaw, player.alive ? 0 : Math.min(1.2, G.deathT * 1.4));
  vm.visible = player.alive;
  const b = player.bob;
  vm.position.set(Math.cos(b) * 0.012, Math.abs(Math.sin(b)) * -0.015 - (player.reloadT > 0 ? 0.25 : 0), player.recoil * 0.06);
  armR.rotation.x = 0.05 + player.recoil * 0.25;
  const sh = Math.sin(player.shoveAnim * Math.PI);
  armL.position.z = -0.42 - sh * 0.25; armR.position.z = -0.42 - sh * 0.2;
}
function updateDirector(dt) {
  G.hour = hourAt(G.elapsed);
  const day = Math.floor(G.elapsed / CFG.dayLength) + 1;
  if (day > G.day) {
    G.day = day;
    if (G.day > CFG.days) { endGame(true); return; }
    sfx.day();
    showBanner(`DAY ${G.day}<small>${G.day === CFG.days ? 'LAST DAY. HOLD ON.' : 'THE BOUNTY WENT UP. MORE OF THEM NOW.'}</small>`, 3.5);
  }
  const tp = targetPos();
  // locale
  const loc = localeName(tp.x, tp.z);
  if (loc !== G.locale) {
    const first = !G.locale;
    G.locale = loc;
    if (!first && CITIES.some((c) => c.name === loc)) showBanner(`<small>WELCOME TO</small>${loc}`, 3);
  }
  // profile
  G.lastSeenT += dt;
  const seenByHunters = G.hunters.some((h) => !h.dead && h.state === 'chase' && h.hasLOS);
  G.heat += dt * (0.25 + (G.airTracking ? 3 : 0) + (seenByHunters ? 0.8 : 0));
  if (G.lastSeenT > 10) G.heat -= dt * 3.5;
  G.heat = clamp(G.heat, heatFloor(), 330);
  let lvl = 0; for (let i = 0; i < LEVELS.length; i++) if (G.heat >= LEVELS[i]) lvl = i;
  if (lvl > G.level) { showMsg(`PROFILE: ${LEVEL_NAMES[lvl]}`, 2.5); sfx.alarm(); }
  G.level = lvl; G.peak = Math.max(G.peak || 0, lvl);
  G.spottedMsgT -= dt;
  // air tracking alerts ground units
  if (G.airTracking) { G.airAlertT -= dt; if (G.airAlertT <= 0) { G.airAlertT = 1; alertAround(tp.x, tp.z, 130); } }
  manageAircraft(dt);
  // population
  G.spawnT -= dt;
  const alive = G.hunters.filter((h) => !h.dead);
  if (G.spawnT <= 0) {
    G.spawnT = 0.6;
    if (alive.length < targetHunters()) spawnHunter();
    for (const h of alive) if (h.state !== 'chase' && Math.hypot(h.x - tp.x, h.z - tp.z) > 175) { h.remove(); if (alive.length <= targetHunters()) spawnHunter(); break; }
    for (const h of alive) if (h.state === 'chase' && Math.hypot(h.x - tp.x, h.z - tp.z) > 260) { h.remove(); break; }
  }
  G.hunters = G.hunters.filter((h) => !h.dead);
  // location leak
  G.pingT -= dt;
  if (G.pingT <= 0) {
    G.pingT = Math.max(14, 50 - G.day * 1.2 - G.level * 4);
    reportSighting(tp.x, tp.z);
    let n = 0;
    for (const h of G.hunters) if (Math.hypot(h.x - tp.x, h.z - tp.z) < 110) { h.alert(mr(0, 2)); n++; }
    if (n || G.helis.length) { showMsg('YOUR LOCATION WAS LEAKED', 3); sfx.alarm(); }
  }
  // hunter drivers
  G.hunterCarT -= dt * (G.airTracking ? 2 : 1);
  if (G.hunterCarT <= 0) {
    G.hunterCarT = Math.max(8, 30 - G.day - G.level * 2);
    const have = G.cars.filter((c) => c.driver === 'hunter').length;
    if ((G.day >= 2 || G.level >= 2) && have < Math.min(G.day - 1 + G.level, 6)) {
      const cand = G.cars.filter((c) => c.driver === 'traffic' && !c.far && Math.hypot(c.x - tp.x, c.z - tp.z) > 30 && Math.hypot(c.x - tp.x, c.z - tp.z) < 130);
      if (cand.length) { mpick(cand).driver = 'hunter'; showMsg('A DRIVER IS COMING FOR YOU', 2.5); sfx.horn(); }
    }
  }
  for (const c of G.cars) if (c.wrecked && c !== player.car && Math.hypot(c.x - player.x, c.z - player.z) > 160) { const l = mpick(lanes); c.placeOnLane(l, mr(l.a0, l.a1)); }
  // navigation
  if (navRecenter(tp.x, tp.z)) G.flowT = 0;
  G.flowT -= dt;
  if (G.flowT <= 0) { G.flowT = 0.35; computeFlow(tp.x, tp.z); }
  // heartbeat + aircraft hum
  let nearest = 1e9;
  for (const h of G.hunters) if (h.state === 'chase') nearest = Math.min(nearest, Math.hypot(h.x - player.x, h.z - player.z));
  G.heartT -= dt;
  if (nearest < 22 && G.heartT <= 0) { sfx.heart(0.25 * (1 - nearest / 22) + 0.05); G.heartT = 0.35 + (nearest / 22) * 0.6; }
  let hd = 1e9, dd = 1e9;
  for (const a of G.helis) if (!a.dead) hd = Math.min(hd, Math.hypot(a.x - camera.position.x, a.y - camera.position.y, a.z - camera.position.z));
  for (const a of G.drones) if (!a.dead) dd = Math.min(dd, Math.hypot(a.x - camera.position.x, a.y - camera.position.y, a.z - camera.position.z));
  setAircraftVolume(0.9 * clamp(1 - hd / 220, 0, 1), 0.05 * clamp(1 - dd / 40, 0, 1));
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05), t = performance.now() / 1000;
  if (G.mode === 'playing') {
    G.elapsed += dt;
    G.airTracking = 0;
    updatePlayer(dt);
    for (const h of G.hunters) if (!h.dead) h.update(dt);
    separateHunters();
    for (const c of G.cars) c.update(dt);
    carInteractions();
    for (const a of G.helis) if (!a.dead) a.update(dt);
    for (const a of G.drones) if (!a.dead) a.update(dt);
    G.helis = G.helis.filter((a) => !a.dead); G.drones = G.drones.filter((a) => !a.dead);
    for (const p of G.pickups) p.update(dt, t);
    updateDirector(dt);
    if (!player.alive) { G.overT -= dt; if (G.overT <= 0 && G.mode === 'playing') endGame(false); }
    updateHUD(dt);
  } else if (G.mode === 'menu') {
    G.hour = 18.2;
    for (const c of G.cars) c.update(dt);
  }
  for (let i = ragdolls.length - 1; i >= 0; i--) if (!ragdolls[i].update(G.mode === 'paused' ? 0 : dt)) { ragdolls[i].dispose(); ragdolls.splice(i, 1); }
  if (G.mode !== 'paused') { updatePuffs(dt); updateTracers(dt); updateAmbientSmoke(dt); }
  updateLighting(t);
  updateCamera(dt, t);
  renderer.clear();
  renderer.render(scene, camera);
  if (vm.visible && G.mode !== 'menu') { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
}

player.x = 0; player.z = 0;
spawnTraffic(70);
$('loading').classList.add('hidden');
frame();

// debug / test hook
window.__hunted = { G, player, camera, scene, renderer, hourAt, startGame, spawnHunter, enterCar, exitCar, playerShoot, colliders, addHeat, get ragdolls() { return ragdolls.length; } };
