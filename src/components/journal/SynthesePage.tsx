import { Fragment, useMemo, useState } from 'react';
import { Eye, EyeOff, Gamepad2, Info } from 'lucide-react';
import { useStore } from '../../store';
import { EXERCICES, labelMois, formatDateFR } from '../../utils/dates';
import { euros, euros0, r2 } from '../../utils/money';
import {
  syntheseExercice, immoInfos, dotationDuMois, dotationsParMois, produitsFinanciersParMois,
  compteResultat, ecrituresDeCellule, type BaseMontant, type LigneResultat,
} from '../../utils/calc';
import { teinteBloc, type BlocCle } from '../../utils/blocs';

import { PageHeader, Card, Btn, BlocColorMenu, TotalBloc, styleBloc } from '../ui';
import type { JournalEntry } from '../../types';

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
  const finances = useStore(s => s.finances);
  const refs = useStore(s => s.referentiels);
  const couleurs = useStore(s => s.blocCouleurs);
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
    () => syntheseExercice(entries, exercice, refs, base),
    [entries, exercice, refs, base],
  );
  const immos = useMemo(() => immoInfos(entries), [entries]);

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
  const meta = refs.categoriesMeta ?? {};
  const groupes = refs.groupes ?? [];

  // Catégories présentes dans l'exercice, dans l'ordre du référentiel
  const catsDe = (source: Map<string, Map<string, number>>, ref: string[]) =>
    ref.filter(c => source.has(c)).concat([...source.keys()].filter(c => !ref.includes(c)));

  const unite = base === 'ttc' ? 'TTC' : 'HT';

  /** Les blocs de catégories, dans l'ordre de lecture demandé. */
  const blocs: {
    cle: BlocCle; titre: string; cats: string[];
    data: Map<string, Map<string, number>>; totaux: Map<string, number>;
    typeApercu: 'charges' | 'immo' | 'produit'; vide?: string;
  }[] = [
    {
      cle: 'produits', titre: `Produits par catégorie (${unite})`,
      cats: catsDe(syn.produits, refs.categoriesProduits), data: syn.produits,
      totaux: syn.totalProduitsParMois, typeApercu: 'produit',
    },
    {
      cle: 'charges', titre: `Charges par catégorie (${unite})`,
      cats: catsDe(syn.charges, refs.categoriesDepenses), data: syn.charges,
      totaux: syn.totalChargesParMois, typeApercu: 'charges',
    },
    {
      cle: 'personnel', titre: `Personnel & rémunérations (${unite})`,
      cats: catsDe(syn.personnel, refs.categoriesDepenses), data: syn.personnel,
      totaux: syn.totalPersonnelParMois, typeApercu: 'charges',
      vide: 'Aucune charge de personnel sur cet exercice. Les cotisations du gérant, '
        + 'les salaires bruts et les charges patronales viendront se ranger ici : il suffit '
        + 'de mettre leur catégorie dans le groupe « Personnel » (onglet Catégories).',
    },
  ];

  const moisAvecDonnees = syn.moisList.filter(m =>
    (syn.totalTTCParMois.get(m) ?? 0) !== 0 || (syn.totalProduitsParMois.get(m) ?? 0) !== 0);
  const nbMois = Math.max(1, moisAvecDonnees.length);

  const totalLigne = (data: Map<string, Map<string, number>>, cat: string) =>
    r2([...(data.get(cat)?.values() ?? [])].reduce((s, v) => s + v, 0));
  const totalDe = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0));

  // ----- Compte de résultat, sur la base HT quoi qu'affiche le bouton -----
  const resultat: LigneResultat[] = useMemo(() => {
    const ht = base === 'ht' ? syn : syntheseExercice(entries, exercice, refs, 'ht');
    return compteResultat({
      moisList: ht.moisList,
      produits: ht.totalProduitsParMois,
      charges: ht.totalChargesParMois,
      personnel: ht.totalPersonnelParMois,
      jeux: ht.totalJeuxParMois,
      dotations: dotationsParMois(immos, ht.moisList),
      produitsFinanciers: produitsFinanciersParMois(finances, ht.moisList),
      chargesFinancieres: ht.chargesFinancieresParMois,
    });
  }, [syn, entries, exercice, refs, base, immos, finances]);

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Synthèse annuelle"
        subtitle="Produits, charges, personnel, jeux, immobilisations, puis le résultat — recalculé en direct depuis le journal"
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
        {blocs.map(bloc => {
          const t = teinteBloc(bloc.cle, couleurs);
          const grandTotal = totalDe(bloc.totaux);
          if (!bloc.cats.length && !bloc.vide) return null;

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
            <Card
              key={bloc.cle} title={bloc.titre}
              actions={
                <>
                  <TotalBloc label={`Total ${unite}`} valeur={euros(grandTotal)} t={t} />
                  <BlocColorMenu bloc={bloc.cle} />
                </>
              }
            >
              {!bloc.cats.length ? (
                <p className="text-sm italic" style={{ color: '#9a92b5' }}>{bloc.vide}</p>
              ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table
                    data-table={`synthese:${bloc.cle}:${syn.moisList.length}`} data-bloc={bloc.cle}
                    className="sheet text-xs" style={{ minWidth: 900, ...styleBloc(t) }}
                  >
                    <thead>
                      <tr>
                        <th className="text-left" style={{ minWidth: 230 }}>Catégorie</th>
                        {syn.moisList.map(m => (
                          <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>
                        ))}
                        <th className="num" style={{ minWidth: 96 }}>Total</th>
                        <th className="num" style={{ minWidth: 84 }}>/ mois</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordreGroupes.map(g => (
                        <Fragment key={`grp-${g}`}>
                          {avecGroupes && (
                            <tr className="band-bloc">
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
                                      style={{ backgroundColor: meta[cat]?.couleur || t.base }}
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
                                        categorie: cat, type: bloc.typeApercu,
                                      })}
                                      onMouseLeave={quitte}
                                    >
                                      {v ? euros(r2(v)) : '·'}
                                    </td>
                                  );
                                })}
                                <td className="text-right tabular-nums font-semibold col-total">{euros(tot)}</td>
                                <td className="text-right tabular-nums col-total" style={{ color: '#5c5280' }}>
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
                              <td className="text-right tabular-nums col-total" style={{ color: '#5c5280' }}>
                                {euros(r2(parGroupe.get(g)!.reduce((s, c) => s + totalLigne(bloc.data, c), 0)))}
                              </td>
                              <td className="col-total"></td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="total-bloc">
                        <td>TOTAL {bloc.cle === 'produits' ? 'PRODUITS' : bloc.cle === 'personnel' ? 'PERSONNEL' : 'CHARGES'} ({unite})</td>
                        {syn.moisList.map(m => (
                          <td key={m} className="text-right tabular-nums">
                            {bloc.totaux.get(m) ? euros0(r2(bloc.totaux.get(m)!)) : '·'}
                          </td>
                        ))}
                        <td className="text-right tabular-nums grand">{euros(grandTotal)}</td>
                        <td className="text-right tabular-nums">{euros0(r2(grandTotal / nbMois))}</td>
                      </tr>
                      {bloc.cle === 'produits' && (
                        <tr>
                          <td>Total produits (TTC)</td>
                          {syn.moisList.map(m => (
                            <td key={m} className="text-right tabular-nums">{euros(r2(syn.totalProduitsTTCParMois.get(m) ?? 0))}</td>
                          ))}
                          <td className="text-right tabular-nums">{euros(totalDe(syn.totalProduitsTTCParMois))}</td>
                          <td></td>
                        </tr>
                      )}
                      {bloc.cle === 'charges' && (
                        <tr>
                          <td title="Charges + personnel + dépenses jeux + immobilisations, toutes taxes comprises">
                            Total dépenses (TTC)
                          </td>
                          {syn.moisList.map(m => (
                            <td key={m} className="text-right tabular-nums">{euros(r2(syn.totalTTCParMois.get(m) ?? 0))}</td>
                          ))}
                          <td className="text-right tabular-nums">{euros(totalDe(syn.totalTTCParMois))}</td>
                          <td></td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              )}
              {bloc.cle === 'charges' && (
                <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
                  « / mois » = moyenne sur les {nbMois} mois qui portent des écritures.
                  Les couleurs et les groupes des catégories se règlent dans l'onglet Catégories ;
                  la teinte du bloc, avec la palette ci-dessus.
                </p>
              )}
            </Card>
          );
        })}

        {/* ---------------------------------------------------- Jeux ----- */}
        <BlocJeux
          syn={syn} refs={refs} couleurs={couleurs} unite={unite}
          survol={survol} quitte={quitte} nbMois={nbMois}
        />

        {/* -------------------------------------------- Immobilisations -- */}
        <BlocImmos
          syn={syn} couleurs={couleurs} unite={unite} meta={meta}
          survol={survol} quitte={quitte} immos={immos}
        />

        {/* ------------------------------------------------- Résultat ---- */}
        <BlocResultat lignes={resultat} moisList={syn.moisList} couleurs={couleurs} />

        {/* ------------------------------------------------------ TVA ---- */}
        <BlocTVA syn={syn} couleurs={couleurs} />
      </div>

      {apercu && <ApercuCellule {...apercu} />}
    </div>
  );
}

// ------------------------------------------------------------- Bloc Jeux ---

type Survol = (ev: React.MouseEvent, mois: string, titre: string,
  opts: { categorie?: string; jeu?: string; type?: 'charges' | 'immo' | 'produit' }) => void;

/**
 * Un jeu par groupe de lignes, et sous chaque jeu toutes les catégories de
 * dépenses possibles — y compris celles encore à zéro, pour voir d'un coup
 * d'œil ce qui reste à engager.
 */
function BlocJeux({ syn, refs, couleurs, unite, survol, quitte, nbMois }: {
  syn: ReturnType<typeof syntheseExercice>;
  refs: { categoriesJeux: string[]; jeux?: string[] };
  couleurs: Record<string, string>; unite: string;
  survol: Survol; quitte: () => void; nbMois: number;
}) {
  const t = teinteBloc('jeux', couleurs);
  const cats = refs.categoriesJeux;
  // Les jeux du catalogue, plus ceux qui portent des dépenses sans y figurer.
  const jeux = [...new Set([...(refs.jeux ?? []), ...syn.jeuxParJeuEtCategorie.keys()])]
    .filter(j => (refs.jeux ?? []).includes(j) || syn.jeuxParJeuEtCategorie.has(j));
  const grandTotal = r2([...syn.totalJeuxParMois.values()].reduce((s, v) => s + v, 0));

  const valeur = (jeu: string, cat: string, m: string) =>
    syn.jeuxParJeuEtCategorie.get(jeu)?.get(cat)?.get(m) ?? 0;
  const totalJeuMois = (jeu: string, m: string) =>
    cats.reduce((s, c) => s + valeur(jeu, c, m), 0);
  const totalJeu = (jeu: string) => r2(syn.moisList.reduce((s, m) => s + totalJeuMois(jeu, m), 0));

  if (!jeux.length) return null;

  return (
    <Card
      title={`Dépenses Jeux — un bloc par jeu (${unite})`}
      actions={
        <>
          <TotalBloc label={`Total ${unite}`} valeur={euros(grandTotal)} t={t} />
          <BlocColorMenu bloc="jeux" />
        </>
      }
    >
      <div className="overflow-x-auto -mx-4 px-4">
        <table
          data-table={`synthese:jeux:${syn.moisList.length}`} data-bloc="jeux"
          className="sheet text-xs" style={{ minWidth: 900, ...styleBloc(t) }}
        >
          <thead>
            <tr>
              <th className="text-left" style={{ minWidth: 230 }}>Jeu / poste de dépense</th>
              {syn.moisList.map(m => <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>)}
              <th className="num" style={{ minWidth: 96 }}>Total</th>
              <th className="num" style={{ minWidth: 84 }}>/ mois</th>
            </tr>
          </thead>
          <tbody>
            {jeux.map(jeu => (
              <Fragment key={jeu}>
                <tr className="band-bloc">
                  <td colSpan={syn.moisList.length + 3} className="py-1">
                    <span className="inline-flex items-center gap-1.5">
                      <Gamepad2 size={13} /> {jeu}
                    </span>
                  </td>
                </tr>
                {cats.map(cat => {
                  const tot = r2(syn.moisList.reduce((s, m) => s + valeur(jeu, cat, m), 0));
                  return (
                    <tr key={`${jeu}-${cat}`} style={tot ? undefined : { color: '#b3aecb' }}>
                      <td className="pl-4">{cat}</td>
                      {syn.moisList.map(m => {
                        const v = valeur(jeu, cat, m);
                        return (
                          <td
                            key={m} className="text-right tabular-nums"
                            onMouseEnter={ev => survol(ev, m, `${jeu} · ${cat} — ${labelMois(m)}`, { jeu, categorie: cat })}
                            onMouseLeave={quitte}
                          >
                            {v ? euros(r2(v)) : '·'}
                          </td>
                        );
                      })}
                      <td className="text-right tabular-nums font-semibold col-total">{tot ? euros(tot) : '·'}</td>
                      <td className="text-right tabular-nums col-total" style={{ color: '#5c5280' }}>
                        {tot ? euros(r2(tot / nbMois)) : '·'}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 700 }}>
                  <td className="pl-4">Total {jeu}</td>
                  {syn.moisList.map(m => {
                    const v = r2(totalJeuMois(jeu, m));
                    return <td key={m} className="text-right tabular-nums">{v ? euros(v) : '·'}</td>;
                  })}
                  <td className="text-right tabular-nums col-total">{euros(totalJeu(jeu))}</td>
                  <td className="text-right tabular-nums col-total">{euros(r2(totalJeu(jeu) / nbMois))}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-bloc">
              <td>TOTAL DÉPENSES JEUX ({unite})</td>
              {syn.moisList.map(m => (
                <td key={m} className="text-right tabular-nums">
                  {syn.totalJeuxParMois.get(m) ? euros0(r2(syn.totalJeuxParMois.get(m)!)) : '·'}
                </td>
              ))}
              <td className="text-right tabular-nums grand">{euros(grandTotal)}</td>
              <td className="text-right tabular-nums">{euros0(r2(grandTotal / nbMois))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
        Toutes les catégories de dépenses jeux sont listées sous chaque jeu, même à zéro :
        ce qui n'a pas encore été engagé se voit aussi. Le rattachement se fait dans la colonne
        « Jeu » du journal ; les coûts de fabrication, eux, restent dans le Production Calculator.
      </p>
    </Card>
  );
}

// --------------------------------------------------- Bloc immobilisations ---

function BlocImmos({ syn, couleurs, unite, meta, survol, quitte, immos }: {
  syn: ReturnType<typeof syntheseExercice>;
  couleurs: Record<string, string>; unite: string;
  meta: Record<string, { couleur?: string; groupe?: string }>;
  survol: Survol; quitte: () => void;
  immos: ReturnType<typeof immoInfos>;
}) {
  const t = teinteBloc('immos', couleurs);
  const cats = [...syn.immos.keys()];
  const grandTotal = r2([...syn.immoParMois.values()].reduce((s, v) => s + v, 0));
  const totalDotations = r2(syn.moisList.reduce((s, m) => s + dotationDuMois(immos, m), 0));
  if (!cats.length) return null;

  return (
    <Card
      title={`Immobilisations — investissements (${unite})`}
      actions={
        <>
          <TotalBloc label={`Investi ${unite}`} valeur={euros(grandTotal)} t={t} />
          <BlocColorMenu bloc="immos" />
        </>
      }
    >
      <div className="overflow-x-auto -mx-4 px-4">
        <table
          data-table={`synthese:immos:${syn.moisList.length}`} data-bloc="immos"
          className="sheet text-xs" style={{ minWidth: 900, ...styleBloc(t) }}
        >
          <thead>
            <tr>
              <th className="text-left" style={{ minWidth: 230 }}>Catégorie</th>
              {syn.moisList.map(m => <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>)}
              <th className="num" style={{ minWidth: 96 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(cat => (
              <tr key={cat}>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: meta[cat]?.couleur || t.base }} />
                    {cat}
                  </span>
                </td>
                {syn.moisList.map(m => {
                  const v = syn.immos.get(cat)?.get(m) ?? 0;
                  return (
                    <td key={m} className="text-right tabular-nums"
                      onMouseEnter={ev => survol(ev, m, `${cat} — ${labelMois(m)}`, { categorie: cat, type: 'immo' })}
                      onMouseLeave={quitte}
                    >
                      {v ? euros(r2(v)) : '·'}
                    </td>
                  );
                })}
                <td className="text-right tabular-nums font-semibold col-total">
                  {euros(r2([...(syn.immos.get(cat)?.values() ?? [])].reduce((s, v) => s + v, 0)))}
                </td>
              </tr>
            ))}
            <tr className="band-bloc">
              <td colSpan={syn.moisList.length + 2} className="py-1">
                Dotations aux amortissements — ce qui pèse réellement sur le résultat
              </td>
            </tr>
            <tr>
              <td>Dotation du mois</td>
              {syn.moisList.map(m => {
                const d = dotationDuMois(immos, m);
                return <td key={m} className="text-right tabular-nums">{d ? euros(d) : '·'}</td>;
              })}
              <td className="text-right tabular-nums font-semibold col-total">{euros(totalDotations)}</td>
            </tr>
            <tr style={{ color: '#6f6690' }}>
              <td>Cumul sur l'exercice</td>
              {(() => {
                let cumul = 0;
                return syn.moisList.map(m => {
                  cumul = r2(cumul + dotationDuMois(immos, m));
                  return <td key={m} className="text-right tabular-nums">{cumul ? euros(cumul) : '·'}</td>;
                });
              })()}
              <td className="col-total"></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="total-bloc">
              <td>TOTAL INVESTI ({unite})</td>
              {syn.moisList.map(m => (
                <td key={m} className="text-right tabular-nums">
                  {syn.immoParMois.get(m) ? euros0(r2(syn.immoParMois.get(m)!)) : '·'}
                </td>
              ))}
              <td className="text-right tabular-nums grand">{euros(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
        Une immobilisation n'est <b>pas une charge de l'exercice</b> : c'est un investissement inscrit
        à l'actif. Le montant apparaît le mois de l'achat, mais ce qui entre dans le résultat, c'est la
        <b> dotation aux amortissements</b> — {euros(totalDotations)} sur cet exercice. Le détail bien
        par bien est dans l'onglet Immobilisations.
      </p>
    </Card>
  );
}

// -------------------------------------------------------- Bloc résultat ---

function BlocResultat({ lignes, moisList, couleurs }: {
  lignes: LigneResultat[]; moisList: string[]; couleurs: Record<string, string>;
}) {
  const t = teinteBloc('resultat', couleurs);
  const rn = lignes.find(l => l.cle === 'rn')!;
  const couleurValeur = (l: LigneResultat, v: number) =>
    l.signe ? (v > 0 ? '#38761d' : v < 0 ? '#b7332e' : '#9a92b5') : undefined;

  return (
    <Card
      title="Résultat de l'exercice (HT)"
      actions={
        <>
          <TotalBloc label="Résultat net" valeur={euros(rn.total)} t={t} />
          <BlocColorMenu bloc="resultat" />
        </>
      }
    >
      <div className="overflow-x-auto -mx-4 px-4">
        <table
          data-table={`synthese:resultat:${moisList.length}`} data-bloc="resultat"
          className="sheet text-xs" style={{ minWidth: 900, ...styleBloc(t) }}
        >
          <thead>
            <tr>
              <th className="text-left" style={{ minWidth: 230 }}>Solde intermédiaire de gestion</th>
              {moisList.map(m => <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>)}
              <th className="num" style={{ minWidth: 110 }}>Exercice</th>
            </tr>
          </thead>
          <tbody>
            {lignes.filter(l => l.cle !== 'rn').map(l => (
              <tr
                key={l.cle}
                className={l.niveau === 'agregat' ? 'band-bloc' : undefined}
                title={l.aide}
              >
                <td className={l.niveau === 'detail' ? 'pl-4' : undefined}>
                  <span className="inline-flex items-center gap-1.5">
                    {l.label}
                    {l.niveau !== 'detail' && <Info size={11} style={{ opacity: 0.5 }} />}
                  </span>
                </td>
                {moisList.map(m => {
                  const v = l.parMois?.get(m) ?? null;
                  return (
                    <td key={m} className="text-right tabular-nums"
                      style={{ color: v == null ? '#c9c0e4' : couleurValeur(l, v) }}>
                      {v == null ? '—' : v ? euros(v) : '·'}
                    </td>
                  );
                })}
                <td className="text-right tabular-nums font-semibold col-total"
                  style={{ color: couleurValeur(l, l.total) }}>
                  {euros(l.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-bloc">
              <td>RÉSULTAT NET DE L'EXERCICE</td>
              {moisList.map(m => <td key={m}></td>)}
              <td className="text-right tabular-nums grand"
                style={{ color: rn.total >= 0 ? '#2c5d16' : '#8f2b26' }}>
                {euros(rn.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
        Enchaînement du plan comptable : <b>EBE</b> = produits − charges d'exploitation (charges externes,
        personnel et dépenses jeux, hors frais financiers) · <b>REX</b> = EBE − dotations ·
        <b> RC</b> = REX + produits financiers − charges financières · <b>RN</b> = RC − impôt sur les sociétés.
        L'IS suit le barème PME (15 % jusqu'à 42 500 € de bénéfice, 25 % au-delà) et se calcule sur
        l'année entière, d'où les cases mensuelles vides. Les immobilisations n'apparaissent pas en charges :
        seules leurs dotations comptent.
      </p>
    </Card>
  );
}

// ------------------------------------------------------------- Bloc TVA ---

function BlocTVA({ syn, couleurs }: {
  syn: ReturnType<typeof syntheseExercice>; couleurs: Record<string, string>;
}) {
  const t = teinteBloc('tva', couleurs);
  const total = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0));

  // La TVA vient directement des écritures : elle ne dépend pas du bouton HT/TTC.
  const collectee = syn.tvaCollecteeParMois;
  const deductible = syn.tvaDeductibleParMois;
  const solde = new Map(syn.moisList.map(m =>
    [m, r2((collectee.get(m) ?? 0) - (deductible.get(m) ?? 0))]));
  const totalSolde = total(solde);

  const couleurSolde = (v: number) => v > 0 ? '#b7332e' : v < 0 ? '#38761d' : '#9a92b5';

  const rows: { label: string; data: Map<string, number>; couleur?: (v: number) => string | undefined }[] = [
    { label: 'Dépenses HT soumises à TVA', data: syn.baseTVADepensesParMois },
    { label: 'TVA déductible (sur achats)', data: deductible },
    { label: 'Produits HT soumis à TVA', data: syn.baseTVAProduitsParMois },
    { label: 'TVA collectée (sur ventes)', data: collectee },
  ];

  return (
    <Card
      title="TVA de l'exercice"
      actions={
        <>
          <TotalBloc
            label={totalSolde > 0 ? 'À reverser' : 'Crédit de TVA'}
            valeur={euros(Math.abs(totalSolde))} t={t}
          />
          <BlocColorMenu bloc="tva" />
        </>
      }
    >
      <div className="overflow-x-auto -mx-4 px-4">
        <table
          data-table={`synthese:tva:${syn.moisList.length}`} data-bloc="tva"
          className="sheet text-xs" style={{ minWidth: 900, ...styleBloc(t) }}
        >
          <thead>
            <tr>
              <th className="text-left" style={{ minWidth: 230 }}>TVA</th>
              {syn.moisList.map(m => <th key={m} className="num" style={{ minWidth: 74 }}>{labelMois(m)}</th>)}
              <th className="num" style={{ minWidth: 110 }}>Exercice</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {syn.moisList.map(m => {
                  const v = r.data.get(m) ?? 0;
                  return <td key={m} className="text-right tabular-nums">{v ? euros(r2(v)) : '·'}</td>;
                })}
                <td className="text-right tabular-nums font-semibold col-total">{euros(total(r.data))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-bloc">
              <td>{totalSolde > 0 ? 'TVA À REVERSER À L\'ÉTAT' : 'CRÉDIT DE TVA — L\'ÉTAT TE DOIT'}</td>
              {syn.moisList.map(m => {
                const v = solde.get(m) ?? 0;
                return (
                  <td key={m} className="text-right tabular-nums" style={{ color: couleurSolde(v) }}>
                    {v ? euros0(v) : '·'}
                  </td>
                );
              })}
              <td className="text-right tabular-nums grand" style={{ color: couleurSolde(totalSolde) }}>
                {euros(totalSolde)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
        Solde = TVA collectée − TVA déductible. <b style={{ color: '#b7332e' }}>Positif (rouge)</b> : tu dois
        la différence à l'État. <b style={{ color: '#38761d' }}>Négatif (vert)</b> : c'est un crédit de TVA,
        l'État te le doit. Le détail mois par mois, avec le cumul, est dans l'onglet TVA.
      </p>
    </Card>
  );
}
