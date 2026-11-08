// World: three towns with their own character, highways and countryside between them,
// static collision, ground height, a local navigation grid and ray casting.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, srand, sr, spick, canvasTex, textTex, GeoBuf, ChunkBuf, scene } from './core.js';

export const RD = 14, SW = 3, BLK = 44, PITCH = BLK + RD;

export const CITIES = [
  { name: 'PORT HALDEN', style: 'metro', cx: 0, cz: 0, n: 8, pop: 1 },
  { name: 'ASHFORD', style: 'suburb', cx: 700, cz: 0, n: 6, pop: 0.8 },
  { name: 'SALTMARSH DOCKS', style: 'industrial', cx: 0, cz: 700, n: 6, pop: 0.85 },
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
  { name: 'OLD FARM RD', axis: 'z', fixed: ASH.cx, a0: ASH.maxZ, a1: DOCKS.cz + 7, lane: true },
  { name: 'OLD FARM RD', axis: 'x', fixed: DOCKS.cz, a0: DOCKS.maxX, a1: ASH.cx + 7, lane: true },
];
export const RIVER = { z0: 395, z1: 415 };
export const SEA_Z = DOCKS.maxZ + 4;
export const WORLD = { minX: -300, maxX: ASH.maxX + 130, minZ: -300, maxZ: SEA_Z - 1 };

export const colliders = [];   // {x0,x1,z0,z1,h,y0} solid from y0 up to h
export const roofs = [];       // walkable building tops {x0,x1,z0,z1,h,city}
export const ladders = [];     // {x,z,nx,nz,y0,y1} climbable, (nx,nz) points out of the wall
export const ziplines = [];
export const links = [];       // AI routes between levels {a:{x,y,z}, b:{x,y,z}, kind}: ladders, stairs
export const groundHoles = []; // {x0,x1,z0,z1} openings in the ground (stairwells, manholes)
export const siteOverrides = new Map(); // 'CITY:i:j' -> fn(blockRect, inner) builds a special block
export const worldHooks = { afterGen: [], beforeBake: [], afterBake: [] };
export const blockKey = (city, i, j) => `${city.name}:${i}:${j}`;
// split a rectangle around holes; returns the solid pieces
export function rectMinus(r, holes) {
  let parts = [r];
  for (const h of holes) {
    const next = [];
    for (const p of parts) {
      if (h.x1 <= p.x0 || h.x0 >= p.x1 || h.z1 <= p.z0 || h.z0 >= p.z1) { next.push(p); continue; }
      const x0 = Math.max(p.x0, h.x0), x1 = Math.min(p.x1, h.x1);
      if (h.z0 > p.z0) next.push({ x0: p.x0, x1: p.x1, z0: p.z0, z1: h.z0 });
      if (h.z1 < p.z1) next.push({ x0: p.x0, x1: p.x1, z0: h.z1, z1: p.z1 });
      if (x0 > p.x0) next.push({ x0: p.x0, x1: x0, z0: Math.max(p.z0, h.z0), z1: Math.min(p.z1, h.z1) });
      if (x1 < p.x1) next.push({ x0: x1, x1: p.x1, z0: Math.max(p.z0, h.z0), z1: Math.min(p.z1, h.z1) });
    }
    parts = next;
  }
  return parts;
}
export function tiledFlat(buf, q, y, col, T) {
  for (let x = q.x0; x < q.x1 - 1e-6; x += T) for (let z = q.z0; z < q.z1 - 1e-6; z += T) buf.flat(x, Math.min(q.x1, x + T), z, Math.min(q.z1, z + T), y, col);
}
export function inHole(x, z) { for (const h of groundHoles) if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return true; return false; }    // {a:{x,y,z}, b:{x,y,z}, len} ride from a (high) to b (low)
export const navOpen = [];   // {x0,x1,z0,z1} doorways the nav grid always treats as open
export const keepClear = []; // {x0,x1,z0,z1} doorways and paths street dressing must leave open
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
function regFacade(key, mat, uvW, uvH, tint = false) { FAC[key] = { mat, buf: new ChunkBuf(128), uvW, uvH, tint }; }
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

export function facadeBox(key, x0, x1, y0, y1, z0, z1, tint) {
  const f = FAC[key];
  f.buf.box(x0, x1, y0, y1, z0, z1, f.tint ? (tint ?? 0xffffff) : null, { uvW: f.uvW, uvH: f.uvH, uOff: Math.floor(srand() * 4) / 4, top: false });
}

// shop fronts, signs, billboards
export const shopTex = canvasTex(128, 64, (ctx, W, H) => {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#fff2cf'); g.addColorStop(1, '#e6b06a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(80,50,30,.5)'; for (let i = 0; i < 6; i++) ctx.fillRect(10 + Math.random() * 100, 30 + Math.random() * 20, 8, 20);
  ctx.fillStyle = '#2b2420'; ctx.fillRect(0, 0, W, 5); ctx.fillRect(0, H - 4, W, 4); ctx.fillRect(0, 0, 4, H); ctx.fillRect(W / 2 - 2, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H);
}, true);
const SIGN_WORDS = ['HOTEL', 'CINEMA', 'DINER', 'JAZZ', 'ARCADE', 'PAWN', 'LIVE', 'BAR', 'NOODLE', 'DANCE', 'COMEDY', 'RAMEN', 'KARAOKE', 'TATTOO'];
const SIGN_COLORS = [['#e0283c', '#fff'], ['#5b8fe6', '#fff'], ['#e2b432', '#3a2200'], ['#9a4fd0', '#fff'], ['#20a59a', '#fff'], ['#f06aa8', '#fff'], ['#f08a24', '#fff']];
export const signMats = SIGN_WORDS.map((word, i) => {
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
export const edgeMat = new THREE.MeshLambertMaterial({ color: 0x222228 });
const ADS = [
  ['#e8402a', '#fff', ['FIZZO', 'tastes like lightning']], ['#1f3c88', '#ffd45a', ['HALDEN TRUST BANK', 'your money, probably safe']],
  ['#f5c518', '#222', ['BURGER BARN', 'open till 4am']], ['#2a9d8f', '#fff', ['SUNNY FM 98.4', 'all hits, all day']],
  ['#111', '#7cf', ['NEXA ONE', 'the phone that listens']], ['#6a2c8a', '#fff', ['GET LOST TRAVEL', 'anywhere but here']],
  ['#fff', '#c22', ['DR. MOLAR', 'smile, you are on camera']], ['#2b2b2b', '#ff5a3c', ['CASH 4 GOLD', 'no questions asked']],
];
export const adMats = ADS.map(([bg, fg, [a, b]]) => new THREE.MeshBasicMaterial({
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

export function staticMesh(geo, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry;
  m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); return m;
}

// ---------------------------------------------------------------------
// Buffers + palette
// ---------------------------------------------------------------------
export const roofBuf = new ChunkBuf(128), propBuf = new ChunkBuf(96, 520), glowBuf = new GeoBuf(), shopBuf = new GeoBuf(), markBuf = new GeoBuf(), waterBuf = new GeoBuf(), groundBuf = new GeoBuf();
export const C = {
  sidewalk: 0x8a8590, roof: 0x3d3944, parapet: 0x55505c, grass: 0x4f7d3e, trunk: 0x5a3e2b, asphalt: 0x2f2d35,
  pole: 0x2e3035, lamp: 0xfff0c4, sodium: 0xffb050, signal: 0x6b5a18, white: 0xe8e8e8, yellow: 0xe0b52a, concrete: 0xa8a4a0,
};
export const AWNINGS = [0x8a1d27, 0x1d4f8a, 0x2c6b3c, 0x6b2c6b, 0x8a5a1d, 0x222222, 0xc9662a];
const SHOP_TINTS = [0xffffff, 0xffe0c0, 0xd8ecff, 0xffd0e8, 0xe0ffd8];
export const GREENS = [0x35642f, 0x426f2e, 0x2e5a35, 0x4d7a35, 0x5a7d2a];
const HOUSE_COLORS = [0xe8d8b0, 0xb8d0e0, 0xe0b8b0, 0xc8e0c0, 0xf0e8d8, 0xd0c0e0, 0xf0d090, 0xa8b8c8, 0xe8c0a0];
const ROOF_COLORS = [0x6b2a22, 0x3a3a40, 0x4a3628, 0x2f4a3a, 0x5a5a60, 0x7a4a2a];
export const CONTAINER_COLORS = [0xb0302a, 0x2a5aa0, 0x2a8a4a, 0xd0902a, 0x6a6a70, 0xc85a1a, 0x2a7a8a, 0xe0d0b0];

let curCity = null;
export const forcedLadders = []; // {roof, x, z, nx, nz, y0}
export function addCollider(x0, x1, z0, z1, h, extra) { const c = { x0, x1, z0, z1, h, y0: 0 }; if (extra) Object.assign(c, extra); colliders.push(c); return c; }
export function addRoof(x0, x1, z0, z1, h, extra) { const c = addCollider(x0, x1, z0, z1, h, extra); roofs.push(c); return c; }

// low-poly round blob (tree canopies, bushes): three stacked tapered cylinders
export function blob(buf, x, y, z, r, col, segs = 7) {
  buf.cyl(x, z, r * 0.55, r, y, y + r * 0.45, col, segs, false);
  buf.cyl(x, z, r, r * 0.92, y + r * 0.45, y + r * 1.05, col, segs, false);
  buf.cyl(x, z, r * 0.92, r * 0.35, y + r * 1.05, y + r * 1.55, col, segs);
}
export function addTree(x, z, s = sr(1.1, 1.7), col = true, y = 0) {
  propBuf.cyl(x, z, 0.2, 0.13, y, y + 2.6, C.trunk, 6, false);
  const g = spick(GREENS), kind = srand();
  if (kind < 0.25) { // conifer: stacked cones
    for (let k = 0; k < 3; k++) propBuf.cyl(x, z, s * (1.35 - k * 0.3), 0, y + 1.6 + k * s * 1.1, y + 1.6 + k * s * 1.1 + s * 1.9, g, 7, false);
  } else if (kind < 0.75) { // round broadleaf with a couple of side clumps
    blob(propBuf, x, y + 2.0, z, s * 1.05, g);
    const g2 = shadeHex(g, 1.12);
    blob(propBuf, x + s * 0.55, y + 2.1 + s * 0.5, z - s * 0.3, s * 0.7, g2);
    blob(propBuf, x - s * 0.5, y + 2.2 + s * 0.6, z + s * 0.35, s * 0.65, shadeHex(g, 0.9));
  } else { // tall poplar-ish oval
    propBuf.cyl(x, z, s * 0.5, s * 0.75, y + 1.8, y + 2.6, g, 7, false);
    propBuf.cyl(x, z, s * 0.75, s * 0.7, y + 2.6, y + 2.6 + s * 2, g, 7, false);
    propBuf.cyl(x, z, s * 0.7, 0, y + 2.6 + s * 2, y + 3.4 + s * 2.6, g, 7, false);
  }
  if (col) addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, y + 4, y ? { y0: y } : undefined);
}
export function shadeHex(hex, k) { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return c.getHex(); }
export function addStreetLight(x, z, ax, az, color = C.lamp, h = 6.5) {
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
export function addBillboard(x, z, y, ry, w = 9, h = 4.5, legs = true) {
  const mat = spick(adMats);
  const geo = new THREE.BoxGeometry(w, h, 0.3);
  staticMesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, mat, mat], x, y + h / 2, z, ry);
  if (legs) {
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const o of [-w / 3, w / 3]) { const lx = x + c * o, lz = z - s * o; propBuf.box(lx - 0.2, lx + 0.2, 0, y, lz - 0.2, lz + 0.2, C.pole); addCollider(lx - 0.25, lx + 0.25, lz - 0.25, lz + 0.25, y); }
  }
}
export function streetFaces(x0, x1, z0, z1, ix0, ix1, iz0, iz1) {
  return { px: Math.abs(x1 - ix1) < 0.01, nx: Math.abs(x0 - ix0) < 0.01, pz: Math.abs(z1 - iz1) < 0.01, nz: Math.abs(z0 - iz0) < 0.01 };
}
export const SIDES = ['px', 'nx', 'pz', 'nz'];
export function sideInfo(side, x0, x1, z0, z1) {
  return { fixed: side === 'px' ? x1 : side === 'nx' ? x0 : side === 'pz' ? z1 : z0, a0: side[1] === 'x' ? z0 : x0, a1: side[1] === 'x' ? z1 : x1, out: side[0] === 'p' ? 1 : -1 };
}
// ---------------------------------------------------------------------
// Shop signs: one shared atlas of painted shop names, drawn as quads in a single merged mesh
// ---------------------------------------------------------------------
export const SHOP_NAMES = [
  ['BEAN THERE', '#3a2418', '#f3d9a4'], ['CORNER MART', '#c8302a', '#fff'], ['SPIN CYCLE', '#2a7ac0', '#fff'], ['LUCKY STAR DINER', '#e0b030', '#4a1a10'],
  ['SHARP & CO', '#1a1a1a', '#e8c070'], ['DOG-EARED BOOKS', '#2f5a3a', '#f0e6c8'], ['PIXEL PALACE', '#5a1a8a', '#7ff0ff'], ['NIGHT OWL CHEMIST', '#1a6a5a', '#fff'],
  ['GOOD GRAINS', '#d8b070', '#3a2410'], ['NOODLE NOOK', '#b0201a', '#ffe08a'], ['FLOWER POWER', '#f08ab0', '#fff'], ['THE TIPSY GULL', '#20304a', '#ffcf6a'],
  ['MEND & MAKE', '#6a6a72', '#fff'], ['TOP DOUGH PIZZA', '#2a7a3a', '#fff'], ['RECORD RACK', '#111', '#ff6a3a'], ['PAWS & CLAWS', '#e0803a', '#fff'],
  ['BRIGHT SMILE DENTAL', '#e8f0f8', '#2a5a9a'], ['KWIK KEYS', '#f0d020', '#111'], ['HOLE IN ONE DONUTS', '#f2a0c0', '#5a2a1a'], ['THREADS', '#2a2a3a', '#e0e0ff'],
  ['GOLDEN WOK', '#9a1a1a', '#f0c040'], ['FRESH CATCH', '#1a4a7a', '#bfe8ff'], ['IRON & INK', '#1c1c1c', '#c8c8c8'], ['BUN VOYAGE', '#e8c060', '#7a2a10'],
  ['HALF PRICE BOOKS', '#7a1a2a', '#fff'], ['SUNNY SIDE CAFE', '#f0b030', '#5a2a00'], ['LOCKED IN GAMES', '#0a2a4a', '#5af0a0'], ['BIG SCOOP', '#a0d8f0', '#c02a5a'],
  ['PRESSED JUICE', '#5aa02a', '#fff'], ['VELVET LOUNGE', '#4a0a2a', '#f0a0d0'], ['TOOLBOX HARDWARE', '#e05a10', '#fff'], ['SECOND CHANCE THRIFT', '#3a6a8a', '#fff'],
];
const SIGN_ROWS = 16;
export const signAtlas = canvasTex(1024, 1024, (ctx, W, H) => {
  const cw = W / 2, ch = H / SIGN_ROWS;
  SHOP_NAMES.forEach(([name, bg, fg], k) => {
    const x = (k % 2) * cw, y = Math.floor(k / 2) * ch;
    ctx.fillStyle = bg; ctx.fillRect(x, y, cw, ch);
    ctx.strokeStyle = fg; ctx.globalAlpha = 0.55; ctx.lineWidth = 3; ctx.strokeRect(x + 5, y + 5, cw - 10, ch - 10); ctx.globalAlpha = 1;
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${name.length > 14 ? 34 : 42}px Georgia, serif`;
    ctx.fillText(name, x + cw / 2, y + ch / 2 + 2, cw - 30);
  });
});
export const signBuf = new GeoBuf();
// a painted sign flat on face `side` (just proud of `fixed`), spanning a0..a1 and y0..y1, showing atlas cell k
export function shopSign(side, fixed, a0, a1, y0, y1, k) {
  const u0 = (k % 2) / 2, u1 = u0 + 0.5, row = Math.floor(k / 2) % SIGN_ROWS;
  const v1 = 1 - row / SIGN_ROWS, v0 = 1 - (row + 1) / SIGN_ROWS, uv = [u0, v0, u1, v0, u1, v1, u0, v1];
  if (side === 'px') signBuf.quad([fixed, y0, a1], [fixed, y0, a0], [fixed, y1, a0], [fixed, y1, a1], [1, 0, 0], uv, null);
  else if (side === 'nx') signBuf.quad([fixed, y0, a0], [fixed, y0, a1], [fixed, y1, a1], [fixed, y1, a0], [-1, 0, 0], uv, null);
  else if (side === 'pz') signBuf.quad([a0, y0, fixed], [a1, y0, fixed], [a1, y1, fixed], [a0, y1, fixed], [0, 0, 1], uv, null);
  else signBuf.quad([a1, y0, fixed], [a0, y0, fixed], [a0, y1, fixed], [a1, y1, fixed], [0, 0, -1], uv, null);
}

// ---------------------------------------------------------------------
// Architectural detail: cornices, string courses, piers, balconies, fire escapes, roof clutter,
// so buildings read as built things instead of boxes with windows painted on
// ---------------------------------------------------------------------
const STONES = [0xd8cfbf, 0xc8bca6, 0xe6e0d4, 0xb8b0a4, 0xa89c88, 0xd0c4b0];
const METALS = [0x3a3e46, 0x4a4f58, 0x2c3038, 0x5e636c];
const SLATES = [0x3a4048, 0x4a4a52, 0x5a7a6e, 0x463a36, 0x2e3a4a];
const famOf = (key) => (key.startsWith('brick') ? 'brick' : key.startsWith('glass') ? 'glass' : key.startsWith('office') ? 'office' : 'other');
// a box sticking out of face `side` of a rectangle by `depth`, spanning a0..a1 along it. Returns its footprint.
export function outBox(side, fixed, a0, a1, y0, y1, depth, col, buf = propBuf) {
  const out = side[0] === 'p' ? 1 : -1, f1 = fixed + out * depth, lo = Math.min(fixed, f1), hi = Math.max(fixed, f1);
  if (side[1] === 'x') { buf.box(lo, hi, y0, y1, a0, a1, col, { bottom: true }); return { x0: lo, x1: hi, z0: a0, z1: a1 }; }
  buf.box(a0, a1, y0, y1, lo, hi, col, { bottom: true }); return { x0: a0, x1: a1, z0: lo, z1: hi };
}
// a sloped plane leaving face `side` at height yWall and reaching `depth` out at height yOut (awnings, canopies)
export function slope(buf, side, fixed, a0, a1, yWall, yOut, depth, col) {
  const out = side[0] === 'p' ? 1 : -1, f1 = fixed + out * depth, dy = yWall - yOut, U = [0, 0, 1, 0, 1, 1, 0, 1];
  const c = new THREE.Color(col);
  let p;
  if (side[1] === 'x') p = [[fixed, yWall, a0], [fixed, yWall, a1], [f1, yOut, a1], [f1, yOut, a0]];
  else p = [[a0, yWall, fixed], [a1, yWall, fixed], [a1, yOut, f1], [a0, yOut, f1]];
  const l = Math.hypot(dy, depth), n = side[1] === 'x' ? [out * dy / l, depth / l, 0] : [0, depth / l, out * dy / l];
  buf.quad(p[0], p[1], p[2], p[3], n, U, c); buf.quad(p[3], p[2], p[1], p[0], [-n[0], -n[1], -n[2]], U, c);
}
// shopfronts with framed glass, a recessed door, a fascia with a painted name and a striped awning
function shopfronts(x0, x1, z0, z1, street, chance = 0.8, signChance = 0.3, h = 12) {
  const got = {};
  for (const side of SIDES) {
    if (!street[side]) continue;
    const { fixed, a0, a1, out } = sideInfo(side, x0, x1, z0, z1);
    if (srand() < chance && a1 - a0 > 4) {
      got[side] = true;
      const s0 = a0 + 0.6, s1 = a1 - 0.6, len = s1 - s0;
      shopBuf.face(side, fixed + out * 0.06, s0, s1, 0.55, 3.0, spick(SHOP_TINTS), Math.max(1, Math.round(len / 4)));
      const frame = spick([0x2a2a2e, 0x3a2a20, 0x1f3a2a, 0x5a1a1a, 0xe8e4dc, 0x1a2a4a]);
      outBox(side, fixed, s0 - 0.1, s1 + 0.1, 0.15, 0.55, 0.14, frame);               // stallriser
      outBox(side, fixed, s0 - 0.25, s0 + 0.05, 0.15, 3.25, 0.18, frame);             // pilasters
      outBox(side, fixed, s1 - 0.05, s1 + 0.25, 0.15, 3.25, 0.18, frame);
      const nm = Math.max(1, Math.round(len / 2.2));
      for (let k = 1; k < nm; k++) { const a = s0 + (len * k) / nm; outBox(side, fixed, a - 0.05, a + 0.05, 0.55, 3.0, 0.1, frame); }
      outBox(side, fixed, s0, s1, 2.35, 2.45, 0.1, frame);                            // transom bar
      const dm = srand() < 0.5 ? s0 + 1.4 : s1 - 1.4;                                  // door
      outBox(side, fixed, dm - 0.6, dm + 0.6, 0.15, 2.3, 0.08, 0x1c1c22);
      glowBuf.face(side, fixed + out * 0.1, dm - 0.45, dm + 0.45, 0.6, 2.1, 0xfff0c8);
      outBox(side, fixed, s0 - 0.25, s1 + 0.25, 3.25, 4.0, 0.22, frame);              // fascia
      const sw = Math.min(len - 0.6, 6.5);
      if (sw > 2) shopSign(side, fixed + out * 0.23, (s0 + s1) / 2 - sw / 2, (s0 + s1) / 2 + sw / 2, 3.32, 3.32 + Math.min(0.62, sw / 8), Math.floor(srand() * SHOP_NAMES.length));
      if (srand() < 0.65) {
        const aw = spick(AWNINGS), stripe = srand() < 0.6, white = 0xf2eee6;
        const n = Math.max(2, Math.round(len / 0.6));
        for (let k = 0; k < n; k++) slope(propBuf, side, fixed + out * 0.22, s0 + (len * k) / n, s0 + (len * (k + 1)) / n, 3.2, 2.65, 1.6, stripe && k % 2 ? white : aw);
        outBox(side, fixed + out * 1.82, s0, s1, 2.38, 2.66, 0.04, aw);              // valance
      }
    }
    if (srand() < signChance && h > 10 && a1 - a0 > 6) { const hS = sr(4.5, 7.5); addBladeSign(side, fixed, srand() < 0.5 ? a0 + 1.5 : a1 - 1.5, 4.2 + hS / 2 + sr(0, 1.5), hS); }
  }
  return got;
}
export function parapet(x0, x1, z0, z1, h, col = C.parapet) {
  propBuf.box(x0, x1, h, h + 0.7, z0, z0 + 0.35, col); propBuf.box(x0, x1, h, h + 0.7, z1 - 0.35, z1, col);
  propBuf.box(x0, x0 + 0.35, h, h + 0.7, z0, z1, col); propBuf.box(x1 - 0.35, x1, h, h + 0.7, z0, z1, col);
  propBuf.box(x0 - 0.05, x1 + 0.05, h + 0.7, h + 0.8, z0 - 0.05, z0 + 0.4, C.concrete); propBuf.box(x0 - 0.05, x1 + 0.05, h + 0.7, h + 0.8, z1 - 0.4, z1 + 0.05, C.concrete); // coping
  propBuf.box(x0 - 0.05, x0 + 0.4, h + 0.7, h + 0.8, z0, z1, C.concrete); propBuf.box(x1 - 0.4, x1 + 0.05, h + 0.7, h + 0.8, z0, z1, C.concrete);
  const e = { y0: h, ledge: true };
  addCollider(x0, x1, z0, z0 + 0.35, h + 0.8, e); addCollider(x0, x1, z1 - 0.35, z1, h + 0.8, e);
  addCollider(x0, x0 + 0.35, z0, z1, h + 0.8, e); addCollider(x1 - 0.35, x1, z0, z1, h + 0.8, e);
}
function waterTank(x, z, h) {
  addCollider(x - 1.8, x + 1.8, z - 1.8, z + 1.8, h + 6, { y0: h + 0.1 });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) propBuf.box(x + dx * 1.1 - 0.1, x + dx * 1.1 + 0.1, h, h + 3, z + dz * 1.1 - 0.1, z + dz * 1.1 + 0.1, 0x3a2a20);
  propBuf.cyl(x, z, 1.7, 1.7, h + 3, h + 6, 0x7a5a3a, 10);
  for (const y of [h + 3.6, h + 4.6, h + 5.6]) propBuf.cyl(x, z, 1.74, 1.74, y, y + 0.08, 0x2a2a2a, 10, false); // hoops
  propBuf.cyl(x, z, 1.8, 0, h + 6, h + 7.2, 0x4a3a2a, 10, false);
}
// clutter on a flat roof: stair hut, vents, dishes, antennas, skylights, solar panels or a little roof garden
function roofClutter(x0, x1, z0, z1, h, fam) {
  const w = x1 - x0, d = z1 - z0; if (w < 5 || d < 5) return;
  const placed = [];
  const spot = (sw, sd) => {
    for (let t = 0; t < 8; t++) {
      const bx = sr(x0 + 0.8, x1 - 0.8 - sw), bz = sr(z0 + 0.8, z1 - 0.8 - sd);
      if (placed.some((p) => bx < p[1] + 0.6 && bx + sw > p[0] - 0.6 && bz < p[3] + 0.6 && bz + sd > p[2] - 0.6)) continue;
      placed.push([bx, bx + sw, bz, bz + sd]); return [bx, bz];
    }
    return null;
  };
  if (w * d > 60 && srand() < 0.7) { // stairwell hut with a door
    const hw = 2.6, hd = 3.2, p = spot(hw, hd);
    if (p) {
      const [bx, bz] = p, wall = fam === 'brick' ? 0x8a6a5a : 0xa8a49c;
      propBuf.box(bx, bx + hw, h, h + 2.7, bz, bz + hd, wall); propBuf.box(bx - 0.1, bx + hw + 0.1, h + 2.7, h + 2.85, bz - 0.1, bz + hd + 0.1, 0x4a4a50);
      propBuf.face('nz', bz - 0.02, bx + 0.7, bx + 1.7, h, h + 2.1, 0x3a3a42);
      glowBuf.box(bx + 1.05, bx + 1.35, h + 2.25, h + 2.45, bz - 0.12, bz - 0.02, C.lamp);
      addCollider(bx, bx + hw, bz, bz + hd, h + 2.85, { y0: h });
    }
  }
  for (let k = 0, n = Math.floor(sr(1, 4)); k < n; k++) { // vent stacks with caps
    const p = spot(0.9, 0.9); if (!p) break;
    const vx = p[0] + 0.45, vz = p[1] + 0.45, vh = sr(0.8, 1.8);
    propBuf.cyl(vx, vz, 0.32, 0.32, h, h + vh, 0x9a9ca2, 8);
    propBuf.cyl(vx, vz, 0.5, 0.05, h + vh + 0.1, h + vh + 0.45, 0x6a6c72, 8, false);
  }
  if (srand() < 0.45) { // satellite dish on a post
    const p = spot(1.2, 1.2);
    if (p) { const sx = p[0] + 0.6, sz = p[1] + 0.6; propBuf.box(sx - 0.05, sx + 0.05, h, h + 1.1, sz - 0.05, sz + 0.05, 0x5a5a5a); propBuf.cyl(sx, sz, 0.12, 0.75, h + 1.0, h + 1.35, 0xdedede, 10); }
  }
  if (h > 20 && srand() < 0.35) { // antenna mast
    const p = spot(0.6, 0.6);
    if (p) { const ax = p[0] + 0.3, az = p[1] + 0.3, ah = sr(4, 9); propBuf.box(ax - 0.06, ax + 0.06, h, h + ah, az - 0.06, az + 0.06, 0x8a8a8a); for (let y = h + 2; y < h + ah; y += 1.6) propBuf.box(ax - 0.6, ax + 0.6, y, y + 0.05, az - 0.03, az + 0.03, 0x8a8a8a); beacons.push({ x: ax, y: h + ah + 0.2, z: az }); }
  }
  const roll = srand();
  if (roll < 0.3) { // skylights
    for (let k = 0; k < 2; k++) { const p = spot(2.2, 1.4); if (!p) break; propBuf.box(p[0], p[0] + 2.2, h, h + 0.35, p[1], p[1] + 1.4, 0x5a5a60); propBuf.prism(p[0] + 0.1, p[0] + 2.1, p[1] + 0.1, p[1] + 1.3, h + 0.35, 0.45, 0x8ab8d0, true); }
  } else if (roll < 0.5) { // solar panels
    const p = spot(Math.min(6, w - 3), Math.min(4, d - 3));
    if (p) { const pw = Math.min(6, w - 3), pd = Math.min(4, d - 3); for (let z = p[1]; z < p[1] + pd - 0.9; z += 1.4) { propBuf.box(p[0], p[0] + pw, h + 0.5, h + 0.6, z, z + 1.1, 0x1f2f5a); propBuf.box(p[0], p[0] + pw, h + 0.08, h + 0.5, z + 0.5, z + 0.6, 0x7a7a80); } }
  } else if (roll < 0.62 && fam !== 'glass') { // roof garden: planters, a little tree, a parasol and deck chairs
    const p = spot(Math.min(7, w - 3), Math.min(5, d - 3));
    if (p) {
      const gw = Math.min(7, w - 3), gd = Math.min(5, d - 3);
      propBuf.box(p[0], p[0] + gw, h, h + 0.06, p[1], p[1] + gd, 0x8a6a4a); // decking
      for (const [px, pz] of [[p[0] + 0.5, p[1] + 0.5], [p[0] + gw - 0.5, p[1] + 0.5]]) { propBuf.box(px - 0.45, px + 0.45, h, h + 0.6, pz - 0.45, pz + 0.45, 0x6a4a3a); blob(propBuf, px, h + 0.55, pz, 0.5, spick(GREENS), 6); }
      propBuf.box(p[0] + 0.3, p[0] + gw - 0.3, h, h + 0.5, p[1] + gd - 0.7, p[1] + gd - 0.2, 0x6a4a3a); propBuf.box(p[0] + 0.35, p[0] + gw - 0.35, h + 0.5, h + 0.75, p[1] + gd - 0.65, p[1] + gd - 0.25, 0x4a8a3a);
      const ux = p[0] + gw / 2, uz = p[1] + gd / 2 - 0.4;
      propBuf.box(ux - 0.04, ux + 0.04, h, h + 2.2, uz - 0.04, uz + 0.04, 0xdddddd); propBuf.cyl(ux, uz, 1.3, 0.05, h + 1.9, h + 2.4, spick(AWNINGS), 8, false);
      for (const dx of [-1.2, 1.2]) { propBuf.box(ux + dx - 0.3, ux + dx + 0.3, h + 0.3, h + 0.38, uz - 0.8, uz + 0.4, 0xf0f0f0); }
    }
  }
}
// balconies stacked up a street face; their slabs are real ledges you can climb between
function balconies(side, I, h, base, col) {
  const len = I.a1 - I.a0; if (len < 6) return;
  const n = Math.min(3, Math.floor(len / 5.5)), step = len / n, metal = spick(METALS), glassy = srand() < 0.35;
  for (let k = 0; k < n; k++) {
    if (srand() < 0.25) continue;
    const am = I.a0 + step * (k + 0.5);
    for (let f = Math.max(2, Math.ceil(base / 3) + 1); f * 3 < h - 2 && f <= 7; f++) {
      const y = f * 3 - 0.2;
      const r = outBox(side, I.fixed, am - 1.25, am + 1.25, y - 0.16, y, 1.15, col);
      addCollider(r.x0, r.x1, r.z0, r.z1, y, { y0: y - 0.16, ledge: true });
      const fr = I.fixed + I.out * 1.1;
      outBox(side, fr, am - 1.25, am + 1.25, y + 0.95, y + 1.02, 0.06, metal);
      if (glassy) outBox(side, fr, am - 1.2, am + 1.2, y, y + 0.95, 0.02, 0x9ab8c8); else { for (let a = am - 0.6; a <= am + 0.61; a += 0.6) outBox(side, fr, a - 0.025, a + 0.025, y, y + 0.95, 0.05, metal); outBox(side, fr, am - 1.25, am + 1.25, y + 0.12, y + 0.17, 0.05, metal); }
      for (const e of [am - 1.25, am + 1.2]) outBox(side, I.fixed, e, e + 0.05, y + 0.95, y + 1.02, 1.12, metal);
      if (srand() < 0.3) { const px = am + sr(-0.8, 0.8); outBox(side, I.fixed + I.out * 0.3, px - 0.2, px + 0.2, y, y + 0.4, 0.4, 0x8a4a2a); blob(propBuf, side[1] === 'x' ? I.fixed + I.out * 0.5 : px, y + 0.4, side[1] === 'x' ? px : I.fixed + I.out * 0.5, 0.3, spick(GREENS), 5); }
    }
  }
}
// a fire escape: landings on every floor joined by stair stringers, with a ladder from the street to the roof
function fireEscape(side, I, h, roof) {
  const len = I.a1 - I.a0; if (len < 8 || h < 9 || h > 40) return;
  const out = I.out, metal = spick([0x2a2a2e, 0x3a2a24, 0x2a3a2e]), la = I.a0 + sr(1.2, len - 6.4), a0 = la + 0.55, a1 = a0 + 4.4;
  const lx = side[1] === 'x' ? I.fixed + out * 0.3 : la, lz = side[1] === 'x' ? la : I.fixed + out * 0.3;
  if (pointBlockedRaw(lx + (side[1] === 'x' ? out * 0.8 : 0), lz + (side[1] === 'z' ? out * 0.8 : 0))) return;
  const P = (a, o, y) => (side[1] === 'x' ? [I.fixed + out * o, y, a] : [a, y, I.fixed + out * o]);
  for (let y = 3; y <= h - 2.4; y += 3) {
    const r = outBox(side, I.fixed, a0, a1, y - 0.1, y, 1.35, metal);
    addCollider(r.x0, r.x1, r.z0, r.z1, y, { y0: y - 0.1, ledge: true });
    outBox(side, I.fixed + out * 1.3, a0, a1, y + 0.95, y + 1.0, 0.05, metal);
    outBox(side, I.fixed + out * 1.3, a0, a1, y + 0.45, y + 0.5, 0.05, metal);
    for (const a of [a0, (a0 + a1) / 2, a1 - 0.05]) outBox(side, I.fixed + out * 1.3, a, a + 0.05, y, y + 1.0, 0.05, metal);
    if (y + 3 <= h - 2.4) { propBuf.beam(P(a1 - 0.3, 0.45, y), P(a0 + 1.2, 0.45, y + 3), 0.12, metal); propBuf.beam(P(a1 - 0.3, 1.05, y), P(a0 + 1.2, 1.05, y + 3), 0.12, metal); for (let t = 0.15; t < 1; t += 0.23) { const a = lerp(a1 - 0.3, a0 + 1.2, t), yy = lerp(y, y + 3, t); propBuf.beam(P(a, 0.45, yy), P(a, 1.05, yy), 0.08, metal); } }
  }
  forcedLadders.push({ roof, x: lx, z: lz, nx: side === 'px' ? 1 : side === 'nx' ? -1 : 0, nz: side === 'pz' ? 1 : side === 'nz' ? -1 : 0, y0: 0 });
}
function pointBlockedRaw(x, z) { // before buckets exist: brute force over recent colliders
  for (let i = colliders.length - 1, n = 0; i >= 0 && n < 400; i--, n++) { const c = colliders[i]; if (c.y0 < 1.8 && c.h > 0.4 && x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3) return true; }
  return false;
}
// the face details for each family of facade
function dress(key, x0, x1, z0, z1, h, base, shops, opt) {
  const fam = famOf(key); if (fam === 'other') return;
  const stone = fam === 'glass' ? spick(METALS) : opt.stone ?? spick(STONES);
  const sides = SIDES.map((s) => [s, sideInfo(s, x0, x1, z0, z1)]);
  // cornice: a deep cap and a smaller bed moulding under it
  for (const [s, I] of sides) {
    outBox(s, I.fixed, I.a0 - 0.42, I.a1 + 0.42, h - 0.45, h, 0.42, stone);
    if (fam !== 'glass') { outBox(s, I.fixed, I.a0 - 0.22, I.a1 + 0.22, h - 0.8, h - 0.45, 0.22, stone); }
  }
  const floors = Math.floor((h - base) / 3), every = h > 33 ? 2 : 1;
  if (fam !== 'glass') {
    for (let f = 1; f < floors; f += every) { // a sill course on every floor
      const y = base + f * 3 + (fam === 'brick' ? 0.62 : 0.05); if (y > h - 1.3) break;
      for (const [s, I] of sides) outBox(s, I.fixed, I.a0, I.a1, y - 0.14, y, fam === 'brick' ? 0.12 : 0.2, stone);
    }
    // corner piers (quoins on brick)
    const pier = fam === 'brick' && srand() < 0.5 ? stone : shadeHex(stone, 0.85);
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) propBuf.box(cx - 0.4, cx + 0.4, base, h - 0.8, cz - 0.4, cz + 0.4, pier);
    if (fam === 'office') for (const [s, I] of sides) for (let a = I.a0 + 6; a < I.a1 - 3; a += 6) outBox(s, I.fixed, a - 0.2, a + 0.2, base + 3.6, h - 0.8, 0.16, stone);
    if (!base) for (const [s, I] of sides) { // plinth or shop fascia band
      if (shops[s]) outBox(s, I.fixed, I.a0, I.a1, 4.0, 4.3, 0.28, stone);
      else { outBox(s, I.fixed, I.a0, I.a1, 0.15, 0.8, 0.1, shadeHex(stone, 0.7)); outBox(s, I.fixed, I.a0, I.a1, 3.4, 3.6, 0.15, stone); }
    }
  } else {
    for (let y = base + 12; y < h - 3; y += 12) for (const [s, I] of sides) outBox(s, I.fixed, I.a0, I.a1, y - 0.5, y, 0.08, stone); // spandrel bands
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) propBuf.box(cx - 0.3, cx + 0.3, base, h, cz - 0.3, cz + 0.3, stone);
    const s = SIDES.find((sd) => shops[sd]) || (opt.street && SIDES.find((sd) => opt.street[sd]));
    if (s && !base) { // a lobby canopy over the entrance
      const I = sideInfo(s, x0, x1, z0, z1), am = (I.a0 + I.a1) / 2;
      outBox(s, I.fixed, am - 3.5, am + 3.5, 4.4, 4.7, 2.6, stone);
      outBox(s, I.fixed + I.out * 2.5, am - 3.5, am + 3.5, 4.38, 4.42, 0.05, 0xfff0d0, glowBuf);
    }
  }
  if (fam === 'brick') {
    for (const [s, I] of sides) {
      if (srand() < 0.5) { const a = sr(I.a0 + 0.5, I.a1 - 0.5); outBox(s, I.fixed, a - 0.07, a + 0.07, base, h - 0.5, 0.14, 0x4a4a4e); } // drainpipe
      const n = Math.floor(floors * (I.a1 - I.a0) / 18);
      for (let k = 0; k < n; k++) { if (srand() > 0.45) continue; const f = Math.floor(sr(Math.max(1, base / 3 + 1), floors)), a = sr(I.a0 + 1, I.a1 - 1.6); outBox(s, I.fixed, a, a + 0.75, f * 3 + 0.25, f * 3 + 0.7, 0.45, 0xd8d8d0); } // window AC units
    }
  }
}
// a mansard roof: sloped slate sides with dormers, flat on top
function mansard(x0, x1, z0, z1, h, street) {
  const mh = 2.8, ins = 1.3, col = spick(SLATES), U = [0, 0, 1, 0, 1, 1, 0, 1], c = new THREE.Color(col), y1 = h + mh;
  const l = Math.hypot(mh, ins), ny = ins / l, nh = mh / l;
  propBuf.quad([x0, h, z1], [x1, h, z1], [x1 - ins, y1, z1 - ins], [x0 + ins, y1, z1 - ins], [0, ny, nh], U, c);
  propBuf.quad([x1, h, z0], [x0, h, z0], [x0 + ins, y1, z0 + ins], [x1 - ins, y1, z0 + ins], [0, ny, -nh], U, c);
  propBuf.quad([x1, h, z1], [x1, h, z0], [x1 - ins, y1, z0 + ins], [x1 - ins, y1, z1 - ins], [nh, ny, 0], U, c);
  propBuf.quad([x0, h, z0], [x0, h, z1], [x0 + ins, y1, z1 - ins], [x0 + ins, y1, z0 + ins], [-nh, ny, 0], U, c);
  roofBuf.flat(x0 + ins, x1 - ins, z0 + ins, z1 - ins, y1, col);
  propBuf.box(x0 + ins - 0.1, x1 - ins + 0.1, y1, y1 + 0.15, z0 + ins - 0.1, z0 + ins + 0.1, 0x8a8a90); propBuf.box(x0 + ins - 0.1, x1 - ins + 0.1, y1, y1 + 0.15, z1 - ins - 0.1, z1 - ins + 0.1, 0x8a8a90);
  for (const s of SIDES) { // dormers
    if (street && !street[s]) continue;
    const I = sideInfo(s, x0, x1, z0, z1);
    for (let a = I.a0 + 2; a < I.a1 - 2; a += 3) {
      const r = outBox(s, I.fixed - I.out * 1.15, a - 0.55, a + 0.55, h + 0.3, h + 1.7, 0.9, 0xe8e4dc);
      outBox(s, I.fixed - I.out * 0.24, a - 0.38, a + 0.38, h + 0.45, h + 1.5, 0.02, 0x2a3446);
      propBuf.prism(r.x0 - 0.08, r.x1 + 0.08, r.z0 - 0.08, r.z1 + 0.08, h + 1.7, 0.55, col, s[1] === 'x');
    }
  }
  addCollider(x0 + ins * 0.5, x1 - ins * 0.5, z0 + ins * 0.5, z1 - ins * 0.5, y1, { y0: h });
  return addRoof(x0 + ins, x1 - ins, z0 + ins, z1 - ins, y1, { y0: h, city: curCity });
}
// a round corner turret with a pointed cap
function turret(cx, cz, h, col, capCol) {
  const r = 2.3;
  propBuf.cyl(cx, cz, r, r, 0.15, h + 3, col, 12);
  for (let y = 3.6; y < h + 2; y += 3) propBuf.cyl(cx, cz, r + 0.1, r + 0.1, y - 0.14, y, 0xd8cfbf, 12, false);
  propBuf.cyl(cx, cz, r + 0.35, r + 0.35, h + 2.6, h + 3.0, 0xd8cfbf, 12);
  propBuf.cyl(cx, cz, r + 0.2, 0, h + 3, h + 7, capCol, 12, false);
  propBuf.box(cx - 0.04, cx + 0.04, h + 7, h + 8.2, cz - 0.04, cz + 0.04, 0x8a8a8a);
  addCollider(cx - r * 0.8, cx + r * 0.8, cz - r * 0.8, cz + r * 0.8, h + 3);
}

// generic building with real architectural detail. opt.base > 0 leaves the ground floor open (walk-ins).
export function building(key, x0, x1, z0, z1, h, street, opt = {}) {
  const base = opt.base ?? 0, fam = famOf(key), w = x1 - x0, d = z1 - z0;
  let main = h;
  const stepped = opt.crown !== false && fam !== 'other' && h >= 27 && w > 13 && d > 13 && srand() < 0.4;
  if (stepped) main = h - 3 * Math.floor(sr(2, 4.99));
  const mans = !stepped && fam === 'brick' && h <= 21 && h >= 6 && opt.mansard !== false && srand() < (opt.mansardChance ?? 0.25);
  facadeBox(key, x0, x1, base, main, z0, z1, opt.tint);
  const shops = street && !base ? shopfronts(x0, x1, z0, z1, street, opt.shops ?? 0.8, opt.signs ?? 0.3, h) : {};
  dress(key, x0, x1, z0, z1, main, base, shops, Object.assign({ street }, opt));
  let roof;
  if (mans) {
    roofBuf.flat(x0, x1, z0, z1, main, C.roof);
    roof = addRoof(x0, x1, z0, z1, main, { city: curCity, y0: base });
    mansard(x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1, main, street);
  } else {
    roofBuf.flat(x0, x1, z0, z1, main, opt.roof ?? C.roof);
    if (opt.parapet !== false) parapet(x0, x1, z0, z1, main);
    for (let i = 0; i < 2; i++) if (srand() < 0.6 && w > 6 && d > 6) {
      const ax = sr(x0 + 1.5, x1 - 4), az = sr(z0 + 1.5, z1 - 4), aw = sr(1.5, 3), ah = sr(1, 2.2), ad = sr(1.5, 3);
      propBuf.box(ax, ax + aw, main, main + ah, az, az + ad, 0x8d8f96); addCollider(ax, ax + aw, az, az + ad, main + ah, { y0: main });
      for (let g = ax + 0.25; g < ax + aw - 0.2; g += 0.3) propBuf.box(g, g + 0.05, main + ah * 0.3, main + ah * 0.9, az - 0.02, az, 0x5a5c62); // grille
    }
    if (opt.tank && srand() < 0.35 && w > 8) waterTank(sr(x0 + 3, x1 - 3), sr(z0 + 3, z1 - 3), main);
    roof = addRoof(x0, x1, z0, z1, main, { city: curCity, y0: base });
    if (!stepped) roofClutter(x0 + 0.4, x1 - 0.4, z0 + 0.4, z1 - 0.4, main, fam);
  }
  if (stepped) { // one or two setback tiers on top
    let tx0 = x0, tx1 = x1, tz0 = z0, tz1 = z1, y = main;
    const tiers = h - main > 6 && srand() < 0.5 ? 2 : 1;
    for (let t = 0; t < tiers; t++) {
      const ins = sr(1.8, 3), top = t === tiers - 1 ? h : y + Math.round((h - y) / 2 / 3) * 3;
      tx0 += ins; tx1 -= ins; tz0 += ins; tz1 -= ins;
      if (tx1 - tx0 < 6 || tz1 - tz0 < 6 || top <= y) break;
      facadeBox(key, tx0, tx1, y, top, tz0, tz1, opt.tint);
      dress(key, tx0, tx1, tz0, tz1, top, y, {}, { stone: 0xd0c8bc });
      roofBuf.flat(tx0, tx1, tz0, tz1, top, C.roof); parapet(tx0, tx1, tz0, tz1, top);
      addRoof(tx0, tx1, tz0, tz1, top, { city: curCity, y0: y });
      y = top;
    }
    roofClutter(tx0 + 0.4, tx1 - 0.4, tz0 + 0.4, tz1 - 0.4, y, fam);
  }
  if (fam === 'brick' && street) {
    const ss = SIDES.filter((s) => street[s]);
    if (opt.balconies ?? srand() < 0.3) { const s = spick(ss); if (s) balconies(s, sideInfo(s, x0, x1, z0, z1), main, base, spick(STONES)); }
    if (opt.fireEscape ?? srand() < 0.35) {
      // only on a face that is open air: the back onto a courtyard, or a street face with no shopfront or door
      const s = opt.backSide !== undefined ? opt.backSide : spick(ss.filter((sd) => !shops[sd] && !base));
      if (s) fireEscape(s, sideInfo(s, x0, x1, z0, z1), main, roof);
    }
  }
  if (opt.turret && fam === 'brick' && !mans && main < 40) turret(opt.turret[0], opt.turret[1], main, opt.tint ?? 0x8a4a3a, spick(SLATES));
  return roof;
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
  for (const q of rectMinus({ x0: city.minX - 3, x1: city.maxX + 3, z0: city.minZ - 3, z1: city.maxZ + 3 }, groundHoles)) tiledFlat(groundBuf, q, 0.01, C.asphalt, 60);
  for (let i = 0; i < city.n; i++) for (let j = 0; j < city.n; j++) {
    const r = { x0: city.Rx(i) + RD / 2, x1: city.Rx(i + 1) - RD / 2, z0: city.Rz(j) + RD / 2, z1: city.Rz(j + 1) - RD / 2, i, j, city };
    for (const q of rectMinus(r, groundHoles)) propBuf.box(q.x0, q.x1, 0, 0.15, q.z0, q.z1, city.style === 'industrial' ? 0x7d7a74 : C.sidewalk);
    blockRects.push(r);
  }
  roadMarkings(city, canalRow);
}

// ---------------------------------------------------------------------
// Perimeter blocks: a ring of attached buildings of different widths, heights and styles around a
// courtyard, with alleys cutting through. Some ground floors are walk-in shops (lotHooks.walkIn).
// ---------------------------------------------------------------------
export const lotHooks = { walkIn: null, courtyard: null, house: null, warehouse: null };
export const courtyards = []; // {x0,x1,z0,z1,city} open yards inside blocks
export const gardenSheds = []; // {x, z} sheds in the shared back gardens of suburban blocks (door on the +z side)
export function perimeterBlock(I, P) {
  const { ix0, ix1, iz0, iz1 } = I;
  const st = (x0, x1, z0, z1) => streetFaces(x0, x1, z0, z1, ix0, ix1, iz0, iz1);
  const cs = () => Math.round(sr(P.corner?.[0] ?? 9, P.corner?.[1] ?? 13));
  const C = { nw: [cs(), cs()], ne: [cs(), cs()], sw: [cs(), cs()], se: [cs(), cs()] };
  const lots = [
    { x0: ix0, x1: ix0 + C.nw[0], z0: iz0, z1: iz0 + C.nw[1], corner: [ix0, iz0] },
    { x0: ix1 - C.ne[0], x1: ix1, z0: iz0, z1: iz0 + C.ne[1], corner: [ix1, iz0] },
    { x0: ix0, x1: ix0 + C.sw[0], z0: iz1 - C.sw[1], z1: iz1, corner: [ix0, iz1] },
    { x0: ix1 - C.se[0], x1: ix1, z0: iz1 - C.se[1], z1: iz1, corner: [ix1, iz1] },
  ];
  const alleys = [];
  const run = (a0, a1, dmax, mk, alleyOk) => {
    const alley = alleyOk && a1 - a0 > 13 && srand() < (P.alley ?? 0.5) ? sr(a0 + 4, a1 - 8) : null;
    let a = a0, done = false;
    while (a < a1 - 0.5) {
      if (alley !== null && !done && a >= alley) { alleys.push(mk(a, a + 3.6, dmax)); a += 3.6; done = true; continue; }
      let w = sr(P.w?.[0] ?? 6, P.w?.[1] ?? 12);
      if (alley !== null && !done && a + w > alley && alley - a > 4) w = alley - a;
      if (a1 - (a + w) < 4.5) w = a1 - a;
      lots.push(mk(a, a + w, Math.max(7, Math.min(dmax, sr(8, dmax))))); a += w;
    }
  };
  const ns = srand() < 0.5;
  run(ix0 + C.nw[0], ix1 - C.ne[0], Math.min(C.nw[1], C.ne[1]), (a, b, d) => ({ x0: a, x1: b, z0: iz0, z1: iz0 + d }), ns);
  run(ix0 + C.sw[0], ix1 - C.se[0], Math.min(C.sw[1], C.se[1]), (a, b, d) => ({ x0: a, x1: b, z0: iz1 - d, z1: iz1 }), ns);
  run(iz0 + C.nw[1], iz1 - C.sw[1], Math.min(C.nw[0], C.sw[0]), (a, b, d) => ({ x0: ix0, x1: ix0 + d, z0: a, z1: b }), !ns);
  run(iz0 + C.ne[1], iz1 - C.se[1], Math.min(C.ne[0], C.se[0]), (a, b, d) => ({ x0: ix1 - d, x1: ix1, z0: a, z1: b }), !ns);
  for (const L of lots) {
    const s = st(L.x0, L.x1, L.z0, L.z1);
    let h = Math.round(sr(P.h[0], P.h[1]) / 3) * 3 + (L.corner ? 3 : 0);
    if (srand() < 0.15) h += 6; // the odd taller one breaks up the roofline
    const key = P.key(L);
    const front = SIDES.find((sd) => s[sd]);
    const fi = front && sideInfo(front, L.x0, L.x1, L.z0, L.z1);
    let base = 0;
    if (front && fi.a1 - fi.a0 >= 6.5 && h >= 6 && lotHooks.walkIn && srand() < (P.walkIn ?? 0.85)) {
      if (lotHooks.walkIn(L, front, curCity)) base = 4.6;
    }
    const tc = !base && L.corner && srand() < (P.turret ?? 0.2) ? [L.corner[0] + (L.corner[0] === ix0 ? 1.4 : -1.4), L.corner[1] + (L.corner[1] === iz0 ? 1.4 : -1.4)] : null;
    const backSide = !L.corner && front ? { px: 'nx', nx: 'px', pz: 'nz', nz: 'pz' }[front] : null;
    building(key, L.x0, L.x1, L.z0, L.z1, h, s, { backSide, base, tank: srand() < 0.5, signs: P.signs ?? 0.3, shops: P.shops ?? 0.85, turret: tc, tint: P.tint?.() });
  }
  const yard = { x0: ix0 + Math.max(C.nw[0], C.sw[0]), x1: ix1 - Math.max(C.ne[0], C.se[0]), z0: iz0 + Math.max(C.nw[1], C.ne[1]), z1: iz1 - Math.max(C.sw[1], C.se[1]), city: curCity, alleys };
  if (yard.x1 - yard.x0 > 4 && yard.z1 - yard.z0 > 4) {
    propBuf.box(yard.x0, yard.x1, 0.15, 0.17, yard.z0, yard.z1, 0x5a5860);
    for (const A of alleys) propBuf.box(A.x0, A.x1, 0.15, 0.165, A.z0, A.z1, 0x55535a);
    courtyards.push(yard);
    if (lotHooks.courtyard) lotHooks.courtyard(yard);
  }
  return lots;
}

// ---------------------------------------------------------------------
// PORT HALDEN: dense metro — glass downtown, brick midtown, a canal, a landmark tower
// ---------------------------------------------------------------------
function genMetro(city) {
  curCity = city;
  const canalRow = 2;
  citySkeleton(city, canalRow);
  const mid = city.n / 2;
  for (const r of blockRects.filter((b) => b.city === city)) {
    const { i, j } = r, ix0 = r.x0 + SW, ix1 = r.x1 - SW, iz0 = r.z0 + SW, iz1 = r.z1 - SW;
    const bcx = (r.x0 + r.x1) / 2, bcz = (r.z0 + r.z1) / 2;
    const dc = Math.hypot(bcx - city.cx, bcz - city.cz) / city.half;
    { const ov = siteOverrides.get(blockKey(r.city, r.i, r.j)); if (ov) { ov(r, { ix0: r.x0 + SW, ix1: r.x1 - SW, iz0: r.z0 + SW, iz1: r.z1 - SW }); continue; } }
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
      // most city buildings have a shop, cafe or lobby you can walk into on the ground floor
      let wbase = 0; { const front = SIDES.find((sd) => s[sd]); if (front && lotHooks.walkIn && srand() < 0.8 && lotHooks.walkIn({ x0, x1, z0, z1 }, front, curCity)) wbase = 4.6; }
      if (downtown && GLASS_KEYS.includes(key) && srand() < 0.5 && x1 - x0 > 14) {
        // podium + setback tower
        building(spick(OFFICE_KEYS), x0, x1, z0, z1, 12, s, { signs: 0, base: wbase });
        const inset = 3;
        facadeBox(key, x0 + inset, x1 - inset, 12, h, z0 + inset, z1 - inset);
        roofBuf.flat(x0 + inset, x1 - inset, z0 + inset, z1 - inset, h, C.roof);
        parapet(x0 + inset, x1 - inset, z0 + inset, z1 - inset, h, 0x6a7080);
        addRoof(x0 + inset, x1 - inset, z0 + inset, z1 - inset, h, { city: curCity });
        if (srand() < 0.5) { propBuf.box((x0 + x1) / 2 - 0.15, (x0 + x1) / 2 + 0.15, h, h + sr(8, 18), (z0 + z1) / 2 - 0.15, (z0 + z1) / 2 + 0.15, 0x999999); beacons.push({ x: (x0 + x1) / 2, y: h + 18, z: (z0 + z1) / 2 }); }
      } else {
        building(key, x0, x1, z0, z1, h, s, { tank: !downtown, signs: downtown ? 0.05 : 0.35, base: wbase });
        if (midtown && !downtown && srand() < 0.12) {
          const side = SIDES.find((sd) => s[sd]);
          if (side) { const { fixed, a0, a1, out } = sideInfo(side, x0, x1, z0, z1); const am = (a0 + a1) / 2; if (side[1] === 'x') addBillboard(fixed - out * 2, am, h + 0.7, Math.PI / 2 * out, 8, 4, false); else addBillboard(am, fixed - out * 2, h + 0.7, out > 0 ? 0 : Math.PI, 8, 4, false); }
        }
      }
    };
    if (!downtown && srand() < 0.8) {
      perimeterBlock({ ix0, ix1, iz0, iz1 }, {
        h: midtown ? [12, 27] : [6, 16], key: () => (srand() < (midtown ? 0.72 : 0.9) ? spick(BRICK_KEYS) : spick(OFFICE_KEYS)),
        walkIn: midtown ? 0.85 : 0.9, signs: midtown ? 0.35 : 0.2, turret: midtown ? 0.25 : 0.15,
      });
    } else {
    const rr = srand();
    if (downtown && rr < 0.4) lot(ix0, ix1, iz0, iz1);
    else if (rr < 0.55) { const m = (ix0 + ix1) / 2; if (srand() < 0.5) { lot(ix0, m - 2, iz0, iz1); lot(m + 2, ix1, iz0, iz1); } else { const mz = (iz0 + iz1) / 2; lot(ix0, ix1, iz0, mz - 2); lot(ix0, ix1, mz + 2, iz1); } }
    else { const mx = (ix0 + ix1) / 2 + sr(-4, 4), mz = (iz0 + iz1) / 2 + sr(-4, 4); for (const [x0, x1] of [[ix0, mx - 2], [mx + 2, ix1]]) for (const [z0, z1] of [[iz0, mz - 2], [mz + 2, iz1]]) lot(x0, x1, z0, z1); }
    }
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
    addCollider(x0, x1, zc - 5.1, zc + 5.1, 0.2, { water: true });
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
// hipped roof: sloped on all four sides, ridge along x when alongX
function hipRoof(buf, x0, x1, z0, z1, y, rh, col, alongX) {
  const c = new THREE.Color(col), U = [0, 0, 1, 0, 1, 1, 0, 1], yr = y + rh;
  const n = (v) => { const l = Math.hypot(...v); return v.map((k) => k / l); };
  if (alongX) {
    const zm = (z0 + z1) / 2, hw = (z1 - z0) / 2, ra = x0 + hw, rb = x1 - hw;
    buf.quad([x0, y, z1], [x1, y, z1], [rb, yr, zm], [ra, yr, zm], n([0, hw, rh]), U, c);
    buf.quad([x1, y, z0], [x0, y, z0], [ra, yr, zm], [rb, yr, zm], n([0, hw, -rh]), U, c);
    buf.quad([x1, y, z1], [x1, y, z0], [rb, yr, zm], [rb, yr, zm], n([rh, hw, 0]), U, c);
    buf.quad([x0, y, z0], [x0, y, z1], [ra, yr, zm], [ra, yr, zm], n([-rh, hw, 0]), U, c);
  } else {
    const xm = (x0 + x1) / 2, hw = (x1 - x0) / 2, ra = z0 + hw, rb = z1 - hw;
    buf.quad([x1, y, z1], [x1, y, z0], [xm, yr, ra], [xm, yr, rb], n([rh, hw, 0]), U, c);
    buf.quad([x0, y, z0], [x0, y, z1], [xm, yr, rb], [xm, yr, ra], n([-rh, hw, 0]), U, c);
    buf.quad([x0, y, z1], [x1, y, z1], [xm, yr, rb], [xm, yr, rb], n([0, hw, rh]), U, c);
    buf.quad([x1, y, z0], [x0, y, z0], [xm, yr, ra], [xm, yr, ra], n([0, hw, -rh]), U, c);
  }
}
const TRIM = [0xf4f2ee, 0xe8e0d0, 0x3a3a40, 0x5a3a2a, 0x2a4a3a];
function house(x0, x1, z0, z1, frontSide) {
  const two = srand() < 0.35, h = two ? 6 : 3.2, col = spick(HOUSE_COLORS), roof = spick(ROOF_COLORS), trim = spick(TRIM);
  const doorSide = srand() < 0.5 ? -1.4 : 1.4;
  // most homes have a front door you can actually go through
  const fi0 = sideInfo(frontSide, x0, x1, z0, z1), am0 = (fi0.a0 + fi0.a1) / 2 + doorSide;
  const open = lotHooks.house && srand() < 0.8 && lotHooks.house({ x0, x1, z0, z1 }, frontSide, am0, h, col);
  if (!open) facadeBox('siding', x0, x1, 0.15, h, z0, z1, col);
  else { // the shell as four textured walls with a doorway in the front one
    const T = 0.2, slab = (sd, a0, a1, y0, y1) => { const I = sideInfo(sd, x0, x1, z0, z1), f0 = I.fixed - I.out * T, lo = Math.min(I.fixed, f0), hi = Math.max(I.fixed, f0); if (sd[1] === 'x') facadeBox('siding', lo, hi, y0, y1, a0, a1, col); else facadeBox('siding', a0, a1, y0, y1, lo, hi, col); };
    for (const sd of SIDES) {
      const I = sideInfo(sd, x0, x1, z0, z1);
      if (sd !== frontSide) slab(sd, I.a0, I.a1, 0.15, h);
      else { slab(sd, I.a0, am0 - 0.65, 0.15, h); slab(sd, am0 + 0.65, I.a1, 0.15, h); slab(sd, am0 - 0.65, am0 + 0.65, 2.45, h); }
    }
  }
  propBuf.box(x0 - 0.06, x1 + 0.06, 0.15, 0.6, z0 - 0.06, z1 + 0.06, 0x8a8478); // foundation
  for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) propBuf.box(cx - 0.12, cx + 0.12, 0.6, h, cz - 0.12, cz + 0.12, trim); // corner boards
  propBuf.box(x0 - 0.1, x1 + 0.1, h - 0.25, h, z0 - 0.1, z1 + 0.1, trim); // eaves board
  const alongX = frontSide === 'pz' || frontSide === 'nz';
  const ov = 0.45, rh = sr(1.8, 2.6), hip = srand() < 0.35;
  if (hip) hipRoof(propBuf, x0 - ov, x1 + ov, z0 - ov, z1 + ov, h, rh, roof, alongX);
  else propBuf.prism(x0 - ov, x1 + ov, z0 - ov, z1 + ov, h, rh, roof, alongX);
  // door, porch deck, porch roof on posts, steps, path to the pavement
  const { fixed, a0, a1, out } = sideInfo(frontSide, x0, x1, z0, z1), am = am0;
  if (!open) outBox(frontSide, fixed, am - 0.6, am + 0.6, 0.6, 2.4, 0.06, spick([0x5a3a28, 0x2a4a6a, 0x8a2a2a, 0x2a5a3a, 0xf0f0f0]));
  glowBuf.face(frontSide, fixed + out * 0.07, am - 0.12, am + 0.12, 1.8, 2.2, 0xffe8b0);
  const pw = 1.9, pd = 1.8;
  outBox(frontSide, fixed, am - pw, am + pw, 0.15, 0.6, pd, 0xb8a890);
  outBox(frontSide, fixed + out * pd, am - 0.8, am + 0.8, 0.15, 0.35, 0.4, 0xb8a890);
  if (srand() < 0.75) {
    slope(propBuf, frontSide, fixed, am - pw - 0.2, am + pw + 0.2, 2.95, 2.55, pd + 0.2, roof);
    for (const e of [am - pw + 0.1, am + pw - 0.25]) outBox(frontSide, fixed + out * (pd - 0.2), e, e + 0.15, 0.6, 2.6, 0.15, trim);
    outBox(frontSide, fixed + out * (pd - 0.2), am - pw, am + pw, 1.4, 1.48, 0.06, trim); // porch rail
  }
  { // path, mailbox, flower beds, hedges
    const P = (o, a) => (frontSide[1] === 'x' ? [fixed + out * o, a] : [a, fixed + out * o]);
    const [p0x, p0z] = P(pd + 0.4, am - 0.5), [p1x, p1z] = P(2.6, am + 0.5);
    propBuf.box(Math.min(p0x, p1x), Math.max(p0x, p1x), 0.15, 0.22, Math.min(p0z, p1z), Math.max(p0z, p1z), 0xc8c0b0);
    const [mx, mz] = P(2.2, am + 1.3);
    propBuf.box(mx - 0.05, mx + 0.05, 0.15, 1.1, mz - 0.05, mz + 0.05, 0x5a4a3a); propBuf.box(mx - 0.2, mx + 0.2, 1.1, 1.4, mz - 0.2, mz + 0.2, spick([0x2a2a2e, 0xc8302a, 0x2a4a9a, 0xe8e8e8]));
    for (const [e0, e1] of [[a0 + 0.3, am - pw - 0.3], [am + pw + 0.3, a1 - 0.3]]) {
      if (e1 - e0 < 0.8) continue;
      const [fx0, fz0] = P(0.15, e0), [fx1, fz1] = P(0.95, e1);
      propBuf.box(Math.min(fx0, fx1), Math.max(fx0, fx1), 0.15, 0.3, Math.min(fz0, fz1), Math.max(fz0, fz1), 0x4a3a2a);
      for (let e = e0 + 0.3; e < e1; e += 0.5) { const [bx, bz] = P(0.55, e); blob(propBuf, bx, 0.3, bz, 0.28, srand() < 0.4 ? spick([0xe04a6a, 0xf0d040, 0xf08ab0, 0x9a4ad0]) : spick(GREENS), 5); }
    }
  }
  if (two && srand() < 0.6) { // dormer window in the roof
    const r = outBox(frontSide, fixed - out * 1.3, am - 0.7, am + 0.7, h, h + 1.3, 0.9, col);
    outBox(frontSide, fixed - out * 0.38, am - 0.4, am + 0.4, h + 0.2, h + 1.1, 0.02, 0x2a3446);
    propBuf.prism(r.x0 - 0.1, r.x1 + 0.1, r.z0 - 0.1, r.z1 + 0.1, h + 1.3, 0.5, roof, frontSide[1] === 'x');
  }
  if (srand() < 0.55) { propBuf.box(x0 + 0.8, x0 + 1.5, h - 1, h + 2.8, z0 + 0.8, z0 + 1.5, 0x8a4a3a); propBuf.box(x0 + 0.7, x0 + 1.6, h + 2.8, h + 2.95, z0 + 0.7, z0 + 1.6, 0x5a3a2a); } // chimney
  if (srand() < 0.35) { const sx = srand() < 0.5 ? x0 + 1.5 : x1 - 1.5; propBuf.box(sx - 0.04, sx + 0.04, h + rh * 0.5, h + rh * 0.5 + 0.6, (z0 + z1) / 2 - 0.04, (z0 + z1) / 2 + 0.04, 0x8a8a8a); propBuf.cyl(sx, (z0 + z1) / 2, 0.08, 0.4, h + rh * 0.5 + 0.5, h + rh * 0.5 + 0.7, 0xdddddd, 8); } // dish
  addRoof(x0, x1, z0, z1, h + rh * 0.55, { city: curCity, house: true, y0: open ? 2.9 : 0 });
}
// back-garden things for the shared yard in the middle of a suburban block
function gardenThing(x, z) {
  const k = srand();
  if (k < 0.2) { // swing set
    for (const s of [-1.3, 1.3]) { propBuf.beam([x + s, 0.2, z - 0.8], [x + s, 2.4, z], 0.08, 0xc8302a); propBuf.beam([x + s, 0.2, z + 0.8], [x + s, 2.4, z], 0.08, 0xc8302a); }
    propBuf.beam([x - 1.4, 2.4, z], [x + 1.4, 2.4, z], 0.1, 0xc8302a);
    for (const s of [-0.6, 0.6]) { propBuf.beam([x + s - 0.2, 2.4, z], [x + s - 0.2, 0.7, z], 0.02, 0x8a8a8a); propBuf.beam([x + s + 0.2, 2.4, z], [x + s + 0.2, 0.7, z], 0.02, 0x8a8a8a); propBuf.box(x + s - 0.25, x + s + 0.25, 0.65, 0.72, z - 0.15, z + 0.15, 0x3a3a3a); }
    addCollider(x - 1.4, x + 1.4, z - 0.1, z + 0.1, 2.5, { y0: 2.3 });
  } else if (k < 0.4) { // trampoline
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) propBuf.box(x + dx - 0.04, x + dx + 0.04, 0.2, 0.8, z + dz - 0.04, z + dz + 0.04, 0x5a5a60);
    propBuf.cyl(x, z, 1.6, 1.6, 0.75, 0.85, 0x2a6ab0, 14); propBuf.cyl(x, z, 1.4, 1.4, 0.851, 0.86, 0x1a1a1a, 14);
    addCollider(x - 1.4, x + 1.4, z - 1.4, z + 1.4, 0.85, { bouncy: true });
  } else if (k < 0.6) { // garden shed (gardenSheds: the market module makes them somewhere to hide)
    gardenSheds.push({ x, z });
    propBuf.box(x - 1.2, x + 1.2, 0.2, 2.2, z - 1, z + 1, spick([0x8a6a4a, 0x5a7a5a, 0x8a8a7a]));
    propBuf.prism(x - 1.35, x + 1.35, z - 1.15, z + 1.15, 2.2, 0.6, 0x3a3a40, true);
    propBuf.face('pz', z + 1.02, x - 0.4, x + 0.4, 0.2, 1.9, 0x5a3a28);
    addCollider(x - 1.2, x + 1.2, z - 1, z + 1, 2.5);
  } else if (k < 0.8) { // barbecue and a picnic table
    propBuf.box(x - 0.9, x + 0.9, 0.7, 0.78, z - 0.4, z + 0.4, 0x8a6a4a); for (const s of [-0.75, 0.75]) propBuf.box(x + s - 0.05, x + s + 0.05, 0.2, 0.7, z - 0.4, z + 0.4, 0x8a6a4a);
    for (const s of [-0.7, 0.7]) propBuf.box(x - 0.9, x + 0.9, 0.42, 0.48, z + s - 0.15, z + s + 0.15, 0x8a6a4a);
    propBuf.cyl(x + 2, z, 0.05, 0.05, 0.2, 0.8, 0x2a2a2a, 6); propBuf.cyl(x + 2, z, 0.35, 0.4, 0.8, 1.05, 0x1a1a1a, 10);
    addCollider(x - 0.9, x + 0.9, z - 0.9, z + 0.9, 0.78);
  } else { // vegetable patch
    for (let r = -1; r <= 1; r++) { propBuf.box(x - 1.6, x + 1.6, 0.2, 0.3, z + r * 0.8 - 0.3, z + r * 0.8 + 0.3, 0x5a3a22); for (let c = -1.4; c <= 1.4; c += 0.45) blob(propBuf, x + c, 0.28, z + r * 0.8, 0.18, spick([0x4a8a3a, 0x5aa02a, 0x3a7a2a]), 5); }
  }
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
  curCity = city;
  citySkeleton(city);
  const mainRow = city.n / 2; // horizontal road through the centre = Main St
  for (const r of blockRects.filter((b) => b.city === city)) {
    const { i, j } = r, ix0 = r.x0 + SW, ix1 = r.x1 - SW, iz0 = r.z0 + SW, iz1 = r.z1 - SW;
    { const ov = siteOverrides.get(blockKey(r.city, r.i, r.j)); if (ov) { ov(r, { ix0: r.x0 + SW, ix1: r.x1 - SW, iz0: r.z0 + SW, iz1: r.z1 - SW }); continue; } }
    const bcx = (r.x0 + r.x1) / 2, bcz = (r.z0 + r.z1) / 2;
    propBuf.box(ix0, ix1, 0.15, 0.2, iz0, iz1, C.grass);
    const onMain = (j === mainRow - 1 || j === mainRow) && i >= 1 && i <= city.n - 2;
    if (onMain) {
      // two-storey brick shop row facing Main St
      const facingZ = j === mainRow - 1 ? 'pz' : 'nz';
      const zA = facingZ === 'pz' ? iz1 - 14 : iz0, zB = facingZ === 'pz' ? iz1 : iz0 + 14;
      let x = ix0;
      while (x < ix1 - 4) {
        let w = Math.min(ix1 - x, sr(7, 11)), h = spick([6, 6, 9]);
        if (ix1 - x - w < 4) w = ix1 - x;
        const L = { x0: x, x1: x + w, z0: zA, z1: zB };
        let base = 0;
        if (w >= 6.5 && lotHooks.walkIn && srand() < 0.55 && lotHooks.walkIn(L, facingZ, city)) { base = 4.6; h = 9; }
        building(spick(BRICK_KEYS), x, x + w, zA, zB, h, { [facingZ]: true }, { base, shops: 1, signs: 0.25, parapet: true, fireEscape: false, mansardChance: 0.3 });
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
      propBuf.box(bcx - 7, bcx + 7, h - 0.2, h, bcz - 7, bcz + 7, 0x6a7a88); // catwalk
      addRoof(bcx - 7, bcx + 7, bcz - 7, bcz + 7, h, { city, y0: h - 0.3, catwalk: true });
      const tank = addRoof(bcx - 4.2, bcx + 4.2, bcz - 4.2, bcz + 4.2, h + 8, { city, y0: h, landmark: true });
      forcedLadders.push({ roof: { x0: bcx - 3.25, x1: bcx + 3.25, z0: bcz - 3.25, z1: bcz + 3.25, h }, x: bcx + 3.25 + 0.3, z: bcz - 3, nx: 1, nz: 0, y0: 0 });
      forcedLadders.push({ roof: tank, x: bcx + 4.2 + 0.25, z: bcz + 0.5, nx: 1, nz: 0, y0: h });
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
    if (srand() < 0.5) { propBuf.box(bcx - 2.7, bcx + 2.7, 0.2, 0.32, bcz - 1.7, bcz + 1.7, 0xd8d0c0); propBuf.box(bcx - 2.5, bcx + 2.5, 0.2, 0.3, bcz - 1.5, bcz + 1.5, 0x4a90c0); } // pool
    else addTree(bcx, bcz, 1.6);
    for (const [gx, gz] of [[ix0 + 15.5, iz0 + 15.5], [ix1 - 15.5, iz1 - 15.5], [ix1 - 15.5, iz0 + 15.5]]) if (srand() < 0.75) gardenThing(gx, gz);
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
  curCity = city;
  citySkeleton(city);
  for (const r of blockRects.filter((b) => b.city === city)) {
    const { i, j } = r, ix0 = r.x0 + SW, ix1 = r.x1 - SW, iz0 = r.z0 + SW, iz1 = r.z1 - SW;
    { const ov = siteOverrides.get(blockKey(r.city, r.i, r.j)); if (ov) { ov(r, { ix0: r.x0 + SW, ix1: r.x1 - SW, iz0: r.z0 + SW, iz1: r.z1 - SW }); continue; } }
    const bcx = (r.x0 + r.x1) / 2, bcz = (r.z0 + r.z1) / 2;
    propBuf.box(ix0, ix1, 0.15, 0.17, iz0, iz1, 0x5e5b58);
    const st = (x0, x1, z0, z1) => streetFaces(x0, x1, z0, z1, ix0, ix1, iz0, iz1);
    const kind = j === city.n - 1 ? 'yard' : spick(['warehouse', 'warehouse', 'yard', 'tanks', 'factory', 'row', 'row']);
    if (kind === 'row') { // old harbour terrace: pubs, chippies and flats around a yard
      perimeterBlock({ ix0, ix1, iz0, iz1 }, { h: [6, 13], key: () => (srand() < 0.85 ? spick(BRICK_KEYS) : spick(OFFICE_KEYS)), walkIn: 0.8, signs: 0.15, turret: 0.1, shops: 0.6 });
      if ((i + j) % 2 === 0) addStreetLight(r.x0 + 0.7, r.z0 + 0.7, -1, 0, C.sodium, 8); else addStreetLight(r.x1 - 0.7, r.z1 - 0.7, 1, 0, C.sodium, 8);
      continue;
    }
    if (kind === 'warehouse') {
      const split = srand() < 0.5, tint = spick([0xb0503a, 0x6a7a8a, 0x5a7a5a, 0xc8b890, 0x8a8a90]);
      const parts = split ? [[ix0, ix1, iz0, (iz0 + iz1) / 2 - 2], [ix0, ix1, (iz0 + iz1) / 2 + 2, iz1]] : [[ix0, ix1, iz0, iz1]];
      for (const [x0, x1, z0, z1] of parts) {
        const h = Math.round(sr(8, 14));
        // most warehouses are hollow sheds you can walk into (docks.js); the rest stay solid
        if (lotHooks.warehouse && srand() < 0.85 && lotHooks.warehouse({ x0, x1, z0, z1 }, h, tint, st(x0, x1, z0, z1), curCity)) continue;
        facadeBox('metal', x0, x1, 0, h, z0, z1, tint);
        propBuf.prism(x0, x1, z0, z1, h, 2, 0x6a6a70, true);
        addRoof(x0, x1, z0, z1, h + 1, { city: curCity, shed: true });
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
        while (x < ix1 - 3) {
          const lv = Math.floor(sr(1, 4.99));
          for (let l = 0; l < lv; l++) container(x, z, l, true, spick(CONTAINER_COLORS));
          rowH.push(lv); addRoof(x - 3, x + 3, z - 1.22, z + 1.22, 0.15 + lv * 2.6, { city: curCity, stack: true }); x += 6.3;
        }
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
    const top = addRoof(x - 6, x + 6, qz - 7, qz + 3, 28, { city, y0: 26, crane: true });
    forcedLadders.push({ roof: top, x: x - 5, z: qz - 6.7 - 0.35, nx: 0, nz: -1, y0: 0 });
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
const fieldRects = [];
export let fieldCount = 0;
function hedgerow(x0, x1, z0, z1) {
  const gapSide = Math.floor(srand() * 4), g = spick(GREENS);
  const seg = (ax0, ax1, az0, az1) => { propBuf.box(ax0, ax1, 0, 1.8, az0, az1, g); addCollider(ax0, ax1, az0, az1, 1.8); };
  const gap = (a0, a1) => { const m = (a0 + a1) / 2; return [[a0, m - 3], [m + 3, a1]]; };
  const sides = [['z', z0], ['z', z1], ['x', x0], ['x', x1]];
  sides.forEach(([ax, f], i) => {
    const spans = i === gapSide ? (ax === 'z' ? gap(x0, x1) : gap(z0, z1)) : [ax === 'z' ? [x0, x1] : [z0, z1]];
    for (const [a, b] of spans) if (ax === 'z') seg(a, b, f - 0.6, f + 0.6); else seg(f - 0.6, f + 0.6, a, b);
  });
  for (let t = 0; t < 4; t++) addTree(srand() < 0.5 ? (srand() < 0.5 ? x0 : x1) : sr(x0, x1), srand() < 0.5 ? sr(z0, z1) : (srand() < 0.5 ? z0 : z1), sr(1.4, 2.2));
}
function fence(x0, x1, z0, z1) {
  const col = 0x8a6a4a;
  for (const [ax, f, a0, a1] of [['z', z0, x0, x1], ['z', z1, x0, x1], ['x', x0, z0, z1], ['x', x1, z0, z1]]) {
    for (let a = a0; a <= a1; a += 3) { if (ax === 'z') propBuf.box(a - 0.08, a + 0.08, 0, 1.1, f - 0.08, f + 0.08, col); else propBuf.box(f - 0.08, f + 0.08, 0, 1.1, a - 0.08, a + 0.08, col); }
    for (const y of [0.45, 0.9]) { if (ax === 'z') propBuf.box(a0, a1, y, y + 0.1, f - 0.04, f + 0.04, col); else propBuf.box(f - 0.04, f + 0.04, y, y + 0.1, a0, a1, col); }
  }
}
function scarecrow(x, z) {
  propBuf.box(x - 0.08, x + 0.08, 0, 2.2, z - 0.08, z + 0.08, 0x6a4a2a);
  propBuf.box(x - 0.9, x + 0.9, 1.55, 1.7, z - 0.06, z + 0.06, 0x6a4a2a);
  propBuf.box(x - 0.35, x + 0.35, 1.1, 1.75, z - 0.2, z + 0.2, spick([0x8a3a3a, 0x3a5a8a, 0x6a6a3a]));
  propBuf.box(x - 0.2, x + 0.2, 1.75, 2.15, z - 0.2, z + 0.2, 0xd8c080);
  propBuf.cyl(x, z, 0.45, 0, 2.15, 2.5, 0xb89050, 8, false);
}
function farmstead(x, z, front) {
  // farmhouse, red barn, silo, sheds, a tractor and a muddy yard; lots of corners to break line of sight
  for (const [cx, cz] of [[x - 34, z - 26], [x + 54, z - 26], [x - 34, z + 30], [x + 54, z + 30], [x + 10, z]]) if (cityAt(cx, cz, 12)) return; // never on top of a town
  groundBuf.flat(x - 30, x + 50, z - 22, z + 26, 0.009, 0x7a6a50);
  fieldRects.push({ x0: x - 34, x1: x + 54, z0: z - 26, z1: z + 30 });
  house(x, x + 10, z, z + 8, front);
  facadeBox('metal', x + 18, x + 34, 0, 7, z - 6, z + 12, 0xb03a2a); propBuf.prism(x + 18, x + 34, z - 6, z + 12, 7, 4, 0x5a5a60, false);
  addRoof(x + 18, x + 34, z - 6, z + 12, 9, { shed: true });
  propBuf.face('nz', z - 6.05, x + 23, x + 29, 0, 5, 0x3a2a20);
  propBuf.cyl(x + 40, z + 2, 3, 3, 0, 14, 0xc8c8c0, 12); propBuf.cyl(x + 40, z + 2, 3.1, 0, 14, 16, 0x8a8a90, 12, false); addCollider(x + 37.5, x + 42.5, z - 0.5, z + 4.5, 16);
  for (const [sx, sz] of [[x - 14, z + 14], [x + 4, z + 18]]) { facadeBox('metal', sx, sx + 7, 0, 3.2, sz, sz + 5, spick([0x8a8a90, 0x6a7a5a, 0x9a7a5a])); roofBuf.flat(sx, sx + 7, sz, sz + 5, 3.2, 0x5a5a60); addRoof(sx, sx + 7, sz, sz + 5, 3.2, { shed: true }); }
  // tractor
  const tx = x + 12, tz = z - 14;
  propBuf.box(tx - 1, tx + 1, 0.6, 1.6, tz - 1.6, tz + 1.4, 0x2a7a3a); propBuf.box(tx - 0.8, tx + 0.8, 1.6, 2.7, tz - 1.4, tz - 0.1, 0x2a3a2a);
  for (const s of [-1, 1]) { propBuf.box(tx + s * 1.1 - 0.25, tx + s * 1.1 + 0.25, 0, 1.6, tz - 1.6, tz - 0.2, 0x151515); propBuf.box(tx + s * 1.05 - 0.2, tx + s * 1.05 + 0.2, 0, 0.9, tz + 0.6, tz + 1.5, 0x151515); }
  addCollider(tx - 1.35, tx + 1.35, tz - 1.7, tz + 1.6, 2.7);
  // hay stack, troughs, wood piles
  for (let k = 0; k < 6; k++) { const bx = x - 20 + (k % 3) * 1.9, bz = z - 6 + Math.floor(k / 3) * 1.9; propBuf.box(bx - 0.9, bx + 0.9, 0, 1.8, bz - 0.9, bz + 0.9, 0xd8b860); }
  addCollider(x - 21, x - 15.3, z - 7, z - 3.2, 1.8);
  propBuf.box(x - 20, x - 16, 1.8, 3.6, z - 6, z - 4, 0xd0b058); addCollider(x - 20, x - 16, z - 6, z - 4, 3.6);
  for (let k = 0; k < 2; k++) { const wx = x + 44 + k * 3, wz = z + 16; propBuf.box(wx - 1.2, wx + 1.2, 0, 0.7, wz - 0.5, wz + 0.5, 0x5a5a60); addCollider(wx - 1.2, wx + 1.2, wz - 0.5, wz + 0.5, 0.7); }
  fence(x - 30, x + 50, z - 22, z + 26);
  for (let k = 0; k < 6; k++) addTree(sr(x - 28, x + 48), srand() < 0.5 ? z + sr(20, 25) : z - sr(17, 21), sr(1.5, 2.4));
}
function motel(x, z) {
  fieldRects.push({ x0: x - 4, x1: x + 34, z0: z - 36, z1: z + 40 });
  // a long single-storey motel with a lit sign, facing Route 4
  building('brick1', x, x + 14, z - 30, z + 30, 4.5, { px: true }, { shops: 1, signs: 0 });
  propBuf.box(x + 14, x + 17, 3.2, 3.5, z - 30, z + 30, 0x5a3a28);
  for (let k = 0; k < 6; k++) parkedSpots.push({ x: x + 22, z: z - 25 + k * 9, heading: Math.PI / 2 });
  const t = textTex(256, 256, '#2a1a3a', '#6af0ff', ['MOTEL', 'VACANCY'], 'bold 56px Georgia, serif');
  staticMesh(new THREE.BoxGeometry(4, 4, 0.4), new THREE.MeshBasicMaterial({ map: t }), x + 26, 8, z + 34, Math.PI / 2);
  propBuf.box(x + 25.8, x + 26.2, 0, 6, z + 33.8, z + 34.2, C.pole);
  propBuf.box(x + 10, x + 30, 0.01, 0.04, z - 32, z + 32, 0x4a4850);
}
function truckStop(x, z) {
  fieldRects.push({ x0: x - 34, x1: x + 34, z0: z - 44, z1: z - 6 });
  propBuf.box(x - 30, x + 30, 0.01, 0.05, z - 26, z - 10, 0x4a4850);
  building('metal', x - 12, x + 12, z - 40, z - 28, 6, { pz: true }, { shops: 1, signs: 0, tint: 0x8a9aa8 });
  for (let k = 0; k < 3; k++) {
    const tx = x - 22 + k * 16, tz = z - 18;
    propBuf.box(tx - 1.3, tx + 1.3, 0.5, 4, tz - 7, tz + 4, spick(CONTAINER_COLORS)); propBuf.box(tx - 1.2, tx + 1.2, 0.5, 3.2, tz + 4.3, tz + 7, 0xd0d0d0);
    addCollider(tx - 1.3, tx + 1.3, tz - 7, tz + 7, 4, { stack: true }); roofs.push(colliders[colliders.length - 1]);
  }
}
function genCountryside() {
  curCity = null;
  // river crossing Route 4, with a bridge
  const bridgesX = HIGHWAYS.filter((h) => h.axis === 'z' && h.a0 < RIVER.z0 && h.a1 > RIVER.z1).map((h) => h.fixed).sort((a, b) => a - b);
  let rx = WORLD.minX - 200;
  for (const bx of [...bridgesX, WORLD.maxX + 209]) {
    const x0 = rx, x1 = bx - 9;
    waterBuf.flat(x0, x1, RIVER.z0, RIVER.z1, 0.03, 0x2f6e8e);
    addCollider(x0, x1, RIVER.z0 + 0.5, RIVER.z1 - 0.5, 0.2, { water: true });
    waterRects.push({ x0, x1, z0: RIVER.z0, z1: RIVER.z1 });
    propBuf.box(x0, x1, 0, 0.3, RIVER.z0 - 2.5, RIVER.z0, 0x7a6a50); propBuf.box(x0, x1, 0, 0.3, RIVER.z1, RIVER.z1 + 2.5, 0x7a6a50); // muddy banks
    rx = bx + 9;
  }
  for (const bx of bridgesX) {
    propBuf.box(bx - 9, bx + 9, 0, 0.5, RIVER.z0 - 2, RIVER.z1 + 2, 0x8a8680);
    for (const s of [-1, 1]) { propBuf.box(bx + s * 9 - 0.2, bx + s * 9 + 0.2, 0.5, 1.6, RIVER.z0 - 2, RIVER.z1 + 2, 0x6a6660); addCollider(bx + s * 9 - 0.25, bx + s * 9 + 0.25, RIVER.z0 - 2, RIVER.z1 + 2, 1.6); }
    for (const s of [-1, 1]) { propBuf.box(bx + s * 9 - 0.3, bx + s * 9 + 0.3, 0, 6, (RIVER.z0 + RIVER.z1) / 2 - 0.3, (RIVER.z0 + RIVER.z1) / 2 + 0.3, 0x5a5650); }
  }
  // reeds and a few rowing boats along the river
  for (let k = 0; k < 140; k++) { const x = sr(WORLD.minX, WORLD.maxX), z = srand() < 0.5 ? RIVER.z0 - sr(0.5, 3) : RIVER.z1 + sr(0.5, 3); if (bridgesX.some((b) => Math.abs(b - x) < 14)) continue; propBuf.box(x - 0.08, x + 0.08, 0, sr(0.8, 1.6), z - 0.08, z + 0.08, spick([0x6a7a3a, 0x8a8a4a, 0x5a6a2a])); }
  // sea along the south
  waterBuf.flat(WORLD.minX - 600, WORLD.maxX + 600, SEA_Z - 1, SEA_Z + 900, 0.02, 0x2a5f82);
  addCollider(WORLD.minX - 600, WORLD.maxX + 600, SEA_Z, SEA_Z + 900, 0.2, { water: true });
  waterRects.push({ x0: WORLD.minX - 600, x1: WORLD.maxX + 600, z0: SEA_Z, z1: SEA_Z + 900 });
  // farmsteads first so fields and woods fill in around them
  farmstead(380, 60, 'nz'); farmstead(330, -150, 'pz'); farmstead(430, 250, 'nz'); farmstead(-220, 160, 'px');
  farmstead(250, 560, 'nx'); farmstead(520, 520, 'nz'); farmstead(880, 330, 'nx'); farmstead(-220, -200, 'pz');
  // roadside stops: a diner and a motel on Route 4, a truck stop on Route 9, a gas station on Old Farm Rd
  building('brick4', 22, 40, 300, 312, 4.5, { nx: true }, { shops: 1, signs: 0 });
  const dt = textTex(256, 128, '#1a2a4a', '#ff5ab0', ['DINER', 'EAT HERE'], 'bold 52px Georgia, serif');
  staticMesh(new THREE.BoxGeometry(5, 2.5, 0.3), new THREE.MeshBasicMaterial({ map: dt }), 18, 8, 306, Math.PI / 2);
  propBuf.box(17.85, 18.15, 0, 6.8, 305.85, 306.15, C.pole);
  for (let k = 0; k < 3; k++) parkedSpots.push({ x: 16, z: 298 + k * 6, heading: 0 });
  motel(-48, 470);
  truckStop(380, -40);
  gasStation(ASH.cx + 30, 560);
  // farm fields with hedgerows (good cover), hay bales and scarecrows
  for (let k = 0; k < 600; k++) {
    const x = sr(WORLD.minX, WORLD.maxX), z = sr(WORLD.minZ, WORLD.maxZ), w = sr(26, 60), d = sr(22, 48);
    if (onReserved(x, z, 14) || onReserved(x + w, z + d, 14) || onReserved(x + w, z, 14) || onReserved(x, z + d, 14)) continue;
    if (fieldRects.some((f) => x < f.x1 + 6 && x + w > f.x0 - 6 && z < f.z1 + 6 && z + d > f.z0 - 6)) continue;
    fieldRects.push({ x0: x, x1: x + w, z0: z, z1: z + d }); fieldCount++;
    const col = spick([0xc8b45a, 0x8a6a3a, 0x6a9a3a, 0xa8c060, 0x7a5a2a, 0x9aa848]);
    groundBuf.flat(x, x + w, z, z + d, 0.008, col);
    const ploughed = col === 0x8a6a3a || col === 0x7a5a2a;
    if (ploughed) for (let r = z + 2; r < z + d; r += 3) markBuf.flat(x, x + w, r, r + 0.5, 0.012, 0x6a4a28);
    else if (col === 0xc8b45a || col === 0x9aa848) { // tall crops you can duck through
      for (let r = z + 2; r < z + d - 1; r += 2.2) propBuf.box(x + 1.5, x + w - 1.5, 0, 1.15, r, r + 0.9, col === 0xc8b45a ? 0xd8c060 : 0x7a9a38);
    }
    const kind = srand();
    if (kind < 0.6) hedgerow(x, x + w, z, z + d); else fence(x, x + w, z, z + d);
    if (!ploughed && srand() < 0.45) for (let b = 0; b < 3 + Math.floor(srand() * 5); b++) { const bx = sr(x + 4, x + w - 4), bz = sr(z + 4, z + d - 4); propBuf.cyl(bx, bz, 0.9, 0.9, 0, 1.5, 0xd8b860, 10); addCollider(bx - 0.75, bx + 0.75, bz - 0.75, bz + 0.75, 1.5); }
    if (srand() < 0.15) scarecrow(x + w / 2, z + d / 2);
  }
  // woods: dense groves you can lose people in
  for (let k = 0; k < 34; k++) {
    const cx = sr(WORLD.minX + 20, WORLD.maxX - 20), cz = sr(WORLD.minZ + 20, RIVER.z0 + 200);
    if (onReserved(cx, cz, 25) || fieldRects.some((f) => cx > f.x0 - 15 && cx < f.x1 + 15 && cz > f.z0 - 15 && cz < f.z1 + 15)) continue;
    const R = sr(14, 30), n = Math.floor(R * 1.3);
    for (let t = 0; t < n; t++) { const a = srand() * Math.PI * 2, r = Math.sqrt(srand()) * R, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (!onReserved(x, z, 4)) addTree(x, z, sr(1.3, 2.4)); }
    for (let t = 0; t < n / 2; t++) { const a = srand() * Math.PI * 2, r = Math.sqrt(srand()) * R, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (!onReserved(x, z, 4)) propBuf.box(x - 0.8, x + 0.8, 0, sr(0.6, 1.1), z - 0.8, z + 0.8, spick(GREENS)); }
  }
  // telegraph poles along every road out of town
  for (const h of HIGHWAYS) for (let a = h.a0 + 10; a < h.a1 - 10; a += 32) {
    const x = h.axis === 'x' ? a : h.fixed + 11.5, z = h.axis === 'x' ? h.fixed - 11.5 : a;
    propBuf.box(x - 0.13, x + 0.13, 0, 7.5, z - 0.13, z + 0.13, 0x5a4030);
    if (h.axis === 'x') propBuf.box(x - 0.06, x + 0.06, 6.9, 7.05, z - 1, z + 1, 0x5a4030); else propBuf.box(x - 1, x + 1, 6.9, 7.05, z - 0.06, z + 0.06, 0x5a4030);
    addCollider(x - 0.18, x + 0.18, z - 0.18, z + 0.18, 7.5);
  }
  // dry stone walls and hedges lining the country roads
  for (const h of HIGHWAYS) for (let a = h.a0 + 30; a < h.a1 - 40; a += sr(60, 110)) {
    const len = sr(25, 50), side = srand() < 0.5 ? -1 : 1, off = side * sr(14, 18);
    const x0 = h.axis === 'x' ? a : h.fixed + off - 0.5, x1 = h.axis === 'x' ? a + len : h.fixed + off + 0.5;
    const z0 = h.axis === 'x' ? h.fixed + off - 0.5 : a, z1 = h.axis === 'x' ? h.fixed + off + 0.5 : a + len;
    if (srand() < 0.5) { propBuf.box(x0, x1, 0, 1.1, z0, z1, 0x8a8478); addCollider(x0, x1, z0, z1, 1.1); }
    else { propBuf.box(x0, x1, 0, 1.7, z0, z1, spick(GREENS)); addCollider(x0, x1, z0, z1, 1.7); }
  }
  // wildflowers and grass tufts so the open ground isn't a flat green sheet
  for (let k = 0; k < 220; k++) { // meadow patches in different greens
    const x = sr(WORLD.minX, WORLD.maxX), z = sr(WORLD.minZ, WORLD.maxZ), w = sr(15, 50), d = sr(15, 50);
    if (onReserved(x, z, 2) || onReserved(x + w, z + d, 2)) continue;
    groundBuf.flat(x, x + w, z, z + d, 0.004, spick([0x557a40, 0x628a48, 0x4e7038, 0x6a8a4a, 0x5d7d3a]));
  }
  for (let k = 0; k < 9000; k++) {
    const x = sr(WORLD.minX, WORLD.maxX), z = sr(WORLD.minZ, WORLD.maxZ);
    if (onReserved(x, z, 2)) continue;
    const col = srand() < 0.75 ? spick([0x5f8a40, 0x6f9a48, 0x4f7a38, 0x7a9a50]) : spick([0xe8e070, 0xe07070, 0xf0f0f0, 0xb080e0]);
    const s = col > 0x900000 ? 0.1 : sr(0.3, 0.75);
    propBuf.box(x - s, x + s, 0, s * sr(0.8, 1.6), z - s, z + s, col);
  }
  // wind turbines
  for (let k = 0; k < 6; k++) {
    const x = -270 + (k % 3) * 60, z = 290 + Math.floor(k / 3) * 120 + sr(-15, 15);
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
  for (let k = 0; k < 1100; k++) {
    let x = sr(WORLD.minX, WORLD.maxX), z = sr(WORLD.minZ, WORLD.maxZ);
    if (srand() < 0.6) { const h = spick(HIGHWAYS), a = sr(h.a0, h.a1), c = sr(14, 40) * (srand() < 0.5 ? -1 : 1); x = h.axis === 'x' ? a : h.fixed + c; z = h.axis === 'x' ? h.fixed + c : a; }
    if (onReserved(x, z, 6)) continue;
    if (srand() < 0.12) { const s = sr(0.8, 2.2); propBuf.box(x - s, x + s, 0, s * 1.2, z - s * 0.8, z + s * 0.8, spick([0x7a7670, 0x8a8478, 0x6a6660])); addCollider(x - s, x + s, z - s * 0.8, z + s * 0.8, s * 1.2); }
    else addTree(x, z, sr(1.2, 2.2));
  }
  // distant hills on the horizon (scenery only)
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2, d = sr(1000, 1300);
    const x = 350 + Math.cos(a) * d, z = 330 + Math.sin(a) * d;
    if (z > SEA_Z + 100) continue;
    const r = sr(150, 320), h = sr(60, 180);
    propBuf.cyl(x, z, r, 0, 0, h, spick([0x4a6a4a, 0x5a7050, 0x6a7a5a]), 7, false);
  }
}

// ---------------------------------------------------------------------
export const lanes = [];
export const baked = {}; // the big merged meshes, for weather and power cuts to tweak
export function generateWorld() {
  const gb = new GeoBuf();
  // grass everywhere except under the towns (no overlapping ground planes to z-fight), cut into tiles so
  // no single triangle is huge (big triangles lose depth precision and the grass shows through the road)
  const cityCut = CITIES.map((c) => ({ x0: c.minX - 3, x1: c.maxX + 3, z0: c.minZ - 3, z1: c.maxZ + 3 }));
  for (const q of rectMinus({ x0: -2650, x1: 3350, z0: -2670, z1: 3330 }, [...groundHoles, ...cityCut])) tiledFlat(gb, q, 0, 0x5a7d45, 120);
  baked.grass = gb.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  genMetro(PH); genSuburb(ASH); genIndustrial(DOCKS);
  for (const h of HIGHWAYS) genHighway(h);
  genCountryside();
  // street dressing runs with provisional collision buckets so it can avoid what's already there
  buildBuckets();
  for (const f of worldHooks.afterGen) f();
  for (const b of buckets) b.length = 0;
  for (const f of worldHooks.beforeBake) f();
  for (const f of Object.values(FAC)) f.buf.build(f.mat);
  roofBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  propBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  baked.glow = glowBuf.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  baked.sign = signBuf.build(new THREE.MeshBasicMaterial({ map: signAtlas }));
  baked.shop = shopBuf.build(new THREE.MeshBasicMaterial({ map: shopTex, vertexColors: true }));
  baked.mark = markBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  baked.ground = groundBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  waterBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0a1a2a }));
  lanes.push(...laneMap.values());
  buildBuckets();
  genParkour();
  for (const f of worldHooks.afterBake) f();
}

// ---------------------------------------------------------------------
// Parkour routes: ladders up the sides of buildings and ziplines between rooftops
// ---------------------------------------------------------------------
export function placeLadder(buf, L) {
  const px = -L.nz, pz = L.nx; // along the wall
  for (const s of [-0.28, 0.28]) { const x = L.x + px * s, z = L.z + pz * s; buf.box(x - 0.04, x + 0.04, L.y0, L.y1 + 1, z - 0.04, z + 0.04, 0x3a3c42); }
  for (let y = L.y0 + 0.35; y < L.y1 + 0.9; y += 0.38) buf.beam([L.x - px * 0.28, y, L.z - pz * 0.28], [L.x + px * 0.28, y, L.z + pz * 0.28], 0.045, 0x5a5c62);
  ladders.push(L);
  links.push({ a: { x: L.x + L.nx * 0.3, y: L.y0, z: L.z + L.nz * 0.3 }, b: { x: L.x - L.nx * 1.1, y: L.y1, z: L.z - L.nz * 1.1 }, kind: 'ladder', ladder: L });
}
function tryLadderOn(r, buf) {
  for (let t = 0; t < 8; t++) {
    const side = Math.floor(srand() * 4), w = r.x1 - r.x0, d = r.z1 - r.z0;
    const nx = side === 0 ? 1 : side === 1 ? -1 : 0, nz = side === 2 ? 1 : side === 3 ? -1 : 0;
    const len = nx ? d : w; if (len < 3.5) continue;
    const a = sr(1.2, len - 1.2);
    const x = nx ? (nx > 0 ? r.x1 + 0.3 : r.x0 - 0.3) : r.x0 + a, z = nz ? (nz > 0 ? r.z1 + 0.3 : r.z0 - 0.3) : r.z0 + a;
    if (pointBlocked(x, z, 0.12) || pointBlocked(x + nx * 0.8, z + nz * 0.8, 0.2)) continue;
    if (keepClear.some((k) => x > k.x0 - 0.5 && x < k.x1 + 0.5 && z > k.z0 - 0.5 && z < k.z1 + 0.5)) continue;
    if (stackTop(x - nx * 0.6, z - nz * 0.6, r.h - 0.5) > r.h + 1.2) continue; // something tall right at the top
    placeLadder(buf, { x, z, nx, nz, y0: 0, y1: r.h, roof: r });
    return true;
  }
  return false;
}
function genParkour() {
  const buf = new GeoBuf();
  for (const f of forcedLadders) placeLadder(buf, { x: f.x, z: f.z, nx: f.nx, nz: f.nz, y0: f.y0, y1: f.roof.h, roof: f.roof });
  const hasLadder = new Set(ladders.map((l) => l.roof));
  for (const r of roofs) {
    if (r.house || r.stack || r.landmark || r.crane || r.catwalk || r.noLadder || r.h < 4.5 || r.h > 45 || !r.city) continue;
    const chance = r.city.style === 'metro' ? 0.35 : r.city.style === 'industrial' ? 0.55 : 0.6;
    if (srand() < chance && tryLadderOn(r, buf)) hasLadder.add(r);
  }
  // ziplines: from a higher roof to a lower one across a street or yard
  const cap = { metro: 26, suburb: 9, industrial: 16 }, used = new Map();
  for (const city of CITIES) {
    const rs = roofs.filter((r) => r.city === city && !r.catwalk && r.h >= 3);
    const pairs = [];
    for (const A of rs) {
      if (A.house || A.stack || A.h < 8 || A.h > 60) continue;
      for (const B of rs) {
        if (B === A || B.h > A.h - 4) continue;
        const acx = (A.x0 + A.x1) / 2, acz = (A.z0 + A.z1) / 2, bcx = (B.x0 + B.x1) / 2, bcz = (B.z0 + B.z1) / 2;
        const cd = Math.hypot(bcx - acx, bcz - acz); if (cd < 26 || cd > 90) continue;
        pairs.push([A, B, srand()]);
      }
    }
    pairs.sort((p, q) => p[2] - q[2]);
    let n = 0;
    for (const [A, B] of pairs) {
      if (n >= cap[city.style]) break;
      if ((used.get(A) || 0) >= 2 || (used.get(B) || 0) >= 2) continue;
      const bcx = (B.x0 + B.x1) / 2, bcz = (B.z0 + B.z1) / 2, acx = (A.x0 + A.x1) / 2, acz = (A.z0 + A.z1) / 2;
      const ia = (lo, hi, k) => Math.min(k, (hi - lo) / 2);
      const ax = clamp(bcx, A.x0 + ia(A.x0, A.x1, 1.6), A.x1 - ia(A.x0, A.x1, 1.6)), az = clamp(bcz, A.z0 + ia(A.z0, A.z1, 1.6), A.z1 - ia(A.z0, A.z1, 1.6));
      const bx = clamp(acx, B.x0 + ia(B.x0, B.x1, 1.2), B.x1 - ia(B.x0, B.x1, 1.2)), bz = clamp(acz, B.z0 + ia(B.z0, B.z1, 1.2), B.z1 - ia(B.z0, B.z1, 1.2));
      const a = { x: ax, y: A.h + 3.3, z: az }, b = { x: bx, y: B.h + 2.2, z: bz };
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), hd = Math.hypot(b.x - a.x, b.z - a.z);
      const slope = (a.y - b.y) / hd;
      if (hd < 22 || slope < 0.07 || slope > 0.5) continue;
      if (stackTop(ax, az, A.h - 0.1, 0.8) > A.h + 0.8 || stackTop(bx, bz, B.h - 0.1, 0.8) > B.h + 0.8) continue;
      let clear = true;
      for (let s = 1.5; s < hd - 1.5 && clear; s += 1.5) {
        const t = s / hd, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t);
        const inA = x > A.x0 && x < A.x1 && z > A.z0 && z < A.z1, inB = x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
        for (const c of bucketAt(x, z)) {
          if (c.water || x < c.x0 - 0.6 || x > c.x1 + 0.6 || z < c.z0 - 0.6 || z > c.z1 + 0.6) continue;
          if ((inA && (c === A || c.y0 >= A.h - 0.01) && c.h <= A.h + 0.75) || (inB && (c === B || c.y0 >= B.h - 0.01) && c.h <= B.h + 0.75)) continue;
          if (c.h > y - 2.1 && c.y0 < y + 0.3) { clear = false; break; }
        }
      }
      if (!clear) continue;
      if (!hasLadder.has(A) && !A.crane && (A.noLadder || !tryLadderOn(A, buf))) continue;
      hasLadder.add(A);
      used.set(A, (used.get(A) || 0) + 1); used.set(B, (used.get(B) || 0) + 1); n++;
      ziplines.push({ a, b, len, hd, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, dz: (b.z - a.z) / len, A, B });
      buf.beam([a.x, a.y, a.z], [b.x, b.y, b.z], 0.05, 0x1c1c20);
      for (const [p, base] of [[a, A.h], [b, B.h]]) {
        buf.box(p.x - 0.1, p.x + 0.1, base, p.y + 0.25, p.z - 0.1, p.z + 0.1, 0xd0a020);
        buf.box(p.x - 0.35, p.x + 0.35, base, base + 0.12, p.z - 0.35, p.z + 0.35, 0x3a3a40);
        addCollider(p.x - 0.12, p.x + 0.12, p.z - 0.12, p.z + 0.12, p.y + 0.25, { y0: base, pole: true });
      }
    }
  }
  buf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  // anchor poles were added after bucketing
  colliders.slice(-ziplines.length * 2).forEach((c) => { const b = bucketAt(c.x0, c.z0); if (!b.includes(c)) b.push(c); });
}
export function ladderNear(x, z, y, r = 0.75) {
  for (const L of ladders) {
    const dx = x - L.x, dz = z - L.z;
    if (Math.abs(dx) > 1.5 || Math.abs(dz) > 1.5) continue;
    const along = Math.abs(dx * -L.nz + dz * L.nx), out = dx * L.nx + dz * L.nz;
    if (along < 0.55 && out > -0.2 && out < r && y >= L.y0 - 0.6 && y < L.y1 - 0.3) return L;
  }
  return null;
}
// standing at the top of a ladder, walking toward the drop: climb down onto it
export function ladderTopNear(x, z, y) {
  for (const L of ladders) {
    const dx = x - L.x, dz = z - L.z;
    if (Math.abs(dx) > 2 || Math.abs(dz) > 2 || Math.abs(y - L.y1) > 0.35) continue;
    const along = Math.abs(dx * -L.nz + dz * L.nx), out = dx * L.nx + dz * L.nz;
    if (along < 0.6 && out > -1.7 && out < -0.3) return L;
  }
  return null;
}
// closest zipline whose cable passes near a hand position (x, y, z); returns {zip, s}
export function zipNear(x, y, z, maxD = 1.4) {
  let best = null, bd = maxD;
  for (const Z of ziplines) {
    const px = x - Z.a.x, py = y - Z.a.y, pz = z - Z.a.z;
    const s = px * Z.dx + py * Z.dy + pz * Z.dz;
    if (s < -1 || s > Z.len - 4) continue;
    const cx = Z.a.x + Z.dx * s - x, cy = Z.a.y + Z.dy * s - y, cz = Z.a.z + Z.dz * s - z, d = Math.hypot(cx, cy, cz);
    if (d < bd) { bd = d; best = { zip: Z, s: Math.max(0, s) }; }
  }
  return best;
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
export const STEP = 0.4; // anything lower than this above your feet you just walk onto
// does collider c block a body whose feet are at feetY and is `tall` metres tall?
export function blocksBody(c, feetY, tall) {
  if (c.water) return feetY < c.h + 0.3 && feetY > -1;
  return c.h > feetY + STEP && c.y0 < feetY + tall;
}
export function resolveCircle(p, r) { return resolveBody(p, r, 0, 2); }
export function resolveBody(p, r, feetY, tall = 1.8) {
  let hit = false;
  for (const c of bucketAt(p.x, p.z)) {
    if (!blocksBody(c, feetY, tall)) continue;
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
// highest surface you could be standing on at (x, z) given your feet are at feetY (snaps up small steps)
export const DEEP = -60;
export function floorAt(x, z, feetY, r = 0.25) {
  let f = feetY < -0.6 ? DEEP : groundY(x, z);
  for (const c of bucketAt(x, z)) {
    if (c.water || c.h > feetY + STEP || c.h <= f) continue;
    if (x + r < c.x0 || x - r > c.x1 || z + r < c.z0 || z - r > c.z1) continue;
    f = c.h;
  }
  return f;
}
// top of the solid stack at a point, starting from feetY (a roof plus its parapet counts as one ledge)
export function stackTop(x, z, feetY, pad = 0.05) {
  let top = -1, changed = true;
  const list = bucketAt(x, z);
  while (changed) {
    changed = false;
    for (const c of list) {
      if (c.water || c.h <= Math.max(top, feetY + STEP) || x < c.x0 - pad || x > c.x1 + pad || z < c.z0 - pad || z > c.z1 + pad) continue;
      if (c.y0 > (top < 0 ? feetY + 1.6 : top + 0.05)) continue;
      top = c.h; changed = true;
    }
  }
  return top; // -1 when nothing is in the way
}
// is there a ceiling within `tall` metres above y at (x, z)?
export function headroom(x, z, y, tall = 1.8) {
  for (const c of bucketAt(x, z)) if (!c.water && c.y0 > y - 0.05 && c.y0 < y + tall && x >= c.x0 - 0.2 && x <= c.x1 + 0.2 && z >= c.z0 - 0.2 && z <= c.z1 + 0.2) return false;
  return true;
}
export function pointBlocked(x, z, pad = 0.3) {
  if (inHole(x, z)) return true;
  if (x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ) return true;
  for (const c of bucketAt(x, z)) if (blocksBody(c, 0, 1.8) && x >= c.x0 - pad && x <= c.x1 + pad && z >= c.z0 - pad && z <= c.z1 + pad) return true;
  return false;
}
export function maxHeightNear(x, z) {
  let h = 0;
  for (const c of bucketAt(x, z)) if (x >= c.x0 - 8 && x <= c.x1 + 8 && z >= c.z0 - 8 && z <= c.z1 + 8) h = Math.max(h, c.h);
  return h;
}
export function groundY(x, z) {
  if (groundHoles.length && inHole(x, z)) return DEEP;
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
    if (!blocksBody(c, 0, 1.8)) continue;
    if (c.x1 < gox - 1 || c.x0 > ex + 1 || c.z1 < goz - 1 || c.z0 > ez + 1) continue;
    const x0 = Math.max(0, Math.floor((c.x0 - 0.3 - gox) / CELL)), x1 = Math.min(GN - 1, Math.floor((c.x1 + 0.3 - gox) / CELL));
    const z0 = Math.max(0, Math.floor((c.z0 - 0.3 - goz) / CELL)), z1 = Math.min(GN - 1, Math.floor((c.z1 + 0.3 - goz) / CELL));
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const wx = gox + (gx + 0.5) * CELL, wz = goz + (gz + 0.5) * CELL;
      if (wx >= c.x0 - 0.3 && wx <= c.x1 + 0.3 && wz >= c.z0 - 0.3 && wz <= c.z1 + 0.3) blocked[gz * GN + gx] = 1;
    }
    // thin walls can fall between cell centres and leave a gap people try to walk through:
    // mark the cells along the wall's length too (ends pulled in so doorways stay open)
    const w = c.x1 - c.x0, d = c.z1 - c.z0;
    if (Math.min(w, d) < CELL && Math.max(w, d) > 1.2) {
      const alongX = w >= d, a0 = (alongX ? c.x0 : c.z0) + 0.45, a1 = (alongX ? c.x1 : c.z1) - 0.45, mid = alongX ? (c.z0 + c.z1) / 2 : (c.x0 + c.x1) / 2;
      for (let a = a0; a <= a1 + 1e-6; a += 0.5) {
        const gx = Math.floor(((alongX ? a : mid) - gox) / CELL), gz = Math.floor(((alongX ? mid : a) - goz) / CELL);
        if (gx >= 0 && gz >= 0 && gx < GN && gz < GN) blocked[gz * GN + gx] = 1;
      }
    }
  }
  // doorways: the thin-wall marking above can close a narrow door on the coarse grid, so reopen them
  for (const o of navOpen) {
    if (o.x1 < gox || o.x0 > ex || o.z1 < goz || o.z0 > ez) continue;
    for (let gx = Math.max(0, Math.floor((o.x0 - gox) / CELL)); gx <= Math.min(GN - 1, Math.floor((o.x1 - gox) / CELL)); gx++)
      for (let gz = Math.max(0, Math.floor((o.z0 - goz) / CELL)); gz <= Math.min(GN - 1, Math.floor((o.z1 - goz) / CELL)); gz++) {
        const wx = gox + (gx + 0.5) * CELL, wz = goz + (gz + 0.5) * CELL;
        if (wx >= o.x0 && wx <= o.x1 && wz >= o.z0 && wz <= o.z1) blocked[gz * GN + gx] = 0;
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
    if (!blockedAt(x, z) && !pointBlocked(x, z, 0.4)) return { x, z };
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
    if (!c.water && sl(o.x, d.x, c.x0, c.x1) && sl(o.z, d.z, c.z0, c.z1) && sl(o.y, d.y, c.y0, c.h) && t0 < best) best = t0;
  }
  return { t: best };
}
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
export function los3D(ax, ay, az, bx, by, bz) {
  _o.set(ax, ay, az); _d.set(bx - ax, by - ay, bz - az);
  const dist = _d.length(); _d.divideScalar(dist || 1);
  return raycastWorld(_o, _d, dist).t >= dist - 0.6;
}
// debugging/tests: the collider a body standing at (x, y, z) is stuck inside, if any (deeper than `inset`)
export function solidAt(x, y, z, inset = 0.15, minSize = 0, minTall = 0) {
  for (const c of bucketAt(x, z)) {
    if (c.water || !blocksBody(c, y, 1.7) || Math.min(c.x1 - c.x0, c.z1 - c.z0) < minSize || c.h - y < minTall) continue;
    if (x > c.x0 + inset && x < c.x1 - inset && z > c.z0 + inset && z < c.z1 - inset) return c;
  }
  return null;
}
export function unbucketedColliders() { const out = []; for (const c of colliders) { const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2; if (!bucketAt(cx, cz).includes(c)) out.push(c); } return out; }
// move a body from (ox, oz) to where it is now in small steps, so nothing fast (a sprint at a low
// frame rate, a shove, a crowd pushing, flying) can tunnel through a thin wall
export function moveBody(p, ox, oz, r, feetY, tall = 1.8) {
  const dx = p.x - ox, dz = p.z - oz, d = Math.hypot(dx, dz), n = Math.min(40, Math.ceil(d / Math.min(0.15, r * 0.5)));
  if (n <= 1) return resolveBody(p, r, feetY, tall);
  p.x = ox; p.z = oz;
  let hit = false;
  for (let i = 0; i < n; i++) { p.x += dx / n; p.z += dz / n; if (resolveBody(p, r, feetY, tall)) hit = true; }
  return hit;
}
// precise line of sight through solid geometry (glass counts as see-through), using the collision buckets
const _seen = new Set();
export function losSolid(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, dist = Math.hypot(dx, dy, dz);
  if (dist < 0.5) return true;
  _seen.clear();
  const steps = Math.ceil(dist / (BUCKET * 0.5)) + 1;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    for (const c of bucketAt(ax + dx * t, az + dz * t)) {
      if (_seen.has(c)) continue; _seen.add(c);
      if (c.water || c.glass || c.pole || c.h - c.y0 < 0.3) continue;
      let t0 = 0.02, t1 = 0.98;
      const sl = (o, d, mn, mx) => { if (Math.abs(d) < 1e-9) return o > mn && o < mx; let a = (mn - o) / d, b = (mx - o) / d; if (a > b) { const q = a; a = b; b = q; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); return t0 < t1; };
      if (sl(ax, dx, c.x0, c.x1) && sl(az, dz, c.z0, c.z1) && sl(ay, dy, c.y0, c.h)) return false;
    }
  }
  return true;
}
