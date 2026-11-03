/**
 * Les documents officiels de la société : avis d'impôt, Kbis, statuts,
 * attestations… Les fichiers partagent la base des factures ; ce module dit
 * lesquels sont des documents, pour qu'ils ne passent pas pour des factures,
 * et devine ce qu'est un fichier d'après son nom.
 */
import type { CategorieDocument, DocumentSociete } from '../types';
import { exerciceDuMois, moisDeDate, PREMIER_EXERCICE } from './dates';
import { libelleDepuisNom } from './depot';

export const CATEGORIES_DOCUMENT: { value: CategorieDocument; label: string; aide: string }[] = [
  { value: 'impots', label: 'Impôts & taxes',
    aide: 'Avis de CFE, d\'impôt sur les sociétés, de TVA, liasse fiscale, courriers de la DGFiP' },
  { value: 'juridique', label: 'Juridique',
    aide: 'Kbis, statuts, procès-verbaux d\'assemblée, immatriculation, avis de situation INSEE' },
  { value: 'banque', label: 'Banque & assurances',
    aide: 'RIB, contrats bancaires, attestations d\'assurance, RC Pro' },
  { value: 'social', label: 'Social',
    aide: 'URSSAF, retraite, prévoyance, mutuelle' },
  { value: 'autre', label: 'Autre', aide: 'Tout le reste' },
];

export const LIBELLE_CATEGORIE: Record<CategorieDocument, string> = Object.fromEntries(
  CATEGORIES_DOCUMENT.map(c => [c.value, c.label])) as Record<CategorieDocument, string>;

/** Ce qu'on reconnaît dans un nom de fichier, dans l'ordre où on le cherche. */
const MOTIFS: [RegExp, CategorieDocument][] = [
  [/avis.?cfe|\bcfe\b|imp[oô]t|impot|taxe|\btva\b|liasse|\bcvae\b|dgfip|2065|2033|tresor.?public|sie\b/i, 'impots'],
  [/k.?bis|statuts?|\bpv\b|proc[eè]s.?verbal|greffe|inpi|immatriculation|sirene|insee|guichet.?unique/i, 'juridique'],
  [/\brib\b|banque|qonto|bnp|assurance|attestation.?d.?assurance|rc.?pro|hiscox|axa|generali|emprunt|pr[eê]t\b/i, 'banque'],
  [/urssaf|cotisations?|retraite|pr[eé]voyance|mutuelle|\bdsn\b|carsat|cipav|tns/i, 'social'],
];

/** La catégorie devinée d'après le nom du fichier. Se corrige d'un clic. */
export function categorieDepuisNom(nom: string): CategorieDocument {
  return MOTIFS.find(([re]) => re.test(nom))?.[1] ?? 'autre';
}

/**
 * Un libellé lisible d'après le nom du fichier. Les avis de CFE de
 * impots.gouv portent un nom technique (« 31041875-AvisCfe_990664757_55c0… ») :
 * on le reconnaît et on l'appelle par son nom.
 */
export function libelleDocumentDepuisNom(nom: string, annee: string): string {
  if (/avis.?cfe/i.test(nom)) return `Avis de CFE ${annee}`;
  if (/k.?bis/i.test(nom)) return 'Extrait Kbis';
  return libelleDepuisNom(nom);
}

/**
 * L'exercice d'un document, d'après sa date. Ce qui précède le premier
 * exercice (statuts signés avant l'immatriculation) se range dans le premier.
 */
export function exerciceDuDocument(d: Pick<DocumentSociete, 'date'>): string {
  if (!d.date) return PREMIER_EXERCICE;
  const ex = exerciceDuMois(moisDeDate(d.date));
  return ex < PREMIER_EXERCICE ? PREMIER_EXERCICE : ex;
}

export type EtatEcheance = 'proche' | 'passee' | 'lointaine';

/** Où en est l'échéance d'un document : à moins d'un mois, passée, ou plus loin. */
export function etatEcheance(echeance: string | undefined, aujourdhui: string): EtatEcheance | null {
  if (!echeance) return null;
  if (echeance < aujourdhui) return 'passee';
  const [y, m, j] = aujourdhui.split('-').map(Number);
  const dans30 = new Date(Date.UTC(y, m - 1, j + 30)).toISOString().slice(0, 10);
  return echeance <= dans30 ? 'proche' : 'lointaine';
}

/** Les identifiants de fichiers qui sont des documents de la société. */
export function fichiersDesDocuments(docs: DocumentSociete[] | undefined): Map<string, DocumentSociete> {
  return new Map((docs ?? []).map(d => [d.fileId, d]));
}
