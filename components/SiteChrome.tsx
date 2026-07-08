'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import DemoBadge from './DemoBadge';

const ROLES: { key: string; label: string; href: string; match: string[] }[] = [
  { key: 'visitor', label: 'زائر', href: '/', match: ['/', '/live', '/how'] },
  { key: 'ministry', label: 'وزارة', href: '/ministry', match: ['/ministry', '/case', '/report'] },
  { key: 'owner', label: 'مالك', href: '/owner', match: ['/owner'] },
  { key: 'ops', label: 'عمليات', href: '/ops', match: ['/ops'] },
];

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  // على /live نمنح تجربة CCTV كاملة الشاشة دون شريط علوي ثقيل
  const isLive = pathname.startsWith('/live');

  function activeRole() {
    let best = ROLES[0];
    let bestLen = -1;
    for (const r of ROLES) {
      for (const m of r.match) {
        const hit = m === '/' ? pathname === '/' : pathname.startsWith(m);
        if (hit && m.length > bestLen) {
          best = r;
          bestLen = m.length;
        }
      }
    }
    return best.key;
  }
  const current = activeRole();

  if (isLive) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print sticky top-0 z-40 bg-navy text-white/90 border-b border-white/10">
        <div className="mx-auto max-w-7xl px-3 sm:px-5 h-14 flex items-center justify-between gap-3">
          {/* مبدّل الأدوار — أعلى اليسار */}
          <nav className="flex items-center gap-1 bg-white/10 rounded-xl p-1 order-2">
            {ROLES.map((r) => (
              <Link
                key={r.key}
                href={r.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  current === r.key
                    ? 'bg-white text-navy font-bold'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                {r.label}
              </Link>
            ))}
          </nav>

          {/* الهوية — أعلى اليمين */}
          <Link href="/" className="flex items-center gap-2 order-1">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-gold text-navy font-kufi font-bold">أ</span>
            <span className="font-kufi font-bold text-white leading-tight hidden sm:block">
              أبيض للرصد الآلي
            </span>
          </Link>
        </div>
      </header>

      <div className="no-print bg-navy-800/95 border-b border-white/5">
        <div className="mx-auto max-w-7xl px-3 sm:px-5 py-1.5 flex items-center justify-between">
          <DemoBadge />
          <span className="text-white/40 text-[11px] hidden sm:block tnum">أمانة منطقة الرياض · قطاع المغاسل</span>
        </div>
      </div>

      <main className="flex-1">{children}</main>

      <footer className="no-print bg-navy text-white/50 text-xs py-5 border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 flex flex-wrap items-center justify-between gap-2">
          <span>منظومة أبيض · نموذج تجريبي لأغراض العرض فقط</span>
          <span className="tnum">© 2026 — بيانات توضيحية غير حقيقية</span>
        </div>
      </footer>
    </div>
  );
}
