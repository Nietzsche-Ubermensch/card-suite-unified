import { db, type PersistedJob, type PipelinePreset } from './schema';

// ─── Jobs ─────────────────────────────────────────────────────────────────

export async function saveJob(job: PersistedJob): Promise<void> {
  await db.jobs.put(job);
}

export async function loadJobs(): Promise<PersistedJob[]> {
  return db.jobs.orderBy('createdAt').reverse().toArray();
}

export async function deleteJob(id: string): Promise<void> {
  await db.jobs.delete(id);
}

export async function clearCompletedJobs(): Promise<void> {
  await db.jobs.where('state').anyOf(['complete', 'cancelled', 'failed']).delete();
}

// ─── Presets ──────────────────────────────────────────────────────────────

export async function savePreset(preset: PipelinePreset): Promise<void> {
  await db.presets.put(preset);
}

export async function loadPresets(): Promise<PipelinePreset[]> {
  return db.presets.orderBy('name').toArray();
}

export async function deletePreset(id: string): Promise<void> {
  await db.presets.delete(id);
}
