import type { PrismaClient } from '@prisma/client';
import { computeEvidenceHash, GENESIS_HASH } from './hash';
import { s3Enabled, s3Get, s3Put } from './s3';
import { signBytes, verifyBytes } from './sign';

/** الرسالة القانونية لتوقيع سجل الدليل (FR-04) — مستقلة عن البايتات فتصمد بعد الإتلاف */
export function evidenceSignedMessage(
  chainIndex: number,
  sha256: string,
  prevHash: string,
): Buffer {
  return Buffer.from(`abyad-evidence|v1|${chainIndex}|${sha256}|${prevHash}`, 'utf8');
}

export interface AppendInput {
  caseId?: string | null;
  eventId?: string | null;
  /** بايتات الدليل بصيغة base64 — البصمة تُحسب عليها كما في الديمو تمامًا */
  imageB64: string;
  cameraName?: string;
  kind?: 'detection' | 'correction' | 'report' | 'digest';
  signedAt?: Date;
}

/**
 * يُلحق دليلًا جديدًا بسلسلة العهدة العالمية:
 * chainIndex تصاعدي، prevHash = بصمة السجل السابق،
 * hash = sha256(bytes + prevHash) — مطابق لمنطق الديمو حرفيًا.
 * البايتات تُرفع إلى S3 (وتبقى base64 في القاعدة كخيار تطوير محلي فقط).
 */
export async function appendEvidence(prisma: PrismaClient, input: AppendInput) {
  const useS3 = s3Enabled();
  const evidence = await prisma.$transaction(async (tx) => {
    let meta = await tx.chainMeta.findUnique({ where: { id: 1 } });
    if (!meta) {
      meta = await tx.chainMeta.create({
        data: { id: 1, lastHash: GENESIS_HASH, lastIndex: -1 },
      });
    }
    const prevHash = meta.lastHash || GENESIS_HASH;
    const chainIndex = meta.lastIndex + 1;
    const sha256 = computeEvidenceHash(input.imageB64, prevHash);
    const s3Key = useS3 ? `evidence/${chainIndex}-${sha256.slice(0, 16)}.jpg` : null;
    // FR-04: توقيع رقمي لكل سجل فوق ترابط السلسلة
    const recordSig = signBytes(evidenceSignedMessage(chainIndex, sha256, prevHash));

    const ev = await tx.evidence.create({
      data: {
        caseId: input.caseId ?? null,
        eventId: input.eventId ?? null,
        kind: input.kind ?? 'detection',
        s3Key,
        imageB64: useS3 ? null : input.imageB64,
        sha256,
        prevHash,
        chainIndex,
        signature: recordSig.signature,
        sigAlgo: recordSig.algo,
        cameraName: input.cameraName ?? '',
        signedAt: input.signedAt ?? new Date(),
      },
    });

    await tx.chainMeta.update({
      where: { id: 1 },
      data: { lastHash: sha256, lastIndex: chainIndex },
    });

    return ev;
  });

  if (useS3 && evidence.s3Key) {
    await s3Put(evidence.s3Key, Buffer.from(input.imageB64, 'base64'));
  }
  return evidence;
}

/** يجلب بايتات الدليل base64 من S3 أو القاعدة (null إذا أُتلفت بعد 90 يومًا) */
export async function evidenceBytesB64(ev: {
  s3Key: string | null;
  imageB64: string | null;
  bytesPurged: boolean;
}): Promise<string | null> {
  if (ev.bytesPurged) return null;
  if (ev.imageB64) return ev.imageB64;
  if (ev.s3Key && s3Enabled()) {
    const buf = await s3Get(ev.s3Key);
    return buf ? buf.toString('base64') : null;
  }
  return null;
}

export interface VerifyRecord {
  id: string;
  caseId: string | null;
  chainIndex: number;
  sha256: string;
  expected: string;
  prevHash: string;
  ok: boolean;
  /** صحة توقيع السجل الرقمي (FR-04) — مستقلة عن سلامة السلسلة */
  sigOk: boolean;
  purged?: boolean;
  reason?: string;
}

export interface VerifyResult {
  ok: boolean;
  total: number;
  brokenCount: number;
  sigBrokenCount: number;
  purgedCount: number;
  rootHash: string;
  records: VerifyRecord[];
}

/**
 * يُعيد حساب السلسلة كاملةً بترتيب chainIndex ويكشف أي تلاعب،
 * ويتحقق من توقيع كل سجل على حدة (FR-04) — الفشلان مستقلان:
 * سجل بسلسلة سليمة وتوقيع معطوب يُعلَّم مكسورًا مع سببه.
 * الأدلة المُتلفة بايتاتها (سياسة 90 يومًا) يُتحقق من ترابط prevHash
 * وتوقيع سجلها فقط دون إعادة حساب البصمة — وتُعلَّم purged.
 */
export async function verifyChain(prisma: PrismaClient): Promise<VerifyResult> {
  const evidences = await prisma.evidence.findMany({
    orderBy: { chainIndex: 'asc' },
  });

  const records: VerifyRecord[] = [];
  // بعد إتلاف سجلات أقدم من سنتين قد تُحذف بادئة السلسلة؛
  // عندها يُعتمد prevHash لأول سجل باقٍ كمرساة موثوقة.
  let prev =
    evidences.length && evidences[0].chainIndex > 0 ? evidences[0].prevHash : GENESIS_HASH;
  let broken = 0;
  let sigBroken = 0;
  let purged = 0;

  for (const e of evidences) {
    const linkOk = e.prevHash === prev;
    const sigOk =
      e.signature.length > 0 &&
      verifyBytes(evidenceSignedMessage(e.chainIndex, e.sha256, e.prevHash), e.signature, e.sigAlgo);
    if (!sigOk) sigBroken++;

    const b64 = await evidenceBytesB64(e);
    let hashOk = true;
    let expected = e.sha256;
    let isPurged = false;
    if (b64 === null) {
      purged++;
      isPurged = true;
    } else {
      expected = computeEvidenceHash(b64, prev);
      hashOk = e.sha256 === expected;
    }

    const ok = linkOk && hashOk && sigOk;
    if (!(linkOk && hashOk)) broken++;
    records.push({
      id: e.id,
      caseId: e.caseId,
      chainIndex: e.chainIndex,
      sha256: e.sha256,
      expected,
      prevHash: e.prevHash,
      ok,
      sigOk,
      purged: isPurged || undefined,
      reason: ok
        ? undefined
        : !hashOk
          ? 'بصمة الدليل لا تطابق محتواه (تلاعب محتمل بالبايتات)'
          : !linkOk
            ? 'رابط السلسلة (prevHash) غير متطابق'
            : e.signature.length === 0
              ? 'السجل بلا توقيع رقمي'
              : 'توقيع السجل الرقمي غير صالح (تلاعب محتمل بالسجل)',
    });
    // نُكمل بالبصمة المخزّنة كي ينحصر أثر الكسر في السجل المتأثر وتاليه
    prev = e.sha256;
  }

  return {
    ok: broken === 0 && sigBroken === 0,
    total: evidences.length,
    brokenCount: broken,
    sigBrokenCount: sigBroken,
    purgedCount: purged,
    rootHash: evidences.length ? evidences[evidences.length - 1].sha256 : GENESIS_HASH,
    records,
  };
}

/** بصمة جذر السلسلة الحالية (للتقارير وبصمة التشغيل) */
export async function chainRoot(
  prisma: PrismaClient,
): Promise<{ rootHash: string; index: number }> {
  const meta = await prisma.chainMeta.findUnique({ where: { id: 1 } });
  return { rootHash: meta?.lastHash || GENESIS_HASH, index: meta?.lastIndex ?? -1 };
}
