/* Visible copy for the deliberately small Yasser-only catalogue. */
function apply(){
  const hero=document.querySelector('.hero');
  if(hero){
    const eyebrow=hero.querySelector('.hero__eyebrow');
    const title=hero.querySelector('h1');
    const desc=hero.querySelector(':scope > p:not(.hero__eyebrow)');
    if(eyebrow) eyebrow.textContent='أرشيف ياسر الدوسري';
    if(title) title.innerHTML='ياسر الدوسري.<br>فقط.';
    if(desc) desc.textContent='رمضان 1425هـ والمصحف المرتل. لا كتالوج قراء عام، ولا صور تُجلب من الإنترنت.';
  }
  const search=document.querySelector('#searchInput');
  if(search) search.placeholder='ياسر 1425 الكهف، مريم، المصحف المرتل…';
  const empty=document.querySelector('#libraryEmpty p');
  if(empty) empty.textContent='احفظ تلاوات ياسر عندك، أو أضف تسجيلًا خاصًا من رابط أو ملف.';
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply,{once:true}); else apply();
