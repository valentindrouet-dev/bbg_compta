import { useEffect, useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { UndoBar } from './components/layout/UndoBar';
import { useStore } from './store';
import { Dashboard } from './components/dashboard/Dashboard';
import { JournalPage } from './components/journal/JournalPage';
import { SynthesePage } from './components/journal/SynthesePage';
import { ImmosPage } from './components/journal/ImmosPage';
import { TresoPage } from './components/journal/TresoPage';
import { TVAPage } from './components/journal/TVAPage';
import { RemboursPage } from './components/journal/RemboursPage';
import { FournisseursPage } from './components/journal/FournisseursPage';
import { BudgetPage } from './components/prev/BudgetPage';
import { ReelVsPrevuPage } from './components/prev/ReelVsPrevuPage';
import { TresoPrevPage } from './components/prev/TresoPrevPage';
import { ChronoPage } from './components/prev/ChronoPage';
import { ExportsPage } from './components/settings/ExportsPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { CategoriesPage } from './components/settings/CategoriesPage';

export type Page =
  | 'dashboard'
  | 'journal' | 'synthese' | 'immos' | 'treso' | 'tva' | 'rembours' | 'fournisseurs'
  | 'budgets' | 'reelprevu' | 'tresoprev' | 'chrono'
  | 'exports' | 'categories' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);

  // Cmd+Z / Ctrl+Z annule, Cmd+Maj+Z / Ctrl+Y rétablit — partout dans l'app.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const mod = ev.metaKey || ev.ctrlKey;
      if (!mod) return;
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

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#f6f4fc' }}>
      <Sidebar page={page} onNavigate={setPage} />
      <main className="flex-1 overflow-auto relative">
        <UndoBar />
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'journal' && <JournalPage />}
        {page === 'synthese' && <SynthesePage />}
        {page === 'immos' && <ImmosPage />}
        {page === 'treso' && <TresoPage />}
        {page === 'tva' && <TVAPage />}
        {page === 'rembours' && <RemboursPage />}
        {page === 'fournisseurs' && <FournisseursPage />}
        {page === 'budgets' && <BudgetPage />}
        {page === 'reelprevu' && <ReelVsPrevuPage />}
        {page === 'tresoprev' && <TresoPrevPage />}
        {page === 'chrono' && <ChronoPage />}
        {page === 'exports' && <ExportsPage />}
        {page === 'categories' && <CategoriesPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
