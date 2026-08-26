import type { BudgetLine } from '../types';
import { r2 } from './money';

/** Ligne de budget telle que stockée, avec le drapeau TVA issu du tableur. */
export type BudgetLineFull = BudgetLine & { tvaFlag?: boolean };

export interface BudgetRollup {
  nMois: number;
  /** CA HT par mois (somme des lignes montant de la section ca). */
  ca: number[];
  /** Coûts de développement par groupe (jeu) : groupe -> montants mensuels. */
  coutsDevParGroupe: Map<string, number[]>;
  coutsDevTotal: number[];
  margeBrute: number[];
  chargesExternes: number[];
  imprevus: number[];
  chargesExternesTotal: number[];
  valeurAjoutee: number[];
  personnel: number[];
  taxes: number[];
  ebe: number[];
  dotations: number[];
  rex: number[];
  produitFinancier: number[];
  resultatCourant: number[];
  /** IS calculé sur le total annuel (15 % si positif), comme dans le tableur. */
  isTotal: number;
  resultatNetTotal: number;
  tvaDeductible: number[];
  tvaCollectee: number[];
  tvaAReverser: number[];
}

const zeros = (n: number) => new Array<number>(n).fill(0);
const addInto = (acc: number[], vals: (number | null)[]) => {
  for (let i = 0; i < acc.length; i++) acc[i] += vals[i] ?? 0;
};

function isMontant(l: BudgetLineFull): boolean {
  return l.kind === 'montant';
}

const RE_DOTATIONS = /dotations aux amortissements/i;
const RE_PRODUIT_FIN = /produit financier|intérêts/i;
const RE_TAXE = /^(cfe|taxes?)/i;

export function rollupBudget(lignes: BudgetLineFull[], nMois: number, tauxImprevus = 0.1): BudgetRollup {
  const ca = zeros(nMois);
  const coutsDevParGroupe = new Map<string, number[]>();
  const coutsDevTotal = zeros(nMois);
  const chargesExternes = zeros(nMois);
  const chargesExternesTVA = zeros(nMois);
  const personnel = zeros(nMois);
  const taxes = zeros(nMois);
  const dotations = zeros(nMois);
  const produitFinancier = zeros(nMois);

  for (const l of lignes) {
    if (!isMontant(l)) continue;
    const vals = l.valeurs;
    switch (l.section) {
      case 'ca':
        addInto(ca, vals);
        break;
      case 'couts_dev': {
        const g = l.groupe || 'Autres';
        if (!coutsDevParGroupe.has(g)) coutsDevParGroupe.set(g, zeros(nMois));
        addInto(coutsDevParGroupe.get(g)!, vals);
        addInto(coutsDevTotal, vals);
        break;
      }
      case 'charges_externes':
        addInto(chargesExternes, vals);
        if (l.tvaFlag !== false) addInto(chargesExternesTVA, vals);
        break;
      case 'personnel':
        addInto(personnel, vals);
        break;
      case 'resultat':
        if (RE_DOTATIONS.test(l.label)) addInto(dotations, vals);
        else if (RE_PRODUIT_FIN.test(l.label)) addInto(produitFinancier, vals);
        else if (RE_TAXE.test(l.label)) addInto(taxes, vals);
        else addInto(taxes, vals);
        break;
      default:
        break;
    }
  }

  const imprevus = chargesExternes.map(v => v * tauxImprevus);
  const chargesExternesTotal = chargesExternes.map((v, i) => v + imprevus[i]);
  const margeBrute = ca.map((v, i) => v - coutsDevTotal[i]);
  const valeurAjoutee = margeBrute.map((v, i) => v - chargesExternesTotal[i]);
  const ebe = valeurAjoutee.map((v, i) => v - personnel[i] - taxes[i]);
  const rex = ebe.map((v, i) => v - dotations[i]);
  const resultatCourant = rex.map((v, i) => v + produitFinancier[i]);

  const rcTotal = resultatCourant.reduce((s, v) => s + v, 0);
  const isTotal = rcTotal > 0 ? r2(rcTotal * 0.15) : 0;
  const resultatNetTotal = r2(rcTotal - isTotal);

  // Bloc TVA (modèle du tableur) : assiette déductible = coûts dev + charges
  // externes assujetties + dotations ; collectée = 20 % du CA.
  const assiette = coutsDevTotal.map((v, i) => v + chargesExternesTVA[i] + dotations[i]);
  const tvaDeductible = assiette.map(v => v * 0.2);
  const tvaCollectee = ca.map(v => v * 0.2);
  const tvaAReverser = tvaCollectee.map((v, i) => v - tvaDeductible[i]);

  return {
    nMois, ca, coutsDevParGroupe, coutsDevTotal, margeBrute,
    chargesExternes, imprevus, chargesExternesTotal, valeurAjoutee,
    personnel, taxes, ebe, dotations, rex, produitFinancier,
    resultatCourant, isTotal, resultatNetTotal,
    tvaDeductible, tvaCollectee, tvaAReverser,
  };
}

export const total = (arr: number[]) => r2(arr.reduce((s, v) => s + v, 0));
