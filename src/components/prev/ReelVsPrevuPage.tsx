import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import type { PrevLigne, PrevSection } from '../../types';
import { EXERCICES, labelMois, moisExercice } from '../../utils/dates';
import { euros, euros0, r2, pourcent } from '../../utils/money';
import {
  reelParCategorie, reelParCategorieEtMois, sectionDeCategorie, totalDeLigne, valeursDe,
  SECTIONS, SECTIONS_DEPENSES,
} from '../../utils/previsionnel';
import { PageHeader, Card, StatCard } from '../ui';

const DEPENSES: PrevSection[] = SECTIONS_DEPENSES;

export function ReelVsPrevuPage() {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const previsionnels = useStore(s => s.previsionnels);
  const [exercice, setExercice] = useState('2025-26');

  const moisList = moisExercice(exercice);
  const lignes: PrevLigne[] = previsionnels[exercice] ?? [];
  const reel = useMemo(() => reelParCategorie(entries, exercice), [entries, exercice]);
  const reelMois = useMemo(() => reelParCategorieEtMois(entries, exercice), [entries, exercice]);

  /** Prévu mois par mois, pour un ensemble de sections. */
  const prevuMensuel = (sections: PrevSection[]) => moisList.map((_, i) =>
    r2(lignes.filter(l => !l.unite && sections.includes(l.section))
      .reduce((s, l) => s + (valeursDe(l, lignes)[i] ?? 0), 0)));

  /** Réel mois par mois, pour les catégories d'un ensemble de sections. */
  const reelMensuel = (garde: (cat: string) => boolean) => moisList.map(m =>
    r2([...reelMois.entries()].filter(([c]) => garde(c))
      .reduce((s, [, parMois]) => s + (parMois.get(m) ?? 0), 0)));

  const estProduit = (c: string) => refs.categoriesProduits.includes(c);

  const caPrevu = prevuMensuel(['produits']);
  const caReel = reelMensuel(estProduit);
  const depPrevu = prevuMensuel(DEPENSES);
  const depReel = reelMensuel(c => !estProduit(c));
  const resPrevu = caPrevu.map((v, i) => r2(v - depPrevu[i]));
  const resReel = caReel.map((v, i) => r2(v - depReel[i]));

  const somme = (a: number[]) => r2(a.reduce((s, v) => s + v, 0));

  /** Comparaison par catégorie : prévu, réel, écart. */
  const parCategorie = useMemo(() => {
    const cats = new Set<string>([...lignes.filter(l => !l.unite).map(l => l.categorie), ...reel.keys()]);
    return [...cats].map(cat => {
      const prevu = r2(lignes.filter(l => l.categorie === cat && !l.unite)
        .reduce((s, l) => s + totalDeLigne(l, lignes), 0));
      const r = reel.get(cat) ?? 0;
      const section = lignes.find(l => l.categorie === cat)?.section
        ?? sectionDeCategorie(cat, refs);
      return { cat, prevu, reel: r, ecart: r2(r - prevu), section: section as PrevSection };
    }).sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart));
  }, [lignes, reel, refs]);

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Réel vs Prévu"
        subtitle="Le réalisé vient du journal, le prévu du prévisionnel — mêmes catégories de part et d'autre"
        actions={
          <select
            className="border rounded-md px-2 py-1.5 text-sm bg-white font-medium"
            style={{ borderColor: 'var(--bbg-border)', color: 'var(--bbg-purple-darker)' }}
            value={exercice}
            onChange={ev => setExercice(ev.target.value)}
          >
            {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Produits réel / prévu" value={`${euros0(somme(caReel))} / ${euros0(somme(caPrevu))}`}
          tone={somme(caReel) >= somme(caPrevu) ? 'good' : 'neutral'}
          sub={somme(caPrevu) ? `${pourcent(somme(caReel) / somme(caPrevu))} du prévu` : undefined} />
        <StatCard label="Dépenses réel / prévu" value={`${euros0(somme(depReel))} / ${euros0(somme(depPrevu))}`}
          tone={somme(depReel) <= somme(depPrevu) ? 'good' : 'bad'}
          sub={somme(depPrevu) ? `${pourcent(somme(depReel) / somme(depPrevu))} consommé` : undefined} />
        <StatCard label="Résultat réel" value={euros0(somme(resReel))}
          tone={somme(resReel) >= 0 ? 'good' : 'bad'} />
        <StatCard label="Résultat prévu" value={euros0(somme(resPrevu))}
          tone={somme(resPrevu) >= 0 ? 'good' : 'bad'} />
      </div>

      <Card title="Comparaison mensuelle (HT)" className="mb-5">
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table={`reelprevu:mensuel:${moisList.length}`} className="sheet text-xs" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th className="text-left" style={{ minWidth: 200 }}></th>
                {moisList.map(m => <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>)}
                <th className="num" style={{ minWidth: 96 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <Comparaison label="Produits" prevu={caPrevu} reel={caReel} sensPositif />
              <Comparaison label="Dépenses" prevu={depPrevu} reel={depReel} />
              <Comparaison label="Résultat" prevu={resPrevu} reel={resReel} sensPositif />
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Écarts par catégorie (HT)">
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="reelprevu:categories" className="sheet text-sm">
            <thead>
              <tr>
                <th className="text-left">Catégorie</th>
                <th>Bloc</th>
                <th className="num">Prévu</th>
                <th className="num">Réel</th>
                <th className="num">Écart</th>
                <th className="num">Consommé</th>
              </tr>
            </thead>
            <tbody>
              {parCategorie.map(l => (
                <tr key={l.cat}>
                  <td className="font-medium">{l.cat}</td>
                  <td style={{ color: '#6f6690' }}>{SECTIONS.find(s => s.cle === l.section)?.titre ?? l.section}</td>
                  <td className="text-right tabular-nums">{l.prevu ? euros(l.prevu) : <span style={{ color: '#9a92b5' }}>non budgété</span>}</td>
                  <td className="text-right tabular-nums font-medium">{l.reel ? euros(l.reel) : '·'}</td>
                  <td className="text-right tabular-nums"
                    style={{ color: l.section === 'produits' ? (l.ecart >= 0 ? '#38761d' : '#b7332e') : (l.ecart > 0 ? '#b7332e' : '#38761d') }}>
                    {l.prevu || l.reel ? euros(l.ecart) : '·'}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>
                    {l.prevu ? pourcent(l.reel / l.prevu) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
          Un écart positif sur une dépense signifie qu'elle dépasse le prévisionnel ; sur un produit,
          qu'il fait mieux que prévu. Les lignes « non budgété » remontent aussi dans les alarmes du Prévisionnel.
        </p>
      </Card>
    </div>
  );
}

function Comparaison({ label, prevu, reel, sensPositif }: {
  label: string; prevu: number[]; reel: number[]; sensPositif?: boolean;
}) {
  const ecart = reel.map((v, i) => r2(v - prevu[i]));
  const somme = (a: number[]) => r2(a.reduce((s, v) => s + v, 0));
  const bon = (v: number) => (sensPositif ? v >= 0 : v <= 0);
  return (
    <>
      <tr className="band-soft">
        <td>{label} — prévu</td>
        {prevu.map((v, i) => <td key={i} className="text-right tabular-nums" style={{ color: '#6f6690' }}>{v ? euros0(v) : '·'}</td>)}
        <td className="text-right tabular-nums">{euros(somme(prevu))}</td>
      </tr>
      <tr>
        <td className="pl-4">réel</td>
        {reel.map((v, i) => <td key={i} className="text-right tabular-nums font-medium">{v ? euros0(v) : '·'}</td>)}
        <td className="text-right tabular-nums font-semibold">{euros(somme(reel))}</td>
      </tr>
      <tr style={{ borderBottom: '2px solid var(--bbg-border)' }}>
        <td className="pl-4 italic" style={{ color: '#6f6690' }}>écart</td>
        {ecart.map((v, i) => (
          <td key={i} className="text-right tabular-nums"
            style={{ color: v === 0 ? '#c9c0e4' : bon(v) ? '#38761d' : '#b7332e' }}>
            {v ? euros0(v) : '·'}
          </td>
        ))}
        <td className="text-right tabular-nums" style={{ color: bon(somme(ecart)) ? '#38761d' : '#b7332e' }}>
          {euros(somme(ecart))}
        </td>
      </tr>
    </>
  );
}
