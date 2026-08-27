import { Fragment, useMemo } from 'react';
import { SquareArrowOutUpRight, Lock } from 'lucide-react';
import { useStore, type ColFormat } from '../../store';
import { labelMois, labelMoisLong, compareMois, todayISO, formatDateFR } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { immoInfos, type ImmoInfo } from '../../utils/calc';
import { PageHeader, Card, StatCard, useSort, sortBy, ThSort } from '../ui';
import { ColFormatMenu, colStyle } from './cells';
import { useCibleLigne, type Cible } from '../../utils/cible';

/** Colonnes du tableau, en % : tout tient à l'écran. */
const COLS = [8, 11, 17, 13, 7, 7, 7, 5, 6.5, 6.5, 6.5, 3.5, 2];

/**
 * Les immobilisations, en lecture seule.
 *
 * C'est un compte rendu de ce qui a été saisi au **Journal du mois** : c'est lui
 * qui fait foi. Corriger un montant à deux endroits, c'est se donner deux
 * chances de se tromper — un clic sur une ligne ouvre l'écriture là où elle se
 * modifie, dans son mois.
 */
export function ImmosPage({ cible, onAllerA }: {
  cible?: Cible;
  onAllerA?: (page: 'journal', ligne: string) => void;
}) {
  const entries = useStore(s => s.entries);
  const refs = useStore(s => s.referentiels);
  const formats = useStore(s => s.journalFormats);
  const setColFormat = useStore(s => s.setColFormat);
  const resetColFormat = useStore(s => s.resetColFormat);
  const { sort, toggle } = useSort({ key: 'date', dir: 'asc' }, 'immos');

  const infos = useMemo(() => immoInfos(entries, refs), [entries, refs]);
  const today = todayISO();
  // Ligne visée depuis les contrôles comptables de la synthèse.
  useCibleLigne(cible);

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


  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Immobilisations & dotations"
        subtitle="Compte rendu de ce qui est saisi au Journal du mois — amortissement linéaire, calculé automatiquement"
        actions={
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-semibold"
            style={{ backgroundColor: '#e9f3ea', borderColor: '#9cc9a4', color: '#2c5d16' }}
            title="Rien ne se modifie ici : une immobilisation se saisit et se corrige au Journal du mois, dans son mois.">
            <Lock size={14} /> Lecture seule
          </span>
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
                          <td style={st('date')}>{formatDateFR(e.date)}</td>
                          <td style={st('fournisseur')}>{e.fournisseur}</td>
                          <td className="truncate" style={st('description')} title={e.description}>{e.description}</td>
                          <td style={st('categorie')}>
                            <span className="pill-orange px-2 py-0.5 rounded-full text-xs">{e.categorie}</span>
                          </td>
                          <td className="text-right tabular-nums" style={st('ttc')}>{euros(e.ttc)}</td>
                          <td className="text-right tabular-nums" style={st('tva')}>{euros(e.tva)}</td>
                          <td className="text-right tabular-nums font-semibold"
                            style={{ color: 'var(--bbg-purple-darker)', ...st('ht') }}>{euros(e.ht)}</td>
                          <td style={st('duree')}>
                            <span className="pill-blue px-2 py-0.5 rounded-full text-xs"
                              title="Durée d'amortissement — elle se règle sur la ligne, au Journal du mois">
                              {e.immoDureeAns ?? 5} ans
                            </span>
                          </td>
                          <td className="text-right tabular-nums" style={st('dotAn')}>{euros(i.dotationAn)}</td>
                          <td className="text-right tabular-nums" style={st('dotMois')}>{euros(i.dotationMois)}</td>
                          <td className="text-right tabular-nums" style={st('vnc')}>{euros(i.vnc(today))}</td>
                          <td className="text-xs" style={{ color: '#6f6690', ...st('fin') }}>{formatDateFR(i.fin)}</td>
                          <td>
                            <button
                              className="mx-auto block opacity-0 group-hover:opacity-100"
                              style={{ color: 'var(--bbg-purple-dark)' }}
                              title="Ouvrir cette écriture au Journal du mois, là où elle se modifie"
                              onClick={() => onAllerA?.('journal', e.id)}
                            >
                              <SquareArrowOutUpRight size={14} />
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
