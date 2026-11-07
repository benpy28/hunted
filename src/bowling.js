// GUTTERBALL LANES: an eight-lane bowling alley on Route 4, just south of PORT HALDEN, on the leisure park it
// shares with the swimming baths.
//  - Hire a lane at the desk ($4: five frames, shoes included). Stand on your lane's approach and press E to
//    step up: slide left and right, look to aim, E again to let it go. The pins are proper pins: they fly,
//    they knock each other over, and sometimes the 7 just stands there wobbling.
//  - The other lanes are full of birthday parties and works dos bowling for themselves. Get a strike and half
//    the room cheers, and for a few seconds every eye in the place is on the scoreboard, not on you.
//  - Three strikes in a row (a turkey) wins a GUTTERBALL bowling shirt from the desk.
//  - Fridays and Saturdays after 8 it's COSMIC BOWLING: the lights go down and the pins glow.
//  - Walk down the lanes and the man on the desk will have something to say about it.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene, textTex } from './core.js';
import { clearings, railGaps, propBuf, glowBuf, groundBuf, markBuf, addCollider, addRoof, worldHooks, navOpen, keepClear, parkedSpots } from './world.js';
import { interiorZones } from './interiors.js';
import { buildPerson, lam, SKINS, HAIRS } from './people.js';
import { CATALOG } from './shops.js';
import { MK_STATE } from './market.js';
import { hidePiece } from './gigs.js';
import { weekdayOf } from './townday.js';

// =====================================================================
// Where everything is
// =====================================================================
export const BW_CLEAR = { x0: -132, x1: -20, z0: 252, z1: 318 };
clearings.push(BW_CLEAR, { x0: -20, x1: -9, z0: 252, z1: 390 }); // (and the verge along Route 4, where the drive comes in)
railGaps.push({ road: 'ROUTE 4', axis: 'z', side: -1, a0: 276, a1: 300 }, { road: 'ROUTE 4', axis: 'z', side: 1, a0: 290, a1: 302 }); // the drive, and the bus stops either side
export const alley = {
  name: 'GUTTERBALL LANES', x0: -100, x1: -44, z0: 262, z1: 300, H: 7, door: { x: -43.6, z: 282 },
  desk: { x: -51.2, z: 292.5 }, snack: { x: -66, z: 295.2 }, FX: -66, HX: -84.5, PIT: -86.8, lanes: [], lockers: [], built: false,
};
export const bwRoofs = [];
export const BW_STATE = { lane: null, aim: null, games: 0, rolls: 0, strikes: 0, spares: 0, gutters: 0, best: 0, streak: 0, turkey: 0, shirtWon: false, warned: 0, warnT: 0, cheerT: 0, msgT: 0, npcRolls: 0 };
export const inAlley = (x, z) => x > alley.x0 && x < alley.x1 && z > alley.z0 && z < alley.z1;
export const bwOpen = (hr) => hr >= 10 && hr < 24;
export const cosmicNow = (day, hr) => { const wd = weekdayOf(day); return (wd === 4 || wd === 5) && hr >= 20 && hr < 24; };
const BW_FRAMES = 5;

// =====================================================================
// Building it
// =====================================================================
const BW_PURPLE = 0x4a2a7a, BW_TEAL = 0x1aa0a0, BW_WOOD = 0xd8a868, BW_GUTTER = 0x2a2a30, BW_CARPET = 0x2a1a4a;
function bwWall(x0, x1, z0, z1, h, col, y0 = 0) { propBuf.box(x0, x1, y0, h, z0, z1, col); addCollider(x0, x1, z0, z1, h, { y0 }); }
function bwPlane(w, h, tex, x, y, z, ry = 0, basic = true) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
}
const bwHallMat = new THREE.MeshBasicMaterial({ color: 0xfff2d8 });
const bwPinMat = new THREE.MeshLambertMaterial({ color: 0xf8f8f4, emissive: 0x000000 });
const bwPinBand = new THREE.MeshBasicMaterial({ color: 0xd02a2a });
const bwPinGeo = new THREE.CylinderGeometry(0.035, 0.058, 0.38, 8); bwPinGeo.translate(0, 0.19, 0);
const bwBandGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8); bwBandGeo.translate(0, 0.3, 0);
const bwBallGeo = new THREE.SphereGeometry(0.11, 12, 10);
const BW_BALLS = [0x2a4ad0, 0xd02a6a, 0x1a1a1a, 0x2ab04a, 0xe0a020, 0x8a2ad0];

function buildAlleyShell() {
  const A = alley, H = A.H, P = BW_CLEAR;
  groundBuf.flat(P.x0, P.x1, P.z0, P.z1, 0.011, 0x5a7d45);
  groundBuf.flat(-42, -20, 256, 316, 0.013, 0x4a4a50); // the car park (shared with the baths next door)
  groundBuf.flat(-20, -7, 278, 286, 0.013, 0x4a4a50); // the drive in off Route 4
  groundBuf.flat(-44, -42, 262, 300, 0.016, 0x8a8590); // a pavement along the front
  for (let z = 258; z <= 314; z += 3) if (z < 277 || z > 287) { markBuf.flat(-40, -35, z - 0.06, z + 0.06, 0.02, 0xe8e8e8); markBuf.flat(-27, -22, z - 0.06, z + 0.06, 0.02, 0xe8e8e8); }
  for (const [z, h] of [[259.5, Math.PI / 2], [265.5, Math.PI / 2], [292.5, -Math.PI / 2], [304.5, -Math.PI / 2], [310.5, Math.PI / 2]]) parkedSpots.push({ x: h > 0 ? -37.5 : -24.5, z, heading: h });
  for (const z of [262, 282, 302]) { propBuf.box(-31.1, -30.9, 0, 6, z - 0.1, z + 0.1, 0x2e3035); glowBuf.box(-31.4, -30.6, 5.8, 6, z - 0.4, z + 0.4, 0xfff0c4); }
  // the floor, walls and roof
  groundBuf.flat(A.x0 + 0.2, A.x1 - 0.2, A.z0 + 0.2, A.z1 - 0.2, 0.02, BW_CARPET);
  bwWall(A.x0 - 0.3, A.x0, A.z0, A.z1, H, BW_PURPLE); bwWall(A.x0, A.x1, A.z0 - 0.3, A.z0, H, BW_PURPLE); bwWall(A.x0, A.x1, A.z1, A.z1 + 0.3, H, BW_PURPLE);
  // the front: glass and doors, a canopy, the name in lights
  for (const [a, b] of [[A.z0, 280], [284, A.z1]]) {
    bwWall(A.x1, A.x1 + 0.3, a, b, 0.6, BW_TEAL);
    propBuf.box(A.x1 + 0.1, A.x1 + 0.2, 0.6, 3.2, a, b, 0x9ac8e0, { glass: true }); addCollider(A.x1, A.x1 + 0.3, a, b, H, { y0: 0.6 });
    propBuf.box(A.x1, A.x1 + 0.3, 3.2, H, a, b, BW_PURPLE);
  }
  propBuf.box(A.x1, A.x1 + 0.3, 3.2, H, 280, 284, BW_PURPLE);
  navOpen.push({ x0: A.x1 - 1.5, x1: A.x1 + 1.5, z0: 280.4, z1: 283.6 }); keepClear.push({ x0: A.x1 - 2, x1: A.x1 + 6, z0: 279, z1: 285 });
  propBuf.box(A.x1, A.x1 + 3.2, 3.5, 3.9, 276, 288, BW_TEAL, { bottom: true }); addRoof(A.x1, A.x1 + 3.2, 276, 288, 3.9, { y0: 3.5 });
  for (let z = 276.3; z < 288; z += 0.6) glowBuf.box(A.x1 + 3.1, A.x1 + 3.22, 3.4, 3.5, z - 0.06, z + 0.06, 0xff7ae0);
  bwPlane(16, 2.2, textTex(1024, 140, '#2a1a4a', '#ff7ae0', ['GUTTERBALL LANES'], 'bold 96px Arial Black, Arial', false), A.x1 + 0.32, 5.3, 282, Math.PI / 2);
  glowBuf.box(A.x1 + 0.31, A.x1 + 0.33, 4.1, 4.16, 274, 290, 0x7affff); glowBuf.box(A.x1 + 0.31, A.x1 + 0.33, 6.44, 6.5, 274, 290, 0x7affff);
  // a giant pin on the roof, because of course
  for (const [r, y0, y1] of [[0.9, H, H + 1.2], [0.6, H + 1.2, H + 2.4], [0.45, H + 2.4, H + 3.1], [0.7, H + 3.1, H + 4.1], [0.35, H + 4.1, H + 4.5]]) propBuf.cyl(-52, 282, r, r, y0, y1, 0xf8f8f4, 10);
  propBuf.cyl(-52, 282, 0.5, 0.5, H + 2.5, H + 2.8, 0xd02a2a, 10);
  // the totem by the road
  propBuf.box(-12.4, -11.6, 0, 4.5, 288.6, 289.4, BW_PURPLE);
  bwPlane(3.2, 2.4, textTex(256, 192, '#4a2a7a', '#7affff', ['GUTTER', 'BALL', 'LANES', '& THE BATHS'], 'bold 40px Arial Black, Arial', false), -11.55, 3.6, 289, Math.PI / 2);
  // roof
  propBuf.box(A.x0 - 0.3, A.x1 + 0.3, H, H + 0.3, A.z0 - 0.3, A.z1 + 0.3, 0x3a3a44, { bottom: true }); addRoof(A.x0 - 0.3, A.x1 + 0.3, A.z0 - 0.3, A.z1 + 0.3, H + 0.3, { y0: H });
  bwRoofs.push({ x0: A.x0, x1: A.x1, z0: A.z0, z1: A.z1, h: H });
  interiorZones.push({ x0: A.x0, x1: A.x1, z0: A.z0, z1: A.z1, y0: -0.5, y1: H - 0.2, name: A.name });
  // ceiling lights (they dim for cosmic bowling)
  for (let x = A.x0 + 6; x < A.x1 - 2; x += 7) for (const z of [268, 278, 288, 296]) { const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.6), bwHallMat); m.position.set(x, H - 0.05, z); scene.add(m); }
  for (let z = 263; z < 300; z += 1.5) glowBuf.box(A.x0 + 0.02, A.x0 + 0.06, 4, 4.3, z, z + 0.7, mpick([0xff7ae0, 0x7affff, 0xffe070]));
  hidePiece('wardrobe', -99.6, 296, 1, 0, 0.6, 0.35, 2.1, 0); // the staff coat cupboard at the back
}
// a lane: the approach, the foul line, polished boards, gutters, the pin deck, the masking unit over the pit
function buildLane(i) {
  const A = alley, zc = 268.3 + i * 2.6, L = { i, z: zc, pins: [], ball: null, rolls: [], frame: 0, b: 0, state: 'idle', t: 0, owner: null, scoreT: 0 };
  propBuf.box(A.PIT, A.FX, 0, 0.03, zc - 0.55, zc + 0.55, BW_WOOD); // the lane
  propBuf.box(A.FX, -60.5, 0, 0.03, zc - 0.7, zc + 0.7, 0xe8c890); // the approach
  for (let x = A.FX - 4.5; x > A.FX - 5.5; x -= 0.3) markBuf.flat(x - 0.05, x + 0.05, zc - 0.05, zc + 0.05, 0.04, 0x6a3a1a); // the arrows
  for (const k of [-3, -1.5, 0, 1.5, 3]) markBuf.flat(A.FX - 4.6 - Math.abs(k) * 0.15, A.FX - 4.4 - Math.abs(k) * 0.15, zc + k * 0.1 - 0.03, zc + k * 0.1 + 0.03, 0.04, 0x3a1a0a);
  markBuf.flat(A.FX - 0.03, A.FX + 0.03, zc - 0.55, zc + 0.55, 0.04, 0xd02a2a); // the foul line
  for (const s of [-1, 1]) propBuf.box(A.PIT, A.FX, -0.02, 0.01, zc + s * 0.55, zc + s * 0.8, BW_GUTTER);
  if (i < 7) { // the divider between this lane and the next, with a ball return on every other one
    propBuf.box(A.PIT, A.FX, 0, 0.12, zc + 0.8, zc + 1.8, 0x3a3a48);
    if (i % 2 === 0) { propBuf.box(-61.8, -60.6, 0, 0.9, zc + 0.95, zc + 1.65, 0x1a1a2a); glowBuf.box(-61.75, -60.65, 0.9, 0.92, zc + 1.0, zc + 1.6, 0x7affff); addCollider(-61.8, -60.6, zc + 0.95, zc + 1.65, 0.9);
      for (let k = 0; k < 3; k++) propBuf.cyl(-61.5 + k * 0.4, zc + 1.3, 0.11, 0.11, 0.9, 1.12, mpick(BW_BALLS), 8); }
  }
  // the bench behind the approach, two seats per lane, and the screen overhead
  propBuf.box(-59.8, -59.2, 0, 0.45, zc - 1.0, zc + 1.0, 0x6a3aaa); propBuf.box(-59.2, -59.0, 0.45, 1.1, zc - 1.0, zc + 1.0, 0x6a3aaa);
  addCollider(-59.8, -59.0, zc - 1.0, zc + 1.0, 0.45);
  L.seats = [-0.5, 0.5].map((o) => ({ x: -60.6, z: zc + o, sx: -59.5, sz: zc + o, face: -Math.PI / 2, top: 0.45, taken: null }));
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  L.canvas = c; L.tex = tex; L.screen = bwPlane(2.2, 0.55, tex, -63.5, 3.3, zc, Math.PI / 2);
  propBuf.box(-63.6, -63.5, 3.6, A.H, zc - 0.02, zc + 0.02, 0x2a2a2e);
  // the pins and the ball (real meshes: they get knocked about)
  for (let r = 0; r < 4; r++) for (let k = 0; k <= r; k++) {
    const g = new THREE.Group(), body = new THREE.Mesh(bwPinGeo, bwPinMat), band = new THREE.Mesh(bwBandGeo, bwPinBand); g.add(body, band);
    const pin = { hx: A.HX - r * 0.264, hz: zc + (k - r / 2) * 0.305, g, up: true, gone: false, vx: 0, vz: 0, tilt: 0, tdir: 0, wob: 0 };
    pin.x = pin.hx; pin.z = pin.hz; g.position.set(pin.x, 0.03, pin.z); scene.add(g); L.pins.push(pin);
  }
  const ball = new THREE.Mesh(bwBallGeo, lam(BW_BALLS[i % BW_BALLS.length])); ball.visible = false; scene.add(ball);
  L.ball = { m: ball, x: 0, z: 0, vx: 0, vz: 0, spin: 0, on: false, gutter: false, by: null };
  A.lanes.push(L);
}
function buildAlleyInsides() {
  const A = alley, H = A.H;
  // the masking unit over the pit (with the machines behind it): you can see under it, you can't get through
  bwWall(-100, -88.6, 266.8, 288.4, H, 0x2a1a3a);
  propBuf.box(-88.7, -88.6, 1.0, H, 266.8, 288.4, 0x1a1a2a);
  for (const L of A.lanes) { bwPlane(1.9, 0.9, textTex(192, 96, '#1a1a2a', '#ff7ae0', [String(L.i + 1)], 'bold 70px Arial Black, Arial', false), -88.55, 1.9, L.z, Math.PI / 2); glowBuf.box(-88.55, -88.5, 0.95, 1.0, L.z - 0.9, L.z + 0.9, 0x7affff); }
  glowBuf.box(-88.6, -86.8, 0.98, 1.0, 266.8, 288.4, 0xfff4dc); // the pin deck lights
  // the desk: lane hire and shoes, a wall of shoe cubbyholes behind
  propBuf.box(-53.2, -52.2, 0, 1.1, 289, 296, 0x2a1a4a); addCollider(-53.2, -52.2, 289, 296, 1.1); propBuf.box(-53.3, -52.1, 1.1, 1.16, 288.9, 296.1, BW_TEAL);
  for (let z = 289.3; z < 296; z += 0.5) for (let y = 0.3; y < 2.4; y += 0.4) propBuf.box(-55.9, -55.5, y, y + 0.32, z, z + 0.42, mpick([0x8a2a2a, 0x2a4a8a, 0x3a3a3a, 0xe0e0e0]));
  bwPlane(4, 0.8, textTex(512, 100, '#2a1a4a', '#7affff', ['LANES · SHOES · PARTIES'], 'bold 44px Arial Black, Arial', false), -52.0, 2.6, 292.5, Math.PI / 2);
  // the snack bar along the back wall
  propBuf.box(-70, -62, 0, 1.1, 296.2, 297.2, 0xd02a6a); addCollider(-70, -62, 296.2, 297.2, 1.1); propBuf.box(-70.1, -61.9, 1.1, 1.16, 296.1, 297.3, 0xf0f0f0);
  propBuf.box(-69, -67, 1.16, 1.8, 296.4, 297, 0xd8d8e0); glowBuf.box(-68.9, -67.1, 1.3, 1.7, 296.38, 296.4, 0xffe070); // the hot dog roller
  bwPlane(6, 1.2, textTex(512, 100, '#d02a6a', '#ffffff', ['HOT DOGS · NACHOS · SLUSH'], 'bold 40px Arial Black, Arial', false), -66, 3.0, 299.65, Math.PI);
  // cafe tables between the snack bar and the lanes
  for (const [x, z] of [[-74, 292], [-70, 292], [-66, 292], [-62, 292], [-78, 295], [-74, 296.5]]) {
    propBuf.cyl(x, z, 0.05, 0.05, 0, 0.75, 0x2a2a2e, 6); propBuf.cyl(x, z, 0.5, 0.5, 0.75, 0.8, 0xf0f0f0, 10); addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0.8);
    for (const s of [-1, 1]) propBuf.cyl(x + s * 0.8, z, 0.22, 0.22, 0, 0.48, 0xd02a6a, 8);
  }
  // the arcade by the door: a few cabinets and the claw machine
  for (let k = 0; k < 5; k++) { const z = 263.5 + k * 1.3; propBuf.box(-45.6, -44.6, 0, 1.9, z - 0.5, z + 0.5, mpick([0x2a2a6a, 0x6a2a2a, 0x1a1a1a, 0x2a6a2a])); glowBuf.box(-45.62, -45.6, 1.1, 1.7, z - 0.4, z + 0.4, mpick([0x7affff, 0xff7ae0, 0xffe070, 0x7aff7a])); addCollider(-45.6, -44.6, z - 0.5, z + 0.5, 1.9); }
  propBuf.box(-46, -44.6, 0, 1.0, 270.5, 272, 0xe04ad0); propBuf.box(-46, -44.6, 1.0, 2.2, 270.5, 272, 0x9ac8e0, { glass: true }); addCollider(-46, -44.6, 270.5, 272, 2.2);
  // lockers for your coat (and you, if it comes to it)
  for (const x of [-50, -48.8, -47.6]) A.lockers.push(hidePiece('locker', x, 299.55, 0, -1, 0.3, 0.25, 1.9, 0));
  // a side corridor down to the staff door at the back, past the toilets
  bwWall(-100, -58, 288.4, 288.6, 1.0, 0x3a2a5a); // a low wall between the lanes and the cafe
}
worldHooks.beforeBake.push(() => {
  buildAlleyShell();
  for (let i = 0; i < 8; i++) buildLane(i);
  buildAlleyInsides();
  alley.built = true;
});

// =====================================================================
// The score
// =====================================================================
// standard ten-pin scoring, over however many frames: returns the running total after each frame
export function bwScore(rolls, N = BW_FRAMES) {
  const out = []; let i = 0, tot = 0;
  for (let f = 0; f < N && i < rolls.length; f++) {
    const a = rolls[i];
    if (a === 10) { const b1 = rolls[i + 1], b2 = rolls[i + 2]; if (b1 == null || b2 == null) { out.push(null); break; } tot += 10 + b1 + b2; i += 1; }
    else {
      const b = rolls[i + 1]; if (b == null) { out.push(null); break; }
      if (a + b === 10) { const c = rolls[i + 2]; if (c == null) { out.push(null); break; } tot += 10 + c; } else tot += a + b;
      i += 2;
    }
    out.push(tot);
  }
  return out;
}
const bwTotal = (rolls) => { const s = bwScore(rolls); let t = 0; for (const v of s) if (v != null) t = v; return t; };
function bwDrawScreen(L) {
  const x = L.canvas.getContext('2d'), W = 256, H = 64, cosmic = L.cosmic;
  x.fillStyle = cosmic ? '#0a0a2a' : '#1a1a3a'; x.fillRect(0, 0, W, H);
  x.fillStyle = cosmic ? '#ff7ae0' : '#7affff'; x.font = 'bold 13px Arial'; x.textAlign = 'left';
  x.fillText(`LANE ${L.i + 1}  ${L.owner === 'player' ? 'YOU' : L.owner ? L.party : 'OPEN'}`, 6, 14);
  if (L.flash > 0) { x.fillStyle = '#ffe070'; x.font = 'bold 30px Arial Black, Arial'; x.textAlign = 'center'; x.fillText(L.flashTxt, W / 2, 50); L.tex.needsUpdate = true; return; }
  const s = bwScore(L.rolls), fw = (W - 12) / BW_FRAMES;
  let i = 0;
  for (let f = 0; f < BW_FRAMES; f++) {
    const fx = 6 + f * fw; x.strokeStyle = '#6a6a9a'; x.strokeRect(fx, 20, fw - 2, 40);
    x.fillStyle = '#fff'; x.font = 'bold 11px Arial'; x.textAlign = 'center';
    const a = L.rolls[i], b = L.rolls[i + 1];
    if (a === 10 && f < BW_FRAMES - 1) { x.fillText('X', fx + fw - 10, 32); i += 1; }
    else { if (a != null) x.fillText(a === 10 ? 'X' : a === 0 ? '-' : a, fx + fw - 22, 32); if (b != null) x.fillText(a + b === 10 && a !== 10 ? '/' : b === 10 ? 'X' : b === 0 ? '-' : b, fx + fw - 10, 32); i += 2; if (f === BW_FRAMES - 1 && L.rolls[i] != null) x.fillText(L.rolls[i] === 10 ? 'X' : L.rolls[i], fx + fw - 34, 32); }
    if (s[f] != null) { x.font = 'bold 14px Arial'; x.fillText(s[f], fx + fw / 2, 54); }
  }
  L.tex.needsUpdate = true;
}

// =====================================================================
// Rolling: the ball, the pins, the pinsetter
// =====================================================================
function bwResetPins(L, all) {
  for (const p of L.pins) {
    if (all || (p.up && !p.gone)) { p.up = true; p.gone = false; p.x = p.hx; p.z = p.hz; p.vx = p.vz = 0; p.tilt = 0; p.wob = 0; p.g.visible = true; p.g.position.set(p.x, 0.03, p.z); p.g.rotation.set(0, 0, 0); }
    else { p.gone = true; p.g.visible = false; }
  }
}
// let the ball go: from z offset `dz` off the lane's middle, heading `ang` off straight, at `speed`, with `hook`
export function bwRelease(L, dz, ang, speed, hook, by) {
  const B = L.ball;
  B.x = alley.FX - 0.3; B.z = L.z + clamp(dz, -0.45, 0.45); B.vx = -Math.cos(ang) * speed; B.vz = -Math.sin(ang) * speed; B.spin = hook; B.on = true; B.gutter = false; B.by = by;
  B.m.visible = true; B.m.position.set(B.x, 0.14, B.z);
  L.state = 'rolling'; L.t = 0; L.downBefore = L.pins.filter((p) => !p.up || p.gone).length;
}
function bwKnock(p, vx, vz) { p.up = false; p.vx = vx; p.vz = vz; p.tdir = Math.atan2(vz, vx); p.tilt = 0.01; }
function bwStep(L, dt, K) {
  const B = L.ball, A = alley;
  if (B.on) {
    B.vz += B.spin * dt * (B.x < A.FX - 8 ? 1 : 0.2); // the hook bites at the back end
    B.x += B.vx * dt; B.z += B.vz * dt;
    if (!B.gutter && Math.abs(B.z - L.z) > 0.56) { B.gutter = true; B.z = L.z + Math.sign(B.z - L.z) * 0.67; B.vz = 0; B.spin = 0; }
    B.m.position.set(B.x, B.gutter ? 0.06 : 0.14, B.z); B.m.rotation.z += B.vx * dt * 9;
    if (!B.gutter) for (const p of L.pins) {
      if (!p.up || p.gone) continue;
      const dx = p.x - B.x, dz = p.z - B.z, d = Math.hypot(dx, dz);
      if (d < 0.17) {
        const sp = Math.hypot(B.vx, B.vz), nx = dx / (d || 1), nz = dz / (d || 1);
        bwKnock(p, B.vx * 0.55 + nx * sp * 0.55, B.vz * 0.4 + nz * sp * 0.75 + mr(-0.25, 0.25) * sp);
        B.vx *= 0.93; B.vz -= nz * sp * 0.06; if (K.near(B.x, B.z, 40) && !L.clattered) { L.clattered = true; if (K.sfx.strike) K.sfx.strike(); }
      }
    }
    if (B.x < A.PIT - 0.5) { B.on = false; B.m.visible = false; L.state = 'settle'; L.t = 0; }
  }
  // pins flying about knock the others over
  for (const p of L.pins) {
    if (p.gone) continue;
    if (!p.up) {
      p.tilt = Math.min(Math.PI / 2, p.tilt + dt * 7);
      p.x += p.vx * dt; p.z += p.vz * dt; const f = Math.max(0, 1 - dt * 2.2); p.vx *= f; p.vz *= f;
      if (Math.abs(p.z - L.z) > 0.62) { p.z = L.z + Math.sign(p.z - L.z) * 0.66; p.vz *= -0.2; }
      if (p.x < A.PIT - 0.4) { p.gone = true; p.g.visible = false; }
      const ps = Math.hypot(p.vx, p.vz);
      if (ps > 0.9) for (const q of L.pins) {
        if (q === p || !q.up || q.gone) continue;
        const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.2) bwKnock(q, p.vx * 0.55 + (dx / (d || 1)) * ps * 0.35, p.vz * 0.5 + (dz / (d || 1)) * ps * 0.5 + mr(-0.35, 0.35) * ps); // (a tumbling pin sweeps a wide arc)
      }
      p.g.position.set(p.x, 0.03 + Math.sin(p.tilt) * 0.05, p.z);
      p.g.rotation.set(0, -p.tdir, 0); p.g.rotateZ(-p.tilt);
    } else if (p.wob > 0) { p.wob -= dt; p.g.rotation.set(Math.sin(p.wob * 30) * p.wob * 0.15, 0, 0); }
  }
  if (L.state === 'settle') {
    L.t += dt;
    if (L.t > 1.6) bwCount(L, K);
  }
}
// the ball's in the pit: count what went down, record it, sweep, set up the next ball
function bwCount(L, K) {
  const down = L.pins.filter((p) => !p.up || p.gone).length - L.downBefore;
  for (const p of L.pins) if (p.up && !p.gone) { const near = L.pins.some((q) => !q.up && Math.hypot(q.x - p.x, q.z - p.z) < 0.3); if (near) p.wob = 0.6; } // the 7 wobbles... and stays up
  L.rolls.push(down); L.clattered = false;
  const first = L.b === 0, last = L.frame === BW_FRAMES - 1, mine = L.owner === 'player';
  let reset = false, next = false, over = false, call = '';
  if (!last) {
    if (first && down === 10) { reset = true; next = true; call = 'STRIKE!'; }
    else if (first) { L.b = 1; if (down === 0 && L.ball.gutter) call = 'GUTTER BALL'; }
    else { reset = true; next = true; if (L.rolls[L.rolls.length - 2] + down === 10) call = 'SPARE!'; }
  } else {
    const r = L.rolls.slice(L.rolls.length - L.b - 1);
    if (L.b === 0) { L.b = 1; if (down === 10) { reset = true; call = 'STRIKE!'; } }
    else if (L.b === 1) {
      if (r[0] === 10) { L.b = 2; if (down === 10) { reset = true; call = 'STRIKE!'; } }
      else if (r[0] + down === 10) { L.b = 2; reset = true; call = 'SPARE!'; }
      else over = true;
    } else over = true;
  }
  if (next) { L.frame++; L.b = 0; }
  if (call) { L.flash = 2; L.flashTxt = call; }
  if (mine) {
    BW_STATE.rolls++;
    if (call === 'STRIKE!') { BW_STATE.strikes++; BW_STATE.streak++; BW_STATE.cheerT = 5; if (K.sfx.cheer) K.sfx.cheer(); K.showMsg(BW_STATE.streak >= 3 ? 'TURKEY! THREE IN A ROW. THE WHOLE ALLEY IS CHEERING. SEE THE DESK FOR YOUR SHIRT' : 'STRIKE! EVERYONE\'S LOOKING AT THE SCREEN', 2.2); bwCheer(L, K); if (BW_STATE.streak >= 3 && !BW_STATE.turkey) BW_STATE.turkey = 1; }
    else BW_STATE.streak = 0;
    if (call === 'SPARE!') { BW_STATE.spares++; BW_STATE.cheerT = 3; K.showMsg('SPARE!', 1.4); }
    if (call === 'GUTTER BALL') { BW_STATE.gutters++; K.showMsg('GUTTER BALL. SOMEONE BEHIND YOU LAUGHS', 1.6); }
  } else BW_STATE.npcRolls++;
  if (L.frame >= BW_FRAMES) over = true;
  if (over) {
    L.state = 'over'; L.t = 0; const tot = bwTotal(L.rolls);
    if (mine) { BW_STATE.games++; BW_STATE.best = Math.max(BW_STATE.best, tot); K.showMsg(`GAME OVER: ${tot}. ${tot >= 100 ? 'NOT BAD AT ALL' : tot >= 60 ? 'RESPECTABLE' : 'THERE\'S ALWAYS NEXT TIME'}`, 2.6); }
  } else { L.state = 'idle'; L.t = 0; }
  if (reset || over) L.resetT = 1.2; else L.sweepT = 1.0;
  bwDrawScreen(L);
}
function bwCheer(L, K) {
  for (const h of K.hunters()) if (!h.dead && h.bwLane != null && Math.abs(h.z - L.z) < 12 && Math.random() < 0.5) K.say(h, mpick(['WHOA!', 'GET IN!', 'STRIKE!', 'NICE ONE!', 'SHOW OFF', '*CLAPS*']));
}

// =====================================================================
// The other bowlers: parties on the lanes nearby
// =====================================================================
const BW_PARTIES = ['THE KEVINS', 'SHARON 40TH', 'TEAM PIN', 'HALDEN DAIRIES', 'OFFICE DO', 'BIRTHDAY!', 'THE STRIKERS', 'NAN & CO', 'SPARE PARTS', 'LUCKY 7S'];
const BW_TALK = ['YOUR GO!', 'NOT AGAIN...', 'WHO PUT THE BUMPERS DOWN?', 'IT\'S THE SHOES, THEY\'RE TOO BIG', 'ANOTHER ROUND?', 'WATCH THIS', 'I WAS ROBBED', 'HE\'S DONE THAT ON PURPOSE'];
function bwParty(L, K) {
  L.owner = 'npc'; L.party = mpick(BW_PARTIES); L.rolls = []; L.frame = 0; L.b = 0; L.state = 'idle'; L.npcT = mr(2, 5); bwResetPins(L, true); bwDrawScreen(L);
  const n = 2;
  for (let k = 0; k < n; k++) { const h = K.spawnCivAt(alley.door.x - 2, alley.door.z); if (!h) continue; h.bwLane = L.i; h.job = null; bwToBench(h, L, K); }
}
function bwToBench(h, L, K) {
  const s = L.seats.find((q) => !q.taken || q.taken.dead || q.taken.bwLane !== L.i); if (!s) return K.lifeGo(h, 'watch', -60.8, L.z + mr(-0.8, 0.8), -Math.PI / 2, mr(20, 40), { maxT: 60 });
  s.taken = h;
  const inside = inAlley(h.x, h.z);
  return K.lifeGo(h, 'sit', s.x, s.z, s.face, mr(40, 80), inside ? { spot: s, maxT: 60 } : { spot: s, route: [[-42, 282], [-46, 282], [-56, 282], [s.x, s.z]], ri: 0, maxT: 80 });
}
function bwNpcBowl(L, dt, K) {
  if (L.state !== 'idle' || L.resetT > 0 || L.sweepT > 0) return;
  L.npcT -= dt; if (L.npcT > 0) return;
  L.npcT = mr(5, 9);
  const folk = K.hunters().filter((h) => !h.dead && h.bwLane === L.i);
  if (!folk.length) { L.owner = null; return; }
  // someone gets up, steps to the line, and lets it go
  const h = mpick(folk); if (h.act && h.act.spot && h.act.spot.taken === h) h.act.spot.taken = null;
  K.lifeGo(h, 'watch', alley.FX + 1.2, L.z + mr(-0.2, 0.2), -Math.PI / 2, 4, { maxT: 8 }); h.bwThrowT = 1.6;
  const skill = mr(0.3, 1);
  bwRelease(L, mr(-0.25, 0.25) * (1.3 - skill), mr(-0.02, 0.02) * (1.3 - skill) + mr(-0.004, 0.004), mr(7, 9.5), mr(-0.18, 0.18), h);
  if (Math.random() < 0.25 && K.near(L.ball.x, L.z, 25)) K.say(mpick(folk), mpick(BW_TALK));
}

// =====================================================================
// Staff
// =====================================================================
const bwStaff = [];
function bwPerson(look, x, z, face, extra) {
  const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: BW_TEAL, pants: 0x1a1a1e, ...look });
  p.group.position.set(x, 0, z); p.group.rotation.y = face; scene.add(p.group);
  const S = { p, g: p.group, x, z, face, ...extra }; bwStaff.push(S); return S;
}
function buildBwStaff() {
  if (bwStaff.length) return;
  alley.deskStaff = bwPerson({}, -54.2, 292.5, Math.PI / 2, { role: 'desk' });
  alley.snackStaff = bwPerson({ shirt: 0xd02a6a }, -66, 298.5, Math.PI, { role: 'snack' });
}

// =====================================================================
// E: the desk, the snack bar, your lane
// =====================================================================
const BW_COSTUME = [{ id: 'bw_shirt', slot: 'body', cat: 'bowling', name: 'GUTTERBALL BOWLING SHIRT', price: 12, dg: 0.26, desc: 'Purple, short sleeves, flames up the side. Your name stitched on the pocket (it says DEREK).' }];
for (const c of BW_COSTUME) if (!CATALOG.costume.some((o) => o.id === c.id)) CATALOG.costume.push(c);
function bwDeskMenu(K) {
  const P = K.player;
  return {
    cash: () => P.cash,
    items: () => [
      { id: 'bw_lane', name: 'A LANE: ONE GAME (5 FRAMES)', price: 4, desc: 'Shoes included. Lane number on the screen. Bumpers on request.' },
      { id: 'bw_shirt', name: 'BOWLING SHIRT', price: BW_STATE.turkey && !BW_STATE.shirtWon ? 0 : 12, desc: BW_STATE.turkey && !BW_STATE.shirtWon ? 'You got a turkey. It\'s yours, on the house.' : 'Purple with flames. Three strikes in a row and it\'s free.' },
      { id: 'bw_sweets', name: 'BAG OF SWEETS', price: 1, desc: 'From the jar on the desk.' },
    ],
    state: (it) => (it.id === 'bw_lane' && BW_STATE.lane && BW_STATE.lane.state !== 'over' ? 'owned' : it.id === 'bw_shirt' && P.outfit.body === 'bw_shirt' ? 'owned' : ''),
    buy(it) {
      if (it.id === 'bw_lane') {
        if (BW_STATE.lane && BW_STATE.lane.state !== 'over') return `YOU'RE ON LANE ${BW_STATE.lane.i + 1}`;
        const L = alley.lanes.find((q) => !q.owner) || alley.lanes.find((q) => q.owner === 'npc' && q.state === 'over'); if (!L) return 'ALL THE LANES ARE BOOKED. TRY IN A BIT';
        if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`;
        P.cash -= it.price; K.sfx.cash();
        if (BW_STATE.lane && BW_STATE.lane !== L) { BW_STATE.lane.owner = null; bwDrawScreen(BW_STATE.lane); }
        L.owner = 'player'; L.rolls = []; L.frame = 0; L.b = 0; L.state = 'idle'; bwResetPins(L, true); BW_STATE.lane = L; BW_STATE.streak = 0; bwDrawScreen(L);
        return `LANE ${L.i + 1}. SIZE NINES ALRIGHT? STEP UP AND PRESS ${K.isTouch ? 'USE' : 'E'}`;
      }
      if (it.id === 'bw_shirt') {
        if (P.outfit.body === 'bw_shirt') return 'YOU\'RE WEARING IT';
        if (it.price > P.cash) return `YOU NEED $${it.price - P.cash} MORE`;
        if (it.price) { P.cash -= it.price; K.sfx.cash(); } else BW_STATE.shirtWon = true;
        return K.wear('bw_shirt');
      }
      if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`;
      P.cash -= it.price; K.sfx.cash(); MK_STATE.sweets = (MK_STATE.sweets || 0) + 2; return 'SWEETS IN YOUR POCKET';
    },
  };
}
const BW_SNACKS = [
  { id: 'bw_hotdog', name: 'FOOTLONG HOT DOG', price: 4, heal: 24, desc: 'A foot long, give or take. Patches you up (+24).' },
  { id: 'bw_nachos', name: 'NACHOS WITH CHEESE', price: 3, heal: 15, desc: 'The cheese is a colour not found in nature (+15).' },
  { id: 'bw_slush', name: 'PURPLE SLUSH', price: 2, heal: 4, cool: true, desc: 'Flavour: purple. Calms you down (+4, lowers the heat a bit).' },
];
function bwSnackMenu(K) {
  const P = K.player;
  return {
    cash: () => P.cash, items: () => BW_SNACKS, state: () => '',
    buy(it) { if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`; P.cash -= it.price; K.sfx.cash(); P.hp = Math.min(100, P.hp + it.heal); if (it.cool) K.coolHeat(5); return mpick(['ENJOY!', 'NAPKINS ARE ON THE SIDE', 'MIND, IT\'S HOT']); },
  };
}
const onApproach = (L, P) => P.x > alley.FX && P.x < -60.2 && Math.abs(P.z - L.z) < 0.75 && P.y < 0.5;
function bwUseTarget(K) {
  const P = K.player, A = alley;
  if (BW_STATE.aim) return { kind: 'release', first: true };
  if (!A.built || P.car || P.mode !== 'move' || P.hide || !inAlley(P.x, P.z)) return null;
  if (P.y < 0.8 && Math.hypot(P.x - A.desk.x, P.z - A.desk.z) < 2.0) return { kind: 'desk' };
  if (P.y < 0.8 && Math.hypot(P.x - A.snack.x, P.z - A.snack.z) < 2.4 && P.z < 296.2) return { kind: 'snack' };
  const L = BW_STATE.lane;
  if (L && L.owner === 'player' && onApproach(L, P)) return L.state === 'over' ? { kind: 'over' } : { kind: 'step', L };
  for (const Q of A.lanes) if (Q.owner !== 'player' && onApproach(Q, P)) return { kind: 'notyours', L: Q };
  return null;
}
function bwUsePrompt(T, K, useK) {
  if (T.kind === 'release') return `${useK} to bowl · ${K.isTouch ? 'stick' : 'A / D'} to move along the line · look to aim · ${K.isTouch ? 'pull back' : 'S'} to step back`;
  if (T.kind === 'desk') return bwOpen(K.hour) ? `${useK} for a lane (and shoes)` : 'GUTTERBALL LANES opens at 10';
  if (T.kind === 'snack') return bwOpen(K.hour) ? `${useK} for the snack bar` : 'The snack bar opens at 10';
  if (T.kind === 'step') return T.L.state === 'idle' && !T.L.resetT && !T.L.sweepT ? `${useK} to step up and bowl (frame ${T.L.frame + 1} of ${BW_FRAMES})` : 'Wait for the pins...';
  if (T.kind === 'over') return `Game over: ${bwTotal(T.L ? T.L.rolls : BW_STATE.lane.rolls)}. Another game at the desk`;
  if (T.kind === 'notyours') return T.L.owner ? `Lane ${T.L.i + 1} is ${T.L.party}'s` : `Lane ${T.L.i + 1}: book it at the desk`;
  return '';
}
function bwUse(T, K) {
  const P = K.player;
  if (T.kind === 'release') { bwLetGo(K); return; }
  if (T.kind === 'notyours' || T.kind === 'over') { K.showMsg(bwUsePrompt(T, K, 'E').toUpperCase(), 1.6); return; }
  if (!bwOpen(K.hour)) { K.showMsg('SHUT. OPENS AT 10', 1.6); return; }
  if (T.kind === 'desk') { K.openMenu({ name: 'GUTTERBALL LANES', kind: 'bowling', blurbs: ['"WHAT SIZE SHOES, LOVE?"', '"LANE SEVEN PULLS LEFT. EVERYONE KNOWS THAT."', '"NO, YOU CAN\'T KEEP THE SHOES."'] }, bwDeskMenu(K)); return; }
  if (T.kind === 'snack') { K.openMenu({ name: 'THE SNACK BAR', kind: 'bowling', blurbs: ['"CHEESE ON THAT?"', '"THE SLUSH MACHINE\'S ONLY GOT PURPLE."'] }, bwSnackMenu(K)); return; }
  if (T.kind === 'step') {
    const L = T.L; if (L.state !== 'idle' || L.resetT > 0 || L.sweepT > 0) { K.showMsg('WAIT FOR THE PINSETTER', 1.2); return; }
    BW_STATE.aim = { L, dz: clamp(P.z - L.z, -0.4, 0.4), t: 0 };
    P.yaw = Math.PI / 2; P.pitch = -0.12;
    K.showMsg(`LANE ${L.i + 1}. LOOK WHERE YOU WANT IT TO GO, ${K.isTouch ? 'USE' : 'E'} TO BOWL`, 2);
  }
}
function bwLetGo(K) {
  const Am = BW_STATE.aim; if (!Am) return;
  const P = K.player, L = Am.L;
  // the line you're looking along (yaw pi/2 = straight down the lane), and a little curl from the slide
  let off = P.yaw - Math.PI / 2; while (off > Math.PI) off -= Math.PI * 2; while (off < -Math.PI) off += Math.PI * 2;
  const ang = clamp(off, -0.07, 0.07);
  bwRelease(L, Am.dz, ang, 8.6, (Am.lastSide || 0) * 0.25 + mr(-0.03, 0.03), 'player');
  BW_STATE.aim = null; K.sfx.rumble && K.sfx.rumble();
  P.x = alley.FX + 0.6; P.z = L.z + Am.dz;
}
// while you're lined up on the approach: held at the line, sliding left and right, aiming with your eyes
function bwRide(dt, K) {
  const Am = BW_STATE.aim; if (!Am) return false;
  const P = K.player, I = K.input, L = Am.L;
  if (!P.alive || P.car || P.hide || I.fwd < 0 || (P.lastHurt != null && P.lastHurt < 0.1)) { BW_STATE.aim = null; return false; }
  Am.t += dt;
  if (I.side) { Am.dz = clamp(Am.dz - I.side * dt * 0.6, -0.45, 0.45); Am.lastSide = -I.side; }
  P.x = alley.FX + 0.6; P.z = L.z + Am.dz; P.y = 0.03; P.vx = P.vz = 0; P.sprinting = false;
  return true;
}

// =====================================================================
// Each frame
// =====================================================================
function bwUpdate(dt, K) {
  const A = alley; if (!A.built) return;
  buildBwStaff();
  const day = K.G.day, hr = K.hour, open = bwOpen(hr), near = K.near(-72, 281, 110), P = K.player;
  for (const S of bwStaff) S.g.visible = open;
  if (!near) return;
  // cosmic bowling: the lights go down, the pins glow
  const cosmic = cosmicNow(day, hr);
  if (A.cosmic !== cosmic) { A.cosmic = cosmic; bwHallMat.color.setHex(cosmic ? 0x2a1a4a : 0xfff2d8); bwPinMat.emissive.setHex(cosmic ? 0x6affff : 0x000000); for (const L of A.lanes) { L.cosmic = cosmic; bwDrawScreen(L); } }
  if (!A.welcomed || A.welcomed !== day) { if (open && K.near(-44, 282, 30)) { A.welcomed = day; K.banner(`GUTTERBALL LANES<small>EIGHT LANES · $4 A GAME · SHOES INCLUDED${cosmic ? ' · COSMIC BOWLING TONIGHT' : ''}</small>`, 4); } }
  // the parties: a few lanes busy when it's open (more in the evening)
  A.partyT = (A.partyT || 0) - dt;
  if (A.partyT <= 0) {
    A.partyT = 3;
    const busy = A.lanes.filter((L) => L.owner === 'npc').length, want = !open ? 0 : hr >= 18 ? 5 : hr >= 14 ? 3 : 2;
    if (busy < want && K.near(-72, 281, 70)) { const free = A.lanes.filter((L) => !L.owner); if (free.length) bwParty(mpick(free), K); }
    for (const L of A.lanes) if (L.owner === 'npc' && (L.state === 'over' || !open)) {
      // game over: they go home, the lane is free again
      for (const h of K.hunters()) if (h.bwLane === L.i && !h.dead) { h.bwLane = null; if (h.act && h.act.spot && h.act.spot.taken === h) h.act.spot.taken = null; K.lifeGo(h, 'walk', -30, mr(262, 310), null, 0.3, { route: [[-56, 282], [-46, 282], [-40, 282], [-30, mr(262, 310)]], ri: 0, oneWay: true, maxT: 60 }); }
      L.owner = null; L.rolls = []; L.state = 'idle'; bwResetPins(L, true); bwDrawScreen(L);
    }
  }
  for (const L of A.lanes) {
    if (L.flash > 0) { L.flash -= dt; if (L.flash <= 0) bwDrawScreen(L); }
    if (L.sweepT > 0) { L.sweepT -= dt; if (L.sweepT <= 0) bwResetPins(L, false); }
    if (L.resetT > 0) { L.resetT -= dt; if (L.resetT <= 0) bwResetPins(L, true); }
    if (L.owner === 'npc') bwNpcBowl(L, dt, K);
    if (L.state === 'rolling' || L.state === 'settle' || L.pins.some((p) => !p.up && !p.gone) || L.pins.some((p) => p.wob > 0)) bwStep(L, dt, K);
    if (!L.drawn) { L.drawn = true; bwDrawScreen(L); }
  }
  // the bowlers go back to the bench after their go
  for (const h of K.hunters()) if (h.bwThrowT > 0) { h.bwThrowT -= dt; if (h.bwThrowT <= 0) { const L = A.lanes[h.bwLane]; if (L) bwToBench(h, L, K); } }
  BW_STATE.cheerT = Math.max(0, BW_STATE.cheerT - dt);
  // nobody walks on the lanes
  BW_STATE.warnT = Math.max(0, BW_STATE.warnT - dt);
  if (open && !P.car && P.x < A.FX - 0.4 && P.x > A.PIT - 2 && P.z > 267 && P.z < 288.4 && BW_STATE.warnT <= 0 && A.deskStaff) {
    BW_STATE.warnT = 6; BW_STATE.warned++;
    K.say({ g: A.deskStaff.g }, mpick(['OI! OFF THE LANES!', 'YOU CAN\'T WALK ON THERE!', 'GET OFF THE LANE!', 'THE LANES ARE OILED, YOU\'LL BREAK YOUR NECK!']));
    K.bumpLocal(0.04);
    if (BW_STATE.warned % 2 === 0) { K.addHeat(1); K.showMsg('THE MAN ON THE DESK IS ON THE PHONE. GET OFF THE LANES', 2.2); } else K.showMsg('THAT\'S A FOUL. AND EVERYONE SAW', 1.6);
  }
}
function bwConspic(K) {
  const P = K.player; if (P.car || !inAlley(P.x, P.z) || !bwOpen(K.hour)) return 0;
  let k = -0.08;
  const L = BW_STATE.lane;
  if (L && L.owner === 'player' && L.state !== 'over' && P.x > alley.FX - 0.5 && P.x < -58 && Math.abs(P.z - L.z) < 2) k -= 0.24; // just someone having a game
  if (BW_STATE.aim) k -= 0.06;
  if (BW_STATE.cheerT > 0) k -= 0.15;
  if (P.outfit.body === 'bw_shirt') k -= 0.06;
  if (alley.cosmic) k -= 0.08;
  return k;
}
function bwPlan(h, hr, K) {
  if (h.bwLane == null) return false;
  const L = alley.lanes[h.bwLane];
  if (!L || L.owner !== 'npc') { h.bwLane = null; return false; }
  return bwToBench(h, L, K);
}
export const bowling = {
  name: 'bowling', roofs: bwRoofs,
  useTarget: bwUseTarget, usePrompt: bwUsePrompt, use: bwUse, conspic: bwConspic, update: bwUpdate, plan: bwPlan, ride: bwRide,
  reset() {
    Object.assign(BW_STATE, { lane: null, aim: null, games: 0, rolls: 0, strikes: 0, spares: 0, gutters: 0, best: 0, streak: 0, turkey: 0, shirtWon: false, warned: 0, warnT: 0, cheerT: 0, npcRolls: 0 });
    for (const L of alley.lanes) { L.owner = null; L.rolls = []; L.frame = 0; L.b = 0; L.state = 'idle'; L.ball.on = false; L.ball.m.visible = false; bwResetPins(L, true); for (const s of L.seats) s.taken = null; L.drawn = false; }
    alley.welcomed = 0;
  },
  diary(K) { const L = BW_STATE.lane; const b = []; if (L && L.state !== 'over') b.push(`LANE ${L.i + 1} AT GUTTERBALL, FRAME ${L.frame + 1}`); if (cosmicNow(K.G.day, K.hour) || cosmicNow(K.G.day, 20)) b.push('COSMIC BOWLING TONIGHT'); return b; },
  debug: () => ({ built: alley.built, lanes: alley.lanes.length, pins: alley.lanes.reduce((s, L) => s + L.pins.length, 0), busy: alley.lanes.filter((L) => L.owner).map((L) => ({ i: L.i, owner: L.owner, state: L.state, rolls: L.rolls.slice() })), staff: bwStaff.length, ...BW_STATE, lane: BW_STATE.lane ? BW_STATE.lane.i : null, aim: !!BW_STATE.aim }),
  alley, BW_STATE, BW_CLEAR, bwScore, bwTotal, bwRelease, bwResetPins, inAlley, cosmicNow, bwDeskMenu, bwSnackMenu, BW_FRAMES,
};
