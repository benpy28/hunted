// Shared test harness: opens the built single-file game in headless Chromium
// (software WebGL, so it runs on CI machines with no GPU) and exposes the
// window.__hunted debug hooks.
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const GAME_URL = pathToFileURL(join(root, 'dist/hunted.html')).href;

export async function openGame() {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebGL|GPU|GL_|AudioContext/i.test(m.text())) errors.push(m.text()); });
  await page.goto(GAME_URL);
  await page.waitForFunction(() => !!window.__hunted, null, { timeout: 120000 });
  return {
    browser, page, errors,
    // run a function inside the page with the hooks object as its first argument
    run: (fn, arg) => page.evaluate(([src, a]) => (0, eval)(`(${src})`)(window.__hunted, a), [fn.toString(), arg]),
    close: () => browser.close(),
  };
}
