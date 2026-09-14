const worker = (await import('./src/index.js')).default;
let fail = 0;
const is = (c, g, b) => { if (c) console.log('  ok  ' + g); else { fail++; console.log('  XX  ' + b); } };
const call = async (path) => {
  const res = await worker.fetch(new Request('https://w.example' + path), {});
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, cors: res.headers.get('access-control-allow-origin'), body };
};

console.log('\nrouting and CORS');
let r = await call('/api/health');
is(r.status === 200 && r.body.ok, 'health: ' + JSON.stringify(r.body), 'health=' + JSON.stringify(r));
is(r.cors === '*', 'CORS header present', 'no CORS header');
r = await call('/api/nope');
is(r.status === 404, 'unknown path → 404', 'status=' + r.status);
const opt = await worker.fetch(new Request('https://w.example/api/resolve', { method: 'OPTIONS' }), {});
is(opt.headers.get('access-control-allow-methods').includes('GET'), 'preflight answered', 'no preflight');
const post = await worker.fetch(new Request('https://w.example/api/resolve', { method: 'POST' }), {});
is(post.status === 405, 'POST refused', 'POST status=' + post.status);

console.log('\nthe guard holds at the route level too');
for (const bad of ['http://127.0.0.1:8099/tilawat/', 'http://169.254.169.254/latest/meta-data/',
                   'file:///etc/passwd', 'http://localhost/']) {
  const g = await call('/api/resolve?url=' + encodeURIComponent(bad));
  is(g.status === 400 && g.body.ok === false, `refused ${bad} → ${g.body && g.body.reason}`, `ALLOWED ${bad} (${g.status})`);
}
const noUrl = await call('/api/resolve');
is(noUrl.status === 400, 'missing url → 400', 'status=' + noUrl.status);
const badId = await call('/api/archive?id=../../etc/passwd');
is(badId.status === 400, 'archive id is validated', 'status=' + badId.status);

console.log('\na direct file link needs no fetching');
r = await call('/api/resolve?url=' + encodeURIComponent('https://server8.mp3quran.net/afs/001.mp3'));
is(r.status === 200 && r.body.kind === 'audio' && r.body.audio[0].url.endsWith('001.mp3'),
   'recognised as audio without a round trip', JSON.stringify(r.body).slice(0, 160));

console.log('\nreading a real public page');
r = await call('/api/resolve?url=' + encodeURIComponent('https://archive.org/details/em6u33lrnuzn5qkps0lv8i6cnesevumz31ffwxqt'));
if (r.status === 200) {
  is(!!r.body.title, 'title read: ' + String(r.body.title).slice(0, 60), 'no title');
  is(typeof r.body.audio === 'object', `audio links found: ${(r.body.audio || []).length}`, 'no audio array');
  is('claims' in r.body && 'years' in r.body, 'prose claims extracted', 'no claims');
} else {
  console.log('  --  live page unreachable from here (' + (r.body && r.body.reason) + ') — skipped');
}

console.log('\narchive.org listing');
r = await call('/api/archive?id=em6u33lrnuzn5qkps0lv8i6cnesevumz31ffwxqt');
if (r.status === 200) {
  is(Array.isArray(r.body.files), `${r.body.files.length} audio files, title: ${String(r.body.title).slice(0, 40)}`, 'no files array');
  if (r.body.files[0]) is(/^https:\/\//.test(r.body.files[0].url), 'playable url: ' + r.body.files[0].url.slice(0, 70), 'bad url');
} else {
  console.log('  --  archive unreachable (' + (r.body && r.body.reason) + ') — skipped');
}

console.log('\nwayback lookup');
r = await call('/api/wayback?url=' + encodeURIComponent('http://www.mazameer.com/'));
if (r.status === 200) is(typeof r.body.found === 'boolean', `answered: found=${r.body.found} ${String(r.body.snapshot).slice(0, 60)}`, 'bad shape');
else console.log('  --  wayback unreachable (' + (r.body && r.body.reason) + ') — skipped');

console.log('\noembed');
r = await call('/api/oembed?url=' + encodeURIComponent('https://youtu.be/dQw4w9WgXcQ'));
if (r.status === 200) is(!!r.body.title, 'youtube oembed: ' + String(r.body.title).slice(0, 50), 'no title');
else console.log('  --  oembed unreachable (' + (r.body && r.body.reason) + ') — skipped');
r = await call('/api/oembed?url=' + encodeURIComponent('https://example.com/x'));
is(r.status === 404, 'a site without oEmbed is refused cleanly', 'status=' + r.status);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'WORKER CHECKS PASSED'));
process.exit(fail ? 1 : 0);
