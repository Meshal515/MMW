/* Cloudflare Pages does not let the most specific _headers rule win: every
   pattern that matches a given path has its headers applied, and repeated
   header names get comma-joined rather than overridden. A generic /assets/*
   catch-all alongside /assets/covers/* and /assets/fonts/* shipped two
   comma-joined Cache-Control values in production before this test existed
   (confirmed live via curl -I against the deployed site). This walks the
   simple prefix-glob patterns this file actually uses and fails if two of
   them can both match the same path while setting the same header. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = readFileSync(join(ROOT, '_headers'), 'utf8');

function parseHeadersFile(src) {
  const blocks = [];
  let current = null;
  for (const raw of src.split('\n')) {
    const line = raw.replace(/#.*$/, '').replace(/\r$/, '');
    if (!line.trim()) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: line.trim(), headers: {} };
      blocks.push(current);
    } else if (current) {
      const m = line.match(/^\s*([\w-]+)\s*:\s*(.+)$/);
      if (m) current.headers[m[1].toLowerCase()] = m[2].trim();
    }
  }
  return blocks;
}

// True only for the small vocabulary of patterns this file actually uses:
// an exact path, a `/dir/*` prefix glob, or the catch-all `/*`.
function overlaps(a, b) {
  const dirOf = p => p === '/*' ? '' : p.replace(/\*$/, '');
  if (a === '/*' || b === '/*') return true;
  const da = dirOf(a), db = dirOf(b);
  return da.startsWith(db) || db.startsWith(da);
}

const blocks = parseHeadersFile(text);

test('_headers is non-empty and parses into rule blocks', () => {
  assert.ok(blocks.length >= 3, 'expected multiple rule blocks');
});

test('no two overlapping path patterns set the same header', () => {
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const shared = Object.keys(blocks[i].headers).filter(h => h in blocks[j].headers);
      if (!shared.length) continue;
      assert.ok(
        !overlaps(blocks[i].pattern, blocks[j].pattern),
        `"${blocks[i].pattern}" and "${blocks[j].pattern}" both set ${shared.join(',')} and can match the same path — Cloudflare Pages will concatenate the values instead of the more specific one winning`
      );
    }
  }
});

test('sw.js is never cached by the CDN', () => {
  const rule = blocks.find(b => b.pattern === '/sw.js');
  assert.ok(rule, '/sw.js needs its own rule');
  assert.match(rule.headers['cache-control'] || '', /no-cache|no-store/);
});
