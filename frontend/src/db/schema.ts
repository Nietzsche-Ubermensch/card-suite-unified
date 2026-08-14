import Dexie, { type Table } from 'dexie';
import type { BatchItemState, MaterialType, Orientation, ScanAnalysisResult } from '@/types';

// Serialisable version of BatchItem (no File/Blob objects)
export interface PersistedJob {
  id: string;
  filename: string;
  side: 'front' | 'back';
  material: MaterialType;
  orientation: Orientation;
  state: BatchItemState;
  progress: number;
  error: string | null;
  analysis: ScanAnalysisResult | null;
  cleanedDataUrl: string | null; // base64 data URL
  previewDataUrl: string | null; // base64 data URL
  strength: number;
  priority: 'low' | 'normal' | 'high';
  createdAt: number;
  completedAt: number | null;
}

export interface PipelinePreset {
  id: string;
  name: string;
  denoiseStrength: number;
  glareThreshold: number;
  upscaleFactor: number;
  contrast: number;
  saturation: number;
  createdAt: number;
}

export class CardSuiteDb extends Dexie {
  jobs!: Table<PersistedJob>;
  presets!: Table<PipelinePreset>;

  constructor() {
    super('CardSuiteDb');
    this.version(1).stores({
      jobs: 'id, state, createdAt, priority',
      presets: 'id, name, createdAt',
    });
  }
}

export const db = new CardSuiteDb();
