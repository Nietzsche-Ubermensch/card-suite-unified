import { useState, useCallback, lazy, Suspense } from 'react';
import { useVeniceStatus } from '@/hooks/useVeniceStatus';
import { useModelSelection } from '@/hooks/useModelSelection';
import AppSidebar from '@/components/app-shell/AppSidebar';
import AppHeader from '@/components/app-shell/AppHeader';
import AssistantPanel from '@/components/app-shell/AssistantPanel';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceView } from '@/types';

// Pages — eager (needed on first paint)
import ScanCleanup from '@/pages/ScanCleanup';
import BatchCleanup from '@/pages/BatchCleanup';
import CompareResults from '@/pages/CompareResults';
// Pages — lazy (heavy deps: recharts, TanStack Table, JSZip)
const ModelCatalog = lazy(() => import('@/pages/ModelCatalog'));
const ExportPage = lazy(() => import('@/pages/ExportPage'));
import SettingsDialog from '@/components/settings/SettingsDialog';

function PageSkeleton() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="size-8 rounded-full border-2 border-slate-700 border-t-slate-400 animate-spin" />
    </div>
  );
}

type AppView = WorkspaceView | 'assistant' | 'model-catalog' | 'api-status' | 'settings';

function isWorkspaceView(view: AppView): view is WorkspaceView {
  return ['scan-cleanup', 'batch-cleanup', 'compare', 'export'].includes(view);
}

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('scan-cleanup');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: veniceStatus } = useVeniceStatus();
  const { selected } = useModelSelection();

  const workspaceView: WorkspaceView = isWorkspaceView(currentView) ? currentView : 'scan-cleanup';

  const handleViewChange = useCallback((view: AppView) => {
    setCurrentView(view);
    if (view === 'assistant') {
      setAssistantOpen((prev) => !prev);
    } else if (view === 'settings') {
      setSettingsOpen(true);
    }
    setMobileSidebarOpen(false);
  }, []);

  const handleToggleAssistant = useCallback(() => {
    setAssistantOpen((prev) => !prev);
  }, []);

  const handleMenuClick = useCallback(() => {
    setMobileSidebarOpen(true);
  }, []);

  const handleSettingsClick = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleAssistantClose = useCallback(() => {
    setAssistantOpen(false);
  }, []);

  const renderWorkspace = () => {
    switch (workspaceView) {
      case 'scan-cleanup':
        return <ScanCleanup />;
      case 'batch-cleanup':
        return <BatchCleanup />;
      case 'compare':
        return <CompareResults />;
      default:
        return <ScanCleanup />;
    }
  };

  const sidebarNavCurrent = currentView === 'assistant'
    ? workspaceView
    : currentView;

  return (
    <div className="h-[100dvh] w-screen flex overflow-hidden bg-app-bg text-text-primary">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block shrink-0">
        <AppSidebar
          currentView={sidebarNavCurrent}
          assistantOpen={assistantOpen}
          onViewChange={handleViewChange}
          onToggleAssistant={handleToggleAssistant}
          status={veniceStatus}
        />
      </div>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetTrigger asChild>
          <button
            className="lg:hidden fixed top-2.5 left-3 z-50 p-1.5 rounded-sm text-text-secondary hover:text-text-primary hover:bg-app-panel-hover transition-colors"
            aria-label="Open menu"
          >
            <Menu className="size-5" strokeWidth={1.5} />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[220px] p-0 bg-app-panel border-r border-border-subtle"
        >
          <AppSidebar
            currentView={sidebarNavCurrent}
            assistantOpen={assistantOpen}
            onViewChange={handleViewChange}
            onToggleAssistant={handleToggleAssistant}
            status={veniceStatus}
          />
        </SheetContent>
      </Sheet>

      {/* Main workspace */}
      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader
          currentView={workspaceView}
          onMenuClick={handleMenuClick}
          onSettingsClick={handleSettingsClick}
          className="lg:pl-0 pl-12"
        />
        <div className="flex-1 overflow-auto">
          {currentView === 'model-catalog' ? (
            <Suspense fallback={<PageSkeleton />}>
              <ModelCatalog />
            </Suspense>
          ) : currentView === 'export' ? (
            <Suspense fallback={<PageSkeleton />}>
              <ExportPage />
            </Suspense>
          ) : renderWorkspace()}
        </div>
      </main>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Assistant Panel */}
      <div
        className={cn(
          'shrink-0 border-l border-border-subtle transition-all duration-250 ease-in-out overflow-hidden',
          assistantOpen ? 'w-[340px] opacity-100' : 'w-0 opacity-0 border-l-0',
        )}
      >
        <AssistantPanel
          open={assistantOpen}
          onClose={handleAssistantClose}
          selectedModel={selected.chat || undefined}
        />
      </div>
    </div>
  );
}
