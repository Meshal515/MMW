import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:4173/tilawat/';
const read = name => readFile(new URL(`../data/quran/${name}`, import.meta.url), 'utf8').then(JSON.parse);
const baqarah = await read('002.json');
const pages = await read('pages.json');
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{ width:390, height:844 }, locale:'ar-SA', colorScheme:'dark' });
const page = await context.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', e => errors.push(`pageerror: ${e.stack || e.message}`));
// Remote tafsirs are not part of this test; answer them locally so it runs offline.
await page.route('https://api.alquran.cloud/**', route => route.fulfill({ contentType:'application/json',
  body:JSON.stringify({ data:{ ayahs:baqarah.ayahs.map((_, i) => ({ text:`jalalayn ${i + 1}` })) } }) }));

await page.goto(BASE);
await page.evaluate(() => localStorage.removeItem('tilawat-quran-v1'));
await page.reload();
await page.click('[data-tab="quran"]');
await page.waitForSelector('#quranIndex .quran-row');
assert.equal(await page.locator('#quranIndex .quran-row').count(), 114, 'index lists every surah');

await page.fill('#quranSearch', 'الكهف');
await page.waitForFunction(() => document.querySelectorAll('#quranIndex .quran-row').length === 1);
await page.fill('#quranSearch', '١٨');
await page.waitForSelector('#quranIndex [data-quran-open="18"]');
await page.fill('#quranSearch', 'الصلاة الوسطى');
await page.waitForFunction(() => document.querySelectorAll('#quranAyahHits .ayah-hit').length === 1
  && document.querySelector('#quranAyahHits .ayah-hit').dataset.quranAyah === '238', null, { timeout:8000 })
  .catch(async () => assert.fail(`ayah search should find only 2:238, got ${await page.locator('#quranAyahHits .ayah-hit').count()}`));
await page.fill('#quranSearch', '');
await page.click('#quranSegs [data-qseg="medinan"]');
const medinan = await page.locator('#quranIndex .quran-row').count();
assert.ok(medinan > 20 && medinan < 40, `medinan filter, got ${medinan}`);
await page.click('#quranSegs [data-qseg="all"]');

// Paged view: al-Baqarah opens on Madina page 2.
await page.click('#quranIndex [data-quran-open="2"]');
await page.waitForSelector('#quranStagePage .ayah');
assert.equal(await page.textContent('#quranPageNo'), `${AR(2)} / ${AR(604)}`);
const page2 = pages[1][0];
assert.equal(await page.locator('#quranStagePage .ayah').count(), page2[2] - page2[1] + 1, 'page 2 holds exactly its ayahs');
assert.equal(await page.locator('#quranStagePage .surah-banner').count(), 1, 'surah banner at its start');
await page.keyboard.press('ArrowLeft');
await page.waitForFunction(t => document.querySelector('#quranPageNo').textContent === t, `${AR(3)} / ${AR(604)}`);
await page.keyboard.press('ArrowRight');
await page.waitForFunction(t => document.querySelector('#quranPageNo').textContent === t, `${AR(2)} / ${AR(604)}`);
const box = await page.locator('#quranStage').boundingBox();
await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down();
await page.mouse.move(box.x + 80, box.y + 305, { steps:8 }); await page.mouse.up();
await page.waitForFunction(t => document.querySelector('#quranPageNo').textContent === t, `${AR(3)} / ${AR(604)}`);

// Tafsir sheet with a second source.
await page.waitForTimeout(450);
const first = pages[2][0];
await page.click(`#quranStagePage .ayah[data-s="2"][data-a="${first[1] - 1}"]`);
await page.waitForSelector('#quranSheet:not(.hidden)');
assert.equal(await page.textContent('#quranSheetTafsir'), baqarah.ayahs[first[1] - 1][1], 'muyassar for the tapped ayah');
await page.click('#quranSheetSources [data-sheet-tafsir="jalalayn"]');
await page.waitForFunction(t => document.querySelector('#quranSheetTafsir').textContent === t, `jalalayn ${first[1]}`);
await page.click('#quranSheetSources [data-sheet-tafsir="muyassar"]');
await page.click('#quranSheetClose');

// Density: Qiyam puts five Madina pages on one page.
await page.click('#quranViewBtn');
await page.click('[data-q-density="5"]');
await page.waitForFunction(() => /١٢١$/.test(document.querySelector('#quranPageNo').textContent));
await page.click('[data-q-density="1"]');
await page.waitForFunction(() => /٦٠٤$/.test(document.querySelector('#quranPageNo').textContent));

// Scroll view stacks pages; study view puts a tafsir under every ayah.
await page.click('[data-q-view="scroll"]');
await page.waitForSelector('#quranText .mushaf-page');
assert.equal(await page.isHidden('#quranStage'), true);
await page.click('[data-q-view="study"]');
await page.waitForSelector('#quranText .ayah-tafsir');
assert.equal(await page.locator('#quranText .ayah-tafsir').count(), baqarah.ayahs.length);
await page.click('[data-q-view="paged"]');
await page.click('#quranPanelClose');

const listened = page.evaluate(() => new Promise(resolve => document.addEventListener('tilawat:listen-surah', e => resolve(e.detail.surah), { once:true })));
await page.click('#quranListen');
assert.equal(await listened, 2, 'listen asks the player for the surah on screen');
await page.evaluate(() => document.getElementById('playerClose')?.click());

await page.click('[data-tab="home"]');
assert.equal(await page.isHidden('#quranReader'), true, 'changing tab closes the reader');
await page.waitForSelector('.home-quran[data-quran-open="2"]');

// Search tab finds ayahs too, and a hit opens the reader on that ayah's page.
await page.click('[data-tab="search"]');
await page.fill('#searchInput', 'الصلاة الوسطى');
await page.waitForSelector('#searchAyahs .ayah-hit');
await page.click('#searchAyahs .ayah-hit');
await page.waitForSelector('#quranStagePage .ayah[data-s="2"][data-a="237"]');

assert.deepEqual(errors, []);
await browser.close();
console.log('quran regression ok');
