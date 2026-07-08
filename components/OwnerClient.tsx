'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { StatusChip } from './ui';
import Countdown from './Countdown';
import { formatDateTime } from '@/lib/format';

interface OwnerCase {
  id: string;
  refNo: string;
  branchName: string;
  district: string;
  itemCode: string;
  itemTitle: string;
  fineText: string;
  noteAr: string | null;
  detectedAt: string;
  graceDeadline: string;
  status: string;
  confidence: number;
  evidenceId: string | null;
}

export default function OwnerClient() {
  const [open, setOpen] = useState<OwnerCase[]>([]);
  const [closed, setClosed] = useState<OwnerCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    const res = await fetch('/api/owner', { cache: 'no-store' });
    const d = await res.json();
    setOpen(d.open);
    setClosed(d.closed);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function upload(caseId: string, file: File) {
    setBusyId(caseId);
    setMsg(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch('/api/owner/correct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId, imageB64: String(reader.result) }),
        });
        const d = await res.json();
        setMsg({ text: d.message, ok: !!d.corrected });
        await load();
      } catch {
        setMsg({ text: 'تعذّر رفع التصحيح.', ok: false });
      } finally {
        setBusyId(null);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-5 py-5">
      <div className="mb-5">
        <h1 className="font-kufi font-bold text-xl sm:text-2xl text-navy">لوحة المالك</h1>
        <p className="text-navy/55 text-sm">تنبيهات المخالفات · مهلة التصحيح · رفع لقطة التصحيح الموثّقة</p>
      </div>

      {/* شريط تنبيهات */}
      <div className="rounded-xl bg-amber/10 border border-amber/30 p-4 mb-5 flex items-center gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-full bg-amber/20 text-amber shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div>
          <div className="font-bold text-navy">لديك {open.length} مخالفة نشطة تتطلّب تصحيحًا</div>
          <div className="text-navy/60 text-sm">صحّح قبل انتهاء المهلة لتجنّب التصعيد والغرامة.</div>
        </div>
      </div>

      {msg && (
        <div className={`chip mb-4 ${msg.ok ? 'bg-green/15 text-green border-green/30' : 'bg-red/15 text-red border-red/30'}`}>
          {msg.text}
        </div>
      )}

      {/* الحالات المفتوحة */}
      <h2 className="font-kufi font-bold text-navy mb-3">الحالات المفتوحة</h2>
      {loading ? (
        <p className="text-navy/40">جارٍ التحميل…</p>
      ) : open.length === 0 ? (
        <div className="card p-6 text-center text-navy/50">لا توجد حالات مفتوحة — أحسنت! ✓</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3 mb-8">
          {open.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/case/${c.id}`} className="font-bold text-navy tnum hover:text-green">{c.refNo}</Link>
                  <div className="text-navy/50 text-xs">{c.branchName} · {c.district}</div>
                </div>
                <StatusChip status={c.status} />
              </div>
              <div className="mt-2">
                <span className="tnum font-bold text-navy">{c.itemCode}</span>
                <p className="text-navy/60 text-sm leading-tight">{c.itemTitle}</p>
              </div>
              <div className="flex items-center gap-2 my-3">
                {c.evidenceId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/evidence/${c.evidenceId}`} alt="دليل" className="w-16 h-12 object-cover rounded border border-navy/10" />
                )}
                <div className="text-sm">
                  <div className="text-navy/50 text-xs">المتبقّي من المهلة</div>
                  <Countdown deadline={c.graceDeadline} status={c.status} />
                  <div className="text-navy/50 text-xs mt-1">{c.fineText}</div>
                </div>
              </div>
              <input
                ref={(el) => { fileRefs.current[c.id] = el; }}
                type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(c.id, f); }}
              />
              <button
                onClick={() => fileRefs.current[c.id]?.click()}
                disabled={busyId === c.id}
                className="btn btn-primary w-full disabled:opacity-60"
              >
                {busyId === c.id ? 'جارٍ التحقق…' : 'رفع لقطة التصحيح'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* الحالات المُصححة */}
      {closed.length > 0 && (
        <>
          <h2 className="font-kufi font-bold text-navy mb-3">حالات مُصححة موثّقة</h2>
          <div className="grid md:grid-cols-3 gap-3">
            {closed.map((c) => (
              <Link key={c.id} href={`/case/${c.id}`} className="card p-3 hover:shadow-panel transition">
                <div className="flex items-center justify-between">
                  <span className="tnum font-bold text-navy">{c.refNo}</span>
                  <StatusChip status={c.status} />
                </div>
                <div className="text-navy/55 text-xs mt-1">{c.branchName} · بند {c.itemCode}</div>
                <div className="text-navy/40 text-[11px] mt-1 tnum">{formatDateTime(c.detectedAt)}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
