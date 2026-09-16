import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE='http://127.0.0.1:4173/tilawat/';
const OUT='tilawat/test-artifacts';
await mkdir(OUT,{recursive:true});

function silentWav(seconds=1.2,sampleRate=8000){
  const samples=Math.floor(seconds*sampleRate),dataBytes=samples*2,buffer=Buffer.alloc(44+dataBytes);
  buffer.write('RIFF',0);buffer.writeUInt32LE(36+dataBytes,4);buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(sampleRate,24);buffer.writeUInt32LE(sampleRate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(dataBytes,40);return buffer;
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mP8z8AARAwMDAwM/4EAAD//AwA9NgQFG7YfWQAAAABJRU5ErkJggg==','base64');

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-SA',colorScheme:'light',reducedMotion:'no-preference'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));
page.on('console',message=>{
  if(message.type()!=='error')return;
  const loc=message.location();
  errors.push(`console: ${message.text()} @ ${loc.url||''}:${loc.lineNumber||0}:${loc.columnNumber||0}`);
});
page.on('requestfailed',request=>errors.push(`requestfailed: ${request.url()} :: ${request.failure()?.errorText||'unknown'}`));

async function getTracks(){return page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tilawat',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const rows=await new Promise((resolve,reject)=>{const tx=db.transaction('tracks','readonly'),req=tx.objectStore('tracks').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});db.close();return rows;
})}

try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#homeView');
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#tilawatV28EditBackdrop').count(),0,'legacy edit form must not be injected at startup');
  const startupOpacity=await page.locator('#homeView').evaluate(el=>Number(getComputedStyle(el).opacity));
  assert.ok(startupOpacity>=.99,`home view must never start washed out; opacity=${startupOpacity}`);

  await page.click('#addBtn');
  await page.fill('#addTitle','اختبار الغلاف والتعديل');
  await page.fill('#addReciter','ياسر الدوسري');
  await page.fill('#addSurah','الكهف');
  await page.locator('#addFile').setInputFiles({name:'qa-main.wav',mimeType:'audio/wav',buffer:silentWav()});
  await page.locator('#addCoverFile').setInputFiles({name:'qa-cover.png',mimeType:'image/png',buffer:png});
  assert.equal(await page.locator('#coverModeUpload').isChecked(),true,'choosing a phone image must select uploaded-cover mode');
  await page.click('#addForm button[type="submit"]');
  await page.waitForSelector('#playerPage:not(.hidden)',{timeout:8000});
  await page.waitForTimeout(180);
  assert.equal(await page.locator('#saveRec').isHidden(),true,'manual recordings are already library items; confusing save icon should be hidden');
  const coverState=await page.locator('#playerCover').evaluate(img=>({src:img.currentSrc||img.src,w:img.naturalWidth,h:img.naturalHeight}));
  assert.ok(coverState.src.startsWith('blob:'),'uploaded phone cover must be served from persisted blob storage');
  assert.ok(coverState.w>0&&coverState.h>0,'uploaded phone cover must decode');

  await page.waitForSelector('#playerFav');
  const topGap=await page.evaluate(()=>{const a=document.querySelector('#playerFav').getBoundingClientRect(),b=document.querySelector('#playerMore').getBoundingClientRect();return Math.max(a.left,b.left)-Math.min(a.right,b.right)});
  assert.ok(topGap>=8,`player favorite and more actions need breathing room; gap=${topGap}`);

  await page.click('#playerMore');
  await page.waitForSelector('#tilawatV28ActionBackdrop.is-open');
  const editAction=page.locator('[data-v28-action="edit"]');assert.equal(await editAction.isVisible(),true);
  await editAction.click();
  await page.waitForSelector('#addDialog:not(.hidden)');
  assert.equal(await page.locator('#tilawatV28EditBackdrop').count(),0,'editing must use the primary form, not a duplicate editor');
  assert.equal(await page.locator('#addDialogTitle').textContent(),'تعديل التلاوة');
  for(const selector of ['#addSource','#addFile','#addCoverFile','#addTitle','#addReciter','#addSurah','#addYear','#addCollection','#addMosque','#addOccasion','#addTags','#multipartBuilder'])assert.equal(await page.locator(selector).count(),1,`${selector} must be available while editing`);
  assert.equal(await page.locator('#coverModeUpload').isChecked(),true,'existing uploaded cover mode must survive opening edit');
  const editPreview=await page.locator('#addCoverPreview').evaluate(img=>img.currentSrc||img.src);assert.ok(editPreview.startsWith('blob:'),'edit preview must keep the uploaded cover');
  await page.fill('#addTitle','اختبار الغلاف والتعديل — معدل');
  await page.click('#addForm button[type="submit"]');
  await page.waitForSelector('#addDialog',{state:'hidden'});
  await page.waitForTimeout(260);
  const edited=(await getTracks()).find(track=>track.title==='اختبار الغلاف والتعديل — معدل');
  assert.ok(edited,'edited track must keep the same persisted entity');
  assert.ok(edited.coverKey,'edited track must retain its uploaded cover key');

  await page.click('.tabbar [data-tab="library"]');
  await page.waitForFunction(()=>document.querySelectorAll('#libraryGrid .library-row').length>=1);
  await page.waitForTimeout(60);
  const libraryOpacity=await page.locator('#libraryView').evaluate(el=>Number(getComputedStyle(el).opacity));
  assert.ok(libraryOpacity>=.99,`library view must not dim during navigation; opacity=${libraryOpacity}`);
  const favGeometry=await page.locator('#libraryGrid .library-row').first().evaluate(row=>{const art=row.querySelector('.art').getBoundingClientRect(),fav=row.querySelector('.library-favorite'),fr=fav.getBoundingClientRect(),before=getComputedStyle(fav,'::before');return{hitW:fr.width,hitH:fr.height,visualW:parseFloat(before.width),favCenterY:fr.y+fr.height/2,artCenterY:art.y+art.height/2}});
  assert.ok(favGeometry.hitW>=44&&favGeometry.hitH>=44,'favorite touch target must remain at least 44px');
  assert.ok(favGeometry.visualW<=28,`favorite visual must not cover the cover image; visual=${favGeometry.visualW}`);
  assert.ok(favGeometry.favCenterY>favGeometry.artCenterY,'favorite affordance should live at the lower corner of artwork');

  const row=page.locator('#libraryGrid .library-row').first();
  await row.locator('.library-row__play').click();
  await page.waitForSelector('#miniPlayer:not(.hidden)');
  await page.waitForTimeout(540);
  const mini=await page.locator('#miniPlayer').boundingBox();assert.ok(mini);
  await page.mouse.move(mini.x+mini.width*.55,mini.y+mini.height*.5);await page.mouse.down();await page.mouse.move(mini.x+mini.width*.55,mini.y-90,{steps:8});await page.mouse.up();
  await page.waitForSelector('#tilawatV28Glass.is-open');
  const glass=await page.evaluate(()=>({path:document.querySelector('#tilawatV28GlassPlayIcon path')!==null,playing:document.querySelector('#tilawatV28GlassPlay')?.classList.contains('is-playing'),eqOpacity:Number(getComputedStyle(document.querySelector('.tilawat-v28-glass-eq')).opacity),cover:document.querySelector('#tilawatV28GlassCover')?.currentSrc||document.querySelector('#tilawatV28GlassCover')?.src,miniCover:document.querySelector('#miniCover')?.currentSrc||document.querySelector('#miniCover')?.src}));
  assert.equal(glass.path,true,'glass play control must contain a real SVG path');
  if(glass.playing)assert.ok(glass.eqOpacity>.8,'playing glass control must expose the equalizer state');
  assert.equal(glass.cover,glass.miniCover,'glass cover must stay identical to the mini-player cover');
  await page.click('#tilawatV28GlassFav');await page.waitForTimeout(80);assert.equal(await page.locator('#tilawatV28GlassFav').getAttribute('aria-pressed'),'true','glass favorite must expose active state');
  await page.screenshot({path:`${OUT}/ux-stability-glass-light.png`,fullPage:false});

  /* Exercise the remove half of the library toggle with a saved catalog-backed item. */
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tilawat',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    await new Promise((resolve,reject)=>{const tx=db.transaction('tracks','readwrite');tx.objectStore('tracks').put({id:'qa-catalog-saved',title:'سورة اختبار محفوظة',reciter:'ياسر الدوسري',surah:'الإخلاص',year:'1425',schemaVersion:4,catalogRef:{reciterId:999,moshafId:1,surahId:112},variants:[],tags:[],favorite:false,rare:false,addedAt:Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();dispatchEvent(new CustomEvent('tilawat-library-imported'));
  });
  await page.waitForTimeout(220);await page.click('#tilawatV28GlassBackdrop');await page.waitForTimeout(220);
  await page.locator('.tabbar [data-tab="library"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('#libraryGrid .library-row')].some(r=>r.dataset.play==='qa-catalog-saved'));
  /* This fixture deliberately has no playable source, so the full player is not
     open. Invoke the membership controller directly rather than asking Playwright
     to physically click a button inside a hidden player page. */
  await page.evaluate(()=>{document.querySelectorAll('#libraryGrid .library-row').forEach(r=>r.classList.toggle('is-current',r.dataset.play==='qa-catalog-saved'));const save=document.querySelector('#saveRec');save.hidden=false;save.setAttribute('aria-pressed','true')});
  await page.waitForTimeout(120);assert.equal(await page.locator('#saveRec').getAttribute('aria-label'),'إزالة من مكتبتي');
  await page.evaluate(()=>document.querySelector('#saveRec').click());await page.waitForTimeout(240);
  assert.equal((await getTracks()).some(t=>t.id==='qa-catalog-saved'),false,'second library press must remove a saved catalog item');

  assert.deepEqual(errors,[],`browser errors:\n${errors.join('\n')}`);
  const report={ok:true,startupOpacity,libraryOpacity,coverState,topGap,favGeometry,glass};await writeFile(`${OUT}/ux-stability-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:`${OUT}/ux-stability-failure.png`,fullPage:false}).catch(()=>{});await writeFile(`${OUT}/ux-stability-failure.txt`,`${error?.stack||error}\n${errors.join('\n')}`).catch(()=>{});throw error}finally{await browser.close()}