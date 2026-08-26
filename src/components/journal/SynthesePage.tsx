import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { EXERCICES, labelMois } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { syntheseExercice, immoInfos, dotationDuMois } from '../../utils/calc';
import { PageHeader, Card } from '../ui';

export function SynthesePage() {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const [exercice, setExercice] = useState('2025-26');

  const syn = useMemo(
    () => syntheseExercice(entries, exercice, refs.categoriesJeux),
    [entries, exercice, refs.categoriesJeux],
  );
  const immos = useMemo(() => immoInfos(entries), [entries]);

  // Catégories affichées : celles du référentiel qui ont au moins une écriture, puis les autres observées
  const catsCharges = refs.categoriesDepenses.filter(c => syn.charges.has(c))
    .concat([...syn.charges.keys()].filter(c => !refs.categoriesDepenses.includes(c)));
  const catsJeux = refs.categoriesJeux.filter(c => syn.jeux.has(c));
  const catsProduits = refs.categoriesProduits.filter(c => syn.produits.has(c))
    .concat([...syn.produits.keys()].filter(c => !refs.categoriesProduits.includes(c)));

  const moisAvecDonnees = syn.moisList.filter(m =>
    (syn.totalTTCParMois.get(m) ?? 0) !== 0 || (syn.totalProduitsParMois.get(m) ?? 0) !== 0);
  const nbMois = Math.max(1, moisAvecDonnees.length);

  const totalCat = (map: Map<string, Map<string, number>>, cat: string) =>
    r2([...(map.get(cat)?.values() ?? [])].reduce((s, v) => s + v, 0));

  return (
    <div className="p-6 max-w-full">
      <PageHeader
        title="Synthèse annuelle"
        subtitle="Charges, produits et dotations par mois — recalculés en direct depuis le journal"
        actions={
          <select
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            value={exercice}
            onChange={ev => setExercice(ev.target.value)}
          >
            {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
          </select>
        }
      />

      <div className="space-y-6">
        <Card title="Charges par catégorie (HT)">
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="sheet text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left">Mois</th>
                  {catsCharges.map(c => <th key={c} className="text-right max-w-28 whitespace-normal!">{c}</th>)}
                  <th className="text-right bg-yellow-50">Total HT</th>
                  <th className="text-right bg-yellow-50">Immo HT</th>
                  <th className="text-right bg-yellow-50">Total TTC*</th>
                </tr>
              </thead>
              <tbody>
                {syn.moisList.map(m => (
                  <tr key={m}>
                    <td className="font-medium">{labelMois(m)}</td>
                    {catsCharges.map(c => {
                      const v = syn.charges.get(c)?.get(m) ?? 0;
                      return <td key={c} className="text-right tabular-nums">{v ? euros(r2(v)) : '·'}</td>;
                    })}
                    <td className="text-right tabular-nums font-semibold bg-yellow-50">{euros(r2(syn.totalChargesParMois.get(m) ?? 0))}</td>
                    <td className="text-right tabular-nums bg-yellow-50">{(syn.immoParMois.get(m) ?? 0) ? euros(r2(syn.immoParMois.get(m)!)) : '·'}</td>
                    <td className="text-right tabular-nums bg-yellow-50">{euros(r2(syn.totalTTCParMois.get(m) ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-gray-50">
                  <td>Total</td>
                  {catsCharges.map(c => <td key={c} className="text-right tabular-nums">{euros(totalCat(syn.charges, c))}</td>)}
                  <td className="text-right tabular-nums bg-yellow-100">
                    {euros(r2([...syn.totalChargesParMois.values()].reduce((s, v) => s + v, 0)))}
                  </td>
                  <td className="text-right tabular-nums bg-yellow-100">
                    {euros(r2([...syn.immoParMois.values()].reduce((s, v) => s + v, 0)))}
                  </td>
                  <td className="text-right tabular-nums bg-yellow-100">
                    {euros(r2([...syn.totalTTCParMois.values()].reduce((s, v) => s + v, 0)))}
                  </td>
                </tr>
                <tr className="text-gray-500">
                  <td>/mois ({nbMois})</td>
                  {catsCharges.map(c => <td key={c} className="text-right tabular-nums">{euros(r2(totalCat(syn.charges, c) / nbMois))}</td>)}
                  <td className="text-right tabular-nums">
                    {euros(r2([...syn.totalChargesParMois.values()].reduce((s, v) => s + v, 0) / nbMois))}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">* Total TTC = charges + immobilisations du mois (hors dépenses jeux et produits).</p>
        </Card>

        {catsJeux.length > 0 && (
          <Card title="Dépenses Jeux (HT)">
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="sheet text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left">Mois</th>
                    {catsJeux.map(c => <th key={c} className="text-right">{c}</th>)}
                    <th className="text-right bg-yellow-50">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {syn.moisList.filter(m => (syn.totalJeuxParMois.get(m) ?? 0) !== 0).map(m => (
                    <tr key={m}>
                      <td className="font-medium">{labelMois(m)}</td>
                      {catsJeux.map(c => {
                        const v = syn.jeux.get(c)?.get(m) ?? 0;
                        return <td key={c} className="text-right tabular-nums">{v ? euros(r2(v)) : '·'}</td>;
                      })}
                      <td className="text-right tabular-nums font-semibold bg-yellow-50">{euros(r2(syn.totalJeuxParMois.get(m) ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold bg-gray-50">
                    <td>Total</td>
                    {catsJeux.map(c => <td key={c} className="text-right tabular-nums">{euros(totalCat(syn.jeux, c))}</td>)}
                    <td className="text-right tabular-nums bg-yellow-100">
                      {euros(r2([...syn.totalJeuxParMois.values()].reduce((s, v) => s + v, 0)))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        <Card title="Produits par catégorie (HT)">
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="sheet text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left">Mois</th>
                  {catsProduits.map(c => <th key={c} className="text-right">{c}</th>)}
                  <th className="text-right bg-yellow-50">Total HT</th>
                  <th className="text-right bg-yellow-50">Total TTC</th>
                </tr>
              </thead>
              <tbody>
                {syn.moisList.filter(m => (syn.totalProduitsParMois.get(m) ?? 0) !== 0).map(m => (
                  <tr key={m}>
                    <td className="font-medium">{labelMois(m)}</td>
                    {catsProduits.map(c => {
                      const v = syn.produits.get(c)?.get(m) ?? 0;
                      return <td key={c} className="text-right tabular-nums">{v ? euros(r2(v)) : '·'}</td>;
                    })}
                    <td className="text-right tabular-nums font-semibold bg-yellow-50">{euros(r2(syn.totalProduitsParMois.get(m) ?? 0))}</td>
                    <td className="text-right tabular-nums bg-yellow-50">{euros(r2(syn.totalProduitsTTCParMois.get(m) ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-gray-50">
                  <td>Total</td>
                  {catsProduits.map(c => <td key={c} className="text-right tabular-nums">{euros(totalCat(syn.produits, c))}</td>)}
                  <td className="text-right tabular-nums bg-yellow-100">
                    {euros(r2([...syn.totalProduitsParMois.values()].reduce((s, v) => s + v, 0)))}
                  </td>
                  <td className="text-right tabular-nums bg-yellow-100">
                    {euros(r2([...syn.totalProduitsTTCParMois.values()].reduce((s, v) => s + v, 0)))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card title="Dotations aux amortissements (immobilisations)">
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="sheet text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left">Mois</th>
                  <th className="text-right">Dotation mensuelle</th>
                  <th className="text-right">Cumul exercice</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let cumul = 0;
                  return syn.moisList.map(m => {
                    const dot = dotationDuMois(immos, m);
                    cumul = r2(cumul + dot);
                    return (
                      <tr key={m}>
                        <td className="font-medium">{labelMois(m)}</td>
                        <td className="text-right tabular-nums">{dot ? euros(dot) : '·'}</td>
                        <td className="text-right tabular-nums">{euros(cumul)}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
