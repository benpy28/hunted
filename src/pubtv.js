// The telly in the pub: every pub in the three towns has a big TV over the bar, and when there's football
// on, the whole room is watching it.
//  - The Harriers live from the ground (the same goals, at the same minute, as the match up on Route 9),
//    and the COUNTY LEAGUE on other evenings and Sunday afternoons.
//  - With the match on, nobody in the pub is looking at anyone else. Stand at the back with the regulars and
//    you're just another groan when the keeper fumbles it. When a goal goes in, you vanish.
//  - In between games it's CHANNEL 9 NEWS. If they're running your sketch, a pub is the worst room to be in.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene } from './core.js';
import { worldHooks } from './world.js';
import { walkIns } from './streets.js';
import { newsMat } from './news.js';
import { MD_STATE, matchNow, opponentOn, mdInternals } from './matchday.js';
import { weekdayOf } from './townday.js';
import { lnFrame } from './launderette.js';

export const PTV_STATE = { goalsSeen: 0, cheered: 0, watchedT: 0, punters: 0, celebT: 0, newsT: 0, msgT: 0, lastGoal: null };
export const pubs = []; // {W, tv, mat, x, z, face, spots: [{x, z, face, taken}], rect}

// =====================================================================
// What's on: the Harriers live, or a county league game
// =====================================================================
const PT_TEAMS = [
  { n: 'KILNWORTH', s: 'KIL', c: '#e8d020' }, { n: 'BRACKEN VALE', s: 'BRV', c: '#2a7a3a' }, { n: 'MARLOW END', s: 'MAR', c: '#f0f0f0' },
  { n: 'FENWICK', s: 'FEN', c: '#6a2a8a' }, { n: 'SALTMARSH', s: 'SAL', c: '#2a5aa0' }, { n: 'PORT HALDEN CITY', s: 'PHC', c: '#6ab0e8' },
  { n: 'OSWALD PARK', s: 'OSW', c: '#e06a2a' }, { n: 'GREYWATER', s: 'GRY', c: '#8a8a90' }, { n: 'THORNLEY', s: 'THO', c: '#a01a2a' },
];
// county league on the telly: weekday (0 = Monday) and kick-off hour
const PT_SLOTS = [{ wd: 0, ko: 20 }, { wd: 2, ko: 19.5 }, { wd: 4, ko: 19.75 }, { wd: 6, ko: 13.5 }, { wd: 6, ko: 16.5 }];
const ptHash = (a, b, k = 0) => { const s = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
const ptGames = {};
function ptGame(day, ko) {
  const key = day + ':' + ko;
  if (!ptGames[key]) {
    const i = Math.floor(ptHash(day, ko) * PT_TEAMS.length); let j = Math.floor(ptHash(day, ko, 1) * PT_TEAMS.length); if (j === i) j = (j + 1) % PT_TEAMS.length;
    const n = Math.floor(ptHash(day, ko, 2) * 6), goals = [];
    for (let k = 0; k < n; k++) goals.push({ min: 2 + Math.floor(ptHash(day, ko, 10 + k) * 88), home: ptHash(day, ko, 20 + k) < 0.55 });
    goals.sort((a, b) => a.min - b.min);
    ptGames[key] = { key, home: PT_TEAMS[i], away: PT_TEAMS[j], goals, live: false };
  }
  return ptGames[key];
}
const ptPhase = (t) => (t < 0 ? 'pre' : t < 0.9 ? 'first' : t < 1.15 ? 'half' : t < 2.05 ? 'second' : t < 2.35 ? 'post' : null);
const ptMinute = (ph, t) => (ph === 'first' ? Math.floor(t / 0.9 * 45) + 1 : ph === 'half' ? 45 : ph === 'second' ? Math.min(90, 46 + Math.floor((t - 1.15) / 0.9 * 45)) : ph === 'post' ? 90 : 0);
// what the pubs are showing right now: { live, title, home, away, hs, as, minute, phase, goals } or null (the news)
export function tvNow(day, hr) {
  const M = matchNow(day, hr);
  if (M && M.on && M.phase !== 'none') {
    const R = MD_STATE.matches[day] || (mdInternals.matchRec ? mdInternals.matchRec(day) : null), opp = opponentOn(day);
    const hs = R ? R.home : 0, as = R ? R.away : 0;
    return { key: 'md' + day, live: true, title: 'LIVE FROM THE HARRIERS GROUND', home: { n: 'ASHFORD HARRIERS', s: 'HAR', c: '#c8202a' }, away: { n: opp.full, s: opp.name.slice(0, 3), c: '#' + opp.shirt.toString(16).padStart(6, '0') }, hs, as, minute: M.minute, phase: M.phase, harriers: true };
  }
  const wd = weekdayOf(day);
  for (const S of PT_SLOTS) {
    if (S.wd !== wd) continue;
    const t = hr - S.ko, ph = hr >= S.ko - 0.4 ? ptPhase(t) : null; if (!ph) continue;
    const g = ptGame(day, S.ko), min = ptMinute(ph, t);
    let hs = 0, as = 0; for (const q of g.goals) if (q.min <= min && ph !== 'pre') { if (q.home) hs++; else as++; }
    return { key: g.key, live: false, title: 'COUNTY LEAGUE · LIVE', home: g.home, away: g.away, hs, as, minute: min, phase: ph };
  }
  return null;
}
export const footballOn = (day, hr) => { const T = tvNow(day, hr); return !!T && T.phase !== 'pre' && T.phase !== 'post'; };

// =====================================================================
// The tellies themselves
// =====================================================================
const ptCanvas = document.createElement('canvas'); ptCanvas.width = 256; ptCanvas.height = 144;
const ptTex = new THREE.CanvasTexture(ptCanvas); ptTex.colorSpace = THREE.SRGBColorSpace;
const ptMat = new THREE.MeshBasicMaterial({ map: ptTex });
const ptBezel = new THREE.MeshLambertMaterial({ color: 0x141418 });
function buildPubs() {
  if (pubs.length) return;
  for (const W of walkIns) {
    if (W.kind !== 'bar' || W.home) continue;
    const F = lnFrame(W), mid = (F.A0 + F.A1) / 2, a = clamp(mid + 1.2, F.A0 + 1.4, F.A1 - 1.4);
    const [x, z] = F.toXZ(a, F.D - 0.33), face = F.inward + Math.PI; // on the back wall, looking out into the room
    const g = new THREE.Group(); g.position.set(x, 2.95, z); g.rotation.y = face;
    const bez = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 0.1), ptBezel); bez.position.z = -0.06; g.add(bez);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 1.04), newsMat); g.add(scr);
    scene.add(g);
    const spots = [];
    for (const [da, db] of [[-1.3, 3.0], [0, 3.4], [1.1, 2.8], [-0.6, 4.4], [0.7, 4.8], [-1.6, 5.4], [1.5, 4.0]]) {
      const sa = a + da, sb = F.D - 0.33 - db; if (sa < F.A0 + 2.3 || sa > F.A1 - 0.6 || sb < 1.2) continue; // (not behind the bar)
      const [sx, sz] = F.toXZ(sa, sb);
      spots.push({ x: sx, z: sz, face: Math.atan2(x - sx, z - sz), taken: null });
    }
    pubs.push({ W, g, scr, x, z, face, spots, rect: W.rect, city: W.city, name: W.name, F });
  }
}
worldHooks.afterBake.push(buildPubs);
export const pubAt = (x, z) => pubs.find((P) => x > P.rect.x0 && x < P.rect.x1 && z > P.rect.z0 && z < P.rect.z1) || null;

// draw the match: a high camera over the pitch, little players chasing the ball about, the score in the corner
const ptSim = { bx: 0.5, by: 0.5, tx: 0.5, ty: 0.5, t: 0, key: null, flash: 0, flashTxt: '' };
function ptDraw(T, K) {
  const x = ptCanvas.getContext('2d'), W = 256, H = 144;
  if (ptSim.key !== T.key) { ptSim.key = T.key; ptSim.bx = ptSim.by = ptSim.tx = ptSim.ty = 0.5; }
  if (T.phase === 'pre' || T.phase === 'half' || T.phase === 'post') { // the studio
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a2a5a'); g.addColorStop(1, '#0a1020'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#2a3a7a'; x.fillRect(0, 96, W, 48);
    for (const [px, col] of [[70, '#d8b080'], [128, '#a87050'], [186, '#e0c0a0']]) { x.fillStyle = '#2a2a3a'; x.fillRect(px - 16, 66, 32, 34); x.fillStyle = col; x.beginPath(); x.arc(px, 56, 11, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#f0f0f0'; x.font = 'bold 15px Arial'; x.textAlign = 'center';
    x.fillText(T.phase === 'pre' ? 'COMING UP' : T.phase === 'half' ? 'HALF TIME' : 'FULL TIME', W / 2, 20);
    x.font = 'bold 13px Arial'; x.fillText(`${T.home.n}  ${T.phase === 'pre' ? 'v' : T.hs + ' - ' + T.as}  ${T.away.n}`, W / 2, 122);
    x.font = '9px Arial'; x.fillText(T.title, W / 2, 136);
    ptTex.needsUpdate = true; return;
  }
  // the pitch
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#3a8a3a' : '#348034'; x.fillRect(i * W / 8, 0, W / 8, H); }
  x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1.2; x.strokeRect(8, 10, W - 16, H - 20);
  x.beginPath(); x.moveTo(W / 2, 10); x.lineTo(W / 2, H - 10); x.stroke(); x.beginPath(); x.arc(W / 2, H / 2, 16, 0, Math.PI * 2); x.stroke();
  x.strokeRect(8, H / 2 - 26, 26, 52); x.strokeRect(W - 34, H / 2 - 26, 26, 52);
  // the ball wanders between targets; a goal coming up sends it into the net
  ptSim.t += 1;
  if (Math.hypot(ptSim.bx - ptSim.tx, ptSim.by - ptSim.ty) < 0.03 || Math.random() < 0.02) { ptSim.tx = mr(0.08, 0.92); ptSim.ty = mr(0.15, 0.85); }
  ptSim.bx += (ptSim.tx - ptSim.bx) * 0.08; ptSim.by += (ptSim.ty - ptSim.by) * 0.08;
  const bx = 8 + ptSim.bx * (W - 16), by = 10 + ptSim.by * (H - 20);
  for (let side = 0; side < 2; side++) for (let k = 0; k < 11; k++) {
    const homeX = side ? 0.12 + ((k * 37) % 80) / 100 : 0.88 - ((k * 37) % 80) / 100, homeY = 0.1 + ((k * 53) % 80) / 100;
    const pull = k === 0 ? 0.05 : 0.35 + ((k * 7) % 4) * 0.08;
    const px = 8 + ((side ? (k === 0 ? 0.03 : homeX) : (k === 0 ? 0.97 : homeX)) * (1 - pull) + ptSim.bx * pull) * (W - 16) + Math.sin(ptSim.t * 0.1 + k + side * 5) * 3;
    const py = 10 + (homeY * (1 - pull) + ptSim.by * pull) * (H - 20) + Math.cos(ptSim.t * 0.13 + k * 2) * 3;
    x.fillStyle = k === 0 ? '#e0e020' : side ? T.home.c : T.away.c; x.fillRect(px - 2, py - 2, 4, 4);
  }
  x.fillStyle = '#fff'; x.beginPath(); x.arc(bx, by, 1.8, 0, Math.PI * 2); x.fill();
  // the score bug
  x.fillStyle = 'rgba(10,10,30,.85)'; x.fillRect(4, 3, 112, 15);
  x.fillStyle = T.home.c; x.fillRect(4, 3, 3, 15); x.fillStyle = T.away.c; x.fillRect(113, 3, 3, 15);
  x.fillStyle = '#fff'; x.font = 'bold 10px Arial'; x.textAlign = 'left'; x.fillText(`${T.home.s} ${T.hs}-${T.as} ${T.away.s}`, 10, 14);
  x.fillStyle = '#ffe070'; x.fillText(`${T.minute}'`, 88, 14);
  if (T.live) { x.fillStyle = '#d02020'; x.fillRect(W - 34, 4, 30, 12); x.fillStyle = '#fff'; x.font = 'bold 9px Arial'; x.fillText('LIVE', W - 30, 13); }
  if (ptSim.flash > 0) { x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, H / 2 - 18, W, 36); x.fillStyle = '#ffe070'; x.font = 'bold 26px Arial Black, Arial'; x.textAlign = 'center'; x.fillText(ptSim.flashTxt, W / 2, H / 2 + 9); }
  ptTex.needsUpdate = true;
}

// =====================================================================
// The regulars: they come in for the game and stand about in front of the telly
// =====================================================================
const PT_GOAL_HOME = ['GET IN!', 'YESSS!', 'WHAT A GOAL!', 'HAVE THAT!', 'GO ON, SON!', 'I TOLD YOU! DIDN\'T I TELL YOU?'];
const PT_GOAL_AWAY = ['OH, COME ON!', 'WHERE WAS THE DEFENCE?', 'WAKE UP, KEEPER!', 'THAT\'S A FOUL, THAT!', '*GROANS*', 'TYPICAL'];
const PT_IDLE = ['SHOOT!', 'REF! REF!', 'HE\'S OFFSIDE, LOOK!', 'PASS IT!', 'MY NAN COULD\'VE SCORED THAT', 'SAME AGAIN, PLEASE', 'WHO\'S THAT? NEVER HEARD OF HIM', 'GET IT FORWARD!', 'ROUND OF APPLAUSE FOR THAT, THAT WAS RUBBISH'];
function ptFreeSpot(P) { const f = P.spots.filter((s) => !s.taken || s.taken.dead || !s.taken.ptv); return f.length ? mpick(f) : null; }
function ptSendIn(h, P, K) {
  const s = ptFreeSpot(P); if (!s) return false;
  s.taken = h; h.ptv = P; h.ptvSpot = s; h.job = null;
  const route = P.W.path.map(([x, z]) => [x, z]);
  const inside = h.x > P.rect.x0 && h.x < P.rect.x1 && h.z > P.rect.z0 && h.z < P.rect.z1;
  return K.lifeGo(h, 'watch', s.x + mr(-0.2, 0.2), s.z + mr(-0.2, 0.2), s.face, mr(60, 120), inside ? { maxT: 60 } : { route, ri: 0, maxT: 80 });
}
function ptFolk(P, K) { return K.hunters().filter((h) => !h.dead && h.ptv === P); }

// =====================================================================
// Each frame
// =====================================================================
function ptUpdate(dt, K) {
  if (!pubs.length) return;
  const day = K.G.day, hr = K.hour, T = tvNow(day, hr), P = K.player;
  PTV_STATE.celebT = Math.max(0, PTV_STATE.celebT - dt); ptSim.flash = Math.max(0, ptSim.flash - dt);
  // goals: the same for every telly, cheers in whichever pub you're near
  const tot = T ? T.hs + T.as : 0;
  if (T && T.phase !== 'pre') {
    if (PTV_STATE.lastGoal && PTV_STATE.lastGoal.key === T.key && tot > PTV_STATE.lastGoal.n) {
      const homeScored = T.hs > PTV_STATE.lastGoal.hs; PTV_STATE.lastGoal = { key: T.key, n: tot, hs: T.hs };
      ptSim.flash = 2.5; ptSim.flashTxt = 'GOAL!'; ptSim.tx = homeScored ? 0.99 : 0.01; ptSim.ty = 0.5;
      const near = pubAt(P.x, P.z) || pubs.find((Q) => K.near(Q.x, Q.z, 22));
      if (near) {
        PTV_STATE.goalsSeen++; PTV_STATE.celebT = 6;
        const folk = ptFolk(near, K); const fav = T.harriers ? homeScored : Math.random() < 0.6 ? homeScored : !homeScored;
        for (const h of folk) if (Math.random() < 0.7) K.say(h, mpick(fav ? PT_GOAL_HOME : PT_GOAL_AWAY));
        if (K.sfx[fav ? 'cheer' : 'sigh']) K.sfx[fav ? 'cheer' : 'sigh']();
        if (pubAt(P.x, P.z) === near) K.showMsg(`GOAL! ${T.home.s} ${T.hs}-${T.as} ${T.away.s}. THE WHOLE PUB IS ON ITS FEET`, 2.4);
      }
    } else if (!PTV_STATE.lastGoal || PTV_STATE.lastGoal.key !== T.key) PTV_STATE.lastGoal = { key: T.key, n: tot, hs: T.hs };
  }
  // which picture: football or the news
  const showFootball = !!T;
  for (const Q of pubs) { const m = showFootball ? ptMat : newsMat; if (Q.scr.material !== m) Q.scr.material = m; }
  const inPub = pubAt(P.x, P.z);
  if (showFootball && pubs.some((Q) => K.near(Q.x, Q.z, 40))) { PTV_STATE.drawT = (PTV_STATE.drawT || 0) - dt; if (PTV_STATE.drawT <= 0) { PTV_STATE.drawT = inPub ? 0.1 : 0.5; ptDraw(T, K); } }
  // the regulars, for the pub you're in or next to
  PTV_STATE.folkT = (PTV_STATE.folkT || 0) - dt;
  if (PTV_STATE.folkT <= 0) {
    PTV_STATE.folkT = 1;
    const active = T && T.phase !== 'post';
    for (const Q of pubs) {
      const folk = ptFolk(Q, K);
      if (!active) { for (const h of folk) { h.ptv = null; if (h.ptvSpot) h.ptvSpot.taken = null; h.ptvSpot = null; } continue; }
      if (!K.near(Q.x, Q.z, 45)) continue;
      const want = Math.min(Q.spots.length, T.harriers ? 6 : 4 + (hr >= 19 ? 1 : 0));
      if (folk.length < want && Math.random() < 0.7) { const h = K.spawnCivAt(Q.W.path[0][0], Q.W.path[0][1]); if (h) { ptSendIn(h, Q, K); PTV_STATE.punters++; } }
      for (const h of folk) if (!h.act && h.state !== 'chase' && !(h.panicT > 0)) ptSendIn(h, Q, K);
      if (inPub === Q && T.phase !== 'pre' && T.phase !== 'half' && Math.random() < 0.12) { const w = folk.filter((h) => h.act && h.act.kind === 'watch'); if (w.length) K.say(mpick(w), mpick(PT_IDLE)); }
    }
  }
  // you, in the pub, with the game on
  if (inPub && T && T.phase !== 'pre') PTV_STATE.watchedT += dt;
  if (inPub && !T && K.G.level >= 2) {
    PTV_STATE.newsT = (PTV_STATE.newsT || 0) + dt;
    if (PTV_STATE.newsT > 4 && PTV_STATE.msgT <= 0) { PTV_STATE.msgT = 20; K.showMsg('YOUR FACE IS ON THE PUB TELLY. SOMEONE AT THE BAR IS LOOKING FROM IT TO YOU', 2.6); K.bumpLocal(0.04); }
  } else PTV_STATE.newsT = 0;
  PTV_STATE.msgT = Math.max(0, PTV_STATE.msgT - dt);
}
function ptConspic(K) {
  const P = K.player; if (P.car) return 0;
  const Q = pubAt(P.x, P.z); if (!Q) return 0;
  const T = tvNow(K.G.day, K.hour);
  if (!T) return K.G.level >= 2 ? 0.08 : 0; // the news, with your face on it
  if (T.phase === 'pre' || T.phase === 'post') return -0.08;
  return (T.phase === 'half' ? -0.12 : -0.26) - (PTV_STATE.celebT > 0 ? 0.14 : 0) - (P.outfit.hat === 'md_bobble' || P.outfit.neck === 'md_scarf' ? 0.06 : 0);
}
function ptPlan(h, hr, K) {
  if (!h.ptv) return false;
  const T = tvNow(K.G.day, hr);
  if (!T || T.phase === 'post') { if (h.ptvSpot) h.ptvSpot.taken = null; h.ptv = null; h.ptvSpot = null; return false; }
  return ptSendIn(h, h.ptv, K);
}
export const pubTV = {
  name: 'pubtv', roofs: [],
  useTarget: () => null, usePrompt: () => '', use: () => {},
  conspic: ptConspic, update: ptUpdate, plan: ptPlan, ride: () => false,
  reset() { PTV_STATE.goalsSeen = 0; PTV_STATE.cheered = 0; PTV_STATE.watchedT = 0; PTV_STATE.punters = 0; PTV_STATE.celebT = 0; PTV_STATE.lastGoal = null; for (const Q of pubs) for (const s of Q.spots) s.taken = null; },
  diary(K) { const T = tvNow(K.G.day, K.hour); return T && T.phase !== 'post' ? [`ON THE PUB TELLY: ${T.home.n} v ${T.away.n}`] : []; },
  debug: (K) => ({ pubs: pubs.length, spots: pubs.reduce((s, Q) => s + Q.spots.length, 0), tv: K ? tvNow(K.G.day, K.hour) : null, ...PTV_STATE }),
  tvNow, footballOn, pubAt, pubs, PT_SLOTS, ptGame, PTV_STATE, ptMat,
};
