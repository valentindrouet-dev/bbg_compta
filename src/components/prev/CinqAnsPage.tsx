import { Fragment, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useStore } from '../../store';
import type { PrevLigne, PrevSection } from '../../types';
import { EXERCICES, moisExercice } from '../../utils/dates';
import { euros, euros0, r2, pourcent } from '../../utils/money';
import {
  compteResultat, dotationsParMois, immoInfos, produitsFinanciersParMois, syntheseExercice,
  type LigneResultat,
} from '../../utils/calc';
import { SECTIONS_DEPENSES, valeursDe } from '../../utils/previsionnel';
import { estChargeFinanciere, teinteBloc, type BlocCle } from '../../utils/blocs';
import { PageHeader, Card, StatCard, TotalBloc, styleBloc } from '../ui';

const DUREE_IMMO_PREVUE = 5;
const GRID = '#ddd6ef';
const INK = '#6f6690';

/** Les blocs suivis d'un exercice à l'autre, dans l'ordre de la synthèse. */
const BLOCS_SUIVIS: { cle: BlocCle; section: PrevSection; label: string }[] = [
  { cle: 'produits', section: 'produits', label: 'Produits' },
  { cle: 'charges', section: 'charges', label: 'Charges' },
  { cle: 'personnel', section: 'personnel', label: 'Personnel' },
  { cle: 'jeux', section: 'jeux', label: 'Dépenses Jeux' },
  { cle: 'immos', section: 'immos', label: 'Immobilisations' },
];

interface ColonneExercice {
  exercice: string;
  /** Prévu par bloc. */
  prevu: Map<PrevSection, number>;
  /** Réel par bloc, calculé depuis le journal. */
  reel: Map<PrevSection, number>;
  resultatPrevu: LigneResultat[];
  resultatReel: LigneResultat[];
  aDuPrevu: boolean;
  aDuReel: boolean;
}

export function CinqAnsPage() {
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const refs = useStore(s => s.referentiels);
  const previsionnels = useStore(s => s.previsionnels);
  const couleurs = useStore(s => s.blocCouleurs);

  const immos = useMemo(() => immoInfos(entries), [entries]);

  const colonnes: ColonneExercice[] = useMemo(() => EXERCICES.map(exercice => {
    const moisList = moisExercice(exercice);
    const lignes: PrevLigne[] = previsionnels[exercice] ?? [];
    const syn = syntheseExercice(entries, exercice, refs, 'ht');

    const carte = (calc: (i: number) => number) =>
      new Map(moisList.map((m, i) => [m, r2(calc(i))]));
    const prevuMois = (sec: PrevSection) => carte(i =>
      lignes.filter(l => l.section === sec && !l.unite)
        .reduce((s, l) => s + (valeursDe(l, lignes)[i] ?? 0), 0));
    const somme = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0));

    const prevu = new Map<PrevSection, number>();
    for (const b of BLOCS_SUIVIS) prevu.set(b.section, somme(prevuMois(b.section)));

    const reel = new Map<PrevSection, number>([
      ['produits', somme(syn.totalProduitsParMois)],
      ['charges', somme(syn.totalChargesParMois)],
      ['personnel', somme(syn.totalPersonnelParMois)],
      ['jeux', somme(syn.totalJeuxParMois)],
      ['immos', somme(syn.immoParMois)],
    ]);

    // Dotations prévues : biens déjà au bilan + investissements prévus.
    const dotationsReelles = dotationsParMois(immos, moisList);
    const immosPrevues = prevuMois('immos');
    const dotationsPrevues = carte(i => {
      let d = dotationsReelles.get(moisList[i]) ?? 0;
      for (let j = 0; j <= i; j++) d += (immosPrevues.get(moisList[j]) ?? 0) / (DUREE_IMMO_PREVUE * 12);
      return d;
    });
    const chargesFinPrevues = carte(i => lignes
      .filter(l => l.section === 'charges' && !l.unite && estChargeFinanciere(l.categorie))
      .reduce((s, l) => s + (valeursDe(l, lignes)[i] ?? 0), 0));

    const resultatPrevu = compteResultat({
      moisList,
      produits: prevuMois('produits'),
      charges: prevuMois('charges'),
      personnel: prevuMois('personnel'),
      jeux: prevuMois('jeux'),
      dotations: dotationsPrevues,
      produitsFinanciers: produitsFinanciersParMois(finances, moisList),
      chargesFinancieres: chargesFinPrevues,
    });

    const resultatReel = compteResultat({
      moisList,
      produits: syn.totalProduitsParMois,
      charges: syn.totalChargesParMois,
      personnel: syn.totalPersonnelParMois,
      jeux: syn.totalJeuxParMois,
      dotations: dotationsReelles,
      produitsFinanciers: produitsFinanciersParMois(finances, moisList),
      chargesFinancieres: syn.chargesFinancieresParMois,
    });

    return {
      exercice, prevu, reel, resultatPrevu, resultatReel,
      aDuPrevu: [...prevu.values()].some(v => v !== 0),
      aDuReel: [...reel.values()].some(v => v !== 0),
    };
  }), [entries, finances, refs, previsionnels, immos]);

  const de = (lignes: LigneResultat[], cle: string) => lignes.find(l => l.cle === cle)?.total ?? 0;

  /** Le chiffre qui fait foi : le réel s'il existe, le prévu sinon. */
  const retenu = (c: ColonneExercice, sec: PrevSection) =>
    c.aDuReel ? (c.reel.get(sec) ?? 0) : (c.prevu.get(sec) ?? 0);
  const resultatRetenu = (c: ColonneExercice) =>
    de(c.aDuReel ? c.resultatReel : c.resultatPrevu, 'rn');

  const graphique = colonnes.map(c => ({
    exercice: c.exercice,
    produits: retenu(c, 'produits'),
    depenses: r2(SECTIONS_DEPENSES.reduce((s, sec) => s + retenu(c, sec), 0)),
    resultat: resultatRetenu(c),
  }));

  const cumul = {
    produits: r2(graphique.reduce((s, g) => s + g.produits, 0)),
    depenses: r2(graphique.reduce((s, g) => s + g.depenses, 0)),
    resultat: r2(graphique.reduce((s, g) => s + g.resultat, 0)),
  };
  const remplis = colonnes.filter(c => c.aDuPrevu || c.aDuReel).length;

  const tProduits = teinteBloc('produits', couleurs);
  const tCharges = teinteBloc('charges', couleurs);
  const tResultat = teinteBloc('resultat', couleurs);

  /** Une ligne du tableau : un libellé, une valeur par exercice. */
  const Ligne = ({ label, valeurs, niveau = 'detail', bloc, signe }: {
    label: string; valeurs: number[]; niveau?: 'detail' | 'agregat' | 'final';
    bloc?: BlocCle; signe?: boolean;
  }) => (
    <tr className={niveau === 'agregat' ? 'band-bloc' : undefined}
      style={niveau === 'final' ? { fontWeight: 800 } : undefined}>
      <td className={niveau === 'detail' ? 'pl-4' : undefined}>
        <span className="inline-flex items-center gap-1.5">
          {bloc && <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: teinteBloc(bloc, couleurs).base }} />}
          {label}
        </span>
      </td>
      {valeurs.map((v, i) => (
        <td key={i} className="text-right tabular-nums"
          style={{
            fontSize: niveau === 'final' ? '0.95rem' : undefined,
            color: signe ? (v > 0 ? '#38761d' : v < 0 ? '#b7332e' : '#9a92b5') : undefined,
          }}>
          {v ? euros(v) : '·'}
        </td>
      ))}
      <td className="text-right tabular-nums font-semibold col-total"
        style={{ color: signe ? (r2(valeurs.reduce((s, v) => s + v, 0)) >= 0 ? '#2c5d16' : '#8f2b26') : undefined }}>
        {euros(r2(valeurs.reduce((s, v) => s + v, 0)))}
      </td>
    </tr>
  );

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Vue 5 ans"
        subtitle="Les cinq exercices côte à côte — prévisions, réalisé et résultat, pour lire la trajectoire"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Produits cumulés 2025-30" value={euros0(cumul.produits)} tone="good" />
        <StatCard label="Dépenses cumulées" value={euros0(cumul.depenses)} tone="accent" />
        <StatCard label="Résultat net cumulé" value={euros0(cumul.resultat)}
          tone={cumul.resultat >= 0 ? 'good' : 'bad'} />
        <StatCard label="Exercices renseignés" value={`${remplis} / ${EXERCICES.length}`}
          sub={remplis < EXERCICES.length ? 'les autres attendent leur prévisionnel' : 'tout est prévu'} />
      </div>

      <Card
        title="Trajectoire 2025-30 (HT)"
        className="mb-5"
        actions={<TotalBloc label="Résultat cumulé" valeur={euros(cumul.resultat)} t={tResultat} />}
      >
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={graphique} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="exercice" tick={{ fontSize: 12, fill: INK }} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tickFormatter={v => `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k€`}
              tick={{ fontSize: 11, fill: INK }} tickLine={false} axisLine={false} width={62} />
            <Tooltip
              formatter={(v: number, n: string) => [euros(v),
                n === 'produits' ? 'Produits' : n === 'depenses' ? 'Dépenses' : 'Résultat net']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${GRID}` }}
            />
            <Legend formatter={(v: string) => (
              <span style={{ color: '#3f3268', fontSize: 12 }}>
                {v === 'produits' ? 'Produits' : v === 'depenses' ? 'Dépenses' : 'Résultat net'}
              </span>
            )} />
            <ReferenceLine y={0} stroke={INK} strokeDasharray="4 3" />
            <Bar dataKey="produits" fill={tProduits.base} stroke={tProduits.bord} radius={[4, 4, 0, 0]} maxBarSize={38} />
            <Bar dataKey="depenses" fill={tCharges.base} stroke={tCharges.bord} radius={[4, 4, 0, 0]} maxBarSize={38} />
            <Line type="monotone" dataKey="resultat" stroke={tResultat.fonce} strokeWidth={2.5}
              dot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: tResultat.fonce }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs mt-1" style={{ color: '#9a92b5' }}>
          Chaque exercice affiche son <b>réel</b> dès qu'il porte des écritures, son <b>prévu</b> sinon.
          Aujourd'hui, seul {EXERCICES[0]} est réalisé.
        </p>
      </Card>

      <Card
        title="Prévisionnels 2025-30, bloc par bloc (HT)"
        className="mb-5"
        actions={<TotalBloc label="Produits prévus" valeur={euros(r2(colonnes.reduce((s, c) => s + (c.prevu.get('produits') ?? 0), 0)))} t={tProduits} />}
      >
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="cinqans:prev" data-bloc="resultat" className="sheet text-sm"
            style={{ minWidth: 780, ...styleBloc(tResultat) }}>
            <thead>
              <tr>
                <th className="text-left" style={{ minWidth: 230 }}>Bloc</th>
                {colonnes.map(c => <th key={c.exercice} className="num" style={{ minWidth: 104 }}>{c.exercice}</th>)}
                <th className="num" style={{ minWidth: 110 }}>Cumul</th>
              </tr>
            </thead>
            <tbody>
              {BLOCS_SUIVIS.map(b => (
                <Fragment key={b.cle}>
                  <Ligne label={`${b.label} — prévu`} bloc={b.cle}
                    valeurs={colonnes.map(c => c.prevu.get(b.section) ?? 0)} />
                  <tr style={{ fontStyle: 'italic', color: '#6f6690' }}>
                    <td className="pl-8">réel</td>
                    {colonnes.map(c => {
                      const v = c.reel.get(b.section) ?? 0;
                      return <td key={c.exercice} className="text-right tabular-nums">{v ? euros(v) : '·'}</td>;
                    })}
                    <td className="text-right tabular-nums col-total">
                      {euros(r2(colonnes.reduce((s, c) => s + (c.reel.get(b.section) ?? 0), 0)))}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-bloc">
                <td>TOTAL DÉPENSES PRÉVUES</td>
                {colonnes.map(c => {
                  const v = r2(SECTIONS_DEPENSES.reduce((s, sec) => s + (c.prevu.get(sec) ?? 0), 0));
                  return <td key={c.exercice} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                })}
                <td className="text-right tabular-nums grand">
                  {euros(r2(colonnes.reduce((s, c) =>
                    s + SECTIONS_DEPENSES.reduce((x, sec) => x + (c.prevu.get(sec) ?? 0), 0), 0)))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card
        title="Résultats 2025-30 — le compte de résultat, exercice par exercice (HT)"
        actions={<TotalBloc label="Résultat net cumulé" valeur={euros(cumul.resultat)} t={tResultat} />}
      >
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="cinqans:resultat" data-bloc="resultat" className="sheet text-sm"
            style={{ minWidth: 780, ...styleBloc(tResultat) }}>
            <thead>
              <tr>
                <th className="text-left" style={{ minWidth: 230 }}>Solde intermédiaire de gestion</th>
                {colonnes.map(c => (
                  <th key={c.exercice} className="num" style={{ minWidth: 104 }}>
                    {c.exercice}
                    <span className="block text-[10px] font-normal opacity-70">
                      {c.aDuReel ? 'réel' : 'prévu'}
                    </span>
                  </th>
                ))}
                <th className="num" style={{ minWidth: 110 }}>Cumul</th>
              </tr>
            </thead>
            <tbody>
              {([
                ['produits', "Produits d'exploitation", 'detail'],
                ['charges', "Charges d'exploitation", 'detail'],
                ['ebe', 'EBE', 'agregat'],
                ['dotations', 'Dotations aux amortissements', 'detail'],
                ['rex', "REX — Résultat d'exploitation", 'agregat'],
                ['pf', 'Produits financiers', 'detail'],
                ['cf', 'Charges financières', 'detail'],
                ['rc', 'RC — Résultat courant', 'agregat'],
                ['is', 'IS — Impôt sur les sociétés', 'detail'],
              ] as const).map(([cle, label, niveau]) => (
                <Ligne key={cle} label={label} niveau={niveau}
                  signe={niveau === 'agregat'}
                  valeurs={colonnes.map(c => de(c.aDuReel ? c.resultatReel : c.resultatPrevu, cle))} />
              ))}
            </tbody>
            <tfoot>
              <tr className="total-bloc">
                <td>RÉSULTAT NET</td>
                {colonnes.map(c => {
                  const v = resultatRetenu(c);
                  return (
                    <td key={c.exercice} className="text-right tabular-nums"
                      style={{ color: v >= 0 ? '#2c5d16' : '#8f2b26' }}>
                      {v ? euros0(v) : '·'}
                    </td>
                  );
                })}
                <td className="text-right tabular-nums grand"
                  style={{ color: cumul.resultat >= 0 ? '#2c5d16' : '#8f2b26' }}>
                  {euros(cumul.resultat)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-start gap-2 text-xs" style={{ color: '#5c5280' }}>
          <TrendingUp size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--bbg-purple-dark)' }} />
          <p className="flex-1">
            <b>Déficit reportable.</b> Une perte d'exercice n'est pas perdue : elle se reporte sans limite
            de durée sur les bénéfices suivants et vient réduire l'impôt à payer. Avec{' '}
            {euros(Math.abs(Math.min(0, resultatRetenu(colonnes[0]))))} de déficit sur {EXERCICES[0]},
            les premiers bénéfices des exercices suivants seront exonérés d'IS jusqu'à épuisement de ce
            report. Le tableau ci-dessus calcule l'IS exercice par exercice, <b>sans</b> tenir compte de ce
            report — la réalité sera donc plus favorable. À confirmer avec ton comptable au moment du bilan.
          </p>
        </div>
        {colonnes.some(c => !c.aDuPrevu && !c.aDuReel) && (
          <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
            Les exercices vides ({colonnes.filter(c => !c.aDuPrevu && !c.aDuReel).map(c => c.exercice).join(', ')})
            attendent leur prévisionnel : va dans l'onglet Prévisionnel, choisis l'exercice et ajoute tes lignes.
            Le taux de couverture des dépenses par les produits sera alors calculé ici :{' '}
            {cumul.depenses ? pourcent(cumul.produits / cumul.depenses) : '—'} aujourd'hui.
          </p>
        )}
      </Card>
    </div>
  );
}
