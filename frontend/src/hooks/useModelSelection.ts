import { useState, useEffect, useCallback } from 'react';
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

  // Repair stale selections when models change
  useEffect(() => {
    if (!models.length || !categorized) return;

    const validIds = new Set(models.map((m) => m.id));

    setSelected((current) => {
      const next: ModelSelection = { ...current };
      let changed = false;

      const repair = (key: keyof ModelSelection, categoryModels: typeof models) => {
        if (current[key] && !validIds.has(current[key])) {
          const replacement = categoryModels[0]?.id ?? '';
          next[key] = replacement;
          changed = true;
        }
      };

      repair('chat', categorized.chat);
      repair('analysis', categorized.analysis);
      repair('restore', categorized.restore);
      repair('image', categorized.image);

      if (changed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }

      return next;
    });
  }, [models, categorized]);

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
    selected,
    updateSelection,
    isModelAvailable,
  };
}
