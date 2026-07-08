import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ITEM_MAP } from '@/lib/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const cases = await prisma.case.findMany({
    orderBy: { detectedAt: 'desc' },
    include: { branch: true, item: true, evidences: { orderBy: { chainIndex: 'asc' }, take: 1 } },
  });

  const rows = cases.map((c) => ({
    id: c.id,
    refNo: c.refNo,
    branchName: c.branch.nameAr,
    district: c.branch.districtAr,
    itemCode: c.itemCode,
    itemTitle: c.item.titleAr,
    fineText: ITEM_MAP[c.itemCode]?.fineText ?? '',
    noteAr: c.noteAr,
    detectedAt: c.detectedAt.toISOString(),
    graceDeadline: c.graceDeadline.toISOString(),
    status: c.status,
    confidence: c.confidence,
    evidenceId: c.evidences[0]?.id ?? null,
    correctionEvidenceId: null as string | null,
  }));

  const open = rows.filter((r) => ['new', 'notified', 'in_grace'].includes(r.status));
  const closed = rows.filter((r) => r.status === 'corrected');

  return NextResponse.json({ open, closed, total: rows.length });
}
