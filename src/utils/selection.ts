/**
 * Sélection de plusieurs cellules à la souris, comme dans un tableur.
 *
 * On appuie sur une cellule, on glisse, on relâche : tout le rectangle est
 * sélectionné. Suppr ou Retour arrière vide les cellules d'un coup, Échap
 * annule la sélection. Un simple clic sans glissement ne sélectionne rien —
 * il laisse la cellule s'ouvrir normalement en saisie.
 *
 * Le surlignage est posé directement sur le DOM plutôt que par un rendu React :
 * balayer un grand tableau ne doit pas redessiner des centaines de champs de
 * saisie à chaque pixel parcouru.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Cellule {
  /** Identifiant du tableau : une sélection ne franchit pas ses bords. */
  table: string;
  ligne: number;
  col: number;
}

interface Plage { table: string; l1: number; c1: number; l2: number; c2: number }

export interface Selection {
  /** À poser sur chaque cellule sélectionnable. */
  props: (table: string, ligne: number, col: number) => {
    'data-cel': string;
    onMouseDown: (ev: React.MouseEvent) => void;
    onMouseEnter: (ev: React.MouseEvent) => void;
  };
  /** Nombre de cellules dans la sélection courante (0 si une seule ou aucune). */
  nb: number;
  effacer: () => void;
}

const bornes = (p: Plage) => ({
  lmin: Math.min(p.l1, p.l2), lmax: Math.max(p.l1, p.l2),
  cmin: Math.min(p.c1, p.c2), cmax: Math.max(p.c1, p.c2),
});

function cellules(p: Plage): Cellule[] {
  const b = bornes(p);
  const out: Cellule[] = [];
  for (let l = b.lmin; l <= b.lmax; l++) {
    for (let c = b.cmin; c <= b.cmax; c++) out.push({ table: p.table, ligne: l, col: c });
  }
  return out;
}

/** Cellules actuellement surlignées : on ne repeint que le strict nécessaire. */
let peintes: HTMLElement[] = [];

/** Pose (ou retire) l'attribut de surlignage sur les cellules du document. */
function peindre(p: Plage | null) {
  for (const el of peintes) el.removeAttribute('data-sel');
  peintes = [];
  if (!p || (p.l1 === p.l2 && p.c1 === p.c2)) return;
  for (const c of cellules(p)) {
    const el = document.querySelector<HTMLElement>(
      `[data-cel="${CSS.escape(c.table)}|${c.ligne}|${c.col}"]`);
    if (el) { el.setAttribute('data-sel', ''); peintes.push(el); }
  }
}

/**
 * @param onVider  appelé avec toutes les cellules à vider — en un seul appel,
 *                 pour que Cmd+Z les rétablisse d'un coup.
 */
export function useSelectionCellules(onVider: (cells: Cellule[]) => void): Selection {
  const plage = useRef<Plage | null>(null);
  const glisse = useRef(false);
  const [nb, setNb] = useState(0);
  const vider = useRef(onVider);
  vider.current = onVider;

  const majPlage = useCallback((p: Plage | null) => {
    plage.current = p;
    peindre(p);
    const n = p ? cellules(p).length : 0;
    setNb(n > 1 ? n : 0);
  }, []);

  const effacer = useCallback(() => majPlage(null), [majPlage]);

  useEffect(() => {
    function relache() {
      if (!glisse.current) return;
      glisse.current = false;
      document.body.style.userSelect = '';
      // Un clic sans glissement ne laisse pas de sélection derrière lui.
      const p = plage.current;
      if (p && p.l1 === p.l2 && p.c1 === p.c2) majPlage(null);
    }
    function touche(ev: KeyboardEvent) {
      const p = plage.current;
      if (!p) return;
      if (ev.key === 'Escape') { majPlage(null); return; }
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
      const cells = cellules(p);
      // Sur une seule cellule, on laisse la saisie se comporter normalement.
      if (cells.length < 2) return;
      ev.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      vider.current(cells);
      majPlage(null);
    }
    window.addEventListener('mouseup', relache);
    window.addEventListener('keydown', touche);
    return () => {
      window.removeEventListener('mouseup', relache);
      window.removeEventListener('keydown', touche);
    };
  }, [majPlage]);

  // Les gestionnaires ne changent jamais d'identité : les cellules ne sont pas
  // redessinées pendant le balayage.
  const props = useCallback((table: string, ligne: number, col: number) => ({
    'data-cel': `${table}|${ligne}|${col}`,
    onMouseDown: (ev: React.MouseEvent) => {
      if (ev.button !== 0) return;
      // Sans ça, appuyer sur un champ déjà sélectionné démarre un
      // glisser-déposer de texte, et le balayage s'arrête au premier pixel.
      const el = ev.target as HTMLElement;
      if (el instanceof HTMLInputElement) { ev.preventDefault(); el.focus(); }
      glisse.current = true;
      majPlage({ table, l1: ligne, c1: col, l2: ligne, c2: col });
    },
    onMouseEnter: () => {
      const p = plage.current;
      if (!glisse.current || !p || p.table !== table) return;
      if (p.l2 === ligne && p.c2 === col) return;
      document.body.style.userSelect = 'none';
      majPlage({ ...p, l2: ligne, c2: col });
    },
  }), [majPlage]);

  return { props, nb, effacer };
}
