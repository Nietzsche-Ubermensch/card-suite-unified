import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS, apiGet } from '@/lib/api-client';
import type { VeniceStatus } from '@/types';

export function useVeniceStatus() {
  return useQuery<VeniceStatus>({
    queryKey: ['venice-status'],
    queryFn: () => apiGet(API_ENDPOINTS.status),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}
