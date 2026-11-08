// Cyclists: townsfolk pedal along the bike lane at the curb edge of every road, ring their bells at
// anyone in the way, swerve round stopped cars, and go flying over the handlebars if a car, a shove, a
// crowbar or a bullet catches them (then they get up, cross, and walk it off). The bike stays where it
// fell and anyone can pick it up: press E next to a bike to ride it yourself (fast and quiet, it goes on
// pavements and in alleys where a car can't), or press E right beside someone riding past to yank them
// off and take theirs. When the town is hunting you, some riders give chase on their bikes and jump off
// to grab you.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, angDiff, mr, mpick, scene } from './core.js';
import { lanes, cityAt, moveBody, groundY, pointBlocked, navTarget, los } from './world.js';
import { lam } from './people.js';

export const bikes = [];  // every bike in the world: {g, wheels, x, z, y, heading, rider, lying, speed, lane, lat, spin}
export const riders = []; // hunters currently riding (kept in sync each frame, for traffic to brake for)
const BK_COLORS = [0xd02a2a, 0x2a5aa0, 0x1a1a1a, 0x2a8a4a, 0xe0b020, 0xe07aa0, 0xd8d8d8, 0x6b3a8c, 0x2f7f8f];
const BK_CURB = 2.3;   // how far the bike lane sits outside the car lane (car lanes are 3.4 m off the centre line)

const _bkWheelGeo = new THREE.TorusGeometry(0.33, 0.035, 5, 14).rotateY(Math.PI / 2);
const _bkSpokeGeo = new THREE.BoxGeometry(0.02, 0.62, 0.02);
const bkTyreMat = lam(0x161616), bkSteelMat = lam(0x9a9aa0), bkSeatMat = lam(0x222222);
function bkBeam(g, a, b, t, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, 1), mat);
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  m.position.addVectors(A, B).multiplyScalar(0.5); m.scale.z = A.distanceTo(B); m.lookAt(B); g.add(m);
}
const bkProto = new Map();
function bkModel(color) {
  if (!bkProto.has(color)) {
    const g = new THREE.Group(), frame = lam(color);
    const rear = [0, 0.34, -0.52], front = [0, 0.34, 0.52], seat = [0, 0.88, -0.18], crank = [0, 0.36, 0], stem = [0, 0.98, 0.4];
    bkBeam(g, rear, seat, 0.05, frame); bkBeam(g, seat, crank, 0.05, frame); bkBeam(g, crank, rear, 0.04, frame);
    bkBeam(g, seat, stem, 0.05, frame); bkBeam(g, crank, stem, 0.05, frame); bkBeam(g, stem, front, 0.045, bkSteelMat);
    bkBeam(g, [-0.27, 1.02, 0.42], [0.27, 1.02, 0.42], 0.035, bkSteelMat);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.26), bkSeatMat); s.position.set(0, 0.92, -0.2); g.add(s);
    for (const z of [-0.52, 0.52]) {
      const w = new THREE.Group(); w.position.set(0, 0.34, z); w.name = 'wheel';
      w.add(new THREE.Mesh(_bkWheelGeo, bkTyreMat));
      for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(_bkSpokeGeo, bkSteelMat); sp.rotation.x = (k * Math.PI) / 3; w.add(sp); }
      g.add(w);
    }
    bkProto.set(color, g);
  }
  const g = bkProto.get(color).clone();
  scene.add(g);
  return g;
}

function bkMake(x, z, heading, color = mpick(BK_COLORS)) {
  const g = bkModel(color);
  const B = { g, wheels: g.children.filter((c) => c.name === 'wheel'), x, z, y: groundY(x, z), heading, rider: null, lying: false, speed: 0, lane: null, lat: 0, spin: 0, fallT: 0, tip: 0 };
  bikes.push(B);
  return B;
}
function bkLaneSide(l) { return l.axis === 'z' ? l.dir : -l.dir; } // which way is the curb from this car lane
function bkLanePoint(l, along, lat) { const f = l.fixed + bkLaneSide(l) * lat; return l.axis === 'z' ? [f, along] : [along, f]; }
function bkLaneHeading(l) { return l.axis === 'z' ? (l.dir > 0 ? 0 : Math.PI) : (l.dir > 0 ? Math.PI / 2 : -Math.PI / 2); }
function bkAlongOf(l, x, z) { return l.axis === 'z' ? z : x; }

// put the bike down on its side where it is, rider or no rider
function bkDrop(B) {
  if (B.rider) { if (B.rider.g) B.rider.g.rotation.z = 0; B.rider.bike = null; B.rider = null; }
  B.lying = true; B.fallT = 0; B.speed = 0; B.lane = null; B.idleT = 0;
}

// a rider pedalling: legs going round, hands on the bars, bum on the saddle
function bkPose(h, B, dt) {
  B.spin += (B.speed / 0.34) * dt;
  const c = B.spin * 0.5, p = h.p;
  p.legL.rotation.x = -0.55 + Math.sin(c) * 0.38; p.legR.rotation.x = -0.55 - Math.sin(c) * 0.38;
  p.armL.rotation.x = -1.15; p.armR.rotation.x = -1.15;
  if (h.bellT > 0) p.armR.rotation.x = -1.6 + Math.sin(h.bellT * 30) * 0.2;
  const s = h.T.scale, fx = Math.sin(B.heading), fz = Math.cos(B.heading);
  h.g.position.set(h.x - fx * 0.18 * s, h.y + 0.12, h.z - fz * 0.18 * s);
  h.g.rotation.set(0, B.heading, -B.tip * 0.6);
}
function bkPlace(B) {
  B.g.position.set(B.x, B.y + (B.lying ? 0.06 : 0), B.z);
  B.g.rotation.set(0, B.heading, B.lying ? Math.min(1, B.fallT * 4) * (Math.PI / 2 - 0.12) : -B.tip);
  for (const w of B.wheels) w.rotation.x = B.spin;
}

// the hook in Hunter.update: returns true while this person is on a bike (and has been moved this frame)
export function bikeRide(h, dt, C) {
  const B = h.bike;
  if (!B || B.rider !== h) { h.bike = null; return false; }
  // a shove, a whack, a bullet or anything else that staggers them puts them on the floor
  if (h.stun > 0.05 || h.hp < h.T.hp) {
    const ux = Math.sin(B.heading), uz = Math.cos(B.heading), sp = Math.max(4, B.speed);
    bkDrop(B); C.setHitKind('car');
    C.launchHunter(h, ux, uz, true, { x: ux * sp * 0.8 + h.kx * 0.4 + mr(-1, 1), y: 5 + sp * 0.25, z: uz * sp * 0.8 + h.kz * 0.4 + mr(-1, 1) });
    C.say(h, mpick(BK_OFF_LINES));
    return true;
  }
  h.bellT = Math.max(0, (h.bellT || 0) - dt);
  const P = C.player, tp = C.targetPos();
  const ox = h.x, oz = h.z;
  if (h.state === 'chase' && !C.G.super) {
    // pedal straight at you, then hop off and grab
    const dx = tp.x - h.x, dz = tp.z - h.z, d = Math.hypot(dx, dz);
    if (d < 2.6 || P.car && d < 5) { bkDrop(B); h.stun = 0.15; h.attackCd = 0.3; return false; }
    let ax = tp.x, az = tp.z; // round corners the same way the crowds do, rather than straight into a wall
    if (d > 8 && !los(h.x, h.z, tp.x, tp.z)) { const n = navTarget(h.x + Math.sin(B.heading) * 1.5, h.z + Math.cos(B.heading) * 1.5, 3); if (n) { ax = n.x; az = n.z; } }
    const want = Math.atan2(ax - h.x, az - h.z), turn = angDiff(B.heading, want);
    B.heading += clamp(turn, -2.8 * dt, 2.8 * dt);
    if (Math.abs(turn) > 1.2) B.speed = Math.max(3, B.speed - 10 * dt); // brake for sharp corners
    B.speed = Math.min(B.speed + 5 * dt, 10.5 * Math.min(1.2, C.dayMult()));
    h.x += Math.sin(B.heading) * B.speed * dt; h.z += Math.cos(B.heading) * B.speed * dt;
    const hit = moveBody(h, ox, oz, 0.4, h.y, 1.8);
    const got = Math.hypot(h.x - ox, h.z - oz);
    h.stuckT = got < B.speed * dt * 0.4 ? (h.stuckT || 0) + dt : 0;
    if (hit && got < B.speed * dt * 0.25) B.speed = Math.min(B.speed, 2); // nose into a wall: stop and steer round
    if (h.stuckT > 0.8) { bkDrop(B); return false; }
    B.tip = clamp(turn * 0.3, -0.3, 0.3);
  } else {
    // cruising down the bike lane
    const l = B.lane;
    if (!l) { bkDrop(B); return false; }
    let want = B.cruise, latWant = BK_CURB;
    const fx = Math.sin(B.heading), fz = Math.cos(B.heading);
    for (const c of C.G.cars) { // a car stopped in the bike lane: pull out round it
      if (c.far) continue;
      const ax = c.x - h.x, az = c.z - h.z; if (Math.abs(ax) > 14 || Math.abs(az) > 14) continue;
      const ahead = ax * fx + az * fz, side = Math.abs(ax * fz - az * fx);
      if (ahead > -c.hl && ahead < c.hl + 7 && side < c.hw + 0.9 && Math.abs(c.speed) < 2) latWant = Math.min(latWant, BK_CURB - c.hw - 1.6);
    }
    const blockers = [{ x: P.x, z: P.z, me: true }];
    for (const o of C.G.hunters) if (o !== h && !o.dead && !o.inside && Math.abs(o.x - h.x) < 7 && Math.abs(o.z - h.z) < 7) blockers.push(o);
    for (const o of blockers) { // someone in the way: ring the bell and brake
      if (o.me && (P.car || !P.alive)) continue;
      const ax = o.x - h.x, az = o.z - h.z, ahead = ax * fx + az * fz, side = Math.abs(ax * fz - az * fx);
      if (ahead > 0.4 && ahead < 6 && side < 0.9) {
        want = ahead < 2 ? 0 : Math.min(want, 2);
        if (!h.bellCd || C.G.elapsed > h.bellCd) { h.bellCd = C.G.elapsed + mr(1.8, 3); h.bellT = 0.35; if (o.me && C.G.mode === 'playing' && ahead < 5) C.sfx.bell(); if (Math.random() < 0.4) C.say(h, mpick(o.me ? BK_BELL_LINES : ['EXCUSE ME!', 'BIKE LANE!', 'DING DING!'])); }
      }
    }
    B.speed += clamp(want - B.speed, -6 * dt, 2.5 * dt);
    B.lat += clamp(latWant - B.lat, -2 * dt, 2 * dt);
    let along = bkAlongOf(l, h.x, h.z) + l.dir * B.speed * dt;
    if (l.dir > 0 ? along > l.a1 - 2 : along < l.a0 + 2) {
      if (Math.hypot(h.x - P.x, h.z - P.z) > 60) { h.remove(); B.rider = null; h.bike = null; B.dead = true; return true; }
      // turn round onto the other side of the road
      const s = bkLaneSide(l), other = lanes.find((o) => o.axis === l.axis && o.dir === -l.dir && Math.abs(o.fixed - (l.fixed - s * 6.8)) < 0.6);
      if (other) { B.lane = other; along = clamp(along, other.a0 + 3, other.a1 - 3); B.speed = 2; }
      else B.speed = 0;
    }
    const L = B.lane, [nx, nz] = bkLanePoint(L, along, B.lat), hd = bkLaneHeading(L);
    h.x = nx; h.z = nz;
    B.tip = clamp(angDiff(B.heading, hd), -0.25, 0.25) + (latWant - B.lat) * 0.04;
    B.heading += angDiff(B.heading, hd) * Math.min(1, dt * 4);
    if (moveBody(h, ox, oz, 0.35, h.y, 1.8) && B.speed > 3) B.speed *= 0.5;
  }
  h.y = groundY(h.x, h.z); h.face = B.heading; h.vx = Math.sin(B.heading) * B.speed; h.vz = Math.cos(B.heading) * B.speed;
  B.x = h.x; B.z = h.z; B.y = h.y;
  bkPose(h, B, dt);
  return true;
}
const BK_BELL_LINES = ['BIKE LANE, MATE!', 'DING DING!', 'MOVE IT!', 'CYCLIST COMING THROUGH', 'IT\'S A LANE NOT A LOUNGE', 'ON YOUR LEFT!'];
const BK_OFF_LINES = ['MY BIKE!', 'WAAAH!', 'NOT AGAIN!', 'I\'M OK! I\'M OK!', 'MY NEW SHORTS!', 'OWWW, MY DIGNITY'];

// put someone on a bike riding down a lane
function bkMount(h, B, lane, along) {
  B.rider = h; B.lying = false; B.lane = lane; B.lat = BK_CURB; B.cruise = mr(5.2, 7.8); B.speed = B.cruise * 0.8; B.fallT = 0;
  if (lane) { const [x, z] = bkLanePoint(lane, along, BK_CURB); h.x = B.x = x; h.z = B.z = z; B.heading = bkLaneHeading(lane); }
  h.bike = B; h.y = B.y = groundY(h.x, h.z); h.wt = null; h.act = null;
  return B;
}
// spawn a cyclist out of sight on a random bike lane in town
export function spawnCyclist(C, state = 'search', minD = 60, maxD = 150) {
  const tp = C.targetPos(), cands = lanes.filter((l) => {
    const near = l.axis === 'z' ? Math.abs(l.fixed - tp.x) : Math.abs(l.fixed - tp.z);
    return near < maxD && l.cruise < 19; // town streets, not the highways
  });
  for (let t = 0; t < 16 && cands.length; t++) {
    const l = mpick(cands), along = clamp((l.axis === 'z' ? tp.z : tp.x) + mr(-maxD, maxD), l.a0 + 4, l.a1 - 4);
    const [x, z] = bkLanePoint(l, along, BK_CURB), d = Math.hypot(x - tp.x, z - tp.z);
    if (d < minD || d > maxD || !cityAt(x, z, 4) || pointBlocked(x, z, 0.4)) continue;
    if (C.G.cars.some((c) => Math.abs(c.x - x) < 7 && Math.abs(c.z - z) < 7)) continue;
    const h = new C.Hunter(x, z, Math.random() < 0.3 ? 'runner' : 'civ', false, state);
    C.G.hunters.push(h);
    const B = bkMake(x, z, bkLaneHeading(l));
    bkMount(h, B, l, along);
    return h;
  }
  return null;
}

let bkSpawnT = 0;
export function updateBikes(dt, C) {
  const P = C.player, tp = C.targetPos();
  riders.length = 0;
  for (let i = bikes.length - 1; i >= 0; i--) {
    const B = bikes[i];
    if (B.rider && B.rider !== P && B.rider.gone) B.dead = true; // rode off out of the area: the bike goes with them
    else if (B.rider && (B.rider.dead || B.rider.bike !== B)) bkDrop(B);
    if (B.dead) { scene.remove(B.g); bikes.splice(i, 1); continue; }
    if (B.rider) riders.push(B.rider);
    if (B.rider === P) {
      B.x = P.x; B.z = P.z; B.y = P.y; B.heading = P.yaw + Math.PI;
      const sp = Math.hypot(P.vx, P.vz); B.speed = sp; B.spin += (sp / 0.34) * dt;
      B.tip = clamp(-C.input.side * 0.12 * Math.min(1, sp / 6), -0.2, 0.2);
    }
    if (B.lying) {
      B.fallT += dt; B.idleT = (B.idleT || 0) + dt;
      // cars knock lying bikes along the road
      for (const c of C.G.cars) if (!c.far && Math.abs(c.speed) > 3 && Math.hypot(c.x - B.x, c.z - B.z) < c.hl + 0.4) { B.x += c.fx * c.speed * dt * 1.2; B.z += c.fz * c.speed * dt * 1.2; B.heading += dt * 6; }
      const far = Math.hypot(B.x - tp.x, B.z - tp.z);
      if (far > 220 || (B.idleT > 240 && far > 60)) { B.dead = true; }
    }
    if (B.rider !== P && !B.rider) B.y = groundY(B.x, B.z);
    bkPlace(B);
  }
  if (C.G.mode !== 'playing') return;
  // keep a few cyclists about in town (more when it's busy, a posse of them when you're wanted)
  bkSpawnT -= dt;
  if (bkSpawnT <= 0) {
    bkSpawnT = 1.5;
    const here = cityAt(tp.x, tp.z, 40);
    const want = here ? Math.round(7 * (C.crowd ? C.crowd() : 1)) : 0;
    const ridingCalm = riders.filter((h) => h !== P && h.state !== 'chase').length;
    if (ridingCalm < want && !C.G.super) spawnCyclist(C);
    const chasing = riders.filter((h) => h !== P && h.state === 'chase').length;
    if (C.G.level >= 2 && chasing < Math.min(4, C.G.level - 1) && C.chasers() > 2 && Math.random() < 0.35) spawnCyclist(C, 'chase', 45, 110);
  }
}

// ---- the player and bikes ----
export function bikeNear(x, z, r = 2.2) {
  let best = null, bd = r;
  for (const B of bikes) { if (B.rider || B.dead) continue; const d = Math.hypot(B.x - x, B.z - z); if (d < bd) { bd = d; best = B; } }
  return best;
}
export function riderNear(x, z, r = 2.4) {
  let best = null, bd = r;
  for (const B of bikes) { const h = B.rider; if (!h || !h.p || h.dead) continue; const d = Math.hypot(B.x - x, B.z - z); if (d < bd) { bd = d; best = B; } }
  return best;
}
// E: hop on a bike lying nearby, or pull someone off theirs; E again to get off
export function playerBikeAction(C) {
  const P = C.player;
  if (P.bike) { const B = P.bike; bkDrop(B); B.x = P.x; B.z = P.z; B.heading = P.yaw + Math.PI; B.fallT = 0.2; C.showMsg('OFF THE BIKE', 0.8); return true; }
  if (P.car || P.mode !== 'move') return false;
  let B = bikeNear(P.x, P.z);
  if (!B) {
    B = riderNear(P.x, P.z);
    if (!B) return false;
    const h = B.rider, ux = h.x - P.x, uz = h.z - P.z, ul = Math.hypot(ux, uz) || 1;
    bkDrop(B); C.setHitKind('shove');
    C.launchHunter(h, ux / ul, uz / ul, true, { x: (ux / ul) * 4, y: 4, z: (uz / ul) * 4 }); C.say(h, 'THAT\'S MY BIKE!');
    C.addHeat(6); C.alertAround(P.x, P.z, 16, 0.8); C.showMsg('BIKE NICKED', 1.2);
  } else C.showMsg('ON YOUR BIKE. E TO HOP OFF', 1.6);
  B.rider = P; B.lying = false; B.fallT = 0; B.lane = null; P.bike = B; C.sfx.bell();
  return true;
}
// called from the player's update when they're on a bike: no climbing gear, but much faster
export function playerBikeSpeed(sprint) { return sprint ? 15.5 : 10.5; }
export function clearBikes(P) { for (const B of bikes) scene.remove(B.g); bikes.length = 0; riders.length = 0; if (P) P.bike = null; }
export function bikeDebug() { return { bikes: bikes.length, riding: bikes.filter((B) => B.rider).length, lying: bikes.filter((B) => B.lying).length }; }
