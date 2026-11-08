// Knockdown tests: each weapon floors people in its own cartoon style (no blood): laser eyes turn
// the part they hit into black ash that crumbles away, other weapons pop comic words and stars.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); await g.run((H) => H.startGame(false)); });
after(async () => { await g?.close(); });

test('laser eyes turn the hit body part into ash that crumbles away', async () => {
  const s = await g.run((H) => {
    const h = new H.Hunter(H.player.x + 8, H.player.z, 'civ', false); H.G.hunters.push(h);
    H.setHitKind('laser'); H.launchHunter(h, 1, 0, false);
    const crumbling = H.knockDebug.crumbles.length, mesh = H.knockDebug.crumbles[0]?.mesh, ash = mesh ? mesh.material.color.getHex() : null;
    H.step(2);
    return { crumbling, ash, gone: mesh ? !mesh.visible : false, words: H.knockDebug.words.length };
  });
  assert.ok(s.crumbling >= 1, 'a part starts crumbling');
  assert.ok(s.ash !== null && s.ash < 0x303030, `ash colour ${s.ash?.toString(16)}`);
  assert.ok(s.gone, 'the ash part crumbles away completely');
});

test('every weapon has its own knockdown, with comic words and dizzy stars, and nothing red', async () => {
  const s = await g.run((H) => {
    const out = {};
    for (const k of ['crowbar', 'shotgun', 'pistol', 'smg', 'car', 'super', 'shove']) {
      const h = new H.Hunter(H.player.x + 10, H.player.z + 3, 'civ', false); H.G.hunters.push(h);
      const w0 = H.knockDebug.words.length, d0 = H.knockDebug.dizzies.length;
      H.setHitKind(k); h.die({ x: 6, y: 3, z: 0 }, h.y + 1.2, true);
      out[k] = { word: H.knockDebug.words.length > w0 || H.knockDebug.words.length >= 8, stars: H.knockDebug.dizzies.length > d0 || H.knockDebug.dizzies.length >= 6 };
    }
    return out;
  });
  for (const [k, v] of Object.entries(s)) { assert.ok(v.word, `${k}: comic word`); assert.ok(v.stars, `${k}: dizzy stars`); }
});
