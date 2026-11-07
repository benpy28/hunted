// Safehouses: one hideout per town. Get inside without being seen and you can lie low: your profile
// cools off fast, you heal, there's a stash to raid once a day and a bed to nap in. Get seen going in
// and the place is burned until tomorrow.
import * as THREE from '../vendor/three.module.min.js';
import { textTex, scene } from './core.js';
import { CITIES, siteOverrides, blockKey, addRoof, roofBuf, propBuf, glowBuf, parapet, addTree, addCollider, building } from './world.js';
import { solid, sign, lamp, ib, floorB } from './interiors.js';

export const safehouses = []; // {name, city, price, x0,x1,z0,z1 (inside), door, bed, stash, tv, owned, burnedDay, stashDay}
export const safeTVs = [];    // screen meshes, so the news can play on them

const HIDEOUTS = [
  { city: CITIES[0], i: 5, j: 5, name: "NAN'S OLD FLAT", price: 0, wall: 0x7a4a3a, blanket: 0xe07ab0, blurb: 'Smells of lavender and suspicion.' },
  { city: CITIES[1], i: 4, j: 4, name: 'THE SHED', price: 60, wall: 0x6a7a4a, blanket: 0x3a8ae0, blurb: "It's a shed. It has a bed in it. Don't ask." },
  { city: CITIES[2], i: 3, j: 3, name: 'THE BOAT SHED', price: 90, wall: 0x3a5a7a, blanket: 0xe0b030, blurb: 'No boat. Plenty of shed.' },
];
const tvMat = new THREE.MeshBasicMaterial({ map: textTex(256, 160, '#0a1830', '#9ad0ff', ['CHANNEL 9', 'PLEASE STAND BY'], 'bold 26px Arial, sans-serif') });
export const safeTvMat = tvMat;

for (const S of HIDEOUTS) {
  siteOverrides.set(blockKey(S.city, S.i, S.j), (r, I) => {
    const cx = (I.ix0 + I.ix1) / 2, T = 0.3, H = 3.4;
    const x0 = cx - 7, x1 = cx + 7, z1 = I.iz1 - 3, z0 = z1 - 10;
    const dx0 = cx - 4.4, dx1 = cx - 2.8; // the front door
    // yard: lawn round the house, a path to the door, a low wall with a gap
    propBuf.box(I.ix0, I.ix1, 0.15, 0.2, I.iz0, I.iz1, 0x4f7d3e);
    propBuf.box(dx0, dx1, 0.15, 0.22, z1, I.iz1, 0xb8b0a0);
    const wz = I.iz1 - 0.4;
    for (const [a, b] of [[I.ix0 + 0.5, dx0 - 0.4], [dx1 + 0.4, I.ix1 - 0.5]]) { propBuf.box(a, b, 0, 0.8, wz - 0.15, wz + 0.15, 0x9a8a7a); addCollider(a, b, wz - 0.15, wz + 0.15, 0.8); }
    // the house: brick walls, a doorway, a grubby front window, flat roof you can stand on
    floorB.box(x0, x1, 0.2, 0.24, z0, z1, 0xffffff);
    solid(ib, x0, x1, 0, H, z0, z0 + T, S.wall);
    solid(ib, x0, x0 + T, 0, H, z0, z1, S.wall); solid(ib, x1 - T, x1, 0, H, z0, z1, S.wall);
    solid(ib, x0, dx0, 0, H, z1 - T, z1, S.wall);
    solid(ib, dx0, dx1, 2.4, H, z1 - T, z1, S.wall);
    solid(ib, dx1, cx + 1, 0, H, z1 - T, z1, S.wall);
    solid(ib, cx + 1, cx + 5, 0, 1.0, z1 - T, z1, S.wall);
    solid(ib, cx + 1, cx + 5, 1.0, 2.4, z1 - T, z1, 0x8aa0a8, { glass: true });
    solid(ib, cx + 1, cx + 5, 2.4, H, z1 - T, z1, S.wall);
    solid(ib, cx + 5, x1, 0, H, z1 - T, z1, S.wall);
    propBuf.box(dx0 - 0.1, dx1 + 0.1, 2.4, 2.5, z1, z1 + 0.06, 0x3a2a1a); // door frame
    ib.box(dx0, dx0 + 0.06, 0.2, 2.4, z1 - T - 1.5, z1 - T, 0x5a3a24); // the door, swung open
    propBuf.box(dx0 - 0.3, dx1 + 0.3, 0.2, 0.23, z1 + 0.2, z1 + 1.2, 0x8a5a3a); // doormat
    sign('GO AWAY', (dx0 + dx1) / 2, 2.85, z1 + 0.06, 0, 1.4, 0.4, '#e8dcc0', '#5a2a1a');
    roofBuf.flat(x0, x1, z0, z1, H, 0x3d3944);
    ib.box(x0, x1, H - 0.02, H - 0.01, z0, z1, 0xe8e0d0, { bottom: true, top: false, sides: false });
    addRoof(x0, x1, z0, z1, H, { y0: H - 0.3, city: S.city });
    parapet(x0, x1, z0, z1, H);
    lamp(cx - 1, cx + 1, H - 0.02, z0 + 4, z0 + 5.5, 0xffe2b0);
    // furniture
    const bed = { x: cx + 4.9, z: z0 + 1.6 };
    solid(ib, cx + 3.2, cx + 6.6, 0, 0.5, z0 + T, z0 + 2.6, 0x5a3a2a);
    ib.box(cx + 3.25, cx + 6.55, 0.5, 0.68, z0 + T + 0.05, z0 + 2.55, 0xf0e8d8);
    ib.box(cx + 3.25, cx + 5.9, 0.68, 0.74, z0 + T + 0.05, z0 + 2.55, S.blanket);
    ib.box(cx + 5.95, cx + 6.5, 0.68, 0.82, z0 + 0.6, z0 + 2.2, 0xffffff); // pillow
    // sofa facing the telly on the left wall
    solid(ib, x0 + 4.2, x0 + 5.2, 0, 0.5, z0 + 3.2, z0 + 6.4, 0x8a3a3a);
    ib.box(x0 + 5.0, x0 + 5.4, 0.5, 1.1, z0 + 3.2, z0 + 6.4, 0x7a2a2a);
    solid(ib, x0 + T, x0 + 1.0, 0, 0.7, z0 + 3.6, z0 + 6.0, 0x2a2a30); // tv stand
    ib.box(x0 + 0.4, x0 + 0.8, 0.7, 1.95, z0 + 3.7, z0 + 5.9, 0x111114);
    const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.1), tvMat);
    tv.position.set(x0 + 0.82, 1.32, z0 + 4.8); tv.rotation.y = Math.PI / 2; tv.matrixAutoUpdate = false; tv.updateMatrix(); scene.add(tv);
    safeTVs.push(tv);
    // kitchen table, fridge, pizza boxes, a poster
    solid(ib, cx - 1.0, cx + 1.2, 0, 0.78, z0 + 6.0, z0 + 7.2, 0x8a6a4a);
    ib.box(cx - 0.6, cx + 0.2, 0.78, 0.86, z0 + 6.3, z0 + 7.0, 0xe0c080);
    solid(ib, x1 - 1.1, x1 - T, 0, 1.9, z0 + 4.0, z0 + 4.9, 0xe8e8e8);
    ib.box(x0 + 1.4, x0 + 2.8, 0.2, 0.42, z0 + 0.5, z0 + 1.4, 0xd0a060); ib.box(x0 + 1.5, x0 + 2.7, 0.42, 0.62, z0 + 0.6, z0 + 1.3, 0xc09050);
    ib.box(cx - 2.5, cx + 0.5, 1.4, 2.6, z0 + T, z0 + T + 0.04, 0xf0d040); ib.box(cx - 1.6, cx - 0.4, 1.7, 2.3, z0 + T + 0.04, z0 + T + 0.06, 0xd08040);
    // the stash: a beaten-up crate by the door
    const stash = { x: x1 - 1.6, z: z1 - 1.6 };
    solid(ib, x1 - 1.3, x1 - T - 0.1, 0, 0.8, z1 - 2.6, z1 - 1.5, 0xc0702a);
    ib.box(x1 - 1.35, x1 - T - 0.05, 0.8, 0.86, z1 - 2.65, z1 - 1.45, 0x8a4a1a);
    glowBuf.box(x1 - 1.0, x1 - 0.6, 0.86, 0.88, z1 - 2.2, z1 - 1.9, 0xffe080);
    // round the back: a garage block and some trees for cover
    building('brick' + (S.i % 3), I.ix0 + 2, I.ix1 - 2, I.iz0 + 2, z0 - 6, 6.5, null, { parapet: true });
    for (const tx of [I.ix0 + 2, I.ix1 - 2]) addTree(tx, z0 + 3, 1.3);
    for (const tx of [I.ix0 + 4.5, I.ix1 - 4.5]) { propBuf.box(tx - 0.5, tx + 0.5, 0, 1.1, z0 - 3, z0 - 2, 0x2a5a3a); addCollider(tx - 0.5, tx + 0.5, z0 - 3, z0 - 2, 1.1); }
    safehouses.push({ name: S.name, city: S.city.name, price: S.price, blurb: S.blurb, x0: x0 + T, x1: x1 - T, z0: z0 + T, z1: z1 - T,
      door: { x: (dx0 + dx1) / 2, z: z1 + 1 }, bed, stash, owned: S.price === 0, burnedDay: 0, stashDay: 0 });
  });
}

// the hideout you're standing inside, if any
export function safeAt(x, y, z) {
  if (y > 2.5 || y < -0.6) return null;
  for (const s of safehouses) if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return s;
  return null;
}
export function safeDoorNear(x, y, z) {
  if (y > 1.2 || y < -0.6) return null;
  for (const s of safehouses) if (Math.abs(s.door.x - x) < 1.6 && Math.abs(s.door.z - z) < 1.6) return s;
  return null;
}
export function safeSpotNear(s, x, z) {
  if (Math.hypot(s.bed.x - x, s.bed.z - z) < 2.2) return 'bed';
  if (Math.hypot(s.stash.x - x, s.stash.z - z) < 1.6) return 'stash';
  return null;
}
