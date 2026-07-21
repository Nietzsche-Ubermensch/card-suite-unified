import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS, apiGet } from '@/lib/api-client';
import { categorizeModels } from '@/lib/model-categories';
import type { VeniceModel } from '@/types';

async function fetchVeniceModels(): Promise<VeniceModel[]> {
  const response = await apiGet<{ data: unknown[] }>(API_ENDPOINTS.models);
  const source = Array.isArray(response.data) ? response.data : [];

  return source.filter(
    (model): model is VeniceModel =>
      model !== null &&
      typeof model === 'object' &&
      typeof (model as VeniceModel).id === 'string',
  );
}

export function useVeniceModels() {
  const query = useQuery({
    queryKey: ['venice-models'],
    queryFn: fetchVeniceModels,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const categorized = query.data ? categorizeModels(query.data) : null;

  return {
    ...query,
    models: query.data ?? [],
    categorized,
  };
}
