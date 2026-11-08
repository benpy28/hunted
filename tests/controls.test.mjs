// Controls: desktop gets mouse look (even where pointer lock is refused, as in embedded pages),
// touch controls only appear on real touch devices or once the screen is actually touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

const state = (g) => g.run(() => ({
  touchUi: !document.getElementById('touch').classList.contains('hidden'),
  bodyTouch: document.body.classList.contains('is-touch'),
}));

test('desktop: no touch controls, and dragging the mouse turns the camera when pointer lock is unavailable', async () => {
  const g = await openGame();
  try {
    await g.run((H) => { H.startGame(false); });
    assert.deepEqual(await state(g), { touchUi: false, bodyTouch: false });
    const yaw0 = await g.run((H) => H.player.yaw);
    await g.page.mouse.move(480, 270);
    await g.page.mouse.down();
    for (let i = 1; i <= 10; i++) await g.page.mouse.move(480 + i * 20, 270);
    await g.page.mouse.up();
    const yaw1 = await g.run((H) => H.player.yaw);
    assert.ok(Math.abs(yaw1 - yaw0) > 0.3, `camera should turn when dragging (${yaw0} -> ${yaw1})`);
    assert.deepEqual(g.errors, []);
  } finally { await g.close(); }
});

test('a browser that supports touch events (like a touchscreen laptop) still gets the mouse until the screen is touched', async () => {
  const g = await openGame({}, () => { window.ontouchstart = null; }); // what tripped the old check
  try {
    await g.run((H) => { H.startGame(false); });
    assert.deepEqual(await state(g), { touchUi: false, bodyTouch: false });
    const cdp = await g.page.context().newCDPSession(g.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 700, y: 300 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual(await state(g), { touchUi: true, bodyTouch: true }, 'touching switches to touch controls');
    await g.page.mouse.move(300, 300); await g.page.mouse.move(340, 320);
    assert.deepEqual(await state(g), { touchUi: false, bodyTouch: false }, 'using the mouse switches back');
  } finally { await g.close(); }
});

test('a phone gets touch controls straight away', async () => {
  const g = await openGame({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });
  try {
    await g.run((H) => { H.startGame(false); });
    assert.deepEqual(await state(g), { touchUi: true, bodyTouch: true });
  } finally { await g.close(); }
});

test('touch: a POSE button shows up in Superpower mode and strikes the hero pose', async () => {
  const g = await openGame({ hasTouch: true, isMobile: true });
  try {
    await g.run((H) => { H.startGame(false); });
    const cdp = await g.page.context().newCDPSession(g.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 700, y: 300 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const hidden = () => g.run(() => document.getElementById('btn-pose').classList.contains('hidden'));
    assert.equal(await hidden(), true, 'no pose button for a normal runner');
    await g.run((H) => { H.startGame(true); });
    assert.equal(await hidden(), false, 'the hero gets a pose button');
    assert.equal(await g.run((H) => H.HERO.poseT), 0);
    await g.page.tap('#btn-pose');
    const s = await g.run((H) => ({ poseT: H.HERO.poseT, cd: H.HERO.poseCd }));
    assert.ok(s.poseT > 0 && s.cd > 0, `tapping POSE poses (${JSON.stringify(s)})`);
    await g.run((H) => H.step(0.2));
    assert.equal(await g.run(() => document.getElementById('btn-pose').classList.contains('cooling')), true, 'dimmed while it recharges');
    assert.deepEqual(g.errors, []);
  } finally { await g.close(); }
});
