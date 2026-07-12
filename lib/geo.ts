// ── إحداثيات أحياء الرياض ──
// جدول ثابت: مخطط Branch لا يحمل lat/lng، فنشتق الموقع من اسم الحي.
// أي منشأة في نفس الحي تُزاح إزاحة صغيرة ثابتة (مشتقّة من رقم الرخصة)
// حتى لا تتراكم العلامات فوق بعضها — نفس أسلوب التصميم المعتمد.

export const RIYADH_DISTRICTS: Record<string, [number, number]> = {
  'العليا': [24.694, 46.685],
  'الملقا': [24.803, 46.601],
  'النرجس': [24.849, 46.65],
  'الياسمين': [24.823, 46.644],
  'السليمانية': [24.71, 46.703],
  'النسيم': [24.721, 46.803],
  'الروضة': [24.74, 46.774],
  'غرناطة': [24.776, 46.753],
  'المروج': [24.747, 46.66],
  'الصحافة': [24.807, 46.63],
  'حطين': [24.77, 46.59],
  'الرحمانية': [24.73, 46.623],
  'قرطبة': [24.797, 46.73],
  'إشبيلية': [24.77, 46.79],
  'العزيزية': [24.563, 46.744],
  'الشفا': [24.554, 46.679],
  'طويق': [24.583, 46.562],
  'ظهرة لبن': [24.632, 46.549],
};

/** مركز الرياض — يُستخدم كموقع احتياطي لحيّ غير معروف */
export const RIYADH_CENTER: [number, number] = [24.715, 46.68];

/** يزيل بادئة «حي » ويشذّب المسافات — القاعدة تخزّن «حي الملقا» والجدول يفهرس «الملقا» */
export function normalizeDistrict(districtAr: string): string {
  return districtAr.trim().replace(/^حي\s+/, '').trim();
}

/** تجزئة ثابتة (deterministic) — نفس المدخل يعطي نفس الإزاحة في كل تحميل */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * إحداثيات منشأة: مركز الحي + إزاحة ثابتة ضمن ±0.009° (‏~1 كم)
 * مشتقّة من المُعرّف (رقم الرخصة) — لا عشوائية، فلا اختلاف بين الخادم والمتصفح.
 */
export function facilityLatLng(districtAr: string, seed: string): [number, number] {
  const base = RIYADH_DISTRICTS[normalizeDistrict(districtAr)] ?? RIYADH_CENTER;
  const h = hashCode(seed);
  const dLat = (((h % 1000) / 1000) * 2 - 1) * 0.009;
  const dLng = (((Math.floor(h / 1000) % 1000) / 1000) * 2 - 1) * 0.009;
  return [base[0] + dLat, base[1] + dLng];
}

export const DISTRICT_NAMES = Object.keys(RIYADH_DISTRICTS);
