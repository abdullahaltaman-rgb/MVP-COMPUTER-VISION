'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const HOME: Record<string, string> = {
  operator: '/operator',
  kafeel: '/kafeel',
  ops: '/ops',
  ministry: '/ministry',
};

export default function LoginClient() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر الدخول');
        return;
      }
      router.replace(HOME[data.role] ?? '/');
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-white/10 grid place-items-center font-kufi font-bold text-2xl text-gold mx-auto mb-3">
            رصد
          </div>
          <h1 className="font-kufi font-bold text-white text-xl">منصة رصد الامتثال البلدي</h1>
          <p className="text-white/60 text-sm mt-1">
            المركز الوطني لرصد الامتثال — قطاع المغاسل
          </p>
        </div>
        <form onSubmit={submit} className="card p-5 space-y-4">
          <label className="block">
            <span className="text-navy/70 text-sm font-bold">رمز الوصول</span>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-2 w-full rounded-xl border border-navy/15 px-4 py-3 text-navy focus:outline-none focus:border-green"
              placeholder="أدخل رمز الدخول الخاص بدورك"
              autoComplete="current-password"
              required
              minLength={4}
            />
          </label>
          {error && <div className="text-red text-sm">{error}</div>}
          <button disabled={busy} className="btn btn-primary w-full disabled:opacity-60">
            {busy ? 'جارٍ الدخول…' : 'دخول'}
          </button>
          <p className="text-navy/40 text-[11px] leading-relaxed">
            الأدوار: مشغّل الفرع · الكفيل · غرفة العمليات · الأمانة (داخلي).
            تُسلَّم الرموز يدويًا عند تجهيز الفرع.
          </p>
        </form>
      </div>
    </div>
  );
}
