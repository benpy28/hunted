// The quay crane at SALTMARSH DOCKS: through the working day, the big crane nearest the cargo ship is unloading
// it. The trolley runs out along the boom, the spreader drops on to a container, lifts it off the deck (or out of
// the hold), runs it back over the quay and lowers it on to a waiting lorry, which drives off with it.
//  - SIGN ON: E with the banksman (the one in the orange hard hat) between 6am and 8pm. You get a hi-vis vest
//    for the day, and anyone looking at the waterfront sees another docker.
//  - LASH IT: on shift, when a box comes down on the lorry, E at the lorry locks the twistlocks: $3 a box.
//    Leave it too long and the docker does it, and the banksman has words.
//  - STAND CLEAR: the crane won't lower a box on to anyone. Stand under it and the driver leans on the horn,
//    the banksman shouts, and everyone looks at you.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, scene } from './core.js';
import { CITIES, CONTAINER_COLORS } from './world.js';
import { buildPerson, lam, SKINS, HAIRS } from './people.js';

const QY_DOCKS = CITIES[2];
export const QY_QZ = QY_DOCKS.maxZ; // the quay edge (the road runs along it, the water beyond)
export const QY_SHIP = { x: QY_DOCKS.cx + 40, z: QY_QZ + 22, deck: 5.2 };
// the crane that's over the ship: the baked cranes stand every 70m from minX+30
export const QY_X = (() => { let best = null; for (let x = QY_DOCKS.minX + 30; x < QY_DOCKS.maxX - 20; x += 70) if (x > QY_SHIP.x - 50 && x < QY_SHIP.x + 30 && (best == null || Math.abs(x - (QY_SHIP.x + 20)) < Math.abs(best - (QY_SHIP.x + 20)))) best = x; return best; })();
const QY_LZ = QY_QZ - 3.2; // where the lorry stops, in the lane by the quay, between the crane's legs
const QY_PICK_Z = QY_SHIP.z; // the middle of the deck, where the stack is
const QY_TROLLEY_Y = 25.4, QY_HIGH = 19, QY_BED = 1.25;
export const QY_STATE = { state: 'idle', t: 0, tz: QY_LZ, sy: QY_HIGH, box: null, stack: [], lorry: null, lorryX: -60, gapT: 3, moved: 0, lashed: 0, earned: 0, shiftDay: 0, horn: 0, waits: 0, lashT: 0, shouted: 0, msgT: 0, built: false };
const QY_HOURS = (hr) => hr >= 6 && hr < 20;
const QY_SHOUT = ['STAND CLEAR!', 'OI! OUT FROM UNDER THERE!', 'ARE YOU MAD? MOVE!', 'NOBODY UNDER A SUSPENDED LOAD!'];

// =====================================================================
// The meshes: trolley, cables, spreader, the deck stack, the lorry
// =====================================================================
const qyYellow = lam(0xe8c020), qyDark = lam(0x1a1a1e);
let QY = null;
function qyContainer(col) {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: col ?? mpick(CONTAINER_COLORS) });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.44), m));
  for (let k = 0; k < 9; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.4, 2.46), qyDark); r.position.x = -2.8 + k * 0.7; g.add(r); }
  scene.add(g); return g;
}
function qyBuild() {
  if (QY) return QY;
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 4), lam(0xe8e8e8)); scene.add(trolley);
  const cables = []; for (const [dx, dz] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), qyDark); c.userData = { dx, dz }; scene.add(c); cables.push(c); }
  const spreader = new THREE.Group(); spreader.add(new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.35, 2.5), qyYellow)); for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 2.6), qyDark); b.position.x = s * 3; spreader.add(b); } scene.add(spreader);
  // the lorry: cab, chassis, wheels (a skeletal trailer for a container)
  const lorry = new THREE.Group(), add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); lorry.add(m); return m; };
  add(new THREE.BoxGeometry(9.6, 0.35, 2.2), qyDark, 0, 0.95, 0);
  for (const x of [-3.6, -2.4, 3.6]) for (const s of [-1, 1]) { const w = add(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), lam(0x111111), x, 0.5, s * 1.0); w.rotation.x = Math.PI / 2; }
  add(new THREE.BoxGeometry(2.4, 2.4, 2.4), lam(0x2a5aa0), 5.6, 2.0, 0); add(new THREE.BoxGeometry(0.05, 0.9, 2.1), new THREE.MeshLambertMaterial({ color: 0x2a3a4a }), 6.82, 2.5, 0);
  lorry.visible = false; scene.add(lorry);
  // the people: the banksman, and a docker to do the lashing
  const mk = (shirt) => { const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt, pants: 0x2a2a3a }); const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 10), lam(shirt === 0xe06a1a ? 0xf0f0f0 : 0xe8c020)); hat.position.y = 1.84; p.group.add(hat); scene.add(p.group); return p; };
  const banks = mk(0xe06a1a), docker = mk(0xe8e020);
  banks.group.position.set(QY_X + 7.5, 0, QY_QZ - 0.7); banks.group.rotation.y = -Math.PI / 2 - 0.4;
  QY = { trolley, cables, spreader, lorry, banks, docker };
  QY_STATE.built = true;
  return QY;
}
function qyStackY(i) { return QY_SHIP.deck + 1.3 + i * 2.6; }
function qyRestock() { for (const g of QY_STATE.stack) scene.remove(g); QY_STATE.stack = []; for (let i = 0; i < 3; i++) { const g = qyContainer(); g.position.set(QY_X, qyStackY(i), QY_PICK_Z); QY_STATE.stack.push(g); } }
function qyPose() {
  const S = QY_STATE;
  QY.trolley.position.set(QY_X, QY_TROLLEY_Y + 0.45, S.tz);
  QY.spreader.position.set(QY_X, S.sy + 1.48, S.tz);
  const len = QY_TROLLEY_Y - (S.sy + 1.6);
  for (const c of QY.cables) { c.scale.y = Math.max(0.1, len); c.position.set(QY_X + c.userData.dx, S.sy + 1.6 + len / 2, S.tz + c.userData.dz); }
  if (S.box) S.box.position.set(QY_X, S.sy, S.tz);
  QY.lorry.position.set(S.lorryX, 0, QY_LZ); QY.lorry.visible = S.lorry !== null;
  if (S.lorry && S.lorry.box) S.lorry.box.position.set(S.lorryX, QY_BED + 1.3, QY_LZ);
}

// =====================================================================
// The cycle
// =====================================================================
const qyMove = (v, to, sp, dt) => (Math.abs(to - v) <= sp * dt ? to : v + Math.sign(to - v) * sp * dt);
// is anyone standing where the box would come down?
export function qyUnder(K, y) { const P = K.player; return !P.car && Math.abs(P.x - QY_X) < 3.6 && Math.abs(P.z - QY_STATE.tz) < 1.8 && P.y < y + 1; }
function qyStep(dt, K) {
  const S = QY_STATE, P = K.player, hr = K.hour;
  S.t += dt;
  if (S.state === 'idle') { if (QY_HOURS(hr)) { S.state = 'wait'; S.gapT = 2; } return; }
  if (S.state === 'wait') { // the next lorry pulls in under the crane
    S.gapT -= dt; if (S.gapT > 0) return;
    if (!S.lorry) { if (!QY_HOURS(hr)) { S.state = 'idle'; return; } S.lorry = { box: null }; S.lorryX = QY_X - 70; }
    S.lorryX = Math.min(QY_X, S.lorryX + dt * Math.max(1.2, (QY_X - S.lorryX) * 0.35));
    if (S.lorryX >= QY_X) { S.state = 'out'; if (!S.stack.length && !S.hold) S.hold = true; }
    return;
  }
  if (S.state === 'out') { S.sy = qyMove(S.sy, QY_HIGH, 2.5, dt); S.tz = qyMove(S.tz, QY_PICK_Z, 3.2, dt); if (S.tz === QY_PICK_Z && S.sy === QY_HIGH) S.state = 'down'; return; }
  if (S.state === 'down') {
    const top = S.stack.length ? qyStackY(S.stack.length - 1) : 2.2; // (or down into the hold)
    S.sy = qyMove(S.sy, top + 2.6, 2.5, dt);
    if (S.sy === top + 2.6) { S.state = 'grab'; S.t = 0; if (K.near(QY_X, QY_PICK_Z, 80)) K.sfx.clank && K.sfx.clank(); }
    return;
  }
  if (S.state === 'grab') {
    if (S.t < 1) return;
    S.box = S.stack.length ? S.stack.pop() : qyContainer(); S.sy -= 2.6; S.box.position.set(QY_X, S.sy, QY_PICK_Z); S.state = 'lift'; return;
  }
  if (S.state === 'lift') { S.sy = qyMove(S.sy, QY_HIGH, 2.2, dt); if (S.sy === QY_HIGH) S.state = 'in'; return; }
  if (S.state === 'in') { S.tz = qyMove(S.tz, QY_LZ, 3.0, dt); if (S.tz === QY_LZ) S.state = 'lower'; return; }
  if (S.state === 'lower') {
    const bedY = QY_BED + 1.3;
    if (qyUnder(K, S.sy - 1.3)) { // somebody's under it: stop, horn, shout
      S.hornT = (S.hornT || 0) - dt;
      if (S.hornT <= 0) { S.hornT = 3; S.horn++; K.sfx.horn(); K.say({ g: QY.banks.group }, mpick(QY_SHOUT)); K.bumpLocal(0.03); if (S.msgT <= 0) { S.msgT = 4; K.showMsg('THE CRANE STOPS DEAD WITH A CONTAINER HANGING OVER YOUR HEAD. THE WHOLE QUAY IS LOOKING AT YOU', 2.4); } }
      S.waits += dt; return;
    }
    S.sy = qyMove(S.sy, bedY, S.sy - bedY > 5 ? 2.4 : 0.9, dt);
    if (S.sy === bedY) { S.state = 'lash'; S.t = 0; S.lashT = S.shiftDay === K.G.day ? 12 : 4; S.lorry.box = S.box; S.box = null; if (K.near(QY_X, QY_LZ, 60)) K.sfx.thunk && K.sfx.thunk(); if (S.shiftDay === K.G.day && K.near(QY_X, QY_LZ, 40)) K.showMsg(`BOX DOWN. ${K.isTouch ? 'USE' : 'E'} AT THE LORRY TO LOCK THE TWISTLOCKS`, 2); }
    return;
  }
  if (S.state === 'lash') {
    S.lashT -= dt;
    if (S.lashT <= 0) { // the docker does it
      if (S.shiftDay === K.G.day && K.near(QY_X, QY_LZ, 40)) K.say({ g: QY.banks.group }, mpick(['WAKE UP, YOU!', 'I\'M NOT PAYING YOU TO WATCH', 'COME ON, COME ON!']));
      qyLashed(K, false);
    }
    return;
  }
  if (S.state === 'away') { // the spreader goes back up; the lorry pulls off
    S.sy = qyMove(S.sy, QY_HIGH, 2.5, dt);
    S.lorryX += dt * Math.min(10, 1.2 + (S.lorryX - QY_X) * 0.4);
    if (S.lorryX > QY_X + 80) { if (S.lorry && S.lorry.box) scene.remove(S.lorry.box); S.lorry = null; S.moved++; S.state = 'wait'; S.gapT = mr(4, 10); if (!S.stack.length && S.moved % 6 === 0) qyRestock(); }
  }
}
function qyLashed(K, byPlayer) {
  const S = QY_STATE; S.state = 'away';
  if (byPlayer) { S.lashed++; S.earned += 3; K.player.cash += 3; K.sfx.cash(); K.say({ g: QY.banks.group }, mpick(['GOOD LAD. NEXT ONE', 'NICE AND TIGHT', 'THAT\'S THE WAY', 'THREE DOLLARS. DON\'T SPEND IT ALL AT ONCE'])); K.showMsg('CLUNK, CLUNK, CLUNK, CLUNK. LOCKED ON. +$3', 1.6); }
  if (K.near(QY_X, QY_LZ, 60)) K.sfx.horn();
}

// =====================================================================
// The venue hooks
// =====================================================================
const qyLorryNear = (K) => { const S = QY_STATE, P = K.player; return S.lorry && Math.abs(P.x - S.lorryX) < 6 && Math.abs(P.z - QY_LZ) < 3.2; };
function qyUseTarget(K) {
  const P = K.player; if (!QY || P.car || P.hide || P.mode !== 'move' || P.y > 1.5 || !K.near(QY_X, QY_QZ, 30)) return null;
  const S = QY_STATE;
  if (S.state === 'lash' && S.shiftDay === K.G.day && qyLorryNear(K)) return { kind: 'lash' };
  const b = QY.banks.group.position;
  if (Math.hypot(P.x - b.x, P.z - b.z) < 2.4) return { kind: 'banks' };
  return null;
}
function qyUsePrompt(T, K, useK) {
  if (T.kind === 'lash') return `${useK} to lock the twistlocks ($3)`;
  if (T.kind === 'banks') return QY_STATE.shiftDay === K.G.day ? 'On shift: lash the boxes as they come down on the lorry' : QY_HOURS(K.hour) ? `${useK} to sign on with the banksman (lashing, $3 a box)` : 'The crane gang has knocked off for the night';
  return '';
}
function qyUse(T, K) {
  if (T.kind === 'lash') { qyLashed(K, true); return; }
  if (T.kind === 'banks') {
    if (QY_STATE.shiftDay === K.G.day) { K.say({ g: QY.banks.group }, 'GET OVER BY THE LORRY THEN'); return; }
    if (!QY_HOURS(K.hour)) { K.showMsg('NOBODY ABOUT. THE CRANE\'S LOCKED OFF FOR THE NIGHT', 1.6); return; }
    QY_STATE.shiftDay = K.G.day; K.say({ g: QY.banks.group }, 'CASH IN HAND. NO QUESTIONS. PUT THIS ON');
    K.showMsg('THE BANKSMAN HANDS YOU A HI-VIS VEST. WHEN A BOX COMES DOWN ON THE LORRY, LOCK IT ON: $3 A BOX', 2.8);
  }
}
function qyUpdate(dt, K) {
  QY_STATE.msgT = Math.max(0, QY_STATE.msgT - dt);
  if (!K.near(QY_X, QY_QZ, 260)) return; // (it only runs while you're down this end)
  if (!QY) { qyBuild(); qyRestock(); }
  qyStep(dt, K); qyPose();
  // the docker stands by the back of the lorry, and goes to the corners to lash
  const S = QY_STATE, d = QY.docker.group;
  d.visible = !!S.lorry && S.lorryX > QY_X - 30;
  if (d.visible) { const lash = S.state === 'lash' && S.shiftDay !== K.G.day; d.position.set(S.lorryX - (lash ? 4.6 : 6.4), 0, QY_LZ - (lash ? 1.4 : 2.2)); d.rotation.y = Math.PI / 2; QY.docker.armL.rotation.x = QY.docker.armR.rotation.x = lash ? -1.3 + Math.sin(K.time * 9) * 0.3 : 0; }
  QY.banks.armR.rotation.x = S.state === 'lower' || S.state === 'in' ? -2.6 + Math.sin(K.time * 3) * 0.3 : 0; // signalling the driver
}
const qyOnShift = (K) => QY_STATE.shiftDay === K.G.day;
export const quay = {
  name: 'quay', roofs: [],
  useTarget: qyUseTarget, usePrompt: qyUsePrompt, use: qyUse,
  conspic: (K) => { if (!qyOnShift(K)) return 0; const P = K.player; if (P.z > QY_QZ - 60 && Math.abs(P.x - QY_DOCKS.cx) < 200) return -0.3; if (P.z > QY_DOCKS.minZ) return -0.12; return 0; }, // (in hi-vis, on the waterfront)
  update: qyUpdate, plan: () => false, ride: () => false,
  reset() { Object.assign(QY_STATE, { lashed: 0, earned: 0, shiftDay: 0, horn: 0, waits: 0, moved: 0 }); },
  diary: (K) => { const b = []; if (qyOnShift(K)) b.push('ON SHIFT AT THE QUAY CRANE (HI-VIS)'); if (QY_STATE.lashed) b.push(`LASHED ${QY_STATE.lashed} CONTAINER${QY_STATE.lashed > 1 ? 'S' : ''} ($${QY_STATE.earned})`); return b; },
  debug: () => ({ x: QY_X, state: QY_STATE.state, tz: +QY_STATE.tz.toFixed(1), sy: +QY_STATE.sy.toFixed(1), stack: QY_STATE.stack.length, lorry: !!QY_STATE.lorry, lorryX: Math.round(QY_STATE.lorryX), moved: QY_STATE.moved, lashed: QY_STATE.lashed, earned: QY_STATE.earned, horn: QY_STATE.horn, shift: QY_STATE.shiftDay, built: QY_STATE.built }),
  QY_STATE, QY_X, QY_LZ, QY_QZ, QY_SHIP, qyUnder, qyLashed,
};
