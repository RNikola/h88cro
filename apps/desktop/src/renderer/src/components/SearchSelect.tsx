import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cx, inputClass } from '@h88cro/ui';

export type SearchOption = { value: string; label: string; hint?: string; badge?: string; keywords?: string };

/** A select with a search box. Keyboard: type to filter, ↑/↓ to move, Enter to pick, Esc to close. */
export function SearchSelect({
  value,
  options,
  onChange,
  placeholder = 'Search…',
  ariaLabel,
}: {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    if (!q) return options;
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    return options.filter((o) => norm(`${o.label} ${o.hint ?? ''} ${o.value} ${o.keywords ?? ''}`).includes(q));
  }, [options, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (o: SearchOption | undefined) => {
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={root} className="relative">
      <button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} className={cx(inputClass, 'flex items-center justify-between text-left')} onClick={() => setOpen((o) => !o)}>
        <span className="truncate">
          {selected?.label ?? 'Choose…'}
          {selected?.hint && <span className="ml-2 text-muted">{selected.hint}</span>}
        </span>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-panel shadow-xl">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search size={14} className="text-muted" />
            <input
              autoFocus
              className="w-full bg-transparent py-2 text-sm outline-none"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, filtered.length - 1)));
                else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
                else if (e.key === 'Enter') (e.preventDefault(), pick(filtered[active]));
                else if (e.key === 'Escape') setOpen(false);
              }}
            />
          </div>
          <ul ref={list} role="listbox" className="max-h-64 overflow-y-auto py-1 text-sm">
            {filtered.length === 0 && <li className="px-3 py-2 text-muted">No match</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                className={cx('flex cursor-pointer items-center gap-2 px-3 py-1.5', i === active && 'bg-accent-1/15')}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => (e.preventDefault(), pick(o))}
              >
                <span className="w-4">{o.value === value && <Check size={14} />}</span>
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="truncate text-muted">{o.hint}</span>}
                {o.badge && <span className="ml-auto shrink-0 rounded bg-accent-1/15 px-1.5 text-[10px] uppercase text-accent-2">{o.badge}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
