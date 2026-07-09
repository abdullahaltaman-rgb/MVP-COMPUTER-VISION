'use client';

// لوحة الأمانة (قراءة فقط — بيانات حقيقية، وصول داخلي):
// إحصاءات الحالات، جذر سلسلة العهدة، بصمات التشغيل اليومية الموقّعة.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from './AppShell';
import { StatusChip, KpiCard } from './ui';
import { formatDate, formatDateTime, shortHash } from '@/lib/format';
import { ITEM_MAP } from '@/lib/catalog';

interface MinistryData {
  branches: { id: string; code: string; nameAr: string; districtAr: string; licenseNo: string; score: number }[];
  cases: {
    id: string; refNo: string; itemCode: string; status: string; confidence: number;
    detectedAt: string; branch: { nameAr: string; districtAr: string };
  }[];
  stats: { total: number; active: number; corrected: number; escalated: number };
  chainRoot: { rootHash: string; index: number };
  digests: { id: string; date: string; rootHash: string; sha256: string; algo: string }[];
}

export default function MinistryClient({ nameAr, role }: { nameAr: string; role: string }) {
  const [data, setData] = useState<MinistryData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/ministry', { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return (
      <AppShell title="غرفة عمليات الامتثال — الأمانة" role={role} nameAr={nameAr}>
        <div className="text-navy/40 py-20 text-center">جارٍ التحميل…</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="غرفة عمليات الامتثال — أمانة منطقة الرياض"
      role={role}
      nameAr={nameAr}
      badge={<span className="chip bg-white/10 text-white/80 border-white/20">قراءة فقط</span>}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="إجمالي الحالات" value={data.stats.total} />
        <KpiCard label="نشطة (ضمن المهلة)" value={data.stats.active} accent="#E0982C" />
        <KpiCard label="صُححت" value={data.stats.corrected} accent="#1B7A43" />
        <KpiCard label="مُصعّدة" value={data.stats.escalated} accent="#CE4A3C" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          <h3 className="font-kufi font-bold text-navy">أحدث الحالات (بيانات حية)</h3>
          {data.cases.length === 0 && (
            <div className="card p-8 text-center text-navy/40">لا حالات مسجّلة بعد</div>
          )}
          {data.cases.slice(0, 30).map((c) => (
            <Link key={c.id} href={`/case/${c.id}`}
              className="card p-3.5 flex flex-wrap items-center gap-2 hover:border-navy/25">
              <span className="font-kufi font-bold text-navy tnum text-sm">{c.refNo}</span>
              <StatusChip status={c.status} />
              <span className="text-navy/60 text-xs flex-1 min-w-0 truncate">
                {c.branch.nameAr} · بند {c.itemCode} — {ITEM_MAP[c.itemCode]?.titleAr}
              </span>
              <span className="text-navy/40 text-[11px] tnum shrink-0">{formatDateTime(c.detectedAt)}</span>
            </Link>
          ))}
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-2">سلسلة العهدة</h3>
            <div className="text-navy/50 text-xs mb-1">
              الجذر الحالي (سجل <span className="tnum">#{data.chainRoot.index}</span>):
            </div>
            <div className="font-mono text-[11px] text-navy/70 break-all mb-3" dir="ltr">
              {data.chainRoot.rootHash}
            </div>
            <Link href="/api/chain/verify" className="btn btn-navy w-full text-sm py-2" target="_blank">
              التحقق الكامل من السلسلة
            </Link>
          </div>

          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-2">بصمات التشغيل اليومية الموقّعة</h3>
            {data.digests.length === 0 && (
              <div className="text-navy/40 text-xs py-3">تصدر أول بصمة بعد أول يوم تشغيل</div>
            )}
            <div className="space-y-1.5">
              {data.digests.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-xs border-b border-navy/5 py-1.5">
                  <span className="text-navy tnum shrink-0">{formatDate(d.date)}</span>
                  <span className="font-mono text-navy/40 tnum flex-1 truncate" dir="ltr">
                    {shortHash(d.sha256)}
                  </span>
                  <span className="chip bg-green/10 text-green border-green/30 text-[10px]">{d.algo}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-kufi font-bold text-navy">الفروع المراقبة</h3>
            {data.branches.map((b) => (
              <div key={b.id} className="card p-3.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-navy text-sm font-bold truncate">{b.nameAr}</div>
                  <div className="text-navy/40 text-[11px]">{b.districtAr} · رخصة {b.licenseNo}</div>
                </div>
                <span className="chip bg-navy/10 text-navy border-navy/15 tnum">{b.code}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
