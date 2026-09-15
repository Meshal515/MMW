import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as resolveSource } from '../functions/api/resolve-source.js';
import { onRequestGet as proxyAudio } from '../functions/api/yaldosry-audio.js';

const withFetch=async(fake,fn)=>{
  const original=globalThis.fetch;
  globalThis.fetch=fake;
  try{return await fn()}finally{globalThis.fetch=original}
};
const responseWithUrl=(body,init,url)=>{
  const response=new Response(body,init);
  Object.defineProperty(response,'url',{value:url,configurable:true});
  return response;
};
const abortError=()=>Object.assign(new Error('aborted'),{name:'AbortError'});

test('resolver rejects unsupported page hosts before fetching',async()=>{
  let called=false;
  await withFetch(async()=>{called=true;throw new Error('must not fetch')},async()=>{
    const request=new Request('https://tilawat.test/api/resolve-source?url='+encodeURIComponent('https://example.com/page'));
    const response=await resolveSource({request});
    const body=await response.json();
    assert.equal(response.status,400);
    assert.equal(body.error,'unsupported-host');
    assert.equal(called,false);
  });
});

test('resolver skips an unproxyable audio host and uses the next supported candidate',async()=>{
  const html=`<!doctype html><title>اختبار</title>
    <audio src="https://cdn.example.com/dead.mp3"></audio>
    <a href="https://tilawatalharamain1.com/audio/good.mp3">MP3</a>`;
  await withFetch(async()=>new Response(html,{status:200,headers:{'content-type':'text/html; charset=utf-8'}}),async()=>{
    const source='https://yaldosry.com/taraweeh/2841';
    const request=new Request('https://tilawat.test/api/resolve-source?url='+encodeURIComponent(source));
    const response=await resolveSource({request});
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.ok,true);
    assert.equal(body.directAudioUrl,'https://tilawatalharamain1.com/audio/good.mp3');
    assert.match(body.audioUrl,/^\/api\/yaldosry-audio\?src=/);
  });
});

test('resolver rejects oversized HTML before reading the body when content-length is known',async()=>{
  await withFetch(async()=>new Response('<html></html>',{status:200,headers:{'content-type':'text/html','content-length':'2000001'}}),async()=>{
    const request=new Request('https://tilawat.test/api/resolve-source?url='+encodeURIComponent('https://yaldosry.com/taraweeh/2841'));
    const response=await resolveSource({request});
    const body=await response.json();
    assert.equal(response.status,413);
    assert.equal(body.error,'page-too-large');
  });
});

test('resolver rejects a redirect that leaves the page allowlist',async()=>{
  await withFetch(async()=>responseWithUrl('<html><audio src="https://yaldosry.com/good.mp3"></audio></html>',{status:200,headers:{'content-type':'text/html'}},'https://example.com/redirected'),async()=>{
    const request=new Request('https://tilawat.test/api/resolve-source?url='+encodeURIComponent('https://yaldosry.com/taraweeh/2841'));
    const response=await resolveSource({request});
    const body=await response.json();
    assert.equal(response.status,502);
    assert.equal(body.error,'unsupported-redirect-host');
  });
});

test('resolver reports upstream aborts as timeouts',async()=>{
  await withFetch(async(_url,options={})=>{
    assert.ok(options.signal instanceof AbortSignal);
    throw abortError();
  },async()=>{
    const request=new Request('https://tilawat.test/api/resolve-source?url='+encodeURIComponent('https://yaldosry.com/taraweeh/2841'));
    const response=await resolveSource({request});
    const body=await response.json();
    assert.equal(response.status,504);
    assert.equal(body.error,'source-timeout');
  });
});

test('audio proxy forwards byte ranges and preserves range response headers',async()=>{
  await withFetch(async(url,options={})=>{
    assert.equal(String(url),'https://tilawatalharamain1.com/audio/good.mp3');
    assert.equal(options.headers.get('range'),'bytes=0-1023');
    assert.equal(options.headers.get('referer'),'https://yaldosry.com/');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(new Uint8Array([1,2,3,4]),{
      status:206,
      headers:{
        'content-type':'audio/mpeg',
        'content-range':'bytes 0-3/4000',
        'accept-ranges':'bytes',
        'content-length':'4'
      }
    });
  },async()=>{
    const target='https://tilawatalharamain1.com/audio/good.mp3';
    const request=new Request('https://tilawat.test/api/yaldosry-audio?src='+encodeURIComponent(target),{headers:{range:'bytes=0-1023'}});
    const response=await proxyAudio({request});
    assert.equal(response.status,206);
    assert.equal(response.headers.get('content-range'),'bytes 0-3/4000');
    assert.equal(response.headers.get('accept-ranges'),'bytes');
    assert.equal(response.headers.get('access-control-allow-origin'),'*');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3,4]);
  });
});

test('audio proxy rejects unsupported audio hosts before fetching',async()=>{
  let called=false;
  await withFetch(async()=>{called=true;throw new Error('must not fetch')},async()=>{
    const request=new Request('https://tilawat.test/api/yaldosry-audio?src='+encodeURIComponent('https://example.com/not-allowed.mp3'));
    const response=await proxyAudio({request});
    const body=await response.json();
    assert.equal(response.status,400);
    assert.equal(body.error,'unsupported-audio-host');
    assert.equal(called,false);
  });
});

test('audio proxy rejects a redirect that leaves the audio allowlist',async()=>{
  await withFetch(async()=>responseWithUrl(new Uint8Array([1,2]),{status:200,headers:{'content-type':'audio/mpeg'}},'https://cdn.example.com/escaped.mp3'),async()=>{
    const target='https://tilawatalharamain1.com/audio/good.mp3';
    const request=new Request('https://tilawat.test/api/yaldosry-audio?src='+encodeURIComponent(target));
    const response=await proxyAudio({request});
    const body=await response.json();
    assert.equal(response.status,502);
    assert.equal(body.error,'unsupported-audio-redirect-host');
  });
});

test('audio proxy rejects explicit non-audio content types',async()=>{
  await withFetch(async()=>new Response('<html>not audio</html>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}}),async()=>{
    const target='https://tilawatalharamain1.com/audio/good.mp3';
    const request=new Request('https://tilawat.test/api/yaldosry-audio?src='+encodeURIComponent(target));
    const response=await proxyAudio({request});
    const body=await response.json();
    assert.equal(response.status,502);
    assert.equal(body.error,'invalid-audio-content-type');
  });
});

test('audio proxy reports upstream aborts as timeouts',async()=>{
  await withFetch(async(_url,options={})=>{
    assert.ok(options.signal instanceof AbortSignal);
    throw abortError();
  },async()=>{
    const target='https://tilawatalharamain1.com/audio/good.mp3';
    const request=new Request('https://tilawat.test/api/yaldosry-audio?src='+encodeURIComponent(target));
    const response=await proxyAudio({request});
    const body=await response.json();
    assert.equal(response.status,504);
    assert.equal(body.error,'audio-timeout');
  });
});
