import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { EXERCICES, labelMois, moisExercice } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { tableauTVA } from '../../utils/calc';
import { PageHeader, Card, StatCard } from '../ui';

export function TVAPage() {
  const entries = useStore(s => s.entries);
  const [exercice, setExercice] = useState('2025-26');

  const moisList = moisExercice(exercice);
  const rows = useMemo(() => tableauTVA(entries, moisList), [entries, moisList]);

  const tot = {
    collectee: r2(rows.reduce((s, x) => s + x.tvaCollectee, 0)),
    deductible: r2(rows.reduce((s, x) => s + x.tvaDeductible, 0)),
  };
  const solde = r2(tot.collectee - tot.deductible);

  return (
    <div className="p-4 w-full max-w-[1300px]">
      <PageHeader
        title="TVA"
        subtitle="TVA collectée sur les produits, déductible sur les dépenses — calculée écriture par écriture"
        actions={
          <select
            className="border border-[#c9c0e4] rounded-md px-2 py-1.5 text-sm bg-white"
            value={exercice}
            onChange={ev => setExercice(ev.target.value)}
          >
            {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="TVA collectée (exercice)" value={euros(tot.collectee)} />
        <StatCard label="TVA déductible (exercice)" value={euros(tot.deductible)} />
        <StatCard
          label={solde >= 0 ? 'TVA à reverser' : 'Crédit de TVA'}
          value={euros(Math.abs(solde))}
          tone={solde >= 0 ? 'bad' : 'good'}
        />
      </div>

      <Card title="Détail mensuel">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th>Mois</th>
                <th className="text-right">CA TTC</th>
                <th className="text-right">CA HT</th>
                <th className="text-right">TVA collectée</th>
                <th className="text-right">Dépenses TTC</th>
                <th className="text-right">Dépenses HT</th>
                <th className="text-right">TVA déductible</th>
                <th className="text-right">Solde du mois*</th>
                <th className="text-right">Cumul</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(x => (
                <tr key={x.mois}>
                  <td className="font-medium">{labelMois(x.mois)}</td>
                  <td className="text-right tabular-nums">{x.caTTC ? euros(x.caTTC) : '·'}</td>
                  <td className="text-right tabular-nums">{x.caHT ? euros(x.caHT) : '·'}</td>
                  <td className="text-right tabular-nums">{x.tvaCollectee ? euros(x.tvaCollectee) : '·'}</td>
                  <td className="text-right tabular-nums">{x.depTTC ? euros(x.depTTC) : '·'}</td>
                  <td className="text-right tabular-nums">{x.depHT ? euros(x.depHT) : '·'}</td>
                  <td className="text-right tabular-nums">{x.tvaDeductible ? euros(x.tvaDeductible) : '·'}</td>
                  <td className={`text-right tabular-nums ${x.solde > 0 ? 'text-[#b7332e]' : 'text-[#38761d]'}`}>
                    {euros(x.solde)}
                  </td>
                  <td className={`text-right tabular-nums font-semibold ${x.cumul > 0 ? 'text-[#b7332e]' : 'text-[#38761d]'}`}>
                    {euros(x.cumul)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-[#efeafa]">
                <td>Total exercice</td>
                <td className="text-right tabular-nums">{euros(r2(rows.reduce((s, x) => s + x.caTTC, 0)))}</td>
                <td className="text-right tabular-nums">{euros(r2(rows.reduce((s, x) => s + x.caHT, 0)))}</td>
                <td className="text-right tabular-nums">{euros(tot.collectee)}</td>
                <td className="text-right tabular-nums">{euros(r2(rows.reduce((s, x) => s + x.depTTC, 0)))}</td>
                <td className="text-right tabular-nums">{euros(r2(rows.reduce((s, x) => s + x.depHT, 0)))}</td>
                <td className="text-right tabular-nums">{euros(tot.deductible)}</td>
                <td className="text-right tabular-nums" colSpan={2}>{euros(solde)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-[#9a92b5] mt-2">
          * Solde du mois = TVA collectée − TVA déductible. Positif (rouge) : TVA due à l'État ;
          négatif (vert) : crédit de TVA. Le cumul se remet à zéro après chaque déclaration —
          il court ici sur tout l'exercice à titre indicatif.
        </p>
      </Card>
    </div>
  );
}
