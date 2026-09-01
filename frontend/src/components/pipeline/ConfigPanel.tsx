import { useConfigStore } from '@/store/configStore';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

export default function ConfigPanel() {
  const { config, setConfig, resetConfig } = useConfigStore();

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Pipeline Parameters</h3>
        <Button variant="ghost" size="sm" onClick={resetConfig} className="gap-1.5 text-xs text-text-secondary">
          <RotateCcw className="size-3" />
          Reset
        </Button>
      </div>

      <SliderField
        label="Denoise Strength"
        value={config.denoiseStrength}
        min={0} max={1} step={0.05}
        onChange={(v) => setConfig({ denoiseStrength: v })}
      />
      <SliderField
        label="Glare Threshold"
        value={config.glareThreshold}
        min={0} max={1} step={0.05}
        onChange={(v) => setConfig({ glareThreshold: v })}
      />
      <SliderField
        label="Upscale Factor"
        value={config.upscaleFactor}
        min={1} max={4} step={0.5}
        onChange={(v) => setConfig({ upscaleFactor: v })}
      />
      <SliderField
        label="Contrast"
        value={config.contrast}
        min={0.5} max={2} step={0.05}
        onChange={(v) => setConfig({ contrast: v })}
      />
      <SliderField
        label="Saturation"
        value={config.saturation}
        min={0} max={2} step={0.05}
        onChange={(v) => setConfig({ saturation: v })}
      />
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function SliderField({ label, value, min, max, step, onChange }: SliderFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <Label className="text-text-secondary">{label}</Label>
        <span className="text-text-primary tabular-nums">{value.toFixed(2)}</span>
      </div>
      <Slider
        min={min} max={max} step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}
