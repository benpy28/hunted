// Syntax check: every source module, plus the bundled single-file game, must parse.
// The bundle shares one scope across modules, so this also catches two modules
// declaring the same top-level name.
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'hunted-syntax-'));
const check = (file) => execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
let n = 0;
for (const f of readdirSync(join(root, 'src')).filter((f) => f.endsWith('.js'))) { check(join(root, 'src', f)); n++; }
const html = readFileSync(join(root, 'dist/hunted.html'), 'utf8');
const m = html.match(/<script type="module">([\s\S]*)<\/script>/);
if (!m) throw new Error('dist/hunted.html has no module script. Run npm run build first');
const bundle = join(tmp, 'bundle.mjs');
writeFileSync(bundle, m[1]);
check(bundle);
console.log(`syntax ok: ${n} modules + bundle`);
