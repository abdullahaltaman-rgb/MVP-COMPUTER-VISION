// يُنفَّذ مرة عند إقلاع الخادم:
// 1) تهيئة ذاتية: إنشاء الجداول وزرع البيانات إن كانت القاعدة فارغة (إنتاج Turso).
// 2) فحص الصيانة التلقائية (مسح بيانات الزوّار الأقدم من 6 ساعات).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { ensureBootstrapped } = await import('./lib/bootstrap');
      await ensureBootstrapped();
    } catch (e) {
      console.warn('bootstrap skipped:', e);
    }
    try {
      const { maybeAutoReset } = await import('./lib/maintenance');
      await maybeAutoReset();
    } catch (e) {
      console.warn('auto-reset check skipped:', e);
    }
  }
}
