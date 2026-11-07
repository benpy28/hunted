// Super villains for THE PARAGON to fight: each one has a lair on the map, gets up to no good there,
// and only fights you if you go to them. All original characters with their own attacks.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, mr, mpick, angDiff, scene, canvasTex, puffTex } from './core.js';
import { CITIES, floorAt, randomOpenPoint, resolveBody, moveBody } from './world.js';
import { buildPerson, setMood, SKINS, HAIRS } from './people.js';
import { emitPuff } from './fx.js';
import { sfx } from './audio.js';

// name, look, colours, attacks, and what they say
export const VILLAIN_DEFS = [
  { name: 'COLDSNAP', title: 'THE WINTER THAT WALKS', color: 0x9ad8ff, css: '#9ad8ff', hp: 120, speed: 5, scale: 1.55, attacks: ['volley', 'shock'],
    look: { skin: 0xc8e4f4, shirt: 0x3a7ab8, pants: 0xe8f4ff, hair: 0xf4fbff, hairStyle: 'spiky' },
    taunts: ['CHILL OUT, HERO', 'YOU LOOK COLD', 'ICE TO MEET YOU', 'FREEZE!'], lair: 'FREEZING THE FOUNTAINS', hurt: ['THAT STINGS!', 'MY ICE!'], beaten: 'I\'LL BE BACK... IN WINTER' },
  { name: 'SLAGHEAP', title: 'THE MOLTEN MOUNTAIN', color: 0xff7a2a, css: '#ff7a2a', hp: 180, speed: 3.4, scale: 2.0, attacks: ['lob', 'shock'],
    look: { skin: 0x3a2a24, shirt: 0x2a1a14, pants: 0x1a1210, hair: 0xff6a1a, hairStyle: 'mohawk', beard: true },
    taunts: ['SLAGHEAP SMASH YOUR FACE', 'HOT ENOUGH FOR YOU?', 'YOU\'RE NOT SO SHINY UP CLOSE', 'ROCKS FALL. YOU DIE.'], lair: 'MELTING THE CAR PARK', hurt: ['GRRR!', 'THAT TICKLES! NO IT DOESN\'T!'], beaten: 'SLAGHEAP... NAP NOW' },
  { name: 'HEXWIRE', title: 'QUEEN OF THE GRID', color: 0xc07aff, css: '#c07aff', hp: 110, speed: 6, scale: 1.45, attacks: ['beam', 'blink', 'volley'],
    look: { skin: 0xe8b88e, shirt: 0x5a2a8a, pants: 0x1a1a2a, hair: 0xe0e040, hairStyle: 'bob' },
    taunts: ['YOU\'RE ON MY GRID NOW', 'FEELING ZAPPY?', 'I\'VE SEEN YOUR BROWSER HISTORY', 'LIGHTS OUT, HERO'], lair: 'HACKING THE CASHPOINTS', hurt: ['SHORT CIRCUIT!', 'OW! RUDE!'], beaten: 'POWERING... DOWN...' },
  { name: 'THE UNDERTOW', title: 'TERROR OF THE DOCKS', color: 0x3ad0b0, css: '#3ad0b0', hp: 150, speed: 4.4, scale: 1.75, attacks: ['shock', 'lob', 'volley'],
    look: { skin: 0x6a9a8a, shirt: 0x1a4a5a, pants: 0x0a2a3a, hair: 0x1a3a2a, hairStyle: 'long', beard: true },
    taunts: ['THE TIDE IS TURNING', 'YOU\'LL SLEEP WITH THE FISH. NICELY.', 'SEA YOU LATER', 'GLUG GLUG, HERO'], lair: 'FLOODING THE WAREHOUSES', hurt: ['SPLASH! I MEAN OW!', 'YOU\'LL PAY FOR THAT'], beaten: 'BACK TO THE DEEP...' },
];
export const villains = [];
const V_capes = new Map(); // villain group -> cape mesh (it flaps)
const vProj = [], vRings = [], vBeams = [];
const vProjGeo = new THREE.SphereGeometry(0.35, 8, 6), vRingGeo = new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2), vBeamGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
const vTagTex = new Map();
function villainNameTag(V) {
  const t = canvasTex(512, 128, (ctx, W, H) => {
    ctx.font = 'bold 54px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#111'; ctx.strokeText(V.def.name, W / 2, 46); ctx.fillStyle = V.def.css; ctx.fillText(V.def.name, W / 2, 46);
    ctx.font = 'bold 26px Arial, sans-serif'; ctx.lineWidth = 5; ctx.strokeText(V.def.title, W / 2, 98); ctx.fillStyle = '#fff'; ctx.fillText(V.def.title, W / 2, 98);
  });
  vTagTex.set(V.def.name, t);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(3.2, 0.8, 1); s.position.y = 3.25; s.renderOrder = 6; return s;
}
function spawnVillain(def, lair) {
  const p = buildPerson(Object.assign({ face: { eyes: mpick(['big', 'sleepy', 'wide']), mouth: 'grin', freckles: false, glasses: false, stache: false, blush: false } }, def.look));
  const g = p.group; g.scale.setScalar(def.scale); scene.add(g);
  // costume: cape, shoulder pads, a belt and something on the head
  const dark = new THREE.Color(def.color).multiplyScalar(0.45).getHex();
  const part = (w, h, d, x, y, z, col, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col })); m.position.set(x, y, z); parent.add(m); return m; };
  const cape = part(0.72, 1.25, 0.05, 0, 0.92, -0.22, dark); cape.rotation.x = 0.12; V_capes.set(g, cape);
  for (const sx of [-1, 1]) part(0.26, 0.12, 0.3, sx * 0.4, 1.56, 0, def.color);
  part(0.64, 0.09, 0.37, 0, 0.86, 0, 0x1a1a1a, g); part(0.14, 0.09, 0.02, 0, 0.86, 0.19, def.color);
  for (const sx of [-1, 1]) { const horn = part(0.06, 0.2, 0.06, sx * 0.14, 0.26, 0.04, def.color, p.head); horn.rotation.z = -sx * 0.4; }
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: def.color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.scale.setScalar(2.6); aura.position.y = 1.1; g.add(aura);
  const V = { def, p, g, aura, x: lair.x, z: lair.z, y: floorAt(lair.x, lair.z, 0.5), lair, hp: def.hp, state: 'lair', face: 0, atkT: 2.5, atk: null, tauntT: 0, flashT: 0, downT: 0, vx: 0, vz: 0, phase: 0, strafe: 1, hurtLineT: 0 };
  V.tag = villainNameTag(V); g.add(V.tag);
  villains.push(V); return V;
}
// ---------------------------------------------------------------------
// HENCHMEN: every villain keeps a crew in matching outfits. They loaf about the lair doing odd jobs,
// pile in when their boss starts a fight, go down after a few hits, and scarper when the boss is beaten.
// ---------------------------------------------------------------------
export const HENCH_DEFS = {
  COLDSNAP: { name: 'FROSTBITE', crew: 'FROSTBITES', n: 5, color: 0xd8f0ff, css: '#d8f0ff', attack: 'throw', hat: 'bobble',
    look: { shirt: 0x6ab0e8, pants: 0xe8f4ff, hairStyle: 'short' },
    lines: ['SNOWBALL FIGHT!', 'FOR THE BOSS!', 'BRRR, GET HIM!', 'COLD SHOULDER, INCOMING'], hurt: ['MY TOES!', 'NOT THE FACE!', 'OOF!'], flee: 'THE BOSS IS MELTING! RUN!', clap: '...WHY ARE WE CLAPPING?',
    jobs: ['SHOVELLING SNOW', 'ICING THE BENCHES', 'PAINTING ICICLES'] },
  SLAGHEAP: { name: 'CINDER', crew: 'CINDERS', n: 4, color: 0xff9a3a, css: '#ff9a3a', attack: 'punch', hat: 'hardhat',
    look: { shirt: 0x3a2a24, pants: 0x2a2220, hairStyle: 'buzz' },
    lines: ['HOT HANDS COMING THROUGH', 'STAND STILL, SHINY', 'BOSS SAYS HIT YOU', 'FOR SLAGHEAP!'], hurt: ['OW, HOT!', 'MY HARD HAT!', 'OOF!'], flee: 'BOSS IS DOWN! LEG IT!', clap: 'NICE POSE. I HATE IT.',
    jobs: ['STOKING THE FIRE', 'CARRYING ROCKS', 'ON A TEA BREAK'] },
  HEXWIRE: { name: 'GLITCH', crew: 'GLITCHES', n: 5, color: 0xd09aff, css: '#d09aff', attack: 'zap', hat: 'visor',
    look: { shirt: 0x5a2a8a, pants: 0x2a2a3a, hairStyle: 'bob' },
    lines: ['RUNNING HERO.EXE... DELETE', 'ZAP ZAP!', 'TURN IT OFF AND ON AGAIN', 'FOR THE QUEEN!'], hurt: ['ERROR!', 'CTRL-ALT-OW!', 'OOF!'], flee: 'QUEEN OFFLINE! LOG OUT!', clap: 'APPLAUSE.WAV PLAYING...',
    jobs: ['SKIMMING CASHPOINTS', 'TYPING VERY FAST', 'UNPLUGGING THINGS'] },
  'THE UNDERTOW': { name: 'BILGE RAT', crew: 'BILGE RATS', n: 5, color: 0xf0d030, css: '#f0d030', attack: 'splash', hat: 'souwester',
    look: { shirt: 0xf0d030, pants: 0x1a3a4a, hairStyle: 'long' },
    lines: ['MAN THE BUCKETS!', 'YOU SMELL OF SOAP', 'SWAB HIM!', 'FOR THE UNDERTOW!'], hurt: ['GLUG!', 'ME KNEES!', 'OOF!'], flee: 'ABANDON SHIP! THE BOSS IS SUNK!', clap: 'CLAP... CLAP... ARR.',
    jobs: ['BAILING WATER', 'MOPPING UP', 'TYING KNOTS'] },
};
export const henchmen = [];
function spawnHench(V, k) {
  const HD = HENCH_DEFS[V.def.name]; if (!HD) return;
  const p = buildPerson(Object.assign({ skin: mpick(SKINS), hair: mpick(HAIRS) }, HD.look));
  const g = p.group; scene.add(g);
  const part = (w, h, d, x, y, z, col, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col })); m.position.set(x, y, z); parent.add(m); return m; };
  if (HD.hat === 'bobble') { part(0.42, 0.16, 0.42, 0, 0.24, 0, 0xffffff, p.head); part(0.14, 0.14, 0.14, 0, 0.38, 0, 0x6ab0e8, p.head); }
  else if (HD.hat === 'hardhat') { part(0.44, 0.14, 0.44, 0, 0.24, 0, 0xff8a1a, p.head); part(0.5, 0.03, 0.5, 0, 0.18, 0.02, 0xff8a1a, p.head); }
  else if (HD.hat === 'visor') part(0.42, 0.09, 0.08, 0, 0.04, 0.2, 0x1a1a1a, p.head);
  else { part(0.46, 0.12, 0.46, 0, 0.24, 0, 0xf0d030, p.head); part(0.56, 0.03, 0.62, 0, 0.17, -0.04, 0xf0d030, p.head); }
  part(0.5, 0.18, 0.02, 0, 1.25, 0.16, V.def.color, g); // the boss's colour on their chest
  const a = (k / HD.n) * Math.PI * 2;
  const H = { hench: true, boss: V, k, def: { name: HD.name, scale: 1, hp: 24, speed: 5.6 + Math.random(), color: HD.color, css: HD.css, hurt: HD.hurt }, HD, p, g,
    x: V.lair.x + Math.sin(a) * 7, z: V.lair.z + Math.cos(a) * 7, y: 0, hp: 24, state: 'lair', face: a, atkT: mr(0.5, 2), vx: 0, vz: 0, phase: Math.random() * 9, flashT: 0, downT: 0, hurtLineT: 0, clapT: 0, sayT: mr(3, 9), job: mpick(HD.jobs), strafe: Math.random() < 0.5 ? -1 : 1 };
  H.y = floorAt(H.x, H.z, 0.5);
  henchmen.push(H); return H;
}
function resetHench(H) {
  const a = (H.k / H.HD.n) * Math.PI * 2;
  H.state = 'lair'; H.hp = H.def.hp; H.downT = 0; H.clapT = 0; H.g.visible = true; H.g.rotation.set(0, 0, 0);
  H.x = H.boss.lair.x + Math.sin(a) * 7; H.z = H.boss.lair.z + Math.cos(a) * 7; H.y = floorAt(H.x, H.z, 0.5);
}
function henchHit(H, dmg, C, kx, kz) {
  if (H.state === 'down' || H.state === 'gone') return;
  if (H.state === 'lair') villainEngage(H.boss, C); // poke the crew and the boss comes too
  H.hp -= dmg; H.flashT = 0.12; H.vx += kx; H.vz += kz;
  H.hurtLineT -= dmg; if (H.hurtLineT <= 0) { H.hurtLineT = 12; C.sayAt(H, mpick(H.HD.hurt)); }
  if (H.hp <= 0) {
    H.state = 'down'; H.downT = 0; H.hp = 0; sfx.thud(); C.shake(0.1);
    for (let i = 0; i < 8; i++) emitPuff(H.x, H.y + 1, H.z, { life: 0.8, vx: mr(-3, 3), vy: mr(1, 4), vz: mr(-3, 3), size0: 0.3, size1: 1.2, alpha: 0.6, color: H.def.color });
    const left = henchmen.filter((o) => o.boss === H.boss && (o.state === 'fight' || o.state === 'lair')).length;
    C.showMsg(left ? `${H.def.name} DOWN · ${left} ${H.HD.crew} LEFT` : `ALL THE ${H.HD.crew} ARE DOWN`, 1.4);
    if (C.onHenchDown) C.onHenchDown(H);
  }
}
// the hero strikes a pose: henchmen can't help themselves either
export function henchClap(x, z, C) {
  let n = 0;
  for (const H of henchmen) if ((H.state === 'fight' || H.state === 'lair') && Math.hypot(H.x - x, H.z - z) < 32) { H.clapT = mr(2, 3); n++; if (n === 1) C.sayAt(H, H.HD.clap); }
  return n;
}
export const henchmenNear = (x, z, r) => henchmen.filter((H) => (H.state === 'fight' || H.state === 'lair') && Math.hypot(H.x - x, H.z - z) < r);
function henchFire(H, C) {
  const P = C.player, ex = P.x - H.x, ez = P.z - H.z, d = Math.hypot(ex, ez) || 1;
  const kind = H.HD.attack;
  if (kind === 'throw' || kind === 'splash') { // a lobbed snowball or bucket of bilge water
    const T = clamp(d / 14, 0.5, 1.2), tx = P.x + P.vx * T * 0.6, tz = P.z + P.vz * T * 0.6;
    const m = new THREE.Mesh(vProjGeo, new THREE.MeshBasicMaterial({ color: kind === 'throw' ? 0xf4fbff : 0x4a9ab0 })); m.scale.setScalar(kind === 'throw' ? 0.6 : 0.9);
    m.position.set(H.x, H.y + 1.7, H.z); scene.add(m);
    vProj.push({ m, V: H, vx: (tx - H.x) / T, vz: (tz - H.z) / T, vy: (P.y + 1 - (H.y + 1.7)) / T + 6 * T, life: 3, dmg: kind === 'throw' ? 2 : 3, grav: 12, aoe: kind === 'splash' ? 2.2 : 0, small: true });
    sfx.swoosh();
  } else if (d < 2.2 && Math.abs(P.y - H.y) < 1.8) { // a punch or a little zap, up close
    C.hurt(kind === 'zap' ? 3 : 4, H, kind === 'zap' ? 3 : 5);
    if (kind === 'zap') { sfx.vzap(); for (let i = 0; i < 5; i++) emitPuff(P.x, P.y + 1.2, P.z, { life: 0.4, vx: mr(-3, 3), vy: mr(0, 3), vz: mr(-3, 3), size0: 0.2, size1: 0.7, alpha: 0.9, color: H.def.color }); }
    else sfx.thud();
  }
}
function updateHench(H, dt, C) {
  const P = C.player, V = H.boss;
  H.phase += dt;
  if (H.state === 'gone') { H.g.visible = false; return; }
  if (H.state === 'down') {
    H.downT += dt; H.g.rotation.x = Math.min(1.45, H.downT * 3); H.g.position.set(H.x, H.y, H.z); setMood(H.p, 'scared');
    if (H.downT > 10) { H.state = 'gone'; H.g.visible = false; }
    return;
  }
  const dx = P.x - H.x, dz = P.z - H.z, d = Math.hypot(dx, dz);
  const near = d < 400; H.g.visible = near; if (!near && H.state !== 'flee') return;
  // follow the boss's lead
  if (H.state === 'lair' && V.state === 'fight') { H.state = 'fight'; H.atkT = mr(0.6, 2); if (Math.random() < 0.5) C.sayAt(H, mpick(H.HD.lines)); }
  if (H.state === 'fight' && V.state === 'lair') H.state = 'lair';
  if ((H.state === 'fight' || H.state === 'lair') && (V.state === 'down' || V.state === 'gone')) { H.state = 'flee'; H.downT = 0; if (H.k === 0) C.sayAt(H, H.HD.flee); }
  let tvx = 0, tvz = 0, spd = H.def.speed;
  H.clapT -= dt;
  if (H.clapT > 0) { // caught up in the applause
    setMood(H.p, 'happy'); H.face += angDiff(H.face, Math.atan2(dx, dz)) * Math.min(1, dt * 6);
    const c = Math.sin(H.phase * 18) * 0.35; H.p.armL.rotation.set(-1.3, 0, 0.5 + c); H.p.armR.rotation.set(-1.3, 0, -0.5 - c);
  } else if (H.state === 'lair') { // odd jobs round the lair
    setMood(H.p, 'neutral');
    const a = (H.k / H.HD.n) * Math.PI * 2 + Math.sin(H.phase * 0.2) * 0.6, r = 6 + Math.sin(H.phase * 0.33 + H.k) * 3;
    const lx = V.x + Math.sin(a) * r, lz = V.z + Math.cos(a) * r;
    tvx = clamp((lx - H.x) * 0.6, -2, 2); tvz = clamp((lz - H.z) * 0.6, -2, 2);
    H.face += angDiff(H.face, Math.atan2(tvx || 0.001, tvz)) * Math.min(1, dt * 3);
    H.sayT -= dt; if (H.sayT <= 0) { H.sayT = mr(10, 22); if (d < 60) C.sayAt(H, H.job); }
  } else if (H.state === 'fight') {
    setMood(H.p, 'angry');
    const ranged = H.HD.attack === 'throw' || H.HD.attack === 'splash';
    const want = ranged ? (d > 14 ? 1 : d < 7 ? -1 : 0) : (d > 1.4 ? 1 : 0), px = -dz / (d || 1), pz = dx / (d || 1);
    if (Math.random() < dt * 0.4) H.strafe *= -1;
    const st = ranged || d < 4 ? 0.45 : 0.15;
    tvx = (dx / (d || 1)) * want * spd + px * H.strafe * spd * st; tvz = (dz / (d || 1)) * want * spd + pz * H.strafe * spd * st;
    H.face += angDiff(H.face, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
    H.atkT -= dt;
    if (H.atkT <= 0 && (ranged ? d < 26 : d < 2.2)) { H.atkT = ranged ? mr(2, 3.4) : mr(1.3, 2.1); henchFire(H, C); }
    H.sayT -= dt; if (H.sayT <= 0) { H.sayT = mr(6, 14); C.sayAt(H, P.y - H.y > 4 ? 'COME DOWN AND FIGHT FAIR!' : mpick(H.HD.lines)); }
    if (d > 160) H.state = 'lair';
  } else if (H.state === 'flee') { // scarper, then vanish
    setMood(H.p, 'scared'); H.downT += dt;
    tvx = (-dx / (d || 1)) * spd * 1.2; tvz = (-dz / (d || 1)) * spd * 1.2;
    H.face += angDiff(H.face, Math.atan2(tvx, tvz)) * Math.min(1, dt * 8);
    if (H.downT > 8) { H.state = 'gone'; H.g.visible = false; return; }
  }
  H.vx = lerp(H.vx, tvx, Math.min(1, dt * 4)); H.vz = lerp(H.vz, tvz, Math.min(1, dt * 4));
  const ox = H.x, oz = H.z; H.x += H.vx * dt; H.z += H.vz * dt;
  moveBody(H, ox, oz, 0.35, H.y, 1.8);
  H.y = lerp(H.y, floorAt(H.x, H.z, H.y + 1), Math.min(1, dt * 10));
  if (H.clapT <= 0) {
    const sp = Math.hypot(H.vx, H.vz), sw = Math.sin(H.phase * 9) * Math.min(1, sp / 3) * 0.8, p = H.p;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    const swing = H.state === 'fight' && H.atkT > (H.HD.attack === 'throw' || H.HD.attack === 'splash' ? 1.7 : 1.0);
    p.armL.rotation.set(-sw * 0.7, 0, 0); p.armR.rotation.set(swing ? -2.4 : sw * 0.7, 0, 0);
  }
  H.flashT -= dt;
  H.g.position.set(H.x, H.y, H.z); H.g.rotation.y = H.face;
}

// one villain per town, plus one who roams the countryside
export function resetVillains(C) {
  for (const V of villains) scene.remove(V.g); villains.length = 0;
  for (const H of henchmen) scene.remove(H.g); henchmen.length = 0;
  for (const P of vProj) scene.remove(P.m); vProj.length = 0; for (const R of vRings) scene.remove(R.m); vRings.length = 0; for (const B of vBeams) scene.remove(B.m); vBeams.length = 0;
  if (!C.G.super) return;
  const spots = CITIES.map((c) => randomOpenPoint(c.cx, c.cz, 90, 150, 60)); // never right where you start
  spots.push(randomOpenPoint(350, 350, 0, 80, 40));
  VILLAIN_DEFS.forEach((def, i) => { const s = spots[i] || spots[0]; if (s) { const V = spawnVillain(def, s); for (let k = 0; k < (HENCH_DEFS[def.name]?.n || 0); k++) spawnHench(V, k); } });
}
export function villainMapMarks() { return villains.filter((V) => V.state !== 'gone').map((V) => ({ x: V.x, z: V.z, color: V.def.css, name: V.def.name, villain: true, fighting: V.state === 'fight' })); }

function villainFire(V, C, kind) {
  const P = C.player, ex = P.x - V.x, ey = P.y + 1.2 - (V.y + 2), ez = P.z - V.z, d = Math.hypot(ex, ey, ez) || 1;
  if (kind === 'volley') { // a fan of shards
    for (let i = -2; i <= 2; i++) {
      const a = Math.atan2(ex, ez) + i * 0.12, sp = 26, el = ey / d;
      const m = new THREE.Mesh(vProjGeo, new THREE.MeshBasicMaterial({ color: V.def.color })); m.position.set(V.x, V.y + 2 * V.def.scale * 0.7, V.z); scene.add(m);
      vProj.push({ m, V, vx: Math.sin(a) * sp * Math.sqrt(1 - el * el), vy: el * sp, vz: Math.cos(a) * sp * Math.sqrt(1 - el * el), life: 3, dmg: 6, grav: 0, aoe: 0 });
    }
    sfx.ice();
  } else if (kind === 'lob') { // big molten (or watery) boulders that land where you're heading
    for (let i = 0; i < 3; i++) {
      const tx = P.x + P.vx * 1.2 + mr(-4, 4), tz = P.z + P.vz * 1.2 + mr(-4, 4), T = 1.4, dx = tx - V.x, dz = tz - V.z;
      const m = new THREE.Mesh(vProjGeo, new THREE.MeshBasicMaterial({ color: V.def.color })); m.scale.setScalar(2); m.position.set(V.x, V.y + 3, V.z); scene.add(m);
      vProj.push({ m, V, vx: dx / T, vz: dz / T, vy: (floorAt(tx, tz, P.y + 1) - (V.y + 3)) / T + 11 * T, life: 4, dmg: 14, grav: 22, aoe: 4.5 });
    }
    sfx.thud();
  } else if (kind === 'shock') { // a ground ring you have to jump or fly over
    const m = new THREE.Mesh(vRingGeo, new THREE.MeshBasicMaterial({ color: V.def.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(V.x, V.y + 0.15, V.z); scene.add(m); vRings.push({ m, V, r: 1, y: V.y, hit: false });
    sfx.explode(); C.shake(0.25);
  } else if (kind === 'beam') { // aim, then a lightning beam down the line
    const m = new THREE.Mesh(vBeamGeo, new THREE.MeshBasicMaterial({ color: V.def.color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(m); vBeams.push({ m, V, t: 0, tx: P.x, ty: P.y + 1, tz: P.z, fired: false });
  } else if (kind === 'blink') { // pop up somewhere else around you
    for (let i = 0; i < 10; i++) emitPuff(V.x, V.y + 1.5, V.z, { life: 0.6, vx: mr(-4, 4), vy: mr(-2, 4), vz: mr(-4, 4), size0: 0.4, size1: 1.4, alpha: 0.8, color: V.def.color });
    const a = Math.random() * 6.28, p = randomOpenPoint(P.x + Math.sin(a) * 14, P.z + Math.cos(a) * 14, 0, 6, 10);
    if (p) { V.x = p.x; V.z = p.z; V.y = floorAt(p.x, p.z, P.y + 1); }
    sfx.vzap();
  }
}
// the player hits a villain: lasers, swats, slams and flying cars
export function villainHit(V, dmg, C, kx = 0, kz = 0) {
  if (V.hench) { henchHit(V, dmg, C, kx, kz); return; }
  if (V.state === 'down' || V.state === 'gone') return;
  if (V.state === 'lair') villainEngage(V, C);
  V.hp -= dmg; V.flashT = 0.12; V.vx += kx; V.vz += kz;
  V.hurtLineT -= dmg; if (V.hurtLineT <= 0) { V.hurtLineT = 30; C.sayAt(V, mpick(V.def.hurt)); }
  if (V.hp <= 0) villainBeaten(V, C);
}
export function villainsNear(x, y, z, r) { return [...villains, ...henchmen].filter((V) => (V.state === 'fight' || V.state === 'lair') && Math.hypot(V.x - x, V.z - z) < r + V.def.scale * 0.5 && y > V.y - 2 && y < V.y + 2 * V.def.scale + 2); }
// first villain hit by a ray from o along unit d (for laser eyes)
export function villainRay(o, d, maxT) {
  let best = null, bt = maxT;
  for (const V of villains.concat(henchmen)) {
    if (V.state === 'down' || V.state === 'gone' || V.state === 'flee') continue;
    const cx = V.x, cy = V.y + V.def.scale, cz = V.z, r = V.def.scale * 0.65;
    const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz, b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c;
    if (disc < 0) continue; const t = -b - Math.sqrt(disc);
    if (t > 0 && t < bt) { bt = t; best = V; }
  }
  return best ? { V: best, t: bt } : null;
}
function villainEngage(V, C) {
  if (V.state === 'fight') return;
  V.state = 'fight'; V.atkT = 1.5; C.G.villainFight = V; sfx.sting();
  const crew = HENCH_DEFS[V.def.name], nCrew = henchmen.filter((H) => H.boss === V && H.state === 'lair').length;
  C.showBanner(`<small>SUPER VILLAIN</small>${V.def.name}${crew && nCrew ? `<small>AND ${nCrew} ${crew.crew}</small>` : ''}`, 2.5); C.sayAt(V, mpick(V.def.taunts));
  for (const h of C.G.hunters) if (!h.dead && Math.hypot(h.x - V.x, h.z - V.z) < 50) h.panicT = mr(6, 10);
}
function villainBeaten(V, C) {
  V.state = 'down'; V.downT = 0; V.hp = 0; C.G.villainFight = null;
  C.sayAt(V, V.def.beaten); sfx.cheer(); C.shake(0.3);
  C.showBanner(`<small>VILLAIN DEFEATED</small>${V.def.name}`, 4);
  C.onBeaten(V);
  for (let i = 0; i < 16; i++) emitPuff(V.x, V.y + 1, V.z, { life: 1.2, vx: mr(-5, 5), vy: mr(1, 5), vz: mr(-5, 5), size0: 0.5, size1: 2, alpha: 0.7, color: V.def.color });
  for (const h of C.G.hunters) if (!h.dead && Math.hypot(h.x - V.x, h.z - V.z) < 60) { h.panicT = 0; h.clapT = mr(2, 4); }
}
export function updateVillains(dt, C) {
  const P = C.player;
  for (const V of villains) {
    const dx = P.x - V.x, dz = P.z - V.z, d = Math.hypot(dx, dz), dy = P.y - V.y;
    V.phase += dt;
    if (V.state === 'gone') { V.downT += dt; if (V.downT > 180) { V.state = 'lair'; V.hp = V.def.hp; V.x = V.lair.x; V.z = V.lair.z; V.y = floorAt(V.x, V.z, 0.5); V.g.visible = true; for (const H of henchmen) if (H.boss === V) resetHench(H); } continue; }
    if (V.state === 'down') { // slumped, then carted off
      V.downT += dt; V.g.rotation.x = Math.min(1.4, V.downT * 2); V.g.position.set(V.x, V.y, V.z);
      setMood(V.p, 'scared');
      if (V.downT > 6) { V.state = 'gone'; V.downT = 0; V.g.visible = false; V.g.rotation.x = 0; }
      continue;
    }
    const near = d < 400;
    V.g.visible = near;
    if (!near) continue;
    let tvx = 0, tvz = 0;
    if (V.state === 'lair') { // causing trouble at the lair, minding their own business
      setMood(V.p, 'smug');
      const lx = V.lair.x + Math.sin(V.phase * 0.4) * 5, lz = V.lair.z + Math.cos(V.phase * 0.3) * 5;
      tvx = (lx - V.x) * 0.5; tvz = (lz - V.z) * 0.5;
      V.face += angDiff(V.face, Math.atan2(tvx, tvz)) * Math.min(1, dt * 3);
      if (Math.random() < dt * 4) emitPuff(V.lair.x + mr(-6, 6), V.y + 0.3, V.lair.z + mr(-6, 6), { life: 1.5, vy: mr(0.5, 2), size0: 0.4, size1: 1.6, alpha: 0.35, color: V.def.color });
      V.tauntT -= dt; if (V.tauntT <= 0 && d < 80) { V.tauntT = mr(6, 12); C.sayAt(V, `${V.def.lair}! MWAHAHA!`); }
      if (d < 42 && Math.abs(dy) < 30) villainEngage(V, C);
    } else if (V.state === 'fight') {
      setMood(V.p, 'angry');
      if (d > 140) { V.state = 'lair'; V.hp = Math.min(V.def.hp, V.hp + V.def.hp * 0.5); if (C.G.villainFight === V) C.G.villainFight = null; C.showMsg(`${V.def.name} WENT BACK TO THE LAIR`, 2); continue; }
      const want = d > 22 ? 1 : d < 10 ? -1 : 0, px = -dz / (d || 1), pz = dx / (d || 1);
      if (Math.random() < dt * 0.3) V.strafe *= -1;
      tvx = (dx / (d || 1)) * want * V.def.speed + px * V.strafe * V.def.speed * 0.5; tvz = (dz / (d || 1)) * want * V.def.speed + pz * V.strafe * V.def.speed * 0.5;
      V.face += angDiff(V.face, Math.atan2(dx, dz)) * Math.min(1, dt * 6);
      V.atkT -= dt;
      if (V.atkT <= 0) { V.atkT = mr(1.8, 3.2) * (V.hp < V.def.hp * 0.4 ? 0.7 : 1); villainFire(V, C, mpick(V.def.attacks)); }
      V.tauntT -= dt; if (V.tauntT <= 0) { V.tauntT = mr(7, 12); C.sayAt(V, mpick(V.def.taunts)); }
    }
    V.vx = lerp(V.vx, tvx, Math.min(1, dt * 3)); V.vz = lerp(V.vz, tvz, Math.min(1, dt * 3));
    const vox = V.x, voz = V.z; V.x += V.vx * dt; V.z += V.vz * dt;
    moveBody(V, vox, voz, 0.5 * V.def.scale, V.y, 2 * V.def.scale);
    V.y = lerp(V.y, floorAt(V.x, V.z, V.y + 1), Math.min(1, dt * 8));
    const sp = Math.hypot(V.vx, V.vz), sw = Math.sin(V.phase * 6) * Math.min(1, sp / 3) * 0.7, p = V.p;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    const casting = V.state === 'fight' && V.atkT < 0.5;
    p.armL.rotation.x = casting ? -2.6 : -sw * 0.6; p.armR.rotation.x = casting ? -2.6 : sw * 0.6;
    V.flashT -= dt; V.aura.material.opacity = V.flashT > 0 ? 1 : 0.35 + Math.sin(V.phase * 4) * 0.1; V.aura.scale.setScalar(V.flashT > 0 ? 3.4 : 2.6);
    const cp = V_capes.get(V.g); if (cp) cp.rotation.x = 0.12 + Math.min(0.9, sp * 0.12) + Math.sin(V.phase * 7) * 0.05;
    V.g.position.set(V.x, V.y + (V.def.name === 'HEXWIRE' ? 0.4 + Math.sin(V.phase * 2) * 0.2 : 0), V.z); V.g.rotation.y = V.face;
  }
  for (const H of henchmen) updateHench(H, dt, C);
  // shards and boulders
  for (let i = vProj.length - 1; i >= 0; i--) {
    const Q = vProj[i]; Q.life -= dt; Q.vy -= Q.grav * dt;
    const m = Q.m; m.position.x += Q.vx * dt; m.position.y += Q.vy * dt; m.position.z += Q.vz * dt;
    const pd = Math.hypot(m.position.x - P.x, m.position.y - (P.y + 1), m.position.z - P.z);
    const fl = floorAt(m.position.x, m.position.z, m.position.y + 0.5);
    let pop = Q.life <= 0;
    if (!Q.aoe && pd < 1.1) { C.hurt(Q.dmg, Q.V); pop = true; }
    if (m.position.y <= fl) { if (Q.aoe && pd < Q.aoe) C.hurt(Q.dmg, Q.V); pop = true; if (Q.aoe) { C.shake(0.15); for (let k = 0; k < 6; k++) emitPuff(m.position.x, fl + 0.3, m.position.z, { life: 1, vx: mr(-4, 4), vy: mr(1, 4), vz: mr(-4, 4), size0: 0.6, size1: 2, alpha: 0.6, color: Q.V.def.color }); } }
    if (pop) { scene.remove(m); vProj.splice(i, 1); }
  }
  // shock rings: jump or fly over them
  for (let i = vRings.length - 1; i >= 0; i--) {
    const R = vRings[i]; R.r += dt * 16; R.m.scale.set(R.r, 1, R.r); R.m.material.opacity = clamp(1 - R.r / 30, 0, 0.85);
    const pd = Math.hypot(P.x - R.m.position.x, P.z - R.m.position.z);
    if (!R.hit && Math.abs(pd - R.r) < 1.2 && P.y - R.y < 1.1) { R.hit = true; C.hurt(12, R.V, 14); }
    if (R.r > 30) { scene.remove(R.m); vRings.splice(i, 1); }
  }
  // beams: a warning line, then the zap
  for (let i = vBeams.length - 1; i >= 0; i--) {
    const B = vBeams[i]; B.t += dt; const V = B.V;
    const fx = V.x, fy = V.y + 2 * V.def.scale * 0.8, fz = V.z;
    const len = Math.hypot(B.tx - fx, B.ty - fy, B.tz - fz) * 1.6;
    B.m.position.set(fx, fy, fz); B.m.lookAt(B.tx, B.ty, B.tz); B.m.scale.set(B.t < 0.8 ? 0.05 : 0.5, B.t < 0.8 ? 0.05 : 0.5, len);
    if (B.t >= 0.8 && !B.fired) {
      B.fired = true; B.m.material.opacity = 0.9; sfx.vzap();
      // distance from the player to the beam line
      const ux = (B.tx - fx), uy = (B.ty - fy), uz = (B.tz - fz), ul = Math.hypot(ux, uy, uz) || 1;
      const wx = P.x - fx, wy = P.y + 1 - fy, wz = P.z - fz, along = (wx * ux + wy * uy + wz * uz) / ul;
      const off = Math.hypot(wx - ux / ul * along, wy - uy / ul * along, wz - uz / ul * along);
      if (along > 0 && along < len && off < 1.4) C.hurt(18, V, 8);
    }
    if (B.t > 1.1 || V.state !== 'fight') { scene.remove(B.m); vBeams.splice(i, 1); }
  }
}
