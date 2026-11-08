// The quay crane unloading the cargo ship at SALTMARSH DOCKS (sign on, lash the boxes, don't stand under
// them), and Monday darts league night in the pubs (stand in as a ringer).
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
      H.G.heat = 0; H.G.level = 0; H.input.fwd = 0; H.input.side = 0; H.player.cash = 50; H.G.day = 1; H.G.hunterCarT = 99;
      H.quay.reset(); H.pubGames.reset();
    };
    H.goTo = (H, x, z, y) => { H.player.x = x; H.player.z = z; H.player.y = y ?? H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
    H.V = (n) => H.XV.find((V) => V.name === n);
  });
});
after(async () => { await g?.close(); });

test('the quay crane lifts boxes off the ship on to lorries; sign on and lash them for $3', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const Q = H.quay, S = Q.QY_STATE, K = H.TDK;
    H.goTo(H, Q.QY_X + 20, Q.QY_QZ - 10, 0); H.stepAt(H, 0.5, 10);
    const built = S.built, x = Q.QY_X;
    // watch one box come off
    const first = H.stepAt(H, 120, 10, () => S.state === 'lash');
    const onLorry = !!(S.lorry && S.lorry.box);
    H.stepAt(H, 40, 10, () => S.state === 'wait');
    const moved0 = S.moved;
    H.stepAt(H, 30, 10, () => S.moved > moved0);
    // sign on with the banksman
    const b = Q.debug(); const bp = { x: Q.QY_X + 7.5, z: Q.QY_QZ - 0.7 };
    H.goTo(H, bp.x - 1, bp.z, 0); H.stepAt(H, 0.1, 10);
    H.G.hour = 10; const t = H.V('quay').useTarget(K); if (t) H.V('quay').use(t, K);
    const shift = S.shiftDay === H.G.day, conspic = H.V('quay').conspic(K);
    // stand by the lorry and lash the next one
    H.goTo(H, Q.QY_X - 4.5, Q.QY_LZ - 2.4, 0);
    const lash = H.stepAt(H, 150, 10, () => S.state === 'lash' && S.lorry && Math.abs(H.player.x - S.lorryX) < 6);
    H.G.hour = 10; const t2 = H.V('quay').useTarget(K); if (t2) H.V('quay').use(t2, K);
    return { built, x, first, onLorry, moved: S.moved, t: t && t.kind, shift, conspic, lash, t2: t2 && t2.kind, lashed: S.lashed, cash: H.player.cash, dbg: b };
  });
  assert.ok(s.built); assert.equal(s.x, 59);
  assert.ok(s.first, 'a box comes down on to the lorry'); assert.ok(s.onLorry);
  assert.ok(s.moved >= 1, 'and the lorry takes it away');
  assert.equal(s.t, 'banks'); assert.ok(s.shift, 'signed on'); assert.ok(s.conspic < -0.2, 'hi-vis on the quay');
  assert.ok(s.lash, 'the next box is down'); assert.equal(s.t2, 'lash'); assert.equal(s.lashed, 1); assert.equal(s.cash, 53);
});

test('the crane will not lower a box on to you: it stops, sounds the horn, and the banksman shouts', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const Q = H.quay, S = Q.QY_STATE;
    H.goTo(H, Q.QY_X + 20, Q.QY_QZ - 10, 0); H.stepAt(H, 0.5, 10);
    H.stepAt(H, 150, 10, () => S.state === 'lower');
    H.goTo(H, Q.QY_X + 1, Q.QY_LZ, 0);
    const y0 = S.sy; H.stepAt(H, 5, 10);
    const held = S.state === 'lower', y1 = S.sy, horn = S.horn;
    H.goTo(H, Q.QY_X + 20, Q.QY_QZ - 10, 0);
    const down = H.stepAt(H, 30, 10, () => S.state === 'lash');
    return { held, dy: y0 - y1, horn, down };
  });
  assert.ok(s.held, 'still hanging'); assert.ok(s.dy < 1.5, `barely moved (${s.dy})`); assert.ok(s.horn >= 1, 'the horn');
  assert.ok(s.down, 'carries on once you move');
});

test('Monday is darts league night: a crowd round the oche, and you can play as their ringer for $15', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const PG = H.pubGames, K = H.TDK;
    H.G.day = 4; // a Monday
    const Q = PG.pgPubs.find((q) => q.table) || PG.pgPubs[0];
    H.goTo(H, Q.oche.x, Q.oche.z, 0.21); H.stepAt(H, 0.5, 20);
    H.G.hour = 20; const on = PG.pgLeagueOn(K), crowd = !!PG.PG_STATE.crowd;
    const t = H.V('pubgames').useTarget(K);
    const cash0 = H.player.cash; if (t) H.V('pubgames').use(t, K);
    const D = PG.PG_STATE.darts, league = !!(D && D.league), free = H.player.cash === cash0;
    // fix the result: three perfect visits for you
    D.you = [[{ pts: 60 }, { pts: 60 }, { pts: 60 }], [{ pts: 60 }, { pts: 60 }, { pts: 60 }], [{ pts: 60 }, { pts: 60 }, { pts: 60 }]]; D.them = [[{ pts: 20 }], [{ pts: 20 }], [{ pts: 20 }]];
    PG.pgEndDarts(K, false);
    const won = H.player.cash - cash0;
    H.G.day = 2; H.stepAt(H, 0.5, 20); H.G.hour = 20;
    const off = !PG.PG_STATE.crowd && H.V('pubgames').useTarget(K)?.kind;
    return { on, crowd, t: t && t.kind, league, free, won, leagueWon: PG.PG_STATE.leagueWon, off, cal: H.eventsOn(4).some((E) => E.id === 'darts') };
  });
  assert.ok(s.on); assert.ok(s.crowd, 'a crowd round the board'); assert.equal(s.t, 'league');
  assert.ok(s.league); assert.ok(s.free, 'no stake for a ringer'); assert.equal(s.won, 15); assert.equal(s.leagueWon, 1);
  assert.equal(s.off, 'darts', 'an ordinary night again'); assert.ok(s.cal);
});
