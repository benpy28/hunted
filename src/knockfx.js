// Cartoon knockdowns: every weapon floors people in its own silly, bloodless way. Laser eyes turn
// the bit they hit into black cartoon ash that crumbles away as they go flying, the crowbar sends
// them spinning with stars, the shotgun blows them backwards in a puff of soot, the pistol makes
// them spin round and flop over seeing stars, and so on. Comic words pop up over the action.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, scene, canvasTex } from './core.js';
import { emitPuff } from './fx.js';

const ashMat = new THREE.MeshLambertMaterial({ color: 0x16130f });
const sootMat = new THREE.MeshLambertMaterial({ color: 0x3a3632 });
const crumbles = [], words = [], dizzies = [];
const wordTex = new Map();
const WORD_COLORS = { 'ZAP!': '#ff5a3a', 'BONK!': '#ffd23a', 'POW!': '#ff8a2a', 'BLAM!': '#ffe04a', 'RAT-A-TAT!': '#ffd23a', 'WHAM!': '#5ab4ff', 'WHOOSH!': '#9ad8ff', 'OOF!': '#ffffff', 'FWOOSH!': '#ff6a2a', 'KA-BOOM!': '#ff5a3a', 'THWACK!': '#ffd23a', 'SPLOOSH!': '#7ad0ff', 'CLANG!': '#d8d8e0', 'CRASH!': '#ffb03a', 'STRIKE!': '#ff5a3a', 'DING!': '#ffe04a' };
function wordMat(text) {
  if (!wordTex.has(text)) wordTex.set(text, new THREE.SpriteMaterial({ map: canvasTex(512, 160, (ctx, W, H) => {
    ctx.font = 'italic 900 92px Arial Black, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 18; ctx.strokeStyle = '#1a1010'; ctx.strokeText(text, W / 2, H / 2 + 4, W - 20);
    ctx.fillStyle = WORD_COLORS[text] || '#ffd23a'; ctx.fillText(text, W / 2, H / 2, W - 20);
  }), depthTest: false, transparent: true }));
  return wordTex.get(text);
}
export function comicWord(text, x, y, z) {
  const s = new THREE.Sprite(wordMat(text)); s.renderOrder = 7; s.position.set(x, y, z); scene.add(s);
  words.push({ s, t: 0, life: 0.9, vy: 1.6, rot: mr(-0.25, 0.25) });
  while (words.length > 8) { const w = words.shift(); scene.remove(w.s); }
}
const starMat = new THREE.SpriteMaterial({ map: canvasTex(64, 64, (ctx, W, H) => {
  ctx.fillStyle = '#ffe23a'; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 3; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 12 : 28; ctx.lineTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}), depthTest: true, transparent: true });
function dizzy(rag, dur = 3) {
  const stars = [0, 1, 2].map(() => { const s = new THREE.Sprite(starMat); s.scale.setScalar(0.28); scene.add(s); return s; });
  dizzies.push({ rag, stars, t: 0, dur });
  while (dizzies.length > 6) { const d = dizzies.shift(); for (const s of d.stars) scene.remove(s); }
}
function partFor(rag, hitY) { // which body part a hit at height hitY lands on
  const footY = Math.min(rag.p[7].y, rag.p[8].y), rel = (hitY - footY) / (rag.scale || 1);
  return rel > 1.5 ? 'head' : rel > 1.05 ? mpick(['torso', 'torso', 'armL', 'armR']) : rel > 0.6 ? 'torso' : mpick(['legL', 'legR']);
}
function setMat(mesh, mat) { mesh.traverse((m) => { if (m.isMesh) m.material = mat; }); }
function kick(rag, x, y, z, idx = null) { // extra velocity on the ragdoll (all points, or one)
  const dt = 1 / 60;
  rag.prev.forEach((q, i) => { if (idx === null || i === idx) { q.x -= x * dt; q.y -= y * dt; q.z -= z * dt; } });
}
// someone just got knocked down: kind is the weapon, hitY where they were hit, (dx, dz) the direction
export function knockFX(rag, kind, hitY, dx = 0, dz = 0) {
  if (!rag) return;
  const P = rag.parts, head = rag.p[0], mid = rag.p[1];
  const at = (txt, up = 0.6) => comicWord(txt, head.x, head.y + up, head.z);
  if (kind === 'laser') { // the bit that got zapped turns to cartoon ash and crumbles away
    const part = partFor(rag, hitY), mesh = P[part];
    setMat(mesh, ashMat);
    crumbles.push({ mesh, t: 0, dur: 1.4, base: mesh.scale.x });
    // everything else gets a scorched look on the side facing the beam, and a big spin
    if (part !== 'torso') setMat(P.torso, sootMat);
    kick(rag, -dz * 4, 3, dx * 4, 0);
    at(mpick(['ZAP!', 'FWOOSH!']));
    for (let i = 0; i < 6; i++) emitPuff(mid.x, mid.y, mid.z, { life: 0.5, vx: mr(-2, 2), vy: mr(0, 2), vz: mr(-2, 2), size0: 0.2, size1: 0.6, alpha: 0.8, color: mpick([0xff4020, 0xffc040]) });
  } else if (kind === 'crowbar') { // home run: spinning end over end, seeing stars
    kick(rag, -dz * 6, 4, dx * 6, 0); kick(rag, dz * 6, -2, -dx * 6, 7); kick(rag, dz * 6, -2, -dx * 6, 8);
    at(mpick(['BONK!', 'THWACK!'])); dizzy(rag, 4);
  } else if (kind === 'shotgun') { // blown backwards in a puff of soot, face blackened like an old cartoon
    setMat(P.head, sootMat); setMat(P.torso, sootMat);
    kick(rag, dx * 6, 3, dz * 6);
    for (let i = 0; i < 10; i++) emitPuff(mid.x, mid.y, mid.z, { life: 1.1, vx: mr(-2, 2) + dx * 2, vy: mr(0, 2), vz: mr(-2, 2) + dz * 2, size0: 0.5, size1: 1.8, alpha: 0.6, color: 0x5a5550 });
    at('KA-BOOM!'); dizzy(rag, 3);
  } else if (kind === 'pistol') { // a twirl, then a flop, seeing stars
    kick(rag, -dz * 3, 1.5, dx * 3, 1); kick(rag, dz * 3, 1.5, -dx * 3, 2);
    at(mpick(['BLAM!', 'POW!'])); dizzy(rag, 3.5);
  } else if (kind === 'smg') { // a little jitterbug dance on the way down
    for (let i = 0; i < 9; i++) kick(rag, mr(-3, 3), mr(0, 2), mr(-3, 3), i);
    at('RAT-A-TAT!'); dizzy(rag, 3);
  } else if (kind === 'car') { at('WHAM!'); dizzy(rag, 4); }
  else if (kind === 'water') { at(mpick(['SPLOOSH!', 'WHOOSH!'])); dizzy(rag, 2.5); }
  else if (kind === 'super') { at(mpick(['WHOOSH!', 'POW!', 'WHAM!'])); dizzy(rag, 3); }
  else { at('OOF!', 0.5); dizzy(rag, 2.5); }
}
// a hit that doesn't floor them: a little comic word and a wobble
export function hitFX(x, y, z, kind) {
  if (Math.random() < 0.45) comicWord(kind === 'crowbar' ? 'THWACK!' : kind === 'shotgun' ? 'POW!' : kind === 'laser' ? 'ZAP!' : 'OOF!', x, y + 0.6, z);
}
export function updateKnockFX(dt) {
  for (let i = crumbles.length - 1; i >= 0; i--) {
    const C = crumbles[i]; C.t += dt;
    const k = Math.max(0.02, 1 - C.t / C.dur), m = C.mesh;
    m.scale.setScalar(C.base * k);
    if (Math.random() < dt * 30) { const p = m.getWorldPosition(new THREE.Vector3()); emitPuff(p.x + mr(-0.15, 0.15), p.y, p.z + mr(-0.15, 0.15), { life: 1.2, vy: -mr(0.5, 2), vx: mr(-0.4, 0.4), vz: mr(-0.4, 0.4), size0: 0.12, size1: 0.05, alpha: 0.95, color: 0x1a1612 }); }
    if (C.t >= C.dur) { m.visible = false; crumbles.splice(i, 1); }
  }
  for (let i = words.length - 1; i >= 0; i--) {
    const W = words[i]; W.t += dt;
    const pop = W.t < 0.12 ? W.t / 0.12 * 1.3 : 1.3 - Math.min(0.3, (W.t - 0.12) * 2);
    W.s.scale.set(2.4 * pop, 0.75 * pop, 1); W.s.material.rotation = W.rot; W.s.position.y += W.vy * dt;
    if (W.t > W.life) { scene.remove(W.s); words.splice(i, 1); }
  }
  for (let i = dizzies.length - 1; i >= 0; i--) {
    const D = dizzies[i]; D.t += dt; const h = D.rag.p[0];
    D.stars.forEach((s, k) => { const a = D.t * 5 + (k * Math.PI * 2) / 3; s.position.set(h.x + Math.cos(a) * 0.35, h.y + 0.35 + Math.sin(D.t * 7 + k) * 0.05, h.z + Math.sin(a) * 0.35); });
    if (D.t > D.dur) { for (const s of D.stars) scene.remove(s); dizzies.splice(i, 1); }
  }
}
export const knockDebug = { crumbles, words, dizzies };
