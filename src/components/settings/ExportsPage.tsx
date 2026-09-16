import { useState } from 'react';
import {
  FileSpreadsheet, FileText, FileJson, Table, FileArchive, Loader2, Share2, Lock, CalendarDays,
} from 'lucide-react';
import { useStore } from '../../store';
import { EXERCICES, labelMoisLong, moisExercice, moisCourant, exerciceDuMois } from '../../utils/dates';
import {
  exportExcel, exportCSV, exportPDF, exportBackup, exportTout, exportPartage,
  exportPDFMois, exportPDFSynthese, exportPDFSyntheseTotale,
} from '../../utils/export';
import { formatTaille } from '../../utils/files';
import { PageHeader, ExerciceTabs, Card, Btn } from '../ui';
import { useEtatVue } from '../../utils/etatVue';
import { useBaseMontant } from '../../utils/reglagesVue';

export function ExportsPage() {
  const state = useStore();
  const [exercice, setExercice] = useEtatVue('exports.exercice', '2025-26',
    v => (EXERCICES as readonly string[]).includes(v));
  const [base] = useBaseMontant();
  const moisList = moisExercice(exercice);
  // Le mois en cours s'il appartient à l'exercice choisi, sinon son premier mois.
  const [moisPDF, setMoisPDF] = useState(
    () => exerciceDuMois(moisCourant()) === exercice ? moisCourant() : moisList[0]);
  const moisChoisi = moisList.includes(moisPDF) ? moisPDF : moisList[0];
  const [avecFactures, setAvecFactures] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);
  const [partage, setPartage] = useState<string | null>(null);

  async function toutExporter() {
    setEnCours(true);
    setResultat(null);
    try {
      const r = await exportTout(state, exercice, { avecFactures });
      setResultat(`${r.nom} — ${r.fichiers.length} fichiers, ${formatTaille(r.taille)}`);
    } catch (err) {
      setResultat(`Échec de l'export : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="Exports"
        subtitle="Excel / Google Sheets, CSV, PDF et sauvegarde complète"
        tabs={<ExerciceTabs exercice={exercice} exercices={EXERCICES} onChange={setExercice} />}
      />

      <div className="space-y-4">
        <Card
          className="border-2"
          title={
            <span className="inline-flex items-center gap-2">
              <FileArchive size={18} style={{ color: 'var(--bbg-purple-dark)' }} />
              Tout exporter d'un coup (.zip)
            </span>
          }
        >
          <p className="text-sm text-[#5c5280] mb-3">
            Une seule archive contenant les <b>quatre exports</b> de l'exercice {exercice} :
            le classeur <b>.xlsx</b>, le rapport <b>.pdf</b>, le journal <b>.csv</b> et la
            sauvegarde <b>.json</b> — plus un « Lisez-moi » qui rappelle à quoi sert chaque fichier.
            C'est le format à envoyer à l'expert-comptable.
          </p>
          <label className="flex items-center gap-2 text-sm mb-3 text-[#3f3268]">
            <input
              type="checkbox"
              checked={avecFactures}
              onChange={ev => setAvecFactures(ev.target.checked)}
            />
            Ajouter un dossier <b>Factures/</b> avec les justificatifs, rangés par mois
          </label>
          <div className="flex items-center gap-3">
            <Btn variant="primary" onClick={toutExporter} disabled={enCours}>
              <span className="inline-flex items-center gap-1.5">
                {enCours ? <Loader2 size={14} className="animate-spin" /> : <FileArchive size={14} />}
                {enCours ? 'Préparation de l\'archive…' : 'Télécharger l\'archive complète'}
              </span>
            </Btn>
            {resultat && <span className="text-xs text-[#38761d]">{resultat}</span>}
          </div>
          {avecFactures && (
            <p className="text-xs text-[#9a92b5] mt-2">
              Avec le dossier Factures, la sauvegarde .json de l'archive n'embarque pas une seconde
              fois les fichiers : les justificatifs sont là, en clair, une seule fois. Pour une
              sauvegarde autonome et restaurable, prends celle du bloc plus bas.
            </p>
          )}
        </Card>

        <Card
          className="border-2"
          title={
            <span className="inline-flex items-center gap-2">
              <Share2 size={18} style={{ color: 'var(--bbg-green-dark)' }} />
              Version partageable pour le comptable (lecture seule)
            </span>
          }
        >
          <p className="text-sm text-[#5c5280] mb-3">
            Un <b>seul fichier HTML</b> qui contient tout l'exercice {exercice} : synthèse par bloc,
            compte de résultat, TVA, journal détaillé, immobilisations et contrôles comptables.
            Il s'ouvre d'un double-clic dans n'importe quel navigateur, <b>rien n'est modifiable</b>,
            et il n'envoie rien sur Internet. Pour lui donner une adresse partageable, dépose-le sur
            ton Drive et partage le lien — ou imprime-le en PDF depuis le navigateur.
          </p>
          <div className="flex items-center gap-3">
            <Btn variant="primary" onClick={() => {
              const r = exportPartage(state, exercice);
              setPartage(`${r.nom} — ${formatTaille(r.taille)}`);
            }}>
              <span className="inline-flex items-center gap-1.5">
                <Lock size={14} /> Générer la copie lecture seule
              </span>
            </Btn>
            {partage && <span className="text-xs text-[#38761d]">{partage}</span>}
          </div>
          <p className="text-xs text-[#9a92b5] mt-2">
            Ce fichier contient tes chiffres : ne le mets pas sur une page publique. Un lien Drive
            restreint aux personnes invitées est ce qu'il faut pour ton comptable.
          </p>
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><FileSpreadsheet size={18} className="text-[#38761d]" /> Excel / Google Sheets</span>}>
          <p className="text-sm text-[#5c5280] mb-3">
            Classeur <b>.xlsx</b> complet : journal, synthèse {exercice}, produits, immobilisations,
            trésorerie, TVA, prévisionnel 2025-30 et chronologie. S'ouvre dans Excel, et s'importe dans
            Google Sheets via <i>Fichier → Importer</i>.
          </p>
          <Btn onClick={() => exportExcel(state, exercice)}>Télécharger le classeur .xlsx</Btn>
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><Table size={18} className="text-sky-600" /> CSV (journal)</span>}>
          <p className="text-sm text-[#5c5280] mb-3">
            Toutes les écritures du journal au format CSV (séparateur « ; », décimales à virgule) —
            idéal pour transmettre à l'expert-comptable ou retraiter ailleurs.
          </p>
          <Btn onClick={() => exportCSV(state.entries)}>Télécharger le CSV</Btn>
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><FileText size={18} className="text-[#b7332e]" /> Rapport PDF</span>}>
          <p className="text-sm text-[#5c5280] mb-3">
            Rapport de l'exercice {exercice} : synthèse par catégorie, journal détaillé, TVA et trésorerie.
          </p>
          <Btn onClick={() => exportPDF(state, exercice)}>Générer le PDF</Btn>
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><CalendarDays size={18} className="text-[#b7332e]" /> PDF d'un mois</span>}>
          <p className="text-sm text-[#5c5280] mb-3">
            Le <b>Journal du mois</b> tel qu'il est à l'écran : charges, immobilisations, dépenses
            jeux et produits, ligne à ligne, chacun avec son total, plus un récapitulatif par
            catégorie. De quoi garder la trace d'un mois clos sans envoyer tout l'exercice.
            Le même bouton se trouve en haut de la page <i>Journal du mois</i>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="border rounded-md px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: 'var(--bbg-border)' }}
              value={moisChoisi}
              onChange={ev => setMoisPDF(ev.target.value)}
            >
              {moisList.map(m => <option key={m} value={m}>{labelMoisLong(m)}</option>)}
            </select>
            <Btn onClick={() => exportPDFMois(state, moisChoisi)}>Générer le PDF du mois</Btn>
          </div>
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><FileText size={18} className="text-[#b7332e]" /> PDF des synthèses</span>}>
          <p className="text-sm text-[#5c5280] mb-3">
            La <b>synthèse annuelle</b> de l'exercice {exercice} — compte de résultat, blocs mois
            par mois (fonctionnement et jeux séparés), immobilisations, TVA et récapitulatif —
            ou la <b>synthèse totale 2025-30</b>, une colonne par exercice. Les deux suivent le
            réglage {base === 'ttc' ? 'TTC' : 'HT'} ; le compte de résultat reste en HT.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Btn onClick={() => exportPDFSynthese(state, exercice, base)}>
              Synthèse {exercice}
            </Btn>
            <Btn onClick={() => exportPDFSyntheseTotale(state, base)}>
              Synthèse totale 2025-30
            </Btn>
          </div>
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><FileJson size={18} className="text-amber-600" /> Sauvegarde complète</span>}>
          <p className="text-sm text-[#5c5280] mb-3">
            Fichier JSON contenant <b>toutes</b> les données (journal, prévisionnel, référentiels, chronologie,
            mises en forme) <b>et les justificatifs joints</b>.
            À conserver précieusement : c'est ta sauvegarde. Elle se restaure depuis l'onglet Paramètres.
          </p>
          <Btn onClick={() => { void exportBackup(state); }}>Télécharger la sauvegarde</Btn>
        </Card>
      </div>
    </div>
  );
}
