import { Fragment, useMemo, useState } from 'react';
import { Plus, Trash2, AlertTriangle, AlertCircle, Info, Wand2, ArrowRightLeft } from 'lucide-react';
import { useStore } from '../../store';
import type { PrevLigne, PrevSection } from '../../types';
import { EXERCICES, labelMois, moisExercice } from '../../utils/dates';
import { euros, euros0, r2, pourcent } from '../../utils/money';
import {
  SECTIONS, alarmesPrevisionnel, reelParCategorie, reelParCategorieEtMois, sectionDeCategorie,
} from '../../utils/previsionnel';
import { PageHeader, Card, Btn, StatCard, MoneyInput } from '../ui';

export function PrevisionnelPage() {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const previsionnels = useStore(s => s.previsionnels);
  const setPrevCell = useStore(s => s.setPrevCell);
  const addPrevLigne = useStore(s => s.addPrevLigne);
  const updatePrevLigne = useStore(s => s.updatePrevLigne);
  const removePrevLigne = useStore(s => s.removePrevLigne);
  const etalerPrevLigne = useStore(s => s.etalerPrevLigne);
  const addCategorie = useStore(s => s.addCategorie);

  const [exercice, setExercice] = useState('2025-26');
  const [nouvelleCat, setNouvelleCat] = useState('');
  const [alarmesOuvertes, setAlarmesOuvertes] = useState(true);

  const moisList = moisExercice(exercice);
  const lignes = previsionnels[exercice] ?? [];
  const meta = refs.categoriesMeta ?? {};
  const groupes = refs.groupes ?? [];

  const reel = useMemo(() => reelParCategorie(entries, exercice), [entries, exercice]);
  // Réel ventilé par bloc : une immobilisation ne doit pas gonfler les charges.
  const reelParSection = useMemo(() => {
    const m = new Map<PrevSection, Map<string, number>>();
    for (const sec of SECTIONS) m.set(sec.cle, reelParCategorie(entries, exercice, refs, sec.cle));
    return m;
  }, [entries, exercice, refs]);
  const reelMois = useMemo(() => reelParCategorieEtMois(entries, exercice), [entries, exercice]);
  const alarmes = useMemo(
    () => alarmesPrevisionnel(lignes, reel, refs),
    [lignes, reel, refs],
  );

  const toutesCategories = [
    ...refs.categoriesProduits, ...refs.categoriesDepenses, ...refs.categoriesJeux,
  ];
  const dejaPresentes = new Set(lignes.map(l => l.categorie));

  const totalLigne = (l: PrevLigne) => r2(l.valeurs.reduce<number>((s, v) => s + (v ?? 0), 0));
  const totalSection = (sec: PrevSection) =>
    r2(lignes.filter(l => l.section === sec).reduce((s, l) => s + totalLigne(l), 0));

  const totalPrevu = r2(
    (['charges', 'jeux', 'immos'] as PrevSection[]).reduce((s, sec) => s + totalSection(sec), 0));
  const totalProduits = totalSection('produits');
  const reelDepenses = r2([...reel.entries()]
    .filter(([c]) => !refs.categoriesProduits.includes(c))
    .reduce((s, [, v]) => s + v, 0));
  const reelProduits = r2([...reel.entries()]
    .filter(([c]) => refs.categoriesProduits.includes(c))
    .reduce((s, [, v]) => s + v, 0));

  const erreurs = alarmes.filter(a => a.niveau === 'erreur');
  const attentions = alarmes.filter(a => a.niveau === 'attention');

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Prévisionnel"
        subtitle="Mêmes catégories, mêmes groupes et mêmes mois que la synthèse annuelle — pour que la comparaison ait du sens"
        actions={
          <>
            <div className="flex gap-1">
              <input
                className="border rounded px-2 py-1.5 text-sm w-52 bg-white"
                style={{ borderColor: 'var(--bbg-border)' }}
                placeholder="Ajouter une ligne…"
                list="categories-dispo"
                value={nouvelleCat}
                onChange={ev => setNouvelleCat(ev.target.value)}
                onKeyDown={ev => {
                  if (ev.key === 'Enter' && nouvelleCat.trim()) {
                    addPrevLigne(exercice, nouvelleCat.trim());
                    setNouvelleCat('');
                  }
                }}
              />
              <datalist id="categories-dispo">
                {toutesCategories.filter(c => !dejaPresentes.has(c)).map(c => <option key={c} value={c} />)}
              </datalist>
              <Btn variant="primary" onClick={() => {
                if (nouvelleCat.trim()) { addPrevLigne(exercice, nouvelleCat.trim()); setNouvelleCat(''); }
              }}>
                <Plus size={14} />
              </Btn>
            </div>
            <select
              className="border rounded-md px-2 py-1.5 text-sm bg-white font-medium"
              style={{ borderColor: 'var(--bbg-border)', color: 'var(--bbg-purple-darker)' }}
              value={exercice}
              onChange={ev => setExercice(ev.target.value)}
            >
              {EXERCICES.map(ex => <option key={ex} value={ex}>Exercice {ex}</option>)}
            </select>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="Produits prévus" value={euros0(totalProduits)} tone="good"
          sub={`réel ${euros0(reelProduits)}`} />
        <StatCard label="Dépenses prévues" value={euros0(totalPrevu)} tone="accent"
          sub={`réel ${euros0(reelDepenses)}`} />
        <StatCard label="Résultat prévu" value={euros0(r2(totalProduits - totalPrevu))}
          tone={totalProduits - totalPrevu >= 0 ? 'good' : 'bad'} />
        <StatCard label="Budget consommé"
          value={totalPrevu ? pourcent(reelDepenses / totalPrevu) : '—'}
          tone={reelDepenses <= totalPrevu ? 'good' : 'bad'} />
        <StatCard label="Alarmes" value={String(alarmes.length)}
          tone={erreurs.length ? 'bad' : attentions.length ? 'accent' : 'good'}
          sub={erreurs.length ? `${erreurs.length} à corriger` : 'cohérent avec la synthèse'} />
      </div>

      {/* Alarmes de cohérence */}
      {alarmes.length > 0 && (
        <Card
          className="mb-4"
          title={
            <span className="inline-flex items-center gap-2">
              <AlertTriangle size={16} style={{ color: erreurs.length ? '#b7332e' : 'var(--bbg-orange-dark)' }} />
              {alarmes.length} alarme{alarmes.length > 1 ? 's' : ''} de cohérence
            </span>
          }
          actions={
            <Btn variant="ghost" onClick={() => setAlarmesOuvertes(v => !v)}>
              {alarmesOuvertes ? 'Réduire' : 'Voir le détail'}
            </Btn>
          }
        >
          {alarmesOuvertes ? (
            <ul className="space-y-1.5">
              {alarmes.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {a.niveau === 'erreur'
                    ? <AlertCircle size={15} className="shrink-0 mt-0.5" style={{ color: '#b7332e' }} />
                    : a.niveau === 'attention'
                      ? <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--bbg-orange-dark)' }} />
                      : <Info size={15} className="shrink-0 mt-0.5" style={{ color: '#6f6690' }} />}
                  <span style={{ color: '#3f3268' }}>{a.message}</span>
                  {a.action === 'creer' && (
                    <button
                      className="shrink-0 text-xs underline"
                      style={{ color: 'var(--bbg-purple-dark)' }}
                      onClick={() => addPrevLigne(exercice, a.categorie, a.section)}
                    >
                      créer la ligne
                    </button>
                  )}
                  {a.action === 'creerCategorie' && (
                    <button
                      className="shrink-0 text-xs underline"
                      style={{ color: 'var(--bbg-purple-dark)' }}
                      title="Ajoute cette catégorie au référentiel : la ligne devient rattachée"
                      onClick={() => addCategorie(
                        a.section === 'produits' ? 'categoriesProduits'
                          : a.section === 'jeux' ? 'categoriesJeux' : 'categoriesDepenses',
                        a.categorie)}
                    >
                      créer la catégorie
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: '#6f6690' }}>
              {erreurs.length} erreur{erreurs.length > 1 ? 's' : ''} ·{' '}
              {attentions.length} avertissement{attentions.length > 1 ? 's' : ''}
            </p>
          )}
        </Card>
      )}

      {/* Tableau : une section par bloc de la synthèse */}
      <Card title={`Prévisionnel ${exercice} (HT)`}>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="sheet text-xs" style={{ tableLayout: 'fixed', minWidth: 1050 }}>
            <colgroup>
              {/* Largeurs figées : le tableau tient à l'écran quel que soit le contenu. */}
              <col style={{ width: '13%' }} />
              {moisList.map((_, i) => <col key={i} style={{ width: `${69 / moisList.length}%` }} />)}
              <col style={{ width: '5%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '3%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="text-left">Ligne</th>
                {moisList.map(m => <th key={m} className="num">{labelMois(m)}</th>)}
                <th className="num">Prévu</th>
                <th className="num">Réel</th>
                <th className="num">Écart</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map(sec => {
                const lignesSec = lignes.filter(l => l.section === sec.cle);
                const catsSec = new Set(lignesSec.map(l => l.categorie));
                // Les catégories qui ont du réel mais pas de ligne prévisionnelle
                // apparaissent en grisé : la comparaison reste complète.
                const reelSec = reelParSection.get(sec.cle) ?? new Map<string, number>();
                const manquantes = [...reelSec.entries()]
                  .filter(([c, v]) => v !== 0 && !catsSec.has(c)
                    && !lignes.some(l => l.categorie === c && l.section === sec.cle))
                  .map(([c]) => c);
                if (!lignesSec.length && !manquantes.length) return null;

                // Regroupement par groupe de catégories, comme dans la synthèse
                const parGroupe = new Map<string, PrevLigne[]>();
                for (const l of lignesSec) {
                  const g = meta[l.categorie]?.groupe ?? '';
                  if (!parGroupe.has(g)) parGroupe.set(g, []);
                  parGroupe.get(g)!.push(l);
                }
                const ordre = [...groupes.filter(g => parGroupe.has(g)), ...(parGroupe.has('') ? [''] : [])];
                const avecGroupes = ordre.length > 1 || (ordre.length === 1 && ordre[0] !== '');

                return (
                  <Fragment key={sec.cle}>
                    <tr className="band-purple">
                      <td colSpan={moisList.length + 5} className="py-1.5">{sec.titre}</td>
                    </tr>

                    {ordre.map(g => (
                      <Fragment key={`${sec.cle}-${g}`}>
                        {avecGroupes && (
                          <tr className="band-soft">
                            <td colSpan={moisList.length + 5} className="py-1">{g || '— sans groupe —'}</td>
                          </tr>
                        )}
                        {parGroupe.get(g)!.map(l => {
                          const prevu = totalLigne(l);
                          const reelCat = reelSec.get(l.categorie) ?? reel.get(l.categorie) ?? 0;
                          const ecart = r2(reelCat - prevu);
                          const rattachee = toutesCategories.includes(l.categorie);
                          const estMontant = !l.unite;
                          return (
                            <tr key={l.id} className="group">
                              <td>
                                <div className="flex items-center gap-1">
                                  {!rattachee && estMontant && (
                                    <span title="Cette ligne ne correspond à aucune catégorie de la synthèse">
                                      <AlertCircle size={13} className="shrink-0" style={{ color: '#b7332e' }} />
                                    </span>
                                  )}
                                  <span
                                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                    style={{ backgroundColor: meta[l.categorie]?.couleur || sec.couleur }}
                                  />
                                  <select
                                    className="min-w-0 flex-1"
                                    style={rattachee ? undefined : { color: '#b7332e' }}
                                    value={l.categorie}
                                    onChange={ev => updatePrevLigne(exercice, l.id, {
                                      categorie: ev.target.value,
                                      section: sectionDeCategorie(ev.target.value, refs),
                                    })}
                                  >
                                    {!rattachee && <option value={l.categorie}>{l.categorie} (non rattachée)</option>}
                                    {toutesCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                  {l.unite && (
                                    <span className="text-[10px] px-1 rounded shrink-0"
                                      style={{ backgroundColor: '#e6e9f2', color: '#5c5280' }}>{l.unite}</span>
                                  )}
                                </div>
                              </td>
                              {moisList.map((m, i) => (
                                <td key={m} className="text-right p-0.5!">
                                  <MoneyInput
                                    value={l.valeurs[i] ?? null}
                                    onCommit={v => setPrevCell(exercice, l.id, i, v)}
                                    className="w-full min-w-12 border-transparent hover:border-[#ddd6ef] bg-transparent text-xs"
                                  />
                                </td>
                              ))}
                              <td className="text-right tabular-nums font-semibold" style={{ backgroundColor: sec.couleur }}>
                                {estMontant ? euros(prevu) : r2(prevu).toLocaleString('fr-FR')}
                              </td>
                              <td className="text-right tabular-nums" style={{ color: '#5c5280' }}>
                                {estMontant ? (reelCat ? euros(reelCat) : '·') : '—'}
                              </td>
                              <td className="text-right tabular-nums"
                                style={{ color: !estMontant ? '#9a92b5' : ecart > 0 ? '#b7332e' : '#38761d' }}>
                                {estMontant && (prevu || reelCat) ? euros(ecart) : '·'}
                              </td>
                              <td>
                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                  <button
                                    title="Étaler le premier montant sur tous les mois"
                                    style={{ color: 'var(--bbg-purple-dark)' }}
                                    onClick={() => {
                                      const premier = l.valeurs.find(v => v != null) ?? 0;
                                      etalerPrevLigne(exercice, l.id, premier);
                                    }}
                                  >
                                    <ArrowRightLeft size={13} />
                                  </button>
                                  <button
                                    title="Supprimer la ligne" style={{ color: '#d98b86' }}
                                    onClick={() => { if (confirm(`Supprimer la ligne « ${l.categorie} » ?`)) removePrevLigne(exercice, l.id); }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}

                    {manquantes.map(cat => (
                      <tr key={`manque-${cat}`} style={{ fontStyle: 'italic' }}>
                        <td>
                          <span className="inline-flex items-center gap-1" style={{ color: 'var(--bbg-orange-dark)' }}>
                            <AlertTriangle size={12} className="shrink-0" />
                            {cat} <span style={{ color: '#9a92b5' }}>(non budgété)</span>
                          </span>
                        </td>
                        {moisList.map(m => {
                          const v = reelMois.get(cat)?.get(m) ?? 0;
                          return <td key={m} className="text-right tabular-nums" style={{ color: '#9a92b5' }}>{v ? euros(r2(v)) : '·'}</td>;
                        })}
                        <td className="text-right" style={{ backgroundColor: sec.couleur, color: '#9a92b5' }}>—</td>
                        <td className="text-right tabular-nums" style={{ color: '#5c5280' }}>{euros(reelSec.get(cat) ?? 0)}</td>
                        <td className="text-right tabular-nums" style={{ color: '#b7332e' }}>{euros(reelSec.get(cat) ?? 0)}</td>
                        <td>
                          <button
                            title="Créer la ligne prévisionnelle" className="mx-auto block"
                            style={{ color: 'var(--bbg-purple-dark)' }}
                            onClick={() => addPrevLigne(exercice, cat, sec.cle)}
                          >
                            <Wand2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}

                    <tr className="band-soft">
                      <td>Total {sec.titre.toLowerCase()}</td>
                      {moisList.map((m, i) => {
                        const v = lignesSec.filter(l => !l.unite).reduce((s, l) => s + (l.valeurs[i] ?? 0), 0);
                        return <td key={m} className="text-right tabular-nums">{v ? euros(r2(v)) : '·'}</td>;
                      })}
                      <td className="text-right tabular-nums">{euros(totalSection(sec.cle))}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Résultat prévisionnel (produits − dépenses)</td>
                {moisList.map((m, i) => {
                  const prod = lignes.filter(l => l.section === 'produits' && !l.unite).reduce((s, l) => s + (l.valeurs[i] ?? 0), 0);
                  const dep = lignes.filter(l => ['charges', 'jeux', 'immos'].includes(l.section) && !l.unite)
                    .reduce((s, l) => s + (l.valeurs[i] ?? 0), 0);
                  const v = r2(prod - dep);
                  return <td key={m} className="text-right tabular-nums" style={{ color: v < 0 ? '#b7332e' : undefined }}>{v ? euros(v) : '·'}</td>;
                })}
                <td className="text-right tabular-nums" style={{ color: totalProduits - totalPrevu < 0 ? '#b7332e' : undefined }}>
                  {euros(r2(totalProduits - totalPrevu))}
                </td>
                <td className="text-right tabular-nums">{euros(r2(reelProduits - reelDepenses))}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
          Les lignes reprennent les catégories et les groupes de la synthèse annuelle : renommer ou
          regrouper une catégorie dans l'onglet Catégories se répercute ici. Les lignes en italique
          sont des dépenses réelles sans prévision — la baguette les ajoute au prévisionnel.
        </p>
      </Card>
    </div>
  );
}
