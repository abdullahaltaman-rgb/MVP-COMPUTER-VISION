// ── cron الخميس 14:00 UTC = 17:00 بتوقيت الرياض: التقرير الأسبوعي الموقّع لكل فرع ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authorizeCron } from '@/lib/auth';
import { createWeeklyReport } from '@/lib/report';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

  const now = new Date();
  const periodStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const branches = await prisma.branch.findMany({ select: { id: true } });
  const reports: string[] = [];
  for (const b of branches) {
    const r = await createWeeklyReport(b.id, periodStart, now);
    reports.push(r.id);
  }

  return NextResponse.json({ ok: true, reports });
}
