/**
 * Les blocs comptables de l'application, dans l'ordre où ils se lisent :
 * Produits, Charges, Personnel, Jeux, Immobilisations, Résultat, TVA.
 *
 * C'est la même liste pour le journal du mois, la synthèse annuelle et le
 * prévisionnel — sinon la comparaison des trois n'aurait pas de sens. Chaque
 * bloc porte une teinte majeure, modifiable dans l'app, dont toutes les autres
 * nuances se déduisent (voir couleurs.ts).
 */
import type { JournalEntry, Referentiels } from '../types';
import { teinte, type Teinte } from './couleurs';

export type BlocCle = 'produits' | 'charges' | 'personnel' | 'jeux' | 'immos' | 'resultat' | 'tva';

export interface BlocDef {
  cle: BlocCle;
  /** Titre du bloc, au singulier de ce qu'il contient. */
  titre: string;
  /** Teinte majeure par défaut, reprise des tableurs. */
  defaut: string;
}

export const BLOCS: BlocDef[] = [
  { cle: 'produits', titre: 'Produits', defaut: '#b7e1cd' },
  { cle: 'charges', titre: 'Charges', defaut: '#f9cb9c' },
  { cle: 'personnel', titre: 'Personnel & rémunérations', defaut: '#9fc5e8' },
  { cle: 'jeux', titre: 'Dépenses Jeux', defaut: '#ffe599' },
  { cle: 'immos', titre: 'Immobilisations', defaut: '#b4a7d6' },
  { cle: 'resultat', titre: 'Résultat', defaut: '#a2c4c9' },
  { cle: 'tva', titre: 'TVA', defaut: '#d5a6bd' },
];

export const BLOC_PAR_CLE = new Map(BLOCS.map(b => [b.cle, b]));

/** Le groupe de catégories qui bascule une charge dans le bloc Personnel. */
export const GROUPE_PERSONNEL = 'Personnel';

/** Catégories rattachées au personnel dès l'import (cotisations du gérant TNS). */
export const CATEGORIES_PERSONNEL_INITIALES = ['Retraite TNS', 'URSSAF'];

/** Teinte effective d'un bloc : celle choisie par l'utilisateur, sinon la sienne. */
export function teinteBloc(cle: BlocCle, couleurs: Record<string, string>): Teinte {
  return teinte(couleurs[cle] || BLOC_PAR_CLE.get(cle)?.defaut || '#b4a7d6');
}

/** Une catégorie relève-t-elle des charges de personnel ? */
export function estPersonnel(categorie: string, refs: Referentiels): boolean {
  return refs.categoriesMeta?.[categorie]?.groupe === GROUPE_PERSONNEL;
}

/**
 * Charges financières : agios, frais bancaires, intérêts d'emprunt. Elles sont
 * des charges comme les autres, mais elles n'entrent pas dans l'excédent brut
 * d'exploitation — elles se retranchent plus bas, au résultat courant.
 */
export function estChargeFinanciere(categorie: string): boolean {
  const n = categorie.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return n.includes('charges financi') || n.includes('interets d\'emprunt')
    || n.includes('agios') || n.includes('frais bancaires');
}

/** Bloc d'affichage d'une écriture du journal. */
export function blocDeEcriture(e: JournalEntry, refs: Referentiels): BlocCle {
  if (e.type === 'produit') return 'produits';
  // Ce qui est porté à l'actif ne peut pas être en même temps une charge de
  // l'exercice — que ce soit la ligne qui le dise ou sa catégorie.
  if (estImmobilisation(e, refs)) return 'immos';
  if (refs.categoriesJeux.includes(e.categorie)) return 'jeux';
  if (estPersonnel(e.categorie, refs)) return 'personnel';
  return 'charges';
}

/**
 * Cette écriture s'inscrit-elle à l'actif ?
 *
 * La catégorie tranche en premier : si elle est marquée immobilisée, toutes ses
 * écritures le sont, et inversement une catégorie de charges ne peut pas porter
 * d'immobilisation. À défaut de réglage, c'est le type de la ligne qui décide —
 * ce qui laisse un achat isolé (un ordinateur dans « Informatique ») être une
 * immobilisation sans que toute la catégorie le devienne.
 */
export function estImmobilisation(e: JournalEntry, refs?: Referentiels): boolean {
  if (e.type === 'produit') return false;
  // Le réglage explicite de la catégorie tranche, dans les deux sens ; tant
  // qu'il n'y en a pas, c'est la ligne qui décide (« Informatique » peut porter
  // un ordinateur à l'actif et une souris en charges).
  const choix = refs?.categoriesMeta?.[e.categorie]?.immobilisee;
  if (choix !== undefined) return choix;
  return e.type === 'immo';
}

/** Bloc d'affichage d'une catégorie (hors immobilisations, qui tiennent au type). */
/**
 * Catégories immobilisées d'origine : le développement graphique et les
 * illustrations sont les coûts de développement d'un projet identifié, inscrits
 * au bilan et amortis. C'est un point de départ — la liste se pilote ensuite
 * catégorie par catégorie dans l'onglet Catégories.
 */
export const POSTES_JEU_IMMOBILISES = ['Développement Graphique', 'Illustrations'];

export function estPosteJeuImmobilise(categorie: string): boolean {
  const n = categorie.trim().toLowerCase();
  return POSTES_JEU_IMMOBILISES.some(p => p.toLowerCase() === n);
}

/**
 * La catégorie est-elle marquée « immobilisée » ? Ce réglage l'emporte sur le
 * type d'une écriture prise isolément : c'est lui qui décide qu'un poste va au
 * bilan plutôt qu'aux charges, et il se change dans l'onglet Catégories.
 */
export function estCategorieImmobilisee(categorie: string, refs: Referentiels): boolean {
  return refs.categoriesMeta?.[categorie]?.immobilisee === true;
}

/** Le réglage de la catégorie : à l'actif, en charges, ou « au cas par cas ». */
export function natureCategorie(
  categorie: string, refs: Referentiels,
): 'immo' | 'charge' | 'auto' {
  const v = refs.categoriesMeta?.[categorie]?.immobilisee;
  return v === undefined ? 'auto' : v ? 'immo' : 'charge';
}

/** Durée d'amortissement par défaut d'une catégorie immobilisée, en années. */
export function dureeCategorie(categorie: string, refs: Referentiels): number {
  return refs.categoriesMeta?.[categorie]?.dureeAns ?? 5;
}

export function blocDeCategorie(categorie: string, refs: Referentiels): BlocCle {
  if (refs.categoriesProduits.includes(categorie)) return 'produits';
  if (estCategorieImmobilisee(categorie, refs)) return 'immos';
  // Un poste de jeu n'a pas de bloc à lui : il est une charge, sauf si sa
  // catégorie est marquée immobilisée. Le jeu reste porté par sa colonne.
  if (refs.categoriesJeux.includes(categorie)) return 'charges';
  if (estPersonnel(categorie, refs)) return 'personnel';
  return 'charges';
}
