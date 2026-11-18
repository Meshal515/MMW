import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateBackup} from '../src/backup.js';

const example={
  format:'uspace-backup-v1',
  spaces:[{id:'s1',name:'مشروعي',instructions:'احتفظ بالنص',createdAt:1730000000}],
  pages:[{id:'p1',spaceId:'s1',title:'الفصل الأول',body:'# عنوان\n\n**نص**',instructions:'',richDoc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'hello'}]}]},createdAt:1730000000,updatedAt:1730000000}]
};
test('backup import preserves Markdown and rich editor JSON',()=>{
 const result=validateBackup(JSON.stringify(example));
 assert.equal(result.pages[0].body,example.pages[0].body);
 assert.deepEqual(result.pages[0].richDoc,example.pages[0].richDoc);
 assert.equal(result.spaces[0].originalId,'s1');
});
test('backup import refuses invalid formats and missing references',()=>{
 assert.throws(()=>validateBackup('{invalid'),/JSON/);
 assert.throws(()=>validateBackup(JSON.stringify({...example,format:'other'})),/غير متوافقة/);
 assert.throws(()=>validateBackup(JSON.stringify({...example,pages:[{...example.pages[0],spaceId:'missing'}]})),/غير صالحة/);
});
test('backup import refuses excessive or malformed rich document nodes',()=>{
 assert.throws(()=>validateBackup(JSON.stringify({...example,pages:[{...example.pages[0],richDoc:{type:'other'}}]})),/Rich Text/);
 assert.throws(()=>validateBackup(JSON.stringify({...example,pages:[{...example.pages[0],body:'x'.repeat(2000001)}]})),/غير صالحة/);
});
