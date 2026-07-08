import Link from 'next/link';
import { getOverview } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const s = await getOverview();

  const stats = [
    { label: 'فروع متصلة بالمنظومة', value: s.branches },
    { label: 'عمليات رصد اليوم', value: s.detectionsToday },
    { label: 'حالات نشطة قيد التصحيح', value: s.activeCases },
    { label: 'مؤشر الامتثال العام', value: `${s.complianceRate}%` },
  ];

  const tiles = [
    {
      href: '/ministry',
      title: 'لوحة الوزارة',
      desc: 'غرفة عمليات الامتثال — مؤشرات حية وحالات ميدانية وسلسلة أدلة موقّعة.',
      color: 'from-navy to-navy-700',
      icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01',
    },
    {
      href: '/owner',
      title: 'لوحة المالك',
      desc: 'تنبيهات فورية للمخالفات ومهلة تصحيح ورفع لقطة تصحيح موثّقة لإغلاق الحالة.',
      color: 'from-green to-[#146034]',
      icon: 'M4 7h16M4 12h16M4 17h10',
    },
    {
      href: '/how',
      title: 'كيف تعمل',
      desc: 'قصة المنظومة للمستثمرين وغير التقنيين: الحافة أولًا، وسلسلة الأدلة، وجدول البنود.',
      color: 'from-gold to-[#9a7638]',
      icon: 'M12 3v18M3 12h18',
    },
  ];

  return (
    <div className="bg-mist">
      {/* HERO */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="absolute inset-0 cctv-scanline opacity-40" aria-hidden />
        <div
          className="absolute -top-24 -start-24 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #B8934A, transparent)' }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:py-24 text-center">
          <span className="chip bg-white/10 text-white/80 border-white/20 mb-6">
            <span className="rec-dot" /> رصد آلي مباشر بالذكاء الاصطناعي
          </span>
          <h1 className="font-kufi font-bold text-3xl sm:text-5xl leading-tight mb-4">
            منظومة أبيض للرصد الآلي
            <br className="hidden sm:block" /> للامتثال البلدي
          </h1>
          <p className="text-white/70 text-lg max-w-2xl mx-auto mb-9 leading-relaxed">
            وجّه كاميرا هاتفك نحو موقع العمل، وشاهد الذكاء الاصطناعي يرصد المخالفات لحظيًا،
            يُنشئ حالة، ويوقّع الدليل بسلسلة عهدة رقمية غير قابلة للتلاعب.
          </p>
          <Link href="/live" className="btn btn-primary btn-lg shadow-panel">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 10.5V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3.5l5 4v-11l-5 4Z"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            جرّب الرصد الحي الآن
          </Link>
          <p className="text-white/40 text-sm mt-4">افتح الرابط على هاتفك · لا يتطلب تسجيل دخول</p>
        </div>
      </section>

      {/* STATS STRIP */}
      <section className="mx-auto max-w-7xl px-5 -mt-8 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((st) => (
            <div key={st.label} className="card p-5 text-center">
              <div className="font-kufi font-bold text-3xl text-navy tnum">{st.value}</div>
              <div className="text-navy/60 text-sm mt-1">{st.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* TILES */}
      <section className="mx-auto max-w-7xl px-5 py-14">
        <h2 className="font-kufi font-bold text-2xl text-navy mb-2 text-center">لوحات المنظومة</h2>
        <p className="text-navy/60 text-center mb-8">لكل جهة واجهتها — من الميدان إلى غرفة العمليات</p>
        <div className="grid md:grid-cols-3 gap-5">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`group card overflow-hidden hover:shadow-panel transition`}
            >
              <div className={`bg-gradient-to-l ${t.color} p-6 text-white`}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d={t.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="p-6">
                <h3 className="font-kufi font-bold text-lg text-navy mb-2 group-hover:text-green transition">
                  {t.title}
                </h3>
                <p className="text-navy/60 text-sm leading-relaxed">{t.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
