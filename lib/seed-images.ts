import fs from 'node:fs';
import path from 'node:path';

// وصف المشاهد التسعة المبدئية (seed) — تُطابق public/seed/s1..s9.jpg
export interface SeedScene {
  file: string;
  titleAr: string;
  // البند المتوقع رصده في هذا المشهد (للمحاكاة الحتمية)
  code: string;
  status: 'violation' | 'compliant';
  confidence: number;
  bbox: [number, number, number, number]; // normalized x,y,w,h
  noteAr: string;
  // لون الخلفية للـ placeholder إن غابت الصورة
  tint: string;
}

export const SEED_SCENES: SeedScene[] = [
  {
    file: 's1.jpg', titleAr: 'عامل دون زي موحد', code: '3/8/1/1', status: 'violation',
    confidence: 0.91, bbox: [0.32, 0.18, 0.34, 0.66],
    noteAr: 'عامل يعمل دون كمامة ولا غطاء شعر واضح', tint: '#2A3A5E',
  },
  {
    file: 's2.jpg', titleAr: 'ملابس على الأرض', code: '1/4/1/1', status: 'violation',
    confidence: 0.88, bbox: [0.12, 0.55, 0.6, 0.4],
    noteAr: 'أكوام ملابs ملقاة على الأرضية دون السلال', tint: '#3A2E4E',
  },
  {
    file: 's3.jpg', titleAr: 'مشروب على طاولة العمل', code: '7/8/1/1', status: 'violation',
    confidence: 0.86, bbox: [0.58, 0.34, 0.18, 0.26],
    noteAr: 'كوب مشروب على سطح العمل', tint: '#4E3A2A',
  },
  {
    file: 's4.jpg', titleAr: 'طاولة كي مكشوفة', code: '10/4/1/1', status: 'violation',
    confidence: 0.79, bbox: [0.2, 0.4, 0.6, 0.3],
    noteAr: 'طاولة الكي دون قماش نظيف يغطيها', tint: '#2E4E45',
  },
  {
    file: 's5.jpg', titleAr: 'نفايات متكدسة', code: '1/5/1/1', status: 'violation',
    confidence: 0.83, bbox: [0.05, 0.5, 0.4, 0.45],
    noteAr: 'تكدس أكياس نفايات دون تفريغ', tint: '#3E3A24',
  },
  {
    file: 's6.jpg', titleAr: 'حاوية نفايات مكشوفة', code: '6/5/1/1', status: 'violation',
    confidence: 0.72, bbox: [0.55, 0.42, 0.34, 0.5],
    noteAr: 'حاوية نفايات دون غطاء', tint: '#243E3A',
  },
  {
    file: 's7.jpg', titleAr: 'زي موحد مكتمل', code: 'POS-UNIFORM', status: 'compliant',
    confidence: 0.94, bbox: [0.34, 0.14, 0.32, 0.72],
    noteAr: 'عامل بزي موحد وكمامة وغطاء شعر', tint: '#1B4A3A',
  },
  {
    file: 's8.jpg', titleAr: 'فرز بالسلال المخصصة', code: 'POS-BASKETS', status: 'compliant',
    confidence: 0.9, bbox: [0.1, 0.3, 0.7, 0.6],
    noteAr: 'الملابس مفروزة داخل السلال المخصصة', tint: '#1B4A45',
  },
  {
    file: 's9.jpg', titleAr: 'طفاية حريق ظاهرة', code: 'POS-EXTINGUISHER', status: 'compliant',
    confidence: 0.92, bbox: [0.7, 0.25, 0.16, 0.5],
    noteAr: 'طفاية حريق مثبتة وظاهرة', tint: '#3A2E24',
  },
];

/**
 * يُعيد data-URI للصورة: من public/seed إن وُجدت، وإلا SVG placeholder
 * رمادي يحمل اسم المشهد — لا يفشل أبدًا.
 */
export function loadSceneDataUri(scene: SeedScene): string {
  const p = path.join(process.cwd(), 'public', 'seed', scene.file);
  try {
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      const ext = path.extname(scene.file).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
  } catch {
    // تجاهل → placeholder
  }
  return placeholderDataUri(scene.titleAr, scene.tint);
}

/** SVG رمادي بسيط كـ data-URI (يظهر بدل الصورة المفقودة) */
export function placeholderDataUri(label: string, tint = '#2A3A5E'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="${tint}"/>
  <rect x="0" y="0" width="800" height="600" fill="url(#g)"/>
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0.05"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.45"/>
  </linearGradient></defs>
  <g fill="#E8EDF5" font-family="sans-serif" text-anchor="middle">
    <text x="400" y="300" font-size="30" opacity="0.92" direction="rtl">${escapeXml(label)}</text>
    <text x="400" y="345" font-size="18" opacity="0.6" direction="rtl">مشهد توضيحي — أبيض للرصد</text>
  </g>
  <rect x="20" y="20" width="760" height="560" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
