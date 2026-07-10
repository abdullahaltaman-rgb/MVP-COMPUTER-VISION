// ── الصيانة اليومية: مقاييس + بصمة موقّعة + الاحتفاظ (ضمن النبضة اليومية؛ ومتاح عند الطلب) ──
import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/auth';
import { runDailyMaintenance } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runDailyMaintenance()) });
}
