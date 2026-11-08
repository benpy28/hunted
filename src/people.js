// People: blocky low-poly characters and verlet ragdolls for takedowns.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, scene, canvasTex, GeoBuf } from './core.js';
import { resolveBody, floorAt } from './world.js';

export const PG = {
  leg: new THREE.BoxGeometry(0.22, 0.82, 0.24).translate(0, -0.41, 0),
  torso: new THREE.BoxGeometry(0.6, 0.7, 0.34),
  head: new THREE.BoxGeometry(0.38, 0.38, 0.38),
  hair: new THREE.BoxGeometry(0.41, 0.12, 0.41),
  arm: new THREE.BoxGeometry(0.17, 0.7, 0.18).translate(0, -0.35, 0),
  gun: new THREE.BoxGeometry(0.09, 0.14, 0.4).translate(0, -0.68, 0.14),
  hand: new THREE.BoxGeometry(0.16, 0.16, 0.16).translate(0, -0.72, 0),
  cap: new THREE.BoxGeometry(0.44, 0.1, 0.44), brim: new THREE.BoxGeometry(0.4, 0.04, 0.16),
  vest: new THREE.BoxGeometry(0.64, 0.5, 0.38),
  shoe: new THREE.BoxGeometry(0.24, 0.1, 0.34),
};
const matCache = new Map();
export function lam(hex) { if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex })); return matCache.get(hex); }
export const SKINS = [0xffe0c4, 0xf6d0b0, 0xf1c9a5, 0xe8b88e, 0xe0ac7e, 0xd09a6a, 0xc68642, 0xa86b3c, 0x8d5524, 0x744420, 0x5c3a1e, 0x45291a];
export const SHIRTS = [0x3a5a8c, 0x8c3a3a, 0x3a8c5a, 0xd0d0d0, 0x333333, 0xc9a13b, 0x6b3a8c, 0xd6763a, 0x2f7f8f, 0x9b9b9b, 0xe07aa0, 0x2a2a4a, 0xf0e8d0, 0x5a7a2a];
export const PANTS = [0x23262e, 0x3b3f4a, 0x2c3e66, 0x4a3a2a, 0x555555, 0x6a5a40, 0x1a1a1a];
export const HAIRS = [0x1a1410, 0x2a1c12, 0x3b2616, 0x6b4a2a, 0x8a5a2a, 0xc9a05a, 0xe0c080, 0xa8441c, 0x777777, 0xd8d8d8, 0x111111, 0x1a1410];
const DYED = [0xe05aa8, 0x3a8ae0, 0x5ad07a, 0x9a5ae0, 0xf0f0f0];
export const HAIR_STYLES = ['short', 'short', 'buzz', 'long', 'ponytail', 'bun', 'afro', 'mohawk', 'bald', 'sidepart', 'spiky', 'curly', 'bob'];
const EYES = ['dot', 'oval', 'big', 'sleepy', 'wide', 'lashes'];
const MOUTHS = ['smile', 'flat', 'grin', 'smirk', 'small'];

// ---------------------------------------------------------------------
// cartoon faces: a little painted face on the front of the head, in the person's skin tone, with
// eyebrows in their hair colour. Moods (neutral, angry, scared, happy, smug) swap brows and mouth.
// ---------------------------------------------------------------------
const faceCache = new Map();
function hexCss(h) { return '#' + h.toString(16).padStart(6, '0'); }
function shadeCss(h, k) { const c = new THREE.Color(h).multiplyScalar(k); return '#' + c.getHexString(); }
function faceMat(skin, hair, F, mood) {
  const key = `${skin}|${hair}|${F.eyes}|${F.mouth}|${F.freckles}|${F.glasses}|${F.stache}|${F.blush}|${mood}`;
  let m = faceCache.get(key);
  if (m) return m;
  const t = canvasTex(64, 64, (ctx, W, H) => {
    ctx.fillStyle = hexCss(skin); ctx.fillRect(0, 0, W, H);
    const dark = new THREE.Color(skin).getHSL({}).l < 0.35, ink = dark ? '#120a06' : '#1e140e';
    const hairCss = hexCss(hair);
    if (F.blush) { ctx.fillStyle = 'rgba(230,90,90,0.28)'; ctx.beginPath(); ctx.arc(14, 42, 6, 0, 7); ctx.arc(50, 42, 6, 0, 7); ctx.fill(); }
    if (F.freckles) { ctx.fillStyle = shadeCss(skin, 0.72); for (const [x, y] of [[14, 38], [18, 41], [12, 43], [46, 38], [50, 41], [52, 43], [16, 45], [48, 45]]) ctx.fillRect(x, y, 2, 2); }
    // eyes
    const eyeY = 30, ex = [21, 43];
    const scared = mood === 'scared', angry = mood === 'angry', happy = mood === 'happy', smug = mood === 'smug';
    for (const x of ex) {
      if (happy) { ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, eyeY + 3, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); continue; }
      if (smug || F.eyes === 'sleepy') { ctx.fillStyle = ink; ctx.fillRect(x - 5, eyeY, 10, 3); if (smug) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, eyeY + 3, 8, 2); ctx.fillStyle = ink; ctx.fillRect(x - 1, eyeY + 3, 3, 2); } continue; }
      const big = F.eyes === 'big' || F.eyes === 'wide' || scared, r = big ? 6 : F.eyes === 'dot' ? 3 : 5;
      if (F.eyes !== 'dot' || scared) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, eyeY, r, big ? r + 1 : r - 1, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x + (angry ? 0 : 1), eyeY + (scared ? -1 : 0.5), scared ? 2 : F.eyes === 'dot' ? 3 : 3, 0, 7); ctx.fill();
      if (big) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 1, eyeY - 3, 2, 2); }
      if (F.eyes === 'lashes') { ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 5, eyeY - 4); ctx.lineTo(x - 7, eyeY - 7); ctx.moveTo(x + 5, eyeY - 4); ctx.lineTo(x + 7, eyeY - 7); ctx.stroke(); }
    }
    // brows
    ctx.strokeStyle = hairCss === '#111111' || dark ? (dark ? '#0a0604' : hairCss) : hairCss; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    for (const [x, sgn] of [[ex[0], -1], [ex[1], 1]]) {
      const tilt = angry ? 4 : scared ? -4 : smug ? (sgn > 0 ? -3 : 1) : 0;
      ctx.beginPath(); ctx.moveTo(x - 6, eyeY - 9 + (sgn < 0 ? -tilt : tilt) * 0 - (sgn < 0 ? 0 : 0) + (sgn < 0 ? -tilt / 2 : tilt / 2)); ctx.lineTo(x + 6, eyeY - 9 + (sgn < 0 ? tilt / 2 : -tilt / 2)); ctx.stroke();
    }
    // glasses
    if (F.glasses) { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; for (const x of ex) { ctx.strokeRect(x - 7, eyeY - 6, 14, 11); } ctx.beginPath(); ctx.moveTo(28, eyeY - 2); ctx.lineTo(36, eyeY - 2); ctx.stroke(); }
    // mouth
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2.6;
    const my = 49, mouth = angry ? 'frown' : scared ? 'o' : happy ? 'grin' : smug ? 'smirk' : F.mouth;
    ctx.beginPath();
    if (mouth === 'smile') { ctx.arc(32, my - 6, 9, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke(); }
    else if (mouth === 'flat') { ctx.moveTo(25, my); ctx.lineTo(39, my); ctx.stroke(); }
    else if (mouth === 'small') { ctx.moveTo(29, my); ctx.lineTo(35, my); ctx.stroke(); }
    else if (mouth === 'smirk') { ctx.moveTo(24, my + 1); ctx.quadraticCurveTo(34, my + 2, 41, my - 4); ctx.stroke(); }
    else if (mouth === 'frown') { ctx.arc(32, my + 7, 8, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); }
    else if (mouth === 'o') { ctx.ellipse(32, my, 4, 5, 0, 0, 7); ctx.fill(); }
    else { ctx.moveTo(22, my - 3); ctx.quadraticCurveTo(32, my + 9, 42, my - 3); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(25, my - 2, 14, 3); }
    if (F.stache) { ctx.fillStyle = hairCss; ctx.beginPath(); ctx.ellipse(27, my - 6, 6, 3, 0.2, 0, 7); ctx.ellipse(37, my - 6, 6, 3, -0.2, 0, 7); ctx.fill(); }
  });
  t.magFilter = THREE.LinearFilter;
  m = new THREE.MeshLambertMaterial({ map: t });
  faceCache.set(key, m);
  return m;
}

// hair, beards, ears and noses as merged geometry, cached by style
const hairGeoCache = new Map();
function hairGeo(style, beard) {
  const key = style + (beard ? '+b' : '');
  if (hairGeoCache.has(key)) return hairGeoCache.get(key);
  const b = new GeoBuf();
  const B = (x0, x1, y0, y1, z0, z1) => b.box(x0, x1, y0, y1, z0, z1, null, { bottom: true });
  const cap = (top = 0.25) => { B(-0.205, 0.205, 0.15, top, -0.205, 0.205); B(-0.205, 0.205, -0.02, 0.15, -0.215, -0.17); B(-0.215, -0.17, 0.04, 0.15, -0.2, 0.06); B(0.17, 0.215, 0.04, 0.15, -0.2, 0.06); };
  switch (style) {
    case 'buzz': B(-0.198, 0.198, 0.16, 0.215, -0.198, 0.198); B(-0.198, 0.198, 0.0, 0.16, -0.205, -0.18); break;
    case 'short': cap(); B(-0.205, 0.205, 0.12, 0.2, 0.17, 0.215); break;
    case 'long': cap(); B(-0.215, 0.215, -0.42, 0.15, -0.23, -0.15); B(-0.225, -0.17, -0.25, 0.15, -0.2, 0.1); B(0.17, 0.225, -0.25, 0.15, -0.2, 0.1); B(-0.205, 0.205, 0.13, 0.2, 0.17, 0.215); break;
    case 'ponytail': cap(); B(-0.07, 0.07, -0.02, 0.16, -0.3, -0.2); B(-0.06, 0.06, -0.38, -0.02, -0.33, -0.24); B(-0.205, 0.205, 0.13, 0.2, 0.17, 0.215); break;
    case 'bun': cap(); B(-0.1, 0.1, 0.24, 0.4, -0.12, 0.06); break;
    case 'afro': B(-0.27, 0.27, 0.02, 0.4, -0.28, 0.17); B(-0.25, 0.25, 0.12, 0.38, 0.17, 0.215); break;
    case 'mohawk': B(-0.045, 0.045, 0.18, 0.38, -0.22, 0.2); B(-0.198, 0.198, 0.17, 0.2, -0.198, 0.198); break;
    case 'bald': B(-0.2, 0.2, -0.02, 0.06, -0.205, -0.17); break;
    case 'sidepart': cap(); B(-0.05, 0.225, 0.13, 0.27, 0.12, 0.23); break;
    case 'spiky': cap(); for (let k = 0; k < 5; k++) { const x = -0.16 + k * 0.08; B(x - 0.035, x + 0.035, 0.25, 0.34 + (k % 2) * 0.04, -0.06, 0.04); } break;
    case 'curly': cap(0.27); for (const [x, z] of [[-0.12, 0.1], [0.12, 0.1], [0, -0.05], [-0.15, -0.12], [0.15, -0.12], [0, 0.14]]) B(x - 0.08, x + 0.08, 0.24, 0.34, z - 0.08, z + 0.08); break;
    case 'bob': cap(); B(-0.225, -0.17, -0.12, 0.15, -0.2, 0.14); B(0.17, 0.225, -0.12, 0.15, -0.2, 0.14); B(-0.215, 0.215, -0.12, 0.15, -0.23, -0.15); B(-0.205, 0.205, 0.08, 0.2, 0.17, 0.215); break;
  }
  if (beard) { B(-0.17, 0.17, -0.2, -0.07, 0.19, 0.225); B(-0.21, -0.17, -0.2, 0.02, -0.06, 0.2); B(0.17, 0.21, -0.2, 0.02, -0.06, 0.2); B(-0.14, 0.14, -0.27, -0.19, 0.03, 0.22); }
  const g = b.n ? b.geometry() : null;
  hairGeoCache.set(key, g);
  return g;
}
const featGeo = (() => { const b = new GeoBuf(); b.box(-0.235, -0.19, -0.07, 0.06, -0.04, 0.04, null, { bottom: true }); b.box(0.19, 0.235, -0.07, 0.06, -0.04, 0.04, null, { bottom: true }); b.box(-0.035, 0.035, -0.07, 0.03, 0.19, 0.245, null, { bottom: true }); return b.geometry(); })();
const pickR = (arr) => arr[Math.floor(Math.random() * arr.length)];
// fill in whatever the caller didn't choose: hairstyle, face, glasses, beard...
export function randomizeLook(look) {
  if (look.hairStyle === undefined) look.hairStyle = pickR(HAIR_STYLES);
  if (look.cap && ['afro', 'bun', 'mohawk', 'spiky', 'curly'].includes(look.hairStyle)) look.hairStyle = 'short';
  if (Math.random() < 0.06) look.hair = pickR(DYED);
  if (!look.face) look.face = { eyes: pickR(EYES), mouth: pickR(MOUTHS), freckles: Math.random() < 0.15, glasses: Math.random() < 0.15, stache: Math.random() < 0.08, blush: Math.random() < 0.25 };
  if (look.beard === undefined) look.beard = Math.random() < 0.14 && !['long', 'bob', 'ponytail', 'bun'].includes(look.hairStyle);
  if (look.build === undefined) look.build = 0.9 + Math.random() * 0.22;
  return look;
}
// change someone's expression: 'neutral' | 'angry' | 'scared' | 'happy' | 'smug'
export function setMood(p, mood) {
  if (!p || !p.look || p.mood === mood) return;
  p.mood = mood;
  p.headMats[4] = faceMat(p.look.skin, p.look.hair, p.look.face, mood);
}

export function buildPerson(look) {
  randomizeLook(look);
  const g = new THREE.Group();
  const mk = (geo, hex, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, lam(hex)); m.position.set(x, y, z); parent.add(m); return m; };
  const p = { group: g, look, mood: 'neutral' };
  p.legL = mk(PG.leg, look.pants, -0.14, 0.82, 0);
  p.legR = mk(PG.leg, look.pants, 0.14, 0.82, 0);
  p.torso = mk(PG.torso, look.shirt, 0, 1.17, 0);
  p.torso.scale.x = look.build;
  const sk = lam(look.skin);
  p.headMats = [sk, sk, lam(look.hair), sk, faceMat(look.skin, look.hair, look.face, 'neutral'), sk];
  p.head = new THREE.Mesh(PG.head, p.headMats); p.head.position.set(0, 1.71, 0); g.add(p.head);
  mk(featGeo, look.skin, 0, 0, 0, p.head);
  const hg = hairGeo(look.cap ? (look.hairStyle === 'bald' ? 'bald' : 'buzz') : look.hairStyle, look.beard);
  if (hg) mk(hg, look.hair, 0, 0, 0, p.head);
  p.armL = mk(PG.arm, look.shirt, -0.395 * look.build, 1.5, 0);
  p.armR = mk(PG.arm, look.shirt, 0.395 * look.build, 1.5, 0);
  mk(PG.hand, look.skin, 0, 0, 0, p.armL);
  mk(PG.hand, look.skin, 0, 0, 0, p.armR);
  if (look.gun) mk(PG.gun, 0x1c1c20, 0, 0, 0, p.armR);
  if (look.cap) { mk(PG.cap, look.cap, 0, 0.27, 0, p.head); mk(PG.brim, look.cap, 0, 0.23, 0.26, p.head); }
  if (look.vest) mk(PG.vest, look.vest, 0, 0.05, 0, p.torso);
  mk(PG.shoe, 0x1a1a1a, 0, -0.78, 0.04, p.legL); mk(PG.shoe, 0x1a1a1a, 0, -0.78, 0.04, p.legR);
  return p;
}

export const ragdolls = [];
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
        const gy = floorAt(p.x, p.z, Math.max(p.y, q.y) - r, 0.05) + r;
        if (p.y < gy) { p.y = gy; q.x = lerp(q.x, p.x, 0.25); q.z = lerp(q.z, p.z, 0.25); }
        const before = { x: p.x, z: p.z };
        resolveBody(p, 0.15, p.y - r, 0.3);
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
export function addRagdoll(person, scale, vel, impulse, hitY) {
  ragdolls.push(new Ragdoll(person, scale, vel, impulse, hitY));
  while (ragdolls.length > 18) ragdolls.shift().dispose();
}
