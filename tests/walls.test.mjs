// Wall tests: nobody (hunters, the player, cars) ever gets into a solid building or through a wall,
// even at a low frame rate with a crowd shoving and knockbacks flying. And hunters can't see you
// through walls.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); await g.run((H) => H.startGame(false)); });
after(async () => { await g?.close(); });

// watch every hunter each tick: inside a solid, or crossed a wall since the last tick?
const WATCH = (H) => {
  const prev = new Map(), bad = [];
  return {
    bad,
    check() {
      for (const h of H.G.hunters) {
        if (h.dead || h.climb || h.ladder || h.held) { prev.delete(h); continue; }
        const c = H.solidAt(h.x, h.y, h.z, 0.05, 0.6, 2); // poles and lamp posts don't count: a building does
        if (c) bad.push(`inside @${h.x.toFixed(1)},${h.z.toFixed(1)} y${h.y.toFixed(1)}`);
        const p = prev.get(h);
        if (p && Math.abs(p.y - h.y) < 0.3 && h.y < 1 && Math.hypot(p.x - h.x, p.z - h.z) < 3) {
          // tunnelled: last tick and this tick are on opposite sides of a wall (not just sliding round a corner)
          for (const c of H.colliders) {
            if (c.h < h.y + 2 || (c.y0 || 0) > h.y + 0.5 || c.water || c.glass) continue;
            const inZ = Math.max(p.z, h.z) > c.z0 && Math.min(p.z, h.z) < c.z1, inX = Math.max(p.x, h.x) > c.x0 && Math.min(p.x, h.x) < c.x1;
            const crossX = inZ && ((p.x <= c.x0 && h.x >= c.x1) || (p.x >= c.x1 && h.x <= c.x0));
            const crossZ = inX && ((p.z <= c.z0 && h.z >= c.z1) || (p.z >= c.z1 && h.z <= c.z0));
            if ((crossX && Math.min(p.z, h.z) > c.z0 && Math.max(p.z, h.z) < c.z1) || (crossZ && Math.min(p.x, h.x) > c.x0 && Math.max(p.x, h.x) < c.x1)) { bad.push(`through a wall @${p.x.toFixed(2)},${p.z.toFixed(2)} -> ${h.x.toFixed(2)},${h.z.toFixed(2)}`); break; }
          }
        }
        prev.set(h, { x: h.x, y: h.y, z: h.z });
      }
      { const pc = H.solidAt(H.player.x, H.player.y, H.player.z, 0.05, 0.6, 2); if (pc) bad.push(`player inside a solid @${H.player.x.toFixed(2)},${H.player.z.toFixed(2)} y${H.player.y.toFixed(2)} mode ${H.player.mode} box ${pc.x0.toFixed(2)},${pc.z0.toFixed(2)}-${pc.x1.toFixed(2)},${pc.z1.toFixed(2)} y0 ${pc.y0} h${pc.h}`); }
    },
  };
};

test('a crowd chasing you into a walk-in shop at a low frame rate never clips through walls', async () => {
  const s = await g.run((H, src) => {
    const W = (0, eval)(src)(H), out = [];
    for (const w of H.walkIns.slice(0, 4)) {
      const [x, z] = w.path[3];
      H.player.x = x; H.player.z = z; H.player.y = H.floorAt(x, z, 0.5); H.player.vx = H.player.vz = 0; H.player.hp = 100;
      H.navRecenter(x, z, true);
      for (let i = 0; i < 20; i++) H.spawnHunter(6, 30, 'chase');
      H.G.heat = 200;
      H.stepDt(8, 0.05, () => { H.player.hp = 100; for (const h of H.G.hunters) if (!h.dead && Math.random() < 0.02) { h.kx += (Math.random() - 0.5) * 30; h.kz += (Math.random() - 0.5) * 30; } W.check(); });
      for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
    }
    return W.bad.slice(0, 10);
  }, WATCH.toString());
  assert.deepEqual(s, []);
});

test('flying flat out or getting knocked flying never puts the player inside a building', async () => {
  const s = await g.run((H) => {
    const bad = [];
    const big = H.colliders.filter((c) => c.x1 - c.x0 > 10 && c.z1 - c.z0 > 10 && c.h > 12 && !c.y0 && Math.hypot((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2) < 200).slice(0, 12);
    for (const c of big) {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
      // flying at 80 m/s straight at the middle of the wall, a few metres up
      if (H.solidAt(c.x0 - 6, 4, cz, 0) || H.solidAt(c.x0 - 1.5, 0.2, cz, 0) || H.pointBlocked(c.x0 - 1.5, cz, 0.5)) continue;
      H.player.flying = true; H.player.x = c.x0 - 6; H.player.z = cz; H.player.y = 4; H.player.yaw = -Math.PI / 2; H.player.pitch = 0;
      H.input.fwd = 1; H.input.sprint = true;
      for (let i = 0; i < 20; i++) { H.player.vx = 80; H.player.vz = 0; H.stepDt(0.05, 0.05); if (H.solidAt(H.player.x, H.player.y, H.player.z, 0.05) || (H.player.x > c.x0 + 0.5 && H.player.x < c.x1 - 0.5 && H.player.y < c.h - 1 && Math.abs(H.player.z - cz) < (c.z1 - c.z0) / 2 - 0.5)) { bad.push(`flew into ${cx.toFixed(0)},${cz.toFixed(0)}`); break; } }
      H.input.fwd = 0; H.input.sprint = false; H.player.flying = false;
      // knocked hard into the wall on foot
      H.player.x = c.x0 - 1.5; H.player.z = cz; H.player.y = H.floorAt(H.player.x, cz, 0.5);
      H.player.kx = 60; H.player.kz = 0; H.stepDt(0.5, 0.05);
      if (H.player.x > c.x0 && H.player.x < c.x1 && H.player.y < c.h - 1) bad.push(`knocked into ${cx.toFixed(0)},${cz.toFixed(0)}`);
    }
    H.player.kx = H.player.kz = 0;
    return { n: big.length, bad };
  });
  assert.ok(s.n >= 3, 'found big buildings to test');
  assert.deepEqual(s.bad, []);
});

test('hunters cannot see you through a shop wall', async () => {
  const s = await g.run((H) => {
    let blocked = 0, n = 0;
    for (const w of H.walkIns.slice(0, 12)) {
      const r = w.rect, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      // a point just behind the back wall of the room, and one inside: the wall must block the view
      const [dx, dz] = w.path[3], ux = cx - dx, uz = cz - dz, ul = Math.hypot(ux, uz) || 1;
      const inX = cx, inZ = cz, outX = cx + ux / ul * (Math.max(r.x1 - r.x0, r.z1 - r.z0) / 2 + 1.5), outZ = cz + uz / ul * (Math.max(r.x1 - r.x0, r.z1 - r.z0) / 2 + 1.5);
      if (H.pointBlocked(outX, outZ, 0)) continue; // solid behind: definitely blocked
      n++; if (!H.losSolid(outX, 1.6, outZ, inX, 1.6, inZ)) blocked++;
    }
    return { n, blocked };
  });
  assert.equal(s.blocked, s.n);
});

test('most buildings can be entered, and every enterable place is furnished', async () => {
  const s = await g.run((H) => {
    const by = {}, empty = [];
    for (const w of H.walkIns) {
      by[w.city] = (by[w.city] || 0) + 1;
      if (!(w.items >= 6)) empty.push(`${w.name} (${w.kind}) has ${w.items} pieces of furniture`);
    }
    return { by, empty: empty.slice(0, 10), nEmpty: empty.length };
  });
  assert.ok(s.by['PORT HALDEN'] >= 180, `Port Halden enterable: ${s.by['PORT HALDEN']}`);
  assert.ok(s.by['ASHFORD'] >= 120, `Ashford enterable: ${s.by['ASHFORD']}`);
  assert.ok(s.by['SALTMARSH DOCKS'] >= 40, `Docks enterable: ${s.by['SALTMARSH DOCKS']}`);
  assert.deepEqual(s.empty, [], `${s.nEmpty} empty interiors`);
});

test('chasers find the doorway instead of walking into the shop wall', async () => {
  const r = await g.run((H) => {
    const P = H.player, G = H.G; let press = 0, reached = 0, total = 0;
    for (const w of H.walkIns.filter((w, i) => i % 9 === 0).slice(0, 6)) {
      const [x, z] = w.path[3];
      Object.assign(P, { x, z, y: H.floorAt(x, z, 0.5), vx: 0, vz: 0, hp: 100 });
      for (const h of G.hunters) h.remove(); G.hunters.length = 0;
      H.navRecenter(x, z, true); H.computeFlow(x, z); G.heat = 200;
      for (let i = 0; i < 8; i++) H.spawnHunter(8, 30, 'chase');
      const mine = [...G.hunters], last = new Map(); let t = 0;
      H.stepDt(14, 1 / 30, () => {
        P.hp = 100; P.x = x; P.z = z; P.vx = P.vz = 0; t += 1 / 30;
        if (t % 1 < 1 / 30) for (const h of mine) {
          const lp = last.get(h); last.set(h, [h.x, h.z]);
          if (lp && !h.dead && h.state === 'chase' && h.pressing && Math.hypot(h.x - lp[0], h.z - lp[1]) < 0.3 && Math.hypot(h.x - x, h.z - z) > 3) press++;
        }
      });
      for (const h of mine) if (!h.dead) { total++; if (Math.hypot(h.x - x, h.z - z) < 3 || (h.x > w.rect.x0 && h.x < w.rect.x1 && h.z > w.rect.z0 && h.z < w.rect.z1)) reached++; }
    }
    for (const h of G.hunters) h.remove(); G.hunters.length = 0;
    return { press, reached, total };
  });
  assert.ok(r.press < 20, `seconds spent pushing into walls: ${r.press}`);
  assert.ok(r.reached >= r.total * 0.6, `got to you: ${r.reached}/${r.total}`);
});
