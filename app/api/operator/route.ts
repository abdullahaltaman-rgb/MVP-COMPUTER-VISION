// ── لوحة المشغّل: تنبيهاتي + حالات فرعي بعدادات المهل ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireRole('operator');
  if ('error' in auth) return auth.error;
  const branchId = auth.user.branchId;
  if (!branchId) return NextResponse.json({ error: 'لا فرع مرتبط' }, { status: 400 });

  const OFFLINE_AFTER_MS = 5 * 60 * 1000;
  const now = Date.now();

  const [branch, cases, notifications, devices] = await Promise.all([
    prisma.branch.findUnique({
      where: { id: branchId },
      // score: يغذّي حلقة مؤشر الامتثال في لوحة المشغّل (إضافة غير كاسرة)
      select: {
        id: true,
        nameAr: true,
        districtAr: true,
        licenseNo: true,
        silentMode: true,
        score: true,
      },
    }),
    prisma.case.findMany({
      where: { branchId },
      orderBy: { detectedAt: 'desc' },
      take: 50,
      include: {
        evidences: {
          select: { id: true, kind: true, chainIndex: true, sha256: true, cameraName: true, signedAt: true, bytesPurged: true },
          orderBy: { chainIndex: 'asc' },
        },
        timeline: { orderBy: { at: 'asc' } },
      },
    }),
    prisma.notification.findMany({
      where: { branchId, audience: 'operator', status: 'sent' },
      orderBy: { at: 'desc' },
      take: 30,
    }),
    // كاميرات الفرع — تغذّي شبكة البث المباشر (إضافة غير كاسرة)
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

  return NextResponse.json({ branch, cases, notifications, cameras });
}
