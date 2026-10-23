/* ── worker ───────────────────────────────────────────────────────────────────
   Metadata resolver for public recitation pages. Returns descriptions and URLs,
   never proxies media bytes or bypasses protection. */

import { checkTarget, describe, fromArchiveMetadata, looksAudio } from './parse.js';

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 9000;
const UA = 'TilawatCatalogue/2.0 (+metadata reader)';
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':status===200?'public, max-age=3600':'no-store', ...extra } });
const fail = (reason, status = 400) => json({ ok:false, reason }, status);

async function readPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal:controller.signal, redirect:'follow', headers:{'user-agent':UA,accept:'text/html,application/xhtml+xml,application/json'} });
    if (!res.ok) return { error:`المصدر ردّ بـ ${res.status}` };
    const type = res.headers.get('content-type') || '';
    if (/^audio\//i.test(type)) return { direct:{ url:res.url, type, size:Number(res.headers.get('content-length'))||0 } };
    if (!/html|json|xml|text/i.test(type)) return { error:'نوع محتوى غير مدعوم: '+type };
    const reader = res.body.getReader(); const chunks=[]; let total=0;
    while (total < MAX_BYTES) { const {done,value}=await reader.read(); if(done) break; total+=value.length; chunks.push(value); }
    try { await reader.cancel(); } catch {}
    const buffer=new Uint8Array(total); let offset=0;
    for (const chunk of chunks) { buffer.set(chunk.subarray(0,Math.min(chunk.length,total-offset)),offset); offset+=chunk.length; }
    return { html:new TextDecoder('utf-8').decode(buffer), finalUrl:res.url };
  } catch (err) { return { error:err.name==='AbortError'?'انتهت المهلة':'تعذّر الوصول' }; }
  finally { clearTimeout(timer); }
}

async function resolve(request) {
  const target=new URL(request.url).searchParams.get('url'); const check=checkTarget(target); if(!check.ok)return fail(check.reason);
  if(looksAudio(check.url.href)) return json({ok:true,kind:'audio',audio:[{url:check.url.href,from:'direct'}],title:'',thumbnail:''});
  const page=await readPage(check.url.href); if(page.error)return fail(page.error,502);
  if(page.direct)return json({ok:true,kind:'audio',audio:[{url:page.direct.url,from:'direct',fileSize:page.direct.size}]});
  return json({ok:true,kind:'page',...describe(page.html,page.finalUrl||check.url.href)});
}
async function archive(request) {
  const id=new URL(request.url).searchParams.get('id'); if(!id||!/^[\w.\-]{1,120}$/.test(id))return fail('معرّف أرشيف غير صالح');
  const page=await readPage(`https://archive.org/metadata/${encodeURIComponent(id)}`); if(page.error)return fail(page.error,502);
  let data; try{data=JSON.parse(page.html)}catch{return fail('ردّ غير مفهوم من الأرشيف',502)}
  if(!data||!data.files)return fail('لا ملفات في هذا العنصر',404);
  return json({ok:true,title:(data.metadata&&data.metadata.title)||'',creator:(data.metadata&&data.metadata.creator)||'',date:(data.metadata&&data.metadata.date)||'',files:fromArchiveMetadata(data)});
}
async function wayback(request) {
  const target=new URL(request.url).searchParams.get('url'); const check=checkTarget(target); if(!check.ok)return fail(check.reason);
  const page=await readPage(`https://archive.org/wayback/available?url=${encodeURIComponent(check.url.href)}`); if(page.error)return fail(page.error,502);
  let data; try{data=JSON.parse(page.html)}catch{return fail('ردّ غير مفهوم',502)}
  const snap=data&&data.archived_snapshots&&data.archived_snapshots.closest;
  return json({ok:true,found:!!(snap&&snap.available),snapshot:snap?snap.url:'',when:snap?snap.timestamp:''});
}
const OEMBED={'youtube.com':'https://www.youtube.com/oembed?format=json&url=','youtu.be':'https://www.youtube.com/oembed?format=json&url=','soundcloud.com':'https://soundcloud.com/oembed?format=json&url=','vimeo.com':'https://vimeo.com/api/oembed.json?url=','dailymotion.com':'https://www.dailymotion.com/services/oembed?url=','tiktok.com':'https://www.tiktok.com/oembed?url='};
async function oembed(request){const target=new URL(request.url).searchParams.get('url');const check=checkTarget(target);if(!check.ok)return fail(check.reason);const host=check.url.hostname.replace(/^www\./,'');const endpoint=OEMBED[host]||OEMBED[host.split('.').slice(-2).join('.')];if(!endpoint)return fail('لا يوفّر هذا الموقع oEmbed',404);const page=await readPage(endpoint+encodeURIComponent(check.url.href));if(page.error)return fail(page.error,502);try{return json({ok:true,...JSON.parse(page.html)})}catch{return fail('ردّ غير مفهوم',502)}}

export default { async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400'}});
  if(request.method!=='GET')return fail('GET فقط',405);
  const {pathname}=new URL(request.url);
  try{
    if(pathname==='/api/resolve')return await resolve(request);
    if(pathname==='/api/archive')return await archive(request);
    if(pathname==='/api/wayback')return await wayback(request);
    if(pathname==='/api/oembed')return await oembed(request);
    if(pathname==='/api/health')return json({ok:true,service:'tilawat-catalog',d1:!!env.DB});
    return fail('مسار غير معروف',404);
  }catch{return fail('خطأ داخلي',500)}
}};
