// Villain henchmen: every super villain has a crew in matching outfits that loafs about the lair, piles in
// when the boss fights, goes down to the hero's attacks, claps when the hero poses, and runs when the
// boss is beaten.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); await g.run((H) => H.startGame(true)); });
after(async () => { await g?.close(); });

test('each villain has a crew hanging round the lair, and they leave you alone at a distance', async () => {
  const s = await g.run((H) => {
    H.step(3);
    return H.villains.map((V) => {
      const crew = H.henchmen.filter((h) => h.boss === V);
      return { boss: V.def.name, n: crew.length, names: [...new Set(crew.map((h) => h.def.name))], states: [...new Set(crew.map((h) => h.state))], far: Math.max(...crew.map((h) => Math.hypot(h.x - V.x, h.z - V.z))) };
    });
  });
  assert.equal(s.length, 4);
  for (const v of s) {
    assert.ok(v.n >= 4, `${v.boss} has ${v.n} henchmen`);
    assert.equal(v.names.length, 1, 'one crew name per boss');
    assert.deepEqual(v.states, ['lair']);
    assert.ok(v.far < 16, `${v.boss}'s crew wandered ${v.far.toFixed(1)}m from the boss`);
  }
});

test('start a fight and the crew piles in: brawlers punch, throwers lob things, and it hurts', async () => {
  const s = await g.run((H) => {
    const V = H.villains.find((v) => v.def.name === 'SLAGHEAP'), crew = H.henchmen.filter((h) => h.boss === V);
    H.player.x = V.x + 20; H.player.z = V.z; H.player.y = H.floorAt(H.player.x, H.player.z, 1); H.player.flying = false;
    H.step(0.3);
    const engaged = V.state === 'fight' && crew.every((h) => h.state === 'fight');
    H.player.hp = 100; let closest = 99;
    for (let i = 0; i < 60; i++) {
      V.atkT = 99; // keep the boss out of it: only the crew does damage here
      H.step(0.2);
      H.player.x = V.x + 20; H.player.z = V.z; H.player.y = H.floorAt(H.player.x, H.player.z, 1); H.player.hp = Math.max(H.player.hp, 40);
      for (const h of crew) closest = Math.min(closest, Math.hypot(h.x - H.player.x, h.z - H.player.z));
    }
    return { engaged, closest, hurt: H.player.hp < 100 };
  });
  assert.ok(s.engaged, 'the crew joined the fight');
  assert.ok(s.closest < 3, `nobody came to punch (closest ${s.closest.toFixed(1)}m)`);
  assert.ok(s.hurt, 'the crew never landed a hit');
});

test('henchmen go down to the laser and a swat, and clap when the hero poses', async () => {
  const s = await g.run((H) => {
    const V = H.villains.find((v) => v.def.name === 'COLDSNAP'), crew = H.henchmen.filter((h) => h.boss === V);
    H.player.x = crew[0].x + 3; H.player.z = crew[0].z; H.player.y = H.floorAt(H.player.x, H.player.z, 1);
    H.HERO.poseCd = 0; H.heroPoseCmd(H.HC);
    const clapping = crew.filter((h) => h.clapT > 0).length;
    // laser: lots of small hits; a swat: one big one
    for (let i = 0; i < 40; i++) H.villainHit(crew[0], 0.9, H.HC);
    H.villainHit(crew[1], 12, H.HC, 5, 0); H.villainHit(crew[1], 12, H.HC, 5, 0); H.villainHit(crew[1], 12, H.HC, 5, 0);
    H.step(0.5);
    return { clapping, a: crew[0].state, b: crew[1].state, boss: V.state, n: crew.length };
  });
  assert.ok(s.clapping >= 2, `only ${s.clapping} clapped`);
  assert.equal(s.a, 'down');
  assert.equal(s.b, 'down');
  assert.equal(s.boss, 'fight', 'hitting the crew brings the boss');
});

test('beat the boss and the rest of the crew runs off, then they all come back with the boss', async () => {
  const s = await g.run((H) => {
    const V = H.villains.find((v) => v.def.name === 'HEXWIRE'), crew = H.henchmen.filter((h) => h.boss === V);
    H.player.x = V.x + 20; H.player.z = V.z; H.player.y = H.floorAt(H.player.x, H.player.z, 1);
    H.step(0.3);
    H.villainHit(V, 999, H.HC);
    H.step(1);
    const fleeing = crew.filter((h) => h.state === 'flee').length;
    H.step(12);
    const gone = crew.filter((h) => h.state === 'gone').length;
    H.player.x = V.lair.x + 300; H.player.z = V.lair.z; H.player.y = H.floorAt(H.player.x, H.player.z, 1);
    H.step(200);
    return { n: crew.length, fleeing, gone, back: crew.filter((h) => h.state === 'lair').length, boss: V.state };
  });
  assert.equal(s.fleeing, s.n, 'everyone ran');
  assert.equal(s.gone, s.n);
  assert.equal(s.boss, 'lair');
  assert.equal(s.back, s.n, 'the crew came back with the boss');
});
