/**
 * Les mouvements financiers — ce qui bouge sur le compte sans être une charge
 * ni un produit : apport en capital, compte courant d'associé, placement.
 *
 * La liste est partagée par la page Trésorerie, qui enregistre ce qui a eu
 * lieu, et par la trésorerie prévisionnelle, qui accepte les mêmes mouvements
 * mais seulement prévus. Un seul endroit pour les libellés, sinon les deux
 * écrans finissent par nommer différemment la même chose.
 */
import type { FinanceEntry } from '../types';

export const FINANCE_TYPES: { value: FinanceEntry['type']; label: string }[] = [
  { value: 'capital', label: 'Capital social' },
  { value: 'cca', label: "Compte courant d'associé — apport" },
  { value: 'remboursement_cca', label: "Compte courant d'associé — remboursement" },
  { value: 'placement', label: 'Placement' },
  { value: 'produit_financier', label: 'Produit financier' },
  { value: 'autre', label: 'Autre' },
];
