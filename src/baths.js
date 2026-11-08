// HALDEN BATHS: the swimming baths on the leisure park on Route 4, next door to the bowling alley.
//  - Pay at reception ($3), get changed (or don't: a person doing lengths in their jeans gets looked at), and
//    get in. The main pool has six lanes and a diving board at the deep end; the learner pool is for paddling.
//  - Swimming: slower than walking, sprint for front crawl. Hold crouch to duck under: underwater, nobody can
//    see you at all, for as long as your breath lasts. Get out by the steps in the corners, or jump at the side.
//  - The lifeguard sits up on the high chair with a whistle. No running on the side. No swimming without a
//    ticket. Twice and she gets on the phone.
//  - THE TWISTER: a yellow tube slide from a tower in the corner, round twice and out into the deep end.
//    Up the stairs, E at the top. Inside the tube nobody can see you, and it's the quickest way down.
//  - On the hour, the wave machine. A swim washes the bin smell off, but you come out dripping, and a wet
//    person in the street gets noticed. Towels at reception.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene, textTex } from './core.js';
import { clearings, propBuf, glowBuf, groundBuf, markBuf, addCollider, addRoof, worldHooks, navOpen, keepClear, parkedSpots, floorAt, moveBody } from './world.js';
import { interiorZones } from './interiors.js';
import { buildPerson, lam, SKINS, HAIRS } from './people.js';
import { CATALOG } from './shops.js';
import { hidePiece } from './gigs.js';
import { SK_STATE } from './stealth.js';
import { weekdayOf } from './townday.js';

// =====================================================================
// Where everything is
// =====================================================================
export const BT_CLEAR = { x0: -132, x1: -20, z0: 318, z1: 390 };
clearings.push(BT_CLEAR);
const BT_WATER = 1.05, BT_DECK = 1.2;
export const bathsB = {
  name: 'HALDEN BATHS', x0: -100, x1: -44, z0: 326, z1: 380, H: 8, hallX: -54, door: { x: -43.6, z: 352 },
  pool: { x0: -92, x1: -62, z0: 343, z1: 361, floor: 0 }, learner: { x0: -82, x1: -66, z0: 366, z1: 374, floor: 0.6 },
  desk: { x: -46.8, z: 345.5 }, cafe: { x: -48, z: 372.6 }, chair: { x: -77, z: 341.3 }, board: { x0: -92.2, x1: -89.4, z0: 351.4, z1: 352.6, y: 1.8 },
  cubicles: [], lockers: [], built: false,
};
export const btRoofs = [];
export const BT_STATE = { slide: null, slides: 0, kidSlides: 0, paidDay: 0, swim: false, under: false, breath: 1, wetT: 0, lengths: 0, lenFrom: null, dives: 0, unders: 0, warned: 0, warnT: 0, gasps: 0, wave: false, waves: 0, towels: 0, msgT: 0, splashY: 9 };
export const inBaths = (x, z) => x > bathsB.x0 && x < bathsB.x1 && z > bathsB.z0 && z < bathsB.z1;
export const inHall = (x, z) => x > bathsB.x0 && x < bathsB.hallX && z > bathsB.z0 && z < bathsB.z1;
const btIn = (R, x, z, pad = 0) => x > R.x0 + pad && x < R.x1 - pad && z > R.z0 + pad && z < R.z1 - pad;
export const poolAt = (x, z) => (btIn(bathsB.pool, x, z) ? bathsB.pool : btIn(bathsB.learner, x, z) ? bathsB.learner : null);
export function btOpen(day, hr) { const sun = weekdayOf(day) === 6; return sun ? hr >= 8 && hr < 18 : hr >= 7 && hr < 21; }
export const waveNow = (hr) => hr % 1 < 0.22 && hr >= 10 && hr < 20;

// =====================================================================
// Building it
// =====================================================================
const BT_TILE = 0xe8f4f8, BT_BLUE = 0x2a7ab0, BT_BRICK = 0xb06a4a, BT_POOLTILE = 0x7ad0e8;
function btWall(x0, x1, z0, z1, h, col, y0 = 0) { propBuf.box(x0, x1, y0, h, z0, z1, col); addCollider(x0, x1, z0, z1, h, { y0 }); }
function btDeck(x0, x1, z0, z1, h = BT_DECK, col = BT_TILE) { propBuf.box(x0, x1, 0, h, z0, z1, col); addCollider(x0, x1, z0, z1, h, { y0: 0 }); }
function btPlane(w, h, tex, x, y, z, ry = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; }
const btWaterMat = new THREE.MeshLambertMaterial({ color: 0x3ab8e0, transparent: true, opacity: 0.55, depthWrite: false, emissive: 0x0a3a5a, side: THREE.DoubleSide });
const btWaters = [];
// steps down into a pool at a corner: three steps of 0.3, `dir` = +1 going in towards +x
function btSteps(x, z0, z1, dir) { for (let k = 1; k <= 3; k++) { const a = x, b = x + dir * (2 - k * 0.5); btDeck(Math.min(a, b), Math.max(a, b), z0, z1, BT_DECK - k * 0.3, 0xf0f8fa); } }
function buildBathsShell() {
  const B = bathsB, H = B.H, P = BT_CLEAR;
  groundBuf.flat(P.x0, P.x1, P.z0, P.z1, 0.011, 0x5a7d45);
  groundBuf.flat(-42, -20, 318, 386, 0.013, 0x4a4a50); // the car park, joined on to the bowling alley's
  groundBuf.flat(-44, -42, 326, 380, 0.016, 0x8a8590);
  for (let z = 322; z <= 384; z += 3) if (z < 349 || z > 355) { markBuf.flat(-40, -35, z - 0.06, z + 0.06, 0.02, 0xe8e8e8); markBuf.flat(-27, -22, z - 0.06, z + 0.06, 0.02, 0xe8e8e8); }
  for (const [z, h] of [[326.5, Math.PI / 2], [338.5, -Math.PI / 2], [362.5, Math.PI / 2], [374.5, -Math.PI / 2]]) parkedSpots.push({ x: h > 0 ? -37.5 : -24.5, z, heading: h });
  for (const z of [330, 352, 374]) { propBuf.box(-31.1, -30.9, 0, 6, z - 0.1, z + 0.1, 0x2e3035); glowBuf.box(-31.4, -30.6, 5.8, 6, z - 0.4, z + 0.4, 0xfff0c4); }
  // floor, walls, roof (a big curved-looking roof: two slopes and a ridge of skylights)
  groundBuf.flat(B.x0 + 0.2, B.x1 - 0.2, B.z0 + 0.2, B.z1 - 0.2, 0.02, BT_TILE);
  btWall(B.x0 - 0.3, B.x0, B.z0, B.z1, H, BT_BRICK); btWall(B.x0, B.x1, B.z0 - 0.3, B.z0, H, BT_BRICK); btWall(B.x0, B.x1, B.z1, B.z1 + 0.3, H, BT_BRICK);
  for (const [a, b] of [[B.z0, 350], [354, B.z1]]) {
    btWall(B.x1, B.x1 + 0.3, a, b, 0.8, BT_BRICK);
    propBuf.box(B.x1 + 0.1, B.x1 + 0.2, 0.8, 3.0, a, b, 0x9ac8e0, { glass: true }); addCollider(B.x1, B.x1 + 0.3, a, b, H, { y0: 0.8 });
    propBuf.box(B.x1, B.x1 + 0.3, 3.0, H, a, b, BT_BRICK);
  }
  propBuf.box(B.x1, B.x1 + 0.3, 3.0, H, 350, 354, BT_BRICK);
  navOpen.push({ x0: B.x1 - 1.5, x1: B.x1 + 1.5, z0: 350.4, z1: 353.6 }); keepClear.push({ x0: B.x1 - 2, x1: B.x1 + 6, z0: 349, z1: 355 });
  propBuf.box(B.x1, B.x1 + 3, 3.3, 3.6, 347, 357, BT_BLUE, { bottom: true }); addRoof(B.x1, B.x1 + 3, 347, 357, 3.6, { y0: 3.3 });
  btPlane(14, 2.0, textTex(1024, 140, '#2a7ab0', '#ffffff', ['HALDEN BATHS'], 'bold 100px Georgia, serif'), B.x1 + 0.32, 5.4, 352, Math.PI / 2);
  for (let z = B.z0 + 2; z < B.z1 - 1; z += 4) propBuf.box(B.x1 + 0.3, B.x1 + 0.4, 3.0, H, z - 0.05, z + 0.05, 0xf0f0f0);
  propBuf.box(B.x0 - 0.3, B.x1 + 0.3, H, H + 0.3, B.z0 - 0.3, B.z1 + 0.3, 0x5a6a7a, { bottom: true }); addRoof(B.x0 - 0.3, B.x1 + 0.3, B.z0 - 0.3, B.z1 + 0.3, H + 0.3, { y0: H });
  for (let x = B.x0 + 4; x < B.hallX - 2; x += 6) glowBuf.box(x - 2, x + 2, H - 0.08, H - 0.03, 348, 356, 0xf0faff); // skylights
  btRoofs.push({ x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, h: H });
  interiorZones.push({ x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, y0: -0.5, y1: H - 0.2, name: B.name });
}
function buildPoolHall() {
  const B = bathsB, M = B.pool, Lr = B.learner;
  // the wall between the foyer and the hall, a doorway, and steps up to the poolside
  for (const [a, b] of [[B.z0, 349], [355, B.z1]]) btWall(B.hallX - 0.15, B.hallX + 0.15, a, b, B.H, 0xd8e8f0);
  propBuf.box(B.hallX - 0.15, B.hallX + 0.15, 2.6, B.H, 349, 355, 0xd8e8f0);
  navOpen.push({ x0: B.hallX - 1.4, x1: B.hallX + 1.4, z0: 349.4, z1: 354.6 });
  for (let k = 1; k <= 4; k++) btDeck(B.hallX - k * 0.7, B.hallX - (k - 1) * 0.7, 349, 355, k * 0.3);
  // the poolside (raised, with the pools sunk into it)
  const hx = B.hallX - 2.8;
  btDeck(B.x0, M.x0, B.z0, B.z1); btDeck(M.x1, hx, B.z0, B.z1); btDeck(hx, B.hallX, B.z0, 349); btDeck(hx, B.hallX, 355, B.z1);
  btDeck(M.x0, M.x1, B.z0, M.z0); btDeck(M.x0, M.x1, M.z1, Lr.z0); btDeck(M.x0, Lr.x0, Lr.z0, Lr.z1); btDeck(Lr.x1, M.x1, Lr.z0, Lr.z1); btDeck(M.x0, M.x1, Lr.z1, B.z1);
  btDeck(Lr.x0, Lr.x1, Lr.z0, Lr.z1, Lr.floor, BT_POOLTILE);
  // the pool itself: tiles, lane lines, a deep end
  groundBuf.flat(M.x0, M.x1, M.z0, M.z1, 0.025, BT_POOLTILE);
  for (let k = 1; k < 6; k++) { const z = M.z0 + k * 3; markBuf.flat(M.x0 + 1, M.x1 - 1, z - 0.1, z + 0.1, 0.035, 0x1a4a8a); }
  for (let k = 0; k < 6; k++) { const z = M.z0 + 1.5 + k * 3; markBuf.flat(M.x0 + 2, M.x1 - 2, z - 0.12, z + 0.12, 0.033, 0x2a5a9a); }
  for (let k = 1; k < 6; k++) { const z = M.z0 + k * 3; for (let x = M.x0 + 0.3; x < M.x1; x += 0.6) glowBuf.box(x - 0.12, x + 0.12, BT_WATER - 0.02, BT_WATER + 0.04, z - 0.06, z + 0.06, k % 2 ? 0xd02a2a : 0xf0f0f0); } // floating lane ropes
  // steps in the corners
  btSteps(M.x1, M.z0, M.z0 + 1.6, -1); btSteps(M.x1, M.z1 - 1.6, M.z1, -1); btSteps(M.x0, M.z0, M.z0 + 1.6, 1); btSteps(M.x0, M.z1 - 1.6, M.z1, 1);
  btSteps(Lr.x1, Lr.z0, Lr.z0 + 1.4, -1);
  // the water
  for (const R of [M, Lr]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0, 24, 12), btWaterMat); w.rotation.x = -Math.PI / 2; w.position.set((R.x0 + R.x1) / 2, BT_WATER, (R.z0 + R.z1) / 2); scene.add(w); btWaters.push(w); w.userData.base = w.geometry.attributes.position.array.slice(); }
  // depth markings along the side
  for (const [x, t] of [[M.x1 - 2, '1.0m'], [(M.x0 + M.x1) / 2, '1.0m'], [M.x0 + 2, 'DEEP END']]) btPlane(2, 0.4, textTex(256, 52, '#e8f4f8', '#1a4a8a', [t], 'bold 34px Arial'), x, BT_DECK + 0.02, M.z0 - 0.6, 0).rotation.set(-Math.PI / 2, 0, 0);
  // the diving board at the deep end
  const Bd = B.board;
  propBuf.box(Bd.x0 - 0.6, Bd.x0 + 0.4, BT_DECK, Bd.y, Bd.z0 - 0.1, Bd.z1 + 0.1, 0x8a8a90); addCollider(Bd.x0 - 0.6, Bd.x0 + 0.4, Bd.z0 - 0.1, Bd.z1 + 0.1, Bd.y, { y0: BT_DECK });
  propBuf.box(Bd.x0, Bd.x1, Bd.y - 0.08, Bd.y, Bd.z0, Bd.z1, 0x2a7ab0); addCollider(Bd.x0, Bd.x1, Bd.z0, Bd.z1, Bd.y, { y0: Bd.y - 0.08 });
  for (const s of [-1, 1]) propBuf.box(Bd.x0 - 0.6, Bd.x0 - 0.5, Bd.y, Bd.y + 0.9, 352 + s * 0.7 - 0.04, 352 + s * 0.7 + 0.04, 0xc0c0c8);
  // the lifeguard's high chair
  const C = B.chair;
  for (const [dx, dz] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]]) propBuf.box(C.x + dx - 0.04, C.x + dx + 0.04, BT_DECK, BT_DECK + 1.6, C.z + dz - 0.04, C.z + dz + 0.04, 0xf0f0f0);
  propBuf.box(C.x - 0.45, C.x + 0.45, BT_DECK + 1.6, BT_DECK + 1.7, C.z - 0.4, C.z + 0.4, 0xd02a2a); propBuf.box(C.x - 0.45, C.x + 0.45, BT_DECK + 1.7, BT_DECK + 2.4, C.z - 0.45, C.z - 0.38, 0xd02a2a);
  addCollider(C.x - 0.45, C.x + 0.45, C.z - 0.45, C.z + 0.4, BT_DECK + 1.7, { y0: BT_DECK });
  // benches along the side, a clock, the rules
  for (let x = M.x0 + 3; x < M.x1 - 2; x += 6) { propBuf.box(x - 1.2, x + 1.2, BT_DECK, BT_DECK + 0.45, B.z0 + 0.4, B.z0 + 0.9, 0xf0f0f0); addCollider(x - 1.2, x + 1.2, B.z0 + 0.4, B.z0 + 0.9, BT_DECK + 0.45); }
  btPlane(5, 2.6, textTex(400, 210, '#ffffff', '#1a4a8a', ['POOL RULES', 'NO RUNNING · NO DIVING', 'IN THE SHALLOW END', 'NO BOMBING · NO PETTING', 'SHOWER BEFORE SWIMMING'], 'bold 30px Arial'), -77, BT_DECK + 2.6, B.z1 - 0.32, Math.PI);
  for (let z = B.z0 + 3; z < B.z1 - 2; z += 5) glowBuf.box(B.x0 + 0.02, B.x0 + 0.06, 3, 6, z - 1.2, z + 1.2, 0x9ad8f0); // tall windows (lit from outside)
}
function btBuildFoyer() {
  const B = bathsB;
  // reception (a counter with a turnstile beside it), changing rooms to the south, a cafe to the north
  propBuf.box(-48.2, -45.4, 0, 1.1, 343, 344.2, BT_BLUE); addCollider(-48.2, -45.4, 343, 344.2, 1.1); propBuf.box(-48.3, -45.3, 1.1, 1.16, 342.9, 344.3, 0xf0f0f0);
  btPlane(5, 1, textTex(512, 100, '#2a7ab0', '#ffffff', ['RECEPTION · SWIM $3'], 'bold 46px Arial'), -46.8, 3.0, 340.22, 0);
  // the changing village: cubicles and lockers
  btWall(-54, -50.2, 340, 340.2, 2.6, 0xd8e8f0); btWall(-47.8, -44, 340, 340.2, 2.6, 0xd8e8f0);
  for (const x of [-53.2, -52, -50.8]) B.cubicles.push(hidePiece('cupboard', x, 326.5, 0, 1, 0.5, 0.3, 2.1, 0));
  for (const x of [-49, -48, -47, -46]) B.lockers.push(hidePiece('locker', x, 326.5, 0, 1, 0.3, 0.25, 1.9, 0));
  for (const z of [330, 333, 336]) { propBuf.box(-50.5, -46.5, 0, 0.45, z - 0.25, z + 0.25, 0x8a5a32); addCollider(-50.5, -46.5, z - 0.25, z + 0.25, 0.45); }
  btPlane(3.4, 0.6, textTex(400, 70, '#ffffff', '#2a7ab0', ['CHANGING'], 'bold 46px Arial'), -49, 2.9, 340.32, 0);
  // the cafe, with a window on to the pool
  btWall(-54, -50, 364, 364.2, 1.0, 0xd8e8f0); btWall(-48, -44, 364, 364.2, 1.0, 0xd8e8f0);
  propBuf.box(-51, -45, 0, 1.1, 374, 375, 0xe0a020); addCollider(-51, -45, 374, 375, 1.1); propBuf.box(-51.1, -44.9, 1.1, 1.16, 373.9, 375.1, 0xf0f0f0);
  btPlane(5, 1, textTex(512, 100, '#e0a020', '#ffffff', ['THE POOLSIDE CAFE'], 'bold 46px Arial'), -48, 3.0, 379.65, Math.PI);
  for (const [x, z] of [[-52, 367], [-48.5, 367], [-52, 370.5]]) { propBuf.cyl(x, z, 0.05, 0.05, 0, 0.75, 0x2a2a2e, 6); propBuf.cyl(x, z, 0.5, 0.5, 0.75, 0.8, 0xf0f0f0, 10); addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0.8); }
  propBuf.box(B.hallX - 0.2, B.hallX - 0.1, 1.0, 3.0, 364.5, 379, 0x9ac8e0, { glass: true });
}
// THE TWISTER: stairs up the west wall to a platform, a tube that loops round and drops into the deep end
export const btSlide = { top: { x: -95.2, y: 6.0, z: 371.3 }, curve: null, len: 0, built: false };
const BT_SLIDE_PTS = [[-94.4, 6.2, 371.3], [-91, 5.6, 371.0], [-87.6, 5.0, 373.4], [-87.6, 4.4, 377.4], [-91, 3.8, 379], [-93.2, 3.3, 376.6], [-92.8, 2.9, 372.6], [-91, 2.5, 368.4], [-90, 2.0, 364], [-89.6, 1.3, 360.4]];
function btBuildSlide() {
  const B = bathsB;
  // the stairs, rising north along the west wall, and the platform at the top
  for (let k = 1; k <= 16; k++) btDeck(-99.8, -98, 359 + (k - 1) * 0.6, 359 + k * 0.6, BT_DECK + k * 0.3, k % 2 ? 0xe0c020 : 0xd8b018);
  btDeck(-100, -94, 368.6, 374, 6.0, 0x2a7ab0);
  for (const [x0, x1, z0, z1] of [[-100, -94, 373.9, 374], [-98, -94, 368.6, 368.7]]) { propBuf.box(x0, x1, 6.0, 7.0, z0, z1, 0xd02a2a); addCollider(x0, x1, z0, z1, 7.0, { y0: 6.0 }); }
  propBuf.box(-94.1, -94, 6.0, 7.0, 368.6, 370.4, 0xd02a2a); addCollider(-94.1, -94, 368.6, 370.4, 7.0, { y0: 6.0 }); propBuf.box(-94.1, -94, 6.0, 7.0, 372.2, 374, 0xd02a2a); addCollider(-94.1, -94, 372.2, 374, 7.0, { y0: 6.0 });
  btPlane(3, 0.7, textTex(320, 70, '#e0c020', '#1a4a8a', ['THE TWISTER'], 'bold 44px Arial Black, Arial'), -97, 7.4, 368.5, Math.PI);
  // the tube
  const curve = new THREE.CatmullRomCurve3(BT_SLIDE_PTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  btSlide.curve = curve; btSlide.len = curve.getLength();
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 140, 0.62, 12, false), new THREE.MeshLambertMaterial({ color: 0xf0c020, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }));
  scene.add(tube); btSlide.tube = tube;
  // posts holding it up, and where it's low enough to walk into, it's solid
  for (let k = 1; k < 30; k++) {
    const p = curve.getPointAt(k / 30);
    if (k % 4 === 0) propBuf.box(p.x - 0.08, p.x + 0.08, BT_DECK, p.y - 0.6, p.z - 0.08, p.z + 0.08, 0xc0c0c8);
    if (p.y < 3.4 && !poolAt(p.x, p.z)) addCollider(p.x - 0.55, p.x + 0.55, p.z - 0.55, p.z + 0.55, p.y + 0.5, { y0: BT_DECK });
  }
  btSlide.built = true;
}
worldHooks.beforeBake.push(() => { buildBathsShell(); buildPoolHall(); btBuildFoyer(); btBuildSlide(); bathsB.built = true; });

// =====================================================================
// Swimmers doing lengths, the lifeguard, the reception and cafe staff
// =====================================================================
const btSwimmers = [], btStaff = [];
const BT_CAPS = [0xd02a2a, 0x2a5ad0, 0xf0f0f0, 0xe0c020, 0x1a1a1a, 0xe06ab0];
function buildBtPeople() {
  if (btStaff.length) return;
  const B = bathsB, M = B.pool;
  for (let k = 0; k < 7; k++) {
    const p = buildPerson({ skin: mpick(SKINS), hair: mpick(BT_CAPS), shirt: mpick([0x1a1a2a, 0x2a4a8a, 0xd02a2a, 0x2a8a6a]), pants: 0x1a1a2a });
    p.group.visible = false; scene.add(p.group);
    const lane = k % 6;
    btSwimmers.push({ p, g: p.group, z: M.z0 + 1.5 + lane * 3 + mr(-0.4, 0.4), x: mr(M.x0 + 2, M.x1 - 2), dir: Math.random() < 0.5 ? 1 : -1, sp: mr(0.7, 1.4), stroke: mpick(['crawl', 'breast', 'back']), ph: mr(0, 6) });
  }
  const guard = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: 0xd02a2a, pants: 0xe0c020 });
  guard.group.position.set(B.chair.x, BT_DECK + 1.45, B.chair.z - 0.05); scene.add(guard.group);
  guard.legL.rotation.x = guard.legR.rotation.x = -1.4;
  B.guard = { p: guard, g: guard.group, x: B.chair.x, z: B.chair.z, warnT: 0, look: 0 }; btStaff.push(B.guard);
  const rec = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: BT_BLUE, pants: 0x1a1a2a }); rec.group.position.set(-46.8, 0, 342.2); scene.add(rec.group); btStaff.push({ p: rec, g: rec.group });
  const caf = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: 0xe0a020, pants: 0x1a1a2a }); caf.group.position.set(-48, 0, 376.4); caf.group.rotation.y = Math.PI; scene.add(caf.group); btStaff.push({ p: caf, g: caf.group });
}
function btAnimSwimmers(dt, K, show) {
  const M = bathsB.pool, wave = BT_STATE.wave;
  for (const S of btSwimmers) {
    S.g.visible = show; if (!show) continue;
    S.x += S.dir * S.sp * dt * (wave ? 0.6 : 1); if (S.x > M.x1 - 1.2) S.dir = -1; if (S.x < M.x0 + 1.2) S.dir = 1;
    S.ph += dt * (S.stroke === 'breast' ? 3 : 5);
    const bob = Math.sin(S.ph) * 0.05 + (wave ? Math.sin(K.time * 3 + S.x * 0.5) * 0.15 : 0);
    S.g.position.set(S.x, BT_WATER - 0.35 + bob, S.z); S.g.rotation.set(0, S.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    S.g.rotateX(S.stroke === 'back' ? -Math.PI / 2 * 0.95 : Math.PI / 2 * 0.95);
    const p = S.p;
    if (S.stroke === 'breast') { const k = Math.sin(S.ph); p.armL.rotation.x = p.armR.rotation.x = -2.6 + k * 0.6; p.armL.rotation.z = -0.4 - k * 0.5; p.armR.rotation.z = 0.4 + k * 0.5; p.legL.rotation.x = p.legR.rotation.x = 0.3 + k * 0.3; }
    else { p.armL.rotation.x = -S.ph % (Math.PI * 2); p.armR.rotation.x = -(S.ph + Math.PI) % (Math.PI * 2); p.armL.rotation.z = p.armR.rotation.z = 0; p.legL.rotation.x = Math.sin(S.ph * 2) * 0.3; p.legR.rotation.x = -Math.sin(S.ph * 2) * 0.3; }
  }
}

let btSlider = null;
function btKidSlide(dt, K, on) {
  if (!btSlide.built) return;
  if (!btSlider) { const p = buildPerson({ skin: mpick(SKINS), hair: mpick(BT_CAPS), shirt: 0x2a8a6a, pants: 0x1a1a2a }); p.group.scale.setScalar(0.75); p.group.visible = false; scene.add(p.group); btSlider = { p, s: -1, waitT: mr(4, 10) }; }
  const S = btSlider;
  if (!on) { S.p.group.visible = false; S.s = -1; return; }
  if (S.s < 0) { S.waitT -= dt; if (S.waitT <= 0) { S.s = 0; S.v = 2.5; if (K.near(-90, 372, 30)) K.say({ g: S.p.group }, mpick(['WHEEEE!', 'WATCH ME!', 'MUM! MUM! LOOK!'])); } return; }
  const C = btSlide.curve, a = C.getTangentAt(Math.min(0.999, S.s / btSlide.len));
  S.v = clamp(S.v + (-a.y * 9.8 - 0.1 * S.v) * dt, 3, 11); S.s += S.v * dt;
  if (S.s >= btSlide.len) { S.s = -1; S.waitT = mr(12, 30); S.p.group.visible = false; BT_STATE.kidSlides++; if (K.near(-90, 360, 30) && K.sfx.splash) K.sfx.splash(true); return; }
  const p = C.getPointAt(S.s / btSlide.len); S.p.group.visible = true; S.p.group.position.set(p.x, p.y - 0.55, p.z); S.p.group.rotation.y = Math.atan2(a.x, a.z); S.p.legL.rotation.x = S.p.legR.rotation.x = -1.4; S.p.armL.rotation.x = S.p.armR.rotation.x = -2.8;
}

// =====================================================================
// You, in the water
// =====================================================================
let btTint = null;
function btOverlay(on, deep) {
  if (!btTint) { btTint = document.createElement('div'); btTint.id = 'bt-under'; Object.assign(btTint.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5', background: 'radial-gradient(ellipse at center, rgba(40,150,200,.35), rgba(10,60,110,.7))', display: 'none' }); document.body.appendChild(btTint); }
  btTint.style.display = on ? 'block' : 'none'; if (on) btTint.style.opacity = String(0.7 + 0.3 * deep);
}
const btBall = { x: 0, z: 0 };
// going down the slide: speed builds with the drop, then SPLASH into the deep end
function btSlideRide(dt, K) {
  const S = BT_STATE.slide, P = K.player, C = btSlide.curve;
  const a = C.getTangentAt(Math.min(0.999, S.s / btSlide.len));
  S.v = clamp(S.v + (-a.y * 9.8 - 0.1 * S.v) * dt, 3, 11);
  S.s += S.v * dt;
  if (S.s >= btSlide.len) {
    BT_STATE.slide = null; BT_STATE.slides++;
    const e = C.getPointAt(1); P.x = e.x - 0.2; P.z = e.z - 1.2; P.y = 0.4; P.vx = P.vz = 0; P.vy = -2; P.crouch = 0;
    BT_STATE.splashY = 3.2; K.sfx.splash && K.sfx.splash(true); K.showMsg(mpick(['SPLASH!', 'WHOOSH... SPLASH!', 'AGAIN! AGAIN!']), 1.2);
    return false;
  }
  const p = C.getPointAt(S.s / btSlide.len);
  P.x = p.x; P.z = p.z; P.y = p.y - 0.55; P.vx = P.vz = P.vy = 0; P.crouch = 0.65; P.sprinting = false;
  P.yaw = Math.atan2(-a.x, -a.z); P.pitch = clamp(Math.asin(clamp(a.y, -1, 1)) * 0.8, -0.6, 0.2);
  return true;
}
function btRide(dt, K) {
  if (BT_STATE.slide) return btSlideRide(dt, K);
  const P = K.player, I = K.input, B = bathsB;
  const R = !P.car && !P.hide && P.alive ? poolAt(P.x, P.z) : null;
  if (!R || P.y > R.floor + 0.88 || P.vy > 0.5) { if (BT_STATE.swim) btLeaveWater(K); return false; }
  if (!BT_STATE.swim) btEnterWater(K, R);
  // a swimmer's speed: slow, and front crawl if you sprint (it tires you out)
  const crawl = I.sprint && P.stam > 5 && I.fwd > 0, sp = (crawl ? 3.4 : 2.0) * (BT_STATE.under ? 0.85 : 1) * (BT_STATE.wave ? 0.8 : 1);
  if (crawl) P.stam = Math.max(0, P.stam - 16 * dt); else P.stam = Math.min(100, P.stam + 8 * dt);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), sx = Math.cos(P.yaw), sz = -Math.sin(P.yaw);
  let vx = (fx * I.fwd + sx * I.side) * sp, vz = (fz * I.fwd + sz * I.side) * sp;
  if (BT_STATE.wave) { vx += Math.sin(K.time * 1.3) * 0.6; }
  const ox = P.x, oz = P.z;
  P.x += vx * dt; P.z += vz * dt;
  btBall.x = P.x; btBall.z = P.z; moveBody(P, ox, oz, 0.4, P.y, 1.8);
  P.vx = vx; P.vz = vz; P.sprinting = false;
  // stepping up out of the water on the steps
  const fl = floorAt(P.x, P.z, P.y + 0.45);
  if (fl > P.y + 0.05 && fl - P.y < 0.42) P.y = fl; else if (fl < P.y - 0.05) P.y = Math.max(fl, P.y - dt * 2);
  // under you go: hold crouch (only where it's deep enough)
  if (!I.crouch) BT_STATE.needUp = false; // (after running out of breath, let go of crouch before you can go under again)
  const deep = R.floor < 0.3, wantUnder = I.crouch && deep && !BT_STATE.needUp && (BT_STATE.under || BT_STATE.breath > 0.2);
  if (wantUnder && !BT_STATE.under) { BT_STATE.under = true; BT_STATE.unders++; K.sfx.splash && K.sfx.splash(); }
  if (!wantUnder && BT_STATE.under) { BT_STATE.under = false; if (BT_STATE.breath < 0.25) { BT_STATE.gasps++; K.showMsg('*GASP*', 1); } }
  if (I.crouch && !deep && BT_STATE.msgT <= 0) { BT_STATE.msgT = 4; K.showMsg('TOO SHALLOW TO DUCK UNDER HERE', 1.4); }
  if (BT_STATE.under) {
    BT_STATE.breath = Math.max(0, BT_STATE.breath - dt / 14);
    if (BT_STATE.breath <= 0) { BT_STATE.under = false; BT_STATE.needUp = true; BT_STATE.gasps++; K.hurt(4); K.showMsg('OUT OF BREATH! YOU BURST UP SPLUTTERING', 1.8); }
  } else BT_STATE.breath = Math.min(1, BT_STATE.breath + dt / 5);
  P.crouch = BT_STATE.under ? 1 : R.floor > 0.3 || P.y > 0.5 ? 0.2 : 0.62; // your head just above the water (or right under it)
  btOverlay(BT_STATE.under, 1 - BT_STATE.breath);
  // lengths: touch one end, then the other
  if (R === B.pool) {
    const end = P.x < R.x0 + 1.4 ? 'deep' : P.x > R.x1 - 1.4 ? 'shallow' : null;
    if (end && BT_STATE.lenFrom && end !== BT_STATE.lenFrom) { BT_STATE.lengths++; if (BT_STATE.lengths % 2 === 0) K.showMsg(`${BT_STATE.lengths} LENGTHS`, 1.2); }
    if (end) BT_STATE.lenFrom = end;
  }
  // jump at the side to haul yourself out
  if (I.jumpEdge) {
    I.jumpEdge = false;
    for (const d of [0.7, 1.0]) { const tx = P.x + fx * d, tz = P.z + fz * d, top = floorAt(tx, tz, BT_DECK + 0.3); if (top > P.y + 0.4 && top <= BT_DECK + 0.05 && !poolAt(tx, tz)) { P.x = tx; P.z = tz; P.y = top; btLeaveWater(K); K.showMsg('YOU HAUL YOURSELF OUT', 1.2); return true; } }
  }
  return true;
}
function btEnterWater(K, R) {
  const P = K.player;
  BT_STATE.swim = true; BT_STATE.under = false; BT_STATE.lenFrom = null;
  if (K.sfx.splash) K.sfx.splash(BT_STATE.splashY > 2.2);
  if (BT_STATE.splashY > 2.2) { BT_STATE.dives++; if (BT_STATE.splashY > 3) K.showMsg('WHAT A DIVE', 1.2); }
  if (SK_STATE.smellT > 0) { SK_STATE.smellT = 0; K.showMsg('THE WATER TAKES THE BIN SMELL WITH IT', 1.8); }
  if (!P.outfit.head || P.outfit.head !== 'bt_cap') if (BT_STATE.msgT <= 0) { BT_STATE.msgT = 8; K.showMsg(R === bathsB.pool ? 'IN THE POOL. HOLD CROUCH TO DUCK UNDER' : 'THE LEARNER POOL. NICE AND WARM. TOO WARM.', 1.8); }
}
function btLeaveWater(K) { BT_STATE.swim = false; BT_STATE.under = false; BT_STATE.wetT = 90; btOverlay(false); K.player.crouch = 0; }

// =====================================================================
// E: reception, the cafe
// =====================================================================
const BT_COSTUME = [
  { id: 'bt_cap', slot: 'head', cat: 'swim', name: 'SWIMMING CAP', price: 2, dg: 0.2, desc: 'Rubber, white, flowers on it. Tight. Your own mother wouldn\'t know you.' },
  { id: 'bt_goggles', slot: 'eyes', cat: 'swim', name: 'SWIMMING GOGGLES', price: 2, dg: 0.15, desc: 'Leave red rings round your eyes for an hour.' },
];
for (const c of BT_COSTUME) if (!CATALOG.costume.some((o) => o.id === c.id)) CATALOG.costume.push(c);
function btDeskMenu(K) {
  const P = K.player, day = K.G.day;
  return {
    cash: () => P.cash,
    items: () => [
      { id: 'bt_swim', name: 'A SWIM (ALL DAY)', price: 3, desc: 'In and out as often as you like today. Lockers take a coin.' },
      { id: 'bt_cap', name: 'SWIMMING CAP', price: 2, desc: 'White rubber with flowers. A very good disguise.' },
      { id: 'bt_goggles', name: 'GOGGLES', price: 2, desc: 'Nobody looks twice at someone in goggles.' },
      { id: 'bt_towel', name: 'HIRE A TOWEL', price: 1, desc: 'Dry off before you go back out. Dripping in the street gets you looked at.' },
    ],
    state: (it) => (it.id === 'bt_swim' && BT_STATE.paidDay === day ? 'owned' : (it.id === 'bt_cap' && P.outfit.head === 'bt_cap') || (it.id === 'bt_goggles' && P.outfit.eyes === 'bt_goggles') ? 'owned' : ''),
    buy(it) {
      if (it.id === 'bt_swim' && BT_STATE.paidDay === day) return 'YOU\'VE PAID FOR TODAY';
      if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`;
      if ((it.id === 'bt_cap' && P.outfit.head === 'bt_cap') || (it.id === 'bt_goggles' && P.outfit.eyes === 'bt_goggles')) return 'YOU\'VE GOT THEM ON';
      P.cash -= it.price; K.sfx.cash();
      if (it.id === 'bt_swim') { BT_STATE.paidDay = day; return 'THROUGH THE TURNSTILE. SHOWER FIRST, PLEASE'; }
      if (it.id === 'bt_towel') { BT_STATE.wetT = 0; BT_STATE.towels++; return 'DRY AS A BONE'; }
      return K.wear(it.id);
    },
  };
}
const BT_CAFE = [
  { id: 'bt_chips', name: 'CHIPS IN A CUP', price: 2, heal: 14, desc: 'Nothing tastes better after a swim. Nothing (+14).' },
  { id: 'bt_choc', name: 'HOT CHOCOLATE', price: 2, heal: 8, cool: true, desc: 'From the machine. Scalding. Calms you down (+8).' },
  { id: 'bt_toast', name: 'CHEESE TOASTIE', price: 3, heal: 20, desc: 'The cheese is the temperature of the sun (+20).' },
];
function btCafeMenu(K) {
  const P = K.player;
  return { cash: () => P.cash, items: () => BT_CAFE, state: () => '', buy(it) { if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`; P.cash -= it.price; K.sfx.cash(); P.hp = Math.min(100, P.hp + it.heal); if (it.cool) K.coolHeat(4); return mpick(['THERE YOU GO, LOVE', 'MIND, IT\'S HOT', 'VINEGAR\'S ON THE SIDE']); } };
}
function btUseTarget(K) {
  const P = K.player, B = bathsB;
  if (BT_STATE.slide) return { kind: 'sliding', first: true };
  if (btSlide.built && !P.car && !P.hide && P.y > 5.5 && Math.hypot(P.x - btSlide.top.x, P.z - btSlide.top.z) < 1.6) return { kind: 'slide' };
  if (!B.built || P.car || P.mode !== 'move' || P.hide || !inBaths(P.x, P.z) || P.y > 0.8) return null;
  if (Math.hypot(P.x - B.desk.x, P.z - B.desk.z) < 1.8) return { kind: 'desk' };
  if (Math.hypot(P.x - B.cafe.x, P.z - B.cafe.z) < 2.4 && P.z < 374) return { kind: 'cafe' };
  return null;
}
function btUsePrompt(T, K, useK) {
  const open = btOpen(K.G.day, K.hour);
  if (T.kind === 'slide') return open ? `${useK} to go down THE TWISTER` : 'The slide is shut';
  if (T.kind === 'sliding') return 'WHEEEEE';
  if (T.kind === 'desk') return open ? `${useK} for reception (swim, cap, goggles, towels)` : 'HALDEN BATHS is shut';
  if (T.kind === 'cafe') return open ? `${useK} for the poolside cafe` : 'The cafe is shut';
  return '';
}
function btUse(T, K) {
  if (T.kind === 'sliding') return;
  if (T.kind === 'slide') { if (!btOpen(K.G.day, K.hour)) { K.showMsg('THE SLIDE\'S SHUT. THERE\'S A CHAIN ACROSS IT', 1.6); return; } BT_STATE.slide = { s: 0, v: 2.5 }; K.sfx.whoosh && K.sfx.whoosh(); return; }
  if (!btOpen(K.G.day, K.hour)) { K.showMsg('SHUT. OPEN 7 TILL 9 (SUNDAYS 8 TILL 6)', 1.8); return; }
  if (T.kind === 'desk') { K.openMenu({ name: 'HALDEN BATHS RECEPTION', kind: 'baths', blurbs: ['"JUST THE ONE, IS IT?"', '"LOCKERS TAKE A COIN, YOU GET IT BACK."', '"NO BOMBING. I MEAN IT."'] }, btDeskMenu(K)); return; }
  if (T.kind === 'cafe') K.openMenu({ name: 'THE POOLSIDE CAFE', kind: 'baths', blurbs: ['"CHIPS?"', '"THE HOT CHOCOLATE MACHINE IS WORKING TODAY. FOR ONCE."'] }, btCafeMenu(K));
}

// =====================================================================
// Each frame
// =====================================================================
const BT_WHISTLE = ['NO RUNNING!', 'WALK, PLEASE!', 'OI! WALK!', 'SLOW DOWN ON THE SIDE!'];
const BT_NOTICKET = ['HAVE YOU PAID?', 'WHERE\'S YOUR WRISTBAND?', 'OUT, PLEASE. RECEPTION FIRST', 'I DIDN\'T SEE YOU COME THROUGH THE TURNSTILE'];
const BT_CLOTHES = ['YOU CAN\'T SWIM IN JEANS!', 'COSTUMES ONLY IN THE POOL!', 'ARE YOU... FULLY DRESSED IN THERE?'];
function btUpdate(dt, K) {
  const B = bathsB; if (!B.built) return;
  buildBtPeople();
  const P = K.player, day = K.G.day, hr = K.hour, open = btOpen(day, hr), near = K.near(-72, 352, 110);
  // how far you fell before you hit the water (for splashes)
  if (!BT_STATE.swim && !P.car) { if (P.vy < -0.5) BT_STATE.splashY = Math.max(BT_STATE.splashY, (BT_STATE.peakY ?? P.y) - P.y); else { BT_STATE.peakY = P.y; BT_STATE.splashY = 0; } }
  BT_STATE.msgT = Math.max(0, BT_STATE.msgT - dt);
  if (BT_STATE.wetT > 0 && !BT_STATE.swim) BT_STATE.wetT = Math.max(0, BT_STATE.wetT - dt);
  for (const S of btStaff) S.g.visible = open;
  if (!near) { if (BT_STATE.swim && !poolAt(P.x, P.z)) btLeaveWater(K); return; }
  // the wave machine
  const wave = open && waveNow(hr);
  if (wave && !BT_STATE.wave) { BT_STATE.waves++; if (inHall(P.x, P.z)) { K.banner('WAVE MACHINE!<small>EVERYBODY IN</small>', 2.5); if (K.sfx.whistle) K.sfx.whistle(); } }
  BT_STATE.wave = wave;
  if (K.near(-77, 352, 45)) for (const w of btWaters) {
    const a = w.geometry.attributes.position, base = w.userData.base, amp = wave ? 0.14 : 0.02;
    for (let i = 0; i < a.count; i++) a.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(K.time * (wave ? 2.4 : 1.2) + base[i * 3] * 0.7) * amp;
    a.needsUpdate = true;
  }
  btAnimSwimmers(dt, K, open && K.near(-77, 352, 70));
  btKidSlide(dt, K, open && K.near(-77, 352, 60));
  if (!B.welcomed || B.welcomed !== day) { if (open && K.near(-44, 352, 26)) { B.welcomed = day; K.banner('HALDEN BATHS<small>SWIM $3 · WAVES ON THE HOUR · NO RUNNING</small>', 4); } }
  // the lifeguard, up on the chair, watching the water and the side
  const G = B.guard; if (!G || !open) return;
  G.warnT = Math.max(0, G.warnT - dt);
  const dx = P.x - G.x, dz = P.z - G.z, want = inHall(P.x, P.z) ? Math.atan2(dx, dz) : Math.PI * 0.5 + Math.sin(K.time * 0.3) * 1.2;
  G.look += clamp(want - G.look, -dt * 1.5, dt * 1.5); G.g.rotation.y = G.look;
  if (G.warnT > 0 || P.car || P.hide || !inHall(P.x, P.z) || BT_STATE.under) return;
  let why = null;
  if (P.sprinting && !BT_STATE.swim && P.y > 1.0) why = 'run';
  else if (BT_STATE.swim && BT_STATE.paidDay !== day) why = 'ticket';
  else if (BT_STATE.swim && P.outfit.body && !String(P.outfit.body).startsWith('bt_') && Math.random() < 0.004) why = 'clothes';
  if (!why || Math.hypot(dx, dz) > 34) return;
  G.warnT = why === 'clothes' ? 30 : 7; BT_STATE.warned++;
  if (K.sfx.whistle) K.sfx.whistle();
  K.say({ g: G.g }, mpick(why === 'run' ? BT_WHISTLE : why === 'ticket' ? BT_NOTICKET : BT_CLOTHES)); K.bumpLocal(0.04);
  if (why !== 'clothes' && BT_STATE.warned % 2 === 0) { K.addHeat(1); K.report(); K.showMsg('THE LIFEGUARD IS ON THE PHONE TO SOMEONE. AND LOOKING AT YOU', 2.2); }
  else K.showMsg(why === 'run' ? 'THE LIFEGUARD BLOWS HER WHISTLE AT YOU' : why === 'ticket' ? 'THE LIFEGUARD WANTS TO SEE YOUR WRISTBAND' : 'THE LIFEGUARD IS STARING AT YOUR CLOTHES', 1.8);
}
function btConspic(K) {
  const P = K.player; if (P.car) return 0;
  if (BT_STATE.wetT > 0 && !inBaths(P.x, P.z)) return 0.12 * Math.min(1, BT_STATE.wetT / 30); // dripping wet in the street
  if (!inBaths(P.x, P.z) || !btOpen(K.G.day, K.hour)) return 0;
  let k = -0.06;
  if (BT_STATE.swim) {
    k -= 0.2;
    if (P.outfit.head === 'bt_cap') k -= 0.08;
    if (P.outfit.eyes === 'bt_goggles') k -= 0.06;
    if (P.outfit.body && !String(P.outfit.body).startsWith('bt_')) k += 0.1; // swimming in your clothes
    if (BT_STATE.wave) k -= 0.1;
    if (P.crouch > 0.5) k -= 0.15; // (undo the crouch penalty: everyone in the pool is low in the water)
  }
  return k;
}
export const baths = {
  name: 'baths', roofs: btRoofs,
  useTarget: btUseTarget, usePrompt: btUsePrompt, use: btUse, conspic: btConspic, update: btUpdate, ride: btRide, plan: () => false,
  unseen: () => BT_STATE.under || !!BT_STATE.slide,
  reset() { Object.assign(BT_STATE, { slide: null, slides: 0, kidSlides: 0, paidDay: 0, swim: false, under: false, breath: 1, wetT: 0, lengths: 0, lenFrom: null, dives: 0, unders: 0, warned: 0, warnT: 0, gasps: 0, wave: false, waves: 0, towels: 0, msgT: 0, splashY: 0 }); btOverlay(false); bathsB.welcomed = 0; if (bathsB.guard) bathsB.guard.warnT = 0; },
  diary(K) { const b = []; if (BT_STATE.paidDay === K.G.day) b.push('A SWIM AT HALDEN BATHS (PAID FOR THE DAY)'); if (BT_STATE.wetT > 0) b.push('STILL DRIPPING'); return b; },
  debug: () => ({ built: bathsB.built, swimmers: btSwimmers.length, staff: btStaff.length, cubicles: bathsB.cubicles.length, lockers: bathsB.lockers.length, ...BT_STATE }),
  bathsB, btSlide, BT_STATE, BT_CLEAR, poolAt, inBaths, inHall, btOpen, waveNow, btDeskMenu, btCafeMenu, BT_WATER, BT_DECK,
};
