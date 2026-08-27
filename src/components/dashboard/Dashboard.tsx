import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Cell, LabelList,
} from 'recharts';
import { useStore } from '../../store';
import type { Page } from '../../App';
import { EXERCICES, labelMois, moisExercice, moisCourant } from '../../utils/dates';
import { euros, euros0, r2 } from '../../utils/money';
import { syntheseExercice, tableauTreso, tableauTVA, moisTresorerie } from '../../utils/calc';
import { PageHeader, Card, StatCard, Btn } from '../ui';
import { teinte } from '../../utils/couleurs';
import { useEtatVue } from '../../utils/etatVue';

// Couleurs choisies par Valentin pour l'accueil : menthe = produits,
// pêche = dépenses. Les traits et les étiquettes prennent la version foncée
// de la même teinte, sinon un pastel sur fond blanc ne se lit pas.
export const C_PRODUITS = '#b0f0da';
export const C_DEPENSES = '#fce5cd';
const C_PRODUITS_TRAIT = teinte(C_PRODUITS).bord;
const C_DEPENSES_TRAIT = teinte(C_DEPENSES).bord;
const C_TRESO = '#674ea7';
const INK_MUTED = '#6f6690';
const GRID = '#ddd6ef';

const kEuros = (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${v.toLocaleString('fr-FR')} €`;

export function Dashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const refs = useStore(s => s.referentiels);
  const [exercice, setExercice] = useEtatVue('dashboard.exercice', '2025-26',
    v => (EXERCICES as readonly string[]).includes(v));

  const data = useMemo(() => {
    const syn = syntheseExercice(entries, exercice, refs);
    const parMois = syn.moisList.map(m => ({
      mois: labelMois(m),
      produits: r2(syn.totalProduitsParMois.get(m) ?? 0),
      depenses: r2((syn.totalChargesParMois.get(m) ?? 0) + (syn.totalJeuxParMois.get(m) ?? 0) + (syn.immoParMois.get(m) ?? 0)),
    }));
    const treso = tableauTreso(entries, finances, moisTresorerie(entries, finances, moisCourant())).map(t => ({
      mois: labelMois(t.mois), solde: t.soldeCumule,
    }));
    const tva = tableauTVA(entries, moisExercice(exercice));
    const totProd = r2([...syn.totalProduitsParMois.values()].reduce((s, v) => s + v, 0));
    const totCharges = r2([...syn.totalChargesParMois.values()].reduce((s, v) => s + v, 0));
    const totJeux = r2([...syn.totalJeuxParMois.values()].reduce((s, v) => s + v, 0));
    const totImmo = r2([...syn.immoParMois.values()].reduce((s, v) => s + v, 0));
    const cats = [...syn.charges.entries()]
      .map(([cat, byMois]) => ({ cat, ht: r2([...byMois.values()].reduce((s, v) => s + v, 0)) }))
      .sort((a, b) => b.ht - a.ht);
    const top = cats.slice(0, 8);
    const reste = r2(cats.slice(8).reduce((s, c) => s + c.ht, 0));
    if (reste > 0) top.push({ cat: 'Autres catégories', ht: reste });
    const soldeTVA = r2(tva.reduce((s, x) => s + x.solde, 0));
    return { parMois, treso, totProd, totCharges, totJeux, totImmo, top, soldeTVA };
  }, [entries, finances, refs.categoriesJeux, exercice]);

  const soldeActuel = data.treso.length ? data.treso[data.treso.length - 1].solde : 0;
  const resultat = r2(data.totProd - data.totCharges - data.totJeux);

  return (
    <div className="p-4 w-full max-w-[1700px]">
      <PageHeader
        title="Tableau de bord"
        subtitle={`Exercice ${exercice} — ${labelMois(moisCourant())}`}
        actions={
          <>
            <select
              className="border border-[#c9c0e4] rounded-md px-2 py-1.5 text-sm bg-white"
              value={exercice}
              onChange={ev => setExercice(ev.target.value)}
            >
              {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
            </select>
            <Btn variant="primary" onClick={() => onNavigate('journal')}>+ Saisir une dépense</Btn>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Produits (HT)" value={euros0(data.totProd)} />
        <StatCard label="Charges + Jeux (HT)" value={euros0(r2(data.totCharges + data.totJeux))}
          sub={`dont jeux ${euros0(data.totJeux)}`} />
        <StatCard label="Résultat simplifié" value={euros0(resultat)} tone={resultat >= 0 ? 'good' : 'bad'}
          sub="produits − charges − jeux" />
        <StatCard label="Trésorerie disponible" value={euros0(soldeActuel)} tone={soldeActuel >= 0 ? 'good' : 'bad'} />
        <StatCard label={data.soldeTVA > 0 ? 'TVA à reverser (exercice)' : 'Crédit de TVA (exercice)'}
          value={euros0(Math.abs(data.soldeTVA))} tone={data.soldeTVA > 0 ? 'bad' : 'good'}
          sub={data.soldeTVA > 0 ? 'dû à l\'État' : 'l\'État te le doit'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Produits vs dépenses par mois (HT)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.parMois} barGap={2} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="mois" tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tickFormatter={kEuros} tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={false} width={56} />
              <Tooltip
                formatter={(v: number, name: string) => [euros(v), name === 'produits' ? 'Produits' : 'Dépenses']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${GRID}` }}
              />
              <Legend
                formatter={(v: string) => <span style={{ color: '#3f3268', fontSize: 12 }}>{v === 'produits' ? 'Produits' : 'Dépenses (charges + jeux + immo)'}</span>}
              />
              <Bar dataKey="produits" fill={C_PRODUITS} stroke={C_PRODUITS_TRAIT} radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="depenses" fill={C_DEPENSES} stroke={C_DEPENSES_TRAIT} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Trésorerie cumulée (TTC)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.treso} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="mois" tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tickFormatter={kEuros} tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={false} width={64} />
              <Tooltip
                formatter={(v: number) => [euros(v), 'Solde cumulé']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${GRID}` }}
              />
              <ReferenceLine y={0} stroke={INK_MUTED} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="solde" stroke={C_TRESO} strokeWidth={2}
                dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-[#9a92b5]">Hors sommes placées — détail dans l'onglet Trésorerie.</p>
        </Card>
      </div>

      <div className="mt-6">
        <Card title={`Charges par catégorie — exercice ${exercice} (HT)`}>
          <ResponsiveContainer width="100%" height={Math.max(220, data.top.length * 34)}>
            <BarChart data={data.top} layout="vertical" margin={{ top: 0, right: 90, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" tickFormatter={kEuros} tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="cat" width={210} tick={{ fontSize: 12, fill: '#3f3268' }} tickLine={false} axisLine={{ stroke: GRID }} />
              <Tooltip
                formatter={(v: number) => [euros(v), 'Total HT']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${GRID}` }}
              />
              <Bar dataKey="ht" fill={C_DEPENSES} stroke={C_DEPENSES_TRAIT} radius={[0, 4, 4, 0]} maxBarSize={16}>
                {data.top.map((c, i) => <Cell key={i} fillOpacity={c.cat === 'Autres catégories' ? 0.45 : 1} />)}
                <LabelList dataKey="ht" position="right" formatter={(v: number) => euros0(v)}
                  style={{ fontSize: 11, fill: '#3f3268' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
