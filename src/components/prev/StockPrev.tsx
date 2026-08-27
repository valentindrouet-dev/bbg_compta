/**
 * Le prévisionnel de stock, jeu par jeu.
 *
 * Deux lignes de saisie par jeu — ce qui sort d'usine, ce qui s'écoule — et
 * tout le reste en découle : le stock qui reste, ce que l'usine coûte, le
 * chiffre d'affaires, le coût des exemplaires vendus, la marge, et la variation
 * de stock qui remet chaque coût en face de la vente qui lui correspond.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store';
import type { LigneStock } from '../../types';
import { labelMois } from '../../utils/dates';
import { euros, euros0, r2 } from '../../utils/money';
import { couleurJeu, encreSur, voileSur } from '../../utils/jeux';
import { CANAUX_DEFAUT, stocksExercice, type StockJeu } from '../../utils/stock';
import { Card, Btn, MoneyInput, StatCard } from '../ui';

const AUCUN_JEU: string[] = [];

export function StockPrev({ exercice, moisList }: { exercice: string; moisList: string[] }) {
  const stocks = useStore(s => s.stocks);
  const refs = useStore(s => s.referentiels);
  const jeux = refs.jeux ?? AUCUN_JEU;
  const addLigneStock = useStore(s => s.addLigneStock);
  const updateLigneStock = useStore(s => s.updateLigneStock);
  const removeLigneStock = useStore(s => s.removeLigneStock);
  const [nouveau, setNouveau] = useState('');

  const lignes = useMemo(
    () => stocksExercice(stocks, exercice, jeux), [stocks, exercice, jeux]);

  const sansLigne = jeux.filter(j => !lignes.some(l => l.ligne.jeu === j));
  const t = (f: (s: StockJeu) => number) => r2(lignes.reduce((x, s) => x + f(s), 0));
  const totalCA = t(s => s.total.ca);
  const totalFab = t(s => s.total.coutFabrication);
  const totalMarge = t(s => s.total.marge);
  const valeurStock = t(s => s.total.valeurStock);
  const exemplaires = lignes.reduce((x, s) => x + s.total.stockFin, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Ventes prévues (HT)" value={euros0(totalCA)} tone="good"
          sub={`${lignes.reduce((x, s) => x + s.total.vendue, 0)} exemplaires`} />
        <StatCard label="Tirages payés à l'usine" value={euros0(totalFab)} tone="accent"
          sub={`${lignes.reduce((x, s) => x + s.total.fabrique, 0)} exemplaires`} />
        <StatCard label="Marge sur ventes" value={euros0(totalMarge)}
          tone={totalMarge >= 0 ? 'good' : 'bad'} sub="ventes − coût des exemplaires vendus" />
        <StatCard label="Stock en fin d'exercice" value={euros0(valeurStock)}
          tone="neutral" sub={`${exemplaires} exemplaires, au coût de revient`} />
        <StatCard label="Effet sur le résultat" value={euros0(totalMarge)}
          tone={totalMarge >= 0 ? 'good' : 'bad'}
          sub="le stock invendu ne pèse pas" />
      </div>

      {lignes.map(s => (
        <TableauJeu
          key={s.ligne.id} s={s} moisList={moisList}
          couleur={couleurJeu(s.ligne.jeu, refs)}
          lienProd={refs.jeuxMeta?.[s.ligne.jeu]?.lienProd}
          onPatch={patch => updateLigneStock(s.ligne.id, patch)}
          onRemove={() => removeLigneStock(s.ligne.id)}
        />
      ))}

      <Card title="Ajouter un jeu au tableau de stock">
        {sansLigne.length ? (
          <div className="flex items-center gap-2">
            <select
              className="border rounded px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: 'var(--bbg-border)' }}
              value={nouveau}
              onChange={e => setNouveau(e.target.value)}
            >
              <option value="">Choisir un jeu…</option>
              {sansLigne.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
            <Btn variant="primary" disabled={!nouveau}
              onClick={() => { if (nouveau) { addLigneStock(exercice, nouveau); setNouveau(''); } }}>
              <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Ajouter</span>
            </Btn>
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#6f6690' }}>
            Tous les jeux du catalogue ont leur tableau. Un nouveau jeu s'ajoute dans l'onglet Jeux.
          </p>
        )}
      </Card>

      <p className="text-xs" style={{ color: '#9a92b5' }}>
        Le <b>coût de revient unitaire</b> vient du Production Calculator — c'est lui qui tient les
        devis usine ; on le recopie ici une fois par tirage. Ce que tu paies à l'usine est une charge
        du mois où tu la paies ; la <b>variation de stock</b> la neutralise pour les exemplaires
        encore en carton, si bien que seul le coût de ce qui est <b>vraiment vendu</b> pèse sur le
        résultat. Le stock d'ouverture d'un exercice est la clôture du précédent, repris tout seul.
      </p>
    </div>
  );
}

function TableauJeu({ s, moisList, couleur, lienProd, onPatch, onRemove }: {
  s: StockJeu; moisList: string[]; couleur: string; lienProd?: string;
  onPatch: (p: Partial<LigneStock>) => void;
  onRemove: () => void;
}) {
  const setCanalCell = useStore(st => st.setCanalCell);
  const addCanal = useStore(st => st.addCanal);
  const updateCanal = useStore(st => st.updateCanal);
  const removeCanal = useStore(st => st.removeCanal);
  const setStockFabrique = useStore(st => st.setStockFabrique);
  const encre = encreSur(couleur);
  const voile = voileSur(couleur, 0.2);
  const l = s.ligne;
  const nCanaux = (l.canaux ?? []).length;
  const libres = CANAUX_DEFAUT.map(c => c.nom).filter(n => !(l.canaux ?? []).some(c => c.nom === n));

  /** Une ligne calculée : libellé, valeur par mois, total, et son ton. */
  const Ligne = ({ label, aide, get, total, fort, monnaie = true, signe }: {
    label: string; aide?: string; get: (i: number) => number; total: number;
    fort?: boolean; monnaie?: boolean; signe?: boolean;
  }) => (
    <tr style={fort ? { backgroundColor: voile, fontWeight: 700 } : undefined}>
      <td title={aide} className={aide ? 'cursor-help' : ''}>{label}</td>
      {moisList.map((m, i) => {
        const v = get(i);
        return (
          <td key={m} className="text-right tabular-nums"
            style={signe && v ? { color: v > 0 ? '#38761d' : '#b7332e' } : undefined}>
            {v ? (monnaie ? euros0(v) : String(v)) : '·'}
          </td>
        );
      })}
      <td className="text-right tabular-nums" style={{ backgroundColor: voile, fontWeight: 700 }}>
        {total ? (monnaie ? euros(total) : String(total)) : '·'}
      </td>
    </tr>
  );

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-sm font-bold"
            style={{ backgroundColor: couleur, color: encre }}>{l.jeu}</span>
          <span className="text-sm font-normal" style={{ color: '#6f6690' }}>
            {s.total.stockFin} exemplaire{s.total.stockFin > 1 ? 's' : ''} en stock à la clôture
          </span>
          {s.decouvert && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#fdecea', color: '#b7332e' }}
              title="Le stock descend sous zéro : tu vends plus d'exemplaires que tu n'en as fabriqué.">
              <AlertTriangle size={12} /> stock négatif
            </span>
          )}
        </span>
      }
      actions={
        <div className="flex items-center gap-2 text-sm">
          <label className="inline-flex items-center gap-1.5" style={{ color: '#5c5280' }}
            title="Coût de revient unitaire HT — à recopier du Production Calculator">
            Coût de revient
            <MoneyInput value={l.coutUnitaire || null} className="w-24"
              onCommit={v => onPatch({ coutUnitaire: v ?? 0 })} placeholder="0 €" />
          </label>
          <label className="inline-flex items-center gap-1.5" style={{ color: '#5c5280' }} title="Stock d'ouverture, en exemplaires">
            Stock initial
            <input
              type="number" min={0}
              className="border rounded px-1.5 py-1 w-16 text-right bg-white"
              style={{ borderColor: 'var(--bbg-border)' }}
              value={l.stockInitial ?? ''}
              onChange={e => onPatch({ stockInitial: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </label>
          {lienProd && (
            <a href={lienProd} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs underline"
              style={{ color: 'var(--bbg-purple-dark)' }}
              title="Ouvrir le devis usine dans le Production Calculator">
              <ExternalLink size={12} /> devis
            </a>
          )}
          <button onClick={onRemove} title="Retirer ce jeu du tableau" style={{ color: '#b7332e' }}>
            <Trash2 size={14} />
          </button>
        </div>
      }
    >
      <div className="overflow-x-auto -mx-4 px-4">
        <table data-table={`stockprev:${l.jeu}`} className="sheet text-sm border-collapse w-full">
          <thead>
            <tr className="text-left" style={{ color: '#5c5280' }}>
              <th className="min-w-64">Mouvement</th>
              {moisList.map(m => <th key={m} className="text-right">{labelMois(m)}</th>)}
              <th className="text-right" style={{ backgroundColor: voile }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td title="Exemplaires sortis d'usine ce mois-là">Fabriqués (exemplaires)</td>
              {moisList.map((m, i) => (
                <td key={m} className="text-right p-0.5!">
                  <input
                    type="number" min={0}
                    className="w-full min-w-16 text-right px-1 py-0.5 rounded border border-transparent hover:border-[#ddd6ef] bg-transparent tabular-nums"
                    value={l.fabrique[i] ?? ''}
                    onChange={e => setStockFabrique(l.id, i, e.target.value === '' ? null : Number(e.target.value))}
                  />
                </td>
              ))}
              <td className="text-right tabular-nums" style={{ backgroundColor: voile, fontWeight: 700 }}>
                {s.total.fabrique || '·'}
              </td>
            </tr>

            {/* ------ Un canal de vente par ligne : son prix, son écoulement ---- */}
            {(l.canaux ?? []).map(c => {
              const pct = c.mode === 'pourcentage';
              return (
                <tr key={c.id} className="group/canal">
                  <td>
                    <div className="flex items-center gap-1 flex-wrap">
                      <input
                        className="border border-transparent hover:border-[#ddd6ef] rounded px-1 py-0.5 bg-transparent font-medium w-28"
                        value={c.nom}
                        title={CANAUX_DEFAUT.find(x => x.nom === c.nom)?.aide ?? 'Nom du canal de vente'}
                        onChange={e => updateCanal(l.id, c.id, { nom: e.target.value })}
                      />
                      <MoneyInput value={c.prix || null} className="w-20"
                        placeholder="prix"
                        onCommit={v => updateCanal(l.id, c.id, { prix: v ?? 0 })} />
                      <span className="flex rounded border overflow-hidden text-[11px]"
                        style={{ borderColor: 'var(--bbg-border)' }}>
                        {([['nombre', '#'], ['pourcentage', '%']] as const).map(([m, lab]) => (
                          <button
                            key={m}
                            className="px-1.5 py-0.5 font-bold"
                            style={c.mode === m
                              ? { backgroundColor: 'var(--bbg-purple-dark)', color: '#fff' }
                              : { backgroundColor: '#fff', color: '#5c5280' }}
                            title={m === 'nombre'
                              ? 'Saisir des exemplaires'
                              : 'Saisir un pourcentage — la quantité est calculée'}
                            onClick={() => updateCanal(l.id, c.id, { mode: m })}
                          >{lab}</button>
                        ))}
                      </span>
                      {pct && (
                        <select
                          className="border rounded px-1 py-0.5 text-[11px] bg-white"
                          style={{ borderColor: 'var(--bbg-border)' }}
                          value={c.base ?? 'tirage'}
                          title="Sur quoi porte le pourcentage"
                          onChange={e => updateCanal(l.id, c.id, { base: e.target.value as 'tirage' | 'disponible' })}
                        >
                          <option value="tirage">du tirage</option>
                          <option value="disponible">du stock dispo.</option>
                        </select>
                      )}
                      {nCanaux > 1 && (
                        <button
                          className="opacity-0 group-hover/canal:opacity-100"
                          style={{ color: '#b7332e' }} title="Retirer ce canal"
                          onClick={() => removeCanal(l.id, c.id)}
                        ><Trash2 size={12} /></button>
                      )}
                    </div>
                  </td>
                  {moisList.map((m, i) => {
                    const q = s.mois[i].parCanal.get(c.id)?.quantite ?? 0;
                    return (
                      <td key={m} className="text-right p-0.5!"
                        title={pct && q ? `${c.valeurs[i]} % → ${q} exemplaire${q > 1 ? 's' : ''}` : undefined}>
                        <div className="flex items-center justify-end gap-0.5">
                          <input
                            type="number" min={0} step={pct ? 0.5 : 1}
                            className="w-full min-w-14 text-right px-1 py-0.5 rounded border border-transparent hover:border-[#ddd6ef] bg-transparent tabular-nums"
                            value={c.valeurs[i] ?? ''}
                            onChange={e => setCanalCell(l.id, c.id, i, e.target.value === '' ? null : Number(e.target.value))}
                          />
                          {pct && <span className="text-[10px] shrink-0" style={{ color: '#9a92b5' }}>%</span>}
                        </div>
                        {pct && q > 0 && (
                          <div className="text-[10px] leading-none pr-1 pb-0.5 tabular-nums"
                            style={{ color: 'var(--bbg-purple-dark)' }}>{q}</div>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-right tabular-nums" style={{ backgroundColor: voile, fontWeight: 700 }}>
                    {s.total.parCanal.get(c.id)?.quantite || '·'}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={moisList.length + 2} className="py-1">
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span style={{ color: '#9a92b5' }}>Ajouter un canal :</span>
                  {libres.map(n => (
                    <button key={n}
                      className="px-2 py-0.5 rounded-full border"
                      style={{ borderColor: 'var(--bbg-border)', color: 'var(--bbg-purple-dark)' }}
                      title={CANAUX_DEFAUT.find(x => x.nom === n)?.aide}
                      onClick={() => addCanal(l.id, n)}
                    >+ {n}</button>
                  ))}
                  <button
                    className="px-2 py-0.5 rounded-full border inline-flex items-center gap-1"
                    style={{ borderColor: 'var(--bbg-border)', color: 'var(--bbg-purple-dark)' }}
                    onClick={() => {
                      const n = prompt('Nom du canal de vente ?');
                      if (n?.trim()) addCanal(l.id, n.trim());
                    }}
                  ><Plus size={11} /> autre</button>
                </div>
              </td>
            </tr>

            <Ligne label="TOTAL VENDUS (exemplaires)" monnaie={false} fort
              aide="Tous canaux confondus"
              get={i => s.mois[i].vendue} total={s.total.vendue} />
            <Ligne label="Stock en fin de mois (exemplaires)" monnaie={false}
              aide="Stock d'ouverture + fabriqués − vendus"
              get={i => s.mois[i].stockFin} total={s.total.stockFin} />
            <Ligne label="Coût des tirages (HT)" fort
              aide="Fabriqués × coût de revient — ce qui sort du compte pour l'usine"
              get={i => s.mois[i].coutFabrication} total={s.total.coutFabrication} />
            {(l.canaux ?? []).map(c => (
              <tr key={`ca-${c.id}`}>
                <td style={{ paddingLeft: 18 }} title={`Exemplaires écoulés chez « ${c.nom} » × ${euros(c.prix)}`}>
                  Ventes {c.nom} (HT)
                </td>
                {moisList.map((m, i) => {
                  const v = s.mois[i].parCanal.get(c.id)?.ca ?? 0;
                  return <td key={m} className="text-right tabular-nums">{v ? euros0(v) : '·'}</td>;
                })}
                <td className="text-right tabular-nums" style={{ backgroundColor: voile, fontWeight: 700 }}>
                  {s.total.parCanal.get(c.id)?.ca ? euros(s.total.parCanal.get(c.id)!.ca) : '·'}
                </td>
              </tr>
            ))}
            <Ligne label="TOTAL VENTES (HT)" fort
              aide="Tous canaux confondus"
              get={i => s.mois[i].ca} total={s.total.ca} />
            <Ligne label="Coût des exemplaires vendus"
              aide="Vendus × coût de revient — la seule part du tirage qui pèse au résultat"
              get={i => s.mois[i].cogs} total={s.total.cogs} />
            <Ligne label="Variation de stock" signe
              aide="(stock fin − stock début) × coût de revient : elle neutralise le coût des exemplaires encore en carton"
              get={i => s.mois[i].variationStock} total={s.total.variationStock} />
            <Ligne label="MARGE SUR VENTES" fort signe
              aide="Ventes − coût des exemplaires vendus. C'est l'effet net du stock sur le résultat."
              get={i => s.mois[i].marge} total={s.total.marge} />
            <Ligne label="Valeur du stock à la clôture du mois"
              aide="Stock × coût de revient — c'est ce qui figure à l'actif"
              get={i => s.mois[i].valeurStock} total={s.total.valeurStock} />
          </tbody>
        </table>
      </div>
    </Card>
  );
}
