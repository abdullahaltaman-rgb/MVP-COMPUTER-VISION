'use client';

// ── البث الحي (go2rtc عبر نفق Cloudflare) ──
// المصدر يأتي حصريًا من NEXT_PUBLIC_STREAM_URL — لا رابط ثابت في الكود إطلاقًا.
// الرابط مؤقت اليوم (trycloudflare) وسيتغيّر إلى نفق مسمّى، فيكفي تغيير المتغيّر.
// عند غياب المتغيّر تظهر رسالة بديلة نظيفة ولا تنكسر الصفحة.

// Next يستبدل هذا التعبير وقت البناء — يجب كتابته حرفيًا لا عبر متغيّر وسيط.
const STREAM_BASE = process.env.NEXT_PUBLIC_STREAM_URL;

/**
 * رابط بث الكاميرا: نأخذ الرابط المضبوط ونستبدل معامل src باسم الكاميرا
 * (صفحة go2rtc تستقبل ?src=<camera>). إن لم يكن فيه src نستخدمه كما هو.
 */
export function streamUrlFor(cameraKey?: string): string | null {
  if (!STREAM_BASE) return null;
  if (!cameraKey) return STREAM_BASE;
  try {
    const url = new URL(STREAM_BASE);
    if (url.searchParams.has('src')) url.searchParams.set('src', cameraKey);
    return url.toString();
  } catch {
    return STREAM_BASE;
  }
}

export const STREAM_CONFIGURED = Boolean(STREAM_BASE);

export default function LiveStream({
  cameraKey,
  title,
  badge,
  height,
  deviceCode,
  primary,
  offline,
  children,
}: {
  cameraKey?: string;
  title: string;
  badge?: string;
  /** ارتفاع إطار البث بالبكسل */
  height: number;
  /** معرّف الكاميرا المعروض في الشريط السفلي (مثل RUH-001-CAM1) */
  deviceCode?: string;
  primary?: boolean;
  /** الكاميرا غير متصلة حسب نبض الحافة — لا نُحمّل إطارًا يعرض خطأ go2rtc */
  offline?: boolean;
  /** طبقات فوق البث (مثل مستطيل الكشف) */
  children?: React.ReactNode;
}) {
  const src = offline ? null : streamUrlFor(cameraKey);

  return (
    <div className="bg-[#0D141B] border border-[#26323E] rounded-xl overflow-hidden shadow-[0_3px_14px_rgba(15,41,66,.18)] relative">
      <div className="relative overflow-hidden bg-[#0D141B]" style={{ height }}>
        {src ? (
          <iframe
            src={src}
            title={title}
            className="absolute inset-0 w-full h-full border-0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : offline ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <span className="w-11 h-11 rounded-full border border-[#3A4A59] grid place-items-center text-[#6E8496] text-lg">
                ⃠
              </span>
              <span className="text-[#C6D4CB] text-[13px] font-bold">الكاميرا غير متصلة</span>
              <span className="text-[#7E93A3] text-[11px] leading-relaxed max-w-[260px]">
                لم يصل نبض من هذه الكاميرا — تحقّق من صندوق الحافة.
              </span>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <span className="w-11 h-11 rounded-full border border-[#3A4A59] grid place-items-center text-[#6E8496] text-lg">
                ⛶
              </span>
              <span className="text-[#C6D4CB] text-[13px] font-bold">لم يُضبط مصدر البث الحي</span>
              <span className="text-[#7E93A3] text-[11px] leading-relaxed max-w-[280px]">
                اضبط المتغيّر <span className="font-mono">NEXT_PUBLIC_STREAM_URL</span> برابط صفحة
                go2rtc عبر نفق Cloudflare، ثم أعد تشغيل التطبيق.
              </span>
            </div>
          </div>
        )}

        {/* طبقة الكشف وغيرها */}
        {children}

        {/* بطاقة اسم الكاميرا */}
        <div className="absolute top-3 right-3.5 flex items-center gap-2 pointer-events-none">
          <span className="bg-[#0D141B]/75 backdrop-blur-[4px] text-[#E8F1EA] text-xs font-bold rounded-md px-3 py-[5px] font-kufi">
            {title}
          </span>
          {badge && (
            <span className="bg-saudi/85 text-[#DFF5E8] text-[10px] font-bold rounded-md px-2 py-[5px]">
              {badge}
            </span>
          )}
        </div>

        {/* الشريط السفلي */}
        <div
          className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-3 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg,transparent,rgba(0,0,0,.78))',
            padding: primary ? '26px 14px 10px' : '22px 12px 8px',
          }}
        >
          <span
            className={`flex items-center gap-[7px] font-bold ${
              primary ? 'text-[11.5px]' : 'text-[10.5px]'
            } ${src ? 'text-[#FF6B5E]' : 'text-[#7E93A3]'}`}
          >
            {src && (
              <span
                className="w-2 h-2 rounded-full bg-[#FF6B5E]"
                style={{ animation: 'om-blink 1.1s infinite' }}
              />
            )}
            {src ? 'مباشر · LIVE' : offline ? 'منقطعة' : 'غير متصل'}
          </span>
          {deviceCode && (
            <span
              className={`font-mono font-semibold text-[#9FD4B8] ${
                primary ? 'text-[11px]' : 'text-[10px]'
              }`}
            >
              {deviceCode}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
