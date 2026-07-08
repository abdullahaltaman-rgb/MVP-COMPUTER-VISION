import { prisma } from './db';
import { appendEvidence } from './chain';
import { ITEM_MAP } from './catalog';
import type { DetectionResult } from './detector';

const GRACE_MS = 48 * 3600 * 1000;

async function nextRef(): Promise<string> {
  const count = await prisma.case.count();
  return `RY-${1041 + count}`;
}

async function demoBranchId(): Promise<string> {
  let b = await prisma.branch.findFirst({ where: { isDemo: true } });
  if (!b) {
    b = await prisma.branch.create({
      data: {
        nameAr: 'فرع العرض الحي',
        districtAr: 'العرض التجريبي',
        licenseNo: 'RYD-LDR-DEMO',
        score: 80,
        isDemo: true,
      },
    });
  }
  return b.id;
}

export interface IssueOutcome {
  created: boolean;
  caseId?: string;
  refNo?: string;
  itemCode?: string;
  reviewQueued: number;
  discarded: number;
}

/**
 * تطبيق قواعد البوّابة على نتائج الكشف:
 *  ≥ 0.85 → إصدار حالة تلقائيًا (توقيع الدليل + سلسلة العهدة)
 *  0.60–0.84 → طابور المراجعة البشرية
 *  < 0.60 → تجاهل
 * imageDataUri: الإطار الملتقط، annotatedDataUri: الإطار مع الصناديق (اختياري).
 */
export async function applyGating(
  results: DetectionResult[],
  opts: {
    imageDataUri: string;
    annotatedDataUri?: string | null;
    cameraName?: string;
    branchName?: string;
    threshold?: number;
    isDemoData?: boolean;
  },
): Promise<IssueOutcome> {
  const threshold = opts.threshold ?? 0.85;
  const violations = results
    .filter((r) => r.status === 'violation' && ITEM_MAP[r.code])
    .sort((a, b) => b.confidence - a.confidence);

  const outcome: IssueOutcome = { created: false, reviewQueued: 0, discarded: 0 };

  const auto = violations.filter((r) => r.confidence >= threshold);
  const review = violations.filter((r) => r.confidence >= 0.6 && r.confidence < threshold);
  outcome.discarded = violations.filter((r) => r.confidence < 0.6).length;

  // إصدار حالة واحدة لأعلى مخالفة مؤكدة
  if (auto.length > 0) {
    const top = auto[0];
    const item = ITEM_MAP[top.code];
    const branchId = await demoBranchId();
    const refNo = await nextRef();
    const detectedAt = new Date();
    const graceDeadline = new Date(detectedAt.getTime() + GRACE_MS);

    const c = await prisma.case.create({
      data: {
        refNo,
        branchId,
        itemCode: item.code,
        status: 'in_grace',
        confidence: top.confidence,
        route: 'auto',
        noteAr: top.noteAr,
        potentialFine: item.fineAmount,
        bbox: JSON.stringify(top.bbox),
        detectedAt,
        graceDeadline,
        isDemoData: opts.isDemoData ?? true,
      },
    });

    await appendEvidence(prisma, {
      caseId: c.id,
      imageB64: opts.imageDataUri,
      annotatedB64: opts.annotatedDataUri ?? null,
      cameraName: opts.cameraName ?? 'كاميرا العرض الحي',
      kind: 'detection',
      signedAt: detectedAt,
    });

    await prisma.caseEvent.createMany({
      data: [
        { caseId: c.id, kind: 'detected', labelAr: 'رُصدت المخالفة آليًا ووُقّع الدليل بسلسلة العهدة', at: detectedAt },
        { caseId: c.id, kind: 'notified', labelAr: 'أُبلغ المالك تلقائيًا', at: new Date(detectedAt.getTime() + 1000) },
        { caseId: c.id, kind: 'grace_started', labelAr: 'بدء مهلة التصحيح (48 ساعة)', at: new Date(detectedAt.getTime() + 2000) },
      ],
    });

    outcome.created = true;
    outcome.caseId = c.id;
    outcome.refNo = refNo;
    outcome.itemCode = item.code;
  }

  // طابور المراجعة
  for (const r of review) {
    const rvCount = await prisma.reviewItem.count();
    await prisma.reviewItem.create({
      data: {
        refNo: `RV-${5001 + rvCount}`,
        branchName: opts.branchName ?? 'فرع العرض الحي',
        itemCode: r.code,
        confidence: r.confidence,
        noteAr: r.noteAr,
        imageB64: opts.imageDataUri,
        bbox: JSON.stringify(r.bbox),
        status: 'pending',
        isDemoData: opts.isDemoData ?? true,
      },
    });
    outcome.reviewQueued++;
  }

  return outcome;
}

export async function getThreshold(): Promise<number> {
  const s = await prisma.appState.findUnique({ where: { key: 'confidenceThreshold' } });
  const v = s ? parseFloat(s.value) : 0.85;
  return isFinite(v) ? v : 0.85;
}
