'use client';

// ── شاشة التفتيش الرقمي عن بُعد — منصة رصد الامتثال البلدي ──
// مطابقة للتصميم المعتمد design/inspector.html.
// عقد الطابور محفوظ حرفيًا: POST /api/ops/review بـ {eventId, action:'approve'|'reject'}.
// أدوات غرفة العمليات (المعايرة/الصحة/الإعدادات/التدقيق) خلف تبويب ثانوي — بلا أي فقد وظيفي.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OpsTools from './ops/OpsTools';
import LiveStream from './LiveStream';
import { formatDateTime } from '@/lib/format';
import { ITEM_MAP, CAMERAS_AR } from '@/lib/catalog';
import { normalizeDistrict } from '@/lib/geo';

export interface OpsData {
  queue: {
    id: string; branchId: string; cameraKey: string; itemCode: string; confidence: number;
    source: string; zonesHit: string[]; noteAr: string | null; silent: boolean;
    occurredAt: string; receivedAt: string;
  }[];
  unlabeled: {
    id: string; itemCode: string; cameraKey: string; confidence: number;
    decision: string; status: string; occurredAt: string;
  }[];
  cases: {
    id: string; refNo: string; branchId: string; itemCode: string; status: string;
    confidence: number; potentialFine: number; detectedAt: string; graceDeadline: string;
  }[];
  devices: {
    id: string; name: string; branchNameAr: string; version: string | null;
    lastSeenAt: string | null; online: boolean;
    cameras: { key: string; nameAr: string; online: boolean; fps: number | null; lastSeenAt: string | null }[];
  }[];
  branches: {
    id: string; code: string; nameAr: string; silentMode: boolean;
    districtAr: string; licenseNo: string; score: number;
  }[];
  rules: {
    itemCode: string; enabled: boolean; mode: string; autoThreshold: number;
    reviewThreshold: number; confirmWindowSec: number; cooldownSec: number;
    scheduleMinutes: number | null; consecutiveChecks: number; zones: string[];
  }[];
  audit: { id: string; actorName: string; action: string; entity: string; entityId: string | null; at: string }[];
  calibration: {
    totalLabeled: number; truePos: number; falsePos: number;
    precision: number | null; fpRate: number | null; gatePassed: boolean;
    gateMinPrecision: number; gateMinEvents: number;
    perItem: { itemCode: string; labeled: number; truePos: number; falsePos: number; precision: number | null }[];
    daily: { date: string; labeled: number; precision: number | null; fpRate: number | null }[];
  };
  notifications: { id: string; audience: string; type: string; titleAr: string; status: string; at: string }[];
}

const CASE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'جديدة', color: '#0F2942', bg: '#E8EEF5' },
  notified: { label: 'مُبلّغة', color: '#0F2942', bg: '#E8EEF5' },
  in_grace: { label: 'ضمن المهلة ⏳', color: '#A96F14', bg: '#FBF3E3' },
  corrected: { label: 'صُحّحت ✓', color: '#165D3A', bg: '#EFF6F1' },
  escalated: { label: 'غرامة صدرت', color: '#CE4A3C', bg: '#FBEAE7' },
};

/** ترتيب العرض: كاميرا المعالجة هي الرئيسة (الأكبر) ثم البقية */
const CAMERA_ORDER = ['cam_processing', 'cam_reception', 'cam_waste'];
const CAMERA_CODE: Record<string, string> = {
  cam_processing: 'CAM1',
  cam_reception: 'CAM2',
  cam_waste: 'CAM3',
};

export default function OpsClient({ nameAr }: { nameAr: string }) {
  const router = useRouter();
  const [data, setData] = useState<OpsData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [clock, setClock] = useState('');
  const [showTools, setShowTools] = useState(false);
  const [modalEventId, setModalEventId] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    const res = await fetch('/api/ops', { cache: 'no-store' });
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
    toastT.current = setTimeout(() => setToast(null), 3500);
  }

  // ── عقد الطابور — لم يتغيّر حرفًا ──
  const post = useCallback(
    async (url: string, body: unknown, okMsg: string) => {
      setBusy(url + JSON.stringify(body));
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (!res.ok) {
          flash(j.detail || j.error || 'فشلت العملية');
          return false;
        }
        flash(okMsg);
        await load();
        return true;
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  }

  const branch = data?.branches[0];
  const current = data?.queue[0] ?? null; // الرصدة قيد التفتيش
  const modalEvent = useMemo(
    () => data?.queue.find((e) => e.id === modalEventId) ?? null,
    [data, modalEventId],
  );

  const branchCases = useMemo(
    () => (data?.cases ?? []).filter((c) => !branch || c.branchId === branch.id),
    [data, branch],
  );

  /** بنود الرقابة النشطة: مخالفة إن كان لها رصدة قيد المراجعة أو حالة مفتوحة */
  const ruleStatus = useMemo(() => {
    const flagged = new Set<string>();
    (data?.queue ?? []).forEach((e) => flagged.add(e.itemCode));
    branchCases
      .filter((c) => ['new', 'notified', 'in_grace', 'escalated'].includes(c.status))
      .forEach((c) => flagged.add(c.itemCode));
    return flagged;
  }, [data, branchCases]);

  const device = data?.devices[0];
  const deviceOnline = device?.online ?? false;

  /** الكاميرات الحقيقية من نبض الحافة، مرتّبة بالمعالجة أولًا */
  const cameras = useMemo(() => {
    const list = device?.cameras ?? [];
    return [...list].sort(
      (a, b) => CAMERA_ORDER.indexOf(a.key) - CAMERA_ORDER.indexOf(b.key),
    );
  }, [device]);

  async function approve(eventId: string) {
    const ok = await post(
      '/api/ops/review',
      { eventId, action: 'approve' },
      'اعتُمد المحضر — فُتحت حالة وبدأت مهلة التصحيح 48 ساعة',
    );
    if (ok) setModalEventId(null);
  }

  async function reject(eventId: string) {
    await post('/api/ops/review', { eventId, action: 'reject' }, 'استُبعدت الرصدة (إنذار كاذب)');
  }

  if (!data) {
    return (
      <div dir="rtl" className="min-h-screen bg-canvas grid place-items-center">
        <div className="text-ink-faint">جارٍ التحميل…</div>
      </div>
    );
  }

  const item = current ? ITEM_MAP[current.itemCode] : null;

  return (
    <div dir="rtl" className="min-h-screen bg-canvas flex flex-col">
      {/* ── الشريط العلوي ── */}
      <header
        className="text-white border-b-[3px] border-gold"
        style={{ background: 'linear-gradient(135deg,#0B3320 0%,#165D3A 70%,#1B6B44 100%)' }}
      >
        <div className="max-w-[1560px] mx-auto px-6 py-2.5 flex items-center justify-between gap-5 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-[42px] h-[42px] rounded-full border-2 border-gold grid place-items-center shrink-0"
              style={{ background: 'radial-gradient(circle at 35% 30%,#1E7248,#0B3320)' }}
            >
              <span className="font-kufi font-extrabold text-[11px] text-sand">رصد</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <h1 className="m-0 font-kufi font-bold text-[16.5px] text-white">
                منصة رصد الامتثال البلدي <span className="text-gold font-semibold">·</span> التفتيش الرقمي عن بُعد
              </h1>
              <span className="text-[11px] text-[#C9DCD0]">أمانة منطقة الرياض — قطاع المغاسل</span>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex flex-col gap-0.5 text-left border-l border-white/20 pl-4">
              <span className="text-xs font-bold text-[#E8F1EA]">{nameAr}</span>
              <span className="text-[10.5px] text-[#AFC8B7]">مفتش بلدي — غرفة العمليات</span>
            </div>
            <div className="font-mono text-[15px] font-semibold tracking-wider text-white tnum min-w-[84px] text-center">
              {clock || '—'}
            </div>

            {/* الوضع الصامت — يبقى ظاهرًا وقابلًا للتبديل من الأدوات */}
            {branch && (
              <span
                className={`flex items-center gap-1.5 text-[11px] font-bold rounded-full px-3 py-1.5 border ${
                  branch.silentMode
                    ? 'bg-amber/20 text-[#FFE2B8] border-amber/50'
                    : 'bg-white/10 text-[#DDF2E4] border-white/25'
                }`}
              >
                {branch.silentMode ? 'الوضع الصامت مفعّل' : 'الإشعارات حيّة'}
              </span>
            )}

            <span
              className="flex items-center gap-[7px] rounded-full px-3 py-1.5 text-[11.5px] font-bold"
              style={{ background: 'rgba(206,74,60,.18)', border: '1px solid rgba(255,120,105,.5)', color: '#FFD9D4' }}
            >
              <span
                className="w-2 h-2 rounded-full bg-[#FF6B5E]"
                style={{ boxShadow: '0 0 8px #FF6B5E', animation: 'om-blink 1.2s infinite' }}
              />
              جلسة تفتيش نشطة · REC
            </span>

            <button
              onClick={() => setShowTools((v) => !v)}
              className="text-[11.5px] font-bold text-white border border-white/30 rounded-lg px-3 py-1.5 hover:bg-white/10"
            >
              {showTools ? '← شاشة التفتيش' : 'أدوات غرفة العمليات'}
              {!showTools && data.queue.length > 0 && (
                <span className="mr-1.5 tnum text-[10px] bg-red rounded-full px-1.5 py-0.5">{data.queue.length}</span>
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

      {showTools ? (
        <OpsTools data={data} busy={busy} post={post} />
      ) : (
        <>
          {/* ── شريط معلومات المنشأة ── */}
          <div className="bg-white border-b-2 border-saudi shadow-[0_1px_4px_rgba(15,41,66,.06)]">
            <div className="max-w-[1560px] mx-auto px-6 py-3 flex items-center gap-6 flex-wrap">
              {branch ? (
                <>
                  <span className="font-kufi font-extrabold text-[15.5px] text-ink">
                    {branch.nameAr} — {normalizeDistrict(branch.districtAr)}، الرياض
                  </span>
                  <span className="text-xs text-ink-soft">
                    رخصة بلدية{' '}
                    <span className="font-mono font-bold text-ink tnum">{branch.licenseNo}</span>
                  </span>
                  <span className="text-xs text-ink-soft">
                    رمز الفرع <span className="font-mono font-bold text-ink">{branch.code}</span>
                  </span>
                  <span className="flex items-center gap-[7px] text-xs text-ink-soft">
                    مؤشر امتثال المنشأة:
                    <span
                      className="font-kufi font-extrabold text-sm tnum"
                      style={{ color: branch.score >= 90 ? '#165D3A' : branch.score >= 70 ? '#E0982C' : '#CE4A3C' }}
                    >
                      {branch.score}%
                    </span>
                    <span className="w-14 h-[5px] rounded bg-[#F0E5CF] overflow-hidden inline-block">
                      <span
                        className="block h-full"
                        style={{
                          width: `${branch.score}%`,
                          background: branch.score >= 90 ? '#165D3A' : branch.score >= 70 ? '#E0982C' : '#CE4A3C',
                        }}
                      />
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-bold mr-auto" style={{ color: deviceOnline ? '#165D3A' : '#CE4A3C' }}>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: deviceOnline ? '#1B7A4A' : '#CE4A3C',
                        animation: 'om-blink 1.6s infinite',
                      }}
                    />
                    حالة الاتصال: {deviceOnline ? 'متصلة' : 'منقطعة'}
                    {device?.lastSeenAt && !deviceOnline && (
                      <span className="font-normal text-ink-faint"> · آخر نبض {formatDateTime(device.lastSeenAt)}</span>
                    )}
                  </span>
                </>
              ) : (
                <span className="text-sm text-ink-faint">لا توجد منشأة مسجّلة</span>
              )}
            </div>
          </div>

          <main
            className="max-w-[1560px] mx-auto w-full box-border px-6 py-[18px] grid gap-[18px] flex-1 items-start"
            style={{ gridTemplateColumns: '352px minmax(0,1fr)' }}
          >
            {/* ── العمود الجانبي ── */}
            <aside className="flex flex-col gap-3.5">
              {/* المخالفة المرصودة الآن */}
              {current && item ? (
                <div className="bg-white border-[1.5px] border-red rounded-xl overflow-hidden shadow-[0_2px_10px_rgba(206,74,60,.12)]">
                  <div className="bg-[#FBEAE7] px-3.5 py-2.5 flex items-center gap-2 border-b border-[#F0D9D5]">
                    <span
                      className="w-2 h-2 rounded-full bg-red"
                      style={{ animation: 'om-blink 1.2s infinite' }}
                    />
                    <h2 className="m-0 font-kufi font-bold text-[13px] text-red">المخالفة المرصودة الآن</h2>
                    {data.queue.length > 1 && (
                      <span className="mr-auto text-[10.5px] font-bold text-red tnum">
                        +{data.queue.length - 1} في الطابور
                      </span>
                    )}
                  </div>
                  <div className="px-3.5 py-3 flex flex-col gap-2.5">
                    <div className="flex gap-3 items-start">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/events/${current.id}/frame`}
                        alt="إطار الدليل"
                        className="w-[92px] h-[58px] object-cover rounded-md border border-[#33424F] bg-[#1C2733] shrink-0"
                      />
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="font-mono text-[11px] font-bold text-ink bg-[#F0F5F2] rounded px-[7px] py-0.5 self-start">
                          {current.itemCode}
                        </span>
                        <span className="text-[12.5px] font-bold text-ink leading-snug">{item.titleAr}</span>
                        <span className="text-[11px] text-ink-soft">
                          الثقة: <b className="text-ink tnum">{Math.round(current.confidence * 100)}%</b>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11.5px] font-bold text-saudi bg-[#EFF6F1] border border-[#D9E8DE] rounded-lg px-3 py-[7px]">
                      {current.source === 'semantic' ? (
                        <>
                          تحقق دلالي: مؤكد ✓{' '}
                          <span className="font-normal text-[#4E7A61]">(تحليل ذكاء اصطناعي)</span>
                        </>
                      ) : (
                        <>
                          كشف حي ✓ <span className="font-normal text-[#4E7A61]">({CAMERAS_AR[current.cameraKey] ?? current.cameraKey})</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between bg-[#FBF3E3] border border-[#EFE0BE] rounded-lg px-3 py-2">
                      <span className="text-[11.5px] font-bold text-[#8A6A1F]">وقت الرصد</span>
                      <span className="font-mono text-[12px] font-bold text-[#A96F14] tnum">
                        {formatDateTime(current.occurredAt)}
                      </span>
                    </div>

                    {current.silent && (
                      <div className="text-[11px] text-[#8A6A1F] bg-[#FBF3E3] border border-[#EFE0BE] rounded-lg px-3 py-2 leading-relaxed">
                        رُصدت أثناء الوضع الصامت — لن يُبلَّغ المشغّل أو الكفيل حتى إيقافه.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-line rounded-xl px-4 py-8 text-center shadow-[0_1px_4px_rgba(15,41,66,.06)]">
                  <div className="text-sm font-bold text-saudi">لا رصدات بانتظار التفتيش ✓</div>
                  <div className="text-[11px] text-ink-faint mt-1 leading-relaxed">
                    الطابور فارغ — ستظهر الرصدة هنا فور ورودها من أجهزة الحافة.
                  </div>
                </div>
              )}

              {/* سجل مخالفات المنشأة */}
              <div className="bg-white border border-line rounded-xl overflow-hidden shadow-[0_1px_4px_rgba(15,41,66,.06)]">
                <div className="px-3.5 py-2.5 border-b border-[#EAF0EC] bg-[#F7FAF8]">
                  <h2 className="m-0 font-kufi font-bold text-[13px] text-ink">
                    سجل مخالفات المنشأة{' '}
                    <span className="font-normal text-ink-faint text-[11px]">(آخر 90 يومًا)</span>
                  </h2>
                </div>
                <div className="flex flex-col">
                  {branchCases.length === 0 && (
                    <div className="px-3.5 py-6 text-center text-[11.5px] text-ink-faint">
                      لا مخالفات مسجّلة خلال 90 يومًا ✓
                    </div>
                  )}
                  {branchCases.slice(0, 8).map((c) => {
                    const badge = CASE_BADGE[c.status] ?? CASE_BADGE.new;
                    return (
                      <Link
                        key={c.id}
                        href={`/case/${c.id}`}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[#EFF4F0] last:border-0 hover:bg-[#F7FAF8]"
                      >
                        <span className="font-mono text-[10px] font-bold text-ink-muted bg-[#F0F5F2] rounded px-1.5 py-0.5 shrink-0">
                          {c.itemCode}
                        </span>
                        <div className="flex flex-col gap-px min-w-0 flex-1">
                          <span className="text-[11.5px] font-semibold text-ink truncate">
                            {ITEM_MAP[c.itemCode]?.titleAr ?? c.itemCode}
                          </span>
                          <span className="text-[10px] text-ink-faint tnum">{formatDateTime(c.detectedAt)}</span>
                        </div>
                        <span
                          className="text-[10.5px] font-bold rounded-full px-2.5 py-[3px] shrink-0"
                          style={{ color: badge.color, background: badge.bg }}
                        >
                          {badge.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* بنود الرقابة النشطة */}
              <div className="bg-white border border-line rounded-xl overflow-hidden shadow-[0_1px_4px_rgba(15,41,66,.06)]">
                <div className="px-3.5 py-2.5 border-b border-[#EAF0EC] bg-[#F7FAF8]">
                  <h2 className="m-0 font-kufi font-bold text-[13px] text-ink">
                    بنود الرقابة النشطة على هذه المنشأة
                  </h2>
                </div>
                <div className="flex flex-col">
                  {data.rules
                    .filter((r) => r.enabled)
                    .map((r) => {
                      const violating = ruleStatus.has(r.itemCode);
                      return (
                        <div
                          key={r.itemCode}
                          className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[#EFF4F0] last:border-0"
                        >
                          <span className="flex items-center gap-2.5 text-[11.5px] font-semibold text-ink min-w-0">
                            <span className="font-mono text-[9.5px] font-bold text-ink-muted bg-[#F0F5F2] rounded px-1.5 py-0.5 shrink-0">
                              {r.itemCode}
                            </span>
                            <span className="truncate">{ITEM_MAP[r.itemCode]?.titleAr ?? r.itemCode}</span>
                          </span>
                          <span
                            className="text-[11px] font-bold shrink-0"
                            style={{ color: violating ? '#A96F14' : '#165D3A' }}
                          >
                            {violating ? 'مخالفة ⚠' : 'سليم ✓'}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </aside>

            {/* ── شبكة البث الحي ── */}
            <section
              className="grid gap-3.5 min-w-0"
              style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto auto' }}
            >
              {cameras.length === 0 && (
                <div
                  style={{ gridColumn: '1 / -1' }}
                  className="bg-white border border-line rounded-xl py-16 text-center text-ink-faint text-sm"
                >
                  لا كاميرات مسجّلة على صندوق الحافة بعد
                </div>
              )}
              {cameras.map((c, i) => (
                <div key={c.key} style={i === 0 ? { gridColumn: '1 / -1' } : undefined}>
                  <LiveStream
                    cameraKey={c.key}
                    title={c.nameAr}
                    badge={i === 0 ? 'الكاميرا الرئيسة' : undefined}
                    height={i === 0 ? 400 : 216}
                    offline={!c.online}
                    deviceCode={
                      branch ? `${branch.code}-${CAMERA_CODE[c.key] ?? c.key}` : CAMERA_CODE[c.key] ?? c.key
                    }
                    primary={i === 0}
                  />
                </div>
              ))}
            </section>
          </main>

          {/* ── منطقة الإجراء الرسمي ── */}
          <footer
            className="border-t-2 border-gold mt-auto"
            style={{ background: 'linear-gradient(180deg,#122A40,#0F2942)' }}
          >
            <div className="max-w-[1560px] mx-auto px-6 py-4 flex items-center justify-between gap-[18px] flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  disabled={!current || busy !== null}
                  onClick={() => current && setModalEventId(current.id)}
                  className="font-kufi text-[14.5px] font-bold rounded-[10px] px-[26px] py-[13px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    color: '#2B2008',
                    background: 'linear-gradient(180deg,#D9B565,#B8934A)',
                    border: '1px solid #8F6E2E',
                    boxShadow: '0 3px 12px rgba(184,147,74,.4)',
                  }}
                >
                  ⚖ إصدار محضر مخالفة رقمي
                </button>

                <button
                  disabled={!current || busy !== null}
                  onClick={() => current && reject(current.id)}
                  className="text-[13px] font-bold text-[#0F2942] bg-white border border-white rounded-[10px] px-5 py-3 cursor-pointer hover:bg-[#E8EEF5] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  رفض الرصدة — غير صحيحة
                </button>

                <button
                  onClick={() => setShowTools(true)}
                  className="text-[13px] font-semibold text-[#C7D5E2] bg-transparent border border-white/35 rounded-[10px] px-5 py-3 cursor-pointer hover:bg-white/10"
                >
                  أدوات غرفة العمليات
                </button>
              </div>
              <span className="text-[11.5px] text-[#8FA3B5] max-w-[340px] leading-relaxed">
                كل إجراء يُوقَّع رقميًا <span className="font-mono text-[#C7D5E2]">Ed25519</span> ويُسجَّل في سلسلة
                الأدلة الوطنية
              </span>
            </div>
          </footer>
        </>
      )}

      {/* ── محضر مخالفة رقمي (مسودة) ── */}
      {modalEvent && (
        <MomModal
          event={modalEvent}
          branch={branch}
          inspector={nameAr}
          busy={busy !== null}
          onDismiss={() => setModalEventId(null)}
          onApprove={() => approve(modalEvent.id)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-6 z-[2000] bg-ink text-white text-[12.5px] font-semibold rounded-[10px] px-[18px] py-3 shadow-[0_8px_26px_rgba(15,41,66,.35)] animate-om-in">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── نموذج المحضر MOM-2026 ──
function MomModal({
  event,
  branch,
  inspector,
  busy,
  onDismiss,
  onApprove,
}: {
  event: OpsData['queue'][number];
  branch?: OpsData['branches'][number];
  inspector: string;
  busy: boolean;
  onDismiss: () => void;
  onApprove: () => void;
}) {
  const item = ITEM_MAP[event.itemCode];
  // رقم المحضر النهائي يصدر من الخادم عند الاعتماد — هذه مسودة
  const draftRef = `MOM-${new Date(event.occurredAt).getFullYear()}-${event.id.slice(-5).toUpperCase()}`;

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-6 box-border"
      style={{ background: 'rgba(10,22,34,.62)', backdropFilter: 'blur(3px)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="om-scroll bg-white rounded-2xl w-[640px] max-w-full max-h-[92vh] overflow-y-auto shadow-[0_24px_70px_rgba(0,0,0,.4)] border-t-[5px] border-gold">
        <div className="px-6 pt-[18px] pb-3.5 border-b-2 border-saudi flex items-center justify-between gap-3.5">
          <div className="flex items-center gap-3">
            <div
              className="w-[46px] h-[46px] rounded-full border-2 border-gold grid place-items-center shrink-0"
              style={{ background: 'radial-gradient(circle at 35% 30%,#1E7248,#0B3320)' }}
            >
              <span className="font-kufi font-extrabold text-[10.5px] text-sand">رصد</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-kufi font-extrabold text-base text-ink">محضر مخالفة رقمي — مسودة</span>
              <span className="text-[11px] text-ink-soft">
                المركز الوطني لرصد الامتثال · أمانة منطقة الرياض
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-[3px]">
            <span className="font-mono text-[13px] font-bold text-ink">{draftRef}</span>
            <span className="text-[10.5px] text-ink-faint tnum">{formatDateTime(event.occurredAt)}</span>
            <button
              onClick={onDismiss}
              className="bg-transparent border-0 text-ink-faint text-xs cursor-pointer hover:text-red py-0.5"
            >
              إغلاق ✕
            </button>
          </div>
        </div>

        <div className="px-6 py-4 flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 bg-[#F7FAF8] border border-line rounded-[10px] px-4 py-3">
            <span className="text-[11.5px] text-ink-soft">
              المنشأة: <b className="text-ink">{branch?.nameAr ?? '—'}</b>
            </span>
            <span className="text-[11.5px] text-ink-soft">
              الرخصة البلدية: <b className="font-mono text-ink">{branch?.licenseNo ?? '—'}</b>
            </span>
            <span className="text-[11.5px] text-ink-soft">
              رمز الفرع: <b className="font-mono text-ink">{branch?.code ?? '—'}</b>
            </span>
            <span className="text-[11.5px] text-ink-soft">
              المفتش: <b className="text-ink">{inspector}</b>
            </span>
          </div>

          <div className="border border-[#F0D9D5] bg-[#FDF7F6] rounded-[10px] px-4 py-3 flex flex-col gap-1.5">
            <span className="flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-bold text-white bg-red rounded px-2 py-0.5">
                {event.itemCode}
              </span>
              <b className="text-[13px] text-ink">{item?.titleAr ?? event.itemCode}</b>
            </span>
            <span className="text-[11.5px] text-ink-soft leading-loose">
              البند حسب لائحة الاشتراطات البلدية لنشاط المغاسل · الغرامة المقررة:{' '}
              <b className="text-ink">{item?.fineText ?? '—'}</b>
            </span>
          </div>

          <div className="flex gap-3.5 items-stretch">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/events/${event.id}/frame`}
              alt="صورة الدليل الرقمي"
              className="w-[150px] h-[92px] object-cover rounded-lg border border-[#33424F] bg-[#1C2733] shrink-0"
            />
            <div className="flex-1 flex flex-col gap-1.5 justify-center">
              <span className="text-[11.5px] font-bold text-ink">صورة الدليل الرقمي المرفقة</span>
              <span className="flex items-center gap-[7px] text-[10.5px] text-[#6B5320] bg-[#FCF8EF] border border-[#EFE0BE] rounded-md px-2.5 py-1.5 leading-relaxed">
                <span
                  className="w-4 h-4 rounded-full grid place-items-center text-[#FFF8E8] text-[9px] shrink-0"
                  style={{ background: 'radial-gradient(circle at 35% 30%,#CBA95E,#8F6E2E)' }}
                >
                  ✓
                </span>
                تُوقَّع Ed25519 وتُضاف لسلسلة الأدلة عند الاعتماد
              </span>
              <span className="text-[10.5px] text-ink-faint">
                الثقة الآلية <span className="tnum">{Math.round(event.confidence * 100)}%</span>
                {event.source === 'semantic' ? ' · تحقق دلالي مؤكد ✓' : ' · كشف حي'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3.5 bg-[#FBF3E3] border border-[#EFE0BE] rounded-[10px] px-4 py-3">
            <div className="flex flex-col gap-[3px]">
              <span className="text-[11.5px] font-bold text-[#8A6A1F]">الغرامة المقررة</span>
              <span className="font-kufi font-extrabold text-[22px] text-ink tnum">
                {(item?.fineAmount ?? 0).toLocaleString('en-US')}{' '}
                <span className="text-[13px] font-semibold text-ink-soft">ريال</span>
              </span>
            </div>
            <span className="text-[11px] text-[#8A6A1F] max-w-[250px] leading-relaxed text-left">
              يفتح الاعتماد حالةً ويبدأ مهلة تصحيح نظامية مدتها 48 ساعة تلقائيًا
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-dashed border-[#D5E0D8] pt-3.5">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">توقيع المفتش الرقمي</span>
              <span className="font-kufi font-bold text-[15px] text-saudi">{inspector}</span>
              <span className="font-mono text-[10px] text-ink-faint">
                SIG-Ed25519 · يُصدر عند الاعتماد · بانتظار الاعتماد
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-[#EAF0EC] bg-[#F7FAF8] flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              disabled={busy}
              onClick={onApprove}
              className="flex-1 min-w-[180px] font-kufi text-sm font-bold rounded-[9px] px-5 py-3 cursor-pointer disabled:opacity-50"
              style={{
                color: '#2B2008',
                background: 'linear-gradient(180deg,#D9B565,#B8934A)',
                border: '1px solid #8F6E2E',
                boxShadow: '0 2px 10px rgba(184,147,74,.35)',
              }}
            >
              {busy ? 'جارٍ الاعتماد…' : 'اعتماد وإصدار'}
            </button>
            <button
              onClick={onDismiss}
              disabled={busy}
              className="text-[13px] font-bold text-ink bg-white border border-[#D5E0D8] rounded-[9px] px-5 py-3 cursor-pointer hover:bg-[#EEF3F0] disabled:opacity-50"
            >
              إلغاء
            </button>
          </div>
          <span className="text-[11px] text-ink-faint text-center leading-relaxed">
            {branch?.silentMode
              ? 'الوضع الصامت مفعّل — تُفتح الحالة وتُسجَّل دون إشعار المشغّل أو الكفيل.'
              : 'سيُبلَّغ المشغّل والكفيل فور الاعتماد وتبدأ مهلة التصحيح.'}
          </span>
        </div>
      </div>
    </div>
  );
}
