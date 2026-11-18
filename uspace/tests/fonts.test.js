import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ARABIC_FONT_NAMES,PAGE_FONT_CHOICES,fontOptionsHtml,pageFontFamily,fontStack,isArabicFont} from '../src/fonts.js';

test('Arabic font picker exposes all curated Arabic families for document and selection',()=>{
  for(const font of ['Cairo','Tajawal','Amiri','Noto Naskh Arabic','IBM Plex Sans Arabic','Almarai','Alexandria','Readex Pro']){
    assert.ok(isArabicFont(font));
    assert.ok(PAGE_FONT_CHOICES.some(x=>x[0]===font));
    assert.ok(fontOptionsHtml().includes('value="'+font+'"'));
    assert.ok(fontOptionsHtml(true).includes('value="'+font+'"'));
    assert.ok(fontStack(font).includes(font));
  }
});
test('unknown fonts cannot become CSS font tokens',()=>{
  assert.equal(pageFontFamily('javascript:alert(1)'),'system');
  assert.equal(pageFontFamily('Cairo'),'Cairo');
  assert.ok(fontStack('javascript:alert(1)').includes('IBM Plex Sans Arabic'));
  assert.ok(ARABIC_FONT_NAMES.length>=10);
});
test('mobile responsive grid wins over desktop workspace grid',()=>{
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  const desktop=css.lastIndexOf('.shell{background:var(--us-bg);grid-template-columns:268px minmax(0,1fr)}');
  const mobile=css.indexOf('@media(max-width:719px)',desktop);
  assert.ok(desktop>=0&&mobile>desktop,'mobile grid override must come after desktop shell declaration');
  assert.match(css.slice(mobile),/\.shell\s*\{[\s\S]*?grid-template-columns\s*:\s*minmax\(0\s*,\s*1fr\)/,'mobile breakpoint must restore the single-column editor');
  assert.ok(css.includes('--editor-font-family'));
});
