export const DISCOVERY_PROFILES = {
  reciter: name => [
    `${name} الموقع الرسمي`, `${name} أرشيف`, `${name} نوادر`, `${name} تراويح`,
    `${name} قيام`, `${name} فروض`, `${name} MP3`, `${name} منقحة`, `${name} مصححة`, `${name} جودة عالية`
  ],
  treasureDomains: ['archive.org','mazameer.com','soundcloud.com','t.me'],
  contextSignals: ['نسخة مصححة','نسخة منقحة','أعلى جودة','من التسجيل الأصلي','من الشريط','من البث','هذه النسخة ناقصة','السورة كاملة','هذه نسخة مختلفة']
};

export function provenance(sourceUrl, extras={}){
  return { discoveredFrom:sourceUrl||'', originalSource:'', archivedFrom:'', uploader:'', verified:false, confidence:0, ...extras };
}

// Browser-side discovery intentionally does not crawl protected/social pages.
// Server-side adapters may use public APIs, OpenGraph/JSON-LD, or publicly accessible archive pages only.
export const DISCOVERY_POLICY = Object.freeze({ bypassDRM:false, bypassLogin:false, scrapeWhenOfficialApiExists:false });
