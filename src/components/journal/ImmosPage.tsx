import { Fragment, useMemo } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useStore, type ColFormat } from '../../store';
import { labelMois, labelMoisLong, compareMois, todayISO, moisDeDate, formatDateFR } from '../../utils/dates';
import { euros, r2, tvaDepuisTTC } from '../../utils/money';
import { immoInfos, type ImmoInfo } from '../../utils/calc';
import { PageHeader, Card, StatCard, Btn, useSort, sortBy, ThSort } from '../ui';
import { DateCell, MoneyCell, AutoCompleteCell, ColFormatMenu, colStyle } from './cells';
import { useCibleLigne, type Cible } from '../../utils/cible';

/** Colonnes du tableau, en % : tout tient à l'écran. */
const COLS = [8, 11, 17, 13, 7, 7, 7, 5, 6.5, 6.5, 6.5, 3.5, 2];

const DUREES = [3, 5, 10, 15, 20];

export function ImmosPage({ cible }: { cible?: Cible }) {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const update = useStore(s => s.updateEntry);
  const remove = useStore(s => s.removeEntry);
  const addEntry = useStore(s => s.addEntry);
  const formats = useStore(s => s.journalFormats);
  const setColFormat = useStore(s => s.setColFormat);
  const resetColFormat = useStore(s => s.resetColFormat);
  const { sort, toggle } = useSort({ key: 'date', dir: 'asc' }, 'immos');

  const infos = useMemo(() => immoInfos(entries, refs), [entries, refs]);
  const today = todayISO();
  // Ligne visée depuis les contrôles comptables de la synthèse.
  useCibleLigne(cible);

  const fournisseurs = useMemo(() => {
    const noms = new Map<string, string>();
    for (const e of entries) { const n = e.fournisseur.trim(); if (n) noms.set(n.toLowerCase(), n); }
    return [...noms.values()].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [entries]);

  /** Les immobilisations sont regroupées par mois d'acquisition, comme dans le tableur. */
  const parMois = useMemo(() => {
    const m = new Map<string, ImmoInfo[]>();
    for (const i of infos) {
      const cle = i.entry.mois;
      if (!m.has(cle)) m.set(cle, []);
      m.get(cle)!.push(i);
    }
    for (const [, list] of m) {
      const tri = sortBy(list, sort, {
        date: i => i.entry.date, fournisseur: i => i.entry.fournisseur,
        description: i => i.entry.description, categorie: i => i.entry.categorie,
        ttc: i => i.entry.ttc, tva: i => i.entry.tva, ht: i => i.entry.ht,
        duree: i => i.duree, dotAn: i => i.dotationAn, dotMois: i => i.dotationMois,
        vnc: i => i.vnc(today), fin: i => i.fin,
      });
      list.splice(0, list.length, ...tri);
    }
    return [...m.entries()].sort((a, b) => compareMois(a[0], b[0]));
  }, [infos, sort, today]);

  const tot = {
    ttc: r2(infos.reduce((s, i) => s + i.entry.ttc, 0)),
    tva: r2(infos.reduce((s, i) => s + i.entry.tva, 0)),
    ht: r2(infos.reduce((s, i) => s + i.entry.ht, 0)),
    dotAn: r2(infos.reduce((s, i) => s + i.dotationAn, 0)),
    dotMois: r2(infos.reduce((s, i) => s + i.dotationMois, 0)),
    vnc: r2(infos.reduce((s, i) => s + i.vnc(today), 0)),
  };

  const fmtMenu = (col: string) => (
    <ColFormatMenu
      col={col} format={formats[`immo:${col}`]}
      onChange={(patch: ColFormat) => setColFormat(`immo:${col}`, patch)}
      onReset={() => resetColFormat(`immo:${col}`)}
    />
  );
  const st = (col: string) => colStyle(formats[`immo:${col}`]);

  function ajouter() {
    const d = todayISO();
    addEntry({
      date: d, fournisseur: '', description: '', categorie: refs.categoriesDepenses[0] ?? '',
      ttc: 0, tva: 0, ht: 0, paiement: refs.paiements[0] ?? 'CB BBG',
      type: 'immo', immoDureeAns: 5, compta: '', motsCles: '', facture: '',
      mois: moisDeDate(d),
    });
  }

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Immobilisations & dotations"
        subtitle="Regroupées par mois d'acquisition — amortissement linéaire, calculé automatiquement"
        actions={
          <Btn variant="primary" onClick={ajouter}>
            <span className="inline-flex items-center gap-1"><Plus size={14} /> Ajouter</span>
          </Btn>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="Immobilisations" value={String(infos.length)} />
        <StatCard label="Valeur d'acquisition (HT)" value={euros(tot.ht)} />
        <StatCard label="Dotation annuelle" value={euros(tot.dotAn)} tone="accent" />
        <StatCard label="Dotation mensuelle" value={euros(tot.dotMois)} tone="accent" />
        <StatCard label="Valeur nette comptable" value={euros(tot.vnc)} tone="good"
          sub={`au ${formatDateFR(today)}`} />
      </div>

      <Card>
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="immos" className="sheet text-[13px]" style={{ tableLayout: 'fixed', minWidth: 1200 }}>
            <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
            <thead>
              <tr>
                <ThSort label="Date" k="date" sort={sort} onToggle={toggle} extra={fmtMenu('date')} />
                <ThSort label="Fournisseur" k="fournisseur" sort={sort} onToggle={toggle} extra={fmtMenu('fournisseur')} />
                <ThSort label="Description" k="description" sort={sort} onToggle={toggle} extra={fmtMenu('description')} />
                <ThSort label="Catégorie" k="categorie" sort={sort} onToggle={toggle} extra={fmtMenu('categorie')} />
                <ThSort label="TTC" k="ttc" sort={sort} onToggle={toggle} className="num" extra={fmtMenu('ttc')} />
                <ThSort label="TVA" k="tva" sort={sort} onToggle={toggle} className="num" extra={fmtMenu('tva')} />
                <ThSort label="HT" k="ht" sort={sort} onToggle={toggle} className="num" extra={fmtMenu('ht')} />
                <ThSort label="Durée" k="duree" sort={sort} onToggle={toggle} extra={fmtMenu('duree')} />
                <ThSort label="Dot. /an" k="dotAn" sort={sort} onToggle={toggle} className="num" extra={fmtMenu('dotAn')} />
                <ThSort label="Dot. /mois" k="dotMois" sort={sort} onToggle={toggle} className="num" extra={fmtMenu('dotMois')} />
                <ThSort label="VNC" k="vnc" sort={sort} onToggle={toggle} className="num" extra={fmtMenu('vnc')} />
                <ThSort label="Fin" k="fin" sort={sort} onToggle={toggle} extra={fmtMenu('fin')} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parMois.map(([mois, list]) => {
                const sTTC = r2(list.reduce((s, i) => s + i.entry.ttc, 0));
                const sHT = r2(list.reduce((s, i) => s + i.entry.ht, 0));
                const sTVA = r2(list.reduce((s, i) => s + i.entry.tva, 0));
                const sAn = r2(list.reduce((s, i) => s + i.dotationAn, 0));
                const sMois = r2(list.reduce((s, i) => s + i.dotationMois, 0));
                const sVnc = r2(list.reduce((s, i) => s + i.vnc(today), 0));
                const annee = mois === 'pre-immat' ? 2025 : Number(mois.slice(0, 4));
                return (
                  <Fragment key={mois}>
                    <tr className="band-purple">
                      <td colSpan={COLS.length} className="py-1">
                        {labelMoisLong(mois)}
                        <span style={{ fontWeight: 400, color: '#6f6690' }}> — {list.length} immobilisation{list.length > 1 ? 's' : ''}</span>
                      </td>
                    </tr>
                    {list.map(i => {
                      const e = i.entry;
                      return (
                        <tr key={e.id} data-ligne={e.id} className="group">
                          <td><DateCell value={e.date} anneeRef={annee} style={st('date')}
                            onCommit={v => update(e.id, { date: v })} /></td>
                          <td>
                            <AutoCompleteCell value={e.fournisseur} options={fournisseurs} style={st('fournisseur')}
                              onCommit={v => update(e.id, { fournisseur: v })} />
                          </td>
                          <td>
                            <input defaultValue={e.description} style={st('description')} title={e.description}
                              onBlur={ev => ev.target.value !== e.description && update(e.id, { description: ev.target.value })}
                              onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }} />
                          </td>
                          <td>
                            <select className="pill-orange" style={st('categorie')} value={e.categorie}
                              onChange={ev => update(e.id, { categorie: ev.target.value })}>
                              {!refs.categoriesDepenses.includes(e.categorie) && e.categorie &&
                                <option value={e.categorie}>{e.categorie}</option>}
                              {refs.categoriesDepenses.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td>
                            <MoneyCell value={e.ttc} style={st('ttc')} onCommit={v => {
                              const ttc = v ?? 0;
                              // Le taux implicite est conservé quand on corrige le TTC.
                              const taux = e.ttc ? (e.tva / e.ttc) : 0;
                              const tva = r2(Math.abs(taux - 1 / 6) < 0.002 ? tvaDepuisTTC(ttc, 20) : ttc * taux);
                              update(e.id, { ttc, tva, ht: r2(ttc - tva) });
                            }} />
                          </td>
                          <td>
                            <MoneyCell value={e.tva} style={st('tva')} onCommit={v => {
                              const tva = v ?? 0;
                              update(e.id, { tva, ht: r2(e.ttc - tva) });
                            }} />
                          </td>
                          <td className="text-right tabular-nums font-semibold"
                            style={{ color: 'var(--bbg-purple-darker)', ...st('ht') }}>{euros(e.ht)}</td>
                          <td>
                            <select className="pill-blue" title="Durée d'amortissement"
                              style={st('duree')} value={e.immoDureeAns ?? 5}
                              onChange={ev => update(e.id, { immoDureeAns: Number(ev.target.value) })}>
                              {DUREES.map(d => <option key={d} value={d}>{d} ans</option>)}
                            </select>
                          </td>
                          <td className="text-right tabular-nums" style={st('dotAn')}>{euros(i.dotationAn)}</td>
                          <td className="text-right tabular-nums" style={st('dotMois')}>{euros(i.dotationMois)}</td>
                          <td className="text-right tabular-nums" style={st('vnc')}>{euros(i.vnc(today))}</td>
                          <td className="text-xs" style={{ color: '#6f6690', ...st('fin') }}>{formatDateFR(i.fin)}</td>
                          <td>
                            <button
                              className="mx-auto block opacity-0 group-hover:opacity-100"
                              style={{ color: '#d98b86' }} title="Supprimer"
                              onClick={() => { if (confirm(`Supprimer « ${e.description || e.fournisseur} » ?`)) remove(e.id); }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="band-soft">
                      <td colSpan={4} className="text-right">Sous-total {labelMois(mois)}</td>
                      <td className="text-right tabular-nums">{euros(sTTC)}</td>
                      <td className="text-right tabular-nums">{euros(sTVA)}</td>
                      <td className="text-right tabular-nums">{euros(sHT)}</td>
                      <td></td>
                      <td className="text-right tabular-nums">{euros(sAn)}</td>
                      <td className="text-right tabular-nums">{euros(sMois)}</td>
                      <td className="text-right tabular-nums">{euros(sVnc)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Totaux ({infos.length} immobilisations)</td>
                <td className="text-right tabular-nums">{euros(tot.ttc)}</td>
                <td className="text-right tabular-nums">{euros(tot.tva)}</td>
                <td className="text-right tabular-nums">{euros(tot.ht)}</td>
                <td></td>
                <td className="text-right tabular-nums">{euros(tot.dotAn)}</td>
                <td className="text-right tabular-nums">{euros(tot.dotMois)}</td>
                <td className="text-right tabular-nums">{euros(tot.vnc)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
          Tout est éditable, comme dans le journal : l'icône palette de chaque en-tête règle
          gras, italique, couleur et alignement de la colonne. La VNC (valeur nette comptable)
          est la valeur restant à amortir au {formatDateFR(today)} ; « Fin » est la date de fin
          d'amortissement. Ajouter une ligne ici crée une écriture de type « immo » dans le journal.
        </p>
      </Card>
    </div>
  );
}
