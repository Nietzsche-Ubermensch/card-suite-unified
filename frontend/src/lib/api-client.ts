import type { VeniceStatus } from '@/types';

export const API_ENDPOINTS = {
  status: '/api/status',
  models: '/api/models',
  chat: '/api/chat',
  analyze: '/api/ai/analyze',
  restore: '/api/ai/restore',
  scanCleanup: '/api/ai/scan-cleanup',
  generateImage: '/api/images/generate',
} as const;

export interface ApiError {
  error: string;
}

export async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Venice status header reader for client-side
export function readVeniceStatusFromHeaders(headers: Headers): Partial<VeniceStatus> {
  return {
    balanceUsd: headers.get('x-venice-balance-usd'),
    balanceDiem: headers.get('x-venice-balance-diem'),
    remainingRequests: headers.get('x-ratelimit-remaining-requests'),
    limitRequests: headers.get('x-ratelimit-limit-requests'),
    remainingTokens: headers.get('x-ratelimit-remaining-tokens'),
    resetRequests: headers.get('x-ratelimit-reset-requests'),
    deprecationWarning: headers.get('x-venice-model-deprecation-warning'),
    deprecationDate: headers.get('x-venice-model-deprecation-date'),
    modelId: headers.get('x-venice-model-id'),
    modelName: headers.get('x-venice-model-name'),
  };
}
