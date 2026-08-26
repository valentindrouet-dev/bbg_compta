import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { Plus, Trash2, Gamepad2 } from 'lucide-react';
import { useStore } from '../../store';
import { labelMois, formatDateFR, compareMois, EXERCICES } from '../../utils/dates';
import { euros, euros0, r2, pourcent } from '../../utils/money';
import { bilanJeux } from '../../utils/calc';

import { PageHeader, Card, StatCard, Btn, useSort, sortBy, ThSort } from '../ui';

const C_REEL = '#e69138';
const C_PREVU = '#674ea7';
const GRID = '#ddd6ef';

const kEuros = (v: number) => Math.abs(v) >= 1000
  ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€`
  : `${v.toLocaleString('fr-FR')} €`;

export function JeuxPage() {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const previsionnels = useStore(s => s.previsionnels);
  const addJeu = useStore(s => s.addJeu);
  const renameJeu = useStore(s => s.renameJeu);
  const removeJeu = useStore(s => s.removeJeu);
  const updateEntry = useStore(s => s.updateEntry);

  const jeux = refs.jeux ?? [];
  const [nouveau, setNouveau] = useState('');
  const [actif, setActif] = useState<string | null>(null);
  const { sort, toggle } = useSort({ key: 'date', dir: 'asc' });

  const bilans = useMemo(
    () => bilanJeux(entries, refs.categoriesJeux),
    [entries, refs.categoriesJeux],
  );

  /**
   * Prévu par jeu : on additionne les lignes « jeux » du prévisionnel dont le
   * libellé mentionne le jeu (« EDIT — Contrat d'Illustrations », « Illustrations EDIT »…).
   */
  const prevuParJeu = useMemo(() => {
    const m = new Map<string, number>();
    for (const ex of EXERCICES) {
      for (const l of previsionnels[ex] ?? []) {
        if (l.section !== 'jeux' || l.unite) continue;
        const somme = l.valeurs.reduce<number>((s, v) => s + (v ?? 0), 0);
        if (!somme) continue;
        const hay = l.categorie.toUpperCase();
        for (const j of jeux) {
          if (hay.includes(j.toUpperCase())) m.set(j, r2((m.get(j) ?? 0) + somme));
        }
      }
    }
    return m;
  }, [previsionnels, jeux]);

  const prevuDe = (jeu: string) => prevuParJeu.get(jeu) ?? null;

  const totalDepense = r2(bilans.reduce((s, b) => s + b.ht, 0));
  const jeuActif = actif ? bilans.find(b => b.jeu === actif) : null;

  const ecrituresJeu = useMemo(() => {
    if (!actif) return [];
    return entries.filter(e =>
      refs.categoriesJeux.includes(e.categorie) && (e.jeu || '— non rattaché —') === actif);
  }, [entries, refs.categoriesJeux, actif]);

  const rowsEcritures = sortBy(ecrituresJeu, sort, {
    date: e => e.date, fournisseur: e => e.fournisseur, description: e => e.description,
    categorie: e => e.categorie, ttc: e => e.ttc, ht: e => e.ht, mois: e => e.mois,
  });

  // Comparatif réel / prévu pour le graphique
  const comparatif = bilans.map(b => ({
    jeu: b.jeu, reel: b.ht, prevu: prevuDe(b.jeu) ?? 0,
  }));

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Jeux"
        subtitle="Toutes les dépenses de développement, ventilées par jeu — et comparées au prévisionnel"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Jeux suivis" value={String(bilans.length)} />
        <StatCard label="Total dépensé (HT)" value={euros0(totalDepense)} tone="accent" />
        <StatCard label="Total prévu au prévisionnel (HT)"
          value={euros0(r2([...prevuParJeu.values()].reduce((s, v) => s + v, 0)))} />
        <StatCard label="Écritures jeux"
          value={String(bilans.reduce((s, b) => s + b.nb, 0))} />
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">
          <Card title="Vue d'ensemble par jeu">
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="sheet text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Jeu</th>
                    <th className="num">Écritures</th>
                    <th className="num">Total HT</th>
                    <th className="num">Total TTC</th>
                    <th className="num">TVA</th>
                    <th className="num">Prévu (budget)</th>
                    <th className="num">Consommé</th>
                    <th>Première</th>
                    <th>Dernière</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bilans.map(b => {
                    const prevu = prevuDe(b.jeu);
                    return (
                      <tr
                        key={b.jeu}
                        className={actif === b.jeu ? 'is-selected' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActif(actif === b.jeu ? null : b.jeu)}
                      >
                        <td className="font-semibold" style={{ color: 'var(--bbg-purple-darker)' }}>
                          <span className="inline-flex items-center gap-1.5">
                            <Gamepad2 size={14} style={{ color: 'var(--bbg-orange-dark)' }} />
                            {b.jeu}
                          </span>
                        </td>
                        <td className="text-right tabular-nums">{b.nb}</td>
                        <td className="text-right tabular-nums font-semibold">{euros(b.ht)}</td>
                        <td className="text-right tabular-nums">{euros(b.ttc)}</td>
                        <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>{euros(b.tva)}</td>
                        <td className="text-right tabular-nums">
                          {prevu != null ? euros(prevu) : <span style={{ color: '#9a92b5' }}>—</span>}
                        </td>
                        <td className="text-right tabular-nums"
                          style={{ color: prevu && b.ht > prevu ? '#b7332e' : '#38761d' }}>
                          {prevu ? pourcent(b.ht / prevu) : '—'}
                        </td>
                        <td style={{ color: '#6f6690' }}>{formatDateFR(b.premiere)}</td>
                        <td style={{ color: '#6f6690' }}>{formatDateFR(b.derniere)}</td>
                        <td style={{ color: '#9a92b5' }} className="text-xs">
                          {actif === b.jeu ? 'ouvert' : 'détail →'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="text-right tabular-nums">{bilans.reduce((s, b) => s + b.nb, 0)}</td>
                    <td className="text-right tabular-nums">{euros(totalDepense)}</td>
                    <td className="text-right tabular-nums">{euros(r2(bilans.reduce((s, b) => s + b.ttc, 0)))}</td>
                    <td className="text-right tabular-nums">{euros(r2(bilans.reduce((s, b) => s + b.tva, 0)))}</td>
                    <td colSpan={5}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {comparatif.some(c => c.prevu > 0) && (
            <Card title="Dépensé vs budgété (HT)">
              <ResponsiveContainer width="100%" height={Math.max(180, comparatif.length * 56)}>
                <BarChart data={comparatif} layout="vertical" margin={{ top: 4, right: 80, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={GRID} />
                  <XAxis type="number" tickFormatter={kEuros} tick={{ fontSize: 11, fill: '#6f6690' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="jeu" width={120} tick={{ fontSize: 12, fill: '#3f3268' }} tickLine={false} axisLine={{ stroke: GRID }} />
                  <Tooltip
                    formatter={(v: number, n: string) => [euros(v), n === 'reel' ? 'Dépensé' : 'Budgété']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${GRID}` }}
                  />
                  <Bar dataKey="prevu" fill={C_PREVU} radius={[0, 4, 4, 0]} maxBarSize={13} name="prevu" />
                  <Bar dataKey="reel" fill={C_REEL} radius={[0, 4, 4, 0]} maxBarSize={13} name="reel">
                    <LabelList dataKey="reel" position="right" formatter={(v: number) => euros0(v)}
                      style={{ fontSize: 11, fill: '#3f3268' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs mt-1" style={{ color: '#9a92b5' }}>
                <span style={{ color: C_PREVU }}>■</span> budgété (coûts de développement du prévisionnel) ·{' '}
                <span style={{ color: C_REEL }}>■</span> réellement dépensé. La correspondance se fait
                sur le nom du jeu ; les coûts de fabrication restent dans le Production Calculator.
              </p>
            </Card>
          )}

          {jeuActif && (
            <>
              <Card title={`${jeuActif.jeu} — dépenses par catégorie (HT)`}>
                <table className="sheet text-sm">
                  <thead>
                    <tr><th className="text-left">Catégorie</th><th className="num">Montant HT</th><th className="num">Part</th></tr>
                  </thead>
                  <tbody>
                    {[...jeuActif.parCategorie.entries()].sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                      <tr key={cat}>
                        <td>{cat}</td>
                        <td className="text-right tabular-nums font-medium">{euros(r2(v))}</td>
                        <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>{pourcent(v / jeuActif.ht)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td>Total</td><td className="text-right tabular-nums">{euros(jeuActif.ht)}</td><td></td></tr>
                  </tfoot>
                </table>
              </Card>

              <Card title={`${jeuActif.jeu} — répartition mensuelle (HT)`}>
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="sheet text-xs">
                    <thead>
                      <tr>
                        {[...jeuActif.parMois.keys()].sort(compareMois).map(m => (
                          <th key={m} className="num" style={{ minWidth: 78 }}>{labelMois(m)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {[...jeuActif.parMois.keys()].sort(compareMois).map(m => (
                          <td key={m} className="text-right tabular-nums">{euros(r2(jeuActif.parMois.get(m)!))}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card title={`${jeuActif.jeu} — ${rowsEcritures.length} écritures`}>
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="sheet text-sm">
                    <thead>
                      <tr>
                        <ThSort label="Date" k="date" sort={sort} onToggle={toggle} />
                        <ThSort label="Mois" k="mois" sort={sort} onToggle={toggle} />
                        <ThSort label="Fournisseur" k="fournisseur" sort={sort} onToggle={toggle} />
                        <ThSort label="Description" k="description" sort={sort} onToggle={toggle} />
                        <ThSort label="Catégorie" k="categorie" sort={sort} onToggle={toggle} />
                        <ThSort label="TTC" k="ttc" sort={sort} onToggle={toggle} className="num" />
                        <ThSort label="HT" k="ht" sort={sort} onToggle={toggle} className="num" />
                        <th>Jeu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsEcritures.map(e => (
                        <tr key={e.id}>
                          <td>{formatDateFR(e.date)}</td>
                          <td style={{ color: '#6f6690' }}>{labelMois(e.mois)}</td>
                          <td>{e.fournisseur}</td>
                          <td>{e.description}</td>
                          <td>{e.categorie}</td>
                          <td className="text-right tabular-nums">{euros(e.ttc)}</td>
                          <td className="text-right tabular-nums font-medium">{euros(e.ht)}</td>
                          <td>
                            <select className="pill-yellow" value={e.jeu ?? ''}
                              onChange={ev => updateEntry(e.id, { jeu: ev.target.value })}>
                              <option value="">— non rattaché —</option>
                              {jeux.map(j => <option key={j} value={j}>{j}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Catalogue des jeux">
            <ul className="space-y-1 mb-3">
              {jeux.map(j => (
                <li key={j} className="flex items-center gap-1 group">
                  <input
                    className="flex-1 border rounded px-2 py-1 text-sm"
                    style={{ borderColor: 'var(--bbg-border-soft)' }}
                    defaultValue={j}
                    onBlur={ev => { const v = ev.target.value.trim(); if (v && v !== j) renameJeu(j, v); }}
                    onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                  />
                  <button
                    className="opacity-0 group-hover:opacity-100 shrink-0" style={{ color: '#d98b86' }}
                    title="Retirer du catalogue (les écritures sont conservées, sans rattachement)"
                    onClick={() => { if (confirm(`Retirer « ${j} » du catalogue ?`)) removeJeu(j); }}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-1">
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                style={{ borderColor: 'var(--bbg-border)' }}
                placeholder="Nouveau jeu"
                value={nouveau}
                onChange={ev => setNouveau(ev.target.value)}
                onKeyDown={ev => { if (ev.key === 'Enter' && nouveau.trim()) { addJeu(nouveau); setNouveau(''); } }}
              />
              <Btn variant="ghost" onClick={() => { if (nouveau.trim()) { addJeu(nouveau); setNouveau(''); } }}>
                <Plus size={14} />
              </Btn>
            </div>
          </Card>

          <Card title="Comment ça marche">
            <p className="text-xs leading-relaxed" style={{ color: '#5c5280' }}>
              Une écriture est rattachée à un jeu via la colonne <b>Jeu</b> de la section
              « Dépenses Jeux » du journal. À l'import, le rattachement a été déduit des mots clés
              (EDIT, CAMINO, TORNADICES) et du nom des catégories.
              <br /><br />
              Cette page couvre le <b>développement</b> : illustrations, direction artistique,
              prototypage, avances sur droits d'auteur. Les <b>coûts de fabrication</b> (devis usines,
              composants, transport) restent dans le Production Calculator — les deux seront reliés
              plus tard.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
