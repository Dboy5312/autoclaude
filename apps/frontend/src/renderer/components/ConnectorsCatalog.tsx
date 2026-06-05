import { useEffect, useMemo, useState } from 'react';
import { Plug, Search, Check, Plus, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useToast } from '../hooks/use-toast';
import { useProjectStore } from '../stores/project-store';
import {
  CONNECTOR_CATALOG,
  CONNECTOR_CATEGORIES,
  type ConnectorCatalogEntry,
  type ConnectorCategory,
} from '../lib/connector-catalog';
import type { CustomMcpServer, ProjectEnvConfig } from '../../shared/types';

function entryToMcpServer(e: ConnectorCatalogEntry): CustomMcpServer {
  const args = ['-y', e.packageName, ...(e.extraArgs ?? [])];
  return {
    id: e.id,
    name: e.name,
    type: 'command',
    command: 'npx',
    args,
    description: e.description,
  };
}

export function ConnectorsCatalog() {
  const { toast } = useToast();
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId ?? s.selectedProjectId);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [envConfig, setEnvConfig] = useState<ProjectEnvConfig | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ConnectorCategory | 'all'>('all');
  const [installing, setInstalling] = useState<string | null>(null);

  const project = projects.find((p) => p.id === activeProjectId);

  // Pull the currently installed connector ids from the active project's env config.
  useEffect(() => {
    if (!project) {
      setInstalled(new Set());
      setEnvConfig(null);
      return;
    }
    let cancelled = false;
    window.electronAPI.getProjectEnv(project.id).then((r) => {
      if (cancelled) return;
      if (r.success && r.data) {
        setEnvConfig(r.data);
        setInstalled(new Set((r.data.customMcpServers ?? []).map((s) => s.id)));
      } else {
        setEnvConfig(null);
        setInstalled(new Set());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CONNECTOR_CATALOG.filter((e) => {
      if (category !== 'all' && e.category !== category) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.packageName.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  const add = async (e: ConnectorCatalogEntry) => {
    if (!project) {
      toast({ title: 'No project selected', description: 'Pick a project in the top tabs first.', variant: 'destructive' });
      return;
    }
    if (installed.has(e.id)) return;
    setInstalling(e.id);
    const existing = envConfig?.customMcpServers ?? [];
    const next = [...existing, entryToMcpServer(e)];
    try {
      const r = await window.electronAPI.updateProjectEnv(project.id, {
        customMcpServers: next,
      });
      if (!r.success) {
        toast({ title: 'Install failed', description: r.error, variant: 'destructive' });
        return;
      }
      setInstalled(new Set([...installed, e.id]));
      toast({
        title: `${e.name} added`,
        description: e.requiredEnv?.length
          ? `Set ${e.requiredEnv.map((v) => v.key).join(', ')} in your env before use.`
          : 'Connector is configured. Restart any running agents to pick it up.',
      });
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4 space-y-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Connectors
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Browse and install popular MCP servers for the active project.
            {project && (
              <>
                {' '}Current project: <span className="font-medium text-foreground">{project.name}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search connectors…"
              className="pl-8 h-9 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <CategoryChip
              active={category === 'all'}
              onClick={() => setCategory('all')}
              label="All"
            />
            {CONNECTOR_CATEGORIES.map((c) => (
              <CategoryChip
                key={c.id}
                active={category === c.id}
                onClick={() => setCategory(c.id)}
                label={c.label}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-16 text-muted-foreground">
            <AlertCircle className="h-5 w-5 opacity-60" />
            <div className="text-sm">No connectors match.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((e) => {
              const isInstalled = installed.has(e.id);
              return (
                <div
                  key={e.id}
                  className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{e.name}</div>
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                        {CONNECTOR_CATEGORIES.find((c) => c.id === e.category)?.label ?? e.category}
                      </div>
                    </div>
                    {isInstalled ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        <Check className="h-3 w-3" /> Added
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => add(e)}
                        disabled={!project || installing === e.id}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{e.description}</div>
                  {e.details && (
                    <div className="text-[11px] text-muted-foreground/80 italic">{e.details}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground/80 font-mono truncate">
                    npx -y {e.packageName}
                    {e.extraArgs?.length ? ` ${e.extraArgs.join(' ')}` : ''}
                  </div>
                  {e.requiredEnv && e.requiredEnv.length > 0 && (
                    <div className="text-[11px] text-amber-400/80 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>
                        Env required:{' '}
                        <span className="font-mono">
                          {e.requiredEnv.map((v) => v.key).join(', ')}
                        </span>
                      </span>
                    </div>
                  )}
                  {e.homepage && (
                    <a
                      href={e.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      Homepage <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'text-[11px] px-2 py-0.5 rounded-full border transition-colors ' +
        (active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-muted')
      }
    >
      {label}
    </button>
  );
}
