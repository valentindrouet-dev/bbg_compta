import { Fragment, useMemo, useState } from 'react';
import {
  Eye, EyeOff, Gamepad2, Info, CheckCircle2, AlertTriangle, AlertCircle, Wrench, ArrowRight, GripVertical, CheckSquare, Square,
} from 'lucide-react';
import { useStore } from '../../store';
import { useReorganisation } from '../../utils/glisser';
import { couleurJeu, encreSur } from '../../utils/jeux';
import { completerAvecPrevisionnel } from '../../utils/previsionnel';
import {
  EXERCICES, PRE_IMMAT, compareMois, labelMois, moisCourant, moisExercice, formatDateFR,
} from '../../utils/dates';
import { euros, euros0, r2 } from '../../utils/money';
import {
  syntheseExercice, immoInfos, dotationDuMois, dotationsParMois, produitsFinanciersParMois,
  compteResultat, ecrituresDeCellule, type LigneResultat,
} from '../../utils/calc';
import { teinteBloc, type BlocCle } from '../../utils/blocs';
import {
  controlesComptables, dateCalee, libelleEcriture, type PageControle,
} from '../../utils/controles';
import type { Page } from '../../App';

import {
  PageHeader, ExerciceTabs, Card, Btn, BlocColorMenu, TotalBloc, styleBloc, ReglagesVue,
} from '../ui';
import type { JournalEntry } from '../../types';
import { useEtatVue } from '../../utils/etatVue';
import { useBaseMontant, useSousTotaux, useVueSimplifiee } from '../../utils/reglagesVue';

/** Référence stable : un `?? []` dans un sélecteur reboucle à l'infini. */
const AUCUN_JEU: string[] = [];

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

export function SynthesePage({ onAllerA }: { onAllerA?: (page: Page, ligne: string) => void }) {
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const refs = useStore(s => s.referentiels);
  const couleurs = useStore(s => s.blocCouleurs);
  const updateEntry = useStore(s => s.updateEntry);
  const [exercice, setExercice] = useEtatVue('synthese.exercice', '2025-26',
    v => (EXERCICES as readonly string[]).includes(v));
  const [base] = useBaseMontant();
  const [simple] = useVueSimplifiee();
  const [sousTotaux] = useSousTotaux();
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

  /** Compléter les mois pas encore atteints avec ce qui est budgété. */
  const [avecPrev, setAvecPrev] = useEtatVue('synthese.prev', false);
  const previsionnels = useStore(s => s.previsionnels);

  /**
   * Les mois de l'exercice qui sont devant nous. Le mois en cours porte déjà
   * des écritures : on ne le complète pas, on ne remplit que l'inconnu.
   */
  const moisFuturs = useMemo(() => {
    if (!avecPrev) return [] as string[];
    const courant = moisCourant();
    return moisExercice(exercice).filter(m => m !== PRE_IMMAT && compareMois(m, courant) > 0);
  }, [avecPrev, exercice]);
  const estMoisPrevu = (m: string) => moisFuturs.includes(m);

  const syn = useMemo(
    () => completerAvecPrevisionnel(
      syntheseExercice(entries, exercice, refs, base),
      previsionnels[exercice] ?? [], refs, base, moisFuturs),
    [entries, exercice, refs, base, previsionnels, moisFuturs],
  );
  const immos = useMemo(() => immoInfos(entries, refs), [entries, refs]);

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
  /** Combien d'écritures porte chaque exercice — le compteur des onglets. */
  const nbEcrituresParExercice = useMemo(() => {
    const m = new Map<string, number>();
    for (const ex of EXERCICES) {
      const mois = new Set(moisExercice(ex));
      m.set(ex, entries.filter(e => mois.has(e.mois)).length);
    }
    return m;
  }, [entries]);
  const deplacerCategorie = useStore(s => s.deplacerCategorie);
  const deplacerGroupe = useStore(s => s.deplacerGroupe);

  /**
   * Réorganisation à la souris. Une catégorie lâchée sur une autre prend sa
   * place — et le groupe de la ligne d'arrivée, si c'est un autre bandeau.
   */
  const reorg = useReorganisation((source, cible, apres, genre) => {
    if (genre === 'groupe') { deplacerGroupe(source, cible, apres); return; }
    const groupeArrivee = meta[cible]?.groupe ?? '';
    const groupeDepart = meta[source]?.groupe ?? '';
    deplacerCategorie(source, cible, apres, groupeArrivee === groupeDepart ? undefined : groupeArrivee);
  });

  // Catégories présentes dans l'exercice, dans l'ordre du référentiel
  const catsDe = (source: Map<string, Map<string, number>>, ref: string[]) =>
    ref.filter(c => source.has(c)).concat([...source.keys()].filter(c => !ref.includes(c)));

  const unite = base === 'ttc' ? 'TTC' : 'HT';
  // Les postes rattachés à un jeu sont listés jeu par jeu, en bas du bloc :
  // on ne les répète pas dans la liste générale des catégories.
  const catsJeux = new Set(
    [...syn.jeuxParJeuEtCategorie.values()].flatMap(m => [...m.keys()]));
  /** Les jeux dans l'ordre du catalogue, les intrus à la fin. */
  const ordreJeux = (jeux: string[]) => {
    const cat = refs.jeux ?? [];
    return [...cat.filter(j => jeux.includes(j)), ...jeux.filter(j => !cat.includes(j))];
  };

  /** Les blocs de catégories, dans l'ordre de lecture demandé. */
  const blocs: {
    cle: BlocCle; titre: string; cats: string[];
    data: Map<string, Map<string, number>>; totaux: Map<string, number>;
    /** Le même bloc en TTC — le vrai pendant du total HT, bloc par bloc. */
    ttc?: Map<string, number>;
    /**
     * Postes rattachés à un jeu : ils sont dans le total du bloc, mais on les
     * sort de la liste plate pour les regrouper jeu par jeu, plus bas.
     */
    parJeu?: Map<string, Map<string, Map<string, number>>>;
    typeApercu: 'charges' | 'immo' | 'produit'; vide?: string;
  }[] = [
    {
      cle: 'produits', titre: `Produits par catégorie (${unite})`,
      cats: catsDe(syn.produits, refs.categoriesProduits), data: syn.produits,
      totaux: syn.totalProduitsParMois, ttc: syn.totalProduitsTTCParMois, typeApercu: 'produit',
    },
    {
      cle: 'charges', titre: `Charges par catégorie (${unite})`,
      cats: catsDe(syn.charges, refs.categoriesDepenses).filter(c => !catsJeux.has(c)),
      data: syn.charges, parJeu: syn.jeuxParJeuEtCategorie,
      totaux: syn.totalChargesParMois, ttc: syn.totalChargesTTCParMois, typeApercu: 'charges',
    },
    {
      cle: 'personnel', titre: `Personnel & rémunérations (${unite})`,
      cats: catsDe(syn.personnel, refs.categoriesDepenses), data: syn.personnel,
      totaux: syn.totalPersonnelParMois, ttc: syn.totalPersonnelTTCParMois, typeApercu: 'charges',
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
    const ht = base === 'ht' ? syn : completerAvecPrevisionnel(
      syntheseExercice(entries, exercice, refs, 'ht'),
      previsionnels[exercice] ?? [], refs, 'ht', moisFuturs);
    return compteResultat({
      moisList: ht.moisList,
      produits: ht.totalProduitsParMois,
      charges: ht.totalChargesParMois,
      personnel: ht.totalPersonnelParMois,
      // Les dépenses jeux sont désormais DANS les charges : les repasser ici
      // les compterait deux fois.
      jeux: VIDE,
      dotations: dotationsParMois(immos, ht.moisList),
      produitsFinanciers: produitsFinanciersParMois(finances, ht.moisList),
      chargesFinancieres: ht.chargesFinancieresParMois,
    });
  }, [syn, entries, exercice, refs, base, immos, finances, previsionnels, moisFuturs]);

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Synthèse annuelle"
        subtitle="Produits, charges, personnel, jeux, immobilisations, puis le résultat — recalculé en direct depuis le journal"
        actions={
          <>
            <ReglagesVue />
            <button
              className="px-3 py-1.5 rounded-md border text-sm font-semibold inline-flex items-center gap-1.5"
              style={avecPrev
                ? { backgroundColor: 'var(--bbg-purple-dark)', color: '#fff', borderColor: 'var(--bbg-purple-dark)' }
                : { backgroundColor: '#fff', color: '#5c5280', borderColor: 'var(--bbg-border)' }}
              title="Compléter les mois pas encore atteints avec ce qui est budgété, en grisé"
              onClick={() => setAvecPrev(!avecPrev)}
            >
              {avecPrev ? <CheckSquare size={14} /> : <Square size={14} />} Prévisionnel
            </button>
            <Btn onClick={basculerApercu} title="Afficher le détail des opérations au survol d'une case">
              <span className="inline-flex items-center gap-1">
                {apercuActif ? <Eye size={14} /> : <EyeOff size={14} />}
                Aperçu {apercuActif ? 'activé' : 'désactivé'}
              </span>
            </Btn>
          </>
        }
        tabs={
          <ExerciceTabs
            exercice={exercice} exercices={EXERCICES}
            badgeOf={ex => nbEcrituresParExercice.get(ex) ?? 0}
            onChange={setExercice}
          />
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
                          <th key={m} className="num" style={{ minWidth: 74 }}
                            title={estMoisPrevu(m) ? 'Rempli avec le prévisionnel' : undefined}>
                            {labelMois(m)}
                            {estMoisPrevu(m) && <span className="font-normal opacity-70"> ·p</span>}
                          </th>
                        ))}
                        <th className="num" style={{ minWidth: 96 }}>Total</th>
                        <th className="num" style={{ minWidth: 84 }}>/ mois</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordreGroupes.map(g => (
                        <Fragment key={`grp-${g}`}>
                          {avecGroupes && (
                            <tr className="band-bloc" {...(g ? reorg.ligne('groupe', g) : {})}>
                              <td colSpan={syn.moisList.length + 3} className="py-1">
                                <span className="inline-flex items-center gap-1.5">
                                  {g && (
                                    <span className="poignee-glisse" {...reorg.poignee()}
                                      title="Glisser pour déplacer tout le groupe">
                                      <GripVertical size={13} />
                                    </span>
                                  )}
                                  {g || '— sans groupe —'}
                                </span>
                              </td>
                            </tr>
                          )}
                          {(simple ? [] : parGroupe.get(g)!).map(cat => {
                            const tot = totalLigne(bloc.data, cat);
                            return (
                              <tr key={cat} {...reorg.ligne('categorie', cat)}>
                                <td>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="poignee-glisse shrink-0" {...reorg.poignee()}
                                      title="Glisser pour remonter ou descendre cette catégorie">
                                      <GripVertical size={13} />
                                    </span>
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
                                      // Un montant négatif dans un bloc de dépenses est un
                                      // remboursement : il vient en moins des charges du mois.
                                      // Un mois à venir est du prévu : gris et italique.
                                      style={v < 0
                                        ? { color: '#38761d' }
                                        : estMoisPrevu(m)
                                          ? { color: '#8d85a6', fontStyle: 'italic' }
                                          : undefined}
                                      title={v < 0 ? 'En réduction des charges du mois' : undefined}
                                    >
                                      {v ? euros(r2(v)) : '·'}
                                    </td>
                                  );
                                })}
                                <td className="text-right tabular-nums font-semibold col-total"
                                  style={tot < 0 ? { color: '#38761d' } : undefined}>{euros(tot)}</td>
                                <td className="text-right tabular-nums col-total" style={{ color: '#5c5280' }}>
                                  {euros(r2(tot / nbMois))}
                                </td>
                              </tr>
                            );
                          })}
                          {avecGroupes && sousTotaux && (simple || parGroupe.get(g)!.length > 1) && (
                            <tr style={simple ? { fontWeight: 600 } : { fontStyle: 'italic' }}>
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
                      {/* Ce qu'un jeu a coûté en charges : mêmes lignes, un
                          bandeau par jeu. Ces montants sont déjà dans le total
                          du bloc — ils n'y sont pas ajoutés une seconde fois. */}
                      {!simple && bloc.parJeu && ordreJeux([...bloc.parJeu.keys()]).map(jeu => {
                        const postes = bloc.parJeu!.get(jeu)!;
                        return (
                        <Fragment key={`jeu-${jeu}`}>
                          <tr>
                            <td colSpan={syn.moisList.length + 3} className="py-1 font-bold"
                              style={{
                                backgroundColor: couleurJeu(jeu, refs),
                                color: encreSur(couleurJeu(jeu, refs)),
                              }}>
                              <span className="inline-flex items-center gap-1.5">
                                <Gamepad2 size={13} /> {jeu}
                              </span>
                            </td>
                          </tr>
                          {[...postes.keys()].map(cat => {
                            const parMois = postes.get(cat)!;
                            const tot = r2([...parMois.values()].reduce((s, v) => s + v, 0));
                            return (
                              <tr key={`${jeu}-${cat}`}>
                                <td className="pl-4">{cat}</td>
                                {syn.moisList.map(m => {
                                  const v = parMois.get(m) ?? 0;
                                  return (
                                    <td key={m} className="text-right tabular-nums"
                                      onMouseEnter={ev => survol(ev, m, `${jeu} — ${cat} — ${labelMois(m)}`,
                                        { categorie: cat, type: bloc.typeApercu })}
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
                          {sousTotaux && (
                          <tr style={{ fontWeight: 700 }}>
                            <td className="pl-4">Total {jeu}</td>
                            {syn.moisList.map(m => {
                              const v = r2([...postes.values()]
                                .reduce((s, parMois) => s + (parMois.get(m) ?? 0), 0));
                              return <td key={m} className="text-right tabular-nums">{v ? euros(v) : '·'}</td>;
                            })}
                            <td className="text-right tabular-nums col-total">
                              {euros(r2([...postes.values()]
                                .reduce((s, parMois) => s + [...parMois.values()].reduce((a, v) => a + v, 0), 0)))}
                            </td>
                            <td className="col-total"></td>
                          </tr>
                          )}
                        </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="total-bloc">
                        <td>TOTAL {bloc.cle === 'produits' ? 'PRODUITS' : bloc.cle === 'personnel' ? 'PERSONNEL' : 'CHARGES'} ({unite})</td>
                        {syn.moisList.map(m => (
                          <td key={m} className="text-right tabular-nums"
                            style={estMoisPrevu(m) ? { fontStyle: 'italic', opacity: 0.75 } : undefined}>
                            {bloc.totaux.get(m) ? euros0(r2(bloc.totaux.get(m)!)) : '·'}
                          </td>
                        ))}
                        <td className="text-right tabular-nums grand">{euros(grandTotal)}</td>
                        <td className="text-right tabular-nums">{euros0(r2(grandTotal / nbMois))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>
          );
        })}

        {/* -------------------------------------------- Immobilisations -- */}
        <BlocImmos
          syn={syn} couleurs={couleurs} unite={unite} meta={meta}
          survol={survol} quitte={quitte} immos={immos} simple={simple}
        />

        {/* ------------------------------------------------- Résultat ---- */}
        <BlocResultat lignes={resultat} moisList={syn.moisList} couleurs={couleurs} />

        {/* ------------------------------------------------------ TVA ---- */}
        <BlocTVA syn={syn} couleurs={couleurs} />

        {/* ---------------------------------------------- Récapitulatif -- */}
        <Recapitulatif
          syn={syn} resultat={resultat} couleurs={couleurs} unite={unite} exercice={exercice}
        />

        {/* ------------------------------------------------- Contrôles --- */}
        <ControlesCard
          entries={entries} exercice={exercice} refs={refs}
          onCalerDates={ecritures => {
            for (const e of ecritures) updateEntry(e.id, { date: dateCalee(e) });
          }}
          onAllerA={onAllerA}
        />
      </div>

      {apercu && <ApercuCellule {...apercu} />}
    </div>
  );
}

// --------------------------------------------------- Bloc immobilisations ---

/** Ce qu'appelle une cellule survolée : l'aperçu des écritures derrière. */
type Survol = (ev: React.MouseEvent, mois: string, titre: string,
  opts: { categorie?: string; jeu?: string; type?: 'charges' | 'immo' | 'produit' }) => void;

function BlocImmos({ syn, couleurs, unite, meta, survol, quitte, immos, simple }: {
  syn: ReturnType<typeof syntheseExercice>;
  couleurs: Record<string, string>; unite: string;
  meta: Record<string, { couleur?: string; groupe?: string }>;
  survol: Survol; quitte: () => void;
  immos: ReturnType<typeof immoInfos>; simple: boolean;
}) {
  const t = teinteBloc('immos', couleurs);
  const ordreRef = useStore(s => s.referentiels.categoriesDepenses);
  const deplacerCategorie = useStore(s => s.deplacerCategorie);
  const reorg = useReorganisation((source, cible, apres) => deplacerCategorie(source, cible, apres));
  // Même ordre que partout ailleurs : celui du référentiel, puis les intrus.
  const cats = ordreRef.filter(c => syn.immos.has(c))
    .concat([...syn.immos.keys()].filter(c => !ordreRef.includes(c)));
  // Les immobilisations d'un jeu sont regroupées plus bas, jeu par jeu : on ne
  // les répète pas dans la liste générale.
  const catsJeux = new Set(
    [...syn.immosParJeuEtCategorie.values()].flatMap(m => [...m.keys()]));
  const catsHorsJeux = cats.filter(c => !catsJeux.has(c));
  const refsJeux = useStore(st => st.referentiels);
  const catalogue = refsJeux.jeux ?? AUCUN_JEU;
  const brutsJeux = [...syn.immosParJeuEtCategorie.keys()];
  const jeuxImmo = [
    ...catalogue.filter(j => brutsJeux.includes(j)),
    ...brutsJeux.filter(j => !catalogue.includes(j)),
  ];
  const totalJeuMois = (jeu: string, m: string) =>
    r2([...(syn.immosParJeuEtCategorie.get(jeu)?.values() ?? [])]
      .reduce((s, parMois) => s + (parMois.get(m) ?? 0), 0));
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
            {(simple ? [] : catsHorsJeux).map(cat => (
              <tr key={cat} {...reorg.ligne('categorie', cat)}>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="poignee-glisse shrink-0" {...reorg.poignee()}
                      title="Glisser pour remonter ou descendre cette catégorie">
                      <GripVertical size={13} />
                    </span>
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
            {/* Le développement porté à l'actif, jeu par jeu : ce sont des
                immobilisations comme les autres, mais on veut savoir ce que
                chaque jeu a coûté. */}
            {!simple && jeuxImmo.map(jeu => (
              <Fragment key={`immojeu-${jeu}`}>
                <tr>
                  <td colSpan={syn.moisList.length + 2} className="py-1 font-bold"
                    style={{
                      backgroundColor: couleurJeu(jeu, refsJeux),
                      color: encreSur(couleurJeu(jeu, refsJeux)),
                    }}>
                    <span className="inline-flex items-center gap-1.5">
                      <Gamepad2 size={13} /> {jeu} — développement à l'actif
                    </span>
                  </td>
                </tr>
                {[...syn.immosParJeuEtCategorie.get(jeu)!.keys()].map(cat => (
                  <tr key={`${jeu}-${cat}`}>
                    <td className="pl-4">{cat}</td>
                    {syn.moisList.map(m => {
                      const v = syn.immosParJeuEtCategorie.get(jeu)!.get(cat)?.get(m) ?? 0;
                      return (
                        <td key={m} className="text-right tabular-nums"
                          onMouseEnter={ev => survol(ev, m, `${jeu} — ${cat} — ${labelMois(m)}`,
                            { categorie: cat, type: 'immo' })}
                          onMouseLeave={quitte}
                        >
                          {v ? euros(r2(v)) : '·'}
                        </td>
                      );
                    })}
                    <td className="text-right tabular-nums font-semibold col-total">
                      {euros(r2(syn.moisList.reduce((acc, m) =>
                        acc + (syn.immosParJeuEtCategorie.get(jeu)!.get(cat)?.get(m) ?? 0), 0)))}
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td className="pl-4">Total {jeu} à l'actif</td>
                  {syn.moisList.map(m => {
                    const v = totalJeuMois(jeu, m);
                    return <td key={m} className="text-right tabular-nums">{v ? euros(v) : '·'}</td>;
                  })}
                  <td className="text-right tabular-nums col-total">
                    {euros(r2(syn.moisList.reduce((acc, m) => acc + totalJeuMois(jeu, m), 0)))}
                  </td>
                </tr>
              </Fragment>
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

// ---------------------------------------------------- Récapitulatif ---------

/**
 * Le résumé d'une page : les grandes masses de l'exercice et le résultat, sans
 * un seul détail. C'est ce qu'on lit en premier, et ce qu'on envoie au comptable.
 */
function Recapitulatif({ syn, resultat, couleurs, unite, exercice }: {
  syn: ReturnType<typeof syntheseExercice>;
  resultat: LigneResultat[];
  couleurs: Record<string, string>; unite: string; exercice: string;
}) {
  const t = teinteBloc('resultat', couleurs);
  const total = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0));
  const de = (cle: string) => resultat.find(l => l.cle === cle)?.total ?? 0;
  // Même chemin de calcul que le bloc TVA : on somme les soldes mensuels
  // arrondis, sinon les deux affichages divergent d'un centime.
  const soldeTVA = r2(syn.moisList.reduce((s, m) =>
    s + r2((syn.tvaCollecteeParMois.get(m) ?? 0) - (syn.tvaDeductibleParMois.get(m) ?? 0)), 0));

  const lignes: { bloc?: BlocCle; label: string; valeur: number; niveau: 'masse' | 'agregat' | 'final' | 'hors'; aide?: string }[] = [
    { bloc: 'produits', label: 'PRODUITS', valeur: total(syn.totalProduitsParMois), niveau: 'masse' },
    { bloc: 'charges', label: 'CHARGES', valeur: -total(syn.totalChargesParMois), niveau: 'masse' },
    { bloc: 'personnel', label: 'PERSONNEL', valeur: -total(syn.totalPersonnelParMois), niveau: 'masse' },
    { label: 'dont dépenses jeux (comprises dans les charges)', valeur: total(syn.totalJeuxParMois), niveau: 'hors',
      aide: 'Déjà comptées dans les charges ci-dessus. Le détail par jeu est plus bas.' },
    { label: 'dont charges financières (reprises plus bas)', valeur: total(syn.chargesFinancieresParMois), niveau: 'hors',
      aide: 'Déjà comprises dans les charges ci-dessus, mais retirées de l\'EBE : elles se retranchent au résultat courant.' },
    { label: 'EXCÉDENT BRUT D\'EXPLOITATION', valeur: de('ebe'), niveau: 'agregat' },
    { label: 'Dotations aux amortissements', valeur: -de('dotations'), niveau: 'masse',
      aide: 'L\'usure des immobilisations. L\'investissement lui-même n\'est pas une charge.' },
    { label: 'RÉSULTAT D\'EXPLOITATION', valeur: de('rex'), niveau: 'agregat' },
    { label: 'Produits financiers', valeur: de('pf'), niveau: 'masse' },
    { label: 'Charges financières', valeur: -de('cf'), niveau: 'masse' },
    { label: 'RÉSULTAT COURANT AVANT IMPÔT', valeur: de('rc'), niveau: 'agregat' },
    { label: 'Impôt sur les sociétés', valeur: -de('is'), niveau: 'masse' },
    { label: 'RÉSULTAT NET', valeur: de('rn'), niveau: 'final' },
  ];

  const investi = total(syn.immoParMois);

  return (
    <Card
      title={`Récapitulatif de l'exercice ${exercice} (${unite})`}
      actions={<TotalBloc label="Résultat net" valeur={euros(de('rn'))} t={t} />}
    >
      <div className="grid md:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <table data-table="synthese:recap" data-bloc="resultat" className="sheet text-sm"
          style={styleBloc(t)}>
          <tbody>
            {lignes.map(l => (
              <tr key={l.label}
                className={l.niveau === 'agregat' ? 'band-bloc' : undefined}
                style={l.niveau === 'hors' ? { fontStyle: 'italic', color: '#6f6690' } : undefined}
                title={l.aide}
              >
                <td className={l.niveau === 'masse' || l.niveau === 'hors' ? 'pl-4' : undefined}>
                  <span className="inline-flex items-center gap-1.5">
                    {l.bloc && (
                      <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: teinteBloc(l.bloc, couleurs).base }} />
                    )}
                    {l.label}
                    {l.aide && <Info size={11} style={{ opacity: 0.45 }} />}
                  </span>
                </td>
                <td className="text-right tabular-nums"
                  style={{
                    fontSize: l.niveau === 'final' ? '1.15rem' : undefined,
                    fontWeight: l.niveau === 'final' ? 800 : l.niveau === 'agregat' ? 700 : undefined,
                    color: l.niveau === 'agregat' || l.niveau === 'final'
                      ? (l.valeur >= 0 ? '#2c5d16' : '#8f2b26') : undefined,
                  }}>
                  {euros(l.valeur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-3">
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--bbg-border-soft)' }}>
            <div className="text-xs uppercase tracking-wide mb-1" style={{ color: '#6f6690' }}>
              Hors résultat — au bilan
            </div>
            <div className="flex justify-between text-sm py-0.5">
              <span>Investissements de l'exercice</span>
              <b className="tabular-nums">{euros(investi)}</b>
            </div>
            <div className="flex justify-between text-sm py-0.5"
              title="Charges + personnel + jeux + immobilisations, taxes comprises : tout ce qui est réellement sorti du compte.">
              <span>Sorti du compte (toutes dépenses TTC)</span>
              <b className="tabular-nums">{euros(total(syn.totalTTCParMois))}</b>
            </div>
            <div className="flex justify-between text-sm py-0.5">
              <span>{soldeTVA > 0 ? 'TVA à reverser à l\'État' : 'Crédit de TVA sur l\'État'}</span>
              <b className="tabular-nums" style={{ color: soldeTVA > 0 ? '#b7332e' : '#38761d' }}>
                {euros(Math.abs(soldeTVA))}
              </b>
            </div>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: '#5c5280' }}>
            <b>Ces deux lignes n'entrent pas dans le résultat</b>, et c'est normal.
            Un investissement s'inscrit à l'actif : seule sa dotation passe en charge.
            La <b>TVA</b>, elle, ne t'appartient jamais : tu la collectes pour l'État et tu récupères
            celle que tu as payée. Elle transite par des comptes de bilan (445), jamais par le résultat.
            Le solde ci-dessus est donc une <b>créance</b> (ou une dette) au 30 septembre, pas un produit :
            il se règle en trésorerie, sur l'exercice suivant.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------ Contrôles comptables ------

/** Nom lisible de la page où se corrige un contrôle. */
const destination = (p: PageControle) => p === 'immos' ? 'Immobilisations' : 'Journal du mois';

/** Une carte vide, pour les entrées de compte de résultat sans montant. */
const VIDE: Map<string, number> = new Map();

const ICONE_CONTROLE = {
  ok: { Icone: CheckCircle2, couleur: '#38761d' },
  attention: { Icone: AlertTriangle, couleur: '#b45f06' },
  erreur: { Icone: AlertCircle, couleur: '#b7332e' },
  info: { Icone: Info, couleur: '#6f6690' },
} as const;

/** La passe d'inspection : ce qu'un comptable vérifierait, fait à chaque affichage. */
function ControlesCard({ entries, exercice, refs, onCalerDates, onAllerA }: {
  entries: JournalEntry[]; exercice: string;
  refs: Parameters<typeof controlesComptables>[2];
  onCalerDates: (ecritures: JournalEntry[]) => void;
  /** Ouvre la page où se corrige la ligne, et l'y met en évidence. */
  onAllerA?: (page: Page, ligne: string) => void;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const controles = useMemo(
    () => controlesComptables(entries, exercice, refs),
    [entries, exercice, refs],
  );
  const erreurs = controles.filter(c => c.niveau === 'erreur').length;
  const attentions = controles.filter(c => c.niveau === 'attention').length;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Wrench size={16} style={{ color: 'var(--bbg-purple-dark)' }} />
          Contrôles comptables
        </span>
      }
      actions={
        <span className="text-sm" style={{ color: erreurs ? '#b7332e' : attentions ? '#b45f06' : '#38761d' }}>
          {erreurs ? `${erreurs} erreur${erreurs > 1 ? 's' : ''} à corriger`
            : attentions ? `${attentions} point${attentions > 1 ? 's' : ''} à regarder`
              : 'tout est conforme'}
        </span>
      }
    >
      <ul className="space-y-1.5">
        {controles.map(c => {
          const { Icone, couleur } = ICONE_CONTROLE[c.niveau];
          const deplie = ouvert === c.cle;
          return (
            <li key={c.cle}>
              <div className="flex items-start gap-2 text-sm">
                <Icone size={15} className="shrink-0 mt-0.5" style={{ color: couleur }} />
                <div className="flex-1">
                  <b style={{ color: '#3f3268' }}>{c.titre}</b>
                  <span style={{ color: '#5c5280' }}> — {c.constat}</span>
                  {c.ecritures && c.ecritures.length > 0 && (
                    <button className="ml-2 text-xs underline" style={{ color: 'var(--bbg-purple-dark)' }}
                      onClick={() => setOuvert(deplie ? null : c.cle)}>
                      {deplie ? 'masquer' : 'voir les lignes'}
                    </button>
                  )}
                  {c.correction && (
                    <button className="ml-2 text-xs underline" style={{ color: 'var(--bbg-purple-dark)' }}
                      onClick={() => c.ecritures && onCalerDates(c.ecritures)}>
                      {c.correction.libelle}
                    </button>
                  )}
                  {c.explication && (
                    <div className="text-xs mt-0.5" style={{ color: '#9a92b5' }}>{c.explication}</div>
                  )}
                  {deplie && c.ecritures && (
                    <ul className="mt-1 mb-1 text-xs rounded-md p-1.5"
                      style={{ backgroundColor: 'var(--bbg-lavender)', color: '#5c5280' }}>
                      {c.ecritures.slice(0, 25).map(e => (
                        <li key={e.id}>
                          <button
                            type="button"
                            className="w-full text-left px-1.5 py-1 rounded flex items-center gap-1.5 group/ligne
                              hover:bg-white transition-colors"
                            title={`Ouvrir cette écriture dans ${destination(c.page)}`}
                            onClick={() => onAllerA?.(c.page as Page, e.id)}
                          >
                            <span className="flex-1">{libelleEcriture(e)}</span>
                            <span className="opacity-0 group-hover/ligne:opacity-100 shrink-0 inline-flex
                              items-center gap-1" style={{ color: 'var(--bbg-purple-dark)' }}>
                              {destination(c.page)} <ArrowRight size={12} />
                            </span>
                          </button>
                        </li>
                      ))}
                      {c.ecritures.length > 25 && (
                        <li className="italic px-1.5 py-1">… et {c.ecritures.length - 25} autres</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs mt-3" style={{ color: '#9a92b5' }}>
        Ces contrôles tournent à chaque affichage, sur l'exercice choisi. <b>Clique une ligne signalée</b>
        {' '}pour l'ouvrir directement au bon endroit — le journal se place sur son mois, et la ligne clignote.
        Ils ne remplacent pas ton expert-comptable : ils lui évitent de perdre du temps sur ce qui se
        vérifie tout seul.
      </p>
    </Card>
  );
}
