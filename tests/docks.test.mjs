// Docks warehouses: the sheds in SALTMARSH DOCKS are hollow, furnished, enterable and hide you from the
// sky, and hunters can follow you in through the roll-up doors and up to the mezzanine.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); await g.run((H) => H.startGame(false)); });
after(async () => { await g?.close(); });

test('the docks have walk-in warehouses of every kind, with clear doors and a mezzanine', async () => {
  const s = await g.run((H) => H.warehouses.map((w) => ({
    kind: w.kind, city: w.city, spots: w.spots.length,
    doors: w.doors.map((d) => !H.solidAt(d.x, 0.3, d.z, 0.05, 0.4, 1.6) && !H.solidAt(d.ox, 0.3, d.oz, 0.05, 0.4, 1.6)),
    floor: H.floorAt((w.doors[0].x), w.doors[0].z, 1),
    mezz: H.floorAt(w.mezz.x, w.mezz.z, 5),
    zone: !!H.zoneAt((w.rect.x0 + w.rect.x1) / 2, 1, (w.rect.z0 + w.rect.z1) / 2),
  })));
  assert.ok(s.length >= 5, `only ${s.length} warehouses`);
  assert.deepEqual([...new Set(s.map((w) => w.kind))].sort(), ['boats', 'disused', 'fish', 'racking', 'storage']);
  for (const w of s) {
    assert.equal(w.city, 'SALTMARSH DOCKS');
    assert.ok(w.doors.length >= 1 && w.doors.every(Boolean), `blocked door in a ${w.kind} shed`);
    assert.ok(w.floor < 0.5, 'floor inside the door is at ground level');
    assert.ok(Math.abs(w.mezz - 3.8) < 0.05, `mezzanine floor at ${w.mezz}`);
    assert.ok(w.zone, 'the inside is a named place');
    assert.ok(w.spots > 2, 'there are places to work inside');
  }
});

test('inside a warehouse you are under a roof, and its walls block sight', async () => {
  const s = await g.run((H) => {
    let covered = 0, blocked = 0, n = 0;
    for (const w of H.warehouses) {
      const r = w.rect, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const d = w.doors[0];
      H.player.x = d.x; H.player.z = d.z; H.player.y = 0.15;
      if (H.underRoof()) covered++;
      // look in from just outside the back wall (the side away from the main doors)
      const ux = cx - d.x, uz = cz - d.z, ul = Math.hypot(ux, uz) || 1, half = Math.abs(ux) > Math.abs(uz) ? (r.x1 - r.x0) / 2 : (r.z1 - r.z0) / 2;
      const ox = cx + (ux / ul) * (half + 1.5), oz = cz + (uz / ul) * (half + 1.5);
      if (H.pointBlocked(ox, oz, 0)) continue;
      n++; if (!H.losSolid(ox, 1.6, oz, cx, 1.6, cz)) blocked++;
    }
    return { covered, total: H.warehouses.length, blocked, n };
  });
  assert.equal(s.covered, s.total);
  assert.ok(s.n > 0);
  assert.equal(s.blocked, s.n);
});

test('a chasing crowd follows you in through the doors and up the stairs to the mezzanine', async () => {
  const s = await g.run((H) => {
    const w = H.warehouses.find((w) => w.kind === 'racking') || H.warehouses[0];
    for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
    H.player.x = w.mezz.x; H.player.z = w.mezz.z; H.player.y = w.mezz.y; H.player.vx = H.player.vz = H.player.vy = 0;
    H.navRecenter(w.mezz.x, w.mezz.z, true);
    const d = w.doors[0];
    for (let k = 0; k < 6; k++) H.G.hunters.push(new H.Hunter(d.ox + (k % 3) * 1.2 - 1.2, d.oz + Math.floor(k / 3) * 1.2, 'runner', false, 'chase'));
    H.G.heat = 200;
    let inside = 0, upstairs = 0;
    H.stepDt(30, 1 / 30, () => {
      H.player.hp = 100; H.player.x = w.mezz.x; H.player.z = w.mezz.z; H.player.y = w.mezz.y;
      for (const h of H.G.hunters) {
        if (h.dead) continue;
        const z = H.zoneAt(h.x, h.y + 0.5, h.z);
        if (z && z.warehouse) inside = Math.max(inside, 1);
        if (h.y > 3.0 && h.x > w.rect.x0 && h.x < w.rect.x1 && h.z > w.rect.z0 && h.z < w.rect.z1) upstairs = 1;
      }
    });
    const near = H.G.hunters.filter((h) => !h.dead && Math.hypot(h.x - w.mezz.x, h.z - w.mezz.z) < 6).length;
    return { inside, upstairs, near };
  });
  assert.equal(s.inside, 1, 'nobody got in through the doors');
  assert.equal(s.upstairs, 1, 'nobody climbed to the mezzanine');
});
