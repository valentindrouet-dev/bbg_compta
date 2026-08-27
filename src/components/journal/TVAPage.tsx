import { useMemo } from 'react';
import { useStore } from '../../store';
import { EXERCICES, labelMois, moisExercice } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { tableauTVA } from '../../utils/calc';
import { PageHeader, Card, StatCard } from '../ui';
import { useEtatVue } from '../../utils/etatVue';

/** Rouge = je dois à l'État ; vert = l'État me doit. */
const ROUGE = '#b7332e';
const VERT = '#38761d';

/** Le solde d'un mois, avec sa couleur et son sens en toutes lettres. */
function sensTVA(v: number): { couleur: string; sens: string } {
  if (v > 0) return { couleur: ROUGE, sens: 'à reverser à l\'État' };
  if (v < 0) return { couleur: VERT, sens: 'crédit de TVA, en ta faveur' };
  return { couleur: '#9a92b5', sens: 'équilibré' };
}

export function TVAPage() {
  const entries = useStore(s => s.entries);
  const [exercice, setExercice] = useEtatVue('tva.exercice', '2025-26',
    v => (EXERCICES as readonly string[]).includes(v));

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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="TVA collectée (exercice)" value={euros(tot.collectee)}
          sub="encaissée sur tes ventes, pour le compte de l'État" />
        <StatCard label="TVA déductible (exercice)" value={euros(tot.deductible)}
          sub="payée sur tes achats, récupérable" />
        <StatCard
          label={solde > 0 ? 'TVA à reverser à l\'État' : 'Crédit de TVA — l\'État te doit'}
          value={euros(Math.abs(solde))}
          tone={solde > 0 ? 'bad' : 'good'}
          sub={solde > 0 ? 'c\'est une dette' : 'c\'est une créance, remboursable ou imputable'}
        />
      </div>

      <div
        className="mb-5 px-3 py-2 rounded-md border text-sm"
        style={{ backgroundColor: 'var(--bbg-lavender)', borderColor: 'var(--bbg-border)', color: '#3f3268' }}
      >
        <b>Comment lire le signe.</b> Le solde vaut <i>TVA collectée − TVA déductible</i>.
        {' '}<span style={{ color: ROUGE, fontWeight: 700 }}>En rouge, un solde positif</span> : tu as
        encaissé plus de TVA que tu n'en as payé, la différence est <b>due à l'État</b>.
        {' '}<span style={{ color: VERT, fontWeight: 700 }}>En vert, un solde négatif</span> : tu as payé
        plus de TVA sur tes achats que tu n'en as collecté, c'est un <b>crédit de TVA</b> — l'État
        te le doit. Le total de {euros(Math.abs(solde))} affiché ici est{' '}
        <b style={{ color: solde > 0 ? ROUGE : VERT }}>
          {solde > 0 ? 'à reverser' : 'en ta faveur'}
        </b>.
      </div>

      <Card title="Détail mensuel">
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="tva" className="sheet text-sm border-collapse w-full">
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
                  <td className="text-right tabular-nums"
                    style={{ color: sensTVA(x.solde).couleur }}
                    title={`${euros(Math.abs(x.solde))} ${sensTVA(x.solde).sens}`}>
                    {euros(x.solde)}
                  </td>
                  <td className="text-right tabular-nums font-semibold"
                    style={{ color: sensTVA(x.cumul).couleur }}
                    title={`${euros(Math.abs(x.cumul))} ${sensTVA(x.cumul).sens}`}>
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
                <td className="text-right tabular-nums" colSpan={2}
                  style={{ color: sensTVA(solde).couleur }}>
                  {euros(solde)}
                  <span className="ml-1.5 font-normal text-xs">— {sensTVA(solde).sens}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-[#9a92b5] mt-2">
          * Solde du mois = TVA collectée − TVA déductible. Positif (rouge) : TVA due à l'État ;
          négatif (vert) : crédit de TVA, c'est l'État qui te doit. Le cumul se remet à zéro après
          chaque déclaration — il court ici sur tout l'exercice à titre indicatif.
        </p>
      </Card>
    </div>
  );
}
