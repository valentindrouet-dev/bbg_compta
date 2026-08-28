import { Fragment, useMemo, useState } from 'react';
import {
  Plus, Trash2, AlertTriangle, AlertCircle, Info, Wand2, ArrowRightLeft, Gamepad2, Sigma, ListPlus, Clock, GripVertical, Percent, Calculator, Receipt, TrendingUp, Landmark, Boxes, Table2, CopyPlus,
} from 'lucide-react';
import { useStore } from '../../store';
import { BAREME_TNS, cotisationsTNS } from '../../utils/tns';
import { useReorganisation } from '../../utils/glisser';
import { couleurJeu, encreSur } from '../../utils/jeux';
import type {
  FormuleHeuresTaux, FormulePourcentage, FormulePrev, PrevLigne, PrevSection,
} from '../../types';
import { EXERCICES, labelMois, moisExercice } from '../../utils/dates';
import { euros, euros0, r2, pourcent, parseMontant } from '../../utils/money';
import {
  SECTIONS, SECTIONS_DEPENSES, alarmesPrevisionnel, reelParCategorie, reelParCategorieEtMois,
  jeuDeLigne, ordreAffichage, reelParJeuEtCategorie, sectionDeCategorie, sommeDeLigne,
  tauxDeLigne, tauxObserves,
  totalDeLigne, valeursDe,
} from '../../utils/previsionnel';
import { teinteBloc, GROUPE_PERSONNEL, type BlocCle } from '../../utils/blocs';
import { immoInfos, type LigneResultat } from '../../utils/calc';
import {
  DUREES_COURANTES, dureePrevue, resultatPrevisionnel, sommeMap,
} from '../../utils/prevCalc';
import { apportStock } from '../../utils/stock';
import { StockPrev } from './StockPrev';
import { TotalPrev } from './TotalPrev';
import {
  PageHeader, Card, Btn, StatCard, MoneyInput, BlocColorMenu, TotalBloc, styleBloc, MonthTabs,
  VueTabs, BandeauJeu, ReglagesVue,
} from '../ui';
import { useSelectionCellules } from '../../utils/selection';
import { useEtatVue } from '../../utils/etatVue';
import {
  useBaseMontant, useSousTotaux, useVueSimplifiee, type BaseMontant,
} from '../../utils/reglagesVue';

/**
 * Les onglets du prévisionnel. Chacun ne montre que ce qui le regarde ; le
 * dernier rassemble tout, sans rien laisser modifier.
 */
type VuePrev = 'charges' | 'produits' | 'immos' | 'stock' | 'total';

const VUES: { cle: VuePrev; titre: string; icone: React.ReactNode; aide: string }[] = [
  { cle: 'charges', titre: 'Charges', icone: <Receipt size={14} />,
    aide: 'Charges externes, personnel et rémunérations' },
  { cle: 'produits', titre: 'Produits', icone: <TrendingUp size={14} />,
    aide: 'Workshops et ventes de jeux' },
  { cle: 'immos', titre: 'Immobilisations', icone: <Landmark size={14} />,
    aide: "Ce qui s'inscrit à l'actif et s'amortit" },
  { cle: 'stock', titre: 'Stock', icone: <Boxes size={14} />,
    aide: 'Fabrication, écoulement et marge, jeu par jeu' },
  { cle: 'total', titre: 'Total', icone: <Table2 size={14} />,
    aide: "Tout le prévisionnel de l'exercice, non modifiable" },
];

/** Les blocs montrés par chaque onglet. */
const SECTIONS_DE_VUE: Record<VuePrev, PrevSection[]> = {
  charges: ['charges', 'personnel'],
  produits: ['produits', 'indicateurs'],
  immos: ['immos'],
  stock: [],
  total: [],
};

/**
 * Le sous-total qui sépare le fonctionnement des projets, dans un bloc du
 * prévisionnel. Il découpe le total du bloc : ce qu'il montre y est déjà.
 */
function SousTotalPrev({ label, jeu, lignes, moisList, valeur, somme, reel }: {
  label: string; jeu?: boolean;
  lignes: PrevLigne[]; moisList: string[];
  valeur: (l: PrevLigne, i: number) => number;
  somme: (ls: PrevLigne[]) => number;
  reel: number;
}) {
  const prevu = somme(lignes);
  return (
    <tr className="band-bloc">
      <td className="py-1">
        <span className="inline-flex items-center gap-1.5">
          {jeu && <Gamepad2 size={13} />} {label}
        </span>
      </td>
      {moisList.map((m, i) => {
        const v = r2(lignes.filter(l => !l.unite).reduce((x, l) => x + valeur(l, i), 0));
        return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
      })}
      <td className="text-right tabular-nums col-total">{euros(prevu)}</td>
      <td className="text-right tabular-nums">{reel ? euros0(reel) : '·'}</td>
      <td className="text-right tabular-nums">
        {r2(reel - prevu) ? euros0(r2(reel - prevu)) : '·'}
      </td>
      <td></td>
    </tr>
  );
}

export function PrevisionnelPage() {
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const refs = useStore(s => s.referentiels);
  const couleurs = useStore(s => s.blocCouleurs);
  const previsionnels = useStore(s => s.previsionnels);
  const stocks = useStore(s => s.stocks);
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
  const dupliquerVersExercice = useStore(s => s.dupliquerVersExercice);
  const addPrevLignesParJeu = useStore(s => s.addPrevLignesParJeu);

  const [exercice, setExercice] = useEtatVue('prev.exercice', '2025-26',
    v => (EXERCICES as readonly string[]).includes(v));
  const [simple] = useVueSimplifiee();
  const [sousTotaux] = useSousTotaux();
  /** L'onglet regardé : charges, produits, immobilisations, stock ou total. */
  const [vue, setVue] = useEtatVue<VuePrev>('prev.vue', 'charges',
    v => VUES.some(x => x.cle === v));
  /**
   * Recopier un bloc vers l'exercice suivant, plutôt que de repartir d'une page
   * blanche chaque année. On prévient toujours avant : le bloc d'arrivée est
   * remplacé, et perdre une année de budget sans l'avoir voulu serait la pire
   * des surprises. L'annulation Cmd+Z reste le filet.
   */
  const exerciceSuivant = EXERCICES[EXERCICES.indexOf(exercice as typeof EXERCICES[number]) + 1];
  const dupliquer = () => {
    if (!exerciceSuivant) return;
    const sections = SECTIONS_DE_VUE[vue];
    const nom = VUES.find(v => v.cle === vue)!.titre.toLowerCase();
    const aCopier = (previsionnels[exercice] ?? []).filter(l => sections.includes(l.section));
    if (!aCopier.length) {
      alert(`Il n'y a aucune ligne à copier dans le bloc ${nom} de ${exercice}.`);
      return;
    }
    // Une ligne sans le moindre montant n'est pas une donnée à protéger : on
    // ne compte que celles qui portent quelque chose, sinon l'avertissement
    // crierait au loup à chaque fois et finirait par ne plus être lu.
    const remplies = (l: PrevLigne) => l.valeurs.some(v => v != null && v !== 0);
    const existantes = (previsionnels[exerciceSuivant] ?? [])
      .filter(l => sections.includes(l.section) && remplies(l));
    // Les mois se recalent d'octobre à septembre. Le premier exercice en compte
    // deux de plus (pré-immatriculation et septembre 2025) : ce qu'ils portent
    // n'a pas d'équivalent en face, et il faut le dire avant, pas après.
    const nSource = moisExercice(exercice).length;
    const nCible = moisExercice(exerciceSuivant).length;
    const enTrop = Math.max(0, nSource - Math.min(nCible, 12));
    const montantPerdu = enTrop
      ? r2(aCopier.reduce((x, l) => x
        + l.valeurs.slice(0, enTrop).reduce<number>((y, v) => y + (v ?? 0), 0), 0))
      : 0;
    const noteMois = montantPerdu
      ? `\n\nLes ${enTrop} premier${enTrop > 1 ? 's' : ''} mois de ${exercice} `
        + `(${moisExercice(exercice).slice(0, enTrop).map(labelMois).join(', ')}) n'ont pas `
        + `d'équivalent dans ${exerciceSuivant} : ${euros(montantPerdu)} ne seront pas copiés. `
        + `Le reste se recale d'octobre à septembre.`
      : '';
    const message = existantes.length
      ? `⚠️  ATTENTION — ${exerciceSuivant} contient déjà ${existantes.length} ligne`
        + `${existantes.length > 1 ? 's remplies' : ' remplie'} dans le bloc ${nom}.\n\n`
        + `Copier les ${aCopier.length} ligne${aCopier.length > 1 ? 's' : ''} de ${exercice} `
        + `va les REMPLACER, montants compris.${noteMois}\n\n`
        + `Les autres blocs de ${exerciceSuivant} ne sont pas touchés, et Cmd+Z annule.\n\n`
        + `Remplacer ?`
      : `Copier les ${aCopier.length} ligne${aCopier.length > 1 ? 's' : ''} du bloc ${nom} `
        + `de ${exercice} vers ${exerciceSuivant}, montants compris ?${noteMois}\n\n`
        + `Aucune ligne remplie dans le bloc ${nom} de ${exerciceSuivant} : rien ne sera perdu.`;
    if (!confirm(message)) return;
    dupliquerVersExercice(exercice, exerciceSuivant, sections);
    setExercice(exerciceSuivant);
  };

  /**
   * HT (base du résultat) ou TTC (ce qui sort vraiment du compte).
   *
   * Les onglets de saisie restent **toujours en HT**, quel que soit le réglage
   * des autres pages : on y tape des montants, et taper un prix HT dans une
   * grille affichée en TTC fausserait la donnée elle-même, pas seulement son
   * affichage. Seul l'onglet Total, qui ne se saisit pas, suit la bascule.
   */
  const [baseGlobale] = useBaseMontant();
  const base: BaseMontant = vue === 'total' ? baseGlobale : 'ht';
  /** Ligne dont le calculateur de rémunération est déplié. */
  const [calculOuvert, setCalculOuvert] = useState<string | null>(null);
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

  // Le réel se lit dans la base affichée, comme le prévu : comparer un réel HT
  // à un budget TTC ferait mentir la carte « Budget consommé » de tout le poids
  // de la TVA.
  const reel = useMemo(
    () => reelParCategorie(entries, exercice, refs, undefined, base),
    [entries, exercice, refs, base]);
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
  const immos = useMemo(() => immoInfos(entries, refs), [entries, refs]);

  /**
   * Un poste de jeu se budgète jeu par jeu : l'ajouter crée une ligne pour
   * chacun, comme le fait la grille. Sinon, une seule ligne.
   */
  const estCategorieJeu = (cat: string) => refs.categoriesJeux.includes(cat.trim());
  function ajouterLigne() {
    const cat = nouvelleCat.trim();
    if (!cat) return;
    if (estCategorieJeu(cat)) addPrevLignesParJeu(exercice, cat);
    else addPrevLigne(exercice, cat);
    setNouvelleCat('');
  }

  const toutesCategories = [
    ...refs.categoriesProduits, ...refs.categoriesDepenses, ...refs.categoriesJeux,
  ];

  // Chaque colonne de mois occupe 60,5 % / n : on fixe une largeur mini pour que
  // « 12 345,67 € » tienne dans la case, comme dans la synthèse (74 px par mois).
  const largeurMini = Math.max(1050, Math.round(74 * moisList.length / 0.605));

  const totalLigne = (l: PrevLigne) => totalDeLigne(l, lignes);
  // Pour additionner : l'exact, arrondi une seule fois à la fin. Arrondir chaque
  // ligne d'abord ferait dériver le total de quelques centimes, et l'onglet
  // Total, qui somme dans un autre ordre, n'afficherait plus le même chiffre.
  const sommeLignes = (ls: PrevLigne[]) =>
    r2(ls.filter(l => !l.unite).reduce((s, l) => s + sommeDeLigne(l, lignes) * coef(l), 0));
  /**
   * Le bloc d'une ligne suit la NATURE de sa catégorie, réglée dans l'onglet
   * Catégories : passer un poste « à l'actif » déplace aussitôt ses lignes de
   * prévisionnel vers les immobilisations, sans avoir à les refaire.
   */
  const sectionDe = (l: PrevLigne) => toutesCategories.includes(l.categorie)
    ? sectionDeCategorie(l.categorie, refs)
    : l.section;
  const lignesDe = (sec: PrevSection) => lignes.filter(l => sectionDe(l) === sec);
  const totalSection = (sec: PrevSection) => sommeLignes(lignesDe(sec));
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

  // ----- Compte de résultat prévisionnel, stock compris --------------------
  const stock = useMemo(
    () => apportStock(stocks, exercice, jeuxCatalogue), [stocks, exercice, jeuxCatalogue]);
  const resultat: LigneResultat[] = useMemo(
    () => resultatPrevisionnel({ lignes, moisList, immos, finances, stock, refs }),
    [lignes, moisList, immos, finances, stock, refs]);

  /** Les onglets Stock et Total ne se saisissent pas au clavier des catégories. */
  const saisie = vue !== 'stock' && vue !== 'total';
  const sousTitre: Record<VuePrev, string> = {
    charges: 'Charges externes, personnel et rémunérations — mêmes catégories que la synthèse',
    produits: 'Ce qui rentre : workshops et ventes de jeux',
    immos: "Ce qui s'inscrit à l'actif et s'amortit au lieu de peser d'un coup",
    stock: 'Fabrication, écoulement et marge, jeu par jeu',
    total: "Tout le prévisionnel de l'exercice, non modifiable",
  };

  return (
    <div className="p-4 w-full">
      <PageHeader
        title={`Prévisionnel — ${VUES.find(v => v.cle === vue)!.titre}`}
        subtitle={sousTitre[vue]}
        actions={
          <>
            {saisie && <>
            <div className="flex gap-1">
              <input
                className="border rounded px-2 py-1.5 text-sm w-52 bg-white"
                style={{ borderColor: 'var(--bbg-border)' }}
                placeholder="Ajouter une ligne…"
                list="categories-dispo"
                title={estCategorieJeu(nouvelleCat)
                  ? `Poste de jeu : une ligne sera créée pour chacun de tes ${jeuxCatalogue.length} jeux`
                  : undefined}
                value={nouvelleCat}
                onChange={ev => setNouvelleCat(ev.target.value)}
                onKeyDown={ev => { if (ev.key === 'Enter') ajouterLigne(); }}
              />
              <datalist id="categories-dispo">
                {toutesCategories.map(c => <option key={c} value={c} />)}
              </datalist>
              <Btn variant="primary" onClick={ajouterLigne}
                title={estCategorieJeu(nouvelleCat)
                  ? `Créer la ligne sur chacun de tes ${jeuxCatalogue.length} jeux`
                  : 'Créer la ligne'}>
                {estCategorieJeu(nouvelleCat)
                  ? <span className="inline-flex items-center gap-1"><Gamepad2 size={14} /> × {jeuxCatalogue.length}</span>
                  : <Plus size={14} />}
              </Btn>
            </div>
            <Btn onClick={() => completerPrevisionnel(exercice)}
              title="Ajouter les lignes de la synthèse qui manquent encore, cellules vides">
              <span className="inline-flex items-center gap-1.5"><ListPlus size={14} /> Compléter la grille</span>
            </Btn>
            {exerciceSuivant && (
              <Btn onClick={dupliquer}
                title={`Recopier les lignes et les montants de ce bloc vers ${exerciceSuivant}, pour ne pas repartir d'une page blanche`}>
                <span className="inline-flex items-center gap-1.5">
                  <CopyPlus size={14} /> Dupliquer vers {exerciceSuivant}
                </span>
              </Btn>
            )}
            </>}
            {/* Chaque onglet n'affiche que les bascules qui font quelque chose
                chez lui — un bouton sans effet est pire que pas de bouton.
                HT/TTC n'apparaît que dans le Total : les onglets de saisie se
                tiennent en HT et rien ne doit pouvoir les en sortir, sous peine
                de saisir un montant dans une base et de le stocker dans
                l'autre. Le Stock est en HT pour la même raison. Le Total, lui,
                n'a pas de ligne de sous-total à masquer : ses bandeaux de jeu
                portent toujours leur chiffre. */}
            <ReglagesVue
              avecBase={vue === 'total'}
              avecDetail={vue !== 'stock'}
              avecSousTotaux={vue !== 'total'} />
          </>
        }
        tabs={
          <div className="space-y-2">
            <VueTabs vue={vue} vues={VUES} onChange={setVue} />
            <MonthTabs
        mois={exercice}
        moisList={[...EXERCICES]}
        labelOf={ex => ex}
        badgeOf={ex => (previsionnels[ex] ?? []).reduce(
          (n, l) => n + l.valeurs.filter(v => v != null).length, 0)}
        onChange={setExercice}
            />
          </div>
        }
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

      {vue !== 'stock' && (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="Produits prévus" value={euros0(r2(totalProduits + sommeMap(stock.caParMois)))}
          tone="good"
          sub={sommeMap(stock.caParMois)
            ? `dont ${euros0(sommeMap(stock.caParMois))} de ventes de jeux`
            : `réel ${euros0(reelProduits)}`} />
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
      )}

      {/* Alarmes de cohérence — elles portent sur les lignes de catégories,
          pas sur le stock ni sur la vue d'ensemble. */}
      {saisie && alarmes.length > 0 && (
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

      {vue === 'produits' && stock.caParJeuCanalEtMois.size > 0 && (
        <Card className="mb-5" title="Ventes de jeux — calculées dans l'onglet Stock"
          actions={
            <TotalBloc label="Total ventes de jeux"
              valeur={euros(sommeMap(stock.caParMois))} t={teinteBloc('produits', couleurs)} />
          }>
          <div className="overflow-x-auto -mx-4 px-4" style={styleBloc(teinteBloc('produits', couleurs))}>
            <table data-table="prev:ventesjeux" data-bloc="produits" className="sheet text-sm border-collapse w-full">
              <thead>
                <tr className="text-left" style={{ color: '#5c5280' }}>
                  <th className="min-w-52">Canal de vente</th>
                  {moisList.map(m => <th key={m} className="text-right">{labelMois(m)}</th>)}
                  <th className="text-right bg-[var(--bloc-total)]">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...stock.caParJeuCanalEtMois.entries()].map(([jeu, canaux]) => {
                  const totalJeu = r2([...(stock.caParJeuEtMois.get(jeu)?.values() ?? [])]
                    .reduce((x, v) => x + v, 0));
                  return (
                    <Fragment key={jeu}>
                      <BandeauJeu jeu={jeu} couleur={couleurJeu(jeu, refs)}
                        colSpan={moisList.length + 2} droite={euros(totalJeu)} />
                      {[...canaux.entries()].map(([canal, parMois]) => (
                        <tr key={`${jeu}-${canal}`}>
                          <td style={{ paddingLeft: 22 }}>{canal}</td>
                          {moisList.map(m => {
                            const v = parMois.get(m) ?? 0;
                            return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                          })}
                          <td className="text-right tabular-nums bg-[var(--bloc-total)] font-medium">
                            {euros(r2([...parMois.values()].reduce((x, v) => x + v, 0)))}
                          </td>
                        </tr>
                      ))}
                      {sousTotaux && canaux.size > 1 && (
                        <tr className="band-bloc">
                          <td>Total {jeu}</td>
                          {moisList.map(m => {
                            const v = stock.caParJeuEtMois.get(jeu)?.get(m) ?? 0;
                            return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                          })}
                          <td className="text-right tabular-nums bg-[var(--bloc-total)]">{euros(totalJeu)}</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="total-bloc">
                  <td>TOTAL VENTES DE JEUX (HT)</td>
                  {moisList.map(m => {
                    const v = stock.caParMois.get(m) ?? 0;
                    return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                  })}
                  <td className="text-right tabular-nums grand">{euros(sommeMap(stock.caParMois))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
            Ces montants ne se saisissent pas ici : ils sont le produit des exemplaires vendus par
            le prix de <b>leur canal</b> — distributeur, boutique, éditeur — dans l'onglet
            <b>Stock</b>. Ils entrent dans le résultat et dans la trésorerie prévisionnelle comme
            n'importe quel produit.
          </p>
        </Card>
      )}

      {vue === 'stock' && <StockPrev exercice={exercice} moisList={moisList} />}
      {vue === 'total' && <TotalPrev exercice={exercice} moisList={moisList} />}

      <div className="space-y-5">
        {SECTIONS.filter(sec => SECTIONS_DE_VUE[vue].includes(sec.cle)).map(sec => {
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
          const cle = (l: PrevLigne) =>
            jeuDeLigne(l, jeuxCatalogue) || (meta[l.categorie]?.groupe ?? '');
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
          // Le premier jeu marque la frontière : au-dessus le fonctionnement,
          // en dessous les projets.
          const groupesJeux = ordre.filter(estJeu);
          const premierJeu = groupesJeux[0];
          const lignesJeux = groupesJeux.flatMap(g => parGroupe.get(g) ?? []);
          const lignesHorsJeux = ordre.filter(g => !estJeu(g))
            .flatMap(g => parGroupe.get(g) ?? []);
          const reelDeLignes = (ls: PrevLigne[]) =>
            r2(ls.reduce((x, l) => x + (reelSec.get(l.categorie) ?? 0), 0));
          const reelDesJeux = reelDeLignes(lignesJeux);
          const reelDuFonctionnement = reelDeLignes(lignesHorsJeux);
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
                  {sec.cle === 'personnel' && (
                    <Btn
                      title="Combien coûte une rémunération de dirigeant TNS ?"
                      onClick={() => {
                        const cible = lignesSec[0];
                        if (cible) { setCalculOuvert(cible.id); return; }
                        // Pas encore de ligne : on en crée une, le calcul suivra.
                        addPrevLigne(exercice,
                          refs.categoriesDepenses.find(c => /urssaf/i.test(c)) ?? 'URSSAF',
                          'personnel');
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Calculator size={14} /> Calculer une rémunération
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
                          {/* Les jeux se lisent à part du fonctionnement : deux
                              sous-totaux les encadrent. Ils découpent le total
                              du bloc, ils ne s'y ajoutent pas. */}
                          {g === premierJeu && (
                            <SousTotalPrev label="Sous-total fonctionnement BBG"
                              lignes={lignesHorsJeux} moisList={moisList}
                              valeur={(l, i) => (valeursDe(l, lignes)[i] ?? 0) * coef(l)}
                              somme={sommeLignes} reel={reelDuFonctionnement} />
                          )}
                          {avecGroupes && (
                            <tr className={estJeu(g) ? 'band-jeu' : 'band-bloc'}
                              style={estJeu(g) ? {
                                backgroundColor: couleurJeu(g, refs),
                                color: encreSur(couleurJeu(g, refs)),
                                fontWeight: 700,
                              } : undefined}
                              {...(g ? reorg.ligne(estJeu(g) ? 'jeu' : 'groupe', g) : {})}>
                              {/* Sans ligne de sous-total, c'est le bandeau du groupe
                                  ou du jeu qui porte les chiffres : autrement il ne
                                  resterait qu'un intertitre sans montant. */}
                              <td colSpan={sousTotaux ? moisList.length + 5 : 1} className="py-1">
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
                              {!sousTotaux && (
                                <>
                                  {moisList.map((m, i) => {
                                    const v = r2(parGroupe.get(g)!.filter(l => !l.unite)
                                      .reduce((acc, l) => acc + (valeursDe(l, lignes)[i] ?? 0) * coef(l), 0));
                                    return (
                                      <td key={m} className="text-right tabular-nums">
                                        {v ? euros0(v) : '·'}
                                      </td>
                                    );
                                  })}
                                  <td className="text-right tabular-nums col-total">
                                    {euros(sommeLignes(parGroupe.get(g)!))}
                                  </td>
                                  <td className="text-right tabular-nums">
                                    {euros0(r2(parGroupe.get(g)!
                                      .reduce((acc, l) => acc + (reelSec.get(l.categorie) ?? 0), 0)))}
                                  </td>
                                  <td className="col-total"></td>
                                  <td></td>
                                </>
                              )}
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
                                    {/* Poste de jeu : à quel jeu cette ligne
                                        se rattache. C'est ce choix qui la range
                                        sous le bon bandeau. */}
                                    {estCategorieJeu(l.categorie) && estMontant && (
                                      <select
                                        className="text-[10px] px-0.5"
                                        style={{
                                          flex: '0 0 auto', width: 86,
                                          backgroundColor: l.jeu ? couleurJeu(l.jeu, refs) : '#fde3e1',
                                          color: l.jeu ? encreSur(couleurJeu(l.jeu, refs)) : '#b7332e',
                                        }}
                                        value={l.jeu ?? ''}
                                        title={l.jeu
                                          ? `Poste rattaché à ${l.jeu}`
                                          : 'Poste de jeu non rattaché : choisis le jeu concerné'}
                                        onChange={ev => updatePrevLigne(exercice, l.id, {
                                          jeu: ev.target.value || undefined,
                                        })}
                                      >
                                        <option value="">— quel jeu ?</option>
                                        {jeuxCatalogue.map(j => <option key={j} value={j}>{j}</option>)}
                                      </select>
                                    )}
                                    {/* Une immobilisation ne s'amortit pas
                                        toujours sur cinq ans : la durée se
                                        choisit ligne par ligne, et c'est elle
                                        qui commande la dotation. */}
                                    {sec.cle === 'immos' && estMontant && (
                                      <select
                                        className="text-[10px] px-0.5 rounded shrink-0"
                                        style={{ width: 62, backgroundColor: '#eef4fb', color: 'var(--bbg-blue-dark)' }}
                                        value={String(dureePrevue(l, refs))}
                                        title={`Amortie sur ${dureePrevue(l, refs)} ans — c'est cette durée qui étale la dotation`}
                                        onChange={ev => {
                                          const v = ev.target.value;
                                          if (v === 'autre') {
                                            const saisi = prompt('Durée d\'amortissement, en années ?',
                                              String(dureePrevue(l, refs)));
                                            const n = Number(saisi);
                                            if (n > 0) updatePrevLigne(exercice, l.id, { dureeAns: n });
                                            return;
                                          }
                                          updatePrevLigne(exercice, l.id, { dureeAns: Number(v) });
                                        }}
                                      >
                                        {[...new Set([...DUREES_COURANTES, dureePrevue(l, refs)])]
                                          .sort((a, b) => a - b)
                                          .map(n => <option key={n} value={n}>{n} ans</option>)}
                                        <option value="autre">autre…</option>
                                      </select>
                                    )}
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
                                  {l.formule?.type === 'heures-taux' && (
                                    <TauxHoraire
                                      formule={l.formule}
                                      onChange={f => setPrevFormule(exercice, l.id, f)}
                                    />
                                  )}
                                  {l.formule?.type === 'pourcentage-bloc' && (
                                    <TauxPourcentage
                                      formule={l.formule}
                                      onChange={f => setPrevFormule(exercice, l.id, f)}
                                      onRetirer={() => setPrevFormule(exercice, l.id, undefined)}
                                    />
                                  )}
                                </td>
                                {moisList.map((m, i) => (
                                  l.formule ? (
                                    <td key={m} className="text-right tabular-nums"
                                      title={l.formule.type === 'pourcentage-bloc'
                                        ? `Calculé : ${String(l.formule.taux).replace('.', ',')} % de tout ce qui précède dans ce bloc`
                                        : `Calculé : ${l.formule.tauxHT.toFixed(2).replace('.', ',')} € × les heures de ${
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
                                    {estMontant && sec.cle === 'personnel' && (
                                      <button
                                        title="Calculer une rémunération de dirigeant TNS"
                                        style={{ color: calculOuvert === l.id
                                          ? 'var(--bbg-purple-dark)' : '#9a92b5' }}
                                        onClick={() => setCalculOuvert(v => v === l.id ? null : l.id)}
                                      >
                                        <Calculator size={13} />
                                      </button>
                                    )}
                                    {estMontant && (
                                      <button
                                        title={l.formule?.type === 'pourcentage-bloc'
                                          ? 'Repasser en saisie libre'
                                          : 'Calculer cette ligne en % de tout ce qui la précède dans le bloc'}
                                        style={{ color: l.formule?.type === 'pourcentage-bloc'
                                          ? 'var(--bbg-purple-dark)' : '#9a92b5' }}
                                        onClick={() => setPrevFormule(exercice, l.id,
                                          l.formule?.type === 'pourcentage-bloc'
                                            ? undefined
                                            : { type: 'pourcentage-bloc', taux: 10 })}
                                      >
                                        <Percent size={13} />
                                      </button>
                                    )}
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
                          {parGroupe.get(g)!.some(l => l.id === calculOuvert) && (
                            <tr key={`calc-${g}`}>
                              <td colSpan={moisList.length + 5} className="p-0!">
                                <CalculTNS
                                  onFermer={() => setCalculOuvert(null)}
                                  onAppliquer={(mensuel) => {
                                    etalerPrevLigne(exercice, calculOuvert!, mensuel);
                                    setCalculOuvert(null);
                                  }}
                                />
                              </td>
                            </tr>
                          )}
                          {avecGroupes && sousTotaux && (simple || parGroupe.get(g)!.length > 1) && (
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
                                {euros(sommeLignes(parGroupe.get(g)!))}
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
                      {!!premierJeu && (
                        <SousTotalPrev label="Sous-total jeux" jeu
                          lignes={lignesJeux} moisList={moisList}
                          valeur={(l, i) => (valeursDe(l, lignes)[i] ?? 0) * coef(l)}
                          somme={sommeLignes} reel={reelDesJeux} />
                      )}
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

      </div>

      <p className="text-xs mt-4" style={{ color: '#9a92b5' }}>
        Les lignes reprennent les catégories, les groupes et l'ordre de la synthèse annuelle :
        renommer ou regrouper une catégorie dans l'onglet Catégories se répercute des deux côtés.
        Les lignes en italique sont des dépenses réelles sans prévision — la baguette les ajoute.
      </p>
    </div>
  );
}


// ------------------------------------------------- Taux d'une ligne calculée ---

/**
 * Combien coûte une rémunération de dirigeant.
 *
 * Un gérant TNS n'est pas salarié : il n'y a pas de « brut » ni de charges
 * patronales. Il touche une rémunération, et l'entreprise paie par-dessus les
 * cotisations des indépendants. On saisit donc ce qu'on veut toucher, et on lit
 * ce qu'il faut budgéter.
 */
function CalculTNS({ onAppliquer, onFermer }: {
  onAppliquer: (mensuel: number) => void;
  onFermer: () => void;
}) {
  const [net, setNet] = useState(2000);
  const c = cotisationsTNS(net * 12);
  const parMois = (v: number) => euros(r2(v / 12));

  return (
    <div className="px-3 py-2.5 border-y" style={{
      backgroundColor: 'var(--bbg-lavender)', borderColor: 'var(--bbg-border-soft)',
    }}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-xs" style={{ color: '#3f3268' }}>
        <div>
          <div className="font-semibold mb-1">Je veux toucher, par mois</div>
          <div className="flex items-center gap-1">
            <input
              type="number" min={0} step={100}
              className="w-24 px-1.5 py-1 border rounded text-right tabular-nums bg-white"
              style={{ borderColor: 'var(--bbg-purple)' }}
              value={net}
              onChange={ev => setNet(Math.max(0, Number(ev.target.value) || 0))}
            />
            <span>€ nets</span>
          </div>
          <div className="mt-1" style={{ color: '#6f6690' }}>
            soit {euros(r2(net * 12))} sur l'année
          </div>
        </div>

        <div>
          <div className="font-semibold mb-1">Cotisations TNS</div>
          <table className="text-[11px]" style={{ color: '#5c5280' }}>
            <tbody>
              {c.postes.filter(p => p.montant).map(p => (
                <tr key={p.label}>
                  <td className="pr-3">{p.label}</td>
                  <td className="text-right tabular-nums">{parMois(p.montant)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td className="pr-3">Total</td>
                <td className="text-right tabular-nums">{parMois(c.cotisations)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="min-w-52">
          <div className="font-semibold mb-1">À budgéter</div>
          <div className="text-lg font-extrabold tabular-nums" style={{ color: 'var(--bbg-purple-darker)' }}>
            {parMois(c.cout)} <span className="text-xs font-semibold opacity-70">par mois</span>
          </div>
          <div style={{ color: '#6f6690' }}>
            {euros(c.cout)} sur l'année · cotisations = {(c.taux * 100).toFixed(1).replace('.', ',')} %
            de la rémunération
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Btn variant="primary" onClick={() => onAppliquer(r2(c.cout / 12))}>
              Coût total sur tous les mois
            </Btn>
            <Btn onClick={() => onAppliquer(r2(c.cotisations / 12))}>Cotisations seules</Btn>
            <Btn onClick={() => onAppliquer(net)}>Rémunération seule</Btn>
            <Btn variant="ghost" onClick={onFermer}>Fermer</Btn>
          </div>
        </div>
      </div>
      <p className="text-[11px] mt-2" style={{ color: '#8d85a6' }}>
        Barème {BAREME_TNS.pass.toLocaleString('fr-FR')} € de PASS, régime des indépendants.
        Ordre de grandeur à budgéter — les deux premières années, l'URSSAF appelle des
        cotisations forfaitaires puis régularise, et l'ACRE peut réduire la note.
      </p>
    </div>
  );
}

/**
 * Le pourcentage d'une ligne « imprévus » : il s'applique à tout ce qui la
 * précède dans le bloc. Déplacer la ligne change donc son assiette — elle est
 * faite pour rester en bas.
 */
function TauxPourcentage({ formule, onChange, onRetirer }: {
  formule: FormulePourcentage;
  onChange: (f: FormulePrev) => void;
  onRetirer: () => void;
}) {
  return (
    <div className="mt-1 rounded border px-1.5 py-1 text-[11px] inline-flex items-center gap-1"
      style={{ borderColor: 'var(--bbg-border-soft)', backgroundColor: '#fbfaff', color: '#6f6690' }}>
      <input
        className="w-12 px-1 py-0.5 border rounded text-right text-[11px] tabular-nums bg-white"
        style={{ borderColor: 'var(--bbg-border-soft)' }}
        defaultValue={String(formule.taux).replace('.', ',')}
        title="Pourcentage appliqué à tout ce qui précède dans le bloc"
        onBlur={ev => {
          const v = parseMontant(ev.target.value);
          if (v != null && v !== formule.taux) onChange({ ...formule, taux: v });
        }}
        onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
      />
      <span>% de tout ce qui précède</span>
      <button
        className="underline opacity-60 hover:opacity-100"
        title="Repasser en saisie manuelle"
        onClick={onRetirer}
      >
        libre
      </button>
    </div>
  );
}

/**
 * Le taux horaire, en tête de la ligne calculée : saisissable en HT comme en
 * TTC (l'un se déduit de l'autre), avec le décalage de paiement.
 */
function TauxHoraire({ formule, onChange }: {
  formule: FormuleHeuresTaux; onChange: (f: FormulePrev) => void;
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
