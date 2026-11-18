/**
 * Local-first Arabic typography. Google Fonts is requested only for the
 * specific fonts used by the current page/document; fallbacks work offline.
 * No user content or API credentials are passed to the font service.
 */
export const ARABIC_FONT_NAMES = Object.freeze([
  'IBM Plex Sans Arabic',
  'Cairo',
  'Tajawal',
  'Almarai',
  'Alexandria',
  'Readex Pro',
  'Changa',
  'Amiri',
  'Noto Naskh Arabic',
  'Noto Sans Arabic',
  'Reem Kufi'
]);

const labelByName = Object.freeze({
  'IBM Plex Sans Arabic':'آي بي إم بلكس — IBM Plex',
  Cairo:'القاهرة — Cairo',
  Tajawal:'تجوال — Tajawal',
  Almarai:'المراعي — Almarai',
  Alexandria:'الإسكندرية — Alexandria',
  'Readex Pro':'ريدكس برو — Readex Pro',
  Changa:'شانجا — Changa',
  Amiri:'أميري — Amiri',
  'Noto Naskh Arabic':'نوتو نسخ — Noto Naskh',
  'Noto Sans Arabic':'نوتو سانس — Noto Sans',
  'Reem Kufi':'ريم كوفي — Reem Kufi'
});

export const PAGE_FONT_CHOICES = Object.freeze([
  ['system','افتراضي — IBM Plex'],
  ...ARABIC_FONT_NAMES.map(name => [name,labelByName[name]]),
  ['sans','خط النظام العربي'],
  ['serif','خط تقليدي'],
  ['mono','Monospace']
]);

const loaded = new Set();
export function isArabicFont(name){
  return ARABIC_FONT_NAMES.includes(name);
}
export function pageFontFamily(value) {
  if (!PAGE_FONT_CHOICES.some(([key])=>key===value)) return 'system';
  return value;
}
export function fontStack(value) {
  const name=pageFontFamily(value);
  if(name==='system')return "'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif";
  if(name==='sans')return "Tahoma,Arial,sans-serif";
  if(name==='serif')return "'Noto Naskh Arabic',Georgia,'Times New Roman',serif";
  if(name==='mono')return "ui-monospace,Consolas,monospace";
  return "'"+name+"',Tahoma,Arial,sans-serif";
}
export function fontOptionsHtml(selection=false){
  const arabic=ARABIC_FONT_NAMES.map(name=>'<option value="'+name+'">'+labelByName[name]+'</option>').join('');
  if(selection)return '<option value="">خط النص المحدد</option><optgroup label="الخطوط العربية">'+arabic+'</optgroup><optgroup label="خطوط إضافية"><option value="Tahoma">Tahoma</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Courier New">Mono</option></optgroup>';
  return '<option value="system">افتراضي — IBM Plex</option><optgroup label="الخطوط العربية">'+arabic+'</optgroup><optgroup label="خطوط النظام"><option value="sans">خط النظام</option><option value="serif">تقليدي</option><option value="mono">Monospace</option></optgroup>';
}
export function loadArabicFont(name) {
  if(name==='system')name='IBM Plex Sans Arabic';
  if(name==='serif')name='Noto Naskh Arabic';
  if(!isArabicFont(name)||loaded.has(name)||typeof document==='undefined')return;
  loaded.add(name);
  const href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(name)+':wght@400;700&display=swap';
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=href;
  link.dataset.uspaceFont=name;
  document.head.appendChild(link);
}
export function loadDocumentFonts(doc) {
  if(!doc||typeof doc!=='object')return;
  const nodes=[doc];
  let count=0;
  while(nodes.length&&count++<60000){
    const node=nodes.pop();
    if(!node||typeof node!=='object')continue;
    for(const mark of node.marks||[]){
      const font=mark?.attrs?.fontFamily;
      if(isArabicFont(font))loadArabicFont(font);
    }
    if(Array.isArray(node.content))for(const part of node.content)nodes.push(part);
  }
}
