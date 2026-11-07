// Buses: the ROUTE 9 BUS STATION, the orange COUNTY LINK buses between the towns, riding any bus as a
// passenger (fare, seat, bell, getting off), and the night buses.
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
      if (H.buses.BS_STATE.ride) H.buses.bsGetOff(H.TDK);
      H.player.vx = H.player.vz = H.player.vy = 0; H.player.hp = 80; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move'; H.player.hide = null;
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false; H.input.fwd = 0; H.input.side = 0;
      H.player.cash = 100; H.player.outfit = {}; H.player.disg = 0; H.G.day = 1; H.buses.BS_STATE.rider = 0;
    };
    H.goTo = (H, x, z, y) => { H.player.x = x; H.player.z = z; H.player.y = y ?? H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
    // put a county bus on its lane at `along`, with the road ahead of it clear
    H.placeBus = (H, id, dir, along) => {
      const c = H.buses.bsCounty(H.TDK).find((q) => q.cb.id === id && q.cb.dir === dir);
      if (c.cb.axis === 'x') { c.x = along; c.z = c.lane.fixed; } else { c.z = along; c.x = c.lane.fixed; }
      c.speed = 8; c.stopT = 0; c.cbLast = null; c.lastStop = null;
      for (const o of H.G.cars) if (o !== c && Math.abs((c.cb.axis === 'x' ? o.z : o.x) - c.lane.fixed) < 3 && Math.abs((c.cb.axis === 'x' ? o.x : o.z) - along) < 120) { if (o.cb) { if (c.cb.axis === 'x') o.x += 400; else o.z += 400; } else { o.x = 1800; o.z = 1800; } }
      return c;
    };
  });
});
after(async () => { await g?.close(); });

test('the bus station: built on Route 9 with its platform on the kerb, and the orange county buses running', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.buses, S = B.station, K = H.TDK;
    H.goTo(H, 296, -20, 0); H.stepAt(H, 1.5, 12);
    const county = B.bsCounty(K);
    // the guard rail is cut away along the platform, so you can get from the shelter to the bus door
    const railGone = !H.colliders.some((c) => c.h <= 0.85 && c.h > 0.5 && c.x0 < 300 && c.x1 > 292 && c.z0 < -8 && c.z1 > -9);
    const railStill = H.colliders.some((c) => c.h <= 0.85 && c.h > 0.5 && c.x0 < 360 && c.x1 > 340 && c.z0 < -8 && c.z1 > -9);
    return { built: S.built, lockers: S.lockers.length, county: county.map((c) => c.cb.id + (c.cb.dir > 0 ? '+' : '-')).sort(), blinds: county.every((c) => !!c.blind), railGone, railStill, waiting: H.lifeSpots.filter((q) => q.kind === 'bus' && q.bsStop).length };
  });
  assert.ok(s.built); assert.ok(s.lockers >= 4, 'left luggage lockers');
  assert.deepEqual(s.county, ['X4+', 'X4-', 'X9+', 'X9-'], 'the X9 and the X4, each way');
  assert.ok(s.blinds, 'destination blinds');
  assert.ok(s.railGone, 'no guard rail between the platform and the road'); assert.ok(s.railStill, 'the rest of the rail is still there');
  assert.ok(s.waiting >= 15, `${s.waiting} places to wait for a county bus`);
});

test('get the X9: it calls at the station, you pay and sit down, ride along Route 9, ring the bell and get off at the next stop', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.buses, K = H.TDK;
    H.goTo(H, 296, -7.2, 0);
    const c = H.placeBus(H, 'X9', 1, 250);
    const called = H.stepAt(H, 15, 12, () => c.stopT > 0 && Math.abs(c.x - 296) < 6);
    const T = B.useTarget(K), cash0 = H.player.cash;
    if (T && T.kind === 'board') B.use(T, K);
    const on = !!B.BS_STATE.ride, paid = cash0 - H.player.cash;
    H.stepAt(H, 4, 12);
    const k = H.conspicNow(), roofed = H.underRoof(), y = H.player.y, x1 = H.player.x, withBus = Math.hypot(H.player.x - c.x, H.player.z - c.z) < 4;
    const bell = B.useTarget(K); B.use(bell, K);
    const off = H.stepAt(H, 60, 12, () => !B.BS_STATE.ride);
    return { called, T: T && T.kind, on, paid, k, roofed, y, withBus, moved: x1 - 296, bell: bell && bell.kind, rang: B.BS_STATE.bells, off, x: H.player.x, z: H.player.z, onFoot: H.player.y < 0.3 };
  });
  assert.ok(s.called, 'the X9 calls at the bus station');
  assert.equal(s.T, 'board'); assert.ok(s.on, 'on the bus'); assert.equal(s.paid, 2, '$2 on the day bus');
  assert.ok(s.withBus && s.moved > 5, `riding along with it (${s.moved.toFixed(1)} m)`); assert.ok(Math.abs(s.y - 0.5) < 0.05, 'sat in a seat');
  assert.ok(s.k < 0.05, `one more face at a bus window (${s.k})`); assert.ok(s.roofed, 'under the bus roof: nothing in the sky sees you');
  assert.equal(s.bell, 'bell'); assert.equal(s.rang, 1);
  assert.ok(s.off, 'off at the next stop'); assert.ok(s.onFoot, 'back on your feet'); assert.ok(s.x > 320, `further down the road (${s.x.toFixed(0)}, ${s.z.toFixed(0)})`);
});

test('night buses: after eleven the blinds change, it\'s $3, a DAY RIDER covers it, and the driver won\'t let you on with someone chasing you', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.buses, K = H.TDK;
    H.goTo(H, 296, -7.2, 0);
    const c = H.placeBus(H, 'X9', 1, 250);
    H.stepAt(H, 15, 23.5, () => c.stopT > 0 && Math.abs(c.x - 296) < 6);
    const night = c.blind.night, fare = B.busFare(23.5);
    // a hunter right behind you
    const h = new H.Hunter(292, -9, 'cop', false, 'chase'); H.G.hunters.push(h); h.state = 'chase';
    const T = B.useTarget(K); B.use(T, K); const refused = !B.BS_STATE.ride && B.BS_STATE.refused === 1;
    h.remove(); H.G.hunters.length = 0;
    // the day rider
    B.BS_STATE.rider = H.G.day; const c2 = H.placeBus(H, 'X9', 1, 250);
    H.stepAt(H, 15, 23.5, () => c2.stopT > 0 && Math.abs(c2.x - 296) < 6);
    const cash0 = H.player.cash, T2 = B.useTarget(K); if (T2 && T2.kind === 'board') B.use(T2, K);
    const free = !!B.BS_STATE.ride && cash0 === H.player.cash, nightRide = B.BS_STATE.nightRides;
    H.stepAt(H, 3, 23.5);
    const off = B.useTarget(K);
    return { night, fare, refused, free, nightRide, cabin: c2.cabin && c2.cabin.folk.length };
  });
  assert.equal(s.night, true, 'the N9 blind at night'); assert.equal(s.fare, 3);
  assert.ok(s.refused, 'the doors shut in your face');
  assert.ok(s.free, 'the day rider covers it'); assert.equal(s.nightRide, 1);
  assert.ok(s.cabin >= 3, `${s.cabin} others on the night bus`);
});

test('the X4 calls at the leisure park on Route 4', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.buses;
    H.goTo(H, -10, 300, 0);
    const c = H.placeBus(H, 'X4', -1, 360);
    const called = H.stepAt(H, 15, 12, () => c.stopT > 0 && Math.abs(c.z - 296) < 6);
    const door = B.bsDoor(c);
    return { called, doorX: door.x, z: c.z };
  });
  assert.ok(s.called, 'the X4 pulls in at the leisure park');
  assert.ok(s.doorX < -5, `the door opens on the kerb side (${s.doorX.toFixed(1)})`);
});
