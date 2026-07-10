// ── منطق الصيانة المشترك: يستدعيه cron/tick اليومي المدمج والمسارات الفردية ──
// كل دالة قائمة بذاتها وقابلة للاستدعاء عند الطلب (بديل cron المتكرر على Hobby).
import prisma from './db';
import { notify } from './notify';
import { escalateCase } from './cases';
import { runScheduledSemantic } from './semantic';
import { pollBatch } from './gemini';
import { processVerdict } from './semantic';
import { computeDailyMetrics } from './metrics';
import { createDailyDigest, createWeeklyReport } from './report';
import { s3Delete, s3Enabled } from './s3';
import { audit } from './audit';

const DAY = 24 * 3600 * 1000;
const OFFLINE_AFTER_MS = 5 * 60 * 1000;
const EVIDENCE_RETENTION_DAYS = 90;
const SNAPSHOT_RETENTION_DAYS = 7;
const RECORD_RETENTION_DAYS = 2 * 365;

/** تنبيه انقطاع الأجهزة ≥ 5 دقائق (تنبيه واحد لكل انقطاع) */
export async function runHealthAlerts(): Promise<{ offlineAlerts: number }> {
  const threshold = new Date(Date.now() - OFFLINE_AFTER_MS);
  const offline = await prisma.device.findMany({
    where: {
      offlineNotifiedAt: null,
      lastSeenAt: { lt: threshold },
    },
    include: { branch: { select: { id: true, nameAr: true } } },
  });
  for (const d of offline) {
    await notify({
      audience: 'ops',
      branchId: d.branch.id,
      type: 'device_offline',
      titleAr: `انقطاع جهاز الحافة — ${d.branch.nameAr}`,
      bodyAr: `${d.name} منقطع منذ أكثر من 5 دقائق (آخر نبض: ${d.lastSeenAt?.toISOString() ?? '—'})`,
    });
    await prisma.device.update({
      where: { id: d.id },
      data: { offlineNotifiedAt: new Date() },
    });
  }
  return { offlineAlerts: offline.length };
}

/** تصعيد الحالات المنتهية مهلتها (48 ساعة) */
export async function runLifecycleEscalations(): Promise<{ escalated: number }> {
  const expired = await prisma.case.findMany({
    where: {
      status: { in: ['new', 'notified', 'in_grace'] },
      graceDeadline: { lt: new Date() },
    },
    select: { id: true },
    take: 500,
  });
  for (const c of expired) {
    await escalateCase(c.id, 'grace_expired');
  }
  return { escalated: expired.length };
}

/** استطلاع دفعات Gemini المكتملة ومعالجة أحكامها */
export async function runSemanticPoll(): Promise<{ polled: number; completed: number }> {
  const pending = await prisma.semanticBatch.findMany({
    where: { status: 'submitted', mode: 'batch', batchName: { not: null } },
    take: 10,
  });
  let completed = 0;
  for (const batch of pending) {
    const res = await pollBatch(batch.batchName!);
    if (!res.done) continue;
    if (res.failed) {
      await prisma.semanticBatch.update({
        where: { id: batch.id },
        data: { status: 'failed', completedAt: new Date() },
      });
      continue;
    }
    for (const item of res.items) {
      await processVerdict(item.key, item.verdict);
    }
    await prisma.semanticBatch.update({
      where: { id: batch.id },
      data: { status: 'done', completedAt: new Date(), result: { items: res.items.length } as object },
    });
    completed++;
  }
  return { polled: pending.length, completed };
}

/** مقاييس المعايرة + بصمة التشغيل الموقّعة + سياسات الاحتفاظ (الخصوصية) */
export async function runDailyMaintenance(): Promise<{
  digests: { date: Date; branchId: string }[];
  evidencePurged: number;
  snapshotsPurged: number;
}> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - DAY);

  await computeDailyMetrics(yesterday);
  await computeDailyMetrics(now);

  const digests = await createDailyDigest(yesterday);

  // إتلاف بايتات الأدلة بعد 90 يومًا — البصمة وسلسلة العهدة تبقيان
  const evidenceCutoff = new Date(now.getTime() - EVIDENCE_RETENTION_DAYS * DAY);
  const toPurge = await prisma.evidence.findMany({
    where: { bytesPurged: false, signedAt: { lt: evidenceCutoff } },
    select: { id: true, s3Key: true },
    take: 500,
  });
  for (const ev of toPurge) {
    if (ev.s3Key && s3Enabled()) await s3Delete(ev.s3Key);
    await prisma.evidence.update({ where: { id: ev.id }, data: { imageB64: null, bytesPurged: true } });
  }
  if (toPurge.length) {
    await audit(null, 'evidence_purge_90d', 'evidence', null, { count: toPurge.length });
  }

  // تنظيف base64 المؤقت من الأحداث المكتملة/المرفوضة (الأحداث pending تحتفظ به)
  const staleFrames = await prisma.event.findMany({
    where: {
      status: { in: ['rejected', 'auto_published', 'approved'] },
      receivedAt: { lt: new Date(now.getTime() - 2 * DAY) },
    },
    select: { id: true, meta: true },
    take: 500,
  });
  for (const e of staleFrames) {
    const m = (e.meta as Record<string, unknown>) || {};
    if (m.frameB64) {
      delete m.frameB64;
      await prisma.event.update({ where: { id: e.id }, data: { meta: m as object } });
    }
  }

  // اللقطات الدورية أقدم من 7 أيام
  const snapCutoff = new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * DAY);
  const oldSnaps = await prisma.snapshot.findMany({
    where: { takenAt: { lt: snapCutoff } },
    select: { id: true, s3Key: true },
    take: 1000,
  });
  for (const s of oldSnaps) {
    if (s.s3Key && s3Enabled()) await s3Delete(s.s3Key);
  }
  await prisma.snapshot.deleteMany({ where: { id: { in: oldSnaps.map((s) => s.id) } } });

  // السجلات بعد سنتين
  const recordCutoff = new Date(now.getTime() - RECORD_RETENTION_DAYS * DAY);
  const purgedEvidence = await prisma.evidence.deleteMany({ where: { signedAt: { lt: recordCutoff } } });
  const purgedCases = await prisma.case.deleteMany({
    where: { detectedAt: { lt: recordCutoff }, evidences: { none: {} } },
  });
  const purgedEvents = await prisma.event.deleteMany({ where: { occurredAt: { lt: recordCutoff } } });
  if (purgedCases.count || purgedEvents.count || purgedEvidence.count) {
    await audit(null, 'records_purge_2y', 'system', null, {
      cases: purgedCases.count,
      events: purgedEvents.count,
      evidence: purgedEvidence.count,
    });
  }

  return {
    digests: digests.map((d) => ({ date: d.date, branchId: d.branchId })),
    evidencePurged: toPurge.length,
    snapshotsPurged: oldSnaps.length,
  };
}

/** التقرير الأسبوعي الموقّع لكل فرع (يُستدعى يوم الخميس) */
export async function runWeeklyReports(): Promise<{ reports: string[] }> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - 7 * DAY);
  const branches = await prisma.branch.findMany({ select: { id: true } });
  const reports: string[] = [];
  for (const b of branches) {
    const r = await createWeeklyReport(b.id, periodStart, now);
    reports.push(r.id);
  }
  return { reports };
}

export { runScheduledSemantic };
