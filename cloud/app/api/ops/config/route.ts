// ── ضبط عتبات وجداول البنود عن بُعد (الحافة تسحبها عبر /api/edge/config) ──
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const Body = z.object({
  itemCode: z.string().min(1),
  enabled: z.boolean().optional(),
  autoThreshold: z.number().min(0.5).max(1).optional(),
  reviewThreshold: z.number().min(0.3).max(1).optional(),
  confirmWindowSec: z.number().int().min(0).max(3600).optional(),
  cooldownSec: z.number().int().min(0).max(86400).optional(),
  scheduleMinutes: z.number().int().min(15).max(1440).nullable().optional(),
});

export async function POST(req: Request) {
  const auth = await requireRole('ops');
  if ('error' in auth) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'حمولة غير صالحة' }, { status: 400 });
  const { itemCode, ...fields } = parsed.data;

  if (
    fields.autoThreshold !== undefined &&
    fields.reviewThreshold !== undefined &&
    fields.reviewThreshold >= fields.autoThreshold
  ) {
    return NextResponse.json(
      { error: 'عتبة المراجعة يجب أن تكون أدنى من عتبة الإصدار الآلي' },
      { status: 400 },
    );
  }

  const rule = await prisma.ruleConfig.update({ where: { itemCode }, data: fields });
  await audit(auth.user, 'rule_config_update', 'ruleConfig', itemCode, fields);
  return NextResponse.json({ ok: true, rule });
}
