import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url),'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url),'utf8');
const rich = readFileSync(new URL('../src/rich-editor.js', import.meta.url),'utf8');
const shell = readFileSync(new URL('../index.html', import.meta.url),'utf8');

test('all hardcoded UI selectors resolve to a rendered element or root',()=>{
  const ids = new Set([...main.matchAll(/\bid="([a-zA-Z][\w-]+)"/g)].map(m=>m[1]));
  for (const m of shell.matchAll(/\bid="([a-zA-Z][\w-]+)"/g)) ids.add(m[1]);
  const referenced = [...main.matchAll(/\$\('#([a-zA-Z][\w-]+)'\)/g)].map(m=>m[1]);
  const missing = [...new Set(referenced.filter(id=>!ids.has(id)))];
  assert.deepEqual(missing,[]);
});

test('every toolbar command has rich editor implementation',()=>{
  const requested = [...new Set([...main.matchAll(/data-format="([a-z-]+)"/g)].map(m=>m[1]))];
  const implemented = [...new Set([...rich.matchAll(/case '([^']+)'/g)].map(m=>m[1]))];
  assert.deepEqual(requested.filter(command=>!implemented.includes(command)),[]);
});

test('mobile bottom sheet and scrim exist',()=>{
  assert.ok(main.includes('id="panel-scrim"'));
  assert.ok(main.includes("$('#panel-scrim').onclick"));
  assert.match(css,/\.panel-scrim\.show/);
  assert.match(css,/\.right-panel\.open\s*\{transform:translateY\(0\)/);
});
test('editor always offers Markdown source, preview and rich canvas',()=>{
  assert.ok(main.includes('id="source-btn"'));
  assert.ok(main.includes('id="preview-btn"'));
  assert.ok(main.includes('id="rich-editor"'));
  assert.ok(main.includes('id="editor"'));
});
