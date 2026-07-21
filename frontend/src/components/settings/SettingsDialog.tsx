import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Grid,
  Key,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import ModelsSettings from './ModelsSettings';
import ApiSettings from './ApiSettings';
import AdvancedSettings from './AdvancedSettings';
import { useVeniceModels } from '@/hooks/useVeniceModels';
import ModelsTable from '@/components/models/ModelsTable';
import { useModelSelection } from '@/hooks/useModelSelection';

type TabId = 'models' | 'all-models' | 'api' | 'advanced';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: 'models', label: 'Models', icon: Settings },
  { id: 'all-models', label: 'All Models', icon: Grid },
  { id: 'api', label: 'API', icon: Key },
  { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('models');
  const { models, isLoading, error, refetch } = useVeniceModels();
  const { updateSelection } = useModelSelection();

  // Reset to first tab when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab('models');
    }
  }, [open]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+1–4 to switch tabs
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (TABS[idx]) setActiveTab(TABS[idx].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleUseFor = useCallback(
    (modelId: string, category: import('@/types').ModelCategory) => {
      updateSelection(category, modelId);
    },
    [updateSelection]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[640px] w-full max-h-[85vh] p-0 bg-[#12151c] border-[#2A2E39] shadow-lg overflow-hidden gap-0"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-[#1e2230] shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold text-text-primary">
                Settings
              </DialogTitle>
              <DialogDescription className="text-xs text-text-tertiary mt-0.5">
                Configure your card processing suite
              </DialogDescription>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-sm text-text-tertiary hover:text-text-primary hover:bg-[#1a1e27] transition-colors"
              aria-label="Close settings"
            >
              <X className="size-4" />
            </button>
          </div>
        </DialogHeader>

        {/* Body with sidebar tabs */}
        <div className="flex min-h-0 flex-1">
          {/* Left tab navigation */}
          <div className="w-[160px] shrink-0 border-r border-[#1e2230] p-2 flex flex-col gap-0.5">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm transition-colors duration-100 w-full text-left',
                    isActive
                      ? 'bg-[#1e2330] text-text-primary border-l-2 border-l-status-info'
                      : 'text-text-secondary hover:bg-[#1a1e27] border-l-2 border-l-transparent'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <tab.icon
                    className={cn(
                      'size-4',
                      isActive ? 'text-text-primary' : 'text-text-tertiary'
                    )}
                  />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            <div
              className={cn(
                'transition-opacity duration-200',
                activeTab === 'models' ? 'opacity-100' : 'opacity-0 hidden'
              )}
            >
              <ModelsSettings />
            </div>
            <div
              className={cn(
                'transition-opacity duration-200',
                activeTab === 'all-models' ? 'opacity-100' : 'opacity-0 hidden'
              )}
            >
              <div className="space-y-3">
                <p className="text-xs text-text-tertiary">
                  Browse all available models. Click the actions menu to assign a model to a workspace function.
                </p>
                <div className="max-h-[320px] overflow-y-auto">
                  <ModelsTable
                    models={models}
                    isLoading={isLoading}
                    error={error}
                    onRetry={refetch}
                    onUseFor={handleUseFor}
                  />
                </div>
              </div>
            </div>
            <div
              className={cn(
                'transition-opacity duration-200',
                activeTab === 'api' ? 'opacity-100' : 'opacity-0 hidden'
              )}
            >
              <ApiSettings />
            </div>
            <div
              className={cn(
                'transition-opacity duration-200',
                activeTab === 'advanced' ? 'opacity-100' : 'opacity-0 hidden'
              )}
            >
              <AdvancedSettings />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-[#1e2230] flex items-center justify-end bg-[#12151c]">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-sm text-sm font-medium bg-status-info text-white hover:brightness-110 transition-all"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
