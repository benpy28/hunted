import { chromium } from 'playwright';
for (const f of ['/tmp/claude-0/-home-user-hunted/697a296e-8f91-5a32-ab76-af9f61d36854/scratchpad/base.html', '/home/user/hunted/dist/hunted.html']) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto('file://' + f);
  await page.waitForFunction(() => !!window.__hunted, null, { timeout: 120000 });
  const n = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); }));
  const info = await page.evaluate(() => { const r = window.__hunted.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
  console.log(f.split('/').pop(), 'fps', n.toFixed(1), JSON.stringify(info));
  await browser.close();
}
