// Shops: a little strip of walk-in shops in every town (a gun shop, a place to hire help, and a costume
// shop), each with a shopkeeper behind the counter, plus the shop menu you get at the counter.
import * as THREE from '../vendor/three.module.min.js';
import { $ } from './core.js';
import { CITIES, siteOverrides, blockKey, addRoof, roofBuf, propBuf, glowBuf, parapet, parkedSpots, addTree } from './world.js';
import { solid, sign, lamp, ib, floorB } from './interiors.js';
import { buildPerson, SKINS, HAIRS } from './people.js';

export const shopSpots = []; // {x, z, y, r, kind, name, city, face}

// one block per town turns into a shop strip facing the street on `face` ('pz' or 'nz')
const STRIPS = [
  { city: CITIES[0], i: 4, j: 3, face: 'pz', names: { guns: 'AMMO & SONS', hire: 'HIRED HANDS', costume: 'NOSE & MO' } },
  { city: CITIES[1], i: 2, j: 2, face: 'pz', names: { guns: "OL' RELIABLE ARMS", hire: 'RENT-A-PAL', costume: 'DISGUISE-O-RAMA' } },
  { city: CITIES[2], i: 2, j: 2, face: 'nz', names: { guns: 'HARBOUR GUNS & BAIT', hire: 'DOCKHAND HIRE', costume: 'SHANTY COSTUMES' } },
];
const KIND_STYLE = {
  guns: { bg: '#2a2a2a', fg: '#ffb43a', wall: 0x4a4038, counter: 0x3a2a22 },
  hire: { bg: '#1f4a8a', fg: '#fff', wall: 0xd8cfbf, counter: 0x6a5a4a },
  costume: { bg: '#e0389a', fg: '#fff', wall: 0xf0d8f0, counter: 0x8a3a8a },
};
const keepers = [];

for (const S of STRIPS) {
  siteOverrides.set(blockKey(S.city, S.i, S.j), (r, I) => {
    const front = S.face === 'pz' ? 1 : -1;
    const zF = S.face === 'pz' ? I.iz1 - 0.6 : I.iz0 + 0.6, zB = zF - front * 10;
    const zLo = Math.min(zF, zB), zHi = Math.max(zF, zB), H = 4.6, T = 0.3;
    const x0 = I.ix0 + 1, x1 = I.ix1 - 1, uw = (x1 - x0) / 3;
    // forecourt + lot surfaces
    propBuf.box(I.ix0, I.ix1, 0.15, 0.2, I.iz0, I.iz1, 0x47454c);
    floorB.box(x0, x1, 0.2, 0.24, zLo, zHi, 0xffffff);
    // shell: back wall, end walls, roof
    const back = S.face === 'pz' ? [zLo, zLo + T] : [zHi - T, zHi];
    solid(ib, x0, x1, 0, H, back[0], back[1], 0x8a7a6a);
    solid(ib, x0, x0 + T, 0, H, zLo, zHi, 0x8a7a6a); solid(ib, x1 - T, x1, 0, H, zLo, zHi, 0x8a7a6a);
    roofBuf.flat(x0, x1, zLo, zHi, H, 0x3d3944);
    ib.box(x0, x1, H - 0.3, H - 0.29, zLo, zHi, 0xe8e2d6, { bottom: true, top: false, sides: false });
    addRoof(x0, x1, zLo, zHi, H, { y0: H - 0.3, city: S.city });
    parapet(x0, x1, zLo, zHi, H);
    // three units
    ['guns', 'hire', 'costume'].forEach((kind, k) => {
      const ux0 = x0 + k * uw, ux1 = ux0 + uw, um = (ux0 + ux1) / 2, st = KIND_STYLE[kind], name = S.names[kind];
      if (k > 0) solid(ib, ux0 - 0.15, ux0 + 0.15, 0, H, zLo, zHi, 0xd8d2c6);
      // inner wall paint on the back wall
      const bz = S.face === 'pz' ? back[1] + 0.01 : back[0] - 0.01;
      ib.box(ux0 + 0.2, ux1 - 0.2, 0.2, H - 0.3, Math.min(bz, bz + front * 0.02), Math.max(bz, bz + front * 0.02), st.wall);
      // shopfront: glass either side of a 2.4 m doorway
      const fz0 = zF - (S.face === 'pz' ? 0.12 : -0.12);
      for (const [g0, g1] of [[ux0 + 0.15, um - 1.2], [um + 1.2, ux1 - 0.15]]) {
        solid(ib, g0, g1, 0, 0.9, Math.min(zF, fz0), Math.max(zF, fz0), 0x5a5a62);
        solid(ib, g0, g1, 0.9, H, Math.min(zF, fz0), Math.max(zF, fz0), 0x9ac8e0, { glass: true });
      }
      solid(ib, um - 1.2, um + 1.2, 2.7, H, Math.min(zF, fz0), Math.max(zF, fz0), 0x5a5a62);
      // awning + sign
      const za = zF + front * 1.6;
      propBuf.box(ux0 + 0.3, ux1 - 0.3, 3.0, 3.15, Math.min(zF, za), Math.max(zF, za), parseInt(st.bg.slice(1), 16));
      sign(name, um, 3.75, zF + front * 0.08, 0, uw - 1.2, 0.9, st.bg, st.fg);
      // counter along the back with the shopkeeper behind it
      const cz = zB + front * 2.4;
      solid(ib, um - 2.6, um + 2.6, 0.2, 1.15, Math.min(cz, cz - front * 0.8), Math.max(cz, cz - front * 0.8), st.counter);
      ib.box(um - 2.7, um + 2.7, 1.15, 1.22, Math.min(cz, cz - front * 0.9), Math.max(cz, cz - front * 0.9) , 0xd8d0c0);
      lamp(um - 3, um + 3, H - 0.3, Math.min(zF, zB) + 2, Math.max(zF, zB) - 2, 0xfff4dc);
      keepers.push({ x: um, z: zB + front * 1.0, y: 0.2, face: S.face, kind });
      shopSpots.push({ x: um, z: cz + front * 1.1, y: 0.2, r: 2.4, kind, name, city: S.city.name, face: S.face });
      // decor on the back wall
      const wz = S.face === 'pz' ? back[1] + 0.03 : back[0] - 0.03, wz2 = wz + front * 0.12;
      const deco = (a0, a1, y0, y1, col) => ib.box(a0, a1, y0, y1, Math.min(wz, wz2), Math.max(wz, wz2), col);
      if (kind === 'guns') {
        deco(um - 4, um + 4, 1.6, 3.6, 0x8a6a4a); // pegboard
        for (let g = 0; g < 4; g++) { const gx = um - 3.2 + g * 2.1; deco(gx - 0.8, gx + 0.8, 3.0 - (g % 2) * 0.9, 3.15 - (g % 2) * 0.9, 0x1c1c20); deco(gx - 0.75, gx - 0.55, 2.75 - (g % 2) * 0.9, 3.0 - (g % 2) * 0.9, 0x1c1c20); }
        deco(um + 3.4, um + 3.5, 1.7, 3.3, 0xb83a2a); deco(um + 3.3, um + 3.6, 3.2, 3.3, 0xb83a2a); // the crowbar on display
        for (const sx of [ux0 + 1.2, ux1 - 1.2]) solid(ib, sx - 0.5, sx + 0.5, 0.2, 1.8, zB + front * 4.5 - 0.5, zB + front * 4.5 + 0.5, 0x3a3a40); // ammo crates
      } else if (kind === 'hire') {
        for (let g = 0; g < 3; g++) { const gx = um - 2.6 + g * 2.6; deco(gx - 0.8, gx + 0.8, 1.7, 2.9, [0xf0e0a0, 0xa0d0f0, 0xf0b0b0][g]); deco(gx - 0.3, gx + 0.3, 2.1, 2.6, 0x5a4a3a); }
        for (const sx of [ux0 + 1.3, ux1 - 1.3]) { solid(ib, sx - 0.4, sx + 0.4, 0.2, 0.7, zB + front * 5 - 0.4, zB + front * 5 + 0.4, 0x2a5a8a); }
      } else {
        // mannequins with daft hats and giant glasses
        for (const sx of [ux0 + 1.4, ux1 - 1.4]) {
          const mz = zB + front * 5;
          solid(ib, sx - 0.25, sx + 0.25, 0.2, 1.6, mz - 0.18, mz + 0.18, 0xf0e0d0);
          ib.box(sx - 0.2, sx + 0.2, 1.6, 2.0, mz - 0.2, mz + 0.2, 0xf0e0d0);
          ib.box(sx - 0.32, sx + 0.32, 1.78, 1.9, mz + front * 0.2, mz + front * 0.24, 0x111111);
          ib.box(sx - 0.35, sx + 0.35, 2.0, 2.06, mz - 0.35, mz + 0.35, 0xe0c020); ib.box(sx - 0.18, sx + 0.18, 2.06, 2.5, mz - 0.18, mz + 0.18, 0xe0c020);
        }
        deco(um - 4, um + 4, 1.7, 3.4, 0xffd0f0);
        for (let g = 0; g < 5; g++) { const gx = um - 3.2 + g * 1.6; deco(gx - 0.5, gx + 0.5, 2.6, 2.75, 0x1a1a1a); deco(gx - 0.3, gx + 0.3, 2.0, 2.15, 0x5a3a1a); }
      }
    });
    // parking lot behind, with a couple of parked cars and trees round the edge
    const lz0 = S.face === 'pz' ? I.iz0 + 1 : zHi + 1, lz1 = S.face === 'pz' ? zLo - 1 : I.iz1 - 1;
    for (let x = x0 + 3; x < x1 - 2; x += 3) propBuf.box(x - 0.06, x + 0.06, 0.2, 0.22, lz0 + 1, lz0 + 5.5, 0xe8e8e8);
    for (const k of [1, 4, 8]) parkedSpots.push({ x: x0 + 1.5 + k * 3, z: lz0 + 3.2, heading: 0 });
    for (const tx of [I.ix0 + 1.5, I.ix1 - 1.5]) addTree(tx, (lz0 + lz1) / 2, 1.2);
    glowBuf.box(x0, x1, 0.21, 0.22, Math.min(zF, zF + front * 0.3), Math.max(zF, zF + front * 0.3), 0xfff0c0);
  });
}

// shopkeepers are spawned once the people module is ready
export function spawnShopkeepers(scene) {
  const outfits = { guns: 0x5a4a2a, hire: 0x2a3a5a, costume: 0xe060c0 };
  for (const K of keepers) {
    const p = buildPerson({ skin: SKINS[Math.floor(Math.random() * SKINS.length)], hair: HAIRS[Math.floor(Math.random() * HAIRS.length)], shirt: outfits[K.kind], pants: 0x23262e, cap: K.kind === 'costume' ? 0x30d0ff : null });
    p.group.position.set(K.x, K.y, K.z); p.group.rotation.y = K.face === 'pz' ? 0 : Math.PI;
    if (K.kind === 'costume') { // a walking advert for the stock
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.05), new THREE.MeshLambertMaterial({ color: 0x111111 })); m.position.set(0, 0.02, 0.21); p.head.add(m);
      const mo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.05), new THREE.MeshLambertMaterial({ color: 0x3a2412 })); mo.position.set(0, -0.1, 0.21); p.head.add(mo);
    }
    scene.add(p.group); K.p = p;
  }
}
export function animateShopkeepers(t) {
  for (const K of keepers) if (K.p) { K.p.head.rotation.y = Math.sin(t * 0.7 + K.x) * 0.4; K.p.armR.rotation.x = Math.sin(t * 1.3 + K.z) * 0.15 - 0.1; }
}
export function shopNear(x, y, z) {
  for (const s of shopSpots) if (Math.abs(s.x - x) < s.r && Math.abs(s.z - z) < s.r && Math.abs(s.y - y) < 1.5) return s;
  return null;
}

// ---------------------------------------------------------------------
// catalogue
// ---------------------------------------------------------------------
export const CATALOG = {
  guns: [
    { id: 'crowbar', name: 'CROWBAR', price: 90, desc: 'Two or three whacks drops anyone. Right click winds up a home-run swing that sends people flying (4 s cooldown).' },
    { id: 'ammo_pistol', name: 'PISTOL ROUNDS x24', price: 20, desc: 'For the pistol you started with.' },
    { id: 'shotgun', name: 'PUMP SHOTGUN', price: 240, desc: 'Six shells, wide spread, very persuasive up close.' },
    { id: 'ammo_shotgun', name: 'SHELLS x12', price: 25, desc: 'Shotgun shells.' },
    { id: 'smg', name: 'COMPACT SMG', price: 380, desc: 'Thirty rounds, hold the trigger. Loud. Very loud.' },
    { id: 'ammo_smg', name: 'SMG ROUNDS x60', price: 30, desc: 'SMG ammo.' },
    { id: 'medkit', name: 'FIRST AID KIT', price: 30, desc: 'Patches you up by 50 health, right now.' },
  ],
  hire: [
    { id: 'pal', name: 'A PAL', price: 70, desc: 'Follows you about and throws hands at anyone who comes for you. Sticks around 3 days or until flattened.' },
    { id: 'guard', name: 'A BODYGUARD', price: 190, desc: 'Same deal but armed, tougher, and a slightly better attitude.' },
  ],
  costume: [],
};
const BLURBS = {
  guns: ['"No questions. Well, one. Cash or cash?"', '"Saw you on the news. Lovely picture."', '"Crowbar\'s the bestseller this week. Can\'t think why."'],
  hire: ['"Everyone\'s got a price. Ours is lower."', '"Kevin\'s great. Don\'t ask Kevin about his ex."', '"No refunds if they get flattened."'],
  costume: ['"Nobody will ever know it\'s you. Probably."'],
};

// ---------------------------------------------------------------------
// the shop menu
// ---------------------------------------------------------------------
let menuCtx = null, shopOpen = null;
export function openShop(spot, ctx) {
  menuCtx = ctx; shopOpen = spot;
  $('shop-title').textContent = spot.name;
  const b = BLURBS[spot.kind]; $('shop-blurb').textContent = b[Math.floor(Math.random() * b.length)];
  renderShop();
  $('shop').classList.remove('hidden');
}
export function closeShop() { $('shop').classList.add('hidden'); shopOpen = null; }
export const shopIsOpen = () => !!shopOpen;
function renderShop(note = '') {
  if (!shopOpen) return;
  const items = menuCtx.items ? menuCtx.items(shopOpen.kind) : CATALOG[shopOpen.kind];
  $('shop-cash').textContent = `WALLET $${menuCtx.cash()}`;
  $('shop-note').textContent = note;
  const list = $('shop-list'); list.innerHTML = '';
  items.forEach((it, i) => {
    const state = menuCtx.state(it); // '' | 'owned' | 'full'
    const row = document.createElement('button');
    row.className = 'shop-row' + (state ? ' owned' : menuCtx.cash() < it.price ? ' poor' : '');
    row.innerHTML = `<span class="k">${i + 1}</span><span class="n">${it.name}<small>${it.desc}</small></span><span class="p">${state === 'owned' ? 'OWNED' : state === 'full' ? 'FULL' : '$' + it.price}</span>`;
    row.addEventListener('click', () => shopBuy(i));
    list.appendChild(row);
  });
}
export function shopBuy(i) {
  if (!shopOpen) return;
  const items = menuCtx.items ? menuCtx.items(shopOpen.kind) : CATALOG[shopOpen.kind];
  const it = items[i]; if (!it) return;
  const err = menuCtx.buy(it);
  renderShop(err || `BOUGHT: ${it.name}`);
}
