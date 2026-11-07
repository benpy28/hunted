// The town's week: days of the week, who's out at what hour, big market days, the fun run, the village
// fete, pub quiz night, and the diary on the pause screen.
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
      H.player.vx = H.player.vz = 0; H.player.hp = 80; H.player.alive = true; H.player.car = null; H.player.bike = null; H.player.mode = 'move';
      H.G.heat = 0; H.G.level = 0; H.G.lastSeenT = 99; H.input.crouch = false; H.player.crouch = 0; H.player.sprinting = false; H.input.sprint = false; H.input.fwd = 0;
      H.player.cash = 500; H.player.outfit = {}; H.player.disg = 0; H.G.day = 1;
    };
    H.goTo = (H, x, z) => { H.player.x = x; H.player.z = z; H.player.y = H.floorAt(x, z, 1.5); H.player.vx = H.player.vz = 0; H.navRecenter(x, z, true); };
    H.stepAt = (H, secs, hour = 10, each) => { for (let i = 0; i < secs * 30; i++) { H.G.hour = hour; H.step(1 / 30); if (each && each()) return true; } return false; };
  });
});
after(async () => { await g?.close(); });

test('the week: day 1 is a Friday, and each day has its own events', async () => {
  const s = await g.run((H) => ({
    names: [1, 2, 3, 4, 7, 8].map((d) => H.dayNameOf(d)),
    sat: H.eventsOn(2).map((E) => E.id).sort(), sun: H.eventsOn(3).map((E) => E.id), thu: H.eventsOn(7).map((E) => E.id), mon: H.eventsOn(4).map((E) => E.id),
    hud: document.getElementById('hud-day').textContent,
  }));
  assert.deepEqual(s.names, ['FRIDAY', 'SATURDAY', 'SUNDAY', 'MONDAY', 'THURSDAY', 'FRIDAY']);
  assert.ok(s.sat.includes('fete') && s.sat.includes('market'), `saturday: ${s.sat}`);
  assert.ok(s.sun.includes('funrun'), `sunday: ${s.sun}`);
  assert.ok(s.thu.includes('quiz'), `thursday: ${s.thu}`);
  assert.ok(s.mon.includes('school') && !s.sun.includes('school'), 'school on weekdays only');
  assert.match(s.hud, /FRI/);
});

test('who is out depends on the hour: office rush hours, teens after school, pensioners in the morning', async () => {
  const s = await g.run((H) => {
    const count = (hr, day, x, z, n = 220) => {
      H.G.hour = hr; H.G.day = day; const c = {};
      for (let i = 0; i < n; i++) { const h = new H.Hunter(x, z, 'civ', false); c[h.folk] = (c[h.folk] || 0) + 1; h.remove(); }
      return c;
    };
    const PH = [0, 0], ASH = [700, 0];
    const rush = count(8.3, 4, ...PH), mid = count(10.5, 4, ...PH), sat = count(10.5, 2, ...PH);
    const school = count(11, 4, ...ASH), after = count(16, 4, ...ASH);
    const morning = count(9, 4, ...ASH), late = count(21, 4, ...ASH);
    H.G.day = 1;
    return { rushOffice: rush.office || 0, midOffice: mid.office || 0, satOffice: sat.office || 0, schoolTeen: school.teen || 0, afterTeen: after.teen || 0, amPens: morning.pensioner || 0, pmPens: late.pensioner || 0 };
  });
  assert.ok(s.rushOffice > s.midOffice * 1.8, `office types: rush ${s.rushOffice} vs mid-morning ${s.midOffice}`);
  assert.ok(s.satOffice < s.rushOffice / 2, `fewer office types on a Saturday (${s.satOffice})`);
  assert.ok(s.afterTeen > s.schoolTeen * 3, `teens: school hours ${s.schoolTeen} vs after school ${s.afterTeen}`);
  assert.ok(s.amPens > s.pmPens * 4, `pensioners: morning ${s.amPens} vs evening ${s.pmPens}`);
});

test('everyone keeps their own hours: dockers on shift, office lunch, pensioners home by dark, no pub with the kids', async () => {
  const s = await g.run((H) => {
    const top = (folk, hr, day = 4, o = {}) => { const w = H.folkWants({ folk, x: 0, z: 0, ...o }, hr, day); return Object.keys(w).sort((a, b) => w[b] - w[a])[0]; };
    const kidW = H.folkWants({ folk: 'parent', kid: {}, x: 0, z: 0 }, 19, 4);
    const quiz = H.folkWants({ folk: 'student', x: 0, z: 0 }, 20, 7).drink, normal = H.folkWants({ folk: 'student', x: 0, z: 0 }, 20, 6).drink;
    return { docker: top('docker', 8), office: top('office', 13), pens: top('pensioner', 19), fisher: top('fisher', 5), teen: top('teen', 16.5), kidDrink: kidW.drink || 0, quiz, normal, crowdNight: H.crowdMul(3, 4, 'PORT HALDEN'), crowdRush: H.crowdMul(8.5, 4, 'PORT HALDEN') };
  });
  assert.equal(s.docker, 'work'); assert.equal(s.office, 'eat'); assert.equal(s.pens, 'home'); assert.equal(s.fisher, 'work'); assert.equal(s.teen, 'play');
  assert.equal(s.kidDrink, 0, 'no pub with the kids');
  assert.ok(s.quiz > s.normal * 2, 'quiz night packs the bars');
  assert.ok(s.crowdRush > s.crowdNight * 1.5, 'rush hour busier than the small hours');
});

test('big market day: every stall gets a trader; on quiet days only some do', async () => {
  const s = await g.run((H) => {
    const run = (day) => {
      H.fresh(H); H.G.day = day;
      const M = H.markets.find((m) => m.city === 'PORT HALDEN'); for (const st of M.stalls) { const v = H.vendorOf(st.spot); if (v) v.remove(); H.cityLifeDebug.vendorCarts.delete(st.spot); }
      H.goTo(H, M.x, M.z + 2); H.stepAt(H, 30, 10);
      return M.stalls.filter((st) => H.vendorOf(st.spot) && !H.vendorOf(st.spot).dead).length / M.stalls.length;
    };
    return { quiet: run(1), big: run(2) };
  });
  assert.ok(s.big > 0.95, `market day staffing ${s.big}`);
  assert.ok(s.quiet < 0.75 && s.quiet > 0.4, `quiet day staffing ${s.quiet}`);
});

test('on market day the crowd goes round the stalls', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 2;
    const M = H.markets.find((m) => m.city === 'PORT HALDEN'); H.goTo(H, M.x + 10, M.z + 10); H.player.outfit = {}; H.G.level = 0;
    let best = 0;
    H.stepAt(H, 60, 11, () => { for (const h of H.G.hunters) h.sus = 0; best = Math.max(best, H.G.hunters.filter((h) => h.act && h.act.kind === 'browse' && h.act.stall).length); return best >= 4; }); // nobody's looking at you: they're shopping
    return { best };
  });
  assert.ok(s.best >= 4, `only ${s.best} people browsing the stalls`);
});

test('the fun run: runners in bibs lap the Spire; pin on a bib and running stops looking suspicious', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 3; // Sunday
    const F = H.funRun; H.goTo(H, F.table.x, F.table.z + 0.5);
    H.stepAt(H, 20, 10);
    const racers = H.G.hunters.filter((h) => h.racer && !h.dead);
    const bibs = racers.filter((h) => h.bib).length, lapping = racers.filter((h) => h.act && h.act.kind === 'lap').length;
    const arch = F.group.visible;
    // sprint along the course without a bib, then with one
    const sprintC = () => { H.player.sprinting = true; H.input.sprint = true; H.input.fwd = 1; H.G.hour = 10; H.step(1 / 30); return H.G.conspic; };
    const [x0, z0] = F.corners[0]; H.goTo(H, x0 + 10, z0);
    const without = sprintC();
    H.goTo(H, F.table.x, F.table.z + 0.5); H.input.sprint = false; H.input.fwd = 0; H.G.hour = 10;
    const T = H.townUseTarget(H.TDK); if (T) H.townUse(T, H.TDK);
    H.goTo(H, x0 + 10, z0); const withBib = sprintC();
    H.input.sprint = false; H.input.fwd = 0;
    return { racers: racers.length, bibs, lapping, arch, target: T && T.kind, without, withBib, bibDay: H.TD_STATE.bibDay };
  });
  assert.ok(s.arch, 'the start arch is up');
  assert.ok(s.racers >= 8, `only ${s.racers} runners`);
  assert.equal(s.bibs, s.racers, 'every runner wears a bib');
  assert.ok(s.lapping >= s.racers / 2, `${s.lapping} lapping`);
  assert.equal(s.target, 'bib');
  assert.ok(s.withBib < s.without - 0.5, `with a bib ${s.withBib} vs without ${s.without}`);
});

test('run a lap of the fun run course with your bib on and they hang a medal on you', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 3; H.TD_STATE.bibDay = 3; H.TD_STATE.lapCorners = 0; H.TD_STATE.medalDay = 0;
    const F = H.funRun, cash0 = H.player.cash, m0 = H.TD_STATE.medals;
    for (const [x, z] of F.corners) { H.goTo(H, x, z); H.stepAt(H, 0.2, 10); }
    H.goTo(H, F.start.x, F.start.z); H.stepAt(H, 0.3, 10);
    return { medals: H.TD_STATE.medals - m0, cash: H.player.cash - cash0 };
  });
  assert.equal(s.medals, 1);
  assert.ok(s.cash >= 15);
});

test('the village fete: bunting up, a crowd on the school field, a tombola and cakes', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 2; // Saturday
    const F = H.schoolInfo.field; H.goTo(H, F.x, F.z0 + 8);
    H.stepAt(H, 25, 12);
    const crowd = H.G.hunters.filter((h) => h.feteGoer && !h.dead && h.x > F.x0 - 3 && h.x < F.x1 + 3 && h.z > F.z0 - 3 && h.z < F.z1 + 3).length;
    const vis = H.fete.group.visible;
    H.G.hour = 12; H.goTo(H, H.fete.tombola.x, H.fete.tombola.z); const t1 = H.townUseTarget(H.TDK); const c0 = H.player.cash, n0 = H.TD_STATE.tombola; H.townUse(t1, H.TDK); const paid = c0 - H.player.cash, goes = H.TD_STATE.tombola - n0;
    H.G.hour = 12; H.goTo(H, H.fete.cakes.x, H.fete.cakes.z); const t2 = H.townUseTarget(H.TDK); H.player.hp = 50; const hp0 = H.player.hp; H.townUse(t2, H.TDK);
    H.G.day = 3; H.step(0.1); const gone = !H.fete.group.visible;
    return { crowd, vis, t1: t1 && t1.kind, paid, goes, t2: t2 && t2.kind, healed: H.player.hp - hp0, gone };
  });
  assert.ok(s.vis, 'fete is set up on Saturday');
  assert.ok(s.crowd >= 8, `only ${s.crowd} at the fete`);
  assert.equal(s.t1, 'tombola'); assert.equal(s.goes, 1); assert.ok(s.paid === 2 || s.paid === -18, `paid ${s.paid}`); // -18: won the $20 book token
  assert.equal(s.t2, 'cakes'); assert.ok(s.healed > 0);
  assert.ok(s.gone, 'packed away on Sunday');
});

test('the diary on the pause screen lists today, tomorrow and your perks (J opens it)', async () => {
  const s = await g.run((H) => {
    H.fresh(H); H.G.day = 2; H.GJ_STATE.perks.cardigan = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
    const paused = H.G.mode === 'paused', html = document.getElementById('diary').innerText;
    H.resumeGame(); delete H.GJ_STATE.perks.cardigan; H.G.day = 1;
    return { paused, html };
  });
  assert.ok(s.paused, 'J pauses and opens the diary');
  for (const w of ['SATURDAY', 'TODAY', 'TOMORROW: SUNDAY', 'ASHFORD VILLAGE FETE', 'HALDEN FUN RUN', 'PERKS', 'NANA PEG']) assert.ok(s.html.includes(w), `diary should mention ${w}`);
});
