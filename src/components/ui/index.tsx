import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Palette, RotateCcw } from 'lucide-react';
import { useEtatVue } from '../../utils/etatVue';
import { parseMontant, r2 } from '../../utils/money';
import { useStore } from '../../store';
import { BLOC_PAR_CLE, teinteBloc, type BlocCle } from '../../utils/blocs';
import { TEINTES_MAJEURES, variablesTeinte, type Teinte } from '../../utils/couleurs';

/**
 * L'en-tête d'une page : le titre et ses boutons.
 *
 * Il reste collé en haut quand on descend dans un long tableau — la bascule
 * HT/TTC ou le choix d'exercice doivent rester sous la main au milieu de la
 * synthèse. Les marges négatives lui font couvrir toute la largeur, y compris
 * le rembourrage de la page.
 */
export function PageHeader({ title, subtitle, actions, tabs }: {
  title: string; subtitle?: string; actions?: ReactNode;
  /** Onglets (mois, exercices) : ils restent collés avec le titre. */
  tabs?: ReactNode;
}) {
  return (
    <div
      className="sticky top-0 z-30 -mx-4 -mt-4 px-4 pt-4 pb-2 mb-4"
      style={{ backgroundColor: '#f6f4fc', boxShadow: '0 1px 0 var(--bbg-border-soft)' }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--bbg-purple-darker)' }}>{title}</h1>
          {subtitle && <p className="text-sm mt-0.5" style={{ color: '#6f6690' }}>{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-2.5">{tabs}</div>}
    </div>
  );
}

/**
 * Les exercices en onglets, comme les mois du journal. Un clic suffit à changer
 * d'exercice, et le compteur dit d'un coup d'œil lesquels portent des écritures.
 */
export function ExerciceTabs({ exercice, exercices, badgeOf, onChange }: {
  exercice: string;
  exercices: readonly string[];
  badgeOf?: (ex: string) => number;
  onChange: (ex: string) => void;
}) {
  return (
    <MonthTabs
      mois={exercice}
      moisList={[...exercices]}
      labelOf={ex => ex}
      badgeOf={badgeOf}
      onChange={onChange}
    />
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

// ----- Blocs colorés -----------------------------------------------------

/** Teinte d'un bloc, telle que réglée dans l'app (hook, pour les composants). */
export function useTeinte(bloc: BlocCle): Teinte {
  return teinteBloc(bloc, useStore(s => s.blocCouleurs));
}

/** Variables CSS à poser sur un tableau pour qu'il prenne les couleurs du bloc. */
export function styleBloc(t: Teinte): CSSProperties {
  return variablesTeinte(t) as CSSProperties;
}

/**
 * Le petit bouton de recoloration : une teinte majeure, et tout le bloc suit —
 * en-tête, bandes de groupe, lignes, ligne de total — ici comme dans le journal
 * et le prévisionnel.
 */
export function BlocColorMenu({ bloc }: { bloc: BlocCle }) {
  const couleurs = useStore(s => s.blocCouleurs);
  const setBlocCouleur = useStore(s => s.setBlocCouleur);
  const resetBlocCouleur = useStore(s => s.resetBlocCouleur);
  const [ouvert, setOuvert] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);
  const def = BLOC_PAR_CLE.get(bloc);
  const courante = couleurs[bloc] || def?.defaut || '';
  const t = teinteBloc(bloc, couleurs);

  useEffect(() => {
    if (!ouvert) return;
    const clic = (ev: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', clic);
    return () => document.removeEventListener('mousedown', clic);
  }, [ouvert]);

  return (
    <span className="relative inline-flex" ref={boxRef}>
      <button
        type="button"
        title={`Recolorer le bloc « ${def?.titre ?? bloc} »`}
        className="inline-flex items-center gap-1 px-1.5 py-1 rounded border text-xs"
        style={{ backgroundColor: t.base, borderColor: t.bord, color: t.fonce }}
        onClick={() => setOuvert(o => !o)}
      >
        <Palette size={13} />
      </button>
      {ouvert && (
        <div
          className="absolute right-0 top-8 z-50 bg-white rounded-md shadow-lg border p-2 font-normal"
          style={{ borderColor: 'var(--bbg-border)', width: 196 }}
        >
          <div className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: '#9a92b5' }}>
            Teinte du bloc {def?.titre ?? bloc}
          </div>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {TEINTES_MAJEURES.map(c => (
              <button
                key={c.nom} type="button" title={c.nom}
                className="h-8 rounded border flex items-end justify-center pb-0.5 text-[9px] font-semibold"
                style={{
                  backgroundColor: c.hex,
                  color: '#3f3268',
                  borderColor: courante.toLowerCase() === c.hex ? '#3f3268' : 'transparent',
                  borderWidth: courante.toLowerCase() === c.hex ? 2 : 1,
                }}
                onClick={() => { setBlocCouleur(bloc, c.hex); setOuvert(false); }}
              >
                {c.nom}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 mb-2">
            <input
              type="color" className="w-8 h-7 p-0 border rounded cursor-pointer"
              style={{ borderColor: 'var(--bbg-border-soft)' }}
              value={courante || '#b4a7d6'}
              onChange={ev => setBlocCouleur(bloc, ev.target.value)}
              title="Teinte libre"
            />
            <span className="text-[11px]" style={{ color: '#6f6690' }}>Teinte libre</span>
          </div>
          <div className="flex gap-1 mb-2">
            {(['base', 'clair', 'tresClair', 'total', 'fonce'] as const).map(k => (
              <span key={k} className="flex-1 h-4 rounded-sm border"
                style={{ backgroundColor: t[k], borderColor: 'var(--bbg-border-soft)' }} title={k} />
            ))}
          </div>
          <button
            type="button"
            className="w-full inline-flex items-center justify-center gap-1 py-1 rounded hover:bg-[#f4f1fb] text-xs"
            style={{ color: '#6f6690' }}
            onClick={() => { resetBlocCouleur(bloc); setOuvert(false); }}
          >
            <RotateCcw size={12} /> Teinte d'origine
          </button>
        </div>
      )}
    </span>
  );
}

/** Le gros total d'un bloc, à lire d'un coup d'œil dans son en-tête. */
export function TotalBloc({ label, valeur, t }: { label: string; valeur: string; t: Teinte }) {
  return (
    <span
      className="inline-flex items-baseline gap-2 px-3 py-1 rounded-md border"
      style={{ backgroundColor: t.total, borderColor: t.bord, color: t.fonce }}
      title={label}
    >
      <span className="text-[11px] uppercase tracking-wide opacity-80">{label}</span>
      <b className="text-base tabular-nums">{valeur}</b>
    </span>
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

/**
 * Le tri d'un tableau. Avec une clé, il est mémorisé : on retrouve la colonne
 * et le sens qu'on avait choisis en revenant sur la page, comme les onglets.
 */
export function useSort(initial: SortState, cle?: string) {
  const [sort, setSort] = useEtatVue<SortState>(cle ? `tri.${cle}` : 'tri.__volatile', initial,
    v => typeof v?.key === 'string' && (v.dir === 'asc' || v.dir === 'desc'));
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
