import { useEffect, useRef, useState } from 'react';
import { Plus, Upload, RotateCcw, Columns3 } from 'lucide-react';
import { useStore } from '../../store';
import { importBackup, exportBackup } from '../../utils/export';
import { PageHeader, Card, Btn } from '../ui';
import { formatTaille } from '../../utils/files';
import {
  incrementerRevision, instantaneMaintenant, listerInstantanes, type Instantane,
} from '../../utils/coffre';

export function SettingsPage() {
  const state = useStore();
  const { referentiels, addPaiement, addComptePlanComptable, restoreAll, resetToSeed, entries } = state;
  const resetColWidths = useStore(s => s.resetColWidths);
  const nbTableauxRedimensionnes = Object.keys(useStore(s => s.colWidths)).length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleImport(file: File) {
    try {
      const { data, nbFichiers } = await importBackup(file);
      restoreAll(data);
      setMessage(`Sauvegarde restaurée : ${data.entries?.length ?? 0} écritures`
        + (nbFichiers ? ` et ${nbFichiers} justificatif${nbFichiers > 1 ? 's' : ''}.` : '.'));
    } catch (err) {
      setMessage(`Erreur : ${err instanceof Error ? err.message : 'fichier invalide'}`);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader title="Paramètres" subtitle="Référentiels, sauvegarde et restauration" />

      {message && (
        <div className="mb-4 px-4 py-2.5 bg-[#efeafa] border border-[#c9c0e4] rounded-md text-sm text-[#3f3268]">
          {message}
        </div>
      )}

      <div className="space-y-4">
        <Instantanes onMessage={setMessage} />

        <Card title="Sauvegarde & restauration">
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="primary" onClick={() => { void exportBackup(state); }}>Télécharger une sauvegarde</Btn>
            <Btn onClick={() => fileRef.current?.click()}>
              <span className="inline-flex items-center gap-1"><Upload size={14} /> Restaurer une sauvegarde…</span>
            </Btn>
            <input
              ref={fileRef} type="file" accept="application/json" className="hidden"
              onChange={ev => { const f = ev.target.files?.[0]; if (f) handleImport(f); ev.target.value = ''; }}
            />
            <Btn variant="danger" onClick={() => {
              if (confirm('Remettre TOUTES les données à l\'état initial (import des tableurs) ? Les modifications faites dans le site seront perdues.')) {
                resetToSeed();
                setMessage('Données réinitialisées à l\'import initial des tableurs.');
              }
            }}>
              <span className="inline-flex items-center gap-1"><RotateCcw size={14} /> Réinitialiser à l'import initial</span>
            </Btn>
          </div>
          <p className="text-xs text-[#9a92b5] mt-3">
            Les données vivent dans le stockage local de ce navigateur ({entries.length} écritures actuellement)
            et les justificatifs dans sa base de fichiers. La sauvegarde JSON embarque les deux :
            fais-en une régulièrement, et avant de changer de navigateur ou de machine.
          </p>
        </Card>

        <Card title="Affichage des tableaux">
          <p className="text-sm text-[#5c5280] mb-3">
            Chaque colonne de l'application se redimensionne : attrape le <b>bord droit de son
            en-tête</b> et tire vers la gauche ou la droite. La largeur est enregistrée et
            retrouvée à la prochaine ouverture. Un <b>double-clic</b> sur ce même bord rend au
            tableau ses largeurs automatiques.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Btn onClick={() => {
              resetColWidths();
              setMessage('Toutes les colonnes sont revenues à leur largeur automatique.');
            }} disabled={!nbTableauxRedimensionnes}>
              <span className="inline-flex items-center gap-1">
                <Columns3 size={14} /> Réinitialiser toutes les largeurs
              </span>
            </Btn>
            <span className="text-xs text-[#9a92b5]">
              {nbTableauxRedimensionnes
                ? `${nbTableauxRedimensionnes} tableau(x) avec des largeurs personnalisées`
                : 'Aucune largeur personnalisée pour l\'instant'}
            </span>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Moyens de paiement">
            <ListEditor list={referentiels.paiements} onAdd={addPaiement} placeholder="ex. Virement BBG" />
          </Card>
          <Card title="Plan comptable">
            <ListEditor list={referentiels.planComptable} onAdd={addComptePlanComptable} placeholder="ex. 6064 – Fournitures administratives" />
          </Card>
        </div>

        <Card title="À propos des données importées">
          <p className="text-sm text-[#5c5280]">
            Les données initiales proviennent de tes deux tableurs (🧾 Journal Comptable 2025-26 et
            🎯 Budget prévisionnel 2025-30), importés le 26/08/2026. Lors de cet import, quelques
            anomalies des tableurs ont été détectées et corrigées ici (totaux sur plages incomplètes,
            références cassées, valeur fantôme dans un récap) — le détail est dans le fichier
            <code className="mx-1 px-1 bg-[#e9e3f7] rounded">RAPPORT_ANOMALIES.md</code> du dépôt.
            Ce site recalcule tous les totaux à partir des écritures : ils sont justes par construction.
          </p>
        </Card>
      </div>
    </div>
  );
}

function ListEditor({ list, onAdd, placeholder }: {
  list: string[]; onAdd: (name: string) => void; placeholder: string;
}) {
  const [nom, setNom] = useState('');
  return (
    <>
      <ul className="space-y-1 mb-3 max-h-48 overflow-auto text-sm text-[#3f3268]">
        {list.map(c => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex gap-1">
        <input
          className="flex-1 border border-[#c9c0e4] rounded px-2 py-1 text-sm"
          placeholder={placeholder}
          value={nom}
          onChange={ev => setNom(ev.target.value)}
          onKeyDown={ev => { if (ev.key === 'Enter' && nom.trim()) { onAdd(nom); setNom(''); } }}
        />
        <Btn variant="ghost" onClick={() => { if (nom.trim()) { onAdd(nom); setNom(''); } }}><Plus size={14} /></Btn>
      </div>
    </>
  );
}


/**
 * Les instantanés automatiques : un filet sous le filet.
 *
 * L'app en dépose un après chaque salve de modifications, et en garde les
 * derniers plus un par jour sur un mois. Ils vivent dans IndexedDB, à côté du
 * stockage principal : effacer l'un n'efface pas l'autre. C'est ce qui permet
 * de revenir à hier matin quand quelque chose a mal tourné.
 */
function Instantanes({ onMessage }: { onMessage: (m: string) => void }) {
  const [liste, setListe] = useState<Instantane[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const recharger = () => { void listerInstantanes().then(setListe); };
  useEffect(recharger, []);

  const restaurer = async (x: Instantane) => {
    const quand = new Date(x.t).toLocaleString('fr-FR');
    if (!confirm(
      `Revenir à l'instantané du ${quand} ?\n\n`
      + `Il contient ${x.resume.ecritures} écritures et ${x.resume.chrono} étapes de chronologie.\n`
      + "L'état actuel sera d'abord mis de côté dans un nouvel instantané, "
      + 'donc ce retour est lui-même annulable.')) return;
    setEnCours(true);
    try {
      // Filet du filet : on garde l'état courant avant de le remplacer.
      instantaneMaintenant();
      await new Promise(r => setTimeout(r, 400));
      localStorage.setItem('bbg-compta-v1', x.data);
      incrementerRevision();
      onMessage(`Instantané du ${quand} restauré — la page va se recharger.`);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      onMessage(`Restauration impossible : ${e instanceof Error ? e.message : 'erreur'}`);
      setEnCours(false);
    }
  };

  const dernier = liste[0];
  return (
    <Card
      title="Instantanés automatiques"
      actions={
        <div className="flex items-center gap-2">
          <Btn onClick={() => { instantaneMaintenant(); setTimeout(recharger, 500); }}>
            Prendre un instantané
          </Btn>
          <Btn variant="ghost" onClick={() => { setOuvert(v => !v); recharger(); }}>
            {ouvert ? 'Réduire' : `Voir les ${liste.length}`}
          </Btn>
        </div>
      }
    >
      <p className="text-sm mb-2" style={{ color: '#5c5280' }}>
        L'app recopie l'état complet à côté, automatiquement, quelques secondes après chaque salve
        de modifications — et aussi quand tu quittes l'onglet. Elle garde les <b>30 derniers</b> plus
        <b> un par jour sur un mois</b>. Rien ne part sur Internet.
      </p>
      {dernier ? (
        <p className="text-sm" style={{ color: '#6f6690' }}>
          Dernier instantané : <b>{new Date(dernier.t).toLocaleString('fr-FR')}</b> —{' '}
          {dernier.resume.ecritures} écritures, {dernier.resume.chrono} étapes de chronologie,{' '}
          {formatTaille(dernier.resume.octets)}.
        </p>
      ) : (
        <p className="text-sm" style={{ color: '#9a92b5' }}>
          Aucun instantané pour l'instant — le premier sera pris à ta prochaine modification.
        </p>
      )}

      {ouvert && liste.length > 0 && (
        <div className="mt-3 overflow-x-auto -mx-4 px-4">
          <table data-table="instantanes" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left" style={{ color: '#5c5280' }}>
                <th>Date et heure</th>
                <th className="text-right">Écritures</th>
                <th className="text-right">Chronologie</th>
                <th className="text-right">Taille</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {liste.map(x => (
                <tr key={x.t}>
                  <td>{new Date(x.t).toLocaleString('fr-FR')}</td>
                  <td className="text-right tabular-nums">{x.resume.ecritures}</td>
                  <td className="text-right tabular-nums">{x.resume.chrono}</td>
                  <td className="text-right tabular-nums">{formatTaille(x.resume.octets)}</td>
                  <td className="text-right">
                    <button
                      className="text-xs underline" disabled={enCours}
                      style={{ color: 'var(--bbg-purple-dark)' }}
                      onClick={() => void restaurer(x)}
                    >
                      revenir à cet état
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
