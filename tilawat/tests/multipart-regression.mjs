import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE='http://127.0.0.1:4173/tilawat/';
const OUT='tilawat/test-artifacts';
await mkdir(OUT,{recursive:true});

function silentWav(seconds=.85,sampleRate=8000){
  const samples=Math.floor(seconds*sampleRate),dataBytes=samples*2,buffer=Buffer.alloc(44+dataBytes);
  buffer.write('RIFF',0);buffer.writeUInt32LE(36+dataBytes,4);buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(sampleRate,24);buffer.writeUInt32LE(sampleRate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(dataBytes,40);return buffer;
}

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-SA',colorScheme:'dark'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});

try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.click('#addBtn');
  await page.waitForSelector('#multipartBuilder');
  assert.equal(await page.locator('[data-part="2"]').isVisible(),true,'part 2 should be offered automatically');
  assert.equal(await page.locator('[data-part="3"]').isVisible(),false,'part 3 should stay hidden until requested');

  await page.fill('#addTitle','سورة يونس — اختبار الأجزاء');
  await page.fill('#addReciter','ياسر الدوسري');
  await page.fill('#addSurah','يونس');
  await page.locator('#addFile').setInputFiles({name:'younes-1.wav',mimeType:'audio/wav',buffer:silentWav(.9)});
  await page.locator('[data-part-file="2"]').setInputFiles({name:'younes-2.wav',mimeType:'audio/wav',buffer:silentWav(.9)});
  await page.waitForFunction(()=>{const b=document.querySelector('#multipartAddPart');return b&&!b.hidden&&/3/.test(b.textContent)});
  await page.click('#multipartAddPart');
  assert.equal(await page.locator('[data-part="3"]').isVisible(),true,'part 3 should be opt-in');
  await page.locator('[data-part-file="3"]').setInputFiles({name:'younes-3.wav',mimeType:'audio/wav',buffer:silentWav(.9)});

  await page.click('#addForm button[type="submit"]');
  await page.waitForSelector('#playerPage:not(.hidden)',{timeout:8000});
  await page.waitForSelector('#multipartNow:not([hidden])',{timeout:4000});
  assert.match(await page.locator('#multipartNow').textContent(),/الجزء 1 من 3/);
  assert.equal(await page.locator('#playerTitle').textContent(),'سورة يونس — اختبار الأجزاء');

  const saved=await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tilawat',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    const tracks=await new Promise((resolve,reject)=>{const tx=db.transaction('tracks','readonly'),req=tx.objectStore('tracks').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});db.close();return tracks.find(track=>track.title==='سورة يونس — اختبار الأجزاء');
  });
  assert.ok(saved,'multipart recording should be saved');
  assert.equal(saved.parts?.length,2,'one library recording should own the two continuation parts');
  assert.ok(saved.parts.every(part=>part.localAudioKey),'local continuation files must be persisted');

  await page.waitForFunction(()=>document.querySelector('#multipartNow')?.textContent?.includes('الجزء 2 من 3'),{timeout:7000});
  assert.equal(await page.locator('#playerTitle').textContent(),'سورة يونس — اختبار الأجزاء','title/cover identity must not change between parts');
  await page.waitForFunction(()=>document.querySelector('#multipartNow')?.textContent?.includes('الجزء 3 من 3'),{timeout:7000});
  await page.screenshot({path:`${OUT}/390-player-multipart-dark.png`,fullPage:false});
  assert.deepEqual(errors,[],`browser errors:\n${errors.join('\n')}`);
  console.log('multipart regression ok');
}finally{
  await browser.close();
}
