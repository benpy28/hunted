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
  // Render one frame and read it back in the same task (the drawing buffer is
  // only valid until the browser composites). A Playwright screenshot waits for
  // a stable frame, which software WebGL on CI can take ~30s to produce.
  const s = await g.run((H) => {
    const r = H.renderer, gl = r.getContext();
    r.render(H.scene, H.camera);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4);
    const seen = new Set(); let lit = 0, n = 0;
    for (let gy = 1; gy < 12; gy++) for (let gx = 1; gx < 16; gx++) {
      gl.readPixels(Math.floor(w * gx / 16), Math.floor(h * gy / 12), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      seen.add((px[0] >> 4) + ',' + (px[1] >> 4) + ',' + (px[2] >> 4)); if (px[0] + px[1] + px[2] > 30) lit++; n++;
    }
    return { colours: seen.size, lit, n, w, h };
  });
  assert.ok(s.w > 0 && s.h > 0, 'canvas has a drawing buffer');
  assert.ok(s.colours >= 4, `frame looks flat: ${JSON.stringify(s)}`);
  assert.ok(s.lit > s.n / 4, `frame looks black: ${JSON.stringify(s)}`);
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
