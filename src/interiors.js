// Explorable interiors: the Halden Metro subway, sewers under Ashford and the docks, the Halden Galleria
// shopping mall, and a half-built tower on a construction site. All of it is real collision you can run,
// climb and hide in, and hunters follow you through the same stairs and ladders.
import * as THREE from '../vendor/three.module.min.js';
import { canvasTex, textTex, GeoBuf, scene, clamp, lerp, srand, sr, spick } from './core.js';
import {
  CITIES, RD, SW, PITCH, groundHoles, siteOverrides, worldHooks, blockKey, links, ladders, forcedLadders, rectMinus,
  addCollider, addRoof, facadeBox, FAC, placeLadder, propBuf, glowBuf, shopBuf, roofBuf, parapet, adMats, edgeMat, addTree,
} from './world.js';

const M_PH = CITIES[0], M_ASH = CITIES[1], M_DOCKS = CITIES[2];
export const undergroundRects = []; // for the minimap {x0,x1,z0,z1,kind}
export const interiorZones = [];    // named places {x0,x1,z0,z1,y0,y1,name}

// ---------------------------------------------------------------------
// materials + buffers (built once the world is baked)
// ---------------------------------------------------------------------
const tileTex = canvasTex(128, 128, (ctx, W, H) => {
  ctx.fillStyle = '#e8e4da'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b8b2a6'; for (let i = 0; i <= 8; i++) { ctx.fillRect(i * 16 - 1, 0, 2, H); ctx.fillRect(0, i * 16 - 1, W, 2); }
  ctx.fillStyle = '#2a6a9a'; ctx.fillRect(0, 80, W, 14); ctx.fillStyle = '#e0b030'; ctx.fillRect(0, 94, W, 4);
  for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(60,50,30,${Math.random() * 0.08})`; ctx.fillRect(Math.random() * W, Math.random() * H, 6, 6); }
}, true);
const brickTex = canvasTex(128, 128, (ctx, W, H) => {
  ctx.fillStyle = '#4a4436'; ctx.fillRect(0, 0, W, H);
  for (let r = 0; r < 16; r++) for (let c = 0; c < 5; c++) { ctx.fillStyle = `rgb(${90 + Math.random() * 30},${70 + Math.random() * 20},${50 + Math.random() * 15})`; ctx.fillRect(c * 28 + (r % 2) * 14 - 14, r * 8 + 1, 26, 6); }
  for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(40,70,30,${Math.random() * 0.4})`; ctx.fillRect(Math.random() * W, Math.random() * H, 10 + Math.random() * 20, 3 + Math.random() * 30); }
}, true);
const floorTex = canvasTex(128, 128, (ctx, W, H) => {
  ctx.fillStyle = '#d8d4cc'; ctx.fillRect(0, 0, W, H);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = (r + c) % 2 ? '#cfcac0' : '#e4e0d8'; ctx.fillRect(c * 32, r * 32, 32, 32); }
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, 0, W, 6);
}, true);
export const glassB = new GeoBuf(), ib = new GeoBuf(), tileB = new GeoBuf(), brickB = new GeoBuf(), floorB = new GeoBuf(), lightB = new GeoBuf();
export const interiorFloorMats = [];
worldHooks.afterBake.push(() => {
  ib.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  tileB.build(new THREE.MeshLambertMaterial({ map: tileTex, vertexColors: true }));
  brickB.build(new THREE.MeshLambertMaterial({ map: brickTex, vertexColors: true }));
  const fm = new THREE.MeshLambertMaterial({ map: floorTex, vertexColors: true }); interiorFloorMats.push(fm);
  floorB.build(fm);
  lightB.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const gm = glassB.build(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, emissive: 0x203040 }));
  if (gm) gm.renderOrder = 2;
});

// a solid block: drawn and collidable
export function solid(buf, x0, x1, y0, y1, z0, z1, color, extra) {
  buf.box(x0, x1, y0, y1, z0, z1, color, { bottom: true, uvW: 4, uvH: 4 });
  return addCollider(x0, x1, z0, z1, y1, Object.assign({ y0 }, extra || {}));
}
// a walkable slab: top face only plus edges, solid for collisions
export function slab(buf, x0, x1, yTop, z0, z1, color, th = 0.4, extra) {
  buf.box(x0, x1, yTop - th, yTop, z0, z1, color, { bottom: true });
  return addCollider(x0, x1, z0, z1, yTop, Object.assign({ y0: yTop - th }, extra || {}));
}
// straight stairs. (ax, az) is the centre of the top edge, dir is the way down ('px','nx','pz','nz')
export function stairs(ax, az, dir, width, yTop, yBot, color, opt = {}) {
  const n = Math.round((yTop - yBot) / 0.35), rise = (yTop - yBot) / n, run = opt.run ?? 0.5;
  const dx = dir === 'px' ? 1 : dir === 'nx' ? -1 : 0, dz = dir === 'pz' ? 1 : dir === 'nz' ? -1 : 0;
  for (let i = 0; i < n; i++) {
    const a0 = i * run, a1 = (i + 1) * run, top = yTop - rise * (i + 1);
    let x0, x1, z0, z1;
    if (dx) { x0 = ax + dx * a0; x1 = ax + dx * a1; if (x0 > x1) [x0, x1] = [x1, x0]; z0 = az - width / 2; z1 = az + width / 2; }
    else { z0 = az + dz * a0; z1 = az + dz * a1; if (z0 > z1) [z0, z1] = [z1, z0]; x0 = ax - width / 2; x1 = ax + width / 2; }
    (opt.buf || ib).box(x0, x1, yBot - 0.3, top, z0, z1, i % 2 ? color : shade(color, 0.92), { bottom: true });
    addCollider(x0, x1, z0, z1, top, { y0: yBot - 0.3, stair: true });
  }
  const L = n * run;
  links.push({ a: { x: ax - dx * 0.6, y: yTop, z: az - dz * 0.6 }, b: { x: ax + dx * (L + 0.8), y: yBot, z: az + dz * (L + 0.8) }, kind: 'stairs' });
  return L;
}
export function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); }
export function lamp(x0, x1, y, z0, z1, color = 0xfff4dc) { lightB.box(x0, x1, y - 0.06, y, z0, z1, color, { bottom: true, top: false }); }
export function sign(text, x, y, z, ry, w = 4, h = 0.9, bg = '#1f4a8a', fg = '#fff') {
  const t = textTex(512, Math.round(512 * h / w), bg, fg, [text], `bold ${Math.round(300 * h / w)}px Arial, sans-serif`);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), [edgeMat, edgeMat, edgeMat, edgeMat, new THREE.MeshBasicMaterial({ map: t }), new THREE.MeshBasicMaterial({ map: t })]);
  m.position.set(x, y, z); m.rotation.y = ry; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); return m;
}
// a hole in the street with a railing on three sides (the open side is where you walk in)
function stairwellHole(h, openSide) {
  groundHoles.push(h);
  const rail = (x0, x1, z0, z1) => { propBuf.box(x0, x1, 0, 1.05, z0, z1, 0x2a5a8a); addCollider(x0, x1, z0, z1, 1.05); };
  if (openSide !== 'nz') rail(h.x0, h.x1, h.z0 - 0.08, h.z0);
  if (openSide !== 'pz') rail(h.x0, h.x1, h.z1, h.z1 + 0.08);
  if (openSide !== 'nx') rail(h.x0 - 0.08, h.x0, h.z0, h.z1);
  if (openSide !== 'px') rail(h.x1, h.x1 + 0.08, h.z0, h.z1);
}
// a manhole with a ladder down the shaft. The ladder is fixed to the shaft's +x wall.
function manhole(x, z, depth, buf) {
  const h = { x0: x - 0.65, x1: x + 0.65, z0: z - 0.65, z1: z + 0.65 };
  groundHoles.push(h);
  for (const [x0, x1, z0, z1] of [[h.x0 - 0.2, h.x0, h.z0 - 0.2, h.z1 + 0.2], [h.x1, h.x1 + 0.2, h.z0 - 0.2, h.z1 + 0.2], [h.x0, h.x1, h.z0 - 0.2, h.z0], [h.x0, h.x1, h.z1, h.z1 + 0.2]]) {
    buf.box(x0, x1, depth + 2.6, 0.02, z0, z1, 0x3a3a36, { bottom: true });
  }
  propBuf.box(h.x0 - 0.1, h.x1 + 0.1, 0.0, 0.05, h.z1 + 0.15, h.z1 + 1.3, 0x2a2a2a); // the lifted lid
  forcedLadders.push({ roof: { h: 0.02 }, x: x + 0.65 - 0.3, z, nx: -1, nz: 0, y0: depth });
}

// =====================================================================
// HALDEN METRO: a tunnel under 6th Row with three stations and a train
// =====================================================================
const Z0 = M_PH.Rz(6), TX0 = M_PH.Rx(0) + 6, TX1 = M_PH.Rx(M_PH.n) - 6;
const PLAT = -6, TRACK = -7.2, STATION_NAMES = ['KESTREL ST', 'CENTRAL', 'CANAL WORKS'];
const stations = [1, 4, 6].map((i, k) => ({ xs: (M_PH.Rx(i) + M_PH.Rx(i + 1)) / 2, name: STATION_NAMES[k] }));
for (const st of stations) {
  st.x0 = st.xs - 21; st.x1 = st.xs + 21; st.z0 = Z0 - 10; st.z1 = Z0 + 10;
  st.holeN = { x0: st.xs - 10.2, x1: st.xs - 1.4, z0: Z0 - 9.7, z1: Z0 - 7.2 };
  st.holeS = { x0: st.xs + 1.4, x1: st.xs + 10.2, z0: Z0 + 7.2, z1: Z0 + 9.7 };
  stairwellHole(st.holeN, 'nx'); stairwellHole(st.holeS, 'px');
}
const metroManholes = [[TX0 + 3, Z0 + 3.4], [TX1 - 3, Z0 - 3.4]];
for (const [x, z] of metroManholes) manhole(x, z, PLAT, tileB);

worldHooks.beforeBake.push(() => {
  const WALL = 0xe0dcd2, PLATC = 0x9a968e;
  // track bed runs the full length
  slab(ib, TX0, TX1, TRACK, Z0 - 2.2, Z0 + 2.2, 0x3a342e, 0.6);
  for (const s of [-0.75, 0.75]) ib.box(TX0, TX1, TRACK, TRACK + 0.16, Z0 + s - 0.06, Z0 + s + 0.06, 0x8a8a90);
  for (let x = TX0; x < TX1; x += 1.2) ib.box(x, x + 0.3, TRACK, TRACK + 0.08, Z0 - 1.2, Z0 + 1.2, 0x4a3a2a);
  // walk the stretch between stations: [x0, x1, halfWidth]
  const spans = [];
  let x = TX0;
  for (const st of stations) { spans.push([x, st.x0, 4.6, false]); spans.push([st.x0, st.x1, 10, st]); x = st.x1; }
  spans.push([x, TX1, 4.6, false]);
  for (const [x0, x1, hw, st] of spans) {
    // platforms / walkways on both sides of the track
    slab(floorB, x0, x1, PLAT, Z0 - hw, Z0 - 2.2, st ? PLATC : 0x7a766e, 1.2);
    slab(floorB, x0, x1, PLAT, Z0 + 2.2, Z0 + hw, st ? PLATC : 0x7a766e, 1.2);
    if (st) for (const s of [-1, 1]) ib.box(x0, x1, PLAT - 0.01, PLAT + 0.01, Z0 + s * 2.2 - (s > 0 ? -0.0 : 0.45), Z0 + s * 2.2 + (s > 0 ? 0.45 : 0), 0xe0b030);
    // side walls (tiled)
    for (const s of [-1, 1]) solid(tileB, x0, x1, TRACK - 0.6, -0.3, s < 0 ? Z0 - hw - 0.5 : Z0 + hw, s < 0 ? Z0 - hw : Z0 + hw + 0.5, st ? 0xffffff : 0xbab4a8);
    // ceiling, with stairwell openings
    const ceilY = st ? -0.9 : -1.4;
    for (const q of rectMinus({ x0, x1, z0: Z0 - hw, z1: Z0 + hw }, st ? [st.holeN, st.holeS] : [{ x0: metroManholes[0][0] - 0.65, x1: metroManholes[0][0] + 0.65, z0: metroManholes[0][1] - 0.65, z1: metroManholes[0][1] + 0.65 }, { x0: metroManholes[1][0] - 0.65, x1: metroManholes[1][0] + 0.65, z0: metroManholes[1][1] - 0.65, z1: metroManholes[1][1] + 0.65 }])) {
      ib.box(q.x0, q.x1, ceilY, -0.3, q.z0, q.z1, st ? 0xd8d4cc : 0x5a5650, { bottom: true, top: false });
      addCollider(q.x0, q.x1, q.z0, q.z1, -0.3, { y0: ceilY, ceiling: true });
    }
    // strip lights
    for (let lx = x0 + 3; lx < x1 - 2; lx += st ? 4 : 9) lamp(lx, lx + (st ? 2.5 : 1.2), ceilY, Z0 - (st ? 6 : 3.5) - 0.2, Z0 - (st ? 6 : 3.5) + 0.2), lamp(lx, lx + (st ? 2.5 : 1.2), ceilY, Z0 + (st ? 6 : 3.5) - 0.2, Z0 + (st ? 6 : 3.5) + 0.2);
    undergroundRects.push({ x0, x1, z0: Z0 - hw, z1: Z0 + hw, kind: 'metro' });
  }
  // station end walls where the tunnel narrows, plus furniture
  for (const st of stations) {
    for (const ex of [st.x0, st.x1]) for (const s of [-1, 1]) {
      const za = s < 0 ? Z0 - 10 : Z0 + 4.6, zb = s < 0 ? Z0 - 4.6 : Z0 + 10;
      solid(tileB, ex - 0.25, ex + 0.25, TRACK - 0.6, -0.3, za, zb, 0xffffff);
    }
    stairs(st.holeN.x0 + 0.05, (st.holeN.z0 + st.holeN.z1) / 2, 'px', st.holeN.z1 - st.holeN.z0, 0.15, PLAT, 0x8a867e, { run: 0.5 });
    stairs(st.holeS.x1 - 0.05, (st.holeS.z0 + st.holeS.z1) / 2, 'nx', st.holeS.z1 - st.holeS.z0, 0.15, PLAT, 0x8a867e, { run: 0.5 });
    // pillars, benches, ads, signs
    for (let px = st.x0 + 5; px < st.x1 - 3; px += 8) for (const s of [-1, 1]) {
      const pz = Z0 + s * 4.2;
      if (Math.abs(px - (st.holeN.x0 + st.holeN.x1) / 2) < 5 && s < 0) continue;
      if (Math.abs(px - (st.holeS.x0 + st.holeS.x1) / 2) < 5 && s > 0) continue;
      solid(ib, px - 0.35, px + 0.35, PLAT, -0.9, pz - 0.35, pz + 0.35, 0x2a6a9a);
      solid(ib, px + 1.5, px + 3.5, PLAT, PLAT + 0.45, pz + s * 2.2 - 0.3, pz + s * 2.2 + 0.3, 0x6a4a2a);
    }
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const ax = st.x0 + 8 + k * 13, m = spick(adMats);
        const ad = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), m);
        ad.position.set(ax, PLAT + 2.6, Z0 + s * 9.99 - s * 0.02); ad.rotation.y = s < 0 ? 0 : Math.PI; scene.add(ad);
      }
      sign(st.name, st.xs + s * 5, -1.6, Z0 + s * 2.6, 0, 6, 0.9);
    }
    sign('HALDEN METRO  ' + st.name, (st.holeN.x0 + st.holeN.x1) / 2, 3.1, st.holeN.z0 - 0.15, 0, 7.5, 0.8);
    propBuf.box(st.holeN.x0 + 0.5, st.holeN.x0 + 0.6, 0, 3.1, st.holeN.z0 - 0.2, st.holeN.z0 - 0.1, 0x2a2a2e);
    propBuf.box(st.holeN.x1 - 0.6, st.holeN.x1 - 0.5, 0, 3.1, st.holeN.z0 - 0.2, st.holeN.z0 - 0.1, 0x2a2a2e);
    sign('HALDEN METRO  ' + st.name, (st.holeS.x0 + st.holeS.x1) / 2, 3.1, st.holeS.z1 + 0.15, Math.PI, 7.5, 0.8);
    interiorZones.push({ x0: st.x0, x1: st.x1, z0: st.z0, z1: st.z1, y0: -8, y1: -0.5, name: st.name + ' STATION' });
  }
  // end caps of the tunnel
  for (const ex of [TX0, TX1]) solid(tileB, ex - (ex === TX0 ? 0.5 : 0), ex + (ex === TX1 ? 0.5 : 0), TRACK - 0.6, -0.3, Z0 - 4.6, Z0 + 4.6, 0x8a847a);
  interiorZones.push({ x0: TX0, x1: TX1, z0: Z0 - 4.6, z1: Z0 + 4.6, y0: -8, y1: -0.5, name: 'METRO TUNNEL' });
});

// the train: three carriages that rattle through every so often. Being on the track is a bad idea.
const train = { g: new THREE.Group(), x: TX0 - 80, dir: 1, speed: 0, waitT: 20, len: 46, state: 'wait', stopT: 0, nextStop: 0 };
{
  const body = new THREE.MeshLambertMaterial({ color: 0xd8dce4 }), stripe = new THREE.MeshLambertMaterial({ color: 0x2a6a9a }), win = new THREE.MeshBasicMaterial({ color: 0xfff2c8 }), dark = new THREE.MeshLambertMaterial({ color: 0x222226 });
  for (let k = 0; k < 3; k++) {
    const cx = -k * 15.5;
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(cx + x, y, z); train.g.add(m); };
    add(new THREE.BoxGeometry(15, 3.2, 2.9), body, 0, 1.9, 0);
    add(new THREE.BoxGeometry(15.02, 0.4, 2.92), stripe, 0, 1.2, 0);
    add(new THREE.BoxGeometry(13, 0.9, 2.94), win, 0, 2.5, 0);
    add(new THREE.BoxGeometry(14, 0.4, 2.4), dark, 0, 0.2, 0);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 2.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  head.position.set(7.55, 1.2, 0); train.g.add(head); train.head = head;
  train.g.position.set(train.x, TRACK, Z0); scene.add(train.g);
}
export function updateInteriors(dt, player, hunters, cb) {
  // train schedule: wait off-screen, run the line, stopping briefly at each station
  const T = train;
  if (T.state === 'wait') {
    T.waitT -= dt; T.g.visible = false;
    if (T.waitT <= 0) { T.state = 'run'; T.dir *= -1; T.x = T.dir > 0 ? TX0 - 10 : TX1 + 10; T.speed = 16; T.g.visible = true; T.g.rotation.y = T.dir > 0 ? 0 : Math.PI; }
  } else {
    const ahead = stations.map((s) => s.xs).filter((x) => (x - T.x) * T.dir > 2).sort((a, b) => (a - b) * T.dir)[0];
    let want = 18;
    if (T.stopT > 0) { T.stopT -= dt; want = 0; }
    else if (ahead !== undefined && Math.abs(ahead - T.x) < 26) want = Math.max(2, Math.abs(ahead - T.x) * 0.7);
    if (ahead !== undefined && Math.abs(ahead - T.x) < 2.5 && T.stopT <= 0 && T.speed < 4) { T.stopT = 4; T.x = ahead + T.dir * 2.6; }
    T.speed = lerp(T.speed, want, Math.min(1, dt * (want < T.speed ? 2.2 : 0.6)));
    T.x += T.dir * T.speed * dt;
    if ((T.dir > 0 && T.x - T.len > TX1 + 5) || (T.dir < 0 && T.x + T.len < TX0 - 5)) { T.state = 'wait'; T.waitT = 25 + Math.random() * 20; }
    T.g.position.x = T.x;
    // who's on the track?
    const back = T.x - T.dir * T.len, xa = Math.min(T.x, back), xb = Math.max(T.x, back);
    const onTrack = (x, y, z) => y < PLAT - 0.4 && Math.abs(z - Z0) < 2.3 && x > xa - 0.8 && x < xb + 0.8;
    if (T.speed > 3 && player.alive && !player.car && onTrack(player.x, player.y, player.z)) cb.hitPlayer(T.dir, T.speed);
    for (const h of hunters) if (!h.dead && T.speed > 3 && onTrack(h.x, h.y, h.z)) h.die({ x: T.dir * T.speed * 1.2, y: 6, z: (h.z - Z0) * 6 }, 1.2, false);
    cb.rumble(Math.max(0, 1 - Math.abs(player.x - T.x) / 90) * (player.y < -1 ? 1 : 0.25) * clamp(T.speed / 12, 0, 1));
  }
}

// =====================================================================
// SEWERS: under Ashford and Saltmarsh Docks, entered by manholes in the street
// =====================================================================
const SEW = -5, CHAN = -5.8;
const sewerLines = [
  { axis: 'x', fixed: M_ASH.Rz(3), a0: M_ASH.minX + 10, a1: M_ASH.maxX - 10, city: M_ASH },
  { axis: 'z', fixed: M_ASH.Rx(3), a0: M_ASH.minZ + 10, a1: M_ASH.maxZ - 10, city: M_ASH },
  { axis: 'x', fixed: M_DOCKS.Rz(2), a0: M_DOCKS.minX + 10, a1: M_DOCKS.maxX - 10, city: M_DOCKS },
  { axis: 'z', fixed: M_DOCKS.Rx(4), a0: M_DOCKS.minZ + 10, a1: M_DOCKS.maxZ - 10, city: M_DOCKS },
];
const sewerHoles = [];
for (const L of sewerLines) {
  for (let a = L.a0 + 12; a < L.a1 - 6; a += 95) {
    const x = L.axis === 'x' ? a : L.fixed + 1.35, z = L.axis === 'x' ? L.fixed + 1.35 : a;
    manhole(x, z, SEW, brickB); sewerHoles.push({ x0: x - 0.65, x1: x + 0.65, z0: z - 0.65, z1: z + 0.65 });
  }
}
worldHooks.beforeBake.push(() => {
  for (const L of sewerLines) {
    const crosses = sewerLines.filter((o) => o !== L && o.city === L.city).map((o) => o.fixed);
    const P = (a, c) => (L.axis === 'x' ? [a, L.fixed + c] : [L.fixed + c, a]);
    const box = (buf, a0, a1, c0, c1, y0, y1, col, coll, extra) => {
      const [x0, z0] = P(a0, c0), [x1, z1] = P(a1, c1);
      const bx0 = Math.min(x0, x1), bx1 = Math.max(x0, x1), bz0 = Math.min(z0, z1), bz1 = Math.max(z0, z1);
      buf.box(bx0, bx1, y0, y1, bz0, bz1, col, { bottom: true, uvW: 3, uvH: 3 });
      if (coll) addCollider(bx0, bx1, bz0, bz1, y1, Object.assign({ y0 }, extra || {}));
      return { x0: bx0, x1: bx1, z0: bz0, z1: bz1 };
    };
    box(floorB, L.a0, L.a1, -2.2, -0.7, SEW - 0.8, SEW, 0x5a5448, true);
    box(floorB, L.a0, L.a1, 0.7, 2.2, SEW - 0.8, SEW, 0x5a5448, true);
    box(ib, L.a0, L.a1, -0.7, 0.7, CHAN - 0.6, CHAN, 0x2a2a20, true);
    box(ib, L.a0, L.a1, -0.7, 0.7, CHAN + 0.35, CHAN + 0.37, 0x3a5a3a, false); // murky water
    // walls with gaps where another tunnel crosses
    let segs = [[L.a0, L.a1]];
    for (const c of crosses) segs = segs.flatMap(([a, b]) => (c - 2.2 > a && c + 2.2 < b ? [[a, c - 2.2], [c + 2.2, b]] : [[a, b]]));
    for (const [a, b] of segs) for (const s of [-1, 1]) box(brickB, a, b, s < 0 ? -2.7 : 2.2, s < 0 ? -2.2 : 2.7, CHAN - 0.6, -0.3, 0xffffff, true);
    for (const e of [L.a0, L.a1]) box(brickB, e - 0.4, e, -2.2, 2.2, CHAN - 0.6, -0.3, 0xffffff, true);
    // ceiling minus manholes
    const [cx0, cz0] = P(L.a0, -2.2), [cx1, cz1] = P(L.a1, 2.2);
    for (const q of rectMinus({ x0: Math.min(cx0, cx1), x1: Math.max(cx0, cx1), z0: Math.min(cz0, cz1), z1: Math.max(cz0, cz1) }, sewerHoles)) {
      brickB.box(q.x0, q.x1, -1.6, -0.3, q.z0, q.z1, 0xb0a890, { bottom: true, top: false, uvW: 3, uvH: 3 });
      addCollider(q.x0, q.x1, q.z0, q.z1, -0.3, { y0: -1.6, ceiling: true });
    }
    // pipes and dim caged lamps
    for (let a = L.a0 + 4; a < L.a1 - 2; a += 14) {
      const [lx, lz] = P(a, -2.1);
      lightB.box(lx - 0.15, lx + 0.15, -2.1, -1.8, lz - 0.15, lz + 0.15, 0xffd890);
    }
    box(ib, L.a0, L.a1, 2.0, 2.2, -2.4, -2.1, 0x6a5a3a, false);
    const [ux0, uz0] = P(L.a0, -2.2), [ux1, uz1] = P(L.a1, 2.2);
    undergroundRects.push({ x0: Math.min(ux0, ux1), x1: Math.max(ux0, ux1), z0: Math.min(uz0, uz1), z1: Math.max(uz0, uz1), kind: 'sewer' });
    interiorZones.push({ x0: Math.min(ux0, ux1), x1: Math.max(ux0, ux1), z0: Math.min(uz0, uz1), z1: Math.max(uz0, uz1), y0: -7, y1: -0.5, name: L.city.name + ' SEWERS' });
  }
});

// =====================================================================
// HALDEN GALLERIA: a two-floor mall with an atrium, shops all round, stairs, and a roof you can reach
// =====================================================================
export const mallShops = []; // {x, z, y, name, side} shopfront centres, for later use (disguises, etc.)
const MALL_SHOPS = ['SOCK EMPORIUM', 'PRETZEL HUT', 'LAMP CITY', 'BIG HAT BARN', 'PHONE CASES', 'WIGS 4 U', 'CANDLE CORNER', 'SPECS APPEAL', 'BEARD BARN', 'TOY TOWN', 'JUICE BOX', 'MEGA MART', 'SHOE PALACE', 'GAME VAULT', 'NAIL BAR', 'KEBAB KING', 'SUIT YOURSELF', 'POSTER PLANET', 'BAG LADY', 'VAPE CLOUD'];
siteOverrides.set(blockKey(M_PH, 3, 4), (r, I) => {
  const x0 = I.ix0 + 1, x1 = I.ix1 - 1, z0 = I.iz0 + 1, z1 = I.iz1 - 1, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const F1 = 0.15, F2 = 5.4, ROOF = 10.2, W = 0.4, DOOR = 4, D = 6, COR = 5;
  propBuf.box(I.ix0, I.ix1, 0.15, 0.2, I.iz0, I.iz1, 0xb8b0a0);
  // outer walls with a door on each side (glass skin outside, plain inside)
  const wallSegs = (a0, a1, mid) => [[a0, mid - DOOR / 2], [mid + DOOR / 2, a1]];
  for (const [side, fixed] of [['nz', z0], ['pz', z1], ['nx', x0], ['px', x1]]) {
    const alongX = side[1] === 'z', mid = alongX ? cx : cz, a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
    const f0 = side[0] === 'n' ? fixed : fixed - W, f1 = side[0] === 'n' ? fixed + W : fixed;
    for (const [s0, s1] of wallSegs(a0, a1, mid)) alongX ? solid(ib, s0, s1, 0, ROOF, f0, f1, 0xece6da) : solid(ib, f0, f1, 0, ROOF, s0, s1, 0xece6da);
    alongX ? solid(ib, mid - DOOR / 2, mid + DOOR / 2, 3.6, ROOF, f0, f1, 0xece6da) : solid(ib, f0, f1, 3.6, ROOF, mid - DOOR / 2, mid + DOOR / 2, 0xece6da);
    const out = side[0] === 'n' ? fixed - 0.03 : fixed + 0.03;
    for (const [s0, s1] of wallSegs(a0, a1, mid)) FAC.glass1.buf.face(side, out, s0, s1, 0, ROOF, null, Math.max(1, Math.round((s1 - s0) / 6)));
    FAC.glass1.buf.face(side, out, mid - DOOR / 2, mid + DOOR / 2, 3.6, ROOF, null, 1);
    // canopy over the door + sign
    const sgn = side[0] === 'n' ? -1 : 1;
    if (alongX) propBuf.box(mid - 4, mid + 4, 3.7, 3.95, Math.min(fixed, fixed + sgn * 2.5), Math.max(fixed, fixed + sgn * 2.5), 0x2a2a30);
    else propBuf.box(Math.min(fixed, fixed + sgn * 2.5), Math.max(fixed, fixed + sgn * 2.5), 3.7, 3.95, mid - 4, mid + 4, 0x2a2a30);
    const ry = side === 'nz' ? Math.PI : side === 'pz' ? 0 : side === 'nx' ? -Math.PI / 2 : Math.PI / 2;
    sign('HALDEN GALLERIA', alongX ? mid : fixed + sgn * 0.3, 7.2, alongX ? fixed + sgn * 0.3 : mid, ry, 12, 1.6, '#14141a', '#ffcf4a');
  }
  // floors: ground floor tiles, upper slab with the atrium and two stairwells cut out, roof with a skylight hole
  const inner = { x0: x0 + W, x1: x1 - W, z0: z0 + W, z1: z1 - W };
  const atrium = { x0: cx - 7, x1: cx + 7, z0: cz - 7, z1: cz + 7 };
  const wellN = { x0: cx - 4, x1: cx + 4, z0: z0 + W + D + 0.6, z1: z0 + W + D + 3.2 };
  const wellS = { x0: cx - 4, x1: cx + 4, z0: z1 - W - D - 3.2, z1: z1 - W - D - 0.6 };
  floorB.box(inner.x0, inner.x1, 0.15, 0.2, inner.z0, inner.z1, 0xffffff);
  for (const q of rectMinus(inner, [atrium, wellN, wellS])) {
    floorB.box(q.x0, q.x1, F2 - 0.4, F2, q.z0, q.z1, 0xffffff, { bottom: false });
    ib.box(q.x0, q.x1, F2 - 0.41, F2 - 0.4, q.z0, q.z1, 0xf4f0e8, { bottom: true, top: false, sides: false });
    addCollider(q.x0, q.x1, q.z0, q.z1, F2, { y0: F2 - 0.4 });
  }
  const sky = { x0: cx - 5, x1: cx + 5, z0: cz - 5, z1: cz + 5 };
  for (const q of rectMinus(inner, [sky])) {
    roofBuf.flat(q.x0, q.x1, q.z0, q.z1, ROOF, 0x3d3944);
    ib.box(q.x0, q.x1, ROOF - 0.4, ROOF - 0.39, q.z0, q.z1, 0xf4f0e8, { bottom: true, top: false, sides: false });
    addRoof(q.x0, q.x1, q.z0, q.z1, ROOF, { y0: ROOF - 0.4, city: M_PH, noLadder: true });
  }
  for (const [a, b, c, d] of [[sky.x0 - 0.3, sky.x0, sky.z0, sky.z1], [sky.x1, sky.x1 + 0.3, sky.z0, sky.z1], [sky.x0, sky.x1, sky.z0 - 0.3, sky.z0], [sky.x0, sky.x1, sky.z1, sky.z1 + 0.3]]) solid(ib, a, b, ROOF, ROOF + 0.5, c, d, 0x8a9aaa, { ledge: true });
  for (let k = -4; k <= 4; k += 2) ib.box(cx + k - 0.05, cx + k + 0.05, ROOF + 0.4, ROOF + 0.5, sky.z0, sky.z1, 0x8a9aaa);
  parapet(x0, x1, z0, z1, ROOF);
  forcedLadders.push({ roof: { h: ROOF }, x: x1 + 0.3, z: z0 + 4, nx: 1, nz: 0, y0: 0.15 }); // service ladder round the side
  // glass railings round the atrium and stairwells on the upper floor
  const rail = (a, b, c, d) => { glassB.box(a, b, F2, F2 + 1.05, c, d, 0x9ac8e0); ib.box(a, b, F2 + 1.0, F2 + 1.08, c, d, 0xc0c4c8); addCollider(a, b, c, d, F2 + 1.05, { y0: F2 }); };
  rail(atrium.x0 - 0.08, atrium.x0, atrium.z0, atrium.z1); rail(atrium.x1, atrium.x1 + 0.08, atrium.z0, atrium.z1);
  rail(atrium.x0, atrium.x1, atrium.z0 - 0.08, atrium.z0); rail(atrium.x0, atrium.x1, atrium.z1, atrium.z1 + 0.08);
  for (const w of [wellN, wellS]) { rail(w.x0, w.x1, w.z0 - 0.08, w.z0); rail(w.x0, w.x1, w.z1, w.z1 + 0.08); }
  rail(wellN.x0 - 0.08, wellN.x0, wellN.z0, wellN.z1); rail(wellS.x1, wellS.x1 + 0.08, wellS.z0, wellS.z1);
  // stairs (escalator-style) up from the ground floor
  stairs(wellN.x1, (wellN.z0 + wellN.z1) / 2, 'nx', wellN.z1 - wellN.z0, F2, F1, 0x5a5a62, { run: 0.5 });
  stairs(wellS.x0, (wellS.z0 + wellS.z1) / 2, 'px', wellS.z1 - wellS.z0, F2, F1, 0x5a5a62, { run: 0.5 });
  // shop units in a ring on both floors: back wall = outer wall, dividers every 8 m, glass shopfront with a doorway
  let si = 0;
  for (const [fy, ceil] of [[F1, F2 - 0.4], [F2, ROOF - 0.4]]) {
    for (const side of ['nz', 'pz', 'nx', 'px']) {
      const alongX = side[1] === 'z', a0 = alongX ? x0 + W : z0 + W, a1 = alongX ? x1 - W : z1 - W, mid = alongX ? cx : cz;
      const back = side === 'nz' ? z0 + W : side === 'pz' ? z1 - W : side === 'nx' ? x0 + W : x1 - W, sg = side[0] === 'n' ? 1 : -1, front = back + sg * D;
      const units = [[a0 + (alongX ? 0 : D), a0 + (alongX ? 0 : D) + 7.33]];
      const start = alongX ? a0 : a0 + D, end = alongX ? a1 : a1 - D, n = 3, uw = (end - start) / n;
      units.length = 0; for (let k = 0; k < n; k++) units.push([start + k * uw, start + (k + 1) * uw]);
      for (const [u0, u1] of units) {
        const um = (u0 + u1) / 2;
        if (fy === F1 && Math.abs(um - mid) < 3) { // the entrance passage on the ground floor
          continue;
        }
        const name = MALL_SHOPS[si++ % MALL_SHOPS.length];
        const P = (a, f) => (alongX ? [a, f] : [f, a]);
        // dividers
        for (const dv of [u0, u1]) { const [ax, az] = P(dv - 0.12, Math.min(back, front)), [bx, bz] = P(dv + 0.12, Math.max(back, front)); solid(ib, Math.min(ax, bx), Math.max(ax, bx), fy, ceil, Math.min(az, bz), Math.max(az, bz), 0xd8d2c6); }
        // shopfront glass either side of a 2.4 m doorway
        for (const [g0, g1] of [[u0 + 0.12, um - 1.2], [um + 1.2, u1 - 0.12]]) {
          const [ax, az] = P(g0, front - 0.06), [bx, bz] = P(g1, front + 0.06);
          glassB.box(Math.min(ax, bx), Math.max(ax, bx), fy, ceil, Math.min(az, bz), Math.max(az, bz), 0xa8d0e8);
          addCollider(Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), ceil, { y0: fy, glass: true });
        }
        const [hx0, hz0] = P(um - 1.2, front - 0.1), [hx1, hz1] = P(um + 1.2, front + 0.1);
        solid(ib, Math.min(hx0, hx1), Math.max(hx0, hx1), fy + 2.6, ceil, Math.min(hz0, hz1), Math.max(hz0, hz1), 0xd8d2c6);
        // counter + shelves inside
        const [kx, kz] = P(um + 1.8, back + sg * 2.2);
        solid(ib, kx - (alongX ? 1.2 : 0.4), kx + (alongX ? 1.2 : 0.4), fy, fy + 1.0, kz - (alongX ? 0.4 : 1.2), kz + (alongX ? 0.4 : 1.2), spick([0x8a5a3a, 0x3a3a44, 0xb83a3a, 0x3a6a8a]));
        for (const off of [-2.2, 2.2]) { const [sx, sz] = P(um + off, back + sg * 0.5); solid(ib, sx - (alongX ? 1 : 0.3), sx + (alongX ? 1 : 0.3), fy, fy + 2.1, sz - (alongX ? 0.3 : 1), sz + (alongX ? 0.3 : 1), spick([0xe0c040, 0x40a0e0, 0xe06090, 0x60c060, 0xf0f0f0])); }
        // lit sign over the door, facing the corridor
        const [nx2, nz2] = P(um, front + sg * 0.08);
        const ry = side === 'nz' ? 0 : side === 'pz' ? Math.PI : side === 'nx' ? Math.PI / 2 : -Math.PI / 2;
        sign(name, nx2, fy + 3.2, nz2, ry, 4.2, 0.6, spick(['#b8303a', '#2a5a9a', '#2a8a5a', '#8a3ab0', '#d08a20', '#1a1a1a']), '#fff');
        mallShops.push({ x: nx2 + (alongX ? 0 : sg * 1.2), z: nz2 + (alongX ? sg * 1.2 : 0), y: fy, name, side });
        lamp(...(alongX ? [u0 + 1, u1 - 1] : [Math.min(back, front) + 1, Math.max(back, front) - 1]), ceil, ...(alongX ? [Math.min(back, front) + 1, Math.max(back, front) - 1] : [u0 + 1, u1 - 1]), 0xfff6e0);
      }
    }
    // corridor lights
    for (const [lx0, lx1, lz0, lz1] of [[cx - 12, cx + 12, z0 + W + D + 2.2, z0 + W + D + 2.6], [cx - 12, cx + 12, z1 - W - D - 2.6, z1 - W - D - 2.2], [x0 + W + D + 2.2, x0 + W + D + 2.6, cz - 12, cz + 12], [x1 - W - D - 2.6, x1 - W - D - 2.2, cz - 12, cz + 12]]) lamp(lx0, lx1, ceil, lz0, lz1);
  }
  // atrium: fountain, planters, benches
  propBuf.cyl(cx, cz, 3, 3, F1, F1 + 0.6, 0xb0a898, 16); addCollider(cx - 2.6, cx + 2.6, cz - 2.6, cz + 2.6, F1 + 0.6);
  glowBuf.cyl(cx, cz, 2.6, 2.6, F1 + 0.5, F1 + 0.55, 0x6ab0e0, 16);
  for (const [px, pz] of [[atrium.x0 + 1.5, atrium.z0 + 1.5], [atrium.x1 - 1.5, atrium.z0 + 1.5], [atrium.x0 + 1.5, atrium.z1 - 1.5], [atrium.x1 - 1.5, atrium.z1 - 1.5]]) { solid(ib, px - 0.8, px + 0.8, F1, F1 + 0.8, pz - 0.8, pz + 0.8, 0x6a5a4a); addTree(px, pz, 0.9, false); }
  interiorZones.push({ x0, x1, z0, z1, y0: 0, y1: ROOF - 0.4, name: 'HALDEN GALLERIA' });
  // street-level lights around
  for (const [lx, lz] of [[r.x0 + 0.7, r.z0 + 0.7], [r.x1 - 0.7, r.z1 - 0.7]]) propBuf.box(lx - 0.1, lx + 0.1, 0, 6.5, lz - 0.1, lz + 0.1, 0x2e3035);
});

// =====================================================================
// CONSTRUCTION SITE: "Halden Heights", a concrete frame six floors up with a tower crane
// =====================================================================
siteOverrides.set(blockKey(M_PH, 2, 6), (r, I) => {
  const { ix0, ix1, iz0, iz1 } = I;
  propBuf.box(ix0, ix1, 0.15, 0.2, iz0, iz1, 0x8a7a60); // dirt
  // hoarding with a gate on the north side
  const gate0 = (ix0 + ix1) / 2 - 3, gate1 = gate0 + 6, HC = 0xc8a060;
  const hoard = (x0, x1, z0, z1) => solid(ib, x0, x1, 0, 2.4, z0, z1, HC);
  hoard(ix0, gate0, iz0, iz0 + 0.15); hoard(gate1, ix1, iz0, iz0 + 0.15); hoard(ix0, ix1, iz1 - 0.15, iz1);
  hoard(ix0, ix0 + 0.15, iz0, iz1); hoard(ix1 - 0.15, ix1, iz0, iz1);
  sign('HALDEN HEIGHTS  -  LUXURY LIVING  -  COMING SOON', (ix0 + gate0) / 2, 1.4, iz0 - 0.04, Math.PI, gate0 - ix0 - 2, 1.4, '#1a3a5a', '#ffd23a');
  // the frame
  const bx0 = ix0 + 5, bx1 = ix1 - 11, bz0 = iz0 + 6, bz1 = iz1 - 5, CELL = (bx1 - bx0) / 4, CELLZ = (bz1 - bz0) / 5, FLOORS = 6, FH = 4;
  const CON = 0xa8a49c, STEEL = 0xc8602a;
  slab(ib, bx0 - 1, bx1 + 1, 0.35, bz0 - 1, bz1 + 1, 0x8a8680, 0.3);
  const colTop = [];
  for (let a = 0; a <= 4; a++) for (let b = 0; b <= 5; b++) {
    const x = bx0 + a * CELL, z = bz0 + b * CELLZ, top = FH * (b > 3 && a > 2 ? FLOORS : FLOORS - (srand() < 0.2 ? 1 : 0)) + (srand() < 0.5 ? 1.5 : 0);
    solid(ib, x - 0.3, x + 0.3, 0.3, top, z - 0.3, z + 0.3, CON); colTop.push(top);
    if (top % FH) for (let k = 0; k < 3; k++) ib.box(x - 0.25 + k * 0.2, x - 0.21 + k * 0.2, top, top + 1, z - 0.02, z + 0.02, 0x6a4a3a); // rebar
  }
  for (let f = 1; f <= FLOORS; f++) {
    const y = FH * f, keep = f <= 3 ? 0.95 : f === 4 ? 0.8 : f === 5 ? 0.62 : 0.4;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 5; b++) {
      const must = (a === 0) || (b === 0 && a < 2) || (a === 3 && b === 4); // ladder landings
      if (!must && srand() > keep) continue;
      const x0 = bx0 + a * CELL, z0 = bz0 + b * CELLZ;
      slab(ib, x0 - 0.3, x0 + CELL + 0.3, y, z0 - 0.3, z0 + CELLZ + 0.3, f % 2 ? CON : shade(CON, 0.93), 0.35);
    }
    // steel edge beams on the upper floors
    if (f >= 4) for (const [a0, a1, c0, c1] of [[bx0, bx1, bz0 - 0.15, bz0 + 0.15], [bx0, bx1, bz1 - 0.15, bz1 + 0.15]]) ib.box(a0, a1, y - 0.6, y - 0.35, c0, c1, STEEL);
    // safety rail on the west edge
    ib.box(bx0 - 0.35, bx0 - 0.3, y + 0.9, y + 1, bz0, bz1, 0xe0c020);
  }
  // ladders: up the west face to floor 3, then the north face to the top
  forcedLadders.push({ roof: { h: FH * 3 }, x: bx0 - 0.3 - 0.3, z: bz0 + CELLZ * 0.5, nx: -1, nz: 0, y0: 0.35 });
  forcedLadders.push({ roof: { h: FH * FLOORS }, x: bx0 + CELL * 0.5, z: bz0 - 0.3 - 0.15, nx: 0, nz: -1, y0: FH * 3 });
  // tower crane: mast with a ladder, jib reaching back over the street
  const mx = ix1 - 5, mz = iz0 + 8, MH = 46;
  solid(ib, mx - 0.9, mx + 0.9, 0, MH, mz - 0.9, mz + 0.9, 0xe0b020);
  for (let y = 2; y < MH; y += 3) ib.box(mx - 0.95, mx + 0.95, y, y + 0.15, mz - 0.95, mz + 0.95, 0x8a6a10);
  const jib = addRoof(mx - 34, mx + 1.2, mz - 0.8, mz + 0.8, MH + 1.2, { y0: MH, crane: true, city: M_PH });
  ib.box(mx - 34, mx + 1.2, MH, MH + 1.2, mz - 0.8, mz + 0.8, 0xe0b020, { bottom: true });
  solid(ib, mx + 1.2, mx + 11, MH, MH + 1.2, mz - 0.8, mz + 0.8, 0xe0b020);
  solid(ib, mx + 7, mx + 11, MH + 1.2, MH + 3.2, mz - 0.9, mz + 0.9, 0x6a6a70); // counterweight
  ib.box(mx - 1, mx + 1, MH + 1.2, MH + 3.5, mz - 1, mz + 1, 0xd8d8d8); // cab
  ib.beam([mx - 30, MH + 1.2, mz], [mx - 30, MH - 14, mz], 0.06, 0x222222); // hook cable
  solid(ib, mx - 30.8, mx - 29.2, MH - 15.2, MH - 14, mz - 0.6, mz + 0.6, 0xc03a2a);
  forcedLadders.push({ roof: jib, x: mx + 0.9 + 0.3, z: mz, nx: 1, nz: 0, y0: 0 });
  // site clutter: cement mixer, brick pallets, a skip, portable toilets, rebar
  solid(ib, ix0 + 2, ix0 + 4.5, 0, 1.6, iz1 - 6, iz1 - 3.5, 0xc84a2a);
  for (let k = 0; k < 4; k++) solid(ib, ix0 + 6 + k * 2.4, ix0 + 8 + k * 2.4, 0, 1.2, iz1 - 4, iz1 - 2.2, 0xa04a3a);
  solid(ib, ix1 - 9, ix1 - 3, 0, 1.8, iz1 - 6, iz1 - 3, 0x2a6a3a);
  for (let k = 0; k < 3; k++) solid(ib, ix1 - 3 - k * 1.6, ix1 - 1.8 - k * 1.6, 0, 2.3, iz0 + 2, iz0 + 3.3, 0x2a5ad0);
  for (let k = 0; k < 6; k++) ib.box(ix0 + 2, ix0 + 12, 0.2 + k * 0.08, 0.26 + k * 0.08, iz0 + 2 + k * 0.1, iz0 + 2.06 + k * 0.1, 0x6a4a3a);
  // planks bridging to the neighbour's roof are added by the rooftop pass
  interiorZones.push({ x0: ix0, x1: ix1, z0: iz0, z1: iz1, y0: 0, y1: 60, name: 'HALDEN HEIGHTS SITE' });
});

export function zoneAt(x, y, z) {
  for (const Z of interiorZones) if (x > Z.x0 && x < Z.x1 && z > Z.z0 && z < Z.z1 && y > Z.y0 && y < Z.y1) return Z;
  return null;
}
export const isUnderground = (y) => y < -1.2;
