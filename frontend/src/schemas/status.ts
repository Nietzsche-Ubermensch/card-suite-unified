import { z } from 'zod';

export const veniceStatusSchema = z.object({
  ok: z.boolean(),
  updatedAt: z.string().nullable(),
  balanceUsd: z.string().nullable(),
  balanceDiem: z.string().nullable(),
  remainingRequests: z.string().nullable(),
  limitRequests: z.string().nullable(),
  remainingTokens: z.string().nullable(),
  resetRequests: z.string().nullable(),
  deprecationWarning: z.string().nullable(),
  deprecationDate: z.string().nullable(),
  modelId: z.string().nullable(),
  modelName: z.string().nullable(),
});

export type VeniceStatusSchema = z.infer<typeof veniceStatusSchema>;
