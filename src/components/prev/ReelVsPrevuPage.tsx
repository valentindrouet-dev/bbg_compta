import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import type { BudgetLine } from '../../types';
import { PRE_IMMAT } from '../../utils/dates';
import { euros, euros0, r2, pourcent } from '../../utils/money';
import { immoInfos, dotationDuMois } from '../../utils/calc';
import { rollupBudget, total, type BudgetLineFull } from '../../utils/budget';
import { PageHeader, Card, StatCard } from '../ui';

const MOIS_NUM: Record<string, number> = {
  'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
  'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12,
};

/** Mois comptable (yyyy-mm) correspondant à chaque colonne du budget. */
function moisDesColonnes(exercice: string, labels: string[]): string[] {
  const y0 = parseInt(exercice.slice(0, 4), 10);
  const first = MOIS_NUM[labels[0]?.toLowerCase().replace(' +1', '')] ?? 9;
  let y = y0, m = first;
  return labels.map(() => {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    m++; if (m > 12) { m = 1; y++; }
    return key;
  });
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/** Correspondances spéciales catégorie réelle -> libellé budget. */
const SPECIAL: Record<string, string> = {
  'urssaf': 'cotisations tns',
  'retraite tns': 'cotisations tns',
  'tenue comptable': 'tenue comptable',
};

function matchLine(categorie: string, lines: BudgetLine[]): BudgetLine[] {
  const cat = normalize(categorie);
  const target = SPECIAL[cat] ?? cat;
  return lines.filter(l => {
    const lab = normalize(l.label);
    return lab.includes(target) || target.includes(lab);
  });
}

export function ReelVsPrevuPage() {
  const entries = useStore(s => s.entries);
  const budgets = useStore(s => s.budgets);
  const [exercice, setExercice] = useState('2025-26');
  const budget = budgets[exercice];

  const data = useMemo(() => {
    if (!budget) return null;
    const lignes = budget.lignes as BudgetLineFull[];
    const nMois = budget.moisLabels.length;
    const roll = rollupBudget(lignes, nMois);
    const moisCols = moisDesColonnes(exercice, budget.moisLabels);
    const immos = immoInfos(entries);

    const inCol = (colIdx: number) => (moisKey: string) =>
      moisKey === moisCols[colIdx] || (colIdx === 0 && exercice === '2025-26' && moisKey === PRE_IMMAT);

    const caReel: number[] = [];
    const depReel: number[] = [];
    const dotReel: number[] = [];
    for (let i = 0; i < nMois; i++) {
      const test = inCol(i);
      const du = entries.filter(e => test(e.mois));
      caReel.push(r2(du.filter(e => e.type === 'produit').reduce((s, e) => s + e.ht, 0)));
      depReel.push(r2(du.filter(e => e.type === 'charges').reduce((s, e) => s + e.ht, 0)));
      let dot = dotationDuMois(immos, moisCols[i]);
      if (i === 0 && exercice === '2025-26') dot = r2(dot + dotationDuMois(immos, PRE_IMMAT));
      dotReel.push(dot);
    }
    const depPrevu = roll.coutsDevTotal.map((v, i) =>
      v + roll.chargesExternesTotal[i] + roll.personnel[i] + roll.taxes[i]);
    const resReel = caReel.map((v, i) => r2(v - depReel[i] - dotReel[i]));
    const resPrevu = roll.resultatCourant;

    // ---- comparaison annuelle par catégorie ----
    const catsReel = new Map<string, number>();
    for (const e of entries) {
      if (e.type !== 'charges') continue;
      if (!moisCols.includes(e.mois) && !(exercice === '2025-26' && e.mois === PRE_IMMAT)) continue;
      catsReel.set(e.categorie, (catsReel.get(e.categorie) ?? 0) + e.ht);
    }
    const lignesDepenses = lignes.filter(l =>
      (l.section === 'charges_externes' || l.section === 'couts_dev' || l.section === 'personnel' || l.section === 'resultat')
      && l.kind === 'montant');
    const usedLineIds = new Set<string>();
    interface CatRow { label: string; reel: number; prevu: number | null }
    const catRows: CatRow[] = [];
    const byTarget = new Map<string, CatRow>();
    for (const [cat, reel] of [...catsReel.entries()].sort((a, b) => b[1] - a[1])) {
      const matched = matchLine(cat, lignesDepenses);
      matched.forEach(l => usedLineIds.add(l.id));
      const target = SPECIAL[normalize(cat)];
      if (target && byTarget.has(target)) {
        const row = byTarget.get(target)!;
        row.label += ` + ${cat}`;
        row.reel = r2(row.reel + reel);
        continue;
      }
      const prevu = matched.length
        ? r2(matched.reduce((s, l) => s + l.valeurs.reduce<number>((a, v) => a + (v ?? 0), 0), 0))
        : null;
      const row: CatRow = { label: cat, reel: r2(reel), prevu };
      if (target) byTarget.set(target, row);
      catRows.push(row);
    }
    const nonConsommees = lignesDepenses.filter(l =>
      !usedLineIds.has(l.id) && l.valeurs.some(v => (v ?? 0) !== 0));

    return { roll, nMois, moisCols, caReel, depReel, dotReel, resReel, depPrevu, resPrevu, catRows, nonConsommees };
  }, [budget, entries, exercice]);

  if (!budget || !data) return <div className="p-6">Aucun budget pour cet exercice.</div>;

  const caReelTot = total(data.caReel);
  const caPrevuTot = total(data.roll.ca);
  const depReelTot = total(data.depReel);
  const depPrevuTot = total(data.depPrevu);

  return (
    <div className="p-6 max-w-full">
      <PageHeader
        title="Réel vs Prévu"
        subtitle="Le réalisé vient du journal, le prévu des budgets annuels — plus aucun IMPORTRANGE à maintenir"
        actions={
          <select
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            value={exercice}
            onChange={ev => setExercice(ev.target.value)}
          >
            {Object.keys(budgets).map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="CA réel / prévu (HT)" value={`${euros0(caReelTot)} / ${euros0(caPrevuTot)}`}
          sub={caPrevuTot ? `${pourcent(caReelTot / caPrevuTot)} du prévu` : undefined}
          tone={caReelTot >= caPrevuTot ? 'good' : 'neutral'} />
        <StatCard label="Dépenses réelles / prévues (HT)" value={`${euros0(depReelTot)} / ${euros0(depPrevuTot)}`}
          sub={depPrevuTot ? `${pourcent(depReelTot / depPrevuTot)} du budget consommé` : undefined}
          tone={depReelTot <= depPrevuTot ? 'good' : 'bad'} />
        <StatCard label="Résultat réel (approx.)" value={euros0(total(data.resReel))}
          tone={total(data.resReel) >= 0 ? 'good' : 'bad'} sub="CA − charges − dotations" />
        <StatCard label="Résultat courant prévu" value={euros0(total(data.resPrevu))}
          tone={total(data.resPrevu) >= 0 ? 'good' : 'bad'} />
      </div>

      <Card title="Comparaison mensuelle (HT)" className="mb-6">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="sheet text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left min-w-44"></th>
                {budget.moisLabels.map((m, i) => <th key={i} className="text-right min-w-20">{m}</th>)}
                <th className="text-right bg-yellow-50 min-w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              <CompareRows label="Chiffre d'affaires" prevu={data.roll.ca} reel={data.caReel} sensPositif />
              <CompareRows label="Dépenses (charges + jeux + personnel)" prevu={data.depPrevu} reel={data.depReel} />
              <CompareRows label="Dotations amortissements" prevu={data.roll.dotations} reel={data.dotReel} />
              <CompareRows label="Résultat" prevu={data.resPrevu} reel={data.resReel} sensPositif />
            </tbody>
          </table>
        </div>
        {exercice === '2025-26' && (
          <p className="text-xs text-gray-400 mt-2">Le réel de la période pré-immatriculation (mai → août 2025) est inclus dans la colonne Septembre, comme les « Frais de lancement » du budget.</p>
        )}
      </Card>

      <Card title="Consommation annuelle par catégorie (HT)">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-gray-600">
                <th>Catégorie (réel)</th>
                <th className="text-right">Réel</th>
                <th className="text-right">Prévu (budget)</th>
                <th className="text-right">Écart</th>
                <th className="text-right">Consommé</th>
              </tr>
            </thead>
            <tbody>
              {data.catRows.map(row => {
                const ecart = row.prevu != null ? r2(row.reel - row.prevu) : null;
                return (
                  <tr key={row.label} className="hover:bg-yellow-50/40">
                    <td>{row.label}</td>
                    <td className="text-right tabular-nums font-medium">{euros(row.reel)}</td>
                    <td className="text-right tabular-nums">{row.prevu != null ? euros(row.prevu) : <span className="text-gray-400">non budgété</span>}</td>
                    <td className={`text-right tabular-nums ${ecart == null ? '' : ecart > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {ecart != null ? euros(ecart) : '—'}
                    </td>
                    <td className="text-right tabular-nums text-gray-500">
                      {row.prevu ? pourcent(row.reel / row.prevu) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.nonConsommees.length > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            Lignes budgétées sans dépense correspondante :{' '}
            {data.nonConsommees.map(l => `${l.label} (${euros0(l.valeurs.reduce<number>((s, v) => s + (v ?? 0), 0))})`).join(' · ')}
          </p>
        )}
      </Card>
    </div>
  );
}

function CompareRows({ label, prevu, reel, sensPositif }: {
  label: string; prevu: number[]; reel: number[]; sensPositif?: boolean;
}) {
  const ecart = reel.map((v, i) => r2(v - prevu[i]));
  const bon = (v: number) => (sensPositif ? v >= 0 : v <= 0);
  return (
    <>
      <tr className="bg-gray-50 font-semibold">
        <td>{label} — prévu</td>
        {prevu.map((v, i) => <td key={i} className="text-right tabular-nums text-gray-500">{v ? euros0(r2(v)) : '·'}</td>)}
        <td className="text-right tabular-nums bg-yellow-50">{euros(total(prevu))}</td>
      </tr>
      <tr>
        <td className="pl-4">réel</td>
        {reel.map((v, i) => <td key={i} className="text-right tabular-nums font-medium">{v ? euros0(v) : '·'}</td>)}
        <td className="text-right tabular-nums bg-yellow-50 font-semibold">{euros(total(reel))}</td>
      </tr>
      <tr className="border-b-2 border-gray-200">
        <td className="pl-4 text-gray-500 italic">écart</td>
        {ecart.map((v, i) => (
          <td key={i} className={`text-right tabular-nums ${v === 0 ? 'text-gray-300' : bon(v) ? 'text-emerald-600' : 'text-red-600'}`}>
            {v ? euros0(v) : '·'}
          </td>
        ))}
        <td className={`text-right tabular-nums bg-yellow-50 ${bon(total(ecart)) ? 'text-emerald-700' : 'text-red-700'}`}>
          {euros(total(ecart))}
        </td>
      </tr>
    </>
  );
}
