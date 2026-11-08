// Vehicle tests: traffic is a mix of cars, hatchbacks, vans, box trucks and buses, and buses pull
// in at shelters to pick up whoever's waiting.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); await g.run((H) => H.startGame(false)); });
after(async () => { await g?.close(); });

test('traffic has every kind of vehicle, and big ones are bigger', async () => {
  const s = await g.run((H) => {
    const n = {}, hl = {};
    for (const c of H.G.cars) { n[c.kind] = (n[c.kind] || 0) + 1; hl[c.kind] = c.hl; }
    return { n, hl };
  });
  for (const k of ['car', 'hatch', 'van', 'truck', 'bus']) assert.ok(s.n[k] > 0, `no ${k}: ${JSON.stringify(s.n)}`);
  assert.ok(s.hl.bus > s.hl.truck && s.hl.truck > s.hl.van && s.hl.van > s.hl.car && s.hl.car > s.hl.hatch);
});

test('a bus stops at a shelter and the person waiting gets on', async () => {
  const s = await g.run((H) => {
    let setup = null;
    for (const sp of H.lifeSpots) {
      if (sp.kind !== 'bus') continue;
      for (const L of H.lanes) {
        const along = L.axis === 'z' ? sp.z : sp.x, perp = L.axis === 'z' ? sp.x - L.fixed : sp.z - L.fixed;
        if (Math.abs(perp) < 8 && along > L.a0 + 30 && along < L.a1 - 30) { setup = { sp, L, along }; break; }
      }
      if (setup) break;
    }
    if (!setup) return { setup: false };
    const { sp, L, along } = setup;
    H.player.x = sp.x + 15; H.player.z = sp.z + 15;
    for (const o of H.G.hunters) o.remove();
    const h = new H.Hunter(sp.x, sp.z, 'civ', false); H.G.hunters.push(h);
    sp.taken = h; h.act = { kind: 'bus', tx: sp.x, tz: sp.z, face: sp.face, dur: 999, phase: 'do', t: 0, goT: 0, lineT: 5, spot: sp };
    const bus = H.G.cars.find((c) => c.kind === 'bus');
    bus.placeOnLane(L, along - L.dir * 25); bus.lastStop = null; bus.stopT = 0;
    for (const c of H.G.cars) if (c !== bus && Math.hypot(c.x - bus.x, c.z - bus.z) < 40) { c.x += 2000; c.lane = null; c.driver = null; }
    let stopped = false;
    for (let i = 0; i < 300 && !h.dead; i++) { H.step(0.1); if (bus.stopT > 0) stopped = true; }
    return { setup: true, stopped, boarded: h.dead };
  });
  assert.ok(s.setup, 'found a shelter beside a lane');
  assert.ok(s.stopped, 'the bus stopped');
  assert.ok(s.boarded, 'the passenger got on');
});
