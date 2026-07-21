import type { VeniceModel } from '@/types';

export interface CategorizedModels {
  chat: VeniceModel[];
  analysis: VeniceModel[];
  restore: VeniceModel[];
  image: VeniceModel[];
}

export function categorizeModels(models: VeniceModel[]): CategorizedModels {
  const chat: VeniceModel[] = [];
  const analysis: VeniceModel[] = [];
  const restore: VeniceModel[] = [];
  const image: VeniceModel[] = [];

  for (const model of models) {
    const type = model.type?.toLowerCase() ?? '';

    if (type === 'image') {
      image.push(model);
      continue;
    }

    if (type === 'inpaint' || type === 'edit') {
      restore.push(model);
      continue;
    }

    if (type === 'upscale') {
      // upscale models go to restore category
      restore.push(model);
      continue;
    }

    if (type === 'text') {
      chat.push(model);

      // Check vision capabilities
      const caps = model.capabilities ?? model.model_spec?.capabilities ?? {};
      const hasVision =
        caps?.supportsVision === true ||
        caps?.supports_vision === true ||
        caps?.vision === true;

      if (hasVision) {
        analysis.push(model);
      }
      continue;
    }

    // Fallback: use name heuristics if type metadata is missing
    const id = model.id.toLowerCase();
    if (id.includes('vision') || id.includes('gpt-4') || id.includes('claude')) {
      chat.push(model);
      analysis.push(model);
    } else if (id.includes('edit') || id.includes('inpaint') || id.includes('restore')) {
      restore.push(model);
    } else if (id.includes('flux') || id.includes('sd') || id.includes('stable')) {
      image.push(model);
    } else {
      chat.push(model);
    }
  }

  return { chat, analysis, restore, image };
}

export function getFriendlyModelName(model: VeniceModel): string {
  return model.name || model.id;
}
