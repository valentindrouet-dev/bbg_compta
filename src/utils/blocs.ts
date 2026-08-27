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
  if (refs.categoriesJeux.includes(e.categorie)) return 'jeux';
  if (e.type === 'immo') return 'immos';
  if (estPersonnel(e.categorie, refs)) return 'personnel';
  return 'charges';
}

/** Bloc d'affichage d'une catégorie (hors immobilisations, qui tiennent au type). */
export function blocDeCategorie(categorie: string, refs: Referentiels): BlocCle {
  if (refs.categoriesProduits.includes(categorie)) return 'produits';
  if (refs.categoriesJeux.includes(categorie)) return 'jeux';
  if (estPersonnel(categorie, refs)) return 'personnel';
  return 'charges';
}
