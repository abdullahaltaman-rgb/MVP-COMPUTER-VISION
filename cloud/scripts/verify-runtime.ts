// تحقق تشغيلي M1/M3: السلسلة، البوابة، دورة الحياة، الوضع الصامت، البصمة، التقرير
import { PrismaClient } from '@prisma/client';
import { appendEvidence, verifyChain, chainRoot } from '../lib/chain';
import { gate } from '../lib/rules';
import { openCaseFromEvent, closeCaseCorrected, escalateCase } from '../lib/cases';
import { createDailyDigest, createWeeklyReport } from '../lib/report';
import { calibrationSummary, computeDailyMetrics } from '../lib/metrics';
import { ensureRuleConfigs } from '../lib/rules';
import { processVerdict } from '../lib/semantic';

const prisma = new PrismaClient();
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

const FAKE_JPEG = Buffer.from('fake-jpeg-bytes-for-test-' + 'x'.repeat(200)).toString('base64');

async function main() {
  const branch = await prisma.branch.findFirstOrThrow();
  const device = await prisma.device.findFirstOrThrow();

  // 1) بوابة الثقة
  const rule = await prisma.ruleConfig.findUniqueOrThrow({ where: { itemCode: '7/8/1/1' } });
  check('بوابة: 0.9 → auto', gate(0.9, rule) === 'auto');
  check('بوابة: 0.7 → review', gate(0.7, rule) === 'review');
  check('بوابة: 0.5 → drop', gate(0.5, rule) === 'drop');

  // 2) الوضع الصامت مفعّل افتراضيًا
  check('SILENT_MODE افتراضي', branch.silentMode === true);

  // 3) حدث صامت (auto ثقة لكنه يذهب مراجعة)
  const silentEvent = await prisma.event.create({
    data: {
      dedupeKey: 'test-silent-1',
      branchId: branch.id,
      deviceId: device.id,
      cameraKey: 'cam_processing',
      itemCode: '7/8/1/1',
      confidence: 0.93,
      decision: 'review',
      silent: true,
      source: 'live',
      zonesHit: ['processing_area'],
      occurredAt: new Date(),
      meta: { frameB64: FAKE_JPEG },
    },
  });
  check('حدث صامت → decision=review', silentEvent.decision === 'review');

  // 4) إطفاء الوضع الصامت ثم فتح حالة من الحدث (مسار الاعتماد)
  await prisma.branch.update({ where: { id: branch.id }, data: { silentMode: false } });
  const kase = await openCaseFromEvent({ eventId: silentEvent.id, route: 'review' });
  check('فُتحت حالة من الحدث', Boolean(kase?.id && kase.refNo.startsWith('AV-')));
  check('الحالة in_grace بعد الإبلاغ', (await prisma.case.findUnique({ where: { id: kase!.id } }))!.status === 'in_grace');
  check('مهلة 48 ساعة', Math.abs(kase!.graceDeadline.getTime() - kase!.detectedAt.getTime() - 48 * 3600e3) < 5 * 60e3
    || Math.abs(kase!.graceDeadline.getTime() - Date.now() - 48 * 3600e3) < 5 * 60e3);

  // إشعار المشغّل أُرسل (skipped_no_fcm بلا Firebase — المهم أنه غير مكبوت)
  const notif = await prisma.notification.findFirst({ where: { caseId: kase!.id, type: 'case_opened' } });
  check('إشعار case_opened سُجّل', Boolean(notif), notif?.status);

  // 5) سلسلة العهدة: دليل الرصد وُقّع تلقائيًا + التحقق
  let vr = await verifyChain(prisma);
  check('السلسلة سليمة بعد دليل الرصد', vr.ok && vr.total === 1);

  // إغلاق بالتصحيح → دليل ثانٍ
  await closeCaseCorrected(kase!.id, FAKE_JPEG + 'CORRECTION', 'تصحيح تجريبي');
  vr = await verifyChain(prisma);
  check('السلسلة سليمة بعد التصحيح (سجلان)', vr.ok && vr.total === 2);
  check('الحالة صُححت', (await prisma.case.findUnique({ where: { id: kase!.id } }))!.status === 'corrected');
  const closeNotif = await prisma.notification.findFirst({ where: { caseId: kase!.id, type: 'case_closed' } });
  check('إشعار الإغلاق للمشغّل', Boolean(closeNotif));

  // 6) كشف العبث: تعديل بايت واحد يكسر التحقق
  const ev0 = await prisma.evidence.findFirstOrThrow({ where: { chainIndex: 0 } });
  await prisma.evidence.update({ where: { id: ev0.id }, data: { imageB64: ev0.imageB64 + 'X' } });
  vr = await verifyChain(prisma);
  check('العبث يكسر التحقق', !vr.ok && vr.brokenCount >= 1);
  await prisma.evidence.update({ where: { id: ev0.id }, data: { imageB64: ev0.imageB64 } });
  vr = await verifyChain(prisma);
  check('الاستعادة تصلح التحقق', vr.ok);

  // 7) التصعيد: حالة منتهية المهلة + تصعيد للكفيل
  const ev2 = await prisma.event.create({
    data: {
      dedupeKey: 'test-escalate-1', branchId: branch.id, deviceId: device.id,
      cameraKey: 'cam_processing', itemCode: '1/4/1/1', confidence: 0.9,
      decision: 'auto', silent: false, source: 'live', zonesHit: ['processing_area'],
      occurredAt: new Date(), meta: { frameB64: FAKE_JPEG + '2' },
    },
  });
  const kase2 = await openCaseFromEvent({ eventId: ev2.id, route: 'auto' });
  await prisma.case.update({ where: { id: kase2!.id }, data: { graceDeadline: new Date(Date.now() - 1000) } });
  await escalateCase(kase2!.id, 'grace_expired');
  const k2 = await prisma.case.findUnique({ where: { id: kase2!.id } });
  check('التصعيد بعد انتهاء المهلة', k2!.status === 'escalated' && k2!.escalationReason === 'grace_expired');
  const escNotif = await prisma.notification.findFirst({ where: { caseId: kase2!.id, type: 'escalation', audience: 'kafeel' } });
  check('إشعار التصعيد للكفيل', Boolean(escNotif));

  // تكرار نفس البند خلال 7 أيام → تصعيد تلقائي عند فتح الحالة الثانية
  const ev3 = await prisma.event.create({
    data: {
      dedupeKey: 'test-repeat-1', branchId: branch.id, deviceId: device.id,
      cameraKey: 'cam_processing', itemCode: '1/4/1/1', confidence: 0.9,
      decision: 'auto', silent: false, source: 'live', zonesHit: ['processing_area'],
      occurredAt: new Date(), meta: { frameB64: FAKE_JPEG + '3' },
    },
  });
  const kase3 = await openCaseFromEvent({ eventId: ev3.id, route: 'auto' });
  const repNotif = await prisma.notification.findFirst({
    where: { caseId: kase3!.id, type: 'escalation', audience: 'kafeel' },
  });
  check('تصعيد تكرار 7 أيام', Boolean(repNotif));

  // 8) المعايرة: تصنيفات + مقاييس
  await prisma.event.update({ where: { id: silentEvent.id }, data: { label: 'correct', labeledAt: new Date() } });
  await prisma.event.update({ where: { id: ev2.id }, data: { label: 'correct', labeledAt: new Date() } });
  await prisma.event.update({ where: { id: ev3.id }, data: { label: 'incorrect', labeledAt: new Date() } });
  await computeDailyMetrics(new Date());
  const cal = await calibrationSummary();
  check('ملخص المعايرة يحسب الدقة', cal.totalLabeled === 3 && Math.abs((cal.precision ?? 0) - 2 / 3) < 0.01,
    `دقة=${cal.precision?.toFixed(2)}`);
  check('البوابة غير مجتازة (<200)', cal.gatePassed === false);

  // 9) بصمة التشغيل اليومية الموقّعة
  const digest = await createDailyDigest(new Date());
  check('بصمة تشغيل موقّعة', digest.signature.length > 20 && digest.sha256.length === 64, digest.algo);

  // 10) التقرير الأسبوعي الموقّع + PDF
  const report = await createWeeklyReport(branch.id, new Date(Date.now() - 7 * 864e5), new Date());
  const payload = report.payload as Record<string, unknown>;
  check('تقرير أسبوعي موقّع', report.signature.length > 20, report.algo);
  check('PDF وُلّد (base64 محلي بلا S3)', typeof payload.pdfB64 === 'string' && (payload.pdfB64 as string).length > 5000);
  const wkNotif = await prisma.notification.findFirst({ where: { type: 'weekly_report', audience: 'kafeel' } });
  check('إشعار التقرير للكفيل', Boolean(wkNotif));

  // 10.5) مطابقة PRD §5 (قرارات 2026-07-09): النوافذ والعتبات والتتابع
  await ensureRuleConfigs();
  const prdExpected: Record<string, Partial<{ confirmWindowSec: number; autoThreshold: number; consecutiveChecks: number; zones: string[] }>> = {
    '3/8/1/1': { confirmWindowSec: 60, autoThreshold: 0.85, zones: ['processing_area', 'reception_pos'] },
    '1/4/1/1': { confirmWindowSec: 30, autoThreshold: 0.85 },
    '7/8/1/1': { confirmWindowSec: 120, autoThreshold: 0.85 },
    '1/5/1/1': { autoThreshold: 0.8, consecutiveChecks: 2 },
    '6/5/1/1': { autoThreshold: 0.8, consecutiveChecks: 2 },
    '10/4/1/1': { autoThreshold: 0.8, consecutiveChecks: 2 },
  };
  for (const [code, exp] of Object.entries(prdExpected)) {
    const r = await prisma.ruleConfig.findUniqueOrThrow({ where: { itemCode: code } });
    const ok =
      (exp.confirmWindowSec === undefined || r.confirmWindowSec === exp.confirmWindowSec) &&
      (exp.autoThreshold === undefined || r.autoThreshold === exp.autoThreshold) &&
      (exp.consecutiveChecks === undefined || r.consecutiveChecks === exp.consecutiveChecks) &&
      (exp.zones === undefined || JSON.stringify(r.zones) === JSON.stringify(exp.zones));
    check(`مطابقة PRD §5 — ${code}`, ok,
      `window=${r.confirmWindowSec} th=${r.autoThreshold} consec=${r.consecutiveChecks}`);
  }

  // 11) البند السادس 10/4/1/1: فحصان مجدولان متتاليان → حدث وحالة (E2E)
  const rule6 = await prisma.ruleConfig.findUniqueOrThrow({ where: { itemCode: '10/4/1/1' } });
  check('قاعدة 10/4/1/1 مبذورة (عتبة 0.80، فحصان)',
    rule6.autoThreshold === 0.8 && rule6.consecutiveChecks === 2 && rule6.mode === 'scheduled');

  const mkSnap = () =>
    prisma.snapshot.create({
      data: {
        branchId: branch.id,
        deviceId: device.id,
        cameraKey: 'cam_processing',
        imageB64: FAKE_JPEG,
        takenAt: new Date(),
      },
    });
  const positive = { violation: true, confidence: 0.86, noteAr: 'طاولة كي مكشوفة دون قماش' };
  const eventCount6 = () => prisma.event.count({ where: { itemCode: '10/4/1/1' } });

  // إيجابي أول → لا حدث (بانتظار التتابع)
  await processVerdict(`${(await mkSnap()).id}|10/4/1/1`, positive);
  check('فحص إيجابي أول لا يفتح حدثًا', (await eventCount6()) === 0);
  // سلبي يقطع التتابع
  await processVerdict(`${(await mkSnap()).id}|10/4/1/1`, { violation: false, confidence: 0.9, noteAr: 'مغطاة' });
  await processVerdict(`${(await mkSnap()).id}|10/4/1/1`, positive);
  check('السلبي يصفّر التتابع (إيجابي جديد وحده لا يكفي)', (await eventCount6()) === 0);
  // إيجابي ثانٍ متتالٍ → حدث + حالة (0.86 ≥ 0.80 → آلي، والوضع الصامت مطفأ هنا)
  await processVerdict(`${(await mkSnap()).id}|10/4/1/1`, positive);
  check('الفحص المتتالي الثاني يفتح حدثًا واحدًا', (await eventCount6()) === 1);
  const ev6 = await prisma.event.findFirstOrThrow({ where: { itemCode: '10/4/1/1' } });
  check('حدث 10/4/1/1 آلي من مصدر مجدول', ev6.decision === 'auto' && ev6.source === 'semantic');
  const case6 = await prisma.case.findFirst({ where: { itemCode: '10/4/1/1' } });
  check('فُتحت حالة 10/4/1/1 كاملة (in_grace، غرامة 500)',
    Boolean(case6 && case6.status === 'in_grace' && case6.potentialFine === 500), case6?.refNo ?? '');

  // أعد الوضع الصامت لحالته الافتراضية
  await prisma.branch.update({ where: { id: branch.id }, data: { silentMode: true } });

  console.log(failures === 0 ? '\n✅ كل فحوص M1/M3 التشغيلية ناجحة' : `\n❌ ${failures} فحص فاشل`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
