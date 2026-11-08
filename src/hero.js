// Superpower mode's personality: THE PARAGON is all-powerful, adored (officially), and bored out of
// his mind. He drifts over the city, people freeze when his shadow passes, a long look makes anyone
// crumble, he can strike a pose and the whole street has to clap, his super hearing picks up anyone
// who calls him a menace, and the city keeps calling him for "rescues" that never go quite right.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, mr, mpick, angDiff, scene, camera, canvasTex } from './core.js';
import { floorAt, los3D, randomOpenPoint, localeName } from './world.js';
import { lifeInterrupt } from './citylife.js';
import { emitPuff } from './fx.js';
import { setMood } from './people.js';
import { sfx } from './audio.js';

export const HERO = { bored: 0, approval: 99, real: 82, stareH: null, stareT: 0, monoT: 25, poseT: 0, poseCd: 0, call: null, callT: 40, critics: [], saves: 0, fun: 0 };
const HERO_BORED_LINES = [
  'ANOTHER DAY. ANOTHER GRATEFUL CITY.', 'I COULD FLATTEN THIS WHOLE BLOCK. I WON\'T. PROBABLY.', 'NOBODY EVER ASKS HOW I\'M DOING.',
  'THEY NAMED A SANDWICH AFTER ME. IT\'S NOT VERY GOOD.', 'I\'VE SAVED THIS TOWN 412 TIMES. I COUNT.', 'MAYBE I\'LL JUST HOVER. MENACINGLY.',
  'IS IT POSSIBLE TO BE TOO POWERFUL? ASKING FOR ME.', 'WHERE ARE THE VILLAINS WHEN YOU NEED ONE?', 'EVERYONE\'S SO QUIET WHEN I LAND. IT\'S RESPECT.',
  'SMILE. ALWAYS SMILE. THE CAMERAS ARE EVERYWHERE.', 'I WONDER WHAT THAT MAN IS THINKING. PROBABLY ABOUT ME.', 'I COULD GO TO THE MOON. BUT THEN WHO WOULD THEY LOOK AT?',
  'IF I SNEEZE IT\'S ON THE NEWS.', 'I GAVE A KID AN AUTOGRAPH ONCE. HE CRIED. HAPPY TEARS.', 'BORED. BORED. BORED. BORED.',
];
const HERO_FUN_LINES = ['NOW THAT WAS FUN.', 'THAT\'S MORE LIKE IT.', 'THEY\'LL BE TALKING ABOUT THAT ONE.', 'STILL GOT IT.', 'HA!'];
const HERO_STARE_LINES = ['...', 'IS THERE SOMETHING ON MY FACE?', 'PLEASE STOP LOOKING AT ME', 'I\'M NOT DOING ANYTHING!', 'HELLO... SIR...', 'I\'LL JUST... GO'];
const HERO_CRUMBLE_LINES = ['TAKE IT! TAKE EVERYTHING!', 'I\'M SORRY FOR WHATEVER IT WAS!', 'YOU\'RE THE BEST! THE BEST!', 'I\'LL MOVE TOWNS!', 'I\'LL NAME MY SON AFTER YOU!'];
const HERO_CLAP_LINES = ['BRAVO! BRAVO!', 'WOOO! PARAGON!', 'SO STRONG!', 'WHAT A HERO!', 'MARVELLOUS! TRULY!', 'MORE! PLEASE! (NO MORE)', 'HE\'S SO HANDSOME!'];
const HERO_RECANT_LINES = ['I SAID HE\'S A MENACE... TO CRIME!', 'I WAS TALKING ABOUT A DIFFERENT HERO!', 'IT WAS A COMPLIMENT! IN MY CULTURE!', 'I LOVE THE CAPE! LOVE IT!'];
const HERO_CALLS = [
  { kind: 'cat', text: (w) => `A CAT IS STUCK UP A TREE IN ${w}`, done: ['CAT SAVED. THE TREE DID NOT MAKE IT.', 'CAT SAVED. IT HISSED AT YOU. UNGRATEFUL.', 'CAT SAVED. OWNER TOO SCARED TO SAY THANK YOU.'] },
  { kind: 'mugger', text: (w) => `MUGGING IN PROGRESS IN ${w}`, done: ['JUSTICE. THE NEWS WILL SAY YOU WERE GENTLE.', 'CRIME: STOPPED. LAMPPOST: ALSO STOPPED.', 'ANOTHER VILLAIN FACES THE CONSEQUENCES. HE WAS 16.'] },
  { kind: 'photo', text: (w) => `A SCHOOL TRIP IN ${w} WANTS A PHOTO`, done: ['PHOTO TAKEN. SEVERAL CHILDREN CRIED. GOOD CRYING.', 'PHOTO TAKEN. YOU WERE IN FOCUS. THEY WERE NOT.', 'PHOTO TAKEN. THE TEACHER FAINTED.'] },
];

// the hero's shadow on the street below, so people know to freeze
const heroShadowMat = new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (ctx, W, H) => { const g = ctx.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }), transparent: true, depthWrite: false });
const heroShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), heroShadowMat);
heroShadow.visible = false; heroShadow.renderOrder = 2; scene.add(heroShadow);

export function resetHero() {
  Object.assign(HERO, { bored: 0.2, approval: 99, real: 82, stareH: null, stareT: 0, monoT: 25, poseT: 0, poseCd: 0, call: null, callT: 35, critics: [], saves: 0, fun: 0 });
  heroShadow.visible = false;
}
// something fun happened: boredom drops
export function heroFun(n, C, quiet = false) {
  const was = HERO.bored; HERO.bored = clamp(HERO.bored - n, 0, 1);
  if (!quiet && was > 0.55 && HERO.bored < 0.35 && C) C.showMsg(mpick(HERO_FUN_LINES), 1.6);
}
export function heroMenace(n) { HERO.real = clamp(HERO.real - n, 3, 99); }

// strike a pose: everyone nearby had better applaud
export function heroPoseCmd(C) {
  if (HERO.poseCd > 0) return;
  HERO.poseCd = 6; HERO.poseT = 3.5; sfx.cheer();
  let n = 0, slack = 0;
  for (const h of C.G.hunters) {
    if (h.dead || h.held || h.inside) continue;
    const d = Math.hypot(h.x - C.player.x, h.z - C.player.z);
    if (d > 32) continue;
    lifeInterrupt(h); n++;
    if (Math.random() < 0.15 && !h.slacker) { h.slacker = true; slack++; continue; } // someone always forgets to clap
    h.clapT = mr(2.6, 4); h.panicT = 0; h.cowerT = 0;
    if (Math.random() < 0.4) setTimeout(() => !h.dead && C.say(h, mpick(HERO_CLAP_LINES)), mr(0, 900));
  }
  setTimeout(() => n && sfx.clap(), 150); setTimeout(() => n > 3 && sfx.clap(), 700);
  C.showMsg(n ? (slack ? `${n} PEOPLE APPLAUD. ${slack} DID NOT. YOU NOTICED.` : `${n} PEOPLE APPLAUD. AS THEY SHOULD.`) : 'NOBODY HERE TO APPRECIATE YOU', 2.2);
  if (n) { HERO.approval = 99; heroFun(0.12, C, true); }
}
// super hearing: the city-life chatter tells us when someone's slagging you off
export function heroOverheard(a, b, C) {
  if (!C.G.super || a.critic) return;
  a.critic = true; HERO.critics.push(a);
  C.showMsg(`SUPER HEARING: SOMEONE IN ${localeName(a.x, a.z)} CALLED YOU A MENACE`, 3);
}

const _heroFwd = new THREE.Vector3();
export function updateHero(dt, C) {
  const { G, player } = C;
  if (!G.super) { heroShadow.visible = false; return; }
  HERO.poseCd = Math.max(0, HERO.poseCd - dt); HERO.poseT = Math.max(0, HERO.poseT - dt);
  // boredom creeps up when nothing's happening
  const quiet = !G.villainFight;
  HERO.bored = clamp(HERO.bored + dt * (quiet ? 1 / 110 : -0.05), 0, 1);
  HERO.monoT -= dt;
  if (HERO.monoT <= 0) { HERO.monoT = mr(16, 30) * (1.4 - HERO.bored); if (HERO.bored > 0.4) { C.showMsg(mpick(HERO_BORED_LINES), 3); if (HERO.bored > 0.85) sfx.sigh(); } }
  HERO.real = clamp(HERO.real + dt * 0.02, 3, 99);

  // drifting shadow: people underneath stop dead and look up
  const fl = player.flying ? floorAt(player.x, player.z, player.y) : 0, alt = player.y - fl;
  heroShadow.visible = player.flying && alt < 90;
  if (heroShadow.visible) { const s = 1.4 + alt * 0.05; heroShadow.scale.set(s, 1, s); heroShadow.position.set(player.x, fl + 0.06, player.z); heroShadowMat.opacity = clamp(1 - alt / 90, 0.15, 1); }
  // the stare: look straight at someone and they come apart
  camera.getWorldDirection(_heroFwd);
  let best = null, bc = 0.993;
  for (const h of G.hunters) {
    if (h.dead || h.held || h.inside) continue;
    const dx = h.x - camera.position.x, dy = h.y + 1.6 - camera.position.y, dz = h.z - camera.position.z, d = Math.hypot(dx, dy, dz);
    if (d > 40 || d < 1.5) continue;
    const c = (dx * _heroFwd.x + dy * _heroFwd.y + dz * _heroFwd.z) / d;
    if (c > bc) { bc = c; best = h; }
    if (player.flying && alt > 4 && alt < 45 && Math.hypot(h.x - player.x, h.z - player.z) < 9 + alt * 0.15 && !(h.lookUpT > 0)) { h.lookUpT = mr(1.5, 3); if (Math.random() < 0.15) C.say(h, mpick(['IT\'S HIM!', 'DON\'T MOVE...', 'OH NO', 'LOOK BUSY'])); }
    if (h.lookUpT > 0) h.lookUpT -= dt;
    if (h.clapT > 0) h.clapT -= dt;
    // a critic who sees you coming takes it all back
    const pd = Math.hypot(h.x - player.x, h.z - player.z);
    if (h.critic && pd < 7) { h.critic = false; HERO.critics = HERO.critics.filter((q) => q !== h); h.cowerT = 3; C.say(h, mpick(HERO_RECANT_LINES)); HERO.approval = 99; heroFun(0.2, C); C.showMsg('THEY TOOK IT BACK. OF COURSE THEY DID.', 2); }
    if (h.slacker && pd < 5) { h.slacker = false; h.cowerT = 3; h.clapT = 2; C.say(h, 'I WAS CLAPPING! INSIDE!'); heroFun(0.08, C, true); }
  }
  if (best && !los3D(camera.position.x, camera.position.y, camera.position.z, best.x, best.y + 1.6, best.z)) best = null;
  if (best !== HERO.stareH) { HERO.stareH = best; HERO.stareT = 0; }
  if (best) {
    HERO.stareT += dt;
    if (HERO.stareT > 0.5) { best.lookUpT = 0.3; best.staredAt = true; lifeInterrupt(best); if (!best.stareSaid) { best.stareSaid = true; C.say(best, mpick(HERO_STARE_LINES)); } if (Math.random() < dt * 3) emitPuff(best.x + mr(-0.2, 0.2), best.y + 1.95, best.z + mr(-0.2, 0.2), { life: 0.5, vy: -0.8, size0: 0.06, size1: 0.1, alpha: 0.9, color: 0x8ac8ff }); }
    if (HERO.stareT > 2.2 && !best.crumbled) {
      best.crumbled = true; best.cowerT = 4; C.say(best, mpick(HERO_CRUMBLE_LINES)); sfx.scream();
      if (Math.random() < 0.5) C.dropCash(best);
      heroFun(0.1, C, true); heroMenace(0.5); C.showMsg('THE STARE NEVER FAILS', 1.4);
    }
  }
  updateHeroCall(dt, C);
}

// "rescues": the city keeps calling, and you keep turning up
function updateHeroCall(dt, C) {
  const { G, player } = C;
  if (!HERO.call) {
    HERO.callT -= dt; if (HERO.callT > 0) return;
    HERO.callT = mr(60, 100);
    const p = randomOpenPoint(player.x, player.z, 110, 260, 30); if (!p) return;
    const K = mpick(HERO_CALLS); HERO.call = { K, x: p.x, z: p.z, t: 150, spawned: false, cast: [] };
    C.showBanner(`<small>CALL FOR THE PARAGON</small>${K.text(localeName(p.x, p.z))}`, 3.5);
    C.showMsg('GOLD STAR ON THE MAP. OR DON\'T. IT\'S YOUR CITY.', 3); sfx.alarm();
    return;
  }
  const Q = HERO.call; Q.t -= dt;
  const d = Math.hypot(Q.x - player.x, Q.z - player.z);
  if (!Q.spawned && d < 120) { // set the scene once you're close enough to see it
    Q.spawned = true;
    if (Q.K.kind === 'mugger') { const m = C.spawnAt(Q.x, Q.z, 'runner', { perp: true }); if (m) { Q.cast.push(m); m.perp = true; } const v = C.spawnAt(Q.x + 2, Q.z, 'civ', {}); if (v) Q.cast.push(v); }
    else if (Q.K.kind === 'photo') for (let i = 0; i < 5; i++) { const f = C.spawnAt(Q.x + mr(-3, 3), Q.z + mr(-3, 3), 'civ', { fan: true }); if (f) { f.fan = true; Q.cast.push(f); } }
    else { const o = C.spawnAt(Q.x + 1.5, Q.z, 'civ', {}); if (o) Q.cast.push(o); }
  }
  if (Q.K.kind === 'mugger' && Q.spawned) {
    const m = Q.cast[0];
    if (m && !m.dead && !m.held && d < 45) { m.panicT = Math.max(m.panicT, 2); if (!m.yelled) { m.yelled = true; C.say(m, 'IT\'S THE PARAGON! LEG IT!'); } }
    if (m && (m.dead || m.held)) return finishHeroCall(C, Q);
  } else if (d < 9 && Math.abs(player.y - floorAt(Q.x, Q.z, player.y)) < 12) {
    if (Q.K.kind === 'cat') for (let i = 0; i < 10; i++) emitPuff(Q.x + mr(-1, 1), mr(2, 5), Q.z + mr(-1, 1), { life: 1.2, vy: mr(0, 2), vx: mr(-2, 2), vz: mr(-2, 2), size0: 0.3, size1: 1, alpha: 0.8, color: 0x4a8a3a });
    for (const h of Q.cast) if (!h.dead) { h.clapT = 3; C.say(h, Q.K.kind === 'photo' ? mpick(['CHEESE!', 'WE LOVE YOU!', 'HE TOUCHED MY HEAD!']) : mpick(['MY HERO...', 'TH-THANK YOU', 'YOU CAME! YOU ACTUALLY CAME!'])); }
    return finishHeroCall(C, Q);
  }
  if (Q.t <= 0) { HERO.call = null; C.showMsg('YOU IGNORED A CALL. NOBODY WILL MENTION IT.', 3); heroMenace(3); }
}
function finishHeroCall(C, Q) {
  HERO.call = null; HERO.saves++; HERO.approval = 99; heroFun(0.35, C, true); sfx.cheer();
  C.showBanner(`<small>RESCUE COMPLETE</small>${mpick(Q.K.done)}`, 3.5);
}

// how townsfolk stand and move around the hero (applied after the normal walk pose)
export function heroPersonPose(h, dt) {
  const p = h.p;
  if (h.clapT > 0 && !(h.cowerT > 0) && !(h.panicT > 0)) {
    const k = Math.sin(performance.now() / 1000 * 18 + h.phase);
    p.armL.rotation.x = p.armR.rotation.x = -1.35; p.armL.rotation.z = -0.35 - k * 0.25; p.armR.rotation.z = 0.35 + k * 0.25;
    setMood(p, 'happy');
  }
  p.head.rotation.x = h.lookUpT > 0 && !h.held ? -0.55 : 0;
  if (h.staredAt && !(h.cowerT > 0)) setMood(p, 'scared');
  h.staredAt = false;
}
// should this person stand still this frame (frozen by the shadow, clapping, being stared at)?
export function heroHolds(h) { return h.clapT > 0 || h.lookUpT > 0; }

export function heroNews() {
  const bits = [`PARAGON APPROVAL STEADY AT ${HERO.approval}%`, 'OFFICIAL: EVERYONE LOVES THE PARAGON'];
  if (HERO.saves) bits.push(`${HERO.saves} HEROIC RESCUES TODAY. SOURCES: THE PARAGON`);
  if (HERO.bored > 0.6) bits.push('PARAGON "SEEMS BORED", SAY WITNESSES WHO HAVE SINCE MOVED AWAY');
  if (HERO.real < 50) bits.push('POLL: 99% OF PEOPLE TOO SCARED TO ANSWER POLL');
  return bits;
}
// gold star for a call, pink dots for anyone who's been badmouthing you
export function heroMapMarks() {
  const out = [];
  if (HERO.call) out.push({ x: HERO.call.x, z: HERO.call.z, color: '#ffd23a', star: true });
  for (const h of HERO.critics) if (!h.dead) out.push({ x: h.x, z: h.z, color: '#ff6ad5', critic: true });
  HERO.critics = HERO.critics.filter((h) => !h.dead);
  return out;
}
export function heroHud() {
  const b = HERO.bored;
  return { mood: b > 0.8 ? 'SO. BORED.' : b > 0.55 ? 'BORED' : b > 0.3 ? 'MILDLY AMUSED' : 'HAVING FUN', bored: b, approval: HERO.approval, real: Math.round(HERO.real) };
}
