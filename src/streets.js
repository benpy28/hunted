// Streets: walk-in shops on the ground floors of city blocks (cafes, corner marts, laundromats, diners,
// barbers, bookshops, arcades, bars...), and the street dressing that makes a town feel lived in:
// trees in grates, benches, bins, hydrants, news boxes, bus shelters, cafe tables, food carts, phone
// boxes, bike racks, planters, utility poles and wires, courtyards full of bins and washing lines.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, srand, sr, spick } from './core.js';
import {
  CITIES, SW, colliders, blockRects, siteOverrides, blockKey, worldHooks, lotHooks, keepClear, navOpen, groundHoles, pointBlocked, inHole, addCollider,
  propBuf, glowBuf, markBuf, SIDES, sideInfo, shopSign, outBox, slope, blob, addTree, AWNINGS, GREENS, SHOP_NAMES, staticMesh, adMats, edgeMat,
} from './world.js';
import { solid, ib, floorB, lightB, glassB, lamp, interiorZones } from './interiors.js';

export const walkIns = []; // {x, z, name, kind, city, keeper:{x,z,face}, rect}
// places townsfolk go to do things: sit on a bench, wait for the bus, queue at a food cart
export const lifeSpots = []; // {kind: 'bench'|'bus'|'cart', x, z, face, sx, sz} (sx,sz: where you sit or stand)

// ---------------------------------------------------------------------
// local frame for a lot: a runs along the street front, b goes in from the front (0) to the back (D)
// ---------------------------------------------------------------------
export function frameOf(L, side) {
  const I = sideInfo(side, L.x0, L.x1, L.z0, L.z1), D = side[1] === 'x' ? L.x1 - L.x0 : L.z1 - L.z0;
  const toXZ = (a, b) => (side[1] === 'x' ? [I.fixed - I.out * b, a] : [a, I.fixed - I.out * b]);
  const rect = (a0, a1, b0, b1) => { const [xa, za] = toXZ(a0, b0), [xb, zb] = toXZ(a1, b1); return [Math.min(xa, xb), Math.max(xa, xb), Math.min(za, zb), Math.max(za, zb)]; };
  return {
    I, D, A0: I.a0, A1: I.a1, side, toXZ, rect,
    box(buf, a0, a1, b0, b1, y0, y1, col, collide, extra) {
      this.n = (this.n || 0) + 1;
      const [x0, x1, z0, z1] = rect(a0, a1, b0, b1);
      if (collide) return solid(buf, x0, x1, y0, y1, z0, z1, col, extra);
      buf.box(x0, x1, y0, y1, z0, z1, col, { bottom: true });
    },
    cyl(buf, a, b, r, rt, y0, y1, col, segs = 10, cap = true) { this.n = (this.n || 0) + 1; const [x, z] = toXZ(a, b); buf.cyl(x, z, r, rt, y0, y1, col, segs, cap); },
    lamp(a0, a1, b0, b1, y, col) { const [x0, x1, z0, z1] = rect(a0, a1, b0, b1); lamp(x0, x1, y, z0, z1, col); },
    glow(a0, a1, b0, b1, y0, y1, col) { const [x0, x1, z0, z1] = rect(a0, a1, b0, b1); lightB.box(x0, x1, y0, y1, z0, z1, col, { bottom: true }); },
  };
}

// ---------------------------------------------------------------------
// walk-in shop kinds: what's inside
// ---------------------------------------------------------------------
const H_IN = 4.6;
const chair = (F, a, b, col) => { F.box(ib, a - 0.22, a + 0.22, b - 0.22, b + 0.22, 0.2, 0.65, col); F.box(ib, a - 0.22, a + 0.22, b + 0.17, b + 0.22, 0.65, 1.15, col); };
const table = (F, a, b, top = 0xe8e0d0, r = 0.45) => { F.cyl(ib, a, b, 0.06, 0.06, 0.2, 0.95, 0x3a3a3e, 6); F.cyl(ib, a, b, r, r, 0.95, 1.0, top, 12); F.cyl(ib, a, b, 0.3, 0.3, 0.2, 0.24, 0x3a3a3e, 8); };
const stool = (F, a, b, col) => { F.cyl(ib, a, b, 0.05, 0.05, 0.2, 0.85, 0x9a9aa0, 6); F.cyl(ib, a, b, 0.22, 0.22, 0.85, 0.95, col, 10); };
const PRODUCT = [0xd04a3a, 0x3a7ad0, 0xe0c040, 0x4aa05a, 0xf0f0f0, 0xe07a2a, 0x9a4ad0, 0x2ab0b0];
function shelfUnit(F, a0, a1, b0, b1, h, col = 0xd8d8dc) {
  F.box(ib, a0, a1, b0, b1, 0.2, h, col, true);
  for (let y = 0.5; y < h - 0.2; y += 0.45) {
    let a = a0 + 0.05;
    while (a < a1 - 0.1) { const w = Math.min(a1 - 0.05 - a, sr(0.25, 0.7)); F.box(ib, a, a + w, b0 - 0.04, b1 + 0.04, y, y + sr(0.2, 0.36), spick(PRODUCT)); a += w + 0.04; }
  }
}
const KINDS = {
  cafe: { names: [0, 18, 23, 25, 27, 28], wall: 0xe8d8c0, frame: 0x3a2418, fill(F) {
    const { A0, A1, D } = F, am = (A0 + A1) / 2;
    F.box(ib, A0 + 1, A1 - 1.5, D - 2.2, D - 1.5, 0.2, 1.1, 0x6a4a32, true); F.box(ib, A0 + 0.9, A1 - 1.4, D - 2.3, D - 1.4, 1.1, 1.17, 0xe8e0d0);
    F.box(ib, A0 + 1.3, A0 + 2.0, D - 2.0, D - 1.6, 1.17, 1.65, 0x9a9aa2); F.glow(A0 + 2.4, A0 + 3.6, D - 2.0, D - 1.6, 1.17, 1.5, 0xffe0b0); // espresso machine + pastry case
    F.box(ib, A0 + 0.5, A1 - 0.5, D - 0.4, D - 0.3, 2.2, 3.2, 0x1a1a1a); for (let a = A0 + 0.8; a < A1 - 0.8; a += 0.5) F.box(ib, a, a + 0.3, D - 0.42, D - 0.4, 2.4 + (a * 7 % 3) * 0.2, 2.45 + (a * 7 % 3) * 0.2, 0xf0f0e0); // menu board
    for (const [a, b] of [[A0 + 1.6, 1.6], [am + 0.8, 1.6], [A1 - 1.6, 3.2], [A0 + 1.6, 3.4]]) if (b < D - 3) { table(F, a, b); chair(F, a - 0.65, b, 0x6a4a32); chair(F, a + 0.65, b, 0x6a4a32); }
    for (const a of [A0 + 1.5, am, A1 - 1.5]) { F.box(ib, a - 0.01, a + 0.01, 1.8, 1.82, 3.4, H_IN - 0.3, 0x222222); F.cyl(ib, a, 1.8, 0.25, 0.08, 3.1, 3.4, 0x2a5a3a, 8); }
  } },
  mart: { names: [1, 8, 30], wall: 0xf0f0ea, frame: 0xc8302a, fill(F) {
    const { A0, A1, D } = F;
    for (let a = A0 + 1.8; a < A1 - 1.5; a += 2.4) shelfUnit(F, a - 0.35, a + 0.35, 2.2, D - 2.4, 1.8);
    F.glow(A0 + 0.5, A1 - 0.5, D - 0.6, D - 0.45, 0.4, 2.3, 0xd8f0ff); F.box(ib, A0 + 0.4, A1 - 0.4, D - 0.75, D - 0.6, 0.2, 2.5, 0xb8c0c8); // fridges
    for (let a = A0 + 0.9; a < A1 - 0.6; a += 0.9) F.box(ib, a - 0.03, a + 0.03, D - 0.62, D - 0.6, 0.4, 2.3, 0x8a9098);
    const ta = F.dm > (A0 + A1) / 2 ? A0 + 0.6 : A1 - 2.4; // till on the side away from the door
    F.box(ib, ta, ta + 1.8, 0.9, 1.6, 0.2, 1.05, 0x3a3a40, true); F.box(ib, ta + 0.4, ta + 0.9, 1.0, 1.4, 1.05, 1.35, 0x1a1a1a);
    F.box(ib, ta - 0.2, ta + 2.0, 0.3, 0.45, 1.6, 2.6, 0x8a6a4a); // cigarette rack
  } },
  laundry: { names: [2], wall: 0xd8ecf8, frame: 0x2a7ac0, fill(F) {
    const { A0, A1, D } = F;
    for (let b = 1.6; b < D - 1; b += 1.0) { F.box(ib, A0 + 0.3, A0 + 1.2, b - 0.45, b + 0.45, 0.2, 1.1, 0xf4f4f4, true); F.box(ib, A0 + 1.2, A0 + 1.22, b - 0.3, b + 0.3, 0.4, 0.95, 0x2a3a4a); }
    for (let b = 1.6; b < D - 1; b += 1.0) { F.box(ib, A1 - 1.2, A1 - 0.3, b - 0.45, b + 0.45, 0.2, 1.1, 0xf4f4f4, true); F.box(ib, A1 - 1.2, A1 - 0.3, b - 0.45, b + 0.45, 1.1, 2.0, 0xe8e8e8); F.glow(A1 - 1.22, A1 - 1.2, b - 0.2, b + 0.2, 1.5, 1.7, 0x6affa0); }
    F.box(ib, (A0 + A1) / 2 - 0.6, (A0 + A1) / 2 + 0.6, 2, D - 2, 0.2, 0.95, 0xc8c0b0, true);
    for (let b = 2.2; b < D - 2; b += 1.2) chair(F, (A0 + A1) / 2 + 1.0, b, 0xe07a2a);
    F.box(ib, A0 + 0.3, A0 + 1.1, D - 1.1, D - 0.3, 0.2, 1.9, 0x2a5a9a, true); F.glow(A0 + 1.1, A0 + 1.12, D - 1.0, D - 0.4, 0.9, 1.7, 0xffffff); // vending machine
  } },
  diner: { names: [3, 9, 20], wall: 0xf0e0c0, frame: 0xb0201a, fill(F) {
    const { A0, A1, D } = F;
    F.box(ib, A0 + 1, A1 - 1, D - 2.6, D - 2.0, 0.2, 1.1, 0xc83a2a, true); F.box(ib, A0 + 0.9, A1 - 0.9, D - 2.7, D - 1.9, 1.1, 1.16, 0xe8e8e8);
    for (let a = A0 + 1.5; a < A1 - 1; a += 1.1) stool(F, a, D - 3.2, 0xc83a2a);
    F.box(ib, A0 + 0.6, A1 - 0.6, D - 0.5, D - 0.3, 1.2, 1.25, 0xaaaaaa); F.glow(A0 + 1, A0 + 2.5, D - 0.6, D - 0.3, 1.25, 1.8, 0xffd8a0); // pie case
    for (let a = A0 + 1.5; a < A1 - 1.5; a += 2.4) { // window booths
      F.box(ib, a - 0.9, a + 0.9, 0.5, 0.75, 0.2, 1.3, 0xb02a2a); F.box(ib, a - 0.9, a + 0.9, 0.75, 1.15, 0.2, 0.55, 0xb02a2a);
      F.box(ib, a - 0.7, a + 0.7, 1.2, 1.9, 0.95, 1.0, 0xe8e8e8); F.cyl(ib, a, 1.55, 0.06, 0.06, 0.2, 0.95, 0x9a9aa0, 6);
      F.box(ib, a - 0.9, a + 0.9, 1.95, 2.35, 0.2, 0.55, 0xb02a2a); F.box(ib, a - 0.9, a + 0.9, 2.35, 2.6, 0.2, 1.3, 0xb02a2a);
    }
  } },
  barber: { names: [4, 22], wall: 0xf4f0e8, frame: 0x1a1a1a, fill(F) {
    const { A0, A1, D } = F;
    for (let b = 1.8; b < D - 1.5; b += 2.0) {
      F.box(ib, A0 + 1.0, A0 + 1.6, b - 0.35, b + 0.35, 0.2, 0.7, 0x3a3a3e); F.box(ib, A0 + 0.9, A0 + 1.7, b - 0.4, b + 0.4, 0.7, 1.05, 0xb02a2a); F.box(ib, A0 + 0.9, A0 + 1.05, b - 0.4, b + 0.4, 1.05, 1.9, 0xb02a2a);
      F.glow(A0 + 0.27, A0 + 0.3, b - 0.6, b + 0.6, 1.3, 2.4, 0xdfe8f0); F.box(ib, A0 + 0.27, A0 + 0.7, b - 0.5, b + 0.5, 0.9, 1.0, 0xe8e8e8);
    }
    for (let b = 1.5; b < D - 1.5; b += 0.7) chair(F, A1 - 0.7, b, 0x2a2a2e);
    F.cyl(ib, F.A1 - 0.4, -0.25, 0.12, 0.12, 2.0, 3.0, 0xf0f0f0, 8);
  } },
  books: { names: [5, 14, 24], wall: 0xe8dcc0, frame: 0x2f5a3a, fill(F) {
    const { A0, A1, D } = F;
    shelfUnit(F, A0 + 0.3, A0 + 0.75, 1.0, D - 0.5, 2.6, 0x6a4a2a); shelfUnit(F, A1 - 0.75, A1 - 0.3, 1.0, D - 0.5, 2.6, 0x6a4a2a);
    shelfUnit(F, A0 + 1.5, A1 - 1.5, D - 0.75, D - 0.3, 2.6, 0x6a4a2a);
    F.box(ib, (A0 + A1) / 2 - 0.8, (A0 + A1) / 2 + 0.8, 2.2, 3.4, 0.2, 0.85, 0x5a3a22, true);
    for (let k = 0; k < 6; k++) F.box(ib, (A0 + A1) / 2 - 0.7 + k * 0.25, (A0 + A1) / 2 - 0.5 + k * 0.25, 2.4, 2.7, 0.85, 0.85 + sr(0.1, 0.35), spick(PRODUCT));
    F.box(ib, A0 + 1.2, A0 + 2.1, D - 2.2, D - 1.3, 0.2, 0.6, 0x7a2a2a); F.box(ib, A0 + 1.2, A0 + 2.1, D - 1.45, D - 1.3, 0.6, 1.3, 0x7a2a2a);
  } },
  arcade: { names: [6, 26], wall: 0x1a1a2a, frame: 0x5a1a8a, fill(F) {
    const { A0, A1, D } = F;
    const cab = (a, b, face) => { F.box(ib, a - 0.4, a + 0.4, b - 0.4, b + 0.4, 0.2, 1.9, spick([0x2a2a6a, 0x6a1a3a, 0x1a4a3a, 0x3a3a3a]), true); F.glow(a - 0.3, a + 0.3, b + face * 0.41, b + face * 0.43, 1.2, 1.7, spick([0x7ff0ff, 0xff7ad0, 0xb0ff6a, 0xffd06a])); F.glow(a - 0.4, a + 0.4, b - 0.4, b + 0.4, 1.9, 2.0, 0xff4ad0); };
    for (let b = 1.6; b < D - 1.2; b += 1.0) { cab(A0 + 0.75, b, 0); cab(A1 - 0.75, b, 0); }
    for (let a = A0 + 2; a < A1 - 2; a += 1.0) cab(a, D - 0.75, -1);
    F.glow(A0 + 0.3, A1 - 0.3, D - 0.29, D - 0.27, 3.6, 3.75, 0x7a4aff); F.glow(A0 + 0.27, A0 + 0.29, 0.5, D - 0.5, 3.6, 3.75, 0xff4ad0); F.glow(A1 - 0.29, A1 - 0.27, 0.5, D - 0.5, 3.6, 3.75, 0x4affe0);
  } },
  bar: { names: [11, 29], wall: 0x3a2a24, frame: 0x20304a, fill(F) {
    const { A0, A1, D } = F;
    F.box(ib, A0 + 0.6, A0 + 1.3, 1.5, D - 1.2, 0.2, 1.15, 0x4a2a1a, true); F.box(ib, A0 + 0.5, A0 + 1.4, 1.4, D - 1.1, 1.15, 1.22, 0x2a1a10);
    for (let b = 1.9; b < D - 1.4; b += 0.9) stool(F, A0 + 1.85, b, 0x6a2a1a);
    F.box(ib, A0 + 0.25, A0 + 0.45, 1.2, D - 0.6, 1.4, 2.6, 0x2a1a10); for (let b = 1.4; b < D - 0.8; b += 0.18) F.glow(A0 + 0.45, A0 + 0.5, b, b + 0.08, 1.5 + ((b * 13) % 3) * 0.4, 1.8 + ((b * 13) % 3) * 0.4, spick([0xffc070, 0x70ff90, 0xffe0a0, 0xa0d0ff]));
    if (A1 - A0 > 8) { const a = A1 - 2.4, b = D / 2; F.box(ib, a - 0.75, a + 0.75, b - 1.3, b + 1.3, 0.2, 0.85, 0x3a2414, true); F.box(ib, a - 0.65, a + 0.65, b - 1.2, b + 1.2, 0.85, 0.88, 0x2a7a3a); F.lamp(a - 0.5, a + 0.5, b - 0.8, b + 0.8, 2.4, 0xfff0c0); }
    else { table(F, A1 - 1.3, D / 2, 0x3a2414, 0.4); chair(F, A1 - 1.3, D / 2 + 0.7, 0x3a2414); }
  } },
  pharmacy: { names: [7], wall: 0xf8f8f8, frame: 0x1a6a5a, fill(F) {
    const { A0, A1, D } = F;
    for (let a = A0 + 1.8; a < A1 - 1.8; a += 2.2) shelfUnit(F, a - 0.3, a + 0.3, 1.8, D - 2.6, 1.6, 0xf0f0f0);
    F.box(ib, A0 + 0.8, A1 - 0.8, D - 1.6, D - 1.0, 0.2, 1.05, 0xffffff, true); F.glow(A0 + 0.5, A1 - 0.5, D - 0.29, D - 0.27, 2.6, 3.4, 0x6aff9a);
    shelfUnit(F, A0 + 0.5, A1 - 0.5, D - 0.7, D - 0.3, 2.3, 0xf0f0f0);
  } },
  florist: { names: [10], wall: 0xf0f4e8, frame: 0x6a3a5a, fill(F) {
    const { A0, A1, D } = F;
    for (let a = A0 + 0.9; a < A1 - 0.8; a += 0.9) for (const b of [1.0, D - 0.9]) { F.cyl(ib, a, b, 0.3, 0.25, 0.2, 0.7, 0x5a6a7a, 8); }
    for (let a = A0 + 0.9; a < A1 - 0.8; a += 0.9) for (const b of [1.0, D - 0.9]) { const [x, z] = F.toXZ(a, b); blob(ib, x, 0.7, z, 0.32, spick([0xe04a6a, 0xf0d040, 0xf08ab0, 0xffffff, 0x9a4ad0, 0xe07a2a]), 6); }
    F.box(ib, (A0 + A1) / 2 - 1, (A0 + A1) / 2 + 1, 2.4, 3.4, 0.2, 0.9, 0x8a6a4a, true);
    for (let k = 0; k < 5; k++) { const [x, z] = F.toXZ((A0 + A1) / 2 - 0.8 + k * 0.4, 2.9); blob(ib, x, 0.9, z, 0.22, spick([0xe04a6a, 0xf0d040, 0xf08ab0]), 6); }
  } },
  pizza: { names: [13], wall: 0xf0e0d0, frame: 0x2a7a3a, fill(F) {
    const { A0, A1, D } = F;
    F.box(ib, A0 + 0.5, A0 + 2.6, D - 1.6, D - 0.3, 0.2, 2.2, 0x9a4a2a, true); F.glow(A0 + 1.0, A0 + 2.1, D - 1.62, D - 1.6, 0.9, 1.4, 0xff8a2a); // oven
    F.box(ib, A0 + 3, A1 - 0.8, D - 2.2, D - 1.6, 0.2, 1.1, 0xe8e8e8, true); F.glow(A0 + 3.2, A1 - 1.2, D - 2.15, D - 1.65, 1.1, 1.3, 0xffd890);
    for (const [a, b] of [[A0 + 1.5, 1.6], [A1 - 1.6, 1.6], [(A0 + A1) / 2, 3.2]]) if (b < D - 3) { table(F, a, b, 0xc83a2a, 0.4); chair(F, a, b + 0.65, 0x3a3a3e); chair(F, a, b - 0.65, 0x3a3a3e); }
  } },
  clothes: { names: [19, 31], wall: 0xf0e8f0, frame: 0x2a2a3a, fill(F) {
    const { A0, A1, D } = F;
    for (let b = 1.6; b < D - 1.4; b += 1.6) {
      const am = (A0 + A1) / 2;
      F.box(ib, am - 2, am + 2, b - 0.03, b + 0.03, 1.55, 1.6, 0x9a9aa0); F.box(ib, am - 2, am - 1.95, b - 0.03, b + 0.03, 0.2, 1.6, 0x9a9aa0); F.box(ib, am + 1.95, am + 2, b - 0.03, b + 0.03, 0.2, 1.6, 0x9a9aa0);
      for (let a = am - 1.8; a < am + 1.8; a += 0.22) F.box(ib, a, a + 0.18, b - 0.25, b + 0.25, 0.7, 1.5, spick([0x3a5a8c, 0x8c3a3a, 0xd0d0d0, 0x333333, 0xc9a13b, 0x6b3a8c, 0x2f7f8f]));
    }
    for (const a of [A0 + 0.9, A1 - 0.9]) { F.box(ib, a - 0.2, a + 0.2, 0.9, 1.2, 0.2, 1.5, 0xf0e0d0); F.box(ib, a - 0.15, a + 0.15, 0.9, 1.2, 1.5, 1.85, 0xf0e0d0); }
    F.glow(A0 + 0.27, A0 + 0.29, D - 2.5, D - 0.6, 0.4, 2.4, 0xe8f0ff); // mirror
  } },
};
const KIND_POOL = {
  metro: ['cafe', 'cafe', 'mart', 'laundry', 'diner', 'barber', 'books', 'arcade', 'bar', 'pharmacy', 'florist', 'pizza', 'clothes', 'bar', 'diner'],
  suburb: ['cafe', 'mart', 'diner', 'barber', 'books', 'pharmacy', 'florist', 'pizza', 'clothes', 'laundry'],
  industrial: ['diner', 'bar', 'mart', 'laundry', 'bar', 'pizza'],
};

// a walk-in ground floor for lot L with its shopfront on `side`. The building above starts at H_IN.
export function walkIn(L, side, city, kindArg) {
  const F = frameOf(L, side), fullD = F.D;
  F.D = Math.min(F.D, 16); // deep lots get a shop at the front and solid storage behind
  const { A0, A1, D } = F, T = 0.25;
  if (D < 6.5 || A1 - A0 < 6.4) return false;
  if (A1 - A0 > 26) return false;
  { // don't open a door onto a stairwell or manhole
    const [hx0, hx1, hz0, hz1] = F.rect(A0 - 1, A1 + 1, -SW - 0.5, 0);
    if (groundHoles.some((h) => h.x1 > hx0 && h.x0 < hx1 && h.z1 > hz0 && h.z0 < hz1)) return false;
  }
  { // never build a shop into a room something solid already stands in
    const [rx0, rx1, rz0, rz1] = F.rect(A0, A1, 0, D);
    if (colliders.some((c) => c.h > 1 && (c.y0 || 0) < 1 && c.x1 > rx0 + 0.3 && c.x0 < rx1 - 0.3 && c.z1 > rz0 + 0.3 && c.z0 < rz1 - 0.3)) return false;
  }
  const kind = kindArg || spick(KIND_POOL[city.style] || KIND_POOL.metro), K = KINDS[kind], nameIdx = spick(K.names), name = SHOP_NAMES[nameIdx][0];
  if (fullD > D + 0.1) { const [fx0, fx1, fz0, fz1] = F.rect(A0, A1, D, fullD); addCollider(fx0, fx1, fz0, fz1, H_IN, { filler: true }); propBuf.box(fx0, fx1, 0.15, H_IN, fz0, fz1, 0x6e6660); }
  F.box(floorB, A0, A1, 0, D, 0.15, 0.21, 0xffffff);
  F.box(ib, A0, A1, D - T, D, 0, H_IN, K.wall, true);
  F.box(ib, A0, A0 + T, 0, D, 0, H_IN, K.wall, true); F.box(ib, A1 - T, A1, 0, D, 0, H_IN, K.wall, true);
  F.box(ib, A0, A1, 0, D, H_IN - 0.32, H_IN - 0.3, 0xe8e4dc);
  F.box(ib, A0 + T, A1 - T, D - T - 0.02, D - T, 0.2, 1.0, K.frame); // dado rail colour
  // front: glass either side of a doorway, a bulkhead under the glass, a fascia with the shop's name
  const dm = clamp(A0 + sr(2.2, A1 - A0 - 2.2), A0 + 1.9, A1 - 1.9), dw = 2.4;
  for (const [g0, g1] of [[A0 + T, dm - dw / 2], [dm + dw / 2, A1 - T]]) {
    if (g1 - g0 < 0.2) continue;
    F.box(ib, g0, g1, 0, 0.18, 0, 0.6, K.frame, true);
    F.box(glassB, g0, g1, 0.04, 0.12, 0.6, 3.3, 0x9ac8e0, true, { glass: true });
    for (let a = g0 + 1.8; a < g1 - 0.3; a += 1.8) F.box(ib, a - 0.05, a + 0.05, 0, 0.16, 0.6, 3.3, K.frame);
  }
  F.box(ib, A0, A1, 0, T, 3.3, H_IN, K.frame, true);
  for (const e of [dm - dw / 2, dm + dw / 2]) F.box(ib, e - 0.08, e + 0.08, -0.02, 0.2, 0, 3.3, K.frame, true);
  outBox(side, F.I.fixed, A0, A1, 3.45, 4.4, 0.14, K.frame);
  const sw = Math.min(A1 - A0 - 1, 6.5);
  shopSign(side, F.I.fixed + F.I.out * 0.15, (A0 + A1) / 2 - sw / 2, (A0 + A1) / 2 + sw / 2, 3.6, 3.6 + Math.min(0.7, sw / 8), nameIdx);
  if (srand() < 0.6) { const aw = spick(AWNINGS), n = Math.max(2, Math.round((A1 - A0) / 0.6)); for (let k = 0; k < n; k++) slope(propBuf, side, F.I.fixed + F.I.out * 0.15, A0 + 0.3 + ((A1 - A0 - 0.6) * k) / n, A0 + 0.3 + ((A1 - A0 - 0.6) * (k + 1)) / n, 3.4, 2.8, 1.5, k % 2 ? 0xf2eee6 : aw); }
  const [ox, oz] = F.toXZ(dm, -0.6);
  glowBuf.box(ox - 0.15, ox + 0.15, 3.1, 3.3, oz - 0.15, oz + 0.15, 0xfff0c8); // light over the door
  F.dm = dm;
  const nBefore = F.n || 0;
  K.fill(F);
  const items = (F.n || 0) - nBefore;
  for (let b = 1.5; b < D - 1; b += 3) F.lamp(A0 + 1, A1 - 1, b, b + 0.4, H_IN - 0.32, kind === 'arcade' || kind === 'bar' ? 0xffb070 : 0xfff4dc);
  const [rx0, rx1, rz0, rz1] = F.rect(A0, A1, 0, D);
  interiorZones.push({ x0: rx0, x1: rx1, z0: rz0, z1: rz1, y0: -0.5, y1: H_IN - 0.25, name });
  const [kx0, kx1, kz0, kz1] = F.rect(dm - dw / 2 - 0.3, dm + dw / 2 + 0.3, -SW, 1.5);
  keepClear.push({ x0: kx0, x1: kx1, z0: kz0, z1: kz1 });
  { const [nx0, nx1, nz0, nz1] = F.rect(dm - 1.15, dm + 1.15, -2.2, 2.2); navOpen.push({ x0: nx0, x1: nx1, z0: nz0, z1: nz1 }); }
  const [dx, dz] = F.toXZ(dm, 0.5), [kx, kz] = F.toXZ((A0 + A1) / 2, D - 1.2);
  const path = [-1.5, -0.5, 0.5, 1.4].map((b) => F.toXZ(dm, b));
  walkIns.push({ path, x: dx, z: dz, name, kind, city: city.name, keeper: { x: kx, z: kz }, rect: { x0: rx0, x1: rx1, z0: rz0, z1: rz1 }, side, items });
  return true;
}
lotHooks.walkIn = walkIn;

// ---------------------------------------------------------------------
// street furniture kit (world coordinates)
// ---------------------------------------------------------------------
const occ = new Set();
const okey = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
function isFree(x, z, r) {
  if (inHole(x, z) || pointBlocked(x, z, r)) return false;
  for (const k of keepClear) if (x > k.x0 - r && x < k.x1 + r && z > k.z0 - r && z < k.z1 + r) return false;
  for (let dx = -r; dx <= r + 1e-6; dx += 0.5) for (let dz = -r; dz <= r + 1e-6; dz += 0.5) if (occ.has(okey(x + dx, z + dz))) return false;
  return true;
}
function claim(x, z, r) { for (let dx = -r; dx <= r + 1e-6; dx += 0.5) for (let dz = -r; dz <= r + 1e-6; dz += 0.5) occ.add(okey(x + dx, z + dz)); }
const col = (x, z, rx, rz, h) => addCollider(x - rx, x + rx, z - rz, z + rz, h);

function bench(x, z, alongX, faceSign) {
  const lx = alongX ? 0.9 : 0.25, lz = alongX ? 0.25 : 0.9, wood = 0x8a5a32, iron = 0x2a2a2e;
  propBuf.box(x - lx, x + lx, 0.55, 0.62, z - lz, z + lz, wood);
  const bx = alongX ? 0 : -faceSign * 0.22, bz = alongX ? -faceSign * 0.22 : 0;
  propBuf.box(x + bx - (alongX ? lx : 0.04), x + bx + (alongX ? lx : 0.04), 0.7, 1.05, z + bz - (alongX ? 0.04 : lz), z + bz + (alongX ? 0.04 : lz), wood);
  for (const s of [-0.75, 0.75]) { const px = x + (alongX ? s : 0), pz = z + (alongX ? 0 : s); propBuf.box(px - 0.05, px + 0.05, 0, 1.05, pz - 0.2, pz + 0.2, iron); }
  col(x, z, lx, lz, 0.62);
  const fxs = alongX ? 0 : faceSign, fzs = alongX ? faceSign : 0, face = Math.atan2(fxs, fzs);
  for (const o of [-0.45, 0.45]) lifeSpots.push({ kind: 'bench', x: x + fxs * 0.9 + (alongX ? o : 0), z: z + fzs * 0.9 + (alongX ? 0 : o), face, sx: x + fxs * 0.05 + (alongX ? o : 0), sz: z + fzs * 0.05 + (alongX ? 0 : o) });
}
function bin(x, z) { propBuf.cyl(x, z, 0.3, 0.33, 0.15, 1.0, 0x2a4a3a, 10); propBuf.cyl(x, z, 0.36, 0.2, 1.0, 1.15, 0x1a2a22, 10); col(x, z, 0.3, 0.3, 1.1); }
function hydrant(x, z) {
  propBuf.cyl(x, z, 0.16, 0.16, 0.15, 0.75, 0xc8281e, 8); propBuf.cyl(x, z, 0.2, 0.06, 0.75, 0.95, 0xc8281e, 8);
  propBuf.box(x - 0.27, x + 0.27, 0.48, 0.6, z - 0.06, z + 0.06, 0xd8d8d0); propBuf.box(x - 0.06, x + 0.06, 0.48, 0.6, z - 0.22, z + 0.22, 0xc8281e);
  col(x, z, 0.2, 0.2, 0.9);
}
function newsBoxes(x, z, alongX) {
  const n = 2 + Math.floor(srand() * 2);
  for (let k = 0; k < n; k++) {
    const o = (k - (n - 1) / 2) * 0.55, bx = x + (alongX ? o : 0), bz = z + (alongX ? 0 : o);
    propBuf.box(bx - 0.24, bx + 0.24, 0.15, 1.05, bz - 0.24, bz + 0.24, spick([0x2a5aa0, 0xd02a2a, 0xe0b020, 0x2a8a4a, 0xf0f0f0]));
    propBuf.box(bx - 0.2, bx + 0.2, 0.6, 0.95, bz - 0.25, bz + 0.25, 0xd8e0e8);
  }
  col(x, z, alongX ? n * 0.28 : 0.25, alongX ? 0.25 : n * 0.28, 1.05);
}
function meter(x, z) { propBuf.cyl(x, z, 0.05, 0.05, 0.15, 1.2, 0x5a5a60, 6); propBuf.box(x - 0.13, x + 0.13, 1.2, 1.55, z - 0.1, z + 0.1, 0x7a8088); propBuf.box(x - 0.09, x + 0.09, 1.35, 1.5, z - 0.11, z + 0.11, 0xd8e8d8); }
function bikeRack(x, z, alongX) {
  for (let k = -1; k <= 1; k++) {
    const o = k * 0.7, bx = x + (alongX ? o : 0), bz = z + (alongX ? 0 : o), d = 0.35;
    const a = alongX ? [bx, 0.15, bz - d] : [bx - d, 0.15, bz], b = alongX ? [bx, 0.15, bz + d] : [bx + d, 0.15, bz];
    propBuf.beam(a, [a[0], 0.85, a[2]], 0.06, 0x9a9aa0); propBuf.beam(b, [b[0], 0.85, b[2]], 0.06, 0x9a9aa0); propBuf.beam([a[0], 0.85, a[2]], [b[0], 0.85, b[2]], 0.06, 0x9a9aa0);
    if (srand() < 0.5) { const c = spick([0xd02a2a, 0x2a5aa0, 0x1a1a1a, 0x2a8a4a, 0xe0b020]); propBuf.beam([bx - (alongX ? 0.15 : 0.8), 0.55, bz - (alongX ? 0.8 : 0.15)], [bx + (alongX ? -0.15 : 0.8), 0.55, bz + (alongX ? 0.8 : -0.15)], 0.06, c); }
  }
}
function mailbox(x, z) { propBuf.box(x - 0.08, x + 0.08, 0.15, 0.6, z - 0.08, z + 0.08, 0x2a3a6a); propBuf.box(x - 0.3, x + 0.3, 0.6, 1.25, z - 0.3, z + 0.3, 0x2a4a9a); propBuf.cyl(x, z, 0.3, 0.12, 1.25, 1.4, 0x2a4a9a, 10); col(x, z, 0.3, 0.3, 1.3); }
function phoneBox(x, z) {
  const c = 0xb02a22;
  for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) propBuf.box(x + dx - 0.06, x + dx + 0.06, 0.15, 2.4, z + dz - 0.06, z + dz + 0.06, c);
  propBuf.box(x - 0.56, x + 0.56, 2.4, 2.6, z - 0.56, z + 0.56, c); glowBuf.box(x - 0.5, x + 0.5, 2.42, 2.55, z - 0.57, z + 0.57, 0xfff4d0);
  glassB.box(x - 0.5, x + 0.5, 0.3, 2.4, z - 0.5, z + 0.5, 0x9ac8e0, { top: false });
  propBuf.box(x - 0.15, x + 0.15, 1.2, 1.7, z - 0.48, z - 0.4, 0x1a1a1a);
  col(x, z, 0.56, 0.56, 2.6);
}
function planter(x, z) {
  propBuf.box(x - 0.55, x + 0.55, 0.15, 0.75, z - 0.55, z + 0.55, spick([0x9a948a, 0x6a5a4a, 0x3a3a40]));
  propBuf.box(x - 0.5, x + 0.5, 0.7, 0.78, z - 0.5, z + 0.5, 0x4a3a2a);
  blob(propBuf, x, 0.75, z, 0.5, spick(GREENS), 6);
  for (let k = 0; k < 5; k++) { const fx = x + sr(-0.4, 0.4), fz = z + sr(-0.4, 0.4); propBuf.box(fx - 0.06, fx + 0.06, 1.1 + sr(0, 0.25), 1.22 + sr(0, 0.25), fz - 0.06, fz + 0.06, spick([0xe04a6a, 0xf0d040, 0xffffff, 0x9a4ad0, 0xf08a3a])); }
  col(x, z, 0.55, 0.55, 0.78);
}
function cafeSet(x, z) {
  propBuf.cyl(x, z, 0.04, 0.04, 0.15, 0.9, 0x2a2a2e, 6); propBuf.cyl(x, z, 0.38, 0.38, 0.9, 0.95, 0xe8e4dc, 10);
  for (const [dx, dz] of [[-0.6, 0], [0.6, 0]]) { const cx = x + dx, cz = z + dz; propBuf.box(cx - 0.2, cx + 0.2, 0.55, 0.6, cz - 0.2, cz + 0.2, 0x2a2a2e); propBuf.box(cx + Math.sign(dx) * 0.18 - 0.03, cx + Math.sign(dx) * 0.18 + 0.03, 0.6, 1.0, cz - 0.2, cz + 0.2, 0x2a2a2e); for (const l of [-0.15, 0.15]) propBuf.box(cx + l - 0.02, cx + l + 0.02, 0.15, 0.55, cz - 0.02, cz + 0.02, 0x2a2a2e); }
  propBuf.box(x - 0.03, x + 0.03, 0.95, 2.3, z - 0.03, z + 0.03, 0xdddddd);
  const c = spick(AWNINGS); for (let k = 0; k < 8; k++) { const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2; propBuf.quad([x, 2.45, z], [x + Math.cos(a1) * 1.2, 2.05, z + Math.sin(a1) * 1.2], [x + Math.cos(a0) * 1.2, 2.05, z + Math.sin(a0) * 1.2], [x, 2.45, z], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], new THREE.Color(k % 2 ? 0xf2eee6 : c)); propBuf.quad([x, 2.44, z], [x + Math.cos(a0) * 1.2, 2.04, z + Math.sin(a0) * 1.2], [x + Math.cos(a1) * 1.2, 2.04, z + Math.sin(a1) * 1.2], [x, 2.44, z], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], new THREE.Color(k % 2 ? 0xd8d4cc : c)); }
  col(x, z, 0.4, 0.4, 0.95);
}
function aFrame(x, z, alongX) { if (alongX) propBuf.prism(x - 0.35, x + 0.35, z - 0.3, z + 0.3, 0.15, 0.95, 0x2a2a2e, true); else propBuf.prism(x - 0.3, x + 0.3, z - 0.35, z + 0.35, 0.15, 0.95, 0x2a2a2e, false); }
function produceStand(x, z, alongX) {
  const lx = alongX ? 1.1 : 0.45, lz = alongX ? 0.45 : 1.1;
  propBuf.box(x - lx, x + lx, 0.15, 0.85, z - lz, z + lz, 0x8a6a4a);
  for (let k = 0; k < 4; k++) { const o = -0.8 + k * 0.55, cx = x + (alongX ? o : 0), cz = z + (alongX ? 0 : o); propBuf.box(cx - 0.24, cx + 0.24, 0.85, 1.0, cz - 0.35, cz + 0.35, 0x6a4a2a); propBuf.box(cx - 0.2, cx + 0.2, 0.95, 1.1, cz - 0.3, cz + 0.3, spick([0xd03a2a, 0xf0a020, 0x5aa02a, 0xe8d040, 0x8a2a6a])); }
  col(x, z, lx, lz, 1.1);
}
function foodCart(x, z, alongX) {
  const lx = alongX ? 1.1 : 0.6, lz = alongX ? 0.6 : 1.1, c = spick([0xe0b020, 0xd03a2a, 0x2a8ad0, 0xf0f0f0]);
  propBuf.box(x - lx, x + lx, 0.45, 1.1, z - lz, z + lz, c); propBuf.box(x - lx - 0.03, x + lx + 0.03, 1.1, 1.16, z - lz - 0.03, z + lz + 0.03, 0xb8b8c0);
  for (const s of [-1, 1]) { const wx = x + (alongX ? s * 0.7 : 0), wz = z + (alongX ? 0 : s * 0.7); propBuf.box(wx - (alongX ? 0.25 : 0.62), wx + (alongX ? 0.25 : 0.62), 0.15, 0.6, wz - (alongX ? 0.62 : 0.25), wz + (alongX ? 0.62 : 0.25), 0x1a1a1a); }
  propBuf.box(x - 0.03, x + 0.03, 1.16, 2.5, z - 0.03, z + 0.03, 0xdddddd);
  const uc = spick(AWNINGS); for (let k = 0; k < 8; k++) { const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2; for (const [y, ny] of [[2.6, 1], [2.59, -1]]) propBuf.quad([x, y + 0.45, z], ny > 0 ? [x + Math.cos(a1) * 1.5, y, z + Math.sin(a1) * 1.5] : [x + Math.cos(a0) * 1.5, y, z + Math.sin(a0) * 1.5], ny > 0 ? [x + Math.cos(a0) * 1.5, y, z + Math.sin(a0) * 1.5] : [x + Math.cos(a1) * 1.5, y, z + Math.sin(a1) * 1.5], [x, y + 0.45, z], [0, ny, 0], [0, 0, 1, 0, 1, 1, 0, 1], new THREE.Color(k % 2 ? 0xf2eee6 : uc)); }
  glowBuf.box(x - lx + 0.1, x + lx - 0.1, 1.16, 1.3, z - lz + 0.1, z + lz - 0.1, 0xffd890);
  col(x, z, lx, lz, 1.16);
  lifeSpots.push({ kind: 'cart', x, z, alongX, face: 0, sx: x, sz: z });
}
function busShelter(x, z, side) {
  const I = { out: side[0] === 'p' ? 1 : -1 }, ax = side[1] === 'z'; // shelter's long axis runs along the street
  const L = 2.2, Dp = 0.8, back = -I.out * Dp; // back panel away from the road
  const R = (a, b) => (ax ? [x + a, z + b] : [x + b, z + a]);
  const bx = (a0, a1, b0, b1, y0, y1, c, buf = propBuf) => { const [p0, q0] = R(a0, b0), [p1, q1] = R(a1, b1); buf.box(Math.min(p0, p1), Math.max(p0, p1), y0, y1, Math.min(q0, q1), Math.max(q0, q1), c, { bottom: true }); };
  bx(-L, L, -Dp - 0.1, Dp + 0.1, 2.5, 2.62, 0x3a3e46); glowBuf.box(...(() => { const [p0, q0] = R(-L + 0.3, -0.2), [p1, q1] = R(L - 0.3, 0.2); return [Math.min(p0, p1), Math.max(p0, p1), 2.46, 2.5, Math.min(q0, q1), Math.max(q0, q1)]; })(), 0xfff4dc);
  for (const a of [-L + 0.05, L - 0.05]) bx(a - 0.05, a + 0.05, back - 0.05, back + 0.05, 0.15, 2.5, 0x3a3e46);
  bx(-L, L, back - 0.03, back + 0.03, 0.4, 2.3, 0x9ac8e0, glassB);
  bx(L - 0.06, L, back, Dp * 0.6 * I.out, 0.4, 2.3, 0x9ac8e0, glassB);
  bx(-1.4, 1.4, back + I.out * 0.05, back + I.out * 0.45, 0.5, 0.58, 0x8a5a32);
  const [mx, mz] = R(-L + 0.06, back * 0.2);
  const ad = new THREE.BoxGeometry(ax ? 0.08 : 1.4, 1.8, ax ? 1.4 : 0.08);
  staticMesh(ad, ax ? [spick(adMats), spick(adMats), edgeMat, edgeMat, edgeMat, edgeMat] : [edgeMat, edgeMat, edgeMat, edgeMat, spick(adMats), spick(adMats)], mx, 1.4, mz);
  const [px, pz] = R(L + 0.6, Dp * I.out); propBuf.cyl(px, pz, 0.05, 0.05, 0.15, 2.9, 0x8a8a90, 6); propBuf.box(px - 0.3, px + 0.3, 2.5, 3.0, pz - 0.3, pz + 0.3, 0x2a6ab0);
  { const [p0, q0] = R(-L, back - 0.05), [p1, q1] = R(L, back + 0.05); addCollider(Math.min(p0, p1), Math.max(p0, p1), Math.min(q0, q1), Math.max(q0, q1), 2.5); }
  for (const o of [-0.8, 0, 0.8]) { const [sx, sz] = R(o, back + I.out * 0.3), [wx, wz] = R(o, back + I.out * 1.2); lifeSpots.push({ kind: 'bus', x: wx, z: wz, sx, sz, face: ax ? (I.out > 0 ? 0 : Math.PI) : (I.out > 0 ? Math.PI / 2 : -Math.PI / 2) }); }
  { const [p0, q0] = R(-L, -Dp - 0.1), [p1, q1] = R(L, Dp + 0.1); addCollider(Math.min(p0, p1), Math.max(p0, p1), Math.min(q0, q1), Math.max(q0, q1), 2.62, { y0: 2.5 }); }
}
function utilityPole(x, z, alongX) {
  propBuf.cyl(x, z, 0.16, 0.12, 0, 8.4, 0x5a4a3a, 6);
  propBuf.box(x - (alongX ? 0.1 : 1.1), x + (alongX ? 0.1 : 1.1), 7.6, 7.75, z - (alongX ? 1.1 : 0.1), z + (alongX ? 1.1 : 0.1), 0x5a4a3a);
  for (const s of [-0.9, 0, 0.9]) { const ix = x + (alongX ? 0 : s), iz = z + (alongX ? s : 0); propBuf.box(ix - 0.05, ix + 0.05, 7.75, 7.95, iz - 0.05, iz + 0.05, 0x3a5a3a); }
  if (srand() < 0.4) propBuf.cyl(x + (alongX ? 0.35 : 0), z + (alongX ? 0 : 0.35), 0.25, 0.25, 6.2, 7.0, 0x6a6a6e, 8); // transformer
  col(x, z, 0.18, 0.18, 8.4);
}
function wires(a, b, alongX) {
  for (const s of [-0.9, 0, 0.9]) {
    const ax = a[0] + (alongX ? 0 : s), az = a[1] + (alongX ? s : 0), bx = b[0] + (alongX ? 0 : s), bz = b[1] + (alongX ? s : 0);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2; // sagging in the middle
    propBuf.beam([ax, 7.92, az], [mx, 7.3, mz], 0.025, 0x1a1a1a); propBuf.beam([mx, 7.3, mz], [bx, 7.92, bz], 0.025, 0x1a1a1a);
  }
}
function barrel(x, z, c) { propBuf.cyl(x, z, 0.3, 0.3, 0.15, 1.05, c, 10); for (const y of [0.4, 0.8]) propBuf.cyl(x, z, 0.31, 0.31, y, y + 0.04, 0x2a2a2a, 10, false); col(x, z, 0.3, 0.3, 1.05); }
function pallets(x, z) { const n = 1 + Math.floor(srand() * 5); for (let k = 0; k < n; k++) { const y = 0.15 + k * 0.15; propBuf.box(x - 0.6, x + 0.6, y, y + 0.05, z - 0.5, z + 0.5, 0xa88a5a); for (const s of [-0.45, 0, 0.45]) propBuf.box(x - 0.6, x + 0.6, y - 0.1 + 0.1, y + 0.0, z + s - 0.05, z + s + 0.05, 0x8a6a4a); } col(x, z, 0.6, 0.5, 0.15 + n * 0.15); }
function crates(x, z) { const s = sr(0.4, 0.6); propBuf.box(x - s, x + s, 0.15, 0.15 + s * 2, z - s, z + s, 0x9a7a4a); if (srand() < 0.5) propBuf.box(x - s * 0.7, x + s * 0.7, 0.15 + s * 2, 0.15 + s * 3.4, z - s * 0.7, z + s * 0.7, 0x8a6a3a); col(x, z, s, s, 0.15 + s * 2); }
function cone(x, z) { propBuf.box(x - 0.2, x + 0.2, 0.15, 0.2, z - 0.2, z + 0.2, 0xe05a1a); propBuf.cyl(x, z, 0.16, 0.03, 0.2, 0.85, 0xe05a1a, 8, false); propBuf.cyl(x, z, 0.11, 0.08, 0.45, 0.58, 0xf0f0f0, 8, false); }
function spool(x, z) { propBuf.cyl(x, z, 0.7, 0.7, 0.15, 0.3, 0x8a6a4a, 12); propBuf.cyl(x, z, 0.3, 0.3, 0.3, 1.1, 0x3a3a3a, 10, false); propBuf.cyl(x, z, 0.7, 0.7, 1.1, 1.25, 0x8a6a4a, 12); col(x, z, 0.7, 0.7, 1.25); }
function dumpster(x, z, alongX) {
  const lx = alongX ? 1.0 : 0.7, lz = alongX ? 0.7 : 1.0, c = spick([0x2a5a3a, 0x2a4a7a, 0x6a6a6e, 0x8a3a2a]);
  propBuf.box(x - lx, x + lx, 0.15, 1.35, z - lz, z + lz, c); propBuf.box(x - lx - 0.05, x + lx + 0.05, 1.35, 1.45, z - lz - 0.05, z + lz + 0.05, 0x1a1a1a);
  if (srand() < 0.5) propBuf.box(x - lx * 0.6, x + lx * 0.4, 1.4, 1.75, z - lz * 0.5, z + lz * 0.6, 0x1a1a1a); // overflowing bin bags
  col(x, z, lx, lz, 1.45);
}
function wheelie(x, z) { const c = spick([0x2a6a3a, 0x2a4a8a, 0x5a5a60, 0x7a5a2a]); propBuf.box(x - 0.3, x + 0.3, 0.15, 1.15, z - 0.35, z + 0.35, c); propBuf.box(x - 0.33, x + 0.33, 1.15, 1.22, z - 0.4, z + 0.38, shadeC(c)); col(x, z, 0.3, 0.35, 1.2); }
const shadeC = (c) => new THREE.Color(c).multiplyScalar(0.75).getHex();
function acUnit(x, z) { propBuf.box(x - 0.45, x + 0.45, 0.15, 0.95, z - 0.4, z + 0.4, 0xc8c8c4); propBuf.cyl(x, z, 0.3, 0.3, 0.95, 0.97, 0x3a3a3a, 10); col(x, z, 0.45, 0.4, 0.95); }
function laundryLine(a, b, y) {
  propBuf.beam([a[0], y, a[1]], [b[0], y - 0.3, b[1]], 0.02, 0xdddddd);
  const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.7);
  for (let k = 1; k < n; k++) {
    if (srand() < 0.35) continue;
    const t = k / n, x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t), yy = y - 0.3 * t - 0.05, w = sr(0.25, 0.4), hh = sr(0.4, 0.9);
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), ux = (dx / l) * w, uz = (dz / l) * w;
    propBuf.box(Math.min(x - ux, x + ux) - 0.02, Math.max(x - ux, x + ux) + 0.02, yy - hh, yy, Math.min(z - uz, z + uz) - 0.02, Math.max(z - uz, z + uz) + 0.02, spick([0xf0f0f0, 0xd04a4a, 0x4a7ad0, 0xf0d040, 0x5ab05a, 0xf08ab0, 0x2a2a3a]));
  }
}
function stringLights(a, b, y) {
  propBuf.beam([a[0], y, a[1]], [b[0], y, b[1]], 0.02, 0x1a1a1a);
  const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.6);
  for (let k = 1; k < n; k++) { const t = k / n, x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t), yy = y - Math.sin(t * Math.PI) * 0.4; glowBuf.box(x - 0.06, x + 0.06, yy - 0.16, yy - 0.04, z - 0.06, z + 0.06, spick([0xffe0a0, 0xffb070, 0xfff4dc])); }
}

// ---------------------------------------------------------------------
// courtyards inside perimeter blocks: bins, a tree, washing lines, bikes, AC units, a bench
// ---------------------------------------------------------------------
lotHooks.courtyard = (Y) => {
  const inAlley = (x, z, pad) => Y.alleys.some((A) => x > A.x0 - pad && x < A.x1 + pad && z > A.z0 - pad && z < A.z1 + pad);
  const yardItems = [];
  const put = (x, z, r) => { if (x < Y.x0 + r || x > Y.x1 - r || z < Y.z0 + r || z > Y.z1 - r || inAlley(x, z, 2)) return false; if (yardItems.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + r + 0.6)) return false; yardItems.push([x, z, r]); return true; };
  const edge = () => { const s = Math.floor(srand() * 4); return s === 0 ? [sr(Y.x0 + 1.5, Y.x1 - 1.5), Y.z0 + 1.1, true] : s === 1 ? [sr(Y.x0 + 1.5, Y.x1 - 1.5), Y.z1 - 1.1, true] : s === 2 ? [Y.x0 + 1.1, sr(Y.z0 + 1.5, Y.z1 - 1.5), false] : [Y.x1 - 1.1, sr(Y.z0 + 1.5, Y.z1 - 1.5), false]; };
  for (let k = 0; k < 2; k++) { const [x, z, ax] = edge(); if (put(x, z, 1.2)) dumpster(x, z, ax); }
  for (let k = 0; k < 4; k++) { const [x, z] = edge(); if (put(x, z, 0.5)) wheelie(x, z); }
  for (let k = 0; k < 3; k++) { const [x, z] = edge(); if (put(x, z, 0.6)) acUnit(x, z); }
  const cx = (Y.x0 + Y.x1) / 2, cz = (Y.z0 + Y.z1) / 2;
  if (Y.x1 - Y.x0 > 9 && Y.z1 - Y.z0 > 9) {
    if (put(cx, cz, 1.6)) { propBuf.box(cx - 1.6, cx + 1.6, 0.15, 0.3, cz - 1.6, cz + 1.6, 0x6a5a4a); propBuf.box(cx - 1.5, cx + 1.5, 0.3, 0.33, cz - 1.5, cz + 1.5, 0x4a7a3a); addTree(cx, cz, sr(1.2, 1.6)); }
    const bx = cx + 3, bz = cz; if (put(bx, bz, 1)) bench(bx, bz, false, -1);
  }
  for (let k = 0; k < 2; k++) { const [x, z, ax] = edge(); if (put(x, z, 1.2)) bikeRack(x, z, ax); }
  for (let k = 0, n = Math.floor(sr(1, 4)); k < n; k++) { // washing lines strung between the backs of buildings
    const y = 3 * Math.floor(sr(1, 4)) + 1.6;
    if (srand() < 0.5) { const z = sr(Y.z0 + 1, Y.z1 - 1); laundryLine([Y.x0 - 0.1, z], [Y.x1 + 0.1, z + sr(-2, 2)], y); }
    else { const x = sr(Y.x0 + 1, Y.x1 - 1); laundryLine([x, Y.z0 - 0.1], [x + sr(-2, 2), Y.z1 + 0.1], y); }
  }
  for (const A of Y.alleys) { // alleys: string lights overhead and a bin against one wall
    const alongX = A.x1 - A.x0 > A.z1 - A.z0 ? false : true; // gap is narrow across its width
    const w = Math.min(A.x1 - A.x0, A.z1 - A.z0);
    if (w > 5) continue;
    const xs = A.x1 - A.x0 < A.z1 - A.z0; // alley runs along z when its x width is the narrow one
    for (let t = 0.25; t < 1; t += 0.33) {
      if (xs) { const z = lerp(A.z0, A.z1, t); stringLights([A.x0, z], [A.x1, z], 4.2); } else { const x = lerp(A.x0, A.x1, t); stringLights([x, A.z0], [x, A.z1], 4.2); }
    }
    if (srand() < 0.6) { if (xs) wheelie(A.x0 + 0.45, lerp(A.z0, A.z1, 0.5)); else wheelie(lerp(A.x0, A.x1, 0.5), A.z0 + 0.45); }
    void alongX;
  }
};

// ---------------------------------------------------------------------
// the street dressing pass: walks every block's pavement
// ---------------------------------------------------------------------
function dressStreets() {
  const cityBus = new Map();
  for (const r of blockRects) {
    const style = r.city.style, override = siteOverrides.has(blockKey(r.city, r.i, r.j));
    const dc = Math.hypot((r.x0 + r.x1) / 2 - r.city.cx, (r.z0 + r.z1) / 2 - r.city.cz) / r.city.half;
    const downtown = style === 'metro' && dc < 0.45;
    let busLeft = (cityBus.get(r.city) ?? 0) < (style === 'metro' ? 14 : 5) && srand() < 0.35 ? 1 : 0;
    let cartLeft = style !== 'suburb' && srand() < 0.2 ? 1 : 0;
    for (const side of SIDES) {
      const I = sideInfo(side, r.x0, r.x1, r.z0, r.z1), alongX = side[1] === 'z';
      const P = (a, off) => (alongX ? [a, I.fixed - I.out * off] : [I.fixed - I.out * off, a]);
      const faceIn = -I.out; // benches face the road: their back is toward the buildings
      let hydr = false;
      // street trees in grates, evenly spaced
      if (style !== 'industrial') {
        const gap = downtown ? 9 : style === 'suburb' ? 13 : 11;
        for (let a = I.a0 + 6; a < I.a1 - 5; a += gap) {
          const [x, z] = P(a, 0.75);
          if (!isFree(x, z, 0.7)) continue;
          claim(x, z, 1.1);
          if (downtown) { propBuf.box(x - 0.6, x + 0.6, 0.15, 0.6, z - 0.6, z + 0.6, 0x8a8478); propBuf.box(x - 0.52, x + 0.52, 0.6, 0.62, z - 0.52, z + 0.52, 0x3a2a1a); addTree(x, z, sr(0.9, 1.15), true, 0); }
          else { markBuf.box(x - 0.6, x + 0.6, 0.155, 0.17, z - 0.6, z + 0.6, 0x2a2a2a, { sides: false }); addTree(x, z, sr(0.9, 1.3)); }
        }
      }
      // curb-side furniture between the trees
      for (let a = I.a0 + 4; a < I.a1 - 4; a += sr(2.5, 4.5)) {
        const [x, z] = P(a, 0.7);
        const roll = srand();
        if (busLeft && roll < 0.3 && style !== 'industrial') {
          const [bx, bz] = P(a, 1.2);
          let ok = true; for (let t = -2.6; t <= 2.6; t += 1) { const [qx, qz] = P(a + t, 1.2); if (!isFree(qx, qz, 0.9)) ok = false; }
          if (ok) { for (let t = -2.6; t <= 2.6; t += 0.5) { const [qx, qz] = P(a + t, 1.2); claim(qx, qz, 1.1); } busShelter(bx, bz, side); busLeft = 0; cityBus.set(r.city, (cityBus.get(r.city) ?? 0) + 1); a += 3; continue; }
        }
        if (cartLeft && roll < 0.45) { if (isFree(x, z, 1.3)) { claim(x, z, 1.6); foodCart(...P(a, 1.0), alongX); cartLeft = 0; continue; } }
        if (!isFree(x, z, 0.5)) continue;
        if (style === 'metro' || (style === 'suburb' && override === false && r.j >= 2 && r.j <= 3)) {
          if (!hydr && roll < 0.2) { claim(x, z, 0.5); hydrant(x, z); hydr = true; }
          else if (roll < 0.42) { if (isFree(x, z, 1.0)) { claim(x, z, 1.1); bench(x, z, alongX, faceIn); } }
          else if (roll < 0.55) { claim(x, z, 0.5); bin(x, z); }
          else if (roll < 0.63) { if (isFree(x, z, 0.9)) { claim(x, z, 1.0); newsBoxes(x, z, alongX); } }
          else if (roll < 0.75 && !downtown) { claim(x, z, 0.4); meter(x, z); }
          else if (roll < 0.8) { if (isFree(x, z, 1.1)) { claim(x, z, 1.2); bikeRack(x, z, alongX); } }
          else if (roll < 0.84) { claim(x, z, 0.5); mailbox(x, z); }
          else if (roll < 0.87) { if (isFree(x, z, 0.8)) { claim(x, z, 0.9); phoneBox(x, z); } }
        } else if (style === 'suburb') {
          if (!hydr && roll < 0.15) { claim(x, z, 0.5); hydrant(x, z); hydr = true; }
          else if (roll < 0.3) { claim(x, z, 0.5); wheelie(x, z); }
        } else { // docks
          if (!hydr && roll < 0.15) { claim(x, z, 0.5); hydrant(x, z); hydr = true; }
          else if (roll < 0.3) { claim(x, z, 0.4); propBuf.cyl(x, z, 0.14, 0.14, 0.15, 1.0, 0xe0b020, 8); propBuf.cyl(x, z, 0.15, 0.15, 0.6, 0.75, 0x1a1a1a, 8, false); col(x, z, 0.15, 0.15, 1.0); }
          else if (roll < 0.38) { claim(x, z, 0.4); cone(x, z); }
        }
      }
      // building-side dressing: planters, cafe tables, A-boards and produce outside the shops
      if (!override && style !== 'industrial') {
        for (let a = I.a0 + 3; a < I.a1 - 3; a += sr(3, 6)) {
          const [x, z] = P(a, SW - 0.75), roll = srand();
          if (!isFree(x, z, 0.6)) continue;
          if (roll < 0.14) { claim(x, z, 0.7); planter(x, z); }
          else if (roll < 0.24 && style === 'metro') { const [cx, cz] = P(a, SW - 1.1); if (isFree(cx, cz, 1.1)) { claim(cx, cz, 1.3); cafeSet(cx, cz); } }
          else if (roll < 0.32) { claim(x, z, 0.4); aFrame(...P(a, SW - 1.0), alongX); }
          else if (roll < 0.37) { if (isFree(x, z, 1.1)) { claim(x, z, 1.2); produceStand(x, z, alongX); } }
        }
      }
      // industrial yards: barrels, pallets, crates and cable drums against the buildings
      if (style === 'industrial' && !override) {
        for (let a = I.a0 + 3; a < I.a1 - 3; a += sr(3, 7)) {
          const [x, z] = P(a, SW - 0.9), roll = srand();
          if (!isFree(x, z, 0.8)) continue;
          claim(x, z, 0.9);
          if (roll < 0.3) { barrel(x, z, spick([0x2a5aa0, 0xc8302a, 0x3a6a3a, 0xe0b020])); if (srand() < 0.6) { const [x2, z2] = P(a + 0.7, SW - 0.9); if (isFree(x2, z2, 0.35)) { claim(x2, z2, 0.4); barrel(x2, z2, 0x2a5aa0); } } }
          else if (roll < 0.55) pallets(x, z);
          else if (roll < 0.75) crates(x, z);
          else if (roll < 0.85) spool(x, z);
        }
      }
      // utility poles and sagging wires along suburban and dock streets
      if (style !== 'metro' && (side === 'pz' || side === 'px')) {
        let prev = null;
        for (let a = I.a0 + 3; a < I.a1 - 2; a += 18) {
          const [x, z] = P(a, 0.35);
          if (!isFree(x, z, 0.25)) { prev = null; continue; }
          claim(x, z, 0.4); utilityPole(x, z, alongX);
          if (prev) wires(prev, [x, z], alongX);
          prev = [x, z];
        }
      }
    }
    // manhole covers and drains on the road beside this block
    for (const side of SIDES) {
      if (srand() < 0.5) continue;
      const I = sideInfo(side, r.x0, r.x1, r.z0, r.z1), alongX = side[1] === 'z', a = sr(I.a0 + 5, I.a1 - 5), off = sr(2.5, 5.5);
      const x = alongX ? a : I.fixed + I.out * off, z = alongX ? I.fixed + I.out * off : a;
      markBuf.cyl(x, z, 0.45, 0.45, 0.02, 0.035, 0x3a3a3c, 10); markBuf.cyl(x, z, 0.36, 0.36, 0.035, 0.04, 0x4a4a4c, 10);
      for (let k = 0; k < 2; k++) { const da = sr(I.a0 + 3, I.a1 - 3), dx = alongX ? da : I.fixed + I.out * 0.35, dz = alongX ? I.fixed + I.out * 0.35 : da; markBuf.box(dx - (alongX ? 0.4 : 0.15), dx + (alongX ? 0.4 : 0.15), 0.02, 0.035, dz - (alongX ? 0.15 : 0.4), dz + (alongX ? 0.15 : 0.4), 0x1a1a1c, { sides: false }); }
    }
  }
}
worldHooks.afterGen.push(dressStreets);
void CITIES;

// ---------------------------------------------------------------------
// homes: the suburban houses you can walk into (living room, kitchen, and a bed if there's room)
// ---------------------------------------------------------------------
const HOME_WALLS = [0xf0e8d8, 0xe8f0e8, 0xf4e4e0, 0xe0e8f4, 0xf8f4e8, 0xe8dcc8];
const HOME_NAMES = ['A FAMILY HOME', 'SOMEONE\'S HOUSE', 'A SEMI', 'A BUNGALOW', 'A TERRACED HOUSE', 'A COSY HOUSE'];
export function houseInside(L, side, am, h, col) {
  const F = frameOf(L, side), { A0, A1, D } = F, T = 0.2, CEIL = 2.9;
  if (D < 5 || A1 - A0 < 6) return false;
  if (colliders.some((c) => c.h > 1 && (c.y0 || 0) < 1 && c.x1 > Math.min(L.x0, L.x1) + 0.3 && c.x0 < L.x1 - 0.3 && c.z1 > L.z0 + 0.3 && c.z0 < L.z1 - 0.3)) return false;
  { const [qx0, qx1, qz0, qz1] = F.rect(am - 1, am + 1, -2.6, 0); if (colliders.some((c) => c.h > 0.4 && (c.y0 || 0) < 1 && c.x1 > qx0 && c.x0 < qx1 && c.z1 > qz0 && c.z0 < qz1)) return false; }
  const wall = spick(HOME_WALLS), wood = spick([0x8a5a32, 0x6a4a2a, 0xa07a4a]), sofaC = spick([0x5a6a8a, 0x8a3a3a, 0x4a6a4a, 0x6a5a7a, 0xb08a5a]);
  // walls: collisions on the shell, a doorway in the front
  // (the outer 0.2 m is the house's own textured shell; the painted inner face sits just inside it)
  const W2 = T + 0.06;
  const wallAt = (a0, a1, b0, b1, y0, y1, va0, va1, vb0, vb1) => { F.box(ib, va0, va1, vb0, vb1, y0, y1, wall); const [x0, x1, z0, z1] = F.rect(a0, a1, b0, b1); if (y0 < 1) addCollider(x0, x1, z0, z1, y1, { y0: 0 }); };
  wallAt(A0, A1, D - W2, D, 0.15, CEIL, A0 + T, A1 - T, D - W2, D - T); // back
  wallAt(A0, A0 + W2, 0, D, 0.15, CEIL, A0 + T, A0 + W2, T, D - T); wallAt(A1 - W2, A1, 0, D, 0.15, CEIL, A1 - W2, A1 - T, T, D - T); // sides
  wallAt(A0, am - 0.65, 0, W2, 0.15, CEIL, A0 + T, am - 0.65, T, W2); wallAt(am + 0.65, A1, 0, W2, 0.15, CEIL, am + 0.65, A1 - T, T, W2); // front, either side of the door
  F.box(ib, am - 0.65, am + 0.65, T, W2, 2.45, CEIL, wall);
  F.box(ib, am - 0.75, am - 0.65, -0.02, T + 0.02, 0.15, 2.45, 0xf0f0f0); F.box(ib, am + 0.65, am + 0.75, -0.02, T + 0.02, 0.15, 2.45, 0xf0f0f0);
  F.box(floorB, A0, A1, 0, D, 0.15, 0.2, spick([0xb08a5a, 0x9a7a5a, 0xc8b8a0, 0x8a6a4a]));
  F.box(ib, A0, A1, 0, D, CEIL - 0.02, CEIL, 0xf4f4f0);
  // living room on one side of the door, kitchen at the back, a bed if it's deep enough
  const nBefore = F.n || 0;
  const left = am > (A0 + A1) / 2 ? A0 + T : am + 1, right = am > (A0 + A1) / 2 ? am - 1 : A1 - T;
  const lw = right - left;
  if (lw > 2.4) {
    const sa = (left + right) / 2;
    F.box(ib, sa - Math.min(1.1, lw / 2 - 0.2), sa + Math.min(1.1, lw / 2 - 0.2), 1.0, 1.85, 0.2, 0.62, sofaC, true); // sofa
    F.box(ib, sa - Math.min(1.1, lw / 2 - 0.2), sa + Math.min(1.1, lw / 2 - 0.2), 1.6, 1.85, 0.62, 1.05, sofaC);
    F.box(ib, sa - 0.5, sa + 0.5, 2.4, 2.9, 0.2, 0.48, wood, true); // coffee table
    F.box(ib, sa - 1.2, sa + 1.2, 2.0, 3.4, 0.2, 0.22, spick([0xa83a3a, 0x3a5a8a, 0xc8a050, 0x5a8a6a])); // rug
    if (D > 5.2) { F.box(ib, sa - 0.8, sa + 0.8, 3.55, 3.95, 0.2, 0.6, 0x2a2a2a, true); F.box(ib, sa - 0.65, sa + 0.65, 3.7, 3.78, 0.6, 1.4, 0x111111); F.glow(sa - 0.6, sa + 0.6, 3.68, 3.7, 0.65, 1.35, spick([0x3a6ac8, 0x5ac88a, 0xc8a03a])); } // TV
  }
  // kitchen counter and fridge along the back wall
  F.box(ib, A0 + T, Math.min(A1 - T, A0 + T + 3.2), D - T - 0.65, D - T, 0.2, 0.95, spick([0xe8e8e8, 0x8a9aa8, 0x6a4a3a]), true);
  F.box(ib, A0 + T, Math.min(A1 - T, A0 + T + 3.2), D - T - 0.67, D - T, 0.95, 1.0, 0x3a3a3a);
  F.box(ib, A1 - T - 0.8, A1 - T - 0.05, D - T - 0.75, D - T, 0.2, 1.9, 0xf0f0f0, true);
  // dining table
  if (D > 6.5) { const ta = (A0 + A1) / 2 + (am > (A0 + A1) / 2 ? -1.5 : 1.5), tb = D * 0.62; F.box(ib, ta - 0.6, ta + 0.6, tb - 0.45, tb + 0.45, 0.85, 0.9, wood, true); for (const [da, db] of [[-0.8, 0], [0.8, 0]]) chair(F, ta + da, tb + db, wood); }
  if (D > 7.5 && lw > 2.4) { const ba = right - 1.1; F.box(ib, ba - 0.9, ba + 0.9, D - T - 2.9, D - T - 0.9, 0.2, 0.6, 0xf0f0f0, true); F.box(ib, ba - 0.9, ba + 0.9, D - T - 2.9, D - T - 2.2, 0.6, 0.7, spick([0x8a3a5a, 0x3a5a8a, 0x5a8a5a])); } // bed
  F.lamp(A0 + 1, A1 - 1, D / 2 - 0.2, D / 2 + 0.2, CEIL - 0.02, 0xfff0d0);
  const [rx0, rx1, rz0, rz1] = F.rect(A0, A1, 0, D);
  const name = spick(HOME_NAMES), items = (F.n || 0) - nBefore;
  interiorZones.push({ x0: rx0, x1: rx1, z0: rz0, z1: rz1, y0: -0.5, y1: CEIL - 0.1, name, home: true });
  const [kx0, kx1, kz0, kz1] = F.rect(am - 1.6, am + 1.6, -4.5, 1.2); keepClear.push({ x0: kx0, x1: kx1, z0: kz0, z1: kz1 });
  { const [nx0, nx1, nz0, nz1] = F.rect(am - 1.1, am + 1.1, -2.2, 2.2); navOpen.push({ x0: nx0, x1: nx1, z0: nz0, z1: nz1 }); }
  const [dx, dz] = F.toXZ(am, 0.5), [kx, kz] = F.toXZ(am, D * 0.5);
  const path = [-1.5, -0.5, 0.5, 1.4].map((b) => F.toXZ(am, b));
  walkIns.push({ path, x: dx, z: dz, name, kind: 'home', city: 'ASHFORD', keeper: { x: kx, z: kz }, rect: { x0: rx0, x1: rx1, z0: rz0, z1: rz1 }, side, home: true, items });
  return true;
}
lotHooks.house = houseInside;
