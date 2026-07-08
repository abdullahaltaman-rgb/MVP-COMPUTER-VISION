import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// يبثّ صورة الدليل (annotated إن طُلبت) بصيغتها الأصلية — يُبقي الاستقصاء خفيفًا
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const annotated = url.searchParams.get('annotated') === '1';
  const ev = await prisma.evidence.findUnique({ where: { id: params.id } });
  if (!ev) return new NextResponse('غير موجود', { status: 404 });

  const dataUri = (annotated && ev.annotatedB64) || ev.imageB64;
  const m = dataUri.match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return new NextResponse('صيغة غير صالحة', { status: 415 });
  const mime = m[1];
  const buf = Buffer.from(m[2], 'base64');
  return new NextResponse(buf, {
    headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' },
  });
}
