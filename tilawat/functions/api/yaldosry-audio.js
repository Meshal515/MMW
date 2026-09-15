const ALLOWED_AUDIO_HOSTS = new Set([
  'tilawatalharamain1.com','www.tilawatalharamain1.com',
  'yaldosry.com','www.yaldosry.com'
]);

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

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
  try{upstream=await fetch(src.href,{redirect:'follow',headers})}catch{return json({ok:false,error:'audio-fetch-failed'},502)}
  if(!upstream.ok&&upstream.status!==206) return json({ok:false,error:'audio-http-'+upstream.status},502);

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
