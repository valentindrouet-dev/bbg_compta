/**
 * Le stock, jeu par jeu.
 *
 * Un jeu de société se fabrique par tirages : on paie l'usine d'un coup, puis
 * on écoule les exemplaires pendant des mois ou des années. Sans stock en
 * comptabilité, le tirage plomberait l'exercice où il est payé et les ventes
 * des années suivantes paraîtraient toutes en marge — c'est faux dans les deux
 * sens. Le stock rétablit le rattachement : seul le **coût des exemplaires
 * vendus** pèse sur le résultat, les invendus restent à l'actif.
 *
 * Mécanique retenue, celle du plan comptable :
 *
 *   Achats (fabrication)          charge, au moment où l'usine est payée
 *   Variation de stock            produit quand le stock monte, charge quand il baisse
 *   ------------------------------------------------------------------------
 *   Effet net sur le résultat  =  ventes − coût des exemplaires vendus  =  marge
 *
 * Le coût de revient unitaire n'est pas calculé ici : il vient du
 * [Production Calculator](https://valentindrouet-dev.github.io/boardgame_prod_calculator/),
 * qui reste seul maître des devis usine. On l'y recopie, une fois par tirage.
 */
import type { CanalVente, LigneStock, MouvementStock } from '../types';
import { compareMois, exerciceDuMois, moisExercice, EXERCICES } from './dates';
import { r2 } from './money';

/** TVA appliquée aux ventes de jeux quand la ligne n'en fixe pas. */
export const TVA_JEUX_DEFAUT = 20;

/** La catégorie de produit qui porte les ventes issues du stock. */
export const CATEGORIE_VENTES_JEUX = 'Ventes de jeux';

/** La catégorie de charge qui porte les tirages payés à l'usine. */
export const CATEGORIE_FABRICATION = 'Fabrication des jeux';

/** La catégorie qui porte la correction de rattachement (compte 6031 / 71). */
export const CATEGORIE_VARIATION_STOCK = 'Variation de stock';

/**
 * Les canaux de vente d'un jeu de société, du moins cher au plus cher. Un
 * distributeur achète en gros et se paie sur la remise ; une boutique achète
 * moins et paie plus ; un éditeur partenaire, encore autrement. Les trois se
 * renomment et d'autres s'ajoutent.
 */
export const CANAUX_DEFAUT: { nom: string; aide: string; repartition: number }[] = [
  {
    nom: 'Distributeur', repartition: 60,
    aide: 'Vente en gros à un distributeur — le prix le plus bas, les volumes les plus gros',
  },
  {
    nom: 'Boutique', repartition: 10,
    aide: 'Vente directe aux boutiques — prix intermédiaire, sans intermédiaire',
  },
  {
    nom: 'Éditeur', repartition: 30,
    aide: 'Vente à un éditeur partenaire (co-édition, licence) ou en direct',
  },
];

let compteurCanal = 0;
export function canalVide(
  nom: string, nMois: number, prix = 0, repartition?: number,
): CanalVente {
  return {
    id: `canal-${Date.now().toString(36)}-${++compteurCanal}`,
    nom, prix, mode: 'repartition', base: 'tirage',
    repartition: repartition ?? CANAUX_DEFAUT.find(c => c.nom === nom)?.repartition ?? 0,
    valeurs: new Array<number | null>(nMois).fill(null),
  };
}

/** Ce qu'un canal écoule et rapporte sur un mois. */
export interface MoisCanal {
  /** Exemplaires écoulés — la valeur saisie, ou celle que le % donne. */
  quantite: number;
  /** Ventes hors taxes du canal. */
  ca: number;
}

/** Un mois de stock pour un jeu, tout ce qui en découle calculé. */
export interface MoisStock {
  mois: string;
  /** Exemplaires sortis d'usine ce mois-là. */
  fabrique: number;
  /** Exemplaires vendus ce mois-là, tous canaux confondus. */
  vendue: number;
  /** Le détail par canal, indexé par identifiant de canal. */
  parCanal: Map<string, MoisCanal>;
  stockDebut: number;
  stockFin: number;
  /** Ce que l'usine coûte : fabriqué × coût de revient unitaire. */
  coutFabrication: number;
  /** Ventes hors taxes, tous canaux confondus. */
  ca: number;
  /** Ventes taxes comprises — ce qui entre vraiment sur le compte. */
  caTTC: number;
  /** Coût des exemplaires vendus : vendu × coût de revient unitaire. */
  cogs: number;
  /** (stock fin − stock début) × coût unitaire : + quand le stock monte. */
  variationStock: number;
  /** Ventes − coût des ventes. C'est elle, la marge réelle du mois. */
  marge: number;
  /** Valeur du stock à la fin du mois, au coût de revient. */
  valeurStock: number;
}

export interface StockJeu {
  ligne: LigneStock;
  mois: MoisStock[];
  /** Cumuls sur l'exercice. */
  total: {
    fabrique: number; vendue: number;
    stockDebut: number; stockFin: number;
    coutFabrication: number; ca: number; caTTC: number; cogs: number;
    variationStock: number; marge: number; valeurStock: number;
    /** Exemplaires et chiffre d'affaires par canal. */
    parCanal: Map<string, MoisCanal>;
  };
  /** Le stock est-il descendu sous zéro ? On vend alors ce qu'on n'a pas. */
  decouvert: boolean;
}

const somme = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);

/**
 * Le stock d'ouverture d'un jeu pour un exercice : ce qui restait à la clôture
 * du précédent. On remonte la chaîne des exercices depuis le premier, pour que
 * l'ouverture ne soit jamais saisie deux fois.
 */
export function stockOuverture(lignes: LigneStock[], jeu: string, exercice: string): number {
  const rang = EXERCICES.indexOf(exercice as typeof EXERCICES[number]);
  if (rang <= 0) {
    return lignes.find(l => l.jeu === jeu && l.exercice === exercice)?.stockInitial ?? 0;
  }
  let stock = lignes.find(l => l.jeu === jeu && l.exercice === EXERCICES[0])?.stockInitial ?? 0;
  for (let i = 0; i < rang; i++) {
    const l = lignes.find(x => x.jeu === jeu && x.exercice === EXERCICES[i]);
    if (!l) continue;
    stock += somme(l.fabrique);
    // On refait passer l'exercice pour résoudre les pourcentages, sinon un
    // écoulement saisi en % ne diminuerait jamais le stock des années d'après.
    for (const r of derouleStock(l, lignes).mois) stock -= r.vendue;
  }
  return stock;
}

/**
 * Combien d'exemplaires un canal écoule un mois donné.
 *
 * En mode « nombre », c'est la valeur saisie. En mode « pourcentage », c'est
 * ce pourcentage appliqué à l'assiette choisie — le tirage de l'exercice, ou
 * le stock disponible ce mois-là. Le résultat est arrondi à l'exemplaire : on
 * ne vend pas un demi-jeu.
 */
export function quantiteCanal(
  canal: CanalVente, i: number, tirage: number, disponible: number,
  ventesPourcent = 0,
): number {
  // Le cas courant : le canal reçoit sa part du rythme d'écoulement du mois.
  // 10 % de ventes sur un tirage de 3 000, avec 60 % chez le distributeur,
  // font 10 % de ces 1 800 exemplaires, soit 180.
  if (canal.mode === 'repartition') {
    if (!ventesPourcent) return 0;
    const part = ((canal.repartition ?? 0) / 100) * tirage;
    return Math.round((ventesPourcent / 100) * part);
  }
  const v = canal.valeurs[i] ?? 0;
  if (!v) return 0;
  if (canal.mode !== 'pourcentage') return v;
  const assiette = canal.base === 'disponible' ? disponible : tirage;
  return Math.round((v / 100) * assiette);
}

/** Les parts des canaux totalisent-elles bien 100 % ? */
export function totalRepartition(ligne: LigneStock): number {
  return r2((ligne.canaux ?? [])
    .filter(c => c.mode === 'repartition')
    .reduce((s, c) => s + (c.repartition ?? 0), 0));
}

/** Déroule un exercice de stock pour un jeu, mois par mois. */
export function derouleStock(ligne: LigneStock, lignes: LigneStock[]): StockJeu {
  const mois = moisExercice(ligne.exercice);
  const cu = ligne.coutUnitaire || 0;
  const tva = (ligne.tauxTVA ?? TVA_JEUX_DEFAUT) / 100;
  const canaux = ligne.canaux ?? [];
  const ouverture = stockOuverture(lignes, ligne.jeu, ligne.exercice);
  // Le tirage de l'exercice sert d'assiette aux pourcentages « du tirage ».
  const tirage = ouverture + somme(ligne.fabrique);
  let stock = ouverture;
  let decouvert = false;

  const rows: MoisStock[] = mois.map((m, i) => {
    const fabrique = ligne.fabrique[i] ?? 0;
    const stockDebut = stock;
    const disponible = stockDebut + fabrique;

    const rythme = ligne.ventesPourcent?.[i] ?? 0;
    const parCanal = new Map<string, MoisCanal>();
    let vendue = 0;
    let ca = 0;
    for (const c of canaux) {
      const q = quantiteCanal(c, i, tirage, disponible, rythme);
      const caCanal = r2(q * (c.prix || 0));
      parCanal.set(c.id, { quantite: q, ca: caCanal });
      vendue += q;
      ca += caCanal;
    }
    ca = r2(ca);

    const stockFin = disponible - vendue;
    if (stockFin < 0) decouvert = true;
    stock = stockFin;
    return {
      mois: m, fabrique, vendue, parCanal, stockDebut, stockFin,
      coutFabrication: r2(fabrique * cu),
      ca, caTTC: r2(ca * (1 + tva)),
      cogs: r2(vendue * cu),
      variationStock: r2((stockFin - stockDebut) * cu),
      marge: r2(ca - vendue * cu),
      valeurStock: r2(stockFin * cu),
    };
  });

  const t = (f: (r: MoisStock) => number) => r2(rows.reduce((s, r) => s + f(r), 0));
  const totalCanal = new Map<string, MoisCanal>();
  for (const c of canaux) {
    totalCanal.set(c.id, {
      quantite: rows.reduce((s, r) => s + (r.parCanal.get(c.id)?.quantite ?? 0), 0),
      ca: r2(rows.reduce((s, r) => s + (r.parCanal.get(c.id)?.ca ?? 0), 0)),
    });
  }
  return {
    ligne, mois: rows, decouvert,
    total: {
      fabrique: t(r => r.fabrique), vendue: t(r => r.vendue),
      stockDebut: ouverture, stockFin: stock,
      coutFabrication: t(r => r.coutFabrication),
      ca: t(r => r.ca), caTTC: t(r => r.caTTC), cogs: t(r => r.cogs),
      variationStock: r2((stock - ouverture) * cu),
      marge: t(r => r.marge),
      valeurStock: r2(stock * cu),
      parCanal: totalCanal,
    },
  };
}

/** Tous les jeux d'un exercice, dans l'ordre du catalogue. */
export function stocksExercice(
  lignes: LigneStock[], exercice: string, jeux: string[],
): StockJeu[] {
  const rang = (j: string) => {
    const i = jeux.indexOf(j);
    return i < 0 ? jeux.length : i;
  };
  return lignes
    .filter(l => l.exercice === exercice)
    .sort((a, b) => rang(a.jeu) - rang(b.jeu) || a.jeu.localeCompare(b.jeu))
    .map(l => derouleStock(l, lignes));
}

/** Une ligne de stock vierge pour un jeu et un exercice, avec ses trois canaux. */
export function ligneStockVide(
  jeu: string, exercice: string, id: string,
): LigneStock {
  const n = moisExercice(exercice).length;
  return {
    id, jeu, exercice,
    coutUnitaire: 0, tauxTVA: TVA_JEUX_DEFAUT,
    fabrique: new Array<number | null>(n).fill(null),
    ventesPourcent: new Array<number | null>(n).fill(null),
    canaux: CANAUX_DEFAUT.map(c => canalVide(c.nom, n, 0, c.repartition)),
  };
}

// ----- Ce que le stock apporte au reste de l'app -------------------------

/** Agrégat mensuel du stock, tous jeux confondus, pour un exercice. */
export interface ApportStock {
  /** Ventes HT par mois, et par jeu. */
  caParMois: Map<string, number>;
  caParJeuEtMois: Map<string, Map<string, number>>;
  /** Ventes HT par jeu, puis par canal, puis par mois. */
  caParJeuCanalEtMois: Map<string, Map<string, Map<string, number>>>;
  caTTCParMois: Map<string, number>;
  /** Tirages payés à l'usine, HT puis TTC (la TVA de fabrication est déductible). */
  fabricationParMois: Map<string, number>;
  /** Le même tirage, TTC : c'est ce montant-là qui sort du compte en banque. */
  fabricationTTCParMois: Map<string, number>;
  fabricationParJeuEtMois: Map<string, Map<string, number>>;
  /** Correction de rattachement : + quand le stock monte. */
  variationParMois: Map<string, number>;
  /** Coût des exemplaires vendus. */
  cogsParMois: Map<string, number>;
  margeParMois: Map<string, number>;
  /** Valeur du stock à la fin de chaque mois. */
  valeurParMois: Map<string, number>;
}

const ajoute = (m: Map<string, number>, cle: string, v: number) =>
  m.set(cle, r2((m.get(cle) ?? 0) + v));

export function apportStock(
  lignes: LigneStock[], exercice: string, jeux: string[],
): ApportStock {
  const out: ApportStock = {
    caParMois: new Map(), caParJeuEtMois: new Map(), caParJeuCanalEtMois: new Map(),
    caTTCParMois: new Map(),
    fabricationParMois: new Map(), fabricationTTCParMois: new Map(),
    fabricationParJeuEtMois: new Map(),
    variationParMois: new Map(), cogsParMois: new Map(),
    margeParMois: new Map(), valeurParMois: new Map(),
  };
  for (const s of stocksExercice(lignes, exercice, jeux)) {
    const parJeuCA = new Map<string, number>();
    const parJeuFab = new Map<string, number>();
    for (const c of s.ligne.canaux ?? []) {
      const parMois = new Map<string, number>();
      for (const r of s.mois) {
        const v = r.parCanal.get(c.id)?.ca ?? 0;
        if (v) parMois.set(r.mois, v);
      }
      if (parMois.size) {
        if (!out.caParJeuCanalEtMois.has(s.ligne.jeu)) {
          out.caParJeuCanalEtMois.set(s.ligne.jeu, new Map());
        }
        out.caParJeuCanalEtMois.get(s.ligne.jeu)!.set(c.nom, parMois);
      }
    }
    for (const r of s.mois) {
      ajoute(out.caParMois, r.mois, r.ca);
      ajoute(out.caTTCParMois, r.mois, r.caTTC);
      ajoute(out.fabricationParMois, r.mois, r.coutFabrication);
      // On paie l'usine TTC, avec le taux du jeu — pas un 20 % supposé.
      ajoute(out.fabricationTTCParMois, r.mois,
        r2(r.coutFabrication * (1 + (s.ligne.tauxTVA ?? TVA_JEUX_DEFAUT) / 100)));
      ajoute(out.variationParMois, r.mois, r.variationStock);
      ajoute(out.cogsParMois, r.mois, r.cogs);
      ajoute(out.margeParMois, r.mois, r.marge);
      ajoute(out.valeurParMois, r.mois, r.valeurStock);
      if (r.ca) parJeuCA.set(r.mois, r.ca);
      if (r.coutFabrication) parJeuFab.set(r.mois, r.coutFabrication);
    }
    if (parJeuCA.size) out.caParJeuEtMois.set(s.ligne.jeu, parJeuCA);
    if (parJeuFab.size) out.fabricationParJeuEtMois.set(s.ligne.jeu, parJeuFab);
  }
  return out;
}

// ----- Mouvements réels (page Stocks du journal) -------------------------

/** Ce qu'un mouvement fait au stock : + il entre, − il sort. */
export function sensMouvement(t: MouvementStock['type']): 1 | -1 {
  return t === 'fabrication' || t === 'ajustement' ? 1 : -1;
}

export interface PositionJeu {
  jeu: string;
  entrees: number;
  sorties: number;
  stock: number;
  /** Valeur du stock au dernier coût de revient connu. */
  valeur: number;
  coutMoyen: number;
  /** Ventes hors taxes réalisées. */
  ca: number;
  /** Coût des exemplaires vendus. */
  cogs: number;
  marge: number;
  parMois: Map<string, { entrees: number; sorties: number; stock: number }>;
  /** Ventes réalisées par canal : exemplaires, chiffre d'affaires, prix moyen. */
  parCanal: Map<string, { quantite: number; ca: number }>;
}

/**
 * La position de chaque jeu à partir des mouvements réels. Le coût de revient
 * retenu pour valoriser les sorties est le **coût moyen pondéré** des entrées,
 * la méthode admise et la plus simple à défendre.
 */
export function positionsStock(
  mouvements: MouvementStock[], jeux: string[], jusquA?: string,
): PositionJeu[] {
  const par = new Map<string, PositionJeu>();
  const tries = [...mouvements]
    .filter(m => !jusquA || compareMois(m.mois, jusquA) <= 0)
    .sort((a, b) => compareMois(a.mois, b.mois) || a.date.localeCompare(b.date));
  // Cumul pondéré des entrées, pour le coût moyen.
  const cumul = new Map<string, { qte: number; valeur: number }>();

  for (const mv of tries) {
    const jeu = mv.jeu || '— non rattaché —';
    if (!par.has(jeu)) {
      par.set(jeu, {
        jeu, entrees: 0, sorties: 0, stock: 0, valeur: 0, coutMoyen: 0,
        ca: 0, cogs: 0, marge: 0, parMois: new Map(), parCanal: new Map(),
      });
      cumul.set(jeu, { qte: 0, valeur: 0 });
    }
    const p = par.get(jeu)!;
    const c = cumul.get(jeu)!;
    const q = Math.abs(mv.quantite);
    if (sensMouvement(mv.type) > 0) {
      p.entrees += q;
      c.qte += q;
      c.valeur = r2(c.valeur + q * (mv.unitaire || 0));
    } else {
      p.sorties += q;
      if (mv.type === 'vente') {
        const montant = r2(q * (mv.unitaire || 0));
        p.ca = r2(p.ca + montant);
        p.cogs = r2(p.cogs + q * (c.qte ? c.valeur / c.qte : 0));
        const canal = mv.canal || '— sans canal —';
        const acc = p.parCanal.get(canal) ?? { quantite: 0, ca: 0 };
        p.parCanal.set(canal, { quantite: acc.quantite + q, ca: r2(acc.ca + montant) });
      }
    }
    p.stock = p.entrees - p.sorties;
    const m = p.parMois.get(mv.mois) ?? { entrees: 0, sorties: 0, stock: 0 };
    if (sensMouvement(mv.type) > 0) m.entrees += q; else m.sorties += q;
    m.stock = p.stock;
    p.parMois.set(mv.mois, m);
  }

  for (const p of par.values()) {
    const c = cumul.get(p.jeu)!;
    p.coutMoyen = c.qte ? r2(c.valeur / c.qte) : 0;
    p.valeur = r2(p.stock * p.coutMoyen);
    p.marge = r2(p.ca - p.cogs);
  }
  const rang = (j: string) => {
    const i = jeux.indexOf(j);
    return i < 0 ? jeux.length : i;
  };
  return [...par.values()].sort((a, b) => rang(a.jeu) - rang(b.jeu) || a.jeu.localeCompare(b.jeu));
}

/** Les mouvements d'un exercice, dans l'ordre. */
export function mouvementsExercice(
  mouvements: MouvementStock[], exercice: string,
): MouvementStock[] {
  return mouvements
    .filter(m => exerciceDuMois(m.mois) === exercice)
    .sort((a, b) => compareMois(a.mois, b.mois) || a.date.localeCompare(b.date));
}
