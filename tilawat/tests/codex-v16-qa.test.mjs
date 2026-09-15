import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../js/codex-v16-qa.js',import.meta.url),'utf8');

test('recovered QA keeps stable seek acknowledgement logic',()=>{
  assert.match(src,/seekTargetSeconds/);
  assert.match(src,/Math\.abs\(actual-seekTargetSeconds\)<=2\.25/);
  assert.match(src,/__tilawatSeekCommit/);
});

test('recovered QA resolves generic page links with worker fallback',()=>{
  assert.match(src,/\/api\/resolve/);
  assert.match(src,/tilawat-catalog\.ngm-309\.workers\.dev\/api\/resolve/);
  assert.match(src,/isPageLike/);
});
