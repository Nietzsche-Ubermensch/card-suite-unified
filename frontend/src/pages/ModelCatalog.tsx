import { useState, useCallback, useMemo } from 'react';
import {
  LayoutGrid,
  RefreshCw,
  Signal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useVeniceModels } from '@/hooks/useVeniceModels';
import { useModelSelection } from '@/hooks/useModelSelection';
import ModelFilters, { defaultFilters, type ModelFiltersState } from '@/components/models/ModelFilters';
import ModelsTable from '@/components/models/ModelsTable';
import type { ModelCategory } from '@/types';

export default function ModelCatalog() {
  const { models, isLoading, error, refetch } = useVeniceModels();
  const { updateSelection } = useModelSelection();
  const [filters, setFilters] = useState<ModelFiltersState>(defaultFilters);

  // Filter logic
  const filteredModels = useMemo(() => {
    if (!models.length) return [];

    return models.filter((model) => {
      // Search filter
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const nameMatch = (model.name || '').toLowerCase().includes(q);
        const idMatch = model.id.toLowerCase().includes(q);
        if (!nameMatch && !idMatch) return false;
      }

      // Type filter
      if (filters.type !== 'all') {
        const type = (model.type || 'text').toLowerCase();
        if (type !== filters.type) return false;
      }

      // Vision filter
      if (filters.visionOnly) {
        const hasVision =
          model.capabilities?.supportsVision === true ||
          model.capabilities?.supports_vision === true ||
          model.capabilities?.vision === true;
        if (!hasVision) return false;
      }

      // Privacy filter
      if (filters.privacy !== 'all') {
        const privacy = (model.privacy || '').toLowerCase();
        if (privacy !== filters.privacy) return false;
      }

      // Beta filter
      if (filters.betaOnly && !model.is_beta) return false;

      // Deprecated filter
      if (filters.deprecated === 'hide' && model.is_deprecated) return false;
      if (filters.deprecated === 'only' && !model.is_deprecated) return false;

      return true;
    });
  }, [models, filters]);

  const handleUseFor = useCallback(
    (modelId: string, category: ModelCategory) => {
      updateSelection(category, modelId);
    },
    [updateSelection]
  );

  const handleRetry = () => {
    refetch();
  };

  // Status indicator
  const onlineCount = models.filter((m) => !m.is_deprecated).length;

  return (
    <div className="h-full flex flex-col p-6">
      <div className="max-w-5xl mx-auto w-full space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LayoutGrid className="size-6 text-status-info" strokeWidth={1.5} />
            <div>
              <h1 className="text-xl font-bold text-text-primary tracking-[-0.03em]">
                Model Catalogue
              </h1>
              <p className="text-sm text-text-secondary">
                Browse and search available Venice AI models
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRetry}
              disabled={isLoading}
              className="text-text-secondary hover:text-text-primary hover:bg-[#1a1e27]"
              aria-label="Refresh models"
            >
              <RefreshCw
                className={cn('size-4', isLoading && 'animate-spin')}
              />
            </Button>

            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-status-warning animate-pulse" />
                <span className="text-sm text-text-secondary">
                  Loading models...
                </span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-status-error" />
                <span className="text-sm text-status-error">
                  Connection failed
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Signal className="size-4 text-status-success" />
                <span className="text-sm text-text-secondary">
                  {onlineCount} models online
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Model count + status */}
        {!isLoading && !error && (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span>{filteredModels.length} models</span>
            {filteredModels.length !== models.length && (
              <span>(of {models.length} total)</span>
            )}
          </div>
        )}

        {/* Filters */}
        {!error && (
          <ModelFilters filters={filters} onChange={setFilters} />
        )}

        {/* Table */}
        <ModelsTable
          models={filteredModels}
          isLoading={isLoading}
          error={error}
          onRetry={handleRetry}
          onUseFor={handleUseFor}
        />
      </div>
    </div>
  );
}
