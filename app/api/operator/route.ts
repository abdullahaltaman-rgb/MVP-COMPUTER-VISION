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

  const [branch, cases, notifications] = await Promise.all([
    prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, nameAr: true, districtAr: true, licenseNo: true, silentMode: true },
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
  ]);

  return NextResponse.json({ branch, cases, notifications });
}
