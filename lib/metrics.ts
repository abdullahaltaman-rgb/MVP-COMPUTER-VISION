// ── مقاييس المعايرة (بوابة الأسبوع الثاني): دقة يومية ومعدل إنذار كاذب لكل بند ──
// لا إطلاق (go-live) دون دقة ≥ 90% على 200+ حدث مصنَّف.
import prisma from './db';
import { ITEMS } from './catalog';

export const GATE_MIN_PRECISION = 0.9;
export const GATE_MIN_EVENTS = 200;

/** يحسب/يحدّث مقاييس يوم معيّن لكل (فرع، بند) من تصنيفات صحيح/خاطئ */
export async function computeDailyMetrics(date: Date): Promise<void> {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const branches = await prisma.branch.findMany({ select: { id: true } });
  for (const b of branches) {
    for (const item of ITEMS) {
      const where = {
        branchId: b.id,
        itemCode: item.code,
        occurredAt: { gte: dayStart, lt: dayEnd },
      };
      const [totalEvents, truePos, falsePos] = await Promise.all([
        prisma.event.count({ where }),
        prisma.event.count({ where: { ...where, label: 'correct' } }),
        prisma.event.count({ where: { ...where, label: 'incorrect' } }),
      ]);
      const labeled = truePos + falsePos;
      const precision = labeled > 0 ? truePos / labeled : null;
      const fpRate = labeled > 0 ? falsePos / labeled : null;

      await prisma.dailyMetric.upsert({
        where: {
          date_branchId_itemCode: { date: dayStart, branchId: b.id, itemCode: item.code },
        },
        update: { totalEvents, labeled, truePos, falsePos, precision, fpRate },
        create: {
          date: dayStart,
          branchId: b.id,
          itemCode: item.code,
          totalEvents,
          labeled,
          truePos,
          falsePos,
          precision,
          fpRate,
        },
      });
    }
  }
}

export interface CalibrationSummary {
  totalLabeled: number;
  truePos: number;
  falsePos: number;
  precision: number | null;
  fpRate: number | null;
  gatePassed: boolean;
  gateMinPrecision: number;
  gateMinEvents: number;
  perItem: {
    itemCode: string;
    labeled: number;
    truePos: number;
    falsePos: number;
    precision: number | null;
  }[];
  daily: {
    date: string;
    labeled: number;
    precision: number | null;
    fpRate: number | null;
  }[];
}

/** ملخص المعايرة التراكمي + سلسلة يومية للرسم البياني */
export async function calibrationSummary(branchId?: string): Promise<CalibrationSummary> {
  const whereBase = branchId ? { branchId } : {};
  const [truePos, falsePos] = await Promise.all([
    prisma.event.count({ where: { ...whereBase, label: 'correct' } }),
    prisma.event.count({ where: { ...whereBase, label: 'incorrect' } }),
  ]);
  const totalLabeled = truePos + falsePos;
  const precision = totalLabeled > 0 ? truePos / totalLabeled : null;
  const fpRate = totalLabeled > 0 ? falsePos / totalLabeled : null;

  const perItem = await Promise.all(
    ITEMS.map(async (item) => {
      const [tp, fp] = await Promise.all([
        prisma.event.count({ where: { ...whereBase, itemCode: item.code, label: 'correct' } }),
        prisma.event.count({ where: { ...whereBase, itemCode: item.code, label: 'incorrect' } }),
      ]);
      const labeled = tp + fp;
      return {
        itemCode: item.code,
        labeled,
        truePos: tp,
        falsePos: fp,
        precision: labeled > 0 ? tp / labeled : null,
      };
    }),
  );

  // آخر 14 يومًا من DailyMetric مجمّعة عبر البنود
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const rows = await prisma.dailyMetric.findMany({
    where: { ...(branchId ? { branchId } : {}), date: { gte: since } },
    orderBy: { date: 'asc' },
  });
  const byDate = new Map<string, { labeled: number; tp: number; fp: number }>();
  for (const r of rows) {
    const k = r.date.toISOString().slice(0, 10);
    const cur = byDate.get(k) || { labeled: 0, tp: 0, fp: 0 };
    cur.labeled += r.labeled;
    cur.tp += r.truePos;
    cur.fp += r.falsePos;
    byDate.set(k, cur);
  }
  const daily = [...byDate.entries()].map(([date, v]) => ({
    date,
    labeled: v.labeled,
    precision: v.labeled > 0 ? v.tp / v.labeled : null,
    fpRate: v.labeled > 0 ? v.fp / v.labeled : null,
  }));

  return {
    totalLabeled,
    truePos,
    falsePos,
    precision,
    fpRate,
    gatePassed:
      totalLabeled >= GATE_MIN_EVENTS && precision !== null && precision >= GATE_MIN_PRECISION,
    gateMinPrecision: GATE_MIN_PRECISION,
    gateMinEvents: GATE_MIN_EVENTS,
    perItem,
    daily,
  };
}
