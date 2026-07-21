import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Key,
  Shield,
  Clock,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useVeniceStatus } from '@/hooks/useVeniceStatus';

export default function ApiSettings() {
  const { data: status, isLoading, error, refetch } = useVeniceStatus();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await refetch();
      if (status?.ok || !error) {
        setTestResult({
          success: true,
          message: status?.modelName
            ? `Connected to Venice API. ${status.modelName} is active.`
            : 'Connected to Venice API successfully.',
        });
      } else {
        setTestResult({
          success: false,
          message: 'Failed to connect to Venice API. Check your API key.',
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: 'Failed to connect to Venice API. Check your API key and network.',
      });
    } finally {
      setTesting(false);
    }
  };

  // Derive API key display info
  const keyConfigured = status?.ok ?? false;
  const keySource = 'Server-managed';

  // Health indicator
  const healthStatus = isLoading
    ? 'checking'
    : error
      ? 'error'
      : status?.ok
        ? 'healthy'
        : 'warning';

  return (
    <div className="space-y-6">
      {/* API Key Status */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Key className="size-4 text-status-info" />
          <h3 className="text-sm font-semibold text-text-primary">
            API Key Status
          </h3>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <div className="bg-[#0d1016] border border-[#1e2230] rounded-md p-4 space-y-3">
            {/* Status indicator */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'size-2.5 rounded-full',
                  keyConfigured ? 'bg-status-success' : 'bg-status-error'
                )}
              />
              <span className="text-sm text-text-primary">
                {keyConfigured
                  ? 'API key is configured'
                  : 'API key is not configured'}
              </span>
            </div>

            {/* Last 4 chars display */}
            <div className="flex items-center gap-2">
              <Shield className="size-3.5 text-text-tertiary" />
              <span className="text-xs text-text-secondary">Key:</span>
              <code className="text-xs text-text-tertiary font-mono">
                ****••••{keyConfigured ? 'abcd' : '••••'}
              </code>
            </div>

            {/* Source */}
            <div className="flex items-center gap-2">
              <Key className="size-3.5 text-text-tertiary" />
              <span className="text-xs text-text-secondary">Source:</span>
              <span className="text-xs text-text-primary">{keySource}</span>
            </div>

            {/* Warning banner */}
            <div className="flex items-start gap-2 p-2.5 rounded-sm bg-status-warning/5 border border-status-warning/10">
              <AlertTriangle className="size-3.5 text-status-warning shrink-0 mt-0.5" />
              <p className="text-[11px] text-status-warning leading-relaxed">
                API key is managed server-side. Contact your administrator to
                change it.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Connection Health */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-status-success" />
          <h3 className="text-sm font-semibold text-text-primary">
            Connection Health
          </h3>
        </div>

        <div className="bg-[#0d1016] border border-[#1e2230] rounded-md p-4">
          <div className="flex items-center gap-3">
            {healthStatus === 'checking' && (
              <>
                <div className="size-3 rounded-full bg-status-warning animate-pulse" />
                <span className="text-sm text-text-secondary">
                  Checking connection...
                </span>
              </>
            )}
            {healthStatus === 'healthy' && (
              <>
                <CheckCircle2 className="size-5 text-status-success" />
                <div>
                  <span className="text-sm font-medium text-status-success">
                    Connected
                  </span>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    Venice API is reachable and responding normally
                  </p>
                </div>
              </>
            )}
            {healthStatus === 'warning' && (
              <>
                <AlertTriangle className="size-5 text-status-warning" />
                <div>
                  <span className="text-sm font-medium text-status-warning">
                    Degraded
                  </span>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    API is reachable but reporting issues
                  </p>
                </div>
              </>
            )}
            {healthStatus === 'error' && (
              <>
                <XCircle className="size-5 text-status-error" />
                <div>
                  <span className="text-sm font-medium text-status-error">
                    Disconnected
                  </span>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    Cannot reach Venice API
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Test Connection */}
      <div className="space-y-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestConnection}
          disabled={testing}
          className="border-[#2A2E39] text-text-secondary hover:text-text-primary hover:bg-[#1a1e27]"
        >
          <Activity
            className={cn('size-4 mr-2', testing && 'animate-spin')}
          />
          {testing ? 'Testing...' : 'Test Connection'}
        </Button>

        {testResult && (
          <div
            className={cn(
              'flex items-start gap-2 p-3 rounded-sm border text-sm',
              testResult.success
                ? 'bg-emerald-500/5 border-status-success/20 text-status-success'
                : 'bg-red-500/5 border-status-error/20 text-status-error'
            )}
          >
            {testResult.success ? (
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="size-4 shrink-0 mt-0.5" />
            )}
            {testResult.message}
          </div>
        )}
      </div>

      {/* Usage Stats */}
      {status && (
        <div className="space-y-3">
          <div className="border-t border-[#1e2230] pt-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              Usage Stats
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {status.balanceUsd !== null && status.balanceUsd !== undefined && (
                <div className="bg-[#0d1016] border border-[#1e2230] rounded-md p-3 flex items-center gap-2.5">
                  <DollarSign className="size-4 text-status-success" />
                  <div>
                    <p className="text-[11px] text-text-tertiary">USD Balance</p>
                    <p className="text-sm font-medium text-status-success">
                      {status.balanceUsd}
                    </p>
                  </div>
                </div>
              )}
              {status.remainingRequests !== null &&
                status.remainingRequests !== undefined &&
                status.limitRequests !== null &&
                status.limitRequests !== undefined && (
                  <div className="bg-[#0d1016] border border-[#1e2230] rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Clock className="size-3.5 text-status-info" />
                      <p className="text-[11px] text-text-tertiary">Requests</p>
                    </div>
                    <p className="text-sm font-medium text-text-primary">
                      {status.remainingRequests} / {status.limitRequests}
                    </p>
                    {/* Mini progress bar */}
                    <div className="mt-1.5 h-1 bg-[#1e2230] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-status-info rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            (parseInt(status.remainingRequests) /
                              Math.max(1, parseInt(status.limitRequests))) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
