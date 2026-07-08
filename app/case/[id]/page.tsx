import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getCaseDetail } from '@/lib/queries';
import { ITEM_MAP } from '@/lib/catalog';
import { formatDateTime, formatMoney, confidencePct } from '@/lib/format';
import { StatusChip, ConfidenceBar, Donut } from '@/components/ui';
import Countdown from '@/components/Countdown';
import CaseVerifyPanel from '@/components/CaseVerifyPanel';

export const dynamic = 'force-dynamic';

export default async function CasePage({ params }: { params: { id: string } }) {
  const detail = await getCaseDetail(params.id);
  if (!detail) notFound();
  const { case: c, verify } = detail;
  const item = ITEM_MAP[c.itemCode];
  const bbox = c.bbox ? (JSON.parse(c.bbox) as [number, number, number, number]) : null;
  const primaryEv = c.evidences.find((e) => e.kind === 'detection') ?? c.evidences[0];

  const qrSvg = await QRCode.toString(
    `ABYAD-VISION · حالة ${c.refNo} · رخصة ${c.branch.licenseNo} · جذر السلسلة ${verify.rootHash.slice(0, 12)}`,
    { type: 'svg', margin: 1, width: 128, color: { dark: '#16294A', light: '#00000000' } },
  );

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-5 py-5">
      {/* شريط علوي */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-3">
          <Link href="/ministry" className="text-navy/50 hover:text-navy text-sm">→ عودة للوحة</Link>
          <h1 className="font-kufi font-bold text-xl text-navy tnum">حالة {c.refNo}</h1>
          <StatusChip status={c.status} />
        </div>
        <span className="text-navy/50 text-sm">{c.branch.nameAr} · {c.branch.districtAr}</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* الدليل في إطار كاميرا */}
        <div className="lg:col-span-2">
          <div className="cctv-frame rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 h-9 bg-black/60 text-white/80 text-xs">
              <span className="flex items-center gap-2"><span className="rec-dot" /> {primaryEv?.cameraName ?? 'كاميرا العرض الحي'}</span>
              <span className="tnum">{primaryEv ? formatDateTime(primaryEv.signedAt) : ''}</span>
            </div>
            <div className="relative bg-black">
              {primaryEv ? (
                <div className="relative w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/evidence/${primaryEv.id}`} alt="الدليل" className="w-full h-auto block max-h-[70vh] object-contain mx-auto" />
                  {bbox && (
                    <div
                      className="absolute border-2 border-red"
                      style={{ left: `${bbox[0] * 100}%`, top: `${bbox[1] * 100}%`, width: `${bbox[2] * 100}%`, height: `${bbox[3] * 100}%` }}
                    >
                      <span className="absolute -top-6 right-0 chip bg-red text-white text-[11px] whitespace-nowrap tnum">
                        بند {c.itemCode} · {confidencePct(c.confidence)}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-video grid place-items-center text-white/40">لا يوجد دليل</div>
              )}
            </div>
          </div>
          {c.noteAr && <p className="text-navy/60 text-sm mt-2">ملاحظة الرصد: {c.noteAr}</p>}
        </div>

        {/* البطاقات الجانبية */}
        <div className="space-y-4">
          {/* البند التنظيمي */}
          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-3">البند التنظيمي</h3>
            <div className="font-kufi font-bold text-4xl text-navy tnum mb-2">{c.itemCode}</div>
            <p className="text-navy/70 text-sm leading-relaxed mb-3">{item?.titleAr ?? c.itemCode}</p>
            <div className="flex items-center justify-between border-t border-navy/8 pt-3">
              <span className="text-navy/55 text-sm">الغرامة</span>
              <span className="font-bold text-navy">{item?.fineText ?? formatMoney(c.potentialFine)}</span>
            </div>
            <span className="chip bg-amber/15 text-amber border-amber/30 mt-3">المرة الأولى — تنبيه دون غرامة</span>
          </div>

          {/* بيانات الرصد */}
          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-3">بيانات الرصد</h3>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-navy/55 mb-1">درجة الثقة</div>
                <ConfidenceBar value={c.confidence} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-navy/55">نافذة التأكيد</span>
                <span className="text-navy">مهلة تصحيح 48 ساعة</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-navy/55">المسار</span>
                <span className={`chip ${c.route === 'auto' ? 'bg-green/15 text-green border-green/30' : 'bg-amber/15 text-amber border-amber/30'}`}>
                  {c.route === 'auto' ? 'إصدار آلي (ثقة ≥ 85%)' : 'مراجعة بشرية'}
                </span>
              </div>
            </div>
          </div>

          {/* سلسلة العهدة */}
          <CaseVerifyPanel
            evidences={verify.records.map((r) => ({
              id: r.id, chainIndex: r.chainIndex, sha256: r.sha256, kind: r.kind, cameraName: r.cameraName, signedAt: r.signedAt,
            }))}
          />
        </div>
      </div>

      {/* السطر السفلي: الجدول الزمني + بطاقة الفرع */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-kufi font-bold text-navy">الجدول الزمني</h3>
            <div className="text-left">
              <div className="text-navy/50 text-xs">المتبقّي من مهلة التصحيح</div>
              <Countdown deadline={c.graceDeadline.toISOString()} status={c.status} size="lg" />
            </div>
          </div>
          <ol className="relative border-s-2 border-navy/10 ms-2 space-y-4">
            {c.events.map((ev) => (
              <li key={ev.id} className="ms-4">
                <span className={`absolute -start-[7px] w-3 h-3 rounded-full ${dotColor(ev.kind)}`} />
                <div className="text-navy text-sm font-medium">{ev.labelAr}</div>
                <div className="text-navy/45 text-xs tnum">{formatDateTime(ev.at)}</div>
              </li>
            ))}
          </ol>
        </div>

        {/* بطاقة الفرع */}
        <div className="card p-4">
          <h3 className="font-kufi font-bold text-navy mb-3">بطاقة الفرع</h3>
          <div className="flex items-start gap-3">
            <div className="shrink-0" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="text-sm flex-1">
              <div className="font-bold text-navy">{c.branch.nameAr}</div>
              <div className="text-navy/50 text-xs mb-2">{c.branch.districtAr}</div>
              <div className="text-navy/55 text-xs">رقم الرخصة</div>
              <div className="tnum font-mono text-navy text-sm" dir="ltr">{c.branch.licenseNo}</div>
            </div>
          </div>
          <div className="flex items-center justify-center mt-3 pt-3 border-t border-navy/8">
            <Donut value={c.branch.score} label="امتثال الفرع" size={110} />
          </div>
        </div>
      </div>
    </div>
  );
}

function dotColor(kind: string): string {
  switch (kind) {
    case 'corrected': case 'restored': return 'bg-green';
    case 'tampered': case 'escalated': return 'bg-red';
    case 'detected': return 'bg-amber';
    default: return 'bg-navy/40';
  }
}
