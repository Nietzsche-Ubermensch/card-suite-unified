import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Download,
  HardDrive,
  FolderTree,
  Folder,
  FileImage,
  FileJson,
  Check,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Inbox,
  Trash2,
  X,
  History,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  exportToZip,
  downloadBlob,
  formatBytes,
  estimateExportSize,
  generateZipFilename,
  defaultExportOptions,
} from '@/lib/zip-export';
import type { ExportOptions } from '@/lib/zip-export';
import type { BatchItem } from '@/types';
import { API_ENDPOINTS, apiGet, apiPost } from '@/lib/api-client';

// --- Export History (localStorage) ---

interface ExportHistoryItem {
  id: string;
  timestamp: number;
  filename: string;
  size: number;
  fileCount: number;
}

function loadHistory(): ExportHistoryItem[] {
  try {
    const raw = localStorage.getItem('card-suite-export-history');
    return raw ? (JSON.parse(raw) as ExportHistoryItem[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: ExportHistoryItem[]) {
  localStorage.setItem('card-suite-export-history', JSON.stringify(history.slice(0, 50)));
}

// --- Checkbox component (simple) ---

function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 cursor-pointer select-none',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="size-4 rounded border-border-medium bg-app-input text-status-info focus:ring-status-info focus:ring-offset-0"
      />
      <span className="text-sm text-text-secondary">{label}</span>
    </label>
  );
}

// --- Radio component (unused — removed) ---

function Radio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="size-4 border-border-medium text-status-info focus:ring-status-info focus:ring-offset-0"
      />
      <span className="text-sm text-text-secondary">{label}</span>
    </label>
  );
}

// --- Folder Tree Component ---

interface TreeNodeProps {
  name: string;
  type: 'folder' | 'image' | 'json';
  children?: React.ReactNode;
  size?: string;
  defaultOpen?: boolean;
  level?: number;
}

function TreeNode({ name, type, children, size, defaultOpen = true, level = 0 }: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = !!children;

  return (
    <div>
      <button
        onClick={() => hasChildren && setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 py-1 px-1.5 rounded-sm w-full text-left transition-colors hover:bg-app-panel-hover',
          level > 0 && 'ml-5',
        )}
      >
        {hasChildren && (
          <span className="text-text-tertiary shrink-0">
            {open ? (
              <ChevronDown className="size-3" strokeWidth={1.5} />
            ) : (
              <ChevronRight className="size-3" strokeWidth={1.5} />
            )}
          </span>
        )}
        {!hasChildren && <span className="size-3 shrink-0" />}

        {type === 'folder' && (
          <Folder className="size-4 text-status-info shrink-0" strokeWidth={1.5} />
        )}
        {type === 'image' && (
          <FileImage className="size-3.5 text-text-tertiary shrink-0" strokeWidth={1.5} />
        )}
        {type === 'json' && (
          <FileJson className="size-3.5 text-text-tertiary shrink-0" strokeWidth={1.5} />
        )}

        <span
          className={cn(
            'text-sm truncate',
            type === 'folder' ? 'font-semibold text-text-primary' : 'text-text-tertiary font-mono',
          )}
        >
          {name}
        </span>
        {size && <span className="text-xs text-text-tertiary ml-auto shrink-0">{size}</span>}
      </button>
      {hasChildren && open && <div>{children}</div>}
    </div>
  );
}

// --- Real batch items from API + localStorage ---

function useBatchItems(): { items: BatchItem[]; isLoading: boolean; csvGenerated: boolean; generateCsv: () => Promise<void> } {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [csvGenerated, setCsvGenerated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // First check localStorage for batch cleanup items
      try {
        const raw = localStorage.getItem('card-suite-batch-items');
        if (raw) {
          const parsed = JSON.parse(raw) as Array<Partial<BatchItem>>;
          const completed = parsed.filter((i) => i.state === 'complete') as BatchItem[];
          if (completed.length > 0 && !cancelled) {
            setItems(completed);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // ignore
      }

      // Then fetch real cards from the API
      try {
        const data = await apiGet<{ cards: Array<{ id: number; name: string; set: string; grade: string; price: number; enhancedTitle?: string; enhancedDescription?: string; images?: string[]; sourceImage?: string }> }>(API_ENDPOINTS.cards);
        if (!cancelled && data.cards) {
          const cardItems: BatchItem[] = data.cards.map((card) => ({
            id: String(card.id),
            file: new File([], card.sourceImage || `${card.name}.jpg`),
            previewUrl: card.images?.[0] || null,
            cleanedUrl: card.images?.[0] || null,
            filename: card.sourceImage || `${card.name || 'card'}_${card.id}.jpg`,
            side: 'front' as const,
            material: 'unknown' as const,
            orientation: 'unknown' as const,
            state: 'complete' as const,
            progress: 100,
            error: null,
            analysis: null,
            strength: 0.5,
          }));
          setItems(cardItems);
        }
      } catch (err) {
        console.error('Failed to fetch cards:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const generateCsv = useCallback(async () => {
    try {
      const result = await apiPost<{ written: number; skipped: number; csv: string }>(API_ENDPOINTS.generateCsv, {});
      if (result.written > 0) {
        setCsvGenerated(true);
        toast.success(`CSV generated — ${result.written} cards written`);
        // Trigger download
        const blob = new Blob([result.csv], { type: 'text/csv' });
        downloadBlob(blob, 'eBay_bulk_upload.csv');
      } else {
        toast.warning(`CSV generated but 0 cards written (${result.skipped} skipped)`);
      }
    } catch (err) {
      toast.error(`CSV generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  return { items, isLoading, csvGenerated, generateCsv };
}

// --- Main Export Page ---

export default function ExportPage() {
  const { items, isLoading, csvGenerated, generateCsv } = useBatchItems();

  const [options, setOptions] = useState<ExportOptions>({
    ...defaultExportOptions,
    zipFilename: generateZipFilename(),
  });

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportTotal, setExportTotal] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const [history, setHistory] = useState<ExportHistoryItem[]>(loadHistory);
  const cancelRef = useRef(false);

  const completedItems = useMemo(() => items.filter((i) => i.state === 'complete'), [items]);
  const estimatedSize = useMemo(
    () => estimateExportSize(items, options),
    [items, options],
  );

  const handleExport = useCallback(async () => {
    if (completedItems.length === 0) {
      toast.error('No completed cards to export');
      return;
    }

    cancelRef.current = false;
    setIsExporting(true);
    setExportComplete(false);
    setExportBlob(null);
    setExportProgress(0);
    setExportTotal(completedItems.length);

    try {
      const blob = await exportToZip(
        items,
        options,
        (current, total) => {
          if (!cancelRef.current) {
            setExportProgress(current);
            setExportTotal(total);
          }
        },
      );

      if (cancelRef.current) {
        setIsExporting(false);
        toast.info('Export cancelled');
        return;
      }

      setExportBlob(blob);
      setExportComplete(true);

      const zipName = options.zipFilename || generateZipFilename();
      downloadBlob(blob, zipName);

      // Add to history
      const historyItem: ExportHistoryItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        filename: zipName,
        size: blob.size,
        fileCount: completedItems.length,
      };
      const newHistory = [historyItem, ...history];
      setHistory(newHistory);
      saveHistory(newHistory);

      toast.success(`Exported ${completedItems.length} cards — ${formatBytes(blob.size)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  }, [completedItems, items, options]);

  const handleCancelExport = useCallback(() => {
    cancelRef.current = true;
    setIsExporting(false);
    toast.info('Cancelling export...');
  }, []);

  const handleDownloadAgain = useCallback(() => {
    if (exportBlob) {
      const zipName = options.zipFilename || generateZipFilename();
      downloadBlob(exportBlob, zipName);
    }
  }, [exportBlob, options.zipFilename]);

  const handleExportAgain = useCallback(() => {
    setExportComplete(false);
    setExportBlob(null);
    setExportProgress(0);
  }, []);

  const handleDeleteHistoryItem = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h.id !== id);
      saveHistory(next);
      return next;
    });
  }, []);

  const updateOption = useCallback(
    <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Generate folder structure preview
  const folderPreview = useMemo(() => {
    if (completedItems.length === 0) return null;

    return completedItems.slice(0, 5).map((item, i) => {
      const folderName = `${String(i + 1).padStart(3, '0')}_${item.filename.replace(/\.[^.]+$/, '')}`;
      const ext = item.filename.match(/\.[^.]+$/)?.[0] || '.jpg';

      let originalName: string;
      let cleanedName: string;

      if (options.namingPattern === 'sequential') {
        const seq = String(i + 1).padStart(3, '0');
        originalName = `original_${seq}${ext}`;
        cleanedName = `cleaned_${seq}.png`;
      } else if (options.namingPattern === 'custom') {
        const prefix = options.customPrefix || '';
        const suffix = options.customSuffix || '';
        const base = item.filename.replace(/\.[^.]+$/, '');
        originalName = `original-${prefix}${base}${ext}`;
        cleanedName = `cleaned-${prefix}${base}${suffix}.png`;
      } else {
        originalName = `original-${item.filename}`;
        cleanedName = `cleaned-${item.filename.replace(/\.[^.]+$/, '')}.png`;
      }

      return (
        <TreeNode key={item.id} name={folderName} type="folder">
          {options.includeOriginal && (
            <TreeNode
              name={originalName}
              type="image"
              size={formatBytes(item.file.size)}
              level={1}
            />
          )}
          {options.includeCleaned && item.cleanedUrl && (
            <TreeNode
              name={cleanedName}
              type="image"
              size={formatBytes(Math.round(item.file.size * 0.7))}
              level={1}
            />
          )}
          {options.includeAnalysis && item.analysis && (
            <TreeNode name="analysis.json" type="json" size="2 KB" level={1} />
          )}
        </TreeNode>
      );
    });
  }, [completedItems, options]);

  const hasItems = completedItems.length > 0;

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* Page Title Row */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Export</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={isExporting || !hasItems}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-all',
              hasItems
                ? 'bg-status-info text-white hover:brightness-110'
                : 'opacity-50 cursor-not-allowed bg-app-panel-active text-text-disabled',
            )}
            aria-label="Export all completed cards"
          >
            <Download className="size-4" strokeWidth={1.5} />
            Export All
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && !isExporting && !exportComplete && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <Loader2 className="size-8 text-status-info animate-spin mb-4" strokeWidth={1.5} />
          <p className="text-sm text-text-secondary">Loading your cards...</p>
        </div>
      )}

      {/* No items state */}
      {!hasItems && !isLoading && !isExporting && !exportComplete && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="size-16 rounded-lg bg-app-panel border border-border-subtle flex items-center justify-center mb-4">
            <Inbox className="size-8 text-text-tertiary" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-text-secondary mb-1">No cards to export</p>
          <p className="text-xs text-text-tertiary mb-4">
            Add cards via the inventory import or process scans in Batch Cleanup first.
          </p>
          <button
            onClick={generateCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium bg-status-info text-white hover:brightness-110 transition-all"
          >
            <Download className="size-4" strokeWidth={1.5} />
            Generate CSV from Inventory
          </button>
        </div>
      )}

      {hasItems && (
        <>
          {/* Export Configuration */}
          <div className="bg-app-panel border border-border-subtle rounded-md p-5 mb-4">
            <h2 className="text-sm font-semibold text-text-primary mb-4">Export Configuration</h2>

            {/* Format */}
            <div className="mb-4">
              <p className="text-xs uppercase tracking-wider text-text-tertiary font-semibold mb-2">
                Export Format
              </p>
              <div className="flex flex-wrap gap-4">
                <Checkbox
                  checked={options.includeOriginal}
                  onChange={(v) => updateOption('includeOriginal', v)}
                  label="Original scans"
                />
                <Checkbox
                  checked={options.includeCleaned}
                  onChange={(v) => updateOption('includeCleaned', v)}
                  label="Cleaned scans"
                />
                <Checkbox
                  checked={options.includeAnalysis}
                  onChange={(v) => updateOption('includeAnalysis', v)}
                  label="Analysis data (JSON)"
                />
              </div>
            </div>

            {/* CSV Export */}
            <div className="mb-4 pt-4 border-t border-border-subtle">
              <p className="text-xs uppercase tracking-wider text-text-tertiary font-semibold mb-2">
                eBay Bulk Upload CSV
              </p>
              <button
                onClick={generateCsv}
                disabled={csvGenerated}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-all',
                  csvGenerated
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-status-info text-white hover:brightness-110',
                )}
              >
                {csvGenerated ? (
                  <>
                    <Check className="size-4" strokeWidth={1.5} />
                    CSV Generated — Download Again
                  </>
                ) : (
                  <>
                    <Download className="size-4" strokeWidth={1.5} />
                    Generate eBay CSV
                  </>
                )}
              </button>
              <p className="text-xs text-text-tertiary mt-2">
                Generates a bulk upload CSV file with eBay-compatible headers for all {items.length} cards.
              </p>
            </div>

            {/* Include */}
            <div className="mb-4">
              <p className="text-xs uppercase tracking-wider text-text-tertiary font-semibold mb-2">
                Include
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Checkbox
                  checked={options.includeOriginal}
                  onChange={(v) => updateOption('includeOriginal', v)}
                  label="Original scans"
                />
                <Checkbox
                  checked={options.includeCleaned}
                  onChange={(v) => updateOption('includeCleaned', v)}
                  label="Cleaned scans"
                />
                <Checkbox
                  checked={options.includeAnalysis}
                  onChange={(v) => updateOption('includeAnalysis', v)}
                  label="Analysis data (JSON)"
                />
                <Checkbox
                  checked={options.includeProcessingLog}
                  onChange={(v) => updateOption('includeProcessingLog', v)}
                  label="Processing log"
                  disabled
                />
              </div>
            </div>

            {/* Naming */}
            <div className="mb-4">
              <p className="text-xs uppercase tracking-wider text-text-tertiary font-semibold mb-2">
                File Naming
              </p>
              <select
                value={options.namingPattern}
                onChange={(e) =>
                  updateOption(
                    'namingPattern',
                    e.target.value as ExportOptions['namingPattern'],
                  )
                }
                className="w-full sm:w-auto px-3 py-1.5 rounded-sm bg-app-input border border-border-medium text-sm text-text-primary focus:border-border-strong focus:outline-none"
              >
                <option value="original">Keep original names</option>
                <option value="sequential">Sequential numbering</option>
                <option value="custom">Custom pattern</option>
              </select>

              {options.namingPattern === 'custom' && (
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-text-secondary">Prefix:</label>
                    <input
                      type="text"
                      value={options.customPrefix}
                      onChange={(e) => updateOption('customPrefix', e.target.value)}
                      placeholder="e.g., card_"
                      className="px-2 py-1 rounded-sm bg-app-input border border-border-medium text-sm text-text-primary placeholder:text-text-disabled focus:border-border-strong focus:outline-none w-28"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-text-secondary">Suffix:</label>
                    <input
                      type="text"
                      value={options.customSuffix}
                      onChange={(e) => updateOption('customSuffix', e.target.value)}
                      placeholder="e.g., _clean"
                      className="px-2 py-1 rounded-sm bg-app-input border border-border-medium text-sm text-text-primary placeholder:text-text-disabled focus:border-border-strong focus:outline-none w-28"
                    />
                  </div>
                  <span className="text-xs text-text-tertiary font-mono">
                    {options.customPrefix}001{options.customSuffix}.png
                  </span>
                </div>
              )}
            </div>

            {/* ZIP filename */}
            <div className="mb-3">
              <p className="text-xs uppercase tracking-wider text-text-tertiary font-semibold mb-2">
                ZIP Filename
              </p>
              <input
                type="text"
                value={options.zipFilename}
                onChange={(e) => updateOption('zipFilename', e.target.value)}
                className="w-full px-3 py-1.5 rounded-sm bg-app-input border border-border-medium text-sm text-text-primary focus:border-border-strong focus:outline-none font-mono"
              />
            </div>

            {/* Estimated size */}
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <HardDrive className="size-4" strokeWidth={1.5} />
              <span>Estimated size: ~{formatBytes(estimatedSize)}</span>
              <span className="text-text-tertiary">
                ({completedItems.length} file{completedItems.length > 1 ? 's' : ''})
              </span>
            </div>
          </div>

          {/* Folder Structure Preview */}
          {folderPreview && (
            <div className="bg-app-panel border border-border-subtle rounded-md p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <FolderTree className="size-4 text-text-secondary" strokeWidth={1.5} />
                <h2 className="text-sm font-semibold text-text-primary">
                  Folder Structure Preview
                </h2>
              </div>
              <TreeNode
                name={options.zipFilename?.replace('.zip', '/') || 'card-suite-export/'}
                type="folder"
                defaultOpen
              >
                {folderPreview}
                {completedItems.length > 5 && (
                  <p className="text-xs text-text-tertiary ml-5 py-1">
                    ... and {completedItems.length - 5} more
                  </p>
                )}
              </TreeNode>
            </div>
          )}
        </>
      )}

      {/* Export Progress / Complete */}
      {(isExporting || exportComplete) && (
        <div className="bg-app-panel border border-border-subtle rounded-md p-4 mb-4">
          {isExporting && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                </span>
                <h2 className="text-sm font-semibold text-text-primary">Exporting...</h2>
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary font-mono">
                    {exportProgress} / {exportTotal} files
                  </span>
                  <span className="text-xs text-text-secondary">
                    {Math.round((exportProgress / Math.max(exportTotal, 1)) * 100)}%
                  </span>
                </div>
                <div className="h-1.5 bg-app-input rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300"
                    style={{
                      width: `${(exportProgress / Math.max(exportTotal, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleCancelExport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Cancel export"
              >
                <X className="size-3.5" strokeWidth={1.5} />
                Cancel Export
              </button>
            </>
          )}

          {exportComplete && exportBlob && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Check className="size-4 text-emerald-400" strokeWidth={2} />
                <h2 className="text-sm font-semibold text-emerald-400">Export Complete</h2>
              </div>

              <p className="text-sm text-text-secondary mb-3">
                {exportTotal} file{exportTotal > 1 ? 's' : ''} exported —{' '}
                {formatBytes(exportBlob.size)}
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadAgain}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-medium bg-status-info text-white hover:brightness-110 transition-all"
                  aria-label="Download ZIP again"
                >
                  <Download className="size-4" strokeWidth={1.5} />
                  Download ZIP
                </button>
                <button
                  onClick={handleExportAgain}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-sm font-medium border border-border-medium text-text-secondary hover:bg-app-panel-hover transition-all"
                  aria-label="Export again"
                >
                  <RotateCcw className="size-3.5" strokeWidth={1.5} />
                  Export Again
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Export History */}
      <div className="bg-app-panel border border-border-subtle rounded-md p-4">
        <div className="flex items-center gap-2 mb-3">
          <History className="size-4 text-text-secondary" strokeWidth={1.5} />
          <h2 className="text-sm font-semibold text-text-primary">Export History</h2>
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-text-tertiary">No exports yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-sm hover:bg-app-panel-hover transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs text-text-tertiary">
                    {new Date(item.timestamp).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="text-sm font-medium text-text-primary truncate">
                    {item.filename}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {formatBytes(item.size)} &middot; {item.fileCount} file
                    {item.fileCount > 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteHistoryItem(item.id)}
                  className="inline-flex items-center justify-center size-7 rounded-sm text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 ml-2"
                  aria-label="Delete from history"
                  title="Delete"
                >
                  <Trash2 className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
