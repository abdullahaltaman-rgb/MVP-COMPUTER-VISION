// ── منشآت الخريطة الوطنية ──
// المنشآت الحقيقية تأتي من Neon (جدول Branch) وتُعرض ببياناتها الحيّة.
// إلى جانبها منشآت عرض (demo) مأخوذة من التصميم المعتمد لتعبئة الخريطة
// حتى يكتمل النطاق البلدي بصريًا. كل منشأة عرض تحمل demo:true — احذف
// DEMO_FACILITIES وحده لتصبح الخريطة حقيقية 100% دون أي تغيير آخر.

export type Compliance = 'ok' | 'warn' | 'alert';

export interface Facility {
  id: string;
  nameAr: string;
  districtAr: string;
  licenseNo: string;
  status: Compliance;
  lat: number;
  lng: number;
  demo: boolean;
  /** المنشآت الحقيقية فقط: عدد الحالات النشطة والمصعّدة */
  activeCases?: number;
  escalatedCases?: number;
}

export const COMPLIANCE_AR: Record<Compliance, string> = {
  ok: 'ملتزمة',
  warn: 'ضمن مهلة التصحيح',
  alert: 'تصعيد نشط',
};

export const COMPLIANCE_COLOR: Record<Compliance, string> = {
  ok: '#1B7A4A',
  warn: '#E0982C',
  alert: '#CE4A3C',
};

/** منشآت العرض — مطابقة للتصميم المعتمد (design/ministry.html) */
export const DEMO_FACILITIES: { nameAr: string; districtAr: string; status: Compliance; licenseNo: string }[] = [
  { nameAr: 'مغسلة النخيل', districtAr: 'النسيم', status: 'alert', licenseNo: '40118762' },
  { nameAr: 'مغسلة البستان', districtAr: 'غرناطة', status: 'alert', licenseNo: '40117845' },
  { nameAr: 'مغسلة الوسام', districtAr: 'السليمانية', status: 'warn', licenseNo: '40116233' },
  { nameAr: 'مغسلة الياقوت', districtAr: 'العليا', status: 'warn', licenseNo: '40115920' },
  { nameAr: 'مغسلة الصفوة', districtAr: 'حطين', status: 'warn', licenseNo: '40114411' },
  { nameAr: 'مغسلة درة الشفا', districtAr: 'الشفا', status: 'warn', licenseNo: '40113307' },
  { nameAr: 'مغسلة نسيم الروضة', districtAr: 'الروضة', status: 'warn', licenseNo: '40112258' },
  { nameAr: 'مغسلة الأناقة', districtAr: 'العليا', status: 'ok', licenseNo: '40118101' },
  { nameAr: 'مغسلة اللمسة الذهبية', districtAr: 'الملقا', status: 'ok', licenseNo: '40118114' },
  { nameAr: 'مغسلة الربيع', districtAr: 'الملقا', status: 'ok', licenseNo: '40117222' },
  { nameAr: 'مغسلة الماسة', districtAr: 'النرجس', status: 'ok', licenseNo: '40116318' },
  { nameAr: 'مغسلة البدر', districtAr: 'النرجس', status: 'ok', licenseNo: '40115425' },
  { nameAr: 'مغسلة الأصالة', districtAr: 'الياسمين', status: 'ok', licenseNo: '40114532' },
  { nameAr: 'مغسلة النقاء', districtAr: 'الياسمين', status: 'ok', licenseNo: '40113641' },
  { nameAr: 'مغسلة السنبلة', districtAr: 'السليمانية', status: 'ok', licenseNo: '40112749' },
  { nameAr: 'مغسلة الفارس', districtAr: 'النسيم', status: 'ok', licenseNo: '40111856' },
  { nameAr: 'مغسلة التميز', districtAr: 'الروضة', status: 'ok', licenseNo: '40118963' },
  { nameAr: 'مغسلة الوردة', districtAr: 'غرناطة', status: 'ok', licenseNo: '40117071' },
  { nameAr: 'مغسلة الصقر', districtAr: 'المروج', status: 'ok', licenseNo: '40116188' },
  { nameAr: 'مغسلة النسمة', districtAr: 'المروج', status: 'ok', licenseNo: '40115296' },
  { nameAr: 'مغسلة الرونق', districtAr: 'الصحافة', status: 'ok', licenseNo: '40114303' },
  { nameAr: 'مغسلة الفخامة', districtAr: 'الصحافة', status: 'ok', licenseNo: '40113411' },
  { nameAr: 'مغسلة البيلسان', districtAr: 'حطين', status: 'ok', licenseNo: '40112528' },
  { nameAr: 'مغسلة الغدير', districtAr: 'الرحمانية', status: 'ok', licenseNo: '40111635' },
  { nameAr: 'مغسلة الزهور', districtAr: 'الرحمانية', status: 'ok', licenseNo: '40118742' },
  { nameAr: 'مغسلة السحاب', districtAr: 'قرطبة', status: 'ok', licenseNo: '40117859' },
  { nameAr: 'مغسلة الريان', districtAr: 'قرطبة', status: 'ok', licenseNo: '40116966' },
  { nameAr: 'مغسلة الجوهرة', districtAr: 'إشبيلية', status: 'ok', licenseNo: '40116073' },
  { nameAr: 'مغسلة اللؤلؤة', districtAr: 'إشبيلية', status: 'ok', licenseNo: '40115181' },
  { nameAr: 'مغسلة الأمانة', districtAr: 'العزيزية', status: 'ok', licenseNo: '40114288' },
  { nameAr: 'مغسلة النخبة', districtAr: 'العزيزية', status: 'ok', licenseNo: '40113395' },
  { nameAr: 'مغسلة الصفا', districtAr: 'الشفا', status: 'ok', licenseNo: '40112403' },
  { nameAr: 'مغسلة الخزامى', districtAr: 'طويق', status: 'ok', licenseNo: '40111510' },
  { nameAr: 'مغسلة الطلائع', districtAr: 'طويق', status: 'ok', licenseNo: '40118617' },
  { nameAr: 'مغسلة الوتين', districtAr: 'ظهرة لبن', status: 'ok', licenseNo: '40117724' },
  { nameAr: 'مغسلة الرمال', districtAr: 'ظهرة لبن', status: 'ok', licenseNo: '40116831' },
];
