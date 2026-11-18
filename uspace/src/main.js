import './style.css';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { validateBackup } from './backup.js';
import { mountRichEditor, loadRichDocument, richMarkdown, richJSON, richHTML, richAction, selectionFormatting } from './rich-editor.js';
import { bootstrap, list, put, remove, clearPage, importBackupRows } from './storage.js';
import {countText, insertHeadings, markdownToHtml, escapeHtml, fileName} from './format.js';
import {fontOptionsHtml, pageFontFamily, fontStack, loadArabicFont, loadDocumentFonts} from './fonts.js';
import {MODE_ORDER,normalizeModeSelection,preservationReport,labelForMode} from './ai-operations.js';
import {extractTags,extractWikiLinks,linkedPageIds,backlinksFor,rankPages,graphForSpace,dailyTitle,PAGE_TEMPLATES} from './knowledge.js';
import {providerKey, setProviderKey, lockProviderKey, savedProviderKeyExists, saveEncryptedProviderKey, unlockProviderKey, forgetProviderKey} from './keyring.js';

const $ = sel => document.querySelector(sel);
const state = { spaces:[], pages:[], activeSpace:null, activePage:null, mode:'ideas', selectedModes:['ideas'], aiBatch:null, aiAbort:null, model:'deepseek-flash', preview:false, sourceMode:false, sourceEdited:false, richChanged:false, sidebarOpen:false, panelOpen:false, search:'', ai:null, busy:false, saving:false, toastTimer:null };
const SAVE_DELAY = 450;
let saveTimer, revisionTimer, richEditor, loadingRich=false;
let richSnapshotPage=null, richSnapshotAt=0, pendingRichSnapshot=Promise.resolve(), lastSnapshotError=null;
const modes = {ideas:{name:'ترتيب الأفكار',description:'أرتّب كلامك أنت بعناوين هاشتاق وفقرات وقوائم من دون إضافة أفكار أو تغيير أسلوبك.'},structure:{name:'عناوين فقط',description:'أضيف عناوين مناسبة حول فقراتك، مع فحص آلي يثبت أن النص الأصلي لم يتغير.'},improve:{name:'تحسين الأسلوب',description:'أقترح نسخة أوضح تحافظ على المعنى. النص الأصلي لا يتغير إلا بموافقتك.'},review:{name:'نقد + نسخة مصححة',description:'أكشف المشاكل أولًا ثم أعطيك النص كاملًا بعد إصلاح ما كشفه النقد.'},proofread:{name:'تصحيح إملائي',description:'أصحح الأخطاء الإملائية والنحوية فقط مع حفظ الأصل.'},prompt:{name:'برومبت تنفيذي',description:'أحوّل فكرتك لأمر قابل للتنفيذ مع خطة ومعايير قبول، لا مجرد تلخيص.'},analyze:{name:'تحليل هندسي',description:'أستخرج الأسباب المحتملة والأولويات وخطوات التنفيذ واختبارات منع التراجع.'},custom:{name:'نفّذ طلبي',description:'اكتب أمرك الخاص وسأنفّذه على الصفحة دون إجابة نمطية.'}};

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
  <div class="scrim" id="scrim"></div><div class="panel-scrim" id="panel-scrim"></div>
  <aside class="sidebar" id="sidebar" aria-label="المكتبة: المساحات والصفحات">
    <div class="brand"><div class="brand-mark" aria-label="USPACE"><img class="brand-logo" src="/icons/icon.svg" alt="شعار USPACE الثابت" width="42" height="42"/></div><div class="brand-title"><b>USPACE</b><span>YOUR KNOWLEDGE STUDIO · v0.4</span></div><button type="button" class="icon-btn mobile-close" id="close-sidebar" title="إغلاق المكتبة" aria-label="إغلاق المكتبة">${icon('close')}</button></div>
    <div class="workspace-label">مساحات العمل <button class="icon-btn small" id="add-space" title="إنشاء مساحة">${icon('plus',17)}</button></div>
    <div id="spaces-list" class="spaces-list"></div>
    <div class="sidebar-separator"></div>
    <div class="pages-head"><span>الصفحات <b id="page-count">0</b></span><button class="icon-btn small" id="add-page" title="صفحة جديدة">${icon('plus',17)}</button></div>
    <label class="search-wrap">${icon('search',17)}<input id="search" type="search" placeholder="ابحث في صفحاتك..." autocomplete="off" aria-label="البحث في الصفحات"/><span>⌘K</span></label>
    <div class="pages-list" id="pages-list"></div>
    <div class="sidebar-foot"><div class="local-status"><span class="local-dot"></span>محفوظ على هذا الجهاز</div><button class="sidebar-action" id="backup-btn">${icon('download',17)} تصدير نسخة احتياطية</button><button class="sidebar-action" id="import-btn">${icon('upload',17)} استيراد Markdown</button><button class="sidebar-action" id="restore-backup-btn">${icon('history',17)} استعادة نسخة JSON</button><button class="sidebar-action" id="settings-btn">${icon('settings',17)} الإعدادات والاتصال</button></div>
  </aside>
  <main class="main">
    <header class="topbar"><div class="breadcrumbs"><button type="button" class="icon-btn mobile-menu" id="open-sidebar" title="فتح المكتبة والصفحات" aria-label="فتح المكتبة والصفحات" aria-controls="sidebar" aria-expanded="false">${icon('menu')}<span class="sidebar-open-label">المكتبة</span></button><span id="crumb-space">مساحتي</span><span class="crumb-slash">/</span><strong id="crumb-page">ملاحظة جديدة</strong></div>
      <div class="top-actions"><button type="button" class="icon-btn theme-switch" id="theme-btn" title="تبديل الوضع الفاتح والداكن" aria-label="تبديل السمة">☾</button><button type="button" class="icon-btn favorite-switch" id="favorite-btn" title="تثبيت الصفحة في المفضلة" aria-label="تثبيت الصفحة">☆</button><span class="save-indicator" id="save-status">${icon('check',15)} محفوظ</span><button class="quiet-btn" id="source-btn" title="عرض وتحرير Markdown">MD<span class="desktop-label"> المصدر</span></button><button class="quiet-btn" id="preview-btn">${icon('eye',17)}<span>معاينة</span></button><button class="accent-btn" id="assistant-btn">${icon('spark',18)}<span>المساعد الذكي</span></button></div></header>
    <div class="editor-scroll"><article class="editor-paper"><div class="eyebrow">مساحة للكتابة والتفكير</div><input id="page-title" class="page-title" aria-label="عنوان الصفحة" placeholder="صفحة بدون عنوان" maxlength="200"/><div class="page-meta"><span id="modified-label">آخر تعديل الآن</span><span class="meta-circle">●</span><span>Markdown</span><span class="meta-circle">●</span><span>خصوصي على جهازك</span></div>
    <div class="editor-rule"></div><div class="format-toolbar" role="toolbar" aria-label="تنسيق المستند">
      <select id="editor-font" aria-label="خط المستند" title="خط المستند">${fontOptionsHtml()}</select>
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
      <button type="button" data-format="image" title="إضافة صورة من رابط HTTPS">صورة</button>
      <select id="selection-font" aria-label="خط النص المحدد" title="خط التحديد">${fontOptionsHtml(true)}</select>
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
    <textarea id="editor" class="hidden" spellcheck="true" dir="auto" aria-label="مصدر Markdown" placeholder="اكتب Markdown هنا..."></textarea><div id="preview" class="markdown-preview hidden"></div><section id="doc-context" class="doc-context" aria-label="روابط ووسوم المستند"></section>
    </article></div>
    <footer class="editor-footer"><div class="count-line"><span id="word-count">0 كلمة</span><span id="char-count">0 حرف</span><span id="sentence-count">0 جملة</span></div><div class="footer-tools"><button class="text-btn" id="instructions-btn">${icon('settings',16)} تعليمات الصفحة</button><button class="text-btn" id="export-md-btn">${icon('download',16)} تنزيل MD</button><button class="text-btn" id="export-html-btn">${icon('download',16)} HTML</button><button class="icon-btn" id="more-btn" title="حذف الصفحة">${icon('trash',17)}</button></div></footer>
  </main>
  <aside class="right-panel" id="right-panel"><div class="panel-header"><div><span class="panel-kicker">USPACE INTELLIGENCE</span><h2>${icon('spark',22)} مساعد الكتابة</h2></div><button class="icon-btn" id="close-panel" aria-label="إغلاق المساعد">${icon('close')}</button></div>
  <div class="panel-body"><div class="panel-note">مساحتك للتفكير والتنظيم. اختر عملية واحدة أو عدة عمليات، وسأعطيك نتائج مستقلة مع الحفاظ على مستندك.</div><div class="mode-choice-head"><label class="field-label" id="modes-label">اختر أكثر من عملية</label><span class="selected-mode-count" id="selected-mode-count">عملية واحدة</span></div><div class="mode-options" id="modes" role="group" aria-labelledby="modes-label"></div><p class="mode-cost-hint" id="mode-cost-hint">تُرسل كل عملية كطلب منفصل إلى DeepSeek.</p>
  <label class="field-label" id="ai-command-label" for="ai-command">أمرك للمساعد في هذه العملية (اختياري)</label>
  <textarea id="ai-command" class="ai-command-input" rows="4" maxlength="3000" dir="auto" spellcheck="true" placeholder="مثال: حلل خطة فانتارا هندسيًا وقدم معالجة للأسباب الجذرية واختبارات قبول واضحة دون إضافة أي مزايا."></textarea>
  <div class="command-presets" aria-label="أوامر جاهزة"><button type="button" data-ai-preset="root">أسباب جذرية</button><button type="button" data-ai-preset="plan">خطة تنفيذ واختبار</button><button type="button" data-ai-preset="constraints">التزم بالقيود</button></div>
  <label class="field-label" for="ai-depth">عمق المعالجة</label>
  <select id="ai-depth" class="field-input" aria-describedby="ai-depth-hint">
    <option value="quick">سريع — نتيجة مختصرة</option>
    <option value="standard" selected>عملي — إجابة مفصلة</option>
    <option value="deep">تفكير عميق — أبطأ وقد يستهلك رموزًا أكثر</option>
  </select>
  <div class="field-help" id="ai-depth-hint">التفكير العميق مناسب لتشخيص الأنظمة ووضع الخطط. تكلفته ومدة استجابته أعلى بحسب استخدام DeepSeek.</div>
  <label class="field-label" for="model">النموذج</label><select id="model" class="field-input"><option value="deepseek-flash">DeepSeek V4.1 Flash</option><option value="deepseek-v4-pro">DeepSeek V4 Pro</option></select>
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
  <div class="ai-run-actions"><button class="run-btn" id="run-ai">${icon('spark',18)} <span>نفّذ العمليات المختارة</span></button><button class="quiet-btn bordered hidden" type="button" id="cancel-ai">إيقاف</button></div><div id="ai-results" class="ai-results" aria-live="polite"></div></div></aside>
  <div id="dialog-root"></div><div class="toast" id="toast" role="status" aria-live="polite"></div><input id="file-input" type="file" accept=".md,.markdown,text/markdown,text/plain" hidden/><input id="backup-input" type="file" accept=".json,application/json" hidden/>
  </div>`;
 if(richEditor)richEditor.destroy();
 richEditor=mountRichEditor($('#rich-editor'),()=>{
   if(loadingRich || state.sourceMode)return;
   const p=getPage(),now=Date.now();
   if(p && (richSnapshotPage!==p.id || now-richSnapshotAt>60000)){
     richSnapshotPage=p.id;richSnapshotAt=now;lastSnapshotError=null;
     pendingRichSnapshot=snapshot().catch(e=>{lastSnapshotError=e;toast('تعذر حفظ نسخة قبل التعديل','error');});
   }
   state.richChanged=true;queueSave();
 },()=>updateRichToolbar());
 bind();renderNav();renderCurrent();renderModes();
}
function renderNav(){
 const s=$('#spaces-list');
 s.innerHTML=state.spaces.map(sp=>'<button type="button" data-space="'+sp.id+'" class="space-option'+(sp.id===state.activeSpace?' selected':'')+'"><span class="space-icon">'+icon('book',17)+'</span><span>'+escapeHtml(sp.name)+'</span>'+(sp.id===state.activeSpace?icon('chevron',16):'')+'</button>').join('');
 const term=state.search.trim();
 const currentPages=state.pages.filter(p=>p.spaceId===state.activeSpace);
 const shown=rankPages(state.pages,term,state.activeSpace);
 $('#page-count').textContent=term?shown.length:currentPages.length;
 const pageRow=p=>'<button type="button" data-page="'+p.id+'" class="page-option'+(p.id===state.activePage?' active':'')+'" title="'+escapeHtml(p.title||'بدون عنوان')+'"><span class="page-line">'+(p.favorite?'★ ':icon('file',16))+'<span class="page-item-title">'+escapeHtml(p.title||'صفحة بدون عنوان')+'</span></span><span class="page-date">'+fmtDate(p.updatedAt)+'</span></button>';
 $('#pages-list').innerHTML=shown.length?shown.map(pageRow).join(''):'<p class="empty-nav">لا توجد صفحات مطابقة.</p>';
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
 richSnapshotPage=null;richSnapshotAt=0;lastSnapshotError=null;pendingRichSnapshot=Promise.resolve();
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
 $('#ai-results').innerHTML='';state.ai=null;state.aiBatch=null;
 renderKnowledgeContext();updateFavoriteButton();
}
function syncPreview(){
 const source=state.sourceMode&&!state.preview;
 $('#editor').classList.toggle('hidden',!source);
 $('#rich-editor').classList.toggle('hidden',state.sourceMode||state.preview);
 $('#preview').classList.toggle('hidden',!state.preview);
 if(state.preview){
   const html=state.sourceMode?marked.parse($('#editor').value,{gfm:true,breaks:false}):richHTML(richEditor);
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
   if(getPage()?.richDoc){
     await snapshot();
     toast('Markdown لا يستطيع حفظ دمج الخلايا والألوان. حُفظت نسخة Rich Text للاسترجاع.');
   }
   state.sourceMode=true;state.sourceEdited=false;
   $('#editor').value=getPage()?.body||'';
 }else{
   if(state.sourceEdited||!getPage()?.richDoc){
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
 const font=pageFontFamily(p.fontFamily);
 const size=[14,16,18,20,24].includes(Number(p.fontSize))?Number(p.fontSize):16;
 const paper=$('.editor-paper');
 paper.dataset.font=font;
 paper.style.setProperty('--editor-body-size',size+'px');
 paper.style.setProperty('--editor-font-family',fontStack(font));
 loadArabicFont(font);
 loadDocumentFonts(p.richDoc);
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
   }else if(kind==='image'){
     const input=prompt('رابط الصورة HTTPS','https://');
     if(input===null)return;
     try{
       const url=new URL(input.trim());
       if(url.protocol!=='https:')throw Error('Only HTTPS');
       const alt=prompt('وصف الصورة لسهولة الوصول','')||'';
       richAction(richEditor,'image',{src:url.href,alt});
     }catch{toast('أدخل رابط صورة HTTPS صالح','error');}
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
  case 'image':{
    const address=prompt('رابط الصورة HTTPS','https://');if(!address)return;
    let url;try{url=new URL(address);if(url.protocol!=='https:')return;}catch{return;}
    const alt=prompt('وصف الصورة','')||'';
    content='!['+alt.replaceAll(']','')+']('+url.href+')';break;
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
 await pendingRichSnapshot;
 if(lastSnapshotError)throw new Error('تعذر حفظ نسخة سابقة، لم يُحفظ التعديل لحماية بياناتك.');
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
 renderNav();renderKnowledgeContext();
}
function queueSave(){
 editVersion++;markUnsaved();updateStats();
 clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>saveCurrent().catch(e=>toast('تعذر الحفظ: '+e.message,'error')),SAVE_DELAY);
}
async function flush(){if(saveTimer){clearTimeout(saveTimer);saveTimer=null;await saveCurrent();}}
async function activatePage(pid){await flush();const page=state.pages.find(p=>p.id===pid);if(!page)throw Error('الصفحة غير موجودة');state.activePage=pid;if(state.activeSpace!==page.spaceId){state.activeSpace=page.spaceId;localStorage.setItem('uspace-active-space',page.spaceId);}localStorage.setItem('uspace-active-page',pid);renderNav();renderCurrent();toggleSidebar(false);}
async function activateSpace(sid){await flush();state.activeSpace=sid;state.activePage=state.pages.filter(p=>p.spaceId===sid).sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.id || null; if(!state.activePage)await addPage(); localStorage.setItem('uspace-active-space',sid);renderNav();renderCurrent();toggleSidebar(false);}
async function addSpace(){const name=prompt('اسم المساحة الجديدة؟','مشروعي الجديد');if(!name?.trim())return;const s={id:id(),name:name.trim().slice(0,70),instructions:'',createdAt:Date.now(),updatedAt:Date.now()};await put('spaces',s);state.spaces.push(s);await activateSpace(s.id);toast('تم إنشاء المساحة');}
async function addPage(template='blank',customTitle='صفحة بدون عنوان'){await flush();const now=Date.now();const body=PAGE_TEMPLATES[template]?.body||'';const p={id:id(),spaceId:state.activeSpace,title:customTitle,body,richDoc:null,instructions:'',favorite:false,createdAt:now,updatedAt:now};await put('pages',p);state.pages.push(p);await activatePage(p.id);if(template==='blank')$('#page-title').focus();}
function toggleSidebar(value){
 if(value&&state.panelOpen)togglePanel(false);
 state.sidebarOpen=value;
 $('#sidebar').classList.toggle('open',value);
 $('#scrim').classList.toggle('show',value);
 $('#open-sidebar')?.setAttribute('aria-expanded',String(value));
}
function togglePanel(value){
   if(value&&state.sidebarOpen)toggleSidebar(false);
   state.panelOpen=value;
   $('#right-panel').classList.toggle('open',value);
   $('#panel-scrim').classList.toggle('show',value);
   $('#assistant-btn').setAttribute('aria-expanded',String(value));
   if(value)renderModes();
 }
function renderModes(){
 const current=new Set(state.selectedModes);
 $('#modes').innerHTML=MODE_ORDER.map(key=>{
   const m=modes[key];
   if(!m)return '';
   const checked=current.has(key);
   return '<label class="mode-btn mode-multi'+(checked?' chosen':'')+'" data-option="'+key+'"><input type="checkbox" class="mode-checkbox" data-mode="'+key+'" value="'+key+'" '+(checked?'checked':'')+' aria-label="'+escapeHtml(m.name)+'"/><span class="mode-checkbox-mark" aria-hidden="true">'+(checked?icon('check',14):'')+'</span><span><b>'+escapeHtml(m.name)+'</b><small>'+escapeHtml(m.description)+'</small></span></label>';
 }).join('');
 const command=$('#ai-command'),label=$('#ai-command-label'),custom=current.has('custom');
 if(command&&label){
   label.textContent=custom?'ما الأمر الذي تريد تنفيذه؟ (مطلوب)':'أمرك الخاص لهذه العمليات (اختياري)';
   command.setAttribute('aria-required',String(custom));
   command.toggleAttribute('required',custom);
 }
 const n=current.size;
 $('#selected-mode-count').textContent=n===0?'لم تحدد عملية':n===1?'عملية واحدة':n+' عمليات';
 $('#mode-cost-hint').textContent=n>1?'سيُرسل '+n+' طلبات منفصلة إلى DeepSeek، كل عملية بنتيجتها وتكلفتها.':'كل عملية تستخدم طلب DeepSeek واحدًا؛ يبقى المستند دون تغيير حتى توافق.';
 const button=$('#run-ai');
 if(button&&!state.busy)button.disabled=n===0;
}
function showDialog(title, content, opts={}){
 const root=$('#dialog-root');root.innerHTML=`<div class="modal-backdrop" id="dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" class="modal"><div class="modal-top"><h2>${escapeHtml(title)}</h2><button id="dialog-close" class="icon-btn" title="إغلاق">${icon('close')}</button></div><div class="modal-content">${content}</div></section></div>`;
 $('#dialog-close').addEventListener('click',closeDialog);$('#dialog-backdrop').addEventListener('click',e=>{if(e.target.id==='dialog-backdrop')closeDialog();});
 opts.onOpen?.();
}
function closeDialog(){$('#dialog-root').innerHTML='';}
function updateFavoriteButton(){
 const p=getPage(),button=$('#favorite-btn');
 if(!button)return;
 const marked=Boolean(p?.favorite);
 button.textContent=marked?'★':'☆';
 button.title=marked?'إزالة من المفضلة':'إضافة للمفضلة';
 button.setAttribute('aria-label',button.title);
 button.setAttribute('aria-pressed',String(marked));
 button.classList.toggle('is-active',marked);
}
async function toggleFavoritePage(){
 const p=getPage();if(!p)return;
 p.favorite=!p.favorite;
 await put('pages',{...p});
 renderNav();updateFavoriteButton();
 toast(p.favorite?'تم تثبيت الصفحة في المفضلة':'أُزيلت الصفحة من المفضلة');
}
function renderKnowledgeContext(){
 const root=$('#doc-context'),p=getPage();if(!root||!p)return;
 const body=currentDocumentBody(),tags=extractTags(body),titles=extractWikiLinks(body);
 const inLinks=backlinksFor(p,state.pages).slice(0,8);
 const linked=state.pages.filter(page=>page.spaceId===p.spaceId);
 const targetByTitle=new Map(linked.map(page=>[(page.title||'').trim().toLowerCase(),page]));
 const links=titles.map(title=>({title,page:targetByTitle.get(title.toLowerCase())}));
 root.innerHTML='<div class="knowledge-head">'+icon('book',16)+'<span>معرفة مرتبطة</span><small>الوسوم · الروابط · الإشارات</small></div>'+
  '<div class="knowledge-row"><b>الوسوم</b><div class="knowledge-chips">'+(tags.length?tags.map(tag=>'<button type="button" data-tag-filter="'+escapeHtml(tag)+'" class="knowledge-chip tag">#'+escapeHtml(tag)+'</button>').join(''):'<span class="knowledge-empty">اكتب #وسم داخل الصفحة</span>')+'</div></div>'+
  '<div class="knowledge-row"><b>الروابط</b><div class="knowledge-chips">'+(links.length?links.map(link=>'<button type="button" class="knowledge-chip'+(link.page?'':' unlinked')+'" '+(link.page?'data-open-page="'+link.page.id+'"':'data-create-wikilink="'+escapeHtml(link.title)+'"')+'>'+icon('file',13)+escapeHtml(link.title)+(link.page?'':' +')+'</button>').join(''):'<span class="knowledge-empty">اربط الصفحات بـ [[اسم الصفحة]]</span>')+'</div></div>'+
  (inLinks.length?'<div class="knowledge-row"><b>يشير إلى هذه الصفحة</b><div class="knowledge-chips">'+inLinks.map(page=>'<button type="button" class="knowledge-chip" data-open-page="'+page.id+'">'+icon('file',13)+escapeHtml(page.title)+'</button>').join('')+'</div></div>':'');
 root.onclick=async e=>{
   const target=e.target.closest('[data-open-page],[data-create-wikilink],[data-tag-filter]');
   if(!target)return;
   try{
     if(target.dataset.openPage)await activatePage(target.dataset.openPage);
     else if(target.dataset.createWikilink)await addPage('blank',target.dataset.createWikilink.slice(0,190));
     else if(target.dataset.tagFilter){state.search='#'+target.dataset.tagFilter;$('#search').value=state.search;renderNav();toggleSidebar(true);}
   }catch(error){toast(error.message,'error');}
 };
}
function setTheme(next){
 const theme=next==='dark'?'dark':'light';
 document.documentElement.dataset.theme=theme;
 try{localStorage.setItem('uspace-theme',theme);}catch{}
 const button=$('#theme-btn');
 if(button){button.textContent=theme==='dark'?'☀':'☾';button.setAttribute('aria-label',theme==='dark'?'تفعيل الوضع الفاتح':'تفعيل الوضع الداكن');button.title=button.getAttribute('aria-label');}
}
async function createDailyNote(){
 const title=dailyTitle();
 const page=state.pages.find(p=>p.spaceId===state.activeSpace&&p.title===title);
 if(page)await activatePage(page.id);else await addPage('note',title);
}
function showTemplates(){
 const html='<p class="dialog-description">اختر قالبًا لصفحة جديدة. كل شيء محفوظ محليًا ويمكن تعديله بعد الإنشاء.</p><div class="template-gallery">'+Object.entries(PAGE_TEMPLATES).map(([key,t])=>'<button type="button" data-template="'+key+'" class="template-card"><span>'+icon('file',21)+'</span><strong>'+escapeHtml(t.label)+'</strong><small>'+escapeHtml((t.body||'صفحة فارغة').replace(/[#\n*-]/g,' ').trim().slice(0,85))+'</small></button>').join('')+'</div>';
 showDialog('قوالب USPACE',html,{onOpen:()=>{
   document.querySelectorAll('[data-template]').forEach(button=>button.onclick=async()=>{
     const template=button.dataset.template;
     closeDialog();try{await addPage(template,template==='blank'?'صفحة بدون عنوان':PAGE_TEMPLATES[template].label);}catch(e){toast(e.message,'error');}
   });
 }});
}
function showGraph(){
 const data=graphForSpace(state.pages,state.activeSpace);
 if(!data.nodes.length){toast('لا توجد صفحات لعرضها','error');return;}
 const nodes=data.nodes.slice(0,36);
 const allowed=new Set(nodes.map(p=>p.id));
 const W=760,H=470,cx=W/2,cy=H/2;
 const pos=new Map();
 nodes.forEach((p,i)=>{
   const angle=(i*2.399963229728653)+Math.PI/4;
   const radius=nodes.length===1?0:Math.min(200,37+Math.sqrt(i)*31);
   pos.set(p.id,{x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius});
 });
 const edges=data.edges.filter(e=>allowed.has(e.source)&&allowed.has(e.target));
 const svg='<svg class="graph-lines" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'+edges.map(edge=>{
   const a=pos.get(edge.source),b=pos.get(edge.target);
   return '<path d="M '+a.x.toFixed(1)+' '+a.y.toFixed(1)+' L '+b.x.toFixed(1)+' '+b.y.toFixed(1)+'" fill="none" stroke="currentColor" stroke-opacity=".5" stroke-width="1.6"/>';
 }).join('')+'</svg>';
 const body='<p class="dialog-description">روابطك من نوع [[اسم الصفحة]] تُكوّن خريطة معرفة محلية. اختر عقدة لفتح صفحتها.</p><div class="knowledge-graph" dir="ltr">'+svg+nodes.map(page=>{
   const p=pos.get(page.id),active=page.id===state.activePage;
   return '<button type="button" data-graph-page="'+page.id+'" class="graph-node'+(active?' is-current':'')+'" style="left:'+(p.x/W*100).toFixed(2)+'%;top:'+(p.y/H*100).toFixed(2)+'%" title="'+escapeHtml(page.title)+'">'+escapeHtml(page.title.slice(0,22)||'صفحة')+'</button>';
 }).join('')+'</div><p class="graph-legend">'+nodes.length+' صفحة · '+edges.length+' روابط</p>';
 showDialog('خريطة المعرفة',body,{onOpen:()=>{
   document.querySelectorAll('[data-graph-page]').forEach(button=>button.onclick=async()=>{closeDialog();try{await activatePage(button.dataset.graphPage);}catch(e){toast(e.message,'error');}});
 }});
}
function openQuickSwitcher(){
 showDialog('انتقل إلى صفحة', '<label class="field-label" for="quick-query">ابحث باسم الصفحة أو نصها أو الوسم</label><input id="quick-query" type="search" class="field-input quick-search" placeholder="ابحث عن أي صفحة..." autocomplete="off"/><div class="quick-results" id="quick-results" role="listbox"></div>',{onOpen:()=>{
   const field=$('#quick-query'),results=$('#quick-results');
   const display=()=>{
     const found=rankPages(state.pages,field.value).slice(0,12);
     results.innerHTML=found.length?found.map(page=>'<button type="button" role="option" data-quick-page="'+page.id+'" class="quick-item"><span>'+icon('file',17)+'</span><span><b>'+escapeHtml(page.title||'صفحة بدون عنوان')+'</b><small>'+escapeHtml(state.spaces.find(s=>s.id===page.spaceId)?.name||'مساحة')+'</small></span>'+(page.favorite?'★':'')+'</button>').join(''):'<p class="dialog-description">لم تُعثر على صفحات مطابقة.</p>';
   };
   results.onclick=async e=>{
     const button=e.target.closest('[data-quick-page]');if(!button)return;
     closeDialog();try{await activatePage(button.dataset.quickPage);}catch(error){toast(error.message,'error');}
   };
   field.oninput=display;
   field.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();results.querySelector('[data-quick-page]')?.click();}};
   display();field.focus();
 }});
}
function pageInstructions(){const p=getPage();const space=getSpace();showDialog('تعليمات الصفحة',`<p class="dialog-description">تُرسل هذه التعليمات مع طلبات الذكاء الاصطناعي لهذه الصفحة فقط. ضع أسلوبك أو قواعد الرواية هنا.</p><label class="field-label" for="space-instructions">تعليمات المساحة (تنطبق على كل صفحاتها)</label><textarea id="space-instructions" class="dialog-textarea" placeholder="مثال: لا تختلق أي معلومة، حافظ على جميع قرارات المشروع...">${escapeHtml(space.instructions||'')}</textarea><label class="field-label" for="page-instructions">تعليمات خاصة بهذه الصفحة</label><textarea id="page-instructions" class="dialog-textarea" placeholder="مثال: لا تغير الحوارات، راجع تسلسل الأحداث...">${escapeHtml(p.instructions||'')}</textarea><div class="dialog-actions"><button id="instructions-save" class="run-btn">حفظ التعليمات</button></div>`,{onOpen:()=>$('#instructions-save').onclick=async()=>{space.instructions=$('#space-instructions').value.slice(0,1500);p.instructions=$('#page-instructions').value.slice(0,1500);await Promise.all([put('spaces',{...space}),put('pages',{...p})]);closeDialog();toast('تم حفظ التعليمات');}});}
function settings(){showDialog('إعدادات USPACE',`<p class="dialog-description">الصفحات محفوظة على جهازك عبر IndexedDB. أنشئ نسخة احتياطية بانتظام.</p><div class="info-row">${icon('shield',20)}<span>مفتاح DeepSeek يبقى في ذاكرة الصفحة افتراضيًا ويمكن حفظه مشفرًا بشكل اختياري.</span></div><div class="info-row">${icon('book',20)}<span>يمكن تصدير واستيراد المستندات بصيغة Markdown.</span></div><div class="dialog-actions"><button class="quiet-btn bordered" id="export-backup-modal">تصدير نسخة احتياطية</button></div><details class="settings-tools"><summary>أدوات إضافية (اختيارية)</summary><div class="settings-tool-actions"><button type="button" class="quiet-btn bordered" id="settings-quick">بحث سريع</button><button type="button" class="quiet-btn bordered" id="settings-daily">مذكرة اليوم</button><button type="button" class="quiet-btn bordered" id="settings-templates">القوالب</button><button type="button" class="quiet-btn bordered" id="settings-graph">خريطة المعرفة</button></div></details>`,{onOpen:()=>{
 $('#export-backup-modal').onclick=()=>{closeDialog();backup();};
 $('#settings-quick').onclick=()=>{closeDialog();openQuickSwitcher();};
 $('#settings-daily').onclick=()=>{closeDialog();createDailyNote().catch(e=>toast(e.message,'error'));};
 $('#settings-templates').onclick=()=>{closeDialog();showTemplates();};
 $('#settings-graph').onclick=()=>{closeDialog();showGraph();};
 }});}
function download(name,content,type='text/plain;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function backup(){await flush();const payload={format:'uspace-backup-v1',exportedAt:new Date().toISOString(),spaces:state.spaces,pages:state.pages};download(`USPACE-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2),'application/json');toast('تم تنزيل النسخة الاحتياطية');}
async function restoreBackup(file){
 if(!file||file.size>12_000_000)throw Error('حجم النسخة الاحتياطية كبير جدًا.');
 const parsed=validateBackup(await file.text());
 if(!parsed.spaces.length)throw Error('النسخة لا تحتوي على مساحات.');
 if(!confirm('سيتم استيراد '+parsed.spaces.length+' مساحة و'+parsed.pages.length+' صفحة كنسخة جديدة دون حذف صفحاتك الحالية. هل تريد المتابعة؟'))return;
 await flush();
 const mapping=new Map(), addedSpaces=[],addedPages=[];
 for(const item of parsed.spaces){
  const space={id:id(),name:item.name,instructions:item.instructions,createdAt:item.createdAt,updatedAt:Date.now()};
  mapping.set(item.originalId,space.id);
  addedSpaces.push(space);
 }
 for(const item of parsed.pages){
  const page={
   id:id(),spaceId:mapping.get(item.originalSpaceId),title:item.title,body:item.body,
   richDoc:item.richDoc,instructions:item.instructions,fontFamily:item.fontFamily,fontSize:item.fontSize,
   createdAt:item.createdAt,updatedAt:Date.now()
  };
  addedPages.push(page);
 }
 await importBackupRows(addedSpaces,addedPages);
 state.spaces.push(...addedSpaces);state.pages.push(...addedPages);
 await activateSpace(addedSpaces[0].id);
 toast('تم استيراد النسخة دون حذف الملفات الحالية');
}
async function deleteCurrent(){const p=getPage();if(!confirm(`هل تريد حذف الصفحة «${p.title}» نهائيًا؟ نزّل نسخة احتياطية قبل الحذف إن لزم.`))return;clearTimeout(saveTimer);await clearPage(p.id);state.pages=state.pages.filter(x=>x.id!==p.id);const next=state.pages.find(x=>x.spaceId===state.activeSpace);state.activePage=next?.id||null;if(!next)await addPage();else await activatePage(next.id);toast('تم حذف الصفحة');}
async function snapshot(){
 const p=getPage();if(!p)return;
 await put('revisions',{id:id(),pageId:p.id,title:p.title,body:p.body,richDoc:p.richDoc?structuredClone(p.richDoc):null,createdAt:Date.now()});
}
function showHistory(){
 const p=getPage();
 list('revisions').then(revs=>{
  const revisions=revs.filter(x=>x.pageId===p.id).sort((a,b)=>b.createdAt-a.createdAt).slice(0,40);
  showDialog('سجل النسخ السابقة',revisions.length
   ?'<p class="dialog-description">يمكن استرجاع Markdown والتنسيقات المرئية من النسخة المختارة. تُحفظ النسخة الحالية قبل الاسترجاع.</p>'+
    revisions.map(x=>'<button class="history-item" data-rev="'+x.id+'"><span>'+new Date(x.createdAt).toLocaleString('ar-SA')+
     '</span><small>'+escapeHtml(x.title)+' · '+countText(x.body).words+' كلمة'+(x.richDoc?' · Rich Text':'')+'</small></button>').join('')
   :'<p class="dialog-description">لا توجد نسخ سابقة بعد.</p>',
   {onOpen:()=>document.querySelectorAll('[data-rev]').forEach(el=>el.onclick=async()=>{
     const item=revisions.find(x=>x.id===el.dataset.rev);if(!item)return;
     if(!confirm('استرجاع هذه النسخة مع الاحتفاظ بالنسخة الحالية؟'))return;
     await flush();await snapshot();
     p.title=item.title;p.body=item.body;p.richDoc=item.richDoc||null;
     state.sourceEdited=false;state.richChanged=false;
     $('#page-title').value=p.title;
     $('#editor').value=p.body;
     loadingRich=true;
     try{loadRichDocument(richEditor,p);}
     finally{loadingRich=false;}
     await saveCurrent();syncPreview();updateStats();closeDialog();toast('تم الاسترجاع مع حفظ النسخة السابقة');
   })});
 }).catch(e=>toast(e.message,'error'));
}
function safeAIHtml(text){
 return DOMPurify.sanitize(marked.parse(String(text||''),{gfm:true,breaks:false}),{USE_PROFILES:{html:true}});
}
function renderAIResult(){
 const target=$('#ai-results'),batch=state.aiBatch;
 if(!batch){target.innerHTML='';return;}
 const progress=batch.results.filter(x=>x.status==='complete').length;
 const all=batch.results.length;
 const tabs='<div class="ai-result-tabs" role="tablist" aria-label="نتائج العمليات">'+batch.results.map((item,i)=>{
   const active=batch.activeIndex===i;
   const status=item.status==='complete'?'✓':item.status==='error'?'!':item.status==='running'?'◌':item.status==='cancelled'?'—':'·';
   return '<button type="button" role="tab" aria-selected="'+active+'" data-ai-tab="'+i+'" class="ai-result-tab'+(active?' active':'')+'" title="'+escapeHtml(labelForMode(item.mode))+'">'+status+' '+escapeHtml(labelForMode(item.mode))+'</button>';
 }).join('')+'</div>';
 const current=batch.results[batch.activeIndex]||batch.results[0];
 const title=current?labelForMode(current.mode):'النتائج';
 let body='';
 if(!current)body='';
 else if(current.status==='waiting')body='<p class="ai-wait">في الانتظار — هذه العملية لم تبدأ بعد.</p>';
 else if(current.status==='running')body='<p class="ai-wait"><span class="spin"></span> أعمل الآن على '+escapeHtml(title)+'...</p>';
 else if(current.status==='cancelled')body='<p class="ai-wait">أُوقفت هذه العملية دون نتيجة.</p>';
 else if(current.status==='error')body='<p class="ai-error">'+escapeHtml(current.error||'تعذر تنفيذ العملية')+'</p>';
 else if(current.status==='complete'){
   const mode=current.mode;
   const edited=mode==='review'?current.result.revisedText:mode==='structure'?current.formatted:(current.result.text||'');
   const canApply=['ideas','structure','improve','proofread','review'].includes(mode);
   const tokenWarning=current.finishReason==='length'?'<p class="ai-error">النتيجة غير مكتملة بسبب بلوغ حد الإخراج. لا تعتمدها قبل إعادة المحاولة.</p>':'';
   const coverage=mode==='ideas'?preservationReport(batch.original,edited):null;
   const preservation=coverage?'<div class="ai-source-integrity '+(coverage.passes?'ok':'warn')+'">'+(coverage.passes?'✓':'!')+' الحفاظ على كلمات الأصل: '+Math.round(coverage.coverage*100)+'٪'+(coverage.passes?'':' — يبدو أن أجزاء من كلامك فُقدت. امنع الاستبدال واحتفظ بالنص الأصلي.')+'</div>':'';
   const report=mode==='review'?'<section class="ai-review-section"><h4>ملاحظات النقد والإصلاح</h4><div class="result-content ai-markdown" dir="auto">'+safeAIHtml(current.result.critique||current.result.text)+'</div></section><section class="ai-review-section ai-fixed-draft"><h4>النص بعد تصحيح النقد</h4><div class="result-content ai-markdown" dir="auto">'+safeAIHtml(current.result.revisedText)+'</div></section>':'<div class="result-content ai-markdown" dir="auto">'+safeAIHtml(edited)+'</div>';
   const usage=current.usage?.completionTokens?'<p class="ai-usage">رموز الإخراج: '+Number(current.usage.completionTokens).toLocaleString('ar-SA')+'</p>':'';
   const safeToApply=canApply&&current.finishReason!=='length'&&(!coverage||coverage.passes);
   body='<div class="result-head"><strong>'+escapeHtml(title)+'</strong><span class="result-badge">'+(canApply?'مراجعة قبل الاعتماد':'نتيجة مستقلة')+'</span></div>'+
     tokenWarning+preservation+report+usage+
     '<div class="result-actions"><button type="button" class="quiet-btn bordered" data-ai-copy="main">نسخ النتيجة</button>'+
     (mode==='review'?'<button type="button" class="quiet-btn bordered" data-ai-copy="corrected">نسخ النص المصحح</button>':'')+
     '<button type="button" class="quiet-btn bordered" data-ai-save="new">حفظ في صفحة جديدة</button>'+
     (canApply?'<button type="button" class="run-btn" data-ai-apply="yes" '+(!safeToApply?'disabled title="النتيجة غير مكتملة أو لا تحفظ النص الأصلي"':'')+'>'+(mode==='review'?'اعتماد النسخة المصححة':'اعتماد النص المرتب')+'</button>':'')+'</div>';
 }
 const runningNote=batch.running?'<div class="ai-batch-progress"><span>'+progress+' من '+all+' عمليات اكتملت</span><div class="ai-batch-track"><span style="width:'+Math.round(progress/Math.max(1,all)*100)+'%"></span></div></div>':'';
 target.innerHTML=runningNote+tabs+'<div class="ai-result-panel" role="tabpanel">'+body+'</div>';
 target.onclick=async event=>{
   const tab=event.target.closest('[data-ai-tab]');
   if(tab){batch.activeIndex=Number(tab.dataset.aiTab);renderAIResult();return;}
   const item=batch.results[batch.activeIndex];
   if(!item||item.status!=='complete')return;
   const mode=item.mode;
   const edited=mode==='review'?item.result.revisedText:mode==='structure'?item.formatted:item.result.text;
   const copy=event.target.closest('[data-ai-copy]');
   if(copy){
     const text=copy.dataset.aiCopy==='corrected'?item.result.revisedText:mode==='review'?item.result.critique||item.result.text:edited;
     try{await navigator.clipboard.writeText(text);toast('تم نسخ النص');}catch{toast('تعذر النسخ','error');}
     return;
   }
   if(event.target.closest('[data-ai-save]')){
     try{
       await flush();
       const page=getPage(),now=Date.now();
       const text=mode==='review'?'# النقد\n\n'+item.result.critique+'\n\n# النص المصحح\n\n'+item.result.revisedText:edited;
       const title=(labelForMode(mode)+' — '+(page?.title||batch.title)).slice(0,190);
       const newPage={id:id(),spaceId:page?.spaceId||state.activeSpace,title,body:text,richDoc:null,instructions:'',createdAt:now,updatedAt:now};
       await put('pages',newPage);state.pages.push(newPage);await activatePage(newPage.id);togglePanel(false);
       toast('حُفظت النتيجة في صفحة منفصلة');
     }catch(e){toast('تعذر الحفظ: '+e.message,'error');}
     return;
   }
   if(event.target.closest('[data-ai-apply]')){
     if(!['ideas','structure','improve','proofread','review'].includes(mode))return;
     if(item.finishReason==='length'||(mode==='ideas'&&!preservationReport(batch.original,edited).passes))return;
     const page=getPage();
     if(!page||page.id!==batch.pageId||currentDocumentBody()!==batch.original){toast('تغيّر المستند بعد بدء العملية. أعِد التحليل أولًا.','error');return;}
     if(!confirm('اعتماد النص الجديد بدل الحالي؟ سنحفظ نسخة سابقة ويمكن استرجاعها.'))return;
     try{
       await flush();await snapshot();
       page.body=edited;page.richDoc=null;
       $('#editor').value=edited;
       state.sourceEdited=false;state.richChanged=false;
       if(!state.sourceMode){loadingRich=true;try{loadRichDocument(richEditor,page);}finally{loadingRich=false;}}
       editVersion++;await saveCurrent();
       syncPreview();updateStats();state.aiBatch=null;target.innerHTML='';
       toast('تم اعتماد النتيجة وحفظ نسخة من المستند الأصلي');
     }catch(e){toast('تعذر اعتماد النص: '+e.message,'error');}
   }
 };
}
async function runAI(){
 if(state.busy)return;
 const selected=MODE_ORDER.filter(mode=>state.selectedModes.includes(mode));
 const command=$('#ai-command').value.trim(),depth=$('#ai-depth').value;
 if(!selected.length){toast('اختر عملية واحدة على الأقل','error');return;}
 if(selected.includes('custom')&&!command){toast('اكتب الأمر الخاص بك أولًا','error');$('#ai-command').focus();return;}
 try{await flush();}catch(e){toast('تعذر حفظ الصفحة قبل التحليل: '+e.message,'error');return;}
 const p=getPage();if(!p)return;
 const text=currentDocumentBody();
 if(!text.trim()&&!command){toast('اكتب نصًا أو أمرًا أولًا','error');return;}
 try{activateEnteredProviderKey();}catch(e){toast(e.message,'error');return;}
 const key=providerKey(),password=$('#access-key').value.trim();
 if(!key&&!password){toast('فعّل مفتاح DeepSeek أو رمز Worker','error');$('#provider-key').focus();return;}
 const model=$('#model').value;
 const instructions=[getSpace()?.instructions,p.instructions].filter(Boolean).join('\n');
 const controller=new AbortController();
 state.aiAbort=controller;state.busy=true;state.model=model;
 state.aiBatch={pageId:p.id,title:p.title,original:text,running:true,activeIndex:0,results:selected.map(mode=>({mode,status:'waiting'}))};
 const btn=$('#run-ai');
 btn.disabled=true;btn.innerHTML='<span class="spin"></span> تنفيذ '+selected.length+' عمليات...';
 $('#cancel-ai').classList.remove('hidden');
 document.querySelectorAll('.mode-checkbox').forEach(input=>input.disabled=true);
 renderAIResult();
 try{
   for(let i=0;i<selected.length;i++){
     if(controller.signal.aborted)break;
     const mode=selected[i],item=state.aiBatch.results[i];
     item.status='running';state.aiBatch.activeIndex=i;renderAIResult();
     try{
       const res=await fetch('/api/ai',{
         method:'POST',signal:controller.signal,
         headers:{'Content-Type':'application/json',...(key?{'X-Provider-Key':key}:{'X-Access-Key':password})},
         body:JSON.stringify({mode,model,text,title:p.title,instructions,command,depth})
       });
       const data=await res.json().catch(()=>({error:'استجابة غير مفهومة من الخادم'}));
       if(!res.ok||!data.ok){
         item.status='error';item.error=data.error||'فشل الطلب ('+res.status+')';
         if([401,402,403,429].includes(data.providerStatus)||[401,503].includes(res.status))break;
       }else{
         item.status='complete';item.result=data.result;
         item.formatted=mode==='structure'?insertHeadings(text,data.result.headings):'';
         item.finishReason=data.finishReason||null;item.usage=data.usage||null;
       }
     }catch(error){
       if(controller.signal.aborted){item.status='cancelled';break;}
       item.status='error';item.error=error.message||'حدث خطأ غير متوقع';
     }
     renderAIResult();
   }
 }finally{
   const batch=state.aiBatch;
   if(batch){
     batch.running=false;
     for(const item of batch.results)if(item.status==='waiting'||item.status==='running')item.status='cancelled';
     const successful=batch.results.findIndex(item=>item.status==='complete');
     if(successful>=0)batch.activeIndex=successful;
   }
   state.aiAbort=null;state.busy=false;
   btn.disabled=!state.selectedModes.length;btn.innerHTML=icon('spark',18)+' <span>نفّذ العمليات المختارة</span>';
   $('#cancel-ai').classList.add('hidden');
   document.querySelectorAll('.mode-checkbox').forEach(input=>input.disabled=false);
   renderAIResult();
 }
}
function bind(){
 $('#add-space').onclick=()=>addSpace().catch(e=>toast(e.message,'error'));
 $('#add-page').onclick=()=>addPage().catch(e=>toast(e.message,'error'));
 $('#spaces-list').onclick=e=>{const el=e.target.closest('[data-space]');if(el)activateSpace(el.dataset.space).catch(err=>toast(err.message,'error'));};
 $('#pages-list').onclick=e=>{const el=e.target.closest('[data-page]');if(el)activatePage(el.dataset.page).catch(err=>toast(err.message,'error'));};
 $('#favorite-btn').onclick=()=>toggleFavoritePage().catch(e=>toast(e.message,'error'));
 $('#theme-btn').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
 setTheme(localStorage.getItem('uspace-theme'));
 $('#editor').oninput=()=>{
   if(state.sourceMode&&!state.sourceEdited&&getPage()?.richDoc){snapshot().catch(e=>toast(e.message,'error'));}
   state.sourceEdited=true;queueSave();
 };
 $('#page-title').oninput=queueSave;
 $('#search').oninput=e=>{state.search=e.target.value;renderNav();};
 $('#preview-btn').onclick=()=>{state.preview=!state.preview;syncPreview();};
 $('#source-btn').onclick=()=>toggleMarkdownSource().catch(e=>toast(e.message,'error'));
 $('#assistant-btn').onclick=()=>togglePanel(true);$('#close-panel').onclick=()=>togglePanel(false);$('#panel-scrim').onclick=()=>togglePanel(false);
 $('#modes').onchange=e=>{
   const input=e.target.closest('input[data-mode]');if(!input||state.busy)return;
   const chosen=new Set(state.selectedModes);
   if(input.checked)chosen.add(input.dataset.mode);else chosen.delete(input.dataset.mode);
   state.selectedModes=MODE_ORDER.filter(mode=>chosen.has(mode));
   state.mode=state.selectedModes[0]||'ideas';
   renderModes();
 };
 $('#cancel-ai').onclick=()=>{if(state.aiAbort){state.aiAbort.abort();toast('تم إيقاف العمليات المتبقية');}};
 const presets={
  root:'شخّص الأسباب الجذرية المحتملة في خطة المشروع، ميّز ما يحتاج فحصًا عما هو مؤكد، واقترح خطة إصلاح واختبارات منع تراجع دون إضافة مزايا.',
  plan:'حوّل هذا المستند إلى خطة تنفيذ مرتبة بالأولوية والاعتماديات مع خطوات عملية ومعايير قبول واختبارات واضحة.',
  constraints:'التزم بكل القيود والقرارات المذكورة في المستند، ولا تضف ميزات جديدة أو تغييرات واجهة. قدم حلولًا ضمن النطاق فقط.'
 };
 $('.command-presets').onclick=e=>{const button=e.target.closest('[data-ai-preset]');if(button){$('#ai-command').value=presets[button.dataset.aiPreset]||'';$('#ai-command').focus();}};
 $('#model').onchange=e=>state.model=e.target.value;
 $('#access-key').value='';
 $('#run-ai').onclick=()=>runAI();
  $('#editor-font').onchange=e=>{const p=getPage();if(p){p.fontFamily=e.target.value;renderEditorTypography();queueSave();}};
  $('#editor-size').onchange=e=>{const p=getPage();if(p){p.fontSize=Number(e.target.value);renderEditorTypography();queueSave();}};
  $('.format-toolbar').onclick=e=>{const button=e.target.closest('[data-format]');if(button)applyFormat(button.dataset.format);};
 $('.format-toolbar').addEventListener('mousedown',e=>{if(e.target.closest('button[data-format]'))e.preventDefault();});
 $('#table-tools').onclick=e=>{const button=e.target.closest('[data-format]');if(button)applyFormat(button.dataset.format);};
 $('#selection-font').onchange=e=>{if(!state.sourceMode && e.target.value){loadArabicFont(e.target.value);richAction(richEditor,'set-font',{value:e.target.value});e.target.value='';}};
 $('#selection-size').onchange=e=>{if(!state.sourceMode && e.target.value){richAction(richEditor,'set-size',{value:e.target.value});e.target.value='';}};
 $('#selection-color').oninput=e=>{if(!state.sourceMode)richAction(richEditor,'set-color',{value:e.target.value});};
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
 $('#export-html-btn').onclick=async()=>{
   await flush();const p=getPage();
   const content=DOMPurify.sanitize(state.sourceMode?marked.parse(p.body,{gfm:true,breaks:false}):richHTML(richEditor),{USE_PROFILES:{html:true}});
   const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+escapeHtml(p.title)+'</title></head><body>'+content+'</body></html>';
   download(`${fileName(p.title)}.html`,html,'text/html;charset=utf-8');toast('تم تنزيل HTML');
 };
 $('#import-btn').onclick=()=>$('#file-input').click();
 $('#restore-backup-btn').onclick=()=>$('#backup-input').click();
 $('#backup-input').onchange=async e=>{
   try{const file=e.target.files?.[0];if(file)await restoreBackup(file);}catch(err){toast(err.message,'error');}
   e.target.value='';
 };
 $('#file-input').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2_000_000){toast('الحد الأقصى للملف 2 ميغابايت','error');e.target.value='';return;}const body=await f.text();await addPage();$('#page-title').value=f.name.replace(/\.(md|markdown|txt)$/i,'');const page=getPage();page.body=body;page.richDoc=null;
 $('#editor').value=body;
 loadingRich=true;try{loadRichDocument(richEditor,page);}finally{loadingRich=false;}
 state.richChanged=false;state.sourceEdited=false;
 await saveCurrent();updateStats();toast('تم استيراد الملف');e.target.value='';};
 $('#more-btn').onclick=()=>showDialog('إدارة الصفحة',`<p class="dialog-description">نسخ واسترجاع أو حذف الصفحة الحالية.</p><div class="dialog-actions"><button id="history-btn" class="quiet-btn bordered">${icon('history',17)} سجل النسخ</button><button id="delete-page-btn" class="danger-btn">${icon('trash',17)} حذف الصفحة</button></div>`,{onOpen:()=>{$('#history-btn').onclick=()=>{closeDialog();showHistory();};$('#delete-page-btn').onclick=()=>{closeDialog();deleteCurrent();};}});
 $('#open-sidebar').onclick=()=>toggleSidebar(!state.sidebarOpen);$('#close-sidebar').onclick=()=>toggleSidebar(false);$('#scrim').onclick=()=>toggleSidebar(false);
 document.addEventListener('keydown',e=>{const cmd=e.ctrlKey||e.metaKey;if(cmd&&e.key.toLowerCase()==='s'){e.preventDefault();flush().then(()=>toast('تم الحفظ'));}if(cmd&&e.key.toLowerCase()==='k'){e.preventDefault();openQuickSwitcher();}if(cmd&&e.shiftKey&&e.key.toLowerCase()==='n'){e.preventDefault();addPage().catch(err=>toast(err.message,'error'));}if(cmd&&e.shiftKey&&e.key.toLowerCase()==='d'){e.preventDefault();createDailyNote().catch(err=>toast(err.message,'error'));}if(cmd&&document.activeElement===$('#editor')&&['b','i'].includes(e.key.toLowerCase())){e.preventDefault();applyFormat(e.key.toLowerCase()==='b'?'bold':'italic');}if(e.key==='Escape'){closeDialog();togglePanel(false);toggleSidebar(false);}});
 window.addEventListener('pagehide',()=>{if(saveTimer){clearTimeout(saveTimer);const p=getPage();if(p){p.body=currentDocumentBody();if(!state.sourceMode&&state.richChanged)p.richDoc=richJSON(richEditor);if(state.sourceMode&&state.sourceEdited)p.richDoc=null;p.title=$('#page-title').value||'صفحة بدون عنوان';put('pages',{...p});}}});
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
