// Markets (stalls, traders, honesty boxes, bangers and alarm clocks, fake tip-offs), more hiding places
// (under stalls, portaloos, garden sheds), sniffer dogs, townsfolk who dress for their town, and regular
// clients whose jobs come in a run.
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
      if (H.G.mode === 'shop') H.leaveShop();
      for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0;
      for (const a of H.G.allies) a.dead = true;
      H.player.vx = H.player.vz = 0; H.player.hp = 100; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move';
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false;
      H.SK_STATE.junk.length = 0; H.SK_STATE.smellT = 0; H.player.cash = 500; H.G.hour = 10;
      H.player.outfit = {}; H.player.disg = 0;
    };
    H.goTo = (H, x, z) => { H.player.x = x; H.player.z = z; H.player.y = H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; };
    H.person = (H, x, z, o = {}) => { const h = new H.Hunter(x, z, 'civ', false); h.waitT = 30; h.face = o.face ?? 0; Object.assign(h, o); H.G.hunters.push(h); return h; };
    // hold the clock at mid-morning so the market stays open while the sim runs
    H.stepAt = (H, secs, hour = 10) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); } };
  });
});
after(async () => { await g?.close(); });

test('every town has a market with striped stalls, portaloos, and the suburban sheds are hiding places', async () => {
  const s = await g.run((H) => ({ ...H.marketsDebug(), hk: H.gigsDebug().hideKinds }));
  assert.equal(s.markets.length, 3, `markets: ${JSON.stringify(s.markets)}`);
  for (const M of s.markets) { assert.ok(M.stalls >= 6, `${M.name} has only ${M.stalls} stalls`); assert.ok(M.loos >= 1, `${M.name} has no portaloo`); }
  assert.deepEqual(s.markets.map((M) => M.city).sort(), ['ASHFORD', 'PORT HALDEN', 'SALTMARSH DOCKS']);
  assert.ok(s.kinds.fish >= 2, 'the docks market sells fish');
  for (const k of ['fruit', 'bakery', 'hats', 'junk', 'flowers', 'gadgets']) assert.ok(s.kinds[k] >= 1, `no ${k} stall anywhere`);
  assert.equal(s.hk.stall, s.stalls, 'you can hide under every stall');
  assert.ok(s.sheds >= 6, `only ${s.sheds} garden sheds to hide in`);
});

test('traders come to mind the stalls while the market is open, and shout about their wares', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const M = H.markets[0]; H.goTo(H, M.x, M.z + 2);
    H.stepAt(H, 25);
    const staffed = M.stalls.filter((st) => H.vendorOf(st.spot));
    const atStall = staffed.filter((st) => { const h = H.vendorOf(st.spot); return Math.hypot(h.x - st.back.x, h.z - st.back.z) < 2.6; });
    return { staffed: staffed.length, atStall: atStall.length, lines: !!M.stalls[0].spot.lines.length };
  });
  assert.ok(s.staffed >= 6, `only ${s.staffed} stalls have a trader`);
  assert.ok(s.atStall >= 3, `only ${s.atStall} traders actually behind their stalls`);
});

test('stalls sell food that heals, throwables, hats that disguise you, and the trader gets a look at you', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const stall = (k) => H.marketStalls.find((st) => st.kind === k);
    const buy = (st, id) => { const m = H.stallMenu(st, H.MK); const it = m.items().find((i) => i.id === id); return m.buy(it); };
    H.player.hp = 50;
    const fruit = buy(stall('fruit'), 'mk_melon'), hp = H.player.hp;
    buy(stall('junk'), 'mk_bangers'); buy(stall('junk'), 'mk_clock');
    const junk = [...H.SK_STATE.junk];
    const hat = buy(stall('hats'), 'mk_bobble');
    const full = (() => { H.player.hp = 100; return buy(stall('bakery'), 'mk_roll'); })();
    return { fruit, hp, junk, hat, outfit: H.player.outfit.head, disg: H.player.disg, cash: H.player.cash, full, hud: document.getElementById('hud-junk').textContent };
  });
  assert.equal(s.hp, 85, 'a whole watermelon is +35');
  assert.deepEqual(s.junk, ['banger', 'banger', 'clock']);
  assert.equal(s.outfit, 'mk_bobble');
  assert.ok(s.disg > 0.1, 'the bobble hat is a (small) disguise');
  assert.equal(s.cash, 500 - 9 - 8 - 10 - 12 - 4);
  assert.ok(/NOT HUNGRY|LATER|PENNY/.test(s.full), 'full up, you can still buy food (for an errand, say)');
});

test('an unminded stall runs on an honesty box, and nicking from it in view of someone starts a scene', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const st = H.marketStalls.find((x) => x.kind === 'fruit');
    H.goTo(H, st.front.x, st.front.z); H.player.hp = 60;
    const m = H.stallMenu(st, H.MK), items = m.items(), nick = items.find((i) => i.id === 'mk_nick');
    const quiet = m.buy(nick), hp1 = H.player.hp;
    // now with a witness looking right at you
    const fx = st.front.x - st.back.x, fz = st.front.z - st.back.z;
    const w = H.person(H, st.front.x + fx * 4, st.front.z + fz * 4); w.hasLOS = true;
    const loud = m.buy(nick);
    return { hasNick: !!nick, quiet, hp1, loud, state: w.state, alertT: w.alertT, heat: H.G.heat, nicked: H.MK_STATE.nicked };
  });
  assert.ok(s.hasNick, 'with nobody minding it you can help yourself');
  assert.match(s.quiet, /NOBODY SAW/);
  assert.ok(s.hp1 > 60, 'the stolen fruit still heals');
  assert.match(s.loud, /SOMEONE SAW/);
  assert.ok(s.state === 'chase' || s.alertT >= 0, 'the witness turns on you');
  assert.ok(s.heat > 0);
});

test('a thrown banger fizzes, goes bang, and pulls searchers over to it', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    H.player.x = 0; H.player.z = 0; H.player.y = 0.15;
    let dir = null;
    for (let a = 0; a < 6.28 && !dir; a += 0.2) { let ok = true; for (let r = 1; r < 18; r += 1) if (H.blockedAt(Math.sin(a) * r, Math.cos(a) * r) || H.solidAt(Math.sin(a) * r, 1.0, Math.cos(a) * r, 0)) { ok = false; break; } if (ok) dir = a; }
    H.SK_STATE.junk.push('banger');
    H.camera.position.set(0, 1.75, 0); H.camera.rotation.set(0.05, dir + Math.PI, 0, 'YXZ'); H.camera.updateMatrixWorld();
    const tx = Math.sin(dir) * 12, tz = Math.cos(dir) * 12;
    const searcher = H.person(H, tx + 18, tz, { waitT: 0 }); searcher.huntT = 0;
    H.throwJunk(H.SK);
    let landed = false, fuse = 0;
    for (let i = 0; i < 150; i++) { H.step(1 / 30); const d = H.stealthDebug(); if (!d.flying && d.fuses) landed = true; fuse = Math.max(fuse, d.fuses); }
    return { landed, fuse, lured: !!searcher.lured, wt: searcher.wt, tx, tz, after: H.stealthDebug().fuses };
  });
  assert.ok(s.landed && s.fuse === 1, 'it lands and sits there fizzing');
  assert.ok(s.lured, 'the bang sends the searcher over');
  assert.ok(Math.hypot(s.wt.x - s.tx, s.wt.z - s.tz) < 8, 'to where it went off');
  assert.equal(s.after, 0, 'and then it\'s spent');
});

test('the burner phone tip-off sends the search off to the far side of town', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    H.goTo(H, 0, 0); H.G.heat = 40; H.G.lkp.x = 0; H.G.lkp.z = 0; H.G.lastSeenT = 5;
    const hs = [H.person(H, 20, 0, { waitT: 0 }), H.person(H, -20, 5, { waitT: 0 })]; for (const h of hs) { h.huntT = 10; h.wt = { x: 0, z: 0 }; }
    const st = H.marketStalls.find((x) => x.kind === 'gadgets');
    const m = H.stallMenu(st, H.MK); const msg = m.buy(m.items().find((i) => i.id === 'mk_burner'));
    return { msg, lkp: Math.hypot(H.G.lkp.x, H.G.lkp.z), heat: H.G.heat, wts: hs.map((h) => Math.hypot(h.wt.x, h.wt.z)) };
  });
  assert.match(s.msg, /TIP-OFF/);
  assert.ok(s.lkp > 120, `the search moved only ${s.lkp} m`);
  assert.ok(s.heat < 40, 'and the heat drops');
  for (const d of s.wts) assert.ok(d > 100, 'searchers head off there');
});

test('duck under a stall from the trader\'s side; open a portaloo on someone and they mostly apologise', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const st = H.marketStalls[0];
    H.goTo(H, st.back.x, st.back.z);
    const T = H.hideSpotNear(H.player.x, 0.15, H.player.z, 1.2);
    H.enterHide(T, H.SK);
    const under = H.player.hide === T && T.kind === 'stall';
    H.leaveHide(H.SK);
    // from the customer side you can't get under (the cloth's in the way)
    const front = H.hideSpotNear(st.front.x, 0.15, st.front.z, 1.0);
    // the portaloo: rig the dice so they apologise
    const loo = H.markets[0].loos[0];
    H.goTo(H, loo.stand.x, loo.stand.z); H.enterHide(loo, H.SK);
    const h = H.person(H, loo.stand.x, loo.stand.z, { waitT: 0 }); h.peek = loo;
    const r = Math.random; Math.random = () => 0.1;
    try { H.hunterPeekArrive(h, H.SK); } finally { Math.random = r; }
    return { under, front: front ? front.kind : null, stillIn: H.player.hide === loo, peeked: !h.peek && loo.lift > 0 };
  });
  assert.ok(s.under, 'E at the back of a stall puts you under it');
  assert.notEqual(s.front, 'stall', 'not from the customer side');
  assert.ok(s.peeked, 'they opened the portaloo door');
  assert.ok(s.stillIn, '...and shut it again, apologising');
});

test('rummaging in a garden shed turns something up once a day', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const sh = H.hideSpots.find((q) => q.kind === 'shed');
    H.goTo(H, sh.stand.x, sh.stand.z); H.enterHide(sh, H.SK);
    const before = { cash: H.player.cash, junk: H.SK_STATE.junk.length, hp: H.player.hp, finds: H.MK_STATE.shedFinds };
    H.player.hp = 80;
    H.stepAt(H, 2.5);
    const once = H.MK_STATE.shedFinds - before.finds;
    H.leaveHide(H.SK); H.enterHide(sh, H.SK); H.stepAt(H, 2.5);
    return { once, twice: H.MK_STATE.shedFinds - before.finds, kind: sh.kind };
  });
  assert.equal(s.kind, 'shed');
  assert.equal(s.once, 1, 'the first rummage finds something (or at least looks)');
  assert.equal(s.twice, 1, 'but only once a day per shed');
});

test('a passing dog smells you in your hiding place and its owner comes and hauls you out', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    let spot = null;
    for (let x = -400; x < 900 && !spot; x += 3) { const T = H.hideSpotNear(x, 0.15, 0, 999); if (T && T.kind === 'dumpster') spot = T; }
    H.goTo(H, spot.stand.x, spot.stand.z); H.enterHide(spot, H.SK);
    // a dog walker strolling right past
    const p = H.randomOpenPoint(spot.stand.x, spot.stand.z, 2, 4) || { x: spot.stand.x + 2, z: spot.stand.z };
    const o = H.person(H, p.x, p.z, { waitT: 0 }); o.job = 'dogwalker'; H.cityLifeDebug.makeLifeDog(o);
    const D = H.cityLifeDebug.dogs[H.cityLifeDebug.dogs.length - 1]; D.x = spot.stand.x; D.z = spot.stand.z;
    let found = false, barked = false;
    for (let i = 0; i < 20 * 30 && !found; i++) { o.waitT = 0; H.step(1 / 30); if (D.onto) barked = true; found = !H.player.hide; }
    return { barked, found, alerts: H.cityLifeDebug.dogStats.alerts };
  });
  assert.ok(s.barked, 'the dog should catch your scent');
  assert.ok(s.alerts >= 1, 'and bark until its owner looks');
  assert.ok(s.found, 'the owner opens it up and finds you');
});

test('townsfolk dress for who they are and where they are, and pensioners are slower', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const kinds = { ph: {}, ash: {}, docks: {} };
    const at = { ph: [10, 10], ash: [700, 10], docks: [10, 700] };
    let oldSpd = 0, oldN = 0, yngSpd = 0, yngN = 0;
    for (const t of Object.keys(at)) for (let i = 0; i < 60; i++) {
      const h = new H.Hunter(at[t][0], at[t][1], 'civ', false); kinds[t][h.folk] = (kinds[t][h.folk] || 0) + 1;
      if (h.folk === 'pensioner') { oldSpd += h.spdMul; oldN++; } else { yngSpd += h.spdMul; yngN++; }
      h.remove();
    }
    return { kinds, old: oldSpd / oldN, young: yngSpd / yngN };
  });
  assert.ok(s.kinds.ph.office >= 4, 'office workers downtown');
  assert.ok(s.kinds.ash.pensioner >= 4, 'pensioners in the suburbs');
  assert.ok(s.kinds.docks.docker >= 8, 'dock workers at the docks');
  assert.ok(Object.keys(s.kinds.ph).length >= 5, 'a good mix');
  assert.ok(s.old < s.young * 0.85, 'pensioners don\'t run as fast');
});

test('market errand: buy the thing at the market, take it round, get paid', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.gigBoards.find((b) => b.city === 'PORT HALDEN');
    const O = H.gigInternals.buildOffer('errand', B, H.GJ);
    H.gigInternals.startGig(O, H.GJ);
    const cash0 = H.player.cash;
    const st = O.stall; const m = H.stallMenu(st, H.MK); m.buy(m.items().find((i) => i.heal || i.flowers));
    H.step(0.1);
    const carrying = H.GJ_STATE.gig && H.GJ_STATE.gig.carry;
    H.goTo(H, O.to.x, O.to.z); H.step(0.2);
    return { carrying, done: !H.GJ_STATE.gig, paid: H.player.cash - cash0 };
  });
  assert.equal(s.carrying, 'shopping');
  assert.ok(s.done, 'dropping it off finishes the job');
  assert.ok(s.paid > 10, `paid ${s.paid}`);
});

test('lookout: stand on the corner unseen for 40 seconds', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    const B = H.gigBoards[0];
    const O = H.gigInternals.buildOffer('lookout', B, H.GJ);
    H.gigInternals.startGig(O, H.GJ);
    H.goTo(H, O.at.x, O.at.z);
    for (let i = 0; i < 20 * 30; i++) { H.G.lastSeenT = 99; H.player.x = O.at.x; H.player.z = O.at.z; H.step(1 / 30); for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0; }
    const half = H.GJ_STATE.gig ? H.GJ_STATE.gig.watch : -1;
    for (let i = 0; i < 22 * 30 && H.GJ_STATE.gig; i++) { H.G.lastSeenT = 99; H.player.x = O.at.x; H.player.z = O.at.z; H.step(1 / 30); for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0; }
    return { half, done: !H.GJ_STATE.gig, okDone: H.GJ_STATE.done };
  });
  assert.ok(s.half > 15 && s.half < 40, `watched ${s.half} s halfway`);
  assert.ok(s.done, 'the job finishes after 40 s');
});

test('regular clients come back with the next part of their story, and say thank you at the end', async () => {
  const s = await g.run((H) => {
    H.fresh(H);
    H.GJ_STATE.done = 3; H.GJ_STATE.regulars = {};
    const B = H.gigBoards.find((b) => b.city === 'ASHFORD');
    const seen = [];
    const realTimeout = window.setTimeout; window.setTimeout = (fn) => fn(); // run the thank-you straight away
    try {
      for (let i = 0; i < 4; i++) {
        const O = H.gigInternals.nextRegularFor(B, H.GJ); if (!O) break;
        seen.push({ client: O.client, step: O.step, label: O.label, pay: O.pay, kind: O.kind });
        H.gigInternals.startGig(O, H.GJ); H.gigInternals.endGig(H.GJ, true, 'DONE');
      }
    } finally { window.setTimeout = realTimeout; }
    return { seen, peg: H.GJ_STATE.regulars.peg, perks: H.GJ_STATE.perks, outfit: H.player.outfit.body, disg: H.player.disg };
  });
  const peg = s.seen.filter((o) => o.client === 'NANA PEG');
  assert.equal(peg.length, 4, `Nana Peg's run: ${JSON.stringify(s.seen)}`);
  assert.deepEqual(peg.map((o) => o.step), [0, 1, 2, 3]);
  assert.ok(peg.every((o) => o.label.startsWith('★')), 'regulars are starred on the board');
  assert.ok(peg[3].pay > peg[0].pay * 0.9, 'later parts pay better');
  assert.equal(s.peg, 4);
  assert.ok(s.perks.cardigan, 'Nana Peg says thank you');
  assert.equal(s.outfit, 'nana_cardi', 'with a hand-knitted cardigan');
  assert.ok(s.disg > 0.3);
});
