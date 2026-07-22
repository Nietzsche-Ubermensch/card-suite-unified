import { memo } from 'react';
import { Menu, Scan, Layers, Columns3, Download, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceView } from '@/types';

const VIEW_TITLES: Record<WorkspaceView, { title: string; subtitle: string }> = {
  'scan-cleanup': { title: 'Scan Cleanup', subtitle: 'Single card scan analysis and AI cleanup' },
  'batch-cleanup': { title: 'Batch Cleanup', subtitle: 'Process multiple cards in parallel' },
  'compare': { title: 'Compare Results', subtitle: 'Side-by-side before and after comparison' },
  'export': { title: 'Export', subtitle: 'Download cleaned card images as ZIP' },
};

const VIEW_ICONS: Record<WorkspaceView, React.ElementType> = {
  'scan-cleanup': Scan,
  'batch-cleanup': Layers,
  'compare': Columns3,
  'export': Download,
};

interface AppHeaderProps {
  currentView: WorkspaceView;
  onMenuClick: () => void;
  onSettingsClick: () => void;
  className?: string;
}

export default memo(function AppHeader({ currentView, onMenuClick, onSettingsClick, className }: AppHeaderProps) {
  const viewInfo = VIEW_TITLES[currentView];
  const ViewIcon = VIEW_ICONS[currentView];

  return (
    <header
      className={cn(
        'h-12 bg-app-header border-b border-border-subtle flex items-center justify-between px-4 shrink-0',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 rounded-sm text-text-secondary hover:text-text-primary hover:bg-app-panel-hover transition-colors"
          aria-label="Open menu"
        >
          <Menu className="size-5" strokeWidth={1.5} />
        </button>
        <ViewIcon className="size-5 text-status-info" strokeWidth={1.5} />
        <div className="flex flex-col">
          <h1 className="text-sm font-semibold text-text-primary leading-tight">
            {viewInfo.title}
          </h1>
          <span className="text-[11px] text-text-tertiary leading-tight hidden sm:inline">
            {viewInfo.subtitle}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSettingsClick}
          className="p-1.5 rounded-sm text-text-secondary hover:text-text-primary hover:bg-app-panel-hover transition-colors"
          aria-label="Settings"
        >
          <Settings className="size-4" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
});
