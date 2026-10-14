import { useEffect, useRef, useState } from 'react';
import { Download, FileText, ImageIcon, Paperclip, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { useStore } from '../../store';
import type { DocumentJeu, TypeDocumentJeu } from '../../types';
import {
  deleteFile, downloadFile, estJustificatif, listFiles, openFile, saveFile, surChangementFichiers,
} from '../../utils/files';
import { libelleDepuisNom, transporteDesFichiers } from '../../utils/depot';
import { documentsDuJeu, TYPES_DOCUMENT_JEU, typeDepuisNom } from '../../utils/documentsJeux';
import { formatDateFR, todayISO } from '../../utils/dates';
import { toast } from '../../utils/toast';
import { Card, Btn } from '../ui';

const CHAMP = 'border rounded px-1.5 py-0.5 text-sm bg-white';

/** Couleur de la pastille de chaque type, reprise des pastilles du journal. */
const TEINTE_TYPE: Record<TypeDocumentJeu, { fond: string; encre: string }> = {
  contrat: { fond: 'var(--bbg-green-light)', encre: 'var(--bbg-green-dark)' },
  devis: { fond: 'var(--bbg-blue-light)', encre: 'var(--bbg-blue-dark)' },
  autre: { fond: 'var(--bbg-lavender)', encre: 'var(--bbg-purple-darker)' },
};

/**
 * Les documents d'un jeu : contrats signés, devis… On les glisse sur le bloc
 * (plusieurs d'un coup), ou on les choisit avec le bouton. Un clic sur le nom
 * ouvre le fichier. Les fichiers vivent avec les factures du journal, sur cet
 * ordinateur, et partent dans l'archive complète, rangés par jeu.
 */
export function DocumentsJeu({ jeu }: { jeu: string }) {
  const meta = useStore(s => s.referentiels.jeuxMeta?.[jeu]);
  const addDocumentJeu = useStore(s => s.addDocumentJeu);
  const updateDocumentJeu = useStore(s => s.updateDocumentJeu);
  const removeDocumentJeu = useStore(s => s.removeDocumentJeu);
  const docs = documentsDuJeu(meta);
  const [survol, setSurvol] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Un document dont le fichier a disparu de la base (effacé, puis la fiche
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
    if (!files.length) {
      toast(`Seuls les PDF et les images (PNG, JPG…) peuvent être rangés ici${ignores.length
        ? ` — ${ignores.join(', ')} ignoré${ignores.length > 1 ? 's' : ''}` : ''}.`, 'info');
      return;
    }
    for (const f of files) {
      const stocke = await saveFile(f);
      addDocumentJeu(jeu, {
        fileId: stocke.id, nom: f.name, type: typeDepuisNom(f.name),
        libelle: libelleDepuisNom(f.name), ajouteLe: todayISO(),
      });
    }
    const fait = files.length === 1
      ? `« ${files[0].name} » rangé dans les documents de ${jeu}`
      : `${files.length} documents rangés dans ${jeu}`;
    toast(ignores.length
      ? `${fait} — ${ignores.join(', ')} ignoré${ignores.length > 1 ? 's' : ''} (PDF ou image seulement).`
      : `${fait}.`);
  }

  async function supprimer(d: DocumentJeu) {
    if (!confirm(`Supprimer « ${d.libelle || d.nom} » des documents de ${jeu} ? Le fichier sera effacé de ce navigateur.`)) return;
    await deleteFile(d.fileId);
    removeDocumentJeu(jeu, d.id);
  }

  return (
    <div
      id="documents-jeu"
      className="rounded-lg scroll-mt-4"
      style={survol ? { outline: '2px dashed var(--bbg-green-dark)', outlineOffset: 2 } : undefined}
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
    >
      <Card
        title={`${jeu} — documents`}
        actions={
          <>
            <input
              ref={inputRef} type="file" multiple className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,image/*,application/pdf"
              onChange={ev => {
                const files = [...(ev.target.files ?? [])];
                if (files.length) void ranger(files);
                ev.target.value = '';
              }}
            />
            <Btn variant="ghost" title="Choisir un ou plusieurs fichiers (PDF ou image)"
              onClick={() => inputRef.current?.click()}>
              <span className="inline-flex items-center gap-1.5"><Upload size={14} /> Ajouter un document</span>
            </Btn>
          </>
        }
      >
        {docs.length === 0 ? (
          <button
            type="button"
            className="w-full rounded-md border-2 border-dashed px-4 py-6 text-sm text-center"
            style={{ borderColor: 'var(--bbg-border)', color: '#6f6690' }}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip size={16} className="inline mr-1.5 -mt-0.5" />
            Glisse ici le contrat signé, les devis… de <b>{jeu}</b> (PDF ou image), ou clique pour les choisir.
          </button>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table="jeux:documents" className="sheet text-sm">
              <thead>
                <tr>
                  <th className="text-left">Type</th>
                  <th className="text-left">Libellé</th>
                  <th className="text-left">Fichier</th>
                  <th>Ajouté le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => {
                  const teinte = TEINTE_TYPE[d.type];
                  const manquant = presents != null && !presents.has(d.fileId);
                  const estImage = /\.(png|jpe?g|webp|heic|gif|avif)$/i.test(d.nom);
                  return (
                    <tr key={d.id} className="group">
                      <td>
                        <select
                          className="rounded px-1.5 py-0.5 text-xs font-semibold border-0"
                          style={{ backgroundColor: teinte.fond, color: teinte.encre }}
                          value={d.type}
                          onChange={ev => updateDocumentJeu(jeu, d.id, { type: ev.target.value as TypeDocumentJeu })}
                        >
                          {TYPES_DOCUMENT_JEU.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          key={`l:${d.libelle}`} className={`${CHAMP} w-64`}
                          style={{ borderColor: 'var(--bbg-border-soft)' }}
                          defaultValue={d.libelle} placeholder="Contrat illustrations…"
                          onBlur={ev => {
                            const v = ev.target.value.trim();
                            if (v !== d.libelle) updateDocumentJeu(jeu, d.id, { libelle: v });
                          }}
                          onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                        />
                      </td>
                      <td>
                        {manquant ? (
                          <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#b7332e' }}
                            title="Le fichier n'est plus dans ce navigateur : supprime la ligne et redépose-le.">
                            <TriangleAlert size={13} /> {d.nom} — fichier introuvable
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 underline-offset-2 hover:underline text-left"
                            style={{ color: 'var(--bbg-purple-dark)' }}
                            title={`Ouvrir ${d.nom}`}
                            onClick={async () => {
                              if (!(await openFile(d.fileId))) toast('Fichier introuvable dans ce navigateur.', 'info');
                            }}
                          >
                            {estImage ? <ImageIcon size={14} className="shrink-0" /> : <FileText size={14} className="shrink-0" />}
                            {d.nom}
                          </button>
                        )}
                      </td>
                      <td className="text-center" style={{ color: '#6f6690' }}>{formatDateFR(d.ajouteLe)}</td>
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
            <p className="text-[11px] mt-2" style={{ color: '#9a92b5' }}>
              Glisse d'autres fichiers sur ce bloc pour les ranger ici. Le type est deviné d'après le
              nom du fichier (« contrat », « devis ») ; il se corrige dans la pastille.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
