import { useMemo, useState } from 'react';
import { Plus, Trash2, RotateCcw, CopyPlus } from 'lucide-react';
import { useStore } from '../../store';
import type { Placement } from '../../types';
import { formatDateFR, todayISO } from '../../utils/dates';
import { euros, parseMontant, r2 } from '../../utils/money';
import { deleteFile, saveFile } from '../../utils/files';
import { fichiersDeposes, transporteDesFichiers } from '../../utils/depot';
import { toast } from '../../utils/toast';
import {
  GARANTIES_PLACEMENT, LIBELLE_STATUT, PRODUITS_PLACEMENT, echeancePlacement, gainReel,
  remunerationCalculee, resumePlacements, statutPlacement, type StatutPlacement,
} from '../../utils/placements';
import { PageHeader, Card, Btn, MoneyInput, StatCard } from '../ui';
import { FactureCell } from './cells';

/**
 * Saisie d'un taux. Le champ des montants arrondit l'affichage au centime :
 * un taux de 0,625 % s'y lirait 0,63 %. Celui-ci montre le taux tel qu'il est.
 */
function TauxInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [texte, setTexte] = useState<string | null>(null);
  return (
    <input
      type="text" inputMode="decimal"
      className="w-16 px-1.5 py-1 border border-[#ddd6ef] rounded text-right text-sm tabular-nums
        focus:outline-none focus:border-[#674ea7] focus:ring-2 focus:ring-[#674ea7]/25"
      value={texte ?? String(value).replace('.', ',')}
      onChange={ev => setTexte(ev.target.value)}
      onFocus={ev => ev.target.select()}
      onBlur={() => { if (texte !== null) { onCommit(parseMontant(texte) ?? 0); setTexte(null); } }}
      onKeyDown={ev => {
        if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
        if (ev.key === 'Escape') setTexte(null);
      }}
    />
  );
}

/** Référence stable : un `?? []` dans un sélecteur reboucle à l'infini. */
const AUCUN_PLACEMENT: Placement[] = [];

const CHAMP = 'border border-[#ddd6ef] rounded px-1.5 py-1 text-sm bg-white';

/**
 * Largeurs des colonnes, en pixels. Dans les tableaux de l'app, un champ prend
 * toute la largeur de sa case : sans largeurs fixées, les colonnes se
 * serreraient jusqu'à tronquer les menus. Au-delà, le tableau défile.
 */
const COLONNES = [142, 152, 138, 150, 128, 105, 72, 92, 68, 120, 152, 132, 128, 115, 140, 52];
const LARGEUR_TABLE = COLONNES.reduce((s, w) => s + w, 0);

const COULEUR_STATUT: Record<StatutPlacement, { fond: string; encre: string }> = {
  a_venir: { fond: '#efeafa', encre: 'var(--bbg-purple-darker)' },
  en_cours: { fond: 'var(--bbg-green-light)', encre: 'var(--bbg-green-dark)' },
  echu: { fond: '#fce5cd', encre: '#b45f06' },
  recupere: { fond: 'var(--bbg-blue-light)', encre: 'var(--bbg-blue-dark)' },
};

/**
 * Le registre des placements : où l'argent de la société est placé, combien,
 * pour combien de temps, à quel taux, ce qu'il doit rapporter et ce qui en est
 * sûr — et son contrat, joint à la ligne. Une page autonome pour l'instant :
 * elle ne pèse encore sur aucun autre écran, les versements et les retours
 * restant des mouvements de Trésorerie.
 */
export function PlacementsPage() {
  const placements = useStore(s => s.placements) ?? AUCUN_PLACEMENT;
  const addPlacement = useStore(s => s.addPlacement);
  const updatePlacement = useStore(s => s.updatePlacement);
  const aujourdhui = todayISO();

  const resume = useMemo(() => resumePlacements(placements, aujourdhui), [placements, aujourdhui]);
  const lignes = useMemo(() => [...placements].sort((a, b) =>
    a.debut.localeCompare(b.debut) || a.etablissement.localeCompare(b.etablissement, 'fr')),
  [placements]);
  /** Les établissements déjà saisis, proposés à la frappe. */
  const etablissements = useMemo(() =>
    [...new Set(placements.map(p => p.etablissement.trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr')), [placements]);

  function ajouter() {
    addPlacement({
      etablissement: '', produit: 'compte_a_terme', libelle: '',
      montant: 0, debut: aujourdhui, dureeMois: 12, taux: 0,
      remunerationSaisie: null, garantie: 'tout', notes: '',
    });
  }

  /**
   * Un fichier lâché sur une ligne devient le contrat du placement. Un seul
   * contrat par placement : s'il y en a déjà un, on demande avant de le
   * remplacer, et du lot déposé seul le premier fichier est gardé.
   */
  async function deposerContrat(p: Placement, files: File[]) {
    const [fichier] = files;
    if (p.contratFileId) {
      if (!confirm(`Ce placement a déjà un contrat (« ${p.contrat || 'sans nom'} »). Le remplacer par « ${fichier.name} » ?`)) return;
      await deleteFile(p.contratFileId);
    }
    const stocke = await saveFile(fichier);
    updatePlacement(p.id, { contratFileId: stocke.id, contrat: fichier.name });
    toast(`« ${fichier.name} » joint comme contrat${files.length > 1
      ? ` — un seul contrat par placement, les ${files.length - 1} autre(s) fichier(s) sont ignorés` : ''}.`);
  }

  const pourcent = (v: number) =>
    `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
  const prochaine = resume.prochaine;

  return (
    <div className="p-4 pb-28 w-full">
      <PageHeader
        title="Placements"
        subtitle="Où l'argent de la société est placé, pour combien de temps, et ce qu'il doit rapporter"
        actions={
          <Btn variant="primary" onClick={ajouter}>
            <span className="inline-flex items-center gap-1"><Plus size={14} /> Ajouter un placement</span>
          </Btn>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Encours placé" value={euros(resume.encours)}
          sub={`${resume.nbPlaces} placement${resume.nbPlaces > 1 ? 's' : ''}${resume.echus.length
            ? `, dont ${resume.echus.length} échu${resume.echus.length > 1 ? 's' : ''}` : ''} · capital sûr ${euros(resume.capitalSur)}`}
        />
        <StatCard
          label="Rémunération attendue" value={euros(resume.remuneration)} tone="good"
          sub={`dont ${euros(resume.remunerationSure)} sûrs${resume.gainsRealises != null
            ? ` · déjà gagné ${euros(resume.gainsRealises)}` : ''}`}
        />
        <StatCard
          label="Taux moyen" value={pourcent(resume.tauxMoyen)} tone="accent"
          sub="pondéré par les montants, hors placements récupérés"
        />
        <StatCard
          label="Prochaine échéance"
          value={prochaine ? formatDateFR(prochaine.fin) : '—'}
          sub={prochaine
            ? `${prochaine.p.etablissement || 'sans établissement'} · ${euros(prochaine.p.montant)}`
            : 'aucune échéance à venir'}
        />
      </div>

      {resume.echus.length > 0 && (
        <div className="mb-4 px-4 py-2 rounded-md border text-sm"
          style={{ backgroundColor: '#fce5cd', borderColor: '#f9cb9c', color: '#b45f06' }}>
          <b>{resume.echus.length} placement{resume.echus.length > 1 ? 's' : ''} arrivé{resume.echus.length > 1 ? 's' : ''} à échéance</b>
          {' '}— {resume.echus.map(p => `${p.etablissement || 'sans établissement'} (${euros(p.montant)})`).join(', ')}.
          {' '}Une fois l'argent revenu, note la date et le montant dans les colonnes « Récupéré »,
          et enregistre le retour en Trésorerie.
        </div>
      )}

      <Card title={`Registre des placements${placements.length ? ` — ${placements.length}` : ''}`}>
        {lignes.length ? (
          <div className="overflow-x-auto -mx-4 px-4">
            <datalist id="placements-etablissements">
              {etablissements.map(e => <option key={e} value={e} />)}
            </datalist>
            <table data-table="placements" className="sheet text-sm border-collapse"
              style={{ tableLayout: 'fixed', minWidth: LARGEUR_TABLE }}>
              <colgroup>
                {COLONNES.map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr className="text-left">
                  <th title="Banque ou plateforme où l'argent est placé">Établissement</th>
                  <th>Produit</th>
                  <th title="Nom du contrat, référence…">Libellé</th>
                  <th title="Le contrat du placement : glisse le PDF sur la ligne, ou clique sur le trombone">Contrat</th>
                  <th>Placé le</th>
                  <th className="text-right">Montant</th>
                  <th className="text-right" title="En mois — vide pour un placement sans échéance (livret)">Durée (mois)</th>
                  <th>Échéance</th>
                  <th className="text-right" title="Taux annuel brut">Taux (%)</th>
                  <th className="text-right" title="Calculée depuis le taux et la durée ; saisis un montant pour la remplacer">
                    Rémunération attendue
                  </th>
                  <th title="Ce qui est sûr dans ce placement">Ce qui est sûr</th>
                  <th>Statut</th>
                  <th title="Date à laquelle l'argent est revenu">Récupéré le</th>
                  <th className="text-right" title="Montant réellement revenu, intérêts compris">Montant récupéré</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(p => (
                  <LignePlacement key={p.id} p={p} aujourdhui={aujourdhui} onDepot={deposerContrat} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#6f6690' }}>
            Aucun placement noté pour l'instant. Ajoute ici chaque placement de la société : la
            banque ou la plateforme, le montant, la date, la durée, le taux — la rémunération
            attendue se calcule toute seule —, ce qui en est sûr, et joins-y son contrat.
          </p>
        )}
        <p className="text-xs text-[#9a92b5] mt-3">
          <b>Le contrat</b> se joint en glissant le PDF sur la ligne du placement, ou d'un clic sur
          le trombone ; un clic sur l'icône verte l'ouvre. <b>Dupliquer</b> recopie un placement
          — sans son contrat ni sa récupération, qui appartiennent à l'original. La
          <b> rémunération attendue</b> se calcule en intérêts simples — montant × taux annuel ×
          durée — comme pour un dépôt à terme ; sans échéance (un livret), c'est ce que le
          placement rapporte sur un an. Si le contrat prévoit autre chose (taux progressif,
          prime), saisis le montant : il remplace le calcul. Un placement est <b>échu</b> quand
          son échéance est passée sans que l'argent soit noté comme revenu. Ce registre ne pèse
          encore sur aucun autre écran : les versements et les retours d'argent restent des
          mouvements financiers saisis en <b>Trésorerie</b>.
        </p>
      </Card>
    </div>
  );
}

/**
 * Une ligne du registre. Elle accepte qu'on y lâche un fichier, comme une
 * ligne du journal : il devient le contrat du placement.
 */
function LignePlacement({ p, aujourdhui, onDepot }: {
  p: Placement; aujourdhui: string;
  onDepot: (p: Placement, files: File[]) => Promise<void>;
}) {
  const updatePlacement = useStore(s => s.updatePlacement);
  const removePlacement = useStore(s => s.removePlacement);
  const duplicatePlacement = useStore(s => s.duplicatePlacement);
  const [survol, setSurvol] = useState(false);

  const statut = statutPlacement(p, aujourdhui);
  const couleur = COULEUR_STATUT[statut];
  const fin = echeancePlacement(p);
  const calcul = remunerationCalculee(p);
  const gain = gainReel(p);
  const maj = (patch: Partial<Placement>) => updatePlacement(p.id, patch);
  // Les champs libres se valident en quittant la case ; leur clé suit la
  // valeur, pour qu'une annulation (Cmd+Z) se voie aussi dans la case.

  return (
    <tr
      className={`group ${survol ? 'depot-actif' : ''}`}
      title="Glisse le contrat (PDF) sur cette ligne pour l'y joindre"
      onDragOver={ev => {
        if (!transporteDesFichiers(ev)) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
        setSurvol(true);
      }}
      onDragLeave={ev => {
        // Le survol des cellules filles ne doit pas éteindre le surlignage.
        if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setSurvol(false);
      }}
      onDrop={ev => {
        ev.preventDefault();
        ev.stopPropagation();
        setSurvol(false);
        const files = fichiersDeposes(ev);
        if (files.length) void onDepot(p, files);
        else toast('Seuls les PDF et les images (PNG, JPG…) peuvent servir de contrat.', 'info');
      }}
    >
      <td>
        <input key={`e:${p.etablissement}`} className={`${CHAMP} w-40`} list="placements-etablissements"
          defaultValue={p.etablissement} placeholder="Banque…"
          onBlur={ev => ev.target.value !== p.etablissement && maj({ etablissement: ev.target.value.trim() })} />
      </td>
      <td>
        <select className={CHAMP} value={p.produit}
          onChange={ev => maj({ produit: ev.target.value as Placement['produit'] })}>
          {PRODUITS_PLACEMENT.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </td>
      <td>
        <input key={`l:${p.libelle}`} className={`${CHAMP} w-44`} defaultValue={p.libelle} placeholder="DAT 12 mois…"
          onBlur={ev => ev.target.value !== p.libelle && maj({ libelle: ev.target.value })} />
      </td>
      <td>
        {/* Le même champ que la colonne Facture du journal : le nom du fichier,
            le trombone pour joindre, l'icône verte pour ouvrir, la croix pour détacher. */}
        <FactureCell
          nom={p.contrat ?? ''}
          fileId={p.contratFileId}
          onNom={v => maj({ contrat: v })}
          onFileId={(id, nom) => maj({ contratFileId: id, contrat: id ? (nom ?? p.contrat) : '' })}
        />
      </td>
      <td>
        <input type="date" className={CHAMP} value={p.debut}
          onChange={ev => ev.target.value && maj({ debut: ev.target.value })} />
      </td>
      <td className="text-right">
        <MoneyInput value={p.montant} className="w-28"
          onCommit={v => maj({ montant: v ?? 0 })} />
      </td>
      <td className="text-right">
        <MoneyInput value={p.dureeMois} placeholder="—"
          onCommit={v => maj({ dureeMois: v == null || v <= 0 ? null : Math.round(v) })} />
      </td>
      <td className="whitespace-nowrap tabular-nums">
        {fin ? formatDateFR(fin)
          : <span className="text-xs italic" style={{ color: '#9a92b5' }}>sans échéance</span>}
      </td>
      <td className="text-right">
        <TauxInput value={p.taux} onCommit={v => maj({ taux: v })} />
      </td>
      <td className="text-right whitespace-nowrap">
        {/* Vide : le calcul s'affiche en gris. Saisi : il remplace le calcul,
            et la petite flèche y revient. */}
        <MoneyInput value={p.remunerationSaisie} className="w-28"
          placeholder={String(r2(calcul)).replace('.', ',')}
          onCommit={v => maj({ remunerationSaisie: v })} />
        <div className="text-[10px] mt-0.5" style={{ color: '#9a92b5' }}>
          {p.remunerationSaisie == null
            ? `calculée${fin ? '' : ' · par an'}`
            : (
              <button type="button" className="inline-flex items-center gap-0.5 hover:underline"
                title={`Revenir au calcul : ${euros(calcul)}`}
                onClick={() => maj({ remunerationSaisie: null })}>
                saisie · <RotateCcw size={9} /> calcul
              </button>
            )}
        </div>
      </td>
      <td>
        <select className={CHAMP} value={p.garantie}
          title={GARANTIES_PLACEMENT.find(g => g.value === p.garantie)?.aide}
          onChange={ev => maj({ garantie: ev.target.value as Placement['garantie'] })}>
          {GARANTIES_PLACEMENT.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </td>
      <td>
        <span className="text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap"
          style={{ backgroundColor: couleur.fond, color: couleur.encre }}>
          {LIBELLE_STATUT[statut]}
        </span>
      </td>
      <td>
        <input type="date" className={CHAMP} value={p.recupereLe ?? ''}
          onChange={ev => maj({ recupereLe: ev.target.value || undefined })} />
      </td>
      <td className="text-right whitespace-nowrap">
        <MoneyInput value={p.montantRecupere ?? null} className="w-28"
          onCommit={v => maj({ montantRecupere: v })} />
        {gain != null && (
          <div className="text-[10px] mt-0.5 font-semibold"
            style={{ color: gain >= 0 ? 'var(--bbg-green-dark)' : '#b7332e' }}>
            {gain >= 0 ? '+' : ''}{euros(gain)} de {gain >= 0 ? 'gain' : 'perte'}
          </div>
        )}
      </td>
      <td>
        <input key={`n:${p.notes ?? ''}`} className={`${CHAMP} w-48`} defaultValue={p.notes ?? ''}
          onBlur={ev => ev.target.value !== (p.notes ?? '') && maj({ notes: ev.target.value })} />
      </td>
      <td className="whitespace-nowrap">
        <button
          className="mr-1.5 opacity-40 group-hover:opacity-100 hover:text-[#674ea7]"
          style={{ color: 'var(--bbg-purple-darker)' }}
          title="Dupliquer ce placement (sans son contrat ni sa récupération)"
          onClick={() => {
            duplicatePlacement(p.id);
            toast(`« ${p.libelle || p.etablissement || 'Placement'} » dupliqué — le contrat et la récupération ne sont pas recopiés.`);
          }}>
          <CopyPlus size={14} />
        </button>
        <button className="text-[#d98b86] hover:text-[#b7332e] opacity-0 group-hover:opacity-100"
          title="Supprimer ce placement"
          onClick={() => {
            if (confirm(`Supprimer le placement « ${p.libelle || p.etablissement || 'sans nom'} » ?`)) {
              removePlacement(p.id);
            }
          }}>
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
