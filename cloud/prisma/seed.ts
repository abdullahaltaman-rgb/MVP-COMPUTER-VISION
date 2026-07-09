// ── بذر بيئة الإنتاج: فرع الرياض الحي + جهاز الحافة + 3 كاميرات + قواعد البنود + المستخدمون ──
// آمن لإعادة التشغيل (idempotent). الرموز السرية تُطبع مرة واحدة عند أول إنشاء.
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function newSecret(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
}

// قيم افتراضية للبنود الخمسة — النسخة المرجعية في cloud/lib/rules.ts
const RULES = [
  { itemCode: '3/8/1/1', mode: 'live', confirmWindowSec: 45, cooldownSec: 1800, zones: ['processing_area', 'reception_pos'], objects: ['person'], scheduleMinutes: null as number | null, semanticPromptAr: 'هل يظهر في الصورة عامل مغسلة يعمل دون الزي الموحد الكامل (مريول/زي موحد + كمامة + قفازات + غطاء شعر)؟ قيّم فقط العاملين داخل منطقة العمل، وتجاهل الزبائن.' },
  { itemCode: '1/4/1/1', mode: 'live', confirmWindowSec: 60, cooldownSec: 1800, zones: ['processing_area'], objects: ['person'], scheduleMinutes: null, semanticPromptAr: 'هل توجد ملابس أو أقمشة موضوعة على الأرضية مباشرة دون سلال أو حاويات مخصصة في منطقة المعالجة؟' },
  { itemCode: '7/8/1/1', mode: 'live', confirmWindowSec: 30, cooldownSec: 900, zones: ['processing_area', 'reception_pos'], objects: ['cup', 'bottle', 'bowl', 'sandwich', 'banana', 'apple', 'orange', 'donut', 'cake'], scheduleMinutes: null, semanticPromptAr: 'هل يظهر في الصورة شخص يتناول طعامًا أو شرابًا (أو طعام/مشروب مفتوح بجواره) داخل منطقة العمل في المغسلة؟' },
  { itemCode: '1/5/1/1', mode: 'scheduled', confirmWindowSec: 0, cooldownSec: 7200, zones: ['waste_point'], objects: [], scheduleMinutes: 120, semanticPromptAr: 'انظر إلى نقطة النفايات في الصورة: هل توجد نفايات متكدسة أو أكياس متراكمة خارج الحاويات لم يتم التخلص منها أولًا بأول؟' },
  { itemCode: '6/5/1/1', mode: 'scheduled', confirmWindowSec: 0, cooldownSec: 7200, zones: ['waste_point'], objects: [], scheduleMinutes: 120, semanticPromptAr: 'انظر إلى حاويات النفايات في الصورة: هل توجد حاوية نفايات مكشوفة دون غطاء محكم؟' },
  // بند سادس معتمد: طاولة كي غير مغطاة — عتبة 0.80 وفحصان متتاليان
  { itemCode: '10/4/1/1', mode: 'scheduled', confirmWindowSec: 0, cooldownSec: 7200, zones: ['processing_area'], objects: [], scheduleMinutes: 120, autoThreshold: 0.8, consecutiveChecks: 2, semanticPromptAr: 'افحص طاولة/طاولات الكي في الصورة وفق هذه القائمة: 1) هل توجد طاولة كي ظاهرة؟ 2) هل سطحها مغطى بقماش/غطاء مخصص؟ 3) هل الغطاء نظيف وسليم دون بقع أو تمزق واضح؟ اعتبرها مخالفة (violation=true) فقط إذا كانت طاولة كي ظاهرة وسطحها مكشوف دون قماش، أو غطاؤها متسخ بشكل واضح. إن لم تظهر أي طاولة كي في الصورة فأجب violation=false بثقة منخفضة.' },
];

async function main() {
  // ── الفرع الحي (الرياض) ──
  const branch = await prisma.branch.upsert({
    where: { code: 'RUH-001' },
    update: {},
    create: {
      code: 'RUH-001',
      nameAr: 'مغسلة أبيض — فرع الملقا',
      districtAr: 'حي الملقا',
      city: 'الرياض',
      licenseNo: 'RUH-LDR-2026-001',
      silentMode: true, // الأسبوع الثاني يبدأ صامتًا — بوابة إلزامية
    },
  });
  console.log(`✔ الفرع: ${branch.nameAr} (${branch.id})`);

  // ── جهاز الحافة N100 + رمزه ──
  const existingDevice = await prisma.device.findFirst({ where: { branchId: branch.id } });
  let deviceId: string;
  if (!existingDevice) {
    const token = process.env.SEED_DEVICE_TOKEN || newSecret('edg');
    const device = await prisma.device.create({
      data: { branchId: branch.id, name: 'صندوق الحافة N100 — الملقا', tokenHash: sha256Hex(token) },
    });
    deviceId = device.id;
    console.log(`✔ جهاز الحافة: ${device.id}`);
    console.log(`  ⚠ رمز الجهاز (يُحفظ في /edge/.env كـ CLOUD_DEVICE_TOKEN — لن يُعرض مجددًا):\n  ${token}`);
  } else {
    deviceId = existingDevice.id;
    console.log(`✔ جهاز الحافة موجود: ${deviceId}`);
  }

  // ── الكاميرات الثلاث والمناطق ──
  const cams = [
    { key: 'cam_processing', nameAr: 'كاميرا منطقة المعالجة', zones: ['processing_area'] },
    { key: 'cam_reception', nameAr: 'كاميرا الاستقبال', zones: ['reception_pos', 'entrance'] },
    { key: 'cam_waste', nameAr: 'كاميرا نقطة النفايات', zones: ['waste_point'] },
  ];
  for (const c of cams) {
    await prisma.camera.upsert({
      where: { deviceId_key: { deviceId, key: c.key } },
      update: { zones: c.zones },
      create: { deviceId, key: c.key, nameAr: c.nameAr, zones: c.zones },
    });
  }
  console.log('✔ الكاميرات الثلاث');

  // ── قواعد بنود §5 ──
  for (const r of RULES) {
    await prisma.ruleConfig.upsert({
      where: { itemCode: r.itemCode },
      update: {},
      create: {
        itemCode: r.itemCode,
        mode: r.mode,
        autoThreshold: (r as { autoThreshold?: number }).autoThreshold ?? 0.85,
        reviewThreshold: 0.6,
        confirmWindowSec: r.confirmWindowSec,
        cooldownSec: r.cooldownSec,
        zones: r.zones,
        objects: r.objects,
        scheduleMinutes: r.scheduleMinutes,
        consecutiveChecks: (r as { consecutiveChecks?: number }).consecutiveChecks ?? 1,
        semanticPromptAr: r.semanticPromptAr,
      },
    });
  }
  console.log(`✔ قواعد بنود §5 (${RULES.length} بنود، منها 10/4/1/1 بفحصين متتاليين)`);

  // ── المستخدمون (رمز وصول لكل دور) ──
  const users = [
    { role: 'operator', nameAr: 'مشغّل فرع الملقا', env: 'SEED_OPERATOR_CODE', branchId: branch.id },
    { role: 'kafeel', nameAr: 'كفيل الفرع', env: 'SEED_KAFEEL_CODE', branchId: branch.id },
    { role: 'ops', nameAr: 'غرفة عمليات أبيض', env: 'SEED_OPS_CODE', branchId: null as string | null },
    { role: 'ministry', nameAr: 'مراقب الأمانة (داخلي)', env: 'SEED_MINISTRY_CODE', branchId: null },
  ];
  for (const u of users) {
    const exists = await prisma.user.findFirst({ where: { role: u.role } });
    if (exists) {
      console.log(`✔ مستخدم ${u.role} موجود`);
      continue;
    }
    const code = process.env[u.env] || newSecret(u.role.slice(0, 3));
    await prisma.user.create({
      data: {
        role: u.role,
        nameAr: u.nameAr,
        accessCodeHash: sha256Hex(code),
        branchId: u.branchId,
      },
    });
    console.log(`✔ مستخدم ${u.role} — رمز الدخول (يُسلَّم يدويًا): ${code}`);
  }

  console.log('\nاكتمل البذر. SILENT_MODE مفعّل افتراضيًا — يُطفأ من /ops بعد اجتياز بوابة المعايرة.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
