import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { savePreset, loadPresets, deletePreset } from '@/db/indexedDb';
import { useConfigStore } from '@/store/configStore';
import type { PipelinePreset } from '@/db/schema';
import { Trash2, Download, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function PresetManager() {
  const [presets, setPresets] = useState<PipelinePreset[]>([]);
  const [newName, setNewName] = useState('');
  const { config, setConfig } = useConfigStore();

  useEffect(() => {
    loadPresets().then(setPresets);
  }, []);

  const handleSave = async () => {
    const name = newName.trim();
    if (!name) { toast.error('Enter a preset name'); return; }
    const preset: PipelinePreset = {
      id: crypto.randomUUID(),
      name,
      ...config,
      createdAt: Date.now(),
    };
    await savePreset(preset);
    const updated = await loadPresets();
    setPresets(updated);
    setNewName('');
    toast.success(`Preset "${name}" saved`);
  };

  const handleLoad = (preset: PipelinePreset) => {
    setConfig({
      denoiseStrength: preset.denoiseStrength,
      glareThreshold: preset.glareThreshold,
      upscaleFactor: preset.upscaleFactor,
      contrast: preset.contrast,
      saturation: preset.saturation,
    });
    toast.success(`Loaded preset "${preset.name}"`);
  };

  const handleDelete = async (id: string) => {
    await deletePreset(id);
    const updated = await loadPresets();
    setPresets(updated);
  };

  return (
    <div className="space-y-3 p-4">
      <h3 className="text-sm font-semibold text-text-primary">Presets</h3>

      <div className="flex gap-2">
        <Input
          placeholder="Preset name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-8 text-xs"
          onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
        />
        <Button size="sm" onClick={() => void handleSave()} className="h-8 gap-1">
          <Plus className="size-3" />
          Save
        </Button>
      </div>

      {presets.length === 0 && (
        <p className="text-xs text-text-secondary">No presets saved yet.</p>
      )}

      <ul className="space-y-1.5">
        {presets.map((preset) => (
          <li key={preset.id} className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2">
            <span className="text-xs text-text-primary truncate flex-1">{preset.name}</span>
            <div className="flex gap-1 ml-2">
              <Button variant="ghost" size="icon" className="size-6" onClick={() => handleLoad(preset)} title="Load preset">
                <Download className="size-3" />
              </Button>
              <Button variant="ghost" size="icon" className="size-6 text-destructive hover:text-destructive" onClick={() => void handleDelete(preset.id)} title="Delete preset">
                <Trash2 className="size-3" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
