/**
 * Le prévisionnel complet d'un exercice, d'un seul tenant et non modifiable.
 *
 * Tout ce qui a été saisi dans les autres onglets se retrouve ici, dans l'ordre
 * de la synthèse : produits, charges, personnel, immobilisations, stock, puis
 * le compte de résultat. On y lit l'année entière sans risquer de la changer.
 */
import { useMemo } from 'react';
import { useStore } from '../../store';
import type { PrevLigne, PrevSection } from '../../types';
import { labelMois } from '../../utils/dates';
import { euros, euros0, r2 } from '../../utils/money';
import { immoInfos } from '../../utils/calc';
import { couleurJeu, encreSur } from '../../utils/jeux';
import { ordreAffichage, valeursDe, SECTIONS } from '../../utils/previsionnel';
import { apportStock } from '../../utils/stock';
import { resultatPrevisionnel, montantsSection, sommeMap } from '../../utils/prevCalc';
import { teinteBloc, type BlocCle } from '../../utils/blocs';
import { Card, TotalBloc, styleBloc } from '../ui';

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

  const lignes = useMemo(
    () => ordreAffichage(previsionnels[exercice] ?? [], refs), [previsionnels, exercice, refs]);
  const stock = useMemo(() => apportStock(stocks, exercice, jeux), [stocks, exercice, jeux]);
  const immos = useMemo(() => immoInfos(entries, refs), [entries, refs]);
  const resultat = useMemo(
    () => resultatPrevisionnel({ lignes, moisList, immos, finances, stock }),
    [lignes, moisList, immos, finances, stock]);

  const rn = resultat.find(l => l.cle === 'rn')!;

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
            ? [...stock.fabricationParJeuEtMois.entries()].map(([jeu, parMois]) =>
              [jeu, 'Tirages payés à l’usine (stock)', parMois] as [string, string, Map<string, number>])
            : [];
        if (!lignesBloc.length && !duStock.length) return null;

        const t = teinteBloc(bloc.cle as BlocCle, couleurs);
        const parMois = montantsSection(lignes, moisList, bloc.cle);
        const apport = bloc.cle === 'produits' ? stock.caParMois
          : bloc.cle === 'charges' ? stock.fabricationParMois : undefined;
        const totalBloc = r2(sommeMap(parMois) + (apport ? sommeMap(apport) : 0));

        const valeurLigne = (l: PrevLigne, i: number) => valeursDe(l, lignes)[i] ?? 0;

        return (
          <Card key={bloc.cle} title={bloc.titre}
            actions={<TotalBloc label={`Total ${bloc.titre.toLowerCase()}`} valeur={euros(totalBloc)} t={t} />}>
            <div className="overflow-x-auto -mx-4 px-4" style={styleBloc(t)}>
              <table data-table={`total:${bloc.cle}`} className="sheet text-sm border-collapse w-full">
                <thead>
                  <tr className="text-left" style={{ color: '#5c5280' }}>
                    <th className="min-w-56">Ligne</th>
                    {moisList.map(m => <th key={m} className="text-right">{labelMois(m)}</th>)}
                    <th className="text-right bg-[var(--bloc-total)]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lignesBloc.map(l => {
                    const total = r2(moisList.reduce((s, _m, i) => s + valeurLigne(l, i), 0));
                    if (!total) return null;
                    return (
                      <tr key={l.id}>
                        <td>
                          {l.jeu && (
                            <span className="mr-1.5 px-1.5 py-0.5 rounded text-[11px] font-bold"
                              style={{ backgroundColor: couleurJeu(l.jeu, refs), color: encreSur(couleurJeu(l.jeu, refs)) }}>
                              {l.jeu}
                            </span>
                          )}
                          {l.categorie}
                        </td>
                        {moisList.map((m, i) => {
                          const v = valeurLigne(l, i);
                          return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                        })}
                        <td className="text-right tabular-nums bg-[var(--bloc-total)] font-medium">{euros(total)}</td>
                      </tr>
                    );
                  })}
                  {duStock.map(([jeu, libelle, parMoisJeu]) => {
                    const total = r2([...parMoisJeu.values()].reduce((s, v) => s + v, 0));
                    return (
                      <tr key={`stock-${jeu}-${libelle}`} style={{ fontStyle: 'italic' }}>
                        <td>
                          <span className="mr-1.5 px-1.5 py-0.5 rounded text-[11px] font-bold"
                            style={{ backgroundColor: couleurJeu(jeu, refs), color: encreSur(couleurJeu(jeu, refs)) }}>
                            {jeu}
                          </span>
                          {libelle}
                        </td>
                        {moisList.map(m => {
                          const v = parMoisJeu.get(m) ?? 0;
                          return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                        })}
                        <td className="text-right tabular-nums bg-[var(--bloc-total)] font-medium">{euros(total)}</td>
                      </tr>
                    );
                  })}
                  {bloc.cle === 'charges' && sommeMap(stock.variationParMois) !== 0 && (
                    <tr style={{ fontStyle: 'italic' }}>
                      <td title="Elle neutralise le coût des exemplaires encore en carton : seul le coût de ce qui est vendu pèse sur le résultat.">
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
          </Card>
        );
      })}

      <Card title="Résultat prévisionnel de l'exercice (HT)"
        actions={<TotalBloc label="Résultat net prévu" valeur={euros(rn.total)} t={teinteBloc('resultat', couleurs)} />}>
        <div className="overflow-x-auto -mx-4 px-4" style={styleBloc(teinteBloc('resultat', couleurs))}>
          <table data-table="total:resultat" className="sheet text-sm border-collapse w-full">
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
