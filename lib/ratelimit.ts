import { prisma } from './db';

const WINDOW_MS = 60 * 60 * 1000; // ساعة
export const RATE_LIMIT = 20; // 20 نداء Gemini لكل IP في الساعة

export interface RateStatus {
  allowed: boolean;
  count: number;
  remaining: number;
  resetInMin: number;
}

/**
 * يستهلك نداءً واحدًا من حصة الـ IP لاستدعاء Gemini.
 * عند تجاوز الحد يعيد allowed=false ليتحوّل النظام تلقائيًا إلى المحاكاة.
 */
export async function consumeRate(ip: string): Promise<RateStatus> {
  const now = new Date();
  const existing = await prisma.rateLimit.findUnique({ where: { ip } });

  if (!existing || now.getTime() - existing.windowStart.getTime() > WINDOW_MS) {
    await prisma.rateLimit.upsert({
      where: { ip },
      create: { ip, windowStart: now, count: 1 },
      update: { windowStart: now, count: 1 },
    });
    return { allowed: true, count: 1, remaining: RATE_LIMIT - 1, resetInMin: 60 };
  }

  const resetInMin = Math.max(
    1,
    Math.ceil((WINDOW_MS - (now.getTime() - existing.windowStart.getTime())) / 60000),
  );

  if (existing.count >= RATE_LIMIT) {
    return { allowed: false, count: existing.count, remaining: 0, resetInMin };
  }

  const updated = await prisma.rateLimit.update({
    where: { ip },
    data: { count: { increment: 1 } },
  });
  return {
    allowed: true,
    count: updated.count,
    remaining: Math.max(0, RATE_LIMIT - updated.count),
    resetInMin,
  };
}
