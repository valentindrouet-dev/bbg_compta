/**
 * Ce que le prévisionnel donne : les montants par bloc, le compte de résultat
 * et les flux de trésorerie. Un seul endroit pour tout le monde — la page
 * Prévisionnel, son onglet Total, la vue 5 ans et la trésorerie prévisionnelle
 * lisent les mêmes chiffres, sinon deux écrans se contredisent.
 */
import type {
  FinanceEntry, JournalEntry, LigneStock, PrevLigne, PrevSection, Referentiels,
} from '../types';
import { estChargeFinanciere } from './blocs';
import {
  compteResultat, dotationsParMois, produitsFinanciersParMois,
  type ImmoInfo, type LigneResultat,
} from './calc';
import { r2 } from './money';
import { tauxDeLigne, tauxObserves, valeursDe } from './previsionnel';
import { apportStock, type ApportStock } from './stock';

/** Durée d'amortissement retenue pour un investissement seulement prévu. */
export const DUREE_IMMO_PREVUE = 5;

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
  const { lignes, moisList, immos, finances, stock } = e;
  const sec = (s: PrevSection) => montantsSection(lignes, moisList, s);

  const produits = plus(sec('produits'), stock?.caParMois);
  // Charges = charges saisies + tirages − variation de stock.
  let charges = plus(sec('charges'), stock?.fabricationParMois);
  charges = plus(charges, stock?.variationParMois, -1);

  const dotationsReelles = dotationsParMois(immos, moisList);
  const immosPrevues = sec('immos');
  const dotations = new Map(moisList.map((m, i) => {
    let d = dotationsReelles.get(m) ?? 0;
    for (let j = 0; j <= i; j++) {
      d += (immosPrevues.get(moisList[j]) ?? 0) / (DUREE_IMMO_PREVUE * 12);
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

export function fluxTresorerie(
  lignes: PrevLigne[], moisList: string[], stocksLignes: LigneStock[],
  exercice: string, refs: Referentiels, entries: JournalEntry[] = [],
): FluxTreso {
  const observes = tauxObserves(entries);
  const stock = apportStock(stocksLignes, exercice, refs.jeux ?? []);
  const autresProduits = sectionTTC(lignes, moisList, 'produits', observes);
  const ventesJeux = new Map(moisList.map(m => [m, stock.caTTCParMois.get(m) ?? 0]));
  const charges = sectionTTC(lignes, moisList, 'charges', observes);
  // Cotisations et rémunérations : pas de TVA, le TTC est le HT.
  const personnel = sectionHT(lignes, moisList, 'personnel');
  const immos = sectionTTC(lignes, moisList, 'immos', observes);
  // La TVA sur un tirage est déductible : l'usine est payée TTC, la TVA revient.
  const fabrication = new Map(moisList.map(m => [m, r2((stock.fabricationParMois.get(m) ?? 0) * 1.2)]));

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
