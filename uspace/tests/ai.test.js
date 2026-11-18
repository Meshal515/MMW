import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const URL = 'https://uspace.example/api/ai';
const makeRequest = (headers = {}, body = {}) => new Request(URL, {
  method:'POST',
  headers:{Origin:'https://uspace.example','Content-Type':'application/json',...headers},
  body:JSON.stringify({mode:'proofread',model:'deepseek-flash',title:'ملاحظة',text:'فكرة مهمة',instructions:'',...body})
});

test('BYOK sends the visitor key only to the fixed DeepSeek endpoint',async()=>{
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url,opts) => {
    calls.push({url,auth:opts.headers.Authorization,body:JSON.parse(opts.body)});
    return new Response(JSON.stringify({choices:[{message:{content:'فكرة مهمة'}}]}),{status:200});
  };
  try {
    const key='sk-test-local-key-12345678901234567890';
    const response=await worker.fetch(makeRequest({'X-Provider-Key':key}),{});
    const payload=await response.json();
    assert.equal(response.status,200);
    assert.equal(payload.result.text,'فكرة مهمة');
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://api.deepseek.com/chat/completions');
    assert.equal(calls[0].auth,'Bearer '+key);
    assert.equal(calls[0].body.model,'deepseek-flash');
    assert.ok(!JSON.stringify(payload).includes(key));
  } finally { globalThis.fetch=original; }
});
test('legacy server-secret mode requires matching access key',async()=>{
  const response=await worker.fetch(makeRequest({'X-Access-Key':'wrong'}),{APP_ACCESS_KEY:'correct',DEEPSEEK_API_KEY:'sk-server'});
  assert.equal(response.status,401);
});
test('no credentials never invokes provider',async()=>{
  const response=await worker.fetch(makeRequest(),{});
  assert.equal(response.status,503);
});
test('cross-origin request is rejected',async()=>{
  const response=await worker.fetch(makeRequest({Origin:'https://attacker.example','X-Provider-Key':'sk-test-local-key-12345678901234567890'}),{});
  assert.equal(response.status,403);
});
test('invalid BYOK credential is rejected',async()=>{
  const response=await worker.fetch(makeRequest({'X-Provider-Key':'short'}),{});
  assert.equal(response.status,400);
});
test('unrecognized model rejected before upstream call',async()=>{
  const response=await worker.fetch(makeRequest({'X-Provider-Key':'sk-test-local-key-12345678901234567890'},{model:'unknown'}),{});
  assert.equal(response.status,400);
});
test('provider failures do not echo the supplied key',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('secret diagnostic', {status:429});
  try {
    const key='sk-test-local-key-12345678901234567890';
    const response=await worker.fetch(makeRequest({'X-Provider-Key':key}),{});
    assert.equal(response.status,502);
    const payload=await response.text();
    assert.ok(!payload.includes(key));
    assert.ok(!payload.includes('secret diagnostic'));
  } finally {globalThis.fetch=original;}
});
