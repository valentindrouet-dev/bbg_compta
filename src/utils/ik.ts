/**
 * Indemnités kilométriques : le barème fiscal des voitures et le calcul des
 * indemnités dues à partir du relevé des trajets.
 *
 * Le barème s'applique à la distance professionnelle parcourue dans l'ANNÉE
 * civile, véhicule par véhicule, en trois tranches : jusqu'à 5 000 km, de
 * 5 001 à 20 000 km, au-delà. Pour qu'aucune régularisation ne soit nécessaire
 * en décembre, chaque trajet reçoit la différence entre le barème appliqué au
 * cumul après lui et au cumul avant lui : le total de l'année retombe
 * exactement sur le barème appliqué à la distance de l'année.
 */
import type { DonneesIK, PuissanceFiscale, TrajetIK, VehiculeIK } from '../types';
import { r2 } from './money';

export interface TrancheIK {
  /** Borne haute de la tranche, en km ; null pour la dernière. */
  jusqua: number | null;
  /** Montant = distance × taux + fixe. */
  taux: number;
  fixe: number;
}

/**
 * Barème des voitures (thermiques, hybrides, hydrogène), publié en 2024 et
 * reconduit à l'identique en 2025 et en 2026. Les barèmes sont rangés par
 * année de publication ; quand un nouveau paraît, il s'ajoute sous son année.
 */
const BAREME_2024: Record<PuissanceFiscale, TrancheIK[]> = {
  3: [{ jusqua: 5000, taux: 0.529, fixe: 0 }, { jusqua: 20000, taux: 0.316, fixe: 1065 }, { jusqua: null, taux: 0.370, fixe: 0 }],
  4: [{ jusqua: 5000, taux: 0.606, fixe: 0 }, { jusqua: 20000, taux: 0.340, fixe: 1330 }, { jusqua: null, taux: 0.407, fixe: 0 }],
  5: [{ jusqua: 5000, taux: 0.636, fixe: 0 }, { jusqua: 20000, taux: 0.357, fixe: 1395 }, { jusqua: null, taux: 0.427, fixe: 0 }],
  6: [{ jusqua: 5000, taux: 0.665, fixe: 0 }, { jusqua: 20000, taux: 0.374, fixe: 1457 }, { jusqua: null, taux: 0.447, fixe: 0 }],
  7: [{ jusqua: 5000, taux: 0.697, fixe: 0 }, { jusqua: 20000, taux: 0.394, fixe: 1515 }, { jusqua: null, taux: 0.470, fixe: 0 }],
};

export const BAREMES_IK: Record<number, Record<PuissanceFiscale, TrancheIK[]>> = {
  2024: BAREME_2024,
  2025: BAREME_2024,
  // Vérifié sur le barème 2026 publié : les quinze coefficients sont inchangés.
  2026: BAREME_2024,
};

/** Majoration du barème pour un véhicule 100 % électrique. */
export const MAJORATION_ELECTRIQUE = 0.2;

export const PUISSANCES: { value: PuissanceFiscale; label: string }[] = [
  { value: 3, label: '3 CV et moins' },
  { value: 4, label: '4 CV' },
  { value: 5, label: '5 CV' },
  { value: 6, label: '6 CV' },
  { value: 7, label: '7 CV et plus' },
];

/** Le barème d'une année : le sien s'il est publié, sinon le dernier connu. */
export function baremeDe(annee: number): { annee: number; publie: boolean; bareme: Record<PuissanceFiscale, TrancheIK[]> } {
  const annees = Object.keys(BAREMES_IK).map(Number).sort((a, b) => a - b);
  const retenue = [...annees].reverse().find(a => a <= annee) ?? annees[0];
  return { annee: retenue, publie: retenue === annee, bareme: BAREMES_IK[retenue] };
}

/** La tranche du barème où tombe une distance annuelle. */
export function trancheDe(tranches: TrancheIK[], d: number): TrancheIK {
  return tranches.find(t => t.jusqua == null || d <= t.jusqua) ?? tranches[tranches.length - 1];
}

/** Indemnités d'une distance annuelle d, au barème, électrique compris. */
export function indemniteAnnuelle(d: number, v: Pick<VehiculeIK, 'cv' | 'electrique'>, annee: number): number {
  if (d <= 0) return 0;
  const t = trancheDe(baremeDe(annee).bareme[v.cv], d);
  const base = d * t.taux + t.fixe;
  return r2(base * (v.electrique ? 1 + MAJORATION_ELECTRIQUE : 1));
}

/** La formule de la tranche, telle que le barème l'écrit : « d × 0,636 ». */
export function formuleTranche(t: TrancheIK): string {
  const taux = t.taux.toLocaleString('fr-FR', { minimumFractionDigits: 3 });
  return t.fixe ? `(d × ${taux}) + ${t.fixe.toLocaleString('fr-FR')}` : `d × ${taux}`;
}

/** Distance retenue pour un trajet : doublée pour un aller-retour. */
export function kmRetenus(t: Pick<TrajetIK, 'km' | 'allerRetour'>): number {
  return r2((t.km || 0) * (t.allerRetour ? 2 : 1));
}

export const anneeDe = (iso: string) => Number(iso.slice(0, 4));
export const moisDe = (iso: string) => iso.slice(0, 7);

/** Un trajet et ce qu'il vaut, une fois rangé dans l'ordre de l'année. */
export interface TrajetCalcule {
  trajet: TrajetIK;
  vehicule: VehiculeIK | undefined;
  km: number;
  /** Cumul du véhicule sur l'année, ce trajet compris. */
  cumulKm: number;
  indemnite: number;
}

/** Ordre du relevé : par date, puis dans l'ordre de saisie. */
export function trierTrajets(trajets: TrajetIK[]): TrajetIK[] {
  return trajets
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.date.localeCompare(b.t.date) || a.i - b.i)
    .map(x => x.t);
}

/**
 * Les trajets d'une année civile, chacun avec ses indemnités : le barème
 * appliqué au cumul du véhicule après le trajet, moins le même avant lui.
 */
export function calculerAnnee(ik: DonneesIK, annee: number): TrajetCalcule[] {
  const vehicules = new Map(ik.vehicules.map(v => [v.id, v]));
  const cumul = new Map<string, number>();
  return trierTrajets(ik.trajets.filter(t => anneeDe(t.date) === annee)).map(t => {
    const v = vehicules.get(t.vehiculeId);
    const km = kmRetenus(t);
    const avant = cumul.get(t.vehiculeId) ?? 0;
    const apres = r2(avant + km);
    cumul.set(t.vehiculeId, apres);
    const indemnite = v ? r2(indemniteAnnuelle(apres, v, annee) - indemniteAnnuelle(avant, v, annee)) : 0;
    return { trajet: t, vehicule: v, km, cumulKm: apres, indemnite };
  });
}

export interface MoisIK {
  mois: string;
  trajets: number;
  km: number;
  indemnite: number;
}

/** Les douze mois d'une année civile, même vides. */
export function moisDeLAnnee(calcules: TrajetCalcule[], annee: number): MoisIK[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mois = `${annee}-${String(i + 1).padStart(2, '0')}`;
    const du = calcules.filter(c => moisDe(c.trajet.date) === mois);
    return {
      mois,
      trajets: du.length,
      km: r2(du.reduce((s, c) => s + c.km, 0)),
      indemnite: r2(du.reduce((s, c) => s + c.indemnite, 0)),
    };
  });
}

/** Les années à proposer : celles des trajets, l'année en cours et 2027. */
export function anneesIK(ik: DonneesIK, anneeCourante: number): number[] {
  const set = new Set<number>([anneeCourante, 2027]);
  for (const t of ik.trajets) if (/^\d{4}/.test(t.date)) set.add(anneeDe(t.date));
  return [...set].sort((a, b) => a - b);
}

/** Les trajets déjà faits, sans doublon, pour les reprendre d'un clic. */
export function trajetsFrequents(trajets: TrajetIK[]): Omit<TrajetIK, 'id' | 'date'>[] {
  const vus = new Map<string, Omit<TrajetIK, 'id' | 'date'> & { n: number; derniere: string }>();
  for (const t of trajets) {
    if (!t.depart && !t.arrivee) continue;
    const cle = [t.depart, t.arrivee, t.km, t.allerRetour, t.motif, t.vehiculeId].join('|').toLowerCase();
    const prec = vus.get(cle);
    const { id: _id, date, ...reste } = t;
    vus.set(cle, { ...reste, n: (prec?.n ?? 0) + 1, derniere: prec && prec.derniere > date ? prec.derniere : date });
  }
  return [...vus.values()]
    .sort((a, b) => b.derniere.localeCompare(a.derniere) || b.n - a.n)
    .slice(0, 15)
    .map(({ n: _n, derniere: _d, ...t }) => t);
}

export const IK_VIDE: DonneesIK = { vehicules: [], trajets: [], passages: {} };
