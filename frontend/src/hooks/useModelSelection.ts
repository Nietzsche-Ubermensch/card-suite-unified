import { useState, useEffect, useCallback, useMemo } from 'react';
import { useVeniceModels } from './useVeniceModels';
import type { ModelSelection } from '@/types';

const STORAGE_KEY = 'card-suite-models';

function loadSavedSelection(): ModelSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.chat === 'string' &&
        typeof parsed.analysis === 'string' &&
        typeof parsed.restore === 'string' &&
        typeof parsed.image === 'string'
      ) {
        return parsed as ModelSelection;
      }
    }
  } catch {
    // ignore
  }
  return { chat: '', analysis: '', restore: '', image: '' };
}

export function useModelSelection() {
  const { models, categorized } = useVeniceModels();
  const [selected, setSelected] = useState<ModelSelection>(loadSavedSelection);

  // Repair stale selections when models change. The repaired value is
  // derived during render (pure) rather than written back via setState in
  // an effect; only the localStorage sync is a side effect.
  const repaired = useMemo<ModelSelection>(() => {
    if (!models.length || !categorized) return selected;

    const validIds = new Set(models.map((m) => m.id));
    const next: ModelSelection = { ...selected };
    let changed = false;

    const repair = (key: keyof ModelSelection, categoryModels: typeof models) => {
      if (selected[key] && !validIds.has(selected[key])) {
        next[key] = categoryModels[0]?.id ?? '';
        changed = true;
      }
    };

    repair('chat', categorized.chat);
    repair('analysis', categorized.analysis);
    repair('restore', categorized.restore);
    repair('image', categorized.image);

    // Same reference when nothing changed so consumers can bail out.
    return changed ? next : selected;
  }, [selected, models, categorized]);

  useEffect(() => {
    if (repaired !== selected) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(repaired));
    }
  }, [repaired, selected]);

  const updateSelection = useCallback((key: keyof ModelSelection, modelId: string) => {
    setSelected((current) => {
      const next = { ...current, [key]: modelId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isModelAvailable = (key: keyof ModelSelection): boolean => {
    if (!categorized) return false;
    switch (key) {
      case 'chat': return categorized.chat.length > 0;
      case 'analysis': return categorized.analysis.length > 0;
      case 'restore': return categorized.restore.length > 0;
      case 'image': return categorized.image.length > 0;
      default: return false;
    }
  };

  return {
    selected: repaired,
    updateSelection,
    isModelAvailable,
  };
}
