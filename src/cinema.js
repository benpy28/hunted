// THE PICTUREDROME: a two-screen picture house on its own car park off Route 9, between PORT HALDEN and
// ASHFORD.
//  - Two screens, four showings a day on each, from lunchtime till late. Buy a ticket at the box office,
//    get popcorn at the kiosk, then find a seat in the dark. With the lights down and everyone staring at
//    the screen, a face in row J is the hardest face in the county to spot.
//  - The usher patrols SCREEN 1 with a torch. No ticket and that torch finds you: first a warning, then the
//    radio. Stand about in the aisle during the film and the whole row tells you to sit down.
//  - The adverts before the film are local: the ice cream man, the Harriers, the car boot... and, once
//    you're properly famous, a police appeal with your face on it, twelve feet high.
//  - Six films of its own (none of them any good), a different pair every day.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene, textTex } from './core.js';
import { clearings, propBuf, glowBuf, groundBuf, markBuf, addCollider, addRoof, worldHooks, navOpen, keepClear, parkedSpots } from './world.js';
import { interiorZones } from './interiors.js';
import { buildPerson, lam, SKINS, HAIRS } from './people.js';
import { CATALOG } from './shops.js';
import { MK_STATE } from './market.js';
import { hidePiece } from './gigs.js';

// =====================================================================
// Where everything is
// =====================================================================
export const CN_CLEAR = { x0: 250, x1: 342, z0: 13, z1: 104 };
clearings.push(CN_CLEAR); // the countryside generator leaves this patch empty for us
export const cinema = {
  name: 'THE PICTUREDROME', x0: 262, x1: 330, z0: 38, z1: 96, foyerZ: 54, door: { x: 296, z: 37.2 },
  box: { x: 305, z: 46.4 }, kiosk: { x: 275, z: 46.4 }, usherDoor: { x: 264.2, z: 52.2 },
  screens: [], cupboards: [], built: false,
};
export const cnRoofs = []; // under cover from the aircraft
export const CN_STATE = { tickets: {}, warned: 0, warnT: 0, shushT: 0, seat: null, sat: 0, popcorn: 0, appealSeen: 0, ticketsSold: 0, msgT: 0, films: 0 };
const cnInBox = (x, z, B, pad = 0) => x > B.x0 + pad && x < B.x1 - pad && z > B.z0 + pad && z < B.z1 - pad;
export const inCinema = (x, z) => cnInBox(x, z, cinema, 0.2);
export const inFoyer = (x, z) => x > cinema.x0 && x < cinema.x1 && z > cinema.z0 && z < cinema.foyerZ;
export function screenAt(x, z) { for (const S of cinema.screens) if (cnInBox(x, z, S, 0.2)) return S; return null; }

// =====================================================================
// What's on
// =====================================================================
export const FILMS = [
  { title: 'ATTACK OF THE 50FT PIGEON', genre: 'monster', cert: 'PG', blurb: 'IT CAME FOR THE CHIPS. IT STAYED FOR THE CITY.' },
  { title: 'LOVE ON ROUTE 9', genre: 'romance', cert: 'PG', blurb: 'TWO HEARTS. ONE LAY-BY.' },
  { title: 'SPACE DENTIST II', genre: 'scifi', cert: '12', blurb: 'IN SPACE, NO ONE CAN HEAR YOU FLOSS.' },
  { title: 'NIGHT OF THE SOGGY CHIPS', genre: 'horror', cert: '15', blurb: 'THE VINEGAR WAS ONLY THE BEGINNING.' },
  { title: 'THE 4:15 TO NOWHERE', genre: 'drama', cert: '12', blurb: 'HE MISSED THE BUS. HE FOUND HIMSELF.' },
  { title: 'HARRIERS: THE MOVIE', genre: 'sport', cert: 'U', blurb: 'NINETY MINUTES. ONE PIE. NO HOPE.' },
];
// showings: each screen runs its own timetable. 'doors' half an hour before, adverts, the film, the credits.
const CN_TIMES = [[12, 15, 18, 21], [13.5, 16.5, 19.5, 22.2]];
const CN_LEN = [1.8, 1.5];
export const cnOpenHours = (hr) => hr >= 11 && hr < 24;
export const filmOn = (screen, day) => FILMS[(day * 2 + screen * 3) % FILMS.length];
export function showNow(screen, day, hr) {
  for (const start of CN_TIMES[screen]) {
    const end = start + CN_LEN[screen];
    if (hr < start - 0.35 || hr >= end + 0.1) continue;
    const film = filmOn(screen, day), key = `${day}:${screen}:${start}`;
    let phase = 'doors';
    if (hr >= end) phase = 'out'; else if (hr >= end - 0.08) phase = 'credits'; else if (hr >= start + 0.14) phase = 'film'; else if (hr >= start) phase = 'ads';
    return { screen, start, end, film, key, phase, dark: phase === 'ads' || phase === 'film' || phase === 'credits', t: clamp((hr - start - 0.14) / (CN_LEN[screen] - 0.22), 0, 1) };
  }
  return null;
}
// the next few showings (for the box office)
function nextShows(day, hr) {
  const out = [];
  for (let s = 0; s < 2; s++) for (const start of CN_TIMES[s]) if (start + 0.14 > hr) out.push({ screen: s, start, film: filmOn(s, day), key: `${day}:${s}:${start}` });
  return out.sort((a, b) => a.start - b.start).slice(0, 5);
}
const cnFmt = (h) => { const hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}${hh < 12 ? 'AM' : 'PM'}`; };
export const showTime = cnFmt;
export const hasTicket = (key, day) => !!CN_STATE.tickets[key] && key.startsWith(day + ':');

// =====================================================================
// Building it (just before the world is baked)
// =====================================================================
const CN_CREAM = 0xeadcc0, CN_RED = 0xa0202a, CN_DARK = 0x3a1a24, CN_CARPET = 0x5a1a2a, CN_SEAT = 0x9a1a2a, CN_GOLD = 0xd8b050;
function cnWall(x0, x1, z0, z1, h, col, y0 = 0) { propBuf.box(x0, x1, y0, h, z0, z1, col); addCollider(x0, x1, z0, z1, h, { y0 }); }
// a wall along x (at z = fixed) or along z (at x = fixed) with doorway gaps cut out of it
function cnWallGaps(axis, fixed, a0, a1, gaps, h, col, t = 0.15, lintel = 2.4) {
  let a = a0;
  for (const [g0, g1] of [...gaps, [a1, a1]]) {
    if (g0 > a) { if (axis === 'x') cnWall(a, g0, fixed - t, fixed + t, h, col); else cnWall(fixed - t, fixed + t, a, g0, h, col); }
    if (g1 > g0 && h > lintel) { if (axis === 'x') propBuf.box(g0, g1, lintel, h, fixed - t, fixed + t, col); else propBuf.box(fixed - t, fixed + t, lintel, h, g0, g1, col); }
    a = g1;
  }
}
function cnPlane(w, h, tex, x, y, z, ry = 0, basic = true) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
}
const cnLightMat = new THREE.MeshBasicMaterial({ color: 0xffe8b0 });
const cnLights = [];
function cnSconce(x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), cnLightMat); m.position.set(x, y, z); scene.add(m); cnLights.push(m); }

function buildFoyer() {
  const C = cinema, fz = C.foyerZ, H = 6;
  // the front: glass either side of the doors, a canopy, the big name up top
  for (const [a, b] of [[C.x0, 290], [302, C.x1]]) {
    propBuf.box(a, b, 0, 0.6, C.z0 - 0.15, C.z0 + 0.15, CN_RED); addCollider(a, b, C.z0 - 0.15, C.z0 + 0.15, H, { y0: 0 });
    propBuf.box(a, b, 0.6, 3.2, C.z0 - 0.05, C.z0 + 0.05, 0x9ac8e0, { glass: true });
    for (let x = a + 2; x < b - 0.5; x += 2.4) propBuf.box(x - 0.06, x + 0.06, 0.6, 3.2, C.z0 - 0.1, C.z0 + 0.1, CN_GOLD);
    propBuf.box(a, b, 3.2, H, C.z0 - 0.15, C.z0 + 0.15, CN_CREAM);
  }
  propBuf.box(290, 302, 3.2, H, C.z0 - 0.15, C.z0 + 0.15, CN_CREAM);
  for (const x of [290, 302]) propBuf.box(x - 0.12, x + 0.12, 0, 3.2, C.z0 - 0.2, C.z0 + 0.2, CN_GOLD);
  for (const x of [293.8, 298.2]) propBuf.box(x - 0.04, x + 0.04, 0, 3.0, C.z0 - 0.05, C.z0 + 0.05, CN_GOLD); // door frames (always open, it's a cinema)
  navOpen.push({ x0: 290.4, x1: 301.6, z0: C.z0 - 1.5, z1: C.z0 + 1.5 }); keepClear.push({ x0: 289, x1: 303, z0: C.z0 - 6, z1: C.z0 + 2 });
  // the canopy over the doors, edged in bulbs, with what's on along the front
  propBuf.box(282, 310, 3.6, 4.1, 33.6, C.z0, CN_RED, { bottom: true }); addRoof(282, 310, 33.6, C.z0, 4.1, { y0: 3.6 });
  for (let x = 282.3; x < 310; x += 0.7) glowBuf.box(x - 0.06, x + 0.06, 3.5, 3.6, 33.62, 33.74, 0xfff0b0);
  C.marquee = cnPlane(26, 0.95, cnMarqueeTex(1), 296, 4.6, 33.55, Math.PI);
  propBuf.box(282.5, 309.5, 4.1, 5.15, 33.65, 33.7, 0x1a1a1e);
  // the name, up on a tall fin above the canopy
  propBuf.box(294.8, 297.2, H, 13, C.z0 - 0.8, C.z0 + 0.2, CN_RED);
  const fin = textTex(128, 640, '#a0202a', '#fff0b0', ['P', 'I', 'C', 'T', 'U', 'R', 'E'], 'bold 76px Georgia, serif', false);
  cnPlane(2.1, 6.6, fin, 296, 9.5, C.z0 - 0.82, Math.PI);
  cnPlane(18, 1.6, textTex(1024, 96, '#eadcc0', '#a0202a', ['THE PICTUREDROME'], 'bold 72px Georgia, serif', false), 296, 5.2, C.z0 - 0.17, Math.PI, false);
  // posters in light boxes either side of the doors
  C.posters = [];
  for (const [x, k] of [[285, 0], [307, 1], [270, 2], [322, 3]]) { const m = cnPlane(2.0, 2.8, cnPosterTex(FILMS[k]), x, 1.9, C.z0 - 0.18, Math.PI); C.posters.push(m); glowBuf.box(x - 1.15, x + 1.15, 0.4, 3.4, C.z0 - 0.17, C.z0 - 0.16, 0xfff8e0); }
  // inside: carpet, ceiling lights, the box office and the kiosk
  groundBuf.flat(C.x0 + 0.2, C.x1 - 0.2, C.z0 + 0.2, fz, 0.02, CN_CARPET);
  for (let x = C.x0 + 4; x < C.x1 - 2; x += 8) glowBuf.box(x - 1.2, x + 1.2, H - 0.08, H - 0.03, 44, 48, 0xfff2d0);
  // box office (right) and kiosk (left): long counters with staff behind
  for (const [a, b, col] of [[300, 310, CN_RED], [268, 282, 0x2a2a6a]]) {
    propBuf.box(a, b, 0, 1.1, 47, 47.8, col); addCollider(a, b, 47, 47.8, 1.1, { y0: 0 }); propBuf.box(a - 0.05, b + 0.05, 1.1, 1.16, 46.9, 47.9, CN_GOLD);
  }
  glowBuf.box(301, 309, 1.16, 1.18, 47.1, 47.7, 0xf0f0f0); // ticket printer and the glass top
  propBuf.box(269, 271.6, 0, 2.2, 49, 50.4, 0xd8d8e0); glowBuf.box(269.2, 271.4, 1.0, 2.0, 48.98, 49.0, 0xffe070); // popcorn machine
  propBuf.box(273, 275, 0, 1.8, 51.8, 53.6, 0x3a6aaa); glowBuf.box(273.2, 274.8, 0.8, 1.6, 51.78, 51.8, 0x7ae0ff); // slush machine
  propBuf.box(277, 281, 0.9, 1.1, 50.2, 51.2, 0xd8d8d8); for (let x = 277.2; x < 281; x += 0.5) propBuf.box(x, x + 0.4, 1.1, 1.25, 50.4, 51.0, mpick([0xe04a6a, 0xf0d040, 0x6ae04a, 0xf08ab0, 0x8a4ad0])); // pick and mix
  const menu = textTex(512, 128, '#1a1a2a', '#ffe070', ['POPCORN · HOT DOGS · SLUSH', 'PICK & MIX · 3D GLASSES'], 'bold 34px Arial Black, Arial', false);
  cnPlane(10, 2.5, menu, 275, 3.6, fz - 0.17, Math.PI);
  const tix = textTex(512, 128, '#a0202a', '#fff0b0', ['BOX OFFICE', 'ADULTS $7 · MATINEES $5'], 'bold 38px Georgia, serif', false);
  cnPlane(8, 2, tix, 305, 3.6, fz - 0.17, Math.PI);
  // a store cupboard behind the kiosk you can squeeze into, and a claw machine nobody has ever won
  C.cupboards.push(hidePiece('cupboard', 284, fz - 0.45, 0, -1, 0.6, 0.3, 2.1, 0));
  propBuf.box(318, 319.6, 0, 1.0, 40.4, 42.0, 0xe04ad0); propBuf.box(318, 319.6, 1.0, 2.2, 40.4, 42.0, 0x9ac8e0, { glass: true }); propBuf.box(318, 319.6, 2.2, 2.4, 40.4, 42.0, 0xe04ad0); glowBuf.box(318.05, 319.55, 2.25, 2.35, 40.39, 40.41, 0xffd0ff); addCollider(318, 319.6, 40.4, 42.0, 2.4, { y0: 0 });
  for (const [x, z] of [[322, 46], [326, 46], [289, 44]]) { propBuf.box(x - 1.2, x + 1.2, 0.4, 0.5, z - 0.35, z + 0.35, CN_RED); propBuf.box(x - 1.2, x + 1.2, 0.5, 1.0, z + 0.25, z + 0.35, CN_RED); addCollider(x - 1.2, x + 1.2, z - 0.35, z + 0.35, 0.5, { y0: 0 }); } // red velvet benches
  interiorZones.push({ x0: C.x0, x1: C.x1, z0: C.z0, z1: fz, y0: -0.5, y1: H - 0.2, name: 'THE PICTUREDROME FOYER' });
  // the foyer roof
  propBuf.box(C.x0 - 0.3, C.x1 + 0.3, H, H + 0.3, C.z0 - 0.3, fz, 0x4a3a3e, { bottom: true }); addRoof(C.x0 - 0.3, C.x1 + 0.3, C.z0 - 0.3, fz, H + 0.3, { y0: H });
  cnRoofs.push({ x0: C.x0, x1: C.x1, z0: C.z0, z1: fz, h: H });
  cnWall(C.x0 - 0.3, C.x0, C.z0, fz, H, CN_CREAM); cnWall(C.x1, C.x1 + 0.3, C.z0, fz, H, CN_CREAM); // the foyer's side walls
  // the back wall of the foyer, with a door into each screen
  cnWallGaps('x', fz, C.x0, C.x1, [[262.6, 265.4], [312.6, 315.4]], 10, CN_CREAM);
  navOpen.push({ x0: 262.4, x1: 265.6, z0: fz - 1.2, z1: fz + 1.2 }, { x0: 312.4, x1: 315.6, z0: fz - 1.2, z1: fz + 1.2 });
  for (const [x, n] of [[264, 'SCREEN 1'], [314, 'SCREEN 2']]) { cnPlane(2.6, 0.5, textTex(256, 48, '#1a1a1e', '#fff0b0', [n], 'bold 32px Arial Black, Arial', false), x, 2.75, fz - 0.17, Math.PI); glowBuf.box(x - 0.4, x + 0.4, 2.55, 2.6, fz - 0.2, fz - 0.17, 0x6aff6a); }
}
// one auditorium: a flat side aisle in from the foyer, raked rows of seats stepping up away from the screen,
// a strip of floor in front of the screen, the screen itself on the far wall
function buildScreen(S) {
  const H = 10, rows = S.rows, xa = S.x0 + 3.1, xb = S.x1 - 0.2, zr0 = S.z0 + 3, zr1 = S.z1 - 8, d = (zr1 - zr0) / rows, step = 0.3;
  groundBuf.flat(S.x0 + 0.1, S.x1 - 0.1, S.z0 + 0.1, S.z1 - 0.1, 0.02, 0x2a1418);
  S.seats = []; S.rowsAt = [];
  for (let k = 0; k < rows; k++) {
    const z1 = zr1 - k * d, z0 = k === rows - 1 ? S.z0 + 0.2 : z1 - d, top = step * (k + 1);
    propBuf.box(xa, xb, 0, top, z0, z1, k % 2 ? CN_CARPET : 0x4a1622); addCollider(xa, xb, z0, z1, top, { y0: 0 });
    glowBuf.box(xa, xa + 0.6, top - 0.02, top + 0.005, z1 - 0.08, z1 - 0.02, 0xffd890); // the little step light at the end of each row
    S.rowsAt.push({ z0, z1, top });
    const sz0 = z1 - d + 0.12, mid = (xa + xb) / 2;
    for (let x = xa + 0.55; x < xb - 0.4; x += 0.72) {
      if (Math.abs(x - mid) < 0.75) continue; // an aisle down the middle
      propBuf.box(x - 0.3, x + 0.3, top, top + 0.46, sz0 + 0.18, sz0 + 0.72, CN_SEAT);
      propBuf.box(x - 0.3, x + 0.3, top + 0.46, top + 1.05, sz0 + 0.06, sz0 + 0.2, 0x7a1220);
      propBuf.box(x - 0.36, x - 0.3, top + 0.4, top + 0.66, sz0 + 0.1, sz0 + 0.72, 0x2a1a1e);
      S.seats.push({ x, z: sz0 + 1.15, sx: x, sz: sz0 + 0.5, face: 0, top, row: k, taken: null, screen: S.i });
    }
    propBuf.box(xa - 0.05, xa + 0.02, top, top + 0.95, z0, z1, 0x6a5a40); // a rail along the aisle edge
  }
  S.front = { x0: S.x0 + 0.3, x1: S.x1 - 0.3, z0: zr1, z1: S.z1 - 0.3 };
  // walls, roof, exterior
  cnWall(S.x0 - 0.3, S.x0, S.z0, S.z1, H, CN_DARK); cnWall(S.x1, S.x1 + 0.3, S.z0, S.z1, H, CN_DARK); cnWall(S.x0 - 0.3, S.x1 + 0.3, S.z1, S.z1 + 0.3, H, CN_DARK);
  propBuf.box(S.x0 - 0.35, S.x0 - 0.3, 0.4, H, S.z0, S.z1, CN_CREAM); propBuf.box(S.x1 + 0.3, S.x1 + 0.35, 0.4, H, S.z0, S.z1, CN_CREAM); propBuf.box(S.x0 - 0.3, S.x1 + 0.3, 0.4, H, S.z1 + 0.3, S.z1 + 0.35, CN_CREAM);
  for (let z = S.z0 + 4; z < S.z1 - 2; z += 6) { cnSconce(S.x0 + 0.2, 5.5, z); cnSconce(S.x1 - 0.2, 5.5, z); }
  propBuf.box(S.x0 - 0.3, S.x1 + 0.3, H, H + 0.3, S.z0, S.z1 + 0.3, 0x4a3a3e, { bottom: true }); addRoof(S.x0 - 0.3, S.x1 + 0.3, S.z0, S.z1 + 0.3, H + 0.3, { y0: H });
  cnRoofs.push({ x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, h: H });
  interiorZones.push({ x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, y0: -0.5, y1: H - 0.2, name: `${cinema.name} · SCREEN ${S.i + 1}` });
  // the screen, its curtains and a little stage
  const sw = S.x1 - S.x0 - 6, sh = sw * 0.42, sy = 2.2 + sh / 2, sx = (S.x0 + S.x1) / 2;
  propBuf.box(S.x0 + 1.5, S.x1 - 1.5, 0, 0.6, S.z1 - 2.2, S.z1, 0x3a1a1e); addCollider(S.x0 + 1.5, S.x1 - 1.5, S.z1 - 2.2, S.z1, 0.6, { y0: 0 });
  propBuf.box(sx - sw / 2 - 0.4, sx + sw / 2 + 0.4, sy - sh / 2 - 0.3, sy + sh / 2 + 0.3, S.z1 - 0.2, S.z1 - 0.05, 0x111111);
  for (const s of [-1, 1]) propBuf.box(sx + s * (sw / 2 + 0.4) - 1.0, sx + s * (sw / 2 + 0.4) + 1.0, 0.6, sy + sh / 2 + 0.6, S.z1 - 0.6, S.z1 - 0.2, 0x8a1222);
  S.canvas = document.createElement('canvas'); S.canvas.width = 512; S.canvas.height = 216;
  S.tex = new THREE.CanvasTexture(S.canvas); S.tex.colorSpace = THREE.SRGBColorSpace;
  S.screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: S.tex }));
  S.screen.position.set(sx, sy, S.z1 - 0.25); S.screen.rotation.y = Math.PI; scene.add(S.screen);
  // a cupboard in the front corner (spare bulbs, a mop, room for one)
  cinema.cupboards.push(hidePiece('cupboard', S.x1 - 0.55, S.z1 - 3.4, -1, 0, 0.6, 0.3, 2.1, 0));
}
function buildCarPark() {
  const C = cinema, P = CN_CLEAR;
  groundBuf.flat(P.x0, P.x1, P.z0, P.z1, 0.011, 0x5a7d45);
  groundBuf.flat(256, 336, 15, 34, 0.013, 0x4a4a50); // the car park
  groundBuf.flat(292, 300, 7, 15, 0.013, 0x4a4a50); // the way in from Route 9
  groundBuf.flat(258, 334, 34, C.z0, 0.016, 0x8a8590); // a pavement along the front
  for (let x = 258; x <= 334; x += 3.2) if (x < 289 || x > 303) { markBuf.flat(x - 0.06, x + 0.06, 16, 21, 0.02, 0xe8e8e8); markBuf.flat(x - 0.06, x + 0.06, 28, 33, 0.02, 0xe8e8e8); }
  for (const [x, z, h] of [[262, 18.5, Math.PI], [271.6, 30.5, 0], [281.2, 18.5, Math.PI], [313.2, 30.5, 0], [319.6, 18.5, Math.PI], [329.2, 30.5, 0]]) parkedSpots.push({ x: x + 1.6, z, heading: h });
  for (const x of [266, 296, 326]) { propBuf.box(x - 0.08, x + 0.08, 0, 6, 24.5, 24.7, 0x2e3035); glowBuf.box(x - 0.4, x + 0.4, 5.8, 6, 24.2, 25, 0xfff0c4); } // lamp posts
  // a totem sign by the road
  propBuf.box(287.6, 288.4, 0, 4.5, 10.6, 11.4, CN_RED);
  cnPlane(2.4, 3.2, textTex(192, 256, '#a0202a', '#fff0b0', ['THE', 'PICTURE', 'DROME', '2 SCREENS'], 'bold 34px Georgia, serif', false), 288, 4.0, 10.55, Math.PI);
  // hedges round the back so the countryside doesn't stop dead
  for (let x = 252; x < 340; x += 2.4) propBuf.box(x, x + 2.2, 0, 1.3, 100, 101.4, 0x3a6a2a);
}
worldHooks.beforeBake.push(() => {
  const C = cinema;
  C.screens = [
    { i: 0, x0: 262, x1: 308, z0: C.foyerZ, z1: C.z1, rows: 16 },
    { i: 1, x0: 312, x1: 330, z0: C.foyerZ, z1: C.z1, rows: 11 },
  ];
  buildCarPark(); buildFoyer();
  for (const S of C.screens) buildScreen(S);
  cnWall(308.3, 311.7, C.foyerZ, C.z1 + 0.3, 10, CN_DARK); // the projection corridor between the screens (staff only, and bricked up)
  C.built = true;
});

// =====================================================================
// Textures: posters, the marquee, the films themselves
// =====================================================================
function cnPosterTex(F) {
  const c = document.createElement('canvas'); c.width = 200; c.height = 280; const x = c.getContext('2d');
  const bg = { monster: '#3a4a5a', romance: '#e07a9a', scifi: '#1a1a4a', horror: '#1a0a0a', drama: '#4a5a6a', sport: '#c8202a' }[F.genre];
  x.fillStyle = bg; x.fillRect(0, 0, 200, 280);
  x.fillStyle = 'rgba(255,255,255,.15)'; for (let i = 0; i < 6; i++) x.fillRect(0, 40 + i * 30, 200, 2);
  cnDrawFilm(x, 200, 200, F, 0.5, 0.3, true);
  x.fillStyle = '#fff'; x.font = 'bold 18px Georgia, serif'; x.textAlign = 'center';
  const words = F.title.split(' '), lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 14) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; } lines.push(cur.trim());
  lines.forEach((l, i) => x.fillText(l, 100, 214 + i * 20));
  x.font = '10px Arial'; x.fillText(F.blurb, 100, 272);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const cnMarq = { c: null, t: null, day: -1 };
function cnMarqueeTex(day) {
  if (!cnMarq.c) { cnMarq.c = document.createElement('canvas'); cnMarq.c.width = 1024; cnMarq.c.height = 40; cnMarq.t = new THREE.CanvasTexture(cnMarq.c); cnMarq.t.colorSpace = THREE.SRGBColorSpace; }
  if (cnMarq.day !== day) {
    cnMarq.day = day; const x = cnMarq.c.getContext('2d');
    x.fillStyle = '#fff8e0'; x.fillRect(0, 0, 1024, 40); x.fillStyle = '#1a1a1e'; x.font = 'bold 26px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(`NOW SHOWING  ·  1: ${filmOn(0, day).title}  ·  2: ${filmOn(1, day).title}`, 512, 21);
    cnMarq.t.needsUpdate = true;
  }
  return cnMarq.t;
}
// a few seconds of each film, drawn fresh every frame or so (t: 0..1 through the film, k: a wobble clock)
function cnDrawFilm(x, W, H, F, t, k, still = false) {
  const g = F.genre;
  if (g === 'monster') {
    x.fillStyle = still ? 'rgba(0,0,0,0)' : '#8ab0d0'; if (!still) x.fillRect(0, 0, W, H);
    x.fillStyle = '#3a3a48'; for (let i = 0; i < 12; i++) { const bh = 30 + ((i * 37) % 60); x.fillRect(i * W / 12, H - bh, W / 12 - 3, bh); }
    const s = 0.6 + t * 0.6, px = W * (0.2 + 0.6 * ((t * 3) % 1)), py = H - 40 * s; // the pigeon, stomping along
    x.fillStyle = '#7a7a8a'; x.beginPath(); x.ellipse(px, py - 30 * s, 34 * s, 26 * s, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(px + 26 * s, py - 58 * s, 14 * s, 12 * s, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#4a8a6a'; x.fillRect(px + 14 * s, py - 50 * s, 22 * s, 6 * s);
    x.fillStyle = '#e0a020'; x.beginPath(); x.moveTo(px + 38 * s, py - 60 * s); x.lineTo(px + 52 * s, py - 56 * s); x.lineTo(px + 38 * s, py - 52 * s); x.fill();
    x.fillStyle = '#ff3030'; x.fillRect(px + 30 * s, py - 62 * s, 4 * s, 4 * s);
    x.strokeStyle = '#e0a020'; x.lineWidth = 3 * s; const st = Math.sin(k * 8) * 8 * s;
    x.beginPath(); x.moveTo(px - 6 * s, py - 6 * s); x.lineTo(px - 10 * s + st, py + 36 * s); x.moveTo(px + 6 * s, py - 6 * s); x.lineTo(px + 10 * s - st, py + 36 * s); x.stroke();
  } else if (g === 'romance') {
    if (!still) { const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ff9a6a'); gr.addColorStop(1, '#6a3a7a'); x.fillStyle = gr; x.fillRect(0, 0, W, H); }
    x.fillStyle = '#ffd070'; x.beginPath(); x.arc(W / 2, H * 0.62, H * 0.22, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2a1a2a'; x.fillRect(0, H * 0.75, W, H * 0.25);
    const gap = Math.max(4, 60 * (1 - t)); // they drift closer as the film goes on
    for (const s of [-1, 1]) { const px = W / 2 + s * gap; x.fillRect(px - 6, H * 0.5, 12, H * 0.26); x.beginPath(); x.arc(px, H * 0.46, 9, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#ff4a7a'; for (let i = 0; i < 6; i++) { const hx = (W * (i / 6) + k * 30) % W, hy = H * 0.3 - ((k * 20 + i * 17) % 40); x.beginPath(); x.arc(hx - 4, hy, 5, 0, Math.PI * 2); x.arc(hx + 4, hy, 5, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(hx - 9, hy + 1); x.lineTo(hx, hy + 12); x.lineTo(hx + 9, hy + 1); x.fill(); }
  } else if (g === 'scifi') {
    if (!still) { x.fillStyle = '#05051a'; x.fillRect(0, 0, W, H); }
    x.fillStyle = '#fff'; for (let i = 0; i < 60; i++) { const sx = ((i * 97) % W), sy = ((i * 53 + k * 140 * (1 + (i % 3))) % H); x.fillRect(sx, sy, 2, 2 + (i % 3) * 2); }
    const rx = W / 2 + Math.sin(k * 1.3) * W * 0.25, ry = H / 2 + Math.cos(k * 0.9) * 20; // a rocket shaped like a toothbrush
    x.fillStyle = '#e8e8f0'; x.fillRect(rx - 50, ry - 6, 80, 12); x.fillStyle = '#4ac0ff'; for (let i = 0; i < 6; i++) x.fillRect(rx + 30 + i * 4, ry - 18, 3, 12);
    x.fillStyle = '#ff8a2a'; x.beginPath(); x.moveTo(rx - 50, ry - 6); x.lineTo(rx - 70 - Math.random() * 14, ry); x.lineTo(rx - 50, ry + 6); x.fill();
  } else if (g === 'horror') {
    if (!still) { x.fillStyle = '#050505'; x.fillRect(0, 0, W, H); }
    const flick = Math.sin(k * 23) > 0.85 && !still;
    if (flick) { x.fillStyle = '#d8e0ff'; x.fillRect(0, 0, W, H); }
    x.fillStyle = '#e8c860'; for (let i = 0; i < 8; i++) { const cx = W * 0.2 + (i % 4) * W * 0.18, cy = H * 0.55 + Math.floor(i / 4) * 30 + Math.sin(k * 2 + i) * 4; x.save(); x.translate(cx, cy); x.rotate(Math.sin(k + i) * 0.4); x.fillRect(-4, -18, 8, 36); x.restore(); } // the chips
    x.fillStyle = '#ff2020'; for (let i = 0; i < 3; i++) { const ex = W * (0.3 + i * 0.2) + Math.sin(k * 3 + i) * 10, ey = H * 0.25; if (Math.sin(k * 2 + i * 2) > -0.3) { x.fillRect(ex - 8, ey, 5, 3); x.fillRect(ex + 3, ey, 5, 3); } }
  } else if (g === 'drama') {
    if (!still) { x.fillStyle = '#4a5a6a'; x.fillRect(0, 0, W, H); }
    x.strokeStyle = 'rgba(200,220,240,.5)'; x.lineWidth = 1; for (let i = 0; i < 40; i++) { const rx = (i * 41 + k * 200) % W, ry = (i * 29 + k * 300) % H; x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx - 3, ry + 10); x.stroke(); }
    const bx = W * (1.1 - ((t * 2) % 1.4)); x.fillStyle = '#c8282a'; x.fillRect(bx, H * 0.45, W * 0.4, H * 0.35); x.fillStyle = '#9ac8e0'; for (let i = 0; i < 5; i++) x.fillRect(bx + 8 + i * W * 0.075, H * 0.5, W * 0.06, H * 0.1);
    x.fillStyle = '#222'; x.fillRect(W * 0.15, H * 0.5, 10, H * 0.32); x.beginPath(); x.arc(W * 0.15 + 5, H * 0.46, 9, 0, Math.PI * 2); x.fill(); // a man, at a bus stop, in the rain
    x.fillRect(W * 0.08, H * 0.4, 3, H * 0.42); x.fillRect(W * 0.04, H * 0.38, 18, 10);
  } else {
    if (!still) { x.fillStyle = '#4f8a3a'; x.fillRect(0, 0, W, H); }
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.strokeRect(10, 10, W - 20, H - 20); x.beginPath(); x.moveTo(W / 2, 10); x.lineTo(W / 2, H - 10); x.stroke();
    const bx = W / 2 + Math.sin(k * 1.7) * W * 0.4, by = H / 2 + Math.sin(k * 2.3) * H * 0.35;
    x.fillStyle = '#fff'; x.beginPath(); x.arc(bx, by, 6, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 6; i++) { x.fillStyle = i < 3 ? '#c8202a' : '#2a5aa0'; const px = W * (0.2 + (i % 3) * 0.3) + Math.sin(k * 2 + i) * 20, py = H * (i < 3 ? 0.35 : 0.65) + Math.cos(k * 1.5 + i) * 15; x.fillRect(px - 5, py - 10, 10, 20); }
  }
}
const CN_ADS = [
  { bg: '#f4ecd8', fg: '#c8202a', lines: ['MR WHIPPLE\'S ICES', 'FOLLOW THE MUSIC'] },
  { bg: '#c8202a', fg: '#ffffff', lines: ['ASHFORD HARRIERS', 'SATURDAYS 2:30 · TUESDAYS 7'] },
  { bg: '#2a6a3a', fg: '#ffffff', lines: ['CAR BOOT SALE', 'SUNDAY MORNINGS AT THE HARRIERS'] },
  { bg: '#1a2a4a', fg: '#ffd070', lines: ['PLEASE SWITCH OFF', 'YOUR MOBILE PHONES'] },
  { bg: '#2a7ac0', fg: '#ffffff', lines: ['SUDS & BUBBLES', 'SERVICE WASHES · OPEN LATE'] },
];
function cnDrawAppeal(x, W, H, look) {
  x.fillStyle = '#0a1a3a'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff'; x.font = 'bold 26px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('POLICE APPEAL', W * 0.68, H * 0.22); x.font = 'bold 18px Arial'; x.fillText('HAVE YOU SEEN THIS PERSON?', W * 0.68, H * 0.45);
  x.font = '14px Arial'; x.fillText('DO NOT APPROACH. CALL IT IN.', W * 0.68, H * 0.62); x.fillText('THEY COULD BE SITTING NEXT TO YOU', W * 0.68, H * 0.76);
  // a police sketch of you, in whatever you were last seen in
  x.fillStyle = '#e8e0d0'; x.fillRect(W * 0.08, H * 0.12, W * 0.3, H * 0.76);
  x.fillStyle = '#d8b090'; x.beginPath(); x.ellipse(W * 0.23, H * 0.45, W * 0.07, H * 0.2, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#222'; x.fillRect(W * 0.19, H * 0.4, 8, 4); x.fillRect(W * 0.25, H * 0.4, 8, 4); x.fillRect(W * 0.21, H * 0.56, 22, 3);
  if (look.head) { x.fillStyle = '#5a3a2a'; x.fillRect(W * 0.15, H * 0.2, W * 0.16, H * 0.1); }
  if (look.eyes) { x.strokeStyle = '#222'; x.lineWidth = 2; x.strokeRect(W * 0.18, H * 0.37, 14, 10); x.strokeRect(W * 0.245, H * 0.37, 14, 10); }
  if (look.face) { x.fillStyle = '#5a3a2a'; x.fillRect(W * 0.19, H * 0.5, 30, 8); }
  x.fillStyle = '#2a3a5a'; x.fillRect(W * 0.13, H * 0.66, W * 0.2, H * 0.22);
}
function cnDrawScreen(S, M, K) {
  const x = S.canvas.getContext('2d'), W = S.canvas.width, H = S.canvas.height;
  if (!M || M.phase === 'doors' || M.phase === 'out') {
    x.fillStyle = '#1a0a10'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#d8b050'; x.font = 'bold 34px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('THE PICTUREDROME', W / 2, H * 0.32);
    const nx = nextShows(K.G.day, K.hour).find((q) => q.screen === S.i);
    x.font = 'bold 18px Arial'; x.fillStyle = '#fff0d0';
    x.fillText(nx ? `NEXT: ${nx.film.title} · ${cnFmt(nx.start)}` : 'THAT\'S ALL FOR TODAY. MIND HOW YOU GO', W / 2, H * 0.62);
    x.fillText('PLEASE TAKE YOUR RUBBISH WITH YOU', W / 2, H * 0.8);
  } else if (M.phase === 'ads') {
    const appeal = K.G.level >= 2 && S.i === 0 && (K.hour - M.start) > 0.07;
    if (appeal) { cnDrawAppeal(x, W, H, K.G.newsLook || K.player.outfit || {}); return 'appeal'; }
    const A = CN_ADS[Math.floor((K.hour - M.start) / 0.035) % CN_ADS.length];
    x.fillStyle = A.bg; x.fillRect(0, 0, W, H); x.fillStyle = A.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 40px Arial Black, Arial'; x.fillText(A.lines[0], W / 2, H * 0.4); x.font = 'bold 22px Arial'; x.fillText(A.lines[1], W / 2, H * 0.68);
  } else if (M.phase === 'credits') {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.fillStyle = '#ddd'; x.font = '16px Arial'; x.textAlign = 'center';
    const roll = ((K.time * 30) % 400);
    ['THE END', '', M.film.title, '', 'DIRECTED BY A MAN CALLED KEITH', 'CATERING: THE TEA BAR', 'NO PIGEONS WERE HARMED', 'FILMED ON LOCATION IN ASHFORD', 'BEST BOY: DARREN'].forEach((l, i) => x.fillText(l, W / 2, H + 20 + i * 24 - roll));
  } else {
    cnDrawFilm(x, W, H, M.film, M.t, K.time);
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 0, W, 6); x.fillRect(0, H - 6, W, 6);
    if (Math.random() < 0.3) { x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(Math.random() * W, 0, 1, H); } // a scratch on the print
  }
  return M ? M.phase : null;
}

// =====================================================================
// Staff: the box office, the kiosk, the usher with the torch
// =====================================================================
const cnStaff = [];
function cnPerson(look, x, z, face, extra) {
  const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: CN_RED, pants: 0x1a1a1e, ...look });
  p.group.position.set(x, 0, z); p.group.rotation.y = face; p.group.visible = false; scene.add(p.group);
  const S = { p, g: p.group, x, z, face, ...extra }; cnStaff.push(S); return S;
}
function cnAddBox(parent, w, h, d, x, y, z, col) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(col)); m.position.set(x, y, z); parent.add(m); return m; }
const cnTorchMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
function buildCnStaff() {
  if (cnStaff.length) return;
  const C = cinema;
  C.boxStaff = cnPerson({}, C.box.x, 48.6, Math.PI, { role: 'box' }); cnAddBox(C.boxStaff.p.torso, 0.12, 0.06, 0.04, 0.12, 0.2, 0.215, CN_GOLD);
  C.kioskStaff = cnPerson({ shirt: 0x2a2a6a }, C.kiosk.x, 48.6, Math.PI, { role: 'kiosk' }); cnAddBox(C.kioskStaff.p.torso, 0.5, 0.12, 0.42, 0, 0.62, 0, 0x2a2a6a); // a paper hat
  const U = cnPerson({ shirt: 0x1a1a1e }, C.usherDoor.x, C.usherDoor.z, Math.PI, { role: 'usher', wp: 0, warnT: 0 });
  cnAddBox(U.p.torso, 0.42, 0.06, 0.32, 0, 0.2, 0, CN_RED); // a red sash, very official
  const torch = new THREE.Group(); torch.position.set(0.28, 1.1, 0.25);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.26, 8), lam(0x2a2a2e)); body.rotation.x = Math.PI / 2; torch.add(body);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 7, 14, 1, true), cnTorchMat); beam.rotation.x = -Math.PI / 2; beam.position.z = 3.6; torch.add(beam);
  U.g.add(torch); U.torch = torch; U.beam = beam; C.usher = U;
}
// the usher's beat round SCREEN 1 while a film's on: down the side aisle, along the front, back up
function usherRoute() { const S = cinema.screens[0]; return [{ x: 264, z: S.z0 + 2 }, { x: 264, z: S.front.z0 + 2 }, { x: (S.x0 + S.x1) / 2, z: S.front.z0 + 3 }, { x: S.x1 - 2, z: S.front.z0 + 3 }, { x: 264, z: S.front.z0 + 2 }]; }

// =====================================================================
// The audience
// =====================================================================
const CN_REACT = {
  monster: { lines: ['RUN!', 'LOOK AT THE SIZE OF IT!', '*SCREAMS, THEN LAUGHS*', 'IT\'S GOT MY CHIPS!', 'COO!'], sfx: 'scream' },
  romance: { lines: ['AWWW', 'JUST KISS HER!', '*SNIFFS*', 'I\'D NEVER GO TO A LAY-BY FOR LOVE', 'SHE\'S TOO GOOD FOR HIM'], sfx: 'ooh' },
  scifi: { lines: ['WHOA', 'THAT\'S NOT HOW TEETH WORK', 'WHICH ONE\'S THE DENTIST?', 'PEW PEW', 'BETTER THAN THE FIRST ONE'], sfx: 'ooh' },
  horror: { lines: ['DON\'T GO IN THERE!', '*SCREAMS*', 'I CAN\'T LOOK', 'THEY\'RE COMING OUT OF THE BAG!', 'NOT THE VINEGAR!'], sfx: 'scream' },
  drama: { lines: ['*SOBS QUIETLY*', 'JUST GET ON THE BUS!', 'I\'VE BEEN THAT MAN', 'BEAUTIFUL. JUST BEAUTIFUL', '*SNORES*'], sfx: 'sigh' },
  sport: { lines: ['SHOOOOT!', 'REF!', 'THAT\'S NOT HOW IT HAPPENED', 'I WAS AT THAT GAME!', 'GET IN!'], sfx: 'cheer' },
};
const CN_SHUSH = ['SHHH!', 'SIT DOWN!', 'DOWN IN FRONT!', 'YOU\'RE IN THE WAY!', 'SOME OF US ARE TRYING TO WATCH THIS', 'OI! SIT DOWN!'];
function cnFreeSeat(S, nearZ) {
  const free = S.seats.filter((s) => !s.taken || s.taken.dead || !s.taken.cnAud);
  if (!free.length) return null;
  if (nearZ == null) return mpick(free);
  free.sort((a, b) => Math.abs(a.z - nearZ) - Math.abs(b.z - nearZ)); return mpick(free.slice(0, 20));
}
// the way in: through the front doors, round the counters, through the screen door, down the side aisle to
// the front, along to the seat's column and up the rows (and the same in reverse on the way out)
function cnRoute(S, s) {
  const dx = S.i === 0 ? 264 : 314, fz = S.front.z0 + 1.5;
  return [[296, 36.5], S.i === 0 ? [286, 44] : [304, 43.5], S.i === 0 ? [266, 45] : [311, 44.5], [dx, 51], [dx, 56.5], [dx, fz], [s.x, fz], [s.x, s.z]];
}
function cnTakeSeat(h, S, K) {
  const s = cnFreeSeat(S, S.rowsAt[Math.floor(S.rowsAt.length * mr(0.2, 0.9))].z0); if (!s) return false;
  if (s === CN_STATE.seat) return false;
  s.taken = h; h.cnSeat = s;
  let route = cnRoute(S, s);
  if (screenAt(h.x, h.z) === S) route = route.slice(5); else if (inFoyer(h.x, h.z)) route = route.slice(h.z > 46 ? 3 : 1);
  return K.lifeGo(h, 'sit', s.x, s.z, s.face, mr(60, 120), { spot: s, route, ri: 0, maxT: 90, cnIn: true });
}
function cnSendHome(h, K) {
  const s = h.cnSeat, S = cinema.screens[h.cnScreen || 0];
  if (s && s.taken === h) s.taken = null; h.cnSeat = null; h.cnAud = 'leaving';
  const out = [[mr(260, 332), mr(17, 31)]];
  if (screenAt(h.x, h.z) === S) { const r = cnRoute(S, { x: clamp(h.x, S.x0 + 3.6, S.x1 - 0.6), z: h.z }).reverse(); r.shift(); out.unshift(...(h.x < S.x0 + 3.1 ? r.slice(2) : r)); }
  else if (inFoyer(h.x, h.z)) out.unshift([296, 39.5], [296, 36.5]);
  return K.lifeGo(h, 'walk', out[out.length - 1][0], out[out.length - 1][1], null, 0.3, { route: out, ri: 0, oneWay: true, maxT: 90 });
}
function cnUpdateAudience(dt, K) {
  const near = K.near(296, 60, 170);
  CN_STATE.audT = (CN_STATE.audT || 0) - dt; if (CN_STATE.audT > 0) return; CN_STATE.audT = 0.9;
  const all = K.hunters().filter((h) => h.cnAud && !h.dead);
  for (const S of cinema.screens) {
    const M = showNow(S.i, K.G.day, K.hour), folk = all.filter((h) => h.cnScreen === S.i);
    S.aud = folk.length;
    if (!M || M.phase === 'out') { for (const h of folk) if (h.cnAud === true) cnSendHome(h, K); continue; }
    for (const h of folk) if (h.cnAud === true && !h.act && h.state !== 'chase' && !(h.panicT > 0)) cnTakeSeat(h, S, K);
    // more people turn up for the film: parking up and walking in from the car park
    const want = Math.round((S.i === 0 ? 18 : 9) * (M.start >= 18 ? 1.3 : 1));
    for (let n = M.phase === 'film' && folk.length > want / 2 ? 1 : 3; n > 0 && near && folk.length < want && M.phase !== 'credits'; n--) {
      if (M.phase === 'film' && folk.length > want / 2 && Math.random() < 0.4) break;
      // (a showing only lasts a few minutes of your time: if you're not in there to see them arrive, they're
      // already in their seats; if you are, they come in through the door and find one)
      const P = K.player; let watching = screenAt(P.x, P.z) === S, s = cnFreeSeat(S, S.rowsAt[Math.floor(S.rowsAt.length * mr(0.15, 0.95))].z0);
      if (watching && s && Math.random() < 0.6 && Math.hypot(s.x - P.x, s.z - P.z) > 18) watching = false; // the far side of a dark room
      if (watching) s = null;
      const h = watching || s ? K.spawnCivAt(S.i === 0 ? 264 : 314, S.z0 + 3) : null;
      if (h) {
        h.cnAud = true; h.cnScreen = S.i; h.job = null;
        if (s) { h.x = s.x; h.z = s.z; h.y = s.top; s.taken = h; h.cnSeat = s; K.lifeGo(h, 'sit', s.x, s.z, s.face, mr(60, 120), { spot: s }); }
        else cnTakeSeat(h, S, K);
        folk.push(h);
      }
    }
    // the audience reacts to whatever's on the screen
    if (M.phase === 'film' && near && K.near((S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2, 40)) {
      S.reactT = (S.reactT ?? mr(2, 5)) - 0.9;
      if (S.reactT <= 0) {
        S.reactT = mr(3, 7); const R = CN_REACT[M.film.genre];
        const sat = folk.filter((h) => h.act && h.act.kind === 'sit' && h.act.spot && h.act.spot.screen === S.i);
        if (sat.length) { K.say(mpick(sat), mpick(R.lines)); if (K.sfx[R.sfx]) K.sfx[R.sfx](); }
      }
    }
  }
}

// =====================================================================
// You, in the cinema: buying a ticket, sitting down, the usher
// =====================================================================
export function cnSeatNear(K) {
  const P = K.player;
  if (P.car || P.mode !== 'move' || P.hide || CN_STATE.seat) return null;
  const S = screenAt(P.x, P.z); if (!S) return null;
  let best = null, bd = 0.9;
  for (const s of S.seats) {
    if (s.taken && !s.taken.dead && s.taken.cnAud && s.taken.act && s.taken.act.spot === s) continue;
    if (Math.abs(P.y - s.top) > 0.55) continue;
    const d = Math.hypot(P.x - s.sx, P.z - (s.sz + 0.5)); if (d < bd) { bd = d; best = s; }
  }
  return best;
}
export function cnSit(s, K) {
  const P = K.player;
  if (s.taken && s.taken.act && s.taken.act.spot === s) return false;
  const M = showNow(s.screen, K.G.day, K.hour);
  takeSeat(s, K, M && M.dark ? (hasTicket(M.key, K.G.day) ? 'YOU SINK INTO YOUR SEAT. EVERY FACE IS POINTED AT THE SCREEN' : 'YOU SLIP INTO A SEAT. WATCH OUT FOR THE USHER') : 'A NICE COMFY SEAT. NOTHING ON YET');
  return true;
}
// sitting down anywhere (a cinema seat, a launderette chair): s = {x, z (where you stand), sx, sz (where you sit), top, face}
export function takeSeat(s, K, msg) {
  const P = K.player;
  CN_STATE.seat = s; s.taken = { player: true }; CN_STATE.sat++;
  P.x = s.sx; P.z = s.sz; P.y = s.top; P.vx = P.vz = 0; P.yaw = Math.atan2(-Math.sin(s.face), -Math.cos(s.face)); P.pitch = 0.05;
  if (msg) K.showMsg(msg, 2.4);
}
export function cnStand(K, msg) {
  const s = CN_STATE.seat; if (!s) return;
  CN_STATE.seat = null; if (s.taken && s.taken.player) s.taken = null;
  const P = K.player; P.x = s.x; P.z = s.z; P.y = s.top; P.crouch = 0;
  if (msg) K.showMsg(msg, 1.6);
}
// while you're sat down: stuck to the seat, low in it. Moving, jumping or getting hurt gets you up.
export function cnSeatPlayer(dt, K) {
  const s = CN_STATE.seat; if (!s) return false;
  const P = K.player, I = K.input;
  if (!P.alive || P.car || P.hide) { cnStand(K); return false; }
  if (I.fwd || I.side || I.jumpEdge || (P.lastHurt != null && P.lastHurt < 0.1)) { cnStand(K); return false; }
  P.x = s.sx; P.z = s.sz; P.y = s.top; P.vx = P.vz = 0; P.sprinting = false; P.crouch = 0.6;
  P.stam = Math.min(100, P.stam + 22 * dt);
  return true;
}
const CN_USHER = ['TICKET, PLEASE', 'CAN I SEE YOUR TICKET?', 'WHICH SEAT ARE YOU MEANT TO BE IN?', 'NO TICKET? OUT', 'I\'VE GOT MY EYE ON YOU'];
function cnUsher(dt, K) {
  const U = cinema.usher; if (!U) return;
  const S0 = cinema.screens[0], M = showNow(0, K.G.day, K.hour), P = K.player, open = cnOpenHours(K.hour);
  U.g.visible = open;
  const patrol = !!(M && (M.phase === 'film' || M.phase === 'credits'));
  let tx = cinema.usherDoor.x, tz = cinema.usherDoor.z;
  if (patrol) { const R = usherRoute(), w = R[U.wp % R.length]; tx = w.x; tz = w.z; if (Math.hypot(U.x - tx, U.z - tz) < 0.5) U.wp++; }
  const dx = tx - U.x, dz = tz - U.z, d = Math.hypot(dx, dz);
  if (d > 0.05) { const sp = Math.min(d, (patrol ? 1.3 : 2.2) * dt); U.x += (dx / d) * sp; U.z += (dz / d) * sp; U.face = Math.atan2(dx, dz); }
  else if (!patrol) U.face = Math.PI;
  // the torch sweeps the rows when they're in the aisle
  const inAisle = patrol && U.x < 266 && U.z > S0.z0 + 1 && U.z < S0.front.z0 + 1;
  U.look = inAisle ? Math.PI / 2 + Math.sin(K.time * 0.9) * 0.6 : patrol && U.z > S0.front.z0 ? Math.PI + Math.sin(K.time * 0.7) * 0.7 : U.face;
  U.torch.visible = patrol;
  const y = cnFloorUnder(U.x, U.z);
  U.g.position.set(U.x, y, U.z); U.g.rotation.y = U.face; U.torch.rotation.y = U.look - U.face;
  const walk = d > 0.05 ? Math.sin(K.time * 7) * 0.4 : 0; U.p.legL.rotation.x = walk; U.p.legR.rotation.x = -walk; U.p.armR.rotation.x = -1.2; U.p.armL.rotation.x = -walk * 0.5;
  // the ticket check
  U.warnT = Math.max(0, U.warnT - dt);
  if (!open || !M || !M.dark || P.car || P.hide || !cnInBox(P.x, P.z, S0, 0.2) || hasTicket(M.key, K.G.day)) return;
  const ax = P.x - U.x, az = P.z - U.z, ad = Math.hypot(ax, az);
  if (ad > (patrol ? 13 : 6) || U.warnT > 0) return;
  let off = Math.atan2(ax, az) - U.look; while (off > Math.PI) off -= Math.PI * 2; while (off < -Math.PI) off += Math.PI * 2;
  if (patrol && Math.abs(off) > 0.45 && ad > 2) return; // outside the torch beam
  if (!K.canSee(U.x, 1.6, U.z)) return;
  U.warnT = 7; CN_STATE.warned++;
  K.say({ g: U.g }, mpick(CN_USHER)); K.bumpLocal(0.05);
  if (CN_STATE.warned % 2 === 0) { K.addHeat(2); K.showMsg('THE USHER IS ON THE RADIO ABOUT YOU. BUY A TICKET OR GO', 2.6); if (CN_STATE.seat) cnStand(K); }
  else K.showMsg('THE USHER\'S TORCH FINDS YOU. NO TICKET', 2);
}
function cnFloorUnder(x, z) { const S = screenAt(x, z); if (!S || x < S.x0 + 3.1) return 0; for (const r of S.rowsAt) if (z >= r.z0 && z < r.z1) return r.top; return 0; }

// =====================================================================
// E: the box office, the kiosk, a seat
// =====================================================================
const CN_KIOSK = [
  { id: 'cn_popcorn', name: 'BUCKET OF POPCORN', price: 4, heal: 12, desc: 'Salted. Enormous. Patches you up (+12).' },
  { id: 'cn_hotdog', name: 'HOT DOG', price: 4, heal: 22, desc: 'Has been rotating since Tuesday. Patches you up (+22).' },
  { id: 'cn_slush', name: 'BLUE SLUSH', price: 2, heal: 4, cool: true, desc: 'Brain freeze. Calms you right down (+4, lowers the heat a bit).' },
  { id: 'cn_pick', name: 'PICK AND MIX', price: 3, sweets: 3, desc: 'Three sweets for the pocket. Kids will do anything for a sweet.' },
  { id: 'cn_3d', name: '3D GLASSES', price: 5, desc: 'Red and blue lenses. You look like everyone else in SCREEN 1.' },
];
const CN_COSTUME = [{ id: 'cn_3d', slot: 'eyes', cat: 'cinema', name: '3D GLASSES', price: 5, dg: 0.15, desc: 'Red and blue cardboard specs.' }];
for (const c of CN_COSTUME) if (!CATALOG.costume.some((o) => o.id === c.id)) CATALOG.costume.push(c);
function cnBoxMenu(K) {
  const P = K.player;
  return {
    cash: () => P.cash,
    items: () => nextShows(K.G.day, K.hour).map((q) => ({ id: 'tk_' + q.key, show: q, name: `SCREEN ${q.screen + 1} · ${cnFmt(q.start)} · ${q.film.title}`, price: q.start < 17 ? 5 : 7, desc: `${q.film.cert}. ${q.film.blurb}` })),
    state: (it) => (CN_STATE.tickets[it.show.key] ? 'owned' : ''),
    buy(it) {
      if (CN_STATE.tickets[it.show.key]) return 'YOU\'VE ALREADY GOT ONE';
      if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`;
      P.cash -= it.price; K.sfx.cash(); CN_STATE.tickets[it.show.key] = true; CN_STATE.ticketsSold++;
      return `SCREEN ${it.show.screen + 1}, ${cnFmt(it.show.start)}. SIT WHERE YOU LIKE`;
    },
  };
}
function cnKioskMenu(K) {
  const P = K.player;
  return {
    cash: () => P.cash, items: () => CN_KIOSK,
    state: (it) => (it.id === 'cn_3d' && P.outfit.eyes === 'cn_3d' ? 'owned' : ''),
    buy(it) {
      if (it.id === 'cn_3d' && P.outfit.eyes === 'cn_3d') return 'YOU\'RE ALREADY WEARING THEM';
      if (P.cash < it.price) return `YOU NEED $${it.price - P.cash} MORE`;
      P.cash -= it.price; K.sfx.cash();
      if (it.heal) { P.hp = Math.min(100, P.hp + it.heal); if (it.cool) K.coolHeat(5); if (it.id === 'cn_popcorn') CN_STATE.popcorn++; return mpick(['ENJOY THE FILM', 'MIND, IT\'S HOT', 'NO REFILLS', 'THAT\'S A LOT OF SALT']); }
      if (it.sweets) { MK_STATE.sweets = (MK_STATE.sweets || 0) + it.sweets; return 'SWEETS IN YOUR POCKET'; }
      if (it.id === 'cn_3d') return K.wear('cn_3d');
      return 'THANKS!';
    },
  };
}
export function cnUseTarget(K) {
  const P = K.player, C = cinema;
  if (!C.built || P.car || P.mode !== 'move' || P.hide) return null;
  if (P.x < CN_CLEAR.x0 || P.x > CN_CLEAR.x1 || P.z < CN_CLEAR.z0 || P.z > CN_CLEAR.z1) return null;
  if (CN_STATE.seat) return { kind: 'stand' };
  if (P.y < 0.8 && inFoyer(P.x, P.z)) {
    if (Math.hypot(P.x - C.box.x, P.z - C.box.z) < 2.2 && P.z < 47) return { kind: 'box' };
    if (Math.hypot(P.x - C.kiosk.x, P.z - C.kiosk.z) < 2.6 && P.z < 47) return { kind: 'kiosk' };
  }
  const s = cnSeatNear(K); if (s) return { kind: 'seat', s };
  return null;
}
export function cnUsePrompt(T, K, useK) {
  if (T.kind === 'stand') return `${useK} (or move) to get up`;
  if (T.kind === 'box') return cnOpenHours(K.hour) ? `${useK} for the box office` : 'The box office opens at 11';
  if (T.kind === 'kiosk') return cnOpenHours(K.hour) ? `${useK} for popcorn and sweets` : 'The kiosk opens at 11';
  if (T.kind === 'seat') return `${useK} to take a seat`;
  return '';
}
export function cnUse(T, K) {
  if (T.kind === 'stand') { cnStand(K, 'YOU GET UP'); return; }
  if (T.kind === 'seat') { cnSit(T.s, K); return; }
  if (!cnOpenHours(K.hour)) { K.showMsg('SHUT. OPENS AT 11', 1.6); return; }
  if (T.kind === 'box') { K.openMenu({ name: 'THE PICTUREDROME BOX OFFICE', kind: 'cinema', blurbs: ['"WHICH FILM, LOVE?"', '"SIT ANYWHERE. NOBODY SITS IN THE FRONT ROW."', '"THE PIGEON ONE\'S BETTER THAN IT SOUNDS."'] }, cnBoxMenu(K)); return; }
  if (T.kind === 'kiosk') { K.openMenu({ name: 'THE KIOSK', kind: 'cinema', blurbs: ['"SWEET OR SALTED?"', '"LARGE IS ONLY A DOLLAR MORE. IT\'S ALWAYS A DOLLAR MORE."', '"MIND THE SLUSH, IT STAINS."'] }, cnKioskMenu(K)); }
}

// =====================================================================
// How well you blend in here
// =====================================================================
export function cnConspic(K) {
  const P = K.player;
  if (P.car || !inCinema(P.x, P.z)) return 0;
  const S = screenAt(P.x, P.z), day = K.G.day, hr = K.hour;
  if (S) {
    const M = showNow(S.i, day, hr);
    if (M && M.dark) {
      const paid = hasTicket(M.key, day);
      if (CN_STATE.seat) return (paid ? -0.6 : -0.42) - (P.outfit.eyes === 'cn_3d' ? 0.05 : 0) - 0.15 + (CN_STATE.appealT > 0 ? 0.3 : 0); // (the 0.15 undoes slumping down counting as crouching)
      return -0.12 + (P.y < 0.5 ? 0 : 0.12) + (CN_STATE.appealT > 0 ? 0.3 : 0); // dark, but you're standing in the way
    }
    return CN_STATE.seat ? -0.15 - 0.1 : 0;
  }
  // the foyer: busy before a showing
  const busy = cinema.screens.some((Sc) => { const M = showNow(Sc.i, day, hr); return M && (M.phase === 'doors' || M.phase === 'out'); });
  return busy ? -0.1 : 0;
}

// =====================================================================
// Each frame
// =====================================================================
export function updateCinema(dt, K) {
  const C = cinema; if (!C.built) return;
  buildCnStaff();
  const day = K.G.day, hr = K.hour, open = cnOpenHours(hr), near = K.near(296, 60, 220), P = K.player;
  if (C.boxStaff) C.boxStaff.g.visible = open; if (C.kioskStaff) C.kioskStaff.g.visible = open;
  if (C.marquee && cnMarq.day !== day) { cnMarqueeTex(day); for (let k = 0; k < C.posters.length; k++) { const F = k < 2 ? filmOn(k, day) : FILMS[(day + k) % FILMS.length]; if (C.posters[k].userData.film !== F.title) { C.posters[k].userData.film = F.title; C.posters[k].material.map = cnPosterTex(F); C.posters[k].material.needsUpdate = true; } } }
  CN_STATE.appealT = Math.max(0, (CN_STATE.appealT || 0) - dt);
  let dark = false;
  for (const S of C.screens) {
    const M = showNow(S.i, day, hr);
    if (M && M.dark) dark = dark || cnInBox(P.x, P.z, S);
    if (!near) continue;
    S.drawT = (S.drawT || 0) - dt;
    if (S.drawT <= 0) {
      S.drawT = K.near((S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2, 40) ? 0.08 : 1;
      const what = cnDrawScreen(S, M, K); S.tex.needsUpdate = true; S.showing = what;
      if (what === 'appeal' && cnInBox(P.x, P.z, S)) {
        if (S.appealDay !== day + ':' + M.start) { S.appealDay = day + ':' + M.start; CN_STATE.appealSeen++; K.showMsg('THAT\'S YOU. TWELVE FEET HIGH. KEEP YOUR HEAD DOWN', 2.6); }
        CN_STATE.appealT = 1.2;
      }
    }
    if (M && M.phase === 'film' && cnInBox(P.x, P.z, S) && S.announced !== day + ':' + M.start) { S.announced = day + ':' + M.start; CN_STATE.films++; }
  }
  // the hall lights dim for the film
  cnLightMat.color.setHex(dark ? 0x3a2a1a : 0xffe8b0);
  // first time past in a day: what's on
  if (C.welcomed !== day && near && K.near(296, 30, 60) && open) { C.welcomed = day; K.banner(`THE PICTUREDROME<small>SCREEN 1: ${filmOn(0, day).title} · SCREEN 2: ${filmOn(1, day).title} · BOX OFFICE IN THE FOYER</small>`, 4); }
  cnUpdateAudience(dt, K);
  cnUsher(dt, K);
  // standing about in the dark in front of people
  if (!CN_STATE.seat && !P.car) {
    const S = screenAt(P.x, P.z), M = S ? showNow(S.i, day, hr) : null;
    CN_STATE.shushT = Math.max(0, CN_STATE.shushT - dt);
    if (M && M.phase === 'film' && P.y > 0.2 && P.x > S.x0 + 3.1 && CN_STATE.shushT <= 0) {
      const sat = K.hunters().filter((h) => h.cnScreen === S.i && h.act && h.act.kind === 'sit' && Math.hypot(h.x - P.x, h.z - P.z) < 6 && h.z < P.z + 1);
      if (sat.length) { CN_STATE.shushT = mr(4, 7); K.say(mpick(sat), mpick(CN_SHUSH)); }
    }
  }
}
// what the cinema crowd do when they've finished what they were doing (the town calendar asks us first)
export function cnPlan(h, hr, K) {
  if (!h.cnAud) return false;
  const S = cinema.screens[h.cnScreen || 0], M = S ? showNow(S.i, K.G.day, hr) : null;
  if (h.cnAud === 'leaving' || !M || M.phase === 'out') { h.cnAud = false; return false; }
  return cnTakeSeat(h, S, K);
}
export function resetCinema() {
  CN_STATE.tickets = {}; CN_STATE.warned = 0; CN_STATE.warnT = 0; CN_STATE.seat = null; CN_STATE.sat = 0; CN_STATE.popcorn = 0; CN_STATE.appealSeen = 0; CN_STATE.ticketsSold = 0; CN_STATE.appealT = 0; CN_STATE.films = 0;
  cinema.welcomed = 0; for (const S of cinema.screens) { S.appealDay = null; S.announced = null; for (const s of S.seats || []) s.taken = null; }
  if (cinema.usher) { cinema.usher.wp = 0; cinema.usher.warnT = 0; }
}
export function cnDiaryBits(K) {
  const bits = [], day = K.G.day;
  const t = Object.keys(CN_STATE.tickets).filter((k) => k.startsWith(day + ':'));
  for (const k of t) { const [, s, st] = k.split(':'); bits.push(`A TICKET FOR SCREEN ${+s + 1} AT ${cnFmt(+st)}`); }
  return bits;
}
export const cinemaDebug = () => ({
  built: cinema.built, screens: cinema.screens.map((S) => ({ i: S.i, seats: S.seats.length, rows: S.rowsAt.length, aud: S.aud || 0, showing: S.showing || null })),
  cupboards: cinema.cupboards.length, staff: cnStaff.length, usher: cinema.usher ? { x: cinema.usher.x, z: cinema.usher.z, visible: cinema.usher.g.visible, torch: cinema.usher.torch.visible } : null,
  seat: CN_STATE.seat ? { screen: CN_STATE.seat.screen, row: CN_STATE.seat.row } : null, ...CN_STATE, tickets: Object.keys(CN_STATE.tickets),
});
export const cnInternals = { cnBoxMenu, cnKioskMenu, nextShows, cnFloorUnder, usherRoute, cnStaff, cnLightMat };
