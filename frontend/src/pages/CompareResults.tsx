import { useState, useEffect, useCallback } from 'react';
import {
  Columns3,
  Download,
  Trash2,
} from 'lucide-react';
import {
  getCompareList,
  removeCompareItem,
  clearCompareList,
  subscribeToCompareList,
  notifyCompareListChanged,
  downloadAllAsZip,
} from '@/lib/compare-store';
import type { CompareItem } from '@/lib/compare-store';
import BeforeAfterReview from '@/components/cleanup/BeforeAfterReview';

export default function CompareResults() {
  const [items, setItems] = useState<CompareItem[]>(getCompareList);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Subscribe to store changes
  useEffect(() => {
    return subscribeToCompareList(() => {
      setItems(getCompareList());
    });
  }, []);

  const handleRemove = useCallback(
    (id: string) => {
      removeCompareItem(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      notifyCompareListChanged();
    },
    [],
  );

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }, [items, selectedIds.size]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDownloadSelected = useCallback(() => {
    const selected = items.filter((i) => selectedIds.has(i.id));
    downloadAllAsZip(selected);
  }, [items, selectedIds]);

  const handleDownloadAll = useCallback(() => {
    downloadAllAsZip(items);
  }, [items]);

  const handleClearAll = useCallback(() => {
    clearCompareList();
    setSelectedIds(new Set());
    notifyCompareListChanged();
  }, []);

  const selectedCount = selectedIds.size;

  // Empty state
  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="size-16 mx-auto rounded-lg bg-[#12151c] border border-[#2A2E39] flex items-center justify-center">
            <Columns3 className="size-8 text-[#5e6a7e]" strokeWidth={1.5} />
          </div>
          <h2 className="text-lg font-semibold text-[#e8eaf0]">
            No comparison pairs yet
          </h2>
          <p className="text-sm text-[#94a3b8]">
            Clean some cards first to compare results here. Each time you clean a
            scan, you can save it to this comparison workspace.
          </p>
          <p className="text-xs text-[#5e6a7e]">
            Use the "Compare" button after cleaning to save results here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-[1440px] mx-auto space-y-6">
        {/* Page title row */}
        <div className="flex items-center justify-between pb-5 border-b border-[#1e2230]">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[#e8eaf0]">
              Compare Results
            </h1>
            {selectedCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(99,102,241,0.1)] text-[#818cf8] border border-[rgba(99,102,241,0.2)]">
                {selectedCount} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="inline-flex items-center px-3 py-2 rounded-sm text-sm text-[#94a3b8] hover:bg-[#1a1e27] hover:text-[#e8eaf0] transition-colors"
              aria-label={selectedCount === items.length ? 'Deselect all' : 'Select all'}
            >
              {selectedCount === items.length ? 'Deselect All' : 'Select All'}
            </button>
            {selectedCount > 0 && (
              <button
                onClick={handleDownloadSelected}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-sm text-sm font-medium text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
                aria-label="Download selected"
              >
                <Download className="size-4" strokeWidth={1.5} />
                Export {selectedCount}
              </button>
            )}
            <button
              onClick={handleDownloadAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-sm text-sm text-[#e8eaf0] border border-[#2A2E39] hover:bg-[#1a1e27] hover:border-[#3a4055] transition-colors"
              aria-label="Download all"
            >
              <Download className="size-4" strokeWidth={1.5} />
              All
            </button>
            <button
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-sm text-[#ef4444] hover:bg-[rgba(239,68,68,0.1)] transition-colors border border-[rgba(239,68,68,0.2)]"
              aria-label="Clear all comparisons"
            >
              <Trash2 className="size-4" strokeWidth={1.5} />
              Clear
            </button>
          </div>
        </div>

        {/* Comparison grid */}
        <div className="space-y-8">
          {items.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`bg-[#12151c] border rounded-lg p-4 transition-colors ${
                  isSelected ? 'border-[#6366f1]' : 'border-[#2A2E39]'
                }`}
              >
                {/* Card header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleSelect(item.id)}
                      className={`size-5 rounded-sm border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-[#6366f1] border-[#6366f1]'
                          : 'border-[#3a4055] hover:border-[#6366f1]'
                      }`}
                      aria-label={isSelected ? 'Deselect item' : 'Select item'}
                    >
                      {isSelected && (
                        <svg
                          className="size-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </button>
                    <div>
                      <p className="text-sm font-medium text-[#e8eaf0]">
                        {item.filename}
                      </p>
                      <p className="text-xs text-[#5e6a7e]">
                        {new Date(item.timestamp).toLocaleString()} · Strength{' '}
                        {Math.round(item.strength * 100)}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Material + orientation badges */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(99,102,241,0.1)] text-[#818cf8] border border-[rgba(99,102,241,0.2)]">
                      {item.material}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(99,102,241,0.1)] text-[#818cf8] border border-[rgba(99,102,241,0.2)]">
                      {item.orientation}
                    </span>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="ml-2 inline-flex items-center justify-center size-7 rounded-sm text-[#94a3b8] hover:bg-[rgba(239,68,68,0.1)] hover:text-[#ef4444] transition-colors"
                      aria-label="Remove comparison"
                      title="Remove"
                    >
                      <Trash2 className="size-4" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {/* BeforeAfterReview */}
                <BeforeAfterReview
                  original={item.original}
                  cleaned={item.cleaned}
                  onDownload={() => {
                    const link = document.createElement('a');
                    link.href = item.cleaned;
                    link.download = item.filename.replace(
                      /\.[^/.]+$/,
                      '_clean.png',
                    );
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  onReject={() => handleRemove(item.id)}
                  onRetry={() => {
                    // Retry just removes this item; the user goes back to Scan Cleanup
                    handleRemove(item.id);
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Bottom summary */}
        {items.length > 0 && (
          <div className="flex items-center justify-between py-4 border-t border-[#1e2230]">
            <p className="text-sm text-[#94a3b8]">
              {items.length} comparison pair{items.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={handleDownloadAll}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
              aria-label="Download all cleaned images"
            >
              <Download className="size-4" strokeWidth={1.5} />
              Download All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
