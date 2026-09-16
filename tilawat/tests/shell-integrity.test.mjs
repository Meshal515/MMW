/* The shell has drifted from its precache list before: sw.js kept naming files
   that no longer existed while the modules the app really loads were missing, so
   the app looked cached and then failed offline. These checks read the shell
   instead of trusting the list. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const html = read('index.html');
const sw = read('sw.js');

const list = name => new Set(
  (sw.match(new RegExp(`const ${name}=\\[([\\s\\S]*?)\\];`))?.[1] ?? '')
    .match(/'([^']+)'/g)?.map(s => s.slice(1, -1).replace(/^\.\//, '')) ?? []
);
const precache = list('PRECACHE');
assert.ok(precache.size > 20, 'PRECACHE should be populated');

const attrs = re => [...html.matchAll(re)].map(m => m[1]).filter(u => u.startsWith('./')).map(u => u.slice(2));
const linked = [...attrs(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g), ...attrs(/<script[^>]+src="([^"]+)"/g)];

/* Every ES module the entry point can reach, followed for real. */
function graph(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const src = read(entry);
  for (const m of src.matchAll(/^\s*import\s+(?:[^'"]*from\s*)?['"]([^'"]+)['"]/gm)) {
    if (!m[1].startsWith('.')) continue;
    graph(relative(ROOT, resolve(join(ROOT, dirname(entry)), m[1])), seen);
  }
  return seen;
}

test('every file the shell loads exists on disk', () => {
  for (const f of linked) assert.ok(existsSync(join(ROOT, f)), `index.html loads a missing file: ${f}`);
});

test('every file the shell loads is precached', () => {
  for (const f of linked) assert.ok(precache.has(f), `not in sw.js PRECACHE: ${f}`);
});

test('every module reachable from the entry point is precached', () => {
  for (const f of graph('js/v2.js')) assert.ok(precache.has(f), `not in sw.js PRECACHE: ${f}`);
});

test('every precached file exists on disk', () => {
  for (const f of precache) {
    if (f === '' || f.endsWith('/')) continue;
    assert.ok(existsSync(join(ROOT, f)), `sw.js caches a file that is not there: ${f}`);
  }
});

test('every cover on disk is cached for offline use', () => {
  for (const f of readdirSync(join(ROOT, 'assets/covers')))
    if (/\.(jpe?g|png|webp)$/i.test(f))
      assert.ok(precache.has(`assets/covers/${f}`), `cover not precached: ${f}`);
});

test('fonts the stylesheet asks for are inside the service worker scope', () => {
  for (const m of read('v2.css').matchAll(/url\('([^']+\.woff2)'\)/g)) {
    assert.ok(!m[1].startsWith('../'), `font is outside the ./tilawat/ scope, so it cannot be cached: ${m[1]}`);
    assert.ok(precache.has(m[1].replace(/^\.\//, '')), `font not precached: ${m[1]}`);
  }
});

test('no stylesheet is both linked and injected at runtime', () => {
  const markers = { 'interaction-v28.css': 'data-tilawat-v28', 'favorites.css': 'data-tilawat-favorites',
    'motion-system.css': 'data-tilawat-motion', 'multipart.css': 'data-tilawat-multipart',
    'library-membership.css': 'data-tilawat-membership' };
  for (const [file, marker] of Object.entries(markers)) {
    const tag = html.match(new RegExp(`<link[^>]+${file.replace('.', '\\.')}[^>]*>`))?.[0];
    assert.ok(tag, `${file} is not linked from index.html`);
    assert.ok(tag.includes(marker), `${file} is linked without ${marker}, so its module will inject a second copy`);
  }
});
