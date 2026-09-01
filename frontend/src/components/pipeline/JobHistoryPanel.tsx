import { useEffect } from 'react';
import { useJobStore } from '@/store/jobStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { PersistedJob } from '@/db/schema';

const STATE_COLORS: Record<string, string> = {
  queued: 'bg-slate-700 text-slate-200',
  analyzing: 'bg-blue-800 text-blue-200',
  cleaning: 'bg-indigo-800 text-indigo-200',
  complete: 'bg-emerald-800 text-emerald-200',
  failed: 'bg-red-800 text-red-200',
  cancelled: 'bg-slate-600 text-slate-300',
  paused: 'bg-amber-800 text-amber-200',
};

function JobRow({ job, onRemove }: { job: PersistedJob; onRemove: (id: string) => void }) {
  const duration =
    job.completedAt && job.createdAt
      ? ((job.completedAt - job.createdAt) / 1000).toFixed(1) + 's'
      : null;

  return (
    <div className="flex items-center gap-3 rounded-md border border-border-subtle px-3 py-2 text-xs">
      <div className="flex-1 min-w-0">
        <p className="truncate text-text-primary font-medium">{job.filename}</p>
        <p className="text-text-secondary mt-0.5">
          {new Date(job.createdAt).toLocaleTimeString()}
          {duration && ` · ${duration}`}
          {job.priority !== 'normal' && ` · ${job.priority}`}
        </p>
      </div>
      <Badge className={STATE_COLORS[job.state] ?? ''}>{job.state}</Badge>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-text-secondary hover:text-destructive"
        onClick={() => onRemove(job.id)}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}

export default function JobHistoryPanel() {
  const { jobs, hydrated, hydrate, removeJob, clearCompleted } = useJobStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return <div className="p-4 text-xs text-text-secondary">Loading history…</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 pb-2">
        <h3 className="text-sm font-semibold text-text-primary">Job History</h3>
        {jobs.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-text-secondary h-7"
            onClick={() => void clearCompleted()}
          >
            Clear completed
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
        {jobs.length === 0 ? (
          <p className="text-xs text-text-secondary">No job history yet.</p>
        ) : (
          jobs.map((job) => (
            <JobRow key={job.id} job={job} onRemove={removeJob} />
          ))
        )}
      </div>
    </div>
  );
}
