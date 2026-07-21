import {
  Sparkles,
  Trash2,
  MessageSquare,
  Image,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import ModelCombobox from '@/components/models/ModelCombobox';
import { useVeniceModels } from '@/hooks/useVeniceModels';
import { useModelSelection } from '@/hooks/useModelSelection';
import type { ModelCategory, VeniceModel } from '@/types';

interface SelectorRowProps {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  description: string;
  models: VeniceModel[];
  selectedId: string;
  onSelect: (id: string) => void;
  warning?: string;
  disabled?: boolean;
}

function SelectorRow({
  icon: Icon,
  iconColor,
  label,
  description,
  models,
  selectedId,
  onSelect,
  warning,
  disabled,
}: SelectorRowProps) {
  const selectedModel = models.find((m) => m.id === selectedId);
  const isDeprecated = selectedModel?.is_deprecated;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className={cn('size-4', iconColor)} />
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        {isDeprecated && (
          <AlertTriangle className="size-3.5 text-status-warning" />
        )}
        {warning && models.length === 0 && (
          <span className="flex items-center gap-1 text-[11px] text-status-warning">
            <AlertTriangle className="size-3" />
            {warning}
          </span>
        )}
      </div>
      <p className="text-[11px] text-text-tertiary ml-6">{description}</p>
      <div className="ml-6">
        <ModelCombobox
          models={models}
          selectedId={selectedId}
          onSelect={onSelect}
          placeholder={`Select ${label.toLowerCase()}...`}
          disabled={disabled || models.length === 0}
          emptyText="No models available for this category"
        />
      </div>
    </div>
  );
}

export default function ModelsSettings() {
  const { models, categorized, isLoading, refetch } = useVeniceModels();
  const { selected, updateSelection } = useModelSelection();

  const handleUseFor = (modelId: string, category: ModelCategory) => {
    updateSelection(category, modelId);
  };

  return (
    <div className="space-y-6">
      {/* Active Models Section */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-4">
          Active Model Assignments
        </h3>
        <div className="space-y-5">
          <SelectorRow
            icon={Trash2}
            iconColor="text-status-warning"
            label="Cleanup Model"
            description="Used for scan cleanup, restoration, and removing artifacts"
            models={categorized?.restore ?? []}
            selectedId={selected.restore}
            onSelect={(id) => handleUseFor(id, 'restore')}
            warning="No cleanup models available"
          />
          <SelectorRow
            icon={Sparkles}
            iconColor="text-status-success"
            label="Analysis Model"
            description="Used for card analysis, condition detection, and material identification"
            models={categorized?.analysis ?? []}
            selectedId={selected.analysis}
            onSelect={(id) => handleUseFor(id, 'analysis')}
            warning="No analysis models available"
          />
          <SelectorRow
            icon={MessageSquare}
            iconColor="text-status-info"
            label="Chat Model"
            description="Used for the AI assistant panel conversations"
            models={categorized?.chat ?? []}
            selectedId={selected.chat}
            onSelect={(id) => handleUseFor(id, 'chat')}
            warning="No chat models available"
          />
          <SelectorRow
            icon={Image}
            iconColor="text-purple-400"
            label="Image Generation Model"
            description="Used for generating card images and variations"
            models={categorized?.image ?? []}
            selectedId={selected.image}
            onSelect={(id) => handleUseFor(id, 'image')}
            warning="No image generation models available"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[#1e2230] pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-secondary">Model Library</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              {isLoading
                ? 'Loading models...'
                : `${models.length} models available`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="border-[#2A2E39] text-text-secondary hover:text-text-primary hover:bg-[#1a1e27]"
          >
            <RefreshCw
              className={cn('size-3.5 mr-1.5', isLoading && 'animate-spin')}
            />
            Refresh Models
          </Button>
        </div>
      </div>
    </div>
  );
}
