import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, GripHorizontal, CalendarDays } from 'lucide-react';
import { useStore } from '../../store';
import type { ChronoEvent } from '../../types';
import { formatDateFR, todayISO } from '../../utils/dates';
import { PageHeader, Card, Btn, useSort, sortBy, ThSort } from '../ui';

// Palette catégorielle validée (dataviz) — ordre fixe, une couleur par projet
const COLORS = ['#674ea7', '#e69138', '#38761d', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

const LARGEUR_LIBELLE = 210;
/** Largeur d'un mois sur la frise, en pixels — règle aussi la finesse du glissé. */
const PX_MOIS = 34;
const PX_JOUR = PX_MOIS / 30.4375;
const JOUR_MS = 86_400_000;

/** Groupe racine d'un événement : « Jeu 1 - Tirage 2 » -> « Jeu 1 ». */
function racine(projet: string): string {
  return projet.split(' - ')[0].trim() || 'Autre';
}

const estDate = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s);
const jours = (iso: string) => Date.parse(iso + 'T00:00:00Z') / JOUR_MS;
function isoDe(j: number): string {
  return new Date(Math.round(j) * JOUR_MS).toISOString().slice(0, 10);
}
/** Durée en jours, bornes incluses. */
const duree = (debut: string, fin: string) => Math.round(jours(fin) - jours(debut)) + 1;

function libelleDuree(d: number): string {
  if (d <= 1) return 'jalon (1 jour)';
  if (d < 31) return `${d} jours`;
  const mois = d / 30.4375;
  return `${mois.toFixed(mois < 3 ? 1 : 0).replace('.', ',')} mois (${d} jours)`;
}

interface Glissement {
  id: string;
  mode: 'deplacer' | 'debut' | 'fin';
  xDepart: number;
  debut: string;
  fin: string;
}

export function ChronoPage() {
  const chronologie = useStore(s => s.chronologie);
  const addChrono = useStore(s => s.addChrono);
  const updateChrono = useStore(s => s.updateChrono);
  const removeChrono = useStore(s => s.removeChrono);
  const { sort, toggle } = useSort({ key: 'debut', dir: 'asc' });
  const [vue, setVue] = useState<'timeline' | 'liste'>('timeline');
  const [glisse, setGlisse] = useState<Glissement | null>(null);
  /** Aperçu pendant le glissé : on ne touche au store qu'au relâchement. */
  const [apercu, setApercu] = useState<{ id: string; debut: string; fin: string } | null>(null);
  const [survol, setSurvol] = useState<{ c: ChronoEvent; x: number; y: number } | null>(null);
  const [renomme, setRenomme] = useState<string | null>(null);
  const glisseRef = useRef<Glissement | null>(null);
  glisseRef.current = glisse;

  const valides = useMemo(() => chronologie.filter(c => estDate(c.debut)), [chronologie]);

  /** Un événement, éventuellement déplacé par le glissé en cours. */
  const vu = (c: ChronoEvent): ChronoEvent =>
    apercu && apercu.id === c.id ? { ...c, debut: apercu.debut, fin: apercu.fin } : c;

  const { origineJour, nMois, moisLabels, groupes } = useMemo(() => {
    const dates = valides.flatMap(c => [c.debut, estDate(c.fin) ? c.fin : c.debut]);
    const min = dates.length ? dates.reduce((a, b) => a < b ? a : b) : '2025-08-01';
    const max = dates.length ? dates.reduce((a, b) => a > b ? a : b) : '2030-09-30';
    const [y0, m0] = min.split('-').map(Number);
    const [y1, m1] = max.split('-').map(Number);
    const nMois = Math.max(12, (y1 - y0) * 12 + (m1 - m0) + 2);
    const moisLabels: { label: string; annee: string | null; debutMois: number }[] = [];
    const NOMS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    for (let i = 0; i < nMois; i++) {
      const m = (m0 - 1 + i) % 12;
      const y = y0 + Math.floor((m0 - 1 + i) / 12);
      moisLabels.push({
        label: NOMS[m], annee: m === 0 || i === 0 ? String(y) : null,
        debutMois: jours(`${y}-${String(m + 1).padStart(2, '0')}-01`),
      });
    }
    return { origineJour: jours(`${y0}-${String(m0).padStart(2, '0')}-01`), nMois, moisLabels, groupes: [...new Set(valides.map(c => racine(c.projet)))] };
  }, [valides]);

  const largeur = nMois * PX_MOIS;
  const x = (iso: string) => (jours(iso) - origineJour) * PX_JOUR;

  // Glissé : on suit la souris jusqu'au relâchement, puis on enregistre.
  useEffect(() => {
    if (!glisse) return;
    function bouge(ev: MouseEvent) {
      const g = glisseRef.current;
      if (!g) return;
      const dj = Math.round((ev.clientX - g.xDepart) / PX_JOUR);
      if (g.mode === 'deplacer') {
        setApercu({ id: g.id, debut: isoDe(jours(g.debut) + dj), fin: isoDe(jours(g.fin) + dj) });
      } else if (g.mode === 'debut') {
        const d = Math.min(jours(g.debut) + dj, jours(g.fin));
        setApercu({ id: g.id, debut: isoDe(d), fin: g.fin });
      } else {
        const f = Math.max(jours(g.fin) + dj, jours(g.debut));
        setApercu({ id: g.id, debut: g.debut, fin: isoDe(f) });
      }
    }
    function fin() {
      const g = glisseRef.current;
      setGlisse(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setApercu(a => {
        if (a && g && (a.debut !== g.debut || a.fin !== g.fin)) {
          updateChrono(a.id, { debut: a.debut, fin: a.fin });
        }
        return null;
      });
    }
    window.addEventListener('mousemove', bouge);
    window.addEventListener('mouseup', fin);
    return () => {
      window.removeEventListener('mousemove', bouge);
      window.removeEventListener('mouseup', fin);
    };
  }, [glisse, updateChrono]);

  function demarrer(ev: React.MouseEvent, c: ChronoEvent, mode: Glissement['mode']) {
    ev.preventDefault();
    ev.stopPropagation();
    const fin = estDate(c.fin) ? c.fin : c.debut;
    setGlisse({ id: c.id, mode, xDepart: ev.clientX, debut: c.debut, fin });
    setApercu({ id: c.id, debut: c.debut, fin });
    setSurvol(null);
    document.body.style.cursor = mode === 'deplacer' ? 'grabbing' : 'col-resize';
    document.body.style.userSelect = 'none';
  }

  const rows = sortBy(chronologie, sort, {
    projet: c => c.projet, action: c => c.action, debut: c => c.debut, fin: c => c.fin,
  });

  const ajouter = (projet = 'Nouveau projet') => addChrono({
    projet, action: 'Nouvelle étape',
    debut: todayISO(), fin: isoDe(jours(todayISO()) + 30), detail: '',
  });

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Chronologie 2025-30"
        subtitle="Glisse une barre pour la déplacer, attrape ses bords pour l'allonger ou la raccourcir"
        actions={
          <>
            <div className="flex rounded-md border overflow-hidden text-sm" style={{ borderColor: 'var(--bbg-border)' }}>
              {(['timeline', 'liste'] as const).map(v => (
                <button
                  key={v}
                  className="px-3 py-1.5 font-semibold transition-colors"
                  style={vue === v
                    ? { backgroundColor: 'var(--bbg-purple-dark)', color: '#fff' }
                    : { backgroundColor: '#fff', color: '#5c5280' }}
                  onClick={() => setVue(v)}
                >
                  {v === 'timeline' ? 'Frise' : 'Liste'}
                </button>
              ))}
            </div>
            <Btn variant="primary" onClick={() => ajouter()}>
              <span className="inline-flex items-center gap-1"><Plus size={14} /> Ajouter une étape</span>
            </Btn>
          </>
        }
      />

      {vue === 'timeline' && (
        <Card>
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <div style={{ minWidth: largeur + LARGEUR_LIBELLE }}>
              {/* En-tête années / mois */}
              <div className="flex sticky top-0 z-10 bg-white" style={{ paddingLeft: LARGEUR_LIBELLE }}>
                {moisLabels.map((m, i) => (
                  <div key={i} className="text-center shrink-0" style={{ width: PX_MOIS }}>
                    <div className="text-[10px] font-bold h-4" style={{ color: 'var(--bbg-purple-darker)' }}>{m.annee ?? ''}</div>
                    <div className="text-[10px]" style={{ color: '#9a92b5' }}>{m.label}</div>
                  </div>
                ))}
              </div>

              {groupes.map((g, gi) => {
                const evts = valides.filter(c => racine(c.projet) === g);
                const couleur = COLORS[gi % COLORS.length];
                return (
                  <div key={g} className="border-t py-1.5" style={{ borderColor: 'var(--bbg-border-soft)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: couleur }} />
                      <span className="text-xs font-bold" style={{ color: 'var(--bbg-purple-darker)' }}>{g}</span>
                      <button
                        className="text-[11px] underline opacity-60 hover:opacity-100"
                        style={{ color: 'var(--bbg-purple-dark)' }}
                        onClick={() => ajouter(g)}
                        title={`Ajouter une étape à ${g}`}
                      >
                        + étape
                      </button>
                    </div>
                    {evts.map(brut => {
                      const c = vu(brut);
                      const fin = estDate(c.fin) ? c.fin : c.debut;
                      const jalon = duree(c.debut, fin) <= 1;
                      const gauche = x(c.debut);
                      const largeurBarre = Math.max(jalon ? 12 : 22, duree(c.debut, fin) * PX_JOUR);
                      // Sur une barre courte, on rétrécit les poignées pour garder
                      // de quoi attraper le milieu et déplacer l'étape.
                      const poignee = largeurBarre < 34 ? 6 : 10;
                      const enCours = glisse?.id === c.id;
                      return (
                        <div key={c.id} className="flex items-center h-7 group">
                          <div
                            className="shrink-0 text-[11px] truncate pr-2 flex items-center gap-1"
                            style={{ width: LARGEUR_LIBELLE, color: '#6f6690' }}
                            title={`${c.projet} — ${c.action}`}
                          >
                            {renomme === c.id ? (
                              <input
                                autoFocus
                                className="flex-1 min-w-0 border rounded px-1 py-0.5 text-[11px]"
                                style={{ borderColor: 'var(--bbg-purple)' }}
                                defaultValue={c.action}
                                onBlur={ev => { updateChrono(c.id, { action: ev.target.value }); setRenomme(null); }}
                                onKeyDown={ev => {
                                  if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
                                  if (ev.key === 'Escape') setRenomme(null);
                                }}
                              />
                            ) : (
                              <span
                                className="truncate flex-1 cursor-text"
                                onDoubleClick={() => setRenomme(c.id)}
                                title="Double-clic pour renommer"
                              >
                                {c.projet !== g ? `${c.projet.slice(g.length).replace(/^ - /, '')} · ` : ''}{c.action}
                              </span>
                            )}
                            <button
                              data-chrono-suppr={c.id}
                              className="opacity-0 group-hover:opacity-100 shrink-0"
                              style={{ color: '#d98b86' }}
                              title="Supprimer cette étape"
                              onClick={() => { if (confirm(`Supprimer « ${c.projet} — ${c.action} » ?`)) removeChrono(c.id); }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="relative h-6" style={{ width: largeur }}>
                            {/* Repères de mois */}
                            {moisLabels.map((m, i) => (
                              <div key={i} className="absolute top-0 bottom-0 border-l"
                                style={{ left: i * PX_MOIS, borderColor: m.annee ? 'var(--bbg-border)' : '#f0edf8' }} />
                            ))}
                            <div
                              data-chrono-bar={c.id}
                              className="absolute top-1 h-4 rounded-full flex items-center"
                              style={{
                                left: gauche,
                                width: largeurBarre,
                                backgroundColor: couleur,
                                opacity: enCours ? 1 : 0.88,
                                boxShadow: enCours ? '0 0 0 2px #fff, 0 0 0 4px ' + couleur : undefined,
                                cursor: 'grab',
                              }}
                              onMouseDown={ev => demarrer(ev, brut, 'deplacer')}
                              onMouseEnter={ev => !glisse && setSurvol({ c, x: ev.clientX, y: ev.clientY })}
                              onMouseMove={ev => !glisse && setSurvol({ c, x: ev.clientX, y: ev.clientY })}
                              onMouseLeave={() => setSurvol(null)}
                            >
                              {!jalon && (
                                <>
                                  <span
                                    data-chrono-poignee="debut"
                                    className="absolute left-0 top-0 bottom-0 rounded-l-full opacity-0 group-hover:opacity-100"
                                    style={{ width: poignee, cursor: 'col-resize', backgroundColor: 'rgba(255,255,255,.55)' }}
                                    title="Décaler le début"
                                    onMouseDown={ev => demarrer(ev, brut, 'debut')}
                                  />
                                  <span
                                    data-chrono-poignee="fin"
                                    className="absolute right-0 top-0 bottom-0 rounded-r-full opacity-0 group-hover:opacity-100"
                                    style={{ width: poignee, cursor: 'col-resize', backgroundColor: 'rgba(255,255,255,.55)' }}
                                    title="Décaler la fin"
                                    onMouseDown={ev => demarrer(ev, brut, 'fin')}
                                  />
                                  <GripHorizontal
                                    size={10} className="mx-auto opacity-0 group-hover:opacity-70 pointer-events-none"
                                    style={{ color: '#fff' }}
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: '#9a92b5' }}>
            <b>Glisse une barre</b> pour décaler l'étape sans changer sa durée ·
            <b> attrape son bord</b> gauche ou droit pour l'allonger ou la raccourcir ·
            <b> survole-la</b> pour voir le détail · <b>double-clic</b> sur un libellé pour le renommer ·
            <b> + étape</b> en ajoute une au projet.
            Une seule annulation (Cmd+Z) suffit à revenir en arrière après un déplacement.
          </p>
        </Card>
      )}

      {vue === 'liste' && (
        <Card>
          <table data-table="chrono" className="sheet text-sm border-collapse w-full">
            <thead>
              <tr className="text-left text-[#5c5280]">
                <ThSort label="Projet" k="projet" sort={sort} onToggle={toggle} />
                <ThSort label="Action" k="action" sort={sort} onToggle={toggle} />
                <ThSort label="Début" k="debut" sort={sort} onToggle={toggle} />
                <ThSort label="Fin" k="fin" sort={sort} onToggle={toggle} />
                <th className="num">Durée</th>
                <th>Détail</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => <RowC key={c.id} c={c} onUpdate={updateChrono} onRemove={removeChrono} />)}
            </tbody>
          </table>
        </Card>
      )}

      {survol && !glisse && <Bulle c={survol.c} x={survol.x} y={survol.y} />}
      {glisse && apercu && (
        <div
          data-chrono-pill
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full border shadow-lg text-sm"
          style={{ backgroundColor: 'var(--bbg-purple-light)', borderColor: 'var(--bbg-purple)', color: 'var(--bbg-purple-darker)' }}
        >
          <b>{formatDateFR(apercu.debut)} → {formatDateFR(apercu.fin)}</b>
          <span className="ml-2">{libelleDuree(duree(apercu.debut, apercu.fin))}</span>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Bulle ---

/** Ce que la souris révèle au survol d'une barre. */
function Bulle({ c, x, y }: { c: ChronoEvent; x: number; y: number }) {
  const fin = estDate(c.fin) ? c.fin : c.debut;
  const largeur = 300;
  const gauche = Math.min(x + 14, window.innerWidth - largeur - 12);
  const haut = y + 150 > window.innerHeight ? Math.max(8, y - 150) : y + 16;
  return (
    <div
      data-chrono-bulle
      className="fixed z-50 rounded-md shadow-lg border bg-white text-xs pointer-events-none"
      style={{ left: gauche, top: haut, width: largeur, borderColor: 'var(--bbg-border)' }}
    >
      <div className="px-3 py-1.5 border-b font-semibold rounded-t-md"
        style={{ backgroundColor: 'var(--bbg-lavender)', borderColor: 'var(--bbg-border-soft)', color: 'var(--bbg-purple-darker)' }}>
        {c.projet}
      </div>
      <div className="px-3 py-2 space-y-1">
        <div className="font-medium" style={{ color: '#3f3268' }}>{c.action}</div>
        <div className="flex items-center gap-1.5" style={{ color: '#5c5280' }}>
          <CalendarDays size={12} />
          {formatDateFR(c.debut)} → {formatDateFR(fin)}
        </div>
        <div style={{ color: '#6f6690' }}>{libelleDuree(duree(c.debut, fin))}</div>
        {c.detail && <div className="italic pt-1" style={{ color: '#6f6690' }}>{c.detail}</div>}
      </div>
    </div>
  );
}

function RowC({ c, onUpdate, onRemove }: {
  c: ChronoEvent;
  onUpdate: (id: string, patch: Partial<ChronoEvent>) => void;
  onRemove: (id: string) => void;
}) {
  const fin = estDate(c.fin) ? c.fin : c.debut;
  return (
    <tr className="group hover:bg-[#f4f1fb]">
      <td>
        <input className="border border-[#ddd6ef] rounded px-1.5 py-1 text-sm w-40"
          defaultValue={c.projet} onBlur={ev => onUpdate(c.id, { projet: ev.target.value })} />
      </td>
      <td>
        <input className="border border-[#ddd6ef] rounded px-1.5 py-1 text-sm w-52"
          defaultValue={c.action} onBlur={ev => onUpdate(c.id, { action: ev.target.value })} />
      </td>
      <td>
        <input type="date" className="border border-[#ddd6ef] rounded px-1 py-0.5 text-sm"
          value={c.debut} onChange={ev => ev.target.value && onUpdate(c.id, { debut: ev.target.value })} />
      </td>
      <td>
        <input type="date" className="border border-[#ddd6ef] rounded px-1 py-0.5 text-sm"
          value={c.fin} onChange={ev => ev.target.value && onUpdate(c.id, { fin: ev.target.value })} />
      </td>
      <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>
        {estDate(c.debut) ? libelleDuree(duree(c.debut, fin)) : '—'}
      </td>
      <td>
        <input className="border border-[#ddd6ef] rounded px-1.5 py-1 text-sm w-52"
          defaultValue={c.detail ?? ''} onBlur={ev => onUpdate(c.id, { detail: ev.target.value })} />
      </td>
      <td>
        <button className="text-[#d98b86] hover:text-[#b7332e] opacity-0 group-hover:opacity-100"
          onClick={() => { if (confirm(`Supprimer « ${c.projet} — ${c.action} » ?`)) onRemove(c.id); }}>
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
