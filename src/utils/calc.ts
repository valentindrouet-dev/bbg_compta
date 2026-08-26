import type { JournalEntry, FinanceEntry } from '../types';
import { compareMois, moisExercice, addYears, PRE_IMMAT } from './dates';
import { r2 } from './money';

// ----- Sélections de base ------------------------------------------------

export function entriesDuMois(entries: JournalEntry[], mois: string): JournalEntry[] {
  return entries.filter(e => e.mois === mois);
}

export function isJeux(e: JournalEntry, categoriesJeux: string[]): boolean {
  return e.type !== 'produit' && categoriesJeux.includes(e.categorie);
}

// ----- Agrégats mensuels -------------------------------------------------

export interface TotalTTH { ttc: number; tva: number; ht: number }

export function sumTTH(list: JournalEntry[]): TotalTTH {
  let ttc = 0, tva = 0, ht = 0;
  for (const e of list) { ttc += e.ttc; tva += e.tva; ht += e.ht; }
  return { ttc: r2(ttc), tva: r2(tva), ht: r2(ht) };
}

/** Somme HT par catégorie pour une liste d'écritures. */
export function sumParCategorie(list: JournalEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of list) m.set(e.categorie, (m.get(e.categorie) ?? 0) + e.ht);
  return m;
}

/** Tous les mois comptables présents dans le journal, triés. */
export function moisPresents(entries: JournalEntry[]): string[] {
  return [...new Set(entries.map(e => e.mois))].sort(compareMois);
}

/** Mois du mouvement financier (rattaché à pre-immat avant sept. 2025). */
export function moisDeFinance(f: FinanceEntry): string {
  return f.date < '2025-09-01' ? PRE_IMMAT : f.date.slice(0, 7);
}

/**
 * Plage de mois continue couvrant journal, mouvements financiers et mois courant
 * — la même pour la page Trésorerie et le tableau de bord.
 */
export function moisTresorerie(entries: JournalEntry[], finances: FinanceEntry[], moisCourantKey: string): string[] {
  const bornes = new Set(moisPresents(entries));
  for (const f of finances) bornes.add(moisDeFinance(f));
  bornes.add(moisCourantKey);
  const sorted = [...bornes].sort(compareMois);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const out: string[] = [];
  let cur = first;
  while (compareMois(cur, last) <= 0) {
    out.push(cur);
    if (cur === PRE_IMMAT) { cur = '2025-09'; continue; }
    const [y, m] = cur.split('-').map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return out;
}

// ----- Immobilisations & amortissements ----------------------------------

export interface ImmoInfo {
  entry: JournalEntry;
  duree: number;
  dotationAn: number;
  dotationMois: number;
  fin: string;
  /** Valeur nette comptable à une date donnée (linéaire, prorata mensuel). */
  vnc: (atISO: string) => number;
}

export function immoInfos(entries: JournalEntry[]): ImmoInfo[] {
  return entries.filter(e => e.type === 'immo').map(e => {
    const duree = e.immoDureeAns && e.immoDureeAns > 0 ? e.immoDureeAns : 5;
    const dotationAn = e.ht / duree;
    const dotationMois = e.ht / (duree * 12);
    const fin = addYears(e.date, duree);
    return {
      entry: e, duree, dotationAn: r2(dotationAn), dotationMois: r2(dotationMois), fin,
      vnc: (atISO: string) => {
        const start = new Date(e.date + 'T00:00:00');
        const at = new Date(atISO + 'T00:00:00');
        const moisEcoules = Math.max(0, (at.getFullYear() - start.getFullYear()) * 12 + at.getMonth() - start.getMonth());
        return r2(Math.max(0, e.ht - Math.min(moisEcoules, duree * 12) * dotationMois));
      },
    };
  });
}

/** Dotation mensuelle totale au titre d'un mois comptable donné (immos actives). */
export function dotationDuMois(infos: ImmoInfo[], mois: string): number {
  const ref = mois === PRE_IMMAT ? '2025-08' : mois;
  let total = 0;
  for (const i of infos) {
    const debut = i.entry.date.slice(0, 7);
    const finM = i.fin.slice(0, 7);
    if (debut <= ref && ref < finM) total += i.entry.ht / (i.duree * 12);
  }
  return r2(total);
}

// ----- TVA ---------------------------------------------------------------

export interface TvaMois {
  mois: string;
  caTTC: number; caHT: number; tvaCollectee: number;
  depTTC: number; depHT: number; tvaDeductible: number;
  /** Collectée - déductible : positif = TVA à reverser, négatif = crédit. */
  solde: number;
  cumul: number;
}

export function tableauTVA(entries: JournalEntry[], moisList: string[]): TvaMois[] {
  const rows: TvaMois[] = [];
  let cumul = 0;
  for (const mois of moisList) {
    const du = entriesDuMois(entries, mois);
    const prod = sumTTH(du.filter(e => e.type === 'produit'));
    const dep = sumTTH(du.filter(e => e.type !== 'produit'));
    const solde = r2(prod.tva - dep.tva);
    cumul = r2(cumul + solde);
    rows.push({
      mois,
      caTTC: prod.ttc, caHT: prod.ht, tvaCollectee: prod.tva,
      depTTC: dep.ttc, depHT: dep.ht, tvaDeductible: dep.tva,
      solde, cumul,
    });
  }
  return rows;
}

// ----- Trésorerie --------------------------------------------------------

export interface TresoMois {
  mois: string;
  soldeInitial: number;
  encaissements: number;
  decaissements: number;
  soldeMensuel: number;
  soldeCumule: number;
}

/**
 * Trésorerie mensuelle réalisée : produits TTC + mouvements financiers positifs
 * en encaissements ; charges + immos TTC + mouvements négatifs en décaissements.
 */
export function tableauTreso(entries: JournalEntry[], finances: FinanceEntry[], moisList: string[]): TresoMois[] {
  const rows: TresoMois[] = [];
  let solde = 0;
  for (const mois of moisList) {
    const du = entriesDuMois(entries, mois);
    const finDuMois = finances.filter(f => moisDeFinance(f) === mois);
    const enc = du.filter(e => e.type === 'produit').reduce((s, e) => s + e.ttc, 0)
      + finDuMois.filter(f => f.montant > 0).reduce((s, f) => s + f.montant, 0);
    const dec = du.filter(e => e.type !== 'produit').reduce((s, e) => s + e.ttc, 0)
      - finDuMois.filter(f => f.montant < 0).reduce((s, f) => s + f.montant, 0);
    const soldeInitial = solde;
    const mensuel = r2(enc - dec);
    solde = r2(solde + mensuel);
    rows.push({
      mois, soldeInitial, encaissements: r2(enc), decaissements: r2(dec),
      soldeMensuel: mensuel, soldeCumule: solde,
    });
  }
  return rows;
}

// ----- Synthèse par exercice --------------------------------------------

/** Base de restitution des montants : hors taxes ou toutes taxes comprises. */
export type BaseMontant = 'ht' | 'ttc';

export interface SyntheseExercice {
  moisList: string[];
  base: BaseMontant;
  /** catégorie -> (mois -> HT) pour les charges hors jeux. */
  charges: Map<string, Map<string, number>>;
  /** idem pour les catégories jeux. */
  jeux: Map<string, Map<string, number>>;
  /** idem pour les produits. */
  produits: Map<string, Map<string, number>>;
  totalChargesParMois: Map<string, number>;
  totalTTCParMois: Map<string, number>;
  totalJeuxParMois: Map<string, number>;
  totalProduitsParMois: Map<string, number>;
  totalProduitsTTCParMois: Map<string, number>;
  immoParMois: Map<string, number>;
  /** Immobilisations ventilées par catégorie, comme les charges. */
  immos: Map<string, Map<string, number>>;
  /** Dépenses jeux ventilées par jeu puis par mois. */
  jeuxParJeu: Map<string, Map<string, number>>;
}

export function syntheseExercice(
  entries: JournalEntry[], exercice: string, categoriesJeux: string[],
  base: BaseMontant = 'ht',
): SyntheseExercice {
  const moisList = moisExercice(exercice);
  /** Montant retenu selon la base choisie (bouton HT / TTC de la synthèse). */
  const montant = (e: JournalEntry) => base === 'ttc' ? e.ttc : e.ht;
  const charges = new Map<string, Map<string, number>>();
  const jeux = new Map<string, Map<string, number>>();
  const produits = new Map<string, Map<string, number>>();
  const totalChargesParMois = new Map<string, number>();
  const totalTTCParMois = new Map<string, number>();
  const totalJeuxParMois = new Map<string, number>();
  const totalProduitsParMois = new Map<string, number>();
  const totalProduitsTTCParMois = new Map<string, number>();
  const immoParMois = new Map<string, number>();
  const immos = new Map<string, Map<string, number>>();
  const jeuxParJeu = new Map<string, Map<string, number>>();

  const add = (m: Map<string, Map<string, number>>, cat: string, mois: string, v: number) => {
    if (!m.has(cat)) m.set(cat, new Map());
    const row = m.get(cat)!;
    row.set(mois, (row.get(mois) ?? 0) + v);
  };
  const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const e of entries) {
    if (!moisList.includes(e.mois)) continue;
    const v = montant(e);
    if (e.type === 'produit') {
      add(produits, e.categorie, e.mois, v);
      bump(totalProduitsParMois, e.mois, v);
      bump(totalProduitsTTCParMois, e.mois, e.ttc);
    } else if (categoriesJeux.includes(e.categorie)) {
      add(jeux, e.categorie, e.mois, v);
      add(jeuxParJeu, e.jeu || '— non rattaché —', e.mois, v);
      bump(totalJeuxParMois, e.mois, v);
      bump(totalTTCParMois, e.mois, e.ttc);
    } else if (e.type === 'immo') {
      // Une immobilisation n'est pas une charge de l'exercice : elle est
      // suivie à part, et c'est sa dotation annuelle qui pèse sur le résultat.
      add(immos, e.categorie, e.mois, v);
      bump(immoParMois, e.mois, v);
      bump(totalTTCParMois, e.mois, e.ttc);
    } else {
      add(charges, e.categorie, e.mois, v);
      bump(totalChargesParMois, e.mois, v);
      bump(totalTTCParMois, e.mois, e.ttc);
    }
  }
  return {
    moisList, base, charges, jeux, produits, totalChargesParMois, totalTTCParMois,
    totalJeuxParMois, totalProduitsParMois, totalProduitsTTCParMois, immoParMois,
    immos, jeuxParJeu,
  };
}

/** Écritures qui composent une cellule de la synthèse (pour l'aperçu au survol). */
export function ecrituresDeCellule(
  entries: JournalEntry[], mois: string, opts: { categorie?: string; jeu?: string; type?: 'charges' | 'immo' | 'produit' },
): JournalEntry[] {
  return entries.filter(e => {
    if (e.mois !== mois) return false;
    if (opts.categorie != null && e.categorie !== opts.categorie) return false;
    if (opts.jeu != null && (e.jeu || '— non rattaché —') !== opts.jeu) return false;
    if (opts.type != null && e.type !== opts.type) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** Agrégat comptable d'un jeu : dépenses par catégorie, par mois, total. */
export interface BilanJeu {
  jeu: string;
  nb: number;
  ttc: number;
  ht: number;
  tva: number;
  parCategorie: Map<string, number>;
  parMois: Map<string, number>;
  premiere: string;
  derniere: string;
}

export function bilanJeux(entries: JournalEntry[], categoriesJeux: string[]): BilanJeu[] {
  const par = new Map<string, BilanJeu>();
  for (const e of entries) {
    if (!categoriesJeux.includes(e.categorie)) continue;
    const jeu = e.jeu || '— non rattaché —';
    if (!par.has(jeu)) {
      par.set(jeu, {
        jeu, nb: 0, ttc: 0, ht: 0, tva: 0,
        parCategorie: new Map(), parMois: new Map(),
        premiere: e.date, derniere: e.date,
      });
    }
    const b = par.get(jeu)!;
    b.nb++; b.ttc += e.ttc; b.ht += e.ht; b.tva += e.tva;
    b.parCategorie.set(e.categorie, (b.parCategorie.get(e.categorie) ?? 0) + e.ht);
    b.parMois.set(e.mois, (b.parMois.get(e.mois) ?? 0) + e.ht);
    if (e.date < b.premiere) b.premiere = e.date;
    if (e.date > b.derniere) b.derniere = e.date;
  }
  return [...par.values()]
    .map(b => ({ ...b, ttc: r2(b.ttc), ht: r2(b.ht), tva: r2(b.tva) }))
    .sort((a, b) => b.ht - a.ht);
}
