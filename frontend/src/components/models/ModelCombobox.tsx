import { useState } from 'react';
import { Check, ChevronsUpDown, Eye, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import type { VeniceModel } from '@/types';

interface ModelComboboxProps {
  models: VeniceModel[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
}

function getFriendlyModelName(model: VeniceModel): string {
  return model.name || model.id;
}

function formatPrice(model: VeniceModel): string {
  if (!model.pricing) return 'Free';
  if (model.pricing.prompt === 0 && model.pricing.completion === 0) return 'Free';
  if (model.pricing.prompt !== undefined && model.pricing.prompt > 0) {
    return `$${model.pricing.prompt.toFixed(4)}/tok`;
  }
  if (model.pricing.image !== undefined && model.pricing.image > 0) {
    return `$${model.pricing.image.toFixed(4)}/img`;
  }
  return 'Free';
}

function getModelTypeLabel(type?: string): string {
  if (!type) return 'text';
  return type.toLowerCase();
}

const typeBadgeColors: Record<string, string> = {
  text: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  image: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  inpaint: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  edit: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  upscale: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

export default function ModelCombobox({
  models,
  selectedId,
  onSelect,
  placeholder = 'Select a model...',
  disabled = false,
  emptyText = 'No models found.',
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedModel = models.find((m) => m.id === selectedId);

  // Group models by type
  const groups = models.reduce<Record<string, VeniceModel[]>>((acc, model) => {
    const type = getModelTypeLabel(model.type);
    if (!acc[type]) acc[type] = [];
    acc[type].push(model);
    return acc;
  }, {});

  const groupOrder = ['text', 'image', 'inpaint', 'edit', 'upscale'];
  const sortedGroups = groupOrder.filter((g) => groups[g]?.length > 0);
  // Add any other types not in the order list
  Object.keys(groups).forEach((g) => {
    if (!sortedGroups.includes(g)) sortedGroups.push(g);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between bg-[#0d1016] border-[#1e2230] hover:bg-[#1a1e27] hover:border-[#3a4055] text-text-primary h-9',
            !selectedId && 'text-text-tertiary'
          )}
        >
          {selectedModel ? (
            <span className="flex items-center gap-2 truncate">
              <span className="truncate">{getFriendlyModelName(selectedModel)}</span>
              {selectedModel.is_deprecated && (
                <AlertTriangle className="size-3 text-status-warning shrink-0" />
              )}
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[380px] p-0 bg-[#12151c] border-[#2A2E39] shadow-lg"
        align="start"
      >
        <Command className="bg-transparent [&_[cmdk-group-heading]]:text-[#5e6a7e]">
          <CommandInput
            placeholder="Search models by name or ID..."
            className="h-9 border-0 border-b border-[#1e2230] text-text-primary placeholder:text-text-tertiary"
          />
          <CommandList className="max-h-[320px]">
            <CommandEmpty className="py-4 text-sm text-text-tertiary text-center">
              {emptyText}
            </CommandEmpty>
            {sortedGroups.map((group) => (
              <CommandGroup
                key={group}
                heading={group.charAt(0).toUpperCase() + group.slice(1) + ' Models'}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em]"
              >
                {groups[group].map((model) => {
                  const isSelected = model.id === selectedId;
                  const hasVision =
                    model.capabilities?.supportsVision === true ||
                    model.capabilities?.supports_vision === true ||
                    model.capabilities?.vision === true;

                  return (
                    <CommandItem
                      key={model.id}
                      value={`${model.name || ''} ${model.id}`}
                      onSelect={() => {
                        onSelect(model.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex flex-col items-start gap-0.5 px-3 py-2 cursor-pointer rounded-sm',
                        'hover:bg-[#1a1e27] data-[selected=true]:bg-[#1e2330]'
                      )}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span
                          className={cn(
                            'flex-1 text-sm truncate',
                            model.is_deprecated
                              ? 'line-through text-text-tertiary'
                              : 'text-text-primary'
                          )}
                        >
                          {getFriendlyModelName(model)}
                        </span>
                        {isSelected && (
                          <Check className="size-3.5 text-status-info shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 w-full">
                        <code className="text-[11px] text-text-tertiary font-mono truncate">
                          {model.id}
                        </code>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] px-1.5 py-0 h-4 font-medium capitalize',
                            typeBadgeColors[getModelTypeLabel(model.type)] ||
                              typeBadgeColors.text
                          )}
                        >
                          {getModelTypeLabel(model.type)}
                        </Badge>
                        {hasVision && (
                          <Eye className="size-3 text-status-success shrink-0" />
                        )}
                        {model.is_beta && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0 h-4 font-medium bg-status-info/10 text-status-info border-status-info/20"
                          >
                            Beta
                          </Badge>
                        )}
                        <span className="ml-auto text-[10px] text-text-tertiary shrink-0">
                          {formatPrice(model)}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
