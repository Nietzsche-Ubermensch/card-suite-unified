import { useState, useCallback, useRef, useEffect } from 'react';
import { API_ENDPOINTS } from '@/lib/api-client';
import { useVeniceStatus } from '@/hooks/useVeniceStatus';
import { toast } from 'sonner';
import type { BatchItem, BatchItemState, ScanAnalysisResult } from '@/types';

const MAX_CARDS = 50;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_REQUEST_RESERVE = 5;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface UseBatchQueueOptions {
  maxConcurrency?: number;
  requestReserve?: number;
  onRateLimitPause?: () => void;
}

interface UseBatchQueueReturn {
  items: BatchItem[];
  isRunning: boolean;
  isPaused: boolean;
  globalProgress: number;
  addFiles: (files: File[]) => void;
  startBatch: () => void;
  pauseBatch: () => void;
  resumeBatch: () => void;
  retryItem: (id: string) => void;
  cancelItem: (id: string) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
}

function detectSide(filename: string): 'front' | 'back' {
  const lower = filename.toLowerCase();
  if (lower.includes('back') || lower.includes('b.')) return 'back';
  if (lower.includes('front') || lower.includes('f.')) return 'front';
  return 'front';
}

function getMaterialFromAnalysis(analysis: ScanAnalysisResult | null): BatchItem['material'] {
  if (analysis?.material) return analysis.material;
  return 'unknown';
}

function getOrientationFromAnalysis(analysis: ScanAnalysisResult | null): BatchItem['orientation'] {
  if (analysis?.orientation) return analysis.orientation;
  return 'unknown';
}

async function detectOrientation(file: File): Promise<'horizontal' | 'vertical' | 'unknown'> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width > img.height) resolve('horizontal');
      else if (img.height > img.width) resolve('vertical');
      else resolve('unknown');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('unknown');
    };
    img.src = url;
  });
}

export function useBatchQueue(options: UseBatchQueueOptions = {}): UseBatchQueueReturn {
  const {
    maxConcurrency = DEFAULT_CONCURRENCY,
    requestReserve = DEFAULT_REQUEST_RESERVE,
    onRateLimitPause,
  } = options;

  const [items, setItems] = useState<BatchItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const runnerRef = useRef<Promise<void> | null>(null);
  const pauseRequested = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const { data: veniceStatus } = useVeniceStatus();

  const remainingRequests = veniceStatus?.remainingRequests
    ? parseInt(veniceStatus.remainingRequests, 10)
    : Infinity;

  const globalProgress = items.length > 0
    ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length)
    : 0;

  const revokePreviewUrl = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    if (item?.cleanedUrl) {
      URL.revokeObjectURL(item.cleanedUrl);
    }
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const currentCount = itemsRef.current.length;
    const availableSlots = MAX_CARDS - currentCount;

    if (availableSlots <= 0) {
      toast.error(`Maximum ${MAX_CARDS} cards allowed`);
      return;
    }

    const toAdd = files.slice(0, availableSlots);
    const skipped = files.length - toAdd.length;

    if (skipped > 0) {
      toast.warning(`${skipped} files skipped (max ${MAX_CARDS} cards)`);
    }

    const newItems: BatchItem[] = toAdd.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      filename: file.name,
      side: detectSide(file.name),
      material: 'unknown',
      orientation: 'unknown',
      state: 'queued' as BatchItemState,
      progress: 0,
      error: null,
      analysis: null,
      cleanedUrl: null,
      strength: 0.5,
    }));

    // Detect orientation asynchronously for each file
    void Promise.all(
      newItems.map(async (item) => {
        const orientation = await detectOrientation(item.file);
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, orientation } : i)),
        );
      }),
    );

    setItems((prev) => [...prev, ...newItems]);

    const frontCount = newItems.filter((i) => i.side === 'front').length;
    const backCount = newItems.filter((i) => i.side === 'back').length;
    const pairs = Math.min(frontCount, backCount);
    const singles = newItems.length - pairs * 2;

    toast.success(
      `Added ${newItems.length} cards — ${pairs} pairs${singles > 0 ? ` + ${singles} single${singles > 1 ? 's' : ''}` : ''}`,
    );
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<BatchItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  const processItem = useCallback(
    async (item: BatchItem): Promise<void> => {
      const controller = new AbortController();
      abortControllers.current.set(item.id, controller);

      try {
        // Check rate limit
        if (remainingRequests <= requestReserve) {
          updateItem(item.id, {
            state: 'paused',
            error: 'Rate limit reached — paused to preserve requests',
          });
          onRateLimitPause?.();
          return;
        }

        // Check if paused
        if (pauseRequested.current) {
          updateItem(item.id, { state: 'paused' });
          return;
        }

        // Step 1: Analyze
        updateItem(item.id, { state: 'analyzing', progress: 10 });

        const imageBase64 = await fileToBase64(item.file);

        const analyzeResponse = await fetch(API_ENDPOINTS.analyze, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ image: imageBase64, filename: item.filename }),
          signal: controller.signal,
        });

        if (!analyzeResponse.ok) {
          throw new Error(`Analysis failed: HTTP ${analyzeResponse.status}`);
        }

        const analysis = (await analyzeResponse.json()) as ScanAnalysisResult;
        updateItem(item.id, {
          analysis,
          material: getMaterialFromAnalysis(analysis),
          orientation: getOrientationFromAnalysis(analysis),
          progress: 40,
        });

        // Check if paused after analysis
        if (pauseRequested.current) {
          updateItem(item.id, { state: 'paused' });
          return;
        }

        // Check rate limit again
        if (remainingRequests <= requestReserve) {
          updateItem(item.id, {
            state: 'paused',
            error: 'Rate limit reached — paused to preserve requests',
          });
          onRateLimitPause?.();
          return;
        }

        // Step 2: Cleanup
        updateItem(item.id, { state: 'cleaning', progress: 50 });

        const cleanupResponse = await fetch(API_ENDPOINTS.scanCleanup, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            image: imageBase64,
            strength: item.strength,
            filename: item.filename,
          }),
          signal: controller.signal,
        });

        if (!cleanupResponse.ok) {
          throw new Error(`Cleanup failed: HTTP ${cleanupResponse.status}`);
        }

        const cleanupResult = await cleanupResponse.json();

        if (cleanupResult.error) {
          throw new Error(cleanupResult.error);
        }

        const cleanedUrl = cleanupResult.cleanedImage
          ? cleanupResult.cleanedImage.startsWith('data:')
            ? cleanupResult.cleanedImage
            : `data:image/png;base64,${cleanupResult.cleanedImage}`
          : null;

        updateItem(item.id, {
          state: 'complete',
          progress: 100,
          cleanedUrl,
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Unknown error during processing';

        if (controller.signal.aborted) {
          updateItem(item.id, {
            state: 'cancelled',
            progress: 0,
            error: 'Cancelled',
          });
        } else {
          updateItem(item.id, {
            state: 'failed',
            error: errorMessage,
          });
        }
      } finally {
        abortControllers.current.delete(item.id);
      }
    },
    [remainingRequests, requestReserve, onRateLimitPause, updateItem],
  );

  const runBatch = useCallback(async () => {
    while (true) {
      if (pauseRequested.current) {
        setIsRunning(false);
        return;
      }

      const currentItems = itemsRef.current;
      const queuedItems = currentItems.filter(
        (item) => item.state === 'queued' || item.state === 'paused',
      );

      if (queuedItems.length === 0) {
        // Check if any items are still processing
        const activeItems = currentItems.filter(
          (item) => item.state === 'analyzing' || item.state === 'cleaning',
        );
        if (activeItems.length === 0) {
          setIsRunning(false);
          const failedCount = currentItems.filter((i) => i.state === 'failed').length;
          const completedCount = currentItems.filter((i) => i.state === 'complete').length;
          if (completedCount > 0 || failedCount > 0) {
            toast.success(`Batch complete — ${completedCount}/${currentItems.length} cleaned successfully`);
            if (failedCount > 0) {
              toast.warning(`${failedCount} cards failed — click Retry Failed`);
            }
          }
        }
        return;
      }

      // Process up to maxConcurrency items in parallel
      const batch = queuedItems.slice(0, maxConcurrency);
      await Promise.all(batch.map((item) => processItem(item)));
    }
  }, [maxConcurrency, processItem]);

  const startBatch = useCallback(() => {
    if (items.length === 0) return;
    pauseRequested.current = false;
    setIsPaused(false);
    setIsRunning(true);

    // Reset failed items to queued
    setItems((prev) =>
      prev.map((item) =>
        item.state === 'failed' || item.state === 'cancelled'
          ? { ...item, state: 'queued', error: null, progress: 0 }
          : item,
      ),
    );

    runnerRef.current = runBatch();
  }, [items.length, runBatch]);

  const pauseBatch = useCallback(() => {
    pauseRequested.current = true;
    setIsPaused(true);
    toast.info('Pausing batch — current items will finish');
  }, []);

  const resumeBatch = useCallback(() => {
    pauseRequested.current = false;
    setIsPaused(false);
    setIsRunning(true);
    runnerRef.current = runBatch();
  }, [runBatch]);

  const retryItem = useCallback(
    (id: string) => {
      updateItem(id, { state: 'queued', error: null, progress: 0 });
      if (isRunning && !isPaused) {
        // Already running, the runner will pick it up
        return;
      }
      // Process just this item
      void processItem(itemsRef.current.find((i) => i.id === id)!);
    },
    [updateItem, isRunning, isPaused, processItem],
  );

  const cancelItem = useCallback(
    (id: string) => {
      const controller = abortControllers.current.get(id);
      if (controller) {
        controller.abort();
        abortControllers.current.delete(id);
      }
      updateItem(id, { state: 'cancelled', progress: 0 });
    },
    [updateItem],
  );

  const removeItem = useCallback(
    (id: string) => {
      revokePreviewUrl(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    },
    [revokePreviewUrl],
  );

  const clearAll = useCallback(() => {
    itemsRef.current.forEach((item) => {
      revokePreviewUrl(item.id);
    });
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current.clear();
    setItems([]);
    setIsRunning(false);
    setIsPaused(false);
    pauseRequested.current = false;
  }, [revokePreviewUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        if (item.cleanedUrl) URL.revokeObjectURL(item.cleanedUrl);
      });
      abortControllers.current.forEach((controller) => controller.abort());
      abortControllers.current.clear();
    };
  }, []);

  return {
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
  };
}
