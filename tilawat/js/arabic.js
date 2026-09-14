/* ── arabic ───────────────────────────────────────────────────────────────────
   Normalising and matching Arabic, plus the query grammar the search box reads.

   The same recitation is written a dozen ways across a dozen sites: with and
   without diacritics, ياسر/ياسر, الحصري/الحصرى, ١٤٢٥/1425. Matching has to see
   through all of it, or the whole idea of grouping one recording's copies
   collapses. */

const DIACRITICS = /[ً-ْٰـ]/g;
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/** One spelling for anything that has several. */
export function normalize(text) {
  return String(text || '')
    .replace(DIACRITICS, '')
    .replace(ARABIC_DIGITS, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d) >= 0
      ? '٠١٢٣٤٥٦٧٨٩'.indexOf(d)
      : '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[أإآٱٲٳ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ـ«»"'’‘،؛]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export const tokens = text => normalize(text).split(' ').filter(Boolean);

/* Hijri years in the range recordings actually come from. A bare 1425 is a
   year; a bare 114 is a surah number; 320 in a quality label is a bitrate. */
const HIJRI = /^1[34][0-9]{2}$/;
const GREGORIAN = /^(19|20)[0-9]{2}$/;

export const looksHijri = token => HIJRI.test(token);
export const looksGregorian = token => GREGORIAN.test(token);

/** Words that mean "this copy was worked on", wherever they appear. */
export const QUALITY_WORDS = {
  original:   ['original', 'اصلي', 'اصليه', 'الاصلي', 'الاصليه', 'من الشريط', 'الشريط الاصلي', 'خام', 'raw', 'master'],
  restored:   ['restored', 'مرممه', 'مرمم', 'معالجه', 'معالج'],
  remastered: ['remastered', 'remaster', 'محسنه', 'محسن', 'معاد'],
  corrected:  ['مصححه', 'مصحح', 'corrected', 'fixed'],
  refined:    ['منقحه', 'منقح', 'منقحة', 'refined', 'clean', 'نقيه', 'نقي'],
  high:       ['hq', 'high quality', 'best quality', 'اعلى جوده', 'جوده عاليه', 'عالي الجوده', 'cd quality', 'cd', 'lossless', 'flac', 'wav'],
  complete:   ['كامله', 'كامل', 'complete', 'full'],
  partial:    ['ناقصه', 'ناقص', 'مقطوعه', 'incomplete', 'partial']
};

/** Which of the words above this text carries. */
export function qualityFlags(text) {
  const hay = ' ' + normalize(text) + ' ';
  const found = {};
  for (const [flag, words] of Object.entries(QUALITY_WORDS)) {
    found[flag] = words.some(word => hay.includes(' ' + normalize(word) + ' ') || hay.includes(normalize(word)));
  }
  return found;
}

/**
 * Reads a free query into the parts a catalogue can filter on.
 * "ياسر 1425 الكهف" → { years:[1425], words:['ياسر','الكهف'] }
 */
export function parseQuery(query, surahNames = []) {
  const all = tokens(query);
  const years = [];
  const words = [];
  for (const token of all) {
    if (looksHijri(token) || looksGregorian(token)) years.push(Number(token));
    else words.push(token);
  }
  const normalizedSurahs = surahNames.map((name, index) => ({ number: index + 1, key: normalize(name) }));
  const surah = normalizedSurahs.find(s => words.some(w => s.key === w || (w.length > 3 && s.key.includes(w))));
  return { years, words, surah: surah || null, raw: query };
}

/**
 * How well does this record answer the query? Every token must appear
 * somewhere, and tokens that land on the reciter or surah count for more than
 * ones that only brush the description.
 */
export function score(query, fields) {
  const { years, words } = query;
  const strong = normalize([fields.reciter, fields.surah, fields.title].filter(Boolean).join(' '));
  const weak = normalize([fields.collection, fields.mosque, fields.occasion, fields.tags && fields.tags.join(' ')]
    .filter(Boolean).join(' '));
  let total = 0;
  for (const word of words) {
    if (strong.includes(word)) total += 10;
    else if (weak.includes(word)) total += 4;
    else return 0;                       // every word has to land somewhere
  }
  for (const year of years) {
    if (Number(fields.year) === year) total += 14;
    else if (String(weak + strong).includes(String(year))) total += 6;
    else return 0;
  }
  if (!words.length && !years.length) total = 1;
  return total;
}
