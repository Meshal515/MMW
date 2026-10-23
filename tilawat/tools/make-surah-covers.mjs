// Writes assets/covers/surah/001.jpg … 114.jpg from tools/surah-covers.html.
// Run from the repo root after adding or changing photos:
//   node tilawat/tools/make-surah-covers.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'assets/covers/surah');
const TYPES = { '.html':'text/html', '.json':'application/json', '.jpg':'image/jpeg', '.woff2':'font/woff2' };

const server = createServer(async (req, res) => {
  const path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));

await mkdir(OUT, { recursive:true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/tools/surah-covers.html`);
for (let n = 1; n <= 114; n++){
  const url = await page.evaluate(n => window.renderCover(n), n);
  await writeFile(join(OUT, String(n).padStart(3, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close();
server.close();
console.log('wrote 114 covers to', OUT);
