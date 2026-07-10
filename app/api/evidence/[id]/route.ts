// ── تقديم صورة الدليل (من S3 أو القاعدة) للمستخدمين المصادَقين فقط ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { evidenceBytesB64 } from '@/lib/chain';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

  const ev = await prisma.evidence.findUnique({ where: { id: params.id } });
  if (!ev) return NextResponse.json({ error: 'الدليل غير موجود' }, { status: 404 });

  const b64 = await evidenceBytesB64(ev);
  if (!b64) {
    return NextResponse.json(
      { error: 'أُتلفت بايتات الدليل وفق سياسة الاحتفاظ (90 يومًا) — البصمة باقية في السلسلة' },
      { status: 410 },
    );
  }
  return new NextResponse(Buffer.from(b64, 'base64'), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300' },
  });
}
