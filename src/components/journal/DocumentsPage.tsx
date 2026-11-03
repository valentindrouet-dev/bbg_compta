import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, FileText, FolderOpen, ImageIcon, Search, Trash2, TriangleAlert, Upload,
} from 'lucide-react';
import { useStore } from '../../store';
import type { CategorieDocument, DocumentSociete } from '../../types';
import {
  deleteFile, downloadFile, estJustificatif, listFiles, openFile, saveFile, surChangementFichiers,
} from '../../utils/files';
import { transporteDesFichiers } from '../../utils/depot';
import {
  CATEGORIES_DOCUMENT, LIBELLE_CATEGORIE, categorieDepuisNom, etatEcheance, exerciceDuDocument,
  libelleDocumentDepuisNom,
} from '../../utils/documentsSociete';
import { EXERCICES, formatDateFR, todayISO } from '../../utils/dates';
import { euros } from '../../utils/money';
import { toast } from '../../utils/toast';
import { useEtatVue } from '../../utils/etatVue';
import { PageHeader, Card, StatCard, Btn, MoneyInput } from '../ui';

/** Référence stable : un `?? []` dans un sélecteur reboucle à l'infini. */
const AUCUN: DocumentSociete[] = [];

const CHAMP = 'border rounded px-1.5 py-0.5 text-sm bg-white';

/**
 * Largeurs fixes des colonnes : les champs du tableau prennent toute leur
 * case, et une case trop étroite couperait la catégorie ou le libellé. Les
 * tableaux de chaque exercice tombent ainsi les uns sous les autres.
 */
const COLONNES = [182, 233, 135, 100, 190, 220, 160, 52];
const LARGEUR = COLONNES.reduce((s, c) => s + c, 0);

/** La pastille de chaque catégorie, dans la palette de l'app. */
const TEINTE: Record<CategorieDocument, { fond: string; encre: string }> = {
  impots: { fond: 'var(--bbg-orange-light)', encre: 'var(--bbg-orange-dark)' },
  juridique: { fond: 'var(--bbg-purple-light)', encre: 'var(--bbg-purple-darker)' },
  banque: { fond: 'var(--bbg-blue-light)', encre: 'var(--bbg-blue-dark)' },
  social: { fond: 'var(--bbg-green-light)', encre: 'var(--bbg-green-dark)' },
  autre: { fond: 'var(--bbg-lavender)', encre: 'var(--bbg-purple-darker)' },
};

/**
 * Les documents officiels de la société : avis d'impôt, Kbis, statuts,
 * attestations d'assurance, courriers de l'URSSAF… On les glisse sur la page ;
 * la catégorie et le libellé se devinent d'après le nom du fichier, la date
 * range chaque document dans son exercice. Un montant et une échéance, s'il y
 * en a, rappellent ce que le document demande. Les fichiers vivent sur cet
 * ordinateur, avec les factures, mais ne se mêlent pas à elles.
 */
export function DocumentsPage() {
  const docs = useStore(s => s.documentsSociete) ?? AUCUN;
  const addDocumentSociete = useStore(s => s.addDocumentSociete);
  const updateDocumentSociete = useStore(s => s.updateDocumentSociete);
  const removeDocumentSociete = useStore(s => s.removeDocumentSociete);

  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useEtatVue<CategorieDocument | 'toutes'>('documents.categorie', 'toutes',
    v => v === 'toutes' || CATEGORIES_DOCUMENT.some(c => c.value === v));
  const [exercice, setExercice] = useEtatVue<string>('documents.exercice', 'tous',
    v => v === 'tous' || (EXERCICES as readonly string[]).includes(v));
  const [survol, setSurvol] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const aujourdhui = todayISO();

  // Un document dont le fichier a disparu de la base (effacé, puis la ligne
  // rétablie par une annulation) se signale au lieu d'échouer en silence.
  const [presents, setPresents] = useState<Set<string> | null>(null);
  useEffect(() => {
    const charger = () => { void listFiles().then(fs => setPresents(new Set(fs.map(f => f.id)))); };
    charger();
    return surChangementFichiers(charger);
  }, []);

  /** Range les PDF et images ; les autres fichiers sont nommés dans la confirmation. */
  async function ranger(tous: File[]) {
    const files = tous.filter(estJustificatif);
    const ignores = tous.filter(f => !estJustificatif(f)).map(f => f.name);
    const refus = ignores.length ? ` — ${ignores.join(', ')} ignoré${ignores.length > 1 ? 's' : ''} (PDF ou image seulement)` : '';
    if (!files.length) {
      toast(`Seuls les PDF et les images (PNG, JPG…) peuvent être rangés ici${refus}.`, 'info');
      return;
    }
    for (const f of files) {
      const stocke = await saveFile(f);
      addDocumentSociete({
        fileId: stocke.id, nom: f.name,
        categorie: categorieDepuisNom(f.name),
        libelle: libelleDocumentDepuisNom(f.name, aujourdhui.slice(0, 4)),
        date: aujourdhui, ajouteLe: aujourdhui,
      });
    }
    toast(`${files.length === 1 ? `« ${files[0].name} » rangé` : `${files.length} documents rangés`} dans les documents de l'entreprise${refus} — vérifie ${files.length === 1 ? 'sa date et sa catégorie' : 'leur date et leur catégorie'}.`);
  }

  async function supprimer(d: DocumentSociete) {
    if (!confirm(`Supprimer « ${d.libelle || d.nom} » ? Le fichier sera effacé de ce navigateur.`)) return;
    await deleteFile(d.fileId);
    removeDocumentSociete(d.id);
  }

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return docs.filter(d => {
      if (categorie !== 'toutes' && d.categorie !== categorie) return false;
      if (exercice !== 'tous' && exerciceDuDocument(d) !== exercice) return false;
      if (!q) return true;
      return [d.libelle, d.nom, d.note, LIBELLE_CATEGORIE[d.categorie]]
        .some(v => v?.toLowerCase().includes(q));
    });
  }, [docs, recherche, categorie, exercice]);

  /** Un groupe par exercice, le plus récent en haut ; dans chacun, du plus récent au plus ancien. */
  const groupes = useMemo(() => {
    const m = new Map<string, DocumentSociete[]>();
    for (const d of filtres) {
      const ex = exerciceDuDocument(d);
      if (!m.has(ex)) m.set(ex, []);
      m.get(ex)!.push(d);
    }
    return [...m.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([ex, liste]) => ({
        ex,
        liste: [...liste].sort((a, b) => b.date.localeCompare(a.date) || b.ajouteLe.localeCompare(a.ajouteLe)),
      }));
  }, [filtres]);

  // Ce qui demande quelque chose : la prochaine échéance, et ce qui reste à payer.
  const aVenir = docs.filter(d => d.echeance && d.echeance >= aujourdhui)
    .sort((a, b) => a.echeance!.localeCompare(b.echeance!));
  const prochaine = aVenir[0];
  const aPayer = aVenir.reduce((s, d) => s + (d.montant ?? 0), 0);
  const parCategorie = CATEGORIES_DOCUMENT
    .map(c => ({ ...c, n: docs.filter(d => d.categorie === c.value).length }))
    .filter(c => c.n);

  return (
    <div
      className="p-4 pb-28 w-full max-w-[1400px]"
      onDragOver={ev => {
        if (!transporteDesFichiers(ev)) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
        setSurvol(true);
      }}
      onDragLeave={ev => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setSurvol(false);
      }}
      onDrop={ev => {
        if (!transporteDesFichiers(ev)) return;
        ev.preventDefault();
        setSurvol(false);
        const files = [...(ev.dataTransfer?.files ?? [])];
        if (files.length) void ranger(files);
      }}
      style={survol ? { outline: '2px dashed var(--bbg-green-dark)', outlineOffset: -6 } : undefined}
    >
      <PageHeader
        title="Documents de l'entreprise"
        subtitle="Avis d'impôt, Kbis, statuts, attestations… les papiers officiels, rangés par exercice"
        actions={
          <>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-2.5" style={{ color: '#9a92b5' }} />
              <input
                className="pl-7 pr-2 py-1.5 border rounded-md text-sm w-48 bg-white"
                style={{ borderColor: 'var(--bbg-border)' }}
                placeholder="Rechercher…"
                value={recherche}
                onChange={ev => setRecherche(ev.target.value)}
              />
            </div>
            <select
              className="border rounded-md px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: 'var(--bbg-border)' }}
              value={categorie}
              onChange={ev => setCategorie(ev.target.value as CategorieDocument | 'toutes')}
            >
              <option value="toutes">Toutes les catégories</option>
              {CATEGORIES_DOCUMENT.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select
              className="border rounded-md px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: 'var(--bbg-border)' }}
              value={exercice}
              onChange={ev => setExercice(ev.target.value)}
            >
              <option value="tous">Tous les exercices</option>
              {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
            </select>
            <input
              ref={inputRef} type="file" multiple className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,image/*,application/pdf"
              onChange={ev => {
                const files = [...(ev.target.files ?? [])];
                if (files.length) void ranger(files);
                ev.target.value = '';
              }}
            />
            <Btn variant="primary" title="Choisir un ou plusieurs fichiers (PDF ou image)"
              onClick={() => inputRef.current?.click()}>
              <span className="inline-flex items-center gap-1.5"><Upload size={14} /> Ajouter un document</span>
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="Documents rangés" value={String(docs.length)}
          sub={parCategorie.length ? parCategorie.map(c => `${c.n} ${c.label.toLowerCase()}`).join(' · ') : 'aucun pour l\'instant'} />
        <StatCard label="Prochaine échéance"
          value={prochaine ? formatDateFR(prochaine.echeance!) : '—'}
          tone={prochaine && etatEcheance(prochaine.echeance, aujourdhui) === 'proche' ? 'accent' : undefined}
          sub={prochaine ? prochaine.libelle || prochaine.nom : 'rien à surveiller'} />
        <StatCard label="Montants à venir" value={euros(aPayer)}
          sub={aVenir.length ? `${aVenir.length} document(s) avec une échéance à venir` : 'aucune échéance à venir'} />
      </div>

      {docs.length === 0 ? (
        <Card>
          <button
            type="button"
            className="w-full rounded-md border-2 border-dashed px-4 py-10 text-sm text-center"
            style={{ borderColor: 'var(--bbg-border)', color: '#6f6690' }}
            onClick={() => inputRef.current?.click()}
          >
            <FolderOpen size={20} className="inline mr-2 -mt-0.5" />
            Glisse ici tes documents officiels — avis d'impôt (CFE…), Kbis, statuts, attestations
            d'assurance… (PDF ou image), ou clique pour les choisir.
          </button>
        </Card>
      ) : groupes.length === 0 ? (
        <Card><p className="text-sm" style={{ color: '#6f6690' }}>Aucun document ne correspond à ces filtres.</p></Card>
      ) : groupes.map(g => (
        <Card key={g.ex} className="mb-4" title={`Exercice ${g.ex} — ${g.liste.length} document${g.liste.length > 1 ? 's' : ''}`}>
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table={`documents:${g.ex}`} className="sheet text-sm"
              style={{ tableLayout: 'fixed', width: LARGEUR }}>
              <colgroup>{COLONNES.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr>
                  <th className="text-left">Catégorie</th>
                  <th className="text-left">Libellé</th>
                  <th>Date</th>
                  <th className="num">Montant</th>
                  <th>Échéance</th>
                  <th className="text-left">Fichier</th>
                  <th className="text-left">Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {g.liste.map(d => {
                  const teinte = TEINTE[d.categorie];
                  const manquant = presents != null && !presents.has(d.fileId);
                  const estImage = /\.(png|jpe?g|webp|heic|gif|avif)$/i.test(d.nom);
                  const etat = etatEcheance(d.echeance, aujourdhui);
                  return (
                    <tr key={d.id} className="group">
                      <td>
                        <select
                          className="rounded px-1.5 py-0.5 text-xs font-semibold border-0"
                          style={{ backgroundColor: teinte.fond, color: teinte.encre }}
                          value={d.categorie}
                          title={CATEGORIES_DOCUMENT.find(c => c.value === d.categorie)?.aide}
                          onChange={ev => updateDocumentSociete(d.id, { categorie: ev.target.value as CategorieDocument })}
                        >
                          {CATEGORIES_DOCUMENT.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          key={`l:${d.libelle}`} className={CHAMP}
                          style={{ borderColor: 'var(--bbg-border-soft)' }}
                          title={d.libelle}
                          defaultValue={d.libelle} placeholder="Avis de CFE 2026…"
                          onBlur={ev => {
                            const v = ev.target.value.trim();
                            if (v !== d.libelle) updateDocumentSociete(d.id, { libelle: v });
                          }}
                          onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                        />
                      </td>
                      <td>
                        <input
                          type="date" className={CHAMP} style={{ borderColor: 'var(--bbg-border-soft)' }}
                          value={d.date}
                          title="La date du document : elle le range dans son exercice"
                          onChange={ev => { if (ev.target.value) updateDocumentSociete(d.id, { date: ev.target.value }); }}
                        />
                      </td>
                      <td className="text-right">
                        <MoneyInput
                          value={d.montant ?? null}
                          placeholder="—"
                          onCommit={v => updateDocumentSociete(d.id, { montant: v })}
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <input
                            type="date" className={CHAMP} style={{ borderColor: 'var(--bbg-border-soft)' }}
                            value={d.echeance ?? ''}
                            title="Date limite : paiement, réponse… (facultatif)"
                            onChange={ev => updateDocumentSociete(d.id, { echeance: ev.target.value || undefined })}
                          />
                          {etat === 'proche' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: 'var(--bbg-orange-light)', color: 'var(--bbg-orange-dark)' }}>
                              bientôt
                            </span>
                          )}
                          {etat === 'passee' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#9a92b5' }}>passée</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {manquant ? (
                          <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#b7332e' }}
                            title="Le fichier n'est plus dans ce navigateur : supprime la ligne et redépose-le.">
                            <TriangleAlert size={13} /> fichier introuvable
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:underline text-left max-w-full"
                            style={{ color: 'var(--bbg-purple-dark)' }}
                            title={`Ouvrir ${d.nom}`}
                            onClick={async () => {
                              if (!(await openFile(d.fileId))) toast('Fichier introuvable dans ce navigateur.', 'info');
                            }}
                          >
                            {estImage ? <ImageIcon size={14} className="shrink-0" /> : <FileText size={14} className="shrink-0" />}
                            <span className="truncate">{d.nom}</span>
                          </button>
                        )}
                      </td>
                      <td>
                        <input
                          key={`n:${d.note ?? ''}`} className={CHAMP}
                          style={{ borderColor: 'var(--bbg-border-soft)' }}
                          title={d.note}
                          defaultValue={d.note ?? ''} placeholder="Note…"
                          onBlur={ev => {
                            const v = ev.target.value.trim();
                            if (v !== (d.note ?? '')) updateDocumentSociete(d.id, { note: v || undefined });
                          }}
                          onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                        />
                      </td>
                      <td className="whitespace-nowrap">
                        {!manquant && (
                          <button
                            className="mr-1.5 opacity-40 group-hover:opacity-100"
                            style={{ color: 'var(--bbg-purple-darker)' }}
                            title="Télécharger"
                            onClick={() => void downloadFile(d.fileId, d.nom)}
                          >
                            <Download size={14} />
                          </button>
                        )}
                        <button
                          className="text-[#d98b86] hover:text-[#b7332e] opacity-0 group-hover:opacity-100"
                          title="Supprimer ce document"
                          onClick={() => void supprimer(d)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {docs.length > 0 && (
          <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
            Glisse d'autres fichiers n'importe où sur la page pour les ranger. La catégorie et le
            libellé sont devinés d'après le nom du fichier, la date est celle du jour : corrige-les
            si besoin — c'est la date qui range le document dans son exercice. Ces documents ne sont
            pas des factures : ils n'apparaissent pas dans la page Factures, et l'archive complète
            les range dans un dossier <b>Documents/</b>, par catégorie.
          </p>
      )}
    </div>
  );
}
