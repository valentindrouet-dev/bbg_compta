import { Fragment, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { EXERCICES, labelMois } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { syntheseExercice, immoInfos, dotationDuMois } from '../../utils/calc';
import { PageHeader, Card } from '../ui';

type Bloc = 'charges' | 'jeux' | 'produits';

export function SynthesePage() {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const [exercice, setExercice] = useState('2025-26');

  const syn = useMemo(
    () => syntheseExercice(entries, exercice, refs.categoriesJeux),
    [entries, exercice, refs.categoriesJeux],
  );
  const immos = useMemo(() => immoInfos(entries), [entries]);
  const meta = refs.categoriesMeta ?? {};
  const groupes = refs.groupes ?? [];

  // Catégories présentes dans l'exercice, dans l'ordre du référentiel
  const catsDe = (source: Map<string, Map<string, number>>, ref: string[]) =>
    ref.filter(c => source.has(c)).concat([...source.keys()].filter(c => !ref.includes(c)));

  const blocs: { cle: Bloc; titre: string; cats: string[]; data: Map<string, Map<string, number>>;
    totaux: Map<string, number>; couleur: string; entete: string; }[] = [
    {
      cle: 'charges', titre: 'Charges par catégorie (HT)',
      cats: catsDe(syn.charges, refs.categoriesDepenses), data: syn.charges,
      totaux: syn.totalChargesParMois, couleur: 'var(--bbg-orange-light)', entete: 'var(--bbg-orange)',
    },
    {
      cle: 'jeux', titre: 'Dépenses Jeux (HT)',
      cats: catsDe(syn.jeux, refs.categoriesJeux), data: syn.jeux,
      totaux: syn.totalJeuxParMois, couleur: 'var(--bbg-yellow-light)', entete: 'var(--bbg-yellow)',
    },
    {
      cle: 'produits', titre: 'Produits par catégorie (HT)',
      cats: catsDe(syn.produits, refs.categoriesProduits), data: syn.produits,
      totaux: syn.totalProduitsParMois, couleur: 'var(--bbg-green-light)', entete: 'var(--bbg-green)',
    },
  ];

  const moisAvecDonnees = syn.moisList.filter(m =>
    (syn.totalTTCParMois.get(m) ?? 0) !== 0 || (syn.totalProduitsParMois.get(m) ?? 0) !== 0);
  const nbMois = Math.max(1, moisAvecDonnees.length);

  const totalLigne = (data: Map<string, Map<string, number>>, cat: string) =>
    r2([...(data.get(cat)?.values() ?? [])].reduce((s, v) => s + v, 0));

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Synthèse annuelle"
        subtitle="Catégories en lignes, mois en colonnes — recalculé en direct depuis le journal"
        actions={
          <select
            className="border rounded-md px-2 py-1.5 text-sm bg-white font-medium"
            style={{ borderColor: 'var(--bbg-border)', color: 'var(--bbg-purple-darker)' }}
            value={exercice}
            onChange={ev => setExercice(ev.target.value)}
          >
            {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
          </select>
        }
      />

      <div className="space-y-5">
        {blocs.filter(b => b.cats.length > 0).map(bloc => {
          // Répartition des catégories par groupe, dans l'ordre défini en paramètres.
          const parGroupe = new Map<string, string[]>();
          for (const c of bloc.cats) {
            const g = meta[c]?.groupe ?? '';
            if (!parGroupe.has(g)) parGroupe.set(g, []);
            parGroupe.get(g)!.push(c);
          }
          const ordreGroupes = [...groupes.filter(g => parGroupe.has(g)), ...(parGroupe.has('') ? [''] : [])];
          const avecGroupes = ordreGroupes.length > 1 || (ordreGroupes.length === 1 && ordreGroupes[0] !== '');

          return (
            <Card key={bloc.cle} title={bloc.titre}>
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="sheet text-xs" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th className="text-left" style={{ minWidth: 230 }}>Catégorie</th>
                      {syn.moisList.map(m => (
                        <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>
                      ))}
                      <th className="num" style={{ minWidth: 96, backgroundColor: bloc.entete, color: '#3f3268' }}>Total</th>
                      <th className="num" style={{ minWidth: 84, backgroundColor: bloc.entete, color: '#3f3268' }}>/ mois</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordreGroupes.map(g => (
                      <Fragment key={`grp-${g}`}>
                        {avecGroupes && (
                          <tr className="band-soft">
                            <td colSpan={syn.moisList.length + 3} className="py-1">
                              {g || '— sans groupe —'}
                            </td>
                          </tr>
                        )}
                        {parGroupe.get(g)!.map(cat => {
                          const tot = totalLigne(bloc.data, cat);
                          return (
                            <tr key={cat}>
                              <td>
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                    style={{ backgroundColor: meta[cat]?.couleur || bloc.couleur }}
                                  />
                                  {cat}
                                </span>
                              </td>
                              {syn.moisList.map(m => {
                                const v = bloc.data.get(cat)?.get(m) ?? 0;
                                return <td key={m} className="text-right tabular-nums">{v ? euros(r2(v)) : '·'}</td>;
                              })}
                              <td className="text-right tabular-nums font-semibold" style={{ backgroundColor: bloc.couleur }}>
                                {euros(tot)}
                              </td>
                              <td className="text-right tabular-nums" style={{ backgroundColor: bloc.couleur, color: '#5c5280' }}>
                                {euros(r2(tot / nbMois))}
                              </td>
                            </tr>
                          );
                        })}
                        {avecGroupes && parGroupe.get(g)!.length > 1 && (
                          <tr style={{ fontStyle: 'italic' }}>
                            <td style={{ color: '#6f6690' }}>Sous-total {g || 'sans groupe'}</td>
                            {syn.moisList.map(m => {
                              const v = parGroupe.get(g)!.reduce((s, c) => s + (bloc.data.get(c)?.get(m) ?? 0), 0);
                              return <td key={m} className="text-right tabular-nums" style={{ color: '#6f6690' }}>{v ? euros(r2(v)) : '·'}</td>;
                            })}
                            <td className="text-right tabular-nums" style={{ backgroundColor: bloc.couleur, color: '#5c5280' }}>
                              {euros(r2(parGroupe.get(g)!.reduce((s, c) => s + totalLigne(bloc.data, c), 0)))}
                            </td>
                            <td style={{ backgroundColor: bloc.couleur }}></td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {bloc.cle === 'charges' && (
                      <tr>
                        <td style={{ color: '#6f6690', fontStyle: 'italic' }}>Immobilisations (HT)</td>
                        {syn.moisList.map(m => {
                          const v = syn.immoParMois.get(m) ?? 0;
                          return <td key={m} className="text-right tabular-nums" style={{ color: '#6f6690' }}>{v ? euros(r2(v)) : '·'}</td>;
                        })}
                        <td className="text-right tabular-nums" style={{ backgroundColor: bloc.couleur, color: '#5c5280' }}>
                          {euros(r2([...syn.immoParMois.values()].reduce((s, v) => s + v, 0)))}
                        </td>
                        <td style={{ backgroundColor: bloc.couleur }}></td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total {bloc.cle === 'produits' ? 'produits' : bloc.cle === 'jeux' ? 'jeux' : 'charges'} (HT)</td>
                      {syn.moisList.map(m => (
                        <td key={m} className="text-right tabular-nums">{euros(r2(bloc.totaux.get(m) ?? 0))}</td>
                      ))}
                      <td className="text-right tabular-nums">
                        {euros(r2([...bloc.totaux.values()].reduce((s, v) => s + v, 0)))}
                      </td>
                      <td className="text-right tabular-nums">
                        {euros(r2([...bloc.totaux.values()].reduce((s, v) => s + v, 0) / nbMois))}
                      </td>
                    </tr>
                    {bloc.cle === 'charges' && (
                      <tr>
                        <td>Total dépenses (TTC)</td>
                        {syn.moisList.map(m => (
                          <td key={m} className="text-right tabular-nums">{euros(r2(syn.totalTTCParMois.get(m) ?? 0))}</td>
                        ))}
                        <td className="text-right tabular-nums">
                          {euros(r2([...syn.totalTTCParMois.values()].reduce((s, v) => s + v, 0)))}
                        </td>
                        <td></td>
                      </tr>
                    )}
                    {bloc.cle === 'produits' && (
                      <tr>
                        <td>Total produits (TTC)</td>
                        {syn.moisList.map(m => (
                          <td key={m} className="text-right tabular-nums">{euros(r2(syn.totalProduitsTTCParMois.get(m) ?? 0))}</td>
                        ))}
                        <td className="text-right tabular-nums">
                          {euros(r2([...syn.totalProduitsTTCParMois.values()].reduce((s, v) => s + v, 0)))}
                        </td>
                        <td></td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
              {bloc.cle === 'charges' && (
                <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
                  « / mois » = moyenne sur les {nbMois} mois qui portent des écritures.
                  Les couleurs et les groupes se règlent dans l'onglet Catégories.
                </p>
              )}
            </Card>
          );
        })}

        <Card title="Dotations aux amortissements">
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="sheet text-xs" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th className="text-left" style={{ minWidth: 230 }}>Dotations</th>
                  {syn.moisList.map(m => <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>)}
                  <th className="num" style={{ minWidth: 96 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Dotation du mois</td>
                  {syn.moisList.map(m => {
                    const d = dotationDuMois(immos, m);
                    return <td key={m} className="text-right tabular-nums">{d ? euros(d) : '·'}</td>;
                  })}
                  <td className="text-right tabular-nums font-semibold">
                    {euros(r2(syn.moisList.reduce((s, m) => s + dotationDuMois(immos, m), 0)))}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: '#6f6690' }}>Cumul sur l'exercice</td>
                  {(() => {
                    let cumul = 0;
                    return syn.moisList.map(m => {
                      cumul = r2(cumul + dotationDuMois(immos, m));
                      return <td key={m} className="text-right tabular-nums" style={{ color: '#6f6690' }}>{euros(cumul)}</td>;
                    });
                  })()}
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
