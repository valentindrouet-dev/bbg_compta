import { useSyncExternalStore } from 'react';

/**
 * Les petites confirmations de l'app — « facture attachée », « 3 lignes
 * créées ». Elles flottent au-dessus de la page plutôt que de s'insérer
 * dedans : glissée dans le flux, une confirmation pousse le tableau vers le
 * bas et on perd des yeux la ligne qu'on vient de remplir.
 */
export interface Message {
  id: number;
  texte: string;
  /** « ok » pour une action aboutie, « info » quand il n'y avait rien à faire. */
  ton: 'ok' | 'info';
}

/** Au-delà, les plus anciens s'effacent : trois messages, c'est déjà beaucoup. */
const MAX = 3;
const DUREE_MS = 5000;

let liste: Message[] = [];
let suivant = 1;
const abonnes = new Set<() => void>();

function publier(next: Message[]) {
  liste = next;
  for (const prevenir of abonnes) prevenir();
}

/** Affiche un message flottant. Rend son identifiant, pour le fermer plus tôt. */
export function toast(texte: string, ton: Message['ton'] = 'ok'): number {
  const id = suivant++;
  publier([...liste, { id, texte, ton }].slice(-MAX));
  setTimeout(() => fermerToast(id), DUREE_MS);
  return id;
}

export function fermerToast(id: number) {
  if (!liste.some(m => m.id === id)) return;
  publier(liste.filter(m => m.id !== id));
}

export function useToasts(): Message[] {
  return useSyncExternalStore(
    prevenir => { abonnes.add(prevenir); return () => { abonnes.delete(prevenir); }; },
    () => liste,
    () => liste,
  );
}
