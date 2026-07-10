// ── مفتاح SILENT_MODE (بوابة إلزامية): تشغيل = كل الرصدات للمراجعة فقط، صفر إشعارات عميل ──
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { calibrationSummary } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

const Body = z.object({
  branchId: z.string().min(1),
  silentMode: z.boolean(),
  /** إطفاء الوضع الصامت قبل اجتياز بوابة المعايرة يتطلب تأكيدًا صريحًا */
  overrideGate: z.boolean().default(false),
});

export async function POST(req: Request) {
  const auth = await requireRole('ops');
  if ('error' in auth) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'حمولة غير صالحة' }, { status: 400 });
  const { branchId, silentMode, overrideGate } = parsed.data;

  // بوابة الإطلاق: لا go-live دون دقة ≥90% على 200+ حدث مصنَّف
  if (!silentMode) {
    const cal = await calibrationSummary(branchId);
    if (!cal.gatePassed && !overrideGate) {
      return NextResponse.json(
        {
          error: 'بوابة المعايرة غير مجتازة',
          detail: `المطلوب دقة ≥ ${Math.round(cal.gateMinPrecision * 100)}% على ${cal.gateMinEvents}+ حدث مصنَّف — الحالي: ${
            cal.precision === null ? '—' : Math.round(cal.precision * 100) + '%'
          } على ${cal.totalLabeled} حدث`,
          calibration: {
            totalLabeled: cal.totalLabeled,
            precision: cal.precision,
            gatePassed: cal.gatePassed,
          },
        },
        { status: 412 },
      );
    }
  }

  await prisma.branch.update({ where: { id: branchId }, data: { silentMode } });
  await audit(auth.user, silentMode ? 'silent_mode_on' : 'silent_mode_off', 'branch', branchId, {
    overrideGate,
  });
  return NextResponse.json({ ok: true, silentMode });
}
