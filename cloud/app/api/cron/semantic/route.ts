// ── cron كل 120 دقيقة: الفحوصات الدلالية المجدولة (Gemini 2.5 Flash-Lite Batch) ──
import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/auth';
import { runScheduledSemantic } from '@/lib/semantic';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const result = await runScheduledSemantic();
  return NextResponse.json(result);
}
