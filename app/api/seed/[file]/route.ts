import { NextRequest, NextResponse } from 'next/server';
import { SEED_SCENES, loadSceneDataUri, placeholderDataUri } from '@/lib/seed-images';

export const runtime = 'nodejs';

// يعرض صورة المشهد (حقيقية أو بديل رمادي) — لا يتعطّل أبدًا
export async function GET(_req: NextRequest, { params }: { params: { file: string } }) {
  const scene = SEED_SCENES.find((s) => s.file === params.file);
  const dataUri = scene ? loadSceneDataUri(scene) : placeholderDataUri('مشهد غير معروف');
  const m = dataUri.match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return new NextResponse('خطأ', { status: 500 });
  const buf = Buffer.from(m[2], 'base64');
  return new NextResponse(buf, {
    headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=3600' },
  });
}
