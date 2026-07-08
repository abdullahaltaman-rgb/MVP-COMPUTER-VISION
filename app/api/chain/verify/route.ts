import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyChain } from '@/lib/chain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const v = await verifyChain(prisma);
  // لا نُعيد الصور — فقط ملخّص التحقق
  return NextResponse.json({
    ok: v.ok,
    total: v.total,
    brokenCount: v.brokenCount,
    rootHash: v.rootHash,
    records: v.records.map((r) => ({
      id: r.id,
      caseId: r.caseId,
      chainIndex: r.chainIndex,
      sha256: r.sha256,
      ok: r.ok,
      reason: r.reason,
    })),
  });
}
