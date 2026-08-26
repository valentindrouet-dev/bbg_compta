import { useRef, useState } from 'react';
import { Plus, Upload, RotateCcw, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { importBackup, exportBackup } from '../../utils/export';
import { PageHeader, Card, Btn } from '../ui';

type CatKind = 'categoriesDepenses' | 'categoriesJeux' | 'categoriesProduits';

export function SettingsPage() {
  const state = useStore();
  const { referentiels, addCategorie, removeCategorie, addPaiement, addComptePlanComptable, restoreAll, resetToSeed, entries } = state;
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleImport(file: File) {
    try {
      const data = await importBackup(file);
      restoreAll(data);
      setMessage(`Sauvegarde restaurée : ${data.entries?.length ?? 0} écritures.`);
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
        <Card title="Sauvegarde & restauration">
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="primary" onClick={() => exportBackup(state)}>Télécharger une sauvegarde</Btn>
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
            Les données vivent dans le stockage local de ce navigateur ({entries.length} écritures actuellement).
            Fais une sauvegarde régulière, et avant de changer de navigateur ou de machine.
          </p>
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          <CatCard titre="Catégories de dépenses" kind="categoriesDepenses" list={referentiels.categoriesDepenses}
            onAdd={addCategorie} onRemove={removeCategorie} />
          <CatCard titre="Catégories jeux" kind="categoriesJeux" list={referentiels.categoriesJeux}
            onAdd={addCategorie} onRemove={removeCategorie} />
          <CatCard titre="Catégories de produits" kind="categoriesProduits" list={referentiels.categoriesProduits}
            onAdd={addCategorie} onRemove={removeCategorie} />
        </div>

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

function CatCard({ titre, kind, list, onAdd, onRemove }: {
  titre: string; kind: CatKind; list: string[];
  onAdd: (kind: CatKind, name: string) => void;
  onRemove: (kind: CatKind, name: string) => void;
}) {
  const [nom, setNom] = useState('');
  const entries = useStore(s => s.entries);
  return (
    <Card title={titre}>
      <ul className="space-y-1 mb-3 max-h-64 overflow-auto">
        {list.map(c => {
          const utilisee = entries.some(e => e.categorie === c);
          return (
            <li key={c} className="flex items-center justify-between text-sm text-[#3f3268] group">
              <span>{c}</span>
              <button
                className="text-[#e3b3af] hover:text-[#b7332e] opacity-0 group-hover:opacity-100 disabled:hidden"
                disabled={utilisee}
                title={utilisee ? 'Utilisée par des écritures' : 'Supprimer'}
                onClick={() => onRemove(kind, c)}
              >
                <Trash2 size={13} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-1">
        <input
          className="flex-1 border border-[#c9c0e4] rounded px-2 py-1 text-sm"
          placeholder="Nouvelle catégorie"
          value={nom}
          onChange={ev => setNom(ev.target.value)}
          onKeyDown={ev => { if (ev.key === 'Enter' && nom.trim()) { onAdd(kind, nom); setNom(''); } }}
        />
        <Btn variant="ghost" onClick={() => { if (nom.trim()) { onAdd(kind, nom); setNom(''); } }}><Plus size={14} /></Btn>
      </div>
    </Card>
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
