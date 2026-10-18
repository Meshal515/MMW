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
let context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-SA',colorScheme:'dark'});
let page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});

async function seed(){
  const first=silentWavBase64(.8),second=silentWavBase64(2.4);
  await page.evaluate(async ({first,second})=>{
    const blobOf=value=>new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))],{type:'audio/wav'});
    const tracks=[
      {id:'continuity-1',title:'سورة الأولى — اختبار الاستمرار',reciter:'قارئ الاختبار',surah:'الفاتحة',schemaVersion:4,variants:[{id:'v1',provider:'local',localAudioKey:'continuity-audio-1',title:'الأولى.wav',original:true,downloadable:true}],tags:[],playlists:[],favorite:false,rare:false,addedAt:1800000000002,lastPlayedAt:0,lastPosition:0,playCount:0},
      /* Deliberately leave the next recitation saved at its final moment. Auto-advance
         must ignore this resume point and start it fresh from 0:00. */
      {id:'continuity-2',title:'سورة الثانية — اختبار الاستمرار',reciter:'قارئ الاختبار',surah:'البقرة',schemaVersion:4,variants:[{id:'v2',provider:'local',localAudioKey:'continuity-audio-2',title:'الثانية.wav',original:true,downloadable:true}],tags:[],playlists:[],favorite:false,rare:false,addedAt:1800000000001,lastPlayedAt:0,lastPosition:2.3,playCount:0}
    ];
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tilawat',2);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('tracks')){const s=d.createObjectStore('tracks',{keyPath:'id'});s.createIndex('addedAt','addedAt')}if(!d.objectStoreNames.contains('blobs'))d.createObjectStore('blobs');if(!d.objectStoreNames.contains('prefs'))d.createObjectStore('prefs')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    await new Promise((resolve,reject)=>{const tx=db.transaction(['tracks','blobs','prefs'],'readwrite'),t=tx.objectStore('tracks'),b=tx.objectStore('blobs'),p=tx.objectStore('prefs');t.clear();b.clear();for(const track of tracks)t.put(track);b.put(blobOf(first),'continuity-audio-1');b.put(blobOf(second),'continuity-audio-2');p.put(['continuity-1','continuity-2'],'tilawat-library-order-v2');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});db.close();
  },{first,second});
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
  // The next track has a stale saved position at its end. It must visibly reset and
  // actually keep playing from the beginning rather than landing on 2.4 / 2.4 in silence.
  await page.waitForFunction(()=>Number(document.querySelector('#miniSeek')?.value||1000)<700&&document.documentElement.classList.contains('is-audio-playing'),{timeout:2500});
  assert.ok(Number(await page.locator('#miniSeek').inputValue())<700,'auto-advanced track must start well before its stale saved endpoint');
  assert.equal(await page.locator('#repeat').getAttribute('aria-pressed'),'false','auto advance must not silently enable repeat');
  await page.waitForFunction(()=>!document.documentElement.classList.contains('is-audio-playing'),{timeout:7000});
  assert.match(await page.locator('#playerTitle').textContent(),/الثانية/,'end of queue must stop on the second track, not wrap to the first');
  await page.waitForTimeout(300);
  assert.match(await page.locator('#playerTitle').textContent(),/الثانية/,'repeat-off must not replay the first track');
}


async function seedBackgroundQueue({youtubeOnly=false}={}){
  const first=silentWavBase64(.85),last=silentWavBase64(3);
  const variant=(id,details)=>({id,original:true,downloadable:true,...details});
  const base=(id,title,index,variants)=>({
    id,title,reciter:'قارئ الاختبار',surah:'الفاتحة',schemaVersion:4,
    variants,tags:[],playlists:[],favorite:false,rare:false,
    addedAt:1800000000000-index,lastPlayedAt:0,lastPosition:0,playCount:0
  });
  const entries=[
    base('background-1','الأولى — تشغيل خلفي',1,[variant('a', {provider:'local',localAudioKey:'bg-a'})]),
    base('background-2','الثانية — يوتيوب فقط',2,[variant('b', {provider:'youtube',sourceUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',downloadable:false})])
  ];
  if(!youtubeOnly){
    entries.push(base('background-3','الثالثة — مصدر تالف',3,[variant('c',{provider:'archive',audioUrl:BASE+'test-unplayable.mp3'})]));
    const fourth=base('background-4','الرابعة — نسخة صوتية بديلة',4,[
      variant('d-yt',{provider:'youtube',sourceUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',downloadable:false}),
      variant('d-local',{provider:'local',localAudioKey:'bg-d'})
    ]);
    fourth.preferredVariantId='d-yt';
    fourth.lastPosition=2.9;
    entries.push(fourth);
  }
  await page.evaluate(async ({entries,first,last})=>{
    const blobOf=value=>new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))],{type:'audio/wav'});
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('tilawat',2);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['tracks','blobs','prefs'],'readwrite');
      tx.objectStore('tracks').clear();tx.objectStore('blobs').clear();
      for(const t of entries)tx.objectStore('tracks').put(t);
      tx.objectStore('blobs').put(blobOf(first),'bg-a');
      tx.objectStore('blobs').put(blobOf(last),'bg-d');
      tx.objectStore('prefs').put(entries.map(t=>t.id),'tilawat-library-order-v2');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });db.close();
  },{entries,first,last});
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

  assert.deepEqual(errors,[],`initial browser errors:\\n${errors.join('\\n')}`);
  // Use a fresh origin storage context for this suite. The previous suite
  // finishes asynchronously persisting its last track; reusing IndexedDB
  // lets a delayed putTrack repopulate the newly cleared fixture.
  await context.close();
  context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-SA',colorScheme:'dark'});
  page=await context.newPage();
  errors.length=0;
  page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));
  page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30_000});
  // Real v2 runtime: hidden screen must ignore a YouTube-only queue entry,
  // recover from a broken direct stream, and use local audio even if
  // the user's preferred variant for the next recitation is YouTube.
  await page.route('**/test-unplayable.mp3',route=>route.fulfill({status:200,contentType:'audio/mpeg',body:'intentionally invalid audio'}));
  await seedBackgroundQueue();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#libraryGrid .library-row').length===4);
  await page.click('.tabbar [data-tab="library"]');
  await page.locator('#libraryGrid .library-row[data-play="background-1"] .library-row__play').click();
  await page.waitForFunction(()=>document.querySelector('#playerTitle')?.textContent?.includes('الأولى'));
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(()=>document.querySelector('#playerTitle')?.textContent?.includes('الرابعة'),{timeout:12000});
  await page.waitForFunction(()=>document.documentElement.classList.contains('is-audio-playing'),{timeout:4000});
  assert.ok(Number(await page.locator('#miniSeek').inputValue())<850,'background audio must start fresh, not from a saved endpoint');
  await page.waitForTimeout(350);
  assert.match(await page.locator('#playerTitle').textContent(),/الرابعة/,'background queue should skip unplayable streams without looping');

  // No audio-capable next item: leave playback stopped, never load YouTube
  // or wrap a repeat-disabled queue back to the first recitation.
  // Restart the browser context here too: an in-flight completion/position
  // write from the four-track case must not repopulate the two-track fixture.
  await context.close();
  context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-SA',colorScheme:'dark'});
  page=await context.newPage();
  errors.length=0;
  page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));
  page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30_000});
  await seedBackgroundQueue({youtubeOnly:true});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#libraryGrid .library-row').length===2);
  await page.click('.tabbar [data-tab="library"]');
  await page.locator('#libraryGrid .library-row[data-play="background-1"] .library-row__play').click();
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(()=>!document.documentElement.classList.contains('is-audio-playing'),{timeout:7000});
  assert.match(await page.locator('#playerTitle').textContent(),/الأولى/);
  await page.waitForTimeout(350);
  assert.match(await page.locator('#playerTitle').textContent(),/الأولى/,'a YouTube-only tail must not restart playback');
  const expectedPlaybackFailure=errors.filter(e=>!/test-unplayable\.mp3|decode|DEMUXER_ERROR/i.test(e));
  assert.deepEqual(expectedPlaybackFailure,[],`unexpected browser errors:\n${expectedPlaybackFailure.join('\n')}`);
  const report={ok:true,library:true,home:true,repeatOff:true,completedProgress:0,staleNextProgressIgnored:true};
  await writeFile(`${OUT}/playback-continuity-report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}catch(error){
  await page.screenshot({path:`${OUT}/playback-continuity-failure.png`,fullPage:false}).catch(()=>{});
  await writeFile(`${OUT}/playback-continuity-failure.txt`,`${error?.stack||error}\n\n${errors.join('\n')}`).catch(()=>{});
  throw error;
}finally{await browser.close()}
