// Docks warehouses: the big metal sheds in SALTMARSH DOCKS are hollow now. Roll-up doors open onto a
// concrete floor with steel columns, high-bay lamps and a mezzanine office up a flight of stairs. Each
// shed is one of several kinds: pallet racking with a forklift, a fish market, a boat repair shop,
// self-storage cages, or a disused shed with fire barrels and an old sofa. All of it is real collision
// you can hide behind, climb and chase through, and the walls block sight like any building.
import { clamp, srand, sr, spick } from './core.js';
import { SW, groundHoles, lotHooks, keepClear, navOpen, addCollider, addRoof, facadeBox, propBuf, glowBuf, SIDES, CONTAINER_COLORS } from './world.js';
import { slab, stairs, ib, lightB, glassB, sign, interiorZones } from './interiors.js';
import { frameOf } from './streets.js';

// {name, kind, rect:{x0,x1,z0,z1}, h, doors:[{x,z,ox,oz}] (inside point + outside point), mezz:{x,z,y},
//  spots:[{x,z,y,face,what}] places a worker could stand and do something}
export const warehouses = [];

const WH_KINDS = {
  racking: ['BAYSIDE LOGISTICS', 'GULLWING FREIGHT', 'TIDEMARK STORES', 'NORTH QUAY CARGO'],
  fish: ['SALTMARSH FISH MARKET', 'MORNING CATCH', 'THE BRINE HALL'],
  boats: ['GULL MARINE REPAIRS', 'KEEL & CO BOATWORKS', 'DRYDOCK SEVEN'],
  storage: ['SAFEKEEP STORAGE', 'LOCK-IT-AWAY', 'BOXHAVEN UNITS'],
  disused: ['DISUSED SHED', 'CONDEMNED UNIT', 'THE OLD SHED'],
};
const WH_POOL = ['racking', 'fish', 'boats', 'storage', 'racking', 'disused', 'boats', 'racking', 'fish', 'storage']; // dealt in turn so every kind turns up
const WH_T = 0.3, WH_DOOR_W = 5, WH_DOOR_H = 4.8, WH_MEZZ = 3.8;
let whUnit = 0;
const whNames = {};

function warehouseInside(R, h, tint, streets, city) {
  const doorSides = SIDES.filter((sd) => streets[sd]);
  if (!doorSides.length || h < 8) return false;
  // the main doors go on the street side that gives the deepest shed
  const depth = (sd) => (sd[1] === 'x' ? R.x1 - R.x0 : R.z1 - R.z0);
  doorSides.sort((a, b) => depth(b) - depth(a) + (srand() - 0.5) * 0.01);
  const side = doorSides[0], F = frameOf(R, side), { A0, A1, D } = F, W = A1 - A0;
  if (D < 14 || W < 12) return false;
  // a second door on a street side at right angles, through a cross aisle
  const perp = doorSides.find((sd) => sd[1] !== side[1]);
  const perpEdge = perp ? (perp[0] === 'p' ? 'hi' : 'lo') : null; // which end of the a axis it's on
  const holeNear = (a0, a1, b0, b1) => { const [x0, x1, z0, z1] = F.rect(a0, a1, b0, b1); return groundHoles.some((g) => g.x1 > x0 && g.x0 < x1 && g.z1 > z0 && g.z0 < z1); };
  const unit = ++whUnit, kind = WH_POOL[(unit - 1) % WH_POOL.length], name = WH_KINDS[kind][(whNames[kind] = (whNames[kind] ?? Math.floor(srand() * 4)) + 1) % WH_KINDS[kind].length];
  const wallC = kind === 'disused' ? 0x6a6660 : 0xb8b4aa;

  // --- shell ---------------------------------------------------------------------------------
  const wall = (edge, s0, s1, y0, y1) => {
    if (s1 - s0 < 0.05) return;
    const r = edge === 'front' ? F.rect(s0, s1, 0, WH_T) : edge === 'back' ? F.rect(s0, s1, D - WH_T, D) : edge === 'lo' ? F.rect(A0, A0 + WH_T, s0, s1) : F.rect(A1 - WH_T, A1, s0, s1);
    facadeBox('metal', r[0], r[1], y0, y1, r[2], r[3], tint);
    addCollider(r[0], r[1], r[2], r[3], y1, { y0 });
  };
  // front doors: one, or two on a wide shed, kept clear of the stairs on the A0 side
  const nDoors = W >= 26 ? 2 : 1, doorsA = [];
  for (let k = 0; k < nDoors; k++) {
    let m = A0 + 4 + ((W - 6) * (k + 1)) / (nDoors + 1);
    m = clamp(m, A0 + 4 + WH_DOOR_W / 2, A1 - 1.2 - WH_DOOR_W / 2);
    for (let t = 0; t < 6 && holeNear(m - WH_DOOR_W / 2 - 0.5, m + WH_DOOR_W / 2 + 0.5, -SW - 0.5, 0); t++) m = clamp(m + 2.5, A0 + 4 + WH_DOOR_W / 2, A1 - 1.2 - WH_DOOR_W / 2);
    if (holeNear(m - WH_DOOR_W / 2 - 0.5, m + WH_DOOR_W / 2 + 0.5, -SW - 0.5, 0)) continue;
    if (doorsA.some((o) => Math.abs(o - m) < WH_DOOR_W + 1)) continue;
    doorsA.push(m);
  }
  if (!doorsA.length) return false;
  doorsA.sort((a, b) => a - b);
  let a = A0;
  for (const m of doorsA) { wall('front', a, m - WH_DOOR_W / 2, 0, h); wall('front', m - WH_DOOR_W / 2, m + WH_DOOR_W / 2, WH_DOOR_H, h); a = m + WH_DOOR_W / 2; }
  wall('front', a, A1, 0, h);
  wall('back', A0, A1, 0, h);
  // cross aisle depth for the side door, clear of the mezzanine at the back
  const bd = clamp(Math.round(D * 0.45), 8, D - 12);
  for (const edge of ['lo', 'hi']) {
    if (edge === perpEdge) {
      const e0 = bd - WH_DOOR_W / 2, e1 = bd + WH_DOOR_W / 2;
      wall(edge, WH_T, e0, 0, h); wall(edge, e0, e1, WH_DOOR_H, h); wall(edge, e1, D - WH_T, 0, h);
    } else wall(edge, WH_T, D - WH_T, 0, h);
  }
  // roof: the pitched cap outside, a walkable top, and a ceiling with skylight strips inside
  propBuf.prism(R.x0, R.x1, R.z0, R.z1, h, 2, 0x6a6a70, true);
  addRoof(R.x0, R.x1, R.z0, R.z1, h + 1, { city, shed: true, y0: h - 0.25 });
  F.box(ib, A0 + WH_T, A1 - WH_T, WH_T, D - WH_T, h - 0.25, h, 0x4a4a50);
  for (let b = 3; b < D - 3; b += 7) F.glow(A0 + 2, A1 - 2, b, b + 1.2, h - 0.27, h - 0.25, 0xc8d8e0);
  // floor: sealed concrete with yellow lane lines
  F.box(ib, A0 + WH_T, A1 - WH_T, WH_T, D - WH_T, 0.17, 0.2, kind === 'disused' ? 0x6a6862 : 0x9a9890);
  for (const m of doorsA) for (const e of [m - WH_DOOR_W / 2 + 0.3, m + WH_DOOR_W / 2 - 0.3]) F.box(ib, e - 0.06, e + 0.06, 0.4, Math.min(D - 7, 9), 0.2, 0.21, 0xe0c020);
  // walls inside: a concrete plinth and a painted band so the shed reads as a room
  F.box(ib, A0 + WH_T, A1 - WH_T, D - WH_T - 0.05, D - WH_T, 0.2, 1.2, 0x8a8880);
  F.box(ib, A0 + WH_T, A0 + WH_T + 0.05, WH_T, D - WH_T, 0.2, 1.2, 0x8a8880);
  F.box(ib, A1 - WH_T - 0.05, A1 - WH_T, WH_T, D - WH_T, 0.2, 1.2, 0x8a8880);
  F.box(ib, A0 + WH_T, A1 - WH_T, D - WH_T - 0.06, D - WH_T - 0.05, 2.6, 3.0, wallC === 0x6a6660 ? 0x5a4a3a : 0x2a5a9a);
  // door frames: hazard posts, the rolled-up shutter drum, a lamp and the company name above
  const doors = [];
  const doorFrame = (edge, m) => {
    const posts = edge === 'front' ? [[m - WH_DOOR_W / 2, 0], [m + WH_DOOR_W / 2, 0]] : [[edge === 'lo' ? A0 : A1, m - WH_DOOR_W / 2], [edge === 'lo' ? A0 : A1, m + WH_DOOR_W / 2]];
    for (const [pa, pb] of posts) for (let y = 0.2; y < 1.4; y += 0.4) {
      const c = Math.round(y / 0.4) % 2 ? 0x1a1a1a : 0xe0c020;
      if (edge === 'front') F.box(ib, pa - 0.12, pa + 0.12, -0.05, WH_T + 0.05, y, y + 0.2, c);
      else { const e0 = edge === 'lo' ? A0 : A1 - WH_T; F.box(ib, e0 - 0.05, e0 + WH_T + 0.05, pb - 0.12, pb + 0.12, y, y + 0.2, c); }
    }
    if (edge === 'front') {
      F.box(ib, m - WH_DOOR_W / 2, m + WH_DOOR_W / 2, WH_T, WH_T + 0.55, WH_DOOR_H - 0.55, WH_DOOR_H, 0x5a5a60); // shutter drum
      const [lx, lz] = F.toXZ(m, -0.3);
      glowBuf.box(lx - 0.2, lx + 0.2, WH_DOOR_H + 0.4, WH_DOOR_H + 0.65, lz - 0.2, lz + 0.2, 0xffc070);
      const [sx, sz] = F.toXZ(m, -0.08), ry = side === 'pz' ? 0 : side === 'nz' ? Math.PI : side === 'px' ? Math.PI / 2 : -Math.PI / 2;
      if (h > WH_DOOR_H + 2.6) sign(`${name}  ·  UNIT ${unit}`, sx, WH_DOOR_H + 1.4, sz, ry, Math.min(WH_DOOR_W + 3, 9), 0.9, kind === 'disused' ? '#3a3a3a' : spick(['#1a3a6a', '#7a1a1a', '#1a5a3a', '#2a2a2e']), kind === 'disused' ? '#c8c0b0' : '#ffd23a');
      const [ix, iz] = F.toXZ(m, 1.5), [ox, oz] = F.toXZ(m, -2);
      doors.push({ x: ix, z: iz, ox, oz, side });
      { const [kx0, kx1, kz0, kz1] = F.rect(m - WH_DOOR_W / 2 - 0.5, m + WH_DOOR_W / 2 + 0.5, -SW - 0.5, 1); keepClear.push({ x0: kx0, x1: kx1, z0: kz0, z1: kz1 }); }
      { const [nx0, nx1, nz0, nz1] = F.rect(m - WH_DOOR_W / 2 + 0.5, m + WH_DOOR_W / 2 - 0.5, -2.2, 2.2); navOpen.push({ x0: nx0, x1: nx1, z0: nz0, z1: nz1 }); }
    } else {
      const ae = edge === 'lo' ? A0 : A1, inw = edge === 'lo' ? 1 : -1;
      const [ix, iz] = F.toXZ(ae + inw * 1.5, m), [ox, oz] = F.toXZ(ae - inw * 2, m);
      doors.push({ x: ix, z: iz, ox, oz, side: perp });
      { const [kx0, kx1, kz0, kz1] = F.rect(Math.min(ae - inw * (SW + 0.5), ae + inw), Math.max(ae - inw * (SW + 0.5), ae + inw), m - WH_DOOR_W / 2 - 0.5, m + WH_DOOR_W / 2 + 0.5); keepClear.push({ x0: kx0, x1: kx1, z0: kz0, z1: kz1 }); }
      { const [nx0, nx1, nz0, nz1] = F.rect(ae - 2.2, ae + 2.2, m - WH_DOOR_W / 2 + 0.5, m + WH_DOOR_W / 2 - 0.5); navOpen.push({ x0: nx0, x1: nx1, z0: nz0, z1: nz1 }); }
    }
  };
  for (const m of doorsA) doorFrame('front', m);
  if (perpEdge) doorFrame(perpEdge, bd);

  // --- columns and lamps -----------------------------------------------------------------------
  const spots = [];
  const spot = (sa, sb, y, what) => { const [x, z] = F.toXZ(sa, sb), [ex, ez] = F.toXZ(sa, 4); spots.push({ x, z, y, what, ex, ez }); }; // (ex, ez): the way in from the loading area
  const colA = [];
  if (W > 18) for (let ca = A0 + W / 3; ca < A1 - 3; ca += W / 3) colA.push(ca);
  for (const ca of colA) for (let cb = 9; cb < D - 7; cb += 9) {
    if (perpEdge && Math.abs(cb - bd) < 3.2) continue;
    if (doorsA.some((m) => Math.abs(m - ca) < WH_DOOR_W / 2 + 0.6) && cb < 7) continue;
    F.box(ib, ca - 0.2, ca + 0.2, cb - 0.2, cb + 0.2, 0, h - 0.25, 0x3a5a8a, true);
  }
  for (let b = 2.5; b < D - 2; b += 6) for (let la = A0 + 3; la < A1 - 2; la += 7) {
    F.box(ib, la - 0.02, la + 0.02, b - 0.02, b + 0.02, h - 1.6, h - 0.25, 0x222222); // chain
    F.box(ib, la - 0.45, la + 0.45, b - 0.45, b + 0.45, h - 1.75, h - 1.6, 0x4a4a50);
    F.lamp(la - 0.4, la + 0.4, b - 0.4, b + 0.4, h - 1.75, kind === 'disused' ? 0xffb060 : 0xfff2d8);
  }

  // --- mezzanine office at the back, up a flight of stairs on the A0 side ------------------------
  const mb = D - 5.5; // the mezzanine's front edge
  { const [x0, x1, z0, z1] = F.rect(A0 + WH_T, A1 - WH_T, mb, D - WH_T); slab(ib, x0, x1, WH_MEZZ, z0, z1, 0x7a7a7e, 0.3); }
  for (let pa = A0 + 4; pa < A1 - 1; pa += 5) F.box(ib, pa - 0.15, pa + 0.15, mb + 0.1, mb + 0.4, 0.2, WH_MEZZ - 0.3, 0x3a5a8a, true);
  { const [sx, sz] = F.toXZ(A0 + 1.25, mb); stairs(sx, sz, side, 1.5, WH_MEZZ, 0.2, 0x5a5a60); }
  // railing along the edge, leaving the top of the stairs open
  F.box(ib, A0 + 2.1, A1 - WH_T, mb, mb + 0.08, WH_MEZZ, WH_MEZZ + 1.05, 0xe0c020, true);
  for (let ra = A0 + 2.3; ra < A1 - 0.4; ra += 1.4) F.box(ib, ra - 0.03, ra + 0.03, mb, mb + 0.08, WH_MEZZ, WH_MEZZ + 1.0, 0xc0a018);
  // the office: glass front, a desk with a glowing screen, filing cabinets, a kettle, a calendar
  const oa0 = A1 - Math.min(9, W * 0.45), oa1 = A1 - WH_T;
  F.box(glassB, oa0, oa1 - 2.2, mb + 0.6, mb + 0.7, WH_MEZZ, WH_MEZZ + 2.6, 0x9ac8e0, true, { glass: true });
  F.box(ib, oa0 - 0.1, oa0, mb + 0.6, D - WH_T, WH_MEZZ, WH_MEZZ + 2.6, 0xd8d4c8, true);
  F.box(ib, oa0, oa1, mb + 0.6, D - WH_T, WH_MEZZ + 2.6, WH_MEZZ + 2.7, 0xd8d4c8);
  { const da = (oa0 + oa1) / 2; F.box(ib, da - 1, da + 1, D - 1.6, D - 0.9, WH_MEZZ, WH_MEZZ + 0.78, 0x6a4a32, true); F.glow(da - 0.3, da + 0.3, D - 1.3, D - 1.25, WH_MEZZ + 0.8, WH_MEZZ + 1.2, 0x8ad0ff); spot(da, D - 2.2, WH_MEZZ, 'desk'); }
  for (let k = 0; k < 2; k++) F.box(ib, oa0 + 0.3 + k * 0.6, oa0 + 0.8 + k * 0.6, D - 0.9, D - WH_T, WH_MEZZ, WH_MEZZ + 1.3, 0x8a8a90, true);
  F.box(ib, oa1 - 1.6, oa1 - 0.9, D - WH_T - 0.03, D - WH_T, WH_MEZZ + 1.4, WH_MEZZ + 2.1, 0xf0f0e8); // calendar
  F.lamp(oa0 + 0.6, oa1 - 0.6, mb + 1.2, D - 0.8, WH_MEZZ + 2.58, 0xfff8e8);
  // under the mezzanine: lockers, a tool wall and a workbench
  for (let la = A0 + 3; la < A0 + 3 + Math.min(6, W * 0.3); la += 0.6) F.box(ib, la, la + 0.55, D - 0.8, D - WH_T, 0.2, 2.0, spick([0x3a6a9a, 0x4a7aaa]), true);
  { const wa = A1 - 5; F.box(ib, wa, wa + 3.4, D - 1.2, D - WH_T, 0.2, 0.95, 0x8a6a4a, true); F.box(ib, wa, wa + 3.4, D - WH_T - 0.04, D - WH_T, 1.2, 2.6, 0x9a8a6a); for (let t = wa + 0.3; t < wa + 3.2; t += 0.35) F.box(ib, t, t + 0.06, D - WH_T - 0.1, D - WH_T - 0.04, 1.5 + (t * 13 % 7) * 0.1, 2.3, spick([0xc83a2a, 0x2a2a2e, 0xe0c020])); spot(wa + 1.7, D - 2, 0.2, 'bench'); }
  const mezz = (() => { const [x, z] = F.toXZ((A0 + oa0) / 2 + 1, mb + 2.5); return { x, z, y: WH_MEZZ }; })();

  // --- the floor: what this shed is for -------------------------------------------------------
  const fa0 = A0 + 3.4, fa1 = A1 - 1.2, fb0 = 6.5, fb1 = mb - 8.2; // a clear cross aisle in front of the stairs, which run down to b = mb - 5.5
  const bands = perpEdge ? [[fb0, bd - WH_DOOR_W / 2 - 0.6], [bd + WH_DOOR_W / 2 + 0.6, fb1]] : [[fb0, fb1]];
  const rows = (pitch, width, fn) => { for (let ra = fa0; ra + width <= fa1; ra += pitch) for (const [b0, b1] of bands) if (b1 - b0 > 2.5) fn(ra, ra + width, b0, b1); };
  const pallet = (pa, pb, y, solidOne) => {
    F.box(ib, pa - 0.6, pa + 0.6, pb - 0.5, pb + 0.5, y, y + 0.14, 0xa88a5a, !!solidOne);
    const top = y + 0.14 + sr(0.4, 1.1);
    F.box(ib, pa - 0.55, pa + 0.55, pb - 0.45, pb + 0.45, y + 0.14, top, spick([0xb89060, 0xc8a070, 0x9a7a4a, 0xd8d0c0, 0x5a7aa0]), !!solidOne);
    if (srand() < 0.5) F.box(ib, pa - 0.56, pa + 0.56, pb - 0.05, pb + 0.05, y + 0.14, top + 0.01, 0xd8c8a0); // strapping
  };
  const forklift = (pa, pb) => {
    F.box(ib, pa - 0.7, pa + 0.7, pb - 1.1, pb + 1.1, 0.2, 1.3, 0xe0a020, true);
    F.box(ib, pa - 0.65, pa + 0.65, pb - 0.5, pb + 0.7, 1.3, 2.3, 0x2a2a2e); // cage
    F.box(ib, pa - 0.6, pa + 0.6, pb - 1.25, pb - 1.15, 0.2, 3.0, 0x3a3a3e); // mast
    for (const s of [-0.35, 0.35]) F.box(ib, pa + s - 0.07, pa + s + 0.07, pb - 2.3, pb - 1.25, 0.2, 0.28, 0x3a3a3e);
    F.box(ib, pa - 0.75, pa + 0.75, pb + 0.7, pb + 1.25, 0.2, 1.1, 0x3a3a3e); // counterweight
    spot(pa + 1.4, pb, 0.2, 'forklift');
  };
  if (kind === 'racking') {
    rows(4.6, 1.4, (r0, r1, b0, b1) => {
      const rh = Math.min(5.6, h - 2.2);
      { const [x0, x1, z0, z1] = F.rect(r0, r1, b0, b1); addCollider(x0, x1, z0, z1, rh, { y0: 0, rack: true }); }
      F.box(ib, (r0 + r1) / 2 - 0.03, (r0 + r1) / 2 + 0.03, b0, b1, 0.2, rh, 0x5a5a60); // mesh back panel
      for (const y of [0.2, 1.85, 3.55, rh - 0.1]) if (y < rh) F.box(ib, r0, r1, b0, b1, y, y + 0.1, 0x2a4a8a); // shelf decks
      for (const y of [0.3, 1.95, 3.65]) if (y < rh - 1.2) for (let pb = b0 + 0.7; pb < b1 - 0.6; pb += 1.25) if (srand() < 0.82) { const pa = (r0 + r1) / 2; F.box(ib, pa - 0.62, pa + 0.62, pb - 0.52, pb + 0.52, y, y + 0.12, 0xa88a5a); F.box(ib, pa - 0.58, pa + 0.58, pb - 0.48, pb + 0.48, y + 0.12, y + sr(0.6, 1.5), spick([0xb89060, 0xc8a070, 0x9a7a4a, 0xd8d0c0, 0x5a7aa0, 0xc84a2a])); }
      for (let pb = b0; pb <= b1 + 0.01; pb += Math.max(1.2, (b1 - b0) / Math.ceil((b1 - b0) / 2.6))) for (const e of [r0, r1 - 0.1]) F.box(ib, e, e + 0.1, pb - 0.06, pb + 0.06, 0.2, rh + 0.05, 0xd06a1a); // orange uprights
      spot(r1 + 1.5, (b0 + b1) / 2, 0.2, 'pick');
    });
    forklift(A1 - 3, 3.6);
    for (let k = 0; k < 3; k++) pallet(A0 + 2.4, 2.2 + k * 1.3, 0.2, true);
  } else if (kind === 'fish') {
    rows(4.4, 1.3, (r0, r1, b0, b1) => {
      for (let pb = b0; pb < b1 - 1.5; pb += 4.2) {
        const e = Math.min(pb + 3, b1);
        F.box(ib, r0, r1, pb, e, 0.2, 0.92, 0xc8ccd0, true);
        F.box(ib, r0 + 0.08, r1 - 0.08, pb + 0.08, e - 0.08, 0.92, 1.0, 0xe8f4fa); // ice
        for (let fb = pb + 0.35; fb < e - 0.3; fb += 0.42) F.box(ib, r0 + 0.25, r1 - 0.25, fb - 0.12, fb + 0.12, 1.0, 1.08, spick([0xb0b8c0, 0xd08a60, 0x8a9aa8, 0xe0a080, 0x6a7a8a]));
        F.box(ib, (r0 + r1) / 2 - 0.03, (r0 + r1) / 2 + 0.03, (pb + e) / 2 - 0.03, (pb + e) / 2 + 0.03, 1.0, 2.4, 0x3a3a3e);
        F.box(ib, r0 - 0.3, r1 + 0.3, (pb + e) / 2 - 0.25, (pb + e) / 2 + 0.25, 2.4, 2.5, 0xf0f0f0); // price board
        spot(r1 + 0.9, (pb + e) / 2, 0.2, 'stall');
      }
    });
    // crate stacks, a cold room in the corner
    for (let k = 0; k < 5; k++) { const ca = A0 + 2.2, cb = 2.2 + k * 1.1, n = 1 + Math.floor(srand() * 4); F.box(ib, ca - 0.45, ca + 0.45, cb - 0.4, cb + 0.4, 0.2, 0.2 + n * 0.38, spick([0x2a6aa0, 0xd0d0d0, 0x2a8a6a]), true); }
    F.box(ib, A1 - 4.6, A1 - WH_T, WH_T, 4.2, 0.2, 3.2, 0xe8eef0, true);
    F.box(ib, A1 - 3.4, A1 - 2.0, 4.2, 4.25, 0.2, 2.4, 0x9aa8b0); // cold room door
  } else if (kind === 'boats') {
    // one or two hulls up on cradles, ladders against them, benches and drums down the sides
    const hulls = W >= 22 && fb1 - fb0 > 12 ? 2 : 1;
    for (let k = 0; k < hulls; k++) {
      const ha = hulls === 1 ? (fa0 + fa1) / 2 : fa0 + 3 + k * ((fa1 - fa0 - 6) / 1), hb0 = fb0 + 0.5, hb1 = Math.min(fb1, hb0 + 14), col = spick([0xf0f0f0, 0x2a5a9a, 0xc83a2a, 0x2a7a5a]);
      for (const cb of [hb0 + 2, hb1 - 2]) F.box(ib, ha - 1.4, ha + 1.4, cb - 0.25, cb + 0.25, 0.2, 1.0, 0x6a4a32, true);
      F.box(ib, ha - 0.7, ha + 0.7, hb0 + 0.6, hb1 - 0.6, 1.0, 1.6, col, true);
      F.box(ib, ha - 1.3, ha + 1.3, hb0 + 1.2, hb1, 1.6, 2.9, col, true);
      F.box(ib, ha - 1.35, ha + 1.35, hb0 + 1.2, hb1, 2.9, 3.05, 0x8a6a4a, true); // deck
      F.box(ib, ha - 0.9, ha + 0.9, hb1 - 4.5, hb1 - 1.2, 3.05, 4.6, 0xe8e8e8, true); // wheelhouse
      F.glow(ha - 0.92, ha + 0.92, hb1 - 4.2, hb1 - 1.5, 3.9, 4.3, 0x9ac8e0);
      F.box(ib, ha - 0.8, ha + 0.8, hb0 + 0.2, hb0 + 1.2, 1.6, 2.9, col, true); // bow
      F.box(ib, ha + 1.35, ha + 1.75, hb0 + 4, hb0 + 4.5, 0.2, 3.05, 0x9a9aa0); // ladder up the side
      spot(ha + 2.3, (hb0 + hb1) / 2, 0.2, 'hull');
      spot(ha, (hb0 + hb1) / 2, 3.05, 'deck');
    }
    for (let k = 0; k < 4; k++) { const da = A0 + 2.2, db = 2 + k * 0.9; F.cyl(ib, da, db, 0.3, 0.3, 0.2, 1.1, spick([0x2a4a8a, 0xc83a2a, 0x3a3a3e]), 10); }
    forklift(A1 - 3, 3.6);
  } else if (kind === 'storage') {
    rows(5.2, 2.2, (r0, r1, b0, b1) => {
      F.box(ib, r0, r1, b0, b1, 0.2, 2.7, 0x9aa0a8, true);
      F.box(ib, r0 - 0.03, r1 + 0.03, b0, b1, 2.7, 2.78, 0x6a6a70);
      for (let pb = b0 + 0.2; pb < b1 - 1.4; pb += 1.8) for (const e of [r0 - 0.02, r1]) F.box(ib, e, e + 0.02, pb, pb + 1.4, 0.3, 2.4, spick([0xe07a1a, 0xe07a1a, 0x2a6aa0]));
      spot(r1 + 1.4, (b0 + b1) / 2, 0.2, 'unit');
    });
    F.box(ib, A1 - 3.2, A1 - 1.2, 2, 3.2, 0.2, 1.05, 0x3a3a44, true); // front desk
    spot(A1 - 2.2, 3.8, 0.2, 'desk');
  } else { // disused: a few old containers, fire barrels, a sofa, graffiti on the walls
    const ca = (fa0 + fa1) / 2;
    for (let k = 0; k < 2; k++) { const cb = fb0 + 1.5 + k * 7; if (cb + 6 > fb1 + 4) break; const c = spick(CONTAINER_COLORS); F.box(ib, ca - 1.22, ca + 1.22, cb, cb + 6, 0.2, 2.75, c, true); if (srand() < 0.5) F.box(ib, ca - 1.22, ca + 1.22, cb, cb + 6, 2.75, 5.3, spick(CONTAINER_COLORS), true); }
    for (const [ba, bb] of [[A0 + 3, 4], [A1 - 3, fb0 + 3], [ca + 3, fb1 - 1]]) { F.cyl(ib, ba, bb, 0.3, 0.3, 0.2, 1.0, 0x5a3a2a, 10); F.cyl(lightB, ba, bb, 0.24, 0.12, 1.0, 1.4, 0xff9a3a, 8); spot(ba + 0.9, bb, 0.2, 'barrel'); }
    F.box(ib, A0 + 3.6, A0 + 5.6, 7, 7.9, 0.2, 0.7, 0x6a3a4a, true); F.box(ib, A0 + 3.6, A0 + 5.6, 7.7, 7.9, 0.7, 1.2, 0x6a3a4a); spot(A0 + 4.6, 7.2, 0.2, 'sofa');
    for (let k = 0; k < 6; k++) { const ga = A0 + 1 + srand() * (W - 3), gw = sr(1.2, 3); F.box(ib, ga, Math.min(A1 - 0.4, ga + gw), D - WH_T - 0.08, D - WH_T - 0.06, sr(0.5, 1.4), sr(1.8, 2.6), spick([0xe03a8a, 0x3ae0c0, 0xf0e030, 0x8a3ae0, 0xf07a2a])); }
  }
  // a few loose pallets by the doors, a bin and a fire extinguisher for every shed
  F.box(ib, A0 + WH_T, A0 + WH_T + 0.3, 2.6, 2.9, 1.0, 1.6, 0xd02a2a);
  if (kind !== 'fish' && kind !== 'disused') spot(A0 + 2.5, 4, 0.2, 'clipboard');

  const [rx0, rx1, rz0, rz1] = F.rect(A0, A1, 0, D);
  interiorZones.push({ x0: rx0, x1: rx1, z0: rz0, z1: rz1, y0: -0.5, y1: h - 0.3, name: name + ' · UNIT ' + unit, warehouse: true });
  warehouses.push({ name, kind, unit, rect: { x0: rx0, x1: rx1, z0: rz0, z1: rz1 }, h, doors, mezz, spots, side, city: city.name });
  return true;
}
lotHooks.warehouse = warehouseInside;
