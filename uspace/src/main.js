import './style.css';
import DOMPurify from 'dompurify';
import { mountRichEditor, loadRichDocument, richMarkdown, richJSON, richHTML, richAction, selectionFormatting } from './rich-editor.js';
import { bootstrap, list, put, remove, clearPage } from './storage.js';
import {countText, insertHeadings, markdownToHtml, escapeHtml, fileName} from './format.js';

const $ = sel => document.querySelector(sel);
const state = { spaces:[], pages:[], activeSpace:null, activePage:null, mode:'structure', model:'deepseek-v4-flash', preview:false, sourceMode:false, sourceEdited:false, richChanged:false, sidebarOpen:false, panelOpen:false, search:'', ai:null, busy:false, saving:false, toastTimer:null };
const SAVE_DELAY = 450;
let saveTimer, revisionTimer, richEditor, loadingRich=false;
const modes = {structure:{name:'ترتيب دون تحريف',description:'أضيف عناوين مناسبة حول فقراتك، مع فحص آلي يثبت أن النص الأصلي لم يتغير.'},improve:{name:'تحسين الأسلوب',description:'أقترح نسخة أوضح تحافظ على المعنى. النص الأصلي لا يتغير إلا بموافقتك.'},review:{name:'مراجعة ونقد',description:'أرصد الغموض والتناقضات ونقاط الضعف، دون أن أغيّر أي كلمة.'},proofread:{name:'تصحيح إملائي',description:'أصحح الأخطاء الإملائية والنحوية فقط مع حفظ الأصل.'},prompt:{name:'برومبت احترافي',description:'أرتب أفكارك في تعليمات Markdown دون حذف متطلباتك.'}};

function id(){return crypto.randomUUID();}
function icon(name, size=19){
 const icons={
 plus:'<path d="M12 5v14M5 12h14"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',close:'<path d="M18 6 6 18M6 6l12 12"/>',
 chevron:'<path d="m15 18-6-6 6-6"/>',file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
 spark:'<path d="m12 3 1.9 5.9L20 11l-6.1 2.1L12 19l-1.9-5.9L4 11l6.1-2.1L12 3ZM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 17v3h16v-3"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-2 3.5-1.7-.6a8 8 0 0 1-2.1 1.2l-.3 1.8h-4l-.3-1.8a8 8 0 0 1-2.1-1.2l-1.7.6-2-3.5 1.4-1.1a8 8 0 0 1 0-2.4L4.7 11.6l2-3.5 1.7.6a8 8 0 0 1 2.1-1.2l.3-1.8h4l.3 1.8a8 8 0 0 1 2.1 1.2l1.7-.6 2 3.5-1.4 1.1a8 8 0 0 1 0 2.3Z"/>',
 book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21Z"/><path d="M4 5.5v13A2.5 2.5 0 0 0 6.5 21H20"/>',
 check:'<path d="m5 12 4 4L19 6"/>',trash:'<path d="M4 7h16M10 3h4M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 edit:'<path d="m4 17-1 4 4-1L20 7l-3-3L4 17ZM15 6l3 3"/>',
 history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/><path d="M12 7v5l3 2"/>',
 copy:'<rect x="7" y="7" width="13" height="14" rx="2"/><path d="M4 17V5a2 2 0 0 1 2-2h10"/>',
 dots:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 arrow:'<path d="m5 12 14 0m-6-6 6 6-6 6"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 quote:'<path d="M3 17h7V9H3v8ZM14 17h7V9h-7v8ZM3 9c0-3 2-5 5-6M14 9c0-3 2-5 5-6"/>',
 code:'<path d="m8 8-4 4 4 4m8-8 4 4-4 4M14 4l-4 16"/>',
 table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
 shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
 moon:'<path d="M20 15a8 8 0 0 1-11-11A8 8 0 1 0 20 15Z"/>'
 };
 return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.file}</svg>`;
}
function toast(text, type=''){const n=$('#toast'); n.textContent=text;n.className=`toast show ${type}`;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>n.classList.remove('show'),3500);}
function getSpace(){return state.spaces.find(s=>s.id===state.activeSpace);}
function getPage(){return state.pages.find(p=>p.id===state.activePage);}
function fmtDate(ts){return new Intl.DateTimeFormat('ar-SA',{month:'short',day:'numeric'}).format(ts);}
function renderShell(){
 $('#app').innerHTML=`<div class="shell">
  <div class="scrim" id="scrim"></div>
  <aside class="sidebar" id="sidebar">
    <div class="brand"><div class="brand-mark"><span>U</span></div><div class="brand-title"><b>USPACE</b><span>YOUR MIND, UNFILTERED</span></div><button class="icon-btn mobile-close" id="close-sidebar" title="إغلاق">${icon('close')}</button></div>
    <div class="workspace-label">مساحات العمل <button class="icon-btn small" id="add-space" title="إنشاء مساحة">${icon('plus',17)}</button></div>
    <div id="spaces-list" class="spaces-list"></div>
    <div class="sidebar-separator"></div>
    <div class="pages-head"><span>الصفحات <b id="page-count">0</b></span><button class="icon-btn small" id="add-page" title="صفحة جديدة">${icon('plus',17)}</button></div>
    <label class="search-wrap">${icon('search',17)}<input id="search" type="search" placeholder="ابحث في صفحاتك..." autocomplete="off" aria-label="البحث في الصفحات"/><span>⌘K</span></label>
    <div class="pages-list" id="pages-list"></div>
    <div class="sidebar-foot"><div class="local-status"><span class="local-dot"></span>محفوظ على هذا الجهاز</div><button class="sidebar-action" id="backup-btn">${icon('download',17)} تصدير نسخة احتياطية</button><button class="sidebar-action" id="import-btn">${icon('upload',17)} استيراد ملف Markdown</button><button class="sidebar-action" id="settings-btn">${icon('settings',17)} الإعدادات والاتصال</button></div>
  </aside>
  <main class="main">
    <header class="topbar"><div class="breadcrumbs"><button class="icon-btn mobile-menu" id="open-sidebar" title="القائمة">${icon('menu')}</button><span id="crumb-space">مساحتي</span><span class="crumb-slash">/</span><strong id="crumb-page">ملاحظة جديدة</strong></div>
      <div class="top-actions"><span class="save-indicator" id="save-status">${icon('check',15)} محفوظ</span><button class="quiet-btn" id="source-btn" title="عرض وتحرير Markdown">MD<span class="desktop-label"> المصدر</span></button><button class="quiet-btn" id="preview-btn">${icon('eye',17)}<span>معاينة</span></button><button class="accent-btn" id="assistant-btn">${icon('spark',18)}<span>المساعد الذكي</span></button></div></header>
    <div class="editor-scroll"><article class="editor-paper"><div class="eyebrow">مساحة للكتابة والتفكير</div><input id="page-title" class="page-title" aria-label="عنوان الصفحة" placeholder="صفحة بدون عنوان" maxlength="200"/><div class="page-meta"><span id="modified-label">آخر تعديل الآن</span><span class="meta-circle">●</span><span>Markdown</span><span class="meta-circle">●</span><span>خصوصي على جهازك</span></div>
    <div class="editor-rule"></div><div class="format-toolbar" role="toolbar" aria-label="تنسيق المستند">
      <select id="editor-font" aria-label="خط المستند" title="خط المستند"><option value="system">افتراضي</option><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select>
      <select id="editor-size" aria-label="حجم الخط الافتراضي" title="حجم خط المستند"><option value="14">14</option><option value="16">16</option><option value="18">18</option><option value="20">20</option><option value="24">24</option></select>
      <span class="toolbar-divider"></span>
      <button type="button" data-format="undo" title="تراجع" aria-label="تراجع">↶</button>
      <button type="button" data-format="redo" title="إعادة" aria-label="إعادة">↷</button>
      <button type="button" data-format="h1" title="عنوان H1">H1</button>
      <button type="button" data-format="h2" title="عنوان H2">H2</button>
      <button type="button" data-format="h3" title="عنوان H3">H3</button>
      <button type="button" data-format="bold" title="عريض" aria-label="عريض"><b>B</b></button>
      <button type="button" data-format="italic" title="مائل" aria-label="مائل"><i>I</i></button>
      <button type="button" data-format="underline" title="تسطير" aria-label="تسطير"><u>U</u></button>
      <button type="button" data-format="strike" title="شطب" aria-label="شطب"><s>S</s></button>
      <button type="button" data-format="code" title="كود داخل السطر">${icon('code',17)}</button>
      <button type="button" data-format="codeblock" title="كتلة كود">{ }</button>
      <button type="button" data-format="list" title="قائمة نقطية">${icon('list',17)}</button>
      <button type="button" data-format="ordered" title="قائمة مرقمة">1.</button>
      <button type="button" data-format="checklist" title="قائمة مهام">☑</button>
      <button type="button" data-format="quote" title="اقتباس">${icon('quote',17)}</button>
      <button type="button" data-format="hr" title="فاصل">―</button>
      <button type="button" data-format="highlight" title="تمييز النص">◉</button>
      <button type="button" data-format="align-right" title="محاذاة يمين">⇤</button>
      <button type="button" data-format="align-center" title="توسيط">↔</button>
      <button type="button" data-format="align-left" title="محاذاة يسار">⇥</button>
      <button type="button" data-format="link" title="إضافة رابط">🔗</button>
      <select id="selection-font" aria-label="خط النص المحدد" title="خط التحديد"><option value="">خط التحديد</option><option value="Tahoma">Tahoma</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Courier New">Mono</option></select>
      <select id="selection-size" aria-label="حجم النص المحدد" title="حجم التحديد"><option value="">حجم التحديد</option><option value="12">12</option><option value="14">14</option><option value="16">16</option><option value="18">18</option><option value="20">20</option><option value="24">24</option><option value="28">28</option><option value="32">32</option><option value="40">40</option></select>
      <label class="toolbar-color" title="لون الخط"><span>لون</span><input id="selection-color" type="color" value="#263a33" aria-label="لون النص المحدد"/></label>
      <button type="button" data-format="table" title="إنشاء جدول">${icon('table',17)} جدول</button>
    </div>
    <div id="table-tools" class="table-tools hidden" role="toolbar" aria-label="أدوات الجدول">
      <span>الجدول</span>
      <button type="button" data-format="row-before">صف قبل</button>
      <button type="button" data-format="row-after">صف بعد</button>
      <button type="button" data-format="row-remove">حذف صف</button>
      <button type="button" data-format="col-before">عمود قبل</button>
      <button type="button" data-format="col-after">عمود بعد</button>
      <button type="button" data-format="col-remove">حذف عمود</button>
      <button type="button" data-format="merge">دمج الخلايا</button>
      <button type="button" data-format="split">تقسيم خلية</button>
      <button type="button" data-format="header-row">رأس جدول</button>
      <button type="button" data-format="header-column">عمود عنوان</button>
      <button type="button" data-format="table-remove" class="danger-action">حذف الجدول</button>
    </div>
    <div id="rich-editor" class="rich-editor-host" aria-label="المحرر المرئي"></div>
    <textarea id="editor" class="hidden" spellcheck="true" dir="auto" aria-label="مصدر Markdown" placeholder="اكتب Markdown هنا..."></textarea><div id="preview" class="markdown-preview hidden"></div>
    </article></div>
    <footer class="editor-footer"><div class="count-line"><span id="word-count">0 كلمة</span><span id="char-count">0 حرف</span><span id="sentence-count">0 جملة</span></div><div class="footer-tools"><button class="text-btn" id="instructions-btn">${icon('settings',16)} تعليمات الصفحة</button><button class="text-btn" id="export-md-btn">${icon('download',16)} تنزيل MD</button><button class="icon-btn" id="more-btn" title="حذف الصفحة">${icon('trash',17)}</button></div></footer>
  </main>
  <aside class="right-panel" id="right-panel"><div class="panel-header"><div><span class="panel-kicker">USPACE INTELLIGENCE</span><h2>${icon('spark',22)} مساعد الكتابة</h2></div><button class="icon-btn" id="close-panel" aria-label="إغلاق المساعد">${icon('close')}</button></div>
  <div class="panel-body"><div class="panel-note">أفكارك تبقى لك. أي اقتراح يظهر أولًا للمراجعة، ولا يُستبدل نصك تلقائيًا.</div><label class="field-label">ماذا تريد أن أفعل؟</label><div class="mode-options" id="modes"></div>
  <label class="field-label" for="model">النموذج</label><select id="model" class="field-input"><option value="deepseek-v4-flash">DeepSeek V4 Flash</option><option value="deepseek-v4-pro">DeepSeek V4 Pro</option></select>
  <label class="field-label" for="provider-key">مفتاح DeepSeek API الخاص بك</label>
  <input class="field-input" id="provider-key" type="password" autocomplete="new-password" spellcheck="false" placeholder="sk-..."/>
  <div class="field-help">يُستخدم من ذاكرة الصفحة ولا يضاف إلى GitHub أو قاعدة بيانات الخادم. يمر عبر Cloudflare Worker أثناء الطلب فقط.</div>
  <div class="key-buttons"><button class="quiet-btn bordered" type="button" id="activate-provider-key">تفعيل المفتاح</button><button class="quiet-btn bordered" type="button" id="lock-provider-key">قفل</button></div>
  <div class="field-help key-status" id="provider-key-status" role="status" aria-live="polite">المفتاح غير مفعّل</div>
  <details class="vault-details"><summary>الحفظ المحلي المشفر (اختياري)</summary><p class="field-help">احفظ المفتاح مشفرًا بعبارة مرور من اختيارك. لن تُحفظ عبارة المرور، وستحتاجها بعد إعادة فتح الصفحة.</p>
    <label class="field-label" for="key-passphrase">عبارة مرور 12 حرفًا على الأقل</label><input class="field-input" id="key-passphrase" type="password" autocomplete="off"/>
    <div class="key-buttons"><button class="quiet-btn bordered" type="button" id="remember-provider-key">حفظ مشفر</button><button class="quiet-btn bordered" type="button" id="unlock-provider-key">فتح الخزنة</button><button class="quiet-btn bordered" type="button" id="forget-provider-key">حذف المفتاح</button></div>
  </details>
  <details class="vault-details"><summary>اتصال Cloudflare القديم</summary><label class="field-label" for="access-key">رمز دخول Worker</label><input class="field-input" id="access-key" type="password" autocomplete="off" placeholder="رمز وصول Worker"/><p class="field-help">للوضع القديم فقط، عندما يكون مفتاح DeepSeek محفوظًا في Cloudflare Secrets.</p></details>
  <button class="run-btn" id="run-ai">${icon('spark',18)} <span>تحليل الصفحة</span></button><div id="ai-results" class="ai-results"></div></div></aside>
  <div id="dialog-root"></div><div class="toast" id="toast" role="status" aria-live="polite"></div><input id="file-input" type="file" accept=".md,.markdown,text/markdown,text/plain" hidden/>
  </div>`;
 if(richEditor)richEditor.destroy();
 richEditor=mountRichEditor($('#rich-editor'),()=>{
   if(!loadingRich && !state.sourceMode){state.richChanged=true;queueSave();}
 },()=>updateRichToolbar());
 bind();renderNav();renderCurrent();renderModes();
}
function renderNav(){
 const s=$('#spaces-list');s.innerHTML=state.spaces.map(sp=>`<button data-space="${sp.id}" class="space-option ${sp.id===state.activeSpace?'selected':''}"><span class="space-icon">${icon('book',17)}</span><span>${escapeHtml(sp.name)}</span>${sp.id===state.activeSpace?icon('chevron',16):''}</button>`).join('');
 const term=state.search.toLowerCase();const currentPages=state.pages.filter(p=>p.spaceId===state.activeSpace).sort((a,b)=>b.updatedAt-a.updatedAt);
 $('#page-count').textContent=currentPages.length;
 const shown=currentPages.filter(p=>`${p.title} ${p.body}`.toLowerCase().includes(term));
 $('#pages-list').innerHTML=shown.length?shown.map(p=>`<button data-page="${p.id}" class="page-option ${p.id===state.activePage?'active':''}"><span class="page-line">${icon('file',17)}<span class="page-item-title">${escapeHtml(p.title||'صفحة بدون عنوان')}</span></span><span class="page-date">${fmtDate(p.updatedAt)}</span></button>`).join(''):'<p class="empty-nav">ما فيه صفحات تطابق بحثك.</p>';
 $('#crumb-space').textContent=getSpace()?.name||'مساحتي';
}
function currentDocumentBody(){
 const p=getPage();
 if(state.sourceMode)return $('#editor').value;
 if(state.richChanged && richEditor)return richMarkdown(richEditor);
 return p?.body || '';
}
function renderCurrent(){
 const p=getPage();if(!p)return;
 $('#page-title').value=p.title==='صفحة بدون عنوان'?'':p.title;
 $('#editor').value=p.body||'';
 loadingRich=true;
 try{
   loadRichDocument(richEditor,p);
   state.sourceMode=false;
 }catch(e){
   state.sourceMode=true;
   toast('تعذر عرض المستند بصيغة Rich Text؛ محفوظ أصله في Markdown','error');
 }finally{loadingRich=false;}
 state.sourceEdited=false;state.richChanged=false;state.preview=false;
 renderEditorTypography();
 $('#crumb-page').textContent=p.title||'صفحة بدون عنوان';
 $('#modified-label').textContent='آخر تعديل '+fmtDate(p.updatedAt);
 syncPreview();updateStats();updateRichToolbar();
 $('#ai-results').innerHTML='';state.ai=null;
}
function syncPreview(){
 const source=state.sourceMode&&!state.preview;
 $('#editor').classList.toggle('hidden',!source);
 $('#rich-editor').classList.toggle('hidden',state.sourceMode||state.preview);
 $('#preview').classList.toggle('hidden',!state.preview);
 if(state.preview){
   const html=state.sourceMode?markdownToHtml($('#editor').value):richHTML(richEditor);
   $('#preview').innerHTML=DOMPurify.sanitize(html,{USE_PROFILES:{html:true}});
 }
 $('#source-btn').classList.toggle('is-active',state.sourceMode);
 $('#source-btn').setAttribute('aria-pressed',String(state.sourceMode));
 $('#preview-btn').innerHTML=state.preview?icon('edit',17)+'<span>تحرير</span>':icon('eye',17)+'<span>معاينة</span>';
 updateRichToolbar();
}
async function toggleMarkdownSource(){
 await flush();
 if(!state.sourceMode){
   state.sourceMode=true;state.sourceEdited=false;
   $('#editor').value=getPage()?.body||'';
 }else{
   if(state.sourceEdited){
     loadingRich=true;
     try{loadRichDocument(richEditor,{body:$('#editor').value});}
     catch(e){toast('Markdown غير قابل للتحويل. راجع المصدر قبل الرجوع.','error');return;}
     finally{loadingRich=false;}
   }
   state.sourceMode=false;state.sourceEdited=false;state.richChanged=false;
 }
 state.preview=false;syncPreview();updateStats();
}
function updateRichToolbar(){
 if(!$('#table-tools'))return;
 const richActive=!state.sourceMode&&!state.preview&&Boolean(richEditor);
 const marks=richActive?selectionFormatting(richEditor):{};
 $('#table-tools').classList.toggle('hidden',!richActive||!marks.table);
 document.querySelectorAll('[data-format]').forEach(button=>{
   const key=button.dataset.format;
   const active={bold:marks.bold,italic:marks.italic,underline:marks.underline,strike:marks.strike,code:marks.code,list:marks.bullet,ordered:marks.ordered,checklist:marks.task,quote:marks.quote};
   button.classList.toggle('is-active',Boolean(active[key]));
   if(key in active)button.setAttribute('aria-pressed',String(Boolean(active[key])));
 });
}
function activateEnteredProviderKey(){
 const field=$('#provider-key');
 if(field.value.trim()){setProviderKey(field.value);field.value='';}
 refreshProviderKeyStatus();
}
async function refreshProviderKeyStatus(){
 const node=$('#provider-key-status');if(!node)return;
 let saved=false;try{saved=await savedProviderKeyExists();}catch{}
 node.textContent=providerKey()?'مفتاح نشط في ذاكرة الصفحة'+(saved?' • نسخة مشفرة محفوظة':''):saved?'يوجد مفتاح مشفر — افتح الخزنة بعبارة المرور':'لا يوجد مفتاح مفعل';
}
function renderEditorTypography(){
 const p=getPage();if(!p)return;
 const font=['system','sans','serif','mono'].includes(p.fontFamily)?p.fontFamily:'system';
 const size=[14,16,18,20,24].includes(Number(p.fontSize))?Number(p.fontSize):16;
 const paper=$('.editor-paper');paper.dataset.font=font;paper.style.setProperty('--editor-body-size',size+'px');
 $('#editor-font').value=font;$('#editor-size').value=String(size);
}
function applyFormat(kind){
 if(state.preview){state.preview=false;syncPreview();}
 if(!state.sourceMode){
   if(kind==='table'){
     const colsRaw=prompt('عدد الأعمدة من 1 إلى 20','3');
     if(colsRaw===null)return;
     const rowsRaw=prompt('عدد الصفوف من 1 إلى 100','3');
     if(rowsRaw===null)return;
     const cols=Number(colsRaw),rows=Number(rowsRaw);
     if(!Number.isInteger(cols)||cols<1||cols>20||!Number.isInteger(rows)||rows<1||rows>100){toast('أدخل أعدادًا صحيحة ضمن الحدود','error');return;}
     richAction(richEditor,'table',{cols,rows});
   }else if(kind==='link'){
     const input=prompt('رابط HTTPS أو HTTP أو mailto','https://');
     if(input===null)return;
     try{
       const value=new URL(input.trim());
       if(!['https:','http:','mailto:'].includes(value.protocol))throw Error('Invalid scheme');
       richAction(richEditor,'link',{href:value.href});
     }catch{toast('الرابط غير صالح أو بروتوكوله غير مسموح','error');}
   }else if(!richAction(richEditor,kind)){
     if(!['undo','redo','merge','split','row-remove','col-remove','table-remove'].includes(kind))toast('حدّد الموضع المناسب أولًا','error');
   }
   updateRichToolbar();return;
 }
 const field=$('#editor'),start=field.selectionStart,end=field.selectionEnd;
 const selected=field.value.slice(start,end);
 let content=selected;
 switch(kind){
  case 'bold':content='**'+(selected||'نص عريض')+'**';break;
  case 'italic':content='*'+(selected||'نص مائل')+'*';break;
  case 'underline':content='<u>'+(selected||'نص مسطر')+'</u>';break;
  case 'strike':content='~~'+(selected||'نص مشطوب')+'~~';break;
  case 'code':content=String.fromCharCode(96)+(selected||'code')+String.fromCharCode(96);break;
  case 'codeblock':content='~~~\n'+(selected||'code')+'\n~~~';break;
  case 'heading':case 'h2':content='## '+(selected||'عنوان فرعي');break;
  case 'h1':content='# '+(selected||'عنوان رئيسي');break;
  case 'h3':content='### '+(selected||'عنوان ثالث');break;
  case 'list':content=(selected||'عنصر جديد').split('\n').map(x=>'- '+x).join('\n');break;
  case 'ordered':content=(selected||'عنصر جديد').split('\n').map((x,i)=>(i+1)+'. '+x).join('\n');break;
  case 'checklist':content=(selected||'عنصر جديد').split('\n').map(x=>'- [ ] '+x).join('\n');break;
  case 'quote':content=(selected||'نص مقتبس').split('\n').map(x=>'> '+x).join('\n');break;
  case 'hr':content='\n---\n';break;
  case 'table':{
   const c=Number(prompt('عدد الأعمدة من 1 إلى 20','3'));
   if(!Number.isInteger(c)||c<1||c>20)return;
   const r=Number(prompt('عدد صفوف البيانات من 1 إلى 100','3'));
   if(!Number.isInteger(r)||r<1||r>100)return;
   const cols=Array.from({length:c},(_,i)=>'عمود '+(i+1));
   content='| '+cols.join(' | ')+' |\n| '+cols.map(()=>'---').join(' | ')+' |\n'+Array.from({length:r},()=> '| '+cols.map(()=>' ').join(' | ')+' |').join('\n');
   break;
  }
  case 'link':{
    const address=prompt('الرابط (HTTPS)','https://');if(!address)return;
    let url;try{url=new URL(address);if(!['https:','http:','mailto:'].includes(url.protocol))return;}catch{return;}
    content='['+(selected||'عنوان الرابط')+']('+url.href+')';break;
  }
  case 'undo':case 'redo':toast('استخدم اختصار التراجع أو الإعادة في وضع Markdown');return;
  default:toast('هذا التنسيق متاح من المحرر المرئي');return;
 }
 field.setRangeText(content,start,end,'end');
 field.focus();state.sourceEdited=true;queueSave();
}
function updateStats(){
 const c=countText(currentDocumentBody());
 $('#word-count').textContent=c.words.toLocaleString('ar-SA')+' كلمة';
 $('#char-count').textContent=c.chars.toLocaleString('ar-SA')+' حرف · '+c.charsNoSpace.toLocaleString('ar-SA')+' بلا مسافات';
 $('#sentence-count').textContent=c.sentences.toLocaleString('ar-SA')+' جملة';
}
function markUnsaved(){$('#save-status').innerHTML='● جارِ الحفظ...';$('#save-status').classList.add('pending');}
let editVersion=0;
async function saveCurrent(){
 clearTimeout(saveTimer);saveTimer=null;
 const p=getPage();if(!p)return;
 const v=editVersion;
 const body=currentDocumentBody();
 const documentJSON=state.sourceMode?(state.sourceEdited?null:p.richDoc):(state.richChanged?richJSON(richEditor):p.richDoc);
 p.title=$('#page-title').value.trim()||'صفحة بدون عنوان';
 p.body=body;p.richDoc=documentJSON;p.updatedAt=Date.now();
 await put('pages',{...p});
 if(state.activePage!==p.id)return;
 if(v===editVersion){
   state.sourceEdited=false;state.richChanged=false;
   $('#save-status').innerHTML=icon('check',15)+' محفوظ';
   $('#save-status').classList.remove('pending');
 }
 $('#crumb-page').textContent=p.title;
 renderNav();
}
function queueSave(){
 editVersion++;markUnsaved();updateStats();
 clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>saveCurrent().catch(e=>toast('تعذر الحفظ: '+e.message,'error')),SAVE_DELAY);
}
async function flush(){if(saveTimer){clearTimeout(saveTimer);saveTimer=null;await saveCurrent();}}
async function activatePage(pid){await flush();state.activePage=pid;localStorage.setItem('uspace-active-page',pid);renderNav();renderCurrent();toggleSidebar(false);}
async function activateSpace(sid){await flush();state.activeSpace=sid;state.activePage=state.pages.filter(p=>p.spaceId===sid).sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.id || null; if(!state.activePage)await addPage(); localStorage.setItem('uspace-active-space',sid);renderNav();renderCurrent();toggleSidebar(false);}
async function addSpace(){const name=prompt('اسم المساحة الجديدة؟','مشروعي الجديد');if(!name?.trim())return;const s={id:id(),name:name.trim().slice(0,70),instructions:'',createdAt:Date.now(),updatedAt:Date.now()};await put('spaces',s);state.spaces.push(s);await activateSpace(s.id);toast('تم إنشاء المساحة');}
async function addPage(){await flush();const now=Date.now();const p={id:id(),spaceId:state.activeSpace,title:'صفحة بدون عنوان',body:'',instructions:'',createdAt:now,updatedAt:now};await put('pages',p);state.pages.push(p);await activatePage(p.id);$('#page-title').focus();}
function toggleSidebar(value){state.sidebarOpen=value;$('#sidebar').classList.toggle('open',value);$('#scrim').classList.toggle('show',value);}
function togglePanel(value){state.panelOpen=value;$('#right-panel').classList.toggle('open',value);if(value)renderModes();}
function renderModes(){
 $('#modes').innerHTML=Object.entries(modes).map(([key,m])=>`<button class="mode-btn ${state.mode===key?'chosen':''}" data-mode="${key}"><span class="mode-radio"></span><span><b>${m.name}</b><small>${m.description}</small></span></button>`).join('');
}
function showDialog(title, content, opts={}){
 const root=$('#dialog-root');root.innerHTML=`<div class="modal-backdrop" id="dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" class="modal"><div class="modal-top"><h2>${escapeHtml(title)}</h2><button id="dialog-close" class="icon-btn" title="إغلاق">${icon('close')}</button></div><div class="modal-content">${content}</div></section></div>`;
 $('#dialog-close').addEventListener('click',closeDialog);$('#dialog-backdrop').addEventListener('click',e=>{if(e.target.id==='dialog-backdrop')closeDialog();});
 opts.onOpen?.();
}
function closeDialog(){$('#dialog-root').innerHTML='';}
function pageInstructions(){const p=getPage();const space=getSpace();showDialog('تعليمات الصفحة',`<p class="dialog-description">تُرسل هذه التعليمات مع طلبات الذكاء الاصطناعي لهذه الصفحة فقط. ضع أسلوبك أو قواعد الرواية هنا.</p><label class="field-label" for="space-instructions">تعليمات المساحة (تنطبق على كل صفحاتها)</label><textarea id="space-instructions" class="dialog-textarea" placeholder="مثال: لا تختلق أي معلومة، حافظ على جميع قرارات المشروع...">${escapeHtml(space.instructions||'')}</textarea><label class="field-label" for="page-instructions">تعليمات خاصة بهذه الصفحة</label><textarea id="page-instructions" class="dialog-textarea" placeholder="مثال: لا تغير الحوارات، راجع تسلسل الأحداث...">${escapeHtml(p.instructions||'')}</textarea><div class="dialog-actions"><button id="instructions-save" class="run-btn">حفظ التعليمات</button></div>`,{onOpen:()=>$('#instructions-save').onclick=async()=>{space.instructions=$('#space-instructions').value.slice(0,1500);p.instructions=$('#page-instructions').value.slice(0,1500);await Promise.all([put('spaces',{...space}),put('pages',{...p})]);closeDialog();toast('تم حفظ التعليمات');}});}
function settings(){showDialog('إعدادات USPACE',`<p class="dialog-description">الصفحات تُحفظ محليًا عبر IndexedDB. لا توجد مزامنة سحابية حاليًا؛ نزّل نسخة احتياطية باستمرار.</p><div class="info-row">${icon('shield',20)}<span>يمكن إدخال مفتاح DeepSeek من لوحة المساعد دون وضعه في GitHub. افتراضيًا يبقى في ذاكرة الصفحة، مع حفظ محلي مشفر اختياري.</span></div><div class="info-row">${icon('book',20)}<span>يمكن تصدير واستيراد ملفات Markdown.</span></div><div class="dialog-actions"><button class="quiet-btn bordered" id="export-backup-modal">تصدير نسخة احتياطية</button></div>`,{onOpen:()=>$('#export-backup-modal').onclick=()=>{closeDialog();backup();}});}
function download(name,content,type='text/plain;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function backup(){await flush();const payload={format:'uspace-backup-v1',exportedAt:new Date().toISOString(),spaces:state.spaces,pages:state.pages};download(`USPACE-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2),'application/json');toast('تم تنزيل النسخة الاحتياطية');}
async function deleteCurrent(){const p=getPage();if(!confirm(`هل تريد حذف الصفحة «${p.title}» نهائيًا؟ نزّل نسخة احتياطية قبل الحذف إن لزم.`))return;clearTimeout(saveTimer);await clearPage(p.id);state.pages=state.pages.filter(x=>x.id!==p.id);const next=state.pages.find(x=>x.spaceId===state.activeSpace);state.activePage=next?.id||null;if(!next)await addPage();else await activatePage(next.id);toast('تم حذف الصفحة');}
async function snapshot(){const p=getPage();await put('revisions',{id:id(),pageId:p.id,title:p.title,body:p.body,createdAt:Date.now()});}
function showHistory(){const p=getPage();list('revisions').then(revs=>{const r=revs.filter(x=>x.pageId===p.id).sort((a,b)=>b.createdAt-a.createdAt).slice(0,20);showDialog('سجل النسخ السابقة',r.length?`<p class="dialog-description">يمكنك استرجاع نسخة محفوظة قبل أحد تعديلات الذكاء الاصطناعي.</p>${r.map((x,i)=>`<button class="history-item" data-rev="${x.id}"><span>${new Date(x.createdAt).toLocaleString('ar-SA')}</span><small>${escapeHtml(x.title)} · ${countText(x.body).words} كلمة</small></button>`).join('')}`:'<p class="dialog-description">لا توجد نسخ سابقة بعد. تُنشأ نسخة قبل كل تعديل يعتمد من الذكاء الاصطناعي.</p>',{onOpen:()=>{document.querySelectorAll('[data-rev]').forEach(el=>el.onclick=async()=>{const item=r.find(x=>x.id===el.dataset.rev);if(!confirm('استرجاع هذه النسخة؟ سيتم حفظ النسخة الحالية أولًا.'))return;await flush();await snapshot();$('#editor').value=item.body;$('#page-title').value=item.title;await saveCurrent();updateStats();syncPreview();closeDialog();toast('تم الاسترجاع');});}});}).catch(e=>toast(e.message,'error'));}
function renderAIResult(){
 const target=$('#ai-results'),a=state.ai;if(!a){target.innerHTML='';return;}
 const isStruct=a.mode==='structure',isImprove=a.mode==='improve';
 const body=isStruct?a.formatted:(a.result?.text||'');
 target.innerHTML=`<div class="result-head"><strong>${isStruct?'ترتيب مقترح':isImprove?'نسخة محسنة':'تقرير المراجعة'}</strong><span class="result-badge">${icon('check',13)} ${isStruct?'الأصل محفوظ حرفيًا':'مقترح فقط'}</span></div>${isStruct&&a.result.summary?`<p class="result-summary">${escapeHtml(a.result.summary)}</p>`:''}<div class="result-content" dir="auto">${escapeHtml(body)}</div><div class="result-actions"><button class="quiet-btn bordered" id="copy-result">${icon('copy',16)} نسخ</button>${a.mode!=='review'?`<button class="run-btn" id="apply-result">${icon('check',16)} اعتماد التعديل</button>`:''}</div>`;
 $('#copy-result').onclick=()=>navigator.clipboard.writeText(body).then(()=>toast('تم النسخ')).catch(()=>toast('تعذر النسخ','error'));
 if(a.mode!=='review')$('#apply-result').onclick=async()=>{const p=getPage();if(!p||p.id!==a.pageId||$('#editor').value!==a.original){toast('تغيّر النص بعد التحليل. أعد التحليل أولًا.','error');return;}await flush();await snapshot();$('#editor').value=body;queueSave();await flush();syncPreview();state.ai=null;target.innerHTML='<div class="ai-success">'+icon('check',20)+' تم اعتماد التعديل مع حفظ نسخة سابقة.</div>';toast('تم حفظ التعديل');};
}
async function runAI(){
 if(state.busy)return;
 await flush();const p=getPage();if(!p?.body.trim()){toast('اكتب نصًا أولًا قبل التحليل','error');return;}
 try{activateEnteredProviderKey();}catch(e){toast(e.message,'error');return;}
  const key=providerKey(),password=$('#access-key').value.trim();if(!key&&!password){toast('أدخل مفتاح DeepSeek API أو رمز Worker','error');$('#provider-key').focus();return;}
 state.model=$('#model').value;
 state.busy=true;const btn=$('#run-ai');btn.disabled=true;btn.innerHTML='<span class="spin"></span> جاري التحليل...';$('#ai-results').innerHTML='<p class="ai-wait">أراجع النص وأحافظ على الأصل كما هو...</p>';
 const instructions=[getSpace()?.instructions,p.instructions].filter(Boolean).join('\n');
 try{
  const res=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'X-Provider-Key':key}:{'X-Access-Key':password})},body:JSON.stringify({mode:state.mode,model:state.model,text:p.body,title:p.title,instructions})});
  const data=await res.json().catch(()=>({error:'رد غير مفهوم من الخادم'}));
  if(!res.ok||!data.ok)throw Error(data.error||`خطأ ${res.status}`);
  let formatted='';if(state.mode==='structure')formatted=insertHeadings(p.body,data.result.headings);
  state.ai={mode:state.mode,original:p.body,pageId:p.id,formatted,result:data.result};renderAIResult();
 }catch(e){$('#ai-results').innerHTML=`<p class="ai-error">${escapeHtml(e.message)}${String(e.message).includes('404')?' — شغّل المشروع باستخدام Cloudflare Worker وليس خادم Vite وحده.':''}</p>`;}
 finally{state.busy=false;btn.disabled=false;btn.innerHTML=`${icon('spark',18)} <span>تحليل الصفحة</span>`;}
}
function bind(){
 $('#add-space').onclick=()=>addSpace().catch(e=>toast(e.message,'error'));
 $('#add-page').onclick=()=>addPage().catch(e=>toast(e.message,'error'));
 $('#spaces-list').onclick=e=>{const el=e.target.closest('[data-space]');if(el)activateSpace(el.dataset.space).catch(err=>toast(err.message,'error'));};
 $('#pages-list').onclick=e=>{const el=e.target.closest('[data-page]');if(el)activatePage(el.dataset.page).catch(err=>toast(err.message,'error'));};
 $('#editor').oninput=queueSave;$('#page-title').oninput=queueSave;
 $('#search').oninput=e=>{state.search=e.target.value;renderNav();};
 $('#preview-btn').onclick=()=>{state.preview=!state.preview;syncPreview();};
 $('#assistant-btn').onclick=()=>togglePanel(true);$('#close-panel').onclick=()=>togglePanel(false);
 $('#modes').onclick=e=>{const el=e.target.closest('[data-mode]');if(el){state.mode=el.dataset.mode;renderModes();}};
 $('#model').onchange=e=>state.model=e.target.value;
 $('#access-key').value='';
 $('#run-ai').onclick=()=>runAI();
  $('#editor-font').onchange=e=>{const p=getPage();if(p){p.fontFamily=e.target.value;renderEditorTypography();queueSave();}};
  $('#editor-size').onchange=e=>{const p=getPage();if(p){p.fontSize=Number(e.target.value);renderEditorTypography();queueSave();}};
  $('.format-toolbar').onclick=e=>{const button=e.target.closest('[data-format]');if(button)applyFormat(button.dataset.format);};
  $('#activate-provider-key').onclick=()=>{try{activateEnteredProviderKey();toast('تم تفعيل المفتاح');}catch(e){toast(e.message,'error');}};
  $('#lock-provider-key').onclick=()=>{lockProviderKey();$('#provider-key').value='';refreshProviderKeyStatus();toast('تم قفل المفتاح');};
  $('#remember-provider-key').onclick=async()=>{try{activateEnteredProviderKey();await saveEncryptedProviderKey($('#key-passphrase').value);$('#key-passphrase').value='';await refreshProviderKeyStatus();toast('تم حفظ المفتاح مشفرًا على جهازك');}catch(e){toast(e.message,'error');}};
  $('#unlock-provider-key').onclick=async()=>{try{await unlockProviderKey($('#key-passphrase').value);$('#key-passphrase').value='';await refreshProviderKeyStatus();toast('تم فتح الخزنة');}catch(e){toast(e.message,'error');}};
  $('#forget-provider-key').onclick=async()=>{if(!confirm('حذف المفتاح المحفوظ وقفل المفتاح النشط؟'))return;try{await forgetProviderKey();$('#provider-key').value='';$('#key-passphrase').value='';await refreshProviderKeyStatus();toast('تم حذف المفتاح المحلي');}catch(e){toast(e.message,'error');}};
  refreshProviderKeyStatus();
 $('#instructions-btn').onclick=pageInstructions;
 $('#settings-btn').onclick=settings;
 $('#backup-btn').onclick=()=>backup().catch(e=>toast(e.message,'error'));
 $('#export-md-btn').onclick=async()=>{await flush();const p=getPage();download(`${fileName(p.title)}.md`,p.body,'text/markdown;charset=utf-8');toast('تم تنزيل Markdown');};
 $('#import-btn').onclick=()=>$('#file-input').click();
 $('#file-input').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2_000_000){toast('الحد الأقصى للملف 2 ميغابايت','error');e.target.value='';return;}const body=await f.text();await addPage();$('#page-title').value=f.name.replace(/\.(md|markdown|txt)$/i,'');$('#editor').value=body;await saveCurrent();updateStats();toast('تم استيراد الملف');e.target.value='';};
 $('#more-btn').onclick=()=>showDialog('إدارة الصفحة',`<p class="dialog-description">نسخ واسترجاع أو حذف الصفحة الحالية.</p><div class="dialog-actions"><button id="history-btn" class="quiet-btn bordered">${icon('history',17)} سجل النسخ</button><button id="delete-page-btn" class="danger-btn">${icon('trash',17)} حذف الصفحة</button></div>`,{onOpen:()=>{$('#history-btn').onclick=()=>{closeDialog();showHistory();};$('#delete-page-btn').onclick=()=>{closeDialog();deleteCurrent();};}});
 $('#open-sidebar').onclick=()=>toggleSidebar(true);$('#close-sidebar').onclick=()=>toggleSidebar(false);$('#scrim').onclick=()=>toggleSidebar(false);
 document.addEventListener('keydown',e=>{const cmd=e.ctrlKey||e.metaKey;if(cmd&&e.key.toLowerCase()==='s'){e.preventDefault();flush().then(()=>toast('تم الحفظ'));}if(cmd&&e.key.toLowerCase()==='k'){e.preventDefault();toggleSidebar(true);$('#search').focus();}if(cmd&&document.activeElement===$('#editor')&&['b','i'].includes(e.key.toLowerCase())){e.preventDefault();applyFormat(e.key.toLowerCase()==='b'?'bold':'italic');}if(e.key==='Escape'){closeDialog();togglePanel(false);toggleSidebar(false);}});
 window.addEventListener('pagehide',()=>{if(saveTimer){clearTimeout(saveTimer);const p=getPage();if(p){p.body=$('#editor').value;p.title=$('#page-title').value||'صفحة بدون عنوان';put('pages',{...p});}}});
}
async function start(){
 try{
 const data=await bootstrap();state.spaces=data.spaces;state.pages=data.pages;
 state.activeSpace=state.spaces.some(s=>s.id===localStorage.getItem('uspace-active-space'))?localStorage.getItem('uspace-active-space'):state.spaces[0].id;
 state.activePage=state.pages.some(p=>p.id===localStorage.getItem('uspace-active-page')&&p.spaceId===state.activeSpace)?localStorage.getItem('uspace-active-page'):(state.pages.filter(p=>p.spaceId===state.activeSpace).sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.id);
 renderShell();if('serviceWorker' in navigator && import.meta.env.PROD)navigator.serviceWorker.register('/sw.js').catch(()=>{});
 }catch(e){document.querySelector('#app').innerHTML=`<div class="load-error"><h1>تعذر تشغيل USPACE</h1><p>${escapeHtml(e.message)}</p><p>تأكد أن متصفحك يسمح بالتخزين المحلي.</p></div>`;}
}
start();
