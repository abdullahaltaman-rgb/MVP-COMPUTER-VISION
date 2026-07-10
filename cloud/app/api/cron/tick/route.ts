// ── النبضة اليومية المدمجة (Vercel Hobby: cron واحد، مرة/يوم كحد أقصى) ──
// تُشغّل كل الصيانة بالتسلسل عند 14:00 UTC = 17:00 بتوقيت الرياض، فيخرج التقرير
// الأسبوعي يوم الخميس في موعده الصحيح حسب PRD (FR-06).
//
// على خطة Pro: أعِد المهام إلى تردداتها الأصلية (health كل 5د، lifecycle/poll كل
// 15د، semantic كل 120د) عبر إعادة إدراجها في vercel.json — المسارات الفردية
// (/api/cron/health، lifecycle، semantic، semantic-poll، daily، weekly) باقية
// وتعمل كما هي؛ هذا الملف يستدعي نفس منطقها المشترك من lib/maintenance.
//
// تشغيل عند الطلب (بديل التردد على Hobby): استدعِ أي مسار cron يدويًا بترويسة
//   Authorization: Bearer $CRON_SECRET   — يُنفّذ دورته فورًا خارج الجدول.
import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/auth';
import {
  runHealthAlerts,
  runLifecycleEscalations,
  runScheduledSemantic,
  runSemanticPoll,
  runDailyMaintenance,
  runWeeklyReports,
} from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });

  const result: Record<string, unknown> = { ranAt: new Date().toISOString() };

  // كل مرحلة معزولة: فشل واحدة لا يُسقط البقية (المرونة أهم من الذرّية هنا)
  try {
    result.health = await runHealthAlerts();
  } catch (e) {
    result.health = { error: String(e) };
  }
  try {
    result.lifecycle = await runLifecycleEscalations();
  } catch (e) {
    result.lifecycle = { error: String(e) };
  }
  try {
    // الفحص الدلالي المجدول (البنود 1/5/1/1 و6/5/1/1 و10/4/1/1).
    // على Hobby يُفضّل GEMINI_MODE=sync كي يكتمل ضمن النبضة الواحدة؛
    // في وضع batch، الاستطلاع أدناه يلتقط دفعة الأمس.
    result.semantic = await runScheduledSemantic();
  } catch (e) {
    result.semantic = { error: String(e) };
  }
  try {
    result.semanticPoll = await runSemanticPoll();
  } catch (e) {
    result.semanticPoll = { error: String(e) };
  }
  try {
    result.daily = await runDailyMaintenance();
  } catch (e) {
    result.daily = { error: String(e) };
  }

  // التقرير الأسبوعي الموقّع يوم الخميس فقط (UTC day 4) — 17:00 الرياض
  if (new Date().getUTCDay() === 4) {
    try {
      result.weekly = await runWeeklyReports();
    } catch (e) {
      result.weekly = { error: String(e) };
    }
  }

  return NextResponse.json({ ok: true, ...result });
}
