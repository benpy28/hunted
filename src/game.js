// HUNTED — survive 30 days while everyone in three towns hunts you.
import * as THREE from '../vendor/three.module.min.js';
import {
  clamp, lerp, smoothstep, angDiff, mr, mpick, fmtTime, $, canvas, renderer, scene, camera, hemi, sun,
  vmScene, vmCamera, puffTex, GeoBuf, canvasTex, cullChunks,
} from './core.js';
import {
  CITIES, HIGHWAYS, WORLD, RIVER, colliders, blockRects, parkedSpots, beacons, animated, waterRects, lanes, emissiveFacades,
  generateWorld, cityAt, localeName, resolveCircle, pointBlocked, maxHeightNear, groundY,
  navRecenter, computeFlow, navTarget, los, los3D, blockedAt, randomOpenPoint, raycastWorld,
  floorAt, resolveBody, stackTop, ladders, ziplines, zipNear, ladderNear, roofs, solidAt, unbucketedColliders, moveBody, losSolid, headroom,
} from './world.js';
import { initAudio, sfx, setAircraftVolume, setZipSound } from './audio.js';
import { parkourMove, resetParkour, eyeHeight } from './parkour.js';
import { updateInteriors, zoneAt, undergroundRects, isUnderground, mallShops } from './interiors.js';
import { links } from './world.js';
import { walkIns, lifeSpots, hideSpots } from './streets.js';
import { warehouses } from './docks.js';
import { HERO, resetHero, heroFun, heroMenace, heroPoseCmd, heroOverheard, updateHero, heroPersonPose, heroHolds, heroNews, heroMapMarks, heroHud } from './hero.js';
import { villains, henchmen, henchClap, resetVillains, updateVillains, villainHit, villainsNear, villainRay, villainMapMarks } from './villains.js';
import { knockFX, hitFX, updateKnockFX, knockDebug, comicWord } from './knockfx.js';
import { bikes, riders, bikeRide, updateBikes, spawnCyclist, playerBikeAction, playerBikeSpeed, bikeNear, riderNear, clearBikes, bikeDebug } from './cyclists.js';
import { streetPropObjs, geysers, buildStreetProps, updateStreetProps, kickProp, hitHydrant, propInFront, propsNear, rayProps, tidyStreetProps, resetStreetProps, streetPropDebug } from './streetprops.js';
import { GJ_STATE, gigBoards, gigMenu, gigBoardNear, boardBlurbs, gigConspic, gigMapMarks, gigHud, lorryLogic, lorryRearNear, hopOnLorry, hopOffLorry, gigRidePlayer, updateGigs, resetGigs, gigsDebug, gigInternals } from './gigs.js';
import { SK_STATE, JUNK_NAMES, buildStealth, resetStealth, stealthNewDay, updateStealth, stealthConspic, stealthDebug, hideSpotNear, enterHide, leaveHide, hideName, hideHunterThink, stealthUseTarget, hunterPickPeek, hunterPeekArrive, junkNear, pickJunk, throwJunk, noiseAt, cams, rayCams, meleeCams, breakCam, flocks, scareFlock, pickMark, pickPocket, junk } from './stealth.js';
import { assignJob, releaseJob, lifeStart, lifeStep, lifePose, lifeInterrupt, updateCityLife, clearCityLife, cityLifeDebug, hireVendor, vendorOf, lifeGo, lifeLap } from './citylife.js';
import { MK_STATE, markets, marketStalls, stallNear, stallMenu, marketOpen, marketConspic, marketAt, updateMarkets, resetMarkets, marketMapMarks, marketsDebug, marketInternals } from './market.js';
import { KD_STATE, kids, prams, playgrounds, schoolInfo, maybeFamily, makeKid, givePram, updateKids, kidsConspic, resetKids, pramHeld, grabPram, dropPram, pramNear, kidNear, greetKid, grownupHears, kidsDebug } from './kids.js';
import { TD_STATE, TD_EVENTS, weekdayOf, dayNameOf, isSchoolDay, eventsOn, eventOn, folkMix, folkWants, crowdMul, tdPlan, tdVisit, tdWants, townUseTarget, townUsePrompt, townUse, updateTownDay, townDayConspic, tdStaffShare, tdBigMarket, diaryHTML, resetTownDay, buildTownDay, townDayDebug, funRun, fete, todayLine } from './townday.js';
import { mdRoofs, ground, church, clubhouse, carBoot, MD_STATE, MD_CLEAR, matchNow, opponentOn, inGround, inChurch, mdUseTarget, mdUsePrompt, mdUse, mdConspic, updateMatchDay, mdPlan, resetMatchDay, mdDiaryBits, matchDayDebug, mdInternals } from './matchday.js';
import { CN_CLEAR, cinema, cnRoofs, CN_STATE, FILMS, showNow, filmOn, showTime, hasTicket, inCinema, screenAt, cnUseTarget, cnUsePrompt, cnUse, cnConspic, cnSeatPlayer, cnSit, cnStand, updateCinema, cnPlan, resetCinema, cnDiaryBits, cinemaDebug, cnInternals } from './cinema.js';
import { LN_STATE, launderettes, launderetteAt, lnUseTarget, lnUsePrompt, lnUse, lnConspic, updateLaunderettes, resetLaunderettes, lnDiaryBits, launderetteDebug, lnInternals } from './launderette.js';
import { AW_STATE, awayEnd, inAwayEnd, coachLogic, updateAwayDays, awConspic, awPlan, resetAwayDays, awayDaysDebug, awInternals } from './awaydays.js';
import { pubTV } from './pubtv.js';
import { bowling } from './bowling.js';
import { baths } from './baths.js';
import { buses } from './buses.js';
import { railway } from './railway.js';
import { pubGames } from './pubgames.js';
import { dockWork } from './dockwork.js';
import { quay } from './quay.js';
// the newer venues all plug in the same way: E targets, how well you blend in, each frame, the diary...
const XV = [pubTV, pubGames, bowling, baths, buses, railway, dockWork, quay];
import { DL_STATE, deliveryLogic, dlRearNear, dlHopOn, updateDeliveries, dlRiding, resetDeliveries, deliveriesDebug, dlInternals } from './deliveries.js';
import { IC_STATE, icLogic, icHatch, icHatchNear, icMenu, icDistracted, updateIceCream, icConspic, resetIceCream, iceCreamDebug, shopHours, shopOpenAt, shutLine, hoursLine } from './icecream.js';
import { emitPuff, updatePuffs, updateAmbientSmoke, spawnTracer, updateTracers } from './fx.js';
import { buildPerson, dressCivilian, lam, SKINS, SHIRTS, PANTS, HAIRS, ragdolls, addRagdoll, setMood } from './people.js';
import { shopRooms, atmSpots, atmNear, shopSpots, shopNear, openShop, closeShop, shopBuy, CATALOG, spawnShopkeepers, animateShopkeepers, showShopkeepers } from './shops.js';
import { Ally } from './allies.js';
import { safehouses, safeAt, safeDoorNear, safeSpotNear } from './safehouses.js';
import { updateNews, newsTex } from './news.js';
import { PFX, renderFrame, initPostFX } from './postfx.js';
import { MH, resetManhunt, manhuntNewDay, updateManhunt, trySecondChance, mhTarget, mhRivalTarget, mhRivalCaughtByYou, mhRivalGone, manhuntNews, manhuntSweepCity, runnersLeft } from './manhunt.js';
import { WX, WX_NAMES, FESTIVALS, updateWeather, applyWeatherLook, resetWeather, forceWeather } from './weather.js';

const CFG = { days: 30, dayLength: 120, startHour: 7 }; // each day starts at dawn

generateWorld();
initPostFX();

// =====================================================================
// Game state
// =====================================================================
const G = {
  mode: 'menu', elapsed: 0, day: 1, hour: CFG.startHour, dayAmt: 1,
  hunters: [], cars: [], pickups: [], helis: [], drones: [],
  kills: 0, pingT: 40, spawnT: 0, flowT: 0, hunterCarT: 25, heartT: 0, overT: 0, airT: 0,
  shake: 0, hurtFlash: 0, msgT: 0,
  heat: 0, level: 0, lkp: { x: 0, z: 0 }, lastSeenT: 99, airTracking: 0, airAlertT: 0, spottedMsgT: 0,
  locale: '', localeT: 0, allies: [], drops: [], getUps: [], contract: null, offers: [], offersDay: 0, safe: null, inSafe: null, napDay: 0, sleepT: 0, localSus: {}, conspic: 0, unseenT: 99, stareT: 0, hitstopT: 0, fovKick: 0, fireHeld: false,
};
// weapons: the pistol you start with, plus whatever the gun shops will sell you
const WEAPONS = {
  hands: { name: 'EMPTY HANDS', hands: true, melee: true, sus: 0 },
  pistol: { name: 'PISTOL', sus: 0.75, mag: 12, cd: 0.17, spread: 0.008, pellets: 1, reload: 1.3, maxRes: 180, heat: 2.5, alert: 45 },
  crowbar: { name: 'CROWBAR', melee: true, sus: 0.22 },
  shotgun: { name: 'SHOTGUN', sus: 1, mag: 6, cd: 0.85, spread: 0.055, pellets: 8, reload: 2.1, maxRes: 60, heat: 3.5, alert: 55, range: 50 },
  laser: { name: 'LASER EYES', sus: 0, laser: true, cd: 0.06, auto: true },
  smg: { name: 'SMG', sus: 0.95, mag: 30, cd: 0.075, spread: 0.02, pellets: 1, reload: 1.6, maxRes: 300, heat: 1.1, alert: 55, auto: true },
};
const SLOTS = ['pistol', 'crowbar', 'shotgun', 'smg'];
const START_CASH = 45;
const freshAmmo = () => ({ pistol: { mag: 12, res: 48 }, shotgun: { mag: 0, res: 0 }, smg: { mag: 0, res: 0 } });
const player = {
  x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, hp: 100, stam: 100, exhausted: false,
  lastHurt: 99, shoveCd: 0, kx: 0, kz: 0, alive: true, car: null, ammo: freshAmmo(), reloadT: 0, fireCd: 0,
  cash: START_CASH, weapon: 'hands', lastWeapon: 'pistol', owned: new Set(['pistol']), launchCd: 0, meleeCd: 0, swingT: 9, swingKind: null, swingHit: true, switchT: 0,
  outfit: {}, disg: 0, drawnT: 99,
  bob: 0, dragT: 0, carHitCd: 0, recoil: 0, shoveAnim: 0, camOff: 0, sprinting: false,
};
resetParkour(player);
const dayMult = () => 1 + (G.day - 1) * 0.016;
const targetPos = () => (player.car ? { x: player.car.x, z: player.car.z } : { x: player.x, z: player.z });
const playerEyeY = () => (player.car ? 1.2 : player.y + eyeHeight(player) - 0.3);

// ---------------------------------------------------------------------
// Profile ("how wanted you are")
// ---------------------------------------------------------------------
const LEVELS = [0, 20, 60, 120, 190, 270];
const LEVEL_NAMES = ['LOW PROFILE', 'NOTICED', 'KNOWN FACE', 'WANTED', 'MOST WANTED', 'PUBLIC ENEMY'];
const HELIS_AT = [0, 0, 1, 1, 2, 3];
const DRONES_AT = [0, 1, 2, 3, 4, 6];
function addHeat(n) { if (G.super) return; G.heat = clamp(G.heat + n, 0, 330); }
function heatFloor() { return (G.day - 1) * 2; }
// local suspicion: how much the people round here have started to wonder about you. Spending money,
// hanging about and making a scene all add to it; it fades once you've moved on.
const localKey = (x, z) => { const c = cityAt(x, z, 20); return c ? c.name : 'COUNTRY'; };
function localSus() { const tp = targetPos(); return G.localSus[localKey(tp.x, tp.z)] || 0; }
function bumpLocal(n) { const tp = targetPos(), k = localKey(tp.x, tp.z); G.localSus[k] = clamp((G.localSus[k] || 0) + n, 0, 1); }
// how much you stand out right now (0 = just another face in the crowd)
// how alarming the thing in your hands looks (a crowbar could be for work; a shotgun is not)
function heldSus() { return player.car || G.super ? 0 : WEAPONS[player.weapon].sus || 0; }
function conspicuous() {
  if (player.hide) return 0;
  if (player.car) return Math.abs(player.car.speed) > 22 ? 0.8 : 0.25;
  let k = 0.1;
  if (player.sprinting) k += 0.8;
  else if (Math.hypot(player.vx, player.vz) < 0.5) k -= 0.04;
  const held = heldSus();
  k += held * (player.drawnT < 4 ? 1.1 : 0.75); // whatever's in your hands, and more so if you just used it
  if (player.drawnT < 4 && held > 0) k += 0.15;
  if (player.mode !== 'move' || (player.y > 1.6 && !inCinema(player.x, player.z))) k += 0.6; // climbing about, up on the rooftops (not up the back of the cinema)
  if (player.crouch > 0.5) k += 0.15;
  if (player.hp < 45) k += 0.15; // looking roughed up
  k += stealthConspic(); // smelling of bins
  k += gigConspic(GJ); // at work: nobody looks twice
  k += marketConspic(MK); // lost in the market crowd, or hiding behind a bunch of flowers
  k += townDayConspic(TDK) + kidsConspic(TDK); // a runner in the fun run, a face at the fete, a tired parent with a pram
  k += mdConspic(TDK) + icConspic(TDK); // one of hundreds on the terrace, head bowed in a pew, licking a cone
  k += cnConspic(TDK) + lnConspic(TDK) + awConspic(TDK); // a face in the dark in row J, a bored person waiting for their wash
  for (const V of XV) k += V.conspic(TDK); // a pub watching the match, a bowler, a swimmer, a bus passenger
  return Math.max(0, k);
}
const knownFace = () => (0.3 + G.level * 0.55) * (1 - 0.6 * player.disg) * (1 + 2.5 * localSus()) * (1 + (G.day - 1) * 0.015);
function reportSighting(x, z) { G.lkp.x = x; G.lkp.z = z; G.lastSeenT = 0; }
const searchRadius = () => clamp(12 + G.lastSeenT * 1.6, 12, 110);

// ---------------------------------------------------------------------
// Day / night clock: nights pass faster than days
// ---------------------------------------------------------------------
const HOUR_TABLE = (() => {
  const steps = 96, cum = [0];
  for (let i = 0; i < steps; i++) { const h = (CFG.startHour + i / 4) % 24; cum.push(cum[i] + (h >= 6 && h < 20 ? 1 : 0.45)); }
  return { steps, cum, total: cum[steps] };
})();
function hourAt(elapsed) {
  const p = ((elapsed / CFG.dayLength) % 1) * HOUR_TABLE.total, c = HOUR_TABLE.cum;
  let i = 0; while (i < HOUR_TABLE.steps - 1 && c[i + 1] < p) i++;
  return (CFG.startHour + (i + (p - c[i]) / (c[i + 1] - c[i])) / 4) % 24;
}

function hurtPlayer(dmg, fromX, fromZ, knock = 0) {
  if (!player.alive || G.mode !== 'playing') return;
  if (MH.invulnT > 0) return;
  if (G.super) { player.hp = Math.max(1, player.hp - dmg * 0.05); G.shake = Math.min(0.3, G.shake + dmg / 120); return; } // more or less unkillable
  player.hp -= dmg; player.lastHurt = 0;
  G.hurtFlash = Math.min(1, G.hurtFlash + 0.35 + dmg / 40); G.shake = Math.min(0.5, G.shake + dmg / 60);
  if (knock && !player.car) { const dx = player.x - fromX, dz = player.z - fromZ, d = Math.hypot(dx, dz) || 1; player.kx += (dx / d) * knock; player.kz += (dz / d) * knock; }
  sfx.hurt();
  if (player.hp <= 0) { player.hp = 0; killPlayer(); }
}

// =====================================================================
// Hunters (everyone) — civilians, runners, brutes, and police at high profile
// =====================================================================
const HTYPES = {
  civ: { speed: 5.0, walk: 1.6, dmg: 7, scale: 1.0, hp: 2, knock: 1.0, stun: 1.8 },
  runner: { speed: 6.6, walk: 2.0, dmg: 5, scale: 0.95, hp: 2, knock: 1.2, stun: 1.5 },
  brute: { speed: 4.0, walk: 1.3, dmg: 14, scale: 1.28, hp: 5, knock: 0.45, stun: 0.9 },
  cop: { speed: 5.6, walk: 1.8, dmg: 6, scale: 1.04, hp: 3, knock: 0.8, stun: 1.2 },
};
const qMarkerMat = new THREE.SpriteMaterial({
  map: canvasTex(64, 64, (ctx) => { ctx.fillStyle = '#ffc23a'; ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#222'; ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 32, 34); }),
  depthTest: false, transparent: true,
});
// how each hunter goes about it, so a crowd doesn't move like one zombie horde
const ROLES = ['rusher', 'rusher', 'rusher', 'flanker', 'flanker', 'hesitant', 'hesitant', 'stalker', 'coward'];
const markerMat = new THREE.SpriteMaterial({
  map: canvasTex(64, 64, (ctx) => { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 32, 34); }),
  depthTest: false, transparent: true,
});

class Hunter {
  constructor(x, z, type, gunner, state = 'search') {
    this.type = type; this.T = HTYPES[type]; this.gunner = gunner || type === 'cop';
    const cop = type === 'cop';
    const look = {
      skin: mpick(SKINS), hair: mpick(HAIRS), gun: this.gunner,
      pants: cop ? 0x1a2238 : mpick(PANTS),
      shirt: cop ? 0x2a3f78 : type === 'runner' ? mpick([0xd6763a, 0xc93030, 0xe0c030]) : type === 'brute' ? mpick([0x333333, 0x4a3a2a, 0x2c3e66]) : mpick(SHIRTS),
      cap: cop ? 0x1a2238 : null, vest: cop ? 0x222222 : null,
    };
    // townsfolk dress for who they are: office types, pensioners, dock workers in hi-vis...
    let folkSlow = 1; this.folk = null;
    if (type === 'civ' && !this.gunner) { const c = cityAt(x, z, 40); const o = dressCivilian(look, c ? c.name : '', folkMix(G.hour, G.day)); this.folk = o.kind; folkSlow = o.slow; }
    this.p = buildPerson(look); this.g = this.p.group;
    this.g.scale.setScalar(this.T.scale);
    this.marker = new THREE.Sprite(markerMat); this.marker.scale.setScalar(0.55); this.marker.position.y = 2.35; this.marker.visible = false;
    this.g.add(this.marker);
    scene.add(this.g);
    this.x = x; this.z = z; this.vx = 0; this.vz = 0; this.face = Math.random() * 6.28;
    this.hp = this.T.hp; this.state = state; this.thinkT = Math.random() * 0.3;
    this.attackCd = 0; this.fireCd = mr(1.2, 2.4); this.aimT = 0;
    this.stun = 0; this.kx = 0; this.kz = 0; this.phase = Math.random() * 10; this.hasLOS = false; this.lastSeen = 0;
    this.wt = null; this.progT = 0; this.lx = x; this.lz = z; this.alertT = -1; this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.dead = false;
    this.role = type === 'cop' ? mpick(['rusher', 'flanker', 'flanker']) : type === 'brute' ? mpick(['rusher', 'hesitant', 'stalker']) : mpick(ROLES);
    this.y = groundY(x, z); this.vy = 0; this.peakY = this.y; this.climb = null; this.ladder = null;
    this.sus = 0; this.huntT = 0; this.panicT = 0; this.thinkAt = G.elapsed; this.home = { x, z };
    this.spdMul = mr(0.82, 1.1) * folkSlow; if (this.folk === 'pensioner') this.role = mpick(['hesitant', 'stalker', 'coward', 'rusher']); this.noticeT = 0; this.waitT = 0; this.flankSide = Math.random() < 0.5 ? 1 : -1; this.shoutT = 0;
  }
  alert(delay = 0) {
    if (this.state === 'chase') return;
    if (delay > 0) { if (this.alertT < 0) this.alertT = delay; return; }
    this.state = 'chase'; this.lastSeen = 0; this.sus = 0; this.noticeT = mr(0.35, 1.1) + player.disg * 1.6; // a double-take before they commit (longer if you're in disguise)
    if (player.disg > 0) wearDisguise(0.035);
  }
  remove() { scene.remove(this.g); this.dead = true; this.gone = true; releaseJob(this); lifeInterrupt(this); }
  die(impulse, hitY, byPlayer = false, loot = byPlayer) {
    if (this.dead) return;
    lifeInterrupt(this); releaseJob(this);
    this.dead = true; this.marker.visible = false;
    this.g.position.set(this.x, this.y, this.z);
    addRagdoll(this.p, this.T.scale, { x: this.vx + this.kx, y: 0, z: this.vz + this.kz }, impulse, hitY);
    { const il = Math.hypot(impulse.x, impulse.z) || 1; knockFX(ragdolls[ragdolls.length - 1], hitKindNow(), hitY, impulse.x / il, impulse.z / il); }
    if (byPlayer) { G.kills++; addHeat(this.type === 'cop' ? 22 : 14); }
    if (loot) maybeDropCash(this);
    if (this.contract) contractTargetDown(this);
    if (this.rival) rivalDown(this);
  }
  damage(n, dirX, dirZ, hitY, byPlayer = true) {
    this.hp -= n; this.alert();
    if (this.hp > 0) hitFX(this.x, this.y + 1.8 * this.T.scale, this.z, hitKindNow());
    if (this.hp <= 0) this.die({ x: dirX * 7, y: 2.5, z: dirZ * 7 }, hitY, byPlayer, true);
    else { this.stun = Math.max(this.stun, 0.25); this.kx += dirX * 2.5 * this.T.knock; this.kz += dirZ * 2.5 * this.T.knock; }
  }
  update(dt) {
    const T = this.T, tp = targetPos();
    const dx = tp.x - this.x, dz = tp.z - this.z, d = Math.hypot(dx, dz);
    const dy = player.car ? 0 : player.y - this.y;
    // their face shows how they feel about you
    setMood(this.p, this.held || this.cowerT > 0 || this.panicT > 0 || this.stun > 0 ? 'scared' : this.state === 'chase' ? 'angry' : this.sus > 0.5 || this.alertT >= 0 ? 'smug' : G.super && d < 20 ? 'happy' : 'neutral');
    if (this.climb || this.ladder) { this.updateClimb(dt); return; }
    if (this.held) { // dangling in front of you, legs going
      camera.getWorldDirection(_hd);
      this.x = camera.position.x + _hd.x * 1.5; this.z = camera.position.z + _hd.z * 1.5; this.y = camera.position.y - 1.6 + _hd.y * 1.5;
      this.face = player.yaw; const k = Math.sin(G.elapsed * 14);
      this.p.legL.rotation.x = k * 0.9; this.p.legR.rotation.x = -k * 0.9; this.p.armL.rotation.x = -2.6 + k * 0.4; this.p.armR.rotation.x = -2.6 - k * 0.4;
      this.g.position.set(this.x, this.y, this.z); this.g.rotation.y = this.face + Math.PI;
      this.begT = (this.begT ?? 0) - dt; if (this.begT <= 0) { this.begT = mr(1.6, 2.6); say(this, mpick(HELD_LINES)); }
      return;
    }
    if (this.bike && bikeRide(this, dt, BK)) return; // pedalling along the bike lane (or after you)
    if (G.super && (this.state === 'chase' || this.alertT >= 0)) { this.state = 'search'; this.alertT = -1; this.panicT = mr(4, 7); this.wt = null; this.sus = 0; }
    this.attackCd -= dt; this.fireCd -= dt;
    if (this.alertT >= 0) { this.alertT -= dt; if (this.alertT < 0) this.alert(); }

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.2 + Math.random() * 0.12;
      let see = !this.inside && d < 90 && (d > 50 ? los(this.x, this.z, tp.x, tp.z) : true) && losSolid(this.x, this.y + 1.6, this.z, tp.x, player.car ? 1.2 : playerEyeY(), tp.z);
      this.hasLOS = see = see && (!player.hide || this.checkSpot === player.hide) && !XV.some((V) => V.unseen && V.unseen(this)); // nobody can see into a closed bin (unless they watched you climb in)
      const tdt = Math.min(0.5, G.elapsed - this.thinkAt); this.thinkAt = G.elapsed;
      if (this.state !== 'chase' && !G.super) {
        // nobody clocks you instantly: they get suspicious first, faster the more you stand out
        const sight = lerp(17, 34, G.dayAmt) * (player.car ? 1.4 : 1) * (G.weatherSight ?? 1);
        const ahead = (Math.sin(this.face) * dx + Math.cos(this.face) * dz) / (d || 1);
        const looking = d < 4 || ahead > 0.3 || this.huntT > 0 || this.sus > 0.4;
        let gain = 0;
        if (see && d < sight && looking) {
          gain = G.conspic * knownFace() * lerp(1.8, 0.35, clamp(d / sight, 0, 1)) * 0.9 * (WX.crowd > 1 ? 0.65 : 1);
          if (d < 14 && !player.car) bumpLocal(tdt * 0.0025 * (WX.crowd > 1 ? 0.5 : 1));
          reactToItem(this, d, tdt);
        }
        if (Math.abs(dy) < 3 && d < 14 && player.sprinting) gain += 0.5 * knownFace(); // pounding footsteps
        if (gain > 0) this.sus += gain * tdt; else this.sus = Math.max(0, this.sus - tdt * 0.06);
        if (this.sus > 0.45 && see) G.stareT = 0.4;
        if (this.sus >= 1) { this.alert(); shout(this); }
      } else if (see) { this.lastSeen = 0; if (d < 60) reportSighting(tp.x, tp.z); }
    }

    let tvx = 0, tvz = 0, lifeMode = null;
    if (this.stun > 0) {
      this.stun -= dt;
    } else if (this.state === 'chase') {
      this.lastSeen += dt;
      if (player.hide) { if (hideHunterThink(this, d, SK)) return; if (this.checkSpot !== player.hide && this.lastSeen > 1.5) { this.state = 'search'; this.wt = randomOpenPoint(G.lkp.x, G.lkp.z, 2, 12) || null; this.huntT = 20; this.sus = 0.5; return; } }
      if (this.lastSeen > (this.role === 'coward' ? 4 : 8) && d > 18) { this.state = 'search'; this.wt = null; this.huntT = 20; this.sus = 0.55; }
      let tx = tp.x, tz = tp.z, spdK = 1, hold = 0;
      const crowd = G.hunters.reduce((n, o) => n + (o !== this && !o.dead && o.state === 'chase' && Math.abs(o.x - tp.x) + Math.abs(o.z - tp.z) < 14 ? 1 : 0), 0);
      if (player.hide && this.checkSpot === player.hide) { /* they watched you climb in: no hanging back, straight over to the lid */ }
      else if (this.role === 'flanker' && d > 7 && d < 60) { // swing wide and come in from the side
        const px = -dz / (d || 1), pz = dx / (d || 1), off = Math.min(14, d * 0.6) * this.flankSide;
        const fx2 = tp.x + px * off, fz2 = tp.z + pz * off;
        if (!blockedAt(fx2, fz2) && los(this.x, this.z, fx2, fz2)) { tx = fx2; tz = fz2; }
      } else if (this.role === 'hesitant' && crowd < 2 && d < 16) hold = 10; // won't go in alone
      else if (this.role === 'stalker' && d > 6) { // keep a distance until you turn your back
        const fx3 = -Math.sin(player.yaw), fz3 = -Math.cos(player.yaw), facing = ((this.x - tp.x) * fx3 + (this.z - tp.z) * fz3) / (d || 1);
        if (facing > 0.3 || player.car) hold = 15; else spdK = 1.15;
      } else if (this.fleer ? d < 40 : this.role === 'coward' && (G.shotT < 4 || G.kills > 0 && crowd < 3) && d < 26) hold = -1; // runs off when things get loud
      // you're on another level: find stairs or a ladder that gets them closer (brutes won't do ladders)
      let goLadder = null;
      if (Math.abs(dy) > 1.4 && d < 90) {
        let bd = 70;
        for (const Lk of links) {
          if (Lk.kind === 'ladder' && this.type === 'brute') continue;
          for (const [s0, e0] of [[Lk.a, Lk.b], [Lk.b, Lk.a]]) {
            if (Math.abs(s0.y - this.y) > 1.1 || Math.abs(e0.y - player.y) > Math.abs(dy) - 1) continue;
            const ld = Math.abs(s0.x - this.x) + Math.abs(s0.z - this.z) + (Math.abs(e0.x - tp.x) + Math.abs(e0.z - tp.z)) * 0.5;
            if (ld < bd) { bd = ld; goLadder = { s: s0, e: e0, Lk }; }
          }
        }
        if (goLadder) { tx = goLadder.s.x; tz = goLadder.s.z; hold = 0; }
        if (goLadder && Math.hypot(tx - this.x, tz - this.z) < 1.0) {
          const { s: s0, e: e0, Lk } = goLadder, len = Math.hypot(e0.x - s0.x, e0.y - s0.y, e0.z - s0.z);
          this.climb = { t: 0, dur: len / (Lk.kind === 'ladder' ? (this.type === 'runner' ? 3.4 : 2.4) : 3.6), fx: this.x, fy: this.y, fz: this.z, tx: e0.x, ty: e0.y, tz: e0.z, kind: Lk.kind };
          this.face = Math.atan2(e0.x - s0.x, e0.z - s0.z); this.stun = 0; return;
        }
      }
      const ex0 = tx - this.x, ez0 = tz - this.z;
      if (this.y > 1 || this.y < -1) { /* on a roof or underground: straight at it */ }
      else if (!((this.hasLOS && Math.abs(dy) < 1.5) || d < 4) || (Math.hypot(ex0, ez0) > 3 && !los(this.x, this.z, tx, tz))) { const n = navTarget(this.x, this.z, 2); if (n && !(goLadder && (los(this.x, this.z, tx, tz)))) { tx = n.x; tz = n.z; } }
      const ex = tx - this.x, ez = tz - this.z, ed = Math.hypot(ex, ez) || 1;
      const spd = T.speed * dayMult() * this.spdMul * spdK;
      if (this.noticeT > 0) { this.noticeT -= dt; tvx = 0; tvz = 0; }
      else if (hold < 0) { tvx = (-dx / (d || 1)) * spd * 0.9; tvz = (-dz / (d || 1)) * spd * 0.9; }
      else if (hold > 0 && this.hasLOS && d < hold + 4) {
        const back = d < hold - 2 ? -0.6 : d > hold + 1 ? 0.6 : 0, px = -dz / (d || 1), pz = dx / (d || 1);
        tvx = (dx / (d || 1)) * back * T.walk + px * 1.2 * this.strafe; tvz = (dz / (d || 1)) * back * T.walk + pz * 1.2 * this.strafe;
        if (Math.random() < dt * 0.5) this.strafe *= -1;
        this.shoutT -= dt; if (this.shoutT <= 0) { this.shoutT = mr(2.5, 4); shout(this); }
      } else if (this.gunner && this.hasLOS && d < 30) {
        if (d < 13) {
          const px = -dz / (d || 1), pz = dx / (d || 1);
          tvx = px * 1.6 * this.strafe; tvz = pz * 1.6 * this.strafe;
          if (Math.random() < dt * 0.4) this.strafe *= -1;
        } else { tvx = (ex / ed) * spd * 0.8; tvz = (ez / ed) * spd * 0.8; }
        if (this.fireCd <= 0) { this.aimT += dt; if (this.aimT > 0.35) { this.aimT = 0; this.fireCd = mr(1.3, 2.3) / Math.min(1.6, dayMult()); hunterShoot(this, d); } }
      } else { tvx = (ex / ed) * spd; tvz = (ez / ed) * spd; }
      const reach = player.car ? 2.7 : 1.25 + (this.type === 'brute' ? 0.25 : 0);
      if (d < reach && Math.abs(dy) < 1.3 && this.attackCd <= 0 && player.alive && !player.hide) {
        this.attackCd = this.type === 'runner' ? 0.7 : 1.0;
        if (player.car) player.car.damage(T.dmg * 0.6);
        else hurtPlayer(T.dmg, this.x, this.z, this.type === 'brute' ? 9 : 3);
      }
      if (player.car && d < 3 && Math.abs(player.car.speed) < 4) player.dragT += dt;
    } else {
      this.huntT = Math.max(0, this.huntT - dt);
      if (G.super) { // the hero's about: keep your head down and say nice things
        const close = d < (player.flying ? 16 : 7) && Math.abs(dy) < 25;
        if (close || (this.panicT > 0 && d < 5)) this.cowerT = 1.2;
        this.cowerT = Math.max(0, (this.cowerT || 0) - dt);
        if (this.cowerT > 0) {
          this.begT = (this.begT ?? mr(0, 1.5)) - dt;
          if (this.begT <= 0) { this.begT = mr(2.5, 5); const line = mpick(BEG_LINES); say(this, line); if (line === 'TAKE MY WALLET!') maybeDropCash(this); if (Math.random() < 0.4) sfx.scream(); }
        }
      }
      if ((this.cowerT > 0 || this.panicT > 0) && (this.act || this.inside)) lifeInterrupt(this); // scared: drop whatever they were doing, right now
      if (this.cowerT > 0) { this.waitT = 0; this.face += angDiff(this.face, Math.atan2(dx, dz)) * Math.min(1, dt * 6); }
      else if (this.panicT > 0) { // run for it, arms flailing
        this.panicT -= dt;
        const ax = -dx / (d || 1), az = -dz / (d || 1); let ox2 = ax, oz2 = az;
        if (blockedAt(this.x + ax * 2.5, this.z + az * 2.5)) { const n = this.navTo({ x: this.x + ax * 10, z: this.z + az * 10 }); if (n) { ox2 = n.x; oz2 = n.z; } }
        tvx = ox2 * T.speed * 0.9; tvz = oz2 * T.speed * 0.9; this.wt = null;
      } else if (this.sus > 0.45 && this.hasLOS && d < 40) { this.waitT = Math.max(this.waitT, 0.3); this.face += angDiff(this.face, Math.atan2(dx, dz)) * Math.min(1, dt * 4); } // "hang on, is that...?"
      else if (G.super && heroHolds(this)) { lifeMode = 'hold'; this.face += angDiff(this.face, Math.atan2(dx, dz)) * Math.min(1, dt * 5); }
      else if (this.act && (lifeMode = lifeStep(this, dt, LIFE))) { /* sitting, chatting, queueing, working... */ }
      else if (this.waitT > 0) { this.waitT -= dt; this.face += Math.sin(G.elapsed * 1.3 + this.phase) * dt * 1.2; }
      else if (!this.wt || Math.hypot(this.wt.x - this.x, this.wt.z - this.z) < 1.5) {
        if (this.wt && this.huntT <= 0 && Math.random() < 0.5 && lifeStart(this, LIFE)) { /* off to do something */ }
        else if (this.wt && Math.random() < 0.6) this.waitT = mr(1, 3.5); // stop and look around
        if (this.peek && this.wt) hunterPeekArrive(this, SK); // lift the lid and have a look
        const hunting = this.huntT > 0 && Math.random() < 0.8;
        const guess = hunting ? G.lkp : this.home;
        if (!(hunting && !this.waitT && hunterPickPeek(this, G.lkp))) this.wt = randomOpenPoint(guess.x, guess.z, hunting ? 2 : 5, hunting ? 25 : 40) || { x: this.x, z: this.z };
      }
      if (!this.wt) this.wt = { x: this.x, z: this.z };
      const ex = this.wt.x - this.x, ez = this.wt.z - this.z, ed = Math.hypot(ex, ez) || 1;
      let ox = ex / ed, oz = ez / ed;
      if (!(lifeMode === 'walk' && this.act && this.act.straight) && !los(this.x, this.z, this.wt.x, this.wt.z)) { const n = this.navTo(this.wt); if (n) { ox = n.x; oz = n.z; } } // a checked-clear route leg indoors walks straight: the coarse grid can't see the gaps between shelves
      if (!(this.panicT > 0) && !(this.cowerT > 0)) {
      const w = this.waitT > 0 || lifeMode === 'hold' ? 0 : T.walk * this.spdMul * (this.huntT > 0 ? 1.4 : 1) * (this.walkK || 1);
      tvx = ox * w; tvz = oz * w;
      this.progT += dt;
      if (this.progT > 2) { if (Math.hypot(this.x - this.lx, this.z - this.lz) < 0.6) this.wt = null; this.progT = 0; this.lx = this.x; this.lz = this.z; }
      }
    }

    const acc = Math.min(1, dt * (this.stun > 0 ? 2 : 8));
    this.vx = lerp(this.vx, tvx, acc); this.vz = lerp(this.vz, tvz, acc);
    this.kx *= Math.max(0, 1 - dt * 5); this.kz *= Math.max(0, 1 - dt * 5);
    const ox = this.x, oz = this.z;
    this.x += (this.vx + this.kx) * dt; this.z += (this.vz + this.kz) * dt;
    const wall = moveBody(this, ox, oz, 0.35 * T.scale, this.y, 1.8);
    if (this.y < 0.5) { const cx0 = this.x, cz0 = this.z; for (const c of G.cars) if (Math.abs(c.x - this.x) < c.hl + 2 && Math.abs(c.z - this.z) < c.hl + 2) resolveCircleCar(this, 0.35, c); if (this.x !== cx0 || this.z !== cz0) moveBody(this, cx0, cz0, 0.35 * T.scale, this.y, 1.8); }
    keepOutOfSolids(this);
    // scramble up walls to get at you (runners are good at it, brutes hopeless)
    if (wall && this.state === 'chase' && dy > 0.8 && d < 9 && this.stun <= 0 && this.noticeT <= 0 && Math.hypot(this.x - ox, this.z - oz) < dt * 1.5) {
      const ux = dx / (d || 1), uz = dz / (d || 1), top = stackTop(this.x + ux * 0.7, this.z + uz * 0.7, this.y);
      const maxUp = { runner: 4.3, cop: 3.1, civ: 2.5, brute: 1.4 }[this.type];
      if (top > 0 && top - this.y <= maxUp && floorAt(this.x + ux * 1.2, this.z + uz * 1.2, top + 0.02) >= top - 0.05 && headroom(this.x, this.z, this.y + 0.1, top - this.y + 1.7)) {
        this.climb = { t: 0, dur: 0.5 + (top - this.y) * 0.3, fx: this.x, fy: this.y, fz: this.z, tx: this.x + ux * 1.2, ty: top, tz: this.z + uz * 1.2 };
      }
    }
    // gravity: people who run off roofs fall, and a long fall knocks them out cold
    const prevY = this.y;
    this.vy -= 22 * dt; this.y += this.vy * dt;
    const floor = floorAt(this.x, this.z, Math.max(prevY, this.y));
    if (this.y <= floor) {
      if (this.peakY - floor > 6) { this.y = floor; this.die({ x: this.vx, y: 1, z: this.vz }, 0.5, false); return; }
      this.y = floor; this.vy = 0; this.peakY = floor;
    } else if (prevY - floor < 0.45 && this.vy <= 0 && this.y - floor < 0.45) { this.y = floor; this.vy = 0; }
    else this.peakY = Math.max(this.peakY, this.y);

    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.3) this.face += angDiff(this.face, Math.atan2(this.vx, this.vz)) * Math.min(1, dt * 10);
    if (this.state === 'chase' && (this.hasLOS || d < 10) && d < 30) this.face += angDiff(this.face, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
    this.phase += sp * dt * 2.4;
    const sw = Math.sin(this.phase) * Math.min(1, sp / 3) * 0.8, p = this.p;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    if (this.stun > 0) { p.armL.rotation.x = p.armR.rotation.x = -2.6; }
    else if (this.state === 'chase') {
      if (this.gunner && this.hasLOS && d < 30) { p.armR.rotation.x = -1.5; p.armL.rotation.x = -sw * 0.6; }
      else if (this.noticeT > 0) { p.armR.rotation.x = -1.4; p.armL.rotation.x = 0; } // pointing: "it's them!"
      else if (d < 2.6) { p.armL.rotation.x = -1.35 + sw * 0.25; p.armR.rotation.x = -1.35 - sw * 0.25; } // grabbing
      else { p.armL.rotation.x = -0.35 - sw * 1.1; p.armR.rotation.x = -0.35 + sw * 1.1; } // sprinting
    } else if (this.cowerT > 0) { p.armL.rotation.x = -2.9; p.armR.rotation.x = -2.9; p.armL.rotation.z = 0.3; p.armR.rotation.z = -0.3; p.legL.rotation.x = -1.2; p.legR.rotation.x = 0.4; }
    else if (this.panicT > 0) { p.armL.rotation.x = -2.8 + Math.sin(this.phase * 2) * 0.5; p.armR.rotation.x = -2.8 - Math.sin(this.phase * 2) * 0.5; }
    else { p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8; }
    if (!(this.cowerT > 0)) { p.armL.rotation.z = 0; p.armR.rotation.z = 0; }
    this.g.position.set(this.x, this.y + Math.abs(Math.cos(this.phase)) * Math.min(1, sp / 4) * 0.08 - (this.cowerT > 0 ? 0.45 : 0), this.z);
    this.g.rotation.y = this.face;
    if (this.act || this.job) lifePose(this, dt, LIFE);
    if (G.super) heroPersonPose(this, dt);
    const wary = this.state !== 'chase' && this.sus > 0.35 && d < 50;
    this.marker.visible = wary || (this.state === 'chase' && d < 70 && !(this.role === 'stalker' && d > 12));
    this.marker.material = wary || this.noticeT > 0 ? qMarkerMat : markerMat;
    this.marker.scale.setScalar(wary ? 0.3 + this.sus * 0.3 : 0.55);
  }
  updateClimb(dt) {
    const p = this.p;
    if (this.ladder) {
      const L = this.ladder;
      this.x = L.x + L.nx * 0.1; this.z = L.z + L.nz * 0.1; this.y += (this.type === 'runner' ? 3.6 : 2.6) * dt;
      this.face = Math.atan2(-L.nx, -L.nz);
      p.armL.rotation.x = -2.6 + Math.sin(this.y * 4) * 0.4; p.armR.rotation.x = -2.6 - Math.sin(this.y * 4) * 0.4;
      p.legL.rotation.x = Math.sin(this.y * 4) * 0.5; p.legR.rotation.x = -Math.sin(this.y * 4) * 0.5;
      if (this.y >= L.y1 - 1) { this.ladder = null; this.climb = { t: 0, dur: 0.5, fx: this.x, fy: this.y, fz: this.z, tx: L.x - L.nx * 1.1, ty: L.y1, tz: L.z - L.nz * 1.1 }; }
    } else {
      const C = this.climb; C.t += dt;
      const k = Math.min(1, C.t / C.dur), e = C.kind ? k : k * k * (3 - 2 * k);
      this.x = lerp(C.fx, C.tx, e); this.z = lerp(C.fz, C.tz, e); this.y = lerp(C.fy, C.ty, C.kind ? e : Math.min(1, e * 1.5));
      if (C.kind === 'stairs') { const sw = Math.sin(C.t * 9) * 0.7; p.legL.rotation.x = sw; p.legR.rotation.x = -sw; p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8; }
      else if (C.kind === 'ladder') { const sw = Math.sin(C.t * 8); p.armL.rotation.x = -2.6 + sw * 0.4; p.armR.rotation.x = -2.6 - sw * 0.4; p.legL.rotation.x = sw * 0.5; p.legR.rotation.x = -sw * 0.5; }
      else p.armL.rotation.x = p.armR.rotation.x = -2.8 + k * 2;
      if (k >= 1) { this.climb = null; this.vy = 0; this.peakY = this.y; }
    }
    this.g.position.set(this.x, this.y, this.z); this.g.rotation.y = this.face;
  }
  navTo(t) {
    const a = Math.atan2(t.x - this.x, t.z - this.z);
    for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const nx = this.x + Math.sin(a + off) * 3, nz = this.z + Math.cos(a + off) * 3;
      if (!blockedAt(nx, nz)) return { x: Math.sin(a + off), z: Math.cos(a + off) };
    }
    return null;
  }
}
function shout(h) {
  // people nearby turn to look; once you're properly famous they just join in
  for (const o of G.hunters) {
    if (o === h || o.state === 'chase' || Math.abs(o.x - h.x) > 20 || Math.abs(o.z - h.z) > 20 || Math.random() > 0.5) continue;
    if (G.level >= 3) o.alert(mr(0.6, 2.2)); else { o.sus = Math.max(o.sus, 0.7); o.huntT = Math.max(o.huntT, 12); }
  }
}
// someone sees what's in your hands: a crowbar gets a funny look, a gun gets screams and a phone call
function reactToItem(h, d, tdt) {
  const s = heldSus(); if (s <= 0 || d > 22 || h.contract || h.guard || h.rival) return;
  h.itemT = (h.itemT || 0) + tdt * s;
  if (h.itemT < 0.6 || h.reacted) return;
  h.reacted = true;
  if (s >= 0.6) {
    const brave = h.type === 'brute' || h.type === 'cop' || h.role === 'rusher';
    if (!brave || Math.random() < 0.4) { h.panicT = mr(4, 7); h.sus = 0; say(h, mpick(s >= 1 ? ['THEY\'VE GOT A SHOTGUN!', 'RUN!', 'EVERYBODY DOWN!'] : ['GUN! GUN!', 'THEY\'RE ARMED!', 'CALL SOMEONE!'])); sfx.scream(); bumpLocal(0.06 * s); addHeat(5 * s); reportSighting(player.x, player.z); for (const o of G.hunters) if (o !== h && !o.dead && o.state !== 'chase' && Math.abs(o.x - h.x) < 14 && Math.abs(o.z - h.z) < 14 && Math.random() < 0.5) o.panicT = mr(3, 6); }
    else { h.sus = Math.max(h.sus, 0.85); say(h, mpick(['OI. PUT THAT DOWN', 'THAT\'S HIM', 'I KNOW THAT FACE'])); }
  } else { h.sus = Math.max(h.sus, 0.35 + s); if (Math.random() < 0.5) say(h, mpick(['WHAT\'S THE CROWBAR FOR?', 'HMM.', 'DOING SOME WORK?'])); }
}
// tell people to go and have a look (aircraft, leaks): they still have to spot you themselves
function sendLooking(x, z, r, t = 15) {
  for (const h of G.hunters) if (!h.dead && h.state !== 'chase' && Math.abs(h.x - x) < r && Math.abs(h.z - z) < r) { h.huntT = Math.max(h.huntT, t); h.wt = randomOpenPoint(x, z, 1, 14) || h.wt; }
}
function alertAround(x, z, r, maxDelay = 1.5) {
  for (const h of G.hunters) if (Math.abs(h.x - x) < r && Math.abs(h.z - z) < r) h.alert(mr(0, maxDelay));
}

const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _dir = new THREE.Vector3();
function shootAtPlayer(from, pHit, dmg, color, dist) {
  const tp = targetPos();
  if (!player.car && player.sprinting) pHit *= 0.55;
  const hit = Math.random() < pHit;
  _to.set(tp.x, playerEyeY(), tp.z);
  if (!hit) {
    _to.x += mr(-1.6, 1.6); _to.y += mr(-0.6, 1); _to.z += mr(-1.6, 1.6);
    _dir.subVectors(_to, from).normalize();
    const w = raycastWorld(from, _dir, 120); _to.copy(from).addScaledVector(_dir, w.t);
    emitPuff(_to.x, _to.y, _to.z, { life: 0.4, vy: 0.5, size0: 0.2, size1: 0.8, alpha: 0.6, color: 0xbbbbbb });
  }
  spawnTracer(from.clone(), _to.clone(), color);
  sfx.enemyShot(dist);
  if (hit) { if (player.car) player.car.damage(dmg); else hurtPlayer(dmg, from.x, from.z, 1.5); }
}
function hunterShoot(h, d) {
  const s = h.T.scale;
  _from.set(h.x + Math.cos(h.face) * 0.4 * s + Math.sin(h.face) * 0.6, h.y + 1.45 * s, h.z - Math.sin(h.face) * 0.4 * s + Math.cos(h.face) * 0.6);
  shootAtPlayer(_from, (0.3 + G.day * 0.008) * clamp(1.4 - d / 30, 0.4, 1.2), 7, 0xffa060, d);
}

// =====================================================================
// Cars
// =====================================================================
const CAR_COLORS = [0xe8c020, 0xe8c020, 0xb3202a, 0x2a4fa0, 0xdddddd, 0x222226, 0x2f6b45, 0x9aa0a8, 0x7a2a6a, 0xd0703a];
const carGeoCache = new Map();
// vehicle kinds: half length / half width, collision circles along the body, top speed
const VKINDS = {
  car: { hl: 2.25, hw: 1.0, offs: [1.25, -1.25], top: 28 },
  hatch: { hl: 1.85, hw: 0.95, offs: [0.85, -0.85], top: 26 },
  van: { hl: 2.6, hw: 1.08, offs: [1.5, -1.5], top: 24 },
  truck: { hl: 3.5, hw: 1.2, offs: [2.4, 0, -2.4], top: 20 },
  bus: { hl: 5.6, hw: 1.3, offs: [4.4, 1.5, -1.5, -4.4], top: 18 },
  binlorry: { hl: 4.0, hw: 1.25, offs: [2.8, 0, -2.8], top: 16 },
  icecream: { hl: 2.7, hw: 1.08, offs: [1.5, -1.5], top: 15 },
  coach: { hl: 6.0, hw: 1.3, offs: [4.6, 1.5, -1.5, -4.6], top: 18 },
};
const BUS_COLORS = { 'PORT HALDEN': 0xc8282a, ASHFORD: 0x2a8a4a, 'SALTMARSH DOCKS': 0x2a5aa0 };
function vehicleGeometry(kind, color) {
  if (kind === 'car') return carGeometry(color, color === 0xe8c020);
  const key = kind + color;
  if (carGeoCache.has(key)) return carGeoCache.get(key);
  const b = new GeoBuf(), K = VKINDS[kind], L = K.hl, W = K.hw, glass = 0x1e2638;
  const wheels = (zs, r = 0.36) => { for (const z of zs) for (const x of [-W + 0.05, W - 0.05]) b.box(x - 0.15, x + 0.15, 0, r * 2, z - r, z + r, 0x111111); };
  if (kind === 'hatch') {
    b.box(-W, W, 0.35, 0.98, -L, L, color, { bottom: true }); b.box(-W + 0.1, W - 0.1, 0.98, 1.58, -L + 0.2, L - 0.9, glass); b.box(-W + 0.08, W - 0.08, 1.55, 1.63, -L + 0.2, L - 0.95, color);
    wheels([L - 0.6, -L + 0.6], 0.33);
  } else if (kind === 'van') {
    b.box(-W, W, 0.4, 2.15, -L, L - 0.9, color, { bottom: true }); b.box(-W, W, 0.4, 1.25, L - 0.9, L, color);
    b.box(-W + 0.06, W - 0.06, 1.25, 1.95, L - 0.95, L - 0.6, glass); b.box(-W - 0.01, W + 0.01, 1.3, 1.85, L - 1.6, L - 1.0, glass);
    b.box(-W - 0.02, W + 0.02, 0.9, 1.2, -L + 0.4, L - 1.3, shadeHexG(color, 0.8));
    wheels([L - 0.75, -L + 0.75]);
  } else if (kind === 'truck') {
    b.box(-W, W, 0.45, 2.3, L - 1.7, L, 0xe8e8e8, { bottom: true }); b.box(-W + 0.06, W - 0.06, 1.4, 2.1, L - 0.05, L + 0.02, glass);
    b.box(-W - 0.01, W + 0.01, 1.4, 2.0, L - 1.3, L - 0.4, glass);
    b.box(-W, W, 0.6, 3.1, -L, L - 1.8, color, { bottom: true }); b.box(-W - 0.02, W + 0.02, 1.0, 2.6, -L + 0.4, L - 2.2, shadeHexG(color, 1.25));
    b.box(-W + 0.2, W - 0.2, 0.25, 0.6, -L, L, 0x2a2a2a);
    wheels([L - 0.8, -L + 0.9, -L + 1.8], 0.42);
  } else if (kind === 'binlorry') { // cab up front, a big boxy body, the hopper and back step at the rear
    b.box(-W, W, 0.45, 2.5, L - 1.8, L, 0xf0f0ea, { bottom: true }); b.box(-W + 0.06, W - 0.06, 1.45, 2.3, L - 0.05, L + 0.02, glass);
    b.box(-W - 0.01, W + 0.01, 1.45, 2.2, L - 1.4, L - 0.5, glass);
    b.box(-W, W, 0.6, 3.2, -L + 1.1, L - 1.9, color, { bottom: true }); b.box(-W - 0.02, W + 0.02, 0.9, 1.2, -L + 1.1, L - 1.9, 0xf0f0ea);
    b.box(-W, W, 0.6, 2.7, -L, -L + 1.1, shadeHexG(color, 0.7)); b.box(-W + 0.2, W - 0.2, 1.3, 2.4, -L - 0.02, -L + 0.2, 0x1a1a1a); // hopper mouth
    b.box(-W, W, 0.35, 0.45, -L - 0.45, -L, 0x9a9aa0); for (const x of [-W + 0.1, W - 0.1]) b.box(x - 0.04, x + 0.04, 0.45, 2.2, -L - 0.08, -L - 0.02, 0x9a9aa0); // back step + grab rails
    for (let z = -L + 1.3; z < L - 2; z += 0.6) for (const x of [-W - 0.03, W + 0.01]) b.box(x, x + 0.02, 1.5, 1.7, z, z + 0.3, 0xffd020); // chevrons
    b.box(-0.35, 0.35, 2.5, 2.7, L - 1.2, L - 0.8, 0xff9a20); // beacon
    b.box(-W + 0.2, W - 0.2, 0.25, 0.6, -L, L, 0x2a2a2a);
    wheels([L - 0.9, -L + 1.2, -L + 2.2], 0.45);
  } else if (kind === 'icecream') { // a cream van with a pink stripe, a serving hatch each side and a giant cone on the roof
    b.box(-W, W, 0.4, 2.55, -L, L - 1.0, color, { bottom: true }); b.box(-W, W, 0.4, 1.3, L - 1.0, L, color);
    b.box(-W + 0.06, W - 0.06, 1.3, 2.05, L - 1.05, L - 0.7, glass); b.box(-W - 0.01, W + 0.01, 1.35, 1.9, L - 1.7, L - 1.1, glass);
    b.box(-W - 0.02, W + 0.02, 0.75, 1.0, -L, L, 0xe86aa8); b.box(-W - 0.02, W + 0.02, 2.3, 2.42, -L, L - 1.0, 0x6ac8e8);
    for (const x of [-W - 0.015, W + 0.005]) { b.box(x, x + 0.01, 1.35, 2.1, -L + 0.6, L - 2.0, 0x2a2a3a); b.box(x - 0.15, x + 0.16, 1.28, 1.34, -L + 0.5, L - 1.9, 0xd8d8e0); }
    b.cyl(0, -0.3, 0.05, 0.42, 2.55, 3.45, 0xd8a860, 8, false); b.box(-0.38, 0.38, 3.45, 3.85, -0.68, 0.08, 0xfaf4ea); b.box(-0.12, 0.12, 3.85, 4.05, -0.42, -0.18, 0xfaf4ea); b.box(-0.2, 0.2, 3.7, 3.95, -0.2, 0.0, 0xc83a3a);
    wheels([L - 0.75, -L + 0.75]);
  } else if (kind === 'coach') { // a white coach with a blue stripe, tinted windows and luggage doors along the bottom
    b.box(-W, W, 0.45, 3.4, -L, L, color, { bottom: true });
    b.box(-W - 0.02, W + 0.02, 1.7, 2.85, -L + 0.5, L - 1.0, 0x151a28); b.box(-W + 0.06, W - 0.06, 1.4, 3.0, L - 0.02, L + 0.02, 0x151a28);
    b.box(-W - 0.03, W + 0.03, 1.2, 1.55, -L, L, 0x2a5aa0); b.box(-W - 0.03, W + 0.03, 3.0, 3.2, -L, L, 0x2a5aa0);
    for (let z = -L + 1.2; z < L - 1.5; z += 2.2) for (const x of [-W - 0.035, W + 0.025]) b.box(x, x + 0.01, 0.55, 1.1, z, z + 1.8, 0xd8d8e0);
    b.box(-0.8, 0.8, 3.0, 3.3, L, L + 0.03, 0xffb020);
    wheels([L - 1.4, -L + 1.5, -L + 2.6], 0.5);
  } else if (kind === 'bus') {
    b.box(-W, W, 0.45, 3.1, -L, L, color, { bottom: true });
    b.box(-W - 0.02, W + 0.02, 1.55, 2.55, -L + 0.4, L - 0.5, glass); b.box(-W + 0.06, W - 0.06, 1.3, 2.7, L - 0.02, L + 0.02, glass);
    b.box(-W + 0.05, W - 0.05, 3.1, 3.2, -L + 0.3, L - 0.3, 0xdddddd); b.box(-W - 0.03, W + 0.03, 0.75, 0.95, -L, L, 0xf0f0f0);
    b.box(-0.7, 0.7, 2.75, 3.0, L, L + 0.03, 0xffb020);
    wheels([L - 1.3, -L + 1.4], 0.48);
  }
  for (const z of [L + 0.02, -L - 0.02]) b.box(-W + 0.05, W - 0.05, 0.3, 0.45, Math.min(z, z - Math.sign(z) * 0.1), Math.max(z, z - Math.sign(z) * 0.1), 0x333333);
  const g = b.geometry(); carGeoCache.set(key, g); return g;
}
function shadeHexG(hex, k) { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return c.getHex(); }
const lightGeoCache = new Map();
function vehicleLights(kind) {
  if (lightGeoCache.has(kind)) return lightGeoCache.get(kind);
  const K = VKINDS[kind], L = K.hl, y = kind === 'bus' || kind === 'coach' || kind === 'truck' || kind === 'binlorry' ? 0.9 : 0.72, b = new GeoBuf();
  for (const x of [-K.hw * 0.65, K.hw * 0.65]) { b.box(x - 0.22, x + 0.22, y, y + 0.2, L, L + 0.04, 0xfff6d0); b.box(x - 0.22, x + 0.22, y, y + 0.2, -L - 0.04, -L, 0xff2020); }
  const g = b.geometry(); lightGeoCache.set(kind, g); return g;
}
function carGeometry(color, taxi) {
  const key = color + (taxi ? 't' : '');
  if (carGeoCache.has(key)) return carGeoCache.get(key);
  const b = new GeoBuf();
  b.box(-1, 1, 0.37, 1.03, -2.25, 2.25, color, { bottom: true });
  b.box(-0.89, 0.89, 1.03, 1.64, -1.4, 0.9, 0x1e2638);
  b.box(-0.9, 0.9, 1.6, 1.68, -1.35, 0.85, color);
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) b.box(x - 0.15, x + 0.15, 0, 0.72, z - 0.36, z + 0.36, 0x111111);
  b.box(-0.95, 0.95, 0.3, 0.45, 2.2, 2.32, 0x333333); b.box(-0.95, 0.95, 0.3, 0.45, -2.32, -2.2, 0x333333);
  if (taxi) b.box(-0.35, 0.35, 1.68, 1.92, -0.45, -0.15, 0xfff4c0);
  const g = b.geometry(); carGeoCache.set(key, g); return g;
}
const lightGeo = (() => { const b = new GeoBuf(); for (const x of [-0.65, 0.65]) { b.box(x - 0.22, x + 0.22, 0.72, 0.92, 2.25, 2.29, 0xfff6d0); b.box(x - 0.22, x + 0.22, 0.72, 0.92, -2.29, -2.25, 0xff2020); } return b.geometry(); })();
const carMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const burntMat = new THREE.MeshLambertMaterial({ color: 0x1a1816 });
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });

function resolveCircleCar(p, r, car) {
  const dx = p.x - car.x, dz = p.z - car.z, s = Math.sin(car.heading), c = Math.cos(car.heading);
  const lf = dx * s + dz * c, lr = dx * c - dz * s;
  const qf = clamp(lf, -car.hl, car.hl), qr = clamp(lr, -car.hw, car.hw);
  let ef = lf - qf, er = lr - qr; const d2 = ef * ef + er * er;
  if (d2 > r * r) return false;
  if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; ef *= k; er *= k; }
  else { const pf = car.hl - Math.abs(lf), pr = car.hw - Math.abs(lr); if (pf < pr) { ef = (pf + r) * (Math.sign(lf) || 1); er = 0; } else { er = (pr + r) * (Math.sign(lr) || 1); ef = 0; } }
  p.x += s * ef + c * er; p.z += c * ef - s * er;
  return true;
}

class Car {
  constructor(lane, along, parked, kind = 'car', color0) {
    this.kind = kind; const K = VKINDS[kind];
    const color = color0 != null ? color0 : kind === 'bus' ? BUS_COLORS[(lane && cityAt(lane.axis === 'z' ? lane.fixed : along, lane.axis === 'z' ? along : lane.fixed, 30) || {}).name] || 0xc8282a : kind === 'truck' ? mpick([0xd0d0d0, 0x2a5aa0, 0xb03020, 0xe0b020, 0x2a6a3a]) : kind === 'binlorry' ? 0x2a7a3a : kind === 'icecream' ? 0xf4ecd8 : kind === 'coach' ? 0xf2f2f4 : mpick(CAR_COLORS);
    this.taxi = kind === 'car' && color === 0xe8c020;
    this.g = new THREE.Group();
    this.geo = vehicleGeometry(kind, color);
    this.body = new THREE.Mesh(this.geo, carMat); this.g.add(this.body);
    this.g.add(new THREE.Mesh(kind === 'car' ? lightGeo : vehicleLights(kind), lightMat));
    this.marker = new THREE.Sprite(markerMat); this.marker.scale.setScalar(0.9); this.marker.position.y = 2.7; this.marker.visible = false;
    this.g.add(this.marker);
    scene.add(this.g);
    this.hl = K.hl; this.hw = K.hw; this.offs = K.offs; this.top = K.top; this.smokeT = 0; this.far = false; this.stopT = 0;
    if (parked) this.park(parked); else this.placeOnLane(lane, along);
  }
  reset() { this.speed = 0; this.throttle = 0; this.steer = 0; this.reverseT = 0; this.stuckT = 0; this.hp = 100; this.wrecked = false; this.body.material = carMat; this.honkT = 0; }
  park(p) { this.reset(); this.lane = null; this.driver = null; this.x = p.x; this.z = p.z; this.heading = p.heading; }
  placeOnLane(lane, along) {
    this.reset(); this.lane = lane; this.driver = 'traffic';
    this.x = lane.axis === 'z' ? lane.fixed : along; this.z = lane.axis === 'z' ? along : lane.fixed;
    this.heading = lane.axis === 'z' ? (lane.dir > 0 ? 0 : Math.PI) : (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.speed = mr(6, 10); this.cruise = lane.cruise * mr(0.85, 1.15);
  }
  damage(n) { if (this.wrecked) return; this.hp -= n; if (this.hp <= 0) this.wreck(); }
  wreck() {
    this.wrecked = true; this.hp = 0; this.body.material = burntMat; sfx.crash();
    for (let i = 0; i < 8; i++) emitPuff(this.x + mr(-1, 1), 1, this.z + mr(-1, 1), { life: 1.5, vy: mr(1, 3), vx: mr(-2, 2), vz: mr(-2, 2), size0: 1, size1: 4, alpha: 0.7, color: 0x444444 });
    if (this.driver === 'player') { exitCar(true); hurtPlayer(15, this.x, this.z); showMsg('YOUR CAR IS WRECKED'); }
    else if (this.driver === 'hunter') ejectHunter(this, true);
    this.driver = null; this.marker.visible = false;
  }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }
  update(dt) {
    if (this.air) { // flying through the air, courtesy of the hero
      const A = this.air; A.vy -= 22 * dt; this.x += A.vx * dt; this.z += A.vz * dt; A.y += A.vy * dt; this.heading += A.spin * dt; A.roll += A.spin * 0.6 * dt;
      if (G.super && !A.hitV) for (const V of villainsNear(this.x, A.y + 0.8, this.z, 2.6)) { A.hitV = true; villainHit(V, 30, HC, A.vx * 0.5, A.vz * 0.5); A.vx *= -0.2; A.vz *= -0.2; sfx.crash(); showMsg('CAR TO THE FACE', 1.2); }
      if (A.y <= 0 && A.vy < 0) {
        A.y = 0; this.air = null; this.speed = 0; this.damage(100); sfx.crash(); G.shake = Math.max(G.shake, 0.25);
        for (let i = 0; i < 6; i++) emitPuff(this.x + mr(-2, 2), 0.5, this.z + mr(-2, 2), { life: 1.2, vy: mr(1, 3), vx: mr(-3, 3), vz: mr(-3, 3), size0: 1, size1: 3, alpha: 0.5, color: 0x8a8070 });
        for (const h of G.hunters) if (!h.dead && Math.hypot(h.x - this.x, h.z - this.z) < 3.5) { const dx = h.x - this.x, dz = h.z - this.z, dl = Math.hypot(dx, dz) || 1; launchHunter(h, dx / dl, dz / dl, true); }
        this.g.rotation.set(0, this.heading, 0);
      } else { const r = resolveCircle(this, 1.2); if (r) { A.vx *= -0.3; A.vz *= -0.3; } this.g.rotation.set(A.roll, this.heading, A.roll * 0.5); }
      this.g.position.set(this.x, A.y, this.z); return;
    }
    const pd = Math.abs(this.x - player.x) + Math.abs(this.z - player.z);
    this.far = pd > 420 && this.driver !== 'player';
    this.g.visible = pd < 480;
    if (this.far) { // cheap update far from the player
      if (this.driver === 'traffic') { this.x += this.fx * this.cruise * dt; this.z += this.fz * this.cruise * dt; this.wrap(); }
      return;
    }
    let throttle = 0, steer = 0, maxF = 14, brake = false;
    this.preSpeed = this.speed; // what it hit things at, before a wall slowed it down this frame
    const tp = targetPos();
    if (this.wrecked || !this.driver) {
      brake = true;
      if (this.wrecked) { this.smokeT -= dt; if (this.smokeT < 0) { this.smokeT = 0.25; emitPuff(this.x, 1.4, this.z, { life: 2.5, vy: 2, vx: mr(-0.5, 0.5), size0: 0.8, size1: 3.5, alpha: 0.5, color: 0x333333 }); } }
    } else if (this.driver === 'traffic') {
      maxF = this.cruise; let target = this.cruise;
      for (const o of G.cars) {
        if (o === this || o.far) continue;
        const ax = o.x - this.x, az = o.z - this.z;
        if (Math.abs(ax) > 16 || Math.abs(az) > 16) continue;
        const ahead = ax * this.fx + az * this.fz, side = Math.abs(ax * this.fz - az * this.fx), gap = this.hl + o.hl;
        if (ahead > 0 && ahead < gap + 4.5 && side < 2.2) target = Math.min(target, ahead < gap + 1 ? 0 : o.speed * 0.9);
      }
      for (const r of riders) { // cyclists ahead (pulling out round something, or turning)
        const ax = r.x - this.x, az = r.z - this.z; if (Math.abs(ax) > 14 || Math.abs(az) > 14) continue;
        const ahead = ax * this.fx + az * this.fz, side = Math.abs(ax * this.fz - az * this.fx);
        if (ahead > 0 && ahead < this.hl + 5 && side < this.hw + 0.7) target = Math.min(target, ahead < this.hl + 1.5 ? 0 : (r.bike ? r.bike.speed : 0) * 0.9);
      }
      if (!player.car) {
        const ax = player.x - this.x, az = player.z - this.z, ahead = ax * this.fx + az * this.fz, side = Math.abs(ax * this.fz - az * this.fx);
        if (ahead > 2 && ahead < 11 && side < 1.8) { target = 0; this.honkT -= dt; if (this.honkT < 0 && ahead < 9) { this.honkT = 2.5; if (G.mode === 'playing') sfx.horn(); } }
      }
      if (this.kind === 'bus') target = buses.logic(this, dt, busStopLogic(this, dt, target), TDK);
      else if (this.kind === 'binlorry') target = lorryLogic(this, dt, target, GJ);
      else if (this.kind === 'icecream') target = icLogic(this, dt, target, TDK);
      else if (this.kind === 'coach') target = coachLogic(this, dt, target, TDK);
      else if (this.kind === 'truck') target = deliveryLogic(this, dt, target, TDK);
      throttle = this.speed < target ? 1 : 0; brake = this.speed > target + 0.5;
      this.wrap();
    } else if (this.driver === 'hunter') {
      maxF = 19 * Math.min(1.25, dayMult());
      const dx = tp.x - this.x, dz = tp.z - this.z, d = Math.hypot(dx, dz);
      let ax = tp.x, az = tp.z;
      if (d > 20 && !los(this.x, this.z, tp.x, tp.z)) { const n = navTarget(this.x + this.fx * 3, this.z + this.fz * 3, 4); if (n) { ax = n.x; az = n.z; } }
      const diff = angDiff(this.heading, Math.atan2(ax - this.x, az - this.z));
      steer = clamp(diff * 2.2, -1, 1); throttle = Math.abs(diff) > 1.3 ? 0.5 : 1;
      if (this.reverseT > 0) { this.reverseT -= dt; throttle = -1; steer = -steer; }
      else if (Math.abs(this.speed) < 1.2) { this.stuckT += dt; if (this.stuckT > 1) { this.reverseT = 1.3; this.stuckT = 0; } }
      else this.stuckT = 0;
    } else if (this.driver === 'player') {
      maxF = this.top;
      throttle = input.fwd; steer = -input.side; brake = input.jump;
      if (throttle < 0 && this.speed > 1) { brake = true; throttle = 0; }
    }
    if (throttle > 0) this.speed += throttle * (this.driver === 'player' ? 13 : 9) * dt;
    else if (throttle < 0) this.speed = Math.max(-8, this.speed + throttle * 9 * dt);
    if (brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 22 * dt);
    this.speed -= this.speed * 0.2 * dt;
    if (!throttle && !brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2 * dt);
    this.speed = clamp(this.speed, -8, maxF);
    this.heading += steer * 1.9 * clamp(this.speed / 6, -1, 1) * dt;
    let hitWall = false;
    const nsub = Math.max(1, Math.ceil(Math.abs(this.speed * dt) / 0.35));
    for (let sub = 0; sub < nsub; sub++) {
      this.x += this.fx * this.speed * dt / nsub; this.z += this.fz * this.speed * dt / nsub;
      for (const off of this.offs) {
        const c = { x: this.x + this.fx * off, z: this.z + this.fz * off }, ox = c.x, oz = c.z;
        if (resolveCircle(c, 1.05)) { this.x += c.x - ox; this.z += c.z - oz; hitWall = true; }
      }
    }
    if (hitWall && Math.abs(this.speed) > 2) {
      const impact = Math.abs(this.speed);
      if (impact > 9) { this.damage((impact - 8) * 3); if (this.driver === 'player') { G.shake = 0.4; sfx.crash(); } }
      this.speed *= 0.35;
    }
    this.g.position.set(this.x, 0, this.z);
    this.g.rotation.y = this.heading;
    this.marker.visible = this.driver === 'hunter';
  }
  wrap() {
    const l = this.lane; if (!l) return;
    const along = l.axis === 'z' ? this.z : this.x;
    const over = l.dir > 0 ? along > l.a1 + 2 : along < l.a0 - 2;
    if (!over) return;
    const back = l.dir > 0 ? l.a0 : l.a1;
    const bx = l.axis === 'z' ? this.x : back, bz = l.axis === 'z' ? back : this.z;
    if (Math.hypot(bx - player.x, bz - player.z) > 40) { this.x = bx; this.z = bz; }
    else this.speed = 0;
  }
}

// buses pull in at shelters, wait a moment, and whoever's waiting gets on
function busStopLogic(bus, dt, target) {
  if (bus.stopT > 0) {
    bus.stopT -= dt;
    if (bus.stopT <= 0 && bus.stopAt) {
      let boarded = 0;
      for (const h of G.hunters) if (!h.dead && h.act && h.act.kind === 'bus' && h.act.phase === 'do' && Math.hypot(h.x - bus.stopAt.x, h.z - bus.stopAt.z) < 10) { h.remove(); boarded++; }
      bus.boarded = (bus.boarded || 0) + boarded;
    }
    return 0;
  }
  bus.scanT = (bus.scanT || 0) - dt;
  if (bus.scanT > 0) return target;
  bus.scanT = 0.4;
  for (const sp of lifeSpots) {
    if (sp.kind !== 'bus' || (bus.lastStop && Math.hypot(sp.x - bus.lastStop.x, sp.z - bus.lastStop.z) < 8)) continue;
    const ax = sp.x - bus.x, az = sp.z - bus.z, ahead = ax * bus.fx + az * bus.fz, side = Math.abs(ax * bus.fz - az * bus.fx);
    if (ahead > -1 && ahead < 3 && side < 9) {
      bus.lastStop = sp;
      if (lifeSpots.some((o) => o.kind === 'bus' && o.taken && Math.hypot(o.x - sp.x, o.z - sp.z) < 4) || Math.random() < 0.5) { bus.stopT = mr(3, 5); bus.stopAt = sp; if (G.mode === 'playing' && Math.hypot(bus.x - player.x, bus.z - player.z) < 40) sfx.horn(); return 0; }
    }
  }
  return target;
}
function carInteractions() {
  const cars = G.cars.filter((c) => !c.far);
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (Math.abs(a.x - b.x) > a.hl + b.hl + 2 || Math.abs(a.z - b.z) > a.hl + b.hl + 2) continue;
    let touched = false;
    for (const oa of a.offs) for (const ob of b.offs) {
      const ax = a.x + a.fx * oa, az = a.z + a.fz * oa, bx = b.x + b.fx * ob, bz = b.z + b.fz * ob;
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
      if (d < 2.1 && d > 1e-4) { const k = ((2.1 - d) / d) * 0.5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; touched = true; }
    }
    if (touched) {
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 8) { a.damage(rel * 1.5); b.damage(rel * 1.5); if (a.driver === 'player' || b.driver === 'player') { sfx.crash(); G.shake = 0.35; } }
      a.speed *= 0.6; b.speed *= 0.6;
    }
  }
  for (const c of cars) {
    const sp = Math.abs(c.speed);
    for (const h of G.hunters) {
      if (h.dead || Math.abs(h.x - c.x) > c.hl + 1.3 || Math.abs(h.z - c.z) > c.hl + 1.3) continue;
      const before = { x: h.x, z: h.z };
      if (resolveCircleCar(before, 0.4, c)) {
        if (sp > 5) { setHitKind('car'); h.die({ x: c.fx * c.speed * 0.9 + mr(-1, 1), y: 3 + sp * 0.3, z: c.fz * c.speed * 0.9 + mr(-1, 1) }, 0.8, c.driver === 'player'); sfx.thud(); if (c.driver === 'player') c.damage(2); }
        else { const hx0 = h.x, hz0 = h.z; h.x = before.x; h.z = before.z; moveBody(h, hx0, hz0, 0.35 * h.T.scale, h.y, 1.8); }
      }
    }
    if (!player.car && player.alive && c.driver !== 'player' && !XV.some((V) => V.riding && V.riding(c))) {
      const p = { x: player.x, z: player.z };
      if (resolveCircleCar(p, 0.4, c)) {
        if (sp > 5 && player.carHitCd <= 0 && player.y - groundY(player.x, player.z) < 0.9) {
          player.carHitCd = 1.2;
          hurtPlayer(Math.min(55, sp * 2.4), c.x - c.fx * 3, c.z - c.fz * 3, 6 + sp * 0.5);
          sfx.thud(); c.speed *= 0.5;
        } else { const px0 = player.x, pz0 = player.z; player.x = p.x; player.z = p.z; moveBody(player, px0, pz0, 0.4, player.y, 1.8); }
      }
    }
  }
}
function ejectHunter(car, dead) {
  const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
  const p = { x: car.x - rx * 2, z: car.z - rz * 2 };
  resolveCircle(p, 0.4);
  const h = new Hunter(p.x, p.z, 'civ', false, 'chase');
  h.stun = 0.9; G.hunters.push(h);
  if (dead) h.die({ x: -rx * 4, y: 3, z: -rz * 4 }, 1);
}
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of G.cars) { if (c.wrecked || c.far) continue; const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function enterCar() {
  const c = nearestCar(3.6);
  if (!c) return;
  if (player.bike) playerBikeAction(BK);
  if (c.driver === 'traffic' || c.driver === 'hunter') { ejectHunter(c, false); showMsg('CAR STOLEN'); addHeat(10); }
  c.driver = 'player'; c.lane = null; player.car = c; player.dragT = 0; player.camOff = 0;
  player.yaw = c.heading + Math.PI;
  sfx.pickup();
}
function zipStartNear() {
  if (player.car || player.mode !== 'move') return null;
  for (const Z of ziplines) if (Math.abs(Z.a.x - player.x) < 2.6 && Math.abs(Z.a.z - player.z) < 2.6 && Math.abs(Z.a.y - 3.3 - player.y) < 1.2) return Z;
  return null;
}
function useAction() {
  if (GJ_STATE.ride) { hopOffLorry(GJ, 'HOPPED OFF THE LORRY'); return; }
  for (const V of XV) { const T = V.useTarget(TDK); if (T && T.first) { V.use(T, TDK); return; } } // (on a bus: ring the bell)
  if (player.hide) { leaveHide(SK); return; }
  if (player.car) { exitCar(); return; }
  if (player.bike) { playerBikeAction(BK); return; }
  if (G.super && !player.car && heroGrab()) return;
  if (pramHeld()) { dropPram(TDK, 'YOU PARK THE PRAM'); return; }
  if (!player.car && player.mode === 'move' && !player.hide) {
    const k = kidNear(player.x, player.z); if (k) { showMsg(greetKid(k, TDK), 2.4); return; }
    const T = townUseTarget(TDK); if (T) { townUse(T, TDK); return; }
    const MT = mdUseTarget(TDK); if (MT) { mdUse(MT, TDK); return; }
    const CT = cnUseTarget(TDK); if (CT) { cnUse(CT, TDK); return; }
    const LT = lnUseTarget(TDK); if (LT) { lnUse(LT, TDK); return; }
    for (const V of XV) { const T = V.useTarget(TDK); if (T) { V.use(T, TDK); return; } }
    const VAN = icHatchNear(TDK); if (VAN) { tryOpenShop({ name: 'MR WHIPPLE\'S ICES', kind: 'ices', blurbs: ['"WHAT CAN I GET YOU, LOVE?"', '"SPRINKLES ARE EXTRA. ONLY JOKING."', '"QUICK, BEFORE THE KIDS SEE."'] }, icMenu(TDK)); return; }
    const P = !G.super && !player.bike ? pramNear(player.x, player.z) : null; if (P) { grabPram(P, TDK); return; }
  }
  if (player.mode === 'zip') { input.jumpEdge = true; return; }
  const door = player.mode === 'move' ? safeDoorNear(player.x, player.y, player.z) : null;
  if (door && !door.owned) { rentSafehouse(door); return; }
  const sspot = G.inSafe && G.inSafe.owned && player.mode === 'move' ? safeSpotNear(G.inSafe, player.x, player.z) : null;
  if (sspot === 'bed') { napInSafehouse(); return; }
  if (sspot === 'stash') { raidStash(G.inSafe); return; }
  const shop = player.mode === 'move' ? shopNear(player.x, player.y, player.z) : null;
  if (shop) { if (!shopOpenAt(shop.kind, shop.city, G.day, G.hour)) { showMsg(`${shop.name}: ${shutLine(shop.kind, shop.city, G.day, G.hour)}`, 2.2); return; } tryOpenShop(shop); return; }
  const atm = !player.car && player.mode === 'move' ? atmNear(player.x, player.y, player.z) : null;
  if (atm && WX.blackout && WX.blackout.city === WX.here) { showMsg('CASHPOINT IS DEAD. POWER CUT.', 2); return; }
  if (atm) { tryOpenShop(ATM_SPOT, atmCtx); return; }
  const stall = !player.car && player.mode === 'move' && !player.hide ? stallNear(player.x, player.y, player.z) : null;
  if (stall) { if (!marketOpen(G.hour)) { showMsg('THE MARKET\'S SHUT. BACK AT 7', 2); return; } tryOpenShop({ name: stall.name, kind: 'market', blurbs: STALL_BLURBS }, stallMenu(stall, MK)); return; }
  const board = !player.car && player.mode === 'move' ? gigBoardNear(player.x, player.y, player.z) : null;
  if (board) { board.blurbs = boardBlurbs(); tryOpenShop(board, gigMenu(GJ)); return; }
  const lorry = lorryRearNear(GJ);
  if (lorry) { hopOnLorry(lorry, GJ); return; }
  const dlorry = dlRearNear(TDK);
  if (dlorry) { dlHopOn(dlorry, TDK); return; }
  const Z = zipStartNear();
  if (Z) { player.mode = 'zip'; player.zip = Z; player.zipS = 0; player.zipV = 5; player.slideT = 0; sfx.swoosh(); return; }
  const ST = stealthUseTarget(SK);
  if (ST && (ST.kind === 'mark' || !nearestCar(2.2))) { if (ST.kind === 'mark') pickPocket(ST.obj, SK); else if (ST.kind === 'junk') pickJunk(ST.obj, SK); else enterHide(ST.obj, SK); return; }
  if (!G.super && !nearestCar(2.6) && playerBikeAction(BK)) return;
  enterCar();
}
function exitCar(forced = false) {
  const c = player.car; if (!c) return;
  if (!forced && Math.abs(c.speed) > 6) return;
  const rx = Math.cos(c.heading), rz = -Math.sin(c.heading);
  const p = { x: c.x - rx * 2.2, z: c.z - rz * 2.2 };
  resolveCircle(p, 0.4);
  if (resolveCircleCar(p, 0.4, c)) { p.x = c.x + rx * 2.2; p.z = c.z + rz * 2.2; resolveCircle(p, 0.4); }
  player.x = p.x; player.z = p.z; player.y = groundY(p.x, p.z); player.vy = 0; resetParkour(player);
  player.yaw = c.heading + Math.PI; player.pitch = 0;
  if (!c.wrecked) c.driver = null;
  player.car = null;
}

// =====================================================================
// Police aircraft: helicopters with searchlights, and drones
// =====================================================================
const spotPool = [0, 1, 2].map(() => {
  const s = new THREE.SpotLight(0xeef4ff, 0, 160, 0.2, 0.5, 0);
  s.target = new THREE.Object3D(); scene.add(s, s.target); s.userData.used = false; return s;
});
const beamGeo = new THREE.CylinderGeometry(0.35, 1, 1, 18, 1, true).translate(0, -0.5, 0);
const discGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
const blinkRed = new THREE.SpriteMaterial({ map: puffTex, color: 0xff2020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const blinkBlue = new THREE.SpriteMaterial({ map: puffTex, color: 0x3060ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const UP = new THREE.Vector3(0, -1, 0), _bv = new THREE.Vector3();

class Aircraft {
  constructor(kind, x, z) {
    this.kind = kind; this.x = x; this.z = z; this.vx = 0; this.vz = 0; this.yaw = 0; this.t = Math.random() * 100;
    this.phase = Math.random() * Math.PI * 2; this.state = 'search'; this.lostT = 0; this.bx = x; this.bz = z;
    this.leaving = false; this.dead = false; this.crashing = false; this.vy = 0; this.fireCd = 3; this.seeT = 0; this.wp = null;
    this.fuel = kind === 'heli' ? mr(95, 130) : mr(70, 95); // they can't stay up forever: when it runs out they go home
    this.g = new THREE.Group(); scene.add(this.g);
    const dark = lam(0x1d2a4a), white = lam(0xe8e8ee), black = lam(0x151515);
    const add = (geo, mat, x2, y2, z2, parent = this.g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x2, y2, z2); parent.add(m); return m; };
    if (kind === 'heli') {
      this.y = 50; this.hp = 26; this.radius = 2.8;
      add(new THREE.BoxGeometry(2.4, 2.2, 5), dark, 0, 0, 0);
      add(new THREE.BoxGeometry(2.3, 1.3, 1.8), lam(0x6a8aaa), 0, 0.2, 2.6);
      add(new THREE.BoxGeometry(2.42, 0.5, 5.02), white, 0, -0.4, 0);
      add(new THREE.BoxGeometry(0.5, 0.6, 5.5), dark, 0, 0.4, -5);
      add(new THREE.BoxGeometry(0.15, 1.6, 1.0), dark, 0, 1.1, -7.4);
      for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.15, 0.15, 4.2), black, s * 1.1, -1.6, 0.3); add(new THREE.BoxGeometry(0.12, 0.6, 0.12), black, s * 1.1, -1.3, 1.4); add(new THREE.BoxGeometry(0.12, 0.6, 0.12), black, s * 1.1, -1.3, -0.8); }
      this.rotor = new THREE.Group(); this.rotor.position.set(0, 1.45, 0.2); this.g.add(this.rotor);
      add(new THREE.BoxGeometry(12, 0.08, 0.45), black, 0, 0, 0, this.rotor); add(new THREE.BoxGeometry(0.45, 0.08, 12), black, 0, 0, 0, this.rotor);
      this.tail = new THREE.Group(); this.tail.position.set(0.3, 0.6, -7.4); this.g.add(this.tail);
      add(new THREE.BoxGeometry(0.06, 2.2, 0.25), black, 0, 0, 0, this.tail);
      this.spot = spotPool.find((s) => !s.userData.used) || null;
      if (this.spot) this.spot.userData.used = true;
      this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      scene.add(this.beam);
      this.disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xeef4ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(this.disc);
    } else {
      this.y = 18; this.hp = 2; this.radius = 0.8;
      add(new THREE.BoxGeometry(0.7, 0.25, 0.7), lam(0x2a2a30), 0, 0, 0);
      add(new THREE.BoxGeometry(0.25, 0.2, 0.25), black, 0, -0.2, 0.2);
      this.props = [];
      for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
        add(new THREE.BoxGeometry(0.5, 0.06, 0.08), black, dx / 2, 0, dz / 2).rotation.y = Math.atan2(dx, dz);
        const pr = add(new THREE.BoxGeometry(0.55, 0.02, 0.06), lam(0x888888), dx, 0.12, dz); this.props.push(pr);
      }
      this.disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(this.disc);
    }
    this.lr = new THREE.Sprite(blinkRed); this.lb = new THREE.Sprite(blinkBlue);
    const ls = kind === 'heli' ? 1.2 : 0.6;
    this.lr.scale.setScalar(ls); this.lb.scale.setScalar(ls);
    this.lr.position.set(-0.5, kind === 'heli' ? -1.2 : 0.1, kind === 'heli' ? 2 : 0); this.lb.position.set(0.5, this.lr.position.y, this.lr.position.z);
    this.g.add(this.lr, this.lb);
  }
  remove() {
    this.dead = true; scene.remove(this.g);
    if (this.beam) scene.remove(this.beam);
    if (this.disc) scene.remove(this.disc);
    if (this.spot) { this.spot.intensity = 0; this.spot.userData.used = false; }
  }
  damage(n) {
    if (this.crashing) return;
    this.hp -= n; sfx.hit();
    if (this.hp <= 0) {
      this.crashing = true; this.vy = 0; addHeat(this.kind === 'heli' ? 40 : 8);
      showMsg(this.kind === 'heli' ? 'HELICOPTER DOWN' : 'DRONE DOWN');
      if (this.beam) this.beam.visible = false;
      if (this.spot) this.spot.intensity = 0;
    }
  }
  update(dt) {
    this.t += dt;
    const heli = this.kind === 'heli';
    const blink = Math.sin(this.t * 9) > 0;
    this.lr.visible = blink; this.lb.visible = !blink;
    if (this.rotor) this.rotor.rotation.y += dt * 28;
    if (this.tail) this.tail.rotation.x += dt * 40;
    if (this.props) for (const p of this.props) p.rotation.y += dt * 50;
    if (this.crashing) {
      this.vy -= 12 * dt; this.y += this.vy * dt; this.g.rotation.y += dt * (heli ? 4 : 8); this.g.rotation.z += dt;
      if (Math.random() < 0.6) emitPuff(this.x, this.y, this.z, { life: 1.6, vy: 1, size0: 1, size1: heli ? 5 : 2, alpha: 0.6, color: 0x333333 });
      this.g.position.set(this.x, this.y, this.z);
      if (this.y <= maxHeightNear(this.x, this.z) * 0 + 0.5) {
        sfx.explode();
        for (let i = 0; i < (heli ? 22 : 8); i++) emitPuff(this.x + mr(-2, 2), 1, this.z + mr(-2, 2), { life: 2.2, vy: mr(2, 6), vx: mr(-4, 4), vz: mr(-4, 4), size0: 2, size1: heli ? 9 : 3, alpha: 0.7, color: i % 3 ? 0x444444 : 0xffa040 });
        for (const h of G.hunters) if (Math.hypot(h.x - this.x, h.z - this.z) < (heli ? 9 : 3)) h.die({ x: (h.x - this.x) * 2, y: 6, z: (h.z - this.z) * 2 }, 1);
        if (!player.car && Math.hypot(player.x - this.x, player.z - this.z) < (heli ? 8 : 2.5)) hurtPlayer(heli ? 45 : 15, this.x, this.z, 12);
        this.remove();
      }
      if (this.disc) this.disc.visible = false;
      return;
    }
    const tp = targetPos(), py = playerEyeY();
    // where the light / camera is pointing
    if (this.state === 'track' && !this.leaving) { this.bx = lerp(this.bx, tp.x, Math.min(1, dt * 4)); this.bz = lerp(this.bz, tp.z, Math.min(1, dt * 4)); }
    else if (heli) {
      const R = searchRadius();
      this.bx = G.lkp.x + Math.cos(this.t * 0.45 + this.phase) * R * 0.8 + Math.sin(this.t * 1.3) * R * 0.2;
      this.bz = G.lkp.z + Math.sin(this.t * 0.37 + this.phase) * R * 0.8 + Math.cos(this.t * 1.1) * R * 0.2;
    }
    // where to fly
    let hx, hz;
    if (this.leaving) { hx = this.x + (this.x - tp.x) * 2; hz = this.z + (this.z - tp.z) * 2; }
    else if (heli) { const a = this.phase + this.t * 0.12; hx = this.bx + Math.cos(a) * 22; hz = this.bz + Math.sin(a) * 22; }
    else {
      if (this.state === 'track') { hx = tp.x + Math.cos(this.phase) * 5; hz = tp.z + Math.sin(this.phase) * 5; }
      else {
        if (!this.wp || Math.hypot(this.wp.x - this.x, this.wp.z - this.z) < 3) { const R = searchRadius(); this.wp = { x: G.lkp.x + mr(-R, R), z: G.lkp.z + mr(-R, R) }; }
        hx = this.wp.x; hz = this.wp.z;
      }
      this.bx = this.x; this.bz = this.z;
    }
    const maxV = heli ? (this.state === 'track' ? 30 : 24) : (this.state === 'track' ? 16 : 11);
    const ddx = hx - this.x, ddz = hz - this.z, dd = Math.hypot(ddx, ddz) || 1;
    const want = Math.min(maxV, dd * 0.8);
    this.vx = lerp(this.vx, (ddx / dd) * want, Math.min(1, dt * 1.5)); this.vz = lerp(this.vz, (ddz / dd) * want, Math.min(1, dt * 1.5));
    this.x += this.vx * dt; this.z += this.vz * dt;
    const floorY = maxHeightNear(this.x, this.z) + (heli ? 16 : 6);
    const ty = Math.max(heli ? 48 : (this.state === 'track' ? 11 : 18), floorY);
    this.y = lerp(this.y, ty, Math.min(1, dt * 1.2));
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 1) this.yaw += angDiff(this.yaw, Math.atan2(this.vx, this.vz)) * Math.min(1, dt * 2);
    this.g.position.set(this.x, this.y, this.z);
    this.g.rotation.set(sp * 0.012, this.yaw, 0, 'YXZ');
    if (this.leaving && Math.hypot(this.x - tp.x, this.z - tp.z) > 320) { this.remove(); return; }
    if (!this.leaving) {
      this.fuel -= dt * (this.state === 'track' ? 1.6 : 1);
      if (this.fuel <= 0) {
        this.leaving = true; this.state = 'search';
        G.airGapT = Math.max(G.airGapT || 0, heli ? 45 : 30); // a gap before anything replaces it
        showMsg(heli ? 'THE HELICOPTER IS LOW ON FUEL AND HEADING HOME' : 'THE DRONE\'S BATTERY DIED. IT\'S FLYING HOME', 3.5);
      }
    }

    // detection
    if (!this.leaving && player.alive) {
      const fromY = this.y - (heli ? 1.5 : 0.4);
      const see = !underRoof() && los3D(this.x, fromY, this.z, tp.x, py, tp.z);
      const near = heli ? Math.hypot(this.bx - tp.x, this.bz - tp.z) < 9 : Math.hypot(this.x - tp.x, this.z - tp.z) < 17;
      if (this.state !== 'track') {
        if (near && see) { this.seeT += dt; if (this.seeT > 0.8 + player.disg * 1.2 + (player.car ? 0 : (1 - G.conspic) * 0.6)) { this.state = 'track'; this.lostT = 0; onSpotted(this.kind); } }
        else this.seeT = 0;
      } else {
        const dist = Math.hypot(this.x - tp.x, this.z - tp.z);
        // they only keep you while they've a clear view: duck between buildings or indoors and they lose you
        // from up there, someone walking calmly in a crowd looks like everyone else
        let crowd = 0;
        if (!player.car && !player.sprinting && G.conspic < 0.4) for (const h of G.hunters) if (!h.dead && h.state !== 'chase' && Math.abs(h.x - tp.x) < 7 && Math.abs(h.z - tp.z) < 7 && ++crowd >= 3) break;
        if (see && crowd < 3 && dist < (heli ? 65 : 32)) { this.lostT = 0; G.lkp.x = tp.x; G.lkp.z = tp.z; G.airTracking++; }
        else { this.lostT += dt; if (this.lostT > (heli ? 1.2 : 0.9)) { this.state = 'search'; this.seeT = 0; showMsg(crowd >= 3 ? 'LOST IN THE CROWD' : heli ? 'THE HELICOPTER LOST YOU' : 'THE DRONE LOST YOU', 2); G.shook = true; } }
        if (!heli && Math.random() < dt * 1.5) sfx.drone();
      }
    }
    // light visuals
    if (heli) {
      const ox = this.x, oy = this.y - 1.4, oz = this.z;
      _bv.set(this.bx - ox, 0.05 - oy, this.bz - oz);
      const len = _bv.length(); _bv.normalize();
      this.beam.position.set(ox, oy, oz);
      this.beam.quaternion.setFromUnitVectors(UP, _bv);
      const r = 8;
      this.beam.scale.set(r, len, r);
      this.beam.material.opacity = (this.state === 'track' ? 0.12 : 0.08) * (0.35 + 0.65 * (1 - G.dayAmt));
      this.disc.position.set(this.bx, groundY(this.bx, this.bz) + 0.08, this.bz); this.disc.scale.setScalar(r);
      this.disc.material.opacity = (this.state === 'track' ? 0.35 : 0.22) * (0.4 + 0.6 * (1 - G.dayAmt));
      this.disc.material.color.set(this.state === 'track' ? 0xffe0e0 : 0xeef4ff);
      if (this.spot) {
        this.spot.position.set(ox, oy, oz); this.spot.target.position.set(this.bx, 0, this.bz);
        this.spot.angle = Math.atan(r / len) * 1.15;
        this.spot.intensity = (this.state === 'track' ? 5 : 3.5) * (0.15 + 0.85 * (1 - G.dayAmt));
      }
    } else {
      this.disc.position.set(this.x, groundY(this.x, this.z) + 0.09, this.z);
      this.disc.scale.setScalar(this.state === 'track' ? 4 : 6);
      this.disc.material.color.set(this.state === 'track' ? 0xff3030 : 0x60a0ff);
    }
  }
}
// indoors anywhere (shops, safehouses, the mall, the metro): nothing in the sky can see you through a roof
function underRoof() {
  if (player.hide) return true;
  if (player.car) return false;
  const x = player.x, y = player.y, z = player.z;
  if (safeAt(x, y, z) || zoneAt(x, y, z) || y < -1) return true;
  for (const r of shopRooms) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y < r.h - 0.5) return true;
  for (const r of mdRoofs) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y < r.h - 0.5) return true;
  for (const r of cnRoofs) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y < r.h - 0.5) return true;
  for (const V of XV) for (const r of V.roofs) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y < r.h - 0.5) return true;
  return false;
}
function onSpotted(kind) {
  addHeat(kind === 'heli' ? 6 : 3);
  if (G.spottedMsgT <= 0) { showMsg(kind === 'heli' ? 'SPOTTED BY A POLICE HELICOPTER' : 'A POLICE DRONE SPOTTED YOU', 2.5); sfx.alarm(); G.spottedMsgT = 6; }
  const tp = targetPos(); sendLooking(tp.x, tp.z, 70, 20);
}
function manageAircraft(dt) {
  G.airT -= dt; G.airGapT = Math.max(0, (G.airGapT || 0) - dt);
  if (G.airT > 0) return;
  G.airT = 2;
  const tp = targetPos();
  for (const [list, want, kind] of [[G.helis, HELIS_AT[G.level], 'heli'], [G.drones, DRONES_AT[G.level], 'drone']]) {
    const active = list.filter((a) => !a.leaving && !a.crashing);
    if (active.length < want && !(G.airGapT > 0)) {
      const a = Math.random() * Math.PI * 2, d = kind === 'heli' ? 240 : 140;
      list.push(new Aircraft(kind, tp.x + Math.cos(a) * d, tp.z + Math.sin(a) * d));
      if (kind === 'heli' && active.length === 0) showMsg('A POLICE HELICOPTER IS SEARCHING FOR YOU', 3);
    } else if (active.length > want) active[0].leaving = true;
  }
}

// =====================================================================
// Pickups (relocate near the player so the world always has some)
// =====================================================================
const pickGeo = { health: new THREE.CylinderGeometry(0.18, 0.18, 0.5, 10), ammo: new THREE.BoxGeometry(0.55, 0.32, 0.38) };
const pickMat = { health: new THREE.MeshBasicMaterial({ color: 0x3cff6a }), ammo: new THREE.MeshBasicMaterial({ color: 0xffc83a }) };
function sidewalkPointNear(x, z) {
  const c = cityAt(x, z, 30);
  const cands = c ? blockRects.filter((b) => b.city === c && Math.abs(b.x0 - x) < 220 && Math.abs(b.z0 - z) < 220) : [];
  for (let t = 0; t < 12 && cands.length; t++) {
    const b = mpick(cands), side = Math.floor(Math.random() * 4);
    let px, pz;
    if (side < 2) { px = mr(b.x0 + 1, b.x1 - 1); pz = side ? b.z0 + 1.5 : b.z1 - 1.5; } else { pz = mr(b.z0 + 1, b.z1 - 1); px = side === 2 ? b.x0 + 1.5 : b.x1 - 1.5; }
    if (!pointBlocked(px, pz, 0.5)) return { x: px, z: pz };
  }
  return randomOpenPoint(x, z, 30, 150) || { x, z };
}
class Pickup {
  constructor(kind) { this.kind = kind; this.m = new THREE.Mesh(pickGeo[kind], pickMat[kind]); scene.add(this.m); this.respawnT = 0; this.place(); }
  place() { const tp = targetPos(), p = sidewalkPointNear(tp.x, tp.z); this.x = p.x; this.z = p.z; this.m.visible = true; this.active = true; }
  update(dt, t) {
    if (!this.active) { this.respawnT -= dt; if (this.respawnT <= 0) this.place(); return; }
    if (Math.abs(this.x - player.x) > 320 || Math.abs(this.z - player.z) > 320) { this.place(); return; }
    this.m.position.set(this.x, groundY(this.x, this.z) + 0.75 + Math.sin(t * 3 + this.x) * 0.12, this.z);
    this.m.rotation.y = t * 2;
    if (!player.car && Math.hypot(player.x - this.x, player.z - this.z) < 1.4) {
      if (this.kind === 'health') { if (player.hp >= 100) return; player.hp = Math.min(100, player.hp + 35); player.stam = 100; showMsg('+35 HEALTH'); }
      else {
        const A = player.ammo; A.pistol.res = Math.min(WEAPONS.pistol.maxRes, A.pistol.res + 24);
        if (player.owned.has('shotgun')) A.shotgun.res = Math.min(WEAPONS.shotgun.maxRes, A.shotgun.res + 6);
        if (player.owned.has('smg')) A.smg.res = Math.min(WEAPONS.smg.maxRes, A.smg.res + 30);
        showMsg('+AMMO');
      }
      sfx.pickup(); this.active = false; this.m.visible = false; this.respawnT = 35;
    }
  }
}

// =====================================================================
// View model: hands + pistol
// =====================================================================
const vm = new THREE.Group(); vmCamera.add(vm);
const vmSkin = new THREE.MeshLambertMaterial({ color: 0xd99a6c }), vmSleeve = new THREE.MeshLambertMaterial({ color: 0x3a4a3a }), vmGunMat = new THREE.MeshLambertMaterial({ color: 0x202024 });
function makeArm(side) {
  const a = new THREE.Group();
  a.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.55).translate(0, 0, 0.12), vmSleeve), new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.16).translate(0, 0, -0.22), vmSkin));
  a.position.set(side * 0.2, -0.24, -0.42); a.rotation.set(0.05, side * 0.18, 0); vm.add(a); return a;
}
const armR = makeArm(1), armL = makeArm(-1);
const gun = new THREE.Group();
gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.3).translate(0, 0.07, -0.33), vmGunMat), new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.08).translate(0, -0.02, -0.24), vmGunMat));
armR.add(gun);
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
flash.position.set(0, 0.07, -0.55); flash.scale.setScalar(0.25); flash.visible = false; armR.add(flash);
armL.position.set(-0.08, -0.27, -0.42); armL.rotation.set(0.1, -0.5, 0);
const vmWood = new THREE.MeshLambertMaterial({ color: 0x6a4428 }), vmRed = new THREE.MeshLambertMaterial({ color: 0xa8281e }), vmSteel = new THREE.MeshLambertMaterial({ color: 0x55585e });
const vmBox = (grp, w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); grp.add(m); return m; };
const shotgunVM = new THREE.Group();
vmBox(shotgunVM, 0.06, 0.06, 0.8, 0, 0.09, -0.6, vmGunMat); vmBox(shotgunVM, 0.05, 0.05, 0.62, 0, 0.035, -0.52, vmGunMat);
vmBox(shotgunVM, 0.075, 0.07, 0.15, 0, 0.04, -0.62, vmWood); vmBox(shotgunVM, 0.07, 0.1, 0.24, 0, 0.06, -0.2, vmGunMat);
vmBox(shotgunVM, 0.065, 0.13, 0.26, 0, -0.01, 0.0, vmWood);
const smgVM = new THREE.Group();
vmBox(smgVM, 0.075, 0.11, 0.36, 0, 0.07, -0.34, vmGunMat); vmBox(smgVM, 0.04, 0.04, 0.16, 0, 0.09, -0.58, vmSteel);
vmBox(smgVM, 0.05, 0.2, 0.07, 0, -0.06, -0.38, vmGunMat); vmBox(smgVM, 0.055, 0.14, 0.07, 0, -0.03, -0.22, vmGunMat);
const crowbarVM = new THREE.Group();
vmBox(crowbarVM, 0.035, 0.035, 0.64, 0, 0, -0.24, vmRed); vmBox(crowbarVM, 0.035, 0.14, 0.035, 0, 0.055, -0.56, vmRed);
vmBox(crowbarVM, 0.03, 0.03, 0.08, 0, 0.11, -0.53, vmRed); vmBox(crowbarVM, 0.04, 0.02, 0.06, 0, -0.012, 0.07, vmSteel);
crowbarVM.position.set(0, 0.02, -0.22); crowbarVM.rotation.set(0.85, 0, 0.55);
for (const g2 of [shotgunVM, smgVM, crowbarVM]) { g2.visible = false; armR.add(g2); }
const VM_MODELS = { pistol: gun, shotgun: shotgunVM, smg: smgVM, crowbar: crowbarVM };
function showWeaponModel() { for (const k in VM_MODELS) VM_MODELS[k].visible = k === player.weapon; flash.position.z = player.weapon === 'shotgun' ? -1.02 : player.weapon === 'smg' ? -0.68 : -0.55; }

// =====================================================================
// Shooting
// =====================================================================
function rayCylinder(o, d, cx, cz, r, y0, y1, maxT) {
  const ox = o.x - cx, oz = o.z - cz, a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-8) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxT) return -1;
  const y = o.y + d.y * t;
  return y >= y0 && y <= y1 ? t : -1;
}
function raySphere(o, d, cx, cy, cz, r, maxT) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz, b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c;
  if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t > 0 && t < maxT ? t : -1;
}
function rayCar(o, d, car, maxT) {
  const s = Math.sin(car.heading), c = Math.cos(car.heading), ox = o.x - car.x, oz = o.z - car.z;
  const lo = { f: ox * s + oz * c, r: ox * c - oz * s, y: o.y }, ld = { f: d.x * s + d.z * c, r: d.x * c - d.z * s, y: d.y };
  let t0 = 0, t1 = maxT;
  for (const [k, mn, mx] of [['f', -car.hl, car.hl], ['r', -car.hw, car.hw], ['y', 0.1, car.kind === 'bus' || car.kind === 'truck' || car.kind === 'binlorry' ? 3.1 : car.kind === 'van' ? 2.2 : 1.7]]) {
    if (Math.abs(ld[k]) < 1e-8) { if (lo[k] < mn || lo[k] > mx) return -1; continue; }
    let a = (mn - lo[k]) / ld[k], b = (mx - lo[k]) / ld[k]; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
  }
  return t0;
}
const _camDir = new THREE.Vector3(), _aim = new THREE.Vector3();
function playerShoot() {
  if (player.car || !player.alive || player.reloadT > 0 || player.fireCd > 0 || player.switchT > 0) return;
  const W = WEAPONS[player.weapon];
  if (W.melee) { crowbarSwing(false); return; }
  if (W.laser) { if (G.held) { heroThrow(); player.fireCd = 0.4; G.fireHeld = false; return; } fireLaser(); return; }
  const A = player.ammo[player.weapon];
  if (A.mag <= 0) { if (A.res > 0) startReload(); else if (player.fireCd > -0.3 || !G.fireHeld) { sfx.empty(); showMsg('OUT OF AMMO'); player.fireCd = 0.3; } return; }
  A.mag--; player.fireCd = W.cd; player.recoil = player.weapon === 'shotgun' ? 1.8 : player.weapon === 'smg' ? 0.55 : 1; G.shotT = 0;
  if (player.weapon === 'shotgun') { sfx.shotgun(); setTimeout(() => sfx.pump(), 350); G.shake = Math.max(G.shake, 0.18); }
  else if (player.weapon === 'smg') sfx.smg(); else sfx.shot();
  addHeat(W.heat);
  flash.visible = true; flash.material.rotation = Math.random() * 6; flash.scale.setScalar(player.weapon === 'shotgun' ? 0.45 : 0.25); setTimeout(() => (flash.visible = false), 45);
  camera.getWorldDirection(_aim);
  const moveSpread = Math.min(0.03, Math.hypot(player.vx, player.vz) * 0.002) + (player.weapon === 'smg' && G.fireHeld ? 0.008 : 0);
  const hits = new Map(); let headHit = false;
  for (let k = 0; k < W.pellets; k++) {
    const spread = W.spread + moveSpread;
    _camDir.copy(_aim); _camDir.x += mr(-spread, spread); _camDir.y += mr(-spread, spread); _camDir.z += mr(-spread, spread); _camDir.normalize();
    if (k === 0 && rayCams(camera.position, _camDir, W.range || 160, SK)) continue;
    const r = fireRay(_camDir, W.range || 160, k < 4);
    if (r) { hits.set(r.h, (hits.get(r.h) || 0) + r.dmg); if (r.head) headHit = true; }
  }
  setHitKind(player.weapon);
  for (const [h, dmg] of hits) {
    const dx = h.x - player.x, dz = h.z - player.z, dl = Math.hypot(dx, dz) || 1;
    h.damage(dmg, dx / dl, dz / dl, h.y + 1.2);
    if (h.dead) showMsg(headHit ? 'HEADSHOT' : 'TAKEDOWN');
  }
  if (hits.size) sfx.hit();
  alertAround(player.x, player.z, W.alert, 1); bumpLocal(0.15); player.drawnT = 0;
}
// superpower mode: the city's greatest hero (self-appointed)
const BEG_LINES = ['PLEASE! I\'M JUST A DENTIST', 'HUGE FAN! HUGE! PLEASE GO AWAY', 'NOT THE EYES! NOT THE EYES!', 'TAKE MY WALLET!', 'I DIDN\'T SEE ANYTHING', 'SORRY! SORRY! SORRY!', 'YOU\'RE MY HERO! PLEASE LEAVE', 'I\'VE GOT A FAMILY! A SMALL ONE!', 'I VOTED FOR YOU!', 'MUMMY!', 'I LOVE YOUR CAPE!', 'I\'LL DO ANYTHING!'];
const HELD_LINES = ['PUT ME DOWN! GENTLY!', 'I\'M SCARED OF HEIGHTS!', 'I\'LL TELL EVERYONE YOU\'RE GREAT!', 'MY LEGS ARE GOING!', 'THIS IS FINE. THIS IS FINE.', 'PLEASE NOT THE CANAL!'];
const HERO_LINES = ['YOU\'RE WELCOME', 'SAY THANK YOU', 'ANOTHER LIFE SAVED. PROBABLY.', 'I\'M THE GOOD GUY', 'SMILE FOR THE CAMERAS', 'THEY LOVE ME REALLY'];
const bubbleTex = new Map(), bubbles = [];
function say(h, text) {
  let t = bubbleTex.get(text);
  if (!t) {
    t = canvasTex(512, 96, (ctx, W, H) => {
      ctx.font = 'bold 38px Arial, sans-serif'; const w = Math.min(W - 8, ctx.measureText(text).width + 40);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.roundRect((W - w) / 2, 6, w, H - 22, 20); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, W / 2, (H - 16) / 2 + 4, W - 30);
    });
    bubbleTex.set(text, t);
  }
  let b = bubbles.find((q) => q.life <= 0);
  if (!b) { if (bubbles.length >= 8) return; b = { s: new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true })), life: 0 }; b.s.renderOrder = 5; bubbles.push(b); }
  b.s.material.map = t; b.s.material.needsUpdate = true; b.s.scale.set(2.6, 0.49, 1); b.s.position.set(0, 2.75, 0);
  h.g.add(b.s); b.life = 2.4; b.h = h;
}
// what the city-life module needs to know about the game
// kick, whack or swat whatever bin or hydrant is right in front of you. Returns true if something was there
function kickInFront(fx, fz, power, hydrantHits, range = 2.2) {
  if (player.car || !player.alive) return false;
  const P = propInFront(player.x, player.y, player.z, fx, fz, range);
  if (!P) return false;
  if (P.kind === 'hydrant') {
    if (hydrantHits < 1 && !G.super) { showMsg(mpick(['OW. THAT\'S A HYDRANT', 'OW! MY TOE!', 'IT\'S BOLTED DOWN. OW.']), 1.2); sfx.clank(); hurtPlayer(2, P.x, P.z); return true; }
    P.byPlayer = true; hitHydrant(P, hydrantHits, BK); if (P.burst) addHeat(3); return true;
  }
  P.byPlayer = true; kickProp(P, fx, fz, power, BK, 3 + power * 0.15);
  if (!G.super) { addHeat(0.5); alertAround(player.x, player.z, 6, 1.5); }
  return true;
}
const BK = {
  G, player, get input() { return input; }, Hunter, launchHunter, setHitKind, sfx, say: (h, t) => say(h, t), showMsg: (t, d) => showMsg(t, d), addHeat: (n) => addHeat(n), alertAround: (x, z, r, d) => alertAround(x, z, r, d),
  targetPos: () => targetPos(), dayMult: () => dayMult(), crowd: () => WX.crowd, chasers: () => G.hunters.filter((h) => !h.dead && h.state === 'chase').length,
  binKicked: () => { G.binsKicked = (G.binsKicked || 0) + 1; },
  hydrantBurst: () => { G.hydrantsBurst = (G.hydrantsBurst || 0) + 1; },
};
// what the stealth module (bins, bottles, cameras, pigeons, pickpocketing) needs from the game
const SK = {
  G, player, sfx, get input() { return input; }, hunters: () => G.hunters, targetPos: () => targetPos(), isTouch: () => isTouch,
  say: (h, t) => say(h, t), showMsg: (t, d) => showMsg(t, d), shout: (h) => shout(h), addHeat: (n) => addHeat(n), bumpLocal: (n) => bumpLocal(n), localSus: () => localSus(),
  reportSighting: (x, z) => reportSighting(x, z), sendLooking: (x, z, r, t) => sendLooking(x, z, r, t), hurt: (n, x, z, k) => hurtPlayer(n, x, z, k),
  interrupt: (h) => { if (h.act || h.inside) lifeInterrupt(h); }, addCash: (n) => { player.cash += n; }, blackoutCity: () => (WX.blackout ? WX.blackout.city : null),
  // a bottle or can hits someone: a clean head shot knocks them flat for a bit
  bonk: (h, head, vx, vz) => {
    const l = Math.hypot(vx, vz) || 1;
    sfx.bonk(); comicWord(head ? 'BONK' : 'THWACK', h.x, h.y + 2.1, h.z);
    if (head && h.T.hp <= 3) { setHitKind('crowbar'); launchHunter(h, vx / l, vz / l, true, { x: vx / l * 3, y: 3, z: vz / l * 3 }); SK_STATE.bonks = (SK_STATE.bonks || 0) + 1; }
    else { h.stun = Math.max(h.stun, head ? 2.2 : 0.5); h.kx += vx / l * 2; h.kz += vz / l * 2; }
    say(h, mpick(head ? ['OW!', 'MY HEAD!', 'WHO THREW THAT?'] : ['OI!', 'OW', 'HEY!']));
    if (h.dead) { for (const o of G.hunters) if (!o.dead && o.state !== 'chase' && Math.abs(o.x - h.x) < 12 && Math.abs(o.z - h.z) < 12) { o.sus = Math.max(o.sus, 0.6); o.huntT = Math.max(o.huntT, 10); } return; }
    if (h.hasLOS || Math.hypot(h.x - player.x, h.z - player.z) < 14) { h.alert(0.5); addHeat(1.5); } else { h.huntT = Math.max(h.huntT, 10); h.sus = Math.max(h.sus, 0.5); }
  },
};
// what the odd jobs and bin lorries need from the game
const GJ = {
  G, player, sfx, get input() { return input; }, isTouch: () => isTouch, showMsg: (t, d) => showMsg(t, d), addCash: (n) => { player.cash += n; },
  leaveShop: () => leaveShop(), enterHide: (S) => enterHide(S, SK), leaveHide: () => leaveHide(SK), hurt: (n) => hurtPlayer(n, player.x, player.z, 2),
  smell: (t) => { SK_STATE.smellT = Math.max(SK_STATE.smellT, t); },
  // a regular client's thank-you
  perk: (k) => {
    if (k === 'cardigan') { if (!CATALOG.costume.some((c) => c.id === 'nana_cardi')) CATALOG.costume.push({ id: 'nana_cardi', slot: 'body', cat: 'gift', name: 'NANA PEG\'S CARDIGAN', price: 0, dg: 0.34, desc: 'Hand knitted. Lumpy. Nobody would ever suspect it.' }); player.outfit.body = 'nana_cardi'; putOnDisguise(); }
    else if (k === 'pal' || k === 'guard') { const a = new Ally(k, player.x + Math.cos(player.yaw) * 1.4, player.y, player.z - Math.sin(player.yaw) * 1.4); G.allies.push(a); }
    else if (k === 'discount') { /* the market stalls read GJ_STATE.perks.discount */ }
    sfx.cheer();
  },
};
// what the markets need from the game
const STALL_BLURBS = ['"Come on, come on, have a look!"', '"Cash only, love. No cards, no names."', '"Two for one if you stop staring."', '"I\'ve seen your face somewhere. Nah. Couldn\'t be."'];
const MK = {
  G, player, sfx, hunters: () => G.hunters, showMsg: (t, d) => showMsg(t, d), say: (h, t) => say(h, t), addHeat: (n) => addHeat(n), bumpLocal: (n) => bumpLocal(n),
  coolHeat: (n) => { G.heat = Math.max(heatFloor(), G.heat - n); }, addJunk: (k) => { SK_STATE.junk.push(k); },
  wear: (id) => { const it = CATALOG.costume.find((c) => c.id === id); player.outfit[it.slot] = id; return putOnDisguise(); },
  canSee: (h) => h.hasLOS, openPoint: (x, z, r0 = 0, r1 = 20) => randomOpenPoint(x, z, r0, r1),
  vendorOf: (spot) => vendorOf(spot), hideT: () => SK_STATE.hideT,
  hireTrader: (spot, x, z) => { const p = randomOpenPoint(x, z, 0, 2.5, 8) || { x, z }; const h = new Hunter(p.x, p.z, 'civ', false); G.hunters.push(h); if (hireVendor(h, spot)) lifeStart(h, LIFE); return h; },
  giveCrowbar: () => { if (player.owned.has('crowbar')) return false; player.owned.add('crowbar'); updateSlots(); return true; },
  discount: () => (GJ_STATE.perks.discount ? 0.25 : 0),
  staffShare: (M) => tdStaffShare(M, G.day), bigDay: (M) => tdBigMarket(M, G.day, G.hour),
};
// what the kids, prams and the town's calendar need from the game
function sayKid(k, text) { // a little one's speech bubble (their model is scaled down, so scale the bubble back up)
  say(k, text); const b = bubbles.find((q) => q.h === k && q.life > 2.3); if (b) { b.s.scale.set(2.6 / k.s, 0.49 / k.s, 1); b.s.position.y = 1.55 / k.s; }
}
const TDK = {
  G, player, sfx, hunters: () => G.hunters, showMsg: (t, d) => showMsg(t, d), banner: (h, d) => showBanner(h, d), say: (h, t) => say(h, t),
  sayAt: (h, t) => (h.s ? sayKid(h, t) : say(h, t)), sayAtPos: (x, y, z, t) => { const P = prams.find((q) => Math.hypot(q.x - x, q.z - z) < 0.1); if (P) { say({ g: P.g }, t); const b = bubbles.find((q) => q.h && q.h.g === P.g && q.life > 2.3); if (b) b.s.position.y = 1.5; } },
  addHeat: (n) => addHeat(n), addCash: (n) => { player.cash += n; }, addJunk: (k) => { SK_STATE.junk.push(k); },
  wear: (id) => { const it = CATALOG.costume.find((c) => c.id === id); if (!it) return ''; player.outfit[it.slot] = id; return putOnDisguise(); },
  lifeGo: (h, kind, x, z, face, dur, extra) => { if (h.act) lifeInterrupt(h); h.waitT = 0; return lifeGo(h, kind, x, z, face, dur, extra); }, // (no idle pause left over: it would freeze the walk too)
  spawnCivAt: (x, z) => { const p = randomOpenPoint(x, z, 0, 4, 10); if (!p) return null; const h = new Hunter(p.x, p.z, 'civ', false, 'search'); G.hunters.push(h); return h; },
  canSee: (x, y, z) => { const d = Math.hypot(player.x - x, player.z - z); return (d < 40 || los(x, z, player.x, player.z)) && losSolid(x, y, z, player.x, playerEyeY(), player.z); },
  // how quickly a kid works out who you are: they watch the telly, and a hat doesn't fool them for long
  kidEye: () => clamp(0.45 + G.level * 0.3 + (G.conspic || 0) * 0.6, 0.35, 1.6) * (1 - 0.45 * player.disg),
  kidTells: (k, flat) => {
    grownupHears(k, TDK);
    const O = k.parent;
    if (O && !O.dead && O.state !== 'chase') { O.sus = 1; O.huntT = Math.max(O.huntT, 15); O.alert(0.6); }
    for (const o of G.hunters) if (!o.dead && o !== O && o.state !== 'chase' && Math.abs(o.x - k.x) < 18 && Math.abs(o.z - k.z) < 18) { o.sus = Math.max(o.sus, 0.55); o.huntT = Math.max(o.huntT, 8); }
    addHeat(flat ? 3 : 2); reportSighting(player.x, player.z); bumpLocal(0.08);
  },
  floorY: (x, z, y) => floorAt(x, z, Math.max(0.5, Math.min(y, 1.2))),
  near: (x, z, r) => Math.abs(x - player.x) < r && Math.abs(z - player.z) < r,
  town: () => localeName(player.x, player.z), schoolDay: () => isSchoolDay(G.day),
  get hour() { return G.hour; }, get time() { return G.elapsed; }, get superMode() { return G.super; },
  get festival() { return WX.festival ? FESTIVALS[WX.festival.city] : null; }, get festivalCity() { return WX.festival ? WX.festival.city : ''; },
  bumpLocal: (n) => bumpLocal(n), coolHeat: (n) => { G.heat = Math.max(heatFloor(), G.heat - n); },
  openMenu: (spot, ctx) => tryOpenShop(spot, ctx), distracted: (k) => icDistracted(k, TDK),
  lanes: () => lanes, addCar: (lane, along, kind, color) => { const c = new Car(lane, along, null, kind, color); G.cars.push(c); return c; },
  removeCar: (c) => { if (player.car === c) return; scene.remove(c.g); const i = G.cars.indexOf(c); if (i >= 0) G.cars.splice(i, 1); },
  spawnTypeAt: (x, z, type) => { const p = randomOpenPoint(x, z, 0, 3, 10); if (!p) return null; const h = new Hunter(p.x, p.z, type, false, 'search'); G.hunters.push(h); return h; },
  report: () => reportSighting(player.x, player.z),
  enterHide: (S) => enterHide(S, SK), leaveHide: () => leaveHide(SK), hurt: (n) => hurtPlayer(n, player.x, player.z, 2), blocked: (x, z, r) => pointBlocked(x, z, r), get isTouch() { return isTouch; },
  get input() { return input; }, isOpen: (kind, city) => shopOpenAt(kind, city, G.day, G.hour), freshen: () => putOnDisguise(),
  refreshOutfit: () => { let sum = 0; for (const k in player.outfit) sum += outfitItem(player.outfit[k]).dg; player.disg = Math.min(1, sum); updateOutfitView(); },
};
const LIFE = {
  say: (h, t) => say(h, t), critic: (a, b) => heroOverheard(a, b, HC),
  // a dog has smelt you in your hiding place: its owner goes over for a look
  dogAlert: (h, S) => { if (h.dead || h.state === 'chase') return; if (h.act || h.inside) lifeInterrupt(h); h.wt = { x: S.stand.x, z: S.stand.z }; h.peek = S; h.waitT = 0; h.huntT = Math.max(h.huntT, 8); say(h, mpick(['WHAT IS IT, BOY?', 'WHAT HAVE YOU FOUND?', 'LEAVE IT! ...WAIT, WHAT\'S IN THERE?', 'IS SOMEONE IN THERE?'])); },
  get hour() { return G.hour; }, get superMode() { return G.super; }, get hunters() { return G.hunters; }, get time() { return G.elapsed; },
  near: (x, z, r) => Math.abs(x - camera.position.x) < r && Math.abs(z - camera.position.z) < r,
  // the town's calendar: everyone keeps their own hours, and the school run, market days and events pull people about
  plan: (h, hr) => (G.super ? false : awPlan(h, hr, TDK) || mdPlan(h, hr, TDK) || XV.some((V) => V.plan(h, hr, TDK)) || cnPlan(h, hr, TDK) || tdPlan(h, hr, TDK)), wants: (h, hr) => tdWants(h, hr, TDK), visit: (h, want) => tdVisit(h, want, TDK),
  isShut: (W) => !shopOpenAt(W.kind, W.city, G.day, G.hour), // shop hours: nobody pops into a shop that's shut
};
// what the hero and villain modules need from the game
const HC = {
  G, player, say: (h, t) => say(h, t), sayAt: (V, t) => say(V, t), showMsg: (t, d) => showMsg(t, d), showBanner: (h, d) => showBanner(h, d),
  dropCash: (h) => maybeDropCash(h), shake: (k) => { G.shake = Math.max(G.shake, k); },
  spawnAt: (x, z, type, o = {}) => { const p = randomOpenPoint(x, z, 0, 6, 10); if (!p) return null; const h = new Hunter(p.x, p.z, type, false); Object.assign(h, o); G.hunters.push(h); return h; },
  hurt: (dmg, V, knock = 4) => villainHurtPlayer(dmg, V, knock),
  onHenchDown: () => heroFun(0.08, HC, true),
  onPose: () => henchClap(player.x, player.z, HC),
  onBeaten: (V) => { HERO.saves++; HERO.approval = 99; heroFun(1, HC, true); G.villainsBeaten = (G.villainsBeaten || 0) + 1; },
};
// villains can actually hurt the hero (nothing else in town can)
function villainHurtPlayer(dmg, V, knock) {
  if (!player.alive || G.mode !== 'playing') return;
  player.hp -= dmg; player.lastHurt = 0; G.hurtFlash = Math.min(1, G.hurtFlash + 0.3 + dmg / 40); G.shake = Math.min(0.5, G.shake + dmg / 50); sfx.hurt();
  if (!player.car) { const dx = player.x - V.x, dz = player.z - V.z, d = Math.hypot(dx, dz) || 1; player.kx += (dx / d) * knock; player.kz += (dz / d) * knock; }
  if (player.hp > 0) return;
  // the unthinkable: the hero goes down. Nobody saw anything.
  if (V.hench) V = V.boss; // knocked out by the crew: the boss takes the credit
  player.hp = 100; G.villainFight = null; V.state = 'lair'; V.hp = V.def.hp;
  const p = randomOpenPoint(player.x, player.z, 70, 120, 30) || { x: 0, z: 0 };
  player.x = p.x; player.z = p.z; player.y = floorAt(p.x, p.z, 1); player.flying = false; player.vx = player.vz = player.vy = 0;
  HERO.real = Math.max(3, HERO.real - 15); HERO.bored = 0;
  showBanner(`<small>${V.def.name} KNOCKED YOU OUT</small>NOBODY SAW. NOBODY WILL SAY.`, 4); sfx.sting();
}
function updateBubbles(dt) { for (const b of bubbles) if (b.life > 0) { b.life -= dt; if (b.life <= 0 || b.h.dead) { b.life = 0; b.s.removeFromParent(); } } }
const _hd = new THREE.Vector3();
function heroGrab() {
  if (G.held) { const h = G.held; h.held = false; G.held = null; h.state = 'search'; h.y = floorAt(h.x, h.z, h.y + 1); h.panicT = 6; say(h, 'THANK YOU THANK YOU'); return true; }
  let best = null, bd = 3.2;
  for (const h of G.hunters) { if (h.dead || h.contract) continue; const d = Math.hypot(h.x - player.x, h.z - player.z); if (d < bd && Math.abs(h.y - player.y) < 2) { bd = d; best = h; } }
  if (!best) return false;
  lifeInterrupt(best); G.held = best; best.held = true; best.cowerT = 0; best.panicT = 0; sfx.scream(); say(best, 'AAAAH!'); showMsg(mpick(HERO_LINES), 1.5);
  return true;
}
function heroThrow() {
  setHitKind('super');
  const h = G.held; if (!h) return;
  camera.getWorldDirection(_hd);
  launchHunter(h, 0, 0, true, { x: _hd.x * 34, y: _hd.y * 34 + 7, z: _hd.z * 34 });
  sfx.swoosh(); sfx.scream(); G.shake = Math.max(G.shake, 0.12); showMsg(mpick(HOMERUN_LINES), 1); heroFun(0.1, HC, true); heroMenace(2);
  for (const o of G.hunters) if (!o.dead && Math.hypot(o.x - player.x, o.z - player.z) < 30) o.panicT = mr(4, 7);
}
// a backhand that sends people and parked cars flying
function heroSwat() {
  setHitKind('super');
  if (player.shoveCd > 0) return; player.shoveCd = 0.45; player.shoveAnim = 1; sfx.shove();
  camera.getWorldDirection(_hd); const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let any = false;
  for (const h of G.hunters) {
    if (h.dead || h.held) continue; const dx = h.x - player.x, dz = h.z - player.z, d = Math.hypot(dx, dz);
    if (d < 4 && (dx * fx + dz * fz) / (d || 1) > 0.3 && Math.abs(h.y - player.y) < 2) { launchHunter(h, dx / (d || 1), dz / (d || 1), true, { x: fx * 30, y: 12, z: fz * 30 }); any = true; }
  }
  for (const c of G.cars) {
    if (c.far || c.air || c === player.car) continue; const dx = c.x - player.x, dz = c.z - player.z, d = Math.hypot(dx, dz);
    if (d < 5.5 && (dx * fx + dz * fz) / (d || 1) > 0.2 && player.y < 3) {
      if (c.driver === 'traffic' || c.driver === 'hunter') ejectHunter(c, false);
      c.driver = null; c.lane = null; c.air = { vx: fx * 26, vz: fz * 26, vy: 13, y: 0, spin: mr(-5, 5), roll: 0 }; any = true;
    }
  }
  for (const V of villainsNear(player.x + fx * 2.5, player.y + 1, player.z + fz * 2.5, 3)) { villainHit(V, 12, HC, fx * 14, fz * 14); any = true; }
  if (kickInFront(fx, fz, 26, 3, 4)) any = true;
  if (any) { G.hitstopT = 0.08; G.shake = Math.max(G.shake, 0.2); sfx.thud(); showMsg(mpick(HERO_LINES), 1.2); heroFun(0.06, HC); heroMenace(0.5); for (const o of G.hunters) if (!o.dead && Math.hypot(o.x - player.x, o.z - player.z) < 35) o.panicT = mr(4, 7); }
}
function heroSlam() {
  setHitKind('super');
  sfx.explode(); G.shake = 0.6; G.hitstopT = 0.12; G.fovKick = 14;
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; emitPuff(player.x + Math.cos(a) * 1.5, player.y + 0.3, player.z + Math.sin(a) * 1.5, { life: 1, vx: Math.cos(a) * 9, vz: Math.sin(a) * 9, vy: 0.6, size0: 0.8, size1: 3, alpha: 0.6, color: 0x9a9080 }); }
  for (const h of G.hunters) {
    if (h.dead || h.held) continue; const dx = h.x - player.x, dz = h.z - player.z, d = Math.hypot(dx, dz);
    if (d < 9 && Math.abs(h.y - player.y) < 3) launchHunter(h, dx / (d || 1), dz / (d || 1), true, { x: dx / (d || 1) * (24 - d * 1.5), y: 12 - d * 0.6, z: dz / (d || 1) * (24 - d * 1.5) });
    else if (d < 40) h.panicT = mr(5, 8);
  }
  for (const c of G.cars) { if (c.far || c.air || c === player.car) continue; const dx = c.x - player.x, dz = c.z - player.z, d = Math.hypot(dx, dz); if (d < 8) { if (c.driver === 'traffic' || c.driver === 'hunter') ejectHunter(c, false); c.driver = null; c.lane = null; c.air = { vx: dx / (d || 1) * 10, vz: dz / (d || 1) * 10, vy: 9, y: 0, spin: mr(-3, 3), roll: 0 }; } }
  for (const V of villainsNear(player.x, player.y, player.z, 10)) { const dx = V.x - player.x, dz = V.z - player.z, d = Math.hypot(dx, dz) || 1; villainHit(V, 25, HC, dx / d * 18, dz / d * 18); }
  for (const P of propsNear(player.x, player.z, 9)) { P.byPlayer = true; const dx = P.x - player.x, dz = P.z - player.z, d = Math.hypot(dx, dz) || 1; if (d < 9) kickProp(P, dx / d, dz / d, 18 - d, BK, 8); }
  showMsg('SUPERHERO LANDING', 1.5); heroFun(0.12, HC, true); heroMenace(1);
}
// superpower mode: two red beams straight out of your eyes
const _eyeL = new THREE.Vector3(), _eyeR = new THREE.Vector3(), _lz = new THREE.Vector3();
const laserGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
const laserMeshes = [0, 1].map(() => { const g = new THREE.Group();
  g.add(new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: 0xff1a10, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
  g.add(new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
  g.children[0].scale.set(0.012, 0.012, 1); g.children[1].scale.set(0.05, 0.05, 1); g.visible = false; scene.add(g); return g; });
function laserBeam(i, from, to) { const g = laserMeshes[i]; g.visible = true; g.position.copy(from); g.lookAt(to); g.scale.set(1, 1, from.distanceTo(to)); }
function updateLaser(dt) { G.laserT = Math.max(0, (G.laserT || 0) - dt); if (G.laserT <= 0) for (const g of laserMeshes) g.visible = false; }
function fireLaser() {
  setHitKind('laser');
  player.fireCd = WEAPONS.laser.cd; player.drawnT = 0; G.laserT = 0.12;
  camera.getWorldDirection(_aim);
  let r = fireRay(_aim, 220, false), t = r ? Math.hypot(r.h.x - camera.position.x, r.h.z - camera.position.z) : raycastWorld(camera.position, _aim, 220).t;
  const o = camera.position, vr = villainRay(o, _aim, Math.min(t, 220));
  if (vr) { t = vr.t; r = null; villainHit(vr.V, 0.9, HC); }
  _lz.copy(o).addScaledVector(_aim, Math.min(t, 220));
  _eyeL.set(-0.07, -0.1, -0.45).applyMatrix4(camera.matrixWorld); _eyeR.set(0.07, -0.1, -0.45).applyMatrix4(camera.matrixWorld);
  laserBeam(0, _eyeL, _lz); laserBeam(1, _eyeR, _lz);
  if (Math.random() < 0.5) emitPuff(_lz.x, _lz.y, _lz.z, { life: 0.35, vy: 1, size0: 0.25, size1: 1, alpha: 0.8, color: Math.random() < 0.5 ? 0xff4020 : 0xffc040 });
  if (Math.random() < 0.3) sfx.zap ? sfx.zap() : sfx.smg();
  if (r && !r.h.dead) { const dx = r.h.x - player.x, dz = r.h.z - player.z, dl = Math.hypot(dx, dz) || 1; launchHunter(r.h, dx / dl, dz / dl, !r.h.contract); showMsg(mpick(HOMERUN_LINES), 1); heroFun(0.05, HC); heroMenace(1); for (const h of G.hunters) if (!h.dead && Math.hypot(h.x - r.h.x, h.z - r.h.z) < 30) h.panicT = mr(4, 7); }
}
// one bullet: returns the hunter it hit (damage is pooled so a shotgun blast lands as one hit)
function fireRay(dir, range, tracer) {
  const o = camera.position;
  let tHit = raycastWorld(o, dir, range).t, target = null, carHit = null, airHit = null;
  for (const h of G.hunters) {
    if (h.dead || Math.abs(h.x - o.x) > range || Math.abs(h.z - o.z) > range) continue;
    const s = h.T.scale, t = rayCylinder(o, dir, h.x, h.z, 0.36 * s, h.y, h.y + 1.95 * s, tHit);
    if (t > 0 && t < tHit) { tHit = t; target = h; carHit = null; }
  }
  for (const c of G.cars) { if (c.far) continue; const t = rayCar(o, dir, c, tHit); if (t > 0 && t < tHit) { tHit = t; carHit = c; target = null; } }
  for (const a of [...G.helis, ...G.drones]) { if (a.dead) continue; const t = raySphere(o, dir, a.x, a.y, a.z, a.radius, tHit); if (t > 0 && t < tHit) { tHit = t; airHit = a; carHit = null; target = null; } }
  const pr = rayProps(o, dir, tHit + 0.4); let propHit = null; // (+0.4: the world ray stops on the prop's own collision box)
  if (pr) { tHit = pr.t; propHit = pr.P; target = null; carHit = null; airHit = null; }
  const hitP = o.clone().addScaledVector(dir, tHit);
  if (propHit) {
    emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.3, vy: 0.4, size0: 0.15, size1: 0.5, alpha: 0.9, color: 0xfff0c0 });
    propHit.byPlayer = true;
    if (propHit.kind === 'hydrant') hitHydrant(propHit, 1, BK);
    else { const l = Math.hypot(dir.x, dir.z) || 1; kickProp(propHit, dir.x / l, dir.z / l, propHit.state === 'up' ? 4 : 3, BK, 2.5); sfx.clank(); }
    if (tracer) spawnTracer(new THREE.Vector3(0.2, -0.18, -0.6).applyMatrix4(camera.matrixWorld), hitP);
    return null;
  }
  if (tracer) spawnTracer(new THREE.Vector3(0.2, -0.18, -0.6).applyMatrix4(camera.matrixWorld), hitP);
  if (target) {
    const head = hitP.y > target.y + 1.5 * target.T.scale;
    emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.25, vy: 0.3, size0: 0.15, size1: 0.6, alpha: 0.9, color: 0xffffff });
    return { h: target, dmg: head ? 3 : 1, head };
  } else if (carHit) {
    carHit.damage(5);
    emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.3, vy: 0.4, size0: 0.15, size1: 0.6, alpha: 0.9, color: 0xffe0a0 });
    if (carHit.driver === 'traffic' && !G.super) carHit.driver = 'hunter';
  } else if (airHit) {
    airHit.damage(1);
    emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.3, vy: 0, size0: 0.3, size1: 1, alpha: 0.9, color: 0xffe0a0 });
  } else if (tracer) emitPuff(hitP.x, hitP.y, hitP.z, { life: 0.5, vy: 0.6, size0: 0.2, size1: 0.9, alpha: 0.6, color: 0xbbbbbb });
  return null;
}

// ---------------------------------------------------------------------
// the crowbar: quick whacks on left click, a wound-up home-run swing on right click
// ---------------------------------------------------------------------
const SWING = { light: { dur: 0.36, hit: 0.11 }, heavy: { dur: 0.8, hit: 0.36 } };
const HOMERUN_LINES = ['HOME RUN!', 'FORE!', 'BONK!', 'SEE YOU LATER', 'OUT OF THE PARK', 'AIRMAIL'];
function crowbarSwing(heavy) {
  if (player.car || !player.alive || player.switchT > 0 || player.weapon !== 'crowbar') return;
  player.drawnT = 0;
  if (player.swingT < (player.swingKind ? SWING[player.swingKind].dur : 0) * 0.85) return;
  if (heavy) {
    if (player.launchCd > 0) { showMsg(`BIG SWING IN ${player.launchCd.toFixed(1)}s`, 0.8); return; }
    player.launchCd = 4;
  } else { if (player.meleeCd > 0) return; player.meleeCd = 0.42; }
  player.swingKind = heavy ? 'heavy' : 'light'; player.swingT = 0; player.swingHit = false;
  sfx.whoosh();
}
function meleeTargets(range, cone) {
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), out = [];
  for (const h of G.hunters) {
    if (h.dead || Math.abs(h.y - player.y) > 1.4) continue;
    const dx = h.x - player.x, dz = h.z - player.z, d = Math.hypot(dx, dz);
    if (d < range && (d < 0.6 || (dx * fx + dz * fz) / d > cone)) out.push({ h, d, ux: d ? dx / d : fx, uz: d ? dz / d : fz });
  }
  return out.sort((a, b) => a.d - b.d);
}
function crowbarImpact(heavy) {
  setHitKind('crowbar');
  if (meleeCams(player.x, player.y, player.z, -Math.sin(player.yaw), -Math.cos(player.yaw), SK)) return;
  kickInFront(-Math.sin(player.yaw), -Math.cos(player.yaw), heavy ? 16 : 9, heavy ? 3 : 1.5);
  if (!heavy) {
    const t = meleeTargets(2.5, 0.45)[0];
    if (!t) return;
    const h = t.h, dmg = h.T.hp <= 2 ? 1 : h.T.hp / 3 + 0.01; // 2 whacks for most people, 3 for cops and brutes
    h.damage(dmg, t.ux, t.uz, h.y + 1.4);
    if (!h.dead) { h.stun = Math.max(h.stun, 0.7); h.kx += t.ux * 5 * h.T.knock; h.kz += t.uz * 5 * h.T.knock; }
    else showMsg('TAKEDOWN', 1);
    sfx.bonk(); G.shake = Math.max(G.shake, 0.12); player.recoil = 0.6;
    emitPuff(h.x, h.y + 1.5, h.z, { life: 0.25, vy: 0.5, size0: 0.2, size1: 0.7, alpha: 0.8, color: 0xffffff });
    addHeat(1.5); alertAround(player.x, player.z, 14, 1);
    return;
  }
  const ts = meleeTargets(3.0, 0.15).slice(0, 4);
  if (!ts.length) return;
  for (const t of ts) {
    const h = t.h; h.hp -= 1;
    launchHunter(h, t.ux, t.uz, h.hp > 0);
  }
  sfx.homerun(); showMsg(mpick(HOMERUN_LINES), 1.2);
  G.hitstopT = 0.09; G.shake = Math.max(G.shake, 0.35); G.fovKick = 9;
  addHeat(4); alertAround(player.x, player.z, 20, 1);
}
// sends someone flying 5 to 10 m; unless that finished them off, they get back up a few seconds later
// what just hit someone (so the knockdown can be drawn in that weapon's style)
function setHitKind(k) { G.hitKind = k; G.hitKindAt = G.elapsed; }
function hitKindNow() { return G.elapsed - (G.hitKindAt ?? -9) < 0.2 ? G.hitKind : 'oof'; }
function launchHunter(h, ux, uz, getsUp, imp) {
  if (h.dead) return;
  const heavy = h.type === 'brute' ? 0.9 : 1, sp = mr(19, 27) * heavy;
  if (h.held) { h.held = false; if (G.held === h) G.held = null; }
  lifeInterrupt(h); releaseJob(h);
  h.dead = true; h.marker.visible = false; h.g.position.set(h.x, h.y, h.z);
  addRagdoll(h.p, h.T.scale, { x: 0, y: 0, z: 0 }, imp || { x: ux * sp, y: mr(8.5, 11) * heavy, z: uz * sp }, h.y + 1.0 * h.T.scale);
  const rag = ragdolls[ragdolls.length - 1];
  { const kx = imp ? imp.x : ux, kz = imp ? imp.z : uz, kl = Math.hypot(kx, kz) || 1; knockFX(rag, hitKindNow(), h.y + 1.2 * h.T.scale, kx / kl, kz / kl); }
  rag.launchFrom = { x: h.x, z: h.z };
  if (h.rival) rivalDown(h);
  else if (getsUp) G.getUps.push({ rag, calm: !!G.calmHit && h.state !== 'chase', type: h.type, gunner: h.gunner, hp: h.hp, t: 3.4, contract: h.contract, guard: h.guard, fleer: h.fleer });
  else { G.kills++; addHeat(h.type === 'cop' ? 22 : 14); maybeDropCash(h); if (h.contract) contractTargetDown(h); }
}
function updateGetUps(dt) {
  for (let i = G.getUps.length - 1; i >= 0; i--) {
    const U = G.getUps[i]; U.t -= dt;
    const idx = ragdolls.indexOf(U.rag);
    if (idx < 0) { G.getUps.splice(i, 1); continue; }
    // while they're still flying, they skittle anyone they land on
    if (U.t > 2.2) {
      const P = U.rag.p[1], Q = U.rag.prev[1], vx = (P.x - Q.x) * 60, vz = (P.z - Q.z) * 60;
      if (Math.hypot(vx, vz) > 3) for (const h of G.hunters) {
        if (h.dead || h.stun > 0.5 || Math.abs(h.x - P.x) > 0.9 || Math.abs(h.z - P.z) > 0.9 || Math.abs(h.y + 1 - P.y) > 1.3) continue;
        h.stun = 1.6; h.kx += vx * 0.5; h.kz += vz * 0.5; sfx.thud();
      }
    }
    if (U.t > 0) continue;
    const hx = (U.rag.p[3].x + U.rag.p[4].x) / 2, hz = (U.rag.p[3].z + U.rag.p[4].z) / 2, hy = Math.min(U.rag.p[3].y, U.rag.p[4].y);
    U.rag.dispose(); ragdolls.splice(idx, 1); G.getUps.splice(i, 1);
    const p = { x: hx, z: hz }; resolveCircle(p, 0.4);
    if (solidAt(p.x, Math.max(0, hy), p.z, 0) || pointBlocked(p.x, p.z, 0.1)) { const q = randomOpenPoint(p.x, p.z, 0, 10, 20); if (q) { p.x = q.x; p.z = q.z; } }
    const nh = new Hunter(p.x, p.z, U.type, U.gunner, U.calm ? 'search' : 'chase'); // an accident that wasn't your doing: they just dust themselves off
    nh.y = floorAt(p.x, p.z, hy + 0.6); nh.hp = U.hp; nh.stun = 1.4; nh.noticeT = 0;
    if (U.contract) dressTarget(nh, U.contract); nh.guard = U.guard; nh.fleer = U.fleer;
    G.hunters.push(nh);
  }
}

// ---------------------------------------------------------------------
// cash: hunters you drop sometimes have a few quid on them
// ---------------------------------------------------------------------
const cashGeo = new THREE.BoxGeometry(0.34, 0.1, 0.18), cashMat = new THREE.MeshBasicMaterial({ color: 0x5fd06a });
function maybeDropCash(h) {
  const cop = h.type === 'cop';
  if (Math.random() > (cop ? 0.7 : 0.42)) return;
  const amt = Math.round(cop ? mr(9, 22) : mr(3, 13));
  const m = new THREE.Mesh(cashGeo, cashMat); scene.add(m);
  G.drops.push({ x: h.x + mr(-0.4, 0.4), z: h.z + mr(-0.4, 0.4), y: floorAt(h.x, h.z, h.y + 0.5), amt, t: 30, m });
}
function updateDrops(dt, t) {
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const D = G.drops[i]; D.t -= dt;
    D.m.position.set(D.x, D.y + 0.45 + Math.sin(t * 4 + D.x) * 0.08, D.z); D.m.rotation.y = t * 2.5;
    D.m.visible = D.t > 4 || Math.sin(D.t * 12) > 0;
    const got = !player.car && player.alive && Math.abs(player.x - D.x) < 1.5 && Math.abs(player.z - D.z) < 1.5 && Math.abs(player.y - D.y) < 1.6;
    if (got) { player.cash += D.amt; showMsg(`+$${D.amt}`, 1.2); sfx.cash(); }
    if (got || D.t <= 0) { scene.remove(D.m); G.drops.splice(i, 1); }
  }
}

// ---------------------------------------------------------------------
// weapons in hand
// ---------------------------------------------------------------------
function selectWeapon(w) {
  if (w === player.weapon && w !== 'hands' && !G.super) w = 'hands'; // same slot again: put it away
  if (!w || (w !== 'hands' && !player.owned.has(w)) || player.car || w === player.weapon) return;
  if (w === 'hands') for (const h of G.hunters) { h.itemT = 0; h.reacted = false; }
  player.lastWeapon = player.weapon; player.weapon = w; player.reloadT = 0; player.drawnT = 0; player.switchT = 0.28; player.swingKind = null; player.swingT = 9;
  sfx.swap(); showWeaponModel(); updateSlots();
}
// the four-slot inventory bar
const slotBar = (() => { const e = document.createElement('div'); e.id = 'hud-slots'; $('hud').appendChild(e); return e; })();
function updateSlots() {
  if (!slotBar) return;
  slotBar.innerHTML = SLOTS.map((w, i) => { const own = player.owned.has(w); return `<div class="slot${own ? '' : ' empty'}${player.weapon === w ? ' on' : ''}" data-w="${w}"><span>${i + 1}</span>${own ? WEAPONS[w].name : '·'}</div>`; }).join('') + `<div class="slot-hint">${player.weapon === 'hands' ? 'HANDS EMPTY' : 'PRESS AGAIN TO PUT IT AWAY'}</div>`;
}
slotBar.addEventListener('pointerdown', (e) => { const el = e.target.closest('.slot'); if (!el) return; e.stopPropagation(); e.preventDefault(); selectWeapon(el.dataset.w); });
function cycleWeapon(dir) {
  const owned = SLOTS.filter((w) => player.owned.has(w)); if (owned.length < 2) return;
  const i = owned.indexOf(player.weapon); selectWeapon(owned[(i + dir + owned.length) % owned.length]);
}
function primaryDown() { G.fireHeld = true; if (WEAPONS[player.weapon].hands) { if (!G.super) playerShove(); } else if (WEAPONS[player.weapon].melee) crowbarSwing(false); else playerShoot(); }
function primaryUp() { G.fireHeld = false; }
function secondary() { if (G.super) heroSwat(); else if (player.weapon === 'crowbar') crowbarSwing(true); else playerShove(); }

// ---------------------------------------------------------------------
// shops and hired help
// ---------------------------------------------------------------------
function tryOpenShop(spot, ctx = shopCtx) {
  const close = G.hunters.some((h) => !h.dead && h.state === 'chase' && Math.hypot(h.x - player.x, h.z - player.z) < 22 && Math.abs(h.y - player.y) < 3);
  if (close) { showMsg("THEY WON'T SERVE YOU WITH HUNTERS ON YOUR TAIL", 2.2); return; }
  G.mode = 'shop'; keys.clear(); recomputeKeys(); G.fireHeld = false;
  openShop(spot, ctx);
  if (document.exitPointerLock) document.exitPointerLock();
  setAircraftVolume(0, 0);
}
function leaveShop() { if (G.mode !== 'shop') return; closeShop(); G.mode = 'playing'; lockPointer(); }
const shopCtx = {
  cash: () => player.cash,
  items(kind, spot) { const all = CATALOG[kind]; return spot && spot.cats ? all.filter((it) => spot.cats.includes(it.cat)) : all; },
  state(it) {
    if (it.slot) return player.outfit[it.slot] === it.id ? 'owned' : '';
    if (['crowbar', 'shotgun', 'smg'].includes(it.id) && player.owned.has(it.id)) return 'owned';
    if ((it.id === 'pal' || it.id === 'guard') && G.allies.filter((a) => !a.dead).length >= 2) return 'full';
    if (it.id === 'medkit' && player.hp >= 100) return 'full';
    if (it.id.startsWith('ammo_') && player.ammo[it.id.slice(5)].res >= WEAPONS[it.id.slice(5)].maxRes) return 'full';
    return '';
  },
  buy(it) {
    const st = this.state(it);
    if (st === 'owned') return 'YOU ALREADY HAVE ONE';
    if (st === 'full') return it.id === 'medkit' ? "YOU'RE FINE, MATE" : it.id.startsWith('ammo_') ? "YOU CAN'T CARRY ANY MORE" : 'TWO HELPERS IS ALL YOU CAN FEED';
    if (it.id.startsWith('ammo_') && !player.owned.has(it.id.slice(5))) return 'BUY THE GUN FIRST';
    if (player.cash < it.price) return `YOU NEED $${it.price - player.cash} MORE`;
    player.cash -= it.price; sfx.cash(); bumpLocal(0.08);
    const id = it.id;
    if (it.slot) { player.outfit[it.slot] = id; return putOnDisguise(); }
    if (id === 'crowbar' || id === 'shotgun' || id === 'smg') {
      player.owned.add(id); updateSlots();
      if (id !== 'crowbar') { const W = WEAPONS[id]; player.ammo[id].mag = W.mag; player.ammo[id].res += W.mag * 2; }
      selectWeapon(id); player.switchT = 0;
    } else if (id === 'ammo_pistol') player.ammo.pistol.res = Math.min(WEAPONS.pistol.maxRes, player.ammo.pistol.res + 24);
    else if (id === 'ammo_shotgun') player.ammo.shotgun.res = Math.min(WEAPONS.shotgun.maxRes, player.ammo.shotgun.res + 12);
    else if (id === 'ammo_smg') player.ammo.smg.res = Math.min(WEAPONS.smg.maxRes, player.ammo.smg.res + 60);
    else if (id === 'medkit') player.hp = Math.min(100, player.hp + 50);
    else if (id === 'pal' || id === 'guard') {
      const a = new Ally(id, player.x + Math.cos(player.yaw) * 1.4, player.y, player.z - Math.sin(player.yaw) * 1.4);
      G.allies.push(a);
      return `${a.name} IS ON YOUR SIDE NOW`;
    }
    return null;
  },
};
// ---------------------------------------------------------------------
// ATM contracts: pick a target, take them down, get paid on the spot
// ---------------------------------------------------------------------
const ATM_SPOT = { name: 'CASHPOINT', kind: 'atm', blurbs: ['BALANCE: EMBARRASSING. OPPORTUNITIES: AVAILABLE.', 'INSERT CARD. OR DON\'T. WE KNOW WHO YOU ARE.', 'THE BANK OF NO QUESTIONS ASKED'] };
const C_FIRST = ['BARRY', 'DENISE', 'CLIVE', 'TREVOR', 'SHARON', 'NIGEL', 'BEV', 'DUNCAN', 'MAUREEN', 'GORDON', 'LORRAINE', 'KEITH'];
const C_NICK = ['THE BEAK', 'TWO LUNCHES', 'NO NECK', 'THE SPREADSHEET', 'MUDDY BOOTS', 'BIG SPOON', 'THE WEASEL', 'SOGGY', 'TAXMAN', 'KNEES'];
const C_LAST = ['MCCLUSKY', 'PILCHARD', 'BUNTING', 'GRIMSHAW', 'NUTTALL', 'POTTS', 'FAIRWEATHER', 'CRUMB', 'HADDOCK', 'WIGGINS'];
const C_WHY = ['owes a man named Clive a lot of money', 'put a bounty on YOU, so this is personal', 'parks across three spaces at the supermarket', 'has been selling fake bounty tips', 'ran off with the office raffle', 'is the one who leaked your address', 'replied-all to the whole city', 'cheats at the pub quiz'];
const C_KINDS = [
  { kind: 'easy', label: 'STROLLING ABOUT', pay: [55, 85], tip: 'Not expecting trouble.' },
  { kind: 'runner', label: 'A RUNNER', pay: [80, 120], tip: 'Will leg it the second they see you.' },
  { kind: 'guarded', label: 'HAS MINDERS', pay: [120, 175], tip: 'Two big lads go everywhere with them.' },
  { kind: 'armed', label: 'ARMED', pay: [100, 150], tip: 'Carries a pistol and isn\'t shy.' },
];
const targetMat = new THREE.SpriteMaterial({
  map: canvasTex(64, 64, (ctx) => { ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#ffd23a'; ctx.fillRect(29, 2, 6, 16); ctx.fillRect(29, 46, 6, 16); ctx.fillRect(2, 29, 16, 6); ctx.fillRect(46, 29, 16, 6); }),
  depthTest: false, transparent: true, sizeAttenuation: false,
});
function makeOffers() {
  G.offersDay = G.day; G.offers = [];
  const kinds = C_KINDS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  for (let i = 0; i < kinds.length; i++) {
    const K = kinds[i];
    const name = `${mpick(C_FIRST)} "${mpick(C_NICK)}" ${mpick(C_LAST)}`;
    const pay = Math.round(mr(K.pay[0], K.pay[1]) * (1 + (G.day - 1) * 0.02) / 5) * 5;
    G.offers.push({ id: 'c' + i, K, target: name, name: `${name}`, pay, why: mpick(C_WHY) });
  }
}
const atmCtx = {
  cash: () => player.cash,
  items() {
    if (G.offersDay !== G.day || !G.offers.length) makeOffers();
    return G.offers.map((o) => ({ id: o.id, name: o.name, desc: `${o.K.label}. ${o.why[0].toUpperCase() + o.why.slice(1)}. ${o.K.tip}`, price: o.pay, tag: G.contract && G.contract.offer === o ? 'ACTIVE' : `PAYS $${o.pay}` }));
  },
  state(it) { return G.contract && G.contract.offer.id === it.id ? 'owned' : ''; },
  buy(it) {
    if (G.contract) return 'FINISH YOUR CURRENT JOB FIRST';
    const o = G.offers.find((q) => q.id === it.id); if (!o) return 'THAT ONE\'S GONE';
    const tp = targetPos(), c = cityAt(tp.x, tp.z, 30);
    let p = null;
    for (let t = 0; t < 30 && !p; t++) {
      const q = randomOpenPoint(tp.x, tp.z, 70, 170, 4);
      if (q && (!c || cityAt(q.x, q.z, 0) === c) && !los(q.x, q.z, tp.x, tp.z)) p = q;
    }
    if (!p) p = randomOpenPoint(tp.x, tp.z, 60, 140) || { x: tp.x + 80, z: tp.z };
    const k = o.K.kind;
    const h = new Hunter(p.x, p.z, k === 'guarded' ? 'civ' : k === 'runner' ? 'runner' : 'civ', k === 'armed', 'search');
    G.contract = { offer: o, h, t: 240, pay: o.pay, name: o.target }; bumpLocal(0.1);
    dressTarget(h, G.contract);
    if (k === 'runner') h.fleer = true;
    G.hunters.push(h);
    if (k === 'guarded') for (let i = 0; i < 2; i++) { const g = new Hunter(p.x + mr(-2, 2), p.z + mr(-2, 2), 'brute', false, 'search'); g.guard = true; g.wt = null; G.hunters.push(g); h.guards = (h.guards || []).concat(g); }
    sfx.pickup();
    setTimeout(() => leaveShop(), 700);
    return `JOB TAKEN: ${o.target}. FOLLOW THE YELLOW MARKER. 4 MINUTES.`;
  },
};
// ---------------------------------------------------------------------
// rival runners: they're being hunted too. Pin one down and their share is yours; but when
// the town knows where YOU are, so do they, and they'd happily do the same to you.
// ---------------------------------------------------------------------
const isFleeingRival = (h) => !!(h.rival && h.fleer);
function spawnRival(r) {
  const tp = targetPos();
  let p = null;
  for (let i = 0; i < 16 && !p; i++) { const c = randomOpenPoint(tp.x, tp.z, 70, 130, 4); if (c && !safeAt(c.x, 0, c.z) && !los(c.x, c.z, tp.x, tp.z)) p = c; }
  if (!p) return false;
  const h = new Hunter(p.x, p.z, 'runner', false, 'search');
  h.rival = r; r.h = h; h.fleer = true; h.hp = 3; h.spdMul = 1.05;
  const green = lam(0x2fd07a); h.p.torso.material = green; h.p.armL.material = h.p.armR.material = green;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 64, (ctx, W, H) => { ctx.fillStyle = 'rgba(10,30,18,.8)'; ctx.fillRect(0, 8, W, H - 16); ctx.fillStyle = '#6aff9a'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`RUNNER ${r.num} · ${r.name}`, W / 2, H / 2); }), depthTest: false, transparent: true }));
  tag.scale.set(2.4, 0.6, 1); tag.position.y = 2.7; h.g.add(tag);
  G.hunters.push(h);
  return true;
}
function rivalDown(h) {
  const r = h.rival; if (!r) return;
  h.rival = null; r.h = null;
  if (!h.dead) h.die({ x: Math.sin(player.yaw) * -3, y: 2, z: Math.cos(player.yaw) * -3 }, h.y + 1, false, false);
  mhRivalCaughtByYou(r, mhCtx());
  G.hitstopT = 0.25; G.fovKick = 6;
}
function updateRival(dt) {
  const r = MH.rival; if (!r || !r.h || G.super) return;
  const h = r.h; if (h.dead) return;
  const d = Math.hypot(h.x - player.x, h.z - player.z);
  if (d > 280) { h.remove(); r.h = null; mhRivalGone(); showMsg(`RUNNER ${r.name} GOT AWAY`, 2.5); return; }
  // the town knows where you are, so they do too
  const hunting = G.level >= 2 && G.lastSeenT < 15 && d < 150 && !G.safe;
  if (hunting) {
    if (h.fleer || h.state !== 'chase') { h.fleer = false; h.state = 'search'; h.alert(); if (!r.warned) { r.warned = true; showMsg(`RUNNER ${r.name} KNOWS WHERE YOU ARE. THEY WANT YOUR SHARE`, 4); sfx.alarm(); } }
    r.trackedT = Math.max(r.trackedT || 0, 4);
  } else {
    h.fleer = true;
    if (h.state !== 'chase' && d < 30 && h.hasLOS) h.alert(); // seen you coming: legs it
  }
  // knocked off their feet and you're right there: pinned
  if (h.stun > 0.2 && d < 1.9 && !player.car && player.alive) rivalDown(h);
}
function dressTarget(h, C) {
  h.contract = C; C.h = h;
  h.p.torso.material = lam(0xe8b820); h.p.armL.material = h.p.armR.material = lam(0xe8b820);
  const tm = new THREE.Sprite(targetMat); tm.scale.setScalar(0.05); tm.position.y = 2.6; h.g.add(tm); h.targetMarker = tm;
  h.marker.position.y = 2.25;
}
function contractTargetDown(h) {
  const C = G.contract; if (!C || C.h !== h) return;
  player.cash += C.pay; sfx.cash(); setTimeout(() => sfx.cash(), 160);
  showBanner(`<small>CONTRACT COMPLETE</small>+$${C.pay}`, 2.6);
  endContract();
  G.offers = G.offers.filter((o) => o !== C.offer); if (!G.offers.length) G.offersDay = 0;
}
function endContract() {
  const C = G.contract; if (!C) return;
  if (C.h.targetMarker) C.h.targetMarker.visible = false;
  for (const g of C.h.guards || []) g.guard = false;
  C.h.contract = null; G.contract = null;
}
function updateContract(dt) {
  const C = G.contract; if (!C) return;
  C.t -= dt;
  if (C.t <= 0) { showMsg('CONTRACT EXPIRED. THE TARGET GOT AWAY', 2.5); C.h.remove(); endContract(); return; }
  // the target only joins the hunt when they actually see you; runners never do
  if (C.h.fleer && C.h.state === 'chase') C.h.marker.visible = false;
  // their minders stick with them until they spot you
  for (const g of C.h.guards || []) if (!g.dead && g.state !== 'chase' && !C.h.dead) { g.wt = { x: C.h.x + mr(-2, 2), z: C.h.z + mr(-2, 2) }; if (C.h.state === 'chase') g.alert(mr(0, 0.6)); }
}

// ---------------------------------------------------------------------
// disguises: daft accessories that make you harder to recognise until people clock you
// ---------------------------------------------------------------------
const DISGUISE_LINES = ['NEW LOOK. NOBODY WILL EVER KNOW', 'A MASTER OF DISGUISE', 'YOUR OWN MUM WOULDN\'T KNOW YOU', 'INCOGNITO. TECHNICALLY.'];
const outfitItem = (id) => CATALOG.costume.find((c) => c.id === id);
function putOnDisguise() {
  let sum = 0; for (const k in player.outfit) sum += outfitItem(player.outfit[k]).dg;
  player.disg = Math.min(1, sum);
  G.heat = Math.max(heatFloor(), G.heat - 14);
  // anyone who's lost sight of you loses track of who they're looking for
  for (const h of G.hunters) if (!h.dead && h.state === 'chase' && !h.hasLOS) { h.state = 'search'; h.wt = null; }
  G.lastSeenT = Math.max(G.lastSeenT, 11);
  updateOutfitView();
  return mpick(DISGUISE_LINES);
}
function wearDisguise(n) {
  if (player.disg <= 0) return;
  player.disg = Math.max(0, player.disg - n);
  if (player.disg === 0) { showMsg('THEY\'VE CLOCKED YOUR DISGUISE', 2.4); updateOutfitView(); G.newsLook = { ...player.outfit }; } // the sketch on the news gets updated
}
const outfitEl = $('outfit');
function updateOutfitView() {
  const o = player.outfit;
  outfitEl.className = Object.values(o).map((id) => 'o-' + id).join(' ') + (player.disg <= 0 && Object.keys(o).length ? ' burnt' : '');
  vmSleeve.color.set(o.body === 'hivis' ? 0xff7a1a : 0x3a4a3a);
}

// one warm light that hops to whichever shop you're next to, so the interiors read at night
const shopLight = new THREE.PointLight(0xffe6c0, 0, 16, 1.4); scene.add(shopLight);
function updateShopLight() {
  let best = null, bd = 30;
  for (const sp of shopSpots) { const d = Math.hypot(sp.x - player.x, sp.z - player.z); if (d < bd) { bd = d; best = sp; } }
  if (!best) { shopLight.intensity = 0; return; }
  shopLight.position.set(best.x, 3.6, best.z - (best.face === 'pz' ? 1.5 : -1.5));
  shopLight.intensity = 14 * (1 - bd / 30);
}
const allyCtx = { player, hunters: null, inCar: false, msg: (t) => showMsg(t, 2.2) };
function updateAllies(dt) {
  allyCtx.hunters = G.hunters; allyCtx.inCar = !!player.car;
  for (const a of G.allies) if (!a.dead) a.update(dt, allyCtx);
  G.allies = G.allies.filter((a) => !a.dead);
}
function startReload() {
  const W = WEAPONS[player.weapon]; if (W.melee || W.laser) return;
  const A = player.ammo[player.weapon];
  if (player.reloadT > 0 || A.mag >= W.mag || A.res <= 0 || player.car) return;
  player.reloadT = W.reload; sfx.reload();
}
function playerShove() {
  setHitKind('shove');
  if (G.super && !player.car && player.alive) { heroSwat(); return; }
  if (player.car || player.shoveCd > 0 || !player.alive) return;
  player.shoveCd = 0.55; player.shoveAnim = 1; sfx.shove();
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  kickInFront(fx, fz, 7.5, 0.5);
  for (const h of G.hunters) {
    if (h.dead) continue;
    const dx = h.x - player.x, dz = h.z - player.z, d = Math.hypot(dx, dz);
    if (d < 2.8 && Math.abs(h.y - player.y) < 1.2 && (dx * fx + dz * fz) / (d || 1) > 0.25) { h.kx += (dx / d) * 13 * h.T.knock; h.kz += (dz / d) * 13 * h.T.knock; h.stun = Math.max(h.stun, h.T.stun); h.alert(); }
  }
}

// =====================================================================
// Input
// =====================================================================
const input = { fwd: 0, side: 0, sprint: false, jump: false, runToggle: false, crouch: false, jumpEdge: false };
const keys = new Set();
// touch controls only on phones/tablets (a coarse pointer and no mouse), or once someone actually touches
// the screen. A laptop with a touchscreen, or a browser that merely supports touch events, still gets the
// mouse. Using a real mouse again switches back.
let isTouch = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
function setTouchMode(on) {
  if (isTouch === on) return;
  isTouch = on;
  applyTouchMode();
}
function applyTouchMode() {
  document.body.classList.toggle('is-touch', isTouch);
  $('controls-desktop').classList.toggle('hidden', isTouch); $('controls-touch').classList.toggle('hidden', !isTouch);
  if (G.mode === 'playing' || G.mode === 'paused') $('touch').classList.toggle('hidden', !isTouch);
  if (isTouch && document.pointerLockElement && document.exitPointerLock) { hadLock = false; document.exitPointerLock(); }
}
const stick = { id: null, cx: 0, cy: 0 };
let touchJump = false, touchCrouch = false, lookTouch = null;
function recomputeKeys() {
  if (isTouch && stick.id !== null) return;
  input.fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  input.side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || input.runToggle;
  input.jump = keys.has('Space') || touchJump;
  input.crouch = keys.has('KeyC') || keys.has('ControlLeft') || touchCrouch;
}
window.addEventListener('keydown', (e) => {
  if (G.mode === 'shop') {
    if (/^Digit[0-9]$/.test(e.code)) shopBuy((+e.code.slice(5) + 9) % 10);
    if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'KeyQ') leaveShop();
    return;
  }
  if (G.mode !== 'playing') return;
  if (/^Digit[1-4]$/.test(e.code)) selectWeapon(SLOTS[+e.code.slice(5) - 1]);
  if (e.code === 'KeyQ') selectWeapon(player.weapon === 'hands' ? player.lastWeapon : 'hands');
  if (e.code === 'Space' && !e.repeat) input.jumpEdge = true;
  keys.add(e.code); recomputeKeys();
  if (e.code === 'KeyE') useAction();
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyF') playerShove();
  if (e.code === 'KeyT' && G.mode === 'playing') throwJunk(SK);
  if (e.code === 'KeyM') G.bigMap = !G.bigMap;
  if (e.code === 'KeyJ') pauseGame(); // your diary is on the pause screen
  if (e.code === 'KeyG' && G.super) heroPoseCmd(HC);
  if (e.code === 'Escape' || e.code === 'KeyP') pauseGame();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); recomputeKeys(); });
window.addEventListener('blur', () => { keys.clear(); recomputeKeys(); });
function look(dx, dy, sens) {
  if (player.car) { player.camOff -= dx * sens; return; }
  player.yaw -= dx * sens; player.pitch = clamp(player.pitch - dy * sens, -1.45, 1.45);
}
let hadLock = false, lockFailed = false, lockWaitT = 0;
// no pointer lock (some embedded pages refuse it): drag with the mouse to look, a quick click still fires
const drag = { on: false, moved: 0, t: 0 };
window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && isTouch && (Math.abs(e.movementX) + Math.abs(e.movementY)) > 0) setTouchMode(false); });
document.addEventListener('mousemove', (e) => {
  if (G.mode !== 'playing' || isTouch) return;
  if (document.pointerLockElement === canvas) look(e.movementX, e.movementY, 0.0022);
  else if (drag.on && e.buttons) { look(e.movementX, e.movementY, 0.0042); drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY); }
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; });
canvas.addEventListener('mousedown', (e) => {
  if (isTouch || G.mode !== 'playing') return;
  if (document.pointerLockElement === canvas) { if (e.button === 0) primaryDown(); if (e.button === 2) secondary(); return; }
  if (!lockFailed) lockPointer();
  // until the lock arrives (or if it never does), dragging looks around
  drag.on = true; drag.moved = 0; drag.t = performance.now();
  if (e.button === 2) secondary();
});
window.addEventListener('mouseup', (e) => {
  if (drag.on) {
    drag.on = false;
    // a click without much dragging still shoots
    if (e.button === 0 && drag.moved < 8 && performance.now() - drag.t < 350 && G.mode === 'playing' && document.pointerLockElement !== canvas && lockFailed) { primaryDown(); primaryUp(); }
    return;
  }
  if (e.button === 0) primaryUp();
});
window.addEventListener('wheel', (e) => { if (G.mode === 'playing' && Math.abs(e.deltaY) > 4) cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function lockPointer() {
  if (isTouch) return;
  if (!canvas.requestPointerLock) { lockFailed = true; return; }
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { lockFailed = true; }); } catch { lockFailed = true; }
  // some embeds neither grant nor refuse it: give up waiting and use drag-to-look
  clearTimeout(lockWaitT); lockWaitT = setTimeout(() => { if (document.pointerLockElement !== canvas) lockFailed = true; }, 700);
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { hadLock = true; return; }
  if (hadLock && !isTouch && G.mode === 'playing') pauseGame();
  hadLock = false;
});
applyTouchMode();
{
  const stickEl = $('stick'), knob = $('stick-knob');
  window.addEventListener('touchstart', (e) => {
    setTouchMode(true);
    if (G.mode !== 'playing') return;
    for (const t of e.changedTouches) {
      if (t.target.classList && t.target.classList.contains('tbtn')) continue;
      if (t.clientX < window.innerWidth * 0.45 && stick.id === null) { const r = stickEl.getBoundingClientRect(); stick.id = t.identifier; stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2; }
      else if (lookTouch === null) lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) {
        let dx = (t.clientX - stick.cx) / 55, dy = (t.clientY - stick.cy) / 55; const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        input.side = dx; input.fwd = -dy; input.sprint = input.runToggle || l > 0.98;
        knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
      } else if (lookTouch && t.identifier === lookTouch.id) { look(t.clientX - lookTouch.x, t.clientY - lookTouch.y, 0.0055); lookTouch.x = t.clientX; lookTouch.y = t.clientY; }
    }
  }, { passive: true });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) { stick.id = null; input.fwd = input.side = 0; input.sprint = input.runToggle; knob.style.transform = ''; }
      if (lookTouch && t.identifier === lookTouch.id) lookTouch = null;
    }
  };
  window.addEventListener('touchend', endTouch); window.addEventListener('touchcancel', endTouch);
  const btn = (id, down, up) => {
    const el = $(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(el); }, { passive: false });
    if (up) el.addEventListener('touchend', (e) => { e.preventDefault(); up(el); }, { passive: false });
  };
  btn('btn-fire', primaryDown, primaryUp);
  btn('btn-shove', secondary);
  btn('btn-wpn', () => cycleWeapon(1));
  btn('btn-jump', () => { touchJump = true; input.jump = true; input.jumpEdge = true; }, () => { touchJump = false; input.jump = false; });
  btn('btn-slide', () => { touchCrouch = true; input.crouch = true; }, () => { touchCrouch = false; input.crouch = false; });
  btn('btn-run', (el) => { input.runToggle = !input.runToggle; input.sprint = input.runToggle; el.classList.toggle('on', input.runToggle); });
  btn('btn-car', useAction);
  btn('btn-reload', startReload);
  btn('btn-pause', pauseGame);
  btn('btn-map', () => (G.bigMap = !G.bigMap));
  btn('btn-throw', () => { if (G.mode === 'playing') throwJunk(SK); });
  btn('btn-pose', () => { if (G.super && G.mode === 'playing') heroPoseCmd(HC); });
}

// =====================================================================
// HUD
// =====================================================================
const hud = {
  city: $('hud-city'), day: $('hud-day'), clock: $('hud-clock'), stars: $('hud-stars'), pname: $('hud-pname'), heat: $('hud-heatfill'), air: $('hud-air'), wx: $('hud-wx'),
  time: $('hud-time'), kills: $('hud-kills'), alert: $('hud-alert'), msg: $('hud-msg'), banner: $('hud-banner'),
  hp: $('bar-health'), st: $('bar-stamina'), vig: $('vignette'), ammo: $('hud-ammo'), prompt: $('hud-prompt'),
  pose: $('btn-pose'), carbar: $('carbar'), carhp: $('bar-car'), cross: $('crosshair'), btnCar: $('btn-car'), junk: $('hud-junk'), crack: $('hidecrack'), btnThrow: $('btn-throw'), map: $('minimap'), cash: $('hud-cash'), allies: $('hud-allies'), job: $('hud-job'), disg: $('hud-disg'), sus: $('hud-sus'),
};
function showMsg(t, dur = 2) { hud.msg.textContent = t; hud.msg.classList.add('show'); G.msgT = dur; }
let bannerT = 0;
function showBanner(html, dur = 3) { hud.banner.innerHTML = html; hud.banner.classList.add('show'); bannerT = dur; }

const mm = hud.map.getContext('2d');
function drawMinimap() {
  const big = !!G.bigMap;
  const W = big ? 360 : 170;
  if (hud.map.width !== W) { hud.map.width = W; hud.map.height = W; }
  hud.map.classList.toggle('big', big);
  const tp = targetPos(), range = big ? 700 : (player.car ? 190 : 100), sc = W / 2 / range;
  mm.save();
  mm.clearRect(0, 0, W, W);
  mm.beginPath(); mm.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mm.clip();
  mm.fillStyle = '#3f5c36'; mm.fillRect(0, 0, W, W);
  mm.translate(W / 2, W / 2);
  const yaw = big ? 0 : player.car ? player.car.heading + Math.PI + player.camOff : player.yaw;
  mm.rotate(yaw); mm.scale(sc, sc); mm.translate(-tp.x, -tp.z);
  const inR = (x0, z0, x1, z1, pad) => !(x1 < tp.x - range - pad || x0 > tp.x + range + pad || z1 < tp.z - range - pad || z0 > tp.z + range + pad);
  mm.fillStyle = '#2f5f82'; for (const w of waterRects) if (inR(w.x0, w.z0, w.x1, w.z1, 40)) mm.fillRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0);
  mm.fillStyle = '#34323a';
  for (const c of CITIES) { const sw = manhuntSweepCity() === c.name; mm.fillStyle = sw ? (Math.sin(G.elapsed * 5) > 0 ? '#5a2a30' : '#46282c') : '#34323a'; mm.fillRect(c.minX, c.minZ, c.maxX - c.minX, c.maxZ - c.minZ); }
  mm.fillStyle = '#34323a';
  for (const h of HIGHWAYS) { if (h.axis === 'x') mm.fillRect(h.a0, h.fixed - 7, h.a1 - h.a0, 14); else mm.fillRect(h.fixed - 7, h.a0, 14, h.a1 - h.a0); }
  mm.fillStyle = '#7d7886';
  for (const b of blockRects) if (inR(b.x0, b.z0, b.x1, b.z1, 60)) mm.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  if (!big) { mm.fillStyle = '#57535e'; for (const c of colliders) if (c.x1 - c.x0 > 2 && c.z1 - c.z0 > 2 && c.h > 2 && inR(c.x0, c.z0, c.x1, c.z1, 20)) mm.fillRect(c.x0, c.z0, c.x1 - c.x0, c.z1 - c.z0); }
  if (big) { mm.fillStyle = '#fff'; mm.font = `bold ${14 / sc}px Arial`; mm.textAlign = 'center'; for (const c of CITIES) { mm.save(); mm.translate(c.cx, c.cz); mm.fillText(c.name, 0, 0); mm.restore(); } }
  const under = player.y < -1.2 && !player.car;
  for (const u of undergroundRects) if (inR(u.x0, u.z0, u.x1, u.z1, 10)) { mm.fillStyle = under ? (u.kind === 'metro' ? '#4a7ab0' : '#6a8a4a') : 'rgba(90,140,200,.25)'; mm.fillRect(u.x0, u.z0, u.x1 - u.x0, u.z1 - u.z0); }
  mm.strokeStyle = '#ffd23a'; mm.lineWidth = 1.6 / sc;
  for (const Z of ziplines) if (inR(Math.min(Z.a.x, Z.b.x), Math.min(Z.a.z, Z.b.z), Math.max(Z.a.x, Z.b.x), Math.max(Z.a.z, Z.b.z), 10)) { mm.beginPath(); mm.moveTo(Z.a.x, Z.a.z); mm.lineTo(Z.b.x, Z.b.z); mm.stroke(); }
  if (!big) { mm.fillStyle = '#ffd23a'; for (const L of ladders) if (inR(L.x, L.z, L.x, L.z, 5)) mm.fillRect(L.x - 1.2, L.z - 1.2, 2.4, 2.4); }
  for (const p of G.pickups) if (p.active) { mm.fillStyle = p.kind === 'health' ? '#3cff6a' : '#ffc83a'; mm.fillRect(p.x - 1.5 / sc * 1.2, p.z - 1.5 / sc * 1.2, 3 / sc * 1.2, 3 / sc * 1.2); }
  for (const c of G.cars) {
    if (c.far) continue;
    mm.save(); mm.translate(c.x, c.z); mm.rotate(-c.heading);
    mm.fillStyle = c.driver === 'hunter' ? '#ff3b3b' : c.driver === 'player' ? '#5ab4ff' : c.wrecked ? '#222' : '#e6e6e6';
    mm.fillRect(-1.1, -2.3, 2.2, 4.6); mm.restore();
  }
  for (const sp of shopSpots) { mm.fillStyle = sp.kind === 'guns' ? '#ff9a2a' : sp.kind === 'hire' ? '#4aa0ff' : '#ff5ac8'; const k = (big ? 6 : 4) / sc * 0.9; mm.fillRect(sp.x - k, sp.z - k, k * 2, k * 2); }
  for (const S of safehouses) {
    const cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2, k = (big ? 7 : 5) / sc;
    mm.fillStyle = !S.owned ? '#9a9aa6' : S.burnedDay === G.day ? '#ff5a4a' : '#ffffff';
    mm.fillRect(cx - k, cz - k * 0.2, k * 2, k * 1.2);
    mm.beginPath(); mm.moveTo(cx - k * 1.3, cz - k * 0.2); mm.lineTo(cx, cz - k * 1.3); mm.lineTo(cx + k * 1.3, cz - k * 0.2); mm.closePath(); mm.fill();
  }
  if (!big) for (const C of cams) { if (!inR(C.x, C.z, C.x, C.z, 5)) continue; mm.fillStyle = C.broken ? '#555' : C.alarmT > 0 ? '#ff3030' : '#ff9a9a'; mm.beginPath(); mm.arc(C.x, C.z, 1.6 / sc * 1.3, 0, Math.PI * 2); mm.fill(); }
  mm.fillStyle = '#9affb0'; for (const a of atmSpots) mm.fillRect(a.x - 1.6 / sc, a.z - 1.6 / sc, 3.2 / sc, 3.2 / sc);
  mm.fillStyle = '#5fd06a'; for (const D of G.drops) mm.fillRect(D.x - 1, D.z - 1, 2, 2);
  mm.fillStyle = '#e8c070'; for (const B of gigBoards) mm.fillRect(B.x - 1.6 / sc, B.z - 1.6 / sc, 3.2 / sc, 3.2 / sc); // notice boards
  for (const M of marketMapMarks(MK)) { // markets (striped squares) and, with the old town map, every hiding place
    if (M.kind === 'hide') { if (!inR(M.x, M.z, M.x, M.z, 5)) continue; mm.fillStyle = '#b8ffd8'; mm.beginPath(); mm.arc(M.x, M.z, 1.4 / sc * 1.2, 0, Math.PI * 2); mm.fill(); continue; }
    const k = (big ? 8 : 6) / sc; mm.fillStyle = M.open ? '#ff8a3a' : '#8a6a5a'; mm.fillRect(M.x - k, M.z - k, k * 2, k * 2); mm.fillStyle = '#fff4d0'; mm.fillRect(M.x - k, M.z - k * 0.25, k * 2, k * 0.5);
  }
  for (const M of gigMapMarks()) if (M.area) { mm.fillStyle = 'rgba(255,154,208,.18)'; mm.strokeStyle = M.color; mm.lineWidth = 1.5 / sc; mm.beginPath(); mm.arc(M.x, M.z, M.area, 0, Math.PI * 2); mm.fill(); mm.stroke(); }
  const dot = Math.max(1.8, 2.2 / sc);
  mm.fillStyle = '#3cff8a'; for (const a of G.allies) if (!a.dead) { mm.beginPath(); mm.arc(a.x, a.z, dot * 1.2, 0, Math.PI * 2); mm.fill(); }
  for (const h of G.hunters) { if (h.dead) continue; mm.fillStyle = h.type === 'cop' ? '#5a8cff' : h.tracker ? '#ff9a2a' : h.state === 'chase' ? '#ff3b3b' : '#c9b8b8'; mm.beginPath(); mm.arc(h.x, h.z, h.state === 'chase' ? dot * 1.2 : dot, 0, Math.PI * 2); mm.fill(); }
  for (const a of [...G.helis, ...G.drones]) {
    if (a.dead) continue;
    if (a.kind === 'heli') { mm.fillStyle = a.state === 'track' ? 'rgba(255,80,80,.35)' : 'rgba(230,240,255,.3)'; mm.beginPath(); mm.arc(a.bx, a.bz, 9, 0, Math.PI * 2); mm.fill(); }
    mm.fillStyle = '#fff'; mm.strokeStyle = '#1d2a4a'; mm.lineWidth = 1 / sc;
    mm.beginPath(); mm.arc(a.x, a.z, (a.kind === 'heli' ? 4 : 2.4) / sc * 1.4, 0, Math.PI * 2); mm.fill(); mm.stroke();
  }
  if (G.contract) {
    const T = G.contract.h, r0 = (big ? 7 : 5) / sc;
    mm.strokeStyle = '#ffd23a'; mm.lineWidth = 2.2 / sc; mm.beginPath(); mm.arc(T.x, T.z, r0, 0, Math.PI * 2); mm.stroke();
    mm.fillStyle = '#ffd23a'; mm.beginPath(); mm.arc(T.x, T.z, r0 * 0.4, 0, Math.PI * 2); mm.fill();
  }
  mm.restore();
  // contract target off the edge of the minimap: a yellow arrow on the rim pointing at them
  if (G.contract && !big) {
    const T = G.contract.h, dx = T.x - tp.x, dz = T.z - tp.z, dd = Math.hypot(dx, dz);
    if (dd > range * 0.92) {
      const a = Math.atan2(dz, dx) + yaw, R0 = W / 2 - 9;
      mm.save(); mm.translate(W / 2 + Math.cos(a) * R0, W / 2 + Math.sin(a) * R0); mm.rotate(a);
      mm.fillStyle = '#ffd23a'; mm.beginPath(); mm.moveTo(7, 0); mm.lineTo(-5, -6); mm.lineTo(-5, 6); mm.closePath(); mm.fill(); mm.restore();
    }
  }
  for (const M of gigMapMarks()) if (!M.area) drawMapTarget(M, tp, range, yaw, W, big, sc);
  { const T = mhTarget(); if (T) drawMapTarget(T, tp, range, yaw, W, big, sc); const R = mhRivalTarget(); if (R) drawMapTarget(R, tp, range, yaw, W, big, sc); }
  if (G.super) { for (const M of heroMapMarks()) drawMapTarget(M, tp, range, yaw, W, big, sc); for (const M of villainMapMarks()) drawVillainMark(M, tp, range, yaw, W, big, sc); }
  mm.save(); mm.translate(W / 2, W / 2); if (big) mm.rotate(-(player.car ? player.car.heading + Math.PI + player.camOff : player.yaw));
  mm.fillStyle = '#5ab4ff'; mm.strokeStyle = '#fff'; mm.lineWidth = 1.5;
  mm.beginPath(); mm.moveTo(0, -8); mm.lineTo(6, 6); mm.lineTo(0, 3); mm.lineTo(-6, 6); mm.closePath(); mm.fill(); mm.stroke();
  mm.restore();
}

// a villain's lair on the minimap: a skull badge in their colour, or an arrow on the rim if off the edge
function drawVillainMark(M, tp, range, yaw, W, big, sc) {
  const dx = M.x - tp.x, dz = M.z - tp.z, dd = Math.hypot(dx, dz);
  mm.save(); mm.fillStyle = M.color; mm.strokeStyle = '#111'; mm.lineWidth = 2;
  if (dd < range * 0.92) {
    const c = Math.cos(-yaw), s = Math.sin(-yaw), px = W / 2 + (dx * c - dz * s) * sc, pz = W / 2 + (dx * s + dz * c) * sc, k = (big ? 9 : 7) * (M.fighting ? 1 + Math.abs(Math.sin(G.elapsed * 6)) * 0.3 : 1);
    mm.translate(px, pz); mm.beginPath(); mm.arc(0, 0, k, 0, Math.PI * 2); mm.fill(); mm.stroke();
    mm.fillStyle = '#111'; mm.fillRect(-k * 0.5, -k * 0.25, k * 0.35, k * 0.35); mm.fillRect(k * 0.15, -k * 0.25, k * 0.35, k * 0.35); mm.fillRect(-k * 0.3, k * 0.35, k * 0.6, k * 0.15);
    if (big) { mm.fillStyle = M.color; mm.font = 'bold 11px Arial'; mm.textAlign = 'center'; mm.fillText(M.name, 0, k + 12); }
  } else if (!big) {
    const a = Math.atan2(dz, dx) + yaw, R0 = W / 2 - 9;
    mm.translate(W / 2 + Math.cos(a) * R0, W / 2 + Math.sin(a) * R0); mm.rotate(a);
    mm.beginPath(); mm.moveTo(7, 0); mm.lineTo(-5, -6); mm.lineTo(-5, 6); mm.closePath(); mm.fill(); mm.stroke();
  }
  mm.restore();
}
// today's goal on the minimap: a diamond on the spot, or an arrow on the rim if it's off the edge
function drawMapTarget(T, tp, range, yaw, W, big, sc) {
  const dx = T.x - tp.x, dz = T.z - tp.z, dd = Math.hypot(dx, dz);
  mm.save(); mm.fillStyle = T.color; mm.strokeStyle = '#08131a'; mm.lineWidth = 1.5;
  if (dd < range * 0.92) {
    const c = Math.cos(-yaw), s = Math.sin(-yaw), px = W / 2 + (dx * c - dz * s) * sc, pz = W / 2 + (dx * s + dz * c) * sc, k = big ? 8 : 6;
    mm.translate(px, pz); mm.beginPath(); mm.moveTo(0, -k); mm.lineTo(k, 0); mm.lineTo(0, k); mm.lineTo(-k, 0); mm.closePath(); mm.fill(); mm.stroke();
  } else if (!big) {
    const a = Math.atan2(dz, dx) + yaw, R0 = W / 2 - 9;
    mm.translate(W / 2 + Math.cos(a) * R0, W / 2 + Math.sin(a) * R0); mm.rotate(a);
    mm.beginPath(); mm.moveTo(8, 0); mm.lineTo(-5, -7); mm.lineTo(-5, 7); mm.closePath(); mm.fill(); mm.stroke();
  }
  mm.restore();
}

let hudT = 0;
function updateHUD(dt) {
  if (G.super) hud.pose.classList.toggle('cooling', HERO.poseCd > 0);
  hudT -= dt;
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0) hud.msg.classList.remove('show'); }
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) hud.banner.classList.remove('show'); }
  G.hurtFlash = Math.max(0, G.hurtFlash - dt * 1.4);
  hud.vig.style.opacity = Math.max(G.hurtFlash, player.hp < 30 ? 0.35 + Math.sin(G.elapsed * 6) * 0.1 : 0).toFixed(2);
  hud.hp.style.width = player.hp + '%'; hud.st.style.width = player.stam + '%'; hud.st.style.opacity = player.exhausted ? 0.45 : 1;
  drawMinimap();
  if (hudT > 0) return;
  hudT = 0.1;
  hud.city.textContent = G.locale;
  hud.day.textContent = `DAY ${Math.min(G.day, CFG.days)} / ${CFG.days} · ${dayNameOf(G.day).slice(0, 3)}`;
  const hh = Math.floor(G.hour), mn = Math.floor(((G.hour - hh) * 60) / 15) * 15;
  hud.clock.textContent = String(hh).padStart(2, '0') + ':' + String(mn).padStart(2, '0') + (G.dayAmt < 0.3 ? ' · NIGHT' : '') + (WX.kind !== 'clear' ? ' · ' + WX_NAMES[WX.kind] : '');
  hud.wx.textContent = WX.blackout && WX.blackout.city === WX.here ? 'POWER CUT: STREETS ARE DARK' : WX.festival && WX.festival.city === WX.here ? FESTIVALS[WX.here] + ': CROWDS' : '';
  hud.stars.innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i < G.level ? 'on' : ''}">★</span>`).join('');
  hud.pname.textContent = G.super ? 'THE PARAGON' : LEVEL_NAMES[G.level];
  const lo = LEVELS[G.level], hi = LEVELS[G.level + 1] ?? 330;
  hud.heat.style.width = (G.super ? HERO.bored * 100 : clamp((G.heat - lo) / (hi - lo), 0, 1) * 100).toFixed(0) + '%';
  if (G.super) hud.stars.innerHTML = '<span class="on">BOREDOM</span>';
  const nh = G.helis.filter((a) => !a.dead && !a.leaving).length, nd = G.drones.filter((a) => !a.dead && !a.leaving).length;
  hud.air.textContent = nh || nd ? `${nh ? nh + (nh > 1 ? ' HELICOPTERS' : ' HELICOPTER') : ''}${nh && nd ? ' · ' : ''}${nd ? nd + (nd > 1 ? ' DRONES' : ' DRONE') : ''} SEARCHING` : '';
  hud.time.textContent = fmtTime(G.elapsed) + ' survived';
  hud.kills.textContent = G.kills ? G.kills + (G.kills === 1 ? ' takedown' : ' takedowns') : '';
  const chasing = G.hunters.filter((h) => !h.dead && h.state === 'chase' && !isFleeingRival(h)).length + G.cars.filter((c) => c.driver === 'hunter').length;
  if (G.safe) { hud.alert.textContent = 'SAFEHOUSE · LYING LOW'; hud.alert.className = 'calm'; }
  else if (G.inSafe && G.inSafe.owned) { hud.alert.textContent = 'SAFEHOUSE BURNED'; hud.alert.className = 'hot'; }
  else if (G.airTracking) { hud.alert.textContent = 'TRACKED FROM THE AIR · GET UNDER COVER, UNDERGROUND OR INTO A CROWD'; hud.alert.className = 'hot'; }
  else if (chasing) { hud.alert.textContent = `${chasing} HUNTING YOU`; hud.alert.className = 'hot'; }
  else if (G.super) { const HH = heroHud(); hud.alert.textContent = G.villainFight ? `FIGHTING ${G.villainFight.def.name}` : `${HH.mood} · APPROVAL ${HH.approval}% (REAL: ${HH.real}%)`; hud.alert.className = G.villainFight ? 'hot' : HH.bored > 0.55 ? 'warm' : 'calm'; }
  else if (G.stareT > 0) { hud.alert.textContent = "SOMEONE'S STARING AT YOU"; hud.alert.className = 'warm'; }
  else if (G.unseenT > 10) { hud.alert.textContent = G.conspic < 0.3 && !player.car ? 'BLENDING IN' : 'HIDDEN'; hud.alert.className = 'calm'; }
  else { hud.alert.textContent = 'THEY LOST SIGHT OF YOU'; hud.alert.className = 'warm'; }
  const W = WEAPONS[player.weapon], A = player.ammo[player.weapon];
  hud.ammo.innerHTML = player.car ? '' : `<small>${W.name}</small>` + (W.hands ? '<i>HIDDEN AWAY</i>' : W.laser ? (player.flying ? '<i>FLYING</i>' : '<i>UNLIMITED</i>') : W.melee ? (player.launchCd > 0 ? `<i>BIG SWING ${player.launchCd.toFixed(1)}s</i>` : '<i>BIG SWING READY</i>') : player.reloadT > 0 ? 'RELOADING…' : `<b>${A.mag}</b> / ${A.res}`);
  hud.cash.textContent = '$' + player.cash;
  const nOut = Object.keys(player.outfit).length;
  const ls = localSus();
  hud.sus.innerHTML = ls > 0.02 ? `LOCALS ${ls < 0.25 ? 'CURIOUS' : ls < 0.55 ? 'WARY' : ls < 0.8 ? 'SUSPICIOUS' : 'ON TO YOU'} <span><i style="width:${(ls * 100).toFixed(0)}%"></i></span>` : '';
  hud.disg.innerHTML = nOut ? `DISGUISE <span><i style="width:${(player.disg * 100).toFixed(0)}%"></i></span>` : '';
  const CT = G.contract;
  const VF = G.super && G.villainFight;
  if (VF) hud.job.innerHTML = `<b style="color:${VF.def.css}">${VF.def.name}</b> ${VF.def.title}<br><span class="vbar"><i style="width:${Math.max(0, VF.hp / VF.def.hp * 100).toFixed(0)}%;background:${VF.def.css}"></i></span>`;
  else if (G.super && HERO.call) { const dd = Math.hypot(HERO.call.x - player.x, HERO.call.z - player.z); hud.job.innerHTML = `<b>CALL</b> ${HERO.call.K.text(localeName(HERO.call.x, HERO.call.z))}<br>${Math.round(dd)} m · ${fmtTime(HERO.call.t)} left`; }
  else if (CT) { const dd = Math.hypot(CT.h.x - player.x, CT.h.z - player.z); hud.job.innerHTML = `<b>CONTRACT</b> ${CT.name}<br>${Math.round(dd)} m · ${fmtTime(CT.t)} left · pays $${CT.pay}`; }
  else if (GJ_STATE.gig) hud.job.innerHTML = gigHud(GJ);
  hud.job.classList.toggle('hidden', !CT && !VF && !(G.super && HERO.call) && !GJ_STATE.gig);
  const al = G.allies.filter((a) => !a.dead);
  hud.allies.innerHTML = al.map((a) => `<span>${a.name} <em style="width:${Math.max(0, a.hp / a.T.hp * 100).toFixed(0)}%"></em></span>`).join('');
  hud.carbar.classList.toggle('hidden', !player.car);
  if (player.car) hud.carhp.style.width = player.car.hp + '%';
  hud.cross.classList.toggle('hidden', !!player.car);
  let prompt = '';
  const PST = stealthUseTarget(SK), pmark = PST?.kind === 'mark' ? PST.obj : null, pjunk = PST?.kind === 'junk' ? PST.obj : null, pbin = PST?.kind === 'bin' ? PST.obj : null;
  const useK = isTouch ? 'Tap USE' : 'Press E';
  const pboard = !player.car && player.mode === 'move' ? gigBoardNear(player.x, player.y, player.z) : null, plorry = lorryRearNear(GJ);
  if (GJ_STATE.ride) prompt = GJ_STATE.ride.mode === 'step' ? `${useK} to hop off · ${isTouch ? 'CROUCH' : 'C'} to drop into the hopper` : `${useK} to climb out of the lorry`;
  else if (player.hide) prompt = `${useK} to climb out of the ${hideName(player.hide).toLowerCase()}` + (SK_STATE.hideT > 30 && player.hide.kind === 'dumpster' ? ' · it\'s getting whiffy in here' : '');
  else if (player.car) prompt = Math.abs(player.car.speed) > 6 ? '' : (isTouch ? 'Tap CAR to get out' : 'Press E to get out');
  else if (player.mode === 'zip') prompt = isTouch ? 'JUMP to let go' : 'Space to let go';
  else if (player.mode === 'climb') prompt = isTouch ? 'Push forward to climb, JUMP to kick off' : 'W to climb, Space to kick off the wall, C to drop';
  else if (player.mode === 'ladder') prompt = isTouch ? 'Push forward to climb, JUMP to let go' : 'W / S to climb, Space to let go';
  else if (pramHeld()) prompt = `${useK} to let go of the pram`;
  else if (!player.car && player.mode === 'move' && kidNear(player.x, player.z)) prompt = G.super ? `${useK} to sign an autograph` : MK_STATE.sweets > 0 && kidNear(player.x, player.z).hushDay !== G.day ? `${useK} to give them a sweet (keeps them quiet today)` : `${useK} to high-five`;
  else if (townUseTarget(TDK)) prompt = townUsePrompt(townUseTarget(TDK), TDK, useK);
  else if (mdUseTarget(TDK)) prompt = mdUsePrompt(mdUseTarget(TDK), TDK, useK);
  else if (cnUseTarget(TDK)) prompt = cnUsePrompt(cnUseTarget(TDK), TDK, useK);
  else if (lnUseTarget(TDK)) prompt = lnUsePrompt(lnUseTarget(TDK), TDK, useK);
  else if (XV.some((V) => V.useTarget(TDK))) { const V = XV.find((q) => q.useTarget(TDK)); prompt = V.usePrompt(V.useTarget(TDK), TDK, useK); }
  else if (icHatchNear(TDK)) prompt = `${useK} to buy an ice cream`;
  else if (!G.super && !player.car && !player.bike && player.mode === 'move' && pramNear(player.x, player.z)) prompt = `${useK} to push the pram (you blend in, but you can't run)`;
  else if (safeDoorNear(player.x, player.y, player.z) && !safeDoorNear(player.x, player.y, player.z).owned) { const S = safeDoorNear(player.x, player.y, player.z); prompt = `${isTouch ? 'Tap USE' : 'Press E'} to rent ${S.name} for $${S.price}`; }
  else if (G.inSafe && G.inSafe.owned && safeSpotNear(G.inSafe, player.x, player.z) === 'bed') prompt = G.napDay === G.day ? 'You already napped today' : `${isTouch ? 'Tap USE' : 'Press E'} to nap (skips 5 hours)`;
  else if (G.inSafe && G.inSafe.owned && safeSpotNear(G.inSafe, player.x, player.z) === 'stash') prompt = G.inSafe.stashDay === G.day ? 'Stash is empty. Back tomorrow' : `${isTouch ? 'Tap USE' : 'Press E'} to raid the stash`;
  else if (shopNear(player.x, player.y, player.z)) { const S = shopNear(player.x, player.y, player.z); prompt = shopOpenAt(S.kind, S.city, G.day, G.hour) ? (isTouch ? 'Tap USE to shop at ' : 'Press E to shop at ') + S.name : `${S.name}: ${shutLine(S.kind, S.city, G.day, G.hour).toLowerCase()}`; }
  else if (atmNear(player.x, player.y, player.z)) prompt = (isTouch ? 'Tap USE' : 'Press E') + (G.contract ? ' to check the cashpoint' : ' for contracts at the cashpoint');
  else if (!player.car && player.mode === 'move' && stallNear(player.x, player.y, player.z)) { const st = stallNear(player.x, player.y, player.z); prompt = marketOpen(G.hour) ? `${useK} to buy from the ${st.name.toLowerCase()}` + (marketInternals.traderAt(st, MK) ? '' : ' (nobody\'s minding it)') : 'The market\'s shut. Back at 7'; }
  else if (pboard) prompt = `${useK} to read the ${pboard.name.toLowerCase()}` + (GJ_STATE.gig ? ' (you\'re already on a job)' : '');
  else if (plorry) prompt = `${useK} to hop on the back of the bin lorry`;
  else if (dlRearNear(TDK)) prompt = `${useK} to climb into the back of the lorry (it'll take you to its next drop)`;
  else if (zipStartNear()) prompt = isTouch ? 'Tap USE to ride the zipline' : 'Press E to ride the zipline';
  else if (pmark) prompt = `${useK} to pick their pocket`;
  else if (pjunk && !nearestCar(2.2)) prompt = `${useK} to pick up the ${pjunk.kind}`;
  else if (pbin && !nearestCar(2.2)) prompt = `${useK} to hide in the ${hideName(pbin).toLowerCase()}`;
  else if (player.bike) prompt = isTouch ? 'Tap USE to hop off the bike' : 'Press E to hop off · Shift to pedal hard';
  else if (!G.super && !nearestCar(2.6) && bikeNear(player.x, player.z)) prompt = isTouch ? 'Tap USE to ride the bike' : 'Press E to ride the bike';
  else if (!G.super && !nearestCar(2.6) && riderNear(player.x, player.z)) prompt = isTouch ? 'Tap USE to nick their bike' : 'Press E to nick their bike';
  else if (nearestCar(3.6)) prompt = isTouch ? 'Tap USE to steal it' : 'Press E to steal this car';
  hud.prompt.textContent = prompt;
  hud.crack.classList.toggle('show', !!player.hide);
  hud.crack.classList.toggle('slats', !!player.hide && ['wardrobe', 'cupboard', 'locker'].includes(player.hide.kind));
  hud.crack.classList.toggle('crate', !!player.hide && player.hide.kind === 'crate');
  { const n = SK_STATE.junk.length, cnt = {}; for (const k of SK_STATE.junk) cnt[k] = (cnt[k] || 0) + 1; hud.junk.textContent = n ? Object.keys(cnt).map((k) => `${cnt[k]} ${JUNK_NAMES[k][cnt[k] > 1 ? 1 : 0]}`).join(' · ') + ` · NEXT: ${JUNK_NAMES[SK_STATE.junk[n - 1]][0]}${isTouch ? '' : ' (T)'}` : ''; }
  if (hud.btnThrow) hud.btnThrow.classList.toggle('hidden', !SK_STATE.junk.length || !!player.car || !!player.hide);
  if (hud.btnCar) hud.btnCar.classList.toggle('hidden', !(safeDoorNear(player.x, player.y, player.z) || (G.inSafe && safeSpotNear(G.inSafe, player.x, player.z)) || player.car || player.hide || GJ_STATE.ride || pboard || plorry || pmark || pjunk || pbin || nearestCar(3.6) || zipStartNear() || player.mode === 'zip' || shopNear(player.x, player.y, player.z) || atmNear(player.x, player.y, player.z)));
}

// =====================================================================
// Lighting
// =====================================================================
const C_NIGHT = new THREE.Color(0x0b0e1e), C_DAY = new THREE.Color(0x9cc0e4), C_DUSK = new THREE.Color(0xe0907a), C_DUSK2 = new THREE.Color(0x7a5a9a);
const C_UNDER = new THREE.Color(0x14120e), C_HEMI_UNDER = new THREE.Color(0xd8c8a0);
const C_SUN_DAY = new THREE.Color(0xfff0dd), C_SUN_DUSK = new THREE.Color(0xff9a55), C_HEMI = new THREE.Color(0xc8d0ff);
const beaconMat = new THREE.SpriteMaterial({ map: puffTex, color: 0xff2a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const beaconSprites = beacons.map((b) => { const s = new THREE.Sprite(beaconMat); s.position.set(b.x, b.y, b.z); s.scale.setScalar(2.2); scene.add(s); return s; });
function updateLighting(t) {
  const h = G.hour, elev = Math.sin(((h - 6) / 12) * Math.PI);
  const dayAmt = smoothstep(-0.22, 0.22, elev), dusk = Math.exp(-Math.pow((elev - 0.02) / 0.22, 2));
  G.dayAmt = dayAmt;
  const sky = C_NIGHT.clone().lerp(C_DAY, dayAmt).lerp(h > 12 ? C_DUSK2 : C_DUSK, dusk * 0.7);
  scene.background.copy(sky); scene.fog.color.copy(sky);
  scene.fog.near = lerp(15, 40, dayAmt); scene.fog.far = lerp(200, 420, dayAmt);
  hemi.intensity = 0.55 + dayAmt * 0.65 + dusk * 0.15;
  hemi.color.copy(C_NIGHT).lerp(C_HEMI, 0.5 + dayAmt * 0.5);
  sun.intensity = dayAmt * 1.3 + dusk * 0.35;
  sun.color.copy(C_SUN_DAY).lerp(C_SUN_DUSK, dusk);
  const ang = ((h - 6) / 12) * Math.PI;
  sun.position.set(camera.position.x + Math.cos(ang) * 150, Math.max(20, Math.sin(ang) * 160), camera.position.z + 60);
  sun.target.position.set(camera.position.x, 0, camera.position.z); sun.target.updateMatrixWorld();
  // underground: close, dark and stuffy
  const under = clamp((-camera.position.y - 1) / 2, 0, 1);
  if (under > 0) {
    scene.background.lerp(C_UNDER, under); scene.fog.color.lerp(C_UNDER, under);
    scene.fog.near = lerp(scene.fog.near, 4, under); scene.fog.far = lerp(scene.fog.far, 70, under);
    hemi.intensity = lerp(hemi.intensity, 0.75, under); hemi.color.lerp(C_HEMI_UNDER, under); sun.intensity *= 1 - under;
  }
  const win = 0.04 + (1 - dayAmt) * 1.05 + dusk * 0.2;
  for (const m of emissiveFacades) m.emissiveIntensity = win;
  applyWeatherLook(hemi, sun, dayAmt, under);
  const blink = Math.sin(t * 3) > 0.2;
  beaconMat.opacity = blink ? 1 : 0.15;
  for (const a of animated) a.obj.rotation.z += a.spin * 0.016;
}

// =====================================================================
// Game flow
// =====================================================================
function localeFactor(x, z) { const c = cityAt(x, z, 20); return c ? c.pop : 0.22; }
function spawnHunter(minD = 55, maxD = 150, state = 'search') {
  const tp = targetPos();
  let p = null;
  for (let t = 0; t < 12 && !p; t++) {
    const c = randomOpenPoint(tp.x, tp.z, minD, maxD, 4);
    if (c && !safeAt(c.x, 0, c.z) && !(Math.hypot(c.x - tp.x, c.z - tp.z) < 70 && los(c.x, c.z, tp.x, tp.z))) p = c;
  }
  if (!p) return;
  const r = Math.random(), copChance = G.level >= 2 ? (G.level - 1) * 0.08 : 0;
  const type = r < copChance ? 'cop' : r < copChance + 0.15 ? 'brute' : r < copChance + 0.4 ? 'runner' : 'civ';
  const gunner = type !== 'brute' && Math.random() < Math.min(0.08 + (G.day - 1) * 0.022, 0.5);
  const nh = new Hunter(p.x, p.z, type, gunner, state); G.hunters.push(nh);
  if (state !== 'chase') { assignJob(nh, LIFE); maybeFamily(nh, TDK); }
}
const targetHunters = () => { const tp = targetPos(); return Math.round(Math.min((32 + G.day * 1.2 + G.level * 2) * MH.bountyMul, 66) * localeFactor(tp.x, tp.z) * WX.crowd * crowdMul(G.hour, G.day, localeName(tp.x, tp.z))); }; // everyday crowds to blend into (busier at rush hour, quiet in the small hours)
const maxChasers = () => Math.round((5 + G.level * 2 + G.day * 0.35) * (0.5 + MH.bountyMul * 0.5));

function clearWorld() {
  for (const h of G.hunters) h.remove(); G.hunters.length = 0; clearCityLife(); clearBikes(player); resetStreetProps();
  for (const r of ragdolls) r.dispose(); ragdolls.length = 0;
  for (const c of G.cars) scene.remove(c.g); G.cars.length = 0;
  for (const a of [...G.helis, ...G.drones]) a.remove(); G.helis.length = 0; G.drones.length = 0;
  for (const a of G.allies) a.remove(); G.allies.length = 0;
  for (const D of G.drops) scene.remove(D.m); G.drops.length = 0; G.getUps.length = 0;
  G.contract = null; G.offers = []; G.offersDay = 0; G.held = null;
  for (const b of bubbles) { b.life = 0; b.s.removeFromParent(); }
  for (const c of G.cars) c.air = null;
}
function spawnTraffic(count) {
  const total = lanes.reduce((s, l) => s + (l.a1 - l.a0), 0);
  for (let i = 0; i < count; i++) {
    for (let t = 0; t < 20; t++) {
      let r = Math.random() * total, lane = lanes[0];
      for (const l of lanes) { r -= l.a1 - l.a0; if (r <= 0) { lane = l; break; } }
      const along = mr(lane.a0, lane.a1);
      const x = lane.axis === 'z' ? lane.fixed : along, z = lane.axis === 'z' ? along : lane.fixed;
      if (Math.hypot(x - player.x, z - player.z) < 14) continue;
      if (G.cars.some((c) => Math.abs(c.x - x) < 12 && Math.abs(c.z - z) < 12)) continue;
      const vr = Math.random(), buses = G.cars.filter((c) => c.kind === 'bus').length;
      const kind = (vr < 0.07 || (buses < 3 && i >= count - 6)) ? 'bus' : vr < 0.15 ? 'truck' : vr < 0.28 ? 'van' : vr < 0.42 ? 'hatch' : 'car'; // always a few buses about
      if (kind === 'bus' && !cityAt(x, z, 10)) continue;
      if (i < 5) { if (!cityAt(x, z, 0)) continue; G.cars.push(new Car(lane, along, null, 'binlorry')); break; } // the bin rounds
      if (i < 7) { const c = cityAt(x, z, 0); if (!c || c.name !== (i === 5 ? 'PORT HALDEN' : 'ASHFORD')) continue; G.cars.push(new Car(lane, along, null, 'icecream')); break; } // one ice cream van in each town
      G.cars.push(new Car(lane, along, null, kind)); break;
    }
  }
  for (const p of parkedSpots) { const r = Math.random(); G.cars.push(new Car(null, 0, p, r < 0.15 ? 'van' : r < 0.32 ? 'hatch' : 'car')); }
}
function resetGame() {
  clearWorld();
  resetParkour(player);
  Object.assign(player, { x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, yaw: Math.PI / 4, pitch: 0, hp: 100, stam: 100, exhausted: false, lastHurt: 99, shoveCd: 0, kx: 0, kz: 0, alive: true, car: null, ammo: freshAmmo(), reloadT: 0, fireCd: 0, dragT: 0, carHitCd: 0, camOff: 0,
    cash: START_CASH, weapon: 'hands', lastWeapon: 'pistol', owned: new Set(['pistol']), launchCd: 0, meleeCd: 0, swingT: 9, swingKind: null, swingHit: true, switchT: 0, outfit: {}, disg: 0 });
  showWeaponModel(); updateOutfitView(); updateSlots();
  Object.assign(G, { elapsed: 0, day: 1, kills: 0, pingT: 40, spawnT: 0, flowT: 0, hunterCarT: 30, overT: 0, shake: 0, hurtFlash: 0, heat: 0, level: 0, lastSeenT: 99, airT: 3, locale: '', localeT: 0, bigMap: false, hitstopT: 0, fovKick: 0, fireHeld: false });
  G.lkp = { x: 0, z: 0 };
  for (const S of safehouses) Object.assign(S, { owned: S.price === 0, burnedDay: 0, stashDay: 0 });
  resetManhunt(CFG.days);
  player.hide = null; resetStealth(SK); resetGigs(); resetMarkets(); resetKids(TDK); resetTownDay(); resetMatchDay(); resetAwayDays(); resetDeliveries(); resetIceCream(); resetCinema(); resetLaunderettes(); for (const V of XV) V.reset(TDK);
  Object.assign(G, { airGapT: 0, shook: false, safe: null, inSafe: null, napDay: 0, sleepT: 0, localSus: {}, unseenT: 99, stareT: 0 }); player.drawnT = 99;
  spawnTraffic(84);
  navRecenter(0, 0, true); computeFlow(0, 0);
  for (let i = 0; i < targetHunters(); i++) spawnHunter(40, 170);
  if (!G.pickups.length) { for (let i = 0; i < 10; i++) G.pickups.push(new Pickup('health')); for (let i = 0; i < 10; i++) G.pickups.push(new Pickup('ammo')); }
  else for (const p of G.pickups) p.place();
}
function startGame(sup = G.super) {
  G.super = !!sup;
  initAudio(); resetGame(); resetWeather(); G.newsLook = {};
  resetHero(); G.villainFight = null; G.villainsBeaten = 0; resetVillains(HC);
  SLOTS[0] = G.super ? 'laser' : 'pistol';
  if (G.super) { player.weapon = 'laser'; player.lastWeapon = 'laser'; player.owned = new Set(['laser']); player.cash = 200; showWeaponModel(); }
  updateSlots();
  $('btn-pose').classList.toggle('hidden', !G.super); // strike a pose by touch, same as G on a keyboard
  player.flying = false; player.slamming = false;
  G.mode = 'playing';
  for (const id of ['menu', 'over', 'pause']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  lockPointer();
  if (G.super) { showBanner(`THE PARAGON<small>THE CITY'S GREATEST HERO. ASK ANYONE. THEY'RE TOO SCARED TO SAY OTHERWISE.</small>`, 4); showMsg('CLICK LASER · SPACE TWICE FLY · E GRAB · F SWAT · C SLAM · G POSE', 7); setTimeout(() => { if (G.mode === 'playing' && G.super) showMsg('STARE AT PEOPLE TO WATCH THEM CRUMBLE. VILLAINS ON THE MAP ONLY FIGHT IF YOU GO TO THEM', 5); }, 7500); }
  else {
    manhuntNewDay(mhCtx());
    showBanner(`DAY 1 OF ${CFG.days}<small>${runnersLeft()} RUNNERS. THREE TOWNS HUNTING. LAST ONE FREE WINS.</small>`, 4.5);
    showMsg(`TODAY: ${MH.objective.text}`, 5);
    setTimeout(() => { if (G.mode === 'playing' && G.day === 1) showMsg("NAN'S OLD FLAT (WHITE HOUSE ON THE MAP) IS SAFE", 4); }, 5500);
  }
}
// the bits of the diary the newer modules add: shop hours where you are, the football, what's in your pockets
function extraDiaryHTML() {
  const town = localeName(player.x, player.z), T = ['ASHFORD', 'PORT HALDEN', 'SALTMARSH DOCKS'].includes(town) ? town : 'ASHFORD';
  const kinds = [['cafe', 'CAFES'], ['bar', 'PUBS'], ['pharmacy', 'CHEMIST'], ['clothes', 'SHOPS'], ['guns', 'GUN SHOP'], ['costume', 'COSTUMES'], ['mart', 'MARTS']];
  let h = `<div class="dsec">SHOP HOURS TODAY: ${T}</div><div class="drow"><span>${kinds.map(([k, n]) => `${n} ${hoursLine(k, T, G.day)}`).join(' · ')}</span></div>`;
  const M = matchNow(G.day, G.hour) || matchNow(G.day + 1, 0);
  if (M) h += `<div class="drow"><span>FOOTBALL: HARRIERS v ${opponentOn(M === matchNow(G.day, G.hour) ? G.day : G.day + 1).full}${M === matchNow(G.day, G.hour) ? '' : ' (TOMORROW)'}</span></div>`;
  h += `<div class="drow"><span>PICTUREDROME: 1 · ${filmOn(0, G.day).title} · 2 · ${filmOn(1, G.day).title}</span></div>`;
  const bits = [...mdDiaryBits(TDK), ...cnDiaryBits(TDK), ...lnDiaryBits(TDK), ...XV.flatMap((V) => V.diary(TDK))]; if (IC_STATE.coneT > 0) bits.push('AN ICE CREAM');
  if (bits.length) h += `<div class="drow"><span>${bits.join(' · ')}</span></div>`;
  return h;
}
function pauseGame() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused'; keys.clear(); recomputeKeys();
  $('diary').innerHTML = diaryHTML(TDK) + extraDiaryHTML(); // what's on today and tomorrow, and the perks you've earned
  $('pause').classList.remove('hidden');
  setAircraftVolume(0, 0);
}
function resumeGame() { initAudio(); G.mode = 'playing'; $('pause').classList.add('hidden'); lockPointer(); }
function toMenu() {
  G.mode = 'menu';
  for (const id of ['pause', 'over', 'hud', 'touch']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  setAircraftVolume(0, 0); showBest();
}
function killPlayer() {
  if (!player.alive) return;
  if (trySecondChance({ super: G.super })) { breakFree(); return; } player.alive = false; if (player.car) exitCar(true); G.overT = 1.8; }
// a second chance: you shove free of everyone on you and get a couple of seconds' head start
function breakFree() {
  player.hp = 45; player.stam = 100; player.exhausted = false; G.hitstopT = 0.6; G.shake = 0.6; G.fovKick = 8;
  for (const h of G.hunters) {
    if (h.dead) continue;
    const dx = h.x - player.x, dz = h.z - player.z, d = Math.hypot(dx, dz) || 1;
    if (d < 9) { h.stun = Math.max(h.stun, 2.6); h.kx += (dx / d) * 14; h.kz += (dz / d) * 14; }
  }
  addHeat(15); sfx.whoosh(); sfx.alarm();
}
function loadBest() { try { return JSON.parse(localStorage.getItem('hunted.best') || 'null'); } catch { return null; } }
function endGame(won) {
  G.mode = 'over';
  if (document.exitPointerLock) document.exitPointerLock();
  setAircraftVolume(0, 0);
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  const days = won ? CFG.days : G.day;
  $('over-title').textContent = won ? (MH.escaped ? 'CLEAN ESCAPE' : 'YOU SURVIVED') : 'CAUGHT';
  $('over-text').textContent = won ? (MH.escaped ? `Extracted from ${MH.extract.city} on the final night. Last runner standing.` : '30 days. Three towns came for you and nobody collected.') : `Somebody in ${G.locale === 'COUNTRYSIDE' || G.locale.startsWith('ROUTE') ? 'the middle of nowhere' : G.locale} just got very rich.`;
  $('over-stats').innerHTML = `Reached <b>Day ${days}</b> of ${CFG.days}<br>Survived <b>${fmtTime(G.elapsed)}</b><br><b>${G.kills}</b> hunters taken down<br>Peak profile: <b>${LEVEL_NAMES[G.peak || 0]}</b><br><b>${MH.done}</b> daily goals done · <b>${MH.closeCalls}</b> close calls<br><b>${MH.usedLifelines}</b> second chances used · <b>${won ? 1 : runnersLeft()}</b> of ${MH.runners.length + 1} runners still free`;
  const best = loadBest();
  try { if (!best || G.elapsed > best.time) localStorage.setItem('hunted.best', JSON.stringify({ time: G.elapsed, day: days, kills: G.kills })); } catch { /* storage unavailable */ }
  $('over').classList.remove('hidden');
}
function showBest() { const b = loadBest(); $('best').textContent = b ? `Best run: Day ${b.day}, ${fmtTime(b.time)} survived, ${b.kills} takedowns` : ''; }
$('btn-play').addEventListener('click', () => startGame(false));
$('btn-super').addEventListener('click', () => startGame(true));
$('btn-again').addEventListener('click', () => startGame());
$('btn-resume').addEventListener('click', resumeGame);
// graphics: HIGH = reflections + post effects, MEDIUM = post effects only, LOW = neither (for slow machines)
{
  const GFX = ['HIGH', 'MEDIUM', 'LOW'];
  let saved = 'HIGH'; try { saved = localStorage.getItem('hunted-gfx') || 'HIGH'; } catch { /* storage unavailable */ }
  let gi = Math.max(0, GFX.indexOf(saved));
  const apply = () => { PFX.on = gi < 2; PFX.refl = gi === 0; $('btn-gfx').textContent = 'GRAPHICS: ' + GFX[gi]; try { localStorage.setItem('hunted-gfx', GFX[gi]); } catch { /* private mode */ } };
  $('btn-gfx').addEventListener('click', () => { gi = (gi + 1) % GFX.length; apply(); });
  apply();
}
$('btn-quit').addEventListener('click', toMenu);
$('btn-menu').addEventListener('click', toMenu);
$('shop-leave').addEventListener('click', leaveShop);
showBest();

// =====================================================================
// Per-frame updates
// =====================================================================
function updatePlayer(dt) {
  player.shoveCd -= dt; player.fireCd -= dt; player.carHitCd -= dt; player.lastHurt += dt;
  player.launchCd = Math.max(0, player.launchCd - dt); player.meleeCd -= dt; player.switchT = Math.max(0, player.switchT - dt);
  player.drawnT += dt; G.conspic = conspicuous(); G.stareT = Math.max(0, G.stareT - dt);
  player.recoil = Math.max(0, player.recoil - dt * 8); player.shoveAnim = Math.max(0, player.shoveAnim - dt * 4);
  if (player.reloadT > 0) { player.reloadT -= dt; if (player.reloadT <= 0) { const W = WEAPONS[player.weapon], A = player.ammo[player.weapon]; if (!W.melee) { const n = Math.min(W.mag - A.mag, A.res); A.mag += n; A.res -= n; } } }
  if (player.swingKind) { player.swingT += dt; if (!player.swingHit && player.swingT >= SWING[player.swingKind].hit) { player.swingHit = true; crowbarImpact(player.swingKind === 'heavy'); } }
  if (G.fireHeld && !player.car) { const W = WEAPONS[player.weapon]; if (W.auto || (isTouch && !W.melee && player.fireCd < -0.07)) playerShoot(); else if (W.melee && isTouch) crowbarSwing(false); }
  if (player.lastHurt > 4 && player.hp < 100 && player.alive) player.hp = Math.min(100, player.hp + 2.5 * dt);
  if (player.car) {
    const c = player.car;
    player.x = c.x; player.z = c.z;
    if (player.dragT > 1.8) { player.dragT = 0; exitCar(true); hurtPlayer(10, c.x, c.z); showMsg('THEY DRAGGED YOU OUT!'); }
    player.dragT = Math.max(0, player.dragT - dt * 0.5);
    if (Math.abs(c.speed) > 3) player.camOff *= Math.max(0, 1 - dt * 2);
    return;
  }
  if (!player.alive) return;
  if (gigRidePlayer(dt, GJ)) { input.jumpEdge = false; return; }
  for (const V of XV) if (V.ride(dt, TDK)) { input.jumpEdge = false; return; } // on a bus, in the pool, lining up a bowl
  if (cnSeatPlayer(dt, TDK)) { input.jumpEdge = false; return; } // sat in a cinema seat or a launderette chair
  if (player.hide) { player.vx = player.vz = 0; player.sprinting = false; player.stam = Math.min(100, player.stam + 18 * dt); input.jumpEdge = false; return; }
  const moving = input.fwd !== 0 || input.side !== 0;
  const pushing = !!pramHeld(); // pushing a pram: no running, no jumping
  if (pushing) input.jumpEdge = false;
  const sprint = !pushing && input.sprint && moving && !player.exhausted && input.fwd >= 0;
  if (sprint) { player.stam -= 20 * dt; if (player.stam <= 0) { player.stam = 0; player.exhausted = true; } }
  else player.stam = Math.min(100, player.stam + (moving ? 10 : 18) * dt);
  if (player.exhausted && player.stam > 30) player.exhausted = false;
  player.sprinting = sprint;
  const speed = player.bike ? playerBikeSpeed(sprint) : sprint ? 10 : pushing ? 4.2 : 5.8;
  if (player.bike) { if (sprint) player.stam += 12 * dt; input.crouch = false; if (player.mode !== 'move' || G.super) playerBikeAction(BK); } // pedalling is easier than sprinting, and no sliding on a bike
  player.kx *= Math.max(0, 1 - dt * 6); player.kz *= Math.max(0, 1 - dt * 6);
  if (G.super && input.jumpEdge && !player.grounded && player.mode === 'move' && !player.flying) { player.flying = true; player.vy = 0; showMsg('FLYING. HOLD SPACE TO RISE, C TO DROP', 2); sfx.swoosh(); }
  if (player.flying) flyMove(dt); else parkourMove(dt, player, input, sprint, speed, parkourCb);
  input.jumpEdge = false;
  for (const h of G.hunters) {
    if (h.dead || Math.abs(h.y - player.y) > 1.2) continue;
    const dx = player.x - h.x, dz = player.z - h.z, d = Math.hypot(dx, dz), m = 0.4 + 0.35 * h.T.scale;
    if (d < m && d > 1e-4) { const k = ((m - d) / d) * 0.5; player.x += dx * k; player.z += dz * k; h.x -= dx * k; h.z -= dz * k; }
  }
  if (player.grounded && player.mode === 'move') {
    const ob = player.bob;
    player.bob += Math.hypot(player.vx, player.vz) * dt * 1.6 * (player.slideT > 0 ? 0 : 1);
    if (Math.floor(ob / Math.PI) !== Math.floor(player.bob / Math.PI)) sfx.step();
  }
}
function flyMove(dt) {
  const fast = input.sprint ? 42 : 15, cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  const wx = (fx * cp * input.fwd + rx * input.side) * fast, wz = (fz * cp * input.fwd + rz * input.side) * fast;
  const above = player.y - floorAt(player.x, player.z, player.y + 0.3);
  if (input.crouch && above > 5 && !player.slamming) { player.slamming = true; sfx.swoosh(); }
  const wy = player.slamming ? -55 : sp * input.fwd * fast + (input.jump ? 14 : 0) - (input.crouch ? 12 : 0);
  const k = Math.min(1, dt * (player.slamming ? 12 : 4));
  player.vx = lerp(player.vx, wx, k); player.vz = lerp(player.vz, wz, k); player.vy = lerp(player.vy, wy, k);
  const prevY = player.y;
  const fox = player.x, foz = player.z;
  player.x += player.vx * dt; player.z += player.vz * dt; player.y = Math.min(260, player.y + player.vy * dt);
  moveBody(player, fox, foz, 0.4, player.y, 1.8);
  const fl = floorAt(player.x, player.z, Math.max(prevY, player.y) + 0.3);
  if (player.y <= fl) { player.y = fl; if (player.vy < 0.5) { if (player.slamming) heroSlam(); else for (const h of G.hunters) if (!h.dead && Math.hypot(h.x - player.x, h.z - player.z) < 25) h.panicT = mr(3, 6); player.flying = false; player.slamming = false; player.grounded = true; player.vy = 0; } }
  player.sprinting = false; player.bob += dt * 2;
}
const interiorCb = {
  hitPlayer: (dir, speed) => {
    if (player.carHitCd > 0) return; player.carHitCd = 1.5;
    if (player.mode !== 'move') { player.mode = 'move'; }
    hurtPlayer(Math.min(80, 30 + speed * 2.5), player.x - dir * 3, player.z, 0);
    player.vx = dir * speed * 0.8; player.vy = 7; player.kz = (player.z > interiorTrackZ() ? 1 : -1) * 9; player.grounded = false;
    showMsg('HIT BY A TRAIN', 2); sfx.crash();
  },
  rumble: (v) => { if (v > 0.05) G.shake = Math.max(G.shake, v * 0.12); G.rumble = v; },
};
const interiorTrackZ = () => CITIES[0].Rz(6);
let stepAcc = 0;
const parkourCb = {
  noLedges: () => !!pramHeld(),
  hurt: (dmg, rolled) => { hurtPlayer(dmg, player.x, player.z); showMsg(rolled ? 'ROLLED IT' : 'HARD LANDING', 1.2); },
  stamina: () => player.stam,
  useStamina: (n) => { player.stam = Math.max(0, player.stam - n); },
  stepSound: (k) => { stepAcc += k; if (stepAcc > 1) { stepAcc = 0; sfx.climb(); } },
  zipSound: (v) => setZipSound(v),
};
// the safety net: if anyone ever ends up inside a solid wall, put them back where they last stood
function keepOutOfSolids(b, r = 0.35) {
  if (solidAt(b.x, b.y, b.z, 0.02)) { if (b.goodX !== undefined) { b.x = b.goodX; b.z = b.goodZ; } else { const p = randomOpenPoint(b.x, b.z, 0, 8, 12); if (p) { b.x = p.x; b.z = p.z; } } }
  else { b.goodX = b.x; b.goodZ = b.z; }
}
function separateHunters() {
  const hs = G.hunters;
  for (const h of hs) { h.sx = h.x; h.sz = h.z; }
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
    const a = hs[i], b = hs[j], dx = b.x - a.x, dz = b.z - a.z;
    if (dx > 0.9 || dx < -0.9 || dz > 0.9 || dz < -0.9) continue;
    const d = Math.hypot(dx, dz);
    if (d < 0.8 && d > 1e-4) { const k = ((0.8 - d) / d) * 0.5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
  }
  // a crowd pushing never shoves anyone into or through a wall
  for (const h of hs) if (!h.dead && !h.held && !h.climb && !h.ladder && (h.x !== h.sx || h.z !== h.sz)) moveBody(h, h.sx, h.sz, 0.35 * h.T.scale, h.y, 1.8);
}
function updateCamera(dt, t) {
  G.shake = Math.max(0, G.shake - dt * 1.5);
  const sx = (Math.random() - 0.5) * G.shake * 0.3, sy = (Math.random() - 0.5) * G.shake * 0.3;
  if (G.mode === 'menu') {
    const a = t * 0.05;
    camera.position.set(-29 + Math.sin(a) * 9, 5 + Math.sin(a * 0.7) * 1.5, -29 + Math.cos(a) * 9);
    camera.lookAt(29, 55, 29);
    vm.visible = false; return;
  }
  if (player.car) {
    const c = player.car, yaw = c.heading + player.camOff;
    const want = new THREE.Vector3(c.x - Math.sin(yaw) * 7.5, 3.3, c.z - Math.cos(yaw) * 7.5);
    const p = { x: want.x, z: want.z }; resolveCircle(p, 0.3); want.x = p.x; want.z = p.z;
    camera.position.lerp(want, Math.min(1, dt * 8));
    camera.lookAt(c.x + Math.sin(yaw) * 3, 1.3, c.z + Math.cos(yaw) * 3);
    camera.position.x += sx; camera.position.y += sy;
    vm.visible = false; return;
  }
  const bobY = Math.sin(player.bob * 2) * 0.05 * (player.grounded ? 1 : 0) * (player.sprinting ? 1.6 : 1);
  let eye = eyeHeight(player);
  if (!player.alive) { G.deathT = (G.deathT || 0) + dt; eye = Math.max(0.3, 1.65 - G.deathT * 1.5); } else G.deathT = 0;
  camera.position.set(player.x + sx, player.y + eye + bobY + sy, player.z);
  if (player.hide) { const S = player.hide; if (S.eye) camera.position.set(S.eye.x, S.eye.y + sy, S.eye.z); else camera.position.set(S.x + S.stand.ux * (S.lx - 0.25), S.top - 0.12 + sy, S.z + S.stand.uz * (S.lz - 0.25)); }
  // adrenaline: the view widens with speed, tilts on the zipline and dips through vaults and mantles
  const hs = Math.hypot(player.vx, player.vz);
  const wantFov = 72 + clamp((hs - 5.8) * 1.4, 0, 8) + (player.slideT > 0 ? 6 : 0) + (player.mode === 'zip' ? clamp(player.zipV * 0.6, 0, 14) : 0) + (player.mode === 'vault' ? 5 : 0) + G.fovKick;
  G.fovKick = Math.max(0, G.fovKick - dt * 25);
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov = lerp(camera.fov, wantFov, Math.min(1, dt * 6)); camera.updateProjectionMatrix(); }
  G.camRoll = lerp(G.camRoll || 0, player.mode === 'zip' ? 0.07 * Math.sin(G.elapsed * 2) + 0.05 : player.slideT > 0 ? 0.06 : -input.side * 0.012 * (player.sprinting ? 1 : 0.4), Math.min(1, dt * 6));
  const mantleDip = player.mode === 'mantle' ? -0.25 * Math.sin(clamp(player.anim.t / player.anim.dur, 0, 1) * Math.PI) : 0;
  const swingRoll = player.swingKind === 'heavy' && player.swingT < 0.7 ? Math.sin(clamp((player.swingT - 0.3) / 0.35, 0, 1) * Math.PI) * 0.05 : 0;
  camera.rotation.set(player.pitch + player.recoil * 0.03 + mantleDip - player.landDip * 0.08, player.yaw, player.alive ? G.camRoll + swingRoll : Math.min(1.2, G.deathT * 1.4));
  vm.visible = player.alive && player.weapon !== 'laser' && player.weapon !== 'hands';
  const b = player.bob;
  vm.position.set(Math.cos(b) * 0.012, Math.abs(Math.sin(b)) * -0.015 - (player.reloadT > 0 ? 0.25 : 0), player.recoil * 0.06);
  armR.rotation.x = 0.05 + player.recoil * 0.25;
  const sh = Math.sin(player.shoveAnim * Math.PI);
  armL.position.z = -0.42 - sh * 0.25; armR.position.z = -0.42 - sh * 0.2;
  // hands reach up for ladders, ledges and the zipline handle
  const reach = player.mode === 'zip' || player.mode === 'ladder' || player.mode === 'climb' ? 1 : player.mode === 'mantle' ? 0.7 : 0;
  G.vmReach = lerp(G.vmReach || 0, reach, Math.min(1, dt * 10));
  armL.rotation.x = 0.1 + G.vmReach * 0.7; armL.position.y = -0.27 + G.vmReach * 0.6; armL.position.x = -0.08 - G.vmReach * 0.12;
  if (player.mode === 'ladder' || player.mode === 'climb') armL.position.y += Math.sin(player.y * 3) * 0.06;
  G.holster = lerp(G.holster || 0, player.weapon === 'hands' ? 1.6 : player.drawnT > 4 && !player.reloadT ? 1 : 0, Math.min(1, dt * 5));
  vm.position.y -= G.vmReach * 0.12 + player.switchT * 1.1 + G.holster * 0.3;
  vm.rotation.x = G.holster * 0.9;
  // two-handed guns bring the left hand forward under the barrel
  const twoHand = player.weapon === 'shotgun' || player.weapon === 'smg', fr = 1 - G.vmReach;
  armL.rotation.y = twoHand ? -0.5 + 0.38 * fr : -0.5;
  if (twoHand) { armL.position.z = -0.42 - 0.26 * fr - sh * 0.25; armL.position.x += 0.07 * fr; armL.position.y += 0.03 * fr; }
  // crowbar swings: the arm moves a little, the bar does the travelling
  let pose = [0.05 + player.recoil * 0.25, 0.18, 0, 0.2, -0.24];
  if (player.weapon === 'crowbar') {
    pose = [0.25 + player.recoil * 0.2, 0.2, 0, 0.2, -0.25, 0.85, 0, 0.55];
    if (player.swingKind && player.swingT < SWING[player.swingKind].dur) {
      const k = player.swingT / SWING[player.swingKind].dur, b0 = pose;
      const keys = player.swingKind === 'light'
        ? [[0, ...b0], [0.28, 0.5, 0.25, 0, 0.23, -0.2, 1.35, 0, 0.15], [0.48, -0.25, 0.05, 0, 0.12, -0.3, -0.2, 0, 0.75], [1, ...b0]]
        : [[0, ...b0], [0.42, 0.35, -0.3, -0.2, 0.32, -0.17, 1.25, 0, -1.0], [0.55, 0.0, 0.45, 0.25, -0.05, -0.24, 0.25, 0, 1.55], [0.72, -0.1, 0.55, 0.3, -0.12, -0.27, 0.05, 0, 1.9], [1, ...b0]];
      let i = 0; while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
      const A = keys[i], B = keys[i + 1], u = clamp((k - A[0]) / (B[0] - A[0]), 0, 1), e = u * u * (3 - 2 * u);
      pose = [1, 2, 3, 4, 5, 6, 7, 8].map((j) => lerp(A[j], B[j], e));
    }
    crowbarVM.rotation.set(pose[5], pose[6], pose[7]);
  }
  armR.rotation.set(pose[0], pose[1], pose[2]); armR.position.x = pose[3]; armR.position.y = pose[4];
}
// ---------------------------------------------------------------------
// safehouses: get in unseen and lie low
// ---------------------------------------------------------------------
const NAP_LINES = ['YOU SLEPT LIKE A BABY. A HUNTED BABY.', 'FIVE HOURS OF DREAMLESS PANIC. REFRESHING.', 'YOU NAPPED. THE CITY CALMED DOWN A BIT.'];
const sleepEl = $('sleep');
function seenGoingIn() {
  if (G.airTracking) return true;
  return G.hunters.some((h) => !h.dead && h.state === 'chase' && h.hasLOS && Math.hypot(h.x - player.x, h.z - player.z) < 55);
}
function burnSafehouse(S, msg) {
  S.burnedDay = G.day; G.safe = null;
  reportSighting(S.door.x, S.door.z); alertAround(S.door.x, S.door.z, 80, 2); addHeat(8);
  showMsg(msg, 3); sfx.alarm();
}
function updateSafehouse(dt) {
  const S = player.car || !player.alive ? null : safeAt(player.x, player.y, player.z);
  if (S && S !== G.inSafe) {
    if (!S.owned) showMsg(`NOT YOURS. RENT IT AT THE DOOR FOR $${S.price}`, 2.5);
    else if (S.burnedDay === G.day) showMsg('THIS PLACE IS BURNED UNTIL TOMORROW', 2.5);
    else if (seenGoingIn()) burnSafehouse(S, 'THEY SAW YOU GO IN. THIS PLACE IS BURNED');
    else {
      showMsg(`${S.name}. SAFE. LIE LOW.`, 2.5); sfx.pickup();
      for (const h of G.hunters) if (!h.dead && h.state === 'chase' && !h.hasLOS) { h.state = 'search'; h.wt = null; h.alertT = -1; }
    }
  }
  G.inSafe = S;
  G.safe = S && S.owned && S.burnedDay !== G.day ? S : null;
  if (!G.safe) return;
  if (G.hunters.some((h) => !h.dead && h.state === 'chase' && h.hasLOS && Math.hypot(h.x - player.x, h.z - player.z) < 40)) { burnSafehouse(S, 'THEY FOUND YOU. THIS PLACE IS BURNED'); return; }
  G.heat -= dt * 9; G.pingT += dt; // nobody leaks where you are while you're tucked away
  if (player.alive) player.hp = Math.min(100, player.hp + 5 * dt);
}
function rentSafehouse(S) {
  if (player.cash < S.price) { showMsg(`YOU NEED $${S.price - player.cash} MORE FOR ${S.name}`, 2.5); return; }
  player.cash -= S.price; S.owned = true; sfx.cash(); bumpLocal(0.1);
  showBanner(`${S.name}<small>${S.blurb.toUpperCase()}</small>`, 3);
}
function raidStash(S) {
  if (S.stashDay === G.day) { showMsg('EMPTY. THE STASH REFILLS TOMORROW', 2); return; }
  S.stashDay = G.day;
  player.ammo.pistol.res = Math.min(WEAPONS.pistol.maxRes, player.ammo.pistol.res + 24);
  player.cash += 15; player.hp = Math.min(100, player.hp + 30); sfx.cash();
  showMsg('STASH: 24 ROUNDS, $15 AND A SLIGHTLY OLD SANDWICH', 3);
}
function napInSafehouse() {
  const S = G.safe;
  if (!S) { showMsg("YOU CAN'T SLEEP HERE. THEY KNOW ABOUT IT", 2.2); return; }
  if (G.napDay === G.day) { showMsg('YOU ALREADY NAPPED TODAY. TOO WIRED TO SLEEP', 2.2); return; }
  if (G.hunters.some((h) => !h.dead && h.state === 'chase' && Math.hypot(h.x - player.x, h.z - player.z) < 45)) { showMsg("YOU CAN'T SLEEP WITH THEM THIS CLOSE", 2.2); return; }
  G.napDay = G.day; G.sleepT = 2.2; sleepEl.classList.add('show');
  const h0 = G.hour;
  for (let i = 0; i < 2000; i++) { G.elapsed += 0.25; if ((hourAt(G.elapsed) - h0 + 24) % 24 >= 5) break; }
  player.hp = 100; player.stam = 100; player.exhausted = false;
  G.heat -= 70; G.lastSeenT = 99; G.pingT = Math.max(G.pingT, 30);
  // the more famous you are, the likelier someone tips them off while you snore
  if (Math.random() < 0.08 + G.level * 0.08) {
    S.burnedDay = Math.floor(G.elapsed / CFG.dayLength) + 1;
    const n = 3 + G.level;
    for (let k = 0; k < n; k++) {
      const p = randomOpenPoint(S.door.x, S.door.z + 6, 2, 9);
      if (p) G.hunters.push(new Hunter(p.x, p.z, mpick(['civ', 'civ', 'runner', 'brute']), Math.random() < 0.2, 'chase'));
    }
    reportSighting(S.door.x, S.door.z);
    showMsg('YOU WOKE UP TO KNOCKING. LOTS OF KNOCKING.', 3.5); sfx.alarm();
  } else showMsg(mpick(NAP_LINES), 3);
}

// what the manhunt layer is allowed to see and do
function mhCtx(seen = false) {
  const tp = targetPos();
  return {
    day: G.day, days: CFG.days, dayLength: CFG.dayLength, elapsed: G.elapsed, hour: G.hour, level: G.level, super: G.super,
    x: tp.x, z: tp.z, inCar: !!player.car, inSafe: !!G.safe, alive: player.alive, hp: player.hp, seen, unseen: G.unseenT, nearest: G.nearestChaser ?? 1e9,
    say: (m, d = 3) => showMsg(m, d), banner: (h, d = 3.5) => showBanner(h, d), sfx: (n) => sfx[n] && sfx[n](),
    heal: (n) => { player.hp = Math.min(100, player.hp + n); player.stam = 100; },
    giveAmmo: () => { const A = player.ammo; A.pistol.res = Math.min(WEAPONS.pistol.maxRes, A.pistol.res + 36); if (player.owned.has('shotgun')) A.shotgun.res = Math.min(WEAPONS.shotgun.maxRes, A.shotgun.res + 12); if (player.owned.has('smg')) A.smg.res = Math.min(WEAPONS.smg.maxRes, A.smg.res + 60); },
    giveCash: (n) => { player.cash += n; },
    coolOff: (n) => { G.heat = Math.max(heatFloor(), G.heat - n); },
    minHeat: (n) => { if (G.heat < n) G.heat = Math.min(G.heat + 0.6, n); },
    restoreStamina: () => { player.stam = 100; player.exhausted = false; },
    win: () => endGame(true),
    spawnRival,
    despawnRival: (r) => { if (r.h && !r.h.dead) { const h = r.h; h.rival = null; r.h = null; h.remove(); } },
    spawnTrackers: (n) => {
      const ox = G.lastSeenT < 900 ? G.lkp.x : tp.x + mr(-120, 120), oz = G.lastSeenT < 900 ? G.lkp.z : tp.z + mr(-120, 120);
      let made = 0;
      for (let i = 0; i < n * 3 && made < n; i++) {
        const p = randomOpenPoint(ox, oz, 40, 80, 4);
        if (!p || Math.hypot(p.x - tp.x, p.z - tp.z) < 45) continue;
        const h = new Hunter(p.x, p.z, 'runner', G.day >= 10 && Math.random() < 0.4, 'search');
        h.tracker = true; h.huntT = 90; h.sus = 0.6; h.spdMul = 1.12; h.wt = randomOpenPoint(ox, oz, 1, 20);
        G.hunters.push(h); made++;
      }
      if (made) showMsg(`${made} TRACKERS ARE STARTING FROM WHERE YOU WERE LAST SEEN`, 4);
    },
    ambush: (x, z) => {
      for (let i = 0; i < 5; i++) { const p = randomOpenPoint(x, z, 7, 16, 6); if (p) G.hunters.push(new Hunter(p.x, p.z, mpick(['runner', 'civ', 'brute']), Math.random() < 0.25, 'chase')); }
      reportSighting(x, z); addHeat(30); sfx.alarm();
    },
    sweepPulse: () => {
      sendLooking(tp.x, tp.z, 70, 20); reportSighting(tp.x + mr(-30, 30), tp.z + mr(-30, 30));
      if (G.hunters.filter((h) => h.sweep && !h.dead).length < 10) for (let i = 0, made = 0; i < 8 && made < 2; i++) { const p = randomOpenPoint(tp.x, tp.z, 35, 60, 4); if (p && !los(p.x, p.z, tp.x, tp.z)) { made++; const h = new Hunter(p.x, p.z, 'cop', true, 'search'); h.sweep = true; h.huntT = 40; h.wt = randomOpenPoint(tp.x, tp.z, 4, 25); G.hunters.push(h); } }
    },
  };
}

function updateDirector(dt) {
  G.hour = hourAt(G.elapsed);
  { const tp0 = targetPos(), c0 = cityAt(tp0.x, tp0.z, 20);
    const covered = !!G.inSafe || camera.position.y < -1 || (!player.car && !!zoneAt(player.x, player.y, player.z));
    updateWeather(dt, { day: G.day, hour: G.hour, city: c0 ? c0.name : null, covered, say: (m) => showMsg(m, 3.5), banner: (h) => showBanner(h, 4) });
    G.weatherSight = WX.sight; }
  const day = Math.floor(G.elapsed / CFG.dayLength) + 1;
  if (day > G.day) {
    G.day = day;
    if (G.day > CFG.days && !G.super) { endGame(true); return; }
    sfx.day();
    showBanner(manhuntNewDay(mhCtx()), 5);
    tidyStreetProps(player.x, player.z); stealthNewDay();
  }
  const tp = targetPos();
  // locale
  const zn = player.car ? null : zoneAt(player.x, player.y, player.z);
  const loc = zn ? zn.name : localeName(tp.x, tp.z);
  if (loc !== G.locale) {
    const first = !G.locale;
    G.locale = loc;
    const cityNow = localeName(tp.x, tp.z);
    if (!first && CITIES.some((c) => c.name === cityNow) && G.lastCity !== cityNow) showBanner(`<small>WELCOME TO</small>${cityNow}`, 3);
    if (!first && zn && G.lastZone !== zn.name) showMsg(zn.name, 2);
    G.lastCity = cityNow;
    G.lastZone = zn ? zn.name : null;
  }
  // profile
  G.lastSeenT += dt;
  const seenByHunters = G.hunters.some((h) => !h.dead && h.state === 'chase' && h.hasLOS && !isFleeingRival(h));
  const anyChasing = G.hunters.some((h) => !h.dead && h.state === 'chase' && !isFleeingRival(h));
  G.heat += dt * ((G.airTracking && G.heat < LEVELS[3]) ? 0.8 : 0) + dt * ( (seenByHunters ? 0.8 * (1 - 0.5 * player.disg) : 0));
  if (player.disg > 0) wearDisguise(dt * 0.0035);
  G.unseenT = seenByHunters || G.airTracking ? 0 : G.unseenT + dt;
  if (G.shook && G.unseenT > 14 && !anyChasing && G.level >= 2) {
    G.shook = false; G.heat = Math.max(heatFloor(), LEVELS[G.level - 1] + 5);
    showMsg("YOU SHOOK THEM OFF. THEY DON'T KNOW WHERE YOU WENT", 3.5); sfx.whoosh();
  }
  if (G.airTracking || seenByHunters) G.shook = G.shook && !seenByHunters;
  if (G.unseenT > 6) G.heat -= dt * (anyChasing ? 2.5 : 4) * (G.conspic < 0.3 ? 1.4 : 1); // lying low cools you off
  { const here = localKey(tp.x, tp.z); for (const k in G.localSus) G.localSus[k] = Math.max(0, G.localSus[k] - dt * (k === here ? 0.003 : 0.012)); }
  G.heat = clamp(G.heat, heatFloor(), 330);
  let lvl = 0; for (let i = 0; i < LEVELS.length; i++) if (G.heat >= LEVELS[i]) lvl = i;
  if (lvl > G.level) { showMsg(`PROFILE: ${LEVEL_NAMES[lvl]}`, 2.5); sfx.alarm(); }
  G.level = lvl; G.peak = Math.max(G.peak || 0, lvl);
  if (!G.super) { updateManhunt(dt, mhCtx(seenByHunters)); if (G.mode !== 'playing') return; }
  G.spottedMsgT -= dt;
  // air tracking alerts ground units
  if (G.airTracking) { G.airAlertT -= dt; if (G.airAlertT <= 0) { G.airAlertT = 3; sendLooking(tp.x, tp.z, 60, 15); } }
  if (!G.super) manageAircraft(dt);
  // population
  G.spawnT -= dt;
  const alive = G.hunters.filter((h) => !h.dead);
  if (G.spawnT <= 0) {
    G.spawnT = 0.6;
    if (alive.length < targetHunters()) spawnHunter();
    for (const h of alive) if (h.state !== 'chase' && !h.contract && !h.guard && !h.rival && Math.hypot(h.x - tp.x, h.z - tp.z) > 175) { h.remove(); if (alive.length <= targetHunters()) spawnHunter(); break; }
    for (const h of alive) if (h.state === 'chase' && !h.contract && !h.guard && !h.rival && Math.hypot(h.x - tp.x, h.z - tp.z) > 260) { h.remove(); break; }
    // not everyone joins in: past the cap, the furthest ones who can't see you go back to searching
    const ch = alive.filter((h) => h.state === 'chase' && !h.contract && !h.rival);
    if (ch.length > maxChasers()) {
      ch.sort((a, b) => Math.hypot(b.x - tp.x, b.z - tp.z) - Math.hypot(a.x - tp.x, a.z - tp.z));
      for (let i = 0; i < ch.length - maxChasers(); i++) if (!ch[i].hasLOS || Math.hypot(ch[i].x - tp.x, ch[i].z - tp.z) > 30) { ch[i].state = 'search'; ch[i].wt = null; ch[i].alertT = -1; }
    }
  }
  G.hunters = G.hunters.filter((h) => !h.dead);
  // location leak
  G.pingT -= dt;
  if (G.pingT <= 0) {
    G.pingT = Math.max(28, 70 - G.day - G.level * 6);
    // only once you're properly wanted does someone post a rough idea of where you are
    if (G.level >= 2 && !G.safe && !G.super) {
      G.lkp.x = tp.x + mr(-25, 25); G.lkp.z = tp.z + mr(-25, 25);
      sendLooking(G.lkp.x, G.lkp.z, 80, 25);
      showMsg('SOMEONE POSTED ROUGHLY WHERE YOU ARE', 3); sfx.alarm();
    }
  }
  // hunter drivers
  G.hunterCarT -= dt * (G.airTracking ? 2 : 1);
  if (G.hunterCarT <= 0) {
    G.hunterCarT = Math.max(8, 30 - G.day - G.level * 2);
    const have = G.cars.filter((c) => c.driver === 'hunter').length;
    if ((G.day >= 2 || G.level >= 2) && have < Math.min(G.day - 1 + G.level, 6)) {
      const cand = G.cars.filter((c) => c.driver === 'traffic' && !c.far && !c.aw && !c.cb && !c.dl && !['coach', 'icecream', 'binlorry', 'bus'].includes(c.kind) && // (never the away coach, a county bus, the ice cream van or a working lorry: they have jobs to do)
         Math.hypot(c.x - tp.x, c.z - tp.z) > 30 && Math.hypot(c.x - tp.x, c.z - tp.z) < 130);
      if (cand.length) { mpick(cand).driver = 'hunter'; showMsg('A DRIVER IS COMING FOR YOU', 2.5); sfx.horn(); }
    }
  }
  for (const c of G.cars) if (c.wrecked && c !== player.car && Math.hypot(c.x - player.x, c.z - player.z) > 160) { const l = mpick(lanes); c.placeOnLane(l, mr(l.a0, l.a1)); }
  // navigation
  if (navRecenter(tp.x, tp.z)) G.flowT = 0;
  G.flowT -= dt;
  if (G.flowT <= 0) { G.flowT = 0.35; computeFlow(tp.x, tp.z); }
  // heartbeat + aircraft hum
  let nearest = 1e9;
  for (const h of G.hunters) if (h.state === 'chase' && !isFleeingRival(h)) nearest = Math.min(nearest, Math.hypot(h.x - player.x, h.z - player.z));
  G.nearestChaser = nearest;
  G.heartT -= dt;
  if (nearest < 22 && G.heartT <= 0) { sfx.heart(0.25 * (1 - nearest / 22) + 0.05); G.heartT = 0.35 + (nearest / 22) * 0.6; }
  let hd = 1e9, dd = 1e9;
  for (const a of G.helis) if (!a.dead) hd = Math.min(hd, Math.hypot(a.x - camera.position.x, a.y - camera.position.y, a.z - camera.position.z));
  for (const a of G.drones) if (!a.dead) dd = Math.min(dd, Math.hypot(a.x - camera.position.x, a.y - camera.position.y, a.z - camera.position.z));
  setAircraftVolume(0.9 * clamp(1 - hd / 220, 0, 1), 0.05 * clamp(1 - dd / 40, 0, 1));
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05); const t = performance.now() / 1000;
  if (G.hitstopT > 0) { G.hitstopT -= dt; dt *= 0.18; } // a beat of slow-mo on a big hit
  simulate(dt, t);
  updateLighting(t);
  updateCamera(dt, t);
  PFX.frameMs = lerp(PFX.frameMs, dt * 1000, 0.05);
  // adrenaline: how fast you're going and how close they are drive the screen effects
  const playing = G.mode === 'playing';
  const hs = player.car ? Math.abs(player.car.speed) / 3 : Math.hypot(player.vx, player.vz);
  const spd = playing ? clamp((hs - 5.5) / 5, 0, 1) * 0.7 + (player.slideT > 0 ? 0.35 : 0) + (player.mode === 'zip' ? clamp(player.zipV / 18, 0, 0.8) : 0) : 0;
  G.pfxSpeed = lerp(G.pfxSpeed || 0, clamp(spd, 0, 1), Math.min(1, dt * 5));
  const near = G.nearestChaser ?? 1e9;
  const danger = playing && !G.super ? clamp(1 - near / 25, 0, 1) * 0.7 + clamp((45 - player.hp) / 45, 0, 1) * 0.5 + G.hurtFlash * 0.4 : 0;
  G.pfxDanger = lerp(G.pfxDanger || 0, clamp(danger, 0, 1), Math.min(1, dt * 3));
  const zn = player.car ? null : zoneAt(player.x, player.y, player.z);
  const indoor = playing && !player.car && (!!zn || !!G.inSafe || camera.position.y < -1);
  if (player.grounded) G.floorY = player.y;
  cullChunks(camera.position.x, camera.position.z);
  renderFrame({ drawVM: vm.visible && G.mode !== 'menu', indoor, floorY: G.floorY ?? 0, speed: G.pfxSpeed, danger: G.pfxDanger, kick: clamp(G.fovKick / 8, 0, 1) });
}
// Channel 9: what the billboards and TVs are saying about you
function newsState() {
  const seen = G.lastSeenT < 900 ? localeName(G.lkp.x, G.lkp.z) : 'NOBODY KNOWS';
  const dark = !!(WX.blackout && WX.blackout.city === WX.here);
  const bits = [];
  if (G.level >= 1 && !G.super) bits.push(`BOUNTY TARGET LAST SEEN NEAR ${seen}`, `PROFILE: ${LEVEL_NAMES[G.level]}`);
  if (G.level >= 3 && !G.super) bits.push('AIR UNITS SEARCHING', 'CALL CHANNEL 9 WITH ANY SIGHTINGS');
  if (G.super) { bits.push(...heroNews()); for (const V of villains) if (V.state === 'lair') bits.push(`${V.def.name} SPOTTED ${V.def.lair} IN ${localeName(V.lair.x, V.lair.z)}`); }
  if (!G.super) bits.push(...manhuntNews(), `${runnersLeft()} OF ${MH.runners.length + 1} RUNNERS STILL FREE`);
  if (manhuntSweepCity()) bits.push(`POLICE SWEEP UNDER WAY IN ${manhuntSweepCity()}`);
  if (WX.festival) bits.push(`${FESTIVALS[WX.festival.city]} IN ${WX.festival.city} TODAY`);
  if (WX.blackout) bits.push(`POWER CUT IN ${WX.blackout.city}`);
  bits.push(`WEATHER: ${WX_NAMES[WX.kind]}`);
  return {
    level: G.level, super: G.super, look: G.newsLook || {}, lastSeen: seen, kills: G.kills, day: Math.min(G.day, CFG.days),
    clock: hud.clock.textContent.slice(0, 5), weather: WX_NAMES[WX.kind], city: G.locale || 'PORT HALDEN',
    festival: WX.festival ? FESTIVALS[WX.festival.city] : null, festivalCity: WX.festival ? WX.festival.city : '', dark, crawl: bits.join('   ·   '),
  };
}
function simulate(dt, t) {
  if (G.mode === 'playing') {
    G.elapsed += dt; G.shotT = (G.shotT ?? 99) + dt;
    G.airTracking = 0;
    updatePlayer(dt);
    for (const h of G.hunters) if (!h.dead) h.update(dt);
    separateHunters();
    updateKids(dt, TDK); updateTownDay(dt, TDK); updateMatchDay(dt, TDK); updateAwayDays(dt, TDK); updateDeliveries(dt, TDK); updateIceCream(dt, TDK); updateCinema(dt, TDK); updateLaunderettes(dt, TDK); for (const V of XV) V.update(dt, TDK);
    G.keeperT = (G.keeperT || 0) - dt; if (G.keeperT <= 0) { G.keeperT = 1; showShopkeepers((kind, city) => shopOpenAt(kind, city, G.day, G.hour)); }
    updateCityLife(dt, LIFE); updateKnockFX(dt);
    if (G.super) { updateHero(dt, HC); updateVillains(dt, HC); }
    for (const c of G.cars) c.update(dt);
    carInteractions();
    updateBikes(dt, BK); updateStreetProps(dt, BK); updateStealth(dt, SK); updateGigs(dt, GJ); updateMarkets(dt, MK);
    for (const a of G.helis) if (!a.dead) a.update(dt);
    for (const a of G.drones) if (!a.dead) a.update(dt);
    G.helis = G.helis.filter((a) => !a.dead); G.drones = G.drones.filter((a) => !a.dead);
    for (const p of G.pickups) p.update(dt, t);
    updateSafehouse(dt);
    updateGetUps(dt); updateDrops(dt, t); updateLaser(dt); updateBubbles(dt); updateContract(dt); updateRival(dt); updateAllies(dt); updateShopLight();
    updateInteriors(dt, player, G.hunters, interiorCb);
    updateDirector(dt);
    updateNews(dt, newsState());
    if (!player.alive) { G.overT -= dt; if (G.overT <= 0 && G.mode === 'playing') endGame(false); }
    updateHUD(dt);
    if (G.sleepT > 0) { G.sleepT -= dt; if (G.sleepT <= 0) sleepEl.classList.remove('show'); }
  } else if (G.mode === 'menu') {
    G.hour = 18.2;
    for (const c of G.cars) c.update(dt);
  }
  for (let i = ragdolls.length - 1; i >= 0; i--) if (!ragdolls[i].update(G.mode === 'paused' || G.mode === 'shop' ? 0 : dt)) { ragdolls[i].dispose(); ragdolls.splice(i, 1); }
  if (G.mode !== 'paused' && G.mode !== 'shop') { updatePuffs(dt); updateTracers(dt); updateAmbientSmoke(dt); }
  animateShopkeepers(t);
}

player.x = 0; player.z = 0;
spawnShopkeepers(scene);
buildStreetProps();
buildStealth();
buildTownDay();
// the Galleria's novelty shops sell disguises too, each its own speciality
{
  const MALL_CATS = { 'SPECS APPEAL': ['eyes'], 'BEARD BARN': ['face'], 'BIG HAT BARN': ['hat'], 'WIGS 4 U': ['wig'], 'SUIT YOURSELF': ['body', 'hat'] };
  for (const m of mallShops) if (MALL_CATS[m.name]) shopSpots.push({ x: m.x, z: m.z, y: m.y, r: 1.8, kind: 'costume', name: m.name, city: 'PORT HALDEN', cats: MALL_CATS[m.name], face: 'mall' });
}
spawnTraffic(84);
$('loading').classList.add('hidden');
frame();

// debug / test hook
window.__hunted = { XV, pubTV, pubGames, dockWork, quay, bowling, baths, buses, railway, DL_STATE, dlRearNear, dlHopOn, deliveriesDebug: () => deliveriesDebug(TDK), dlInternals, AW_STATE, awayEnd, inAwayEnd, awayDaysDebug: () => awayDaysDebug(TDK), awInternals, CN_CLEAR, cinema, cnRoofs, CN_STATE, FILMS, showNow, filmOn, showTime, hasTicket, inCinema, screenAt, cnUseTarget, cnUse, cnConspic, cnSit, cnStand, cinemaDebug, cnInternals, LN_STATE, launderettes, launderetteAt, lnUseTarget, lnUse, lnConspic, launderetteDebug, lnInternals, mdRoofs, ground, church, clubhouse, carBoot, MD_STATE, MD_CLEAR, matchNow, opponentOn, inGround, inChurch, mdUseTarget, mdUse, mdConspic, matchDayDebug, mdInternals, IC_STATE, icHatch, icHatchNear, icMenu, icDistracted, iceCreamDebug: () => iceCreamDebug(TDK), shopHours, shopOpenAt, shutLine, conspicNow: () => conspicuous(), KD_STATE, kids, prams, playgrounds, schoolInfo, maybeFamily, makeKid, givePram, pramHeld, grabPram, dropPram, pramNear, kidNear, greetKid, kidsDebug, TDK, TD_STATE, TD_EVENTS, weekdayOf, dayNameOf, eventsOn, eventOn, folkMix, folkWants, crowdMul, townUseTarget, townUse, diaryHTML, townDayDebug, funRun, fete, todayLine, lifeGo, lifeLap, pauseGame, resumeGame, hideSpots, hunterPeekArrive, MK, MK_STATE, markets, marketStalls, stallNear, stallMenu, marketOpen, marketAt, marketsDebug, marketInternals, hireVendor, vendorOf, cityLifeDebug, randomOpenPoint, GJ, GJ_STATE, gigBoards, gigMenu, gigBoardNear, gigsDebug, gigInternals, lorryRearNear, hopOnLorry, hopOffLorry, SK, SK_STATE, stealthDebug, hideSpotNear, enterHide, leaveHide, junk, junkNear, pickJunk, throwJunk, noiseAt, cams, rayCams, breakCam, flocks, scareFlock, pickMark, pickPocket, raycastWorld, bikes, riders, spawnCyclist, playerBikeAction, bikeDebug, BK, streetProps: streetPropObjs, geysers, kickProp, hitHydrant, rayProps, propInFront, tidyStreetProps, streetPropDebug, fireRay, playerShove, carInteractions, Car, henchmen, warehouses, zoneAt, headroom, knockDebug, setHitKind, launchHunter, pointBlocked, losSolid, stepDt: (secs, dt, each) => { for (let i = 0; i < secs / dt; i++) { simulate(dt, performance.now() / 1000); if (each) each(); } }, solidAt, unbucketedColliders, lanes, HERO, villains, villainHit, heroPoseCmd, HC, lifeSpots, cityLifeDebug, lifeStart, LIFE, roofs, stackTop, walkIns, blockedAt, navRecenter, underRoof, shopRooms, CFG, MH, mhCtx, hurtPlayer, killPlayer, heldSus, PFX, newsTex, WX, forceWeather, safehouses, localSus, bumpLocal, get disg() { return player.disg; }, atmSpots, atmCtx, get contract() { return G.contract; }, Hunter, Ally, shopSpots, selectWeapon, crowbarSwing, shopCtx, CATALOG, tryOpenShop, leaveShop, WEAPONS, floorAt, groundY, links, input, useAction, ladders, ziplines, step: (secs) => { for (let i = 0; i < secs * 30; i++) simulate(1 / 30, performance.now() / 1000); }, G, player, camera, scene, renderer, hourAt, startGame, spawnHunter, enterCar, exitCar, playerShoot, colliders, addHeat, get ragdolls() { return ragdolls.length; } };
