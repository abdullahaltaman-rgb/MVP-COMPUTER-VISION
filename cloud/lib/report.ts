// ── التقرير الأسبوعي الموقّع للكفيل (الخميس 17:00 بتوقيت الرياض) + بصمة التشغيل اليومية ──
import prisma from './db';
import { ITEMS, ITEM_MAP } from './catalog';
import { chainRoot } from './chain';
import { signPayload, signBytes, canonicalJson } from './sign';
import { notify } from './notify';
import { s3Enabled, s3Put } from './s3';
import { generateWeeklyPdf, pdfFontsAvailable } from './pdf';
import { formatDate, formatDateTime } from './format';

/** مؤشر امتثال مبسّط: 100 - (تصعيدات×10 + حالات مفتوحة×5)، حده الأدنى 40 */
export function complianceScore(opened: number, corrected: number, escalated: number): number {
  const openNow = Math.max(0, opened - corrected - escalated);
  return Math.max(40, Math.min(100, 100 - escalated * 10 - openNow * 5));
}

export async function buildWeeklyReport(branchId: string, periodStart: Date, periodEnd: Date) {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
  const range = { gte: periodStart, lt: periodEnd };

  const [totalEvents, cases, escalations] = await Promise.all([
    prisma.event.count({ where: { branchId, occurredAt: range } }),
    prisma.case.findMany({ where: { branchId, detectedAt: range } }),
    prisma.case.findMany({
      where: { branchId, status: 'escalated', escalatedAt: range },
      orderBy: { escalatedAt: 'desc' },
    }),
  ]);

  const casesOpened = cases.length;
  const casesCorrected = cases.filter((c) => c.status === 'corrected').length;
  const casesEscalated = escalations.length;
  const openCases = await prisma.case.count({
    where: { branchId, status: { in: ['new', 'notified', 'in_grace'] } },
  });

  const perItem = ITEMS.map((item) => {
    const itemCases = cases.filter((c) => c.itemCode === item.code);
    return {
      code: item.code,
      titleAr: item.titleAr,
      opened: itemCases.length,
      corrected: itemCases.filter((c) => c.status === 'corrected').length,
      escalated: itemCases.filter((c) => c.status === 'escalated').length,
    };
  });

  const root = await chainRoot(prisma);
  const payload = {
    kind: 'weekly_report',
    version: 1,
    branch: { id: branch.id, code: branch.code, nameAr: branch.nameAr, licenseNo: branch.licenseNo },
    period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
    stats: {
      totalEvents,
      casesOpened,
      casesCorrected,
      casesEscalated,
      openCases,
      complianceScore: complianceScore(casesOpened, casesCorrected, casesEscalated),
    },
    perItem,
    escalations: escalations.map((e) => ({
      refNo: e.refNo,
      itemCode: e.itemCode,
      reason: e.escalationReason,
      escalatedAt: e.escalatedAt?.toISOString(),
    })),
    chainRoot: root.rootHash,
    generatedAt: new Date().toISOString(),
  };
  return { branch, payload };
}

/** يولّد ويوقّع ويخزّن تقرير أسبوع لفرع، ثم يُشعر الكفيل (يحترم الوضع الصامت) */
export async function createWeeklyReport(branchId: string, periodStart: Date, periodEnd: Date) {
  const { branch, payload } = await buildWeeklyReport(branchId, periodStart, periodEnd);

  // توليد PDF وتوقيع بايتاته؛ عند غياب الخطوط نوقّع الحمولة القانونية (canonical JSON)
  let s3KeyPdf: string | null = null;
  let signed;
  if (pdfFontsAvailable()) {
    const pdf = await generateWeeklyPdf({
      branchNameAr: branch.nameAr,
      branchCode: branch.code,
      licenseNo: branch.licenseNo,
      periodStartLabel: formatDate(periodStart),
      periodEndLabel: formatDate(new Date(periodEnd.getTime() - 1)),
      stats: payload.stats,
      perItem: payload.perItem,
      escalations: payload.escalations.map((e) => ({
        refNo: e.refNo,
        itemCode: e.itemCode,
        titleAr: ITEM_MAP[e.itemCode]?.titleAr ?? e.itemCode,
        reason: e.reason === 'grace_expired' ? 'انتهاء المهلة' : 'تكرار خلال 7 أيام',
      })),
      chainRoot: payload.chainRoot,
      generatedAtLabel: formatDateTime(new Date()),
    });
    signed = signBytes(pdf);
    if (s3Enabled()) {
      s3KeyPdf = `reports/${branch.code}/weekly-${periodStart.toISOString().slice(0, 10)}.pdf`;
      await s3Put(s3KeyPdf, pdf, 'application/pdf');
    } else {
      // تطوير محلي بلا S3: يُخزَّن الـ PDF داخل الحمولة (base64) لتنزيله لاحقًا
      (payload as Record<string, unknown>).pdfB64 = pdf.toString('base64');
    }
  } else {
    signed = signPayload(payload);
  }

  const report = await prisma.report.create({
    data: {
      kind: 'weekly',
      branchId,
      periodStart,
      periodEnd,
      payload: payload as object,
      sha256: signed.sha256,
      signature: signed.signature,
      algo: signed.algo,
      s3KeyPdf,
    },
  });

  await notify({
    audience: 'kafeel',
    branchId,
    type: 'weekly_report',
    titleAr: `التقرير الأسبوعي الموقّع — ${branch.nameAr}`,
    bodyAr: `مؤشر الامتثال ${payload.stats.complianceScore}% · ${payload.stats.casesOpened} حالات · ${payload.stats.casesEscalated} تصعيد`,
    data: { reportId: report.id },
  });
  await prisma.report.update({ where: { id: report.id }, data: { notifiedAt: new Date() } });

  return report;
}

/** بصمة التشغيل اليومية الموقّعة — سجل يومي غير قابل للإنكار لحالة المنظومة */
export async function createDailyDigest(date: Date) {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const range = { gte: dayStart, lt: dayEnd };

  const [events, casesOpened, casesCorrected, casesEscalated, devices, root] = await Promise.all([
    prisma.event.count({ where: { occurredAt: range } }),
    prisma.case.count({ where: { detectedAt: range } }),
    prisma.case.count({ where: { correctedAt: range } }),
    prisma.case.count({ where: { escalatedAt: range } }),
    prisma.device.findMany({ select: { id: true, name: true, lastSeenAt: true } }),
    chainRoot(prisma),
  ]);

  const payload = {
    kind: 'ops_digest',
    version: 1,
    date: dayStart.toISOString().slice(0, 10),
    events,
    casesOpened,
    casesCorrected,
    casesEscalated,
    devices: devices.map((d) => ({
      id: d.id,
      name: d.name,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    })),
    chainRoot: root.rootHash,
    chainIndex: root.index,
    generatedAt: new Date().toISOString(),
  };

  const signed = signPayload(payload);
  return prisma.opsDigest.upsert({
    where: { date: dayStart },
    update: {
      payload: payload as object,
      rootHash: root.rootHash,
      sha256: signed.sha256,
      signature: signed.signature,
      algo: signed.algo,
    },
    create: {
      date: dayStart,
      payload: payload as object,
      rootHash: root.rootHash,
      sha256: signed.sha256,
      signature: signed.signature,
      algo: signed.algo,
    },
  });
}

export { canonicalJson };
