// ── الكتالوج المغلق لبنود لائحة المغاسل (أمانة منطقة الرياض) ──
// mode: "live" = قابل للرصد الآلي المباشر بالكاميرا
//       "scheduled" = يُرصد بجولات مجدولة (يُعرض في اللوحات لكن لا يُطلقه البث الحي)

export type ItemMode = 'live' | 'scheduled';

export interface CatalogItem {
  code: string;
  titleAr: string;
  fineText: string;
  fineAmount: number;
  mode: ItemMode;
}

export const ITEMS: CatalogItem[] = [
  {
    code: '3/8/1/1',
    titleAr:
      'قيام العامل بالعمل دون ارتداء الزي الموحد أو الكمامة أو القفازات أو غطاء الشعر',
    fineText: '1000 ريال / عامل',
    fineAmount: 1000,
    mode: 'live',
  },
  {
    code: '1/4/1/1',
    titleAr: 'وضع الملابس على الأرضية مباشرة دون السلال المخصصة',
    fineText: '1000 ريال',
    fineAmount: 1000,
    mode: 'live',
  },
  {
    code: '7/8/1/1',
    titleAr: 'تناول الأطعمة والمشروبات في مواقع العمل',
    fineText: '250 ريال / عامل',
    fineAmount: 250,
    mode: 'live',
  },
  {
    code: '9/8/1/1',
    titleAr: 'التدخين أو النوم داخل المحل',
    fineText: '500 ريال / عامل',
    fineAmount: 500,
    mode: 'live',
  },
  {
    code: '10/4/1/1',
    titleAr: 'طاولة كي غير مغطاة بقماش نظيف',
    fineText: '500 ريال',
    fineAmount: 500,
    mode: 'scheduled',
  },
  {
    code: '24/4/1/1',
    titleAr: 'تعليق غير مرتب للملابس الجاهزة على السيور',
    fineText: '500 ريال',
    fineAmount: 500,
    mode: 'scheduled',
  },
  {
    code: '8/1/1/1',
    titleAr: 'عدم نظافة الجدران والأسقف أو وجود تشققات',
    fineText: '500 ريال',
    fineAmount: 500,
    mode: 'scheduled',
  },
  {
    code: '1/5/1/1',
    titleAr: 'تكدس النفايات وعدم التخلص منها أولًا بأول',
    fineText: '500 ريال',
    fineAmount: 500,
    mode: 'scheduled',
  },
  {
    code: '6/5/1/1',
    titleAr: 'حاويات نفايات غير مغطاة',
    fineText: '250 ريال',
    fineAmount: 250,
    mode: 'scheduled',
  },
];

// المؤشرات الإيجابية (خضراء) — دلائل امتثال لا تُنشئ حالات
export const POSITIVES: { code: string; titleAr: string }[] = [
  { code: 'POS-UNIFORM', titleAr: 'الزي الموحد مكتمل' },
  { code: 'POS-BASKETS', titleAr: 'الفرز بالسلال المخصصة' },
  { code: 'POS-FIRSTAID', titleAr: 'صندوق إسعافات ظاهر' },
  { code: 'POS-EXTINGUISHER', titleAr: 'طفاية حريق ظاهرة' },
];

export const ITEM_MAP: Record<string, CatalogItem> = Object.fromEntries(
  ITEMS.map((i) => [i.code, i]),
);

export const POSITIVE_MAP: Record<string, { code: string; titleAr: string }> =
  Object.fromEntries(POSITIVES.map((p) => [p.code, p]));

export function isPositiveCode(code: string): boolean {
  return code.startsWith('POS-');
}

// أسماء البنود المسموح بها للنموذج (كتالوج مغلق)
export const ALL_CODES: string[] = [
  ...ITEMS.map((i) => i.code),
  ...POSITIVES.map((p) => p.code),
];
