// Smoke tests: the game loads, starts, renders and simulates without throwing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

let g;
before(async () => { g = await openGame(); });
after(async () => { await g?.close(); });

test('page loads with no script errors and shows the menu', async () => {
  assert.deepEqual(g.errors, []);
  const s = await g.run((H) => ({ mode: H.G.mode, menu: !document.getElementById('menu').classList.contains('hidden'), loading: document.getElementById('loading').classList.contains('hidden') }));
  assert.equal(s.mode, 'menu');
  assert.ok(s.menu, 'menu is visible');
  assert.ok(s.loading, 'loading screen went away');
});

test('WebGL renders a real image (not a blank canvas)', async () => {
  await g.page.waitForTimeout(500);
  // a page screenshot clipped to the canvas: an element screenshot first waits for two animation frames with
  // the same box, and with software WebGL a single frame of the full town can take longer than its timeout
  const box = await g.page.locator('canvas').first().boundingBox();
  const png = await g.page.screenshot({ clip: box, timeout: 90000 });
  assert.ok(png.length > 8000, `screenshot looks blank (${png.length} bytes)`);
});

test('starting a run puts you in the world with hunters around', async () => {
  const s = await g.run((H) => { H.startGame(false); return { mode: H.G.mode, day: H.G.day, hunters: H.G.hunters.length, hp: H.player.hp, cash: H.player.cash, hud: document.getElementById('hud-day').textContent }; });
  assert.equal(s.mode, 'playing');
  assert.equal(s.day, 1);
  assert.ok(s.hunters >= 10, `expected a crowd, got ${s.hunters}`);
  assert.equal(s.hp, 100);
  assert.ok(s.cash > 0 && s.cash < 1000, 'wallet starts small');
});

test('20 seconds of simulation runs cleanly and keeps state sane', async () => {
  const s = await g.run((H) => { H.step(20); return { x: H.player.x, z: H.player.z, y: H.player.y, heat: H.G.heat, elapsed: H.G.elapsed }; });
  for (const k of ['x', 'z', 'y', 'heat']) assert.ok(Number.isFinite(s[k]), `${k} is ${s[k]}`);
  assert.ok(s.elapsed > 19);
  assert.deepEqual(g.errors, []);
});

test('superpower mode starts with laser eyes', async () => {
  const s = await g.run((H) => { H.startGame(true); H.step(3); const r = { weapon: H.player.weapon, super: H.G.super }; H.startGame(false); return r; });
  assert.equal(s.weapon, 'laser');
  assert.equal(s.super, true);
  assert.deepEqual(g.errors, []);
});
