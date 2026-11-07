// HUNTED — an open-city survival game where everyone wants the bounty on your head.
// Everything here (city, characters, cars, textures, sounds) is generated in code.

import * as THREE from '../vendor/three.module.min.js';

// =====================================================================
// Config
// =====================================================================
const CFG = {
  cityName: 'PORT HALDEN',
  days: 30,
  dayLength: 90,        // real seconds per in-game day
  startHour: 16.5,
  gridN: 8,             // blocks per side
  block: 44,
  road: 14,
  sidewalk: 3,
  baseReward: 1_000_000_000,
};

// =====================================================================
// Small helpers
// =====================================================================
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const srand = mulberry32(20261107);               // seeded: city layout is the same every run
const sr = (a, b) => a + srand() * (b - a);
const spick = (arr) => arr[Math.floor(srand() * arr.length)];
const mr = (a, b) => a + Math.random() * (b - a); // gameplay randomness
const mpick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmtMoney = (n) => '$' + Math.floor(n).toLocaleString('en-US');
const fmtTime = (s) => { s = Math.floor(s); const m = Math.floor(s / 60); return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const $ = (id) => document.getElementById(id);

// =====================================================================
// Renderer / scene
// =====================================================================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8a76a6);
scene.fog = new THREE.Fog(0x8a76a6, 18, 230);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 700);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xc8c8ff, 0x403040, 1.0);
const sun = new THREE.DirectionalLight(0xffd0a0, 1.2);
sun.position.set(-120, 160, 80);
scene.add(hemi, sun);

// view-model (hands + gun) rendered in its own pass so it never clips into walls
const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.01, 10);
const vmHemi = new THREE.HemisphereLight(0xffffff, 0x404040, 1.2);
const vmSun = new THREE.DirectionalLight(0xffffff, 0.8);
vmSun.position.set(1, 2, 1);
vmScene.add(vmHemi, vmSun, vmCamera);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = vmCamera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); vmCamera.updateProjectionMatrix();
});

// =====================================================================
// Procedural textures
// =====================================================================
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const FACADES = [
  { wall: '#7a3b2e', trim: '#4e231b' }, { wall: '#a88d6e', trim: '#6e5a45' },
  { wall: '#686a75', trim: '#45464f' }, { wall: '#4d3b34', trim: '#2f241f' },
  { wall: '#c2b195', trim: '#8a7c66' }, { wall: '#56647c', trim: '#36404f' },
  { wall: '#8c4a3a', trim: '#5c2d22' },
];

function makeFacadeMaterial(f) {
  const lit = [];
  for (let i = 0; i < 32; i++) lit.push(srand() < 0.38);
  const glass = (ctx, x, y, w, h, on, emissiveOnly) => {
    if (on) {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, '#ffe7a8'); g.addColorStop(1, '#f6b45a');
      ctx.fillStyle = g;
    } else ctx.fillStyle = emissiveOnly ? '#000' : '#1b2233';
    ctx.fillRect(x, y, w, h);
    if (!emissiveOnly && !on) { ctx.fillStyle = 'rgba(120,140,190,.18)'; ctx.fillRect(x, y, w, h * 0.35); }
  };
  const draw = (emissiveOnly) => (ctx, W, H) => {
    ctx.fillStyle = emissiveOnly ? '#000' : f.wall; ctx.fillRect(0, 0, W, H);
    if (!emissiveOnly) {
      for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; ctx.fillRect(Math.random() * W, Math.random() * H, 3, 2); }
    }
    for (let r = 0; r < 8; r++) {
      if (!emissiveOnly) { ctx.fillStyle = f.trim; ctx.fillRect(0, r * 64, W, 5); }
      for (let c = 0; c < 4; c++) {
        const x = c * 64 + 13, y = r * 64 + 14;
        if (!emissiveOnly) { ctx.fillStyle = f.trim; ctx.fillRect(x - 3, y - 3, 44, 44); }
        glass(ctx, x, y, 38, 36, lit[r * 4 + c], emissiveOnly);
        if (!emissiveOnly) { ctx.fillStyle = f.trim; ctx.fillRect(x + 18, y, 2, 36); ctx.fillRect(x - 4, y + 37, 46, 4); }
      }
    }
  };
  const map = canvasTex(256, 512, draw(false), true);
  const em = canvasTex(256, 512, draw(true), true);
  return new THREE.MeshLambertMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.5 });
}
const facadeMats = FACADES.map(makeFacadeMaterial);

const shopTex = canvasTex(128, 64, (ctx, W, H) => {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#fff2cf'); g.addColorStop(1, '#e6b06a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(80,50,30,.5)';
  for (let i = 0; i < 6; i++) ctx.fillRect(10 + Math.random() * 100, 30 + Math.random() * 20, 8, 20);
  ctx.fillStyle = '#2b2420';
  ctx.fillRect(0, 0, W, 5); ctx.fillRect(0, H - 4, W, 4);
  ctx.fillRect(0, 0, 4, H); ctx.fillRect(W / 2 - 2, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H);
}, true);

const SIGN_WORDS = ['HOTEL', 'CINEMA', 'DINER', 'JAZZ', 'ARCADE', 'TONIGHT', 'PAWN', 'LIVE', 'BAR', 'MOTEL', 'OPERA', 'NOODLE', 'DANCE', 'COMEDY'];
const SIGN_COLORS = [['#e0283c', '#fff'], ['#5b8fe6', '#fff'], ['#e2b432', '#3a2200'], ['#9a4fd0', '#fff'], ['#20a59a', '#fff'], ['#f06aa8', '#fff'], ['#f08a24', '#fff']];
const signMats = [];
for (let i = 0; i < 12; i++) {
  const word = SIGN_WORDS[i % SIGN_WORDS.length];
  const [bg, fg] = SIGN_COLORS[i % SIGN_COLORS.length];
  const tex = canvasTex(64, 320, (ctx, W, H) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.strokeRect(5, 5, W - 10, H - 10);
    ctx.fillStyle = fg; ctx.font = 'bold 38px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const step = Math.min(44, (H - 30) / word.length);
    const start = H / 2 - (step * (word.length - 1)) / 2;
    for (let k = 0; k < word.length; k++) ctx.fillText(word[k], W / 2, start + k * step);
  });
  signMats.push(new THREE.MeshBasicMaterial({ map: tex }));
}
const signEdgeMat = new THREE.MeshLambertMaterial({ color: 0x222228 });

const STREET_NAMES = ['HALDEN AVE', 'KESTREL ST', 'BAYLOR AVE', 'MARROW ST', 'ORCHID AVE', '9TH ST', 'FERRIS ST', 'LOWELL AVE'];
const streetSignMats = STREET_NAMES.map((n) => new THREE.MeshBasicMaterial({
  map: canvasTex(256, 48, (ctx, W, H) => {
    ctx.fillStyle = '#1f6b3a'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n, W / 2, H / 2 + 1);
  }),
}));

const puffTex = canvasTex(64, 64, (ctx, W, H) => {
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
});
const markerTex = canvasTex(64, 64, (ctx) => {
  ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 32, 34);
});
const markerMat = new THREE.SpriteMaterial({ map: markerTex, depthTest: false, transparent: true });

// =====================================================================
// Merged static geometry builder (keeps draw calls low)
// =====================================================================
const tmpColor = new THREE.Color();
class GeoBuf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  quad(a, b, c, d, nrm, uv, color) {
    const vs = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      this.pos.push(vs[i][0], vs[i][1], vs[i][2]);
      this.nor.push(nrm[0], nrm[1], nrm[2]);
      this.uv.push(uv[i * 2], uv[i * 2 + 1]);
      if (color) this.col.push(color.r, color.g, color.b);
    }
    const n = this.n; this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3); this.n += 4;
  }
  box(x0, x1, y0, y1, z0, z1, color, opt = {}) {
    const { uvW = 0, uvH = 0, uOff = 0, top = true, bottom = false, sides = true } = opt;
    const c = color == null ? null : tmpColor.set(color).clone();
    const h = y1 - y0;
    const fuv = (fw) => (uvW ? [uOff, y0 / uvH, uOff + fw / uvW, y0 / uvH, uOff + fw / uvW, (y0 + h) / uvH, uOff, (y0 + h) / uvH] : [0, 0, 1, 0, 1, 1, 0, 1]);
    const U = [0, 0, 1, 0, 1, 1, 0, 1];
    if (sides) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], fuv(x1 - x0), c);
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], fuv(x1 - x0), c);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], fuv(z1 - z0), c);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], fuv(z1 - z0), c);
    }
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], U, c);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], U, c);
  }
  // vertical plane on one side of a rectangle. side: px|nx|pz|nz, fixed = x or z of the plane, a0<a1 span
  face(side, fixed, a0, a1, y0, y1, color, uRep = 1) {
    const c = color == null ? null : tmpColor.set(color).clone();
    const u = [0, 0, uRep, 0, uRep, 1, 0, 1];
    if (side === 'px') this.quad([fixed, y0, a1], [fixed, y0, a0], [fixed, y1, a0], [fixed, y1, a1], [1, 0, 0], u, c);
    else if (side === 'nx') this.quad([fixed, y0, a0], [fixed, y0, a1], [fixed, y1, a1], [fixed, y1, a0], [-1, 0, 0], u, c);
    else if (side === 'pz') this.quad([a0, y0, fixed], [a1, y0, fixed], [a1, y1, fixed], [a0, y1, fixed], [0, 0, 1], u, c);
    else this.quad([a1, y0, fixed], [a0, y0, fixed], [a0, y1, fixed], [a1, y1, fixed], [0, 0, -1], u, c);
  }
  flat(x0, x1, z0, z1, y, color) { this.box(x0, x1, y, y, z0, z1, color, { sides: false }); }
  build(material) {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    return m;
  }
}

// =====================================================================
// City generation
// =====================================================================
const N = CFG.gridN, BLK = CFG.block, RD = CFG.road, SW = CFG.sidewalk, PITCH = BLK + RD;
const HALF = (N * PITCH) / 2;
const R = (k) => -HALF + k * PITCH;          // road centre lines, k = 0..N
const BOUND = HALF + RD / 2 - 0.5;           // playable area limit

const colliders = [];   // static boxes {x0,x1,z0,z1,h}
const lanes = [];       // car lanes
const vents = [];       // steam vents
const blockRects = [];  // sidewalk rectangles (for spawning pickups)

const facadeBufs = FACADES.map(() => new GeoBuf());
const roofBuf = new GeoBuf(), propBuf = new GeoBuf(), glowBuf = new GeoBuf(), shopBuf = new GeoBuf(), markBuf = new GeoBuf();

const COLORS = {
  sidewalk: 0x77727c, roof: 0x3d3944, parapet: 0x55505c, grass: 0x3f6a38, trunk: 0x5a3e2b,
  pole: 0x2e3035, lamp: 0xfff0c4, signal: 0x6b5a18, white: 0xe8e8e8, yellow: 0xe0b52a,
};
const AWNINGS = [0x8a1d27, 0x1d4f8a, 0x2c6b3c, 0x6b2c6b, 0x8a5a1d, 0x222222];
const SHOP_TINTS = [0xffffff, 0xffe0c0, 0xd8ecff, 0xffd0e8, 0xe0ffd8];
const TREE_GREENS = [0x35642f, 0x426f2e, 0x2e5a35, 0x4d7a35];

function addCollider(x0, x1, z0, z1, h) { colliders.push({ x0, x1, z0, z1, h }); }

function addBladeSign(side, fixed, a, y, hS) {
  const mat = spick(signMats);
  let geo, mats;
  if (side === 'px' || side === 'nx') {
    geo = new THREE.BoxGeometry(1.25, hS, 0.18);
    mats = [signEdgeMat, signEdgeMat, signEdgeMat, signEdgeMat, mat, mat];
  } else {
    geo = new THREE.BoxGeometry(0.18, hS, 1.25);
    mats = [mat, mat, signEdgeMat, signEdgeMat, signEdgeMat, signEdgeMat];
  }
  const m = new THREE.Mesh(geo, mats);
  const out = side[0] === 'p' ? 1 : -1;
  if (side === 'px' || side === 'nx') m.position.set(fixed + out * 0.75, y, a);
  else m.position.set(a, y, fixed + out * 0.75);
  m.matrixAutoUpdate = false; m.updateMatrix();
  scene.add(m);
}

function addBuilding(x0, x1, z0, z1, h, street) {
  const v = Math.floor(srand() * FACADES.length);
  facadeBufs[v].box(x0, x1, 0, h, z0, z1, null, { uvW: 12, uvH: 24, uOff: Math.floor(srand() * 4) / 4, top: false });
  roofBuf.flat(x0, x1, z0, z1, h, COLORS.roof);
  // parapet
  const pc = COLORS.parapet;
  propBuf.box(x0, x1, h, h + 0.7, z0, z0 + 0.35, pc); propBuf.box(x0, x1, h, h + 0.7, z1 - 0.35, z1, pc);
  propBuf.box(x0, x0 + 0.35, h, h + 0.7, z0, z1, pc); propBuf.box(x1 - 0.35, x1, h, h + 0.7, z0, z1, pc);
  for (let i = 0; i < 2; i++) if (srand() < 0.6) {
    const ax = sr(x0 + 2, x1 - 4), az = sr(z0 + 2, z1 - 4);
    propBuf.box(ax, ax + sr(1.5, 3), h, h + sr(1, 2.2), az, az + sr(1.5, 3), 0x8d8f96);
  }
  addCollider(x0, x1, z0, z1, h);

  for (const side of ['px', 'nx', 'pz', 'nz']) {
    if (!street[side]) continue;
    const fixed = side === 'px' ? x1 : side === 'nx' ? x0 : side === 'pz' ? z1 : z0;
    const a0 = side[1] === 'x' ? z0 : x0, a1 = side[1] === 'x' ? z1 : x1;
    const out = side[0] === 'p' ? 1 : -1;
    if (srand() < 0.8 && a1 - a0 > 4) {
      shopBuf.face(side, fixed + out * 0.06, a0 + 0.7, a1 - 0.7, 0.2, 3.1, spick(SHOP_TINTS), Math.round((a1 - a0) / 4));
      if (srand() < 0.6) {
        const aw = spick(AWNINGS);
        if (side[1] === 'x') propBuf.box(Math.min(fixed, fixed + out * 1.5), Math.max(fixed, fixed + out * 1.5), 3.15, 3.4, a0 + 0.7, a1 - 0.7, aw);
        else propBuf.box(a0 + 0.7, a1 - 0.7, 3.15, 3.4, Math.min(fixed, fixed + out * 1.5), Math.max(fixed, fixed + out * 1.5), aw);
      }
    }
    if (srand() < 0.32 && h > 12 && a1 - a0 > 6) {
      const hS = sr(4.5, 8);
      addBladeSign(side, fixed, srand() < 0.5 ? a0 + 1.5 : a1 - 1.5, 4.2 + hS / 2 + sr(0, 2), hS);
    }
  }
}

function addTree(x, z) {
  propBuf.box(x - 0.2, x + 0.2, 0.2, 2.6, z - 0.2, z + 0.2, COLORS.trunk);
  const s = sr(1.1, 1.6), g = spick(TREE_GREENS);
  propBuf.box(x - s, x + s, 2.2, 2.2 + s * 1.7, z - s, z + s, g);
  propBuf.box(x - s * 0.6, x + s * 0.6, 2.2 + s * 1.7, 2.2 + s * 2.5, z - s * 0.6, z + s * 0.6, g);
  addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 4);
}

function addStreetLight(x, z, armDx, armDz) {
  propBuf.box(x - 0.1, x + 0.1, 0, 6.5, z - 0.1, z + 0.1, COLORS.pole);
  const ex = x + armDx * 2.2, ez = z + armDz * 2.2;
  propBuf.box(Math.min(x, ex) - 0.06, Math.max(x, ex) + 0.06, 6.35, 6.47, Math.min(z, ez) - 0.06, Math.max(z, ez) + 0.06, COLORS.pole);
  glowBuf.box(ex - 0.3, ex + 0.3, 6.12, 6.35, ez - 0.3, ez + 0.3, COLORS.lamp);
  addCollider(x - 0.15, x + 0.15, z - 0.15, z + 0.15, 6.5);
}

function addSignal(k, j) {
  // pole on the corner of the block to the +x/+z of intersection (k, j); arm spans over the road toward -x
  const px = R(k) + RD / 2 + 0.7, pz = R(j) + RD / 2 + 0.7;
  propBuf.box(px - 0.13, px + 0.13, 0, 6.4, pz - 0.13, pz + 0.13, COLORS.pole);
  propBuf.box(R(k) - 3, px, 6.05, 6.25, pz - 0.08, pz + 0.08, COLORS.pole);
  for (const sx of [R(k) + 2.5, R(k) - 2]) {
    propBuf.box(sx - 0.28, sx + 0.28, 4.6, 6.05, pz - 0.28, pz + 0.28, COLORS.signal);
    glowBuf.box(sx - 0.14, sx + 0.14, 5.55, 5.85, pz - 0.32, pz + 0.32, 0xff3020);
    glowBuf.box(sx - 0.14, sx + 0.14, 4.75, 5.05, pz - 0.32, pz + 0.32, 0x2a5a30);
  }
  addCollider(px - 0.2, px + 0.2, pz - 0.2, pz + 0.2, 6.4);
  // street name plate
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.06),
    [signEdgeMat, signEdgeMat, signEdgeMat, signEdgeMat, spick(streetSignMats), spick(streetSignMats)]);
  plate.position.set(px - 1.2, 3.6, pz);
  plate.matrixAutoUpdate = false; plate.updateMatrix();
  scene.add(plate);
}

function generateCity() {
  const center = N / 2;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const bx0 = R(i) + RD / 2, bx1 = R(i + 1) - RD / 2, bz0 = R(j) + RD / 2, bz1 = R(j + 1) - RD / 2;
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    propBuf.box(bx0, bx1, 0, 0.15, bz0, bz1, COLORS.sidewalk);
    blockRects.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1 });
    const ix0 = bx0 + SW, ix1 = bx1 - SW, iz0 = bz0 + SW, iz1 = bz1 - SW;
    const dc = Math.hypot(cx, cz) / HALF;
    const heightAt = () => Math.max(9, Math.round((sr(9, 21) + Math.pow(Math.max(0, 1 - dc), 2) * sr(12, 48)) / 3) * 3);

    const isPark = (i === center - 1 && j === center - 1) || (srand() < 0.1 && !(i === center && j === center - 1));
    if (isPark) {
      propBuf.box(ix0, ix1, 0.15, 0.22, iz0, iz1, COLORS.grass);
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        if (srand() < 0.25) continue;
        addTree(lerp(ix0 + 4, ix1 - 4, a / 3) + sr(-1.5, 1.5), lerp(iz0 + 4, iz1 - 4, b / 3) + sr(-1.5, 1.5));
      }
      // benches (decor)
      for (let b = 0; b < 3; b++) { const bx = sr(ix0 + 3, ix1 - 5), bz = sr(iz0 + 3, iz1 - 3); propBuf.box(bx, bx + 2, 0.2, 0.7, bz, bz + 0.6, 0x5a4030); }
    } else {
      const r = srand();
      const st = (x0, x1, z0, z1) => ({ px: Math.abs(x1 - ix1) < 0.01, nx: Math.abs(x0 - ix0) < 0.01, pz: Math.abs(z1 - iz1) < 0.01, nz: Math.abs(z0 - iz0) < 0.01 });
      if (r < 0.28) {
        addBuilding(ix0, ix1, iz0, iz1, heightAt() + 6, st(ix0, ix1, iz0, iz1));
      } else if (r < 0.5) {
        // two halves with an alley
        const m = (ix0 + ix1) / 2;
        if (srand() < 0.5) { addBuilding(ix0, m - 2, iz0, iz1, heightAt(), st(ix0, m - 2, iz0, iz1)); addBuilding(m + 2, ix1, iz0, iz1, heightAt(), st(m + 2, ix1, iz0, iz1)); }
        else { const mz = (iz0 + iz1) / 2; addBuilding(ix0, ix1, iz0, mz - 2, heightAt(), st(ix0, ix1, iz0, mz - 2)); addBuilding(ix0, ix1, mz + 2, iz1, heightAt(), st(ix0, ix1, mz + 2, iz1)); }
      } else {
        const mx = (ix0 + ix1) / 2, mz = (iz0 + iz1) / 2;
        for (const [x0, x1] of [[ix0, mx - 2], [mx + 2, ix1]]) for (const [z0, z1] of [[iz0, mz - 2], [mz + 2, iz1]]) addBuilding(x0, x1, z0, z1, heightAt(), st(x0, x1, z0, z1));
      }
    }
    // street lights on two opposite corners
    if ((i + j) % 2 === 0) { addStreetLight(bx0 + 0.7, bz0 + 0.7, -1, 0); addStreetLight(bx1 - 0.7, bz1 - 0.7, 1, 0); }
    else { addStreetLight(bx1 - 0.7, bz0 + 0.7, 0, -1); addStreetLight(bx0 + 0.7, bz1 - 0.7, 0, 1); }
  }

  // signals at interior intersections
  for (let k = 1; k < N; k++) for (let j = 1; j < N; j++) if (srand() < 0.55) addSignal(k, j);

  // road markings + lanes
  for (let k = 0; k <= N; k++) {
    const rc = R(k);
    for (let j = 0; j < N; j++) {
      const s0 = R(j) + RD / 2, s1 = R(j + 1) - RD / 2;
      // crosswalks (vertical road: stripes along z, spread across x)
      for (const [c0, c1] of [[s0 + 0.4, s0 + 3.4], [s1 - 3.4, s1 - 0.4]]) {
        for (let x = rc - RD / 2 + 0.8; x < rc + RD / 2 - 0.8; x += 1.4) markBuf.flat(x, x + 0.7, c0, c1, 0.02, COLORS.white);
        // horizontal road equivalent
        for (let z = rc - RD / 2 + 0.8; z < rc + RD / 2 - 0.8; z += 1.4) markBuf.flat(c0, c1, z, z + 0.7, 0.02, COLORS.white);
      }
      for (let s = s0 + 5; s < s1 - 5; s += 5) {
        markBuf.flat(rc - 0.12, rc + 0.12, s, s + 2.5, 0.02, COLORS.yellow);
        markBuf.flat(s, s + 2.5, rc - 0.12, rc + 0.12, 0.02, COLORS.yellow);
      }
      if (srand() < 0.18) vents.push({ x: rc + sr(-4, 4), z: sr(s0 + 6, s1 - 6) });
      if (srand() < 0.18) vents.push({ x: sr(s0 + 6, s1 - 6), z: rc + sr(-4, 4) });
    }
    lanes.push({ axis: 'z', fixed: rc + 3.4, dir: 1 }, { axis: 'z', fixed: rc - 3.4, dir: -1 });
    lanes.push({ axis: 'x', fixed: rc - 3.4, dir: 1 }, { axis: 'x', fixed: rc + 3.4, dir: -1 });
  }

  // outer ring of buildings so the city seems to continue (not playable)
  const e = HALF + RD / 2;
  for (const s of [-1, 1]) {
    propBuf.box(-e - 40, e + 40, 0, 0.15, s > 0 ? e : -e - 3, s > 0 ? e + 3 : -e, COLORS.sidewalk);
    propBuf.box(s > 0 ? e : -e - 3, s > 0 ? e + 3 : -e, 0, 0.15, -e - 40, e + 40, COLORS.sidewalk);
    for (let a = -e - 30; a < e + 30;) {
      const w = sr(14, 26), h = Math.round(sr(15, 50) / 3) * 3, v = Math.floor(srand() * FACADES.length);
      const d0 = e + 3, d1 = e + 25;
      const zA = s > 0 ? d0 : -d1, zB = s > 0 ? d1 : -d0;
      facadeBufs[v].box(a, a + w - 0.5, 0, h, zA, zB, null, { uvW: 12, uvH: 24, top: false });
      roofBuf.flat(a, a + w - 0.5, zA, zB, h, COLORS.roof);
      const v2 = Math.floor(srand() * FACADES.length), h2 = Math.round(sr(15, 50) / 3) * 3;
      facadeBufs[v2].box(zA, zB, 0, h2, a, a + w - 0.5, null, { uvW: 12, uvH: 24, top: false });
      roofBuf.flat(zA, zB, a, a + w - 0.5, h2, COLORS.roof);
      a += w;
    }
  }

  facadeBufs.forEach((b, i) => b.build(facadeMats[i]));
  roofBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  propBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  glowBuf.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  shopBuf.build(new THREE.MeshBasicMaterial({ map: shopTex, vertexColors: true }));
  markBuf.build(new THREE.MeshLambertMaterial({ vertexColors: true }));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 5, HALF * 5, 48, 48), new THREE.MeshLambertMaterial({ color: 0x2c2a33 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
}
generateCity();

// collider buckets for fast circle queries
const BUCKET = 16;
const BN = Math.ceil((HALF * 2 + RD + 8) / BUCKET);
const BMIN = -HALF - RD / 2 - 4;
const buckets = Array.from({ length: BN * BN }, () => []);
for (const c of colliders) {
  const bx0 = clamp(Math.floor((c.x0 - 3 - BMIN) / BUCKET), 0, BN - 1), bx1 = clamp(Math.floor((c.x1 + 3 - BMIN) / BUCKET), 0, BN - 1);
  const bz0 = clamp(Math.floor((c.z0 - 3 - BMIN) / BUCKET), 0, BN - 1), bz1 = clamp(Math.floor((c.z1 + 3 - BMIN) / BUCKET), 0, BN - 1);
  for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) buckets[z * BN + x].push(c);
}
function bucketAt(x, z) {
  return buckets[clamp(Math.floor((z - BMIN) / BUCKET), 0, BN - 1) * BN + clamp(Math.floor((x - BMIN) / BUCKET), 0, BN - 1)];
}

// push a circle out of static geometry. p = {x, z}
function resolveCircle(p, r) {
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
  p.x = clamp(p.x, -BOUND, BOUND); p.z = clamp(p.z, -BOUND, BOUND);
  return hit;
}

function groundY(x, z) {
  const lx = (((x + HALF) % PITCH) + PITCH) % PITCH, lz = (((z + HALF) % PITCH) + PITCH) % PITCH;
  const onRoad = lx < RD / 2 || lx > PITCH - RD / 2 || lz < RD / 2 || lz > PITCH - RD / 2 || Math.abs(x) > HALF || Math.abs(z) > HALF;
  return onRoad ? 0 : 0.15;
}

// =====================================================================
// Navigation grid: BFS flow field toward the player, + line-of-sight
// =====================================================================
const CELL = 2;
const GMIN = -HALF - RD / 2;
const GN = Math.ceil((HALF * 2 + RD) / CELL);
const blocked = new Uint8Array(GN * GN);
const flow = new Int32Array(GN * GN).fill(-1);
const bfsQueue = new Int32Array(GN * GN);
for (const c of colliders) {
  const x0 = Math.floor((c.x0 - 0.3 - GMIN) / CELL), x1 = Math.floor((c.x1 + 0.3 - GMIN) / CELL);
  const z0 = Math.floor((c.z0 - 0.3 - GMIN) / CELL), z1 = Math.floor((c.z1 + 0.3 - GMIN) / CELL);
  for (let x = Math.max(0, x0); x <= Math.min(GN - 1, x1); x++) for (let z = Math.max(0, z0); z <= Math.min(GN - 1, z1); z++) {
    const wx = GMIN + (x + 0.5) * CELL, wz = GMIN + (z + 0.5) * CELL;
    if (wx >= c.x0 - 0.3 && wx <= c.x1 + 0.3 && wz >= c.z0 - 0.3 && wz <= c.z1 + 0.3) blocked[z * GN + x] = 1;
  }
}
const cellX = (x) => clamp(Math.floor((x - GMIN) / CELL), 0, GN - 1);
const cellIdx = (x, z) => cellX(z) * GN + cellX(x);
const cellCenter = (i) => ({ x: GMIN + ((i % GN) + 0.5) * CELL, z: GMIN + (Math.floor(i / GN) + 0.5) * CELL });

function computeFlow(tx, tz) {
  flow.fill(-1);
  let start = cellIdx(tx, tz);
  if (blocked[start]) { // find a nearby free cell
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

// returns a point to steer toward to follow the flow field
function navTarget(x, z, look = 2) {
  let i = cellIdx(x, z);
  if (flow[i] < 0) { // inside an expanded wall cell: look around
    const cx = i % GN, cz = Math.floor(i / GN); let bd = 1e9, bi = -1;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= GN || nz >= GN) continue;
      const j = nz * GN + nx; if (flow[j] >= 0 && flow[j] < bd) { bd = flow[j]; bi = j; }
    }
    if (bi < 0) return null;
    return cellCenter(bi);
  }
  for (let s = 0; s < look; s++) { const n = flowStep(i); if (n < 0) break; i = n; }
  return cellCenter(i);
}

function los(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), n = Math.ceil(d / 1.2);
  for (let s = 1; s < n; s++) { const t = s / n; if (blocked[cellIdx(ax + dx * t, az + dz * t)]) return false; }
  return true;
}

function randomOpenPoint(cx, cz, rMin, rMax, tries = 20) {
  for (let t = 0; t < tries; t++) {
    const a = Math.random() * Math.PI * 2, r = mr(rMin, rMax);
    const x = clamp(cx + Math.cos(a) * r, -BOUND + 2, BOUND - 2), z = clamp(cz + Math.sin(a) * r, -BOUND + 2, BOUND - 2);
    const i = cellIdx(x, z);
    if (!blocked[i]) return { x, z };
  }
  return null;
}

// =====================================================================
// Audio (tiny synth, no files)
// =====================================================================
let actx = null, master = null;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination); } catch { actx = null; }
}
function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
let noiseBuf = null;
function noise(dur, vol = 0.3, freq = 1200, q = 0.8, delay = 0) {
  if (!actx) return;
  if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = actx.currentTime + delay, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
const sfx = {
  shot: () => { noise(0.16, 0.55, 900, 0.6); tone(140, 0.12, 'square', 0.12, 0.4); },
  enemyShot: (d) => { const v = clamp(0.35 - d / 120, 0.03, 0.35); noise(0.14, v, 1400, 0.7); },
  hurt: () => { tone(220, 0.18, 'sawtooth', 0.12, 0.5); noise(0.1, 0.25, 500); },
  hit: () => { tone(900, 0.05, 'square', 0.06); },
  shove: () => noise(0.18, 0.25, 600, 0.5),
  pickup: () => { tone(660, 0.08, 'sine', 0.15); tone(990, 0.12, 'sine', 0.15, 1, 0.07); },
  reload: () => { tone(300, 0.04, 'square', 0.08); tone(500, 0.04, 'square', 0.08, 1, 0.5); },
  empty: () => tone(1200, 0.03, 'square', 0.05),
  day: () => { tone(523, 0.3, 'triangle', 0.18); tone(659, 0.3, 'triangle', 0.18, 1, 0.15); tone(784, 0.5, 'triangle', 0.18, 1, 0.3); },
  alarm: () => { for (let i = 0; i < 3; i++) { tone(880, 0.12, 'square', 0.09, 1, i * 0.25); tone(660, 0.12, 'square', 0.09, 1, i * 0.25 + 0.12); } },
  heart: (v) => { tone(55, 0.12, 'sine', v); tone(50, 0.12, 'sine', v * 0.8, 1, 0.16); },
  crash: () => { noise(0.4, 0.5, 300, 0.4); tone(80, 0.3, 'sawtooth', 0.15, 0.5); },
  horn: () => { tone(380, 0.35, 'square', 0.06); tone(470, 0.35, 'square', 0.05); },
  thud: () => { noise(0.12, 0.3, 200, 0.6); },
};

// =====================================================================
// Effects: particles (steam, impact puffs, smoke) & bullet trails
// =====================================================================
const puffs = [];
const puffPool = [];
function emitPuff(x, y, z, opts) {
  let s = puffPool.pop();
  if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, fog: true })); scene.add(s); }
  s.visible = true;
  s.position.set(x, y, z);
  s.material.color.set(opts.color ?? 0xffffff);
  puffs.push({ s, age: 0, life: opts.life ?? 1, vx: opts.vx ?? 0, vy: opts.vy ?? 1, vz: opts.vz ?? 0, s0: opts.size0 ?? 0.5, s1: opts.size1 ?? 2, a: opts.alpha ?? 0.5 });
}
function updatePuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]; p.age += dt;
    const t = p.age / p.life;
    if (t >= 1) { p.s.visible = false; puffPool.push(p.s); puffs.splice(i, 1); continue; }
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    p.s.scale.setScalar(lerp(p.s0, p.s1, t));
    p.s.material.opacity = p.a * (1 - t) * Math.min(1, t * 6);
  }
}
let ventT = 0;
function updateVents(dt) {
  ventT -= dt;
  if (ventT > 0) return;
  ventT = 0.12;
  for (const v of vents) {
    if (Math.abs(v.x - camera.position.x) > 120 || Math.abs(v.z - camera.position.z) > 120) continue;
    emitPuff(v.x + mr(-0.4, 0.4), 0.2, v.z + mr(-0.4, 0.4), { life: 3.2, vy: mr(1.8, 2.8), vx: mr(-0.3, 0.3), vz: mr(-0.3, 0.3), size0: 1, size1: 5, alpha: 0.28, color: 0xe8e0f0 });
  }
}

const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1).translate(0, 0, 0.5);
const tracers = [];
const tracerPool = [];
function spawnTracer(from, to, color = 0xfff2a0) {
  let m = tracerPool.pop();
  if (!m) { m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); scene.add(m); }
  m.visible = true;
  m.material.color.set(color);
  m.position.copy(from);
  m.lookAt(to);
  m.scale.set(1, 1, from.distanceTo(to));
  tracers.push({ m, age: 0, life: 0.14 });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.age += dt;
    if (t.age >= t.life) { t.m.visible = false; tracerPool.push(t.m); tracers.splice(i, 1); continue; }
    t.m.material.opacity = 1 - t.age / t.life;
    t.m.scale.x = t.m.scale.y = 1 + t.age * 8;
  }
}

// =====================================================================
// People (blocky low-poly) + ragdolls
// =====================================================================
const PG = {
  leg: new THREE.BoxGeometry(0.22, 0.82, 0.24).translate(0, -0.41, 0),
  torso: new THREE.BoxGeometry(0.6, 0.7, 0.34),
  head: new THREE.BoxGeometry(0.38, 0.38, 0.38),
  hair: new THREE.BoxGeometry(0.41, 0.12, 0.41),
  arm: new THREE.BoxGeometry(0.17, 0.7, 0.18).translate(0, -0.35, 0),
  gun: new THREE.BoxGeometry(0.09, 0.14, 0.4).translate(0, -0.68, 0.14),
};
const matCache = new Map();
function lam(hex) { if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex })); return matCache.get(hex); }
const SKINS = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
const SHIRTS = [0x3a5a8c, 0x8c3a3a, 0x3a8c5a, 0xd0d0d0, 0x333333, 0xc9a13b, 0x6b3a8c, 0xd6763a, 0x2f7f8f, 0x9b9b9b];
const PANTS = [0x23262e, 0x3b3f4a, 0x2c3e66, 0x4a3a2a, 0x555555];
const HAIRS = [0x1a1410, 0x3b2616, 0x6b4a2a, 0xc9a05a, 0x777777, 0x111111];

function buildPerson(look) {
  const g = new THREE.Group();
  const mk = (geo, hex, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, lam(hex)); m.position.set(x, y, z); parent.add(m); return m; };
  const p = { group: g };
  p.legL = mk(PG.leg, look.pants, -0.14, 0.82, 0);
  p.legR = mk(PG.leg, look.pants, 0.14, 0.82, 0);
  p.torso = mk(PG.torso, look.shirt, 0, 1.17, 0);
  p.head = mk(PG.head, look.skin, 0, 1.71, 0);
  mk(PG.hair, look.hair, 0, 0.2, 0, p.head);
  p.armL = mk(PG.arm, look.shirt, -0.395, 1.5, 0);
  p.armR = mk(PG.arm, look.shirt, 0.395, 1.5, 0);
  mk(new THREE.BoxGeometry(0.16, 0.16, 0.16).translate(0, -0.72, 0), look.skin, 0, 0, 0, p.armL);
  mk(new THREE.BoxGeometry(0.16, 0.16, 0.16).translate(0, -0.72, 0), look.skin, 0, 0, 0, p.armR);
  if (look.gun) mk(PG.gun, 0x1c1c20, 0, 0, 0, p.armR);
  return p;
}

const ragdolls = [];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);
class Ragdoll {
  // indices: 0 head, 1 lSh, 2 rSh, 3 lHip, 4 rHip, 5 lHand, 6 rHand, 7 lFoot, 8 rFoot
  constructor(person, scale, vel, impulse, hitY) {
    this.parts = person;
    this.scale = scale;
    const g = person.group;
    g.updateMatrixWorld(true);
    const local = [[0, 1.71, 0], [-0.395, 1.5, 0], [0.395, 1.5, 0], [-0.14, 0.82, 0], [0.14, 0.82, 0]];
    this.p = local.map((l) => new THREE.Vector3(...l).applyMatrix4(g.matrixWorld));
    this.p.push(new THREE.Vector3(0, -0.7, 0).applyMatrix4(person.armL.matrixWorld));
    this.p.push(new THREE.Vector3(0, -0.7, 0).applyMatrix4(person.armR.matrixWorld));
    this.p.push(new THREE.Vector3(0, -0.82, 0).applyMatrix4(person.legL.matrixWorld));
    this.p.push(new THREE.Vector3(0, -0.82, 0).applyMatrix4(person.legR.matrixWorld));
    const dt = 1 / 60;
    this.prev = this.p.map((pt) => {
      const w = clamp(1 - Math.abs(pt.y - hitY) / 1.6, 0.25, 1);
      return pt.clone().sub(_v.set(vel.x + impulse.x * w, vel.y + impulse.y * w, vel.z + impulse.z * w).multiplyScalar(dt));
    });
    const C = [[1, 2], [3, 4], [1, 3], [2, 4], [1, 4], [2, 3], [0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 6], [3, 7], [4, 8], [5, 3], [6, 4], [7, 4], [8, 3]];
    this.c = C.map(([a, b], idx) => ({ a, b, len: this.p[a].distanceTo(this.p[b]), soft: idx >= 14 }));
    // soft "min distance" constraints keep limbs from folding through the body
    for (const c of this.c) if (c.soft) c.len *= 0.6;
    // detach meshes from the walking rig
    for (const k of ['legL', 'legR', 'torso', 'head', 'armL', 'armR']) { scene.attach(person[k]); person[k].scale.setScalar(scale); }
    scene.remove(g);
    this.age = 0; this.acc = 0; this.sleep = false;
  }
  step(dt) {
    const g = -22 * dt * dt;
    for (let i = 0; i < this.p.length; i++) {
      const p = this.p[i], q = this.prev[i];
      const vx = (p.x - q.x) * 0.985, vy = (p.y - q.y) * 0.985, vz = (p.z - q.z) * 0.985;
      q.copy(p);
      p.x += vx; p.y += vy + g; p.z += vz;
    }
    for (let it = 0; it < 6; it++) {
      for (const c of this.c) {
        const a = this.p[c.a], b = this.p[c.b];
        _v.subVectors(b, a); const d = _v.length() || 1e-6;
        if (c.soft && d > c.len) continue;
        const k = ((d - c.len) / d) * 0.5;
        a.addScaledVector(_v, k); b.addScaledVector(_v, -k);
      }
      for (let i = 0; i < this.p.length; i++) {
        const p = this.p[i], q = this.prev[i], r = 0.11 * this.scale;
        const gy = groundY(p.x, p.z) + r;
        if (p.y < gy) { p.y = gy; q.x = lerp(q.x, p.x, 0.25); q.z = lerp(q.z, p.z, 0.25); }
        const before = { x: p.x, z: p.z };
        resolveCircle(p, 0.15);
        if (before.x !== p.x || before.z !== p.z) { q.x = lerp(q.x, p.x, 0.5); q.z = lerp(q.z, p.z, 0.5); }
      }
    }
  }
  update(dt) {
    this.age += dt;
    if (!this.sleep) {
      this.acc += dt;
      while (this.acc >= 1 / 60) { this.step(1 / 60); this.acc -= 1 / 60; }
      if (this.age > 7) this.sleep = true;
    }
    const sink = this.age > 18 ? (this.age - 18) * 0.4 : 0;
    const P = this.p, parts = this.parts;
    // torso orientation
    const shMid = _v.addVectors(P[1], P[2]).multiplyScalar(0.5);
    const hipMid = _v2.addVectors(P[3], P[4]).multiplyScalar(0.5);
    const up = _v3.subVectors(shMid, hipMid).normalize();
    const right = new THREE.Vector3().subVectors(P[2], P[1]);
    right.addScaledVector(up, -right.dot(up)).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up);
    _m4.makeBasis(right, up, fwd);
    parts.torso.quaternion.setFromRotationMatrix(_m4);
    parts.torso.position.addVectors(shMid, hipMid).multiplyScalar(0.5);
    parts.head.quaternion.copy(parts.torso.quaternion);
    parts.head.position.copy(P[0]);
    const limb = (mesh, a, b) => {
      mesh.position.copy(P[a]);
      _q.setFromUnitVectors(DOWN, new THREE.Vector3().subVectors(P[b], P[a]).normalize());
      mesh.quaternion.copy(_q);
    };
    limb(parts.armL, 1, 5); limb(parts.armR, 2, 6); limb(parts.legL, 3, 7); limb(parts.legR, 4, 8);
    if (sink) for (const k of ['legL', 'legR', 'torso', 'head', 'armL', 'armR']) parts[k].position.y -= sink;
    return this.age < 21;
  }
  dispose() { for (const k of ['legL', 'legR', 'torso', 'head', 'armL', 'armR']) scene.remove(this.parts[k]); }
}
function addRagdoll(person, scale, vel, impulse, hitY) {
  ragdolls.push(new Ragdoll(person, scale, vel, impulse, hitY));
  while (ragdolls.length > 18) ragdolls.shift().dispose();
}

// =====================================================================
// Game state
// =====================================================================
const G = {
  mode: 'menu', elapsed: 0, day: 1, hour: CFG.startHour, dayAmt: 1,
  hunters: [], cars: [], pickups: [],
  kills: 0, pingT: 40, spawnT: 0, flowT: 0, hunterCarT: 25, heartT: 0, overT: 0,
  shake: 0, hurtFlash: 0, msgT: 0,
};
const player = {
  x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, hp: 100, stam: 100, exhausted: false,
  lastHurt: 99, shoveCd: 0, kx: 0, kz: 0, alive: true, car: null, mag: 12, reserve: 48, reloadT: 0, fireCd: 0,
  bob: 0, dragT: 0, carHitCd: 0, recoil: 0, shoveAnim: 0, camOff: 0,
};
// Day/night clock: night hours (20:00-06:00) pass faster than daytime hours, so most of a day is playable light.
const HOUR_TABLE = (() => {
  const steps = 96, w = [], cum = [0];
  for (let i = 0; i < steps; i++) { const h = (CFG.startHour + i / 4) % 24; w.push(h >= 6 && h < 20 ? 1 : 0.45); cum.push(cum[i] + w[i]); }
  return { steps, cum, total: cum[steps] };
})();
function hourAt(elapsed) {
  const p = ((elapsed / CFG.dayLength) % 1) * HOUR_TABLE.total, c = HOUR_TABLE.cum;
  let i = 0; while (i < HOUR_TABLE.steps - 1 && c[i + 1] < p) i++;
  const f = (p - c[i]) / (c[i + 1] - c[i]);
  return (CFG.startHour + (i + f) / 4) % 24;
}
const dayMult = () => 1 + (G.day - 1) * 0.016;
function targetPos() { return player.car ? { x: player.car.x, z: player.car.z } : { x: player.x, z: player.z }; }

function hurtPlayer(dmg, fromX, fromZ, knock = 0) {
  if (!player.alive || G.mode !== 'playing') return;
  player.hp -= dmg; player.lastHurt = 0;
  G.hurtFlash = Math.min(1, G.hurtFlash + 0.35 + dmg / 40); G.shake = Math.min(0.5, G.shake + dmg / 60);
  if (knock && !player.car) { const dx = player.x - fromX, dz = player.z - fromZ, d = Math.hypot(dx, dz) || 1; player.kx += (dx / d) * knock; player.kz += (dz / d) * knock; }
  sfx.hurt();
  if (player.hp <= 0) { player.hp = 0; killPlayer(); }
}

// =====================================================================
// Hunters
// =====================================================================
const HTYPES = {
  civ: { speed: 5.0, walk: 1.6, dmg: 7, scale: 1.0, hp: 2, knock: 1.0, stun: 1.8 },
  runner: { speed: 6.6, walk: 2.0, dmg: 5, scale: 0.95, hp: 2, knock: 1.2, stun: 1.5 },
  brute: { speed: 4.0, walk: 1.3, dmg: 14, scale: 1.28, hp: 5, knock: 0.45, stun: 0.9 },
};

class Hunter {
  constructor(x, z, type, gunner, state = 'search') {
    this.type = type; this.T = HTYPES[type]; this.gunner = gunner;
    const look = {
      skin: mpick(SKINS), hair: mpick(HAIRS), pants: mpick(PANTS), gun: gunner,
      shirt: type === 'runner' ? mpick([0xd6763a, 0xc93030, 0xe0c030]) : type === 'brute' ? mpick([0x333333, 0x4a3a2a, 0x2c3e66]) : mpick(SHIRTS),
    };
    this.p = buildPerson(look);
    this.g = this.p.group;
    this.g.scale.setScalar(this.T.scale);
    this.marker = new THREE.Sprite(markerMat);
    this.marker.scale.setScalar(0.55); this.marker.position.y = 2.35; this.marker.visible = false;
    this.g.add(this.marker);
    scene.add(this.g);
    this.x = x; this.z = z; this.vx = 0; this.vz = 0; this.face = Math.random() * 6.28;
    this.hp = this.T.hp; this.state = state; this.thinkT = Math.random() * 0.3;
    this.attackCd = 0; this.fireCd = mr(1.2, 2.4); this.aimT = 0;
    this.stun = 0; this.kx = 0; this.kz = 0; this.phase = Math.random() * 10; this.hasLOS = false; this.lastSeen = 0;
    this.wt = null; this.progT = 0; this.lx = x; this.lz = z; this.alertT = -1; this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.dead = false;
  }
  alert(delay = 0) { if (this.state === 'chase') return; if (delay > 0) { if (this.alertT < 0) this.alertT = delay; } else { this.state = 'chase'; this.lastSeen = 0; } }
  remove() { scene.remove(this.g); this.dead = true; }
  die(impulse, hitY, byPlayer = false) {
    if (this.dead) return;
    this.dead = true;
    this.marker.visible = false;
    this.g.position.set(this.x, groundY(this.x, this.z), this.z);
    addRagdoll(this.p, this.T.scale, { x: this.vx + this.kx, y: 0, z: this.vz + this.kz }, impulse, hitY);
    if (byPlayer) G.kills++;
  }
  damage(n, dirX, dirZ, hitY) {
    this.hp -= n;
    this.alert();
    if (this.hp <= 0) this.die({ x: dirX * 7, y: 2.5, z: dirZ * 7 }, hitY, true);
    else { this.stun = Math.max(this.stun, 0.25); this.kx += dirX * 2.5 * this.T.knock; this.kz += dirZ * 2.5 * this.T.knock; }
  }
  update(dt) {
    const T = this.T, tp = targetPos();
    const dx = tp.x - this.x, dz = tp.z - this.z, d = Math.hypot(dx, dz);
    this.attackCd -= dt; this.fireCd -= dt;
    if (this.alertT >= 0) { this.alertT -= dt; if (this.alertT < 0) this.alert(); }

    // perception
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.2 + Math.random() * 0.12;
      const see = d < 90 && los(this.x, this.z, tp.x, tp.z);
      this.hasLOS = see;
      if (this.state !== 'chase') {
        const noisy = player.car ? 30 : (player.sprinting ? 16 : 7);
        const sight = lerp(17, 34, G.dayAmt) * (player.car ? 1.5 : 1);
        if (d < noisy || (see && d < sight)) { this.alert(); shout(this); }
      } else if (see) this.lastSeen = 0;
    }

    let tvx = 0, tvz = 0;
    if (this.stun > 0) {
      this.stun -= dt;
    } else if (this.state === 'chase') {
      this.lastSeen += dt;
      if (this.lastSeen > 18 && d > 60) { this.state = 'search'; this.wt = null; }
      let tx = tp.x, tz = tp.z;
      if (!(this.hasLOS || d < 4)) { const n = navTarget(this.x, this.z); if (n) { tx = n.x; tz = n.z; } }
      const ex = tx - this.x, ez = tz - this.z, ed = Math.hypot(ex, ez) || 1;
      let spd = T.speed * dayMult();
      if (this.gunner && this.hasLOS && d < 30) {
        // gunners hold their distance and strafe while shooting
        if (d < 13) {
          spd = 1.6; const px = -dz / (d || 1), pz = dx / (d || 1);
          tvx = px * spd * this.strafe; tvz = pz * spd * this.strafe;
          if (Math.random() < dt * 0.4) this.strafe *= -1;
        } else { tvx = (ex / ed) * spd * 0.8; tvz = (ez / ed) * spd * 0.8; }
        if (this.fireCd <= 0) { this.aimT += dt; if (this.aimT > 0.35) { this.aimT = 0; this.fireCd = mr(1.3, 2.3) / Math.min(1.6, dayMult()); hunterShoot(this, d); } }
      } else { tvx = (ex / ed) * spd; tvz = (ez / ed) * spd; }

      // melee
      const reach = player.car ? 2.7 : 1.25 + (this.type === 'brute' ? 0.25 : 0);
      if (d < reach && this.attackCd <= 0 && player.alive) {
        this.attackCd = this.type === 'runner' ? 0.7 : 1.0;
        if (player.car) { player.car.damage(T.dmg * 0.6); }
        else hurtPlayer(T.dmg, this.x, this.z, this.type === 'brute' ? 9 : 3);
      }
      if (player.car && d < 3 && Math.abs(player.car.speed) < 4) player.dragT += dt;
    } else {
      // search: roam toward a rough guess of where the player is
      if (!this.wt || Math.hypot(this.wt.x - this.x, this.wt.z - this.z) < 1.5) {
        const guess = Math.random() < 0.6 ? tp : { x: this.x, z: this.z };
        this.wt = randomOpenPoint(guess.x, guess.z, 5, 45) || { x: this.x, z: this.z };
      }
      const ex = this.wt.x - this.x, ez = this.wt.z - this.z, ed = Math.hypot(ex, ez) || 1;
      let ox = ex / ed, oz = ez / ed;
      if (!los(this.x, this.z, this.wt.x, this.wt.z)) { const n = this.navTo(this.wt); if (n) { ox = n.x; oz = n.z; } }
      tvx = ox * T.walk; tvz = oz * T.walk;
      this.progT += dt;
      if (this.progT > 2) { if (Math.hypot(this.x - this.lx, this.z - this.lz) < 0.6) this.wt = null; this.progT = 0; this.lx = this.x; this.lz = this.z; }
    }

    const acc = Math.min(1, dt * (this.stun > 0 ? 2 : 8));
    this.vx = lerp(this.vx, tvx, acc); this.vz = lerp(this.vz, tvz, acc);
    this.kx *= Math.max(0, 1 - dt * 5); this.kz *= Math.max(0, 1 - dt * 5);
    this.x += (this.vx + this.kx) * dt; this.z += (this.vz + this.kz) * dt;
    resolveCircle(this, 0.35 * T.scale);
    for (const c of G.cars) if (Math.abs(c.x - this.x) < 4 && Math.abs(c.z - this.z) < 4) resolveCircleCar(this, 0.35, c);

    // visuals
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.3) this.face += angDiff(this.face, Math.atan2(this.vx, this.vz)) * Math.min(1, dt * 10);
    if (this.state === 'chase' && (this.hasLOS || d < 10) && d < 30) this.face += angDiff(this.face, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
    this.phase += sp * dt * 2.4;
    const sw = Math.sin(this.phase) * Math.min(1, sp / 3) * 0.8;
    const p = this.p;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    if (this.stun > 0) { p.armL.rotation.x = p.armR.rotation.x = -2.6; }
    else if (this.state === 'chase') {
      if (this.gunner && this.hasLOS && d < 30) { p.armR.rotation.x = -1.5; p.armL.rotation.x = -sw * 0.6; }
      else { p.armL.rotation.x = -1.35 + sw * 0.25; p.armR.rotation.x = -1.35 - sw * 0.25; }
    } else { p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8; }
    this.g.position.set(this.x, groundY(this.x, this.z) + Math.abs(Math.cos(this.phase)) * Math.min(1, sp / 4) * 0.08, this.z);
    this.g.rotation.y = this.face;
    this.marker.visible = this.state === 'chase' && d < 70;
  }
  navTo(t) {
    // local detour: step along the direction that keeps us out of walls
    const a = Math.atan2(t.x - this.x, t.z - this.z);
    for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const nx = this.x + Math.sin(a + off) * 3, nz = this.z + Math.cos(a + off) * 3;
      if (!blocked[cellIdx(nx, nz)]) return { x: Math.sin(a + off), z: Math.cos(a + off) };
    }
    return null;
  }
}

function shout(h) {
  for (const o of G.hunters) if (o !== h && o.state !== 'chase' && Math.abs(o.x - h.x) < 35 && Math.abs(o.z - h.z) < 35) o.alert(mr(0.4, 1.6));
}

const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _dir = new THREE.Vector3();
function hunterShoot(h, d) {
  const s = h.T.scale;
  _from.set(h.x + Math.cos(h.face) * 0.4 * s + Math.sin(h.face) * 0.6, 1.45 * s, h.z - Math.sin(h.face) * 0.4 * s + Math.cos(h.face) * 0.6);
  const tp = targetPos();
  let pHit = (0.3 + G.day * 0.008) * clamp(1.4 - d / 30, 0.4, 1.2);
  if (!player.car && player.sprinting) pHit *= 0.55;
  const hit = Math.random() < pHit;
  _to.set(tp.x, player.car ? 1.2 : player.y + 1.3, tp.z);
  if (!hit) { _to.x += mr(-1.6, 1.6); _to.y += mr(-0.6, 1); _to.z += mr(-1.6, 1.6); _dir.subVectors(_to, _from).normalize(); const w = raycastWorld(_from, _dir, 80); _to.copy(_from).addScaledVector(_dir, w.t); emitPuff(_to.x, _to.y, _to.z, { life: 0.4, vy: 0.5, size0: 0.2, size1: 0.8, alpha: 0.6, color: 0xbbbbbb }); }
  spawnTracer(_from.clone(), _to.clone(), 0xffa060);
  sfx.enemyShot(d);
  if (hit) {
    if (player.car) player.car.damage(7);
    else hurtPlayer(7, h.x, h.z, 1.5);
  }
}

// =====================================================================
// Cars
// =====================================================================
const CG = {
  body: new THREE.BoxGeometry(2.0, 0.66, 4.5).translate(0, 0.7, 0),
  cabin: new THREE.BoxGeometry(1.78, 0.62, 2.3).translate(0, 1.33, -0.25),
  wheel: new THREE.BoxGeometry(0.3, 0.72, 0.72),
  light: new THREE.BoxGeometry(0.45, 0.2, 0.06),
  taxiSign: new THREE.BoxGeometry(0.7, 0.25, 0.3).translate(0, 1.77, -0.3),
};
const CAR_COLORS = [0xe8c020, 0xe8c020, 0xb3202a, 0x2a4fa0, 0xdddddd, 0x222226, 0x2f6b45, 0x9aa0a8, 0x7a2a6a];
const glass = new THREE.MeshLambertMaterial({ color: 0x1e2638 });
const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
const burntMat = new THREE.MeshLambertMaterial({ color: 0x1a1816 });

function resolveCircleCar(p, r, car) {
  const dx = p.x - car.x, dz = p.z - car.z, s = Math.sin(car.heading), c = Math.cos(car.heading);
  const lf = dx * s + dz * c, lr = dx * c - dz * s;
  const qf = clamp(lf, -car.hl, car.hl), qr = clamp(lr, -car.hw, car.hw);
  let ef = lf - qf, er = lr - qr; const d2 = ef * ef + er * er;
  if (d2 > r * r) return false;
  if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; ef *= k; er *= k; }
  else {
    const pf = car.hl - Math.abs(lf), pr = car.hw - Math.abs(lr);
    if (pf < pr) { ef = (pf + r) * (Math.sign(lf) || 1); er = 0; } else { er = (pr + r) * (Math.sign(lr) || 1); ef = 0; }
  }
  p.x += s * ef + c * er; p.z += c * ef - s * er;
  return true;
}

class Car {
  constructor(lane, along) {
    const color = mpick(CAR_COLORS);
    this.taxi = color === 0xe8c020;
    this.g = new THREE.Group();
    this.bodyMat = lam(color);
    this.body = new THREE.Mesh(CG.body, this.bodyMat); this.g.add(this.body);
    this.cabin = new THREE.Mesh(CG.cabin, glass); this.g.add(this.cabin);
    for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) { const w = new THREE.Mesh(CG.wheel, tireMat); w.position.set(x, 0.36, z); this.g.add(w); }
    for (const x of [-0.65, 0.65]) {
      const h = new THREE.Mesh(CG.light, headMat); h.position.set(x, 0.82, 2.26); this.g.add(h);
      const t = new THREE.Mesh(CG.light, tailMat); t.position.set(x, 0.82, -2.26); this.g.add(t);
    }
    if (this.taxi) this.g.add(new THREE.Mesh(CG.taxiSign, lam(0xfff4c0)));
    this.marker = new THREE.Sprite(markerMat); this.marker.scale.setScalar(0.9); this.marker.position.y = 2.7; this.marker.visible = false;
    this.g.add(this.marker);
    scene.add(this.g);
    this.hl = 2.25; this.hw = 1.0;
    this.hp = 100; this.wrecked = false; this.smokeT = 0;
    this.placeOnLane(lane, along);
  }
  placeOnLane(lane, along) {
    this.lane = lane; this.driver = 'traffic';
    this.x = lane.axis === 'z' ? lane.fixed : along; this.z = lane.axis === 'z' ? along : lane.fixed;
    this.heading = lane.axis === 'z' ? (lane.dir > 0 ? 0 : Math.PI) : (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.speed = mr(7, 12); this.cruise = mr(9, 14); this.throttle = 0; this.steer = 0; this.reverseT = 0; this.stuckT = 0;
    this.hp = 100; this.wrecked = false; this.body.material = this.bodyMat; this.honkT = 0;
  }
  damage(n) {
    if (this.wrecked) return;
    this.hp -= n;
    if (this.hp <= 0) this.wreck();
  }
  wreck() {
    this.wrecked = true; this.hp = 0; this.body.material = burntMat; sfx.crash();
    for (let i = 0; i < 8; i++) emitPuff(this.x + mr(-1, 1), 1, this.z + mr(-1, 1), { life: 1.5, vy: mr(1, 3), vx: mr(-2, 2), vz: mr(-2, 2), size0: 1, size1: 4, alpha: 0.7, color: 0x444444 });
    if (this.driver === 'player') { exitCar(true); hurtPlayer(15, this.x, this.z); showMsg('YOUR CAR IS WRECKED'); }
    else if (this.driver === 'hunter') { ejectHunter(this, true); }
    this.driver = null; this.marker.visible = false;
  }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }
  update(dt) {
    let throttle = 0, steer = 0, maxF = 14, brake = false;
    const tp = targetPos();
    if (this.wrecked || !this.driver) {
      throttle = 0; brake = true;
      if (this.wrecked) { this.smokeT -= dt; if (this.smokeT < 0) { this.smokeT = 0.25; emitPuff(this.x, 1.4, this.z, { life: 2.5, vy: 2, vx: mr(-0.5, 0.5), size0: 0.8, size1: 3.5, alpha: 0.5, color: 0x333333 }); } }
    } else if (this.driver === 'traffic') {
      maxF = this.cruise;
      let target = this.cruise;
      for (const o of G.cars) {
        if (o === this) continue;
        const ax = o.x - this.x, az = o.z - this.z, ahead = ax * this.fx + az * this.fz, side = Math.abs(ax * this.fz - az * this.fx);
        if (ahead > 0 && ahead < 9 && side < 2.2) target = Math.min(target, ahead < 5.5 ? 0 : o.speed * 0.9);
      }
      if (!player.car) {
        const ax = player.x - this.x, az = player.z - this.z, ahead = ax * this.fx + az * this.fz, side = Math.abs(ax * this.fz - az * this.fx);
        if (ahead > 2 && ahead < 11 && side < 1.8) { target = 0; this.honkT -= dt; if (this.honkT < 0 && ahead < 9) { this.honkT = 2.5; if (G.mode === 'playing') sfx.horn(); } }
      }
      throttle = this.speed < target ? 1 : 0; brake = this.speed > target + 0.5;
      // wrap around the city edge
      const along = this.lane.axis === 'z' ? this.z : this.x;
      if (along * this.lane.dir > HALF + RD / 2 + 4) {
        const back = -this.lane.dir * (HALF + RD / 2 + 3);
        if (Math.hypot((this.lane.axis === 'z' ? this.x : back) - player.x, (this.lane.axis === 'z' ? back : this.z) - player.z) > 25) {
          if (this.lane.axis === 'z') this.z = back; else this.x = back;
        }
      }
    } else if (this.driver === 'hunter') {
      maxF = 17 * Math.min(1.25, dayMult());
      const dx = tp.x - this.x, dz = tp.z - this.z, d = Math.hypot(dx, dz);
      let ax = tp.x, az = tp.z;
      if (d > 20 && !los(this.x, this.z, tp.x, tp.z)) { const n = navTarget(this.x + this.fx * 3, this.z + this.fz * 3, 4); if (n) { ax = n.x; az = n.z; } }
      const want = Math.atan2(ax - this.x, az - this.z), diff = angDiff(this.heading, want);
      steer = clamp(diff * 2.2, -1, 1); throttle = Math.abs(diff) > 1.3 ? 0.5 : 1;
      if (this.reverseT > 0) { this.reverseT -= dt; throttle = -1; steer = -steer; }
      else if (Math.abs(this.speed) < 1.2) { this.stuckT += dt; if (this.stuckT > 1) { this.reverseT = 1.3; this.stuckT = 0; } }
      else this.stuckT = 0;
    } else if (this.driver === 'player') {
      maxF = 27;
      throttle = input.fwd; steer = -input.side; brake = input.jump;
      if (throttle < 0 && this.speed > 1) { brake = true; throttle = 0; }
    }

    // arcade physics
    if (throttle > 0) this.speed += throttle * (this.driver === 'player' ? 13 : 9) * dt;
    else if (throttle < 0) this.speed = Math.max(-8, this.speed + throttle * 9 * dt);
    if (brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 22 * dt);
    this.speed -= this.speed * 0.25 * dt;
    if (!throttle && !brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2 * dt);
    this.speed = clamp(this.speed, -8, maxF);
    this.heading += steer * 1.9 * clamp(this.speed / 6, -1, 1) * dt;
    this.x += this.fx * this.speed * dt; this.z += this.fz * this.speed * dt;

    // static collisions (two circles along the body)
    let hitWall = false;
    for (const off of [1.25, -1.25]) {
      const c = { x: this.x + this.fx * off, z: this.z + this.fz * off };
      const ox = c.x, oz = c.z;
      if (resolveCircle(c, 1.05)) { this.x += c.x - ox; this.z += c.z - oz; hitWall = true; }
    }
    if (hitWall && Math.abs(this.speed) > 2) {
      const impact = Math.abs(this.speed);
      if (impact > 9) { this.damage((impact - 8) * 3); if (this.driver === 'player') { G.shake = 0.4; sfx.crash(); } }
      this.speed *= 0.35;
    }
    this.g.position.set(this.x, 0, this.z);
    this.g.rotation.y = this.heading;
    this.marker.visible = this.driver === 'hunter';
  }
}

function carInteractions(dt) {
  const cars = G.cars;
  // car vs car
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (Math.abs(a.x - b.x) > 6 || Math.abs(a.z - b.z) > 6) continue;
    let touched = false;
    for (const oa of [1.25, -1.25]) for (const ob of [1.25, -1.25]) {
      const ax = a.x + a.fx * oa, az = a.z + a.fz * oa, bx = b.x + b.fx * ob, bz = b.z + b.fz * ob;
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
      if (d < 2.1 && d > 1e-4) { const k = (2.1 - d) / d * 0.5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; touched = true; }
    }
    if (touched) {
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 8) { a.damage(rel * 1.5); b.damage(rel * 1.5); if (a.driver === 'player' || b.driver === 'player') { sfx.crash(); G.shake = 0.35; } }
      a.speed *= 0.6; b.speed *= 0.6;
    }
  }
  // cars vs people
  for (const c of cars) {
    const sp = Math.abs(c.speed);
    for (const h of G.hunters) {
      if (h.dead || Math.abs(h.x - c.x) > 3.5 || Math.abs(h.z - c.z) > 3.5) continue;
      const before = { x: h.x, z: h.z };
      if (resolveCircleCar(before, 0.4, c)) {
        if (sp > 5) { h.die({ x: c.fx * c.speed * 0.9 + mr(-1, 1), y: 3 + sp * 0.3, z: c.fz * c.speed * 0.9 + mr(-1, 1) }, 0.8, c.driver === 'player'); sfx.thud(); if (c.driver === 'player') c.damage(2); }
        else { h.x = before.x; h.z = before.z; }
      }
    }
    if (!player.car && player.alive && c.driver !== 'player') {
      const p = { x: player.x, z: player.z };
      if (resolveCircleCar(p, 0.4, c)) {
        if (sp > 5 && player.carHitCd <= 0 && player.y < 0.9) {
          player.carHitCd = 1.2;
          hurtPlayer(Math.min(55, sp * 2.4), c.x - c.fx * 3, c.z - c.fz * 3, 6 + sp * 0.5);
          sfx.thud(); c.speed *= 0.5;
        } else { player.x = p.x; player.z = p.z; }
      }
    }
  }
}

function ejectHunter(car, dead) {
  const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
  const p = { x: car.x - rx * 2, z: car.z - rz * 2 };
  resolveCircle(p, 0.4);
  const h = new Hunter(p.x, p.z, 'civ', false, 'chase');
  h.stun = 0.9;
  G.hunters.push(h);
  if (dead) h.die({ x: -rx * 4, y: 3, z: -rz * 4 }, 1);
}

function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of G.cars) { if (c.wrecked) continue; const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function enterCar() {
  const c = nearestCar(3.6);
  if (!c) return;
  if (c.driver === 'traffic' || c.driver === 'hunter') { ejectHunter(c, false); showMsg('CAR STOLEN'); }
  c.driver = 'player'; player.car = c; player.dragT = 0; player.camOff = 0;
  player.yaw = c.heading + Math.PI;
  sfx.pickup();
}
function exitCar(forced = false) {
  const c = player.car; if (!c) return;
  if (!forced && Math.abs(c.speed) > 6) return;
  const rx = Math.cos(c.heading), rz = -Math.sin(c.heading);
  const p = { x: c.x - rx * 2.2, z: c.z - rz * 2.2 };
  resolveCircle(p, 0.4);
  if (resolveCircleCar(p, 0.4, c)) { p.x = c.x + rx * 2.2; p.z = c.z + rz * 2.2; resolveCircle(p, 0.4); }
  player.x = p.x; player.z = p.z; player.y = 0; player.vy = 0;
  player.yaw = c.heading + Math.PI; player.pitch = 0;
  if (!c.wrecked) c.driver = null;
  player.car = null;
}

// =====================================================================
// Pickups
// =====================================================================
const pickGeo = { health: new THREE.CylinderGeometry(0.18, 0.18, 0.5, 10), ammo: new THREE.BoxGeometry(0.55, 0.32, 0.38) };
const pickMat = { health: new THREE.MeshBasicMaterial({ color: 0x3cff6a }), ammo: new THREE.MeshBasicMaterial({ color: 0xffc83a }) };
function randomSidewalkPoint() {
  const b = blockRects[Math.floor(Math.random() * blockRects.length)];
  for (let t = 0; t < 10; t++) {
    const side = Math.floor(Math.random() * 4);
    let x, z;
    if (side < 2) { x = mr(b.x0 + 1, b.x1 - 1); z = side ? b.z0 + 1.5 : b.z1 - 1.5; }
    else { z = mr(b.z0 + 1, b.z1 - 1); x = side === 2 ? b.x0 + 1.5 : b.x1 - 1.5; }
    if (!blocked[cellIdx(x, z)]) return { x, z };
  }
  return { x: b.x0 - 3, z: b.z0 - 3 };
}
class Pickup {
  constructor(kind) {
    this.kind = kind;
    this.m = new THREE.Mesh(pickGeo[kind], pickMat[kind]);
    scene.add(this.m);
    this.respawnT = 0; this.place();
  }
  place() { const p = randomSidewalkPoint(); this.x = p.x; this.z = p.z; this.m.visible = true; this.active = true; }
  update(dt, t) {
    if (!this.active) { this.respawnT -= dt; if (this.respawnT <= 0) this.place(); return; }
    this.m.position.set(this.x, 0.75 + Math.sin(t * 3 + this.x) * 0.12, this.z);
    this.m.rotation.y = t * 2;
    if (!player.car && Math.hypot(player.x - this.x, player.z - this.z) < 1.4) {
      if (this.kind === 'health') { if (player.hp >= 100) return; player.hp = Math.min(100, player.hp + 35); player.stam = 100; showMsg('+35 HEALTH'); }
      else { player.reserve = Math.min(180, player.reserve + 24); showMsg('+24 AMMO'); }
      sfx.pickup();
      this.active = false; this.m.visible = false; this.respawnT = 35;
    }
  }
}

// =====================================================================
// View model: hands + pistol
// =====================================================================
const vm = new THREE.Group();
vmCamera.add(vm);
const vmSkin = new THREE.MeshLambertMaterial({ color: 0xd99a6c });
const vmSleeve = new THREE.MeshLambertMaterial({ color: 0x2b3550 });
const vmGunMat = new THREE.MeshLambertMaterial({ color: 0x202024 });
function makeArm(side) {
  const a = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.55).translate(0, 0, 0.12), vmSleeve);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.16).translate(0, 0, -0.22), vmSkin);
  a.add(sleeve, hand);
  a.position.set(side * 0.2, -0.24, -0.42);
  a.rotation.set(0.05, side * 0.18, 0);
  vm.add(a);
  return a;
}
const armR = makeArm(1), armL = makeArm(-1);
const gun = new THREE.Group();
gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.3).translate(0, 0.07, -0.33), vmGunMat));
gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.08).translate(0, -0.02, -0.24), vmGunMat));
armR.add(gun);
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
flash.position.set(0, 0.07, -0.55); flash.scale.setScalar(0.25); flash.visible = false;
armR.add(flash);
armL.position.set(-0.08, -0.27, -0.42); armL.rotation.set(0.1, -0.5, 0);

// =====================================================================
// Shooting
// =====================================================================
function raycastWorld(o, d, maxT) {
  let best = maxT;
  // ground
  if (d.y < -1e-4) { const t = -o.y / d.y; if (t > 0 && t < best) best = t; }
  for (const c of colliders) {
    let t0 = 0, t1 = best;
    const sl = (oo, dd, mn, mx) => {
      if (Math.abs(dd) < 1e-8) return oo >= mn && oo <= mx;
      let a = (mn - oo) / dd, b = (mx - oo) / dd; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); return t0 <= t1;
    };
    if (sl(o.x, d.x, c.x0, c.x1) && sl(o.z, d.z, c.z0, c.z1) && sl(o.y, d.y, 0, c.h + 0.7) && t0 < best) best = t0;
  }
  return { t: best };
}
function rayCylinder(o, d, cx, cz, r, y0, y1, maxT) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-8) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxT) return -1;
  const y = o.y + d.y * t;
  return y >= y0 && y <= y1 ? t : -1;
}
function rayCar(o, d, car, maxT) {
  const s = Math.sin(car.heading), c = Math.cos(car.heading);
  const ox = o.x - car.x, oz = o.z - car.z;
  const lo = { f: ox * s + oz * c, r: ox * c - oz * s, y: o.y }, ld = { f: d.x * s + d.z * c, r: d.x * c - d.z * s, y: d.y };
  let t0 = 0, t1 = maxT;
  for (const [k, mn, mx] of [['f', -car.hl, car.hl], ['r', -car.hw, car.hw], ['y', 0.1, 1.7]]) {
    if (Math.abs(ld[k]) < 1e-8) { if (lo[k] < mn || lo[k] > mx) return -1; continue; }
    let a = (mn - lo[k]) / ld[k], b = (mx - lo[k]) / ld[k]; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
  }
  return t0;
}

const _camDir = new THREE.Vector3();
function playerShoot() {
  if (player.car || !player.alive) return;
  if (player.reloadT > 0 || player.fireCd > 0) return;
  if (player.mag <= 0) { if (player.reserve > 0) startReload(); else { sfx.empty(); showMsg('OUT OF AMMO'); } return; }
  player.mag--; player.fireCd = 0.17; player.recoil = 1;
  sfx.shot();
  flash.visible = true; flash.material.rotation = Math.random() * 6; setTimeout(() => (flash.visible = false), 45);
  camera.getWorldDirection(_camDir);
  const spread = 0.008 + Math.min(0.03, Math.hypot(player.vx, player.vz) * 0.002);
  _camDir.x += mr(-spread, spread); _camDir.y += mr(-spread, spread); _camDir.z += mr(-spread, spread); _camDir.normalize();
  const o = camera.position;
  let tHit = raycastWorld(o, _camDir, 150).t, target = null, carHit = null;
  for (const h of G.hunters) {
    if (h.dead) continue;
    const s = h.T.scale;
    const t = rayCylinder(o, _camDir, h.x, h.z, 0.36 * s, 0, 1.95 * s, tHit);
    if (t > 0 && t < tHit) { tHit = t; target = h; carHit = null; }
  }
  for (const c of G.cars) {
    const t = rayCar(o, _camDir, c, tHit);
    if (t > 0 && t < tHit) { tHit = t; carHit = c; target = null; }
  }
  const hitP = o.clone().addScaledVector(_camDir, tHit);
  // tracer starts at the gun muzzle (approx. in world space)
  const muzzle = new THREE.Vector3(0.2, -0.18, -0.6).applyMatrix4(camera.matrixWorld);
  spawnTracer(muzzle, hitP);
  if (target) {
    const head = hitP.y > 1.5 * target.T.scale;
    const dl = Math.hypot(_camDir.x, _camDir.z) || 1;
    target.damage(head ? 3 : 1, _camDir.x / dl, _camDir.z / dl, hitP.y);
    sfx.hit();
    emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.25, vy: 0.3, size0: 0.15, size1: 0.6, alpha: 0.9, color: 0xffffff });
    if (target.dead) showMsg(head ? 'HEADSHOT' : 'TAKEDOWN');
  } else if (carHit) {
    carHit.damage(5);
    emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.3, vy: 0.4, size0: 0.15, size1: 0.6, alpha: 0.9, color: 0xffe0a0 });
    if (carHit.driver === 'traffic') { carHit.driver = 'hunter'; }
  } else {
    emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.5, vy: 0.6, size0: 0.2, size1: 0.9, alpha: 0.6, color: 0xbbbbbb });
  }
  // gunfire is loud
  for (const h of G.hunters) if (Math.abs(h.x - player.x) < 45 && Math.abs(h.z - player.z) < 45) h.alert(mr(0.2, 1));
}
function startReload() {
  if (player.reloadT > 0 || player.mag >= 12 || player.reserve <= 0 || player.car) return;
  player.reloadT = 1.3; sfx.reload();
}

function playerShove() {
  if (player.car || player.shoveCd > 0 || !player.alive) return;
  player.shoveCd = 0.55; player.shoveAnim = 1; sfx.shove();
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (const h of G.hunters) {
    if (h.dead) continue;
    const dx = h.x - player.x, dz = h.z - player.z, d = Math.hypot(dx, dz);
    if (d < 2.8 && (dx * fx + dz * fz) / (d || 1) > 0.25) {
      h.kx += (dx / d) * 13 * h.T.knock; h.kz += (dz / d) * 13 * h.T.knock;
      h.stun = Math.max(h.stun, h.T.stun);
      h.alert();
    }
  }
}

// =====================================================================
// Input
// =====================================================================
const input = { fwd: 0, side: 0, sprint: false, jump: false, runToggle: false };
const keys = new Set();
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
function recomputeKeys() {
  if (isTouch && stick.id !== null) return;
  input.fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  input.side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || input.runToggle;
  input.jump = keys.has('Space') || touchJump;
}
let touchJump = false;
window.addEventListener('keydown', (e) => {
  if (G.mode !== 'playing') return;
  keys.add(e.code); recomputeKeys();
  if (e.code === 'KeyE') { player.car ? exitCar() : enterCar(); }
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyF') playerShove();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); recomputeKeys(); });
window.addEventListener('blur', () => { keys.clear(); recomputeKeys(); });

function look(dx, dy, sens) {
  if (player.car) { player.camOff -= dx * sens; return; }
  player.yaw -= dx * sens;
  player.pitch = clamp(player.pitch - dy * sens, -1.45, 1.45);
}
// Mouse look uses pointer lock; where the browser refuses it (e.g. inside an embedded frame)
// we fall back to click-and-drag looking.
let hadLock = false, lockFailed = false;
document.addEventListener('mousemove', (e) => {
  if (G.mode !== 'playing') return;
  if (document.pointerLockElement === canvas) look(e.movementX, e.movementY, 0.0022);
  else if (lockFailed && e.buttons) look(e.movementX, e.movementY, 0.004);
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; });
canvas.addEventListener('mousedown', (e) => {
  if (isTouch || G.mode !== 'playing') return;
  if (document.pointerLockElement !== canvas && !lockFailed) { lockPointer(); return; }
  if (e.button === 0) playerShoot();
  if (e.button === 2) playerShove();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function lockPointer() {
  if (isTouch) return;
  if (!canvas.requestPointerLock) { lockFailed = true; return; }
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { lockFailed = true; }); } catch { lockFailed = true; }
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { hadLock = true; return; }
  if (hadLock && !isTouch && G.mode === 'playing') pauseGame();
  hadLock = false;
});
window.addEventListener('keydown', (e) => { if (e.code === 'Escape' || e.code === 'KeyP') { if (G.mode === 'playing') pauseGame(); } });

// touch controls
const stick = { id: null, cx: 0, cy: 0 };
let lookTouch = null;
if (isTouch) {
  document.body.classList.add('is-touch');
  $('controls-desktop').classList.add('hidden');
  $('controls-touch').classList.remove('hidden');
  const stickEl = $('stick'), knob = $('stick-knob');
  window.addEventListener('touchstart', (e) => {
    if (G.mode !== 'playing') return;
    for (const t of e.changedTouches) {
      if (t.target.classList && t.target.classList.contains('tbtn')) continue;
      if (t.clientX < window.innerWidth * 0.45 && stick.id === null) {
        const r = stickEl.getBoundingClientRect();
        stick.id = t.identifier; stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2;
      } else if (lookTouch === null) lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) {
        let dx = (t.clientX - stick.cx) / 55, dy = (t.clientY - stick.cy) / 55; const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        input.side = dx; input.fwd = -dy;
        input.sprint = input.runToggle || l > 0.98;
        knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
      } else if (lookTouch && t.identifier === lookTouch.id) {
        look(t.clientX - lookTouch.x, t.clientY - lookTouch.y, 0.0055);
        lookTouch.x = t.clientX; lookTouch.y = t.clientY;
      }
    }
  }, { passive: true });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) { stick.id = null; input.fwd = input.side = 0; input.sprint = input.runToggle; knob.style.transform = ''; }
      if (lookTouch && t.identifier === lookTouch.id) lookTouch = null;
    }
  };
  window.addEventListener('touchend', endTouch); window.addEventListener('touchcancel', endTouch);
  const btn = (id, down, up) => {
    const el = $(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(el); }, { passive: false });
    if (up) el.addEventListener('touchend', (e) => { e.preventDefault(); up(el); }, { passive: false });
  };
  let fireHeld = null;
  btn('btn-fire', () => { playerShoot(); clearInterval(fireHeld); fireHeld = setInterval(playerShoot, 220); }, () => clearInterval(fireHeld));
  btn('btn-shove', playerShove);
  btn('btn-jump', () => { touchJump = true; input.jump = true; }, () => { touchJump = false; input.jump = false; });
  btn('btn-run', (el) => { input.runToggle = !input.runToggle; input.sprint = input.runToggle; el.classList.toggle('on', input.runToggle); });
  btn('btn-car', () => (player.car ? exitCar() : enterCar()));
  btn('btn-reload', startReload);
  btn('btn-pause', pauseGame);
}

// =====================================================================
// HUD
// =====================================================================
const hud = {
  day: $('hud-day-num'), reward: $('hud-reward'), time: $('hud-time'), alert: $('hud-alert'), msg: $('hud-msg'), banner: $('hud-banner'),
  hp: $('bar-health'), st: $('bar-stamina'), clock: $('hud-clock'), vig: $('vignette'), ammo: $('hud-ammo'), prompt: $('hud-prompt'),
  carbar: $('carbar'), carhp: $('bar-car'), kills: $('hud-kills'), cross: $('crosshair'), btnCar: $('btn-car'),
};
$('hud-city').textContent = CFG.cityName;
$('hud-day-total').textContent = ' / ' + CFG.days;
function showMsg(t, dur = 2) { hud.msg.textContent = t; hud.msg.classList.add('show'); G.msgT = dur; }
let bannerT = 0;
function showBanner(html, dur = 3) { hud.banner.innerHTML = html; hud.banner.classList.add('show'); bannerT = dur; }

const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const W = 170, range = 95, sc = W / 2 / range, tp = targetPos();
  mm.save();
  mm.clearRect(0, 0, W, W);
  mm.beginPath(); mm.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mm.clip();
  mm.fillStyle = '#3a3842'; mm.fillRect(0, 0, W, W);
  mm.translate(W / 2, W / 2);
  const yaw = player.car ? player.car.heading + Math.PI + player.camOff : player.yaw;
  mm.rotate(yaw);
  mm.scale(sc, sc);
  mm.translate(-tp.x, -tp.z);
  mm.fillStyle = '#7d7886';
  for (const b of blockRects) if (Math.abs(b.x0 - tp.x) < range + 60 && Math.abs(b.z0 - tp.z) < range + 60) mm.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  mm.fillStyle = '#56525e';
  for (const c of colliders) if (c.x1 - c.x0 > 2 && Math.abs(c.x0 - tp.x) < range + 40 && Math.abs(c.z0 - tp.z) < range + 40) mm.fillRect(c.x0, c.z0, c.x1 - c.x0, c.z1 - c.z0);
  for (const p of G.pickups) if (p.active) { mm.fillStyle = p.kind === 'health' ? '#3cff6a' : '#ffc83a'; mm.fillRect(p.x - 1.5, p.z - 1.5, 3, 3); }
  for (const c of G.cars) {
    mm.save(); mm.translate(c.x, c.z); mm.rotate(-c.heading);
    mm.fillStyle = c.driver === 'hunter' ? '#ff3b3b' : c.driver === 'player' ? '#5ab4ff' : c.wrecked ? '#222' : '#e6e6e6';
    mm.fillRect(-1.1, -2.3, 2.2, 4.6); mm.restore();
  }
  for (const h of G.hunters) {
    if (h.dead) continue;
    mm.fillStyle = h.state === 'chase' ? '#ff3b3b' : '#c9b8b8';
    mm.beginPath(); mm.arc(h.x, h.z, h.state === 'chase' ? 2.2 : 1.6, 0, Math.PI * 2); mm.fill();
  }
  mm.restore();
  // player arrow (always points up)
  mm.fillStyle = '#5ab4ff'; mm.strokeStyle = '#fff'; mm.lineWidth = 1.5;
  mm.beginPath(); mm.moveTo(W / 2, W / 2 - 8); mm.lineTo(W / 2 + 6, W / 2 + 6); mm.lineTo(W / 2, W / 2 + 3); mm.lineTo(W / 2 - 6, W / 2 + 6); mm.closePath(); mm.fill(); mm.stroke();
}

let hudT = 0;
function updateHUD(dt) {
  hudT -= dt;
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0) hud.msg.classList.remove('show'); }
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) hud.banner.classList.remove('show'); }
  G.hurtFlash = Math.max(0, G.hurtFlash - dt * 1.4);
  hud.vig.style.opacity = Math.max(G.hurtFlash, player.hp < 30 ? 0.35 + Math.sin(G.elapsed * 6) * 0.1 : 0).toFixed(2);
  hud.hp.style.width = player.hp + '%';
  hud.st.style.width = player.stam + '%';
  hud.st.style.opacity = player.exhausted ? 0.45 : 1;
  drawMinimap();
  if (hudT > 0) return;
  hudT = 0.1;
  hud.day.textContent = Math.min(G.day, CFG.days);
  const dayF = G.elapsed / CFG.dayLength;
  hud.reward.textContent = fmtMoney(CFG.baseReward * Math.pow(1.11, dayF) + G.kills * 2_500_000);
  hud.time.textContent = fmtTime(G.elapsed) + ' survived';
  hud.kills.textContent = G.kills ? G.kills + (G.kills === 1 ? ' TAKEDOWN' : ' TAKEDOWNS') : '';
  const hh = Math.floor(G.hour), mn = Math.floor((G.hour - hh) * 60 / 15) * 15;
  hud.clock.textContent = String(hh).padStart(2, '0') + ':' + String(mn).padStart(2, '0') + (G.dayAmt < 0.3 ? '  NIGHT' : '');
  const chasing = G.hunters.filter((h) => !h.dead && h.state === 'chase').length + G.cars.filter((c) => c.driver === 'hunter').length;
  if (chasing) { hud.alert.textContent = `${chasing} HUNTING YOU`; hud.alert.className = 'hot'; }
  else { hud.alert.textContent = 'NOBODY SEES YOU'; hud.alert.className = 'calm'; }
  hud.ammo.innerHTML = player.car ? '' : player.reloadT > 0 ? 'RELOADING…' : `<b>${player.mag}</b> / ${player.reserve}`;
  hud.carbar.classList.toggle('hidden', !player.car);
  if (player.car) hud.carhp.style.width = player.car.hp + '%';
  hud.cross.classList.toggle('hidden', !!player.car);
  let prompt = '';
  if (player.car) prompt = Math.abs(player.car.speed) > 6 ? '' : (isTouch ? 'Tap CAR to get out' : 'Press E to get out');
  else if (nearestCar(3.6)) prompt = isTouch ? 'Tap CAR to steal it' : 'Press E to steal this car';
  hud.prompt.textContent = prompt;
  if (hud.btnCar) hud.btnCar.classList.toggle('hidden', !(player.car || nearestCar(3.6)));
}

// =====================================================================
// Day / night lighting
// =====================================================================
const C_NIGHT = new THREE.Color(0x0a0c1c), C_DAY = new THREE.Color(0x9fb4d4), C_DUSK = new THREE.Color(0x9a6c9e);
const C_SUN_DAY = new THREE.Color(0xfff0dd), C_SUN_DUSK = new THREE.Color(0xff9a55);
function updateLighting() {
  const h = G.hour;
  const elev = Math.sin(((h - 6) / 12) * Math.PI);
  const dayAmt = smoothstep(-0.12, 0.3, elev);
  const dusk = Math.exp(-Math.pow((elev - 0.02) / 0.22, 2));
  G.dayAmt = dayAmt;
  const sky = C_NIGHT.clone().lerp(C_DAY, dayAmt).lerp(C_DUSK, dusk * 0.75);
  scene.background.copy(sky); scene.fog.color.copy(sky);
  scene.fog.near = lerp(10, 25, dayAmt); scene.fog.far = lerp(130, 240, dayAmt);
  hemi.intensity = 0.55 + dayAmt * 0.65 + dusk * 0.15;
  hemi.color.copy(C_NIGHT.clone().lerp(new THREE.Color(0xc8c8ff), 0.5 + dayAmt * 0.5));
  sun.intensity = dayAmt * 1.3 + dusk * 0.35;
  sun.color.copy(C_SUN_DAY).lerp(C_SUN_DUSK, dusk);
  const ang = ((h - 6) / 12) * Math.PI;
  sun.position.set(Math.cos(ang) * 150, Math.max(20, Math.sin(ang) * 160), 60);
  const win = 0.18 + (1 - dayAmt) * 0.95 + dusk * 0.2;
  for (const m of facadeMats) m.emissiveIntensity = win;
}

// =====================================================================
// Game flow
// =====================================================================
function spawnHunter(minD = 55, maxD = 150, state = 'search') {
  const tp = targetPos();
  let p = null;
  for (let t = 0; t < 12 && !p; t++) {
    const c = randomOpenPoint(tp.x, tp.z, minD, maxD, 4);
    if (c && !(Math.hypot(c.x - tp.x, c.z - tp.z) < 70 && los(c.x, c.z, tp.x, tp.z))) p = c;
  }
  if (!p) return;
  const r = Math.random();
  const type = r < 0.15 ? 'brute' : r < 0.4 ? 'runner' : 'civ';
  const gunner = type !== 'brute' && Math.random() < Math.min(0.08 + (G.day - 1) * 0.022, 0.5);
  G.hunters.push(new Hunter(p.x, p.z, type, gunner, state));
}
const targetHunters = () => Math.min(22 + G.day * 5, 85);

function clearWorld() {
  for (const h of G.hunters) h.remove();
  G.hunters.length = 0;
  for (const r of ragdolls) r.dispose();
  ragdolls.length = 0;
  for (const c of G.cars) scene.remove(c.g);
  G.cars.length = 0;
}
function spawnTraffic(count) {
  for (let i = 0; i < count; i++) {
    for (let t = 0; t < 20; t++) {
      const lane = mpick(lanes), along = mr(-HALF, HALF);
      const x = lane.axis === 'z' ? lane.fixed : along, z = lane.axis === 'z' ? along : lane.fixed;
      if (Math.hypot(x - player.x, z - player.z) < 14) continue;
      if (G.cars.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) continue;
      G.cars.push(new Car(lane, along));
      break;
    }
  }
}

function resetGame() {
  clearWorld();
  Object.assign(player, { x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, yaw: Math.PI / 4, pitch: 0, hp: 100, stam: 100, exhausted: false, lastHurt: 99, shoveCd: 0, kx: 0, kz: 0, alive: true, car: null, mag: 12, reserve: 48, reloadT: 0, fireCd: 0, dragT: 0, carHitCd: 0, camOff: 0 });
  Object.assign(G, { elapsed: 0, day: 1, kills: 0, pingT: 40, spawnT: 0, flowT: 0, hunterCarT: 30, overT: 0, shake: 0, hurtFlash: 0 });
  spawnTraffic(30);
  computeFlow(0, 0);
  for (let i = 0; i < targetHunters(); i++) spawnHunter(40, 170);
  if (!G.pickups.length) { for (let i = 0; i < 12; i++) G.pickups.push(new Pickup('health')); for (let i = 0; i < 12; i++) G.pickups.push(new Pickup('ammo')); }
  else for (const p of G.pickups) p.place();
}

function startGame() {
  initAudio();
  resetGame();
  G.mode = 'playing';
  $('menu').classList.add('hidden'); $('over').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  lockPointer();
  showBanner(`DAY 1<small>EVERYONE IS AFTER THE BOUNTY</small>`, 3.5);
}
function pauseGame() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  keys.clear(); recomputeKeys();
  $('pause').classList.remove('hidden');
}
function resumeGame() {
  initAudio();
  G.mode = 'playing';
  $('pause').classList.add('hidden');
  lockPointer();
}
function toMenu() {
  G.mode = 'menu';
  for (const id of ['pause', 'over', 'hud', 'touch']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  showBest();
}
function killPlayer() {
  if (!player.alive) return;
  player.alive = false;
  if (player.car) exitCar(true);
  G.overT = 1.8;
}
function endGame(won) {
  G.mode = 'over';
  if (document.exitPointerLock) document.exitPointerLock();
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  const days = won ? CFG.days : G.day;
  $('over-title').textContent = won ? 'YOU SURVIVED' : 'CAUGHT';
  $('over-text').textContent = won
    ? `30 days. The whole city came for you and nobody collected.`
    : `Someone in ${CFG.cityName} just got very rich.`;
  $('over-stats').innerHTML = `Reached <b>Day ${days}</b> of ${CFG.days}<br>Survived <b>${fmtTime(G.elapsed)}</b><br><b>${G.kills}</b> hunters taken down`;
  const best = loadBest();
  try { if (!best || G.elapsed > best.time) localStorage.setItem('hunted.best', JSON.stringify({ time: G.elapsed, day: days, kills: G.kills })); } catch { /* storage unavailable */ }
  $('over').classList.remove('hidden');
}
function loadBest() { try { return JSON.parse(localStorage.getItem('hunted.best') || 'null'); } catch { return null; } }
function showBest() {
  const best = loadBest();
  $('best').textContent = best ? `Best run: Day ${best.day}, ${fmtTime(best.time)} survived, ${best.kills} takedowns` : '';
}
$('btn-play').addEventListener('click', startGame);
$('btn-again').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-quit').addEventListener('click', toMenu);
$('btn-menu').addEventListener('click', toMenu);
showBest();

// =====================================================================
// Per-frame updates
// =====================================================================
function updatePlayer(dt) {
  player.shoveCd -= dt; player.fireCd -= dt; player.carHitCd -= dt; player.lastHurt += dt;
  player.recoil = Math.max(0, player.recoil - dt * 8); player.shoveAnim = Math.max(0, player.shoveAnim - dt * 4);
  if (player.reloadT > 0) { player.reloadT -= dt; if (player.reloadT <= 0) { const n = Math.min(12 - player.mag, player.reserve); player.mag += n; player.reserve -= n; } }
  if (player.lastHurt > 4 && player.hp < 100 && player.alive) player.hp = Math.min(100, player.hp + 2.5 * dt);

  if (player.car) {
    const c = player.car;
    player.x = c.x; player.z = c.z;
    if (player.dragT > 1.8) { player.dragT = 0; exitCar(true); hurtPlayer(10, c.x, c.z); showMsg('THEY DRAGGED YOU OUT!'); }
    player.dragT = Math.max(0, player.dragT - dt * 0.5);
    if (Math.abs(c.speed) > 3) player.camOff *= Math.max(0, 1 - dt * 2);
    return;
  }
  if (!player.alive) return;
  const moving = input.fwd !== 0 || input.side !== 0;
  let sprint = input.sprint && moving && !player.exhausted && input.fwd >= 0;
  if (sprint) { player.stam -= 20 * dt; if (player.stam <= 0) { player.stam = 0; player.exhausted = true; } }
  else player.stam = Math.min(100, player.stam + (moving ? 10 : 18) * dt);
  if (player.exhausted && player.stam > 30) player.exhausted = false;
  player.sprinting = sprint;
  const speed = sprint ? 10 : 5.8;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  let mx = fx * input.fwd + rx * input.side, mz = fz * input.fwd + rz * input.side; const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const acc = Math.min(1, dt * (player.y > 0.05 ? 3 : 12));
  player.vx = lerp(player.vx, mx * speed, acc); player.vz = lerp(player.vz, mz * speed, acc);
  player.kx *= Math.max(0, 1 - dt * 6); player.kz *= Math.max(0, 1 - dt * 6);
  player.x += (player.vx + player.kx) * dt; player.z += (player.vz + player.kz) * dt;
  resolveCircle(player, 0.4);
  // jump
  if (input.jump && player.y <= 0.001) player.vy = 7.2;
  player.vy -= 22 * dt; player.y = Math.max(0, player.y + player.vy * dt);
  if (player.y === 0) player.vy = 0;
  // hunters push the player a little (crowd pressure)
  for (const h of G.hunters) {
    if (h.dead) continue;
    const dx = player.x - h.x, dz = player.z - h.z, d = Math.hypot(dx, dz), m = 0.4 + 0.35 * h.T.scale;
    if (d < m && d > 1e-4) { const k = (m - d) / d * 0.5; player.x += dx * k; player.z += dz * k; h.x -= dx * k; h.z -= dz * k; }
  }
  player.bob += Math.hypot(player.vx, player.vz) * dt * 1.6;
}

function separateHunters() {
  const hs = G.hunters;
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
    const a = hs[i], b = hs[j];
    const dx = b.x - a.x, dz = b.z - a.z;
    if (dx > 0.9 || dx < -0.9 || dz > 0.9 || dz < -0.9) continue;
    const d = Math.hypot(dx, dz);
    if (d < 0.8 && d > 1e-4) { const k = (0.8 - d) / d * 0.5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
  }
}

function updateCamera(dt) {
  G.shake = Math.max(0, G.shake - dt * 1.5);
  const sx = (Math.random() - 0.5) * G.shake * 0.3, sy = (Math.random() - 0.5) * G.shake * 0.3;
  if (G.mode === 'menu') {
    const t = performance.now() / 1000;
    camera.position.set(Math.sin(t * 0.05) * 6, 2.2, Math.cos(t * 0.05) * 6);
    camera.rotation.set(0.04, t * 0.06, 0);
    vm.visible = false;
    return;
  }
  if (player.car) {
    const c = player.car, yaw = c.heading + player.camOff;
    const want = new THREE.Vector3(c.x - Math.sin(yaw) * 7.5, 3.3, c.z - Math.cos(yaw) * 7.5);
    const p = { x: want.x, z: want.z };
    resolveCircle(p, 0.3); want.x = p.x; want.z = p.z;
    camera.position.lerp(want, Math.min(1, dt * 8));
    camera.lookAt(c.x + Math.sin(yaw) * 3, 1.3, c.z + Math.cos(yaw) * 3);
    camera.position.x += sx; camera.position.y += sy;
    vm.visible = false;
    return;
  }
  const bobY = Math.sin(player.bob * 2) * 0.05 * (player.y > 0 ? 0 : 1);
  let eye = 1.65;
  if (!player.alive) { G.deathT = (G.deathT || 0) + dt; eye = Math.max(0.3, 1.65 - G.deathT * 1.5); }
  else G.deathT = 0;
  camera.position.set(player.x + sx, groundY(player.x, player.z) + player.y + eye + bobY + sy, player.z);
  camera.rotation.set(player.pitch + player.recoil * 0.03, player.yaw, player.alive ? 0 : Math.min(1.2, G.deathT * 1.4));
  vm.visible = player.alive;
  // view-model sway
  const b = player.bob;
  vm.position.set(Math.cos(b) * 0.012, Math.abs(Math.sin(b)) * -0.015 - (player.reloadT > 0 ? 0.25 : 0), player.recoil * 0.06);
  armR.rotation.x = 0.05 + player.recoil * 0.25;
  const sh = Math.sin(player.shoveAnim * Math.PI);
  armL.position.z = -0.42 - sh * 0.25; armR.position.z = -0.42 - sh * 0.2;
}

function updateDirector(dt) {
  // day progression
  G.hour = hourAt(G.elapsed);
  const day = Math.floor(G.elapsed / CFG.dayLength) + 1;
  if (day > G.day) {
    G.day = day;
    if (G.day > CFG.days) { endGame(true); return; }
    sfx.day();
    showBanner(`DAY ${G.day}<small>${G.day === CFG.days ? 'LAST DAY. HOLD ON.' : 'THE BOUNTY WENT UP. MORE OF THEM NOW.'}</small>`, 3.5);
  }
  // keep the population topped up; relocate far, idle hunters closer to the action
  G.spawnT -= dt;
  const alive = G.hunters.filter((h) => !h.dead);
  if (G.spawnT <= 0) {
    G.spawnT = 0.6;
    if (alive.length < targetHunters()) spawnHunter();
    const tp = targetPos();
    for (const h of alive) if (h.state !== 'chase' && Math.hypot(h.x - tp.x, h.z - tp.z) > 175) { h.remove(); spawnHunter(); break; }
  }
  G.hunters = G.hunters.filter((h) => !h.dead);
  // location leak
  G.pingT -= dt;
  if (G.pingT <= 0) {
    G.pingT = Math.max(14, 48 - G.day * 1.3);
    const tp = targetPos();
    let n = 0;
    for (const h of G.hunters) if (Math.hypot(h.x - tp.x, h.z - tp.z) < 110) { h.alert(mr(0, 2)); n++; }
    if (n) { showMsg('YOUR LOCATION WAS LEAKED', 3); sfx.alarm(); }
  }
  // hunter drivers
  G.hunterCarT -= dt;
  if (G.hunterCarT <= 0) {
    G.hunterCarT = Math.max(10, 30 - G.day);
    const have = G.cars.filter((c) => c.driver === 'hunter').length;
    if (G.day >= 2 && have < Math.min(G.day - 1, 5)) {
      const tp = targetPos();
      const cand = G.cars.filter((c) => c.driver === 'traffic' && Math.hypot(c.x - tp.x, c.z - tp.z) > 30 && Math.hypot(c.x - tp.x, c.z - tp.z) < 110);
      if (cand.length) { mpick(cand).driver = 'hunter'; showMsg('A DRIVER IS COMING FOR YOU', 2.5); sfx.horn(); }
    }
  }
  // recycle wrecks far from the player
  for (const c of G.cars) if (c.wrecked && c !== player.car && Math.hypot(c.x - player.x, c.z - player.z) > 130) c.placeOnLane(mpick(lanes), mr(-HALF, HALF));
  // flow field
  G.flowT -= dt;
  if (G.flowT <= 0) { G.flowT = 0.35; const tp = targetPos(); computeFlow(tp.x, tp.z); }
  // heartbeat when hunters are close
  let nearest = 1e9;
  for (const h of G.hunters) if (h.state === 'chase') nearest = Math.min(nearest, Math.hypot(h.x - player.x, h.z - player.z));
  G.heartT -= dt;
  if (nearest < 22 && G.heartT <= 0) { sfx.heart(0.25 * (1 - nearest / 22) + 0.05); G.heartT = 0.35 + (nearest / 22) * 0.6; }
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = performance.now() / 1000;
  if (G.mode === 'playing') {
    G.elapsed += dt;
    updatePlayer(dt);
    for (const h of G.hunters) if (!h.dead) h.update(dt);
    separateHunters();
    for (const c of G.cars) c.update(dt);
    carInteractions(dt);
    for (const p of G.pickups) p.update(dt, t);
    updateDirector(dt);
    if (!player.alive) { G.overT -= dt; if (G.overT <= 0 && G.mode === 'playing') endGame(false); }
    updateHUD(dt);
  } else if (G.mode === 'menu') {
    G.hour = 17.6; // dusk on the title screen
    for (const c of G.cars) c.update(dt);
  }
  for (let i = ragdolls.length - 1; i >= 0; i--) if (!ragdolls[i].update(G.mode === 'paused' ? 0 : dt)) { ragdolls[i].dispose(); ragdolls.splice(i, 1); }
  if (G.mode !== 'paused') { updatePuffs(dt); updateTracers(dt); updateVents(dt); }
  updateLighting();
  updateCamera(dt);
  renderer.clear();
  renderer.render(scene, camera);
  if (vm.visible && G.mode !== 'menu') { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
}

// title-screen ambience
player.x = 0; player.z = 0;
spawnTraffic(30);
$('loading').classList.add('hidden');
frame();

// debug / test hook
window.__hunted = { G, player, camera, scene, renderer, hourAt, CFG, startGame, spawnHunter, enterCar, exitCar, playerShoot, colliders, get ragdolls() { return ragdolls.length; } };
