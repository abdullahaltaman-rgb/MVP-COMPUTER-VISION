// ── cron كل 5 دقائق: تنبيه انقطاع الأجهزة/الكاميرات ≥ 5 دقائق (لغرفة العمليات) ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authorizeCron } from '@/lib/auth';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const OFFLINE_AFTER_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

  const threshold = new Date(Date.now() - OFFLINE_AFTER_MS);
  // أجهزة منقطعة لم يُنبَّه عنها بعد (تنبيه واحد لكل انقطاع)
  const offline = await prisma.device.findMany({
    where: {
      offlineNotifiedAt: null,
      OR: [{ lastSeenAt: { lt: threshold } }, { lastSeenAt: null }],
      // لا نُنبّه عن جهاز لم يتصل قط
      NOT: { lastSeenAt: null },
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

  return NextResponse.json({ offlineAlerts: offline.length });
}
