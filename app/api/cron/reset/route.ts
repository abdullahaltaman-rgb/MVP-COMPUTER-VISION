import { NextRequest, NextResponse } from 'next/server';
import { wipeStaleDemoData } from '@/lib/maintenance';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// يُستدعى من Vercel Cron كل 6 ساعات — يمسح بيانات الزوّار القديمة
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const provided = req.nextUrl.searchParams.get('secret');
  if (secret && auth !== `Bearer ${secret}` && provided !== secret) {
    return NextResponse.json({ ok: false, message: 'غير مصرّح' }, { status: 401 });
  }
  const r = await wipeStaleDemoData(6);
  await prisma.appState.upsert({
    where: { key: 'lastMaintenance' },
    create: { key: 'lastMaintenance', value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
  return NextResponse.json({ ok: true, ...r });
}
