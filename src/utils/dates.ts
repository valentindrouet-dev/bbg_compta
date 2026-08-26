// Exercice fiscal BBG : septembre -> août. « pre-immat » regroupe mai-août 2025.

export const PRE_IMMAT = 'pre-immat';

export const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const EXERCICES = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30'] as const;

/** Premier exercice : le seul à porter la pré-immatriculation et septembre 2025. */
export const PREMIER_EXERCICE = '2025-26';

/**
 * Mois comptables d'un exercice, dans l'ordre.
 * L'exercice BBG court d'octobre au 30 septembre suivant (12 mois).
 * Le premier exercice (2025-26) compte en plus la période de
 * pré-immatriculation et septembre 2025, soit 14 onglets.
 */
export function moisExercice(exercice: string): string[] {
  const y = parseInt(exercice.slice(0, 4), 10);
  const mois: string[] = [];
  for (let m = 10; m <= 12; m++) mois.push(`${y}-${String(m).padStart(2, '0')}`);
  for (let m = 1; m <= 9; m++) mois.push(`${y + 1}-${String(m).padStart(2, '0')}`);
  if (exercice === PREMIER_EXERCICE) return [PRE_IMMAT, `${y}-09`, ...mois];
  return mois;
}

/** Exercice de rattachement d'un mois comptable (octobre ouvre l'exercice). */
export function exerciceDuMois(mois: string): string {
  if (mois === PRE_IMMAT) return PREMIER_EXERCICE;
  // Mois supplémentaires de la première année : rattachés à 2025-26.
  if (mois === '2025-09') return PREMIER_EXERCICE;
  const [y, m] = mois.split('-').map(Number);
  const startYear = m >= 10 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** Libellé court d'un mois comptable : « sept. 25 », « Pré-immat ». */
export function labelMois(mois: string): string {
  if (mois === PRE_IMMAT) return 'Pré-immat';
  const [y, m] = mois.split('-').map(Number);
  const noms = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${noms[m - 1]} ${String(y).slice(2)}`;
}

/** Libellé long : « Septembre 2025 ». */
export function labelMoisLong(mois: string): string {
  if (mois === PRE_IMMAT) return 'Pré-immatriculation (mai → août 2025)';
  const [y, m] = mois.split('-').map(Number);
  const nom = MOIS_NOMS[m - 1];
  return nom.charAt(0).toUpperCase() + nom.slice(1) + ' ' + y;
}

/** Mois comptable par défaut pour une date ISO. */
export function moisDeDate(dateISO: string): string {
  const mois = dateISO.slice(0, 7);
  return mois < '2025-09' ? PRE_IMMAT : mois;
}

/** Mois comptable courant (borné à la plage des exercices connus). */
export function moisCourant(): string {
  const now = new Date();
  const mois = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return mois < '2025-09' ? PRE_IMMAT : mois;
}

/** Compare deux mois comptables (pre-immat en premier). */
export function compareMois(a: string, b: string): number {
  if (a === b) return 0;
  if (a === PRE_IMMAT) return -1;
  if (b === PRE_IMMAT) return 1;
  return a < b ? -1 : 1;
}

export function formatDateFR(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Ajoute n années à une date ISO (pour la fin d'amortissement). */
export function addYears(iso: string, years: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}
