const ALLOWED_AUDIO_HOSTS = new Set([
  'tilawatalharamain1.com','www.tilawatalharamain1.com',
  'yaldosry.com','www.yaldosry.com'
]);
const FETCH_TIMEOUT_MS = 15_000;

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function allowedFinalUrl(response,fallback){
  try{
    const finalUrl=new URL(response.url||fallback);
    return finalUrl.protocol==='https:'&&ALLOWED_AUDIO_HOSTS.has(finalUrl.hostname);
  }catch{return false}
}
function audioLikeContentType(value=''){
  if(!value)return true;
  const type=value.split(';',1)[0].trim().toLowerCase();
  return type.startsWith('audio/')||type==='application/octet-stream'||type==='binary/octet-stream';
}
async function timedFetch(input,options={},timeoutMs=FETCH_TIMEOUT_MS){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(input,{...options,signal:controller.signal})}
  finally{clearTimeout(timer)}
}
function isAbort(error){return error?.name==='AbortError'}

export async function onRequestGet({request}){
  let src;
  try{src=new URL(new URL(request.url).searchParams.get('src')||'')}catch{return json({ok:false,error:'invalid-src'},400)}
  if(src.protocol!=='https:'||!ALLOWED_AUDIO_HOSTS.has(src.hostname)) return json({ok:false,error:'unsupported-audio-host'},400);

  const headers=new Headers();
  const range=request.headers.get('range');
  if(range)headers.set('range',range);
  headers.set('accept','audio/*,*/*;q=0.8');
  headers.set('user-agent','Tilawat/1.0 audio proxy');
  headers.set('referer','https://yaldosry.com/');

  let upstream;
  try{upstream=await timedFetch(src.href,{redirect:'follow',headers})}
  catch(error){return json({ok:false,error:isAbort(error)?'audio-timeout':'audio-fetch-failed'},isAbort(error)?504:502)}
  if(!allowedFinalUrl(upstream,src.href)) return json({ok:false,error:'unsupported-audio-redirect-host'},502);
  if(!upstream.ok) return json({ok:false,error:'audio-http-'+upstream.status},502);
  const upstreamType=upstream.headers.get('content-type')||'';
  if(!audioLikeContentType(upstreamType)) return json({ok:false,error:'invalid-audio-content-type'},502);

  const out=new Headers();
  for(const name of ['content-type','content-length','content-range','accept-ranges','etag','last-modified']){
    const value=upstream.headers.get(name);if(value)out.set(name,value);
  }
  if(!out.has('content-type'))out.set('content-type','audio/mpeg');
  out.set('cache-control',range?'public, max-age=3600':'public, max-age=21600');
  out.set('access-control-allow-origin','*');
  out.set('cross-origin-resource-policy','cross-origin');
  return new Response(upstream.body,{status:upstream.status,headers:out});
}
