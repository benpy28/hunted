// Effects: particles (steam, smoke, impact puffs) and bullet trails. No blood anywhere.
import * as THREE from '../vendor/three.module.min.js';
import { lerp, mr, scene, camera, puffTex } from './core.js';
import { vents, smokeStacks } from './world.js';

const puffs = [], puffPool = [];
export function emitPuff(x, y, z, o) {
  let s = puffPool.pop();
  if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false })); scene.add(s); }
  s.visible = true; s.position.set(x, y, z);
  s.material.color.set(o.color ?? 0xffffff);
  puffs.push({ s, age: 0, life: o.life ?? 1, vx: o.vx ?? 0, vy: o.vy ?? 1, vz: o.vz ?? 0, s0: o.size0 ?? 0.5, s1: o.size1 ?? 2, a: o.alpha ?? 0.5 });
}
export function updatePuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]; p.age += dt;
    const t = p.age / p.life;
    if (t >= 1) { p.s.visible = false; puffPool.push(p.s); puffs.splice(i, 1); continue; }
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    p.s.scale.setScalar(lerp(p.s0, p.s1, t));
    p.s.material.opacity = p.a * (1 - t) * Math.min(1, t * 6);
  }
}
let ventT = 0, stackT = 0;
export function updateAmbientSmoke(dt) {
  ventT -= dt; stackT -= dt;
  const cx = camera.position.x, cz = camera.position.z;
  if (ventT <= 0) {
    ventT = 0.12;
    for (const v of vents) {
      if (Math.abs(v.x - cx) > 120 || Math.abs(v.z - cz) > 120) continue;
      emitPuff(v.x + mr(-0.4, 0.4), 0.2, v.z + mr(-0.4, 0.4), { life: 3.2, vy: mr(1.8, 2.8), vx: mr(-0.3, 0.3), vz: mr(-0.3, 0.3), size0: 1, size1: 5, alpha: 0.28, color: 0xe8e0f0 });
    }
  }
  if (stackT <= 0) {
    stackT = 0.35;
    for (const s of smokeStacks) {
      if (Math.abs(s.x - cx) > 400 || Math.abs(s.z - cz) > 400) continue;
      emitPuff(s.x, s.y, s.z, { life: 7, vy: mr(2, 3), vx: mr(1, 2.5), vz: mr(-0.5, 0.5), size0: 3, size1: 14, alpha: 0.4, color: 0xb8b4b0 });
    }
  }
}

const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1).translate(0, 0, 0.5);
const tracers = [], tracerPool = [];
export function spawnTracer(from, to, color = 0xfff2a0) {
  let m = tracerPool.pop();
  if (!m) { m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); scene.add(m); }
  m.visible = true; m.material.color.set(color);
  m.position.copy(from); m.lookAt(to);
  m.scale.set(1, 1, from.distanceTo(to));
  tracers.push({ m, age: 0, life: 0.14 });
}
export function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.age += dt;
    if (t.age >= t.life) { t.m.visible = false; tracerPool.push(t.m); tracers.splice(i, 1); continue; }
    t.m.material.opacity = 1 - t.age / t.life;
    t.m.scale.x = t.m.scale.y = 1 + t.age * 8;
  }
}
