// Markets, garden sheds and portaloos.
//  - Every town has a market: Halden Commons in PORT HALDEN, a village market round the water tower in
//    ASHFORD, and a fish market at SALTMARSH DOCKS. Striped stalls sell food (patches you up), hats and
//    scarves (cheap, quick disguises), bric-a-brac (bottles, bangers and wind-up alarm clocks to throw as
//    lures, an old town map that marks hiding places), flowers (nobody suspects someone carrying flowers)
//    and dodgy gadgets (a burner phone for a fake tip-off). Markets open 7 till 6, traders come and man the
//    stalls, and the crowd is easy to blend into. A stall with nobody minding it runs on an honesty box,
//    and you can always just help yourself (if nobody's looking).
//  - Duck under a stall's tablecloth from the trader's side to hide. Portaloos stand at the edge of each
//    market: people who open the door on you mostly apologise and shut it again.
//  - The sheds in the suburban back gardens are hiding places too, and the first rummage of the day in
//    each one turns something up.
import { mr, mpick } from './core.js';
import { colliders, addCollider, propBuf, glowBuf, worldHooks, keepClear, blockRects, CITIES, SW, groundHoles, gardenSheds } from './world.js';
import { lifeSpots, hideSpots } from './streets.js';
import { CATALOG } from './shops.js';

export const MK_STATE = { bought: 0, nicked: 0, spent: 0, tips: 0, flowersT: 0, mapDay: 0, shedFinds: 0, lastStall: null, sweets: 0 };
export const markets = []; // {city, name, x, z, x0, x1, z0, z1, stalls, loos}
export const marketStalls = []; // {kind, name, x, z, alongX, flip, front, back, market, spot, hide}
const mkHash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 53.117) * 43758.5453; return s - Math.floor(s); };
const mkOverlap = (c, x0, x1, z0, z1) => c.x1 > x0 && c.x0 < x1 && c.z1 > z0 && c.z0 < z1;
const mkClear = (list, x0, x1, z0, z1) => !list.some((c) => (c.h || 0) > 0.28 && (c.y0 || 0) < 2.6 && mkOverlap(c, x0, x1, z0, z1))
  && !keepClear.some((k) => mkOverlap(k, x0, x1, z0, z1)) && !groundHoles.some((k) => mkOverlap(k, x0 - 1, x1 + 1, z0 - 1, z1 + 1));

// =====================================================================
// What the stalls sell
// =====================================================================
export const STALL_KINDS = {
  fruit: { name: 'FRUIT & VEG', cloth: 0x3a8a3a, canopy: [0x3a8a3a, 0xf0f0e8], lines: ['LOVELY APPLES!', 'POUND A BOWL!', 'BANANAS! GET YOUR BANANAS!', 'FRESH THIS MORNING!', 'COME ON, LADIES AND GENTS!'] },
  bakery: { name: 'BAKERY', cloth: 0xc89a5a, canopy: [0xc8302a, 0xf0e8d0], lines: ['HOT SAUSAGE ROLLS!', 'STILL WARM!', 'DOUGHNUTS, FIVE FOR A FIVER!', 'BEST BREAD IN TOWN!'] },
  hats: { name: 'HATS & SCARVES', cloth: 0x6a3a8a, canopy: [0x6a3a8a, 0xf0d040], lines: ['KEEP YOUR HEAD WARM!', 'ONE SIZE FITS MOST!', 'TRY IT ON, LOVE!', 'SUNGLASSES, ANY STYLE!'] },
  junk: { name: 'BRIC-A-BRAC', cloth: 0x8a5a2a, canopy: [0x2a5a8a, 0xe8e0d0], lines: ['EVERYTHING MUST GO!', 'ONE MAN\'S RUBBISH!', 'IT\'S VINTAGE, THAT!', 'NO REFUNDS!'] },
  flowers: { name: 'FLOWERS', cloth: 0xe07aa0, canopy: [0xe07aa0, 0xf0f0f0], lines: ['FRESH FLOWERS!', 'SAY IT WITH FLOWERS!', 'TULIPS! ROSES!', 'TREAT SOMEONE SPECIAL!'] },
  gadgets: { name: 'PHONES & GADGETS', cloth: 0x2a2a30, canopy: [0x2a2a30, 0x3ab0e0], lines: ['PHONES UNLOCKED!', 'CHARGERS, CABLES, CASES!', 'DON\'T ASK WHERE IT\'S FROM!', 'BURNERS! I MEAN... PHONES!'] },
  fish: { name: 'FISH', cloth: 0x2a6a9a, canopy: [0x2a6a9a, 0xf0f0f0], lines: ['FRESH OFF THE BOAT!', 'COCKLES AND WHELKS!', 'CHIPS! HOT CHIPS!', 'SMELL THAT SEA AIR!'] },
};
// costume bits sold at the hat stall (worn through the same disguise system as the costume shops)
const MK_COSTUME = [
  { id: 'mk_bobble', slot: 'head', cat: 'market', name: 'BOBBLE HAT', price: 12, dg: 0.18, desc: 'Woolly, warm, faintly ridiculous. Covers your hair and half your forehead.' },
  { id: 'mk_flatcap', slot: 'head', cat: 'market', name: 'FLAT CAP', price: 10, dg: 0.15, desc: 'Instantly makes you look like you have opinions about pigeons.' },
  { id: 'mk_sunhat', slot: 'head', cat: 'market', name: 'FLOPPY SUN HAT', price: 14, dg: 0.2, desc: 'A brim so wide it has its own weather.' },
  { id: 'mk_scarf', slot: 'face', cat: 'market', name: 'CHUNKY SCARF', price: 12, dg: 0.18, desc: 'Wrap it up to the nose. Very mysterious. Very itchy.' },
  { id: 'mk_shades', slot: 'eyes', cat: 'market', name: 'KNOCK-OFF SUNGLASSES', price: 6, dg: 0.15, desc: 'The logo is spelled wrong. Works fine.' },
  { id: 'mk_poncho', slot: 'body', cat: 'market', name: 'RAIN PONCHO', price: 8, dg: 0.22, desc: 'Bright plastic, hood up. You look like every other tourist.' },
];
for (const c of MK_COSTUME) if (!CATALOG.costume.some((o) => o.id === c.id)) CATALOG.costume.push(c);
const STALL_GOODS = {
  fruit: [
    { id: 'mk_apples', name: 'BAG OF APPLES', price: 3, heal: 12, desc: 'Crunchy. Patches you up a bit (+12).' },
    { id: 'mk_bananas', name: 'BUNCH OF BANANAS', price: 4, heal: 16, desc: 'Potassium for the long run (+16).' },
    { id: 'mk_melon', name: 'A WHOLE WATERMELON', price: 9, heal: 35, desc: 'You eat the whole thing, standing up. Nobody judges (+35).' },
  ],
  bakery: [
    { id: 'mk_roll', name: 'SAUSAGE ROLL', price: 4, heal: 20, desc: 'Flaky pastry everywhere (+20).' },
    { id: 'mk_donut', name: 'JAM DOUGHNUT', price: 3, heal: 10, desc: 'Sugar. Jam on your chin (+10).' },
    { id: 'mk_tea', name: 'FLASK OF TEA', price: 5, heal: 15, desc: 'Hot, strong and sweet. Steadies the nerves (+15, lowers heat a little).' },
    { id: 'mk_sweets', name: 'BAG OF PICK AND MIX', price: 3, sweets: 6, desc: 'Six sweets. Give one to a kid (E) who\'s staring at you and they\'ll keep your secret for the rest of the day.' },
  ],
  fish: [
    { id: 'mk_chips', name: 'CHIPS IN PAPER', price: 5, heal: 25, desc: 'Salt, vinegar, scalding (+25).' },
    { id: 'mk_whelks', name: 'POT OF WHELKS', price: 2, heal: 8, desc: 'An acquired taste (+8).' },
    { id: 'mk_crab', name: 'DRESSED CRAB', price: 7, heal: 28, desc: 'Fancy. With a little fork (+28).' },
  ],
  hats: MK_COSTUME.filter((c) => c.id !== 'mk_poncho'),
  junk: [
    { id: 'mk_empties', name: 'CRATE OF EMPTIES', price: 3, junk: ['bottle', 'bottle', 'bottle'], desc: 'Three empty bottles. Throw them round a corner (T) to send people looking.' },
    { id: 'mk_bangers', name: 'STRING OF BANGERS', price: 8, junk: ['banger', 'banger'], desc: 'Two. Throw one and it fizzes, then goes BANG BANG BANG. Everyone in earshot comes running to it.' },
    { id: 'mk_clock', name: 'WIND-UP ALARM CLOCK', price: 10, junk: ['clock'], desc: 'Throw it somewhere. A few seconds later it rings, and keeps ringing, and people go to shut it up.' },
    { id: 'mk_map', name: 'OLD TOWN MAP (WITH NOTES)', price: 6, map: true, desc: 'Someone has scribbled every good hiding place on it. Marks them on your map for the rest of the day.' },
  ],
  flowers: [
    { id: 'mk_bouquet', name: 'BIG BUNCH OF FLOWERS', price: 8, flowers: 150, desc: 'Carry them for a couple of minutes. Nobody suspects someone with flowers. Nobody.' },
    { id: 'mk_fern', name: 'POTTED FERN', price: 5, flowers: 80, desc: 'Hold it in front of your face. Surprisingly effective for a minute or so.' },
  ],
  gadgets: [
    { id: 'mk_burner', name: 'BURNER PHONE TIP-OFF', price: 25, tip: true, desc: 'Ring in a fake sighting on the other side of town. Searchers head off there and the heat drops.' },
    { id: 'mk_poncho', name: 'RAIN PONCHO', price: 8, costume: true, desc: MK_COSTUME.find((c) => c.id === 'mk_poncho').desc },
    { id: 'mk_shades2', name: 'KNOCK-OFF SUNGLASSES', price: 6, costume: 'mk_shades', desc: MK_COSTUME.find((c) => c.id === 'mk_shades').desc },
  ],
};
const TOWN_MARKETS = {
  'PORT HALDEN': { name: 'HALDEN COMMONS MARKET', kinds: ['fruit', 'bakery', 'hats', 'junk', 'flowers', 'gadgets', 'fruit', 'hats', 'bakery', 'junk'], prefer: (c) => [c.n / 2 - 1, c.n / 2 - 1] },
  'ASHFORD': { name: 'ASHFORD VILLAGE MARKET', kinds: ['fruit', 'flowers', 'bakery', 'junk', 'hats', 'junk', 'fruit', 'flowers'], prefer: (c) => [c.n - 2, 1] },
  'SALTMARSH DOCKS': { name: 'SALTMARSH FISH MARKET', kinds: ['fish', 'fish', 'bakery', 'junk', 'gadgets', 'hats', 'fish', 'junk'], prefer: null },
};

// =====================================================================
// Building
// =====================================================================
// a box given in a stall's own frame: a along the counter, b out towards the customers
function stallFrame(st) {
  const { x, z, alongX } = st, s = st.flip ? -1 : 1;
  return (a0, a1, y0, y1, b0, b1, col, buf = propBuf) => {
    if (alongX) buf.box(x + a0, x + a1, y0, y1, Math.min(z - s * b0, z - s * b1), Math.max(z - s * b0, z - s * b1), col);
    else buf.box(Math.min(x - s * b0, x - s * b1), Math.max(x - s * b0, x - s * b1), y0, y1, z + a0, z + a1, col);
  };
}
// where (a, b) in a stall's frame is in the world
function stallPt(st, a, b) { const s = st.flip ? -1 : 1; return st.alongX ? { x: st.x + a, z: st.z - s * b } : { x: st.x - s * b, z: st.z + a }; }
const GOODS_COLS = {
  fruit: [0xd83a2a, 0x7ac83a, 0xf0d040, 0xf08a2a, 0x9a3a8a, 0x3a8a2a], bakery: [0xc8904a, 0xa86a2a, 0xe8c080, 0xf0e0c0], hats: [0xc83a3a, 0x2a5aa0, 0xf0d040, 0x3a8a4a, 0x6a3a8a, 0xf0f0f0],
  junk: [0x8a6a4a, 0x5a5a62, 0xb8a070, 0x3a6a8a, 0xa03a2a, 0xd0c8b0], flowers: [0xe04a6a, 0xf0d040, 0xa04ae0, 0xf08ab0, 0xffffff, 0xff8a2a], gadgets: [0x1a1a1e, 0x2a2a30, 0x3a3a44, 0xd0d0d8], fish: [0xc0c8d0, 0x9aa8b8, 0xe08a6a, 0xb0b8c0],
};
function buildStall(st) {
  const B = stallFrame(st), K = STALL_KINDS[st.kind], H = mkHash(st.x, st.z, 1);
  // trestle table with a cloth hanging to the ground on the front and both ends (the back is open)
  B(-1.3, 1.3, 0.84, 0.9, -0.55, 0.55, 0x9a7a52);
  B(-1.3, 1.3, 0.2, 0.86, 0.53, 0.58, K.cloth); B(-1.33, -1.28, 0.2, 0.86, -0.55, 0.58, K.cloth); B(1.28, 1.33, 0.2, 0.86, -0.55, 0.58, K.cloth);
  // four poles and a striped canopy, the front valance and a name board
  for (const a of [-1.38, 1.38]) for (const b of [-0.8, 0.8]) B(a - 0.03, a + 0.03, 0.15, 2.5, b - 0.03, b + 0.03, 0xb8b8c0);
  for (let k = 0; k < 6; k++) { const a0 = -1.45 + k * (2.9 / 6); B(a0, a0 + 2.9 / 6, 2.48, 2.56, -0.95, 0.95, K.canopy[k % 2]); B(a0, a0 + 2.9 / 6, 2.26, 2.5, 0.93, 0.97, K.canopy[(k + 1) % 2]); }
  B(-0.9, 0.9, 2.56, 2.9, 0.88, 0.92, 0xf4f0e0); B(-0.8, 0.8, 2.62, 2.84, 0.92, 0.93, K.cloth, glowBuf);
  // the goods: trays and crates of whatever they sell
  const cols = GOODS_COLS[st.kind];
  for (let k = 0; k < 4; k++) {
    const a = -1.0 + k * 0.66, c = cols[Math.floor(mkHash(st.x, st.z, 10 + k) * cols.length)];
    if (st.kind === 'flowers') { B(a - 0.18, a + 0.18, 0.9, 1.15, -0.2, 0.2, 0x5a6a7a); for (let q = 0; q < 4; q++) B(a - 0.16 + (q % 2) * 0.18, a - 0.02 + (q % 2) * 0.18, 1.15, 1.45 + (q >> 1) * 0.08, -0.15 + (q >> 1) * 0.15, 0.0 + (q >> 1) * 0.15, q === 0 ? 0x3a8a3a : cols[(k + q) % cols.length]); continue; }
    if (st.kind === 'fish') { B(a - 0.3, a + 0.3, 0.9, 1.0, -0.35, 0.35, 0xe8f0f4); for (let q = 0; q < 3; q++) B(a - 0.22, a + 0.22, 1.0, 1.05, -0.25 + q * 0.2, -0.15 + q * 0.2, c); continue; }
    if (st.kind === 'gadgets') { B(a - 0.25, a + 0.25, 0.9, 0.95, -0.3, 0.3, 0x1a1a1e); for (let q = 0; q < 3; q++) { B(a - 0.2 + q * 0.14, a - 0.1 + q * 0.14, 0.95, 0.97, -0.1, 0.1, 0x2a2a30); B(a - 0.19 + q * 0.14, a - 0.11 + q * 0.14, 0.97, 0.975, -0.08, 0.08, 0x5ac8f0, glowBuf); } continue; }
    if (st.kind === 'hats') { for (let q = 0; q < 3; q++) B(a - 0.18, a + 0.18, 0.9 + q * 0.09, 0.98 + q * 0.09, -0.18 + q * 0.04, 0.18 - q * 0.04, cols[(k + q) % cols.length]); continue; }
    if (st.kind === 'junk') { const h = 0.15 + mkHash(st.x, st.z, 20 + k) * 0.35; B(a - 0.2, a + 0.2, 0.9, 0.9 + h, -0.2, 0.2, c); B(a - 0.06, a + 0.06, 0.9 + h, 1.0 + h, -0.06, 0.06, cols[(k + 2) % cols.length]); continue; }
    B(a - 0.28, a + 0.28, 0.9, 1.06, -0.38, 0.38, 0x8a6a40); // fruit and bread in crates
    for (let q = 0; q < 6; q++) B(a - 0.24 + (q % 3) * 0.16, a - 0.1 + (q % 3) * 0.16, 1.06, 1.16 + (st.kind === 'bakery' ? 0.04 : 0), -0.3 + (q / 3 | 0) * 0.3, -0.06 + (q / 3 | 0) * 0.3, cols[(k + q) % cols.length]);
  }
  // a crate or two behind for the trader to sit on
  if (H < 0.6) B(-0.9, -0.5, 0.15, 0.55, -1.05, -0.7, 0x8a6a40);
  const p0 = stallPt(st, -1.33, -0.58), p1 = stallPt(st, 1.33, 0.58);
  addCollider(Math.min(p0.x, p1.x), Math.max(p0.x, p1.x), Math.min(p0.z, p1.z), Math.max(p0.z, p1.z), 0.9, { y0: 0, stall: true });
  // under the table: you get in from the trader's side and peer out through the cloth
  const back = stallPt(st, 0, -1.15), eye = stallPt(st, 0, 0.3), out = stallPt(st, 0, -1), mid = stallPt(st, 0, 0);
  const ux = out.x - mid.x, uz = out.z - mid.z;
  st.hide = { kind: 'stall', x: st.x, z: st.z, lx: Math.abs(p1.x - p0.x) / 2, lz: Math.abs(p1.z - p0.z) / 2, top: 0.9, indoor: true, eye: { x: eye.x, y: 0.55, z: eye.z }, stand: { x: back.x, z: back.z, ux, uz }, stall: st };
  hideSpots.push(st.hide);
  st.front = stallPt(st, 0, 1.15); st.back = back;
  st.spot = { kind: 'cart', x: st.x, z: st.z, alongX: st.alongX, flip: st.flip, face: 0, sx: st.x, sz: st.z, stall: st, lines: K.lines };
  lifeSpots.push(st.spot);
}
function buildLoo(x, z, ux, uz) {
  propBuf.box(x - 0.6, x + 0.6, 0.15, 2.35, z - 0.6, z + 0.6, 0x2a6ac8); propBuf.box(x - 0.65, x + 0.65, 2.35, 2.45, z - 0.65, z + 0.65, 0xe8e8e8);
  const fx = x + ux * 0.61, fz = z + uz * 0.61;
  if (ux) propBuf.box(Math.min(fx, fx + ux * 0.02), Math.max(fx, fx + ux * 0.02), 0.25, 2.1, z - 0.4, z + 0.4, 0x1a4a9a); else propBuf.box(x - 0.4, x + 0.4, 0.25, 2.1, Math.min(fz, fz + uz * 0.02), Math.max(fz, fz + uz * 0.02), 0x1a4a9a);
  if (ux) glowBuf.box(Math.min(fx, fx + ux * 0.03), Math.max(fx, fx + ux * 0.03), 1.6, 1.7, z + 0.1, z + 0.3, 0x5aff6a); else glowBuf.box(x + 0.1, x + 0.3, 1.6, 1.7, Math.min(fz, fz + uz * 0.03), Math.max(fz, fz + uz * 0.03), 0x5aff6a);
  addCollider(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 2.45, { y0: 0 });
  const S = { kind: 'loo', x, z, lx: 0.6, lz: 0.6, top: 2.45, indoor: true, eye: { x: x + ux * 0.4, y: 1.6, z: z + uz * 0.4 }, stand: { x: x + ux * 1.15, z: z + uz * 1.15, ux, uz } };
  hideSpots.push(S);
  return S;
}
// find room for a market in a town: a block with space for a ring of stalls round an open middle
function placeMarket(city) {
  const T = TOWN_MARKETS[city.name]; if (!T) return;
  const blocks = blockRects.filter((b) => b.city === city);
  const pref = T.prefer ? T.prefer(city) : null;
  const scored = [];
  for (const r of blocks) {
    const ix0 = r.x0 + SW + 1, ix1 = r.x1 - SW - 1, iz0 = r.z0 + SW + 1, iz1 = r.z1 - SW - 1;
    const list = colliders.filter((c) => mkOverlap(c, ix0 - 2, ix1 + 2, iz0 - 2, iz1 + 2));
    const cands = [];
    const cx = (ix0 + ix1) / 2, cz = (iz0 + iz1) / 2;
    for (let x = ix0 + 1.8; x <= ix1 - 1.8; x += 1) for (let z = iz0 + 1.8; z <= iz1 - 1.8; z += 1) {
      // face the middle of the block, along whichever axis it's further off
      const alongX = Math.abs(z - cz) >= Math.abs(x - cx);
      const flip = alongX ? z < cz : x < cx; // flip: customers on the +z / +x side
      const st = { x, z, alongX, flip };
      const p0 = stallPt(st, -1.5, -1.6), p1 = stallPt(st, 1.5, 1.8);
      const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x), z0 = Math.min(p0.z, p1.z), z1 = Math.max(p0.z, p1.z);
      if (x0 < ix0 || x1 > ix1 || z0 < iz0 || z1 > iz1) continue;
      if (Math.hypot(x - cx, z - cz) < 5) continue; // keep the middle open
      if (!mkClear(list, x0, x1, z0, z1)) continue;
      cands.push({ ...st, rect: { x0, x1, z0, z1 }, d: Math.hypot(x - cx, z - cz) });
    }
    if (cands.length < 6) continue;
    const isPref = pref && r.i === pref[0] && r.j === pref[1];
    scored.push({ r, cands, list, cx, cz, score: cands.length + (isPref ? 1e4 : 0) - Math.hypot(cx - city.cx, cz - city.cz) * 0.3 });
  }
  scored.sort((a, b) => b.score - a.score);
  for (const S of scored) {
    // greedy ring: nearest-in candidates first, never overlapping
    const chosen = [];
    const cands = S.cands.sort((a, b) => a.d - b.d || mkHash(a.x, a.z, 2) - mkHash(b.x, b.z, 2));
    for (const c of cands) {
      if (chosen.length >= T.kinds.length) break;
      if (chosen.some((o) => mkOverlap(o.rect, c.rect.x0 - 0.3, c.rect.x1 + 0.3, c.rect.z0 - 0.3, c.rect.z1 + 0.3))) continue;
      chosen.push(c);
    }
    if (chosen.length < 4) continue;
    const M = { city: city.name, name: T.name, x: S.cx, z: S.cz, stalls: [], loos: [] };
    chosen.forEach((c, i) => {
      const st = { kind: T.kinds[i], x: c.x, z: c.z, alongX: c.alongX, flip: c.flip, market: M };
      st.name = `${STALL_KINDS[st.kind].name} STALL`;
      buildStall(st); M.stalls.push(st); marketStalls.push(st);
    });
    M.x0 = Math.min(...M.stalls.map((s) => s.x)) - 4; M.x1 = Math.max(...M.stalls.map((s) => s.x)) + 4;
    M.z0 = Math.min(...M.stalls.map((s) => s.z)) - 4; M.z1 = Math.max(...M.stalls.map((s) => s.z)) + 4;
    // two portaloos tucked in a corner of the block
    const ix0 = S.r.x0 + SW + 1, ix1 = S.r.x1 - SW - 1, iz0 = S.r.z0 + SW + 1, iz1 = S.r.z1 - SW - 1;
    const list = colliders.filter((c) => mkOverlap(c, ix0 - 2, ix1 + 2, iz0 - 2, iz1 + 2));
    for (const [x, z, ux, uz] of [[ix0 + 1, iz0 + 1, 0, 1], [ix0 + 2.4, iz0 + 1, 0, 1], [ix1 - 1, iz1 - 1, 0, -1], [ix1 - 2.4, iz1 - 1, 0, -1], [ix1 - 1, iz0 + 1, 0, 1], [ix0 + 1, iz1 - 1, 0, -1]]) {
      if (M.loos.length >= 2) break;
      if (!mkClear(list, x - 0.7, x + 0.7, z - 0.7, z + 0.7) || !mkClear(list, x + ux * 1.15 - 0.4, x + ux * 1.15 + 0.4, z + uz * 1.15 - 0.4, z + uz * 1.15 + 0.4)) continue;
      M.loos.push(buildLoo(x, z, ux, uz));
    }
    markets.push(M);
    return;
  }
}
// the garden sheds become hiding places, door on the +z side
function placeShedHides() {
  for (const G of gardenSheds) {
    const S = { kind: 'shed', x: G.x, z: G.z, lx: 1.2, lz: 1.0, top: 2.5, indoor: true, eye: { x: G.x, y: 1.5, z: G.z + 0.75 }, stand: { x: G.x, z: G.z + 1.6, ux: 0, uz: 1 }, lootDay: 0 };
    hideSpots.push(S);
  }
}
worldHooks.beforeBake.push(() => { for (const c of CITIES) placeMarket(c); placeShedHides(); });

// =====================================================================
// Playing: shopping, traders, the crowd, the sheds
// =====================================================================
export const marketOpen = (hour) => hour >= 7 && hour < 18;
export function stallNear(x, y, z) {
  if (y > 1.2 || y < -0.5) return null;
  let best = null, bd = 1.7;
  for (const st of marketStalls) {
    if (Math.abs(st.x - x) > 4 || Math.abs(st.z - z) > 4) continue;
    const d = Math.hypot(st.front.x - x, st.front.z - z);
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}
function traderAt(st, K) {
  for (const h of K.hunters()) if (!h.dead && h.cart === st.spot && h.state !== 'chase' && Math.hypot(h.x - st.back.x, h.z - st.back.z) < 2.6) return h;
  return null;
}
const nickable = (st) => (STALL_GOODS[st.kind] || []).filter((it) => !it.tip);
// the stall menu (the same panel as the shops)
export function stallMenu(st, K) {
  return {
    cash: () => K.player.cash,
    items() {
      const T = traderAt(st, K), off = K.discount ? K.discount() : 0, list = (STALL_GOODS[st.kind] || []).map((it) => ({ ...it, price: off ? Math.max(1, Math.round(it.price * (1 - off))) : it.price, desc: it.desc + (T ? '' : ' (Honesty box: leave the money in the tin.)') }));
      if (!T) list.push({ id: 'mk_nick', name: 'HELP YOURSELF', price: 0, desc: 'Nobody\'s minding the stall. Just take something. If anyone sees you, they will make a scene.', tag: 'NICK IT' });
      return list;
    },
    state(it) {
      if (it.slot || it.costume) { const id = it.costume === true ? it.id : it.costume || it.id; const C = MK_COSTUME.find((c) => c.id === id); return C && K.player.outfit[C.slot] === id ? 'owned' : ''; }
      if (it.map && MK_STATE.mapDay === K.G.day) return 'owned';
      return '';
    },
    buy(it) {
      if (it.id === 'mk_nick') return nickFrom(st, K);
      const st0 = this.state(it);
      if (st0 === 'owned') return 'YOU\'VE ALREADY GOT ONE';
      if (K.player.cash < it.price) return `YOU NEED $${it.price - K.player.cash} MORE`;
      K.player.cash -= it.price; K.sfx.cash(); MK_STATE.bought++; MK_STATE.spent += it.price; MK_STATE.lastStall = st.kind;
      if (traderAt(st, K)) K.bumpLocal(0.04); // they got a look at you (but it's busy, and they see a lot of faces)
      return giveGood(it, K, st);
    },
  };
}
function giveGood(it, K, st) {
  const P = K.player;
  if (it.heal && P.hp >= 100) return mpick(['NOT HUNGRY. YOU EAT IT ANYWAY', 'FOR LATER. (YOU EAT IT NOW)', 'WORTH EVERY PENNY']);
  if (it.heal) { P.hp = Math.min(100, P.hp + it.heal); if (it.id === 'mk_tea') K.coolHeat(6); return mpick(['DELICIOUS', 'LOVELY, THAT', 'MUCH BETTER', 'CRUMBS EVERYWHERE']); }
  if (it.junk) { for (const k of it.junk) K.addJunk(k); return `${it.name}: IN YOUR POCKETS. T TO THROW`; }
  if (it.sweets) { MK_STATE.sweets += it.sweets; return `${MK_STATE.sweets} SWEETS IN YOUR POCKET. E NEXT TO A KID TO HAND ONE OVER`; }
  if (it.map) { MK_STATE.mapDay = K.G.day; return 'HIDING PLACES MARKED ON YOUR MAP (TODAY ONLY)'; }
  if (it.flowers) { MK_STATE.flowersT = Math.max(MK_STATE.flowersT, it.flowers); return it.id === 'mk_fern' ? 'YOU PEER OUT FROM BEHIND THE FERN' : 'FLOWERS IN HAND. YOU LOOK HARMLESS'; }
  if (it.tip) { fakeTipOff(K); return 'TIP-OFF PHONED IN. THEY\'RE OFF TO THE WRONG END OF TOWN'; }
  const id = it.costume === true ? it.id : it.costume || it.id;
  if (MK_COSTUME.some((c) => c.id === id)) return K.wear(id);
  return 'THANKS!';
}
function nickFrom(st, K) {
  if (traderAt(st, K)) return 'THE TRADER\'S RIGHT THERE';
  const pool = nickable(st).filter((it) => !(it.heal && K.player.hp >= 100) && !(it.map && MK_STATE.mapDay === K.G.day));
  const it = mpick(pool.length ? pool : nickable(st));
  // anyone watching?
  let seen = null;
  for (const h of K.hunters()) { if (h.dead || h.inside) continue; const d = Math.hypot(h.x - K.player.x, h.z - K.player.z); if (d < 18 && K.canSee(h)) { seen = h; break; } }
  MK_STATE.nicked++;
  const msg = giveGood(it, K, st);
  if (seen) {
    K.say(seen, mpick(['OI! THIEF!', 'PUT THAT BACK!', 'I SAW THAT!', 'STOP, THIEF!']));
    seen.alert(0.2); K.addHeat(4); K.bumpLocal(0.25);
    return `NICKED ${it.name}. SOMEONE SAW!`;
  }
  return `NICKED ${it.name}. NOBODY SAW. ${msg}`;
}
// a fake sighting: everyone searching heads off to a spot a long way away
function fakeTipOff(K) {
  const P = K.player, a = Math.random() * Math.PI * 2, r = mr(160, 240);
  const p = K.openPoint(P.x + Math.cos(a) * r, P.z + Math.sin(a) * r) || { x: P.x + Math.cos(a) * r, z: P.z + Math.sin(a) * r };
  K.G.lkp.x = p.x; K.G.lkp.z = p.z; K.G.lastSeenT = Math.max(K.G.lastSeenT, 20);
  let n = 0;
  for (const h of K.hunters()) {
    if (h.dead || h.guard || h.contract || h.hasLOS) continue;
    if (h.state === 'chase' && h.lastSeen < 2) continue;
    if (h.state === 'chase') h.state = 'search';
    h.huntT = Math.max(h.huntT, 25); h.wt = K.openPoint(p.x, p.z, 4, 30) || { x: p.x, z: p.z }; h.waitT = 0; n++;
  }
  K.coolHeat(10); MK_STATE.tips++; MK_STATE.tipAt = p; MK_STATE.tipSent = n;
}
// in a busy market you're just another shopper (a negative nudge on how much you stand out)
export function marketConspic(K) {
  let k = 0;
  if (MK_STATE.flowersT > 0) k -= 0.15;
  const M = marketAt(K.player.x, K.player.z);
  if (M && marketOpen(K.G.hour) && !K.player.car) k -= 0.12 + (K.bigDay && K.bigDay(M) ? 0.08 : 0); // bigger crowds on market day
  return k;
}
export function marketAt(x, z) { for (const M of markets) if (x > M.x0 && x < M.x1 && z > M.z0 && z < M.z1) return M; return null; }
let mkTraderT = 0;
export function updateMarkets(dt, K) {
  const P = K.player;
  if (MK_STATE.flowersT > 0) MK_STATE.flowersT = Math.max(0, MK_STATE.flowersT - dt);
  // traders come in to mind the stalls while the market's open (near you, so it's busy when you get there)
  mkTraderT -= dt;
  if (mkTraderT <= 0) {
    mkTraderT = 2;
    if (marketOpen(K.G.hour) && !K.G.super) for (const M of markets) {
      if (Math.abs(M.x - P.x) > 170 || Math.abs(M.z - P.z) > 170) continue;
      const staffed = M.stalls.filter((s) => K.vendorOf(s.spot)).length, want = Math.ceil(M.stalls.length * (K.staffShare ? K.staffShare(M) : 1));
      if (staffed >= want) continue; // quiet days: only some stalls are minded (the rest run on honesty boxes)
      const st = M.stalls.find((s) => !K.vendorOf(s.spot));
      if (st) { K.hireTrader(st.spot, st.back.x, st.back.z); break; }
    }
  }
  // the first rummage in a shed each day turns something up
  const S = P.hide;
  if (S && S.kind === 'shed' && S.lootDay !== K.G.day && K.hideT() > 1.5) {
    S.lootDay = K.G.day; MK_STATE.shedFinds++;
    const r = Math.random();
    if (r < 0.3) { K.addJunk('bottle'); K.addJunk('can'); K.showMsg('RUMMAGED IN THE SHED: A BOTTLE AND A CAN', 2.2); }
    else if (r < 0.5) { const n = Math.round(mr(4, 14)); P.cash += n; K.sfx.cash(); K.showMsg(`RUMMAGED IN THE SHED: $${n} IN AN OLD TOBACCO TIN`, 2.2); }
    else if (r < 0.62) { K.addJunk('banger'); K.showMsg('RUMMAGED IN THE SHED: A LEFTOVER BANGER FROM BONFIRE NIGHT', 2.4); }
    else if (r < 0.7 && K.giveCrowbar()) K.showMsg('RUMMAGED IN THE SHED: A RUSTY CROWBAR. THAT\'LL DO', 2.4);
    else if (r < 0.82) { P.hp = Math.min(100, P.hp + 10); K.showMsg('RUMMAGED IN THE SHED: A FORGOTTEN BISCUIT TIN (+10)', 2.2); }
    else K.showMsg(mpick(['RUMMAGED IN THE SHED: JUST SPIDERS', 'RUMMAGED IN THE SHED: A LAWNMOWER AND REGRETS', 'RUMMAGED IN THE SHED: NOTHING BUT FLOWERPOTS']), 2.2);
  }
}
// trader's lines while they're at the stall
export function stallLines(spot) { return spot && spot.lines; }
export function resetMarkets() {
  MK_STATE.sweets = 0; MK_STATE.bought = 0; MK_STATE.nicked = 0; MK_STATE.spent = 0; MK_STATE.tips = 0; MK_STATE.flowersT = 0; MK_STATE.mapDay = 0; MK_STATE.shedFinds = 0; MK_STATE.lastStall = null;
  for (const S of hideSpots) if (S.kind === 'shed') S.lootDay = 0;
}
// what the minimap shows: markets, and (with the old map) every hiding place
export function marketMapMarks(K) {
  const out = markets.map((M) => ({ x: M.x, z: M.z, kind: 'market', open: marketOpen(K.G.hour) }));
  if (MK_STATE.mapDay === K.G.day) for (const S of hideSpots) if (S.stand) out.push({ x: S.x, z: S.z, kind: 'hide' });
  return out;
}
export function marketsDebug() {
  const kinds = {}; for (const st of marketStalls) kinds[st.kind] = (kinds[st.kind] || 0) + 1;
  return { markets: markets.map((M) => ({ name: M.name, city: M.city, x: M.x, z: M.z, stalls: M.stalls.length, loos: M.loos.length })), stalls: marketStalls.length, kinds, sheds: hideSpots.filter((S) => S.kind === 'shed').length, ...MK_STATE };
}
export const marketInternals = { traderAt, fakeTipOff, nickFrom, STALL_GOODS, MK_COSTUME };
