// SWAT: hole up in a building once they know you're there and, two minutes on, a riot squad turns
// up, gasses the place and comes in behind shields. Shields stop hits from the front, not the back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
const intoShop = (H) => {
  const w = H.walkIns.find((w) => w.kind !== 'home' && Math.hypot(w.x, w.z) < 260) || H.walkIns[0];
  const [x, z] = w.path[3];
  Object.assign(H.player, { x, z, y: H.floorAt(x, z, 0.5), vx: 0, vz: 0, hp: 100, alive: true });
  H.navRecenter(x, z, true); H.computeFlow(x, z);
  return { w, x, z };
};
before(async () => { g = await openGame(); await g.run((H, src) => { H.startGame(false); H.__intoShop = src; }, intoShop.toString()); });
after(async () => { await g?.close(); });

test('being seen going into a shop starts a two minute SWAT countdown, which stands down if you slip away', async () => {
  const r = await g.run((H) => {
    H.swatReset();
    const { x, z } = (0, eval)(H.__intoShop)(H);
    H.G.lkp.x = x; H.G.lkp.z = z; H.G.lastSeenT = 0;
    H.updateSwat(1 / 30);
    const a = H.swatDebug();
    H.stepDt(3, 1 / 30, () => { H.player.hp = 100; });
    const b = H.swatDebug();
    // walk well away, unseen
    for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
    let o = null; for (let t = 0; t < 50 && !o; t++) { const c = H.randomOpenPoint(x, z, 60, 120); if (c && !H.zoneAt(c.x, 0.5, c.z) && !H.safehouses.some((s) => c.x > s.x0 && c.x < s.x1 && c.z > s.z0 && c.z < s.z1)) o = c; }
    Object.assign(H.player, { x: o.x, z: o.z, y: 0 }); H.G.unseenT = 30; H.SWT.outT = 0;
    for (let i = 0; i < 30 * 14; i++) { H.G.unseenT = 30; H.updateSwat(1 / 30); }
    return { a, b, c: H.swatDebug(), hud: document.getElementById('swat-timer')?.textContent };
  }, null);
  assert.equal(r.a.phase, 'siege');
  assert.ok(r.a.t > 119 && r.b.t < r.a.t - 2, `counting down ${r.a.t} -> ${r.b.t}`);
  assert.equal(r.c.phase, 'none');
});

test('when the clock runs out a van arrives, the squad gets out and gas forces you out of the building', async () => {
  const r = await g.run((H) => {
    H.swatReset();
    const { w, x, z } = (0, eval)(H.__intoShop)(H);
    H.G.lkp.x = x; H.G.lkp.z = z; H.G.lastSeenT = 0;
    H.updateSwat(1 / 30); H.SWT.t = 0.05;
    let minHp = 100, outAt = null, gassed = false;
    const hold = () => { if (!outAt) { H.player.x = x; H.player.z = z; H.player.vx = H.player.vz = 0; } };
    H.stepDt(30, 1 / 30, () => {
      hold(); minHp = Math.min(minHp, H.player.hp); if (H.SWT.gas) gassed = true;
      if (gassed && !outAt && H.player.hp < 80) outAt = H.G.elapsed; // "you leg it" once it hurts
      if (H.player.hp < 30) H.player.hp = 60;
    });
    const d = H.swatDebug(), sq = H.SWT.squad;
    return { d, n: sq.length, swat: sq.every((h) => h.swat && h.type === 'swat' && h.state === 'chase'), gassed, minHp, rect: w.rect, near: sq.filter((h) => Math.hypot(h.x - x, h.z - z) < 25).length };
  });
  assert.equal(r.d.phase, 'deployed');
  assert.ok(r.n >= 6, `squad of ${r.n}`);
  assert.ok(r.swat);
  assert.ok(r.gassed, 'they put pepper smoke in');
  assert.ok(r.minHp < 95, `the smoke and rifles hurt (min hp ${r.minHp})`);
  assert.ok(r.near >= 3, `squad closed in (${r.near} within 25m)`);
});

test('riot shields block hits from the front but not from behind', async () => {
  const r = await g.run((H) => {
    const h = H.SWT.squad[0] || H.SWK().makeSwat(H.player.x + 4, H.player.z);
    h.stun = 0;
    h.face = Math.atan2(H.player.x - h.x, H.player.z - h.z); // facing you
    const ux = (h.x - H.player.x), uz = (h.z - H.player.z), ul = Math.hypot(ux, uz);
    const hp0 = h.hp; h.damage(1, ux / ul, uz / ul, h.y + 1.2);
    const front = h.hp;
    h.stun = 0; h.face += Math.PI; // turned away
    h.damage(1, ux / ul, uz / ul, h.y + 1.2);
    return { hp0, front, back: h.hp };
  });
  assert.equal(r.front, r.hp0, 'shot off the shield');
  assert.ok(r.back < r.front, 'hit in the back');
});
