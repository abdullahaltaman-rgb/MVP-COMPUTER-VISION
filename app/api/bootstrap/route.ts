import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrapped } from '@/lib/bootstrap';
import { usingTurso } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// نقطة تهيئة احتياطية تُستدعى من المتصفح: تُنشئ الجداول وتزرع البيانات إن لزم.
// ?force=1 يُعيد الفحص حتى لو سبق الإقلاع.
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';
  const r = await ensureBootstrapped(force);
  return NextResponse.json({
    ok: true,
    usingTurso,
    ...r,
    message: r.seeded
      ? 'تمت التهيئة وزرع بيانات العرض بنجاح.'
      : r.created
        ? 'الجداول جاهزة، والبيانات موجودة مسبقًا.'
        : 'التطبيق مُهيَّأ بالفعل.',
  });
}
