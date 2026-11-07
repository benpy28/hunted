// Away days at the Harriers: the away fans' coach, the walk round to the away end, the police on foot and
// on horseback, the wrong end, and everybody back on the coach at full time.
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
      for (const c of H.G.cars.filter((c) => c.kind === 'coach')) H.TDK.removeCar(c);
      H.player.vx = H.player.vz = 0; H.player.hp = 80; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move'; H.player.hide = null;
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false; H.input.fwd = 0;
      H.player.cash = 500; H.player.outfit = {}; H.player.disg = 0; H.G.day = 2; // a Saturday: Harriers at home
      Object.assign(H.AW_STATE, { inDay: 0, outDay: 0, lastAway: {}, warned: 0, wrongEnd: 0, wrongT: 0, boarded: 0, dropped: 0 });
      for (const Ho of H.awInternals.awHorses) Ho.warnT = 0;
    };
    H.goTo = (H, x, z) => { H.player.x = x; H.player.z = z; H.player.y = H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
  });
});
after(async () => { await g?.close(); });

test('match day: the away coach pulls up on Route 9, the fans walk round to the away end with a police escort, and go home on it at full time', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.goTo(H, 448, -12);
    const arrived = H.stepAt(H, 30, 13.4, () => H.AW_STATE.dropped >= 8);
    const D0 = H.awayDaysDebug(), cops = H.G.hunters.filter((h) => h.mdCop && !h.dead && h.type === 'cop').length;
    H.stepAt(H, 60, 14.8);
    const fans = H.G.hunters.filter((h) => h.awFan && !h.dead), inEnd = fans.filter((h) => H.inAwayEnd(h.x, h.z)).length;
    const F1 = fans.slice(0, 6).map((h) => `${h.x.toFixed(0)},${h.z.toFixed(0)} ${h.awFan} ${h.act ? h.act.kind + h.act.phase + h.act.ri : '-'} w${h.waitT.toFixed(1)} ${h.state} sus${h.sus.toFixed(1)}`);
    const lineCops = H.G.hunters.filter((h) => h.mdCop && h.mdCop.startsWith('line') && !h.dead && h.z < -80).length;
    // an away goal: their end goes up
    const R = H.mdInternals.matchRec(2); H.AW_STATE.lastAway[2] = R.away; const goals0 = H.AW_STATE.awayGoals; R.away++;
    H.stepAt(H, 3, 15.2, () => H.AW_STATE.awayGoals > goals0);
    const awayGoals = Math.min(1, H.AW_STATE.awayGoals - goals0);
    // full time: back to the coach
    const boarded = H.stepAt(H, 70, 16.7, () => H.AW_STATE.boarded >= 6);
    const left = H.stepAt(H, 40, 16.9, () => !H.G.cars.some((c) => c.kind === 'coach'));
    const DD = H.awayDaysDebug(), FF = H.G.hunters.filter((h) => h.awFan && !h.dead).slice(0, 4).map((h) => `${h.x.toFixed(0)},${h.z.toFixed(0)} ${h.awFan} ${h.act ? h.act.kind + h.act.phase + h.act.ri : '-'} w${h.waitT.toFixed(1)} ${h.state}`);
    return { F1, DD, FF, arrived, coach: D0.coaches, dropped: H.AW_STATE.dropped, horses: D0.horsesShown, cops, fans: fans.length, inEnd, lineCops, awayGoals, boarded, nBoarded: H.AW_STATE.boarded, left };
  });
  assert.ok(s.arrived, `the coach came and dropped the fans off (${s.dropped})`);
  assert.equal(s.horses, 2, 'two mounted officers outside the ground');
  assert.ok(s.cops >= 3, `${s.cops} police on duty`);
  assert.ok(s.inEnd >= 5, `${s.inEnd} of ${s.fans} away fans made it to the away end ${JSON.stringify(s.F1)}`);
  assert.ok(s.lineCops >= 1, 'police holding the line at the south end');
  assert.equal(s.awayGoals, 1);
  assert.ok(s.boarded, `away fans got back on the coach (${s.nBoarded}) ${JSON.stringify(s.DD)} ${JSON.stringify(s.FF)}`);
  assert.ok(s.left, `the coach drove off and left the road ${JSON.stringify(s.DD)}`);
});

test('the wrong end: a Harriers scarf among the away fans gets you noticed; the horses turn on anyone running', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.goTo(H, 448, -93);
    // a few away fans already in their end
    for (let i = 0; i < 6; i++) { const h = H.TDK.spawnCivAt(440 + i * 3, -93); if (h) { h.awFan = true; h.job = null; } }
    H.stepAt(H, 1, 15);
    const plain = H.TDK.G.conspic, kPlain = (() => { H.G.hour = 15; return H.conspicNow(); })();
    H.player.outfit = { face: 'md_scarf' };
    const warned = H.stepAt(H, 3, 15, () => H.AW_STATE.wrongEnd > 0);
    H.G.hour = 15; const kScarf = H.conspicNow();
    // now sprint about in front of a police horse
    const Ho = H.awInternals.awHorses[0]; H.player.outfit = {};
    H.goTo(H, Ho.x + 3, Ho.z - 6);
    H.input.sprint = true; H.input.fwd = 1;
    const told = H.stepAt(H, 6, 14.0, () => { H.player.x = Ho.x + 3; H.player.z = Ho.z - 6; return H.AW_STATE.warned > 0; });
    H.input.sprint = false; H.input.fwd = 0;
    return { warned, kPlain, kScarf, told, plain };
  });
  assert.ok(s.warned, 'the away fans spotted the home scarf');
  assert.ok(s.kScarf > s.kPlain, `home scarf in the away end (${s.kScarf}) stands out more than plain clothes (${s.kPlain})`);
  assert.ok(s.told, 'the mounted officer told you off for running');
});
