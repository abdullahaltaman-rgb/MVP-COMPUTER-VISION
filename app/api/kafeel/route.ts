// ── لوحة الكفيل: مؤشر الفرع + الحالات (قراءة) + التقارير الموقّعة + التصعيدات ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { complianceScore } from '@/lib/report';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireRole('kafeel');
  if ('error' in auth) return auth.error;
  const branchId = auth.user.branchId;
  if (!branchId) return NextResponse.json({ error: 'لا فرع مرتبط' }, { status: 400 });

  const OFFLINE_AFTER_MS = 5 * 60 * 1000;
  const now = Date.now();
  const monthAgo = new Date(now - 30 * 24 * 3600 * 1000);

  const [branch, cases, reports, escalations, monthCases, devices] = await Promise.all([
    prisma.branch.findUnique({
      where: { id: branchId },
      // code/score: يغذّيان بطاقة الفرع وحلقة المؤشر في محفظة الكفيل (إضافة غير كاسرة)
      select: {
        id: true,
        code: true,
        nameAr: true,
        districtAr: true,
        licenseNo: true,
        score: true,
      },
    }),
    prisma.case.findMany({
      where: { branchId },
      orderBy: { detectedAt: 'desc' },
      take: 50,
      include: { timeline: { orderBy: { at: 'asc' } } },
    }),
    prisma.report.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        kind: true,
        periodStart: true,
        periodEnd: true,
        sha256: true,
        signature: true,
        algo: true,
        s3KeyPdf: true,
        createdAt: true,
        payload: true,
      },
    }),
    prisma.case.findMany({
      where: { branchId, status: 'escalated' },
      orderBy: { escalatedAt: 'desc' },
      take: 20,
    }),
    prisma.case.findMany({ where: { branchId, detectedAt: { gte: monthAgo } } }),
    // كاميرات الفرع — تغذّي «عرض التفاصيل والبث» (إضافة غير كاسرة)
    prisma.device.findMany({
      where: { branchId },
      include: { cameras: { orderBy: { key: 'asc' } } },
    }),
  ]);

  const cameras = devices.flatMap((d) =>
    d.cameras.map((c) => ({
      key: c.key,
      nameAr: c.nameAr,
      online:
        c.online && Boolean(d.lastSeenAt && now - d.lastSeenAt.getTime() < OFFLINE_AFTER_MS),
    })),
  );

  const opened = monthCases.length;
  const corrected = monthCases.filter((c) => c.status === 'corrected').length;
  const escalated = monthCases.filter((c) => c.status === 'escalated').length;

  return NextResponse.json({
    branch,
    score: complianceScore(opened, corrected, escalated),
    monthStats: { opened, corrected, escalated },
    cases,
    reports: reports.map((r) => {
      const payload = r.payload as { stats?: unknown } | null;
      // لا نُرسل الـ PDF المضمّن في الحمولة (تطوير محلي) ضمن القائمة
      return { ...r, payload: undefined, stats: payload?.stats };
    }),
    escalations,
    cameras,
  });
}
