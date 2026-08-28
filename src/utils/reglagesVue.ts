/**
 * Les réglages d'affichage communs à toutes les pages de chiffres.
 *
 * HT ou TTC, vue détaillée ou simplifiée, sous-totaux de groupes affichés ou
 * non : ce sont des façons de lire, pas des réglages de page. Les régler dans
 * la synthèse et les retrouver différents au prévisionnel obligeait à les
 * remettre à chaque fois. Une seule clé pour chacun, partagée partout, et
 * retrouvée au rechargement.
 */
import { useEtatVue } from './etatVue';

export type BaseMontant = 'ht' | 'ttc';

/** HT (la base du résultat) ou TTC (ce qui sort vraiment du compte). */
export function useBaseMontant() {
  return useEtatVue<BaseMontant>('vue.base', 'ht', v => v === 'ht' || v === 'ttc');
}

/** Vue simplifiée : les totaux seuls, sans le détail des lignes. */
export function useVueSimplifiee() {
  return useEtatVue<boolean>('vue.simple', false, v => typeof v === 'boolean');
}

/**
 * Les sous-totaux des groupes de catégories (« Sous-total Workshops »,
 * « Total EDIT »). Sur un tableau qui compte beaucoup de groupes, ils doublent
 * le nombre de lignes ; on peut vouloir ne garder que le total du bloc.
 */
export function useSousTotaux() {
  return useEtatVue<boolean>('vue.sousTotaux', true, v => typeof v === 'boolean');
}
