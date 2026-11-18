/**
 * Strict, dependency-free validation for offline JSON backups.
 * Importers must remap IDs rather than overwriting existing pages.
 */
const MAX_PAGES=3000,MAX_SPACES=250,MAX_BODY=2000000;
const finiteTime=v=>Number.isFinite(v)&&v>0?Math.round(v):Date.now();
const bounded=(value,max)=>typeof value==='string'&&value.length<=max;
function safeUrl(value, image=false){
 if(typeof value!=='string'||value.length>2048)return false;
 const trimmed=value.trim();
 if(trimmed.startsWith('#')||trimmed.startsWith('/'))return !trimmed.startsWith('//');
 try{
   const parsed=new URL(trimmed);
   return image?parsed.protocol==='https:':['https:','http:','mailto:'].includes(parsed.protocol);
 }catch{return false;}
}
function validateAttributes(attrs, image=false){
 if(attrs==null)return;
 if(typeof attrs!=='object'||Array.isArray(attrs))throw Error('خصائص التنسيق غير صالحة.');
 for(const [key,value] of Object.entries(attrs)){
   if(!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)||key.length>70)throw Error('اسم خاصية غير صالح.');
   if(typeof value==='string'){
     if(value.length>2200||/[\u0000-\u001f]/.test(value))throw Error('قيمة خاصية غير صالحة.');
     if((key==='href'||key==='src')&&!safeUrl(value,key==='src'||image))throw Error('رابط غير آمن في النسخة الاحتياطية.');
     if(/(?:expression\s*\(|url\s*\(|javascript\s*:)/i.test(value))throw Error('تنسيق غير آمن في النسخة الاحتياطية.');
   }
 }
}
function validateRichJSON(value){
 if(value==null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value)||value.type!=='doc')throw Error('تنسيق Rich Text غير صالح.');
 let nodes=0;
 const stack=[{node:value,depth:0}];
 while(stack.length){
   const {node,depth}=stack.pop();
   if(++nodes>60000||depth>90)throw Error('بيانات تنسيق المستند كبيرة أو عميقة.');
   if(!node||typeof node!=='object'||Array.isArray(node)||typeof node.type!=='string'||node.type.length>70)throw Error('عقدة Rich Text غير صالحة.');
   if(node.text!==undefined&&!bounded(node.text,MAX_BODY))throw Error('محتوى Rich Text غير صالح.');
   if(node.content!==undefined){
     if(!Array.isArray(node.content)||node.content.length>60000)throw Error('هيكل المستند غير صالح.');
     for(const child of node.content)stack.push({node:child,depth:depth+1});
   }
   validateAttributes(node.attrs,node.type==='image');
   if(node.marks!==undefined){
     if(!Array.isArray(node.marks))throw Error('خصائص النص غير صالحة.');
     for(const mark of node.marks){
       if(!mark||typeof mark.type!=='string')throw Error('نوع تنسيق غير صالح.');
       validateAttributes(mark.attrs);
     }
   }
 }
 return value;
}
export function validateBackup(contents){
 let data;
 try {data=JSON.parse(contents);}catch{throw Error('ملف JSON غير صالح.');}
 if(!data||data.format!=='uspace-backup-v1'||!Array.isArray(data.spaces)||!Array.isArray(data.pages))throw Error('صيغة النسخة الاحتياطية غير متوافقة.');
 if(data.spaces.length>MAX_SPACES||data.pages.length>MAX_PAGES)throw Error('النسخة أكبر من الحدود المسموحة.');
 const spaces=data.spaces.map(x=>{
   if(!x||!bounded(x.id,160)||!x.id||!bounded(x.name,100)||!bounded(x.instructions||'',2500))throw Error('بيانات مساحة غير صالحة.');
   return {originalId:x.id,name:x.name||'مساحة مستعادة',instructions:x.instructions||'',createdAt:finiteTime(x.createdAt)};
 });
 const spaceIds=new Set(spaces.map(x=>x.originalId));
 if(spaceIds.size!==spaces.length)throw Error('معرفات المساحات مكررة.');
 const pages=data.pages.map(x=>{
   if(!x||!bounded(x.id,160)||!x.id||!bounded(x.spaceId,160)||!spaceIds.has(x.spaceId)||!bounded(x.title,200)||!bounded(x.body,MAX_BODY)||!bounded(x.instructions||'',2500))throw Error('بيانات صفحة غير صالحة.');
   const richDoc=validateRichJSON(x.richDoc);
   return {originalId:x.id,originalSpaceId:x.spaceId,title:x.title||'صفحة بدون عنوان',body:x.body,instructions:x.instructions||'',richDoc,createdAt:finiteTime(x.createdAt),updatedAt:finiteTime(x.updatedAt),fontFamily:bounded(x.fontFamily,40)?x.fontFamily:'system',fontSize:Number.isInteger(Number(x.fontSize))?Number(x.fontSize):16};
 });
 if(new Set(pages.map(x=>x.originalId)).size!==pages.length)throw Error('معرفات الصفحات مكررة.');
 return {spaces,pages};
}
