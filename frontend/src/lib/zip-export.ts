import type { BatchItem } from '@/types';

function generateCardFolderName(index: number, filename: string): string {
  const base = filename.replace(/\.[A-Za-z0-9]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${String(index + 1).padStart(3, '0')}_${base}`;
}

export interface ExportOptions {
  includeOriginal: boolean;
  includeCleaned: boolean;
  includeAnalysis: boolean;
  includeProcessingLog: boolean;
  namingPattern: 'original' | 'sequential' | 'custom';
  customPrefix?: string;
  customSuffix?: string;
  zipFilename?: string;
}

export const defaultExportOptions: ExportOptions = {
  includeOriginal: true,
  includeCleaned: true,
  includeAnalysis: true,
  includeProcessingLog: false,
  namingPattern: 'original',
  customPrefix: '',
  customSuffix: '_clean',
  zipFilename: '',
};

export function generateZipFilename(): string {
  const date = new Date().toISOString().split('T')[0];
  return `sports_cards_export_${date}.zip`;
}

export async function exportToZip(
  items: BatchItem[],
  options: ExportOptions = defaultExportOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const root = zip.folder('card-suite-export')!;

  const completedItems = items.filter((item) => item.state === 'complete');
  const totalItems = completedItems.length;

  if (totalItems === 0) {
    throw new Error('No completed items to export');
  }

  for (let i = 0; i < totalItems; i++) {
    const item = completedItems[i];
    const folderName = generateCardFolderName(i, item.filename);
    const ext = item.filename.match(/\.[A-Za-z0-9]+$/)?.[0] || '.jpg';

    // Determine filenames based on naming pattern
    let originalName: string;
    let cleanedName: string;

    if (options.namingPattern === 'sequential') {
      const seq = String(i + 1).padStart(3, '0');
      originalName = `original_${seq}${ext}`;
      cleanedName = `cleaned_${seq}.png`;
    } else if (options.namingPattern === 'custom') {
      const prefix = options.customPrefix || '';
      const suffix = options.customSuffix || '';
      const base = item.filename.replace(/\.[A-Za-z0-9]+$/, '');
      originalName = `original-${prefix}${base}${ext}`;
      cleanedName = `cleaned-${prefix}${base}${suffix}.png`;
    } else {
      // original names
      originalName = `original-${item.filename}`;
      cleanedName = `cleaned-${item.filename.replace(/\.[A-Za-z0-9]+$/, '')}.png`;
    }

    // Original file
    if (options.includeOriginal) {
      root.file(`${folderName}/${originalName}`, item.file);
    }

    // Cleaned image (if available) — fetch blob from URL
    if (options.includeCleaned && item.cleanedUrl) {
      try {
        const blob = await fetch(item.cleanedUrl).then((r) => r.blob());
        root.file(`${folderName}/${cleanedName}`, blob);
      } catch {
        // skip if can't fetch
      }
    }

    // Analysis JSON (without large data URLs)
    if (options.includeAnalysis && item.analysis) {
      const cleanAnalysis = { ...item.analysis };
      root.file(`${folderName}/analysis.json`, JSON.stringify(cleanAnalysis, null, 2));
    }

    onProgress?.(i + 1, totalItems);
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function estimateExportSize(
  items: BatchItem[],
  options: ExportOptions = defaultExportOptions,
): number {
  const completedItems = items.filter((item) => item.state === 'complete');
  let total = 0;

  for (const item of completedItems) {
    if (options.includeOriginal) {
      total += item.file.size;
    }
    // Estimate cleaned size at ~70% of original
    if (options.includeCleaned && item.cleanedUrl) {
      total += item.file.size * 0.7;
    }
    // Analysis JSON estimate
    if (options.includeAnalysis) {
      total += 2048; // ~2KB per analysis file
    }
  }

  // ZIP compression estimate (~85% of raw)
  return Math.round(total * 0.85);
}
