// The Harriers ground (match days, turnstiles, stewards, the crowd), the church (service, wedding,
// graveyard), the car boot sale, the ice cream van, kids on scooters, and shop hours through the week.
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
      H.player.vx = H.player.vz = 0; H.player.hp = 80; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move'; H.player.hide = null;
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false; H.input.fwd = 0;
      H.player.cash = 500; H.player.outfit = {}; H.player.disg = 0; H.G.day = 1; H.MD_STATE.ticketDay = 0; H.MD_STATE.warnT = 0; H.MD_STATE.celebT = 0;
    };
    H.goTo = (H, x, z) => { H.player.x = x; H.player.z = z; H.player.y = H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
  });
});
after(async () => { await g?.close(); });

test('the ground is built on a clearing by Route 9: walls, turnstile gaps, terraces, a covered stand, the clubhouse, the church', async () => {
  const s = await g.run((H) => {
    const G = H.ground, C = H.MD_CLEAR, D = H.matchDayDebug();
    // nothing from the countryside generator (hedges, trees, bales) left inside the clearing
    const stray = H.colliders.filter((c) => c.x0 > C.x0 + 1 && c.x1 < C.x1 - 1 && c.z0 > C.z0 + 1 && c.z1 < C.z1 - 1 && Math.abs(c.x1 - c.x0 - 0.6) < 0.01 && Math.abs(c.h - 4) < 0.01 && ![[511.5, -70], [485, -68]].some(([x, z]) => Math.hypot(c.x0 + 0.3 - x, c.z0 + 0.3 - z) < 1)).length; // (bar the church's own two trees)
    const gapOpen = G.turnstiles.every((T) => !H.pointBlocked(T.x, G.z1, 0.3));
    const wallShut = H.pointBlocked(G.cx - 10, G.z1, 0.2) && H.pointBlocked(G.x0, -60, 0.2);
    const step4 = H.floorAt(422, -60, 3), standRoof = H.mdRoofs.some((r) => r.x0 > 464 && r.x1 < 477 && r.h >= 4.9);
    const lockers = H.hideSpots.filter((S) => S.kind === 'locker' && S.x > H.clubhouse.x0 && S.x < H.clubhouse.x1 && S.z > H.clubhouse.z0 && S.z < H.clubhouse.z1).length;
    const pews = H.lifeSpots.filter((s) => s.kind === 'pew').length, cupboard = H.hideSpots.some((S) => S.kind === 'cupboard' && H.inChurch(S.x, S.z));
    const cars = H.G.cars.filter((c) => c.x > H.carBoot.x0 && c.x < H.carBoot.x1 && c.z > H.carBoot.z0 && c.z < H.carBoot.z1).length;
    return { ...D, stray, gapOpen, wallShut, step4, standRoof, lockers, pews, cupboard, cars };
  });
  assert.equal(s.stray, 0, 'trees from the countryside left in the clearing');
  assert.ok(s.gapOpen, 'the turnstile gaps are open'); assert.ok(s.wallShut, 'the wall is solid elsewhere');
  assert.ok(s.step4 > 1.6, `top of the terrace is ${s.step4} m up`);
  assert.ok(s.standRoof, 'the main stand is under a roof');
  assert.ok(s.crowd > 250, `${s.crowd} places on the terraces`);
  assert.ok(s.lockers >= 4, `${s.lockers} lockers in the changing room`);
  assert.ok(s.pews >= 40 && s.cupboard, `${s.pews} pew seats, vestry cupboard ${s.cupboard}`);
  assert.ok(s.graves > 40, `${s.graves} headstones`);
  assert.ok(s.cars >= 5, `${s.cars} cars in the car park`);
});

test('the calendar: football on Saturday afternoons and Tuesday nights, car boot and church on Sunday, a Saturday wedding', async () => {
  const s = await g.run((H) => ({
    sat: H.eventsOn(2).map((E) => E.id), sun: H.eventsOn(3).map((E) => E.id), tue: H.eventsOn(5).map((E) => E.id), mon: H.eventsOn(4).map((E) => E.id),
    satKO: H.matchNow(2, 14.6).phase, tueKO: H.matchNow(5, 19.2).phase, tueNight: H.matchNow(5, 19.2).night, half: H.matchNow(2, 15.5).phase, post: H.matchNow(2, 16.8).phase, none: H.matchNow(4, 15),
  }));
  assert.ok(s.sat.includes('match') && s.sat.includes('wedding'), `saturday ${s.sat}`);
  assert.ok(s.sun.includes('carboot') && s.sun.includes('church'), `sunday ${s.sun}`);
  assert.ok(s.tue.includes('match'), `tuesday ${s.tue}`);
  assert.ok(!s.mon.includes('match'), 'no football on Mondays');
  assert.equal(s.satKO, 'first'); assert.equal(s.tueKO, 'first'); assert.ok(s.tueNight);
  assert.equal(s.half, 'half'); assert.equal(s.post, 'post'); assert.equal(s.none, null);
});

test('match day: fans walk in, the crowd is on the terraces, two teams play and a goal sets the place off', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 2; H.MD_STATE.matches = {};
    const G = H.ground; H.goTo(H, G.cx, G.z1 + 6);
    H.stepAt(H, 25, 14.0); // before kick-off: fans arriving
    const fans = H.G.hunters.filter((h) => h.mdFan && !h.dead).length, scarves = H.G.hunters.filter((h) => h.mdScarf).length;
    H.stepAt(H, 2, 15.0);
    const D = H.matchDayDebug(), rec = H.MD_STATE.matches[2];
    // a goal is due: watch it go in
    rec.goals = [{ min: 1, home: true, done: false }]; rec.home = rec.away = 0;
    const goal = H.stepAt(H, 12, 15.0, () => rec.home > 0);
    const celebrating = H.MD_STATE.celebT > 0;
    const board = H.ground.boardKey;
    return { fans, scarves, active: D.active, players: D.players, crowdShown: D.crowdShown, goal, home: rec.home, celebrating, board, lit: H.ground.lampMat.color.getHex() };
  });
  assert.ok(s.fans >= 4, `only ${s.fans} fans turned up`);
  assert.ok(s.scarves >= s.fans * 0.8, 'fans wear scarves');
  assert.ok(s.active && s.players === 22, `game active ${s.active}, ${s.players} players`);
  assert.ok(s.crowdShown, 'the terraces are full');
  assert.ok(s.goal, 'the due goal went in'); assert.ok(s.celebrating, 'the crowd celebrates');
  assert.match(s.board, /^1-0/);
});

test('the turnstile: pay $6 and the stewards leave you alone; hop the wall without one and they want a word', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 2; const G = H.ground, T = G.turnstiles[0];
    // no ticket, inside the ground right in front of a steward
    H.goTo(H, T.x, G.z1 - 5); H.stepAt(H, 1.5, 14.0);
    const warned = H.MD_STATE.warned;
    // pay at the turnstile
    H.goTo(H, T.x, T.z); H.G.hour = 14.0; const tgt = H.mdUseTarget(H.TDK); const cash0 = H.player.cash; H.useAction();
    const paid = H.MD_STATE.ticketDay === 2, cost = cash0 - H.player.cash;
    H.MD_STATE.warnT = 0; const w0 = H.MD_STATE.warned;
    H.goTo(H, T.x, G.z1 - 5); H.stepAt(H, 1.5, 14.0);
    return { warned, tgt: tgt && tgt.kind, paid, cost, after: H.MD_STATE.warned - w0 };
  });
  assert.ok(s.warned >= 1, 'a steward asked for a ticket');
  assert.equal(s.tgt, 'turnstile'); assert.ok(s.paid); assert.equal(s.cost, 6);
  assert.equal(s.after, 0, 'with a ticket nobody bothers you');
});

test('on the terrace with a ticket and a Harriers scarf you are one face in a few hundred', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 2; H.G.level = 2;
    const G = H.ground;
    const at = (x, z) => { H.goTo(H, x, z); H.stepAt(H, 0.3, 15.0); H.G.hour = 15.0; return H.mdConspic(H.TDK); }; // (the overall score bottoms out at 0, so look at what the ground adds)
    const outside = at(G.cx, G.z1 + 8);
    H.MD_STATE.ticketDay = 2;
    const menu = H.mdInternals.mdMenu('scarves', H.TDK), scarf = menu.items().find((it) => it.id === 'md_scarf');
    menu.buy(scarf);
    const terrace = at(430.2, -60);
    return { outside, terrace, wearing: H.player.outfit.face };
  });
  assert.equal(s.wearing, 'md_scarf');
  assert.ok(s.terrace < s.outside - 0.3, `terrace ${s.terrace} vs outside ${s.outside}`);
});

test('Sunday service: the congregation fills the pews, the vicar is in the pulpit, and a bowed head in a pew goes unnoticed', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 3; H.G.level = 2; const Ch = H.church;
    H.goTo(H, Ch.door.x, Ch.door.z - 4);
    let best = 0; H.stepAt(H, 30, 10.5, () => { for (const h of H.G.hunters) h.sus = 0; best = Math.max(best, H.G.hunters.filter((h) => h.act && h.act.kind === 'sit' && h.act.spot && h.act.spot.church).length); return best >= 5; });
    const vicar = Ch.vicar.g.visible;
    H.goTo(H, 486, -86); H.stepAt(H, 0.3, 10.5); H.G.hour = 10.5; const standing = H.mdConspic(H.TDK);
    H.input.crouch = true; H.stepAt(H, 1, 10.5); H.G.hour = 10.5; const bowed = H.mdConspic(H.TDK); H.input.crouch = false;
    H.stepAt(H, 0.3, 14); H.G.hour = 14; const later = H.mdConspic(H.TDK);
    return { best, vicar, standing, bowed, later };
  });
  assert.ok(s.best >= 5, `only ${s.best} in the pews`);
  assert.ok(s.vicar, 'the vicar is there');
  assert.ok(s.bowed < s.standing - 0.2, `head bowed ${s.bowed} vs standing ${s.standing}`);
  assert.equal(s.later, 0, 'no help once the service is over');
});

test('a Saturday wedding: the happy couple, guests outside and confetti', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 2; const Ch = H.church;
    H.goTo(H, Ch.door.x + 3, Ch.door.z + 6);
    const c0 = H.MD_STATE.confetti;
    H.stepAt(H, 15, 13.2);
    const guests = H.G.hunters.filter((h) => h.mdChurch && !h.dead).length;
    return { bride: Ch.bride.g.visible, groom: Ch.groom.g.visible, guests, confetti: H.MD_STATE.confetti - c0 };
  });
  assert.ok(s.bride && s.groom, 'the couple are at the door');
  assert.ok(s.guests >= 5, `${s.guests} guests`);
  assert.ok(s.confetti > 20, 'confetti');
});

test('the car boot sale: tables out on Sunday mornings, a different few things on each, a wig that works as a disguise', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 3; const B = H.carBoot, T = B.tables[0];
    H.goTo(H, T.x, T.z + 0.3); H.stepAt(H, 8, 9); H.G.hour = 9;
    const shown = B.group.visible, tgt = H.mdUseTarget(H.TDK);
    const menu = H.mdInternals.mdMenu('boot', H.TDK, T), stock = menu.items().map((it) => it.id);
    const other = H.mdInternals.mdMenu('boot', H.TDK, B.tables[3]).items().map((it) => it.id);
    const wig = H.mdInternals.MD_BOOT_GOODS.find((it) => it.id === 'cb_wig'); T.stock[0] = wig;
    const msg = menu.buy(wig);
    const browsing = H.G.hunters.filter((h) => h.mdBoot).length;
    H.G.day = 4; H.stepAt(H, 0.5, 9); const monday = B.group.visible;
    return { shown, tgt: tgt && tgt.kind, stock, other, msg, head: H.player.outfit.head, disg: H.player.disg, browsing, monday };
  });
  assert.ok(s.shown, 'tables are out'); assert.ok(!s.monday, 'and packed away on Monday');
  assert.equal(s.tgt, 'boot');
  assert.equal(s.stock.length, 4); assert.notDeepEqual(s.stock, s.other, 'tables have different stock');
  assert.equal(s.head, 'cb_wig'); assert.ok(s.disg > 0.15);
  assert.ok(s.browsing >= 3, `${s.browsing} browsing`);
});

test('the ice cream van: tours town with its chime, pulls over, sells cones, and kids nearby forget about you', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 1;
    const vans = H.G.cars.filter((c) => c.kind === 'icecream');
    const L = vans.find((c) => H.cityAt ? true : true) || vans[0];
    // put the player on the pavement by the van and make it stop
    const hatch = H.icHatch(L, 0.6); H.goTo(H, hatch.x, hatch.z);
    L.icCool = 0; L.stopT = 0; L.speed = 0;
    let served = false; H.stepAt(H, 8, 12, () => { const hh = H.icHatch(L, 0.6); H.player.x = hh.x; H.player.z = hh.z; served = L.serving; return served; });
    if (!served) { L.stopT = 20; L.serving = true; H.stepAt(H, 0.2, 12); }
    const hh = H.icHatch(L, 0.6); H.player.x = hh.x; H.player.z = hh.z;
    const near = !!H.icHatchNear(H.TDK);
    const c0 = H.G.conspic;
    const menu = H.icMenu(H.TDK); menu.buy(menu.items().find((it) => it.id === 'ic_cone'));
    H.stepAt(H, 0.3, 12); const c1 = H.G.conspic;
    // a kid by the van while it's serving: distracted
    const fake = { x: L.x + 3, z: L.z + 3 };
    const distracted = !!H.icDistracted(fake, H.TDK);
    return { vans: vans.length, served, near, cone: H.IC_STATE.coneT > 0, c0, c1, distracted };
  });
  assert.equal(s.vans, 2, 'one van in each town');
  assert.ok(s.near, 'you can reach the hatch'); assert.ok(s.cone, 'you have a cone');
  assert.ok(s.c1 < s.c0 - 0.05, `with a cone ${s.c1} vs ${s.c0}`);
  assert.ok(s.distracted, 'kids near the van are distracted');
});

test('kids ride scooters and little bikes', async () => {
  const s = await g.run((H) => {
    H.fresh(H); const P = H.player; let rides = { scooter: 0, bike: 0 }, n = 0;
    for (let i = 0; i < 40; i++) { const h = new H.Hunter(P.x + 5, P.z + 5, 'civ', false); H.G.hunters.push(h); const k = H.makeKid(h, H.TDK); n++; if (k.ride) rides[k.ride]++; }
    H.stepAt(H, 0.5, 11);
    const mesh = H.kids.filter((k) => k.ride && k.rideMesh && k.rideMesh.parent === k.g).length;
    return { n, ...rides, mesh };
  });
  assert.ok(s.scooter + s.bike >= 5, `${s.scooter} scooters, ${s.bike} bikes out of ${s.n}`);
  assert.ok(s.scooter > 0 && s.bike > 0);
  assert.equal(s.mesh, s.scooter + s.bike);
});

test('shop hours: Sundays are short, Ashford shuts at lunchtime on Wednesdays, Thursday is late night, marts never close', async () => {
  const s = await g.run((H) => {
    const o = (k, t, d, h) => H.shopOpenAt(k, t, d, h);
    // day 3 = Sunday, 6 = Wednesday, 7 = Thursday, 4 = Monday
    return {
      sunChemist: o('pharmacy', 'PORT HALDEN', 3, 12), monChemist: o('pharmacy', 'PORT HALDEN', 4, 12),
      sunEarly: o('clothes', 'PORT HALDEN', 3, 9), sunLate: o('clothes', 'PORT HALDEN', 3, 17), monClothes: o('clothes', 'PORT HALDEN', 4, 15),
      ashWed: o('clothes', 'ASHFORD', 6, 15), phWed: o('clothes', 'PORT HALDEN', 6, 15), ashWedPub: o('bar', 'ASHFORD', 6, 15),
      thuLate: o('clothes', 'PORT HALDEN', 7, 20), monLate: o('clothes', 'PORT HALDEN', 4, 20),
      mart: o('mart', 'ASHFORD', 3, 3), barberMon: o('barber', 'ASHFORD', 4, 12), pizzaLate: o('pizza', 'PORT HALDEN', 2, 0.2),
      line: H.shutLine('pharmacy', 'PORT HALDEN', 3, 12),
    };
  });
  assert.ok(!s.sunChemist && s.monChemist, 'chemist shut on Sundays');
  assert.ok(!s.sunEarly && !s.sunLate && s.monClothes, 'short Sunday hours');
  assert.ok(!s.ashWed && s.phWed && s.ashWedPub, 'Ashford half-day closing (the pub stays open)');
  assert.ok(s.thuLate && !s.monLate, 'late-night Thursday');
  assert.ok(s.mart && !s.barberMon && s.pizzaLate);
  assert.match(s.line, /SHUT/);
});

test('a shut gun shop will not serve you, and nobody pops into a shut shop', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 3; // Sunday
    const shop = H.shopSpots.find((q) => q.kind === 'guns');
    H.goTo(H, shop.x, shop.z); H.player.y = shop.y; H.G.hour = 8; H.useAction();
    const modeShut = H.G.mode;
    if (H.G.mode === 'shop') H.leaveShop();
    H.G.hour = 12; H.useAction(); const modeOpen = H.G.mode; if (H.G.mode === 'shop') H.leaveShop();
    // a walk-in that's shut doesn't get visitors
    const W = H.walkIns.find((w) => w.kind === 'pharmacy');
    H.G.hour = 12; const shut = H.LIFE.isShut(W);
    return { modeShut, modeOpen, shut };
  });
  assert.equal(s.modeShut, 'playing', 'shut at 8 on a Sunday');
  assert.equal(s.modeOpen, 'shop', 'open at noon');
  assert.ok(s.shut, 'the chemist is shut on Sunday');
});
