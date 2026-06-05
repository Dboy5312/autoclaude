import { useEffect, useState } from 'react';
import { Clock, Play, Trash2, Plus, PowerOff, Power, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { useToast } from '../hooks/use-toast';
import { useProjectStore } from '../stores/project-store';
import type { ScheduledTask, CreateScheduledTaskInput } from '../../shared/types';

const CRON_EXAMPLES: { label: string; cron: string }[] = [
  { label: 'Every weekday 9am', cron: '0 9 * * 1-5' },
  { label: 'Mondays 10am', cron: '0 10 * * 1' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Every 15 min', cron: '*/15 * * * *' },
  { label: 'Daily midnight', cron: '0 0 * * *' },
];

function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function ScheduledTasks() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId ?? s.selectedProjectId);

  const refresh = async () => {
    const r = await window.electronAPI.cron.list();
    if (r.success) setTasks(r.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const unsub = window.electronAPI.cron.onChanged((t) => setTasks(t));
    return () => unsub();
  }, []);

  const toggle = async (id: string) => {
    const r = await window.electronAPI.cron.toggle(id);
    if (!r.success) toast({ title: 'Toggle failed', description: r.error, variant: 'destructive' });
  };

  const remove = async (id: string) => {
    const r = await window.electronAPI.cron.remove(id);
    if (!r.success) toast({ title: 'Delete failed', description: r.error, variant: 'destructive' });
  };

  const fireNow = async (id: string) => {
    const r = await window.electronAPI.cron.fireNow(id);
    if (!r.success) {
      toast({ title: 'Fire failed', description: r.error, variant: 'destructive' });
    } else {
      toast({ title: 'Scheduled task fired', description: 'A new task is being created.' });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Scheduled Tasks
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Run a task automatically on a cron schedule. Fires create a fresh task under the selected project.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm" disabled={projects.length === 0}>
          <Plus className="h-4 w-4 mr-1" />
          New schedule
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Clock className="h-8 w-8 opacity-40" />
            <div className="text-sm">No scheduled tasks yet.</div>
            {projects.length === 0 ? (
              <div className="text-xs">Add a project first.</div>
            ) : (
              <Button variant="link" size="sm" onClick={() => setDialogOpen(true)}>
                Create one
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const project = projects.find((p) => p.id === t.projectId);
              return (
                <li
                  key={t.id}
                  className="rounded-lg border border-border bg-card p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t.name}</span>
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{t.cron}</code>
                      {!t.enabled && (
                        <span className="text-[10px] uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          paused
                        </span>
                      )}
                      {t.recurring ? (
                        <span className="text-[10px] uppercase text-muted-foreground">recurring</span>
                      ) : (
                        <span className="text-[10px] uppercase text-amber-500">one-shot</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{t.prompt}</div>
                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                      <span>Project: {project?.name ?? 'unknown'}</span>
                      <span>Next: {formatRelative(t.nextRunAt)}</span>
                      {t.lastFiredAt && <span>Last: {formatRelative(t.lastFiredAt)}</span>}
                    </div>
                    {t.lastError && (
                      <div className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {t.lastError}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fireNow(t.id)}
                      title="Fire now"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggle(t.id)}
                      title={t.enabled ? 'Pause' : 'Resume'}
                    >
                      {t.enabled ? (
                        <PowerOff className="h-3.5 w-3.5" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(t.id)}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CreateScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultProjectId={activeProjectId ?? projects[0]?.id ?? ''}
        creating={creating}
        setCreating={setCreating}
      />
    </div>
  );
}

interface CreateScheduleDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultProjectId: string;
  creating: boolean;
  setCreating: (v: boolean) => void;
}

function CreateScheduleDialog({
  open,
  onOpenChange,
  defaultProjectId,
  creating,
  setCreating,
}: CreateScheduleDialogProps) {
  const { toast } = useToast();
  const projects = useProjectStore((s) => s.projects);
  const [name, setName] = useState('');
  const [cron, setCron] = useState('0 9 * * 1-5');
  const [prompt, setPrompt] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [recurring, setRecurring] = useState(true);
  const [autoStart, setAutoStart] = useState(true);
  const [nextPreview, setNextPreview] = useState<string | null>(null);
  const [cronError, setCronError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(defaultProjectId);
  }, [open, defaultProjectId]);

  useEffect(() => {
    let cancelled = false;
    setCronError(null);
    setNextPreview(null);
    if (!cron.trim()) return;
    window.electronAPI.cron.validate(cron).then((r) => {
      if (cancelled) return;
      if (r.success) setNextPreview(r.data?.nextRunAt ?? null);
      else setCronError(r.error ?? 'Invalid cron');
    });
    return () => {
      cancelled = true;
    };
  }, [cron]);

  const submit = async () => {
    if (!cron.trim() || !prompt.trim() || !projectId) {
      toast({ title: 'Missing fields', description: 'Cron, prompt, and project are required.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    const input: CreateScheduledTaskInput = {
      name: name.trim() || `Schedule ${cron}`,
      cron: cron.trim(),
      prompt: prompt.trim(),
      projectId,
      recurring,
      autoStart,
    };
    const r = await window.electronAPI.cron.create(input);
    setCreating(false);
    if (!r.success) {
      toast({ title: 'Create failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Scheduled', description: `Next run: ${r.data?.nextRunAt ? new Date(r.data.nextRunAt).toLocaleString() : '?'}` });
    setName('');
    setCron('0 9 * * 1-5');
    setPrompt('');
    setRecurring(true);
    setAutoStart(true);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New scheduled task</DialogTitle>
          <DialogDescription>
            Define a cron expression and the prompt that will become the task description when it fires.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sched-name">Label</Label>
            <Input
              id="sched-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nightly cleanup"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="sched-cron">Cron expression (5 fields: min hr dom mon dow)</Label>
            <Input
              id="sched-cron"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 9 * * 1-5"
              className="font-mono"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {CRON_EXAMPLES.map((ex) => (
                <button
                  key={ex.cron}
                  type="button"
                  onClick={() => setCron(ex.cron)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted"
                  title={ex.cron}
                >
                  {ex.label}
                </button>
              ))}
            </div>
            {cronError ? (
              <div className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {cronError}
              </div>
            ) : nextPreview ? (
              <div className="text-xs text-muted-foreground">
                Next run: {new Date(nextPreview).toLocaleString()}
              </div>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="sched-project">Project</Label>
            <select
              id="sched-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {projects.length === 0 && <option value="">No projects yet</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sched-prompt">Prompt (becomes the task description)</Label>
            <Textarea
              id="sched-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="e.g. Run lint + tests; if any failures, fix them; commit."
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="sched-recurring" className="cursor-pointer">
                Recurring
              </Label>
              <p className="text-xs text-muted-foreground">
                When off, the task fires once then auto-deletes.
              </p>
            </div>
            <Switch id="sched-recurring" checked={recurring} onCheckedChange={setRecurring} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="sched-autostart" className="cursor-pointer">
                Auto-start agent
              </Label>
              <p className="text-xs text-muted-foreground">
                Kick off the agent immediately on fire. Off = task created but stays in backlog.
              </p>
            </div>
            <Switch id="sched-autostart" checked={autoStart} onCheckedChange={setAutoStart} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={creating || !!cronError}>
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
