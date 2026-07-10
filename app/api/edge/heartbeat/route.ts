// ── نبض الحافة كل 60 ثانية: حالة الصندوق + حالة كل كاميرا ──
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { authenticateDevice } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const Body = z.object({
  version: z.string().max(50).optional(),
  ipAddr: z.string().max(60).optional(),
  cameras: z
    .array(
      z.object({
        key: z.string().min(1).max(50),
        online: z.boolean(),
        fps: z.number().min(0).max(120).optional(),
      }),
    )
    .default([]),
  stats: z.record(z.unknown()).optional(),
});

export async function POST(req: Request) {
  const auth = await authenticateDevice();
  if ('error' in auth) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'حمولة غير صالحة' }, { status: 400 });
  }
  const b = parsed.data;
  const now = new Date();

  await prisma.device.update({
    where: { id: auth.device.id },
    data: {
      lastSeenAt: now,
      version: b.version,
      ipAddr: b.ipAddr,
      lastStats: (b.stats || {}) as object,
      offlineNotifiedAt: null, // عاد متصلًا — يُسمح بتنبيه انقطاع جديد لاحقًا
    },
  });

  for (const cam of b.cameras) {
    await prisma.camera.updateMany({
      where: { deviceId: auth.device.id, key: cam.key },
      data: {
        online: cam.online,
        fps: cam.fps ?? null,
        lastSeenAt: cam.online ? now : undefined,
      },
    });
  }

  return NextResponse.json({ ok: true, serverTime: now.toISOString() });
}
