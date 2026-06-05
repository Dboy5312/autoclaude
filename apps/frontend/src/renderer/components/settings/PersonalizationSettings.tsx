import { useEffect, useState } from 'react';
import { FolderOpen, Save, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useToast } from '../../hooks/use-toast';
import type { AppSettings } from '../../../shared/types/settings';

interface OutputStyle { id: string; name: string; description: string; body: string }

interface Props {
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
}

export function PersonalizationSettings({ settings, onSettingsChange }: Props) {
  const { toast } = useToast();
  const [styles, setStyles] = useState<OutputStyle[]>([]);
  const [persona, setPersona] = useState('');
  const [agentInstructions, setAgentInstructions] = useState('');
  const [loadingPersona, setLoadingPersona] = useState(true);
  const [loadingInstructions, setLoadingInstructions] = useState(true);
  const [savingPersona, setSavingPersona] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [reloadingStyles, setReloadingStyles] = useState(false);

  const loadStyles = async () => {
    const r = await window.electronAPI.outputStyles.list();
    if (r.success) setStyles(r.data ?? []);
  };

  const loadPersona = async () => {
    setLoadingPersona(true);
    const r = await window.electronAPI.persona.get();
    if (r.success) setPersona(r.data?.content ?? '');
    setLoadingPersona(false);
  };

  const loadInstructions = async () => {
    setLoadingInstructions(true);
    const r = await window.electronAPI.agentInstructions.get();
    if (r.success) setAgentInstructions(r.data?.content ?? '');
    setLoadingInstructions(false);
  };

  useEffect(() => {
    loadStyles();
    loadPersona();
    loadInstructions();
    const unsub = window.electronAPI.outputStyles.onChanged((s) => setStyles(s));
    return () => unsub();
  }, []);

  const reloadStyles = async () => {
    setReloadingStyles(true);
    const minDuration = new Promise((r) => setTimeout(r, 400));
    const r = await window.electronAPI.outputStyles.reload();
    await minDuration;
    setReloadingStyles(false);
    if (r.success) {
      setStyles(r.data ?? []);
      toast({ title: 'Output styles reloaded', description: `${r.data?.length ?? 0} style(s) found.` });
    }
  };

  const savePersona = async () => {
    setSavingPersona(true);
    const r = await window.electronAPI.persona.save(persona);
    setSavingPersona(false);
    if (r.success) {
      toast({ title: 'Persona saved', description: 'SOUL.md updated.' });
    } else {
      toast({ title: 'Save failed', description: r.error, variant: 'destructive' });
    }
  };

  const saveInstructions = async () => {
    setSavingInstructions(true);
    const r = await window.electronAPI.agentInstructions.save(agentInstructions);
    setSavingInstructions(false);
    if (r.success) {
      toast({ title: 'Instructions saved', description: 'AGENT_INSTRUCTIONS.md updated.' });
    } else {
      toast({ title: 'Save failed', description: r.error, variant: 'destructive' });
    }
  };

  const selectedStyleId = settings.selectedOutputStyleId ?? 'normal';
  const selectedStyle = styles.find((s) => s.id === selectedStyleId);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-semibold mb-1">Personalization</h2>
        <p className="text-sm text-muted-foreground">
          Two scopes: <strong>Insights chat</strong> (free-form replies — safe to shape tone/format)
          and <strong>Agent pipeline</strong> (planning/coding/QA — must stay structured).
        </p>
      </div>

      {/* ===== Insights chat ===== */}
      <div className="space-y-6">
        <div className="border-l-2 border-primary/40 pl-3">
          <h3 className="text-sm font-semibold">Insights chat</h3>
          <p className="text-xs text-muted-foreground">
            Applies only to the Insights chat surface. Does NOT touch task pipelines.
          </p>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base">Output style</Label>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={reloadStyles}
                disabled={reloadingStyles}
              >
                {reloadingStyles ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Reload
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.electronAPI.outputStyles.openFolder()}
              >
                <FolderOpen className="h-4 w-4 mr-1" />
                Open folder
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Shapes Insights-chat response format. Drop a markdown file in the styles folder to add your own.
          </p>
          <Select
            value={selectedStyleId}
            onValueChange={(v) => onSettingsChange({ ...settings, selectedOutputStyleId: v })}
          >
            <SelectTrigger><SelectValue placeholder="Select style" /></SelectTrigger>
            <SelectContent>
              {styles.length === 0 ? (
                <SelectItem value="normal" disabled>No styles loaded</SelectItem>
              ) : (
                styles.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="font-medium">{s.name}</span>
                    {s.description && (
                      <span className="text-muted-foreground ml-2 text-xs">— {s.description}</span>
                    )}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {selectedStyle && selectedStyle.body && (
            <pre className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded p-2 whitespace-pre-wrap font-mono max-h-32 overflow-auto">
              {selectedStyle.body}
            </pre>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="persona" className="text-base">Persona (SOUL.md)</Label>
            <Button size="sm" onClick={savePersona} disabled={savingPersona || loadingPersona}>
              {savingPersona ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Persistent persona/identity appended to Insights chat. Leave blank to disable.
          </p>
          <Textarea
            id="persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={8}
            placeholder="You are a thoughtful, terse senior engineer who..."
            className="font-mono text-xs"
            disabled={loadingPersona}
          />
        </section>
      </div>

      {/* ===== Agent pipeline ===== */}
      <div className="space-y-6">
        <div className="border-l-2 border-amber-500/50 pl-3">
          <h3 className="text-sm font-semibold">Agent pipeline (planning, coding, QA)</h3>
          <p className="text-xs text-muted-foreground">
            Applies to every task spawn. Keep it factual — preferences, conventions, constraints.
            Avoid output-formatting directives (they can break structured phases like spec/QA).
          </p>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="agent-instructions" className="text-base">
              Global agent instructions (AGENT_INSTRUCTIONS.md)
            </Label>
            <Button size="sm" onClick={saveInstructions} disabled={savingInstructions || loadingInstructions}>
              {savingInstructions ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Prepended to every pipeline phase, similar to a global CLAUDE.md. Good for things like:
            "Prefer TypeScript over JavaScript when both work" or "Always add a brief docstring to new functions".
          </p>
          <Textarea
            id="agent-instructions"
            value={agentInstructions}
            onChange={(e) => setAgentInstructions(e.target.value)}
            rows={10}
            placeholder={'# Global agent instructions\n\n- Prefer existing patterns in the codebase over introducing new ones.\n- Run the relevant tests before declaring a task done.'}
            className="font-mono text-xs"
            disabled={loadingInstructions}
          />
        </section>

        <section className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Skills</strong> — enabled skills are also injected here (capability descriptions,
            not response-shaping). Manage them in the <em>Skills</em> sidebar (shortcut: E).
          </p>
        </section>
      </div>
    </div>
  );
}
