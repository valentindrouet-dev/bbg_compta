import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Plus, Copy, Trash2, AlertTriangle, Search, ClipboardPaste, X, CopyPlus,
} from 'lucide-react';
import { useStore } from '../../store';
import type { JournalEntry } from '../../types';
import {
  EXERCICES, moisExercice, labelMois, labelMoisLong, moisCourant, exerciceDuMois, PRE_IMMAT,
} from '../../utils/dates';
import { euros, r2, tvaDepuisTTC } from '../../utils/money';
import { sumTTH, sumParCategorie } from '../../utils/calc';
import { PageHeader, Card, MonthTabs, Btn, useSort, sortBy, ThSort, type SortState } from '../ui';
import { DateCell, MoneyCell, AutoCompleteCell, FactureCell, ColFormatMenu, colStyle } from './cells';
import type { ColFormat } from '../../store';

type SectionKind = 'depenses' | 'jeux' | 'produits';

/** Largeurs de colonnes en % : tout doit tenir à l'écran, sans coupure. */
const COLS_DEPENSES = [2, 7.5, 9, 12.5, 10.5, 5, 5, 5, 5.5, 6, 8.5, 9, 5.5, 7, 2];
const COLS_PRODUITS = [2, 8, 11, 15, 12.5, 6, 5.5, 6, 6.5, 7, 9, 5, 4, 2.5];

export function JournalPage() {
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
  const pasteInto = useStore(s => s.pasteInto);
  const formats = useStore(s => s.journalFormats);
  const setColFormat = useStore(s => s.setColFormat);
  const resetColFormat = useStore(s => s.resetColFormat);
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
  const cols = isProduits ? COLS_PRODUITS : COLS_DEPENSES;

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
    });
  }

  const bandeau = kind === 'produits' ? 'var(--bbg-green)'
    : kind === 'jeux' ? 'var(--bbg-yellow)' : 'var(--bbg-orange)';

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: bandeau }} />
          {title}
          <span style={{ color: '#9a92b5', fontWeight: 400 }}>— {rows.length} ligne{rows.length > 1 ? 's' : ''}</span>
        </span>
      }
      actions={
        <>
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
      {rows.length === 0 ? (
        <p className="text-sm italic" style={{ color: '#9a92b5' }}>Aucune écriture ce mois-ci.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table
            className={`sheet text-[13px] ${kind === 'jeux' ? 'sheet-jeux' : kind === 'produits' ? 'sheet-produits' : ''}`}
            style={{ tableLayout: 'fixed', minWidth: 1150 }}
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
                />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="text-right">Totaux</td>
                <td className="text-right tabular-nums">{euros(tot.ttc)}</td>
                <td></td>
                <td className="text-right tabular-nums">{euros(tot.tva)}</td>
                <td className="text-right tabular-nums">{euros(tot.ht)}</td>
                <td colSpan={isProduits ? 5 : 6}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {parCat.size > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {[...parCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, ht]) => (
            <span
              key={cat} className="text-xs rounded-full px-2.5 py-1"
              style={{
                backgroundColor: isProduits ? 'var(--bbg-green-light)'
                  : kind === 'jeux' ? 'var(--bbg-yellow-light)' : 'var(--bbg-orange-light)',
                color: '#4a4363',
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

function Row({ e, kind, categories, isSelected, onToggleRow, clip, onCopy, onPasteHere, fournisseurs, formats, anneeRef }: {
  e: JournalEntry; kind: SectionKind; categories: string[];
  isSelected: boolean; onToggleRow: (id: string) => void;
  clip: JournalEntry | null; onCopy: (e: JournalEntry | null) => void; onPasteHere: () => void;
  fournisseurs: string[]; formats: Record<string, ColFormat>; anneeRef: number;
}) {
  const update = useStore(s => s.updateEntry);
  const remove = useStore(s => s.removeEntry);
  const refs = useStore(s => s.referentiels);

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
      className={`group ${isSelected ? 'is-selected' : ''}`}
      onClick={clip ? onPasteHere : undefined}
      title={clip ? 'Cliquer pour coller la ligne copiée ici' : undefined}
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
              className="pill-orange" style={colStyle(formats.type)} value={e.type}
              onChange={ev => update(e.id, { type: ev.target.value as JournalEntry['type'] })}
            >
              <option value="charges">charges</option>
              <option value="immo">immo</option>
            </select>
            {e.type === 'immo' && (
              <select
                className="pill-orange" title="Durée d'amortissement"
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
