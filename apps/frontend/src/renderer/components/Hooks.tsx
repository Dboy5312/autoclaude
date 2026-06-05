import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Webhook,
  Terminal,
  MessageSquare,
  Folder,
  User,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { useToast } from '../hooks/use-toast';
import { useProjectStore } from '../stores/project-store';
import { cn } from '../lib/utils';
import type {
  HookListEntry,
  HookFireResult,
  HookEvent,
  HookScope,
} from '../../shared/types';

interface HooksProps {
  /** Currently active project (if any) — scopes the project-level hooks shown. */
  projectPath: string | null;
}

const TYPE_ICON: Record<HookListEntry['type'], typeof Terminal> = {
  command: Terminal,
  http: Webhook,
  prompt: MessageSquare,
};

const STATUS_COLOR: Record<HookFireResult['status'], string> = {
  success: 'text-emerald-500',
  blocked: 'text-red-500',
  timeout: 'text-amber-500',
  error: 'text-red-500',
  untrusted: 'text-amber-500',
  skipped: 'text-muted-foreground',
};

const STATUS_ICON: Record<HookFireResult['status'], typeof CheckCircle2> = {
  success: CheckCircle2,
  blocked: XCircle,
  timeout: Clock,
  error: AlertCircle,
  untrusted: ShieldAlert,
  skipped: AlertCircle,
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}

export function Hooks({ projectPath }: HooksProps) {
  const [entries, setEntries] = useState<HookListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFireById, setLastFireById] = useState<Record<string, HookFireResult>>({});
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.hooks.list(projectPath ?? undefined);
      if (!result.success) {
        setError(result.error ?? 'Failed to list hooks');
        setEntries([]);
        return;
      }
      setEntries(result.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    load();
  }, [load]);

  // Live-update last-fire status when hooks fire elsewhere in the app.
  useEffect(() => {
    return window.electronAPI.hooks.onHookFired((result) => {
      setLastFireById((prev) => ({ ...prev, [result.hookId]: result }));
    });
  }, []);

  // Surface a toast when a new hook needs trust approval.
  useEffect(() => {
    return window.electronAPI.hooks.onTrustRequired((info) => {
      toast({
        title: 'Hook needs approval',
        description: `An unapproved ${info.type} hook tried to fire on ${info.event}. Approve in Hooks view.`,
      });
      load();
    });
  }, [toast, load]);

  const reload = useCallback(async () => {
    // Hold the spinner for a minimum 400ms so the user actually sees the
    // animation — the IPC reload itself is typically <50ms.
    const minDuration = new Promise((r) => setTimeout(r, 400));
    setLoading(true);
    const result = await window.electronAPI.hooks.reload(projectPath ?? undefined);
    if (!result.success) {
      await minDuration;
      setLoading(false);
      toast({
        title: 'Reload failed',
        description: result.error ?? 'Unknown error',
        variant: 'destructive',
      });
      return;
    }
    await Promise.all([load(), minDuration]);
    toast({
      title: 'Hooks reloaded',
      description: 'Hooks configuration refreshed.',
    });
  }, [projectPath, toast, load]);

  const toggleEnabled = useCallback(
    async (hookId: string, currentlyDisabled: boolean) => {
      const result = await window.electronAPI.hooks.toggle(hookId, !currentlyDisabled);
      if (!result.success) {
        toast({
          title: 'Toggle failed',
          description: result.error ?? 'Unknown error',
          variant: 'destructive',
        });
        return;
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.hookId === hookId ? { ...e, disabled: !currentlyDisabled } : e,
        ),
      );
    },
    [toast],
  );

  const setTrusted = useCallback(
    async (hookId: string, approve: boolean) => {
      const result = await window.electronAPI.hooks.trust(hookId, approve);
      if (!result.success) {
        toast({
          title: 'Trust update failed',
          description: result.error ?? 'Unknown error',
          variant: 'destructive',
        });
        return;
      }
      setEntries((prev) =>
        prev.map((e) => (e.hookId === hookId ? { ...e, trusted: approve } : e)),
      );
    },
    [toast],
  );

  const openFile = useCallback(
    async (scope: HookScope) => {
      const result = await window.electronAPI.hooks.openFile(
        scope,
        projectPath ?? undefined,
      );
      if (!result.success) {
        toast({
          title: 'Could not open file',
          description: result.error ?? 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [projectPath, toast],
  );

  const grouped = useMemo(() => {
    const out = new Map<HookEvent, HookListEntry[]>();
    for (const e of entries) {
      const list = out.get(e.event) ?? [];
      list.push(e);
      out.set(e.event, list);
    }
    return out;
  }, [entries]);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-lg font-semibold">Hooks</h2>
          <p className="text-xs text-muted-foreground">
            Run shell commands or webhooks on AutoClaude events. Edit{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">hooks.json</code>
            {' '}to configure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5 text-xs">Reload</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => openFile('user')}>
            <User className="h-3.5 w-3.5" />
            <span className="ml-1.5 text-xs">User hooks.json</span>
            <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
          {projectPath && (
            <Button variant="outline" size="sm" onClick={() => openFile('project')}>
              <Folder className="h-3.5 w-3.5" />
              <span className="ml-1.5 text-xs">Project hooks.json</span>
              <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && entries.length === 0 && !error && (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No hooks configured.
              <br />
              Click <strong>User hooks.json</strong> above to create one.
              <br />
              <a
                href="#"
                className="mt-3 inline-block text-xs text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(EXAMPLE_HOOK_JSON);
                  toast({ title: 'Copied', description: 'Example hook copied to clipboard.' });
                }}
              >
                Copy an example to clipboard
              </a>
            </div>
          )}

          {Array.from(grouped.entries()).map(([event, hooks]) => (
            <div key={event} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{event}</h3>
                <span className="text-xs text-muted-foreground">
                  ({hooks.length} hook{hooks.length === 1 ? '' : 's'})
                </span>
              </div>
              <div className="space-y-2">
                {hooks.map((h) => {
                  const TypeIcon = TYPE_ICON[h.type];
                  const fire = lastFireById[h.hookId] ?? h.lastFire;
                  const StatusIcon = fire ? STATUS_ICON[fire.status] : null;
                  return (
                    <div
                      key={h.hookId}
                      className={cn(
                        'flex items-start gap-3 rounded-md border border-border bg-card p-3',
                        h.disabled && 'opacity-50',
                      )}
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                        <TypeIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={h.scope === 'user' ? 'secondary' : 'default'} className="text-[10px]">
                            {h.scope}
                          </Badge>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {h.type}
                          </span>
                          {!h.trusted ? (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <ShieldAlert className="h-3 w-3" />
                              untrusted
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <ShieldCheck className="h-3 w-3" />
                              trusted
                            </span>
                          )}
                        </div>
                        <div className="mt-1 break-words font-mono text-xs text-foreground">
                          {h.summary}
                        </div>
                        {fire && StatusIcon && (
                          <div
                            className={cn(
                              'mt-2 flex items-center gap-1.5 text-xs',
                              STATUS_COLOR[fire.status],
                            )}
                          >
                            <StatusIcon className="h-3.5 w-3.5" />
                            <span className="font-medium">{fire.status}</span>
                            <span className="text-muted-foreground">
                              · {fire.durationMs}ms · {formatRelativeTime(fire.startedAt)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {!h.trusted ? (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setTrusted(h.hookId, true)}
                          >
                            Approve
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => setTrusted(h.hookId, false)}
                          >
                            Revoke
                          </Button>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">enabled</span>
                          <Switch
                            checked={!h.disabled}
                            onCheckedChange={() => toggleEnabled(h.hookId, h.disabled)}
                            disabled={!h.trusted}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Separator className="mt-4" />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

const EXAMPLE_HOOK_JSON = `{
  "hooks": {
    "PostPhaseCoding": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \\"Coding finished for spec $(jq -r .spec_id)\\""
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "https://hooks.slack.com/services/your/webhook/url",
            "if": "Task(spec=*)"
          }
        ]
      }
    ]
  }
}`;
