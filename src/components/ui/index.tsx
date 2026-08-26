import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { parseMontant, r2 } from '../../utils/money';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = '', actions }: {
  title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode;
}) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{title}</h2>
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
    neutral: 'text-gray-900',
    good: 'text-emerald-600',
    bad: 'text-red-600',
    accent: 'text-yellow-600',
  };
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-bold mt-1 tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export function Btn({ children, onClick, variant = 'default', title, disabled }: {
  children: ReactNode; onClick?: () => void; title?: string; disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
}) {
  const styles = {
    default: 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
    primary: 'bg-yellow-500 text-gray-900 font-semibold hover:bg-yellow-400 border border-yellow-500',
    danger: 'bg-white border border-red-300 text-red-600 hover:bg-red-50',
    ghost: 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
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
      className={`w-24 px-1.5 py-1 border border-gray-200 rounded text-right text-sm tabular-nums
        focus:outline-none focus:ring-1 focus:ring-yellow-400 disabled:bg-gray-50 disabled:text-gray-400 ${className}`}
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
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white font-medium"
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

export function ThSort({ label, k, sort, onToggle, className = '' }: {
  label: string; k: string; sort: SortState; onToggle: (k: string) => void; className?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={`cursor-pointer select-none hover:bg-gray-100 ${className}`} onClick={() => onToggle(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
          : <ArrowUpDown size={12} className="text-gray-300" />}
      </span>
    </th>
  );
}
