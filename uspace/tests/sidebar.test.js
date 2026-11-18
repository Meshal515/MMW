import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
test('library keeps its original compact spaces and pages navigation',()=>{
 for(const id of ['sidebar','spaces-list','pages-list','add-space','add-page','search','backup-btn','import-btn','restore-backup-btn','settings-btn']){
   assert.ok(main.includes('id="'+id+'"'),'missing sidebar child '+id);
 }
});
test('mobile library open button has meaningful name and reports expanded state',()=>{
 assert.match(main,/id="open-sidebar"[^>]*aria-label="فتح المكتبة والصفحات"/);
 assert.match(main,/id="open-sidebar"[^>]*aria-controls="sidebar"/);
 assert.match(main,/setAttribute\('aria-expanded',String\(value\)\)/);
 assert.match(main,/id="close-sidebar"[^>]*title="إغلاق المكتبة"/);
 assert.match(main,/toggleSidebar\(!state.sidebarOpen\)/);
});
test('desktop sidebar is persistent; phone sidebar is a responsive drawer',()=>{
 const section=css.slice(css.lastIndexOf('/* Persistent desktop library'));
 assert.ok(section.includes('@media(min-width:720px)'));
 assert.ok(section.includes('.sidebar{\n    position:relative;grid-column:1;grid-row:1;width:100%;height:100%;'));
 assert.ok(section.includes('@media(max-width:719px)'));
 assert.ok(section.includes('.sidebar.open{transform:translateX(0)}'));
 assert.ok(section.includes('.mobile-menu#open-sidebar{'));
 assert.ok(section.includes('.sidebar-open-label{white-space:nowrap'));
});
