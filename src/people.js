// People: blocky low-poly characters and verlet ragdolls for takedowns.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, scene } from './core.js';
import { resolveBody, floorAt } from './world.js';

export const PG = {
  leg: new THREE.BoxGeometry(0.22, 0.82, 0.24).translate(0, -0.41, 0),
  torso: new THREE.BoxGeometry(0.6, 0.7, 0.34),
  head: new THREE.BoxGeometry(0.38, 0.38, 0.38),
  hair: new THREE.BoxGeometry(0.41, 0.12, 0.41),
  arm: new THREE.BoxGeometry(0.17, 0.7, 0.18).translate(0, -0.35, 0),
  gun: new THREE.BoxGeometry(0.09, 0.14, 0.4).translate(0, -0.68, 0.14),
};
const matCache = new Map();
export function lam(hex) { if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex })); return matCache.get(hex); }
export const SKINS = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
export const SHIRTS = [0x3a5a8c, 0x8c3a3a, 0x3a8c5a, 0xd0d0d0, 0x333333, 0xc9a13b, 0x6b3a8c, 0xd6763a, 0x2f7f8f, 0x9b9b9b];
export const PANTS = [0x23262e, 0x3b3f4a, 0x2c3e66, 0x4a3a2a, 0x555555];
export const HAIRS = [0x1a1410, 0x3b2616, 0x6b4a2a, 0xc9a05a, 0x777777, 0x111111];

export function buildPerson(look) {
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
  if (look.cap) { mk(new THREE.BoxGeometry(0.44, 0.1, 0.44), look.cap, 0, 0.27, 0, p.head); mk(new THREE.BoxGeometry(0.4, 0.04, 0.16), look.cap, 0, 0.23, 0.26, p.head); }
  if (look.vest) mk(new THREE.BoxGeometry(0.64, 0.5, 0.38), look.vest, 0, 0.05, 0, p.torso);
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
