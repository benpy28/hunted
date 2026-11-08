// The manhunt: what turns 30 days of hiding into a story. Every day has a goal, the hunt
// escalates on a schedule, other runners get caught one by one on the news, you earn
// second chances, close calls get stamped, and each day ends with a recap card.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, mr, mpick, scene } from './core.js';
import { CITIES, randomOpenPoint, cityAt, groundY } from './world.js';

// the other people who signed up to be hunted. The news follows them too.
const MH_RUNNER_NAMES = ['JADE', 'OKORO', 'MARLOW', 'PRIYA', 'TEDDY', 'SANNA', 'RUFUS', 'LENA', 'IKE', 'BEA', 'COLM'];
const MH_CATCH_LINES = [
  'WAS CAUGHT HIDING IN A WHEELIE BIN IN', 'GOT TACKLED AT A BUS STOP IN', 'WAS RECOGNISED BUYING A SANDWICH IN',
  'WAS CORNERED ON A ROOFTOP IN', 'GAVE UP AFTER FOUR DAYS IN A LOFT IN', 'WAS SPOTTED BY A KID ON A SCOOTER IN',
  'TRIED TO SWIM FOR IT NEAR', 'WAS FOUND ASLEEP ON A PARK BENCH IN', 'GOT BOXED IN BY THREE TAXIS IN',
];
// escalation on a schedule, announced at dawn like the chapters of a big challenge video
export const MH_MILESTONES = {
  2: { title: 'THE TRACKERS ARE IN', sub: 'A TEAM OF PROFESSIONALS JUST JOINED. THEY START WHERE YOU WERE LAST SEEN.' },
  3: { title: 'SWEEPS BEGIN', sub: 'EVERY DAY ONE TOWN GETS SEARCHED STREET BY STREET. YOU GET A WARNING.' },
  7: { title: 'ONE WEEK IN', sub: 'THE BOUNTY DOUBLED. MORE PEOPLE ARE LOOKING NOW.' },
  14: { title: 'HALFWAY', sub: 'TWO SWEEPS A DAY FROM NOW ON. THE TRACKERS BROUGHT FRIENDS.' },
  21: { title: 'THREE WEEKS', sub: 'CURFEW: AFTER DARK, ANYONE OUT ON THE STREETS IS A SUSPECT.' },
  28: { title: 'FINAL 72 HOURS', sub: 'EVERYONE IN THREE TOWNS IS OUT LOOKING. HOLD ON.' },
  30: { title: 'FINAL DAY', sub: 'AN EXTRACTION POINT OPENS AT 18:00. REACH IT AND HOLD IT TO GET OUT CLEAN.' },
};
export const MH = {
  runners: [], lifelines: 1, usedLifelines: 0, objective: null, done: 0, streak: 0, closeCalls: 0, spotted: 0,
  sweeps: [], dayLog: null, recapT: 0, closeArm: 0, closeT: 0, wasSeen: false, newsBits: [], invulnT: 0, bountyMul: 1,
  extract: null, escaped: false, lastCaught: null, rival: null, rivalT: 60, yourCatches: 0,
};

// ---------------------------------------------------------------------
// markers in the world: a supply crate with a beam you can see from across town
// ---------------------------------------------------------------------
const mhBeamMat = new THREE.MeshBasicMaterial({ color: 0x5ae0ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const mhBeamGreen = new THREE.MeshBasicMaterial({ color: 0x6aff8a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const mhCrate = new THREE.Group();
{
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
  box.position.y = 0.45; mhCrate.add(box);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.18, 1.24), new THREE.MeshLambertMaterial({ color: 0x3ab8e8, emissive: 0x0a3a50 }));
  band.position.y = 0.5; mhCrate.add(band);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 140, 10, 1, true), mhBeamMat);
  beam.position.y = 70; mhCrate.add(beam);
  mhCrate.visible = false; scene.add(mhCrate);
}
const mhExtract = new THREE.Group();
{
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 6, 40), mhBeamGreen);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; mhExtract.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 160, 14, 1, true), mhBeamGreen);
  beam.position.y = 80; mhExtract.add(beam);
  mhExtract.visible = false; scene.add(mhExtract);
}

// ---------------------------------------------------------------------
// HUD: today's goal, runners left, second chances, sweep warnings, and the recap card
// ---------------------------------------------------------------------
const mhEl = (id, parent, cls) => { const e = document.createElement('div'); e.id = id; if (cls) e.className = cls; parent.appendChild(e); return e; };
let mhHud = null;
function mhEnsureHud() {
  if (mhHud) return mhHud;
  const card = document.getElementById('hud-card'), hud = document.getElementById('hud');
  mhHud = {
    goal: mhEl('hud-goal', card), sweep: mhEl('hud-sweep', card), runners: mhEl('hud-runners', card),
    recap: mhEl('hud-recap', hud, 'hidden'), stamp: mhEl('hud-stamp', hud),
  };
  return mhHud;
}

const mhPointIn = (c, pad = 24) => randomOpenPoint(c.cx + mr(-c.half + pad, c.half - pad), c.cz + mr(-c.half + pad, c.half - pad), 0, 16) || { x: c.cx, z: c.cz };
const mhCityHere = (x, z) => cityAt(x, z, 20);

export function resetManhunt(days) {
  // when each other runner gets caught: spread across the month, and the last rival lasts until the final day
  const n = MH_RUNNER_NAMES.length;
  const span = (days - 2.8) / (n - 1); // one catch per slot so they really are spread across the month
  const times = Array.from({ length: n - 1 }, (_, i) => 0.6 + span * (i + mr(0.1, 0.9)));
  times.push(days - 1 + mr(0.3, 0.75));
  MH.runners = MH_RUNNER_NAMES.map((name, i) => ({ name, num: i + 2, at: times[i], caught: false }));
  Object.assign(MH, { lifelines: 1, usedLifelines: 0, objective: null, done: 0, streak: 0, closeCalls: 0, spotted: 0, sweeps: [], recapT: 0, closeArm: 0, closeT: 0, wasSeen: false, newsBits: [], invulnT: 0, bountyMul: 1, extract: null, escaped: false, lastCaught: null, rival: null, rivalT: mr(50, 90), yourCatches: 0 });
  MH.dayLog = mhFreshLog();
  mhCrate.visible = false; mhExtract.visible = false;
  const H = mhEnsureHud(); H.recap.classList.add('hidden'); H.stamp.classList.remove('show');
}
const mhFreshLog = () => ({ closeCalls: 0, spotted: 0, caught: [], heatPeak: 0 });
export const runnersLeft = () => 1 + MH.runners.filter((r) => !r.caught).length;

// ---------------------------------------------------------------------
// daily goals
// ---------------------------------------------------------------------
function mhMakeObjective(day, ctx) {
  const here = mhCityHere(ctx.x, ctx.z), others = CITIES.filter((c) => c !== here);
  if (day >= ctx.days) return null; // the final day has the extraction instead
  const kinds = day === 1 ? ['drop'] : ['drop', 'drop', 'reach', 'ghost', 'lowkey'];
  let kind = mpick(kinds);
  if (MH.objective && MH.objective.kind === kind && kind !== 'drop') kind = 'drop';
  if (kind === 'drop') {
    // day 1 drops close by; later ones make you travel
    const c = day === 1 ? (here || CITIES[0]) : (Math.random() < 0.6 ? mpick(others) : here || mpick(CITIES));
    const p = day === 1 ? (randomOpenPoint(ctx.x, ctx.z, 45, 90) || mhPointIn(c)) : mhPointIn(c);
    const life = day % 5 === 0 || day === 1;
    return { kind, x: p.x, z: p.z, city: cityAt(p.x, p.z, 20)?.name || 'THE COUNTRYSIDE', life, text: `GRAB THE SUPPLY DROP IN ${cityAt(p.x, p.z, 20)?.name || 'THE COUNTRYSIDE'}`, reward: life ? 'A SECOND CHANCE' : 'CASH + SUPPLIES', baited: day > 3 && Math.random() < 0.35 };
  }
  if (kind === 'reach') { const c = mpick(others); return { kind, x: c.cx, z: c.cz, city: c.name, text: `GET TO ${c.name} BEFORE NIGHTFALL`, reward: 'CASH + A COOLER PROFILE', deadline: 20 }; }
  if (kind === 'ghost') { const need = Math.round(ctx.dayLength * 0.3); return { kind, need, best: 0, text: `GO ${Math.round(need * 24 / ctx.dayLength)} HOURS WITHOUT BEING SPOTTED`, reward: 'THE TRAIL GOES COLD' }; }
  return { kind: 'lowkey', text: 'END THE DAY ON LOW PROFILE OR NOTICED', reward: 'A SECOND CHANCE' };
}
function mhPlaceMarkers() {
  const O = MH.objective;
  mhCrate.visible = !!(O && O.kind === 'drop' && !O.done);
  if (mhCrate.visible) mhCrate.position.set(O.x, groundY(O.x, O.z), O.z);
}
// where to point the minimap arrow, if anywhere
export function mhTarget() {
  if (MH.extract && MH.extract.open) return { x: MH.extract.x, z: MH.extract.z, color: '#6aff8a' };
  const O = MH.objective;
  if (O && !O.done && (O.kind === 'drop' || O.kind === 'reach')) return { x: O.x, z: O.z, color: '#5ae0ff' };
  return null;
}
function mhComplete(ctx, extra = '') {
  const O = MH.objective; if (!O || O.done) return;
  O.done = true; MH.done++; MH.streak++;
  let reward = O.reward;
  if (O.kind === 'drop') { ctx.heal(100); ctx.giveAmmo(); ctx.giveCash(O.life ? 20 : 35 + ctx.day * 2); if (O.life) MH.lifelines = Math.min(3, MH.lifelines + 1); }
  if (O.kind === 'reach') { ctx.giveCash(30 + ctx.day * 2); ctx.coolOff(40); }
  if (O.kind === 'ghost') { ctx.coolOff(70); }
  if (O.kind === 'lowkey') MH.lifelines = Math.min(3, MH.lifelines + 1);
  if (MH.streak === 3) { MH.lifelines = Math.min(3, MH.lifelines + 1); reward += ' · 3 IN A ROW: EXTRA SECOND CHANCE'; MH.streak = 0; }
  mhPlaceMarkers();
  ctx.banner(`GOAL COMPLETE<small>${reward}${extra}</small>`, 3.5); ctx.sfx('cash');
}

// ---------------------------------------------------------------------
// sweeps: one town gets searched street by street, with a warning first
// ---------------------------------------------------------------------
function mhPlanSweeps(day) {
  MH.sweeps = [];
  if (day < 3) return;
  const n = day >= 14 ? 2 : 1, hours = n === 2 ? [mr(10, 14), mr(18, 22.5)] : [mr(11, 22)];
  for (const h of hours) MH.sweeps.push({ city: mpick(CITIES).name, at: Math.round(h * 2) / 2, len: 2.5, warned: false, active: false, over: false });
}
const mhHourFmt = (h) => String(Math.floor(h) % 24).padStart(2, '0') + ':' + (h % 1 ? '30' : '00');
// hours from a to b going forward round the clock
const mhHoursUntil = (a, b) => ((b - a) % 24 + 24) % 24;
export const mhSweeps = () => MH.sweeps;

// ---------------------------------------------------------------------
// the daily rhythm
// ---------------------------------------------------------------------
export function manhuntNewDay(ctx) {
  const L = MH.dayLog, O = MH.objective, prev = ctx.day - 1;
  let result = '';
  if (O) {
    if (O.kind === 'lowkey' && !O.done && ctx.level <= 1) { mhComplete(ctx); }
    result = O.done ? `<b class="ok">✓</b> ${O.text}` : `<b class="no">✗</b> ${O.text}`;
    if (!O.done) MH.streak = 0;
  }
  if (prev >= 1 && !ctx.super) {
    const caught = L.caught.length ? `<div class="mh-row">CAUGHT TODAY: <b>${L.caught.join(', ')}</b></div>` : '';
    mhShowRecap(`<small>END OF DAY ${prev}</small><h3>${mpick(['STILL FREE', 'MADE IT', 'ANOTHER DAY', 'NOT TODAY'])}</h3>${result ? `<div class="mh-row">${result}</div>` : ''}<div class="mh-row">CLOSE CALLS <b>${L.closeCalls}</b> · SPOTTED <b>${L.spotted}</b> TIMES</div>${caught}<div class="mh-row">RUNNERS LEFT <b>${runnersLeft()}</b> OF ${MH.runners.length + 1}</div>`);
  }
  MH.dayLog = mhFreshLog();
  if (ctx.day >= 7) MH.bountyMul = ctx.day >= 28 ? 1.6 : ctx.day >= 14 ? 1.35 : 1.2;
  MH.objective = mhMakeObjective(ctx.day, ctx);
  mhPlanSweeps(ctx.day);
  if (ctx.day === ctx.days) { const c = mpick(CITIES), p = mhPointIn(c, 30); MH.extract = { x: p.x, z: p.z, city: c.name, open: false, hold: 0, need: 15 }; }
  mhPlaceMarkers();
  // trackers: a pro team starts at the last place you were seen
  if (ctx.day >= 2 && !ctx.super) ctx.spawnTrackers(ctx.day >= 14 ? 5 : ctx.day >= 7 ? 4 : 3);
  const M = MH_MILESTONES[ctx.day];
  return M ? `DAY ${ctx.day}<small>${M.title}: ${M.sub}</small>` : `DAY ${ctx.day}<small>TODAY: ${MH.objective ? MH.objective.text : 'SURVIVE'}</small>`;
}
function mhShowRecap(html) { const H = mhEnsureHud(); H.recap.innerHTML = html; H.recap.classList.remove('hidden'); MH.recapT = 7; }
function mhStamp(text, sub) { const H = mhEnsureHud(); H.stamp.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`; H.stamp.classList.remove('show'); void H.stamp.offsetWidth; H.stamp.classList.add('show'); MH.stampT = 2.2; }

// called from the game every tick
export function updateManhunt(dt, ctx) {
  const H = mhEnsureHud();
  if (MH.recapT > 0) { MH.recapT -= dt; if (MH.recapT <= 0) H.recap.classList.add('hidden'); }
  if (MH.stampT > 0) { MH.stampT -= dt; if (MH.stampT <= 0) H.stamp.classList.remove('show'); }
  MH.invulnT = Math.max(0, MH.invulnT - dt);
  if (ctx.super) { H.goal.textContent = ''; H.sweep.textContent = ''; H.runners.textContent = ''; return; }
  const dayF = ctx.elapsed / ctx.dayLength;
  // other runners get caught, and it makes the news
  for (const r of MH.runners) if (!r.caught && dayF >= r.at) {
    if (MH.rival === r) { ctx.despawnRival(r); MH.rival = null; }
    r.caught = true; MH.lastCaught = r; MH.dayLog.caught.push(r.name);
    const where = mpick(CITIES).name, left = runnersLeft();
    ctx.say(`NEWS: RUNNER ${r.num} · ${r.name} ${mpick(MH_CATCH_LINES)} ${where}. ${left === 1 ? 'YOU ARE THE LAST ONE LEFT' : left + ' LEFT'}`, 5);
    MH.newsBits = [`RUNNER ${r.name} CAUGHT IN ${where}`, `${left} RUNNERS STILL FREE`];
    if (left === 1) ctx.banner(`LAST ONE STANDING<small>EVERY OTHER RUNNER HAS BEEN CAUGHT. IT'S JUST YOU NOW.</small>`, 4.5);
    ctx.sfx('alarm');
  }
  // now and then a rival runner gets spotted nearby: a chance to take them out of the game
  if (ctx.day >= 2) {
    MH.rivalT -= dt;
    if (MH.rivalT <= 0) {
      MH.rivalT = mr(70, 140);
      const cand = MH.runners.filter((r) => !r.caught && r.at - dayF > 0.15);
      if (!MH.rival && cand.length) {
        const r = mpick(cand);
        if (ctx.spawnRival(r)) { MH.rival = r; r.trackedT = 60; r.warned = false; ctx.say(`CHANNEL 9: RUNNER ${r.num} · ${r.name} WAS SPOTTED NEAR YOU. KNOCK THEM DOWN AND PIN THEM FOR THEIR SHARE`, 5.5); ctx.sfx('alarm'); }
      }
    }
  }
  if (MH.rival) MH.rival.trackedT = (MH.rival.trackedT || 0) - dt;
  // spotted counter: a new sighting after a quiet spell
  if (ctx.seen && !MH.wasSeen) { MH.spotted++; MH.dayLog.spotted++; }
  MH.wasSeen = ctx.seen;
  // close calls: someone gets right on you, and you still get away
  if (ctx.nearest < 2.4 && ctx.alive) { MH.closeArm = 1; MH.closeT = 0; }
  if (MH.closeArm) {
    MH.closeT += dt;
    if (ctx.nearest > 26 || (!ctx.seen && MH.closeT > 4)) {
      MH.closeArm = 0; MH.closeCalls++; MH.dayLog.closeCalls++;
      mhStamp('CLOSE CALL', ctx.hp < 30 ? 'BY A THREAD' : MH.closeCalls === 1 ? 'TOO CLOSE' : `${MH.closeCalls} THIS RUN`);
      ctx.sfx('whoosh'); ctx.restoreStamina();
    } else if (MH.closeT > 25) MH.closeArm = 0;
  }
  // today's goal
  const O = MH.objective;
  if (O && !O.done) {
    if (O.kind === 'drop' && !ctx.inCar && Math.hypot(ctx.x - O.x, ctx.z - O.z) < 2.2) {
      if (O.baited) { ctx.ambush(O.x, O.z); mhComplete(ctx, ' · IT WAS A TRAP. RUN'); } else mhComplete(ctx);
    }
    if (O.kind === 'drop' && O.baited && !O.warned && Math.hypot(ctx.x - O.x, ctx.z - O.z) < 40) { O.warned = true; ctx.say('THE DROP LOOKS TOO QUIET. SOMEONE MIGHT BE WATCHING IT', 3.5); }
    if (O.kind === 'reach') { const c = mhCityHere(ctx.x, ctx.z); if (c && c.name === O.city && ctx.hour < O.deadline && ctx.hour >= 7) mhComplete(ctx); }
    if (O.kind === 'ghost') { O.best = Math.max(O.best, ctx.unseen); if (ctx.unseen >= O.need) mhComplete(ctx); }
  }
  // sweeps
  const here = mhCityHere(ctx.x, ctx.z);
  let sweepText = '';
  const dh = mhHoursUntil(7, ctx.hour); // hours since dawn, so sweeps past midnight still line up
  for (const S of MH.sweeps) {
    const atD = mhHoursUntil(7, S.at);
    if (!S.warned && atD - dh <= 3 && atD > dh) { S.warned = true; ctx.say(`WARNING: ${S.city} GETS SWEPT AT ${mhHourFmt(S.at)}. BE SOMEWHERE ELSE`, 4.5); }
    if (!S.active && !S.over && dh >= atD && dh < atD + S.len) { S.active = true; S.warned = true; ctx.banner(`SWEEP<small>${S.city} IS BEING SEARCHED STREET BY STREET</small>`, 3.5); ctx.sfx('alarm'); }
    if (S.active && dh >= atD + S.len) { S.active = false; S.over = true; ctx.say(`THE SWEEP OF ${S.city} IS OVER`, 3); }
    if (S.active) {
      sweepText = `SWEEP IN ${S.city}`;
      if (here && here.name === S.city) {
        S.tick = (S.tick || 0) - dt;
        if (S.tick <= 0) { S.tick = 4; ctx.sweepPulse(); }
        ctx.minHeat(ctx.inSafe ? 0 : 25);
      }
    } else if (S.warned && !S.over && !sweepText) sweepText = `SWEEP: ${S.city} AT ${mhHourFmt(S.at)}`;
  }
  // curfew from week three: being out after dark makes people look twice
  if (ctx.day >= 21 && ctx.hour >= 21 || ctx.day >= 21 && ctx.hour < 5) { if (!ctx.inSafe && here) ctx.minHeat(22); }
  // the extraction on the final day
  const X = MH.extract;
  if (X) {
    if (!X.open && ctx.hour >= 18) { X.open = true; mhExtract.visible = true; mhExtract.position.set(X.x, groundY(X.x, X.z), X.z); ctx.banner(`EXTRACTION OPEN<small>${X.city}. GET THERE AND HOLD THE GREEN RING</small>`, 4); ctx.sfx('alarm'); }
    if (X.open && !MH.escaped) {
      const d = Math.hypot(ctx.x - X.x, ctx.z - X.z);
      if (d < 6) { X.hold += dt; if (Math.floor(X.hold) !== Math.floor(X.hold - dt)) ctx.say(`HOLD ON. EXTRACTION IN ${Math.max(0, Math.ceil(X.need - X.hold))}`, 1.2); }
      else X.hold = Math.max(0, X.hold - dt * 0.5);
      if (X.hold >= X.need) { MH.escaped = true; ctx.win(); }
    }
  }
  MH.dayLog.heatPeak = Math.max(MH.dayLog.heatPeak, ctx.level);
  // HUD
  let goal = '';
  if (X && X.open) goal = `<b>FINAL</b> REACH THE EXTRACTION IN ${X.city}${X.hold > 0 ? ` · ${Math.ceil(X.need - X.hold)}s` : ''}`;
  else if (ctx.day >= ctx.days) goal = '<b>FINAL</b> SURVIVE UNTIL 18:00, THEN GET OUT';
  else if (O) {
    const extra = O.done ? ' ✓' : O.kind === 'ghost' ? ` · ${Math.floor(clamp(ctx.unseen / O.need, 0, 1) * 100)}%` : O.kind === 'drop' || O.kind === 'reach' ? ` · ${Math.round(Math.hypot(ctx.x - O.x, ctx.z - O.z))}m` : '';
    goal = `<b>TODAY</b> ${O.text}${extra}`;
  }
  H.goal.innerHTML = goal; H.goal.classList.toggle('done', !!(O && O.done));
  H.sweep.textContent = sweepText; H.sweep.classList.toggle('live', sweepText.startsWith('SWEEP IN'));
  H.runners.innerHTML = `RUNNERS LEFT <b>${runnersLeft()}</b>/${MH.runners.length + 1} · <span class="mh-life">${'♥'.repeat(MH.lifelines)}${'♡'.repeat(3 - MH.lifelines)}</span>`;
}

// caught? spend a second chance to break free instead
export function trySecondChance(ctx) {
  if (ctx.super || MH.lifelines <= 0) return false;
  MH.lifelines--; MH.usedLifelines++;
  MH.invulnT = 2.5;
  mhStamp('SECOND CHANCE', MH.lifelines ? `${MH.lifelines} LEFT` : 'THAT WAS YOUR LAST ONE');
  return true;
}
export function manhuntNews() { return MH.newsBits; }
export function manhuntSweepCity() { const S = MH.sweeps.find((s) => s.active); return S ? S.city : null; }

// a rival on the map while they're being tracked (or while they're coming for you)
export function mhRivalTarget() {
  const r = MH.rival;
  return r && r.h && !r.h.dead && r.trackedT > 0 ? { x: r.h.x, z: r.h.z, color: '#3cff8a' } : null;
}
export function mhRivalGone() { MH.rival = null; }
export function mhRivalCaughtByYou(r, ctx) {
  r.caught = true; MH.rival = null; MH.lastCaught = r; MH.yourCatches++; MH.dayLog.caught.push(r.name);
  MH.lifelines = Math.min(3, MH.lifelines + 1); ctx.giveCash(40 + ctx.day * 2); ctx.coolOff(30);
  const left = runnersLeft();
  MH.newsBits = [`RUNNER ${r.name} PINNED BY ANOTHER RUNNER`, `${left} RUNNERS STILL FREE`];
  ctx.banner(`YOU CAUGHT ${r.name}<small>THEIR SHARE IS YOURS · +1 SECOND CHANCE${left === 1 ? ' · YOU ARE THE LAST ONE LEFT' : ` · ${left} LEFT`}</small>`, 4);
  mhStamp('TAKEDOWN', `RUNNER ${r.num}`); ctx.sfx('cash');
}
