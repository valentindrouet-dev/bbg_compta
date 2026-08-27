/**
 * Réorganiser des lignes à la souris, dans un tableau.
 *
 * On attrape une ligne par sa poignée, on la remonte ou on la descend, un trait
 * montre où elle va tomber, et le nouvel ordre est enregistré au relâchement.
 * Le glissé natif du navigateur fait le gros du travail (image de la ligne,
 * défilement automatique quand on sort du cadre) ; il ne reste ici que la
 * question « avant ou après la ligne survolée ? ».
 *
 * On ne réagit pas à `dragleave` : il se déclenche à chaque passage d'une
 * cellule à la suivante et effacerait le trait d'insertion en pleine course.
 * L'indicateur s'efface au relâchement, ce qui suffit.
 *
 * Le `genre` évite les mélanges : une catégorie ne se dépose pas sur un groupe.
 */
import { useCallback, useState } from 'react';

export interface CibleDepot {
  genre: string;
  id: string;
  /** true = déposer après la ligne survolée, false = avant. */
  apres: boolean;
}

export interface Reorganisation {
  /** L'élément en cours de déplacement, s'il y en a un. */
  enCours: { genre: string; id: string } | null;
  cible: CibleDepot | null;
  /** À poser sur la ligne : la rend déplaçable et réceptive au dépôt. */
  ligne: (genre: string, id: string) => Record<string, unknown>;
  /** À poser sur la poignée : c'est elle seule qui arme le glissé. */
  poignee: () => Record<string, unknown>;
}

/**
 * @param onDepot appelé au relâchement avec (déplacé, cible, après, genre).
 *   Ne rien faire si la cible vaut la source.
 */
export function useReorganisation(
  onDepot: (source: string, cible: string, apres: boolean, genre: string) => void,
): Reorganisation {
  const [enCours, setEnCours] = useState<{ genre: string; id: string } | null>(null);
  const [cible, setCible] = useState<CibleDepot | null>(null);
  const [arme, setArme] = useState(false);

  const fin = useCallback(() => { setEnCours(null); setCible(null); setArme(false); }, []);

  const ligne = useCallback((genre: string, id: string) => ({
    draggable: arme || (enCours?.id === id),
    onDragStart: (ev: React.DragEvent) => {
      if (!arme) { ev.preventDefault(); return; }   // sans la poignée, pas de glissé
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', id);
      setEnCours({ genre, id });
    },
    onDragEnd: fin,
    onDragOver: (ev: React.DragEvent) => {
      if (!enCours || enCours.genre !== genre || enCours.id === id) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      // `dragover` remonte depuis les cellules : c'est bien la ligne qu'on mesure.
      const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      const apres = ev.clientY > r.top + r.height / 2;
      setCible(c => (c && c.id === id && c.apres === apres) ? c : { genre, id, apres });
    },
    onDrop: (ev: React.DragEvent) => {
      ev.preventDefault();
      const src = enCours;
      const cbl = cible;
      fin();
      if (src && src.genre === genre && src.id !== id) {
        onDepot(src.id, id, cbl?.id === id ? cbl.apres : false, genre);
      }
    },
    'data-depot': cible?.id === id ? (cible.apres ? 'apres' : 'avant') : undefined,
    'data-glisse': enCours?.id === id ? '' : undefined,
  }), [arme, enCours, cible, fin, onDepot]);

  const poignee = useCallback(() => ({
    onMouseEnter: () => setArme(true),
    onMouseLeave: () => setArme(false),
    style: { cursor: 'grab' as const },
  }), []);

  return { enCours, cible, ligne, poignee };
}
