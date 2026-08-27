import { Fragment, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useStore } from '../../store';
import { EXERCICES, labelMois, formatDateFR } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { syntheseExercice, immoInfos, dotationDuMois, ecrituresDeCellule, type BaseMontant } from '../../utils/calc';
import { PageHeader, Card, Btn } from '../ui';
import type { JournalEntry } from '../../types';

type Bloc = 'charges' | 'jeux' | 'immos' | 'produits';

/** Petit panneau listant les écritures derrière une valeur de la synthèse. */
function ApercuCellule({ ecritures, titre, x, y }: {
  ecritures: JournalEntry[]; titre: string; x: number; y: number;
}) {
  if (!ecritures.length) return null;
  const total = r2(ecritures.reduce((s, e) => s + e.ht, 0));
  // Le panneau se replace à gauche / au-dessus s'il déborde de la fenêtre.
  const largeur = 380;
  const gauche = Math.min(x + 14, window.innerWidth - largeur - 12);
  const hauteur = Math.min(60 + ecritures.length * 20, 320);
  const haut = y + hauteur + 20 > window.innerHeight ? Math.max(8, y - hauteur - 12) : y + 16;
  return (
    <div
      className="fixed z-50 rounded-md shadow-lg border bg-white text-xs pointer-events-none"
      style={{ left: gauche, top: haut, width: largeur, borderColor: 'var(--bbg-border)' }}
    >
      <div className="px-3 py-1.5 border-b font-semibold rounded-t-md"
        style={{ backgroundColor: 'var(--bbg-lavender)', borderColor: 'var(--bbg-border-soft)', color: 'var(--bbg-purple-darker)' }}>
        {titre} — {ecritures.length} opération{ecritures.length > 1 ? 's' : ''}
      </div>
      <div className="max-h-64 overflow-hidden py-1">
        {ecritures.slice(0, 12).map(e => (
          <div key={e.id} className="flex items-baseline gap-2 px-3 py-0.5">
            <span className="shrink-0 tabular-nums" style={{ color: '#9a92b5', width: 52 }}>{formatDateFR(e.date).slice(0, 5)}</span>
            <span className="shrink-0 font-medium truncate" style={{ width: 96 }}>{e.fournisseur}</span>
            <span className="flex-1 truncate" style={{ color: '#6f6690' }}>{e.description}</span>
            <span className="shrink-0 tabular-nums font-semibold">{euros(e.ht)}</span>
          </div>
        ))}
        {ecritures.length > 12 && (
          <div className="px-3 py-0.5 italic" style={{ color: '#9a92b5' }}>
            … et {ecritures.length - 12} autre{ecritures.length - 12 > 1 ? 's' : ''}
          </div>
        )}
      </div>
      <div className="px-3 py-1.5 border-t flex justify-between font-bold rounded-b-md"
        style={{ backgroundColor: 'var(--bbg-purple-light)', borderColor: 'var(--bbg-border-soft)', color: 'var(--bbg-purple-darker)' }}>
        <span>Total HT</span><span className="tabular-nums">{euros(total)}</span>
      </div>
    </div>
  );
}

export function SynthesePage() {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const [exercice, setExercice] = useState('2025-26');
  const [base, setBase] = useState<BaseMontant>('ht');
  const [apercuActif, setApercuActif] = useState(
    () => localStorage.getItem('bbg-apercu-synthese') !== 'off');
  const [apercu, setApercu] = useState<
    { titre: string; ecritures: JournalEntry[]; x: number; y: number } | null>(null);

  function basculerApercu() {
    setApercuActif(v => {
      localStorage.setItem('bbg-apercu-synthese', v ? 'off' : 'on');
      if (v) setApercu(null);
      return !v;
    });
  }

  const syn = useMemo(
    () => syntheseExercice(entries, exercice, refs.categoriesJeux, base),
    [entries, exercice, refs.categoriesJeux, base],
  );

  /** Prépare l'aperçu d'une cellule (catégorie ou jeu × mois). */
  function survol(
    ev: React.MouseEvent, mois: string, titre: string,
    opts: { categorie?: string; jeu?: string; type?: 'charges' | 'immo' | 'produit' },
  ) {
    if (!apercuActif) return;
    const ecritures = ecrituresDeCellule(entries, mois, opts);
    if (!ecritures.length) { setApercu(null); return; }
    setApercu({ titre, ecritures, x: ev.clientX, y: ev.clientY });
  }
  const quitte = () => setApercu(null);
  const immos = useMemo(() => immoInfos(entries), [entries]);
  const meta = refs.categoriesMeta ?? {};
  const groupes = refs.groupes ?? [];

  // Catégories présentes dans l'exercice, dans l'ordre du référentiel
  const catsDe = (source: Map<string, Map<string, number>>, ref: string[]) =>
    ref.filter(c => source.has(c)).concat([...source.keys()].filter(c => !ref.includes(c)));

  const unite = base === 'ttc' ? 'TTC' : 'HT';
  const blocs: { cle: Bloc; titre: string; cats: string[]; data: Map<string, Map<string, number>>;
    totaux: Map<string, number>; couleur: string; entete: string; }[] = [
    {
      cle: 'charges', titre: `Charges par catégorie (${unite})`,
      cats: catsDe(syn.charges, refs.categoriesDepenses), data: syn.charges,
      totaux: syn.totalChargesParMois, couleur: 'var(--bbg-orange-light)', entete: 'var(--bbg-orange)',
    },
    {
      cle: 'jeux', titre: `Dépenses Jeux par catégorie (${unite})`,
      cats: catsDe(syn.jeux, refs.categoriesJeux), data: syn.jeux,
      totaux: syn.totalJeuxParMois, couleur: 'var(--bbg-yellow-light)', entete: 'var(--bbg-yellow)',
    },
    {
      cle: 'immos', titre: `Immobilisations — investissements (${unite})`,
      cats: [...syn.immos.keys()], data: syn.immos,
      totaux: syn.immoParMois, couleur: 'var(--bbg-purple-light)', entete: 'var(--bbg-purple-light)',
    },
    {
      cle: 'produits', titre: `Produits par catégorie (${unite})`,
      cats: catsDe(syn.produits, refs.categoriesProduits), data: syn.produits,
      totaux: syn.totalProduitsParMois, couleur: 'var(--bbg-green-light)', entete: 'var(--bbg-green)',
    },
  ];

  const moisAvecDonnees = syn.moisList.filter(m =>
    (syn.totalTTCParMois.get(m) ?? 0) !== 0 || (syn.totalProduitsParMois.get(m) ?? 0) !== 0);
  const nbMois = Math.max(1, moisAvecDonnees.length);

  const totalLigne = (data: Map<string, Map<string, number>>, cat: string) =>
    r2([...(data.get(cat)?.values() ?? [])].reduce((s, v) => s + v, 0));

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Synthèse annuelle"
        subtitle="Catégories en lignes, mois en colonnes — recalculé en direct depuis le journal"
        actions={
          <>
            <div className="flex rounded-md border overflow-hidden text-sm" style={{ borderColor: 'var(--bbg-border)' }}>
              {(['ht', 'ttc'] as BaseMontant[]).map(b => (
                <button
                  key={b}
                  className="px-3 py-1.5 font-semibold transition-colors"
                  style={base === b
                    ? { backgroundColor: 'var(--bbg-purple-dark)', color: '#fff' }
                    : { backgroundColor: '#fff', color: '#5c5280' }}
                  onClick={() => setBase(b)}
                >
                  {b.toUpperCase()}
                </button>
              ))}
            </div>
            <Btn onClick={basculerApercu} title="Afficher le détail des opérations au survol d'une case">
              <span className="inline-flex items-center gap-1">
                {apercuActif ? <Eye size={14} /> : <EyeOff size={14} />}
                Aperçu {apercuActif ? 'activé' : 'désactivé'}
              </span>
            </Btn>
          <select
            className="border rounded-md px-2 py-1.5 text-sm bg-white font-medium"
            style={{ borderColor: 'var(--bbg-border)', color: 'var(--bbg-purple-darker)' }}
            value={exercice}
            onChange={ev => setExercice(ev.target.value)}
          >
            {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
          </select>
          </>
        }
      />

      <div className="space-y-5">
        {blocs.filter(b => b.cats.length > 0).map(bloc => {
          // Répartition des catégories par groupe, dans l'ordre défini en paramètres.
          const parGroupe = new Map<string, string[]>();
          for (const c of bloc.cats) {
            const g = meta[c]?.groupe ?? '';
            if (!parGroupe.has(g)) parGroupe.set(g, []);
            parGroupe.get(g)!.push(c);
          }
          const ordreGroupes = [...groupes.filter(g => parGroupe.has(g)), ...(parGroupe.has('') ? [''] : [])];
          const avecGroupes = ordreGroupes.length > 1 || (ordreGroupes.length === 1 && ordreGroupes[0] !== '');

          return (
            <Card key={bloc.cle} title={bloc.titre}>
              <div className="overflow-x-auto -mx-4 px-4">
                <table data-table={`synthese:${bloc.cle}:${syn.moisList.length}`} className="sheet text-xs" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th className="text-left" style={{ minWidth: 230 }}>Catégorie</th>
                      {syn.moisList.map(m => (
                        <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>
                      ))}
                      <th className="num" style={{ minWidth: 96, backgroundColor: bloc.entete, color: '#3f3268' }}>Total</th>
                      <th className="num" style={{ minWidth: 84, backgroundColor: bloc.entete, color: '#3f3268' }}>/ mois</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordreGroupes.map(g => (
                      <Fragment key={`grp-${g}`}>
                        {avecGroupes && (
                          <tr className="band-soft">
                            <td colSpan={syn.moisList.length + 3} className="py-1">
                              {g || '— sans groupe —'}
                            </td>
                          </tr>
                        )}
                        {parGroupe.get(g)!.map(cat => {
                          const tot = totalLigne(bloc.data, cat);
                          return (
                            <tr key={cat}>
                              <td>
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                    style={{ backgroundColor: meta[cat]?.couleur || bloc.couleur }}
                                  />
                                  {cat}
                                </span>
                              </td>
                              {syn.moisList.map(m => {
                                const v = bloc.data.get(cat)?.get(m) ?? 0;
                                return (
                                  <td
                                    key={m} className="text-right tabular-nums"
                                    onMouseEnter={ev => survol(ev, m, `${cat} — ${labelMois(m)}`, {
                                      categorie: cat,
                                      type: bloc.cle === 'immos' ? 'immo' : bloc.cle === 'produits' ? 'produit' : 'charges',
                                    })}
                                    onMouseLeave={quitte}
                                  >
                                    {v ? euros(r2(v)) : '·'}
                                  </td>
                                );
                              })}
                              <td className="text-right tabular-nums font-semibold" style={{ backgroundColor: bloc.couleur }}>
                                {euros(tot)}
                              </td>
                              <td className="text-right tabular-nums" style={{ backgroundColor: bloc.couleur, color: '#5c5280' }}>
                                {euros(r2(tot / nbMois))}
                              </td>
                            </tr>
                          );
                        })}
                        {avecGroupes && parGroupe.get(g)!.length > 1 && (
                          <tr style={{ fontStyle: 'italic' }}>
                            <td style={{ color: '#6f6690' }}>Sous-total {g || 'sans groupe'}</td>
                            {syn.moisList.map(m => {
                              const v = parGroupe.get(g)!.reduce((s, c) => s + (bloc.data.get(c)?.get(m) ?? 0), 0);
                              return <td key={m} className="text-right tabular-nums" style={{ color: '#6f6690' }}>{v ? euros(r2(v)) : '·'}</td>;
                            })}
                            <td className="text-right tabular-nums" style={{ backgroundColor: bloc.couleur, color: '#5c5280' }}>
                              {euros(r2(parGroupe.get(g)!.reduce((s, c) => s + totalLigne(bloc.data, c), 0)))}
                            </td>
                            <td style={{ backgroundColor: bloc.couleur }}></td>
                          </tr>
                        )}
                      </Fragment>
                    ))}

                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total {bloc.cle === 'produits' ? 'produits' : bloc.cle === 'jeux' ? 'jeux' : 'charges'} (HT)</td>
                      {syn.moisList.map(m => (
                        <td key={m} className="text-right tabular-nums">{euros(r2(bloc.totaux.get(m) ?? 0))}</td>
                      ))}
                      <td className="text-right tabular-nums">
                        {euros(r2([...bloc.totaux.values()].reduce((s, v) => s + v, 0)))}
                      </td>
                      <td className="text-right tabular-nums">
                        {euros(r2([...bloc.totaux.values()].reduce((s, v) => s + v, 0) / nbMois))}
                      </td>
                    </tr>
                    {bloc.cle === 'charges' && (
                      <tr>
                        <td>Total dépenses (TTC)</td>
                        {syn.moisList.map(m => (
                          <td key={m} className="text-right tabular-nums">{euros(r2(syn.totalTTCParMois.get(m) ?? 0))}</td>
                        ))}
                        <td className="text-right tabular-nums">
                          {euros(r2([...syn.totalTTCParMois.values()].reduce((s, v) => s + v, 0)))}
                        </td>
                        <td></td>
                      </tr>
                    )}
                    {bloc.cle === 'produits' && (
                      <tr>
                        <td>Total produits (TTC)</td>
                        {syn.moisList.map(m => (
                          <td key={m} className="text-right tabular-nums">{euros(r2(syn.totalProduitsTTCParMois.get(m) ?? 0))}</td>
                        ))}
                        <td className="text-right tabular-nums">
                          {euros(r2([...syn.totalProduitsTTCParMois.values()].reduce((s, v) => s + v, 0)))}
                        </td>
                        <td></td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
              {bloc.cle === 'charges' && (
                <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
                  « / mois » = moyenne sur les {nbMois} mois qui portent des écritures.
                  Les couleurs et les groupes se règlent dans l'onglet Catégories.
                </p>
              )}
              {bloc.cle === 'immos' && (
                <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
                  Une immobilisation n'est <b>pas une charge de l'exercice</b> : c'est un investissement
                  (travaux, matériel) inscrit à l'actif. Le montant apparaît ici le mois de l'achat, mais
                  ce qui pèse sur le résultat, c'est la <b>dotation aux amortissements</b> — étalée sur la
                  durée de vie du bien, dans le tableau ci-dessous. Le détail bien par bien est dans
                  l'onglet Immobilisations.
                </p>
              )}
            </Card>
          );
        })}

        {syn.jeuxParJeu.size > 0 && (
          <Card title={`Dépenses Jeux par jeu (${unite})`}>
            <div className="overflow-x-auto -mx-4 px-4">
              <table data-table={`synthese:jeux-par-jeu:${syn.moisList.length}`} className="sheet text-xs" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th className="text-left" style={{ minWidth: 230 }}>Jeu</th>
                    {syn.moisList.map(m => <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>)}
                    <th className="num" style={{ minWidth: 96, backgroundColor: 'var(--bbg-yellow)', color: '#3f3268' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...syn.jeuxParJeu.entries()]
                    .sort((a, b) => [...b[1].values()].reduce((s, v) => s + v, 0) - [...a[1].values()].reduce((s, v) => s + v, 0))
                    .map(([jeu, parMois]) => (
                    <tr key={jeu}>
                      <td className="font-medium">{jeu}</td>
                      {syn.moisList.map(m => {
                        const v = parMois.get(m) ?? 0;
                        return (
                          <td
                            key={m} className="text-right tabular-nums"
                            onMouseEnter={ev => survol(ev, m, `${jeu} — ${labelMois(m)}`, { jeu })}
                            onMouseLeave={quitte}
                          >
                            {v ? euros(r2(v)) : '·'}
                          </td>
                        );
                      })}
                      <td className="text-right tabular-nums font-semibold" style={{ backgroundColor: 'var(--bbg-yellow-light)' }}>
                        {euros(r2([...parMois.values()].reduce((s, v) => s + v, 0)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total jeux ({unite})</td>
                    {syn.moisList.map(m => (
                      <td key={m} className="text-right tabular-nums">{euros(r2(syn.totalJeuxParMois.get(m) ?? 0))}</td>
                    ))}
                    <td className="text-right tabular-nums">
                      {euros(r2([...syn.totalJeuxParMois.values()].reduce((s, v) => s + v, 0)))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
              Le rattachement à un jeu se fait dans la colonne « Jeu » du journal (section Dépenses Jeux).
              Le détail complet par jeu est dans l'onglet Jeux.
            </p>
          </Card>
        )}

        <Card title="Dotations aux amortissements">
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table={`synthese:dotations:${syn.moisList.length}`} className="sheet text-xs" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th className="text-left" style={{ minWidth: 230 }}>Dotations</th>
                  {syn.moisList.map(m => <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>)}
                  <th className="num" style={{ minWidth: 96 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Dotation du mois</td>
                  {syn.moisList.map(m => {
                    const d = dotationDuMois(immos, m);
                    return <td key={m} className="text-right tabular-nums">{d ? euros(d) : '·'}</td>;
                  })}
                  <td className="text-right tabular-nums font-semibold">
                    {euros(r2(syn.moisList.reduce((s, m) => s + dotationDuMois(immos, m), 0)))}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: '#6f6690' }}>Cumul sur l'exercice</td>
                  {(() => {
                    let cumul = 0;
                    return syn.moisList.map(m => {
                      cumul = r2(cumul + dotationDuMois(immos, m));
                      return <td key={m} className="text-right tabular-nums" style={{ color: '#6f6690' }}>{euros(cumul)}</td>;
                    });
                  })()}
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {apercu && <ApercuCellule {...apercu} />}
    </div>
  );
}
