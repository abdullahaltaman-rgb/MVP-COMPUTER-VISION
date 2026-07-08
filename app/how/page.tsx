import Link from 'next/link';
import { ITEMS, POSITIVES } from '@/lib/catalog';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'كيف تعمل · أبيض' };

const STEPS = [
  { n: 1, title: 'التقاط عند الحافة', desc: 'كاميرا في موقع العمل (أو هاتف المفتّش) تلتقط الإطار محليًا دون رفع بثّ مستمر.', icon: 'M15 10.5V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3.5l5 4v-11l-5 4Z' },
  { n: 2, title: 'تحليل بالذكاء الاصطناعي', desc: 'نموذج رؤية يُقيّم الإطار مقابل كتالوج البنود المغلق ويُعيد المخالفات ودرجات الثقة.', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 6v4l3 3' },
  { n: 3, title: 'بوّابة القرار', desc: 'ثقة ≥ 85% تُصدر حالة آليًا · 60–84% تذهب للمراجعة البشرية · أقل تُهمَل.', icon: 'M3 6h18M3 12h18M3 18h12' },
  { n: 4, title: 'توقيع الدليل', desc: 'يُوقَّع الإطار ببصمة sha256 مرتبطة بالبصمة السابقة — سلسلة عهدة غير قابلة للتلاعب.', icon: 'M12 2 4 6v6c0 5 3.5 7.5 8 10 4.5-2.5 8-5 8-10V6l-8-4Z' },
  { n: 5, title: 'إشعار ومهلة تصحيح', desc: 'يُبلَّغ المالك فورًا وتبدأ مهلة 48 ساعة قابلة للعدّ التنازلي قبل التصعيد.', icon: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z' },
  { n: 6, title: 'إغلاق موثّق', desc: 'يرفع المالك لقطة تصحيح تُوقَّع خضراء في السلسلة، فتُغلق الحالة قبل التصعيد.', icon: 'M20 6 9 17l-5-5' },
];

export default function HowPage() {
  return (
    <div className="bg-mist">
      {/* مقدمة */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-5xl px-5 py-14 text-center">
          <span className="chip bg-white/10 text-white/80 border-white/20 mb-4">قصة المنظومة</span>
          <h1 className="font-kufi font-bold text-3xl sm:text-4xl mb-4">كيف تعمل منظومة أبيض</h1>
          <p className="text-white/70 max-w-2xl mx-auto leading-relaxed">
            من لحظة الالتقاط إلى الدليل الموقّع — منظومة رصد امتثال تُحوّل الرقابة الميدانية
            من جولات متباعدة إلى رصد آلي مستمر عادل وقابل للتدقيق.
          </p>
        </div>
      </section>

      {/* التدفق 6 خطوات */}
      <section className="mx-auto max-w-5xl px-5 py-12">
        <h2 className="font-kufi font-bold text-2xl text-navy text-center mb-8">التدفّق في ٦ خطوات</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-green/10 text-green">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d={s.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <span className="font-kufi font-bold text-3xl text-navy/15 tnum">{s.n}</span>
              </div>
              <h3 className="font-kufi font-bold text-navy mb-1">{s.title}</h3>
              <p className="text-navy/60 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* الحافة أولًا + سلسلة الأدلة */}
      <section className="mx-auto max-w-5xl px-5 pb-12 grid md:grid-cols-2 gap-4">
        <div className="card p-6">
          <h3 className="font-kufi font-bold text-navy text-lg mb-2">الحافة أولًا</h3>
          <p className="text-navy/65 text-sm leading-relaxed">
            تتم المعالجة قدر الإمكان عند مصدر الصورة (الهاتف/الكاميرا)، فتُرسل الأدلة المهمة فقط
            لا البثّ الكامل. هذا يحفظ الخصوصية، يقلّل التكلفة والنطاق، ويجعل النظام قابلًا للتوسّع
            على آلاف الفروع دون بنية مركزية ثقيلة.
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-kufi font-bold text-navy text-lg mb-2">سلسلة الأدلة</h3>
          <p className="text-navy/65 text-sm leading-relaxed mb-3">
            كل دليل يحمل بصمة <span dir="ltr" className="font-mono text-xs">sha256(bytes + prevHash)</span>
            مرتبطة بما قبله. تعديل بايت واحد في أي صورة يكسر التحقق فورًا ويكشف موضع العبث —
            ما يمنح الغرامة سندًا رقميًا لا يُنكَر.
          </p>
          <Link href="/ops" className="text-green text-sm hover:underline">جرّب «محاكاة العبث» في غرفة العمليات ↩</Link>
        </div>
      </section>

      {/* جدول البنود */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <h2 className="font-kufi font-bold text-2xl text-navy text-center mb-6">كتالوج البنود</h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-navy/50 text-xs border-b border-navy/10 bg-mist">
                  <th className="text-right font-medium px-4 py-2.5">البند</th>
                  <th className="text-right font-medium px-4 py-2.5">الوصف</th>
                  <th className="text-right font-medium px-4 py-2.5">الغرامة</th>
                  <th className="text-right font-medium px-4 py-2.5">النمط</th>
                </tr>
              </thead>
              <tbody>
                {ITEMS.map((it) => (
                  <tr key={it.code} className="border-b border-navy/5">
                    <td className="px-4 py-2.5 tnum font-bold text-navy whitespace-nowrap">{it.code}</td>
                    <td className="px-4 py-2.5 text-navy/70">{it.titleAr}</td>
                    <td className="px-4 py-2.5 text-navy/70 whitespace-nowrap">{formatMoney(it.fineAmount)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`chip text-[11px] ${it.mode === 'live' ? 'bg-green/15 text-green border-green/30' : 'bg-navy/10 text-navy border-navy/20'}`}>
                        {it.mode === 'live' ? 'رصد حي' : 'مجدول'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 card p-4">
          <h3 className="font-kufi font-bold text-navy mb-2 text-sm">مؤشرات إيجابية (خضراء)</h3>
          <div className="flex flex-wrap gap-2">
            {POSITIVES.map((p) => (
              <span key={p.code} className="chip bg-green/10 text-green border-green/30">{p.titleAr}</span>
            ))}
          </div>
        </div>
        <div className="text-center mt-8">
          <Link href="/live" className="btn btn-primary btn-lg">جرّب الرصد الحي الآن</Link>
        </div>
      </section>
    </div>
  );
}
