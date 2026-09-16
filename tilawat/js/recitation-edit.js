import { getTrack, getBlob, putTrack, putBlob, deleteBlob, newId } from './store.js';
import { detectSource, youtubeId, youtubeMeta, normalizeVariant } from './catalog/core.js';
import { applyStagedMultipart, clearStagedMultipart } from './multipart-state.js';

const $=s=>document.querySelector(s);
const YALDOSRY_HOST=/^(?:www\.)?yaldosry\.com$/i;
let editId='';
let original=null;
let previewUrl='';
let existingCoverUrl='';

function toast(text,ms=2800){const el=$('#toast');if(!el)return;el.textContent=text;el.classList.add('on');clearTimeout(el._editTimer);el._editTimer=setTimeout(()=>el.classList.remove('on'),ms)}
function splitTags(value=''){return String(value).split(/[،,]/).map(x=>x.trim()).filter(Boolean)}
function sourceOf(rec){const preferred=(rec.variants||[]).find(v=>v.id===rec.preferredVariantId),variant=preferred||(rec.variants||[])[0];return variant?.sourceUrl||variant?.audioUrl||''}
function chosenMode(){return document.querySelector('input[name="addCoverMode"]:checked')?.value||original?.coverMode||'local'}
function clearPreviewUrls(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=''}if(existingCoverUrl){URL.revokeObjectURL(existingCoverUrl);existingCoverUrl=''}}
async function coverFor(rec){
  if(rec.coverKey){const blob=await getBlob(rec.coverKey).catch(()=>null);if(blob){existingCoverUrl=URL.createObjectURL(blob);return existingCoverUrl}}
  return rec.cover||rec.sourceThumbnail||(rec.variants||[]).find(v=>v.thumbnail)?.thumbnail||$('#addCoverPreview')?.dataset.fallback||'./assets/covers/fallback-1.jpg';
}
function setDialogMode(editing){
  const title=$('#addDialogTitle'),submit=$('#addForm [type="submit"]');
  if(title)title.textContent=editing?'تعديل التلاوة':'أضف تسجيلًا';
  if(submit)submit.textContent=editing?'حفظ التعديل':'حفظ التسجيل';
}
function resetEditState(){editId='';original=null;clearStagedMultipart();clearPreviewUrls();setDialogMode(false);$('#addForm')?.removeAttribute('data-editing-track')}
function ensureExistingUploadPreview(){
  if(!editId||!original||chosenMode()!=='upload'||$('#addCoverFile')?.files?.[0])return;
  const upload=$('#coverModeUpload'),preview=$('#addCoverPreview');
  if(original.coverKey){upload.disabled=false;if(existingCoverUrl)preview.src=existingCoverUrl}
}
async function resolveYaldosry(value){const r=await fetch(`/api/resolve-source?url=${encodeURIComponent(value)}`,{headers:{accept:'application/json'},cache:'no-store'});let data=null;try{data=await r.json()}catch{}if(!r.ok||!data?.audioUrl)throw new Error('resolver');return{...detectSource(data.audioUrl),provider:'yaldosry',sourceUrl:value,audioUrl:new URL(data.audioUrl,location.href).href,resolvedTitle:data.title||''}}
async function resolveSource(value){if(!value)return null;try{const u=new URL(value);if(u.protocol==='https:'&&YALDOSRY_HOST.test(u.hostname)&&!(/\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(?:[?#]|$)/i.test(u.href)))return resolveYaldosry(value)}catch{}return detectSource(value)}

async function openEdit(id){
  const rec=await getTrack(id).catch(()=>null);if(!rec){toast('تعذر العثور على التلاوة.');return}
  clearPreviewUrls();clearStagedMultipart();editId=id;original=rec;
  const form=$('#addForm');form.reset();form.dataset.editingTrack=id;setDialogMode(true);
  $('#addSource').value=sourceOf(rec);$('#addTitle').value=rec.title||'';$('#addReciter').value=rec.reciter||'';$('#addSurah').value=rec.surah||'';$('#addYear').value=rec.year||'';$('#addCollection').value=rec.collection||'';$('#addMosque').value=rec.mosque||'';$('#addOccasion').value=rec.occasion||'';$('#addTags').value=(rec.tags||[]).join('، ');$('#addRare').checked=!!rec.rare;
  const preferred=(rec.variants||[]).find(v=>v.id===rec.preferredVariantId)||(rec.variants||[])[0];$('#addOriginal').checked=!!preferred?.original;$('#addRestored').checked=!!(preferred?.restored||preferred?.remastered);
  $('#addFile').value='';$('#addFileStatus').textContent=preferred?.localAudioKey?'المصدر الحالي محفوظ على الجهاز':'لم يُختر ملف جديد';$('#addCoverFile').value='';$('#addCoverFileStatus').textContent=rec.coverKey?'الصورة الحالية محفوظة من جهازك':'اختياري';
  const thumb=rec.sourceThumbnail||preferred?.thumbnail||'';const yt=$('#coverModeYoutube'),local=$('#coverModeLocal'),upload=$('#coverModeUpload');yt.disabled=!thumb;upload.disabled=!rec.coverKey;let selected=local;if(rec.coverMode==='upload'&&rec.coverKey){upload.checked=true;selected=upload}else if(rec.coverMode==='youtube'&&thumb){yt.checked=true;selected=yt}else local.checked=true;
  selected.dispatchEvent(new Event('change',{bubbles:true}));
  const preview=$('#addCoverPreview');preview.dataset.fallback=preview.dataset.fallback||'./assets/covers/fallback-1.jpg';preview.src=await coverFor(rec);ensureExistingUploadPreview();
  $('#sourceHint').textContent='عدّل المصدر فقط إذا أردت إضافة مصدر جديد للتلاوة؛ المصادر القديمة لن تُحذف.';
  $('#addDialog').classList.remove('hidden');dispatchEvent(new CustomEvent('tilawat:edit-form-opened',{detail:{track:rec}}));requestAnimationFrame(()=>$('#addTitle')?.focus());
}

async function saveEdit(event){
  if(!editId)return;
  event.preventDefault();event.stopImmediatePropagation();
  const rec=await getTrack(editId).catch(()=>null);if(!rec){toast('تعذر العثور على التلاوة.');resetEditState();return}
  const title=$('#addTitle').value.trim(),reader=$('#addReciter').value.trim();if(!title||!reader){toast('اكتب العنوان واسم القارئ.');return}
  const oldCoverKey=rec.coverKey||'',oldPartKeys=new Set((rec.parts||[]).map(p=>p.localAudioKey).filter(Boolean));
  const currentSource=sourceOf(rec),source=$('#addSource').value.trim(),audioFile=$('#addFile').files?.[0],coverFile=$('#addCoverFile').files?.[0];
  rec.title=title;rec.reciter=reader;rec.surah=$('#addSurah').value.trim();rec.year=$('#addYear').value.trim();rec.collection=$('#addCollection').value.trim();rec.mosque=$('#addMosque').value.trim();rec.occasion=$('#addOccasion').value.trim();rec.tags=splitTags($('#addTags').value);rec.rare=$('#addRare').checked;
  try{
    if(source&&source!==currentSource){
      const detected=await resolveSource(source);if(!detected)throw new Error('source');
      if(detected.provider==='youtube'){const meta=await youtubeMeta(youtubeId(source)).catch(()=>null);if(meta){detected.thumbnail=meta.thumbnail;if(chosenMode()==='youtube')rec.sourceThumbnail=meta.thumbnail}}
      const v=normalizeVariant({...detected,original:$('#addOriginal').checked,restored:$('#addRestored').checked,qualityLabel:$('#addRestored').checked?'منقحة':'',provenance:{discoveredFrom:'تعديل المستخدم',originalSource:source,verified:false,confidence:.85}});rec.variants=[v,...(rec.variants||[])];rec.preferredVariantId=v.id;
    }else{
      const preferred=(rec.variants||[]).find(v=>v.id===rec.preferredVariantId)||(rec.variants||[])[0];if(preferred){preferred.original=$('#addOriginal').checked;preferred.restored=$('#addRestored').checked}
    }
    if(audioFile){const v=normalizeVariant({provider:'local',localAudioKey:`v-${rec.id}-${newId()}-local`,title:audioFile.name,qualityLabel:'ملف الجهاز',fileSize:audioFile.size,original:true,downloadable:true,provenance:{discoveredFrom:'تعديل المستخدم',verified:true,confidence:1}});await putBlob(v.localAudioKey,audioFile);rec.variants=[v,...(rec.variants||[])];rec.preferredVariantId=v.id}

    const mode=chosenMode();rec.coverMode=mode;
    if(mode==='upload'){
      if(coverFile){const key=`cover-${rec.id}-${Date.now().toString(36)}`;await putBlob(key,coverFile);rec.coverKey=key;rec.cover='';if(oldCoverKey&&oldCoverKey!==key)await deleteBlob(oldCoverKey).catch(()=>{})}
      else if(!rec.coverKey){rec.coverMode='local'}
    }else{
      if(oldCoverKey){await deleteBlob(oldCoverKey).catch(()=>{});rec.coverKey=''}
      if(mode==='youtube'){const thumb=rec.sourceThumbnail||(rec.variants||[]).find(v=>v.thumbnail)?.thumbnail||'';if(!thumb)rec.coverMode='local'}
      if(mode==='local')rec.cover='';
    }
    applyStagedMultipart(rec);
    const newPartKeys=new Set((rec.parts||[]).map(p=>p.localAudioKey).filter(Boolean));
    const escaped=globalThis.CSS?.escape?CSS.escape(rec.id):rec.id.replace(/["\\]/g,'\\$&'),wasCurrent=$(`#libraryGrid .library-row.is-current[data-play="${escaped}"]`);
    /* The central stop handler persists the in-memory current track. Do that
       before writing the edited entity; otherwise its stale object overwrites
       the just-saved title/cover/parts. */
    if(wasCurrent)dispatchEvent(new CustomEvent('tilawat:stop-playback',{detail:{reason:'edited-current'}}));
    delete rec._coverResolved;await putTrack(rec);
    for(const key of oldPartKeys)if(!newPartKeys.has(key))await deleteBlob(key).catch(()=>{});
    $('#addDialog').classList.add('hidden');resetEditState();dispatchEvent(new CustomEvent('tilawat-library-imported'));toast('حُفظت كل تعديلات التلاوة.');
  }catch(err){console.warn(err);clearStagedMultipart();toast('تعذر حفظ التعديل. تأكد من المصدر أو الملف.',4200)}
}

function boot(){
  const form=$('#addForm');if(!form)return;
  form.addEventListener('submit',saveEdit,true);
  addEventListener('tilawat:edit-track',event=>{const id=event.detail?.id;if(id)openEdit(id)});
  $('#addBtn')?.addEventListener('click',()=>{if(editId)resetEditState()},true);
  document.addEventListener('click',event=>{const close=event.target.closest?.('[data-close="addDialog"]');if(close&&editId)resetEditState()},true);
  document.querySelectorAll('input[name="addCoverMode"]').forEach(input=>input.addEventListener('change',()=>{if(editId)ensureExistingUploadPreview()}));
  ['#addTitle','#addReciter','#addSurah','#addSource'].forEach(selector=>$(selector)?.addEventListener('input',()=>{if(editId)ensureExistingUploadPreview()}));
  $('#addCoverFile')?.addEventListener('change',()=>{if(!editId)return;const file=$('#addCoverFile').files?.[0];if(file){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);$('#addCoverPreview').src=previewUrl}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();