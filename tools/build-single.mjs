// Bundles the game into one self-contained HTML file (dist/hunted.html) that runs
// by double-clicking it, with no web server. Usage: node tools/build-single.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let three = read('vendor/three.module.min.js');
const exp = three.lastIndexOf('export{');
if (exp < 0) throw new Error('could not find three.js export list');
const list = three.slice(exp + 7, three.indexOf('}', exp));
three = three.slice(0, exp);
const entries = list.split(',').map((s) => {
  const m = s.trim().split(/\s+as\s+/);
  return m.length === 2 ? `${m[1]}:${m[0]}` : `${m[0]}:${m[0]}`;
});

// modules in dependency order; strip imports/exports so they share one scope
const MODULES = ['core', 'world', 'news', 'interiors', 'streets', 'docks', 'audio', 'fx', 'people', 'parkour', 'citylife', 'knockfx', 'cyclists', 'streetprops', 'hero', 'villains', 'shops', 'stealth', 'gigs', 'safehouses', 'allies', 'weather', 'postfx', 'manhunt', 'game'];
const game = MODULES.map((m) => read(`src/${m}.js`)
  .replace(/^import [\s\S]*? from '[^']+';$/gm, '')
  .replace(/^export (const|let|function|class) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?$/gm, '')).join('\n');
const css = read('src/style.css');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script type="module" src="src\/game.js"><\/script>/, () =>
  `<script type="module">\n${three}\nconst THREE = Object.freeze({${entries.join(',')}});\n{\n${game}\n}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/hunted.html'), html);
console.log('wrote dist/hunted.html', (html.length / 1024).toFixed(0) + ' KB');
