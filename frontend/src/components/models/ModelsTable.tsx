import { useState, useMemo, useRef, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  MoreHorizontal,
  MessageSquare,
  Sparkles,
  Trash2,
  Image,
  WifiOff,
  RefreshCw,
  SearchX,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import ModelDetails from './ModelDetails';
import type { VeniceModel } from '@/types';
import type { ModelCategory } from '@/types';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
interface ModelsTableProps {
  models: VeniceModel[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onUseFor: (modelId: string, category: ModelCategory) => void;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
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

function getResolutions(model: VeniceModel): string {
  if (model.supported_resolutions?.length) {
    return model.supported_resolutions.join(', ');
  }
  return 'N/A';
}

const typeBadgeColors: Record<string, string> = {
  text: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  image: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  inpaint: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  edit: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  upscale: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

const privacyBadgeColors: Record<string, string> = {
  public: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  private: 'bg-status-info/10 text-status-info border-status-info/20',
};

// Skeleton row
function SkeletonRow() {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-6" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
      <td className="px-4 py-3"><Skeleton className="h-7 w-8" /></td>
    </tr>
  );
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------
const columnHelper = createColumnHelper<VeniceModel>();

export default function ModelsTable({
  models,
  isLoading,
  error,
  onRetry,
  onUseFor,
}: ModelsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  }, []);

  // Columns definition
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting()}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Sort by name"
          >
            Name
            {column.getIsSorted() === 'asc' && <ArrowUp className="size-3" />}
            {column.getIsSorted() === 'desc' && <ArrowDown className="size-3" />}
            {!column.getIsSorted() && <ArrowUpDown className="size-3 opacity-40" />}
          </button>
        ),
        cell: ({ row }) => {
          const model = row.original;
          return (
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={cn(
                  'size-1.5 rounded-full shrink-0',
                  model.is_deprecated ? 'bg-status-warning' : 'bg-status-success'
                )}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'text-sm font-medium truncate',
                      model.is_deprecated
                        ? 'line-through text-text-tertiary'
                        : 'text-text-primary'
                    )}
                  >
                    {getFriendlyModelName(model)}
                  </span>
                  {model.is_beta && (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 h-4 font-medium bg-status-info/10 text-status-info border-status-info/20 shrink-0"
                    >
                      Beta
                    </Badge>
                  )}
                </div>
                <code className="text-[11px] text-text-tertiary font-mono">{model.id}</code>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('type', {
        header: 'Type',
        cell: ({ row }) => {
          const type = (row.original.type || 'text').toLowerCase();
          return (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-2 py-0 h-5 font-medium capitalize',
                typeBadgeColors[type] || typeBadgeColors.text
              )}
            >
              {type}
            </Badge>
          );
        },
      }),
      columnHelper.accessor('privacy', {
        header: 'Privacy',
        cell: ({ row }) => {
          const privacy = (row.original.privacy || 'unknown').toLowerCase();
          if (!row.original.privacy) return <span className="text-text-tertiary text-xs">—</span>;
          return (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-2 py-0 h-5 font-medium capitalize',
                privacyBadgeColors[privacy] || 'bg-[#1a1e27] text-text-secondary border-[#2A2E39]'
              )}
            >
              {privacy}
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: 'vision',
        header: 'Vision',
        cell: ({ row }) => {
          const hasVision =
            row.original.capabilities?.supportsVision === true ||
            row.original.capabilities?.supports_vision === true ||
            row.original.capabilities?.vision === true;
          return hasVision ? (
            <Eye className="size-4 text-status-success" />
          ) : (
            <EyeOff className="size-4 text-text-disabled" />
          );
        },
      }),
      columnHelper.display({
        id: 'resolutions',
        header: 'Resolutions',
        cell: ({ row }) => (
          <span className="text-xs text-text-secondary truncate max-w-[120px] block">
            {getResolutions(row.original)}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'price',
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting()}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Sort by price"
          >
            Price
            {column.getIsSorted() === 'asc' && <ArrowUp className="size-3" />}
            {column.getIsSorted() === 'desc' && <ArrowDown className="size-3" />}
            {!column.getIsSorted() && <ArrowUpDown className="size-3 opacity-40" />}
          </button>
        ),
        cell: ({ row }) => {
          const price = formatPrice(row.original);
          const isFree = price === 'Free';
          return (
            <span className={cn('text-xs', isFree ? 'text-status-success font-medium' : 'text-text-secondary')}>
              {price}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const model = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-text-tertiary hover:text-text-primary hover:bg-[#1a1e27]"
                  aria-label="Open actions menu"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 bg-[#12151c] border-[#2A2E39]"
              >
                <DropdownMenuItem
                  onClick={() => onUseFor(model.id, 'chat')}
                  className="text-xs text-text-primary focus:bg-[#1a1e27] focus:text-text-primary cursor-pointer"
                >
                  <MessageSquare className="size-3.5 mr-2 text-status-info" />
                  Use for Chat
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onUseFor(model.id, 'analysis')}
                  className="text-xs text-text-primary focus:bg-[#1a1e27] focus:text-text-primary cursor-pointer"
                >
                  <Sparkles className="size-3.5 mr-2 text-status-success" />
                  Use for Analysis
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onUseFor(model.id, 'restore')}
                  className="text-xs text-text-primary focus:bg-[#1a1e27] focus:text-text-primary cursor-pointer"
                >
                  <Trash2 className="size-3.5 mr-2 text-status-warning" />
                  Use for Cleanup
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onUseFor(model.id, 'image')}
                  className="text-xs text-text-primary focus:bg-[#1a1e27] focus:text-text-primary cursor-pointer"
                >
                  <Image className="size-3.5 mr-2 text-purple-400" />
                  Use for Image Gen
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#2A2E39]" />
                <DropdownMenuItem
                  onClick={() => toggleExpand(model.id)}
                  className="text-xs text-text-primary focus:bg-[#1a1e27] focus:text-text-primary cursor-pointer"
                >
                  <ChevronDown className="size-3.5 mr-2 text-text-secondary" />
                  View Details
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }),
    ],
    [onUseFor, toggleExpand]
  );

  const table = useReactTable({
    data: models,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  // Virtualization
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-[#12151c] border border-[#1e2230] rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0f1118] sticky top-0 z-10">
              <tr>
                {['Name', 'Type', 'Privacy', 'Vision', 'Resolutions', 'Price', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2230]">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-[#12151c] border border-[#1e2230] rounded-md">
        <WifiOff className="size-8 text-status-error mb-3" />
        <p className="text-md font-semibold text-status-error">
          Could not load model catalog
        </p>
        <p className="text-sm text-text-secondary mt-1">
          Check your API connection and try again
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-4 border-status-info text-status-info hover:bg-status-info/10"
        >
          <RefreshCw className="size-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  // Empty state
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-[#12151c] border border-[#1e2230] rounded-md">
        <SearchX className="size-8 text-text-tertiary mb-3" />
        <p className="text-md font-semibold text-text-primary">
          No models match your search
        </p>
        <p className="text-sm text-text-tertiary mt-1">
          Try different keywords or clear filters
        </p>
      </div>
    );
  }

  return (
    <div
      ref={tableContainerRef}
      className="bg-[#12151c] border border-[#1e2230] rounded-md overflow-hidden"
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#0f1118] sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-[#1e2230]">
            {/* Virtualized rows */}
            <tr>
              <td colSpan={columns.length} style={{ height: virtualRows[0]?.start ?? 0 }} />
            </tr>
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              const isExpanded = expandedRow === row.original.id;

              return (
                <>
                  <tr
                    key={row.id}
                    onClick={() => toggleExpand(row.original.id)}
                    className={cn(
                      'cursor-pointer transition-colors duration-100',
                      isExpanded
                        ? 'bg-[#1e2330] border-l-[3px] border-l-status-info'
                        : 'hover:bg-[#1a1e27] border-l-[3px] border-l-transparent'
                    )}
                    style={{ height: 52 }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-2.5 whitespace-nowrap"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={columns.length} className="p-0">
                        <ModelDetails model={row.original} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            <tr>
              <td colSpan={columns.length} style={{ height: totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0) }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
