// DeepSeek BYOK vault: API credentials are never stored in plaintext.
const USPACE_VAULT_DB = 'uspace-key-vault-v1';
const USPACE_VAULT_ENTRY = 'deepseek';
let activeProviderKey = '';

function providerKey() { return activeProviderKey; }
function setProviderKey(key) {
  const value = String(key || '').trim();
  if (value.length < 20 || value.length > 512 || /[^!-~]/.test(value)) throw new Error('مفتاح API غير صالح.');
  activeProviderKey = value;
}
function lockProviderKey() { activeProviderKey = ''; }

function keyVaultDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(USPACE_VAULT_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('vault');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function keyVaultOperation(mode, callback) {
  const database = await keyVaultDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('vault', mode);
      let value;
      transaction.objectStore('vault');
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Vault transaction aborted'));
      callback(transaction.objectStore('vault'), result => { value = result; });
    });
  } finally { database.close(); }
}
async function savedProviderKeyExists() {
  return Boolean(await keyVaultOperation('readonly', (store, done) => {
    const req = store.get(USPACE_VAULT_ENTRY);
    req.onsuccess = () => done(req.result);
  }));
}
async function deriveVaultKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt, iterations:310000, hash:'SHA-256'},
    material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']
  );
}
async function saveEncryptedProviderKey(passphrase) {
  if (!activeProviderKey) throw new Error('أدخل مفتاح API أولًا.');
  if (passphrase.length < 12) throw new Error('استخدم عبارة مرور لا تقل عن 12 حرفًا.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(passphrase, salt);
  const data = new TextEncoder().encode(activeProviderKey);
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, data);
  await keyVaultOperation('readwrite', store => store.put({
    version:1, kdf:'PBKDF2-SHA256', iterations:310000,
    salt:Array.from(salt), iv:Array.from(iv), ciphertext:Array.from(new Uint8Array(ciphertext))
  }, USPACE_VAULT_ENTRY));
}
async function unlockProviderKey(passphrase) {
  const record = await keyVaultOperation('readonly', (store, done) => {
    const req = store.get(USPACE_VAULT_ENTRY);
    req.onsuccess = () => done(req.result);
  });
  if (!record || record.version !== 1) throw new Error('لا يوجد مفتاح محفوظ على هذا الجهاز.');
  try {
    const key = await deriveVaultKey(passphrase, new Uint8Array(record.salt));
    const plaintext = await crypto.subtle.decrypt(
      {name:'AES-GCM', iv:new Uint8Array(record.iv)}, key, new Uint8Array(record.ciphertext)
    );
    setProviderKey(new TextDecoder().decode(plaintext));
  } catch { throw new Error('عبارة المرور غير صحيحة أو بيانات المفتاح تالفة.'); }
}
async function forgetProviderKey() {
  lockProviderKey();
  await keyVaultOperation('readwrite', store => store.delete(USPACE_VAULT_ENTRY));
}

// Explicit ESM exports: esbuild only bundles functions reached through imports.
export { providerKey, setProviderKey, lockProviderKey, savedProviderKeyExists, saveEncryptedProviderKey, unlockProviderKey, forgetProviderKey };
