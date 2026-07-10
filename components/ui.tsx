import { STATUS_AR, STATUS_COLOR, confidencePct } from '@/lib/format';

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip ${STATUS_COLOR[status] ?? 'bg-navy/10 text-navy border-navy/20'}`}>
      {STATUS_AR[status] ?? status}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? '#1B7A43' : value >= 0.6 ? '#E0982C' : '#CE4A3C';
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-2 rounded-full bg-navy/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="tnum text-xs text-navy/70">{confidencePct(value)}</span>
    </div>
  );
}

export function Donut({ value, label, size = 140 }: { value: number; label?: string; size?: number }) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  const color = pct >= 80 ? '#1B7A43' : pct >= 60 ? '#E0982C' : '#CE4A3C';
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E3E9F1" strokeWidth="12" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-kufi font-bold text-2xl text-navy tnum">{Math.round(pct)}%</div>
        {label && <div className="text-navy/50 text-xs">{label}</div>}
      </div>
    </div>
  );
}

export function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-navy/55 text-xs mb-1 leading-tight">{label}</div>
      <div className="font-kufi font-bold text-2xl tnum" style={{ color: accent ?? '#16294A' }}>
        {value}
      </div>
    </div>
  );
}
