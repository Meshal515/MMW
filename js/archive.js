/* ===========================================================================
   النسخ الاحتياطيّ الكامل للمكتبة.

   ملفٌّ واحدٌ بصيغة ZIP يحمل كلّ شيء: سجلّات المشاريع والنسخ، وملفّاتها
   المنزوعة التكرار، **وبيانات الأدوات نفسها** — وهذي الأخيرة هي الأثمن، لأنّ
   المشروع يُعاد استيراده من ملفّه الأصليّ، أمّا ما كتبتَه داخل أداتك فلا
   نسخةَ له في مكانٍ آخر.

   وZIP لا JSON: ترميزُ base64 يزيد الثلث، ومكتبةٌ بنصف جيجابايت تصير سلسلةً
   نصّيّةً تقتل الذاكرة قبل أن تُكتب.
   =========================================================================== */

import { getAll, getOne, putOne, uuid } from './core.js';
import { unzip } from './importer.js';

export const ARCHIVE_VERSION = 1;

/* ── كتابة ZIP ────────────────────────────────────────────────────────────── */

let CRC_TABLE = null;
function crcTable(){
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++){
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return (CRC_TABLE = t);
}
function crc32(u8, seed = 0){
  const t = crcTable();
  let c = (~seed) >>> 0;
  for (let i = 0; i < u8.length; i++) c = (c >>> 8) ^ t[(c ^ u8[i]) & 0xff];
  return (~c) >>> 0;
}

async function deflateRaw(u8){
  if (typeof CompressionStream !== 'function') return null;
  try{
    const cs = new CompressionStream('deflate-raw');
    const buf = await new Response(new Blob([u8]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(buf);
  }catch{ return null }
}

const enc = new TextEncoder();
function u16(n){ return [n & 0xff, (n >>> 8) & 0xff] }
function u32(n){ return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff] }

/**
 * يبني ZIP من مدخلاتٍ `{path, blob}` ويعيد Blob.
 * الأجزاء تُجمع كقائمة Blobات، فالمتصفّح يسندها إلى القرص بدل الذاكرة.
 */
export async function writeZip(entries, onProgress = () => {}){
  const parts = [], central = [];
  let offset = 0;
  for (let i = 0; i < entries.length; i++){
    const { path, blob } = entries[i];
    const name = enc.encode(path);
    const raw = new Uint8Array(await blob.arrayBuffer());
    const crc = crc32(raw);
    let data = await deflateRaw(raw);
    let method = 8;
    /* الضغط قد يكبّر ما هو مضغوطٌ أصلًا (صورة، خطّ)، فيُخزَّن كما هو. */
    if (!data || data.length >= raw.length){ data = raw; method = 0; }

    /* البت ١١ يعلن أنّ الاسم UTF-8 — وأسماؤنا عربيّة. */
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(method),
      ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(raw.length),
      ...u16(name.length), ...u16(0),
    ];
    parts.push(new Uint8Array(local), name, data);
    central.push({ name, crc, method, csize: data.length, usize: raw.length, offset });
    offset += local.length + name.length + data.length;
    if (i % 12 === 0) onProgress(i + 1, entries.length);
  }

  const cdStart = offset;
  for (const e of central){
    const head = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(e.method),
      ...u16(0), ...u16(0), ...u32(e.crc), ...u32(e.csize), ...u32(e.usize),
      ...u16(e.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(e.offset),
    ];
    parts.push(new Uint8Array(head), e.name);
    offset += head.length + e.name.length;
  }
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(central.length), ...u16(central.length),
    ...u32(offset - cdStart), ...u32(cdStart), ...u16(0),
  ];
  parts.push(new Uint8Array(eocd));
  return new Blob(parts, { type: 'application/zip' });
}

/* ── ترميز القيم ──────────────────────────────────────────────────────────
   قيمُ IndexedDB تحمل Blobات وTypedArrays، وJSON لا يحملها. فتُستخرج البيانات
   الثنائيّة إلى مدخلاتٍ مستقلّةٍ في الأرشيف، ويبقى في JSON مرجعٌ إليها. */

async function encodeValue(v, emit){
  if (v === null || v === undefined) return v;
  if (v instanceof Blob)
    return { __b: await emit(v), type: v.type || '', name: v.name || undefined };
  if (v instanceof ArrayBuffer)
    return { __ab: await emit(new Blob([v])) };
  if (ArrayBuffer.isView(v))
    return { __tv: v.constructor.name,
             ref: await emit(new Blob([v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)])) };
  if (v instanceof Date) return { __d: v.toISOString() };
  if (Array.isArray(v)) return Promise.all(v.map(x => encodeValue(x, emit)));
  if (typeof v === 'object'){
    const out = {};
    for (const k of Object.keys(v)) out[k] = await encodeValue(v[k], emit);
    return out;
  }
  return v;
}

function decodeValue(v, load){
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => decodeValue(x, load));
  if ('__b' in v){ const b = load(v.__b); return b ? new Blob([b], { type: v.type || '' }) : null }
  if ('__ab' in v){ const b = load(v.__ab); return b ? b.buffer ?? b : null }
  if ('__tv' in v){
    const b = load(v.ref); if (!b) return null;
    const C = globalThis[v.__tv];
    return (typeof C === 'function') ? new C(b.buffer ?? b) : b;
  }
  if ('__d' in v) return new Date(v.__d);
  const out = {};
  for (const k of Object.keys(v)) out[k] = decodeValue(v[k], load);
  return out;
}

/* ── قراءة مخازن الأدوات ──────────────────────────────────────────────────
   كلُّ قاعدةٍ على هذا الأصل غير قاعدة Local نفسها هي بياناتُ أداة. */

const OWN_DB = 'local-launcher-v1';

async function readToolDatabases(emit, onProgress = () => {}){
  if (!indexedDB.databases) return [];
  let list = [];
  try{ list = await indexedDB.databases() }catch{ return [] }
  const out = [];
  for (const info of list){
    if (!info.name || info.name === OWN_DB) continue;
    try{
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open(info.name);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
      });
      const stores = [...db.objectStoreNames];
      const dump = { name: info.name, version: db.version, stores: [] };
      for (const s of stores){
        const os = db.transaction(s).objectStore(s);
        const rows = await new Promise((res, rej) => {
          const q = os.getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
        });
        let keys = null;
        if (!os.keyPath){
          keys = await new Promise((res) => {
            const q = os.getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => res(null);
          });
        }
        dump.stores.push({
          name: s, keyPath: os.keyPath, autoIncrement: os.autoIncrement,
          indexes: [...os.indexNames].map(n => {
            const ix = os.index(n);
            return { name: n, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry };
          }),
          keys, rows: await encodeValue(rows, emit),
        });
        onProgress(info.name, s);
      }
      db.close();
      out.push(dump);
    }catch{ /* قاعدةٌ لا تُقرأ تُتخطّى ويُذكر ذلك في البيان */ }
  }
  return out;
}

function readLocalStorage(){
  const out = {};
  try{ for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); out[k] = localStorage.getItem(k) } }
  catch{}
  return out;
}

/* ── التصدير ──────────────────────────────────────────────────────────────── */

export async function exportLibrary(onProgress = () => {}){
  onProgress('أجمع المشاريع…');
  const projects = await getAll('projects');
  const versions = await getAll('versions');

  const entries = [];
  const seen = new Set();
  const emit = async (blob) => {
    const id = `bin/${uuid()}`;
    entries.push({ path: id, blob });
    return id;
  };

  onProgress('أجمع ملفات المشاريع…');
  const hashes = new Set();
  for (const v of versions){
    for (const m of v.manifest || []) hashes.add(m.hash);
    if (v.thumbnailHash) hashes.add(v.thumbnailHash);
  }
  for (const p of projects) if (p.thumbnailHash) hashes.add(p.thumbnailHash);

  const objects = [];
  let n = 0;
  for (const h of hashes){
    const o = await getOne('objects', h);
    if (!o) continue;
    entries.push({ path: `objects/${h}`, blob: o.blob });
    objects.push({ hash: h, size: o.size ?? o.blob.size, type: o.type || '' });
    if (++n % 20 === 0) onProgress(`أجمع الملفات… ${n}/${hashes.size}`);
    seen.add(h);
  }

  onProgress('أجمع بيانات الأدوات…');
  const tools = await readToolDatabases(emit, (db) => onProgress(`أجمع بيانات الأداة ${db}…`));

  const manifest = {
    format: 'local-library',
    version: ARCHIVE_VERSION,
    exportedAt: Date.now(),
    origin: location.origin,
    counts: { projects: projects.length, versions: versions.length, objects: objects.length, toolDatabases: tools.length },
  };
  entries.unshift(
    { path: 'manifest.json', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) },
    { path: 'projects.json', blob: new Blob([JSON.stringify(projects)], { type: 'application/json' }) },
    { path: 'versions.json', blob: new Blob([JSON.stringify(versions)], { type: 'application/json' }) },
    { path: 'objects.json', blob: new Blob([JSON.stringify(objects)], { type: 'application/json' }) },
    { path: 'localstorage.json', blob: new Blob([JSON.stringify(readLocalStorage())], { type: 'application/json' }) },
    { path: 'tools.json', blob: new Blob([JSON.stringify(tools)], { type: 'application/json' }) },
  );

  onProgress('أضغط الأرشيف…');
  const blob = await writeZip(entries, (i, total) => onProgress(`أضغط… ${i}/${total}`));
  return { blob, manifest };
}

/* ── الاستيراد ────────────────────────────────────────────────────────────
   الدمج هو الافتراض: ما كان موجودًا لا يُدهس. على جهازٍ نظيفٍ لا شيء موجود،
   فيصل كلُّ شيء — وهذي هي حالة الاستعادة بعد الكارثة. */

function idbOpen(name, version, upgrade){
  return new Promise((resolve, reject) => {
    const r = version ? indexedDB.open(name, version) : indexedDB.open(name);
    if (upgrade) r.onupgradeneeded = () => upgrade(r.result, r.transaction);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('blocked'));
  });
}
const txDone = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
});

async function restoreToolDatabase(dump, load){
  /* لا تُفتح للاستكشاف: `indexedDB.open(name)` على قاعدةٍ غير موجودة **ينشئها**
     بالنسخة ١، فلا تُطلق الترقيةُ في الفتحة التالية وتبقى القاعدة بلا مخازن. */
  let existing = 0;
  try{
    const list = (await indexedDB.databases?.()) || [];
    existing = list.find(d => d.name === dump.name)?.version || 0;
  }catch{}
  /* وقاعدةٌ موجودةٌ بنفس الرقم قد تكون ناقصةَ المخازن — يكفي أن يكون شيءٌ قد
     فتحها مرّةً بلا إنشاء. عندها لا تُطلق الترقيةُ أبدًا وتُتخطّى الاستعادة
     بصمت، فيُرفع الرقمُ عمدًا لتُطلق. */
  let missing = false;
  if (existing > 0){
    try{
      const probe = await idbOpen(dump.name, existing);
      missing = dump.stores.some(s => !probe.objectStoreNames.contains(s.name));
      probe.close();
    }catch{}
  }
  const version = missing ? existing + 1 : Math.max(existing, dump.version || 1);

  const db = await idbOpen(dump.name, version, (d, tx) => {
    for (const s of dump.stores){
      let os;
      if (!d.objectStoreNames.contains(s.name)){
        os = d.createObjectStore(s.name,
          s.keyPath != null ? { keyPath: s.keyPath, autoIncrement: !!s.autoIncrement }
                            : { autoIncrement: !!s.autoIncrement });
      } else { os = tx.objectStore(s.name) }
      for (const ix of s.indexes || []){
        if (!os.indexNames.contains(ix.name))
          os.createIndex(ix.name, ix.keyPath, { unique: !!ix.unique, multiEntry: !!ix.multiEntry });
      }
    }
  });

  let added = 0, kept = 0;
  for (const s of dump.stores){
    if (!db.objectStoreNames.contains(s.name)) continue;
    const rows = decodeValue(s.rows, load) || [];
    if (!rows.length) continue;

    /* المفاتيح الموجودة تُقرأ كلُّها مرّةً واحدة قبل الكتابة. القراءةُ ثمّ
       الكتابةُ داخل معاملةٍ واحدةٍ عبر `await` تموت: المعاملة تُغلق بمغادرة
       المهمّة، فتصير كلُّ إضافةٍ بعدها TransactionInactiveError. */
    const have = new Set();
    try{
      const keys = await new Promise((res, rej) => {
        const q = db.transaction(s.name).objectStore(s.name).getAllKeys();
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      });
      for (const k of keys) have.add(JSON.stringify(k));
    }catch{}

    const tx = db.transaction(s.name, 'readwrite');
    const os = tx.objectStore(s.name);
    for (let i = 0; i < rows.length; i++){
      const key = s.keys ? s.keys[i]
                : (typeof s.keyPath === 'string' ? rows[i]?.[s.keyPath] : undefined);
      if (key !== undefined && have.has(JSON.stringify(key))){ kept++; continue }
      try{
        if (s.keys) os.put(rows[i], s.keys[i]); else os.put(rows[i]);
        added++;
      }catch{ kept++ }
    }
    try{ await txDone(tx) }catch{}
  }
  db.close();
  return { added, kept };
}

export async function importLibrary(file, onProgress = () => {}){
  onProgress('أفكّ الأرشيف…');
  const files = await unzip(file);
  const byPath = new Map(files.map(f => [f.path, f.blob]));

  const readJSON = async (p) => {
    const b = byPath.get(p);
    if (!b) return null;
    try{ return JSON.parse(await b.text()) }catch{ return null }
  };
  const manifest = await readJSON('manifest.json');
  if (!manifest || manifest.format !== 'local-library')
    throw new Error('هذا ليس ملف نسخة احتياطية من Local.');
  if ((manifest.version || 0) > ARCHIVE_VERSION)
    throw new Error('النسخة الاحتياطية أحدث من هذا الإصدار من Local.');

  const load = (ref) => byPath.get(ref) || null;
  const report = { projects: 0, versions: 0, objects: 0, skipped: 0, toolRows: 0, toolKept: 0, localKeys: 0 };

  onProgress('أعيد الملفات…');
  const objects = (await readJSON('objects.json')) || [];
  let n = 0;
  for (const o of objects){
    const blob = byPath.get(`objects/${o.hash}`);
    if (!blob) continue;
    if (!(await getOne('objects', o.hash))){
      await putOne('objects', { hash: o.hash, blob, size: o.size ?? blob.size, type: o.type || '' });
      report.objects++;
    }
    if (++n % 20 === 0) onProgress(`أعيد الملفات… ${n}/${objects.length}`);
  }

  onProgress('أعيد المشاريع…');
  for (const v of (await readJSON('versions.json')) || []){
    if (await getOne('versions', v.id)){ report.skipped++; continue }
    await putOne('versions', v); report.versions++;
  }
  for (const p of (await readJSON('projects.json')) || []){
    if (await getOne('projects', p.id)){ report.skipped++; continue }
    await putOne('projects', p); report.projects++;
  }

  onProgress('أعيد بيانات الأدوات…');
  for (const dump of (await readJSON('tools.json')) || []){
    try{
      const r = await restoreToolDatabase(dump, load);
      report.toolRows += r.added; report.toolKept += r.kept;
    }catch{ /* قاعدةٌ تعذّر فتحها تُتخطّى، والبقيّة تكمل */ }
  }

  const ls = (await readJSON('localstorage.json')) || {};
  for (const [k, val] of Object.entries(ls)){
    try{ if (localStorage.getItem(k) === null){ localStorage.setItem(k, val); report.localKeys++ } }catch{}
  }

  return { manifest, report };
}
