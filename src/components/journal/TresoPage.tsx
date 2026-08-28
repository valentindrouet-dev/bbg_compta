import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import type { FinanceEntry } from '../../types';
import { labelMois, moisCourant, todayISO } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { soldeTresorerie } from '../../utils/calc';
import { FINANCE_TYPES } from '../../utils/finance';
import { PageHeader, Card, Btn, MoneyInput, StatCard } from '../ui';

export function TresoPage() {
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const addFinance = useStore(s => s.addFinance);
  const updateFinance = useStore(s => s.updateFinance);
  const removeFinance = useStore(s => s.removeFinance);

  const tresoManuel = useStore(s => s.tresoManuel);
  const setTresoManuel = useStore(s => s.setTresoManuel);
  // Le même calcul que le tableau de bord : le solde retenu est celui du mois
  // en cours, pas celui de la dernière ligne — un mouvement déjà planifié en
  // octobre ne doit pas amputer ce qu'on a en banque aujourd'hui.
  const bilan = useMemo(
    () => soldeTresorerie(entries, finances, tresoManuel),
    [entries, finances, tresoManuel],
  );
  const rows = bilan.lignes;
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
        <StatCard label={`Solde à fin ${labelMois(bilan.mois)}`}
          value={euros(bilan.solde)}
          tone={bilan.solde >= 0 ? 'good' : 'bad'}
          sub={bilan.moisPlanifies
            ? `${euros(bilan.soldeApres)} après les ${bilan.moisPlanifies} mois déjà planifiés`
            : 'dernier mois du tableau'} />
        <StatCard label="Dont placé (comptes à terme)" value={euros(totalPlace)} tone="accent"
          sub="modifiable dans les mouvements financiers" />
        <StatCard label="Disponible + placé" value={euros(r2(bilan.solde + totalPlace))} />
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
          <table data-table="treso:mouvements" className="sheet text-sm border-collapse w-full">
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
          <table data-table="treso:mensuel" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th>Mois</th>
                <th className="text-right">Solde initial</th>
                <th className="text-right" title="Produits TTC du journal de ce mois">
                  Encaissements journal
                </th>
                <th className="text-right" title="Dépenses TTC du journal de ce mois, immobilisations comprises">
                  Décaissements journal
                </th>
                <th className="text-right" title="Capital, compte courant, placements, intérêts — hors journal">
                  Mouvements financiers
                </th>
                <th className="text-right" title="Correction saisie à la main : un décalage de paiement, un oubli…">
                  Ajustement
                </th>
                <th className="text-right">Solde du mois</th>
                <th className="text-right">Solde calculé</th>
                <th className="text-right" title="Le solde de ton relevé bancaire à la fin du mois">
                  Relevé bancaire
                </th>
                <th className="text-right">Écart</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.mois} className={row.mois === moisCourant() ? 'bg-[#efeafa]' : ''}>
                  <td className="font-medium">{labelMois(row.mois)}</td>
                  <td className="text-right tabular-nums text-[#6f6690]">{euros(row.soldeInitial)}</td>
                  <td className="text-right tabular-nums text-[#38761d]">
                    {row.encJournal ? euros(row.encJournal) : '·'}
                  </td>
                  <td className="text-right tabular-nums text-[#b7332e]">
                    {row.decJournal ? '−' + euros(row.decJournal) : '·'}
                  </td>
                  <td className="text-right tabular-nums"
                    style={{ color: row.financier >= 0 ? '#38761d' : '#b7332e' }}>
                    {row.financier ? euros(row.financier) : '·'}
                  </td>
                  <td className="text-right p-0.5!">
                    <MoneyInput
                      value={row.ajustement || null}
                      onCommit={v => setTresoManuel(row.mois, { ajustement: v ?? undefined })}
                      className="w-24 border-transparent hover:border-[#ddd6ef] bg-transparent"
                    />
                  </td>
                  <td className={`text-right tabular-nums ${row.soldeMensuel >= 0 ? 'text-[#38761d]' : 'text-[#b7332e]'}`}>
                    {euros(row.soldeMensuel)}
                  </td>
                  <td className={`text-right tabular-nums font-semibold ${row.soldeCumule >= 0 ? '' : 'text-[#b7332e]'}`}>
                    {euros(row.soldeCumule)}
                  </td>
                  <td className="text-right p-0.5!">
                    <MoneyInput
                      value={row.soldeReel ?? null}
                      onCommit={v => setTresoManuel(row.mois, { soldeReel: v ?? undefined })}
                      className="w-28 border-transparent hover:border-[#ddd6ef] bg-transparent"
                    />
                  </td>
                  <td className="text-right tabular-nums font-semibold"
                    style={{ color: row.ecart == null ? '#9a92b5'
                      : Math.abs(row.ecart) < 0.01 ? '#38761d' : '#b7332e' }}>
                    {row.ecart == null ? '·' : Math.abs(row.ecart) < 0.01 ? '✓' : euros(row.ecart)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-[#5c5280] mt-3 space-y-1.5 max-w-4xl">
          <p>
            <b>Trois flux, trois colonnes.</b> Les deux premières se retrouvent ligne à ligne dans
            « Journal du mois » : ce sont les produits et les dépenses TTC du mois comptable.
            Les <b>mouvements financiers</b> (capital, compte courant d'associé, placements,
            intérêts) ne sont dans aucun journal — ils se saisissent ici, dans le tableau du dessus.
          </p>
          <p>
            <b>Pourquoi ça peut ne pas coller avec ton relevé.</b> Le calcul suppose qu'une écriture
            est réglée dans son mois comptable. Une facture de septembre payée en octobre, un
            prélèvement en retard, une note de frais remboursée plus tard : le compte bancaire, lui,
            bouge un mois plus tard. Saisis alors le <b>solde de ton relevé</b> : l'écart s'affiche,
            et l'<b>ajustement</b> te permet de le corriger — il entre dans le calcul et se reporte
            sur les mois suivants.
          </p>
        </div>
      </Card>
    </div>
  );
}
