// Superpower mode tests: THE PARAGON gets bored, people crumble under the stare and clap when he
// poses, critics take it back, and super villains wait at their lairs until you go to them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
let home; // where the run starts: out on an open street
before(async () => { g = await openGame(); home = await g.run((H) => { H.startGame(true); return { x: H.player.x, y: H.player.y, z: H.player.z }; }); });
after(async () => { await g?.close(); });

test('four original villains sit at their lairs on the map and leave you alone at a distance', async () => {
  const s = await g.run((H) => {
    const hp0 = H.player.hp;
    H.step(8);
    return { n: H.villains.length, names: H.villains.map((V) => V.def.name), states: H.villains.map((V) => V.state), hp: H.player.hp, hp0 };
  });
  assert.equal(s.n, 4, s.names.join(','));
  assert.deepEqual(s.states, ['lair', 'lair', 'lair', 'lair']);
  assert.ok(s.hp >= s.hp0, 'nobody attacked');
});

test('go to a villain and they fight; laser them down and they are beaten', async () => {
  const s = await g.run((H) => {
    const V = H.villains[0];
    H.player.x = V.x + 25; H.player.z = V.z; H.player.y = H.floorAt(H.player.x, H.player.z, 1);
    H.step(0.5);
    const engaged = V.state, fight = H.G.villainFight === V;
    H.player.hp = 100; let hurt = false;
    for (let i = 0; i < 40 && !hurt; i++) { H.step(0.25); if (H.player.hp < 99) hurt = true; H.player.x = V.x + 15; H.player.z = V.z; }
    H.HERO.bored = 0.9;
    for (let i = 0; i < 400 && V.state === 'fight'; i++) H.villainHit(V, 1, H.HC);
    return { engaged, fight, hurt, after: V.state, bored: H.HERO.bored, beaten: H.G.villainsBeaten };
  });
  assert.equal(s.engaged, 'fight'); assert.ok(s.fight);
  assert.ok(s.hurt, 'the villain landed a hit on the hero');
  assert.equal(s.after, 'down'); assert.equal(s.beaten, 1);
  assert.ok(s.bored < 0.2, `boredom after a fight: ${s.bored}`);
});

test('boredom creeps up when nothing is happening', async () => {
  const s = await g.run((H) => { // the last test left us at a lair; send the villains home so nothing kicks off
    for (const V of H.villains) { V.state = 'gone'; V.downT = 0; V.g.visible = false; }
    H.HERO.bored = 0.1; H.G.villainFight = null; H.step(20); return H.HERO.bored; });
  assert.ok(s > 0.2, `bored: ${s}`);
});

test('stare at someone long enough and they crumble', async () => {
  const s = await g.run((H, home) => {
    for (const V of H.villains) { V.state = 'gone'; V.downT = 0; V.g.visible = false; }
    // back to the open street the run started on (the lair from earlier tests is full of walls)
    Object.assign(H.player, { x: home.x, y: home.y, z: home.z, flying: false });
    // stand on an open pavement at street level (the start point can be on a roof or by a ledge, where the
    // person you stare at would end up below your line of sight)
    const b = H.lifeSpots.find((L) => L.kind === 'bench' && H.floorAt(L.x, L.z, 1) < 0.5);
    if (b) { H.player.x = b.x; H.player.z = b.z; H.player.y = H.floorAt(b.x, b.z, 1); H.player.flying = false; H.player.vx = H.player.vz = H.player.vy = 0; }
    const x = H.player.x, z = H.player.z, y = H.player.y;
    for (const o of H.G.hunters) if (Math.hypot(o.x - x, o.z - z) < 45) o.remove();
    // pick a side with a clear view (the player may be standing next to a wall)
    const [ox, oz] = [[0, 8], [0, -8], [8, 0], [-8, 0], [6, 6], [-6, -6]].find(([a, b]) => Math.abs(H.floorAt(x + a, z + b, y + 1) - y) < 0.3 && H.losSolid(x, y + 1.6, z, x + a, y + 1.6, z + b)) || [0, 8];
    const h = new H.Hunter(x + ox, z + oz, 'civ', false); h.y = y; H.G.hunters.push(h);
    let crumbled = false;
    for (let i = 0; i < 120 && !crumbled; i++) { h.x = x + ox; h.z = z + oz; h.inside = false; H.camera.position.set(x, y + 1.6, z); H.camera.lookAt(h.x, h.y + 1.6, h.z); H.camera.updateMatrixWorld(); H.step(1 / 30); crumbled = !!h.crumbled; }
    return { crumbled, cower: h.cowerT };
  }, home);
  assert.ok(s.crumbled, 'they should crumble under the stare');
});

test('strike a pose and the street applauds; critics take it back when you show up', async () => {
  const s = await g.run((H) => {
    const x = H.player.x, z = H.player.z;
    const crowd = []; for (let i = 0; i < 6; i++) { const h = new H.Hunter(x + 6 + i, z + 6, 'civ', false); H.G.hunters.push(h); crowd.push(h); }
    H.HERO.poseCd = 0; H.heroPoseCmd(H.HC);
    const clapping = crowd.filter((h) => h.clapT > 0 || h.slacker).length;
    const c = new H.Hunter(x + 30, z, 'civ', false); H.G.hunters.push(c);
    H.HC.G.super = true; H.LIFE.critic(c, crowd[0]);
    const flagged = c.critic && H.HERO.critics.includes(c);
    H.player.x = c.x - 3; H.player.z = c.z; H.step(0.3);
    return { clapping, flagged, recanted: !c.critic };
  });
  assert.equal(s.clapping, 6);
  assert.ok(s.flagged, 'super hearing flags the critic');
  assert.ok(s.recanted, 'the critic takes it back up close');
});
