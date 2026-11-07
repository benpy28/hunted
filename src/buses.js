// Getting the bus. Every bus in the county takes passengers now, you included.
//  - Wait at a stop, and when a bus pulls in, walk up to the front door and press E: $2 on the day buses, $3
//    at night, or nothing with a DAY RIDER from the bus station. Take a seat by the window and watch the
//    county go by. Press E to ring the bell, and it stops at the next stop to let you off.
//  - A seat on the bus is a good place to be: under a roof, among strangers, all of you staring out of the
//    window. Just don't get on with someone right behind you: the driver won't open the doors.
//  - The COUNTY LINK: orange buses between the towns. The X9 runs PORT HALDEN to ASHFORD along Route 9, by
//    way of the bus station; the X4 runs PORT HALDEN to SALTMARSH DOCKS down Route 4, stopping at the
//    leisure park (bowling, baths).
//  - After 11 at night they become the NIGHT BUSES: the N9 and the N4, dark blue blinds, a driver who's seen
//    it all and a top deck full of people singing on their way home from the pub.
//  - The ROUTE 9 BUS STATION: a waiting hall, a departures board that tells you where each bus has got to,
//    a ticket office, a tea hatch, left luggage lockers to hide in.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene, textTex } from './core.js';
import { clearings, railGaps, propBuf, glowBuf, groundBuf, markBuf, addCollider, addRoof, worldHooks, navOpen, keepClear, parkedSpots, cityAt } from './world.js';
import { interiorZones } from './interiors.js';
import { lifeSpots } from './streets.js';
import { buildPerson, lam, SKINS, HAIRS, SHIRTS, PANTS } from './people.js';
import { hidePiece } from './gigs.js';

// =====================================================================
// Where everything is
// =====================================================================
export const BS_CLEAR = { x0: 252, x1: 346, z0: -74, z1: -9 };
clearings.push(BS_CLEAR);
railGaps.push({ road: 'ROUTE 9', axis: 'x', side: -1, a0: 264, a1: 328 }, { road: 'ROUTE 9', axis: 'x', side: 1, a0: 292, a1: 308 }); // the platform, and the stop across the road
export const station = { name: 'ROUTE 9 BUS STATION', x0: 264, x1: 328, z0: -52, z1: -24, H: 6, door: { x: 296, z: -23.6 }, office: { x: 276, z: -28.6 }, tea: { x: 318, z: -28.6 }, board: { x: 296, z: -24.5 }, lockers: [], built: false };
export const bsRoofs = [];
const bsRideRoof = { x0: 0, x1: 0, z0: 0, z1: 0, h: -99 }; // the roof of the bus you're on
bsRoofs.push(bsRideRoof);
export const BS_STATE = { ride: null, rides: 0, fares: 0, rider: 0, bells: 0, refused: 0, nightRides: 0, stops: 0, msgT: 0, kicked: 0 };
export const inStation = (x, z) => x > station.x0 && x < station.x1 && z > station.z0 && z < station.z1;
export const nightBusTime = (hr) => hr >= 23 || hr < 5.5;
const BS_ORANGE = 0xe07a1a, BS_NIGHT = 0x1a2a6a;
// where the county buses always pull in (they stop at the ordinary shelters along the way too)
const BS_STOPS = [
  { id: 'station', name: 'ROUTE 9 BUS STATION', x: 296, z: -9.2, axis: 'x', dir: 1 },
  { id: 'station-n', name: 'ROUTE 9 BUS STATION', x: 300, z: 9.2, axis: 'x', dir: -1 },
  { id: 'leisure', name: 'THE LEISURE PARK', x: -9.4, z: 296, axis: 'z', dir: -1 },
  { id: 'leisure-e', name: 'THE LEISURE PARK', x: 9.4, z: 296, axis: 'z', dir: 1 },
];

// =====================================================================
// Building it: the station, and shelters for the country stops
// =====================================================================
function bsWall(x0, x1, z0, z1, h, col, y0 = 0) { propBuf.box(x0, x1, y0, h, z0, z1, col); addCollider(x0, x1, z0, z1, h, { y0 }); }
function bsPlane(w, h, tex, x, y, z, ry = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; }
// a plain country bus shelter on the kerb: `out` = which way the road is (+1/-1 along the other axis)
function bsShelter(S) {
  const ax = S.axis === 'x', out = ax ? (S.z < 0 ? 1 : -1) : (S.x < 0 ? 1 : -1); // (towards the road)
  const R = (a, b) => (ax ? [S.x + a, S.z - out * b] : [S.x - out * b, S.z + a]);
  const box = (a0, a1, b0, b1, y0, y1, col, o) => { const [p0, q0] = R(a0, b0), [p1, q1] = R(a1, b1); propBuf.box(Math.min(p0, p1), Math.max(p0, p1), y0, y1, Math.min(q0, q1), Math.max(q0, q1), col, o); return [Math.min(p0, p1), Math.max(p0, p1), Math.min(q0, q1), Math.max(q0, q1)]; };
  box(-2.2, 2.2, -0.2, 1.6, 2.5, 2.62, 0x2a3a2a, { bottom: true });
  const c = box(-2.2, 2.2, 1.45, 1.55, 0.15, 2.5, 0x9ac8e0, { glass: true }); addCollider(c[0], c[1], c[2], c[3], 2.5);
  box(-1.4, 1.4, 0.9, 1.3, 0.5, 0.58, 0x8a5a32);
  const [px, pz] = R(2.8, 0.2); propBuf.box(px - 0.05, px + 0.05, 0, 2.9, pz - 0.05, pz + 0.05, 0x8a8a90); propBuf.box(px - 0.3, px + 0.3, 2.5, 3.0, pz - 0.3, pz + 0.3, BS_ORANGE);
  const face = ax ? (out > 0 ? 0 : Math.PI) : (out > 0 ? Math.PI / 2 : -Math.PI / 2);
  for (const o of [-0.8, 0, 0.8]) { const [sx, sz] = R(o, 1.1), [wx, wz] = R(o, 0.3); lifeSpots.push({ kind: 'bus', x: wx, z: wz, sx, sz, face, bsStop: S.id }); }
}
function buildStation() {
  const S = station, P = BS_CLEAR, H = S.H;
  groundBuf.flat(P.x0, P.x1, P.z0, P.z1, 0.011, 0x5a7d45);
  groundBuf.flat(262, 330, -24, -7, 0.016, 0x8a8590); // the forecourt and platform
  markBuf.flat(266, 326, -7.6, -7.3, 0.02, 0xe0c020); // the yellow line along the kerb
  for (let x = 268; x < 326; x += 12) markBuf.flat(x, x + 6, -6.6, -6.4, 0.02, 0xf0f0f0);
  groundBuf.flat(334, 344, -60, -10, 0.013, 0x4a4a50); // a little car park round the side
  for (const z of [-56, -48, -40, -32]) parkedSpots.push({ x: 339, z, heading: 0 });
  // the platform canopy, long enough for two buses
  propBuf.box(266, 326, 3.6, 3.9, -16, -8.2, 0x2a3a4a, { bottom: true }); addRoof(266, 326, -16, -8.2, 3.9, { y0: 3.6 });
  for (let x = 268; x < 326; x += 8) { propBuf.box(x - 0.1, x + 0.1, 0, 3.6, -15.8, -15.6, 0x8a8a90); }
  for (let x = 267; x < 326; x += 2) glowBuf.box(x, x + 1.2, 3.55, 3.6, -12.3, -11.9, 0xf0f8ff);
  for (const [x, n] of [[276, 'STAND A · X9 ASHFORD'], [316, 'STAND B · X9 ASHFORD']]) { propBuf.box(x - 0.06, x + 0.06, 0, 3.2, -8.8, -8.6, 0x8a8a90); bsPlane(2.4, 0.5, textTex(320, 64, '#e07a1a', '#ffffff', [n], 'bold 26px Arial'), x, 3.0, -8.55, 0); }
  for (let x = 270; x < 324; x += 9) { propBuf.box(x - 1, x + 1, 0, 0.45, -14.6, -14.1, 0x8a5a32); addCollider(x - 1, x + 1, -14.6, -14.1, 0.45); for (const o of [-0.5, 0.5]) lifeSpots.push({ kind: 'bus', x: x + o, z: -13.4, sx: x + o, sz: -14.35, face: 0, bsStop: 'station' }); }
  bsRoofs.push({ x0: 266, x1: 326, z0: -16, z1: -8.2, h: 3.6 });
  // the waiting hall: glass front on to the platform
  groundBuf.flat(S.x0 + 0.2, S.x1 - 0.2, S.z0 + 0.2, S.z1 - 0.2, 0.02, 0xc8c0b0);
  bsWall(S.x0 - 0.3, S.x0, S.z0, S.z1, H, 0x8a6a4a); bsWall(S.x1, S.x1 + 0.3, S.z0, S.z1, H, 0x8a6a4a); bsWall(S.x0, S.x1, S.z0 - 0.3, S.z0, H, 0x8a6a4a);
  for (const [a, b] of [[S.x0, 293], [299, S.x1]]) { bsWall(a, b, S.z1, S.z1 + 0.3, 0.6, 0x8a6a4a); propBuf.box(a, b, 0.6, 3.4, S.z1 + 0.1, S.z1 + 0.2, 0x9ac8e0, { glass: true }); addCollider(a, b, S.z1, S.z1 + 0.3, H, { y0: 0.6 }); propBuf.box(a, b, 3.4, H, S.z1, S.z1 + 0.3, 0x8a6a4a); }
  propBuf.box(293, 299, 3.4, H, S.z1, S.z1 + 0.3, 0x8a6a4a);
  navOpen.push({ x0: 293.4, x1: 298.6, z0: S.z1 - 1.5, z1: S.z1 + 1.5 }); keepClear.push({ x0: 292, x1: 300, z0: S.z1 - 2, z1: S.z1 + 6 });
  bsPlane(18, 1.6, textTex(1024, 92, '#e07a1a', '#ffffff', ['ROUTE 9 BUS STATION'], 'bold 72px Arial Black, Arial'), 296, 4.7, S.z1 + 0.32, 0);
  propBuf.box(S.x0 - 0.3, S.x1 + 0.3, H, H + 0.3, S.z0 - 0.3, S.z1 + 0.3, 0x4a4a52, { bottom: true }); addRoof(S.x0 - 0.3, S.x1 + 0.3, S.z0 - 0.3, S.z1 + 0.3, H + 0.3, { y0: H });
  for (let x = S.x0 + 4; x < S.x1 - 2; x += 8) glowBuf.box(x - 1.2, x + 1.2, H - 0.08, H - 0.03, -40, -36, 0xfff2d0);
  bsRoofs.push({ x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, h: H });
  interiorZones.push({ x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: -0.5, y1: H - 0.2, name: S.name });
  // inside: rows of benches (proper benches: the town sits on them), the ticket office, the tea hatch, lockers
  for (let x = 272; x < 322; x += 7) for (const z of [-36, -42]) {
    propBuf.box(x - 1.4, x + 1.4, 0.4, 0.48, z - 0.3, z + 0.3, 0x2a5a8a); propBuf.box(x - 1.4, x + 1.4, 0.48, 1.0, z - 0.05, z + 0.05, 0x2a5a8a); addCollider(x - 1.4, x + 1.4, z - 0.3, z + 0.3, 0.48);
    for (const [s, f] of [[1, 0], [-1, Math.PI]]) for (const o of [-0.7, 0.7]) lifeSpots.push({ kind: 'bench', x: x + o, z: z + s * 0.95, face: f, sx: x + o, sz: z + s * 0.2 });
  }
  propBuf.box(270, 282, 0, 1.1, -27.4, -26.6, 0x2a5a8a); addCollider(270, 282, -27.4, -26.6, 1.1); propBuf.box(270, 282, 1.1, 2.4, -27.05, -26.95, 0x9ac8e0, { glass: true });
  bsPlane(6, 0.8, textTex(512, 80, '#2a5a8a', '#ffffff', ['TICKETS · DAY RIDERS'], 'bold 42px Arial'), 276, 2.9, -24.35, 0).rotation.y = Math.PI;
  propBuf.box(314, 322, 0, 1.1, -27.4, -26.6, 0xd8a050); addCollider(314, 322, -27.4, -26.6, 1.1);
  bsPlane(5, 0.8, textTex(512, 80, '#d8a050', '#1a1a1a', ['TEA · BACON ROLLS'], 'bold 44px Arial'), 318, 2.9, -24.35, 0).rotation.y = Math.PI;
  for (const x of [266, 267.2, 268.4]) S.lockers.push(hidePiece('locker', x, S.z0 + 0.45, 0, 1, 0.3, 0.25, 1.9, 0));
  for (const x of [324.5, 325.7]) S.lockers.push(hidePiece('locker', x, S.z0 + 0.45, 0, 1, 0.3, 0.25, 1.9, 0));
  // the departures board, hung inside the front where you can see it from the platform too
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; S.boardCanvas = c; S.boardTex = new THREE.CanvasTexture(c); S.boardTex.colorSpace = THREE.SRGBColorSpace;
  for (const ry of [0, Math.PI]) bsPlane(6.4, 2.0, S.boardTex, 296, 4.4, S.z1 - 0.4 + (ry ? 0 : 0.02), ry);
  propBuf.box(292.7, 299.3, 3.35, 5.45, S.z1 - 0.43, S.z1 - 0.39, 0x1a1a1e);
}
worldHooks.beforeBake.push(() => { buildStation(); for (const S of BS_STOPS) if (S.id !== 'station') bsShelter(S); station.built = true; });

// =====================================================================
// The county buses (and the night buses they turn into)
// =====================================================================
const BS_ROUTES = [
  { id: 'X9', night: 'N9', axis: 'x', fixed: -3.4, dir: 1, along: 160, dest: 'ASHFORD', destN: 'ASHFORD' },
  { id: 'X9', night: 'N9', axis: 'x', fixed: 3.4, dir: -1, along: 700, dest: 'PORT HALDEN', destN: 'PORT HALDEN' },
  { id: 'X4', night: 'N4', axis: 'z', fixed: 3.4, dir: 1, along: 120, dest: 'SALTMARSH DOCKS', destN: 'SALTMARSH DOCKS' },
  { id: 'X4', night: 'N4', axis: 'z', fixed: -3.4, dir: -1, along: 600, dest: 'PORT HALDEN', destN: 'PORT HALDEN' },
];
const bsCounty = (K) => K.G.cars.filter((c) => c.cb && !c.wrecked);
function bsBlind(c, night) {
  if (!c.blind) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 40; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.26), new THREE.MeshBasicMaterial({ map: t })); m.position.set(0, 2.87, c.hl + 0.04); c.g.add(m);
    const back = m.clone(); back.position.z = -c.hl - 0.04; back.rotation.y = Math.PI; c.g.add(back);
    c.blind = { cv, t, night: null };
  }
  if (c.blind.night === night) return;
  c.blind.night = night;
  const x = c.blind.cv.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, 256, 40);
  x.fillStyle = night ? '#7ab0ff' : '#ffb020'; x.font = 'bold 26px Arial'; x.textAlign = 'left'; x.fillText(night ? c.cb.night : c.cb.id, 8, 30);
  x.font = 'bold 20px Arial'; x.textAlign = 'right'; x.fillText(night ? `${c.cb.destN} (NIGHT)` : c.cb.dest, 248, 28);
  c.blind.t.needsUpdate = true;
  // the night buses: a band of dark blue along the side
  if (!c.nightBand) { c.nightBand = new THREE.Mesh(new THREE.BoxGeometry(c.hw * 2 + 0.06, 0.4, c.hl * 2 - 0.4), lam(BS_NIGHT)); c.nightBand.position.y = 1.15; c.g.add(c.nightBand); }
  c.nightBand.visible = night;
}
function bsSpawnCounty(K) {
  for (const R of BS_ROUTES) {
    const lane = K.lanes().find((l) => l.axis === R.axis && l.dir === R.dir && Math.abs(l.fixed - R.fixed) < 0.5); if (!lane) continue;
    const c = K.addCar(lane, R.along, 'bus', BS_ORANGE); if (!c) continue;
    c.cb = R; c.cruise = Math.max(c.cruise, 12); bsBlind(c, nightBusTime(K.hour));
  }
}
// the bus's own rules on top of the ordinary shelter stops: county buses always call at their stops, and
// any bus with you on it stops at the next shelter once you've rung the bell
const bsNearStop = (bus, sp, back = -1, fwd = 3, door = 0) => { const ax = sp.x - bus.x, az = sp.z - bus.z, ahead = ax * bus.fx + az * bus.fz - door, side = Math.abs(ax * bus.fz - az * bus.fx); return ahead > back && ahead < fwd && side < 9; };
export function busLogic(bus, dt, target, K) {
  const R = BS_STATE.ride, mine = R && R.bus === bus;
  if (bus.stopT > 0) { if (mine && !R.stoppedMsg) { R.stoppedMsg = true; K.sfx.pfft && K.near(bus.x, bus.z, 40) && K.sfx.pfft(); } return target; }
  if (mine) R.stoppedMsg = false;
  if (bus.cb) {
    for (const S of BS_STOPS) {
      if (S.axis !== bus.cb.axis || S.dir !== bus.cb.dir) continue;
      if (bus.cbLast === S.id && bsNearStop(bus, S, -20, 30)) continue;
      if (bsNearStop(bus, S, -1, 2.5, bus.hl - 1.3)) { bus.cbLast = S.id; // (pulls up with its front door at the stop) bus.stopT = mine && !R.bell ? 4 : 7; bus.stopAt = { x: S.x, z: S.z, kind: 'bus' }; bus.lastStop = bus.stopAt; BS_STATE.stops++; if (K.near(bus.x, bus.z, 50)) K.sfx.horn(); return 0; }
    }
  }
  if (mine && R.bell) {
    for (const sp of lifeSpots) {
      if (sp.kind !== 'bus' || !bsNearStop(bus, sp, -1, 4)) continue;
      if (R.at && Math.hypot(sp.x - R.at.x, sp.z - R.at.z) < 12) continue; // (not the stop you got on at)
      bus.stopT = 4; bus.stopAt = sp; bus.lastStop = sp; return 0;
    }
  }
  return target;
}

// =====================================================================
// On board: the inside of the bus, your seat, the bell, getting off
// =====================================================================
const bsCabinMat = new THREE.MeshLambertMaterial({ color: 0xd8d0c0, side: THREE.DoubleSide });
const bsFloorMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52, side: THREE.DoubleSide });
const bsSeatMat = new THREE.MeshLambertMaterial({ color: 0x2a4a8a });
const bsSeatNight = new THREE.MeshLambertMaterial({ color: 0x6a2a4a });
const BS_RIDERS = ['NEXT STOP\'S MINE', 'IS THIS THE X9?', 'HE NEVER WAITS, THIS DRIVER', 'I\'VE GOT A HOSPITAL APPOINTMENT', 'LOOK AT THAT TRAFFIC', '...AND THEN SHE SAID...', 'MIND YOUR BAG, LOVE'];
const BS_NIGHTERS = ['WE\'RE ON THE NIGHT BUS!', '*SINGS* ...AND WE\'LL ALL GO HOME...', 'ANYONE GOT A CHIP?', 'I LOVE YOU, MATE. I DO.', 'WHERE ARE WE?', 'DRIVER! DRIVER! ...NOTHING. CARRY ON.', 'BEST NIGHT EVER', '*SNORES*'];
function bsCabin(c, night) {
  if (!c.cabin) {
    const g = new THREE.Group(), W = c.hw - 0.06, L = c.hl - 0.15;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, L * 2), bsFloorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.5; g.add(floor);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, 1.05), bsCabinMat); p.rotation.y = Math.PI / 2; p.position.set(s * W, 1.02, 0); g.add(p); }
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, L * 2), bsCabinMat); roof.rotation.x = Math.PI / 2; roof.position.y = 3.02; g.add(roof);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 2.5), bsCabinMat); back.position.set(0, 1.75, -L); g.add(back);
    for (let z = L - 2.6; z > -L + 0.6; z -= 0.95) for (const s of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.5), bsSeatMat); seat.position.set(s * (W - 0.55), 0.95, z); g.add(seat);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.1), bsSeatMat); bk.position.set(s * (W - 0.55), 1.35, z - 0.25); g.add(bk);
    }
    for (const s of [-0.35, 0.35]) { const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L * 2 - 1, 6), lam(0xe0c020)); rail.rotation.x = Math.PI / 2; rail.position.set(s, 2.85, 0); g.add(rail); }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, L * 2 - 1.2), new THREE.MeshBasicMaterial({ color: 0xf0f8ff })); lamp.position.y = 3.0; g.add(lamp);
    // the driver, in a little cab at the front
    const drv = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: 0x6a7a8a, pants: 0x1a1a2a }); drv.group.position.set(-0.55, 0.45, L - 1.2); drv.legL.rotation.x = drv.legR.rotation.x = -1.4; drv.armL.rotation.x = drv.armR.rotation.x = -1.2; g.add(drv.group);
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 1.1), new THREE.MeshLambertMaterial({ color: 0x9ac8e0, transparent: true, opacity: 0.3 })); scr.position.set(0.05, 1.6, L - 1.4); g.add(scr);
    c.g.add(g); c.cabin = { g, folk: [], W, L };
  }
  const C = c.cabin;
  // a few fellow passengers (more at night, louder)
  for (const f of C.folk) C.g.remove(f.g); C.folk.length = 0;
  const n = night ? 5 : 3;
  const seats = []; for (let z = C.L - 2.6; z > -C.L + 0.6; z -= 0.95) for (const s of [-1, 1]) seats.push({ x: s * (C.W - 0.55), z });
  for (let k = 0; k < n; k++) {
    const st = seats.splice(Math.floor(Math.random() * seats.length), 1)[0]; if (!st || (Math.abs(st.x - (C.W - 0.55)) < 0.1 && st.z < -C.L + 3)) continue;
    const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: mpick(SHIRTS), pants: mpick(PANTS) });
    p.group.position.set(st.x, 0.68, st.z + 0.05); p.legL.rotation.x = p.legR.rotation.x = -1.4; p.armL.rotation.x = p.armR.rotation.x = -0.4;
    if (night && Math.random() < 0.4) { p.armR.rotation.x = -2.9; }
    C.g.add(p.group); C.folk.push({ p, g: p.group, st });
  }
  for (const m of C.g.children) if (m.material === bsSeatMat || m.material === bsSeatNight) m.material = night ? bsSeatNight : bsSeatMat;
  C.g.visible = true;
}
const bsDoor = (c, out = 0.9) => ({ x: c.x + c.fx * (c.hl - 1.3) + c.fz * (c.hw + out), z: c.z + c.fz * (c.hl - 1.3) - c.fx * (c.hw + out) });
function bsDoorBus(K) {
  const P = K.player;
  if (P.car || P.hide || P.bike || P.mode !== 'move' || BS_STATE.ride || P.y > 1.2) return null;
  for (const c of K.G.cars) {
    if (c.kind !== 'bus' || c.wrecked || c.driver !== 'traffic' || !(c.stopT > 0) || Math.abs(c.speed) > 0.5) continue;
    const d = bsDoor(c); if (Math.hypot(d.x - P.x, d.z - P.z) < 2.6) return c;
  }
  return null;
}
export const busFare = (hr) => (nightBusTime(hr) ? 3 : 2);
function bsBoard(c, K) {
  const P = K.player, hr = K.hour, night = nightBusTime(hr);
  const chased = K.hunters().some((h) => !h.dead && h.state === 'chase' && Math.hypot(h.x - P.x, h.z - P.z) < 18);
  if (chased) { BS_STATE.refused++; K.showMsg('THE DRIVER TAKES ONE LOOK AT WHO\'S BEHIND YOU AND SHUTS THE DOORS', 2.2); c.stopT = 0; return; }
  const fare = BS_STATE.rider === K.G.day ? 0 : busFare(hr);
  if (P.cash < fare) { K.showMsg(`IT'S $${fare}. YOU HAVEN'T GOT IT. THE DRIVER SHAKES HIS HEAD`, 2); return; }
  if (fare) { P.cash -= fare; K.sfx.cash(); BS_STATE.fares += fare; }
  BS_STATE.rides++; if (night) BS_STATE.nightRides++;
  // a free seat on the kerb side, halfway down
  bsCabin(c, night);
  const C = c.cabin, taken = new Set(C.folk.map((f) => f.st.z.toFixed(2) + f.st.x.toFixed(1)));
  let seat = null;
  for (let z = C.L - 3.55; z > -C.L + 0.6 && !seat; z -= 0.95) for (const s of [1, -1]) { const x = s * (C.W - 0.55); if (!taken.has(z.toFixed(2) + x.toFixed(1))) { seat = { x, z }; break; } }
  if (!seat) seat = { x: C.W - 0.55, z: 0 };
  BS_STATE.ride = { bus: c, seat, t: 0, bell: false, stillT: 0, chatT: mr(4, 8), night, at: { x: c.x, z: c.z } };
  c.stopT = Math.max(c.stopT, 1.5);
  const name = c.cb ? `THE ${night ? c.cb.night : c.cb.id} TO ${c.cb.dest}` : 'THE BUS';
  K.showMsg(`${fare ? `$${fare}. ` : 'DAY RIDER. '}ON ${name}. ${K.isTouch ? 'USE' : 'E'} TO RING THE BELL`, 2.6);
  P.yaw = Math.atan2(-c.fz, c.fx); // (facing the window)
  P.pitch = 0;
}
function bsGetOff(K, msg) {
  const R = BS_STATE.ride; if (!R) return;
  BS_STATE.ride = null;
  const P = K.player, c = R.bus;
  if (c.cabin) c.cabin.g.visible = false;
  let p = null;
  for (const o of [0.9, 1.6, 2.4]) { const d = bsDoor(c, o); if (!K.blocked(d.x, d.z, 0.35)) { p = d; break; } }
  if (!p) p = bsDoor(c, 1.6);
  P.x = p.x; P.z = p.z; P.y = 0; P.vx = P.vz = P.vy = 0; P.crouch = 0;
  if (msg) K.showMsg(msg, 2);
}
function bsRide(dt, K) {
  const R = BS_STATE.ride; if (!R) return false;
  const P = K.player, c = R.bus;
  if (!P.alive || c.wrecked || !K.G.cars.includes(c) || c.driver !== 'traffic') { bsGetOff(K, 'THE BUS ISN\'T GOING ANYWHERE. EVERYBODY OFF'); return false; }
  R.t += dt;
  // sat in your seat, swaying with the bus
  const lx = R.seat.x, lz = R.seat.z, sx = Math.cos(c.heading), sz = -Math.sin(c.heading);
  P.x = c.x + c.fx * lz + sx * lx; P.z = c.z + c.fz * lz + sz * lx; P.y = 0.5; P.vx = P.vz = 0; P.vy = 0; P.crouch = 0.6; P.sprinting = false;
  P.stam = Math.min(100, P.stam + 12 * dt);
  // the end of the line (the road runs out and the bus just sits there)
  if (Math.abs(c.speed) < 0.3 && !(c.stopT > 0)) R.stillT += dt; else R.stillT = 0;
  if (R.stillT > 6) { BS_STATE.kicked++; bsGetOff(K, 'END OF THE LINE. THE DRIVER TURNS THE ENGINE OFF'); return false; }
  // it's stopped at a stop: off you get if you rang
  if (c.stopT > 0 && Math.abs(c.speed) < 0.5 && R.bell) { R.bell = false; bsGetOff(K, 'YOU STEP OFF THE BUS'); return false; }
  // chatter
  R.chatT -= dt;
  if (R.chatT <= 0 && c.cabin && c.cabin.folk.length) { R.chatT = mr(5, 10); const f = mpick(c.cabin.folk); K.say({ g: f.g }, mpick(R.night ? BS_NIGHTERS : BS_RIDERS)); }
  Object.assign(bsRideRoof, { x0: c.x - 6.5, x1: c.x + 6.5, z0: c.z - 6.5, z1: c.z + 6.5, h: 3.4 });
  return true;
}

// =====================================================================
// E: the bus door, the bell, the ticket office, the tea hatch
// =====================================================================
function bsTicketMenu(K) {
  const P = K.player, day = K.G.day;
  return {
    cash: () => P.cash,
    items: () => [
      { id: 'bs_rider', name: 'DAY RIDER', price: 6, desc: 'Any bus, any route, as often as you like, until midnight. Night buses too.' },
      { id: 'bs_map', name: 'COUNTY BUS MAP', price: 1, desc: 'The X9, the X4, the night buses, every shelter. Folded wrong.' },
    ],
    state: (it) => (it.id === 'bs_rider' && BS_STATE.rider === day ? 'owned' : ''),
    buy(it) {
      if (it.id === 'bs_rider' && BS_STATE.rider === day) return 'YOU\'VE GOT ONE FOR TODAY';
      if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`;
      P.cash -= it.price; K.sfx.cash();
      if (it.id === 'bs_rider') { BS_STATE.rider = day; return 'DAY RIDER. SHOW IT TO THE DRIVER'; }
      return 'X9: PORT HALDEN - ROUTE 9 BUS STATION - ASHFORD. X4: PORT HALDEN - LEISURE PARK - SALTMARSH DOCKS';
    },
  };
}
const BS_TEA = [
  { id: 'bs_tea', name: 'TEA IN A POLYSTYRENE CUP', price: 1, heal: 6, cool: true, desc: 'Stewed. Calms you down (+6).' },
  { id: 'bs_roll', name: 'BACON ROLL', price: 3, heal: 22, desc: 'Brown sauce or red? (+22)' },
  { id: 'bs_pasty', name: 'PASTY', price: 2, heal: 16, desc: 'Molten in the middle (+16).' },
];
function bsTeaMenu(K) { const P = K.player; return { cash: () => P.cash, items: () => BS_TEA, state: () => '', buy(it) { if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`; P.cash -= it.price; K.sfx.cash(); P.hp = Math.min(100, P.hp + it.heal); if (it.cool) K.coolHeat(4); return mpick(['THERE YOU GO', 'BROWN SAUCE IS ON THE SIDE', 'CAREFUL, IT\'S HOT']); } }; }
const bsOfficeOpen = (hr) => hr >= 6 && hr < 22;
function bsUseTarget(K) {
  const P = K.player, R = BS_STATE.ride;
  if (R) return { kind: R.bus.stopT > 0 && Math.abs(R.bus.speed) < 0.5 ? 'off' : 'bell', first: true };
  const c = bsDoorBus(K); if (c) return { kind: 'board', c };
  if (!station.built || P.car || P.hide || P.mode !== 'move' || !inStation(P.x, P.z) || P.y > 0.8) return null;
  if (Math.hypot(P.x - station.office.x, P.z - station.office.z) < 2.4 && P.z > -27) return { kind: 'office' };
  if (Math.hypot(P.x - station.tea.x, P.z - station.tea.z) < 2.4 && P.z > -27) return { kind: 'tea' };
  return null;
}
function bsUsePrompt(T, K, useK) {
  if (T.kind === 'bell') return BS_STATE.ride.bell ? 'STOPPING at the next stop' : `${useK} to ring the bell (off at the next stop)`;
  if (T.kind === 'off') return `${useK} to get off here`;
  if (T.kind === 'board') { const c = T.c, fare = BS_STATE.rider === K.G.day ? 0 : busFare(K.hour); return `${useK} to get on ${c.cb ? `the ${nightBusTime(K.hour) ? c.cb.night : c.cb.id} to ${c.cb.dest}` : 'the bus'} (${fare ? '$' + fare : 'DAY RIDER'})`; }
  if (T.kind === 'office') return bsOfficeOpen(K.hour) ? `${useK} for tickets (DAY RIDER $6)` : 'The ticket office is shut';
  if (T.kind === 'tea') return bsOfficeOpen(K.hour) ? `${useK} for the tea hatch` : 'The tea hatch is shut';
  return '';
}
function bsUse(T, K) {
  if (T.kind === 'bell') { const R = BS_STATE.ride; if (!R.bell) { R.bell = true; R.bellAt = K.time; BS_STATE.bells++; K.sfx.ding && K.sfx.ding(); K.showMsg('DING! BUS STOPPING', 1.4); } return; }
  if (T.kind === 'off') { bsGetOff(K, 'YOU STEP OFF THE BUS'); return; }
  if (T.kind === 'board') { bsBoard(T.c, K); return; }
  if (!bsOfficeOpen(K.hour)) { K.showMsg('SHUT. OPEN 6 TILL 10', 1.6); return; }
  if (T.kind === 'office') { K.openMenu({ name: 'ROUTE 9 BUS STATION · TICKETS', kind: 'buses', blurbs: ['"SINGLE OR DAY RIDER?"', '"THE X9\'S RUNNING LATE. THE X9 IS ALWAYS RUNNING LATE."', '"NIGHT BUSES FROM ELEVEN. GOD HELP YOU."'] }, bsTicketMenu(K)); return; }
  if (T.kind === 'tea') K.openMenu({ name: 'THE TEA HATCH', kind: 'buses', blurbs: ['"MILK AND SUGAR?"', '"LAST ONE, THAT ROLL. LUCKY YOU."'] }, bsTeaMenu(K));
}

// =====================================================================
// The departures board: where each county bus has got to
// =====================================================================
function bsWhere(c) {
  const city = cityAt(c.x, c.z, 0);
  const toward = c.cb.axis === 'x' ? (c.fx > 0 ? 296 - c.x : c.x - 300) : null;
  if (c.stopT > 0 && Math.hypot(c.x - 296, c.z + 3.4) < 40) return 'AT THE STAND';
  if (toward != null && toward > 0 && toward < 90) return 'DUE';
  if (toward != null && toward > 0 && toward < 280) return 'APPROACHING';
  if (city) return `IN ${city.name}`;
  if (c.cb.axis === 'x') return toward > 0 ? 'ON ROUTE 9' : 'DEPARTED';
  return 'ON ROUTE 4';
}
function bsDrawBoard(K) {
  const S = station, x = S.boardCanvas.getContext('2d'), night = nightBusTime(K.hour);
  x.fillStyle = '#0a0a10'; x.fillRect(0, 0, 512, 160);
  x.fillStyle = '#ffb020'; x.font = 'bold 22px monospace'; x.textAlign = 'left';
  x.fillText(night ? 'NIGHT BUSES' : 'DEPARTURES', 12, 26); x.textAlign = 'right'; const hh = Math.floor(K.hour), mm = Math.floor((K.hour % 1) * 60); x.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 500, 26);
  x.textAlign = 'left'; x.font = 'bold 19px monospace';
  const rows = bsCounty(K).filter((c) => c.cb.axis === 'x').map((c) => [night ? c.cb.night : c.cb.id, c.cb.dest, bsWhere(c)]);
  rows.push([night ? 'N4' : 'X4', 'SALTMARSH DOCKS', 'FROM PORT HALDEN']);
  rows.slice(0, 4).forEach((r, i) => { const y = 58 + i * 26; x.fillStyle = '#ffb020'; x.fillText(r[0], 12, y); x.fillText(r[1], 70, y); x.fillStyle = r[2] === 'DUE' || r[2] === 'AT THE STAND' ? '#7aff7a' : '#ffb020'; x.textAlign = 'right'; x.fillText(r[2], 500, y); x.textAlign = 'left'; });
  S.boardTex.needsUpdate = true;
}

// =====================================================================
// Each frame
// =====================================================================
function bsUpdate(dt, K) {
  if (!BS_STATE.spawned) { BS_STATE.spawned = true; bsSpawnCounty(K); }
  const night = nightBusTime(K.hour);
  for (const c of bsCounty(K)) if (K.near(c.x, c.z, 200)) bsBlind(c, night);
  if (BS_STATE.ride && BS_STATE.ride.bus.cabin) {
    const R = BS_STATE.ride, C = R.bus.cabin;
    for (const f of C.folk) f.p.head.rotation.y = Math.sin(K.time * 0.5 + f.st.z) * 0.4; // looking out of the window
  }
  if (!BS_STATE.ride) bsRideRoof.h = -99;
  if (station.built && K.near(296, -30, 90)) {
    station.boardT = (station.boardT || 0) - dt;
    if (station.boardT <= 0) { station.boardT = 1; bsDrawBoard(K); }
    if (station.welcomed !== K.G.day && K.near(296, -20, 30)) { station.welcomed = K.G.day; K.banner(`ROUTE 9 BUS STATION<small>X9 TO ASHFORD AND PORT HALDEN · NIGHT BUSES FROM 11 · DAY RIDER $6</small>`, 4); }
  }
  BS_STATE.msgT = Math.max(0, BS_STATE.msgT - dt);
  // first time you're stood at a stop with a bus pulling in
  const c = bsDoorBus(K);
  if (c && BS_STATE.msgT <= 0 && !BS_STATE.ride) { BS_STATE.msgT = 25; K.showMsg(`THE BUS IS IN. ${K.isTouch ? 'USE' : 'E'} AT THE FRONT DOOR TO GET ON`, 1.8); }
}
function bsConspic(K) {
  const P = K.player, R = BS_STATE.ride;
  if (R) return R.night ? -0.24 : -0.3; // one more face at a bus window
  if (P.car) return 0;
  if (inStation(P.x, P.z) || (P.x > 266 && P.x < 326 && P.z > -16 && P.z < -7)) return -0.1; // waiting for a bus, like everyone else
  return 0;
}
export const buses = {
  name: 'buses', roofs: bsRoofs,
  useTarget: bsUseTarget, usePrompt: bsUsePrompt, use: bsUse, conspic: bsConspic, update: bsUpdate, ride: bsRide, plan: () => false,
  riding: (c) => !!BS_STATE.ride && (!c || BS_STATE.ride.bus === c), logic: busLogic,
  reset() { if (BS_STATE.ride) { const c = BS_STATE.ride.bus; if (c.cabin) c.cabin.g.visible = false; } Object.assign(BS_STATE, { ride: null, rides: 0, fares: 0, rider: 0, bells: 0, refused: 0, nightRides: 0, stops: 0, msgT: 0, kicked: 0, spawned: false }); station.welcomed = 0; bsRideRoof.h = -99; },
  diary(K) { const b = []; if (BS_STATE.rider === K.G.day) b.push('A DAY RIDER FOR THE BUSES'); if (BS_STATE.ride) b.push('ON THE BUS'); return b; },
  debug: (K) => ({ built: station.built, lockers: station.lockers.length, county: K ? bsCounty(K).map((c) => ({ id: c.cb.id, x: Math.round(c.x), z: Math.round(c.z), stopT: c.stopT, where: bsWhere(c) })) : [], ...BS_STATE, ride: BS_STATE.ride ? { t: BS_STATE.ride.t, bell: BS_STATE.ride.bell, bus: BS_STATE.ride.bus.cb ? BS_STATE.ride.bus.cb.id : 'city' } : null }),
  station, BS_STATE, BS_CLEAR, BS_STOPS, bsDoor, bsDoorBus, bsBoard, bsGetOff, busFare, nightBusTime, bsTicketMenu, bsCounty,
};
