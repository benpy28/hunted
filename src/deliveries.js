// Delivery lorries: the box lorries on the roads are on rounds now. They pull up outside shops in the
// daytime, the driver drops the tail lift and wheels crates in on a sack truck, then it's off to the next
// drop, and Route 9 takes them all the way between PORT HALDEN and ASHFORD.
//  - While the back's open you can climb in among the crates and ride along, out of sight of everyone
//    (and everything in the sky). Hop out when it stops again.
//  - At every drop the driver opens up the back. Keep still behind the crates and you'll probably be fine.
//    Probably.
//  - Jump out while it's moving and you'll land in a heap.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene } from './core.js';
import { walkIns } from './streets.js';
import { buildPerson, lam, SKINS, HAIRS } from './people.js';

export const DL_STATE = { ride: null, drops: 0, rides: 0, caught: 0, tumbles: 0, crates: 0, msgT: 0 };
const dlTrucks = (K) => K.G.cars.filter((c) => c.kind === 'truck' && !c.wrecked && c.driver === 'traffic');
const dlRear = (L, extra = 0.6) => ({ x: L.x - L.fx * (L.hl + extra), z: L.z - L.fz * (L.hl + extra) });
const dlSide = (L) => ({ x: L.fz, z: -L.fx }); // the truck's right-hand side
const DL_NAMES = ['FRESH BREAD CO.', 'HALDEN DAIRIES', 'BIG BOX PARCELS', 'CRISPS & CO.', 'ASHFORD BREWERY', 'QUICK FIZZ', 'PAPER & INK', 'TOP SHELF'];
const DL_DRIVER = ['MORNING!', 'SIGN HERE, LOVE', 'THREE CRATES TODAY', 'WHERE DO YOU WANT IT?', 'MIND YOUR BACKS!', 'NOT ON THE LIST, MATE'];
const DL_CAUGHT = ['OI! GET OUT OF MY LORRY!', 'WHAT ARE YOU DOING IN THERE?', 'STOWAWAY! GET OUT!', 'YOU\'RE NOT ON THE DELIVERY NOTE!'];

// =====================================================================
// The round: pull up beside a shop door, unload, move on
// =====================================================================
export function deliveryLogic(L, dt, target, K) {
  const hr = K.hour, day = K.G.day;
  if (L.dl && L.dl.phase) {
    const D = L.dl; D.t += dt;
    if (D.phase === 'open') { if (D.t > 0.8) { D.phase = 'unload'; D.t = 0; } return 0; }
    if (D.phase === 'unload') { if (D.t > D.dur) { D.phase = 'close'; D.t = 0; DL_STATE.drops++; if (D.W) D.W.dlDay = day; } return 0; }
    if (D.phase === 'close') { if (D.t > 0.8) { L.dl = { phase: null, cool: mr(10, 25) }; dlShowDriver(L, false); } return 0; }
  }
  if (!L.dl) L.dl = { phase: null, cool: mr(2, 12) };
  L.dl.cool -= dt;
  if (L.dl.cool > 0 || hr < 6 || hr > 19) return target;
  L.dl.scanT = (L.dl.scanT || 0) - dt; if (L.dl.scanT > 0) return target; L.dl.scanT = 0.3;
  // a shop door on the kerb side, just ahead
  const s = dlSide(L);
  for (const W of walkIns) {
    if (W.home || W.dlDay === day) continue;
    const ax = W.x - L.x, az = W.z - L.z;
    if (Math.abs(ax) > 14 || Math.abs(az) > 14) continue;
    const ahead = ax * L.fx + az * L.fz, side = ax * s.x + az * s.z;
    if (ahead > -1 && ahead < 2.5 && side > 2 && side < 9) { dlStart(L, W, K); return 0; }
  }
  return target;
}
function dlStart(L, W, K) {
  L.dl = { phase: 'open', t: 0, dur: mr(7, 11), W, cool: 0 };
  if (!L.dlName) L.dlName = mpick(DL_NAMES);
  if (K.near(L.x, L.z, 60)) { K.sfx.thunk(); dlShowDriver(L, true); }
  // the driver checks the back: if you're in it, you might get found
  const R = DL_STATE.ride;
  if (R && R.car === L && R.t > 2) {
    const odds = clamp(0.3 + K.G.level * 0.05 - (K.player.crouch > 0.5 ? 0.1 : 0), 0.15, 0.6);
    if (Math.random() < odds) {
      DL_STATE.caught++; dlShowDriver(L, true);
      K.say({ g: L.dlDriver.g }, mpick(DL_CAUGHT));
      dlHopOff(K, 'THE DRIVER FOUND YOU AMONG THE CRATES', true);
      K.bumpLocal(0.08); K.addHeat(1);
    } else if (K.near(L.x, L.z, 40)) K.showMsg('THE BACK ROLLS UP. KEEP STILL BEHIND THE CRATES...', 2.2);
  }
}
// the driver: one person per lorry, only shown at a drop near you
function dlShowDriver(L, on) {
  if (!L.dlDriver && on) {
    const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: mpick([0x2a5aa0, 0x3a3a42, 0xc8302a, 0x2a6a3a]), pants: 0x23262e, cap: Math.random() < 0.5 ? 0x2a2a32 : null });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.45), lam(0xb08a5a)); crate.position.set(0, 0.05, 0.42); p.torso.add(crate);
    scene.add(p.group); L.dlDriver = { p, g: p.group, crate };
  }
  if (L.dlDriver) L.dlDriver.g.visible = on;
}
function dlAnimDriver(L, K) {
  const D = L.dl, Dr = L.dlDriver; if (!Dr || !Dr.g.visible || !D || !D.W) return;
  const r = dlRear(L, 0.9), W = D.W;
  // back and forth between the tail lift and the shop door, a crate at a time
  const k = D.phase === 'unload' ? (Math.sin(D.t * 1.1 - Math.PI / 2) + 1) / 2 : 0, toShop = D.phase === 'unload' && Math.cos(D.t * 1.1 - Math.PI / 2) > 0;
  const x = r.x + (W.x - r.x) * k, z = r.z + (W.z - r.z) * k;
  Dr.g.position.set(x, 0, z); Dr.g.rotation.y = Math.atan2(toShop ? W.x - r.x : r.x - W.x, toShop ? W.z - r.z : r.z - W.z);
  Dr.crate.visible = toShop; const w = Math.sin(K.time * 8) * 0.4; Dr.p.legL.rotation.x = w; Dr.p.legR.rotation.x = -w; Dr.p.armL.rotation.x = Dr.p.armR.rotation.x = toShop ? -1.2 : -0.2;
  if (Math.random() < 0.004 && K.near(x, z, 25)) K.say({ g: Dr.g }, mpick(DL_DRIVER));
}

// =====================================================================
// Riding in the back
// =====================================================================
export function dlRearNear(K) {
  const P = K.player;
  if (P.car || P.hide || P.bike || P.mode !== 'move' || DL_STATE.ride || P.y > 1.4) return null;
  for (const L of dlTrucks(K)) {
    if (!L.dl || (L.dl.phase !== 'unload' && L.dl.phase !== 'open')) continue;
    const r = dlRear(L, 0.5); if (Math.hypot(r.x - P.x, r.z - P.z) < 2.0) return L;
  }
  return null;
}
export function dlHopOn(L, K) {
  const r = dlRear(L, -1.5);
  const S = { kind: 'lorryback', x: r.x, z: r.z, lx: 0.9, lz: 0.9, top: 2.6, eye: { x: r.x, y: 1.6, z: r.z }, stand: { x: r.x, z: r.z, ux: -L.fx, uz: -L.fz }, lorry: L };
  DL_STATE.ride = { car: L, spot: S, t: 0, stallT: 0 }; DL_STATE.rides++;
  K.enterHide(S);
  K.showMsg(`IN THE BACK WITH THE CRATES${L.dlName ? ' OF ' + L.dlName : ''}. NOBODY CAN SEE YOU. ${K.isTouch ? 'USE' : 'E'} TO HOP OUT WHEN IT STOPS`, 3);
}
function dlHopOff(K, msg, thrown = false) {
  const R = DL_STATE.ride; if (!R) return;
  DL_STATE.ride = null;
  const P = K.player, L = R.car;
  if (P.hide === R.spot) K.leaveHide();
  const r = dlRear(L, 1.4), s = dlSide(L);
  let p = null;
  for (const [a, b] of [[0, 0], [1.4, 0], [-1.4, 0], [0, 1], [2.2, 0.6], [-2.2, 0.6]]) { const x = r.x + s.x * a - L.fx * b, z = r.z + s.z * a - L.fz * b; if (!K.blocked(x, z, 0.35)) { p = { x, z }; break; } }
  if (p) { P.x = p.x; P.z = p.z; }
  P.y = 0; P.vx = P.vz = 0; P.vy = 0;
  if (thrown) { P.vx = -L.fx * 3; P.vz = -L.fz * 3; }
  if (msg) K.showMsg(msg, 2.2);
}
// keeps you in the back of the lorry as it drives about
export function updateDeliveries(dt, K) {
  // two lorries on the Route 9 run, one each way, so there's always a ride between the towns
  if (!DL_STATE.r9) {
    DL_STATE.r9 = true;
    for (const dir of [1, -1]) { const lane = K.lanes().find((l) => l.axis === 'x' && l.dir === dir && Math.abs(Math.abs(l.fixed) - 3.4) < 0.5 && l.a1 - l.a0 > 600); if (lane) { const c = K.addCar(lane, dir > 0 ? 120 : 640, 'truck'); c.dlName = dir > 0 ? 'ROUTE 9 FREIGHT' : 'ASHFORD BREWERY'; c.r9 = true; } }
    // and two more on the Route 4 run, down to SALTMARSH DOCKS and back (the docks run)
    for (const dir of [1, -1]) { const lane = K.lanes().find((l) => l.axis === 'z' && l.dir === dir && Math.abs(Math.abs(l.fixed) - 3.4) < 0.5 && l.a1 - l.a0 > 600); if (lane) { const c = K.addCar(lane, dir > 0 ? 160 : 640, 'truck'); c.dlName = dir > 0 ? 'SALTMARSH SHIPPING' : 'DOCKSIDE FISH CO.'; c.r4 = true; } }
  }
  for (const L of dlTrucks(K)) { if (L.dl && L.dl.phase && (L.dl.phase !== 'close' || (L.dlDriver && L.dlDriver.g.visible)) && K.near(L.x, L.z, 70)) { dlShowDriver(L, true); dlAnimDriver(L, K); } else if (L.dlDriver && L.dlDriver.g.visible) dlShowDriver(L, false); }
  const R = DL_STATE.ride; if (!R) return;
  const L = R.car, P = K.player, S = R.spot;
  if (!P.alive || L.wrecked || !K.G.cars.includes(L) || L.driver !== 'traffic') { dlHopOff(K, 'THE LORRY\'S STOPPED FOR GOOD. OUT YOU GET'); return; }
  if (P.hide !== S) { // you climbed out (E): at speed, that hurts
    DL_STATE.ride = null;
    if (Math.abs(L.speed) > 4) { DL_STATE.tumbles++; K.hurt(Math.round(Math.abs(L.speed) * 0.8)); K.showMsg('YOU JUMP OUT THE BACK AND LAND IN A HEAP', 2); }
    else K.showMsg('YOU SLIP OUT OF THE BACK', 1.6);
    return;
  }
  R.t += dt;
  const r = dlRear(L, -1.5), rr = dlRear(L, 1.4);
  S.x = r.x; S.z = r.z; S.eye.x = r.x - L.fx * 0.4; S.eye.z = r.z - L.fz * 0.4; S.stand.x = rr.x; S.stand.z = rr.z; S.stand.ux = -L.fx; S.stand.uz = -L.fz;
  P.x = r.x; P.z = r.z; P.y = 0.9;
  // end of the road (the lane runs out and it can't go on): everybody out
  if (Math.abs(L.speed) < 0.3 && !(L.dl && L.dl.phase)) R.stallT += dt; else R.stallT = 0;
  if (R.stallT > 4) dlHopOff(K, 'END OF THE ROUND. YOU SLIP OUT OF THE BACK');
  DL_STATE.msgT -= dt;
  if (DL_STATE.msgT <= 0 && L.dl && L.dl.phase === 'unload') { DL_STATE.msgT = 6; K.showMsg(`IT'S STOPPED. ${K.isTouch ? 'USE' : 'E'} TO HOP OUT, OR STAY PUT`, 1.6); }
}
export const dlRiding = () => !!DL_STATE.ride;
export function resetDeliveries() { DL_STATE.ride = null; DL_STATE.drops = 0; DL_STATE.rides = 0; DL_STATE.caught = 0; DL_STATE.tumbles = 0; for (const W of walkIns) W.dlDay = 0; }
export const deliveriesDebug = (K) => ({ trucks: K ? dlTrucks(K).length : 0, stopped: K ? dlTrucks(K).filter((L) => L.dl && L.dl.phase).length : 0, ride: DL_STATE.ride ? { t: DL_STATE.ride.t, x: DL_STATE.ride.car.x, z: DL_STATE.ride.car.z } : null, ...DL_STATE, rideObj: undefined });
export const dlInternals = { dlStart, dlHopOff, dlRear, dlTrucks };
