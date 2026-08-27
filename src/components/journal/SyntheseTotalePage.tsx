import { Fragment, useMemo } from 'react';
import { CheckSquare, Gamepad2, List, Rows3, Square } from 'lucide-react';
import { useStore } from '../../store';
import { EXERCICES, moisExercice } from '../../utils/dates';
import { euros, euros0, r2 } from '../../utils/money';
import {
  compteResultat, dotationsParMois, immoInfos, produitsFinanciersParMois, syntheseExercice,
  type BaseMontant, type LigneResultat,
} from '../../utils/calc';
import { estChargeFinanciere, teinteBloc, type BlocCle } from '../../utils/blocs';
import {
  ordreAffichage, tauxDeLigne, tauxObserves, totalDeLigne, valeursDe,
} from '../../utils/previsionnel';
import type { PrevSection } from '../../types';
import { useEtatVue } from '../../utils/etatVue';
import { PageHeader, Card, TotalBloc, BlocColorMenu, styleBloc } from '../ui';

/** Un bloc de la synthèse, mais avec une colonne par exercice. */
interface BlocTotal {
  cle: BlocCle;
  titre: string;
  /** catégorie -> exercice -> montant */
  data: Map<string, Map<string, number>>;
  /** jeu -> catégorie -> exercice -> montant */
  parJeu?: Map<string, Map<string, Map<string, number>>>;
  totaux: Map<string, number>;
  ttc?: Map<string, number>;
}

const somme = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0));

/** Les soldes intermédiaires (EBE, REX, RC, RN) se lisent en gras. */
const estFort = (l: LigneResultat) => l.niveau !== 'detail';

/** Additionne une carte mensuelle en une seule valeur d'exercice. */
const total = (m: Map<string, number> | undefined) =>
  m ? r2([...m.values()].reduce((s, v) => s + v, 0)) : 0;

export function SyntheseTotalePage() {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const finances = useStore(s => s.finances);
  const couleurs = useStore(s => s.blocCouleurs);
  const [base, setBase] = useEtatVue<BaseMontant>('totale.base', 'ht');
  const [simple, setSimple] = useEtatVue('totale.simple', false);
  /** Compléter les exercices sans écriture avec ce qui est budgété. */
  const [avecPrev, setAvecPrev] = useEtatVue('totale.prev', false);
  const previsionnels = useStore(s => s.previsionnels);

  const meta = refs.categoriesMeta ?? {};
  const groupes = refs.groupes ?? [];
  const unite = base === 'ttc' ? 'TTC' : 'HT';
  const immos = useMemo(() => immoInfos(entries, refs), [entries, refs]);
  const observes = useMemo(() => tauxObserves(entries), [entries]);

  /** Une synthèse par exercice, puis un pivot : les mois deviennent des années. */
  const { blocs, resultat, exercices, prevus } = useMemo(() => {
    const syns = EXERCICES.map(ex => ({ ex, syn: syntheseExercice(entries, ex, refs, base) }));
    /** Les exercices qui n'ont aucune écriture : ceux qu'on peut compléter. */
    const prevus = new Set(EXERCICES.filter(ex =>
      total(syns.find(x => x.ex === ex)!.syn.totalTTCParMois) === 0
      && total(syns.find(x => x.ex === ex)!.syn.totalProduitsTTCParMois) === 0));

    /** Pivote une carte « catégorie -> mois » en « catégorie -> exercice ». */
    const pivot = (
      lire: (s: ReturnType<typeof syntheseExercice>) => Map<string, Map<string, number>>,
    ) => {
      const out = new Map<string, Map<string, number>>();
      for (const { ex, syn } of syns) {
        for (const [cat, parMois] of lire(syn)) {
          if (!out.has(cat)) out.set(cat, new Map());
          out.get(cat)!.set(ex, total(parMois));
        }
      }
      return out;
    };
    const pivotTotal = (
      lire: (s: ReturnType<typeof syntheseExercice>) => Map<string, number>,
    ) => new Map(syns.map(({ ex, syn }) => [ex, total(lire(syn))]));

    const pivotJeux = (
      lire: (s: ReturnType<typeof syntheseExercice>) => Map<string, Map<string, Map<string, number>>>,
    ) => {
      const out = new Map<string, Map<string, Map<string, number>>>();
      for (const { ex, syn } of syns) {
        for (const [jeu, parCat] of lire(syn)) {
          if (!out.has(jeu)) out.set(jeu, new Map());
          for (const [cat, parMois] of parCat) {
            if (!out.get(jeu)!.has(cat)) out.get(jeu)!.set(cat, new Map());
            out.get(jeu)!.get(cat)!.set(ex, total(parMois));
          }
        }
      }
      return out;
    };

    const catsJeux = new Set([...pivotJeux(s => s.jeuxParJeuEtCategorie).values()]
      .flatMap(m => [...m.keys()]));
    const catsImmoJeux = new Set([...pivotJeux(s => s.immosParJeuEtCategorie).values()]
      .flatMap(m => [...m.keys()]));

    /** Ordre du référentiel, puis les catégories qu'il ne connaît pas. */
    const ordonner = (data: Map<string, Map<string, number>>, ref: string[], exclues: Set<string>) =>
      ref.filter(c => data.has(c) && !exclues.has(c))
        .concat([...data.keys()].filter(c => !ref.includes(c) && !exclues.has(c)));

    const chargesData = pivot(s => s.charges);
    const immosData = pivot(s => s.immos);

    const blocs: (BlocTotal & { cats: string[] })[] = [
      {
        cle: 'produits', titre: `Produits par catégorie (${unite})`,
        data: pivot(s => s.produits),
        cats: ordonner(pivot(s => s.produits), refs.categoriesProduits, new Set()),
        totaux: pivotTotal(s => s.totalProduitsParMois),
        ttc: pivotTotal(s => s.totalProduitsTTCParMois),
      },
      {
        cle: 'charges', titre: `Charges par catégorie (${unite})`,
        data: chargesData,
        cats: ordonner(chargesData, refs.categoriesDepenses, catsJeux),
        parJeu: pivotJeux(s => s.jeuxParJeuEtCategorie),
        totaux: pivotTotal(s => s.totalChargesParMois),
        ttc: pivotTotal(s => s.totalChargesTTCParMois),
      },
      {
        cle: 'personnel', titre: `Personnel & rémunérations (${unite})`,
        data: pivot(s => s.personnel),
        cats: ordonner(pivot(s => s.personnel), refs.categoriesDepenses, new Set()),
        totaux: pivotTotal(s => s.totalPersonnelParMois),
        ttc: pivotTotal(s => s.totalPersonnelTTCParMois),
      },
      {
        cle: 'immos', titre: `Immobilisations — investissements (${unite})`,
        data: immosData,
        cats: ordonner(immosData, refs.categoriesDepenses, catsImmoJeux),
        parJeu: pivotJeux(s => s.immosParJeuEtCategorie),
        totaux: pivotTotal(s => s.immoParMois),
        ttc: pivotTotal(s => s.immoTTCParMois),
      },
    ];

    // Le compte de résultat, un exercice par colonne. Il reste en HT.
    const resultat = new Map<string, LigneResultat[]>();
    for (const ex of EXERCICES) {
      const ht = base === 'ht'
        ? syns.find(x => x.ex === ex)!.syn
        : syntheseExercice(entries, ex, refs, 'ht');
      resultat.set(ex, compteResultat({
        moisList: ht.moisList,
        produits: ht.totalProduitsParMois,
        charges: ht.totalChargesParMois,
        personnel: ht.totalPersonnelParMois,
        jeux: new Map(),
        dotations: dotationsParMois(immos, ht.moisList),
        produitsFinanciers: produitsFinanciersParMois(finances, ht.moisList),
        chargesFinancieres: ht.chargesFinancieresParMois,
      }));
    }
    // Le prévisionnel vient combler les exercices vides, en grisé : on lit la
    // trajectoire complète sans jamais confondre le réalisé et le budgété.
    if (avecPrev) {
      for (const ex of prevus) {
        const lignes = ordreAffichage(previsionnels[ex] ?? [], refs);
        const parSection = (sec: PrevSection) => {
          const m = new Map<string, number>();
          for (const l of lignes) {
            if (l.section !== sec || l.unite) continue;
            const v = r2(totalDeLigne(l, lignes) * (base === 'ttc' ? 1 + tauxDeLigne(l, observes) / 100 : 1));
            if (!v) continue;
            const jeu = l.jeu;
            if (jeu) continue;   // les lignes par jeu vont dans leur bandeau
            m.set(l.categorie, r2((m.get(l.categorie) ?? 0) + v));
          }
          return m;
        };
        const parJeuSection = (sec: PrevSection) => {
          const m = new Map<string, Map<string, number>>();
          for (const l of lignes) {
            if (l.section !== sec || l.unite || !l.jeu) continue;
            const v = r2(totalDeLigne(l, lignes) * (base === 'ttc' ? 1 + tauxDeLigne(l, observes) / 100 : 1));
            if (!v) continue;
            if (!m.has(l.jeu)) m.set(l.jeu, new Map());
            m.get(l.jeu)!.set(l.categorie, r2((m.get(l.jeu)!.get(l.categorie) ?? 0) + v));
          }
          return m;
        };
        const remplir = (bloc: typeof blocs[number], sec: PrevSection) => {
          for (const [cat, v] of parSection(sec)) {
            if (!bloc.data.has(cat)) bloc.data.set(cat, new Map());
            bloc.data.get(cat)!.set(ex, v);
            if (!bloc.cats.includes(cat)) bloc.cats.push(cat);
          }
          for (const [jeu, postes] of parJeuSection(sec)) {
            if (!bloc.parJeu) continue;
            if (!bloc.parJeu.has(jeu)) bloc.parJeu.set(jeu, new Map());
            for (const [cat, v] of postes) {
              if (!bloc.parJeu.get(jeu)!.has(cat)) bloc.parJeu.get(jeu)!.set(cat, new Map());
              bloc.parJeu.get(jeu)!.get(cat)!.set(ex, v);
            }
          }
          const somme = r2([...parSection(sec).values()].reduce((s, v) => s + v, 0)
            + [...parJeuSection(sec).values()]
              .reduce((s, m) => s + [...m.values()].reduce((a, v) => a + v, 0), 0));
          bloc.totaux.set(ex, somme);
        };
        remplir(blocs[0], 'produits');
        remplir(blocs[1], 'charges');
        remplir(blocs[2], 'personnel');
        remplir(blocs[3], 'immos');

        // Le résultat prévisionnel de cet exercice, dotations comprises.
        const moisList = moisExercice(ex);
        const carte = (calc: (i: number) => number) =>
          new Map(moisList.map((m, i) => [m, r2(calc(i))]));
        const sectionMois = (sec: PrevSection) => carte(i =>
          lignes.filter(l => l.section === sec && !l.unite)
            .reduce((s, l) => s + (valeursDe(l, lignes)[i] ?? 0), 0));
        const dotationsReelles = dotationsParMois(immos, moisList);
        const immosPrevues = sectionMois('immos');
        resultat.set(ex, compteResultat({
          moisList,
          produits: sectionMois('produits'),
          charges: sectionMois('charges'),
          personnel: sectionMois('personnel'),
          jeux: new Map(),
          dotations: carte(i => {
            let d = dotationsReelles.get(moisList[i]) ?? 0;
            for (let j = 0; j <= i; j++) d += (immosPrevues.get(moisList[j]) ?? 0) / (5 * 12);
            return d;
          }),
          produitsFinanciers: produitsFinanciersParMois(finances, moisList),
          chargesFinancieres: carte(i => lignes
            .filter(l => l.section === 'charges' && !l.unite && estChargeFinanciere(l.categorie))
            .reduce((s, l) => s + (valeursDe(l, lignes)[i] ?? 0), 0)),
        }));
      }
    }

    return { blocs, resultat, exercices: [...EXERCICES], prevus };
  }, [entries, refs, finances, base, unite, immos, avecPrev, previsionnels, observes]);

  const colonnes = exercices;
  /** Une colonne remplie par le prévisionnel se lit en gris et en italique. */
  const estPrevu = (ex: string) => avecPrev && prevus.has(ex as typeof EXERCICES[number]);
  const styleCol = (ex: string) => estPrevu(ex)
    ? { color: '#8d85a6', fontStyle: 'italic' as const }
    : undefined;
  const lignesResultat = resultat.get(colonnes[0])?.map(l => l.cle) ?? [];

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Synthèse totale 2025-30"
        subtitle="La même lecture que la synthèse annuelle, mais une colonne par exercice"
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
            <button
              className="px-3 py-1.5 rounded-md border text-sm font-semibold inline-flex items-center gap-1.5"
              style={avecPrev
                ? { backgroundColor: 'var(--bbg-purple-dark)', color: '#fff', borderColor: 'var(--bbg-purple-dark)' }
                : { backgroundColor: '#fff', color: '#5c5280', borderColor: 'var(--bbg-border)' }}
              title="Compléter les exercices sans écriture avec ce qui est budgété, en grisé"
              onClick={() => setAvecPrev(!avecPrev)}
            >
              {avecPrev ? <CheckSquare size={14} /> : <Square size={14} />} Prévisionnels
            </button>
            <div className="flex rounded-md border overflow-hidden text-sm" style={{ borderColor: 'var(--bbg-border)' }}>
              {([['detail', 'Détaillée', List], ['simple', 'Simplifiée', Rows3]] as const).map(([cle, label, Icone]) => (
                <button
                  key={cle}
                  className="px-3 py-1.5 font-semibold transition-colors inline-flex items-center gap-1.5"
                  style={(cle === 'simple') === simple
                    ? { backgroundColor: 'var(--bbg-purple-dark)', color: '#fff' }
                    : { backgroundColor: '#fff', color: '#5c5280' }}
                  onClick={() => setSimple(cle === 'simple')}
                >
                  <Icone size={14} /> {label}
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="space-y-5">
        {blocs.map(bloc => {
          const t = teinteBloc(bloc.cle, couleurs);
          const grandTotal = somme(bloc.totaux);
          if (!bloc.cats.length && !bloc.parJeu?.size) return null;

          // Répartition par groupe, comme dans la synthèse annuelle.
          const parGroupe = new Map<string, string[]>();
          for (const c of bloc.cats) {
            const g = meta[c]?.groupe ?? '';
            if (!parGroupe.has(g)) parGroupe.set(g, []);
            parGroupe.get(g)!.push(c);
          }
          const ordreGroupes = [
            ...groupes.filter(g => parGroupe.has(g)),
            ...(parGroupe.has('') ? [''] : []),
          ];
          const avecGroupes = ordreGroupes.length > 1
            || (ordreGroupes.length === 1 && ordreGroupes[0] !== '');
          const ligneTotal = (cat: string) => somme(bloc.data.get(cat) ?? new Map());

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
              <div className="overflow-x-auto -mx-4 px-4">
                <table
                  data-table={`totale:${bloc.cle}`} data-bloc={bloc.cle}
                  className="sheet text-sm" style={{ minWidth: 720, ...styleBloc(t) }}
                >
                  <thead>
                    <tr>
                      <th className="text-left" style={{ minWidth: 260 }}>Catégorie</th>
                      {colonnes.map(ex => (
                        <th key={ex} className="num" style={{ minWidth: 110 }}
                          title={estPrevu(ex) ? 'Rempli avec le prévisionnel' : undefined}>
                          {ex}{estPrevu(ex) && <span className="font-normal opacity-70"> · prév.</span>}
                        </th>
                      ))}
                      <th className="num" style={{ minWidth: 120 }}>Cumul</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordreGroupes.map(g => (
                      <Fragment key={`grp-${g}`}>
                        {avecGroupes && (
                          <tr className="band-bloc">
                            <td colSpan={colonnes.length + 2} className="py-1">{g || '— sans groupe —'}</td>
                          </tr>
                        )}
                        {(simple ? [] : parGroupe.get(g)!).map(cat => (
                          <tr key={cat}>
                            <td>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                  style={{ backgroundColor: meta[cat]?.couleur || t.base }} />
                                {cat}
                              </span>
                            </td>
                            {colonnes.map(ex => {
                              const v = bloc.data.get(cat)?.get(ex) ?? 0;
                              return (
                                <td key={ex} className="text-right tabular-nums"
                                  style={v < 0 ? { color: '#38761d' } : styleCol(ex)}>
                                  {v ? euros(r2(v)) : '·'}
                                </td>
                              );
                            })}
                            <td className="text-right tabular-nums font-semibold col-total">
                              {euros(ligneTotal(cat))}
                            </td>
                          </tr>
                        ))}
                        {avecGroupes && (simple || parGroupe.get(g)!.length > 1) && (
                          <tr style={simple ? { fontWeight: 600 } : { fontStyle: 'italic' }}>
                            <td style={{ color: '#6f6690' }}>Sous-total {g || 'sans groupe'}</td>
                            {colonnes.map(ex => {
                              const v = r2(parGroupe.get(g)!
                                .reduce((s, c) => s + (bloc.data.get(c)?.get(ex) ?? 0), 0));
                              return (
                                <td key={ex} className="text-right tabular-nums" style={{ color: '#6f6690' }}>
                                  {v ? euros(v) : '·'}
                                </td>
                              );
                            })}
                            <td className="text-right tabular-nums col-total" style={{ color: '#5c5280' }}>
                              {euros(r2(parGroupe.get(g)!.reduce((s, c) => s + ligneTotal(c), 0)))}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}

                    {/* Un bandeau par jeu, comme dans la synthèse annuelle. */}
                    {!simple && bloc.parJeu && [...bloc.parJeu.keys()].map(jeu => {
                      const postes = bloc.parJeu!.get(jeu)!;
                      return (
                        <Fragment key={`jeu-${jeu}`}>
                          <tr className="band-bloc">
                            <td colSpan={colonnes.length + 2} className="py-1">
                              <span className="inline-flex items-center gap-1.5">
                                <Gamepad2 size={13} /> {jeu}
                              </span>
                            </td>
                          </tr>
                          {[...postes.keys()].map(cat => (
                            <tr key={`${jeu}-${cat}`}>
                              <td className="pl-4">{cat}</td>
                              {colonnes.map(ex => {
                                const v = postes.get(cat)?.get(ex) ?? 0;
                                return (
                                  <td key={ex} className="text-right tabular-nums">
                                    {v ? euros(r2(v)) : '·'}
                                  </td>
                                );
                              })}
                              <td className="text-right tabular-nums font-semibold col-total">
                                {euros(somme(postes.get(cat) ?? new Map()))}
                              </td>
                            </tr>
                          ))}
                          <tr style={{ fontWeight: 700 }}>
                            <td className="pl-4">Total {jeu}</td>
                            {colonnes.map(ex => {
                              const v = r2([...postes.values()].reduce((s, m) => s + (m.get(ex) ?? 0), 0));
                              return <td key={ex} className="text-right tabular-nums">{v ? euros(v) : '·'}</td>;
                            })}
                            <td className="text-right tabular-nums col-total">
                              {euros(r2([...postes.values()].reduce((s, m) => s + somme(m), 0)))}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="total-bloc">
                      <td>TOTAL {bloc.titre.split(' ')[0].toUpperCase()} ({unite})</td>
                      {colonnes.map(ex => (
                        <td key={ex} className="text-right tabular-nums" style={styleCol(ex)}>
                          {bloc.totaux.get(ex) ? euros0(r2(bloc.totaux.get(ex)!)) : '·'}
                        </td>
                      ))}
                      <td className="text-right tabular-nums grand">{euros(grandTotal)}</td>
                    </tr>
                    {bloc.ttc && unite === 'HT' && (
                      <tr>
                        <td title="Le même bloc, taxes comprises.">Total (TTC)</td>
                        {colonnes.map(ex => (
                          <td key={ex} className="text-right tabular-nums">
                            {bloc.ttc!.get(ex) ? euros(r2(bloc.ttc!.get(ex)!)) : '·'}
                          </td>
                        ))}
                        <td className="text-right tabular-nums">{euros(somme(bloc.ttc))}</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </Card>
          );
        })}

        {/* ------------------------------------- Compte de résultat --------- */}
        <Card
          title="Résultat, exercice par exercice (HT)"
          actions={
            <TotalBloc
              label="Résultat cumulé"
              valeur={euros(r2(colonnes.reduce((s, ex) =>
                s + (resultat.get(ex)?.find(l => l.cle === 'rn')?.total ?? 0), 0)))}
              t={teinteBloc('resultat', couleurs)}
            />
          }
        >
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table="totale:resultat" data-bloc="resultat"
              className="sheet text-sm" style={{ minWidth: 720, ...styleBloc(teinteBloc('resultat', couleurs)) }}>
              <thead>
                <tr>
                  <th className="text-left" style={{ minWidth: 260 }}>Solde intermédiaire de gestion</th>
                  {colonnes.map(ex => (
                    <th key={ex} className="num" style={{ minWidth: 110 }}>
                      {ex}{estPrevu(ex) && <span className="font-normal opacity-70"> · prév.</span>}
                    </th>
                  ))}
                  <th className="num" style={{ minWidth: 120 }}>Cumul</th>
                </tr>
              </thead>
              <tbody>
                {lignesResultat.map(cle => {
                  const modele = resultat.get(colonnes[0])!.find(l => l.cle === cle)!;
                  const cumul = r2(colonnes.reduce((s, ex) =>
                    s + (resultat.get(ex)?.find(l => l.cle === cle)?.total ?? 0), 0));
                  return (
                    <tr key={cle} className={estFort(modele) ? 'band-bloc' : undefined}>
                      <td className={estFort(modele) ? undefined : 'pl-4'}>{modele.label}</td>
                      {colonnes.map(ex => {
                        const v = resultat.get(ex)?.find(l => l.cle === cle)?.total ?? 0;
                        return (
                          <td key={ex} className="text-right tabular-nums"
                            style={estFort(modele)
                              ? { fontWeight: 700, color: v >= 0 ? '#2c5d16' : '#8f2b26', ...styleCol(ex) }
                              : styleCol(ex)}>
                            {v ? euros(r2(v)) : '·'}
                          </td>
                        );
                      })}
                      <td className="text-right tabular-nums col-total"
                        style={estFort(modele) ? { fontWeight: 800, color: cumul >= 0 ? '#2c5d16' : '#8f2b26' } : undefined}>
                        {euros(cumul)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
            {avecPrev
              ? 'Les colonnes en gris et en italique sont remplies par le prévisionnel : ce n\'est pas du réalisé. '
              : 'Coche « Prévisionnels » pour compléter les exercices vides avec ce qui est budgété. '}
            Le compte de résultat reste en HT, quoi qu'affiche le bouton : c'est sa base.
            Un exercice sans écriture affiche tout de même ses dotations — l'usure du matériel
            déjà acheté continue de courir.
          </p>
        </Card>
      </div>
    </div>
  );
}
