import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  JournalEntry, FinanceEntry, BudgetExercice, ChronoEvent, TresoPrevLine, Referentiels, CategorieMeta,
  FormulePrev, JeuMeta, PrevLigne, PrevSection, TresoManuel,
} from '../types';
import {
  categoriesImmobilisees, categoriesManquantes, estLigneCalculee, gabaritPrevisionnel,
  migrerBudgets, sectionDeCategorie, memeJeu,
} from '../utils/previsionnel';
import {
  CATEGORIES_PERSONNEL_INITIALES, GROUPE_PERSONNEL, POSTES_JEU_IMMOBILISES,
  estPosteJeuImmobilise,
} from '../utils/blocs';
import { EXERCICES, moisExercice, PREMIER_EXERCICE } from '../utils/dates';
import seedJournal from '../data/journal.json';
import seedReferentiels from '../data/referentiels.json';
import seedBudgets from '../data/budgets.json';
import seedTresorerie from '../data/tresorerie.json';
import seedChronologie from '../data/chronologie.json';

function uid(): string {
  return crypto.randomUUID();
}

/** Jeux repris des tableurs ; la liste est modifiable dans l'app. */
export const JEUX_PAR_DEFAUT = ['EDIT', 'CAMINO', 'TORNADICES'];

/**
 * Déduit le jeu d'une écriture : d'abord le mot clé, sinon le suffixe de la
 * catégorie (« Illustrations EDIT » -> EDIT). Utilisé à l'import et en migration.
 */
export function deduireJeu(e: JournalEntry, jeux: string[]): string {
  const mot = (e.motsCles ?? '').trim();
  const parMot = jeux.find(j => memeJeu(j, mot));
  if (parMot) return parMot;
  // Sinon, le suffixe de la catégorie : « Ventes EDIT » -> EDIT.
  const cat = e.categorie.trim();
  const dernier = cat.split(/[\s—-]+/).pop() ?? '';
  return jeux.find(j => memeJeu(j, dernier)) ?? '';
}

/**
 * Catégories qui ne sont pas des recettes : un remboursement ou une note de
 * frais ne crée pas de chiffre d'affaires, il rend une dépense déjà passée.
 * Ces écritures deviennent des charges négatives — elles se retranchent des
 * charges du mois, et leur TVA vient en moins de la TVA déductible, jamais en
 * TVA collectée.
 */
const CATEGORIES_EN_REDUCTION = ['notes de frais', 'remboursement'];

/**
 * Rebascule les remboursements et notes de frais des produits vers les charges,
 * en négatif. Le résultat ne bouge pas d'un centime (un produit de +100 et une
 * charge de -100 pèsent pareil), le chiffre d'affaires, lui, redevient juste.
 */
function remboursementsEnReductionDeCharges(
  entries: JournalEntry[], refs: Referentiels,
): { entries: JournalEntry[]; referentiels: Referentiels } {
  const cibles = new Set(CATEGORIES_EN_REDUCTION.map(c => c.toLowerCase()));
  const corrigees = entries.map(e => {
    if (e.type !== 'produit' || !cibles.has(e.categorie.toLowerCase())) return e;
    return { ...e, type: 'charges' as const, ht: -e.ht, tva: -e.tva, ttc: -e.ttc };
  });
  const dansProduits = refs.categoriesProduits.filter(c => cibles.has(c.toLowerCase()));
  if (!dansProduits.length) return { entries: corrigees, referentiels: refs };
  return {
    entries: corrigees,
    referentiels: {
      ...refs,
      categoriesProduits: refs.categoriesProduits.filter(c => !cibles.has(c.toLowerCase())),
      categoriesDepenses: [...refs.categoriesDepenses, ...dansProduits],
    },
  };
}

/**
 * Le pourcentage d'imprévus déjà inscrit dans le nom de la ligne
 * (« Imprévus (10%) »), à défaut 10 %.
 */
function tauxImprevu(l: { categorie: string }): number {
  const m = l.categorie.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return m ? Number(m[1].replace(',', '.')) : 10;
}

/** Postes de jeu qui restent en charges, listés pour que la grille les propose. */
const POSTES_JEU_CHARGES = ['Prototypage Jeux', 'Communication Jeux', "Avances Droit d'Auteur"];

/** « Illustrations EDIT » -> « Illustrations » : le jeu vit dans sa colonne. */
function nomGenerique(categorie: string, jeux: string[]): string {
  for (const j of jeux) {
    const suffixe = ` ${j}`;
    if (categorie.toUpperCase().endsWith(suffixe.toUpperCase())) {
      return categorie.slice(0, categorie.length - suffixe.length).trim();
    }
  }
  return categorie;
}

/**
 * Range les postes de jeux : le développement graphique et les illustrations
 * passent à l'actif (amortis sur cinq ans), le reste demeure en charges. Les
 * catégories perdent le nom du jeu — il est déjà porté par la colonne « Jeu »,
 * ce qui permet à chaque jeu d'avoir sa propre ligne sur chaque poste.
 */
function rangerPostesDeJeu(
  entries: JournalEntry[], refs: Referentiels,
): { entries: JournalEntry[]; referentiels: Referentiels } {
  // La nature de chaque poste de jeu est portée par sa catégorie : c'est là
  // qu'elle se règle ensuite, dans l'onglet Catégories.
  const jeux = refs.jeux ?? JEUX_PAR_DEFAUT;
  const aImmobiliser = new Set(POSTES_JEU_IMMOBILISES.map(c => c.toLowerCase()));

  const corrigees = entries.map(e => {
    const generique = nomGenerique(e.categorie, jeux);
    if (generique === e.categorie && !aImmobiliser.has(generique.toLowerCase())) return e;
    // Le jeu était déduit du suffixe : on le fige avant de renommer.
    const jeu = e.jeu || deduireJeu(e, jeux);
    if (!aImmobiliser.has(generique.toLowerCase())) return { ...e, categorie: generique, jeu };
    return {
      ...e, categorie: generique, jeu,
      type: 'immo' as const, immoDureeAns: e.immoDureeAns ?? 5,
    };
  });

  const anciennes = new Set(entries.map(e => e.categorie));
  const renommees = [...anciennes].map(c => nomGenerique(c, jeux));
  const catsJeux = [...new Set([
    ...refs.categoriesJeux.map(c => nomGenerique(c, jeux)),
    ...renommees.filter(c => aImmobiliser.has(c.toLowerCase())),
    ...POSTES_JEU_CHARGES,
  ])];

  const meta = { ...(refs.categoriesMeta ?? {}) };
  for (const c of catsJeux) {
    meta[c] = { ...(meta[c] ?? {}), immobilisee: estPosteJeuImmobilise(c) };
    if (estPosteJeuImmobilise(c)) meta[c].dureeAns = meta[c].dureeAns ?? 5;
  }
  return {
    entries: corrigees,
    referentiels: { ...refs, categoriesJeux: catsJeux, categoriesMeta: meta },
  };
}

/** Mise en forme d'une colonne du journal (gras, italique, couleur, alignement). */
export interface ColFormat {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export type CatKind = 'categoriesDepenses' | 'categoriesJeux' | 'categoriesProduits';

/**
 * Largeurs de colonnes d'un tableau, en pixels, dans l'ordre des colonnes.
 * Un tableau absent de la table garde ses largeurs automatiques.
 */
export type ColWidths = Record<string, number[]>;

/** Clés dont la modification est enregistrée dans l'historique d'annulation. */
const DATA_KEYS = ['entries', 'finances', 'referentiels', 'budgets', 'previsionnels', 'chronologie', 'tresoPrev', 'tresoManuel', 'journalFormats', 'blocCouleurs'] as const;
type DataKey = typeof DATA_KEYS[number];
type Snapshot = Pick<AppState, DataKey>;

export interface AppState {
  entries: JournalEntry[];
  finances: FinanceEntry[];
  referentiels: Referentiels;
  budgets: Record<string, BudgetExercice>;
  /** Prévisionnel par exercice, aligné sur les catégories de la synthèse. */
  previsionnels: Record<string, PrevLigne[]>;
  /** Corrections manuelles de la trésorerie, mois par mois. */
  tresoManuel: Record<string, TresoManuel>;
  chronologie: ChronoEvent[];
  tresoPrev: TresoPrevLine[];
  /** Mise en forme par colonne des tableaux, indexée par « table:colonne ». */
  journalFormats: Record<string, ColFormat>;
  /** Largeurs de colonnes redimensionnées à la souris, par tableau. */
  colWidths: ColWidths;
  /** Teinte majeure choisie pour chaque bloc (produits, charges, jeux…). */
  blocCouleurs: Record<string, string>;

  // Historique (non persisté) : profondeur disponible pour annuler / rétablir.
  undoDepth: number;
  redoDepth: number;
  undo: () => void;
  redo: () => void;
  setColFormat: (col: string, patch: ColFormat) => void;
  resetColFormat: (col: string) => void;
  /** Enregistre les largeurs d'un tableau (hors historique d'annulation). */
  setColWidths: (table: string, widths: number[]) => void;
  /** Rend ses largeurs automatiques à un tableau, ou à tous si non précisé. */
  resetColWidths: (table?: string) => void;
  /** Recolore un bloc à partir d'une teinte majeure (toutes les pages suivent). */
  setBlocCouleur: (bloc: string, hex: string) => void;
  /** Rend au bloc sa teinte d'origine, ou à tous les blocs si non précisé. */
  resetBlocCouleur: (bloc?: string) => void;

  addEntry: (e: Omit<JournalEntry, 'id'>) => string;
  updateEntry: (id: string, patch: Partial<JournalEntry>) => void;
  removeEntry: (id: string) => void;
  duplicateEntry: (id: string) => void;
  /** Modification groupée : applique le meme patch a plusieurs ecritures. */
  updateEntries: (ids: string[], patch: Partial<JournalEntry>) => void;
  removeEntries: (ids: string[]) => void;
  duplicateEntries: (ids: string[]) => void;
  /** Colle le contenu d'une ecriture source dans une ecriture cible. */
  pasteInto: (targetId: string, source: JournalEntry) => void;

  addFinance: (f: Omit<FinanceEntry, 'id'>) => void;
  updateFinance: (id: string, patch: Partial<FinanceEntry>) => void;
  removeFinance: (id: string) => void;

  updateBudgetCell: (exercice: string, ligneId: string, moisIdx: number, value: number | null) => void;
  updateBudgetLine: (exercice: string, ligneId: string, patch: Partial<BudgetExercice['lignes'][number]>) => void;
  addBudgetLine: (exercice: string, ligne: Omit<BudgetExercice['lignes'][number], 'id'>) => void;
  removeBudgetLine: (exercice: string, ligneId: string) => void;

  // ----- Prévisionnel -----
  setPrevCell: (exercice: string, ligneId: string, moisIdx: number, value: number | null) => void;
  /** Vide d'un coup plusieurs cellules — une seule étape dans l'annulation. */
  viderPrevCells: (exercice: string, cells: { ligneIdx: number; moisIdx: number }[]) => void;
  addPrevLigne: (exercice: string, categorie: string, section?: PrevSection, jeu?: string) => void;
  /**
   * Une ligne par jeu du catalogue, pour un poste qui les concerne tous
   * (prototypage, communication, illustrations…). En une seule annulation.
   */
  addPrevLignesParJeu: (exercice: string, categorie: string, section?: PrevSection) => void;
  updatePrevLigne: (exercice: string, ligneId: string, patch: Partial<PrevLigne>) => void;
  removePrevLigne: (exercice: string, ligneId: string) => void;
  /** Recopie une valeur sur tous les mois restants de l'exercice. */
  etalerPrevLigne: (exercice: string, ligneId: string, montant: number) => void;
  /** Règle (ou retire) la formule d'une ligne calculée. */
  setPrevFormule: (exercice: string, ligneId: string, formule: FormulePrev | undefined) => void;
  /** Crée le couple « quantités » + « montant = quantités × taux, décalé ». */
  creerCalculHeures: (exercice: string, categorie: string, section: PrevSection) => void;
  /** Ajoute les lignes de la synthèse qui manquent encore, cellules vides. */
  completerPrevisionnel: (exercice: string) => void;

  addChrono: (c: Omit<ChronoEvent, 'id'>) => void;
  updateChrono: (id: string, patch: Partial<ChronoEvent>) => void;
  /** Même correction sur plusieurs étapes d'un coup, en une seule annulation. */
  updateChronos: (ids: string[], patch: Partial<ChronoEvent>) => void;
  /** Décale plusieurs étapes ensemble : chacune garde ses dates propres. */
  decalerChronos: (dates: { id: string; debut: string; fin: string }[]) => void;
  removeChrono: (id: string) => void;
  removeChronos: (ids: string[]) => void;
  /** Renomme un projet entier — toutes ses étapes suivent, sous-projets compris. */
  renommerProjet: (ancien: string, nouveau: string) => void;
  /** Supprime un projet et toutes ses étapes. */
  supprimerProjet: (projet: string) => void;
  /** Ordre d'affichage des projets sur la frise. */
  setOrdreProjets: (projets: string[]) => void;
  /** Couleur d'un projet de la chronologie ; elle suit son nom, pas son rang. */
  setCouleurProjet: (projet: string, couleur: string) => void;
  /** Déplace une étape juste avant ou juste après une autre. */
  deplacerChrono: (id: string, cible: string, apres: boolean) => void;

  addCategorie: (kind: CatKind, name: string) => void;
  removeCategorie: (kind: CatKind, name: string) => void;
  /** Renomme une catégorie et répercute le nouveau nom sur toutes les écritures. */
  renameCategorie: (kind: CatKind, ancien: string, nouveau: string) => void;
  /** Couleur / groupe d'une ou plusieurs catégories. */
  setCategorieMeta: (noms: string[], patch: CategorieMeta) => void;
  /** Déplace des catégories vers un autre type (dépense, jeux, produit). */
  moveCategories: (noms: string[], vers: CatKind) => void;
  /** Fusionne des catégories dans une seule : les écritures suivent. */
  mergeCategories: (noms: string[], cible: string) => void;
  removeCategories: (noms: string[]) => void;
  /** Corrige un mois de trésorerie : ajustement de flux et/ou relevé bancaire. */
  setTresoManuel: (mois: string, patch: TresoManuel) => void;
  setGroupes: (groupes: string[]) => void;
  /**
   * Déplace une catégorie dans l'ordre d'affichage, juste avant ou juste après
   * une autre. Si `groupe` est fourni, la catégorie change aussi de groupe —
   * c'est ce qui se passe quand on la lâche sous un autre bandeau.
   */
  deplacerCategorie: (cat: string, cible: string, apres: boolean, groupe?: string) => void;
  /** Déplace un groupe entier dans l'ordre des bandeaux. */
  deplacerGroupe: (groupe: string, cible: string, apres: boolean) => void;
  /** Déplace un jeu dans l'ordre du catalogue (et donc de la synthèse). */
  deplacerJeu: (jeu: string, cible: string, apres: boolean) => void;
  addJeu: (name: string) => void;
  renameJeu: (ancien: string, nouveau: string) => void;
  removeJeu: (name: string) => void;
  /** Fiche d'un jeu : lien vers le Production Calculator, notes. */
  setJeuMeta: (jeu: string, patch: JeuMeta) => void;
  addPaiement: (name: string) => void;
  addComptePlanComptable: (name: string) => void;

  restoreAll: (data: Partial<Pick<AppState, 'entries' | 'finances' | 'referentiels' | 'budgets' | 'previsionnels' | 'chronologie' | 'tresoPrev' | 'journalFormats' | 'colWidths' | 'blocCouleurs'>>) => void;
  resetToSeed: () => void;
}

function seedState() {
  let refs = avecGroupePersonnel(structuredClone(seedReferentiels) as Referentiels);
  refs.jeux = refs.jeux ?? JEUX_PAR_DEFAUT;
  const brutes = (structuredClone(seedJournal) as JournalEntry[]).map(e =>
    e.jeu ? e : { ...e, jeu: deduireJeu(e, refs.jeux!) });
  // Deux redressements appliqués une fois pour toutes, dès la première ouverture.
  const sansRemb = remboursementsEnReductionDeCharges(brutes, refs);
  const rangees = rangerPostesDeJeu(sansRemb.entries, sansRemb.referentiels);
  const entries = rangees.entries;
  refs = rangees.referentiels;
  return {
    entries,
    finances: structuredClone(seedTresorerie.mouvementsFinanciers) as FinanceEntry[],
    referentiels: refs,
    budgets: structuredClone(seedBudgets) as unknown as Record<string, BudgetExercice>,
    // Seul l'exercice en cours est repris du tableur ; les quatre suivants
    // reçoivent la même grille de lignes, mais toutes cellules vides.
    previsionnels: previsionnelsInitiaux(refs, entries),
    chronologie: structuredClone(seedChronologie) as ChronoEvent[],
    tresoManuel: {} as Record<string, TresoManuel>,
    tresoPrev: structuredClone(seedTresorerie.previsionnel) as TresoPrevLine[],
    journalFormats: {} as Record<string, ColFormat>,
    colWidths: {} as ColWidths,
    blocCouleurs: {} as Record<string, string>,
  };
}

/**
 * Branche les workshops sur les heures de formation : le montant d'un mois est
 * le produit des heures du mois *précédent* par le taux horaire — Valentin est
 * payé au début du mois qui suit la prestation.
 *
 * Le taux est déduit des montants déjà budgétés (montant ÷ heures), et la ligne
 * d'heures remonte juste au-dessus des workshops, dans le bloc Produits.
 */
function brancherCalculHeures(lignes: PrevLigne[]): PrevLigne[] {
  const workshops = lignes.find(l =>
    !l.unite && !l.formule && /workshop/i.test(l.categorie));
  const heures = lignes.find(l => l.unite === 'heures' && /heure/i.test(l.categorie));
  if (!workshops || !heures) return lignes;

  // Taux horaire implicite : le premier mois où les deux lignes sont remplies.
  let taux = 0;
  for (let i = 0; i < heures.valeurs.length; i++) {
    const h = heures.valeurs[i], m = workshops.valeurs[i];
    if (h && m) { taux = m / h; break; }
  }
  if (!taux) return lignes;

  const heuresProduits: PrevLigne = { ...heures, section: workshops.section };
  const calcule: PrevLigne = {
    ...workshops,
    formule: { type: 'heures-taux', sourceId: heures.id, tauxHT: taux, tauxTVA: 20, decalage: 1 },
  };
  const autres = lignes.filter(l => l.id !== heures.id && l.id !== workshops.id);
  const idx = lignes.findIndex(l => l.id === workshops.id);
  const avant = autres.slice(0, Math.max(0, idx));
  return [...avant, heuresProduits, calcule, ...autres.slice(Math.max(0, idx))];
}

/**
 * Prévisionnels de départ : l'exercice en cours vient du tableur, les suivants
 * sont un gabarit vierge — mêmes lignes que la synthèse, cellules à remplir.
 */
function previsionnelsInitiaux(
  refs: Referentiels, entries: JournalEntry[],
): Record<string, PrevLigne[]> {
  const budgets = structuredClone(seedBudgets) as unknown as Record<string, BudgetExercice>;
  const out = migrerBudgets({ [PREMIER_EXERCICE]: budgets[PREMIER_EXERCICE] }, refs);
  out[PREMIER_EXERCICE] = brancherCalculHeures(out[PREMIER_EXERCICE] ?? []);
  const immos = categoriesImmobilisees(entries);
  for (const ex of EXERCICES) {
    if (ex === PREMIER_EXERCICE) continue;
    out[ex] = gabaritPrevisionnel(refs, ex, immos, uid);
  }
  // « Imprévus (10 %) » se calcule sur tout ce qui le précède dans son bloc.
  for (const ex of Object.keys(out)) out[ex] = brancherImprevus(out[ex]);
  return out;
}

/** Branche les lignes d'imprévus sur le pourcentage du bloc qui les précède. */
function brancherImprevus(lignes: PrevLigne[]): PrevLigne[] {
  return lignes.map(l => !l.formule && /impr[ée]vu/i.test(l.categorie)
    ? { ...l, formule: { type: 'pourcentage-bloc' as const, taux: tauxImprevu(l) } }
    : l);
}

/**
 * Le bloc Personnel existe dès le départ, même sans écriture : les cotisations
 * du gérant (TNS) y sont rattachées, et les salaires viendront s'y ranger.
 */
function avecGroupePersonnel(refs: Referentiels): Referentiels {
  const groupes = refs.groupes ?? [];
  const meta = { ...(refs.categoriesMeta ?? {}) };
  for (const c of CATEGORIES_PERSONNEL_INITIALES) {
    if (refs.categoriesDepenses.includes(c) && !meta[c]?.groupe) {
      meta[c] = { ...meta[c], groupe: GROUPE_PERSONNEL };
    }
  }
  return {
    ...refs,
    groupes: groupes.includes(GROUPE_PERSONNEL) ? groupes : [...groupes, GROUPE_PERSONNEL],
    categoriesMeta: meta,
  };
}

// ----- Historique d'annulation (Cmd+Z / Ctrl+Z) --------------------------
// Les piles vivent hors du state : elles ne sont ni persistées ni sérialisées.
const MAX_HISTORIQUE = 100;
let past: Snapshot[] = [];
let future: Snapshot[] = [];
let suspendHistory = false;

function snapshot(s: AppState): Snapshot {
  return {
    entries: s.entries, finances: s.finances, referentiels: s.referentiels,
    budgets: s.budgets, previsionnels: s.previsionnels,
    chronologie: s.chronologie, tresoPrev: s.tresoPrev, tresoManuel: s.tresoManuel,
    journalFormats: s.journalFormats, blocCouleurs: s.blocCouleurs,
  };
}
function donneesModifiees(a: Snapshot, b: Snapshot): boolean {
  return DATA_KEYS.some(k => a[k] !== b[k]);
}

export const useStore = create<AppState>()(
  persist(
    (setRaw, get) => {
      /** set « historisé » : mémorise l'état d'avant si les données changent. */
      const set: typeof setRaw = (partial, replace) => {
        if (suspendHistory) { setRaw(partial as never, replace as never); return; }
        const avant = snapshot(get());
        setRaw(partial as never, replace as never);
        const apres = snapshot(get());
        if (donneesModifiees(avant, apres)) {
          past.push(avant);
          if (past.length > MAX_HISTORIQUE) past.shift();
          future = [];
          setRaw({ undoDepth: past.length, redoDepth: 0 } as never);
        }
      };

      return {
      ...seedState(),
      undoDepth: 0,
      redoDepth: 0,

      undo: () => {
        if (!past.length) return;
        const courant = snapshot(get());
        const precedent = past.pop()!;
        future.push(courant);
        suspendHistory = true;
        setRaw(precedent as never);
        suspendHistory = false;
        setRaw({ undoDepth: past.length, redoDepth: future.length } as never);
      },
      redo: () => {
        if (!future.length) return;
        const courant = snapshot(get());
        const suivant = future.pop()!;
        past.push(courant);
        suspendHistory = true;
        setRaw(suivant as never);
        suspendHistory = false;
        setRaw({ undoDepth: past.length, redoDepth: future.length } as never);
      },
      setColFormat: (col, patch) => set(s => ({
        journalFormats: { ...s.journalFormats, [col]: { ...s.journalFormats[col], ...patch } },
      })),
      resetColFormat: (col) => set(s => {
        const next = { ...s.journalFormats };
        delete next[col];
        return { journalFormats: next };
      }),

      // Redimensionner une colonne n'est pas une modification de données :
      // ça ne remplit pas la pile d'annulation (Cmd+Z reste utile).
      setColWidths: (table, widths) => {
        suspendHistory = true;
        set(s => ({ colWidths: { ...s.colWidths, [table]: widths } }));
        suspendHistory = false;
      },
      setBlocCouleur: (bloc, hex) => set(s => ({
        blocCouleurs: { ...s.blocCouleurs, [bloc]: hex },
      })),
      resetBlocCouleur: (bloc) => set(s => {
        if (!bloc) return { blocCouleurs: {} };
        const next = { ...s.blocCouleurs };
        delete next[bloc];
        return { blocCouleurs: next };
      }),
      resetColWidths: (table) => {
        suspendHistory = true;
        set(s => {
          if (!table) return { colWidths: {} };
          const next = { ...s.colWidths };
          delete next[table];
          return { colWidths: next };
        });
        suspendHistory = false;
      },

      addEntry: (e) => {
        const id = uid();
        set(s => ({ entries: [...s.entries, { ...e, id }] }));
        return id;
      },
      updateEntry: (id, patch) => set(s => ({
        entries: s.entries.map(e => e.id === id ? { ...e, ...patch } : e),
      })),
      removeEntry: (id) => set(s => ({ entries: s.entries.filter(e => e.id !== id) })),
      duplicateEntry: (id) => set(s => {
        const src = s.entries.find(e => e.id === id);
        if (!src) return s;
        return { entries: [...s.entries, { ...src, id: uid(), facture: '' }] };
      }),

      updateEntries: (ids, patch) => set(s => {
        const set_ = new Set(ids);
        return { entries: s.entries.map(e => set_.has(e.id) ? { ...e, ...patch } : e) };
      }),
      removeEntries: (ids) => set(s => {
        const set_ = new Set(ids);
        return { entries: s.entries.filter(e => !set_.has(e.id)) };
      }),
      duplicateEntries: (ids) => set(s => {
        const set_ = new Set(ids);
        const copies = s.entries.filter(e => set_.has(e.id)).map(e => ({ ...e, id: uid(), facture: '' }));
        return { entries: [...s.entries, ...copies] };
      }),
      pasteInto: (targetId, source) => set(s => ({
        entries: s.entries.map(e => e.id === targetId ? {
          // On garde l'identite et le rattachement de la ligne cible ;
          // tout le contenu vient de la ligne copiee.
          ...e,
          fournisseur: source.fournisseur,
          description: source.description,
          categorie: source.categorie,
          ttc: source.ttc,
          tva: source.tva,
          ht: source.ht,
          paiement: source.paiement,
          type: source.type,
          compta: source.compta,
          motsCles: source.motsCles,
          immoDureeAns: source.immoDureeAns,
          jeu: source.jeu,
        } : e),
      })),

      addFinance: (f) => set(s => ({ finances: [...s.finances, { ...f, id: uid() }] })),
      updateFinance: (id, patch) => set(s => ({
        finances: s.finances.map(f => f.id === id ? { ...f, ...patch } : f),
      })),
      removeFinance: (id) => set(s => ({ finances: s.finances.filter(f => f.id !== id) })),

      updateBudgetCell: (exercice, ligneId, moisIdx, value) => set(s => {
        const b = s.budgets[exercice];
        if (!b) return s;
        return {
          budgets: {
            ...s.budgets,
            [exercice]: {
              ...b,
              lignes: b.lignes.map(l => l.id === ligneId
                ? { ...l, valeurs: l.valeurs.map((v, i) => i === moisIdx ? value : v) }
                : l),
            },
          },
        };
      }),
      updateBudgetLine: (exercice, ligneId, patch) => set(s => {
        const b = s.budgets[exercice];
        if (!b) return s;
        return {
          budgets: {
            ...s.budgets,
            [exercice]: { ...b, lignes: b.lignes.map(l => l.id === ligneId ? { ...l, ...patch } : l) },
          },
        };
      }),
      addBudgetLine: (exercice, ligne) => set(s => {
        const b = s.budgets[exercice];
        if (!b) return s;
        return {
          budgets: {
            ...s.budgets,
            [exercice]: { ...b, lignes: [...b.lignes, { ...ligne, id: uid() }] },
          },
        };
      }),
      removeBudgetLine: (exercice, ligneId) => set(s => {
        const b = s.budgets[exercice];
        if (!b) return s;
        return {
          budgets: {
            ...s.budgets,
            [exercice]: { ...b, lignes: b.lignes.filter(l => l.id !== ligneId) },
          },
        };
      }),

      setPrevCell: (exercice, ligneId, moisIdx, value) => set(s => ({
        previsionnels: {
          ...s.previsionnels,
          [exercice]: (s.previsionnels[exercice] ?? []).map(l => l.id === ligneId
            ? { ...l, valeurs: l.valeurs.map((v, i) => i === moisIdx ? value : v) }
            : l),
        },
      })),
      viderPrevCells: (exercice, cells) => set(s => {
        const lignes = s.previsionnels[exercice] ?? [];
        const parLigne = new Map<number, Set<number>>();
        for (const c of cells) {
          if (!parLigne.has(c.ligneIdx)) parLigne.set(c.ligneIdx, new Set());
          parLigne.get(c.ligneIdx)!.add(c.moisIdx);
        }
        return {
          previsionnels: {
            ...s.previsionnels,
            [exercice]: lignes.map((l, i) => {
              const mois = parLigne.get(i);
              if (!mois) return l;
              return { ...l, valeurs: l.valeurs.map((v, j) => mois.has(j) ? null : v) };
            }),
          },
        };
      }),
      addPrevLigne: (exercice, categorie, section, jeu) => set(s => {
        const nMois = moisExercice(exercice).length;
        const ligne: PrevLigne = {
          id: uid(),
          categorie,
          section: section ?? sectionDeCategorie(categorie, s.referentiels),
          ...(jeu ? { jeu } : {}),
          // Une ligne d'imprévus se calcule d'emblée sur ce qui la précède.
          ...(/impr[ée]vu/i.test(categorie)
            ? { formule: { type: 'pourcentage-bloc' as const, taux: tauxImprevu({ categorie }) } }
            : {}),
          valeurs: new Array<number | null>(nMois).fill(null),
        };
        return {
          previsionnels: { ...s.previsionnels, [exercice]: [...(s.previsionnels[exercice] ?? []), ligne] },
        };
      }),
      addPrevLignesParJeu: (exercice, categorie, section) => set(s => {
        const nMois = moisExercice(exercice).length;
        const jeux = s.referentiels.jeux ?? JEUX_PAR_DEFAUT;
        const sec = section ?? sectionDeCategorie(categorie, s.referentiels);
        const deja = new Set((s.previsionnels[exercice] ?? [])
          .filter(l => l.categorie === categorie).map(l => l.jeu ?? ''));
        const nouvelles: PrevLigne[] = jeux.filter(j => !deja.has(j)).map(jeu => ({
          id: uid(), categorie, section: sec, jeu,
          valeurs: new Array<number | null>(nMois).fill(null),
        }));
        if (!nouvelles.length) return s;
        return {
          previsionnels: {
            ...s.previsionnels,
            [exercice]: [...(s.previsionnels[exercice] ?? []), ...nouvelles],
          },
        };
      }),

      updatePrevLigne: (exercice, ligneId, patch) => set(s => ({
        previsionnels: {
          ...s.previsionnels,
          [exercice]: (s.previsionnels[exercice] ?? []).map(l => l.id === ligneId ? { ...l, ...patch } : l),
        },
      })),
      removePrevLigne: (exercice, ligneId) => set(s => ({
        previsionnels: {
          ...s.previsionnels,
          [exercice]: (s.previsionnels[exercice] ?? []).filter(l => l.id !== ligneId),
        },
      })),
      setPrevFormule: (exercice, ligneId, formule) => set(s => ({
        previsionnels: {
          ...s.previsionnels,
          [exercice]: (s.previsionnels[exercice] ?? []).map(l =>
            l.id === ligneId ? { ...l, formule } : l),
        },
      })),

      creerCalculHeures: (exercice, categorie, section) => set(s => {
        const nMois = moisExercice(exercice).length;
        const vide = () => new Array<number | null>(nMois).fill(null);
        const heures: PrevLigne = {
          id: uid(), categorie: `${categorie} — heures effectuées`, section,
          unite: 'heures', valeurs: vide(),
        };
        const montant: PrevLigne = {
          id: uid(), categorie, section, valeurs: vide(),
          formule: { type: 'heures-taux', sourceId: heures.id, tauxHT: 50, tauxTVA: 20, decalage: 1 },
        };
        return {
          previsionnels: {
            ...s.previsionnels,
            [exercice]: [...(s.previsionnels[exercice] ?? []), heures, montant],
          },
        };
      }),

      completerPrevisionnel: (exercice) => set(s => {
        const nMois = moisExercice(exercice).length;
        const manquantes = categoriesManquantes(
          s.previsionnels[exercice] ?? [], s.referentiels, categoriesImmobilisees(s.entries));
        if (!manquantes.length) return s;
        const nouvelles: PrevLigne[] = brancherImprevus(manquantes.map(m => ({
          id: uid(), categorie: m.categorie, section: m.section,
          ...(m.jeu ? { jeu: m.jeu } : {}),
          valeurs: new Array<number | null>(nMois).fill(null),
        })));
        return {
          previsionnels: {
            ...s.previsionnels,
            [exercice]: [...(s.previsionnels[exercice] ?? []), ...nouvelles],
          },
        };
      }),

      etalerPrevLigne: (exercice, ligneId, montant) => set(s => ({
        previsionnels: {
          ...s.previsionnels,
          [exercice]: (s.previsionnels[exercice] ?? []).map(l => l.id === ligneId
            ? { ...l, valeurs: l.valeurs.map(() => montant) }
            : l),
        },
      })),

      addChrono: (c) => set(s => ({ chronologie: [...s.chronologie, { ...c, id: uid() }] })),
      updateChrono: (id, patch) => set(s => ({
        chronologie: s.chronologie.map(c => c.id === id ? { ...c, ...patch } : c),
      })),
      updateChronos: (ids, patch) => set(s => {
        const set_ = new Set(ids);
        return { chronologie: s.chronologie.map(c => set_.has(c.id) ? { ...c, ...patch } : c) };
      }),

      decalerChronos: (dates) => set(s => {
        const par = new Map(dates.map(d => [d.id, d]));
        return {
          chronologie: s.chronologie.map(c => {
            const d = par.get(c.id);
            return d ? { ...c, debut: d.debut, fin: d.fin } : c;
          }),
        };
      }),

      removeChrono: (id) => set(s => ({ chronologie: s.chronologie.filter(c => c.id !== id) })),
      removeChronos: (ids) => set(s => {
        const set_ = new Set(ids);
        return { chronologie: s.chronologie.filter(c => !set_.has(c.id)) };
      }),

      renommerProjet: (ancien, nouveau) => set(s => {
        const n = nouveau.trim();
        if (!n || n === ancien) return s;
        // « EDIT - Tirage 2 » suit « EDIT » : on ne remplace que la racine.
        const suit = (projet: string) => projet === ancien
          ? n
          : projet.startsWith(ancien + ' - ') ? n + projet.slice(ancien.length) : projet;
        const projets = (s.referentiels.chronoProjets ?? []).map(p => p === ancien ? n : p);
        // La couleur est attachée au nom : elle suit le projet renommé.
        const couleurs = { ...(s.referentiels.chronoCouleurs ?? {}) };
        if (couleurs[ancien]) { couleurs[n] = couleurs[ancien]; delete couleurs[ancien]; }
        return {
          chronologie: s.chronologie.map(c => ({ ...c, projet: suit(c.projet) })),
          referentiels: {
            ...s.referentiels,
            chronoProjets: [...new Set(projets)],
            chronoCouleurs: couleurs,
          },
        };
      }),

      supprimerProjet: (projet) => set(s => ({
        chronologie: s.chronologie.filter(c =>
          c.projet !== projet && !c.projet.startsWith(projet + ' - ')),
        referentiels: {
          ...s.referentiels,
          chronoProjets: (s.referentiels.chronoProjets ?? []).filter(p => p !== projet),
        },
      })),

      setOrdreProjets: (projets) => set(s => ({
        referentiels: { ...s.referentiels, chronoProjets: projets },
      })),

      setCouleurProjet: (projet, couleur) => set(s => ({
        referentiels: {
          ...s.referentiels,
          chronoCouleurs: { ...(s.referentiels.chronoCouleurs ?? {}), [projet]: couleur },
        },
      })),

      deplacerChrono: (id, cible, apres) => set(s => {
        if (id === cible) return s;
        const liste = s.chronologie.filter(c => c.id !== id);
        const bouge = s.chronologie.find(c => c.id === id);
        if (!bouge) return s;
        let i = liste.findIndex(c => c.id === cible);
        if (i < 0) i = liste.length; else if (apres) i += 1;
        liste.splice(i, 0, bouge);
        return { chronologie: liste };
      }),

      addCategorie: (kind, name) => set(s => {
        const list = s.referentiels[kind];
        if (!name.trim() || list.includes(name.trim())) return s;
        return { referentiels: { ...s.referentiels, [kind]: [...list, name.trim()] } };
      }),
      removeCategorie: (kind, name) => set(s => {
        const used = s.entries.some(e => e.categorie === name);
        if (used) return s;
        return { referentiels: { ...s.referentiels, [kind]: s.referentiels[kind].filter(c => c !== name) } };
      }),
      renameCategorie: (kind, ancien, nouveau) => set(s => {
        const nom = nouveau.trim();
        if (!nom || nom === ancien) return s;
        const meta = { ...(s.referentiels.categoriesMeta ?? {}) };
        if (meta[ancien]) { meta[nom] = meta[ancien]; delete meta[ancien]; }
        return {
          referentiels: {
            ...s.referentiels,
            [kind]: s.referentiels[kind].map(c => c === ancien ? nom : c),
            categoriesMeta: meta,
          },
          entries: s.entries.map(e => e.categorie === ancien ? { ...e, categorie: nom } : e),
        };
      }),

      setCategorieMeta: (noms, patch) => set(s => {
        const meta = { ...(s.referentiels.categoriesMeta ?? {}) };
        for (const n of noms) {
          const suivant = { ...meta[n], ...patch };
          // Une clé mise à `undefined` est retirée : c'est ainsi qu'on revient
          // au comportement automatique (la nature décidée ligne par ligne).
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) delete (suivant as Record<string, unknown>)[k];
          }
          meta[n] = suivant;
        }
        return { referentiels: { ...s.referentiels, categoriesMeta: meta } };
      }),

      moveCategories: (noms, vers) => set(s => {
        const set_ = new Set(noms);
        const KINDS: CatKind[] = ['categoriesDepenses', 'categoriesJeux', 'categoriesProduits'];
        const refs = { ...s.referentiels };
        for (const k of KINDS) refs[k] = refs[k].filter(c => !set_.has(c));
        refs[vers] = [...refs[vers], ...noms.filter(n => !refs[vers].includes(n))];
        // Une catégorie de produit implique des écritures de type « produit ».
        const nouveauType = vers === 'categoriesProduits' ? 'produit' : 'charges';
        return {
          referentiels: refs,
          entries: s.entries.map(e => {
            if (!set_.has(e.categorie)) return e;
            if (vers === 'categoriesProduits') return { ...e, type: 'produit' as const };
            return e.type === 'produit' ? { ...e, type: nouveauType as JournalEntry['type'] } : e;
          }),
        };
      }),

      mergeCategories: (noms, cible) => set(s => {
        const aFusionner = noms.filter(n => n !== cible);
        if (!aFusionner.length) return s;
        const set_ = new Set(aFusionner);
        const KINDS: CatKind[] = ['categoriesDepenses', 'categoriesJeux', 'categoriesProduits'];
        const refs = { ...s.referentiels };
        for (const k of KINDS) refs[k] = refs[k].filter(c => !set_.has(c));
        const meta = { ...(refs.categoriesMeta ?? {}) };
        for (const n of aFusionner) delete meta[n];
        refs.categoriesMeta = meta;
        return {
          referentiels: refs,
          entries: s.entries.map(e => set_.has(e.categorie) ? { ...e, categorie: cible } : e),
        };
      }),

      removeCategories: (noms) => set(s => {
        // On ne supprime que les catégories sans écriture rattachée.
        const utilisees = new Set(s.entries.map(e => e.categorie));
        const set_ = new Set(noms.filter(n => !utilisees.has(n)));
        if (!set_.size) return s;
        const KINDS: CatKind[] = ['categoriesDepenses', 'categoriesJeux', 'categoriesProduits'];
        const refs = { ...s.referentiels };
        for (const k of KINDS) refs[k] = refs[k].filter(c => !set_.has(c));
        const meta = { ...(refs.categoriesMeta ?? {}) };
        for (const n of set_) delete meta[n];
        refs.categoriesMeta = meta;
        return { referentiels: refs };
      }),

      setTresoManuel: (mois, patch) => set(s => {
        const suivant = { ...(s.tresoManuel[mois] ?? {}), ...patch };
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === null) delete (suivant as Record<string, unknown>)[k];
        }
        const tresoManuel = { ...s.tresoManuel };
        if (Object.keys(suivant).length) tresoManuel[mois] = suivant;
        else delete tresoManuel[mois];
        return { tresoManuel };
      }),

      setGroupes: (groupes) => set(s => ({
        referentiels: { ...s.referentiels, groupes },
      })),

      deplacerCategorie: (cat, cible, apres, groupe) => set(s => {
        const KINDS: CatKind[] = ['categoriesDepenses', 'categoriesJeux', 'categoriesProduits'];
        const refs = { ...s.referentiels };
        const kind = KINDS.find(k => refs[k].includes(cat));
        if (!kind || cat === cible) return s;
        const liste = refs[kind].filter(c => c !== cat);
        let i = liste.indexOf(cible);
        if (i < 0) i = liste.length; else if (apres) i += 1;
        liste.splice(i, 0, cat);
        refs[kind] = liste;
        if (groupe !== undefined) {
          const meta = { ...(refs.categoriesMeta ?? {}) };
          meta[cat] = { ...(meta[cat] ?? {}), groupe: groupe || undefined };
          refs.categoriesMeta = meta;
        }
        return { referentiels: refs };
      }),

      deplacerGroupe: (groupe, cible, apres) => set(s => {
        if (groupe === cible) return s;
        const groupes = (s.referentiels.groupes ?? []).filter(g => g !== groupe);
        let i = groupes.indexOf(cible);
        if (i < 0) i = groupes.length; else if (apres) i += 1;
        groupes.splice(i, 0, groupe);
        return { referentiels: { ...s.referentiels, groupes } };
      }),

      deplacerJeu: (jeu, cible, apres) => set(s => {
        if (jeu === cible) return s;
        const jeux = (s.referentiels.jeux ?? JEUX_PAR_DEFAUT).filter(j => j !== jeu);
        let i = jeux.indexOf(cible);
        if (i < 0) i = jeux.length; else if (apres) i += 1;
        jeux.splice(i, 0, jeu);
        return { referentiels: { ...s.referentiels, jeux } };
      }),

      addJeu: (name) => set(s => {
        const n = name.trim();
        const jeux = s.referentiels.jeux ?? JEUX_PAR_DEFAUT;
        if (!n || jeux.includes(n)) return s;
        return { referentiels: { ...s.referentiels, jeux: [...jeux, n] } };
      }),
      renameJeu: (ancien, nouveau) => set(s => {
        const n = nouveau.trim();
        const jeux = s.referentiels.jeux ?? JEUX_PAR_DEFAUT;
        if (!n || n === ancien) return s;
        // La fiche du jeu (lien Production Calculator, notes) suit le nom.
        const meta = { ...(s.referentiels.jeuxMeta ?? {}) };
        if (meta[ancien]) { meta[n] = meta[ancien]; delete meta[ancien]; }
        return {
          referentiels: { ...s.referentiels, jeux: jeux.map(j => j === ancien ? n : j), jeuxMeta: meta },
          entries: s.entries.map(e => e.jeu === ancien ? { ...e, jeu: n } : e),
        };
      }),
      removeJeu: (name) => set(s => {
        const jeux = s.referentiels.jeux ?? JEUX_PAR_DEFAUT;
        const meta = { ...(s.referentiels.jeuxMeta ?? {}) };
        delete meta[name];
        return {
          referentiels: { ...s.referentiels, jeux: jeux.filter(j => j !== name), jeuxMeta: meta },
          entries: s.entries.map(e => e.jeu === name ? { ...e, jeu: '' } : e),
        };
      }),
      setJeuMeta: (jeu, patch) => set(s => {
        const suivant = { ...(s.referentiels.jeuxMeta ?? {})[jeu], ...patch };
        // Une clé mise à `undefined` est retirée : c'est ainsi qu'on revient à
        // la couleur automatique.
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) delete (suivant as Record<string, unknown>)[k];
        }
        return {
          referentiels: {
            ...s.referentiels,
            jeuxMeta: { ...(s.referentiels.jeuxMeta ?? {}), [jeu]: suivant },
          },
        };
      }),
      addPaiement: (name) => set(s => {
        if (!name.trim() || s.referentiels.paiements.includes(name.trim())) return s;
        return { referentiels: { ...s.referentiels, paiements: [...s.referentiels.paiements, name.trim()] } };
      }),
      addComptePlanComptable: (name) => set(s => {
        if (!name.trim() || s.referentiels.planComptable.includes(name.trim())) return s;
        return { referentiels: { ...s.referentiels, planComptable: [...s.referentiels.planComptable, name.trim()] } };
      }),

      restoreAll: (data) => set(() => ({ ...data })),
      resetToSeed: () => set(() => seedState()),
      };
    },
    {
      name: 'bbg-compta-v1',
      version: 12,
      // v2 : ajout de la liste des jeux et rattachement des dépenses de
      // développement au jeu concerné (déduit des mots clés / de la catégorie).
      migrate: (persisted, version) => {
        const s = persisted as AppState;
        if (version < 2 && s?.referentiels) {
          const jeux = s.referentiels.jeux ?? JEUX_PAR_DEFAUT;
          s.referentiels = { ...s.referentiels, jeux };
          s.entries = (s.entries ?? []).map(e => e.jeu ? e : { ...e, jeu: deduireJeu(e, jeux) });
        }
        if (version < 3 && s?.budgets && !s.previsionnels) {
          // v3 : le prévisionnel est réécrit sur les catégories de la synthèse.
          s.previsionnels = migrerBudgets(s.budgets, s.referentiels);
        }
        // v4 : largeurs de colonnes redimensionnables.
        if (version < 4) s.colWidths = s.colWidths ?? {};
        // v5 : blocs recolorables et bloc Personnel dans la synthèse.
        if (version < 5) {
          s.blocCouleurs = s.blocCouleurs ?? {};
          if (s.referentiels) s.referentiels = avecGroupePersonnel(s.referentiels);
        }
        // v6 : les dotations et les produits financiers sont recalculés, plus
        // budgétés en charges — sinon ils comptaient double dans l'EBE.
        if (version < 6 && s.previsionnels) {
          s.previsionnels = Object.fromEntries(
            Object.entries(s.previsionnels).map(([ex, lignes]) =>
              [ex, (lignes ?? []).filter(l => !estLigneCalculee(l.categorie))]));
        }
        // v7 : on repart d'un prévisionnel vierge pour les exercices à venir.
        if (version < 7 && s.previsionnels) {
          s.previsionnels = { [PREMIER_EXERCICE]: s.previsionnels[PREMIER_EXERCICE] ?? [] };
        }
        // v8 : les exercices à venir retrouvent la grille complète de la
        // synthèse, cellules vides ; et les workshops se calculent.
        if (version < 8 && s.previsionnels && s.referentiels) {
          const immos = categoriesImmobilisees(s.entries ?? []);
          for (const ex of EXERCICES) {
            if (ex === PREMIER_EXERCICE) continue;
            if (!(s.previsionnels[ex] ?? []).length) {
              s.previsionnels[ex] = gabaritPrevisionnel(s.referentiels, ex, immos, uid);
            }
          }
          s.previsionnels[PREMIER_EXERCICE] =
            brancherCalculHeures(s.previsionnels[PREMIER_EXERCICE] ?? []);
        }
        // v9 : deux redressements comptables.
        //  - remboursements et notes de frais : ils rendaient une dépense, pas
        //    du chiffre d'affaires. Ils passent en charges négatives.
        //  - postes de jeu : le développement graphique et les illustrations
        //    s'inscrivent à l'actif ; les catégories perdent le nom du jeu, qui
        //    vit désormais dans la colonne « Jeu ».
        if (version < 9 && s.entries && s.referentiels) {
          const a = remboursementsEnReductionDeCharges(s.entries, s.referentiels);
          const b = rangerPostesDeJeu(a.entries, a.referentiels);
          s.entries = b.entries;
          s.referentiels = b.referentiels;
          // Le prévisionnel suit les catégories renommées.
          if (s.previsionnels) {
            const jeux = s.referentiels.jeux ?? JEUX_PAR_DEFAUT;
            s.previsionnels = Object.fromEntries(
              Object.entries(s.previsionnels).map(([ex, lignes]) => [ex, (lignes ?? []).map(l => {
                const nom = nomGenerique(l.categorie, jeux);
                if (nom === l.categorie) return l;
                const suffixe = l.categorie.slice(nom.length).trim();
                return { ...l, categorie: nom, jeu: l.jeu ?? (suffixe || undefined) };
              })]));
          }
        }
        // v10 : le bloc « Jeux » du prévisionnel disparaît, comme dans la
        // synthèse. Chaque ligne rejoint le bloc auquel elle appartient — les
        // immobilisations pour le développement graphique et les illustrations,
        // les charges pour le reste — en gardant son jeu.
        if (version < 10 && s.previsionnels) {
          s.previsionnels = Object.fromEntries(
            Object.entries(s.previsionnels).map(([ex, lignes]) => [ex, (lignes ?? []).map(l =>
              l.section === 'jeux'
                ? { ...l, section: estPosteJeuImmobilise(l.categorie) ? 'immos' as const : 'charges' as const }
                : l)]));
        }
        // v11 : la nature « immobilisée » remonte de l'écriture à la CATÉGORIE.
        // C'est elle qui décide, et elle se règle dans l'onglet Catégories. Les
        // postes de jeu qui ne sont pas marqués immobilisés redeviennent des
        // charges, même si une migration précédente les avait mis à l'actif.
        if (version < 11 && s.referentiels) {
          const meta = { ...(s.referentiels.categoriesMeta ?? {}) };
          for (const c of s.referentiels.categoriesJeux ?? []) {
            meta[c] = { ...(meta[c] ?? {}), immobilisee: estPosteJeuImmobilise(c) };
            if (estPosteJeuImmobilise(c)) meta[c].dureeAns = meta[c].dureeAns ?? 5;
          }
          s.referentiels = { ...s.referentiels, categoriesMeta: meta };
          const jeux = new Set(s.referentiels.categoriesJeux ?? []);
          s.entries = (s.entries ?? []).map(e =>
            jeux.has(e.categorie) && !meta[e.categorie]?.immobilisee && e.type === 'immo'
              ? { ...e, type: 'charges' as const }
              : e);
        }
        // v11bis : la ligne « Imprévus » se calcule en % du bloc qui la précède.
        if (version < 11 && s.previsionnels) {
          s.previsionnels = Object.fromEntries(
            Object.entries(s.previsionnels).map(([ex, lignes]) => [ex, (lignes ?? []).map(l =>
              !l.formule && /impr[ée]vu/i.test(l.categorie)
                ? { ...l, formule: { type: 'pourcentage-bloc' as const, taux: tauxImprevu(l) } }
                : l)]));
        }
        // v12 : le remboursement du compte courant d'associé rejoint les
        // mouvements financiers — c'est une dette qu'on éteint, pas une charge.
        if (version < 12) {
          const fin = s.finances ?? [];
          if (!fin.some(f => f.type === 'remboursement_cca')) {
            s.finances = [...fin, {
              id: uid(),
              date: '2026-10-01',
              label: "Remboursement compte courant d'associé (2 % de 100 000 €)",
              type: 'remboursement_cca' as const,
              montant: -2000,
            }];
          }
        }
        return s;
      },
      // Seules les données sont persistées : l'historique repart à zéro
      // à chaque ouverture, et les actions ne sont jamais sérialisées.
      partialize: (s) => ({
        entries: s.entries, finances: s.finances, referentiels: s.referentiels,
        budgets: s.budgets, previsionnels: s.previsionnels,
        chronologie: s.chronologie, tresoPrev: s.tresoPrev, tresoManuel: s.tresoManuel,
        journalFormats: s.journalFormats, colWidths: s.colWidths,
        blocCouleurs: s.blocCouleurs,
      }) as unknown as AppState,
    },
  ),
);
