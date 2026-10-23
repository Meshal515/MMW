import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:4173/tilawat/';
const kahf = JSON.parse(await readFile(new URL('../data/quran/018.json', import.meta.url), 'utf8'));

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{ width:390, height:844 }, locale:'ar-SA', colorScheme:'dark' });
const page = await context.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', e => errors.push(`pageerror: ${e.stack || e.message}`));

await page.goto(BASE);
await page.click('[data-tab="quran"]');
await page.waitForSelector('#quranIndex .quran-row');
assert.equal(await page.locator('#quranIndex .quran-row').count(), 114, 'index lists every surah');
assert.equal(await page.isHidden('#homeView'), true, 'home hides while the Quran tab is open');

await page.fill('#quranSearch', 'الكهف');
assert.equal(await page.locator('#quranIndex .quran-row').count(), 1, 'search narrows to one surah');
await page.fill('#quranSearch', '١٨');
assert.equal(await page.locator('#quranIndex [data-quran-open="18"]').count(), 1, 'Arabic-Indic number search');
await page.fill('#quranSearch', '');
await page.click('#quranSegs [data-qseg="medinan"]');
const medinan = await page.locator('#quranIndex .quran-row').count();
assert.ok(medinan > 20 && medinan < 40, `medinan filter, got ${medinan}`);
await page.click('#quranSegs [data-qseg="all"]');

await page.click('#quranIndex [data-quran-open="18"]');
await page.waitForSelector('#quranText .ayah');
assert.equal(await page.textContent('#quranReaderTitle'), 'سورة الكهف');
assert.equal(await page.locator('#quranText .ayah').count(), kahf.ayahs.length, 'every ayah rendered');
assert.equal(await page.isVisible('#quranBismillah'), true, 'bismillah shown for al-Kahf');
assert.match(await page.getAttribute('#quranHeadArt', 'src'), /covers\/surah\/018\.jpg$/);

await page.click('#quranText .ayah[data-a="9"]');
await page.waitForSelector('#quranSheet:not(.hidden)');
assert.equal(await page.textContent('#quranSheetTafsir'), kahf.ayahs[9][1], 'sheet shows the tafsir of the tapped ayah');
await page.click('#quranSheetNext');
assert.equal(await page.textContent('#quranSheetTafsir'), kahf.ayahs[10][1], 'next ayah in the sheet');
await page.click('#quranSheetClose');
assert.equal(await page.isHidden('#quranSheet'), true);

await page.click('#quranInlineBtn');
assert.equal(await page.locator('#quranText .ayah-tafsir').count(), kahf.ayahs.length, 'inline mode shows tafsir under every ayah');
await page.click('#quranInlineBtn');

const listened = page.evaluate(() => new Promise(resolve => document.addEventListener('tilawat:listen-surah', e => resolve(e.detail.surah), { once:true })));
await page.click('#quranListen');
assert.equal(await listened, 18, 'listen asks the player for the same surah');
await page.evaluate(() => document.getElementById('playerClose')?.click());

await page.click('[data-tab="home"]');
assert.equal(await page.isHidden('#quranReader'), true, 'changing tab closes the reader');
await page.waitForSelector('.home-quran[data-quran-open="18"]');

await page.click('[data-tab="quran"]');
await page.click('#quranIndex [data-quran-open="9"]');
await page.waitForSelector('#quranText .ayah');
assert.equal(await page.isHidden('#quranBismillah'), true, 'no bismillah before at-Tawbah');

assert.deepEqual(errors, []);
await browser.close();
console.log('quran regression ok');
