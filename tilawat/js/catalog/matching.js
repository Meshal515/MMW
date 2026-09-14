import { canCanonicalMatch, normalizeArabic } from './core.js';

export function matchConfidence(a,b){
  if(!canCanonicalMatch(a,b)) return 0;
  let score=.55;
  const fields=['year','recordingDate','mosque','occasion','collection'];
  for(const f of fields){
    if(a[f]&&b[f]&&normalizeArabic(a[f])===normalizeArabic(b[f])) score+=.08;
  }
  const da=Number(a.duration||0),db=Number(b.duration||0);
  if(da&&db){const drift=Math.abs(da-db)/Math.max(da,db);if(drift<.01)score+=.08;else if(drift<.04)score+=.04;else if(drift>.12)score-=.12}
  return Math.max(0,Math.min(1,score));
}

export function mergeAsVariants(canonical,incoming){
  if(!canCanonicalMatch(canonical,incoming)) return null;
  const seen=new Set((canonical.variants||[]).map(v=>`${v.provider}|${v.sourceUrl}|${v.audioUrl}`));
  for(const v of incoming.variants||[]){const k=`${v.provider}|${v.sourceUrl}|${v.audioUrl}`;if(!seen.has(k)){canonical.variants.push(v);seen.add(k)}}
  canonical.tags=[...new Set([...(canonical.tags||[]),...(incoming.tags||[])])];
  canonical.gallery=[...new Set([...(canonical.gallery||[]),...(incoming.gallery||[])])];
  return canonical;
}
