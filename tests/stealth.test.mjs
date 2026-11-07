// Stealth toolkit: hiding in dumpsters, throwing bottles to lure people away, CCTV cameras, pigeons that give
// you away, and pickpocketing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => {
  g = await openGame(); await g.run((H) => H.startGame(false));
  await g.run((H) => {
    H.fresh = (H) => {
      if (H.player.hide) H.leaveHide(H.SK);
      for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
      H.player.vx = H.player.vz = 0; H.player.hp = 100; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move';
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0;
      H.SK_STATE.junk.length = 0; H.SK_STATE.smellT = 0;
    };
    // a person standing about, facing a given way, not going anywhere for a while
    H.person = (H, x, z, o = {}) => { const h = new H.Hunter(x, z, 'civ', false); h.waitT = 30; h.face = o.face ?? 0; Object.assign(h, o); H.G.hunters.push(h); return h; };
  });
});
after(async () => { await g?.close(); });

test('the towns have bins to hide in, rubbish to throw, cameras and pigeons', async () => {
  const s = await g.run((H) => H.stealthDebug());
  assert.ok(s.hideSpots >= 20, `only ${s.hideSpots} dumpsters you can climb into`);
  assert.ok(s.junk >= 100, `only ${s.junk} bottles and cans lying about`);
  assert.ok(s.cams >= 30, `only ${s.cams} CCTV cameras`);
  assert.ok(s.flocks >= 20 && s.birds >= 100, `only ${s.flocks} flocks / ${s.birds} pigeons`);
});

test('climb into a bin unseen and the chase loses you; climb out again with E', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    // the first dumpster with an open side
    let spot = null;
    for (let x = -400; x < 900 && !spot; x += 3) { const T = H.hideSpotNear(x, 0.15, 0, 999); if (T && T.kind === 'dumpster') spot = T; }
    H.player.x = spot.stand.x; H.player.z = spot.stand.z; H.player.y = 0.15;
    const why = { junk: !!H.junkNear(H.player.x, H.player.y, H.player.z), pram: !!H.pramNear(H.player.x, H.player.z), kid: !!H.kidNear(H.player.x, H.player.z), town: !!H.townUseTarget(H.TDK), md: !!H.mdUseTarget(H.TDK), ic: !!H.icHatchNear(H.TDK), gl: !!H.lorryRearNear(H.GJ), cars: H.G.cars.filter((c) => Math.hypot(c.x - H.player.x, c.z - H.player.z) < 4).map((c) => c.kind), mode: H.player.mode, y: H.player.y };
    H.useAction();
    const inBin = !!H.player.hide && H.player.hide === spot;
    Object.assign(why, { hide: H.player.hide?.kind, car: H.player.car?.kind, ride: !!H.DL_STATE.ride, spot: [spot.x, spot.z] });
    // someone was chasing, but they're round the corner and didn't see you get in
    const a = Math.random() * 6.28, h = H.person(H, spot.stand.x + Math.sin(a) * 25, spot.stand.z + Math.cos(a) * 25, { waitT: 0 });
    h.state = 'chase'; h.lastSeen = 0; h.noticeT = 0;
    H.step(4);
    const r = { why, inBin, still: !!H.player.hide, conspic: H.G.conspic, state: h.state, hp: H.player.hp, airHide: H.underRoof() };
    H.useAction();
    r.out = !H.player.hide; r.dist = Math.hypot(H.player.x - spot.stand.x, H.player.z - spot.stand.z);
    return r;
  });
  assert.ok(s.inBin, `E at a dumpster should put you in it ${JSON.stringify(s.why)}`);
  assert.ok(s.still, 'you should still be hidden');
  assert.equal(s.conspic, 0, 'hidden in a bin you don\'t stand out at all');
  assert.equal(s.state, 'search', 'a chaser who never saw you go in should lose you');
  assert.equal(s.hp, 100, 'nobody hurt you in the bin');
  assert.ok(s.airHide, 'aircraft can\'t see into a bin either');
  assert.ok(s.out && s.dist < 0.5, 'E climbs back out where you got in');
});

test('anyone who watched you climb in comes over and hauls you out', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    let spot = null;
    for (let x = 900; x > -400 && !spot; x -= 3) { const T = H.hideSpotNear(x, 0.15, 0, 999); if (T && T.kind === 'dumpster') spot = T; }
    H.player.x = spot.stand.x; H.player.z = spot.stand.z; H.player.y = 0.15;
    // somewhere a few metres off with a clear view of the bin
    let hp = null;
    for (let a = 0; a < 6.28 && !hp; a += 0.3) for (const r of [4, 5, 3]) { const x = spot.stand.x + Math.sin(a) * r, z = spot.stand.z + Math.cos(a) * r; if (!H.blockedAt(x, z) && !H.solidAt(x, 0.6, z, 0) && H.losSolid(x, 1.6, z, spot.stand.x, 1.6, spot.stand.z)) { hp = { x, z }; break; } }
    const h = H.person(H, hp.x, hp.z, { waitT: 0 });
    h.state = 'chase'; h.hasLOS = true; h.lastSeen = 0; h.noticeT = 0;
    H.enterHide(spot, H.SK);
    const marked = h.checkSpot === spot;
    let found = false;
    for (let i = 0; i < 12 * 30 && !found; i++) { H.step(1 / 30); found = !H.player.hide; }
    return { marked, found, state: h.state };
  });
  assert.ok(s.marked, 'the witness should know which bin you are in');
  assert.ok(s.found, 'they should haul you out');
  assert.equal(s.state, 'chase');
});

test('a thrown bottle smashes and sends people who lost you off to look there', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    // an open stretch of street to throw down
    H.player.x = 0; H.player.z = 0; H.player.y = 0.15;
    let dir = null;
    for (let a = 0; a < 6.28 && !dir; a += 0.2) { let ok = true; for (let r = 1; r < 18; r += 1) if (H.blockedAt(Math.sin(a) * r, Math.cos(a) * r) || H.solidAt(Math.sin(a) * r, 1.0, Math.cos(a) * r, 0)) { ok = false; break; } if (ok) dir = a; }
    H.SK_STATE.junk.push('bottle');
    H.camera.position.set(0, 1.75, 0); H.camera.rotation.set(0.05, dir + Math.PI, 0, 'YXZ'); H.camera.updateMatrixWorld();
    const tx = Math.sin(dir) * 12, tz = Math.cos(dir) * 12;
    // two people over by where it'll land, and one chaser who has lost sight of you
    const near = H.person(H, tx + 4, tz + 2, { waitT: 0, face: 0 });
    const thrown = H.throwJunk(H.SK);
    for (let i = 0; i < 90 && H.stealthDebug().flying; i++) H.step(1 / 30);
    H.step(0.1);
    const d = H.stealthDebug();
    // a chaser who has lost sight of you, near another smash
    const chaser = H.person(H, tx - 6, tz, { waitT: 0 }); chaser.state = 'chase'; chaser.lastSeen = 3; chaser.hasLOS = false;
    const watcher = H.person(H, tx + 6, tz, { waitT: 0 }); watcher.state = 'chase'; watcher.lastSeen = 0; watcher.hasLOS = true;
    H.noiseAt(tx, tz, 24, H.SK);
    const landAt = (h) => (h.wt ? Math.hypot(h.wt.x - tx, h.wt.z - tz) : 999);
    return { thrown, flying: d.flying, pocket: d.pocket, nearHunt: near.huntT > 0, nearWt: landAt(near), chaser: chaser.state, chaserWt: landAt(chaser), watcher: watcher.state, lkp: Math.hypot(H.G.lkp.x - tx, H.G.lkp.z - tz) };
  });
  assert.ok(s.thrown, 'T should throw the bottle');
  assert.equal(s.flying, 0, 'it should have landed');
  assert.equal(s.pocket, 0);
  assert.ok(s.nearHunt && s.nearWt < 8, `the person nearby should go and look (${s.nearWt.toFixed(1)} m off)`);
  assert.equal(s.chaser, 'search', 'a chaser who lost sight of you goes after the noise');
  assert.ok(s.chaserWt < 8, 'and heads to where it smashed');
  assert.equal(s.watcher, 'chase', 'someone still looking right at you isn\'t fooled');
  assert.ok(s.lkp < 8, 'the search moves over there');
});

test('pick up a bottle off the street with E', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const J = H.junk.find((j) => !j.taken && j.y < 0.5);
    H.player.x = J.x + 0.5; H.player.z = J.z; H.player.y = 0.15;
    const near = H.junkNear(H.player.x, H.player.y, H.player.z) === J;
    H.pickJunk(J, H.SK);
    return { near, taken: J.taken, pocket: H.SK_STATE.junk.length };
  });
  assert.ok(s.near && s.taken && s.pocket === 1);
});

test('a CCTV camera that watches a known face reports where they are; shoot it and it breaks', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    H.G.heat = 70; H.G.level = 2;
    // a camera with clear pavement in front of it
    let C = null, px = 0, pz = 0;
    for (const c of H.cams) {
      for (const r of [7, 9, 11]) {
        const x = c.x + Math.sin(c.yaw0) * r, z = c.z + Math.cos(c.yaw0) * r;
        if (!H.blockedAt(x, z) && !H.solidAt(x, 1, z, 0) && H.losSolid(c.x, c.y - 0.2, c.z, x, 1.7, z)) { C = c; px = x; pz = z; break; }
      }
      if (C) break;
    }
    C.sweep = 0; C.cool = 0; C.seeT = 0; C.broken = false;
    H.player.x = px; H.player.z = pz; H.player.y = 0.15;
    const heat0 = H.G.heat, alarms0 = H.SK_STATE.camAlarms || 0;
    H.step(4);
    const r = { alarmed: (H.SK_STATE.camAlarms || 0) > alarms0, heat: H.G.heat - heat0, lkp: Math.hypot(H.G.lkp.x - px, H.G.lkp.z - pz) };
    // shoot it
    const o = { x: px, y: 1.6, z: pz }, dx = C.x - px, dy = C.y - 1.6, dz = C.z - pz, l = Math.hypot(dx, dy, dz);
    const hit = H.rayCams(o, { x: dx / l, y: dy / l, z: dz / l }, 100, H.SK);
    r.broken = C.broken && hit === C;
    // a broken camera sees nothing
    C.cool = 0; const a1 = H.SK_STATE.camAlarms; H.step(3); r.quiet = H.SK_STATE.camAlarms === a1;
    H.G.level = 0; H.G.heat = 0;
    return r;
  });
  assert.ok(s.alarmed, 'the camera should clock you');
  assert.ok(s.heat > 0, 'and it adds to your profile');
  assert.ok(s.lkp < 4, 'and tells them where you are');
  assert.ok(s.broken, 'a shot should break it');
  assert.ok(s.quiet, 'a broken camera reports nothing');
});

test('running through pigeons sends them flapping, and people hunting nearby come to look', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.level = 1; H.G.heat = 25;
    const F = H.flocks.find((f) => f.state === 'ground');
    let hp = { x: F.x + 10, z: F.z };
    for (let a = 0; a < 6.28; a += 0.4) { const x = F.x + Math.sin(a) * 10, z = F.z + Math.cos(a) * 10; if (!H.blockedAt(x, z) && !H.solidAt(x, 0.6, z, 0)) { hp = { x, z }; break; } }
    const h = H.person(H, hp.x, hp.z, { waitT: 0 }); h.huntT = 5; h.sus = 0;
    H.player.x = F.x + 1; H.player.z = F.z; H.player.y = 0.15;
    H.step(0.2);
    const r = { fly: F.state === 'fly', sus: h.sus, wt: h.wt ? Math.hypot(h.wt.x - F.x, h.wt.z - F.z) : 999 };
    H.player.x += 60; H.step(10);
    r.landed = F.state === 'ground';
    H.G.level = 0; H.G.heat = 0;
    return r;
  });
  assert.ok(s.fly, 'the flock should take off');
  assert.ok(s.sus > 0.2 && s.wt < 6, 'someone hunting nearby looks over');
  assert.ok(s.landed, 'and they land again later');
});

test('crouch behind someone and lift their wallet; get caught and they shout thief', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const p = { x: 3, z: 3 };
    const mark = H.person(H, p.x, p.z, { face: 0 }); // facing +z
    H.player.x = p.x; H.player.z = p.z - 1; H.player.y = 0.15; H.input.crouch = true; H.player.crouch = 1;
    const seen = H.pickMark(H.SK) === mark;
    const cash0 = H.player.cash, R = Math.random; Math.random = () => 0.01;
    H.useAction(); Math.random = R;
    const ok = H.player.cash > cash0 && mark.picked;
    const again = H.pickMark(H.SK);
    // a second mark, and this time it goes wrong
    const m2 = H.person(H, p.x + 6, p.z, { face: 0 });
    H.player.x = p.x + 6; H.player.z = p.z - 1;
    Math.random = () => 0.99; const ok2 = H.pickPocket(m2, H.SK); Math.random = R;
    H.step(0.6);
    // in front of someone doesn't work
    const m3 = H.person(H, p.x - 6, p.z, { face: Math.PI });
    H.player.x = p.x - 6; H.player.z = p.z - 1;
    const front = H.pickMark(H.SK);
    H.input.crouch = false;
    return { seen, ok, again: !!again, ok2, state: m2.state, front: !!front };
  });
  assert.ok(s.seen, 'crouched behind them, they should be a mark');
  assert.ok(s.ok, 'a clean lift adds cash');
  assert.equal(s.again, false, 'you can\'t pick the same pocket twice');
  assert.equal(s.ok2, false);
  assert.equal(s.state, 'chase', 'a botched lift turns them on you');
  assert.equal(s.front, false, 'you have to be behind them');
});
