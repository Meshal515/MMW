const ALLOWED_PAGE_HOSTS = new Set(['yaldosry.com','www.yaldosry.com']);
const AUDIO_EXT = /\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(?:[?#]|$)/i;

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function decodeEntities(s=''){
  return s.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
}
function stripTags(s=''){
  return decodeEntities(s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
}
function firstMatch(html, patterns){
  for(const re of patterns){
    const m=html.match(re);
    if(m?.[1]) return decodeEntities(m[1].trim());
  }
  return '';
}
function safeAbsolute(candidate,base){
  try{
    const u=new URL(candidate,base);
    if(!/^https?:$/.test(u.protocol)||!AUDIO_EXT.test(u.href)) return '';
    return u.href;
  }catch{return ''}
}

export async function onRequestGet({request}){
  let page;
  try{
    const q=new URL(request.url).searchParams.get('url')||'';
    page=new URL(q);
  }catch{return json({ok:false,error:'invalid-url'},400)}
  if(page.protocol!=='https:'||!ALLOWED_PAGE_HOSTS.has(page.hostname)) return json({ok:false,error:'unsupported-host'},400);

  let upstream;
  try{
    upstream=await fetch(page.href,{redirect:'follow',headers:{'accept':'text/html,application/xhtml+xml','user-agent':'Tilawat/1.0 source resolver'}});
  }catch{return json({ok:false,error:'source-fetch-failed'},502)}
  if(!upstream.ok) return json({ok:false,error:'source-http-'+upstream.status},502);
  const type=upstream.headers.get('content-type')||'';
  if(!type.includes('text/html')) return json({ok:false,error:'not-html'},422);
  const html=await upstream.text();
  if(html.length>2_000_000) return json({ok:false,error:'page-too-large'},413);

  const candidate=firstMatch(html,[
    /<audio\b[^>]*\bsrc=["']([^"']+)["']/i,
    /<source\b[^>]*\bsrc=["']([^"']+\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)[^"']*)["']/i,
    /href=["']([^"']+\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)[^"']*)["'][^>]*>[^<]*(?:MP3|تحميل)/i,
    /(https?:\/\/[^\s"'<>]+\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(?:\?[^\s"'<>]*)?)/i
  ]);
  const directAudioUrl=safeAbsolute(candidate,page.href);
  if(!directAudioUrl) return json({ok:false,error:'audio-not-found'},404);

  const h1=firstMatch(html,[/<h1\b[^>]*>([\s\S]*?)<\/h1>/i]);
  const title=h1?stripTags(h1):stripTags(firstMatch(html,[/<title\b[^>]*>([\s\S]*?)<\/title>/i]));
  const audioUrl=`/api/yaldosry-audio?src=${encodeURIComponent(directAudioUrl)}`;
  return json({ok:true,provider:'yaldosry',title,directAudioUrl,audioUrl,sourceUrl:page.href});
}
