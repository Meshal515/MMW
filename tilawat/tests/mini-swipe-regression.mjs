import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE='http://127.0.0.1:4173/tilawat/';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-SA',colorScheme:'dark'});
const page=await context.newPage();
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
page.on('pageerror',error=>errors.push(`pageerror: ${error.stack||error.message}`));

function translationX(transform){
  if(!transform||transform==='none')return 0;
  const match=transform.match(/^matrix\(([^)]+)\)$/);
  if(match)return Number(match[1].split(',')[4])||0;
  const match3d=transform.match(/^matrix3d\(([^)]+)\)$/);
  if(match3d)return Number(match3d[1].split(',')[12])||0;
  return 0;
}

try{
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30_000});
  await page.evaluate(async()=>{
    const makeWav=()=>{
      const sampleRate=8000,seconds=.45,samples=Math.floor(sampleRate*seconds),bytes=44+samples*2;
      const buffer=new ArrayBuffer(bytes),view=new DataView(buffer);
      const text=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};
      text(0,'RIFF');view.setUint32(4,bytes-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
      view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);
      view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples*2,true);
      for(let i=0;i<samples;i++)view.setInt16(44+i*2,Math.sin(i/12)*500,true);
      return new Blob([buffer],{type:'audio/wav'});
    };
    const makeCover=()=>new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#17352d"/><circle cx="48" cy="48" r="30" fill="#7de0bd"/></svg>`],{type:'image/svg+xml'});
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('tilawat',2);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains('tracks')){const store=db.createObjectStore('tracks',{keyPath:'id'});store.createIndex('addedAt','addedAt')}
        if(!db.objectStoreNames.contains('blobs'))db.createObjectStore('blobs');
        if(!db.objectStoreNames.contains('prefs'))db.createObjectStore('prefs');
      };
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const tracks=[1,2].map(index=>({
      id:`swipe-${index}`,title:index===1?'سورة يونس':'سورة هود',surah:index===1?'يونس':'هود',reciter:'ياسر الدوسري',
      collection:'اختبار السحب',year:'1425',schemaVersion:4,variants:[],tags:[],playlists:[],favorite:false,rare:false,
      localAudioKey:`swipe-audio-${index}`,coverKey:index===1?'swipe-cover-1':'',coverMode:index===1?'upload':'local',
      addedAt:1700000000000-index,lastPlayedAt:0,lastPosition:0,playCount:0
    }));
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['tracks','blobs','prefs'],'readwrite');
      tx.objectStore('tracks').clear();tx.objectStore('blobs').clear();
      for(const track of tracks){tx.objectStore('tracks').put(track);tx.objectStore('blobs').put(makeWav(),track.localAudioKey)}
      tx.objectStore('blobs').put(makeCover(),'swipe-cover-1');
      tx.objectStore('prefs').put(tracks.map(track=>track.id),'tilawat-library-order-v2');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    db.close();
  });

  await page.reload({waitUntil:'domcontentloaded'});
  await page.click('.tabbar [data-tab="library"]');
  await page.waitForFunction(()=>document.querySelectorAll('#libraryGrid .library-row').length===2);
  await page.locator('#libraryGrid .library-row').first().locator('.library-row__play').click();
  await page.waitForSelector('#miniPlayer:not(.hidden)',{state:'visible'});
  await page.waitForTimeout(650); // entrance animation must be finished before the gesture owns transform

  const mediaArtwork=await page.evaluate(()=>{
    if(!('mediaSession'in navigator))return 'unsupported';
    return navigator.mediaSession.metadata?.artwork?.[0]?.src||'';
  });
  if(mediaArtwork!=='unsupported'){
    assert.ok(mediaArtwork, 'media session should receive artwork');
    assert.equal(mediaArtwork.startsWith('blob:'),false,`media artwork must be OS-readable, got ${mediaArtwork}`);
    assert.match(mediaArtwork,/\/assets\/covers\/dossari-[1-4]\.jpg$/,`local Blob cover should fall back to a recitation photo, got ${mediaArtwork}`);
  }

  const mini=page.locator('#miniPlayer');
  const box=await mini.boundingBox();
  assert.ok(box,'mini player geometry must exist');
  const startX=box.x+box.width*.55,startY=box.y+box.height*.5;
  const before=await mini.evaluate(el=>getComputedStyle(el).transform);
  assert.ok(before==='none'||Math.abs(translationX(before))<1,`mini must settle before drag, got ${before}`);

  await page.mouse.move(startX,startY);
  await page.mouse.down();
  await page.mouse.move(startX+120,startY,{steps:8});
  await page.waitForTimeout(60);
  const during=await mini.evaluate(el=>({transform:getComputedStyle(el).transform,inline:el.style.transform,animation:getComputedStyle(el).animationFillMode}));
  const x=translationX(during.transform);
  assert.ok(Math.abs(x)>=15,`mini player must visibly follow the finger; computed x=${x}, transform=${during.transform}, inline=${during.inline}, fill=${during.animation}`);

  await page.mouse.up();
  await page.waitForTimeout(320);
  const after=await mini.evaluate(el=>getComputedStyle(el).transform);
  assert.ok(after==='none'||Math.abs(translationX(after))<1,`mini player must settle back after an incomplete swipe, got ${after}`);

  const box2=await mini.boundingBox();
  assert.ok(box2,'mini player geometry must still exist');
  const upX=box2.x+box2.width*.5,upY=box2.y+box2.height*.55;
  await page.mouse.move(upX,upY);await page.mouse.down();await page.mouse.move(upX,upY-105,{steps:9});await page.mouse.up();
  await page.waitForSelector('#tilawatV28Glass.is-open',{state:'attached'});
  await page.waitForFunction(()=>document.querySelector('#tilawatV28Glass')?.classList.contains('is-open'));

  await page.evaluate(()=>{
    window.__favoriteFeedback=[];
    addEventListener('tilawat:favorite-feedback',event=>{
      const target=event.detail?.target,icon=target?.querySelector?.('svg'),dot=document.querySelector('.tilawat-fav-burst');
      const r=icon?.getBoundingClientRect?.();
      window.__favoriteFeedback.push({
        targetId:target?.id||'',
        active:!!event.detail?.active,
        iconCenter:r?{x:r.left+r.width/2,y:r.top+r.height/2}:null,
        dotCenter:dot?{x:(parseFloat(dot.style.left)||0)+4,y:(parseFloat(dot.style.top)||0)+4}:null
      });
    },{once:true});
  });
  await page.click('#tilawatV28GlassFav');
  await page.waitForFunction(()=>window.__favoriteFeedback?.length===1);
  const feedback=await page.evaluate(()=>window.__favoriteFeedback[0]);
  assert.equal(feedback.targetId,'tilawatV28GlassFav','glass favorite must own its feedback target');
  assert.equal(feedback.active,true,'first glass favorite click should activate favorite');
  assert.ok(feedback.iconCenter&&feedback.dotCenter,'favorite burst geometry must exist');
  const burstDistance=Math.hypot(feedback.iconCenter.x-feedback.dotCenter.x,feedback.iconCenter.y-feedback.dotCenter.y);
  assert.ok(burstDistance<1.5,`favorite burst must originate at the heart icon; distance=${burstDistance}`);

  assert.deepEqual(errors,[],`browser errors:\n${errors.join('\n')}`);
  console.log(JSON.stringify({ok:true,before,during,after,dragX:x,mediaArtwork,feedback,burstDistance},null,2));
}finally{
  await browser.close();
}
