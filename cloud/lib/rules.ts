// ── الإعدادات الافتراضية لبنود §5 (5 أصلية + 10/4/1/1 المعتمد) — تُدار من /ops ──
// الحافة تسحب هذه القيم عبر GET /api/edge/config (قابلة للتحديث عن بُعد).
import prisma from './db';
import { ITEMS } from './catalog';

export interface RuleDefaults {
  itemCode: string;
  mode: 'live' | 'scheduled';
  autoThreshold: number;
  reviewThreshold: number;
  confirmWindowSec: number;
  cooldownSec: number;
  zones: string[];
  objects: string[];
  scheduleMinutes: number | null;
  /** فحوصات مجدولة إيجابية متتالية مطلوبة قبل فتح حدث */
  consecutiveChecks: number;
  semanticPromptAr: string | null;
}

export const RULE_DEFAULTS: RuleDefaults[] = [
  {
    // العامل دون زي/كمامة/قفازات/غطاء شعر — شخص مستقر في منطقة عمل + تحقق دلالي للسمات
    itemCode: '3/8/1/1',
    mode: 'live',
    autoThreshold: 0.85,
    reviewThreshold: 0.6,
    confirmWindowSec: 60, // PRD §5: زي غير مطابق ≥ 60 ث
    cooldownSec: 1800,
    zones: ['processing_area', 'reception_pos'],
    objects: ['person'],
    scheduleMinutes: null,
    consecutiveChecks: 1,
    semanticPromptAr:
      'هل يظهر في الصورة عامل مغسلة يعمل دون الزي الموحد الكامل (مريول/زي موحد + كمامة + قفازات + غطاء شعر)؟ قيّم فقط العاملين داخل منطقة العمل، وتجاهل الزبائن.',
  },
  {
    // ملابس على الأرضية مباشرة دون السلال
    itemCode: '1/4/1/1',
    mode: 'live',
    autoThreshold: 0.85,
    reviewThreshold: 0.6,
    confirmWindowSec: 30, // PRD §5: تأكيد 3 إطارات / 30 ث
    cooldownSec: 1800,
    zones: ['processing_area'],
    objects: ['person'],
    scheduleMinutes: null,
    consecutiveChecks: 1,
    semanticPromptAr:
      'هل توجد ملابس أو أقمشة موضوعة على الأرضية مباشرة دون سلال أو حاويات مخصصة في منطقة المعالجة؟',
  },
  {
    // أكل وشرب في مواقع العمل — أجسام (كوب/قارورة/طعام) بجوار شخص في منطقة عمل
    itemCode: '7/8/1/1',
    mode: 'live',
    autoThreshold: 0.85,
    reviewThreshold: 0.6,
    confirmWindowSec: 120, // PRD §5: أدوات طعام على سطح عمل ≥ 120 ث
    cooldownSec: 900,
    zones: ['processing_area', 'reception_pos'],
    objects: ['cup', 'bottle', 'bowl', 'sandwich', 'banana', 'apple', 'orange', 'donut', 'cake'],
    scheduleMinutes: null,
    consecutiveChecks: 1,
    semanticPromptAr:
      'هل يظهر في الصورة شخص يتناول طعامًا أو شرابًا (أو طعام/مشروب مفتوح بجواره) داخل منطقة العمل في المغسلة؟',
  },
  {
    // تكدس النفايات — فحص دلالي مجدول كل 120 دقيقة
    itemCode: '1/5/1/1',
    mode: 'scheduled',
    autoThreshold: 0.8, // PRD §5
    reviewThreshold: 0.6,
    confirmWindowSec: 0,
    cooldownSec: 7200,
    zones: ['waste_point'],
    objects: [],
    scheduleMinutes: 120,
    consecutiveChecks: 2, // PRD §5: تأكيد بفحصين متتاليين
    semanticPromptAr:
      'انظر إلى نقطة النفايات في الصورة: هل توجد نفايات متكدسة أو أكياس متراكمة خارج الحاويات لم يتم التخلص منها أولًا بأول؟',
  },
  {
    // حاويات نفايات غير مغطاة — فحص دلالي مجدول كل 120 دقيقة
    itemCode: '6/5/1/1',
    mode: 'scheduled',
    autoThreshold: 0.8, // PRD §5
    reviewThreshold: 0.6,
    confirmWindowSec: 0,
    cooldownSec: 7200,
    zones: ['waste_point'],
    objects: [],
    scheduleMinutes: 120,
    consecutiveChecks: 2, // PRD §5: تأكيد بفحصين متتاليين
    semanticPromptAr:
      'انظر إلى حاويات النفايات في الصورة: هل توجد حاوية نفايات مكشوفة دون غطاء محكم؟',
  },
  {
    // بند سادس معتمد (تعديل المالك 2026-07-09): طاولة كي غير مغطاة —
    // عتبة 0.80، والتأكيد بفحصين مجدولين متتاليين (consecutiveChecks: 2)
    itemCode: '10/4/1/1',
    mode: 'scheduled',
    autoThreshold: 0.8,
    reviewThreshold: 0.6,
    confirmWindowSec: 0,
    cooldownSec: 7200,
    zones: ['processing_area'],
    objects: [],
    scheduleMinutes: 120,
    consecutiveChecks: 2,
    semanticPromptAr:
      'افحص طاولة/طاولات الكي في الصورة وفق هذه القائمة: 1) هل توجد طاولة كي ظاهرة؟ ' +
      '2) هل سطحها مغطى بقماش/غطاء مخصص؟ 3) هل الغطاء نظيف وسليم دون بقع أو تمزق واضح؟ ' +
      'اعتبرها مخالفة (violation=true) فقط إذا كانت طاولة كي ظاهرة وسطحها مكشوف دون قماش، ' +
      'أو غطاؤها متسخ بشكل واضح. إن لم تظهر أي طاولة كي في الصورة فأجب violation=false بثقة منخفضة.',
  },
];

/** يضمن وجود صف RuleConfig لكل بند (يُستدعى من البذر وعند الإقلاع) */
export async function ensureRuleConfigs(): Promise<void> {
  for (const r of RULE_DEFAULTS) {
    await prisma.ruleConfig.upsert({
      where: { itemCode: r.itemCode },
      update: {},
      create: {
        itemCode: r.itemCode,
        mode: r.mode,
        autoThreshold: r.autoThreshold,
        reviewThreshold: r.reviewThreshold,
        confirmWindowSec: r.confirmWindowSec,
        cooldownSec: r.cooldownSec,
        zones: r.zones,
        objects: r.objects,
        scheduleMinutes: r.scheduleMinutes,
        consecutiveChecks: r.consecutiveChecks,
        semanticPromptAr: r.semanticPromptAr,
      },
    });
  }
  // تحقق أن الكتالوج والقواعد متطابقان
  const codes = new Set(ITEMS.map((i) => i.code));
  for (const r of RULE_DEFAULTS) {
    if (!codes.has(r.itemCode)) {
      throw new Error(`RuleConfig لبند غير موجود في الكتالوج: ${r.itemCode}`);
    }
  }
}

/**
 * بوابة الثقة الموحّدة (تُطبَّق سحابيًا كمصدر حقيقة):
 * auto ≥ autoThreshold | review ضمن [reviewThreshold, autoThreshold) | drop أدنى.
 */
export function gate(
  confidence: number,
  rule: { autoThreshold: number; reviewThreshold: number },
): 'auto' | 'review' | 'drop' {
  if (confidence >= rule.autoThreshold) return 'auto';
  if (confidence >= rule.reviewThreshold) return 'review';
  return 'drop';
}
