import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, GripHorizontal, CalendarDays, FolderPlus, ChevronUp, ChevronDown, X,
  ZoomIn, ZoomOut, Smile, Lock, LockOpen,
} from 'lucide-react';
import { useStore } from '../../store';
import { useEtatVue } from '../../utils/etatVue';
import { COULEURS_JEUX, couleurJeu } from '../../utils/jeux';
import { memeJeu } from '../../utils/previsionnel';
import type { ChronoEvent } from '../../types';
import { EXERCICES, formatDateFR, todayISO } from '../../utils/dates';
import { PageHeader, Card, Btn, useSort, sortBy, ThSort } from '../ui';

/**
 * Couleur par défaut d'un projet, tirée de son NOM et non de son rang : ajouter
 * ou monter un projet ne repeint plus toute la frise. C'est la même palette
 * pastel que les jeux, pour que la frise et les tableaux se répondent.
 */
function couleurParDefaut(projet: string): string {
  let h = 0;
  for (const car of projet) h = (h * 31 + car.charCodeAt(0)) >>> 0;
  return COULEURS_JEUX[h % COULEURS_JEUX.length];
}

/** Références stables : un `?? {}` dans un sélecteur reboucle à l'infini. */
const SANS_ORDRE: string[] = [];
const SANS_COULEUR: Record<string, string> = {};

const LARGEUR_LIBELLE = 210;
/** Niveaux de zoom : largeur d'un mois en pixels. */
const ZOOMS = [18, 26, 34, 52, 80, 130] as const;
const ZOOM_DEFAUT = 34;
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
  /** Les autres étapes emmenées avec elle, quand plusieurs sont sélectionnées. */
  suite: { id: string; debut: string; fin: string }[];
}

/** Finesse du glissé : au mois, à la quinzaine, ou au jour près. */
type Pas = 'mois' | 'quinzaine' | 'jour';

const PAS_LABEL: Record<Pas, string> = {
  mois: 'au mois',
  quinzaine: 'à la quinzaine',
  jour: 'au jour',
};

/**
 * Ramène une date sur la borne la plus proche : le 1er du mois, ou le 1er / le
 * 16. Une bande ainsi posée s'aligne sur la grille au lieu de flotter à deux
 * jours près.
 */
function aimanter(iso: string, pas: Pas): string {
  if (pas === 'jour') return iso;
  const [y, m, d] = iso.split('-').map(Number);
  const dernier = new Date(y, m, 0).getDate();
  const bornes = pas === 'mois'
    ? [1, dernier + 1]
    : [1, 16, dernier + 1];
  let meilleure = bornes[0];
  for (const b of bornes) {
    if (Math.abs(b - d) < Math.abs(meilleure - d)) meilleure = b;
  }
  if (meilleure > dernier) {
    // On a basculé sur le mois suivant.
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(meilleure).padStart(2, '0')}`;
}

/** Fin de bande aimantée : la veille d'une borne, pour que deux bandes s'accolent. */
function aimanterFin(iso: string, pas: Pas): string {
  if (pas === 'jour') return iso;
  const cale = aimanter(isoDe(jours(iso) + 1), pas);
  return isoDe(jours(cale) - 1);
}

export function ChronoPage() {
  const chronologie = useStore(s => s.chronologie);
  // Le défaut est appliqué HORS du sélecteur : un `?? []` à l'intérieur
  // renverrait un tableau neuf à chaque rendu, et Zustand rebouclerait sans fin.
  const ordreProjets = useStore(s => s.referentiels.chronoProjets) ?? SANS_ORDRE;
  const couleursProjets = useStore(s => s.referentiels.chronoCouleurs) ?? SANS_COULEUR;
  const setCouleurProjet = useStore(s => s.setCouleurProjet);
  const refs = useStore(s => s.referentiels);
  const setJeuMeta = useStore(s => s.setJeuMeta);

  /** Le jeu du catalogue que ce projet désigne, s'il en désigne un. */
  const jeuDuProjet = (projet: string) =>
    (refs.jeux ?? []).find(j => memeJeu(j, projet)) ?? '';

  /**
   * La couleur du projet. Quand le projet EST un jeu, c'est la couleur du jeu
   * qui commande — celle choisie dans l'onglet Jeux, la même partout. Sinon,
   * celle réglée ici, ou celle que son nom lui vaut.
   */
  const couleurDe = (projet: string) => {
    const jeu = jeuDuProjet(projet);
    if (jeu) return couleurJeu(jeu, refs);
    return couleursProjets[projet] || couleurParDefaut(projet);
  };

  /** Peindre un projet : si c'est un jeu, la couleur part dans sa fiche. */
  const peindre = (projet: string, couleur: string) => {
    const jeu = jeuDuProjet(projet);
    if (jeu) setJeuMeta(jeu, { couleur });
    else setCouleurProjet(projet, couleur);
  };
  const addChrono = useStore(s => s.addChrono);
  const updateChrono = useStore(s => s.updateChrono);
  const updateChronos = useStore(s => s.updateChronos);
  const decalerChronos = useStore(s => s.decalerChronos);
  const removeChrono = useStore(s => s.removeChrono);
  const removeChronos = useStore(s => s.removeChronos);
  const renommerProjet = useStore(s => s.renommerProjet);
  const supprimerProjet = useStore(s => s.supprimerProjet);
  const setOrdreProjets = useStore(s => s.setOrdreProjets);
  const deplacerChrono = useStore(s => s.deplacerChrono);
  const { sort, toggle } = useSort({ key: 'debut', dir: 'asc' }, 'chrono');
  const [vue, setVue] = useState<'timeline' | 'liste'>('timeline');
  const [glisse, setGlisse] = useState<Glissement | null>(null);
  /** Aperçu pendant le glissé : on ne touche au store qu'au relâchement. */
  const [apercu, setApercu] = useState<
    { id: string; debut: string; fin: string; suite: { id: string; debut: string; fin: string }[] } | null
  >(null);
  const [survol, setSurvol] = useState<{ c: ChronoEvent; x: number; y: number } | null>(null);
  const [renomme, setRenomme] = useState<string | null>(null);
  const [renommeProjet, setRenommeProjet] = useState<string | null>(null);
  /** Étapes sélectionnées : elles se déplacent et se suppriment ensemble. */
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [pas, setPas] = useEtatVue<Pas>('chrono.pas', 'quinzaine');
  /** Largeur d'un mois : c'est le zoom de la frise. */
  const [pxMois, setPxMois] = useEtatVue<number>('chrono.zoom', ZOOM_DEFAUT,
    v => typeof v === 'number' && v >= ZOOMS[0] && v <= ZOOMS[ZOOMS.length - 1]);
  const pxJour = pxMois / 30.4375;
  const selRef = useRef<Set<string>>(new Set());
  selRef.current = selection;
  const pasRef = useRef<Pas>(pas);
  pasRef.current = pas;
  const pxJourRef = useRef(pxJour);
  pxJourRef.current = pxJour;
  const glisseRef = useRef<Glissement | null>(null);
  glisseRef.current = glisse;

  const valides = useMemo(() => chronologie.filter(c => estDate(c.debut)), [chronologie]);

  /** Un événement, éventuellement déplacé par le glissé en cours. */
  const vu = (c: ChronoEvent): ChronoEvent =>
    apercu && apercu.id === c.id ? { ...c, debut: apercu.debut, fin: apercu.fin } : c;

  /**
   * La fenêtre de la frise est calée sur des ANNÉES ENTIÈRES.
   *
   * Elle se déduisait des dates extrêmes, au mois près : tirer une barre un peu
   * avant la plus ancienne déplaçait l'origine, et toutes les autres barres
   * sautaient d'autant. En arrondissant au 1er janvier et au 31 décembre, un
   * déplacement ordinaire ne bouge plus rien autour.
   */
  const { origineJour, nMois, moisLabels, groupes, exercices } = useMemo(() => {
    const dates = valides.flatMap(c => [c.debut, estDate(c.fin) ? c.fin : c.debut]);
    const min = dates.length ? dates.reduce((a, b) => a < b ? a : b) : '2025-08-01';
    const max = dates.length ? dates.reduce((a, b) => a > b ? a : b) : '2030-09-30';
    const y0 = Number(min.slice(0, 4));
    const y1 = Math.max(Number(max.slice(0, 4)), y0 + 1);
    const nMois = (y1 - y0 + 1) * 12;
    const moisLabels: { label: string; annee: string | null; debutMois: number }[] = [];
    const NOMS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    for (let i = 0; i < nMois; i++) {
      const m = i % 12;
      const y = y0 + Math.floor(i / 12);
      moisLabels.push({
        label: NOMS[m], annee: m === 0 ? String(y) : null,
        debutMois: jours(`${y}-${String(m + 1).padStart(2, '0')}-01`),
      });
    }
    const vus = [...new Set(valides.map(c => racine(c.projet)))];
    const groupes = [
      ...ordreProjets.filter(p => vus.includes(p)),
      ...vus.filter(p => !ordreProjets.includes(p)),
    ];
    // Les bornes d'exercice : l'année comptable court du 1er octobre au
    // 30 septembre. C'est elle qui décide dans quel exercice tombe une étape,
    // pas l'année civile — la frise doit donc la montrer.
    const exercices: { cle: string; debut: number; fin: number }[] = [];
    for (const ex of EXERCICES) {
      const y = Number(ex.slice(0, 4));
      const debut = jours(`${y}-10-01`);
      const fin = jours(`${y + 1}-10-01`);
      exercices.push({ cle: ex, debut, fin });
    }
    return { origineJour: jours(`${y0}-01-01`), nMois, moisLabels, groupes, exercices };
  }, [valides, ordreProjets]);

  const largeur = nMois * pxMois;
  /** Les exercices projetés sur la frise, bornés à sa largeur. */
  const bandesExercice = exercices.map(e => {
    const g = (e.debut - origineJour) * pxJour;
    const d = (e.fin - origineJour) * pxJour;
    return { cle: e.cle, gauche: Math.max(0, g), largeur: Math.min(largeur, d) - Math.max(0, g), depart: g };
  }).filter(b => b.largeur > 0 && b.gauche < largeur);
  /** Position du jour en cours sur la frise, recalculée à chaque affichage. */
  const xAujourdhui = (jours(todayISO()) - origineJour) * pxJour;
  const x = (iso: string) => (jours(iso) - origineJour) * pxJour;

  // Glissé : on suit la souris jusqu'au relâchement, puis on enregistre.
  useEffect(() => {
    if (!glisse) return;
    function bouge(ev: MouseEvent) {
      const g = glisseRef.current;
      if (!g) return;
      const p = pasRef.current;
      const dj = Math.round((ev.clientX - g.xDepart) / pxJourRef.current);
      if (g.mode === 'deplacer') {
        // On aimante le début, puis on reporte le même décalage sur la fin et
        // sur les étapes emmenées : leurs durées et leurs écarts sont préservés.
        const debut = aimanter(isoDe(jours(g.debut) + dj), p);
        const cale = Math.round(jours(debut) - jours(g.debut));
        setApercu({
          id: g.id, debut, fin: isoDe(jours(g.fin) + cale),
          suite: g.suite.map(x => ({
            id: x.id, debut: isoDe(jours(x.debut) + cale), fin: isoDe(jours(x.fin) + cale),
          })),
        });
      } else if (g.mode === 'debut') {
        const d = aimanter(isoDe(Math.min(jours(g.debut) + dj, jours(g.fin))), p);
        setApercu({ id: g.id, debut: d > g.fin ? g.fin : d, fin: g.fin, suite: [] });
      } else {
        const f = aimanterFin(isoDe(Math.max(jours(g.fin) + dj, jours(g.debut))), p);
        setApercu({ id: g.id, debut: g.debut, fin: f < g.debut ? g.debut : f, suite: [] });
      }
    }
    function fin() {
      const g = glisseRef.current;
      setGlisse(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setApercu(a => {
        if (a && g && (a.debut !== g.debut || a.fin !== g.fin)) {
          // Une seule étape d'annulation, même quand plusieurs bandes bougent.
          decalerChronos([{ id: a.id, debut: a.debut, fin: a.fin }, ...a.suite]);
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
  }, [glisse, decalerChronos]);

  function demarrer(ev: React.MouseEvent, c: ChronoEvent, mode: Glissement['mode']) {
    if (bloque()) return;
    ev.preventDefault();
    ev.stopPropagation();
    const fin = estDate(c.fin) ? c.fin : c.debut;
    // Si la bande attrapée fait partie de la sélection, tout le lot suit.
    const suite = mode === 'deplacer' && selRef.current.has(c.id)
      ? chronologie
        .filter(x => x.id !== c.id && selRef.current.has(x.id) && estDate(x.debut))
        .map(x => ({ id: x.id, debut: x.debut, fin: estDate(x.fin) ? x.fin : x.debut }))
      : [];
    setGlisse({ id: c.id, mode, xDepart: ev.clientX, debut: c.debut, fin, suite });
    setApercu({ id: c.id, debut: c.debut, fin, suite });
    setSurvol(null);
    document.body.style.cursor = mode === 'deplacer' ? 'grabbing' : 'col-resize';
    document.body.style.userSelect = 'none';
  }

  /** Monte ou descend un projet entier dans la frise. */
  function bougerProjet(g: string, sens: -1 | 1) {
    if (bloque()) return;
    const liste = [...groupes];
    const i = liste.indexOf(g);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= liste.length) return;
    [liste[i], liste[j]] = [liste[j], liste[i]];
    setOrdreProjets(liste);
  }

  /** Monte ou descend une étape dans son projet. */
  function bougerEtape(c: ChronoEvent, sens: -1 | 1) {
    const freres = chronologie.filter(x => racine(x.projet) === racine(c.projet));
    const i = freres.findIndex(x => x.id === c.id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= freres.length) return;
    deplacerChrono(c.id, freres[j].id, sens > 0);
  }

  /** Toutes les étapes qui portent exactement ce nom, projet compris ou non. */
  const memeNom = (c: ChronoEvent, toutProjet: boolean) => chronologie.filter(x =>
    x.action.trim() === c.action.trim() && (toutProjet || racine(x.projet) === racine(c.projet)));

  /** Clic sur une bande : sélection simple, ou ajout avec Maj / Cmd. */
  function selectionner(ev: React.MouseEvent, id: string) {
    setSelection(prec => {
      const suivant = new Set(ev.shiftKey || ev.metaKey || ev.ctrlKey ? prec : []);
      if (suivant.has(id)) suivant.delete(id); else suivant.add(id);
      return suivant;
    });
  }

  const rows = sortBy(chronologie, sort, {
    projet: c => c.projet, action: c => c.action, debut: c => c.debut, fin: c => c.fin,
  });

  /**
   * Le verrou. Une frise se manipule à la souris : un clic un peu long, un
   * glissement involontaire, et une étape calée depuis des semaines a bougé.
   * Verrouillée, la frise se lit et se zoome, mais rien n'y bouge — c'est
   * l'état par défaut, on déverrouille pour travailler.
   */
  const [verrou, setVerrou] = useEtatVue('chrono.verrou', true);
  /** Dernière tentative de modification refusée : elle fait clignoter le verrou. */
  const [refus, setRefus] = useState(0);
  useEffect(() => {
    if (!refus) return;
    const t = setTimeout(() => setRefus(0), 1600);
    return () => clearTimeout(t);
  }, [refus]);
  /** Renvoie vrai — et signale le refus — quand la frise est verrouillée. */
  const bloque = () => {
    if (!verrou) return false;
    setRefus(Date.now());
    return true;
  };

  const ajouter = (projet = 'Nouveau projet') => { if (bloque()) return; addChrono({
    projet, action: 'Nouvelle étape',
    debut: aimanter(todayISO(), pas),
    fin: aimanterFin(isoDe(jours(todayISO()) + 30), pas),
    detail: '',
  }); };

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Chronologie 2025-30"
        subtitle={verrou
          ? 'Verrouillée : rien ne peut bouger. Déverrouille pour déplacer, renommer ou supprimer.'
          : "Déverrouillée : glisse une barre pour la déplacer, attrape ses bords pour l'allonger"}
        actions={
          <>
            <button
              className="px-3 py-1.5 rounded-md border text-sm font-bold inline-flex items-center gap-1.5"
              style={verrou
                ? { backgroundColor: '#e9f3ea', borderColor: '#9cc9a4', color: '#2c5d16' }
                : { backgroundColor: '#fdecea', borderColor: '#e2a49f', color: '#b7332e' }}
              title={verrou
                ? 'La frise est verrouillée : rien ne peut être déplacé, renommé ni supprimé. Clique pour déverrouiller.'
                : 'La frise est modifiable. Clique pour la verrouiller et figer ce que tu as calé.'}
              onClick={() => setVerrou(v => !v)}
            >
              {verrou ? <Lock size={14} /> : <LockOpen size={14} />}
              {verrou ? 'Verrouillée' : 'Modifiable'}
            </button>
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
            {/* Zoom : plus la frise est large, plus les petites étapes
                s'attrapent facilement. */}
            <div className="flex items-center rounded-md border overflow-hidden"
              style={{ borderColor: 'var(--bbg-border)' }}>
              <button
                className="px-2 py-1.5 disabled:opacity-40"
                style={{ backgroundColor: '#fff', color: 'var(--bbg-purple-dark)' }}
                title="Dézoomer" disabled={pxMois <= ZOOMS[0]}
                onClick={() => setPxMois(ZOOMS[Math.max(0, ZOOMS.indexOf(pxMois as typeof ZOOMS[number]) - 1)]
                  ?? ZOOMS[0])}
              >
                <ZoomOut size={14} />
              </button>
              <span className="px-1.5 text-xs tabular-nums" style={{ color: '#6f6690' }}>
                {Math.round(pxMois / ZOOM_DEFAUT * 100)} %
              </span>
              <button
                className="px-2 py-1.5 disabled:opacity-40"
                style={{ backgroundColor: '#fff', color: 'var(--bbg-purple-dark)' }}
                title="Zoomer" disabled={pxMois >= ZOOMS[ZOOMS.length - 1]}
                onClick={() => setPxMois(ZOOMS[Math.min(ZOOMS.length - 1,
                  ZOOMS.indexOf(pxMois as typeof ZOOMS[number]) + 1)] ?? ZOOM_DEFAUT)}
              >
                <ZoomIn size={14} />
              </button>
            </div>
            <select
              className="border rounded-md px-2 py-1.5 text-sm bg-white font-medium"
              style={{ borderColor: 'var(--bbg-border)', color: 'var(--bbg-purple-darker)' }}
              value={pas}
              title="Les bandes s'accrochent à ces bornes quand on les glisse"
              onChange={ev => setPas(ev.target.value as Pas)}
            >
              {(Object.keys(PAS_LABEL) as Pas[]).map(k => (
                <option key={k} value={k}>Aimanter {PAS_LABEL[k]}</option>
              ))}
            </select>
            <Btn onClick={() => {
              const nom = prompt('Nom du nouveau projet ?', 'Nouveau projet');
              if (!nom?.trim()) return;
              setOrdreProjets([...ordreProjets.filter(p => p !== nom.trim()), nom.trim()]);
              ajouter(nom.trim());
            }}>
              <span className="inline-flex items-center gap-1"><FolderPlus size={14} /> Nouveau projet</span>
            </Btn>
            <Btn variant="primary" onClick={() => ajouter()}>
              <span className="inline-flex items-center gap-1"><Plus size={14} /> Ajouter une étape</span>
            </Btn>
          </>
        }
      />

      {refus > 0 && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full border shadow-lg
            flex items-center gap-2.5 text-sm"
          style={{ backgroundColor: '#e9f3ea', borderColor: '#9cc9a4', color: '#2c5d16' }}
        >
          <Lock size={15} />
          <b>La chronologie est verrouillée.</b>
          <span>Rien ne peut bouger tant qu'elle l'est.</span>
          <Btn onClick={() => setVerrou(false)}>Déverrouiller</Btn>
        </div>
      )}

      {vue === 'timeline' && (
        <Card>
          {/* La frise a son propre cadre de défilement : son en-tête peut alors
              rester collé en haut pendant qu'on descend dans les projets. */}
          <div
            className="-mx-4 px-4 pb-2 overflow-auto"
            style={{ maxHeight: 'calc(100vh - var(--bbg-entete-h, 96px) - 190px)', minHeight: 260 }}
          >
            <div style={{ minWidth: largeur + LARGEUR_LIBELLE }}>
              {/* En-tête exercices / années / mois — il descend avec le défilé */}
              <div
                className="sticky top-0 z-20 pt-1"
                style={{ backgroundColor: '#fff' }}
              >
                {/* Bande des exercices comptables (1er octobre → 30 septembre) */}
                <div className="relative h-5" style={{ marginLeft: LARGEUR_LIBELLE, width: largeur }}>
                  {bandesExercice.map((b, i) => (
                    <div
                      key={b.cle}
                      className="absolute top-0 bottom-0 flex items-center justify-center rounded-sm overflow-hidden"
                      style={{
                        left: b.gauche, width: b.largeur,
                        backgroundColor: i % 2 ? 'var(--bbg-purple-light)' : '#ece6f8',
                        borderLeft: b.depart >= 0 ? '2px solid var(--bbg-purple)' : undefined,
                      }}
                      title={`Exercice ${b.cle} — du 1er octobre ${b.cle.slice(0, 4)} au 30 septembre ${Number(b.cle.slice(0, 4)) + 1}`}
                    >
                      <span className="text-[10px] font-bold whitespace-nowrap px-1"
                        style={{ color: 'var(--bbg-purple-darker)' }}>
                        {b.largeur > 46 ? `Exercice ${b.cle}` : b.largeur > 26 ? b.cle : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex relative" style={{ paddingLeft: LARGEUR_LIBELLE }}>
                  {xAujourdhui >= 0 && xAujourdhui <= largeur && (
                    <div className="absolute top-3 bottom-0 z-[2] flex items-start"
                      style={{ left: LARGEUR_LIBELLE + xAujourdhui }}>
                      <span className="text-[9px] px-1 rounded -translate-x-1/2 whitespace-nowrap"
                        style={{ backgroundColor: '#b7332e', color: '#fff' }}>
                        {formatDateFR(todayISO())}
                      </span>
                    </div>
                  )}
                  {moisLabels.map((m, i) => (
                    <div key={i} className="text-center shrink-0" style={{ width: pxMois }}>
                      <div className="text-[10px] font-bold h-4" style={{ color: 'var(--bbg-purple-darker)' }}>{m.annee ?? ''}</div>
                      <div className="text-[10px]" style={{ color: '#9a92b5' }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {groupes.map(g => {
                const evts = valides.filter(c => racine(c.projet) === g);
                const couleur = couleurDe(g);
                return (
                  <div key={g} className="border-t py-1.5" style={{ borderColor: 'var(--bbg-border-soft)' }}>
                    <div className="flex items-center gap-2 mb-1 group/projet">
                      <label
                        className="inline-block w-3.5 h-3.5 rounded-sm shrink-0 cursor-pointer border"
                        style={{ backgroundColor: couleur, borderColor: 'var(--bbg-border)' }}
                        title={jeuDuProjet(g)
                          ? `Couleur de ${jeuDuProjet(g)} — la même dans tout le site`
                          : 'Changer la couleur de ce projet'}
                      >
                        <input
                          type="color" className="opacity-0 w-0 h-0 block"
                          value={couleur}
                          onChange={ev => peindre(g, ev.target.value)}
                        />
                      </label>
                      <span className="flex items-center gap-0.5 shrink-0">
                        {COULEURS_JEUX.map(c => (
                          <button
                            key={c}
                            className="w-2.5 h-2.5 rounded-sm opacity-0 group-hover/projet:opacity-100"
                            style={{ backgroundColor: c, outline: c === couleur ? '1.5px solid var(--bbg-purple-darker)' : 'none' }}
                            title={`Peindre ${g} en ${c}`}
                            onClick={() => peindre(g, c)}
                          />
                        ))}
                      </span>
                      {renommeProjet === g ? (
                        <input
                          autoFocus
                          className="border rounded px-1 py-0.5 text-xs font-bold"
                          style={{ borderColor: 'var(--bbg-purple)' }}
                          defaultValue={g}
                          onBlur={ev => { renommerProjet(g, ev.target.value); setRenommeProjet(null); }}
                          onKeyDown={ev => {
                            if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
                            if (ev.key === 'Escape') setRenommeProjet(null);
                          }}
                        />
                      ) : (
                        <span
                          className="text-xs font-bold cursor-text"
                          style={{ color: 'var(--bbg-purple-darker)' }}
                          title="Double-clic pour renommer tout le projet"
                          onDoubleClick={() => { if (!bloque()) setRenommeProjet(g); }}
                        >
                          {g}
                        </span>
                      )}
                      <span className="text-[10px]" style={{ color: '#9a92b5' }}>{evts.length} étape(s)</span>
                      <button
                        className="text-[11px] underline opacity-60 hover:opacity-100"
                        style={{ color: 'var(--bbg-purple-dark)' }}
                        onClick={() => ajouter(g)}
                        title={`Ajouter une étape à ${g}`}
                      >
                        + étape
                      </button>
                      <span className="opacity-0 group-hover/projet:opacity-100 flex items-center gap-1">
                        <button
                          title="Monter le projet" style={{ color: 'var(--bbg-purple-dark)' }}
                          onClick={() => bougerProjet(g, -1)}
                        ><ChevronUp size={13} /></button>
                        <button
                          title="Descendre le projet" style={{ color: 'var(--bbg-purple-dark)' }}
                          onClick={() => bougerProjet(g, 1)}
                        ><ChevronDown size={13} /></button>
                        <button
                          title="Supprimer le projet et toutes ses étapes" style={{ color: '#d98b86' }}
                          onClick={() => {
                            if (bloque()) return;
                            if (confirm(`Supprimer « ${g} » et ses ${evts.length} étape(s) ?`)) supprimerProjet(g);
                          }}
                        ><Trash2 size={13} /></button>
                      </span>
                    </div>
                    {evts.map(brut => {
                      const c = vu(brut);
                      const fin = estDate(c.fin) ? c.fin : c.debut;
                      const jalon = duree(c.debut, fin) <= 1;
                      const gauche = x(c.debut);
                      const largeurBarre = Math.max(jalon ? 12 : 22, duree(c.debut, fin) * pxJour);
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
                                onBlur={ev => {
                                  const nom = ev.target.value.trim();
                                  setRenomme(null);
                                  if (!nom || nom === c.action.trim()) return;
                                  // Un même intitulé revient souvent sur plusieurs jeux
                                  // (« Tirage », « Sortie ») : on propose de tout renommer.
                                  const jumelles = memeNom(brut, true).filter(x => x.id !== c.id);
                                  if (jumelles.length && confirm(
                                    `« ${c.action} » revient sur ${jumelles.length + 1} étapes.\n\n`
                                    + `OK : renommer les ${jumelles.length + 1} en « ${nom} »\n`
                                    + 'Annuler : ne renommer que celle-ci')) {
                                    updateChronos([c.id, ...jumelles.map(x => x.id)], { action: nom });
                                  } else {
                                    updateChrono(c.id, { action: nom });
                                  }
                                }}
                                onKeyDown={ev => {
                                  if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
                                  if (ev.key === 'Escape') setRenomme(null);
                                }}
                              />
                            ) : (
                              <span
                                className="truncate flex-1 cursor-text"
                                onDoubleClick={() => { if (!bloque()) setRenomme(c.id); }}
                                title="Double-clic pour renommer"
                              >
                                {c.emoji && <span className="mr-1">{c.emoji}</span>}
                                {c.projet !== g ? `${c.projet.slice(g.length).replace(/^ - /, '')} · ` : ''}{c.action}
                              </span>
                            )}
                            <ChoixEmoji
                              valeur={c.emoji}
                              verrou={verrou}
                              onRefus={() => bloque()}
                              onChoisir={emoji => updateChrono(c.id, { emoji })}
                            />
                            <span className="opacity-0 group-hover:opacity-100 flex items-center shrink-0">
                              <button
                                title="Monter cette étape" style={{ color: 'var(--bbg-purple-dark)' }}
                                onClick={() => { if (!bloque()) bougerEtape(brut, -1); }}
                              ><ChevronUp size={12} /></button>
                              <button
                                title="Descendre cette étape" style={{ color: 'var(--bbg-purple-dark)' }}
                                onClick={() => { if (!bloque()) bougerEtape(brut, 1); }}
                              ><ChevronDown size={12} /></button>
                              <button
                                data-chrono-suppr={c.id}
                                style={{ color: '#d98b86' }}
                                title="Supprimer cette étape"
                                onClick={() => { if (bloque()) return; if (confirm(`Supprimer « ${c.projet} — ${c.action} » ?`)) removeChrono(c.id); }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </span>
                          </div>
                          <div className="relative h-6" style={{ width: largeur }}>
                            {/* Aujourd'hui : le trait qui dit où l'on en est */}
                            {xAujourdhui >= 0 && xAujourdhui <= largeur && (
                              <div className="absolute top-0 bottom-0 w-px z-[1]"
                                style={{ left: xAujourdhui, backgroundColor: '#b7332e', opacity: 0.55 }} />
                            )}
                            {/* Repères de mois */}
                            {moisLabels.map((m, i) => (
                              <div key={i} className="absolute top-0 bottom-0 border-l"
                                style={{ left: i * pxMois, borderColor: m.annee ? 'var(--bbg-border)' : '#f0edf8' }} />
                            ))}
                            {/* Ouverture de chaque exercice : le 1er octobre */}
                            {bandesExercice.map(b => b.depart >= 0 && b.depart <= largeur && (
                              <div key={`ex-${b.cle}`} className="absolute top-0 bottom-0 w-px"
                                style={{ left: b.depart, backgroundColor: 'var(--bbg-purple)', opacity: 0.4 }} />
                            ))}
                            <div
                              data-chrono-bar={c.id}
                              className="absolute top-1 h-4 rounded-full flex items-center"
                              style={{
                                left: gauche,
                                width: largeurBarre,
                                backgroundColor: couleur,
                                opacity: enCours ? 1 : 0.88,
                                boxShadow: enCours || selection.has(c.id)
                                  ? '0 0 0 2px #fff, 0 0 0 4px ' + (selection.has(c.id) ? 'var(--bbg-purple-dark)' : couleur)
                                  : undefined,
                                cursor: 'grab',
                              }}
                              onMouseDown={ev => demarrer(ev, brut, 'deplacer')}
                              onClick={ev => selectionner(ev, c.id)}
                              onMouseEnter={ev => !glisse && setSurvol({ c, x: ev.clientX, y: ev.clientY })}
                              onMouseMove={ev => !glisse && setSurvol({ c, x: ev.clientX, y: ev.clientY })}
                              onMouseLeave={() => setSurvol(null)}
                            >
                              {c.emoji && (
                                <span
                                  className="absolute -left-1 -top-1 text-[13px] leading-none pointer-events-none select-none"
                                  style={{ textShadow: '0 0 3px #fff, 0 0 3px #fff' }}
                                >
                                  {c.emoji}
                                </span>
                              )}
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
            <b> clique-la</b> pour la sélectionner (<b>Maj</b> ou <b>Cmd</b> pour en ajouter, puis
            glisse : tout le lot suit) · <b>survole-la</b> pour voir le détail ·
            <b> double-clic</b> sur un libellé pour le renommer (partout à la fois si tu veux) ·
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
                <th className="w-8"></th>
                <ThSort label="Projet" k="projet" sort={sort} onToggle={toggle} />
                <ThSort label="Action" k="action" sort={sort} onToggle={toggle} />
                <ThSort label="Début" k="debut" sort={sort} onToggle={toggle} />
                <ThSort label="Fin" k="fin" sort={sort} onToggle={toggle} />
                <th className="num">Durée</th>
                <th>Détail</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <RowC key={c.id} c={c} verrou={verrou} onRefus={() => { bloque(); }}
                  onUpdate={updateChrono} onRemove={removeChrono} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Sélection : ce qu'on peut faire du lot, sans quitter la frise. */}
      {selection.size > 0 && !glisse && !verrou && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full border shadow-lg
            flex items-center gap-3 text-sm"
          style={{ backgroundColor: 'var(--bbg-purple-light)', borderColor: 'var(--bbg-purple)', color: 'var(--bbg-purple-darker)' }}
        >
          <b>{selection.size} étape{selection.size > 1 ? 's' : ''} sélectionnée{selection.size > 1 ? 's' : ''}</b>
          <span style={{ color: '#7a6fa5' }}>— glisse l'une d'elles, toutes suivent</span>
          <Btn onClick={() => {
            const nom = prompt('Nouveau nom pour ces étapes ?');
            if (nom?.trim()) { updateChronos([...selection], { action: nom.trim() }); setSelection(new Set()); }
          }}>Renommer</Btn>
          <Btn variant="danger" onClick={() => {
            if (confirm(`Supprimer ${selection.size} étape(s) ?`)) {
              removeChronos([...selection]); setSelection(new Set());
            }
          }}>
            <span className="inline-flex items-center gap-1"><Trash2 size={13} /> Supprimer</span>
          </Btn>
          <Btn variant="ghost" onClick={() => setSelection(new Set())}>
            <span className="inline-flex items-center gap-1"><X size={13} /> Désélectionner</span>
          </Btn>
        </div>
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
          <span className="ml-2 opacity-70">aimanté {PAS_LABEL[pas]}</span>
          {!!apercu.suite.length && (
            <span className="ml-2 opacity-70">+ {apercu.suite.length} autre(s)</span>
          )}
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

/**
 * Poser un emoji sur une étape. Une petite palette de ce qui revient dans un
 * planning de jeu — un tirage, une sortie, un salon, une échéance — plus la
 * saisie libre pour tout le reste.
 */
const EMOJIS = [
  '🎯', '🚀', '🏭', '📦', '🎲', '🖌️', '✍️', '📣', '🤝', '🎪', '🏆', '💶',
  '📸', '🧪', '🧩', '📝', '⏰', '⚠️', '✅', '🔥', '🌍', '🎁',
];

function ChoixEmoji({ valeur, onChoisir, verrou, onRefus }: {
  valeur?: string; onChoisir: (e: string | undefined) => void;
  /** Frise verrouillée : l'emoji se lit, il ne se change pas. */
  verrou?: boolean; onRefus?: () => void;
}) {
  const [ancre, setAncre] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        className={`shrink-0 leading-none ${valeur ? '' : 'opacity-0 group-hover:opacity-100'}`}
        title={valeur ? `Emoji : ${valeur} — cliquer pour changer` : 'Poser un emoji sur cette étape'}
        style={{ color: 'var(--bbg-purple-dark)' }}
        onClick={ev => {
          if (verrou) { onRefus?.(); return; }
          const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          setAncre(a => a ? null : { x: r.left, y: r.bottom + 4 });
        }}
      >
        {valeur ? <span className="text-[12px]">{valeur}</span> : <Smile size={12} />}
      </button>
      {ancre && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setAncre(null)} />
          <div
            className="fixed z-[61] p-2 rounded-lg border shadow-lg bg-white grid grid-cols-6 gap-0.5"
            style={{
              borderColor: 'var(--bbg-border)', width: 200,
              left: Math.min(ancre.x, window.innerWidth - 210),
              top: Math.min(ancre.y, window.innerHeight - 220),
            }}
          >
            {EMOJIS.map(e => (
              <button
                key={e} className="text-base leading-none p-1 rounded hover:bg-[#f4f1fb]"
                onClick={() => { onChoisir(e); setAncre(null); }}
              >{e}</button>
            ))}
            <button
              className="col-span-6 mt-1 text-[11px] py-1 rounded hover:bg-[#f4f1fb]"
              style={{ color: '#6f6690' }}
              onClick={() => {
                const libre = prompt('Un autre emoji ? (colle-le ici)', valeur ?? '');
                if (libre !== null) onChoisir(libre.trim() || undefined);
                setAncre(null);
              }}
            >
              Autre emoji…
            </button>
            {valeur && (
              <button
                className="col-span-6 text-[11px] py-1 rounded hover:bg-[#f4f1fb]"
                style={{ color: '#b7332e' }}
                onClick={() => { onChoisir(undefined); setAncre(null); }}
              >
                Retirer l'emoji
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}


function RowC({ c, onUpdate, onRemove, verrou, onRefus }: {
  c: ChronoEvent;
  onUpdate: (id: string, patch: Partial<ChronoEvent>) => void;
  onRemove: (id: string) => void;
  verrou?: boolean; onRefus?: () => void;
}) {
  /** Verrouillée, la liste se lit : les champs restent visibles mais figés. */
  const fige = { readOnly: !!verrou, disabled: !!verrou } as const;
  const fin = estDate(c.fin) ? c.fin : c.debut;
  return (
    <tr className="group hover:bg-[#f4f1fb]">
      <td className="text-center">
        <ChoixEmoji valeur={c.emoji} verrou={verrou} onRefus={onRefus}
          onChoisir={emoji => onUpdate(c.id, { emoji })} />
      </td>
      <td>
        <input {...fige} className="border border-[#ddd6ef] rounded px-1.5 py-1 text-sm w-40"
          defaultValue={c.projet} onBlur={ev => onUpdate(c.id, { projet: ev.target.value })} />
      </td>
      <td>
        <input {...fige} className="border border-[#ddd6ef] rounded px-1.5 py-1 text-sm w-52"
          defaultValue={c.action} onBlur={ev => onUpdate(c.id, { action: ev.target.value })} />
      </td>
      <td>
        <input {...fige} type="date" className="border border-[#ddd6ef] rounded px-1 py-0.5 text-sm"
          value={c.debut} onChange={ev => ev.target.value && onUpdate(c.id, { debut: ev.target.value })} />
      </td>
      <td>
        <input {...fige} type="date" className="border border-[#ddd6ef] rounded px-1 py-0.5 text-sm"
          value={c.fin} onChange={ev => ev.target.value && onUpdate(c.id, { fin: ev.target.value })} />
      </td>
      <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>
        {estDate(c.debut) ? libelleDuree(duree(c.debut, fin)) : '—'}
      </td>
      <td>
        <input {...fige} className="border border-[#ddd6ef] rounded px-1.5 py-1 text-sm w-52"
          defaultValue={c.detail ?? ''} onBlur={ev => onUpdate(c.id, { detail: ev.target.value })} />
      </td>
      <td>
        <button className="text-[#d98b86] hover:text-[#b7332e] opacity-0 group-hover:opacity-100"
          onClick={() => {
            if (verrou) { onRefus?.(); return; }
            if (confirm(`Supprimer « ${c.projet} — ${c.action} » ?`)) onRemove(c.id);
          }}>
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
