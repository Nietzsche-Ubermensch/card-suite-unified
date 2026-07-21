import { z } from 'zod';

export const veniceModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  model_spec: z.record(z.string(), z.unknown()).optional(),
  privacy: z.string().optional(),
  pricing: z.object({
    prompt: z.number().optional(),
    completion: z.number().optional(),
    image: z.number().optional(),
  }).optional(),
  is_beta: z.boolean().optional(),
  is_deprecated: z.boolean().optional(),
  deprecation_warning: z.string().optional(),
  deprecation_date: z.string().optional(),
  supported_resolutions: z.array(z.string()).optional(),
  supported_aspect_ratios: z.array(z.string()).optional(),
  quality_tiers: z.array(z.string()).optional(),
  uncensored: z.boolean().optional(),
});

export const veniceModelsResponseSchema = z.object({
  data: z.array(veniceModelSchema),
});

export type VeniceModelSchema = z.infer<typeof veniceModelSchema>;
