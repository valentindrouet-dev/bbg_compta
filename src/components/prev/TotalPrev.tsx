/**
 * Le prévisionnel complet d'un exercice, d'un seul tenant et non modifiable.
 *
 * Tout ce qui a été saisi dans les autres onglets se retrouve ici, dans l'ordre
 * de la synthèse : produits, charges, personnel, immobilisations, stock, puis
 * le compte de résultat. On y lit l'année entière sans risquer de la changer.
 * Le calcul vit dans `totalPrevisionnel` : le PDF du prévisionnel lit le même.
 */
import { Fragment, useMemo } from 'react';
import { useStore } from '../../store';
import { labelMois } from '../../utils/dates';
import { euros, euros0 } from '../../utils/money';
import { couleurJeu } from '../../utils/jeux';
import { totalPrevisionnel } from '../../utils/totalPrev';
import { teinteBloc } from '../../utils/blocs';
import { Card, TotalBloc, styleBloc, BandeauJeu } from '../ui';
import { useBaseMontant, useVueSimplifiee } from '../../utils/reglagesVue';

export function TotalPrev({ exercice, moisList }: { exercice: string; moisList: string[] }) {
  const previsionnels = useStore(s => s.previsionnels);
  const stocks = useStore(s => s.stocks);
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const refs = useStore(s => s.referentiels);
  const couleurs = useStore(s => s.blocCouleurs);
  const [base] = useBaseMontant();
  const [simple] = useVueSimplifiee();

  // `moisList` est recalculé à chaque rendu par la page : on s'accroche à son
  // contenu, pas à sa référence.
  const cleMois = moisList.join('|');
  const { vues, resultat } = useMemo(
    () => totalPrevisionnel({
      exercice, moisList: cleMois.split('|'), previsionnels, stocks, entries, finances, refs, base,
    }),
    [exercice, cleMois, previsionnels, stocks, entries, finances, refs, base]);

  const rn = resultat.find(l => l.cle === 'rn')!;

  return (
    <div className="space-y-5">
      {vues.map(vue => {
        const t = teinteBloc(vue.bloc, couleurs);
        return (
          <Card key={vue.cle} title={vue.titre}
            actions={<TotalBloc label={`Total ${vue.titre.toLowerCase()}`} valeur={euros(vue.total)} t={t} />}>
            <div className="overflow-x-auto -mx-4 px-4" style={styleBloc(t)}>
              <table data-table={`total:${vue.cle}`} data-bloc={vue.bloc} className="sheet text-sm border-collapse w-full">
                <thead>
                  <tr className="text-left" style={{ color: '#5c5280' }}>
                    <th className="min-w-56">Ligne</th>
                    {moisList.map(m => <th key={m} className="text-right">{labelMois(m)}</th>)}
                    <th className="text-right bg-[var(--bloc-total)]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* D'abord les postes généraux, puis un bandeau par jeu —
                      le même découpage que dans les onglets de saisie. La
                      variation de stock reste visible en vue simplifiée. */}
                  {vue.lignes.filter(l => !simple || l.variation).map(l => l.variation ? (
                    <tr key={l.cle} style={{ fontStyle: 'italic' }}>
                      <td title={l.aide}>{l.libelle}</td>
                      {moisList.map((m, i) => {
                        const v = l.parMois[i];
                        return (
                          <td key={m} className="text-right tabular-nums"
                            style={v ? { color: v < 0 ? '#38761d' : '#b7332e' } : undefined}>
                            {v ? euros0(v) : '·'}
                          </td>
                        );
                      })}
                      <td className="text-right tabular-nums bg-[var(--bloc-total)] font-medium">
                        {euros(l.total)}
                      </td>
                    </tr>
                  ) : (
                    <tr key={l.cle}>
                      <td>{l.libelle}</td>
                      {moisList.map((m, i) => {
                        const v = l.parMois[i];
                        return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                      })}
                      <td className="text-right tabular-nums bg-[var(--bloc-total)] font-medium">{euros(l.total)}</td>
                    </tr>
                  ))}
                  {vue.groupes.map(g => (
                    <Fragment key={`jeu-${g.jeu}`}>
                      {/* Le bandeau porte toujours le total du jeu : ici il n'y a
                          pas de ligne de sous-total à masquer, et le priver de son
                          chiffre ne laisserait qu'un intertitre. */}
                      <BandeauJeu jeu={g.jeu} couleur={couleurJeu(g.jeu, refs)}
                        colSpan={moisList.length + 2}
                        droite={euros(g.total)} />
                      {(simple ? [] : g.lignes).map(l => (
                        <tr key={l.cle}>
                          <td style={{ paddingLeft: 22 }} title={l.aide}>{l.libelle}</td>
                          {moisList.map((m, i) => {
                            const v = l.parMois[i];
                            return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                          })}
                          <td className="text-right tabular-nums bg-[var(--bloc-total)] font-medium">{euros(l.total)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="total-bloc">
                    <td>TOTAL {vue.titre.replace(' — jeux', '').toUpperCase()}{vue.jeux ? ' — JEUX' : ''}</td>
                    {moisList.map((m, i) => {
                      const v = vue.piedParMois[i];
                      return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                    })}
                    <td className="text-right tabular-nums grand">{euros(vue.piedTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {vue.section === 'immos' && !vue.jeux && (
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
