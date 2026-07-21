import type { MaterialType, Orientation } from '@/types';

export interface CompareItem {
  id: string;
  original: string;
  cleaned: string;
  filename: string;
  timestamp: number;
  strength: number;
  material: MaterialType;
  orientation: Orientation;
}

const STORAGE_KEY = 'card-suite-compare-list';

function loadItems(): CompareItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as CompareItem[];
    }
  } catch {
    // ignore
  }
  return [];
}

function saveItems(items: CompareItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

let cache: CompareItem[] | null = null;

export function getCompareList(): CompareItem[] {
  if (cache === null) {
    cache = loadItems();
  }
  return cache;
}

export function addCompareItem(item: Omit<CompareItem, 'id' | 'timestamp'>): CompareItem {
  const newItem: CompareItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
  };
  const items = getCompareList();
  items.unshift(newItem); // Add to front
  cache = items;
  saveItems(items);
  return newItem;
}

export function removeCompareItem(id: string): void {
  const items = getCompareList().filter((i) => i.id !== id);
  cache = items;
  saveItems(items);
}

export function clearCompareList(): void {
  cache = [];
  saveItems([]);
}

export async function downloadAllAsZip(items: CompareItem[]): Promise<void> {
  if (items.length === 0) return;

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  for (const item of items) {
    const baseName = item.filename.replace(/\.[^/.]+$/, '');
    // Try to fetch the cleaned image and add to zip
    try {
      const response = await fetch(item.cleaned);
      const blob = await response.blob();
      zip.file(`${baseName}_clean.png`, blob);
    } catch {
      // If fetch fails (data URL), add the original directly
      if (item.cleaned.startsWith('data:')) {
        const base64 = item.cleaned.split(',')[1];
        zip.file(`${baseName}_clean.png`, base64, { base64: true });
      }
    }
    // Also add original
    try {
      const response = await fetch(item.original);
      const blob = await response.blob();
      zip.file(item.filename, blob);
    } catch {
      if (item.original.startsWith('data:')) {
        const base64 = item.original.split(',')[1];
        zip.file(item.filename, base64, { base64: true });
      }
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compare_results_${new Date().toISOString().split('T')[0]}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Subscribe pattern for cross-component updates
type Listener = () => void;
const listeners: Set<Listener> = new Set();

export function subscribeToCompareList(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyCompareListChanged() {
  listeners.forEach((fn) => fn());
}
