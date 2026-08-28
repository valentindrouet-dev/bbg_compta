/**
 * Ce que le prévisionnel donne : les montants par bloc, le compte de résultat
 * et les flux de trésorerie. Un seul endroit pour tout le monde — la page
 * Prévisionnel, son onglet Total, la vue 5 ans et la trésorerie prévisionnelle
 * lisent les mêmes chiffres, sinon deux écrans se contredisent.
 */
import type {
  FinanceEntry, JournalEntry, LigneStock, PrevLigne, PrevSection, Referentiels,
} from '../types';
import { estChargeFinanciere, estPersonnel } from './blocs';
import {
  compteResultat, dotationsParMois, produitsFinanciersParMois,
  type ImmoInfo, type LigneResultat,
} from './calc';
import { compareMois, moisCourant } from './dates';
import { r2 } from './money';
import { tauxDeLigne, tauxObserves, valeursDe } from './previsionnel';
import { apportStock, type ApportStock } from './stock';

/** Durée d'amortissement retenue pour un investissement seulement prévu. */
export const DUREE_IMMO_PREVUE = 5;

/** Les durées proposées d'un clic. Le reste se tape à la main. */
export const DUREES_COURANTES = [3, 5, 10] as const;

/**
 * Sur combien d'années une ligne d'investissement prévu s'amortit : la durée
 * qu'elle porte, sinon celle de sa catégorie, sinon cinq ans.
 */
export function dureePrevue(l: PrevLigne, refs?: Referentiels): number {
  if (l.dureeAns && l.dureeAns > 0) return l.dureeAns;
  if (refs && refs.categoriesMeta?.[l.categorie]?.dureeAns) {
    return refs.categoriesMeta[l.categorie].dureeAns!;
  }
  return DUREE_IMMO_PREVUE;
}

/** Total d'un bloc du prévisionnel, mois par mois. */
export function montantsSection(
  lignes: PrevLigne[], moisList: string[], section: PrevSection,
): Map<string, number> {
  const retenues = lignes.filter(l => l.section === section && !l.unite);
  return new Map(moisList.map((m, i) => [m, r2(
    retenues.reduce((s, l) => s + (valeursDe(l, lignes)[i] ?? 0), 0))]));
}

const vide = (moisList: string[]) => new Map(moisList.map(m => [m, 0]));

const plus = (a: Map<string, number>, b: Map<string, number> | undefined, signe = 1) => {
  if (!b) return a;
  const out = new Map(a);
  for (const [m, v] of b) if (out.has(m)) out.set(m, r2((out.get(m) ?? 0) + signe * v));
  return out;
};

export interface EntreesPrevisionnel {
  lignes: PrevLigne[];
  moisList: string[];
  /** Pour lire la durée d'amortissement par défaut d'une catégorie. */
  refs?: Referentiels;
  /** Immobilisations déjà au bilan : leurs dotations courent quand même. */
  immos: ImmoInfo[];
  finances: FinanceEntry[];
  /** Le stock de l'exercice, quand il y en a un. */
  stock?: ApportStock;
}

/**
 * Le compte de résultat prévisionnel, stock compris.
 *
 * Les tirages payés à l'usine sont une charge du mois où ils sont payés ; la
 * variation de stock les neutralise pour les exemplaires encore en carton. Le
 * net qui atteint le résultat est donc la seule marge sur ce qui est vendu.
 */
export function resultatPrevisionnel(e: EntreesPrevisionnel): LigneResultat[] {
  const { lignes, moisList, immos, finances, stock, refs } = e;
  const sec = (s: PrevSection) => montantsSection(lignes, moisList, s);

  const produits = plus(sec('produits'), stock?.caParMois);
  // Charges = charges saisies + tirages − variation de stock.
  let charges = plus(sec('charges'), stock?.fabricationParMois);
  charges = plus(charges, stock?.variationParMois, -1);

  // Dotations : celles des biens déjà au bilan, plus celles que déclencheraient
  // les investissements prévus. Chaque ligne d'immobilisation a sa durée —
  // celle qu'on lui a fixée, sinon celle de sa catégorie, sinon cinq ans : un
  // ordinateur ne s'amortit pas comme des travaux.
  const dotationsReelles = dotationsParMois(immos, moisList);
  const lignesImmo = lignes.filter(l => l.section === 'immos' && !l.unite)
    .map(l => ({
      duree: dureePrevue(l, refs),
      valeurs: valeursDe(l, lignes),
    }));
  const dotations = new Map(moisList.map((m, i) => {
    let d = dotationsReelles.get(m) ?? 0;
    for (const li of lignesImmo) {
      for (let j = 0; j <= i; j++) d += (li.valeurs[j] ?? 0) / (li.duree * 12);
    }
    return [m, r2(d)] as const;
  }));

  const financieres = lignes.filter(
    l => l.section === 'charges' && !l.unite && estChargeFinanciere(l.categorie));
  const chargesFinancieres = new Map(moisList.map((m, i) => [m, r2(
    financieres.reduce((s, l) => s + (valeursDe(l, lignes)[i] ?? 0), 0))]));

  return compteResultat({
    moisList,
    produits,
    charges,
    personnel: sec('personnel'),
    // Il n'y a plus de bloc Jeux : ses postes sont dans les charges et les immos.
    jeux: vide(moisList),
    dotations,
    // Les intérêts prévus sont saisis une seule fois, en trésorerie.
    produitsFinanciers: produitsFinanciersParMois(finances, moisList),
    chargesFinancieres,
  });
}

// ----- Trésorerie prévisionnelle -----------------------------------------

/**
 * Ce que le prévisionnel fait entrer et sortir du compte, TTC.
 *
 * La trésorerie ne connaît ni dotations ni variation de stock : elle ne voit
 * que des euros qui bougent. Les investissements en sortent en totalité le mois
 * où ils sont engagés, et les tirages d'usine aussi.
 */
export interface FluxTreso {
  mois: string[];
  /** Ventes et prestations encaissées, TTC. */
  encaissements: Map<string, number>;
  ventesJeux: Map<string, number>;
  autresProduits: Map<string, number>;
  /** Charges, personnel, immobilisations et tirages, TTC. */
  decaissements: Map<string, number>;
  charges: Map<string, number>;
  personnel: Map<string, number>;
  immos: Map<string, number>;
  fabrication: Map<string, number>;
  /** Encaissements − décaissements. */
  solde: Map<string, number>;
}

/**
 * Un bloc converti en TTC, ligne à ligne. Chaque ligne garde son taux : celui
 * qu'elle porte, sinon celui qu'on observe au journal pour sa catégorie, 20 %
 * à défaut. C'est exactement ce qu'affiche la bascule TTC du prévisionnel.
 */
function sectionTTC(
  lignes: PrevLigne[], moisList: string[], section: PrevSection,
  observes: Map<string, number>,
): Map<string, number> {
  const retenues = lignes.filter(l => l.section === section && !l.unite);
  return new Map(moisList.map((m, i) => [m, r2(
    retenues.reduce((s, l) =>
      s + (valeursDe(l, lignes)[i] ?? 0) * (1 + tauxDeLigne(l, observes) / 100), 0))]));
}

/** Un bloc laissé en l'état : les cotisations et salaires ne portent pas de TVA. */
function sectionHT(
  lignes: PrevLigne[], moisList: string[], section: PrevSection,
): Map<string, number> {
  return montantsSection(lignes, moisList, section);
}

/**
 * Les mois d'un exercice déjà passés — ceux dont le journal fait foi.
 *
 * Sur l'exercice en cours, une trésorerie qui ne lirait que le budget serait
 * fausse de onze mois : ce qui est encaissé et payé est connu, il n'y a plus
 * rien à prévoir. On prend donc le réel jusqu'au mois courant inclus, et le
 * prévisionnel pour la suite.
 */
export function moisEcoules(moisList: string[]): string[] {
  const courant = moisCourant();
  return moisList.filter(m => compareMois(m, courant) <= 0);
}

export function fluxTresorerie(
  lignes: PrevLigne[], moisList: string[], stocksLignes: LigneStock[],
  exercice: string, refs: Referentiels, entries: JournalEntry[] = [],
  /**
   * Mois déjà écoulés : pour ceux-là, le journal remplace le budget. Laisser la
   * liste vide donne le prévisionnel pur.
   */
  reels: string[] = [],
): FluxTreso {
  const observes = tauxObserves(entries);
  const passe = new Set(reels);
  /** Ce que le journal a réellement fait bouger sur un mois, TTC. */
  const duJournal = (m: string, garde: (e: JournalEntry) => boolean) =>
    r2(entries.filter(e => e.mois === m && garde(e)).reduce((s, e) => s + e.ttc, 0));
  /** Le réel quand le mois est passé, le budget sinon. */
  const melange = (prevu: Map<string, number>, garde: (e: JournalEntry) => boolean) =>
    new Map(moisList.map(m => [m, passe.has(m) ? duJournal(m, garde) : (prevu.get(m) ?? 0)]));
  const stock = apportStock(stocksLignes, exercice, refs.jeux ?? []);
  const estJeu = (e: JournalEntry) => refs.categoriesJeux.includes(e.categorie);
  const estPerso = (e: JournalEntry) => estPersonnel(e.categorie, refs);

  // Sur un mois passé, chaque poste vient du journal ; sur un mois à venir, du
  // budget. Les ventes de jeux prévues s'effacent aussi devant le réel : elles
  // sont déjà dans les produits du journal.
  const autresProduits = melange(
    sectionTTC(lignes, moisList, 'produits', observes),
    e => e.type === 'produit');
  const ventesJeux = melange(
    new Map(moisList.map(m => [m, stock.caTTCParMois.get(m) ?? 0])),
    () => false);
  const charges = melange(
    sectionTTC(lignes, moisList, 'charges', observes),
    e => e.type === 'charges' && !estPerso(e) && !estJeu(e));
  // Cotisations et rémunérations : pas de TVA, le TTC est le HT.
  const personnel = melange(sectionHT(lignes, moisList, 'personnel'), estPerso);
  const immos = melange(sectionTTC(lignes, moisList, 'immos', observes), e => e.type === 'immo');
  // La TVA sur un tirage est déductible : l'usine est payée TTC, la TVA revient.
  // Les dépenses jeux réelles prennent la place des tirages prévus — mais
  // seulement celles restées en charges : un développement de jeu porté à
  // l'actif est déjà compté à la ligne des immobilisations, et le compter ici
  // une seconde fois gonflerait les sorties d'autant.
  const fabrication = melange(
    new Map(moisList.map(m => [m, stock.fabricationTTCParMois.get(m) ?? 0])),
    e => e.type === 'charges' && estJeu(e));

  const encaissements = new Map(moisList.map(m =>
    [m, r2((autresProduits.get(m) ?? 0) + (ventesJeux.get(m) ?? 0))]));
  const decaissements = new Map(moisList.map(m => [m, r2(
    (charges.get(m) ?? 0) + (personnel.get(m) ?? 0)
    + (immos.get(m) ?? 0) + (fabrication.get(m) ?? 0))]));
  const solde = new Map(moisList.map(m =>
    [m, r2((encaissements.get(m) ?? 0) - (decaissements.get(m) ?? 0))]));

  return {
    mois: moisList, encaissements, ventesJeux, autresProduits,
    decaissements, charges, personnel, immos, fabrication, solde,
  };
}

export const sommeMap = (m: Map<string, number>) =>
  r2([...m.values()].reduce((s, v) => s + v, 0));
