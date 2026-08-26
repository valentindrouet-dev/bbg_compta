import { useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './components/dashboard/Dashboard';
import { JournalPage } from './components/journal/JournalPage';
import { SynthesePage } from './components/journal/SynthesePage';
import { ImmosPage } from './components/journal/ImmosPage';
import { TresoPage } from './components/journal/TresoPage';
import { TVAPage } from './components/journal/TVAPage';
import { RemboursPage } from './components/journal/RemboursPage';
import { BudgetPage } from './components/prev/BudgetPage';
import { ReelVsPrevuPage } from './components/prev/ReelVsPrevuPage';
import { TresoPrevPage } from './components/prev/TresoPrevPage';
import { ChronoPage } from './components/prev/ChronoPage';
import { ExportsPage } from './components/settings/ExportsPage';
import { SettingsPage } from './components/settings/SettingsPage';

export type Page =
  | 'dashboard'
  | 'journal' | 'synthese' | 'immos' | 'treso' | 'tva' | 'rembours'
  | 'budgets' | 'reelprevu' | 'tresoprev' | 'chrono'
  | 'exports' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar page={page} onNavigate={setPage} />
      <main className="flex-1 overflow-auto">
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'journal' && <JournalPage />}
        {page === 'synthese' && <SynthesePage />}
        {page === 'immos' && <ImmosPage />}
        {page === 'treso' && <TresoPage />}
        {page === 'tva' && <TVAPage />}
        {page === 'rembours' && <RemboursPage />}
        {page === 'budgets' && <BudgetPage />}
        {page === 'reelprevu' && <ReelVsPrevuPage />}
        {page === 'tresoprev' && <TresoPrevPage />}
        {page === 'chrono' && <ChronoPage />}
        {page === 'exports' && <ExportsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
