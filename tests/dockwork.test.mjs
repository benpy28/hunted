// Container lorries at the docks warehouses: one pulls up, the dockers unload it, you can lend a hand for $2
// a carton, help yourself, or hide in the back.
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
      H.player.vx = H.player.vz = H.player.vy = 0; H.player.hp = 90; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move'; H.player.hide = null; H.player.crouch = 0; H.input.crouch = false;
      H.G.heat = 0; H.G.level = 0; H.input.fwd = 0; H.input.side = 0; H.player.cash = 50; H.dockWork.reset();
    };
    H.goTo = (H, x, z, y) => { H.player.x = x; H.player.z = z; H.player.y = y ?? H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
  });
});
after(async () => { await g?.close(); });

test('a container lorry pulls up at a warehouse, the dockers unload it, and you earn $2 a carton', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const D = H.dockWork, K = H.TDK;
    const W = H.warehouses.find((w) => w.kind === 'racking'); const S0 = D.dwSite(W);
    H.goTo(H, S0.doorOut.x, S0.doorOut.z, 0); H.stepAt(H, 0.2);
    const J = D.dwNewJob(W, K); D.DW_STATE.jobs.push(J); D.DW_STATE.coolT = 999;
    H.stepAt(H, 15, 10, () => J.state === 'work');
    const arrived = J.state;
    // lend a hand
    H.goTo(H, J.S.stand.x, J.S.stand.z, 0); H.stepAt(H, 0.1);
    const t = H.XV.find((V) => V.name === 'dockwork').useTarget(K); H.useAction();
    const carrying = !!D.DW_STATE.carry;
    H.goTo(H, J.S.stack.x, J.S.stack.z, 0); H.stepAt(H, 0.1); const t2 = H.XV.find((V) => V.name === 'dockwork').useTarget(K); H.useAction();
    const paid = H.player.cash - 50;
    // the dockers finish it off, and the lorry goes
    H.goTo(H, J.S.doorOut.x + J.S.t.x * -8, J.S.doorOut.z + J.S.t.z * -8, 0);
    const done = H.stepAt(H, 120, 10, () => !D.DW_STATE.jobs.includes(J));
    return { site: !!S0, arrived, t: t && t.kind, carrying, t2: t2 && t2.kind, paid, carried: D.DW_STATE.carried, stack: J.stack, done };
  });
  assert.ok(s.site); assert.equal(s.arrived, 'work', 'parked and the doors open');
  assert.equal(s.t, 'carry'); assert.ok(s.carrying); assert.equal(s.t2, 'drop'); assert.equal(s.paid, 2); assert.equal(s.carried, 1);
  assert.equal(s.stack, 12, 'all twelve cartons end up on the stack'); assert.ok(s.done, 'the lorry drives off');
});

test('hiding in the back: when they shut up, they find you or drive you off up the road', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const D = H.dockWork, K = H.TDK;
    const W = H.warehouses.filter((w) => w.kind !== 'disused')[1];
    const S0 = D.dwSite(W); H.goTo(H, S0.doorOut.x, S0.doorOut.z, 0); H.stepAt(H, 0.2);
    const J = D.dwNewJob(W, K); D.DW_STATE.jobs.push(J); D.DW_STATE.coolT = 999; J.drive = 0; H.stepAt(H, 0.5);
    H.goTo(H, J.S.stand.x, J.S.stand.z, 0); H.stepAt(H, 0.1);
    H.input.jumpEdge = true; H.stepAt(H, 0.1);
    const hid = H.player.hide && H.player.hide.kind;
    const rnd = Math.random; Math.random = () => 0.9; // (not found)
    const x0 = H.player.hide ? H.player.hide.x : 0;
    H.stepAt(H, 120, 10, () => J.riding); Math.random = rnd;
    const riding = J.riding;
    H.stepAt(H, 30, 10, () => !H.player.hide);
    return { hid, riding, out: !H.player.hide, moved: Math.hypot(H.player.x - J.S.stand.x, H.player.z - J.S.stand.z), rides: D.DW_STATE.rides };
  });
  assert.equal(s.hid, 'lorryback', 'in the back of the container'); assert.ok(s.riding, 'they shut the doors with you inside');
  assert.ok(s.out, 'and let you out at the end'); assert.ok(s.moved > 25, `up the road (${s.moved.toFixed(0)} m)`); assert.equal(s.rides, 1);
});
