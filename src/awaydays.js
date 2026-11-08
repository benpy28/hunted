// Away days at the Harriers: the police and the away fans.
//  - The AWAY FANS come in by coach down Route 9, an hour and a half before kick-off. The coach pulls up
//    outside the ground, they pile off in their own colours and the police walk them round to the away end
//    behind the south goal. They sing their own songs, go mad for their own goals and get back on the coach
//    at full time. Stand among them in a Harriers scarf and you'll be noticed.
//  - THE POLICE: two officers on the forecourt, two walking the away fans in and holding the line at the
//    south end, and two MOUNTED officers on big horses outside the turnstiles who sit high enough to see
//    over the whole crowd. Walk with the crowd and they look straight past you. Run, climb or make a scene
//    and the horses turn your way.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene } from './core.js';
import { buildPerson, lam, SKINS, HAIRS } from './people.js';
import { ground, matchNow, opponentOn, mdInternals, MD_STATE } from './matchday.js';

export const AW_STATE = { coaches: 0, dropped: 0, boarded: 0, warned: 0, warnT: 0, awayGoals: 0, wrongEnd: 0, copsPosted: 0, msgT: 0 };
const AW_STOP = { x: 437, z: -3.4 }; // where the coach pulls up, on the eastbound side of Route 9
const AW_KERB = { x: 437, z: -8.6 }; // where the fans get off
export const awayEnd = { x0: 435, x1: 461, z0: -97, z1: -90 };
export const inAwayEnd = (x, z) => x > awayEnd.x0 && x < awayEnd.x1 && z > awayEnd.z0 - 2 && z < awayEnd.z1 + 1;
// the walk round to the away end: in through the first turnstile, down the west side between the terrace
// and the pitch, round behind the south goal
const AW_ROUTE_IN = [[438, -10.5], [440, -17], [440, -24.5], [435.8, -29], [435.8, -90.5]]; // (along the touchline, clear of the dugouts)
const AW_POSTS = [
  { id: 'gate1', x: 434.5, z: -15, face: 0, kind: 'cop' }, { id: 'gate2', x: 461.5, z: -15, face: 0, kind: 'cop' },
  { id: 'line1', x: 441, z: -88.8, face: Math.PI, kind: 'cop', escort: true }, { id: 'line2', x: 455, z: -88.8, face: Math.PI, kind: 'cop', escort: true },
];
const AW_HORSES = [{ x: 425, z: -15.5, face: 0.3 }, { x: 471, z: -15.5, face: -0.3 }];

// =====================================================================
// The mounted police: a big horse each, and a rider in a hi-vis jacket up top
// =====================================================================
const awHorses = [];
function awBox(parent, w, h, d, x, y, z, col) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(col)); m.position.set(x, y, z); parent.add(m); return m; }
function buildHorses() {
  if (awHorses.length) return;
  for (const P of AW_HORSES) {
    const g = new THREE.Group(), col = mpick([0x4a2e1a, 0x2a1a12, 0x6a4a2a]);
    awBox(g, 0.75, 0.85, 2.1, 0, 1.45, 0, col); // body
    const legs = [];
    for (const [x, z] of [[-0.25, 0.8], [0.25, 0.8], [-0.25, -0.8], [0.25, -0.8]]) { const l = new THREE.Group(); l.position.set(x, 1.1, z); awBox(l, 0.18, 1.1, 0.18, 0, -0.55, 0, col); awBox(l, 0.2, 0.12, 0.22, 0, -1.06, 0.02, 0x1a1a1a); g.add(l); legs.push(l); }
    const neck = new THREE.Group(); neck.position.set(0, 1.75, 1.0); neck.rotation.x = -0.6; g.add(neck);
    awBox(neck, 0.36, 1.0, 0.45, 0, 0.45, 0, col); const head = awBox(neck, 0.3, 0.32, 0.75, 0, 0.95, 0.25, col); awBox(neck, 0.06, 0.5, 0.3, 0, 0.6, -0.2, 0x1a1a1a); // mane
    awBox(head, 0.32, 0.06, 0.2, 0, 0.0, 0.2, 0x1a1a1a); // the bridle
    const tail = new THREE.Group(); tail.position.set(0, 1.75, -1.05); awBox(tail, 0.12, 0.8, 0.12, 0, -0.4, -0.05, 0x1a1a1a); g.add(tail);
    awBox(g, 0.8, 0.08, 0.9, 0, 1.9, -0.05, 0x2a2a2e); // saddle
    awBox(g, 0.78, 0.4, 1.4, 0, 1.55, -0.05, 0xe8e020); // a hi-vis blanket, because even the horse is on duty
    const rider = buildPerson({ skin: mpick(SKINS), hair: mpick(HAIRS), shirt: 0xd8d820, pants: 0x1a2238, cap: 0x1a1a22 });
    rider.group.position.set(0, 1.05, -0.05); rider.legL.rotation.x = rider.legR.rotation.x = -1.2; rider.legL.rotation.z = 0.35; rider.legR.rotation.z = -0.35; rider.armL.rotation.x = rider.armR.rotation.x = -0.8;
    awBox(rider.torso, 0.5, 0.06, 0.32, 0, -0.15, 0, 0xc0c0c8);
    g.add(rider.group);
    g.position.set(P.x, 0, P.z); g.rotation.y = P.face; g.visible = false; scene.add(g);
    awHorses.push({ g, legs, neck, tail, rider, x: P.x, z: P.z, face: P.face, home: P.face, warnT: 0, look: P.face });
  }
}
const AW_MOUNTED = ['WALK, DON\'T RUN!', 'STAY WITH THE CROWD, PLEASE', 'YOU! WHAT ARE YOU UP TO?', 'OFF THE WALL!', 'I\'VE GOT MY EYE ON YOU, SUNSHINE', 'CALM DOWN, CALM DOWN'];
function awUpdateHorses(dt, K, M, near) {
  const on = !!(M && M.on && near);
  for (const H of awHorses) {
    H.g.visible = on;
    if (!on) continue;
    const P = K.player, dx = P.x - H.x, dz = P.z - H.z, d = Math.hypot(dx, dz);
    // they keep an eye on anyone who stands out, and turn the horse to face them
    const odd = K.G.conspic > 0.4 || P.sprinting || P.mode !== 'move' || P.y > 1.6;
    const want = odd && d < 22 ? Math.atan2(dx, dz) : H.home + Math.sin(K.time * 0.2 + H.x) * 0.4;
    let df = want - H.face; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
    H.face += clamp(df, -dt * 0.8, dt * 0.8); H.g.rotation.y = H.face;
    H.tail.rotation.z = Math.sin(K.time * 2.3 + H.x) * 0.35; H.neck.rotation.x = -0.6 + Math.sin(K.time * 0.9 + H.z) * 0.08;
    H.rider.head.rotation.y = clamp(df, -0.8, 0.8);
    H.warnT = Math.max(0, H.warnT - dt);
    if (!odd || d > 18 || H.warnT > 0 || P.car || P.hide || !K.canSee(H.x, 3.0, H.z)) continue;
    H.warnT = 6; AW_STATE.warned++;
    K.say({ g: H.g }, mpick(AW_MOUNTED)); K.bumpLocal(0.06);
    if (AW_STATE.warned % 2 === 0) { K.report(); K.addHeat(2); K.showMsg('THE MOUNTED OFFICER IS ON THE RADIO. BLEND IN WITH THE CROWD', 2.4); }
    else K.showMsg('A POLICE HORSE TURNS YOUR WAY', 1.8);
  }
}

// =====================================================================
// The coach
// =====================================================================
const awCoaches = (K) => K.G.cars.filter((c) => c.kind === 'coach' && !c.wrecked);
function awSendCoach(K, why, day) {
  const lane = K.lanes().find((l) => l.axis === 'x' && l.dir > 0 && Math.abs(l.fixed + 3.4) < 0.5);
  if (!lane) return null;
  const P = K.player; let along = 330;
  if (Math.abs(P.x - along) < 50 && Math.abs(P.z) < 30) along = 270; // not right in front of you
  const c = K.addCar(lane, along, 'coach'); if (!c) return null;
  c.aw = { why, day, phase: 'in', t: 0, n: 0 }; c.cruise = 12; AW_STATE.coaches++;
  return c;
}
// traffic logic for the coach: drive in, pull up at the ground, drop off (or pick up), drive away
export function coachLogic(c, dt, target, K) {
  const A = c.aw; if (!A) return target;
  A.t += dt;
  if (A.phase === 'in') {
    const left = AW_STOP.x - c.x;
    if (left < 14) target = Math.min(target, Math.max(1.5, left * 0.8));
    // (held up in traffic just short of the ground? it'll do here. Further back, the driver loses patience and squeezes past)
    A.chkT = (A.chkT ?? 3) - dt;
    if (A.chkT <= 0) { A.chkT = 3; A.slow = A.px != null && c.x - A.px < 2; A.px = c.x; if (A.slow && left >= 30) A.pushT = 2.5; }
    if (A.pushT > 0) { A.pushT -= dt; target = Math.max(target, 5); }
    if (left <= 0.5 || (A.slow && left < 30)) { A.phase = A.why === 'drop' ? 'drop' : 'wait'; A.t = 0; A.kx = c.x; c.speed = 0; if (K.near(c.x, c.z, 80)) K.sfx.horn(); }
    return target;
  }
  if (A.phase === 'drop') { // everybody off
    A.dropT = (A.dropT || 0) - dt;
    if (A.dropT <= 0 && A.n < A.want) { A.dropT = 0.35; A.n++; awFanOff(c, K); }
    if (A.n >= A.want && A.t > 3) { A.phase = 'out'; A.t = 0; }
    return 0;
  }
  if (A.phase === 'wait') { // waiting for everybody to get back on (the driver gives up eventually)
    const waiting = K.hunters().filter((h) => !h.dead && h.awFan && !h.gone);
    // (if traffic made it pull up short of the kerb, fans who walk to the usual stop just walk back along to it)
    for (const h of waiting) if (h.awFan === 'home' && (Math.abs(h.x - (A.kx ?? AW_KERB.x)) < 14 || Math.abs(h.x - AW_KERB.x) < 3) && Math.abs(h.z - AW_KERB.z) < 3.5) { h.remove(); AW_STATE.boarded++; }
    if ((!waiting.length && A.t > 3) || A.t > 35) { A.phase = 'out'; A.t = 0; if (K.near(c.x, c.z, 80)) K.sfx.horn(); }
    return 0;
  }
  // away: once it's well down the road and out of sight, it's gone
  if (c.x > AW_STOP.x + 140 && !K.near(c.x, c.z, 90)) A.done = true;
  return target;
}

// =====================================================================
// The away fans
// =====================================================================
function awScarf(h, col) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.34), lam(col)); m.position.set(0, 0.28, 0); h.p.torso.add(m);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.04), lam(0xf0f0f0)); tail.position.set(0.1, 0.05, 0.2); h.p.torso.add(tail);
}
function awFreeSpot() { const free = ground.watch.filter((w) => w.z < -91 && (!w.taken || w.taken.dead || (!w.taken.awFan && !w.taken.mdFan))); return free.length ? mpick(free) : null; }
function awToAwayEnd(h, K) {
  const w = awFreeSpot(); const sx = w ? w.x : mr(437, 459), sz = w ? w.z : -92.5;
  if (w) { w.taken = h; h.awSpot = w; }
  const route = awFromNearest(h, AW_ROUTE_IN.map(([x, z]) => [x + mr(-0.4, 0.4), z + mr(-0.3, 0.3)]));
  route.push([sx + mr(-0.3, 0.3), sz + mr(-0.3, 0.3)]);
  return K.lifeGo(h, 'watch', sx, sz, 0, mr(50, 90), { route, ri: 0, maxT: 120, spot: w });
}
function awToCoach(h, K) {
  if (h.awSpot && h.awSpot.taken === h) h.awSpot.taken = null; h.awSpot = null; h.awFan = 'home';
  const route = awRouteOut(h);
  return K.lifeGo(h, 'walk', AW_KERB.x, AW_KERB.z, null, 0.3, { route, ri: 0, oneWay: true, maxT: 120 });
}
// back out from wherever they've got to: pick up the route at the nearest point along it
function awRouteOut(h, dx = 0) {
  const out = awFromNearest(h, AW_ROUTE_IN.slice().reverse().map(([x, z]) => [x + dx + mr(-0.4, 0.4), z + mr(-0.3, 0.3)]));
  out.push([AW_KERB.x + mr(-1, 1), AW_KERB.z + mr(-0.4, 0.4)]); return out;
}
// pick a route up at its nearest point to h (or the one after, if they're already past it)
function awFromNearest(h, r) {
  let i0 = 0, bd = 1e9; r.forEach(([x, z], i) => { const d = Math.hypot(x - h.x, z - h.z); if (d < bd) { bd = d; i0 = i; } });
  if (i0 < r.length - 1) { const [ax, az] = r[i0], [bx, bz] = r[i0 + 1]; if ((h.x - ax) * (bx - ax) + (h.z - az) * (bz - az) > 0) i0++; }
  return r.slice(i0);
}
function awFanOff(c, K) {
  const h = K.spawnCivAt((c.aw.kx ?? AW_KERB.x) + mr(-2, 2), AW_KERB.z); if (!h) return;
  const opp = opponentOn(c.aw.day);
  h.awFan = true; h.job = null; h.walkK = 2.2; h.spdMul = Math.max(h.spdMul, 0.95); awScarf(h, opp.shirt); AW_STATE.dropped++; // a brisk march: kick-off's soon
  awToAwayEnd(h, K);
  if (Math.random() < 0.3) K.say(h, mpick(AW_ARRIVE(opp)));
}
const AW_ARRIVE = (o) => [`${o.name}! ${o.name}!`, 'IS THIS IT? IS THIS THE GROUND?', 'WHERE\'S THE TEA BAR?', `WE ARE ${o.name}!`, 'THREE HOURS ON A COACH FOR THIS', 'MIND THE STEP'];
const AW_CHANTS = (o) => [`${o.name}! ${o.name}!`, `COME ON, ${o.name}!`, 'YOU\'RE NOT SINGING ANY MORE!', 'IS THIS A LIBRARY?', 'WE\'VE COME A LONG WAY FOR THIS', 'REF! ARE YOU WATCHING?'];
const AW_GOAL = (o) => ['GET IN!', 'YESSS!', `${o.name}! ${o.name}!`, 'WHO\'S LAUGHING NOW?', 'WE\'RE GOING HOME HAPPY!'];

// =====================================================================
// The police on foot
// =====================================================================
function awPostCop(post, K) {
  const sx = post.escort ? AW_KERB.x + mr(-2, 2) : post.x, sz = post.escort ? AW_KERB.z - 1 : post.z;
  const h = K.spawnTypeAt(sx, sz, 'cop'); if (!h) return null;
  h.mdCop = post.id; h.job = null; AW_STATE.copsPosted++; if (post.escort) h.walkK = 2.2;
  awGoToPost(h, post, K); return h;
}
function awGoToPost(h, post, K) {
  let route = null;
  if (post.escort && h.z > -26) { route = AW_ROUTE_IN.map(([x, z]) => [x + 0.8, z]); route.push([post.x, post.z]); }
  return K.lifeGo(h, 'watch', post.x, post.z, post.face, mr(60, 120), route ? { route, ri: 0, maxT: 140 } : { maxGo: 60 });
}

// =====================================================================
// Each frame
// =====================================================================
export function updateAwayDays(dt, K) {
  if (!ground.built) return;
  buildHorses();
  const day = K.G.day, hr = K.hour, M = matchNow(day, hr), near = K.near(ground.cx, ground.cz, 220);
  awUpdateHorses(dt, K, M, near);
  // coaches that have finished are taken off the road
  for (const c of awCoaches(K)) if (c.aw && c.aw.done) K.removeCar(c);
  AW_STATE.tick = (AW_STATE.tick || 0) - dt; if (AW_STATE.tick > 0) return; AW_STATE.tick = 0.6;
  const fans = K.hunters().filter((h) => h.awFan && !h.dead), cops = K.hunters().filter((h) => h.mdCop && !h.dead);
  AW_STATE.fans = fans.length; AW_STATE.cops = cops.length;
  if (!M || !M.on) {
    // all over: the police drift off, anyone left from the away end heads for home
    for (const h of cops) if (!K.near(h.x, h.z, 70)) h.remove(); else if (!h.act && h.state !== 'chase') K.lifeGo(h, 'walk', mr(400, 500), -9, null, 0.3, { maxGo: 60 });
    for (const h of fans) if (!K.near(h.x, h.z, 70)) h.remove();
    return;
  }
  const opp = opponentOn(day);
  // the coach in, before the match; and back again to pick them up at full time
  if (near && (M.phase === 'pre') && AW_STATE.inDay !== day && hr < M.ko - 0.3) { AW_STATE.inDay = day; const c = awSendCoach(K, 'drop', day); if (c) c.aw.want = M.night ? 10 : 14; }
  if (near && M.phase === 'post' && AW_STATE.outDay !== day && (fans.length || AW_STATE.inDay === day)) { AW_STATE.outDay = day; awSendCoach(K, 'pick', day); }
  // the police take up their posts
  if (near && M.phase !== 'post') for (const post of AW_POSTS) if (!cops.some((h) => h.mdCop === post.id)) { if (!post.escort || fans.length || AW_STATE.inDay === day) awPostCop(post, K); }
  if (M.phase === 'post') for (const h of cops) if (!h.awOut && h.state !== 'chase') { h.awOut = true; const route = h.z < -26 ? awRouteOut(h, 0.8) : [[h.x, h.z], [AW_KERB.x + mr(-4, 4), AW_KERB.z - 2]]; K.lifeGo(h, 'watch', route[route.length - 1][0], route[route.length - 1][1], Math.PI, mr(10, 20), { route, ri: 0, maxT: 120 }); }
  for (const h of cops) if (!h.act && h.state !== 'chase' && !(h.panicT > 0)) { const post = AW_POSTS.find((p) => p.id === h.mdCop); if (post && M.phase !== 'post') awGoToPost(h, post, K); else if (M.phase === 'post') K.lifeGo(h, 'watch', AW_KERB.x + mr(-4, 4), AW_KERB.z - 2, Math.PI, mr(10, 20), { maxGo: 40 }); }
  // the away fans: to the away end; at full time, back to the coach
  for (const h of fans) {
    if (h.state === 'chase' || h.panicT > 0) continue;
    if (M.phase === 'post' && h.awFan === true) { awToCoach(h, K); continue; } // full time: everybody back to the coach
    if (h.act) continue;
    if (M.phase === 'post' || h.awFan === 'home') awToCoach(h, K); else awToAwayEnd(h, K);
  }
  // their goals, their songs
  const R = mdInternals.matchRec(day);
  if (R.away > (AW_STATE.lastAway[day] || 0)) {
    AW_STATE.lastAway[day] = R.away; AW_STATE.awayGoals++;
    const inEnd = fans.filter((h) => inAwayEnd(h.x, h.z));
    for (const h of inEnd) if (Math.random() < 0.7) K.lifeGo(h, 'cheer', h.x, h.z, 0, mr(4, 8), { maxGo: 2 });
    if (inEnd.length && K.near(ground.cx, ground.cz, 90)) { K.say(mpick(inEnd), mpick(AW_GOAL(opp))); K.sfx.roar(false); }
  }
  if (M.playing && K.near(ground.cx, awayEnd.z0, 70)) {
    AW_STATE.chantT = (AW_STATE.chantT ?? mr(4, 9)) - 0.6;
    if (AW_STATE.chantT <= 0) { AW_STATE.chantT = mr(7, 13); const h = fans.find((f) => inAwayEnd(f.x, f.z)); if (h) { K.say(h, mpick(AW_CHANTS(opp))); K.sfx.chant(); } }
  }
  // the wrong end: a home scarf among the away fans
  const P = K.player, scarf = P.outfit.face === 'md_scarf' || P.outfit.head === 'md_bobble';
  AW_STATE.wrongT = Math.max(0, (AW_STATE.wrongT || 0) - 0.6);
  if (scarf && inAwayEnd(P.x, P.z) && AW_STATE.wrongT <= 0 && fans.some((h) => Math.hypot(h.x - P.x, h.z - P.z) < 6)) {
    AW_STATE.wrongT = 8; AW_STATE.wrongEnd++;
    const h = fans.filter((f) => Math.hypot(f.x - P.x, f.z - P.z) < 6).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    K.say(h, mpick(['WRONG END, MATE', 'OI! HARRIERS SCARF!', 'YOU\'RE IN THE WRONG END', 'LOOK AT THIS ONE!']));
    for (const f of fans) if (Math.hypot(f.x - P.x, f.z - P.z) < 10) f.sus = Math.max(f.sus, 0.5);
    K.bumpLocal(0.06);
  }
}
export function awConspic(K) {
  const P = K.player; if (P.car) return 0;
  const M = matchNow(K.G.day, K.hour); if (!M || !M.on) return 0;
  const scarf = P.outfit.face === 'md_scarf' || P.outfit.head === 'md_bobble';
  if (inAwayEnd(P.x, P.z) && AW_STATE.fans > 3) return scarf ? 0.62 : -0.08; // with the away lot: fine, unless you're in the wrong colours (that cancels the home end's scarf bonus, and then some)
  return 0;
}
// what the away fans and match police do when they've finished what they were doing
export function awPlan(h, hr, K) {
  if (!h.awFan && !h.mdCop) return false;
  const M = matchNow(K.G.day, hr);
  if (h.mdCop) { const post = AW_POSTS.find((p) => p.id === h.mdCop); if (M && M.on && M.phase !== 'post' && post) return awGoToPost(h, post, K); return false; }
  if (!M || !M.on) return false;
  return M.phase === 'post' || h.awFan === 'home' ? awToCoach(h, K) : awToAwayEnd(h, K);
}
export function resetAwayDays() {
  Object.assign(AW_STATE, { coaches: 0, dropped: 0, boarded: 0, warned: 0, warnT: 0, awayGoals: 0, wrongEnd: 0, copsPosted: 0, inDay: 0, outDay: 0, lastAway: {}, wrongT: 0, fans: 0, cops: 0 });
  for (const H of awHorses) { H.warnT = 0; H.face = H.home; }
}
AW_STATE.lastAway = {};
export const awayDaysDebug = (K) => ({ horses: awHorses.length, horsesShown: awHorses.filter((H) => H.g.visible).length, coachesOnRoad: K ? awCoaches(K).map((c) => ({ x: c.x, z: c.z, phase: c.aw && c.aw.phase, why: c.aw && c.aw.why })) : [], ...AW_STATE });
export const awInternals = { awHorses, AW_POSTS, AW_STOP, AW_KERB, awSendCoach, awFanOff, awToCoach, MD_STATE };
