// The leisure park and the pub telly: football on the TVs in every pub, the GUTTERBALL bowling alley (real
// pins, real scoring), and HALDEN BATHS (swimming, ducking under, the lifeguard).
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
      if (H.player.hide) H.leaveHide(H.SK);
      for (const V of H.XV) V.reset(H.TDK);
      H.player.vx = H.player.vz = H.player.vy = 0; H.player.hp = 80; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move'; H.player.hide = null;
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false; H.input.fwd = 0; H.input.side = 0; H.input.jumpEdge = false;
      H.player.cash = 500; H.player.outfit = {}; H.player.disg = 0; H.G.day = 1;
    };
    H.goTo = (H, x, z, y) => { H.player.x = x; H.player.z = z; H.player.y = y ?? H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
  });
});
after(async () => { await g?.close(); });

test('the pub telly: the Harriers live with the real score, county league on other nights, the news in between, and a pub full of people watching', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const T = H.pubTV;
    // Saturday (day 2) the Harriers are at home at 2:30; Wednesday (day 6) there's a county game at 7:30
    const sat = T.tvNow(2, 15), wed = T.tvNow(6, 21), none = T.tvNow(3, 11);
    H.MD_STATE.matches[2] = H.MD_STATE.matches[2] || { home: 0, away: 0, goals: [] }; H.MD_STATE.matches[2].home = 2; H.MD_STATE.matches[2].away = 1;
    const live = T.tvNow(2, 15);
    // stand in a pub during the Wednesday game
    const Q = T.pubs[0]; H.G.day = 6;
    H.goTo(H, Q.spots[0].x, Q.spots[0].z, 0.21);
    H.stepAt(H, 12, 21);
    const folk = H.G.hunters.filter((h) => !h.dead && h.ptv === Q);
    const watching = folk.filter((h) => h.act && h.act.kind === 'watch' && h.act.phase === 'do');
    H.G.hour = 21; const k = H.conspicNow();
    const mat = Q.scr.material === T.ptMat;
    H.G.day = 3; H.stepAt(H, 0.5, 11); const news = Q.scr.material !== T.ptMat;
    return { pubs: T.pubs.length, sat: sat && sat.harriers, wed: wed && !wed.harriers && wed.phase, none, live: live && [live.hs, live.as], folk: folk.length, watching: watching.length, k, mat, news, inPub: !!T.pubAt(H.player.x, H.player.z) };
  });
  assert.ok(s.pubs >= 10, `${s.pubs} pubs with a telly`);
  assert.ok(s.sat, 'Saturday afternoon: the Harriers live');
  assert.equal(s.wed, 'second', 'Wednesday night: a county league game');
  assert.equal(s.none, null, 'no football on a Sunday morning');
  assert.deepEqual(s.live, [2, 1], 'the telly shows the score from the ground');
  assert.ok(s.inPub, 'stood in the pub');
  assert.ok(s.folk >= 3 && s.watching >= 2, `${s.folk} in for the game, ${s.watching} watching`);
  assert.ok(s.mat && s.news, 'football on the telly during the game, the news otherwise');
  assert.ok(s.k < 0.05, `nobody's looking at you with the match on (${s.k})`);
});

test('a goal on the telly: the pub goes up, and for a moment you vanish', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const T = H.pubTV, Q = T.pubs[1]; H.G.day = 6;
    H.goTo(H, Q.spots[0].x, Q.spots[0].z, 0.21);
    const g0 = T.ptGame(6, 19.5); g0.goals.length = 0; g0.goals.push({ min: 30, home: true });
    const h28 = 19.5 + 0.9 * 28 / 45, h32 = 19.5 + 0.9 * 32 / 45;
    H.stepAt(H, 4, h28); // the 28th minute: nil-nil
    const before = T.tvNow(6, h28);
    H.stepAt(H, 1, h32); // the 32nd minute: 1-0
    const after = T.tvNow(6, h32);
    return { before: before.hs + before.as, after: after.hs, seen: T.PTV_STATE.goalsSeen, celeb: T.PTV_STATE.celebT };
  });
  assert.equal(s.before, 0); assert.equal(s.after, 1);
  assert.equal(s.seen, 1, 'you saw the goal go in');
  assert.ok(s.celeb > 0, 'the pub is celebrating');
});

test('GUTTERBALL LANES: the building, the lanes, the pins, and the scoring adds up like the real thing', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.bowling, A = B.alley;
    const sc = (r) => { const out = B.bwScore(r); return out[out.length - 1]; };
    return {
      built: A.built, lanes: A.lanes.length, pins: A.lanes.every((L) => L.pins.length === 10),
      walls: !!H.solidAt(A.x0 - 0.15, 2, 280, 0) && !!H.solidAt(-60, 2, A.z1 + 0.15, 0),
      door: !H.pointBlocked(A.x1, 282, 0.3),
      allStrikes: sc([10, 10, 10, 10, 10, 10, 10]), spares: sc([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), plain: sc([3, 4, 3, 4, 3, 4, 3, 4, 3, 4]), oneStrike: sc([10, 3, 4, 0, 0, 0, 0, 0, 0]),
      pending: B.bwScore([10, 3]).at(-1),
    };
  });
  assert.ok(s.built); assert.equal(s.lanes, 8); assert.ok(s.pins, 'ten pins a lane');
  assert.ok(s.walls, 'solid walls'); assert.ok(s.door, 'the door is open');
  assert.equal(s.allStrikes, 150, 'five frames of strikes (and two bonus balls) is a perfect 150');
  assert.equal(s.spares, 75); assert.equal(s.plain, 35); assert.equal(s.oneStrike, 24);
  assert.equal(s.pending, null, 'a strike waits for its bonus balls');
});

test('bowling: hire a lane, step up, aim and let it go; straight down the middle knocks pins flying and the screen keeps score', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.bowling, A = B.alley, K = H.TDK; H.G.hour = 12;
    H.goTo(H, A.desk.x, A.desk.z, 0);
    const T = B.useTarget(K);
    const menu = B.bwDeskMenu(K), cash0 = H.player.cash, msg = menu.buy(menu.items()[0]);
    const L = B.BW_STATE.lane;
    // walk to the approach and step up
    H.goTo(H, -62, L.z, 0.03);
    const step = B.useTarget(K); B.use(step, K);
    const aiming = !!B.BW_STATE.aim;
    H.stepAt(H, 0.3, 12); const held = Math.abs(H.player.x - (A.FX + 0.6)) < 0.05;
    H.player.yaw = Math.PI / 2; B.BW_STATE.aim.dz = 0; B.BW_STATE.aim.lastSide = 0;
    const rel = B.useTarget(K); B.use(rel, K);
    const rolling = L.state === 'rolling';
    H.stepAt(H, 6, 12, () => L.rolls.length > 0);
    const first = L.rolls[0];
    return { T: T && T.kind, paid: cash0 - H.player.cash, msg, lane: L.i, step: step && step.kind, aiming, held, rel: rel && rel.kind, rolling, first, frame: L.frame, b: L.b, rolls: B.BW_STATE.rolls };
  });
  assert.equal(s.T, 'desk'); assert.equal(s.paid, 4); assert.match(s.msg, /LANE \d/);
  assert.equal(s.step, 'step'); assert.ok(s.aiming, 'stepped up to the line'); assert.ok(s.held, 'held at the line while aiming');
  assert.equal(s.rel, 'release'); assert.ok(s.rolling, 'the ball is rolling');
  assert.ok(s.first >= 5, `straight down the middle knocked down ${s.first} pins`);
  assert.equal(s.rolls, 1, 'counted as your bowl');
  assert.ok(s.first === 10 ? s.frame === 1 : s.b === 1, 'the frame moves on properly');
});

test('bowling: a gutter ball knocks nothing down; the other lanes have parties bowling for themselves; walk on the lanes and you get told', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.bowling, A = B.alley, K = H.TDK, L = A.lanes[7];
    L.owner = 'test'; L.rolls = []; L.frame = 0; L.b = 0; L.state = 'idle'; B.bwResetPins(L, true);
    H.goTo(H, -60, 282, 0);
    B.bwRelease(L, 0.44, -0.03, 8.5, 0.2, null);
    H.stepAt(H, 6, 15, () => L.rolls.length > 0);
    const gutter = L.rolls[0];
    // parties turn up when it's open
    H.stepAt(H, 30, 19);
    const parties = A.lanes.filter((q) => q.owner === 'npc').length, npcRolls = B.BW_STATE.npcRolls;
    const bowlers = H.G.hunters.filter((h) => !h.dead && h.bwLane != null).length;
    // and down the lane you go
    H.goTo(H, -75, A.lanes[2].z, 0.03); const w0 = B.BW_STATE.warned;
    H.stepAt(H, 0.5, 19);
    return { gutter, parties, npcRolls, bowlers, warned: B.BW_STATE.warned - w0 };
  });
  assert.equal(s.gutter, 0, 'in the gutter, nothing down');
  assert.ok(s.parties >= 2, `${s.parties} parties on the lanes`);
  assert.ok(s.bowlers >= 2, `${s.bowlers} bowlers`);
  assert.ok(s.npcRolls >= 1, `the parties bowl (${s.npcRolls})`);
  assert.equal(s.warned, 1, 'OFF THE LANES!');
});

test('HALDEN BATHS: pay, get in, swim, duck under where nobody can see you, run out of breath, climb out wet', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const Bt = H.baths, B = Bt.bathsB, K = H.TDK;
    const deckY = H.floorAt(-70, 335, 1.5), poolY = H.floorAt(-77, 352, 0.5), learnerY = H.floorAt(-74, 370, 1.0);
    H.goTo(H, B.desk.x, B.desk.z, 0);
    const T = Bt.useTarget(K), menu = Bt.btDeskMenu(K); menu.buy(menu.items()[0]); menu.buy(menu.items()[1]);
    // into the deep middle of the pool
    H.goTo(H, -77, 352, 0); H.player.yaw = Math.PI / 2;
    H.stepAt(H, 0.3, 12); const swim = Bt.BT_STATE.swim;
    const x0 = H.player.x; H.input.fwd = 1; H.stepAt(H, 1, 12); H.input.fwd = 0; const moved = x0 - H.player.x;
    const k = H.conspicNow();
    // a hunter right by the side, looking straight at you; then duck under
    const h = new H.Hunter(-72, 340, 'civ', false, 'search'); H.G.hunters.push(h); h.y = 1.2;
    H.input.crouch = true; H.stepAt(H, 0.5, 12); const under = Bt.BT_STATE.under, unseen = Bt.unseen(h);
    H.stepAt(H, 16, 12); const gasped = Bt.BT_STATE.gasps > 0 && !Bt.BT_STATE.under;
    H.input.crouch = false;
    // out by the steps at the shallow end: swim to the corner, walk up
    H.goTo(H, -63.2, 344, 0.6); H.player.yaw = -Math.PI / 2; H.input.fwd = 1; H.stepAt(H, 2.5, 12); H.input.fwd = 0;
    const out = !Bt.BT_STATE.swim && H.player.y > 1.1, wet = Bt.BT_STATE.wetT > 0;
    return { deckY, poolY, learnerY, T: T && T.kind, paid: Bt.BT_STATE.paidDay, cap: H.player.outfit.head, swim, moved, k, under, unseen, gasped, out, wet, y: H.player.y };
  });
  assert.ok(Math.abs(s.deckY - 1.2) < 0.05, `the poolside is raised (${s.deckY})`); assert.ok(s.poolY < 0.1, `the pool floor is down at the bottom (${s.poolY})`); assert.ok(Math.abs(s.learnerY - 0.6) < 0.05, 'the learner pool is shallow');
  assert.equal(s.T, 'desk'); assert.equal(s.paid, 1); assert.equal(s.cap, 'bt_cap');
  assert.ok(s.swim, 'swimming'); assert.ok(s.moved > 1 && s.moved < 3.2, `swimming is slower than walking (${s.moved.toFixed(2)} m in 1 s)`);
  assert.ok(s.k < 0.05, `a swimmer in a cap is nobody (${s.k})`);
  assert.ok(s.under && s.unseen, 'under the water nobody can see you');
  assert.ok(s.gasped, 'you can\'t stay under forever');
  assert.ok(s.out, `out up the steps (y ${s.y})`); assert.ok(s.wet, 'dripping wet');
});

test('the baths: the lifeguard blows her whistle at you for running on the side', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const Bt = H.baths, K = H.TDK;
    H.goTo(H, -70, 335, 1.2); H.player.yaw = -Math.PI / 2;
    H.stepAt(H, 0.5, 12);
    const w0 = Bt.BT_STATE.warned;
    H.input.fwd = 1; H.input.sprint = true; H.stepAt(H, 1.5, 12, () => Bt.BT_STATE.warned > w0); H.input.fwd = 0; H.input.sprint = false;
    return { warned: Bt.BT_STATE.warned - w0 };
  });
  assert.equal(s.warned, 1, 'NO RUNNING!');
});
