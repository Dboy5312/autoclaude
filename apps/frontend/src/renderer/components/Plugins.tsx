import { useEffect, useState } from 'react';
import { Boxes, RefreshCw, FolderOpen, AlertCircle, Power, PowerOff, Download, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { useProjectStore } from '../stores/project-store';
import type { LoadedPlugin } from '../../shared/types';

export function Plugins() {
  const { toast } = useToast();
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId ?? s.selectedProjectId);
  const [plugins, setPlugins] = useState<LoadedPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  const load = async () => {
    const r = await window.electronAPI.plugins.list();
    if (r.success) setPlugins(r.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = window.electronAPI.plugins.onChanged((p) => setPlugins(p));
    return () => unsub();
  }, []);

  const reload = async () => {
    setReloading(true);
    const minDuration = new Promise((r) => setTimeout(r, 400));
    const r = await window.electronAPI.plugins.reload();
    await minDuration;
    setReloading(false);
    if (r.success) {
      setPlugins(r.data ?? []);
      toast({ title: 'Plugins reloaded', description: `${r.data?.length ?? 0} plugin(s) discovered.` });
    } else {
      toast({ title: 'Reload failed', description: r.error, variant: 'destructive' });
    }
  };

  const toggle = async (id: string) => {
    const r = await window.electronAPI.plugins.toggle(id);
    if (!r.success) toast({ title: 'Toggle failed', description: r.error, variant: 'destructive' });
  };

  const installTo = async (pluginId: string) => {
    if (!activeProjectId) {
      toast({ title: 'No project', description: 'Pick a project tab first.', variant: 'destructive' });
      return;
    }
    setInstalling(pluginId);
    try {
      const stencils = await window.electronAPI.plugins.installToProject(pluginId, activeProjectId);
      if (!stencils.success) {
        toast({ title: 'Install failed', description: stencils.error, variant: 'destructive' });
        return;
      }
      const servers = stencils.data?.servers ?? [];
      // Merge into the project's env config, skipping any servers already present.
      const envResult = await window.electronAPI.getProjectEnv(activeProjectId);
      const existing = envResult.success ? envResult.data?.customMcpServers ?? [] : [];
      const existingIds = new Set(existing.map((s) => s.id));
      const additions = servers.filter((s) => !existingIds.has(s.id));
      if (additions.length === 0) {
        toast({ title: 'Already installed', description: 'No new MCP servers to add.' });
        return;
      }
      const writeResult = await window.electronAPI.updateProjectEnv(activeProjectId, {
        customMcpServers: [...existing, ...additions],
      });
      if (!writeResult.success) {
        toast({ title: 'Install failed', description: writeResult.error, variant: 'destructive' });
        return;
      }
      toast({
        title: `Installed ${additions.length} MCP server(s)`,
        description: `Added to ${projects.find((p) => p.id === activeProjectId)?.name ?? 'project'}.`,
      });
    } finally {
      setInstalling(null);
    }
  };

  const openFolder = async () => {
    await window.electronAPI.plugins.openFolder();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Boxes className="h-5 w-5" />
            Plugins
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drop plugin directories into your plugins folder to extend AutoClaude with bundled MCP servers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openFolder} title="Open plugins folder">
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
        ) : plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground text-center max-w-md mx-auto">
            <Boxes className="h-8 w-8 opacity-40" />
            <div className="text-sm font-medium">No plugins installed</div>
            <div className="text-xs">
              Each plugin is a directory under your plugins folder containing a{' '}
              <code className="bg-muted px-1 py-0.5 rounded">plugin.json</code> with at least{' '}
              <code className="bg-muted px-1 py-0.5 rounded">id</code>,{' '}
              <code className="bg-muted px-1 py-0.5 rounded">name</code>, and{' '}
              <code className="bg-muted px-1 py-0.5 rounded">version</code>.
            </div>
            <Button variant="outline" size="sm" onClick={openFolder} className="mt-2">
              <FolderOpen className="h-4 w-4 mr-1" />
              Open plugins folder
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {plugins.map((p) => {
              const m = p.manifest;
              const mcpCount = m.mcpServers?.length ?? 0;
              const isInstalling = installing === m.id;
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-border bg-card p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{m.name}</span>
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">v{m.version}</code>
                      {p.loadError ? (
                        <span className="text-[10px] uppercase text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                          load error
                        </span>
                      ) : p.enabled ? (
                        <span className="text-[10px] uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          enabled
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          disabled
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <div className="text-xs text-muted-foreground">{m.description}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground/80 font-mono truncate">
                      {p.directory}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                      {m.author && <span>by {m.author}</span>}
                      <span>{mcpCount} MCP {mcpCount === 1 ? 'server' : 'servers'}</span>
                    </div>
                    {p.loadError && (
                      <div className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {p.loadError}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {mcpCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => installTo(m.id)}
                        disabled={!p.enabled || !!p.loadError || isInstalling || !activeProjectId}
                        title="Install this plugin's MCP servers into the active project"
                      >
                        {isInstalling ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Download className="h-3.5 w-3.5 mr-1" />
                        )}
                        Install to project
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggle(m.id)}
                      disabled={!!p.loadError}
                      title={p.enabled ? 'Disable' : 'Enable'}
                    >
                      {p.enabled ? (
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
    </div>
  );
}
