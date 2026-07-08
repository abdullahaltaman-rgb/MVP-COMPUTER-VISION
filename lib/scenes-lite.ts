// نسخة خفيفة من المشاهد للاستخدام في مكوّنات العميل (بلا fs)
import { ITEM_MAP, POSITIVE_MAP } from './catalog';

export interface SceneLite {
  file: string;
  titleAr: string;
  code: string;
  status: 'violation' | 'compliant';
  itemTitle: string;
}

const RAW: { file: string; titleAr: string; code: string; status: 'violation' | 'compliant' }[] = [
  { file: 's1.jpg', titleAr: 'عامل دون زي موحد', code: '3/8/1/1', status: 'violation' },
  { file: 's2.jpg', titleAr: 'ملابس على الأرض', code: '1/4/1/1', status: 'violation' },
  { file: 's3.jpg', titleAr: 'مشروب على طاولة العمل', code: '7/8/1/1', status: 'violation' },
  { file: 's4.jpg', titleAr: 'طاولة كي مكشوفة', code: '10/4/1/1', status: 'violation' },
  { file: 's5.jpg', titleAr: 'نفايات متكدسة', code: '1/5/1/1', status: 'violation' },
  { file: 's6.jpg', titleAr: 'حاوية نفايات مكشوفة', code: '6/5/1/1', status: 'violation' },
  { file: 's7.jpg', titleAr: 'زي موحد مكتمل', code: 'POS-UNIFORM', status: 'compliant' },
  { file: 's8.jpg', titleAr: 'فرز بالسلال المخصصة', code: 'POS-BASKETS', status: 'compliant' },
  { file: 's9.jpg', titleAr: 'طفاية حريق ظاهرة', code: 'POS-EXTINGUISHER', status: 'compliant' },
];

export const SCENES_LITE: SceneLite[] = RAW.map((s) => ({
  ...s,
  itemTitle: ITEM_MAP[s.code]?.titleAr ?? POSITIVE_MAP[s.code]?.titleAr ?? s.code,
}));
