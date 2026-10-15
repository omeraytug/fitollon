/** Fitollon's mark: a rising pulse line on a blue-to-aqua tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="fitollon-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a78d6" />
          <stop offset="1" stopColor="#1baf7a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#fitollon-logo)" />
      <path
        d="M6 19.5h5l2.5-6 4 10 3-7.5 1.5 3.5H26"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
