// City life: what townsfolk do when they're not hunting you. They sit on benches, wait for the bus,
// queue at food carts, stop for a chat, take calls, pop into shops, and some have jobs: vendors at
// the carts, street sweepers, buskers, couriers, joggers, tourists with cameras and dog walkers.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, angDiff, lerp, scene } from './core.js';
import { blockedAt, floorAt } from './world.js';
import { lifeSpots, walkIns } from './streets.js';
import { lam } from './people.js';
import { emitPuff } from './fx.js';

export const JOBS = ['vendor', 'sweeper', 'busker', 'courier', 'jogger', 'tourist', 'dogwalker'];
const LIFE_JOB_LINES = {
  vendor: ['HOT PRETZELS!', 'GET YOUR CHURROS!', 'TWO FOR ONE!', 'FRESH LEMONADE!', 'HOT DOGS! HOT!', 'BEST IN TOWN!'],
  busker: ['♪ ♫ ♪', '♪ OOH BABY ♪', '♫ LA LA LA ♫', '♪ ♪ ♪', 'ANY SPARE CHANGE?', 'TAKING REQUESTS!'],
  courier: ['DELIVERY!', 'SIGN HERE', 'WRONG ADDRESS AGAIN', 'PARCEL FOR... NUMBER 9?'],
  tourist: ['SO PRETTY!', 'ONE MORE!', 'SAY CHEESE!', 'IS THIS THE FAMOUS BIT?', 'WHERE\'S THE MUSEUM?'],
  sweeper: ['WHO DROPS THIS STUFF?', 'CLEAN STREETS, HAPPY STREETS', 'MIND THE BROOM'],
  dogwalker: ['WHO\'S A GOOD BOY?', 'NO! DROP IT!', 'HEEL! HEEL!', 'SORRY, HE\'S FRIENDLY'],
  jogger: ['ON YOUR LEFT!', 'PERSONAL BEST!', 'HUFF... HUFF...'],
};
const LIFE_CHATS = [
  ['DID YOU SEE THE NEWS?', 'THE BOUNTY THING? MAD.'], ['NICE WEATHER', 'FOR NOW'], ['MY LANDLORD AGAIN', 'THE RENT?', 'TWICE THIS MONTH'],
  ['I\'D SPOT THEM IN A SECOND', 'SURE YOU WOULD'], ['WHAT\'S THE PRIZE MONEY?', 'ENOUGH TO RETIRE'], ['FANCY A COFFEE?', 'ALWAYS'],
  ['HOW\'S THE BACK?', 'DON\'T ASK'], ['YOU WATCHING THE MATCH?', 'WHICH ONE?', 'EXACTLY'], ['THAT CAFE SHUT DOWN', 'THE GOOD ONE?', 'THE GOOD ONE.'],
  ['IS THAT A NEW HAT?', 'IT\'S A DISGUISE', 'FROM WHO?'], ['HOW\'S YOUR MUM?', 'STILL ON THE ROOF'], ['I SAW THEM ON THE TRAIN', 'YOU SAY THAT EVERY DAY'],
  ['BUS IS LATE AGAIN', 'BUS IS ALWAYS LATE'], ['TRIED THE NEW DINER?', 'GAVE ME HICCUPS'], ['LOVELY DOG', 'IT\'S A CAT'],
];
const LIFE_HERO_CHATS = [
  ['DON\'T LOOK UP', 'IS HE HERE?', 'HE\'S ALWAYS HERE'], ['HE THREW A BUS YESTERDAY', 'WAS IT A BAD BUS?', 'IT WAS EMPTY. MOSTLY.'],
  ['SMILE IF HE FLIES OVER', 'I AM SMILING'], ['MY CAT WAS STUCK UP A TREE', 'DID HE HELP?', 'HE LASERED THE TREE'],
  ['HE SIGNED MY CAST', 'YOU DIDN\'T HAVE A CAST', 'I DO NOW'], ['HE SAVED ME ONCE', 'FROM WHAT?', 'HE WON\'T SAY'],
  ['APPROVAL\'S AT 99 PERCENT', 'WHO ASKED?', 'NOBODY DARED'], ['HE STARED AT MY SANDWICH', 'DID YOU GIVE IT HIM?', 'I GAVE HIM ALL MY SANDWICHES'],
];
// gossip the hero is not supposed to hear (but does)
export const CRITIC_CHATS = [
  ['HONESTLY? HE\'S A MENACE', 'SHH! HE CAN HEAR!'], ['HE\'S NOT EVEN THAT STRONG', 'ARE YOU MAD?!'],
  ['I PREFERRED THE OLD HERO', 'WE DON\'T TALK ABOUT HIM'], ['HE NEVER SAVES ANYONE', 'KEEP YOUR VOICE DOWN'],
  ['THAT CAPE IS RIDICULOUS', 'PLEASE STOP TALKING'],
];
const LIFE_PHONE_LINES = ['NO, YOU HANG UP', 'I\'M ON THE HIGH STREET', 'CAN\'T TALK, BYE', 'HE\'S DONE WHAT?!', 'SEE YOU AT SIX', 'MUM, I\'M FINE'];

// ---------------------------------------------------------------------
// props people carry for their jobs
// ---------------------------------------------------------------------
const LIFE_PROPG = {
  stick: new THREE.BoxGeometry(0.05, 1.3, 0.05).translate(0, -0.95, 0.05),
  brush: new THREE.BoxGeometry(0.42, 0.12, 0.14).translate(0, -1.6, 0.05),
  gbody: new THREE.BoxGeometry(0.44, 0.52, 0.12), gneck: new THREE.BoxGeometry(0.07, 0.5, 0.05),
  parcel: new THREE.BoxGeometry(0.46, 0.34, 0.36), cam: new THREE.BoxGeometry(0.16, 0.11, 0.1).translate(0, -0.76, 0.08),
  phone: new THREE.BoxGeometry(0.07, 0.14, 0.03).translate(0, -0.76, 0.09), food: new THREE.BoxGeometry(0.14, 0.08, 0.2).translate(0, -0.76, 0.12),
  leash: new THREE.BoxGeometry(0.02, 0.02, 1).translate(0, 0, 0.5),
};
function jobProp(parent, geo, hex, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, lam(hex)); m.position.set(x, y, z); parent.add(m); return m; }
function giveLifeJobProps(h) {
  const p = h.p, J = h.job;
  if (J === 'sweeper') { jobProp(p.armR, LIFE_PROPG.stick, 0x8a6a3a); jobProp(p.armR, LIFE_PROPG.brush, 0x2a2a2a); }
  else if (J === 'busker') { const g = new THREE.Group(); g.position.set(0.05, -0.05, 0.24); g.rotation.z = -0.6; jobProp(g, LIFE_PROPG.gbody, 0xa0582a); jobProp(g, LIFE_PROPG.gneck, 0x5a3a1a, 0.18, 0.42, 0); p.torso.add(g); h.guitar = g; }
  else if (J === 'courier') { h.parcel = jobProp(p.torso, LIFE_PROPG.parcel, 0xb08a5a, 0, -0.05, 0.42); }
  else if (J === 'tourist') { jobProp(p.armR, LIFE_PROPG.cam, 0x1a1a1a); }
  if (J !== 'sweeper' && J !== 'tourist') h.phone = jobProp(p.armR, LIFE_PROPG.phone, 0x111418);
  if (h.phone) h.phone.visible = false;
}

// ---------------------------------------------------------------------
// lifeDogs
// ---------------------------------------------------------------------
const lifeDogs = [];
const LIFE_DOG_COLS = [0x8a5a2a, 0xe0d0b0, 0x2a2a2a, 0xc0a070, 0xf0f0f0, 0x6a4a3a];
function makeLifeDog(owner) {
  const g = new THREE.Group(), c = mpick(LIFE_DOG_COLS), s = mr(0.7, 1.15);
  const box = (w, hh, d, x, y, z, col = c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), lam(col)); m.position.set(x, y, z); g.add(m); return m; };
  box(0.3, 0.26, 0.62, 0, 0.42, 0); const head = box(0.24, 0.24, 0.26, 0, 0.62, 0.38); box(0.12, 0.1, 0.12, 0, 0.58, 0.55, 0x1a1a1a);
  box(0.06, 0.12, 0.06, -0.09, 0.78, 0.36); box(0.06, 0.12, 0.06, 0.09, 0.78, 0.36);
  const legs = [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.22], [0.1, -0.22]].map(([x, z]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08).translate(0, -0.15, 0), lam(c)); l.position.set(x, 0.32, z); g.add(l); return l; });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.28).translate(0, 0, -0.14), lam(c)); tail.position.set(0, 0.5, -0.3); g.add(tail);
  g.scale.setScalar(s); scene.add(g);
  const D = { g, head, legs, tail, owner, x: owner.x - 1, z: owner.z, y: owner.y, face: 0, phase: 0, loose: 0 };
  lifeDogs.push(D); return D;
}
function updateLifeDogs(dt, C) {
  for (let i = lifeDogs.length - 1; i >= 0; i--) {
    const D = lifeDogs[i], O = D.owner;
    let tx, tz, spd = 0;
    if (O.dead || O.state === 'chase') { // owner gone: the dog legs it, then wanders off
      D.loose += dt; if (D.loose > 8) { scene.remove(D.g); lifeDogs.splice(i, 1); continue; }
      tx = D.x + Math.sin(D.face) * 4; tz = D.z + Math.cos(D.face) * 4; spd = 5;
    } else {
      const fx = Math.sin(O.face), fz = Math.cos(O.face);
      tx = O.x - fx * 0.4 + fz * 0.9; tz = O.z - fz * 0.4 - fx * 0.9;
      const d = Math.hypot(tx - D.x, tz - D.z); spd = d > 6 ? 7 : d > 0.4 ? Math.min(4.5, d * 2.2) : 0;
      if (d > 25) { D.x = tx; D.z = tz; spd = 0; }
    }
    const dx = tx - D.x, dz = tz - D.z, d = Math.hypot(dx, dz) || 1;
    if (spd > 0 && !blockedAt(D.x + dx / d * 0.5, D.z + dz / d * 0.5)) { D.x += dx / d * spd * dt; D.z += dz / d * spd * dt; D.face += angDiff(D.face, Math.atan2(dx, dz)) * Math.min(1, dt * 8); }
    D.y = lerp(D.y, O.dead ? D.y : O.y, Math.min(1, dt * 6));
    D.phase += spd * dt * 5;
    const sw = Math.sin(D.phase) * Math.min(1, spd / 2) * 0.7;
    D.legs[0].rotation.x = sw; D.legs[3].rotation.x = sw; D.legs[1].rotation.x = -sw; D.legs[2].rotation.x = -sw;
    D.tail.rotation.y = Math.sin(C.time * 14) * 0.6; D.tail.rotation.x = -0.5;
    D.g.position.set(D.x, D.y, D.z); D.g.rotation.y = D.face;
    D.barkT = (D.barkT ?? mr(5, 20)) - dt;
    if (D.barkT <= 0) { D.barkT = mr(8, 25); if (!O.dead && C.near(D.x, D.z, 25)) C.say(O, mpick(['WOOF!', 'WOOF WOOF!', 'ARF!'])); }
  }
}
export function clearCityLife() { for (const D of lifeDogs) scene.remove(D.g); lifeDogs.length = 0; for (const s of lifeSpots) s.taken = null; lifeVendorCarts.clear(); }

// ---------------------------------------------------------------------
// jobs and activities
// ---------------------------------------------------------------------
const lifeVendorCarts = new Map(); // cart spot -> vendor
// called once when someone is spawned: maybe give them a job
export function assignJob(h, C) {
  if (h.type === 'cop' || h.type === 'brute' || h.contract || h.rival || h.guard) return;
  const r = Math.random();
  let job = null;
  if (r < 0.05) job = 'vendor'; else if (r < 0.09) job = 'sweeper'; else if (r < 0.12) job = 'busker'; else if (r < 0.17) job = 'courier';
  else if (r < 0.23) job = 'jogger'; else if (r < 0.28) job = 'tourist'; else if (r < 0.34) job = 'dogwalker';
  if (job === 'vendor') { // needs a free cart nearby
    let best = null, bd = 90;
    for (const s of lifeSpots) if (s.kind === 'cart' && !lifeVendorCarts.has(s)) { const d = Math.hypot(s.x - h.x, s.z - h.z); if (d < bd) { bd = d; best = s; } }
    if (!best) job = 'tourist'; else { lifeVendorCarts.set(best, h); h.cart = best; }
  }
  h.job = job;
  if (!job) return;
  giveLifeJobProps(h);
  if (job === 'jogger') h.walkK = 2.3;
  if (job === 'courier') h.walkK = 1.35;
  if (job === 'sweeper') h.walkK = 0.6;
  if (job === 'dogwalker') makeLifeDog(h);
}
export function releaseJob(h) { if (h.cart && lifeVendorCarts.get(h.cart) === h) lifeVendorCarts.delete(h.cart); }

function nearestLifeSpot(h, kind, maxD) {
  let best = null, bd = maxD;
  for (const s of lifeSpots) { if (s.kind !== kind || s.taken) continue; const d = Math.abs(s.x - h.x) + Math.abs(s.z - h.z); if (d < bd && Math.abs(h.y) < 1) { bd = d; best = s; } }
  return best;
}
function lifeCartSides(s) { // the two long sides of a cart: one for the vendor, one for customers
  const px = s.alongX ? 0 : 1, pz = s.alongX ? 1 : 0, off = s.alongX ? 1.15 : 1.15;
  return [{ x: s.x + px * off, z: s.z + pz * off, face: Math.atan2(-px, -pz) }, { x: s.x - px * off, z: s.z - pz * off, face: Math.atan2(px, pz) }].filter((q) => !blockedAt(q.x, q.z));
}
function lifeBegin(h, kind, tx, tz, face, dur, extra) {
  h.act = Object.assign({ kind, tx, tz, face, dur, phase: 'go', t: 0, goT: 0, lineT: mr(0.5, 3) }, extra);
  return true;
}
// someone has finished what they were doing: what next?
export function lifeStart(h, C) {
  if (h.act || h.state === 'chase' || h.huntT > 0 || Math.abs(h.y) > 1 || h.contract || h.rival || h.guard) return false;
  const hr = C.hour, night = hr < 6 || hr > 22.5, J = h.job;
  if (J === 'vendor' && h.cart) { const sd = lifeCartSides(h.cart)[0]; if (sd) return lifeBegin(h, 'vend', sd.x, sd.z, sd.face, night ? 20 : mr(60, 140)); }
  if (J === 'busker' && Math.random() < 0.8) return lifeBegin(h, 'busk', h.x, h.z, h.face, mr(40, 90));
  if (J === 'tourist' && Math.random() < 0.6) return lifeBegin(h, 'photo', h.x, h.z, h.face + mr(-1.5, 1.5), mr(3, 6));
  if (J === 'courier' && walkIns.length && Math.random() < 0.7) { const W = nearestWalkInFor(h, 70); if (W) return lifeBegin(h, 'deliver', W.x, W.z, null, mr(3, 5), { W }); }
  if (J === 'sweeper' && Math.random() < 0.5) return lifeBegin(h, 'sweep', h.x, h.z, h.face + mr(-1, 1), mr(4, 9));
  if (J === 'dogwalker' && Math.random() < 0.4) return lifeBegin(h, 'sniff', h.x, h.z, h.face, mr(3, 7));
  if (J === 'jogger') return Math.random() < 0.15 ? lifeBegin(h, 'stretch', h.x, h.z, h.face, mr(4, 8)) : false;
  const r = Math.random() * (night ? 2.5 : 1);
  const lunch = hr > 11 && hr < 14.5, commute = (hr > 7 && hr < 9.5) || (hr > 16.5 && hr < 19);
  if (r < (commute ? 0.3 : 0.12)) { const s = nearestLifeSpot(h, 'bus', 60); if (s) { s.taken = h; return lifeBegin(h, 'bus', s.x, s.z, s.face, mr(15, 40), { spot: s }); } }
  if (r < 0.32) { const s = nearestLifeSpot(h, 'bench', 45); if (s) { s.taken = h; return lifeBegin(h, 'sit', s.x, s.z, s.face, mr(10, 30), { spot: s }); } }
  if (r < (lunch ? 0.6 : 0.42)) {
    let best = null, bd = 50; for (const s of lifeSpots) if (s.kind === 'cart' && lifeVendorCarts.has(s)) { const d = Math.abs(s.x - h.x) + Math.abs(s.z - h.z); if (d < bd) { bd = d; best = s; } }
    if (best) { const sd = lifeCartSides(best); const q = sd[1] || sd[0]; if (q) { const n = (best.queue = (best.queue || 0) + 1) - 1, ux = Math.sin(q.face), uz = Math.cos(q.face); return lifeBegin(h, 'queue', q.x - ux * n * 0.9, q.z - uz * n * 0.9, q.face, mr(6, 12), { cart: best }); } }
  }
  if (r < 0.62) { // find someone to talk to
    let best = null, bd = 14;
    for (const o of C.hunters) { if (o === h || o.dead || o.act || o.state === 'chase' || o.job === 'jogger' || o.contract || o.rival || o.guard || Math.abs(o.y - h.y) > 1) continue; const d = Math.hypot(o.x - h.x, o.z - h.z); if (d < bd) { bd = d; best = o; } }
    if (best) {
      const crit = C.superMode && Math.random() < 0.3;
      const script = crit ? mpick(CRITIC_CHATS) : mpick(C.superMode && Math.random() < 0.7 ? LIFE_HERO_CHATS : LIFE_CHATS);
      const mx = (h.x + best.x) / 2, mz = (h.z + best.z) / 2, dx = best.x - h.x, dz = best.z - h.z, dl = Math.hypot(dx, dz) || 1;
      const conv = { script, i: 0, a: h, b: best, crit, nextT: mr(0.8, 1.6) };
      lifeBegin(h, 'chat', mx - dx / dl * 0.6, mz - dz / dl * 0.6, Math.atan2(dx, dz), 30, { conv });
      lifeBegin(best, 'chat', mx + dx / dl * 0.6, mz + dz / dl * 0.6, Math.atan2(-dx, -dz), 30, { conv });
      if (crit) C.critic(h, best);
      return true;
    }
  }
  if (r < 0.74) return lifeBegin(h, 'phone', h.x, h.z, h.face, mr(5, 12));
  if (r < 0.86 && walkIns.length) { const W = nearestWalkInFor(h, 50); if (W) return lifeBegin(h, Math.random() < 0.5 ? 'errand' : 'window', W.x, W.z, null, mr(8, 25), { W }); }
  return false;
}
function nearestWalkInFor(h, maxD) {
  let best = null, bd = maxD;
  for (const W of walkIns) { const d = Math.abs(W.x - h.x) + Math.abs(W.z - h.z); if (d < bd && d > 4) { bd = d; best = W; } }
  return best;
}
export function endLife(h) {
  const A = h.act; if (!A) return;
  h.act = null;
  if (A.spot && A.spot.taken === h) A.spot.taken = null;
  if (A.cart) A.cart.queue = Math.max(0, (A.cart.queue || 1) - 1);
  if (A.kind === 'errand' && h.inside) { h.inside = false; h.g.visible = true; }
  if (h.phone) h.phone.visible = false;
  if (A.conv) { const o = A.conv.a === h ? A.conv.b : A.conv.a; if (o.act && o.act.conv === A.conv) { o.act.conv = null; o.act.dur = Math.min(o.act.dur, o.act.t + 0.5); } }
  h.wt = null; h.waitT = mr(0, 1);
}

// each frame while someone has an activity: 'walk' (heading to h.wt), 'hold' (standing still), or null (done)
export function lifeStep(h, dt, C) {
  const A = h.act;
  if (A.phase === 'go') {
    A.goT += dt;
    if (A.goT > 25) { endLife(h); return null; }
    const d = Math.hypot(A.tx - h.x, A.tz - h.z);
    if (d < (A.kind === 'chat' ? 1.4 : 0.8)) { A.phase = 'do'; A.t = 0; if (A.kind === 'errand') { h.inside = true; h.g.visible = false; } }
    else { if (!h.wt || h.wt.x !== A.tx || h.wt.z !== A.tz) h.wt = { x: A.tx, z: A.tz }; return 'walk'; }
  }
  A.t += dt;
  if (A.kind === 'chat' && !A.conv && A.t > A.dur) { endLife(h); return null; }
  if (A.t > A.dur) { endLife(h); return null; }
  const want = A.face ?? (A.W ? Math.atan2(A.W.x - h.x, A.W.z - h.z) : h.face);
  h.face += angDiff(h.face, want) * Math.min(1, dt * 5);
  A.lineT -= dt;
  const heard = C.near(h.x, h.z, 30);
  if (A.kind === 'chat' && A.conv && A.conv.a === h) { // the one who started it runs the script
    const V = A.conv; V.nextT -= dt;
    const other = V.b;
    if (!other.act || other.act.conv !== V) { endLife(h); return null; }
    if (V.nextT <= 0 && A.phase === 'do' && other.act.phase === 'do') {
      if (V.i >= V.script.length) { endLife(h); endLife(other); return null; }
      const who = V.i % 2 === 0 ? h : other; if (heard || V.crit) C.say(who, V.script[V.i]);
      who.talkT = 1.6; V.i++; V.nextT = mr(1.9, 2.6);
    }
  } else if (A.lineT <= 0) {
    A.lineT = mr(5, 11);
    const lines = A.kind === 'phone' ? LIFE_PHONE_LINES : A.kind === 'vend' ? LIFE_JOB_LINES.vendor : A.kind === 'busk' ? LIFE_JOB_LINES.busker : A.kind === 'deliver' ? LIFE_JOB_LINES.courier : A.kind === 'photo' ? LIFE_JOB_LINES.tourist : A.kind === 'sweep' ? LIFE_JOB_LINES.sweeper : A.kind === 'sniff' ? LIFE_JOB_LINES.dogwalker : null;
    if (lines && heard && Math.random() < 0.6) C.say(h, mpick(lines));
  }
  if (A.kind === 'photo' && A.phase === 'do' && !A.flashed && A.t > 1.2) { A.flashed = true; const fx = Math.sin(h.face), fz = Math.cos(h.face); emitPuff(h.x + fx * 0.5, h.y + 1.6, h.z + fz * 0.5, { life: 0.15, size0: 0.5, size1: 1.2, alpha: 0.9, color: 0xffffff }); }
  return 'hold';
}
// someone got interrupted (scared, chasing you, picked up): drop what they're doing
export function lifeInterrupt(h) { if (h.act) endLife(h); if (h.inside) { h.inside = false; h.g.visible = true; } }

// poses, applied after the normal walk animation each frame
const LIFE_SIT_KINDS = new Set(['sit', 'bus']);
export function lifePose(h, dt, C) {
  const p = h.p, A = h.act, J = h.job, sp = Math.hypot(h.vx, h.vz);
  if (A && (h.panicT > 0 || h.cowerT > 0 || h.state === 'chase' || h.stun > 0)) { lifeInterrupt(h); return; }
  if (!A || A.phase !== 'do') { // walking about with a job
    if (J === 'sweeper' && sp > 0.2) { const k = Math.sin(C.time * 5); p.armR.rotation.x = -0.5 + k * 0.35; p.armL.rotation.x = -0.6 + k * 0.35; }
    else if (J === 'courier') { p.armL.rotation.x = p.armR.rotation.x = -1.25; }
    else if (J === 'busker' && sp < 0.3) p.armR.rotation.x = -0.9 + Math.sin(C.time * 14) * 0.15;
    else if (J === 'dogwalker') p.armR.rotation.x = -0.5;
    if (J === 'jogger' && sp > 1) { p.armL.rotation.x = -1.0 + Math.sin(h.phase) * 0.9; p.armR.rotation.x = -1.0 - Math.sin(h.phase) * 0.9; }
    return;
  }
  const k = Math.sin(C.time * 3 + h.phase);
  if (LIFE_SIT_KINDS.has(A.kind) && A.spot) {
    h.g.position.set(A.spot.sx, h.y - 0.25, A.spot.sz); h.g.rotation.y = h.face;
    p.legL.rotation.x = p.legR.rotation.x = -1.35;
    p.armL.rotation.x = -0.3; p.armR.rotation.x = A.kind === 'bus' ? -0.3 : -1.0 + k * 0.05;
    if (h.phone && A.kind === 'sit') h.phone.visible = true;
  } else if (A.kind === 'chat') {
    const talking = (h.talkT = Math.max(0, (h.talkT || 0) - dt)) > 0;
    p.armR.rotation.x = talking ? -0.9 + Math.sin(C.time * 7 + h.phase) * 0.4 : -0.1; p.armL.rotation.x = talking ? -0.5 + Math.sin(C.time * 5) * 0.3 : -0.1;
  } else if (A.kind === 'phone') { p.armR.rotation.x = -2.5; p.armR.rotation.z = 0.35; if (h.phone) h.phone.visible = true; }
  else if (A.kind === 'queue') { p.armR.rotation.x = A.t > A.dur * 0.6 ? -1.1 : 0; }
  else if (A.kind === 'vend') { p.armL.rotation.x = p.armR.rotation.x = -0.9 + k * 0.1; }
  else if (A.kind === 'busk') { p.armR.rotation.x = -0.9 + Math.sin(C.time * 14) * 0.2; p.armL.rotation.x = -1.4; p.legL.rotation.x = Math.max(0, Math.sin(C.time * 4)) * -0.3; if (Math.random() < dt * 0.8 && C.near(h.x, h.z, 30)) emitPuff(h.x, h.y + 1.8, h.z, { life: 1.2, vy: 1.2, vx: mr(-0.4, 0.4), size0: 0.15, size1: 0.3, alpha: 0.8, color: 0xffe080 }); }
  else if (A.kind === 'photo') { p.armL.rotation.x = p.armR.rotation.x = -1.55; p.armL.rotation.z = -0.35; p.armR.rotation.z = 0.35; }
  else if (A.kind === 'sweep') { p.armR.rotation.x = -0.5 + Math.sin(C.time * 6) * 0.4; p.armL.rotation.x = -0.6 + Math.sin(C.time * 6) * 0.4; }
  else if (A.kind === 'stretch') { p.armL.rotation.x = p.armR.rotation.x = -3.0; p.legL.rotation.x = Math.sin(C.time * 2) * 0.5; }
  else if (A.kind === 'window') { p.armL.rotation.x = p.armR.rotation.x = 0.4; }
  else if (A.kind === 'sniff') p.armR.rotation.x = -0.6;
  else if (A.kind === 'deliver') { p.armL.rotation.x = p.armR.rotation.x = -1.25; }
}
export function updateCityLife(dt, C) { updateLifeDogs(dt, C); }
export const cityLifeDebug = { dogs: lifeDogs, vendorCarts: lifeVendorCarts };
