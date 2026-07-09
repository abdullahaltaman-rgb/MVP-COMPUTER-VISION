'use client';

import { useEffect, useState } from 'react';
import { timeRemaining } from '@/lib/format';

export default function Countdown({
  deadline,
  status,
  size = 'md',
}: {
  deadline: string;
  status: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (status === 'corrected') {
    return <span className="chip bg-green/15 text-green border-green/30">صُححت ضمن المهلة</span>;
  }
  if (status === 'escalated') {
    return <span className="chip bg-red/15 text-red border-red/30">مُصعّدة</span>;
  }

  // قبل الترطيب لا نعرض قيمة متغيّرة (تفادي عدم التطابق)
  if (!now) {
    return <span className="countdown tnum text-navy/40">··:··:··</span>;
  }

  const r = timeRemaining(deadline, now);
  const cls = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-sm' : 'text-base';
  const color = r.expired ? 'text-red' : r.hours < 6 ? 'text-amber' : 'text-navy';

  if (r.expired) {
    return <span className={`countdown tnum font-bold text-red ${cls}`}>انتهت المهلة</span>;
  }

  return (
    <span className={`countdown tnum font-bold ${color} ${cls}`} dir="ltr">
      {r.label}
    </span>
  );
}
