import { prisma } from '../lib/db';
import { ITEMS } from '../lib/catalog';
import { SEED_SCENES, loadSceneDataUri, placeholderDataUri } from '../lib/seed-images';
import { computeEvidenceHash, GENESIS_HASH } from '../lib/hash';

const HOUR = 3600 * 1000;
const GRACE_MS = 48 * HOUR;

function sceneByCode(code: string) {
  return SEED_SCENES.find((s) => s.code === code) ?? SEED_SCENES[0];
}

async function main() {
  console.log('🌱 بدء التهيئة (seed) …');

  // ── تنظيف ──
  await prisma.caseEvent.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.case.deleteMany();
  await prisma.reviewItem.deleteMany();
  await prisma.item.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.chainMeta.deleteMany();
  await prisma.appState.deleteMany();

  // ── الفروع ──
  const branchSeed = [
    { nameAr: 'النخيل 3', districtAr: 'العليّا', licenseNo: 'RYD-LDR-10231', score: 78, isDemo: false },
    { nameAr: 'الياسمين', districtAr: 'الملقا', licenseNo: 'RYD-LDR-10488', score: 84, isDemo: false },
    { nameAr: 'الوسام 2', districtAr: 'السليمانية', licenseNo: 'RYD-LDR-10756', score: 66, isDemo: false },
    { nameAr: 'الروابي', districtAr: 'النسيم', licenseNo: 'RYD-LDR-11002', score: 71, isDemo: false },
    { nameAr: 'البستان', districtAr: 'الروضة', licenseNo: 'RYD-LDR-11310', score: 88, isDemo: false },
    { nameAr: 'فرع العرض الحي', districtAr: 'العرض التجريبي', licenseNo: 'RYD-LDR-DEMO', score: 80, isDemo: true },
  ];
  const branches: Array<Awaited<ReturnType<typeof prisma.branch.create>>> = [];
  for (const b of branchSeed) {
    branches.push(await prisma.branch.create({ data: b }));
  }
  const byName = (n: string) => branches.find((b) => b.nameAr === n)!;

  // ── البنود ──
  for (const it of ITEMS) {
    await prisma.item.create({
      data: {
        code: it.code,
        titleAr: it.titleAr,
        fineText: it.fineText,
        fineAmount: it.fineAmount,
        mode: it.mode,
        category: 'violation',
      },
    });
  }

  // ── الحالات التاريخية (6) مع سلسلة أدلة ──
  const now = Date.now();
  let refCounter = 1041;
  const nextRef = () => `RY-${refCounter++}`;

  // حالة السلسلة (نبنيها يدويًا بترتيب حتمي)
  let prevHash = GENESIS_HASH;
  let chainIndex = 0;
  async function appendEvidence(opts: {
    caseId: string;
    code: string;
    kind: 'detection' | 'correction';
    cameraName: string;
    signedAt: Date;
    positive?: boolean;
  }) {
    const scene = opts.positive
      ? SEED_SCENES.find((s) => s.status === 'compliant')!
      : sceneByCode(opts.code);
    const imageB64 = opts.positive
      ? placeholderDataUri('لقطة التصحيح — مطابقة', '#1B4A3A')
      : loadSceneDataUri(scene);
    const sha256 = computeEvidenceHash(imageB64, prevHash);
    await prisma.evidence.create({
      data: {
        caseId: opts.caseId,
        kind: opts.kind,
        imageB64,
        annotatedB64: null,
        sha256,
        prevHash,
        chainIndex,
        cameraName: opts.cameraName,
        signedAt: opts.signedAt,
      },
    });
    prevHash = sha256;
    chainIndex += 1;
  }

  interface CaseDef {
    branch: string;
    code: string;
    status: 'corrected' | 'in_grace' | 'new';
    detectedHoursAgo: number;
    correctedHoursAgo?: number;
    route?: 'auto' | 'review';
    camera: string;
  }
  const caseDefs: CaseDef[] = [
    { branch: 'النخيل 3', code: '3/8/1/1', status: 'corrected', detectedHoursAgo: 120, correctedHoursAgo: 74, camera: 'CAM-01 · صالة الفرز' },
    { branch: 'الياسمين', code: '7/8/1/1', status: 'corrected', detectedHoursAgo: 96, correctedHoursAgo: 55, camera: 'CAM-02 · طاولة الكي' },
    { branch: 'الوسام 2', code: '1/4/1/1', status: 'in_grace', detectedHoursAgo: 10, camera: 'CAM-01 · الاستلام' },
    { branch: 'الروابي', code: '10/4/1/1', status: 'in_grace', detectedHoursAgo: 20, camera: 'CAM-03 · الكي' },
    { branch: 'البستان', code: '1/5/1/1', status: 'in_grace', detectedHoursAgo: 30, camera: 'CAM-04 · الخلفية' },
    { branch: 'النخيل 3', code: '6/5/1/1', status: 'new', detectedHoursAgo: 1, camera: 'CAM-05 · مخرج النفايات' },
  ];

  for (const def of caseDefs) {
    const branch = byName(def.branch);
    const item = ITEMS.find((i) => i.code === def.code)!;
    const scene = sceneByCode(def.code);
    const detectedAt = new Date(now - def.detectedHoursAgo * HOUR);
    const graceDeadline = new Date(detectedAt.getTime() + GRACE_MS);
    const correctedAt = def.correctedHoursAgo ? new Date(now - def.correctedHoursAgo * HOUR) : null;

    const c = await prisma.case.create({
      data: {
        refNo: nextRef(),
        branchId: branch.id,
        itemCode: item.code,
        status: def.status,
        confidence: scene.confidence,
        route: scene.confidence >= 0.85 ? 'auto' : 'review',
        noteAr: scene.noteAr,
        potentialFine: item.fineAmount,
        bbox: JSON.stringify(scene.bbox),
        detectedAt,
        graceDeadline,
        correctedAt,
        isDemoData: false,
      },
    });

    // دليل الرصد
    await appendEvidence({ caseId: c.id, code: def.code, kind: 'detection', cameraName: def.camera, signedAt: detectedAt });

    // أحداث الجدول الزمني
    const events: { kind: string; labelAr: string; at: Date }[] = [
      { kind: 'detected', labelAr: 'رُصدت المخالفة آليًا ووُقّع الدليل', at: detectedAt },
      { kind: 'notified', labelAr: 'أُبلغ المالك عبر الرسائل', at: new Date(detectedAt.getTime() + 4 * 60 * 1000) },
      { kind: 'grace_started', labelAr: 'بدء مهلة التصحيح (48 ساعة)', at: new Date(detectedAt.getTime() + 5 * 60 * 1000) },
    ];
    if (def.status === 'corrected' && correctedAt) {
      await appendEvidence({ caseId: c.id, code: def.code, kind: 'correction', cameraName: def.camera, signedAt: correctedAt, positive: true });
      events.push({ kind: 'corrected', labelAr: 'رُفعت لقطة تصحيح مطابقة — أُغلقت الحالة', at: correctedAt });
    }
    for (const ev of events) {
      await prisma.caseEvent.create({ data: { caseId: c.id, kind: ev.kind, labelAr: ev.labelAr, at: ev.at } });
    }
  }

  // ── حفظ حالة السلسلة ──
  await prisma.chainMeta.create({ data: { id: 1, lastHash: prevHash, lastIndex: chainIndex - 1 } });

  // ── طابور المراجعة البشرية (ثقة 0.60–0.84) ──
  const reviewSeed = [
    { code: '10/4/1/1', branch: 'الوسام 2', confidence: 0.79 },
    { code: '6/5/1/1', branch: 'الروابي', confidence: 0.72 },
    { code: '1/5/1/1', branch: 'الياسمين', confidence: 0.68 },
  ];
  let rref = 5001;
  for (const r of reviewSeed) {
    const scene = sceneByCode(r.code);
    await prisma.reviewItem.create({
      data: {
        refNo: `RV-${rref++}`,
        branchName: r.branch,
        itemCode: r.code,
        confidence: r.confidence,
        noteAr: scene.noteAr,
        imageB64: loadSceneDataUri(scene),
        bbox: JSON.stringify(scene.bbox),
        status: 'pending',
        isDemoData: false,
      },
    });
  }

  // ── حالة التطبيق ──
  await prisma.appState.create({ data: { key: 'lastReset', value: new Date(now).toISOString() } });
  await prisma.appState.create({ data: { key: 'confidenceThreshold', value: '0.85' } });

  console.log(`✅ تمت التهيئة: ${branches.length} فروع، ${ITEMS.length} بنود، ${caseDefs.length} حالات، ${chainIndex} دليل في السلسلة.`);
}

main()
  .catch((e) => {
    console.error('❌ فشل seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
