// World: three towns with their own character, highways and countryside between them,
// static collision, ground height, a local navigation grid and ray casting.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, srand, sr, spick, canvasTex, textTex, GeoBuf, scene } from './core.js';

export const RD = 14, SW = 3, BLK = 44, PITCH = BLK + RD;

export const CITIES = [
  { name: 'PORT HALDEN', style: 'metro', cx: 0, cz: 0, n: 8, pop: 1 },
  { name: 'ASHFORD', style: 'suburb', cx: 1220, cz: 0, n: 6, pop: 0.8 },
  { name: 'SALTMARSH DOCKS', style: 'industrial', cx: 0, cz: 1220, n: 6, pop: 0.85 },
];
for (const c of CITIES) {
  c.half = (c.n * PITCH) / 2;
  c.minX = c.cx - c.half - RD / 2; c.maxX = c.cx + c.half + RD / 2;
  c.minZ = c.cz - c.half - RD / 2; c.maxZ = c.cz + c.half + RD / 2;
  c.Rx = (k) => c.cx - c.half + k * PITCH;
  c.Rz = (k) => c.cz - c.half + k * PITCH;
}
const PH = CITIES[0], ASH = CITIES[1], DOCKS = CITIES[2];
export const HIGHWAYS = [
  { name: 'ROUTE 9', axis: 'x', fixed: 0, a0: PH.maxX, a1: ASH.minX },
  { name: 'ROUTE 4', axis: 'z', fixed: 0, a0: PH.maxZ, a1: DOCKS.minZ },
];
export const RIVER = { z0: 650, z1: 672 };
export const SEA_Z = DOCKS.maxZ + 4;
export const WORLD = { minX: -330, maxX: 1480, minZ: -330, maxZ: SEA_Z - 1 };

export const colliders = [];   // {x0,x1,z0,z1,h}
export const blockRects = [];  // sidewalk-ringed blocks (for pickups)
export const vents = [];       // steam vents
export const smokeStacks = []; // chimney tops
export const parkedSpots = []; // {x, z, heading}
export const beacons = [];     // blinking lights {x,y,z}
export const animated = [];    // {obj, spin}
export const waterRects = [];  // for the minimap
const laneMap = new Map();

export function cityAt(x, z, pad = 0) {
  for (const c of CITIES) if (x >= c.minX - pad && x <= c.maxX + pad && z >= c.minZ - pad && z <= c.maxZ + pad) return c;
  return null;
}
export function highwayAt(x, z) {
  for (const h of HIGHWAYS) {
    const along = h.axis === 'x' ? x : z, across = h.axis === 'x' ? z : x;
    if (along >= h.a0 && along <= h.a1 && Math.abs(across - h.fixed) < 40) return h;
  }
  return null;
}
export function localeName(x, z) {
  const c = cityAt(x, z, 10); if (c) return c.name;
  const h = highwayAt(x, z); if (h) return h.name;
  return 'COUNTRYSIDE';
}

// ---------------------------------------------------------------------
// Facade materials (procedural)
// ---------------------------------------------------------------------
export const FAC = {};
function regFacade(key, mat, uvW, uvH, tint = false) { FAC[key] = { mat, buf: new GeoBuf(), uvW, uvH, tint }; }
export const emissiveFacades = [];

function brickFacade(wall, trim) {
  const lit = []; for (let i = 0; i < 32; i++) lit.push(srand() < 0.38);
  const draw = (em) => (ctx, W, H) => {
    ctx.fillStyle = em ? '#000' : wall; ctx.fillRect(0, 0, W, H);
    if (!em) for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; ctx.fillRect(Math.random() * W, Math.random() * H, 3, 2); }
    for (let r = 0; r < 8; r++) {
      if (!em) { ctx.fillStyle = trim; ctx.fillRect(0, r * 64, W, 5); }
      for (let c = 0; c < 4; c++) {
        const x = c * 64 + 13, y = r * 64 + 14, on = lit[r * 4 + c];
        if (!em) { ctx.fillStyle = trim; ctx.fillRect(x - 3, y - 3, 44, 44); }
        if (on) { const g = ctx.createLinearGradient(x, y, x, y + 36); g.addColorStop(0, '#ffe7a8'); g.addColorStop(1, '#f6b45a'); ctx.fillStyle = g; }
        else ctx.fillStyle = em ? '#000' : '#1b2233';
        ctx.fillRect(x, y, 38, 36);
        if (!em) { if (!on) { ctx.fillStyle = 'rgba(120,140,190,.18)'; ctx.fillRect(x, y, 38, 12); } ctx.fillStyle = trim; ctx.fillRect(x + 18, y, 2, 36); ctx.fillRect(x - 4, y + 37, 46, 4); }
      }
    }
  };
  const m = new THREE.MeshLambertMaterial({ map: canvasTex(256, 512, draw(false), true), emissiveMap: canvasTex(256, 512, draw(true), true), emissive: 0xffffff });
  emissiveFacades.push(m); return m;
}
function glassFacade(top, bottom, litChance) {
  const lit = []; for (let i = 0; i < 128; i++) lit.push(srand() < litChance);
  const draw = (em) => (ctx, W, H) => {
    if (em) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
    else { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bottom); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) {
      const on = lit[r * 8 + c];
      if (em) { if (on) { ctx.fillStyle = srand() < 0.5 ? '#fff4d8' : '#d8ecff'; ctx.globalAlpha = 0.75; ctx.fillRect(c * 32 + 2, r * 32 + 2, 28, 28); ctx.globalAlpha = 1; } }
      else { ctx.fillStyle = `rgba(255,255,255,${srand() * 0.06})`; ctx.fillRect(c * 32, r * 32, 32, 32); }
    }
    if (!em) {
      ctx.fillStyle = 'rgba(20,25,35,.85)';
      for (let c = 0; c <= 8; c++) ctx.fillRect(c * 32 - 1, 0, 2, H);
      for (let r = 0; r <= 16; r++) ctx.fillRect(0, r * 32 - 2, W, 4);
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.beginPath(); ctx.moveTo(0, H * 0.3); ctx.lineTo(W, H * 0.05); ctx.lineTo(W, H * 0.2); ctx.lineTo(0, H * 0.45); ctx.fill();
    }
  };
  const m = new THREE.MeshLambertMaterial({ map: canvasTex(256, 512, draw(false), true), emissiveMap: canvasTex(256, 512, draw(true), true), emissive: 0xffffff });
  emissiveFacades.push(m); return m;
}
function officeFacade(concrete, glass) {
  const lit = []; for (let i = 0; i < 32; i++) lit.push(srand() < 0.45);
  const draw = (em) => (ctx, W, H) => {
    ctx.fillStyle = em ? '#000' : concrete; ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      const on = lit[r * 8 + c], x = c * 32, y = r * 64 + 14;
      ctx.fillStyle = em ? (on ? '#fff1d0' : '#000') : (on ? '#e9d9a8' : glass);
      ctx.fillRect(x, y, 32, 36);
    }
    if (!em) { ctx.fillStyle = 'rgba(0,0,0,.35)'; for (let c = 0; c < 8; c++) ctx.fillRect(c * 32, 0, 2, H); for (let r = 0; r < 4; r++) ctx.fillRect(0, r * 64 + 50, W, 3); }
  };
  const m = new THREE.MeshLambertMaterial({ map: canvasTex(256, 256, draw(false), true), emissiveMap: canvasTex(256, 256, draw(true), true), emissive: 0xffffff });
  emissiveFacades.push(m); return m;
}
function sidingFacade() {
  const draw = (em) => (ctx, W, H) => {
    ctx.fillStyle = em ? '#000' : '#f2f0ea'; ctx.fillRect(0, 0, W, H);
    if (!em) { ctx.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 1.5); }
    const win = (x, on) => {
      if (!em) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 4, 14, 40, 34); ctx.fillStyle = '#3b3f48'; ctx.fillRect(x - 12, 14, 7, 34); ctx.fillRect(x + 37, 14, 7, 34); }
      ctx.fillStyle = on ? '#ffd98a' : (em ? '#000' : '#26303f'); ctx.fillRect(x, 18, 32, 26);
      if (!em) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 15, 18, 2, 26); ctx.fillRect(x, 30, 32, 2); }
    };
    win(16, false); win(80, true);
  };
  const m = new THREE.MeshLambertMaterial({ map: canvasTex(128, 64, draw(false), true), emissiveMap: canvasTex(128, 64, draw(true), true), emissive: 0xffffff, vertexColors: true });
  emissiveFacades.push(m); return m;
}
function corrugatedFacade() {
  const t = canvasTex(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x, 0, 3, H); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + 4, 0, 2, H); }
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(120,60,20,${Math.random() * 0.15})`; ctx.fillRect(Math.random() * W, Math.random() * H, 4, 10 + Math.random() * 30); }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, H - 6, W, 6);
  }, true);
  return new THREE.MeshLambertMaterial({ map: t, vertexColors: true });
}
const BRICKS = [['#7a3b2e', '#4e231b'], ['#a88d6e', '#6e5a45'], ['#4d3b34', '#2f241f'], ['#c2b195', '#8a7c66'], ['#8c4a3a', '#5c2d22'], ['#5e5a66', '#3b3842']];
BRICKS.forEach(([w, t], i) => regFacade('brick' + i, brickFacade(w, t), 12, 24));
regFacade('glass0', glassFacade('#6f9fc6', '#244a6e', 0.25), 12, 24);
regFacade('glass1', glassFacade('#79c2bf', '#21545a', 0.2), 12, 24);
regFacade('glass2', glassFacade('#5a5f78', '#1c1f2c', 0.3), 12, 24);
regFacade('glass3', glassFacade('#c9a46a', '#5b3d1c', 0.25), 12, 24);
regFacade('office0', officeFacade('#c8c4bb', '#2b3442'), 12, 12);
regFacade('office1', officeFacade('#8f969e', '#1e2836'), 12, 12);
regFacade('office2', officeFacade('#e6e0d0', '#3a4a5a'), 12, 12);
regFacade('siding', sidingFacade(), 6, 3, true);
regFacade('metal', corrugatedFacade(), 8, 8, true);
const BRICK_KEYS = BRICKS.map((_, i) => 'brick' + i);
const GLASS_KEYS = ['glass0', 'glass1', 'glass2', 'glass3'];
const OFFICE_KEYS = ['office0', 'office1', 'office2'];

function facadeBox(key, x0, x1, y0, y1, z0, z1, tint) {
  const f = FAC[key];
  f.buf.box(x0, x1, y0, y1, z0, z1, f.tint ? (tint ?? 0xffffff) : null, { uvW: f.uvW, uvH: f.uvH, uOff: Math.floor(srand() * 4) / 4, top: false });
}

// shop fronts, signs, billboards
const shopTex = canvasTex(128, 64, (ctx, W, H) => {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#fff2cf'); g.addColorStop(1, '#e6b06a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(80,50,30,.5)'; for (let i = 0; i < 6; i++) ctx.fillRect(10 + Math.random() * 100, 30 + Math.random() * 20, 8, 20);
  ctx.fillStyle = '#2b2420'; ctx.fillRect(0, 0, W, 5); ctx.fillRect(0, H - 4, W, 4); ctx.fillRect(0, 0, 4, H); ctx.fillRect(W / 2 - 2, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H);
}, true);
const SIGN_WORDS = ['HOTEL', 'CINEMA', 'DINER', 'JAZZ', 'ARCADE', 'PAWN', 'LIVE', 'BAR', 'NOODLE', 'DANCE', 'COMEDY', 'RAMEN', 'KARAOKE', 'TATTOO'];
const SIGN_COLORS = [['#e0283c', '#fff'], ['#5b8fe6', '#fff'], ['#e2b432', '#3a2200'], ['#9a4fd0', '#fff'], ['#20a59a', '#fff'], ['#f06aa8', '#fff'], ['#f08a24', '#fff']];
const signMats = SIGN_WORDS.map((word, i) => {
  const [bg, fg] = SIGN_COLORS[i % SIGN_COLORS.length];
  return new THREE.MeshBasicMaterial({
    map: canvasTex(64, 320, (ctx, W, H) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.strokeRect(5, 5, W - 10, H - 10);
      ctx.fillStyle = fg; ctx.font = 'bold 36px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const step = Math.min(42, (H - 30) / word.length), start = H / 2 - (step * (word.length - 1)) / 2;
      for (let k = 0; k < word.length; k++) ctx.fillText(word[k], W / 2, start + k * step);
    }),
  });
});
const edgeMat = new THREE.MeshLambertMaterial({ color: 0x222228 });
const ADS = [
  ['#e8402a', '#fff', ['FIZZO', 'tastes like lightning']], ['#1f3c88', '#ffd45a', ['HALDEN TRUST BANK', 'your money, probably safe']],
  ['#f5c518', '#222', ['BURGER BARN', 'open till 4am']], ['#2a9d8f', '#fff', ['SUNNY FM 98.4', 'all hits, all day']],
  ['#111', '#7cf', ['NEXA ONE', 'the phone that listens']], ['#6a2c8a', '#fff', ['GET LOST TRAVEL', 'anywhere but here']],
  ['#fff', '#c22', ['DR. MOLAR', 'smile, you are on camera']], ['#2b2b2b', '#ff5a3c', ['CASH 4 GOLD', 'no questions asked']],
];
const adMats = ADS.map(([bg, fg, [a, b]]) => new THREE.MeshBasicMaterial({
  map: canvasTex(512, 256, (ctx, W, H) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 74px Arial Black, Arial, sans-serif'; ctx.fillText(a, W / 2, H * 0.42, W - 40);
    ctx.font = 'italic 34px Georgia, serif'; ctx.fillText(b, W / 2, H * 0.75, W - 40);
  }),
}));
const STREETS = {
  metro: ['HALDEN AVE', 'KESTREL ST', 'BAYLOR AVE', 'MARROW ST', 'ORCHID AVE', '9TH ST', 'FERRIS ST', 'LOWELL AVE', 'CANAL ST'],
  suburb: ['MAPLE DR', 'BIRCH LN', 'ELM CT', 'MAIN ST', 'CHURCH RD', 'OAK AVE'],
  industrial: ['PIER RD', 'FOUNDRY ST', 'CRANE WAY', 'TANNER ST', 'BOLT AVE', 'SALT LN'],
};
const streetMats = {};
for (const k in STREETS) streetMats[k] = STREETS[k].map((n) => new THREE.MeshBasicMaterial({ map: textTex(256, 48, '#1f6b3a', '#fff', [n], 'bold 28px Arial, sans-serif') }));
const welcomeMats = CITIES.map((c, i) => new THREE.MeshBasicMaterial({
  map: textTex(512, 256, ['#245a3a', '#5a3a24', '#24405a'][i], '#fff', ['WELCOME TO', c.name, ['THE CITY THAT NEVER SLEEPS', 'A NICE QUIET TOWN', 'WORKING WATERFRONT'][i]], 'bold 44px Arial, sans-serif'),
}));

function staticMesh(geo, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry;
  m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); return m;
}

// ---------------------------------------------------------------------
// Buffers + palette
// ---------------------------------------------------------------------
const roofBuf = new GeoBuf(), propBuf = new GeoBuf(), glowBuf = new GeoBuf(), shopBuf = new GeoBuf(), markBuf = new GeoBuf(), waterBuf = new GeoBuf(), groundBuf = new GeoBuf();
const C = {
  sidewalk: 0x8a8590, roof: 0x3d3944, parapet: 0x55505c, grass: 0x4f7d3e, trunk: 0x5a3e2b, asphalt: 0x2f2d35,
  pole: 0x2e3035, lamp: 0xfff0c4, sodium: 0xffb050, signal: 0x6b5a18, white: 0xe8e8e8, yellow: 0xe0b52a, concrete: 0xa8a4a0,
};
const AWNINGS = [0x8a1d27, 0x1d4f8a, 0x2c6b3c, 0x6b2c6b, 0x8a5a1d, 0x222222, 0xc9662a];
const SHOP_TINTS = [0xffffff, 0xffe0c0, 0xd8ecff, 0xffd0e8, 0xe0ffd8];
const GREENS = [0x35642f, 0x426f2e, 0x2e5a35, 0x4d7a35, 0x5a7d2a];
const HOUSE_COLORS = [0xe8d8b0, 0xb8d0e0, 0xe0b8b0, 0xc8e0c0, 0xf0e8d8, 0xd0c0e0, 0xf0d090, 0xa8b8c8, 0xe8c0a0];
const ROOF_COLORS = [0x6b2a22, 0x3a3a40, 0x4a3628, 0x2f4a3a, 0x5a5a60, 0x7a4a2a];
const CONTAINER_COLORS = [0xb0302a, 0x2a5aa0, 0x2a8a4a, 0xd0902a, 0x6a6a70, 0xc85a1a, 0x2a7a8a, 0xe0d0b0];

function addCollider(x0, x1, z0, z1, h) { colliders.push({ x0, x1, z0, z1, h }); }

function addTree(x, z, s = sr(1.1, 1.7), col = true) {
  propBuf.box(x - 0.2, x + 0.2, 0, 2.6, z - 0.2, z + 0.2, C.trunk);
  const g = spick(GREENS);
  if (srand() < 0.3) propBuf.cyl(x, z, s * 1.3, 0, 1.8, 1.8 + s * 4, g, 6, false); // conifer
  else {
    propBuf.box(x - s, x + s, 2.2, 2.2 + s * 1.7, z - s, z + s, g);
    propBuf.box(x - s * 0.6, x + s * 0.6, 2.2 + s * 1.7, 2.2 + s * 2.5, z - s * 0.6, z + s * 0.6, g);
  }
  if (col) addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 4);
}
function addStreetLight(x, z, ax, az, color = C.lamp, h = 6.5) {
  propBuf.box(x - 0.1, x + 0.1, 0, h, z - 0.1, z + 0.1, C.pole);
  const ex = x + ax * 2.2, ez = z + az * 2.2;
  propBuf.box(Math.min(x, ex) - 0.06, Math.max(x, ex) + 0.06, h - 0.15, h - 0.03, Math.min(z, ez) - 0.06, Math.max(z, ez) + 0.06, C.pole);
  glowBuf.box(ex - 0.3, ex + 0.3, h - 0.38, h - 0.15, ez - 0.3, ez + 0.3, color);
  addCollider(x - 0.15, x + 0.15, z - 0.15, z + 0.15, h);
}
function addBladeSign(side, fixed, a, y, hS) {
  const mat = spick(signMats), out = side[0] === 'p' ? 1 : -1;
  const xs = side[1] === 'x';
  const geo = xs ? new THREE.BoxGeometry(1.25, hS, 0.18) : new THREE.BoxGeometry(0.18, hS, 1.25);
  const mats = xs ? [edgeMat, edgeMat, edgeMat, edgeMat, mat, mat] : [mat, mat, edgeMat, edgeMat, edgeMat, edgeMat];
  if (xs) staticMesh(geo, mats, fixed + out * 0.75, y, a); else staticMesh(geo, mats, a, y, fixed + out * 0.75);
}
// billboard facing direction (nx, nz) at (x, z), bottom at y
function addBillboard(x, z, y, ry, w = 9, h = 4.5, legs = true) {
  const mat = spick(adMats);
  const geo = new THREE.BoxGeometry(w, h, 0.3);
  staticMesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, mat, mat], x, y + h / 2, z, ry);
  if (legs) {
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const o of [-w / 3, w / 3]) { const lx = x + c * o, lz = z - s * o; propBuf.box(lx - 0.2, lx + 0.2, 0, y, lz - 0.2, lz + 0.2, C.pole); addCollider(lx - 0.25, lx + 0.25, lz - 0.25, lz + 0.25, y); }
  }
}
function streetFaces(x0, x1, z0, z1, ix0, ix1, iz0, iz1) {
  return { px: Math.abs(x1 - ix1) < 0.01, nx: Math.abs(x0 - ix0) < 0.01, pz: Math.abs(z1 - iz1) < 0.01, nz: Math.abs(z0 - iz0) < 0.01 };
}
const SIDES = ['px', 'nx', 'pz', 'nz'];
function sideInfo(side, x0, x1, z0, z1) {
  return { fixed: side === 'px' ? x1 : side === 'nx' ? x0 : side === 'pz' ? z1 : z0, a0: side[1] === 'x' ? z0 : x0, a1: side[1] === 'x' ? z1 : x1, out: side[0] === 'p' ? 1 : -1 };
}
function shopfronts(x0, x1, z0, z1, street, chance = 0.8, signChance = 0.3, h = 12) {
  for (const side of SIDES) {
    if (!street[side]) continue;
    const { fixed, a0, a1, out } = sideInfo(side, x0, x1, z0, z1);
    if (srand() < chance && a1 - a0 > 4) {
      shopBuf.face(side, fixed + out * 0.06, a0 + 0.7, a1 - 0.7, 0.2, 3.1, spick(SHOP_TINTS), Math.max(1, Math.round((a1 - a0) / 4)));
      if (srand() < 0.6) {
        const aw = spick(AWNINGS), f1 = Math.min(fixed, fixed + out * 1.5), f2 = Math.max(fixed, fixed + out * 1.5);
        if (side[1] === 'x') propBuf.box(f1, f2, 3.15, 3.4, a0 + 0.7, a1 - 0.7, aw); else propBuf.box(a0 + 0.7, a1 - 0.7, 3.15, 3.4, f1, f2, aw);
      }
    }
    if (srand() < signChance && h > 10 && a1 - a0 > 6) { const hS = sr(4.5, 7.5); addBladeSign(side, fixed, srand() < 0.5 ? a0 + 1.5 : a1 - 1.5, 4.2 + hS / 2 + sr(0, 1.5), hS); }
  }
}
function parapet(x0, x1, z0, z1, h, col = C.parapet) {
  propBuf.box(x0, x1, h, h + 0.7, z0, z0 + 0.35, col); propBuf.box(x0, x1, h, h + 0.7, z1 - 0.35, z1, col);
  propBuf.box(x0, x0 + 0.35, h, h + 0.7, z0, z1, col); propBuf.box(x1 - 0.35, x1, h, h + 0.7, z0, z1, col);
}
function waterTank(x, z, h) {
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) propBuf.box(x + dx * 1.1 - 0.1, x + dx * 1.1 + 0.1, h, h + 3, z + dz * 1.1 - 0.1, z + dz * 1.1 + 0.1, 0x3a2a20);
  propBuf.cyl(x, z, 1.7, 1.7, h + 3, h + 6, 0x7a5a3a, 10);
  propBuf.cyl(x, z, 1.8, 0, h + 6, h + 7.2, 0x4a3a2a, 10, false);
}

// generic building with roof details
function building(key, x0, x1, z0, z1, h, street, opt = {}) {
  facadeBox(key, x0, x1, 0, h, z0, z1, opt.tint);
  roofBuf.flat(x0, x1, z0, z1, h, opt.roof ?? C.roof);
  if (opt.parapet !== false) parapet(x0, x1, z0, z1, h);
  for (let i = 0; i < 2; i++) if (srand() < 0.6 && x1 - x0 > 6 && z1 - z0 > 6) { const ax = sr(x0 + 1.5, x1 - 4), az = sr(z0 + 1.5, z1 - 4); propBuf.box(ax, ax + sr(1.5, 3), h, h + sr(1, 2.2), az, az + sr(1.5, 3), 0x8d8f96); }
  if (opt.tank && srand() < 0.35 && x1 - x0 > 8) waterTank(sr(x0 + 3, x1 - 3), sr(z0 + 3, z1 - 3), h);
  addCollider(x0, x1, z0, z1, h + 1);
  if (street) shopfronts(x0, x1, z0, z1, street, opt.shops ?? 0.8, opt.signs ?? 0.3, h);
}

// ---------------------------------------------------------------------
// Roads shared by every town
// ---------------------------------------------------------------------
function addLane(axis, fixed, dir, a0, a1, cruise) {
  const key = `${axis}:${fixed.toFixed(1)}:${dir}`;
  const l = laneMap.get(key);
  if (l) { l.a0 = Math.min(l.a0, a0); l.a1 = Math.max(l.a1, a1); }
  else laneMap.set(key, { axis, fixed, dir, a0, a1, cruise });
}
function roadMarkings(city, canalRow) {
  const { n, Rx, Rz } = city;
  for (let k = 0; k <= n; k++) {
    for (let j = 0; j < n; j++) {
      // vertical road k (along z), segment j
      const vx = Rx(k), z0 = Rz(j) + RD / 2, z1 = Rz(j + 1) - RD / 2;
      for (const [c0, c1] of [[z0 + 0.4, z0 + 3.4], [z1 - 3.4, z1 - 0.4]]) {
        if ((c0 < Rz(j) + RD && j === canalRow) || (c1 > Rz(j + 1) - RD && j + 1 === canalRow)) continue;
        for (let x = vx - RD / 2 + 0.8; x < vx + RD / 2 - 0.8; x += 1.4) markBuf.flat(x, x + 0.7, c0, c1, 0.03, C.white);
      }
      for (let s = z0 + 5; s < z1 - 5; s += 5) markBuf.flat(vx - 0.12, vx + 0.12, s, s + 2.5, 0.03, C.yellow);
      // horizontal road k (along x), segment j
      if (k === canalRow) continue;
      const hz = Rz(k), x0 = Rx(j) + RD / 2, x1 = Rx(j + 1) - RD / 2;
      for (const [c0, c1] of [[x0 + 0.4, x0 + 3.4], [x1 - 3.4, x1 - 0.4]]) for (let z = hz - RD / 2 + 0.8; z < hz + RD / 2 - 0.8; z += 1.4) markBuf.flat(c0, c1, z, z + 0.7, 0.03, C.white);
      for (let s = x0 + 5; s < x1 - 5; s += 5) markBuf.flat(s, s + 2.5, hz - 0.12, hz + 0.12, 0.03, C.yellow);
      if (city.style === 'metro' && srand() < 0.2) vents.push({ x: vx + sr(-4, 4), z: sr(z0 + 6, z1 - 6) });
      if (city.style !== 'suburb' && srand() < 0.12) vents.push({ x: sr(x0 + 6, x1 - 6), z: hz + sr(-4, 4) });
    }
    const cr = city.style === 'suburb' ? 8 : 11;
    addLane('z', Rx(k) + 3.4, 1, city.minZ, city.maxZ, cr); addLane('z', Rx(k) - 3.4, -1, city.minZ, city.maxZ, cr);
    if (k !== canalRow) { addLane('x', Rz(k) - 3.4, 1, city.minX, city.maxX, cr); addLane('x', Rz(k) + 3.4, -1, city.minX, city.maxX, cr); }
  }
}
function signal(city, k, j) {
  const px = city.Rx(k) + RD / 2 + 0.7, pz = city.Rz(j) + RD / 2 + 0.7;
  propBuf.box(px - 0.13, px + 0.13, 0, 6.4, pz - 0.13, pz + 0.13, C.pole);
  propBuf.box(city.Rx(k) - 3, px, 6.05, 6.25, pz - 0.08, pz + 0.08, C.pole);
  for (const sx of [city.Rx(k) + 2.5, city.Rx(k) - 2]) {
    propBuf.box(sx - 0.28, sx + 0.28, 4.6, 6.05, pz - 0.28, pz + 0.28, C.signal);
    glowBuf.box(sx - 0.14, sx + 0.14, 5.55, 5.85, pz - 0.32, pz + 0.32, 0xff3020);
    glowBuf.box(sx - 0.14, sx + 0.14, 4.75, 5.05, pz - 0.32, pz + 0.32, 0x2a5a30);
  }
  addCollider(px - 0.2, px + 0.2, pz - 0.2, pz + 0.2, 6.4);
  const sm = streetMats[city.style];
  staticMesh(new THREE.BoxGeometry(2.4, 0.45, 0.06), [edgeMat, edgeMat, edgeMat, edgeMat, spick(sm), spick(sm)], px - 1.2, 3.6, pz);
}
function stopSign(x, z) {
  propBuf.box(x - 0.06, x + 0.06, 0, 2.4, z - 0.06, z + 0.06, 0x888888);
  propBuf.box(x - 0.35, x + 0.35, 2.1, 2.8, z - 0.05, z + 0.05, 0xc0201a);
}
function citySkeleton(city, canalRow = -1) {
  groundBuf.flat(city.minX - 3, city.maxX + 3, city.minZ - 3, city.maxZ + 3, 0.01, C.asphalt);
  for (let i = 0; i < city.n; i++) for (let j = 0; j < city.n; j++) {
    const r = { x0: city.Rx(i) + RD / 2, x1: city.Rx(i + 1) - RD / 2, z0: city.Rz(j) + RD / 2, z1: city.Rz(j + 1) - RD / 2, i, j, city };
    propBuf.box(r.x0, r.x1, 0, 0.15, r.z0, r.z1, city.style === 'industrial' ? 0x7d7a74 : C.sidewalk);
    blockRects.push(r);
  }
  roadMarkings(city, canalRow);
}

// ---------------------------------------------------------------------
// PORT HALDEN: dense metro — glass downtown, brick midtown, a canal, a landmark tower
// ---------------------------------------------------------------------
function genMetro(city) {
  const canalRow = 2;
  citySkeleton(city, canalRow);
  const mid = city.n / 2;
  for (const r of blockRects.filter((b) => b.city === city)) {
    const { i, j } = r, ix0 = r.x0 + SW, ix1 = r.x1 - SW, iz0 = r.z0 + SW, iz1 = r.z1 - SW;
    const bcx = (r.x0 + r.x1) / 2, bcz = (r.z0 + r.z1) / 2;
    const dc = Math.hypot(bcx - city.cx, bcz - city.cz) / city.half;
    const st = (x0, x1, z0, z1) => streetFaces(x0, x1, z0, z1, ix0, ix1, iz0, iz1);

    if (i === mid - 1 && j === mid - 1) { // Halden Commons park
      propBuf.box(ix0, ix1, 0.15, 0.22, iz0, iz1, C.grass);
      propBuf.box(bcx - 1.2, bcx + 1.2, 0.15, 0.24, iz0, iz1, 0xb8b0a0); propBuf.box(ix0, ix1, 0.15, 0.24, bcz - 1.2, bcz + 1.2, 0xb8b0a0);
      propBuf.cyl(bcx, bcz, 4, 4, 0.2, 0.9, 0x9a948a, 16); waterBuf.cyl(bcx, bcz, 3.5, 3.5, 0.2, 0.85, 0x3a7ab0, 16);
      propBuf.cyl(bcx, bcz, 0.4, 0.3, 0.9, 3.2, 0xb0a898, 8);
      addCollider(bcx - 4, bcx + 4, bcz - 4, bcz + 4, 1);
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (srand() > 0.25 && !(a > 0 && a < 3 && b > 0 && b < 3)) addTree(lerp(ix0 + 4, ix1 - 4, a / 3) + sr(-1, 1), lerp(iz0 + 4, iz1 - 4, b / 3) + sr(-1, 1));
      continue;
    }
    if (i === mid && j === mid) { // Halden Spire landmark
      propBuf.box(ix0, ix1, 0.15, 0.2, iz0, iz1, 0xc8c0b0);
      facadeBox('glass2', bcx - 7, bcx + 7, 0, 30, bcz - 7, bcz + 7); roofBuf.flat(bcx - 7, bcx + 7, bcz - 7, bcz + 7, 30, C.roof);
      facadeBox('glass0', bcx - 5, bcx + 5, 30, 84, bcz - 5, bcz + 5); roofBuf.flat(bcx - 5, bcx + 5, bcz - 5, bcz + 5, 84, C.roof);
      facadeBox('glass0', bcx - 3.2, bcx + 3.2, 84, 126, bcz - 3.2, bcz + 3.2); roofBuf.flat(bcx - 3.2, bcx + 3.2, bcz - 3.2, bcz + 3.2, 126, C.roof);
      propBuf.cyl(bcx, bcz, 0.6, 0.1, 126, 162, 0xb0b4bc, 8, false);
      glowBuf.box(bcx - 7.1, bcx + 7.1, 29.6, 30.2, bcz - 7.1, bcz + 7.1, 0x8ad8ff);
      glowBuf.box(bcx - 5.1, bcx + 5.1, 83.6, 84.2, bcz - 5.1, bcz + 5.1, 0x8ad8ff);
      beacons.push({ x: bcx, y: 163, z: bcz });
      addCollider(bcx - 7, bcx + 7, bcz - 7, bcz + 7, 162);
      for (const [x, z] of [[ix0 + 2, iz0 + 2], [ix1 - 2, iz0 + 2], [ix0 + 2, iz1 - 2], [ix1 - 2, iz1 - 2]]) addTree(x, z, 1.2);
      continue;
    }
    if (srand() < 0.07) { // pocket park
      propBuf.box(ix0, ix1, 0.15, 0.22, iz0, iz1, C.grass);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (srand() > 0.3) addTree(lerp(ix0 + 4, ix1 - 4, a / 2) + sr(-2, 2), lerp(iz0 + 4, iz1 - 4, b / 2) + sr(-2, 2));
      continue;
    }
    if (dc > 0.7 && srand() < 0.2) { // parking lot
      propBuf.box(ix0, ix1, 0.15, 0.17, iz0, iz1, 0x3a3840);
      for (let x = ix0 + 2; x < ix1 - 2; x += 3) { markBuf.flat(x, x + 0.12, iz0 + 2, iz0 + 7, 0.18, C.white); markBuf.flat(x, x + 0.12, iz1 - 7, iz1 - 2, 0.18, C.white); }
      for (let k = 0; k < 5; k++) if (srand() < 0.7) parkedSpots.push({ x: ix0 + 3.5 + k * 6, z: srand() < 0.5 ? iz0 + 4.5 : iz1 - 4.5, heading: srand() < 0.5 ? 0 : Math.PI });
      addBillboard(bcx, bcz, 7, srand() < 0.5 ? 0 : Math.PI / 2);
      continue;
    }
    const downtown = dc < 0.45, midtown = dc < 0.75;
    const pickKey = () => (downtown ? (srand() < 0.7 ? spick(GLASS_KEYS) : spick(OFFICE_KEYS)) : midtown ? (srand() < 0.6 ? spick(BRICK_KEYS) : spick(OFFICE_KEYS)) : spick(BRICK_KEYS));
    const hAt = () => Math.round((downtown ? sr(40, 100) : midtown ? sr(15, 42) : sr(9, 21)) / 3) * 3;
    const lot = (x0, x1, z0, z1) => {
      const key = pickKey(), h = hAt(), s = st(x0, x1, z0, z1);
      if (downtown && GLASS_KEYS.includes(key) && srand() < 0.5 && x1 - x0 > 14) {
        // podium + setback tower
        building(spick(OFFICE_KEYS), x0, x1, z0, z1, 12, s, { signs: 0 });
        const inset = 3;
        facadeBox(key, x0 + inset, x1 - inset, 12, h, z0 + inset, z1 - inset);
        roofBuf.flat(x0 + inset, x1 - inset, z0 + inset, z1 - inset, h, C.roof);
        parapet(x0 + inset, x1 - inset, z0 + inset, z1 - inset, h, 0x6a7080);
        colliders[colliders.length - 1].h = h + 1;
        if (srand() < 0.5) { propBuf.box((x0 + x1) / 2 - 0.15, (x0 + x1) / 2 + 0.15, h, h + sr(8, 18), (z0 + z1) / 2 - 0.15, (z0 + z1) / 2 + 0.15, 0x999999); beacons.push({ x: (x0 + x1) / 2, y: h + 18, z: (z0 + z1) / 2 }); }
      } else {
        building(key, x0, x1, z0, z1, h, s, { tank: !downtown, signs: downtown ? 0.05 : 0.35 });
        if (midtown && !downtown && srand() < 0.12) {
          const side = SIDES.find((sd) => s[sd]);
          if (side) { const { fixed, a0, a1, out } = sideInfo(side, x0, x1, z0, z1); const am = (a0 + a1) / 2; if (side[1] === 'x') addBillboard(fixed - out * 2, am, h + 0.7, Math.PI / 2 * out, 8, 4, false); else addBillboard(am, fixed - out * 2, h + 0.7, out > 0 ? 0 : Math.PI, 8, 4, false); }
        }
      }
    };
    const rr = srand();
    if (downtown && rr < 0.4) lot(ix0, ix1, iz0, iz1);
    else if (rr < 0.55) { const m = (ix0 + ix1) / 2; if (srand() < 0.5) { lot(ix0, m - 2, iz0, iz1); lot(m + 2, ix1, iz0, iz1); } else { const mz = (iz0 + iz1) / 2; lot(ix0, ix1, iz0, mz - 2); lot(ix0, ix1, mz + 2, iz1); } }
    else { const mx = (ix0 + ix1) / 2 + sr(-4, 4), mz = (iz0 + iz1) / 2 + sr(-4, 4); for (const [x0, x1] of [[ix0, mx - 2], [mx + 2, ix1]]) for (const [z0, z1] of [[iz0, mz - 2], [mz + 2, iz1]]) lot(x0, x1, z0, z1); }
    // street lights
    if ((i + j) % 2 === 0) { addStreetLight(r.x0 + 0.7, r.z0 + 0.7, -1, 0); addStreetLight(r.x1 - 0.7, r.z1 - 0.7, 1, 0); }
    else { addStreetLight(r.x1 - 0.7, r.z0 + 0.7, 0, -1); addStreetLight(r.x0 + 0.7, r.z1 - 0.7, 0, 1); }
  }
  for (let k = 1; k < city.n; k++) for (let j = 1; j < city.n; j++) if (j !== canalRow && j - 1 !== canalRow && srand() < 0.55) signal(city, k, j);
  // canal along horizontal road row `canalRow`, crossed by bridges at every avenue
  const zc = city.Rz(canalRow);
  for (let i = 0; i < city.n; i++) {
    const x0 = city.Rx(i) + RD / 2, x1 = city.Rx(i + 1) - RD / 2;
    waterBuf.flat(x0, x1, zc - 5, zc + 5, 0.04, 0x2f6e8e);
    propBuf.box(x0, x1, 0.01, 0.12, zc - 7, zc - 5, 0x9a948a); propBuf.box(x0, x1, 0.01, 0.12, zc + 5, zc + 7, 0x9a948a);
    propBuf.box(x0, x1, 0.6, 1.0, zc - 5.2, zc - 5.0, 0x2a2a2e); propBuf.box(x0, x1, 0.6, 1.0, zc + 5.0, zc + 5.2, 0x2a2a2e);
    for (let x = x0; x <= x1; x += 4) { propBuf.box(x - 0.06, x + 0.06, 0, 1, zc - 5.2, zc - 5, 0x2a2a2e); propBuf.box(x - 0.06, x + 0.06, 0, 1, zc + 5, zc + 5.2, 0x2a2a2e); }
    addCollider(x0, x1, zc - 5.1, zc + 5.1, 0.2);
    waterRects.push({ x0, x1, z0: zc - 5, z1: zc + 5 });
    if (srand() < 0.6) { const bx = sr(x0 + 6, x1 - 10); propBuf.box(bx, bx + 6, 0.05, 0.9, zc - 1.2, zc + 1.2, spick([0x8a2a2a, 0xe0e0e0, 0x2a4a8a])); propBuf.box(bx + 1.5, bx + 4, 0.9, 1.9, zc - 0.9, zc + 0.9, 0xeeeeee); }
  }
  for (let k = 0; k <= city.n; k++) {
    const x = city.Rx(k);
    markBuf.flat(x - RD / 2, x + RD / 2, zc - 5.5, zc + 5.5, 0.05, 0x4a4850);
    for (const s of [-1, 1]) { propBuf.box(x + s * 7 - 0.15, x + s * 7 + 0.15, 0, 1.2, zc - 5.5, zc + 5.5, 0x7a7670); }
  }
}

// ---------------------------------------------------------------------
// ASHFORD: small town — houses with yards, a main street, church, water tower, school
// ---------------------------------------------------------------------
function house(x0, x1, z0, z1, frontSide) {
  const two = srand() < 0.35, h = two ? 6 : 3.2, col = spick(HOUSE_COLORS), roof = spick(ROOF_COLORS);
  facadeBox('siding', x0, x1, 0.15, h, z0, z1, col);
  const alongX = frontSide === 'pz' || frontSide === 'nz';
  const ov = 0.4;
  propBuf.prism(x0 - ov, x1 + ov, z0 - ov, z1 + ov, h, sr(1.8, 2.6), roof, alongX);
  // door + porch on the street side
  const { fixed, a0, a1, out } = sideInfo(frontSide, x0, x1, z0, z1), am = (a0 + a1) / 2;
  propBuf.face(frontSide, fixed + out * 0.05, am - 0.6, am + 0.6, 0.15, 2.3, 0x5a3a28);
  if (frontSide[1] === 'x') propBuf.box(Math.min(fixed, fixed + out * 1.6), Math.max(fixed, fixed + out * 1.6), 0.15, 0.4, am - 1.5, am + 1.5, 0xb8b0a0);
  else propBuf.box(am - 1.5, am + 1.5, 0.15, 0.4, Math.min(fixed, fixed + out * 1.6), Math.max(fixed, fixed + out * 1.6), 0xb8b0a0);
  if (srand() < 0.4) propBuf.box(x0 + 0.8, x0 + 1.4, h, h + 2.6, z0 + 0.8, z0 + 1.4, 0x7a4a3a); // chimney
  addCollider(x0, x1, z0, z1, h + 2.5);
}
function picketFence(x0, x1, z0, z1, gapSide) {
  const col = 0xf2f0ea;
  for (const side of SIDES) {
    if (side === gapSide) continue;
    const { fixed, a0, a1 } = sideInfo(side, x0, x1, z0, z1);
    if (side[1] === 'x') propBuf.box(fixed - 0.05, fixed + 0.05, 0.15, 0.9, a0, a1, col); else propBuf.box(a0, a1, 0.15, 0.9, fixed - 0.05, fixed + 0.05, col);
  }
}
function genSuburb(city) {
  citySkeleton(city);
  const mainRow = city.n / 2; // horizontal road through the centre = Main St
  for (const r of blockRects.filter((b) => b.city === city)) {
    const { i, j } = r, ix0 = r.x0 + SW, ix1 = r.x1 - SW, iz0 = r.z0 + SW, iz1 = r.z1 - SW;
    const bcx = (r.x0 + r.x1) / 2, bcz = (r.z0 + r.z1) / 2;
    propBuf.box(ix0, ix1, 0.15, 0.2, iz0, iz1, C.grass);
    const onMain = (j === mainRow - 1 || j === mainRow) && i >= 1 && i <= city.n - 2;
    if (onMain) {
      // two-storey brick shop row facing Main St
      const facingZ = j === mainRow - 1 ? 'pz' : 'nz';
      const zA = facingZ === 'pz' ? iz1 - 14 : iz0, zB = facingZ === 'pz' ? iz1 : iz0 + 14;
      let x = ix0;
      while (x < ix1 - 4) {
        const w = Math.min(ix1 - x, sr(7, 11)), h = spick([6, 6, 9]);
        building(spick(BRICK_KEYS), x, x + w, zA, zB, h, { [facingZ]: true }, { shops: 1, signs: 0.25, parapet: true });
        x += w;
      }
      // parking behind
      const pz0 = facingZ === 'pz' ? iz0 : iz0 + 15, pz1 = facingZ === 'pz' ? iz1 - 15 : iz1;
      propBuf.box(ix0, ix1, 0.2, 0.22, pz0, pz1, 0x3a3840);
      for (let k = 0; k < 4; k++) if (srand() < 0.5) parkedSpots.push({ x: ix0 + 5 + k * 9, z: (pz0 + pz1) / 2, heading: Math.PI / 2 });
      addStreetLight(r.x0 + 0.7, facingZ === 'pz' ? r.z1 - 0.7 : r.z0 + 0.7, 0, facingZ === 'pz' ? 1 : -1, C.lamp, 5);
      addStreetLight(r.x1 - 0.7, facingZ === 'pz' ? r.z1 - 0.7 : r.z0 + 0.7, 0, facingZ === 'pz' ? 1 : -1, C.lamp, 5);
      continue;
    }
    if (i === 1 && j === 1) { // church
      facadeBox('siding', bcx - 6, bcx + 6, 0.15, 9, bcz - 10, bcz + 6, 0xf4f2ee);
      propBuf.prism(bcx - 6.5, bcx + 6.5, bcz - 10.5, bcz + 6.5, 9, 5, 0x3a3a44, false);
      facadeBox('siding', bcx - 3, bcx + 3, 0.15, 18, bcz + 6, bcz + 12, 0xf4f2ee);
      propBuf.cyl(bcx, bcz + 9, 3.6, 0, 18, 30, 0x3a3a44, 4, false);
      glowBuf.face('pz', bcz + 12.05, bcx - 1, bcx + 1, 12, 15, 0xffe0a0);
      addCollider(bcx - 6, bcx + 6, bcz - 10, bcz + 6, 14); addCollider(bcx - 3, bcx + 3, bcz + 6, bcz + 12, 30);
      for (let k = 0; k < 6; k++) { const gx = sr(ix0 + 2, ix1 - 2), gz = sr(iz0 + 2, bcz - 12); propBuf.box(gx - 0.3, gx + 0.3, 0.2, 1.1, gz - 0.1, gz + 0.1, 0x8a8a8a); }
      continue;
    }
    if (i === city.n - 2 && j === 1) { // water tower park
      const h = 22;
      for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { propBuf.box(bcx + dx - 0.25, bcx + dx + 0.25, 0, h, bcz + dz - 0.25, bcz + dz + 0.25, 0x8a9aa8); addCollider(bcx + dx - 0.35, bcx + dx + 0.35, bcz + dz - 0.35, bcz + dz + 0.35, h); }
      propBuf.cyl(bcx, bcz, 6, 6, h, h + 8, 0xb8c8d8, 16);
      propBuf.cyl(bcx, bcz, 6.2, 0, h + 8, h + 11, 0x8a9aa8, 16, false);
      const t = textTex(512, 96, '#b8c8d8', '#2a4a6a', ['ASHFORD'], 'bold 80px Arial Black, Arial', false);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(6.05, 6.05, 3.2, 24, 1, true, -0.9, 1.8), new THREE.MeshLambertMaterial({ map: t }));
      m.position.set(bcx, h + 4.5, bcz); m.rotation.y = Math.PI; scene.add(m);
      for (let k = 0; k < 5; k++) addTree(sr(ix0 + 3, ix1 - 3), sr(iz0 + 3, iz1 - 3));
      continue;
    }
    if (i === 2 && j === city.n - 2) { // school
      building('brick0', ix0 + 2, ix1 - 2, iz0 + 2, iz0 + 16, 8, null, { parapet: true });
      propBuf.box(ix0 + 4, ix1 - 4, 0.2, 0.22, iz0 + 20, iz1 - 4, 0x8a5a3a); // running track
      propBuf.box(ix0 + 8, ix1 - 8, 0.22, 0.24, iz0 + 23, iz1 - 7, C.grass);
      for (const x of [ix0 + 6, ix1 - 6]) { propBuf.box(x - 0.1, x + 0.1, 0, 3, iz0 + 24, iz0 + 24.2, 0xffffff); }
      propBuf.box((ix0 + ix1) / 2 - 0.06, (ix0 + ix1) / 2 + 0.06, 0, 9, iz0 + 17, iz0 + 17.12, 0xcccccc); // flag pole
      continue;
    }
    // houses: 3 along north and south sides, 1 on east and west
    const lotW = (ix1 - ix0) / 3;
    for (let k = 0; k < 3; k++) {
      const lx0 = ix0 + k * lotW, lx1 = lx0 + lotW;
      house(lx0 + 2.2, lx1 - 2.2, iz1 - 2.5 - 7, iz1 - 2.5, 'pz');
      house(lx0 + 2.2, lx1 - 2.2, iz0 + 2.5, iz0 + 2.5 + 7, 'nz');
      if (srand() < 0.5) addTree(sr(lx0 + 2, lx1 - 2), iz1 - 12, sr(1, 1.5));
      if (srand() < 0.5) addTree(sr(lx0 + 2, lx1 - 2), iz0 + 12, sr(1, 1.5));
      if (srand() < 0.3) parkedSpots.push({ x: lx0 + 1.5, z: iz1 + 1.2 - 4, heading: 0 });
    }
    house(ix1 - 2.5 - 7, ix1 - 2.5, iz0 + lotW + 2.2, iz1 - lotW - 2.2, 'px');
    house(ix0 + 2.5, ix0 + 2.5 + 7, iz0 + lotW + 2.2, iz1 - lotW - 2.2, 'nx');
    picketFence(ix0 + 12, ix1 - 12, iz0 + 12, iz1 - 12, null);
    if (srand() < 0.5) propBuf.box(bcx - 2.5, bcx + 2.5, 0.2, 0.28, bcz - 1.5, bcz + 1.5, 0x4a90c0); // pool
    else addTree(bcx, bcz, 1.6);
    // corner stop signs
    stopSign(r.x0 + 0.6, r.z0 + 0.6); stopSign(r.x1 - 0.6, r.z1 - 0.6);
    if ((i + j) % 2) addStreetLight(r.x0 + 0.7, r.z1 - 0.7, -1, 0, C.lamp, 5);
  }
  // gas station on the west edge where Route 9 arrives
  gasStation(city.minX - 26, city.cz + 14);
}
function gasStation(x, z) {
  propBuf.box(x - 16, x + 16, 0.01, 0.05, z - 10, z + 12, 0x4a4850);
  for (const [dx, dz] of [[-8, -3], [8, -3], [-8, 5], [8, 5]]) { propBuf.box(x + dx - 0.3, x + dx + 0.3, 0, 5, z + dz - 0.3, z + dz + 0.3, 0xdddddd); addCollider(x + dx - 0.35, x + dx + 0.35, z + dz - 0.35, z + dz + 0.35, 5); }
  propBuf.box(x - 11, x + 11, 5, 5.8, z - 6, z + 8, 0xe8e8e8);
  glowBuf.box(x - 11.05, x + 11.05, 5.3, 5.8, z - 6.05, z + 8.05, 0xd02a2a);
  for (const dx of [-4, 4]) { propBuf.box(x + dx - 0.5, x + dx + 0.5, 0, 1.6, z + 0.5, z + 1.5, 0xc03030); addCollider(x + dx - 0.5, x + dx + 0.5, z + 0.5, z + 1.5, 1.6); }
  building('brick3', x - 8, x + 8, z + 12, z + 20, 4.5, { nz: true }, { shops: 1, signs: 0, parapet: false });
  const t = textTex(256, 256, '#d02a2a', '#fff', ['FUEL', '24/7'], 'bold 70px Arial Black, Arial');
  staticMesh(new THREE.BoxGeometry(4, 4, 0.4), new THREE.MeshBasicMaterial({ map: t }), x + 14, 9, z - 8);
  propBuf.box(x + 13.8, x + 14.2, 0, 7, z - 8.2, z - 7.8, C.pole);
}

// ---------------------------------------------------------------------
// SALTMARSH DOCKS: warehouses, container yards, tanks, chimneys, cranes on the water
// ---------------------------------------------------------------------
function container(x, z, level, alongX, col) {
  const y0 = 0.15 + level * 2.6;
  if (alongX) propBuf.box(x - 3, x + 3, y0, y0 + 2.55, z - 1.22, z + 1.22, col);
  else propBuf.box(x - 1.22, x + 1.22, y0, y0 + 2.55, z - 3, z + 3, col);
}
function genIndustrial(city) {
  citySkeleton(city);
  for (const r of blockRects.filter((b) => b.city === city)) {
    const { i, j } = r, ix0 = r.x0 + SW, ix1 = r.x1 - SW, iz0 = r.z0 + SW, iz1 = r.z1 - SW;
    const bcx = (r.x0 + r.x1) / 2, bcz = (r.z0 + r.z1) / 2;
    propBuf.box(ix0, ix1, 0.15, 0.17, iz0, iz1, 0x5e5b58);
    const st = (x0, x1, z0, z1) => streetFaces(x0, x1, z0, z1, ix0, ix1, iz0, iz1);
    const kind = j === city.n - 1 ? 'yard' : spick(['warehouse', 'warehouse', 'yard', 'tanks', 'factory']);
    if (kind === 'warehouse') {
      const split = srand() < 0.5, tint = spick([0xb0503a, 0x6a7a8a, 0x5a7a5a, 0xc8b890, 0x8a8a90]);
      const parts = split ? [[ix0, ix1, iz0, (iz0 + iz1) / 2 - 2], [ix0, ix1, (iz0 + iz1) / 2 + 2, iz1]] : [[ix0, ix1, iz0, iz1]];
      for (const [x0, x1, z0, z1] of parts) {
        const h = Math.round(sr(8, 14));
        facadeBox('metal', x0, x1, 0, h, z0, z1, tint);
        propBuf.prism(x0, x1, z0, z1, h, 2, 0x6a6a70, true);
        addCollider(x0, x1, z0, z1, h + 2);
        const s = st(x0, x1, z0, z1);
        for (const side of SIDES) if (s[side]) {
          const { fixed, a0, a1, out } = sideInfo(side, x0, x1, z0, z1);
          for (let a = a0 + 3; a < a1 - 5; a += 9) { propBuf.face(side, fixed + out * 0.05, a, a + 5, 0.15, 5, 0x3a3a3e); glowBuf.box(side[1] === 'x' ? fixed + out * 0.2 - 0.2 : a + 2.2, side[1] === 'x' ? fixed + out * 0.2 + 0.2 : a + 2.8, 5.4, 5.7, side[1] === 'x' ? a + 2.2 : fixed + out * 0.2 - 0.2, side[1] === 'x' ? a + 2.8 : fixed + out * 0.2 + 0.2, C.sodium); }
        }
      }
    } else if (kind === 'yard') {
      for (let z = iz0 + 3; z < iz1 - 2; z += 7) {
        let x = ix0 + 4;
        const rowH = [];
        while (x < ix1 - 3) { const lv = Math.floor(sr(1, 4.99)); for (let l = 0; l < lv; l++) container(x, z, l, true, spick(CONTAINER_COLORS)); rowH.push(lv); x += 6.3; }
        if (srand() < 0.25) { /* leave a gap row for walking */ continue; }
        addCollider(ix0 + 1, x - 3.3, z - 1.25, z + 1.25, Math.max(...rowH) * 2.6);
      }
    } else if (kind === 'tanks') {
      for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
        if (srand() < 0.2) continue;
        const rr = sr(5, 7), h = sr(8, 13);
        propBuf.cyl(bcx + dx, bcz + dz, rr, rr, 0.15, h, spick([0xe8e8e8, 0xd8d0c0, 0xa8b0b8]), 14);
        propBuf.cyl(bcx + dx, bcz + dz, rr, rr * 0.3, h, h + 1.5, 0xb8b8b8, 14);
        addCollider(bcx + dx - rr * 0.9, bcx + dx + rr * 0.9, bcz + dz - rr * 0.9, bcz + dz + rr * 0.9, h);
      }
      propBuf.box(ix0, ix1, 2.5, 2.9, bcz - 0.3, bcz + 0.3, 0x8a6a3a); // pipe
    } else {
      building(spick(BRICK_KEYS), ix0 + 2, ix1 - 2, iz0 + 2, iz1 - 14, Math.round(sr(10, 16)), st(ix0 + 2, ix1 - 2, iz0 + 2, iz1 - 14), { shops: 0.2, signs: 0 });
      for (let k = 0; k < (srand() < 0.5 ? 1 : 2); k++) {
        const cx = ix0 + 8 + k * 12, cz = iz1 - 7, h = sr(32, 46);
        propBuf.cyl(cx, cz, 1.8, 1.2, 0, h, 0x8a4a3a, 10, false);
        propBuf.cyl(cx, cz, 1.32, 1.25, h - 6, h - 3, 0xe8e8e8, 10, false);
        addCollider(cx - 1.8, cx + 1.8, cz - 1.8, cz + 1.8, h);
        smokeStacks.push({ x: cx, y: h, z: cz });
        beacons.push({ x: cx, y: h + 0.5, z: cz });
      }
    }
    if ((i + j) % 2 === 0) addStreetLight(r.x0 + 0.7, r.z0 + 0.7, -1, 0, C.sodium, 8);
    else addStreetLight(r.x1 - 0.7, r.z1 - 0.7, 1, 0, C.sodium, 8);
  }
  // waterfront: quay, cranes and a ship
  const qz = city.maxZ;
  propBuf.box(city.minX, city.maxX, 0, 0.6, qz - 0.5, qz + 3.5, 0x6a6660);
  for (let x = city.minX + 30; x < city.maxX - 20; x += 70) {
    const col = spick([0xd04a2a, 0x2a6ab0, 0xe0b030]);
    for (const [dx, dz] of [[-5, -6], [5, -6], [-5, 2], [5, 2]]) { propBuf.box(x + dx - 0.6, x + dx + 0.6, 0, 26, qz + dz - 0.6, qz + dz + 0.6, col); addCollider(x + dx - 0.7, x + dx + 0.7, qz + dz - 0.7, qz + dz + 0.7, 26); }
    propBuf.box(x - 6, x + 6, 26, 28, qz - 7, qz + 3, col);
    propBuf.box(x - 1.5, x + 1.5, 27, 28.5, qz - 26, qz + 34, col);
    propBuf.box(x - 2, x + 2, 28, 31, qz - 3, qz + 1, 0xe8e8e8);
    beacons.push({ x, y: 31.5, z: qz + 34 });
  }
  // a docked cargo ship
  const sx = city.cx + 40, sz = qz + 22;
  propBuf.box(sx - 60, sx + 60, -2, 5, sz - 9, sz + 9, 0x2a3a5a);
  propBuf.box(sx - 60, sx + 60, 4, 5.2, sz - 9.2, sz + 9.2, 0xa02a2a);
  propBuf.box(sx + 38, sx + 52, 5, 17, sz - 7, sz + 7, 0xe8e8e8);
  for (let x = sx - 52; x < sx + 32; x += 6.5) for (let l = 0; l < 3; l++) { if (srand() < 0.8) { const col = spick(CONTAINER_COLORS); propBuf.box(x - 3, x + 3, 5 + l * 2.6, 7.5 + l * 2.6, sz - 6, sz - 3.6, col); propBuf.box(x - 3, x + 3, 5 + l * 2.6, 7.5 + l * 2.6, sz + 3.6, sz + 6, col); } }
}

// ---------------------------------------------------------------------
// Highways + countryside
// ---------------------------------------------------------------------
function genHighway(h) {
  const along = (a, b, c0, c1, y, col, buf = groundBuf) => (h.axis === 'x' ? buf.flat(a, b, h.fixed + c0, h.fixed + c1, y, col) : buf.flat(h.fixed + c0, h.fixed + c1, a, b, y, col));
  const alongBox = (a, b, c0, c1, y0, y1, col) => (h.axis === 'x' ? propBuf.box(a, b, y0, y1, h.fixed + c0, h.fixed + c1, col) : propBuf.box(h.fixed + c0, h.fixed + c1, y0, y1, a, b, col));
  const pt = (a, c) => (h.axis === 'x' ? [a, h.fixed + c] : [h.fixed + c, a]);
  along(h.a0, h.a1, -9, 9, 0.012, 0x6a6660);
  along(h.a0, h.a1, -7, 7, 0.014, C.asphalt);
  along(h.a0, h.a1, -0.3, -0.1, 0.03, C.yellow, markBuf); along(h.a0, h.a1, 0.1, 0.3, 0.03, C.yellow, markBuf);
  along(h.a0, h.a1, -6.6, -6.4, 0.03, C.white, markBuf); along(h.a0, h.a1, 6.4, 6.6, 0.03, C.white, markBuf);
  // guard rails with gaps so you can get off the road on foot
  for (let a = h.a0 + 20; a < h.a1 - 20; a += 90) {
    const b = Math.min(a + 80, h.a1 - 20);
    for (const s of [-1, 1]) {
      alongBox(a, b, s * 8.6 - 0.1, s * 8.6 + 0.1, 0.45, 0.8, 0xb8bcc4);
      for (let p = a; p <= b; p += 4) { const [x, z] = pt(p, s * 8.6); propBuf.box(x - 0.08, x + 0.08, 0, 0.8, z - 0.08, z + 0.08, 0x8a8e96); }
      const [x0, z0] = pt(a, s * 8.6 - 0.15), [x1, z1] = pt(b, s * 8.6 + 0.15);
      addCollider(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), 0.8);
    }
  }
  for (let a = h.a0 + 35, k = 0; a < h.a1 - 20; a += 70, k++) {
    const s = k % 2 ? 1 : -1, [x, z] = pt(a, s * 9.6);
    addStreetLight(x, z, h.axis === 'x' ? 0 : -s, h.axis === 'x' ? -s : 0, C.sodium, 8);
  }
  for (let a = h.a0 + 120; a < h.a1 - 100; a += 210) {
    const s = srand() < 0.5 ? 1 : -1, [x, z] = pt(a, s * 24);
    addBillboard(x, z, 5, h.axis === 'x' ? 0 : Math.PI / 2, 12, 6);
  }
  // welcome signs at both ends
  const ends = [[h.a0 + 30, CITIES.indexOf(cityAt(...pt(h.a0 - 20, 0)))], [h.a1 - 30, CITIES.indexOf(cityAt(...pt(h.a1 + 20, 0)))]];
  for (const [a, ci] of ends) {
    if (ci < 0) continue;
    const [x, z] = pt(a, 13);
    const geo = new THREE.BoxGeometry(8, 4, 0.3);
    staticMesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, welcomeMats[ci], welcomeMats[ci]], x, 3.5, z, h.axis === 'x' ? 0 : Math.PI / 2);
    for (const o of [-3, 3]) { const [lx, lz] = pt(a + o, 13); propBuf.box(lx - 0.12, lx + 0.12, 0, 1.6, lz - 0.12, lz + 0.12, C.pole); }
  }
  for (let k = 0; k < 2; k++) addLane(h.axis, h.fixed + (k ? 3.4 : -3.4), h.axis === 'x' ? (k ? -1 : 1) : (k ? 1 : -1), h.a0, h.a1, 20);
}

function onReserved(x, z, pad) {
  if (cityAt(x, z, pad)) return true;
  for (const h of HIGHWAYS) { const along = h.axis === 'x' ? x : z, across = h.axis === 'x' ? z : x; if (along > h.a0 - pad && along < h.a1 + pad && Math.abs(across - h.fixed) < 12 + pad) return true; }
  if (z > RIVER.z0 - pad && z < RIVER.z1 + pad) return true;
  return false;
}
function genCountryside() {
  // river crossing Route 4, with a bridge
  for (const [x0, x1] of [[WORLD.minX - 200, -9], [9, WORLD.maxX + 200]]) {
    waterBuf.flat(x0, x1, RIVER.z0, RIVER.z1, 0.03, 0x2f6e8e);
    addCollider(x0, x1, RIVER.z0 + 0.5, RIVER.z1 - 0.5, 0.2);
    waterRects.push({ x0, x1, z0: RIVER.z0, z1: RIVER.z1 });
  }
  propBuf.box(-9, 9, 0, 0.5, RIVER.z0 - 2, RIVER.z1 + 2, 0x8a8680);
  for (const s of [-1, 1]) { propBuf.box(s * 9 - 0.2, s * 9 + 0.2, 0.5, 1.6, RIVER.z0 - 2, RIVER.z1 + 2, 0x6a6660); addCollider(s * 9 - 0.25, s * 9 + 0.25, RIVER.z0 - 2, RIVER.z1 + 2, 1.6); }
  for (const s of [-1, 1]) { propBuf.box(s * 9 - 0.3, s * 9 + 0.3, 0, 6, (RIVER.z0 + RIVER.z1) / 2 - 0.3, (RIVER.z0 + RIVER.z1) / 2 + 0.3, 0x5a5650); }
  // sea along the south
  waterBuf.flat(WORLD.minX - 600, WORLD.maxX + 600, SEA_Z - 1, SEA_Z + 900, 0.02, 0x2a5f82);
  addCollider(WORLD.minX - 600, WORLD.maxX + 600, SEA_Z, SEA_Z + 900, 0.2);
  waterRects.push({ x0: WORLD.minX - 600, x1: WORLD.maxX + 600, z0: SEA_Z, z1: SEA_Z + 900 });
  // farm fields
  for (let k = 0; k < 40; k++) {
    const x = sr(WORLD.minX, WORLD.maxX), z = sr(WORLD.minZ, WORLD.maxZ), w = sr(30, 80), d = sr(25, 60);
    if (onReserved(x, z, 50) || onReserved(x + w, z + d, 50) || onReserved(x + w, z, 50) || onReserved(x, z + d, 50)) continue;
    const col = spick([0xc8b45a, 0x8a6a3a, 0x6a9a3a, 0xa8c060, 0x7a5a2a]);
    groundBuf.flat(x, x + w, z, z + d, 0.008, col);
    if (col === 0x8a6a3a || col === 0x7a5a2a) for (let r = z + 2; r < z + d; r += 3) markBuf.flat(x, x + w, r, r + 0.5, 0.012, 0x6a4a28);
  }
  // farmhouse + red barn by Route 9
  const fx = 600, fz = 70;
  house(fx, fx + 10, fz, fz + 8, 'nz');
  facadeBox('metal', fx + 22, fx + 38, 0, 7, fz - 4, fz + 12, 0xb03a2a); propBuf.prism(fx + 22, fx + 38, fz - 4, fz + 12, 7, 4, 0x5a5a60, false);
  addCollider(fx + 22, fx + 38, fz - 4, fz + 12, 11);
  propBuf.cyl(fx + 44, fz + 2, 3, 3, 0, 14, 0xc8c8c0, 12); propBuf.cyl(fx + 44, fz + 2, 3.1, 0, 14, 16, 0x8a8a90, 12, false); addCollider(fx + 41.5, fx + 46.5, fz - 0.5, fz + 4.5, 16);
  for (let x = fx - 10; x < fx + 60; x += 3) propBuf.box(x, x + 0.15, 0, 1.1, fz - 14, fz - 13.85, 0x8a6a4a);
  propBuf.box(fx - 10, fx + 60, 0.7, 0.8, fz - 14, fz - 13.9, 0x8a6a4a);
  // roadside diner on Route 4
  building('brick4', 22, 40, 380, 392, 4.5, { nx: true }, { shops: 1, signs: 0 });
  const dt = textTex(256, 128, '#1a2a4a', '#ff5ab0', ['DINER', 'EAT HERE'], 'bold 52px Georgia, serif');
  staticMesh(new THREE.BoxGeometry(5, 2.5, 0.3), new THREE.MeshBasicMaterial({ map: dt }), 18, 8, 386, Math.PI / 2);
  propBuf.box(17.85, 18.15, 0, 6.8, 385.85, 386.15, C.pole);
  for (let k = 0; k < 3; k++) parkedSpots.push({ x: 16, z: 378 + k * 6, heading: 0 });
  // wind turbines
  for (let k = 0; k < 6; k++) {
    const x = -180 + (k % 3) * 70, z = 330 + Math.floor(k / 3) * 160 + sr(-20, 20);
    propBuf.cyl(x, z, 1.4, 0.7, 0, 46, 0xeeeeee, 10, false);
    addCollider(x - 1.4, x + 1.4, z - 1.4, z + 1.4, 46);
    propBuf.box(x - 1, x + 1, 45, 47.5, z - 2.5, z + 1.5, 0xe0e0e0);
    const rotor = new THREE.Group();
    const bm = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
    for (let b = 0; b < 3; b++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 20, 0.25).translate(0, 10, 0), bm); blade.rotation.z = (b * Math.PI * 2) / 3; rotor.add(blade); }
    rotor.position.set(x, 46.3, z + 1.8);
    scene.add(rotor);
    animated.push({ obj: rotor, spin: sr(0.5, 0.9) });
    beacons.push({ x, y: 47.8, z });
  }
  // trees, rocks
  for (let k = 0; k < 520; k++) {
    let x = sr(WORLD.minX, WORLD.maxX), z = sr(WORLD.minZ, WORLD.maxZ);
    if (srand() < 0.5) { const h = spick(HIGHWAYS), a = sr(h.a0, h.a1), c = sr(14, 70) * (srand() < 0.5 ? -1 : 1); x = h.axis === 'x' ? a : h.fixed + c; z = h.axis === 'x' ? h.fixed + c : a; }
    if (onReserved(x, z, 6)) continue;
    if (srand() < 0.12) { const s = sr(0.8, 2.2); propBuf.box(x - s, x + s, 0, s * 1.2, z - s * 0.8, z + s * 0.8, spick([0x7a7670, 0x8a8478, 0x6a6660])); addCollider(x - s, x + s, z - s * 0.8, z + s * 0.8, s * 1.2); }
    else addTree(x, z, sr(1.2, 2.2));
  }
  // distant hills on the horizon (scenery only)
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2, d = sr(1500, 1900);
    const x = 575 + Math.cos(a) * d, z = 535 + Math.sin(a) * d;
    if (z > SEA_Z + 100) continue;
    const r = sr(150, 320), h = sr(60, 180);
    propBuf.cyl(x, z, r, 0, 0, h, spick([0x4a6a4a, 0x5a7050, 0x6a7a5a]), 7, false);
  }
}

// ---------------------------------------------------------------------
export const lanes = [];
export function generateWorld() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 60, 60), new THREE.MeshLambertMaterial({ color: 0x5a7d45 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(575, 0, 535);
  scene.add(ground);
  genMetro(PH); genSuburb(ASH); genIndustrial(DOCKS);
  for (const h of HIGHWAYS) genHighway(h);
  genCountryside();
  for (const f of Object.values(FAC)) f.buf.build(f.mat);
  roofBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  propBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  glowBuf.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  shopBuf.build(new THREE.MeshBasicMaterial({ map: shopTex, vertexColors: true }));
  markBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  groundBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  waterBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0a1a2a }));
  lanes.push(...laneMap.values());
  buildBuckets();
}

// ---------------------------------------------------------------------
// Collision buckets
// ---------------------------------------------------------------------
const BUCKET = 16, BMINX = WORLD.minX - 40, BMINZ = WORLD.minZ - 40;
const BNX = Math.ceil((WORLD.maxX - WORLD.minX + 80) / BUCKET), BNZ = Math.ceil((WORLD.maxZ - WORLD.minZ + 80) / BUCKET);
const buckets = Array.from({ length: BNX * BNZ }, () => []);
function buildBuckets() {
  for (const c of colliders) {
    const bx0 = clamp(Math.floor((c.x0 - 3 - BMINX) / BUCKET), 0, BNX - 1), bx1 = clamp(Math.floor((c.x1 + 3 - BMINX) / BUCKET), 0, BNX - 1);
    const bz0 = clamp(Math.floor((c.z0 - 3 - BMINZ) / BUCKET), 0, BNZ - 1), bz1 = clamp(Math.floor((c.z1 + 3 - BMINZ) / BUCKET), 0, BNZ - 1);
    for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) buckets[z * BNX + x].push(c);
  }
}
export function bucketAt(x, z) {
  return buckets[clamp(Math.floor((z - BMINZ) / BUCKET), 0, BNZ - 1) * BNX + clamp(Math.floor((x - BMINX) / BUCKET), 0, BNX - 1)];
}
export function resolveCircle(p, r) {
  let hit = false;
  for (const c of bucketAt(p.x, p.z)) {
    if (p.x + r < c.x0 || p.x - r > c.x1 || p.z + r < c.z0 || p.z - r > c.z1) continue;
    const qx = clamp(p.x, c.x0, c.x1), qz = clamp(p.z, c.z0, c.z1);
    const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
    else {
      const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z, m = Math.min(l, rr, t, b);
      if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r;
    }
    hit = true;
  }
  if (p.x < WORLD.minX) { p.x = WORLD.minX; hit = true; } else if (p.x > WORLD.maxX) { p.x = WORLD.maxX; hit = true; }
  if (p.z < WORLD.minZ) { p.z = WORLD.minZ; hit = true; } else if (p.z > WORLD.maxZ) { p.z = WORLD.maxZ; hit = true; }
  return hit;
}
export function pointBlocked(x, z, pad = 0.3) {
  if (x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ) return true;
  for (const c of bucketAt(x, z)) if (x >= c.x0 - pad && x <= c.x1 + pad && z >= c.z0 - pad && z <= c.z1 + pad) return true;
  return false;
}
export function maxHeightNear(x, z) {
  let h = 0;
  for (const c of bucketAt(x, z)) if (x >= c.x0 - 8 && x <= c.x1 + 8 && z >= c.z0 - 8 && z <= c.z1 + 8) h = Math.max(h, c.h);
  return h;
}
export function groundY(x, z) {
  const c = cityAt(x, z);
  if (!c) return 0;
  const lx = x - (c.cx - c.half), lz = z - (c.cz - c.half);
  if (lx < 0 || lz < 0 || lx > c.n * PITCH || lz > c.n * PITCH) return 0;
  const mx = lx % PITCH, mz = lz % PITCH;
  return mx < RD / 2 || mx > PITCH - RD / 2 || mz < RD / 2 || mz > PITCH - RD / 2 ? 0 : 0.15;
}

// ---------------------------------------------------------------------
// Local navigation grid around the player: BFS flow field + line of sight
// ---------------------------------------------------------------------
export const CELL = 2, GN = 180;
const blocked = new Uint8Array(GN * GN), flow = new Int32Array(GN * GN).fill(-1), bfsQueue = new Int32Array(GN * GN);
let gox = 0, goz = 0; // grid origin (world coords of cell 0,0 corner)
let gcx = 1e9, gcz = 1e9;
export function navRecenter(x, z, force = false) {
  if (!force && Math.abs(x - gcx) < 45 && Math.abs(z - gcz) < 45) return false;
  gcx = x; gcz = z; gox = x - (GN * CELL) / 2; goz = z - (GN * CELL) / 2;
  blocked.fill(0);
  const ex = gox + GN * CELL, ez = goz + GN * CELL;
  for (const c of colliders) {
    if (c.x1 < gox - 1 || c.x0 > ex + 1 || c.z1 < goz - 1 || c.z0 > ez + 1) continue;
    const x0 = Math.max(0, Math.floor((c.x0 - 0.3 - gox) / CELL)), x1 = Math.min(GN - 1, Math.floor((c.x1 + 0.3 - gox) / CELL));
    const z0 = Math.max(0, Math.floor((c.z0 - 0.3 - goz) / CELL)), z1 = Math.min(GN - 1, Math.floor((c.z1 + 0.3 - goz) / CELL));
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const wx = gox + (gx + 0.5) * CELL, wz = goz + (gz + 0.5) * CELL;
      if (wx >= c.x0 - 0.3 && wx <= c.x1 + 0.3 && wz >= c.z0 - 0.3 && wz <= c.z1 + 0.3) blocked[gz * GN + gx] = 1;
    }
  }
  for (let g = 0; g < GN; g++) for (let h = 0; h < GN; h++) {
    const wx = gox + (g + 0.5) * CELL, wz = goz + (h + 0.5) * CELL;
    if (wx < WORLD.minX || wx > WORLD.maxX || wz < WORLD.minZ || wz > WORLD.maxZ) blocked[h * GN + g] = 1;
  }
  return true;
}
function cellIdx(x, z) {
  const gx = Math.floor((x - gox) / CELL), gz = Math.floor((z - goz) / CELL);
  if (gx < 0 || gz < 0 || gx >= GN || gz >= GN) return -1;
  return gz * GN + gx;
}
const cellCenter = (i) => ({ x: gox + ((i % GN) + 0.5) * CELL, z: goz + (Math.floor(i / GN) + 0.5) * CELL });
export function blockedAt(x, z) { const i = cellIdx(x, z); return i < 0 ? pointBlocked(x, z) : blocked[i] === 1; }

export function computeFlow(tx, tz) {
  flow.fill(-1);
  let start = cellIdx(tx, tz);
  if (start < 0) return;
  if (blocked[start]) {
    const cx = start % GN, cz = Math.floor(start / GN);
    outer: for (let r = 1; r < 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x >= 0 && z >= 0 && x < GN && z < GN && !blocked[z * GN + x]) { start = z * GN + x; break outer; }
    }
  }
  let head = 0, tail = 0;
  flow[start] = 0; bfsQueue[tail++] = start;
  while (head < tail) {
    const i = bfsQueue[head++], d = flow[i] + 1, x = i % GN;
    if (x > 0 && flow[i - 1] < 0 && !blocked[i - 1]) { flow[i - 1] = d; bfsQueue[tail++] = i - 1; }
    if (x < GN - 1 && flow[i + 1] < 0 && !blocked[i + 1]) { flow[i + 1] = d; bfsQueue[tail++] = i + 1; }
    if (i >= GN && flow[i - GN] < 0 && !blocked[i - GN]) { flow[i - GN] = d; bfsQueue[tail++] = i - GN; }
    if (i < GN * (GN - 1) && flow[i + GN] < 0 && !blocked[i + GN]) { flow[i + GN] = d; bfsQueue[tail++] = i + GN; }
  }
}
function flowStep(i) {
  const x = i % GN, z = Math.floor(i / GN);
  let best = -1, bestD = flow[i] < 0 ? 1e9 : flow[i];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz) continue;
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= GN || nz >= GN) continue;
    const j = nz * GN + nx;
    if (flow[j] < 0) continue;
    if (dx && dz && (blocked[z * GN + nx] || blocked[nz * GN + x])) continue;
    const d = flow[j] + (dx && dz ? 0.4 : 0);
    if (d < bestD) { bestD = d; best = j; }
  }
  return best;
}
export function navTarget(x, z, look = 2) {
  let i = cellIdx(x, z);
  if (i < 0) return null;
  if (flow[i] < 0) {
    const cx = i % GN, cz = Math.floor(i / GN); let bd = 1e9, bi = -1;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= GN || nz >= GN) continue;
      const j = nz * GN + nx; if (flow[j] >= 0 && flow[j] < bd) { bd = flow[j]; bi = j; }
    }
    return bi < 0 ? null : cellCenter(bi);
  }
  for (let s = 0; s < look; s++) { const n = flowStep(i); if (n < 0) break; i = n; }
  return cellCenter(i);
}
export function los(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), n = Math.ceil(d / 1.2);
  for (let s = 1; s < n; s++) { const t = s / n; if (blockedAt(ax + dx * t, az + dz * t)) return false; }
  return true;
}
export function randomOpenPoint(cx, cz, rMin, rMax, tries = 20) {
  for (let t = 0; t < tries; t++) {
    const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!blockedAt(x, z)) return { x, z };
  }
  return null;
}

// ---------------------------------------------------------------------
// Ray casting against static boxes (bullets, aircraft line of sight)
// ---------------------------------------------------------------------
export function raycastWorld(o, d, maxT) {
  let best = maxT;
  if (d.y < -1e-4) { const t = -o.y / d.y; if (t > 0 && t < best) best = t; }
  const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT;
  const bx0 = Math.min(o.x, ex), bx1 = Math.max(o.x, ex), bz0 = Math.min(o.z, ez), bz1 = Math.max(o.z, ez);
  for (const c of colliders) {
    if (c.x1 < bx0 || c.x0 > bx1 || c.z1 < bz0 || c.z0 > bz1) continue;
    let t0 = 0, t1 = best;
    const sl = (oo, dd, mn, mx) => {
      if (Math.abs(dd) < 1e-8) return oo >= mn && oo <= mx;
      let a = (mn - oo) / dd, b = (mx - oo) / dd; if (a > b) { const tmp = a; a = b; b = tmp; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); return t0 <= t1;
    };
    if (sl(o.x, d.x, c.x0, c.x1) && sl(o.z, d.z, c.z0, c.z1) && sl(o.y, d.y, 0, c.h + 0.5) && t0 < best) best = t0;
  }
  return { t: best };
}
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
export function los3D(ax, ay, az, bx, by, bz) {
  _o.set(ax, ay, az); _d.set(bx - ax, by - ay, bz - az);
  const dist = _d.length(); _d.divideScalar(dist || 1);
  return raycastWorld(_o, _d, dist).t >= dist - 0.6;
}
