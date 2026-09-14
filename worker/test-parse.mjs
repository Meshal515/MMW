const { checkTarget, describe, readClaims, parseIsoDuration, fromArchiveMetadata, looksAudio, audioLinks }
  = await import('./src/parse.js');
let fail = 0;
const is = (c, g, b) => { if (c) console.log('  ok  ' + g); else { fail++; console.log('  XX  ' + b); } };

console.log('\nSSRF guard — these must all be refused');
for (const bad of ['http://localhost/x', 'http://127.0.0.1:8099/', 'http://169.254.169.254/latest/meta-data/',
  'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.16.4.4/', 'http://[::1]/',
  'file:///etc/passwd', 'gopher://x/', 'http://metadata.google.internal/', 'http://box.local/',
  'http://0.0.0.0/', 'http://example.com:22/', 'http://100.64.0.1/']) {
  const r = checkTarget(bad);
  is(!r.ok, `refused ${bad}  (${r.reason})`, `ALLOWED ${bad}`);
}
console.log('\n…and these must be allowed');
for (const good of ['https://archive.org/details/x', 'http://mazameer.com/vb/t123.html',
  'https://www.yaldosry.com/audio/1.mp3', 'https://example.com:8080/p']) {
  is(checkTarget(good).ok, `allowed ${good}`, `REFUSED ${good}`);
}

console.log('\nreading a forum post');
const post = `<html><head><title>سورة الكهف - ياسر الدوسري - تراويح 1425هـ</title>
<meta property="og:title" content="سورة الكهف — ياسر الدوسري"/>
<meta property="og:image" content="/img/cover.jpg"/>
<meta property="og:site_name" content="مزامير آل داود"/>
<script type="application/ld+json">{"@type":"AudioObject","name":"سورة الكهف","duration":"PT1H12M30S","contentUrl":"/files/kahf.mp3"}</script>
</head><body>
<p>هذه نسخة منقحة من الشريط الأصلي، السورة كاملة، من مسجد الملك خالد، تسجيل عام 1425هـ</p>
<a href="/files/kahf-320.mp3">تحميل بجودة عالية</a>
<a href="/files/notes.pdf">ملاحظات</a>
</body></html>`;
const d = describe(post, 'https://mazameer.com/vb/t1.html');
is(d.title === 'سورة الكهف — ياسر الدوسري', 'title: ' + d.title, 'title=' + d.title);
is(d.thumbnail === 'https://mazameer.com/img/cover.jpg', 'thumbnail made absolute', 'thumb=' + d.thumbnail);
is(d.siteName === 'مزامير آل داود', 'site: ' + d.siteName, 'site=' + d.siteName);
is(d.duration === 4350, 'duration from JSON-LD: ' + d.duration + 's', 'duration=' + d.duration);
is(d.audio.length === 2, `found ${d.audio.length} audio links (pdf ignored)`, 'audio=' + JSON.stringify(d.audio));
is(d.audio[0].url.endsWith('kahf.mp3'), 'json-ld audio ranked first', 'first=' + d.audio[0].url);
is(d.years.includes(1425), 'year read from the prose: ' + d.years, 'years=' + d.years);
is(d.claims.original && d.claims.refined && d.claims.complete, 'claims: ' + Object.keys(d.claims).join(','), 'claims=' + JSON.stringify(d.claims));
is(d.mosque.includes('مسجد'), 'mosque: ' + d.mosque, 'mosque=' + d.mosque);

console.log('\nedge cases');
is(parseIsoDuration('PT45M') === 2700, 'PT45M → 2700', 'got ' + parseIsoDuration('PT45M'));
is(parseIsoDuration('garbage') === 0, 'garbage duration → 0', 'got ' + parseIsoDuration('garbage'));
is(jsonSafe(), 'a malformed JSON-LD block does not kill the page', 'malformed ld threw');
function jsonSafe() {
  try {
    const r = describe('<script type="application/ld+json">{oops</script><title>ok</title>', 'https://x.com/');
    return r.title === 'ok';
  } catch { return false; }
}
is(!looksAudio('https://x.com/page.html') && looksAudio('https://x.com/a.MP3?t=1'), 'audio detection by extension', 'extension test failed');
is(audioLinks('<a href="javascript:alert(1)">x</a><a href="/a.mp3">y</a>', 'https://x.com/').length === 1,
   'javascript: hrefs are not audio', 'javascript href slipped through');

console.log('\narchive.org listing');
const files = fromArchiveMetadata({ server: 'ia800.us.archive.org', dir: '/20/items/kahf',
  files: [{ name: 'kahf.mp3', format: 'VBR MP3', bitrate: '128', length: '4350.2', size: '69000000' },
          { name: 'cover.jpg', format: 'JPEG' }] });
is(files.length === 1, 'only audio files returned', 'files=' + files.length);
is(files[0].url.startsWith('https://ia800.us.archive.org/20/items/kahf/'), 'url built: ' + files[0].url, 'url=' + files[0].url);
is(files[0].duration === 4350 && files[0].bitrate === 128, 'length and bitrate parsed', JSON.stringify(files[0]));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'PARSER CHECKS PASSED'));
process.exit(fail ? 1 : 0);
