import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center px-5">
      <div className="text-center">
        <div className="font-kufi font-bold text-6xl text-navy/15 mb-3 tnum">404</div>
        <h1 className="font-kufi font-bold text-xl text-navy mb-2">الصفحة غير موجودة</h1>
        <p className="text-navy/55 mb-6">قد تكون الحالة أُعيد تعيينها ضمن تهيئة بيانات العرض.</p>
        <Link href="/" className="btn btn-primary">العودة إلى الصفحة الرئيسية</Link>
      </div>
    </div>
  );
}
