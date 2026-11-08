// Delivery lorries: drops outside shops, the driver and his sack truck, stowing away in the back, being
// found at the next drop, and jumping out while it's moving.
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
      if (H.player.hide) H.leaveHide(H.SK); H.DL_STATE.ride = null;
      H.player.vx = H.player.vz = 0; H.player.hp = 80; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move'; H.player.hide = null; H.player.y = 0;
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false; H.input.fwd = 0;
    };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
  });
});
after(async () => { await g?.close(); });

test('lorries do their rounds: pulling up outside shops in the daytime, and two on the Route 9 run between the towns', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.player.x = 0; H.player.z = 0; H.navRecenter(0, 0, true);
    const r9 = H.G.cars.filter((c) => c.r9).length; const r4 = H.G.cars.filter((c) => c.r4).length;
    const dropped = H.stepAt(H, 90, 10, () => H.DL_STATE.drops > 0);
    return { r9, r4, dropped, drops: H.DL_STATE.drops };
  });
  assert.equal(s.r9, 2, 'a lorry each way on Route 9');
  assert.equal(s.r4, 2, 'and each way on Route 4, the docks run');
  assert.ok(s.dropped, 'a lorry made a delivery');
});

test('stow away in the back while it\'s unloading, ride to wherever it goes, and tumble out if you jump while it\'s moving', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const L = H.G.cars.find((c) => c.r9 && c.lane && c.lane.dir > 0);
    // put it on the open road and make it stop for a drop with you right behind it
    L.x = 300; L.z = L.lane.fixed; L.heading = Math.PI / 2; L.speed = 0;
    for (const c of H.G.cars) if (c !== L && Math.abs(c.z - L.z) < 3 && c.x > 290 && c.x < 420) { c.x = 900; }
    const W = { x: 302, z: L.z - 7, name: 'TEST', home: false };
    H.dlInternals.dlStart(L, W, H.TDK); L.dl.dur = 3;
    const r = H.dlInternals.dlRear(L, 0.5); H.player.x = r.x; H.player.z = r.z; H.navRecenter(r.x, r.z, true);
    H.stepAt(H, 1, 10);
    const near = H.dlRearNear(H.TDK) === L, stopped = Math.abs(L.speed) < 0.2, driver = !!(L.dlDriver && L.dlDriver.g.visible);
    H.dlHopOn(L, H.TDK);
    const hidden = H.player.hide && H.player.hide.kind, k = H.conspicNow();
    const x0 = H.player.x;
    H.stepAt(H, 8, 10);
    const moved = H.player.x - x0, still = H.player.hide && H.player.hide.kind, speed = L.speed, hp0 = H.player.hp;
    H.useAction(); H.stepAt(H, 0.2, 10);
    return { near, stopped, driver, hidden, k, moved, still, speed, hurt: hp0 - H.player.hp, out: !H.player.hide, tumbles: H.DL_STATE.tumbles, rides: H.DL_STATE.rides };
  });
  assert.ok(s.stopped, 'the lorry stopped for its drop'); assert.ok(s.driver, 'the driver is out with the crates');
  assert.ok(s.near, 'you can climb in the back while it\'s open');
  assert.equal(s.hidden, 'lorryback'); assert.equal(s.k, 0, 'nobody can see you in there');
  assert.ok(s.moved > 30, `you went along with it (${s.moved.toFixed(1)} m)`); assert.equal(s.still, 'lorryback');
  assert.ok(s.out, 'out you get'); assert.ok(s.speed > 4 && s.hurt > 0 && s.tumbles === 1, `jumping out at ${s.speed.toFixed(1)} m/s hurts (${s.hurt})`);
});

test('at the next drop the driver opens up the back, and sometimes he finds you', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const L = H.G.cars.find((c) => c.r9 && c.lane && c.lane.dir > 0);
    L.x = 300; L.z = L.lane.fixed; L.heading = Math.PI / 2; L.speed = 0; L.dl = { phase: null, cool: 99 };
    let caught = 0, kept = 0;
    for (let i = 0; i < 40; i++) {
      H.fresh(H);
      H.dlInternals.dlStart(L, { x: 302, z: L.z - 7, home: false }, H.TDK);
      const r = H.dlInternals.dlRear(L, 0.5); H.player.x = r.x; H.player.z = r.z;
      H.dlHopOn(L, H.TDK); H.DL_STATE.ride.t = 5;
      H.dlInternals.dlStart(L, { x: 302, z: L.z - 7, home: false }, H.TDK); // the next drop: he opens the back
      if (H.DL_STATE.ride) kept++; else caught++;
      L.dl = { phase: null, cool: 99 };
    }
    return { caught, kept, n: H.DL_STATE.caught };
  });
  assert.ok(s.caught > 0 && s.kept > 0, `found ${s.caught} times, not found ${s.kept} times`);
});
