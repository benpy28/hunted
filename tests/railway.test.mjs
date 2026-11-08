// County Rail: the line along the top of the map, PORT HALDEN CENTRAL, WHEATLEY HALT and ASHFORD stations,
// the passenger train (boarding, riding, getting off, the terminus), tickets and barriers, the inspector.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => {
  g = await openGame(); await g.run((H) => H.startGame(false));
  await g.run((H) => {
    H.fresh = (H) => {
      if (H.G.mode !== 'playing') H.G.mode = 'playing';
      for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
      if (H.railway.RW_STATE.ride) H.railway.rwGetOff(H.TDK);
      H.player.vx = H.player.vz = H.player.vy = 0; H.player.hp = 90; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move'; H.player.hide = null;
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false; H.input.fwd = 0; H.input.side = 0;
      H.player.cash = 100; H.player.outfit = {}; H.player.disg = 0; H.G.day = 1; H.railway.RW_STATE.ticket = null; H.railway.RW_STATE.delayP = 0; if (H.railway.RW_STATE.fride) H.railway.rwJumpFreight(H.TDK, true);
    };
    H.goTo = (H, x, z, y) => { H.player.x = x; H.player.z = z; H.player.y = y ?? H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
    // bring the passenger train into a station, heading `dir`, doors open
    H.trainAt = (H, id, dir) => { const R = H.railway, T = R.rwPax, S = R.RW_STATIONS.find((q) => q.id === id); T.dir = dir; T.x = S.x - dir * 30; T.v = 6; T.state = 'run'; T.served = null; H.stepAt(H, 12, 10, () => T.state === 'dwell'); return T; };
  });
});
after(async () => { await g?.close(); });

test('the railway: three stations built, gates at the staffed ones, trains running and stopping', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const R = H.railway;
    H.goTo(H, 0, -250, 0); H.stepAt(H, 1, 10);
    const T = H.trainAt(H, 'ph', 1);
    return { dbg: R.debug(), state: T.state, at: T.stopAt && T.stopAt.id, doors: T.open, x: T.x, onTrack: H.colliders.filter((c) => c.h > 0.5 && c.z0 < -268.5 && c.z1 > -271.5 && c.x1 > -150 && c.x0 < 890).length };
  });
  assert.deepEqual(s.dbg.stations.map((q) => q.id + ':' + q.gates), ['ph:4', 'wh:0', 'ash:4']);
  assert.ok(s.dbg.stations.every((q) => q.built));
  assert.equal(s.state, 'dwell'); assert.equal(s.at, 'ph'); assert.ok(s.doors, 'doors open');
  assert.ok(Math.abs(s.x) < 1, `stops at the platform (${s.x})`);
  assert.equal(s.onTrack, 0, 'nothing solid on the line');
});

test('tickets and barriers: no ticket, the gate stays shut; buy one and it opens; vaulting gets you shouted at', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const R = H.railway, K = H.TDK, S = R.RW_STATIONS[0], Gt = S.gates[1];
    H.goTo(H, Gt.x, -250.8, 0); H.stepAt(H, 0.5, 10);
    const t0 = H.XV.find((V) => V.name === 'railway').useTarget(K);
    H.useAction(); H.stepAt(H, 0.2, 10);
    const shut = Gt.c.h > 1;
    const m = R.rwTicketMenu(K); const msg = m.buy(m.items()[0]);
    H.useAction(); H.stepAt(H, 0.2, 10);
    const open = Gt.c.h === 0;
    // walk through
    H.input.fwd = 0; H.goTo(H, Gt.x, -253.5, 0); H.stepAt(H, 0.5, 10);
    // now vault back out and in again, past the man in orange
    const before = R.RW_STATE.warned;
    H.goTo(H, S.x + 6.4, -250.5, 0); H.stepAt(H, 0.2, 10); H.goTo(H, S.x + 6.4, -253.5, 0); H.stepAt(H, 0.2, 10);
    return { t0: t0 && t0.kind, shut, msg, open, cash: H.player.cash, warned: R.RW_STATE.warned - before, vaults: R.RW_STATE.vaults };
  });
  assert.equal(s.t0, 'gate'); assert.ok(s.shut, 'shut without a ticket'); assert.match(s.msg, /SINGLE/); assert.ok(s.open, 'opens with one');
  assert.equal(s.cash, 96);
  assert.equal(s.warned, 1, 'the staff saw the vault'); assert.ok(s.vaults >= 1);
});

test('riding the train: board, ride to WHEATLEY HALT, get off; the train goes on and terminates at ASHFORD', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const R = H.railway, K = H.TDK;
    R.RW_STATE.ticket = { day: 1, kind: 'return', used: false };
    const T = H.trainAt(H, 'ph', 1);
    const D = R.rwDoorSpots(T)[2]; H.goTo(H, D.x, D.z, 0); H.stepAt(H, 0.1, 10);
    const tgt = H.XV.find((V) => V.name === 'railway').useTarget(K);
    H.useAction();
    const on = !!R.RW_STATE.ride;
    if (R.RW_STATE.ride) R.RW_STATE.ride.insT = null;
    H.useAction(); // (ring off at the next station)
    let maxV = 0; H.stepAt(H, 60, 10, () => { maxV = Math.max(maxV, T.v); return !R.RW_STATE.ride; });
    const off = { x: H.player.x, z: H.player.z, at: T.stopAt && T.stopAt.id };
    // ride on from WHEATLEY to the end of the line
    H.stepAt(H, 0.2, 10); const D2 = R.rwDoorSpots(T)[0]; H.goTo(H, D2.x, D2.z, 0); H.useAction(); const on2 = !!R.RW_STATE.ride; if (R.RW_STATE.ride) R.RW_STATE.ride.insT = null;
    H.stepAt(H, 60, 10, () => !R.RW_STATE.ride);
    return { tgt: tgt && tgt.kind, on, maxV, off, on2, end: { x: H.player.x, z: H.player.z, at: T.stopAt && T.stopAt.id }, rides: R.RW_STATE.rides, hp: H.player.hp };
  });
  assert.equal(s.tgt, 'board'); assert.ok(s.on, 'on the train'); assert.ok(s.maxV > 12, `gets up to speed (${s.maxV})`);
  assert.equal(s.off.at, 'wh'); assert.ok(Math.abs(s.off.x - 380) < 30 && s.off.z > -268, `off at the halt (${s.off.x}, ${s.off.z})`);
  assert.ok(s.on2); assert.equal(s.end.at, 'ash'); assert.ok(Math.abs(s.end.x - 700) < 30, 'turfed off at ASHFORD');
  assert.equal(s.rides, 2); assert.ok(s.hp >= 90, 'unhurt');
});

test('the inspector: penalty fare with no ticket, the toilet trick, and the train knocks you off the line', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const R = H.railway, K = H.TDK;
    const T = H.trainAt(H, 'ph', 1);
    const D = R.rwDoorSpots(T)[1]; H.goTo(H, D.x, D.z, 0); H.useAction();
    R.RW_STATE.ride.insT = 3; H.stepAt(H, 20, 10, () => R.RW_STATE.ride.insT == null);
    const fined = { cash: H.player.cash, fines: R.RW_STATE.fines, paid: R.RW_STATE.ride.paid };
    // again, hiding in the loo this time (rigged so he doesn't knock)
    R.RW_STATE.ride.paid = false; R.RW_STATE.ticket = null; R.RW_STATE.ride.insT = 3.5; R.RW_STATE.ride.insWarned = false;
    H.stepAt(H, 0.7, 10); const t = H.XV.find((V) => V.name === 'railway').useTarget(K);
    H.useAction(); const loo = R.RW_STATE.ride.loo; const rnd = Math.random; Math.random = () => 0.1;
    H.stepAt(H, 5, 10, () => R.RW_STATE.ride.insT == null); Math.random = rnd;
    const dodged = R.RW_STATE.dodged;
    R.rwGetOff(K);
    // stand on the line in front of a train
    T.state = 'run'; T.dir = 1; T.x = 120; T.v = 20; T.served = R.RW_STATIONS[0];
    H.goTo(H, 160, -270, 0); const hp0 = H.player.hp; H.stepAt(H, 3, 10, () => R.RW_STATE.hits > 0);
    return { fined, t: t && t.kind, loo, dodged, hits: R.RW_STATE.hits, hurt: hp0 - H.player.hp, z: H.player.z };
  });
  assert.equal(s.fined.cash, 85, 'a $15 penalty fare'); assert.equal(s.fined.fines, 1); assert.ok(s.fined.paid);
  assert.equal(s.t, 'loo'); assert.ok(s.loo); assert.equal(s.dodged, 1, 'he knocks and moves on');
  assert.equal(s.hits, 1); assert.ok(s.hurt > 10, `hurt (${s.hurt})`); assert.ok(Math.abs(s.z + 270) > 1.7, 'thrown off the line');
});
