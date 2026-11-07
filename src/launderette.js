// Launderettes: every town has a few (SUDS & BUBBLES and friends), and now they work.
//  - Wash your clothes ($3): the machine takes about an hour. Clean clothes freshen up whatever disguise
//    you're wearing and get rid of the smell of bins. While it's on you're in a borrowed towel and a vest,
//    which people notice, unless you sit down on one of the orange chairs with a magazine like everyone else.
//    Wander off and leave your wash too long and someone will help themselves to it.
//  - The dryers: other people's finished loads. Rummage and you'll come out with a cardigan, a dressing gown,
//    a shell suit, a bucket hat or a towel turban, all free. Just don't let the owner see.
//  - The attendant sits behind the counter, doing a crossword, and is not interested.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene } from './core.js';
import { walkIns } from './streets.js';
import { buildPerson, lam, SKINS, HAIRS } from './people.js';
import { CATALOG } from './shops.js';
import { SK_STATE } from './stealth.js';
import { CN_STATE, takeSeat, cnStand } from './cinema.js';

export const LN_STATE = { wash: null, washes: 0, nicked: 0, lost: 0, dryers: 0, caught: 0, msgT: 0 };
export const launderettes = []; // {W, washers:[{x,z,sx,sz,face}], dryers:[...], chairs:[seat], keeper:{x,z,face}, rect}
const lnHash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

// rebuild a shop's local frame from its walk-in record: a runs along the street, b goes in from the front
export function lnFrame(W) {
  const R = W.rect, alongZ = W.side[1] === 'x';
  const A0 = alongZ ? R.z0 : R.x0, A1 = alongZ ? R.z1 : R.x1, D = alongZ ? R.x1 - R.x0 : R.z1 - R.z0;
  const toXZ = (a, b) => {
    if (W.side === 'px') return [R.x1 - b, a]; if (W.side === 'nx') return [R.x0 + b, a];
    if (W.side === 'pz') return [a, R.z1 - b]; return [a, R.z0 + b];
  };
  // which way is "into the shop" and which way is "+a", as world angles (0 = facing +z)
  const inward = { px: -Math.PI / 2, nx: Math.PI / 2, pz: Math.PI, nz: 0 }[W.side];
  const plusA = alongZ ? 0 : Math.PI / 2;
  return { A0, A1, D, toXZ, inward, plusA };
}
function buildLaunderettes() {
  if (launderettes.length) return;
  for (const W of walkIns) {
    if (W.kind !== 'laundry') continue;
    const F = lnFrame(W), L = { W, washers: [], dryers: [], chairs: [], rect: W.rect, city: W.city, name: W.name };
    for (let b = 1.6; b < F.D - 1; b += 1.0) {
      const [x, z] = F.toXZ(F.A0 + 1.75, b), [mx, mz] = F.toXZ(F.A0 + 0.75, b);
      L.washers.push({ x, z, mx, mz, face: F.plusA + Math.PI, i: L.washers.length, L });
      const [dx, dz] = F.toXZ(F.A1 - 1.75, b), [qx, qz] = F.toXZ(F.A1 - 0.75, b);
      L.dryers.push({ x: dx, z: dz, mx: qx, mz: qz, face: F.plusA, i: L.dryers.length, L });
    }
    const am = (F.A0 + F.A1) / 2;
    for (let b = 2.2; b < F.D - 2; b += 1.2) {
      const [sx, sz] = F.toXZ(am + 1.0, b), [x, z] = F.toXZ(am + 1.0, b - 0.7);
      L.chairs.push({ x, z, sx, sz, top: 0.21, face: F.inward + Math.PI, laundry: L, taken: null });
    }
    const [kx, kz] = F.toXZ(am, F.D - 1.3);
    L.keeper = { x: kx, z: kz, face: F.inward + Math.PI };
    launderettes.push(L);
  }
}
export const inLaunderette = (L, x, z, pad = 0) => x > L.rect.x0 - pad && x < L.rect.x1 + pad && z > L.rect.z0 - pad && z < L.rect.z1 + pad;
export function launderetteAt(x, z, pad = 0) { for (const L of launderettes) if (inLaunderette(L, x, z, pad)) return L; return null; }

// =====================================================================
// The dryers: what's in them today
// =====================================================================
const LN_LOADS = [
  { id: 'ln_cardigan', slot: 'body', cat: 'laundry', name: 'BEIGE CARDIGAN', price: 0, dg: 0.2, desc: 'Somebody\'s grandad\'s. Still warm.' },
  { id: 'ln_gown', slot: 'body', cat: 'laundry', name: 'TARTAN DRESSING GOWN', price: 0, dg: 0.24, desc: 'Fluffy. Belted. Nobody expects a fugitive in a dressing gown.' },
  { id: 'ln_shell', slot: 'body', cat: 'laundry', name: 'PURPLE SHELL SUIT', price: 0, dg: 0.26, desc: 'Rustles when you walk. Very loud, not at all you.' },
  { id: 'ln_bucket', slot: 'head', cat: 'laundry', name: 'BUCKET HAT', price: 0, dg: 0.18, desc: 'Floppy and faded. Covers most of your forehead.' },
  { id: 'ln_turban', slot: 'head', cat: 'laundry', name: 'TOWEL TURBAN', price: 0, dg: 0.16, desc: 'Fresh out of the dryer. You look like you\'ve just had a bath.' },
];
for (const c of LN_LOADS) if (!CATALOG.costume.some((o) => o.id === c.id)) CATALOG.costume.push(c);
function dryerLoad(D, day) { if (D.day !== day) { D.day = day; const r = lnHash(D.x, D.z, day); D.load = r < 0.55 ? LN_LOADS[Math.floor(lnHash(D.z, D.x, day + 7) * LN_LOADS.length)] : null; D.spinning = r > 0.85; } return D.load; }

// =====================================================================
// The attendants
// =====================================================================
const lnStaff = [];
function lnAttendant(L) {
  if (L.staff) return L.staff;
  const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: mpick([0x2a7ac0, 0xe8e8f0, 0x7a4a8a]), pants: 0x2a2a32 });
  p.group.position.set(L.keeper.x, 0.21, L.keeper.z); p.group.rotation.y = L.keeper.face; scene.add(p.group);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.02), lam(0xf0f0e8)); paper.position.set(0, 0.0, 0.32); p.torso.add(paper);
  p.armL.rotation.x = p.armR.rotation.x = -1.1;
  L.staff = { p, g: p.group }; lnStaff.push(L.staff); return L.staff;
}
const LN_ATTENDANT = ['SIX ACROSS... "HIDDEN", FOUR LETTERS?', 'MACHINE FOUR EATS COINS. DON\'T USE FOUR', 'NO DYEING IN THE MACHINES', 'THE DRYERS ARE HOT, DON\'T SIT ON THEM', 'IS THAT YOUR SOCK?'];

// =====================================================================
// E: the washers, the dryers, the chairs
// =====================================================================
export function lnUseTarget(K) {
  const P = K.player;
  if (P.car || P.mode !== 'move' || P.hide || P.y > 1.2) return null;
  const L = launderetteAt(P.x, P.z); if (!L) return null;
  if (CN_STATE.seat && CN_STATE.seat.laundry) return { kind: 'stand' };
  const near = (o, r = 0.95) => Math.hypot(P.x - o.x, P.z - o.z) < r;
  const W = LN_STATE.wash;
  if (W && W.L === L && near(W.m, 1.2)) return { kind: 'collect', L };
  for (const m of L.washers) if (near(m)) return { kind: 'washer', L, m };
  for (const D of L.dryers) if (near(D)) return { kind: 'dryer', L, D };
  for (const s of L.chairs) if (near(s, 0.9) && !(s.taken && !s.taken.player && !s.taken.dead && s.taken.act && s.taken.act.spot === s)) return { kind: 'chair', L, s };
  return null;
}
export function lnUsePrompt(T, K, useK) {
  const W = LN_STATE.wash;
  if (T.kind === 'stand') return `${useK} (or move) to get up` + (W ? (K.hour >= W.doneHr || W.done ? ' · your wash is done' : ' · your wash is going round') : '');
  if (T.kind === 'collect') return W.done || lnDone(K) ? `${useK} to get your clean clothes out` : 'Your wash is going round. Sit down and wait';
  if (T.kind === 'washer') return W ? 'You\'ve already got a wash on' : `${useK} to wash your clothes ($3, about an hour)`;
  if (T.kind === 'dryer') return dryerLoad(T.D, K.G.day) ? `${useK} to rummage in someone's dryer` : 'This dryer\'s empty';
  if (T.kind === 'chair') return `${useK} to sit and read a magazine`;
  return '';
}
const lnDone = (K) => { const W = LN_STATE.wash; return !!W && (W.day < K.G.day || K.hour >= W.doneHr); };
export function lnUse(T, K) {
  const P = K.player;
  if (T.kind === 'stand') { cnStand(K, 'YOU PUT THE MAGAZINE DOWN'); return; }
  if (T.kind === 'chair') { takeSeat(T.s, K, mpick(['YOU PICK UP A MAGAZINE FROM 2009. NOBODY LOOKS AT SOMEONE WAITING FOR A WASH', 'A PLASTIC CHAIR AND A CAR MAGAZINE. YOU COULD BE ANYONE', 'YOU WATCH THE DRUMS GO ROUND. SO DOES EVERYONE ELSE'])); return; }
  if (T.kind === 'washer') {
    if (LN_STATE.wash) { K.showMsg('YOU\'VE ALREADY GOT A WASH ON', 1.6); return; }
    if (P.cash < 3) { K.showMsg('IT\'S $3 A WASH', 1.6); return; }
    P.cash -= 3; K.sfx.cash(); K.sfx.thunk();
    LN_STATE.wash = { L: T.L, m: T.m, day: K.G.day, doneHr: Math.min(23.9, K.hour + 1), awayT: 0, done: false };
    K.showMsg('IN THEY GO. YOU\'RE IN A VEST AND A BORROWED TOWEL FOR AN HOUR. SIT DOWN AND TRY TO LOOK BORED', 3); return;
  }
  if (T.kind === 'collect') {
    if (!lnDone(K)) { K.showMsg('STILL GOING ROUND', 1.4); return; }
    LN_STATE.wash = null; LN_STATE.washes++;
    SK_STATE.smellT = 0;
    const line = Object.keys(P.outfit).length ? K.freshen() : '';
    K.sfx.pickup(); K.showMsg('CLEAN CLOTHES. YOU SMELL OF FABRIC SOFTENER, NOT BINS' + (line ? '. YOUR DISGUISE IS GOOD AS NEW' : ''), 2.8); return;
  }
  if (T.kind === 'dryer') {
    const D = T.D, load = dryerLoad(D, K.G.day);
    if (!load) { K.showMsg('NOTHING IN THIS ONE BUT FLUFF', 1.4); return; }
    D.load = null; LN_STATE.dryers++;
    // whose is it? if they're in here and they see you, they'll make a fuss
    const L = T.L, owners = K.hunters().filter((h) => !h.dead && h.state !== 'chase' && inLaunderette(L, h.x, h.z, 1.5));
    const seen = owners.length && Math.random() < 0.55 + 0.1 * owners.length - 0.4 * P.disg;
    const msg = K.wear(load.id);
    if (seen) {
      const h = mpick(owners); LN_STATE.caught++;
      K.say(h, mpick(['THAT\'S MINE!', 'OI! THAT\'S MY WASHING!', 'PUT THAT BACK!', 'THIEF! IN THE LAUNDERETTE!']));
      h.sus = 1; h.huntT = Math.max(h.huntT || 0, 12); if (h.alert) h.alert(0.5);
      K.addHeat(2); K.bumpLocal(0.1); K.showMsg(`${load.name}: YOURS NOW. BUT THE OWNER SAW YOU`, 2.4);
    } else K.showMsg(`${load.name}, STILL WARM. ${msg}`, 2.6);
  }
}

// =====================================================================
// How well you blend in here
// =====================================================================
export function lnConspic(K) {
  const P = K.player; if (P.car) return 0;
  let k = 0;
  const s = CN_STATE.seat;
  if (s && s.laundry) k -= 0.25 + 0.15; // (the 0.15 undoes slumping down counting as crouching)
  if (LN_STATE.wash && !lnDone(K)) k += s && s.laundry ? 0 : 0.12; // in a vest and a towel
  return k;
}

// =====================================================================
// Each frame
// =====================================================================
export function updateLaunderettes(dt, K) {
  if (!walkIns.length) return;
  buildLaunderettes();
  const P = K.player, open = (L) => K.isOpen('laundry', L.city);
  LN_STATE.tick = (LN_STATE.tick || 0) - dt;
  if (LN_STATE.tick <= 0) {
    LN_STATE.tick = 0.5;
    for (const L of launderettes) {
      const close = K.near(L.keeper.x, L.keeper.z, 90);
      if (close && !L.staff) lnAttendant(L);
      if (L.staff) L.staff.g.visible = close && open(L);
    }
  }
  // the attendant mutters now and then if you're in
  const L = launderetteAt(P.x, P.z);
  if (L && L.staff && L.staff.g.visible) { LN_STATE.msgT -= dt; if (LN_STATE.msgT <= 0) { LN_STATE.msgT = mr(9, 16); if (Math.random() < 0.5) K.say({ g: L.staff.g }, mpick(LN_ATTENDANT)); } }
  // your wash: done, or nicked if you leave it too long
  const W = LN_STATE.wash;
  if (W) {
    if (!W.done && lnDone(K)) { W.done = true; if (inLaunderette(W.L, P.x, P.z, 3)) { K.sfx.bell(); K.showMsg('YOUR WASH IS DONE', 1.8); } }
    const away = !inLaunderette(W.L, P.x, P.z, 4);
    W.awayT = away ? W.awayT + dt : Math.max(0, W.awayT - dt * 2);
    if (W.awayT > 25) {
      LN_STATE.wash = null; LN_STATE.nicked++;
      const slots = Object.keys(P.outfit);
      if (slots.length) { const sl = mpick(slots), id = P.outfit[sl]; delete P.outfit[sl]; LN_STATE.lost++; K.refreshOutfit(); const it = CATALOG.costume.find((c) => c.id === id); K.showMsg(`YOU LEFT YOUR WASH TOO LONG. SOMEONE'S HAD YOUR ${it ? it.name : 'CLOTHES'}`, 3); }
      else K.showMsg('YOU LEFT YOUR WASH TOO LONG. SOMEONE\'S NICKED IT', 2.6);
    }
  }
}
export function resetLaunderettes() {
  LN_STATE.wash = null; LN_STATE.washes = 0; LN_STATE.nicked = 0; LN_STATE.lost = 0; LN_STATE.dryers = 0; LN_STATE.caught = 0;
  for (const L of launderettes) for (const D of L.dryers) D.day = 0;
}
export function lnDiaryBits(K) { const W = LN_STATE.wash; return W ? [`A WASH ON AT ${W.L.name}`] : []; }
export const launderetteDebug = () => ({ count: launderettes.length, washers: launderettes.reduce((n, L) => n + L.washers.length, 0), dryerCount: launderettes.reduce((n, L) => n + L.dryers.length, 0), chairs: launderettes.reduce((n, L) => n + L.chairs.length, 0), staff: lnStaff.length, wash: LN_STATE.wash ? { doneHr: LN_STATE.wash.doneHr, done: LN_STATE.wash.done, awayT: LN_STATE.wash.awayT } : null, ...LN_STATE });
export const lnInternals = { lnFrame, dryerLoad, LN_LOADS, lnDone };
