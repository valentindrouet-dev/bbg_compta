import { Fragment, useMemo, useState } from 'react';
import {
  Car, Copy, Trash2, Plus, MapPinned, FileText, FileSpreadsheet, ArrowRight, Check, AlertTriangle,
  RefreshCw, History,
} from 'lucide-react';
import { useStore } from '../../store';
import type { Page } from '../../App';
import type { JournalEntry, PuissanceFiscale, TrajetIK } from '../../types';
import { PageHeader, ExerciceTabs, Btn } from '../ui';
import { DateCell, AutoCompleteCell } from './cells';
import {
  anneesIK, baremeDe, calculerAnnee, formuleTranche, indemniteAnnuelle, kmRetenus, moisDe,
  moisDeLAnnee, PUISSANCES, trajetsFrequents, trancheDe, type MoisIK,
} from '../../utils/ik';
import { BENEFICIAIRE_IK, exportPDFReleveIK, fichierReleveIK } from '../../utils/export';
import { exportExcelIK } from '../../utils/excel';
import { labelMois, labelMoisLong, todayISO } from '../../utils/dates';
import { euros, parseMontant, r2 } from '../../utils/money';
import { normalise } from '../../utils/previsionnel';
import { remplacerFichier, saveFile } from '../../utils/files';
import { toast } from '../../utils/toast';
import { useEtatVue } from '../../utils/etatVue';

const km1 = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const IK_VIDE = { vehicules: [], trajets: [], passages: {} };

/**
 * Les indemnités kilométriques : le relevé des trajets professionnels faits
 * avec la voiture personnelle du gérant, et ce qu'ils valent au barème fiscal.
 * Chaque mois se passe au journal d'un clic — une écriture « Déplacements »
 * sans TVA, avec le relevé PDF du mois joint comme justificatif.
 */
export function IKPage({ onAllerA }: { onAllerA?: (page: Page, ligne: string) => void }) {
  const state = useStore();
  const ik = state.ik ?? IK_VIDE;
  const { entries, referentiels: refs } = state;
  const {
    addVehiculeIK, updateVehiculeIK, removeVehiculeIK, addTrajetIK, updateTrajetIK,
    removeTrajetIK, duplicateTrajetIK, passerIKAuJournal,
  } = state;

  const anneeCourante = Number(todayISO().slice(0, 4));
  const annees = anneesIK(ik, anneeCourante);
  const [anneeTxt, setAnnee] = useEtatVue('ik.annee', String(Math.max(anneeCourante, 2027)),
    v => /^\d{4}$/.test(v));
  const annee = Number(anneeTxt);
  const [enCours, setEnCours] = useState<string | null>(null);

  const calcules = useMemo(() => calculerAnnee(ik, annee), [ik, annee]);
  const mois = useMemo(() => moisDeLAnnee(calcules, annee), [calcules, annee]);
  const bareme = baremeDe(annee);
  const totalKm = r2(calcules.reduce((s, c) => s + c.km, 0));
  const totalIK = r2(calcules.reduce((s, c) => s + c.indemnite, 0));
  const plusieurs = ik.vehicules.length > 1;
  const vehiculeParDefaut = ik.vehicules[0];

  // Ce qui alimente la complétion : les lieux, motifs et jeux déjà saisis.
  const lieux = useMemo(() => [...new Set(ik.trajets.flatMap(t => [t.depart, t.arrivee]).filter(Boolean))], [ik.trajets]);
  const motifs = useMemo(() => [...new Set(ik.trajets.map(t => t.motif).filter(Boolean))], [ik.trajets]);
  const frequents = useMemo(() => trajetsFrequents(ik.trajets), [ik.trajets]);
  const departHabituel = useMemo(() => {
    const n = new Map<string, number>();
    for (const t of ik.trajets) if (t.depart) n.set(t.depart, (n.get(t.depart) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }, [ik.trajets]);

  const dateParDefaut = () => (annee === anneeCourante ? todayISO() : `${annee}-01-01`);
  function nouveauTrajet(modele?: Omit<TrajetIK, 'id' | 'date'>) {
    if (!vehiculeParDefaut) return;
    addTrajetIK({
      date: dateParDefaut(),
      vehiculeId: modele?.vehiculeId && ik.vehicules.some(v => v.id === modele.vehiculeId) ? modele.vehiculeId : vehiculeParDefaut.id,
      depart: modele?.depart ?? departHabituel,
      arrivee: modele?.arrivee ?? '',
      motif: modele?.motif ?? '',
      km: modele?.km ?? 0,
      allerRetour: modele?.allerRetour ?? true,
      ...(modele?.jeu ? { jeu: modele.jeu } : {}),
    });
  }

  // ----- Passage au journal -------------------------------------------------
  const categorieDeplacements = refs.categoriesDepenses.find(c => normalise(c) === 'deplacements') ?? 'Déplacements';
  const compte6251 = refs.planComptable?.find(c => c.startsWith('6251')) ?? '';
  const paiementBBG = refs.paiements.find(p => /bbg/i.test(p)) ?? refs.paiements.find(p => !/val/i.test(p)) ?? refs.paiements[0] ?? '';

  type EtatJournal = 'vide' | 'a-passer' | 'passe' | 'a-jour' | 'supprime';
  function etatJournal(m: MoisIK): { etat: EtatJournal; entry?: JournalEntry } {
    const p = ik.passages[m.mois];
    if (!p) return { etat: m.trajets ? 'a-passer' : 'vide' };
    const entry = entries.find(e => e.id === p.entryId);
    if (!entry) return { etat: m.trajets ? 'supprime' : 'vide' };
    return { etat: Math.abs(entry.ttc - m.indemnite) <= 0.005 ? 'passe' : 'a-jour', entry };
  }

  async function passerAuJournal(m: MoisIK) {
    setEnCours(m.mois);
    try {
      const { entry } = etatJournal(m);
      const fichier = fichierReleveIK(useStore.getState(), annee, m.mois);
      // Un relevé déjà joint est régénéré sous le même identifiant : l'écriture
      // garde son justificatif, à jour.
      let fileId = entry?.factureFileId && entry.facture?.startsWith('Releve_IK_') ? entry.factureFileId : undefined;
      if (!fileId || !(await remplacerFichier(fileId, fichier))) fileId = (await saveFile(fichier)).id;
      const [y, mm] = m.mois.split('-').map(Number);
      const finDuMois = `${m.mois}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, '0')}`;
      passerIKAuJournal(m.mois, {
        date: finDuMois,
        mois: m.mois,
        fournisseur: BENEFICIAIRE_IK,
        description: `Indemnités kilométriques ${labelMoisLong(m.mois).toLowerCase()} (${km1(m.km)} km)`,
        categorie: categorieDeplacements,
        ttc: m.indemnite, tva: 0, ht: m.indemnite,
        paiement: paiementBBG,
        type: 'charges',
        compta: compte6251,
        motsCles: 'IK',
        facture: fichier.name,
        factureFileId: fileId,
      }, { montant: m.indemnite, km: m.km, le: todayISO() });
      toast(`IK de ${labelMoisLong(m.mois).toLowerCase()} au journal : ${euros(m.indemnite)}, relevé PDF joint`);
    } catch (err) {
      toast(`Passage au journal impossible : ${err instanceof Error ? err.message : String(err)}`, 'info');
    } finally {
      setEnCours(null);
    }
  }

  // ----- Tranche et prochain palier -----------------------------------------
  const tranchesInfo = ik.vehicules.map(v => {
    const kmV = r2(calcules.filter(c => c.trajet.vehiculeId === v.id).reduce((s, c) => s + c.km, 0));
    const t = trancheDe(bareme.bareme[v.cv], Math.max(kmV, 1));
    return { v, km: kmV, t, reste: t.jusqua != null ? r2(t.jusqua - kmV) : null };
  });
  const principal = tranchesInfo[0];

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Indemnités kilométriques"
        subtitle={`Trajets pro avec ta voiture personnelle · barème fiscal ${bareme.annee}${bareme.publie ? '' : ' (dernier publié)'}`}
        tabs={<ExerciceTabs exercice={String(annee)} exercices={annees.map(String)} onChange={setAnnee}
          badgeOf={a => ik.trajets.filter(t => t.date.startsWith(a)).length} />}
        actions={<>
          <Btn onClick={() => exportPDFReleveIK(useStore.getState(), annee)} disabled={!calcules.length}
            title={`Le relevé de toute l'année ${annee}, en PDF`}>
            <span className="inline-flex items-center gap-1.5"><FileText size={14} /> PDF {annee}</span>
          </Btn>
          <Btn onClick={() => void exportExcelIK(useStore.getState(), annee)} disabled={!calcules.length}
            title={`Le relevé de l'année ${annee}, en Excel`}>
            <span className="inline-flex items-center gap-1.5"><FileSpreadsheet size={14} /> Excel {annee}</span>
          </Btn>
        </>}
      />

      {/* ----- Véhicules et chiffres de l'année ----- */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-3 mb-3">
        <section className="bg-white rounded-lg shadow-sm border" style={{ borderColor: 'var(--bbg-border-soft)' }}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b rounded-t-lg"
            style={{ backgroundColor: 'var(--bbg-lavender)', borderColor: 'var(--bbg-border-soft)' }}>
            <h2 className="font-semibold text-sm inline-flex items-center gap-1.5" style={{ color: 'var(--bbg-purple-darker)' }}>
              <Car size={15} /> {plusieurs ? 'Véhicules' : 'Véhicule'}
            </h2>
            <button className="text-xs inline-flex items-center gap-1 text-[#674ea7] hover:underline"
              onClick={() => addVehiculeIK({ nom: '', cv: 5, electrique: false })}>
              <Plus size={12} /> véhicule
            </button>
          </div>
          <div className="p-2">
            {ik.vehicules.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3 px-1 py-1 text-sm text-[#5c5280]">
                Commence par ta voiture : sa puissance fiscale (case P.6 de la carte grise) fixe le barème.
                <Btn variant="primary" onClick={() => addVehiculeIK({ nom: 'Ma voiture', cv: 5, electrique: false })}>
                  <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Ajouter ma voiture</span>
                </Btn>
              </div>
            ) : (
              <table className="sheet text-[13px]">
                <thead>
                  <tr>
                    <th>Nom</th><th className="whitespace-nowrap">Immatriculation</th>
                    <th className="whitespace-nowrap">Puissance</th><th className="whitespace-nowrap">Électrique</th>
                    <th className="num whitespace-nowrap">Km {annee}</th><th>Barème</th><th />
                  </tr>
                </thead>
                <tbody>
                  {ik.vehicules.map(v => {
                    const info = tranchesInfo.find(x => x.v.id === v.id)!;
                    const utilise = ik.trajets.some(t => t.vehiculeId === v.id);
                    return (
                      <tr key={v.id}>
                        <td><TexteCell value={v.nom} placeholder="Peugeot 208…" onCommit={nom => updateVehiculeIK(v.id, { nom })} /></td>
                        <td style={{ width: 120 }}><TexteCell value={v.immatriculation ?? ''} placeholder="AB-123-CD"
                          onCommit={immatriculation => updateVehiculeIK(v.id, { immatriculation: immatriculation.toUpperCase() })} /></td>
                        <td style={{ width: 130 }}>
                          <select value={v.cv} onChange={ev => updateVehiculeIK(v.id, { cv: Number(ev.target.value) as PuissanceFiscale })}>
                            {PUISSANCES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                        </td>
                        <td style={{ width: 80 }} className="text-center">
                          <input type="checkbox" className="accent-[#674ea7] !w-auto" checked={v.electrique}
                            title="Véhicule 100 % électrique : barème majoré de 20 %"
                            onChange={ev => updateVehiculeIK(v.id, { electrique: ev.target.checked })} />
                        </td>
                        <td className="text-right tabular-nums" style={{ width: 80 }}>{km1(info.km)}</td>
                        <td className="text-[12px] text-[#5c5280] whitespace-nowrap" style={{ width: 150 }}>
                          {formuleTranche(info.t)}{v.electrique ? ' × 1,2' : ''}
                        </td>
                        <td style={{ width: 30 }} className="text-center">
                          <button className="p-1 rounded text-[#9a92b5] hover:text-red-600 disabled:opacity-30 disabled:hover:text-[#9a92b5]"
                            disabled={utilise}
                            title={utilise ? 'Ce véhicule porte des trajets : il reste au relevé' : 'Retirer ce véhicule'}
                            onClick={() => removeVehiculeIK(v.id)}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Chiffre label={`Km pro ${annee}`} valeur={`${km1(totalKm)} km`} sous={`${calcules.length} trajet${calcules.length > 1 ? 's' : ''}`} />
          <Chiffre label={`IK ${annee}`} valeur={euros(totalIK)} sous="sans impôt ni cotisations" ton="good" />
          <Chiffre label="Taux moyen" valeur={totalKm ? `${(totalIK / totalKm).toFixed(3).replace('.', ',')} €/km` : '—'}
            sous="barème de l'année" />
          <Chiffre label="Tranche"
            valeur={principal ? (principal.t.jusqua === 5000 ? '≤ 5 000 km' : principal.t.jusqua === 20000 ? '5 001 – 20 000 km' : '> 20 000 km') : '—'}
            sous={principal?.reste != null ? `encore ${km1(principal.reste)} km avant la suivante` : principal ? 'dernière tranche' : 'ajoute ta voiture'} />
        </div>
      </div>

      {/* ----- Les douze mois ----- */}
      <section className="bg-white rounded-lg shadow-sm border mb-3 overflow-x-auto" style={{ borderColor: 'var(--bbg-border-soft)' }}>
        <table className="sheet text-[13px] table-fixed min-w-[980px]">
          <colgroup><col style={{ width: 110 }} />{mois.map(m => <col key={m.mois} />)}<col style={{ width: 100 }} /></colgroup>
          <thead>
            <tr>
              <th>{annee}</th>
              {mois.map(m => <th key={m.mois} className="num">{labelMois(m.mois).split(' ')[0]}</th>)}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-[#6f6690]">Km</td>
              {mois.map(m => <td key={m.mois} className="text-right tabular-nums">{m.km ? km1(m.km) : ''}</td>)}
              <td className="text-right tabular-nums font-semibold">{km1(totalKm)}</td>
            </tr>
            <tr>
              <td className="text-[#6f6690]">Indemnités</td>
              {mois.map(m => <td key={m.mois} className="text-right tabular-nums font-semibold">{m.indemnite ? euros(m.indemnite) : ''}</td>)}
              <td className="text-right tabular-nums font-bold" style={{ color: 'var(--bbg-green-dark)' }}>{euros(totalIK)}</td>
            </tr>
            <tr>
              <td className="text-[#6f6690]">Journal</td>
              {mois.map(m => {
                const { etat, entry } = etatJournal(m);
                const occupe = enCours === m.mois;
                return (
                  <td key={m.mois} className="text-center">
                    {etat === 'a-passer' && (
                      <button className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#674ea7] hover:underline disabled:opacity-40"
                        disabled={occupe} title={`Créer l'écriture d'IK de ${labelMoisLong(m.mois)} au journal, relevé PDF joint`}
                        onClick={() => void passerAuJournal(m)}>
                        <ArrowRight size={12} /> passer
                      </button>
                    )}
                    {etat === 'passe' && (
                      <button className="inline-flex items-center gap-0.5 text-[12px] text-[var(--bbg-green-dark)] hover:underline"
                        title={`Au journal le ${ik.passages[m.mois].le.split('-').reverse().join('/')} — voir l'écriture`}
                        onClick={() => entry && onAllerA?.('journal', entry.id)}>
                        <Check size={13} /> au journal
                      </button>
                    )}
                    {(etat === 'a-jour' || etat === 'supprime') && (
                      <button className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[var(--bbg-orange-dark)] hover:underline disabled:opacity-40"
                        disabled={occupe}
                        title={etat === 'a-jour'
                          ? `Le journal porte ${euros(entry!.ttc)}, les trajets ${euros(m.indemnite)} : mettre l'écriture à jour`
                          : 'L\'écriture a été supprimée du journal : la recréer'}
                        onClick={() => void passerAuJournal(m)}>
                        {etat === 'a-jour' ? <RefreshCw size={12} /> : <AlertTriangle size={12} />} màj
                      </button>
                    )}
                  </td>
                );
              })}
              <td />
            </tr>
            <tr>
              <td className="text-[#6f6690]">Relevé</td>
              {mois.map(m => (
                <td key={m.mois} className="text-center">
                  {m.trajets > 0 && (
                    <button className="text-[#9a92b5] hover:text-[#674ea7]" title={`Relevé PDF de ${labelMoisLong(m.mois)}`}
                      onClick={() => exportPDFReleveIK(useStore.getState(), annee, m.mois)}>
                      <FileText size={13} />
                    </button>
                  )}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </section>

      {/* ----- Le relevé des trajets ----- */}
      <section className="bg-white rounded-lg shadow-sm border" style={{ borderColor: 'var(--bbg-border-soft)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b rounded-t-lg"
          style={{ backgroundColor: 'var(--bbg-lavender)', borderColor: 'var(--bbg-border-soft)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--bbg-purple-darker)' }}>
            Relevé des trajets {annee}
          </h2>
          <div className="flex items-center gap-2">
            {frequents.length > 0 && (
              <label className="inline-flex items-center gap-1 text-xs text-[#6f6690]">
                <History size={13} />
                <select className="border rounded px-1.5 py-1 text-xs bg-white max-w-[300px]" style={{ borderColor: 'var(--bbg-border)' }}
                  value="" disabled={!vehiculeParDefaut}
                  onChange={ev => { const f = frequents[Number(ev.target.value)]; if (f) nouveauTrajet(f); }}>
                  <option value="">Reprendre un trajet…</option>
                  {frequents.map((f, i) => (
                    <option key={i} value={i}>
                      {f.depart} → {f.arrivee} · {km1(kmRetenus(f))} km{f.motif ? ` · ${f.motif}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Btn variant="primary" onClick={() => nouveauTrajet()} disabled={!vehiculeParDefaut}
              title={vehiculeParDefaut ? 'Ajouter un trajet' : 'Ajoute d\'abord ta voiture'}>
              <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Trajet</span>
            </Btn>
          </div>
        </div>
        <div className="p-2 overflow-x-auto">
          <table className="sheet text-[13px] table-fixed min-w-[1050px]">
            <colgroup>
              <col style={{ width: 92 }} />
              {plusieurs && <col style={{ width: 120 }} />}
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 84 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                {plusieurs && <th>Véhicule</th>}
                <th>Départ</th>
                <th>Arrivée</th>
                <th>Motif du déplacement</th>
                <th>Jeu</th>
                <th className="num">Km</th>
                <th title="Aller-retour : la distance compte deux fois">A/R</th>
                <th className="num">Retenus</th>
                <th className="num">Indemnité</th>
                <th />
              </tr>
            </thead>
            {calcules.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={plusieurs ? 11 : 10} className="text-center text-[#9a92b5] py-6">
                    {vehiculeParDefaut
                      ? `Aucun trajet en ${annee}. « + Trajet » pour noter le premier : date, départ, arrivée, motif et kilomètres.`
                      : 'Ajoute ta voiture ci-dessus pour commencer le relevé.'}
                  </td>
                </tr>
              </tbody>
            ) : mois.filter(m => m.trajets).map(m => (
              <tbody key={m.mois}>
                <tr>
                  <td colSpan={plusieurs ? 8 : 7} className="!bg-[var(--bbg-purple-light)] text-[11px] uppercase tracking-wide font-semibold"
                    style={{ color: 'var(--bbg-purple-darker)' }}>
                    {labelMoisLong(m.mois)} · {m.trajets} trajet{m.trajets > 1 ? 's' : ''}
                  </td>
                  <td className="!bg-[var(--bbg-purple-light)] text-right tabular-nums font-semibold text-[12px]" style={{ color: 'var(--bbg-purple-darker)' }}>
                    {km1(m.km)}
                  </td>
                  <td className="!bg-[var(--bbg-purple-light)] text-right tabular-nums font-semibold" style={{ color: 'var(--bbg-purple-darker)' }}>
                    {euros(m.indemnite)}
                  </td>
                  <td className="!bg-[var(--bbg-purple-light)]" />
                </tr>
                {calcules.filter(c => moisDe(c.trajet.date) === m.mois).map(c => {
                  const t = c.trajet;
                  const maj = (patch: Partial<Omit<TrajetIK, 'id'>>) => updateTrajetIK(t.id, patch);
                  return (
                    <Fragment key={t.id}>
                      <tr data-ligne={t.id}>
                        <td><DateCell value={t.date} anneeRef={annee} onCommit={date => maj({ date })} /></td>
                        {plusieurs && (
                          <td>
                            <select value={t.vehiculeId} onChange={ev => maj({ vehiculeId: ev.target.value })}>
                              {ik.vehicules.map(v => <option key={v.id} value={v.id}>{v.nom || `${v.cv} CV`}</option>)}
                            </select>
                          </td>
                        )}
                        <td><AutoCompleteCell value={t.depart} options={lieux} placeholder="Départ" onCommit={depart => maj({ depart })} /></td>
                        <td><AutoCompleteCell value={t.arrivee} options={lieux} placeholder="Arrivée" onCommit={arrivee => maj({ arrivee })} /></td>
                        <td><AutoCompleteCell value={t.motif} options={motifs} placeholder="Festival, éditeur, imprimeur…" onCommit={motif => maj({ motif })} /></td>
                        <td><AutoCompleteCell value={t.jeu ?? ''} options={refs.jeux ?? []} placeholder="—"
                          onCommit={jeu => maj({ jeu: jeu || undefined })} /></td>
                        <td><KmCell value={t.km} onCommit={km => maj({ km })} /></td>
                        <td className="text-center">
                          <input type="checkbox" className="accent-[#674ea7] !w-auto" checked={t.allerRetour}
                            title="Aller-retour" onChange={ev => maj({ allerRetour: ev.target.checked })} />
                        </td>
                        <td className="text-right tabular-nums text-[#6f6690]" title={`Cumul ${annee} du véhicule : ${km1(c.cumulKm)} km`}>
                          {km1(c.km)}
                        </td>
                        <td className="text-right tabular-nums font-semibold">{euros(c.indemnite)}</td>
                        <td>
                          <div className="flex items-center justify-end gap-0.5 text-[#9a92b5]">
                            {t.depart && t.arrivee ? (
                              <a className="p-1 rounded hover:text-[#674ea7]" target="_blank" rel="noreferrer noopener"
                                title="Vérifier la distance sur Google Maps"
                                href={`https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(t.depart)}&destination=${encodeURIComponent(t.arrivee)}`}>
                                <MapPinned size={13} />
                              </a>
                            ) : <span className="p-1 opacity-30"><MapPinned size={13} /></span>}
                            <button className="p-1 rounded hover:text-[#674ea7]" title="Dupliquer le trajet"
                              onClick={() => duplicateTrajetIK(t.id)}><Copy size={13} /></button>
                            <button className="p-1 rounded hover:text-red-600" title="Supprimer le trajet (Cmd+Z pour annuler)"
                              onClick={() => { removeTrajetIK(t.id); toast('Trajet supprimé — Cmd+Z pour l\'annuler', 'info'); }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            ))}
            {calcules.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={plusieurs ? 8 : 7}>Total {annee} · {calcules.length} trajets</td>
                  <td className="text-right tabular-nums">{km1(totalKm)}</td>
                  <td className="text-right tabular-nums">{euros(totalIK)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          <p className="text-[11px] text-[#9a92b5] mt-2 px-1">
            Barème des voitures {bareme.annee}{bareme.publie ? '' : ' (dernier publié — à remplacer quand le suivant paraît)'} :
            {' '}{principal ? `${PUISSANCES.find(p => p.value === principal.v.cv)?.label}, ${bareme.bareme[principal.v.cv].map(formuleTranche).join(' / ')}` : 'selon la puissance fiscale'}.
            {' '}Chaque trajet vaut le barème du cumul de l'année après lui, moins celui d'avant : le total de décembre tombe juste, sans régularisation.
            {' '}Péages et parkings restent à part, sur justificatifs. Pour {km1(5000)} km avec ce véhicule :
            {' '}{principal ? euros(indemniteAnnuelle(5000, principal.v, annee)) : '—'}.
          </p>
        </div>
      </section>
    </div>
  );
}

function Chiffre({ label, valeur, sous, ton }: { label: string; valeur: string; sous: string; ton?: 'good' }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border px-3 py-1.5"
      style={{ borderColor: 'var(--bbg-border-soft)', borderLeft: `4px solid ${ton === 'good' ? 'var(--bbg-green)' : 'var(--bbg-purple)'}` }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: '#6f6690' }}>{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight"
        style={{ color: ton === 'good' ? 'var(--bbg-green-dark)' : 'var(--bbg-purple-darker)' }}>{valeur}</div>
      <div className="text-[11px]" style={{ color: '#8d85a6' }}>{sous}</div>
    </div>
  );
}

/** Texte libre, validé en quittant le champ. */
function TexteCell({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      value={text ?? value}
      placeholder={placeholder}
      onChange={ev => setText(ev.target.value)}
      onBlur={() => { if (text !== null) { onCommit(text.trim()); setText(null); } }}
      onKeyDown={ev => {
        if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
        if (ev.key === 'Escape') { setText(null); (ev.target as HTMLInputElement).blur(); }
      }}
    />
  );
}

/** Kilomètres : un chiffre, virgule acceptée, validé en quittant le champ. */
function KmCell({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="num" inputMode="decimal" placeholder="0"
      value={text ?? (value ? km1(value) : '')}
      onFocus={ev => { setText(value ? String(value).replace('.', ',') : ''); const el = ev.target; setTimeout(() => el.select(), 0); }}
      onChange={ev => setText(ev.target.value)}
      onBlur={() => {
        if (text !== null) {
          const v = parseMontant(text);
          onCommit(v == null || v < 0 ? 0 : r2(v));
          setText(null);
        }
      }}
      onKeyDown={ev => {
        if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
        if (ev.key === 'Escape') { setText(null); (ev.target as HTMLInputElement).blur(); }
      }}
    />
  );
}
