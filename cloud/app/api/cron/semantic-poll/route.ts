// ── cron كل 15 دقيقة: استطلاع دفعات Gemini المكتملة ومعالجة أحكامها ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authorizeCron } from '@/lib/auth';
import { pollBatch } from '@/lib/gemini';
import { processVerdict } from '@/lib/semantic';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

  const pending = await prisma.semanticBatch.findMany({
    where: { status: 'submitted', mode: 'batch', batchName: { not: null } },
    take: 10,
  });

  let completed = 0;
  for (const batch of pending) {
    const res = await pollBatch(batch.batchName!);
    if (!res.done) continue;

    if (res.failed) {
      await prisma.semanticBatch.update({
        where: { id: batch.id },
        data: { status: 'failed', completedAt: new Date() },
      });
      continue;
    }

    for (const item of res.items) {
      await processVerdict(item.key, item.verdict);
    }
    await prisma.semanticBatch.update({
      where: { id: batch.id },
      data: {
        status: 'done',
        completedAt: new Date(),
        result: { items: res.items.length } as object,
      },
    });
    completed++;
  }

  return NextResponse.json({ polled: pending.length, completed });
}
