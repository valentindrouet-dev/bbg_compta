import type {
  JournalEntry, FinanceEntry, Referentiels, TresoManuel,
} from '../types';
import { dureeCategorie, estChargeFinanciere, estImmobilisation, estPersonnel } from './blocs';
import {
  compareMois, moisCourant, moisExercice, addYears, todayISO, PRE_IMMAT,
} from './dates';
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

export function immoInfos(entries: JournalEntry[], refs?: Referentiels): ImmoInfo[] {
  return entries.filter(e => estImmobilisation(e, refs)).map(e => {
    const duree = e.immoDureeAns && e.immoDureeAns > 0
      ? e.immoDureeAns
      : (refs ? dureeCategorie(e.categorie, refs) : 5);
    const dotationAn = e.ht / duree;
    const dotationMois = e.ht / (duree * 12);
    const fin = addYears(e.date, duree);
    return {
      entry: e, duree, dotationAn: r2(dotationAn), dotationMois: r2(dotationMois), fin,
      vnc: (atISO: string) => {
        // Cumul des fractions de mois amorties, prorata temporis compris.
        const [y, m, jour] = e.date.split('-').map(Number);
        const joursDuMois = new Date(y, m, 0).getDate();
        const premiere = (joursDuMois - jour + 1) / joursDuMois;
        const [ay, am] = atISO.split('-').map(Number);
        const rang = (ay - y) * 12 + (am - m);
        const dernier = duree * 12;
        if (rang < 0) return r2(e.ht);
        const cumul = premiere
          + (rang >= 1 ? Math.min(rang, dernier - 1) : 0)
          + (rang >= dernier ? 1 - premiere : 0);
        return r2(Math.max(0, e.ht - Math.min(cumul, dernier) * dotationMois));
      },
    };
  });
}

/**
 * Part d'un mois pendant laquelle un bien est amorti — le *prorata temporis*
 * du plan comptable français.
 *
 * Un bien mis en service le 20 d'un mois de 31 jours n'ouvre droit qu'à
 * 12/31 de dotation ce mois-là ; le complément (19/31) est repris au tout
 * dernier mois du plan. La somme des fractions vaut exactement durée × 12
 * mois, donc le cumul des dotations égale exactement la valeur du bien.
 */
export function fractionDuMois(info: ImmoInfo, mois: string): number {
  const ref = mois === PRE_IMMAT ? '2025-08' : mois;
  const debut = info.entry.date.slice(0, 7);
  if (ref < debut) return 0;

  const [y, m, jour] = info.entry.date.split('-').map(Number);
  const joursDuMois = new Date(y, m, 0).getDate();
  const premiereFraction = (joursDuMois - jour + 1) / joursDuMois;

  // Rang du mois demandé depuis l'acquisition (0 = mois d'acquisition).
  const [ry, rm] = ref.split('-').map(Number);
  const rang = (ry - y) * 12 + (rm - m);
  const dernier = info.duree * 12;
  if (rang < 0 || rang > dernier) return 0;
  if (rang === 0) return premiereFraction;
  if (rang === dernier) return 1 - premiereFraction;
  return 1;
}

/** Dotation mensuelle totale au titre d'un mois comptable donné (immos actives). */
export function dotationDuMois(infos: ImmoInfo[], mois: string): number {
  let total = 0;
  for (const i of infos) {
    total += i.entry.ht / (i.duree * 12) * fractionDuMois(i, mois);
  }
  return r2(total);
}

/** Dotations mensuelles sur une plage de mois. */
export function dotationsParMois(infos: ImmoInfo[], moisList: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const mois of moisList) m.set(mois, dotationDuMois(infos, mois));
  return m;
}

/** Intérêts et produits de placement encaissés, par mois comptable. */
export function produitsFinanciersParMois(
  finances: FinanceEntry[], moisList: string[],
): Map<string, number> {
  const dedans = new Set(moisList);
  const m = new Map<string, number>();
  for (const mois of moisList) m.set(mois, 0);
  for (const f of finances) {
    if (f.type !== 'produit_financier') continue;
    const mois = moisDeFinance(f);
    if (!dedans.has(mois)) continue;
    m.set(mois, r2((m.get(mois) ?? 0) + f.montant));
  }
  return m;
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
  /** Produits TTC du journal — retrouvables ligne à ligne dans Journal du mois. */
  encJournal: number;
  /** Dépenses TTC du journal, immobilisations comprises. */
  decJournal: number;
  /** Capital, compte courant, placements, intérêts : signé, hors journal. */
  financier: number;
  /** Correction saisie à la main sur ce mois. */
  ajustement: number;
  /** Totaux d'entrée et de sortie, tous flux confondus. */
  encaissements: number;
  decaissements: number;
  soldeMensuel: number;
  soldeCumule: number;
  /** Relevé bancaire saisi à la main, et l'écart avec le solde calculé. */
  soldeReel?: number;
  ecart?: number;
}

/**
 * Trésorerie mensuelle réalisée : produits TTC + mouvements financiers positifs
 * en encaissements ; charges + immos TTC + mouvements négatifs en décaissements.
 */
/**
 * La trésorerie mois par mois, chaque montant rattaché à sa source.
 *
 * Trois flux se mélangent, et c'est ce mélange qui rendait le tableau illisible
 * quand on le comparait au journal :
 *   - le journal, en TTC : ce sont les seules lignes qu'on retrouve dans
 *     « Journal du mois » ;
 *   - les mouvements financiers (capital, compte courant, placements,
 *     intérêts) : ils ne sont dans aucun journal, ils vivent dans l'onglet
 *     Trésorerie ;
 *   - l'ajustement saisi à la main, pour rattraper un décalage de paiement.
 *
 * Le calcul suppose qu'une écriture est réglée dans son mois comptable. Quand
 * ce n'est pas le cas, c'est l'ajustement qui remet le solde d'aplomb.
 */
/**
 * Le solde de trésorerie, tel qu'il doit s'afficher partout.
 *
 * « Ce qu'on a en banque » est le solde à la fin du **mois en cours**, pas celui
 * de la dernière ligne du tableau : un remboursement déjà planifié en octobre ne
 * doit pas amputer ce qu'on a aujourd'hui. Les mois planifiés au-delà sont
 * donnés à part. Un seul calcul, pour que le tableau de bord et la page
 * Trésorerie ne se contredisent jamais.
 */
export interface SoldeTresorerie {
  /** Le mois dont le solde est retenu — le mois en cours. */
  mois: string;
  /** Solde à la fin de ce mois. */
  solde: number;
  /**
   * Solde **à la date du jour** : le mois en cours n'est compté que jusqu'à
   * aujourd'hui.
   *
   * Un mois n'arrive pas d'un bloc le 1er. Retenir le solde de fin de mois
   * faisait bondir la trésorerie au passage d'un mois à l'autre — un virement
   * daté du 30 était compté dès le 1er — et le chiffre annonçait de l'argent
   * qui n'était pas encore là.
   */
  soldeAujourdhui: number;
  /** Ce qui reste à encaisser ou à payer d'ici la fin du mois en cours. */
  aVenirCeMois: number;
  /** Solde une fois passés les mois déjà planifiés au-delà. */
  soldeApres: number;
  /** Combien de mois sont planifiés après le mois en cours. */
  moisPlanifies: number;
  lignes: TresoMois[];
}

export function soldeTresorerie(
  entries: JournalEntry[], finances: FinanceEntry[],
  manuel: Record<string, TresoManuel> = {},
): SoldeTresorerie {
  const courant = moisCourant();
  const aujourdhui = todayISO();
  const lignes = tableauTreso(entries, finances, moisTresorerie(entries, finances, courant), manuel);
  const i = lignes.findIndex(r => r.mois === courant);
  const retenue = lignes[i >= 0 ? i : lignes.length - 1];
  const apres = lignes.length ? lignes[lignes.length - 1].soldeCumule : 0;
  // Ce qui, dans le mois en cours, porte une date encore à venir : facture à
  // régler le 25, virement attendu le 30. C'est déjà saisi, mais ce n'est pas
  // encore en banque.
  const aVenirCeMois = i < 0 ? 0 : r2(
    entries.filter(e => e.mois === courant && e.date > aujourdhui)
      .reduce((s, e) => s + (e.type === 'produit' ? e.ttc : -e.ttc), 0)
    + finances.filter(f => moisDeFinance(f) === courant && f.date > aujourdhui)
      .reduce((s, f) => s + f.montant, 0));
  return {
    mois: retenue?.mois ?? courant,
    solde: retenue?.soldeCumule ?? 0,
    soldeAujourdhui: r2((retenue?.soldeCumule ?? 0) - aVenirCeMois),
    aVenirCeMois,
    soldeApres: apres,
    moisPlanifies: i >= 0 ? lignes.length - 1 - i : 0,
    lignes,
  };
}

export function tableauTreso(
  entries: JournalEntry[], finances: FinanceEntry[], moisList: string[],
  manuel: Record<string, TresoManuel> = {},
): TresoMois[] {
  const rows: TresoMois[] = [];
  let solde = 0;
  for (const mois of moisList) {
    const du = entriesDuMois(entries, mois);
    const finDuMois = finances.filter(f => moisDeFinance(f) === mois);
    const encJournal = du.filter(e => e.type === 'produit').reduce((s, e) => s + e.ttc, 0);
    const decJournal = du.filter(e => e.type !== 'produit').reduce((s, e) => s + e.ttc, 0);
    const financier = finDuMois.reduce((s, f) => s + f.montant, 0);
    const ajustement = manuel[mois]?.ajustement ?? 0;

    const soldeInitial = solde;
    const mensuel = r2(encJournal - decJournal + financier + ajustement);
    solde = r2(solde + mensuel);
    rows.push({
      mois, soldeInitial,
      encJournal: r2(encJournal), decJournal: r2(decJournal),
      financier: r2(financier), ajustement: r2(ajustement),
      // Conservés pour les pages qui lisent des totaux d'un bloc.
      encaissements: r2(encJournal + Math.max(0, financier) + Math.max(0, ajustement)),
      decaissements: r2(decJournal - Math.min(0, financier) - Math.min(0, ajustement)),
      soldeMensuel: mensuel, soldeCumule: solde,
      soldeReel: manuel[mois]?.soldeReel,
      ecart: manuel[mois]?.soldeReel == null ? undefined : r2(manuel[mois]!.soldeReel! - solde),
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
  /** catégorie -> (mois -> HT) pour les charges hors jeux et hors personnel. */
  charges: Map<string, Map<string, number>>;
  /** idem pour les charges de personnel (cotisations, salaires). */
  personnel: Map<string, Map<string, number>>;
  /** idem pour les catégories jeux. */
  jeux: Map<string, Map<string, number>>;
  /** idem pour les produits. */
  produits: Map<string, Map<string, number>>;
  totalChargesParMois: Map<string, number>;
  totalPersonnelParMois: Map<string, number>;
  /**
   * Toutes les dépenses TTC de l'exercice : charges + personnel + jeux +
   * immobilisations. À ne pas confondre avec `totalChargesTTCParMois`, qui ne
   * porte que le bloc des charges — c'est lui, le pendant TTC du total HT
   * affiché sous les charges.
   */
  totalTTCParMois: Map<string, number>;
  totalChargesTTCParMois: Map<string, number>;
  totalPersonnelTTCParMois: Map<string, number>;
  totalJeuxTTCParMois: Map<string, number>;
  immoTTCParMois: Map<string, number>;
  totalJeuxParMois: Map<string, number>;
  totalProduitsParMois: Map<string, number>;
  totalProduitsTTCParMois: Map<string, number>;
  immoParMois: Map<string, number>;
  /** Immobilisations ventilées par catégorie, comme les charges. */
  immos: Map<string, Map<string, number>>;
  /** Dépenses jeux ventilées par jeu puis par mois. */
  jeuxParJeu: Map<string, Map<string, number>>;
  /** Dépenses jeux ventilées par jeu, puis par catégorie, puis par mois. */
  jeuxParJeuEtCategorie: Map<string, Map<string, Map<string, number>>>;
  /**
   * Dépenses jeux restées en charges. Elles sont DÉJÀ comprises dans
   * `totalChargesParMois` : c'est une ventilation pour mémoire, à ne jamais
   * retrancher une seconde fois du résultat.
   */
  immosParJeu: Map<string, Map<string, number>>;
  immosParJeuEtCategorie: Map<string, Map<string, Map<string, number>>>;
  /** Charges financières par mois : elles sortent de l'excédent brut. */
  chargesFinancieresParMois: Map<string, number>;
  /** Base HT portant de la TVA, côté dépenses puis côté produits. */
  baseTVADepensesParMois: Map<string, number>;
  baseTVAProduitsParMois: Map<string, number>;
  /** TVA elle-même, indépendante du bouton HT / TTC. */
  tvaDeductibleParMois: Map<string, number>;
  tvaCollecteeParMois: Map<string, number>;
}

export function syntheseExercice(
  entries: JournalEntry[], exercice: string, refs: Referentiels,
  base: BaseMontant = 'ht',
): SyntheseExercice {
  const categoriesJeux = refs.categoriesJeux;
  const moisList = moisExercice(exercice);
  /** Montant retenu selon la base choisie (bouton HT / TTC de la synthèse). */
  const montant = (e: JournalEntry) => base === 'ttc' ? e.ttc : e.ht;
  const charges = new Map<string, Map<string, number>>();
  const personnel = new Map<string, Map<string, number>>();
  const jeux = new Map<string, Map<string, number>>();
  const produits = new Map<string, Map<string, number>>();
  const totalChargesParMois = new Map<string, number>();
  const totalPersonnelParMois = new Map<string, number>();
  /** Immobilisations rattachées à un jeu : investissement, pas charge. */
  const immosParJeu = new Map<string, Map<string, number>>();
  const immosParJeuEtCategorie = new Map<string, Map<string, Map<string, number>>>();
  const totalTTCParMois = new Map<string, number>();
  const totalChargesTTCParMois = new Map<string, number>();
  const totalPersonnelTTCParMois = new Map<string, number>();
  const totalJeuxTTCParMois = new Map<string, number>();
  const immoTTCParMois = new Map<string, number>();
  const totalJeuxParMois = new Map<string, number>();
  const totalProduitsParMois = new Map<string, number>();
  const totalProduitsTTCParMois = new Map<string, number>();
  const immoParMois = new Map<string, number>();
  const immos = new Map<string, Map<string, number>>();
  const jeuxParJeu = new Map<string, Map<string, number>>();
  const jeuxParJeuEtCategorie = new Map<string, Map<string, Map<string, number>>>();
  const chargesFinancieresParMois = new Map<string, number>();
  const baseTVADepensesParMois = new Map<string, number>();
  const baseTVAProduitsParMois = new Map<string, number>();
  const tvaDeductibleParMois = new Map<string, number>();
  const tvaCollecteeParMois = new Map<string, number>();

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
      if (e.tva) bump(baseTVAProduitsParMois, e.mois, e.ht);
      bump(tvaCollecteeParMois, e.mois, e.tva);
    } else if (estImmobilisation(e, refs)) {
      // Une immobilisation n'est pas une charge de l'exercice : elle est
      // suivie à part, et c'est sa dotation annuelle qui pèse sur le résultat.
      // Ce test passe AVANT celui des catégories jeux : un développement de jeu
      // porté à l'actif est une immobilisation, pas une dépense de l'exercice.
      // On garde malgré tout la trace de son jeu, pour savoir ce qu'on a investi
      // sur chacun — mais hors du total des charges jeux.
      add(immos, e.categorie, e.mois, v);
      bump(immoParMois, e.mois, v);
      bump(totalTTCParMois, e.mois, e.ttc);
      bump(immoTTCParMois, e.mois, e.ttc);
      if (e.tva) bump(baseTVADepensesParMois, e.mois, e.ht);
      bump(tvaDeductibleParMois, e.mois, e.tva);
      if (categoriesJeux.includes(e.categorie) || e.jeu) {
        const jeu = e.jeu || '— non rattaché —';
        if (!immosParJeu.has(jeu)) immosParJeu.set(jeu, new Map());
        bump(immosParJeu.get(jeu)!, e.mois, v);
        if (!immosParJeuEtCategorie.has(jeu)) immosParJeuEtCategorie.set(jeu, new Map());
        add(immosParJeuEtCategorie.get(jeu)!, e.categorie, e.mois, v);
      }
    } else if (categoriesJeux.includes(e.categorie)) {
      // Un poste de jeu resté en charges EST une charge de l'exercice : il
      // compte dans le bloc Charges. La ventilation par jeu est conservée à
      // côté, pour mémoire — elle ne s'ajoute pas une deuxième fois.
      add(charges, e.categorie, e.mois, v);
      bump(totalChargesParMois, e.mois, v);
      bump(totalChargesTTCParMois, e.mois, e.ttc);
      add(jeux, e.categorie, e.mois, v);
      add(jeuxParJeu, e.jeu || '— non rattaché —', e.mois, v);
      const jeu = e.jeu || '— non rattaché —';
      if (!jeuxParJeuEtCategorie.has(jeu)) jeuxParJeuEtCategorie.set(jeu, new Map());
      add(jeuxParJeuEtCategorie.get(jeu)!, e.categorie, e.mois, v);
      bump(totalJeuxParMois, e.mois, v);
      bump(totalTTCParMois, e.mois, e.ttc);
      bump(totalJeuxTTCParMois, e.mois, e.ttc);
      if (e.tva) bump(baseTVADepensesParMois, e.mois, e.ht);
      bump(tvaDeductibleParMois, e.mois, e.tva);
    } else if (estPersonnel(e.categorie, refs)) {
      add(personnel, e.categorie, e.mois, v);
      bump(totalPersonnelParMois, e.mois, v);
      bump(totalTTCParMois, e.mois, e.ttc);
      bump(totalPersonnelTTCParMois, e.mois, e.ttc);
      if (e.tva) bump(baseTVADepensesParMois, e.mois, e.ht);
      bump(tvaDeductibleParMois, e.mois, e.tva);
    } else {
      add(charges, e.categorie, e.mois, v);
      bump(totalChargesParMois, e.mois, v);
      bump(totalTTCParMois, e.mois, e.ttc);
      bump(totalChargesTTCParMois, e.mois, e.ttc);
      if (e.tva) bump(baseTVADepensesParMois, e.mois, e.ht);
      bump(tvaDeductibleParMois, e.mois, e.tva);
      // Les charges financières restent affichées avec les charges, mais on
      // les isole : elles se retranchent au résultat courant, pas à l'EBE.
      if (estChargeFinanciere(e.categorie)) bump(chargesFinancieresParMois, e.mois, e.ht);
    }
  }
  return {
    moisList, base, charges, personnel, jeux, produits,
    immosParJeu, immosParJeuEtCategorie,
    totalChargesParMois, totalPersonnelParMois, totalTTCParMois,
    totalChargesTTCParMois, totalPersonnelTTCParMois, totalJeuxTTCParMois, immoTTCParMois,
    totalJeuxParMois, totalProduitsParMois, totalProduitsTTCParMois, immoParMois,
    immos, jeuxParJeu, jeuxParJeuEtCategorie, chargesFinancieresParMois,
    baseTVADepensesParMois, baseTVAProduitsParMois,
    tvaDeductibleParMois, tvaCollecteeParMois,
  };
}

// ----- Compte de résultat ------------------------------------------------

/**
 * Impôt sur les sociétés, barème PME : 15 % jusqu'à 42 500 € de bénéfice,
 * 25 % au-delà. Le taux réduit suppose un CA HT < 10 M€ et un capital
 * entièrement libéré détenu à 75 % au moins par des personnes physiques —
 * c'est le cas de Big Budi Games.
 */
export const PLAFOND_IS_REDUIT = 42_500;
export const TAUX_IS_REDUIT = 0.15;
export const TAUX_IS_NORMAL = 0.25;

export function impotSocietes(benefice: number): number {
  if (benefice <= 0) return 0;
  const reduit = Math.min(benefice, PLAFOND_IS_REDUIT) * TAUX_IS_REDUIT;
  const normal = Math.max(0, benefice - PLAFOND_IS_REDUIT) * TAUX_IS_NORMAL;
  return r2(reduit + normal);
}

export type NiveauResultat = 'detail' | 'agregat' | 'final';

export interface LigneResultat {
  cle: string;
  label: string;
  aide: string;
  /** Valeur par mois ; vide pour les lignes qui n'ont de sens qu'à l'année. */
  parMois: Map<string, number> | null;
  total: number;
  niveau: NiveauResultat;
  /** Un résultat négatif se lit en rouge, un positif en vert. */
  signe: boolean;
}

export interface EntreesResultat {
  moisList: string[];
  /** Produits d'exploitation HT (ventes, prestations, subventions). */
  produits: Map<string, number>;
  /** Charges d'exploitation HT hors personnel, hors jeux, hors financières. */
  charges: Map<string, number>;
  personnel: Map<string, number>;
  jeux: Map<string, number>;
  dotations: Map<string, number>;
  produitsFinanciers: Map<string, number>;
  chargesFinancieres: Map<string, number>;
}

const somme = (m: Map<string, number>, moisList: string[]) =>
  r2(moisList.reduce((s, x) => s + (m.get(x) ?? 0), 0));

/**
 * Le compte de résultat, dans l'ordre du plan comptable français :
 * EBE, puis résultat d'exploitation, courant, et net après impôt.
 *
 * Les dépenses de développement des jeux sont ici des charges d'exploitation
 * (elles ne sont pas immobilisées) : elles pèsent donc dans l'EBE.
 */
/**
 * Le compte de résultat d'un exercice, assemblé à partir de la synthèse. Un
 * seul assemblage pour toute l'app — écran, export Excel, rapport PDF et
 * version partageable lisent la même chose, sinon deux chiffres divergent.
 */
export function resultatDeSynthese(
  syn: SyntheseExercice, entries: JournalEntry[], finances: FinanceEntry[],
  refs?: Referentiels,
): LigneResultat[] {
  return compteResultat({
    moisList: syn.moisList,
    produits: syn.totalProduitsParMois,
    charges: syn.totalChargesParMois,
    personnel: syn.totalPersonnelParMois,
    // Les dépenses jeux sont déjà réparties dans les charges et les immos.
    jeux: new Map<string, number>(),
    dotations: dotationsParMois(immoInfos(entries, refs), syn.moisList),
    produitsFinanciers: produitsFinanciersParMois(finances, syn.moisList),
    chargesFinancieres: syn.chargesFinancieresParMois,
  });
}

export function compteResultat(e: EntreesResultat): LigneResultat[] {
  const { moisList } = e;
  const parMois = (calc: (m: string) => number) => {
    const out = new Map<string, number>();
    for (const m of moisList) out.set(m, r2(calc(m)));
    return out;
  };
  const g = (m: Map<string, number>, mois: string) => m.get(mois) ?? 0;

  const chargesExploit = parMois(m =>
    g(e.charges, m) - g(e.chargesFinancieres, m) + g(e.personnel, m) + g(e.jeux, m));
  const ebe = parMois(m => g(e.produits, m) - g(chargesExploit, m));
  const rex = parMois(m => g(ebe, m) - g(e.dotations, m));
  const rc = parMois(m => g(rex, m) + g(e.produitsFinanciers, m) - g(e.chargesFinancieres, m));

  const totalRC = somme(rc, moisList);
  const is = impotSocietes(totalRC);
  const rn = r2(totalRC - is);

  const l = (cle: string, label: string, aide: string, m: Map<string, number> | null,
    total: number, niveau: NiveauResultat, signe = false): LigneResultat =>
    ({ cle, label, aide, parMois: m, total, niveau, signe });

  return [
    l('produits', "Produits d'exploitation", 'Ventes, prestations et subventions, hors taxes.',
      e.produits, somme(e.produits, moisList), 'detail'),
    l('charges', "Charges d'exploitation", 'Charges externes, personnel et dépenses jeux — hors charges financières et hors dotations.',
      chargesExploit, somme(chargesExploit, moisList), 'detail'),
    l('ebe', 'EBE — Excédent brut d\'exploitation', "Ce que l'activité dégage avant amortissements et frais financiers.",
      ebe, somme(ebe, moisList), 'agregat', true),
    l('dotations', 'Dotations aux amortissements', "L'usure des immobilisations, étalée sur leur durée de vie.",
      e.dotations, somme(e.dotations, moisList), 'detail'),
    l('rex', 'REX — Résultat d\'exploitation', 'EBE moins les dotations aux amortissements.',
      rex, somme(rex, moisList), 'agregat', true),
    l('pf', 'Produits financiers', 'Intérêts perçus sur les placements et comptes rémunérés.',
      e.produitsFinanciers, somme(e.produitsFinanciers, moisList), 'detail'),
    l('cf', 'Charges financières', 'Agios, frais bancaires et intérêts d\'emprunt.',
      e.chargesFinancieres, somme(e.chargesFinancieres, moisList), 'detail'),
    l('rc', 'RC — Résultat courant avant impôt', 'Résultat d\'exploitation, corrigé du financier.',
      rc, totalRC, 'agregat', true),
    l('is', 'IS — Impôt sur les sociétés', `15 % jusqu'à ${PLAFOND_IS_REDUIT.toLocaleString('fr-FR')} € de bénéfice, 25 % au-delà. Calculé sur l'année, pas mois par mois.`,
      null, is, 'detail'),
    l('rn', 'RN — Résultat net', 'Ce qui reste après impôt : le résultat de l\'exercice.',
      null, rn, 'final', true),
  ];
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
  /** Tout ce qui a été engagé sur le jeu, HT : charges et immobilisations. */
  ht: number;
  /** La part portée à l'actif : elle ne pèse au résultat que par sa dotation. */
  immo: number;
  /** La part passée en charges de l'exercice. */
  charges: number;
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
        jeu, nb: 0, ttc: 0, ht: 0, immo: 0, charges: 0, tva: 0,
        parCategorie: new Map(), parMois: new Map(),
        premiere: e.date, derniere: e.date,
      });
    }
    const b = par.get(jeu)!;
    b.nb++; b.ttc += e.ttc; b.ht += e.ht; b.tva += e.tva;
    if (e.type === 'immo') b.immo += e.ht; else b.charges += e.ht;
    b.parCategorie.set(e.categorie, (b.parCategorie.get(e.categorie) ?? 0) + e.ht);
    b.parMois.set(e.mois, (b.parMois.get(e.mois) ?? 0) + e.ht);
    if (e.date < b.premiere) b.premiere = e.date;
    if (e.date > b.derniere) b.derniere = e.date;
  }
  return [...par.values()]
    .map(b => ({ ...b, ttc: r2(b.ttc), ht: r2(b.ht), tva: r2(b.tva), immo: r2(b.immo), charges: r2(b.charges) }))
    .sort((a, b) => b.ht - a.ht);
}
