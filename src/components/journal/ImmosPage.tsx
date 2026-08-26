import { useMemo } from 'react';
import { useStore } from '../../store';
import { formatDateFR, labelMois, todayISO } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { immoInfos } from '../../utils/calc';
import { PageHeader, Card, useSort, sortBy, ThSort } from '../ui';

export function ImmosPage() {
  const entries = useStore(s => s.entries);
  const update = useStore(s => s.updateEntry);
  const { sort, toggle } = useSort({ key: 'date', dir: 'asc' });

  const infos = useMemo(() => immoInfos(entries), [entries]);
  const today = todayISO();

  const rows = sortBy(infos, sort, {
    date: i => i.entry.date,
    fournisseur: i => i.entry.fournisseur,
    description: i => i.entry.description,
    categorie: i => i.entry.categorie,
    ttc: i => i.entry.ttc,
    ht: i => i.entry.ht,
    duree: i => i.duree,
    dotAn: i => i.dotationAn,
    dotMois: i => i.dotationMois,
    vnc: i => i.vnc(today),
    fin: i => i.fin,
  });

  const tot = {
    ttc: r2(infos.reduce((s, i) => s + i.entry.ttc, 0)),
    tva: r2(infos.reduce((s, i) => s + i.entry.tva, 0)),
    ht: r2(infos.reduce((s, i) => s + i.entry.ht, 0)),
    dotAn: r2(infos.reduce((s, i) => s + i.dotationAn, 0)),
    dotMois: r2(infos.reduce((s, i) => s + i.dotationMois, 0)),
    vnc: r2(infos.reduce((s, i) => s + i.vnc(today), 0)),
  };

  return (
    <div className="p-6 max-w-[1400px]">
      <PageHeader
        title="Immobilisations & dotations"
        subtitle="Alimenté automatiquement par les écritures de type « immo » du journal — amortissement linéaire"
      />
      <Card>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-gray-600">
                <ThSort label="Date" k="date" sort={sort} onToggle={toggle} />
                <th>Mois compta</th>
                <ThSort label="Fournisseur" k="fournisseur" sort={sort} onToggle={toggle} />
                <ThSort label="Description" k="description" sort={sort} onToggle={toggle} />
                <ThSort label="Catégorie" k="categorie" sort={sort} onToggle={toggle} />
                <ThSort label="TTC" k="ttc" sort={sort} onToggle={toggle} className="text-right" />
                <th className="text-right">TVA</th>
                <ThSort label="HT" k="ht" sort={sort} onToggle={toggle} className="text-right" />
                <ThSort label="Durée" k="duree" sort={sort} onToggle={toggle} />
                <ThSort label="Dot. /an" k="dotAn" sort={sort} onToggle={toggle} className="text-right" />
                <ThSort label="Dot. /mois" k="dotMois" sort={sort} onToggle={toggle} className="text-right" />
                <ThSort label="VNC auj." k="vnc" sort={sort} onToggle={toggle} className="text-right" />
                <ThSort label="Fin" k="fin" sort={sort} onToggle={toggle} />
                <th>Compta</th>
                <th>Facture</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(i => (
                <tr key={i.entry.id} className="hover:bg-yellow-50/40">
                  <td>{formatDateFR(i.entry.date)}</td>
                  <td className="text-gray-500">{labelMois(i.entry.mois)}</td>
                  <td>{i.entry.fournisseur}</td>
                  <td>{i.entry.description}</td>
                  <td>{i.entry.categorie}</td>
                  <td className="text-right tabular-nums">{euros(i.entry.ttc)}</td>
                  <td className="text-right tabular-nums text-gray-500">{euros(i.entry.tva)}</td>
                  <td className="text-right tabular-nums font-medium">{euros(i.entry.ht)}</td>
                  <td>
                    <select
                      className="border border-gray-200 rounded px-1 py-0.5 text-sm bg-white"
                      value={i.duree}
                      onChange={ev => update(i.entry.id, { immoDureeAns: Number(ev.target.value) })}
                    >
                      {[3, 5, 10].map(d => <option key={d} value={d}>{d} ans</option>)}
                    </select>
                  </td>
                  <td className="text-right tabular-nums">{euros(i.dotationAn)}</td>
                  <td className="text-right tabular-nums">{euros(i.dotationMois)}</td>
                  <td className="text-right tabular-nums">{euros(i.vnc(today))}</td>
                  <td>{formatDateFR(i.fin)}</td>
                  <td className="text-gray-500 max-w-40 truncate" title={i.entry.compta}>{i.entry.compta}</td>
                  <td className="text-gray-500 max-w-40 truncate" title={i.entry.facture}>{i.entry.facture}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-yellow-50">
                <td colSpan={5}>Totaux ({infos.length} immobilisations)</td>
                <td className="text-right tabular-nums">{euros(tot.ttc)}</td>
                <td className="text-right tabular-nums">{euros(tot.tva)}</td>
                <td className="text-right tabular-nums">{euros(tot.ht)}</td>
                <td></td>
                <td className="text-right tabular-nums">{euros(tot.dotAn)}</td>
                <td className="text-right tabular-nums">{euros(tot.dotMois)}</td>
                <td className="text-right tabular-nums">{euros(tot.vnc)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Pour ajouter une immobilisation : saisis la dépense dans le Journal du mois avec le type « immo ».
          La VNC (valeur nette comptable) est calculée au prorata des mois écoulés.
        </p>
      </Card>
    </div>
  );
}
