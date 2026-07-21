import { useCallback, useState, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Layers,
  Upload,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Plus,
  Clock,
  X,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import BatchItemCard from './BatchItemCard';
import type { BatchItem, BatchItemState } from '@/types';

interface BatchCleanupQueueProps {
  items: BatchItem[];
  isRunning: boolean;
  isPaused: boolean;
  globalProgress: number;
  onAddFiles: (files: File[]) => void;
  onStartBatch: () => void;
  onPauseBatch: () => void;
  onResumeBatch: () => void;
  onRetryItem: (id: string) => void;
  onCancelItem: (id: string) => void;
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
}

type FilterTab = 'all' | BatchItemState;

const filterTabs: { key: FilterTab; label: string; count?: (items: BatchItem[]) => number }[] = [
  { key: 'all', label: 'All', count: (items) => items.length },
  { key: 'queued', label: 'Queued', count: (items) => items.filter((i) => i.state === 'queued').length },
  { key: 'analyzing', label: 'Analyzing', count: (items) => items.filter((i) => i.state === 'analyzing').length },
  { key: 'cleaning', label: 'Cleaning', count: (items) => items.filter((i) => i.state === 'cleaning').length },
  { key: 'complete', label: 'Done', count: (items) => items.filter((i) => i.state === 'complete').length },
  { key: 'failed', label: 'Failed', count: (items) => items.filter((i) => i.state === 'failed').length },
];

export default function BatchCleanupQueue({
  items,
  isRunning,
  isPaused,
  globalProgress,
  onAddFiles,
  onStartBatch,
  onPauseBatch,
  onResumeBatch,
  onRetryItem,
  onCancelItem,
  onRemoveItem,
  onClearAll,
}: BatchCleanupQueueProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onAddFiles(acceptedFiles);
      }
    },
    [onAddFiles],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/tiff': ['.tiff', '.tif'],
      'image/webp': ['.webp'],
    },
    multiple: true,
    noClick: items.length > 0,
  });

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    return items.filter((item) => item.state === activeFilter);
  }, [items, activeFilter]);

  const queuedCount = items.filter((i) => i.state === 'queued' || i.state === 'paused').length;
  const failedCount = items.filter((i) => i.state === 'failed').length;
  const completedCount = items.filter((i) => i.state === 'complete').length;
  const hasItems = items.length > 0;

  const handleClearAll = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    onClearAll();
    setConfirmClear(false);
    toast.info('Queue cleared');
  }, [confirmClear, onClearAll]);

  const handleRetryFailed = useCallback(() => {
    const failed = items.filter((i) => i.state === 'failed');
    failed.forEach((item) => onRetryItem(item.id));
    toast.info(`Retrying ${failed.length} failed item${failed.length > 1 ? 's' : ''}`);
  }, [items, onRetryItem]);

  const handleClearCompleted = useCallback(() => {
    const completed = items.filter((i) => i.state === 'complete');
    completed.forEach((item) => onRemoveItem(item.id));
    toast.info(`Removed ${completed.length} completed item${completed.length > 1 ? 's' : ''}`);
  }, [items, onRemoveItem]);

  // Empty state
  if (!hasItems) {
    return (
      <div className="h-full flex flex-col p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Batch Cleanup</h1>
            <p className="text-sm text-text-secondary mt-1">
              Process up to 50 card scans in parallel with AI cleanup
            </p>
          </div>
        </div>

        {/* Full dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            'flex-1 flex flex-col items-center justify-center min-h-[320px] rounded-lg border-2 border-dashed transition-all cursor-pointer',
            'bg-app-dropzone border-border-medium',
            isDragActive && 'border-status-info bg-app-dropzone-active shadow-glow-sm',
          )}
        >
          <input {...getInputProps()} />
          <Layers
            className={cn(
              'size-12 transition-colors',
              isDragActive ? 'text-status-info' : 'text-text-tertiary',
            )}
            strokeWidth={1.5}
          />
          <p className="mt-4 text-lg font-semibold text-text-primary">
            Drop up to 50 card scans here
          </p>
          <p className="mt-2 text-sm text-text-tertiary text-center max-w-md">
            Front/back auto-detected from filenames
            <br />
            (e.g., card_001.jpg + card_001b.jpg)
          </p>
          <div className="mt-4 flex items-center gap-2">
            {['JPG', 'PNG', 'TIFF', 'WEBP'].map((fmt) => (
              <span
                key={fmt}
                className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-sm bg-app-panel text-text-tertiary border border-border-subtle"
              >
                {fmt}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm text-status-info">Or click to browse files</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* Page Title Row */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Batch Cleanup</h1>
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {items.length} card{items.length > 1 ? 's' : ''}
          </span>
          {completedCount === items.length && items.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Batch Complete
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={open}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-sm text-sm font-medium bg-status-info text-white hover:brightness-110 transition-all"
            aria-label="Upload more cards"
          >
            <Upload className="size-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Upload Cards</span>
          </button>
          {completedCount === items.length && items.length > 0 && (
            <button
              onClick={handleClearCompleted}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-sm text-sm font-medium bg-status-info text-white hover:brightness-110 transition-all"
              aria-label="Export all cleaned cards"
            >
              <Upload className="size-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Export All</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact dropzone bar */}
      <div
        {...getRootProps()}
        className={cn(
          'shrink-0 flex items-center justify-center gap-2 h-14 rounded-md border border-dashed transition-all cursor-pointer mb-4',
          'bg-app-dropzone border-border-medium',
          isDragActive && 'border-status-info bg-app-dropzone-active shadow-glow-sm',
          !isDragActive && 'hover:border-border-strong hover:bg-app-dropzone-active',
        )}
      >
        <input {...getInputProps()} />
        <Plus
          className={cn(
            'size-5 transition-colors',
            isDragActive ? 'text-status-info' : 'text-text-tertiary',
          )}
          strokeWidth={1.5}
        />
        <span className="text-sm text-text-secondary">
          Drop more cards or click to add
        </span>
      </div>

      {/* Batch Controls Bar */}
      <div className="shrink-0 bg-app-panel border border-border-subtle rounded-md p-4 mb-4">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Left: Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isRunning || isPaused ? (
              <button
                onClick={isPaused ? onResumeBatch : onStartBatch}
                disabled={queuedCount === 0 && failedCount === 0}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium transition-all',
                  'bg-status-info text-white hover:brightness-110',
                  queuedCount === 0 && failedCount === 0 && 'opacity-50 cursor-not-allowed',
                )}
                aria-label={isPaused ? 'Resume batch' : 'Start batch'}
              >
                <Play className="size-3.5" strokeWidth={1.5} />
                {isPaused ? 'Resume' : 'Start Batch'}
              </button>
            ) : (
              <button
                onClick={onPauseBatch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-all"
                aria-label="Pause batch"
              >
                <Pause className="size-3.5" strokeWidth={1.5} />
                Pause
              </button>
            )}

            {failedCount > 0 && (
              <button
                onClick={handleRetryFailed}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium border border-border-medium text-text-secondary hover:bg-app-panel-hover transition-all"
                aria-label="Retry failed items"
              >
                <RotateCcw className="size-3.5" strokeWidth={1.5} />
                Retry Failed
              </button>
            )}

            <button
              onClick={handleClearCompleted}
              disabled={completedCount === 0}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-all',
                completedCount === 0 && 'opacity-40 cursor-not-allowed',
              )}
              aria-label="Clear completed items"
            >
              <Trash2 className="size-3.5" strokeWidth={1.5} />
              Clear Completed
            </button>

            <button
              onClick={handleClearAll}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium transition-all',
                confirmClear
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-text-secondary hover:text-red-400 hover:bg-red-500/10',
              )}
              aria-label={confirmClear ? 'Click again to confirm clear all' : 'Clear all items'}
            >
              {confirmClear ? (
                <>
                  <AlertTriangle className="size-3.5" strokeWidth={1.5} />
                  Confirm Clear
                </>
              ) : (
                <>
                  <X className="size-3.5" strokeWidth={1.5} />
                  Clear All
                </>
              )}
            </button>
          </div>

          {/* Right: Global progress */}
          <div className="flex items-center gap-3">
            <div className="w-40 sm:w-48">
              <div className="h-1.5 bg-app-input rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full bg-gradient-to-r transition-all duration-300',
                    globalProgress === 100
                      ? 'from-emerald-500 to-emerald-400'
                      : 'from-cyan-500 to-indigo-500',
                  )}
                  style={{ width: `${globalProgress}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-semibold text-text-primary whitespace-nowrap">
              {completedCount}/{items.length}
            </span>
            <span className="text-sm text-text-secondary whitespace-nowrap">
              {globalProgress}%
            </span>
          </div>
        </div>

        {/* Bottom row: time estimate */}
        {isRunning && !isPaused && (
          <div className="flex items-center gap-4 mt-2 text-xs text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" strokeWidth={1.5} />
              Processing...
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="shrink-0 flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {filterTabs.map((tab) => {
          const count = tab.count!(items);
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium whitespace-nowrap transition-all',
                isActive
                  ? 'bg-app-panel-active text-text-primary border-b-2 border-status-info'
                  : 'text-text-secondary hover:bg-app-panel-hover',
              )}
              aria-label={`Filter by ${tab.label}`}
              aria-pressed={isActive}
            >
              {tab.label}
              <span
                className={cn(
                  'px-1.5 py-0 rounded-full text-[10px] font-medium',
                  tab.key === 'failed' && count > 0
                    ? 'bg-red-500/10 text-red-400'
                    : tab.key === 'complete'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-app-input text-text-tertiary',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Queue Grid */}
      <div className="flex-1 min-h-0">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-text-tertiary">
              No items match the current filter
            </p>
            <button
              onClick={() => setActiveFilter('all')}
              className="mt-2 text-sm text-status-info hover:underline"
            >
              Show all
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
            {filteredItems.map((item) => (
              <BatchItemCard
                key={item.id}
                item={item}
                onRetry={() => onRetryItem(item.id)}
                onCancel={() => onCancelItem(item.id)}
                onRemove={() => onRemoveItem(item.id)}
                onCompare={() => {
                  toast.info(`Comparing ${item.filename} — comparison view not yet implemented`);
                }}
              />
            ))}

            {/* Add more cards placeholder */}
            {items.length < 50 && (
              <button
                onClick={open}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 min-h-[200px] rounded-md border-2 border-dashed transition-all cursor-pointer',
                  'bg-app-dropzone border-border-medium hover:border-border-strong hover:bg-app-dropzone-active',
                )}
                aria-label="Add more cards"
              >
                <Plus className="size-6 text-text-tertiary" strokeWidth={1.5} />
                <span className="text-sm text-text-tertiary">Add more cards</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
