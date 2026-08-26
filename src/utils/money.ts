/** Arrondi monétaire à 2 décimales (0.005 -> 0.01). */
export function r2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmt0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** « 1 234,56 € » */
export function euros(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return '—';
  return fmt.format(r2(x));
}

/** « 1 235 € » (montants agrégés) */
export function euros0(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return '—';
  return fmt0.format(x);
}

/** TVA contenue dans un TTC au taux donné (ex. 20 -> ttc - ttc/1,20). */
export function tvaDepuisTTC(ttc: number, taux: number): number {
  if (taux <= 0) return 0;
  return r2(ttc - ttc / (1 + taux / 100));
}

export function pourcent(x: number | null | undefined, digits = 0): string {
  if (x == null || Number.isNaN(x) || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits).replace('.', ',')} %`;
}

/** Parse un nombre saisi à la française (« 1 234,56 »). */
export function parseMontant(s: string): number | null {
  const t = s.trim().replace(/\s| /g, '').replace(',', '.').replace('€', '');
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
