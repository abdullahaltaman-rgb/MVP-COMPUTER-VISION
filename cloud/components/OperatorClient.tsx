'use client';

// لوحة المشغّل: تنبيهاتي، حالات فرعي بعدادات المهل، شاشة الحالة بصورة الدليل،
// رفع لقطة التصحيح → إعادة كشف → إغلاق تلقائي.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from './AppShell';
import Countdown from './Countdown';
import { StatusChip, KpiCard } from './ui';
import { formatDateTime, formatMoney } from '@/lib/format';
import { ITEM_MAP } from '@/lib/catalog';

interface CaseRow {
  id: string;
  refNo: string;
  itemCode: string;
  status: string;
  confidence: number;
  potentialFine: number;
  detectedAt: string;
  graceDeadline: string;
  evidences: { id: string; kind: string; chainIndex: number; bytesPurged: boolean }[];
}

interface OperatorData {
  branch: { id: string; nameAr: string; districtAr: string; silentMode: boolean } | null;
  cases: CaseRow[];
  notifications: { id: string; type: string; titleAr: string; bodyAr: string; at: string }[];
}

export default function OperatorClient({ nameAr }: { nameAr: string }) {
  const [data, setData] = useState<OperatorData | null>(null);
  const [tab, setTab] = useState<'cases' | 'alerts'>('cases');
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/operator', { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  }

  function pickCorrection(caseId: string) {
    setCorrecting(caseId);
    fileRef.current?.click();
  }

  async function uploadCorrection(file: File) {
    if (!correcting) return;
    const caseId = correcting;
    setCorrecting(null);
    const b64 = await fileToB64(file);
    flash('جارٍ إعادة الكشف على لقطة التصحيح…');
    const res = await fetch('/api/operator/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, imageB64: b64 }),
    });
    const j = await res.json();
    if (res.ok && j.closed) {
      flash('أُغلقت الحالة — تم توثيق التصحيح في سلسلة العهدة ✓');
    } else {
      flash(j.reason || j.error || 'تعذر قبول التصحيح');
    }
    await load();
  }

  if (!data) {
    return (
      <AppShell title="لوحة المشغّل" role="operator" nameAr={nameAr}>
        <div className="text-navy/40 py-20 text-center">جارٍ التحميل…</div>
      </AppShell>
    );
  }

  const active = data.cases.filter((c) => ['new', 'notified', 'in_grace'].includes(c.status));
  const closed = data.cases.filter((c) => c.status === 'corrected');
  const escalated = data.cases.filter((c) => c.status === 'escalated');

  return (
    <AppShell
      title={data.branch ? `فرع ${data.branch.nameAr}` : 'لوحة المشغّل'}
      role="operator"
      nameAr={nameAr}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadCorrection(f);
          e.target.value = '';
        }}
      />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard label="ضمن المهلة" value={active.length} accent="#E0982C" />
        <KpiCard label="صُححت" value={closed.length} accent="#1B7A43" />
        <KpiCard label="مُصعّدة" value={escalated.length} accent="#CE4A3C" />
      </div>

      <div className="flex gap-1.5 mb-4">
        <button onClick={() => setTab('cases')}
          className={`chip px-4 py-2 text-sm ${tab === 'cases' ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-navy/15'}`}>
          حالات فرعي
        </button>
        <button onClick={() => setTab('alerts')}
          className={`chip px-4 py-2 text-sm ${tab === 'alerts' ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-navy/15'}`}>
          تنبيهاتي
          {data.notifications.length > 0 && (
            <span className="tnum text-[10px] bg-red text-white rounded-full px-1.5">
              {data.notifications.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'cases' && (
        <div className="space-y-3">
          {data.cases.length === 0 && (
            <div className="card p-8 text-center text-navy/40">لا حالات على فرعك ✓</div>
          )}
          {data.cases.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Link href={`/case/${c.id}`} className="font-kufi font-bold text-navy tnum hover:text-green">
                  {c.refNo}
                </Link>
                <StatusChip status={c.status} />
                <span className="chip bg-navy/10 text-navy border-navy/15 tnum">بند {c.itemCode}</span>
              </div>
              <div className="text-navy/70 text-sm mb-2">{ITEM_MAP[c.itemCode]?.titleAr}</div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-navy/50 text-xs">
                  رُصدت {formatDateTime(c.detectedAt)} · غرامة محتملة {formatMoney(c.potentialFine)}
                </div>
                <Countdown deadline={c.graceDeadline} status={c.status} size="sm" />
              </div>
              <div className="flex gap-2 mt-3">
                <Link href={`/case/${c.id}`} className="btn btn-ghost text-sm py-2">
                  شاشة الحالة والدليل
                </Link>
                {['new', 'notified', 'in_grace'].includes(c.status) && (
                  <button onClick={() => pickCorrection(c.id)} className="btn btn-primary text-sm py-2">
                    رفع لقطة التصحيح
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="space-y-2">
          {data.notifications.length === 0 && (
            <div className="card p-8 text-center text-navy/40">لا تنبيهات</div>
          )}
          {data.notifications.map((n) => (
            <div key={n.id} className="card p-4">
              <div className="font-bold text-navy text-sm mb-0.5">{n.titleAr}</div>
              <div className="text-navy/60 text-xs mb-1">{n.bodyAr}</div>
              <div className="text-navy/35 text-[11px] tnum">{formatDateTime(n.at)}</div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="toast-wrap">
          <div className="bg-navy text-white rounded-xl px-4 py-3 text-sm shadow-panel animate-slide-in">
            {toast}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
