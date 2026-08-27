import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  JournalEntry, FinanceEntry, BudgetExercice, ChronoEvent, TresoPrevLine, Referentiels, CategorieMeta,
  JeuMeta, PrevLigne, PrevSection,
} from '../types';
import { migrerBudgets, sectionDeCategorie } from '../utils/previsionnel';
import { moisExercice } from '../utils/dates';
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
  const mot = (e.motsCles ?? '').trim().toUpperCase();
  const trouve = jeux.find(j => j.toUpperCase() === mot);
  if (trouve) return trouve;
  const cat = e.categorie.toUpperCase();
  return jeux.find(j => cat.endsWith(j.toUpperCase())) ?? '';
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
const DATA_KEYS = ['entries', 'finances', 'referentiels', 'budgets', 'previsionnels', 'chronologie', 'tresoPrev', 'journalFormats'] as const;
type DataKey = typeof DATA_KEYS[number];
type Snapshot = Pick<AppState, DataKey>;

export interface AppState {
  entries: JournalEntry[];
  finances: FinanceEntry[];
  referentiels: Referentiels;
  budgets: Record<string, BudgetExercice>;
  /** Prévisionnel par exercice, aligné sur les catégories de la synthèse. */
  previsionnels: Record<string, PrevLigne[]>;
  chronologie: ChronoEvent[];
  tresoPrev: TresoPrevLine[];
  /** Mise en forme par colonne des tableaux, indexée par « table:colonne ». */
  journalFormats: Record<string, ColFormat>;
  /** Largeurs de colonnes redimensionnées à la souris, par tableau. */
  colWidths: ColWidths;

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
  addPrevLigne: (exercice: string, categorie: string, section?: PrevSection) => void;
  updatePrevLigne: (exercice: string, ligneId: string, patch: Partial<PrevLigne>) => void;
  removePrevLigne: (exercice: string, ligneId: string) => void;
  /** Recopie une valeur sur tous les mois restants de l'exercice. */
  etalerPrevLigne: (exercice: string, ligneId: string, montant: number) => void;

  addChrono: (c: Omit<ChronoEvent, 'id'>) => void;
  updateChrono: (id: string, patch: Partial<ChronoEvent>) => void;
  removeChrono: (id: string) => void;

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
  setGroupes: (groupes: string[]) => void;
  addJeu: (name: string) => void;
  renameJeu: (ancien: string, nouveau: string) => void;
  removeJeu: (name: string) => void;
  /** Fiche d'un jeu : lien vers le Production Calculator, notes. */
  setJeuMeta: (jeu: string, patch: JeuMeta) => void;
  addPaiement: (name: string) => void;
  addComptePlanComptable: (name: string) => void;

  restoreAll: (data: Partial<Pick<AppState, 'entries' | 'finances' | 'referentiels' | 'budgets' | 'previsionnels' | 'chronologie' | 'tresoPrev' | 'journalFormats' | 'colWidths'>>) => void;
  resetToSeed: () => void;
}

function seedState() {
  const refs = structuredClone(seedReferentiels) as Referentiels;
  refs.jeux = refs.jeux ?? JEUX_PAR_DEFAUT;
  const entries = (structuredClone(seedJournal) as JournalEntry[]).map(e =>
    e.jeu ? e : { ...e, jeu: deduireJeu(e, refs.jeux!) });
  return {
    entries,
    finances: structuredClone(seedTresorerie.mouvementsFinanciers) as FinanceEntry[],
    referentiels: refs,
    budgets: structuredClone(seedBudgets) as unknown as Record<string, BudgetExercice>,
    previsionnels: migrerBudgets(
      structuredClone(seedBudgets) as unknown as Record<string, BudgetExercice>, refs),
    chronologie: structuredClone(seedChronologie) as ChronoEvent[],
    tresoPrev: structuredClone(seedTresorerie.previsionnel) as TresoPrevLine[],
    journalFormats: {} as Record<string, ColFormat>,
    colWidths: {} as ColWidths,
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
    chronologie: s.chronologie, tresoPrev: s.tresoPrev,
    journalFormats: s.journalFormats,
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
      addPrevLigne: (exercice, categorie, section) => set(s => {
        const nMois = moisExercice(exercice).length;
        const ligne: PrevLigne = {
          id: uid(),
          categorie,
          section: section ?? sectionDeCategorie(categorie, s.referentiels),
          valeurs: new Array<number | null>(nMois).fill(null),
        };
        return {
          previsionnels: { ...s.previsionnels, [exercice]: [...(s.previsionnels[exercice] ?? []), ligne] },
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
      removeChrono: (id) => set(s => ({ chronologie: s.chronologie.filter(c => c.id !== id) })),

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
        for (const n of noms) meta[n] = { ...meta[n], ...patch };
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

      setGroupes: (groupes) => set(s => ({
        referentiels: { ...s.referentiels, groupes },
      })),

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
      setJeuMeta: (jeu, patch) => set(s => ({
        referentiels: {
          ...s.referentiels,
          jeuxMeta: { ...(s.referentiels.jeuxMeta ?? {}), [jeu]: { ...(s.referentiels.jeuxMeta ?? {})[jeu], ...patch } },
        },
      })),
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
      version: 4,
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
        return s;
      },
      // Seules les données sont persistées : l'historique repart à zéro
      // à chaque ouverture, et les actions ne sont jamais sérialisées.
      partialize: (s) => ({
        entries: s.entries, finances: s.finances, referentiels: s.referentiels,
        budgets: s.budgets, previsionnels: s.previsionnels,
        chronologie: s.chronologie, tresoPrev: s.tresoPrev,
        journalFormats: s.journalFormats, colWidths: s.colWidths,
      }) as unknown as AppState,
    },
  ),
);
