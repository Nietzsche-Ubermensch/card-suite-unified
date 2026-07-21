import { useCallback } from 'react';
import { useBatchQueue } from '@/hooks/useBatchQueue';
import BatchCleanupQueue from '@/components/cleanup/BatchCleanupQueue';
import { toast } from 'sonner';

export default function BatchCleanup() {
  const {
    items,
    isRunning,
    isPaused,
    globalProgress,
    addFiles,
    startBatch,
    pauseBatch,
    resumeBatch,
    retryItem,
    cancelItem,
    removeItem,
    clearAll,
  } = useBatchQueue({
    maxConcurrency: 3,
    requestReserve: 5,
    onRateLimitPause: () => {
      toast.warning('Rate limit approaching — batch paused to preserve requests');
    },
  });

  const handleAddFiles = useCallback(
    (files: File[]) => {
      addFiles(files);
    },
    [addFiles],
  );

  return (
    <div className="h-full flex flex-col">
      <BatchCleanupQueue
        items={items}
        isRunning={isRunning}
        isPaused={isPaused}
        globalProgress={globalProgress}
        onAddFiles={handleAddFiles}
        onStartBatch={startBatch}
        onPauseBatch={pauseBatch}
        onResumeBatch={resumeBatch}
        onRetryItem={retryItem}
        onCancelItem={cancelItem}
        onRemoveItem={removeItem}
        onClearAll={clearAll}
      />
    </div>
  );
}
