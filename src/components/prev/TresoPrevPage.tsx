/**
 * Trésorerie par exercice.
 *
 * Le prévisionnel n'est plus recopié à la main : il est calculé depuis les
 * onglets du prévisionnel — produits, charges, personnel, immobilisations et
 * stock — convertis en TTC, puisque c'est bien du TTC qui entre et sort du
 * compte. Le réalisé, lui, est calculé depuis le journal et les mouvements
 * financiers. Les deux se lisent l'un sous l'autre, avec le même découpage.
 */
import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import type { FinanceEntry } from '../../types';
import { EXERCICES, labelMois, moisExercice, todayISO } from '../../utils/dates';
import { FINANCE_TYPES } from '../../utils/finance';
import { euros, euros0, r2 } from '../../utils/money';
import { useEtatVue } from '../../utils/etatVue';
import { ordreAffichage } from '../../utils/previsionnel';
import { fluxTresorerie, moisEcoules, sommeMap } from '../../utils/prevCalc';
import { PageHeader, Card, Btn, MoneyInput, StatCard } from '../ui';

const AUCUNE_LIGNE: never[] = [];

export function TresoPrevPage() {
  const tresoPrev = useStore(s => s.tresoPrev);
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const mouvementsPrev = useStore(s => s.mouvementsPrev);
  /** L'exercice détaillé mois par mois, retrouvé au retour sur la page. */
  const [exerciceDetail, setExerciceDetail] = useEtatVue<string>(
    'tresoprev.detail', EXERCICES[0], v => (EXERCICES as readonly string[]).includes(v));
  const addMouvementPrev = useStore(s => s.addMouvementPrev);
  const updateMouvementPrev = useStore(s => s.updateMouvementPrev);
  const removeMouvementPrev = useStore(s => s.removeMouvementPrev);
  const previsionnels = useStore(s => s.previsionnels);
  const stocks = useStore(s => s.stocks);
  const refs = useStore(s => s.referentiels);
  const restoreAll = useStore(s => s.restoreAll);

  // ----- Prévisionnel calculé ---------------------------------------------
  const prevu = useMemo(() => EXERCICES.map(ex => {
    const moisList = moisExercice(ex);
    const lignes = ordreAffichage(previsionnels[ex] ?? AUCUNE_LIGNE, refs);
    // Sur l'exercice en cours, les mois déjà passés viennent du journal : le
    // budget n'a plus rien à dire sur ce qui est déjà encaissé et payé.
    const reels = moisEcoules(moisList);
    const f = fluxTresorerie(lignes, moisList, stocks, ex, refs, entries, reels);
    const moisDe = (d: string) => (d < '2025-09-01' ? 'pre-immat' : d.slice(0, 7));
    // Les mouvements enregistrés valent toujours ; ceux qui ne sont que prévus
    // ne comptent que sur les mois pas encore écoulés — sur un mois passé, le
    // relevé de banque a déjà tranché.
    const mouvements = [
      ...finances.filter(x => moisList.includes(moisDe(x.date))),
      ...(mouvementsPrev ?? []).filter(x => {
        const m = moisDe(x.date);
        return moisList.includes(m) && !reels.includes(m);
      }),
    ];
    const part = (t: string) => r2(mouvements.filter(x => x.type === t)
      .reduce((s, x) => s + x.montant, 0));
    const capital = part('capital');
    const cca = part('cca');
    const remboursementCCA = part('remboursement_cca');
    const placements = part('placement');
    const produitsFinanciers = part('produit_financier');
    const autres = part('autre');
    const entrees = r2(sommeMap(f.encaissements) + produitsFinanciers);
    // Un placement n'est pas une dépense : l'argent change de compte, il ne
    // disparaît pas. On arrête donc les sorties d'exploitation avant lui, puis
    // on l'ajoute pour retomber sur ce qui a vraiment quitté le compte courant.
    const sortiesExploitation = sommeMap(f.decaissements);
    const sorties = r2(sortiesExploitation - placements - autres);
    return {
      ex,
      // Gardés pour la vue mensuelle : c'est le même calcul, pas un second.
      moisList, flux: f, mouvements,
      nReels: reels.length,
      nMois: moisList.length,
      ventesJeux: sommeMap(f.ventesJeux),
      autresProduits: sommeMap(f.autresProduits),
      produitsFinanciers,
      entrees,
      charges: r2(-sommeMap(f.charges)),
      personnel: r2(-sommeMap(f.personnel)),
      immos: r2(-sommeMap(f.immos)),
      tirages: r2(-sommeMap(f.tirages)),
      droits: r2(-sommeMap(f.droits)),
      depensesJeux: r2(-sommeMap(f.depensesJeux)),
      sortiesExploitation: r2(-sortiesExploitation),
      placements, autres,
      sorties: r2(-sorties),
      exploitation: r2(entrees - sorties),
      capital, cca, remboursementCCA,
      apports: r2(capital + cca + remboursementCCA),
    };
  }), [previsionnels, stocks, refs, finances, mouvementsPrev, entries]);

  const prevuCumule = useMemo(() => {
    let t = 0;
    return prevu.map(x => { t = r2(t + x.exploitation + x.apports); return { ...x, treso: t }; });
  }, [prevu]);

  // ----- Réalisé ------------------------------------------------------------
  const realise = useMemo(() => {
    const perEx = EXERCICES.map(ex => {
      const moisSet = new Set(moisExercice(ex));
      const du = entries.filter(e => moisSet.has(e.mois));
      const fin = finances.filter(f => {
        const m = f.date < '2025-09-01' ? 'pre-immat' : f.date.slice(0, 7);
        return moisSet.has(m);
      });
      const ca = r2(du.filter(e => e.type === 'produit').reduce((s, e) => s + e.ttc, 0));
      const pf = r2(fin.filter(f => f.type === 'produit_financier').reduce((s, f) => s + f.montant, 0));
      const invest = r2(-du.filter(e => e.type === 'immo').reduce((s, e) => s + e.ttc, 0));
      const charges = r2(-du.filter(e => e.type === 'charges').reduce((s, e) => s + e.ttc, 0));
      const placements = r2(fin.filter(f => f.type === 'placement').reduce((s, f) => s + f.montant, 0));
      const capital = r2(fin.filter(f => f.type === 'capital').reduce((s, f) => s + f.montant, 0));
      const cca = r2(fin.filter(f => f.type === 'cca').reduce((s, f) => s + f.montant, 0));
      // Rembourser un compte courant d'associé sort de la trésorerie sans être
      // une charge : c'est une dette qu'on éteint, pas une dépense.
      const remboursementCCA = r2(fin.filter(f => f.type === 'remboursement_cca')
        .reduce((s, f) => s + f.montant, 0));
      const autres = r2(fin.filter(f => f.type === 'autre').reduce((s, f) => s + f.montant, 0));
      const entreesTotales = r2(ca + pf);
      const depensesTotales = r2(invest + charges + placements + autres);
      const cumule = r2(entreesTotales + depensesTotales);
      const apports = r2(capital + cca + remboursementCCA);
      return {
        ex, ca, pf, entreesTotales, invest, charges, placements, depensesTotales, cumule,
        capital, cca, remboursementCCA, apports,
      };
    });
    let treso = 0;
    return perEx.map(x => {
      treso = r2(treso + x.cumule + x.apports);
      return { ...x, treso };
    });
  }, [entries, finances]);

  // Sur l'exercice en cours, les deux tableaux ne peuvent pas tomber sur le même
  // chiffre : celui du haut ajoute le budget des mois qui restent, celui du bas
  // s'arrête à ce qui est écrit au journal. On affiche l'écart au lieu de
  // laisser chercher — c'est la question qu'on se pose en regardant les deux.
  const rapprochement = useMemo(() => {
    const i = prevuCumule.findIndex(x => x.nReels > 0 && x.nReels < x.nMois);
    if (i < 0) return null;
    const p = prevuCumule[i];
    const r = realise[i];
    if (!r) return null;
    return {
      ex: p.ex,
      restants: p.nMois - p.nReels,
      journal: r.treso,
      budget: r2(p.treso - r.treso),
      prevue: p.treso,
    };
  }, [prevuCumule, realise]);

  /**
   * Le détail mois par mois de l'exercice choisi.
   *
   * La vue par exercice dit combien l'année coûte ; elle ne dit pas *quand*. Un
   * tirage de 32 400 € et un trimestre d'URSSAF tombant le même mois, c'est un
   * découvert qu'on ne voit pas dans un total annuel — d'où cette vue.
   */
  const detail = useMemo(() => {
    const i = Math.max(0, EXERCICES.indexOf(exerciceDetail as typeof EXERCICES[number]));
    const x = prevuCumule[i];
    if (!x) return null;
    const ouverture = i > 0 ? prevuCumule[i - 1].treso : 0;
    const moisDe = (d: string) => (d < '2025-09-01' ? 'pre-immat' : d.slice(0, 7));
    const parType = (t: string) => new Map(x.moisList.map(m =>
      [m, r2(x.mouvements.filter(f => f.type === t && moisDe(f.date) === m)
        .reduce((s, f) => s + f.montant, 0))]));
    const capital = parType('capital');
    const cca = parType('cca');
    const remboursementCCA = parType('remboursement_cca');
    const placements = parType('placement');
    const produitsFinanciers = parType('produit_financier');
    const autres = parType('autre');
    const g = (m: Map<string, number>, mois: string) => m.get(mois) ?? 0;
    let cumule = ouverture;
    const lignes = x.moisList.map(m => {
      // Les placements et « autres » sont des mouvements signés : ils entrent
      // dans les sorties tels quels, sans changement de signe.
      const entrees = r2(g(x.flux.encaissements, m) + g(produitsFinanciers, m));
      const sortiesExploitation = r2(-g(x.flux.decaissements, m));
      const sorties = r2(sortiesExploitation + g(placements, m) + g(autres, m));
      const apports = r2(g(capital, m) + g(cca, m) + g(remboursementCCA, m));
      const solde = r2(entrees + sorties + apports);
      cumule = r2(cumule + solde);
      return {
        mois: m,
        autresProduits: g(x.flux.autresProduits, m),
        ventesJeux: g(x.flux.ventesJeux, m),
        produitsFinanciers: g(produitsFinanciers, m),
        entrees,
        charges: r2(-g(x.flux.charges, m)),
        personnel: r2(-g(x.flux.personnel, m)),
        immos: r2(-g(x.flux.immos, m)),
        tirages: r2(-g(x.flux.tirages, m)),
        droits: r2(-g(x.flux.droits, m)),
        depensesJeux: r2(-g(x.flux.depensesJeux, m)),
        sortiesExploitation,
        placements: g(placements, m),
        sorties,
        capital: g(capital, m),
        cca: g(cca, m),
        remboursementCCA: g(remboursementCCA, m),
        solde,
        cumule,
      };
    });
    // L'échelle des barres se prend sur les sorties **d'exploitation**, pas sur
    // le total : un placement de 80 000 € écraserait tous les autres mois alors
    // qu'il ne coûte rien — l'argent change de compte, il ne part pas.
    const pire = Math.max(1, ...lignes.map(l => Math.abs(l.sortiesExploitation)));
    return { ex: x.ex, ouverture, lignes, pire, nReels: x.nReels };
  }, [prevuCumule, exerciceDetail]);

  const finPrevue = prevuCumule[prevuCumule.length - 1]?.treso ?? 0;
  const totalVentesJeux = r2(prevuCumule.reduce((s, x) => s + x.ventesJeux, 0));

  function setPrevCell(lineIdx: number, exIdx: number, v: number | null) {
    const next = tresoPrev.map((l, i) => i === lineIdx
      ? { ...l, valeurs: l.valeurs.map((x, j) => j === exIdx ? v : x) }
      : l);
    restoreAll({ tresoPrev: next });
  }

  return (
    <div className="p-4 w-full max-w-[1400px]">
      <PageHeader
        title="Trésorerie prévisionnelle vs réalisée"
        subtitle="Vue TTC par exercice — le prévu vient des onglets du prévisionnel, le réalisé du journal"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Trésorerie fin 2029-30" value={euros(finPrevue)}
          tone={finPrevue >= 0 ? 'good' : 'bad'} sub="après apports et remboursements" />
        <StatCard label="Ventes de jeux prévues (TTC)" value={euros(totalVentesJeux)}
          tone="good" sub="calculées dans Prévisionnel → Stock" />
        <StatCard label="Trésorerie réalisée à ce jour"
          value={euros(realise.find(x => x.ca || x.charges)?.treso ?? 0)} tone="neutral"
          sub="cumul des exercices déjà mouvementés" />
        <StatCard label="Sorties d'exploitation sur 5 ans"
          value={euros(r2(prevuCumule.reduce((s, x) => s + x.sortiesExploitation, 0)))} tone="accent"
          sub="charges, personnel, investissements et jeux — hors placements" />
      </div>

      <Card title="Trésorerie de l'exercice (TTC) — réel jusqu'au mois en cours, budget ensuite" className="mb-6">
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="tresoprev:previsionnel" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th className="min-w-64">Catégories (TTC)</th>
                {prevuCumule.map(x => (
                  <th key={x.ex} className="text-right">
                    {x.ex}
                    <div className="text-[10px] font-normal opacity-80">
                      {x.nReels === 0 ? 'prévu'
                        : x.nReels >= x.nMois ? 'réalisé'
                          : `${x.nReels}/${x.nMois} mois réels`}
                    </div>
                  </th>
                ))}
                <th className="text-right bg-[#efeafa]">Total</th>
              </tr>
            </thead>
            <tbody>
              <RowP label="Workshops et autres produits" aide="Bloc Produits du prévisionnel, converti en TTC"
                get={x => x.autresProduits} lignes={prevuCumule} />
              <RowP label="Ventes de jeux" aide="Exemplaires vendus × prix de vente, onglet Stock"
                get={x => x.ventesJeux} lignes={prevuCumule} />
              <RowP label="Produits financiers (intérêts)" get={x => x.produitsFinanciers} lignes={prevuCumule} />
              <RowP label="Entrées totales" get={x => x.entrees} lignes={prevuCumule} strong />
              <RowP label="Charges externes" aide="Bloc Charges, converti en TTC"
                get={x => x.charges} lignes={prevuCumule} />
              <RowP label="Personnel et rémunérations" get={x => x.personnel} lignes={prevuCumule} />
              <RowP label="Investissements (immobilisations)" get={x => x.immos} lignes={prevuCumule} />
              <RowP label="Tirages de jeux"
                aide="Ce qu'on paie à l'usine. À venir : exemplaires fabriqués × coût de revient, onglet Stock. Passé : la catégorie « Fabrication des jeux » au journal."
                get={x => x.tirages} lignes={prevuCumule} />
              <RowP label="Droits d'auteur"
                aide="Ce qu'on reverse aux auteurs et illustrateurs, avances comprises. À venir : les droits dus calculés dans l'onglet Stock, une fois l'avance récupérée. Passé : les versements du journal."
                get={x => x.droits} lignes={prevuCumule} />
              <RowP label="Dépenses jeux"
                aide="Ce qu'un jeu coûte à côté du tirage et des droits : prototypage, communication. Les développements portés à l'actif sont à la ligne des immobilisations, pas ici."
                get={x => x.depensesJeux} lignes={prevuCumule} />
              <RowP label="Sorties d'exploitation" get={x => x.sortiesExploitation} lignes={prevuCumule} strong />
              <RowP label="Placements"
                aide="Un placement n'est pas une dépense : l'argent va sur un compte à terme, il ne quitte pas l'entreprise. Il est sous le sous-total pour cette raison."
                get={x => x.placements} lignes={prevuCumule} />
              <RowP label="Sorties totales" get={x => x.sorties} lignes={prevuCumule} strong />
              <RowP label="Cumulé exploitation (TTC)" get={x => x.exploitation} lignes={prevuCumule} strong />
              <RowP label="Capital social" get={x => x.capital} lignes={prevuCumule} />
              <RowP label="Compte courant d'associé" get={x => x.cca} lignes={prevuCumule} />
              <RowP label="Remboursement de compte courant" get={x => x.remboursementCCA} lignes={prevuCumule} />
              <RowP label="Trésorerie fin d'exercice (TTC)" get={x => x.treso} lignes={prevuCumule} strong accent />
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#9a92b5] mt-2">
          Rien ne se saisit ici. <b>Les mois déjà passés viennent du journal</b> — ce qui est encaissé
          et payé est connu, le budget n'a plus rien à en dire ; les mois à venir viennent du
          prévisionnel, chaque ligne convertie en TTC avec son propre taux de TVA. Les tirages
          d'usine et les ventes de jeux à venir viennent de l'onglet <b>Stock</b>. Les apports en
          capital, le compte courant d'associé et les placements restent des
          <b> mouvements financiers</b>, saisis en Trésorerie.
        </p>
      </Card>

      {detail && (
        <Card
          title={`Mois par mois — ${detail.ex}`}
          className="mb-6"
          actions={
            <div className="flex gap-1">
              {EXERCICES.map(ex => (
                <Btn key={ex} variant={ex === detail.ex ? 'primary' : undefined}
                  onClick={() => setExerciceDetail(ex)}>{ex}</Btn>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table="tresoprev:mensuel" className="sheet text-sm border-collapse w-full">
              <thead>
                <tr className="text-left text-[#5c5280]">
                  <th className="min-w-56">Catégories (TTC)</th>
                  {detail.lignes.map((l, i) => (
                    <th key={l.mois} className="text-right whitespace-nowrap">
                      {labelMois(l.mois)}
                      <div className="text-[10px] font-normal" style={{ color: '#9a92b5' }}>
                        {i < detail.nReels ? 'réel' : 'prévu'}
                      </div>
                    </th>
                  ))}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <RowM label="Workshops et autres produits" get={l => l.autresProduits} d={detail} />
                <RowM label="Ventes de jeux" get={l => l.ventesJeux} d={detail} />
                <RowM label="Produits financiers (intérêts)" get={l => l.produitsFinanciers} d={detail} />
                <RowM label="Entrées totales" get={l => l.entrees} d={detail} strong />
                <RowM label="Charges externes" get={l => l.charges} d={detail} />
                <RowM label="Personnel et rémunérations" get={l => l.personnel} d={detail} />
                <RowM label="Investissements (immobilisations)" get={l => l.immos} d={detail} />
                <RowM label="Tirages de jeux" get={l => l.tirages} d={detail} />
                <RowM label="Droits d'auteur" get={l => l.droits} d={detail} />
                <RowM label="Dépenses jeux" get={l => l.depensesJeux} d={detail} />
                {/* La ligne qui répond à « quel mois fait mal » : le chiffre
                    reste lu en clair, la barre ne fait que le classer d'un
                    coup d'œil. */}
                <RowM label="Sorties d'exploitation" get={l => l.sortiesExploitation} d={detail} strong barre />
                <RowM label="Placements" get={l => l.placements} d={detail} />
                <RowM label="Sorties totales" get={l => l.sorties} d={detail} strong />
                <RowM label="Capital social" get={l => l.capital} d={detail} />
                <RowM label="Compte courant d'associé" get={l => l.cca} d={detail} />
                <RowM label="Remboursement de compte courant" get={l => l.remboursementCCA} d={detail} />
                <RowM label="Solde du mois" get={l => l.solde} d={detail} strong signe />
                <tr className="bg-[#efeafa] font-bold">
                  <td title={`Trésorerie disponible à la fin de chaque mois. Départ : ${euros(detail.ouverture)} repris des exercices précédents.`}>
                    Trésorerie fin de mois (TTC)
                  </td>
                  {detail.lignes.map(l => (
                    <td key={l.mois}
                      className={`text-right tabular-nums ${l.cumule < 0 ? 'text-[#b7332e]' : ''}`}>
                      {euros0(l.cumule)}
                    </td>
                  ))}
                  <td className="text-right tabular-nums bg-[#efeafa]"></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#9a92b5] mt-2">
            Le même calcul que le tableau du haut, déplié mois par mois : chaque colonne dit si
            elle vient du <b>journal</b> ou du <b>budget</b>. La barre sous les
            <b> sorties d'exploitation</b> mesure chaque mois contre le plus lourd de l'exercice
            — elle ne remplace pas le chiffre, elle le classe, et se mesure <b>hors
            placements</b> : mettre 80 000 € sur un compte à terme écraserait tous les autres
            mois alors que rien n'est dépensé. La dernière ligne cumule depuis
            l'ouverture ({euros(detail.ouverture)}) : <b>si elle passe en rouge, le compte est à
            découvert ce mois-là</b>, même quand l'année entière tombe juste.
          </p>
        </Card>
      )}

      <Card
        title="Mouvements financiers prévus (apports, placements, remboursements à venir)"
        className="mb-6"
        actions={
          <Btn variant="primary"
            onClick={() => addMouvementPrev({ date: todayISO(), label: '', type: 'cca', montant: 0 })}>
            <span className="inline-flex items-center gap-1"><Plus size={14} /> Ajouter</span>
          </Btn>
        }
      >
        {(mouvementsPrev ?? []).length ? (
          <table data-table="tresoprev:mouvements" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th>Date</th><th>Libellé</th><th>Type</th>
                <th className="text-right">Montant (+ entrée / − sortie)</th><th></th>
              </tr>
            </thead>
            <tbody>
              {[...(mouvementsPrev ?? [])].sort((a, b) => a.date.localeCompare(b.date)).map(f => (
                <tr key={f.id} className="group">
                  <td>
                    <input type="date" className="border border-[#ddd6ef] rounded px-1 py-0.5 text-sm"
                      value={f.date}
                      onChange={ev => ev.target.value && updateMouvementPrev(f.id, { date: ev.target.value })} />
                  </td>
                  <td>
                    <input className="border border-[#ddd6ef] rounded px-1.5 py-1 text-sm w-72"
                      defaultValue={f.label}
                      onBlur={ev => updateMouvementPrev(f.id, { label: ev.target.value })} />
                  </td>
                  <td>
                    <select className="border border-[#ddd6ef] rounded px-1 py-1 text-sm bg-white"
                      value={f.type}
                      onChange={ev => updateMouvementPrev(f.id, {
                        type: ev.target.value as FinanceEntry['type'],
                      })}>
                      {FINANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="text-right">
                    <MoneyInput value={f.montant}
                      onCommit={v => updateMouvementPrev(f.id, { montant: v ?? 0 })} className="w-32" />
                  </td>
                  <td>
                    <button className="text-[#d98b86] hover:text-[#b7332e] opacity-0 group-hover:opacity-100"
                      onClick={() => {
                        if (confirm(`Supprimer « ${f.label || 'ce mouvement'} » ?`)) removeMouvementPrev(f.id);
                      }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm" style={{ color: '#6f6690' }}>
            Rien de prévu pour l'instant. Ajoute ici ce que tu attends sans l'avoir encore
            encaissé ni payé — une entrée de compte courant d'associé, un placement, un
            remboursement programmé.
          </p>
        )}
        <p className="text-xs text-[#9a92b5] mt-2">
          Ces mouvements ne comptent que dans le tableau du haut, et seulement sur les
          <b> mois pas encore écoulés</b> : sur un mois passé, c'est le relevé qui fait foi. Ils
          n'entrent pas dans la page <b>Trésorerie</b> ni dans le tableau <b>Réalisé</b>, qui ne
          disent que ce qui a eu lieu. Quand le mouvement se produit vraiment, enregistre-le en
          Trésorerie et supprime-le d'ici.
        </p>
      </Card>

      {rapprochement && (
        <Card title={`Pourquoi les deux tableaux diffèrent sur ${rapprochement.ex}`} className="mb-6">
          <table className="sheet text-sm border-collapse" style={{ width: 'min(100%, 560px)' }}>
            <tbody>
              <tr>
                <td>Trésorerie fin d'exercice au journal seul</td>
                <td className={`text-right tabular-nums ${rapprochement.journal < 0 ? 'text-[#b7332e]' : ''}`}>
                  {euros(rapprochement.journal)}
                </td>
              </tr>
              <tr>
                <td>
                  {rapprochement.restants > 1
                    ? `Budget des ${rapprochement.restants} mois pas encore écoulés`
                    : 'Budget du mois pas encore écoulé'}
                </td>
                <td className={`text-right tabular-nums ${rapprochement.budget < 0 ? 'text-[#b7332e]' : ''}`}>
                  {rapprochement.budget > 0 ? '+' : ''}{euros(rapprochement.budget)}
                </td>
              </tr>
              <tr className="bg-[#efeafa] font-bold">
                <td>Trésorerie fin d'exercice prévue</td>
                <td className={`text-right tabular-nums ${rapprochement.prevue < 0 ? 'text-[#b7332e]' : ''}`}>
                  {euros(rapprochement.prevue)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-[#9a92b5] mt-2">
            La première ligne est celle de la page <b>Trésorerie</b> et du tableau <b>Réalisé</b>
            {' '}ci-dessous : les deux disent la même chose, puisque les deux ne lisent que le
            journal. La seconde est ce que le prévisionnel attend encore d'ici la clôture. Tant que
            l'exercice n'est pas fini, un écart entre les deux tableaux est normal — c'est le budget
            qui reste à réaliser, pas une erreur de calcul.
          </p>
        </Card>
      )}

      <Card title="Réalisé (TTC) — calculé depuis le journal" className="mb-6">
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="tresoprev:realise" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <th className="min-w-64">Catégories (TTC)</th>
                {realise.map(x => <th key={x.ex} className="text-right">{x.ex}</th>)}
              </tr>
            </thead>
            <tbody>
              <RowR label="Chiffre d'affaires" get={x => x.ca} realise={realise} />
              <RowR label="Produits financiers (intérêts)" get={x => x.pf} realise={realise} />
              <RowR label="Entrées totales" get={x => x.entreesTotales} realise={realise} strong />
              <RowR label="Investissements (immobilisations)" get={x => x.invest} realise={realise} />
              <RowR label="Charges (exploitation + jeux)" get={x => x.charges} realise={realise} />
              <RowR label="Placements" get={x => x.placements} realise={realise} />
              <RowR label="Dépenses totales" get={x => x.depensesTotales} realise={realise} strong />
              <RowR label="Cumulé exploitation (TTC)" get={x => x.cumule} realise={realise} strong />
              <RowR label="Capital social" get={x => x.capital} realise={realise} />
              <RowR label="Remboursement de compte courant" get={x => x.remboursementCCA} realise={realise} />
              <RowR label="Compte courant d'associé" get={x => x.cca} realise={realise} />
              <RowR label="Trésorerie fin d'exercice (TTC)" get={x => x.treso} realise={realise} strong accent />
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#9a92b5] mt-2">
          La trésorerie fin d'exercice cumule les exercices précédents. Les placements y figurent en sortie :
          la trésorerie affichée est la trésorerie disponible (hors comptes à terme).
        </p>
      </Card>

      <details>
        <summary className="text-sm cursor-pointer" style={{ color: 'var(--bbg-purple-dark)' }}>
          Saisie d'origine, reprise du tableur — conservée pour mémoire
        </summary>
        <Card title="Prévisionnel du tableur (TTC) — éditable" className="mt-3">
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table="tresoprev:tableur" className="sheet text-sm border-collapse w-full">
              <thead>
                <tr className="text-left text-[#5c5280]">
                  <th className="min-w-56">Catégories (TTC)</th>
                  {EXERCICES.map(ex => <th key={ex} className="text-right">{ex}</th>)}
                  <th className="text-right bg-[#efeafa]">Total</th>
                </tr>
              </thead>
              <tbody>
                {tresoPrev.map((l, li) => {
                  const tot = l.valeurs.reduce<number>((s, v) => s + (v ?? 0), 0);
                  const isComputed = ['Entrées Totales', 'Dépenses Totales', 'Cumulé (TTC)', 'Trésorerie (TTC)'].includes(l.label);
                  return (
                    <tr key={l.label + li} className={isComputed ? 'bg-[#f4f1fb] font-semibold' : 'hover:bg-[#f4f1fb]'}>
                      <td>{l.label}</td>
                      {l.valeurs.map((v, ei) => (
                        <td key={ei} className="text-right p-0.5!">
                          {isComputed
                            ? <span className={`tabular-nums px-1.5 ${(v ?? 0) < 0 ? 'text-[#b7332e]' : ''}`}>{v != null ? euros(v) : '—'}</span>
                            : <MoneyInput value={v} onCommit={x => setPrevCell(li, ei, x)}
                                className="w-full min-w-24 border-transparent hover:border-[#ddd6ef] bg-transparent" />}
                        </td>
                      ))}
                      <td className={`text-right tabular-nums font-medium bg-[#efeafa] ${tot < 0 ? 'text-[#b7332e]' : ''}`}>{euros(r2(tot))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#9a92b5] mt-2">
            Ces chiffres viennent du tableur d'origine. Ils ne servent plus au calcul : le tableau du
            haut les remplace, ligne par ligne, à partir de ce qui est réellement budgété.
          </p>
        </Card>
      </details>
    </div>
  );
}

interface PrevuRow {
  ex: string;
  moisList: string[];
  flux: ReturnType<typeof fluxTresorerie>;
  mouvements: FinanceEntry[];
  /** Combien de mois de cet exercice viennent du journal, et sur combien. */
  nReels: number; nMois: number;
  ventesJeux: number; autresProduits: number; produitsFinanciers: number;
  entrees: number; charges: number; personnel: number; immos: number;
  tirages: number; droits: number; depensesJeux: number; sortiesExploitation: number;
  placements: number; autres: number; sorties: number; exploitation: number;
  capital: number; cca: number; remboursementCCA: number; apports: number; treso: number;
}

function RowP({ label, aide, get, lignes, strong, accent }: {
  label: string; aide?: string; get: (x: PrevuRow) => number;
  lignes: PrevuRow[]; strong?: boolean; accent?: boolean;
}) {
  const total = r2(lignes.reduce((s, x) => s + get(x), 0));
  return (
    <tr className={accent ? 'bg-[#efeafa] font-bold' : strong ? 'bg-[#f4f1fb] font-semibold' : ''}>
      <td title={aide} className={aide ? 'cursor-help' : ''}>{label}</td>
      {lignes.map(x => {
        const v = get(x);
        return (
          <td key={x.ex} className={`text-right tabular-nums ${v < 0 ? 'text-[#b7332e]' : ''}`}>
            {v !== 0 ? euros(v) : '·'}
          </td>
        );
      })}
      <td className={`text-right tabular-nums font-medium bg-[#efeafa] ${total < 0 ? 'text-[#b7332e]' : ''}`}>
        {accent ? '' : (total !== 0 ? euros(total) : '·')}
      </td>
    </tr>
  );
}

/** Un mois du tableau mensuel : les mêmes postes, dépliés. */
interface LigneMois {
  mois: string;
  autresProduits: number; ventesJeux: number; produitsFinanciers: number; entrees: number;
  charges: number; personnel: number; immos: number; tirages: number; droits: number;
  depensesJeux: number; sortiesExploitation: number; placements: number; sorties: number;
  capital: number; cca: number; remboursementCCA: number;
  solde: number; cumule: number;
}

function RowM({ label, get, d, strong, signe, barre }: {
  label: string;
  get: (l: LigneMois) => number;
  d: { lignes: LigneMois[]; pire: number };
  strong?: boolean; signe?: boolean; barre?: boolean;
}) {
  const total = r2(d.lignes.reduce((s, l) => s + get(l), 0));
  return (
    <tr className={strong ? 'bg-[#f4f1fb] font-semibold' : ''}>
      <td>{label}</td>
      {d.lignes.map(l => {
        const v = get(l);
        // Barre de magnitude : une seule teinte, la piste est un pas clair de la
        // même. Le nombre reste écrit — la barre est un encodage secondaire, pas
        // le seul moyen de lire la valeur.
        const part = barre && v ? Math.min(1, Math.abs(v) / d.pire) : 0;
        return (
          <td key={l.mois}
            className={`text-right tabular-nums ${v < 0 ? 'text-[#b7332e]' : signe && v > 0 ? 'text-[#38761d]' : ''}`}>
            {v ? euros0(v) : '·'}
            {barre && (
              <div className="mt-0.5 h-1 rounded-sm w-full overflow-hidden"
                style={{ backgroundColor: part ? '#f0d5d2' : 'transparent' }}>
                <div className="h-full rounded-sm ml-auto"
                  style={{ width: `${part * 100}%`, backgroundColor: '#b7332e' }} />
              </div>
            )}
          </td>
        );
      })}
      <td className={`text-right tabular-nums font-medium bg-[#efeafa] ${total < 0 ? 'text-[#b7332e]' : ''}`}>
        {total ? euros(total) : '·'}
      </td>
    </tr>
  );
}

interface RealiseRow {
  ex: string; ca: number; pf: number; entreesTotales: number; invest: number;
  charges: number; placements: number; depensesTotales: number; cumule: number;
  capital: number; cca: number; remboursementCCA: number; apports: number; treso: number;
}

function RowR({ label, get, realise, strong, accent }: {
  label: string; get: (x: RealiseRow) => number;
  realise: RealiseRow[]; strong?: boolean; accent?: boolean;
}) {
  return (
    <tr className={accent ? 'bg-[#efeafa] font-bold' : strong ? 'bg-[#f4f1fb] font-semibold' : ''}>
      <td>{label}</td>
      {realise.map((x, i) => {
        const v = get(x);
        return (
          <td key={i} className={`text-right tabular-nums ${v < 0 ? 'text-[#b7332e]' : ''}`}>
            {v !== 0 ? euros(v) : '·'}
          </td>
        );
      })}
    </tr>
  );
}
