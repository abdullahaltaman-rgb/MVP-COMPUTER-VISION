import prisma from './db';
import type { SessionUser } from './auth';

/** يسجّل عملية في سجل التدقيق — كل فعل في كونسول العمليات يمر من هنا */
export async function audit(
  actor: SessionUser | { id?: string; nameAr: string } | null,
  action: string,
  entity: string,
  entityId?: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor && 'id' in actor ? (actor.id ?? null) : null,
        actorName: actor?.nameAr || 'النظام',
        action,
        entity,
        entityId: entityId ?? null,
        detail: detail ? (detail as object) : undefined,
      },
    });
  } catch {
    // سجل التدقيق يجب ألا يُسقط العملية الأساسية
  }
}
