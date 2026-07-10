'use client';

import { useCallback, useEffect, useState } from 'react';
import { shortHash } from '@/lib/format';

interface EvidenceRec {
  id: string;
  chainIndex: number;
  sha256: string;
  kind: string;
  cameraName: string;
  signedAt: string;
}

interface VerifyState {
  ok: boolean;
  reason?: string;
}

export default function CaseVerifyPanel({ evidences }: { evidences: EvidenceRec[] }) {
  const [status, setStatus] = useState<Record<string, VerifyState>>({});
  const [checking, setChecking] = useState(false);
  const [overall, setOverall] = useState<boolean | null>(null);
  const ids = new Set(evidences.map((e) => e.id));

  const verify = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/chain/verify', { cache: 'no-store' });
      const data = await res.json();
      const map: Record<string, VerifyState> = {};
      let allOk = true;
      for (const r of data.records as { id: string; ok: boolean; reason?: string }[]) {
        if (ids.has(r.id)) {
          map[r.id] = { ok: r.ok, reason: r.reason };
          if (!r.ok) allOk = false;
        }
      }
      setStatus(map);
      setOverall(allOk);
    } catch {
      setOverall(null);
    } finally {
      setChecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    verify();
  }, [verify]);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-kufi font-bold text-navy">سلسلة العهدة الرقمية</h3>
        {overall === true && <span className="chip bg-green/15 text-green border-green/30">السلسلة سليمة ✓</span>}
        {overall === false && <span className="chip bg-red/15 text-red border-red/30">تم اكتشاف عبث ✕</span>}
      </div>

      <div className="space-y-2">
        {evidences.map((e) => {
          const st = status[e.id];
          const ok = st?.ok ?? true;
          return (
            <div key={e.id} className={`rounded-lg border p-3 ${st && !ok ? 'border-red/40 bg-red/5' : 'border-navy/10 bg-mist/50'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="chip bg-navy/10 text-navy border-navy/15 me-1 text-[11px]">
                    {e.kind === 'correction' ? 'دليل تصحيح' : 'دليل رصد'} #{e.chainIndex}
                  </span>
                  <span className="text-navy/50 text-xs">{e.cameraName}</span>
                </div>
                {st ? (
                  ok ? (
                    <span className="text-green text-xs font-bold whitespace-nowrap">✓ موثّق</span>
                  ) : (
                    <span className="text-red text-xs font-bold whitespace-nowrap">✕ مكسور</span>
                  )
                ) : (
                  <span className="text-navy/30 text-xs">—</span>
                )}
              </div>
              <div className="mt-2 font-mono text-[11px] text-navy/60 tnum break-all" dir="ltr">
                sha256: {shortHash(e.sha256)}
              </div>
              {st && !ok && st.reason && <div className="text-red text-[11px] mt-1">{st.reason}</div>}
            </div>
          );
        })}
      </div>

      <button onClick={verify} disabled={checking} className="btn btn-navy w-full mt-3 disabled:opacity-60">
        {checking ? 'جارٍ التحقق…' : 'التحقق من سلامة الدليل'}
      </button>
      <p className="text-navy/40 text-[11px] mt-2 leading-relaxed">
        يُعاد حساب البصمة <span dir="ltr" className="font-mono">sha256(bytes + prevHash)</span> ومطابقتها بالسلسلة الكاملة.
        أي تعديل ببايت واحد يكسر التحقق فورًا.
      </p>
    </div>
  );
}
