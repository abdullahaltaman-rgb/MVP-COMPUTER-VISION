// ── مصفوفة الإشعارات (PRD):
// المشغّل: إشعار فوري لكل حالة + إشعار الإغلاق.
// الكفيل: التقرير الأسبوعي (الخميس 17:00) + التصعيد فقط
//         (انتهاء المهلة أو تكرار نفس البند خلال 7 أيام).
// SILENT_MODE: صفر إشعارات للعميل — تُسجَّل الإشعارات بحالة suppressed_silent.
import prisma from './db';
import { sendToTopic, operatorTopic, kafeelTopic, fcmEnabled } from './fcm';

export type NotificationType =
  | 'case_opened'
  | 'case_closed'
  | 'escalation'
  | 'weekly_report'
  | 'device_offline';

interface NotifyInput {
  audience: 'operator' | 'kafeel' | 'ops';
  branchId: string;
  caseId?: string | null;
  type: NotificationType;
  titleAr: string;
  bodyAr: string;
  data?: Record<string, string>;
}

/** يرسل إشعارًا وفق المصفوفة ويوثّقه — مع احترام الوضع الصامت */
export async function notify(input: NotifyInput): Promise<void> {
  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    select: { silentMode: true },
  });

  // البوابة الإلزامية: الوضع الصامت يمنع أي إشعار للعميل (مشغّل/كفيل)
  const suppressed = Boolean(branch?.silentMode) && input.audience !== 'ops';

  const topic =
    input.audience === 'operator'
      ? operatorTopic(input.branchId)
      : input.audience === 'kafeel'
        ? kafeelTopic(input.branchId)
        : null;

  let fcmId: string | null = null;
  let status = 'sent';

  if (suppressed) {
    status = 'suppressed_silent';
  } else if (!fcmEnabled() || !topic) {
    // إشعارات ops داخل اللوحة فقط؛ أو بيئة بلا Firebase
    status = topic ? 'skipped_no_fcm' : 'sent';
  } else {
    try {
      fcmId = await sendToTopic({
        topic,
        titleAr: input.titleAr,
        bodyAr: input.bodyAr,
        data: { type: input.type, caseId: input.caseId || '', ...(input.data || {}) },
      });
    } catch {
      status = 'failed';
    }
  }

  await prisma.notification.create({
    data: {
      audience: input.audience,
      branchId: input.branchId,
      caseId: input.caseId ?? null,
      type: input.type,
      titleAr: input.titleAr,
      bodyAr: input.bodyAr,
      topic,
      data: input.data ? (input.data as object) : undefined,
      fcmId,
      status,
    },
  });
}
