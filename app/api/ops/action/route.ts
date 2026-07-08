import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { seedDatabase } from '@/lib/seed-core';
import { simulateTamper, restoreTamper } from '@/lib/maintenance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action: string = body.action;

    switch (action) {
      case 'tamper': {
        const r = await simulateTamper();
        return NextResponse.json(r);
      }
      case 'restore': {
        const r = await restoreTamper();
        return NextResponse.json(r);
      }
      case 'reset': {
        const r = await seedDatabase(prisma);
        return NextResponse.json({ ok: true, message: 'أُعيدت تهيئة بيانات العرض.', ...r });
      }
      case 'threshold': {
        const value = Math.min(0.99, Math.max(0.5, Number(body.value) || 0.85));
        await prisma.appState.upsert({
          where: { key: 'confidenceThreshold' },
          create: { key: 'confidenceThreshold', value: String(value) },
          update: { value: String(value) },
        });
        return NextResponse.json({ ok: true, value });
      }
      case 'review': {
        const id: string = body.id;
        const decision: 'approved' | 'rejected' = body.decision;
        const item = await prisma.reviewItem.findUnique({ where: { id } });
        if (!item) return NextResponse.json({ ok: false, message: 'عنصر غير موجود' }, { status: 404 });
        await prisma.reviewItem.update({ where: { id }, data: { status: decision } });
        return NextResponse.json({ ok: true, decision });
      }
      default:
        return NextResponse.json({ ok: false, message: 'إجراء غير معروف' }, { status: 400 });
    }
  } catch (e: any) {
    console.error('ops action error', e);
    return NextResponse.json({ ok: false, message: 'تعذّر تنفيذ الإجراء', detail: String(e?.message || e) }, { status: 500 });
  }
}
