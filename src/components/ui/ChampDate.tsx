import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { MOIS_NOMS, formatDateFR, todayISO } from '../../utils/dates';

/**
 * Le calendrier de l'app, le même partout.
 *
 * Le sélecteur natif du navigateur se fermait au moindre clic sur ses flèches
 * de mois (le champ perdait le focus et l'app le démontait), et chaque
 * navigation d'un mois à l'autre pouvait enregistrer une date au passage —
 * la ligne changeait alors de place et le calendrier disparaissait. Celui-ci
 * vit dans l'app : on navigue librement, et rien n'est enregistré tant qu'on
 * n'a pas cliqué un jour (ou tapé une date puis Entrée).
 */

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const joursDansMois = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const estISO = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Décale une date ISO de n jours, sans passer par l'heure locale. */
function decaler(v: string, n: number): string {
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Même jour, n mois plus loin (ramené au dernier jour du mois si besoin). */
function decalerMois(v: string, n: number): string {
  const [y, m, d] = v.split('-').map(Number);
  const rang = y * 12 + (m - 1) + n;
  const an = Math.floor(rang / 12);
  const mo = rang - an * 12 + 1;
  return iso(an, mo, Math.min(d, joursDansMois(an, mo)));
}

/**
 * Lit une date tapée : « 12/04/2027 », « 12/4/27 », « 12/04 » (année du mois
 * affiché), « 12.04.2027 », « 12-04-2027 » ou « 2027-04-12 ». Rend null si ce
 * n'est pas une vraie date.
 */
export function lireDate(texte: string, anneeParDefaut: number): string | null {
  const t = texte.trim();
  let y: number, m: number, d: number;
  const isoM = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const frM = t.match(/^(\d{1,2})[/.\- ](\d{1,2})(?:[/.\- ](\d{2}|\d{4}))?$/);
  if (isoM) { y = +isoM[1]; m = +isoM[2]; d = +isoM[3]; }
  else if (frM) {
    d = +frM[1]; m = +frM[2];
    y = frM[3] ? (frM[3].length === 2 ? 2000 + +frM[3] : +frM[3]) : anneeParDefaut;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > joursDansMois(y, m)) return null;
  return iso(y, m, d);
}

const versTexte = (v: string) => (estISO(v) ? formatDateFR(v) : '');

/** Le panneau du calendrier, posé sous (ou au-dessus de) son ancre. */
function Calendrier({ ancre, valeur, vide, onChoisir, onFermer }: {
  ancre: HTMLElement; valeur: string; vide: boolean;
  onChoisir: (v: string) => void; onFermer: () => void;
}) {
  const aujourdhui = todayISO();
  const depart = estISO(valeur) ? valeur : aujourdhui;
  const [curseur, setCurseur] = useState(depart);
  const [texte, setTexte] = useState(versTexte(valeur));
  const [erreur, setErreur] = useState(false);
  const panneau = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const [y, m] = curseur.split('-').map(Number);

  // Position : sous l'ancre, ou au-dessus s'il n'y a pas la place ; jamais
  // hors de l'écran. Recalculée quand la page défile ou change de taille.
  useLayoutEffect(() => {
    function placer() {
      const r = ancre.getBoundingClientRect();
      const h = panneau.current?.offsetHeight ?? 330;
      const w = panneau.current?.offsetWidth ?? 270;
      const enBas = r.bottom + 4 + h <= window.innerHeight || r.top - 4 - h < 0;
      setPos({
        top: enBas ? r.bottom + 4 : r.top - 4 - h,
        left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
      });
    }
    placer();
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    return () => {
      window.removeEventListener('scroll', placer, true);
      window.removeEventListener('resize', placer);
    };
  }, [ancre]);

  // Un clic ailleurs referme, sans rien enregistrer.
  useEffect(() => {
    function dehors(ev: MouseEvent) {
      const t = ev.target as Node;
      if (panneau.current?.contains(t) || ancre.contains(t)) return;
      onFermer();
    }
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [ancre, onFermer]);

  useEffect(() => { champ.current?.focus(); champ.current?.select(); }, []);

  function deplacer(nouveau: string) {
    setCurseur(nouveau);
    setTexte(formatDateFR(nouveau));
    setErreur(false);
  }

  function valider() {
    if (vide && texte.trim() === '') { onChoisir(''); return; }
    const lue = lireDate(texte, y);
    if (!lue) { setErreur(true); return; }
    onChoisir(lue);
  }

  const premier = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const debutGrille = decaler(iso(y, m, 1), -premier);
  const cases = Array.from({ length: 42 }, (_, i) => decaler(debutGrille, i));

  const bouton = 'p-1 rounded text-[#6f6690] hover:bg-[#efeafa] hover:text-[#3f3268]';
  return createPortal(
    <div
      ref={panneau}
      role="dialog"
      aria-label="Calendrier"
      className="fixed z-[1000] w-[270px] rounded-lg border bg-white shadow-xl p-2 text-[13px] select-none"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, borderColor: 'var(--bbg-border)' }}
      onMouseDown={ev => { if (ev.target !== champ.current) ev.preventDefault(); }}
      onKeyDown={ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); onFermer(); }
      }}
    >
      <input
        ref={champ}
        value={texte}
        placeholder="jj/mm/aaaa"
        aria-label="Date"
        className={`w-full mb-2 px-2 py-1 rounded border text-[13px] tabular-nums outline-none focus:ring-2 focus:ring-[#674ea7]/25 ${erreur ? 'border-red-400' : ''}`}
        style={erreur ? undefined : { borderColor: 'var(--bbg-border)' }}
        onChange={ev => {
          setTexte(ev.target.value);
          setErreur(false);
          const lue = lireDate(ev.target.value, y);
          if (lue) setCurseur(lue);
        }}
        onKeyDown={ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); valider(); }
          else if (ev.key === 'ArrowDown') { ev.preventDefault(); deplacer(decaler(curseur, 7)); }
          else if (ev.key === 'ArrowUp') { ev.preventDefault(); deplacer(decaler(curseur, -7)); }
          else if (ev.key === 'PageDown') { ev.preventDefault(); deplacer(decalerMois(curseur, 1)); }
          else if (ev.key === 'PageUp') { ev.preventDefault(); deplacer(decalerMois(curseur, -1)); }
        }}
      />
      <div className="flex items-center justify-between mb-1">
        <div className="flex">
          <button type="button" className={bouton} title="Année précédente" aria-label="Année précédente"
            onClick={() => setCurseur(decalerMois(curseur, -12))}><ChevronsLeft size={15} /></button>
          <button type="button" className={bouton} title="Mois précédent" aria-label="Mois précédent"
            onClick={() => setCurseur(decalerMois(curseur, -1))}><ChevronLeft size={15} /></button>
        </div>
        <div className="font-semibold capitalize" style={{ color: 'var(--bbg-purple-darker)' }}>
          {MOIS_NOMS[m - 1]} {y}
        </div>
        <div className="flex">
          <button type="button" className={bouton} title="Mois suivant" aria-label="Mois suivant"
            onClick={() => setCurseur(decalerMois(curseur, 1))}><ChevronRight size={15} /></button>
          <button type="button" className={bouton} title="Année suivante" aria-label="Année suivante"
            onClick={() => setCurseur(decalerMois(curseur, 12))}><ChevronsRight size={15} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold mb-0.5" style={{ color: '#9a92b5' }}>
        {JOURS.map((j, i) => <div key={i}>{j}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cases.map(c => {
          const dansMois = c.slice(5, 7) === String(m).padStart(2, '0');
          const choisi = c === valeur;
          const curs = c === curseur && !choisi;
          const auj = c === aujourdhui;
          return (
            <button
              type="button"
              key={c}
              data-date={c}
              className={`h-8 rounded tabular-nums transition-colors ${choisi
                ? 'bg-[#674ea7] text-white font-semibold'
                : `hover:bg-[#efeafa] ${dansMois ? 'text-[#3f3268]' : 'text-[#c4bdd8]'} ${curs ? 'bg-[#f4f1fb]' : ''}`}`}
              style={auj && !choisi ? { boxShadow: 'inset 0 0 0 1.5px var(--bbg-purple)' } : undefined}
              title={formatDateFR(c)}
              onClick={() => onChoisir(c)}
            >
              {Number(c.slice(8, 10))}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t" style={{ borderColor: 'var(--bbg-border-soft)' }}>
        {vide
          ? <button type="button" className="text-xs text-[#6f6690] hover:text-red-600" onClick={() => onChoisir('')}>Effacer</button>
          : <span className="text-[11px] text-[#9a92b5]">Entrée valide · Échap ferme</span>}
        <button type="button" className="text-xs font-semibold text-[#674ea7] hover:underline"
          onClick={() => onChoisir(aujourdhui)}>Aujourd'hui</button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Un champ de date : un bouton qui affiche la date et ouvre le calendrier.
 * `onChange` n'est appelé qu'une fois une date choisie — jamais pendant qu'on
 * feuillette les mois.
 */
export function ChampDate({
  value, onChange, vide = false, className = '', style, title, disabled, placeholder = 'jj/mm/aaaa',
  libelle, ariaLabel, icone = true,
}: {
  value: string;
  onChange: (v: string) => void;
  /** La date peut-elle rester vide ? (bouton « Effacer ») */
  vide?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Ce que le bouton affiche ; par défaut « jj/mm/aaaa ». */
  libelle?: (v: string) => ReactNode;
  ariaLabel?: string;
  /** Petite icône de calendrier à droite, comme un champ de formulaire. */
  icone?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const ancre = useRef<HTMLButtonElement>(null);
  const fermer = () => { setOuvert(false); ancre.current?.focus(); };
  const affiche = estISO(value) ? (libelle ? libelle(value) : formatDateFR(value)) : '';
  return (
    <>
      <button
        ref={ancre}
        type="button"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel ?? title ?? 'Date'}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        className={`text-left tabular-nums whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
        style={style}
        onClick={() => setOuvert(o => !o)}
        onKeyDown={ev => {
          if (ev.key === 'ArrowDown' || ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOuvert(true); }
        }}
      >
        {icone ? (
          <span className="flex items-center justify-between gap-1.5">
            <span>{affiche || <span className="text-[#b3abc9]">{placeholder}</span>}</span>
            <CalendarDays size={13} className="shrink-0 text-[#9a92b5]" />
          </span>
        ) : (affiche || <span className="text-[#b3abc9]">{placeholder}</span>)}
      </button>
      {ouvert && ancre.current && (
        <Calendrier
          ancre={ancre.current}
          valeur={value}
          vide={vide}
          onFermer={fermer}
          onChoisir={v => {
            setOuvert(false);
            ancre.current?.focus();
            if (v !== value) onChange(v);
          }}
        />
      )}
    </>
  );
}
