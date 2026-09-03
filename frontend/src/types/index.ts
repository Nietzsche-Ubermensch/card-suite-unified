export type MaterialType = 'cardboard' | 'chrome' | 'refractor' | 'unknown';
export type Orientation = 'horizontal' | 'vertical' | 'unknown';
export type BatchItemState = 'queued' | 'analyzing' | 'cleaning' | 'complete' | 'paused' | 'cancelled' | 'failed';
export type JobPriority = 'low' | 'normal' | 'high';
export type WorkspaceView = 'scan-cleanup' | 'batch-cleanup' | 'price-check' | 'compare' | 'export';
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
  priority: JobPriority;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Array<{ filename: string; dataUrl: string }>;
  timestamp: number;
}

// ─── Card identification & comps (see lib/cards on the server) ───

export type CardSport = 'baseball' | 'basketball' | 'football' | 'hockey' | 'soccer' | 'wrestling' | 'racing' | 'other';

/** The editable form state on the Price Check page. */
export interface CardDraft {
  playerName: string;
  team: string;
  sport: CardSport;
  manufacturer: string;
  productSet: string;
  copyrightYear: string;
  /** Kept out of the copyright-year box: it is what the year was INFERRED from. */
  statsYear: string;
  cardNumber: string;
  serialNumber: string;
  parallelType: string;
  insertSet: string;
  isRookie: boolean;
  isAutograph: boolean;
  isMemorabilia: boolean;
  gradingCompany: string;
  grade: string;
}

/** A normalized card as the server returns it. */
export interface CardIdentity {
  playerName: string | null;
  team: string | null;
  sport: CardSport | null;
  league: string | null;
  manufacturer: string | null;
  productSet: string | null;
  year: number | null;
  yearSource: 'copyright' | 'stats-inferred' | 'none';
  statsYear: number | null;
  setName: string | null;
  cardNumber: string | null;
  serial: string | null;
  printRun: number | null;
  isOneOfOne: boolean;
  parallel: string | null;
  insertSet: string | null;
  isRookie: boolean;
  isAutograph: boolean;
  isMemorabilia: boolean;
  isShortPrint: boolean;
  visualKeywords: string[];
  gradingCompany: string | null;
  grade: string | null;
  isGraded: boolean;
  certNumber: string | null;
  confidence: number | null;
  notes: string | null;
}

export interface CompSearch {
  tier: 'exact' | 'parallel' | 'base' | 'player' | 'broad';
  description: string;
  query: string;
  soldUrl: string;
  activeUrl: string;
}

export interface CardComps {
  marketplace: string;
  category: number;
  recommended: CompSearch['tier'];
  searches: CompSearch[];
  notes: string[];
}
