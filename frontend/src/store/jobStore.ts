import { create } from 'zustand';
import { saveJob, loadJobs, deleteJob, clearCompletedJobs } from '@/db/indexedDb';
import type { PersistedJob } from '@/db/schema';

interface JobStoreState {
  jobs: PersistedJob[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  upsertJob: (job: PersistedJob) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => Promise<void>;
}

export const useJobStore = create<JobStoreState>((set, get) => ({
  jobs: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const jobs = await loadJobs();
    set({ jobs, hydrated: true });
  },

  upsertJob: (job) => {
    set((state) => {
      const existing = state.jobs.findIndex((j) => j.id === job.id);
      const next =
        existing >= 0
          ? state.jobs.map((j) => (j.id === job.id ? job : j))
          : [job, ...state.jobs];
      return { jobs: next };
    });
    void saveJob(job);
  },

  removeJob: (id) => {
    set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) }));
    void deleteJob(id);
  },

  clearCompleted: async () => {
    await clearCompletedJobs();
    const jobs = await loadJobs();
    set({ jobs });
  },
}));
