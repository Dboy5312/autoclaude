import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, FolderOpen, AlertCircle, Power, PowerOff, Play, Plus, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
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
import { createTask } from '../stores/task-store';
import type { LoadedSkill } from '../../shared/types';

export function Skills() {
  const { toast } = useToast();
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId ?? s.selectedProjectId);

  const [skills, setSkills] = useState<LoadedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    const r = await window.electronAPI.skills.list();
    if (r.success) setSkills(r.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = window.electronAPI.skills.onChanged((s) => setSkills(s));
    return () => unsub();
  }, []);

  const reload = async () => {
    setReloading(true);
    const minDuration = new Promise((r) => setTimeout(r, 400));
    const r = await window.electronAPI.skills.reload();
    await minDuration;
    setReloading(false);
    if (r.success) {
      setSkills(r.data ?? []);
      toast({ title: 'Skills reloaded', description: `${r.data?.length ?? 0} skill(s) discovered.` });
    }
  };

  const toggle = async (id: string) => {
    const r = await window.electronAPI.skills.toggle(id);
    if (!r.success) toast({ title: 'Toggle failed', description: r.error, variant: 'destructive' });
  };

  const run = async (skill: LoadedSkill) => {
    if (!activeProjectId) {
      toast({ title: 'No project', description: 'Pick a project tab first.', variant: 'destructive' });
      return;
    }
    setRunning(skill.manifest.id);
    try {
      const title = skill.manifest.name;
      const description = skill.manifest.body || skill.manifest.description;
      const task = await createTask(activeProjectId, title, description);
      if (task) {
        toast({
          title: `Skill "${skill.manifest.name}" queued`,
          description: 'New task created in the kanban backlog.',
        });
      } else {
        toast({ title: 'Failed to create task', variant: 'destructive' });
      }
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Skills
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            File-based capability packs. Drop a folder with <code className="font-mono">SKILL.md</code> into your skills directory; click <strong>Run</strong> to create a task from one.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New skill
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.electronAPI.skills.openFolder()}>
            <FolderOpen className="h-4 w-4 mr-1" />
            Open folder
          </Button>
          <Button variant="ghost" size="sm" onClick={reload} disabled={reloading}>
            {reloading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Reload
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground text-center max-w-md mx-auto">
            <Sparkles className="h-8 w-8 opacity-40" />
            <div className="text-sm font-medium">No skills installed</div>
            <div className="text-xs">
              Each skill is a folder with a <code className="bg-muted px-1 py-0.5 rounded">SKILL.md</code> file (YAML frontmatter + markdown body).
            </div>
            <Button variant="outline" size="sm" onClick={() => window.electronAPI.skills.openFolder()} className="mt-2">
              <FolderOpen className="h-4 w-4 mr-1" />
              Open skills folder
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {skills.map((s) => {
              const m = s.manifest;
              const isRunning = running === m.id;
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-border bg-card p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{m.name}</span>
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{m.id}</code>
                      {s.loadError ? (
                        <span className="text-[10px] uppercase text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                          load error
                        </span>
                      ) : s.enabled ? (
                        <span className="text-[10px] uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          enabled
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          disabled
                        </span>
                      )}
                      {m.category && (
                        <span className="text-[10px] uppercase text-muted-foreground/80">{m.category}</span>
                      )}
                    </div>
                    {m.description && (
                      <div className="text-xs text-muted-foreground">{m.description}</div>
                    )}
                    {m.allowedTools && m.allowedTools.length > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        Tools: {m.allowedTools.map((t) => (
                          <code key={t} className="font-mono mr-1">{t}</code>
                        ))}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground/80 font-mono truncate">
                      {s.directory}
                    </div>
                    {s.loadError && (
                      <div className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {s.loadError}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => run(s)}
                      disabled={!s.enabled || !!s.loadError || isRunning || !activeProjectId}
                      title="Create a new task from this skill"
                    >
                      {isRunning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : (
                        <Play className="h-3.5 w-3.5 mr-1" />
                      )}
                      Run
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggle(m.id)}
                      disabled={!!s.loadError}
                      title={s.enabled ? 'Disable' : 'Enable'}
                    >
                      {s.enabled ? (
                        <PowerOff className="h-3.5 w-3.5" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CreateSkillDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </div>
  );
}

function CreateSkillDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (!id.trim() || !name.trim()) {
      toast({ title: 'Missing fields', description: 'Id and name are required.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    const r = await window.electronAPI.skills.createFromTemplate({ id, name, description });
    setCreating(false);
    if (!r.success) {
      toast({ title: 'Create failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Skill created', description: r.data?.directory ?? '' });
    setId('');
    setName('');
    setDescription('');
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New skill</DialogTitle>
          <DialogDescription>
            Scaffolds a folder with a <code className="font-mono">SKILL.md</code> file. Edit the body afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="skill-id">Id (kebab-case)</Label>
            <Input id="skill-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="code-review" className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="skill-name">Name</Label>
            <Input id="skill-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Code Review" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="skill-desc">Description</Label>
            <Textarea id="skill-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="One-line summary of what this skill does." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>Cancel</Button>
          <Button onClick={submit} disabled={creating}>
            {creating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
