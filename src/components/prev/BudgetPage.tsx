import { useMemo, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import type { BudgetLine, BudgetSection } from '../../types';
import { euros, euros0, r2 } from '../../utils/money';
import { rollupBudget, total, type BudgetLineFull } from '../../utils/budget';
import { PageHeader, Card, MoneyInput, StatCard } from '../ui';

const SECTIONS: { key: BudgetSection; label: string }[] = [
  { key: 'ca', label: "Chiffre d'affaires (HT)" },
  { key: 'couts_dev', label: 'Coûts de développement & production (HT)' },
  { key: 'charges_externes', label: 'Charges externes (HT)' },
  { key: 'personnel', label: 'Charges de personnel (HT)' },
  { key: 'resultat', label: 'Taxes, dotations & financier (HT)' },
];

export function BudgetPage() {
  const budgets = useStore(s => s.budgets);
  const [exercice, setExercice] = useState('2025-26');
  const budget = budgets[exercice];

  const lignes = (budget?.lignes ?? []) as BudgetLineFull[];
  const nMois = budget?.moisLabels.length ?? 12;
  const roll = useMemo(() => rollupBudget(lignes, nMois), [lignes, nMois]);

  if (!budget) return <div className="p-6">Aucun budget pour cet exercice.</div>;

  return (
    <div className="p-6 max-w-full">
      <PageHeader
        title="Budgets annuels"
        subtitle="Compte de résultat prévisionnel — les sous-totaux, résultats et la TVA sont recalculés automatiquement"
        actions={
          <select
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            value={exercice}
            onChange={ev => setExercice(ev.target.value)}
          >
            {Object.keys(budgets).map(ex => <option key={ex} value={ex}>Budget {ex}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="CA prévu (HT)" value={euros0(total(roll.ca))} />
        <StatCard label="Marge brute" value={euros0(total(roll.margeBrute))} tone={total(roll.margeBrute) >= 0 ? 'good' : 'bad'} />
        <StatCard label="EBE" value={euros0(total(roll.ebe))} tone={total(roll.ebe) >= 0 ? 'good' : 'bad'} />
        <StatCard label="Résultat courant" value={euros0(total(roll.resultatCourant))} tone={total(roll.resultatCourant) >= 0 ? 'good' : 'bad'} />
        <StatCard label="Résultat net (après IS)" value={euros0(roll.resultatNetTotal)} tone={roll.resultatNetTotal >= 0 ? 'good' : 'bad'} />
      </div>

      <Card>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="sheet text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left min-w-64">Ligne</th>
                {budget.moisLabels.map((m, i) => <th key={i} className="text-right min-w-20">{m}</th>)}
                <th className="text-right bg-yellow-50 min-w-24">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <SectionRows exercice={exercice} section="ca" roll={roll} budget={{ lignes, nMois }} />
              <ComputedRow label="CA total (HT)" values={roll.ca} strong />

              <SectionRows exercice={exercice} section="couts_dev" roll={roll} budget={{ lignes, nMois }} grouped />
              <ComputedRow label="Coûts de développement — total" values={roll.coutsDevTotal} strong />
              <ComputedRow label="Marge brute" values={roll.margeBrute} accent />

              <SectionRows exercice={exercice} section="charges_externes" roll={roll} budget={{ lignes, nMois }} />
              <ComputedRow label="Imprévus (10 %)" values={roll.imprevus} />
              <ComputedRow label="Charges externes — total" values={roll.chargesExternesTotal} strong />
              <ComputedRow label="Valeur ajoutée" values={roll.valeurAjoutee} accent />

              <SectionRows exercice={exercice} section="personnel" roll={roll} budget={{ lignes, nMois }} />
              <ComputedRow label="Charges de personnel — total" values={roll.personnel} strong />

              <SectionRows exercice={exercice} section="resultat" roll={roll} budget={{ lignes, nMois }} />
              <ComputedRow label="EBE (excédent brut d'exploitation)" values={roll.ebe} accent />
              <ComputedRow label="REX (résultat d'exploitation)" values={roll.rex} accent />
              <ComputedRow label="Résultat courant" values={roll.resultatCourant} accent />
              <TotalOnlyRow label="IS (15 % si bénéfice)" value={roll.isTotal} nMois={nMois} />
              <TotalOnlyRow label="Résultat net" value={roll.resultatNetTotal} nMois={nMois} strong />

              <tr><td colSpan={nMois + 3} className="bg-gray-100 font-bold text-gray-700 py-1.5">TVA prévisionnelle</td></tr>
              <ComputedRow label="TVA collectée (20 % du CA)" values={roll.tvaCollectee} />
              <ComputedRow label="TVA déductible (dépenses assujetties)" values={roll.tvaDeductible} />
              <ComputedRow label="TVA à reverser (− = crédit)" values={roll.tvaAReverser} strong />
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Montants HT. Les lignes « heures / jours / volume / % » sont informatives et n'entrent pas dans les totaux €.
          ⛔ = TVA non déductible dans le modèle (forfaits, festivals…).
        </p>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------- Sous-composants

function SectionRows({ exercice, section, budget, grouped }: {
  exercice: string; section: BudgetSection; roll: ReturnType<typeof rollupBudget>;
  budget: { lignes: BudgetLineFull[]; nMois: number }; grouped?: boolean;
}) {
  const updateBudgetCell = useStore(s => s.updateBudgetCell);
  const removeBudgetLine = useStore(s => s.removeBudgetLine);
  const addBudgetLine = useStore(s => s.addBudgetLine);
  const meta = SECTIONS.find(s => s.key === section)!;
  const lignes = budget.lignes.filter(l => l.section === section);

  const rows: ReactNode[] = [];
  rows.push(
    <tr key={`head-${section}`}>
      <td colSpan={budget.nMois + 2} className="bg-gray-100 font-bold text-gray-700 py-1.5">{meta.label}</td>
      <td className="bg-gray-100">
        <button
          className="text-gray-500 hover:text-gray-900" title="Ajouter une ligne"
          onClick={() => addBudgetLine(exercice, {
            exercice, section, groupe: '', label: 'Nouvelle ligne', baseTTC: null, baseHT: null,
            kind: 'montant', valeurs: new Array(budget.nMois).fill(null),
          })}
        >
          <Plus size={14} />
        </button>
      </td>
    </tr>,
  );

  let lastGroup: string | null = null;
  for (const l of lignes) {
    if (grouped && l.groupe !== lastGroup) {
      lastGroup = l.groupe;
      rows.push(
        <tr key={`g-${section}-${l.groupe}`}>
          <td colSpan={budget.nMois + 3} className="bg-gray-50 font-semibold text-gray-500 italic py-1">{l.groupe || 'Autre'}</td>
        </tr>,
      );
    }
    rows.push(<LineRow key={l.id} exercice={exercice} l={l} nMois={budget.nMois}
      onCell={(i, v) => updateBudgetCell(exercice, l.id, i, v)}
      onRemove={() => { if (confirm(`Supprimer la ligne « ${l.label} » ?`)) removeBudgetLine(exercice, l.id); }} />);
  }
  return <>{rows}</>;
}

function LineRow({ l, nMois, onCell, onRemove }: {
  exercice: string; l: BudgetLineFull; nMois: number;
  onCell: (i: number, v: number | null) => void; onRemove: () => void;
}) {
  const updateBudgetLine = useStore(s => s.updateBudgetLine);
  const isEuro = l.kind === 'montant';
  const tot = l.valeurs.reduce<number>((s, v) => s + (v ?? 0), 0);
  return (
    <tr className="group hover:bg-yellow-50/40">
      <td>
        <div className="flex items-center gap-1.5">
          <input
            className="w-full min-w-52 px-1 py-0.5 border border-transparent hover:border-gray-200 focus:border-gray-300 rounded text-xs bg-transparent"
            defaultValue={l.label}
            onBlur={ev => ev.target.value !== l.label && updateBudgetLine(l.exercice, l.id, { label: ev.target.value })}
          />
          {!isEuro && <span className="text-[10px] bg-blue-50 text-blue-600 rounded px-1 shrink-0">{l.kind}</span>}
          {isEuro && l.section === 'charges_externes' && l.tvaFlag === false &&
            <span className="text-[10px] shrink-0" title="TVA non déductible">⛔</span>}
        </div>
      </td>
      {Array.from({ length: nMois }, (_, i) => (
        <td key={i} className="text-right p-0.5!">
          <MoneyInput
            value={l.valeurs[i] ?? null}
            onCommit={v => onCell(i, v)}
            className="w-full min-w-16 border-transparent hover:border-gray-200 bg-transparent text-xs"
          />
        </td>
      ))}
      <td className={`text-right tabular-nums font-medium bg-yellow-50 ${tot < 0 ? 'text-red-700' : ''}`}>
        {isEuro ? euros(r2(tot)) : r2(tot).toLocaleString('fr-FR')}
      </td>
      <td>
        <button className="text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100" onClick={onRemove}>
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

function ComputedRow({ label, values, strong, accent }: {
  label: string; values: number[]; strong?: boolean; accent?: boolean;
}) {
  const cls = accent
    ? 'bg-yellow-50 font-bold'
    : strong ? 'bg-gray-50 font-semibold' : 'text-gray-500';
  return (
    <tr className={cls}>
      <td className="italic">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`text-right tabular-nums ${v < 0 ? 'text-red-700' : ''}`}>
          {v !== 0 ? euros0(r2(v)) : '·'}
        </td>
      ))}
      <td className={`text-right tabular-nums font-bold bg-yellow-100 ${total(values) < 0 ? 'text-red-700' : ''}`}>
        {euros(total(values))}
      </td>
      <td></td>
    </tr>
  );
}

function TotalOnlyRow({ label, value, nMois, strong }: {
  label: string; value: number; nMois: number; strong?: boolean;
}) {
  return (
    <tr className={strong ? 'bg-gray-50 font-bold' : 'text-gray-500'}>
      <td className="italic">{label}</td>
      <td colSpan={nMois} className="text-center text-gray-300">calculé sur le total annuel</td>
      <td className={`text-right tabular-nums font-bold bg-yellow-100 ${value < 0 ? 'text-red-700' : ''}`}>
        {euros(value)}
      </td>
      <td></td>
    </tr>
  );
}

export type { BudgetLine };
