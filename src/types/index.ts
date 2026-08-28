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
  /**
   * Durée d'amortissement, en années — seulement pour une ligne du bloc
   * Immobilisations. Un ordinateur ne s'amortit pas sur la même durée que des
   * travaux : c'est elle qui commande la dotation que l'investissement prévu
   * fera peser sur le résultat. À défaut, celle de la catégorie, sinon 5 ans.
   */
  dureeAns?: number;
  note?: string;
}

/**
 * Un exercice de stock pour un jeu : ce qu'on fabrique, ce qu'on écoule, et les
 * deux prix qui transforment des exemplaires en euros. Le coût de revient
 * unitaire se recopie depuis le Production Calculator — c'est lui qui tient les
 * devis usine, pas cette app.
 */
export interface LigneStock {
  id: string;
  exercice: string;
  jeu: string;
  /**
   * Identifiant du **tirage**, stable d'un exercice à l'autre. Un jeu qui se
   * vend bien se réimprime : le second tirage a son propre coût de revient, ses
   * propres prix et son propre stock, et se suit donc à part. Absent = le jeu
   * n'a qu'un tirage, et c'est son nom qui fait clé (les lignes d'avant le
   * multi-tirage restent valides sans rien changer).
   */
  serie?: string;
  /** Nom du tirage tel qu'il s'affiche : « 2e tirage », « réimpression »… */
  tirage?: string;
  /** Coût de revient unitaire HT (fabrication + transport), par exemplaire. */
  coutUnitaire: number;
  /** TVA des ventes, en % (20 par défaut). */
  tauxTVA?: number;
  /**
   * TVA du tirage, en % — celle que l'usine facture. **0 par défaut** : une
   * fabrication hors UE n'en porte pas, la TVA d'importation étant autoliquidée
   * (déclarée et déduite sur la même CA3, donc sans sortie de caisse). Une
   * fabrication française la porterait à 20.
   */
  tauxTVAFabrication?: number;
  /** Stock d'ouverture, en exemplaires — seulement sur le premier exercice. */
  stockInitial?: number;
  /** Exemplaires fabriqués, une case par mois de l'exercice. */
  fabrique: (number | null)[];
  /**
   * Le rythme d'écoulement : quel pourcentage du tirage part ce mois-là, tous
   * canaux confondus. Chaque canal en reçoit sa part, au prorata de sa
   * répartition. Une case par mois.
   */
  ventesPourcent: (number | null)[];
  /**
   * Les canaux de vente. Un même jeu ne se vend pas au même prix selon qu'il
   * part chez un distributeur, dans une boutique ou chez un éditeur : chacun a
   * donc son prix et sa propre ligne de quantités.
   */
  canaux: CanalVente[];
  /**
   * Prix public conseillé HT — le prix en boutique, hors TVA. Il ne sert pas à
   * calculer les ventes (chaque canal a le sien) mais il est souvent l'assiette
   * contractuelle des droits d'auteur, et c'est de toute façon un chiffre qu'on
   * veut garder à côté du coût de revient.
   */
  ppht?: number;
  /**
   * Les droits à reverser sur ce jeu : un auteur, une illustratrice, un
   * traducteur… Chacun a son taux, son assiette et son avance.
   */
  droits?: LigneDroits[];
  note?: string;
}

/**
 * Des droits à reverser sur les ventes d'un jeu.
 *
 * Une avance versée à la signature n'est pas un cadeau : elle est *récupérable*
 * sur les premiers droits acquis. Tant que les droits cumulés n'ont pas
 * rattrapé l'avance, il n'y a rien de plus à payer — l'avance a déjà été
 * décaissée, et la repasser en charge la compterait deux fois. Au-delà, chaque
 * vente coûte réellement ses droits, et la marge s'en ressent.
 */
export interface LigneDroits {
  id: string;
  /** « Auteur », « Illustratrice »… ce qui apparaît sur la ligne. */
  nom: string;
  /** Taux des droits, en % de l'assiette. */
  taux: number;
  /**
   * L'assiette du taux :
   * - `ppht` : le prix public conseillé HT, le même pour tous les canaux ;
   * - `ventes` : le prix réellement encaissé, donc pondéré tout seul par la
   *   répartition entre distributeur, boutique et éditeur du mois.
   */
  base: 'ppht' | 'ventes';
  /** Avance déjà versée, récupérable sur les premiers droits acquis. */
  avance: number;
}

/**
 * Un canal de vente d'un jeu : son prix et ce qu'il écoule mois par mois.
 *
 * Les quantités se saisissent au choix en **exemplaires** ou en **pourcentage**
 * — plus rapide pour esquisser un écoulement (« 8 % du tirage par mois »)
 * que de recopier des nombres.
 */
export interface CanalVente {
  id: string;
  /** « Distributeur », « Boutique », « Éditeur »… librement renommable. */
  nom: string;
  /** Prix de vente unitaire HT sur ce canal. */
  prix: number;
  /**
   * D'où viennent les quantités du canal :
   * - `repartition` (le cas courant) : sa part du rythme d'écoulement du mois.
   *   Rien à saisir dans les cases, seulement la répartition et le prix ;
   * - `pourcentage` : un pourcentage saisi mois par mois, sur l'assiette `base` ;
   * - `nombre` : des exemplaires tapés à la main.
   */
  mode: 'repartition' | 'nombre' | 'pourcentage';
  /**
   * La part du tirage qui passe par ce canal, en % — 60 chez le distributeur,
   * 10 en boutique, 30 chez l'éditeur. Les parts devraient totaliser 100 %.
   */
  repartition?: number;
  /**
   * L'assiette du pourcentage :
   * - `tirage` : le tirage de l'exercice (stock d'ouverture + fabriqués) ;
   * - `disponible` : le stock du mois (stock au début + fabriqués du mois).
   */
  base?: 'tirage' | 'disponible';
  /** Une case par mois : exemplaires, ou pourcentage selon `mode`. */
  valeurs: (number | null)[];
}

/** Un mouvement de stock réel, saisi dans la page Stocks du journal. */
export interface MouvementStock {
  id: string;
  /** Date réelle (ISO yyyy-mm-dd). */
  date: string;
  /** Mois comptable de rattachement. */
  mois: string;
  jeu: string;
  /**
   * `fabrication` fait entrer des exemplaires, `vente` et `perte` en font
   * sortir, `ajustement` corrige un inventaire (quantité signée).
   */
  type: 'fabrication' | 'vente' | 'perte' | 'ajustement';
  quantite: number;
  /**
   * Prix unitaire HT : coût de revient pour une entrée, prix de vente pour une
   * vente. Une perte n'en a pas — elle est valorisée au coût moyen.
   */
  unitaire: number;
  /** Canal de la vente (distributeur, boutique, éditeur…), pour la comparer au prévu. */
  canal?: string;
  /** Écriture du journal correspondante, quand il y en a une. */
  entryId?: string;
  note?: string;
}

export interface ChronoEvent {
  id: string;
  projet: string;
  action: string;
  debut: string;
  fin: string;
  detail?: string;
  /**
   * Un emoji posé sur l'étape, pour repérer d'un coup d'œil ce qui compte :
   * un tirage, une sortie, un salon. Il s'affiche dans la bande et dans le
   * libellé.
   */
  emoji?: string;
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
  /**
   * La couleur du jeu, choisie une fois dans l'onglet Jeux et reprise partout :
   * journal, synthèse, prévisionnel, chronologie. Elle suit le jeu quand on le
   * renomme.
   */
  couleur?: string;
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
