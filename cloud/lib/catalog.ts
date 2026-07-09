// ── كتالوج بنود §5 المعتمدة (5 أصلية + 10/4/1/1 المضاف باعتماد المالك) ──
// mode: "live" = رصد آلي مباشر بالكاميرا (محرك قواعد الحافة)
//       "scheduled" = فحص دلالي مجدول كل 120 دقيقة (Gemini 2.5 Flash-Lite Batch)

export type ItemMode = 'live' | 'scheduled';

export interface CatalogItem {
  code: string;
  titleAr: string;
  fineText: string;
  fineAmount: number;
  mode: ItemMode;
  /** المناطق الافتراضية المرتبطة بالبند (قابلة للتعديل في RuleConfig) */
  zones: string[];
}

export const ITEMS: CatalogItem[] = [
  {
    code: '3/8/1/1',
    titleAr:
      'قيام العامل بالعمل دون ارتداء الزي الموحد أو الكمامة أو القفازات أو غطاء الشعر',
    fineText: '1000 ريال / عامل',
    fineAmount: 1000,
    mode: 'live',
    zones: ['processing_area', 'reception_pos'],
  },
  {
    code: '1/4/1/1',
    titleAr: 'وضع الملابس على الأرضية مباشرة دون السلال المخصصة',
    fineText: '1000 ريال',
    fineAmount: 1000,
    mode: 'live',
    zones: ['processing_area'],
  },
  {
    code: '7/8/1/1',
    titleAr: 'تناول الأطعمة والمشروبات في مواقع العمل',
    fineText: '250 ريال / عامل',
    fineAmount: 250,
    mode: 'live',
    zones: ['processing_area', 'reception_pos'],
  },
  {
    code: '1/5/1/1',
    titleAr: 'تكدس النفايات وعدم التخلص منها أولًا بأول',
    fineText: '500 ريال',
    fineAmount: 500,
    mode: 'scheduled',
    zones: ['waste_point'],
  },
  {
    code: '6/5/1/1',
    titleAr: 'حاويات نفايات غير مغطاة',
    fineText: '250 ريال',
    fineAmount: 250,
    mode: 'scheduled',
    zones: ['waste_point'],
  },
  {
    // بند سادس معتمد (تعديل المالك 2026-07-09): عتبة 0.80 وفحصان متتاليان
    code: '10/4/1/1',
    titleAr: 'طاولة كي غير مغطاة بقماش نظيف',
    fineText: '500 ريال',
    fineAmount: 500,
    mode: 'scheduled',
    zones: ['processing_area'],
  },
];

export const ITEM_MAP: Record<string, CatalogItem> = Object.fromEntries(
  ITEMS.map((i) => [i.code, i]),
);

export const LIVE_ITEMS = ITEMS.filter((i) => i.mode === 'live');
export const SCHEDULED_ITEMS = ITEMS.filter((i) => i.mode === 'scheduled');

export const ZONES_AR: Record<string, string> = {
  processing_area: 'منطقة المعالجة',
  reception_pos: 'كاونتر الاستقبال',
  waste_point: 'نقطة النفايات',
  entrance: 'المدخل',
};

export const CAMERAS_AR: Record<string, string> = {
  cam_processing: 'كاميرا منطقة المعالجة',
  cam_reception: 'كاميرا الاستقبال',
  cam_waste: 'كاميرا نقطة النفايات',
};
