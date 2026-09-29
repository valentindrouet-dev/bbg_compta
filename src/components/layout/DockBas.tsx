import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Toasts } from './Toasts';

/** Le réceptacle des barres flottantes posées par les pages. */
const ID_BARRES = 'dock-bas-barres';

/**
 * Le bas de l'écran, par-dessus la page : les barres contextuelles (lignes
 * sélectionnées, ligne copiée) et les confirmations y flottent sans jamais
 * pousser le contenu. Le dock est centré sur la zone de contenu — la barre
 * latérale de 264 px exclue. Il flotte juste au-dessus de la bande qu'occupe
 * la barre d'annulation, en bas à droite : il peut ainsi prendre toute la
 * largeur sans jamais la recouvrir. Les confirmations s'empilent au-dessus des
 * barres : un message ne cache jamais les boutons qu'on s'apprête à utiliser.
 */
export function DockBas() {
  return (
    <div
      className="fixed bottom-16 left-[264px] right-0 z-40 px-6 flex flex-col items-center gap-2
        pointer-events-none"
    >
      <Toasts />
      <div id={ID_BARRES} className="contents" />
    </div>
  );
}

/**
 * Pose une barre dans le dock du bas. Elle apparaît par-dessus la page : le
 * tableau ne bouge pas d'un pixel quand on coche une ligne.
 */
export function BarreFlottante({ children }: { children: ReactNode }) {
  const cible = document.getElementById(ID_BARRES);
  return cible ? createPortal(children, cible) : null;
}
