// ── طابور المراجعة: اعتماد (يفتح حالة) / استبعاد — مع تغذية المعايرة تلقائيًا ──
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { openCaseFromEvent } from '@/lib/cases';

export const dynamic = 'force-dynamic';

const Body = z.object({
  eventId: z.string().min(1),
  action: z.enum(['approve', 'reject']),
});

export async function POST(req: Request) {
  const auth = await requireRole('ops');
  if ('error' in auth) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'حمولة غير صالحة' }, { status: 400 });
  const { eventId, action } = parsed.data;

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: 'الحدث غير موجود' }, { status: 404 });
  if (event.status !== 'pending') {
    return NextResponse.json({ error: 'الحدث ليس بانتظار المراجعة' }, { status: 409 });
  }

  if (action === 'approve') {
    // الاعتماد أثناء الوضع الصامت يبقي الحالة داخلية (الإشعارات مكبوتة في notify)
    const kase = await openCaseFromEvent({ eventId, route: 'review' });
    await prisma.event.update({
      where: { id: eventId },
      data: { label: 'correct', labeledBy: auth.user.id, labeledAt: new Date() },
    });
    await audit(auth.user, 'review_approve', 'event', eventId, { caseId: kase?.id });
    return NextResponse.json({ ok: true, caseId: kase?.id });
  }

  // استبعاد = إنذار كاذب — يُصنَّف خاطئ تلقائيًا ويغذي مقاييس الدقة
  await prisma.event.update({
    where: { id: eventId },
    data: {
      status: 'rejected',
      label: 'incorrect',
      labeledBy: auth.user.id,
      labeledAt: new Date(),
      // تنظيف الإطار المؤقت من meta (يبقى frameKey في S3 حتى دورة الإتلاف)
      meta: cleanMeta(event.meta),
    },
  });
  await audit(auth.user, 'review_reject', 'event', eventId);
  return NextResponse.json({ ok: true });
}

function cleanMeta(meta: unknown): object {
  const m = { ...((meta as Record<string, unknown>) || {}) };
  delete m.frameB64;
  return m as object;
}
