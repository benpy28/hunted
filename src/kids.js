// Kids, prams, playgrounds and the school run.
//  - Parents (and the odd grandparent) walk about town with a kid in tow, holding hands, or pushing a
//    pram. Kids go wherever their grown-up goes: into the shops, home at night, off to the playground.
//  - Kids have sharp eyes and no manners. A kid who gets a good look at you stares, tugs a sleeve
//    ("MUM... MUM... MUM!") and then points and shouts it to the whole street. Their grown-up calls it in
//    and grabs them and runs. Give a kid a sweet (pick and mix from the market bakery) and they'll keep your
//    secret for the rest of the day. No sweets? A high five works on some of them.
//  - Nobody can hurt a kid: they aren't hunters, bullets and cars go straight past them, and if their
//    grown-up gets knocked flat they run off shouting "I'M TELLING!" (which they do).
//  - Playgrounds in PORT HALDEN and ASHFORD: swings, a slide, a roundabout, a seesaw and a sandpit, with
//    benches for the grown-ups to sit and watch.
//  - Ashford Primary: on school days parents walk their kids to the gates from 8 till 9, and at 3 o'clock
//    a crowd of parents waits at the gates while the kids come pouring out.
//  - Prams get parked outside shops while their owners pop in. Push one about and you look like any other
//    tired parent (you can't run with it, mind). If the owner comes out and sees you with it, look out.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, angDiff, lerp, clamp, scene, textTex } from './core.js';
import { CITIES, blockRects, SW, colliders, propBuf, glowBuf, worldHooks, keepClear, groundHoles, addCollider, blockedAt } from './world.js';
import { walkIns, lifeSpots } from './streets.js';
import { buildPerson, lam, HAIRS } from './people.js';
import { MK_STATE, markets } from './market.js';

export const KD_STATE = { told: 0, hushed: 0, highFives: 0, pramPushes: 0, pramT: 0, played: 0, schoolIn: 0, schoolOut: 0, families: 0, lastTold: null };
export const kids = [];      // {p, g, parent, x, z, y, face, mode, ...}
export const prams = [];     // {g, x, z, face, owner, mode: 'push'|'parked'|'player', baby}
export const playgrounds = []; // {city, x, z, x0, x1, z0, z1, pieces, benches}
export const schoolInfo = { city: 'ASHFORD', door: null, gate: null, field: null, name: 'ASHFORD PRIMARY SCHOOL' };
const kdHash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 61.331) * 43758.5453; return s - Math.floor(s); };
const kdOverlap = (c, x0, x1, z0, z1) => c.x1 > x0 && c.x0 < x1 && c.z1 > z0 && c.z0 < z1;
const kdClear = (list, x0, x1, z0, z1) => !list.some((c) => (c.h || 0) > 0.28 && (c.y0 || 0) < 2.6 && kdOverlap(c, x0, x1, z0, z1))
  && !keepClear.some((k) => kdOverlap(k, x0, x1, z0, z1)) && !groundHoles.some((k) => kdOverlap(k, x0 - 1, x1 + 1, z0 - 1, z1 + 1))
  && !markets.some((M) => kdOverlap(M, x0 - 2, x1 + 2, z0 - 2, z1 + 2));

// =====================================================================
// Building: playgrounds and the school gates (placed just before the world is baked)
// =====================================================================
const SWING_TOP = 2.4, SWING_LEN = 1.85;
function buildPlayground(city, x, z) {
  const PG = { city: city.name, x, z, x0: x - 7, x1: x + 7, z0: z - 5, z1: z + 5, pieces: [], benches: [] };
  // soft rubbery ground and a low fence (gaps at both ends to walk in)
  propBuf.box(x - 6.6, x + 6.6, 0.15, 0.24, z - 4.6, z + 4.6, 0x6a8a4a);
  for (const zz of [z - 4.7, z + 4.7]) for (const [a0, a1] of [[x - 6.7, x - 1.4], [x + 1.4, x + 6.7]]) {
    propBuf.box(a0, a1, 0.62, 0.7, zz - 0.04, zz + 0.04, 0xe0c030);
    for (let a = a0; a <= a1 + 0.01; a += 1.3) propBuf.box(a - 0.04, a + 0.04, 0.15, 0.7, zz - 0.04, zz + 0.04, 0x2a6ac8);
  }
  // swings: an A-frame at each end and a top bar, two seats on chains (the seats really swing)
  const sx = x - 3.6, sz = z - 1.8;
  for (const e of [-1.7, 1.7]) {
    for (const o of [-0.7, 0.7]) propBuf.box(sx + e - 0.06, sx + e + 0.06, 0.15, SWING_TOP, sz + o * 0.85 - 0.06, sz + o * 0.85 + 0.06, 0xc83a3a);
    addCollider(sx + e - 0.12, sx + e + 0.12, sz - 0.7, sz + 0.7, SWING_TOP, { y0: 0 });
  }
  propBuf.box(sx - 1.8, sx + 1.8, SWING_TOP - 0.08, SWING_TOP + 0.04, sz - 0.06, sz + 0.06, 0xc83a3a);
  for (const o of [-0.7, 0.7]) {
    const piv = new THREE.Group(); piv.position.set(sx + o, SWING_TOP, sz);
    for (const s of [-0.22, 0.22]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.025, SWING_LEN, 0.025).translate(0, -SWING_LEN / 2, 0), lam(0x9a9aa2)); ch.position.x = s; piv.add(ch); }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.22), lam(0x1a1a1e)); seat.position.y = -SWING_LEN; piv.add(seat);
    scene.add(piv);
    PG.pieces.push({ kind: 'swing', x: sx + o, z: sz, piv, ang: 0, kid: null, PG });
  }
  // slide: a ladder up to a little platform, and the chute down towards +x
  const lx = x + 0.8, lz = z - 2.2, top = 1.6;
  propBuf.box(lx - 0.5, lx + 0.5, top - 0.08, top, lz - 0.5, lz + 0.5, 0x3a8a3a);
  for (const [a, b] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) propBuf.box(lx + a - 0.05, lx + a + 0.05, 0.15, top + 0.9, lz + b - 0.05, lz + b + 0.05, 0xe0c030);
  for (let k = 0; k < 5; k++) propBuf.box(lx - 0.62, lx - 0.5, 0.3 + k * 0.3, 0.34 + k * 0.3, lz - 0.3, lz + 0.3, 0xb8b8c0);
  propBuf.box(lx - 0.55, lx + 0.55, top + 0.85, top + 1.0, lz - 0.55, lz + 0.55, 0xc83a3a); // little roof
  addCollider(lx - 0.5, lx + 0.5, lz - 0.5, lz + 0.5, top, { y0: 0 });
  for (let k = 0; k < 8; k++) { const t0 = k / 8, t1 = (k + 1) / 8, y0 = top - t0 * (top - 0.3), y1 = top - t1 * (top - 0.3); propBuf.box(lx + 0.5 + t0 * 2.8, lx + 0.5 + t1 * 2.8, Math.min(y0, y1) - 0.05, Math.max(y0, y1), lz - 0.3, lz + 0.3, 0x3ab0e0); }
  PG.pieces.push({ kind: 'slide', x: lx, z: lz, ladder: { x: lx - 0.8, z: lz }, top: { x: lx, z: lz, y: top }, bottom: { x: lx + 3.4, z: lz, y: 0.35 }, kid: null, kid2: null, PG });
  // roundabout (spins when kids push it)
  const rx = x + 3.8, rz = z + 1.9;
  const rg = new THREE.Group(); rg.position.set(rx, 0.15, rz);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.14, 18), lam(0xe0c030)); disc.position.y = 0.2; rg.add(disc);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), lam(0xc83a3a)); bar.position.set(Math.cos(a) * 1.0, 0.55, Math.sin(a) * 1.0); rg.add(bar); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), lam(0x2a6ac8)); hub.position.y = 0.5; rg.add(hub);
  scene.add(rg);
  PG.pieces.push({ kind: 'round', x: rx, z: rz, g: rg, spin: 0, kids: [], PG });
  // seesaw
  const wx = x - 3.4, wz = z + 2.4;
  propBuf.box(wx - 0.18, wx + 0.18, 0.15, 0.55, wz - 0.18, wz + 0.18, 0x2a6ac8);
  const sg = new THREE.Group(); sg.position.set(wx, 0.6, wz);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.3), lam(0xe07a2a)); sg.add(plank);
  for (const e of [-1.4, 1.4]) { const hd = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.3), lam(0x2a2a2a)); hd.position.set(e, 0.18, 0); sg.add(hd); }
  scene.add(sg);
  PG.pieces.push({ kind: 'seesaw', x: wx, z: wz, g: sg, kids: [null, null], PG });
  // sandpit
  const px = x + 0.2, pz = z + 2.6;
  propBuf.box(px - 1.4, px + 1.4, 0.15, 0.3, pz - 1.1, pz + 1.1, 0x8a6a4a); propBuf.box(px - 1.25, px + 1.25, 0.15, 0.31, pz - 0.95, pz + 0.95, 0xe8d8a0);
  PG.pieces.push({ kind: 'sand', x: px, z: pz, kids: [], PG });
  // two benches outside the fence for the grown-ups, looking in
  for (const [bx, bz, face] of [[x - 3, z - 6, 0], [x + 3, z + 6, Math.PI]]) {
    const fz = Math.cos(face);
    propBuf.box(bx - 0.9, bx + 0.9, 0.45, 0.52, bz - 0.22, bz + 0.22, 0x8a5a2a); propBuf.box(bx - 0.9, bx + 0.9, 0.52, 0.95, bz - fz * 0.22 - 0.04, bz - fz * 0.22 + 0.04, 0x8a5a2a);
    for (const e of [-0.8, 0.8]) propBuf.box(bx + e - 0.05, bx + e + 0.05, 0.15, 0.45, bz - 0.2, bz + 0.2, 0x2a2a2a);
    addCollider(bx - 0.9, bx + 0.9, bz - 0.22, bz + 0.22, 0.5, { y0: 0 });
    for (const o of [-0.45, 0.45]) { const s = { kind: 'bench', x: bx + o, z: bz + fz * 0.9, face, sx: bx + o, sz: bz + fz * 0.05, playground: PG }; lifeSpots.push(s); PG.benches.push(s); }
  }
  playgrounds.push(PG);
  return PG;
}
// find a quiet, open bit of a block for a playground (parks first)
function placePlayground(city, avoid) {
  let best = null;
  for (const r of blockRects) {
    if (r.city !== city || (avoid && avoid(r))) continue;
    const ix0 = r.x0 + SW + 1, ix1 = r.x1 - SW - 1, iz0 = r.z0 + SW + 1, iz1 = r.z1 - SW - 1;
    const list = colliders.filter((c) => kdOverlap(c, ix0 - 2, ix1 + 2, iz0 - 2, iz1 + 2));
    const solid = list.reduce((s, c) => s + ((c.h || 0) > 0.28 ? (Math.min(c.x1, ix1) - Math.max(c.x0, ix0)) * (Math.min(c.z1, iz1) - Math.max(c.z0, iz0)) : 0), 0);
    for (let x = ix0 + 7.6; x <= ix1 - 7.6; x += 2) for (let z = iz0 + 7.2; z <= iz1 - 7.2; z += 2) {
      if (!kdClear(list, x - 7.2, x + 7.2, z - 6.6, z + 6.6)) continue;
      const score = -solid - Math.hypot(x - city.cx, z - city.cz) * 0.4 + kdHash(x, z) * 3;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  if (best) buildPlayground(city, best.x, best.z);
}
// Ashford Primary: a front door with a sign over it, and gates on the pavement
function placeSchool() {
  const city = CITIES.find((c) => c.name === 'ASHFORD'); if (!city) return;
  const r = blockRects.find((b) => b.city === city && b.i === 2 && b.j === city.n - 2); if (!r) return;
  const ix0 = r.x0 + SW, ix1 = r.x1 - SW, iz0 = r.z0 + SW, iz1 = r.z1 - SW, bx = (ix0 + ix1) / 2, fz = iz0 + 2; // the building's front wall
  propBuf.box(bx - 1.1, bx + 1.1, 0.15, 2.5, fz - 0.06, fz, 0x2a4a8a); // double doors
  propBuf.box(bx - 0.03, bx + 0.03, 0.15, 2.5, fz - 0.08, fz - 0.05, 0x1a2a4a);
  glowBuf.box(bx - 0.9, bx + 0.9, 2.55, 2.62, fz - 0.1, fz - 0.06, 0xfff0c0);
  const tex = textTex(1024, 160, '#1a3a7a', '#f0e8c0', ['ASHFORD PRIMARY SCHOOL'], 'bold 72px Arial Black, Arial', true);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.95), new THREE.MeshLambertMaterial({ map: tex }));
  sign.position.set(bx, 3.4, fz - 0.08); sign.rotation.y = Math.PI; scene.add(sign);
  // gate pillars and railings along the front of the yard (railings only where nothing's in the way)
  const gz = iz0 + 0.35, list = colliders.filter((c) => kdOverlap(c, ix0 - 1, ix1 + 1, iz0 - 1, fz + 1));
  for (const e of [-2.1, 2.1]) { propBuf.box(bx + e - 0.25, bx + e + 0.25, 0.15, 1.6, gz - 0.25, gz + 0.25, 0x9a4a3a); propBuf.box(bx + e - 0.3, bx + e + 0.3, 1.6, 1.7, gz - 0.3, gz + 0.3, 0xc8c0b0); addCollider(bx + e - 0.25, bx + e + 0.25, gz - 0.25, gz + 0.25, 1.7, { y0: 0 }); }
  for (const [a0, a1] of [[ix0 + 0.5, bx - 2.4], [bx + 2.4, ix1 - 0.5]]) {
    if (a1 - a0 < 1 || !kdClear(list, a0, a1, gz - 0.1, gz + 0.1)) continue;
    propBuf.box(a0, a1, 1.1, 1.16, gz - 0.04, gz + 0.04, 0x2a5a2a);
    for (let a = a0; a <= a1; a += 0.3) propBuf.box(a - 0.02, a + 0.02, 0.15, 1.2, gz - 0.02, gz + 0.02, 0x2a5a2a);
    addCollider(a0, a1, gz - 0.06, gz + 0.06, 1.2, { y0: 0 });
  }
  schoolInfo.door = { x: bx, z: fz - 0.5 }; schoolInfo.gate = { x: bx, z: iz0 - 1.0 }; schoolInfo.yard = { x: bx, z: gz + 0.9 };
  schoolInfo.field = { x0: ix0 + 4, x1: ix1 - 4, z0: iz0 + 20, z1: iz1 - 4, x: bx, z: (iz0 + 20 + iz1 - 4) / 2 };
  schoolInfo.block = r;
}
worldHooks.beforeBake.push(() => {
  placeSchool();
  for (const name of ['PORT HALDEN', 'ASHFORD']) {
    const c = CITIES.find((q) => q.name === name);
    if (c) placePlayground(c, (r) => r === schoolInfo.block);
  }
});

// =====================================================================
// Kids
// =====================================================================
const KID_SHIRTS = [0xe03a3a, 0x3a8ae0, 0xf0d030, 0x3ac85a, 0xe07ad0, 0xf08a2a, 0x8a5ae0, 0x2ac8c8];
const KID_PANTS = [0x2c3e66, 0x3a5a8c, 0x23262e, 0x8a3a5a, 0x5a7a2a];
const KID_TELL = ['IT\'S THE ONE FROM THE TELLY!', 'THAT\'S THEM! THAT\'S THEM OFF THE NEWS!', 'I SPY WITH MY LITTLE EYE... A FUGITIVE!', 'WHY IS EVERYONE LOOKING FOR THAT PERSON?', 'LOOK! THE WANTED POSTER!', 'IS THAT THE BADDIE? IT IS! IT IS!'];
const KID_TUG = ['MUM... MUM... MUM!', 'DAD. DAD. DAAAD.', 'HEY... HEY!', 'LOOK, LOOK, LOOK!', 'WAIT A MINUTE...'];
const KID_CHAT = ['CAN WE GET ICE CREAM?', 'ARE WE NEARLY THERE?', 'I NEED A WEE', 'WHY IS THE SKY?', 'CARRY ME!', 'I\'M BORED', 'CAN I HAVE A DOG?', 'THAT MAN HAS A FUNNY HAT', 'I\'M A DINOSAUR. RAAAR!', 'MY LEGS ARE TIRED'];
const KID_PLAY = ['WHEEEE!', 'PUSH ME!', 'HIGHER! HIGHER!', 'WATCH THIS!', 'MY GO! MY GO!', 'I\'M THE KING OF THE CASTLE!', 'AGAIN! AGAIN!', 'TAG, YOU\'RE IT!'];
const KID_THANKS = ['THANK YOU!', 'SWEETS!', 'YOU\'RE MY BEST FRIEND NOW', 'I WON\'T TELL. PROMISE.', 'CAN I HAVE ANOTHER ONE?'];
const KID_HERO = ['CAN I HAVE YOUR AUTOGRAPH?!', 'YOU\'RE MY HERO!', 'DO THE FLYING! DO THE FLYING!', 'WHEN I GROW UP I\'M GONNA BE YOU!'];
const GROWNUP_HEARD = ['WHAT? WHERE?', 'DON\'T POINT, IT\'S RUDE... OH. OH NO.', 'STAY BEHIND ME, SWEETHEART.', 'OH MY DAYS. IT IS THEM.', 'RIGHT. WE\'RE GOING. NOW.'];
const GROWNUP_SHUSH = ['WHAT DO YOU SAY?', 'AW, THAT\'S KIND', 'NOT BEFORE YOUR TEA!', 'SAY THANK YOU!'];
export function makeKid(parent, K) {
  const look = { skin: parent.p.look.skin, hair: mpick(HAIRS.slice(0, 9)), shirt: mpick(KID_SHIRTS), pants: mpick(KID_PANTS), shoes: mpick([0xf0f0f0, 0xe03a3a, 0x3a8ae0, 0x1a1a1a]), beard: false, build: 1 };
  if (Math.random() < 0.3) { look.hat = Math.random() < 0.5 ? 'beanie' : 'bobble'; look.hatCol = mpick(KID_SHIRTS); }
  if (Math.random() < 0.45) { look.bag = 'backpack'; look.bagCol = mpick(KID_SHIRTS); }
  const p = buildPerson(look), s = mr(0.5, 0.6);
  p.group.scale.setScalar(s); p.head.scale.setScalar(1.22);
  scene.add(p.group);
  const fx = Math.sin(parent.face), fz = Math.cos(parent.face);
  const k = { p, g: p.group, s, parent, x: parent.x + fz * 0.6, z: parent.z - fx * 0.6, y: parent.y, face: parent.face, phase: Math.random() * 6, mode: 'follow', trail: [], starT: 0, toldN: 0, toldT: 0, hushDay: 0, lineT: mr(6, 18), seeT: Math.random() * 0.3, pointT: 0, side: Math.random() < 0.5 ? 1 : -1, hiT: 0 };
  if (Math.random() < 0.32) giveRide(k, Math.random() < 0.6 ? 'scooter' : 'bike'); // whizzing about on a scooter or a little bike
  kids.push(k); parent.kid = k; parent.fleer = true; KD_STATE.families++;
  return k;
}
// a scooter (deck, stem, handlebars) or a little bike with stabilisers, under the kid
function giveRide(k, kind) {
  const g = new THREE.Group(), col = mpick(KID_SHIRTS), m = (w, h, d, x, y, z, c) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); o.position.set(x, y, z); g.add(o); return o; };
  if (kind === 'scooter') {
    m(0.22, 0.05, 0.75, 0, 0.12, 0, col); m(0.05, 1.05, 0.05, 0, 0.62, 0.36, 0x9a9aa2); m(0.5, 0.05, 0.05, 0, 1.13, 0.36, 0x1a1a1e);
    for (const z of [-0.33, 0.36]) m(0.06, 0.16, 0.16, 0, 0.08, z, 0x1a1a1e);
  } else {
    for (const z of [-0.42, 0.42]) m(0.07, 0.48, 0.48, 0, 0.24, z, 0x1a1a1e);
    for (const x of [-0.3, 0.3]) m(0.05, 0.2, 0.2, x, 0.1, -0.42, 0x1a1a1e); // stabilisers
    m(0.08, 0.08, 0.86, 0, 0.5, 0, col); m(0.06, 0.5, 0.06, 0, 0.68, 0.38, col); m(0.55, 0.05, 0.05, 0, 0.94, 0.38, 0x1a1a1e); m(0.2, 0.06, 0.3, 0, 0.8, -0.18, 0x1a1a1e);
  }
  g.scale.setScalar(1 / k.s * 0.62); k.g.add(g); k.ride = kind; k.rideMesh = g;
}
function removeKid(k) { scene.remove(k.g); const i = kids.indexOf(k); if (i >= 0) kids.splice(i, 1); if (k.parent && k.parent.kid === k) { k.parent.kid = null; if (!k.parent.rival) k.parent.fleer = false; } if (k.piece) leavePiece(k); }
// a grown-up with a kid in tow, or a pram, or neither
export function maybeFamily(h, K) {
  if (h.type !== 'civ' || h.gunner || h.job || h.contract || h.guard || h.rival || h.kid || h.pram) return;
  const hr = K.hour; if (hr < 7 || hr > 21) return;
  const p = h.folk === 'parent' ? 0.8 : h.folk === 'shopper' ? 0.3 : h.folk === 'pensioner' ? 0.1 : h.folk === 'tourist' ? 0.15 : 0.03;
  if (Math.random() > p) return;
  if (Math.random() < 0.35 && prams.filter((P) => P.owner).length < 10) { givePram(h); return; }
  if (kids.length < 16) makeKid(h, K);
}
function leavePiece(k) {
  const P = k.piece; if (!P) return;
  if (P.kid === k) P.kid = null; if (P.kid2 === k) P.kid2 = null;
  if (P.kids) { const i = P.kids.indexOf(k); if (i >= 0) { if (P.kind === 'seesaw') P.kids[i] = null; else P.kids.splice(i, 1); } }
  k.piece = null; k.g.rotation.x = 0; k.p.legL.rotation.x = k.p.legR.rotation.x = 0;
}
function joinPiece(k, PG) {
  const free = PG.pieces.filter((P) => (P.kind === 'swing' && !P.kid) || (P.kind === 'slide' && !P.kid2) || (P.kind === 'round' && P.kids.length < 3) || (P.kind === 'seesaw' && P.kids.includes(null)) || (P.kind === 'sand' && P.kids.length < 3));
  if (!free.length) return false;
  const P = mpick(free); k.piece = P; k.playT = 0; k.slideT = 0;
  if (P.kind === 'swing') P.kid = k; else if (P.kind === 'slide') { if (!P.kid) P.kid = k; else P.kid2 = k; } else if (P.kind === 'seesaw') P.kids[P.kids.indexOf(null)] = k; else { P.kids.push(k); k.sandA = Math.random() * 6.28; }
  KD_STATE.played++;
  return true;
}
const _kfx = (a) => Math.sin(a), _kfz = (a) => Math.cos(a);
function kidStep(k, tx, tz, maxSpd, dt) {
  const dx = tx - k.x, dz = tz - k.z, d = Math.hypot(dx, dz);
  const spd = d > 0.15 ? Math.min(maxSpd, d * 3) : 0;
  if (spd > 0) {
    const nx = k.x + dx / d * spd * dt, nz = k.z + dz / d * spd * dt;
    if (!blockedAt(nx, nz) || d < 0.6) { k.x = nx; k.z = nz; } else if (!blockedAt(nx, k.z)) k.x = nx; else if (!blockedAt(k.x, nz)) k.z = nz;
    k.face += angDiff(k.face, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
  }
  return spd;
}
function kidPose(k, spd, dt) {
  const p = k.p;
  k.phase += spd * dt * 4.2;
  const sw = Math.sin(k.phase) * Math.min(1, spd / 2) * 0.9;
  p.legL.rotation.x = sw; p.legR.rotation.x = -sw; p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8; p.armL.rotation.z = p.armR.rotation.z = 0;
  if (k.rideMesh) k.rideMesh.visible = !k.piece && k.mode !== 'school';
  if (k.ride && k.rideMesh.visible) { // scooting or pedalling instead of walking
    const go = Math.min(1, spd / 1.5);
    if (k.ride === 'scooter') { p.legL.rotation.x = 0; p.legR.rotation.x = -Math.max(0, Math.sin(k.phase * 0.7)) * 0.9 * go; }
    else { p.legL.rotation.x = -1.0 + Math.sin(k.phase) * 0.5 * go; p.legR.rotation.x = -1.0 - Math.sin(k.phase) * 0.5 * go; }
    p.armL.rotation.x = p.armR.rotation.x = -1.2; p.armL.rotation.z = -0.15; p.armR.rotation.z = 0.15;
  }
}
function updateKid(k, dt, K) {
  const O = k.parent, P = K.player;
  k.toldT = Math.max(0, k.toldT - dt);
  // grown-up gone (spawned away, or got on a bus): the kid goes with them
  if (!O || O.gone) { removeKid(k); return; }
  if (O.dead) { // knocked flat: the kid legs it to tell someone
    if (k.mode !== 'flee') { k.mode = 'flee'; k.fleeT = 0; leavePiece(k); K.sayAt(k, mpick(['I\'M TELLING!', 'MUUUUM! I\'M TELLING!', 'I\'M TELLING MY DAD!'])); K.kidTells(k, true); }
    k.fleeT += dt; if (k.fleeT > 7) { removeKid(k); return; }
    const ax = k.x - P.x, az = k.z - P.z, al = Math.hypot(ax, az) || 1;
    const spd = kidStep(k, k.x + ax / al * 3, k.z + az / al * 3, 5.5, dt); kidPose(k, spd, dt);
    k.p.armL.rotation.x = k.p.armR.rotation.x = -2.8;
    k.g.position.set(k.x, k.y, k.z); k.g.rotation.y = k.face; return;
  }
  // home with the curtains drawn, or round the back of a shop: out of sight with their grown-up
  k.g.visible = !O.inside || (O.act && O.act.kind !== 'home' && O.g.visible);
  if (O.inside && !O.g.visible) { leavePiece(k); k.x = O.x; k.z = O.z; k.y = O.y; k.trail.length = 0; k.g.position.set(k.x, k.y, k.z); return; }
  // breadcrumbs: the kid walks where the grown-up walked (so nobody cuts a corner through a wall)
  const last = k.trail[k.trail.length - 1] || { x: k.x, z: k.z };
  if (Math.hypot(O.x - last.x, O.z - last.z) > 0.6) k.trail.push({ x: O.x, z: O.z });
  if (k.trail.length > 40 || Math.hypot(O.x - k.x, O.z - k.z) > 22) { k.x = O.x - Math.sin(O.face) * 0.8; k.z = O.z - Math.cos(O.face) * 0.8; k.trail.length = 0; }
  k.y = lerp(k.y, O.y, Math.min(1, dt * 6));
  let spd = 0, tx = k.x, tz = k.z, posed = false;
  const scared = O.state === 'chase' || O.panicT > 0 || O.cowerT > 0;
  if (k.mode === 'school') { // off in through the school doors
    const legs = [schoolInfo.gate, schoolInfo.yard, schoolInfo.door], tgt = legs[k.schoolLeg]; // through the gates, across the yard, in the doors
    spd = kidStep(k, tgt.x, tgt.z, 3.2, dt);
    k.schoolT = (k.schoolT || 0) + dt;
    if (Math.hypot(tgt.x - k.x, tgt.z - k.z) < 0.5 || k.schoolT > 6) { k.schoolT = 0; if (k.schoolLeg < 2) k.schoolLeg++; else { KD_STATE.schoolIn++; removeKid(k); return; } }
    if (Math.random() < dt * 0.3) K.sayAt(k, mpick(['BYE MUM!', 'BYE DAD!', 'SEE YOU LATER!', 'I DON\'T WANT TO GO!']));
    kidPose(k, spd, dt); k.g.position.set(k.x, k.y, k.z); k.g.rotation.y = k.face; return;
  }
  if (k.mode === 'point') { // pointing right at you and shouting it to the street
    k.pointT -= dt; k.face += angDiff(k.face, Math.atan2(P.x - k.x, P.z - k.z)) * Math.min(1, dt * 8);
    kidPose(k, 0, dt); k.p.armR.rotation.x = -1.7 + Math.sin(K.time * 18) * 0.08; k.p.armL.rotation.x = -0.2; posed = true;
    if (k.pointT <= 0) k.mode = 'follow';
  } else if (O.act && O.act.playground && O.act.phase === 'do' && !scared && k.mode !== 'point') { // at the playground
    if (!k.piece && !joinPiece(k, O.act.playground)) k.piece = null;
    if (k.piece) { playOn(k, dt, K); posed = true; }
  } else if (k.piece) leavePiece(k);
  if (!posed) {
    // follow: along the breadcrumbs, then hold hands at their side
    while (k.trail.length && Math.hypot(k.trail[0].x - k.x, k.trail[0].z - k.z) < 0.45) k.trail.shift();
    const dO = Math.hypot(O.x - k.x, O.z - k.z);
    if (dO < 1.6 || !k.trail.length) {
      const fx = _kfx(O.face), fz = _kfz(O.face), sx = O.x + fz * 0.55 * k.side, sz = O.z - fx * 0.55 * k.side;
      if (!blockedAt(sx, sz)) { tx = sx; tz = sz; } else { tx = O.x - fx * 0.7; tz = O.z - fz * 0.7; }
      k.trail.length = 0;
    } else { tx = k.trail[0].x; tz = k.trail[0].z; }
    const bx = k.x, bz = k.z;
    spd = kidStep(k, tx, tz, scared ? 6 : 4.5, dt);
    // wedged on something: pop back onto the grown-up's path
    if (spd > 0.5 && Math.hypot(k.x - bx, k.z - bz) < spd * dt * 0.25) k.stuckT = (k.stuckT || 0) + dt; else k.stuckT = 0;
    if (k.stuckT > 1.2) { const q = k.trail.length ? k.trail[Math.max(0, k.trail.length - 3)] : { x: O.x - Math.sin(O.face) * 0.7, z: O.z - Math.cos(O.face) * 0.7 }; k.x = q.x; k.z = q.z; k.stuckT = 0; k.trail.length = 0; }
    // lost them altogether (the grown-up hopped a wall, or we slid along one): a kid always finds their way back
    k.lostT = dO > 9 ? (k.lostT || 0) + dt : 0;
    if (k.lostT > 2) { k.x = O.x - _kfx(O.face) * 0.7; k.z = O.z - _kfz(O.face) * 0.7; k.lostT = 0; k.stuckT = 0; k.trail.length = 0; }
    if (spd < 0.2 && dO < 1.4) k.face += angDiff(k.face, O.face) * Math.min(1, dt * 4);
    kidPose(k, spd, dt);
    if (dO < 1.0 && !O.pram) { k.p.armL.rotation.x = k.p.armR.rotation.x = 0; (k.side > 0 ? k.p.armR : k.p.armL).rotation.z = 0; (k.side > 0 ? k.p.armL : k.p.armR).rotation.x = -0.5; (k.side > 0 ? O.p.armR : O.p.armL).rotation.x = -0.35; } // holding hands
    if (scared) { k.p.armL.rotation.x = k.p.armR.rotation.x = -2.6; }
    if (k.hiT > 0) { k.hiT -= dt; k.p.armR.rotation.x = -2.9; }
  }
  // chatter
  k.lineT -= dt;
  if (k.lineT <= 0) { k.lineT = mr(9, 22); if (K.near(k.x, k.z, 25) && !scared) K.sayAt(k, mpick(k.piece ? KID_PLAY : KID_CHAT)); }
  // those sharp little eyes
  k.seeT -= dt;
  if (k.seeT <= 0) { k.seeT = 0.25; kidLook(k, 0.25, K); }
  k.g.position.set(k.x, k.g.position.y && posed ? k.g.position.y : k.y, k.z); if (!posed) k.g.position.y = k.y;
  k.g.rotation.y = k.face;
}
// what a kid does on each bit of the playground
function playOn(k, dt, K) {
  const P = k.piece, p = k.p; k.playT += dt;
  if (P.kind === 'swing') {
    if (P.kid === k) { P.ang = Math.sin(K.time * 2.1 + P.x) * 0.75; P.piv.rotation.x = P.ang; }
    const a = P.ang, sy = SWING_TOP - Math.cos(a) * SWING_LEN, sz = P.z + Math.sin(a) * SWING_LEN;
    k.x = P.x; k.z = sz; k.face = 0; k.g.position.set(k.x, sy - 0.48 * k.s, k.z); k.g.rotation.x = a * 0.6;
    p.legL.rotation.x = p.legR.rotation.x = -1.4 + a * 0.6; p.armL.rotation.x = p.armR.rotation.x = -2.6;
  } else if (P.kind === 'slide') {
    const t = (k.playT + (P.kid2 === k ? 3 : 0)) % 6;
    if (t < 1.6) { k.x = P.ladder.x; k.z = P.ladder.z; k.face = Math.PI / 2; k.g.position.set(k.x, 0.15 + (t / 1.6) * P.top.y, k.z); p.legL.rotation.x = Math.sin(t * 9) * 0.6; p.legR.rotation.x = -p.legL.rotation.x; p.armL.rotation.x = p.armR.rotation.x = -2.5; }
    else if (t < 2.0) { k.x = P.top.x; k.z = P.top.z; k.face = Math.PI / 2; k.g.position.set(k.x, P.top.y, k.z); p.legL.rotation.x = p.legR.rotation.x = 0; p.armL.rotation.x = p.armR.rotation.x = -3; }
    else if (t < 3.0) { const u = t - 2.0; k.x = lerp(P.top.x, P.bottom.x, u); k.z = P.top.z; k.face = Math.PI / 2; k.g.position.set(k.x, lerp(P.top.y, P.bottom.y, u) - 0.3 * k.s, k.z); p.legL.rotation.x = p.legR.rotation.x = -1.5; p.armL.rotation.x = p.armR.rotation.x = -2.9; if (u < dt * 1.5 && K.near(k.x, k.z, 25) && Math.random() < 0.5) K.sayAt(k, 'WHEEEE!'); }
    else { const u = (t - 3) / 3, tx = P.ladder.x, tz = P.ladder.z + (u < 0.5 ? 1.2 : 0); const spd = kidStep(k, u < 0.5 ? P.bottom.x - 1 : tx, u < 0.5 ? P.z + 1.2 : tz, 3.5, dt); kidPose(k, spd, dt); k.g.position.set(k.x, 0.15, k.z); }
    k.g.rotation.x = 0;
  } else if (P.kind === 'round') {
    const i = P.kids.indexOf(k), a = P.spin + i * (Math.PI * 2 / 3);
    if (i === 0) { P.spin += dt * 1.6; P.g.rotation.y = -P.spin; }
    k.x = P.x + Math.cos(a) * 0.85; k.z = P.z - Math.sin(a) * 0.85; k.face = Math.atan2(-Math.sin(a), -Math.cos(a)) + Math.PI / 2;
    k.g.position.set(k.x, 0.5, k.z); p.legL.rotation.x = p.legR.rotation.x = -1.3; p.armL.rotation.x = p.armR.rotation.x = -1.6;
  } else if (P.kind === 'seesaw') {
    const i = P.kids.indexOf(k), other = P.kids[1 - i], tilt = other ? Math.sin(K.time * 2.2 + P.x) * 0.3 : (i === 0 ? 0.3 : -0.3);
    P.g.rotation.z = tilt; const e = i === 0 ? -1.35 : 1.35;
    k.x = P.x + e; k.z = P.z; k.face = i === 0 ? Math.PI / 2 : -Math.PI / 2;
    k.g.position.set(k.x, 0.6 - e * Math.sin(tilt) - 0.45 * k.s, k.z); p.legL.rotation.x = p.legR.rotation.x = -1.4; p.armL.rotation.x = p.armR.rotation.x = -1.2;
  } else { // sandpit: sit and dig
    k.x = P.x + Math.cos(k.sandA) * 0.7; k.z = P.z + Math.sin(k.sandA) * 0.5; k.face = Math.atan2(P.x - k.x, P.z - k.z);
    k.g.position.set(k.x, 0.05, k.z); p.legL.rotation.x = p.legR.rotation.x = -1.45; p.armL.rotation.x = -1.0 + Math.sin(K.time * 6 + k.phase) * 0.4; p.armR.rotation.x = -1.0 - Math.sin(K.time * 6 + k.phase) * 0.4;
  }
  k.g.rotation.y = k.face;
}
// a kid has a good long stare at you; if it's you, they'll say so
function kidLook(k, dt, K) {
  const P = K.player, O = k.parent;
  if (k.mode === 'point' || k.mode === 'school' || !k.g.visible) return;
  const d = Math.hypot(P.x - k.x, P.z - k.z);
  if (d > 18 || P.hide || P.car) { k.starT = Math.max(0, k.starT - dt * 0.5); return; }
  if (K.distracted && K.distracted(k)) { k.starT = Math.max(0, k.starT - dt); return; } // the ice cream van's here
  if (!K.canSee(k.x, k.y + 0.95 * k.s * 1.7, k.z)) { k.starT = Math.max(0, k.starT - dt * 0.5); return; }
  if (K.superMode) { if (d < 8 && k.toldT <= 0) { k.toldT = 12; K.sayAt(k, mpick(KID_HERO)); k.hiT = 1.5; } return; }
  if (k.hushDay === K.G.day) { if (d < 6 && k.toldT <= 0) { k.toldT = 15; k.hiT = 1.2; K.sayAt(k, mpick(['HELLO!', '*WAVES*', 'I\'M NOT TELLING!', 'SHHHH!'])); } return; }
  if (k.toldN >= 2 || k.toldT > 0) return;
  const before = k.starT;
  k.starT += dt * K.kidEye() * (d < 7 ? 1.6 : 1) * (O && O.act && O.act.playground ? 0.6 : 1);
  if (before < 0.8 && k.starT >= 0.8 && K.near(k.x, k.z, 30)) { K.sayAt(k, mpick(KID_TUG)); k.face = Math.atan2(P.x - k.x, P.z - k.z); }
  if (k.starT >= 1.7) {
    k.starT = 0; k.toldN++; k.toldT = 30; k.mode = 'point'; k.pointT = 2.4; leavePiece(k);
    K.sayAt(k, mpick(KID_TELL)); KD_STATE.told++; KD_STATE.lastTold = { x: k.x, z: k.z, t: K.time };
    K.kidTells(k, false);
  }
}
// the grown-up heard. Everyone heard.
export function grownupHears(k, K) { const O = k.parent; if (O && !O.dead && O.state !== 'chase') K.sayAt(O, mpick(GROWNUP_HEARD)); }

// =====================================================================
// Prams
// =====================================================================
const PRAM_COLS = [0x2a3a6a, 0x3a3a3e, 0x6a2a3a, 0x2a5a4a, 0xc0a0b0, 0x8a8a92];
function pramMesh(col, baby) {
  const g = new THREE.Group(), m = (geo, c, x, y, z) => { const o = new THREE.Mesh(geo, lam(c)); o.position.set(x, y, z); g.add(o); return o; };
  m(new THREE.BoxGeometry(0.52, 0.36, 0.78), col, 0, 0.62, 0); // the carry-cot
  m(new THREE.BoxGeometry(0.54, 0.34, 0.3), col, 0, 0.92, -0.26).rotation.x = 0.35; // hood, at the handle end
  for (const [x, z] of [[-0.24, 0.3], [0.24, 0.3], [-0.24, -0.3], [0.24, -0.3]]) m(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10).rotateZ(Math.PI / 2), 0x1a1a1e, x, 0.13, z);
  m(new THREE.BoxGeometry(0.03, 0.5, 0.03), 0x9a9aa2, -0.2, 0.68, -0.48).rotation.x = -0.5; m(new THREE.BoxGeometry(0.03, 0.5, 0.03), 0x9a9aa2, 0.2, 0.68, -0.48).rotation.x = -0.5;
  m(new THREE.BoxGeometry(0.46, 0.04, 0.04), 0x1a1a1e, 0, 0.9, -0.62); // handle
  m(new THREE.BoxGeometry(0.46, 0.04, 0.6), 0x8a8a92, 0, 0.32, 0); // chassis
  let head = null;
  if (baby) head = m(new THREE.SphereGeometry(0.11, 8, 6), 0xf1c9a5, 0, 0.84, -0.1);
  else m(new THREE.BoxGeometry(0.3, 0.16, 0.3), mpick([0xf0f0f0, 0xe8c040, 0x3a8a4a]), 0, 0.84, 0.1); // shopping
  scene.add(g); return { g, head };
}
export function givePram(h) {
  const M = pramMesh(mpick(PRAM_COLS), Math.random() < 0.8);
  const P = { g: M.g, head: M.head, x: h.x, z: h.z, face: h.face, owner: h, mode: 'push', baby: !!M.head, cryT: mr(10, 40), parkT: 0 };
  prams.push(P); h.pram = P; KD_STATE.families++;
  return P;
}
export function parkPramAt(x, z, face) { // an empty pram outside a shop: someone's popped in
  const M = pramMesh(mpick(PRAM_COLS), false);
  const P = { g: M.g, head: null, x, z, face, owner: null, mode: 'parked', baby: false, cryT: 99, parkT: 0 };
  prams.push(P); return P;
}
function removePram(P) { scene.remove(P.g); const i = prams.indexOf(P); if (i >= 0) prams.splice(i, 1); if (P.owner && P.owner.pram === P) P.owner.pram = null; if (KD_STATE.held === P) KD_STATE.held = null; }
function updatePram(P, dt, K) {
  const O = P.owner, pl = K.player;
  if (P.mode === 'player') {
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    P.x = pl.x + fx * 0.95; P.z = pl.z + fz * 0.95; P.face = Math.atan2(fx, fz);
    KD_STATE.pramT += dt;
    // the owner spots you with their pram
    if (O && !O.dead && !O.gone && O.lostPram && O.state !== 'chase' && O.hasLOS && Math.hypot(O.x - pl.x, O.z - pl.z) < 22) { K.sayAt(O, mpick(['THAT\'S MY PRAM!', 'OI! MY PRAM!', 'GIVE THAT BACK!'])); O.alert(0.3); O.lostPram = false; K.addHeat(3); }
  } else if (O && (O.gone || O.dead)) { P.owner = null; if (O.pram === P) O.pram = null; P.mode = 'parked'; }
  else if (O && P.mode === 'push') {
    const A = O.act;
    if (A && A.route && (A.ri > 0 || A.phase === 'do' || O.inside)) { // popping in somewhere: leave the pram outside the door
      P.mode = 'parked'; const [px, pz] = A.route[0]; P.x = px; P.z = pz; P.face = O.face;
    } else {
      const fx = Math.sin(O.face), fz = Math.cos(O.face);
      P.x = O.x + fx * 0.85; P.z = O.z + fz * 0.85; P.face = O.face;
      O.p.armL.rotation.x = O.p.armR.rotation.x = -1.15; O.p.armL.rotation.z = O.p.armR.rotation.z = 0;
    }
  } else if (O && P.mode === 'parked') { // back out: pick it up again
    if (!O.act && !O.inside && Math.hypot(O.x - P.x, O.z - P.z) < 4) P.mode = 'push';
    else if (!O.act && !O.inside && Math.hypot(O.x - P.x, O.z - P.z) > 40 && !K.near(P.x, P.z, 60)) P.mode = 'push';
  } else if (O && P.mode === 'gone') { /* taken */ }
  P.g.position.set(P.x, K.floorY ? K.floorY(P.x, P.z, pl.y) : 0.15, P.z); P.g.rotation.y = P.face;
  if (P.head) { P.cryT -= dt; if (P.cryT <= 0) { P.cryT = mr(15, 50); if (K.near(P.x, P.z, 20)) K.sayAtPos(P.x, 1.2, P.z, mpick(['WAAAH!', 'GOO GOO', 'WAAAAAAH!', 'BLEURGH'])); } P.head.position.y = 0.84 + Math.sin(K.time * 3) * 0.01; }
}
// the owner comes out and their pram's gone
function checkLostPram(K) {
  const P = KD_STATE.held; if (!P || !P.owner) return;
  const O = P.owner;
  if (!O.lostPram && !O.act && !O.inside && !O.dead && O.state !== 'chase' && Math.hypot(O.x - (P.parkX ?? O.x), O.z - (P.parkZ ?? O.z)) < 5) {
    O.lostPram = true; O.huntT = Math.max(O.huntT, 15); K.sayAt(O, mpick(['MY PRAM! WHERE\'S MY PRAM?!', 'WHO\'S TAKEN MY PRAM?!', 'I WAS ONLY IN THERE TWO MINUTES!']));
  }
}
export const pramHeld = () => KD_STATE.held || null;
export function grabPram(P, K) {
  if (P.mode === 'push') return false;
  P.parkX = P.x; P.parkZ = P.z; P.mode = 'player'; KD_STATE.held = P; KD_STATE.pramPushes++;
  K.showMsg(P.baby ? 'THERE\'S A BABY IN IT. IT SEEMS FINE WITH THIS' : mpick(['JUST A BAG OF SHOPPING IN IT. YOU LOOK LIKE A TIRED PARENT', 'PUSHING A PRAM. NOBODY LOOKS TWICE AT A TIRED PARENT']), 2.6);
  return true;
}
export function dropPram(K, why) {
  const P = KD_STATE.held; if (!P) return;
  P.mode = 'parked'; KD_STATE.held = null;
  if (P.owner && !P.owner.dead) { /* stays where you left it: the owner can come and find it */ }
  if (why) K.showMsg(why, 1.8);
}
export function pramNear(x, z, r = 1.6) {
  let best = null, bd = r;
  for (const P of prams) { if (P.mode !== 'parked') continue; const d = Math.hypot(P.x - x, P.z - z); if (d < bd) { bd = d; best = P; } }
  return best;
}
export function kidNear(x, z, r = 1.8) {
  let best = null, bd = r;
  for (const k of kids) { if (!k.g.visible || k.mode === 'school' || k.mode === 'flee') continue; const d = Math.hypot(k.x - x, k.z - z); if (d < bd) { bd = d; best = k; } }
  return best;
}
// E next to a kid: a sweet if you have one, otherwise a high five
export function greetKid(k, K) {
  const day = K.G.day;
  if (K.superMode) { K.sayAt(k, mpick(KID_HERO)); k.hiT = 1.4; return 'YOU SIGN A NAPKIN. THEY WILL TREASURE IT FOREVER'; }
  if (MK_STATE.sweets > 0 && k.hushDay !== day) {
    MK_STATE.sweets--; k.hushDay = day; k.starT = 0; KD_STATE.hushed++; k.hiT = 1.2;
    K.sayAt(k, mpick(KID_THANKS)); if (k.parent && !k.parent.dead) setTimeout(() => K.sayAt(k.parent, mpick(GROWNUP_SHUSH)), 900);
    return `GAVE THEM A SWEET. THEY'LL KEEP QUIET TODAY (${MK_STATE.sweets} LEFT)`;
  }
  if (k.hushDay === day) { k.hiT = 1.2; K.sayAt(k, mpick(['SHHHH!', 'I\'M NOT TELLING!', 'HELLO AGAIN!'])); return 'THEY GIVE YOU A VERY SERIOUS NOD'; }
  KD_STATE.highFives++; k.hiT = 1.0;
  if (Math.random() < 0.6) { k.starT = Math.max(0, k.starT - 1); K.sayAt(k, mpick(['UP TOP!', 'YESSS!', 'TOO SLOW!', 'AGAIN!'])); return 'HIGH FIVE. THEY THINK YOU\'RE GREAT'; }
  k.starT += 0.8; K.sayAt(k, mpick(['WAIT... I KNOW YOU...', 'YOUR FACE IS FUNNY', 'ARE YOU FAMOUS?'])); return 'THEY LOOK AT YOU VERY HARD. UH OH';
}

// =====================================================================
// The school run
// =====================================================================
let kdSchoolT = 0;
export function sendToSchool(h, K) { // a grown-up with a kid walks to the gates and waves them in
  if (!schoolInfo.gate || !h.kid) return false;
  const G0 = schoolInfo.gate, a = mr(-2.4, 2.4);
  return K.lifeGo(h, 'wave', G0.x + a, G0.z - mr(0, 1.2), Math.atan2(schoolInfo.door.x - G0.x, schoolInfo.door.z - G0.z), mr(6, 11), { schoolRun: true, maxGo: 120 });
}
function updateSchool(dt, K) {
  if (!schoolInfo.gate) return;
  // drop-off: the kid lets go at the gates and runs in
  for (const k of kids) {
    const O = k.parent;
    if (k.mode === 'follow' && O && O.act && O.act.schoolRun && O.act.phase === 'do' && O.act.t > 1.2) { k.mode = 'school'; k.schoolLeg = 0; k.trail.length = 0; }
  }
  // home time: parents gather at the gates and the kids come pouring out
  kdSchoolT -= dt; if (kdSchoolT > 0) return; kdSchoolT = 2.5;
  const hr = K.hour, G0 = schoolInfo.gate;
  if (!K.schoolDay() || hr < 14.9 || hr > 15.8 || !K.near(G0.x, G0.z, 170)) return;
  const waiting = K.hunters().filter((h) => !h.dead && h.act && h.act.pickUp);
  if (waiting.length < 7 && hr < 15.5) {
    const h = K.spawnCivAt(G0.x + mr(-6, 6), G0.z - mr(2, 8), 'parent');
    if (h) { h.home = { x: h.x + mr(-80, 80), z: h.z + mr(-120, -40) }; K.lifeGo(h, 'wait', G0.x + mr(-3.5, 3.5), G0.z - mr(0.2, 2.2), Math.atan2(schoolInfo.door.x - G0.x, schoolInfo.door.z - G0.z) + mr(-0.6, 0.6), mr(40, 120), { pickUp: true }); }
  }
  // out they come: each kid finds their grown-up
  if (hr >= 15.05) for (const h of waiting) {
    if (h.kid || Math.random() > 0.35 || kids.length >= 18) continue;
    const k = makeKid(h, K); const D = schoolInfo.door; k.x = D.x + mr(-0.6, 0.6); k.z = D.z; k.trail = [{ x: schoolInfo.yard.x, z: schoolInfo.yard.z }, { x: h.x, z: h.z }];
    KD_STATE.schoolOut++; K.sayAt(k, mpick(['MUUUM!', 'DAD! DAD! I MADE A THING!', 'I GOT A GOLD STAR!', 'WHAT\'S FOR TEA?', 'I\'M STARVING!']));
    h.act.dur = Math.min(h.act.dur, h.act.t + mr(2, 5));
    break;
  }
}
// grown-ups with kids drift to the playground in the daytime
export function sendToPlayground(h, K) {
  if (!h.kid) return false;
  let best = null, bd = 160;
  for (const PG of playgrounds) { const d = Math.abs(PG.x - h.x) + Math.abs(PG.z - h.z); if (d < bd) { bd = d; best = PG; } }
  if (!best) return false;
  const s = best.benches.find((b) => !b.taken);
  if (s) { s.taken = h; return K.lifeGo(h, 'sit', s.x, s.z, s.face, mr(40, 100), { spot: s, playground: best, maxGo: 120 }); }
  return K.lifeGo(h, 'watch', best.x + mr(-6, 6), best.z + (Math.random() < 0.5 ? -6 : 6), Math.atan2(0, (best.z > h.z ? 1 : -1)), mr(30, 70), { playground: best, maxGo: 120 });
}

// =====================================================================
// Each frame
// =====================================================================
export function updateKids(dt, K) {
  for (let i = kids.length - 1; i >= 0; i--) { const k = kids[i]; if (Math.hypot(k.x - K.player.x, k.z - K.player.z) > 260 && k.mode !== 'school') { removeKid(k); continue; } updateKid(k, dt, K); }
  for (let i = prams.length - 1; i >= 0; i--) { const P = prams[i]; if (P.mode !== 'player' && !P.owner && Math.hypot(P.x - K.player.x, P.z - K.player.z) > 240 && !P.fixed) { removePram(P); continue; } updatePram(P, dt, K); }
  checkLostPram(K);
  // you can't push a pram up a ladder, into a car or into a bin
  const pl = K.player;
  if (KD_STATE.held && (pl.car || pl.hide || pl.mode !== 'move' || pl.y > 1.4 || pl.bike || K.G.super)) dropPram(K, 'YOU LET GO OF THE PRAM');
  updateSchool(dt, K);
  // swings slow down when nobody's on them
  for (const PG of playgrounds) for (const P of PG.pieces) if (P.kind === 'swing' && !P.kid && Math.abs(P.ang) > 0.001) { P.ang *= Math.max(0, 1 - dt * 0.8); P.piv.rotation.x = P.ang; }
}
export function kidsConspic(K) {
  if (!KD_STATE.held) return 0;
  return K.player.sprinting ? 0 : -0.22; // just another tired parent
}
export function resetKids(K) {
  for (const k of [...kids]) removeKid(k);
  for (const P of [...prams]) removePram(P);
  KD_STATE.told = 0; KD_STATE.hushed = 0; KD_STATE.highFives = 0; KD_STATE.pramPushes = 0; KD_STATE.pramT = 0; KD_STATE.played = 0; KD_STATE.schoolIn = 0; KD_STATE.schoolOut = 0; KD_STATE.families = 0; KD_STATE.held = null; KD_STATE.lastTold = null;
  MK_STATE.sweets = 0;
  // a few empty prams parked outside cafes and shops
  const doors = walkIns.filter((W) => ['cafe', 'mart', 'pharmacy', 'florist', 'clothes'].includes(W.kind) && (W.city === 'PORT HALDEN' || W.city === 'ASHFORD'));
  for (let n = 0, t = 0; n < 8 && t < 40 && doors.length; t++) {
    const W = doors[Math.floor(kdHash(t, n, 3) * doors.length)];
    const [x0, z0] = W.path[0], [x1, z1] = W.path[1], ux = x0 - x1, uz = z0 - z1, l = Math.hypot(ux, uz) || 1;
    const x = x0 + (uz / l) * 1.3, z = z0 - (ux / l) * 1.3;
    if (blockedAt(x, z) || prams.some((P) => Math.hypot(P.x - x, P.z - z) < 3)) continue;
    const P = parkPramAt(x, z, Math.atan2(ux, uz)); P.fixed = true; n++;
  }
}
export const kidsDebug = () => ({ kids: kids.length, prams: prams.length, held: !!KD_STATE.held, playgrounds: playgrounds.map((P) => ({ city: P.city, x: P.x, z: P.z })), school: { door: schoolInfo.door, gate: schoolInfo.gate }, ...KD_STATE });
