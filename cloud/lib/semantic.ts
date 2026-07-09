// ── الفحوصات الدلالية المجدولة (البندان 1/5/1/1 و6/5/1/1 — كل 120 دقيقة) ──
// المسار: لقطات دورية من الحافة → Gemini 2.5 Flash-Lite (Batch أو sync) → بوابة الثقة → حدث/حالة.
import prisma from './db';
import { gate } from './rules';
import {
  geminiEnabled,
  semanticCheck,
  submitBatch,
  type BatchItem,
  type SemanticVerdict,
} from './gemini';
import { openCaseFromEvent } from './cases';
import { s3Get, s3Enabled } from './s3';

async function snapshotB64(snap: {
  s3Key: string | null;
  imageB64: string | null;
}): Promise<string | null> {
  if (snap.imageB64) return snap.imageB64;
  if (snap.s3Key && s3Enabled()) {
    const buf = await s3Get(snap.s3Key);
    return buf ? buf.toString('base64') : null;
  }
  return null;
}

export interface PendingCheck {
  key: string; // snapshotId|itemCode
  snapshotId: string;
  itemCode: string;
  promptAr: string;
  imageB64: string;
}

/**
 * يجمع الفحوصات المستحقة: لكل قاعدة مجدولة مفعّلة، أحدث لقطة لكل كاميرا تغطي
 * مناطق البند خلال نافذة الجدولة — مع احترام فترة التهدئة (cooldown) لكل بند/كاميرا.
 */
export async function collectDueChecks(): Promise<PendingCheck[]> {
  const rules = await prisma.ruleConfig.findMany({
    where: { mode: 'scheduled', enabled: true },
  });
  const checks: PendingCheck[] = [];

  for (const rule of rules) {
    const windowMs = (rule.scheduleMinutes ?? 120) * 60 * 1000;
    const since = new Date(Date.now() - windowMs);

    // الكاميرات التي تغطي مناطق هذا البند
    const cameras = await prisma.camera.findMany({
      where: { zones: { hasSome: rule.zones } },
      select: { key: true, deviceId: true },
    });

    for (const cam of cameras) {
      // تهدئة: تخطَّ إن وُجد حدث حديث لنفس البند/الكاميرا
      const recent = await prisma.event.findFirst({
        where: {
          itemCode: rule.itemCode,
          cameraKey: cam.key,
          occurredAt: { gte: new Date(Date.now() - rule.cooldownSec * 1000) },
        },
        select: { id: true },
      });
      if (recent) continue;

      const snap = await prisma.snapshot.findFirst({
        where: { cameraKey: cam.key, deviceId: cam.deviceId, takenAt: { gte: since } },
        orderBy: { takenAt: 'desc' },
      });
      if (!snap) continue;

      const b64 = await snapshotB64(snap);
      if (!b64) continue;

      checks.push({
        key: `${snap.id}|${rule.itemCode}`,
        snapshotId: snap.id,
        itemCode: rule.itemCode,
        promptAr: rule.semanticPromptAr || '',
        imageB64: b64,
      });
    }
  }
  return checks;
}

/** يعالج حكم Gemini للقطة/بند: بوابة الثقة → حدث (وربما حالة آلية) */
export async function processVerdict(
  key: string,
  verdict: SemanticVerdict | null,
): Promise<void> {
  if (!verdict || !verdict.violation) return;
  const [snapshotId, itemCode] = key.split('|');
  if (!snapshotId || !itemCode) return;

  const [snap, rule] = await Promise.all([
    prisma.snapshot.findUnique({ where: { id: snapshotId } }),
    prisma.ruleConfig.findUnique({ where: { itemCode } }),
  ]);
  if (!snap || !rule) return;

  const gated = gate(verdict.confidence, rule);
  if (gated === 'drop') return;

  const dedupeKey = `sem_${snapshotId}_${itemCode.replace(/\//g, '-')}`;
  const exists = await prisma.event.findUnique({ where: { dedupeKey } });
  if (exists) return;

  const branch = await prisma.branch.findUnique({
    where: { id: snap.branchId },
    select: { silentMode: true },
  });
  const silent = branch?.silentMode ?? true;
  const b64 = await snapshotB64(snap);

  const event = await prisma.event.create({
    data: {
      dedupeKey,
      branchId: snap.branchId,
      deviceId: snap.deviceId,
      cameraKey: snap.cameraKey,
      itemCode,
      confidence: verdict.confidence,
      decision: silent ? 'review' : gated,
      status: 'pending',
      source: 'semantic',
      zonesHit: rule.zones,
      frameKey: snap.s3Key,
      noteAr: verdict.noteAr || null,
      silent,
      occurredAt: snap.takenAt,
      meta: b64 ? ({ frameB64: b64 } as object) : undefined,
    },
  });

  if (!silent && gated === 'auto') {
    await openCaseFromEvent({ eventId: event.id, route: 'auto' });
  }
}

export interface SemanticRunResult {
  mode: 'batch' | 'sync' | 'disabled';
  checksCollected: number;
  batchName?: string | null;
  processed?: number;
}

/** الدورة المجدولة (كل 120 دقيقة): جمع → إرسال دفعة أو معالجة متزامنة */
export async function runScheduledSemantic(): Promise<SemanticRunResult> {
  if (!geminiEnabled()) return { mode: 'disabled', checksCollected: 0 };

  const checks = await collectDueChecks();
  if (checks.length === 0) {
    return { mode: (process.env.GEMINI_MODE as 'batch' | 'sync') || 'batch', checksCollected: 0 };
  }

  const mode = process.env.GEMINI_MODE === 'sync' ? 'sync' : 'batch';

  if (mode === 'batch') {
    const items: BatchItem[] = checks.map((c) => ({
      key: c.key,
      promptAr: c.promptAr,
      imageB64: c.imageB64,
    }));
    const batchName = await submitBatch(items);
    if (batchName) {
      await prisma.semanticBatch.create({
        data: {
          mode: 'batch',
          batchName,
          status: 'submitted',
          request: { keys: checks.map((c) => c.key) } as object,
        },
      });
      return { mode, checksCollected: checks.length, batchName };
    }
    // فشل إنشاء الدفعة → هبوط رشيق إلى النداء المتزامن
  }

  let processed = 0;
  for (const c of checks) {
    const verdict = await semanticCheck(c.promptAr, c.imageB64);
    await processVerdict(c.key, verdict);
    processed++;
  }
  await prisma.semanticBatch.create({
    data: {
      mode: 'sync',
      status: 'done',
      completedAt: new Date(),
      request: { keys: checks.map((c) => c.key) } as object,
      result: { processed } as object,
    },
  });
  return { mode: 'sync', checksCollected: checks.length, processed };
}
