// ── cron يومي (00:30 بتوقيت الرياض): مقاييس المعايرة + بصمة التشغيل الموقّعة + سياسات الاحتفاظ ──
// حراس الخصوصية: إتلاف بايتات الأدلة بعد 90 يومًا (تبقى البصمات في السلسلة)،
// اللقطات الدورية بعد 7 أيام، والسجلات (أحداث/حالات) بعد سنتين.
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authorizeCron } from '@/lib/auth';
import { computeDailyMetrics } from '@/lib/metrics';
import { createDailyDigest } from '@/lib/report';
import { s3Delete, s3Enabled } from '@/lib/s3';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DAY = 24 * 3600 * 1000;
const EVIDENCE_RETENTION_DAYS = 90;
const SNAPSHOT_RETENTION_DAYS = 7;
const RECORD_RETENTION_DAYS = 2 * 365;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

  const now = new Date();
  const yesterday = new Date(now.getTime() - DAY);

  // 1) مقاييس المعايرة (اليوم والأمس لالتقاط التصنيفات المتأخرة)
  await computeDailyMetrics(yesterday);
  await computeDailyMetrics(now);

  // 2) بصمة التشغيل اليومية الموقّعة لكل فرع (عن يوم أمس المكتمل)
  const digests = await createDailyDigest(yesterday);

  // 3) إتلاف بايتات الأدلة بعد 90 يومًا — البصمة وسلسلة العهدة تبقيان
  const evidenceCutoff = new Date(now.getTime() - EVIDENCE_RETENTION_DAYS * DAY);
  const toPurge = await prisma.evidence.findMany({
    where: { bytesPurged: false, signedAt: { lt: evidenceCutoff } },
    select: { id: true, s3Key: true },
    take: 500,
  });
  for (const ev of toPurge) {
    if (ev.s3Key && s3Enabled()) await s3Delete(ev.s3Key);
    await prisma.evidence.update({
      where: { id: ev.id },
      data: { imageB64: null, bytesPurged: true },
    });
  }
  if (toPurge.length) {
    await audit(null, 'evidence_purge_90d', 'evidence', null, { count: toPurge.length });
  }

  // 4) إطارات الأحداث المرفوضة/المكتملة: تنظيف base64 المؤقت من meta
  //    (الأحداث pending تحتفظ به لطابور المراجعة)
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

  // 5) اللقطات الدورية أقدم من 7 أيام
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

  // 6) السجلات بعد سنتين: حالات + أدلتها (بادئة السلسلة) + أحداث
  const recordCutoff = new Date(now.getTime() - RECORD_RETENTION_DAYS * DAY);
  const purgedEvidence = await prisma.evidence.deleteMany({
    where: { signedAt: { lt: recordCutoff } },
  });
  const purgedCases = await prisma.case.deleteMany({
    where: { detectedAt: { lt: recordCutoff }, evidences: { none: {} } },
  });
  const purgedEvents = await prisma.event.deleteMany({
    where: { occurredAt: { lt: recordCutoff } },
  });
  if (purgedCases.count || purgedEvents.count || purgedEvidence.count) {
    await audit(null, 'records_purge_2y', 'system', null, {
      cases: purgedCases.count,
      events: purgedEvents.count,
      evidence: purgedEvidence.count,
    });
  }

  return NextResponse.json({
    ok: true,
    digests: digests.map((d) => ({ date: d.date, branchId: d.branchId })),
    evidencePurged: toPurge.length,
    snapshotsPurged: oldSnaps.length,
  });
}
