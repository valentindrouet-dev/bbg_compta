// ----- Journal comptable -------------------------------------------------

/** Type d'écriture, aligné sur la colonne « type » des tableurs. */
export type EntryType = 'charges' | 'immo' | 'produit';

export interface JournalEntry {
  id: string;
  /** Date réelle de l'opération (ISO yyyy-mm-dd). */
  date: string;
  fournisseur: string;
  description: string;
  categorie: string;
  ttc: number;
  tva: number;
  ht: number;
  paiement: string;
  type: EntryType;
  /** Compte du plan comptable, ex. « 6063 – Fournitures non stockables ». */
  compta?: string;
  motsCles?: string;
  /** Nom du justificatif (texte libre, repris des tableurs). */
  facture?: string;
  /** Identifiant du fichier joint dans IndexedDB, si un justificatif est attaché. */
  factureFileId?: string;
  /** Mois comptable de rattachement : 'pre-immat' ou 'yyyy-mm'. */
  mois: string;
  /** Durée d'amortissement en années (uniquement type === 'immo'). */
  immoDureeAns?: number;
  /** Jeu auquel la dépense se rattache (EDIT, CAMINO…), pour les dépenses jeux. */
  jeu?: string;
}

/** Mouvement financier hors exploitation (capital, CCA, placements…). */
export type FinanceType = 'capital' | 'cca' | 'placement' | 'produit_financier' | 'autre';

export interface FinanceEntry {
  id: string;
  date: string;
  label: string;
  type: FinanceType;
  /** Signé : positif = encaissement, négatif = décaissement. */
  montant: number;
}

// ----- Prévisionnel ------------------------------------------------------

export type BudgetSection = 'ca' | 'couts_dev' | 'charges_externes' | 'personnel' | 'resultat' | 'tva' | 'autres';
export type BudgetKind = 'montant' | 'pourcentage' | 'heures' | 'jours' | 'volume';

export interface BudgetLine {
  id: string;
  exercice: string;
  section: BudgetSection;
  groupe: string;
  label: string;
  baseTTC: number | null;
  baseHT: number | null;
  kind: BudgetKind;
  /** Valeurs mensuelles HT (ou %, heures… selon kind), null = vide. */
  valeurs: (number | null)[];
}

export interface BudgetExercice {
  moisLabels: string[];
  lignes: BudgetLine[];
}

/** Bloc d'affichage d'une ligne prévisionnelle, calqué sur la synthèse annuelle. */
export type PrevSection = 'produits' | 'charges' | 'jeux' | 'immos' | 'indicateurs';

/**
 * Ligne du prévisionnel : une catégorie (celles de la synthèse) et ses montants
 * mensuels. Une ligne dont la catégorie n'existe pas déclenche une alarme.
 */
export interface PrevLigne {
  id: string;
  categorie: string;
  section: PrevSection;
  /** Absent = montant en euros ; sinon indicateur non monétaire. */
  unite?: 'heures' | 'jours' | 'pourcentage' | 'volume';
  /** Une valeur par mois de l'exercice, dans l'ordre de moisExercice(). */
  valeurs: (number | null)[];
  note?: string;
}

export interface ChronoEvent {
  id: string;
  projet: string;
  action: string;
  debut: string;
  fin: string;
  detail?: string;
}

export interface TresoPrevLine {
  label: string;
  /** Une valeur par exercice (2025-26 … 2029-30), null = non renseigné. */
  valeurs: (number | null)[];
}

// ----- Référentiels ------------------------------------------------------

/** Réglages libres d'une catégorie : sa couleur et son groupe de rattachement. */
export interface CategorieMeta {
  couleur?: string;
  groupe?: string;
}

export interface Referentiels {
  categoriesDepenses: string[];
  categoriesJeux: string[];
  categoriesProduits: string[];
  types: string[];
  planComptable: string[];
  paiements: string[];
  tauxTVA: number[];
  /** Couleur et groupe par catégorie, indexés par nom. */
  categoriesMeta?: Record<string, CategorieMeta>;
  /** Groupes de catégories, dans l'ordre d'affichage. */
  groupes?: string[];
  /** Jeux du catalogue, pour ventiler les dépenses de développement. */
  jeux?: string[];
}
