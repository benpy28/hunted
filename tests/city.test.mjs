// City tests: the towns are full of real places, walk-in shops can actually be walked into, and the
// street dressing never blocks a doorway.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); await g.run((H) => H.startGame(false)); });
after(async () => { await g?.close(); });

test('every town has plenty of walk-in shops of different kinds', async () => {
  const s = await g.run((H) => { const by = {}, kinds = new Set(); for (const w of H.walkIns) { by[w.city] = (by[w.city] || 0) + 1; kinds.add(w.kind); } return { by, kinds: kinds.size }; });
  assert.ok(s.by['PORT HALDEN'] >= 40, `Port Halden walk-ins: ${s.by['PORT HALDEN']}`);
  assert.ok(s.by['ASHFORD'] >= 5, `Ashford walk-ins: ${s.by['ASHFORD']}`);
  assert.ok(s.by['SALTMARSH DOCKS'] >= 5, `Docks walk-ins: ${s.by['SALTMARSH DOCKS']}`);
  assert.ok(s.kinds >= 8, `only ${s.kinds} kinds of shop`);
});

test('you can walk in through the door of every walk-in shop', async () => {
  const bad = await g.run((H) => {
    const out = [];
    for (const w of H.walkIns) {
      H.navRecenter(w.x, w.z, true);
      for (const [x, z] of w.path) if (H.blockedAt(x, z)) { out.push(`${w.name} @ ${x.toFixed(1)},${z.toFixed(1)}`); break; }
    }
    return out;
  });
  assert.deepEqual(bad, []);
});

test('inside a walk-in you are out of sight of aircraft and the HUD names the place', async () => {
  const s = await g.run((H) => {
    const w = H.walkIns[0];
    const [x, z] = w.path[3];
    H.player.x = x; H.player.z = z; H.player.y = H.floorAt(x, z, 0.5); H.player.vx = H.player.vz = 0;
    H.step(0.5);
    return { under: H.underRoof(), locale: H.G.locale, name: w.name };
  });
  assert.equal(s.under, true);
  assert.equal(s.locale, s.name);
});

test('buildings carry real climbable detail: balconies, fire escapes and their ladders', async () => {
  const s = await g.run((H) => ({ ledges: H.colliders.filter((c) => c.ledge && c.y0 > 1).length, ladders: H.ladders.length }));
  assert.ok(s.ledges > 500, `ledges: ${s.ledges}`);
  assert.ok(s.ladders > 80, `ladders: ${s.ladders}`);
});
