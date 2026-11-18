import { useEffect, useRef, useState, type ReactNode } from 'react';
import { autocomplete } from '../games/mtg/scryfall';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  multi,
}: {
  options: { id: T; label: ReactNode }[];
  value: T[];
  onChange: (v: T[]) => void;
  multi?: boolean;
}) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            className={`chip ${on ? 'on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(multi ? (on ? value.filter((x) => x !== o.id) : [...value, o.id]) : [o.id])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const MANA_COLORS: { id: string; label: string; cls: string }[] = [
  { id: 'W', label: 'W', cls: 'mana-w' },
  { id: 'U', label: 'U', cls: 'mana-u' },
  { id: 'B', label: 'B', cls: 'mana-b' },
  { id: 'R', label: 'R', cls: 'mana-r' },
  { id: 'G', label: 'G', cls: 'mana-g' },
];
export const ManaDot = ({ c }: { c: string }) => <span className={`mana ${MANA_COLORS.find((m) => m.id === c)?.cls ?? 'mana-c'}`}>{c}</span>;

export function NameSearch({ onPick, placeholder, autoFocus }: { onPick: (name: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<string[]>([]);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(t.current);
    if (q.trim().length < 2) {
      setList([]);
      return;
    }
    t.current = window.setTimeout(() => {
      autocomplete(q).then(setList).catch(() => setList([]));
    }, 250);
  }, [q]);
  return (
    <div className="namesearch">
      <input
        type="search"
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Type a card name…'}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && q.trim()) {
            onPick(list[0] ?? q.trim());
            setQ('');
            setList([]);
          }
        }}
        autoCapitalize="words"
        autoComplete="off"
      />
      {list.length > 0 && (
        <ul className="suggest">
          {list.slice(0, 8).map((n) => (
            <li key={n}>
              <button
                onClick={() => {
                  onPick(n);
                  setQ('');
                  setList([]);
                }}
              >
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} aria-label="Less">
        −
      </button>
      <span>{value}</span>
      <button onClick={() => onChange(value + 1)} aria-label="More">
        +
      </button>
    </div>
  );
}
