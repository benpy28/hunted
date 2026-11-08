// Pub games: the dartboard in every pub (scoring, a game against a regular) and the pool tables (the physics,
// pots, fouls, a whole game against a regular).
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
      H.player.vx = H.player.vz = H.player.vy = 0; H.player.hp = 90; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move'; H.player.hide = null; H.player.stam = 100;
      H.G.heat = 0; H.G.level = 0; H.input.fwd = 0; H.input.side = 0; H.player.cash = 100;
    };
    H.goTo = (H, x, z, y) => { H.player.x = x; H.player.z = z; H.player.y = y ?? H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 13, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
  });
});
after(async () => { await g?.close(); });

test('darts: boards in the pubs, the scoring, and a game against a regular', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const PG = H.pubGames, K = H.TDK, sc = PG.dartScore;
    const scores = [sc(0, 0.103).label, sc(0, 0.166).label, sc(0, 0.05).label, sc(0.0, 0.0).label, sc(0.01, 0.01).label, sc(0, -0.103).label, sc(0.103, 0).label, sc(0, 0.2).label];
    const Q = PG.pgPubs[0]; H.goTo(H, Q.oche.x, Q.oche.z, 0.21); H.stepAt(H, 0.3);
    const tgt = H.XV.find((V) => V.name === 'pubgames').useTarget(K);
    H.useAction(); const on = !!PG.PG_STATE.darts;
    // aim at the board: face it
    const B = Q.board; H.player.yaw = Math.atan2(-(B.x - H.player.x), -(B.z - H.player.z)); H.player.pitch = Math.atan2(1.73 - 1.65, Math.hypot(B.x - H.player.x, B.z - H.player.z));
    let guard = 0;
    while (PG.PG_STATE.darts && guard++ < 40) { if (PG.PG_STATE.darts.turn === 'you') H.useAction(); H.stepAt(H, 1.2); }
    return { scores, pubs: PG.pgPubs.length, tables: PG.pgPubs.filter((q) => q.table).length, tgt: tgt && tgt.kind, on, games: PG.PG_STATE.dartsGames, thrown: PG.PG_STATE.thrown, best: PG.PG_STATE.best, over: !PG.PG_STATE.darts, cash: H.player.cash };
  });
  assert.deepEqual(s.scores, ['T20', 'D20', '20', 'BULL', '25', 'T3', 'T6', 'MISS']);
  assert.ok(s.pubs >= 30, `${s.pubs} dartboards`); assert.ok(s.tables >= 10, `${s.tables} pool tables`);
  assert.equal(s.tgt, 'darts'); assert.ok(s.on); assert.equal(s.thrown, 9, 'three visits of three');
  assert.ok(s.best > 0, `you hit the board (${s.best})`); assert.ok(s.over, 'game over');
  assert.ok([97, 100, 103].includes(s.cash), `staked $3 (${s.cash})`);
});

test('pool: the rack, a break that moves the balls, pots, and the black ending the game', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const PG = H.pubGames, K = H.TDK;
    // the physics on its own: a straight shot into a corner pocket
    const balls = [{ u: 0, v: 0, kind: 'cue', vu: 0, vv: 0 }, { u: 0.3, v: 0.575, kind: 'red', vu: 0, vv: 0 }];
    const d = Math.hypot(0.6 - 0.3, 1.15 - 0.575), du = (0.6 - 0.3) / d, dv = (1.15 - 0.575) / d;
    const gu = 0.3 - du * 0.056, gv = 0.575 - dv * 0.056, al = Math.hypot(gu, gv); balls[0].vu = gu / al * 2; balls[0].vv = gv / al * 2;
    const potted = []; for (let i = 0; i < 2000; i++) potted.push(...PG.poolStep(balls, 1 / 240));
    const rack = PG.poolRack();
    // a real game
    const Q = PG.pgPubs.find((q) => q.table); const [x, z] = Q.F.toXZ(Q.table.ac - 1.0, Q.table.bc); H.goTo(H, x, z, 0.21); H.stepAt(H, 0.3);
    const tgt = H.XV.find((V) => V.name === 'pubgames').useTarget(K); H.useAction();
    const G = PG.PG_STATE.pool; const [cx, cz] = Q.F.toXZ(Q.table.ac, Q.table.bc + 0.6);
    H.stepAt(H, 0.2); H.player.yaw = Math.atan2(-(cx - H.player.x), -(cz - H.player.z)); G.t = Math.PI / 2.4; // full power
    H.useAction(); const moved0 = G.state;
    H.stepAt(H, 12, 13, () => G.state === 'aim');
    const spread = G.balls.slice(1).some((b) => Math.hypot(b.u - rack[G.balls.indexOf(b)].u, b.v - rack[G.balls.indexOf(b)].v) > 0.05);
    // clear the table for the yellows and let them sink the black
    for (const b of G.balls) if (b.kind === 'yellow') b.potted = true;
    G.turn = 'them'; G.state = 'aim'; G.waitT = 0.1; const blk = G.balls.find((b) => b.kind === 'black'); blk.u = 0.5; blk.v = 1.05; G.balls[0].u = 0.2; G.balls[0].v = 0.4; G.foeSkill = 0;
    H.stepAt(H, 15, 13, () => !PG.PG_STATE.pool);
    return { potted: potted.map((b) => b.kind), rack: rack.length, black: rack.filter((b) => b.kind === 'black').length, tgt: tgt && tgt.kind, moved0, spread, over: !PG.PG_STATE.pool, games: PG.PG_STATE.poolGames, won: PG.PG_STATE.poolWon, cash: H.player.cash };
  });
  assert.deepEqual(s.potted, ['red'], 'a straight pot into the corner');
  assert.equal(s.rack, 16); assert.equal(s.black, 1);
  assert.equal(s.tgt, 'pool'); assert.equal(s.moved0, 'roll'); assert.ok(s.spread, 'the break spreads the pack');
  assert.ok(s.over, 'the black ends it'); assert.equal(s.games, 1);
  assert.ok(s.won === 0 ? s.cash === 98 : s.cash === 102, `stake paid (${s.cash}, won ${s.won})`);
});
