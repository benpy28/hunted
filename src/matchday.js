// The Harriers ground, the village church and the car boot sale: a patch of countryside on Route 9, just
// west of ASHFORD.
//  - ASHFORD HARRIERS FC play at home on Saturday afternoons (kick-off 2:30) and under the floodlights on
//    Tuesday nights (kick-off 7). Fans in red and white walk up Route 9 and through the turnstiles, the
//    terraces fill, the tea bar sells pies, and every goal sets the whole ground off. Pay at a turnstile and
//    stand with the home fans in a scarf, and you're one face in a few hundred. Climb over the wall instead
//    and the stewards will want to see your ticket.
//  - The clubhouse behind the main stand: a bar, a trophy cabinet and the changing room, with kit lockers
//    you can hide in.
//  - ST. MARGARET'S CHURCH next door: bells on Sunday morning, a service at 10 (sit with your head bowed in
//    a pew and nobody looks up from their hymn book), a graveyard full of headstones to duck behind, and a
//    wedding on Saturday lunchtimes with confetti everywhere.
//  - The CAR BOOT SALE in the Harriers car park on Sunday mornings: tables of other people's junk behind
//    open boots. Old wigs, reading glasses, anoraks, alarm clocks, leftover fireworks, mystery boxes.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene, textTex, canvasTex } from './core.js';
import { clearings, propBuf, glowBuf, groundBuf, markBuf, roofBuf, addCollider, addRoof, addTree, worldHooks, navOpen, keepClear, parkedSpots } from './world.js';
import { hideSpots, lifeSpots } from './streets.js';
import { buildPerson, lam, SKINS, HAIRS } from './people.js';
import { CATALOG } from './shops.js';
import { emitPuff } from './fx.js';
import { TD_EVENTS, eventOn, weekdayOf } from './townday.js';
import { MK_STATE } from './market.js';
import { hidePiece } from './gigs.js';

// =====================================================================
// Where everything is
// =====================================================================
export const MD_CLEAR = { x0: 412, x1: 517, z0: -118, z1: -15 };
clearings.push(MD_CLEAR); // the countryside generator leaves this patch empty for us
export const ground = {
  name: 'THE HARRIERS GROUND', x0: 416, x1: 476, z0: -100, z1: -22, // outer wall
  px0: 434, px1: 462, pz0: -88, pz1: -34, cx: 448, cz: -61, // the pitch
  turnstiles: [{ x: 440, z: -20.6 }, { x: 456, z: -20.6 }], stewards: [], tea: { x: 428.4, z: -29.5 }, scarves: { x: 448, z: -17.2 },
  watch: [], board: null, boardTex: null, lights: null, crowd: null, built: false,
};
export const clubhouse = { x0: 482, x1: 498, z0: -60, z1: -40, door: { x: 481.2, z: -50 }, lockers: [] };
export const church = { name: 'ST. MARGARET\'S CHURCH', x0: 484, x1: 496, z0: -98, z1: -76, door: { x: 490, z: -74.6 }, pulpit: { x: 494, z: -94.2 }, pews: [], graves: [], plot: { x0: 482, x1: 516, z0: -102, z1: -64 } };
export const carBoot = { x0: 420, x1: 478, z0: -116, z1: -103, tables: [], group: null };
export const mdRoofs = []; // under cover from the aircraft: the main stand, the clubhouse, the church
export const MD_STATE = { ticketDay: 0, progDay: 0, warned: 0, warnT: 0, celebT: 0, goals: 0, matches: {}, lastResult: null, fans: 0, pies: 0, teas: 0, boots: 0, sat: 0, confetti: 0, msgT: 0 };
const mdInGround = (x, z, pad = 0) => x > ground.x0 + 0.5 - pad && x < ground.x1 - 0.5 + pad && z > ground.z0 + 0.5 - pad && z < ground.z1 - 0.5 + pad;
const mdInChurch = (x, z) => x > church.x0 + 0.3 && x < church.x1 - 0.3 && z > church.z0 + 0.3 && z < church.z1 - 0.3;
export const inGround = mdInGround;
export const inChurch = mdInChurch;
const mdHash = (x, z, k = 0) => { const s = Math.sin(x * 91.17 + z * 47.31 + k * 13.7) * 24634.6345; return s - Math.floor(s); };

// =====================================================================
// The fixture list
// =====================================================================
const HOME = { name: 'HARRIERS', full: 'ASHFORD HARRIERS', shirt: 0xc8202a, shorts: 0xf0f0f0, sock: 0xc8202a, keeper: 0x2a8a3a };
const AWAY = [
  { name: 'SEAGULLS', full: 'SALTMARSH SEAGULLS', shirt: 0x2a5aa0, shorts: 0xf0f0f0, sock: 0x2a5aa0, keeper: 0xe0c020 },
  { name: 'CITY', full: 'PORT HALDEN CITY', shirt: 0x6ab0e8, shorts: 0x1a2a4a, sock: 0x1a2a4a, keeper: 0xe07a2a },
  { name: 'ROVERS', full: 'KILNWORTH ROVERS', shirt: 0xe8d020, shorts: 0x1a1a1a, sock: 0xe8d020, keeper: 0x8a2ac8 },
  { name: 'VALE', full: 'BRACKEN VALE', shirt: 0x2a7a3a, shorts: 0xf0f0f0, sock: 0x2a7a3a, keeper: 0x1a1a1a },
  { name: 'TOWN', full: 'MARLOW END TOWN', shirt: 0xf0f0f0, shorts: 0x1a1a1a, sock: 0xf0f0f0, keeper: 0xc8202a },
  { name: 'ATHLETIC', full: 'FENWICK ATHLETIC', shirt: 0x6a2a8a, shorts: 0x6a2a8a, sock: 0xf0f0f0, keeper: 0x2ac8c8 },
];
export const opponentOn = (day) => AWAY[day % AWAY.length];
TD_EVENTS.push(
  { id: 'match', town: 'ASHFORD', days: [5], from: 13, to: 17.5, ko: 14.5, name: 'MATCH DAY', where: 'THE HARRIERS GROUND, ROUTE 9', blurb: 'Ashford Harriers at home, kick-off 2:30. Pay at the turnstiles, get a scarf, and you are one face in a few hundred.' },
  { id: 'match', town: 'ASHFORD', days: [1], from: 18, to: 22, ko: 19, name: 'FLOODLIT MATCH', where: 'THE HARRIERS GROUND, ROUTE 9', blurb: 'Tuesday night under the floodlights, kick-off 7. Smaller crowd, louder singing.' },
  { id: 'carboot', town: 'ASHFORD', days: [6], from: 7, to: 12, name: 'CAR BOOT SALE', where: 'THE HARRIERS CAR PARK', blurb: 'Other people\'s junk behind open boots. Old wigs, anoraks, alarm clocks, mystery boxes. All a couple of dollars.' },
  { id: 'church', town: 'ASHFORD', days: [6], from: 10, to: 11.5, name: 'SUNDAY SERVICE', where: 'ST. MARGARET\'S CHURCH', blurb: 'Bells at a quarter to. Sit in a pew with your head bowed and nobody looks up from their hymn book.' },
  { id: 'wedding', town: 'ASHFORD', days: [5], from: 12, to: 13.5, name: 'A WEDDING', where: 'ST. MARGARET\'S CHURCH', blurb: 'Guests in their best outside the church, confetti, and a photographer who wants everyone in the picture.' },
);
// the match today (if there is one) and where it's got to
export function matchNow(day, hr) {
  const E = eventOn('match', 'ASHFORD', day); if (!E) return null;
  const ko = E.ko, t = hr - ko;
  const phase = hr < E.from ? 'none' : t < 0 ? 'pre' : t < 0.9 ? 'first' : t < 1.15 ? 'half' : t < 2.05 ? 'second' : hr < E.to ? 'post' : 'none';
  const minute = phase === 'first' ? Math.floor(t / 0.9 * 45) + 1 : phase === 'half' ? 45 : phase === 'second' ? Math.min(90, 46 + Math.floor((t - 1.15) / 0.9 * 45)) : phase === 'post' ? 90 : 0;
  return { E, ko, phase, minute, playing: phase === 'first' || phase === 'second', on: phase !== 'none', night: ko >= 18 };
}
function matchRec(day) {
  if (!MD_STATE.matches[day]) {
    // goals are decided in advance (it's a small league), the sim makes them happen in front of you
    const opp = opponentOn(day), n = Math.floor(mdHash(day, 7) * 5), goals = [];
    for (let i = 0; i < n; i++) goals.push({ min: 3 + Math.floor(mdHash(day, i, 3) * 86), home: mdHash(day, i, 5) < 0.58, done: false });
    goals.sort((a, b) => a.min - b.min);
    MD_STATE.matches[day] = { opp, home: 0, away: 0, goals, ft: false, scorers: [] };
  }
  return MD_STATE.matches[day];
}

// =====================================================================
// Building it all (just before the world is baked)
// =====================================================================
const MD_BRICK = 0x8a4a3a, MD_CONC = 0x9a9a92, MD_WHITE = 0xf2f2ee;
function mdWall(x0, x1, z0, z1, h, col = MD_BRICK, y0 = 0) { propBuf.box(x0, x1, y0, h, z0, z1, col); addCollider(x0, x1, z0, z1, h, { y0 }); }
// a wall along x or z with gaps cut out of it ([a0, a1] spans)
function mdWallWithGaps(axis, fixed, a0, a1, gaps, h, t = 0.25, col = MD_BRICK) {
  const spans = []; let a = a0;
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > a) spans.push([a, g0]); a = Math.max(a, g1); }
  if (a < a1) spans.push([a, a1]);
  for (const [s0, s1] of spans) if (axis === 'x') mdWall(s0, s1, fixed - t, fixed + t, h, col); else mdWall(fixed - t, fixed + t, s0, s1, h, col);
}
function mdLine(x0, x1, z0, z1) { markBuf.flat(x0, x1, z0, z1, 0.018, MD_WHITE); }
function mdPlane(w, h, tex, x, y, z, ry = 0, lit = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lit ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
}
function buildGround() {
  const G = ground, C = MD_CLEAR;
  // fresh grass over the whole patch, a car park, and a path up from Route 9
  groundBuf.flat(C.x0, C.x1, C.z0, C.z1, 0.011, 0x5a7d45);
  groundBuf.flat(carBoot.x0, carBoot.x1, carBoot.z0, carBoot.z1, 0.013, 0x6a6a66);
  groundBuf.flat(G.x0, G.x1, G.z1, -12.5, 0.013, 0x8a8478); // the forecourt outside the turnstiles
  groundBuf.flat(church.door.x - 1.2, church.door.x + 1.2, church.plot.z1, -12.5, 0.013, 0x9a9488); // the church path
  // the pitch: stripes, lines, centre circle, boxes
  for (let z = G.pz0 - 3, k = 0; z < G.pz1 + 3; z += 4.5, k++) markBuf.flat(G.px0 - 3, G.px1 + 3, z, Math.min(G.pz1 + 3, z + 4.5), 0.014, k % 2 ? 0x4f8a3a : 0x5a9a42);
  const w = 0.12;
  mdLine(G.px0, G.px1, G.pz0 - w, G.pz0 + w); mdLine(G.px0, G.px1, G.pz1 - w, G.pz1 + w); mdLine(G.px0 - w, G.px0 + w, G.pz0, G.pz1); mdLine(G.px1 - w, G.px1 + w, G.pz0, G.pz1);
  mdLine(G.px0, G.px1, G.cz - w, G.cz + w);
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, x = G.cx + Math.cos(a) * 4.5, z = G.cz + Math.sin(a) * 4.5; mdLine(x - 0.25, x + 0.25, z - 0.25, z + 0.25); }
  mdLine(G.cx - 0.3, G.cx + 0.3, G.cz - 0.3, G.cz + 0.3);
  for (const [gz, s] of [[G.pz0, 1], [G.pz1, -1]]) {
    const bz = gz + s * 8, sz = gz + s * 3;
    mdLine(G.cx - 8, G.cx + 8, Math.min(bz, bz) - w, bz + w); mdLine(G.cx - 8 - w, G.cx - 8 + w, Math.min(gz, bz), Math.max(gz, bz)); mdLine(G.cx + 8 - w, G.cx + 8 + w, Math.min(gz, bz), Math.max(gz, bz));
    mdLine(G.cx - 4, G.cx + 4, sz - w, sz + w); mdLine(G.cx - 4 - w, G.cx - 4 + w, Math.min(gz, sz), Math.max(gz, sz)); mdLine(G.cx + 4 - w, G.cx + 4 + w, Math.min(gz, sz), Math.max(gz, sz));
    const ps = gz + s * 6; mdLine(G.cx - 0.2, G.cx + 0.2, ps - 0.2, ps + 0.2);
    // the goal: posts, crossbar and a net hanging back
    for (const e of [-2.6, 2.6]) { propBuf.box(G.cx + e - 0.07, G.cx + e + 0.07, 0, 2.1, gz - 0.07, gz + 0.07, MD_WHITE); addCollider(G.cx + e - 0.08, G.cx + e + 0.08, gz - 0.08, gz + 0.08, 2.1, { y0: 0 }); }
    propBuf.box(G.cx - 2.67, G.cx + 2.67, 2.03, 2.17, gz - 0.07, gz + 0.07, MD_WHITE);
    const back = gz - s * 1.6;
    propBuf.box(G.cx - 2.6, G.cx + 2.6, 0, 1.4, Math.min(back, back + 0.02), Math.max(back, back + 0.02), 0xd8d8d8);
    for (const e of [-2.6, 2.6]) propBuf.box(G.cx + e - 0.01, G.cx + e + 0.01, 0, 1.4, Math.min(gz, back), Math.max(gz, back), 0xd8d8d8);
    propBuf.box(G.cx - 2.6, G.cx + 2.6, 2.0, 2.02, Math.min(gz, back), Math.max(gz, back), 0xd8d8d8);
    for (let x = -2.4; x <= 2.41; x += 0.4) propBuf.box(G.cx + x - 0.01, G.cx + x + 0.01, 0, 2.0, Math.min(back, back + 0.03) - 0.01, Math.max(back, back + 0.03), 0xbcbcbc);
  }
  // corner flags
  for (const [x, z] of [[G.px0, G.pz0], [G.px1, G.pz0], [G.px0, G.pz1], [G.px1, G.pz1]]) { propBuf.box(x - 0.03, x + 0.03, 0, 1.5, z - 0.03, z + 0.03, 0xe0e0e0); propBuf.box(x, x + 0.35, 1.2, 1.45, z - 0.01, z + 0.01, 0xf0d020); }
  // the outer wall, with two turnstile gaps, a gate to the car park and a door through to the clubhouse
  const H = 2.6, [T1, T2] = G.turnstiles;
  mdWallWithGaps('x', G.z1, G.x0, G.x1, [[T1.x - 1.2, T1.x + 1.2], [T2.x - 1.2, T2.x + 1.2]], H);
  mdWallWithGaps('x', G.z0, G.x0, G.x1, [[G.cx - 2.2, G.cx + 2.2]], H);
  mdWallWithGaps('z', G.x0, G.z0, G.z1, [], H);
  mdWallWithGaps('z', G.x1, G.z0, G.z1, [[-51.2, -48.8]], H);
  propBuf.box(G.x0 - 0.3, G.x1 + 0.3, H, H + 0.12, G.z1 - 0.32, G.z1 + 0.32, 0xc8c0b0); // coping along the front
  // turnstile booths (a little brick hut each side of the gap, with a ticket window)
  for (const T of G.turnstiles) {
    mdWall(T.x - 3.0, T.x - 1.2, G.z1 - 1.0, G.z1 + 0.8, 2.9, 0x9a5a48);
    propBuf.box(T.x - 3.1, T.x - 1.1, 2.9, 3.05, G.z1 - 1.1, G.z1 + 0.9, 0x3a3a3e);
    glowBuf.box(T.x - 2.7, T.x - 1.5, 1.2, 1.9, G.z1 + 0.81, G.z1 + 0.84, 0xfff0c0);
    propBuf.box(T.x - 1.18, T.x - 1.1, 0, 1.0, G.z1 - 0.6, G.z1 + 0.6, 0x5a5a62); // the turnstile arm housing
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; propBuf.box(T.x - 1.1, T.x - 0.4, 0.92 + Math.sin(a) * 0.08, 0.98 + Math.sin(a) * 0.08, G.z1 - 0.03 + Math.cos(a) * 0.3, G.z1 + 0.03 + Math.cos(a) * 0.3, 0xb8b8c0); }
    navOpen.push({ x0: T.x - 1.1, x1: T.x + 1.1, z0: G.z1 - 1.5, z1: G.z1 + 1.5 }); keepClear.push({ x0: T.x - 1.3, x1: T.x + 1.3, z0: G.z1 - 3, z1: G.z1 + 3 });
    G.stewards.push({ x: T.x, z: G.z1 - 2.6, face: 0 });
  }
  navOpen.push({ x0: G.cx - 2, x1: G.cx + 2, z0: G.z0 - 1.5, z1: G.z0 + 1.5 }, { x0: G.x1 - 1.5, x1: G.x1 + 1.5, z0: -51, z1: -49 });
  const sign = textTex(1024, 160, '#c8202a', '#ffffff', ['ASHFORD HARRIERS F.C.'], 'bold 84px Arial Black, Arial', false);
  mdPlane(9, 1.3, sign, G.cx, 3.45, G.z1 + 0.34, 0);
  for (const T of G.turnstiles) mdPlane(1.6, 0.42, textTex(256, 64, '#1a1a1e', '#f0d020', ['TURNSTILE'], 'bold 34px Arial Black, Arial', false), T.x - 2.1, 2.6, G.z1 + 0.82, 0);
  // the open terrace along the west touchline: five steps up to the back wall
  for (let k = 0; k < 5; k++) {
    const x1 = 431 - 2 * k, x0 = x1 - 2, top = 0.36 * (k + 1);
    propBuf.box(x0, x1, 0, top, -84, -38, k % 2 ? MD_CONC : 0x8e8e86); addCollider(x0, x1, -84, -38, top, { y0: 0 });
    if (k % 2) for (let z = -80; z < -40; z += 9) { propBuf.box(x0 + 0.92, x0 + 0.98, top + 0.98, top + 1.04, z, z + 3.2, 0x9a9aa2); for (const e of [0.1, 3.1]) propBuf.box(x0 + 0.92, x0 + 0.98, top, top + 1.0, z + e - 0.03, z + e + 0.03, 0x9a9aa2); } // crush barriers
  }
  // the covered stand along the east touchline: steps up to the back, a roof on columns
  for (let k = 0; k < 5; k++) {
    const x0 = 465 + 2 * k, x1 = x0 + 2, top = 0.36 * (k + 1);
    propBuf.box(x0, x1, 0, top, -84, -38, k % 2 ? 0x8e8e86 : MD_CONC); addCollider(x0, x1, -84, -38, top, { y0: 0 });
    for (let z = -83.6; z < -38.2; z += 0.9) propBuf.box(x0 + 0.5, x0 + 1.1, top, top + 0.42, z, z + 0.45, k % 2 ? 0xc8202a : 0xe8e8e8); // tip-up seats in club colours
  }
  propBuf.box(464.6, 476, 5.0, 5.25, -84.4, -37.6, 0x6a6a70, { bottom: true }); addRoof(464.6, 476, -84.4, -37.6, 5.25, { y0: 5.0 });
  propBuf.box(464.4, 464.6, 4.4, 5.25, -84.4, -37.6, 0xc8202a); // the fascia
  for (const z of [-84, -72.5, -61, -49.5, -38]) mdWall(464.75, 465.0, z - 0.12, z + 0.12, 5.0, 0x5a5a62);
  for (const z0 of [-84.4, -37.85]) propBuf.box(465, 475.8, 0, 5.0, Math.min(z0, z0 + 0.25), Math.max(z0, z0 + 0.25), 0x7a4038); // end screens
  mdRoofs.push({ x0: 465.2, x1: 475.6, z0: -84, z1: -38, h: 5.0 });
  mdPlane(9, 0.7, textTex(1024, 80, '#c8202a', '#ffffff', ['HARRIERS · MAIN STAND'], 'bold 56px Arial Black, Arial', false), 464.35, 4.82, -61, -Math.PI / 2);
  // rails along the front of both terraces (you can hop them for a pitch invasion)
  for (const x of [432.2, 463.8]) { propBuf.box(x - 0.04, x + 0.04, 0.95, 1.05, -84, -38, 0xd0d0d8); for (let z = -84; z <= -38; z += 2.3) propBuf.box(x - 0.03, x + 0.03, 0, 1.0, z - 0.03, z + 0.03, 0xd0d0d8); addCollider(x - 0.06, x + 0.06, -84, -38, 1.05, { y0: 0 }); }
  // dugouts on the west side
  for (const z of [-66, -56]) { propBuf.box(432.3, 433.6, 0, 1.7, z - 1.8, z + 1.8, 0x2a2a2e); propBuf.box(432.3, 432.5, 0, 1.7, z - 1.8, z + 1.8, 0x3a4a5a); addCollider(432.3, 433.6, z - 1.8, z + 1.8, 1.7, { y0: 0 }); }
  // the tea bar in the north-west corner: a hatch facing the terrace
  {
    const x0 = 422, x1 = 427, z0 = -32, z1 = -27;
    propBuf.box(x0, x1, 0, 2.7, z0, z0 + 0.15, 0xe8e0c8); propBuf.box(x0, x1, 0, 2.7, z1 - 0.15, z1, 0xe8e0c8); propBuf.box(x0, x0 + 0.15, 0, 2.7, z0, z1, 0xe8e0c8);
    propBuf.box(x1 - 0.15, x1, 0, 1.05, z0, z1, 0xe8e0c8); propBuf.box(x1 - 0.15, x1, 2.1, 2.7, z0, z1, 0xe8e0c8); propBuf.box(x1 - 0.1, x1 + 0.45, 1.05, 1.12, z0, z1, 0x8a5a2a);
    propBuf.box(x0 - 0.1, x1 + 0.6, 2.7, 2.85, z0 - 0.1, z1 + 0.1, 0xc8202a, { bottom: true });
    glowBuf.box(x0 + 0.5, x1 - 0.5, 2.5, 2.56, z0 + 1, z1 - 1, 0xfff6d8);
    addCollider(x0, x1 + 0.45, z0, z1, 2.85, { y0: 0 });
    mdPlane(2.6, 0.5, textTex(512, 96, '#c8202a', '#ffffff', ['TEA BAR · PIES'], 'bold 56px Arial Black, Arial', false), x1 + 0.62, 2.45, (z0 + z1) / 2, Math.PI / 2);
    G.teaKeeper = { x: x1 - 0.8, z: (z0 + z1) / 2, face: Math.PI / 2 };
  }
  // floodlight pylons in the corners
  const lg = new THREE.Group(); G.lampMat = new THREE.MeshBasicMaterial({ color: 0x55554a });
  for (const [x, z] of [[419.5, -25.5], [472.5, -25.5], [419.5, -96.5], [472.5, -96.5]]) {
    mdWall(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 16, 0x8a8a92);
    const fx = Math.sign(G.cx - x), fz = Math.sign(G.cz - z), head = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.25), G.lampMat);
    head.position.set(x + fx * 0.6, 16.6, z + fz * 0.6); head.rotation.y = Math.atan2(fx, fz); head.rotation.x = 0.35; lg.add(head);
  }
  scene.add(lg); G.lights = lg;
  // the scoreboard over the car park gate
  const bt = canvasTex(512, 160, (ctx) => mdDrawBoard(ctx, null));
  for (const e of [-3.1, 3.1]) mdWall(G.cx + e - 0.15, G.cx + e + 0.15, G.z0 + 0.4, G.z0 + 0.7, 5.6, 0x3a3a3e);
  propBuf.box(G.cx - 3.3, G.cx + 3.3, 3.5, 5.7, G.z0 + 0.35, G.z0 + 0.55, 0x1a1a1e);
  G.board = mdPlane(6.2, 1.95, bt, G.cx, 4.6, G.z0 + 0.58, 0, true); G.boardTex = bt;
  // where the real fans stand: along the front of each terrace and behind the goals
  for (let z = -82; z <= -40; z += 1.4) { G.watch.push({ x: 430, z, face: Math.PI / 2, taken: null }); G.watch.push({ x: 466, z, face: -Math.PI / 2, taken: null }); }
  for (let x = 437; x <= 459; x += 1.6) { G.watch.push({ x, z: -30.5, face: Math.PI, taken: null }); G.watch.push({ x, z: -92.5, face: 0, taken: null }); }
  buildCrowd();
  G.built = true;
}
function mdDrawBoard(ctx, M, minute) {
  ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = '#f0d020'; ctx.font = 'bold 30px Arial Black, Arial'; ctx.textAlign = 'center';
  ctx.fillText('HARRIERS', 128, 46); ctx.fillText(M ? M.opp.name : 'VISITORS', 384, 46);
  ctx.fillStyle = '#ff4030'; ctx.font = 'bold 76px Arial Black, Arial';
  ctx.fillText(M ? String(M.home) : '-', 128, 128); ctx.fillText(M ? String(M.away) : '-', 384, 128);
  ctx.fillStyle = '#f0f0f0'; ctx.font = 'bold 28px Arial Black, Arial'; ctx.fillText(minute || '', 256, 128);
}
function mdUpdateBoard(M, label) {
  const T = ground.boardTex; if (!T) return;
  const key = M ? `${M.home}-${M.away}-${label}` : 'none'; if (ground.boardKey === key) return; ground.boardKey = key;
  mdDrawBoard(T.image.getContext('2d'), M, label); T.needsUpdate = true;
}
// the terraces full of fans: two instanced meshes (bodies and heads) so a few hundred people cost nothing
const MD_FAN_BODY = new THREE.BoxGeometry(0.48, 1.2, 0.3).translate(0, 0.6, 0), MD_FAN_HEAD = new THREE.BoxGeometry(0.26, 0.28, 0.26).translate(0, 1.36, 0);
const MD_DUMMY = new THREE.Object3D();
function buildCrowd() {
  const slots = [];
  for (let k = 0; k < 5; k++) {
    const top = 0.36 * (k + 1);
    for (let z = -83.5; z <= -38.5; z += 0.72) {
      if (mdHash(k, z, 1) < 0.62) slots.push({ x: 431 - 2 * k - 1 + mr(-0.2, 0.2), y: top, z: z + mr(-0.1, 0.1), face: Math.PI / 2, side: 'w' });
      if (mdHash(k, z, 2) < 0.7) slots.push({ x: 465 + 2 * k + 0.8, y: top + 0.1, z, face: -Math.PI / 2, side: z < -72 ? 'away' : 'e' });
    }
  }
  const n = slots.length, mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const body = new THREE.InstancedMesh(MD_FAN_BODY, mat, n), head = new THREE.InstancedMesh(MD_FAN_HEAD, mat, n);
  const col = new THREE.Color();
  slots.forEach((s, i) => {
    s.phase = Math.random() * 6.28;
    const r = Math.random();
    col.setHex(s.side === 'away' ? mpick([0x2a5aa0, 0xf0f0f0, 0x3a3a42]) : r < 0.42 ? 0xc8202a : r < 0.62 ? 0xf0f0f0 : mpick([0x2a2a32, 0x3a5a8c, 0x6a6a72, 0x8a3a3a, 0x2a4a2a]));
    body.setColorAt(i, col); col.setHex(mpick(SKINS)); head.setColorAt(i, col);
  });
  body.visible = head.visible = false; body.frustumCulled = head.frustumCulled = false; scene.add(body); scene.add(head); // (instances are far from the mesh's own origin)
  ground.crowd = { body, head, slots, shown: false, away: null };
  mdPlaceCrowd(0, 0);
}
function mdPlaceCrowd(t, jump) {
  const C = ground.crowd; if (!C) return;
  C.slots.forEach((s, i) => {
    const up = jump > 0 ? Math.max(0, Math.sin(t * 9 + s.phase)) * 0.35 * jump * (s.side === 'away' ? (C.awayCheer ? 1 : 0) : (C.awayCheer ? 0 : 1)) : 0;
    MD_DUMMY.position.set(s.x, s.y + up, s.z); MD_DUMMY.rotation.set(0, s.face, 0); MD_DUMMY.updateMatrix();
    C.body.setMatrixAt(i, MD_DUMMY.matrix); C.head.setMatrixAt(i, MD_DUMMY.matrix);
  });
  C.body.instanceMatrix.needsUpdate = C.head.instanceMatrix.needsUpdate = true;
}
function buildClubhouse() {
  const B = clubhouse, h = 3.4, t = 0.25;
  mdWall(B.x0, B.x1, B.z0, B.z0 + t, h, 0xd8d0c0); mdWall(B.x0, B.x1, B.z1 - t, B.z1, h, 0xd8d0c0); mdWall(B.x1 - t, B.x1, B.z0, B.z1, h, 0xd8d0c0);
  mdWallWithGaps('z', B.x0 + t / 2, B.z0, B.z1, [[-50.8, -49.2]], h, t / 2, 0xd8d0c0);
  propBuf.box(B.x0, B.x1, 2.25, h, -50.8, -49.2, 0xd8d0c0); // over the door
  propBuf.box(B.x0 - 0.3, B.x1 + 0.3, h, h + 0.25, B.z0 - 0.3, B.z1 + 0.3, 0x4a4a52, { bottom: true }); addRoof(B.x0 - 0.3, B.x1 + 0.3, B.z0 - 0.3, B.z1 + 0.3, h + 0.25, { y0: h });
  groundBuf.flat(B.x0 + 0.2, B.x1 - 0.2, B.z0 + 0.2, B.z1 - 0.2, 0.02, 0x8a6a4a);
  glowBuf.box(B.x0 + 2, B.x1 - 2, h - 0.08, h - 0.03, -50.3, -49.7, 0xfff6d8);
  mdPlane(4.4, 0.6, textTex(512, 72, '#c8202a', '#ffffff', ['CLUBHOUSE'], 'bold 52px Arial Black, Arial', false), B.x0 - 0.02, 2.8, -50, -Math.PI / 2);
  // inside: a partition between the bar (north) and the changing room (south), with a doorway
  mdWallWithGaps('x', -51.5, B.x0 + t, B.x1 - t, [[486, 487.4]], h, 0.1, 0xe8e0d0);
  // the bar: a counter, a few tables, the trophy cabinet
  propBuf.box(489, 497.6, 0, 1.05, -42.2, -41.6, 0x6a3a22); addCollider(489, 497.6, -42.2, -41.6, 1.05, { y0: 0 });
  propBuf.box(489, 497.6, 1.05, 1.1, -42.3, -41.5, 0x3a2a1a);
  for (let x = 489.5; x < 497.4; x += 0.5) propBuf.box(x, x + 0.12, 1.5, 1.85, -40.4, -40.3, mpick([0x2a6a2a, 0x8a5a1a, 0xc8a050, 0x5a1a1a]));
  for (const [x, z] of [[485, -44], [488.5, -46.5], [493, -46.5]]) { propBuf.box(x - 0.5, x + 0.5, 0.72, 0.78, z - 0.5, z + 0.5, 0x7a4a2a); propBuf.box(x - 0.05, x + 0.05, 0, 0.72, z - 0.05, z + 0.05, 0x3a2a1a); addCollider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 0.78, { y0: 0 }); }
  propBuf.box(482.3, 482.8, 0, 1.9, -45.5, -42.5, 0x5a3a22); glowBuf.box(482.82, 482.86, 0.3, 1.8, -45.3, -42.7, 0xf0d070); addCollider(482.3, 482.8, -45.5, -42.5, 1.9, { y0: 0 });
  // the changing room: benches round the walls, kit lockers, a whiteboard of tactics
  for (const z of [-59.4, -52.4]) { propBuf.box(483, 491, 0.42, 0.48, z - 0.25, z + 0.25, 0x9a7a4a); addCollider(483, 491, z - 0.25, z + 0.25, 0.48, { y0: 0 }); }
  for (let k = 0; k < 5; k++) B.lockers.push(hidePiece('locker', B.x1 - t - 0.3, -58.6 + k * 0.8, -1, 0, 0.32, 0.28, 1.95, 0));
  for (let k = 0; k < 8; k++) propBuf.box(483.2 + k * 0.95, 483.6 + k * 0.95, 1.4, 1.9, B.z0 + t + 0.01, B.z0 + t + 0.04, k % 2 ? 0xc8202a : 0xf0f0f0); // shirts on pegs
  propBuf.box(491.5, 494.5, 1.2, 2.3, -51.42, -51.38, 0xf0f0f0);
  mdRoofs.push({ x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, h });
}
function buildChurch() {
  const Ch = church, h = 6, t = 0.4, P = Ch.plot;
  // a low stone wall round the churchyard, gate at the front
  mdWallWithGaps('x', P.z1, P.x0, P.x1, [[Ch.door.x - 1.4, Ch.door.x + 1.4]], 0.95, 0.25, 0x8a8478);
  mdWallWithGaps('x', P.z0, P.x0, P.x1, [], 0.95, 0.25, 0x8a8478);
  mdWallWithGaps('z', P.x0, P.z0, P.z1, [[-80, -77]], 0.95, 0.25, 0x8a8478);
  mdWallWithGaps('z', P.x1, P.z0, P.z1, [], 0.95, 0.25, 0x8a8478);
  navOpen.push({ x0: Ch.door.x - 1.2, x1: Ch.door.x + 1.2, z0: P.z1 - 1, z1: P.z1 + 1 }, { x0: P.x0 - 1, x1: P.x0 + 1, z0: -79.5, z1: -77.5 });
  // the nave: stone walls, a door at the north end, a steep slate roof
  const stone = 0xb8b0a0;
  mdWall(Ch.x0, Ch.x0 + t, Ch.z0, Ch.z1, h, stone); mdWall(Ch.x1 - t, Ch.x1, Ch.z0, Ch.z1, h, stone); mdWall(Ch.x0, Ch.x1, Ch.z0, Ch.z0 + t, h, stone);
  mdWallWithGaps('x', Ch.z1 - t / 2, Ch.x0, Ch.x1, [[Ch.door.x - 1.0, Ch.door.x + 1.0]], h, t / 2, stone);
  propBuf.box(Ch.door.x - 1.0, Ch.door.x + 1.0, 3.0, h, Ch.z1 - t, Ch.z1, stone);
  propBuf.box(Ch.door.x - 1.1, Ch.door.x + 1.1, 2.9, 3.1, Ch.z1 - t - 0.02, Ch.z1 + 0.02, 0x8a7a62);
  propBuf.prism(Ch.x0 - 0.4, Ch.x1 + 0.4, Ch.z0 - 0.3, Ch.z1 + 0.3, h, 4.2, 0x4a4e58, false);
  propBuf.box(Ch.x0 - 0.4, Ch.x1 + 0.4, h - 0.1, h, Ch.z0 - 0.3, Ch.z1 + 0.3, 0x4a4e58);
  propBuf.box(Ch.x0 + t, Ch.x1 - t, h - 0.12, h - 0.1, Ch.z0 + t, Ch.z1 - t, 0xd8ccb0, { bottom: true }); // a plaster ceiling (the roof's only skin-deep from inside)
  for (let z = Ch.z0 + 2; z < Ch.z1 - 1; z += 3) propBuf.box(Ch.x0 + t, Ch.x1 - t, h - 0.4, h - 0.12, z - 0.15, z + 0.15, 0x5a3a22); // oak beams
  // the bell tower behind the altar, with a spire
  mdWall(487, 493, -104, Ch.z0, 15, 0xa8a090);
  propBuf.cyl(490, -101, 3.6, 0, 15, 23.5, 0x4a4e58, 4, false);
  glowBuf.box(489.4, 490.6, 11.5, 13.2, -104.05, -104.01, 0x2a2a3a); propBuf.box(488.8, 491.2, 9.2, 9.4, -104.08, -104, 0x8a7a62);
  // stained glass along both sides (it glows at night: the lights are on inside)
  const glass = [0xc83a3a, 0x3a5ac8, 0xe0b030, 0x3aa85a, 0x9a3ac8];
  for (let i = 0, z = -94; z <= -79; z += 5, i++) for (const [x0, x1] of [[Ch.x0 - 0.02, Ch.x0 + 0.02], [Ch.x1 - 0.02, Ch.x1 + 0.02], [Ch.x0 + t - 0.02, Ch.x0 + t + 0.02], [Ch.x1 - t - 0.02, Ch.x1 - t + 0.02]]) {
    for (let r = 0; r < 3; r++) glowBuf.box(x0, x1, 2.4 + r * 0.7, 3.0 + r * 0.7, z - 0.55, z + 0.55, glass[(i + r) % glass.length]);
  }
  glowBuf.box(Ch.door.x - 0.8, Ch.door.x + 0.8, 3.4, 4.6, Ch.z1 + 0.01, Ch.z1 + 0.05, 0xe0b030);
  // inside: a stone floor, the altar, a pulpit, organ pipes, the pews
  groundBuf.flat(Ch.x0 + t, Ch.x1 - t, Ch.z0 + t, Ch.z1 - t, 0.02, 0x9a9288);
  groundBuf.flat(489.2, 490.8, Ch.z0 + t, Ch.z1 - t, 0.024, 0x8a2020); // red carpet up the aisle
  propBuf.box(488, 492, 0, 0.3, -97.6, -95.2, 0xa8a090); propBuf.box(488.6, 491.4, 0.3, 1.25, -97.4, -96.6, 0xe8e0d0); addCollider(488, 492, -97.6, -95.2, 0.3, { y0: 0 }); addCollider(488.6, 491.4, -97.4, -96.6, 1.25, { y0: 0 });
  propBuf.box(489.95, 490.05, 1.25, 1.85, -97.1, -97.0, 0xd8b040); propBuf.box(489.75, 490.25, 1.6, 1.68, -97.1, -97.0, 0xd8b040); // a little brass cross
  glowBuf.box(488.8, 489.0, 1.25, 1.5, -97.05, -96.95, 0xfff0a0); glowBuf.box(491.0, 491.2, 1.25, 1.5, -97.05, -96.95, 0xfff0a0); // candles
  propBuf.box(493.5, 494.6, 0, 1.3, -95, -94.0, 0x6a4a2a); addCollider(493.5, 494.6, -95, -94.0, 1.3, { y0: 0 }); Ch.pulpit = { x: 494, z: -93.4, face: 0 };
  for (let k = 0; k < 7; k++) propBuf.cyl(485.0 + k * 0.28, -97.2, 0.1, 0.1, 0.8, 2.2 + Math.sin(k * 0.9) * 0.7 + k * 0.1, 0xc8b070, 6, true);
  propBuf.box(484.5, 487, 0, 0.9, -96.5, -95.6, 0x5a3a22); addCollider(484.5, 487, -96.5, -95.6, 0.9, { y0: 0 });
  for (let r = 0; r < 9; r++) {
    const pz = -92.4 + r * 1.55;
    for (const [x0, x1] of [[Ch.x0 + t + 0.3, 488.9], [491.1, Ch.x1 - t - 0.3]]) {
      propBuf.box(x0, x1, 0.42, 0.5, pz - 0.22, pz + 0.22, 0x6a4022); propBuf.box(x0, x1, 0.5, 0.98, pz + 0.18, pz + 0.26, 0x6a4022);
      for (const x of [x0, x1 - 0.06]) propBuf.box(x, x + 0.06, 0, 0.98, pz - 0.22, pz + 0.26, 0x5a3418);
      addCollider(x0, x1, pz - 0.22, pz + 0.26, 0.98, { y0: 0 });
      const n = Math.floor((x1 - x0) / 0.85);
      for (let s = 0; s < n; s++) {
        const sx = x0 + 0.45 + s * ((x1 - x0 - 0.9) / Math.max(1, n - 1));
        const spot = { kind: 'pew', x: sx, z: pz - 0.62, face: Math.PI, sx, sz: pz - 0.05, church: Ch, taken: null };
        lifeSpots.push(spot); Ch.pews.push(spot);
      }
    }
  }
  glowBuf.box(486, 494, h - 0.25, h - 0.2, -90.3, -89.7, 0xfff0c0); glowBuf.box(486, 494, h - 0.25, h - 0.2, -82.3, -81.7, 0xfff0c0);
  hidePiece('cupboard', Ch.x1 - t - 0.3, -96.6, -1, 0, 0.5, 0.3, 2.0, 0); // the vestry cupboard (cassocks, hymn books, you)
  mdRoofs.push({ x0: Ch.x0, x1: Ch.x1, z0: Ch.z0, z1: Ch.z1, h });
  // the noticeboard by the gate
  propBuf.box(Ch.door.x + 1.9, Ch.door.x + 2.0, 0, 1.8, P.z1 + 0.4, P.z1 + 0.5, 0x3a2a1a);
  mdPlane(1.4, 0.9, textTex(256, 160, '#1a2a4a', '#f0e8c0', ['ST. MARGARET\'S', 'SUNDAY 10AM', 'ALL WELCOME'], 'bold 28px Georgia, serif', true), Ch.door.x + 1.95, 1.45, P.z1 + 0.52, 0);
  // the graveyard: rows of headstones (good low cover), a few crosses, an old yew
  for (let gx = 499.5; gx < 514.5; gx += 1.9) for (let gz = -99; gz < -67; gz += 2.4) {
    const r = mdHash(gx, gz, 4); if (r < 0.22) continue;
    const ht = 0.6 + mdHash(gx, gz, 5) * 0.55, x = gx + (mdHash(gx, gz, 6) - 0.5) * 0.4, col = mpick([0x9a9a92, 0x8a8a84, 0xa8a49a, 0x7a7a74]);
    if (r < 0.32) { propBuf.box(x - 0.06, x + 0.06, 0, 1.2, gz - 0.06, gz + 0.06, col); propBuf.box(x - 0.3, x + 0.3, 0.8, 0.92, gz - 0.06, gz + 0.06, col); addCollider(x - 0.08, x + 0.08, gz - 0.08, gz + 0.08, 1.2, { y0: 0 }); }
    else { propBuf.box(x - 0.32, x + 0.32, 0, ht, gz - 0.08, gz + 0.08, col); addCollider(x - 0.32, x + 0.32, gz - 0.08, gz + 0.08, ht, { y0: 0 }); }
    groundBuf.flat(x - 0.35, x + 0.35, gz + 0.15, gz + 1.5, 0.016, 0x4e7038);
    Ch.graves.push({ x, z: gz });
  }
  addTree(511.5, -70, 2.1); addTree(485, -68, 1.6);
}
function buildCarBoot() {
  const B = carBoot, g = new THREE.Group();
  const box = (w, hh, d, x, y, z, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), lam(col)); m.position.set(x, y, z); g.add(m); return m; };
  for (let k = 0; k < 7; k++) {
    const x = 424 + k * 8, z = -110;
    parkedSpots.push({ x, z, heading: Math.PI }); // the cars stay all week: it's the car park
    const tz = -105.6;
    box(1.8, 0.05, 0.75, x, 0.76, tz, 0xe8e8e0); for (const [a, b] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]]) box(0.04, 0.74, 0.04, x + a, 0.38, tz + b, 0x8a8a92);
    for (let j = 0; j < 5; j++) { const s = mr(0.15, 0.4); box(s, mr(0.1, 0.4), s, x - 0.7 + j * 0.35, 0.8 + 0.1, tz + mr(-0.2, 0.2), mpick([0x8a5a2a, 0xc8b8a0, 0x3a5a8c, 0xc83a3a, 0x2a2a2a, 0xe0c060, 0x6a8a6a])); }
    box(0.5, 0.4, 0.4, x + 1.3, 0.2, tz + 0.1, 0xb89060); // a cardboard box on the ground
    const sp = { x, z: tz + 1.2, tx: x, tz, seller: { x, z: tz - 0.9, face: 0 }, stock: [], day: 0, i: k };
    B.tables.push(sp);
  }
  g.visible = false; scene.add(g); B.group = g;
}
worldHooks.beforeBake.push(() => { buildGround(); buildClubhouse(); buildChurch(); buildCarBoot(); });

// =====================================================================
// Static staff: stewards, the tea lady, the scarf seller, the vicar, car boot sellers, the happy couple
// =====================================================================
const mdStaff = [];
function mdPerson(look, x, z, face, extra) {
  const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: 0x3a3a42, pants: 0x23262e, ...look });
  p.group.position.set(x, 0, z); p.group.rotation.y = face; p.group.visible = false; scene.add(p.group);
  const S = { p, g: p.group, x, z, face, ...extra }; mdStaff.push(S); return S;
}
function mdAddBox(parent, w, h, d, x, y, z, col) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(col)); m.position.set(x, y, z); parent.add(m); return m; }
function buildStaff() {
  if (mdStaff.length) return;
  for (const s of ground.stewards) { const S = mdPerson({ shirt: 0xe8e020 }, s.x, s.z, s.face, { role: 'steward', seeT: 0, warnT: 0 }); mdAddBox(S.p.torso, 0.5, 0.06, 0.32, 0, -0.18, 0, 0xc0c0c8); s.S = S; } // hi-vis with a reflective stripe
  ground.teaLady = mdPerson({ shirt: 0xf0f0f0, hair: 0xd8d8d8 }, ground.teaKeeper.x, ground.teaKeeper.z, ground.teaKeeper.face, { role: 'tea' });
  mdAddBox(ground.teaLady.p.torso, 0.46, 0.5, 0.05, 0, -0.1, 0.21, 0xc8202a);
  ground.seller = mdPerson({ shirt: 0xc8202a }, ground.scarves.x, ground.scarves.z + 0.9, Math.PI, { role: 'scarves' });
  mdAddBox(ground.seller.p.torso, 0.6, 0.1, 0.36, 0, 0.18, 0, 0xf0f0f0);
  // the scarf seller's pitch: a trestle table of scarves on match days
  const sg = new THREE.Group();
  mdAddBox(sg, 1.8, 0.05, 0.7, 0, 0.78, 0, 0xe8e8e0); for (const [a, b] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]]) mdAddBox(sg, 0.04, 0.76, 0.04, a, 0.39, b, 0x8a8a92);
  for (let k = 0; k < 6; k++) mdAddBox(sg, 0.22, 0.06, 0.5, -0.65 + k * 0.26, 0.84, 0, k % 2 ? 0xf0f0f0 : 0xc8202a);
  sg.position.set(ground.scarves.x, 0, ground.scarves.z); sg.visible = false; scene.add(sg); ground.scarfTable = sg;
  church.vicar = mdPerson({ shirt: 0x1a1a1e, pants: 0x1a1a1e, hair: 0xd8d8d8 }, church.pulpit.x, church.pulpit.z, 0, { role: 'vicar' });
  mdAddBox(church.vicar.p.torso, 0.14, 0.05, 0.05, 0, 0.27, 0.215, 0xffffff);
  church.bride = mdPerson({ shirt: 0xf8f8f8, pants: 0xf8f8f8, hairStyle: 'bun' }, church.door.x - 0.5, church.door.z + 1.6, 0, { role: 'bride' });
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.55, 0.9, 10), lam(0xf8f8f8)); skirt.position.y = 0.45; church.bride.g.add(skirt);
  church.groom = mdPerson({ shirt: 0x2a2a32, pants: 0x2a2a32 }, church.door.x + 0.5, church.door.z + 1.6, 0, { role: 'groom' });
  mdAddBox(church.groom.p.torso, 0.08, 0.3, 0.04, 0, 0.05, 0.215, 0xe0e0e0);
  for (const T of carBoot.tables) T.S = mdPerson({ shirt: mpick([0x3a5a8c, 0x6a6a3a, 0x8a3a3a, 0xc8a050, 0x5a7a9a]) }, T.seller.x, T.seller.z, 0, { role: 'boot' });
}

// =====================================================================
// The match itself: two teams, a ball, a referee
// =====================================================================
const MD_FORM = [[0, 0.03, 'gk'], [-0.62, 0.2], [-0.22, 0.17], [0.22, 0.17], [0.62, 0.2], [-0.66, 0.42], [-0.22, 0.4], [0.22, 0.4], [0.66, 0.42], [-0.2, 0.63], [0.2, 0.66]];
const mdGame = { players: [], ref: null, ball: null, bx: 0, bz: 0, by: 0, bvx: 0, bvz: 0, bvy: 0, active: false, day: 0, owner: null, chanceT: 0, kickoffT: 0, lineT: 0 };
const mdOwnGoalZ = (team) => (team === 0 ? ground.pz1 : ground.pz0); // home defend the north goal
const mdDir = (team) => (team === 0 ? -1 : 1); // home attack towards the south end (-z)
function mdBuildTeams(M) {
  const kit = [HOME, M.opp];
  if (!mdGame.players.length) {
    for (let t = 0; t < 2; t++) MD_FORM.forEach((f, i) => {
      const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: 0x888888, pants: 0x888888, hairStyle: mpick(['short', 'buzz', 'short', 'curly', 'bald']) });
      p.group.visible = false; scene.add(p.group);
      mdGame.players.push({ p, team: t, i, gk: !!f[2], u: f[0], v: f[1], x: 0, z: 0, face: 0, phase: Math.random() * 6, kickT: 0 });
    });
    const r = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: 0x1a1a1a, pants: 0x1a1a1a, hairStyle: 'short' }); r.group.visible = false; scene.add(r.group);
    mdGame.ref = { p: r, x: ground.cx, z: ground.cz, face: 0, phase: 0 };
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lam(0xf8f8f8)); b.visible = false; scene.add(b); mdGame.ball = b;
  }
  for (const P of mdGame.players) {
    const k = kit[P.team];
    P.p.torso.material = lam(P.gk ? k.keeper : k.shirt); P.p.legL.material = P.p.legR.material = lam(k.shorts);
    if (P.p.armL.material) P.p.armL.material = P.p.armR.material = lam(P.gk ? k.keeper : k.shirt);
  }
}
function mdHome(P, bias) { // where a player wants to be, given how far up the pitch the ball is
  const G = ground, len = G.pz1 - G.pz0, half = (G.px1 - G.px0) / 2 - 1;
  const v = P.gk ? P.v : clamp(P.v + bias * 0.32, 0.05, 0.92);
  return { x: G.cx + P.u * half, z: mdOwnGoalZ(P.team) + mdDir(P.team) * v * len };
}
function mdKickoff(team) {
  const G = ground; mdGame.bx = G.cx; mdGame.bz = G.cz; mdGame.by = 0.16; mdGame.bvx = mdGame.bvz = mdGame.bvy = 0; mdGame.owner = null; mdGame.kickoffT = 1.2;
  for (const P of mdGame.players) { const H = mdHome(P, -0.3); P.x = H.x; P.z = clamp(H.z, Math.min(G.cz, mdOwnGoalZ(P.team)) + 0.5, Math.max(G.cz, mdOwnGoalZ(P.team)) - 0.5); P.kickT = 0.8; }
  const st = mdGame.players.find((P) => P.team === team && P.i === 9); if (st) { st.x = G.cx - 0.5; st.z = G.cz - mdDir(team) * 0.4; }
}
function mdKick(P, tx, tz, spd, lift = 0) {
  const dx = tx - mdGame.bx, dz = tz - mdGame.bz, d = Math.hypot(dx, dz) || 1;
  mdGame.bvx = dx / d * spd; mdGame.bvz = dz / d * spd; mdGame.bvy = lift; P.kickT = 0.6; P.kickAnim = 0.25;
}
function mdSimStep(dt, M, K, scheduled) {
  const G = ground, g = mdGame;
  if (g.kickoffT > 0) { g.kickoffT -= dt; if (g.kickoffT <= 0 && K.near(G.cx, G.cz, 120)) K.sfx.whistle(); }
  // the ball: rolls, bounces, slows down
  g.bx += g.bvx * dt; g.bz += g.bvz * dt; g.by += g.bvy * dt; g.bvy -= 18 * dt;
  if (g.by < 0.16) { g.by = 0.16; g.bvy = Math.abs(g.bvy) > 2 ? -g.bvy * 0.45 : 0; }
  const fr = Math.exp(-(g.by > 0.3 ? 0.25 : 1.1) * dt); g.bvx *= fr; g.bvz *= fr;
  // out of play: over the side (throw-in) or over the goal line (goal, or a goal kick)
  if (g.bx < G.px0 || g.bx > G.px1) { g.bx = clamp(g.bx, G.px0 + 0.3, G.px1 - 0.3); g.bvx = -g.bvx * 0.3; g.bvz *= 0.3; }
  for (const team of [0, 1]) {
    const gz = mdOwnGoalZ(team), past = team === 0 ? g.bz > gz : g.bz < gz;
    if (!past) continue;
    if (Math.abs(g.bx - G.cx) < 2.5 && g.by < 2.1 && g.kickoffT <= 0) { mdGoal(1 - team, M, K, scheduled); return; }
    g.chance = null; const gk = g.players.find((P) => P.team === team && P.gk); g.bx = G.cx + mr(-3, 3); g.bz = gz + (team === 0 ? -2 : 2); g.bvx = g.bvz = 0; g.by = 0.16; if (gk) { gk.x = g.bx; gk.z = g.bz + (team === 0 ? 0.6 : -0.6); }
  }
  // the scripted chance: a goal is due, so the right striker finds themselves through on goal
  if (scheduled && !g.chance) {
    const team = scheduled.home ? 0 : 1, st = g.players.find((P) => P.team === team && P.i === (Math.random() < 0.5 ? 9 : 10));
    const gz = mdOwnGoalZ(1 - team);
    if (st) { st.x = G.cx + mr(-4, 4); st.z = gz - mdDir(team) * 13; g.bx = st.x; g.bz = st.z + mdDir(team) * 0.6; g.bvx = g.bvz = 0; g.by = 0.16; g.chance = { st, t: 0.5, goal: scheduled, gz }; }
  }
  if (g.chance) { const C = g.chance; C.t -= dt; if (C.t <= 0 && !C.shot) { C.shot = true; mdKick(C.st, G.cx + mr(-1.8, 1.8), C.gz + mdDir(C.st.team) * 1, 20, mr(1, 4)); } if (C.t < -3) g.chance = null; }
  // the players: one from each side chases the ball, the rest hold their shape
  const prog = (g.bz - G.pz1) / (G.pz0 - G.pz1); // 0 at the north goal, 1 at the south
  const chasers = [0, 1].map((team) => { let b = null, bd = 1e9; for (const P of g.players) { if (P.team !== team || P.gk) continue; const d = Math.hypot(P.x - g.bx, P.z - g.bz); if (d < bd) { bd = d; b = P; } } return b; });
  for (const P of g.players) {
    P.kickT -= dt; if (P.kickAnim > 0) P.kickAnim -= dt;
    const bias = P.team === 0 ? prog - 0.5 : 0.5 - prog;
    let tx, tz, spd = 3.8;
    if (g.kickoffT > 0) { tx = P.x; tz = P.z; }
    else if (P.gk) { const gz = mdOwnGoalZ(P.team); tx = clamp(g.bx, G.cx - 2.2, G.cx + 2.2); tz = gz + (P.team === 0 ? -0.8 : 0.8); spd = 4.5; }
    else if (P === chasers[P.team] && !(g.chance && g.chance.st !== P && g.chance.st.team === P.team)) { tx = g.bx; tz = g.bz; spd = 6.6; }
    else { const H = mdHome(P, bias); tx = H.x + Math.sin(K.time * 0.7 + P.phase) * 1.5; tz = H.z; }
    if (g.chance && g.chance.st === P && !g.chance.shot) { tx = P.x; tz = P.z; }
    const dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz), v = d > 0.2 ? Math.min(spd, d * 2.5) : 0;
    if (v > 0) { P.x += dx / d * v * dt; P.z += dz / d * v * dt; }
    P.face += angDiffMD(P.face, v > 0.5 ? Math.atan2(dx, dz) : Math.atan2(g.bx - P.x, g.bz - P.z)) * Math.min(1, dt * 8);
    P.spd = v;
    // on the ball: shoot if close enough, otherwise pass forward or hoof it
    const bd = Math.hypot(P.x - g.bx, P.z - g.bz);
    if (bd < 0.75 && P.kickT <= 0 && g.by < 0.8 && g.kickoffT <= 0 && !g.chance) { // (nobody gets in the way of a goal that's meant to be)
      const oz = mdOwnGoalZ(1 - P.team), toGoal = Math.abs(oz - g.bz);
      if (P.gk) mdKick(P, G.cx + mr(-10, 10), g.bz + mdDir(P.team) * mr(20, 30), 17, mr(4, 7));
      else if (toGoal < 15 && Math.random() < 0.7) { mdKick(P, G.cx + mr(-4.2, 4.2), oz, mr(15, 20), mr(0, 4)); if (K.near(G.cx, G.cz, 80) && Math.random() < 0.5) K.sfx.ooh(); }
      else {
        const mates = g.players.filter((o) => o.team === P.team && o !== P && !o.gk && (o.z - P.z) * mdDir(P.team) > -2);
        const to = mates.length ? mpick(mates) : null;
        if (to && Math.random() < 0.75) mdKick(P, to.x + mr(-1, 1), to.z + mdDir(P.team) * 2, mr(9, 13), mr(0, 2));
        else mdKick(P, g.bx + mr(-5, 5), g.bz + mdDir(P.team) * mr(6, 10), mr(6, 9));
      }
    }
  }
  // the ref trots along behind play
  const R = g.ref, rx = g.bx + 6, rz = g.bz + 4 * Math.sin(K.time * 0.3), rd = Math.hypot(rx - R.x, rz - R.z);
  if (rd > 1) { R.x += (rx - R.x) / rd * Math.min(4, rd) * dt; R.z += (rz - R.z) / rd * Math.min(4, rd) * dt; }
  R.face = Math.atan2(g.bx - R.x, g.bz - R.z); R.spd = rd > 1 ? Math.min(4, rd) : 0;
}
const angDiffMD = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const MD_GOAL_HOME = ['GOOOAAAL!', 'GET IN!', 'YESSS!', 'COME ON, HARRIERS!', 'WHAT A GOAL!', 'ON THE VOLLEY!'];
const MD_GOAL_AWAY = ['OH, REF!', 'DEFENDING LIKE THAT...', 'WAKE UP, HARRIERS!', 'THAT WAS OFFSIDE!', 'NOT AGAIN'];
const MD_CHANTS = ['HARRIERS! HARRIERS!', 'COME ON, YOU REDS!', 'ONE-NIL TO THE HARRIERS... PROBABLY', 'WHO ATE ALL THE PIES?', 'REF! ARE YOU WATCHING?', 'SHOOOOT!', 'HE\'S GOT LEGS LIKE A DEER!', 'WE\'RE NOT SINGING ANY MORE (WE\'RE EATING)'];
function mdGoal(team, M, K, scheduled) {
  const g = mdGame;
  if (team === 0) M.home++; else M.away++;
  if (scheduled) scheduled.done = true; else { const s = M.goals.find((q) => !q.done && q.home === (team === 0)); if (s) s.done = true; } // a goal from open play counts towards the day's tally
  g.chance = null; MD_STATE.goals++;
  MD_STATE.celebT = 3.2; ground.crowd.awayCheer = team === 1; MD_STATE.lastGoal = { team, t: K.time };
  const near = K.near(ground.cx, ground.cz, 160);
  if (near) { K.sfx.roar(team === 0); K.showMsg(`${team === 0 ? 'GOAL! HARRIERS' : 'GOAL... ' + M.opp.name}  ${M.home}-${M.away}`, 2.2); }
  for (const h of K.hunters()) if (h.mdFan && !h.dead && h.state !== 'chase' && mdInGround(h.x, h.z)) { K.lifeGo(h, team === 0 ? 'cheer' : 'watch', h.x, h.z, h.face, mr(2.5, 4)); if (near && Math.random() < 0.3) K.say(h, mpick(team === 0 ? MD_GOAL_HOME : MD_GOAL_AWAY)); }
  mdKickoff(1 - team);
}
function mdShowGame(show) {
  if (mdGame.active === show) return; mdGame.active = show;
  for (const P of mdGame.players) P.p.group.visible = show;
  if (mdGame.ref) mdGame.ref.p.group.visible = show;
  if (mdGame.ball) mdGame.ball.visible = show;
}
function mdPoseRunner(P, dt) {
  const p = P.p; P.phase += (P.spd || 0) * dt * 3.2;
  const sw = Math.sin(P.phase) * Math.min(1, (P.spd || 0) / 3) * 0.9;
  p.legL.rotation.x = sw; p.legR.rotation.x = -sw; p.armL.rotation.x = -sw * 0.7; p.armR.rotation.x = sw * 0.7;
  if (P.kickAnim > 0) p.legR.rotation.x = -1.3;
  if (P.gk && (P.spd || 0) < 0.5) { p.armL.rotation.x = p.armR.rotation.x = -0.6; p.armL.rotation.z = -0.4; p.armR.rotation.z = 0.4; }
  p.group.position.set(P.x, 0, P.z); p.group.rotation.y = P.face;
}

// =====================================================================
// Fans, stewards and the ticket check
// =====================================================================
function mdGiveScarf(h, away) {
  const col = away ? 0x2a5aa0 : 0xc8202a;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.34), lam(col)); m.position.set(0, 0.28, 0); h.p.torso.add(m);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.04), lam(0xf0f0f0)); tail.position.set(0.1, 0.05, 0.2); h.p.torso.add(tail);
  h.mdScarf = [m, tail];
}
function mdFreeWatch() { const free = ground.watch.filter((w) => !w.taken || w.taken.dead || !w.taken.mdFan); return free.length ? mpick(free) : null; }
function mdSendToTerrace(h, K) {
  const w = mdFreeWatch(); if (!w) return false;
  w.taken = h; h.mdSpot = w;
  return K.lifeGo(h, 'watch', w.x + mr(-0.3, 0.3), w.z + mr(-0.3, 0.3), w.face, mr(40, 80), { maxGo: 45 });
}
function mdSendHome(h, K) {
  if (h.mdSpot && h.mdSpot.taken === h) h.mdSpot.taken = null; h.mdSpot = null; h.mdFan = 'leaving';
  const x = mr(380, 530), z = mr(-9, -5) * (Math.random() < 0.5 ? 1 : -1);
  return K.lifeGo(h, 'walk', x, z, null, 0.5, { maxGo: 50 });
}
function mdUpdateFans(dt, K, M) {
  const P = K.player, G = ground;
  const near = K.near(G.cx, G.cz, 200);
  const fans = K.hunters().filter((h) => h.mdFan && !h.dead);
  MD_STATE.fans = fans.length;
  if (!M || !M.on) return;
  MD_STATE.fanT = (MD_STATE.fanT || 0) - dt; if (MD_STATE.fanT > 0) return; MD_STATE.fanT = 0.8;
  if (M.phase === 'post') { for (const h of fans) if (h.mdFan === true && (!h.act || h.act.kind !== 'walk')) mdSendHome(h, K); return; }
  for (const h of fans) if (h.mdFan === true && !h.act && h.state !== 'chase' && !(h.panicT > 0)) mdSendToTerrace(h, K);
  // more fans turn up: walking in from Route 9 before kick-off, and the odd latecomer
  const want = M.night ? 14 : 20;
  if (near && fans.length < want && (M.phase === 'pre' || Math.random() < 0.25)) {
    const sx = Math.random() < 0.7 ? mr(G.x0, G.x1) : mr(380, 520), sz = Math.random() < 0.6 ? -14 : -18;
    const h = K.spawnCivAt(sx, sz);
    if (h) { h.mdFan = true; h.job = null; mdGiveScarf(h, Math.random() < 0.15); mdSendToTerrace(h, K); }
  }
  // the odd chant from the terrace
  MD_STATE.chantT = (MD_STATE.chantT || mr(3, 8)) - 0.8;
  if (MD_STATE.chantT <= 0 && M.playing && K.near(G.cx, G.cz, 70)) { MD_STATE.chantT = mr(5, 11); const h = fans.find((f) => mdInGround(f.x, f.z) && K.near(f.x, f.z, 40)); if (h) K.say(h, mpick(MD_CHANTS)); K.sfx.chant(); }
}
const MD_STEWARD = ['OI! TICKET!', 'TICKETS, PLEASE!', 'CAN I SEE YOUR TICKET?', 'DID YOU COME OVER THAT WALL?', 'YOU! WHERE\'S YOUR TICKET?'];
function mdTicketCheck(dt, K, M) {
  const P = K.player;
  MD_STATE.warnT = Math.max(0, MD_STATE.warnT - dt);
  if (!M || !M.on || M.phase === 'post' || MD_STATE.ticketDay === K.G.day || P.hide || P.car) return;
  if (!mdInGround(P.x, P.z)) return;
  for (const s of ground.stewards) {
    const S = s.S; if (!S) continue;
    if (Math.hypot(P.x - S.x, P.z - S.z) > 14 || !K.canSee(S.x, 1.6, S.z)) continue;
    if (MD_STATE.warnT > 0) return;
    MD_STATE.warnT = 6; MD_STATE.warned++;
    K.say({ g: S.g }, mpick(MD_STEWARD)); K.bumpLocal(0.05);
    if (MD_STATE.warned % 2 === 0) { K.addHeat(2); K.showMsg('THE STEWARD IS ON THE RADIO ABOUT YOU. PAY AT A TURNSTILE', 2.6); }
    else K.showMsg('NO TICKET. A STEWARD HAS SPOTTED YOU', 2);
    return;
  }
}

// =====================================================================
// Church: the service, the bells, the wedding
// =====================================================================
const MD_VICAR = ['LET US PRAY', 'HYMN NUMBER TWO HUNDRED AND SIX', 'PEACE BE WITH YOU', 'PLEASE BE SEATED', 'THE COLLECTION PLATE IS COMING ROUND', 'TEA AND BISCUITS IN THE HALL AFTERWARDS', 'A SPECIAL WELCOME TO ANY VISITORS'];
const MD_PEW = ['AMEN', '*SINGS SLIGHTLY OFF KEY*', '*COUGHS*', 'WHAT PAGE ARE WE ON?', '*TURNS A PAGE*', '*NODS OFF*'];
const MD_WED = ['DOESN\'T SHE LOOK LOVELY?', 'I GIVE IT A YEAR', 'CONFETTI! CONFETTI!', 'EVERYONE SQUEEZE IN!', 'SAY CHEESE!', 'WHERE\'S THE BAR?', 'I CRIED. I ALWAYS CRY'];
function mdUpdateChurch(dt, K) {
  const day = K.G.day, hr = K.hour, Ch = church;
  const service = !!eventOn('church', 'ASHFORD', day, hr), wedding = !!eventOn('wedding', 'ASHFORD', day, hr);
  if (Ch.vicar) Ch.vicar.g.visible = service || wedding;
  if (Ch.vicar && wedding) { Ch.vicar.g.position.set(Ch.door.x + 1.4, 0, Ch.door.z + 0.6); Ch.vicar.g.rotation.y = 0.4; } else if (Ch.vicar) { Ch.vicar.g.position.set(Ch.pulpit.x, 0.0, Ch.pulpit.z); Ch.vicar.g.rotation.y = 0; }
  for (const S of [Ch.bride, Ch.groom]) if (S) S.g.visible = wedding;
  const near = K.near(Ch.door.x, Ch.door.z, 150);
  // the bells: a quarter to the service, and when the happy couple come out
  const bells = (weekdayOf(day) === 6 && hr >= 9.6 && hr < 10) || (wedding && hr >= 13.1);
  MD_STATE.bellT = (MD_STATE.bellT || 0) - dt;
  if (bells && near && MD_STATE.bellT <= 0) { MD_STATE.bellT = 0.9; K.sfx.churchBell(); }
  if (!near) return;
  const folk = K.hunters().filter((h) => h.mdChurch && !h.dead);
  MD_STATE.churchT = (MD_STATE.churchT || 0) - dt;
  if (MD_STATE.churchT <= 0) {
    MD_STATE.churchT = 1;
    if (service) {
      for (const h of folk) if (!h.act && h.state !== 'chase') mdTakePew(h, K);
      if (folk.length < 14) { const h = K.spawnCivAt(Ch.door.x + mr(-3, 3), Ch.plot.z1 + mr(1, 6)); if (h) { h.mdChurch = true; h.job = null; mdTakePew(h, K); } }
      if (Ch.vicar && K.near(Ch.pulpit.x, Ch.pulpit.z, 25) && Math.random() < 0.3) K.say({ g: Ch.vicar.g }, mpick(MD_VICAR));
      const sat = folk.filter((h) => h.act && h.act.kind === 'sit' && h.act.spot && h.act.spot.church);
      if (sat.length && Math.random() < 0.15 && K.near(Ch.pulpit.x, Ch.pulpit.z, 25)) K.say(mpick(sat), mpick(MD_PEW));
      if (K.near(Ch.pulpit.x, Ch.pulpit.z, 40) && Math.random() < 0.35) K.sfx.organ();
    } else if (wedding) {
      for (const h of folk) if (!h.act && h.state !== 'chase') mdWeddingGuest(h, K);
      if (folk.length < 12) { const h = K.spawnCivAt(Ch.door.x + mr(-4, 4), Ch.plot.z1 + mr(1, 5)); if (h) { h.mdChurch = true; h.job = Math.random() < 0.12 ? 'tourist' : null; mdWeddingGuest(h, K); } }
      if (folk.length && Math.random() < 0.3 && K.near(Ch.door.x, Ch.door.z, 30)) K.say(mpick(folk), mpick(MD_WED));
    } else for (const h of folk) { h.mdChurch = false; if (h.act && h.act.spot && h.act.spot.church) K.lifeGo(h, 'walk', Ch.door.x + mr(-2, 2), Ch.plot.z1 + mr(3, 8), null, 0.5); }
  }
  // confetti over the happy couple
  if (wedding && hr >= 13 && K.near(Ch.door.x, Ch.door.z, 40)) {
    MD_STATE.confT = (MD_STATE.confT || 0) - dt;
    if (MD_STATE.confT <= 0) { MD_STATE.confT = 0.12; MD_STATE.confetti++; emitPuff(Ch.door.x + mr(-1.5, 1.5), mr(2.2, 3), Ch.door.z + 1.6 + mr(-1, 1), { life: 1.6, vy: -0.6, vx: mr(-0.5, 0.5), vz: mr(-0.5, 0.5), size0: 0.12, size1: 0.12, alpha: 0.95, color: mpick([0xff8ad0, 0xffffff, 0x8ad0ff, 0xfff08a, 0xb08aff]) }); }
  }
}
function mdTakePew(h, K) {
  const free = church.pews.filter((s) => !s.taken); if (!free.length) return false;
  const s = mpick(free); s.taken = h;
  return K.lifeGo(h, 'sit', s.x, s.z, s.face, mr(30, 60), { spot: s, maxGo: 40 });
}
function mdWeddingGuest(h, K) {
  const a = mr(-1.3, 1.3), r = mr(3, 6), Ch = church;
  const x = Ch.door.x + Math.sin(a) * r, z = Ch.door.z + 1.6 + Math.cos(a) * r;
  return K.lifeGo(h, Math.random() < 0.5 ? 'cheer' : 'watch', x, z, Math.atan2(Ch.door.x - x, Ch.door.z + 1.6 - z), mr(8, 20), { maxGo: 35 });
}

// =====================================================================
// The car boot sale
// =====================================================================
const MD_BOOT_GOODS = [
  { id: 'cb_tapes', name: 'BOX OF OLD TAPES', price: 1, desc: 'Forty hours of someone else\'s holiday. Absolutely no use to you.', junkMsg: 'YOU NOW OWN A LOT OF HOLIDAY' },
  { id: 'cb_clock', name: 'WIND-UP ALARM CLOCK', price: 2, desc: 'Set it, throw it, let it ring (T to throw).', junk: ['clock'] },
  { id: 'cb_bangers', name: 'LEFTOVER FIREWORKS', price: 3, desc: 'Two bangers from last November. Probably fine.', junk: ['banger', 'banger'] },
  { id: 'cb_bottles', name: 'CRATE OF EMPTY BOTTLES', price: 1, desc: 'Three bottles. For throwing, not returning.', junk: ['bottle', 'bottle', 'bottle'] },
  { id: 'cb_wig', name: 'SOMEONE\'S NAN\'S WIG', price: 4, desc: 'Tight grey curls. Smells of lavender. A decent disguise.', costume: true },
  { id: 'cb_specs', name: 'READING GLASSES (+3)', price: 2, desc: 'Everything is blurry, including your face to other people.', costume: true },
  { id: 'cb_anorak', name: 'VINTAGE ANORAK', price: 5, desc: 'Beige, hooded, deeply unremarkable. Nobody looks twice at an anorak.', costume: true },
  { id: 'cb_biscuits', name: 'TIN OF BISCUITS', price: 2, desc: 'Half full. Patches you up (+15).', heal: 15 },
  { id: 'cb_map', name: 'AN OLD TOWN MAP', price: 2, desc: 'Somebody\'s drawn all the good hiding places on it in biro. Marks them on your map today.', map: true },
  { id: 'cb_mystery', name: 'MYSTERY BOX', price: 3, desc: 'Taped shut. Could be anything. Probably cables.', mystery: true },
  { id: 'cb_flask', name: 'A FLASK OF TEA', price: 2, desc: 'Still hot. Calms you right down (+8).', heal: 8, cool: true },
];
const MD_COSTUME = [
  { id: 'cb_wig', slot: 'head', cat: 'carboot', name: 'NAN\'S WIG', price: 4, dg: 0.2, desc: 'Tight grey curls.' },
  { id: 'cb_specs', slot: 'eyes', cat: 'carboot', name: 'READING GLASSES', price: 2, dg: 0.12, desc: 'Thick lenses.' },
  { id: 'cb_anorak', slot: 'body', cat: 'carboot', name: 'VINTAGE ANORAK', price: 5, dg: 0.22, desc: 'Beige and hooded.' },
  { id: 'md_scarf', slot: 'face', cat: 'match', name: 'HARRIERS SCARF', price: 8, dg: 0.16, desc: 'Red and white, up to the nose. On match day you are one of hundreds.' },
  { id: 'md_bobble', slot: 'head', cat: 'match', name: 'HARRIERS BOBBLE HAT', price: 7, dg: 0.15, desc: 'Red with a white bobble.' },
];
for (const c of MD_COSTUME) if (!CATALOG.costume.some((o) => o.id === c.id)) CATALOG.costume.push(c);
function mdStock(T, day) {
  if (T.day !== day) { T.day = day; const pool = MD_BOOT_GOODS.slice(); T.stock = []; for (let i = 0; i < 4 && pool.length; i++) T.stock.push(pool.splice(Math.floor(mdHash(day, T.i, i) * pool.length), 1)[0]); }
  return T.stock;
}
function mdMenu(kind, K, T) {
  const P = K.player;
  const owned = (it) => { const C = MD_COSTUME.find((c) => c.id === it.id); return C && P.outfit[C.slot] === it.id; };
  const items = () => kind === 'tea' ? MD_TEA : kind === 'scarves' ? MD_SCARVES : mdStock(T, K.G.day);
  return {
    cash: () => P.cash,
    items,
    state: (it) => (owned(it) ? 'owned' : it.prog && MD_STATE.progDay === K.G.day ? 'owned' : ''),
    buy(it) {
      if (owned(it)) return 'YOU\'RE ALREADY WEARING IT';
      if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`;
      P.cash -= it.price; K.sfx.cash();
      if (kind === 'boot') MD_STATE.boots++;
      if (it.heal) { P.hp = Math.min(100, P.hp + it.heal); if (it.cool) K.coolHeat(5); if (it.id === 'md_pie') MD_STATE.pies++; if (it.id === 'md_tea') MD_STATE.teas++; return mpick(['LOVELY', 'GET THAT DOWN YOU', 'MUCH BETTER', 'SCALDING. WORTH IT']); }
      if (it.junk) { for (const j of it.junk) K.addJunk(j); return `${it.name}: IN YOUR POCKETS. T TO THROW`; }
      if (it.junkMsg) return it.junkMsg;
      if (it.map) { MK_STATE.mapDay = K.G.day; return 'HIDING PLACES MARKED ON YOUR MAP (TODAY ONLY)'; }
      if (it.prog) { MD_STATE.progDay = K.G.day; return 'NOSE IN THE PROGRAMME. NOBODY SEES YOUR FACE AT THE GROUND TODAY'; }
      if (it.raffle) { if (Math.random() < 0.18) { K.addCash(25); return 'YOUR NUMBER CAME UP! $25'; } return 'NOT YOUR NUMBER. NEVER IS'; }
      if (it.mystery) {
        const r = Math.random();
        if (r < 0.3) return 'CABLES. IT\'S ALWAYS CABLES';
        if (r < 0.5) { K.addCash(12); return 'AN OLD BISCUIT TIN WITH $12 IN IT!'; }
        if (r < 0.7) { K.addJunk('banger'); K.addJunk('clock'); return 'A BANGER AND AN ALARM CLOCK'; }
        if (r < 0.85) return K.wear('cb_wig');
        P.hp = Math.min(100, P.hp + 20); return 'A FRUIT CAKE. STILL GOOD (+20)';
      }
      if (MD_COSTUME.some((c) => c.id === it.id)) return K.wear(it.id);
      return 'THANKS!';
    },
  };
}
const MD_TEA = [
  { id: 'md_pie', name: 'STEAK PIE', price: 4, heal: 25, desc: 'Molten in the middle. Patches you up (+25).' },
  { id: 'md_tea', name: 'CUP OF TEA', price: 2, heal: 6, cool: true, desc: 'Stewed. Calms you down (+6, lowers the heat a bit).' },
  { id: 'md_prog', name: 'MATCHDAY PROGRAMME', price: 3, prog: true, desc: 'Bury your nose in it. Nobody at the ground sees your face today.' },
  { id: 'md_raffle', name: 'HALF-TIME DRAW TICKET', price: 1, raffle: true, desc: 'Win $25. Probably won\'t.' },
];
const MD_SCARVES = [
  { id: 'md_scarf', name: 'HARRIERS SCARF', price: 8, desc: 'Red and white, up to the nose. On match day you are one of hundreds.' },
  { id: 'md_bobble', name: 'HARRIERS BOBBLE HAT', price: 7, desc: 'Red with a white bobble. Matches the scarf.' },
  { id: 'md_prog', name: 'MATCHDAY PROGRAMME', price: 3, prog: true, desc: 'Bury your nose in it. Nobody at the ground sees your face today.' },
];

// =====================================================================
// Using things (E)
// =====================================================================
export function mdUseTarget(K) {
  const P = K.player, day = K.G.day, hr = K.hour;
  if (P.car || P.mode !== 'move' || P.y > 1.2) return null;
  if (P.x < MD_CLEAR.x0 - 5 || P.x > MD_CLEAR.x1 + 5 || P.z < MD_CLEAR.z0 - 5 || P.z > MD_CLEAR.z1 + 8) return null;
  const M = matchNow(day, hr);
  if (M && M.on && M.phase !== 'post') {
    for (const T of ground.turnstiles) if (Math.hypot(P.x - T.x, P.z - T.z) < 1.8) return { kind: 'turnstile' };
    if (Math.hypot(P.x - ground.scarves.x, P.z - ground.scarves.z) < 1.8) return { kind: 'scarves' };
  }
  const boot = !!eventOn('carboot', 'ASHFORD', day, hr);
  if ((M && M.on) || boot) if (Math.hypot(P.x - ground.tea.x, P.z - ground.tea.z) < 1.8) return { kind: 'tea' };
  if (boot) for (const T of carBoot.tables) if (Math.hypot(P.x - T.x, P.z - T.z) < 1.6) return { kind: 'boot', T };
  return null;
}
export function mdUsePrompt(T, K, useK) {
  if (T.kind === 'turnstile') return MD_STATE.ticketDay === K.G.day ? 'You\'ve got a ticket. In you go' : `${useK} to pay at the turnstile ($6)`;
  if (T.kind === 'scarves') return `${useK} to buy a scarf off the man with the table`;
  if (T.kind === 'tea') return `${useK} for the tea bar`;
  if (T.kind === 'boot') return `${useK} to have a rummage on this table`;
  return '';
}
export function mdUse(T, K) {
  const P = K.player;
  if (T.kind === 'turnstile') {
    if (MD_STATE.ticketDay === K.G.day) { K.showMsg('YOU\'VE ALREADY PAID. CLICK CLICK', 1.4); return; }
    if (P.cash < 6) { K.showMsg('IT\'S $6 TO GET IN', 1.6); return; }
    P.cash -= 6; MD_STATE.ticketDay = K.G.day; K.sfx.cash();
    K.showMsg(`IN YOU GO. HARRIERS v ${opponentOn(K.G.day).name}. STAND WITH THE HOME END AND NOBODY LOOKS TWICE`, 3); return;
  }
  if (T.kind === 'scarves') { K.openMenu({ name: 'SCARVES · HATS · PROGRAMMES', kind: 'match', blurbs: ['"SCARVES! HATS! PROGRAMMES!"', '"GET YOUR COLOURS HERE!"', '"ALL PROCEEDS TO THE NEW FLOODLIGHTS."'] }, mdMenu('scarves', K)); return; }
  if (T.kind === 'tea') { K.openMenu({ name: 'THE TEA BAR', kind: 'match', blurbs: ['"PIES ARE HOT, LOVE. VERY HOT."', '"MILK AND SUGAR\'S ON THE SIDE."', '"WE\'VE RUN OUT OF THE CHICKEN ONES."'] }, mdMenu('tea', K)); return; }
  if (T.kind === 'boot') { K.openMenu({ name: 'CAR BOOT SALE', kind: 'boot', blurbs: ['"EVERYTHING ON THIS TABLE A COUPLE OF DOLLARS."', '"IT ALL WORKS. MOSTLY."', '"MAKE ME AN OFFER. NO, NOT THAT ONE."'] }, mdMenu('boot', K, T.T)); return; }
}

// =====================================================================
// How well you blend in here
// =====================================================================
export function mdConspic(K) {
  const P = K.player, day = K.G.day, hr = K.hour;
  if (P.car) return 0;
  if (P.x < MD_CLEAR.x0 - 120 || P.x > MD_CLEAR.x1 + 120 || P.z < MD_CLEAR.z0 - 120 || P.z > MD_CLEAR.z1 + 120) return 0;
  let k = 0;
  const M = matchNow(day, hr);
  if (M && M.on) {
    const inside = mdInGround(P.x, P.z), paid = MD_STATE.ticketDay === day, scarf = P.outfit.face === 'md_scarf' || P.outfit.head === 'md_bobble';
    if (inside && (M.playing || M.phase === 'half' || M.phase === 'pre')) {
      if (paid || scarf) k -= 0.22;
      if (scarf) k -= 0.15;
      if (MD_STATE.progDay === day) k -= 0.08;
      if (MD_STATE.celebT > 0) k -= 0.3; // everyone's looking at the pitch, jumping up and down
    }
    if (M.phase === 'post' && Math.hypot(P.x - ground.cx, P.z - (ground.z1 + 10)) < 110) k -= scarf ? 0.25 : 0.12; // swept along with the crowd going home
  }
  if (eventOn('carboot', 'ASHFORD', day, hr) && P.x > carBoot.x0 - 2 && P.x < carBoot.x1 + 2 && P.z > carBoot.z0 - 2 && P.z < carBoot.z1 + 4) k -= 0.1;
  if (eventOn('church', 'ASHFORD', day, hr) && mdInChurch(P.x, P.z)) k -= P.crouch > 0.5 || P.crouching ? 0.45 : 0.15; // heads bowed
  if (eventOn('wedding', 'ASHFORD', day, hr) && Math.hypot(P.x - church.door.x, P.z - church.door.z) < 14) k -= 0.1;
  return k;
}

// =====================================================================
// Each frame
// =====================================================================
export function updateMatchDay(dt, K) {
  const day = K.G.day, hr = K.hour, P = K.player, G = ground;
  if (!G.built) return;
  buildStaff();
  const M = matchNow(day, hr), near = K.near(G.cx, G.cz, 260);
  // staff on duty on the day
  const onDuty = !!(M && M.on && M.phase !== 'post');
  for (const s of G.stewards) if (s.S) s.S.g.visible = onDuty;
  if (G.seller) G.seller.g.visible = onDuty; if (G.scarfTable) G.scarfTable.visible = onDuty;
  const boot = !!eventOn('carboot', 'ASHFORD', day, hr);
  if (G.teaLady) G.teaLady.g.visible = !!(M && M.on) || boot;
  if (carBoot.group) carBoot.group.visible = boot;
  for (const T of carBoot.tables) if (T.S) T.S.g.visible = boot;
  // floodlights: on for the night match (and dimly glowing otherwise)
  const lit = !!(M && M.on && (M.night || hr >= 18 || hr < 6));
  if (G.lampMat) G.lampMat.color.setHex(lit ? 0xfffbe8 : 0x55554a);
  // the crowd on the terraces
  const C = G.crowd, showCrowd = !!(M && (M.playing || M.phase === 'half' || (M.phase === 'pre' && hr >= M.ko - 0.6))) && near;
  if (C) {
    if (C.shown !== showCrowd) { C.shown = showCrowd; C.body.visible = C.head.visible = showCrowd; if (showCrowd) mdPlaceCrowd(K.time, 0); }
    if (MD_STATE.celebT > 0) { MD_STATE.celebT -= dt; if (showCrowd) mdPlaceCrowd(K.time, Math.min(1, MD_STATE.celebT)); if (MD_STATE.celebT <= 0 && showCrowd) mdPlaceCrowd(K.time, 0); }
  }
  // the match
  if (M && M.on) {
    const R = matchRec(day);
    if (!G.announced || G.announced !== day) {
      if (K.near(G.cx, G.cz, 300) && hr >= M.E.from) { G.announced = day; K.banner(`${M.E.name}<small>HARRIERS v ${R.opp.full} · ${M.night ? 'KICK-OFF 7, UNDER THE FLOODLIGHTS' : 'KICK-OFF 2:30'} · PAY AT THE TURNSTILES ($6)</small>`, 4); }
    }
    const due = M.playing ? R.goals.find((q) => !q.done && q.min <= M.minute) : null;
    if (M.playing && near) {
      mdBuildTeams(R);
      if (!mdGame.active || mdGame.day !== day || mdGame.half !== M.phase) { const fresh = !mdGame.active || mdGame.day !== day; mdShowGame(true); mdGame.day = day; mdGame.half = M.phase; mdGame.chance = null; if (fresh || M.phase === 'second') { mdKickoff(M.phase === 'second' ? 1 : 0); if (K.near(G.cx, G.cz, 120)) K.sfx.whistle(); } }
      mdSimStep(dt, R, K, due);
      for (const Pl of mdGame.players) mdPoseRunner(Pl, dt);
      mdPoseRunner(mdGame.ref, dt);
      mdGame.ball.position.set(mdGame.bx, mdGame.by, mdGame.bz);
    } else {
      if (mdGame.active) { mdShowGame(false); if (M.phase === 'half' && near) K.sfx.whistle(); }
      if (due) { if (due.home) R.home++; else R.away++; due.done = true; } // goals still go in when you're not watching
    }
    if (M.phase === 'post' && !R.ft) {
      R.ft = true; for (const q of R.goals) if (!q.done) { q.done = true; if (q.home) R.home++; else R.away++; }
      MD_STATE.lastResult = { day, home: R.home, away: R.away, opp: R.opp.full };
      if (K.near(G.cx, G.cz, 220)) { K.sfx.whistle(); K.banner(`FULL TIME<small>HARRIERS ${R.home} - ${R.away} ${R.opp.full}. THE CROWD POURS OUT ONTO ROUTE 9</small>`, 3.5); }
    }
    mdUpdateBoard(R, M.playing ? `${M.minute}'` : M.phase === 'half' ? 'HALF TIME' : M.phase === 'post' ? 'FULL TIME' : 'KO ' + (M.night ? '7:00' : '2:30'));
  } else { if (mdGame.active) mdShowGame(false); mdUpdateBoard(null, ''); }
  mdUpdateFans(dt, K, M);
  mdTicketCheck(dt, K, M);
  mdUpdateChurch(dt, K);
  // car boot: browsers wander along the tables
  if (boot && K.near(carBoot.x0 + 30, carBoot.z0, 150)) {
    MD_STATE.bootT = (MD_STATE.bootT || 0) - dt;
    if (MD_STATE.bootT <= 0) {
      MD_STATE.bootT = 1.2;
      const folk = K.hunters().filter((h) => h.mdBoot && !h.dead);
      for (const h of folk) if (!h.act && h.state !== 'chase') { const T = mpick(carBoot.tables); K.lifeGo(h, 'browse', T.x + mr(-0.8, 0.8), T.z + mr(0, 0.5), Math.PI, mr(6, 14), { maxGo: 30 }); }
      if (folk.length < 12) { const T = mpick(carBoot.tables), h = K.spawnCivAt(T.x + mr(-3, 3), T.z + mr(1, 3)); if (h) { h.mdBoot = true; h.job = null; K.lifeGo(h, 'browse', T.x, T.z + 0.3, Math.PI, mr(6, 14), { maxGo: 30 }); } }
    }
  } else for (const h of K.hunters()) if (h.mdBoot && !boot) h.mdBoot = false;
}
// what our crowd does when they've finished what they were doing (the town calendar asks us first)
export function mdPlan(h, hr, K) {
  if (h.mdFan) { const M = matchNow(K.G.day, hr); if (!M || !M.on) { h.mdFan = false; return false; } if (M.phase === 'post') return mdSendHome(h, K); return mdSendToTerrace(h, K); }
  if (h.mdChurch) { if (eventOn('church', 'ASHFORD', K.G.day, hr)) return mdTakePew(h, K); if (eventOn('wedding', 'ASHFORD', K.G.day, hr)) return mdWeddingGuest(h, K); h.mdChurch = false; return false; }
  return false;
}
export function resetMatchDay() {
  MD_STATE.ticketDay = 0; MD_STATE.progDay = 0; MD_STATE.warned = 0; MD_STATE.warnT = 0; MD_STATE.celebT = 0; MD_STATE.goals = 0; MD_STATE.matches = {}; MD_STATE.lastResult = null; MD_STATE.pies = 0; MD_STATE.teas = 0; MD_STATE.boots = 0; MD_STATE.confetti = 0;
  ground.announced = 0; ground.boardKey = null; mdShowGame(false);
  for (const w of ground.watch) w.taken = null;
  for (const T of carBoot.tables) T.day = 0;
}
export function mdDiaryBits(K) {
  const bits = [];
  if (MD_STATE.ticketDay === K.G.day) bits.push('A HARRIERS TICKET');
  if (MD_STATE.lastResult) { const R = MD_STATE.lastResult; bits.push(`LAST RESULT: HARRIERS ${R.home}-${R.away} ${R.opp}`); }
  return bits;
}
export const matchDayDebug = () => ({ built: ground.built, watch: ground.watch.length, crowd: ground.crowd ? ground.crowd.slots.length : 0, crowdShown: ground.crowd ? ground.crowd.shown : false, players: mdGame.players.length, active: mdGame.active, ball: { x: mdGame.bx, z: mdGame.bz }, pews: church.pews.length, graves: church.graves.length, lockers: clubhouse.lockers.length, tables: carBoot.tables.length, staff: mdStaff.length, ...MD_STATE });
export const mdInternals = { mdGame, matchRec, mdKickoff, mdGoal, mdMenu, MD_BOOT_GOODS, mdStock, mdStaff };
