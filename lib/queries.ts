import { prisma } from './db';
import { getOverview } from './stats';
import { chainRoot, verifyChain } from './chain';
import { ITEM_MAP } from './catalog';
import { ensureBootstrapped } from './bootstrap';

export interface MinistryCaseRow {
  id: string;
  refNo: string;
  branchName: string;
  district: string;
  itemCode: string;
  itemTitle: string;
  noteAr: string | null;
  detectedAt: string;
  graceDeadline: string;
  evidenceId: string | null;
  confidence: number;
  route: string;
  status: string;
  potentialFine: number;
}

export interface FeedEvent {
  id: string;
  caseId: string;
  refNo: string;
  itemCode: string;
  labelAr: string;
  at: string;
  branchName: string;
  kind: string;
}

export async function getMinistryData() {
  const overview = await getOverview();
  const cases = await prisma.case.findMany({
    orderBy: { detectedAt: 'desc' },
    include: { branch: true, item: true, evidences: { orderBy: { chainIndex: 'asc' }, take: 1 } },
  });

  const rows: MinistryCaseRow[] = cases.map((c) => ({
    id: c.id,
    refNo: c.refNo,
    branchName: c.branch.nameAr,
    district: c.branch.districtAr,
    itemCode: c.itemCode,
    itemTitle: c.item.titleAr,
    noteAr: c.noteAr,
    detectedAt: c.detectedAt.toISOString(),
    graceDeadline: c.graceDeadline.toISOString(),
    evidenceId: c.evidences[0]?.id ?? null,
    confidence: c.confidence,
    route: c.route,
    status: c.status,
    potentialFine: c.potentialFine,
  }));

  const events = await prisma.caseEvent.findMany({
    orderBy: { at: 'desc' },
    take: 24,
    include: { case: { include: { branch: true } } },
  });
  const feed: FeedEvent[] = events.map((e) => ({
    id: e.id,
    caseId: e.caseId,
    refNo: e.case.refNo,
    itemCode: e.case.itemCode,
    labelAr: e.labelAr,
    at: e.at.toISOString(),
    branchName: e.case.branch.nameAr,
    kind: e.kind,
  }));

  const root = await chainRoot(prisma);

  return { overview, cases: rows, feed, chain: root };
}

export async function getCaseDetail(id: string) {
  await ensureBootstrapped();
  const c = await prisma.case.findUnique({
    where: { id },
    include: { branch: true, item: true, evidences: { orderBy: { chainIndex: 'asc' } }, events: { orderBy: { at: 'asc' } } },
  });
  if (!c) return null;
  const verify = await verifyChain(prisma);
  const evVerify = new Map(verify.records.map((r) => [r.id, r]));
  return {
    case: c,
    verify: {
      ok: verify.ok,
      rootHash: verify.rootHash,
      records: c.evidences.map((e) => ({
        id: e.id,
        chainIndex: e.chainIndex,
        sha256: e.sha256,
        prevHash: e.prevHash,
        kind: e.kind,
        cameraName: e.cameraName,
        signedAt: e.signedAt.toISOString(),
        ok: evVerify.get(e.id)?.ok ?? true,
        reason: evVerify.get(e.id)?.reason,
      })),
    },
  };
}

export function itemMeta(code: string) {
  return ITEM_MAP[code];
}
