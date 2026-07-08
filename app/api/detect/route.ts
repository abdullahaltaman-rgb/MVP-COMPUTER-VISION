import { NextRequest, NextResponse } from 'next/server';
import { detect, type DetectContext } from '@/lib/detector';
import { applyGating, getThreshold } from '@/lib/cases';
import { consumeRate, RATE_LIMIT } from '@/lib/ratelimit';
import { clientIp } from '@/lib/ip';
import { SEED_SCENES, loadSceneDataUri } from '@/lib/seed-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let imageB64: string = body.imageB64 || body.image || '';
    const annotatedB64: string | null = body.annotatedB64 || null;
    const source: DetectContext['source'] = body.source || 'webcam';
    const seedFile: string | undefined = body.seedFile;
    const cameraName: string | undefined = body.cameraName;
    const explicitMock = body.mock === true || body.mock === 1;

    // مشاهد seed: يحمّل الخادم الصورة بنفسه (لا يعتمد على المتصفح)
    if (source === 'seed' && seedFile) {
      const scene = SEED_SCENES.find((s) => s.file === seedFile);
      if (scene) imageB64 = loadSceneDataUri(scene);
    }

    if (!imageB64 || imageB64.length < 32) {
      return NextResponse.json({ error: 'صورة غير صالحة' }, { status: 400 });
    }

    const hasKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length >= 8;

    // حدّ المعدل لكل IP على مسار Gemini فقط
    let forceMock = explicitMock;
    let rateNotice: string | undefined;
    let rateInfo: { remaining: number; limit: number } | undefined;
    if (hasKey && !explicitMock) {
      const ip = clientIp(req);
      const rate = await consumeRate(ip);
      rateInfo = { remaining: rate.remaining, limit: RATE_LIMIT };
      if (!rate.allowed) {
        forceMock = true;
        rateNotice = `تم بلوغ الحد المسموح (${RATE_LIMIT} فحص/ساعة لكل زائر). تم التحويل مؤقتًا إلى محرّك المحاكاة — يُعاد التعيين خلال ${rate.resetInMin} دقيقة.`;
      }
    }

    const det = await detect(imageB64, { source, seedFile, forceMock });

    const threshold = await getThreshold();
    const outcome = await applyGating(det.results, {
      imageDataUri: imageB64,
      annotatedDataUri: annotatedB64,
      cameraName,
      branchName: source === 'seed' ? seedFile : 'فرع العرض الحي',
      threshold,
      isDemoData: true,
    });

    return NextResponse.json({
      provider: det.provider,
      notice: rateNotice || det.notice || null,
      results: det.results,
      threshold,
      case: outcome.created ? { id: outcome.caseId, refNo: outcome.refNo, itemCode: outcome.itemCode } : null,
      reviewQueued: outcome.reviewQueued,
      discarded: outcome.discarded,
      rate: rateInfo || null,
      debugError: (det as any).debugError || null,
    });
  } catch (e: any) {
    console.error('detect error', e);
    return NextResponse.json({ error: 'تعذّر إجراء الفحص', detail: String(e?.message || e) }, { status: 500 });
  }
}
