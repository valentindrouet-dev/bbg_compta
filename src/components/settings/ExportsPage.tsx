import { useState } from 'react';
import { FileSpreadsheet, FileText, FileJson, Table } from 'lucide-react';
import { useStore } from '../../store';
import { EXERCICES } from '../../utils/dates';
import { exportExcel, exportCSV, exportPDF, exportBackup } from '../../utils/export';
import { PageHeader, Card, Btn } from '../ui';

export function ExportsPage() {
  const state = useStore();
  const [exercice, setExercice] = useState('2025-26');

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="Exports"
        subtitle="Excel / Google Sheets, CSV, PDF et sauvegarde complète"
        actions={
          <select
            className="border border-[#c9c0e4] rounded-md px-2 py-1.5 text-sm bg-white"
            value={exercice}
            onChange={ev => setExercice(ev.target.value)}
          >
            {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
          </select>
        }
      />

      <div className="space-y-4">
        <Card title={<span className="inline-flex items-center gap-2"><FileSpreadsheet size={18} className="text-[#38761d]" /> Excel / Google Sheets</span>}>
          <p className="text-sm text-[#5c5280] mb-3">
            Classeur <b>.xlsx</b> complet : journal, synthèse {exercice}, produits, immobilisations,
            trésorerie, TVA, budgets 2025-30 et chronologie. S'ouvre dans Excel, et s'importe dans
            Google Sheets via <i>Fichier → Importer</i>.
          </p>
          <Btn variant="primary" onClick={() => exportExcel(state, exercice)}>Télécharger le classeur .xlsx</Btn>
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

        <Card title={<span className="inline-flex items-center gap-2"><FileJson size={18} className="text-amber-600" /> Sauvegarde complète</span>}>
          <p className="text-sm text-[#5c5280] mb-3">
            Fichier JSON contenant <b>toutes</b> les données (journal, budgets, référentiels, chronologie)
            <b> et les justificatifs joints</b>.
            À conserver précieusement : c'est ta sauvegarde. Elle se restaure depuis l'onglet Paramètres.
          </p>
          <Btn onClick={() => { void exportBackup(state); }}>Télécharger la sauvegarde</Btn>
        </Card>
      </div>
    </div>
  );
}
