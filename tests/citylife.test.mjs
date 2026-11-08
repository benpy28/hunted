// City life tests: townsfolk have jobs and things to do (benches, bus stops, food carts, chats,
// phone calls, errands), and drop it all the moment something scary happens.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); await g.run((H) => H.startGame(false)); });
after(async () => { await g?.close(); });

test('the streets have benches, bus stops and food carts to use', async () => {
  const s = await g.run((H) => { const n = {}; for (const L of H.lifeSpots) n[L.kind] = (n[L.kind] || 0) + 1; return n; });
  assert.ok(s.bench >= 40, `benches: ${s.bench}`);
  assert.ok(s.bus >= 6, `bus stop places: ${s.bus}`);
  assert.ok(s.cart >= 3, `food carts: ${s.cart}`);
});

test('after a while people are busy doing different things, and some have jobs', async () => {
  const s = await g.run((H) => {
    for (let i = 0; i < 30; i++) H.spawnHunter(10, 60);
    const kinds = new Set(), jobs = new Set();
    for (let k = 0; k < 12; k++) { H.step(5); for (const h of H.G.hunters) { if (h.act) kinds.add(h.act.kind); if (h.job) jobs.add(h.job); } }
    return { kinds: [...kinds], jobs: [...jobs], dogs: H.cityLifeDebug.dogs.length, chasing: H.G.hunters.filter((h) => h.state === 'chase').length };
  });
  assert.ok(s.kinds.length >= 4, `activities seen: ${s.kinds.join(', ')}`);
  assert.ok(s.jobs.length >= 4, `jobs seen: ${s.jobs.join(', ')}`);
  assert.equal(s.chasing, 0, 'nobody should be chasing a low profile player who is standing still');
});

test('two people can stop for a chat and take turns talking', async () => {
  const s = await g.run((H) => {
    const x = H.player.x + 20, z = H.player.z + 20;
    const a = new H.Hunter(x, z, 'civ', false), b = new H.Hunter(x + 3, z, 'civ', false);
    H.G.hunters.push(a, b);
    let started = false;
    for (let t = 0; t < 40 && !started; t++) { a.act = null; a.wt = { x: a.x, z: a.z }; started = H.lifeStart(a, H.LIFE) && a.act.kind === 'chat' && a.act.conv.b === b; if (!started && a.act) a.act = null; if (b.act && !started) b.act = null; }
    if (!started) return { started };
    let maxLine = 0;
    for (let i = 0; i < 300; i++) { H.step(0.05); if (a.act && a.act.conv) maxLine = Math.max(maxLine, a.act.conv.i); }
    return { started, maxLine };
  });
  assert.ok(s.started, 'a chat should start with the nearby person');
  assert.ok(s.maxLine >= 2, `lines spoken: ${s.maxLine}`);
});

test('someone sitting on a bench jumps up and runs when they panic', async () => {
  const s = await g.run((H) => {
    const spot = H.lifeSpots.find((L) => L.kind === 'bench' && !L.taken && Math.hypot(L.x - H.player.x, L.z - H.player.z) > 15 && Math.hypot(L.x - H.player.x, L.z - H.player.z) < 90);
    const h = new H.Hunter(spot.x, spot.z, 'civ', false); H.G.hunters.push(h);
    spot.taken = h; h.act = { kind: 'sit', tx: spot.x, tz: spot.z, face: spot.face, dur: 60, phase: 'do', t: 0, goT: 0, lineT: 5, spot };
    H.step(1);
    const sitting = h.act && h.act.kind === 'sit' && h.p.legL.rotation.x < -1;
    h.panicT = 5; H.step(0.2);
    return { sitting, after: h.act ? h.act.kind : null, freed: !spot.taken };
  });
  assert.ok(s.sitting, 'should be sitting');
  assert.equal(s.after, null);
  assert.ok(s.freed, 'the bench is free again');
});
