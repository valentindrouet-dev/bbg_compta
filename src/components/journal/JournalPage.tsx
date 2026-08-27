import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import {
  Plus, Copy, Trash2, AlertTriangle, Search, ClipboardPaste, X, CopyPlus, FileDown,
} from 'lucide-react';
import { useStore } from '../../store';
import type { JournalEntry } from '../../types';
import {
  EXERCICES, moisExercice, labelMois, labelMoisLong, moisCourant, exerciceDuMois, PRE_IMMAT,
} from '../../utils/dates';
import { euros, r2, tvaDepuisTTC } from '../../utils/money';
import { sumTTH, sumParCategorie } from '../../utils/calc';
import {
  PageHeader, Card, MonthTabs, Btn, useSort, sortBy, ThSort, BlocColorMenu, TotalBloc,
  styleBloc, type SortState,
} from '../ui';
import { teinteBloc, type BlocCle } from '../../utils/blocs';
import { DateCell, MoneyCell, AutoCompleteCell, FactureCell, ColFormatMenu, colStyle } from './cells';
import type { ColFormat } from '../../store';
import { saveFile, deleteFile } from '../../utils/files';
import { fichiersDeposes, transporteDesFichiers, libelleDepuisNom, fournisseurDepuisNom } from '../../utils/depot';
import { useCibleLigne, type Cible } from '../../utils/cible';

type SectionKind = 'depenses' | 'jeux' | 'produits';

/**
 * Largeurs de colonnes en %. Les colonnes de montants (TTC, TVA, HT) sont
 * dimensionnées pour que « 12 345,67 € » tienne en entier — en-tête, ligne
 * courante et ligne de totaux, sans que deux nombres se chevauchent.
 */
const COLS_DEPENSES = [2, 7, 8.5, 12, 9.5, 6.5, 5, 6, 6.5, 6, 7.5, 9, 6, 6.5, 2];
const COLS_PRODUITS = [2, 7.5, 10, 15.5, 11, 7, 5, 6.5, 7, 6.5, 9, 6, 4, 3];
/** La section Jeux intercale une colonne « Jeu » après la catégorie. */
const COLS_JEUX = [2, 6.5, 8.5, 11.5, 9, 6.5, 6.5, 5, 6, 6.5, 5.5, 6.5, 8, 4.5, 5.5, 2];
/** Assez large pour qu'une colonne de montant fasse au moins ~85 px. */
const LARGEUR_MINI = 1400;

export function JournalPage({ cible }: { cible?: Cible }) {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const updateEntries = useStore(s => s.updateEntries);
  const removeEntries = useStore(s => s.removeEntries);
  const duplicateEntries = useStore(s => s.duplicateEntries);
  const pasteInto = useStore(s => s.pasteInto);

  const courant = moisCourant();
  const [exercice, setExercice] = useState(() => {
    const ex = exerciceDuMois(courant);
    return (EXERCICES as readonly string[]).includes(ex) ? ex : '2025-26';
  });
  const moisList = moisExercice(exercice);
  const [mois, setMois] = useState(() => moisList.includes(courant) ? courant : moisList[0]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clip, setClip] = useState<JournalEntry | null>(null);
  const { sort, toggle } = useSort({ key: 'date', dir: 'asc' });

  // Échap : sort du mode collage / vide la sélection
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') { setClip(null); setSelected(new Set()); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Changer de mois remet la sélection à zéro (mais garde le presse-papier)
  useEffect(() => { setSelected(new Set()); }, [mois, exercice]);

  // Arrivée depuis les contrôles comptables : on se place sur le bon mois,
  // on lève le filtre de recherche, puis la ligne visée est mise en évidence.
  useEffect(() => {
    if (!cible) return;
    const e = entries.find(x => x.id === cible.ligne);
    if (!e) return;
    setSearch('');
    const ex = exerciceDuMois(e.mois);
    if ((EXERCICES as readonly string[]).includes(ex)) setExercice(ex);
    setMois(e.mois);
  }, [cible, entries]);
  useCibleLigne(cible);

  const duMois = useMemo(() => {
    const filtre = search.trim().toLowerCase();
    return entries
      .filter(e => e.mois === mois)
      .filter(e => !filtre || [e.fournisseur, e.description, e.categorie, e.motsCles, e.facture, e.compta]
        .some(v => v?.toLowerCase().includes(filtre)));
  }, [entries, mois, search]);

  const tri = (list: JournalEntry[]) => sortBy(list, sort, {
    date: e => e.date,
    fournisseur: e => e.fournisseur,
    description: e => e.description,
    categorie: e => e.categorie,
    ttc: e => e.ttc,
    tva: e => e.tva,
    ht: e => e.ht,
    paiement: e => e.paiement,
    type: e => e.type,
    compta: e => e.compta ?? '',
    motsCles: e => e.motsCles ?? '',
    facture: e => e.facture ?? '',
    jeu: e => e.jeu ?? '',
  });

  const depenses = tri(duMois.filter(e => e.type !== 'produit' && !refs.categoriesJeux.includes(e.categorie)));
  const jeux = tri(duMois.filter(e => e.type !== 'produit' && refs.categoriesJeux.includes(e.categorie)));
  const produits = tri(duMois.filter(e => e.type === 'produit'));

  // Tous les fournisseurs déjà saisis, dédoublonnés et triés — sert à la complétion.
  const fournisseurs = useMemo(() => {
    const noms = new Map<string, string>();
    for (const e of entries) {
      const n = e.fournisseur.trim();
      if (n) noms.set(n.toLowerCase(), n);
    }
    return [...noms.values()].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [entries]);

  const nbParMois = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.mois, (m.get(e.mois) ?? 0) + 1);
    return m;
  }, [entries]);

  function changeExercice(ex: string) {
    setExercice(ex);
    const list = moisExercice(ex);
    setMois(list.includes(courant) ? courant : list[0]);
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll(ids: string[], on: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      for (const id of ids) { if (on) next.add(id); else next.delete(id); }
      return next;
    });
  }

  const selectedIds = [...selected];

  return (
    <div className={`p-4 w-full ${clip ? 'paste-mode' : ''}`}>
      <PageHeader
        title="Journal du mois"
        subtitle={labelMoisLong(mois)}
        actions={
          <>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-2.5" style={{ color: '#9a92b5' }} />
              <input
                className="pl-7 pr-2 py-1.5 border rounded-md text-sm w-48 bg-white"
                style={{ borderColor: 'var(--bbg-border)' }}
                placeholder="Rechercher…"
                value={search}
                onChange={ev => setSearch(ev.target.value)}
              />
            </div>
            <select
              className="border rounded-md px-2 py-1.5 text-sm bg-white font-medium"
              style={{ borderColor: 'var(--bbg-border)', color: 'var(--bbg-purple-darker)' }}
              value={exercice}
              onChange={ev => changeExercice(ev.target.value)}
            >
              {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
            </select>
          </>
        }
      />

      {/* Onglets : un par mois de l'exercice */}
      <MonthTabs
        mois={mois}
        moisList={moisList}
        labelOf={labelMois}
        badgeOf={m => nbParMois.get(m) ?? 0}
        onChange={setMois}
      />

      <ResumeMois depenses={depenses} jeux={jeux} produits={produits} />

      {/* Bandeau mode collage */}
      {clip && (
        <div
          className="mt-3 px-4 py-2 rounded-md border flex flex-wrap items-center gap-3 text-sm"
          style={{ backgroundColor: 'var(--bbg-yellow-light)', borderColor: 'var(--bbg-yellow)', color: 'var(--bbg-yellow-dark)' }}
        >
          <ClipboardPaste size={16} />
          <span>
            Ligne copiée : <b>{clip.fournisseur || '—'} · {clip.description || '—'}</b> ({euros(clip.ttc)} TTC).
            Clique sur une ligne pour y coller son contenu.
          </span>
          <Btn variant="ghost" onClick={() => setClip(null)}>
            <span className="inline-flex items-center gap-1"><X size={13} /> Terminer (Échap)</span>
          </Btn>
        </div>
      )}

      {/* Barre d'actions groupées */}
      {selectedIds.length > 0 && (
        <div
          className="mt-3 px-4 py-2 rounded-md border flex flex-wrap items-center gap-2 text-sm sticky top-2 z-20 shadow-sm"
          style={{ backgroundColor: 'var(--bbg-purple-light)', borderColor: 'var(--bbg-purple)', color: 'var(--bbg-purple-darker)' }}
        >
          <b>{selectedIds.length} ligne{selectedIds.length > 1 ? 's' : ''} sélectionnée{selectedIds.length > 1 ? 's' : ''}</b>
          <span style={{ color: '#7a6fa5' }}>— modifier d'un coup :</span>

          <BatchSelect label="Catégorie" options={[...refs.categoriesDepenses, ...refs.categoriesJeux, ...refs.categoriesProduits]}
            onPick={v => updateEntries(selectedIds, { categorie: v })} />
          <BatchSelect label="Paiement" options={refs.paiements}
            onPick={v => updateEntries(selectedIds, { paiement: v })} />
          <BatchSelect label="Type" options={['charges', 'immo', 'produit']}
            onPick={v => updateEntries(selectedIds, { type: v as JournalEntry['type'] })} />
          <BatchSelect label="Compte" options={refs.planComptable}
            onPick={v => updateEntries(selectedIds, { compta: v })} />
          <BatchSelect label="Déplacer vers" options={moisList} labelOf={labelMois}
            onPick={v => updateEntries(selectedIds, { mois: v })} />

          <Btn onClick={() => { duplicateEntries(selectedIds); setSelected(new Set()); }}>
            <span className="inline-flex items-center gap-1"><CopyPlus size={13} /> Dupliquer</span>
          </Btn>
          <Btn variant="danger" onClick={() => {
            if (confirm(`Supprimer ${selectedIds.length} ligne(s) ?`)) { removeEntries(selectedIds); setSelected(new Set()); }
          }}>
            <span className="inline-flex items-center gap-1"><Trash2 size={13} /> Supprimer</span>
          </Btn>
          <Btn variant="ghost" onClick={() => setSelected(new Set())}>Désélectionner</Btn>
        </div>
      )}

      <div className="space-y-5 mt-4">
        <Section kind="depenses" title="Dépenses" mois={mois} rows={depenses}
          sort={sort} onSort={toggle} selected={selected} onToggleRow={toggleRow} onToggleAll={toggleAll}
          clip={clip} onCopy={setClip} onPaste={pasteInto} fournisseurs={fournisseurs} />
        <Section kind="jeux" title="Dépenses Jeux (développement & droits)" mois={mois} rows={jeux}
          sort={sort} onSort={toggle} selected={selected} onToggleRow={toggleRow} onToggleAll={toggleAll}
          clip={clip} onCopy={setClip} onPaste={pasteInto} fournisseurs={fournisseurs} />
        <Section kind="produits" title="Produits (revenus)" mois={mois} rows={produits}
          sort={sort} onSort={toggle} selected={selected} onToggleRow={toggleRow} onToggleAll={toggleAll}
          clip={clip} onCopy={setClip} onPaste={pasteInto} fournisseurs={fournisseurs} />
      </div>
    </div>
  );
}

/** Petit menu d'action groupée : choisir une valeur l'applique à la sélection. */
function BatchSelect({ label, options, labelOf, onPick }: {
  label: string; options: string[]; labelOf?: (v: string) => string; onPick: (v: string) => void;
}) {
  return (
    <select
      className="border rounded px-1.5 py-1 text-sm bg-white"
      style={{ borderColor: 'var(--bbg-purple)', color: 'var(--bbg-purple-darker)' }}
      value=""
      onChange={ev => { if (ev.target.value) { onPick(ev.target.value); ev.target.value = ''; } }}
    >
      <option value="">{label}…</option>
      {options.map(o => <option key={o} value={o}>{labelOf ? labelOf(o) : o}</option>)}
    </select>
  );
}

// ------------------------------------------------------------ Résumé mois ---

/**
 * Le mois en trois chiffres, lu avant d'ouvrir les tableaux : ce qui est sorti,
 * ce qui est rentré, et ce qu'il en reste. Le gros chiffre est le TTC — c'est
 * lui qui passe sur le compte ; le HT est rappelé dessous, c'est lui qui pèse
 * sur le résultat.
 */
function ResumeMois({ depenses, jeux, produits }: {
  depenses: JournalEntry[]; jeux: JournalEntry[]; produits: JournalEntry[];
}) {
  const somme = (rows: JournalEntry[], champ: 'ttc' | 'ht') =>
    r2(rows.reduce((s, e) => s + e[champ], 0));

  if (!depenses.length && !jeux.length && !produits.length) return null;

  const sortiesTTC = r2(somme(depenses, 'ttc') + somme(jeux, 'ttc'));
  const sortiesHT = r2(somme(depenses, 'ht') + somme(jeux, 'ht'));
  const entreesTTC = somme(produits, 'ttc');
  const entreesHT = somme(produits, 'ht');

  const tuiles = [
    {
      titre: 'Dépenses',
      aide: `Charges et immobilisations (${depenses.length} ligne(s)) + dépenses jeux (${jeux.length})`,
      ttc: sortiesTTC, ht: sortiesHT,
      fond: 'var(--bbg-orange-light)', bord: 'var(--bbg-orange)', encre: 'var(--bbg-orange-dark)',
      detail: jeux.length ? `dont jeux ${euros(somme(jeux, 'ttc'))}` : null,
    },
    {
      titre: 'Recettes',
      aide: `${produits.length} produit(s) sur ce mois`,
      ttc: entreesTTC, ht: entreesHT,
      fond: 'var(--bbg-green-light)', bord: 'var(--bbg-green)', encre: 'var(--bbg-green-dark)',
      detail: null,
    },
    {
      titre: 'Solde du mois',
      aide: 'Recettes moins dépenses, sur les seules lignes de ce mois',
      ttc: r2(entreesTTC - sortiesTTC), ht: r2(entreesHT - sortiesHT),
      fond: entreesTTC >= sortiesTTC ? 'var(--bbg-green-light)' : '#fde3e1',
      bord: entreesTTC >= sortiesTTC ? 'var(--bbg-green)' : '#f3b5b1',
      encre: entreesTTC >= sortiesTTC ? 'var(--bbg-green-dark)' : '#b7332e',
      detail: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
      {tuiles.map(t => (
        <div key={t.titre} className="rounded-lg border px-3 py-2" title={t.aide}
          style={{ backgroundColor: t.fond, borderColor: t.bord }}>
          <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: t.encre }}>
            {t.titre}
          </div>
          <div className="text-xl font-extrabold tabular-nums leading-tight" style={{ color: t.encre }}>
            {euros(t.ttc)} <span className="text-xs font-semibold opacity-70">TTC</span>
          </div>
          <div className="text-xs tabular-nums" style={{ color: '#6f6690' }}>
            {euros(t.ht)} HT{t.detail ? ` · ${t.detail}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Section ---

function Section({
  kind, title, mois, rows, sort, onSort, selected, onToggleRow, onToggleAll, clip, onCopy, onPaste, fournisseurs,
}: {
  kind: SectionKind; title: string; mois: string; rows: JournalEntry[];
  sort: SortState; onSort: (k: string) => void;
  selected: Set<string>; onToggleRow: (id: string) => void; onToggleAll: (ids: string[], on: boolean) => void;
  clip: JournalEntry | null; onCopy: (e: JournalEntry | null) => void;
  onPaste: (targetId: string, source: JournalEntry) => void;
  fournisseurs: string[];
}) {
  const refs = useStore(s => s.referentiels);
  const addEntry = useStore(s => s.addEntry);
  const updateEntry = useStore(s => s.updateEntry);
  const pasteInto = useStore(s => s.pasteInto);
  const formats = useStore(s => s.journalFormats);
  const jeux = useStore(s => s.referentiels.jeux ?? []);
  const setColFormat = useStore(s => s.setColFormat);
  const resetColFormat = useStore(s => s.resetColFormat);
  const couleurs = useStore(s => s.blocCouleurs);
  const [survolZone, setSurvolZone] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // Le journal, la synthèse et le prévisionnel partagent la teinte de chaque bloc.
  const bloc: BlocCle = kind === 'produits' ? 'produits' : kind === 'jeux' ? 'jeux' : 'charges';
  const t = teinteBloc(bloc, couleurs);
  const fmtMenu = (col: string) => (
    <ColFormatMenu
      col={col} format={formats[col]}
      onChange={(patch: ColFormat) => setColFormat(col, patch)}
      onReset={() => resetColFormat(col)}
    />
  );
  const tot = sumTTH(rows);
  const parCat = sumParCategorie(rows);
  const isProduits = kind === 'produits';
  const cols = isProduits ? COLS_PRODUITS : kind === 'jeux' ? COLS_JEUX : COLS_DEPENSES;

  const categories = isProduits ? refs.categoriesProduits
    : kind === 'jeux' ? refs.categoriesJeux
    : refs.categoriesDepenses;

  const ids = rows.map(r => r.id);
  const allSelected = ids.length > 0 && ids.every(id => selected.has(id));
  // Année du mois affiché : l'année n'est rappelée que sur les dates qui en sortent.
  const anneeRef = mois === PRE_IMMAT ? 2025 : Number(mois.slice(0, 4));

  function defaultDate(): string {
    if (mois === PRE_IMMAT) return '2025-08-01';
    const today = new Date().toISOString().slice(0, 10);
    return today.slice(0, 7) === mois ? today : `${mois}-01`;
  }

  function nouvelleLigne(): string {
    return addEntry({
      date: defaultDate(), fournisseur: '', description: '',
      categorie: categories[0] ?? '', ttc: 0, tva: 0, ht: 0,
      paiement: refs.paiements[0] ?? 'CB BBG',
      type: isProduits ? 'produit' : 'charges',
      compta: '', motsCles: '', facture: '', mois,
      // La nouvelle ligne reprend le jeu de la dernière saisie de la section.
      jeu: kind === 'jeux' ? (rows[rows.length - 1]?.jeu ?? '') : undefined,
    });
  }


  function annoncer(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(f => (f === msg ? null : f)), 6000);
  }

  /** Crée une écriture par fichier déposé, avec le justificatif déjà attaché. */
  async function creerDepuisFichiers(files: File[]): Promise<number> {
    for (const f of files) {
      const stocke = await saveFile(f);
      const id = nouvelleLigne();
      updateEntry(id, {
        factureFileId: stocke.id,
        facture: f.name,
        description: libelleDepuisNom(f.name),
        fournisseur: fournisseurDepuisNom(f.name, fournisseurs),
      });
    }
    return files.length;
  }

  /** Dépôt sur une ligne : le premier fichier s'y attache, les autres créent des lignes. */
  async function deposerSurLigne(e: JournalEntry, files: File[]) {
    if (!files.length) return;
    const [premier, ...suite] = files;
    if (e.factureFileId) {
      if (!confirm(`Cette ligne a déjà un justificatif. Le remplacer par « ${premier.name} » ?`)) return;
      await deleteFile(e.factureFileId);
    }
    const stocke = await saveFile(premier);
    updateEntry(e.id, {
      factureFileId: stocke.id,
      facture: premier.name,
      description: e.description || libelleDepuisNom(premier.name),
      fournisseur: e.fournisseur || fournisseurDepuisNom(premier.name, fournisseurs),
    });
    if (suite.length) {
      await creerDepuisFichiers(suite);
      annoncer(`« ${premier.name} » attaché à la ligne ; ${suite.length} autre(s) fichier(s) ont créé autant de lignes.`);
    } else {
      annoncer(`« ${premier.name} » attaché à la ligne.`);
    }
  }

  async function deposerEnNouvellesLignes(ev: DragEvent) {
    ev.preventDefault();
    setSurvolZone(false);
    const files = fichiersDeposes(ev);
    if (!files.length) { annoncer('Aucun PDF ni image dans ce qui a été déposé.'); return; }
    const n = await creerDepuisFichiers(files);
    annoncer(`${n} ligne(s) créée(s) avec leur justificatif.`);
  }

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: t.base }} />
          {title}
          <span style={{ color: '#9a92b5', fontWeight: 400 }}>— {rows.length} ligne{rows.length > 1 ? 's' : ''}</span>
        </span>
      }
      actions={
        <>
          <TotalBloc label="Total HT" valeur={euros(tot.ht)} t={t} />
          <BlocColorMenu bloc={bloc} />
          {clip && (
            <Btn onClick={() => { const id = nouvelleLigne(); onPaste(id, clip); }}>
              <span className="inline-flex items-center gap-1"><ClipboardPaste size={14} /> Coller en nouvelle ligne</span>
            </Btn>
          )}
          <Btn variant="primary" onClick={nouvelleLigne}>
            <span className="inline-flex items-center gap-1"><Plus size={14} /> Ajouter</span>
          </Btn>
        </>
      }
    >
      {flash && (
        <div
          className="mb-2 px-3 py-1.5 rounded-md text-sm border"
          style={{ backgroundColor: 'var(--bbg-green-light)', borderColor: 'var(--bbg-green)', color: '#1c5236' }}
        >
          {flash}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm italic mb-2" style={{ color: '#9a92b5' }}>Aucune écriture ce mois-ci.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table
            data-table={`journal:${kind}`} data-bloc={bloc}
            className="sheet text-[13px]"
            style={{ tableLayout: 'fixed', minWidth: LARGEUR_MINI, ...styleBloc(t) }}
          >
            <colgroup>
              {cols.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="text-center">
                  <input
                    type="checkbox" className="cursor-pointer" title="Tout sélectionner"
                    checked={allSelected}
                    onChange={ev => onToggleAll(ids, ev.target.checked)}
                    style={{ width: 'auto' }}
                  />
                </th>
                <ThSort label="Date" k="date" sort={sort} onToggle={onSort} extra={fmtMenu('date')} />
                <ThSort label="Fournisseur" k="fournisseur" sort={sort} onToggle={onSort} extra={fmtMenu('fournisseur')} />
                <ThSort label="Description" k="description" sort={sort} onToggle={onSort} extra={fmtMenu('description')} />
                <ThSort label="Catégorie" k="categorie" sort={sort} onToggle={onSort} extra={fmtMenu('categorie')} />
                {kind === 'jeux' && <ThSort label="Jeu" k="jeu" sort={sort} onToggle={onSort} extra={fmtMenu('jeu')} />}
                <ThSort label="TTC" k="ttc" sort={sort} onToggle={onSort} className="num" extra={fmtMenu('ttc')} />
                <th>Taux</th>
                <ThSort label="TVA" k="tva" sort={sort} onToggle={onSort} className="num" extra={fmtMenu('tva')} />
                <ThSort label="HT" k="ht" sort={sort} onToggle={onSort} className="num" extra={fmtMenu('ht')} />
                <ThSort label="Paiement" k="paiement" sort={sort} onToggle={onSort} extra={fmtMenu('paiement')} />
                {!isProduits && <ThSort label="Type" k="type" sort={sort} onToggle={onSort} extra={fmtMenu('type')} />}
                <ThSort label="Compta" k="compta" sort={sort} onToggle={onSort} extra={fmtMenu('compta')} />
                <ThSort label="Mots clés" k="motsCles" sort={sort} onToggle={onSort} extra={fmtMenu('motsCles')} />
                <ThSort label="Facture" k="facture" sort={sort} onToggle={onSort} extra={fmtMenu('facture')} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => (
                <Row
                  key={e.id} e={e} kind={kind} categories={categories}
                  isSelected={selected.has(e.id)} onToggleRow={onToggleRow}
                  clip={clip} onCopy={onCopy}
                  onPasteHere={() => clip && pasteInto(e.id, clip)}
                  fournisseurs={fournisseurs} formats={formats} anneeRef={anneeRef}
                  jeux={jeux} onDepot={deposerSurLigne}
                />
              ))}
              {/* En mode collage, une ligne d'accueil est toujours disponible en bas :
                  plus besoin de créer la ligne vide avant de copier. */}
              {clip && (
                <tr
                  className="cursor-copy"
                  onClick={() => { const id = nouvelleLigne(); onPaste(id, clip); }}
                  title="Créer une nouvelle ligne et y coller la ligne copiée"
                >
                  <td
                    colSpan={cols.length}
                    className="text-center py-1.5 font-medium"
                    style={{ backgroundColor: 'var(--bbg-yellow-light)', color: 'var(--bbg-yellow-dark)' }}
                  >
                    + Coller ici, dans une nouvelle ligne
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="total-bloc">
                <td colSpan={kind === 'jeux' ? 6 : 5} className="text-right">TOTAUX</td>
                <td className="text-right tabular-nums">{euros(tot.ttc)}</td>
                <td></td>
                <td className="text-right tabular-nums">{euros(tot.tva)}</td>
                <td className="text-right tabular-nums grand">{euros(tot.ht)}</td>
                <td colSpan={isProduits ? 5 : 6}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Dépôt de factures : sur une ligne pour l'y attacher, ici pour créer
          une ligne par fichier. */}
      <div
        className="mt-2 rounded-md border-2 border-dashed text-center text-xs py-2 px-3 transition-colors"
        style={survolZone
          ? { borderColor: 'var(--bbg-purple-dark)', backgroundColor: 'var(--bbg-purple-light)', color: 'var(--bbg-purple-darker)' }
          : { borderColor: 'var(--bbg-border)', backgroundColor: 'transparent', color: '#9a92b5' }}
        onDragOver={ev => { if (transporteDesFichiers(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; setSurvolZone(true); } }}
        onDragLeave={() => setSurvolZone(false)}
        onDrop={deposerEnNouvellesLignes}
      >
        <span className="inline-flex items-center gap-1.5">
          <FileDown size={13} />
          Glisse des factures (PDF, photos) <b>sur une ligne</b> pour les y attacher,
          ou <b>ici</b> pour créer une ligne par fichier.
        </span>
      </div>

      {parCat.size > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {[...parCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, ht]) => (
            <span
              key={cat} className="text-xs rounded-full px-2.5 py-1"
              style={{
                backgroundColor: t.clair,
                color: t.fonce,
              }}
            >
              {cat} : <b className="tabular-nums">{euros(r2(ht))}</b> HT
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

// -------------------------------------------------------------------- Row ---

const TAUX_CHOICES = [20, 10, 5.5, 0];

/** Déduit le taux affiché à partir des montants stockés. */
function tauxImplique(e: JournalEntry): number | 'manuel' {
  for (const t of TAUX_CHOICES) {
    if (Math.abs(tvaDepuisTTC(e.ttc, t) - e.tva) < 0.011) return t;
  }
  return 'manuel';
}

function Row({ e, kind, categories, isSelected, onToggleRow, clip, onCopy, onPasteHere, fournisseurs, formats, anneeRef, jeux, onDepot }: {
  e: JournalEntry; kind: SectionKind; categories: string[];
  isSelected: boolean; onToggleRow: (id: string) => void;
  clip: JournalEntry | null; onCopy: (e: JournalEntry | null) => void; onPasteHere: () => void;
  fournisseurs: string[]; formats: Record<string, ColFormat>; anneeRef: number; jeux: string[];
  onDepot: (e: JournalEntry, files: File[]) => void | Promise<void>;
}) {
  const update = useStore(s => s.updateEntry);
  const remove = useStore(s => s.removeEntry);
  const refs = useStore(s => s.referentiels);
  const [survol, setSurvol] = useState(false);

  const taux = tauxImplique(e);
  const dateHorsMois = e.mois !== PRE_IMMAT && e.date.slice(0, 7) !== e.mois;
  const isProduits = kind === 'produits';
  const pillCat = isProduits ? 'pill-green' : kind === 'jeux' ? 'pill-yellow' : 'pill-green';
  // Couleur définie dans l'onglet Catégories, sinon la teinte par défaut du bloc.
  const couleurCat = refs.categoriesMeta?.[e.categorie]?.couleur;

  function setTTC(ttc: number | null) {
    const v = ttc ?? 0;
    const t = taux === 'manuel' ? null : taux;
    const tva = t == null ? e.tva : tvaDepuisTTC(v, t);
    update(e.id, { ttc: v, tva: r2(tva), ht: r2(v - tva) });
  }
  function setTaux(t: string) {
    if (t === 'manuel') return;
    const tva = tvaDepuisTTC(e.ttc, Number(t));
    update(e.id, { tva, ht: r2(e.ttc - tva) });
  }
  function setTVA(tva: number | null) {
    const v = tva ?? 0;
    update(e.id, { tva: r2(v), ht: r2(e.ttc - v) });
  }

  return (
    <tr
      data-ligne={e.id}
      className={`group ${isSelected ? 'is-selected' : ''} ${survol ? 'depot-actif' : ''}`}
      onClick={clip ? onPasteHere : undefined}
      title={clip ? 'Cliquer pour coller la ligne copiée ici' : 'Glisse une facture (PDF, image) sur cette ligne pour l\'y attacher'}
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
        if (files.length) void onDepot(e, files);
        else alert('Seuls les PDF et les images (PNG, JPG…) peuvent servir de justificatif.');
      }}
    >
      <td className="text-center">
        <input
          type="checkbox" className="cursor-pointer" style={{ width: 'auto' }}
          checked={isSelected}
          onChange={() => onToggleRow(e.id)}
        />
      </td>
      <td>
        <div className="flex items-center gap-0.5">
          <DateCell
            value={e.date} anneeRef={anneeRef} style={colStyle(formats.date)}
            onCommit={v => update(e.id, { date: v })}
          />
          {dateHorsMois && (
            <span title={`Date hors du mois comptable (${e.mois})`} className="shrink-0">
              <AlertTriangle size={13} style={{ color: 'var(--bbg-orange-dark)' }} />
            </span>
          )}
        </div>
      </td>
      <td>
        <AutoCompleteCell
          value={e.fournisseur} options={fournisseurs} style={colStyle(formats.fournisseur)}
          onCommit={v => update(e.id, { fournisseur: v })}
        />
      </td>
      <td><TextCell value={e.description} onCommit={v => update(e.id, { description: v })} style={colStyle(formats.description)} /></td>
      <td>
        <select
          className={couleurCat ? '' : pillCat}
          style={{ ...colStyle(formats.categorie), ...(couleurCat ? { backgroundColor: couleurCat } : {}) }}
          value={e.categorie} onChange={ev => update(e.id, { categorie: ev.target.value })}>
          {!categories.includes(e.categorie) && e.categorie && <option value={e.categorie}>{e.categorie}</option>}
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      {kind === 'jeux' && (
        <td>
          <select
            className="pill-yellow" style={colStyle(formats.jeu)}
            value={e.jeu ?? ''} onChange={ev => update(e.id, { jeu: ev.target.value })}
          >
            <option value="">— non rattaché —</option>
            {e.jeu && !jeux.includes(e.jeu) && <option value={e.jeu}>{e.jeu}</option>}
            {jeux.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </td>
      )}
      <td><MoneyCell value={e.ttc} onCommit={setTTC} style={colStyle(formats.ttc)} /></td>
      <td>
        <select value={String(taux)} onChange={ev => setTaux(ev.target.value)}>
          {TAUX_CHOICES.map(t => <option key={t} value={t}>{String(t).replace('.', ',')} %</option>)}
          <option value="manuel">manuel</option>
        </select>
      </td>
      <td><MoneyCell value={e.tva} onCommit={setTVA} disabled={taux !== 'manuel'} style={colStyle(formats.tva)} /></td>
      <td
        className="text-right tabular-nums font-semibold pr-1.5"
        style={{ color: 'var(--bbg-purple-darker)', ...colStyle(formats.ht) }}
      >
        {euros(e.ht)}
      </td>
      <td>
        <select style={colStyle(formats.paiement)} value={e.paiement} onChange={ev => update(e.id, { paiement: ev.target.value })}>
          {!refs.paiements.includes(e.paiement) && e.paiement && <option value={e.paiement}>{e.paiement}</option>}
          {refs.paiements.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </td>
      {!isProduits && (
        <td>
          <div className="flex items-center gap-0.5">
            <select
              className={e.type === 'immo' ? 'pill-blue' : 'pill-orange'}
              style={colStyle(formats.type)} value={e.type}
              onChange={ev => update(e.id, { type: ev.target.value as JournalEntry['type'] })}
            >
              <option value="charges">charges</option>
              <option value="immo">immo</option>
            </select>
            {e.type === 'immo' && (
              <select
                className="pill-blue" title="Durée d'amortissement"
                value={e.immoDureeAns ?? 5}
                onChange={ev => update(e.id, { immoDureeAns: Number(ev.target.value) })}
              >
                {[3, 5, 10].map(d => <option key={d} value={d}>{d} ans</option>)}
              </select>
            )}
          </div>
        </td>
      )}
      <td>
        <select className="pill-orange" style={colStyle(formats.compta)} value={e.compta ?? ''} onChange={ev => update(e.id, { compta: ev.target.value })}>
          <option value=""></option>
          {e.compta && !refs.planComptable.includes(e.compta) && <option value={e.compta}>{e.compta}</option>}
          {refs.planComptable.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td><TextCell value={e.motsCles ?? ''} onCommit={v => update(e.id, { motsCles: v })} style={colStyle(formats.motsCles)} /></td>
      <td>
        <FactureCell
          nom={e.facture ?? ''} fileId={e.factureFileId} style={colStyle(formats.facture)}
          onNom={v => update(e.id, { facture: v })}
          onFileId={(id, nom) => update(e.id, {
            factureFileId: id,
            // Le nom du fichier joint remplace le libellé s'il était vide.
            facture: id && nom && !e.facture ? nom : e.facture,
          })}
        />
      </td>
      <td>
        <div className="flex items-center justify-center gap-1">
          {clip ? (
            <button className="shrink-0" title="Coller ici" style={{ color: 'var(--bbg-orange-dark)' }}>
              <ClipboardPaste size={14} />
            </button>
          ) : (
            <>
              <button
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Copier cette ligne, puis cliquer sur la ligne où la coller"
                style={{ color: 'var(--bbg-purple-dark)' }}
                onClick={ev => { ev.stopPropagation(); onCopy(e); }}
              >
                <Copy size={14} />
              </button>
              <button
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[#d98b86] hover:text-red-600"
                title="Supprimer"
                onClick={ev => {
                  ev.stopPropagation();
                  if (confirm(`Supprimer « ${e.description || e.fournisseur} » ?`)) remove(e.id);
                }}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function TextCell({ value, onCommit, style }: {
  value: string; onCommit: (v: string) => void; style?: CSSProperties;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      value={text ?? value}
      title={value}
      style={style}
      onChange={ev => setText(ev.target.value)}
      onBlur={() => { if (text !== null) { onCommit(text); setText(null); } }}
      onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
    />
  );
}
