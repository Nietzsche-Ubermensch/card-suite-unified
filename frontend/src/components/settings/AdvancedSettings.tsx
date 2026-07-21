import { useState, useEffect } from 'react';
import {
  SlidersHorizontal,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useVeniceModels } from '@/hooks/useVeniceModels';

interface AdvancedSettingsState {
  cleanupStrength: number;
  batchConcurrency: number;
  requestReserve: number;
  outputFormat: string;
  imageQuality: number;
}

const DEFAULTS: AdvancedSettingsState = {
  cleanupStrength: 0.45,
  batchConcurrency: 3,
  requestReserve: 5,
  outputFormat: 'png',
  imageQuality: 85,
};

function loadSettings(): AdvancedSettingsState {
  try {
    const raw = localStorage.getItem('card-suite-advanced-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        cleanupStrength: clampNum(parsed.cleanupStrength, 0, 1, DEFAULTS.cleanupStrength),
        batchConcurrency: clampNum(parsed.batchConcurrency, 1, 5, DEFAULTS.batchConcurrency),
        requestReserve: clampNum(parsed.requestReserve, 0, 50, DEFAULTS.requestReserve),
        outputFormat: ['png', 'jpeg', 'webp'].includes(parsed.outputFormat)
          ? parsed.outputFormat
          : DEFAULTS.outputFormat,
        imageQuality: clampNum(parsed.imageQuality, 0, 100, DEFAULTS.imageQuality),
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULTS };
}

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : fallback;
  return Math.max(min, Math.min(max, n));
}

function saveSettings(s: AdvancedSettingsState) {
  try {
    localStorage.setItem('card-suite-advanced-settings', JSON.stringify(s));
  } catch {
    // ignore
  }
}

export default function AdvancedSettings() {
  const { refetch: refreshModels } = useVeniceModels();
  const [settings, setSettings] = useState<AdvancedSettingsState>(loadSettings);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Persist on change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = <K extends keyof AdvancedSettingsState>(
    key: K,
    value: AdvancedSettingsState[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setSettings({ ...DEFAULTS });
    setShowResetConfirm(false);
  };

  return (
    <div className="space-y-6">
      {/* Processing Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-status-info" />
          <h3 className="text-sm font-semibold text-text-primary">Processing</h3>
        </div>

        <div className="bg-[#0d1016] border border-[#1e2230] rounded-md p-4 space-y-5">
          {/* Default cleanup strength */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-text-secondary">
                Default Cleanup Strength
              </Label>
              <span className="text-xs font-mono text-text-primary">
                {settings.cleanupStrength.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[settings.cleanupStrength]}
              onValueChange={([v]) => update('cleanupStrength', v)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <p className="text-[11px] text-text-tertiary">
              Higher values produce more aggressive cleanup. Range: 0.0 – 1.0
            </p>
          </div>

          {/* Batch concurrency */}
          <div className="space-y-2">
            <Label className="text-xs text-text-secondary block">
              Batch Concurrency
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={5}
                value={settings.batchConcurrency}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) update('batchConcurrency', Math.max(1, Math.min(5, v)));
                }}
                className="w-20 h-8 bg-[#12151c] border-[#2A2E39] text-sm text-text-primary"
              />
              <span className="text-xs text-text-tertiary">max concurrent batches (1–5)</span>
            </div>
          </div>

          {/* Request reserve */}
          <div className="space-y-2">
            <Label className="text-xs text-text-secondary block">
              Request Reserve
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={50}
                value={settings.requestReserve}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) update('requestReserve', Math.max(0, Math.min(50, v)));
                }}
                className="w-20 h-8 bg-[#12151c] border-[#2A2E39] text-sm text-text-primary"
              />
              <span className="text-xs text-text-tertiary">requests to keep in reserve (0–50)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Image Quality Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-status-success" />
          <h3 className="text-sm font-semibold text-text-primary">Image Quality</h3>
        </div>

        <div className="bg-[#0d1016] border border-[#1e2230] rounded-md p-4 space-y-5">
          {/* Output format */}
          <div className="space-y-2">
            <Label className="text-xs text-text-secondary block">
              Output Format
            </Label>
            <Select
              value={settings.outputFormat}
              onValueChange={(v) => update('outputFormat', v)}
            >
              <SelectTrigger className="w-32 h-8 bg-[#12151c] border-[#2A2E39] text-sm text-text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#12151c] border-[#2A2E39]">
                <SelectItem
                  value="png"
                  className="text-xs text-text-primary focus:bg-[#1a1e27]"
                >
                  PNG
                </SelectItem>
                <SelectItem
                  value="jpeg"
                  className="text-xs text-text-primary focus:bg-[#1a1e27]"
                >
                  JPEG
                </SelectItem>
                <SelectItem
                  value="webp"
                  className="text-xs text-text-primary focus:bg-[#1a1e27]"
                >
                  WebP
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Image quality */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-text-secondary">
                Image Quality
              </Label>
              <span className="text-xs font-mono text-text-primary">
                {settings.imageQuality}%
              </span>
            </div>
            <Slider
              value={[settings.imageQuality]}
              onValueChange={([v]) => update('imageQuality', v)}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
            <p className="text-[11px] text-text-tertiary">
              JPEG/WebP quality. Higher is better but larger file size.
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshModels()}
          className="border-[#2A2E39] text-text-secondary hover:text-text-primary hover:bg-[#1a1e27]"
        >
          <RefreshCw className="size-3.5 mr-1.5" />
          Refresh Status
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refreshModels();
          }}
          className="border-[#2A2E39] text-text-secondary hover:text-text-primary hover:bg-[#1a1e27]"
        >
          <RotateCcw className="size-3.5 mr-1.5" />
          Reload Models
        </Button>
      </div>

      {/* Reset section */}
      <div className="border-t border-[#1e2230] pt-4 space-y-3">
        {!showResetConfirm ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetConfirm(true)}
            className="border-status-error/30 text-status-error hover:bg-status-error/10 hover:text-status-error"
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Reset All Settings
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-3 rounded-sm bg-amber-500/5 border border-status-warning/20">
              <AlertTriangle className="size-4 text-status-warning shrink-0 mt-0.5" />
              <p className="text-xs text-status-warning">
                Are you sure? This will reset all settings to defaults.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="border-status-error/30 text-status-error hover:bg-status-error/10"
              >
                Confirm Reset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResetConfirm(false)}
                className="text-text-secondary hover:text-text-primary"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
