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

  const ACTIVE = ['new', 'notified', 'in_grace'];
  const active = cases.filter((c) => ACTIVE.includes(c.status)).length;
  const corrected = cases.filter((c) => c.status === 'corrected').length;
  const escalated = cases.filter((c) => c.status === 'escalated').length;

  // ── تجميع حالة الامتثال لكل فرع (إضافة غير كاسرة — تغذّي خريطة الأمانة) ──
  // مُصعّدة ← أحمر | نشطة ضمن المهلة ← كهرماني | غير ذلك ← أخضر
  const branchStats = branches.map((b) => {
    const own = cases.filter((c) => c.branchId === b.id);
    const a = own.filter((c) => ACTIVE.includes(c.status)).length;
    const e = own.filter((c) => c.status === 'escalated').length;
    return {
      branchId: b.id,
      activeCases: a,
      escalatedCases: e,
      compliance: e > 0 ? 'alert' : a > 0 ? 'warn' : 'ok',
    };
  });

  return NextResponse.json({
    branches,
    cases,
    stats: { total: cases.length, active, corrected, escalated },
    branchStats,
    chainRoot: root,
    digests,
  });
}
