import type {
  BudgetExercice, JournalEntry, PrevLigne, PrevSection, Referentiels,
} from '../types';
import {
  BLOCS, blocDeCategorie, blocDeEcriture, estChargeFinanciere, estPosteJeuImmobilise,
} from './blocs';
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

/**
 * Un poste de coût de développement que le référentiel ne reconnaît pas : le
 * développement graphique et les illustrations s'inscrivent à l'actif, tout le
 * reste (prototypage, communication, avances) reste une charge. Il n'y a plus
 * de bloc « Jeux » où les ranger : une ligne mal classée y deviendrait
 * invisible dans le prévisionnel tout en pesant dans les calculs.
 */
export function sectionDunPosteDeJeu(libelle: string): PrevSection {
  const n = normalise(libelle);
  // « Contrat d'Ilustrations » : le tableur d'origine écrit un seul « l ».
  const immobilise = /il+ustration|developpement graphique|design graphique/.test(n);
  return immobilise ? 'immos' : 'charges';
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
        section: !estMontant ? 'indicateurs'
          : cat ? sectionDeCategorie(cat, refs)
          : sectionDunPosteDeJeu(`${l.groupe ?? ''} ${l.label}`),
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

  if (f.type === 'pourcentage-bloc') {
    // Assiette : les lignes du même bloc placées au-dessus de celle-ci. On
    // ignore les autres pourcentages, pour qu'un imprévu ne se calcule jamais
    // sur un autre imprévu, et les lignes de quantités, qui ne sont pas des euros.
    const rang = lignes.findIndex(x => x.id === l.id);
    const assiette = lignes.filter((x, i) =>
      i < rang && x.section === l.section && !x.unite
      && x.formule?.type !== 'pourcentage-bloc');
    return l.valeurs.map((_, i) => {
      const base = assiette.reduce((s, x) => s + (valeursDe(x, lignes)[i] ?? 0), 0);
      return base ? r2(base * f.taux / 100) : null;
    });
  }

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
      : jeuDeLigne(l, refs.jeux ?? []) ? refs.categoriesJeux
        : refs.categoriesDepenses;
  const jeux = refs.jeux ?? [];

  // Dans un bloc : d'abord les postes généraux, puis les jeux, dans l'ordre du
  // catalogue ; à l'intérieur, l'ordre du référentiel.
  const clef = (l: PrevLigne, i: number): [number, number, number] => {
    const jeu = jeuDeLigne(l, jeux);
    return [jeu ? 1 + rang(jeux, jeu) : 0, rang(refDe(l), l.categorie), i];
  };

  // Le bloc d'une ligne suit sa CATÉGORIE, pas ce qui a été enregistré le jour
  // où elle a été créée : basculer une catégorie en immobilisation dans l'onglet
  // Catégories la déplace ici aussi, comme dans la synthèse. Sans quoi le même
  // poste serait une charge d'un côté et un investissement de l'autre.
  const connues = new Set([
    ...refs.categoriesProduits, ...refs.categoriesDepenses, ...refs.categoriesJeux,
  ]);
  const recale = (l: PrevLigne): PrevLigne => {
    if (l.unite || !connues.has(l.categorie)) return l;
    const sec = sectionDeCategorie(l.categorie, refs);
    return sec === l.section ? l : { ...l, section: sec };
  };

  const trie = lignes
    .map((l, i) => ({ l, k: clef(l, i) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2])
    .map(x => recale(x.l));

  // Chaque ligne de quantités remonte juste avant celle qui s'en sert.
  const out = [...trie];
  for (const l of trie) {
    const f = l.formule;
    if (f?.type !== 'heures-taux') continue;
    const src = out.findIndex(x => x.id === f.sourceId);
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
  const tauxFormule = l.formule?.type === 'heures-taux' ? l.formule.tauxTVA : undefined;
  return l.tauxTVA ?? tauxFormule ?? observes.get(l.categorie) ?? 20;
}

/**
 * Le jeu d'une ligne de prévisionnel : celui qu'elle porte, sinon celui que son
 * libellé désigne (« Ventes EDIT » -> EDIT). La comparaison tolère une lettre
 * ou deux d'écart, sans quoi « Ventes TORNADICE » resterait orpheline pendant
 * que « Ventes EDIT » et « Ventes CAMINO » sont bien regroupées.
 */
export function jeuDeLigne(l: PrevLigne, jeux: string[]): string {
  if (l.jeu) return l.jeu;
  const dernier = l.categorie.trim().split(/[\s—-]+/).pop() ?? '';
  return jeux.find(j => memeJeu(j, dernier)) ?? '';
}

/** Deux noms désignent-ils le même jeu ? Une lettre ou deux d'écart tolérées. */
export function memeJeu(a: string, b: string): boolean {
  const n = (v: string) => v.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const [x, y] = [n(a), n(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const [court, long] = x.length <= y.length ? [x, y] : [y, x];
  return court.length >= 4 && long.startsWith(court) && long.length - court.length <= 2;
}

/**
 * Complète une synthèse avec le prévisionnel, sur les mois pas encore atteints.
 *
 * Le réalisé s'arrête au mois en cours ; au-delà, il n'y a rien à afficher tant
 * que les écritures n'existent pas. Cette fonction y verse ce qui est budgété —
 * catégories, ventilation par jeu, totaux et charges financières — pour lire
 * l'exercice en entier. Les mois complétés sont rendus en gris par la page :
 * ce n'est pas du réalisé, et ça se voit.
 */
export function completerAvecPrevisionnel<T extends {
  moisList: string[];
  produits: Map<string, Map<string, number>>;
  charges: Map<string, Map<string, number>>;
  personnel: Map<string, Map<string, number>>;
  immos: Map<string, Map<string, number>>;
  jeuxParJeuEtCategorie: Map<string, Map<string, Map<string, number>>>;
  immosParJeuEtCategorie: Map<string, Map<string, Map<string, number>>>;
  totalProduitsParMois: Map<string, number>;
  totalChargesParMois: Map<string, number>;
  totalPersonnelParMois: Map<string, number>;
  totalJeuxParMois: Map<string, number>;
  immoParMois: Map<string, number>;
  totalProduitsTTCParMois: Map<string, number>;
  totalChargesTTCParMois: Map<string, number>;
  totalPersonnelTTCParMois: Map<string, number>;
  totalJeuxTTCParMois: Map<string, number>;
  immoTTCParMois: Map<string, number>;
  totalTTCParMois: Map<string, number>;
  chargesFinancieresParMois: Map<string, number>;
}>(
  syn: T, lignes: PrevLigne[], refs: Referentiels,
  base: 'ht' | 'ttc', moisFuturs: string[],
): T {
  if (!moisFuturs.length) return syn;
  const futurs = new Set(moisFuturs);
  const observes = tauxObserves([]);   // pas d'écritures à observer sur ces mois
  const ordonnees = ordreAffichage(lignes, refs);

  // Copies profondes des cartes qu'on va enrichir : la synthèse d'origine
  // reste intacte, ce qui garde le calcul du réalisé vérifiable.
  const copie2 = (m: Map<string, Map<string, number>>) =>
    new Map([...m].map(([k, v]) => [k, new Map(v)]));
  const copie3 = (m: Map<string, Map<string, Map<string, number>>>) =>
    new Map([...m].map(([k, v]) => [k, copie2(v)]));
  const out = {
    ...syn,
    produits: copie2(syn.produits), charges: copie2(syn.charges),
    personnel: copie2(syn.personnel), immos: copie2(syn.immos),
    jeuxParJeuEtCategorie: copie3(syn.jeuxParJeuEtCategorie),
    immosParJeuEtCategorie: copie3(syn.immosParJeuEtCategorie),
    totalProduitsParMois: new Map(syn.totalProduitsParMois),
    totalChargesParMois: new Map(syn.totalChargesParMois),
    totalPersonnelParMois: new Map(syn.totalPersonnelParMois),
    totalJeuxParMois: new Map(syn.totalJeuxParMois),
    immoParMois: new Map(syn.immoParMois),
    totalProduitsTTCParMois: new Map(syn.totalProduitsTTCParMois),
    totalChargesTTCParMois: new Map(syn.totalChargesTTCParMois),
    totalPersonnelTTCParMois: new Map(syn.totalPersonnelTTCParMois),
    totalJeuxTTCParMois: new Map(syn.totalJeuxTTCParMois),
    immoTTCParMois: new Map(syn.immoTTCParMois),
    totalTTCParMois: new Map(syn.totalTTCParMois),
    chargesFinancieresParMois: new Map(syn.chargesFinancieresParMois),
  } as T;

  const ajoute = (m: Map<string, number>, k: string, v: number) =>
    m.set(k, r2((m.get(k) ?? 0) + v));
  const ajouteCat = (m: Map<string, Map<string, number>>, cat: string, mois: string, v: number) => {
    if (!m.has(cat)) m.set(cat, new Map());
    ajoute(m.get(cat)!, mois, v);
  };
  const ajouteJeu = (
    m: Map<string, Map<string, Map<string, number>>>, jeu: string, cat: string, mois: string, v: number,
  ) => {
    if (!m.has(jeu)) m.set(jeu, new Map());
    ajouteCat(m.get(jeu)!, cat, mois, v);
  };

  for (const l of ordonnees) {
    if (l.unite) continue;                       // les quantités ne sont pas des euros
    const valeurs = valeursDe(l, ordonnees);
    const taux = tauxDeLigne(l, observes);
    const sec = toutesCategories(refs).includes(l.categorie)
      ? sectionDeCategorie(l.categorie, refs)
      : l.section;

    for (const [i, mois] of syn.moisList.entries()) {
      if (!futurs.has(mois)) continue;
      const ht = valeurs[i] ?? 0;
      if (!ht) continue;
      const v = base === 'ttc' ? r2(ht * (1 + taux / 100)) : ht;
      const ttc = r2(ht * (1 + taux / 100));
      const jeu = jeuDeLigne(l, refs.jeux ?? []);

      if (sec === 'produits') {
        ajouteCat(out.produits, l.categorie, mois, v);
        ajoute(out.totalProduitsParMois, mois, v);
        ajoute(out.totalProduitsTTCParMois, mois, ttc);
      } else if (sec === 'immos') {
        ajouteCat(out.immos, l.categorie, mois, v);
        ajoute(out.immoParMois, mois, v);
        ajoute(out.immoTTCParMois, mois, ttc);
        ajoute(out.totalTTCParMois, mois, ttc);
        if (jeu) ajouteJeu(out.immosParJeuEtCategorie, jeu, l.categorie, mois, v);
      } else if (sec === 'personnel') {
        ajouteCat(out.personnel, l.categorie, mois, v);
        ajoute(out.totalPersonnelParMois, mois, v);
        ajoute(out.totalPersonnelTTCParMois, mois, ttc);
        ajoute(out.totalTTCParMois, mois, ttc);
      } else {
        ajouteCat(out.charges, l.categorie, mois, v);
        ajoute(out.totalChargesParMois, mois, v);
        ajoute(out.totalChargesTTCParMois, mois, ttc);
        ajoute(out.totalTTCParMois, mois, ttc);
        if (estChargeFinanciere(l.categorie)) ajoute(out.chargesFinancieresParMois, mois, ht);
        if (jeu) {
          ajouteJeu(out.jeuxParJeuEtCategorie, jeu, l.categorie, mois, v);
          ajoute(out.totalJeuxParMois, mois, v);
          ajoute(out.totalJeuxTTCParMois, mois, ttc);
        }
      }
    }
  }
  return out;
}

/** Toutes les catégories connues, tous blocs confondus. */
function toutesCategories(refs: Referentiels): string[] {
  return [...refs.categoriesProduits, ...refs.categoriesDepenses, ...refs.categoriesJeux];
}
