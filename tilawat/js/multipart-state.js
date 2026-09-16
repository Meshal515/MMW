let pending=null;

const norm=value=>String(value||'').trim().toLowerCase();

export function stageMultipart({title='',reciter='',parts=[],force=false}={}){
  const clean=(Array.isArray(parts)?parts:[]).filter(Boolean).slice(0,4);
  pending=(force||clean.length)?{title:norm(title),reciter:norm(reciter),parts:clean,force:!!force,createdAt:Date.now()}:null;
}

export function clearStagedMultipart(){pending=null}

export function applyStagedMultipart(track){
  if(!pending||!track)return track;
  if(Date.now()-pending.createdAt>30000){pending=null;return track}
  if(pending.title&&norm(track.title)!==pending.title)return track;
  if(pending.reciter&&norm(track.reciter)!==pending.reciter)return track;
  track.parts=pending.parts.map((part,index)=>({
    ...part,
    order:index+2,
    label:part.label||`الجزء ${index+2}`
  }));
  pending=null;
  return track;
}