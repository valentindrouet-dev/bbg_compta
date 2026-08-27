import { useMemo } from 'react';
import { useStore } from '../../store';
import { EXERCICES, moisExercice } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { PageHeader, Card, MoneyInput } from '../ui';

/**
 * Trésorerie par exercice : prévisionnel (éditable, repris du tableur) et
 * réalisé (calculé automatiquement depuis le journal et les mouvements financiers).
 */
export function TresoPrevPage() {
  const tresoPrev = useStore(s => s.tresoPrev);
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const restoreAll = useStore(s => s.restoreAll);

  function setPrevCell(lineIdx: number, exIdx: number, v: number | null) {
    const next = tresoPrev.map((l, i) => i === lineIdx
      ? { ...l, valeurs: l.valeurs.map((x, j) => j === exIdx ? v : x) }
      : l);
    restoreAll({ tresoPrev: next });
  }

  const realise = useMemo(() => {
    const perEx = EXERCICES.map(ex => {
      const moisSet = new Set(moisExercice(ex));
      const du = entries.filter(e => moisSet.has(e.mois));
      const fin = finances.filter(f => {
        const m = f.date < '2025-09-01' ? 'pre-immat' : f.date.slice(0, 7);
        return moisSet.has(m);
      });
      const ca = r2(du.filter(e => e.type === 'produit').reduce((s, e) => s + e.ttc, 0));
      const pf = r2(fin.filter(f => f.type === 'produit_financier').reduce((s, f) => s + f.montant, 0));
      const invest = r2(-du.filter(e => e.type === 'immo').reduce((s, e) => s + e.ttc, 0));
      const charges = r2(-du.filter(e => e.type === 'charges').reduce((s, e) => s + e.ttc, 0));
      const placements = r2(fin.filter(f => f.type === 'placement').reduce((s, f) => s + f.montant, 0));
      const capital = r2(fin.filter(f => f.type === 'capital').reduce((s, f) => s + f.montant, 0));
      const cca = r2(fin.filter(f => f.type === 'cca').reduce((s, f) => s + f.montant, 0));
      const autres = r2(fin.filter(f => f.type === 'autre').reduce((s, f) => s + f.montant, 0));
      const entreesTotales = r2(ca + pf);
      const depensesTotales = r2(invest + charges + placements + autres);
      const cumule = r2(entreesTotales + depensesTotales);
      const apports = r2(capital + cca);
      return { ex, ca, pf, entreesTotales, invest, charges, placements, depensesTotales, cumule, capital, cca, apports };
    });
    let treso = 0;
    return perEx.map(x => {
      treso = r2(treso + x.cumule + x.apports);
      return { ...x, treso };
    });
  }, [entries, finances]);

  return (
    <div className="p-4 w-full max-w-[1400px]">
      <PageHeader
        title="Trésorerie prévisionnelle vs réalisée"
        subtitle="Vue TTC par exercice — le réalisé est calculé depuis le journal, sans IMPORTRANGE"
      />

      <Card title="Prévisionnel (TTC) — éditable" className="mb-6">
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="tresoprev:previsionnel" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th className="min-w-56">Catégories (TTC)</th>
                {EXERCICES.map(ex => <th key={ex} className="text-right">{ex}</th>)}
                <th className="text-right bg-[#efeafa]">Total</th>
              </tr>
            </thead>
            <tbody>
              {tresoPrev.map((l, li) => {
                const tot = l.valeurs.reduce<number>((s, v) => s + (v ?? 0), 0);
                const isComputed = ['Entrées Totales', 'Dépenses Totales', 'Cumulé (TTC)', 'Trésorerie (TTC)'].includes(l.label);
                return (
                  <tr key={l.label + li} className={isComputed ? 'bg-[#f4f1fb] font-semibold' : 'hover:bg-[#f4f1fb]'}>
                    <td>{l.label}</td>
                    {l.valeurs.map((v, ei) => (
                      <td key={ei} className="text-right p-0.5!">
                        {isComputed
                          ? <span className={`tabular-nums px-1.5 ${(v ?? 0) < 0 ? 'text-[#b7332e]' : ''}`}>{v != null ? euros(v) : '—'}</span>
                          : <MoneyInput value={v} onCommit={x => setPrevCell(li, ei, x)}
                              className="w-full min-w-24 border-transparent hover:border-[#ddd6ef] bg-transparent" />}
                      </td>
                    ))}
                    <td className={`text-right tabular-nums font-medium bg-[#efeafa] ${tot < 0 ? 'text-[#b7332e]' : ''}`}>{euros(r2(tot))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#9a92b5] mt-2">
          Repris de ton tableur (les cellules en erreur #REF! sont vides — à compléter).
          Les lignes « Totales / Cumulé / Trésorerie » affichent les valeurs importées ; elles seront recalculées
          quand les liaisons avec le production calculator seront en place.
        </p>
      </Card>

      <Card title="Réalisé (TTC) — calculé depuis le journal">
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="tresoprev:realise" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th className="min-w-56">Catégories (TTC)</th>
                {realise.map(x => <th key={x.ex} className="text-right">{x.ex}</th>)}
              </tr>
            </thead>
            <tbody>
              <RowR label="Chiffre d'affaires" get={x => x.ca} realise={realise} />
              <RowR label="Produits financiers (intérêts)" get={x => x.pf} realise={realise} />
              <RowR label="Entrées totales" get={x => x.entreesTotales} realise={realise} strong />
              <RowR label="Investissements (immobilisations)" get={x => x.invest} realise={realise} />
              <RowR label="Charges (exploitation + jeux)" get={x => x.charges} realise={realise} />
              <RowR label="Placements" get={x => x.placements} realise={realise} />
              <RowR label="Dépenses totales" get={x => x.depensesTotales} realise={realise} strong />
              <RowR label="Cumulé exploitation (TTC)" get={x => x.cumule} realise={realise} strong />
              <RowR label="Capital social" get={x => x.capital} realise={realise} />
              <RowR label="Compte courant d'associé" get={x => x.cca} realise={realise} />
              <RowR label="Trésorerie fin d'exercice (TTC)" get={x => x.treso} realise={realise} strong accent />
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#9a92b5] mt-2">
          La trésorerie fin d'exercice cumule les exercices précédents. Les placements y figurent en sortie :
          la trésorerie affichée est la trésorerie disponible (hors comptes à terme).
        </p>
      </Card>
    </div>
  );
}

interface RealiseRow {
  ex: string; ca: number; pf: number; entreesTotales: number; invest: number;
  charges: number; placements: number; depensesTotales: number; cumule: number;
  capital: number; cca: number; apports: number; treso: number;
}

function RowR({ label, get, realise, strong, accent }: {
  label: string; get: (x: RealiseRow) => number;
  realise: RealiseRow[]; strong?: boolean; accent?: boolean;
}) {
  return (
    <tr className={accent ? 'bg-[#efeafa] font-bold' : strong ? 'bg-[#f4f1fb] font-semibold' : ''}>
      <td>{label}</td>
      {realise.map((x, i) => {
        const v = get(x);
        return (
          <td key={i} className={`text-right tabular-nums ${v < 0 ? 'text-[#b7332e]' : ''}`}>
            {v !== 0 ? euros(v) : '·'}
          </td>
        );
      })}
    </tr>
  );
}
