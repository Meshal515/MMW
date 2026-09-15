const ALLOWED_PAGE_HOSTS = new Set(['yaldosry.com','www.yaldosry.com']);
const ALLOWED_AUDIO_HOSTS = new Set([
  'tilawatalharamain1.com','www.tilawatalharamain1.com',
  'yaldosry.com','www.yaldosry.com'
]);
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
function collectMatches(html,patterns,limit=24){
  const out=[];
  const seen=new Set();
  for(const pattern of patterns){
    const flags=pattern.flags.includes('g')?pattern.flags:`${pattern.flags}g`;
    const re=new RegExp(pattern.source,flags);
    let match;
    while((match=re.exec(html))){
      const value=decodeEntities((match[1]||'').trim());
      if(value&&!seen.has(value)){
        seen.add(value);
        out.push(value);
        if(out.length>=limit)return out;
      }
      if(match[0]==='')re.lastIndex++;
    }
  }
  return out;
}
function safeAbsolute(candidate,base){
  try{
    const u=new URL(candidate,base);
    if(!/^https?:$/.test(u.protocol)||!AUDIO_EXT.test(u.href)||!ALLOWED_AUDIO_HOSTS.has(u.hostname)) return '';
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
  const size=Number(upstream.headers.get('content-length')||0);
  if(size>2_000_000) return json({ok:false,error:'page-too-large'},413);
  const html=await upstream.text();
  if(html.length>2_000_000) return json({ok:false,error:'page-too-large'},413);

  const candidates=collectMatches(html,[
    /<audio\b[^>]*\bsrc=["']([^"']+)["']/i,
    /<source\b[^>]*\bsrc=["']([^"']+\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)[^"']*)["']/i,
    /href=["']([^"']+\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)[^"']*)["'][^>]*>[^<]*(?:MP3|تحميل)/i,
    /(https?:\/\/[^\s"'<>]+\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(?:\?[^\s"'<>]*)?)/i
  ]);
  const directAudioUrl=candidates.map(candidate=>safeAbsolute(candidate,page.href)).find(Boolean)||'';
  if(!directAudioUrl) return json({ok:false,error:'audio-not-found'},404);

  const h1=firstMatch(html,[/<h1\b[^>]*>([\s\S]*?)<\/h1>/i]);
  const title=h1?stripTags(h1):stripTags(firstMatch(html,[/<title\b[^>]*>([\s\S]*?)<\/title>/i]));
  const audioUrl=`/api/yaldosry-audio?src=${encodeURIComponent(directAudioUrl)}`;
  return json({ok:true,provider:'yaldosry',title,directAudioUrl,audioUrl,sourceUrl:page.href});
}
