import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE='http://127.0.0.1:4173/tilawat/';
const OUT='tilawat/test-artifacts/product-audit';
await mkdir(OUT,{recursive:true});

function silenceWavDataUri(){
  const sampleRate=8000,seconds=14,samples=Math.round(sampleRate*seconds),dataSize=samples*2;
  const b=Buffer.alloc(44+dataSize);
  b.write('RIFF',0);b.writeUInt32LE(36+dataSize,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36);b.writeUInt32LE(dataSize,40);
  return `data:audio/wav;base64,${b.toString('base64')}`;
}

const audioUrl=silenceWavDataUri();
const tracks=[
  ['qa-1','سورة الفاتحة','الفاتحة'],['qa-2','سورة البقرة','البقرة'],['qa-3','سورة آل عمران','آل عمران'],['qa-4','سورة النساء','النساء']
].map(([id,title,surah],index)=>({
  id,title,surah,reciter:'ياسر الدوسري',year:'1425',collection:'اختبار QA',schemaVersion:4,
  variants:[{id:`${id}-v1`,provider:'mp3quran',sourceUrl:audioUrl,audioUrl,title:'نسخة QA',qualityLabel:'اختبار',downloadable:false,original:true}],
  tags:[],playlists:[],favorite:index===1,rare:index===3,addedAt:1700000000000-index,lastPlayedAt:0,lastPosition:0,playCount:0
}));

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,locale:'ar-SA',colorScheme:'dark'});
const page=await context.newPage();
const runtimeErrors=[];
page.on('pageerror',error=>runtimeErrors.push(`pageerror: ${error.stack||error.message}`));
page.on('console',message=>{if(message.type()==='error')runtimeErrors.push(`console: ${message.text()}`)});

async function seed(){
  await page.evaluate(async tracks=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tilawat',2);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('tracks')){const s=d.createObjectStore('tracks',{keyPath:'id'});s.createIndex('addedAt','addedAt')}if(!d.objectStoreNames.contains('blobs'))d.createObjectStore('blobs');if(!d.objectStoreNames.contains('prefs'))d.createObjectStore('prefs')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    await new Promise((resolve,reject)=>{const tx=db.transaction(['tracks','prefs'],'readwrite'),s=tx.objectStore('tracks');s.clear();for(const track of tracks)s.put(track);tx.objectStore('prefs').put(tracks.map(t=>t.id),'tilawat-library-order-v2');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});db.close();
    localStorage.setItem('tilawat-theme','dark');
  },tracks);
}

const report={screens:[],smallControls:[],runtimeErrors,favorites:{},transport:{}};
async function snapshot(name,{selector='body',settle=520,fullPage=false}={}){
  await page.waitForTimeout(settle);
  const metrics=await page.evaluate(()=>({
    width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
    theme:document.documentElement.dataset.theme,
    smallControls:[...document.querySelectorAll('button,a[href],input,select,textarea')].filter(el=>{
      const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&!el.closest('[hidden]')&&(r.width<44||r.height<44)
    }).map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName,id:el.id||'',class:el.className?.baseVal||el.className||'',label:el.getAttribute('aria-label')||el.textContent?.trim().slice(0,40)||'',width:Math.round(r.width*10)/10,height:Math.round(r.height*10)/10}}).slice(0,100)
  }));
  assert.ok(metrics.scrollWidth<=metrics.width+1,`${name}: horizontal overflow ${metrics.scrollWidth}>${metrics.width}`);
  report.screens.push({name,width:metrics.width,height:metrics.height,scrollWidth:metrics.scrollWidth,theme:metrics.theme});
  for(const control of metrics.smallControls)report.smallControls.push({screen:name,...control});
  const target=selector==='body'?page:page.locator(selector);
  await target.screenshot({path:`${OUT}/${name}.png`,fullPage:selector==='body'?fullPage:false});
}

try{
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30_000});
  await page.waitForSelector('#homeView');
  await seed();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#libraryGrid .library-row').length===4);
  await page.waitForFunction(()=>document.documentElement.dataset.motionUi==='gsap'||document.documentElement.dataset.motionUi==='css');

  await snapshot('390-home-dark');

  await page.click('.tabbar [data-tab="search"]');
  await page.fill('#searchInput','الفاتحة');
  await snapshot('390-search-dark',{settle:460});

  await page.click('.tabbar [data-tab="library"]');
  await page.waitForSelector('#favoriteHub');
  await page.waitForSelector('#libraryGrid .library-favorite');
  assert.equal(await page.locator('#favoriteHubCount').textContent(),'1','favorite hub must reveal the existing favorite count');
  assert.equal(await page.locator('#libraryGrid .library-row[data-play="qa-2"] .library-favorite').getAttribute('aria-pressed'),'true','favorite state must be visible on the row itself');
  await snapshot('390-library-dark');

  const qa1Heart=page.locator('#libraryGrid .library-row[data-play="qa-1"] .library-favorite');
  await qa1Heart.click();
  await page.waitForFunction(()=>document.querySelector('#libraryGrid .library-row[data-play="qa-1"] .library-favorite')?.getAttribute('aria-pressed')==='true');
  await page.waitForFunction(()=>document.querySelector('#favoriteHubCount')?.textContent==='2');
  report.favorites.afterRowFavorite=Number(await page.locator('#favoriteHubCount').textContent());
  await snapshot('390-library-favorited-dark',{settle:300});

  await page.click('#favoriteHub');
  await page.waitForFunction(()=>document.querySelector('#librarySegs [data-seg="favorite"]')?.classList.contains('on'));
  await page.waitForFunction(()=>document.querySelectorAll('#libraryGrid .library-row').length===2);
  assert.deepEqual((await page.locator('#libraryGrid .library-row').evaluateAll(rows=>rows.map(row=>row.dataset.play))).sort(),['qa-1','qa-2']);
  await snapshot('390-library-favorites-filter-dark');

  await page.click('#librarySegs [data-seg="all"]');
  await page.waitForFunction(()=>document.querySelectorAll('#libraryGrid .library-row').length===4);
  await page.click('#libraryEditToggle');
  assert.equal(await page.locator('#libraryGrid .library-favorite').first().evaluate(el=>getComputedStyle(el).pointerEvents),'none','favorite controls must step out of the way during reorder mode');
  await snapshot('390-library-edit-dark');
  await page.click('#libraryEditToggle');

  await page.locator('#libraryGrid .library-row[data-play="qa-1"] .library-row__play').click();
  await page.waitForSelector('#miniPlayer:not(.hidden)');
  assert.equal(await page.locator('#miniFav').getAttribute('aria-pressed'),'true','mini player must expose the current favorite state');
  await snapshot('390-library-mini-dark',{settle:560});

  await page.click('#miniOpen');
  await page.waitForSelector('#playerPage:not(.hidden)');
  await page.waitForSelector('#playerFav');
  assert.equal(await page.locator('#playerFav').getAttribute('aria-pressed'),'true','full player must expose favorite directly');
  const transportOrder=await page.locator('.transport').evaluate(el=>[...el.children].map(child=>child.id));
  assert.deepEqual(transportOrder,['prev','back10','mainPlay','forward10','next'],'primary transport must communicate previous, -10, play, +10, next in temporal order');
  report.transport.order=transportOrder;
  await snapshot('390-player-dark',{settle:620});

  await page.click('#back10');
  await page.waitForSelector('.seek-feedback');
  await snapshot('390-player-back10-feedback-dark',{settle:80});
  await page.waitForTimeout(650);
  await page.click('#forward10');
  await page.waitForSelector('.seek-feedback');
  await snapshot('390-player-forward10-feedback-dark',{settle:80});
  await page.waitForTimeout(650);

  await page.click('#playerFav');
  await page.waitForFunction(()=>document.querySelector('#playerFav')?.getAttribute('aria-pressed')==='false');
  await page.click('#playerFav');
  await page.waitForFunction(()=>document.querySelector('#playerFav')?.getAttribute('aria-pressed')==='true');

  await page.click('#playerMore');
  await page.waitForSelector('#tilawatV28ActionBackdrop.is-open');
  await snapshot('390-player-more-dark',{settle:360});
  await page.click('[data-v28-action="edit"]');
  await page.waitForSelector('#addDialog:not(.hidden)');
  assert.equal(await page.locator('#addDialogTitle').textContent(),'تعديل التلاوة');
  assert.equal(await page.locator('#tilawatV28EditBackdrop').count(),0,'legacy edit UI must stay removed');
  await snapshot('390-track-edit-dark',{settle:420});
  await page.click('[data-close="addDialog"]');
  await page.waitForTimeout(280);
  await page.click('#playerClose');
  await page.waitForSelector('#playerPage',{state:'hidden'});

  await page.click('#classicSettingsBtn');
  await page.waitForSelector('#classicSettings.open');
  await snapshot('390-settings-dark',{settle:360});
  await page.click('#classicSettingsClose');
  await page.waitForTimeout(260);

  await page.click('#addBtn');
  await page.waitForSelector('#addDialog:not(.hidden)');
  await snapshot('390-add-dark',{settle:520});
  await page.click('[data-close="addDialog"]');
  await page.waitForTimeout(220);

  await page.click('#themeBtn');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.click('.tabbar [data-tab="library"]');
  await snapshot('390-library-light');
  await page.click('#libraryEditToggle');
  await snapshot('390-library-edit-light');
  await page.click('#libraryEditToggle');
  await page.click('.tabbar [data-tab="home"]');
  await snapshot('390-home-light');

  await page.setViewportSize({width:320,height:740});
  await snapshot('320-home-light');
  await page.click('.tabbar [data-tab="library"]');
  await snapshot('320-library-light');

  await page.setViewportSize({width:768,height:900});
  await page.click('#themeBtn');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.click('.tabbar [data-tab="home"]');
  await snapshot('768-home-dark');
  await page.click('.tabbar [data-tab="library"]');
  await snapshot('768-library-dark');

  const uniqueSmall=[...new Map(report.smallControls.map(x=>[`${x.id}|${x.class}|${x.width}x${x.height}`,x])).values()];
  report.smallControls=uniqueSmall;
  report.runtimeErrors=[...runtimeErrors];
  await writeFile(`${OUT}/audit.json`,JSON.stringify(report,null,2));
  assert.deepEqual(runtimeErrors,[],`runtime errors:\n${runtimeErrors.join('\n')}`);
  console.log(JSON.stringify({ok:true,screens:report.screens.map(x=>x.name),smallControlCount:uniqueSmall.length,favorites:report.favorites,transport:report.transport},null,2));
}catch(error){
  await page.screenshot({path:`${OUT}/failure.png`,fullPage:false}).catch(()=>{});
  await writeFile(`${OUT}/failure.txt`,`${error?.stack||error}\n\n${runtimeErrors.join('\n')}`).catch(()=>{});
  throw error;
}finally{await browser.close()}