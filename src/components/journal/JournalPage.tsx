import { useMemo, useState } from 'react';
import { Plus, Copy, Trash2, AlertTriangle, Search } from 'lucide-react';
import { useStore } from '../../store';
import type { JournalEntry } from '../../types';
import { EXERCICES, moisExercice, labelMois, labelMoisLong, moisCourant, exerciceDuMois, PRE_IMMAT } from '../../utils/dates';
import { euros, r2, tvaDepuisTTC } from '../../utils/money';
import { sumTTH, sumParCategorie } from '../../utils/calc';
import { PageHeader, Card, MonthNav, MoneyInput, Btn } from '../ui';

type SectionKind = 'depenses' | 'jeux' | 'produits';

export function JournalPage() {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const courant = moisCourant();
  const [exercice, setExercice] = useState(() => {
    const ex = exerciceDuMois(courant);
    return (EXERCICES as readonly string[]).includes(ex) ? ex : '2025-26';
  });
  const moisList = moisExercice(exercice);
  const [mois, setMois] = useState(() => moisList.includes(courant) ? courant : moisList[0]);
  const [search, setSearch] = useState('');

  const duMois = useMemo(() => {
    const filtre = search.trim().toLowerCase();
    return entries
      .filter(e => e.mois === mois)
      .filter(e => !filtre || [e.fournisseur, e.description, e.categorie, e.motsCles, e.facture, e.compta]
        .some(v => v?.toLowerCase().includes(filtre)))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, mois, search]);

  const depenses = duMois.filter(e => e.type !== 'produit' && !refs.categoriesJeux.includes(e.categorie));
  const jeux = duMois.filter(e => e.type !== 'produit' && refs.categoriesJeux.includes(e.categorie));
  const produits = duMois.filter(e => e.type === 'produit');

  function changeExercice(ex: string) {
    setExercice(ex);
    const list = moisExercice(ex);
    setMois(list.includes(courant) ? courant : list[0]);
  }

  return (
    <div className="p-6 max-w-[1500px]">
      <PageHeader
        title="Journal du mois"
        subtitle={labelMoisLong(mois)}
        actions={
          <>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
              <input
                className="pl-7 pr-2 py-1.5 border border-gray-300 rounded-md text-sm w-48"
                placeholder="Rechercher…"
                value={search}
                onChange={ev => setSearch(ev.target.value)}
              />
            </div>
            <select
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
              value={exercice}
              onChange={ev => changeExercice(ev.target.value)}
            >
              {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
            </select>
            <MonthNav mois={mois} moisList={moisList} labelOf={labelMois} onChange={setMois} />
          </>
        }
      />

      <div className="space-y-6">
        <Section kind="depenses" title="Dépenses" mois={mois} rows={depenses} />
        <Section kind="jeux" title="Dépenses Jeux (développement & droits)" mois={mois} rows={jeux} />
        <Section kind="produits" title="Produits (revenus)" mois={mois} rows={produits} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Section ---

function Section({ kind, title, mois, rows }: {
  kind: SectionKind; title: string; mois: string; rows: JournalEntry[];
}) {
  const refs = useStore(s => s.referentiels);
  const addEntry = useStore(s => s.addEntry);
  const tot = sumTTH(rows);
  const parCat = sumParCategorie(rows);

  const categories = kind === 'produits' ? refs.categoriesProduits
    : kind === 'jeux' ? refs.categoriesJeux
    : refs.categoriesDepenses;

  function defaultDate(): string {
    if (mois === PRE_IMMAT) return '2025-08-01';
    const today = new Date().toISOString().slice(0, 10);
    return today.slice(0, 7) === mois ? today : `${mois}-01`;
  }

  function handleAdd() {
    addEntry({
      date: defaultDate(), fournisseur: '', description: '',
      categorie: categories[0] ?? '', ttc: 0, tva: 0, ht: 0,
      paiement: refs.paiements[0] ?? 'CB BBG',
      type: kind === 'produits' ? 'produit' : 'charges',
      compta: '', motsCles: '', facture: '', mois,
    });
  }

  return (
    <Card
      title={<span>{title} <span className="text-gray-400 font-normal">— {rows.length} ligne{rows.length > 1 ? 's' : ''}</span></span>}
      actions={<Btn variant="primary" onClick={handleAdd}><span className="inline-flex items-center gap-1"><Plus size={14} /> Ajouter</span></Btn>}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Aucune écriture ce mois-ci.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-gray-600">
                <th>Date</th><th>Fournisseur</th><th>Description</th><th>Catégorie</th>
                <th className="text-right">TTC</th><th>Taux</th><th className="text-right">TVA</th>
                <th className="text-right">HT</th><th>Paiement</th>
                {kind !== 'produits' && <th>Type</th>}
                <th>Compta</th><th>Mots clés</th><th>Facture</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => <Row key={e.id} e={e} kind={kind} categories={categories} />)}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-yellow-50">
                <td colSpan={4} className="text-right">Totaux</td>
                <td className="text-right tabular-nums">{euros(tot.ttc)}</td>
                <td></td>
                <td className="text-right tabular-nums">{euros(tot.tva)}</td>
                <td className="text-right tabular-nums">{euros(tot.ht)}</td>
                <td colSpan={kind !== 'produits' ? 6 : 5}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {parCat.size > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {[...parCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, ht]) => (
            <span key={cat} className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">
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

function Row({ e, kind, categories }: { e: JournalEntry; kind: SectionKind; categories: string[] }) {
  const update = useStore(s => s.updateEntry);
  const remove = useStore(s => s.removeEntry);
  const duplicate = useStore(s => s.duplicateEntry);
  const refs = useStore(s => s.referentiels);

  const taux = tauxImplique(e);
  const dateHorsMois = e.mois !== PRE_IMMAT && e.date.slice(0, 7) !== e.mois;

  function setTTC(ttc: number | null) {
    const v = ttc ?? 0;
    const t = taux === 'manuel' ? null : taux;
    const tva = t == null ? e.tva : tvaDepuisTTC(v, t);
    update(e.id, { ttc: v, tva: r2(tva), ht: r2(v - tva) });
  }
  function setTaux(t: string) {
    if (t === 'manuel') return; // la TVA devient éditable, montants inchangés
    const taux = Number(t);
    const tva = tvaDepuisTTC(e.ttc, taux);
    update(e.id, { tva, ht: r2(e.ttc - tva) });
  }
  function setTVA(tva: number | null) {
    const v = tva ?? 0;
    update(e.id, { tva: r2(v), ht: r2(e.ttc - v) });
  }

  return (
    <tr className="hover:bg-yellow-50/40 group">
      <td>
        <div className="flex items-center gap-1">
          <input
            type="date"
            className="border border-gray-200 rounded px-1 py-0.5 text-sm"
            value={e.date}
            onChange={ev => ev.target.value && update(e.id, { date: ev.target.value })}
          />
          {dateHorsMois && (
            <span title={`Date hors du mois comptable (${e.mois})`}>
              <AlertTriangle size={14} className="text-amber-500" />
            </span>
          )}
        </div>
      </td>
      <td><TextCell value={e.fournisseur} onCommit={v => update(e.id, { fournisseur: v })} width="w-32" /></td>
      <td><TextCell value={e.description} onCommit={v => update(e.id, { description: v })} width="w-48" /></td>
      <td>
        <select
          className="border border-gray-200 rounded px-1 py-1 text-sm max-w-44 bg-white"
          value={e.categorie}
          onChange={ev => update(e.id, { categorie: ev.target.value })}
        >
          {!categories.includes(e.categorie) && e.categorie && <option value={e.categorie}>{e.categorie}</option>}
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="text-right"><MoneyInput value={e.ttc} onCommit={setTTC} /></td>
      <td>
        <select
          className="border border-gray-200 rounded px-1 py-1 text-sm bg-white"
          value={String(taux)}
          onChange={ev => setTaux(ev.target.value)}
        >
          {TAUX_CHOICES.map(t => <option key={t} value={t}>{String(t).replace('.', ',')} %</option>)}
          <option value="manuel">manuel</option>
        </select>
      </td>
      <td className="text-right">
        <MoneyInput value={e.tva} onCommit={setTVA} className="w-20" disabled={taux !== 'manuel'} />
      </td>
      <td className="text-right tabular-nums font-medium">{euros(e.ht)}</td>
      <td>
        <select
          className="border border-gray-200 rounded px-1 py-1 text-sm bg-white"
          value={e.paiement}
          onChange={ev => update(e.id, { paiement: ev.target.value })}
        >
          {!refs.paiements.includes(e.paiement) && e.paiement && <option value={e.paiement}>{e.paiement}</option>}
          {refs.paiements.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </td>
      {kind !== 'produits' && (
        <td>
          <div className="flex items-center gap-1">
            <select
              className="border border-gray-200 rounded px-1 py-1 text-sm bg-white"
              value={e.type}
              onChange={ev => update(e.id, { type: ev.target.value as JournalEntry['type'] })}
            >
              <option value="charges">charges</option>
              <option value="immo">immo</option>
            </select>
            {e.type === 'immo' && (
              <select
                className="border border-gray-200 rounded px-1 py-1 text-sm bg-white"
                title="Durée d'amortissement"
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
        <select
          className="border border-gray-200 rounded px-1 py-1 text-sm max-w-40 bg-white"
          value={e.compta ?? ''}
          onChange={ev => update(e.id, { compta: ev.target.value })}
        >
          <option value=""></option>
          {e.compta && !refs.planComptable.includes(e.compta) && <option value={e.compta}>{e.compta}</option>}
          {refs.planComptable.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td><TextCell value={e.motsCles ?? ''} onCommit={v => update(e.id, { motsCles: v })} width="w-24" /></td>
      <td><TextCell value={e.facture ?? ''} onCommit={v => update(e.id, { facture: v })} width="w-40" /></td>
      <td>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="text-gray-400 hover:text-gray-700" title="Dupliquer" onClick={() => duplicate(e.id)}>
            <Copy size={14} />
          </button>
          <button
            className="text-red-400 hover:text-red-600" title="Supprimer"
            onClick={() => { if (confirm(`Supprimer « ${e.description || e.fournisseur} » ?`)) remove(e.id); }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function TextCell({ value, onCommit, width }: { value: string; onCommit: (v: string) => void; width: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className={`border border-gray-200 rounded px-1.5 py-1 text-sm ${width}`}
      value={text ?? value}
      onChange={ev => setText(ev.target.value)}
      onBlur={() => { if (text !== null) { onCommit(text); setText(null); } }}
      onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
    />
  );
}
