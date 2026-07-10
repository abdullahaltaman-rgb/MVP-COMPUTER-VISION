// ── تصنيف المعايرة: كل حدث يُوسم صحيح/خاطئ (بوابة الأسبوع الثاني ≥90% على 200+) ──
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const Body = z.object({
  eventId: z.string().min(1),
  label: z.enum(['correct', 'incorrect']),
});

export async function POST(req: Request) {
  const auth = await requireRole('ops');
  if ('error' in auth) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'حمولة غير صالحة' }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id: parsed.data.eventId } });
  if (!event) return NextResponse.json({ error: 'الحدث غير موجود' }, { status: 404 });

  await prisma.event.update({
    where: { id: event.id },
    data: { label: parsed.data.label, labeledBy: auth.user.id, labeledAt: new Date() },
  });
  await audit(auth.user, 'calibration_label', 'event', event.id, {
    label: parsed.data.label,
    itemCode: event.itemCode,
  });
  return NextResponse.json({ ok: true });
}
