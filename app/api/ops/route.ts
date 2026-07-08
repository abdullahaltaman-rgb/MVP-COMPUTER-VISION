import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyChain } from '@/lib/chain';
import { getThreshold } from '@/lib/cases';
import { ITEM_MAP } from '@/lib/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [reviews, threshold, verify, tamper] = await Promise.all([
    prisma.reviewItem.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'desc' } }),
    getThreshold(),
    verifyChain(prisma),
    prisma.appState.findUnique({ where: { key: 'tamper' } }),
  ]);

  return NextResponse.json({
    threshold,
    tamperActive: !!tamper,
    chain: { ok: verify.ok, total: verify.total, brokenCount: verify.brokenCount, rootHash: verify.rootHash },
    reviews: reviews.map((r) => ({
      id: r.id,
      refNo: r.refNo,
      branchName: r.branchName,
      itemCode: r.itemCode,
      itemTitle: ITEM_MAP[r.itemCode]?.titleAr ?? r.itemCode,
      confidence: r.confidence,
      noteAr: r.noteAr,
    })),
  });
}
