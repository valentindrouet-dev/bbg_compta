/**
 * Aller directement à une ligne, depuis n'importe où dans l'app.
 *
 * Les contrôles comptables listent des écritures fautives : cliquer l'une
 * d'elles ouvre la page qui la contient, déroule jusqu'à elle et la fait
 * clignoter. Plus besoin de la chercher à la main.
 */
import { useEffect } from 'react';

/** Ce que la page de destination reçoit : l'écriture visée, et un compteur
 *  qui change à chaque clic pour rejouer l'animation sur la même ligne. */
export interface Cible {
  ligne: string;
  /** Incrémenté à chaque demande : deux clics de suite sur la même ligne
   *  refont défiler et clignoter. */
  n: number;
}

const DUREE_SURBRILLANCE = 2600;

/**
 * Fait défiler jusqu'à l'élément portant `data-ligne="<id>"` et le met en
 * évidence. La page vient peut-être de changer de mois : on réessaie
 * quelques dixièmes de seconde le temps qu'elle se redessine.
 */
export function useCibleLigne(cible: Cible | undefined) {
  useEffect(() => {
    if (!cible) return;
    let annule = false;
    let essais = 0;
    let minuterie: number | undefined;

    function chercher() {
      if (annule) return;
      const el = document.querySelector<HTMLElement>(`[data-ligne="${CSS.escape(cible!.ligne)}"]`);
      if (!el) {
        if (++essais < 20) minuterie = window.setTimeout(chercher, 60);
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('ligne-ciblee');
      minuterie = window.setTimeout(() => el.classList.remove('ligne-ciblee'), DUREE_SURBRILLANCE);
    }

    minuterie = window.setTimeout(chercher, 60);
    return () => {
      annule = true;
      if (minuterie) window.clearTimeout(minuterie);
      document.querySelectorAll('.ligne-ciblee').forEach(el => el.classList.remove('ligne-ciblee'));
    };
  }, [cible]);
}
