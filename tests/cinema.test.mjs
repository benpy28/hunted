// The Picturedrome (two screens, showtimes, the box office and kiosk, seats in the dark, the usher and his
// torch, the police appeal in the adverts) and the launderettes (washing your clothes, the dryers, the chairs).
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
      if (H.CN_STATE.seat) H.cnStand(H.TDK);
      H.player.vx = H.player.vz = 0; H.player.hp = 80; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move'; H.player.hide = null;
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false; H.input.fwd = 0; H.input.side = 0;
      H.player.cash = 500; H.player.outfit = {}; H.player.disg = 0; H.G.day = 1;
      H.CN_STATE.tickets = {}; H.CN_STATE.warned = 0; H.CN_STATE.warnT = 0; H.CN_STATE.appealSeen = 0; if (H.cinema.usher) { H.cinema.usher.warnT = 0; H.cinema.usher.wp = 0; }
      H.LN_STATE.wash = null;
    };
    H.goTo = (H, x, z, y) => { H.player.x = x; H.player.z = z; H.player.y = y ?? H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
  });
});
after(async () => { await g?.close(); });

test('the Picturedrome stands on its own patch off Route 9: a foyer, two raked screens, walls, doors, a roof', async () => {
  const s = await g.run((H) => {
    const C = H.CN_CLEAR, D = H.cinemaDebug();
    const stray = H.colliders.filter((c) => c.x0 > C.x0 + 1 && c.x1 < C.x1 - 1 && c.z0 > C.z0 + 1 && c.z1 < C.z1 - 1 && Math.abs(c.x1 - c.x0 - 0.6) < 0.01 && Math.abs(c.h - 4) < 0.01).length;
    const doors = [[296, 38], [264, 54], [314, 54]].every(([x, z]) => !H.pointBlocked(x, z, 0.3));
    const walls = [[280, 54], [262, 45], [330, 70], [296, 96], [310, 70]].every(([x, z]) => H.pointBlocked(x, z, 0.2));
    const back = H.floorAt(285, 58, 8), front = H.floorAt(285, 87.5, 2), aisle = H.floorAt(264, 70, 2);
    const roofed = H.cnRoofs.length >= 3, cupboards = H.hideSpots.filter((S) => S.kind === 'cupboard' && H.inCinema(S.x, S.z)).length;
    const seatsOnRows = H.cinema.screens.every((S) => S.seats.every((q) => Math.abs(H.floorAt(q.x, q.z, q.top + 0.5) - q.top) < 0.05));
    return { ...D, stray, doors, walls, back, front, aisle, roofed, cupboards, seatsOnRows };
  });
  assert.ok(s.built);
  assert.equal(s.stray, 0, 'countryside trees left inside the clearing');
  assert.ok(s.doors, 'the front doors and both screen doors are open'); assert.ok(s.walls, 'the walls are solid');
  assert.ok(s.back > 4 && s.front < 0.5 && s.aisle < 0.1, `the rows rake up away from the screen (${s.front} -> ${s.back}), the aisle is flat`);
  assert.ok(s.screens[0].seats > 500 && s.screens[1].seats > 100, `seats: ${s.screens.map((q) => q.seats)}`);
  assert.ok(s.seatsOnRows, 'every seat sits on its row');
  assert.ok(s.roofed); assert.ok(s.cupboards >= 3, `${s.cupboards} cupboards to hide in`);
});

test('the timetable: four showings a screen, different films each day, tickets from the box office', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const ph = [11.5, 11.8, 12.05, 12.5, 13.75, 13.85, 14.5].map((hr) => { const M = H.showNow(0, 1, hr); return M ? M.phase : '-'; });
    const films = [1, 2, 3].map((d) => H.filmOn(0, d).title + '|' + H.filmOn(1, d).title);
    H.G.hour = 13; H.goTo(H, 305, 45.5, 0);
    const T = H.cnUseTarget(H.TDK);
    const menu = H.cnInternals.cnBoxMenu(H.TDK), items = menu.items();
    const it = items[0], cash0 = H.player.cash, msg = menu.buy(it), again = menu.buy(it);
    H.G.hour = 19; const late = H.cnInternals.cnBoxMenu(H.TDK).items();
    return { ph, films, T: T && T.kind, n: items.length, first: it.show.start, price: it.price, latePrice: late[0].price, paid: cash0 - H.player.cash, msg, again, has: H.hasTicket(it.show.key, 1) };
  });
  assert.deepEqual(s.ph, ['-', 'doors', 'ads', 'film', 'credits', 'out', '-']);
  assert.equal(new Set(s.films).size, 3, 'a different pair of films each day');
  assert.equal(s.T, 'box');
  assert.ok(s.n >= 3 && s.first > 13, `next showings listed (${s.n}, first at ${s.first})`);
  assert.equal(s.price, 5, 'matinee'); assert.equal(s.latePrice, 7, 'evening');
  assert.equal(s.paid, 5); assert.ok(s.has); assert.match(s.again, /ALREADY/);
});

test('a showing fills up: the audience are in their seats on the rows, the screen plays the film and the lights go down', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.goTo(H, 296, 44, 0);
    H.stepAt(H, 8, 12.4);
    const aud = H.G.hunters.filter((h) => h.cnAud && h.cnScreen === 0);
    const sat = aud.filter((h) => h.act && h.act.kind === 'sit' && h.act.phase === 'do' && h.y > 0.25);
    const D = H.cinemaDebug();
    H.goTo(H, 264, 70, 0); H.stepAt(H, 0.5, 12.4);
    const dim = H.cnInternals.cnLightMat.color.getHex();
    H.G.hour = 14.3; H.stepAt(H, 0.5, 14.3); const up = H.cnInternals.cnLightMat.color.getHex();
    return { aud: aud.length, sat: sat.length, showing: D.screens[0].showing, dim, up };
  });
  assert.ok(s.aud >= 6, `${s.aud} in the audience`);
  assert.ok(s.sat >= 4, `${s.sat} sat down on the rows`);
  assert.equal(s.showing, 'film');
  assert.notEqual(s.dim, s.up, 'the hall lights dim for the film');
});

test('take a seat in the dark: you blend right in with a ticket, the usher\'s torch finds you without one', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const S = H.cinema.screens[0], seat = S.seats.find((q) => q.row === 6 && q.x > 280 && q.x < 290);
    H.G.hour = 12.4; H.goTo(H, seat.x, seat.z, seat.top);
    H.stepAt(H, 0.2, 12.4);
    H.G.hour = 12.4; const standing = H.cnConspic(H.TDK);
    const T = H.cnUseTarget(H.TDK); H.cnUse(T, H.TDK);
    H.stepAt(H, 0.3, 12.4);
    H.G.hour = 12.4; const satNoTicket = H.cnConspic(H.TDK), seated = !!H.CN_STATE.seat, y = H.player.y;
    const M = H.showNow(0, 1, 12.4); H.CN_STATE.tickets[M.key] = true;
    H.stepAt(H, 0.2, 12.4);
    H.G.hour = 12.4; const satTicket = H.cnConspic(H.TDK), total = H.conspicNow();
    // moving gets you up
    H.input.fwd = 1; H.stepAt(H, 0.2, 12.4); H.input.fwd = 0;
    const gotUp = !H.CN_STATE.seat;
    // no ticket now, right in front of the usher's torch on his rounds
    H.CN_STATE.tickets = {}; H.CN_STATE.warned = 0;
    const U = H.cinema.usher; U.x = 264; U.z = 70; U.wp = 1;
    H.goTo(H, 268, 70.2, H.floorAt(268, 70.2, 3));
    const warned = H.stepAt(H, 6, 12.4, () => { H.player.x = U.x + 3.5; H.player.z = U.z + 0.3; H.player.y = H.floorAt(H.player.x, H.player.z, 6); return H.CN_STATE.warned > 0; });
    // with a ticket he leaves you alone
    H.CN_STATE.tickets[M.key] = true; H.CN_STATE.warned = 0; U.warnT = 0;
    H.stepAt(H, 3, 12.4, () => { H.player.x = U.x + 3.5; H.player.z = U.z + 0.3; H.player.y = H.floorAt(H.player.x, H.player.z, 6); return false; });
    return { standing, satNoTicket, satTicket, total, seated, y, top: seat.top, gotUp, warned, warnedPaid: H.CN_STATE.warned, torch: U.torch.visible };
  });
  assert.ok(s.seated, 'sat down'); assert.ok(Math.abs(s.y - s.top) < 0.05, 'on the seat');
  assert.ok(s.satTicket < s.satNoTicket && s.satNoTicket < s.standing, `seated with a ticket ${s.satTicket} < seated without ${s.satNoTicket} < standing ${s.standing}`);
  assert.equal(s.total, 0, 'nobody notices a face in the dark');
  assert.ok(s.gotUp, 'walking off gets you out of the seat');
  assert.ok(s.torch, 'the usher has his torch on during the film');
  assert.ok(s.warned, 'the usher caught you without a ticket');
  assert.equal(s.warnedPaid, 0, 'a ticket keeps the usher happy');
});

test('the police appeal in the adverts puts your face on the screen once you\'re famous', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.level = 3; H.G.heat = 130;
    H.goTo(H, 264, 75, 0);
    H.stepAt(H, 1, 12.1);
    const seen = H.CN_STATE.appealSeen, showing = H.cinemaDebug().screens[0].showing, k = H.conspicNow();
    H.G.level = 0; H.G.heat = 0; H.CN_STATE.appealT = 0; H.cinema.screens[0].appealDay = null;
    H.stepAt(H, 1, 12.1);
    return { seen, showing, k, quiet: H.cinemaDebug().screens[0].showing };
  });
  assert.equal(s.seen, 1); assert.equal(s.showing, 'appeal');
  assert.equal(s.quiet, 'ads', 'just the normal adverts when nobody knows who you are');
});

test('launderettes: wash your clothes, sit and wait, collect them fresh (no more bin smell)', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const L = H.launderettes.find((q) => q.washers.length >= 3 && q.chairs.length && q.city === 'PORT HALDEN');
    const m = L.washers[1];
    H.G.hour = 10; H.goTo(H, m.x, m.z, H.floorAt(m.x, m.z, 1));
    const T = H.lnUseTarget(H.TDK); const tk = T && T.kind;
    H.player.outfit = { head: 'tophat' }; H.player.disg = 0.05; H.SK_STATE.smellT = 60;
    H.lnUse(T, H.TDK);
    const started = !!H.LN_STATE.wash, cash = H.player.cash;
    H.stepAt(H, 0.2, 10.1);
    const inVest = H.conspicNow();
    const c = L.chairs[0]; H.goTo(H, c.x, c.z, H.floorAt(c.x, c.z, 1));
    const CT = H.lnUseTarget(H.TDK); H.lnUse(CT, H.TDK);
    H.stepAt(H, 0.3, 10.2);
    const sitting = H.conspicNow(), sat = !!H.CN_STATE.seat;
    H.stepAt(H, 0.5, 11.2);
    const done = H.LN_STATE.wash && H.LN_STATE.wash.done;
    H.cnStand(H.TDK); H.goTo(H, m.x, m.z, H.floorAt(m.x, m.z, 1)); H.G.hour = 11.2;
    const CL = H.lnUseTarget(H.TDK); H.lnUse(CL, H.TDK);
    return { tk, started, cash, inVest, sitting, sat, done, collect: CL && CL.kind, smell: H.SK_STATE.smellT, disg: H.player.disg, washes: H.LN_STATE.washes, staff: H.launderetteDebug().staff, city: L.city };
  });
  assert.equal(s.tk, 'washer'); assert.ok(s.started); assert.equal(s.cash, 497);
  assert.ok(s.sat, 'sat on a chair'); assert.ok(s.sitting < s.inVest, `sitting with a magazine ${s.sitting} < standing about in a towel ${s.inVest}`);
  assert.ok(s.done, 'the wash finished'); assert.equal(s.collect, 'collect');
  assert.equal(s.smell, 0, 'no more bin smell'); assert.ok(s.disg > 0.2, `disguise freshened up (${s.disg})`);
  assert.equal(s.washes, 1); assert.ok(s.staff >= 1, 'an attendant behind the counter');
});

test('launderettes: leave your wash and someone nicks it; the dryers are full of free (other people\'s) clothes', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const L = H.launderettes.find((q) => q.washers.length >= 3 && q.dryers.length >= 3);
    const m = L.washers[0]; H.G.hour = 10; H.goTo(H, m.x, m.z, H.floorAt(m.x, m.z, 1));
    H.player.outfit = { head: 'tophat', eyes: 'specs' };
    H.lnUse({ kind: 'washer', L, m }, H.TDK);
    H.goTo(H, L.rect.x0 - 40, L.rect.z0 - 40); H.stepAt(H, 30, 10.5);
    const nicked = H.LN_STATE.nicked, left = Object.keys(H.player.outfit).length;
    // the dryers: find one with a load in it today
    let D = null; for (let day = 1; day < 8 && !D; day++) { H.G.day = day; D = L.dryers.find((q) => H.lnInternals.dryerLoad(q, day)); }
    H.goTo(H, D.x, D.z, H.floorAt(D.x, D.z, 1));
    const load = H.lnInternals.dryerLoad(D, H.G.day);
    const T = H.lnUseTarget(H.TDK); H.lnUse(T, H.TDK);
    const wearing = H.player.outfit[load.slot], empty = H.lnInternals.dryerLoad(D, H.G.day);
    return { nicked, left, tk: T && T.kind, load: load.id, wearing, empty, dryers: H.LN_STATE.dryers };
  });
  assert.equal(s.nicked, 1); assert.equal(s.left, 1, 'one thing out of the wash went walkies');
  assert.equal(s.tk, 'dryer'); assert.equal(s.wearing, s.load, 'wearing what came out of the dryer');
  assert.equal(s.empty, null, 'that dryer\'s empty now');
});
