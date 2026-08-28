import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { BandeauCoffre } from './components/layout/BarreCoffre';
import { UndoBar } from './components/layout/UndoBar';
import { useStore } from './store';
import { appliquerLargeurs, installerResize } from './utils/colresize';
import type { Cible } from './utils/cible';
import { Dashboard } from './components/dashboard/Dashboard';
import { JournalPage } from './components/journal/JournalPage';
import { SyntheseTotalePage } from './components/journal/SyntheseTotalePage';
import { SynthesePage } from './components/journal/SynthesePage';
import { ImmosPage } from './components/journal/ImmosPage';
import { StocksPage } from './components/journal/StocksPage';
import { TresoPage } from './components/journal/TresoPage';
import { TVAPage } from './components/journal/TVAPage';
import { RemboursPage } from './components/journal/RemboursPage';
import { FournisseursPage } from './components/journal/FournisseursPage';
import { JeuxPage } from './components/journal/JeuxPage';
import { FacturesPage } from './components/journal/FacturesPage';
import { PrevisionnelPage } from './components/prev/PrevisionnelPage';
import { ReelVsPrevuPage } from './components/prev/ReelVsPrevuPage';
import { CinqAnsPage } from './components/prev/CinqAnsPage';
import { TresoPrevPage } from './components/prev/TresoPrevPage';
import { ChronoPage } from './components/prev/ChronoPage';
import { ExportsPage } from './components/settings/ExportsPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { WikiPage } from './components/wiki/WikiPage';
import { CategoriesPage } from './components/settings/CategoriesPage';
import { useEtatVue } from './utils/etatVue';

export type Page =
  | 'dashboard'
  | 'journal' | 'synthese' | 'totale' | 'immos' | 'stocks' | 'treso' | 'tva' | 'rembours' | 'fournisseurs' | 'jeux' | 'factures'
  | 'budgets' | 'cinqans' | 'reelprevu' | 'tresoprev' | 'chrono'
  | 'exports' | 'categories' | 'settings' | 'wiki';

/** Les pages existantes : une valeur mémorisée qui n'en fait plus partie est ignorée. */
const PAGES: readonly Page[] = [
  'dashboard',
  'journal', 'synthese', 'totale', 'immos', 'stocks', 'treso', 'tva', 'rembours', 'fournisseurs', 'jeux', 'factures',
  'budgets', 'cinqans', 'reelprevu', 'tresoprev', 'chrono',
  'exports', 'categories', 'settings', 'wiki',
];

export default function App() {
  // On rouvre l'app là où on l'avait laissée.
  const [page, setPage] = useEtatVue<Page>('page', 'dashboard', v => PAGES.includes(v));
  /** Ligne à rejoindre quand on arrive depuis les contrôles comptables. */
  const [cible, setCible] = useState<{ page: Page } & Cible | null>(null);
  const compteur = useRef(0);

  /** Ouvre une page en visant une écriture précise. */
  function allerA(vers: Page, ligne: string) {
    setCible({ page: vers, ligne, n: ++compteur.current });
    setPage(vers);
  }
  const cibleDe = (p: Page): Cible | undefined =>
    cible && cible.page === p ? { ligne: cible.ligne, n: cible.n } : undefined;
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  const colWidths = useStore(s => s.colWidths);
  const setColWidths = useStore(s => s.setColWidths);
  const resetColWidths = useStore(s => s.resetColWidths);

  // Largeurs de colonnes : la feuille de style est régénérée à chaque
  // changement, et l'écouteur global rend chaque en-tête « attrapable ».
  useLayoutEffect(() => { appliquerLargeurs(colWidths); }, [colWidths, page]);
  useEffect(() => installerResize({
    lire: () => useStore.getState().colWidths,
    enregistrer: setColWidths,
    reinitialiser: resetColWidths,
  }), [setColWidths, resetColWidths]);

  // Cmd+Z / Ctrl+Z annule, Cmd+Maj+Z / Ctrl+Y rétablit — mais JAMAIS pendant
  // qu'on écrit dans un champ : là, Cmd+Z doit défaire la frappe, pas une
  // modification de données. Sans cette garde, corriger une faute de frappe
  // annulait un renommage, un déplacement, un emoji — et en insistant, tout
  // un après-midi de réglages.
  useEffect(() => {
    function dansUnChamp(): boolean {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const t = el.tagName;
      return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT';
    }
    function onKey(ev: KeyboardEvent) {
      const mod = ev.metaKey || ev.ctrlKey;
      if (!mod) return;
      if (dansUnChamp()) return;
      const k = ev.key.toLowerCase();
      if (k === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo(); else undo();
      } else if (k === 'y') {
        ev.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Un fichier lâché à côté d'une zone de dépôt ne doit pas quitter l'app
  // (le navigateur ouvrirait le PDF et ferait perdre la page).
  useEffect(() => {
    function neutraliser(ev: DragEvent) {
      if ([...(ev.dataTransfer?.types ?? [])].includes('Files')) ev.preventDefault();
    }
    window.addEventListener('dragover', neutraliser);
    window.addEventListener('drop', neutraliser);
    return () => {
      window.removeEventListener('dragover', neutraliser);
      window.removeEventListener('drop', neutraliser);
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#f6f4fc' }}>
      <BandeauCoffre />
      <Sidebar page={page} onNavigate={setPage} />
      <main className="flex-1 overflow-auto relative">
        <UndoBar />
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'journal' && <JournalPage cible={cibleDe('journal')} />}
        {page === 'synthese' && <SynthesePage onAllerA={allerA} />}
        {page === 'totale' && <SyntheseTotalePage />}
        {page === 'immos' && <ImmosPage cible={cibleDe('immos')} onAllerA={allerA} />}
        {page === 'stocks' && <StocksPage />}
        {page === 'treso' && <TresoPage />}
        {page === 'tva' && <TVAPage />}
        {page === 'rembours' && <RemboursPage />}
        {page === 'fournisseurs' && <FournisseursPage />}
        {page === 'jeux' && <JeuxPage />}
        {page === 'factures' && <FacturesPage />}
        {page === 'budgets' && <PrevisionnelPage />}
        {page === 'cinqans' && <CinqAnsPage />}
        {page === 'reelprevu' && <ReelVsPrevuPage />}
        {page === 'tresoprev' && <TresoPrevPage />}
        {page === 'chrono' && <ChronoPage />}
        {page === 'exports' && <ExportsPage />}
        {page === 'categories' && <CategoriesPage />}
        {page === 'settings' && <SettingsPage />}
        {page === 'wiki' && <WikiPage onAllerA={setPage} />}
      </main>
    </div>
  );
}
