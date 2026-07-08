export default function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`chip bg-gold/15 text-gold border-gold/40 font-medium ${className}`}
      title="بيانات هذا العرض توضيحية وقد تُعاد تهيئتها دوريًا"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      نموذج تجريبي — بيانات توضيحية
    </span>
  );
}
