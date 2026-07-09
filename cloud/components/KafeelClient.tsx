'use client';

// لوحة الكفيل: مؤشر الفرع، الحالات بوضع القراءة، التقارير الموقّعة، التصعيدات بشارة حمراء.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from './AppShell';
import { Donut, StatusChip, KpiCard } from './ui';
import { formatDate, formatDateTime, shortHash } from '@/lib/format';
import { ITEM_MAP } from '@/lib/catalog';

interface KafeelData {
  branch: { id: string; nameAr: string; districtAr: string; licenseNo: string } | null;
  score: number;
  monthStats: { opened: number; corrected: number; escalated: number };
  cases: {
    id: string; refNo: string; itemCode: string; status: string;
    detectedAt: string; graceDeadline: string; escalationReason: string | null;
  }[];
  reports: {
    id: string; periodStart: string; periodEnd: string; sha256: string;
    signature: string; algo: string; s3KeyPdf: string | null; createdAt: string;
    stats?: { complianceScore: number; casesOpened: number; casesEscalated: number };
  }[];
  escalations: {
    id: string; refNo: string; itemCode: string; escalatedAt: string | null;
    escalationReason: string | null;
  }[];
}

export default function KafeelClient({ nameAr }: { nameAr: string }) {
  const [data, setData] = useState<KafeelData | null>(null);
  const [tab, setTab] = useState<'overview' | 'cases' | 'reports' | 'escalations'>('overview');

  const load = useCallback(async () => {
    const res = await fetch('/api/kafeel', { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return (
      <AppShell title="لوحة الكفيل" role="kafeel" nameAr={nameAr}>
        <div className="text-navy/40 py-20 text-center">جارٍ التحميل…</div>
      </AppShell>
    );
  }

  const TABS = [
    { key: 'overview' as const, label: 'المؤشر' },
    { key: 'cases' as const, label: 'الحالات' },
    { key: 'reports' as const, label: 'التقارير الموقّعة' },
    { key: 'escalations' as const, label: 'التصعيدات', badge: data.escalations.length },
  ];

  return (
    <AppShell
      title={data.branch ? `${data.branch.nameAr}` : 'لوحة الكفيل'}
      role="kafeel"
      nameAr={nameAr}
      badge={
        data.escalations.length > 0 ? (
          <span className="chip bg-red text-white border-red tnum">{data.escalations.length} تصعيد</span>
        ) : undefined
      }
    >
      <div className="flex gap-1.5 mb-4 overflow-x-auto thin-scroll">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`chip whitespace-nowrap px-4 py-2 text-sm ${tab === t.key ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-navy/15'}`}>
            {t.label}
            {'badge' in t && (t.badge ?? 0) > 0 && (
              <span className="tnum text-[10px] bg-red text-white rounded-full px-1.5">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="card p-6 flex flex-col sm:flex-row items-center gap-6">
            <Donut value={data.score} label="مؤشر الامتثال" />
            <div className="flex-1 w-full">
              <h3 className="font-kufi font-bold text-navy mb-1">
                {data.branch?.nameAr} · {data.branch?.districtAr}
              </h3>
              <p className="text-navy/50 text-xs mb-4">رخصة {data.branch?.licenseNo} · آخر 30 يومًا</p>
              <div className="grid grid-cols-3 gap-3">
                <KpiCard label="حالات فُتحت" value={data.monthStats.opened} />
                <KpiCard label="صُححت" value={data.monthStats.corrected} accent="#1B7A43" />
                <KpiCard label="تصعيدات" value={data.monthStats.escalated} accent="#CE4A3C" />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'cases' && (
        <div className="space-y-2">
          {data.cases.length === 0 && (
            <div className="card p-8 text-center text-navy/40">لا حالات ✓</div>
          )}
          {data.cases.map((c) => (
            <Link key={c.id} href={`/case/${c.id}`}
              className="card p-4 flex flex-wrap items-center gap-2 hover:border-navy/25 transition-colors">
              <span className="font-kufi font-bold text-navy tnum">{c.refNo}</span>
              <StatusChip status={c.status} />
              <span className="text-navy/60 text-xs flex-1 min-w-0 truncate">
                بند {c.itemCode} — {ITEM_MAP[c.itemCode]?.titleAr}
              </span>
              <span className="text-navy/40 text-[11px] tnum shrink-0">{formatDateTime(c.detectedAt)}</span>
            </Link>
          ))}
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-2">
          {data.reports.length === 0 && (
            <div className="card p-8 text-center text-navy/40">
              أول تقرير أسبوعي موقّع يصدر الخميس 17:00
            </div>
          )}
          {data.reports.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-kufi font-bold text-navy">
                  تقرير أسبوعي — {formatDate(r.periodStart)} إلى {formatDate(r.periodEnd)}
                </span>
                {r.stats && (
                  <span className="chip bg-green/10 text-green border-green/30 tnum">
                    امتثال {r.stats.complianceScore}%
                  </span>
                )}
              </div>
              <div className="text-navy/40 text-[11px] font-mono tnum mb-3" dir="ltr">
                {r.algo} · sha256: {shortHash(r.sha256)}
              </div>
              <a href={`/api/reports/${r.id}/pdf`} className="btn btn-navy text-sm py-2" download>
                تنزيل PDF الموقّع
              </a>
            </div>
          ))}
        </div>
      )}

      {tab === 'escalations' && (
        <div className="space-y-2">
          {data.escalations.length === 0 && (
            <div className="card p-8 text-center text-green">لا تصعيدات ✓</div>
          )}
          {data.escalations.map((e) => (
            <Link key={e.id} href={`/case/${e.id}`}
              className="card p-4 border-red/30 flex flex-wrap items-center gap-2 hover:border-red/50">
              <span className="w-2.5 h-2.5 rounded-full bg-red shrink-0" />
              <span className="font-kufi font-bold text-navy tnum">{e.refNo}</span>
              <span className="chip bg-red/10 text-red border-red/30">
                {e.escalationReason === 'repeat_7d' ? 'تكرار خلال 7 أيام' : 'انتهاء المهلة'}
              </span>
              <span className="text-navy/60 text-xs flex-1 min-w-0 truncate">
                بند {e.itemCode} — {ITEM_MAP[e.itemCode]?.titleAr}
              </span>
              {e.escalatedAt && (
                <span className="text-navy/40 text-[11px] tnum shrink-0">{formatDateTime(e.escalatedAt)}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
