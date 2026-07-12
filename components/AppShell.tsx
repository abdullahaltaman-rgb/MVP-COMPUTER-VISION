'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const ROLE_AR: Record<string, string> = {
  operator: 'المشغّل',
  kafeel: 'الكفيل',
  ops: 'غرفة العمليات',
  ministry: 'الأمانة',
};

/** هيكل التطبيق: ترويسة موحّدة + تسجيل عامل الخدمة (PWA) */
export default function AppShell({
  title,
  role,
  nameAr,
  badge,
  children,
}: {
  title: string;
  role: string;
  nameAr: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  }

  return (
    <div className="min-h-screen bg-mist">
      <header className="bg-navy text-white sticky top-0 z-40 shadow-panel">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 grid place-items-center font-kufi font-bold text-xs text-gold shrink-0">
              رصد
            </div>
            <div className="min-w-0">
              <h1 className="font-kufi font-bold text-sm sm:text-base truncate">{title}</h1>
              <div className="text-white/60 text-[11px] truncate">
                منصة رصد الامتثال البلدي · {ROLE_AR[role] ?? role} · {nameAr}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {badge}
            <button
              onClick={logout}
              className="text-white/70 hover:text-white text-xs border border-white/20 rounded-lg px-3 py-1.5"
            >
              خروج
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-5">{children}</main>
    </div>
  );
}
