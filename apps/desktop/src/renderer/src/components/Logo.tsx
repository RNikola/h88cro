export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="h88g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#h88g)" />
      <path d="M13 34V14M13 24h10M23 14v20" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <circle cx="32" cy="19" r="4.5" stroke="#fff" strokeWidth="3" fill="none" />
      <circle cx="32" cy="29.5" r="5" stroke="#fff" strokeWidth="3" fill="none" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={`wordmark font-extrabold tracking-tight ${className ?? ''}`}>H88CRO</span>;
}
