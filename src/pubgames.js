// Pub games: every pub has a dartboard on the side wall, and the bigger ones have a pool table you can play.
//  - DARTS: stand on the oche and press E. $3 on it against one of the regulars: three visits of three darts
//    each, highest total takes the pot. Aim with the crosshair; your hand drifts (more when you're wanted,
//    or out of breath). E throws. Treble 20 is up top. A 180 brings the house down.
//  - POOL: E at the table. $2 a game, reds and yellows: you're reds. Turn to aim from behind the white, and
//    E strikes it at whatever the power bar says. Pot one of yours and you go again. Pot the white and it's
//    their go. Clear your reds and then sink the black to win; the black early and you lose.
//  - Either way, while you're playing you're just another punter, and the regulars stop looking at the door.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene } from './core.js';
import { worldHooks, propBuf } from './world.js';
import { walkIns } from './streets.js';
import { lnFrame } from './launderette.js';
import { buildPerson, SKINS, HAIRS, SHIRTS, PANTS } from './people.js';

export const PG_STATE = { darts: null, pool: null, dartsGames: 0, dartsWon: 0, poolGames: 0, poolWon: 0, ton80: 0, thrown: 0, best: 0, pots: 0, msgT: 0 };
export const pgPubs = []; // {W, F, board:{x,y,z,n,right}, oche:{x,z}, table?:{ac,bc}}
const PG_NAMES = ['BIG DEREK', 'SHEILA', 'TWO-DARTS TEL', 'MAUREEN', 'YOUNG KEV', 'OLD WALLY', 'PAULINE', 'THE PROFESSOR', 'GAZ', 'DOT'];

// =====================================================================
// Building: the cushions and pockets on the pool tables (part of the town), dartboards (meshes)
// =====================================================================
const pgHasTable = (F) => F.A1 - F.A0 > 8;
function pgWorldBox(F, a0, a1, b0, b1, y0, y1, col) { const [xa, za] = F.toXZ(a0, b0), [xb, zb] = F.toXZ(a1, b1); propBuf.box(Math.min(xa, xb), Math.max(xa, xb), y0, y1, Math.min(za, zb), Math.max(za, zb), col); }
worldHooks.beforeBake.push(() => {
  for (const W of walkIns) {
    if (W.kind !== 'bar' || W.home) continue;
    const F = lnFrame(W); if (!pgHasTable(F)) continue;
    const ac = F.A1 - 2.4, bc = F.D / 2;
    // cushions round the edge, and the six pockets
    for (const s of [-1, 1]) { pgWorldBox(F, ac + s * 0.6, ac + s * 0.66, bc - 1.2, bc + 1.2, 0.88, 0.93, 0x1a5a2a); pgWorldBox(F, ac - 0.66, ac + 0.66, bc + s * 1.15, bc + s * 1.21, 0.88, 0.93, 0x1a5a2a); }
    for (const sa of [-1, 1]) for (const sb of [-1, 0, 1]) pgWorldBox(F, ac + sa * 0.6 - 0.05, ac + sa * 0.6 + 0.05, bc + sb * 1.15 - 0.05, bc + sb * 1.15 + 0.05, 0.882, 0.935, 0x0a0a0a);
  }
});
const PG_SEG = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const PG_R = { bull: 0.0064, outer: 0.016, t0: 0.099, t1: 0.107, d0: 0.162, d1: 0.170, edge: 0.225 };
const pgBoardTex = (() => {
  const c = document.createElement('canvas'), S = 256, x = c.getContext('2d'), k = S / 2 / 0.23; c.width = c.height = S;
  x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.fill();
  const seg = (r0, r1, i, col) => { const a0 = -Math.PI / 2 + (i - 0.5) * Math.PI / 10, a1 = a0 + Math.PI / 10; x.fillStyle = col; x.beginPath(); x.arc(S / 2, S / 2, r1 * k, a0, a1); x.arc(S / 2, S / 2, r0 * k, a1, a0, true); x.closePath(); x.fill(); };
  for (let i = 0; i < 20; i++) {
    const dark = i % 2 === 0; seg(PG_R.outer, PG_R.d1, i, dark ? '#141414' : '#efe2c0');
    seg(PG_R.t0, PG_R.t1, i, dark ? '#c0202a' : '#1a8a3a'); seg(PG_R.d0, PG_R.d1, i, dark ? '#c0202a' : '#1a8a3a');
  }
  x.fillStyle = '#1a8a3a'; x.beginPath(); x.arc(S / 2, S / 2, PG_R.outer * k, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#c0202a'; x.beginPath(); x.arc(S / 2, S / 2, PG_R.bull * k, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f0f0f0'; x.font = 'bold 15px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 20; i++) { const a = -Math.PI / 2 + i * Math.PI / 10, r = 0.198 * k; x.fillText(String(PG_SEG[i]), S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const pgBoardMat = new THREE.MeshBasicMaterial({ map: pgBoardTex, transparent: true, color: 0xd8d8d8 });
function buildPubGames() {
  if (pgPubs.length) return;
  for (const W of walkIns) {
    if (W.kind !== 'bar' || W.home) continue;
    const F = lnFrame(W); if (F.D < 6.5) continue;
    const bd = F.D - 1.2, ba = F.A1 - 0.27, face = F.plusA + Math.PI;
    const [x, z] = F.toXZ(ba, bd), n = { x: Math.sin(face), z: Math.cos(face) };
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.23, 32), pgBoardMat); m.position.set(x, 1.73, z); m.rotation.y = face; scene.add(m);
    const [ox, oz] = F.toXZ(ba - 2.37, bd);
    const Q = { W, F, rect: W.rect, board: { x, y: 1.73, z, n, right: { x: n.z, z: -n.x }, face, mesh: m }, oche: { x: ox, z: oz } };
    if (pgHasTable(F)) Q.table = { ac: F.A1 - 2.4, bc: F.D / 2 };
    pgPubs.push(Q);
  }
}
worldHooks.afterBake.push(buildPubGames);
export const pgPubAt = (x, z) => pgPubs.find((Q) => x > Q.rect.x0 && x < Q.rect.x1 && z > Q.rect.z0 && z < Q.rect.z1) || null;

// =====================================================================
// Darts
// =====================================================================
export function dartScore(rx, ry) { // offsets on the board in metres (right, up) -> {pts, label}
  const r = Math.hypot(rx, ry);
  if (r <= PG_R.bull) return { pts: 50, label: 'BULL' };
  if (r <= PG_R.outer) return { pts: 25, label: '25' };
  if (r > PG_R.d1) return { pts: 0, label: 'MISS' };
  let th = Math.atan2(rx, ry); if (th < 0) th += Math.PI * 2;
  const n = PG_SEG[Math.round(th / (Math.PI / 10)) % 20];
  if (r >= PG_R.t0 && r <= PG_R.t1) return { pts: n * 3, label: `T${n}` };
  if (r >= PG_R.d0) return { pts: n * 2, label: `D${n}` };
  return { pts: n, label: String(n) };
}
const pgDartGeo = new THREE.CylinderGeometry(0.004, 0.006, 0.13, 5); pgDartGeo.rotateX(Math.PI / 2); pgDartGeo.translate(0, 0, 0.065);
const pgFlightGeo = new THREE.PlaneGeometry(0.035, 0.03); pgFlightGeo.translate(0, 0, 0.12);
function pgDartMesh(col) { const g = new THREE.Group(); g.add(new THREE.Mesh(pgDartGeo, new THREE.MeshLambertMaterial({ color: 0x9a9aa0 }))); const f = new THREE.Mesh(pgFlightGeo, new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide })); g.add(f); const f2 = f.clone(); f2.rotation.z = Math.PI / 2; g.add(f2); scene.add(g); return g; }
function pgStick(Q, rx, ry, col) {
  const B = Q.board, g = pgDartMesh(col);
  g.position.set(B.x + B.right.x * rx, B.y + ry, B.z + B.right.z * rx);
  g.lookAt(g.position.x + B.n.x, g.position.y + mr(-0.15, 0.1), g.position.z + B.n.z);
  return g;
}
function pgClearDarts(D) { for (const g of D.stuck) scene.remove(g); D.stuck.length = 0; }
function pgStartDarts(Q, K) {
  const P = K.player;
  if (P.cash < 3) { K.showMsg('$3 ON THE DARTS, AND YOU HAVEN\'T GOT IT', 1.6); return; }
  P.cash -= 3; K.sfx.cash();
  const foe = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: mpick(SHIRTS), pants: mpick(PANTS) });
  const [fx, fz] = Q.F.toXZ(Q.F.A1 - 3.3, Q.F.D - 2.4); foe.group.position.set(fx, 0.21, fz); foe.group.rotation.y = Q.board.face + Math.PI; scene.add(foe.group);
  PG_STATE.darts = { Q, name: mpick(PG_NAMES), skill: mr(0.018, 0.04), you: [], them: [], visit: [], turn: 'you', t: 0, stuck: [], foe, waitT: 0, swayT: Math.random() * 10, sway: { y: 0, p: 0 } };
  PG_STATE.dartsGames++;
  K.showMsg(`$3 ON IT. YOU AGAINST ${PG_STATE.darts.name}: THREE VISITS EACH, HIGHEST TOTAL WINS. ${K.isTouch ? 'USE' : 'E'} TO THROW`, 3);
}
function pgDartsSum(a) { return a.reduce((s, v) => s + v.reduce((t, d) => t + d.pts, 0), 0); }
function pgThrow(K) {
  const D = PG_STATE.darts, Q = D.Q, B = Q.board;
  if (D.turn !== 'you' || D.waitT > 0) return;
  const P = K.player, cp = Math.cos(P.pitch), o = { x: P.x, y: P.y + 1.65, z: P.z }, d = { x: -Math.sin(P.yaw) * cp, y: Math.sin(P.pitch), z: -Math.cos(P.yaw) * cp }; // (along the crosshair)
  const den = d.x * B.n.x + d.z * B.n.z;
  let rx = 9, ry = 9;
  if (den < -0.05) { const t = ((B.x - o.x) * B.n.x + (B.z - o.z) * B.n.z) / den; const hx = o.x + d.x * t, hy = o.y + d.y * t, hz = o.z + d.z * t; rx = (hx - B.x) * B.right.x + (hz - B.z) * B.right.z; ry = hy - B.y; }
  rx += mr(-0.006, 0.006); ry += mr(-0.006, 0.006) - 0.004; // (and a little drop)
  const sc = dartScore(rx, ry); D.visit.push(sc); PG_STATE.thrown++;
  if (Math.hypot(rx, ry) < PG_R.edge) D.stuck.push(pgStick(Q, rx, ry, 0xd02a2a)); else K.sfx.thud();
  K.sfx.thunk && K.sfx.thunk();
  if (D.visit.length >= 3) {
    const tot = D.visit.reduce((s, q) => s + q.pts, 0); D.you.push(D.visit); D.visit = [];
    PG_STATE.best = Math.max(PG_STATE.best, tot);
    if (tot === 180) { PG_STATE.ton80++; K.sfx.cheer && K.sfx.cheer(); K.showMsg('ONE HUNDRED AND EIGHTYYYY! THE WHOLE PUB ROARS', 3); }
    else K.showMsg(`${D.you[D.you.length - 1].map((q) => q.label).join(' · ')} = ${tot}${tot >= 100 ? '. TON!' : ''}`, 2);
    D.turn = 'them'; D.waitT = 2.2;
  } else K.showMsg(`${sc.label}${sc.pts ? ' (' + sc.pts + ')' : ''}`, 0.9);
}
function pgTheirVisit(K) {
  const D = PG_STATE.darts, visit = [];
  pgClearDarts(D);
  for (let k = 0; k < 3; k++) {
    const aimR = 0.103, gx = (Math.random() + Math.random() + Math.random() - 1.5) * D.skill * 1.4, gy = (Math.random() + Math.random() + Math.random() - 1.5) * D.skill * 1.4;
    const rx = gx, ry = aimR + gy, sc = dartScore(rx, ry); visit.push(sc);
    if (Math.hypot(rx, ry) < PG_R.edge) D.stuck.push(pgStick(D.Q, rx, ry, 0x2a5ad0));
  }
  D.them.push(visit);
  const tot = visit.reduce((s, q) => s + q.pts, 0);
  K.say({ g: D.foe.group }, tot === 180 ? 'ONE-EIGHTY!' : tot >= 100 ? 'TON!' : tot < 30 ? 'OH, BEHAVE...' : mpick(['NOT BAD', 'SHOT', 'YOUR THROW', String(tot)]));
  K.showMsg(`${D.name}: ${visit.map((q) => q.label).join(' · ')} = ${tot}. YOU ${pgDartsSum(D.you)} - ${pgDartsSum(D.them)} ${D.name}`, 2.4);
}
function pgEndDarts(K, quit) {
  const D = PG_STATE.darts; if (!D) return;
  PG_STATE.darts = null;
  pgClearDarts(D); scene.remove(D.foe.group);
  if (quit) { K.showMsg(`YOU PUT THE DARTS DOWN. ${D.name} KEEPS YOUR $3`, 1.8); return; }
  const a = pgDartsSum(D.you), b = pgDartsSum(D.them);
  if (a > b) { K.player.cash += 6; PG_STATE.dartsWon++; K.sfx.cash(); K.showMsg(`YOU WIN, ${a} TO ${b}. $6 FROM THE POT. ${D.name} BUYS YOU A HALF`, 3); K.coolHeat(2); }
  else if (a === b) { K.player.cash += 3; K.showMsg(`A DRAW, ${a} ALL. YOUR $3 BACK`, 2.4); }
  else K.showMsg(`${D.name} WINS, ${b} TO ${a}. "BETTER LUCK NEXT TIME, PAL"`, 2.6);
}
function pgDartsRide(dt, K) {
  const D = PG_STATE.darts, P = K.player, I = K.input;
  if (!P.alive || P.car || P.hide || I.fwd < 0 || (P.lastHurt != null && P.lastHurt < 0.1) || K.G.mode !== 'playing' && K.G.mode !== 'shop') { pgEndDarts(K, true); return false; }
  const O = D.Q.oche; P.x = O.x; P.z = O.z; P.y = 0.21; P.vx = P.vz = P.vy = 0; P.sprinting = false; P.crouch = 0;
  // the hand drifts: more when you're wanted, or out of breath
  D.swayT += dt;
  const amp = 0.006 + 0.004 * Math.min(3, K.G.level) + (P.stam < 40 ? 0.008 : 0);
  const sy = (Math.sin(D.swayT * 1.7) * 0.7 + Math.sin(D.swayT * 3.3) * 0.3) * amp, sp = (Math.sin(D.swayT * 1.3 + 1) * 0.7 + Math.sin(D.swayT * 2.9) * 0.3) * amp;
  P.yaw += sy - D.sway.y; P.pitch += sp - D.sway.p; D.sway.y = sy; D.sway.p = sp;
  if (D.waitT > 0) {
    D.waitT -= dt;
    if (D.waitT <= 0) {
      if (D.turn === 'them') { pgTheirVisit(K); D.turn = 'next'; D.waitT = 2.6; }
      else if (D.turn === 'next') { pgClearDarts(D); if (D.them.length >= 3) { pgEndDarts(K, false); return false; } D.turn = 'you'; K.showMsg(`VISIT ${D.you.length + 1} OF 3. YOU ${pgDartsSum(D.you)} - ${pgDartsSum(D.them)} ${D.name}`, 1.8); }
    }
  }
  return true;
}

// =====================================================================
// Pool
// =====================================================================
const PB_R = 0.028, PB_W = 0.6 - PB_R, PB_L = 1.15 - PB_R; // ball radius, half-width and half-length of where a ball's middle can go
const PB_POCKETS = [[-0.6, -1.15], [0.6, -1.15], [-0.6, 0], [0.6, 0], [-0.6, 1.15], [0.6, 1.15]];
const PB_COL = { cue: 0xf8f8f0, red: 0xc8202a, yellow: 0xf0c020, black: 0x111111 };
const pbGeo = new THREE.SphereGeometry(PB_R, 12, 8);
export function poolRack() { // [{u, v, kind}] : the white at the baulk end, the triangle at the other
  const balls = [{ u: 0, v: -0.75, kind: 'cue' }], order = ['red', 'yellow', 'red', 'yellow', 'black', 'red', 'red', 'yellow', 'yellow', 'red', 'yellow', 'red', 'yellow', 'yellow', 'red'];
  let i = 0;
  for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) balls.push({ u: (k - row / 2) * PB_R * 2.02, v: 0.55 + row * PB_R * 1.75, kind: order[i++] });
  return balls.map((b) => ({ ...b, vu: 0, vv: 0, potted: false }));
}
// one step of the table: moves, cushions, collisions, pockets. Returns balls potted this step.
export function poolStep(balls, h) {
  const out = [];
  for (const b of balls) {
    if (b.potted) continue;
    b.u += b.vu * h; b.v += b.vv * h;
    const sp = Math.hypot(b.vu, b.vv);
    if (sp > 0) { const ns = Math.max(0, sp - 0.55 * h); b.vu *= ns / sp; b.vv *= ns / sp; }
    for (const [pu, pv] of PB_POCKETS) if (Math.hypot(b.u - pu, b.v - pv) < (pv === 0 ? 0.05 : 0.065)) { b.potted = true; b.vu = b.vv = 0; out.push(b); break; }
    if (b.potted) continue;
    if (b.u < -PB_W) { b.u = -PB_W; b.vu = Math.abs(b.vu) * 0.78; } else if (b.u > PB_W) { b.u = PB_W; b.vu = -Math.abs(b.vu) * 0.78; }
    if (b.v < -PB_L) { b.v = -PB_L; b.vv = Math.abs(b.vv) * 0.78; } else if (b.v > PB_L) { b.v = PB_L; b.vv = -Math.abs(b.vv) * 0.78; }
  }
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const a = balls[i], b = balls[j]; if (a.potted || b.potted) continue;
    const du = b.u - a.u, dv = b.v - a.v, d = Math.hypot(du, dv);
    if (d >= PB_R * 2 || d === 0) continue;
    const nu = du / d, nv = dv / d, ov = PB_R * 2 - d;
    a.u -= nu * ov / 2; a.v -= nv * ov / 2; b.u += nu * ov / 2; b.v += nv * ov / 2;
    const rel = (a.vu - b.vu) * nu + (a.vv - b.vv) * nv; if (rel <= 0) continue;
    const imp = rel * 0.97; a.vu -= imp * nu; a.vv -= imp * nv; b.vu += imp * nu; b.vv += imp * nv;
    if (!a.firstHit && a.kind === 'cue') a.firstHit = b.kind; if (!b.firstHit && b.kind === 'cue') b.firstHit = a.kind;
  }
  return out;
}
const pbMoving = (balls) => balls.some((b) => !b.potted && Math.hypot(b.vu, b.vv) > 0.004);
function pgPoolWorld(T, Q, b) { const [x, z] = Q.F.toXZ(T.ac + b.u, T.bc + b.v); return { x, z }; }
function pgStartPool(Q, K) {
  const P = K.player;
  if (P.cash < 2) { K.showMsg('IT\'S $2 ON THE TABLE', 1.4); return; }
  if (PG_STATE.pool) return;
  P.cash -= 2; K.sfx.cash();
  const T = Q.table, balls = poolRack();
  const meshes = balls.map((b) => { const m = new THREE.Mesh(pbGeo, new THREE.MeshLambertMaterial({ color: PB_COL[b.kind] })); scene.add(m); return m; });
  const aim = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); aim.geometry.translate(0, 0, -0.33); scene.add(aim);
  const foe = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: mpick(SHIRTS), pants: mpick(PANTS) }); scene.add(foe.group);
  const [ea0, eb0] = Q.F.toXZ(0, 0), [ea1, eb1] = Q.F.toXZ(1, 0), [ec1, ed1] = Q.F.toXZ(0, 1);
  PG_STATE.pool = { Q, T, balls, meshes, aim, foe, name: mpick(PG_NAMES), turn: 'you', state: 'aim', t: 0, waitT: 0, shotPots: [], ea: { x: ea1 - ea0, z: eb1 - eb0 }, eb: { x: ec1 - ea0, z: ed1 - eb0 }, foeSkill: mr(0.02, 0.06), shots: 0 };
  PG_STATE.poolGames++;
  K.showMsg(`$2 ON THE TABLE. YOU'RE REDS, ${PG_STATE.pool.name}'S YELLOWS. TURN TO AIM, ${K.isTouch ? 'USE' : 'E'} TO STRIKE`, 3);
  pgPlaceFoe(PG_STATE.pool, false);
}
function pgPlaceFoe(G, atTable) {
  const T = G.T, Q = G.Q;
  let u = 1.1, v = 0.9; if (atTable) { const c = G.balls[0]; const tgt = pgFoeTarget(G); const du = tgt ? tgt.au : 0, dv = tgt ? tgt.av : 1; u = c.u - du * 0.7; v = c.v - dv * 0.7; }
  const [x, z] = Q.F.toXZ(T.ac + u, T.bc + v); G.foe.group.position.set(x, 0.21, z);
  const c = pgPoolWorld(T, Q, G.balls[0]); G.foe.group.rotation.y = Math.atan2(c.x - x, c.z - z);
}
const pbLeft = (G, kind) => G.balls.filter((b) => b.kind === kind && !b.potted).length;
function pgFoeTarget(G) { // the yellows' shot: the easiest ball into the nearest pocket, through a ghost ball
  const c = G.balls[0], want = pbLeft(G, 'yellow') ? 'yellow' : 'black';
  let best = null;
  for (const b of G.balls) {
    if (b.potted || b.kind !== want) continue;
    for (const [pu, pv] of PB_POCKETS) {
      const tu = pu - b.u, tv = pv - b.v, tl = Math.hypot(tu, tv); if (tl < 0.01) continue;
      const gu = b.u - (tu / tl) * PB_R * 2, gv = b.v - (tv / tl) * PB_R * 2, au = gu - c.u, av = gv - c.v, al = Math.hypot(au, av); if (al < 0.01) continue;
      const cut = 1 - ((au / al) * (tu / tl) + (av / al) * (tv / tl)); const score = cut * 3 + tl + al * 0.5;
      if (!best || score < best.score) best = { score, au: au / al, av: av / al, power: clamp(0.25 + (tl + al) * 0.35, 0.3, 0.95) };
    }
  }
  return best;
}
function pgStrike(G, du, dv, power) {
  const c = G.balls[0], sp = 0.4 + power * 3.4;
  c.vu = du * sp; c.vv = dv * sp; c.firstHit = null; G.state = 'roll'; G.shotPots = []; G.shots++;
}
function pgPoolEnd(K, won, msg) {
  const G = PG_STATE.pool; if (!G) return;
  PG_STATE.pool = null;
  for (const m of G.meshes) scene.remove(m); scene.remove(G.aim); scene.remove(G.foe.group);
  if (won) { K.player.cash += 4; PG_STATE.poolWon++; K.sfx.cash(); K.coolHeat(2); }
  K.showMsg(msg, 2.8);
}
function pgSettle(K) { // the balls have stopped: whose go is it?
  const G = PG_STATE.pool, mine = G.turn === 'you' ? 'red' : 'yellow', who = G.turn === 'you' ? 'YOU' : G.name;
  const pots = G.shotPots, cue = pots.some((b) => b.kind === 'cue'), black = pots.some((b) => b.kind === 'black');
  const foul = cue || !G.balls[0].firstHit || (G.balls[0].firstHit !== mine && !(G.balls[0].firstHit === 'black' && !pbLeft(G, mine) && !pots.some((b) => b.kind === mine)));
  PG_STATE.pots += pots.filter((b) => b.kind === 'red' && G.turn === 'you').length;
  if (black) {
    const legal = !cue && !pbLeft(G, mine);
    const youWin = (G.turn === 'you') === legal;
    pgPoolEnd(K, youWin, youWin ? (G.turn === 'you' ? `YOU SINK THE BLACK. GAME. $4 FROM ${G.name}` : `${G.name} POTS THE BLACK TOO EARLY. YOU WIN $4`) : (G.turn === 'you' ? `THE BLACK, TOO SOON. ${G.name} TAKES THE MONEY` : `${G.name} SINKS THE BLACK. "WINNER STAYS ON"`));
    return;
  }
  if (cue) { const c = G.balls[0]; c.potted = false; c.u = 0; c.v = -0.75; c.vu = c.vv = 0; for (const b of G.balls) if (b !== c && !b.potted && Math.hypot(b.u - c.u, b.v - c.v) < PB_R * 2.2) c.u += PB_R * 3; }
  const keep = !foul && pots.some((b) => b.kind === mine);
  if (!keep) G.turn = G.turn === 'you' ? 'them' : 'you';
  const msg = foul ? `FOUL. ${G.turn === 'you' ? 'YOUR' : G.name + '\'S'} SHOT` : keep ? `${who} ${pots.length > 1 ? 'POT TWO' : 'POTS ONE'}. GO AGAIN` : `${G.turn === 'you' ? 'YOUR' : G.name + '\'S'} SHOT`;
  K.showMsg(`${msg} · REDS LEFT ${pbLeft(G, 'red')}, YELLOWS ${pbLeft(G, 'yellow')}`, 1.8);
  G.state = 'aim'; G.waitT = G.turn === 'them' ? 1.6 : 0;
  pgPlaceFoe(G, G.turn === 'them');
}
function pgPoolRide(dt, K) {
  const G = PG_STATE.pool, P = K.player, I = K.input, T = G.T, Q = G.Q;
  if (!P.alive || P.car || P.hide || I.fwd < 0 || (P.lastHurt != null && P.lastHurt < 0.1)) { pgPoolEnd(K, false, `YOU WALK AWAY FROM THE TABLE. ${G.name} KEEPS THE $2`); return false; }
  G.t += dt;
  if (G.state === 'roll') {
    for (let k = 0; k < 8; k++) G.shotPots.push(...poolStep(G.balls, dt / 8));
    for (const b of G.shotPots) if (!b.sounded) { b.sounded = true; K.sfx.thunk && K.sfx.thunk(); }
    if (!pbMoving(G.balls)) { for (const b of G.balls) { b.vu = b.vv = 0; } pgSettle(K); if (!PG_STATE.pool) return false; }
  } else if (G.turn === 'them') {
    G.waitT -= dt;
    if (G.waitT <= 0) { const s = pgFoeTarget(G) || { au: 0, av: 1, power: 0.6 }; const n = mr(-1, 1) * G.foeSkill, cs = Math.cos(n), sn = Math.sin(n); pgStrike(G, s.au * cs - s.av * sn, s.au * sn + s.av * cs, s.power); K.say({ g: G.foe.group }, mpick(['WATCH THIS', 'CORNER POCKET', '...', 'EASY'])); }
  }
  // your view: stood behind the white, looking along the shot
  const c = G.balls[0], cw = pgPoolWorld(T, Q, c);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  if (G.turn === 'you' && G.state === 'aim') { P.x = cw.x - fx * 0.85; P.z = cw.z - fz * 0.85; P.y = 0.21; P.crouch = 0.55; }
  else { const [sx, sz] = Q.F.toXZ(T.ac - 1.3, T.bc - 0.6); P.x = sx; P.z = sz; P.y = 0.21; P.crouch = 0; }
  P.vx = P.vz = P.vy = 0; P.sprinting = false;
  // draw it
  G.balls.forEach((b, i) => { const m = G.meshes[i]; m.visible = !b.potted; if (!b.potted) { const w = pgPoolWorld(T, Q, b); m.position.set(w.x, 0.88 + PB_R, w.z); } });
  G.aim.visible = G.turn === 'you' && G.state === 'aim';
  if (G.aim.visible) { G.aim.position.set(cw.x, 0.88 + PB_R, cw.z); G.aim.rotation.y = P.yaw; }
  return true;
}
const pgPower = (G) => 0.5 - 0.5 * Math.cos(G.t * 2.4);
function pgShoot(K) {
  const G = PG_STATE.pool, P = K.player; if (G.turn !== 'you' || G.state !== 'aim') return;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  let du = fx * G.ea.x + fz * G.ea.z, dv = fx * G.eb.x + fz * G.eb.z; const l = Math.hypot(du, dv) || 1; du /= l; dv /= l;
  pgStrike(G, du, dv, pgPower(G)); K.sfx.thunk && K.sfx.thunk();
}

// =====================================================================
// The venue hooks
// =====================================================================
function pgUseTarget(K) {
  const P = K.player;
  if (PG_STATE.darts) return { kind: 'throw', first: true };
  if (PG_STATE.pool) return { kind: 'shoot', first: true };
  if (P.car || P.hide || P.mode !== 'move' || P.y > 0.8) return null;
  const Q = pgPubAt(P.x, P.z); if (!Q) return null;
  if (Math.hypot(P.x - Q.oche.x, P.z - Q.oche.z) < 1.2) return { kind: 'darts', Q };
  if (Q.table) { const [x, z] = Q.F.toXZ(Q.table.ac, Q.table.bc); if (Math.abs(P.x - x) < 1.9 && Math.abs(P.z - z) < 1.9) return { kind: 'pool', Q }; }
  return null;
}
function pgUsePrompt(T, K, useK) {
  const back = K.isTouch ? 'pull back' : 'S';
  if (T.kind === 'throw') { const D = PG_STATE.darts; return D.turn === 'you' ? `${useK} to throw (dart ${D.visit.length + 1} of 3) · ${back} to give up` : `${D.name}'s throw...`; }
  if (T.kind === 'shoot') { const G = PG_STATE.pool; if (G.turn !== 'you' || G.state !== 'aim') return G.state === 'roll' ? '...' : `${G.name} is lining one up`; const p = Math.round(pgPower(G) * 10); return `${useK} to strike · POWER ${'|'.repeat(p)}${'.'.repeat(10 - p)} · ${back} to walk away`; }
  if (T.kind === 'darts') return `${useK} to play darts ($3 against a regular)`;
  if (T.kind === 'pool') return `${useK} to play pool ($2, reds and yellows)`;
  return '';
}
function pgUse(T, K) {
  if (T.kind === 'throw') { pgThrow(K); return; }
  if (T.kind === 'shoot') { pgShoot(K); return; }
  if (T.kind === 'darts') { pgStartDarts(T.Q, K); return; }
  if (T.kind === 'pool') pgStartPool(T.Q, K);
}
export const pubGames = {
  name: 'pubgames', roofs: [],
  useTarget: pgUseTarget, usePrompt: pgUsePrompt, use: pgUse,
  conspic: () => (PG_STATE.darts || PG_STATE.pool ? -0.28 : 0),
  update: () => {},
  ride: (dt, K) => (PG_STATE.darts ? pgDartsRide(dt, K) : PG_STATE.pool ? pgPoolRide(dt, K) : false),
  plan: () => false,
  reset() { const k = { player: { cash: 0 }, showMsg: () => {}, sfx: {}, coolHeat: () => {} }; if (PG_STATE.darts) pgEndDarts(k, true); if (PG_STATE.pool) pgPoolEnd(k, false, ''); Object.assign(PG_STATE, { darts: null, pool: null, dartsGames: 0, dartsWon: 0, poolGames: 0, poolWon: 0, ton80: 0, thrown: 0, best: 0, pots: 0 }); },
  diary: () => { const b = []; if (PG_STATE.dartsWon) b.push(`WON AT DARTS (${PG_STATE.dartsWon})`); if (PG_STATE.poolWon) b.push(`WON AT POOL (${PG_STATE.poolWon})`); return b; },
  debug: () => ({ pubs: pgPubs.length, tables: pgPubs.filter((Q) => Q.table).length, ...PG_STATE, darts: PG_STATE.darts ? { turn: PG_STATE.darts.turn, you: pgDartsSum(PG_STATE.darts.you), them: pgDartsSum(PG_STATE.darts.them) } : null, pool: PG_STATE.pool ? { turn: PG_STATE.pool.turn, state: PG_STATE.pool.state, reds: pbLeft(PG_STATE.pool, 'red'), yellows: pbLeft(PG_STATE.pool, 'yellow') } : null }),
  PG_STATE, pgPubs, dartScore, poolRack, poolStep, pgStartDarts, pgStartPool, pgPubAt, pgEndDarts, pgPoolEnd, pgSettle, pgFoeTarget, pgStrike,
};
