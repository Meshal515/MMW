// Multi-mode AI operations. Pure helpers with no dependency on DOM or API keys.
export const MODE_ORDER = Object.freeze(['ideas','structure','proofread','improve','review','analyze','prompt','custom']);
export const EDIT_MODES = new Set(['ideas','structure','improve','proofread','review']);
export const DEFAULT_MODES = Object.freeze(['ideas']);

export function normalizeModeSelection(modes){
 const seen=new Set(Array.isArray(modes)?modes:[]);
 const selected=MODE_ORDER.filter(mode=>seen.has(mode));
 return selected.length?selected:DEFAULT_MODES.slice();
}

export function preservationReport(original, proposal){
 // Markdown punctuation and headings do not count toward source-word coverage.
 const tokens=s=>String(s||'').toLowerCase()
   .normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'')
   .match(/[\p{L}\p{N}]+/gu)||[];
 const source=tokens(original),out=tokens(proposal);
 const counts=new Map();
 for(const word of out)counts.set(word,(counts.get(word)||0)+1);
 let kept=0;const missing=[];
 for(const word of source){
  const available=counts.get(word)||0;
  if(available){counts.set(word,available-1);kept++;}
  else if(missing.length<12)missing.push(word);
 }
 const coverage=source.length?kept/source.length:1;
 return {coverage,sourceWords:source.length,keptWords:kept,missing,passes:coverage>=0.95};
}

export function labelForMode(mode){
 return {
   ideas:'ترتيب الأفكار',structure:'عناوين فقط',proofread:'تصحيح إملائي',
   improve:'تحسين الأسلوب',review:'نقد وإصلاح',analyze:'تحليل هندسي',
   prompt:'برومبت تنفيذي',custom:'نفّذ طلبي'
 }[mode]||mode;
}
