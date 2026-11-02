/**
 * Le prévisionnel complet d'un exercice, calculé une fois pour toutes : bloc
 * par bloc, ligne par ligne et mois par mois, puis le compte de résultat.
 *
 * L'onglet Total l'affiche, les PDF l'impriment : les deux lisent ce même
 * calcul, et ne peuvent donc pas annoncer deux chiffres différents.
 */
import type { Referentiels, FinanceEntry, JournalEntry, LigneStock, PrevLigne, PrevSection } from '../types';
import { r2 } from './money';
import { immoInfos, type LigneResultat } from './calc';
import {
  jeuDeLigne, ordreAffichage, sommeDeLigne, tauxDeLigne, tauxObserves, valeursDe, SECTIONS,
} from './previsionnel';
import { apportStock } from './stock';
import { resultatPrevisionnel, sommeMap } from './prevCalc';
import type { BlocCle } from './blocs';
import type { BaseMontant } from './reglagesVue';

/** Les blocs monétaires, dans l'ordre de lecture. */
const BLOCS_TOTAL: { cle: PrevSection; titre: string }[] =
  SECTIONS.filter(s => s.cle !== 'indicateurs') as { cle: PrevSection; titre: string }[];

/** Une ligne du tableau : son libellé, ses mois, son total. */
export interface LigneTotalPrev {
  cle: string;
  libelle: string;
  /** Montant affiché de chaque mois, dans l'ordre de `moisList`. */
  parMois: number[];
  total: number;
  aide?: string;
  /** La variation de stock : une écriture à part, qu'on lit en italique. */
  variation?: boolean;
}

/** Un jeu dans la carte des jeux : son total et ses lignes. */
export interface JeuTotalPrev {
  jeu: string;
  total: number;
  lignes: LigneTotalPrev[];
}

/** Une carte de l'onglet Total : un bloc, ou la part « jeux » d'un bloc. */
export interface VueTotalPrev {
  cle: string;
  bloc: BlocCle;
  section: PrevSection;
  titre: string;
  /** Vrai pour la carte des jeux d'un bloc. */
  jeux: boolean;
  /** Le total de la carte, celui de son en-tête. */
  total: number;
  /** Les postes généraux (carte du bloc), variation de stock comprise. */
  lignes: LigneTotalPrev[];
  /** Les jeux (carte des jeux), dans l'ordre du catalogue. */
  groupes: JeuTotalPrev[];
  /** La ligne TOTAL du bas de la carte. */
  piedParMois: number[];
  piedTotal: number;
}

export interface TotalPrevisionnel {
  moisList: string[];
  vues: VueTotalPrev[];
  /**
   * Ce que pèse chaque bloc sur l'exercice, jeux et stock compris — charges
   * nettes de la variation de stock. Calculé sur l'exact et arrondi une seule
   * fois : c'est le chiffre « bloc » de la Vue 5 ans et des PDF.
   */
  totaux: Map<PrevSection, number>;
  /** Le compte de résultat prévisionnel, toujours en HT. */
  resultat: LigneResultat[];
}

export interface EntreesTotalPrev {
  exercice: string;
  moisList: string[];
  previsionnels: Record<string, PrevLigne[]>;
  stocks: LigneStock[];
  entries: JournalEntry[];
  finances: FinanceEntry[];
  refs: Referentiels;
  base: BaseMontant;
}

export function totalPrevisionnel(e: EntreesTotalPrev): TotalPrevisionnel {
  const { exercice, moisList, previsionnels, stocks, entries, finances, refs, base } = e;
  const jeux = refs.jeux ?? [];
  const lignes = ordreAffichage(previsionnels[exercice] ?? [], refs);
  const stock = apportStock(stocks, exercice, jeux);
  const immos = immoInfos(entries, refs);
  const resultat = resultatPrevisionnel({ lignes, moisList, immos, finances, stock, refs });

  // HT ou TTC, ligne par ligne : chacune garde son taux, comme dans les onglets
  // de saisie. Les montants restent stockés en HT — c'est l'affichage qui
  // change, jamais la donnée.
  const observes = tauxObserves(entries);
  const coef = (l: PrevLigne) =>
    base === 'ttc' && !l.unite ? 1 + tauxDeLigne(l, observes) / 100 : 1;
  // Les montants qui viennent du stock portent le taux de leur jeu.
  const coefJeu = (jeu: string) =>
    base === 'ttc' ? 1 + (stock.tauxParJeu.get(jeu) ?? 20) / 100 : 1;
  // Les droits d'auteur n'ont pas de TVA : un auteur sous franchise en base
  // n'en facture pas.
  const coefStock = (jeu: string, libelle: string) =>
    libelle.startsWith('Droits') ? 1 : coefJeu(jeu);

  const vues: VueTotalPrev[] = [];
  const totaux = new Map<PrevSection, number>();
  for (const bloc of BLOCS_TOTAL) {
    const lignesBloc = lignes.filter(l => l.section === bloc.cle && !l.unite);
    // Les ventes se détaillent par canal (distributeur, boutique, éditeur) ;
    // les tirages, eux, n'ont qu'une ligne par jeu.
    const duStock: [string, string, Map<string, number>][] = bloc.cle === 'produits'
      ? [...stock.caParJeuCanalEtMois.entries()].flatMap(([jeu, canaux]) =>
        [...canaux.entries()].map(([canal, parMois]) =>
          [jeu, `Ventes ${canal} (stock)`, parMois] as [string, string, Map<string, number>]))
      : bloc.cle === 'charges'
        ? [
          ...[...stock.fabricationParJeuEtMois.entries()].map(([jeu, parMois]) =>
            [jeu, 'Tirages payés à l’usine (stock)', parMois] as [string, string, Map<string, number>]),
          // Les droits d'auteur dus, avances déjà déduites : une charge du
          // jeu au même titre que son tirage.
          ...[...stock.droitsParJeuEtMois.entries()].map(([jeu, parMois]) =>
            [jeu, 'Droits d’auteur (stock)', parMois] as [string, string, Map<string, number>]),
        ]
        : [];
    if (!lignesBloc.length && !duStock.length) continue;

    const valeurLigne = (l: PrevLigne, i: number) => (valeursDe(l, lignes)[i] ?? 0) * coef(l);
    const parMois = new Map(moisList.map((m, i) => [m, r2(
      lignesBloc.reduce((x, l) => x + valeurLigne(l, i), 0))]));
    // Ce que le stock ajoute au bloc, en plus des lignes saisies. Les droits
    // d'auteur s'ajoutent aux tirages, sans TVA.
    const tirages = base === 'ttc' ? stock.fabricationTTCParMois : stock.fabricationParMois;
    const apport = bloc.cle === 'produits'
      ? (base === 'ttc' ? stock.caTTCParMois : stock.caParMois)
      : bloc.cle === 'charges'
        ? new Map(moisList.map(m => [m, r2(
          (tirages.get(m) ?? 0) + (stock.droitsParMois.get(m) ?? 0))]))
        : undefined;
    // L'exact, arrondi une fois : sommer les mois déjà arrondis ferait
    // dériver le total de quelques centimes par rapport à l'onglet de saisie.
    const sommeLignes = (ls: PrevLigne[]) =>
      ls.reduce((s, l) => s + sommeDeLigne(l, lignes) * coef(l), 0);
    const totalBloc = r2(sommeLignes(lignesBloc) + (apport ? sommeMap(apport) : 0));
    // Les jeux présents dans ce bloc, dans l'ordre du catalogue.
    const jeuxDuBloc = jeux.filter(j =>
      lignesBloc.some(l => jeuDeLigne(l, jeux) === j) || duStock.some(([x]) => x === j));

    const lignesFonct = lignesBloc.filter(l => !jeuDeLigne(l, jeux));
    const totalStockJeux = duStock.reduce((x, [j, libelle, pm]) =>
      x + [...pm.values()].reduce((y, v) => y + v, 0) * coefStock(j, libelle), 0);
    const totalJeuxBloc = r2(sommeLignes(lignesBloc.filter(l => !!jeuDeLigne(l, jeux)))
      + totalStockJeux);
    const variation = bloc.cle === 'charges' ? sommeMap(stock.variationParMois) : 0;
    totaux.set(bloc.cle, r2(sommeLignes(lignesBloc) + (apport ? sommeMap(apport) : 0) - variation));

    const ligneSaisie = (l: PrevLigne): LigneTotalPrev => ({
      cle: l.id,
      libelle: l.categorie,
      parMois: moisList.map((_, i) => valeurLigne(l, i)),
      total: r2(sommeDeLigne(l, lignes) * coef(l)),
    });

    // La ligne TOTAL, mois par mois : le bloc entier, ou sa seule part jeux.
    const pied = (desJeuxSeuls: boolean) => moisList.map((m, i) => {
      const desJeux = r2(lignesBloc.filter(l => !!jeuDeLigne(l, jeux))
        .reduce((x, l) => x + valeurLigne(l, i), 0)
        + duStock.reduce((x, [j, libelle, pm]) => x + (pm.get(m) ?? 0) * coefStock(j, libelle), 0));
      const tout = r2((parMois.get(m) ?? 0) + (apport?.get(m) ?? 0)
        - (bloc.cle === 'charges' ? (stock.variationParMois.get(m) ?? 0) : 0));
      return desJeuxSeuls ? desJeux : r2(tout - desJeux);
    });

    // La carte du bloc : ses postes généraux, puis la variation de stock.
    const lignesCarte = lignesFonct.map(ligneSaisie).filter(l => l.total);
    if (bloc.cle === 'charges' && variation !== 0) {
      lignesCarte.push({
        cle: 'variation',
        libelle: 'Variation de stock (en moins des charges)',
        parMois: moisList.map(m => -(stock.variationParMois.get(m) ?? 0)),
        total: r2(-variation),
        aide: 'Elle neutralise le coût des exemplaires encore en carton : seul le coût de ce qui est vendu pèse sur le résultat. Écriture comptable sans TVA : son montant est le même en HT et en TTC.',
        variation: true,
      });
    }
    const totalFonct = jeuxDuBloc.length ? r2(totalBloc - totalJeuxBloc) : totalBloc;
    vues.push({
      cle: bloc.cle, bloc: bloc.cle as BlocCle, section: bloc.cle, titre: bloc.titre, jeux: false,
      total: totalFonct,
      lignes: lignesCarte,
      groupes: [],
      piedParMois: pied(false),
      piedTotal: r2(totalFonct - variation),
    });

    // Les jeux ont leur carte : leur total, leur palette, leur espace.
    if (jeuxDuBloc.length) {
      const groupes: JeuTotalPrev[] = jeuxDuBloc.map(jeu => {
        const siennes = lignesBloc.filter(l => jeuDeLigne(l, jeux) === jeu);
        const duStockJeu = duStock.filter(([j]) => j === jeu);
        const total = r2(sommeLignes(siennes)
          + duStockJeu.reduce((s, [, libelle, pm]) =>
            s + [...pm.values()].reduce((x, v) => x + v, 0) * coefStock(jeu, libelle), 0));
        return {
          jeu, total,
          lignes: [
            ...siennes.map(ligneSaisie).filter(l => l.total),
            ...duStockJeu.map(([, libelle, pm]) => {
              const k = coefStock(jeu, libelle);
              return {
                cle: `${jeu}-${libelle}`,
                libelle,
                parMois: moisList.map(m => r2((pm.get(m) ?? 0) * k)),
                total: r2([...pm.values()].reduce((s, v) => s + v, 0) * k),
                aide: libelle.startsWith('Droits')
                  ? 'Droits dus après récupération de l’avance. Affichés sans TVA : un auteur sous franchise en base n’en facture pas — si le tien la facture, saisis-la au journal.'
                  : undefined,
              };
            }),
          ],
        };
      }).filter(g => g.total);
      vues.push({
        cle: `${bloc.cle}-jeux`, bloc: 'jeux', section: bloc.cle, titre: `${bloc.titre} — jeux`,
        jeux: true,
        total: totalJeuxBloc,
        lignes: [],
        groupes,
        piedParMois: pied(true),
        piedTotal: totalJeuxBloc,
      });
    }
  }

  return { moisList, vues, totaux, resultat };
}
