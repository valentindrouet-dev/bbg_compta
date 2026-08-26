import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import type { ChronoEvent } from '../../types';
import { formatDateFR, todayISO } from '../../utils/dates';
import { PageHeader, Card, Btn, useSort, sortBy, ThSort } from '../ui';

// Palette catégorielle validée (dataviz) — ordre fixe, une couleur par projet
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

/** Groupe racine d'un événement : « Jeu 1 - Tirage 2 » -> « Jeu 1 ». */
function racine(projet: string): string {
  return projet.split(' - ')[0].trim() || 'Autre';
}

function moisIndex(iso: string, origine: string): number {
  const [y0, m0] = origine.split('-').map(Number);
  const [y, m] = iso.split('-').map(Number);
  return (y - y0) * 12 + (m - m0);
}

export function ChronoPage() {
  const chronologie = useStore(s => s.chronologie);
  const addChrono = useStore(s => s.addChrono);
  const updateChrono = useStore(s => s.updateChrono);
  const removeChrono = useStore(s => s.removeChrono);
  const { sort, toggle } = useSort({ key: 'debut', dir: 'asc' });
  const [vue, setVue] = useState<'timeline' | 'liste'>('timeline');

  const valides = useMemo(() => chronologie.filter(c => /^\d{4}-\d{2}-\d{2}/.test(c.debut)), [chronologie]);

  const { origine, nMois, moisLabels, groupes } = useMemo(() => {
    const dates = valides.flatMap(c => [c.debut, c.fin].filter(d => /^\d{4}-\d{2}/.test(d)));
    const min = dates.length ? dates.reduce((a, b) => a < b ? a : b) : '2025-08-01';
    const max = dates.length ? dates.reduce((a, b) => a > b ? a : b) : '2030-09-01';
    const origine = min.slice(0, 7) + '-01';
    const nMois = Math.max(12, moisIndex(max, origine) + 2);
    const moisLabels: { label: string; annee: string | null }[] = [];
    const [y0, m0] = origine.split('-').map(Number);
    const NOMS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    for (let i = 0; i < nMois; i++) {
      const m = (m0 - 1 + i) % 12;
      const y = y0 + Math.floor((m0 - 1 + i) / 12);
      moisLabels.push({ label: NOMS[m], annee: m === 0 || i === 0 ? String(y) : null });
    }
    const groupes = [...new Set(valides.map(c => racine(c.projet)))];
    return { origine, nMois, moisLabels, groupes };
  }, [valides]);

  const rows = sortBy(chronologie, sort, {
    projet: c => c.projet,
    action: c => c.action,
    debut: c => c.debut,
    fin: c => c.fin,
  });

  return (
    <div className="p-6 max-w-full">
      <PageHeader
        title="Chronologie 2025-30"
        subtitle="Jalons de développement, tirages, sorties et périodes de ventes"
        actions={
          <>
            <div className="flex rounded-md border border-gray-300 overflow-hidden text-sm">
              {(['timeline', 'liste'] as const).map(v => (
                <button
                  key={v}
                  className={`px-3 py-1.5 ${vue === v ? 'bg-yellow-500 text-gray-900 font-semibold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  onClick={() => setVue(v)}
                >
                  {v === 'timeline' ? 'Frise' : 'Liste'}
                </button>
              ))}
            </div>
            <Btn variant="primary" onClick={() => addChrono({ projet: 'Nouveau', action: 'Action', debut: todayISO(), fin: todayISO(), detail: '' })}>
              <span className="inline-flex items-center gap-1"><Plus size={14} /> Ajouter</span>
            </Btn>
          </>
        }
      />

      {vue === 'timeline' && (
        <Card>
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <div style={{ minWidth: nMois * 26 + 200 }}>
              {/* En-tête années/mois */}
              <div className="flex ml-[200px]">
                {moisLabels.map((m, i) => (
                  <div key={i} className="w-[26px] text-center shrink-0">
                    <div className="text-[10px] font-bold text-gray-700 h-4">{m.annee ?? ''}</div>
                    <div className="text-[10px] text-gray-400">{m.label}</div>
                  </div>
                ))}
              </div>
              {groupes.map((g, gi) => {
                const evts = valides.filter(c => racine(c.projet) === g);
                return (
                  <div key={g} className="border-t border-gray-100 py-1.5">
                    <div className="text-xs font-bold text-gray-700 mb-1">{g}</div>
                    {evts.map(c => {
                      const start = Math.max(0, moisIndex(c.debut, origine));
                      const endISO = /^\d{4}-\d{2}/.test(c.fin) ? c.fin : c.debut;
                      const end = Math.min(nMois - 1, Math.max(start, moisIndex(endISO, origine)));
                      return (
                        <div key={c.id} className="flex items-center h-6 group">
                          <div className="w-[200px] shrink-0 text-[11px] text-gray-500 truncate pr-2" title={`${c.projet} — ${c.action}`}>
                            {c.projet !== g ? `${c.projet.slice(g.length).replace(/^ - /, '')} · ` : ''}{c.action}
                          </div>
                          <div className="relative flex-1 h-4" style={{ width: nMois * 26 }}>
                            <div
                              className="absolute h-4 rounded-full opacity-85 group-hover:opacity-100 transition-opacity"
                              style={{
                                left: start * 26,
                                width: Math.max(10, (end - start + 1) * 26 - 4),
                                backgroundColor: COLORS[gi % COLORS.length],
                              }}
                              title={`${c.action} : ${formatDateFR(c.debut)} → ${formatDateFR(c.fin)}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {vue === 'liste' && (
        <Card>
          <table className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-gray-600">
                <ThSort label="Projet" k="projet" sort={sort} onToggle={toggle} />
                <ThSort label="Action" k="action" sort={sort} onToggle={toggle} />
                <ThSort label="Début" k="debut" sort={sort} onToggle={toggle} />
                <ThSort label="Fin" k="fin" sort={sort} onToggle={toggle} />
                <th>Détail</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => <RowC key={c.id} c={c} onUpdate={updateChrono} onRemove={removeChrono} />)}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function RowC({ c, onUpdate, onRemove }: {
  c: ChronoEvent;
  onUpdate: (id: string, patch: Partial<ChronoEvent>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <tr className="group hover:bg-yellow-50/40">
      <td>
        <input className="border border-gray-200 rounded px-1.5 py-1 text-sm w-40"
          defaultValue={c.projet} onBlur={ev => onUpdate(c.id, { projet: ev.target.value })} />
      </td>
      <td>
        <input className="border border-gray-200 rounded px-1.5 py-1 text-sm w-52"
          defaultValue={c.action} onBlur={ev => onUpdate(c.id, { action: ev.target.value })} />
      </td>
      <td>
        <input type="date" className="border border-gray-200 rounded px-1 py-0.5 text-sm"
          value={c.debut} onChange={ev => ev.target.value && onUpdate(c.id, { debut: ev.target.value })} />
      </td>
      <td>
        <input type="date" className="border border-gray-200 rounded px-1 py-0.5 text-sm"
          value={c.fin} onChange={ev => ev.target.value && onUpdate(c.id, { fin: ev.target.value })} />
      </td>
      <td>
        <input className="border border-gray-200 rounded px-1.5 py-1 text-sm w-52"
          defaultValue={c.detail ?? ''} onBlur={ev => onUpdate(c.id, { detail: ev.target.value })} />
      </td>
      <td>
        <button className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
          onClick={() => { if (confirm(`Supprimer « ${c.projet} — ${c.action} » ?`)) onRemove(c.id); }}>
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
