// Core: helpers, renderer, scene, procedural texture + merged-geometry utilities.
import * as THREE from '../vendor/three.module.min.js';

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const srand = mulberry32(20261107);            // seeded: the world is the same every run
export const sr = (a, b) => a + srand() * (b - a);
export const spick = (arr) => arr[Math.floor(srand() * arr.length)];
export const mr = (a, b) => a + Math.random() * (b - a); // gameplay randomness
export const mpick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const fmtTime = (s) => { s = Math.floor(s); const m = Math.floor(s / 60); return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
export const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------
// renderer / scene / cameras / lights
// ---------------------------------------------------------------------
export const canvas = $('game');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8a9ab8);
scene.fog = new THREE.Fog(0x8a9ab8, 30, 320);

export const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 1400);
camera.rotation.order = 'YXZ';
scene.add(camera);

export const hemi = new THREE.HemisphereLight(0xc8d0ff, 0x4a4038, 1.0);
export const sun = new THREE.DirectionalLight(0xffe0b0, 1.2);
sun.position.set(-120, 160, 80);
scene.add(hemi, sun);

export const vmScene = new THREE.Scene();
export const vmCamera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2), vmCamera);
const vmSun = new THREE.DirectionalLight(0xffffff, 0.8); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = vmCamera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); vmCamera.updateProjectionMatrix();
});

// ---------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------
export function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export const puffTex = canvasTex(64, 64, (ctx, W, H) => {
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
});
export function textTex(w, h, bg, fg, lines, font = 'bold 40px Arial, sans-serif', border = true) {
  return canvasTex(w, h, (ctx, W, H) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (border) { ctx.strokeStyle = fg; ctx.lineWidth = 4; ctx.strokeRect(6, 6, W - 12, H - 12); }
    ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const step = H / (lines.length + 1);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, step * (i + 1)));
  });
}

// ---------------------------------------------------------------------
// merged static geometry builder (keeps draw calls low)
// ---------------------------------------------------------------------
const tmpColor = new THREE.Color();
const toCol = (c) => (c == null ? null : tmpColor.set(c).clone());
export class GeoBuf {
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
    const c = toCol(color);
    const fuv = (fw) => (uvW ? [uOff, y0 / uvH, uOff + fw / uvW, y0 / uvH, uOff + fw / uvW, y1 / uvH, uOff, y1 / uvH] : [0, 0, 1, 0, 1, 1, 0, 1]);
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
  // vertical plane on one side of a rectangle. side: px|nx|pz|nz; a0<a1 is the span along the face
  face(side, fixed, a0, a1, y0, y1, color, uRep = 1) {
    const c = toCol(color), u = [0, 0, uRep, 0, uRep, 1, 0, 1];
    if (side === 'px') this.quad([fixed, y0, a1], [fixed, y0, a0], [fixed, y1, a0], [fixed, y1, a1], [1, 0, 0], u, c);
    else if (side === 'nx') this.quad([fixed, y0, a0], [fixed, y0, a1], [fixed, y1, a1], [fixed, y1, a0], [-1, 0, 0], u, c);
    else if (side === 'pz') this.quad([a0, y0, fixed], [a1, y0, fixed], [a1, y1, fixed], [a0, y1, fixed], [0, 0, 1], u, c);
    else this.quad([a1, y0, fixed], [a0, y0, fixed], [a0, y1, fixed], [a1, y1, fixed], [0, 0, -1], u, c);
  }
  flat(x0, x1, z0, z1, y, color) { this.box(x0, x1, y, y, z0, z1, color, { sides: false }); }
  // pitched roof; ridge runs along x when alongX
  prism(x0, x1, z0, z1, y0, rh, color, alongX) {
    const c = toCol(color), U = [0, 0, 1, 0, 1, 1, 0, 1], yr = y0 + rh;
    const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
    if (alongX) {
      const zm = (z0 + z1) / 2, dz = zm - z0;
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, yr, zm], [x1, yr, zm], nrm([0, dz, -rh]), U, c);
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, yr, zm], [x0, yr, zm], nrm([0, dz, rh]), U, c);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, yr, zm], [x0, yr, zm], [-1, 0, 0], U, c);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, yr, zm], [x1, yr, zm], [1, 0, 0], U, c);
    } else {
      const xm = (x0 + x1) / 2, dx = xm - x0;
      this.quad([x0, y0, z0], [x0, y0, z1], [xm, yr, z1], [xm, yr, z0], nrm([-rh, dx, 0]), U, c);
      this.quad([x1, y0, z1], [x1, y0, z0], [xm, yr, z0], [xm, yr, z1], nrm([rh, dx, 0]), U, c);
      this.quad([x1, y0, z0], [x0, y0, z0], [xm, yr, z0], [xm, yr, z0], [0, 0, -1], U, c);
      this.quad([x0, y0, z1], [x1, y0, z1], [xm, yr, z1], [xm, yr, z1], [0, 0, 1], U, c);
    }
  }
  // cylinder / cone (rTop may be 0)
  cyl(cx, cz, r, rTop, y0, y1, color, segs = 12, cap = true) {
    const c = toCol(color), U = [0, 0, 1, 0, 1, 1, 0, 1];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, am = (a0 + a1) / 2;
      const p = (a, rr, y) => [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr];
      const slope = (r - rTop) / (y1 - y0);
      const n = [Math.cos(am), slope, Math.sin(am)], l = Math.hypot(n[0], n[1], n[2]);
      this.quad(p(a1, r, y0), p(a0, r, y0), p(a0, rTop, y1), p(a1, rTop, y1), [n[0] / l, n[1] / l, n[2] / l], U, c);
      if (cap && rTop > 0) this.quad([cx, y1, cz], p(a1, rTop, y1), p(a0, rTop, y1), p(a0, rTop, y1), [0, 1, 0], U, c);
    }
  }
  // square beam between two arbitrary points (cables, rails)
  beam(a, b, t, color) {
    const c = toCol(color), U = [0, 0, 1, 0, 1, 1, 0, 1];
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const s1 = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(t / 2), s2 = new THREE.Vector3().crossVectors(s1, d).normalize().multiplyScalar(t / 2);
    const P = (o, k1, k2) => [o[0] + s1.x * k1 + s2.x * k2, o[1] + s1.y * k1 + s2.y * k2, o[2] + s1.z * k1 + s2.z * k2];
    for (const [k1, k2, m1, m2] of [[1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1], [-1, 1, 1, 1]]) {
      const n = new THREE.Vector3().addScaledVector(s1, (k1 + m1) / 2).addScaledVector(s2, (k2 + m2) / 2).normalize();
      this.quad(P(a, k1, k2), P(a, m1, m2), P(b, m1, m2), P(b, k1, k2), [n.x, n.y, n.z], U, c);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
  build(material) {
    if (!this.n) return null;
    const m = new THREE.Mesh(this.geometry(), material);
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    return m;
  }
}

// GeoBuf split into square chunks by position, so each chunk is its own mesh and the renderer can skip
// whatever is off screen (or, with farCull, too far away to matter)
export const chunkMeshes = []; // {mesh, cx, cz, far}
export class ChunkBuf {
  constructor(size = 128, far = 0) { this.size = size; this.far = far; this.map = new Map(); }
  at(x, z) {
    const k = Math.floor(x / this.size) + ',' + Math.floor(z / this.size);
    let b = this.map.get(k); if (!b) { b = new GeoBuf(); this.map.set(k, b); }
    return b;
  }
  get n() { let n = 0; for (const b of this.map.values()) n += b.n; return n; }
  quad(a, b, c, d, nrm, uv, color) { this.at(a[0], a[2]).quad(a, b, c, d, nrm, uv, color); }
  box(x0, x1, y0, y1, z0, z1, color, opt) { this.at((x0 + x1) / 2, (z0 + z1) / 2).box(x0, x1, y0, y1, z0, z1, color, opt); }
  face(side, fixed, a0, a1, y0, y1, color, uRep) { const ax = side[1] === 'x'; this.at(ax ? fixed : (a0 + a1) / 2, ax ? (a0 + a1) / 2 : fixed).face(side, fixed, a0, a1, y0, y1, color, uRep); }
  flat(x0, x1, z0, z1, y, color) { this.at((x0 + x1) / 2, (z0 + z1) / 2).flat(x0, x1, z0, z1, y, color); }
  prism(x0, x1, z0, z1, y0, rh, color, alongX) { this.at((x0 + x1) / 2, (z0 + z1) / 2).prism(x0, x1, z0, z1, y0, rh, color, alongX); }
  cyl(cx, cz, r, rTop, y0, y1, color, segs, cap) { this.at(cx, cz).cyl(cx, cz, r, rTop, y0, y1, color, segs, cap); }
  beam(a, b, t, color) { this.at(a[0], a[2]).beam(a, b, t, color); }
  build(material) {
    let first = null;
    for (const [k, b] of this.map) {
      const m = b.build(material); if (!m) continue;
      const [i, j] = k.split(',').map(Number);
      chunkMeshes.push({ mesh: m, cx: (i + 0.5) * this.size, cz: (j + 0.5) * this.size, far: this.far });
      first = first || m;
    }
    return first;
  }
}
// hide far-culled chunks beyond their distance from the camera
export function cullChunks(x, z) {
  for (const c of chunkMeshes) if (c.far) c.mesh.visible = Math.hypot(c.cx - x, c.cz - z) < c.far;
}
