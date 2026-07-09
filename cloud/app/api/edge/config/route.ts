// ── الإعداد عن بُعد للحافة: قواعد البنود الخمسة + SILENT_MODE + دوريات اللقطات ──
// الجسر يسحب هذا كل دورة heartbeat ويطبّقه فورًا (تحديث عن بُعد دون إعادة نشر).
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateDevice } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await authenticateDevice();
  if ('error' in auth) return auth.error;

  const [branch, rules] = await Promise.all([
    prisma.branch.findUnique({
      where: { id: auth.device.branchId },
      select: { id: true, code: true, silentMode: true },
    }),
    prisma.ruleConfig.findMany({ orderBy: { itemCode: 'asc' } }),
  ]);

  const scheduled = rules.filter((r) => r.mode === 'scheduled' && r.enabled);
  const snapshotIntervalMinutes = scheduled.length
    ? Math.min(...scheduled.map((r) => r.scheduleMinutes ?? 120))
    : 0;

  return NextResponse.json({
    branchId: branch?.id,
    branchCode: branch?.code,
    silentMode: branch?.silentMode ?? true,
    heartbeatSec: 60,
    snapshotIntervalMinutes,
    rules: rules.map((r) => ({
      itemCode: r.itemCode,
      enabled: r.enabled,
      mode: r.mode,
      autoThreshold: r.autoThreshold,
      reviewThreshold: r.reviewThreshold,
      confirmWindowSec: r.confirmWindowSec,
      cooldownSec: r.cooldownSec,
      zones: r.zones,
      objects: r.objects,
      scheduleMinutes: r.scheduleMinutes,
    })),
  });
}
