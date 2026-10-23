/** Kriose mark: a fork into two futures; one is tested (hollow), one is kept (solid). */
export function Logo({ size = 24, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M9 7v18M9 16l9-8M9 16l9 8" stroke="#0B0D12" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="23" cy="24" r="3.2" fill="#0B0D12" />
        <circle cx="23" cy="8" r="2.4" fill="none" stroke="#0B0D12" strokeWidth="1.8" />
      </svg>
      {wordmark && (
        <span className="text-[17px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          kriose
        </span>
      )}
    </span>
  );
}
