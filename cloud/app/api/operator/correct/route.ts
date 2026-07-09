// ── رفع لقطة التصحيح → إعادة كشف (Gemini) → إغلاق تلقائي عند زوال المخالفة ──
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { semanticCheck, geminiEnabled } from '@/lib/gemini';
import { closeCaseCorrected } from '@/lib/cases';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  caseId: z.string().min(1),
  imageB64: z.string().min(100),
});

export async function POST(req: Request) {
  const auth = await requireRole('operator');
  if ('error' in auth) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'حمولة غير صالحة' }, { status: 400 });
  const { caseId, imageB64 } = parsed.data;

  const kase = await prisma.case.findUnique({ where: { id: caseId } });
  if (!kase) return NextResponse.json({ error: 'الحالة غير موجودة' }, { status: 404 });
  if (kase.branchId !== auth.user.branchId) {
    return NextResponse.json({ error: 'الحالة ليست ضمن فرعك' }, { status: 403 });
  }
  if (kase.status === 'corrected') {
    return NextResponse.json({ error: 'الحالة مغلقة مسبقًا' }, { status: 409 });
  }
  if (kase.status === 'escalated') {
    return NextResponse.json(
      { error: 'الحالة مُصعّدة — التصحيح بعد التصعيد يتم عبر غرفة العمليات' },
      { status: 409 },
    );
  }

  // إعادة الكشف: هل ما زالت المخالفة قائمة في لقطة التصحيح؟
  const rule = await prisma.ruleConfig.findUnique({ where: { itemCode: kase.itemCode } });
  let stillPresent = false;
  let noteAr = 'تصحيح موثّق من المشغّل';
  if (rule?.semanticPromptAr && geminiEnabled()) {
    const verdict = await semanticCheck(rule.semanticPromptAr, imageB64);
    if (verdict) {
      stillPresent = verdict.violation && verdict.confidence >= rule.reviewThreshold;
      noteAr = verdict.noteAr || noteAr;
    }
  }

  if (stillPresent) {
    await prisma.caseEvent.create({
      data: {
        caseId,
        kind: 'recheck_failed',
        labelAr: `أُعيد الكشف — المخالفة ما زالت ظاهرة (${noteAr})`,
      },
    });
    await audit(auth.user, 'correction_recheck_failed', 'case', caseId);
    return NextResponse.json({
      ok: false,
      closed: false,
      reason: 'إعادة الكشف تُظهر أن المخالفة ما زالت قائمة — صحّح الوضع والتقط لقطة جديدة',
    });
  }

  await closeCaseCorrected(caseId, imageB64, noteAr);
  await audit(auth.user, 'correction_accepted', 'case', caseId);
  return NextResponse.json({ ok: true, closed: true });
}
