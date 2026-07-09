// ── لوحة الأمانة (قراءة فقط — بيانات حقيقية، وصول داخلي) ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { chainRoot } from '@/lib/chain';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireRole('ministry', 'ops');
  if ('error' in auth) return auth.error;

  const [branches, cases, root, digests] = await Promise.all([
    prisma.branch.findMany({
      select: { id: true, code: true, nameAr: true, districtAr: true, licenseNo: true, score: true },
    }),
    prisma.case.findMany({
      orderBy: { detectedAt: 'desc' },
      take: 100,
      include: { branch: { select: { nameAr: true, districtAr: true } } },
    }),
    chainRoot(prisma),
    prisma.opsDigest.findMany({ orderBy: { date: 'desc' }, take: 14 }),
  ]);

  const active = cases.filter((c) => ['new', 'notified', 'in_grace'].includes(c.status)).length;
  const corrected = cases.filter((c) => c.status === 'corrected').length;
  const escalated = cases.filter((c) => c.status === 'escalated').length;

  return NextResponse.json({
    branches,
    cases,
    stats: { total: cases.length, active, corrected, escalated },
    chainRoot: root,
    digests,
  });
}
