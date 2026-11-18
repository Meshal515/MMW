// USPACE knowledge graph: every link and index is derived locally from IndexedDB pages.
export function extractTags(text){
 const result=new Set();
 const regex=/(^|[\s(\[{،؛])#([\p{L}\p{N}_-]{1,40})/gu;
 for(const m of String(text||'').matchAll(regex))result.add(m[2]);
 return [...result].slice(0,100);
}
export function extractWikiLinks(text){
 const result=new Set();
 const regex=/\[\[([^\]\n]{1,120})\]\]/g;
 for(const match of String(text||'').matchAll(regex)){
   const title=match[1].split('|')[0].trim();
   if(title)result.add(title);
 }
 return [...result].slice(0,200);
}
export function linkedPageIds(page,pages){
 const titleToId=new Map(pages.filter(p=>p.spaceId===page.spaceId).map(p=>[String(p.title||'').trim().toLocaleLowerCase(),p.id]));
 return extractWikiLinks(page.body).map(title=>titleToId.get(title.toLocaleLowerCase())).filter(Boolean);
}
export function backlinksFor(target,pages){
 return pages.filter(p=>p.id!==target.id&&p.spaceId===target.spaceId&&linkedPageIds(p,pages).includes(target.id));
}
export function rankPages(pages,term,spaceId=null){
 const words=String(term||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return pages.filter(page=>spaceId==null||page.spaceId===spaceId).map(page=>{
   const title=String(page.title||'').toLocaleLowerCase();
   const body=String(page.body||'').toLocaleLowerCase();
   const tags=extractTags(page.body).join(' ').toLocaleLowerCase();
   if(!words.every(word=>title.includes(word)||body.includes(word)||tags.includes(word)))return null;
   const score=words.reduce((sum,word)=>sum+(title.startsWith(word)?12:title.includes(word)?6:tags.includes(word)?4:1),0)+(page.favorite?3:0);
   return {page,score};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||(b.page.updatedAt||0)-(a.page.updatedAt||0)).map(x=>x.page);
}
export function graphForSpace(pages,spaceId){
 const nodes=pages.filter(p=>p.spaceId===spaceId).slice(0,75);
 const valid=new Set(nodes.map(x=>x.id));
 const edges=[];
 for(const page of nodes)for(const target of linkedPageIds(page,nodes)){
   if(valid.has(target)&&target!==page.id)edges.push({source:page.id,target});
 }
 return {nodes,edges};
}
export function dailyTitle(date=new Date()){
 const d= date instanceof Date?date:new Date(date);
 return 'مذكّرة يومية — '+new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export const PAGE_TEMPLATES={
 blank:{label:'صفحة فارغة',body:''},
 project:{label:'ملف مشروع',body:'# الهدف\n\n# الوضع الحالي\n\n# القرارات\n\n# الخطوات التالية\n- [ ] \n\n# المخاطر\n'},
 plan:{label:'خطة تطوير',body:'# الهدف\n\n# الأولويات\n1. \n\n# التنفيذ\n- [ ] \n\n# اختبارات القبول\n- [ ] \n'},
 meeting:{label:'اجتماع وملاحظات',body:'# المشاركون\n\n# النقاط المطروحة\n\n# القرارات\n\n# المهام\n- [ ] \n'},
 note:{label:'مذكرة يومية',body:'# ملخص اليوم\n\n# أفكار\n\n# مهام\n- [ ] \n\n# ملاحظات\n'}
};
