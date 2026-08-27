/**
 * Trésorerie par exercice.
 *
 * Le prévisionnel n'est plus recopié à la main : il est calculé depuis les
 * onglets du prévisionnel — produits, charges, personnel, immobilisations et
 * stock — convertis en TTC, puisque c'est bien du TTC qui entre et sort du
 * compte. Le réalisé, lui, est calculé depuis le journal et les mouvements
 * financiers. Les deux se lisent l'un sous l'autre, avec le même découpage.
 */
import { useMemo } from 'react';
import { useStore } from '../../store';
import { EXERCICES, moisExercice } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { ordreAffichage } from '../../utils/previsionnel';
import { fluxTresorerie, sommeMap } from '../../utils/prevCalc';
import { PageHeader, Card, MoneyInput, StatCard } from '../ui';

const AUCUNE_LIGNE: never[] = [];

export function TresoPrevPage() {
  const tresoPrev = useStore(s => s.tresoPrev);
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const previsionnels = useStore(s => s.previsionnels);
  const stocks = useStore(s => s.stocks);
  const refs = useStore(s => s.referentiels);
  const restoreAll = useStore(s => s.restoreAll);

  // ----- Prévisionnel calculé ---------------------------------------------
  const prevu = useMemo(() => EXERCICES.map(ex => {
    const moisList = moisExercice(ex);
    const lignes = ordreAffichage(previsionnels[ex] ?? AUCUNE_LIGNE, refs);
    const f = fluxTresorerie(lignes, moisList, stocks, ex, refs, entries);
    const mouvements = finances.filter(x => {
      const m = x.date < '2025-09-01' ? 'pre-immat' : x.date.slice(0, 7);
      return moisList.includes(m);
    });
    const part = (t: string) => r2(mouvements.filter(x => x.type === t)
      .reduce((s, x) => s + x.montant, 0));
    const capital = part('capital');
    const cca = part('cca');
    const remboursementCCA = part('remboursement_cca');
    const placements = part('placement');
    const produitsFinanciers = part('produit_financier');
    const autres = part('autre');
    const entrees = r2(sommeMap(f.encaissements) + produitsFinanciers);
    const sorties = r2(sommeMap(f.decaissements) - placements - autres);
    return {
      ex,
      ventesJeux: sommeMap(f.ventesJeux),
      autresProduits: sommeMap(f.autresProduits),
      produitsFinanciers,
      entrees,
      charges: r2(-sommeMap(f.charges)),
      personnel: r2(-sommeMap(f.personnel)),
      immos: r2(-sommeMap(f.immos)),
      fabrication: r2(-sommeMap(f.fabrication)),
      placements, autres,
      sorties: r2(-sorties),
      exploitation: r2(entrees - sorties),
      capital, cca, remboursementCCA,
      apports: r2(capital + cca + remboursementCCA),
    };
  }), [previsionnels, stocks, refs, finances, entries]);

  const prevuCumule = useMemo(() => {
    let t = 0;
    return prevu.map(x => { t = r2(t + x.exploitation + x.apports); return { ...x, treso: t }; });
  }, [prevu]);

  // ----- Réalisé ------------------------------------------------------------
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
      // Rembourser un compte courant d'associé sort de la trésorerie sans être
      // une charge : c'est une dette qu'on éteint, pas une dépense.
      const remboursementCCA = r2(fin.filter(f => f.type === 'remboursement_cca')
        .reduce((s, f) => s + f.montant, 0));
      const autres = r2(fin.filter(f => f.type === 'autre').reduce((s, f) => s + f.montant, 0));
      const entreesTotales = r2(ca + pf);
      const depensesTotales = r2(invest + charges + placements + autres);
      const cumule = r2(entreesTotales + depensesTotales);
      const apports = r2(capital + cca + remboursementCCA);
      return {
        ex, ca, pf, entreesTotales, invest, charges, placements, depensesTotales, cumule,
        capital, cca, remboursementCCA, apports,
      };
    });
    let treso = 0;
    return perEx.map(x => {
      treso = r2(treso + x.cumule + x.apports);
      return { ...x, treso };
    });
  }, [entries, finances]);

  const finPrevue = prevuCumule[prevuCumule.length - 1]?.treso ?? 0;
  const totalVentesJeux = r2(prevuCumule.reduce((s, x) => s + x.ventesJeux, 0));

  function setPrevCell(lineIdx: number, exIdx: number, v: number | null) {
    const next = tresoPrev.map((l, i) => i === lineIdx
      ? { ...l, valeurs: l.valeurs.map((x, j) => j === exIdx ? v : x) }
      : l);
    restoreAll({ tresoPrev: next });
  }

  return (
    <div className="p-4 w-full max-w-[1400px]">
      <PageHeader
        title="Trésorerie prévisionnelle vs réalisée"
        subtitle="Vue TTC par exercice — le prévu vient des onglets du prévisionnel, le réalisé du journal"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Trésorerie prévue en 2029-30" value={euros(finPrevue)}
          tone={finPrevue >= 0 ? 'good' : 'bad'} sub="après apports et remboursements" />
        <StatCard label="Ventes de jeux prévues (TTC)" value={euros(totalVentesJeux)}
          tone="good" sub="calculées dans Prévisionnel → Stock" />
        <StatCard label="Trésorerie réalisée à ce jour"
          value={euros(realise.find(x => x.ca || x.charges)?.treso ?? 0)} tone="neutral"
          sub="cumul des exercices déjà mouvementés" />
        <StatCard label="Sorties prévues sur 5 ans"
          value={euros(r2(prevuCumule.reduce((s, x) => s + x.sorties, 0)))} tone="accent"
          sub="charges, personnel, investissements et tirages" />
      </div>

      <Card title="Prévisionnel (TTC) — calculé depuis les onglets du prévisionnel" className="mb-6">
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="tresoprev:previsionnel" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th className="min-w-64">Catégories (TTC)</th>
                {EXERCICES.map(ex => <th key={ex} className="text-right">{ex}</th>)}
                <th className="text-right bg-[#efeafa]">Total</th>
              </tr>
            </thead>
            <tbody>
              <RowP label="Workshops et autres produits" aide="Bloc Produits du prévisionnel, converti en TTC"
                get={x => x.autresProduits} lignes={prevuCumule} />
              <RowP label="Ventes de jeux" aide="Exemplaires vendus × prix de vente, onglet Stock"
                get={x => x.ventesJeux} lignes={prevuCumule} />
              <RowP label="Produits financiers (intérêts)" get={x => x.produitsFinanciers} lignes={prevuCumule} />
              <RowP label="Entrées totales" get={x => x.entrees} lignes={prevuCumule} strong />
              <RowP label="Charges externes" aide="Bloc Charges, converti en TTC"
                get={x => x.charges} lignes={prevuCumule} />
              <RowP label="Personnel et rémunérations" get={x => x.personnel} lignes={prevuCumule} />
              <RowP label="Investissements (immobilisations)" get={x => x.immos} lignes={prevuCumule} />
              <RowP label="Tirages payés à l'usine" aide="Exemplaires fabriqués × coût de revient, onglet Stock"
                get={x => x.fabrication} lignes={prevuCumule} />
              <RowP label="Placements" get={x => x.placements} lignes={prevuCumule} />
              <RowP label="Sorties totales" get={x => x.sorties} lignes={prevuCumule} strong />
              <RowP label="Cumulé exploitation (TTC)" get={x => x.exploitation} lignes={prevuCumule} strong />
              <RowP label="Capital social" get={x => x.capital} lignes={prevuCumule} />
              <RowP label="Compte courant d'associé" get={x => x.cca} lignes={prevuCumule} />
              <RowP label="Remboursement de compte courant" get={x => x.remboursementCCA} lignes={prevuCumule} />
              <RowP label="Trésorerie fin d'exercice (TTC)" get={x => x.treso} lignes={prevuCumule} strong accent />
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#9a92b5] mt-2">
          Rien ne se saisit ici : chaque ligne est la somme d'un bloc du prévisionnel de l'exercice,
          convertie en TTC ligne à ligne (chacune garde son taux de TVA). Les tirages d'usine et les
          ventes de jeux viennent de l'onglet <b>Stock</b>. Les apports en capital, le compte courant
          d'associé et les placements restent des <b>mouvements financiers</b>, saisis en Trésorerie.
        </p>
      </Card>

      <Card title="Réalisé (TTC) — calculé depuis le journal" className="mb-6">
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="tresoprev:realise" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th className="min-w-64">Catégories (TTC)</th>
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
              <RowR label="Remboursement de compte courant" get={x => x.remboursementCCA} realise={realise} />
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

      <details>
        <summary className="text-sm cursor-pointer" style={{ color: 'var(--bbg-purple-dark)' }}>
          Saisie d'origine, reprise du tableur — conservée pour mémoire
        </summary>
        <Card title="Prévisionnel du tableur (TTC) — éditable" className="mt-3">
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table="tresoprev:tableur" className="sheet text-sm border-collapse w-full">
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
            Ces chiffres viennent du tableur d'origine. Ils ne servent plus au calcul : le tableau du
            haut les remplace, ligne par ligne, à partir de ce qui est réellement budgété.
          </p>
        </Card>
      </details>
    </div>
  );
}

interface PrevuRow {
  ex: string; ventesJeux: number; autresProduits: number; produitsFinanciers: number;
  entrees: number; charges: number; personnel: number; immos: number; fabrication: number;
  placements: number; autres: number; sorties: number; exploitation: number;
  capital: number; cca: number; remboursementCCA: number; apports: number; treso: number;
}

function RowP({ label, aide, get, lignes, strong, accent }: {
  label: string; aide?: string; get: (x: PrevuRow) => number;
  lignes: PrevuRow[]; strong?: boolean; accent?: boolean;
}) {
  const total = r2(lignes.reduce((s, x) => s + get(x), 0));
  return (
    <tr className={accent ? 'bg-[#efeafa] font-bold' : strong ? 'bg-[#f4f1fb] font-semibold' : ''}>
      <td title={aide} className={aide ? 'cursor-help' : ''}>{label}</td>
      {lignes.map(x => {
        const v = get(x);
        return (
          <td key={x.ex} className={`text-right tabular-nums ${v < 0 ? 'text-[#b7332e]' : ''}`}>
            {v !== 0 ? euros(v) : '·'}
          </td>
        );
      })}
      <td className={`text-right tabular-nums font-medium bg-[#efeafa] ${total < 0 ? 'text-[#b7332e]' : ''}`}>
        {accent ? '' : (total !== 0 ? euros(total) : '·')}
      </td>
    </tr>
  );
}

interface RealiseRow {
  ex: string; ca: number; pf: number; entreesTotales: number; invest: number;
  charges: number; placements: number; depensesTotales: number; cumule: number;
  capital: number; cca: number; remboursementCCA: number; apports: number; treso: number;
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
