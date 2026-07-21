export type MaterialType = 'cardboard' | 'chrome' | 'refractor' | 'unknown';
export type Orientation = 'horizontal' | 'vertical' | 'unknown';
export type BatchItemState = 'queued' | 'analyzing' | 'cleaning' | 'complete' | 'paused' | 'cancelled' | 'failed';
export type WorkspaceView = 'scan-cleanup' | 'batch-cleanup' | 'compare' | 'export';
export type ModelCategory = 'chat' | 'analysis' | 'restore' | 'image';

export interface VeniceModel {
  id: string;
  name?: string;
  type?: string;
  description?: string;
  capabilities?: {
    supportsVision?: boolean;
    supports_vision?: boolean;
    vision?: boolean;
    supportsImageGeneration?: boolean;
    [key: string]: unknown;
  };
  model_spec?: {
    capabilities?: Record<string, unknown>;
    [key: string]: unknown;
  };
  privacy?: string;
  pricing?: { prompt?: number; completion?: number; image?: number };
  is_beta?: boolean;
  is_deprecated?: boolean;
  deprecation_warning?: string;
  deprecation_date?: string;
  supported_resolutions?: string[];
  supported_aspect_ratios?: string[];
  quality_tiers?: string[];
  uncensored?: boolean;
  [key: string]: unknown;
}

export interface VeniceStatus {
  ok: boolean;
  updatedAt: string | null;
  balanceUsd: string | null;
  balanceDiem: string | null;
  remainingRequests: string | null;
  limitRequests: string | null;
  remainingTokens: string | null;
  resetRequests: string | null;
  deprecationWarning: string | null;
  deprecationDate: string | null;
  modelId: string | null;
  modelName: string | null;
}

export interface ModelSelection {
  chat: string;
  analysis: string;
  restore: string;
  image: string;
}

export interface ScanAnalysisResult {
  artifactTypes?: string[];
  artifactLocations?: string[];
  colorCast?: string;
  lightingIssues?: string[];
  cardConditionIntact?: boolean;
  recommendedApproach?: string;
  confidence?: number;
  material?: MaterialType;
  orientation?: Orientation;
  [key: string]: unknown;
}

export interface BatchItem {
  id: string;
  file: File;
  previewUrl: string;
  filename: string;
  side: 'front' | 'back';
  material: MaterialType;
  orientation: Orientation;
  state: BatchItemState;
  progress: number;
  error: string | null;
  analysis: ScanAnalysisResult | null;
  cleanedUrl: string | null;
  strength: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Array<{ filename: string; dataUrl: string }>;
  timestamp: number;
}
