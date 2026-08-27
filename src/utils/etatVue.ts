/**
 * L'état d'affichage des pages, retrouvé d'une visite à l'autre.
 *
 * Le mois qu'on regardait dans le journal, l'exercice ouvert au prévisionnel,
 * la bascule HT/TTC : rien de tout cela n'est une donnée comptable, mais tout
 * revenait à zéro dès qu'on changeait d'onglet. C'est enregistré à part des
 * données — l'annulation (Cmd+Z) n'a pas à revenir sur un changement de mois,
 * et une restauration de sauvegarde n'a pas à ramener la page d'un autre jour.
 */
import { useCallback, useState } from 'react';

const CLE = 'bbg-compta-vue';

type Sac = Record<string, unknown>;

function lire(): Sac {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? JSON.parse(brut) as Sac : {};
  } catch {
    return {};
  }
}

function ecrire(sac: Sac) {
  try {
    localStorage.setItem(CLE, JSON.stringify(sac));
  } catch {
    // Navigation privée, quota plein : on continue sans mémoriser.
  }
}

/** Valeur mémorisée pour cette clé, ou `defaut` si on ne l'a jamais vue. */
export function valeurVue<T>(cle: string, defaut: T): T {
  const v = lire()[cle];
  return v === undefined ? defaut : v as T;
}

/**
 * Comme `useState`, mais la valeur survit au changement de page.
 *
 * @param valide filtre optionnel : une valeur mémorisée qui n'a plus de sens
 *   (un mois d'un exercice qu'on a supprimé, par exemple) retombe sur `defaut`.
 */
export function useEtatVue<T>(
  cle: string, defaut: T, valide?: (v: T) => boolean,
): [T, (v: T | ((prec: T) => T)) => void] {
  const [valeur, setValeur] = useState<T>(() => {
    const v = valeurVue(cle, defaut);
    return valide && !valide(v) ? defaut : v;
  });

  const changer = useCallback((v: T | ((prec: T) => T)) => {
    setValeur(prec => {
      const suivant = typeof v === 'function' ? (v as (p: T) => T)(prec) : v;
      const sac = lire();
      sac[cle] = suivant;
      ecrire(sac);
      return suivant;
    });
  }, [cle]);

  return [valeur, changer];
}
