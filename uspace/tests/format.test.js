import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countText,insertHeadings,escapeHtml,markdownToHtml} from '../src/format.js';
test('count Arabic words and whitespace',()=>{const s=countText('مرحبا بك يا مشعل.');assert.equal(s.words,4);assert.equal(s.charsNoSpace, s.chars-3)});
test('structure inserts headings without touching source lines',()=>{const a='كلام\nعامي!\n\nسطر ثالث\n';const b=insertHeadings(a,[{line:1,title:'بداية'},{line:4,title:'تفصيل'}]);assert.equal(b,'\n## بداية\n\nكلام\nعامي!\n\n\n## تفصيل\n\nسطر ثالث\n')});
test('malicious line index and heading are rejected or sanitized',()=>{const b=insertHeadings('x\ny',[{line:900,title:'bad'},{line:1,title:'A\n#B'}]);assert.ok(!b.includes('bad'));assert.ok(b.includes('## A  B'))});
test('HTML is escaped in markdown view',()=>{assert.ok(!markdownToHtml('<script>alert(1)</script>').includes('<script>'));assert.equal(escapeHtml('&'), '&amp;')});

test('Markdown tables render with headings and rows',()=>{const html=markdownToHtml('| الاسم | المهمة |\n| --- | --- |\n| مشعل | كتابة |');assert.ok(html.includes('<table>'));assert.ok(html.includes('<th>الاسم</th>'));assert.ok(html.includes('<td>كتابة</td>'));});
test('Markdown rich formatting remains escaped',()=>{const html=markdownToHtml('**مهم** *مائل* \`كود\` <img src=x onerror=alert(1)>');assert.ok(html.includes('<strong>مهم</strong>'));assert.ok(html.includes('<em>مائل</em>'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));});
