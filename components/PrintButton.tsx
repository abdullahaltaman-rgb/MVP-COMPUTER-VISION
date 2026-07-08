'use client';

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn btn-navy no-print">
      طباعة / حفظ PDF
    </button>
  );
}
