/**
 * Le registre des placements : où l'argent est placé, pour combien de temps,
 * et ce qu'il doit rapporter. Tout se calcule ici, la page ne fait qu'afficher.
 */
import type { GarantiePlacement, Placement, ProduitPlacement } from '../types';
import { r2 } from './money';

export const PRODUITS_PLACEMENT: { value: ProduitPlacement; label: string }[] = [
  // La clé reste « compte_a_terme » : seul le libellé change, les placements
  // déjà notés n'ont rien à réécrire.
  { value: 'compte_a_terme', label: 'Dépôt à terme' },
  { value: 'livret', label: 'Livret' },
  { value: 'compte_remunere', label: 'Compte rémunéré' },
  { value: 'fonds', label: 'Fonds / SICAV' },
  { value: 'obligations', label: 'Obligations' },
  { value: 'autre', label: 'Autre' },
];

export const GARANTIES_PLACEMENT: { value: GarantiePlacement; label: string; aide: string }[] = [
  {
    value: 'tout', label: 'Tout est sûr',
    aide: 'Le montant placé et les intérêts sont connus d\'avance — un dépôt à terme à taux fixe.',
  },
  {
    value: 'capital', label: 'Capital seul sûr',
    aide: 'Le montant placé est garanti, mais le taux peut changer en route — un livret, un compte rémunéré.',
  },
  {
    value: 'rien', label: "Rien n'est sûr",
    aide: 'Le placement peut perdre de la valeur — un fonds, des obligations revendues avant terme.',
  },
];

/**
 * Ajoute n mois à une date ISO, sans passer par l'heure : un calcul en heure
 * locale puis relu en UTC décale la date d'un jour en France. Un 31 janvier
 * plus un mois tombe le dernier jour de février.
 */
export function ajouterMois(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const rang = y * 12 + (m - 1) + n;
  const an = Math.floor(rang / 12);
  const mois = rang - an * 12 + 1;
  const dernierJour = new Date(Date.UTC(an, mois, 0)).getUTCDate();
  return `${an}-${String(mois).padStart(2, '0')}-${String(Math.min(d, dernierJour)).padStart(2, '0')}`;
}

/** Date d'échéance ; `null` pour un placement sans échéance (livret). */
export function echeancePlacement(p: Placement): string | null {
  return p.dureeMois && p.dureeMois > 0 && p.debut ? ajouterMois(p.debut, p.dureeMois) : null;
}

/**
 * Rémunération calculée, en intérêts simples — le cas des dépôts à terme :
 * montant × taux annuel × durée en années. Sans échéance, c'est ce que le
 * placement rapporte sur un an.
 */
export function remunerationCalculee(p: Placement): number {
  const mois = p.dureeMois && p.dureeMois > 0 ? p.dureeMois : 12;
  return r2(p.montant * (p.taux / 100) * (mois / 12));
}

/** La rémunération attendue : celle qu'on a saisie, sinon le calcul. */
export function remunerationAttendue(p: Placement): number {
  return p.remunerationSaisie ?? remunerationCalculee(p);
}

export type StatutPlacement = 'a_venir' | 'en_cours' | 'echu' | 'recupere';

/**
 * Où en est le placement, à la date du jour. Échu : l'échéance est passée
 * mais l'argent n'est pas noté comme revenu — c'est le cas à surveiller.
 */
export function statutPlacement(p: Placement, aujourdhui: string): StatutPlacement {
  if (p.recupereLe) return 'recupere';
  if (p.debut > aujourdhui) return 'a_venir';
  const fin = echeancePlacement(p);
  if (fin && fin <= aujourdhui) return 'echu';
  return 'en_cours';
}

export const LIBELLE_STATUT: Record<StatutPlacement, string> = {
  a_venir: 'À venir',
  en_cours: 'En cours',
  echu: 'Échu — à récupérer',
  recupere: 'Récupéré',
};

/** Ce que le placement a réellement rapporté, une fois l'argent revenu. */
export function gainReel(p: Placement): number | null {
  return p.recupereLe && p.montantRecupere != null ? r2(p.montantRecupere - p.montant) : null;
}

/**
 * Les chiffres du haut de la page, sur les placements pas encore revenus :
 * l'argent qui travaille, ce qu'il doit rapporter, à quel taux moyen, et la
 * prochaine date à surveiller.
 */
export function resumePlacements(placements: Placement[], aujourdhui: string) {
  // Les quatre cartes lisent le même ensemble : tout ce qui n'est pas revenu,
  // placements à venir compris. Un dépôt signé qui démarre dans cinq jours est
  // de l'argent engagé ; l'encours l'ignorait alors que la rémunération, le
  // taux moyen et la prochaine échéance le comptaient déjà. La part encore à
  // placer est donnée à part, avec sa date.
  const actifs = placements.filter(p => statutPlacement(p, aujourdhui) !== 'recupere');
  const aVenir = actifs.filter(p => statutPlacement(p, aujourdhui) === 'a_venir');
  const encours = r2(actifs.reduce((s, p) => s + p.montant, 0));
  const aPlacer = r2(aVenir.reduce((s, p) => s + p.montant, 0));
  const departs = [...new Set(aVenir.map(p => p.debut))].sort();
  const remuneration = r2(actifs.reduce((s, p) => s + remunerationAttendue(p), 0));
  const remunerationSure = r2(actifs.filter(p => p.garantie === 'tout')
    .reduce((s, p) => s + remunerationAttendue(p), 0));
  const capitalSur = r2(actifs.filter(p => p.garantie !== 'rien').reduce((s, p) => s + p.montant, 0));
  const base = actifs.reduce((s, p) => s + p.montant, 0);
  const tauxMoyen = base ? r2(actifs.reduce((s, p) => s + p.montant * p.taux, 0) / base) : 0;
  const echus = actifs.filter(p => statutPlacement(p, aujourdhui) === 'echu');
  const prochaine = actifs
    .map(p => ({ p, fin: echeancePlacement(p) }))
    .filter((x): x is { p: Placement; fin: string } => !!x.fin && x.fin > aujourdhui)
    .sort((a, b) => a.fin.localeCompare(b.fin))[0] ?? null;
  const gains = placements.map(gainReel).filter((g): g is number => g != null);
  return {
    nbActifs: actifs.length, encours, remuneration,
    /** Ce qui reste à placer, et quand : la première date de départ, et s'il y en a d'autres. */
    aPlacer, nbAVenir: aVenir.length, premierDepart: departs[0] ?? null,
    departsMultiples: departs.length > 1,
    remunerationSure, capitalSur, tauxMoyen, echus, prochaine,
    gainsRealises: gains.length ? r2(gains.reduce((s, g) => s + g, 0)) : null,
  };
}
