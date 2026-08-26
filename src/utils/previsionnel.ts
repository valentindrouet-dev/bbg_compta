import type { BudgetExercice, JournalEntry, PrevLigne, PrevSection, Referentiels } from '../types';
import { moisExercice, PREMIER_EXERCICE } from './dates';
import { r2 } from './money';

/** Normalise un libellé pour le rapprochement (minuscules, sans accents). */
export function normalise(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Rapprochements que le seul nom ne permet pas de deviner. */
const ALIAS: Record<string, string> = {
  'cotisations tns': 'Retraite TNS',
  'charges financieres (qonto smart)': 'Charges Financières',
  'comptes annuels - exponens': 'Tenue Comptable',
  'assistance juridique - exponens': 'Tenue Comptable',
  'logiciel comptable - exponens': 'Tenue Comptable',
  'tenue comptable - exponens': 'Tenue Comptable',
  "chiffre d'affaires formation artfx": 'workshops',
  'frais lancement* (voir tableau)': 'Autres',
  'cfe': 'Autres',
  'salaires bruts': 'Autres',
  'charges patronales': 'Autres',
};

/** Cherche la catégorie du référentiel qui correspond à un libellé de budget. */
export function categoriePour(label: string, refs: Referentiels): string | null {
  const n = normalise(label);
  if (ALIAS[n]) return ALIAS[n];
  const toutes = [...refs.categoriesDepenses, ...refs.categoriesJeux, ...refs.categoriesProduits];
  const exact = toutes.find(c => normalise(c) === n);
  if (exact) return exact;
  // « Budget Jeux (Veille Techno) » -> « Budget Jeux »
  const prefixe = toutes.find(c => n.startsWith(normalise(c)));
  if (prefixe) return prefixe;
  const inclus = toutes.find(c => n.includes(normalise(c)));
  return inclus ?? null;
}

/** Section d'affichage d'une catégorie, alignée sur les blocs de la synthèse. */
export function sectionDeCategorie(categorie: string, refs: Referentiels): PrevSection {
  if (refs.categoriesProduits.includes(categorie)) return 'produits';
  if (refs.categoriesJeux.includes(categorie)) return 'jeux';
  return 'charges';
}

export const SECTIONS: { cle: PrevSection; titre: string; couleur: string }[] = [
  { cle: 'produits', titre: 'Produits', couleur: 'var(--bbg-green-light)' },
  { cle: 'charges', titre: 'Charges', couleur: 'var(--bbg-orange-light)' },
  { cle: 'jeux', titre: 'Dépenses Jeux', couleur: 'var(--bbg-yellow-light)' },
  { cle: 'immos', titre: 'Immobilisations', couleur: 'var(--bbg-purple-light)' },
  { cle: 'indicateurs', titre: 'Indicateurs (non monétaires)', couleur: '#eef1f7' },
];

/**
 * Convertit les budgets importés du tableur vers le nouveau modèle, aligné
 * sur les catégories de la synthèse.
 *
 * Les colonnes du tableur 2025-26 démarrent en septembre alors que l'exercice
 * commence par la pré-immatriculation : les valeurs sont décalées d'un cran.
 */
export function migrerBudgets(
  budgets: Record<string, BudgetExercice>, refs: Referentiels,
): Record<string, PrevLigne[]> {
  const out: Record<string, PrevLigne[]> = {};
  let seq = 0;
  for (const [ex, b] of Object.entries(budgets ?? {})) {
    const nMois = moisExercice(ex).length;
    const decalage = ex === PREMIER_EXERCICE ? 1 : 0;
    const lignes: PrevLigne[] = [];
    for (const l of b.lignes) {
      const valeurs = new Array<number | null>(nMois).fill(null);
      l.valeurs.forEach((v, i) => {
        const idx = i + decalage;
        if (idx < nMois) valeurs[idx] = v;
      });
      if (valeurs.every(v => v == null || v === 0)) continue;  // ligne vide : inutile de la reprendre

      const estMontant = l.kind === 'montant';
      const cat = estMontant ? categoriePour(l.label, refs) : null;
      // Une ligne de coûts de développement garde son groupe dans le libellé.
      const libelle = cat ?? (l.groupe && l.section === 'couts_dev' ? `${l.groupe} — ${l.label}` : l.label);
      lignes.push({
        id: `prev-${ex}-${++seq}`,
        categorie: libelle,
        section: !estMontant ? 'indicateurs' : cat ? sectionDeCategorie(cat, refs) : (l.section === 'couts_dev' ? 'jeux' : 'charges'),
        unite: estMontant ? undefined : (l.kind as PrevLigne['unite']),
        valeurs,
      });
    }
    out[ex] = lignes;
  }
  return out;
}

// ----- Rapprochement avec le réel ----------------------------------------

export interface LignePrevReel {
  ligne: PrevLigne;
  prevu: number;
  reel: number;
  ecart: number;
  /** La catégorie existe-t-elle dans le référentiel ? */
  rattachee: boolean;
}

export interface AlarmePrev {
  niveau: 'erreur' | 'attention' | 'info';
  categorie: string;
  message: string;
  /** Correction proposée en un clic. */
  action?: 'creer' | 'creerCategorie';
  /** Bloc de rattachement, pour créer la ligne au bon endroit. */
  section?: PrevSection;
}

/**
 * Bloc de la synthèse auquel une écriture appartient : c'est le même
 * découpage des deux côtés, sinon la comparaison n'aurait pas de sens.
 */
export function sectionDeEcriture(e: JournalEntry, refs: Referentiels): PrevSection {
  if (e.type === 'produit') return 'produits';
  if (refs.categoriesJeux.includes(e.categorie)) return 'jeux';
  if (e.type === 'immo') return 'immos';
  return 'charges';
}

/** Somme du réel par catégorie sur l'exercice (base HT), éventuellement par bloc. */
export function reelParCategorie(
  entries: JournalEntry[], exercice: string, refs?: Referentiels, section?: PrevSection,
): Map<string, number> {
  const moisSet = new Set(moisExercice(exercice));
  const m = new Map<string, number>();
  for (const e of entries) {
    if (!moisSet.has(e.mois)) continue;
    if (section && refs && sectionDeEcriture(e, refs) !== section) continue;
    m.set(e.categorie, r2((m.get(e.categorie) ?? 0) + e.ht));
  }
  return m;
}

/** Réel d'une catégorie, mois par mois, éventuellement par bloc. */
export function reelParCategorieEtMois(
  entries: JournalEntry[], exercice: string, refs?: Referentiels, section?: PrevSection,
): Map<string, Map<string, number>> {
  const moisSet = new Set(moisExercice(exercice));
  const m = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (!moisSet.has(e.mois)) continue;
    if (section && refs && sectionDeEcriture(e, refs) !== section) continue;
    if (!m.has(e.categorie)) m.set(e.categorie, new Map());
    const row = m.get(e.categorie)!;
    row.set(e.mois, r2((row.get(e.mois) ?? 0) + e.ht));
  }
  return m;
}

/**
 * Alarmes de cohérence entre le prévisionnel et la synthèse annuelle :
 * lignes orphelines, doublons, et dépenses réelles jamais budgétées.
 */
export function alarmesPrevisionnel(
  lignes: PrevLigne[], reel: Map<string, number>, refs: Referentiels,
): AlarmePrev[] {
  const alarmes: AlarmePrev[] = [];
  const toutes = new Set([...refs.categoriesDepenses, ...refs.categoriesJeux, ...refs.categoriesProduits]);

  for (const l of lignes) {
    if (l.section === 'indicateurs') continue;
    if (!toutes.has(l.categorie)) {
      alarmes.push({
        niveau: 'erreur', categorie: l.categorie, action: 'creerCategorie', section: l.section,
        message: `« ${l.categorie} » ne correspond à aucune catégorie de la synthèse : rattache-la, ou crée la catégorie.`,
      });
    }
  }

  const vues = new Map<string, number>();
  for (const l of lignes) {
    if (l.section === 'indicateurs') continue;
    vues.set(l.categorie, (vues.get(l.categorie) ?? 0) + 1);
  }
  for (const [cat, n] of vues) {
    if (n > 1) {
      alarmes.push({
        niveau: 'attention', categorie: cat,
        message: `« ${cat} » apparaît sur ${n} lignes du prévisionnel : les montants s'additionnent.`,
      });
    }
  }

  for (const [cat, montant] of reel) {
    if (!montant) continue;
    if (!vues.has(cat)) {
      alarmes.push({
        niveau: 'attention', categorie: cat, action: 'creer',
        message: `« ${cat} » : ${montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € dépensés sans aucune ligne au prévisionnel.`,
      });
    }
  }

  return alarmes;
}
