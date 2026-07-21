import { useState, useCallback } from 'react';
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

// Pages
import ScanCleanup from '@/pages/ScanCleanup';
import BatchCleanup from '@/pages/BatchCleanup';
import CompareResults from '@/pages/CompareResults';
import ExportPage from '@/pages/ExportPage';
import ModelCatalog from '@/pages/ModelCatalog';
import SettingsDialog from '@/components/settings/SettingsDialog';

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

  const renderWorkspace = () => {
    switch (workspaceView) {
      case 'scan-cleanup':
        return <ScanCleanup />;
      case 'batch-cleanup':
        return <BatchCleanup />;
      case 'compare':
        return <CompareResults />;
      case 'export':
        return <ExportPage />;
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
          onMenuClick={() => setMobileSidebarOpen(true)}
          onSettingsClick={() => setSettingsOpen(true)}
          className="lg:pl-0 pl-12"
        />
        <div className="flex-1 overflow-auto">
          {currentView === 'model-catalog' ? (
            <ModelCatalog />
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
          onClose={() => setAssistantOpen(false)}
          selectedModel={selected.chat || undefined}
        />
      </div>
    </div>
  );
}
