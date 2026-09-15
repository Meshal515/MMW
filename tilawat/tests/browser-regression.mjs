import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE='http://127.0.0.1:4173/tilawat/';
const OUT='tilawat/test-artifacts';
await mkdir(OUT,{recursive:true});

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({
  viewport:{width:390,height:844},
  deviceScaleFactor:1,
  locale:'ar-SA',
  colorScheme:'dark',
  reducedMotion:'no-preference'
});
const page=await context.newPage();
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
page.on('pageerror',error=>errors.push(`pageerror: ${error.stack||error.message}`));

async function seedLibrary(){
  const tracks=[
    ['qa-1','سورة الفاتحة','الفاتحة'],
    ['qa-2','سورة البقرة','البقرة'],
    ['qa-3','سورة آل عمران','آل عمران'],
    ['qa-4','سورة النساء','النساء']
  ].map(([id,title,surah],index)=>({
    id,title,surah,reciter:'ياسر الدوسري',year:'1425',collection:'اختبار QA',
    schemaVersion:4,variants:[],tags:[],playlists:[],favorite:false,rare:false,
    addedAt:1700000000000-index,lastPlayedAt:0,lastPosition:0,playCount:0
  }));
  await page.evaluate(async tracks=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('tilawat',2);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains('tracks')){const store=db.createObjectStore('tracks',{keyPath:'id'});store.createIndex('addedAt','addedAt')}
        if(!db.objectStoreNames.contains('blobs'))db.createObjectStore('blobs');
        if(!db.objectStoreNames.contains('prefs'))db.createObjectStore('prefs');
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['tracks','prefs'],'readwrite');
      const store=tx.objectStore('tracks');
      store.clear();
      for(const track of tracks)store.put(track);
      tx.objectStore('prefs').put(tracks.map(track=>track.id),'tilawat-library-order-v2');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    db.close();
  },tracks);
}

async function order(){return page.locator('#libraryGrid .library-row').evaluateAll(rows=>rows.map(row=>row.dataset.play))}
async function rowVisualState(){return page.locator('#libraryGrid .library-row').evaluateAll(rows=>rows.map(row=>({
  id:row.dataset.play,
  inlineTransform:row.style.transform,
  inlineTransition:row.style.transition,
  transform:getComputedStyle(row).transform,
  transition:getComputedStyle(row).transitionProperty
})))}

try{
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30_000});
  await page.waitForSelector('#librarySegs',{state:'attached'});
  await seedLibrary();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('.tabbar [data-tab="library"]');
  await page.click('.tabbar [data-tab="library"]');
  await page.waitForFunction(()=>document.querySelectorAll('#libraryGrid .library-row').length===4);
  await page.click('#libraryEditToggle');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#libraryGrid .library-drag-handle')).display!=='none');

  const geometry=await page.locator('#libraryGrid .library-row').evaluateAll(rows=>rows.map(row=>{
    const rr=row.getBoundingClientRect();
    const art=row.querySelector('.art').getBoundingClientRect();
    const title=row.querySelector('h3').getBoundingClientRect();
    const handle=row.querySelector('.library-drag-handle').getBoundingClientRect();
    return {row:{x:rr.x,y:rr.y,width:rr.width,height:rr.height},art:{x:art.x,y:art.y,width:art.width,height:art.height},title:{x:title.x,y:title.y,width:title.width,height:title.height},handle:{x:handle.x,y:handle.y,width:handle.width,height:handle.height}};
  }));
  assert.ok(geometry.every(g=>Math.abs((g.art.y+g.art.height/2)-(g.row.y+g.row.height/2))<2),'artwork must stay vertically centered');
  assert.ok(geometry.every(g=>Math.abs((g.handle.y+g.handle.height/2)-(g.row.y+g.row.height/2))<2),'drag handle must stay vertically centered');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'library must not overflow horizontally');

  await page.screenshot({path:`${OUT}/library-dark-before.png`,fullPage:true});

  await page.evaluate(()=>{
    const grid=document.querySelector('#libraryGrid');
    window.__qaMutations=[];
    window.__qaObserver=new MutationObserver(records=>window.__qaMutations.push(...records.map(record=>({added:record.addedNodes.length,removed:record.removedNodes.length}))));
    window.__qaObserver.observe(grid,{childList:true});
  });

  const rows=page.locator('#libraryGrid .library-row');
  const row2=await rows.nth(1).boundingBox();
  const row3=await rows.nth(2).boundingBox();
  const handle3=await rows.nth(2).locator('.library-drag-handle').boundingBox();
  assert.ok(row2&&row3&&handle3,'drag geometry must exist');
  const step=row3.y-row2.y;
  const x=handle3.x+handle3.width/2;
  const y=handle3.y+handle3.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x,y-step*1.05,{steps:8});
  await page.waitForTimeout(40);

  const during=await rowVisualState();
  const moving=during.filter(row=>row.transform!=='none');
  assert.equal(moving.length,2,`only dragged and displaced rows should transform; got ${moving.map(row=>row.id).join(',')}`);
  assert.deepEqual(moving.map(row=>row.id).sort(),['qa-2','qa-3']);
  await page.screenshot({path:`${OUT}/library-dark-during-drag.png`,fullPage:true});

  await page.mouse.up();
  await page.waitForTimeout(260);
  assert.deepEqual(await order(),['qa-1','qa-3','qa-2','qa-4'],'drop should move the third row cleanly into the second slot');

  const after=await rowVisualState();
  assert.ok(after.every(row=>!row.inlineTransform&&!row.inlineTransition),'drag must clean inline transform/transition state');
  const mutations=await page.evaluate(()=>{window.__qaObserver?.disconnect();return window.__qaMutations||[]});
  assert.ok(mutations.every(record=>record.added<=1&&record.removed<=1),'drop must move one DOM row, not rebuild the library');
  await page.screenshot({path:`${OUT}/library-dark-after.png`,fullPage:true});

  await page.click('#themeBtn');
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'light theme must not overflow horizontally');
  await page.screenshot({path:`${OUT}/library-light-after.png`,fullPage:true});

  assert.deepEqual(errors,[],`browser errors:\n${errors.join('\n')}`);
  const report={ok:true,order:await order(),mutations,geometry};
  await writeFile(`${OUT}/browser-report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}catch(error){
  await page.screenshot({path:`${OUT}/failure.png`,fullPage:true}).catch(()=>{});
  await writeFile(`${OUT}/failure.txt`,`${error?.stack||error}\n\n${errors.join('\n')}`).catch(()=>{});
  throw error;
}finally{
  await browser.close();
}
