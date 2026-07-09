// ── إطار الحدث لطابور المراجعة (S3 أو meta المؤقت) ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { s3Get, s3Enabled } from '@/lib/s3';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user || (user.role !== 'ops' && user.role !== 'ministry')) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  const event = await prisma.event.findUnique({ where: { id: params.id } });
  if (!event) return NextResponse.json({ error: 'الحدث غير موجود' }, { status: 404 });

  let buf: Buffer | null = null;
  if (event.frameKey && s3Enabled()) {
    buf = await s3Get(event.frameKey);
  }
  if (!buf) {
    const b64 = (event.meta as Record<string, unknown> | null)?.frameB64;
    if (typeof b64 === 'string') buf = Buffer.from(b64, 'base64');
  }
  if (!buf) return NextResponse.json({ error: 'الإطار غير متوفر' }, { status: 410 });

  return new NextResponse(buf, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300' },
  });
}
