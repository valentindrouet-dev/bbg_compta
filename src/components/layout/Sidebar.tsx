import {
  Coins, LayoutDashboard, NotebookPen, Table2, Building2, Wallet, Percent,
  UserRound, Target, GitCompareArrows, Landmark, CalendarRange, FileDown, Settings,
} from 'lucide-react';
import type { Page } from '../../App';

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
}

const NAV: { section: string; items: { page: Page; label: string; icon: typeof Coins }[] }[] = [
  {
    section: '',
    items: [{ page: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard }],
  },
  {
    section: 'Journal comptable',
    items: [
      { page: 'journal', label: 'Journal du mois', icon: NotebookPen },
      { page: 'synthese', label: 'Synthèse annuelle', icon: Table2 },
      { page: 'immos', label: 'Immobilisations', icon: Building2 },
      { page: 'treso', label: 'Trésorerie', icon: Wallet },
      { page: 'tva', label: 'TVA', icon: Percent },
      { page: 'rembours', label: 'Remboursements Val', icon: UserRound },
    ],
  },
  {
    section: 'Prévisionnel 2025-30',
    items: [
      { page: 'budgets', label: 'Budgets annuels', icon: Target },
      { page: 'reelprevu', label: 'Réel vs Prévu', icon: GitCompareArrows },
      { page: 'tresoprev', label: 'Trésorerie prév.', icon: Landmark },
      { page: 'chrono', label: 'Chronologie', icon: CalendarRange },
    ],
  },
  {
    section: 'Outils',
    items: [
      { page: 'exports', label: 'Exports', icon: FileDown },
      { page: 'settings', label: 'Paramètres', icon: Settings },
    ],
  },
];

export function Sidebar({ page, onNavigate }: SidebarProps) {
  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-full shrink-0">
      <div className="p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Coins className="text-yellow-400" size={22} />
          <span className="font-bold text-lg">BBG Compta</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Comptabilité &amp; prévisionnel</p>
      </div>

      <nav className="flex-1 overflow-auto py-1">
        {NAV.map(group => (
          <div key={group.section || 'top'}>
            {group.section && (
              <div className="px-4 pt-3 pb-1 text-xs text-gray-500 uppercase tracking-wide">
                {group.section}
              </div>
            )}
            {group.items.map(item => {
              const Icon = item.icon;
              const active = page === item.page;
              return (
                <button
                  key={item.page}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                    active ? 'bg-yellow-500 text-gray-900 font-bold' : 'text-gray-300 hover:bg-gray-800'
                  }`}
                  onClick={() => onNavigate(item.page)}
                >
                  <Icon size={15} className="shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 text-[11px] text-gray-500 border-t border-gray-800">
        Données stockées dans ce navigateur.<br />
        Pense à faire une sauvegarde (Paramètres).
      </div>
    </aside>
  );
}
