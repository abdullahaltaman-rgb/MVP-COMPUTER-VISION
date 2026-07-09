// ── تنزيل PDF التقرير الأسبوعي الموقّع (كفيل/عمليات/أمانة) ──
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { s3Get, s3Enabled } from '@/lib/s3';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user || !['kafeel', 'ops', 'ministry'].includes(user.role)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  const report = await prisma.report.findUnique({ where: { id: params.id } });
  if (!report) return NextResponse.json({ error: 'التقرير غير موجود' }, { status: 404 });
  // الكفيل يرى تقارير فرعه فقط
  if (user.role === 'kafeel' && user.branchId && report.branchId !== user.branchId) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
  }

  let pdf: Buffer | null = null;
  if (report.s3KeyPdf && s3Enabled()) {
    pdf = await s3Get(report.s3KeyPdf);
  }
  if (!pdf) {
    const b64 = (report.payload as Record<string, unknown>)?.pdfB64;
    if (typeof b64 === 'string') pdf = Buffer.from(b64, 'base64');
  }
  if (!pdf) {
    return NextResponse.json(
      { error: 'PDF غير متوفر — الحمولة الموقّعة متاحة عبر واجهة التقارير', sha256: report.sha256 },
      { status: 404 },
    );
  }

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="abyad-weekly-${report.periodStart.toISOString().slice(0, 10)}.pdf"`,
      'X-Signature-Algo': report.algo,
      'X-Signature': report.signature,
      'X-Sha256': report.sha256,
    },
  });
}
