import { getMinistryData } from '@/lib/queries';
import { formatDate, formatDateTime, STATUS_AR } from '@/lib/format';
import PrintButton from '@/components/PrintButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'التقرير الشهري الموقّع · أبيض' };

export default async function MonthlyReport() {
  const { overview: o, cases, chain } = await getMinistryData();
  const now = new Date();

  const kpis = [
    ['إجمالي الحالات', o.totalCases],
    ['حالات نشطة', o.activeCases],
    ['ضمن مهلة التصحيح', o.inGrace],
    ['صُححت', o.correctedCases],
    ['مُصعّدة', o.escalatedCases],
    ['صُححت قبل التصعيد', `${o.correctedBeforeEscalationPct}%`],
    ['متوسط زمن التصحيح', `${o.avgCorrectionHours} ساعة`],
    ['مؤشر الامتثال العام', `${o.complianceRate}%`],
  ] as const;

  return (
    <div className="bg-navy/5 min-h-screen py-6">
      <div className="mx-auto max-w-3xl px-4 mb-4 flex items-center justify-between no-print">
        <span className="text-navy/60 text-sm">معاينة التقرير — جاهز للطباعة على A4</span>
        <PrintButton />
      </div>

      <div className="print-a4 bg-white mx-auto max-w-3xl shadow-panel p-10" style={{ minHeight: '297mm' }}>
        {/* ترويسة رسمية */}
        <div className="flex items-center justify-between border-b-2 border-navy pb-4 mb-6">
          <div>
            <div className="font-kufi font-bold text-xl text-navy">التقرير الشهري لامتثال المغاسل</div>
            <div className="text-navy/60 text-sm">أمانة منطقة الرياض · قطاع المغاسل</div>
          </div>
          <div className="text-left">
            <div className="grid place-items-center w-12 h-12 rounded-lg bg-navy text-gold font-kufi font-bold text-2xl mb-1 ms-auto">أ</div>
            <div className="text-navy/50 text-xs tnum">{formatDate(now)}</div>
          </div>
        </div>

        <div className="chip bg-gold/15 text-gold border-gold/40 mb-6">نموذج تجريبي — بيانات توضيحية</div>

        {/* المؤشرات */}
        <h2 className="font-kufi font-bold text-navy mb-3">المؤشرات العامة</h2>
        <div className="grid grid-cols-4 gap-3 mb-8">
          {kpis.map(([label, value]) => (
            <div key={label} className="border border-navy/15 rounded-lg p-3 text-center">
              <div className="font-kufi font-bold text-lg text-navy tnum">{value}</div>
              <div className="text-navy/55 text-[11px] leading-tight mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* جدول الحالات */}
        <h2 className="font-kufi font-bold text-navy mb-3">سجل الحالات</h2>
        <table className="w-full text-xs border border-navy/15 mb-8">
          <thead>
            <tr className="bg-navy/5 text-navy/60">
              <th className="text-right font-medium px-2 py-1.5 border-b border-navy/15">الرقم</th>
              <th className="text-right font-medium px-2 py-1.5 border-b border-navy/15">المغسلة</th>
              <th className="text-right font-medium px-2 py-1.5 border-b border-navy/15">البند</th>
              <th className="text-right font-medium px-2 py-1.5 border-b border-navy/15">وقت الرصد</th>
              <th className="text-right font-medium px-2 py-1.5 border-b border-navy/15">الثقة</th>
              <th className="text-right font-medium px-2 py-1.5 border-b border-navy/15">الحالة</th>
              <th className="text-right font-medium px-2 py-1.5 border-b border-navy/15">الغرامة</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-1.5 border-b border-navy/8 tnum">{c.refNo}</td>
                <td className="px-2 py-1.5 border-b border-navy/8">{c.branchName}</td>
                <td className="px-2 py-1.5 border-b border-navy/8 tnum">{c.itemCode}</td>
                <td className="px-2 py-1.5 border-b border-navy/8 tnum">{formatDateTime(c.detectedAt)}</td>
                <td className="px-2 py-1.5 border-b border-navy/8 tnum">{Math.round(c.confidence * 100)}%</td>
                <td className="px-2 py-1.5 border-b border-navy/8">{STATUS_AR[c.status] ?? c.status}</td>
                <td className="px-2 py-1.5 border-b border-navy/8 tnum">{c.potentialFine.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* بصمة السلسلة */}
        <div className="border-2 border-navy/20 rounded-lg p-4 bg-navy/5">
          <div className="font-kufi font-bold text-navy text-sm mb-1">بصمة جذر سلسلة العهدة الرقمية</div>
          <div className="font-mono text-xs text-navy break-all tnum" dir="ltr">{chain.rootHash}</div>
          <div className="text-navy/55 text-[11px] mt-2 tnum">
            عدد الأدلة الموقّعة: {chain.index + 1} · وقت التصدير: {formatDateTime(now)}
          </div>
        </div>

        <div className="text-center text-navy/40 text-[10px] mt-8 pt-4 border-t border-navy/10">
          هذا التقرير مُوقّع رقميًا عبر سلسلة عهدة sha256 · منظومة أبيض للرصد الآلي · نموذج تجريبي
        </div>
      </div>
    </div>
  );
}
