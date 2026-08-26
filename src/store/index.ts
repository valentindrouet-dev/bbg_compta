import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  JournalEntry, FinanceEntry, BudgetExercice, ChronoEvent, TresoPrevLine, Referentiels,
} from '../types';
import seedJournal from '../data/journal.json';
import seedReferentiels from '../data/referentiels.json';
import seedBudgets from '../data/budgets.json';
import seedTresorerie from '../data/tresorerie.json';
import seedChronologie from '../data/chronologie.json';

function uid(): string {
  return crypto.randomUUID();
}

export interface AppState {
  entries: JournalEntry[];
  finances: FinanceEntry[];
  referentiels: Referentiels;
  budgets: Record<string, BudgetExercice>;
  chronologie: ChronoEvent[];
  tresoPrev: TresoPrevLine[];

  addEntry: (e: Omit<JournalEntry, 'id'>) => string;
  updateEntry: (id: string, patch: Partial<JournalEntry>) => void;
  removeEntry: (id: string) => void;
  duplicateEntry: (id: string) => void;

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

  addCategorie: (kind: 'categoriesDepenses' | 'categoriesJeux' | 'categoriesProduits', name: string) => void;
  removeCategorie: (kind: 'categoriesDepenses' | 'categoriesJeux' | 'categoriesProduits', name: string) => void;
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
  };
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      ...seedState(),

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
    }),
    {
      name: 'bbg-compta-v1',
      version: 1,
    },
  ),
);
