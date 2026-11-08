// Odd jobs, more hiding places and the bin lorries.
//  - Community notice boards stand by the bus stops and benches. Each one has a few odd jobs pinned up every
//    day: deliver a parcel, post leaflets through doors, clear litter from a patch of pavement, find someone's
//    lost cat, or ride a shift on the back of the bin lorry. They pay cash, and people barely look twice at
//    someone who's obviously at work. Do them well and the jobs start paying better.
//  - Hiding places indoors: wardrobes in people's houses, store cupboards in the walk-in shops, big crates and
//    staff lockers in the dock warehouses. They work like the dumpsters (step in, peek out through the slats),
//    minus the smell.
//  - Bin lorries do the rounds, stopping to empty the wheelie bins on the pavement. Hop on the back step for a
//    ride, or crouch to drop into the hopper and vanish under the rubbish. Don't stay in there too long: the
//    compactor runs every so often.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, mr, mpick, scene, GeoBuf } from './core.js';
import { colliders, addCollider, propBuf, glowBuf, worldHooks, randomOpenPoint, cityAt, pointBlocked, keepClear } from './world.js';
import { walkIns, lifeSpots, hideSpots } from './streets.js';
import { warehouses } from './docks.js';
import { streetPropObjs } from './streetprops.js';
import { emitPuff } from './fx.js';
import { comicWord } from './knockfx.js';

export const GJ_STATE = { gig: null, ride: null, rep: 0, done: 0, earned: 0, failed: 0, binsEmptied: 0, hopperRides: 0, msgT: 0 };
export const gigBoards = []; // {x, z, face, city, name, offers, day}
// a repeatable 0..1 from a position (the world's seeded random stream must not shift when things are added)
const gjHash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

// =====================================================================
// Building: indoor hiding places and notice boards (placed just before the world is baked)
// =====================================================================
const overlaps = (c, x0, x1, z0, z1) => c.x1 > x0 && c.x0 < x1 && c.z1 > z0 && c.z0 < z1;
const clearOf = (list, x0, x1, z0, z1, yTop = 2.2) => !list.some((c) => (c.h || 0) > 0.28 && (c.y0 || 0) < yTop && overlaps(c, x0, x1, z0, z1));
// furniture that faces into the room along (ux, uz); half sizes: wa along the wall, wd away from it
function hidePiece(kind, x, z, ux, uz, wa, wd, hgt, y0) {
  const alongX = uz !== 0; // the wall runs along x when the piece faces along z
  const lx = alongX ? wa : wd, lz = alongX ? wd : wa;
  const x0 = x - lx, x1 = x + lx, z0 = z - lz, z1 = z + lz;
  const front = (d) => [x + ux * (wd + d), z + uz * (wd + d)];
  const H = gjHash(x, z, 3);
  if (kind === 'wardrobe' || kind === 'cupboard') {
    const col = kind === 'wardrobe' ? [0x8a5a32, 0x6a4a2a, 0xe8e0d0, 0xa07a4a][Math.floor(H * 4)] : [0x9aa0a8, 0x6a7a8a, 0xd8d8d0][Math.floor(H * 3)];
    propBuf.box(x0, x1, y0, y0 + hgt, z0, z1, col);
    propBuf.box(x0 - 0.02, x1 + 0.02, y0 + hgt, y0 + hgt + 0.06, z0 - 0.02, z1 + 0.02, 0x3a2a1a);
    // slatted doors and handles on the front face
    const [fx, fz] = front(0.005), dark = kind === 'wardrobe' ? 0x2a1a10 : 0x3a3e44;
    for (let y = y0 + 1.1; y < y0 + hgt - 0.15; y += 0.12) {
      if (alongX) propBuf.box(x0 + 0.06, x1 - 0.06, y, y + 0.03, Math.min(fz, fz + uz * 0.01), Math.max(fz, fz + uz * 0.01), dark);
      else propBuf.box(Math.min(fx, fx + ux * 0.01), Math.max(fx, fx + ux * 0.01), y, y + 0.03, z0 + 0.06, z1 - 0.06, dark);
    }
    if (alongX) { propBuf.box(x - 0.01, x + 0.01, y0 + 0.05, y0 + hgt - 0.05, Math.min(fz, fz + uz * 0.012), Math.max(fz, fz + uz * 0.012), dark); for (const s of [-0.12, 0.12]) propBuf.box(x + s - 0.02, x + s + 0.02, y0 + 0.95, y0 + 1.15, Math.min(fz, fz + uz * 0.05), Math.max(fz, fz + uz * 0.05), 0xd0c090); }
    else { propBuf.box(Math.min(fx, fx + ux * 0.012), Math.max(fx, fx + ux * 0.012), y0 + 0.05, y0 + hgt - 0.05, z - 0.01, z + 0.01, dark); for (const s of [-0.12, 0.12]) propBuf.box(Math.min(fx, fx + ux * 0.05), Math.max(fx, fx + ux * 0.05), y0 + 0.95, y0 + 1.15, z + s - 0.02, z + s + 0.02, 0xd0c090); }
  } else if (kind === 'locker') {
    propBuf.box(x0, x1, y0, y0 + hgt, z0, z1, [0x3a6a9a, 0x6a6a72, 0x2a6a4a][Math.floor(H * 3)]);
    const [fx, fz] = front(0.005);
    for (let y = y0 + 1.5; y < y0 + 1.8; y += 0.07) { if (alongX) propBuf.box(x0 + 0.08, x1 - 0.08, y, y + 0.025, Math.min(fz, fz + uz * 0.01), Math.max(fz, fz + uz * 0.01), 0x1a1a1e); else propBuf.box(Math.min(fx, fx + ux * 0.01), Math.max(fx, fx + ux * 0.01), y, y + 0.025, z0 + 0.08, z1 - 0.08, 0x1a1a1e); }
  } else { // crate: a big slatted packing crate with a loose board at the front
    const wood = [0xa88a5a, 0x9a7a4a, 0xb8986a][Math.floor(H * 3)];
    propBuf.box(x0, x1, y0, y0 + hgt, z0, z1, wood);
    for (const y of [y0 + 0.1, y0 + hgt * 0.5, y0 + hgt - 0.12]) propBuf.box(x0 - 0.02, x1 + 0.02, y, y + 0.1, z0 - 0.02, z1 + 0.02, 0x7a5a32);
    const [fx, fz] = front(0.02); propBuf.box(fx - 0.25, fx + 0.25, y0 + hgt + 0.0, y0 + hgt + 0.04, fz - 0.25, fz + 0.25, 0x5a4a2a);
  }
  addCollider(x0, x1, z0, z1, y0 + hgt + (kind === 'crate' ? 0 : 0.06), { y0: 0 });
  const eyeY = kind === 'crate' ? y0 + hgt - 0.35 : y0 + Math.min(1.6, hgt - 0.25);
  const S = { kind, x, z, lx, lz, top: y0 + hgt, indoor: true, eye: { x: x + ux * (wd - 0.12), y: eyeY, z: z + uz * (wd - 0.12) } };
  const [sx, sz] = front(0.55); S.stand = { x: sx, z: sz, ux, uz };
  hideSpots.push(S);
  return S;
}
// try spots along the inside walls of a room until one fits
function placeAgainstWall(rect, kind, wa, wd, hgt, inset, avoid, near, salt) {
  const list = colliders.filter((c) => overlaps(c, rect.x0 - 1, rect.x1 + 1, rect.z0 - 1, rect.z1 + 1));
  const cands = [];
  const sides = [[rect.x0 + inset, null, 1, 0], [rect.x1 - inset, null, -1, 0], [null, rect.z0 + inset, 0, 1], [null, rect.z1 - inset, 0, -1]];
  for (const [wx, wz, ux, uz] of sides) {
    const a0 = (ux ? rect.z0 : rect.x0) + inset + wa + 0.1, a1 = (ux ? rect.z1 : rect.x1) - inset - wa - 0.1;
    for (let a = a0; a <= a1; a += 0.45) {
      const x = ux ? wx + ux * wd : a, z = uz ? wz + uz * wd : a;
      cands.push([x, z, ux, uz]);
    }
  }
  if (!cands.length) return null;
  const off = Math.floor(gjHash(rect.x0, rect.z0, salt) * cands.length);
  for (let k = 0; k < cands.length; k++) {
    const [x, z, ux, uz] = cands[(k + off) % cands.length];
    const lx = uz ? wa : wd, lz = uz ? wd : wa;
    if (!clearOf(list, x - lx - 0.02, x + lx + 0.02, z - lz - 0.02, z + lz + 0.02)) continue;
    const sx = x + ux * (wd + 0.6), sz = z + uz * (wd + 0.6);
    if (!clearOf(list, sx - 0.42, sx + 0.42, sz - 0.42, sz + 0.42, 1.9)) continue;
    if (sx < rect.x0 + 0.5 || sx > rect.x1 - 0.5 || sz < rect.z0 + 0.5 || sz > rect.z1 - 0.5) continue;
    if (avoid.some((p) => Math.hypot(p[0] - x, p[1] - z) < near || Math.hypot(p[0] - sx, p[1] - sz) < near)) continue;
    return { x, z, ux, uz };
  }
  return null;
}
function placeIndoorHides() {
  for (const W of walkIns) {
    if (!W.rect) continue;
    const doorPts = [[W.x, W.z], ...(W.path || [])];
    if (W.home) {
      const p = placeAgainstWall(W.rect, 'wardrobe', 0.55, 0.3, 2.0, 0.3, doorPts, 1.7, 1);
      if (p) hidePiece('wardrobe', p.x, p.z, p.ux, p.uz, 0.55, 0.3, 2.0, 0.2);
    } else if (gjHash(W.x, W.z, 2) < 0.4) {
      const p = placeAgainstWall(W.rect, 'cupboard', 0.45, 0.3, 2.0, 0.3, doorPts, 1.7, 2);
      if (p) hidePiece('cupboard', p.x, p.z, p.ux, p.uz, 0.45, 0.3, 2.0, 0.2);
    }
  }
  for (const WH of warehouses) {
    const doorPts = WH.doors.flatMap((d) => [[d.x, d.z], [d.ox, d.oz]]);
    for (let k = 0; k < 2; k++) {
      const p = placeAgainstWall(WH.rect, 'crate', 0.85, 0.85, 1.7, 0.35, doorPts, 3, 5 + k);
      if (p) hidePiece('crate', p.x, p.z, p.ux, p.uz, 0.85, 0.85, 1.7, 0.2);
    }
    const p = placeAgainstWall(WH.rect, 'locker', 0.32, 0.28, 1.95, 0.35, doorPts, 3, 9);
    if (p) hidePiece('locker', p.x, p.z, p.ux, p.uz, 0.32, 0.28, 1.95, 0.2);
  }
}
const BOARD_NAMES = ['COMMUNITY NOTICE BOARD', 'ODD JOBS BOARD', 'LOCAL NOTICES', 'WANTED: HELP', 'NEIGHBOURHOOD BOARD'];
function placeBoards() {
  const pick = lifeSpots.filter((s) => s.kind === 'bus' || s.kind === 'bench').sort((a, b) => gjHash(a.x, a.z, 4) - gjHash(b.x, b.z, 4));
  // the docks have no benches to speak of: their boards go up beside the warehouse doors
  for (const WH of warehouses) for (const d of WH.doors) pick.push({ x: d.ox + (d.ox - d.x) * 0.6, z: d.oz + (d.oz - d.z) * 0.6, face: Math.atan2(d.ox - d.x, d.oz - d.z) });
  for (const s of pick) {
    const city = cityAt(s.x, s.z, 5); if (!city) continue;
    if (gigBoards.some((B) => Math.hypot(B.x - s.x, B.z - s.z) < 70)) continue;
    if (gigBoards.filter((B) => B.city === city.name).length >= 9) continue;
    const f = s.face || 0, px = Math.cos(f), pz = -Math.sin(f);
    const list = colliders.filter((c) => Math.abs((c.x0 + c.x1) / 2 - s.x) < 12 && Math.abs((c.z0 + c.z1) / 2 - s.z) < 12);
    for (const d of [2.8, -2.8, 3.6, -3.6, 4.4, -4.4]) {
      const x = s.x + px * d, z = s.z + pz * d;
      if (!clearOf(list, x - 0.9, x + 0.9, z - 0.9, z + 0.9, 2.5)) continue;
      buildBoard(x, z, f);
      gigBoards.push({ x, z, face: f, city: city.name, name: BOARD_NAMES[Math.floor(gjHash(x, z, 6) * BOARD_NAMES.length)], kind: 'gigs', offers: [], day: 0 });
      break;
    }
  }
}
const NOTE_COLS = [0xfff4a0, 0xffffff, 0xa0e0ff, 0xffb0c8, 0xb0f0a0, 0xffd090];
function buildBoard(x, z, f) {
  const c = Math.cos(f), s = Math.sin(f), w = 0.75; // the board runs along (c, -s)
  const P = (a, b) => [x + c * a + s * b, z - s * a + c * b];
  for (const a of [-w, w]) { const [px, pz] = P(a, 0); propBuf.box(px - 0.05, px + 0.05, 0, 2.2, pz - 0.05, pz + 0.05, 0x4a3a2a); }
  // the cork board and its little roof, as a few thin slabs along the run (axis-aligned pieces)
  for (let k = 0; k < 6; k++) {
    const a = -w + (k + 0.5) * (2 * w / 6), [px, pz] = P(a, 0), hw = w / 6 + 0.01;
    const ax = Math.abs(c) > Math.abs(s);
    const ex = ax ? hw : 0.04, ez = ax ? 0.04 : hw;
    propBuf.box(px - ex, px + ex, 1.05, 1.95, pz - ez, pz + ez, 0xb08a5a);
    propBuf.box(px - (ax ? hw : 0.2), px + (ax ? hw : 0.2), 2.0, 2.06, pz - (ax ? 0.2 : hw), pz + (ax ? 0.2 : hw), 0x2a3a2a);
  }
  // pinned notes on both faces
  for (let k = 0; k < 7; k++) {
    const a = -w + 0.18 + gjHash(x, z, 10 + k) * (2 * w - 0.36), y = 1.15 + gjHash(x, z, 20 + k) * 0.6;
    for (const side of [-1, 1]) {
      const [px, pz] = P(a, side * 0.05), ax = Math.abs(c) > Math.abs(s);
      const ex = ax ? 0.1 : 0.006, ez = ax ? 0.006 : 0.1;
      propBuf.box(px - ex, px + ex, y, y + 0.22, pz - ez, pz + ez, NOTE_COLS[Math.floor(gjHash(x, z, 30 + k) * NOTE_COLS.length)]);
    }
  }
  const ax = Math.abs(c) > Math.abs(s), [cx, cz] = P(0, 0);
  addCollider(cx - (ax ? w : 0.12), cx + (ax ? w : 0.12), cz - (ax ? 0.12 : w), cz + (ax ? 0.12 : w), 2.06, { y0: 0 });
  glowBuf.box(cx - 0.06, cx + 0.06, 2.06, 2.1, cz - 0.06, cz + 0.06, 0xffe8a0);
}
// ---------------------------------------------------------------------
// busier pavements: cafe and bar terraces (with seats people actually use), flower stalls outside florists,
// postboxes, phone boxes, planters and newspaper stands
// ---------------------------------------------------------------------
export const terraceSeats = [];
let gjClutter = 0, gjTerraceMiss = 0;
function pavementFree(x, z, r, list) { return clearOf(list, x - r, x + r, z - r, z + r, 2.4) && !keepClear.some((k) => overlaps(k, x - r, x + r, z - r, z + r)); }
function placeTerraces() {
  for (const W of walkIns) {
    if (W.home || !W.path || W.path.length < 2) continue;
    const terrace = ['cafe', 'bar', 'diner', 'pizza'].includes(W.kind), florist = W.kind === 'florist';
    if (!terrace && !florist) continue;
    const [ox, oz] = W.path[0], [ix, iz] = W.path[1];
    let ux = ox - ix, uz = oz - iz; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; // out of the door
    const px = -uz, pz = ux; // along the shop front
    const list = colliders.filter((c) => Math.abs((c.x0 + c.x1) / 2 - W.x) < 14 && Math.abs((c.z0 + c.z1) / 2 - W.z) < 14);
    for (const side of [1, -1]) {
      const cx = W.x + ux * 1.6 + px * side * 3.1, cz = W.z + uz * 1.6 + pz * side * 3.1;
      const ex = Math.abs(px) > 0.5 ? 1.05 : 0.5, ez = Math.abs(px) > 0.5 ? 0.5 : 1.05;
      if (!clearOf(list, cx - ex, cx + ex, cz - ez, cz + ez, 2.4) || keepClear.some((k) => overlaps(k, cx - ex, cx + ex, cz - ez, cz + ez))) { gjTerraceMiss++; continue; }
      if (florist) {
        for (const [a, b, c] of [[-0.6, 0, 0xe04a6a], [0, 0.1, 0xf0d040], [0.6, 0, 0xa04ae0]]) {
          const x = cx + px * a, z = cz + pz * a;
          propBuf.box(x - 0.28, x + 0.28, 0.15, 0.55 + b, z - 0.28, z + 0.28, 0x6a4a2a);
          for (let k = 0; k < 5; k++) propBuf.box(x - 0.2 + (k % 3) * 0.15, x - 0.1 + (k % 3) * 0.15, 0.55 + b, 0.75 + b, z - 0.15 + (k >> 1) * 0.1, z - 0.05 + (k >> 1) * 0.1, k % 2 ? c : 0x3a8a3a);
        }
        addCollider(cx - ex, cx + ex, cz - ez, cz + ez, 0.8, { y0: 0 }); gjClutter++;
        continue;
      }
      // a round table, a parasol and two chairs facing each other across it
      propBuf.cyl(cx, cz, 0.05, 0.05, 0.15, 0.85, 0x2a2a2e, 6); propBuf.cyl(cx, cz, 0.42, 0.42, 0.85, 0.9, 0xe8e0d0, 12);
      propBuf.cyl(cx, cz, 0.03, 0.03, 0.9, 2.3, 0x5a5a5e, 5); propBuf.cyl(cx, cz, 1.35, 0.05, 2.0, 2.45, [0xc83a3a, 0x2a6a9a, 0xf0e0c0, 0x3a8a4a][Math.floor(gjHash(cx, cz, 7) * 4)], 10);
      addCollider(cx - 0.42, cx + 0.42, cz - 0.42, cz + 0.42, 0.9, { y0: 0 });
      for (const s of [1, -1]) {
        const x = cx + px * s * 0.8, z = cz + pz * s * 0.8;
        propBuf.box(x - 0.22, x + 0.22, 0.15, 0.45, z - 0.22, z + 0.22, 0x8a6a4a);
        const bx = x + px * s * 0.2, bz = z + pz * s * 0.2; propBuf.box(Math.min(bx, bx + px * s * 0.05) - Math.abs(pz) * 0.22, Math.max(bx, bx + px * s * 0.05) + Math.abs(pz) * 0.22, 0.45, 0.95, Math.min(bz, bz + pz * s * 0.05) - Math.abs(px) * 0.22, Math.max(bz, bz + pz * s * 0.05) + Math.abs(px) * 0.22, 0x8a6a4a);
        const face = Math.atan2(-px * s, -pz * s);
        const seat = { kind: 'bench', x: x - px * s * 0.05 + ux * 0.6, z: z - pz * s * 0.05 + uz * 0.6, face, sx: x, sz: z, terrace: true };
        lifeSpots.push(seat); terraceSeats.push(seat);
      }
      gjClutter++;
    }
  }
}
function placeStreetClutter() {
  const benches = lifeSpots.filter((s) => s.kind === 'bench' && !s.terrace && cityAt(s.x, s.z, 0));
  for (let i = 0; i < benches.length; i += 2) {
    const s = benches[i], H = gjHash(s.x, s.z, 40);
    if (H > 0.55) continue;
    const f = s.face || 0, px = Math.cos(f), pz = -Math.sin(f);
    const list = colliders.filter((c) => Math.abs((c.x0 + c.x1) / 2 - s.x) < 10 && Math.abs((c.z0 + c.z1) / 2 - s.z) < 10);
    for (const d of [-3.4, 3.4, -4.6, 4.6]) {
      const x = s.x + px * d, z = s.z + pz * d;
      if (!pavementFree(x, z, 0.75, list)) continue;
      const kind = Math.floor(gjHash(x, z, 41) * 4);
      if (kind === 0) { propBuf.cyl(x, z, 0.24, 0.24, 0.15, 1.25, 0xc8202a, 10); propBuf.cyl(x, z, 0.27, 0.2, 1.25, 1.4, 0xc8202a, 10); propBuf.box(x - 0.12, x + 0.12, 1.0, 1.04, z - 0.25, z + 0.25, 0x1a1a1a); addCollider(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 1.4, { y0: 0 }); }
      else if (kind === 1) { // phone box
        propBuf.box(x - 0.5, x + 0.5, 0.15, 0.3, z - 0.5, z + 0.5, 0x2a2a2e);
        for (const [a, b] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]]) propBuf.box(x + a - 0.04, x + a + 0.04, 0.3, 2.3, z + b - 0.04, z + b + 0.04, 0x2a5a8a);
        propBuf.box(x - 0.5, x + 0.5, 2.3, 2.5, z - 0.5, z + 0.5, 0x2a5a8a); glowBuf.box(x - 0.3, x + 0.3, 2.32, 2.46, z - 0.51, z + 0.51, 0xe8f0ff);
        propBuf.box(x - 0.18, x + 0.18, 1.1, 1.6, z - 0.42, z - 0.3, 0x3a3a40);
        addCollider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 2.5, { y0: 0 });
      } else if (kind === 2) { // planter
        propBuf.box(x - 0.6, x + 0.6, 0.15, 0.7, z - 0.6, z + 0.6, 0x8a8a84); propBuf.box(x - 0.52, x + 0.52, 0.7, 0.72, z - 0.52, z + 0.52, 0x4a3a2a);
        for (let k = 0; k < 4; k++) propBuf.cyl(x + (k % 2 - 0.5) * 0.5, z + ((k >> 1) - 0.5) * 0.5, 0.26, 0.05, 0.7, 1.25, [0x3a8a3a, 0x4a9a3a, 0xe0508a, 0xf0d040][Math.floor(gjHash(x, z, 50 + k) * 4)], 6);
        addCollider(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 0.72, { y0: 0 });
      } else { // newspaper stand
        propBuf.box(x - 0.45, x + 0.45, 0.15, 1.0, z - 0.3, z + 0.3, 0x3a6a3a); propBuf.box(x - 0.4, x + 0.4, 1.0, 1.35, z - 0.25, z + 0.25, 0x2a2a2e);
        for (let k = 0; k < 3; k++) propBuf.box(x - 0.38 + k * 0.26, x - 0.16 + k * 0.26, 0.6, 0.95, z - 0.31, z - 0.3, [0xf0f0e8, 0xe8d050, 0xf0f0e8][k]);
        addCollider(x - 0.45, x + 0.45, z - 0.3, z + 0.3, 1.35, { y0: 0 });
      }
      gjClutter++;
      break;
    }
  }
}
worldHooks.beforeBake.push(() => { placeIndoorHides(); placeBoards(); placeTerraces(); placeStreetClutter(); });
export const clutterCount = () => gjClutter;

// =====================================================================
// Odd jobs
// =====================================================================
const GIG_KINDS = {
  delivery: { label: 'PARCEL DELIVERY', color: '#ffb84a', hex: 0xffb84a },
  leaflets: { label: 'LEAFLET ROUND', color: '#7ad0ff', hex: 0x7ad0ff },
  litter: { label: 'LITTER PICK', color: '#9aff7a', hex: 0x9aff7a },
  pet: { label: 'LOST CAT', color: '#ff9ad0', hex: 0xff9ad0 },
  bincrew: { label: 'BIN CREW', color: '#c8ff4a', hex: 0xc8ff4a },
};
const CAT_NAMES = ['BISCUIT', 'MR WHISKERS', 'NOODLE', 'DUCHESS', 'PICKLE', 'SIR PURRSALOT', 'MARMALADE', 'TOFFEE', 'PRINCESS FLUFFBALL', 'GERALD'];
const CLIENTS = ['MRS OKAFOR AT NUMBER 12', 'A MAN CALLED DES', 'THE CORNER SHOP', 'A VERY ANXIOUS LANDLORD', 'THE RESIDENTS\' COMMITTEE', 'SOMEONE WHO SIGNED IT "X"', 'NANA PEG', 'THE CHURCH HALL', 'A STRESSED CAFE OWNER', 'THE ALLOTMENT SOCIETY'];
const PARCELS = ['A SUSPICIOUSLY HEAVY BOX', 'A BIRTHDAY CAKE (DON\'T TIP IT)', 'A LAMP', 'SIX TINS OF PAINT', 'A RETURNED TOASTER', 'SOMEONE\'S LEFT SHOE', 'A BOX MARKED "FRAGILE!!"', 'A SIGNED FOOTBALL', 'A TANK OF GOLDFISH (LIDDED)'];
const LEAFLETS = ['PIZZA MENUS', 'LOST TORTOISE POSTERS', 'A CARPET SALE', 'THE SUMMER FETE', 'A MAGICIAN FOR PARTIES', 'A LOCAL BAND\'S GIG'];
const BOARD_BLURBS = ['"Reliable person wanted. Cash in hand. No questions asked, no questions answered."', '"Tear off a strip. Or don\'t. We\'re not your mum."', '"Help wanted. Must own legs."', '"Odd jobs for odd people. That\'s you, that is."'];
const payMul = (K) => (1 + GJ_STATE.rep * 0.06) * (1 + (K.G.day - 1) * 0.02);
const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
function nearWalkIns(x, z, r0, r1, filter = () => true) { return walkIns.filter((W) => { const d = Math.hypot(W.x - x, W.z - z); return d > r0 && d < r1 && filter(W); }); }
function gjMakeOffers(B, K) {
  B.offers = []; B.day = K.G.day;
  const kinds = ['delivery', 'leaflets', 'litter', 'pet', 'bincrew'].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const kind of kinds) {
    const O = { id: `${kind}-${Math.random().toString(36).slice(2, 7)}`, kind, client: mpick(CLIENTS), board: B };
    if (kind === 'delivery') {
      const from = mpick(nearWalkIns(B.x, B.z, 20, 160, (W) => !W.home)) || mpick(nearWalkIns(B.x, B.z, 10, 220));
      if (!from) continue;
      const to = mpick(nearWalkIns(from.x, from.z, 80, 260, (W) => W.home)) || mpick(nearWalkIns(from.x, from.z, 70, 260));
      if (!to) continue;
      O.from = from; O.to = to; O.what = mpick(PARCELS);
      const d = Math.hypot(to.x - from.x, to.z - from.z);
      O.pay = round5((18 + d * 0.12) * payMul(K)); O.time = Math.round(120 + d / 3);
      O.desc = `Collect ${O.what} from ${from.name} and drop it at ${to.name}, ${Math.round(d)} m away. Don't get it knocked about.`;
    } else if (kind === 'leaflets') {
      const doors = nearWalkIns(B.x, B.z, 15, 170).sort(() => Math.random() - 0.5).slice(0, 5);
      if (doors.length < 3) continue;
      O.doors = doors; O.what = mpick(LEAFLETS);
      O.pay = round5((10 + doors.length * 5) * payMul(K)); O.time = 200;
      O.desc = `Push leaflets for ${O.what} through ${doors.length} doors round here. Walk up to each door.`;
    } else if (kind === 'litter') {
      O.pay = round5(32 * payMul(K)); O.time = 160; O.bags = 7;
      O.desc = 'Seven bags of rubbish dumped on a patch of pavement. Clear the lot. Nobody looks at the person picking up litter.';
    } else if (kind === 'pet') {
      O.what = mpick(CAT_NAMES); O.pay = round5(mr(40, 60) * payMul(K)); O.time = 240;
      O.desc = `${O.what} hasn't come home. Search the marked area, creep up slowly (crouch, they spook easily) and bring them back here.`;
    } else {
      O.pay = round5(35 * payMul(K)); O.time = 220; O.need = 45;
      O.desc = 'The council\'s short-handed. Find a bin lorry and ride the back step for 45 seconds. Hi-vis provided, in spirit.';
    }
    O.label = GIG_KINDS[kind].label;
    B.offers.push(O);
  }
}
// the notice board menu (uses the same panel as the shops)
export function gigMenu(K) {
  return {
    cash: () => K.player.cash,
    items(kind, B) {
      if (B.day !== K.G.day || !B.offers.length) gjMakeOffers(B, K);
      const G0 = GJ_STATE.gig;
      return B.offers.map((O) => ({ id: O.id, name: `${O.label} · ${O.client}`, desc: O.desc + ` ${Math.floor(O.time / 60)}:${String(O.time % 60).padStart(2, '0')} to do it.`, price: O.pay, tag: G0 && G0.offer === O ? 'DROP IT' : O.taken ? 'TAKEN' : `PAYS $${O.pay}` }));
    },
    state() { return ''; },
    buy(it) {
      const G0 = GJ_STATE.gig;
      if (G0 && G0.offer.id === it.id) { endGig(K, false, 'JOB DROPPED. THEY\'LL FIND SOMEONE ELSE'); return 'JOB DROPPED'; }
      if (G0) return 'FINISH THE JOB YOU\'RE ON FIRST (OR DROP IT)';
      if (K.G.super) return 'HEROES DON\'T DO ODD JOBS. ALLEGEDLY';
      const B = gigBoards.find((b) => b.offers.some((o) => o.id === it.id)); const O = B && B.offers.find((o) => o.id === it.id);
      if (!O) return 'THAT ONE\'S BEEN TORN DOWN';
      if (O.taken) return 'SOMEONE ELSE IS ON IT (YOU, EARLIER)';
      startGig(O, K);
      setTimeout(() => K.leaveShop(), 700);
      return `JOB TAKEN: ${O.label}. FOLLOW THE MARKER.`;
    },
  };
}
export function gigBoardNear(x, y, z) {
  if (y > 1.5) return null;
  for (const B of gigBoards) if (Math.abs(B.x - x) < 2.2 && Math.abs(B.z - z) < 2.2) return B;
  return null;
}
export function boardBlurbs() { return BOARD_BLURBS; }

// ---------------------------------------------------------------------
// meshes for the jobs: litter bags, the cat, marker beams
// ---------------------------------------------------------------------
const gjMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const bagGeo = (() => { const b = new GeoBuf(); b.box(-0.22, 0.22, 0, 0.42, -0.2, 0.2, 0x1a1a1e); b.box(-0.06, 0.06, 0.42, 0.52, -0.05, 0.05, 0x2a2a2e); return b.geometry(); })();
const catGeo = (() => {
  const b = new GeoBuf(), o = 0xe08a3a, d = 0xc06a2a;
  b.box(-0.1, 0.1, 0.12, 0.3, -0.22, 0.2, o); b.box(-0.09, 0.09, 0.22, 0.4, 0.18, 0.36, o);
  b.box(-0.08, -0.03, 0.4, 0.47, 0.25, 0.3, d); b.box(0.03, 0.08, 0.4, 0.47, 0.25, 0.3, d);
  for (const [x, z] of [[-0.07, 0.14], [0.07, 0.14], [-0.07, -0.16], [0.07, -0.16]]) b.box(x - 0.03, x + 0.03, 0, 0.13, z - 0.03, z + 0.03, d);
  b.box(-0.025, 0.025, 0.25, 0.5, -0.3, -0.22, d); b.box(-0.02, 0.02, 0.33, 0.35, 0.36, 0.37, 0x111111);
  return b.geometry();
})();
const beamMats = {};
const gjBeamGeo = new THREE.CylinderGeometry(0.45, 0.45, 60, 10, 1, true); gjBeamGeo.translate(0, 30, 0);
const beams = [];
function beamAt(i, x, y, z, hex) {
  let m = beams[i];
  if (!m) { m = new THREE.Mesh(gjBeamGeo, null); m.renderOrder = 3; scene.add(m); beams[i] = m; }
  if (!beamMats[hex]) beamMats[hex] = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.material = beamMats[hex]; m.position.set(x, y, z); m.visible = true;
}
const gigMeshes = [];
function clearGigMeshes() { for (const m of gigMeshes) scene.remove(m); gigMeshes.length = 0; }

function startGig(O, K) {
  O.taken = true;
  const g = { offer: O, kind: O.kind, t: O.time, pay: O.pay, stage: 0, carry: null, bumps: 0, hp0: K.player.hp, targets: [] };
  if (O.kind === 'delivery') g.targets = [{ x: O.from.x, z: O.from.z, label: 'COLLECT' }];
  else if (O.kind === 'leaflets') g.targets = O.doors.map((W) => ({ x: W.x, z: W.z, label: 'DOOR', W }));
  else if (O.kind === 'litter') {
    const c = randomOpenPoint(O.board.x, O.board.z, 30, 100) || { x: O.board.x + 30, z: O.board.z };
    for (let i = 0; i < O.bags; i++) {
      const p = randomOpenPoint(c.x, c.z, 1, 14) || { x: c.x + mr(-6, 6), z: c.z + mr(-6, 6) };
      const m = new THREE.Mesh(bagGeo, gjMat); m.position.set(p.x, 0.15, p.z); m.rotation.y = mr(0, 6); scene.add(m); gigMeshes.push(m);
      g.targets.push({ x: p.x, z: p.z, label: 'BAG', mesh: m });
    }
  } else if (O.kind === 'pet') {
    const p = randomOpenPoint(O.board.x, O.board.z, 60, 150) || randomOpenPoint(O.board.x, O.board.z, 30, 100) || { x: O.board.x + 50, z: O.board.z };
    const m = new THREE.Mesh(catGeo, gjMat); m.position.set(p.x, 0.15, p.z); scene.add(m); gigMeshes.push(m);
    g.cat = { x: p.x, z: p.z, m, spooked: 0, seen: false, meowT: 0, runT: 0, tx: p.x, tz: p.z };
    g.area = { x: p.x + mr(-14, 14), z: p.z + mr(-14, 14), r: 24 };
    g.targets = [{ x: g.area.x, z: g.area.z, label: 'SEARCH', area: true }];
  } else if (O.kind === 'bincrew') { g.rode = 0; g.targets = []; }
  GJ_STATE.gig = g;
  K.sfx.pickup();
}
function endGig(K, ok, msg) {
  const g = GJ_STATE.gig; if (!g) return;
  GJ_STATE.gig = null; clearGigMeshes();
  for (const m of beams) if (m) m.visible = false;
  if (ok) {
    let pay = g.pay;
    if (g.kind === 'delivery' && g.bumps > 0) pay = round5(pay * Math.max(0.4, 1 - g.bumps * 0.25));
    K.addCash(pay); K.sfx.cash(); GJ_STATE.done++; GJ_STATE.earned += pay; GJ_STATE.rep = Math.min(10, GJ_STATE.rep + 1);
    K.showMsg(`${msg} +$${pay}`, 2.6);
  } else {
    if (msg) K.showMsg(msg, 2.4);
    GJ_STATE.failed++; GJ_STATE.rep = Math.max(0, GJ_STATE.rep - 1);
  }
}
// odd jobs make you look like you belong (a negative nudge on how much you stand out)
export function gigConspic(K) {
  const g = GJ_STATE.gig, R = GJ_STATE.ride;
  let k = 0;
  if (g && (g.carry || g.kind === 'litter' || g.kind === 'leaflets')) k -= 0.12;
  if (R && R.mode === 'step') k -= 0.15;
  if (k && K.player.outfit && K.player.outfit.body === 'hivis') k -= 0.1;
  return k;
}
function updateGig(dt, K) {
  const g = GJ_STATE.gig; if (!g) return;
  const P = K.player;
  g.t -= dt;
  if (g.t <= 0) { endGig(K, false, g.kind === 'pet' ? 'TOO SLOW. THE CAT CAME HOME BY ITSELF. NO PAY' : 'TOO SLOW. THE CLIENT GAVE UP ON YOU'); return; }
  if (!P.alive) { endGig(K, false, ''); return; }
  const near = (x, z, r) => Math.abs(P.x - x) < r && Math.abs(P.z - z) < r && Math.hypot(P.x - x, P.z - z) < r && P.y < 2;
  if (g.kind === 'delivery') {
    if (g.carry && P.hp < g.hp0 - 8) { g.bumps++; K.showMsg(g.bumps > 2 ? 'THE PARCEL IS BASICALLY A PANCAKE NOW' : 'OOF. THE PARCEL TOOK A KNOCK', 1.6); }
    g.hp0 = P.hp;
    const T = g.targets[0];
    if (T && near(T.x, T.z, 2.2) && !P.car) {
      if (!g.carry) { g.carry = 'parcel'; K.sfx.pickup(); K.showMsg(`GOT ${g.offer.what}. NOW TO ${g.offer.to.name}`, 2.4); g.targets = [{ x: g.offer.to.x, z: g.offer.to.z, label: 'DROP' }]; }
      else { g.carry = null; endGig(K, true, g.bumps ? 'DELIVERED. A BIT DENTED' : 'DELIVERED. SIGNED FOR'); }
    }
  } else if (g.kind === 'leaflets') {
    for (const T of g.targets) if (!T.done && near(T.x, T.z, 2.4) && !P.car) { T.done = true; K.sfx.paper(); K.showMsg(`LEAFLET IN. ${g.targets.filter((q) => !q.done).length} TO GO`, 1.2); }
    if (g.targets.every((T) => T.done)) endGig(K, true, 'ALL LEAFLETS POSTED');
  } else if (g.kind === 'litter') {
    for (const T of g.targets) if (!T.done && near(T.x, T.z, 1.5) && !P.car) { T.done = true; T.mesh.visible = false; K.sfx.paper(); }
    if (g.targets.every((T) => T.done)) endGig(K, true, 'PAVEMENT SPOTLESS');
  } else if (g.kind === 'pet') updateCat(g, dt, K, near);
  else if (g.kind === 'bincrew') {
    if (GJ_STATE.ride && GJ_STATE.ride.mode === 'step') { g.rode += dt; if (g.rode >= g.offer.need) endGig(K, true, 'SHIFT DONE. THE CREW SAYS YOU\'RE ALRIGHT'); }
    const L = nearestLorry(K, P.x, P.z); g.targets = L ? [{ x: L.x, z: L.z, label: 'LORRY' }] : [];
  }
}
function updateCat(g, dt, K, near) {
  const C = g.cat, P = K.player;
  if (g.carry === 'cat') {
    C.m.position.set(P.x + Math.sin(-P.yaw) * 0.0, -50, P.z); // tucked under your arm (out of view)
    if (P.sprinting && Math.random() < dt * 0.12) {
      g.carry = null; const p = randomOpenPoint(P.x, P.z, 6, 12) || { x: P.x + 6, z: P.z };
      C.x = P.x; C.z = P.z; C.tx = p.x; C.tz = p.z; C.runT = 2; K.sfx.meow(); K.showMsg(`${g.offer.what} WRIGGLED FREE! DON'T RUN WITH A CAT`, 2);
      g.targets = [{ x: p.x, z: p.z, label: 'CAT' }];
    } else if (near(g.offer.board.x, g.offer.board.z, 2.6)) { g.carry = null; endGig(K, true, `${g.offer.what} IS HOME. THE OWNER WEEPS WITH JOY`); }
    return;
  }
  const d = Math.hypot(P.x - C.x, P.z - C.z);
  if (C.runT > 0) {
    C.runT -= dt; const dx = C.tx - C.x, dz = C.tz - C.z, l = Math.hypot(dx, dz);
    if (l > 0.2) { const s = Math.min(l, 7 * dt); C.x += dx / l * s; C.z += dz / l * s; C.m.rotation.y = Math.atan2(dx, dz); }
  }
  C.m.position.set(C.x, 0.15 + (C.runT > 0 ? Math.abs(Math.sin(K.G.elapsed * 18)) * 0.08 : 0), C.z);
  if (!C.seen && d < 16) { C.seen = true; K.sfx.meow(); K.showMsg(`THERE'S ${g.offer.what}. CROUCH AND CREEP UP`, 2.2); g.targets = [{ x: C.x, z: C.z, label: 'CAT' }]; }
  if (C.seen) { g.targets[0].x = C.x; g.targets[0].z = C.z; }
  C.meowT -= dt; if (C.seen && C.meowT < 0 && d < 30) { C.meowT = mr(3, 6); K.sfx.meow(); }
  const sneaky = P.crouch > 0.5 || K.input.crouch;
  if (d < 4.5 && !sneaky && C.runT <= 0 && C.spooked < 3) {
    C.spooked++; const p = randomOpenPoint(C.x, C.z, 7, 12) || { x: C.x + 7, z: C.z }; C.tx = p.x; C.tz = p.z; C.runT = 1.8; K.sfx.meow();
    if (C.spooked === 1) K.showMsg('IT BOLTED. CROUCH NEXT TIME', 1.6);
  }
  if (d < 1.3 && C.runT <= 0 && !P.car) { g.carry = 'cat'; K.sfx.pickup(); K.showMsg(`GOT ${g.offer.what}. TAKE THEM BACK TO THE BOARD. NO RUNNING`, 2.4); g.targets = [{ x: g.offer.board.x, z: g.offer.board.z, label: 'HOME' }]; }
}
// what the minimap should mark for the current job
export function gigMapMarks() {
  const g = GJ_STATE.gig; if (!g) return [];
  const col = GIG_KINDS[g.kind].color;
  return g.targets.filter((T) => !T.done).map((T) => ({ x: T.x, z: T.z, color: col, area: T.area ? g.area.r : 0 }));
}
export function gigHud(K) {
  const g = GJ_STATE.gig; if (!g) return '';
  const P = K.player, open = g.targets.filter((T) => !T.done);
  const nT = open.reduce((b, T) => (!b || Math.hypot(T.x - P.x, T.z - P.z) < Math.hypot(b.x - P.x, b.z - P.z) ? T : b), null);
  const dist = nT ? `${Math.round(Math.hypot(nT.x - P.x, nT.z - P.z))} m · ` : '';
  const t = `${Math.floor(g.t / 60)}:${String(Math.floor(g.t % 60)).padStart(2, '0')}`;
  let what = '';
  if (g.kind === 'delivery') what = g.carry ? `TAKE IT TO ${g.offer.to.name}` : `COLLECT FROM ${g.offer.from.name}`;
  else if (g.kind === 'leaflets') what = `${open.length} DOORS LEFT`;
  else if (g.kind === 'litter') what = `${open.length} BAGS LEFT`;
  else if (g.kind === 'pet') what = g.carry === 'cat' ? `${g.offer.what} BACK TO THE BOARD` : g.cat.seen ? `CATCH ${g.offer.what} (CROUCH)` : `FIND ${g.offer.what} IN THE PINK AREA`;
  else what = GJ_STATE.ride && GJ_STATE.ride.mode === 'step' ? `RIDING · ${Math.ceil(g.offer.need - g.rode)} s TO GO` : 'FIND A BIN LORRY, HOP ON THE BACK';
  return `<b style="color:${GIG_KINDS[g.kind].color}">${GIG_KINDS[g.kind].label}</b> ${what}<br>${dist}${t} left · pays $${g.pay}`;
}

// =====================================================================
// Bin lorries
// =====================================================================
const lorriesOf = (K) => K.G.cars.filter((c) => c.kind === 'binlorry' && !c.wrecked);
function nearestLorry(K, x, z) { let b = null, bd = 1e9; for (const L of lorriesOf(K)) { const d = Math.hypot(L.x - x, L.z - z); if (d < bd) { bd = d; b = L; } } return b; }
const rearOf = (L, extra = 0.7) => ({ x: L.x - L.fx * (L.hl + extra), z: L.z - L.fz * (L.hl + extra) });
// traffic logic: pull up beside wheelie bins on the pavement and empty them
export function lorryLogic(L, dt, target, K) {
  if (L.stopT > 0) {
    L.stopT -= dt;
    if (L.stopT <= 0 && L.binAt) {
      const B = L.binAt; L.binAt = null; B.emptied = K.G.day; GJ_STATE.binsEmptied++;
      if (Math.hypot(B.x - K.player.x, B.z - K.player.z) < 45) { K.sfx.bin(); comicWord('CLANK', B.x, 1.8, B.z); }
      for (let i = 0; i < 3; i++) emitPuff(B.x + mr(-0.4, 0.4), 1.6, B.z + mr(-0.4, 0.4), { life: 1, vy: 1, size0: 0.3, size1: 1, alpha: 0.3, color: 0x8a8a70 });
    }
    return 0;
  }
  L.scanT = (L.scanT || 0) - dt;
  if (L.scanT > 0) return target;
  L.scanT = 0.35;
  for (const B of streetPropObjs) {
    if (B.kind !== 'wheelie' || B.state !== 'up' || B.emptied === K.G.day) continue;
    const ax = B.x - L.x, az = B.z - L.z, ahead = ax * L.fx + az * L.fz, side = Math.abs(ax * L.fz - az * L.fx);
    if (ahead > -1 && ahead < 2.5 && side < 8) { L.stopT = mr(3, 4.5); L.binAt = B; return 0; }
  }
  return target;
}
export function lorryRearNear(K) {
  const P = K.player;
  if (P.car || P.hide || P.bike || P.mode !== 'move' || GJ_STATE.ride || K.G.super) return null;
  for (const L of lorriesOf(K)) { const r = rearOf(L, 0.4); if (Math.abs(L.speed) < 4.5 && Math.hypot(r.x - P.x, r.z - P.z) < 2.2 && P.y < 1.5) return L; }
  return null;
}
export function hopOnLorry(L, K) {
  GJ_STATE.ride = { car: L, mode: 'step', t: 0, stallT: 0, crouchWas: true };
  K.sfx.thunk(); K.showMsg(`ON THE BACK STEP. ${K.isTouch() ? 'CROUCH' : 'C'} TO DROP INTO THE HOPPER · ${K.isTouch() ? 'USE' : 'E'} TO HOP OFF`, 3);
}
export function hopOffLorry(K, msg) {
  const R = GJ_STATE.ride; if (!R) return;
  GJ_STATE.ride = null;
  const L = R.car, P = K.player;
  if (R.mode === 'hopper' && P.hide === R.spot) K.leaveHide();
  const side = { x: L.fz, z: -L.fx }, r = rearOf(L, 1.2);
  let p = null;
  for (const [a, b] of [[0, 0], [1.4, 0], [-1.4, 0], [0, 1], [2.2, 0.6], [-2.2, 0.6]]) { const x = r.x + side.x * a - L.fx * b, z = r.z + side.z * a - L.fz * b; if (!pointBlocked(x, z, 0.35)) { p = { x, z }; break; } }
  if (p) { P.x = p.x; P.z = p.z; }
  P.y = 0; P.vx = P.vz = 0; P.vy = 0;
  K.sfx.thunk(); if (msg) K.showMsg(msg, 2);
}
// keeps the rider stuck to the lorry. Returns true while riding (the player doesn't move themselves)
export function gigRidePlayer(dt, K) {
  const R = GJ_STATE.ride; if (!R) return false;
  const L = R.car, P = K.player, inp = K.input;
  if (!P.alive || L.wrecked || !K.G.cars.includes(L)) { hopOffLorry(K, 'THE LORRY\'S DONE FOR. OFF YOU GET'); return false; }
  R.t += dt;
  // a lorry that has stopped for good (end of the road) puts you off
  if (Math.abs(L.speed) < 0.4 && !(L.stopT > 0)) R.stallT += dt; else R.stallT = 0;
  if (R.stallT > 3) { hopOffLorry(K, 'END OF THE ROUND'); return false; }
  const r = rearOf(L, R.mode === 'step' ? 0.35 : -1.2), side = { x: L.fz, z: -L.fx };
  if (R.mode === 'step') {
    P.x = r.x + side.x * 0.55; P.z = r.z + side.z * 0.55; P.y = 0.45; P.vx = P.vz = 0; P.vy = 0; P.sprinting = false;
    const cr = !!inp.crouch;
    if (cr && !R.crouchWas) { // into the hopper you go
      R.mode = 'hopper'; R.hopT = 0; GJ_STATE.hopperRides++;
      R.spot = { kind: 'lorry', x: r.x, z: r.z, lx: 0.9, lz: 0.9, top: 2.4, eye: { x: r.x, y: 2.1, z: r.z }, stand: { x: r.x, z: r.z, ux: -L.fx, uz: -L.fz }, lorry: L };
      K.enterHide(R.spot);
      K.showMsg(`IN WITH THE RUBBISH. NOBODY WILL LOOK HERE. ${K.isTouch() ? 'USE' : 'E'} TO CLIMB OUT`, 2.6);
    }
    R.crouchWas = cr;
    return true;
  }
  // in the hopper: the spot moves with the lorry
  const S = R.spot;
  if (P.hide !== S) { GJ_STATE.ride = null; return false; }
  const rr = rearOf(L, 1.4);
  S.x = r.x; S.z = r.z; S.eye.x = r.x - L.fx * 0.3; S.eye.z = r.z - L.fz * 0.3; S.stand.x = rr.x; S.stand.z = rr.z; S.stand.ux = -L.fx; S.stand.uz = -L.fz;
  P.x = r.x; P.z = r.z;
  R.hopT += dt;
  if (R.hopT > 28 && !R.warned) { R.warned = true; K.sfx.compactor(); K.showMsg('THE COMPACTOR IS WARMING UP. GET OUT!', 2.2); }
  if (R.hopT > 34) { hopOffLorry(K, 'SQUEEZED OUT BY THE COMPACTOR. YOU REEK'); K.hurt(6); K.smell(80); }
  return true;
}
export function updateGigs(dt, K) {
  updateGig(dt, K);
  const R = GJ_STATE.ride;
  if (R && R.mode === 'hopper' && K.player.hide !== R.spot) { GJ_STATE.ride = null; K.smell(50); }
  // beams over the current targets (nearest few)
  let n = 0;
  const g = GJ_STATE.gig;
  if (g) {
    const hex = GIG_KINDS[g.kind].hex, P = K.player;
    const open = g.targets.filter((T) => !T.done && !T.area).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
    for (const T of open.slice(0, 6)) beamAt(n++, T.x, 0, T.z, hex);
  }
  for (let i = n; i < beams.length; i++) beams[i].visible = false;
}
export function resetGigs() {
  GJ_STATE.gig = null; GJ_STATE.ride = null; GJ_STATE.rep = 0; GJ_STATE.done = 0; GJ_STATE.earned = 0; GJ_STATE.failed = 0; GJ_STATE.binsEmptied = 0; GJ_STATE.hopperRides = 0;
  clearGigMeshes(); for (const m of beams) if (m) m.visible = false;
  for (const B of gigBoards) { B.offers = []; B.day = 0; }
}
export function gigsDebug() {
  const kinds = {}; for (const S of hideSpots) kinds[S.kind] = (kinds[S.kind] || 0) + 1;
  return { boards: gigBoards.length, clutter: gjClutter, terraceMiss: gjTerraceMiss, terraceSeats: terraceSeats.length, hideKinds: kinds, gig: GJ_STATE.gig ? { kind: GJ_STATE.gig.kind, targets: GJ_STATE.gig.targets.length, carry: GJ_STATE.gig.carry, t: GJ_STATE.gig.t } : null, ride: GJ_STATE.ride ? GJ_STATE.ride.mode : null, rep: GJ_STATE.rep, done: GJ_STATE.done, earned: GJ_STATE.earned, binsEmptied: GJ_STATE.binsEmptied };
}
export const gigInternals = { startGig, endGig, gjMakeOffers, rearOf, nearestLorry, clamp };
