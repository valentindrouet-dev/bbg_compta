import { useMemo, useState } from 'react';
import { Plus, Trash2, Merge, FolderPlus } from 'lucide-react';
import { useStore, type CatKind } from '../../store';
import { natureCategorie } from '../../utils/blocs';
import { euros, r2 } from '../../utils/money';
import { PageHeader, Card, Btn, StatCard, useSort, sortBy, ThSort } from '../ui';

/** Palette pastel (celle des tableurs) proposée pour colorer les catégories. */
export const COULEURS_PASTEL = [
  '#d9d2e9', '#cfe2f3', '#d9ead3', '#fff2cc', '#fce5cd', '#f4cccc',
  '#d0e0e3', '#ead1dc', '#b7e1cd', '#f9cb9c', '#b4a7d6', '#9fc5e8',
  '#ffe599', '#d5a6bd', '#a2c4c9', '#e6b8af',
];

const KIND_LABEL: Record<CatKind, string> = {
  categoriesDepenses: 'Dépense',
  categoriesJeux: 'Jeux',
  categoriesProduits: 'Produit',
};

interface LigneCat {
  nom: string;
  kind: CatKind;
  couleur: string;
  groupe: string;
  /** À l'actif, en charges, ou décidé ligne par ligne. */
  nature: 'immo' | 'charge' | 'auto';
  dureeAns?: number;
  nb: number;
  total: number;
}

export function CategoriesPage() {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const addCategorie = useStore(s => s.addCategorie);
  const renameCategorie = useStore(s => s.renameCategorie);
  const setCategorieMeta = useStore(s => s.setCategorieMeta);
  const moveCategories = useStore(s => s.moveCategories);
  const mergeCategories = useStore(s => s.mergeCategories);
  const removeCategories = useStore(s => s.removeCategories);
  const setGroupes = useStore(s => s.setGroupes);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [nouvelle, setNouvelle] = useState('');
  const [nouveauKind, setNouveauKind] = useState<CatKind>('categoriesDepenses');
  const [nouveauGroupe, setNouveauGroupe] = useState('');
  const { sort, toggle } = useSort({ key: 'total', dir: 'desc' }, 'categories');

  const meta = refs.categoriesMeta ?? {};
  const groupes = refs.groupes ?? [];

  const lignes = useMemo<LigneCat[]>(() => {
    const stats = new Map<string, { nb: number; total: number }>();
    for (const e of entries) {
      const s = stats.get(e.categorie) ?? { nb: 0, total: 0 };
      s.nb++; s.total += e.ttc;
      stats.set(e.categorie, s);
    }
    const out: LigneCat[] = [];
    (Object.keys(KIND_LABEL) as CatKind[]).forEach(kind => {
      for (const nom of refs[kind]) {
        const s = stats.get(nom);
        out.push({
          nom, kind,
          couleur: meta[nom]?.couleur ?? '',
          groupe: meta[nom]?.groupe ?? '',
          nature: natureCategorie(nom, refs),
          dureeAns: meta[nom]?.dureeAns,
          nb: s?.nb ?? 0, total: r2(s?.total ?? 0),
        });
      }
    });
    return out;
  }, [entries, refs, meta]);

  const rows = sortBy(lignes, sort, {
    nom: l => l.nom, kind: l => KIND_LABEL[l.kind], groupe: l => l.groupe,
    nb: l => l.nb, total: l => l.total,
  });

  const sel = [...selection];
  const inutilisees = sel.filter(n => !lignes.find(l => l.nom === n)?.nb);

  function toggleSel(nom: string) {
    setSelection(prev => {
      const n = new Set(prev);
      if (n.has(nom)) n.delete(nom); else n.add(nom);
      return n;
    });
  }

  function ajouterGroupe() {
    const g = nouveauGroupe.trim();
    if (!g || groupes.includes(g)) return;
    setGroupes([...groupes, g]);
    if (sel.length) setCategorieMeta(sel, { groupe: g });
    setNouveauGroupe('');
  }

  return (
    <div className="p-4 w-full max-w-[1400px]">
      <PageHeader
        title="Catégories"
        subtitle="Renommer, colorer, regrouper — les écritures suivent automatiquement"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Catégories" value={String(lignes.length)} />
        <StatCard label="Dépenses" value={String(refs.categoriesDepenses.length)} tone="accent" />
        <StatCard label="Jeux" value={String(refs.categoriesJeux.length)} tone="accent" />
        <StatCard label="Produits" value={String(refs.categoriesProduits.length)} tone="good" />
      </div>

      {/* Barre d'actions groupées */}
      {sel.length > 0 && (
        <div
          className="mb-4 px-4 py-2.5 rounded-md border flex flex-wrap items-center gap-2 text-sm sticky top-2 z-20 shadow-sm"
          style={{ backgroundColor: 'var(--bbg-purple-light)', borderColor: 'var(--bbg-purple)', color: 'var(--bbg-purple-darker)' }}
        >
          <b>{sel.length} catégorie{sel.length > 1 ? 's' : ''} sélectionnée{sel.length > 1 ? 's' : ''}</b>

          <span className="ml-2">Couleur :</span>
          <div className="flex flex-wrap gap-1">
            {COULEURS_PASTEL.map(c => (
              <button
                key={c} title={c} className="w-5 h-5 rounded border"
                style={{ backgroundColor: c, borderColor: 'var(--bbg-border)' }}
                onClick={() => setCategorieMeta(sel, { couleur: c })}
              />
            ))}
            <button
              className="w-5 h-5 rounded border text-[10px]" title="Aucune couleur"
              style={{ borderColor: 'var(--bbg-border)', background: '#fff', color: '#9a92b5' }}
              onClick={() => setCategorieMeta(sel, { couleur: '' })}
            >✕</button>
          </div>

          <select
            className="border rounded px-1.5 py-1 text-sm bg-white"
            style={{ borderColor: 'var(--bbg-purple)' }}
            value="" onChange={ev => { if (ev.target.value) setCategorieMeta(sel, { groupe: ev.target.value === '__vide' ? '' : ev.target.value }); ev.target.value = ''; }}
          >
            <option value="">Groupe…</option>
            <option value="__vide">— sans groupe —</option>
            {groupes.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <select
            className="border rounded px-1.5 py-1 text-sm bg-white"
            style={{ borderColor: 'var(--bbg-purple)' }}
            value=""
            title="Ces dépenses pèsent-elles d'un coup sur le résultat, ou s'amortissent-elles ?"
            onChange={ev => {
              if (ev.target.value === 'immo') setCategorieMeta(sel, { immobilisee: true, dureeAns: 5 });
              if (ev.target.value === 'charge') setCategorieMeta(sel, { immobilisee: false });
              if (ev.target.value === 'auto') setCategorieMeta(sel, { immobilisee: undefined });
              ev.target.value = '';
            }}
          >
            <option value="">Nature…</option>
            <option value="auto">au cas par cas</option>
            <option value="charge">tout en charges</option>
            <option value="immo">tout à l'actif (5 ans)</option>
          </select>

          <select
            className="border rounded px-1.5 py-1 text-sm bg-white"
            style={{ borderColor: 'var(--bbg-purple)' }}
            value="" onChange={ev => { if (ev.target.value) moveCategories(sel, ev.target.value as CatKind); ev.target.value = ''; }}
          >
            <option value="">Type…</option>
            {(Object.keys(KIND_LABEL) as CatKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>

          {sel.length > 1 && (
            <Btn onClick={() => {
              const cible = prompt(`Fusionner ces ${sel.length} catégories dans laquelle ?\n\n${sel.join('\n')}`, sel[0]);
              if (cible && sel.includes(cible)) { mergeCategories(sel, cible); setSelection(new Set([cible])); }
              else if (cible) alert('Choisis une des catégories sélectionnées.');
            }}>
              <span className="inline-flex items-center gap-1"><Merge size={13} /> Fusionner</span>
            </Btn>
          )}

          <Btn variant="danger" disabled={!inutilisees.length}
            title={inutilisees.length ? `${inutilisees.length} catégorie(s) sans écriture` : 'Toutes les catégories sélectionnées sont utilisées'}
            onClick={() => {
              if (confirm(`Supprimer ${inutilisees.length} catégorie(s) inutilisée(s) ?`)) {
                removeCategories(inutilisees); setSelection(new Set());
              }
            }}>
            <span className="inline-flex items-center gap-1"><Trash2 size={13} /> Supprimer</span>
          </Btn>
          <Btn variant="ghost" onClick={() => setSelection(new Set())}>Désélectionner</Btn>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        <Card title={`${rows.length} catégories`}>
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table="categories" className="sheet text-sm">
              <thead>
                <tr>
                  <th className="text-center" style={{ width: 34 }}>
                    <input
                      type="checkbox" style={{ width: 'auto' }} title="Tout sélectionner"
                      checked={rows.length > 0 && rows.every(r => selection.has(r.nom))}
                      onChange={ev => setSelection(ev.target.checked ? new Set(rows.map(r => r.nom)) : new Set())}
                    />
                  </th>
                  <th style={{ width: 46 }}>Couleur</th>
                  <ThSort label="Nom" k="nom" sort={sort} onToggle={toggle} />
                  <ThSort label="Type" k="kind" sort={sort} onToggle={toggle} />
                  <ThSort label="Groupe" k="groupe" sort={sort} onToggle={toggle} />
                  <th title="À l'actif : les écritures de cette catégorie s'amortissent au lieu de peser d'un coup sur le résultat.">
                    Nature
                  </th>
                  <ThSort label="Écritures" k="nb" sort={sort} onToggle={toggle} className="num" />
                  <ThSort label="Total TTC" k="total" sort={sort} onToggle={toggle} className="num" />
                </tr>
              </thead>
              <tbody>
                {rows.map(l => (
                  <tr key={l.nom} className={selection.has(l.nom) ? 'is-selected' : ''}>
                    <td className="text-center">
                      <input type="checkbox" style={{ width: 'auto' }}
                        checked={selection.has(l.nom)} onChange={() => toggleSel(l.nom)} />
                    </td>
                    <td className="text-center">
                      <span
                        className="inline-block w-4 h-4 rounded border align-middle"
                        style={{ backgroundColor: l.couleur || '#fff', borderColor: 'var(--bbg-border)' }}
                        title={l.couleur || 'aucune couleur'}
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={l.nom}
                        style={{ fontWeight: 500 }}
                        onBlur={ev => {
                          const v = ev.target.value.trim();
                          if (v && v !== l.nom) renameCategorie(l.kind, l.nom, v);
                        }}
                        onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                      />
                    </td>
                    <td>
                      <select className={l.kind === 'categoriesProduits' ? 'pill-green' : l.kind === 'categoriesJeux' ? 'pill-yellow' : 'pill-orange'}
                        value={l.kind} onChange={ev => moveCategories([l.nom], ev.target.value as CatKind)}>
                        {(Object.keys(KIND_LABEL) as CatKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={l.groupe}
                        onChange={ev => setCategorieMeta([l.nom], { groupe: ev.target.value })}>
                        <option value="">— aucun —</option>
                        {groupes.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td>
                      {l.kind === 'categoriesProduits' ? (
                        <span className="text-xs" style={{ color: '#9a92b5' }}>produit</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <select
                            className={l.nature === 'immo' ? 'pill-blue'
                              : l.nature === 'charge' ? 'pill-orange' : ''}
                            value={l.nature}
                            title={l.nature === 'immo'
                              ? "À l'actif : toutes ces dépenses s'inscrivent au bilan et s'amortissent."
                              : l.nature === 'charge'
                                ? "En charges : toutes ces dépenses pèsent sur le résultat de l'exercice."
                                : "Au cas par cas : c'est la colonne « Type » du journal qui décide, "
                                  + 'ligne par ligne.'}
                            onChange={ev => setCategorieMeta([l.nom], {
                              immobilisee: ev.target.value === 'auto' ? undefined : ev.target.value === 'immo',
                              ...(ev.target.value === 'immo' ? { dureeAns: l.dureeAns ?? 5 } : {}),
                            })}
                          >
                            <option value="auto">au cas par cas</option>
                            <option value="charge">tout en charges</option>
                            <option value="immo">tout à l'actif</option>
                          </select>
                          {l.nature === 'immo' && (
                            <select
                              className="pill-blue" title="Durée d'amortissement"
                              value={l.dureeAns ?? 5}
                              onChange={ev => setCategorieMeta([l.nom], { dureeAns: Number(ev.target.value) })}
                            >
                              {[3, 5, 10].map(d => <option key={d} value={d}>{d} ans</option>)}
                            </select>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{l.nb || '·'}</td>
                    <td className="text-right tabular-nums font-medium">{l.total ? euros(l.total) : '·'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Ajouter une catégorie">
            <div className="space-y-2">
              <input
                className="w-full border rounded px-2 py-1.5 text-sm"
                style={{ borderColor: 'var(--bbg-border)' }}
                placeholder="Nom de la catégorie"
                value={nouvelle}
                onChange={ev => setNouvelle(ev.target.value)}
                onKeyDown={ev => { if (ev.key === 'Enter' && nouvelle.trim()) { addCategorie(nouveauKind, nouvelle); setNouvelle(''); } }}
              />
              <select
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                style={{ borderColor: 'var(--bbg-border)' }}
                value={nouveauKind} onChange={ev => setNouveauKind(ev.target.value as CatKind)}
              >
                {(Object.keys(KIND_LABEL) as CatKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <Btn variant="primary" onClick={() => { if (nouvelle.trim()) { addCategorie(nouveauKind, nouvelle); setNouvelle(''); } }}>
                <span className="inline-flex items-center gap-1"><Plus size={14} /> Ajouter</span>
              </Btn>
            </div>
          </Card>

          <Card title="Groupes de catégories">
            <p className="text-xs mb-2" style={{ color: '#8d85a6' }}>
              Les groupes servent à regrouper les lignes dans la synthèse annuelle
              (ex. « Frais généraux », « Festivals », « Cotisations »).
            </p>
            <ul className="space-y-1 mb-3 text-sm">
              {groupes.map(g => {
                const n = lignes.filter(l => l.groupe === g).length;
                return (
                  <li key={g} className="flex items-center justify-between group">
                    <span style={{ color: '#3f3268' }}>{g} <span style={{ color: '#9a92b5' }}>({n})</span></span>
                    <button
                      className="opacity-0 group-hover:opacity-100" style={{ color: '#d98b86' }}
                      title="Supprimer ce groupe"
                      onClick={() => {
                        setGroupes(groupes.filter(x => x !== g));
                        setCategorieMeta(lignes.filter(l => l.groupe === g).map(l => l.nom), { groupe: '' });
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                );
              })}
              {!groupes.length && <li style={{ color: '#9a92b5' }} className="text-xs italic">Aucun groupe pour l'instant.</li>}
            </ul>
            <div className="flex gap-1">
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                style={{ borderColor: 'var(--bbg-border)' }}
                placeholder="Nouveau groupe"
                value={nouveauGroupe}
                onChange={ev => setNouveauGroupe(ev.target.value)}
                onKeyDown={ev => { if (ev.key === 'Enter') ajouterGroupe(); }}
              />
              <Btn variant="ghost" onClick={ajouterGroupe} title={sel.length ? 'Créer le groupe et y placer la sélection' : 'Créer le groupe'}>
                <FolderPlus size={14} />
              </Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
