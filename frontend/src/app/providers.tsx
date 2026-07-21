import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#12151c',
            border: '1px solid #2A2E39',
            color: '#e8eaf0',
          },
        }}
      />
    </QueryClientProvider>
  );
}
