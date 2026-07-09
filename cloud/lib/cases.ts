// ── دورة حياة الحالة (PRD §5): new → notified → in_grace(48h) → corrected | escalated ──
import prisma from './db';
import { ITEM_MAP, CAMERAS_AR } from './catalog';
import { appendEvidence } from './chain';
import { notify } from './notify';

export const GRACE_HOURS = 48;
export const REPEAT_WINDOW_DAYS = 7;

async function nextRefNo(): Promise<string> {
  const year = new Date().getFullYear();
  const key = `case_seq_${year}`;
  const next = await prisma.$transaction(async (tx) => {
    const state = await tx.appState.upsert({
      where: { key },
      update: {},
      create: { key, value: '0' },
    });
    const n = parseInt(state.value || '0', 10) + 1;
    await tx.appState.update({ where: { key }, data: { value: String(n) } });
    return n;
  });
  return `AV-${year}-${String(next).padStart(4, '0')}`;
}

export interface OpenCaseInput {
  eventId: string;
  route: 'auto' | 'review';
}

/**
 * يفتح حالة من حدث (آلي أو معتمد من المراجعة):
 * ينشئ الحالة + يوقّع الدليل في السلسلة + يبدأ المهلة 48 ساعة + إشعار المشغّل الفوري
 * + فحص تكرار نفس البند خلال 7 أيام → تصعيد للكفيل.
 */
export async function openCaseFromEvent(input: OpenCaseInput) {
  const event = await prisma.event.findUnique({ where: { id: input.eventId } });
  if (!event) throw new Error('الحدث غير موجود');
  if (event.caseId) return prisma.case.findUnique({ where: { id: event.caseId } });

  const item = ITEM_MAP[event.itemCode];
  if (!item) throw new Error(`بند غير معروف: ${event.itemCode}`);

  const refNo = await nextRefNo();
  const now = new Date();
  const graceDeadline = new Date(now.getTime() + GRACE_HOURS * 3600 * 1000);

  const kase = await prisma.case.create({
    data: {
      refNo,
      branchId: event.branchId,
      itemCode: event.itemCode,
      status: 'new',
      confidence: event.confidence,
      route: input.route,
      cameraKey: event.cameraKey,
      noteAr: event.noteAr,
      potentialFine: item.fineAmount,
      detectedAt: event.occurredAt,
      graceDeadline,
      timeline: {
        create: [{ kind: 'detected', labelAr: `رُصد آليًا — ${item.titleAr}` }],
      },
    },
  });

  await prisma.event.update({
    where: { id: event.id },
    data: { caseId: kase.id, status: input.route === 'auto' ? 'auto_published' : 'approved' },
  });

  // توقيع الدليل في سلسلة العهدة (الإطار مأخوذ من الحافة عبر S3/القاعدة)
  const frameB64 = event.meta && (event.meta as Record<string, unknown>).frameB64;
  if (typeof frameB64 === 'string' && frameB64.length > 0) {
    await appendEvidence(prisma, {
      caseId: kase.id,
      eventId: event.id,
      imageB64: frameB64,
      cameraName: CAMERAS_AR[event.cameraKey] || event.cameraKey,
      kind: 'detection',
    });
    // البايتات صارت في السلسلة — ننظف الحقل المؤقت من الحدث
    const meta = { ...(event.meta as Record<string, unknown>) };
    delete meta.frameB64;
    await prisma.event.update({ where: { id: event.id }, data: { meta: meta as object } });
  }

  // إشعار المشغّل الفوري + بدء المهلة
  await notify({
    audience: 'operator',
    branchId: event.branchId,
    caseId: kase.id,
    type: 'case_opened',
    titleAr: `حالة جديدة — بند ${event.itemCode}`,
    bodyAr: `${item.titleAr} · مهلة التصحيح 48 ساعة · الغرامة المحتملة ${item.fineText}`,
    data: { refNo },
  });

  await prisma.case.update({
    where: { id: kase.id },
    data: {
      status: 'in_grace',
      notifiedAt: now,
      timeline: {
        create: [
          { kind: 'notified', labelAr: 'أُبلغ المشغّل فوريًا عبر الإشعارات' },
          { kind: 'grace_started', labelAr: 'بدأت مهلة التصحيح (48 ساعة)' },
        ],
      },
    },
  });

  // تصعيد التكرار: نفس البند بنفس الفرع خلال 7 أيام
  const repeatCount = await prisma.case.count({
    where: {
      branchId: event.branchId,
      itemCode: event.itemCode,
      id: { not: kase.id },
      detectedAt: {
        gte: new Date(now.getTime() - REPEAT_WINDOW_DAYS * 24 * 3600 * 1000),
      },
    },
  });
  if (repeatCount > 0) {
    await notify({
      audience: 'kafeel',
      branchId: event.branchId,
      caseId: kase.id,
      type: 'escalation',
      titleAr: `تصعيد — تكرار بند ${event.itemCode} خلال 7 أيام`,
      bodyAr: `${item.titleAr} · تكرر ${repeatCount + 1} مرات خلال أسبوع بالفرع`,
      data: { refNo, reason: 'repeat_7d' },
    });
  }

  return prisma.case.findUnique({ where: { id: kase.id } });
}

/** إغلاق الحالة بعد تصحيح موثّق (يُستدعى بعد نجاح إعادة الكشف) */
export async function closeCaseCorrected(
  caseId: string,
  correctionB64: string,
  noteAr: string,
) {
  const kase = await prisma.case.findUnique({ where: { id: caseId } });
  if (!kase) throw new Error('الحالة غير موجودة');

  await appendEvidence(prisma, {
    caseId,
    imageB64: correctionB64,
    cameraName: 'لقطة تصحيح المشغّل',
    kind: 'correction',
  });

  const item = ITEM_MAP[kase.itemCode];
  await prisma.case.update({
    where: { id: caseId },
    data: {
      status: 'corrected',
      correctedAt: new Date(),
      timeline: { create: [{ kind: 'corrected', labelAr: `صُححت — ${noteAr}` }] },
    },
  });

  await notify({
    audience: 'operator',
    branchId: kase.branchId,
    caseId,
    type: 'case_closed',
    titleAr: `أُغلقت الحالة ${kase.refNo}`,
    bodyAr: `${item?.titleAr ?? kase.itemCode} — تم توثيق التصحيح ضمن المهلة`,
    data: { refNo: kase.refNo },
  });
}

/** تصعيد حالة انتهت مهلتها (يستدعيه cron دورة الحياة) */
export async function escalateCase(caseId: string, reason: 'grace_expired' | 'repeat_7d') {
  const kase = await prisma.case.findUnique({ where: { id: caseId } });
  if (!kase || kase.status === 'corrected' || kase.status === 'escalated') return;

  const item = ITEM_MAP[kase.itemCode];
  await prisma.case.update({
    where: { id: caseId },
    data: {
      status: 'escalated',
      escalatedAt: new Date(),
      escalationReason: reason,
      timeline: {
        create: [
          {
            kind: 'escalated',
            labelAr:
              reason === 'grace_expired'
                ? 'صُعّدت — انتهت مهلة التصحيح دون إغلاق'
                : 'صُعّدت — تكرار نفس البند خلال 7 أيام',
          },
        ],
      },
    },
  });

  await notify({
    audience: 'kafeel',
    branchId: kase.branchId,
    caseId,
    type: 'escalation',
    titleAr: `تصعيد — الحالة ${kase.refNo}`,
    bodyAr: `${item?.titleAr ?? kase.itemCode} · ${
      reason === 'grace_expired' ? 'انتهت مهلة الـ 48 ساعة دون تصحيح' : 'تكرار خلال 7 أيام'
    }`,
    data: { refNo: kase.refNo, reason },
  });
}
