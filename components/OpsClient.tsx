'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConfidenceBar } from './ui';

interface Review {
  id: string;
  refNo: string;
  branchName: string;
  itemCode: string;
  itemTitle: string;
  confidence: number;
  noteAr: string | null;
}
interface OpsData {
  threshold: number;
  tamperActive: boolean;
  chain: { ok: boolean; total: number; brokenCount: number; rootHash: string };
  reviews: Review[];
}

export default function OpsClient() {
  const [data, setData] = useState<OpsData | null>(null);
  const [threshold, setThreshold] = useState(0.85);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/ops', { cache: 'no-store' });
    const d: OpsData = await res.json();
    setData(d);
    setThreshold(d.threshold);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function action(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch('/api/ops/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      setMsg(d.message || (d.ok ? 'تم' : 'تعذّر التنفيذ'));
      await load();
    } catch {
      setMsg('تعذّر تنفيذ الإجراء.');
    } finally {
      setBusy(null);
    }
  }

  const chainOk = data?.chain.ok ?? true;

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-5 py-5">
      <div className="mb-5">
        <h1 className="font-kufi font-bold text-xl sm:text-2xl text-navy">غرفة العمليات</h1>
        <p className="text-navy/55 text-sm">المراجعة البشرية · عتبة الثقة · اختبار سلامة سلسلة الأدلة</p>
      </div>

      {msg && <div className="chip bg-navy/10 text-navy border-navy/20 mb-4">{msg}</div>}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* طابور المراجعة */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-4 py-3 border-b border-navy/8 flex items-center justify-between">
            <h2 className="font-kufi font-bold text-navy">طابور المراجعة البشرية</h2>
            <span className="chip bg-amber/15 text-amber border-amber/30 text-[11px]">ثقة 60%–84%</span>
          </div>
          <div className="p-3 space-y-2">
            {!data ? (
              <p className="text-navy/40 p-3">جارٍ التحميل…</p>
            ) : data.reviews.length === 0 ? (
              <p className="text-navy/50 p-4 text-center">لا عناصر بانتظار المراجعة.</p>
            ) : (
              data.reviews.map((r) => (
                <div key={r.id} className="rounded-lg border border-navy/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="tnum font-bold text-navy">{r.refNo} · بند {r.itemCode}</span>
                    <span className="text-navy/45 text-xs">{r.branchName}</span>
                  </div>
                  <p className="text-navy/60 text-sm mt-1 leading-tight">{r.itemTitle}</p>
                  {r.noteAr && <p className="text-navy/45 text-xs mt-1">{r.noteAr}</p>}
                  <div className="mt-2"><ConfidenceBar value={r.confidence} /></div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => action({ action: 'review', id: r.id, decision: 'approved' }, `ap-${r.id}`)}
                      disabled={busy === `ap-${r.id}`}
                      className="btn btn-primary flex-1 py-2 text-sm disabled:opacity-60"
                    >
                      اعتماد كمخالفة
                    </button>
                    <button
                      onClick={() => action({ action: 'review', id: r.id, decision: 'rejected' }, `rj-${r.id}`)}
                      disabled={busy === `rj-${r.id}`}
                      className="btn btn-ghost flex-1 py-2 text-sm disabled:opacity-60"
                    >
                      استبعاد
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* الأدوات */}
        <div className="space-y-4">
          {/* عتبة الثقة */}
          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-2">عتبة الثقة للإصدار الآلي</h3>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0.6} max={0.99} step={0.01} value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                onMouseUp={() => action({ action: 'threshold', value: threshold }, 'th')}
                onTouchEnd={() => action({ action: 'threshold', value: threshold }, 'th')}
                className="flex-1 accent-green"
              />
              <span className="tnum font-bold text-navy w-12 text-center">{Math.round(threshold * 100)}%</span>
            </div>
            <p className="text-navy/45 text-xs mt-2">ما دون هذه العتبة يذهب للمراجعة البشرية.</p>
          </div>

          {/* سلامة السلسلة */}
          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-2">سلامة سلسلة الأدلة</h3>
            <div className={`chip mb-3 ${chainOk ? 'bg-green/15 text-green border-green/30' : 'bg-red/15 text-red border-red/30'}`}>
              {chainOk ? 'السلسلة سليمة ✓' : `تم اكتشاف عبث — ${data?.chain.brokenCount} سجل مكسور ✕`}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => action({ action: 'tamper' }, 'tamper')}
                disabled={busy === 'tamper'}
                className="btn btn-red py-2 text-sm disabled:opacity-60"
              >
                محاكاة عبث (تجريبي)
              </button>
              <button
                onClick={() => action({ action: 'restore' }, 'restore')}
                disabled={busy === 'restore'}
                className="btn btn-primary py-2 text-sm disabled:opacity-60"
              >
                استعادة
              </button>
            </div>
            <p className="text-navy/45 text-xs mt-2 tnum" dir="ltr">
              {data ? `${data.chain.total} evidence · root ${data.chain.rootHash.slice(0, 10)}` : ''}
            </p>
          </div>

          {/* إعادة التعيين */}
          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-2">بيانات العرض</h3>
            <button
              onClick={() => { if (confirm('إعادة تعيين كل بيانات العرض إلى الحالة الأولية؟')) action({ action: 'reset' }, 'reset'); }}
              disabled={busy === 'reset'}
              className="btn btn-gold w-full py-2 text-sm disabled:opacity-60"
            >
              {busy === 'reset' ? 'جارٍ…' : 'إعادة تعيين بيانات العرض'}
            </button>
            <p className="text-navy/45 text-xs mt-2">يعيد الفروع والبنود والحالات التاريخية إلى وضعها الأصلي.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
