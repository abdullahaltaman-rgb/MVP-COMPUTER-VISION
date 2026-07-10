// ── ingest الأحداث من جسر الحافة (مصادقة برمز جهاز) ──
// البوابة السحابية هي مصدر الحقيقة: تحقق دلالي اختياري → بوابة الثقة → صامت/آلي/مراجعة.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { authenticateDevice } from '@/lib/auth';
import { gate } from '@/lib/rules';
import { semanticCheck, geminiEnabled } from '@/lib/gemini';
import { openCaseFromEvent } from '@/lib/cases';
import { s3Enabled, s3Put } from '@/lib/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  dedupeKey: z.string().min(8).max(200),
  cameraKey: z.string().min(1).max(50),
  itemCode: z.string().min(1).max(20),
  confidence: z.number().min(0).max(1),
  occurredAt: z.string().datetime({ offset: true }),
  zonesHit: z.array(z.string()).default([]),
  noteAr: z.string().max(500).optional(),
  // إطار الدليل JPEG base64 (بدون أي صوت — حارس خصوصية)
  frameB64: z.string().min(100),
  meta: z.record(z.unknown()).optional(),
});

export async function POST(req: Request) {
  const auth = await authenticateDevice();
  if ('error' in auth) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'حمولة غير صالحة', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;

  // منع الازدواج عند إعادة الإرسال من طابور offline
  const existing = await prisma.event.findUnique({ where: { dedupeKey: b.dedupeKey } });
  if (existing) {
    return NextResponse.json({ accepted: true, duplicate: true, eventId: existing.id });
  }

  const rule = await prisma.ruleConfig.findUnique({ where: { itemCode: b.itemCode } });
  if (!rule || !rule.enabled) {
    return NextResponse.json({ accepted: false, reason: 'بند غير مفعّل' });
  }

  const branch = await prisma.branch.findUnique({
    where: { id: auth.device.branchId },
    select: { id: true, silentMode: true },
  });
  if (!branch) return NextResponse.json({ error: 'فرع غير موجود' }, { status: 500 });

  // ── تحقق دلالي سحابي للبنود الحية التي تتطلب سمات (زي/ملابس على الأرض…) ──
  let confidence = b.confidence;
  let noteAr = b.noteAr || null;
  const needsSemantic = Boolean((b.meta as Record<string, unknown> | undefined)?.verify === 'semantic');
  if (needsSemantic && rule.semanticPromptAr && geminiEnabled()) {
    const verdict = await semanticCheck(rule.semanticPromptAr, b.frameB64);
    if (verdict) {
      if (!verdict.violation) {
        // Gemini ينفي المخالفة → يهمَل الحدث (لا يدخل حتى المراجعة)
        return NextResponse.json({ accepted: true, gated: 'drop', reason: 'نفي دلالي' });
      }
      confidence = verdict.confidence;
      noteAr = verdict.noteAr || noteAr;
    }
  }

  // ── بوابة الثقة (سحابية — مصدر الحقيقة) ──
  const gated = gate(confidence, rule);
  if (gated === 'drop') {
    return NextResponse.json({ accepted: true, gated: 'drop' });
  }

  // SILENT_MODE: كل الرصدات إلى طابور المراجعة فقط — صفر إشعارات للعميل
  const silent = branch.silentMode;
  const decision = silent ? 'review' : gated;

  // رفع الإطار إلى S3 (المفتاح للعرض)، مع إبقاء base64 في meta مؤقتًا لتوقيع السلسلة عند فتح الحالة
  let frameKey: string | null = null;
  if (s3Enabled()) {
    frameKey = `frames/${b.dedupeKey.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;
    await s3Put(frameKey, Buffer.from(b.frameB64, 'base64'));
  }

  const event = await prisma.event.create({
    data: {
      dedupeKey: b.dedupeKey,
      branchId: branch.id,
      deviceId: auth.device.id,
      cameraKey: b.cameraKey,
      itemCode: b.itemCode,
      confidence,
      decision,
      status: 'pending',
      source: 'live',
      zonesHit: b.zonesHit,
      frameKey,
      noteAr,
      silent,
      occurredAt: new Date(b.occurredAt),
      meta: { ...(b.meta || {}), frameB64: b.frameB64 } as object,
    },
  });

  // إصدار آلي (خارج الوضع الصامت فقط): فتح حالة + توقيع الدليل + إشعار المشغّل
  let caseId: string | null = null;
  if (!silent && gated === 'auto') {
    const kase = await openCaseFromEvent({ eventId: event.id, route: 'auto' });
    caseId = kase?.id ?? null;
  }

  return NextResponse.json({
    accepted: true,
    eventId: event.id,
    gated,
    silent,
    caseId,
  });
}
