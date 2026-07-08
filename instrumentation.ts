// يُنفَّذ مرة عند إقلاع الخادم — فحص الصيانة التلقائية (مسح بيانات الزوّار >6h)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { maybeAutoReset } = await import('./lib/maintenance');
      await maybeAutoReset();
    } catch (e) {
      console.warn('auto-reset check skipped:', e);
    }
  }
}
