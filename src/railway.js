// COUNTY RAIL: a railway along the top of the map, from a tunnel west of PORT HALDEN to a tunnel east of
// ASHFORD, with three stations on the way.
//  - PORT HALDEN CENTRAL, just north of the city: a booking hall with a ticket office and machines, a line of
//    ticket barriers, a long platform under a canopy, a departures board. ASHFORD has a smaller copy at the
//    top of a path up from the town. WHEATLEY HALT, out in the fields between them, is a platform, a shelter
//    and a request stop: you pay the guard on the train.
//  - Buy a SINGLE ($4, one journey) or a DAY RETURN ($7, as many as you like today). Walk up to a barrier
//    with a ticket and press E and it opens. Or vault it: a member of staff who sees you will shout, and the
//    second time they ring the police.
//  - The train: three green and cream carriages. When it's in and the doors are open, E at any door gets you
//    a seat. E again gets you off at the next station. It goes all the way to the end of the line and you
//    get turfed off at the last stop.
//  - A ticket inspector comes down the train on most journeys. No ticket from a staffed station means a
//    penalty fare ($15), or off at the next stop and a call to the police if you can't pay. From WHEATLEY
//    HALT you can just buy one from him. Or lock yourself in the toilet when you hear him coming.
//  - Freight trains run through at night on the far track, and they don't stop. Neither line is a footpath.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, lerp, scene, textTex } from './core.js';
import { clearings, propBuf, glowBuf, groundBuf, markBuf, addCollider, addRoof, worldHooks, navOpen, keepClear } from './world.js';
import { interiorZones } from './interiors.js';
import { lifeSpots } from './streets.js';
import { buildPerson, lam, SKINS, HAIRS, SHIRTS, PANTS } from './people.js';

// =====================================================================
// Where everything is
// =====================================================================
export const RW_TZ = -270, RW_FZ = -276; // the passenger line, and the freight line behind it
export const RW_X0 = -165, RW_X1 = 905; // the tunnel mouths
clearings.push({ x0: -300, x1: 1011, z0: -280, z1: -245 });
// stations: x is the middle of the platform. `staffed` stations have a booking hall and barriers
export const RW_STATIONS = [
  { id: 'ph', name: 'PORT HALDEN CENTRAL', short: 'PORT HALDEN', x: 0, staffed: true, gates: [], built: false },
  { id: 'wh', name: 'WHEATLEY HALT', short: 'WHEATLEY', x: 380, staffed: false, gates: [], built: false },
  { id: 'ash', name: 'ASHFORD', short: 'ASHFORD', x: 700, staffed: true, gates: [], built: false },
];
// footpaths from the stations down to the nearest road
const RW_PATHS = [{ x: 700, z0: -245, z1: -181 }, { x: 380, z0: -258, z1: -178 }];
for (const p of RW_PATHS) clearings.push({ x0: p.x - 3, x1: p.x + 3, z0: p.z0 - 1, z1: p.z1 });
export const RW_STATE = { ride: null, ticket: null, rides: 0, fares: 0, fines: 0, dodged: 0, vaults: 0, warned: 0, inspections: 0, loo: 0, hits: 0, freight: 0, msgT: 0, opened: 0, boardT: 0, boarded: [] };
export const rwRoofs = [];
const rwRideRoof = { x0: 0, x1: 0, z0: 0, z1: 0, h: -99 };
rwRoofs.push(rwRideRoof);
const RW_GREEN = 0x2a5a3a, RW_CREAM = 0xe8dcb8, RW_BRICK = 0x9a5a3a;
// the booking hall, relative to the station's x: barriers across it at z -252, platform beyond
const RW_HALL = { dx0: -26, dx1: 26, z0: -258, z1: -244, H: 6.5, gateZ: -252 };
const RW_GATE_X = [-3.9, -1.3, 1.3, 3.9];
export const rwInHall = (S, x, z) => S.staffed && x > S.x + RW_HALL.dx0 && x < S.x + RW_HALL.dx1 && z > RW_HALL.z0 && z < RW_HALL.z1;
export const rwOnPlatform = (S, x, z) => x > S.x - 48 && x < S.x + 48 && z > -268.4 && z < (S.staffed ? -258 : -259);
export const rwStationAt = (x, z) => RW_STATIONS.find((S) => x > S.x - 50 && x < S.x + 50 && z > -269 && z < -240) || null;
export const rwTrainsRun = (hr) => hr >= 5.5;

// =====================================================================
// Building it
// =====================================================================
function rwWall(x0, x1, z0, z1, h, col, y0 = 0) { propBuf.box(x0, x1, y0, h, z0, z1, col); return addCollider(x0, x1, z0, z1, h, { y0 }); }
function rwPlane(w, h, tex, x, y, z, ry = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; }
function rwTrack(z, x0, x1) {
  groundBuf.flat(x0, x1, z - 1.7, z + 1.7, 0.012, 0x6e6a62); // ballast
  for (let x = x0 + 0.3; x < x1; x += 0.9) markBuf.flat(x - 0.13, x + 0.13, z - 1.25, z + 1.25, 0.022, 0x4a3a2a); // sleepers
  for (let x = x0; x < x1; x += 60) for (const s of [-0.72, 0.72]) propBuf.box(x, Math.min(x1, x + 60), 0.02, 0.17, z + s - 0.04, z + s + 0.04, 0x8a8a92);
}
function rwPortal(x, out) { // a grassy hill with the tunnel mouth in it
  const x0 = out < 0 ? x - 40 : x, x1 = out < 0 ? x : x + 40;
  propBuf.box(x0, x1, 0, 12, -287, -253, 0x4f7d3e); addCollider(x0, x1, -287, -253, 12);
  const fx = out < 0 ? x1 + 0.05 : x0 - 0.05;
  propBuf.box(Math.min(fx, fx - out * 0.6), Math.max(fx, fx - out * 0.6), 0, 7.4, -280, -266.5, 0x8a7a6a);
  propBuf.box(Math.min(fx, fx - out * 0.65), Math.max(fx, fx - out * 0.65), 0, 6, -278.6, -267.8, 0x0a0a0c);
}
function rwBench(x, z, face) { propBuf.box(x - 1.2, x + 1.2, 0.42, 0.5, z - 0.25, z + 0.25, RW_GREEN); propBuf.box(x - 1.2, x + 1.2, 0.5, 1.0, z + (face ? -0.25 : 0.2), z + (face ? -0.2 : 0.25), RW_GREEN); addCollider(x - 1.2, x + 1.2, z - 0.25, z + 0.25, 0.5); for (const o of [-0.6, 0.6]) lifeSpots.push({ kind: 'bench', x: x + o, z: z + (face ? 0.8 : -0.8), face: face ? 0 : Math.PI, sx: x + o, sz: z }); }
function rwPlatform(S) {
  const x0 = S.x - 48, x1 = S.x + 48;
  groundBuf.flat(x0, x1, -268.3, S.staffed ? -258 : -259, 0.016, 0x9a948c);
  markBuf.flat(x0, x1, -268.0, -267.7, 0.024, 0xe0c020); // stand behind the yellow line
  // the canopy, over the middle of the platform
  const c0 = S.x - (S.staffed ? 30 : 8), c1 = S.x + (S.staffed ? 30 : 8);
  propBuf.box(c0, c1, 3.8, 4.1, -266.5, -259, RW_GREEN, { bottom: true }); addRoof(c0, c1, -266.5, -259, 4.1, { y0: 3.8 }); rwRoofs.push({ x0: c0, x1: c1, z0: -266.5, z1: -259, h: 3.8 });
  for (let x = c0 + 2; x < c1; x += 8) { propBuf.cyl(x, -261, 0.1, 0.1, 0, 3.8, 0x2a3a2a, 6); addCollider(x - 0.12, x + 0.12, -261.12, -260.88, 3.8); }
  for (let x = c0 + 1; x < c1 - 1; x += 4) glowBuf.box(x, x + 1.4, 3.75, 3.8, -264, -263.7, 0xf0f8ff);
  for (let x = S.x - (S.staffed ? 24 : 4); x <= S.x + (S.staffed ? 24 : 4); x += 12) rwBench(x, -262, true);
  // the station name boards along the platform
  const tex = textTex(512, 80, '#2a5a3a', '#f0ead0', [S.name], 'bold 40px Georgia, serif');
  for (const dx of [-40, -12, 12, 40]) { if (!S.staffed && Math.abs(dx) > 20) continue; for (const s of [-1.2, 1.2]) propBuf.box(S.x + dx + s - 0.05, S.x + dx + s + 0.05, 0, 2.6, -260.05, -259.95, 0x2a3a2a); rwPlane(3.2, 0.5, tex, S.x + dx, 2.4, -260.1, Math.PI); }
  // a fence along the back of the platform (and across the ends) so the only way on is through the station
  const back = S.staffed ? -258 : -259;
  const fence = (a, b) => { if (b - a < 0.3) return; propBuf.box(a, b, 0, 1.8, back - 0.05, back + 0.05, 0x3a4a3a); addCollider(a, b, back - 0.08, back + 0.08, 1.8); };
  if (S.staffed) { fence(x0, S.x + RW_HALL.dx0); fence(S.x + RW_HALL.dx1, x1); } else { fence(x0, S.x - 2); fence(S.x + 2, x1); }
  for (const x of [x0, x1]) { propBuf.box(x - 0.05, x + 0.05, 0, 1.8, -268.3, back, 0x3a4a3a); addCollider(x - 0.08, x + 0.08, -267.0, back, 1.8); } // (the last metre by the edge is open: you can always get down on to the line)
  for (let x = x0 + 8; x < x1; x += 16) { propBuf.box(x - 0.06, x + 0.06, 0, 4.2, -259.6, -259.5, 0x2a2e32); glowBuf.box(x - 0.3, x + 0.3, 4.1, 4.2, -260, -259.3, 0xfff0c8); }
}
function rwHall(S) {
  const H = RW_HALL, x0 = S.x + H.dx0, x1 = S.x + H.dx1, h = H.H, z0 = H.z0, z1 = H.z1;
  groundBuf.flat(x0, x1, z0, z1, 0.02, 0xc8bca8);
  rwWall(x0 - 0.3, x0, z0, z1, h, RW_BRICK); rwWall(x1, x1 + 0.3, z0, z1, h, RW_BRICK);
  // the front, on to the street: doors in the middle
  for (const [a, b] of [[x0, S.x - 4], [S.x + 4, x1]]) rwWall(a, b, z1, z1 + 0.3, h, RW_BRICK);
  propBuf.box(S.x - 4, S.x + 4, 3.4, h, z1, z1 + 0.3, RW_BRICK);
  navOpen.push({ x0: S.x - 3.6, x1: S.x + 3.6, z0: z1 - 1.5, z1: z1 + 1.5 }); keepClear.push({ x0: S.x - 5, x1: S.x + 5, z0: z1 - 2, z1: z1 + 6 });
  rwPlane(16, 1.6, textTex(1024, 100, '#2a5a3a', '#f0ead0', [S.name], 'bold 64px Georgia, serif'), S.x, 4.8, z1 + 0.32, 0);
  // the back, on to the platform: a wide opening in the middle
  for (const [a, b] of [[x0, S.x - 8], [S.x + 8, x1]]) rwWall(a, b, z0 - 0.3, z0, h, RW_BRICK);
  propBuf.box(S.x - 8, S.x + 8, 3.6, h, z0 - 0.3, z0, RW_BRICK);
  navOpen.push({ x0: S.x - 7.5, x1: S.x + 7.5, z0: z0 - 1.5, z1: z0 + 1.5 });
  propBuf.box(x0 - 0.3, x1 + 0.3, h, h + 0.3, z0 - 0.3, z1 + 0.3, 0x4a3a3a, { bottom: true }); addRoof(x0 - 0.3, x1 + 0.3, z0 - 0.3, z1 + 0.3, h + 0.3, { y0: h });
  rwRoofs.push({ x0, x1, z0, z1, h });
  for (let x = x0 + 4; x < x1 - 2; x += 8) glowBuf.box(x - 1.2, x + 1.2, h - 0.08, h - 0.03, -252, -250, 0xfff2d0);
  interiorZones.push({ x0, x1, z0, z1, y0: -0.5, y1: h - 0.2, name: S.name });
  // the barrier line: cabinets with gates between them, glass screens out to the walls
  const gz = H.gateZ;
  const gx = RW_GATE_X.map((d) => S.x + d);
  const glass = (a, b) => { propBuf.box(a, b, 0, 0.3, gz - 0.1, gz + 0.1, 0x3a3a40); propBuf.box(a, b, 0.3, 1.9, gz - 0.04, gz + 0.04, 0x9ac8e0, { glass: true }); addCollider(a, b, gz - 0.12, gz + 0.12, 1.9); };
  glass(x0, gx[0] - 1.05); glass(gx[gx.length - 1] + 1.05, x1);
  for (let k = 0; k <= gx.length; k++) {
    const a = k === 0 ? gx[0] - 1.05 : gx[k - 1] + 0.55, b = k === gx.length ? gx[k - 1] + 1.05 : gx[k] - 0.55;
    if (b - a < 0.1) continue;
    propBuf.box(a, b, 0, 1.05, gz - 0.6, gz + 0.6, 0x3a3a40); addCollider(a, b, gz - 0.6, gz + 0.6, 1.05);
    glowBuf.box(a + 0.05, b - 0.05, 1.05, 1.07, gz + 0.3, gz + 0.5, 0x6aff6a);
  }
  for (const x of gx) {
    const c = addCollider(x - 0.55, x + 0.55, gz - 0.08, gz + 0.08, 1.05);
    const paddles = [];
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.05), new THREE.MeshLambertMaterial({ color: 0xc02a2a, transparent: true, opacity: 0.85 })); m.position.set(x + s * 0.27, 0.75, gz); scene.add(m); paddles.push(m); }
    S.gates.push({ x, z: gz, c, paddles, openT: 0, byPlayer: 0 });
    navOpen.push({ x0: x - 0.45, x1: x + 0.45, z0: gz - 1.2, z1: gz + 1.2 });
  }
  // the ticket office (west) and the machines (east)
  S.office = { x: S.x - 18, z: -247.6 };
  propBuf.box(S.x - 24, S.x - 12, 0, 1.1, -246.6, -245.8, RW_GREEN); addCollider(S.x - 24, S.x - 12, -246.6, -245.8, 1.1); propBuf.box(S.x - 24, S.x - 12, 1.1, 2.6, -246.25, -246.15, 0x9ac8e0, { glass: true });
  rwWall(S.x - 24, S.x - 23.8, -245.8, z1, 2.6, RW_GREEN); rwWall(S.x - 12.2, S.x - 12, -245.8, z1, 2.6, RW_GREEN);
  rwPlane(6, 0.8, textTex(512, 80, '#2a5a3a', '#ffffff', ['TICKETS · TRAVEL CENTRE'], 'bold 40px Arial'), S.x - 18, 3.0, -246.7, Math.PI);
  S.machines = [];
  for (const dx of [14, 16, 18]) { propBuf.box(S.x + dx - 0.4, S.x + dx + 0.4, 0, 1.8, -245.0, -244.3, 0x2a6a4a); glowBuf.box(S.x + dx - 0.25, S.x + dx + 0.25, 1.1, 1.5, -245.04, -245.0, 0x9ad0ff); addCollider(S.x + dx - 0.4, S.x + dx + 0.4, -245.0, -244.3, 1.8); S.machines.push({ x: S.x + dx, z: -245.8 }); }
  // the departures board, over the barriers
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192; S.boardCanvas = cv; S.boardTex = new THREE.CanvasTexture(cv); S.boardTex.colorSpace = THREE.SRGBColorSpace;
  for (const [z, ry] of [[gz + 0.06, 0], [gz - 0.06, Math.PI]]) rwPlane(6.4, 2.4, S.boardTex, S.x, 3.6, z, ry);
  propBuf.box(S.x - 3.3, S.x + 3.3, 2.35, 4.85, gz - 0.05, gz + 0.05, 0x1a1a1e);
  for (const s of [-1, 1]) propBuf.box(S.x + s * 3 - 0.04, S.x + s * 3 + 0.04, 4.85, h, gz - 0.04, gz + 0.04, 0x2a2a2e);
  // benches in the booking hall
  for (const dx of [-8, 8]) rwBench(S.x + dx, -248.4, false);
  // the member of staff at the gates
  S.staffPos = { x: S.x + 6.4, z: gz + 1.2 };
}
function rwHalt(S) { // the shelter, a help point and a sign: REQUEST STOP
  propBuf.box(S.x - 3, S.x + 3, 2.6, 2.75, -263, -259.4, RW_GREEN, { bottom: true }); addRoof(S.x - 3, S.x + 3, -263, -259.4, 2.75, { y0: 2.6 }); rwRoofs.push({ x0: S.x - 3, x1: S.x + 3, z0: -263, z1: -259.4, h: 2.6 });
  propBuf.box(S.x - 3, S.x + 3, 0.1, 2.6, -259.5, -259.4, 0x9ac8e0, { glass: true }); addCollider(S.x - 3, S.x + 3, -259.55, -259.35, 2.6);
  rwPlane(2.6, 0.9, textTex(300, 100, '#f0ead0', '#2a5a3a', ['REQUEST STOP', 'PAY ON THE TRAIN'], 'bold 30px Arial'), S.x + 5, 1.8, -259.3, Math.PI);
  propBuf.box(S.x + 4.9, S.x + 5.1, 0, 1.4, -259.4, -259.2, 0x8a8a90);
  S.machines = []; S.office = null;
}
function rwBuild() {
  rwTrack(RW_TZ, RW_X0 - 30, RW_X1 + 30); rwTrack(RW_FZ, RW_X0 - 30, RW_X1 + 30);
  rwPortal(RW_X0, -1); rwPortal(RW_X1, 1);
  for (const S of RW_STATIONS) { rwPlatform(S); if (S.staffed) rwHall(S); else rwHalt(S); S.built = true; }
  // the paths down to the roads, and a short one in front of PORT HALDEN CENTRAL
  for (const p of RW_PATHS) { groundBuf.flat(p.x - 2, p.x + 2, p.z0, p.z1, 0.014, 0x9a948c); for (let z = p.z0 + 8; z < p.z1; z += 16) { propBuf.box(p.x + 2.3, p.x + 2.4, 0, 4, z - 0.05, z + 0.05, 0x2a2e32); glowBuf.box(p.x + 2.1, p.x + 2.6, 3.9, 4.0, z - 0.2, z + 0.2, 0xfff0c8); } }
  groundBuf.flat(-6, 6, -244, -239, 0.014, 0x9a948c);
  // a footbridge at each staffed station, over both lines at the west end (scenery: you can't get up it)
  for (const S of RW_STATIONS) if (S.staffed) { const x = S.x - 44; propBuf.box(x - 1.2, x + 1.2, 5.6, 6.0, -279, -258, 0x5a6a5a); for (const s of [-1.2, 1.2]) propBuf.box(x + s - 0.05, x + s + 0.05, 6.0, 7.1, -279, -258, 0x5a6a5a); for (const z of [-279, -273, -258.5]) { propBuf.box(x - 1.3, x - 1.1, 0, 5.6, z - 0.1, z + 0.1, 0x5a6a5a); propBuf.box(x + 1.1, x + 1.3, 0, 5.6, z - 0.1, z + 0.1, 0x5a6a5a); addCollider(x - 1.3, x + 1.3, z - 0.1, z + 0.1, 5.6); } }
}
worldHooks.beforeBake.push(rwBuild);

// =====================================================================
// The trains
// =====================================================================
const RW_CAR_L = 16, RW_GAP = 0.6, RW_CARS = [-(RW_CAR_L + RW_GAP), 0, RW_CAR_L + RW_GAP];
export const RW_HALF = (RW_CAR_L * 3 + RW_GAP * 2) / 2;
const RW_FLOOR = 1.0;
const rwBodyMat = lam(RW_GREEN), rwCreamMat = lam(RW_CREAM), rwDarkMat = lam(0x1a1a1e);
const rwWinDay = new THREE.MeshLambertMaterial({ color: 0x2a3a4a }), rwWinNight = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
function rwMakeTrain(freight) {
  const g = new THREE.Group(), wins = [], doors = [];
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  if (!freight) {
    for (const cx of RW_CARS) {
      add(new THREE.BoxGeometry(RW_CAR_L, 2.2, 3.0), rwBodyMat, cx, 1.6, 0);
      add(new THREE.BoxGeometry(RW_CAR_L, 1.0, 3.0), rwCreamMat, cx, 3.2, 0);
      add(new THREE.BoxGeometry(RW_CAR_L - 0.4, 0.3, 2.8), rwDarkMat, cx, 3.85, 0);
      wins.push(add(new THREE.BoxGeometry(RW_CAR_L - 1.2, 0.9, 3.04), rwWinDay, cx, 2.4, 0));
      add(new THREE.BoxGeometry(RW_CAR_L - 2, 0.5, 2.2), rwDarkMat, cx, 0.35, 0);
      for (const d of [-5, 5]) for (const s of [-1, 1]) { const m = add(new THREE.BoxGeometry(1.3, 2.4, 0.06), rwCreamMat, cx + d, 1.95, s * 1.52); if (s > 0) doors.push(m); }
    }
    for (const s of [-1, 1]) { const end = s * RW_HALF; add(new THREE.BoxGeometry(0.2, 1.2, 2.6), rwCreamMat, end + s * 0.05, 2.5, 0); add(new THREE.BoxGeometry(0.1, 0.25, 2.0), new THREE.MeshBasicMaterial({ color: 0xffffe0 }), end + s * 0.16, 1.0, 0); add(new THREE.BoxGeometry(0.1, 0.6, 2.8), lam(0xe0c020), end + s * 0.12, 1.5, 0); }
  } else {
    const n = 9, L = 13; let x = -((n * (L + 0.8)) / 2);
    for (let k = 0; k < n; k++) {
      const cx = x + L / 2; x += L + 0.8;
      if (k === 0) { add(new THREE.BoxGeometry(L, 3.4, 2.9), lam(0x2a2a6a), cx, 2.2, 0); add(new THREE.BoxGeometry(0.1, 0.3, 2.0), new THREE.MeshBasicMaterial({ color: 0xffffe0 }), cx - L / 2 - 0.06, 1.1, 0); continue; }
      add(new THREE.BoxGeometry(L, 0.4, 2.6), rwDarkMat, cx, 1.0, 0);
      if (k % 3 !== 2) add(new THREE.BoxGeometry(L - 0.6, 2.6, 2.5), lam(mpick([0xb0302a, 0x2a5aa0, 0x2a8a4a, 0xd0902a, 0x6a6a70, 0xc85a1a])), cx, 2.5, 0);
    }
  }
  g.visible = false; scene.add(g);
  return { g, wins, doors, freight };
}
// state: 'tunnel' (waiting out of sight), 'run', 'dwell' (in a station, doors open)
const rwPax = { id: 'pax', z: RW_TZ, x: RW_X0 - 60, dir: 1, v: 0, state: 'tunnel', waitT: 3, dwellT: 0, stopAt: null, served: null, mesh: null, cruise: 26, len: RW_HALF };
const rwFreight = { id: 'freight', z: RW_FZ, x: RW_X1 + 80, dir: -1, v: 0, state: 'tunnel', waitT: 30, cruise: 22, mesh: null, len: 60 };
export const rwTrains = [rwPax, rwFreight];
const rwNextStation = (T) => RW_STATIONS.filter((S) => (S.x - T.x) * T.dir > 0.5 && S !== T.served).sort((a, b) => (a.x - b.x) * T.dir)[0] || null;
const rwTerminus = (T) => (T.dir > 0 ? RW_STATIONS[RW_STATIONS.length - 1] : RW_STATIONS[0]);
function rwStepTrain(T, dt, K) {
  if (!T.mesh) T.mesh = rwMakeTrain(T.id === 'freight');
  const hr = K.hour;
  if (T.state === 'tunnel') {
    T.mesh.g.visible = false; T.v = 0;
    T.waitT -= dt;
    const ok = T.id === 'pax' ? rwTrainsRun(hr) : (hr >= 21 || hr < 6.5);
    if (T.waitT <= 0 && ok) { T.state = 'run'; T.dir = -T.dir; T.x = T.dir > 0 ? RW_X0 - T.len - 5 : RW_X1 + T.len + 5; T.v = T.cruise * 0.7; T.served = null; if (T.id === 'freight') RW_STATE.freight++; }
    return;
  }
  T.mesh.g.visible = true;
  if (T.state === 'dwell') {
    T.v = 0; T.dwellT -= dt;
    if (T.dwellT <= 0) { T.state = 'run'; RW_STATE.departed = (RW_STATE.departed || 0) + 1; if (K.near(T.x, T.z, 120)) K.sfx.whistle && K.sfx.whistle(); rwDoors(T, false); }
  } else {
    let want = T.cruise;
    if (T.id === 'pax') {
      const S = rwNextStation(T);
      if (S) {
        const d = Math.abs(S.x - T.x);
        want = Math.min(want, Math.sqrt(2 * 1.4 * d) + 0.6);
        if (d < 0.6) { T.x = S.x; T.v = 0; T.state = 'dwell'; T.dwellT = S.staffed ? 11 : 7; T.served = S; T.stopAt = S; rwArrive(T, S, K); return; }
      }
    }
    T.v += clamp(want - T.v, -2.6 * dt, 1.3 * dt);
    T.x += T.dir * T.v * dt;
    if ((T.dir > 0 && T.x - T.len > RW_X1 + 2) || (T.dir < 0 && T.x + T.len < RW_X0 - 2)) { T.state = 'tunnel'; T.waitT = T.id === 'pax' ? 6 : mr(40, 90); T.served = null; }
  }
  T.mesh.g.position.set(T.x, 0.15, T.z);
}
function rwDoors(T, open) { if (!T.mesh) return; for (const d of T.mesh.doors) d.position.z = open ? 1.58 : 1.52; T.open = open; }
// where you stand to get on: the doors on the platform side
export const rwDoorSpots = (T) => RW_CARS.flatMap((cx) => [-5, 5].map((d) => ({ x: T.x + cx + d, z: T.z + 2.3 })));
function rwArrive(T, S, K) {
  rwDoors(T, true);
  const R = RW_STATE.ride;
  if (R && R.train === T) {
    R.stops++;
    if (S === rwTerminus(T)) { rwGetOff(K, `${S.name}. THIS TRAIN TERMINATES HERE. ALL CHANGE`); return; }
    if (K.near(S.x, RW_TZ, 80)) K.showMsg(`THIS IS ${S.name}. ${K.isTouch ? 'USE' : 'E'} TO GET OFF`, 2.2);
  }
  // a few people get off, and head out through the barriers
  if (!K.near(S.x, -255, 140)) return;
  const n = Math.floor(mr(1, S.staffed ? 4 : 2.5));
  for (let k = 0; k < n; k++) {
    const D = mpick(rwDoorSpots(T)); const h = K.spawnCivAt(D.x, D.z); if (!h) continue;
    h.x = D.x; h.z = D.z;
    const route = S.staffed ? [[D.x, -263], [S.x + mpick(RW_GATE_X), -253.4], [S.x + mpick(RW_GATE_X), -250.6], [S.x, -245], [S.x + mr(-6, 6), -240]] : [[D.x, -263], [S.x, -260], [S.x, -256], [S.x, -200]];
    K.lifeGo(h, 'walk', route[route.length - 1][0], route[route.length - 1][1], null, 0.3, { route, ri: 0, oneWay: true, maxT: 80 });
  }
}

// =====================================================================
// Riding: your seat in the middle carriage, the inspector, the toilet
// =====================================================================
const rwCabMat = new THREE.MeshLambertMaterial({ color: 0xe0d8c4, side: THREE.DoubleSide });
const rwSeatMat = new THREE.MeshLambertMaterial({ color: 0x8a2a3a });
const RW_CHAT = ['IS THIS THE STOPPING SERVICE?', 'WE\'RE RUNNING LATE AGAIN', 'MIND THE GAP, SHE SAID. WHAT GAP?', 'LOVELY VIEW, THIS', 'I\'VE NEVER BEEN TO WHEATLEY. NOBODY HAS.', '...AND THE SIGNAL\'S GONE AGAIN', 'ANY MORE TICKETS FROM PORT HALDEN?'];
function rwCabin(T) {
  const M = T.mesh; if (M.cabin) { M.cabin.g.visible = true; return M.cabin; }
  const g = new THREE.Group(), W = 1.42, L = RW_CAR_L / 2 - 0.1;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, W * 2), lam(0x4a4a52)); floor.rotation.x = -Math.PI / 2; floor.position.y = RW_FLOOR - 0.15; g.add(floor);
  for (const s of [-1, 1]) for (const [y, hh] of [[RW_FLOOR + 0.4, 1.1], [3.25, 0.7]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, hh), rwCabMat); p.position.set(0, y, s * W); g.add(p); }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, W * 2), rwCabMat); roof.rotation.x = Math.PI / 2; roof.position.y = 3.6; g.add(roof);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 2.8), rwCabMat); e.rotation.y = Math.PI / 2; e.position.set(s * L, 2.2, 0); g.add(e); }
  const seats = [];
  for (let x = -L + 1.2; x < L - 0.8; x += 1.3) { if (Math.abs(Math.abs(x) - 5) < 1.0) continue; for (const s of [-1, 1]) { const z = s * (W - 0.5); const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.9), rwSeatMat); seat.position.set(x, RW_FLOOR - 0.1 + 0.45, z); g.add(seat); const bk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.9), rwSeatMat); bk.position.set(x - 0.28, RW_FLOOR + 0.75, z); g.add(bk); seats.push({ x, z }); } }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(L * 2 - 1, 0.04, 0.3), new THREE.MeshBasicMaterial({ color: 0xf0f8ff })); lamp.position.y = 3.55; g.add(lamp);
  // the toilet cubicle, at one end
  const loo = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 1.4), lam(0xd8d0c0)); loo.position.set(L - 0.75, RW_FLOOR + 1.0, -0.6); g.add(loo);
  const folk = [];
  for (let k = 0; k < 5; k++) {
    const st = seats[Math.floor(Math.random() * seats.length)]; if (folk.some((f) => f.st === st)) continue;
    const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: mpick(SHIRTS), pants: mpick(PANTS) });
    p.group.position.set(st.x, RW_FLOOR + 0.03, st.z); p.group.rotation.y = Math.PI / 2; p.legL.rotation.x = p.legR.rotation.x = -1.4; p.armL.rotation.x = p.armR.rotation.x = -0.4;
    g.add(p.group); folk.push({ p, g: p.group, st });
  }
  // the inspector: stands at the far end until he does his rounds
  const ins = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: 0x1a2a4a, pants: 0x1a1a2a }); ins.group.position.set(-L + 0.6, RW_FLOOR - 0.15, 0); ins.group.rotation.y = Math.PI / 2; ins.group.visible = false; g.add(ins.group);
  T.mesh.g.add(g);
  M.cabin = { g, seats, folk, ins, L, W };
  return M.cabin;
}
const rwHasTicket = (K) => { const t = RW_STATE.ticket; return !!t && t.day === K.G.day && (t.kind === 'return' || !t.used); };
export function rwTrainAtDoor(K) {
  const P = K.player, T = rwPax;
  if (P.car || P.hide || P.bike || P.mode !== 'move' || RW_STATE.ride || T.state !== 'dwell' || P.y > 1.4) return null;
  if (T.stopAt === rwTerminus(T)) return null; // (it's going on into the tunnel, empty)
  return rwDoorSpots(T).some((D) => Math.hypot(D.x - P.x, D.z - P.z) < 2.4) ? T : null;
}
export function rwBoard(T, K) {
  const P = K.player, S = T.stopAt;
  const chased = K.hunters().some((h) => !h.dead && h.state === 'chase' && Math.hypot(h.x - P.x, h.z - P.z) < 10);
  const C = rwCabin(T);
  const free = C.seats.filter((s) => !C.folk.some((f) => f.st === s));
  const seat = free.length ? free.reduce((a, b) => (Math.abs(b.x) < Math.abs(a.x) ? b : a)) : C.seats[0];
  RW_STATE.ride = { train: T, seat, t: 0, from: S, stops: 0, bell: false, insT: Math.random() < 0.7 ? mr(5, 12) : null, ins: null, loo: false, chatT: mr(4, 8), paid: rwHasTicket(K), unstaffed: S && !S.staffed };
  RW_STATE.rides++;
  if (RW_STATE.ticket && RW_STATE.ticket.day === K.G.day && RW_STATE.ticket.kind === 'single' && !RW_STATE.ticket.used) RW_STATE.ticket.used = true;
  T.dwellT = Math.max(T.dwellT, 2.5);
  const nx = rwNextStation(T);
  K.showMsg(`ON THE ${T.dir > 0 ? 'EASTBOUND' : 'WESTBOUND'} TRAIN${nx ? ' · NEXT STOP ' + nx.name : ''}${chased ? '. THE DOORS SHUT ON THEIR FACES' : ''}`, 2.6);
  if (chased) { T.dwellT = Math.min(T.dwellT, 2.5); RW_STATE.escaped = (RW_STATE.escaped || 0) + 1; }
}
export function rwGetOff(K, msg) {
  const R = RW_STATE.ride; if (!R) return;
  RW_STATE.ride = null;
  const P = K.player, T = R.train;
  if (T.mesh && T.mesh.cabin) { T.mesh.cabin.g.visible = false; T.mesh.cabin.ins.group.visible = false; }
  let p = null;
  for (const o of [0, 1.5, -1.5, 3, -3]) { const x = T.x + o, z = T.z + 3.2; if (!K.blocked(x, z, 0.35)) { p = { x, z }; break; } }
  if (!p) p = { x: T.x, z: T.z + 3.4 };
  P.x = p.x; P.z = p.z; P.y = 0; P.vx = P.vz = P.vy = 0; P.crouch = 0;
  rwRideRoof.h = -99;
  if (msg) K.showMsg(msg, 2.4);
}
function rwInspect(K) {
  const R = RW_STATE.ride, P = K.player;
  RW_STATE.inspections++;
  if (R.loo) { if (Math.random() < 0.75) { RW_STATE.dodged++; K.showMsg('A KNOCK ON THE TOILET DOOR. "ANYONE IN THERE?" ...HE MOVES ON', 2.4); return; } K.showMsg('"I KNOW YOU\'RE IN THERE. OUT YOU COME. TICKET?"', 2.2); R.loo = false; }
  if (K.G.level >= 2 && P.disg < 0.4 && Math.random() < 0.35) { K.addHeat(4); K.bumpLocal(0.06); RW_STATE.recognised = (RW_STATE.recognised || 0) + 1; }
  if (R.paid || rwHasTicket(K)) { K.showMsg(mpick(['"THANK YOU"', '"LOVELY, CHEERS"', '"THAT\'S FINE. ENJOY YOUR JOURNEY"']), 1.6); return; }
  if (R.unstaffed && P.cash >= 4) { P.cash -= 4; K.sfx.cash(); R.paid = true; RW_STATE.fares += 4; RW_STATE.ticket = { day: K.G.day, kind: 'single', used: true }; K.showMsg('"GOT ON AT WHEATLEY? THAT\'S $4 THEN." YOU PAY THE GUARD', 2.2); return; }
  if (P.cash >= 15) { P.cash -= 15; K.sfx.cash(); R.paid = true; RW_STATE.fines++; K.showMsg('"NO TICKET? THAT\'S A PENALTY FARE. $15." HE WRITES IT ALL DOWN', 2.4); return; }
  RW_STATE.fines++; R.throwOff = true; K.addHeat(5); K.report();
  K.showMsg('"NO TICKET AND NO MONEY? YOU\'RE OFF AT THE NEXT STOP. AND I\'M RADIOING AHEAD"', 2.6);
}
function rwRide(dt, K) {
  const R = RW_STATE.ride; if (!R) return false;
  const P = K.player, T = R.train, C = T.mesh && T.mesh.cabin;
  if (!P.alive) { rwGetOff(K); return false; }
  R.t += dt;
  P.x = T.x + R.seat.x + 0.1; P.z = T.z + R.seat.z; P.y = RW_FLOOR; P.vx = P.vz = P.vy = 0; P.crouch = 0.6; P.sprinting = false;
  if (R.loo) { P.x = T.x + C.L - 0.75; P.z = T.z - 0.6; P.crouch = 0; }
  P.stam = Math.min(100, P.stam + 14 * dt);
  // the inspector does his rounds
  if (R.insT != null && T.state === 'run') {
    R.insT -= dt;
    if (R.insT <= 4 && !R.insWarned) { R.insWarned = true; K.showMsg(`"TICKETS FROM ${R.from ? R.from.short : 'HERE'}, PLEASE!" THE INSPECTOR IS COMING DOWN THE TRAIN${rwHasTicket(K) || R.paid ? '' : `. ${K.isTouch ? 'USE' : 'E'} TO HIDE IN THE TOILET`}`, 2.8); if (C) C.ins.group.visible = true; }
    if (C && R.insWarned) { const f = clamp(1 - R.insT / 4, 0, 1); C.ins.group.position.x = lerp(-C.L + 0.6, R.seat.x - 0.7, f); }
    if (R.insT <= 0) { R.insT = null; rwInspect(K); R.insDone = true; if (C) C.ins.group.visible = false; }
  }
  if (C && R.insDone && !R.loo && R.chatT < 0) R.chatT = 0;
  if (T.state === 'dwell' && R.throwOff && R.stops > 0) { R.throwOff = false; rwGetOff(K, 'THE INSPECTOR WALKS YOU TO THE DOOR. "OFF."'); return false; }
  if (T.state === 'dwell' && R.bell && R.stops > 0) { rwGetOff(K, `YOU GET OFF AT ${T.stopAt ? T.stopAt.name : 'THE STATION'}`); return false; }
  R.chatT -= dt;
  if (R.chatT <= 0 && C && C.folk.length) { R.chatT = mr(6, 12); K.say({ g: mpick(C.folk).g }, mpick(RW_CHAT)); }
  Object.assign(rwRideRoof, { x0: T.x - RW_HALF, x1: T.x + RW_HALF, z0: T.z - 1.6, z1: T.z + 1.6, h: 3.8 });
  return true;
}

// =====================================================================
// Tickets: the office, the machines, the gates
// =====================================================================
function rwTicketMenu(K) {
  const P = K.player, day = K.G.day;
  return {
    cash: () => P.cash,
    items: () => [
      { id: 'rw_single', name: 'SINGLE', price: 4, desc: 'One journey, any station to any station. Today only.' },
      { id: 'rw_return', name: 'DAY RETURN', price: 7, desc: 'As many trains as you like, until the last one tonight.' },
      { id: 'rw_paper', name: 'A NEWSPAPER FOR THE JOURNEY', price: 1, desc: 'Something to hide behind.' },
    ],
    state: (it) => (rwHasTicket(K) && (it.id === 'rw_return' ? RW_STATE.ticket.kind === 'return' : it.id === 'rw_single' && RW_STATE.ticket.kind === 'single') ? 'owned' : ''),
    buy(it) {
      if (it.id !== 'rw_paper' && rwHasTicket(K) && (RW_STATE.ticket.kind === 'return' || it.id === 'rw_single')) return 'YOU\'VE ALREADY GOT ONE';
      if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`;
      P.cash -= it.price; K.sfx.cash();
      if (it.id === 'rw_paper') { RW_STATE.paperDay = day; return 'THE COUNTY GAZETTE. YOU\'RE ON PAGE FOUR'; }
      RW_STATE.fares += it.price; RW_STATE.ticket = { day, kind: it.id === 'rw_return' ? 'return' : 'single', used: false };
      return it.id === 'rw_return' ? 'DAY RETURN. KEEP IT SAFE' : 'SINGLE. THROUGH THE BARRIERS';
    },
  };
}
const rwOfficeOpen = (hr) => hr >= 6 && hr < 22;
function rwGateNear(K) {
  const P = K.player; if (P.car || P.hide || P.mode !== 'move' || P.y > 0.8) return null;
  for (const S of RW_STATIONS) { if (!S.staffed || !rwInHall(S, P.x, P.z)) continue; for (const Gt of S.gates) if (Math.abs(P.x - Gt.x) < 0.75 && Math.abs(P.z - Gt.z) < 1.3) return Gt; }
  return null;
}
function rwUseTarget(K) {
  const P = K.player, R = RW_STATE.ride;
  if (R) {
    if (R.insT != null && R.insT < 4 && !R.loo && !R.paid && !rwHasTicket(K)) return { kind: 'loo', first: true };
    if (R.loo) return { kind: 'unloo', first: true };
    return { kind: R.train.state === 'dwell' && R.t > 1 ? 'off' : 'stay', first: true };
  }
  const T = rwTrainAtDoor(K); if (T) return { kind: 'board', T };
  if (rwPax.state === 'dwell' && rwPax.stopAt === rwTerminus(rwPax) && !P.car && rwDoorSpots(rwPax).some((D) => Math.hypot(D.x - P.x, D.z - P.z) < 2.4)) return { kind: 'terminates' };
  const Gt = rwGateNear(K); if (Gt) return { kind: 'gate', Gt };
  if (P.car || P.hide || P.mode !== 'move' || P.y > 0.8) return null;
  const S = rwStationAt(P.x, P.z); if (!S || !S.staffed || !rwInHall(S, P.x, P.z)) return null;
  if (S.office && Math.hypot(P.x - S.office.x, P.z - S.office.z) < 3 && P.z > -248.5) return { kind: 'office', S };
  for (const M of S.machines) if (Math.hypot(P.x - M.x, P.z - M.z) < 1.3) return { kind: 'machine', S };
  return null;
}
function rwUsePrompt(T, K, useK) {
  if (T.kind === 'loo') return `${useK} to lock yourself in the toilet`;
  if (T.kind === 'unloo') return `In the toilet. ${useK} to come out`;
  if (T.kind === 'stay') return RW_STATE.ride.bell ? 'GETTING OFF at the next station' : `${useK} to get off at the next station`;
  if (T.kind === 'off') return `${useK} to get off here`;
  if (T.kind === 'board') return `${useK} to get on the train${rwHasTicket(K) ? '' : ' (no ticket)'}`;
  if (T.kind === 'terminates') return 'This train terminates here. Wait for the next one';
  if (T.kind === 'gate') return rwHasTicket(K) || RW_STATE.ride ? `${useK} to put your ticket in` : 'NO TICKET: the barrier stays shut';
  if (T.kind === 'office') return rwOfficeOpen(K.hour) ? `${useK} for tickets (SINGLE $4, DAY RETURN $7)` : 'The ticket office is shut. Use the machines';
  if (T.kind === 'machine') return `${useK} for the ticket machine`;
  return '';
}
function rwOpenGate(Gt, by, K) { Gt.openT = 2.4; if (by) { Gt.byPlayer = K.time; RW_STATE.opened++; } }
function rwUse(T, K) {
  const R = RW_STATE.ride;
  if (T.kind === 'loo') { R.loo = true; RW_STATE.loo++; K.showMsg('YOU LOCK THE DOOR. IT SMELLS. YOU HOLD YOUR BREATH', 1.8); return; }
  if (T.kind === 'unloo') { R.loo = false; return; }
  if (T.kind === 'stay') { if (!R.bell) { R.bell = true; K.showMsg('YOU\'LL GET OFF AT THE NEXT STATION', 1.4); } return; }
  if (T.kind === 'off') { rwGetOff(K, `YOU GET OFF AT ${R.train.stopAt ? R.train.stopAt.name : 'THE STATION'}`); return; }
  if (T.kind === 'board') { rwBoard(T.T, K); return; }
  if (T.kind === 'terminates') { K.showMsg('"NOT THIS ONE. IT\'S GOING TO THE SHED"', 1.6); return; }
  if (T.kind === 'gate') { if (rwHasTicket(K)) { rwOpenGate(T.Gt, true, K); K.sfx.thunk && K.sfx.thunk(); } else K.showMsg('THE BARRIER BEEPS. SEEK ASSISTANCE', 1.4); return; }
  const blurbs = ['"SINGLE OR RETURN?"', '"THE NEXT ONE\'S ON TIME. FOR ONCE."', '"WHEATLEY? WHY WOULD ANYONE GO TO WHEATLEY?"'];
  if (T.kind === 'office' && !rwOfficeOpen(K.hour)) { K.showMsg('SHUT. USE THE MACHINES', 1.4); return; }
  K.openMenu({ name: `${T.S.name} · ${T.kind === 'office' ? 'TRAVEL CENTRE' : 'TICKET MACHINE'}`, kind: 'railway', blurbs: T.kind === 'office' ? blurbs : ['PLEASE SELECT YOUR TICKET', 'CARDS AND CASH ACCEPTED (MOSTLY)'] }, rwTicketMenu(K));
}

// =====================================================================
// The departures board
// =====================================================================
function rwEta(S) {
  const T = rwPax;
  if (T.state === 'dwell' && T.stopAt === S) return 'PLATFORM 1 · BOARDING';
  if (T.state === 'tunnel') return 'APPROX 2 MIN';
  const ahead = (S.x - T.x) * T.dir;
  if (ahead > 0) { const s = ahead / Math.max(8, T.cruise * 0.8) + RW_STATIONS.filter((Q) => (Q.x - T.x) * T.dir > 0 && (S.x - Q.x) * T.dir > 0).length * 9; return s < 20 ? 'DUE' : `${Math.ceil(s / 30)} MIN`; }
  return 'APPROX 3 MIN';
}
function rwDrawBoard(S, K) {
  const x = S.boardCanvas.getContext('2d'), T = rwPax, run = rwTrainsRun(K.hour);
  x.fillStyle = '#08080c'; x.fillRect(0, 0, 512, 192);
  x.fillStyle = '#ffb020'; x.font = 'bold 22px monospace'; x.textAlign = 'left'; x.fillText('DEPARTURES', 12, 28);
  x.textAlign = 'right'; const hh = Math.floor(K.hour), mm = Math.floor((K.hour % 1) * 60); x.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 500, 28);
  x.textAlign = 'left'; x.font = 'bold 19px monospace';
  if (!run) { x.fillText('NO MORE TRAINS TONIGHT', 12, 80); x.fillText('FIRST TRAIN 05:30', 12, 110); x.fillStyle = '#7a7a7a'; x.fillText('FREIGHT ONLY · KEEP BACK', 12, 160); S.boardTex.needsUpdate = true; return; }
  const rows = [];
  const eastOk = S !== RW_STATIONS[RW_STATIONS.length - 1], westOk = S !== RW_STATIONS[0];
  if (eastOk) rows.push(['ASHFORD', T.dir > 0 || T.state === 'tunnel' ? rwEta(S) : 'APPROX 4 MIN']);
  if (westOk) rows.push(['PORT HALDEN CENTRAL', T.dir < 0 || T.state === 'tunnel' ? rwEta(S) : 'APPROX 4 MIN']);
  rows.forEach((r, i) => { const y = 72 + i * 36; x.fillStyle = '#ffb020'; x.fillText(r[0], 12, y); x.textAlign = 'right'; x.fillStyle = /DUE|BOARD/.test(r[1]) ? '#7aff7a' : '#ffb020'; x.fillText(r[1], 500, y); x.textAlign = 'left'; });
  x.fillStyle = '#ffb020'; x.font = '15px monospace'; x.fillText('CALLING AT: PORT HALDEN CENTRAL, WHEATLEY HALT, ASHFORD', 12, 176);
  S.boardTex.needsUpdate = true;
}

// =====================================================================
// Each frame
// =====================================================================
const RW_STAFF = [];
function rwStaffFor(S) {
  if (S.staff) return S.staff;
  const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: 0xe06a1a, pants: 0x1a1a2a }); p.group.position.set(S.staffPos.x, 0, S.staffPos.z); p.group.rotation.y = Math.PI; scene.add(p.group);
  S.staff = { p, warned: 0, lastSide: null }; RW_STAFF.push(S.staff); return S.staff;
}
function rwHitCheck(T, dt, K) {
  if (T.state === 'tunnel' || !T.mesh) return;
  const P = K.player, half = T.id === 'pax' ? RW_HALF : (9 * 13.8) / 2;
  const inRect = (x, z, y) => y < 4.2 && Math.abs(z - T.z) < 1.75 && Math.abs(x - T.x) < half + 0.4;
  if (!RW_STATE.ride && P.alive && !P.car && inRect(P.x, P.z, P.y)) {
    if (T.v > 2.5) { RW_STATE.hits++; K.hurt(Math.min(60, 12 + T.v * 1.6)); P.z = T.z + (P.z > T.z ? 2.4 : -2.4); P.vz = (P.z > T.z ? 1 : -1) * 6; P.vx = T.dir * T.v * 0.3; P.vy = 4; K.showMsg('THE TRAIN CLIPS YOU AND FLINGS YOU OFF THE LINE', 2); }
    else P.z = T.z + (P.z > T.z ? 1.85 : -1.85);
  }
  if (T.v > 3) for (const h of K.hunters()) if (!h.dead && inRect(h.x, h.z, h.y || 0)) h.die({ x: T.dir * T.v * 1.1, y: 5, z: (h.z > T.z ? 1 : -1) * 6 }, 1.2, false);
  // the horn, for anyone on the line ahead
  const ax = P.x - T.x;
  if (T.state === 'run' && T.v > 6 && Math.abs(P.z - T.z) < 2.2 && ax * T.dir > 0 && ax * T.dir < 160 && !RW_STATE.ride) { T.hornT = (T.hornT || 0) - dt; if (T.hornT <= 0) { T.hornT = 2.5; K.sfx.horn(); if (RW_STATE.msgT <= 0) { RW_STATE.msgT = 6; K.showMsg('A TRAIN IS COMING. GET OFF THE LINE!', 1.6); } } }
}
function rwUpdate(dt, K) {
  if (!RW_STATIONS[0].built) return;
  const P = K.player, hr = K.hour;
  for (const T of rwTrains) { rwStepTrain(T, dt, K); rwHitCheck(T, dt, K); }
  RW_STATE.msgT = Math.max(0, RW_STATE.msgT - dt);
  const night = hr >= 19 || hr < 6.5;
  if (rwPax.mesh) for (const w of rwPax.mesh.wins) { const m = night ? rwWinNight : rwWinDay; if (w.material !== m) w.material = m; }
  if (!RW_STATE.ride) rwRideRoof.h = -99;
  if (P.z > -235) return; // (everything else only matters when you're up by the line)
  for (const S of RW_STATIONS) {
    if (!K.near(S.x, -258, 120)) continue;
    if (S.staffed) {
      // the gates: open for anyone walking through with a ticket (the town has season tickets), and for you if you put yours in
      for (const Gt of S.gates) {
        if (Gt.openT <= 0 && K.hunters().some((h) => !h.dead && Math.abs(h.x - Gt.x) < 0.9 && Math.abs(h.z - Gt.z) < 1.5)) rwOpenGate(Gt, false, K);
        Gt.openT = Math.max(0, Gt.openT - dt);
        const open = Gt.openT > 0; Gt.c.h = open ? 0 : 1.05;
        Gt.paddles[0].position.x = Gt.x - (open ? 0.5 : 0.27); Gt.paddles[1].position.x = Gt.x + (open ? 0.5 : 0.27);
        Gt.paddles[0].rotation.y = Gt.paddles[1].rotation.y = open ? Math.PI / 2 : 0;
      }
      const St = rwStaffFor(S); St.p.group.visible = rwOfficeOpen(hr);
      // vaulting the barriers
      if (rwInHall(S, P.x, P.z) || (Math.abs(P.x - S.x) < 26 && P.z < -244 && P.z > -258)) {
        const side = P.z < RW_HALL.gateZ ? 'in' : 'out';
        if (St.lastSide && St.lastSide !== side && side === 'in') {
          const viaGate = S.gates.some((Gt) => Gt.byPlayer && K.time - Gt.byPlayer < 4 && Math.abs(P.x - Gt.x) < 1.2);
          if (!viaGate) {
            RW_STATE.vaults++;
            if (St.p.group.visible && Math.hypot(P.x - S.staffPos.x, P.z - S.staffPos.z) < 16 && !(P.disg > 0.7 && Math.random() < 0.5)) {
              St.warned++; RW_STATE.warned++;
              if (St.warned >= 2) { K.addHeat(5); K.report(); K.bumpLocal(0.06); K.say({ g: St.p.group }, 'RIGHT. I\'M CALLING THE POLICE'); K.showMsg('THE STATION STAFF SAW YOU JUMP THE BARRIER AGAIN. THEY\'RE ON THE PHONE', 2.4); }
              else { K.say({ g: St.p.group }, 'OI! YOU HAVEN\'T PAID FOR THAT!'); K.showMsg('YOU VAULT THE BARRIER. THE MAN IN ORANGE SAW THAT', 2); K.bumpLocal(0.03); }
            }
          }
        }
        St.lastSide = side;
      } else St.lastSide = null;
      S.boardT = (S.boardT || 0) - dt;
      if (S.boardT <= 0) { S.boardT = 1; rwDrawBoard(S, K); }
    }
    if (S.welcomed !== K.G.day && K.near(S.x, -250, 22)) { S.welcomed = K.G.day; K.banner(`${S.name}<small>${S.staffed ? 'COUNTY RAIL · SINGLE $4 · DAY RETURN $7 · TRAINS 05:30 TILL MIDNIGHT' : 'REQUEST STOP · PAY THE GUARD ON THE TRAIN'}</small>`, 4); }
  }
  // the first time a train's in and you're on the platform
  const T = rwTrainAtDoor(K);
  if (T && !RW_STATE.doorTip) { RW_STATE.doorTip = true; K.showMsg(`THE TRAIN'S IN. ${K.isTouch ? 'USE' : 'E'} AT A DOOR TO GET ON`, 1.8); }
}
function rwConspic(K) {
  const P = K.player, R = RW_STATE.ride;
  if (R) return R.loo ? -0.6 : RW_STATE.paperDay === K.G.day ? -0.38 : -0.3;
  if (P.car) return 0;
  const S = rwStationAt(P.x, P.z);
  if (S && (rwInHall(S, P.x, P.z) || rwOnPlatform(S, P.x, P.z))) return -0.12; // just another commuter
  if (P.z < -264 && P.z > -280) return 0.2; // walking along the railway line is not normal
  return 0;
}
export const railway = {
  name: 'railway', roofs: rwRoofs,
  useTarget: rwUseTarget, usePrompt: rwUsePrompt, use: rwUse, conspic: rwConspic, update: rwUpdate, ride: rwRide, plan: () => false,
  riding: () => !!RW_STATE.ride,
  unseen: () => !!(RW_STATE.ride && RW_STATE.ride.loo),
  reset() {
    if (RW_STATE.ride) rwGetOff({ player: { x: 0, z: 0 }, blocked: () => false, showMsg: () => {} });
    Object.assign(RW_STATE, { ride: null, ticket: null, rides: 0, fares: 0, fines: 0, dodged: 0, vaults: 0, warned: 0, inspections: 0, loo: 0, hits: 0, freight: 0, msgT: 0, opened: 0, doorTip: false, paperDay: 0 });
    for (const S of RW_STATIONS) { S.welcomed = 0; if (S.staff) S.staff.warned = 0; }
    rwRideRoof.h = -99;
  },
  diary(K) { const b = []; if (rwHasTicket(K)) b.push(RW_STATE.ticket.kind === 'return' ? 'A DAY RETURN ON COUNTY RAIL' : 'A SINGLE TRAIN TICKET'); if (RW_STATE.ride) b.push('ON THE TRAIN'); return b; },
  debug: () => ({ stations: RW_STATIONS.map((S) => ({ id: S.id, built: S.built, gates: S.gates.length })), pax: { x: Math.round(rwPax.x), dir: rwPax.dir, state: rwPax.state, v: +rwPax.v.toFixed(1), at: rwPax.stopAt ? rwPax.stopAt.id : null }, freight: { x: Math.round(rwFreight.x), state: rwFreight.state }, ...RW_STATE, ride: RW_STATE.ride ? { t: RW_STATE.ride.t, paid: RW_STATE.ride.paid, loo: RW_STATE.ride.loo, stops: RW_STATE.ride.stops } : null }),
  RW_STATE, RW_STATIONS, rwPax, rwFreight, rwDoorSpots, rwBoard, rwGetOff, rwHasTicket, rwTicketMenu, rwTrainAtDoor, rwInspect, rwInHall, rwStationAt,
};
