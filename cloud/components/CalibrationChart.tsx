'use client';

import { useMemo, useState } from 'react';

interface DailyPoint {
  date: string;
  labeled: number;
  precision: number | null;
  fpRate: number | null;
}

const GREEN = '#1B7A43'; // الدقة
const AMBER = '#E0982C'; // معدل الإنذار الكاذب
// اللوحان مُتحقق منهما بمدقق dataviz (فصل CVD ≥ 12) + تسميات مباشرة كترميز ثانوي

/**
 * منحنى المعايرة اليومي: الدقة ومعدل الإنذار الكاذب (٪) مع خط هدف 90%.
 * محور واحد (نسبة مئوية) — طبقة تحويم + جدول بديل لإتاحة الوصول.
 */
export default function CalibrationChart({ daily }: { daily: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const points = useMemo(() => daily.filter((d) => d.labeled > 0), [daily]);

  const W = 560;
  const H = 200;
  const PAD = { top: 16, bottom: 28, left: 36, right: 88 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const x = (i: number) =>
    PAD.left + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (pct: number) => PAD.top + ih - (Math.max(0, Math.min(1, pct)) * ih);

  const path = (get: (p: DailyPoint) => number | null) =>
    points
      .map((p, i) => {
        const v = get(p);
        if (v === null) return null;
        return `${i === 0 || get(points[i - 1]) === null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');

  if (points.length === 0) {
    return (
      <div className="text-navy/40 text-sm py-8 text-center">
        لا بيانات معايرة بعد — صنّف الأحداث (صحيح/خاطئ) لتظهر منحنيات الدقة اليومية
      </div>
    );
  }

  const last = points[points.length - 1];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {/* وسيلة الإيضاح — الهوية ليست باللون وحده (تسميات مباشرة عند نهايات الخطوط) */}
        <div className="flex items-center gap-4 text-xs text-navy/70">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded" style={{ background: GREEN }} /> الدقة
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded" style={{ background: AMBER }} /> إنذار كاذب
          </span>
          <span className="flex items-center gap-1.5 text-navy/40">
            <span className="w-3 border-t border-dashed border-navy/40" /> هدف 90%
          </span>
        </div>
        <button
          onClick={() => setShowTable((s) => !s)}
          className="text-[11px] text-navy/50 underline underline-offset-2"
        >
          {showTable ? 'عرض المنحنى' : 'عرض جدول'}
        </button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-xs tnum">
            <thead>
              <tr className="text-navy/50 border-b border-navy/10">
                <th className="py-1.5 text-right">اليوم</th>
                <th className="py-1.5">مصنَّف</th>
                <th className="py-1.5">الدقة</th>
                <th className="py-1.5">إنذار كاذب</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className="border-b border-navy/5">
                  <td className="py-1.5" dir="ltr">{p.date}</td>
                  <td className="py-1.5 text-center">{p.labeled}</td>
                  <td className="py-1.5 text-center">
                    {p.precision === null ? '—' : `${Math.round(p.precision * 100)}%`}
                  </td>
                  <td className="py-1.5 text-center">
                    {p.fpRate === null ? '—' : `${Math.round(p.fpRate * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div dir="ltr" className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
            aria-label="منحنى الدقة اليومية ومعدل الإنذار الكاذب">
            {/* شبكة خافتة */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                  stroke="#16294A" strokeOpacity="0.07" />
                <text x={PAD.left - 6} y={y(t) + 3} fontSize="9" fill="#16294A"
                  fillOpacity="0.45" textAnchor="end" className="tnum">
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}
            {/* خط الهدف 90% */}
            <line x1={PAD.left} x2={W - PAD.right} y1={y(0.9)} y2={y(0.9)}
              stroke="#16294A" strokeOpacity="0.35" strokeDasharray="4 4" />

            {/* الخطان — 2px حسب مواصفات العلامات */}
            <path d={path((p) => p.precision)} fill="none" stroke={GREEN} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />
            <path d={path((p) => p.fpRate)} fill="none" stroke={AMBER} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />

            {/* تسميات مباشرة عند النهاية (ترميز ثانوي إلى جانب اللون) */}
            {last.precision !== null && (
              <text x={W - PAD.right + 6} y={y(last.precision) + 3} fontSize="10" fill={GREEN}
                fontWeight="700" className="tnum">
                {Math.round(last.precision * 100)}% الدقة
              </text>
            )}
            {last.fpRate !== null && (
              <text x={W - PAD.right + 6} y={y(last.fpRate) + 3} fontSize="10" fill={AMBER}
                fontWeight="700" className="tnum">
                {Math.round(last.fpRate * 100)}% كاذب
              </text>
            )}

            {/* محور التواريخ */}
            {points.map((p, i) =>
              points.length <= 8 || i % Math.ceil(points.length / 8) === 0 ? (
                <text key={p.date} x={x(i)} y={H - 8} fontSize="8.5" fill="#16294A"
                  fillOpacity="0.5" textAnchor="middle" className="tnum">
                  {p.date.slice(5)}
                </text>
              ) : null,
            )}

            {/* طبقة التحويم: أهداف أعرض من العلامة + خط متقاطع */}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih}
                  stroke="#16294A" strokeOpacity="0.25" />
                {points[hover].precision !== null && (
                  <circle cx={x(hover)} cy={y(points[hover].precision!)} r="4" fill={GREEN}
                    stroke="#fff" strokeWidth="2" />
                )}
                {points[hover].fpRate !== null && (
                  <circle cx={x(hover)} cy={y(points[hover].fpRate!)} r="4" fill={AMBER}
                    stroke="#fff" strokeWidth="2" />
                )}
              </g>
            )}
            {points.map((_, i) => (
              <rect key={i}
                x={i === 0 ? PAD.left : (x(i - 1) + x(i)) / 2}
                width={points.length <= 1 ? iw : iw / (points.length - 1)}
                y={PAD.top} height={ih} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            ))}
          </svg>
          {hover !== null && (
            <div dir="rtl"
              className="absolute top-1 right-1 bg-navy text-white text-[11px] rounded-lg px-3 py-2 shadow-panel pointer-events-none">
              <div className="tnum text-white/60" dir="ltr">{points[hover].date}</div>
              <div className="tnum">
                مصنَّف: {points[hover].labeled} · دقة:{' '}
                {points[hover].precision === null ? '—' : `${Math.round(points[hover].precision! * 100)}%`} · كاذب:{' '}
                {points[hover].fpRate === null ? '—' : `${Math.round(points[hover].fpRate! * 100)}%`}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
