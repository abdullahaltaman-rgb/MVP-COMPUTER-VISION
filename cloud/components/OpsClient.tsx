'use client';

// كونسول العمليات: طابور المراجعة، المعايرة (بوابة الأسبوع الثاني)، صحة الأجهزة،
// ضبط العتبات والجداول، SILENT_MODE، سجل التدقيق.
import { useCallback, useEffect, useState } from 'react';
import AppShell from './AppShell';
import CalibrationChart from './CalibrationChart';
import { ConfidenceBar, KpiCard } from './ui';
import { formatDateTime } from '@/lib/format';
import { ITEM_MAP, ZONES_AR, CAMERAS_AR } from '@/lib/catalog';

type Tab = 'queue' | 'calibration' | 'health' | 'config' | 'audit';

interface OpsData {
  queue: {
    id: string; branchId: string; cameraKey: string; itemCode: string; confidence: number;
    source: string; zonesHit: string[]; noteAr: string | null; silent: boolean;
    occurredAt: string; receivedAt: string;
  }[];
  unlabeled: {
    id: string; itemCode: string; cameraKey: string; confidence: number;
    decision: string; status: string; occurredAt: string;
  }[];
  devices: {
    id: string; name: string; branchNameAr: string; version: string | null;
    lastSeenAt: string | null; online: boolean;
    cameras: { key: string; nameAr: string; online: boolean; fps: number | null; lastSeenAt: string | null }[];
  }[];
  branches: { id: string; code: string; nameAr: string; silentMode: boolean }[];
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

const ACTION_AR: Record<string, string> = {
  login: 'تسجيل دخول',
  review_approve: 'اعتماد رصدة',
  review_reject: 'استبعاد رصدة',
  calibration_label: 'تصنيف معايرة',
  rule_config_update: 'تحديث إعدادات بند',
  silent_mode_on: 'تفعيل الوضع الصامت',
  silent_mode_off: 'إيقاف الوضع الصامت',
  correction_accepted: 'قبول تصحيح',
  correction_recheck_failed: 'فشل إعادة كشف',
  evidence_purge_90d: 'إتلاف أدلة (90 يومًا)',
  records_purge_2y: 'إتلاف سجلات (سنتان)',
};

export default function OpsClient({ nameAr }: { nameAr: string }) {
  const [data, setData] = useState<OpsData | null>(null);
  const [tab, setTab] = useState<Tab>('queue');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/ops', { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function post(url: string, body: unknown, okMsg: string) {
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
  }

  if (!data) {
    return (
      <AppShell title="غرفة العمليات" role="ops" nameAr={nameAr}>
        <div className="text-navy/40 py-20 text-center">جارٍ التحميل…</div>
      </AppShell>
    );
  }

  const branch = data.branches[0];
  const cal = data.calibration;
  const offlineDevices = data.devices.filter((d) => !d.online);

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'queue', label: 'طابور المراجعة', count: data.queue.length },
    { key: 'calibration', label: 'المعايرة', count: data.unlabeled.length },
    { key: 'health', label: 'صحة الأجهزة', count: offlineDevices.length || undefined },
    { key: 'config', label: 'الإعدادات' },
    { key: 'audit', label: 'سجل التدقيق' },
  ];

  return (
    <AppShell
      title="غرفة العمليات — أبيض فيجن"
      role="ops"
      nameAr={nameAr}
      badge={
        branch && (
          <span className={`chip ${branch.silentMode ? 'bg-amber/20 text-amber border-amber/40' : 'bg-green/20 text-green border-green/40'}`}>
            {branch.silentMode ? 'الوضع الصامت مفعّل' : 'الإشعارات حيّة'}
          </span>
        )
      }
    >
      {/* تنبيه انقطاع ≥ 5 دقائق */}
      {offlineDevices.length > 0 && (
        <div className="card border-red/40 bg-red/5 p-4 mb-4 flex items-center gap-3">
          <span className="rec-dot shrink-0" />
          <div className="text-red text-sm font-bold">
            انقطاع ≥ 5 دقائق: {offlineDevices.map((d) => `${d.name} (${d.branchNameAr})`).join('، ')}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="بانتظار المراجعة" value={data.queue.length} accent="#E0982C" />
        <KpiCard label="أحداث مصنَّفة" value={cal.totalLabeled} />
        <KpiCard
          label="الدقة التراكمية"
          value={cal.precision === null ? '—' : `${Math.round(cal.precision * 100)}%`}
          accent={cal.precision !== null && cal.precision >= 0.9 ? '#1B7A43' : '#CE4A3C'}
        />
        <KpiCard
          label="بوابة الإطلاق"
          value={cal.gatePassed ? 'مجتازة ✓' : 'غير مجتازة'}
          accent={cal.gatePassed ? '#1B7A43' : '#CE4A3C'}
        />
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto thin-scroll">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`chip whitespace-nowrap px-4 py-2 text-sm ${
              tab === t.key ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-navy/15'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`tnum text-[10px] rounded-full px-1.5 ${tab === t.key ? 'bg-white/20' : 'bg-red text-white'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── طابور المراجعة ── */}
      {tab === 'queue' && (
        <div className="space-y-3">
          {data.queue.length === 0 && (
            <div className="card p-8 text-center text-navy/40">لا رصدات بانتظار المراجعة ✓</div>
          )}
          {data.queue.map((e) => (
            <div key={e.id} className="card p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* إطار الدليل */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/events/${e.id}/frame`}
                  alt="إطار الدليل"
                  className="w-full sm:w-56 h-36 object-cover rounded-lg bg-navy/5 border border-navy/10"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="chip bg-navy/10 text-navy border-navy/15 tnum">بند {e.itemCode}</span>
                    {e.silent && <span className="chip bg-amber/15 text-amber border-amber/30">صامت</span>}
                    {e.source === 'semantic' && (
                      <span className="chip bg-gold/15 text-gold border-gold/30">فحص مجدول</span>
                    )}
                  </div>
                  <div className="font-bold text-navy text-sm mb-1">
                    {ITEM_MAP[e.itemCode]?.titleAr ?? e.itemCode}
                  </div>
                  <div className="text-navy/50 text-xs mb-2">
                    {CAMERAS_AR[e.cameraKey] ?? e.cameraKey}
                    {e.zonesHit.length > 0 && <> · {e.zonesHit.map((z) => ZONES_AR[z] ?? z).join('، ')}</>}
                    {' · '}{formatDateTime(e.occurredAt)}
                  </div>
                  {e.noteAr && <div className="text-navy/70 text-xs mb-2">{e.noteAr}</div>}
                  <ConfidenceBar value={e.confidence} />
                  <div className="flex gap-2 mt-3">
                    <button
                      disabled={busy !== null}
                      onClick={() => post('/api/ops/review', { eventId: e.id, action: 'approve' }, 'اعتُمدت الرصدة وفُتحت حالة')}
                      className="btn btn-primary text-sm py-2 disabled:opacity-50"
                    >
                      اعتماد → حالة
                    </button>
                    <button
                      disabled={busy !== null}
                      onClick={() => post('/api/ops/review', { eventId: e.id, action: 'reject' }, 'استُبعدت (إنذار كاذب)')}
                      className="btn btn-ghost text-sm py-2 disabled:opacity-50"
                    >
                      استبعاد (خاطئ)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── المعايرة ── */}
      {tab === 'calibration' && (
        <div className="space-y-4">
          <div className={`card p-4 ${cal.gatePassed ? 'border-green/40 bg-green/5' : 'border-amber/40 bg-amber/5'}`}>
            <div className="font-kufi font-bold text-navy mb-1">
              بوابة الأسبوع الثاني: دقة ≥ {Math.round(cal.gateMinPrecision * 100)}% على {cal.gateMinEvents}+ حدث مصنَّف
            </div>
            <div className="text-sm text-navy/70 tnum">
              الحالي: {cal.totalLabeled} حدث مصنَّف · دقة{' '}
              {cal.precision === null ? '—' : `${Math.round(cal.precision * 100)}%`} · إنذار كاذب{' '}
              {cal.fpRate === null ? '—' : `${Math.round(cal.fpRate * 100)}%`}
              {' — '}
              <b className={cal.gatePassed ? 'text-green' : 'text-amber'}>
                {cal.gatePassed ? 'البوابة مجتازة — يمكن إيقاف الوضع الصامت' : 'لا إطلاق قبل اجتياز البوابة'}
              </b>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-3">الدقة اليومية ومعدل الإنذار الكاذب</h3>
            <CalibrationChart daily={cal.daily} />
          </div>

          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-3">حسب البند</h3>
            <div className="space-y-2">
              {cal.perItem.map((it) => (
                <div key={it.itemCode} className="flex items-center gap-3 text-sm">
                  <span className="chip bg-navy/10 text-navy border-navy/15 tnum w-24 justify-center shrink-0">
                    {it.itemCode}
                  </span>
                  <span className="flex-1 text-navy/70 truncate text-xs">
                    {ITEM_MAP[it.itemCode]?.titleAr}
                  </span>
                  <span className="tnum text-xs text-navy/50 shrink-0">{it.labeled} مصنَّف</span>
                  <span className={`tnum font-bold shrink-0 ${it.precision !== null && it.precision >= 0.9 ? 'text-green' : it.precision === null ? 'text-navy/30' : 'text-amber'}`}>
                    {it.precision === null ? '—' : `${Math.round(it.precision * 100)}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-1">أحداث تحتاج تصنيفًا (صحيح/خاطئ)</h3>
            <p className="text-navy/40 text-xs mb-3">
              رصدات المراجعة تُصنَّف تلقائيًا عند الاعتماد/الاستبعاد؛ هنا الأحداث الآلية وغيرها.
            </p>
            {data.unlabeled.length === 0 && (
              <div className="text-navy/40 text-sm py-4 text-center">كل الأحداث مصنَّفة ✓</div>
            )}
            <div className="space-y-2">
              {data.unlabeled.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-sm border border-navy/10 rounded-lg p-2.5">
                  <span className="chip bg-navy/10 text-navy border-navy/15 tnum shrink-0">{e.itemCode}</span>
                  <span className="text-navy/50 text-xs flex-1 truncate">
                    {CAMERAS_AR[e.cameraKey] ?? e.cameraKey} · {formatDateTime(e.occurredAt)} · ثقة{' '}
                    <span className="tnum">{Math.round(e.confidence * 100)}%</span>
                  </span>
                  <button
                    disabled={busy !== null}
                    onClick={() => post('/api/ops/label', { eventId: e.id, label: 'correct' }, 'صُنّف: صحيح')}
                    className="chip bg-green/10 text-green border-green/30 hover:bg-green/20"
                  >
                    صحيح
                  </button>
                  <button
                    disabled={busy !== null}
                    onClick={() => post('/api/ops/label', { eventId: e.id, label: 'incorrect' }, 'صُنّف: خاطئ')}
                    className="chip bg-red/10 text-red border-red/30 hover:bg-red/20"
                  >
                    خاطئ
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── صحة الأجهزة ── */}
      {tab === 'health' && (
        <div className="space-y-3">
          {data.devices.map((d) => (
            <div key={d.id} className={`card p-4 ${!d.online ? 'border-red/40' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-kufi font-bold text-navy">{d.name}</div>
                  <div className="text-navy/50 text-xs">
                    {d.branchNameAr} · إصدار {d.version ?? '—'} · آخر نبض:{' '}
                    {d.lastSeenAt ? formatDateTime(d.lastSeenAt) : 'لم يتصل بعد'}
                  </div>
                </div>
                <span className={`chip ${d.online ? 'bg-green/15 text-green border-green/30' : 'bg-red/15 text-red border-red/30'}`}>
                  {d.online ? 'متصل' : 'منقطع'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {d.cameras.map((c) => (
                  <div key={c.key} className="rounded-lg border border-navy/10 bg-mist/50 p-3 flex items-center justify-between">
                    <div>
                      <div className="text-navy text-sm font-bold">{c.nameAr}</div>
                      <div className="text-navy/40 text-[11px] tnum">
                        {c.fps ? `${c.fps.toFixed(1)} fps` : '—'}
                      </div>
                    </div>
                    <span className={`w-2.5 h-2.5 rounded-full ${c.online ? 'bg-green' : 'bg-red animate-blink'}`} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── الإعدادات ── */}
      {tab === 'config' && (
        <div className="space-y-4">
          {branch && (
            <div className="card p-4">
              <h3 className="font-kufi font-bold text-navy mb-2">SILENT_MODE — {branch.nameAr}</h3>
              <p className="text-navy/60 text-xs mb-3 leading-relaxed">
                عند التفعيل تذهب كل الرصدات إلى طابور المراجعة فقط — صفر إشعارات للمشغّل والكفيل
                (بوابة الأسبوع الثاني الإلزامية). الإيقاف يتطلب اجتياز بوابة المعايرة.
              </p>
              <button
                disabled={busy !== null}
                onClick={() =>
                  post(
                    '/api/ops/silent',
                    { branchId: branch.id, silentMode: !branch.silentMode },
                    branch.silentMode ? 'أُوقف الوضع الصامت — الإشعارات حية' : 'فُعّل الوضع الصامت',
                  )
                }
                className={`btn ${branch.silentMode ? 'btn-primary' : 'btn-red'} text-sm`}
              >
                {branch.silentMode ? 'إيقاف الوضع الصامت (go-live)' : 'تفعيل الوضع الصامت'}
              </button>
            </div>
          )}

          <div className="card p-4">
            <h3 className="font-kufi font-bold text-navy mb-3">عتبات وجداول بنود §5 (تُدفع للحافة فورًا)</h3>
            <div className="space-y-3">
              {data.rules.map((r) => (
                <RuleEditor key={r.itemCode} rule={r} busy={busy !== null} onSave={(fields) =>
                  post('/api/ops/config', { itemCode: r.itemCode, ...fields }, 'حُدّثت إعدادات البند')
                } />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── سجل التدقيق ── */}
      {tab === 'audit' && (
        <div className="card p-4">
          <h3 className="font-kufi font-bold text-navy mb-3">سجل التدقيق (أحدث 50)</h3>
          <div className="space-y-1.5">
            {data.audit.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs border-b border-navy/5 py-2">
                <span className="chip bg-navy/5 text-navy/70 border-navy/10">{ACTION_AR[a.action] ?? a.action}</span>
                <span className="text-navy/70 flex-1 truncate">
                  {a.actorName} · {a.entity}
                  {a.entityId && <span className="tnum" dir="ltr"> #{a.entityId.slice(0, 8)}</span>}
                </span>
                <span className="text-navy/40 tnum shrink-0">{formatDateTime(a.at)}</span>
              </div>
            ))}
          </div>
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

function RuleEditor({
  rule,
  busy,
  onSave,
}: {
  rule: {
    itemCode: string; enabled: boolean; mode: string; autoThreshold: number;
    reviewThreshold: number; confirmWindowSec: number; cooldownSec: number;
    scheduleMinutes: number | null; consecutiveChecks: number;
  };
  busy: boolean;
  onSave: (fields: Record<string, unknown>) => void;
}) {
  const [auto, setAuto] = useState(rule.autoThreshold);
  const [review, setReview] = useState(rule.reviewThreshold);
  const [confirm, setConfirm] = useState(rule.confirmWindowSec);
  const [cooldown, setCooldown] = useState(rule.cooldownSec);
  const [schedule, setSchedule] = useState(rule.scheduleMinutes ?? 120);
  const [consecutive, setConsecutive] = useState(rule.consecutiveChecks ?? 1);

  const dirty =
    auto !== rule.autoThreshold ||
    review !== rule.reviewThreshold ||
    confirm !== rule.confirmWindowSec ||
    cooldown !== rule.cooldownSec ||
    (rule.mode === 'scheduled' &&
      (schedule !== rule.scheduleMinutes || consecutive !== rule.consecutiveChecks));

  return (
    <div className="rounded-lg border border-navy/10 p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="chip bg-navy/10 text-navy border-navy/15 tnum">بند {rule.itemCode}</span>
        <span className={`chip ${rule.mode === 'live' ? 'bg-green/10 text-green border-green/30' : 'bg-gold/10 text-gold border-gold/30'}`}>
          {rule.mode === 'live' ? 'حي' : 'مجدول'}
        </span>
        <span className="text-navy/60 text-xs flex-1 truncate">{ITEM_MAP[rule.itemCode]?.titleAr}</span>
        <label className="flex items-center gap-1.5 text-xs text-navy/70">
          <input type="checkbox" checked={rule.enabled}
            onChange={(e) => onSave({ enabled: e.target.checked })} disabled={busy} />
          مفعّل
        </label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <NumField label="عتبة الإصدار الآلي" value={auto} step={0.01} min={0.5} max={1} onChange={setAuto} />
        <NumField label="عتبة المراجعة" value={review} step={0.01} min={0.3} max={1} onChange={setReview} />
        {rule.mode === 'live' ? (
          <NumField label="نافذة التأكيد (ث)" value={confirm} step={5} min={0} max={3600} onChange={setConfirm} />
        ) : (
          <NumField label="الجدولة (دقيقة)" value={schedule} step={15} min={15} max={1440} onChange={setSchedule} />
        )}
        {rule.mode === 'scheduled' ? (
          <NumField label="فحوصات متتالية للتأكيد" value={consecutive} step={1} min={1} max={5} onChange={setConsecutive} />
        ) : (
          <NumField label="التهدئة (ث)" value={cooldown} step={60} min={0} max={86400} onChange={setCooldown} />
        )}
      </div>
      {dirty && (
        <button
          disabled={busy}
          onClick={() =>
            onSave({
              autoThreshold: auto,
              reviewThreshold: review,
              confirmWindowSec: confirm,
              cooldownSec: cooldown,
              ...(rule.mode === 'scheduled'
                ? { scheduleMinutes: schedule, consecutiveChecks: consecutive }
                : {}),
            })
          }
          className="btn btn-navy text-xs py-1.5 px-4 mt-2"
        >
          حفظ
        </button>
      )}
    </div>
  );
}

function NumField({
  label, value, onChange, step, min, max,
}: {
  label: string; value: number; onChange: (v: number) => void; step: number; min: number; max: number;
}) {
  return (
    <label className="block">
      <span className="text-navy/50 text-[10px]">{label}</span>
      <input
        type="number" dir="ltr" value={value} step={step} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 w-full rounded-lg border border-navy/15 px-2 py-1.5 tnum text-navy"
      />
    </label>
  );
}
