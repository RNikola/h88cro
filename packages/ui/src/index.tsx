import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        variant === 'primary' && 'bg-gradient-to-r from-accent-1 to-accent-2 text-white shadow-lg shadow-accent-1/20 hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-panel-2 text-fg hover:bg-panel-3',
        variant === 'ghost' && 'text-muted hover:bg-panel-2 hover:text-fg',
        variant === 'danger' && 'bg-sev-critical/90 text-white hover:bg-sev-critical',
        className,
      )}
    />
  );
}

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx('rounded-xl border border-line bg-panel p-5', className)} />;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';
const SEV_CLASS: Record<Severity, string> = {
  critical: 'bg-sev-critical/15 text-sev-critical ring-sev-critical/30',
  high: 'bg-sev-high/15 text-sev-high ring-sev-high/30',
  medium: 'bg-sev-medium/15 text-sev-medium ring-sev-medium/30',
  low: 'bg-sev-low/15 text-sev-low ring-sev-low/30',
};
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1', SEV_CLASS[severity])}>{severity}</span>;
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-md bg-panel-3 px-2 py-0.5 text-xs text-muted', className)}>{children}</span>;
}

export function scoreColor(score: number) {
  return score >= 85 ? 'var(--color-good)' : score >= 65 ? 'var(--color-sev-medium)' : score >= 45 ? 'var(--color-sev-high)' : 'var(--color-sev-critical)';
}

export function ScoreRing({ score, size = 96, label }: { score: number; size?: number; label?: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Score'} ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-line)" strokeWidth={8} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={scoreColor(score)} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute font-bold text-fg" style={{ fontSize: size / 3.2 }}>{score}</span>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} aria-label="Loading" />;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-panel-3">
      <div className="h-full rounded-full bg-gradient-to-r from-accent-1 to-accent-2 transition-all" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-accent-2 focus:outline-none focus:ring-2 focus:ring-accent-2/30';

export { cx };
