// Odd jobs from the notice boards, indoor hiding places (wardrobes, cupboards, crates, lockers) and the bin
// lorries you can ride on or hide in.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => {
  g = await openGame(); await g.run((H) => H.startGame(false));
  await g.run((H) => {
    H.fresh = (H) => {
      if (H.GJ_STATE.ride) H.hopOffLorry(H.GJ);
      if (H.player.hide) H.leaveHide(H.SK);
      if (H.GJ_STATE.gig) H.gigInternals.endGig(H.GJ, false, '');
      for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
      H.player.vx = H.player.vz = 0; H.player.hp = 100; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move';
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false;
      H.GJ_STATE.rep = 0; H.SK_STATE.smellT = 0;
    };
    H.goTo = (H, x, z) => { H.player.x = x; H.player.z = z; H.player.y = H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; };
    H.person = (H, x, z, o = {}) => { const h = new H.Hunter(x, z, 'civ', false); h.waitT = 30; h.face = o.face ?? 0; Object.assign(h, o); H.G.hunters.push(h); return h; };
  });
});
after(async () => { await g?.close(); });

test('every town has notice boards, homes have wardrobes, warehouses have crates and lockers, and bin lorries do the rounds', async () => {
  const s = await g.run((H) => ({ ...H.gigsDebug(), towns: [...new Set(H.gigBoards.map((B) => B.city))].length, lorries: H.G.cars.filter((c) => c.kind === 'binlorry').length }));
  assert.ok(s.boards >= 18, `only ${s.boards} notice boards`);
  assert.equal(s.towns, 3, 'all three towns should have notice boards');
  assert.ok((s.hideKinds.wardrobe || 0) >= 60, `only ${s.hideKinds.wardrobe} wardrobes`);
  assert.ok((s.hideKinds.cupboard || 0) >= 30, `only ${s.hideKinds.cupboard} store cupboards`);
  assert.ok((s.hideKinds.crate || 0) >= 8 && (s.hideKinds.locker || 0) >= 4, `crates ${s.hideKinds.crate}, lockers ${s.hideKinds.locker}`);
  assert.ok(s.lorries >= 3, `only ${s.lorries} bin lorries`);
});

test('busier pavements: cafe terraces people sit at, plus postboxes, phone boxes, planters and paper stands', async () => {
  const s = await g.run((H) => { H.fresh(H); const d = H.gigsDebug(); H.step(25); return { ...d, sitting: H.G.hunters.filter((h) => h.act && h.act.spot && h.act.spot.terrace).length }; });
  assert.ok(s.terraceSeats >= 16, `only ${s.terraceSeats} terrace seats`);
  assert.ok(s.clutter >= 60, `only ${s.clutter} bits of street furniture`);
});

test('hide in a wardrobe: you peek out through the slats and a chaser who missed it loses you', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const spot = (() => { for (const W of H.walkIns) if (W.home) { const T = H.hideSpotNear(W.x, 0.2, W.z, 30); if (T && T.kind === 'wardrobe') return T; } return null; })();
    H.goTo(H, spot.stand.x, spot.stand.z);
    const prompt = !!H.hideSpotNear(H.player.x, H.player.y, H.player.z);
    H.useAction();
    const r = { prompt, inside: H.player.hide === spot, kind: spot.kind };
    const q = H.randomOpenPoint(spot.stand.x, spot.stand.z, 18, 26) || { x: spot.stand.x + 18, z: spot.stand.z + 18 };
    const h = H.person(H, q.x, q.z, { waitT: 0 }); h.state = 'chase'; h.lastSeen = 0; h.noticeT = 0;
    H.step(4);
    r.conspic = H.G.conspic; r.eye = !!spot.eye && spot.eye.y > 1.2 && Math.hypot(spot.eye.x - spot.x, spot.eye.z - spot.z) < 0.4;
    r.state = h.state; r.hidden = !!H.player.hide;
    H.useAction(); r.out = !H.player.hide; r.smell = H.SK_STATE.smellT;
    return r;
  });
  assert.ok(s.prompt && s.inside, 'E beside a wardrobe should put you in it');
  assert.ok(s.hidden && s.conspic === 0, 'hidden in a wardrobe you don\'t stand out');
  assert.ok(s.eye, 'the view sits inside the wardrobe at eye height');
  assert.notEqual(s.state, 'chase', 'a chaser who never saw you go in should lose you');
  assert.ok(s.out && s.smell === 0, 'E climbs out, and a wardrobe doesn\'t leave you smelling of bins');
});

test('you can\'t climb into a wardrobe through the wall from outside the house', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    let bad = 0, n = 0;
    for (const W of H.walkIns) {
      if (!W.home) continue;
      const S = H.hideSpotNear(W.x, 0.2, W.z, 30); if (!S || S.kind !== 'wardrobe') continue;
      n++;
      // stand just outside the nearest outer wall, behind the wardrobe
      const ox = S.x - S.stand.ux * (Math.abs(S.stand.ux) ? S.lx + 0.75 : 0), oz = S.z - S.stand.uz * (Math.abs(S.stand.uz) ? S.lz + 0.75 : 0);
      const T = H.hideSpotNear(ox, 0.15, oz);
      if (T === S) bad++;
      if (n > 40) break;
    }
    return { bad, n };
  });
  assert.ok(s.n > 10);
  assert.equal(s.bad, 0, `${s.bad} of ${s.n} wardrobes could be entered through the wall`);
});

test('notice board deliveries: collect the parcel, drop it off, get paid', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.gigBoards.find((b) => b.city === 'PORT HALDEN') || H.gigBoards[0];
    H.goTo(H, B.x + 1.2, B.z + 1.2);
    const near = !!H.gigBoardNear(H.player.x, H.player.y, H.player.z);
    const menu = H.gigMenu(H.GJ);
    let items = [];
    for (let k = 0; k < 20; k++) { B.day = 0; items = menu.items('gigs', B); if (B.offers.some((o) => o.kind === 'delivery')) break; }
    const O = B.offers.find((o) => o.kind === 'delivery');
    const cash0 = H.player.cash;
    const msg = menu.buy(items.find((it) => it.id === O.id));
    const r = { near, offers: items.length, msg, active: H.GJ_STATE.gig?.kind };
    const G0 = H.GJ_STATE.gig;
    H.goTo(H, O.from.x, O.from.z); H.step(0.3);
    r.carry = G0.carry;
    r.again = menu.buy(items.find((it) => it.id !== O.id)); // can't take two at once
    H.goTo(H, O.to.x, O.to.z); H.step(0.3);
    r.done = !H.GJ_STATE.gig; r.paid = H.player.cash - cash0; r.pay = O.pay; r.rep = H.GJ_STATE.rep;
    return r;
  });
  assert.ok(s.near, 'standing at the board should offer it');
  assert.equal(s.offers, 3, 'each board pins up three jobs a day');
  assert.equal(s.active, 'delivery');
  assert.equal(s.carry, 'parcel', 'walking up to the shop collects the parcel');
  assert.match(s.again, /FINISH/, 'one job at a time');
  assert.ok(s.done && s.paid === s.pay && s.pay > 0, `delivered and paid (${s.paid} of ${s.pay})`);
  assert.equal(s.rep, 1, 'a job well done builds your reputation');
});

test('litter picks and leaflet rounds finish when you reach every spot; working makes you blend in', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.gigBoards[3];
    const r = {};
    for (const kind of ['litter', 'leaflets']) {
      let O = null;
      for (let k = 0; k < 30 && !O; k++) { B.day = 0; H.gigMenu(H.GJ).items('gigs', B); O = B.offers.find((o) => o.kind === kind); }
      const cash0 = H.player.cash;
      H.gigInternals.startGig(O, H.GJ);
      const G0 = H.GJ_STATE.gig;
      r[kind + 'Targets'] = G0.targets.length;
      H.goTo(H, G0.targets[0].x, G0.targets[0].z); H.step(0.5);
      if (kind === 'litter') r.blend = H.G.conspic;
      for (const T of G0.targets) { H.goTo(H, T.x, T.z); H.step(0.2); }
      r[kind] = !H.GJ_STATE.gig && H.player.cash - cash0 === O.pay;
    }
    H.player.vx = H.player.vz = 0; H.step(0.5); r.idle = H.G.conspic;
    return r;
  });
  assert.equal(s.litterTargets, 7);
  assert.ok(s.leafletsTargets >= 3);
  assert.ok(s.litter, 'clearing every bag finishes the litter pick and pays');
  assert.ok(s.leaflets, 'posting at every door finishes the round and pays');
  assert.ok(s.blend < s.idle + 0.001, `picking litter (${s.blend}) shouldn't stand out more than standing about (${s.idle})`);
});

test('the lost cat bolts if you charge at it, but you can creep up crouching and carry it home', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.gigBoards[1];
    let O = null;
    for (let k = 0; k < 30 && !O; k++) { B.day = 0; H.gigMenu(H.GJ).items('gigs', B); O = B.offers.find((o) => o.kind === 'pet'); }
    const cash0 = H.player.cash;
    H.gigInternals.startGig(O, H.GJ);
    const G0 = H.GJ_STATE.gig, C = G0.cat;
    const r = { area: G0.targets[0].area };
    // charge straight up to it
    H.goTo(H, C.x + 3, C.z); H.step(0.1);
    r.spooked = C.spooked; r.running = C.runT > 0;
    H.step(3);
    // now creep
    H.input.crouch = true; H.player.crouch = 1;
    H.goTo(H, C.x + 3, C.z); H.step(0.1); r.spooked2 = C.spooked;
    H.goTo(H, C.x + 1, C.z); H.step(0.2);
    r.carry = G0.carry;
    H.input.crouch = false; H.player.crouch = 0;
    H.goTo(H, B.x + 1.5, B.z + 1.5); H.step(0.3);
    r.done = !H.GJ_STATE.gig; r.paid = H.player.cash - cash0 === O.pay;
    return r;
  });
  assert.ok(s.area, 'the map shows a search area, not the cat itself');
  assert.ok(s.spooked === 1 && s.running, 'walking straight at the cat makes it bolt');
  assert.equal(s.spooked2, 1, 'crouching doesn\'t spook it');
  assert.equal(s.carry, 'cat', 'you pick it up when you reach it');
  assert.ok(s.done && s.paid, 'bring it back to the board to get paid');
});

test('running out of time loses the job and a bit of reputation', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.GJ_STATE.rep = 3;
    const B = H.gigBoards[2]; B.day = 0; H.gigMenu(H.GJ).items('gigs', B);
    H.gigInternals.startGig(B.offers[0], H.GJ);
    H.GJ_STATE.gig.t = 0.5; H.step(1);
    return { gone: !H.GJ_STATE.gig, rep: H.GJ_STATE.rep };
  });
  assert.ok(s.gone); assert.equal(s.rep, 2);
});

test('bin lorries stop to empty wheelie bins', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const L = H.G.cars.find((c) => c.kind === 'binlorry');
    const bin = H.streetProps.find((P) => P.kind === 'wheelie' && P.state === 'up');
    // park the lorry on its lane just short of the bin and let it drive up
    H.goTo(H, bin.x + 20, bin.z + 20);
    const n0 = H.GJ_STATE.binsEmptied;
    L.x = bin.x - L.fx * 2 - L.fz * 4; L.z = bin.z - L.fz * 2 + L.fx * 4; L.speed = 3; L.scanT = 0; L.stopT = 0; L.lastBin = null; L.driver = 'traffic';
    let stopped = false;
    for (let i = 0; i < 40; i++) { H.step(0.1); if (L.stopT > 0) stopped = true; }
    H.step(5);
    return { stopped, emptied: H.GJ_STATE.binsEmptied - n0, binDay: bin.emptied === H.G.day };
  });
  assert.ok(s.stopped, 'the lorry should pull up by the bin');
  assert.ok(s.emptied >= 1 && s.binDay, 'and empty it');
});

test('ride the back step, drop into the hopper to vanish, and the compactor turfs you out eventually', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const L = H.G.cars.find((c) => c.kind === 'binlorry');
    L.speed = 0; L.stopT = 0;
    H.goTo(H, L.x - L.fx * (L.hl + 0.5), L.z - L.fz * (L.hl + 0.5));
    const r = { offer: H.lorryRearNear(H.GJ) === L };
    H.useAction();
    r.riding = H.GJ_STATE.ride?.mode;
    L.speed = 6; H.step(1);
    r.follow = Math.hypot(H.player.x - (L.x - L.fx * (L.hl + 0.35)), H.player.z - (L.z - L.fz * (L.hl + 0.35))) < 1.2;
    // someone's chasing. Into the hopper.
    const h = H.person(H, H.player.x + 20, H.player.z + 20, { waitT: 0 }); h.state = 'chase'; h.lastSeen = 0;
    H.input.crouch = true; H.step(0.2); H.input.crouch = false;
    r.hopper = H.player.hide?.kind; r.conspic = H.G.conspic;
    H.step(3); r.lost = h.state !== 'chase';
    for (let i = 0; i < 40 && H.GJ_STATE.ride; i++) { L.speed = Math.max(L.speed, 4); H.step(1); }
    r.ejected = !H.GJ_STATE.ride && !H.player.hide; r.smell = H.SK_STATE.smellT > 0; r.hp = H.player.hp;
    return r;
  });
  assert.ok(s.offer, 'E at the back of a slow lorry offers a ride');
  assert.equal(s.riding, 'step');
  assert.ok(s.follow, 'you stay on the back step as it drives off');
  assert.equal(s.hopper, 'lorry', 'crouching drops you into the hopper');
  assert.equal(s.conspic, 0, 'nobody can see you in the hopper');
  assert.ok(s.lost, 'a chaser who didn\'t see you go in loses you');
  assert.ok(s.ejected && s.smell && s.hp < 100, 'the compactor squeezes you out, sore and smelly');
});

test('the bin crew job pays once you\'ve ridden the back step long enough', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.gigBoards[4];
    let O = null;
    for (let k = 0; k < 30 && !O; k++) { B.day = 0; H.gigMenu(H.GJ).items('gigs', B); O = B.offers.find((o) => o.kind === 'bincrew'); }
    const cash0 = H.player.cash;
    H.gigInternals.startGig(O, H.GJ);
    const L = H.G.cars.find((c) => c.kind === 'binlorry');
    H.hopOnLorry(L, H.GJ);
    for (let i = 0; i < 60 && H.GJ_STATE.gig; i++) { L.speed = Math.max(L.speed, 3); L.stopT = 0; H.step(1); if (!H.GJ_STATE.ride && H.GJ_STATE.gig) { L.speed = 0; H.hopOnLorry(L, H.GJ); } }
    return { done: !H.GJ_STATE.gig, paid: H.player.cash - cash0, pay: O.pay };
  });
  assert.ok(s.done && s.paid === s.pay, `bin crew shift should pay (${s.paid} of ${s.pay})`);
});
