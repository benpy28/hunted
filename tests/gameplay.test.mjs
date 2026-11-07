// Gameplay tests: drive the game through its debug hooks and check the rules hold.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); });
after(async () => { await g?.close(); });
beforeEach(async () => { await g.run((H) => H.startGame(false)); });

test('days roll over as time passes', async () => {
  const s = await g.run((H) => { H.G.elapsed = 89; H.step(2); return H.G.day; });
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
  const s = await g.run((H) => { H.G.elapsed = 90 * 30 - 0.5; H.G.day = 30; H.step(1); return { mode: H.G.mode, title: document.getElementById('over-title').textContent }; });
  assert.equal(s.mode, 'over');
  assert.equal(s.title, 'YOU SURVIVED');
});

test('no script errors across the whole session', () => { assert.deepEqual(g.errors, []); });
