import { Search, X, Eye, Filter, Shield, Sparkles, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface ModelFiltersState {
  search: string;
  type: string;
  visionOnly: boolean;
  privacy: string;
  betaOnly: boolean;
  deprecated: 'hide' | 'show' | 'only';
}

interface ModelFiltersProps {
  filters: ModelFiltersState;
  onChange: (filters: ModelFiltersState) => void;
}

export const defaultFilters: ModelFiltersState = {
  search: '',
  type: 'all',
  visionOnly: false,
  privacy: 'all',
  betaOnly: false,
  deprecated: 'hide',
};

export default function ModelFilters({ filters, onChange }: ModelFiltersProps) {
  const update = (patch: Partial<ModelFiltersState>) => {
    onChange({ ...filters, ...patch });
  };

  const hasActiveFilters =
    filters.search !== '' ||
    filters.type !== 'all' ||
    filters.visionOnly ||
    filters.privacy !== 'all' ||
    filters.betaOnly ||
    filters.deprecated !== 'hide';

  return (
    <div className="space-y-3">
      {/* Search + Filter toggle row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary pointer-events-none" />
          <Input
            type="text"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search models by name, ID, or capability..."
            className="w-full h-10 pl-10 pr-10 bg-[#0d1016] border-[#1e2230] rounded-md text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-accent focus:ring-1 focus:ring-status-info/30"
          />
          {filters.search && (
            <button
              onClick={() => update({ search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter controls row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Type filter */}
        <Select value={filters.type} onValueChange={(v) => update({ type: v })}>
          <SelectTrigger className="h-8 min-w-[110px] w-auto bg-[#0d1016] border-[#1e2230] text-xs text-text-secondary hover:border-[#3a4055]">
            <Filter className="size-3 mr-1.5" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent className="bg-[#12151c] border-[#2A2E39]">
            <SelectItem value="all" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              All Types
            </SelectItem>
            <SelectItem value="text" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              Text
            </SelectItem>
            <SelectItem value="image" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              Image
            </SelectItem>
            <SelectItem value="inpaint" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              Inpaint
            </SelectItem>
            <SelectItem value="edit" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              Edit
            </SelectItem>
            <SelectItem value="upscale" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              Upscale
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Privacy filter */}
        <Select value={filters.privacy} onValueChange={(v) => update({ privacy: v })}>
          <SelectTrigger className="h-8 min-w-[110px] w-auto bg-[#0d1016] border-[#1e2230] text-xs text-text-secondary hover:border-[#3a4055]">
            <Shield className="size-3 mr-1.5" />
            <SelectValue placeholder="Privacy" />
          </SelectTrigger>
          <SelectContent className="bg-[#12151c] border-[#2A2E39]">
            <SelectItem value="all" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              All Privacy
            </SelectItem>
            <SelectItem value="public" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              Public
            </SelectItem>
            <SelectItem value="private" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              Private
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Vision toggle */}
        <button
          onClick={() => update({ visionOnly: !filters.visionOnly })}
          className={cn(
            'flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
            filters.visionOnly
              ? 'bg-status-info/10 text-status-info border-status-info/30'
              : 'bg-[#0d1016] text-text-secondary border-[#1e2230] hover:text-text-primary hover:border-[#3a4055]'
          )}
          aria-pressed={filters.visionOnly}
        >
          <Eye className="size-3.5" />
          Vision
        </button>

        {/* Beta toggle */}
        <button
          onClick={() => update({ betaOnly: !filters.betaOnly })}
          className={cn(
            'flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
            filters.betaOnly
              ? 'bg-status-info/10 text-status-info border-status-info/30'
              : 'bg-[#0d1016] text-text-secondary border-[#1e2230] hover:text-text-primary hover:border-[#3a4055]'
          )}
          aria-pressed={filters.betaOnly}
        >
          <Sparkles className="size-3.5" />
          Beta
        </button>

        {/* Deprecated filter */}
        <Select
          value={filters.deprecated}
          onValueChange={(v) => update({ deprecated: v as 'hide' | 'show' | 'only' })}
        >
          <SelectTrigger className="h-8 min-w-[110px] w-auto bg-[#0d1016] border-[#1e2230] text-xs text-text-secondary hover:border-[#3a4055]">
            <AlertTriangle className="size-3 mr-1.5" />
            <SelectValue placeholder="Deprecated" />
          </SelectTrigger>
          <SelectContent className="bg-[#12151c] border-[#2A2E39]">
            <SelectItem value="hide" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              Hide Deprecated
            </SelectItem>
            <SelectItem value="show" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              Show Deprecated
            </SelectItem>
            <SelectItem value="only" className="text-xs text-text-primary focus:bg-[#1a1e27]">
              Deprecated Only
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Clear all */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...defaultFilters })}
            className="h-8 px-2 text-xs text-text-tertiary hover:text-text-primary"
          >
            <X className="size-3 mr-1" />
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
