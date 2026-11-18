import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{MODES,promptFor,providerRequestFor} from '../worker/index.js';
import {MODE_ORDER,normalizeModeSelection,preservationReport,labelForMode} from '../src/ai-operations.js';
import {extractTags,extractWikiLinks,linkedPageIds,backlinksFor,rankPages,graphForSpace,dailyTitle,PAGE_TEMPLATES} from '../src/knowledge.js';

test('multi-operation selection has stable order and rejects unknown modes',()=>{
 assert.deepEqual(normalizeModeSelection(['review','ideas','review','nonsense','prompt']),['ideas','review','prompt']);
 assert.deepEqual(normalizeModeSelection(['nonsense']),['ideas']);
 assert.ok(MODES.has('ideas')&&MODES.has('review'));
 assert.equal(MODE_ORDER.length,8);
 assert.equal(labelForMode('ideas'),'ترتيب الأفكار');
});
test('idea preservation detects missing text and approves purely organized content',()=>{
 const original='فانتارا عندها مشاكل في الأنمي. ولا أريد إضافة مزايا جديدة.';
 const good='## المشاكل\n- فانتارا عندها مشاكل في الأنمي.\n## القيود\n- ولا أريد إضافة مزايا جديدة.';
 const bad='## ملخص\nفانتارا عندها مشاكل.';
 assert.equal(preservationReport(original,good).coverage,1);
 assert.equal(preservationReport(original,good).passes,true);
 assert.ok(preservationReport(original,bad).coverage<0.95);
 assert.ok(preservationReport(original,bad).missing.length>0);
});
test('ideas prompt enforces user wording, scope and no invented requirements',()=>{
 const sample={mode:'ideas',model:'deepseek-flash',title:'فانتارا',text:'عندي مشاكل فانتارا كثير',command:''};
 const messages=promptFor('ideas',sample);
 assert.match(messages[0].content,/صوت المستخدم وكلماته/);
 assert.match(messages[0].content,/عناوين ##/);
 assert.match(messages[0].content,/لا تضف أفكارًا/);
 assert.deepEqual(providerRequestFor(sample).thinking,{type:'disabled'});
});
test('review asks for concrete critique and revised full draft in strict JSON',()=>{
 const sample={mode:'review',model:'deepseek-flash',text:'الخطة الأولية',title:'الخطة',depth:'deep'};
 const opts=providerRequestFor(sample);
 assert.deepEqual(opts.response_format,{type:'json_object'});
 assert.deepEqual(opts.thinking,{type:'disabled'});
 assert.match(opts.messages[0].content,/"revisedText"/);
 assert.match(opts.messages[0].content,/نسخة مصححة/);
});
test('mock review response returns both critique and corrected text, never changes original',async()=>{
 const oldFetch=globalThis.fetch;
 const key='sk-testing-never-a-secret-12345678901234567890';
 let upstream;
 globalThis.fetch=async(_url,init)=>{
   upstream=JSON.parse(init.body);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({critique:'المشكلة: غموض الهدف',revisedText:'# الهدف\nزيادة الاستقرار'})}}]}),{status:200});
 };
 try{
   const req=new Request('https://studio.test/api/ai',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://studio.test','X-Provider-Key':key},body:JSON.stringify({mode:'review',model:'deepseek-flash',title:'خطة',text:'الهدف غامض',depth:'standard'})});
   const res=await worker.fetch(req,{}),payload=await res.json();
   assert.equal(res.status,200);
   assert.equal(payload.result.critique,'المشكلة: غموض الهدف');
   assert.equal(payload.result.revisedText,'# الهدف\nزيادة الاستقرار');
   assert.deepEqual(upstream.response_format,{type:'json_object'});
   assert.ok(!JSON.stringify(payload).includes(key));
 }finally{globalThis.fetch=oldFetch;}
});
test('wiki-links, backlinks and tag extraction preserve Arabic and deduplicate references',()=>{
 const pages=[
  {id:'a',spaceId:'s',title:'خطة التطوير',body:'المشروع [[المشاكل]] [[المشاكل]] #فانتارا #مهام',updatedAt:2},
  {id:'b',spaceId:'s',title:'المشاكل',body:'مشكلات البرنامج',updatedAt:3},
  {id:'c',spaceId:'s2',title:'المشاكل',body:'منفصل',updatedAt:4}
 ];
 assert.deepEqual(extractWikiLinks(pages[0].body),['المشاكل']);
 assert.deepEqual(extractTags(pages[0].body),['فانتارا','مهام']);
 assert.deepEqual(linkedPageIds(pages[0],pages),['b']);
 assert.deepEqual(backlinksFor(pages[1],pages).map(x=>x.id),['a']);
 assert.deepEqual(rankPages(pages,'المشاكل').map(x=>x.id).slice(0,2),['b','c']);
 assert.deepEqual(graphForSpace(pages,'s').edges,[{source:'a',target:'b'}]);
});
test('templates and daily note title are available offline',()=>{
 assert.ok(PAGE_TEMPLATES.plan.body.includes('- [ ]'));
 assert.ok(PAGE_TEMPLATES.note.body.includes('مهام'));
 assert.match(dailyTitle(new Date(2026,10,18)),/2026/);
});
test('new workspace components are wired and GIF logo is valid',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const style=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 const iconSvg=readFileSync(new URL('../public/icons/icon.svg',import.meta.url),'utf8');
 assert.match(iconSvg,/<svg[^>]*>/);
 assert.match(iconSvg,/USPACE/);
 assert.match(iconSvg,/id="silver"/);
 assert.ok(!main.includes('logo-animated.gif'));
 assert.match(main,/src="\/icons\/icon.svg"/);
 for(const id of ['quick-switch-btn','daily-note-btn','templates-btn','graph-btn','favorite-btn','theme-btn','doc-context','ai-results','ai-depth','ai-command','selected-mode-count']){
  assert.ok(main.includes('id="'+id+'"'),'missing '+id);
 }
 assert.match(main,/data-ai-tab/);
 assert.match(main,/preservationReport\(batch\.original,edited\)/);
 assert.match(main,/new Intl\.DateTimeFormat|dailyTitle\(/);
 assert.match(style,/html\[data-theme="dark"\]/);
 assert.match(style,/\.mode-checkbox-mark/);
});
