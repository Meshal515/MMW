import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  providerKey, setProviderKey, lockProviderKey,
  savedProviderKeyExists, saveEncryptedProviderKey,
  unlockProviderKey, forgetProviderKey
} from '../src/keyring.js';

test('DeepSeek BYOK activation and lock use imported ESM functions',()=>{
  const fake='sk-test-key-012345678901234567890';
  try {
    setProviderKey(fake);
    assert.equal(providerKey(),fake);
    assert.throws(()=>setProviderKey('short'),/مفتاح API/);
    assert.equal(providerKey(),fake,'invalid input should not overwrite previous key');
  } finally {
    lockProviderKey();
  }
  assert.equal(providerKey(),'');
});

test('all BYOK vault controls are exported and main UI explicitly imports them',()=>{
  for(const fn of [providerKey,setProviderKey,lockProviderKey,savedProviderKeyExists,saveEncryptedProviderKey,unlockProviderKey,forgetProviderKey])assert.equal(typeof fn,'function');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/import\s*\{[^}]*setProviderKey[^}]*\}\s*from\s*['"]\.\/keyring\.js['"]/);
  assert.match(main,/const key=providerKey\(\)/);
  assert.match(main,/await saveEncryptedProviderKey\(/);
  assert.match(main,/await unlockProviderKey\(/);
});
