const MAX_BYTES=2_000_000;
const TIMEOUT_MS=9000;
const AUDIO_EXT=/\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(?:[?#]|$)/i;
const PRIVATE_V4=[/^0\./,/^10\./,/^127\./,/^169\.254\./,/^192\.168\./,/^172\.(?:1[6-9]|2\d|3[01])\./,/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,/^198\.1[89]\./,/^192\.0\.0\./,/^192\.0\.2\./,/^198\.51\.100\./,/^203\.0\.113\./,/^22[4-9]\./,/^2[3-5]\d\./];

const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':status===200?'public, max-age=900':'no-store','x-content-type-options':'nosniff'}});
const fail=(reason,status=400)=>json({ok:false,reason},status);

function checkTarget(raw){
  let url;try{url=new URL(String(raw||''))}catch{return{ok:false,reason:'رابط غير صالح'}}
  if(!['http:','https:'].includes(url.protocol))return{ok:false,reason:'بروتوكول غير مسموح'};
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.internal')||host.endsWith('.local')||host==='metadata.google.internal')return{ok:false,reason:'مضيف داخلي'};
  if(/^\[?::1\]?$/.test(host)||/^\[?f[cd][0-9a-f]{2}:/i.test(host)||/^\[?fe80:/i.test(host))return{ok:false,reason:'عنوان داخلي'};
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)&&PRIVATE_V4.some(re=>re.test(host)))return{ok:false,reason:'عنوان داخلي'};
  if(url.port&&!['','80','443','8080','8443'].includes(url.port))return{ok:false,reason:'منفذ غير مسموح'};
  return{ok:true,url};
}
function decode(value=''){return String(value).replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,'&').trim()}
function absolute(value,base){try{return new URL(decode(value),base).href}catch{return''}}
function audioLinks(html,base){
  const found=new Map();
  const add=(href,from)=>{const url=absolute(href,base);if(url&&AUDIO_EXT.test(url)&&!found.has(url))found.set(url,{url,from})};
  for(const match of html.matchAll(/<audio[^>]+src\s*=\s*["']([^"']+)["']/gi))add(match[1],'audio');
  for(const match of html.matchAll(/<source[^>]+src\s*=\s*["']([^"']+)["']/gi))add(match[1],'source');
  for(const match of html.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["']/gi))add(match[1],'link');
  for(const match of html.matchAll(/<meta[^>]+(?:property|name)\s*=\s*["'](?:og:audio|twitter:player:stream)["'][^>]+content\s*=\s*["']([^"']+)["']/gi))add(match[1],'meta');
  for(const match of html.matchAll(/["']contentUrl["']\s*:\s*["']([^"']+)["']/gi))add(match[1],'json-ld');
  return[...found.values()];
}
function meta(html,name){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const a=new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]+content\\s*=\\s*["']([^"']*)["']`,'i').exec(html);
  if(a?.[1])return decode(a[1]);
  const b=new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]+(?:property|name)\\s*=\\s*["']${escaped}["']`,'i').exec(html);
  return decode(b?.[1]||'');
}
async function readLimited(response){
  if(!response.body)return'';
  const reader=response.body.getReader(),chunks=[];let total=0;
  while(total<MAX_BYTES){const{done,value}=await reader.read();if(done)break;const take=value.subarray(0,Math.min(value.length,MAX_BYTES-total));chunks.push(take);total+=take.length;if(take.length<value.length)break}
  try{await reader.cancel()}catch{}
  const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length}
  return new TextDecoder().decode(out);
}

export async function onRequestGet({request}){
  const target=new URL(request.url).searchParams.get('url');
  const checked=checkTarget(target);if(!checked.ok)return fail(checked.reason);
  if(AUDIO_EXT.test(checked.url.href))return json({ok:true,kind:'audio',title:'',thumbnail:'',audio:[{url:checked.url.href,from:'direct'}]});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const response=await fetch(checked.url.href,{signal:controller.signal,redirect:'follow',headers:{'user-agent':'Tilawat/16 (+public audio metadata resolver)','accept':'text/html,application/xhtml+xml,application/json,audio/*;q=.8'}});
    if(!response.ok)return fail(`المصدر ردّ بـ ${response.status}`,502);
    const type=response.headers.get('content-type')||'';
    if(/^audio\//i.test(type))return json({ok:true,kind:'audio',title:'',thumbnail:'',audio:[{url:response.url,from:'direct'}]});
    if(!/html|json|xml|text/i.test(type))return fail('نوع محتوى غير مدعوم',415);
    const html=await readLimited(response),base=response.url||checked.url.href;
    const title=meta(html,'og:title')||decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
    const thumbnail=absolute(meta(html,'og:image')||meta(html,'twitter:image'),base);
    const audio=audioLinks(html,base);
    return json({ok:true,kind:'page',title,thumbnail,audio});
  }catch(error){return fail(error?.name==='AbortError'?'انتهت مهلة المصدر':'تعذر الوصول إلى المصدر',502)}
  finally{clearTimeout(timer)}
}
