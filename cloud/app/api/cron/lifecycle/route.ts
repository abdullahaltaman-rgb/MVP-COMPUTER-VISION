// ── تصعيد الحالات المنتهية مهلتها (يُشغَّل ضمن النبضة اليومية؛ ومتاح عند الطلب) ──
import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/auth';
import { runLifecycleEscalations } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  return NextResponse.json(await runLifecycleEscalations());
}
