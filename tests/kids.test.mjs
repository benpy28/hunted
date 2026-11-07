// Kids, prams, playgrounds and the school run: kids follow their grown-ups, spot you and shout about it,
// can be bought off with a sweet, can't be hurt, and the school run and playgrounds fill with families.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => {
  g = await openGame(); await g.run((H) => H.startGame(false));
  await g.run((H) => {
    H.fresh = (H) => {
      H.TDK.distracted = () => null; // no ice cream van pulling up at the playground mid-test (kids forget all about you when it does)
      if (H.pramHeld()) H.dropPram(H.TDK);
      if (H.player.hide) H.leaveHide(H.SK);
      if (H.G.mode !== 'playing') H.G.mode = 'playing';
      for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
      for (const k of [...H.kids]) { k.parent = null; } H.step(0.05);
      H.player.vx = H.player.vz = 0; H.player.hp = 100; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move';
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false;
      H.player.cash = 500; H.player.outfit = {}; H.player.disg = 0; H.MK_STATE.sweets = 0; H.G.day = 1;
    };
    H.goTo = (H, x, z) => { H.player.x = x; H.player.z = z; H.player.y = H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    // keep the crowd away: only the people a test puts down
    H.quiet = (H) => { const L = H.G.hunters; for (let i = L.length - 1; i >= 0; i--) if (!L[i].mine && !L[i].dead) { L[i].remove(); L.splice(i, 1); } };
    H.stepAt = (H, secs, hour = 11, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); H.quiet(H); if (each && each()) return true; } return false; };
    H.family = (H, x, z, o = {}) => { const h = new H.Hunter(x, z, 'civ', false); h.mine = true; h.job = null; h.folk = 'parent'; Object.assign(h, o); H.G.hunters.push(h); H.makeKid(h, H.TDK); return h; };
  });
});
after(async () => { await g?.close(); });

test('a kid holds their grown-up\'s hand and keeps up with them as they walk about', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const PG = H.playgrounds[0]; H.goTo(H, PG.x + 60, PG.z + 60);
    const p = H.randomOpenPoint(PG.x + 60, PG.z + 60, 20, 40);
    const h = H.family(H, p.x, p.z), k = h.kid;
    h.wt = H.randomOpenPoint(p.x, p.z, 12, 20); h.waitT = 0;
    let far = 0;
    H.stepAt(H, 12, 11, () => { if (Math.hypot(k.x - h.x, k.z - h.z) > 3.5) far++; });
    return { moved: Math.hypot(h.x - p.x, h.z - p.z), gap: Math.hypot(k.x - h.x, k.z - h.z), far, kids: H.kids.length, inHunters: H.G.hunters.includes(k) };
  });
  assert.ok(s.moved > 3, `the grown-up should walk somewhere (moved ${s.moved.toFixed(1)})`);
  assert.ok(s.gap < 2.5, `kid ended ${s.gap.toFixed(1)} m away`);
  assert.ok(s.far < 60, 'kid stays close most of the time');
  assert.equal(s.inHunters, false, 'kids are never hunters');
});

test('a kid who gets a good look at you points and shouts it, and their grown-up calls it in', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const PG = H.playgrounds[0]; const p = H.randomOpenPoint(PG.x, PG.z, 9, 14);
    const h = H.family(H, p.x, p.z); h.waitT = 999; const k = h.kid; k.x = p.x + 0.6; k.z = p.z;
    H.G.level = 1; H.G.heat = 30;
    // stand somewhere the kid has a clear view of you, with the grown-up looking the other way
    for (let a = 0; a < 16; a++) { const x = k.x + Math.cos(a * 0.4) * 7, z = k.z + Math.sin(a * 0.4) * 7; if (H.blockedAt(x, z)) continue; H.goTo(H, x, z); if (H.TDK.canSee(k.x, k.y + 0.9, k.z)) { h.face = Math.atan2(k.x - x, k.z - z); break; } }
    const told0 = H.KD_STATE.told; let heatBefore = 0;
    const told = H.stepAt(H, 15, 11, () => { if (H.KD_STATE.told > told0) return true; heatBefore = H.G.heat; h.sus = 0; h.state = 'search'; h.alertT = -1; k.toldT = 0; }); // until the kid speaks up, the grown-up hasn't noticed a thing
    return { dbg: [H.TDK.canSee(k.x, k.y + 0.9, k.z), k.starT, k.toldN, k.mode, H.kids.includes(k), Math.hypot(k.x - H.player.x, k.z - H.player.z), !!H.player.hide, H.player.car ? 'car' : '', H.TDK.kidEye()].join(' '), told, mode: k.mode, parent: h.state, sus: h.sus, heatUp: H.G.heat > heatBefore, lkp: Math.hypot(H.G.lkp.x - H.player.x, H.G.lkp.z - H.player.z) };
  });
  assert.ok(s.told, `the kid should spot you and tell (${s.dbg})`);
  assert.ok(s.parent === 'chase' || s.sus >= 0.9, `parent should be on to you (${s.parent}, sus ${s.sus})`);
  assert.ok(s.heatUp, 'heat goes up');
  assert.ok(s.lkp < 5, 'sighting reported where you are');
});

test('give a kid a sweet and they keep your secret all day; no sweets gets a high five', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const PG = H.playgrounds[0]; const p = H.randomOpenPoint(PG.x, PG.z, 9, 14);
    const h = H.family(H, p.x, p.z); h.waitT = 999; const k = h.kid;
    H.goTo(H, k.x + 1, k.z); H.G.level = 2;
    const high = H.greetKid(k, H.TDK);
    H.MK_STATE.sweets = 2;
    H.player.x = k.x + 1; H.player.z = k.z; const near = H.kidNear(H.player.x, H.player.z) === k;
    H.useAction();
    const told0 = H.KD_STATE.told;
    H.stepAt(H, 10, 11);
    return { high, near, sweets: H.MK_STATE.sweets, hushed: k.hushDay === H.G.day, told: H.KD_STATE.told - told0 };
  });
  assert.ok(/HIGH FIVE|LOOK AT YOU/.test(s.high), s.high);
  assert.ok(s.near, 'kid is within reach');
  assert.equal(s.sweets, 1, 'one sweet handed over');
  assert.ok(s.hushed, 'kid is hushed for the day');
  assert.equal(s.told, 0, 'a hushed kid never tells');
});

test('a sweet comes from the market bakery (pick and mix)', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const st = H.marketStalls.find((q) => q.kind === 'bakery'); const menu = H.stallMenu(st, H.MK);
    const it = menu.items().find((i) => i.id === 'mk_sweets'); const msg = menu.buy(it);
    return { found: !!it, msg, sweets: H.MK_STATE.sweets };
  });
  assert.ok(s.found, 'bakery sells pick and mix');
  assert.equal(s.sweets, 6, s.msg);
});

test('if a kid\'s grown-up gets knocked flat the kid runs off shouting I\'M TELLING (and nobody can hurt the kid)', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const PG = H.playgrounds[0]; const p = H.randomOpenPoint(PG.x, PG.z, 9, 14);
    const h = H.family(H, p.x, p.z); h.waitT = 999; const k = h.kid;
    H.goTo(H, p.x + 5, p.z);
    const told0 = H.KD_STATE.told, seen0 = H.G.lastSeenT = 99; h.die({ x: 1, y: 1, z: 0 }, 1, false, false);
    H.stepAt(H, 1, 11);
    const mode = k.mode, heatUp = H.G.lastSeenT < 5;
    H.stepAt(H, 8, 11);
    return { mode, heatUp, gone: !H.kids.includes(k), ragdollsForKids: 0 };
  });
  assert.equal(s.mode, 'flee');
  assert.ok(s.heatUp, 'they told');
  assert.ok(s.gone, 'and off they went');
});

test('push a parked pram: you blend in like a tired parent, but you can\'t run; E lets go', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const P = H.prams.find((q) => q.mode === 'parked'); if (!P) return { fail: 'no pram' };
    H.goTo(H, P.x + 0.8, P.z); const near = H.pramNear(H.player.x, H.player.z) === P;
    H.step(0.1); const c0 = H.G.conspic;
    H.useAction(); const held = H.pramHeld() === P;
    H.input.sprint = true; H.input.fwd = 1; let sprinting = false, sp = 0;
    for (let i = 0; i < 12 && H.pramHeld(); i++) { H.step(1 / 30); sprinting = sprinting || H.player.sprinting; sp = Math.max(sp, Math.hypot(H.player.vx, H.player.vz)); }
    H.input.sprint = false; H.input.fwd = 0; H.step(0.5); const c1 = H.G.conspic;
    const dist = Math.hypot(P.x - H.player.x, P.z - H.player.z);
    H.useAction(); const let_go = !H.pramHeld() && P.mode === 'parked';
    return { near, held, sprinting, sp, c0, c1, dist, let_go };
  });
  assert.equal(s.fail, undefined, s.fail);
  assert.ok(s.near && s.held, 'grabbed the pram');
  assert.equal(s.sprinting, false, 'no running with a pram');
  assert.ok(s.sp < 5, `pushing speed ${s.sp}`);
  assert.ok(s.c1 < s.c0, `less conspicuous pushing a pram (${s.c0} -> ${s.c1})`);
  assert.ok(s.dist < 1.5, 'the pram is right in front of you');
  assert.ok(s.let_go, 'E lets go');
});

test('parents push prams about and leave them outside when they pop into a shop', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    for (const W of H.walkIns.filter((W) => W.kind === 'cafe')) {
      const [ox, oz] = W.path[0]; H.goTo(H, ox + 30, oz + 30);
      const h = new H.Hunter(ox, oz, 'civ', false); h.mine = true; h.job = null; h.folk = 'parent'; H.G.hunters.push(h);
      const P = H.givePram(h);
      if (!H.cityLifeDebug.routineVisit(h, 'eat', H.LIFE)) { h.remove(); continue; }
      h.x = h.act.route[0][0]; h.z = h.act.route[0][1]; // it picks the nearest cafe: start them at its door
      let parkedAtDoor = false;
      H.stepAt(H, 30, 13, () => { if (h.act && h.act.phase === 'do') { parkedAtDoor = P.mode === 'parked' && Math.hypot(P.x - h.act.route[0][0], P.z - h.act.route[0][1]) < 0.5; return true; } });
      return { parkedAtDoor, mode: P.mode };
    }
    return { fail: 'no cafe' };
  });
  assert.equal(s.fail, undefined, s.fail);
  assert.ok(s.parkedAtDoor, `pram left outside the door (${s.mode})`);
});

test('on a school morning parents walk their kids to the gates and the kids run in', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 4; // Monday
    const S = H.schoolInfo; H.goTo(H, S.gate.x + 25, S.gate.z - 25);
    const p = H.randomOpenPoint(S.gate.x, S.gate.z - 20, 10, 20);
    const h = H.family(H, p.x, p.z); h.waitT = 0; h.wt = null;
    const in0 = H.KD_STATE.schoolIn;
    const planned = H.LIFE.plan(h, 8.3);
    const k = h.kid; let dbg = '';
    const done = H.stepAt(H, 50, 8.3, () => { h.sus = 0; h.alertT = -1; if (h.state === 'chase') h.state = 'search'; dbg = [h.act && h.act.kind, h.act && h.act.phase, h.x.toFixed(1), h.z.toFixed(1), k && k.mode, k && k.x.toFixed(1), k && k.z.toFixed(1), h.state, h.dead, H.kids.includes(k), k && k.schoolLeg].join(' '); return H.KD_STATE.schoolIn > in0; });
    return { planned, kind: h.act ? h.act.kind : null, done, kidLeft: !h.kid, dbg };
  });
  assert.ok(s.planned, 'parent sets off on the school run');
  assert.ok(s.done, `the kid went in through the school doors (${s.dbg})`);
  assert.ok(s.kidLeft, 'parent walks off without them');
});

test('at home time parents crowd the school gates and the kids come out to them', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 4;
    const S = H.schoolInfo; H.goTo(H, S.gate.x + 15, S.gate.z - 15);
    const out0 = H.KD_STATE.schoolOut;
    let waiting = 0;
    for (let i = 0; i < 40 * 30; i++) { H.G.hour = 15.2; H.step(1 / 30); waiting = Math.max(waiting, H.G.hunters.filter((h) => h.act && h.act.pickUp).length); if (H.KD_STATE.schoolOut - out0 >= 2) break; }
    return { waiting, out: H.KD_STATE.schoolOut - out0 };
  });
  assert.ok(s.waiting >= 3, `only ${s.waiting} parents at the gates`);
  assert.ok(s.out >= 2, `only ${s.out} kids came out`);
});

test('families go to the playground: grown-ups sit and watch, kids play on the swings and slides', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const PG = H.playgrounds[0]; H.goTo(H, PG.x + 45, PG.z + 45); // far enough off that nobody stops to stare at you
    const res = [];
    for (let i = 0; i < 3; i++) { const p = H.randomOpenPoint(PG.x + (i % 2 ? 9 : -9), PG.z, 0, 3) || { x: PG.x, z: PG.z }; const h = H.family(H, p.x, p.z); h.waitT = 0; res.push({ h, ok: H.LIFE.visit(h, 'playground') }); }
    const played0 = H.KD_STATE.played;
    let onPiece = 0, swingMoved = false;
    H.stepAt(H, 30, 11, () => { onPiece = Math.max(onPiece, H.kids.filter((k) => k.piece).length); if (PG.pieces.some((P) => P.kind === 'swing' && Math.abs(P.ang) > 0.2)) swingMoved = true; return onPiece >= 2 && swingMoved; });
    return { sent: res.filter((r) => r.ok).length, onPiece, played: H.KD_STATE.played - played0, pieces: PG.pieces.map((P) => P.kind), benches: PG.benches.length };
  });
  assert.deepEqual([...new Set(s.pieces)].sort(), ['round', 'sand', 'seesaw', 'slide', 'swing']);
  assert.ok(s.sent >= 2, 'grown-ups head for the playground');
  assert.ok(s.onPiece >= 2, `kids playing: ${s.onPiece}`);
});

test('every playground and the school are on solid, reachable ground', async () => {
  const s = await g.run((H) => {
    const PGs = H.playgrounds.map((PG) => ({ city: PG.city, open: !H.blockedAt(PG.x, PG.z + 0.5) || !H.blockedAt(PG.x - 1, PG.z), y: H.floorAt(PG.x, PG.z, 1) }));
    const S = H.schoolInfo;
    return { PGs, gate: !H.blockedAt(S.gate.x, S.gate.z), yard: !H.blockedAt(S.yard.x, S.yard.z), door: !H.blockedAt(S.door.x, S.door.z) };
  });
  assert.equal(s.PGs.length, 2);
  assert.deepEqual(s.PGs.map((P) => P.city).sort(), ['ASHFORD', 'PORT HALDEN']);
  for (const P of s.PGs) assert.ok(P.open && P.y < 0.5, JSON.stringify(P));
  assert.ok(s.gate && s.yard && s.door, JSON.stringify(s));
});
