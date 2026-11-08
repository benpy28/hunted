// Container lorries at the SALTMARSH DOCKS warehouses: through the working day, a lorry with a container on
// the back pulls up at the kerb outside one of the sheds near you, the doors swing open, and two dockers in
// hi-vis carry the cartons inside while the foreman ticks them off his clipboard.
//  - LEND A HAND: E at the back of the container and you're carrying a carton. Take it in to the stack inside
//    the shed and the foreman gives you $2, cash in hand, no questions. With a box on your shoulder you look
//    like you work here.
//  - HELP YOURSELF: crouch at the back and E to open a carton and pocket what's in it. If the foreman or a
//    docker is close, they'll see.
//  - CLIMB IN: hide at the back of the container among the cartons. When they've finished, they might find
//    you. Or they shut the doors and the lorry drives off up the road with you inside.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene } from './core.js';
import { warehouses } from './docks.js';
import { buildPerson, lam, SKINS, HAIRS } from './people.js';

export const DW_STATE = { jobs: [], carried: 0, earned: 0, nicked: 0, caught: 0, hides: 0, found: 0, rides: 0, arrivals: 0, carry: null, msgT: 0, coolT: 4 };
const DW_SHIFT = (hr) => hr >= 6 && hr < 19;
const DW_LOOT = [['A CARTON OF TINNED PEACHES', 0], ['TWENTY PAIRS OF SOCKS', 4], ['A BOX OF CHEAP WATCHES', 12], ['FOUR HUNDRED RUBBER DUCKS', 0], ['A CRATE OF MOBILE PHONE CASES', 6], ['ENVELOPES OF CASH. SOMEBODY\'S WAGES', 20], ['FLAT-PACK SHELVES', 0], ['TRAINERS, ALL LEFT FEET', 2]];

// =====================================================================
// The lorry: a cab, a chassis, a container with its doors swung open, cartons inside
// =====================================================================
const dwBoxGeo = new THREE.BoxGeometry(0.62, 0.5, 0.55), dwBoxMat = lam(0xb89060);
function dwMakeLorry() {
  const g = new THREE.Group(), col = mpick([0xb0302a, 0x2a5aa0, 0x2a8a4a, 0xd0902a, 0x6a6a70, 0xc85a1a]);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(9.6, 0.4, 2.3), lam(0x1a1a1e), -0.4, 0.8, 0); // chassis
  for (const x of [-3.6, -2.4, 3.2]) for (const s of [-1, 1]) { const w = add(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), lam(0x111111), x, 0.5, s * 1.05); w.rotation.x = Math.PI / 2; }
  add(new THREE.BoxGeometry(2.6, 2.4, 2.4), lam(mpick([0xf0f0f0, 0x2a3a6a, 0xd02a2a])), 3.3, 2.0, 0); // cab
  add(new THREE.BoxGeometry(0.05, 0.9, 2.1), new THREE.MeshLambertMaterial({ color: 0x2a3a4a }), 4.62, 2.5, 0);
  // the container, open at the back (x = -5)
  const cm = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide });
  const L = 6.0, x0 = -5, cx = x0 + L / 2;
  add(new THREE.BoxGeometry(L, 0.06, 2.44), cm, cx, 1.03, 0); add(new THREE.BoxGeometry(L, 0.06, 2.44), cm, cx, 3.6, 0);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(L, 2.6, 0.06), cm, cx, 2.3, s * 1.22);
  add(new THREE.BoxGeometry(0.06, 2.6, 2.44), cm, x0 + L, 2.3, 0);
  for (let k = 0; k < 8; k++) add(new THREE.BoxGeometry(L - 0.2, 0.05, 0.03), lam(0x1a1a1a), cx, 1.2 + k * 0.32, 1.255);
  const doors = [];
  for (const s of [-1, 1]) { const pv = new THREE.Group(); pv.position.set(x0, 2.3, s * 1.22); g.add(pv); const d = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.5, 1.2), cm); d.position.set(0, 0, -s * 0.6); pv.add(d); doors.push({ pv, s }); }
  const boxes = [];
  for (let i = 0; i < 12; i++) { const lay = Math.floor(i / 6), r = i % 6, col2 = r % 2, row = Math.floor(r / 2); const m = add(dwBoxGeo, dwBoxMat, x0 + 0.5 + row * 0.7 + lay * 2.4, 1.31 + (i % 4 < 2 ? 0 : 0.52), (col2 ? 0.45 : -0.45)); boxes.push(m); }
  // more boxes further in (a full container): just one block of cartons at the front end
  add(new THREE.BoxGeometry(2.0, 2.2, 2.2), dwBoxMat, x0 + L - 1.1, 2.15, 0);
  g.visible = false; scene.add(g);
  return { g, doors, boxes };
}
function dwSetDoors(J, open) { for (const d of J.mesh.doors) d.pv.rotation.y = open ? d.s * (Math.PI / 2 + 0.25) : 0; J.open = open; }
function dwShowBoxes(J) { J.mesh.boxes.forEach((m, i) => { m.visible = i < J.boxes; }); }

// =====================================================================
// The job: where the lorry stops, who works it
// =====================================================================
// the kerb outside a warehouse's front door, worked out from the door's inside and outside points
function dwSite(W) {
  const D = W.doors.find((d) => d.side === W.side) || W.doors[0]; if (!D) return null;
  const nl = Math.hypot(D.ox - D.x, D.oz - D.z), n = { x: (D.ox - D.x) / nl, z: (D.oz - D.z) / nl }, t = { x: n.z, z: -n.x };
  const front = { x: D.x + n.x * 1.5, z: D.z + n.z * 1.5 }; // the door line
  const at = (ta, nb) => ({ x: front.x + t.x * ta + n.x * nb, z: front.z + t.z * ta + n.z * nb });
  return { W, D, n, t, front, at, centre: at(4.5, 4.35), rear: at(-1.1, 4.35), stand: at(-1.6, 4.35), doorOut: at(0, 1.4), doorIn: at(0, -1.5), stack: at(1.8, -3.4), foreman: at(-2.6, 1.6), yaw: Math.atan2(-t.z, t.x) };
}
function dwWorker(shirt) { const p = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt, pants: 0x2a2a3a }); p.group.visible = false; scene.add(p.group); const box = new THREE.Mesh(dwBoxGeo, dwBoxMat); box.position.set(0, 1.25, 0.32); box.visible = false; p.group.add(box); return { p, box, carrying: false, leg: 0, wp: null, x: 0, z: 0 }; }
function dwNewJob(W, K) {
  const S = dwSite(W); if (!S) return null;
  const J = { S, W, mesh: dwMakeLorry(), state: 'arrive', drive: -45, boxes: 12, stack: 0, workers: [dwWorker(0xe8e020), dwWorker(0xe8e020)], foreman: dwWorker(0xe06a1a), stackMeshes: [], hide: null, t: 0, open: false };
  J.mesh.g.rotation.y = S.yaw; dwPlace(J);
  J.workers.forEach((w, i) => { const p = S.at(-2 - i, 1.0); w.x = p.x; w.z = p.z; w.leg = i; });
  J.foreman.x = S.foreman.x; J.foreman.z = S.foreman.z;
  DW_STATE.arrivals++;
  return J;
}
function dwPlace(J) { const S = J.S, c = S.centre; J.mesh.g.position.set(c.x + S.t.x * J.drive, 0, c.z + S.t.z * J.drive); J.mesh.g.visible = true; }
function dwEndJob(J) {
  scene.remove(J.mesh.g);
  for (const w of [...J.workers, J.foreman]) scene.remove(w.p.group);
  for (const m of J.stackMeshes) scene.remove(m);
  DW_STATE.jobs.splice(DW_STATE.jobs.indexOf(J), 1);
}
// a docker walks: lorry -> door -> stack and back again, carrying a carton one way
function dwWalk(w, path, dt) {
  if (!w.wp) w.wp = 0;
  const p = path[w.wp]; const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz), sp = 1.5 * dt;
  if (d < sp + 0.02) { w.x = p.x; w.z = p.z; w.wp++; return w.wp >= path.length; }
  w.x += dx / d * sp; w.z += dz / d * sp; w.face = Math.atan2(dx, dz); w.ph = (w.ph || 0) + dt * 7;
  return false;
}
function dwPose(w) {
  const g = w.p.group; g.visible = true; g.position.set(w.x, 0, w.z); if (w.face != null) g.rotation.y = w.face;
  const k = Math.sin(w.ph || 0) * 0.5; w.p.legL.rotation.x = k; w.p.legR.rotation.x = -k;
  w.p.armL.rotation.x = w.p.armR.rotation.x = w.carrying ? -1.5 : -k * 0.6; w.box.visible = w.carrying;
}
function dwAddStack(J) {
  const S = J.S, i = J.stack++, p = S.at(1.4 + (i % 3) * 0.66, -3.4 - Math.floor(i / 6) * 0.6);
  const m = new THREE.Mesh(dwBoxGeo, dwBoxMat); m.position.set(p.x, 0.45 + Math.floor((i % 6) / 3) * 0.5, p.z); m.rotation.y = J.S.yaw; scene.add(m); J.stackMeshes.push(m);
}
function dwStepJob(J, dt, K) {
  const S = J.S, P = K.player; J.t += dt;
  if (J.state === 'arrive') { J.drive = Math.min(0, J.drive + dt * Math.max(1.2, -J.drive * 0.35)); dwPlace(J); if (J.drive >= 0) { J.state = 'work'; dwSetDoors(J, true); dwShowBoxes(J); if (K.near(S.centre.x, S.centre.z, 50)) K.sfx.thunk && K.sfx.thunk(); } }
  else if (J.state === 'work') {
    for (const w of J.workers) {
      if (w.wait > 0) { w.wait -= dt; continue; }
      if (!w.carrying) { if (dwWalk(w, [S.doorIn, S.doorOut, S.stand], dt)) { w.wp = 0; if (J.boxes > 0) { J.boxes--; w.carrying = true; dwShowBoxes(J); w.wait = 0.8; } else w.done = true; } }
      else if (dwWalk(w, [S.doorOut, S.doorIn, S.stack], dt)) { w.wp = 0; w.carrying = false; dwAddStack(J); w.wait = 0.6; }
    }
    if (J.boxes <= 0 && J.workers.every((w) => !w.carrying) && !(DW_STATE.carry && DW_STATE.carry.J === J)) {
      J.state = 'shut'; J.shutT = 2;
      // anyone in the back?
      if (J.hide && P.hide !== J.hide) J.hide = null;
      if (J.hide && P.hide === J.hide) {
        if (Math.random() < 0.5) { DW_STATE.found++; K.leaveHide(); J.hide = null; K.say({ g: J.foreman.p.group }, 'OI! WHAT ARE YOU DOING IN THERE?'); K.bumpLocal(0.06); K.showMsg('THE DOCKERS FOUND YOU IN THE CONTAINER. THEY TURF YOU OUT', 2.2); }
        else { J.riding = true; DW_STATE.rides++; K.showMsg('THE DOORS SLAM SHUT. DARKNESS. THE ENGINE STARTS...', 2.4); }
      }
    }
  } else if (J.state === 'shut') { J.shutT -= dt; if (J.shutT <= 0) { dwSetDoors(J, false); J.state = 'leave'; if (K.near(S.centre.x, S.centre.z, 60)) K.sfx.horn(); } }
  else if (J.state === 'leave') {
    J.drive += dt * Math.min(9, 1.5 + J.drive * 0.4); dwPlace(J);
    if (J.riding && P.hide === J.hide) { const r = dwRear(J); Object.assign(J.hide, { x: r.x, z: r.z }); J.hide.eye.x = r.x + S.t.x * 1.2; J.hide.eye.z = r.z + S.t.z * 1.2; J.hide.stand.x = r.x - S.t.x * 1.2; J.hide.stand.z = r.z - S.t.z * 1.2; }
    if (J.riding && J.drive > 40) { J.riding = false; if (P.hide === J.hide) { K.leaveHide(); K.showMsg('THE LORRY STOPS. THE DRIVER GOES FOR A PASTY. YOU SLIP OUT OF THE BACK', 2.4); } J.hide = null; }
    if (J.drive > 46) { dwEndJob(J); return; }
  }
  // the people
  for (const w of J.workers) { if (J.state === 'leave') { w.p.group.visible = false; continue; } dwPose(w); }
  const F = J.foreman; F.face = Math.atan2(P.x - F.x, P.z - F.z) * (K.near(F.x, F.z, 12) ? 1 : 0) + (K.near(F.x, F.z, 12) ? 0 : S.yaw); dwPose(F); F.p.armR.rotation.x = -0.9;
  // you can't walk through the lorry
  if (!P.hide && !P.car && J.state !== 'leave') {
    const c = J.mesh.g.position, rx = P.x - c.x, rz = P.z - c.z, a = rx * S.t.x + rz * S.t.z, b = rx * S.n.x + rz * S.n.z;
    if (Math.abs(a + 0.4) < 5.3 && Math.abs(b) < 1.55 && P.y < 3.8) { const nb = b < 0 ? -1.55 : 1.55; P.x = c.x + S.t.x * a + S.n.x * nb; P.z = c.z + S.t.z * a + S.n.z * nb; }
  }
}
const dwRear = (J) => { const c = J.mesh.g.position, S = J.S; return { x: c.x - S.t.x * 4.4, z: c.z - S.t.z * 4.4 }; };

// =====================================================================
// You: carry, nick, hide
// =====================================================================
function dwAtRear(K) {
  const P = K.player; if (P.car || P.hide || P.mode !== 'move' || P.y > 0.8) return null;
  for (const J of DW_STATE.jobs) if (J.state === 'work' && Math.hypot(P.x - J.S.stand.x, P.z - J.S.stand.z) < 1.8) return J;
  return null;
}
const dwWatched = (J, K) => [...J.workers, J.foreman].some((w) => Math.hypot(w.x - K.player.x, w.z - K.player.z) < 7 && !w.carrying) && Math.random() < 0.7;
function dwUseTarget(K) {
  const C = DW_STATE.carry, P = K.player;
  if (C) return Math.hypot(P.x - C.J.S.stack.x, P.z - C.J.S.stack.z) < 2.6 ? { kind: 'drop', first: true } : null;
  const J = dwAtRear(K); if (!J) return null;
  if (J.boxes <= 0) return { kind: 'empty', J };
  if (P.crouch > 0.5) return { kind: 'nick', J };
  return { kind: 'carry', J };
}
function dwUsePrompt(T, K, useK) {
  if (T.kind === 'drop') return `${useK} to put the carton on the stack`;
  if (T.kind === 'empty') return 'Empty. They\'re shutting up';
  if (T.kind === 'nick') return `${useK} to open a carton and help yourself · or stand up to lend a hand`;
  if (T.kind === 'carry') return `${useK} to lend a hand ($2 a carton) · crouch and ${useK} to help yourself${T.J.boxes >= 3 ? ' · JUMP to climb in the back' : ''}`;
  return '';
}
function dwUse(T, K) {
  const P = K.player;
  if (T.kind === 'drop') { const C = DW_STATE.carry; DW_STATE.carry = null; dwAddStack(C.J); C.mesh.visible = false; scene.remove(C.mesh); P.cash += 2; DW_STATE.carried++; DW_STATE.earned += 2; K.sfx.cash(); K.say({ g: C.J.foreman.p.group }, mpick(['CHEERS, MATE', 'GOOD LAD. HERE.', 'CASH IN HAND, RIGHT?', 'ANOTHER ONE, IF YOU WANT IT'])); K.showMsg('$2 FROM THE FOREMAN. "SAME AGAIN?"', 1.6); return; }
  if (T.kind === 'carry') {
    const J = T.J; J.boxes--; dwShowBoxes(J);
    const m = new THREE.Mesh(dwBoxGeo, dwBoxMat); scene.add(m);
    DW_STATE.carry = { J, mesh: m }; K.showMsg('A CARTON ON YOUR SHOULDER. TAKE IT IN TO THE STACK', 1.8); return;
  }
  if (T.kind === 'nick') {
    const J = T.J; J.boxes--; dwShowBoxes(J); DW_STATE.nicked++;
    const [what, cash] = mpick(DW_LOOT);
    if (dwWatched(J, K)) { DW_STATE.caught++; K.say({ g: J.foreman.p.group }, 'OI! THIEF! PUT THAT BACK!'); K.addHeat(4); K.report(); K.bumpLocal(0.08); K.showMsg('THE FOREMAN SAW YOU. HE\'S SHOUTING FOR HELP', 2.2); return; }
    if (cash) P.cash += cash;
    K.showMsg(`${what}${cash ? `. YOU FLOG SOME ON: +$${cash}` : '. NOT WORTH TAKING'}`, 2.2); return;
  }
}
function dwHop(J, K) {
  const r = dwRear(J), S = J.S;
  const H = { kind: 'lorryback', x: r.x, z: r.z, lx: 1.1, lz: 1.1, top: 3.4, eye: { x: r.x + S.t.x * 1.2, y: 1.9, z: r.z + S.t.z * 1.2 }, stand: { x: S.stand.x, z: S.stand.z, ux: -S.t.x, uz: -S.t.z } };
  J.hide = H; DW_STATE.hides++;
  K.enterHide(H); K.showMsg(`IN THE CONTAINER, BEHIND THE CARTONS. ${K.isTouch ? 'USE' : 'E'} TO CLIMB OUT`, 2.2);
}

// =====================================================================
// Each frame
// =====================================================================
function dwUpdate(dt, K) {
  const P = K.player, hr = K.hour;
  DW_STATE.msgT = Math.max(0, DW_STATE.msgT - dt);
  // a new lorry for a shed near you, now and then
  DW_STATE.coolT -= dt;
  if (DW_STATE.coolT <= 0 && DW_SHIFT(hr) && DW_STATE.jobs.length < 2) {
    DW_STATE.coolT = mr(25, 50);
    const near = warehouses.filter((W) => W.kind !== 'disused' && K.near((W.rect.x0 + W.rect.x1) / 2, (W.rect.z0 + W.rect.z1) / 2, 130) && !DW_STATE.jobs.some((J) => J.W === W) && W.lastDelivery !== K.G.day);
    if (near.length) { const W = mpick(near); W.lastDelivery = K.G.day; const J = dwNewJob(W, K); if (J) DW_STATE.jobs.push(J); }
  }
  for (const J of [...DW_STATE.jobs]) {
    const far = !K.near(J.S.centre.x, J.S.centre.z, 220);
    if (far && !J.riding) { if (P.hide === J.hide && J.hide) K.leaveHide(); dwEndJob(J); continue; }
    dwStepJob(J, dt, K);
  }
  // the carton you're carrying
  const C = DW_STATE.carry;
  if (C) {
    if (!DW_STATE.jobs.includes(C.J) || P.car || P.hide || !P.alive || P.mode !== 'move') { scene.remove(C.mesh); DW_STATE.carry = null; }
    else { const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); C.mesh.position.set(P.x + fx * 0.55, P.y + 1.15, P.z + fz * 0.55); C.mesh.rotation.y = P.yaw; P.sprinting = false; K.input.sprint = false; }
  }
}
export const dockWork = {
  name: 'dockwork', roofs: [],
  useTarget: dwUseTarget, usePrompt: dwUsePrompt, use: dwUse,
  conspic: (K) => (DW_STATE.carry ? -0.32 : DW_STATE.jobs.some((J) => J.state === 'work' && K.near(J.S.centre.x, J.S.centre.z, 6)) ? -0.08 : 0),
  update: dwUpdate, plan: () => false,
  ride(dt, K) { const J = K.input.jumpEdge && !DW_STATE.carry ? dwAtRear(K) : null; if (J && J.boxes >= 3) { K.input.jumpEdge = false; dwHop(J, K); } return false; }, // (jump at the back of the container to climb in)
  reset() { for (const J of [...DW_STATE.jobs]) dwEndJob(J); if (DW_STATE.carry) scene.remove(DW_STATE.carry.mesh); Object.assign(DW_STATE, { jobs: [], carried: 0, earned: 0, nicked: 0, caught: 0, hides: 0, found: 0, rides: 0, arrivals: 0, carry: null, msgT: 0, coolT: 4 }); for (const W of warehouses) W.lastDelivery = 0; },
  diary: () => (DW_STATE.carried ? [`UNLOADED ${DW_STATE.carried} CARTON${DW_STATE.carried > 1 ? 'S' : ''} AT THE DOCKS ($${DW_STATE.earned})`] : []),
  debug: () => ({ ...DW_STATE, jobs: DW_STATE.jobs.map((J) => ({ name: J.W.name, state: J.state, boxes: J.boxes, stack: J.stack })), carry: !!DW_STATE.carry }),
  DW_STATE, dwNewJob, dwSite, dwHop, dwEndJob, dwAtRear,
};
