export const SURAHS = ['الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس','هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس'];

export const SOURCE_REGISTRY = {
  mp3quran: { label:'MP3Quran', kind:'catalog', trusted:true },
  quranicaudio: { label:'QuranicAudio', kind:'catalog', trusted:true },
  islamway: { label:'طريق الإسلام', kind:'catalog', trusted:true },
  tvquran: { label:'TVQuran', kind:'catalog', trusted:true },
  assabile: { label:'السبيل', kind:'catalog', trusted:true },
  everyayah: { label:'EveryAyah', kind:'catalog', trusted:true },
  surahquran: { label:'SurahQuran', kind:'catalog', trusted:true },
  qurancom: { label:'Quran.com', kind:'catalog', trusted:true },
  archive: { label:'Internet Archive', kind:'treasure', trusted:true },
  mazameer: { label:'مزامير آل داود', kind:'treasure', trusted:false },
  yaldosry: { label:'موقع ياسر الدوسري', kind:'treasure', trusted:false },
  soundcloud: { label:'SoundCloud', kind:'social', trusted:false },
  youtube: { label:'YouTube', kind:'visual', trusted:false },
  telegram: { label:'Telegram', kind:'social', trusted:false },
  tiktok: { label:'TikTok', kind:'visual', trusted:false },
  instagram: { label:'Instagram', kind:'visual', trusted:false },
  generic: { label:'مصدر خارجي', kind:'generic', trusted:false },
  local: { label:'على الجهاز', kind:'local', trusted:true }
};

export function normalizeArabic(value='') {
  return String(value).toLowerCase().normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,'')
    .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
    .replace(/ة/g,'ه').replace(/ـ/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
export const tokens = q => normalizeArabic(q).split(/\s+/).filter(Boolean);
export function matches(rec, q) {
  const ts = Array.isArray(q) ? q : tokens(q);
  if (!ts.length) return true;
  const hay = normalizeArabic([
    rec.title, rec.reciter, rec.surah, rec.year, rec.collection, rec.mosque, rec.occasion,
    ...(rec.tags||[]), ...(rec.variants||[]).flatMap(v => [v.provider,v.title,v.qualityLabel,v.sourceUrl])
  ].filter(Boolean).join(' '));
  return ts.every(t => hay.includes(t));
}

export function youtubeId(input='') {
  const text = String(input).trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let u; try { u = new URL(/^https?:\/\//i.test(text)?text:'https://'+text); } catch { return ''; }
  const h=u.hostname.replace(/^www\.|^m\./,'');
  let id='';
  if(h==='youtu.be') id=u.pathname.split('/')[1]||'';
  else if(h.endsWith('youtube.com')||h.endsWith('youtube-nocookie.com')) {
    id=u.searchParams.get('v')||'';
    if(!id){ const m=u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/); if(m) id=m[1]; }
  }
  return /^[\w-]{11}$/.test(id)?id:'';
}
export const youtubeThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const youtubeWatch = id => `https://www.youtube.com/watch?v=${id}`;
export async function youtubeMeta(id) {
  try {
    const r=await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubeWatch(id))}`);
    if(!r.ok) return null;
    const d=await r.json(); return {title:d.title||'', author:d.author_name||'', thumbnail:d.thumbnail_url||youtubeThumb(id)};
  } catch { return null; }
}

export function detectSource(url='') {
  const s=String(url).trim(); const yt=youtubeId(s);
  if(yt){
    const watch=youtubeWatch(yt);
    // Keep YouTube metadata/reference, but route PLAY through our own <audio> attempt
    // instead of navigating the user away from Tilawat. Browsers will reject the
    // HTML watch page as audio; attaching a direct/local audio source upgrades it.
    return {type:'video',provider:'youtube',sourceUrl:watch,audioUrl:watch,videoUrl:watch,embedUrl:`https://www.youtube-nocookie.com/embed/${yt}`,thumbnail:youtubeThumb(yt),downloadable:false,playbackCandidate:true};
  }
  let u; try{u=new URL(/^https?:\/\//i.test(s)?s:'https://'+s);}catch{return null;}
  if(!/^https?:$/.test(u.protocol)) return null;
  const host=u.hostname.replace(/^www\./,'');
  const explicitAudio=/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(\?|#|$)/i.test(u.href);
  const provider=host.includes('archive.org')?'archive':host.includes('soundcloud.com')?'soundcloud':host.includes('islamway.net')?'islamway':host.includes('quranicaudio.com')?'quranicaudio':host.includes('tvquran.com')?'tvquran':host.includes('assabile.com')?'assabile':host.includes('mazameer.com')?'mazameer':'generic';
  // Important: many real audio/CDN links have no .mp3 suffix. Treat every normal
  // http(s) URL as a playback candidate and let the native audio element follow
  // redirects/content-type. If it is a webpage, playback fails in-app; we never
  // send the user to that site just because they pressed Play.
  return {type:explicitAudio?'audio':'link',provider,sourceUrl:u.href,audioUrl:u.href,downloadable:explicitAudio,playbackCandidate:true};
}

export function variantScore(v={}) {
  let s=Number(v.qualityScore||0);
  if(v.localAudioKey) s+=10000;
  if(v.audioUrl) s+=200;
  if(v.original) s+=90;
  if(v.restored||v.remastered||v.corrected) s+=70;
  const q=normalizeArabic(`${v.qualityLabel||''} ${v.title||''}`);
  if(/lossless|flac|cd quality|اعلي جوده|أفضل جوده|best quality/.test(q)) s+=80;
  if(/hq|high quality|منقحه|مصححه|محسنه|restored|remastered/.test(q)) s+=55;
  const br=Number(v.bitrate||0); if(br) s+=Math.min(br,320)/8;
  const sr=Number(v.sampleRate||0); if(sr>=48000) s+=10; else if(sr>=44100) s+=7;
  if(v.codec&&/flac|alac|wav/i.test(v.codec)) s+=35;
  if(v.downloadable) s+=5;
  return s;
}
export function resolveVariant(rec) {
  const vs=(rec.variants||[]).filter(Boolean);
  if(!vs.length) return null;
  const local=vs.find(v=>v.localAudioKey); if(local) return local;
  if(rec.preferredVariantId){ const p=vs.find(v=>v.id===rec.preferredVariantId); if(p) return p; }
  return vs.filter(v=>v.audioUrl||v.localAudioKey).sort((a,b)=>variantScore(b)-variantScore(a))[0] || vs[0];
}

const vid = () => 'v'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
export function normalizeVariant(v={}) {
  return {
    id:v.id||vid(), provider:v.provider||'generic', sourceUrl:v.sourceUrl||'', audioUrl:v.audioUrl||'', videoUrl:v.videoUrl||'', embedUrl:v.embedUrl||'',
    title:v.title||'', thumbnail:v.thumbnail||'', qualityLabel:v.qualityLabel||'', bitrate:Number(v.bitrate||0), codec:v.codec||'', sampleRate:Number(v.sampleRate||0),
    duration:Number(v.duration||0), fileSize:Number(v.fileSize||0), remastered:!!v.remastered, restored:!!v.restored, corrected:!!v.corrected, original:!!v.original,
    rare:!!v.rare, downloadable:v.downloadable!==false && !!(v.audioUrl||v.localAudioKey), localAudioKey:v.localAudioKey||'',
    qualityScore:Number(v.qualityScore||0), provenance:{discoveredFrom:'',originalSource:'',archivedFrom:'',uploader:'',verified:false,confidence:0,...(v.provenance||{})}
  };
}
export function migrateTrack(raw={}) {
  const rec={
    ...raw, schemaVersion:4, id:raw.id||('t'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)),
    title:raw.title||'', reciter:raw.reciter||'', surah:raw.surah||'', year:String(raw.year||''), collection:raw.collection||'', mosque:raw.mosque||'', occasion:raw.occasion||'', recordingDate:raw.recordingDate||'',
    tags:Array.isArray(raw.tags)?raw.tags:[], playlists:Array.isArray(raw.playlists)?raw.playlists:[], rare:!!raw.rare, favorite:!!raw.favorite,
    preferredVariantId:raw.preferredVariantId||'', variants:Array.isArray(raw.variants)?raw.variants.map(normalizeVariant):[],
    cover:raw.cover||'', coverKey:raw.coverKey||'', sourceThumbnail:raw.sourceThumbnail||raw.thumb||'', gallery:Array.isArray(raw.gallery)?raw.gallery:[],
    addedAt:Number(raw.addedAt||Date.now()), lastPlayedAt:Number(raw.lastPlayedAt||0), lastPosition:Number(raw.lastPosition||0), playCount:Number(raw.playCount||0)
  };
  if(!rec.variants.length){
    if(raw.localAudioKey||raw.blobKey) rec.variants.push(normalizeVariant({provider:'local',localAudioKey:raw.localAudioKey||raw.blobKey,qualityLabel:raw.localOrigin==='download'?'نسخة منزلة':'ملف الجهاز',original:true,downloadable:true}));
    if(raw.audioUrl||(raw.kind==='url'&&raw.src)) rec.variants.push(normalizeVariant({provider:'generic',audioUrl:raw.audioUrl||raw.src,sourceUrl:raw.audioUrl||raw.src,qualityLabel:'صوت مباشر',downloadable:true}));
    const yid=raw.youtubeId||(raw.kind==='youtube'?raw.src:'');
    if(yid) rec.variants.push(normalizeVariant({provider:'youtube',sourceUrl:raw.youtubeUrl||youtubeWatch(yid),audioUrl:raw.youtubeUrl||youtubeWatch(yid),videoUrl:raw.youtubeUrl||youtubeWatch(yid),embedUrl:`https://www.youtube-nocookie.com/embed/${yid}`,thumbnail:raw.thumb||youtubeThumb(yid),qualityLabel:'فيديو أرشيفي',downloadable:false}));
  }
  return rec;
}

export function recitationKey(rec={}) {
  return normalizeArabic([rec.reciter,rec.surah,rec.year,rec.recordingDate,rec.mosque,rec.occasion,rec.collection].filter(Boolean).join('|'));
}
export function canCanonicalMatch(a,b) {
  if(normalizeArabic(a.reciter)!==normalizeArabic(b.reciter)) return false;
  if(normalizeArabic(a.surah)!==normalizeArabic(b.surah)) return false;
  if(a.year&&b.year&&String(a.year)!==String(b.year)) return false;
  if(a.recordingDate&&b.recordingDate&&a.recordingDate!==b.recordingDate) return false;
  const fields=['mosque','occasion','collection'];
  for(const f of fields) if(a[f]&&b[f]&&normalizeArabic(a[f])!==normalizeArabic(b[f])) return false;
  return true;
}

export function makeCover({surah='',surahNumber=0,reciter='',year='',seed='' }={}) {
  const title=surah||reciter||'تلاوات';
  const sub=surah ? [reciter,year?year+'هـ':''].filter(Boolean).join(' · ') : (year?year+'هـ':'مكتبة قرآنية');
  const n=surahNumber||Math.max(1,SURAHS.indexOf(surah)+1)||1;
  const safe=x=>String(x).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><radialGradient id="g" cx="75%" cy="0%"><stop offset="0" stop-color="#3b2d20"/><stop offset=".45" stop-color="#171513"/><stop offset="1" stop-color="#090a0b"/></radialGradient><pattern id="p" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 40h80M40 0v80" stroke="#d7a45f" stroke-opacity=".08" stroke-width="1"/></pattern></defs><rect width="800" height="800" rx="44" fill="url(#g)"/><rect width="800" height="800" rx="44" fill="url(#p)"/><rect x="52" y="52" width="696" height="696" rx="30" fill="none" stroke="#d7a45f" stroke-opacity=".22"/><circle cx="400" cy="290" r="112" fill="none" stroke="#d7a45f" stroke-opacity=".18"/><text x="400" y="310" text-anchor="middle" font-size="86" font-family="serif" fill="#f5f2ec">${safe(title)}</text><text x="400" y="432" text-anchor="middle" font-size="26" font-family="sans-serif" fill="#d7a45f">${safe(sub)}</text><text x="400" y="650" text-anchor="middle" font-size="22" font-family="sans-serif" fill="#8f8b84">${String(n).padStart(3,'0')}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
