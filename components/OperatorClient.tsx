'use client';

// ── لوحة المنشأة (المشغّل) — منصة رصد الامتثال البلدي ──
// مطابقة للتصميم المعتمد design/operator.html.
// عقد التصحيح محفوظ حرفيًا: POST /api/operator/correct بـ {caseId, imageB64}
// مع احترام مسار الرفض (إعادة الكشف تُظهر أن المخالفة ما زالت قائمة).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LiveStream from './LiveStream';
import { formatDateTime, timeRemaining } from '@/lib/format';
import { ITEM_MAP } from '@/lib/catalog';
import { normalizeDistrict } from '@/lib/geo';

const CAMERA_ORDER = ['cam_processing', 'cam_reception', 'cam_waste'];
const CAMERA_CODE: Record<string, string> = {
  cam_processing: 'CAM1',
  cam_reception: 'CAM2',
  cam_waste: 'CAM3',
};

const GRACE_MS = 48 * 3600 * 1000;
const ACTIVE = ['new', 'notified', 'in_grace'];

interface CaseRow {
  id: string;
  refNo: string;
  itemCode: string;
  status: string;
  confidence: number;
  potentialFine: number;
  detectedAt: string;
  graceDeadline: string;
  correctedAt: string | null;
  escalatedAt: string | null;
  evidences: { id: string; kind: string; chainIndex: number; bytesPurged: boolean }[];
}

interface OperatorData {
  branch: {
    id: string;
    nameAr: string;
    districtAr: string;
    licenseNo: string;
    silentMode: boolean;
    score: number;
  } | null;
  cases: CaseRow[];
  notifications: { id: string; type: string; titleAr: string; bodyAr: string; at: string }[];
  cameras: { key: string; nameAr: string; online: boolean }[];
}

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  new: { label: 'جديدة', color: '#A96F14', bg: '#FBF3E3', border: '#EFE0BE' },
  notified: { label: 'ضمن المهلة ⏳', color: '#A96F14', bg: '#FBF3E3', border: '#EFE0BE' },
  in_grace: { label: 'ضمن المهلة ⏳', color: '#A96F14', bg: '#FBF3E3', border: '#EFE0BE' },
  corrected: { label: 'صُحّحت ✓', color: '#165D3A', bg: '#EFF6F1', border: '#D9E8DE' },
  escalated: { label: 'متصعّدة', color: '#CE4A3C', bg: '#FBEAE7', border: '#F0D9D5' },
};

const NOTE_AR: Record<string, string> = {
  new: 'ارفع لقطة التصحيح لإغلاقها فورًا',
  notified: 'ارفع لقطة التصحيح لإغلاقها فورًا',
  in_grace: 'ارفع لقطة التصحيح لإغلاقها فورًا',
  corrected: 'قُبل تصحيحك — أُغلقت دون غرامة',
  escalated: 'انتهت المهلة — أُحيلت للتصعيد',
};

export default function OperatorClient({ nameAr }: { nameAr: string }) {
  const router = useRouter();
  const [data, setData] = useState<OperatorData | null>(null);
  const [clock, setClock] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reject, setReject] = useState<string | null>(null);
  const [expandBell, setExpandBell] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    const res = await fetch('/api/operator', { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
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
    toastT.current = setTimeout(() => setToast(null), 4000);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  }

  const branch = data?.branch ?? null;
  const cases = useMemo(() => data?.cases ?? [], [data]);
  const active = useMemo(() => cases.filter((c) => ACTIVE.includes(c.status)), [cases]);
  const current = active[0] ?? null;

  const correctedThisMonth = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return cases.filter(
      (c) => c.status === 'corrected' && c.correctedAt && new Date(c.correctedAt) >= start,
    ).length;
  }, [cases]);

  /** أيام بلا تصعيد — منذ آخر حالة متصعّدة (null = لا تصعيد قط) */
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

  const onlineCount = cameras.filter((c) => c.online).length;

  // ── رفع لقطة التصحيح — نفس العقد: {caseId, imageB64} ──
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !current) return;

    setBusy(true);
    setReject(null);
    try {
      const imageB64 = await new Promise<string>((resolve, fail) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
        r.onerror = () => fail(new Error('read'));
        r.readAsDataURL(file);
      });

      const res = await fetch('/api/operator/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: current.id, imageB64 }),
      });
      const j = await res.json();

      if (!res.ok) {
        flash(j.error || 'تعذّر رفع اللقطة');
        return;
      }
      if (j.closed) {
        flash('قُبل تصحيحك ✓ — أُغلقت الحالة دون غرامة');
      } else {
        // إعادة الكشف تُظهر أن المخالفة ما زالت قائمة
        setReject(j.reason || 'ما زالت المخالفة قائمة — صحّح الوضع والتقط لقطة جديدة');
      }
      await load();
    } catch {
      flash('تعذّر رفع اللقطة — حاول مجددًا');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div dir="rtl" className="min-h-screen bg-canvas grid place-items-center">
        <div className="text-ink-faint">جارٍ التحميل…</div>
      </div>
    );
  }

  const item = current ? ITEM_MAP[current.itemCode] : null;

  let cdPct = 0;
  if (current) {
    const left = new Date(current.graceDeadline).getTime() - Date.now();
    cdPct = Math.max(0, Math.min(100, (left / GRACE_MS) * 100));
  }

  const score = branch?.score ?? 0;
  const scoreColor = score >= 90 ? '#165D3A' : score >= 70 ? '#E0982C' : '#CE4A3C';
  const scoreDash = (score / 100) * 251.3;

  return (
    <div dir="rtl" className="min-h-screen bg-canvas flex flex-col">
      {/* ── الشريط العلوي ── */}
      <header
        className="text-white border-b-[3px] border-gold"
        style={{ background: 'linear-gradient(135deg,#0B3320 0%,#165D3A 70%,#1B6B44 100%)' }}
      >
        <div className="max-w-[1560px] mx-auto px-6 py-3 flex items-center justify-between gap-5 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-[46px] h-[46px] rounded-full border-2 border-gold grid place-items-center shrink-0"
              style={{ background: 'radial-gradient(circle at 35% 30%,#1E7248,#0B3320)' }}
            >
              <span className="font-kufi font-extrabold text-[11.5px] text-sand">رصد</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <h1 className="m-0 font-kufi font-bold text-[17.5px] text-white">
                منصة رصد الامتثال البلدي <span className="text-gold font-semibold">·</span> لوحة المنشأة
              </h1>
              <span className="text-[11px] text-[#C9DCD0]">
                غرفة تحكم المشغّل — إدارة الامتثال الذاتي
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {branch && (
              <div className="flex flex-col gap-0.5 text-left border-l border-white/20 pl-4">
                <span className="text-[12.5px] font-bold text-[#E8F1EA]">
                  {branch.nameAr} — {normalizeDistrict(branch.districtAr)}
                </span>
                <span className="text-[10.5px] text-[#AFC8B7]">
                  رخصة بلدية <span className="font-mono">{branch.licenseNo}</span>
                </span>
              </div>
            )}
            <div className="flex flex-col gap-0.5 text-left border-l border-white/20 pl-4">
              <span className="text-[11.5px] font-semibold text-[#E8F1EA]">{nameAr}</span>
              <span className="font-mono text-[15px] font-semibold tracking-wider text-white tnum">
                {clock || '—'}
              </span>
            </div>

            <button
              onClick={() => setExpandBell((v) => !v)}
              title="الإشعارات"
              className="relative w-[42px] h-[42px] rounded-full bg-white/10 border border-white/25 text-white text-[17px] grid place-items-center hover:bg-white/20"
            >
              🔔
              {data.notifications.length > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] rounded-full bg-red border-2 border-[#10402A] text-white text-[10px] font-bold grid place-items-center px-1 box-border tnum">
                  {data.notifications.length}
                </span>
              )}
            </button>

            <button
              onClick={logout}
              className="text-white/70 hover:text-white text-xs border border-white/25 rounded-lg px-3 py-1.5"
            >
              خروج
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1560px] mx-auto w-full box-border px-6 py-[18px] flex flex-col gap-4 flex-1">
        {/* ── حالة الفرع ── */}
        <section
          className="grid gap-3.5"
          style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}
        >
          <div
            className="rounded-xl px-[18px] py-3.5 flex items-center gap-3.5 border-[1.5px]"
            style={{
              background: 'linear-gradient(160deg,#FFFFFF,#FDF9F0)',
              borderColor: scoreColor,
              boxShadow: '0 2px 10px rgba(224,152,44,.14)',
            }}
          >
            <div className="relative w-[78px] h-[78px] shrink-0">
              <svg width="78" height="78" viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="46" cy="46" r="40" fill="none" stroke="#F0E5CF" strokeWidth="9" />
                <circle
                  cx="46"
                  cy="46"
                  r="40"
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={`${scoreDash} 251.3`}
                />
              </svg>
              <span
                className="absolute inset-0 grid place-items-center font-kufi font-extrabold text-base tnum"
                style={{ color: scoreColor }}
              >
                {score}%
              </span>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span
                className="text-[11.5px] font-bold whitespace-nowrap"
                style={{ color: scoreColor }}
              >
                مؤشر امتثال منشأتك
              </span>
              <span className="font-kufi font-extrabold text-2xl text-ink leading-none tnum">
                {score}%
              </span>
              <span className="text-[10.5px] text-ink-faint">درجة المنشأة الحالية</span>
            </div>
          </div>

          <Kpi
            label="حالات تحتاج إجراءك الآن"
            value={String(active.length)}
            hint={active.length > 0 ? 'مهلة التصحيح تعمل — ابدأ الآن' : 'لا إجراء مطلوب ✓'}
            valueColor={active.length > 0 ? '#E0982C' : '#165D3A'}
            hintColor={active.length > 0 ? '#A96F14' : '#8A99A5'}
            warn={active.length > 0}
          />
          <Kpi
            label="صُحّح هذا الشهر"
            value={`${correctedThisMonth} ✓`}
            hint="أُغلقت دون غرامة"
            valueColor="#165D3A"
          />
          <Kpi
            label="أيام بلا مخالفة متصعّدة"
            value={daysClean === null ? '—' : `${daysClean} 🛡`}
            hint={daysClean === null ? 'لا تصعيد مسجّل على منشأتك' : 'منذ آخر تصعيد'}
          />
        </section>

        {/* ── البث المباشر ومركز الإجراء ── */}
        <section className="grid gap-4 items-start" style={{ gridTemplateColumns: '372px minmax(0,1fr)' }}>
          {/* مركز الإجراء */}
          <aside className="flex flex-col gap-3.5">
            {current && item ? (
              <div className="bg-white border-2 border-amber rounded-[13px] overflow-hidden shadow-[0_3px_16px_rgba(224,152,44,.18)]">
                <div
                  className="px-4 py-[11px] flex items-center gap-2.5 border-b border-[#EFE0BE]"
                  style={{ background: 'linear-gradient(180deg,#FBF3E3,#F8EDD6)' }}
                >
                  <span
                    className="w-[9px] h-[9px] rounded-full bg-amber"
                    style={{ animation: 'om-blink 1.3s infinite' }}
                  />
                  <h2 className="m-0 font-kufi font-bold text-sm text-[#A96F14]">
                    مخالفة نشطة — مطلوب تصحيحك
                  </h2>
                  {active.length > 1 && (
                    <span className="mr-auto text-[10.5px] font-bold text-[#A96F14] tnum">
                      +{active.length - 1} أخرى
                    </span>
                  )}
                </div>

                <div className="px-4 py-3.5 flex flex-col gap-3">
                  <div className="flex gap-3 items-start">
                    {current.evidences[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/evidence/${current.evidences[0].id}`}
                        alt="إطار الدليل"
                        className="w-[98px] h-[62px] object-cover rounded-md border border-[#33424F] bg-[#1C2733] shrink-0"
                      />
                    ) : (
                      <div className="w-[98px] h-[62px] rounded-md border border-[#33424F] bg-[#1C2733] shrink-0 grid place-items-center text-[#6E8496] text-[9px]">
                        لا دليل
                      </div>
                    )}
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-mono text-[11px] font-bold text-ink bg-[#F0F5F2] rounded px-[7px] py-0.5 self-start">
                        {current.itemCode}
                      </span>
                      <span className="text-[13px] font-bold text-ink leading-snug">{item.titleAr}</span>
                      <span className="text-[11px] text-ink-soft tnum">
                        رُصدت {formatDateTime(current.detectedAt)}
                      </span>
                    </div>
                  </div>

                  <GraceBox deadline={current.graceDeadline} pct={cdPct} />

                  <p className="m-0 text-xs text-ink-muted leading-loose bg-[#EFF6F1] border border-[#D9E8DE] rounded-[9px] px-3 py-2.5">
                    صحّح الآن وتجنّب غرامة{' '}
                    <b className="text-ink tnum">{current.potentialFine.toLocaleString('en-US')} ريال</b>{' '}
                    — التصحيح خلال المهلة يغلق الحالة تلقائيًا.
                  </p>

                  {reject && (
                    <div className="text-[11.5px] text-red bg-[#FBEAE7] border border-[#F0D9D5] rounded-[9px] px-3 py-2.5 leading-relaxed">
                      {reject}
                    </div>
                  )}

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={onFile}
                    className="hidden"
                  />
                  <button
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    className="font-kufi text-sm font-bold rounded-[10px] px-[18px] py-[13px] cursor-pointer disabled:opacity-60"
                    style={{
                      color: '#2B2008',
                      background: 'linear-gradient(180deg,#D9B565,#B8934A)',
                      border: '1px solid #8F6E2E',
                      boxShadow: '0 3px 12px rgba(184,147,74,.35)',
                    }}
                  >
                    {busy ? 'جارٍ التحقق من اللقطة…' : '📸 رفع لقطة التصحيح'}
                  </button>

                  <Link
                    href={`/case/${current.id}`}
                    className="text-center text-[12.5px] font-bold text-ink bg-white border border-[#D5E0D8] rounded-[10px] px-[18px] py-[11px] hover:bg-[#F0F5F2]"
                  >
                    عرض ملف الحالة والأدلة
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-line rounded-xl px-4 py-10 text-center shadow-[0_1px_4px_rgba(15,41,66,.06)]">
                <div className="text-2xl mb-2">✓</div>
                <div className="text-sm font-bold text-saudi">لا مخالفات نشطة</div>
                <div className="text-[11px] text-ink-faint mt-1 leading-relaxed">
                  منشأتك ملتزمة — لا إجراء مطلوب منك حاليًا.
                </div>
              </div>
            )}

            {/* إشعاراتك */}
            <div className="bg-white border border-line rounded-xl overflow-hidden shadow-[0_1px_4px_rgba(15,41,66,.06)]">
              <div className="px-[15px] py-2.5 border-b border-[#EAF0EC] bg-[#F7FAF8] flex items-center justify-between">
                <h2 className="m-0 font-kufi font-bold text-[13px] text-ink">إشعاراتك</h2>
                {branch?.silentMode && (
                  <span className="text-[10px] font-bold text-[#A96F14] bg-[#FBF3E3] border border-[#EFE0BE] rounded-full px-2 py-0.5">
                    الوضع الصامت
                  </span>
                )}
              </div>
              <div className="flex flex-col">
                {data.notifications.length === 0 && (
                  <div className="px-[15px] py-6 text-center text-[11.5px] text-ink-faint leading-relaxed">
                    {branch?.silentMode
                      ? 'الوضع الصامت مفعّل — لا تصلك إشعارات حتى تُعتمد المنظومة.'
                      : 'لا إشعارات جديدة.'}
                  </div>
                )}
                {data.notifications.slice(0, expandBell ? 30 : 5).map((n) => (
                  <div
                    key={n.id}
                    className="flex gap-2.5 px-[15px] py-2.5 border-b border-[#EFF4F0] last:border-0 items-start hover:bg-[#F7FAF8]"
                  >
                    <span
                      className="mt-[5px] w-2 h-2 shrink-0 rounded-full"
                      style={{
                        background:
                          n.type === 'case_closed'
                            ? '#1B7A4A'
                            : n.type === 'escalation'
                              ? '#CE4A3C'
                              : n.type === 'case_opened'
                                ? '#E0982C'
                                : '#8A99A5',
                      }}
                    />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-bold text-ink leading-snug">{n.titleAr}</span>
                      <span className="text-[10.5px] text-ink-faint tnum">{formatDateTime(n.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* بث فرعك المباشر */}
          <section className="flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 font-kufi font-bold text-[15.5px] text-ink">بث فرعك المباشر</h2>
              <span
                className="flex items-center gap-[7px] text-[11.5px] font-bold"
                style={{ color: onlineCount > 0 ? '#165D3A' : '#CE4A3C' }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: onlineCount > 0 ? '#1B7A4A' : '#CE4A3C',
                    animation: 'om-blink 1.6s infinite',
                  }}
                />
                {onlineCount} من {cameras.length} كاميرات متصلة
              </span>
            </div>

            {cameras.length === 0 ? (
              <div className="bg-white border border-line rounded-xl py-16 text-center text-ink-faint text-sm">
                لا كاميرات مسجّلة على فرعك بعد
              </div>
            ) : (
              <>
                <LiveStream
                  cameraKey={cameras[0].key}
                  title={cameras[0].nameAr}
                  height={350}
                  offline={!cameras[0].online}
                  deviceCode={CAMERA_CODE[cameras[0].key] ?? cameras[0].key}
                  primary
                />
                {cameras.length > 1 && (
                  <div className="grid grid-cols-2 gap-3">
                    {cameras.slice(1).map((c) => (
                      <LiveStream
                        key={c.key}
                        cameraKey={c.key}
                        title={c.nameAr}
                        height={200}
                        offline={!c.online}
                        deviceCode={CAMERA_CODE[c.key] ?? c.key}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </section>

        {/* ── سجل منشأتك ── */}
        <section className="bg-white border border-line rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(15,41,66,.06)]">
          <div className="px-[18px] py-3 border-b border-[#EAF0EC] flex items-center justify-between flex-wrap gap-2.5">
            <h2 className="m-0 font-kufi font-bold text-[15px] text-ink">سجل منشأتك</h2>
            <span className="text-[11.5px] text-ink-faint">
              {cases.length === 0
                ? 'لا أحداث بعد'
                : `${cases.length} حدث · ${cases.filter((c) => c.status === 'corrected').length} صُحّحت`}
            </span>
          </div>

          {cases.length === 0 ? (
            <div className="py-14 text-center text-ink-faint">
              <div className="text-sm">لا سجل مخالفات بعد</div>
              <div className="text-xs mt-1">ستظهر الأحداث هنا فور رصدها.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-canvas">
                    <Th className="pr-[18px]">التاريخ</Th>
                    <Th>البند</Th>
                    <Th>الدليل</Th>
                    <Th>الحالة</Th>
                    <Th className="pl-[18px]">ملاحظة</Th>
                  </tr>
                </thead>
                <tbody>
                  {cases.slice(0, 12).map((c) => {
                    const b = STATUS_BADGE[c.status] ?? STATUS_BADGE.new;
                    const ev = c.evidences.find((e) => !e.bytesPurged);
                    return (
                      <tr key={c.id} className="border-t border-[#EFF4F0] hover:bg-[#F7FAF8]">
                        <td className="py-2.5 pr-[18px] pl-3 text-[11.5px] text-ink-soft whitespace-nowrap tnum">
                          <Link href={`/case/${c.id}`} className="hover:underline">
                            {formatDateTime(c.detectedAt)}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-ink-muted">
                          <span className="font-mono text-[10.5px] font-bold text-ink bg-[#F0F5F2] rounded px-[7px] py-0.5 ml-[7px]">
                            {c.itemCode}
                          </span>
                          {ITEM_MAP[c.itemCode]?.titleAr ?? c.itemCode}
                        </td>
                        <td className="py-[7px] px-3">
                          {ev ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/evidence/${ev.id}`}
                              alt="دليل"
                              className="w-16 h-[38px] object-cover rounded bg-[#1C2733]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-16 h-[38px] rounded bg-[#EEF2F0] grid place-items-center text-[8px] text-ink-faint">
                              —
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-[11px] py-1 border"
                            style={{ color: b.color, background: b.bg, borderColor: b.border }}
                          >
                            {b.label}
                          </span>
                        </td>
                        <td className="py-2.5 pl-[18px] pr-3 text-[11.5px] text-ink-soft">
                          {NOTE_AR[c.status] ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* ── الشريط السفلي ── */}
      <footer className="bg-white border-t border-line mt-auto">
        <div className="max-w-[1560px] mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
          <div
            className="w-8 h-8 rounded-full border-[1.5px] border-gold grid place-items-center shrink-0"
            style={{ background: 'radial-gradient(circle at 35% 30%,#1E7248,#0B3320)' }}
          >
            <span className="font-kufi font-extrabold text-[8px] text-sand">رصد</span>
          </div>
          <span className="text-[11.5px] text-ink-soft">
            منشأتك ضمن المنظومة الوطنية لرصد الامتثال · جميع الأدلة موقّعة رقميًا
          </span>
        </div>
      </footer>

      {toast && (
        <div className="fixed bottom-6 left-6 z-[2000] bg-ink text-white text-[12.5px] font-semibold rounded-[10px] px-[18px] py-3 shadow-[0_8px_26px_rgba(15,41,66,.35)] animate-om-in">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── صندوق المهلة (عدّاد حي، آمن للترطيب) ──
function GraceBox({ deadline, pct }: { deadline: string; pct: number }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const r = now ? timeRemaining(deadline, now) : null;

  return (
    <div className="bg-[#FBF3E3] border border-[#EFE0BE] rounded-[10px] px-3.5 py-3 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="text-[11.5px] font-bold text-[#8A6A1F]">متبقٍ للتصحيح ⏳</span>
        <span className="countdown font-mono text-2xl font-bold text-[#A96F14]">
          {r ? r.label : '—'}
        </span>
      </div>
      <span className="h-[7px] rounded-lg bg-[#F0E5CF] overflow-hidden block">
        <span
          className="block h-full rounded-lg"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg,#E0982C,#C9820F)',
            transition: 'width 1s linear',
          }}
        />
      </span>
      <span className="text-[10.5px] text-[#8A6A1F]">من أصل مهلة 48 ساعة</span>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  valueColor = '#0F2942',
  hintColor = '#8A99A5',
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
  hintColor?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl px-[18px] py-4 flex flex-col gap-1.5 shadow-[0_1px_3px_rgba(15,41,66,.05)] border ${
        warn ? 'border-[#EFE0BE]' : 'border-line'
      }`}
    >
      <span className="text-[11.5px] font-semibold text-ink-soft">{label}</span>
      <span className="font-kufi font-extrabold text-[30px] leading-none tnum" style={{ color: valueColor }}>
        {value}
      </span>
      {hint && (
        <span className="text-[11px] font-semibold" style={{ color: hintColor }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`py-2.5 px-3 text-[11px] font-bold text-ink-soft whitespace-nowrap text-right ${className}`}
    >
      {children}
    </th>
  );
}
