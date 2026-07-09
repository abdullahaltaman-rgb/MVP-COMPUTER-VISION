// ── توليد PDF عربي (pdfkit + Noto Arabic) للتقرير الأسبوعي الموقّع ──
// pdfkit يعتمد fontkit لتشكيل الحروف العربية؛ النصوص تُمرَّر كجمل عربية صافية
// والأرقام تُكتب في خلايا مستقلة لتفادي مشاكل اتجاه النص المختلط.
import path from 'node:path';
import fs from 'node:fs';

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const FONT_SANS = path.join(FONT_DIR, 'NotoSansArabic-Var.ttf');
const FONT_KUFI = path.join(FONT_DIR, 'NotoKufiArabic-Var.ttf');

export function pdfFontsAvailable(): boolean {
  return fs.existsSync(FONT_SANS) && fs.existsSync(FONT_KUFI);
}

// ── إعادة الترتيب البصري للنص العربي ──
// fontkit يشكّل الحروف داخل الكلمة لكن pdfkit يرصف الكلمات يسارًا→يمينًا؛
// نعكس ترتيب الكلمات (مع الحفاظ على ترتيب المقاطع اللاتينية/الأرقام داخليًا)
// ونعكس الأقواس كي تُقرأ الجملة يمينًا→يسارًا بشكل صحيح.
const LTR_TOKEN = /^[\u0020-\u00FF\u2010-\u2027%]+$/;

function mirrorBrackets(t: string): string {
  return t.replace(/[()\[\]]/g, (c) =>
    c === '(' ? ')' : c === ')' ? '(' : c === '[' ? ']' : '[',
  );
}

// المسافة العادية بين كلمتين عربيتين تُسقط اتجاه السطر في pdfkit؛ الربط بمسافة
// غير قاطعة (NBSP) يجعل fontkit يرصف السطر كاملًا كامتداد RTL واحد بترتيب صحيح.
// المقاطع اللاتينية/الأرقام تُعكس محارفها هنا فيُعيدها عكسُ الامتداد الكلي
// إلى ترتيبها الصحيح (تحقق بصري بعيّنات مُصيَّرة).
const NBSP = '\u00A0';

export function rtl(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((t) =>
      LTR_TOKEN.test(t) ? [...t].reverse().join('') : mirrorBrackets(t),
    )
    .join(NBSP);
}

/** يقصّ النص الطويل كي لا يلتف على سطرين (الالتفاف يكسر الترتيب البصري) */
function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export interface WeeklyPdfInput {
  branchNameAr: string;
  branchCode: string;
  licenseNo: string;
  periodStartLabel: string;
  periodEndLabel: string;
  stats: {
    totalEvents: number;
    casesOpened: number;
    casesCorrected: number;
    casesEscalated: number;
    openCases: number;
    complianceScore: number;
  };
  perItem: { code: string; titleAr: string; opened: number; corrected: number; escalated: number }[];
  escalations: { refNo: string; itemCode: string; titleAr: string; reason: string }[];
  chainRoot: string;
  generatedAtLabel: string;
}

/** يولّد PDF التقرير الأسبوعي ويعيده Buffer (يُوقَّع لاحقًا على البايتات) */
export async function generateWeeklyPdf(input: WeeklyPdfInput): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    font: FONT_SANS,
    info: {
      Title: `تقرير أسبوعي — ${input.branchNameAr}`,
      Author: 'منظومة أبيض فيجن v1.0',
    },
  });
  doc.registerFont('sans', FONT_SANS);
  doc.registerFont('kufi', FONT_KUFI);

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const W = doc.page.width - 96;
  const navy = '#16294A';
  const green = '#1B7A43';
  const red = '#CE4A3C';

  // الترويسة
  doc.rect(0, 0, doc.page.width, 90).fill(navy);
  doc.fill('#FFFFFF').font('kufi').fontSize(18);
  doc.text(rtl('التقرير الأسبوعي للامتثال — منظومة أبيض فيجن'), 48, 26, { width: W, align: 'right' });
  doc.font('sans').fontSize(10).fillOpacity(0.85);
  doc.text(rtl(`${input.branchNameAr} · رخصة ${input.licenseNo} · ${input.branchCode}`), 48, 56, {
    width: W,
    align: 'right',
  });
  doc.fillOpacity(1);

  doc.fill(navy).font('sans').fontSize(10);
  doc.text(rtl(`الفترة: ${input.periodStartLabel} — ${input.periodEndLabel}`), 48, 106, {
    width: W,
    align: 'right',
  });

  // بطاقات الإحصاءات
  const stats = [
    { label: 'مؤشر الامتثال', value: `${input.stats.complianceScore}%`, color: green },
    { label: 'حالات فُتحت', value: String(input.stats.casesOpened), color: navy },
    { label: 'صُححت', value: String(input.stats.casesCorrected), color: green },
    { label: 'تصعيدات', value: String(input.stats.casesEscalated), color: red },
  ];
  const cardW = (W - 3 * 10) / 4;
  let y = 132;
  stats.forEach((s, i) => {
    // الترتيب من اليمين إلى اليسار
    const x = 48 + (3 - i) * (cardW + 10);
    doc.roundedRect(x, y, cardW, 58, 8).lineWidth(0.8).stroke('#D6DEE9');
    doc.font('kufi').fontSize(16).fill(s.color).text(s.value, x, y + 10, {
      width: cardW,
      align: 'center',
    });
    doc.font('sans').fontSize(8.5).fill('#5A6B85').text(rtl(s.label), x, y + 36, {
      width: cardW,
      align: 'center',
    });
  });

  // جدول البنود
  y += 84;
  doc.font('kufi').fontSize(12).fill(navy).text(rtl('تفصيل البنود الخمسة (§5)'), 48, y, {
    width: W,
    align: 'right',
  });
  y += 24;
  const cols = [
    { w: 60, label: 'تصعيدات' },
    { w: 60, label: 'صُححت' },
    { w: 60, label: 'فُتحت' },
    { w: W - 180 - 80, label: 'البند' },
    { w: 80, label: 'الرمز' },
  ];
  let x = 48;
  doc.rect(48, y, W, 22).fill('#F0F3F7');
  doc.font('sans').fontSize(9).fill(navy);
  for (const c of cols) {
    doc.text(rtl(c.label), x + 4, y + 6, { width: c.w - 8, align: 'center' });
    x += c.w;
  }
  y += 22;
  for (const item of input.perItem) {
    const vals = [
      String(item.escalated),
      String(item.corrected),
      String(item.opened),
      rtl(clip(item.titleAr, 62)),
      item.code,
    ];
    const rowH = 26;
    x = 48;
    doc.rect(48, y, W, rowH).lineWidth(0.5).stroke('#E3E9F1');
    doc.font('sans').fontSize(8.5).fill(navy);
    vals.forEach((v, i) => {
      const align = i === 3 ? 'right' : 'center';
      doc.text(v, x + 4, y + 8, { width: cols[i].w - 8, align, height: rowH, ellipsis: true });
      x += cols[i].w;
    });
    y += rowH;
  }

  // التصعيدات
  y += 18;
  doc.font('kufi').fontSize(12).fill(red).text(rtl('التصعيدات (تتطلب انتباه الكفيل)'), 48, y, {
    width: W,
    align: 'right',
  });
  y += 22;
  doc.font('sans').fontSize(9).fill(navy);
  if (input.escalations.length === 0) {
    doc.fill(green).text(rtl('لا توجد تصعيدات خلال هذه الفترة'), 48, y, { width: W, align: 'right' });
    y += 18;
  } else {
    for (const e of input.escalations) {
      // يبدأ السطر بكلمة عربية — fontkit يستدل على اتجاه الامتداد من أول محرف قوي
      doc.fill(navy).text(
        rtl(clip(`الحالة ${e.refNo} · بند ${e.itemCode} — ${e.titleAr} (${e.reason})`, 88)),
        48,
        y,
        { width: W, align: 'right' },
      );
      y += 16;
      if (y > doc.page.height - 140) {
        doc.addPage();
        y = 60;
      }
    }
  }

  // التذييل: بصمة السلسلة + التوقيع
  const fy = doc.page.height - 100;
  doc.moveTo(48, fy).lineTo(48 + W, fy).lineWidth(0.8).stroke('#D6DEE9');
  doc.font('sans').fontSize(8).fill('#5A6B85');
  doc.text(rtl('بصمة جذر سلسلة العهدة وقت الإصدار:'), 48, fy + 10, { width: W, align: 'right' });
  doc.font('sans').fontSize(7.5).fill(navy);
  doc.text(input.chainRoot, 48, fy + 24, { width: W, align: 'left' });
  doc.font('sans').fontSize(8).fill('#5A6B85');
  doc.text(
    rtl(`أُصدر آليًا في ${input.generatedAtLabel} — هذا التقرير موقّع رقميًا؛ التحقق عبر /api/reports`),
    48,
    fy + 40,
    { width: W, align: 'right' },
  );

  doc.end();
  return done;
}
