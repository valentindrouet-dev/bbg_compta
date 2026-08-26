import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { parseMontant, r2 } from '../../utils/money';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--bbg-purple-darker)' }}>{title}</h1>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: '#6f6690' }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = '', actions }: {
  title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-lg shadow-sm border ${className}`}
      style={{ borderColor: 'var(--bbg-border-soft)' }}
    >
      {(title || actions) && (
        <div
          className="flex items-center justify-between px-4 py-2 border-b rounded-t-lg"
          style={{ backgroundColor: 'var(--bbg-lavender)', borderColor: 'var(--bbg-border-soft)' }}
        >
          <h2 className="font-semibold" style={{ color: 'var(--bbg-purple-darker)' }}>{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'neutral' }: {
  label: string; value: string; sub?: string; tone?: 'neutral' | 'good' | 'bad' | 'accent';
}) {
  const tones = {
    neutral: 'var(--bbg-purple-darker)',
    good: 'var(--bbg-green-dark)',
    bad: '#b7332e',
    accent: 'var(--bbg-orange-dark)',
  };
  const rails = {
    neutral: 'var(--bbg-purple)',
    good: 'var(--bbg-green)',
    bad: '#e8a9a5',
    accent: 'var(--bbg-orange)',
  };
  return (
    <div
      className="bg-white rounded-lg shadow-sm border px-4 py-3"
      style={{ borderColor: 'var(--bbg-border-soft)', borderLeft: `4px solid ${rails[tone]}` }}
    >
      <div className="text-xs uppercase tracking-wide" style={{ color: '#6f6690' }}>{label}</div>
      <div className="text-xl font-bold mt-1 tabular-nums" style={{ color: tones[tone] }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: '#8d85a6' }}>{sub}</div>}
    </div>
  );
}

export function Btn({ children, onClick, variant = 'default', title, disabled }: {
  children: ReactNode; onClick?: () => void; title?: string; disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
}) {
  const styles = {
    default: 'bg-white border border-[#c9c0e4] text-[#3f3268] hover:bg-[#f4f1fb]',
    primary: 'text-white font-semibold border border-[#674ea7] bg-[#674ea7] hover:bg-[#7a5fbd]',
    danger: 'bg-white border border-[#e3b3af] text-red-600 hover:bg-red-50',
    ghost: 'text-[#6f6690] hover:text-[#3f3268] hover:bg-[#efeafa]',
  };
  return (
    <button
      className={`px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]}`}
      onClick={onClick} title={title} disabled={disabled}
    >
      {children}
    </button>
  );
}

/** Saisie monétaire : édition libre, validation au blur / Entrée. */
export function MoneyInput({ value, onCommit, className = '', placeholder, disabled }: {
  value: number | null; onCommit: (v: number | null) => void;
  className?: string; placeholder?: string; disabled?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value == null ? '' : String(r2(value)).replace('.', ','));
  return (
    <input
      type="text" inputMode="decimal"
      className={`w-24 px-1.5 py-1 border border-[#ddd6ef] rounded text-right text-sm tabular-nums
        focus:outline-none focus:border-[#674ea7] focus:ring-2 focus:ring-[#674ea7]/25 disabled:text-[#9a92b5] ${className}`}
      value={shown}
      placeholder={placeholder}
      disabled={disabled}
      onChange={ev => setText(ev.target.value)}
      onFocus={ev => ev.target.select()}
      onBlur={() => { if (text !== null) { onCommit(parseMontant(text)); setText(null); } }}
      onKeyDown={ev => {
        if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
        if (ev.key === 'Escape') setText(null);
      }}
    />
  );
}

export function MonthNav({ mois, moisList, labelOf, onChange }: {
  mois: string; moisList: string[]; labelOf: (m: string) => string; onChange: (m: string) => void;
}) {
  const idx = moisList.indexOf(mois);
  return (
    <div className="flex items-center gap-1">
      <Btn variant="ghost" onClick={() => idx > 0 && onChange(moisList[idx - 1])} disabled={idx <= 0}>
        <ChevronLeft size={16} />
      </Btn>
      <select
        className="border border-[#c9c0e4] rounded-md px-2 py-1.5 text-sm bg-white font-medium"
        value={mois}
        onChange={ev => onChange(ev.target.value)}
      >
        {moisList.map(m => <option key={m} value={m}>{labelOf(m)}</option>)}
      </select>
      <Btn variant="ghost" onClick={() => idx < moisList.length - 1 && onChange(moisList[idx + 1])} disabled={idx >= moisList.length - 1}>
        <ChevronRight size={16} />
      </Btn>
    </div>
  );
}

// ----- Tri générique -----------------------------------------------------

export interface SortState { key: string; dir: 'asc' | 'desc' }

export function useSort(initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  const toggle = (key: string) => setSort(s =>
    s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  return { sort, toggle };
}

export function sortBy<T>(list: T[], sort: SortState, accessors: Record<string, (item: T) => string | number>): T[] {
  const acc = accessors[sort.key];
  if (!acc) return list;
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = acc(a), vb = acc(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
    return String(va).localeCompare(String(vb), 'fr') * mul;
  });
}

export function ThSort({ label, k, sort, onToggle, className = '', extra }: {
  label: string; k: string; sort: SortState; onToggle: (k: string) => void;
  className?: string;
  /** Contenu additionnel à droite du libellé (menu de mise en forme). */
  extra?: ReactNode;
}) {
  const active = sort.key === k;
  return (
    <th
      className={`cursor-pointer select-none ${active ? 'sorted' : ''} ${className}`}
      onClick={() => onToggle(k)}
      title="Trier sur cette colonne"
    >
      <span className={`inline-flex items-center gap-1 w-full truncate ${className.includes('num') ? 'justify-end' : ''}`}>
        {label}
        {active
          ? (sort.dir === 'asc' ? <ArrowUp size={12} className="shrink-0" /> : <ArrowDown size={12} className="shrink-0" />)
          : <ArrowUpDown size={12} className="shrink-0" style={{ opacity: 0.45 }} />}
      </span>
      {/* Le menu de mise en forme flotte au-dessus de l'en-tête : il n'ampute
          pas la place du libellé, et n'apparaît qu'au survol de la colonne. */}
      {extra && <span className="th-tools">{extra}</span>}
    </th>
  );
}

// ----- Onglets de mois (façon onglets de tableur) ------------------------

export function MonthTabs({ mois, moisList, labelOf, badgeOf, onChange }: {
  mois: string;
  moisList: string[];
  labelOf: (m: string) => string;
  /** Petit compteur affiché dans l'onglet (nombre d'écritures du mois). */
  badgeOf?: (m: string) => number;
  onChange: (m: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-0.5 border-b" style={{ borderColor: 'var(--bbg-purple)' }}>
      {moisList.map(m => {
        const active = m === mois;
        const n = badgeOf?.(m) ?? 0;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className="px-3 py-1.5 text-sm rounded-t-md border border-b-0 transition-colors relative -mb-px"
            style={active
              ? { backgroundColor: '#fff', borderColor: 'var(--bbg-purple)', color: 'var(--bbg-purple-darker)', fontWeight: 700 }
              : { backgroundColor: 'var(--bbg-purple-light)', borderColor: 'var(--bbg-border)', color: '#5c5280' }}
          >
            {labelOf(m)}
            {badgeOf && (
              <span
                className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full align-middle"
                style={n
                  ? { backgroundColor: 'var(--bbg-purple)', color: '#fff' }
                  : { backgroundColor: '#e6e1f3', color: '#9a92b5' }}
              >
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
