import { normalizeArabic, tokens } from './catalog/core.js';

export function queueTargetIndex(current, length, delta, { wrap = true } = {}) {
  const size = Number(length) || 0;
  if (size < 1) return -1;
  const from = Math.min(Math.max(Number(current) || 0, 0), size - 1);
  const step = Number(delta) || 0;
  const next = from + step;
  if (next >= 0 && next < size) return next;
  if (!wrap) return -1;
  return ((next % size) + size) % size;
}

export function catalogRefKey(ref) {
  if (!ref) return '';
  const a = Number(ref.reciterId), b = Number(ref.moshafId), c = Number(ref.surahId);
  return [a, b, c].every(Number.isFinite) ? `${a}|${b}|${c}` : '';
}

export function sameCatalogRef(a, b) {
  const ak = catalogRefKey(a?.catalogRef || a);
  const bk = catalogRefKey(b?.catalogRef || b);
  return !!ak && ak === bk;
}

function sourceKeys(rec = {}) {
  const out = new Set();
  for (const v of rec.variants || []) {
    for (const value of [v.sourceUrl, v.audioUrl, v.videoUrl]) {
      const s = String(value || '').trim();
      if (s) out.add(s);
    }
  }
  for (const part of rec.parts || []) {
    for (const value of [part.sourceUrl, part.audioUrl, part.videoUrl]) {
      const s=String(value||'').trim();
      if(s)out.add(s);
    }
  }
  return out;
}

export function findEquivalentTrack(local = [], rec = {}) {
  if (rec.catalogRef) {
    const byCatalog = local.find(item => sameCatalogRef(item, rec));
    if (byCatalog) return byCatalog;
  }
  const incoming = sourceKeys(rec);
  if (incoming.size) {
    const bySource = local.find(item => {
      for (const key of sourceKeys(item)) if (incoming.has(key)) return true;
      return false;
    });
    if (bySource) return bySource;
  }
  return null;
}

function variantIdentity(v = {}) {
  return [v.localAudioKey, v.audioUrl, v.sourceUrl, v.videoUrl].map(x => String(x || '').trim()).find(Boolean)
    || `${v.provider || 'generic'}|${v.title || ''}|${v.qualityLabel || ''}`;
}

export function mergeVariants(target = {}, incoming = {}) {
  const existing = new Map((target.variants || []).map(v => [variantIdentity(v), v]));
  for (const v of incoming.variants || []) {
    const key = variantIdentity(v);
    if (!existing.has(key)) {
      (target.variants ||= []).push(v);
      existing.set(key, v);
    }
  }
  if (!target.catalogRef && incoming.catalogRef) target.catalogRef = { ...incoming.catalogRef };
  if (!target.sourceThumbnail && incoming.sourceThumbnail) target.sourceThumbnail = incoming.sourceThumbnail;
  if (!target.coverMode && incoming.coverMode) target.coverMode = incoming.coverMode;
  return target;
}

export function recordMatchesQuery(rec = {}, query = '') {
  const ts = Array.isArray(query) ? query : tokens(query);
  if (!ts.length) return true;
  const hay = normalizeArabic([
    rec.title, rec.reciter, rec.surah, rec.year, rec.collection, rec.mosque, rec.occasion,
    ...(rec.tags || []), ...(rec.variants || []).flatMap(v => [v.provider, v.title, v.qualityLabel, v.sourceUrl]),
    ...(rec.parts || []).flatMap(p => [p.label,p.provider,p.title,p.sourceUrl])
  ].filter(Boolean).join(' '));
  return ts.every(t => hay.includes(t));
}

function portablePart(part={}){
  const hadLocal=!!part.localAudioKey;
  return {...part,localAudioKey:'',fileSize:hadLocal?0:Number(part.fileSize||0),localMediaExcluded:hadLocal,downloadable:!!part.audioUrl};
}

export function portableTrack(track = {}) {
  const copy = structuredClone(track);
  const hadLocalAudio = (copy.variants || []).some(v => v.localAudioKey || v.localKey) || !!copy.localAudioKey || (copy.parts||[]).some(p=>p.localAudioKey);
  copy.coverKey = '';
  copy.localAudioKey = '';
  copy.blobKey = '';
  copy.localMediaExcluded = hadLocalAudio;
  copy.variants = (copy.variants || []).map(v => ({
    ...v,
    localAudioKey: '',
    localKey: '',
    fileSize: v.localAudioKey || v.localKey ? 0 : Number(v.fileSize || 0),
    downloadable: !!v.audioUrl && v.downloadable !== false
  }));
  copy.parts=(copy.parts||[]).map(portablePart);
  return copy;
}

export function sanitizeImportedTrack(track = {}) {
  const copy = structuredClone(track);
  copy.coverKey = '';
  copy.localAudioKey = '';
  copy.blobKey = '';
  copy.variants = (copy.variants || []).map(v => ({ ...v, localAudioKey: '', localKey: '' }));
  copy.parts=(copy.parts||[]).map(part=>({...part,localAudioKey:''}));
  return copy;
}
