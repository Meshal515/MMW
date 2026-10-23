// Deterministic Arabic place names for regions, flavoured by terrain.
import type { MapData } from '../../sim/map/regions';
import { T } from '../../sim/map/terrain';

const BY_TERRAIN: Record<number, string[]> = {
  [T.Plains]: ['سهل', 'مروج', 'وادي', 'حقول', 'ريف'],
  [T.Forest]: ['غابة', 'أحراش', 'أدغال', 'غيضة'],
  [T.Hills]: ['تلال', 'هضبة', 'روابي', 'نجد'],
  [T.Mountain]: ['جبل', 'قمم', 'سلسلة', 'ممر'],
  [T.Desert]: ['صحراء', 'رمال', 'كثبان', 'واحة'],
  [T.Snow]: ['جليد', 'تندرا', 'ثلوج', 'صقيع'],
};
const ROOTS = ['السمراء', 'الريح', 'النخيل', 'الذئاب', 'القمر', 'الفرسان', 'البرق', 'الحجر', 'الصفصاف', 'العقبان', 'الملح', 'الضباب',
  'النسور', 'الزيتون', 'الأمل', 'الشمس', 'المطر', 'الفجر', 'الغروب', 'الصدى', 'الحديد', 'الذهب', 'الياقوت', 'الكهرمان', 'السنابل',
  'العاصفة', 'الجبابرة', 'الأسود', 'الحمام', 'الندى', 'الينابيع', 'البلوط', 'الأرز', 'الصنوبر', 'المرجان', 'القوافل', 'الرعاة', 'الحصون'];

export function regionName(map: MapData, r: number) {
  const R = map.regions[r];
  const h = Math.imul(r + 17, 2654435761) >>> 0;
  const pre = BY_TERRAIN[R.terrain] ?? BY_TERRAIN[T.Plains];
  return `${pre[h % pre.length]} ${ROOTS[(h >>> 8) % ROOTS.length]}`;
}
