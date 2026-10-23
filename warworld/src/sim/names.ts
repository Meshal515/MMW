// Nation names and distinct colours.
import type { Rng } from './rng';

const PREFIX = ['مملكة', 'جمهورية', 'سلطنة', 'إمبراطورية', 'اتحاد', 'إمارة', 'دولة', 'كونفدرالية', 'دوقية', 'خانية'];
const ROOTS = [
  'زاران', 'تلمار', 'قورين', 'سافيا', 'نورستان', 'بارقة', 'الراية', 'كاشان', 'دارين', 'أزور', 'ميرا', 'فالدور',
  'سيرين', 'هاردان', 'وادي النار', 'الجبل الأزرق', 'النجم', 'الصقر', 'أوريان', 'كالدور', 'زمرد', 'الرمال', 'بلاد الثلج',
  'تيرانا', 'إلدورا', 'الشروق', 'المرجان', 'غرناد', 'بيرون', 'سهيل', 'الدرع', 'القلعة', 'نوفار', 'رامات', 'لؤلؤة البحر',
  'أركاديا', 'فيرنا', 'الغيم', 'مارسا', 'كرستال', 'ثاندور', 'الحديد', 'السنديان', 'أسوار', 'نهر الذهب', 'جزر الريح',
  'البرق', 'سوران', 'إكسيا', 'الوهج', 'تامور', 'الأفق', 'أوستا', 'البحيرة', 'كوبالت', 'الفجر', 'ريفان', 'شمسان',
];

export function nationNames(rng: Rng, n: number): string[] {
  const roots = rng.shuffle([...ROOTS]);
  return Array.from({ length: n }, (_, i) => `${rng.pick(PREFIX)} ${roots[i % roots.length]}${i >= roots.length ? ' ' + (Math.floor(i / roots.length) + 1) : ''}`);
}

/** Evenly spread, saturated colours; the first one (the human) is always a recognisable royal blue. */
export function nationColors(rng: Rng, n: number): number[] {
  const out: number[] = [0x3d7bff];
  const off = rng.next();
  for (let i = 1; i < n; i++) {
    const h = (off + i * 0.61803398875) % 1;
    const s = 0.68 + ((i * 7) % 5) * 0.06;
    const l = 0.46 + ((i * 3) % 4) * 0.05;
    out.push(hsl(h, s, l));
  }
  return out;
}

export function hsl(h: number, s: number, l: number): number {
  const f = (n: number) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
