import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import type { FinanceEntry } from '../../types';
import { labelMois, formatDateFR, moisCourant, todayISO } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { tableauTreso, moisTresorerie } from '../../utils/calc';
import { PageHeader, Card, Btn, MoneyInput, StatCard } from '../ui';

const FINANCE_TYPES: { value: FinanceEntry['type']; label: string }[] = [
  { value: 'capital', label: 'Capital social' },
  { value: 'cca', label: "Compte courant d'associé" },
  { value: 'placement', label: 'Placement' },
  { value: 'produit_financier', label: 'Produit financier' },
  { value: 'autre', label: 'Autre' },
];

export function TresoPage() {
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const addFinance = useStore(s => s.addFinance);
  const updateFinance = useStore(s => s.updateFinance);
  const removeFinance = useStore(s => s.removeFinance);

  const moisList = useMemo(
    () => moisTresorerie(entries, finances, moisCourant()),
    [entries, finances],
  );

  const rows = useMemo(() => tableauTreso(entries, finances, moisList), [entries, finances, moisList]);
  const dernier = rows[rows.length - 1];
  const totalPlace = r2(-finances.filter(f => f.type === 'placement').reduce((s, f) => s + f.montant, 0));

  const [showFinances, setShowFinances] = useState(false);

  return (
    <div className="p-4 w-full max-w-[1300px]">
      <PageHeader
        title="Trésorerie"
        subtitle="Encaissements et décaissements TTC, mouvements financiers inclus — calculés depuis le journal"
        actions={<Btn onClick={() => setShowFinances(v => !v)}>{showFinances ? 'Masquer' : 'Mouvements financiers'}</Btn>}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="Solde actuel (cumulé)" value={euros(dernier?.soldeCumule ?? 0)}
          tone={(dernier?.soldeCumule ?? 0) >= 0 ? 'good' : 'bad'} />
        <StatCard label="Dont placé (comptes à terme)" value={euros(totalPlace)} tone="accent"
          sub="modifiable dans les mouvements financiers" />
        <StatCard label="Disponible + placé" value={euros(r2((dernier?.soldeCumule ?? 0) + totalPlace))} />
      </div>

      {showFinances && (
        <Card
          title="Mouvements financiers (capital, CCA, placements, intérêts…)"
          className="mb-6"
          actions={
            <Btn variant="primary" onClick={() => addFinance({ date: todayISO(), label: '', type: 'autre', montant: 0 })}>
              <span className="inline-flex items-center gap-1"><Plus size={14} /> Ajouter</span>
            </Btn>
          }
        >
          <table className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th>Date</th><th>Libellé</th><th>Type</th>
                <th className="text-right">Montant (+ entrée / − sortie)</th><th></th>
              </tr>
            </thead>
            <tbody>
              {[...finances].sort((a, b) => a.date.localeCompare(b.date)).map(f => (
                <tr key={f.id} className="group">
                  <td>
                    <input type="date" className="border border-[#ddd6ef] rounded px-1 py-0.5 text-sm"
                      value={f.date} onChange={ev => ev.target.value && updateFinance(f.id, { date: ev.target.value })} />
                  </td>
                  <td>
                    <input className="border border-[#ddd6ef] rounded px-1.5 py-1 text-sm w-72"
                      defaultValue={f.label} onBlur={ev => updateFinance(f.id, { label: ev.target.value })} />
                  </td>
                  <td>
                    <select className="border border-[#ddd6ef] rounded px-1 py-1 text-sm bg-white"
                      value={f.type} onChange={ev => updateFinance(f.id, { type: ev.target.value as FinanceEntry['type'] })}>
                      {FINANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="text-right">
                    <MoneyInput value={f.montant} onCommit={v => updateFinance(f.id, { montant: v ?? 0 })} className="w-32" />
                  </td>
                  <td>
                    <button className="text-[#d98b86] hover:text-[#b7332e] opacity-0 group-hover:opacity-100"
                      onClick={() => { if (confirm(`Supprimer « ${f.label} » ?`)) removeFinance(f.id); }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Trésorerie mensuelle">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th>Mois</th>
                <th className="text-right">Solde initial</th>
                <th className="text-right">Encaissements</th>
                <th className="text-right">Décaissements</th>
                <th className="text-right">Solde mensuel</th>
                <th className="text-right">Solde cumulé</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.mois} className={row.mois === moisCourant() ? 'bg-[#efeafa]' : ''}>
                  <td className="font-medium">{labelMois(row.mois)}</td>
                  <td className="text-right tabular-nums text-[#6f6690]">{euros(row.soldeInitial)}</td>
                  <td className="text-right tabular-nums text-[#38761d]">{row.encaissements ? euros(row.encaissements) : '·'}</td>
                  <td className="text-right tabular-nums text-[#b7332e]">{row.decaissements ? '−' + euros(row.decaissements) : '·'}</td>
                  <td className={`text-right tabular-nums ${row.soldeMensuel >= 0 ? 'text-[#38761d]' : 'text-[#b7332e]'}`}>
                    {euros(row.soldeMensuel)}
                  </td>
                  <td className={`text-right tabular-nums font-semibold ${row.soldeCumule >= 0 ? '' : 'text-[#b7332e]'}`}>
                    {euros(row.soldeCumule)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#9a92b5] mt-2">
          Les mouvements financiers du {formatDateFR(finances[0]?.date ?? '')} et suivants (capital, CCA, placements)
          sont inclus dans les encaissements/décaissements de leur mois.
        </p>
      </Card>
    </div>
  );
}
