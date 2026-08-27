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
export type FinanceType =
  | 'capital' | 'cca' | 'remboursement_cca' | 'placement' | 'produit_financier' | 'autre';

/**
 * Ce qu'on corrige à la main sur un mois de trésorerie.
 *
 * Le calcul part du journal et des mouvements financiers, en supposant que tout
 * est encaissé ou payé dans son mois comptable. La réalité décale : un
 * fournisseur payé le mois suivant, un prélèvement en retard, une avance
 * remboursée plus tard. `ajustement` entre dans le calcul, `soldeReel` n'y entre
 * pas — c'est le relevé bancaire, en regard, pour voir l'écart.
 */
export interface TresoManuel {
  ajustement?: number;
  soldeReel?: number;
  note?: string;
}

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
export type PrevSection = 'produits' | 'charges' | 'personnel' | 'jeux' | 'immos' | 'indicateurs';

/**
 * Ligne calculée : le montant d'un mois est le produit d'une autre ligne
 * (des heures, des jours…) par un taux, éventuellement décalé dans le temps.
 *
 * Cas des workshops ARTFX : les heures sont effectuées un mois, la facture est
 * payée au début du mois suivant — d'où le décalage d'un mois.
 */
export type FormulePrev = FormuleHeuresTaux | FormulePourcentage;

/** Une quantité mensuelle multipliée par un taux, éventuellement décalée. */
export interface FormuleHeuresTaux {
  type: 'heures-taux';
  /** Ligne qui porte les quantités (heures, jours…). */
  sourceId: string;
  /** Taux unitaire hors taxes. */
  tauxHT: number;
  /** Taux de TVA appliqué pour afficher l'équivalent TTC. */
  tauxTVA: number;
  /** Décalage en mois entre la quantité et l'encaissement (1 = mois suivant). */
  decalage: number;
}

/**
 * Un pourcentage de ce qui précède dans le bloc — la ligne « Imprévus (10 %) ».
 * L'assiette est la somme des lignes du même bloc situées AU-DESSUS, ce qui
 * évite qu'un imprévu se calcule sur lui-même ou sur un autre pourcentage.
 */
export interface FormulePourcentage {
  type: 'pourcentage-bloc';
  /** Le pourcentage appliqué, en % (10 = 10 %). */
  taux: number;
}

/**
 * Ligne du prévisionnel : une catégorie (celles de la synthèse) et ses montants
 * mensuels. Une ligne dont la catégorie n'existe pas déclenche une alarme.
 */
export interface PrevLigne {
  id: string;
  categorie: string;
  section: PrevSection;
  /** Jeu concerné, pour les lignes du bloc Jeux (comme la colonne du journal). */
  jeu?: string;
  /** Absent = montant en euros ; sinon indicateur non monétaire. */
  unite?: 'heures' | 'jours' | 'pourcentage' | 'volume';
  /** Si présent, les montants sont calculés et non saisis. */
  formule?: FormulePrev;
  /**
   * Taux de TVA de la ligne, en %, pour l'affichage TTC du prévisionnel.
   * Absent = on reprend le taux dominant observé au journal pour cette
   * catégorie, et 20 % à défaut. Les montants restent toujours stockés en HT.
   */
  tauxTVA?: number;
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
  /**
   * Toutes les écritures de cette catégorie sont des immobilisations : elles
   * s'inscrivent à l'actif et s'amortissent, au lieu de peser d'un coup sur le
   * résultat. C'est le pilotage principal — il l'emporte sur le type d'une
   * écriture prise isolément. Se règle dans l'onglet Catégories.
   */
  immobilisee?: boolean;
  /** Durée d'amortissement par défaut de la catégorie, en années. */
  dureeAns?: number;
}

/** Fiche d'un jeu : lien vers le Production Calculator et note libre. */
export interface JeuMeta {
  /** URL du jeu dans le Production Calculator (devis usine, scénarios de vente). */
  lienProd?: string;
  note?: string;
}

export interface Referentiels {
  /** Ordre d'affichage des grands projets de la chronologie. */
  chronoProjets?: string[];
  /** Couleur choisie pour chaque projet de la chronologie. */
  chronoCouleurs?: Record<string, string>;
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
  /** Fiche par jeu (lien Production Calculator…), indexée par nom. */
  jeuxMeta?: Record<string, JeuMeta>;
}
