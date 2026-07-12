'use client';

// ── محفظة الرُخص (الكفيل) — منصة رصد الامتثال البلدي ──
// مطابقة للتصميم المعتمد design/sponsor.html — نظرة قائد الأعمال:
// صحة المحفظة، بطاقات الفروع، التقرير الأسبوعي الموقّع، الأحداث الجوهرية.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LiveStream from './LiveStream';
import { formatDate, formatDateTime } from '@/lib/format';
import { ITEM_MAP } from '@/lib/catalog';
import { normalizeDistrict } from '@/lib/geo';

const CAMERA_ORDER = ['cam_processing', 'cam_reception', 'cam_waste'];
const ACTIVE = ['new', 'notified', 'in_grace'];

interface CaseRow {
  id: string;
  refNo: string;
  itemCode: string;
  status: string;
  potentialFine: number;
  detectedAt: string;
  correctedAt: string | null;
  escalatedAt: string | null;
  escalationReason: string | null;
}

interface ReportRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  sha256: string;
  signature: string;
  algo: string;
  s3KeyPdf: string | null;
  createdAt: string;
  stats?: { complianceScore?: number; casesOpened?: number; casesEscalated?: number };
}

interface KafeelData {
  branch: {
    id: string;
    code: string;
    nameAr: string;
    districtAr: string;
    licenseNo: string;
    score: number;
  } | null;
  score: number;
  monthStats: { opened: number; corrected: number; escalated: number };
  cases: CaseRow[];
  reports: ReportRow[];
  escalations: CaseRow[];
  cameras: { key: string; nameAr: string; online: boolean }[];
}

export default function KafeelClient({ nameAr }: { nameAr: string }) {
  const router = useRouter();
  const [data, setData] = useState<KafeelData | null>(null);
  const [clock, setClock] = useState('');
  const [showStream, setShowStream] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    const res = await fetch('/api/kafeel', { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB'));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => () => clearTimeout(toastT.current), []);

  function flash(msg: string) {
    clearTimeout(toastT.current);
    setToast(msg);
    toastT.current = setTimeout(() => setToast(null), 3000);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  }

  const branch = data?.branch ?? null;
  const cases = useMemo(() => data?.cases ?? [], [data]);
  const activeCases = useMemo(() => cases.filter((c) => ACTIVE.includes(c.status)), [cases]);
  const escalations = data?.escalations ?? [];

  /** أيام بلا تصعيد — null إن لم يقع تصعيد قط */
  const daysClean = useMemo(() => {
    const esc = cases
      .filter((c) => c.escalatedAt)
      .map((c) => new Date(c.escalatedAt as string).getTime())
      .sort((a, b) => b - a);
    if (esc.length === 0) return null;
    return Math.floor((Date.now() - esc[0]) / (24 * 3600 * 1000));
  }, [cases]);

  const cameras = useMemo(() => {
    const list = data?.cameras ?? [];
    return [...list].sort((a, b) => CAMERA_ORDER.indexOf(a.key) - CAMERA_ORDER.indexOf(b.key));
  }, [data]);

  const onlineCameras = cameras.filter((c) => c.online).length;

  /** الأحداث الجوهرية — مشتقّة من الحالات والتقارير الحقيقية */
  const timeline = useMemo(() => {
    type Ev = { id: string; icon: string; color: string; title: string; sub: string; at: number };
    const evs: Ev[] = [];

    cases.forEach((c) => {
      const title = ITEM_MAP[c.itemCode]?.titleAr ?? c.itemCode;
      if (c.escalatedAt) {
        evs.push({
          id: `esc-${c.id}`,
          icon: '⚠',
          color: '#CE4A3C',
          title: `تصعيد يمسّ رخصتك — ${title}`,
          sub: `${formatDateTime(c.escalatedAt)} · غرامة محتملة ${c.potentialFine.toLocaleString('en-US')} ريال`,
          at: new Date(c.escalatedAt).getTime(),
        });
      } else if (c.correctedAt) {
        evs.push({
          id: `cor-${c.id}`,
          icon: '✓',
          color: '#165D3A',
          title: `تصحيح مقبول وأُغلقت الحالة — ${title}`,
          sub: `${formatDateTime(c.correctedAt)} · دون غرامة`,
          at: new Date(c.correctedAt).getTime(),
        });
      } else if (ACTIVE.includes(c.status)) {
        evs.push({
          id: `act-${c.id}`,
          icon: '⏳',
          color: '#E0982C',
          title: `مخالفة ضمن المهلة — ${title}`,
          sub: `${formatDateTime(c.detectedAt)} · المشغّل يعالجها — لا إجراء مطلوب منك`,
          at: new Date(c.detectedAt).getTime(),
        });
      }
    });

    (data?.reports ?? []).forEach((r) => {
      evs.push({
        id: `rep-${r.id}`,
        icon: '📄',
        color: '#8A99A5',
        title: 'التقرير الأسبوعي صدر ووُقّع رقميًا',
        sub: formatDateTime(r.createdAt),
        at: new Date(r.createdAt).getTime(),
      });
    });

    return evs.sort((a, b) => b.at - a.at).slice(0, 6);
  }, [cases, data]);

  if (!data) {
    return (
      <div dir="rtl" className="min-h-screen bg-canvas grid place-items-center">
        <div className="text-ink-faint">جارٍ التحميل…</div>
      </div>
    );
  }

  const score = data.score;
  const scoreColor = score >= 90 ? '#165D3A' : score >= 70 ? '#E0982C' : '#CE4A3C';
  const scoreDash = (score / 100) * 251.3;

  const latestReport = data.reports[0] ?? null;
  const branchScore = branch?.score ?? 0;
  const branchColor = branchScore >= 90 ? '#165D3A' : branchScore >= 70 ? '#E0982C' : '#CE4A3C';
  const branchDash = (branchScore / 100) * 251.3;

  const branchActive = activeCases.length > 0;
  const branchEscalated = escalations.length > 0;

  return (
    <div dir="rtl" className="min-h-screen bg-canvas flex flex-col">
      {/* ── الشريط العلوي ── */}
      <header
        className="text-white border-b-[3px] border-gold"
        style={{ background: 'linear-gradient(135deg,#0B3320 0%,#165D3A 70%,#1B6B44 100%)' }}
      >
        <div className="max-w-[1440px] mx-auto px-6 py-3 flex items-center justify-between gap-5 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-[46px] h-[46px] rounded-full border-2 border-gold grid place-items-center shrink-0"
              style={{ background: 'radial-gradient(circle at 35% 30%,#1E7248,#0B3320)' }}
            >
              <span className="font-kufi font-extrabold text-[11.5px] text-sand">رصد</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <h1 className="m-0 font-kufi font-bold text-[17.5px] text-white">
                منصة رصد الامتثال البلدي <span className="text-gold font-semibold">·</span> محفظة الرُخص
              </h1>
              <span className="text-[11px] text-[#C9DCD0]">لوحة الكفيل — نظرة قائد الأعمال</span>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex flex-col gap-0.5 text-left border-l border-white/20 pl-4">
              <span className="text-[12.5px] font-bold text-[#E8F1EA]">{nameAr}</span>
              <span className="text-[10.5px] text-[#AFC8B7]">كفيل — صاحب الرخصة النظامي</span>
            </div>
            <div className="font-mono text-[15px] font-semibold tracking-wider text-white tnum min-w-[84px] text-center">
              {clock || '—'}
            </div>
            <button
              onClick={logout}
              className="text-white/70 hover:text-white text-xs border border-white/25 rounded-lg px-3 py-1.5"
            >
              خروج
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto w-full box-border px-6 py-5 flex flex-col gap-[18px] flex-1">
        {/* ── صحة محفظتك ── */}
        <section
          className="rounded-2xl border border-line px-6 py-5 flex items-center gap-8 flex-wrap"
          style={{
            background: 'linear-gradient(140deg,#FFFFFF 0%,#F2F8F4 55%,#EAF3EE 100%)',
            boxShadow: '0 2px 12px rgba(15,41,66,.06)',
          }}
        >
          <div className="flex items-center gap-6">
            <div className="relative w-32 h-32 shrink-0">
              <svg width="128" height="128" viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="46" cy="46" r="40" fill="none" stroke="#DCE9E0" strokeWidth="8" />
                <circle
                  cx="46"
                  cy="46"
                  r="40"
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${scoreDash} 251.3`}
                />
              </svg>
              <span
                className="absolute inset-0 grid place-items-center font-kufi font-extrabold text-[28px] tnum"
                style={{ color: scoreColor }}
              >
                {score}%
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-bold" style={{ color: scoreColor }}>
                مؤشر امتثال المحفظة
              </span>
              <span className="font-kufi font-extrabold text-[32px] text-ink leading-none tnum">
                {score}%
              </span>
              <span className="text-[11.5px] text-ink-soft">
                محسوب من آخر 30 يومًا · {data.monthStats.opened} حالة، {data.monthStats.corrected} صُحّحت
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Pill icon="🗂" text={`${branch ? 1 : 0} رخصة بلدية سارية`} />
            <Pill icon="📡" text={`${onlineCameras} من ${cameras.length} كاميرات متصلة`} />
            <Pill
              icon="🛡"
              text={`${escalations.length} تصعيد نشط`}
              danger={escalations.length > 0}
            />
          </div>

          <div className="flex flex-col items-center gap-2 mr-auto">
            <div
              className="rounded-2xl px-6 py-4 flex flex-col items-center gap-1 border-2"
              style={{
                background: branchEscalated ? '#FBEAE7' : 'linear-gradient(160deg,#FFFFFF,#F2F8F4)',
                borderColor: branchEscalated ? '#F0D9D5' : '#B8934A',
              }}
            >
              <span className="text-2xl">{branchEscalated ? '⚠' : '🛡'}</span>
              <span
                className="font-kufi font-extrabold text-sm"
                style={{ color: branchEscalated ? '#CE4A3C' : '#165D3A' }}
              >
                {branchEscalated ? 'تصعيد قائم' : 'سجل نظيف'}
              </span>
              <span className="text-[11px] text-ink-soft">
                {daysClean === null
                  ? 'لا تصعيد مسجّل قط'
                  : `${daysClean} يومًا منذ آخر تصعيد`}
              </span>
            </div>
            <span className="text-[10.5px] text-ink-faint">شارة معتمدة من المركز الوطني</span>
          </div>
        </section>

        {/* ── فروعك ── */}
        <section className="flex flex-col gap-3">
          <h2 className="m-0 font-kufi font-bold text-base text-ink">فروعك</h2>

          {!branch ? (
            <div className="bg-white border border-line rounded-2xl py-14 text-center text-ink-faint text-sm">
              لا فرع مرتبط بحسابك
            </div>
          ) : (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
              <div
                className="bg-white rounded-2xl overflow-hidden border shadow-[0_1px_4px_rgba(15,41,66,.06)]"
                style={{ borderColor: branchEscalated ? '#F0D9D5' : branchActive ? '#EFE0BE' : '#E3EBE5' }}
              >
                <div className="px-[18px] py-4 flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-kufi font-bold text-[15px] text-ink">
                      {branch.nameAr} — {normalizeDistrict(branch.districtAr)}
                    </span>
                    <span className="text-[11.5px] text-ink-soft">
                      رخصة <span className="font-mono font-bold text-ink">{branch.licenseNo}</span>
                    </span>
                  </div>
                  <div className="relative w-[60px] h-[60px] shrink-0">
                    <svg width="60" height="60" viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="46" cy="46" r="40" fill="none" stroke="#DCE9E0" strokeWidth="10" />
                      <circle
                        cx="46"
                        cy="46"
                        r="40"
                        fill="none"
                        stroke={branchColor}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${branchDash} 251.3`}
                      />
                    </svg>
                    <span
                      className="absolute inset-0 grid place-items-center font-kufi font-extrabold text-[13px] tnum"
                      style={{ color: branchColor }}
                    >
                      {branchScore}%
                    </span>
                  </div>
                </div>

                <div className="px-[18px] pb-3">
                  <span
                    className="inline-flex items-center text-[11.5px] font-bold rounded-full px-3 py-1"
                    style={{
                      color: branchEscalated ? '#CE4A3C' : branchActive ? '#A96F14' : '#165D3A',
                      background: branchEscalated ? '#FBEAE7' : branchActive ? '#FBF3E3' : '#EFF6F1',
                    }}
                  >
                    {branchEscalated
                      ? 'تصعيد نشط — يمسّ رخصتك'
                      : branchActive
                        ? 'مخالفة ضمن مهلة التصحيح ⏳ — المشغّل يعالجها'
                        : 'ملتزم ✓'}
                  </span>
                </div>

                <div className="px-[18px] py-3 border-t border-[#EFF4F0] bg-[#FBFDFB] flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[11px] text-ink-soft">
                    {cases[0]
                      ? `آخر حدث: ${formatDateTime(cases[0].detectedAt)}`
                      : 'لا أحداث مسجّلة بعد'}
                  </span>
                  <button
                    onClick={() => setShowStream((v) => !v)}
                    className="text-[12px] font-bold text-white bg-saudi rounded-lg px-3.5 py-2 hover:bg-saudi-deep"
                  >
                    {showStream ? 'إخفاء البث' : 'عرض التفاصيل والبث'}
                  </button>
                </div>

                {showStream && (
                  <div className="px-[18px] py-3.5 border-t border-[#EFF4F0] flex flex-col gap-3">
                    {cameras.length === 0 ? (
                      <div className="py-8 text-center text-ink-faint text-xs">
                        لا كاميرات مسجّلة على هذا الفرع
                      </div>
                    ) : (
                      <LiveStream
                        cameraKey={cameras[0].key}
                        title={cameras[0].nameAr}
                        height={240}
                        offline={!cameras[0].online}
                        deviceCode={branch.code}
                      />
                    )}
                    <Link
                      href={activeCases[0] ? `/case/${activeCases[0].id}` : '#'}
                      className={`text-center text-xs font-bold rounded-lg px-4 py-2.5 border ${
                        activeCases[0]
                          ? 'text-ink bg-white border-[#D5E0D8] hover:bg-[#F0F5F2]'
                          : 'text-ink-faint bg-[#F7FAF8] border-line pointer-events-none'
                      }`}
                    >
                      {activeCases[0] ? 'عرض ملف المخالفة القائمة' : 'لا مخالفة قائمة'}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── التقرير والأحداث ── */}
        <section className="grid gap-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))' }}>
          {/* تقريرك الأسبوعي */}
          <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(15,41,66,.06)]">
            <div className="px-[18px] py-3.5 border-b border-[#EAF0EC] bg-[#F7FAF8]">
              <h2 className="m-0 font-kufi font-bold text-[15px] text-ink">تقريرك الأسبوعي</h2>
            </div>

            {!latestReport ? (
              <div className="py-12 px-6 text-center text-ink-faint">
                <div className="text-sm">لم يصدر تقرير أسبوعي بعد</div>
                <div className="text-xs mt-1 leading-relaxed">
                  يصدر التقرير الموقّع تلقائيًا كل خميس ويظهر هنا للتحميل.
                </div>
              </div>
            ) : (
              <>
                <div className="px-[18px] py-4 flex gap-4 items-start">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <span className="font-kufi font-bold text-[13.5px] text-ink">
                      تقرير الامتثال الأسبوعي — {formatDate(latestReport.periodEnd)}
                    </span>
                    <p className="m-0 text-[12px] text-ink-soft leading-loose">
                      الفترة {formatDate(latestReport.periodStart)} — {formatDate(latestReport.periodEnd)}.
                      {latestReport.stats?.complianceScore !== undefined && (
                        <>
                          {' '}
                          مؤشر الامتثال{' '}
                          <b className="text-ink tnum">{latestReport.stats.complianceScore}%</b>.
                        </>
                      )}
                      {latestReport.stats?.casesEscalated !== undefined && (
                        <>
                          {' '}
                          التصعيدات:{' '}
                          <b className="text-ink tnum">{latestReport.stats.casesEscalated}</b>.
                        </>
                      )}
                    </p>
                  </div>
                  <div
                    className="flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 shrink-0"
                    style={{ background: '#FCF8EF', border: '1px solid #EFE0BE' }}
                  >
                    <span
                      className="w-7 h-7 rounded-full grid place-items-center text-[#FFF8E8] text-sm"
                      style={{ background: 'radial-gradient(circle at 35% 30%,#CBA95E,#8F6E2E)' }}
                    >
                      ✓
                    </span>
                    <span className="text-[10px] font-bold text-[#6B5320]">موقّع رقميًا</span>
                    <span className="font-mono text-[9px] text-[#8A7440]">{latestReport.algo}</span>
                  </div>
                </div>

                <div className="px-[18px] py-3 border-t border-[#EFF4F0] bg-[#FBFDFB] flex items-center gap-2.5 flex-wrap">
                  <a
                    href={`/api/reports/${latestReport.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => flash('جارٍ تجهيز ملف PDF الموقّع رقميًا…')}
                    className="text-[12.5px] font-bold text-white bg-saudi rounded-lg px-4 py-2.5 hover:bg-saudi-deep"
                  >
                    تحميل PDF موقّع 📄
                  </a>
                  <span className="font-mono text-[10px] text-ink-faint truncate" dir="ltr">
                    sha256 {latestReport.sha256.slice(0, 16)}…
                  </span>
                </div>

                {data.reports.length > 1 && (
                  <div className="px-[18px] py-2.5 border-t border-[#EFF4F0] flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-ink-soft">تقارير سابقة</span>
                    {data.reports.slice(1, 5).map((r) => (
                      <a
                        key={r.id}
                        href={`/api/reports/${r.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between text-[11.5px] text-ink-soft hover:text-saudi py-1 border-b border-[#EFF4F0] last:border-0"
                      >
                        <span className="tnum">
                          {formatDate(r.periodStart)} — {formatDate(r.periodEnd)}
                        </span>
                        <span className="font-bold">تحميل ↓</span>
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* آخر الأحداث الجوهرية */}
          <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(15,41,66,.06)]">
            <div className="px-[18px] py-3.5 border-b border-[#EAF0EC] bg-[#F7FAF8]">
              <h2 className="m-0 font-kufi font-bold text-[15px] text-ink">آخر الأحداث الجوهرية</h2>
            </div>
            <div className="flex flex-col">
              {timeline.length === 0 && (
                <div className="py-12 text-center text-ink-faint text-sm">لا أحداث جوهرية بعد</div>
              )}
              {timeline.map((e) => (
                <div
                  key={e.id}
                  className="flex gap-3 px-[18px] py-3 border-b border-[#EFF4F0] last:border-0 items-start"
                >
                  <span
                    className="w-7 h-7 rounded-full grid place-items-center text-[13px] shrink-0"
                    style={{ background: `${e.color}1a`, color: e.color }}
                  >
                    {e.icon}
                  </span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[12.5px] font-bold text-ink leading-snug">{e.title}</span>
                    <span className="text-[11px] text-ink-faint tnum">{e.sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── حماية رخصتك ── */}
        <section
          className="rounded-2xl px-6 py-5 flex items-center gap-8 flex-wrap border"
          style={{ background: 'linear-gradient(140deg,#0B3320,#165D3A)', borderColor: '#B8934A' }}
        >
          <span className="font-kufi font-extrabold text-base text-white">حماية رخصتك تعمل</span>
          <div className="flex items-center gap-6 flex-wrap">
            <Shield icon="📡" text="رصد مستمر 24/7" />
            <Shield icon="🔏" text="أدلة موقّعة رقميًا لا تقبل الطعن" />
            <Shield icon="⚡" text="تنبيه فوري قبل أي تصعيد يمس الرخصة" />
          </div>
        </section>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-6 z-[2000] bg-ink text-white text-[12.5px] font-semibold rounded-[10px] px-[18px] py-3 shadow-[0_8px_26px_rgba(15,41,66,.35)] animate-om-in">
          {toast}
        </div>
      )}
    </div>
  );
}

function Pill({ icon, text, danger }: { icon: string; text: string; danger?: boolean }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 border"
      style={{
        background: danger ? '#FBEAE7' : '#FFFFFF',
        borderColor: danger ? '#F0D9D5' : '#E3EBE5',
      }}
    >
      <span className="text-base">{icon}</span>
      <span
        className="text-[12px] font-bold whitespace-nowrap"
        style={{ color: danger ? '#CE4A3C' : '#0F2942' }}
      >
        {text}
      </span>
    </div>
  );
}

function Shield({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="flex items-center gap-2 text-[12px] font-semibold text-[#DDF2E4]">
      <span className="text-base">{icon}</span>
      {text}
    </span>
  );
}
