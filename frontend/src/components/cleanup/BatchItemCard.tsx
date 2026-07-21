import { useState } from 'react';
import {
  RotateCcw,
  X,
  ArrowLeftRight,
  Play,
  Pause,
  Square,
  Trash2,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BatchItem } from '@/types';

interface BatchItemCardProps {
  item: BatchItem;
  onRetry: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onCompare: () => void;
}

const statusConfig: Record<
  BatchItem['state'],
  { label: string; bg: string; text: string; border: string; dot?: boolean }
> = {
  queued: {
    label: 'Queued',
    bg: 'bg-gray-500/10',
    text: 'text-gray-400',
    border: 'border-gray-500/20',
  },
  analyzing: {
    label: 'Analyzing',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
    dot: true,
  },
  cleaning: {
    label: 'Cleaning',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
    dot: true,
  },
  complete: {
    label: 'Complete',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  paused: {
    label: 'Paused',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-gray-500/10',
    text: 'text-gray-400',
    border: 'border-gray-500/20',
  },
  failed: {
    label: 'Failed',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/20',
  },
};

const materialLabels: Record<BatchItem['material'], string> = {
  cardboard: 'Cardboard',
  chrome: 'Chrome',
  refractor: 'Refractor',
  unknown: 'Unknown',
};

const sideBadgeConfig: Record<BatchItem['side'], { label: string; className: string }> = {
  front: {
    label: 'FRONT',
    className: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
  back: {
    label: 'BACK',
    className: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
};

export default function BatchItemCard({
  item,
  onRetry,
  onCancel,
  onRemove,
  onCompare,
}: BatchItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const status = statusConfig[item.state];

  const progressGradient =
    item.state === 'complete'
      ? 'from-emerald-500 to-emerald-400'
      : item.state === 'failed'
        ? 'from-red-500 to-red-400'
        : 'from-cyan-500 to-indigo-500';

  const canCompare = item.state === 'complete' && item.cleanedUrl;

  return (
    <div
      className={cn(
        'bg-app-panel border border-border-subtle rounded-md p-3 transition-all duration-100',
        'hover:border-border-medium hover:-translate-y-px hover:shadow-sm',
      )}
    >
      {/* Thumbnail */}
      <button
        type="button"
        onClick={canCompare ? onCompare : undefined}
        className={cn(
          'relative w-full aspect-[1/1.15] rounded-sm overflow-hidden bg-app-input',
          canCompare && 'cursor-pointer',
          !canCompare && 'cursor-default',
        )}
        aria-label={canCompare ? `Compare original and cleaned for ${item.filename}` : undefined}
      >
        {/* Checkerboard placeholder pattern */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'repeating-conic-gradient(#1a1e27 0% 25%, transparent 0% 50%)',
            backgroundSize: '16px 16px',
          }}
        />
        {item.previewUrl && (
          <img
            src={item.previewUrl}
            alt={item.filename}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )}

        {/* Side badge */}
        <span
          className={cn(
            'absolute top-2 left-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border',
            sideBadgeConfig[item.side].className,
          )}
        >
          {sideBadgeConfig[item.side].label}
        </span>

        {/* Material badge */}
        <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-app-panel/80 text-text-tertiary border border-border-subtle">
          {materialLabels[item.material]}
        </span>

        {/* Status badge at bottom */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full border',
              status.bg,
              status.text,
              status.border,
            )}
          >
            {status.dot && (
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className={cn(
                    'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                    status.text.replace('text-', 'bg-'),
                  )}
                />
                <span
                  className={cn(
                    'relative inline-flex rounded-full h-1.5 w-1.5',
                    status.text.replace('text-', 'bg-'),
                  )}
                />
              </span>
            )}
            {status.label}
          </span>
          <span className="text-[10px] text-text-secondary font-medium">
            {item.progress}%
          </span>
        </div>
      </button>

      {/* File Info */}
      <div className="mt-2 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate font-mono">
          {item.filename}
        </p>
        <p className="text-xs text-text-tertiary mt-0.5">
          {materialLabels[item.material]} &middot;{' '}
          {item.orientation === 'horizontal'
            ? 'Horizontal'
            : item.orientation === 'vertical'
              ? 'Vertical'
              : 'Unknown orientation'}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mt-2">
        <div className="h-1 bg-app-input rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full bg-gradient-to-r transition-all duration-300',
              progressGradient,
            )}
            style={{ width: `${item.progress}%` }}
          />
        </div>
      </div>

      {/* Error message */}
      {item.error && (
        <p className="mt-2 text-xs text-red-400 truncate" title={item.error}>
          {item.error}
        </p>
      )}

      {/* Action buttons */}
      <div className="mt-2 flex items-center gap-1">
        {item.state === 'queued' && (
          <>
            <button
              onClick={onRetry}
              className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-text-primary hover:bg-app-panel-hover transition-colors"
              aria-label="Start processing"
              title="Start"
            >
              <Play className="size-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={onCancel}
              className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="Cancel processing"
              title="Cancel"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          </>
        )}

        {(item.state === 'analyzing' || item.state === 'cleaning') && (
          <>
            <button
              onClick={onCancel}
              className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
              aria-label="Pause processing"
              title="Pause"
            >
              <Pause className="size-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={onCancel}
              className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="Stop processing"
              title="Stop"
            >
              <Square className="size-3.5" strokeWidth={1.5} />
            </button>
          </>
        )}

        {item.state === 'paused' && (
          <>
            <button
              onClick={onRetry}
              className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-text-primary hover:bg-app-panel-hover transition-colors"
              aria-label="Resume processing"
              title="Resume"
            >
              <Play className="size-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={onCancel}
              className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="Cancel processing"
              title="Cancel"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          </>
        )}

        {item.state === 'complete' && (
          <>
            {canCompare && (
              <button
                onClick={onCompare}
                className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-text-primary hover:bg-app-panel-hover transition-colors"
                aria-label="Compare original and cleaned"
                title="Compare"
              >
                <ArrowLeftRight className="size-3.5" strokeWidth={1.5} />
              </button>
            )}
            <button
              onClick={onRemove}
              className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="Remove from queue"
              title="Remove"
            >
              <Trash2 className="size-3.5" strokeWidth={1.5} />
            </button>
          </>
        )}

        {item.state === 'failed' && (
          <>
            <button
              onClick={onRetry}
              className="inline-flex items-center justify-center size-7 rounded-sm text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
              aria-label="Retry processing"
              title="Retry"
            >
              <RotateCcw className="size-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={onRemove}
              className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="Remove from queue"
              title="Remove"
            >
              <Trash2 className="size-3.5" strokeWidth={1.5} />
            </button>
            {item.error && (
              <button
                className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label={`Error: ${item.error}`}
                title={item.error}
              >
                <AlertTriangle className="size-3.5 text-red-400" strokeWidth={1.5} />
              </button>
            )}
          </>
        )}

        {(item.state === 'cancelled') && (
          <button
            onClick={onRemove}
            className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label="Remove from queue"
            title="Remove"
          >
            <Trash2 className="size-3.5" strokeWidth={1.5} />
          </button>
        )}

        {/* Expand analysis detail */}
        {item.analysis && (
          <button
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-text-primary hover:bg-app-panel-hover transition-colors ml-auto',
              expanded && 'text-text-primary bg-app-panel-hover',
            )}
            aria-label={expanded ? 'Hide analysis details' : 'Show analysis details'}
            title="Analysis details"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
              strokeWidth={1.5}
            />
          </button>
        )}
      </div>

      {/* Expanded analysis details */}
      {expanded && item.analysis && (
        <div className="mt-2 pt-2 border-t border-border-subtle space-y-1.5">
          {item.analysis.artifactTypes && item.analysis.artifactTypes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">
                Artifacts
              </p>
              <p className="text-xs text-text-secondary">
                {item.analysis.artifactTypes.join(', ')}
              </p>
            </div>
          )}
          {item.analysis.colorCast && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">
                Color Cast
              </p>
              <p className="text-xs text-text-secondary">{item.analysis.colorCast}</p>
            </div>
          )}
          {item.analysis.lightingIssues && item.analysis.lightingIssues.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">
                Lighting Issues
              </p>
              <p className="text-xs text-text-secondary">
                {item.analysis.lightingIssues.join(', ')}
              </p>
            </div>
          )}
          {item.analysis.recommendedApproach && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">
                Approach
              </p>
              <p className="text-xs text-text-secondary">
                {item.analysis.recommendedApproach}
              </p>
            </div>
          )}
          {item.analysis.confidence !== undefined && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">
                Confidence
              </p>
              <p className="text-xs text-text-secondary">
                {Math.round(item.analysis.confidence * 100)}%
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
