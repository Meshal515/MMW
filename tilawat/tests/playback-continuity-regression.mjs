import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE='http://127.0.0.1:4173/tilawat/';
const OUT='tilawat/test-artifacts';
await mkdir(OUT,{recursive:true});

function silentWavBase64(seconds=.75,sampleRate=8000){
  const samples=Math.floor(seconds*sampleRate),dataBytes=samples*2,b=Buffer.alloc(44+dataBytes);
  b.write('RIFF',0);b.writeUInt32LE(36+dataBytes,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(dataBytes,40);return b.toString('base64');
}

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-SA',colorScheme:'dark'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});

async function seed(){
  const wav=silentWavBase64();
  await page.evaluate(async wav=>{
    const bytes=Uint8Array.from(atob(wav),c=>c.charCodeAt(0));
    const makeBlob=()=>new Blob([bytes],{type:'audio/wav'});
    const tracks=[
      {id:'continuity-1',title:'سورة الأولى — اختبار الاستمرار',reciter:'قارئ الاختبار',surah:'الفاتحة',schemaVersion:4,variants:[{id:'v1',provider:'local',localAudioKey:'continuity-audio-1',title:'الأولى.wav',original:true,downloadable:true}],tags:[],playlists:[],favorite:false,rare:false,addedAt:1800000000002,lastPlayedAt:0,lastPosition:0,playCount:0},
      {id:'continuity-2',title:'سورة الثانية — اختبار الاستمرار',reciter:'قارئ الاختبار',surah:'البقرة',schemaVersion:4,variants:[{id:'v2',provider:'local',localAudioKey:'continuity-audio-2',title:'الثانية.wav',original:true,downloadable:true}],tags:[],playlists:[],favorite:false,rare:false,addedAt:1800000000001,lastPlayedAt:0,lastPosition:0,playCount:0}
    ];
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tilawat',2);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('tracks')){const s=d.createObjectStore('tracks',{keyPath:'id'});s.createIndex('addedAt','addedAt')}if(!d.objectStoreNames.contains('blobs'))d.createObjectStore('blobs');if(!d.objectStoreNames.contains('prefs'))d.createObjectStore('prefs')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    await new Promise((resolve,reject)=>{const tx=db.transaction(['tracks','blobs','prefs'],'readwrite'),t=tx.objectStore('tracks'),b=tx.objectStore('blobs'),p=tx.objectStore('prefs');t.clear();b.clear();for(const track of tracks)t.put(track);b.put(makeBlob(),'continuity-audio-1');b.put(makeBlob(),'continuity-audio-2');p.put(['continuity-1','continuity-2'],'tilawat-library-order-v2');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});db.close();
  },wav);
}

async function readTrack(id){return page.evaluate(async id=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tilawat',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const row=await new Promise((resolve,reject)=>{const tx=db.transaction('tracks','readonly'),req=tx.objectStore('tracks').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});db.close();return row;
},id)}

async function expectAutoAdvance(originSelector){
  assert.equal(await page.locator('#repeat').getAttribute('aria-pressed'),'false','repeat must start disabled');
  await page.locator(originSelector).click();
  await page.waitForFunction(()=>document.querySelector('#playerTitle')?.textContent?.includes('الأولى'),{timeout:4000});
  // Exercise the same persistence path used when Android moves the page to the background.
  await page.evaluate(()=>{try{Object.defineProperty(document,'hidden',{configurable:true,value:true})}catch{}document.dispatchEvent(new Event('visibilitychange'))});
  await page.waitForFunction(()=>document.querySelector('#playerTitle')?.textContent?.includes('الثانية'),{timeout:6000});
  assert.equal(await page.locator('#repeat').getAttribute('aria-pressed'),'false','auto advance must not silently enable repeat');
  await page.waitForFunction(()=>!document.documentElement.classList.contains('is-audio-playing'),{timeout:5000});
  assert.match(await page.locator('#playerTitle').textContent(),/الثانية/,'end of queue must stop on the second track, not wrap to the first');
  await page.waitForTimeout(300);
  assert.match(await page.locator('#playerTitle').textContent(),/الثانية/,'repeat-off must not replay the first track');
}

try{
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30_000});
  await seed();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#libraryGrid .library-row').length===2);

  await page.click('.tabbar [data-tab="library"]');
  await expectAutoAdvance('#libraryGrid .library-row[data-play="continuity-1"] .library-row__play');
  const completed=await readTrack('continuity-1');
  assert.equal(Number(completed.lastPosition||0),0,'naturally completed tracks must reset progress instead of resuming from the final second');
  await page.screenshot({path:`${OUT}/playback-continuity-library.png`,fullPage:false});

  // Reload to reset the in-memory player/queue, then prove the home shelf owns its own queue too.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#homeShelves .rail [data-play]').length>=2);
  await expectAutoAdvance('#homeShelves .rail [data-play="continuity-1"]');
  await page.screenshot({path:`${OUT}/playback-continuity-home.png`,fullPage:false});

  assert.deepEqual(errors,[],`browser errors:\n${errors.join('\n')}`);
  const report={ok:true,library:true,home:true,repeatOff:true,completedProgress:0};
  await writeFile(`${OUT}/playback-continuity-report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}catch(error){
  await page.screenshot({path:`${OUT}/playback-continuity-failure.png`,fullPage:false}).catch(()=>{});
  await writeFile(`${OUT}/playback-continuity-failure.txt`,`${error?.stack||error}\n\n${errors.join('\n')}`).catch(()=>{});
  throw error;
}finally{await browser.close()}
