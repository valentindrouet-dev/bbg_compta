import type {
  BudgetExercice, JournalEntry, PrevLigne, PrevSection, Referentiels,
} from '../types';
import { BLOCS, blocDeCategorie, blocDeEcriture, estPosteJeuImmobilise } from './blocs';
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
};

/**
 * Lignes du tableur qui sont des *résultats de calcul*, pas des hypothèses :
 * l'app les recalcule elle-même (dotations depuis les immobilisations,
 * produits financiers depuis les mouvements de trésorerie). Les reprendre en
 * charges les compterait deux fois et fausserait l'EBE.
 */
const LIGNES_CALCULEES = [
  'dotations aux amortissements',
  'produit financier (interets)',
  'produits financiers',
];

export function estLigneCalculee(label: string): boolean {
  const n = normalise(label);
  return LIGNES_CALCULEES.some(l => n === l || n.startsWith(l));
}

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
  return blocDeCategorie(categorie, refs) as PrevSection;
}

/**
 * Les sections du prévisionnel sont exactement les blocs de la synthèse, dans
 * le même ordre — plus les indicateurs non monétaires du tableur d'origine.
 */
/**
 * Les blocs du prévisionnel, dans l'ordre de la synthèse. Il n'y a plus de bloc
 * « Jeux » : ses postes sont rangés là où ils appartiennent — en charges pour
 * le prototypage, la communication et les avances, aux immobilisations pour le
 * développement graphique et les illustrations. Le découpage par jeu subsiste,
 * en bandeaux à l'intérieur de ces blocs.
 */
export const SECTIONS: { cle: PrevSection; titre: string }[] = [
  ...BLOCS.filter(b => b.cle !== 'resultat' && b.cle !== 'tva' && b.cle !== 'jeux')
    .map(b => ({ cle: b.cle as PrevSection, titre: b.titre })),
  { cle: 'indicateurs', titre: 'Indicateurs (non monétaires)' },
];

/** Les sections qui constituent une dépense (par opposition aux produits). */
export const SECTIONS_DEPENSES: PrevSection[] = ['charges', 'personnel', 'immos'];

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
      if (estLigneCalculee(l.label)) continue;  // recalculée par l'app, pas budgétée

      const estMontant = l.kind === 'montant';
      const cat = estMontant ? categoriePour(l.label, refs) : null;
      // Une ligne de coûts de développement garde son groupe dans le libellé.
      const libelle = cat ?? (l.groupe && l.section === 'couts_dev' ? `${l.groupe} — ${l.label}` : l.label);
      // Les lignes de coûts de développement portent le nom du jeu dans leur
      // libellé : on le récupère pour les ranger sous le bon jeu.
      const jeu = (refs.jeux ?? []).find(j =>
        normalise(`${l.groupe} ${l.label}`).includes(normalise(j)));
      lignes.push({
        id: `prev-${ex}-${++seq}`,
        categorie: libelle,
        ...(jeu ? { jeu } : {}),
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
  return blocDeEcriture(e, refs) as PrevSection;
}

/** Somme du réel par catégorie sur l'exercice (base HT), éventuellement par bloc. */
export function reelParCategorie(
  entries: JournalEntry[], exercice: string, refs?: Referentiels, section?: PrevSection,
  base: 'ht' | 'ttc' = 'ht',
): Map<string, number> {
  const moisSet = new Set(moisExercice(exercice));
  const m = new Map<string, number>();
  for (const e of entries) {
    if (!moisSet.has(e.mois)) continue;
    if (section && refs && sectionDeEcriture(e, refs) !== section) continue;
    m.set(e.categorie, r2((m.get(e.categorie) ?? 0) + (base === 'ttc' ? e.ttc : e.ht)));
  }
  return m;
}

/** Réel par jeu puis par catégorie sur l'exercice (base HT). */
export function reelParJeuEtCategorie(
  entries: JournalEntry[], exercice: string, refs: Referentiels,
): Map<string, Map<string, number>> {
  const moisSet = new Set(moisExercice(exercice));
  const m = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (!moisSet.has(e.mois)) continue;
    // Le réel des dépenses jeux, hors immobilisations : ce qui est porté à
    // l'actif ne se compare pas à un budget de charges.
    if (!refs.categoriesJeux.includes(e.categorie)) continue;
    if (e.type === 'produit' || e.type === 'immo') continue;
    const jeu = e.jeu || '— non rattaché —';
    if (!m.has(jeu)) m.set(jeu, new Map());
    const row = m.get(jeu)!;
    row.set(e.categorie, r2((row.get(e.categorie) ?? 0) + e.ht));
  }
  return m;
}

/** Réel d'une catégorie, mois par mois, éventuellement par bloc. */
export function reelParCategorieEtMois(
  entries: JournalEntry[], exercice: string, refs?: Referentiels, section?: PrevSection,
  base: 'ht' | 'ttc' = 'ht',
): Map<string, Map<string, number>> {
  const moisSet = new Set(moisExercice(exercice));
  const m = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (!moisSet.has(e.mois)) continue;
    if (section && refs && sectionDeEcriture(e, refs) !== section) continue;
    if (!m.has(e.categorie)) m.set(e.categorie, new Map());
    const row = m.get(e.categorie)!;
    row.set(e.mois, r2((row.get(e.mois) ?? 0) + (base === 'ttc' ? e.ttc : e.ht)));
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
    if (l.section === 'indicateurs' || l.unite) continue;   // les lignes de quantités ne sont pas des catégories
    if (!toutes.has(l.categorie)) {
      alarmes.push({
        niveau: 'erreur', categorie: l.categorie, action: 'creerCategorie', section: l.section,
        message: `« ${l.categorie} » ne correspond à aucune catégorie de la synthèse : rattache-la, ou crée la catégorie.`,
      });
    }
  }

  // Une même catégorie sur deux jeux différents n'est pas un doublon : c'est la
  // grille « un jeu par ligne » de la synthèse. On compte donc par jeu + catégorie.
  const vues = new Map<string, number>();
  const doublons = new Map<string, { n: number; label: string }>();
  for (const l of lignes) {
    if (l.section === 'indicateurs' || l.unite) continue;
    vues.set(l.categorie, (vues.get(l.categorie) ?? 0) + 1);
    const cle = `${l.jeu ?? ''}\u0000${l.categorie}`;
    const label = l.jeu ? `${l.jeu} — ${l.categorie}` : l.categorie;
    doublons.set(cle, { n: (doublons.get(cle)?.n ?? 0) + 1, label });
  }
  for (const { n, label } of doublons.values()) {
    if (n > 1) {
      alarmes.push({
        niveau: 'attention', categorie: label,
        message: `« ${label} » apparaît sur ${n} lignes du prévisionnel : les montants s'additionnent.`,
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

// ----- Lignes calculées ---------------------------------------------------

/**
 * Les montants d'une ligne : ceux saisis, ou ceux que produit sa formule.
 *
 * Une ligne calculée multiplie les quantités d'une autre ligne par un taux, en
 * décalant du nombre de mois voulu — un workshop donné en octobre et payé en
 * novembre apparaît bien en novembre.
 */
export function valeursDe(l: PrevLigne, lignes: PrevLigne[]): (number | null)[] {
  const f = l.formule;
  if (!f) return l.valeurs;
  const source = lignes.find(x => x.id === f.sourceId);
  if (!source) return l.valeurs.map(() => null);
  return l.valeurs.map((_, i) => {
    const q = source.valeurs[i - f.decalage];
    return q == null ? null : r2(q * f.tauxHT);
  });
}

/** Total annuel d'une ligne, formule comprise. */
export function totalDeLigne(l: PrevLigne, lignes: PrevLigne[]): number {
  return r2(valeursDe(l, lignes).reduce<number>((s, v) => s + (v ?? 0), 0));
}

/** Valeur d'un mois, formule comprise. */
export function valeurDuMois(l: PrevLigne, lignes: PrevLigne[], i: number): number {
  return valeursDe(l, lignes)[i] ?? 0;
}

// ----- Gabarit d'un exercice vierge ---------------------------------------

/** Catégories qui servent d'immobilisations dans le journal. */
export function categoriesImmobilisees(entries: JournalEntry[]): string[] {
  return [...new Set(entries.filter(e => e.type === 'immo').map(e => e.categorie))];
}

/**
 * Le prévisionnel d'un exercice encore vierge : toutes les lignes de la
 * synthèse annuelle, dans le même ordre et les mêmes blocs, avec des cellules
 * vides. Il n'y a plus qu'à remplir.
 */
export function gabaritPrevisionnel(
  refs: Referentiels, exercice: string, categoriesImmos: string[], id: () => string,
): PrevLigne[] {
  const nMois = moisExercice(exercice).length;
  const vide = () => new Array<number | null>(nMois).fill(null);
  const immos = new Set(categoriesImmos);
  const personnel = new Set(
    refs.categoriesDepenses.filter(c => refs.categoriesMeta?.[c]?.groupe === 'Personnel'));

  const lignes: PrevLigne[] = [];
  const ajouter = (categorie: string, section: PrevSection, extra: Partial<PrevLigne> = {}) => {
    lignes.push({ id: id(), categorie, section, valeurs: vide(), ...extra });
  };

  for (const c of refs.categoriesProduits) ajouter(c, 'produits');
  for (const c of refs.categoriesDepenses) {
    if (personnel.has(c) || immos.has(c)) continue;
    ajouter(c, 'charges');
  }
  // Les postes de jeu qui restent en charges : une ligne par jeu et par poste,
  // à la suite des charges, exactement comme dans la synthèse.
  for (const jeu of refs.jeux ?? []) {
    for (const c of refs.categoriesJeux) {
      if (!estPosteJeuImmobilise(c)) ajouter(c, 'charges', { jeu });
    }
  }
  for (const c of refs.categoriesDepenses) if (personnel.has(c)) ajouter(c, 'personnel');
  for (const c of refs.categoriesDepenses) if (immos.has(c)) ajouter(c, 'immos');
  // Le développement porté à l'actif, jeu par jeu.
  for (const jeu of refs.jeux ?? []) {
    for (const c of refs.categoriesJeux) {
      if (estPosteJeuImmobilise(c)) ajouter(c, 'immos', { jeu });
    }
  }
  return lignes;
}

/** Les catégories qui manquent au prévisionnel d'un exercice déjà commencé. */
export function categoriesManquantes(
  lignes: PrevLigne[], refs: Referentiels, categoriesImmos: string[],
): { categorie: string; section: PrevSection; jeu?: string }[] {
  const modele = gabaritPrevisionnel(refs, PREMIER_EXERCICE, categoriesImmos, () => '');
  const vues = new Set(lignes.map(l => `${l.section}|${l.categorie}|${l.jeu ?? ''}`));
  return modele
    .filter(m => !vues.has(`${m.section}|${m.categorie}|${m.jeu ?? ''}`))
    .map(m => ({ categorie: m.categorie, section: m.section, jeu: m.jeu }));
}

/**
 * L'ordre d'affichage du prévisionnel : le même que celui de la synthèse.
 *
 * Réordonner une catégorie ou un jeu dans la synthèse déplace donc aussi sa
 * ligne ici — les deux tableaux restent en vis-à-vis, comme dans le tableur.
 * Les lignes de quantités (les heures) restent collées juste au-dessus de la
 * ligne qui les consomme, sinon le calcul ne se lit plus.
 */
export function ordreAffichage(lignes: PrevLigne[], refs: Referentiels): PrevLigne[] {
  const rang = (liste: string[], valeur: string | undefined) => {
    const i = valeur == null ? -1 : liste.indexOf(valeur);
    return i < 0 ? liste.length : i;
  };
  const refDe = (l: PrevLigne) =>
    l.section === 'produits' ? refs.categoriesProduits
      : l.jeu ? refs.categoriesJeux
        : refs.categoriesDepenses;
  const jeux = refs.jeux ?? [];

  // Dans un bloc : d'abord les postes généraux, puis les jeux, dans l'ordre du
  // catalogue ; à l'intérieur, l'ordre du référentiel.
  const clef = (l: PrevLigne, i: number): [number, number, number] =>
    [l.jeu ? 1 + rang(jeux, l.jeu) : 0, rang(refDe(l), l.categorie), i];

  const trie = lignes
    .map((l, i) => ({ l, k: clef(l, i) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2])
    .map(x => x.l);

  // Chaque ligne de quantités remonte juste avant celle qui s'en sert.
  const out = [...trie];
  for (const l of trie) {
    if (!l.formule) continue;
    const src = out.findIndex(x => x.id === l.formule!.sourceId);
    if (src < 0) continue;
    const [source] = out.splice(src, 1);
    out.splice(out.findIndex(x => x.id === l.id), 0, source);
  }
  return out;
}

/**
 * Le taux de TVA dominant de chaque catégorie, lu dans le journal.
 *
 * Sert de valeur par défaut à l'affichage TTC du prévisionnel : inutile de
 * ressaisir 20 % partout quand les écritures réelles le disent déjà. On retient
 * le taux qui porte le plus de HT sur la catégorie, arrondi au taux légal le
 * plus proche ; 20 % quand la catégorie n'a encore aucune écriture.
 */
export function tauxObserves(entries: JournalEntry[]): Map<string, number> {
  const LEGAUX = [0, 2.1, 5.5, 10, 20];
  const poids = new Map<string, Map<number, number>>();
  for (const e of entries) {
    if (!e.ht) continue;
    const brut = (e.tva / e.ht) * 100;
    const taux = LEGAUX.reduce((a, b) => Math.abs(b - brut) < Math.abs(a - brut) ? b : a, 0);
    if (!poids.has(e.categorie)) poids.set(e.categorie, new Map());
    const row = poids.get(e.categorie)!;
    row.set(taux, (row.get(taux) ?? 0) + Math.abs(e.ht));
  }
  const out = new Map<string, number>();
  for (const [cat, row] of poids) {
    let meilleur = 20, max = -1;
    for (const [taux, p] of row) if (p > max) { max = p; meilleur = taux; }
    out.set(cat, meilleur);
  }
  return out;
}

/** Le taux à appliquer à une ligne de prévisionnel : le sien, ou l'observé. */
export function tauxDeLigne(l: PrevLigne, observes: Map<string, number>): number {
  return l.tauxTVA ?? l.formule?.tauxTVA ?? observes.get(l.categorie) ?? 20;
}
