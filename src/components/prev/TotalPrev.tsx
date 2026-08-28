/**
 * Le prévisionnel complet d'un exercice, d'un seul tenant et non modifiable.
 *
 * Tout ce qui a été saisi dans les autres onglets se retrouve ici, dans l'ordre
 * de la synthèse : produits, charges, personnel, immobilisations, stock, puis
 * le compte de résultat. On y lit l'année entière sans risquer de la changer.
 */
import { Fragment, useMemo } from 'react';
import { useStore } from '../../store';
import type { PrevLigne, PrevSection } from '../../types';
import { labelMois } from '../../utils/dates';
import { euros, euros0, r2 } from '../../utils/money';
import { immoInfos } from '../../utils/calc';
import { couleurJeu } from '../../utils/jeux';
import {
  jeuDeLigne, ordreAffichage, sommeDeLigne, tauxDeLigne, tauxObserves, valeursDe, SECTIONS,
} from '../../utils/previsionnel';
import { apportStock } from '../../utils/stock';
import { resultatPrevisionnel, sommeMap } from '../../utils/prevCalc';
import { teinteBloc, type BlocCle } from '../../utils/blocs';
import { Card, TotalBloc, styleBloc, BandeauJeu } from '../ui';
import { useBaseMontant, useVueSimplifiee } from '../../utils/reglagesVue';

const AUCUN_JEU: string[] = [];

/** Les blocs monétaires, dans l'ordre de lecture. */
const BLOCS_TOTAL: { cle: PrevSection; titre: string }[] =
  SECTIONS.filter(s => s.cle !== 'indicateurs') as { cle: PrevSection; titre: string }[];

export function TotalPrev({ exercice, moisList }: { exercice: string; moisList: string[] }) {
  const previsionnels = useStore(s => s.previsionnels);
  const stocks = useStore(s => s.stocks);
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const refs = useStore(s => s.referentiels);
  const couleurs = useStore(s => s.blocCouleurs);
  const jeux = refs.jeux ?? AUCUN_JEU;
  const [base] = useBaseMontant();
  const [simple] = useVueSimplifiee();

  const lignes = useMemo(
    () => ordreAffichage(previsionnels[exercice] ?? [], refs), [previsionnels, exercice, refs]);
  const stock = useMemo(() => apportStock(stocks, exercice, jeux), [stocks, exercice, jeux]);
  const immos = useMemo(() => immoInfos(entries, refs), [entries, refs]);
  const resultat = useMemo(
    () => resultatPrevisionnel({ lignes, moisList, immos, finances, stock, refs }),
    [lignes, moisList, immos, finances, stock, refs]);

  const rn = resultat.find(l => l.cle === 'rn')!;

  // HT ou TTC, ligne par ligne : chacune garde son taux, comme dans les onglets
  // de saisie. Les montants restent stockés en HT — c'est l'affichage qui
  // change, jamais la donnée.
  const observes = useMemo(() => tauxObserves(entries), [entries]);
  const coef = (l: PrevLigne) =>
    base === 'ttc' && !l.unite ? 1 + tauxDeLigne(l, observes) / 100 : 1;
  // Les montants qui viennent du stock portent le taux de leur jeu.
  const coefJeu = (jeu: string) =>
    base === 'ttc' ? 1 + (stock.tauxParJeu.get(jeu) ?? 20) / 100 : 1;

  return (
    <div className="space-y-5">
      {BLOCS_TOTAL.map(bloc => {
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
        if (!lignesBloc.length && !duStock.length) return null;

        const t = teinteBloc(bloc.cle as BlocCle, couleurs);
        const valeurLigne = (l: PrevLigne, i: number) => (valeursDe(l, lignes)[i] ?? 0) * coef(l);
        const parMois = new Map(moisList.map((m, i) => [m, r2(
          lignesBloc.reduce((x, l) => x + valeurLigne(l, i), 0))]));
        // Ce que le stock ajoute au bloc, en plus des lignes saisies. Les droits
        // d'auteur s'ajoutent aux tirages : on ne leur applique pas de TVA, un
        // auteur sous franchise en base n'en facturant pas.
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

        return (
          <Card key={bloc.cle} title={bloc.titre}
            actions={<TotalBloc label={`Total ${bloc.titre.toLowerCase()}`} valeur={euros(totalBloc)} t={t} />}>
            <div className="overflow-x-auto -mx-4 px-4" style={styleBloc(t)}>
              <table data-table={`total:${bloc.cle}`} data-bloc={bloc.cle} className="sheet text-sm border-collapse w-full">
                <thead>
                  <tr className="text-left" style={{ color: '#5c5280' }}>
                    <th className="min-w-56">Ligne</th>
                    {moisList.map(m => <th key={m} className="text-right">{labelMois(m)}</th>)}
                    <th className="text-right bg-[var(--bloc-total)]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* D'abord les postes généraux, puis un bandeau par jeu —
                      le même découpage que dans les onglets de saisie. */}
                  {(simple ? [] : lignesBloc.filter(l => !jeuDeLigne(l, jeux))).map(l => {
                    const total = r2(sommeDeLigne(l, lignes) * coef(l));
                    if (!total) return null;
                    return (
                      <tr key={l.id}>
                        <td>{l.categorie}</td>
                        {moisList.map((m, i) => {
                          const v = valeurLigne(l, i);
                          return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                        })}
                        <td className="text-right tabular-nums bg-[var(--bloc-total)] font-medium">{euros(total)}</td>
                      </tr>
                    );
                  })}
                  {jeuxDuBloc.map(jeu => {
                    const siennes = lignesBloc.filter(l => jeuDeLigne(l, jeux) === jeu);
                    const duStockJeu = duStock.filter(([j]) => j === jeu);
                    const totalJeu = r2(sommeLignes(siennes)
                      + duStockJeu.reduce((s, [, libelle, parMois]) =>
                        s + [...parMois.values()].reduce((x, v) => x + v, 0)
                          * (libelle.startsWith('Droits') ? 1 : coefJeu(jeu)), 0));
                    if (!totalJeu) return null;
                    return (
                      <Fragment key={`jeu-${jeu}`}>
                        {/* Le bandeau porte toujours le total du jeu : ici il n'y a
                            pas de ligne de sous-total à masquer, et le priver de son
                            chiffre ne laisserait qu'un intertitre. */}
                        <BandeauJeu jeu={jeu} couleur={couleurJeu(jeu, refs)}
                          colSpan={moisList.length + 2}
                          droite={euros(r2(totalJeu))} />
                        {(simple ? [] : siennes).map(l => {
                          const total = r2(sommeDeLigne(l, lignes) * coef(l));
                          if (!total) return null;
                          return (
                            <tr key={l.id}>
                              <td style={{ paddingLeft: 22 }}>{l.categorie}</td>
                              {moisList.map((m, i) => {
                                const v = valeurLigne(l, i);
                                return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                              })}
                              <td className="text-right tabular-nums bg-[var(--bloc-total)] font-medium">{euros(total)}</td>
                            </tr>
                          );
                        })}
                        {(simple ? [] : duStockJeu).map(([, libelle, parMoisJeu]) => {
                          const k = libelle.startsWith('Droits') ? 1 : coefJeu(jeu);
                          const total = r2([...parMoisJeu.values()].reduce((s, v) => s + v, 0) * k);
                          return (
                            <tr key={`${jeu}-${libelle}`}>
                              <td style={{ paddingLeft: 22 }}
                                title={libelle.startsWith('Droits')
                                  ? 'Droits dus après récupération de l’avance. Affichés sans TVA : un auteur sous franchise en base n’en facture pas — si le tien la facture, saisis-la au journal.'
                                  : undefined}>
                                {libelle}
                              </td>
                              {moisList.map(m => {
                                const v = r2((parMoisJeu.get(m) ?? 0) * k);
                                return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                              })}
                              <td className="text-right tabular-nums bg-[var(--bloc-total)] font-medium">{euros(total)}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                  {bloc.cle === 'charges' && sommeMap(stock.variationParMois) !== 0 && (
                    <tr style={{ fontStyle: 'italic' }}>
                      <td title="Elle neutralise le coût des exemplaires encore en carton : seul le coût de ce qui est vendu pèse sur le résultat. Écriture comptable sans TVA : son montant est le même en HT et en TTC.">
                        Variation de stock (en moins des charges)
                      </td>
                      {moisList.map(m => {
                        const v = -(stock.variationParMois.get(m) ?? 0);
                        return (
                          <td key={m} className="text-right tabular-nums"
                            style={v ? { color: v < 0 ? '#38761d' : '#b7332e' } : undefined}>
                            {v ? euros0(v) : '·'}
                          </td>
                        );
                      })}
                      <td className="text-right tabular-nums bg-[var(--bloc-total)] font-medium">
                        {euros(r2(-sommeMap(stock.variationParMois)))}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="total-bloc">
                    <td>TOTAL {bloc.titre.toUpperCase()}</td>
                    {moisList.map(m => {
                      const v = r2((parMois.get(m) ?? 0) + (apport?.get(m) ?? 0)
                        - (bloc.cle === 'charges' ? (stock.variationParMois.get(m) ?? 0) : 0));
                      return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                    })}
                    <td className="text-right tabular-nums grand">
                      {euros(r2(totalBloc - (bloc.cle === 'charges' ? sommeMap(stock.variationParMois) : 0)))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {bloc.cle === 'immos' && (
              <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
                Ces montants <b>ne passent pas au compte de résultat</b> : un investissement
                s'inscrit à l'actif, et ne pèse que par sa <b>dotation</b>, étalée sur la durée
                choisie ligne par ligne. Ils sortent en revanche de la trésorerie en totalité,
                le mois où ils sont engagés.
              </p>
            )}
          </Card>
        );
      })}

      <Card title="Résultat prévisionnel de l'exercice (HT)"
        actions={<TotalBloc label="Résultat net prévu" valeur={euros(rn.total)} t={teinteBloc('resultat', couleurs)} />}>
        <div className="overflow-x-auto -mx-4 px-4" style={styleBloc(teinteBloc('resultat', couleurs))}>
          <table data-table="total:resultat" data-bloc="resultat" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left" style={{ color: '#5c5280' }}>
                <th className="min-w-56">Ligne</th>
                {moisList.map(m => <th key={m} className="text-right">{labelMois(m)}</th>)}
                <th className="text-right bg-[var(--bloc-total)]">Total</th>
              </tr>
            </thead>
            <tbody>
              {resultat.map(l => (
                <tr key={l.cle}
                  className={l.niveau === 'final' ? 'total-bloc' : l.niveau === 'agregat' ? 'font-semibold' : ''}
                  style={l.niveau === 'agregat' ? { backgroundColor: 'var(--bloc-tres-clair)' } : undefined}>
                  <td title={l.aide}>{l.label}</td>
                  {moisList.map(m => {
                    const v = l.parMois?.get(m) ?? 0;
                    return (
                      <td key={m} className="text-right tabular-nums"
                        style={l.signe && v ? { color: v > 0 ? '#38761d' : '#b7332e' } : undefined}>
                        {l.parMois ? (v ? euros0(v) : '·') : ''}
                      </td>
                    );
                  })}
                  <td className="text-right tabular-nums bg-[var(--bloc-total)] font-bold"
                    style={l.signe && l.total ? { color: l.total > 0 ? '#38761d' : '#b7332e' } : undefined}>
                    {euros(l.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs" style={{ color: '#9a92b5' }}>
        Ce tableau ne se saisit pas : il additionne les onglets Charges, Produits, Immobilisations
        et Stock de l'exercice choisi. Les tirages d'usine y figurent en charges, corrigés de la
        variation de stock : au bout du compte, seul le coût des exemplaires vendus pèse sur le
        résultat. Les dotations comprennent celles des immobilisations déjà au bilan et celles que
        déclencheraient les investissements prévus, sur cinq ans.
      </p>
    </div>
  );
}
