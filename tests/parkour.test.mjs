// Parkour tests: climbing walls, long jumps between roofs and gentler landings make getting over
// buildings easy.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); });
after(async () => { await g?.close(); });
beforeEach(async () => { await g.run((H) => { H.startGame(false); for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0; }); });

test('you can climb the wall of a building onto its roof', async () => {
  const s = await g.run((H) => {
    const cands = H.roofs.filter((r) => r.city && r.city.style === 'metro' && !r.house && r.h >= 8 && r.h <= 16 && r.y0 === 0 && r.x1 - r.x0 > 6 && r.z1 - r.z0 > 6);
    let tried = 0, ok = 0; const fails = [];
    for (const r of cands) {
      if (tried >= 12) break;
      const z = (r.z0 + r.z1) / 2, x = r.x0 - 0.45;
      H.navRecenter(x, z, true);
      if (H.blockedAt(x - 1, z) || H.stackTop(x + 0.8, z, 0) < r.h - 0.2) continue; // something in the way, or not this roof's wall
      tried++;
      const P = H.player;
      Object.assign(P, { x, z, y: H.floorAt(x, z, 0.5), vx: 0, vz: 0, vy: 0, yaw: -Math.PI / 2, pitch: 0, stam: 100, mode: 'move', grounded: true, climbCd: 0 });
      H.input.fwd = 1; H.input.jump = true;
      H.step(0.1); H.input.jump = false;
      let peak = P.y;
      for (let t = 0; t < 12 && P.y < r.h - 0.2; t++) { H.step(0.5); P.stam = Math.max(P.stam, 60); peak = Math.max(peak, P.y); }
      H.input.fwd = 0;
      if (P.y >= r.h - 0.2) ok++; else fails.push(`${r.h} reached ${peak.toFixed(1)} mode ${P.mode}`);
    }
    return { tried, ok, fails };
  });
  assert.ok(s.tried >= 6, `only found ${s.tried} walls to try`);
  assert.ok(s.ok >= s.tried * 0.75, `climbed ${s.ok}/${s.tried}: ${s.fails.join('; ')}`);
});

test('climbing uses stamina and you fall off when it runs out', async () => {
  const s = await g.run((H) => {
    const r = H.roofs.find((r) => r.city && r.city.style === 'metro' && r.h >= 40 && r.y0 === 0);
    const z = (r.z0 + r.z1) / 2, x = r.x0 - 0.45, P = H.player;
    Object.assign(P, { x, z, y: H.floorAt(x, z, 0.5), vx: 0, vz: 0, vy: 0, yaw: -Math.PI / 2, stam: 40, mode: 'move', grounded: true, climbCd: 0 });
    H.input.fwd = 1; H.input.jump = true; H.step(0.1); H.input.jump = false;
    const climbing = P.mode === 'climb';
    H.step(6); H.input.fwd = 0;
    return { climbing, mode: P.mode, y: P.y, h: r.h };
  });
  assert.ok(s.climbing, 'should start climbing');
  assert.notEqual(s.mode, 'climb', 'arms should give out on a tall tower');
  assert.ok(s.y < s.h - 5);
});

test('a running jump off a roof carries much further than a standing one', async () => {
  const s = await g.run((H) => {
    let r, z;
    for (const c of H.roofs) {
      if (!c.city || c.city.style !== 'metro' || c.house || c.h < 10 || c.x1 - c.x0 < 14 || c.z1 - c.z0 < 6) continue;
      for (let zz = c.z0 + 1.5; zz < c.z1 - 1.5 && !r; zz += 1) {
        let clear = true; for (let k = 2; k < 12; k += 0.5) if (H.stackTop(c.x0 + k, zz, c.h, 0.5) > c.h + 0.4) clear = false;
        if (clear) { r = c; z = zz; }
      }
      if (r) break;
    }
    const P = H.player;
    const leap = (sprint) => {
      Object.assign(P, { x: r.x0 + 3, z, y: r.h, vx: 0, vz: 0, vy: 0, yaw: -Math.PI / 2, pitch: 0, stam: 100, mode: 'move', grounded: true, longJump: false });
      H.input.fwd = 1; H.input.sprint = sprint; H.step(0.5);
      H.input.jump = true; H.step(1 / 30); H.input.jump = false;
      const sp = Math.hypot(P.vx, P.vz); H.input.fwd = 0; H.input.sprint = false;
      return sp;
    };
    return { walk: leap(false), run: leap(true) };
  });
  assert.ok(s.run > s.walk * 1.5, `running leap ${s.run.toFixed(1)} vs walking ${s.walk.toFixed(1)}`);
  assert.ok(s.run > 9, `running leap speed ${s.run.toFixed(1)}`);
});
