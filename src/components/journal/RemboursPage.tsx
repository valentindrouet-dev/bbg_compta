import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { formatDateFR, labelMois } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { PageHeader, Card, StatCard, useSort, sortBy, ThSort } from '../ui';

export function RemboursPage() {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const [paiement, setPaiement] = useState('CB VAL');
  const { sort, toggle } = useSort({ key: 'date', dir: 'asc' });

  const list = useMemo(
    () => entries.filter(e => e.paiement === paiement && e.type !== 'produit'),
    [entries, paiement],
  );
  const rows = sortBy(list, sort, {
    date: e => e.date,
    fournisseur: e => e.fournisseur,
    description: e => e.description,
    categorie: e => e.categorie,
    ttc: e => e.ttc,
    ht: e => e.ht,
    type: e => e.type,
    mois: e => e.mois,
  });
  const totTTC = r2(list.reduce((s, e) => s + e.ttc, 0));
  const rembourses = useMemo(
    () => r2(entries.filter(e => e.type === 'produit' && e.categorie === 'remboursement').reduce((s, e) => s + e.ttc, 0)),
    [entries],
  );

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Remboursements Val"
        subtitle="Dépenses payées avec une carte personnelle, à rembourser par la société"
        actions={
          <select
            className="border border-[#c9c0e4] rounded-md px-2 py-1.5 text-sm bg-white"
            value={paiement}
            onChange={ev => setPaiement(ev.target.value)}
          >
            {refs.paiements.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label={`Total avancé (${paiement})`} value={euros(totTTC)} />
        <StatCard label="Remboursements encaissés (produits « remboursement »)" value={euros(rembourses)} />
        <StatCard label="Reste dû (indicatif)" value={euros(r2(totTTC - rembourses))}
          tone={totTTC - rembourses > 0 ? 'bad' : 'good'} />
      </div>

      <Card>
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="rembours" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <ThSort label="Date" k="date" sort={sort} onToggle={toggle} />
                <ThSort label="Mois" k="mois" sort={sort} onToggle={toggle} />
                <ThSort label="Fournisseur" k="fournisseur" sort={sort} onToggle={toggle} />
                <ThSort label="Description" k="description" sort={sort} onToggle={toggle} />
                <ThSort label="Catégorie" k="categorie" sort={sort} onToggle={toggle} />
                <ThSort label="Type" k="type" sort={sort} onToggle={toggle} />
                <ThSort label="TTC" k="ttc" sort={sort} onToggle={toggle} className="text-right" />
                <ThSort label="HT" k="ht" sort={sort} onToggle={toggle} className="text-right" />
                <th>Facture</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id} className="hover:bg-[#f4f1fb]">
                  <td>{formatDateFR(e.date)}</td>
                  <td className="text-[#6f6690]">{labelMois(e.mois)}</td>
                  <td>{e.fournisseur}</td>
                  <td>{e.description}</td>
                  <td>{e.categorie}</td>
                  <td className="text-[#6f6690]">{e.type}</td>
                  <td className="text-right tabular-nums font-medium">{euros(e.ttc)}</td>
                  <td className="text-right tabular-nums text-[#6f6690]">{euros(e.ht)}</td>
                  <td className="text-[#6f6690] max-w-44 truncate" title={e.facture}>{e.facture}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-[#efeafa]">
                <td colSpan={6}>Total ({list.length} écritures)</td>
                <td className="text-right tabular-nums">{euros(totTTC)}</td>
                <td className="text-right tabular-nums">{euros(r2(list.reduce((s, e) => s + e.ht, 0)))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
