// County Rail, part two: hopping the freight at the red signal, delays, the Wednesday strike with its picket
// line, and the platform cafes.
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
      const R = H.railway;
      if (R.RW_STATE.ride) R.rwGetOff(H.TDK);
      if (R.RW_STATE.fride) R.rwJumpFreight(H.TDK, true);
      H.player.vx = H.player.vz = H.player.vy = 0; H.player.hp = 90; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move'; H.player.hide = null;
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false; H.input.fwd = 0; H.input.side = 0;
      H.player.cash = 100; H.player.outfit = {}; H.player.disg = 0; H.G.day = 1; R.RW_STATE.ticket = null; R.RW_STATE.delayP = 0;
      H.G.hunterCarT = 99;
    };
    H.goTo = (H, x, z, y) => { H.player.x = x; H.player.z = z; H.player.y = y ?? H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
    H.rail = () => H.XV.find((V) => V.name === 'railway');
  });
});
after(async () => { await g?.close(); });

test('the freight stops at the red signal; climb on a flat wagon, ride it, and jump off', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const R = H.railway, K = H.TDK, T = R.rwFreight;
    H.goTo(H, R.RW_SIG_X - 80, -273, 0); H.stepAt(H, 0.2, 22);
    // bring an eastbound freight in from the west, set to stop at the signal
    T.state = 'tunnel'; T.waitT = 0; T.dir = -1; H.stepAt(H, 0.1, 22); // (it flips to eastbound as it leaves the tunnel)
    T.x = R.rwSigStopX(T) - 120; T.v = 15; T.sigStop = true;
    const held = H.stepAt(H, 40, 22, () => T.state === 'held');
    const noseAt = T.x + T.dir * T.len;
    T.heldT = 999;
    const fx = R.rwFlatXs(T)[1];
    H.goTo(H, fx, -273.2, 0); H.stepAt(H, 0.2, 22);
    const t = H.rail().useTarget(K);
    H.useAction(); H.stepAt(H, 0.5, 22);
    const on = !!R.RW_STATE.fride, y = H.player.y, conspic = H.rail().conspic(K);
    // the signal goes green and off it goes
    T.heldT = 0; H.stepAt(H, 6, 22);
    const rolled = H.player.x - fx, moving = T.v;
    const t2 = H.rail().useTarget(K);
    const hp0 = H.player.hp; H.useAction(); H.stepAt(H, 0.5, 22);
    return { held, noseAt, sig: R.RW_SIG_X, t: t && t.kind, on, y, conspic, rolled, moving, t2: t2 && t2.kind, off: !R.RW_STATE.fride, hurt: hp0 - H.player.hp, z: H.player.z, alive: H.player.alive };
  });
  assert.ok(s.held, 'the freight waits at the signal');
  assert.ok(Math.abs(s.noseAt - (s.sig - 4)) < 2, `nose at the signal (${s.noseAt})`);
  assert.equal(s.t, 'hopfreight'); assert.ok(s.on, 'riding the wagon'); assert.ok(s.y > 1, 'up on the deck');
  assert.ok(s.conspic < -0.3, 'lying flat is low-key');
  assert.ok(s.rolled > 5, `carried along (${s.rolled})`); assert.ok(s.moving > 2);
  assert.equal(s.t2, 'jumpfreight'); assert.ok(s.off, 'jumped off');
  assert.ok(Math.abs(s.z + 273) < 0.5, 'lands beside the line, between the tracks'); assert.ok(s.alive);
});

test('ride the freight too long and you have to bail out before the tunnel', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const R = H.railway, K = H.TDK, T = R.rwFreight;
    T.state = 'run'; T.dir = 1; T.x = 700; T.v = 0.5; T.sigStop = false;
    const fx = R.rwFlatXs(T)[0];
    H.goTo(H, fx, -273.2, 0); H.stepAt(H, 0.1, 23);
    R.rwHopFreight(fx, K);
    const done = H.stepAt(H, 60, 23, () => !R.RW_STATE.fride);
    return { done, x: H.player.x, x1: R.RW_X1, tumbles: R.RW_STATE.tumbles };
  }).catch((e) => ({ err: String(e) }));
  assert.ok(!s.err, s.err);
  assert.ok(s.done, 'thrown off'); assert.ok(s.x < s.x1, 'before the tunnel mouth');
});

test('delays hold the train in the station and the board says so', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const R = H.railway, T = R.rwPax, S = R.RW_STATIONS[0];
    H.goTo(H, 0, -250, 0); H.stepAt(H, 0.5, 10);
    R.RW_STATE.delayP = 1;
    T.dir = 1; T.x = S.x - 30; T.v = 6; T.state = 'run'; T.served = null;
    H.stepAt(H, 12, 10, () => T.state === 'dwell');
    const dwell = T.dwellT, why = T.delayed;
    S.boardT = 0; H.stepAt(H, 1.2, 10);
    R.RW_STATE.delayP = 0;
    return { dwell, why, delays: R.RW_STATE.delays };
  });
  assert.ok(s.dwell > 25, `held longer (${s.dwell})`); assert.ok(s.why, 'with a reason'); assert.ok(s.delays >= 1);
});

test('Wednesday is a rail strike: no trains, gates open, a picket line with tea and a petition', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const R = H.railway, K = H.TDK, T = R.rwPax, S = R.RW_STATIONS[0];
    H.G.day = 6; // a Wednesday
    const strike = R.rwStrikeDay(6), notFri = R.rwStrikeDay(1);
    T.state = 'tunnel'; T.waitT = 0; T.x = R.RW_X0 - 60;
    H.goTo(H, S.x + 9 + 3.6, -240.2, 0); H.stepAt(H, 3, 10);
    const stillIn = T.state === 'tunnel';
    const gatesOpen = S.gates.every((Gt) => Gt.c.h === 0);
    const picket = !!S.picket && S.picket.g.visible;
    const t = H.rail().useTarget(K); const hp0 = H.player.hp; if (t && t.kind === 'picket') H.rail().use(t, K);
    const conspic = H.rail().conspic(K);
    const cal = H.eventsOn(6).some((E) => E.id === 'strike');
    H.G.day = 7; H.stepAt(H, 0.5, 10);
    const gone = !S.picket.g.visible;
    return { strike, notFri, stillIn, gatesOpen, picket, t: t && t.kind, healed: H.player.hp - hp0, petitions: R.RW_STATE.petitions, conspic, cal, gone };
  });
  assert.ok(s.strike); assert.ok(!s.notFri);
  assert.ok(s.stillIn, 'no passenger trains'); assert.ok(s.gatesOpen, 'nobody minding the barriers');
  assert.ok(s.picket, 'pickets out front'); assert.equal(s.t, 'picket'); assert.ok(s.healed > 0, 'a tea from the urn'); assert.equal(s.petitions, 1);
  assert.ok(s.conspic < 0, 'one of the strikers'); assert.ok(s.cal, 'on the calendar'); assert.ok(s.gone, 'packed up on Thursday');
});

test('the platform cafe: through the barriers, tea and a bacon roll', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const R = H.railway, K = H.TDK, S = R.RW_STATIONS[2];
    H.goTo(H, S.cafe.x, -255.4, 0); H.stepAt(H, 0.5, 9);
    const t = H.rail().useTarget(K);
    const m = R.rwCafeMenu(K); H.player.hp = 50;
    const msg = m.buy(m.items().find((i) => i.id === 'rw_bacon'));
    const late = (H.G.hour = 22, H.rail().usePrompt({ kind: 'cafe', S }, K, 'E'));
    return { t: t && t.kind, msg, hp: H.player.hp, cash: H.player.cash, server: !!S.cafe.server, conspic: (H.G.hour = 9, H.rail().conspic(K)), late };
  });
  assert.equal(s.t, 'cafe'); assert.equal(s.hp, 72); assert.equal(s.cash, 97); assert.ok(s.server);
  assert.ok(s.conspic < 0); assert.match(s.late, /shut/);
});
