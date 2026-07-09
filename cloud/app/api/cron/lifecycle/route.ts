// ── cron كل 15 دقيقة: تصعيد الحالات المنتهية مهلتها (48 ساعة) ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authorizeCron } from '@/lib/auth';
import { escalateCase } from '@/lib/cases';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

  const expired = await prisma.case.findMany({
    where: {
      status: { in: ['new', 'notified', 'in_grace'] },
      graceDeadline: { lt: new Date() },
    },
    select: { id: true },
    take: 200,
  });

  for (const c of expired) {
    await escalateCase(c.id, 'grace_expired');
  }

  return NextResponse.json({ escalated: expired.length });
}
