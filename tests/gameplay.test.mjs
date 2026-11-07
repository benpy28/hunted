// Gameplay tests: drive the game through its debug hooks and check the rules hold.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); });
after(async () => { await g?.close(); });
beforeEach(async () => { await g.run((H) => H.startGame(false)); });

test('days roll over as time passes', async () => {
  const s = await g.run((H) => { H.G.elapsed = H.CFG.dayLength - 1; H.step(2); return H.G.day; });
  assert.equal(s, 2);
});

test('heat raises your profile and drains once nobody can see you', async () => {
  const s = await g.run((H) => {
    // clear the area so nobody keeps eyes on you
    for (const h of H.G.hunters) h.remove();
    H.G.hunters.length = 0;
    H.addHeat(70);
    H.step(0.2);
    const peak = H.G.level;
    const heat0 = H.G.heat;
    H.G.unseenT = 99;
    H.step(8);
    return { peak, heat0, heat1: H.G.heat };
  });
  assert.ok(s.peak >= 2, `profile should be at least KNOWN FACE, was ${s.peak}`);
  assert.ok(s.heat1 < s.heat0, `heat should fall while unseen (${s.heat0} -> ${s.heat1})`);
});

test('aircraft never hurt you', async () => {
  const s = await g.run((H) => {
    for (const h of H.G.hunters) h.remove();
    H.G.hunters.length = 0;
    H.addHeat(300);
    const hp0 = H.player.hp;
    for (let i = 0; i < 20; i++) { H.step(1); for (const h of H.G.hunters) h.remove(); H.G.hunters.length = 0; }
    return { hp0, hp: H.player.hp, helis: H.G.helis.length, drones: H.G.drones.length };
  });
  assert.ok(s.helis + s.drones > 0, 'aircraft should be up at PUBLIC ENEMY');
  assert.equal(s.hp, s.hp0, 'only ground hunters can hurt you');
});

test('owned weapons can be swapped to', async () => {
  const s = await g.run((H) => {
    H.player.cash = 500;
    H.player.owned.add('crowbar');
    H.selectWeapon('crowbar');
    return H.player.weapon;
  });
  assert.equal(s, 'crowbar');
});

test('the run ends when you are caught', async () => {
  const s = await g.run((H) => { H.player.hp = 0; H.player.alive = false; H.G.overT = 0.1; H.step(0.5); return { mode: H.G.mode, title: document.getElementById('over-title').textContent }; });
  assert.equal(s.mode, 'over');
  assert.equal(s.title, 'CAUGHT');
});

test('surviving every day wins', async () => {
  const s = await g.run((H) => { H.G.elapsed = H.CFG.dayLength * H.CFG.days - 0.5; H.G.day = H.CFG.days; H.step(1); return { mode: H.G.mode, title: document.getElementById('over-title').textContent }; });
  assert.equal(s.mode, 'over');
  assert.equal(s.title, 'YOU SURVIVED');
});

test('you start with empty hands, and pressing the slot you are on puts it away', async () => {
  const s = await g.run((H) => {
    const start = H.player.weapon;
    H.selectWeapon('pistol'); const drawn = H.player.weapon;
    H.player.switchT = 0; H.selectWeapon('pistol'); const away = H.player.weapon;
    const slots = document.querySelectorAll('#hud-slots .slot').length;
    return { start, drawn, away, slots };
  });
  assert.equal(s.start, 'hands');
  assert.equal(s.drawn, 'pistol');
  assert.equal(s.away, 'hands');
  assert.equal(s.slots, 4);
});

test('what you hold changes how much you stand out: hands < crowbar < gun', async () => {
  const s = await g.run((H) => {
    H.player.owned.add('crowbar'); H.player.owned.add('shotgun');
    const read = (w) => { if (H.player.weapon !== w) H.selectWeapon(w); H.player.drawnT = 99; H.player.sprinting = false; H.step(0.1); return H.G.conspic; };
    return { hands: read('hands'), crowbar: read('crowbar'), pistol: read('pistol'), shotgun: read('shotgun') };
  });
  assert.ok(s.hands < s.crowbar, JSON.stringify(s));
  assert.ok(s.crowbar < s.pistol, JSON.stringify(s));
  assert.ok(s.pistol <= s.shotgun, JSON.stringify(s));
});

test('every day has a goal, and the supply drop pays out when you grab it', async () => {
  const s = await g.run((H) => {
    const O = H.MH.objective, kind = O.kind, cash0 = H.player.cash, lives0 = H.MH.lifelines;
    H.player.x = O.x; H.player.z = O.z; H.player.y = H.groundY(O.x, O.z);
    H.step(0.2);
    return { kind, done: O.done, cash: H.player.cash - cash0, lives: H.MH.lifelines - lives0, goal: document.getElementById('hud-goal').textContent };
  });
  assert.equal(s.kind, 'drop', 'day 1 is always a supply drop');
  assert.ok(s.done, 'grabbing it completes the goal');
  assert.ok(s.cash > 0 || s.lives > 0, 'it pays out');
  assert.match(s.goal, /TODAY/);
});

test('a second chance saves you once, then getting caught ends it', async () => {
  const s = await g.run((H) => {
    const lives = H.MH.lifelines;
    H.hurtPlayer(500, H.player.x + 1, H.player.z);
    const saved = { alive: H.player.alive, hp: H.player.hp, lives: H.MH.lifelines };
    H.MH.invulnT = 0;
    H.hurtPlayer(500, H.player.x + 1, H.player.z);
    const second = H.player.alive;
    H.step(2.5);
    return { lives, saved, second, mode: H.G.mode };
  });
  assert.equal(s.lives, 1, 'you start with one second chance');
  assert.ok(s.saved.alive && s.saved.hp > 0 && s.saved.lives === 0, JSON.stringify(s.saved));
  assert.equal(s.second, false);
  assert.equal(s.mode, 'over');
});

test('other runners get caught over the days and it makes the news', async () => {
  const s = await g.run((H) => {
    const total = H.MH.runners.length + 1;
    H.G.elapsed = H.CFG.dayLength * 10; H.step(0.2);
    const left = 1 + H.MH.runners.filter((r) => !r.caught).length;
    const last = H.MH.runners.reduce((a, r) => (r.at > a.at ? r : a));
    return { total, left, lastAt: last.at, days: H.CFG.days };
  });
  assert.equal(s.total, 12);
  assert.ok(s.left < s.total && s.left > 1, `by day 11 some runners are out (${s.left} left)`);
  assert.ok(s.lastAt > s.days - 1, 'one rival lasts until the final day');
});

test('days 3+ schedule a sweep with a warning', async () => {
  const s = await g.run((H) => {
    H.G.elapsed = H.CFG.dayLength * 3 - 0.2; H.step(0.4);
    return { mode: H.G.mode, el: H.G.elapsed, day: H.G.day, sweeps: H.MH.sweeps.length, trackers: H.G.hunters.filter((h) => h.tracker).length, recap: !document.getElementById('hud-recap').classList.contains('hidden') };
  });
  assert.equal(s.day, 4, JSON.stringify(s));
  assert.ok(s.sweeps >= 1);
  assert.ok(s.trackers >= 1, 'trackers join each morning');
  assert.ok(s.recap, 'the end-of-day recap card shows');
});

test('the final day opens an extraction you can hold to escape clean', async () => {
  const s = await g.run((H) => {
    H.G.elapsed = H.CFG.dayLength * (H.CFG.days - 1) - 0.1; H.step(0.3);
    const X = H.MH.extract; if (!X) return { none: true };
    // jump to the evening
    while (H.G.hour < 18.2 && H.G.mode === 'playing') { H.G.elapsed += 1; H.step(1 / 30); }
    H.G.hunters.forEach((h) => h.remove()); H.G.hunters.length = 0;
    for (let i = 0; i < 20 && H.G.mode === 'playing'; i++) { H.player.x = X.x; H.player.z = X.z; H.player.hp = 100; H.MH.invulnT = 99; H.step(1); }
    return { open: X.open, mode: H.G.mode, title: document.getElementById('over-title').textContent };
  });
  assert.ok(!s.none, 'extraction exists on the final day');
  assert.ok(s.open);
  assert.equal(s.mode, 'over');
  assert.equal(s.title, 'CLEAN ESCAPE');
});



test('aircraft run out of fuel and leave, with a gap before the next one', async () => {
  const s = await g.run((H) => {
    H.addHeat(150); H.step(4);
    const a = H.G.helis[0] || H.G.drones[0]; if (!a) return { none: true };
    a.fuel = 0.01; H.step(0.2);
    return { leaving: a.leaving, gap: H.G.airGapT };
  });
  assert.ok(!s.none, 'an aircraft came up at WANTED');
  assert.ok(s.leaving);
  assert.ok(s.gap > 20);
});

test('a rival runner can show up, and pinning them takes them out of the game', async () => {
  const s = await g.run((H) => {
    H.G.elapsed = H.CFG.dayLength * 2 + 1; H.step(0.2);
    H.MH.rivalT = 0; H.step(0.2);
    const r = H.MH.rival; if (!r || !r.h) return { none: true };
    const left0 = 1 + H.MH.runners.filter((x) => !x.caught).length, lives0 = H.MH.lifelines;
    r.h.x = H.player.x + 1; r.h.z = H.player.z; r.h.stun = 1; H.step(0.1);
    return { caught: r.caught, left: 1 + H.MH.runners.filter((x) => !x.caught).length, left0, lives: H.MH.lifelines - lives0 };
  });
  assert.ok(!s.none, 'a rival spawned');
  assert.ok(s.caught);
  assert.equal(s.left, s.left0 - 1);
  assert.equal(s.lives, 1);
});

test('no script errors across the whole session', () => { assert.deepEqual(g.errors, []); });
