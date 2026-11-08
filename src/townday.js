// The town's week: what day it is, who's out and about at what hour, and what's on.
//  - Day 1 is a Friday. Weekdays have rush hours (office types pour out at 8 and 5), a school run in
//    ASHFORD, dock shifts at SALTMARSH. Weekends are lie-ins, shopping, families and the park.
//  - Each kind of townsperson keeps their own hours: pensioners are out early and home by dark, teens
//    vanish into school and flood the arcade at half three, dockers start at six and finish in the pub,
//    fishers are up before the gulls, office workers queue for coffee then disappear until lunch.
//  - Big market days: every stall staffed and the whole town turns up (easier than ever to get lost in).
//  - The HALDEN FUN RUN on Sundays: hundreds of runners in numbered bibs round the Spire. Grab a bib at
//    the start table and nobody looks twice at someone running. Finish a lap for a medal.
//  - The ASHFORD VILLAGE FETE on Saturdays on the school field: bunting, a tombola, a cake stall, a brass
//    band and half the village.
//  - PUB QUIZ NIGHT on Thursdays: the bars are packed and everybody's looking at the quizmaster.
//  - Your diary (pause, or J) shows today's and tomorrow's events, and the perks you've earned.
import * as THREE from '../vendor/three.module.min.js';
import { mr, mpick, clamp, scene, textTex } from './core.js';
import { CITIES, RD, SW, blockedAt } from './world.js';
import { walkIns } from './streets.js';
import { routineWants, lifeLap } from './citylife.js';
import { MK_STATE, markets, marketStalls, marketOpen } from './market.js';
import { GJ_STATE, REGULARS } from './gigs.js';
import { lam } from './people.js';
import { KD_STATE, kids, schoolInfo, sendToSchool, sendToPlayground, playgrounds } from './kids.js';

export const TD_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export const weekdayOf = (day) => (day + 3) % 7; // day 1 is a Friday
export const dayNameOf = (day) => TD_DAYS[weekdayOf(day)];
export const isWeekend = (day) => weekdayOf(day) >= 5;
export const isSchoolDay = (day) => weekdayOf(day) < 5;
export const TD_STATE = { bibDay: 0, lapCorners: 0, medals: 0, medalDay: 0, tombola: 0, cakes: 0, quizzes: 0, announced: {}, racers: 0, feteFolk: 0, lastDay: 0 };

// =====================================================================
// The calendar
// =====================================================================
const fmtHr = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); const h12 = ((hh + 11) % 12) + 1; return mm ? `${h12}:${String(mm).padStart(2, '0')}` : `${h12}`; };
export const TD_EVENTS = [
  { id: 'market', town: 'PORT HALDEN', days: [2, 5], from: 7, to: 18, name: 'BIG MARKET DAY', where: 'HALDEN COMMONS', blurb: 'Every stall open and the whole town turns up. Easy to get lost in the crowd.' },
  { id: 'market', town: 'ASHFORD', days: [3, 6], from: 7, to: 18, name: 'VILLAGE MARKET DAY', where: 'THE WATER TOWER', blurb: 'Every stall open, and every pensioner in Ashford with a shopping trolley.' },
  { id: 'market', town: 'SALTMARSH DOCKS', days: [0, 4], from: 7, to: 18, name: 'BIG FISH MARKET', where: 'THE QUAY', blurb: 'The catch is in. Every stall open and the quay heaving.' },
  { id: 'funrun', town: 'PORT HALDEN', days: [6], from: 9, to: 12, name: 'HALDEN FUN RUN', where: 'ROUND THE SPIRE', blurb: 'Runners in numbered bibs everywhere. Grab a bib at the start table and nobody looks twice at you running.' },
  { id: 'fete', town: 'ASHFORD', days: [5], from: 11, to: 17, name: 'ASHFORD VILLAGE FETE', where: 'THE SCHOOL FIELD', blurb: 'Bunting, a tombola, a cake stall and a brass band. Half the village is there.' },
  { id: 'quiz', town: null, days: [3], from: 19, to: 23, name: 'PUB QUIZ NIGHT', where: 'EVERY BAR IN TOWN', blurb: 'The bars are packed and everyone is staring at the quizmaster, not at you.' },
  { id: 'school', town: 'ASHFORD', days: [0, 1, 2, 3, 4], from: 8, to: 15.5, name: 'SCHOOL DAY', where: 'ASHFORD PRIMARY', blurb: 'School run 8 till 9, home time at 3. Kids have sharp eyes.' },
];
export const eventsOn = (day) => TD_EVENTS.filter((E) => E.days.includes(weekdayOf(day)));
export const eventOn = (id, town, day, hr) => TD_EVENTS.find((E) => E.id === id && (!town || !E.town || E.town === town) && E.days.includes(weekdayOf(day)) && (hr === undefined || (hr >= E.from && hr < E.to))) || null;
export const eventTime = (E) => `${fmtHr(E.from)}-${fmtHr(E.to)}`;

// =====================================================================
// Who's about at what hour
// =====================================================================
// how much more (or less) likely each kind of townsperson is to be out on the street right now
export function folkMix(hr, day) {
  const we = isWeekend(day), sun = weekdayOf(day) === 6, sch = isSchoolDay(day);
  const night = hr < 6 || hr >= 23;
  const m = {};
  m.office = we ? (hr >= 10 && hr < 18 ? 0.35 : 0.2) : night ? 0.1 : hr < 7 ? 0.4 : hr < 9.5 ? 2.4 : hr < 12 ? 0.55 : hr < 14 ? 1.7 : hr < 17 ? 0.55 : hr < 19 ? 2.1 : 0.6;
  const inSchool = sch && hr >= 8.9 && hr < 15.2;
  m.teen = night ? 0.15 : inSchool ? 0.15 : hr < 8.9 ? (sch ? 1.4 : 0.3) : hr < 19 ? 2.2 : 1.3;
  m.student = night ? 0.5 : inSchool ? 0.7 : hr < 10 ? 0.4 : 1.5;
  m.pensioner = night || hr >= 20 ? 0.05 : hr < 6.5 ? 0.3 : hr < 12 ? 1.9 : hr < 17 ? 1.2 : 0.45;
  m.parent = night || hr >= 21 ? 0.05 : sch && hr >= 7.8 && hr < 9.2 ? 2.2 : sch && hr >= 14.7 && hr < 16 ? 2.2 : hr < 7.5 ? 0.3 : we ? 1.6 : 1.0;
  m.shopper = night ? 0.1 : hr < 8.5 ? 0.4 : hr < 18 ? (we ? 1.7 : 1.1) : hr < 20 ? 0.6 : 0.2;
  m.docker = sun ? 0.3 : night ? 0.35 : hr < 7 ? 2.2 : hr < 14 ? 1.0 : hr < 16 ? 1.9 : hr < 22 ? 0.9 : 0.4;
  m.fisher = hr < 3 ? 0.4 : hr < 9 ? 2.3 : hr < 14 ? 1.0 : hr < 22 ? 0.6 : 0.3;
  m.chef = hr >= 9 && hr < 11 ? 1.7 : hr >= 22 && hr < 24 ? 1.4 : 0.6;
  m.gardener = hr >= 8 && hr < 17 ? (we ? 1.9 : 1.4) : 0.15;
  m.tourist = hr >= 10 && hr < 18 ? (we ? 1.7 : 1.4) : hr >= 18 && hr < 22 ? 0.8 : 0.15;
  m.smart = hr >= 18 && hr < 23.5 ? 1.8 : night ? 0.6 : 1.0;
  return m;
}
// how busy the streets are at this hour (rush hours and events busy, the small hours quiet)
export function crowdMul(hr, day, town) {
  let k = hr < 5 ? 0.62 : hr < 7 ? 0.78 : hr < 9.5 ? 1.12 : hr < 12 ? 0.96 : hr < 14 ? 1.1 : hr < 16.5 ? 0.97 : hr < 19 ? 1.12 : hr < 23 ? 0.95 : 0.75;
  if (isWeekend(day) && hr >= 10 && hr < 18) k += 0.05;
  for (const E of TD_EVENTS) if (E.id !== 'school' && E.days.includes(weekdayOf(day)) && hr >= E.from && hr < E.to && (!E.town || E.town === town)) k += E.id === 'quiz' ? 0.05 : 0.15;
  return k;
}
// what someone fancies doing next, by who they are and the hour
export function folkWants(h, hr, day) {
  const f = h.folk, we = isWeekend(day), sch = isSchoolDay(day);
  let w;
  if (f === 'office' && !we && hr >= 7 && hr < 19) w = hr < 9.5 ? { eat: 0.55, bus: 0.3, browse: 0.1 } : hr >= 12 && hr < 14 ? { eat: 0.7, browse: 0.2, sit: 0.1 } : hr >= 17 ? { drink: 0.45, bus: 0.3, eat: 0.2 } : { eat: 0.3, browse: 0.2, sit: 0.1 };
  else if (f === 'pensioner') w = hr < 6.5 ? { home: 0.9 } : hr < 12 ? { browse: 0.35, sit: 0.35, eat: 0.15, wait: 0.1, bus: 0.05 } : hr < 17 ? { sit: 0.4, eat: 0.2, browse: 0.2, home: 0.2 } : { home: 0.85, drink: 0.15 };
  else if (f === 'teen') w = hr < 6 ? { home: 0.9 } : sch && hr >= 8.9 && hr < 15.2 ? { home: 0.5, play: 0.3, eat: 0.2 } : hr < 21 ? { play: 0.45, eat: 0.3, browse: 0.15, sit: 0.1 } : { home: 0.7, play: 0.3 };
  else if (f === 'student') w = hr < 6 ? { home: 0.6, drink: 0.4 } : hr < 12 ? { eat: 0.5, browse: 0.3, sit: 0.2 } : hr < 18 ? { browse: 0.3, eat: 0.3, play: 0.2, sit: 0.2 } : { drink: 0.55, eat: 0.25, play: 0.2 };
  else if (f === 'docker') w = hr < 5.5 ? { home: 0.7, drink: 0.3 } : hr < 14 ? { work: 0.75, eat: 0.25 } : hr < 21 ? { drink: 0.5, eat: 0.3, home: 0.2 } : { home: 0.6, drink: 0.4 };
  else if (f === 'fisher') w = hr < 3 ? { home: 0.8, drink: 0.2 } : hr < 10 ? { work: 0.6, eat: 0.4 } : hr < 19 ? { drink: 0.4, sit: 0.3, eat: 0.3 } : { home: 0.6, drink: 0.4 };
  else if (f === 'chef') w = hr >= 9 && hr < 23 ? { eat: 0.7, browse: 0.2, sit: 0.1 } : { home: 0.8, drink: 0.2 };
  else if (f === 'gardener') w = hr >= 8 && hr < 18 ? { browse: 0.35, sit: 0.35, eat: 0.3 } : { home: 0.9, drink: 0.1 };
  else if (f === 'tourist') w = hr >= 9 && hr < 19 ? { browse: 0.35, eat: 0.3, sit: 0.2, play: 0.15 } : { eat: 0.4, drink: 0.4, home: 0.2 };
  else if (f === 'parent' || f === 'shopper') w = hr < 7 || hr >= 21 ? { home: 0.9 } : hr < 12 ? { browse: 0.5, eat: 0.2, wait: 0.15, sit: 0.15 } : hr < 18 ? { browse: 0.4, eat: 0.3, sit: 0.2, wait: 0.1 } : { eat: 0.4, home: 0.5, drink: 0.1 };
  else w = { ...routineWants(hr) };
  w = { ...w };
  if (h.kid || h.pram) { delete w.drink; delete w.play; delete w.work; if (hr >= 9.3 && hr < 18) w.playground = h.kid ? 0.45 : 0; } // no pub with the kids
  if (h.kid && sch && hr >= 7.8 && hr < 9.1 && schoolInfo.gate && Math.hypot(h.x - schoolInfo.gate.x, h.z - schoolInfo.gate.z) < 300) w.school = 3;
  if (eventOn('quiz', null, day, hr) && w.drink) w.drink *= 2.5;
  return w;
}

// =====================================================================
// The fun run
// =====================================================================
export const funRun = { route: [], start: null, table: null, corners: [], group: null, city: 'PORT HALDEN' };
const BIB_TEX = [];
function bibTex(n) { if (!BIB_TEX[n % 8]) BIB_TEX[n % 8] = textTex(64, 48, '#ffffff', '#c8202a', [String(100 + (n % 8) * 37)], 'bold 26px Arial Black, Arial', false); return BIB_TEX[n % 8]; }
function buildFunRun() {
  const c = CITIES.find((q) => q.name === funRun.city); if (!c) return;
  const mid = c.n / 2;
  const x0 = c.Rx(mid - 1) + RD / 2 + 1.5, x1 = c.Rx(mid + 1) - RD / 2 - 1.5, z0 = c.Rz(mid - 1) + RD / 2 + 1.5, z1 = c.Rz(mid + 1) - RD / 2 - 1.5;
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const route = [];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 12);
    for (let i = 0; i < n; i++) route.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]);
  }
  funRun.route = route; funRun.corners = corners;
  const sx = (x0 + c.Rx(mid) - RD / 2) / 2; funRun.start = { x: sx, z: z0 }; funRun.table = { x: sx + 2.2, z: z0 - 1.0 };
  // an inflatable arch over the start line and a table of bibs (only up on the day)
  const g = new THREE.Group(), box = (w, h, d, x, y, z, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(col)); m.position.set(x, y, z); g.add(m); return m; };
  for (const dz of [-1.9, 1.9]) box(0.7, 3.6, 0.7, sx, 1.95, z0 + dz, 0xe02a2a);
  box(0.7, 0.8, 4.5, sx, 3.9, z0, 0xe02a2a);
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.6), new THREE.MeshBasicMaterial({ map: textTex(512, 96, '#ffffff', '#c8202a', ['HALDEN FUN RUN'], 'bold 56px Arial Black, Arial', false) }));
  ban.position.set(sx - 0.36, 3.9, z0); ban.rotation.y = -Math.PI / 2; g.add(ban);
  const ban2 = ban.clone(); ban2.position.x = sx + 0.36; ban2.rotation.y = Math.PI / 2; g.add(ban2);
  const T = funRun.table;
  box(1.8, 0.06, 0.7, T.x, 0.9, T.z, 0xf0f0f0); for (const [a, b] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]]) box(0.05, 0.75, 0.05, T.x + a, 0.52, T.z + b, 0x8a8a92);
  for (let k = 0; k < 5; k++) box(0.25, 0.02, 0.2, T.x - 0.6 + k * 0.3, 0.94, T.z, 0xffffff);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: textTex(256, 64, '#c8202a', '#ffffff', ['BIBS HERE'], 'bold 36px Arial Black, Arial', false) }));
  sign.position.set(T.x, 1.25, T.z); g.add(sign); const back = sign.clone(); back.rotation.y = Math.PI; g.add(back); // readable from both sides
  g.visible = false; scene.add(g); funRun.group = g;
}
function giveBib(h, n) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), new THREE.MeshBasicMaterial({ map: bibTex(n) }));
  m.position.set(0, 0.02, 0.215); h.p.torso.add(m); h.bib = m;
}
const RACER_LINES = ['NEARLY THERE!', 'MY LEGS!', 'KEEP GOING!', 'WHO PUT THIS HILL HERE?', 'PERSONAL BEST!', 'WATER! WATER!', 'NEVER AGAIN', 'GO ON, GRANDAD!'];
const CHEER_LINES = ['GO ON!', 'KEEP GOING!', 'YOU CAN DO IT!', 'NEARLY THERE!', 'COME ON, DAVE!', 'WOOO!'];
function updateFunRun(dt, K, on) {
  const P = K.player;
  if (funRun.group) funRun.group.visible = !!eventOn('funrun', funRun.city, K.G.day);
  const near = funRun.start && K.near(funRun.start.x, funRun.start.z, 240);
  const racers = K.hunters().filter((h) => h.racer && !h.dead);
  for (const h of racers) {
    if (!on) { if (h.lapRoute) { h.lapRoute = null; h.job = null; h.walkK = 1; } continue; }
    if (!h.act && h.state !== 'chase' && !(h.panicT > 0)) lifeLap(h, funRun.route);
    h.racerLineT = (h.racerLineT ?? mr(5, 25)) - dt;
    if (h.racerLineT <= 0) { h.racerLineT = mr(12, 35); if (K.near(h.x, h.z, 25)) K.say(h, mpick(RACER_LINES)); }
  }
  TD_STATE.racers = racers.length;
  if (on && near && racers.length < 26) {
    const close = funRun.route.filter(([x, z]) => Math.hypot(x - P.x, z - P.z) < 90); // the stretch of course near you is the busy bit
    const R = close.length && Math.random() < 0.8 ? mpick(close) : funRun.route[Math.floor(Math.random() * funRun.route.length)];
    const h = K.spawnCivAt(R[0], R[1]);
    if (h) { h.racer = true; h.job = 'jogger'; h.walkK = mr(1.9, 2.5); h.lapRoute = funRun.route; giveBib(h, Math.floor(Math.random() * 1000)); lifeLap(h, funRun.route); }
  }
  // you, with a bib on: round the course for a medal
  if (on && TD_STATE.bibDay === K.G.day && TD_STATE.medalDay !== K.G.day && !P.car) {
    const ci = TD_STATE.lapCorners;
    if (ci < 4) { const [cx, cz] = funRun.corners[ci]; if (Math.hypot(P.x - cx, P.z - cz) < 6) { TD_STATE.lapCorners++; K.showMsg(['FIRST CORNER!', 'HALFWAY!', 'LAST STRETCH!', 'ONE MORE CORNER!'][ci], 1.4); } }
    else if (Math.hypot(P.x - funRun.start.x, P.z - funRun.start.z) < 5) {
      TD_STATE.medalDay = K.G.day; TD_STATE.medals++; K.addCash(15); P.hp = Math.min(100, P.hp + 15); K.sfx.cheer();
      K.banner('<small>HALDEN FUN RUN</small>YOU FINISHED!<small>A MEDAL, A BANANA AND $15 SPONSOR MONEY</small>', 3.5);
    }
  }
}
export function onFunRunCourse(x, z) {
  if (!funRun.corners.length) return false;
  const [[x0, z0], , [x1, z1]] = funRun.corners;
  const inX = x > x0 - 3 && x < x1 + 3, inZ = z > z0 - 3 && z < z1 + 3;
  return inX && inZ && (Math.abs(x - x0) < 3 || Math.abs(x - x1) < 3 || Math.abs(z - z0) < 3 || Math.abs(z - z1) < 3);
}

// =====================================================================
// The village fete
// =====================================================================
export const fete = { group: null, tombola: null, cakes: null, band: null, spots: [] };
function buildFete() {
  const F = schoolInfo.field; if (!F) return;
  const g = new THREE.Group(), box = (w, h, d, x, y, z, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(col)); m.position.set(x, y, z); g.add(m); return m; };
  const flagCols = [0xe02a2a, 0xf0f0f0, 0x2a5ae0, 0xf0d030, 0x3ac85a];
  // bunting strung between poles round the field
  const poles = [[F.x0, F.z0], [F.x1, F.z0], [F.x1, F.z1], [F.x0, F.z1]];
  for (const [x, z] of poles) box(0.1, 4, 0.1, x, 2, z, 0xb8b8c0);
  for (let k = 0; k < 4; k++) {
    const [ax, az] = poles[k], [bx, bz] = poles[(k + 1) % 4], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 0.7);
    for (let i = 1; i < n; i++) { const t = i / n, sag = Math.sin(t * Math.PI) * 0.8; const f = box(0.3, 0.32, 0.3, ax + (bx - ax) * t, 3.8 - sag - 0.2, az + (bz - az) * t, flagCols[i % flagCols.length]); f.scale.set(Math.abs(bx - ax) > 0.1 ? 1 : 0.1, 1, Math.abs(bx - ax) > 0.1 ? 0.1 : 1); }
  }
  // a stripy tent for the tombola, a cake table, and a little bandstand
  const stall = (x, z, col, label) => {
    box(2.6, 0.06, 1.0, x, 0.9, z, 0xf0f0e8); box(2.6, 0.8, 0.04, x, 0.5, z + 0.5, col);
    for (const [a, b] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.6], [1.3, 0.6]]) box(0.06, 2.4, 0.06, x + a, 1.35, z + b, 0xd0d0d8);
    for (let k = 0; k < 6; k++) box(0.45, 0.06, 1.5, x - 1.15 + k * 0.46, 2.55, z, k % 2 ? 0xf0f0f0 : col);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.4), new THREE.MeshBasicMaterial({ map: textTex(256, 52, '#ffffff', '#2a2a2a', [label], 'bold 30px Arial Black, Arial', false) }));
    s.position.set(x, 2.15, z + 0.78); g.add(s); const b = s.clone(); b.rotation.y = Math.PI; b.position.z -= 0.01; g.add(b);
    return { x, z: z + 1.3, sx: x, sz: z };
  };
  fete.tombola = stall(F.x - 5, F.z0 + 3, 0x2a5ae0, 'TOMBOLA $2');
  for (let k = 0; k < 7; k++) box(0.14, 0.2, 0.14, F.x - 6 + k * 0.32, 1.03, F.z0 + 3, flagCols[k % 5]);
  fete.cakes = stall(F.x + 5, F.z0 + 3, 0xe07ad0, 'HOMEMADE CAKES');
  for (let k = 0; k < 4; k++) { const cx = F.x + 4 + k * 0.6; box(0.4, 0.22, 0.4, cx, 1.04, F.z0 + 3, [0xf0d8a0, 0x8a4a2a, 0xf0f0f0, 0xe07ad0][k]); }
  box(4, 0.4, 3, F.x, 0.35, F.z1 - 3, 0xb8a080); fete.band = { x: F.x, z: F.z1 - 3 };
  // a bouncy castle (decorative: please remove your shoes)
  const bx = F.x0 + 4, bz = F.z1 - 4;
  box(4, 1, 4, bx, 0.7, bz, 0xe02a2a); for (const [a, b] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.4, 10), lam(0x2a5ae0)); t.position.set(bx + a, 1.4, bz + b); g.add(t); }
  for (let i = 0; i < 18; i++) fete.spots.push({ x: F.x0 + 3 + Math.random() * (F.x1 - F.x0 - 6), z: F.z0 + 6 + Math.random() * (F.z1 - F.z0 - 12) });
  g.visible = false; scene.add(g); fete.group = g;
}
const FETE_LINES = ['LOVELY DAY FOR IT', 'HAVE YOU TRIED THE LEMON DRIZZLE?', 'I WON A BOTTLE OF SHAMPOO!', 'THE BAND\'S GOT BETTER', 'GUESS THE WEIGHT OF THE CAKE?', 'IS THAT THE VICAR ON THE BOUNCY CASTLE?'];
const TOMBOLA_PRIZES = [
  { msg: 'A BOTTLE OF BUBBLE BATH. LUXURY', give: null },
  { msg: 'A TIN OF BISCUITS (+15)', give: (K) => { K.player.hp = Math.min(100, K.player.hp + 15); } },
  { msg: 'A BAG OF PICK AND MIX (5 SWEETS)', give: () => { MK_STATE.sweets = (MK_STATE.sweets || 0) + 5; } },
  { msg: '$20 BOOK TOKEN. THE BOOKSHOP TAKES IT AS CASH', give: (K) => K.addCash(20) },
  { msg: 'A KNITTED BOBBLE HAT', give: (K) => K.wear('mk_bobble') },
  { msg: 'A STRING OF BANGERS (2)', give: (K) => { K.addJunk('banger'); K.addJunk('banger'); } },
  { msg: 'A WIND-UP ALARM CLOCK', give: (K) => K.addJunk('clock') },
  { msg: 'A RAFFLE TICKET FOR ANOTHER RAFFLE', give: null },
  { msg: 'A JAR OF SOMEONE\'S CHUTNEY', give: null },
];
function updateFete(dt, K, on) {
  if (fete.group) fete.group.visible = !!eventOn('fete', 'ASHFORD', K.G.day);
  if (!on || !schoolInfo.field) return;
  const F = schoolInfo.field;
  if (!K.near(F.x, F.z, 200)) return;
  // the village turns out: keep a crowd on the field
  TD_STATE.feteT = (TD_STATE.feteT || 0) - dt;
  if (TD_STATE.feteT > 0) return; TD_STATE.feteT = 1.5;
  const folk = K.hunters().filter((h) => h.feteGoer && !h.dead);
  TD_STATE.feteFolk = folk.length;
  for (const h of folk) if (!h.act && h.state !== 'chase' && !(h.panicT > 0)) feteActivity(h, K);
  if (folk.length < 16) {
    const s = mpick(fete.spots), h = K.spawnCivAt(s.x, s.z);
    if (h) { h.feteGoer = true; h.home = { x: F.x, z: F.z }; if (folk.length < 3) { h.job = 'busker'; h.bandsman = true; } feteActivity(h, K); }
  }
}
function feteActivity(h, K) {
  const F = schoolInfo.field;
  if (h.bandsman) { const B = fete.band; return K.lifeGo(h, 'busk', B.x + mr(-1.5, 1.5), B.z + mr(-1, 1), 0, mr(60, 120)); }
  const r = Math.random();
  if (r < 0.25) return K.lifeGo(h, 'browse', fete.tombola.x + mr(-1, 1), fete.tombola.z + mr(0, 0.6), Math.PI, mr(8, 20), { stall: fete.tombola });
  if (r < 0.45) return K.lifeGo(h, 'eat', fete.cakes.x + mr(-1, 1), fete.cakes.z + mr(0, 0.8), Math.PI, mr(10, 25));
  if (r < 0.65) return K.lifeGo(h, 'cheer', fete.band.x + mr(-4, 4), fete.band.z - mr(2.5, 5), 0, mr(10, 30));
  const s = mpick(fete.spots); if (Math.random() < 0.3 && K.near(h.x, h.z, 30)) K.say(h, mpick(FETE_LINES));
  return K.lifeGo(h, 'watch', s.x, s.z, Math.random() * 6.28, mr(10, 30));
}

// =====================================================================
// What townsfolk do because of the calendar
// =====================================================================
export function tdPlan(h, hr, K) {
  const day = K.G.day;
  if (h.racer) return false;
  if (h.feteGoer) return eventOn('fete', 'ASHFORD', day, hr) ? feteActivity(h, K) : false;
  if (h.job && h.job !== 'tourist') return false;
  // the school run
  if (h.kid && isSchoolDay(day) && hr >= 7.8 && hr < 9.1 && schoolInfo.gate && Math.hypot(h.x - schoolInfo.gate.x, h.z - schoolInfo.gate.z) < 300) return sendToSchool(h, K);
  // big market day: everybody nearby goes for a look round the stalls
  for (const M of markets) {
    if (Math.abs(M.x - h.x) > 140 || Math.abs(M.z - h.z) > 140 || !marketOpen(hr)) continue;
    const big = !!eventOn('market', M.city, day, hr);
    if (Math.random() < (big ? 0.85 : 0.07)) { // the whole town turns up on a big market day
      for (let tries = 0; tries < 4; tries++) { // a stall with room in front of it
      const st = mpick(M.stalls); if (!st || !st.front) continue;
      const ux = st.front.x - st.back.x, uz = st.front.z - st.back.z, l = Math.hypot(ux, uz) || 1, a = mr(-1, 1);
      const x = st.front.x + (uz / l) * a + (ux / l) * mr(0, 0.6), z = st.front.z - (ux / l) * a + (uz / l) * mr(0, 0.6);
      if (blockedAt(x, z)) continue;
      if (K.lifeGo(h, 'browse', x, z, Math.atan2(-ux, -uz), big ? mr(15, 35) : mr(8, 22), { stall: st })) return true; // and they take their time about it
      }
    }
  }
  // cheering on the runners
  if (eventOn('funrun', funRun.city, day, hr) && onFunRunCourse(h.x, h.z) && Math.random() < 0.4) {
    const [[x0, z0], , [x1, z1]] = funRun.corners, out = 2.2;
    const x = h.x < (x0 + x1) / 2 ? Math.min(h.x, x0 - out) : Math.max(h.x, x1 + out), z = h.z;
    if (!blockedAt(x, z)) return K.lifeGo(h, 'cheer', x, z, Math.atan2((x0 + x1) / 2 - x, 0), mr(15, 40));
  }
  // off to the fete
  if (eventOn('fete', 'ASHFORD', day, hr) && schoolInfo.field && Math.hypot(h.x - schoolInfo.field.x, h.z - schoolInfo.field.z) < 160 && Math.random() < 0.3) { h.feteGoer = true; return feteActivity(h, K); }
  return false;
}
export function tdVisit(h, want, K) {
  if (want === 'school') return sendToSchool(h, K);
  if (want === 'playground') return sendToPlayground(h, K);
  return undefined;
}
export function tdWants(h, hr, K) { return folkWants(h, hr, K.G.day); }

// =====================================================================
// Using things (E): bib table, tombola, cake stall
// =====================================================================
export function townUseTarget(K) {
  const P = K.player, day = K.G.day, hr = K.hour;
  if (P.car || P.mode !== 'move' || P.y > 1.2) return null;
  if (funRun.table && eventOn('funrun', funRun.city, day) && Math.hypot(P.x - funRun.table.x, P.z - funRun.table.z) < 2) return { kind: 'bib' };
  if (fete.tombola && eventOn('fete', 'ASHFORD', day, hr)) {
    if (Math.hypot(P.x - fete.tombola.x, P.z - fete.tombola.z) < 2) return { kind: 'tombola' };
    if (Math.hypot(P.x - fete.cakes.x, P.z - fete.cakes.z) < 2) return { kind: 'cakes' };
  }
  return null;
}
export function townUsePrompt(T, K, useK) {
  if (T.kind === 'bib') return TD_STATE.bibDay === K.G.day ? 'You\'ve got your bib on. Run round the Spire for a medal' : `${useK} to pin on a fun run bib`;
  if (T.kind === 'tombola') return `${useK} to have a go on the tombola ($2)`;
  if (T.kind === 'cakes') return `${useK} to buy a slice of cake ($3)`;
  return '';
}
export function townUse(T, K) {
  const P = K.player;
  if (T.kind === 'bib') {
    if (!eventOn('funrun', funRun.city, K.G.day, K.hour)) { K.showMsg(K.hour < 9 ? 'THE FUN RUN STARTS AT 9. PIN IT ON ANYWAY' : 'THE RUN\'S OVER FOR TODAY. YOU KEEP THE BIB', 2.2); TD_STATE.bibDay = K.G.day; return; }
    if (TD_STATE.bibDay === K.G.day) { K.showMsg('YOU\'VE ALREADY GOT ONE ON', 1.5); return; }
    TD_STATE.bibDay = K.G.day; TD_STATE.lapCorners = 0; K.sfx.cash();
    K.showMsg(`NUMBER ${100 + Math.floor(Math.random() * 800)}. RUN ALONG WITH THE OTHERS AND NOBODY LOOKS TWICE`, 3);
    return;
  }
  if (T.kind === 'tombola') {
    if (P.cash < 2) { K.showMsg('YOU NEED $2 FOR THE TOMBOLA', 1.6); return; }
    P.cash -= 2; TD_STATE.tombola++; K.sfx.cash();
    if (Math.random() < 0.45) { K.showMsg(mpick(['NO PRIZE. TICKETS ENDING IN 0 AND 5 WIN', 'UNLUCKY! TRY AGAIN', 'NOTHING. THE LADY LOOKS GENUINELY SORRY']), 1.8); return; }
    const W = mpick(TOMBOLA_PRIZES); if (W.give) W.give(K); K.showMsg(`TOMBOLA! YOU WON ${W.msg}`, 2.6); return;
  }
  if (T.kind === 'cakes') {
    if (P.cash < 3) { K.showMsg('YOU NEED $3 FOR CAKE', 1.6); return; }
    P.cash -= 3; TD_STATE.cakes++; P.hp = Math.min(100, P.hp + 22); K.sfx.cash();
    K.showMsg(mpick(['VICTORIA SPONGE (+22)', 'LEMON DRIZZLE. STILL WARM (+22)', 'A ROCK CAKE. LIVES UP TO ITS NAME (+22)', 'CHOCOLATE TRAYBAKE (+22)']), 2); return;
  }
}

// =====================================================================
// Each frame
// =====================================================================
export function updateTownDay(dt, K) {
  const day = K.G.day, hr = K.hour;
  updateFunRun(dt, K, !!eventOn('funrun', funRun.city, day, hr));
  updateFete(dt, K, !!eventOn('fete', 'ASHFORD', day, hr));
  // the morning paper: what's on today (shown a moment after the new day comes in)
  if (TD_STATE.lastDay !== day) { TD_STATE.lastDay = day; TD_STATE.lapCorners = 0; TD_STATE.dayMsgT = 6.5; }
  if (TD_STATE.dayMsgT > 0) { TD_STATE.dayMsgT -= dt; if (TD_STATE.dayMsgT <= 0) K.showMsg(todayLine(day), 5); }
  // events starting near you
  for (const E of eventsOn(day)) {
    if (E.id === 'school') continue;
    const key = `${day}:${E.id}:${E.town}`;
    if (hr >= E.from && hr < E.from + 0.5 && !TD_STATE.announced[key] && (!E.town || K.town() === E.town)) { TD_STATE.announced[key] = true; K.banner(`${E.name}<small>${E.where}, ${eventTime(E)}. ${E.blurb.toUpperCase()}</small>`, 4.5); }
  }
}
export function todayLine(day) {
  const ev = eventsOn(day).filter((E) => E.id !== 'school');
  return `${dayNameOf(day)}` + (ev.length ? ': ' + ev.map((E) => `${E.name} (${E.town ? E.town + ', ' : ''}${eventTime(E)})`).join(' · ') : ': NOTHING MUCH ON. J FOR YOUR DIARY');
}
// how you blend in thanks to the calendar
export function townDayConspic(K) {
  const P = K.player, day = K.G.day, hr = K.hour;
  if (P.car) return 0;
  let k = 0;
  if (TD_STATE.bibDay === day && eventOn('funrun', funRun.city, day, hr) && onFunRunCourse(P.x, P.z)) k -= P.sprinting ? 0.8 : 0.1; // just another runner
  for (const M of markets) if (P.x > M.x0 && P.x < M.x1 && P.z > M.z0 && P.z < M.z1 && eventOn('market', M.city, day, hr)) k -= 0.1; // big market day crowds
  if (eventOn('fete', 'ASHFORD', day, hr) && schoolInfo.field) { const F = schoolInfo.field; if (P.x > F.x0 - 2 && P.x < F.x1 + 2 && P.z > F.z0 - 2 && P.z < F.z1 + 2) k -= 0.12; }
  if (eventOn('quiz', null, day, hr)) for (const W of walkIns) if (W.kind === 'bar' && P.x > W.rect.x0 && P.x < W.rect.x1 && P.z > W.rect.z0 && P.z < W.rect.z1) { k -= 0.15; break; }
  return k;
}
// market.js asks: how many of a market's stalls get a trader today?
export const tdStaffShare = (M, day) => (eventOn('market', M.city, day) ? 1 : 0.6);
export const tdBigMarket = (M, day, hr) => !!eventOn('market', M.city, day, hr);

// =====================================================================
// Your diary: what's on, and what you've earned
// =====================================================================
const PERK_INFO = {
  cardigan: ['NANA PEG\'S CARDIGAN', 'A knitted disguise. Nobody suspects a cardigan.'],
  pal: ['DES\'S COUSIN', 'A large man who looks after you.'],
  discount: ['MATE OF THE CORNER SHOP', 'Market traders give you a quarter off.'],
  guard: ['THE HARBOUR MASTER\'S DOCKER', 'Someone to watch your back.'],
};
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export function diaryHTML(K) {
  const day = K.G.day, hr = K.hour;
  const evRow = (E, d, now) => `<div class="drow${now ? ' now' : ''}"><b>${esc(E.name)}</b><span>${esc(E.town || 'ALL TOWNS')} · ${esc(E.where)} · ${eventTime(E)}${now ? ' · <i>ON NOW</i>' : ''}</span><em>${esc(E.blurb)}</em></div>`;
  const today = eventsOn(day), tomorrow = eventsOn(day + 1);
  let h = `<div class="dhead">${dayNameOf(day)} <small>DAY ${day}</small></div>`;
  h += '<div class="dsec">TODAY</div>' + (today.length ? today.map((E) => evRow(E, day, hr >= E.from && hr < E.to)).join('') : '<div class="drow"><span>Nothing on. A quiet day to lie low.</span></div>');
  if (K.festival) h += `<div class="drow now"><b>${esc(K.festival)}</b><span>${esc(K.festivalCity)} · ALL DAY · <i>ON NOW</i></span><em>Big crowds, easy to blend in.</em></div>`;
  h += `<div class="dsec">TOMORROW: ${dayNameOf(day + 1)}</div>` + (tomorrow.length ? tomorrow.map((E) => evRow(E, day + 1, false)).join('') : '<div class="drow"><span>Nothing on.</span></div>');
  const perks = Object.keys(GJ_STATE.perks || {}).filter((k) => GJ_STATE.perks[k]);
  h += '<div class="dsec">PERKS</div>';
  h += perks.length ? perks.map((k) => `<div class="drow perk"><b>${esc((PERK_INFO[k] || [k])[0])}</b><em>${esc((PERK_INFO[k] || ['', ''])[1])}</em></div>`).join('') : '<div class="drow"><span>None yet. Do odd jobs for the regulars on the notice boards to earn some.</span></div>';
  const regs = Object.keys(REGULARS).map((id) => { const R = REGULARS[id], n = GJ_STATE.regulars[id] || 0; return `<span class="dchip${n >= R.steps.length ? ' done' : ''}">${esc(R.name)} ${n}/${R.steps.length}</span>`; }).join('');
  h += `<div class="drow"><span>REGULARS: ${regs}</span></div>`;
  const bits = [];
  if (MK_STATE.sweets) bits.push(`${MK_STATE.sweets} SWEETS (FOR KIDS WHO'VE SEEN TOO MUCH)`);
  if (TD_STATE.bibDay === day) bits.push('A FUN RUN BIB');
  if (TD_STATE.medals) bits.push(`${TD_STATE.medals} FUN RUN MEDAL${TD_STATE.medals > 1 ? 'S' : ''}`);
  if (KD_STATE.held) bits.push('SOMEBODY\'S PRAM');
  if (bits.length) h += `<div class="dsec">IN YOUR POCKETS</div><div class="drow"><span>${bits.map(esc).join(' · ')}</span></div>`;
  return h;
}
export function resetTownDay() {
  TD_STATE.bibDay = 0; TD_STATE.lapCorners = 0; TD_STATE.medals = 0; TD_STATE.medalDay = 0; TD_STATE.tombola = 0; TD_STATE.cakes = 0; TD_STATE.announced = {}; TD_STATE.lastDay = 0; TD_STATE.dayMsgT = 0; TD_STATE.feteT = 0;
}
export function buildTownDay() { if (!funRun.group) buildFunRun(); if (!fete.group) buildFete(); }
export const townDayDebug = () => ({ day: TD_STATE.lastDay, route: funRun.route.length, start: funRun.start, table: funRun.table, fete: !!fete.group, playgrounds: playgrounds.length, kids: kids.length, ...TD_STATE });
