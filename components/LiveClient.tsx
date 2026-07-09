'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { SceneLite } from '@/lib/scenes-lite';
import { formatClock } from '@/lib/format';

interface Box {
  code: string;
  titleAr: string;
  status: 'violation' | 'compliant' | 'not_visible';
  confidence: number;
  bbox: [number, number, number, number];
  noteAr: string;
}

interface FeedItem {
  id: string;
  code: string;
  titleAr: string;
  status: string;
  confidence: number;
  at: number;
  caseId?: string;
  refNo?: string;
}

interface DetectResp {
  provider: 'gemini' | 'mock';
  notice: string | null;
  results: Box[];
  threshold: number;
  case: { id: string; refNo: string; itemCode: string } | null;
  reviewQueued: number;
  rate: { remaining: number; limit: number } | null;
}

const SCAN_INTERVAL = 6; // ثوانٍ

export default function LiveClient({ scenes }: { scenes: SceneLite[] }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inflightRef = useRef(false);
  const boxesRef = useRef<Box[]>([]);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mode, setMode] = useState<'init' | 'camera' | 'gallery'>('init');
  const [camError, setCamError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [countdown, setCountdown] = useState(SCAN_INTERVAL);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [provider, setProvider] = useState<'gemini' | 'mock' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rate, setRate] = useState<{ remaining: number; limit: number } | null>(null);
  const [toast, setToast] = useState<{ refNo: string; caseId: string } | null>(null);
  const [clock, setClock] = useState('');
  const [feedOpen, setFeedOpen] = useState(false);

  // ساعة الـ HUD الحية
  useEffect(() => {
    const t = setInterval(() => setClock(formatClock(new Date())), 1000);
    setClock(formatClock(new Date()));
    return () => clearInterval(t);
  }, []);

  // ── الكاميرا ──
  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('المتصفح لا يدعم الوصول إلى الكاميرا');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      // ملاحظة: عنصر الفيديو لا يُركّب إلا بعد mode='camera'، لذا نُرفق البثّ
      // في useEffect بعد التركيب (يتفادى صرف srcObject على ref فارغ).
      setMode('camera');
    } catch (e: any) {
      setCamError(
        e?.name === 'NotAllowedError'
          ? 'تم رفض إذن الكاميرا. يمكنك تجربة المشاهد الجاهزة بالأسفل.'
          : 'تعذّر تشغيل الكاميرا على هذا الجهاز. جرّب المشاهد الجاهزة بالأسفل.',
      );
      setMode('gallery');
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setContinuous(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // إرفاق بثّ الكاميرا بعد تركيب عنصر الفيديو (mode='camera')
  useEffect(() => {
    if (mode !== 'camera') return;
    const v = videoRef.current;
    const stream = streamRef.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    v.muted = true; // ضبط الكتم على مستوى الخاصية (خلل React مع muted) لتفعيل التشغيل التلقائي على iOS
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', 'true');
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();
    v.addEventListener('loadedmetadata', tryPlay);
    v.addEventListener('canplay', tryPlay);
    return () => {
      v.removeEventListener('loadedmetadata', tryPlay);
      v.removeEventListener('canplay', tryPlay);
    };
  }, [mode]);

  // ── رسم الصناديق (خرائط contain) ──
  const draw = useCallback(() => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // منطقة العرض (contain) للفيديو
    let dw = cw, dh = ch, ox = 0, oy = 0;
    const vw = video?.videoWidth || 16;
    const vh = video?.videoHeight || 9;
    if (vw && vh) {
      const scale = Math.min(cw / vw, ch / vh);
      dw = vw * scale; dh = vh * scale;
      ox = (cw - dw) / 2; oy = (ch - dh) / 2;
    }

    for (const b of boxesRef.current) {
      const isViol = b.status === 'violation';
      const color = isViol ? '#CE4A3C' : '#1B7A43';
      const x = ox + b.bbox[0] * dw;
      const y = oy + b.bbox[1] * dh;
      const w = b.bbox[2] * dw;
      const h = b.bbox[3] * dh;

      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.001)';
      ctx.fillRect(x, y, w, h);

      // شارة الزاوية
      const label = isViol ? `بند ${b.code}` : b.titleAr;
      const pct = `${Math.round(b.confidence * 100)}%`;
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.direction = 'rtl';
      const text = `${label} · ${pct}`;
      const tw = ctx.measureText(text).width + 16;
      const ly = Math.max(oy + 2, y - 24);
      ctx.fillStyle = color;
      ctx.fillRect(x, ly, tw, 22);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillText(text, x + tw - 8, ly + 12);
    }
  }, []);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  // ── الفحص ──
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const maxW = 720;
    const scale = Math.min(1, maxW / video.videoWidth);
    const cw = Math.round(video.videoWidth * scale);
    const ch = Math.round(video.videoHeight * scale);
    const off = document.createElement('canvas');
    off.width = cw; off.height = ch;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, cw, ch);
    return off.toDataURL('image/jpeg', 0.7);
  }, []);

  const runScan = useCallback(
    async (opts: { source: 'webcam' | 'seed'; seedFile?: string }) => {
      if (inflightRef.current) return;
      let imageB64: string | undefined;
      if (opts.source === 'webcam') {
        imageB64 = captureFrame() || undefined;
        if (!imageB64) return;
      }
      inflightRef.current = true;
      setScanning(true);
      try {
        const res = await fetch('/api/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageB64: imageB64 ?? '',
            source: opts.source,
            seedFile: opts.seedFile,
            cameraName: opts.source === 'seed' ? `مشهد ${opts.seedFile}` : 'كاميرا العرض الحي',
          }),
        });
        const data: DetectResp = await res.json();
        if ((data as any).error) throw new Error((data as any).error);

        setProvider(data.provider);
        setNotice(data.notice);
        if (data.rate) setRate(data.rate);

        boxesRef.current = data.results || [];
        draw();
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
        clearTimerRef.current = setTimeout(() => {
          boxesRef.current = [];
          draw();
        }, 5000);

        // تحديث بث الأحداث
        const now = Date.now();
        const newItems: FeedItem[] = (data.results || []).map((r, i) => ({
          id: `${now}-${i}`,
          code: r.code,
          titleAr: r.titleAr,
          status: r.status,
          confidence: r.confidence,
          at: now,
          caseId: data.case && data.case.itemCode === r.code ? data.case.id : undefined,
          refNo: data.case && data.case.itemCode === r.code ? data.case.refNo : undefined,
        }));
        if (newItems.length) {
          setFeed((f) => [...newItems, ...f].slice(0, 40));
          setFeedOpen(true);
        }

        if (data.case) {
          setToast({ refNo: data.case.refNo, caseId: data.case.id });
          setTimeout(() => setToast(null), 9000);
        }
      } catch (e) {
        setNotice('تعذّر إجراء الفحص — حاول مجددًا.');
      } finally {
        inflightRef.current = false;
        setScanning(false);
      }
    },
    [captureFrame, draw],
  );

  // ── الرصد المستمر ──
  useEffect(() => {
    if (!continuous || mode !== 'camera') return;
    setCountdown(SCAN_INTERVAL);
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          runScan({ source: 'webcam' });
          return SCAN_INTERVAL;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [continuous, mode, runScan]);

  const statusColor = (s: string) => (s === 'violation' ? 'text-red' : s === 'compliant' ? 'text-green' : 'text-white/60');

  return (
    <div className="min-h-screen bg-[#070c16] text-white flex flex-col">
      {/* HUD */}
      <div className="flex items-center justify-between px-3 h-11 bg-black/60 border-b border-white/10 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="rec-dot" />
          <span className="font-kufi font-bold text-sm tracking-wide">ABYAD-VISION</span>
          <span className="text-white/40 text-xs">· بث تجريبي</span>
        </div>
        <div className="flex items-center gap-3">
          {provider && (
            <span className={`chip text-[11px] ${provider === 'gemini' ? 'bg-green/20 text-green border-green/30' : 'bg-amber/20 text-amber border-amber/30'}`}>
              {provider === 'gemini' ? 'محرّك Gemini' : 'محرّك محاكاة'}
            </span>
          )}
          <span className="tnum text-sm text-white/80 countdown">{clock}</span>
          <Link href="/" className="text-white/50 text-xs hover:text-white">خروج ✕</Link>
        </div>
      </div>

      {/* الإطار الرئيسي */}
      <div className="relative flex-1 cctv-frame overflow-hidden">
        <div className="absolute inset-0 cctv-scanline pointer-events-none z-10" />
        {/* زوايا الإطار */}
        <Corner className="top-3 start-3 border-t-2 border-s-2" />
        <Corner className="top-3 end-3 border-t-2 border-e-2" />
        <Corner className="bottom-3 start-3 border-b-2 border-s-2" />
        <Corner className="bottom-3 end-3 border-b-2 border-e-2" />

        {mode === 'camera' && (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              onClick={() => videoRef.current?.play().catch(() => {})}
              className="absolute inset-0 w-full h-full object-contain"
            />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full z-20" />
            {scanning && (
              <div className="absolute top-1/2 inset-x-0 h-0.5 bg-green/70 shadow-[0_0_12px_2px_rgba(27,122,67,0.7)] z-20 animate-pulse" />
            )}
          </>
        )}

        {mode !== 'camera' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 overflow-auto">
            {mode === 'init' ? (
              <div className="text-center max-w-md">
                <div className="grid place-items-center w-20 h-20 rounded-2xl bg-white/10 mx-auto mb-5">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                    <path d="M15 10.5V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3.5l5 4v-11l-5 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h1 className="font-kufi font-bold text-2xl mb-2">الرصد الحي بالذكاء الاصطناعي</h1>
                <p className="text-white/60 mb-6 leading-relaxed">
                  وجّه كاميرا هاتفك الخلفية نحو موقع العمل. سيرصد النظام المخالفات لحظيًا
                  ويوقّع الأدلة تلقائيًا. جرّبه الآن.
                </p>
                <button onClick={startCamera} className="btn btn-primary btn-lg w-full">
                  جرّب الرصد الحي
                </button>
                <button onClick={() => setMode('gallery')} className="btn btn-ghost mt-3 w-full text-white border-white/20">
                  أو جرّب مشهدًا جاهزًا
                </button>
              </div>
            ) : (
              <GalleryFallback scenes={scenes} camError={camError} onScan={(f) => runScan({ source: 'seed', seedFile: f })} onRetry={startCamera} scanning={scanning} />
            )}
          </div>
        )}

        {/* بث الأحداث المنزلق */}
        <EventFeed items={feed} open={feedOpen} onToggle={() => setFeedOpen((o) => !o)} statusColor={statusColor} />
      </div>

      {/* شريط التحكم */}
      {mode === 'camera' && (
        <div className="bg-black/70 border-t border-white/10 p-3">
          {notice && <p className="text-amber text-xs text-center mb-2">{notice}</p>}
          {rate && (
            <p className="text-white/40 text-[11px] text-center mb-2 tnum">
              الفحوص المتبقية عبر Gemini لهذه الساعة: {rate.remaining}/{rate.limit}
            </p>
          )}
          <div className="flex items-center gap-3 max-w-lg mx-auto">
            <button onClick={() => runScan({ source: 'webcam' })} disabled={scanning} className="btn btn-primary flex-1 disabled:opacity-60">
              {scanning ? 'جارٍ الفحص…' : 'افحص الآن'}
            </button>
            <button
              onClick={() => setContinuous((c) => !c)}
              className={`btn flex-1 ${continuous ? 'btn-red' : 'btn-ghost text-white border-white/20'}`}
            >
              {continuous ? `الرصد المستمر · ${countdown}` : 'الرصد المستمر'}
            </button>
          </div>
        </div>
      )}

      {/* توست إنشاء الحالة */}
      {toast && (
        <div className="toast-wrap">
          <Link
            href={`/case/${toast.caseId}`}
            className="card bg-white text-navy p-4 pe-6 shadow-panel flex items-center gap-3 animate-slide-in max-w-sm"
          >
            <span className="grid place-items-center w-10 h-10 rounded-full bg-green/15 text-green shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <div className="text-sm leading-tight">
              <div className="font-bold">تم توليد حالة وتوقيع الدليل</div>
              <div className="text-navy/60 tnum">رقم {toast.refNo} — اضغط لفتح الحالة ↩</div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return <span className={`absolute w-6 h-6 border-white/30 z-10 pointer-events-none ${className}`} />;
}

function GalleryFallback({
  scenes, camError, onScan, onRetry, scanning,
}: {
  scenes: SceneLite[];
  camError: string | null;
  onScan: (file: string) => void;
  onRetry: () => void;
  scanning: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadName(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = String(reader.result);
      await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageB64: dataUri, source: 'upload', cameraName: 'صورة مرفوعة' }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.case) window.location.href = `/case/${d.case.id}`;
        });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="w-full max-w-2xl">
      {camError && (
        <div className="chip bg-amber/15 text-amber border-amber/30 mb-4 mx-auto block w-fit text-center">{camError}</div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-kufi font-bold text-lg">مشاهد جاهزة للتجربة</h2>
        <button onClick={onRetry} className="text-green text-sm hover:underline">↻ تفعيل الكاميرا</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {scenes.map((s) => (
          <button
            key={s.file}
            onClick={() => onScan(s.file)}
            disabled={scanning}
            className="group relative rounded-xl overflow-hidden border border-white/10 aspect-[4/3] disabled:opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/seed/${s.file}`} alt={s.titleAr} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-2 text-right">
              <span className={`chip text-[10px] mb-1 ${s.status === 'violation' ? 'bg-red/80 text-white' : 'bg-green/80 text-white'}`}>
                {s.status === 'violation' ? `بند ${s.code}` : 'مطابق'}
              </span>
              <div className="text-white text-xs font-medium leading-tight">{s.titleAr}</div>
            </div>
            <span className="absolute top-2 start-2 chip bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition">افحص هذا المشهد</span>
          </button>
        ))}
      </div>
      <div className="mt-4 text-center">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        <button onClick={() => fileRef.current?.click()} className="btn btn-ghost text-white border-white/20">
          رفع صورة من الجهاز
        </button>
        {uploadName && <p className="text-white/40 text-xs mt-2">{uploadName} — جارٍ الفحص…</p>}
      </div>
    </div>
  );
}

function EventFeed({
  items, open, onToggle, statusColor,
}: {
  items: FeedItem[];
  open: boolean;
  onToggle: () => void;
  statusColor: (s: string) => string;
}) {
  return (
    <div className={`absolute top-0 bottom-0 end-0 z-30 flex transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-[calc(100%-2.5rem)]'}`}>
      <button onClick={onToggle} className="w-10 bg-black/70 border-s border-white/10 flex flex-col items-center justify-center gap-2 text-white/70">
        <span className="[writing-mode:vertical-rl] text-xs font-kufi">بث الأحداث</span>
        {items.length > 0 && <span className="chip bg-red text-white text-[10px] px-1.5">{items.length}</span>}
      </button>
      <div className="w-64 sm:w-72 bg-black/80 backdrop-blur border-s border-white/10 overflow-y-auto thin-scroll p-2">
        {items.length === 0 ? (
          <p className="text-white/40 text-xs text-center mt-6">لا أحداث بعد — ابدأ الفحص</p>
        ) : (
          items.map((it) => (
            <div key={it.id} className="animate-slide-in mb-2 rounded-lg bg-white/5 border border-white/10 p-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${statusColor(it.status)}`}>
                  {it.status === 'violation' ? `بند ${it.code}` : it.status === 'compliant' ? 'مطابق ✓' : it.code}
                </span>
                <span className="text-white/40 text-[10px] tnum">{Math.round(it.confidence * 100)}%</span>
              </div>
              <div className="text-white/70 text-[11px] mt-1 leading-tight">{it.titleAr}</div>
              {it.refNo && (
                <Link href={`/case/${it.caseId}`} className="text-green text-[11px] mt-1 inline-block hover:underline tnum">
                  حالة {it.refNo} ↩
                </Link>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
