'use client';

// ── لوحة الأمانة — منصة رصد الامتثال البلدي ──
// مطابقة للتصميم المعتمد design/ministry.html.
// البيانات الحيّة من /api/ministry (Neon). الخريطة تعرض المنشآت الحقيقية
// إلى جانب منشآت العرض (demo) لتغطية النطاق البلدي بصريًا.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ITEM_MAP } from '@/lib/catalog';
import { formatDateTime, shortHash } from '@/lib/format';
import {
  COMPLIANCE_COLOR,
  DEMO_FACILITIES,
  type Compliance,
  type Facility,
} from '@/lib/facilities';
import { DISTRICT_NAMES, facilityLatLng, normalizeDistrict } from '@/lib/geo';

// Leaflet يحتاج window — لا تصيير على الخادم
const MinistryMap = dynamicImport(() => import('./ministry/MinistryMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[560px] w-full grid place-items-center bg-[#E9EEEA] text-ink-faint text-sm">
      جارٍ تحميل الخريطة…
    </div>
  ),
});

interface Branch {
  id: string;
  code: string;
  nameAr: string;
  districtAr: string;
  licenseNo: string;
  score: number;
}
interface CaseRow {
  id: string;
  refNo: string;
  itemCode: string;
  status: string;
  confidence: number;
  potentialFine: number;
  detectedAt: string;
  branchId: string;
  branch: { nameAr: string; districtAr: string };
}
interface BranchStat {
  branchId: string;
  activeCases: number;
  escalatedCases: number;
  compliance: Compliance;
}
interface MinistryData {
  branches: Branch[];
  cases: CaseRow[];
  stats: { total: number; active: number; corrected: number; escalated: number };
  branchStats: BranchStat[];
  chainRoot: { rootHash: string; index: number };
  digests: { id: string; date: string; sha256: string; algo: string }[];
}

const CASE_STATUS: Record<
  string,
  { label: string; color: string; bg: string; border: string; pulse?: boolean }
> = {
  new: { label: 'جديدة', color: '#0F2942', bg: '#E8EEF5', border: '#D5DFEA' },
  notified: { label: 'مُبلّغة', color: '#0F2942', bg: '#E8EEF5', border: '#D5DFEA' },
  in_grace: { label: 'ضمن المهلة', color: '#A96F14', bg: '#FBF3E3', border: '#EFE0BE' },
  corrected: { label: 'مُصحّحة', color: '#165D3A', bg: '#E7F2EB', border: '#CBE3D5' },
  escalated: { label: 'متصعّدة', color: '#CE4A3C', bg: '#FBEAE7', border: '#F0D9D5', pulse: true },
};

interface FeedItem {
  id: string;
  tag: string;
  time: string;
  code: string;
  desc: string;
  place: string;
  meta: string;
  color: string;
}

export default function MinistryClient({ nameAr, role }: { nameAr: string; role: string }) {
  const router = useRouter();
  const [data, setData] = useState<MinistryData | null>(null);
  const [clock, setClock] = useState('');
  const [district, setDistrict] = useState('الكل');
  const [status, setStatus] = useState('الكل');
  const [query, setQuery] = useState('');
  const [verifyMsg, setVerifyMsg] = useState('');
  const [toast, setToast] = useState('');
  const toastT = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    const res = await fetch('/api/ministry', { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  // الساعة تبدأ فارغة ثم تُملأ بعد التركيب — يمنع اختلاف الخادم/المتصفح
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

  function showToast(msg: string) {
    clearTimeout(toastT.current);
    setToast(msg);
    toastT.current = setTimeout(() => setToast(''), 2800);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  }

  async function verifyChain() {
    setVerifyMsg('جارٍ التحقق من سلسلة الأدلة…');
    try {
      const res = await fetch('/api/chain/verify', { cache: 'no-store' });
      const json = await res.json();
      const records: { ok: boolean }[] = json.records ?? [];
      const bad = records.filter((r) => !r.ok).length;
      setVerifyMsg(
        bad === 0
          ? `السلسلة سليمة ✓ — تم التحقق من ${records.length.toLocaleString('en-US')} سجل توقيع`
          : `تحذير: ${bad} سجل غير مطابق من أصل ${records.length}`,
      );
    } catch {
      setVerifyMsg('تعذّر الوصول إلى خدمة التحقق');
    }
  }

  // ── المنشآت: الحقيقية من Neon + منشآت العرض ──
  const facilities: Facility[] = useMemo(() => {
    const real: Facility[] = (data?.branches ?? []).map((b) => {
      const stat = data?.branchStats?.find((s) => s.branchId === b.id);
      const [lat, lng] = facilityLatLng(b.districtAr, b.licenseNo || b.code);
      return {
        id: b.id,
        nameAr: b.nameAr,
        districtAr: normalizeDistrict(b.districtAr),
        licenseNo: b.licenseNo,
        status: stat?.compliance ?? 'ok',
        lat,
        lng,
        demo: false,
        activeCases: stat?.activeCases ?? 0,
        escalatedCases: stat?.escalatedCases ?? 0,
      };
    });

    const demo: Facility[] = DEMO_FACILITIES.map((f) => {
      const [lat, lng] = facilityLatLng(f.districtAr, f.licenseNo);
      return { id: `demo-${f.licenseNo}`, ...f, lat, lng, demo: true };
    });

    return [...real, ...demo];
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<Compliance, number> = { ok: 0, warn: 0, alert: 0 };
    facilities.forEach((f) => c[f.status]++);
    return c;
  }, [facilities]);

  const realCount = data?.branches.length ?? 0;

  // ── بث الرصد الحي — مشتق من الحالات الحقيقية ──
  const feed: FeedItem[] = useMemo(() => {
    if (!data) return [];
    return data.cases.slice(0, 10).map((c) => {
      const s = CASE_STATUS[c.status] ?? CASE_STATUS.new;
      const isAlert = c.status === 'escalated';
      const isOk = c.status === 'corrected';
      return {
        id: c.id,
        tag: isOk ? 'تصحيح مؤكد' : isAlert ? 'تصعيد' : 'رُصد',
        time: new Date(c.detectedAt).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        code: c.itemCode,
        desc: ITEM_MAP[c.itemCode]?.titleAr ?? c.itemCode,
        place: `${c.branch.nameAr} · ${normalizeDistrict(c.branch.districtAr)}`,
        meta: `ثقة ${Math.round(c.confidence * 100)}% · ${s.label}`,
        color: isOk ? COMPLIANCE_COLOR.ok : isAlert ? COMPLIANCE_COLOR.alert : COMPLIANCE_COLOR.warn,
      };
    });
  }, [data]);

  const activeCases = useMemo(
    () =>
      (data?.cases ?? []).filter((c) =>
        ['new', 'notified', 'in_grace', 'escalated'].includes(c.status),
      ),
    [data],
  );

  const correctedPct = useMemo(() => {
    if (!data || data.stats.total === 0) return null;
    return Math.round((data.stats.corrected / data.stats.total) * 100);
  }, [data]);

  // مؤشر الامتثال العام = متوسط درجات المنشآت المتصلة فعليًا
  const complianceScore = useMemo(() => {
    const bs = data?.branches ?? [];
    if (bs.length === 0) return null;
    return bs.reduce((a, b) => a + b.score, 0) / bs.length;
  }, [data]);

  const dash = ((complianceScore ?? 0) / 100) * 251.3;

  return (
    <div dir="rtl" className="min-h-screen bg-canvas flex flex-col">
      {/* ── الشريط العلوي ── */}
      <header
        className="text-white border-b-[3px] border-gold"
        style={{ background: 'linear-gradient(135deg,#0B3320 0%,#165D3A 70%,#1B6B44 100%)' }}
      >
        <div className="max-w-[1560px] mx-auto px-6 py-4 flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-4">
            <div
              className="w-[58px] h-[58px] rounded-full border-2 border-gold grid place-items-center shrink-0"
              style={{
                background: 'radial-gradient(circle at 35% 30%,#1E7248,#0B3320)',
                boxShadow: '0 2px 10px rgba(0,0,0,.35)',
              }}
            >
              <div className="w-11 h-11 rounded-full border border-gold/65 grid place-items-center">
                <span className="font-kufi font-extrabold text-[13px] text-sand tracking-wide">
                  رصد
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-[3px]">
              <h1 className="m-0 font-kufi font-extrabold text-[23px] leading-tight text-white">
                منصة رصد الامتثال البلدي
              </h1>
              <div className="text-[12.5px] text-[#C9DCD0] font-medium">
                المركز الوطني لرصد الامتثال — قطاع المغاسل · أمانة منطقة الرياض
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex flex-col gap-[2px] text-left border-l border-white/20 pl-5">
              <span className="text-[12.5px] font-semibold text-[#E8F1EA]">{nameAr}</span>
              <span className="text-[11.5px] text-[#AFC8B7]">
                {role === 'ministry' ? 'الأمانة — وصول قراءة' : 'غرفة العمليات'}
              </span>
            </div>
            <div className="font-mono text-[21px] font-semibold tracking-wider text-white min-w-[96px] text-center tnum">
              {clock || '—'}
            </div>
            <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3.5 py-[7px]">
              <span
                className="w-[9px] h-[9px] rounded-full bg-[#5EE39A]"
                style={{ boxShadow: '0 0 8px #5EE39A', animation: 'om-blink 1.6s infinite' }}
              />
              <span className="text-[12.5px] font-semibold text-[#DDF2E4]">المنظومة تعمل</span>
            </div>
            <button
              onClick={logout}
              className="no-print text-white/70 hover:text-white text-xs border border-white/25 rounded-lg px-3 py-1.5"
            >
              خروج
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1560px] mx-auto w-full box-border px-6 pt-5 pb-2 flex flex-col gap-[18px] flex-1">
        {/* ── المؤشرات الوطنية ── */}
        <section
          className="grid gap-3.5"
          style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))' }}
        >
          <Kpi
            label="المنشآت المتصلة"
            value={String(realCount)}
            suffix={` / ${facilities.length}`}
            hint="منشأة مرخّصة ضمن النطاق"
          />
          <Kpi
            label="إجمالي الحالات المسجّلة"
            value={data ? data.stats.total.toLocaleString('en-US') : '—'}
            hint="تحديث لحظي كل 15 ثانية"
          />
          <Kpi
            label="المخالفات النشطة"
            value={data ? String(data.stats.active) : '—'}
            hint={data ? `منها ${data.stats.escalated} قيد التصعيد` : ''}
            valueColor="#CE4A3C"
            hintColor="#CE4A3C"
            danger
          />
          <Kpi
            label="صُحّح قبل التصعيد"
            value={correctedPct === null ? '—' : `${correctedPct}%`}
            hint="من إجمالي الحالات المسجّلة"
            valueColor="#165D3A"
          />
          <Kpi
            label="سجلات سلسلة الأدلة"
            value={data ? (data.chainRoot.index + 1).toLocaleString('en-US') : '—'}
            hint="سجل موقّع Ed25519"
          />

          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3 border-[1.5px] border-saudi"
            style={{
              background: 'linear-gradient(160deg,#FFFFFF,#F2F8F4)',
              boxShadow: '0 2px 10px rgba(22,93,58,.14)',
            }}
          >
            <div className="relative w-[76px] h-[76px] shrink-0">
              <svg width="76" height="76" viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="46" cy="46" r="40" fill="none" stroke="#DCE9E0" strokeWidth="9" />
                <circle
                  cx="46"
                  cy="46"
                  r="40"
                  fill="none"
                  stroke="#165D3A"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} 251.3`}
                />
              </svg>
              <span className="absolute inset-0 grid place-items-center font-kufi font-extrabold text-[15px] text-saudi tnum">
                {complianceScore === null ? '—' : `${complianceScore.toFixed(1)}%`}
              </span>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="text-[11.5px] font-bold text-saudi whitespace-nowrap">
                مؤشر الامتثال العام
              </span>
              <span className="font-kufi font-extrabold text-2xl text-saudi leading-none tnum">
                {complianceScore === null ? '—' : `${complianceScore.toFixed(1)}%`}
              </span>
              <span className="text-[10.5px] text-[#4E7A61]">متوسط درجات المنشآت المتصلة</span>
            </div>
          </div>
        </section>

        {/* ── الخريطة والبث الحي ── */}
        <section
          className="grid gap-[18px] items-stretch"
          style={{ gridTemplateColumns: 'minmax(0,1fr) 356px' }}
        >
          <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(15,41,66,.06)] flex flex-col">
            <div className="px-[18px] py-3.5 border-b border-[#EAF0EC] flex items-center justify-between gap-3.5 flex-wrap">
              <h2 className="m-0 font-kufi font-bold text-[15.5px] text-ink">
                الخريطة الوطنية للرصد الحي — مدينة الرياض
              </h2>
              <div className="no-print flex items-center gap-2.5 flex-wrap">
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  aria-label="تصفية بالحي"
                  className="text-xs font-semibold text-ink bg-white border border-[#D5E0D8] rounded-lg px-2.5 py-[7px] cursor-pointer outline-none"
                >
                  <option value="الكل">كل الأحياء</option>
                  {DISTRICT_NAMES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  aria-label="تصفية بحالة الامتثال"
                  className="text-xs font-semibold text-ink bg-white border border-[#D5E0D8] rounded-lg px-2.5 py-[7px] cursor-pointer outline-none"
                >
                  <option value="الكل">كل الحالات</option>
                  <option value="ملتزمة">ملتزمة</option>
                  <option value="ضمن مهلة التصحيح">ضمن مهلة التصحيح</option>
                  <option value="تصعيد نشط">تصعيد نشط</option>
                </select>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="بحث برقم الرخصة"
                  placeholder="بحث برقم الرخصة 🔍"
                  className="text-xs text-ink bg-[#F7FAF8] border border-[#D5E0D8] rounded-lg px-3 py-[7px] w-[170px] outline-none focus:border-saudi focus:bg-white"
                />
              </div>
            </div>

            <MinistryMap facilities={facilities} district={district} status={status} query={query} />

            <div className="px-[18px] py-2.5 border-t border-[#EAF0EC] flex items-center justify-between gap-3 flex-wrap bg-[#FBFDFB]">
              <div className="flex items-center gap-[18px] flex-wrap">
                <Legend color={COMPLIANCE_COLOR.ok} label={`ملتزمة (${counts.ok})`} />
                <Legend color={COMPLIANCE_COLOR.warn} label={`ضمن مهلة التصحيح (${counts.warn})`} />
                <Legend color={COMPLIANCE_COLOR.alert} label={`تصعيد نشط (${counts.alert})`} blink />
              </div>
              <span className="text-[11px] text-ink-faint">
                {facilities.length} منشأة معروضة · {realCount} متصلة فعليًا
              </span>
            </div>
          </div>

          {/* ── بث الرصد الوطني الحي ── */}
          <aside className="bg-white border border-line rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(15,41,66,.06)] flex flex-col">
            <div
              className="px-4 py-3.5 border-b border-[#EAF0EC] flex items-center justify-between"
              style={{ background: 'linear-gradient(180deg,#F7FAF8,#fff)' }}
            >
              <h2 className="m-0 font-kufi font-bold text-[14.5px] text-ink">بث الرصد الوطني الحي</h2>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-red bg-[#FBEAE7] rounded-full px-2.5 py-1">
                <span
                  className="w-[7px] h-[7px] rounded-full bg-red"
                  style={{ animation: 'om-blink 1.2s infinite' }}
                />
                مباشر
              </span>
            </div>
            <div className="om-scroll flex-1 overflow-y-auto max-h-[588px]">
              {feed.length === 0 && (
                <div className="p-8 text-center text-ink-faint text-sm leading-relaxed">
                  لا رصدات مسجّلة بعد.
                  <br />
                  <span className="text-xs">سيظهر البث فور ورود أول حدث من أجهزة الحافة.</span>
                </div>
              )}
              {feed.map((ev) => (
                <div
                  key={ev.id}
                  className="flex gap-[11px] px-4 py-3 border-b border-[#EFF4F0] hover:bg-[#F7FAF8] animate-om-in"
                >
                  <span
                    className="mt-[5px] w-[9px] h-[9px] shrink-0 rounded-full"
                    style={{ background: ev.color, boxShadow: `0 0 0 3px ${ev.color}2b` }}
                  />
                  <div className="flex flex-col gap-[3px] min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[10.5px] font-bold" style={{ color: ev.color }}>
                        {ev.tag}
                      </span>
                      <span className="font-mono text-[10.5px] text-ink-faint tnum">{ev.time}</span>
                      <span className="font-mono text-[10px] font-semibold text-ink-muted bg-[#F0F5F2] rounded px-1.5 py-px">
                        {ev.code}
                      </span>
                    </div>
                    <span className="text-[12.5px] font-bold text-ink leading-snug">{ev.desc}</span>
                    <span className="text-[11px] text-ink-soft leading-relaxed">
                      {ev.place} · {ev.meta}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>

        {/* ── جدول المخالفات النشطة ── */}
        <section className="bg-white border border-line rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(15,41,66,.06)]">
          <div className="px-[18px] py-3.5 border-b border-[#EAF0EC] flex items-center justify-between flex-wrap gap-2.5">
            <h2 className="m-0 font-kufi font-bold text-[15.5px] text-ink">المخالفات النشطة</h2>
            <span className="text-[11.5px] text-ink-faint">
              {activeCases.length} محضر · مرتبة بحسب وقت الرصد
            </span>
          </div>

          {activeCases.length === 0 ? (
            <div className="py-16 text-center text-ink-faint">
              <div className="text-sm">لا مخالفات نشطة حاليًا</div>
              <div className="text-xs mt-1">جميع المنشآت المتصلة ملتزمة — لا محاضر مفتوحة.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[1080px]">
                <thead>
                  <tr className="bg-canvas">
                    <Th className="pr-[18px]">رقم المحضر</Th>
                    <Th>المنشأة</Th>
                    <Th>الحي</Th>
                    <Th>البند والوصف</Th>
                    <Th>وقت الرصد</Th>
                    <Th>الثقة</Th>
                    <Th>الحالة</Th>
                    <Th align="left" className="pl-[18px]">
                      الغرامة المحتملة (ر.س)
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {activeCases.map((c) => {
                    const s = CASE_STATUS[c.status] ?? CASE_STATUS.new;
                    const pct = Math.round(c.confidence * 100);
                    return (
                      <tr key={c.id} className="border-t border-[#EFF4F0] hover:bg-[#F7FAF8]">
                        <td className="py-[11px] pr-[18px] pl-3 font-mono text-[11.5px] font-semibold text-ink whitespace-nowrap tnum">
                          <Link href={`/case/${c.id}`} className="hover:underline">
                            {c.refNo}
                          </Link>
                        </td>
                        <td className="py-[11px] px-3 text-[12.5px] font-bold text-ink whitespace-nowrap">
                          {c.branch.nameAr}
                        </td>
                        <td className="py-[11px] px-3 text-xs text-ink-muted">
                          {normalizeDistrict(c.branch.districtAr)}
                        </td>
                        <td className="py-[11px] px-3 text-xs text-ink-muted">
                          <span className="font-mono text-[10.5px] font-bold text-ink bg-[#F0F5F2] rounded px-[7px] py-0.5 ml-[7px]">
                            {c.itemCode}
                          </span>
                          {ITEM_MAP[c.itemCode]?.titleAr ?? '—'}
                        </td>
                        <td className="py-[11px] px-3 text-[11.5px] text-ink-soft whitespace-nowrap tnum">
                          {formatDateTime(c.detectedAt)}
                        </td>
                        <td className="py-[11px] px-3">
                          <div className="flex flex-col gap-[3px]">
                            <span className="text-xs font-bold text-ink tnum">{pct}%</span>
                            <span className="w-[42px] h-[3px] rounded bg-line overflow-hidden block">
                              <span className="block h-full bg-saudi" style={{ width: `${pct}%` }} />
                            </span>
                          </div>
                        </td>
                        <td className="py-[11px] px-3 whitespace-nowrap">
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-[11px] py-1 border"
                            style={{ color: s.color, background: s.bg, borderColor: s.border }}
                          >
                            {s.pulse && (
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: s.color, animation: 'om-blink 1.3s infinite' }}
                              />
                            )}
                            {s.label}
                          </span>
                        </td>
                        <td className="py-[11px] pl-[18px] pr-3 text-left font-kufi text-[13.5px] font-extrabold text-ink whitespace-nowrap tnum">
                          {c.potentialFine.toLocaleString('en-US')}
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

      {/* ── شريط سلسلة الأدلة ── */}
      <footer
        className="mt-3.5 border-t-2 border-gold"
        style={{ background: 'linear-gradient(180deg,#FCF8EF,#F6EFDD)' }}
      >
        <div className="max-w-[1560px] mx-auto px-6 py-3.5 flex items-center justify-between gap-[18px] flex-wrap">
          <div className="flex items-center gap-3.5 flex-wrap">
            <div
              className="w-[42px] h-[42px] rounded-full border-[1.5px] border-[#7A5D24] grid place-items-center text-[#FFF8E8] text-lg font-bold shrink-0"
              style={{
                background: 'radial-gradient(circle at 35% 30%,#CBA95E,#8F6E2E)',
                boxShadow: '0 2px 8px rgba(143,110,46,.35)',
              }}
            >
              ✓
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-kufi font-bold text-[13px] text-[#6B5320]">
                سلسلة الأدلة الرقمية الموقّعة
              </span>
              <span className="text-[11.5px] text-[#8A7440]">
                {data ? (
                  <>
                    السجل الأخير <span className="tnum font-semibold">#{data.chainRoot.index}</span> ·
                    الجذر:{' '}
                    <span className="font-mono font-semibold text-[#6B5320]" dir="ltr">
                      {data.chainRoot.rootHash ? shortHash(data.chainRoot.rootHash) : '—'}
                    </span>
                  </>
                ) : (
                  '…'
                )}
              </span>
            </div>
          </div>

          <div className="no-print flex items-center gap-3 flex-wrap">
            <span className="text-[11px] text-[#8A7440]">{verifyMsg}</span>
            <button
              onClick={verifyChain}
              className="text-[12.5px] font-bold text-[#6B5320] bg-transparent border-[1.5px] border-gold rounded-[9px] px-[18px] py-2.5 cursor-pointer hover:bg-gold/15"
            >
              التحقق من سلامة السلسلة
            </button>
            <button
              onClick={() => {
                showToast('جارٍ تجهيز التقرير الوطني الموقّع للطباعة…');
                setTimeout(() => window.print(), 600);
              }}
              className="text-[12.5px] font-bold text-white bg-saudi border-[1.5px] border-saudi-deep rounded-[9px] px-5 py-2.5 cursor-pointer hover:bg-saudi-deep"
              style={{ boxShadow: '0 2px 8px rgba(22,93,58,.3)' }}
            >
              تصدير التقرير الوطني الموقّع 🖨
            </button>
          </div>
        </div>
        <div className="border-t border-gold/35 px-6 py-2 text-center text-[10.5px] text-[#9A8452]">
          تصنيف الوثيقة: مقيد — للاستخدام الرسمي · المركز الوطني لرصد الامتثال © 1448هـ / 2026م
        </div>
      </footer>

      {toast && (
        <div className="no-print fixed bottom-6 left-6 z-[9999] bg-ink text-white text-[12.5px] font-semibold rounded-[10px] px-[18px] py-3 shadow-[0_8px_26px_rgba(15,41,66,.35)] animate-om-in">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── مكوّنات صغيرة ──

function Kpi({
  label,
  value,
  suffix,
  hint,
  valueColor = '#0F2942',
  hintColor = '#8A99A5',
  danger,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
  valueColor?: string;
  hintColor?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl px-[18px] py-4 flex flex-col gap-1.5 shadow-[0_1px_3px_rgba(15,41,66,.05)] border ${
        danger ? 'border-[#F0D9D5]' : 'border-line'
      }`}
    >
      <span className="text-[11.5px] font-semibold text-ink-soft">{label}</span>
      <span className="font-kufi font-extrabold text-[28px] leading-none tnum" style={{ color: valueColor }}>
        {value}
        {suffix && <span className="text-[15px] text-ink-faint font-semibold">{suffix}</span>}
      </span>
      {hint && (
        <span className="text-[11px]" style={{ color: hintColor }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function Legend({ color, label, blink }: { color: string; label: string; blink?: boolean }) {
  return (
    <span className="flex items-center gap-[7px] text-[11.5px] font-semibold text-ink-muted">
      <span
        className="w-[11px] h-[11px] rounded-full border-2 border-white"
        style={{
          background: color,
          boxShadow: '0 0 0 1px #D5E0D8',
          animation: blink ? 'om-blink 1.4s infinite' : undefined,
        }}
      />
      {label}
    </span>
  );
}

function Th({
  children,
  align = 'right',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'right' | 'left';
  className?: string;
}) {
  return (
    <th
      className={`py-2.5 px-3 text-[11px] font-bold text-ink-soft whitespace-nowrap ${className}`}
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}
