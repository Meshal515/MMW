import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{MODES,DEPTHS,promptFor,providerRequestFor} from '../worker/index.js';

const sample={
  mode:'prompt',depth:'standard',model:'deepseek-flash',
  title:'خطة تطوير فانتارا',
  text:'فانتارا اقترب من النهاية. أبغى أكواد أرض رطبة للإصلاح بدون مزايا جديدة ولا تحسينات واجهة. هدفنا تقليل الأخطاء.',
  instructions:'حافظ على القرارات وأعطني خطوات عملية.',
  command:'حوّل النص إلى برومبت هندسي للمطور يتضمن معايير قبول وأولوية إصلاح الأسباب الجذرية.'
};
const key='sk-placeholder-key-12345678901234567890';
function request(body){
 return new Request('https://uspace.example/api/ai',{
   method:'POST',
   headers:{Origin:'https://uspace.example','Content-Type':'application/json','X-Provider-Key':key},
   body:JSON.stringify(body)
 });
}
test('prompt mode preserves scope and asks for actionable, verifiable engineering tasks',()=>{
 const messages=promptFor('prompt',sample);
 assert.equal(messages.length,2);
 const system=messages[0].content,body=messages[1].content;
 assert.match(system,/برومبت تنفيذي عالي الجودة/);
 assert.match(system,/معايير قبول/);
 assert.match(system,/الأسباب الجذرية|آلية التشخيص/);
 assert.match(system,/أرض رطبة/);
 assert.match(system,/لا تقترح/);
 assert.match(body,/<run_command>[\s\S]*برومبت هندسي[\s\S]*<\/run_command>/);
 assert.match(body,/<source_document>[\s\S]*فانتارا[\s\S]*<\/source_document>/);
 assert.match(body,/بدون مزايا جديدة/);
 assert.ok(body.indexOf('<run_command>')<body.indexOf('<source_document>'));
});
test('deep mode enables supported DeepSeek thinking and increases output budget',()=>{
 const normal=providerRequestFor(sample);
 const deep=providerRequestFor({...sample,depth:'deep'});
 assert.deepEqual(normal.thinking,{type:'disabled'});
 assert.deepEqual(deep.thinking,{type:'enabled'});
 assert.equal(deep.reasoning_effort,'high');
 assert.ok(deep.max_tokens>normal.max_tokens);
 assert.equal(deep.model,'deepseek-flash');
 assert.equal(deep.messages[1].role,'user');
});
test('structure never enables reasoning and always requests strict JSON',()=>{
 const opts=providerRequestFor({...sample,mode:'structure',depth:'deep'});
 assert.deepEqual(opts.thinking,{type:'disabled'});
 assert.deepEqual(opts.response_format,{type:'json_object'});
});
test('custom task requires command while allowing a blank source document',async()=>{
 assert.ok(MODES.has('custom')&&MODES.has('analyze'));
 assert.deepEqual([...DEPTHS],['quick','standard','deep']);
 const noCommand=await worker.fetch(request({...sample,mode:'custom',command:''}),{});
 assert.equal(noCommand.status,400);
 const noDocument=await worker.fetch(request({...sample,mode:'custom',text:'',command:''}),{});
 assert.equal(noDocument.status,400);
});
test('custom command and depth reach the upstream request without key leakage',async()=>{
 const original=globalThis.fetch;
 let upstream;
 globalThis.fetch=async(_url,opts)=>{
   upstream=JSON.parse(opts.body);
   return new Response(JSON.stringify({choices:[{message:{content:'## خطوات تنفيذية\n1. اختبر الأخطاء أولًا'},finish_reason:'stop'}],usage:{prompt_tokens:111,completion_tokens:222}}),{status:200});
 };
 try{
   const res=await worker.fetch(request({...sample,mode:'custom',depth:'deep'}),{});
   assert.equal(res.status,200);
   const payload=await res.json();
   assert.equal(payload.result.text,'## خطوات تنفيذية\n1. اختبر الأخطاء أولًا');
   assert.equal(payload.usage.completionTokens,222);
   assert.equal(payload.finishReason,'stop');
   assert.equal(upstream.thinking.type,'enabled');
   assert.match(upstream.messages[1].content,/حوّل النص/);
   assert.ok(!JSON.stringify(payload).includes(key));
 }finally{globalThis.fetch=original;}
});
test('request validates mode depth and command length',async()=>{
 const badDepth=await worker.fetch(request({...sample,depth:'never'}),{});
 assert.equal(badDepth.status,400);
 const badCommand=await worker.fetch(request({...sample,command:'a'.repeat(3001)}),{});
 assert.equal(badCommand.status,400);
});
test('AI UI exposes a command composer and does not overwrite pages for analyses',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/id="ai-command"/);
 assert.match(main,/id="ai-depth"/);
 assert.match(main,/data-ai-preset="root"/);
 assert.match(main,/body:JSON\.stringify\(\{mode,model,text,title:p\.title,instructions,command,depth\}\)/);
 assert.match(main,/const canApply=\['structure','improve','proofread'\]/);
 assert.match(main,/id="save-ai-page"/);
 assert.match(main,/DOMPurify\.sanitize\(marked\.parse\(body/);
});
