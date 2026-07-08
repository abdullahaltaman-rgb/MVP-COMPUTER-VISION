'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MinistryCaseRow, FeedEvent } from '@/lib/queries';
import type { OverviewStats } from '@/lib/stats';
import { StatusChip, ConfidenceBar, Donut, KpiCard } from './ui';
import Countdown from './Countdown';
import { formatDateTime, formatTime, shortHash } from '@/lib/format';

interface MinistryData {
  overview: OverviewStats;
  cases: MinistryCaseRow[];
  feed: FeedEvent[];
  chain: { rootHash: string; index: number };
}

export default function MinistryClient({ initial }: { initial: MinistryData }) {
  const [data, setData] = useState<MinistryData>(initial);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/ministry', { cache: 'no-store' });
        const d = await res.json();
        setData(d);
        setPulse(true);
        setTimeout(() => setPulse(false), 700);
      } catch {
        /* تجاهل */
      }
    };
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

  const o = data.overview;
  const kpis = [
    { label: 'فروع متصلة', value: o.branches },
    { label: 'عمليات رصد اليوم', value: o.detectionsToday },
    { label: 'حالات نشطة', value: o.activeCases, accent: '#E0982C' },
    { label: 'ضمن مهلة التصحيح', value: o.inGrace },
    { label: 'صُححت قبل التصعيد', value: `${o.correctedBeforeEscalationPct}%`, accent: '#1B7A43' },
    { label: 'متوسط زمن التصحيح', value: `${o.avgCorrectionHours} س` },
  ];

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-5 py-5">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-kufi font-bold text-xl sm:text-2xl text-navy">
            غرفة عمليات الامتثال
          </h1>
          <p className="text-navy/55 text-sm">قطاع المغاسل · أمانة منطقة الرياض</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${pulse ? 'bg-green/20' : 'bg-green/10'} text-green border-green/30 transition`}>
            <span className="w-2 h-2 rounded-full bg-green animate-pulse" /> مباشر · تحديث كل 5 ثوانٍ
          </span>
          <span className="chip bg-navy/10 text-navy border-navy/20">عرض فقط</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-4 mb-5">
        {/* KPIs */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          {kpis.map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} accent={k.accent} />
          ))}
        </div>
        {/* Donut */}
        <div className="card p-4 flex flex-col items-center justify-center">
          <Donut value={o.complianceRate} label="الامتثال العام" />
          <div className="text-navy/50 text-xs mt-2 text-center">مؤشر امتثال القطاع</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        {/* جدول الحالات */}
        <div className="lg:col-span-3 card overflow-hidden">
          <div className="px-4 py-3 border-b border-navy/8 flex items-center justify-between">
            <h2 className="font-kufi font-bold text-navy">الحالات الميدانية الحية</h2>
            <span className="text-navy/40 text-xs tnum">{data.cases.length} حالة</span>
          </div>
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-navy/50 text-xs border-b border-navy/8">
                  <th className="text-right font-medium px-3 py-2">المغسلة / الحي</th>
                  <th className="text-right font-medium px-3 py-2">البند والمخالفة</th>
                  <th className="text-right font-medium px-3 py-2">وقت الرصد</th>
                  <th className="text-center font-medium px-3 py-2">الدليل</th>
                  <th className="text-right font-medium px-3 py-2">الثقة</th>
                  <th className="text-right font-medium px-3 py-2">المهلة</th>
                  <th className="text-right font-medium px-3 py-2">الحالة</th>
                  <th className="text-right font-medium px-3 py-2">الغرامة</th>
                </tr>
              </thead>
              <tbody>
                {data.cases.map((c) => (
                  <tr key={c.id} className="border-b border-navy/5 hover:bg-mist/60 transition">
                    <td className="px-3 py-2.5">
                      <Link href={`/case/${c.id}`} className="font-medium text-navy hover:text-green">
                        {c.branchName}
                      </Link>
                      <div className="text-navy/45 text-xs">{c.district}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tnum font-bold text-navy">{c.itemCode}</span>
                      <div className="text-navy/55 text-xs leading-tight max-w-[220px] line-clamp-2">{c.itemTitle}</div>
                    </td>
                    <td className="px-3 py-2.5 text-navy/60 text-xs tnum whitespace-nowrap">{formatDateTime(c.detectedAt)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {c.evidenceId ? (
                        <Link href={`/case/${c.id}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/evidence/${c.evidenceId}`} alt="دليل" className="w-12 h-9 object-cover rounded border border-navy/10 inline-block" />
                        </Link>
                      ) : (
                        <span className="text-navy/30">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><ConfidenceBar value={c.confidence} /></td>
                    <td className="px-3 py-2.5"><Countdown deadline={c.graceDeadline} status={c.status} size="sm" /></td>
                    <td className="px-3 py-2.5"><StatusChip status={c.status} /></td>
                    <td className="px-3 py-2.5 tnum text-navy/70 whitespace-nowrap">{c.potentialFine.toLocaleString('en-US')} ﷼</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* بث الأحداث */}
        <div className="card overflow-hidden flex flex-col max-h-[520px]">
          <div className="px-4 py-3 border-b border-navy/8">
            <h2 className="font-kufi font-bold text-navy">بث الأحداث</h2>
          </div>
          <div className="overflow-y-auto thin-scroll p-2 flex-1">
            {data.feed.map((e) => (
              <Link
                key={e.id}
                href={`/case/${e.caseId}`}
                className="block mb-1.5 rounded-lg hover:bg-mist p-2 border border-transparent hover:border-navy/8 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-navy tnum">{e.refNo}</span>
                  <span className="text-navy/40 text-[10px] tnum">{formatTime(e.at)}</span>
                </div>
                <div className="text-navy/60 text-xs leading-tight mt-0.5">{e.labelAr}</div>
                <div className="text-navy/40 text-[11px] mt-0.5">{e.branchName} · بند {e.itemCode}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* تذييل ذهبي */}
      <div className="mt-5 rounded-xl bg-gradient-to-l from-gold to-[#9a7638] text-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="opacity-80 text-xs">آخر توقيع لسلسلة العهدة</div>
          <div className="tnum font-bold" dir="ltr">{shortHash(data.chain.rootHash)}</div>
        </div>
        <div className="text-sm text-center">
          <div className="opacity-80 text-xs">عدد الأدلة الموقّعة</div>
          <div className="tnum font-bold">{data.chain.index + 1}</div>
        </div>
        <Link href="/report/monthly" className="btn bg-white text-gold hover:bg-white/90">
          تصدير التقرير الشهري الموقّع
        </Link>
      </div>
    </div>
  );
}
