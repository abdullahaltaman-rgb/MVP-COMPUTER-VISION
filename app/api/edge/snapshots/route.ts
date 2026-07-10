// ── لقطات دورية من كاميرات الحافة لأغراض الفحص الدلالي المجدول (كل 120 دقيقة) ──
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { authenticateDevice } from '@/lib/auth';
import { s3Enabled, s3Put } from '@/lib/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  cameraKey: z.string().min(1).max(50),
  takenAt: z.string().datetime({ offset: true }),
  frameB64: z.string().min(100),
});

export async function POST(req: Request) {
  const auth = await authenticateDevice();
  if ('error' in auth) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'حمولة غير صالحة' }, { status: 400 });
  }
  const b = parsed.data;

  let s3Key: string | null = null;
  if (s3Enabled()) {
    s3Key = `snapshots/${auth.device.id}/${b.cameraKey}/${Date.parse(b.takenAt)}.jpg`;
    await s3Put(s3Key, Buffer.from(b.frameB64, 'base64'));
  }

  const snap = await prisma.snapshot.create({
    data: {
      branchId: auth.device.branchId,
      deviceId: auth.device.id,
      cameraKey: b.cameraKey,
      s3Key,
      imageB64: s3Key ? null : b.frameB64,
      takenAt: new Date(b.takenAt),
    },
  });

  return NextResponse.json({ ok: true, snapshotId: snap.id });
}
