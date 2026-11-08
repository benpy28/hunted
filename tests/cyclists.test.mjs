// Cyclists: townsfolk ride the bike lanes, ring at people in the way, fall off when hit, and the player
// can pick up a fallen bike (or nick one from a rider) and ride it, much faster than running.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => {
  g = await openGame(); await g.run((H) => H.startGame(false));
  await g.run((H) => { H.fresh = (H) => {
  for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
  for (const B of H.bikes) B.dead = true; H.step(0.05);
  H.player.x = 0; H.player.z = 0; H.player.y = 0.15; H.player.vx = H.player.vz = 0; H.player.hp = 100; H.player.alive = true; H.player.bike = null;
  H.G.heat = 0; H.G.level = 0;
} });
});
after(async () => { await g?.close(); });

// clear the streets and drop a single cyclist near the player


test('cyclists ride along the bike lanes in town, clear of walls, and keep moving', async () => {
  const s = await g.run((H) => {
    H.player.x = 0; H.player.z = 0; H.player.y = 0.15;
    H.step(12);
    const riding = H.riders.filter((h) => h !== H.player);
    const before = riding.map((h) => ({ h, x: h.x, z: h.z }));
    H.step(2);
    return {
      n: riding.length,
      moved: before.filter((b) => !b.h.dead && b.h.bike && Math.hypot(b.h.x - b.x, b.h.z - b.z) > 4).length,
      alive: before.filter((b) => !b.h.dead && b.h.bike).length,
      inWalls: riding.filter((h) => !h.dead && H.solidAt(h.x, 0.6, h.z, 0.05)).length,
      onRoad: riding.filter((h) => !h.dead && H.lanes.some((l) => { const lat = l.axis === 'z' ? h.x - l.fixed : h.z - l.fixed; const al = l.axis === 'z' ? h.z : h.x; return Math.abs(Math.abs(lat) - 2.3) < 1.6 && al > l.a0 - 2 && al < l.a1 + 2; })).length,
    };
  });
  assert.ok(s.n >= 3, `only ${s.n} cyclists about`);
  assert.equal(s.inWalls, 0, 'a cyclist is inside a wall');
  assert.ok(s.moved >= Math.max(1, s.alive - 1), `${s.moved} of ${s.alive} cyclists actually rode anywhere`);
  assert.ok(s.onRoad >= s.alive - 1, 'cyclists keep to the bike lane');
});

test('a shove knocks a rider off: they go flying, get up later, and the bike lies in the road', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const h = H.spawnCyclist(H.BK, 'search', 6, 40); const B = h.bike;
    B.cruise = 0; B.speed = 0; H.step(0.1);
    const fx = Math.sin(B.heading), fz = Math.cos(B.heading);
    H.player.x = h.x - fz * 1.4; H.player.z = h.z + fx * 1.4; H.player.y = 0.15;
    H.player.yaw = Math.atan2(-(h.x - H.player.x), -(h.z - H.player.z)); H.player.shoveCd = 0;
    const ups = H.G.getUps.length;
    H.playerShove(); H.step(0.2);
    return { dead: h.dead, bike: !!h.bike, lying: B.lying, rider: !!B.rider, getUp: H.G.getUps.length > ups };
  });
  assert.ok(s.dead, 'the rider should be floored');
  assert.equal(s.rider, false);
  assert.ok(s.lying, 'the bike falls over');
  assert.ok(s.getUp, 'they get back up later');
});

test('a car ploughing into a cyclist sends them over the handlebars', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const h = H.spawnCyclist(H.BK, 'search', 6, 40); const B = h.bike;
    const c = H.G.cars.find((c) => c.kind === 'car' && !c.wrecked);
    c.driver = null; c.lane = null; c.heading = B.heading + Math.PI; c.speed = 14; c.far = false; c.air = null;
    c.x = h.x + Math.sin(B.heading) * 2.4; c.z = h.z + Math.cos(B.heading) * 2.4;
    H.carInteractions(); const dd = { dead1: h.dead, rider1: !!B.rider, gp: !!h.g.parent }; H.step(0.1);
    return { ...dd, bdead: !!B.dead, inList: H.bikes.includes(B), rider: !!B.rider, dead: h.dead, lying: B.lying, gap: Math.hypot(c.x - h.x, c.z - h.z), sp: c.speed, cx: c.x, hx: h.x, cz: c.z, hz: c.z };
  });
  assert.ok(s.dead && s.lying, JSON.stringify(s));
  // someone who simply rides out of the area takes their bike with them
  const t = await g.run((H) => { H.fresh(H); const h = H.spawnCyclist(H.BK, 'search', 6, 40); const B = h.bike; h.remove(); H.step(0.05); return H.bikes.includes(B); });
  assert.equal(t, false);
});

test('you can pick up a fallen bike and ride it much faster than you run, then hop off', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const h = H.spawnCyclist(H.BK, 'search', 6, 40); const B = h.bike;
    h.bike = null; H.step(0.05); // the rider hops off and leaves the bike
    const fx = Math.sin(B.heading), fz = Math.cos(B.heading);
    H.player.x = B.x; H.player.z = B.z; H.player.y = 0.15; H.player.vx = H.player.vz = 0;
    H.useAction();
    const on = H.player.bike === B;
    H.player.yaw = Math.atan2(-fx, -fz); H.player.pitch = 0; // look along the lane
    const x0 = H.player.x, z0 = H.player.z;
    H.input.fwd = 1; H.input.sprint = false;
    H.stepDt(2, 1 / 30, () => { H.input.fwd = 1; });
    const rode = Math.hypot(H.player.x - x0, H.player.z - z0);
    H.input.fwd = 0; H.step(1.5);
    H.useAction();
    return { on, rode, off: !H.player.bike, lying: B.lying, bikeAt: Math.hypot(B.x - H.player.x, B.z - H.player.z) };
  });
  assert.ok(s.on, 'E next to a bike gets you on it');
  assert.ok(s.rode > 15, `only rode ${s.rode.toFixed(1)} m in 2 s (running is 11.6 m)`);
  assert.ok(s.off && s.lying && s.bikeAt < 1.5, 'E again leaves the bike where you are');
});

test('E right beside a rider pulls them off and you ride away on their bike', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const h = H.spawnCyclist(H.BK, 'search', 6, 40); const B = h.bike;
    B.cruise = 0; B.speed = 0; H.step(0.1);
    H.player.x = h.x + Math.cos(B.heading) * 1.2; H.player.z = h.z - Math.sin(B.heading) * 1.2; H.player.y = 0.15;
    const heat0 = H.G.heat;
    H.useAction();
    return { mine: H.player.bike === B, floored: h.dead, heat: H.G.heat > heat0 };
  });
  assert.ok(s.mine && s.floored && s.heat);
  await g.run((H) => { H.useAction(); });
});

test('when the town is after you, cyclists chase you down and hop off to grab you', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const h = H.spawnCyclist(H.BK, 'chase', 30, 60);
    if (!h) return null;
    const d0 = Math.hypot(h.x - H.player.x, h.z - H.player.z);
    H.navRecenter(H.player.x, H.player.z, true);
    let off = -1, minD = d0;
    H.stepDt(9, 1 / 30, () => { H.player.hp = 100; H.player.x = 0; H.player.z = 0; const d = Math.hypot(h.x - H.player.x, h.z - H.player.z); minD = Math.min(minD, d); if (off < 0 && !h.bike) off = d; });
    return { d0, minD, off, chasing: h.state === 'chase', alive: !h.dead, inScene: !!h.g.parent, bike: !!h.bike, stun: h.stun, x: h.x, z: h.z };
  });
  assert.ok(s, 'no chasing cyclist spawned');
  assert.ok(s.minD < s.d0 - 10, JSON.stringify(s));
  assert.ok(s.off >= 0, 'they never got off the bike');
});

test('traffic brakes for a cyclist pulled out in front of it', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const c = H.G.cars.find((c) => c.driver === 'traffic' && c.kind === 'car' && !c.far);
    const h = H.spawnCyclist(H.BK, 'search', 6, 60); const B = h.bike;
    B.cruise = 0; B.speed = 0;
    // park the cyclist in the car's lane, just ahead of it
    h.x = c.x + c.fx * 9; h.z = c.z + c.fz * 9; B.lane = null; h.state = 'chase'; h.bike = B;
    H.riders.length = 0; H.riders.push(h);
    c.speed = 8;
    for (let i = 0; i < 60; i++) { c.update(1 / 30); H.riders.length = 0; H.riders.push(h); }
    return { gap: Math.hypot(h.x - c.x, h.z - c.z), speed: c.speed };
  });
  assert.ok(s.gap > 2.4, `the car ran into the cyclist (gap ${s.gap.toFixed(2)})`);
  assert.ok(s.speed < 3);
});
