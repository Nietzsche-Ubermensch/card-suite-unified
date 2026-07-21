import { z } from 'zod';

export const scanAnalysisResultSchema = z.object({
  artifactTypes: z.array(z.string()).optional(),
  artifactLocations: z.array(z.string()).optional(),
  colorCast: z.string().optional(),
  lightingIssues: z.array(z.string()).optional(),
  cardConditionIntact: z.boolean().optional(),
  recommendedApproach: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  material: z.enum(['cardboard', 'chrome', 'refractor', 'unknown']).optional(),
  orientation: z.enum(['horizontal', 'vertical', 'unknown']).optional(),
});

export type ScanAnalysisResultSchema = z.infer<typeof scanAnalysisResultSchema>;
