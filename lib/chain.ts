import type { PrismaClient } from '@prisma/client';
import { computeEvidenceHash, GENESIS_HASH } from './hash';

export interface AppendInput {
  caseId: string;
  imageB64: string;
  annotatedB64?: string | null;
  cameraName?: string;
  kind?: 'detection' | 'correction';
  signedAt?: Date;
}

/**
 * يُلحق دليلًا جديدًا بسلسلة العهدة العالمية:
 * chainIndex تصاعدي، prevHash = بصمة السجل السابق،
 * hash = sha256(imageB64 + prevHash). عملية ذرّية عبر transaction.
 */
export async function appendEvidence(prisma: PrismaClient, input: AppendInput) {
  return prisma.$transaction(async (tx) => {
    let meta = await tx.chainMeta.findUnique({ where: { id: 1 } });
    if (!meta) {
      meta = await tx.chainMeta.create({
        data: { id: 1, lastHash: GENESIS_HASH, lastIndex: -1 },
      });
    }
    const prevHash = meta.lastHash || GENESIS_HASH;
    const chainIndex = meta.lastIndex + 1;
    const sha256 = computeEvidenceHash(input.imageB64, prevHash);

    const evidence = await tx.evidence.create({
      data: {
        caseId: input.caseId,
        kind: input.kind ?? 'detection',
        imageB64: input.imageB64,
        annotatedB64: input.annotatedB64 ?? null,
        sha256,
        prevHash,
        chainIndex,
        cameraName: input.cameraName ?? 'كاميرا العرض الحي',
        signedAt: input.signedAt ?? new Date(),
      },
    });

    await tx.chainMeta.update({
      where: { id: 1 },
      data: { lastHash: sha256, lastIndex: chainIndex },
    });

    return evidence;
  });
}

export interface VerifyRecord {
  id: string;
  caseId: string;
  chainIndex: number;
  sha256: string;
  expected: string;
  prevHash: string;
  ok: boolean;
  reason?: string;
}

export interface VerifyResult {
  ok: boolean;
  total: number;
  brokenCount: number;
  rootHash: string; // بصمة آخر سجل (جذر السلسلة الحالي)
  records: VerifyRecord[];
}

/**
 * يُعيد حساب السلسلة كاملةً بترتيب chainIndex ويكشف أي تلاعب:
 * - يعيد حساب sha256(imageB64 + prevHash) ويقارنه بالمخزّن
 * - يتحقق أن prevHash يطابق بصمة السجل السابق فعليًا
 */
export async function verifyChain(prisma: PrismaClient): Promise<VerifyResult> {
  const evidences = await prisma.evidence.findMany({
    orderBy: { chainIndex: 'asc' },
  });

  const records: VerifyRecord[] = [];
  let prev = GENESIS_HASH;
  let broken = 0;

  for (const e of evidences) {
    const expected = computeEvidenceHash(e.imageB64, prev);
    const linkOk = e.prevHash === prev;
    const hashOk = e.sha256 === expected;
    const ok = linkOk && hashOk;
    if (!ok) broken++;
    records.push({
      id: e.id,
      caseId: e.caseId,
      chainIndex: e.chainIndex,
      sha256: e.sha256,
      expected,
      prevHash: e.prevHash,
      ok,
      reason: ok
        ? undefined
        : !hashOk
          ? 'بصمة الدليل لا تطابق محتواه (تلاعب محتمل بالبايتات)'
          : 'رابط السلسلة (prevHash) غير متطابق',
    });
    // نُكمل بالبصمة المخزّنة كي ينحصر أثر الكسر في السجل المتأثر وتاليه
    prev = e.sha256;
  }

  return {
    ok: broken === 0,
    total: evidences.length,
    brokenCount: broken,
    rootHash: evidences.length ? evidences[evidences.length - 1].sha256 : GENESIS_HASH,
    records,
  };
}

/** بصمة جذر السلسلة الحالية (للتذييل والتقارير) */
export async function chainRoot(prisma: PrismaClient): Promise<{ rootHash: string; index: number }> {
  const meta = await prisma.chainMeta.findUnique({ where: { id: 1 } });
  return { rootHash: meta?.lastHash || GENESIS_HASH, index: meta?.lastIndex ?? -1 };
}
