// ── نظرة عامة لكونسول العمليات: الطابور، صحة الأجهزة، المعايرة، القواعد، التدقيق ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { calibrationSummary } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

const OFFLINE_AFTER_MS = 5 * 60 * 1000; // تنبيه انقطاع ≥ 5 دقائق

export async function GET() {
  const auth = await requireRole('ops');
  if ('error' in auth) return auth.error;

  const now = Date.now();
  const [queue, devices, branches, rules, audit, calibration, recentNotifications] =
    await Promise.all([
      prisma.event.findMany({
        where: { decision: 'review', status: 'pending' },
        orderBy: { receivedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          branchId: true,
          cameraKey: true,
          itemCode: true,
          confidence: true,
          source: true,
          zonesHit: true,
          noteAr: true,
          silent: true,
          occurredAt: true,
          receivedAt: true,
        },
      }),
      prisma.device.findMany({
        include: { cameras: { orderBy: { key: 'asc' } }, branch: { select: { nameAr: true } } },
      }),
      prisma.branch.findMany({
        // districtAr/licenseNo/score: يغذّيان شريط معلومات المنشأة في شاشة التفتيش (إضافة غير كاسرة)
        select: {
          id: true,
          code: true,
          nameAr: true,
          silentMode: true,
          districtAr: true,
          licenseNo: true,
          score: true,
        },
      }),
      prisma.ruleConfig.findMany({ orderBy: { itemCode: 'asc' } }),
      prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: 50 }),
      calibrationSummary(),
      prisma.notification.findMany({ orderBy: { at: 'desc' }, take: 30 }),
    ]);

  // أحداث غير مصنّفة (المعايرة تتطلب تصنيف كل حدث)
  const unlabeled = await prisma.event.findMany({
    where: { label: null, status: { in: ['approved', 'auto_published', 'rejected'] } },
    orderBy: { receivedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      itemCode: true,
      cameraKey: true,
      confidence: true,
      decision: true,
      status: true,
      occurredAt: true,
    },
  });

  // ── سجل مخالفات المنشأة (آخر 90 يومًا) — يغذّي العمود الجانبي في شاشة التفتيش ──
  const since = new Date(now - 90 * 24 * 3600 * 1000);
  const cases = await prisma.case.findMany({
    where: { detectedAt: { gte: since } },
    orderBy: { detectedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      refNo: true,
      branchId: true,
      itemCode: true,
      status: true,
      confidence: true,
      potentialFine: true,
      detectedAt: true,
      graceDeadline: true,
    },
  });

  return NextResponse.json({
    queue,
    unlabeled,
    cases,
    devices: devices.map((d) => ({
      id: d.id,
      name: d.name,
      branchNameAr: d.branch.nameAr,
      version: d.version,
      lastSeenAt: d.lastSeenAt,
      online: d.lastSeenAt ? now - d.lastSeenAt.getTime() < OFFLINE_AFTER_MS : false,
      cameras: d.cameras.map((c) => ({
        key: c.key,
        nameAr: c.nameAr,
        online: c.online && Boolean(d.lastSeenAt && now - d.lastSeenAt.getTime() < OFFLINE_AFTER_MS),
        fps: c.fps,
        lastSeenAt: c.lastSeenAt,
      })),
    })),
    branches,
    rules,
    audit,
    calibration,
    notifications: recentNotifications,
  });
}
