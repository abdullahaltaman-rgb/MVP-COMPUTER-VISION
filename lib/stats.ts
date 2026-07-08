import { prisma } from './db';
import { ensureBootstrapped } from './bootstrap';

export interface OverviewStats {
  branches: number;
  detectionsToday: number;
  activeCases: number;
  inGrace: number;
  correctedBeforeEscalationPct: number;
  avgCorrectionHours: number;
  complianceRate: number;
  totalCases: number;
  correctedCases: number;
  escalatedCases: number;
}

export async function getOverview(): Promise<OverviewStats> {
  await ensureBootstrapped();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [branches, cases, evToday] = await Promise.all([
    prisma.branch.count(),
    prisma.case.findMany({ include: { branch: true } }),
    prisma.evidence.count({ where: { signedAt: { gte: startOfDay } } }),
  ]);

  const active = cases.filter((c) => ['new', 'notified', 'in_grace'].includes(c.status));
  const inGrace = cases.filter((c) => c.status === 'in_grace');
  const corrected = cases.filter((c) => c.status === 'corrected');
  const escalated = cases.filter((c) => c.status === 'escalated');
  const resolved = corrected.length + escalated.length;
  const correctedPct = resolved > 0 ? (corrected.length / resolved) * 100 : 100;

  const correctionHours = corrected
    .filter((c) => c.correctedAt)
    .map((c) => (c.correctedAt!.getTime() - c.detectedAt.getTime()) / 3600000);
  const avgHours =
    correctionHours.length > 0
      ? correctionHours.reduce((a, b) => a + b, 0) / correctionHours.length
      : 0;

  const scores = cases.length
    ? Array.from(new Set(cases.map((c) => c.branch.id))).map(
        (id) => cases.find((c) => c.branch.id === id)!.branch.score,
      )
    : [];
  const branchScores = await prisma.branch.findMany({ select: { score: true } });
  const complianceRate = branchScores.length
    ? branchScores.reduce((a, b) => a + b.score, 0) / branchScores.length
    : 90;

  // detectionsToday: أدلة اليوم + عناصر مراجعة اليوم (تقدير حي)
  const reviewToday = await prisma.reviewItem.count({ where: { createdAt: { gte: startOfDay } } });

  return {
    branches,
    detectionsToday: evToday + reviewToday,
    activeCases: active.length,
    inGrace: inGrace.length,
    correctedBeforeEscalationPct: Math.round(correctedPct),
    avgCorrectionHours: Math.round(avgHours),
    complianceRate: Math.round(complianceRate),
    totalCases: cases.length,
    correctedCases: corrected.length,
    escalatedCases: escalated.length,
  };
}
