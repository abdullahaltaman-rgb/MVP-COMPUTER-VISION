// شاشة الحالة: الدليل، سلسلة العهدة، العدّاد التنازلي، الخط الزمني — لكل الأدوار المصادَقة
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import prisma from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ITEM_MAP, CAMERAS_AR } from '@/lib/catalog';
import { formatDateTime, formatMoney, STATUS_AR, STATUS_COLOR } from '@/lib/format';
import Countdown from '@/components/Countdown';
import CaseVerifyPanel from '@/components/CaseVerifyPanel';

export const dynamic = 'force-dynamic';

const HOME: Record<string, string> = {
  operator: '/operator',
  kafeel: '/kafeel',
  ops: '/ops',
  ministry: '/ministry',
};

export default async function CasePage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect('/');

  const kase = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      branch: true,
      evidences: { orderBy: { chainIndex: 'asc' } },
      timeline: { orderBy: { at: 'asc' } },
    },
  });
  if (!kase) notFound();
  // المشغّل والكفيل يريان حالات فرعهما فقط
  if ((user.role === 'operator' || user.role === 'kafeel') && user.branchId !== kase.branchId) {
    redirect(HOME[user.role] ?? '/');
  }

  const item = ITEM_MAP[kase.itemCode];

  return (
    <div className="min-h-screen bg-mist">
      <header className="bg-navy text-white sticky top-0 z-40 shadow-panel">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href={HOME[user.role] ?? '/'} className="text-white/60 hover:text-white text-sm shrink-0">
              → رجوع
            </Link>
            <h1 className="font-kufi font-bold text-sm sm:text-base truncate tnum">
              الحالة {kase.refNo}
            </h1>
          </div>
          <span className={`chip ${STATUS_COLOR[kase.status] ?? ''}`}>{STATUS_AR[kase.status] ?? kase.status}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="chip bg-navy/10 text-navy border-navy/15 tnum">بند {kase.itemCode}</span>
            <span className="chip bg-navy/5 text-navy/60 border-navy/10">
              {kase.route === 'auto' ? 'إصدار آلي' : 'اعتُمدت بالمراجعة'}
            </span>
            <span className="chip bg-navy/5 text-navy/60 border-navy/10 tnum">
              ثقة {Math.round(kase.confidence * 100)}%
            </span>
          </div>
          <h2 className="font-kufi font-bold text-navy text-lg leading-relaxed mb-1">
            {item?.titleAr ?? kase.itemCode}
          </h2>
          <div className="text-navy/50 text-sm mb-4">
            {kase.branch.nameAr} · {kase.branch.districtAr} · رخصة {kase.branch.licenseNo}
            {kase.cameraKey && <> · {CAMERAS_AR[kase.cameraKey] ?? kase.cameraKey}</>}
          </div>
          {kase.noteAr && <p className="text-navy/70 text-sm mb-4">{kase.noteAr}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-mist p-3">
              <div className="text-navy/50 text-[11px] mb-1">رُصدت في</div>
              <div className="text-navy text-sm font-bold tnum">{formatDateTime(kase.detectedAt)}</div>
            </div>
            <div className="rounded-xl bg-mist p-3">
              <div className="text-navy/50 text-[11px] mb-1">مهلة التصحيح (48 ساعة)</div>
              <Countdown deadline={kase.graceDeadline.toISOString()} status={kase.status} />
            </div>
            <div className="rounded-xl bg-mist p-3">
              <div className="text-navy/50 text-[11px] mb-1">الغرامة المحتملة</div>
              <div className="text-red text-sm font-bold tnum">{formatMoney(kase.potentialFine)}</div>
            </div>
          </div>
        </div>

        {/* صور الأدلة */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {kase.evidences.map((ev) => (
            <figure key={ev.id} className="card overflow-hidden">
              {ev.bytesPurged ? (
                <div className="h-48 grid place-items-center bg-navy/5 text-navy/40 text-xs px-4 text-center">
                  أُتلفت بايتات الدليل وفق سياسة 90 يومًا — البصمة موثّقة في السلسلة
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/evidence/${ev.id}`} alt="صورة الدليل" className="w-full h-48 object-cover" />
              )}
              <figcaption className="p-3 text-xs text-navy/60 flex items-center justify-between gap-2">
                <span>
                  {ev.kind === 'correction' ? 'دليل تصحيح' : 'دليل رصد'} · {ev.cameraName}
                </span>
                <span className="tnum">#{ev.chainIndex}</span>
              </figcaption>
            </figure>
          ))}
        </div>

        {/* سلسلة العهدة */}
        <CaseVerifyPanel
          evidences={kase.evidences.map((e) => ({
            id: e.id,
            chainIndex: e.chainIndex,
            sha256: e.sha256,
            kind: e.kind,
            cameraName: e.cameraName,
            signedAt: e.signedAt.toISOString(),
          }))}
        />

        {/* الخط الزمني */}
        <div className="card p-4">
          <h3 className="font-kufi font-bold text-navy mb-3">الخط الزمني</h3>
          <div className="space-y-0">
            {kase.timeline.map((t, i) => (
              <div key={t.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                    t.kind === 'corrected' ? 'bg-green' : t.kind === 'escalated' ? 'bg-red' : 'bg-navy/40'
                  }`} />
                  {i < kase.timeline.length - 1 && <span className="w-px flex-1 bg-navy/10" />}
                </div>
                <div className="pb-4">
                  <div className="text-navy text-sm">{t.labelAr}</div>
                  <div className="text-navy/40 text-[11px] tnum">{formatDateTime(t.at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
