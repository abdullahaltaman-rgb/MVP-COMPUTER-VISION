import { prisma } from './db';
import { computeEvidenceHash, GENESIS_HASH } from './hash';

/**
 * إعادة بناء سلسلة العهدة كاملةً من الأدلة الباقية (بعد حذف/تعديل):
 * يُعيد ترقيم chainIndex ويعيد حساب prevHash و sha256 بالترتيب الزمني.
 * يحافظ على صحّة السلسلة بعد مسح بيانات الزوّار.
 */
export async function rebuildChain(): Promise<{ count: number; rootHash: string }> {
  const evidences = await prisma.evidence.findMany({
    orderBy: [{ signedAt: 'asc' }, { chainIndex: 'asc' }],
  });

  // تفادي تعارض القيد الفريد على chainIndex: مرحلة مؤقتة بقيم سالبة
  for (let i = 0; i < evidences.length; i++) {
    await prisma.evidence.update({ where: { id: evidences[i].id }, data: { chainIndex: -(i + 1) } });
  }

  let prev = GENESIS_HASH;
  for (let i = 0; i < evidences.length; i++) {
    const e = evidences[i];
    const sha256 = computeEvidenceHash(e.imageB64, prev);
    await prisma.evidence.update({ where: { id: e.id }, data: { chainIndex: i, prevHash: prev, sha256 } });
    prev = sha256;
  }

  await prisma.chainMeta.upsert({
    where: { id: 1 },
    create: { id: 1, lastHash: prev, lastIndex: evidences.length - 1 },
    update: { lastHash: prev, lastIndex: evidences.length - 1 },
  });

  return { count: evidences.length, rootHash: prev };
}

/**
 * مسح بيانات الزوّار الأقدم من N ساعة (حالات ومراجعات isDemoData=true)،
 * مع الإبقاء على الحالات التاريخية المزروعة، ثم إعادة بناء السلسلة.
 */
export async function wipeStaleDemoData(hours = 6): Promise<{ deletedCases: number; deletedReviews: number }> {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);

  const staleCases = await prisma.case.findMany({
    where: { isDemoData: true, detectedAt: { lt: cutoff } },
    select: { id: true },
  });
  const ids = staleCases.map((c) => c.id);
  if (ids.length) {
    await prisma.caseEvent.deleteMany({ where: { caseId: { in: ids } } });
    await prisma.evidence.deleteMany({ where: { caseId: { in: ids } } });
    await prisma.case.deleteMany({ where: { id: { in: ids } } });
  }
  const reviews = await prisma.reviewItem.deleteMany({
    where: { isDemoData: true, createdAt: { lt: cutoff } },
  });

  await rebuildChain();
  return { deletedCases: ids.length, deletedReviews: reviews.count };
}

/**
 * فحص عند الإقلاع: إن مرّ أكثر من 6 ساعات على آخر صيانة، امسح بيانات
 * الزوّار القديمة. لا يُعيد زرع البيانات التاريخية.
 */
export async function maybeAutoReset(): Promise<boolean> {
  const state = await prisma.appState.findUnique({ where: { key: 'lastMaintenance' } });
  const last = state ? new Date(state.value).getTime() : 0;
  if (Date.now() - last < 6 * 3600 * 1000) return false;

  await wipeStaleDemoData(6);
  await prisma.appState.upsert({
    where: { key: 'lastMaintenance' },
    create: { key: 'lastMaintenance', value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
  return true;
}

/**
 * محاكاة العبث: يقلب بايتًا (حرفًا) في دليل عشوائي دون تعديل بصمته المخزّنة،
 * فتفشل عملية التحقق. يحفظ ما يلزم للاستعادة.
 */
export async function simulateTamper(): Promise<{ ok: boolean; evidenceId?: string; caseId?: string; message: string }> {
  const existing = await prisma.appState.findUnique({ where: { key: 'tamper' } });
  if (existing) {
    return { ok: false, message: 'هناك عبث نشط بالفعل — استخدم «استعادة» أولًا.' };
  }
  const count = await prisma.evidence.count();
  if (count === 0) return { ok: false, message: 'لا توجد أدلة في السلسلة.' };

  // اختيار «عشوائي» حتمي دون Math.random (يعتمد على الوقت)
  const skip = Date.now() % count;
  const ev = (await prisma.evidence.findMany({ orderBy: { chainIndex: 'asc' }, skip, take: 1 }))[0];
  if (!ev) return { ok: false, message: 'تعذّر اختيار دليل.' };

  const img = ev.imageB64;
  const comma = img.indexOf(',');
  const start = comma >= 0 ? comma + 1 : 0;
  const pos = start + ((Date.now() >> 3) % Math.max(1, img.length - start - 1));
  const origChar = img[pos];
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let newChar = B64[(B64.indexOf(origChar) + 7) % B64.length];
  if (newChar === origChar) newChar = origChar === 'A' ? 'B' : 'A';
  const tampered = img.slice(0, pos) + newChar + img.slice(pos + 1);

  await prisma.evidence.update({ where: { id: ev.id }, data: { imageB64: tampered } });
  await prisma.appState.create({
    data: { key: 'tamper', value: JSON.stringify({ evidenceId: ev.id, pos, origChar }) },
  });
  await prisma.caseEvent.create({
    data: { caseId: ev.caseId, kind: 'tampered', labelAr: 'محاكاة عبث: تعديل بايت في الدليل — فشل التحقق من السلامة', at: new Date() },
  });

  return { ok: true, evidenceId: ev.id, caseId: ev.caseId, message: 'تم العبث بدليل عشوائي — تحقّق السلسلة سيظهر بالأحمر.' };
}

export async function restoreTamper(): Promise<{ ok: boolean; message: string }> {
  const state = await prisma.appState.findUnique({ where: { key: 'tamper' } });
  if (!state) return { ok: false, message: 'لا يوجد عبث لاستعادته.' };
  const { evidenceId, pos, origChar } = JSON.parse(state.value) as { evidenceId: string; pos: number; origChar: string };
  const ev = await prisma.evidence.findUnique({ where: { id: evidenceId } });
  if (ev) {
    const img = ev.imageB64;
    const restored = img.slice(0, pos) + origChar + img.slice(pos + 1);
    await prisma.evidence.update({ where: { id: evidenceId }, data: { imageB64: restored } });
    await prisma.caseEvent.create({
      data: { caseId: ev.caseId, kind: 'restored', labelAr: 'استعادة الدليل الأصلي — عاد التحقق من السلامة أخضر', at: new Date() },
    });
  }
  await prisma.appState.delete({ where: { key: 'tamper' } });
  return { ok: true, message: 'تمت الاستعادة — السلسلة سليمة مجددًا.' };
}
