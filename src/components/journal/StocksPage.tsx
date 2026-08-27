/**
 * Les stocks réels, jeu par jeu.
 *
 * Le journal enregistre des euros ; cette page enregistre des **exemplaires**.
 * Un tirage entre, une vente sort, une casse aussi, un inventaire corrige. De
 * ces mouvements se déduisent le stock, sa valeur au coût moyen pondéré, et la
 * marge réellement dégagée — c'est-à-dire les ventes diminuées du coût des
 * seuls exemplaires sortis.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2, Boxes } from 'lucide-react';
import { useStore } from '../../store';
import type { MouvementStock } from '../../types';
import {
  EXERCICES, compareMois, exerciceDuMois, formatDateFR, labelMois, moisDeDate, moisExercice,
  todayISO,
} from '../../utils/dates';
import { euros, euros0, r2 } from '../../utils/money';
import { couleurJeu, encreSur, voileSur } from '../../utils/jeux';
import {
  mouvementsExercice, positionsStock, sensMouvement, stocksExercice,
} from '../../utils/stock';
import { useEtatVue } from '../../utils/etatVue';
import { PageHeader, Card, Btn, StatCard, MoneyInput, ExerciceTabs } from '../ui';

const AUCUN_JEU: string[] = [];

const TYPES: { cle: MouvementStock['type']; label: string; aide: string }[] = [
  { cle: 'fabrication', label: 'Fabrication', aide: "Un tirage sort d'usine : les exemplaires entrent en stock" },
  { cle: 'vente', label: 'Vente', aide: 'Des exemplaires partent chez un client ou un distributeur' },
  { cle: 'perte', label: 'Perte / casse', aide: 'Des exemplaires sortent sans recette' },
  { cle: 'ajustement', label: 'Inventaire', aide: 'Correction après comptage physique' },
];

export function StocksPage() {
  const mouvements = useStore(s => s.mouvementsStock);
  const stocks = useStore(s => s.stocks);
  const refs = useStore(s => s.referentiels);
  const jeux = refs.jeux ?? AUCUN_JEU;
  const addMouvementStock = useStore(s => s.addMouvementStock);
  const updateMouvementStock = useStore(s => s.updateMouvementStock);
  const removeMouvementStock = useStore(s => s.removeMouvementStock);

  const [exercice, setExercice] = useEtatVue('stocks.exercice', '2025-26',
    v => (EXERCICES as readonly string[]).includes(v));

  const duMois = useMemo(
    () => mouvementsExercice(mouvements, exercice), [mouvements, exercice]);
  // La position tient compte de tout l'historique, pas seulement de l'exercice.
  const positions = useMemo(() => positionsStock(mouvements, jeux), [mouvements, jeux]);
  const prevu = useMemo(() => stocksExercice(stocks, exercice, jeux), [stocks, exercice, jeux]);

  const totalStock = positions.reduce((s, p) => s + p.stock, 0);
  const valeurStock = r2(positions.reduce((s, p) => s + p.valeur, 0));
  const totalCA = r2(positions.reduce((s, p) => s + p.ca, 0));
  const totalMarge = r2(positions.reduce((s, p) => s + p.marge, 0));

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Stocks"
        subtitle="Les exemplaires, pas les euros : ce qui sort d'usine, ce qui s'écoule, ce qui reste en carton"
        tabs={
          <ExerciceTabs
            exercice={exercice} exercices={EXERCICES}
            badgeOf={ex => mouvements.filter(m => exerciceDuMois(m.mois) === ex).length}
            onChange={setExercice}
          />
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Exemplaires en stock" value={String(totalStock)} tone="neutral"
          sub={`${positions.length} jeu${positions.length > 1 ? 'x' : ''} suivi${positions.length > 1 ? 's' : ''}`} />
        <StatCard label="Valeur du stock" value={euros0(valeurStock)} tone="accent"
          sub="au coût moyen pondéré — c'est ce qui figure à l'actif" />
        <StatCard label="Ventes enregistrées (HT)" value={euros0(totalCA)} tone="good" />
        <StatCard label="Marge dégagée" value={euros0(totalMarge)}
          tone={totalMarge >= 0 ? 'good' : 'bad'} sub="ventes − coût des exemplaires sortis" />
      </div>

      {/* ---------------------------------------------- Position par jeu --- */}
      <Card title="Position de chaque jeu" className="mb-5">
        {positions.length ? (
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table="stocks:positions" className="sheet text-sm border-collapse w-full">
              <thead>
                <tr className="text-left" style={{ color: '#5c5280' }}>
                  <th className="min-w-40">Jeu</th>
                  <th className="text-right">Entrés</th>
                  <th className="text-right">Sortis</th>
                  <th className="text-right">En stock</th>
                  <th className="text-right">Coût moyen</th>
                  <th className="text-right">Valeur du stock</th>
                  <th className="text-right">Ventes HT</th>
                  <th className="text-right">Coût des ventes</th>
                  <th className="text-right">Marge</th>
                  <th className="text-right">Prévu (clôture)</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(pos => {
                  const c = couleurJeu(pos.jeu, refs);
                  const p = prevu.find(x => x.ligne.jeu === pos.jeu);
                  return (
                    <tr key={pos.jeu}>
                      <td>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: c, color: encreSur(c) }}>{pos.jeu}</span>
                      </td>
                      <td className="text-right tabular-nums">{pos.entrees || '·'}</td>
                      <td className="text-right tabular-nums">{pos.sorties || '·'}</td>
                      <td className="text-right tabular-nums font-bold">{pos.stock}</td>
                      <td className="text-right tabular-nums">{pos.coutMoyen ? euros(pos.coutMoyen) : '·'}</td>
                      <td className="text-right tabular-nums font-medium"
                        style={{ backgroundColor: voileSur(c, 0.18) }}>{euros(pos.valeur)}</td>
                      <td className="text-right tabular-nums">{pos.ca ? euros(pos.ca) : '·'}</td>
                      <td className="text-right tabular-nums">{pos.cogs ? euros(pos.cogs) : '·'}</td>
                      <td className="text-right tabular-nums font-bold"
                        style={pos.marge ? { color: pos.marge > 0 ? '#38761d' : '#b7332e' } : undefined}>
                        {pos.marge ? euros(pos.marge) : '·'}
                      </td>
                      <td className="text-right tabular-nums" style={{ color: '#9a92b5' }}
                        title="Stock prévu à la clôture, dans l'onglet Stock du prévisionnel">
                        {p ? p.total.stockFin : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="total-bloc">
                  <td>TOTAL</td>
                  <td className="text-right tabular-nums">{positions.reduce((s, p) => s + p.entrees, 0)}</td>
                  <td className="text-right tabular-nums">{positions.reduce((s, p) => s + p.sorties, 0)}</td>
                  <td className="text-right tabular-nums">{totalStock}</td>
                  <td></td>
                  <td className="text-right tabular-nums grand">{euros(valeurStock)}</td>
                  <td className="text-right tabular-nums">{euros(totalCA)}</td>
                  <td className="text-right tabular-nums">
                    {euros(r2(positions.reduce((s, p) => s + p.cogs, 0)))}
                  </td>
                  <td className="text-right tabular-nums grand">{euros(totalMarge)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm inline-flex items-center gap-2" style={{ color: '#6f6690' }}>
            <Boxes size={16} /> Aucun mouvement enregistré. Ajoute un tirage ci-dessous pour ouvrir un stock.
          </p>
        )}
      </Card>

      <NouveauMouvement jeux={jeux} exercice={exercice} onAjouter={addMouvementStock} />

      {/* ------------------------------------------------- Mouvements ------ */}
      <Card title={`Mouvements de l'exercice ${exercice}`} className="mt-5">
        {duMois.length ? (
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-table="stocks:mouvements" className="sheet text-sm border-collapse w-full">
              <thead>
                <tr className="text-left" style={{ color: '#5c5280' }}>
                  <th>Date</th><th>Mois</th><th className="min-w-32">Jeu</th><th>Type</th>
                  <th className="text-right">Quantité</th>
                  <th className="text-right">Prix unitaire HT</th>
                  <th className="text-right">Montant HT</th>
                  <th className="min-w-40">Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {duMois.map(m => {
                  const c = couleurJeu(m.jeu, refs);
                  const entree = sensMouvement(m.type) > 0;
                  return (
                    <tr key={m.id}>
                      <td>
                        <input type="date" value={m.date}
                          className="border border-transparent hover:border-[#ddd6ef] rounded px-1 py-0.5 bg-transparent"
                          onChange={e => updateMouvementStock(m.id, {
                            date: e.target.value, mois: moisDeDate(e.target.value),
                          })} />
                      </td>
                      <td style={{ color: '#6f6690' }}>{labelMois(m.mois)}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: c, color: encreSur(c) }}>{m.jeu}</span>
                      </td>
                      <td>
                        <select value={m.type}
                          className="border border-transparent hover:border-[#ddd6ef] rounded px-1 py-0.5 bg-transparent"
                          onChange={e => updateMouvementStock(m.id, { type: e.target.value as MouvementStock['type'] })}>
                          {TYPES.map(t => <option key={t.cle} value={t.cle}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="text-right tabular-nums"
                        style={{ color: entree ? '#38761d' : '#b7332e', fontWeight: 700 }}>
                        {entree ? '+' : '−'}{Math.abs(m.quantite)}
                      </td>
                      <td className="text-right p-0.5!">
                        <MoneyInput value={m.unitaire || null} className="w-24"
                          onCommit={v => updateMouvementStock(m.id, { unitaire: v ?? 0 })} />
                      </td>
                      <td className="text-right tabular-nums font-medium">
                        {euros(r2(Math.abs(m.quantite) * (m.unitaire || 0)))}
                      </td>
                      <td>
                        <input value={m.note ?? ''} placeholder="—"
                          className="w-full border border-transparent hover:border-[#ddd6ef] rounded px-1 py-0.5 bg-transparent"
                          onChange={e => updateMouvementStock(m.id, { note: e.target.value })} />
                      </td>
                      <td>
                        <button onClick={() => removeMouvementStock(m.id)} title="Supprimer ce mouvement"
                          style={{ color: '#b7332e' }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#6f6690' }}>
            Aucun mouvement sur {exercice}.
          </p>
        )}
      </Card>

      <p className="text-xs mt-4" style={{ color: '#9a92b5' }}>
        Les sorties sont valorisées au <b>coût moyen pondéré</b> des entrées — la méthode admise et
        la plus simple à justifier. La valeur du stock figure à l'actif : elle ne pèse pas sur le
        résultat tant que les exemplaires ne sont pas vendus. Le prévisionnel de stock, lui, se
        saisit dans <b>Prévisionnel → Stock</b> ; la dernière colonne compare les deux.
      </p>
    </div>
  );
}

function NouveauMouvement({ jeux, exercice, onAjouter }: {
  jeux: string[]; exercice: string;
  onAjouter: (mv: Omit<MouvementStock, 'id'>) => void;
}) {
  const [jeu, setJeu] = useState(jeux[0] ?? '');
  const [type, setType] = useState<MouvementStock['type']>('fabrication');
  const [date, setDate] = useState(todayISO());
  const [quantite, setQuantite] = useState('');
  const [unitaire, setUnitaire] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const mois = moisDeDate(date);
  const horsExercice = exerciceDuMois(mois) !== exercice;
  const moisDeLExercice = moisExercice(exercice);
  const dansLaPlage = moisDeLExercice.some(m => compareMois(m, mois) === 0);

  const valider = () => {
    const q = Number(quantite);
    if (!jeu || !q) return;
    onAjouter({ date, mois, jeu, type, quantite: Math.abs(q), unitaire: unitaire ?? 0, note: note || undefined });
    setQuantite(''); setNote('');
  };

  return (
    <Card title="Enregistrer un mouvement">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm" style={{ color: '#5c5280' }}>
          <div className="mb-0.5">Date</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border rounded px-2 py-1.5 bg-white" style={{ borderColor: 'var(--bbg-border)' }} />
        </label>
        <label className="text-sm" style={{ color: '#5c5280' }}>
          <div className="mb-0.5">Jeu</div>
          <select value={jeu} onChange={e => setJeu(e.target.value)}
            className="border rounded px-2 py-1.5 bg-white" style={{ borderColor: 'var(--bbg-border)' }}>
            {jeux.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </label>
        <label className="text-sm" style={{ color: '#5c5280' }}>
          <div className="mb-0.5">Type</div>
          <select value={type} onChange={e => setType(e.target.value as MouvementStock['type'])}
            title={TYPES.find(t => t.cle === type)?.aide}
            className="border rounded px-2 py-1.5 bg-white" style={{ borderColor: 'var(--bbg-border)' }}>
            {TYPES.map(t => <option key={t.cle} value={t.cle} title={t.aide}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-sm" style={{ color: '#5c5280' }}>
          <div className="mb-0.5">Quantité</div>
          <input type="number" min={1} value={quantite} onChange={e => setQuantite(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') valider(); }}
            className="border rounded px-2 py-1.5 w-24 text-right bg-white" style={{ borderColor: 'var(--bbg-border)' }} />
        </label>
        <label className="text-sm" style={{ color: '#5c5280' }}>
          <div className="mb-0.5">
            {type === 'vente' ? 'Prix de vente HT' : 'Coût de revient HT'}
          </div>
          <MoneyInput value={unitaire} onCommit={setUnitaire} className="w-28" placeholder="0 €" />
        </label>
        <label className="text-sm flex-1 min-w-40" style={{ color: '#5c5280' }}>
          <div className="mb-0.5">Note</div>
          <input value={note} onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') valider(); }}
            placeholder="Tirage n°1, salon de Cannes…"
            className="border rounded px-2 py-1.5 w-full bg-white" style={{ borderColor: 'var(--bbg-border)' }} />
        </label>
        <Btn variant="primary" onClick={valider} disabled={!jeu || !Number(quantite)}>
          <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Ajouter</span>
        </Btn>
      </div>
      {horsExercice && dansLaPlage === false && (
        <p className="text-xs mt-2" style={{ color: 'var(--bbg-orange-dark)' }}>
          Le {formatDateFR(date)} tombe dans l'exercice {exerciceDuMois(mois)} — le mouvement s'y rangera.
        </p>
      )}
    </Card>
  );
}
