import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { detect } from '@/lib/detector';
import { appendEvidence } from '@/lib/chain';
import { getThreshold } from '@/lib/cases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const caseId: string = body.caseId;
    const imageB64: string = body.imageB64 || '';
    if (!caseId || !imageB64 || imageB64.length < 32) {
      return NextResponse.json({ ok: false, message: 'بيانات غير صالحة' }, { status: 400 });
    }

    const c = await prisma.case.findUnique({ where: { id: caseId }, include: { item: true } });
    if (!c) return NextResponse.json({ ok: false, message: 'الحالة غير موجودة' }, { status: 404 });
    if (c.status === 'corrected') {
      return NextResponse.json({ ok: true, corrected: true, message: 'الحالة مُصححة بالفعل.' });
    }

    const threshold = await getThreshold();
    const det = await detect(imageB64, { source: 'upload' });
    const stillViolated = det.results.some(
      (r) => r.code === c.itemCode && r.status === 'violation' && r.confidence >= threshold,
    );

    // مع Gemini نحكم فعليًا؛ مع المحاكاة نقبل التصحيح (لا يمكنها الحكم على لقطة تصحيح)
    const accept = det.provider === 'mock' ? true : !stillViolated;

    if (!accept) {
      return NextResponse.json({
        ok: true,
        corrected: false,
        provider: det.provider,
        message: 'لا يزال البند مرصودًا في اللقطة — يُرجى إعادة الالتقاط بعد التصحيح.',
      });
    }

    const now = new Date();
    await appendEvidence(prisma, {
      caseId: c.id,
      imageB64,
      cameraName: 'لقطة تصحيح — المالك',
      kind: 'correction',
      signedAt: now,
    });
    await prisma.case.update({ where: { id: c.id }, data: { status: 'corrected', correctedAt: now } });
    await prisma.caseEvent.create({
      data: { caseId: c.id, kind: 'corrected', labelAr: 'رُفعت لقطة تصحيح مطابقة ووُقّعت — أُغلقت الحالة', at: now },
    });
    // تحسين مؤشر الفرع
    await prisma.branch.update({ where: { id: c.branchId }, data: { score: { increment: 2 } } }).catch(() => {});

    return NextResponse.json({ ok: true, corrected: true, provider: det.provider, message: 'تم توثيق التصحيح وإغلاق الحالة.' });
  } catch (e: any) {
    console.error('owner correct error', e);
    return NextResponse.json({ ok: false, message: 'تعذّر رفع التصحيح', detail: String(e?.message || e) }, { status: 500 });
  }
}
