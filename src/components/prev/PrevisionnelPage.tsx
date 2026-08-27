import { Fragment, useMemo, useState } from 'react';
import {
  Plus, Trash2, AlertTriangle, AlertCircle, Info, Wand2, ArrowRightLeft, Gamepad2,
  Sigma, ListPlus, Clock, List, Rows3, GripVertical
} from 'lucide-react';
import { useStore } from '../../store';
import { useReorganisation } from '../../utils/glisser';
import type { FormulePrev, PrevLigne, PrevSection } from '../../types';
import { EXERCICES, labelMois, moisExercice } from '../../utils/dates';
import { euros, euros0, r2, pourcent, parseMontant } from '../../utils/money';
import {
  SECTIONS, SECTIONS_DEPENSES, alarmesPrevisionnel, reelParCategorie, reelParCategorieEtMois,
  ordreAffichage, reelParJeuEtCategorie, sectionDeCategorie, tauxDeLigne, tauxObserves,
  totalDeLigne, valeursDe,
} from '../../utils/previsionnel';
import { teinteBloc, estChargeFinanciere, GROUPE_PERSONNEL, type BlocCle } from '../../utils/blocs';
import {
  compteResultat, dotationsParMois, immoInfos, produitsFinanciersParMois, type LigneResultat,
} from '../../utils/calc';
import {
  PageHeader, Card, Btn, StatCard, MoneyInput, BlocColorMenu, TotalBloc, styleBloc, MonthTabs,
} from '../ui';
import { useSelectionCellules } from '../../utils/selection';
import { useEtatVue } from '../../utils/etatVue';

/** Durée d'amortissement retenue pour une immobilisation prévue, faute de mieux. */
const DUREE_IMMO_PREVUE = 5;

export function PrevisionnelPage() {
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const refs = useStore(s => s.referentiels);
  const couleurs = useStore(s => s.blocCouleurs);
  const previsionnels = useStore(s => s.previsionnels);
  const setPrevCell = useStore(s => s.setPrevCell);
  const viderPrevCells = useStore(s => s.viderPrevCells);
  const addPrevLigne = useStore(s => s.addPrevLigne);
  const updatePrevLigne = useStore(s => s.updatePrevLigne);
  const removePrevLigne = useStore(s => s.removePrevLigne);
  const etalerPrevLigne = useStore(s => s.etalerPrevLigne);
  const addCategorie = useStore(s => s.addCategorie);
  const setCategorieMeta = useStore(s => s.setCategorieMeta);
  const setPrevFormule = useStore(s => s.setPrevFormule);
  const creerCalculHeures = useStore(s => s.creerCalculHeures);
  const completerPrevisionnel = useStore(s => s.completerPrevisionnel);

  const [exercice, setExercice] = useEtatVue('prev.exercice', '2025-26',
    v => (EXERCICES as readonly string[]).includes(v));
  /** HT (base du résultat) ou TTC (ce qui sort vraiment du compte). */
  const [base, setBase] = useEtatVue<'ht' | 'ttc'>('prev.base', 'ht');
  /** Vue simplifiée : les totaux seuls, comme dans la synthèse. */
  const [simple, setSimple] = useEtatVue('prev.simple', false);
  const [nouvelleCat, setNouvelleCat] = useState('');
  const [alarmesOuvertes, setAlarmesOuvertes] = useState(true);

  // Sélection de plusieurs cellules à la souris : Suppr les vide d'un coup.
  // La clé de tableau porte l'identifiant de la ligne, la colonne le mois.
  const selection = useSelectionCellules(cells => {
    viderPrevCells(exercice, cells.map(c => ({ ligneIdx: c.ligne, moisIdx: c.col })));
  });

  const moisList = moisExercice(exercice);
  // Même ordre que la synthèse : celui du référentiel, jeux compris.
  const lignes = useMemo(
    () => ordreAffichage(previsionnels[exercice] ?? [], refs),
    [previsionnels, exercice, refs],
  );
  const meta = refs.categoriesMeta ?? {};
  const groupes = refs.groupes ?? [];
  const jeuxCatalogue = refs.jeux ?? [];
  const deplacerCategorie = useStore(s => s.deplacerCategorie);
  const deplacerGroupe = useStore(s => s.deplacerGroupe);
  const deplacerJeu = useStore(s => s.deplacerJeu);

  /**
   * Déplacer une ligne à la souris. L'ordre est celui du référentiel : bouger
   * une ligne ici la bouge aussi dans la synthèse, les deux restent en regard.
   * Une catégorie portée par plusieurs lignes les emmène toutes ensemble.
   */
  const reorg = useReorganisation((source, cible, apres, genre) => {
    if (genre === 'jeu') { deplacerJeu(source, cible, apres); return; }
    if (genre === 'groupe') { deplacerGroupe(source, cible, apres); return; }
    const arrivee = meta[cible]?.groupe ?? '';
    const depart = meta[source]?.groupe ?? '';
    deplacerCategorie(source, cible, apres, arrivee === depart ? undefined : arrivee);
  });

  // TVA du prévisionnel : le taux propre à la ligne, sinon celui que le journal
  // observe déjà sur la catégorie. Les montants restent stockés en HT.
  const observes = useMemo(() => tauxObserves(entries), [entries]);
  const tauxDe = (l: PrevLigne) => tauxDeLigne(l, observes);
  const coef = (l: PrevLigne) => base === 'ttc' && !l.unite ? 1 + tauxDe(l) / 100 : 1;
  /** Montant tel qu'il s'affiche, dans la base choisie. */
  const aff = (v: number | null, l: PrevLigne) => v == null ? null : r2(v * coef(l));
  /** L'inverse : ce qui est tapé à l'écran, ramené en HT pour le stockage. */
  const enHT = (v: number | null, l: PrevLigne) => v == null ? null : r2(v / coef(l));

  const reel = useMemo(() => reelParCategorie(entries, exercice), [entries, exercice]);
  // Réel ventilé par bloc : une immobilisation ne doit pas gonfler les charges.
  const reelParSection = useMemo(() => {
    const m = new Map<PrevSection, Map<string, number>>();
    for (const sec of SECTIONS) m.set(sec.cle, reelParCategorie(entries, exercice, refs, sec.cle, base));
    return m;
  }, [entries, exercice, refs, base]);
  const reelMois = useMemo(
    () => reelParCategorieEtMois(entries, exercice, undefined, undefined, base),
    [entries, exercice, base]);
  const reelJeux = useMemo(() => reelParJeuEtCategorie(entries, exercice, refs), [entries, exercice, refs]);
  const alarmes = useMemo(() => alarmesPrevisionnel(lignes, reel, refs), [lignes, reel, refs]);
  const immos = useMemo(() => immoInfos(entries), [entries]);

  const toutesCategories = [
    ...refs.categoriesProduits, ...refs.categoriesDepenses, ...refs.categoriesJeux,
  ];

  // Chaque colonne de mois occupe 60,5 % / n : on fixe une largeur mini pour que
  // « 12 345,67 € » tienne dans la case, comme dans la synthèse (74 px par mois).
  const largeurMini = Math.max(1050, Math.round(74 * moisList.length / 0.605));

  const totalLigne = (l: PrevLigne) => totalDeLigne(l, lignes);
  const lignesDe = (sec: PrevSection) => lignes.filter(l => l.section === sec);
  const totalSection = (sec: PrevSection) =>
    r2(lignesDe(sec).filter(l => !l.unite).reduce((s, l) => s + totalLigne(l) * coef(l), 0));
  /** Prévu d'une section, mois par mois, dans la base affichée. */
  const prevuMois = (sec: PrevSection, i: number) =>
    r2(lignesDe(sec).filter(l => !l.unite)
      .reduce((s, l) => s + (valeursDe(l, lignes)[i] ?? 0) * coef(l), 0));

  const totalPrevu = r2(SECTIONS_DEPENSES.reduce((s, sec) => s + totalSection(sec), 0));
  const totalProduits = totalSection('produits');
  const reelDepenses = r2([...reel.entries()]
    .filter(([c]) => !refs.categoriesProduits.includes(c))
    .reduce((s, [, v]) => s + v, 0));
  const reelProduits = r2([...reel.entries()]
    .filter(([c]) => refs.categoriesProduits.includes(c))
    .reduce((s, [, v]) => s + v, 0));

  const erreurs = alarmes.filter(a => a.niveau === 'erreur');
  const attentions = alarmes.filter(a => a.niveau === 'attention');

  // ----- Compte de résultat prévisionnel, mêmes lignes que la synthèse -----
  const resultat: LigneResultat[] = useMemo(() => {
    const carte = (calc: (i: number) => number) =>
      new Map(moisList.map((m, i) => [m, r2(calc(i))]));
    const sectionMois = (sec: PrevSection) => carte(i =>
      lignes.filter(l => l.section === sec && !l.unite)
        .reduce((s, l) => s + (valeursDe(l, lignes)[i] ?? 0), 0));

    // Dotations : celles des immobilisations déjà au bilan, plus celles que
    // déclencheraient les investissements prévus (linéaire, 5 ans).
    const dotationsReelles = dotationsParMois(immos, moisList);
    const immosPrevues = sectionMois('immos');
    const dotations = carte(i => {
      let d = dotationsReelles.get(moisList[i]) ?? 0;
      for (let j = 0; j <= i; j++) {
        d += (immosPrevues.get(moisList[j]) ?? 0) / (DUREE_IMMO_PREVUE * 12);
      }
      return d;
    });

    const chargesFinancieres = carte(i => lignes
      .filter(l => l.section === 'charges' && !l.unite && estChargeFinanciere(l.categorie))
      .reduce((s, l) => s + (valeursDe(l, lignes)[i] ?? 0), 0));

    return compteResultat({
      moisList,
      produits: sectionMois('produits'),
      charges: sectionMois('charges'),
      personnel: sectionMois('personnel'),
      jeux: sectionMois('jeux'),
      dotations,
      // Les intérêts prévus sont saisis une seule fois, en trésorerie.
      produitsFinanciers: produitsFinanciersParMois(finances, moisList),
      chargesFinancieres,
    });
  }, [lignes, moisList, immos, finances]);

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Prévisionnel"
        subtitle="Mêmes blocs, mêmes catégories et mêmes mois que la synthèse annuelle — dans le même ordre"
        actions={
          <>
            <div className="flex gap-1">
              <input
                className="border rounded px-2 py-1.5 text-sm w-52 bg-white"
                style={{ borderColor: 'var(--bbg-border)' }}
                placeholder="Ajouter une ligne…"
                list="categories-dispo"
                value={nouvelleCat}
                onChange={ev => setNouvelleCat(ev.target.value)}
                onKeyDown={ev => {
                  if (ev.key === 'Enter' && nouvelleCat.trim()) {
                    addPrevLigne(exercice, nouvelleCat.trim());
                    setNouvelleCat('');
                  }
                }}
              />
              <datalist id="categories-dispo">
                {toutesCategories.map(c => <option key={c} value={c} />)}
              </datalist>
              <Btn variant="primary" onClick={() => {
                if (nouvelleCat.trim()) { addPrevLigne(exercice, nouvelleCat.trim()); setNouvelleCat(''); }
              }}>
                <Plus size={14} />
              </Btn>
            </div>
            <Btn onClick={() => completerPrevisionnel(exercice)}
              title="Ajouter les lignes de la synthèse qui manquent encore, cellules vides">
              <span className="inline-flex items-center gap-1.5"><ListPlus size={14} /> Compléter la grille</span>
            </Btn>
            <div className="flex rounded-md border overflow-hidden text-sm" style={{ borderColor: 'var(--bbg-border)' }}>
              {(['ht', 'ttc'] as const).map(b => (
                <button
                  key={b}
                  className="px-3 py-1.5 font-semibold transition-colors"
                  style={base === b
                    ? { backgroundColor: 'var(--bbg-purple-dark)', color: '#fff' }
                    : { backgroundColor: '#fff', color: '#5c5280' }}
                  title={b === 'ht'
                    ? 'Hors taxes — la base du résultat'
                    : 'Toutes taxes comprises — ce qui sort vraiment du compte'}
                  onClick={() => setBase(b)}
                >
                  {b.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border overflow-hidden text-sm" style={{ borderColor: 'var(--bbg-border)' }}>
              {([['detail', 'Détaillée', List], ['simple', 'Simplifiée', Rows3]] as const).map(([cle, label, Icone]) => (
                <button
                  key={cle}
                  className="px-3 py-1.5 font-semibold transition-colors inline-flex items-center gap-1.5"
                  style={(cle === 'simple') === simple
                    ? { backgroundColor: 'var(--bbg-purple-dark)', color: '#fff' }
                    : { backgroundColor: '#fff', color: '#5c5280' }}
                  onClick={() => setSimple(cle === 'simple')}
                  title={cle === 'simple'
                    ? 'Les totaux et sous-totaux seuls'
                    : 'Toutes les lignes'}
                >
                  <Icone size={14} /> {label}
                </button>
              ))}
            </div>
          </>
        }
      />

      {/* Un onglet par exercice : on passe de 2026-27 à 2027-28 d'un clic. */}
      <MonthTabs
        mois={exercice}
        moisList={[...EXERCICES]}
        labelOf={ex => ex}
        badgeOf={ex => (previsionnels[ex] ?? []).reduce(
          (n, l) => n + l.valeurs.filter(v => v != null).length, 0)}
        onChange={setExercice}
      />

      {/* Bandeau flottant : il ne doit pas décaler le tableau pendant le balayage. */}
      {selection.nb > 0 && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full border shadow-lg
            flex items-center gap-3 text-sm"
          style={{ backgroundColor: 'var(--bbg-purple-light)', borderColor: 'var(--bbg-purple)', color: 'var(--bbg-purple-darker)' }}
        >
          <b>{selection.nb} cellules sélectionnées</b>
          <span>— <b>Suppr</b> les vide toutes, <b>Échap</b> annule.</span>
          <Btn variant="ghost" onClick={selection.effacer}>Désélectionner</Btn>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="Produits prévus" value={euros0(totalProduits)} tone="good"
          sub={`réel ${euros0(reelProduits)}`} />
        <StatCard label="Dépenses prévues" value={euros0(totalPrevu)} tone="accent"
          sub={`réel ${euros0(reelDepenses)}`} />
        <StatCard label="Résultat net prévu"
          value={euros0(resultat.find(l => l.cle === 'rn')?.total ?? 0)}
          tone={(resultat.find(l => l.cle === 'rn')?.total ?? 0) >= 0 ? 'good' : 'bad'}
          sub="après dotations et impôt" />
        <StatCard label="Budget consommé"
          value={totalPrevu ? pourcent(reelDepenses / totalPrevu) : '—'}
          tone={reelDepenses <= totalPrevu ? 'good' : 'bad'} />
        <StatCard label="Alarmes" value={String(alarmes.length)}
          tone={erreurs.length ? 'bad' : attentions.length ? 'accent' : 'good'}
          sub={erreurs.length ? `${erreurs.length} à corriger` : 'cohérent avec la synthèse'} />
      </div>

      {/* Alarmes de cohérence */}
      {alarmes.length > 0 && (
        <Card
          className="mb-4"
          title={
            <span className="inline-flex items-center gap-2">
              <AlertTriangle size={16} style={{ color: erreurs.length ? '#b7332e' : 'var(--bbg-orange-dark)' }} />
              {alarmes.length} alarme{alarmes.length > 1 ? 's' : ''} de cohérence
            </span>
          }
          actions={
            <Btn variant="ghost" onClick={() => setAlarmesOuvertes(v => !v)}>
              {alarmesOuvertes ? 'Réduire' : 'Voir le détail'}
            </Btn>
          }
        >
          {alarmesOuvertes ? (
            <ul className="space-y-1.5">
              {alarmes.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {a.niveau === 'erreur'
                    ? <AlertCircle size={15} className="shrink-0 mt-0.5" style={{ color: '#b7332e' }} />
                    : a.niveau === 'attention'
                      ? <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--bbg-orange-dark)' }} />
                      : <Info size={15} className="shrink-0 mt-0.5" style={{ color: '#6f6690' }} />}
                  <span style={{ color: '#3f3268' }}>{a.message}</span>
                  {a.action === 'creer' && (
                    <button
                      className="shrink-0 text-xs underline" style={{ color: 'var(--bbg-purple-dark)' }}
                      onClick={() => addPrevLigne(exercice, a.categorie, a.section)}
                    >
                      créer la ligne
                    </button>
                  )}
                  {a.action === 'creerCategorie' && (
                    <button
                      className="shrink-0 text-xs underline" style={{ color: 'var(--bbg-purple-dark)' }}
                      onClick={() => {
                        addCategorie(
                          a.section === 'produits' ? 'categoriesProduits'
                            : a.section === 'jeux' ? 'categoriesJeux' : 'categoriesDepenses',
                          a.categorie);
                        if (a.section === 'personnel') {
                          setCategorieMeta([a.categorie], { groupe: GROUPE_PERSONNEL });
                        }
                      }}
                    >
                      créer la catégorie
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: '#6f6690' }}>
              {erreurs.length} erreur{erreurs.length > 1 ? 's' : ''} · {attentions.length} avertissement{attentions.length > 1 ? 's' : ''}
            </p>
          )}
        </Card>
      )}

      <div className="space-y-5">
        {SECTIONS.map(sec => {
          const lignesSec = lignesDe(sec.cle);
          const reelSec = reelParSection.get(sec.cle) ?? new Map<string, number>();
          const catsSec = new Set(lignesSec.map(l => l.categorie));
          const manquantes = [...reelSec.entries()]
            .filter(([c, v]) => v !== 0 && !catsSec.has(c))
            .map(([c]) => c);
          const estIndicateurs = sec.cle === 'indicateurs';
          if (!lignesSec.length && !manquantes.length && sec.cle !== 'personnel') return null;

          const t = teinteBloc((estIndicateurs ? 'resultat' : sec.cle) as BlocCle, couleurs);
          const total = totalSection(sec.cle);

          /** Le réel d'une ligne : par jeu quand la ligne en porte un. */
          const reelDeLigne = (l: PrevLigne) => l.jeu
            ? (reelJeux.get(l.jeu)?.get(l.categorie) ?? 0)
            : (reelSec.get(l.categorie) ?? reel.get(l.categorie) ?? 0);

          // Regroupement : une ligne rattachée à un jeu passe sous le bandeau de
          // ce jeu, les autres sous leur groupe de catégories. Les jeux ferment
          // le bloc, après les postes généraux.
          const cle = (l: PrevLigne) => l.jeu || (meta[l.categorie]?.groupe ?? '');
          const parGroupe = new Map<string, PrevLigne[]>();
          for (const l of lignesSec) {
            const g = cle(l);
            if (!parGroupe.has(g)) parGroupe.set(g, []);
            parGroupe.get(g)!.push(l);
          }
          const estJeu = (g: string) => jeuxCatalogue.includes(g);
          const ordre = [
            ...groupes.filter(g => parGroupe.has(g) && !estJeu(g)),
            ...(parGroupe.has('') ? [''] : []),
            ...jeuxCatalogue.filter(j => parGroupe.has(j)),
            ...[...parGroupe.keys()].filter(g => g && !estJeu(g) && !groupes.includes(g)),
          ];
          const avecGroupes = ordre.some(estJeu)
            || ordre.length > 1 || (ordre.length === 1 && ordre[0] !== '');

          return (
            <Card
              key={sec.cle}
              title={`${sec.titre}${estIndicateurs ? '' : ` (${base.toUpperCase()})`} — prévisionnel ${exercice}`}
              actions={
                <>
                  {sec.cle === 'produits' && (
                    <Btn onClick={() => creerCalculHeures(exercice, 'workshops', 'produits')}
                      title="Ajouter une ligne d'heures et son montant calculé (taux × heures du mois précédent)">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={13} /> Heures × taux
                      </span>
                    </Btn>
                  )}
                  {!estIndicateurs && <TotalBloc label="Total prévu" valeur={euros(total)} t={t} />}
                  {!estIndicateurs && <BlocColorMenu bloc={sec.cle as BlocCle} />}
                </>
              }
            >
              {!lignesSec.length && !manquantes.length ? (
                <p className="text-sm italic" style={{ color: '#9a92b5' }}>
                  Rien de prévu ici pour l'instant. Ajoute une ligne quand un salaire ou une
                  cotisation entrera dans le plan de marche.
                </p>
              ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table
                    data-table={`prev:${sec.cle}:${moisList.length}`} data-bloc={sec.cle}
                    className="sheet text-xs"
                    style={{ tableLayout: 'fixed', minWidth: largeurMini, ...styleBloc(t) }}
                  >
                    <colgroup>
                      <col style={{ width: '17%' }} />
                      {moisList.map((_, i) => <col key={i} style={{ width: `${60.5 / moisList.length}%` }} />)}
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '6.5%' }} />
                      <col style={{ width: '6%' }} />
                      <col style={{ width: '3%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="text-left">{sec.cle === 'jeux' ? 'Jeu / poste' : 'Ligne'}</th>
                        {moisList.map(m => <th key={m} className="num">{labelMois(m)}</th>)}
                        <th className="num">Prévu</th>
                        <th className="num">Réel</th>
                        <th className="num">Écart</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordre.map(g => (
                        <Fragment key={`${sec.cle}-${g}`}>
                          {avecGroupes && (
                            <tr className="band-bloc"
                              {...(g ? reorg.ligne(estJeu(g) ? 'jeu' : 'groupe', g) : {})}>
                              <td colSpan={moisList.length + 5} className="py-1">
                                <span className="inline-flex items-center gap-1.5">
                                  {g && (
                                    <span className="poignee-glisse" {...reorg.poignee()}
                                      title={estJeu(g)
                                        ? "Glisser pour changer l'ordre des jeux"
                                        : 'Glisser pour déplacer tout le groupe'}>
                                      <GripVertical size={13} />
                                    </span>
                                  )}
                                  {estJeu(g) && <Gamepad2 size={13} />}
                                  {g || '— sans groupe —'}
                                </span>
                              </td>
                            </tr>
                          )}
                          {(simple ? [] : parGroupe.get(g)!).map(l => {
                            const idxLigne = lignes.indexOf(l);
                            const calculees = valeursDe(l, lignes);
                            const prevu = totalLigne(l);
                            const reelCat = reelDeLigne(l);
                            const ecart = r2(reelCat - (aff(prevu, l) ?? 0));
                            const rattachee = toutesCategories.includes(l.categorie);
                            const estMontant = !l.unite;
                            return (
                              <tr key={l.id} className="group" {...reorg.ligne('categorie', l.categorie)}>
                                <td>
                                  <div className="flex items-center gap-1">
                                    <span className="poignee-glisse shrink-0" {...reorg.poignee()}
                                      title="Glisser pour remonter ou descendre cette ligne">
                                      <GripVertical size={13} />
                                    </span>
                                    {!rattachee && estMontant && (
                                      <span title="Cette ligne ne correspond à aucune catégorie de la synthèse">
                                        <AlertCircle size={13} className="shrink-0" style={{ color: '#b7332e' }} />
                                      </span>
                                    )}
                                    <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                      style={{ backgroundColor: meta[l.categorie]?.couleur || t.base }} />
                                    <select
                                      className="min-w-0 flex-1"
                                      style={rattachee ? undefined : { color: '#b7332e' }}
                                      value={l.categorie}
                                      onChange={ev => updatePrevLigne(exercice, l.id, {
                                        categorie: ev.target.value,
                                        section: sectionDeCategorie(ev.target.value, refs),
                                      })}
                                    >
                                      {!rattachee && <option value={l.categorie}>{l.categorie} (non rattachée)</option>}
                                      {toutesCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    {l.unite && (
                                      <span className="text-[10px] px-1 rounded shrink-0"
                                        style={{ backgroundColor: '#e6e9f2', color: '#5c5280' }}>{l.unite}</span>
                                    )}
                                    {l.formule && (
                                      <span title="Ligne calculée" className="shrink-0">
                                        <Sigma size={12} style={{ color: 'var(--bbg-purple-dark)' }} />
                                      </span>
                                    )}
                                    {base === 'ttc' && estMontant && (
                                      <select
                                        className="text-[10px] px-0.5"
                                        // `.sheet select` vaut 100 % : on fixe la largeur pour que
                                        // le taux ne mange pas le nom de la catégorie.
                                        style={{
                                          flex: '0 0 auto', width: 56,
                                          backgroundColor: l.tauxTVA == null ? '#eee9f8' : 'var(--bbg-purple-light)',
                                          color: 'var(--bbg-purple-darker)',
                                        }}
                                        value={tauxDe(l)}
                                        title={l.tauxTVA == null
                                          ? `Taux repris du journal pour « ${l.categorie} ». Choisis-en un autre pour le fixer.`
                                          : 'Taux fixé sur cette ligne'}
                                        onChange={ev => updatePrevLigne(exercice, l.id, { tauxTVA: Number(ev.target.value) })}
                                      >
                                        {[...new Set([...refs.tauxTVA, tauxDe(l)])].sort((a, b) => a - b)
                                          .map(t => <option key={t} value={t}>{t} %</option>)}
                                      </select>
                                    )}
                                  </div>
                                  {l.formule && (
                                    <TauxHoraire
                                      formule={l.formule}
                                      onChange={f => setPrevFormule(exercice, l.id, f)}
                                    />
                                  )}
                                </td>
                                {moisList.map((m, i) => (
                                  l.formule ? (
                                    <td key={m} className="text-right tabular-nums"
                                      title={`Calculé : ${l.formule.tauxHT.toFixed(2).replace('.', ',')} € × les heures de ${
                                        i - l.formule.decalage >= 0 ? labelMois(moisList[i - l.formule.decalage]) : '—'}`}
                                      style={{ color: '#5c5280', fontStyle: 'italic' }}>
                                      <span className="block truncate text-xs">
                                        {calculees[i] ? euros(aff(calculees[i], l)!) : '·'}
                                      </span>
                                    </td>
                                  ) : (
                                    <td
                                      key={m} className="text-right p-0.5!"
                                      {...selection.props('prev', idxLigne, i)}
                                    >
                                      <MoneyInput
                                        value={aff(l.valeurs[i] ?? null, l)}
                                        onCommit={v => setPrevCell(exercice, l.id, i, enHT(v, l))}
                                        className="w-full min-w-12 border-transparent hover:border-[#ddd6ef] bg-transparent text-xs"
                                      />
                                    </td>
                                  )
                                ))}
                                <td className="text-right tabular-nums font-semibold col-total">
                                  {estMontant ? euros(aff(prevu, l)!) : r2(prevu).toLocaleString('fr-FR')}
                                </td>
                                <td className="text-right tabular-nums" style={{ color: '#5c5280' }}>
                                  {estMontant ? (reelCat ? euros(reelCat) : '·') : '—'}
                                </td>
                                <td className="text-right tabular-nums"
                                  style={{ color: !estMontant ? '#9a92b5' : sec.cle === 'produits'
                                    ? (ecart >= 0 ? '#38761d' : '#b7332e')
                                    : (ecart > 0 ? '#b7332e' : '#38761d') }}>
                                  {estMontant && (prevu || reelCat) ? euros(ecart) : '·'}
                                </td>

                                <td>
                                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                    <button
                                      title="Étaler le premier montant sur tous les mois"
                                      style={{ color: 'var(--bbg-purple-dark)' }}
                                      onClick={() => {
                                        const premier = l.valeurs.find(v => v != null) ?? 0;
                                        etalerPrevLigne(exercice, l.id, premier);
                                      }}
                                    >
                                      <ArrowRightLeft size={13} />
                                    </button>
                                    <button
                                      title="Supprimer la ligne" style={{ color: '#d98b86' }}
                                      onClick={() => { if (confirm(`Supprimer la ligne « ${l.categorie} » ?`)) removePrevLigne(exercice, l.id); }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {avecGroupes && (simple || parGroupe.get(g)!.length > 1) && (
                            <tr style={simple ? { fontWeight: 600 } : { fontStyle: 'italic' }}>
                              <td style={{ color: '#6f6690' }}>
                                Sous-total {g || 'sans groupe'}
                              </td>
                              {moisList.map((m, i) => {
                                const v = r2(parGroupe.get(g)!.filter(l => !l.unite)
                                  .reduce((acc, l) => acc + (valeursDe(l, lignes)[i] ?? 0) * coef(l), 0));
                                return (
                                  <td key={m} className="text-right tabular-nums" style={{ color: '#6f6690' }}>
                                    {v ? euros(v) : '·'}
                                  </td>
                                );
                              })}
                              <td className="text-right tabular-nums col-total" style={{ color: '#5c5280' }}>
                                {euros(r2(parGroupe.get(g)!.filter(l => !l.unite)
                                  .reduce((acc, l) => acc + totalLigne(l) * coef(l), 0)))}
                              </td>
                              <td className="text-right tabular-nums" style={{ color: '#5c5280' }}>
                                {euros(r2(parGroupe.get(g)!
                                  .reduce((acc, l) => acc + (reelSec.get(l.categorie) ?? 0), 0)))}
                              </td>
                              <td className="col-total"></td>
                              <td></td>
                            </tr>
                          )}
                        </Fragment>
                      ))}

                      {(simple ? [] : manquantes).map(cat => (
                        <tr key={`manque-${cat}`} style={{ fontStyle: 'italic' }}>
                          <td>
                            <span className="inline-flex items-center gap-1" style={{ color: 'var(--bbg-orange-dark)' }}>
                              <AlertTriangle size={12} className="shrink-0" />
                              {cat} <span style={{ color: '#9a92b5' }}>(non budgété)</span>
                            </span>
                          </td>
                          {moisList.map(m => {
                            const v = reelMois.get(cat)?.get(m) ?? 0;
                            return <td key={m} className="text-right tabular-nums" style={{ color: '#9a92b5' }}>{v ? euros(r2(v)) : '·'}</td>;
                          })}
                          <td className="text-right col-total" style={{ color: '#9a92b5' }}>—</td>
                          <td className="text-right tabular-nums" style={{ color: '#5c5280' }}>{euros(reelSec.get(cat) ?? 0)}</td>
                          <td className="text-right tabular-nums" style={{ color: '#b7332e' }}>{euros(reelSec.get(cat) ?? 0)}</td>
                          <td>
                            <button
                              title="Créer la ligne prévisionnelle" className="mx-auto block"
                              style={{ color: 'var(--bbg-purple-dark)' }}
                              onClick={() => addPrevLigne(exercice, cat, sec.cle)}
                            >
                              <Wand2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="total-bloc">
                        <td>TOTAL {sec.titre.toUpperCase()} ({base.toUpperCase()})</td>
                        {moisList.map((m, i) => {
                          const v = prevuMois(sec.cle, i);
                          return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                        })}
                        <td className="text-right tabular-nums grand">{euros(total)}</td>
                        <td className="text-right tabular-nums">
                          {euros0(r2([...reelSec.values()].reduce((s, v) => s + v, 0)))}
                        </td>
                        <td className="text-right tabular-nums">
                          {euros0(r2([...reelSec.values()].reduce((s, v) => s + v, 0) - total))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {sec.cle === 'jeux' && (
                <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
                  Les lignes sont rangées par jeu, comme dans la synthèse. Le réel d'une ligne
                  rattachée à un jeu ne compte que les dépenses de ce jeu.
                </p>
              )}
            </Card>
          );
        })}

        {/* ------------------------------- Résultat prévisionnel ---------- */}
        <ResultatPrev lignes={resultat} moisList={moisList} couleurs={couleurs} />
      </div>

      <p className="text-xs mt-4" style={{ color: '#9a92b5' }}>
        Les lignes reprennent les catégories, les groupes et l'ordre de la synthèse annuelle :
        renommer ou regrouper une catégorie dans l'onglet Catégories se répercute des deux côtés.
        Les lignes en italique sont des dépenses réelles sans prévision — la baguette les ajoute.
      </p>
    </div>
  );
}

// ------------------------------------------- Compte de résultat prévu ------

function ResultatPrev({ lignes, moisList, couleurs }: {
  lignes: LigneResultat[]; moisList: string[]; couleurs: Record<string, string>;
}) {
  const t = teinteBloc('resultat', couleurs);
  const rn = lignes.find(l => l.cle === 'rn')!;
  const couleurValeur = (l: LigneResultat, v: number) =>
    l.signe ? (v > 0 ? '#38761d' : v < 0 ? '#b7332e' : '#9a92b5') : undefined;

  return (
    <Card
      title="Résultat prévisionnel de l'exercice (HT)"
      actions={
        <>
          <TotalBloc label="Résultat net prévu" valeur={euros(rn.total)} t={t} />
          <BlocColorMenu bloc="resultat" />
        </>
      }
    >
      <div className="overflow-x-auto -mx-4 px-4">
        <table
          data-table={`prev:resultat:${moisList.length}`} data-bloc="resultat"
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
              <tr key={l.cle} className={l.niveau === 'agregat' ? 'band-bloc' : undefined} title={l.aide}>
                <td className={l.niveau === 'detail' ? 'pl-4' : undefined}>{l.label}</td>
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
              <td>RÉSULTAT NET PRÉVU</td>
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
        Même enchaînement que la synthèse : EBE → REX → RC → RN, avec le barème PME de l'IS.
        Les dotations prévues cumulent celles des immobilisations déjà au bilan et celles que
        déclencheraient les investissements prévus, amortis en linéaire sur {DUREE_IMMO_PREVUE} ans
        à partir du mois d'achat.
      </p>
    </Card>
  );
}

// ------------------------------------------------- Taux d'une ligne calculée ---

/**
 * Le taux horaire, en tête de la ligne calculée : saisissable en HT comme en
 * TTC (l'un se déduit de l'autre), avec le décalage de paiement.
 */
function TauxHoraire({ formule, onChange }: {
  formule: FormulePrev; onChange: (f: FormulePrev) => void;
}) {
  const ttc = r2(formule.tauxHT * (1 + formule.tauxTVA / 100));
  const champ = "w-14 px-1 py-0.5 border rounded text-right text-[11px] tabular-nums bg-white";
  const commit = (v: number | null, ht: boolean) => {
    if (v == null) return;
    const tauxHT = ht ? v : r2(v / (1 + formule.tauxTVA / 100));
    if (tauxHT !== formule.tauxHT) onChange({ ...formule, tauxHT });
  };

  return (
    <div className="mt-1 rounded border px-1.5 py-1 text-[11px] inline-block"
      style={{ borderColor: 'var(--bbg-border-soft)', backgroundColor: '#fbfaff', color: '#6f6690' }}>
      <div className="flex items-center gap-1 whitespace-nowrap">
        <span className="font-semibold">Taux</span>
        <input
          className={champ} style={{ borderColor: 'var(--bbg-border-soft)' }}
          defaultValue={String(r2(formule.tauxHT)).replace('.', ',')}
          title="Taux horaire hors taxes"
          onBlur={ev => commit(parseMontant(ev.target.value), true)}
          onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
        />
        <span>HT</span>
        <input
          className={champ} style={{ borderColor: 'var(--bbg-border-soft)' }}
          key={ttc}
          defaultValue={String(ttc).replace('.', ',')}
          title="Taux horaire toutes taxes comprises"
          onBlur={ev => commit(parseMontant(ev.target.value), false)}
          onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
        />
        <span>TTC</span>
      </div>
      <div className="flex items-center gap-1 mt-0.5 whitespace-nowrap">
        <span>encaissé</span>
        <select
          className="border rounded px-1 py-0.5 text-[11px] bg-white flex-1 min-w-0"
          style={{ borderColor: 'var(--bbg-border-soft)' }}
          value={formule.decalage}
          title="Décalage entre les heures effectuées et l'encaissement"
          onChange={ev => onChange({ ...formule, decalage: Number(ev.target.value) })}
        >
          <option value={0}>le mois même</option>
          <option value={1}>le mois suivant</option>
          <option value={2}>à +2 mois</option>
          <option value={3}>à +3 mois</option>
        </select>
      </div>
    </div>
  );
}
