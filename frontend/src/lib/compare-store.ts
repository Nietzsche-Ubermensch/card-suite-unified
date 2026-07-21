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

export function downloadAllAsZip(items: CompareItem[]): void {
  items.forEach((item, i) => {
    const link = document.createElement('a');
    link.href = item.cleaned;
    link.download = item.filename.replace(/\.[^/.]+$/, '_clean.png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Stagger downloads to avoid browser blocking
    if (i < items.length - 1) {
      setTimeout(() => {}, 200);
    }
  });
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
