import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Paperclip, FileText, ImageIcon, Search, Download, ExternalLink, Trash2, Unlink,
  LayoutGrid, List, FileArchive, TriangleAlert, Loader2,
} from 'lucide-react';
import { useStore } from '../../store';
import type { JournalEntry } from '../../types';
import { labelMois, formatDateFR, compareMois } from '../../utils/dates';
import { euros } from '../../utils/money';
import {
  listFiles, deleteFile, openFile, downloadFile, formatTaille, surChangementFichiers,
  saveFile, type StoredFile,
} from '../../utils/files';
import { exportFactures } from '../../utils/export';
import { fichiersDeposes, transporteDesFichiers } from '../../utils/depot';
import { PageHeader, Card, StatCard, Btn, useSort, sortBy, ThSort } from '../ui';

const NON_RATTACHEES = 'Non rattachées';

interface LigneFacture {
  fichier: StoredFile;
  ecriture?: JournalEntry;
  /** Mois comptable de l'écriture, ou '' pour les factures sans écriture. */
  mois: string;
  estImage: boolean;
}

export function FacturesPage() {
  const entries = useStore(s => s.entries);
  const updateEntry = useStore(s => s.updateEntry);

  const [fichiers, setFichiers] = useState<StoredFile[]>([]);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<'tous' | 'rattachees' | 'orphelines'>('tous');
  const [vue, setVue] = useState<'liste' | 'vignettes'>('liste');
  const [grouper, setGrouper] = useState(true);
  const [survol, setSurvol] = useState(false);
  const [zipEnCours, setZipEnCours] = useState(false);
  const { sort, toggle } = useSort({ key: 'date', dir: 'desc' });

  // Les fichiers vivent dans IndexedDB : on les relit à chaque changement.
  useEffect(() => {
    const charger = () => { void listFiles().then(setFichiers); };
    charger();
    return surChangementFichiers(charger);
  }, []);

  const parFileId = useMemo(() => {
    const m = new Map<string, JournalEntry>();
    for (const e of entries) if (e.factureFileId) m.set(e.factureFileId, e);
    return m;
  }, [entries]);

  const lignes: LigneFacture[] = useMemo(() => fichiers.map(f => {
    const ecriture = parFileId.get(f.id);
    return {
      fichier: f,
      ecriture,
      mois: ecriture?.mois ?? '',
      estImage: f.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|gif|avif)$/i.test(f.name),
    };
  }), [fichiers, parFileId]);

  // Écritures qui pointent vers un fichier absent de la base (fichier effacé).
  const liensCasses = useMemo(() => {
    const ids = new Set(fichiers.map(f => f.id));
    return entries.filter(e => e.factureFileId && !ids.has(e.factureFileId));
  }, [entries, fichiers]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return lignes.filter(l => {
      if (filtre === 'rattachees' && !l.ecriture) return false;
      if (filtre === 'orphelines' && l.ecriture) return false;
      if (!q) return true;
      return [l.fichier.name, l.ecriture?.fournisseur, l.ecriture?.description,
        l.ecriture?.categorie, l.ecriture ? labelMois(l.ecriture.mois) : '']
        .some(v => v?.toLowerCase().includes(q));
    });
  }, [lignes, recherche, filtre]);

  const triees = sortBy(filtrees, sort, {
    date: l => l.ecriture?.date ?? l.fichier.addedAt.slice(0, 10),
    nom: l => l.fichier.name,
    taille: l => l.fichier.size,
    ajout: l => l.fichier.addedAt,
    fournisseur: l => l.ecriture?.fournisseur ?? '',
    description: l => l.ecriture?.description ?? '',
    categorie: l => l.ecriture?.categorie ?? '',
    montant: l => l.ecriture?.ttc ?? 0,
  });

  /** Groupes : les factures sans écriture d'abord (elles demandent une action),
   *  puis les mois comptables du plus récent au plus ancien. */
  const groupes = useMemo(() => {
    if (!grouper) return [{ cle: '', titre: `${triees.length} justificatif(s)`, lignes: triees }];
    const m = new Map<string, LigneFacture[]>();
    for (const l of triees) {
      const cle = l.mois || NON_RATTACHEES;
      if (!m.has(cle)) m.set(cle, []);
      m.get(cle)!.push(l);
    }
    const cles = [...m.keys()].sort((a, b) => {
      if (a === NON_RATTACHEES) return -1;
      if (b === NON_RATTACHEES) return 1;
      return compareMois(b, a);
    });
    return cles.map(cle => ({
      cle,
      titre: cle === NON_RATTACHEES ? NON_RATTACHEES : labelMois(cle),
      lignes: m.get(cle)!,
    }));
  }, [triees, grouper]);

  const octets = fichiers.reduce((s, f) => s + f.size, 0);
  const avecJustificatif = entries.filter(e => e.factureFileId).length;
  const orphelines = lignes.filter(l => !l.ecriture).length;

  /** Écritures encore sans justificatif, pour le menu « rattacher à… ». */
  const sansJustificatif = useMemo(() => [...entries]
    .filter(e => !e.factureFileId)
    .sort((a, b) => compareMois(b.mois, a.mois) || b.date.localeCompare(a.date)),
  [entries]);

  async function ajouter(files: File[]) {
    for (const f of files) await saveFile(f);
  }

  async function supprimer(l: LigneFacture) {
    if (!confirm(`Supprimer définitivement « ${l.fichier.name} » ?`)) return;
    await deleteFile(l.fichier.id);
    if (l.ecriture) updateEntry(l.ecriture.id, { factureFileId: undefined });
  }

  async function toutTelecharger() {
    setZipEnCours(true);
    try { await exportFactures(entries); } finally { setZipEnCours(false); }
  }

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Factures"
        subtitle="Tous les justificatifs déposés dans l'app, rangés par mois comptable"
        actions={
          <>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-2.5" style={{ color: '#9a92b5' }} />
              <input
                className="pl-7 pr-2 py-1.5 border rounded-md text-sm w-56 bg-white"
                style={{ borderColor: 'var(--bbg-border)' }}
                placeholder="Rechercher un fichier, un fournisseur…"
                value={recherche}
                onChange={ev => setRecherche(ev.target.value)}
              />
            </div>
            <select
              className="border rounded-md px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: 'var(--bbg-border)' }}
              value={filtre}
              onChange={ev => setFiltre(ev.target.value as typeof filtre)}
            >
              <option value="tous">Toutes les factures</option>
              <option value="rattachees">Rattachées à une écriture</option>
              <option value="orphelines">Non rattachées</option>
            </select>
            <Btn variant="ghost" title={vue === 'liste' ? 'Voir en vignettes' : 'Voir en liste'}
              onClick={() => setVue(v => (v === 'liste' ? 'vignettes' : 'liste'))}>
              {vue === 'liste' ? <LayoutGrid size={16} /> : <List size={16} />}
            </Btn>
            <Btn onClick={toutTelecharger} disabled={zipEnCours || !fichiers.length}>
              <span className="inline-flex items-center gap-1.5">
                {zipEnCours ? <Loader2 size={14} className="animate-spin" /> : <FileArchive size={14} />}
                Tout télécharger (.zip)
              </span>
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Justificatifs stockés" value={String(fichiers.length)} />
        <StatCard label="Place occupée" value={formatTaille(octets)} />
        <StatCard label="Écritures avec justificatif"
          value={`${avecJustificatif} / ${entries.length}`}
          tone={avecJustificatif === entries.length ? 'good' : 'neutral'}
          sub={`${entries.length - avecJustificatif} sans pièce jointe`} />
        <StatCard label="Factures non rattachées" value={String(orphelines)}
          tone={orphelines ? 'accent' : 'good'}
          sub={orphelines ? 'à relier à une écriture' : 'tout est relié'} />
      </div>

      {liensCasses.length > 0 && (
        <div
          className="mb-4 px-3 py-2 rounded-md border text-sm flex items-start gap-2"
          style={{ backgroundColor: '#fdeeee', borderColor: '#e8a9a5', color: '#8f2b26' }}
        >
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <div>
            <b>{liensCasses.length} écriture(s) pointent vers un fichier absent</b> — il a été
            supprimé du navigateur, ou la sauvegarde restaurée ne le contenait pas.
            <div className="text-xs mt-1">
              {liensCasses.slice(0, 6).map(e => `${labelMois(e.mois)} · ${e.fournisseur || '—'} · ${e.description || '—'}`).join(' | ')}
              {liensCasses.length > 6 ? ` … et ${liensCasses.length - 6} autres` : ''}
            </div>
            <button
              className="text-xs underline mt-1"
              onClick={() => { for (const e of liensCasses) updateEntry(e.id, { factureFileId: undefined }); }}
            >
              Effacer ces liens cassés
            </button>
          </div>
        </div>
      )}

      {/* Zone de dépôt */}
      <div
        className="mb-4 rounded-lg border-2 border-dashed text-center py-5 px-3 transition-colors"
        style={survol
          ? { borderColor: 'var(--bbg-purple-dark)', backgroundColor: 'var(--bbg-purple-light)', color: 'var(--bbg-purple-darker)' }
          : { borderColor: 'var(--bbg-border)', backgroundColor: '#fff', color: '#6f6690' }}
        onDragOver={ev => { if (transporteDesFichiers(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; setSurvol(true); } }}
        onDragLeave={ev => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setSurvol(false); }}
        onDrop={ev => {
          ev.preventDefault();
          setSurvol(false);
          const files = fichiersDeposes(ev);
          if (files.length) void ajouter(files);
          else alert('Seuls les PDF et les images (PNG, JPG…) peuvent servir de justificatif.');
        }}
      >
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <Paperclip size={16} />
          Dépose ici des PDF ou des photos de factures
        </div>
        <div className="text-xs mt-1" style={{ color: '#9a92b5' }}>
          Elles arrivent dans « Non rattachées » ; tu les relies ensuite à une écriture.
          Pour attacher directement, glisse le fichier sur la ligne du journal.
        </div>
      </div>

      {fichiers.length === 0 ? (
        <Card title="Aucune facture pour l'instant">
          <p className="text-sm" style={{ color: '#5c5280' }}>
            Les justificatifs déposés dans le journal (icône trombone ou glisser-déposer)
            apparaissent ici, groupés par mois comptable.
          </p>
        </Card>
      ) : vue === 'vignettes' ? (
        <div className="space-y-5">
          {groupes.map(g => (
            <Card key={g.cle || 'tout'} title={`${g.titre} — ${g.lignes.length} justificatif(s)`}>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
                {g.lignes.map(l => <Vignette key={l.fichier.id} l={l} />)}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card title={`${triees.length} justificatif(s)`} actions={
          <label className="flex items-center gap-1.5 text-sm font-normal" style={{ color: '#5c5280' }}>
            <input type="checkbox" checked={grouper} onChange={ev => setGrouper(ev.target.checked)} />
            Grouper par mois
          </label>
        }>
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table="factures" className="sheet text-sm">
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <ThSort label="Fichier" k="nom" sort={sort} onToggle={toggle} />
                  <ThSort label="Taille" k="taille" sort={sort} onToggle={toggle} className="num" />
                  <ThSort label="Déposé le" k="ajout" sort={sort} onToggle={toggle} />
                  <ThSort label="Date écriture" k="date" sort={sort} onToggle={toggle} />
                  <ThSort label="Fournisseur" k="fournisseur" sort={sort} onToggle={toggle} />
                  <ThSort label="Libellé" k="description" sort={sort} onToggle={toggle} />
                  <ThSort label="Catégorie" k="categorie" sort={sort} onToggle={toggle} />
                  <ThSort label="TTC" k="montant" sort={sort} onToggle={toggle} className="num" />
                  <th style={{ width: 96 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupes.map(g => (
                  <Fragment key={g.cle || 'tout'}>
                    {grouper && (
                      <tr className={g.cle === NON_RATTACHEES ? 'band-orange' : 'band-purple'}>
                        <td colSpan={10}>
                          {g.titre} — {g.lignes.length} justificatif(s)
                          {g.cle === NON_RATTACHEES && ' · à relier à une écriture'}
                        </td>
                      </tr>
                    )}
                    {g.lignes.map(l => (
                      <tr key={l.fichier.id}>
                        <td className="text-center">
                          {l.estImage
                            ? <ImageIcon size={15} style={{ color: 'var(--bbg-green-dark)' }} />
                            : <FileText size={15} style={{ color: '#b7332e' }} />}
                        </td>
                        <td className="truncate" title={l.fichier.name}>{l.fichier.name}</td>
                        <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>{formatTaille(l.fichier.size)}</td>
                        <td style={{ color: '#6f6690' }}>{formatDateFR(l.fichier.addedAt.slice(0, 10))}</td>
                        <td>{l.ecriture ? formatDateFR(l.ecriture.date) : '·'}</td>
                        <td className="font-medium">{l.ecriture?.fournisseur || ''}</td>
                        <td className="truncate" title={l.ecriture?.description}>
                          {l.ecriture ? l.ecriture.description : (
                            <RattacherA
                              options={sansJustificatif}
                              onPick={id => updateEntry(id, { factureFileId: l.fichier.id, facture: l.fichier.name })}
                            />
                          )}
                        </td>
                        <td>{l.ecriture?.categorie || ''}</td>
                        <td className="text-right tabular-nums">{l.ecriture ? euros(l.ecriture.ttc) : '·'}</td>
                        <td>
                          <Actions l={l} onDetacher={() => l.ecriture && updateEntry(l.ecriture.id, { factureFileId: undefined })}
                            onSupprimer={() => supprimer(l)} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Menu de rattachement : les écritures encore sans justificatif. */
function RattacherA({ options, onPick }: { options: JournalEntry[]; onPick: (id: string) => void }) {
  return (
    <select
      className="pill-orange text-xs"
      value=""
      onChange={ev => { if (ev.target.value) onPick(ev.target.value); }}
      title="Relier cette facture à une écriture du journal"
    >
      <option value="">Rattacher à une écriture…</option>
      {options.map(e => (
        <option key={e.id} value={e.id}>
          {labelMois(e.mois)} · {formatDateFR(e.date)} · {e.fournisseur || '—'} · {e.description || '—'} · {euros(e.ttc)}
        </option>
      ))}
    </select>
  );
}

function Actions({ l, onDetacher, onSupprimer }: {
  l: LigneFacture; onDetacher: () => void; onSupprimer: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button title="Ouvrir dans un nouvel onglet" style={{ color: 'var(--bbg-purple-dark)' }}
        onClick={() => { void openFile(l.fichier.id); }}>
        <ExternalLink size={14} />
      </button>
      <button title="Télécharger" style={{ color: 'var(--bbg-green-dark)' }}
        onClick={() => { void downloadFile(l.fichier.id); }}>
        <Download size={14} />
      </button>
      {l.ecriture && (
        <button title="Détacher de l'écriture (le fichier est conservé)" style={{ color: '#9a92b5' }}
          onClick={onDetacher}>
          <Unlink size={14} />
        </button>
      )}
      <button title="Supprimer définitivement" style={{ color: '#d98b86' }} onClick={onSupprimer}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/** Vignette : aperçu de l'image, ou pastille PDF. */
function Vignette({ l }: { l: LigneFacture }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!l.estImage) return;
    const u = URL.createObjectURL(l.fichier.blob);
    setUrl(u);
    return () => { URL.revokeObjectURL(u); setUrl(null); };
  }, [l.fichier, l.estImage]);

  return (
    <button
      className="border rounded-lg overflow-hidden text-left bg-white hover:shadow-md transition-shadow"
      style={{ borderColor: 'var(--bbg-border-soft)' }}
      title={`Ouvrir ${l.fichier.name}`}
      onClick={() => { void openFile(l.fichier.id); }}
    >
      <div className="h-28 flex items-center justify-center" style={{ backgroundColor: 'var(--bbg-lavender)' }}>
        {url
          ? <img src={url} alt={l.fichier.name} className="max-h-28 max-w-full object-contain" />
          : <FileText size={34} style={{ color: '#b7332e' }} />}
      </div>
      <div className="p-2">
        <div className="text-xs font-medium truncate" style={{ color: 'var(--bbg-purple-darker)' }}>
          {l.ecriture?.fournisseur || l.fichier.name}
        </div>
        <div className="text-[11px] truncate" style={{ color: '#6f6690' }}>
          {l.ecriture ? `${l.ecriture.description || '—'} · ${euros(l.ecriture.ttc)}` : 'Non rattachée'}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: '#9a92b5' }}>
          {formatTaille(l.fichier.size)} · {formatDateFR(l.fichier.addedAt.slice(0, 10))}
        </div>
      </div>
    </button>
  );
}
