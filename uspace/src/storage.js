const DB_NAME = 'uspace-local-v1';
let dbPromise;
function db() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('spaces', { keyPath: 'id' });
      const p = d.createObjectStore('pages', { keyPath: 'id' });
      p.createIndex('bySpace', 'spaceId');
      const r = d.createObjectStore('revisions', { keyPath: 'id' });
      r.createIndex('byPage', 'pageId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function op(store, mode, callback) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    let result;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    tx.oncomplete = () => resolve(result);
    callback(tx.objectStore(store), val => { result = val; });
  });
}
export const list = store => op(store, 'readonly', (s, save) => { const r = s.getAll(); r.onsuccess = () => save(r.result); });
export const put = (store, row) => op(store, 'readwrite', s => s.put(row));
export const remove = (store, id) => op(store, 'readwrite', s => s.delete(id));
export async function clearPage(id) {
  const all = await list('revisions');
  for (const revision of all.filter(x => x.pageId === id)) await remove('revisions', revision.id);
  await remove('pages', id);
}
export async function bootstrap() {
  let spaces = await list('spaces');
  if (!spaces.length) {
    const now = Date.now();
    const s = { id: crypto.randomUUID(), name: 'مساحتي الأولى', instructions: '', createdAt: now, updatedAt: now };
    const p = { id: crypto.randomUUID(), spaceId: s.id, title: 'صفحة بدون عنوان', body: '', instructions: '', createdAt: now, updatedAt: now };
    await put('spaces', s);
    await put('pages', p);
    spaces = [s];
  }
  return { spaces, pages: await list('pages') };
}
