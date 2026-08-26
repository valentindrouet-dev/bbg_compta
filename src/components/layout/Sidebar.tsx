import {
  Coins, LayoutDashboard, NotebookPen, Table2, Building2, Wallet, Percent,
  UserRound, Target, GitCompareArrows, Landmark, CalendarRange, FileDown, Settings, Store,
} from 'lucide-react';
import type { Page } from '../../App';
import { APP_VERSION } from '../../version';

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
      { page: 'fournisseurs', label: 'Fournisseurs', icon: Store },
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
    <aside
      className="w-60 text-white flex flex-col h-full shrink-0"
      style={{ backgroundColor: 'var(--bbg-purple-darker)' }}
    >
      <div className="p-4 border-b" style={{ backgroundColor: 'var(--bbg-purple-dark)', borderColor: '#57458f' }}>
        <div className="flex items-center gap-2">
          <Coins size={22} style={{ color: 'var(--bbg-yellow)' }} />
          <span className="font-bold text-lg">BBG Compta</span>
        </div>
        <p className="text-xs mt-1">
          <span
            className="inline-block px-1.5 py-0.5 rounded font-mono font-semibold tracking-tight"
            style={{ backgroundColor: 'var(--bbg-yellow)', color: 'var(--bbg-purple-darker)' }}
          >
            v{APP_VERSION}
          </span>
        </p>
      </div>

      <nav className="flex-1 overflow-auto py-1">
        {NAV.map(group => (
          <div key={group.section || 'top'}>
            {group.section && (
              <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide" style={{ color: '#a99ad6' }}>
                {group.section}
              </div>
            )}
            {group.items.map(item => {
              const Icon = item.icon;
              const active = page === item.page;
              return (
                <button
                  key={item.page}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors"
                  style={active
                    ? { backgroundColor: 'var(--bbg-purple-light)', color: 'var(--bbg-purple-darker)', fontWeight: 700, boxShadow: 'inset 3px 0 0 var(--bbg-yellow)' }
                    : { color: '#ded7f2' }}
                  onMouseEnter={ev => { if (!active) ev.currentTarget.style.backgroundColor = 'var(--bbg-purple-dark)'; }}
                  onMouseLeave={ev => { if (!active) ev.currentTarget.style.backgroundColor = 'transparent'; }}
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

      <div className="p-3 text-[11px] border-t" style={{ color: '#a99ad6', borderColor: '#57458f' }}>
        Données stockées dans ce navigateur.<br />
        Pense à faire une sauvegarde (Paramètres).
      </div>
    </aside>
  );
}
