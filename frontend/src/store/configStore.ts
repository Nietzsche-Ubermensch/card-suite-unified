import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PipelineConfig {
  denoiseStrength: number;
  glareThreshold: number;
  upscaleFactor: number;
  contrast: number;
  saturation: number;
}

interface UiState {
  sidebarCollapsed: boolean;
  darkMode: boolean;
  activePage: string;
  setSidebarCollapsed: (v: boolean) => void;
  setDarkMode: (v: boolean) => void;
  setActivePage: (v: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      darkMode: true,
      activePage: 'scan-cleanup',
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setDarkMode: (v) => set({ darkMode: v }),
      setActivePage: (v) => set({ activePage: v }),
    }),
    { name: 'card-suite-ui' },
  ),
);

interface ConfigState {
  config: PipelineConfig;
  setConfig: (patch: Partial<PipelineConfig>) => void;
  resetConfig: () => void;
}

const DEFAULT_CONFIG: PipelineConfig = {
  denoiseStrength: 0.5,
  glareThreshold: 0.7,
  upscaleFactor: 2,
  contrast: 1.0,
  saturation: 1.0,
};

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      setConfig: (patch) =>
        set((state) => ({ config: { ...state.config, ...patch } })),
      resetConfig: () => set({ config: DEFAULT_CONFIG }),
    }),
    { name: 'card-suite-config' },
  ),
);
