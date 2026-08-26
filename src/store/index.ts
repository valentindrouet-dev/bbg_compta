import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  JournalEntry, FinanceEntry, BudgetExercice, ChronoEvent, TresoPrevLine, Referentiels, CategorieMeta,
} from '../types';
import seedJournal from '../data/journal.json';
import seedReferentiels from '../data/referentiels.json';
import seedBudgets from '../data/budgets.json';
import seedTresorerie from '../data/tresorerie.json';
import seedChronologie from '../data/chronologie.json';

function uid(): string {
  return crypto.randomUUID();
}

/** Mise en forme d'une colonne du journal (gras, italique, couleur, alignement). */
export interface ColFormat {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export type CatKind = 'categoriesDepenses' | 'categoriesJeux' | 'categoriesProduits';

/** Clés dont la modification est enregistrée dans l'historique d'annulation. */
const DATA_KEYS = ['entries', 'finances', 'referentiels', 'budgets', 'chronologie', 'tresoPrev', 'journalFormats'] as const;
type DataKey = typeof DATA_KEYS[number];
type Snapshot = Pick<AppState, DataKey>;

export interface AppState {
  entries: JournalEntry[];
  finances: FinanceEntry[];
  referentiels: Referentiels;
  budgets: Record<string, BudgetExercice>;
  chronologie: ChronoEvent[];
  tresoPrev: TresoPrevLine[];
  /** Mise en forme par colonne du journal, indexée par clé de colonne. */
  journalFormats: Record<string, ColFormat>;

  // Historique (non persisté) : profondeur disponible pour annuler / rétablir.
  undoDepth: number;
  redoDepth: number;
  undo: () => void;
  redo: () => void;
  setColFormat: (col: string, patch: ColFormat) => void;
  resetColFormat: (col: string) => void;

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
  addPaiement: (name: string) => void;
  addComptePlanComptable: (name: string) => void;

  restoreAll: (data: Partial<Pick<AppState, 'entries' | 'finances' | 'referentiels' | 'budgets' | 'chronologie' | 'tresoPrev'>>) => void;
  resetToSeed: () => void;
}

function seedState() {
  return {
    entries: structuredClone(seedJournal) as JournalEntry[],
    finances: structuredClone(seedTresorerie.mouvementsFinanciers) as FinanceEntry[],
    referentiels: structuredClone(seedReferentiels) as Referentiels,
    budgets: structuredClone(seedBudgets) as unknown as Record<string, BudgetExercice>,
    chronologie: structuredClone(seedChronologie) as ChronoEvent[],
    tresoPrev: structuredClone(seedTresorerie.previsionnel) as TresoPrevLine[],
    journalFormats: {} as Record<string, ColFormat>,
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
    budgets: s.budgets, chronologie: s.chronologie, tresoPrev: s.tresoPrev,
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
      version: 1,
      // Seules les données sont persistées : l'historique repart à zéro
      // à chaque ouverture, et les actions ne sont jamais sérialisées.
      partialize: (s) => ({
        entries: s.entries, finances: s.finances, referentiels: s.referentiels,
        budgets: s.budgets, chronologie: s.chronologie, tresoPrev: s.tresoPrev,
        journalFormats: s.journalFormats,
      }) as unknown as AppState,
    },
  ),
);
