import { useCallback } from 'react';
import {
  Scan,
  Layers,
  Columns3,
  Download,
  MessageSquare,
  LayoutGrid,
  Activity,
  Settings,
  PanelRightOpen,
  PanelRightClose,
  Signal,
  DollarSign,
  Coins,
  AlertTriangle,
} from 'lucide-react';
import type { WorkspaceView } from '@/types';
import { cn } from '@/lib/utils';

interface NavItem {
  id: WorkspaceView | 'assistant' | 'model-catalog' | 'api-status' | 'settings';
  label: string;
  icon: React.ElementType;
  section: 'workspace' | 'ai' | 'system';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'scan-cleanup', label: 'Scan Cleanup', icon: Scan, section: 'workspace' },
  { id: 'batch-cleanup', label: 'Batch Cleanup', icon: Layers, section: 'workspace' },
  { id: 'compare', label: 'Compare Results', icon: Columns3, section: 'workspace' },
  { id: 'export', label: 'Export', icon: Download, section: 'workspace' },
  { id: 'assistant', label: 'Assistant', icon: MessageSquare, section: 'ai' },
  { id: 'model-catalog', label: 'Model Catalogue', icon: LayoutGrid, section: 'ai' },
  { id: 'api-status', label: 'API Status', icon: Activity, section: 'system' },
  { id: 'settings', label: 'Settings', icon: Settings, section: 'system' },
];

interface AppSidebarProps {
  currentView: WorkspaceView | 'assistant' | 'model-catalog' | 'api-status' | 'settings';
  assistantOpen: boolean;
  onViewChange: (view: WorkspaceView | 'assistant' | 'model-catalog' | 'api-status' | 'settings') => void;
  onToggleAssistant: () => void;
  status?: {
    ok?: boolean;
    balanceUsd?: string | null;
    balanceDiem?: string | null;
    remainingRequests?: string | null;
    limitRequests?: string | null;
    remainingTokens?: string | null;
    deprecationWarning?: string | null;
  };
}

function getConnectionDot(ok?: boolean) {
  if (ok === undefined) return 'bg-status-warning';
  return ok ? 'bg-status-success' : 'bg-status-error';
}

export default function AppSidebar({
  currentView,
  assistantOpen,
  onViewChange,
  onToggleAssistant,
  status,
}: AppSidebarProps) {
  const workspaceItems = NAV_ITEMS.filter((i) => i.section === 'workspace');
  const aiItems = NAV_ITEMS.filter((i) => i.section === 'ai');
  const systemItems = NAV_ITEMS.filter((i) => i.section === 'system');

  const isActive = useCallback(
    (id: string) => currentView === id,
    [currentView],
  );

  const renderItem = (item: NavItem) => {
    const active = isActive(item.id);
    const isAssistantToggle = item.id === 'assistant';

    return (
      <button
        key={item.id}
        onClick={() => {
          if (isAssistantToggle) {
            onToggleAssistant();
          }
          onViewChange(item.id);
        }}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors duration-100',
          active
            ? 'bg-app-panel-active text-text-primary border-l-2 border-status-info'
            : 'text-text-secondary hover:bg-app-panel-hover border-l-2 border-transparent',
        )}
      >
        <item.icon className="size-[18px] shrink-0" strokeWidth={1.5} />
        <span className="truncate">{item.label}</span>
        {isAssistantToggle && (
          <span className="ml-auto shrink-0">
            {assistantOpen ? (
              <PanelRightClose className="size-3.5 text-text-tertiary" />
            ) : (
              <PanelRightOpen className="size-3.5 text-text-tertiary" />
            )}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="h-full w-[220px] shrink-0 bg-app-panel border-r border-border-subtle flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border-subtle">
        <div className="size-8 rounded-md bg-status-info flex items-center justify-center">
          <Scan className="size-4.5 text-white" strokeWidth={2} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary leading-tight">Card Suite</span>
          <span className="text-[11px] text-text-tertiary leading-tight">Batch Processing</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Workspace */}
        <div>
          <h3 className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            Workspace
          </h3>
          <div className="space-y-0.5">{workspaceItems.map(renderItem)}</div>
        </div>

        {/* AI */}
        <div>
          <h3 className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            AI
          </h3>
          <div className="space-y-0.5">{aiItems.map(renderItem)}</div>
        </div>

        {/* System */}
        <div>
          <h3 className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            System
          </h3>
          <div className="space-y-0.5">{systemItems.map(renderItem)}</div>
        </div>
      </nav>

      {/* Status Bar */}
      <div className="border-t border-border-subtle px-3 py-2.5 space-y-1.5 text-[11px] text-text-tertiary">
        {/* Connection dot + balances */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('size-2 rounded-full', getConnectionDot(status?.ok))} />
          <Signal className="size-3" />
          {status?.balanceUsd && (
            <span className="flex items-center gap-0.5 text-status-success">
              <DollarSign className="size-3" />
              {status.balanceUsd}
            </span>
          )}
          {status?.balanceDiem && (
            <span className="flex items-center gap-0.5">
              <Coins className="size-3" />
              {status.balanceDiem}
            </span>
          )}
        </div>

        {/* Rate limits */}
        {status?.remainingRequests && status?.limitRequests && (
          <div className="flex items-center gap-1">
            <span>Req: {status.remainingRequests}/{status.limitRequests}</span>
          </div>
        )}
        {status?.remainingTokens && (
          <div className="flex items-center gap-1">
            <span>Tokens: {status.remainingTokens}</span>
          </div>
        )}

        {/* Deprecation warning */}
        {status?.deprecationWarning && (
          <div className="flex items-center gap-1 text-status-warning">
            <AlertTriangle className="size-3 shrink-0" />
            <span className="truncate">{status.deprecationWarning}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
