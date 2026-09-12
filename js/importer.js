import{TEXT_EXT,ext,mime,normalizePath,hashBlob,getOne,getAll,putOne,uuid}from'./core.js';

function commonTopFolder(paths){const parts=paths.map(p=>p.split('/')).filter(a=>a.length>1);if(!parts.length||parts.length!==paths.length)return'';const first=parts[0][0];return parts.every(a=>a[0]===first)?first:''}
export function cleanFiles(files){let out=files.map(f=>({...f,path:normalizePath(f.path)})).filter(f=>f.path&&!f.path.endsWith('/')&&!f.path.includes('__MACOSX/')&&!f.path.endsWith('.DS_Store'));const top=commonTopFolder(out.map(f=>f.path));if(top)out=out.map(f=>({...f,path:f.path.slice(top.length+1)}));return out}

export async function unzip(file){const buf=await file.arrayBuffer(),dv=new DataView(buf),u8=new Uint8Array(buf);let eocd=-1;for(let i=Math.max(0,buf.byteLength-65557);i<=buf.byteLength-22;i++)if(dv.getUint32(i,true)===0x06054b50)eocd=i;if(eocd<0)throw new Error('ZIP غير صالح');const total=dv.getUint16(eocd+10,true),cdOffset=dv.getUint32(eocd+16,true);if(total===65535||cdOffset===4294967295)throw new Error('ZIP64 غير مدعوم حاليًا');let p=cdOffset;const dec=new TextDecoder(),out=[];for(let i=0;i<total;i++){if(dv.getUint32(p,true)!==0x02014b50)throw new Error('تعذر قراءة فهرس ZIP');const flags=dv.getUint16(p+8,true),method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),usize=dv.getUint32(p+24,true),fnLen=dv.getUint16(p+28,true),exLen=dv.getUint16(p+30,true),cmLen=dv.getUint16(p+32,true),local=dv.getUint32(p+42,true);if(flags&1)throw new Error('ZIP المحمي بكلمة مرور غير مدعوم');const name=dec.decode(u8.slice(p+46,p+46+fnLen));p+=46+fnLen+exLen+cmLen;if(name.endsWith('/'))continue;if(dv.getUint32(local,true)!==0x04034b50)throw new Error('ZIP غير صالح');const lfn=dv.getUint16(local+26,true),lex=dv.getUint16(local+28,true),start=local+30+lfn+lex,comp=u8.slice(start,start+csize);let ab;if(method===0)ab=comp.buffer.slice(comp.byteOffset,comp.byteOffset+comp.byteLength);else if(method===8){if(!('DecompressionStream'in self))throw new Error('حدّث Chrome أو Brave لفك ZIP');const ds=new DecompressionStream('deflate-raw');ab=await new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer()}else throw new Error(`طريقة ضغط ZIP غير مدعومة: ${method}`);out.push({path:name,blob:new Blob([ab],{type:mime(name)}),size:usize,type:mime(name),lastModified:file.lastModified||Date.now()})}return cleanFiles(out)}

export async function fromFileList(list){return cleanFiles([...list].map(f=>({path:f.webkitRelativePath||f.name,blob:f,size:f.size,type:mime(f.name,f.type),lastModified:f.lastModified})))}

async function entryInfo(files){const map=new Map(files.map(f=>[f.path,f]));const entries=['index.html','index.htm','dist/index.html','build/index.html','public/index.html'];let entry=entries.find(x=>map.has(x));if(!entry){const htmls=files.filter(f=>['html','htm'].includes(ext(f.path))).sort((a,b)=>a.path.split('/').length-b.path.split('/').length||a.path.length-b.path.length);entry=htmls[0]?.path}if(!entry)throw new Error('لم أجد ملف HTML قابلًا للتشغيل داخل المشروع.');const html=await map.get(entry).blob.text(),doc=new DOMParser().parseFromString(html,'text/html'),title=(doc.querySelector('title')?.textContent||'').trim();const resolveLocal=href=>{if(!href||/^(https?:|data:|blob:|\/\/)/i.test(href))return'';try{return normalizePath(new URL(href,'https://local.invalid/'+entry).pathname)}catch{return normalizePath(href)}};
/* A social image is made to be looked at; a favicon is 16px of nothing. Ask for
   the wide ones first, fall back to icons only when there is no real picture. */
const iconSel='link[rel~="icon"],link[rel="apple-touch-icon"]',socialSel='meta[property="og:image"],meta[name="twitter:image"]';
const wide=[];for(const el of doc.querySelectorAll(socialSel))wide.push(resolveLocal(el.getAttribute('content')));
const named=files.filter(f=>/^image\//.test(f.type)&&/(screenshot|preview|cover|hero|banner|og[-_.]?image|social)/i.test(f.path)).map(f=>f.path);
const icons=[];for(const el of doc.querySelectorAll(iconSel))icons.push(resolveLocal(el.getAttribute('href')));icons.push('favicon.ico','favicon.png','favicon.svg','icon.png','icon.svg','logo.png','logo.svg','apple-touch-icon.png');
let thumb=[...wide,...named].find(x=>x&&map.has(x));
if(!thumb)thumb=files.filter(f=>/^image\//.test(f.type)&&f.size<4*1024*1024&&!/favicon/i.test(f.path)).sort((a,b)=>b.size-a.size)[0]?.path;
if(!thumb)thumb=icons.find(x=>x&&map.has(x));

/* A one-file project carries its art inside itself: the icon is a data: URI and
   there is no separate image on disk at all. Those used to be discarded for not
   being project files, so every single-file import fell back to Local's logo. */
let thumbBlob=null;
if(!thumb){
  const embedded=[...[...doc.querySelectorAll(socialSel)].map(el=>el.getAttribute('content')),
                  ...[...doc.querySelectorAll(iconSel)].map(el=>el.getAttribute('href'))]
                 .find(v=>v&&/^data:image\//i.test(v.trim()));
  if(embedded)thumbBlob=dataUriToBlob(embedded.trim());
}
/* Still nothing: draw a cover out of what the page does declare about itself —
   its theme colour and its title. A real mark beats a wall of identical logos. */
if(!thumb&&!thumbBlob){
  const theme=(doc.querySelector('meta[name="theme-color"]')?.getAttribute('content')||'').trim();
  thumbBlob=await generateCover(title||'',theme);
}
const thumbSize=thumbBlob?await imageSize(thumbBlob):(thumb?await imageSize(map.get(thumb)?.blob):null);
return{entry,title,thumb,thumbBlob,thumbSize}}

/* Measured once at import so the card can letterbox a small logo instead of
   blowing it up to fill a 16:10 frame. createImageBitmap rejects an SVG that
   carries only a viewBox, which then read as "no measurement" and so as "big
   enough to crop" — so a vector is measured from its markup instead. */
async function imageSize(blob){
  if(!blob)return null;
  if(/svg/i.test(blob.type)){try{const t=await blob.text();const doc=new DOMParser().parseFromString(t,'image/svg+xml');const el=doc.documentElement;const n=v=>{const f=parseFloat(v);return Number.isFinite(f)?f:0};let w=n(el.getAttribute('width')),h=n(el.getAttribute('height'));if(!w||!h){const vb=(el.getAttribute('viewBox')||'').split(/[\s,]+/).map(Number);if(vb.length===4){w=w||vb[2];h=h||vb[3]}}return{w,h,vector:true}}catch{return{w:0,h:0,vector:true}}}
  try{const bmp=await createImageBitmap(blob);const out={w:bmp.width,h:bmp.height};bmp.close?.();return out}catch{return null}
}

export function dataUriToBlob(uri){
  const m=/^data:([^;,]*)((?:;[^,]*)*),([\s\S]*)$/.exec(uri);
  if(!m)return null;
  const type=m[1]||'application/octet-stream',base64=/;base64/i.test(m[2]);
  try{
    if(base64){const bin=atob(m[3].replace(/\s/g,''));const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return new Blob([u8],{type})}
    return new Blob([decodeURIComponent(m[3])],{type});
  }catch{return null}
}

async function generateCover(title,themeColor){
  try{
    const W=640,H=400,c=document.createElement('canvas');c.width=W;c.height=H;
    const g=c.getContext('2d');if(!g)return null;
    const probe=document.createElement('canvas').getContext('2d');
    probe.fillStyle='#1b1b1f';if(themeColor){probe.fillStyle=themeColor}
    const bg=probe.fillStyle;
    g.fillStyle=bg;g.fillRect(0,0,W,H);
    /* Pick the text tone from the measured background, not from a guess. */
    const px=(()=>{const t=document.createElement('canvas');t.width=t.height=1;const x=t.getContext('2d',{willReadFrequently:true});x.fillStyle=bg;x.fillRect(0,0,1,1);return x.getImageData(0,0,1,1).data})();
    const lum=[px[0],px[1],px[2]].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});
    const L=.2126*lum[0]+.7152*lum[1]+.0722*lum[2];
    const ink=L>.42?'rgba(12,14,14,.92)':'rgba(244,243,239,.94)';
    g.strokeStyle=L>.42?'rgba(12,14,14,.14)':'rgba(244,243,239,.16)';
    g.lineWidth=2;g.strokeRect(21,21,W-42,H-42);
    const name=(title||'').trim()||'مشروع';
    g.fillStyle=ink;g.textAlign='center';g.textBaseline='middle';
    let size=64;g.font=`600 ${size}px ui-sans-serif, system-ui, "Segoe UI", Tahoma, sans-serif`;
    while(size>22&&g.measureText(name).width>W-120){size-=3;g.font=`600 ${size}px ui-sans-serif, system-ui, "Segoe UI", Tahoma, sans-serif`}
    let shown=name;
    while(shown.length>1&&g.measureText(shown).width>W-120)shown=shown.slice(0,-1);
    if(shown!==name)shown=shown.slice(0,-1)+'…';
    g.fillText(shown,W/2,H/2);
    return await new Promise(res=>c.toBlob(b=>res(b),'image/png'));
  }catch{return null}
}

async function analyze(files){let total=0,lines=0,chars=0,textFiles=0;const types={};for(const f of files){total+=f.size||f.blob.size;const e=ext(f.path)||'other';types[e]=(types[e]||0)+1;if(TEXT_EXT.has(e)&&f.size<8*1024*1024){try{const t=await f.blob.text();chars+=t.length;lines+=t?t.split(/\r\n|\r|\n/).length:0;textFiles++}catch{}}}return{files:files.length,size:total,lines,chars,textFiles,types}}

export async function persistVersion(files,projectId=null,sourceName='مشروع',onProgress=()=>{}){files=cleanFiles(files);if(!files.length)throw new Error('المشروع فارغ');onProgress('أحلل ملفات المشروع…');const info=await entryInfo(files),stats=await analyze(files);onProgress('أحفظ الملفات محليًا…');const manifest=[];let thumbnailHash='';for(let i=0;i<files.length;i++){const f=files[i],hash=await hashBlob(f.blob),exists=await getOne('objects',hash);if(!exists)await putOne('objects',{hash,blob:f.blob,size:f.size,type:f.type});manifest.push({path:f.path,hash,size:f.size,type:f.type});if(f.path===info.thumb)thumbnailHash=hash;if(i%8===0)onProgress(`أحفظ الملفات… ${i+1}/${files.length}`)}
/* The cover can come from inside the HTML rather than from a file beside it, so
   it is stored as an object but deliberately kept out of the manifest — it is
   metadata about the version, not a file the project can request. */
if(!thumbnailHash&&info.thumbBlob){const h=await hashBlob(info.thumbBlob);if(!await getOne('objects',h))await putOne('objects',{hash:h,blob:info.thumbBlob,size:info.thumbBlob.size,type:info.thumbBlob.type});thumbnailHash=h}let project=projectId?await getOne('projects',projectId):null;const versions=projectId?await getAll('versions','projectId',projectId):[];versions.sort((a,b)=>a.index-b.index);const id=uuid(),index=versions.length+1,createdAt=Date.now(),prev=versions.at(-1);let diff={added:manifest.length,removed:0,changed:0,linesDelta:stats.lines,sizeDelta:stats.size};if(prev){const pm=new Map(prev.manifest.map(x=>[x.path,x.hash])),nm=new Map(manifest.map(x=>[x.path,x.hash]));let added=0,removed=0,changed=0;for(const[p,h]of nm){if(!pm.has(p))added++;else if(pm.get(p)!==h)changed++}for(const p of pm.keys())if(!nm.has(p))removed++;diff={added,removed,changed,linesDelta:stats.lines-(prev.stats?.lines||0),sizeDelta:stats.size-(prev.stats?.size||0)}}const fallbackTitle=String(sourceName||'مشروع').replace(/\.(zip|html?)$/i,'').trim()||'مشروع';const version={id,projectId:project?.id||projectId||uuid(),index,createdAt,entry:info.entry,manifest,stats,diff,sourceName,title:info.title||fallbackTitle,thumbnailHash,thumbSize:info.thumbSize||null};if(!project)project={id:version.projectId,title:version.title,createdAt,updatedAt:createdAt,adoptedVersionId:id,thumbnailHash,thumbSize:info.thumbSize||null,versionCount:1};
/* An update that left adoptedVersionId pointing at the old version made the
   home card keep running yesterday's build with no visible sign of it. The
   timeline is still where you go back to an older one. */
else{project.updatedAt=createdAt;project.versionCount=index;project.adoptedVersionId=id;project.thumbnailHash=thumbnailHash;project.thumbSize=info.thumbSize||null;if(info.title)project.title=info.title}await putOne('versions',version);await putOne('projects',project);return{project,version}}
