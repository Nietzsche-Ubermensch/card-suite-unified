import {
  DollarSign,
  Coins,
  Activity,
  AlertTriangle,
  Clock,
  Signal,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface VeniceStatusPopoverProps {
  children: React.ReactNode;
  status?: {
    ok?: boolean;
    balanceUsd?: string | null;
    balanceDiem?: string | null;
    remainingRequests?: string | null;
    limitRequests?: string | null;
    remainingTokens?: string | null;
    resetRequests?: string | null;
    deprecationWarning?: string | null;
    deprecationDate?: string | null;
    modelName?: string | null;
  };
}

export default function VeniceStatusPopover({ children, status }: VeniceStatusPopoverProps) {
  const connectionColor = status?.ok === undefined
    ? 'text-status-warning'
    : status.ok
      ? 'text-status-success'
      : 'text-status-error';

  const connectionLabel = status?.ok === undefined
    ? 'Unknown'
    : status.ok
      ? 'Connected'
      : 'Disconnected';

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 p-3 bg-app-tooltip border-border-subtle shadow-lg"
      >
        <div className="space-y-2.5">
          {/* Connection */}
          <div className="flex items-center gap-2">
            <Signal className={cn('size-4', connectionColor)} />
            <span className="text-sm font-medium text-text-primary">{connectionLabel}</span>
            {status?.modelName && (
              <span className="text-xs text-text-tertiary ml-auto">{status.modelName}</span>
            )}
          </div>

          {/* Balances */}
          {status?.balanceUsd && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="size-3.5 text-status-success" />
              <span className="text-text-secondary">USD Balance:</span>
              <span className="text-status-success ml-auto">{status.balanceUsd}</span>
            </div>
          )}
          {status?.balanceDiem && (
            <div className="flex items-center gap-2 text-sm">
              <Coins className="size-3.5 text-text-secondary" />
              <span className="text-text-secondary">DIEM Balance:</span>
              <span className="text-text-primary ml-auto">{status.balanceDiem}</span>
            </div>
          )}

          {/* Rate limits */}
          {status?.remainingRequests && (
            <div className="flex items-center gap-2 text-sm">
              <Activity className="size-3.5 text-status-info" />
              <span className="text-text-secondary">Requests:</span>
              <span className="text-text-primary ml-auto">
                {status.remainingRequests}
                {status.limitRequests ? ` / ${status.limitRequests}` : ''}
              </span>
            </div>
          )}
          {status?.remainingTokens && (
            <div className="flex items-center gap-2 text-sm">
              <Activity className="size-3.5 text-status-processing" />
              <span className="text-text-secondary">Tokens:</span>
              <span className="text-text-primary ml-auto">{status.remainingTokens}</span>
            </div>
          )}
          {status?.resetRequests && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="size-3.5 text-text-tertiary" />
              <span className="text-text-secondary">Resets:</span>
              <span className="text-text-primary ml-auto">{status.resetRequests}</span>
            </div>
          )}

          {/* Deprecation */}
          {status?.deprecationWarning && (
            <div className="flex items-start gap-2 text-sm p-2 rounded-sm bg-status-warning/10 border border-status-warning/20">
              <AlertTriangle className="size-3.5 text-status-warning shrink-0 mt-0.5" />
              <span className="text-status-warning text-xs">{status.deprecationWarning}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
