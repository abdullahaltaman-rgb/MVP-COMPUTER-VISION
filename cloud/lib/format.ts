// أدوات تنسيق عربية بأرقام غربية (western digits) — بلا اعتماد على locale
// لتفادي اختلاف الترطيب (hydration) بين الخادم والمتصفح.

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

/** ٨ يوليو ٢٠٢٦ — لكن بأرقام غربية: "8 يوليو 2026" */
export function formatDate(d: Date | string): string {
  const dt = toDate(d);
  return `${dt.getDate()} ${MONTHS_AR[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** "8 يوليو 2026 · 11:42 م" */
export function formatDateTime(d: Date | string): string {
  const dt = toDate(d);
  return `${formatDate(dt)} · ${formatTime(dt)}`;
}

/** "11:42 م" بنظام 12 ساعة وأرقام غربية */
export function formatTime(d: Date | string): string {
  const dt = toDate(d);
  let h = dt.getHours();
  const m = dt.getMinutes();
  const period = h >= 12 ? 'م' : 'ص';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${pad(m)} ${period}`;
}

/** "11:42:07" لساعة الـ HUD الحية */
export function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface Remaining {
  expired: boolean;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  label: string; // "47:12:03" أو "انتهت المهلة"
}

export function timeRemaining(deadline: Date | string, now: Date): Remaining {
  const end = toDate(deadline).getTime();
  const diff = end - now.getTime();
  if (diff <= 0) {
    return { expired: true, hours: 0, minutes: 0, seconds: 0, totalMs: 0, label: 'انتهت المهلة' };
  }
  const totalSec = Math.floor(diff / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return {
    expired: false,
    hours,
    minutes,
    seconds,
    totalMs: diff,
    label: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
  };
}

/** "1,000 ريال" بفواصل آلاف وأرقام غربية */
export function formatMoney(n: number): string {
  return `${n.toLocaleString('en-US')} ريال`;
}

export function formatPercent(n: number): string {
  return `${Math.round(n)}%`;
}

/** نسبة الثقة 0..1 → "87%" */
export function confidencePct(c: number): string {
  return `${Math.round(c * 100)}%`;
}

/** اختصار البصمة للعرض (آمن للعميل — بلا crypto): أول 8 · آخر 8 */
export function shortHash(hash: string): string {
  if (!hash || hash.length < 16) return hash || '—';
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

export const STATUS_AR: Record<string, string> = {
  new: 'جديدة',
  notified: 'تم الإبلاغ',
  in_grace: 'ضمن المهلة',
  corrected: 'صُححت',
  escalated: 'مُصعّدة',
};

export const STATUS_COLOR: Record<string, string> = {
  new: 'bg-amber/15 text-amber border-amber/30',
  notified: 'bg-amber/15 text-amber border-amber/30',
  in_grace: 'bg-navy/10 text-navy border-navy/20',
  corrected: 'bg-green/15 text-green border-green/30',
  escalated: 'bg-red/15 text-red border-red/30',
};
