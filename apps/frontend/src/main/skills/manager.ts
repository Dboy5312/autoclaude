/**
 * Skills Manager
 * ==============
 *
 * Discovers skills at <userData>/skills/<skill-id>/SKILL.md, parses the
 * YAML-frontmatter header, and exposes them as user-invokable capability packs.
 *
 * Frontmatter parsing is a tiny regex extractor — no YAML dep needed for the
 * simple key:value lines we expect. Lists like `allowed-tools: [a, b]` are
 * supported via a comma-split inside square brackets.
 */

import { app, BrowserWindow, shell } from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { LoadedSkill, SkillManifest } from '../../shared/types/skill';

const STATE_FILENAME = 'skill-state.json';
const SAMPLE_SKILL_DIR = 'example-skill';

interface SkillState {
  enabled: Record<string, boolean>;
}

function readState(filePath: string): SkillState {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as SkillState;
  } catch {
    return { enabled: {} };
  }
}

function writeState(filePath: string, state: SkillState): void {
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('[SkillsManager] Failed to persist state:', e);
  }
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

function parseFrontmatter(raw: string): { fields: Record<string, unknown>; body: string } {
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) return { fields: {}, body: raw };
  const header = m[1];
  const body = m[2] ?? '';
  const fields: Record<string, unknown> = {};
  for (const line of header.split(/\r?\n/)) {
    const eq = line.indexOf(':');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val: unknown = line.slice(eq + 1).trim();
    if (typeof val === 'string') {
      const s = val as string;
      if (s.startsWith('[') && s.endsWith(']')) {
        val = s
          .slice(1, -1)
          .split(',')
          .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else if (s === 'true' || s === 'false') {
        val = s === 'true';
      } else if (/^['"].*['"]$/.test(s)) {
        val = s.slice(1, -1);
      }
    }
    if (key) fields[key] = val;
  }
  return { fields, body };
}

function manifestFromFile(id: string, _dir: string, raw: string): SkillManifest {
  const { fields, body } = parseFrontmatter(raw);
  return {
    id: String(fields.id ?? id),
    name: String(fields.name ?? id),
    description: String(fields.description ?? ''),
    body: body.trim(),
    allowedTools: Array.isArray(fields['allowed-tools'])
      ? (fields['allowed-tools'] as string[])
      : undefined,
    disableModelInvocation: fields['disable-model-invocation'] === true,
    category: typeof fields.category === 'string' ? (fields.category as string) : undefined,
    homepage: typeof fields.homepage === 'string' ? (fields.homepage as string) : undefined,
  };
}

export class SkillsManager {
  private skillsDir: string;
  private stateFile: string;
  private getMainWindow: () => BrowserWindow | null;
  private skills: LoadedSkill[] = [];

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
    this.skillsDir = path.join(app.getPath('userData'), 'skills');
    this.stateFile = path.join(app.getPath('userData'), STATE_FILENAME);
  }

  ensureDir(): void {
    try {
      mkdirSync(this.skillsDir, { recursive: true });
      const examplePath = path.join(this.skillsDir, SAMPLE_SKILL_DIR);
      if (!existsSync(examplePath)) {
        mkdirSync(examplePath, { recursive: true });
        const skill = `---\nid: ${SAMPLE_SKILL_DIR}\nname: Example Skill\ndescription: Template — duplicate this folder and edit SKILL.md for your own.\ncategory: examples\nallowed-tools: [Read, Grep, Glob]\ndisable-model-invocation: false\n---\n\n# Example Skill\n\nReplace this body with your instructions. When the user clicks **Run** on this\nskill, AutoClaude pre-populates a new task with this body as the description,\nand includes the metadata in the agent's system prompt for context.\n\n## Steps\n\n1. Describe what the agent should do.\n2. Reference any required tools (Read, Grep, Bash, etc.).\n3. List the success criteria.\n`;
        writeFileSync(path.join(examplePath, 'SKILL.md'), skill, 'utf-8');
      }
    } catch (e) {
      console.error('[SkillsManager] Failed to create skills dir:', e);
    }
  }

  reload(): LoadedSkill[] {
    this.ensureDir();
    const state = readState(this.stateFile);
    const found: LoadedSkill[] = [];

    let entries: string[];
    try {
      entries = readdirSync(this.skillsDir);
    } catch {
      this.skills = [];
      return this.skills;
    }

    for (const name of entries) {
      const dir = path.join(this.skillsDir, name);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const manifestPath = path.join(dir, 'SKILL.md');
      if (!existsSync(manifestPath)) continue;
      try {
        const raw = readFileSync(manifestPath, 'utf-8');
        const manifest = manifestFromFile(name, dir, raw);
        if (!manifest.id || !manifest.name) {
          found.push({
            manifest: { id: name, name, description: '', body: '' },
            directory: dir,
            enabled: false,
            loadError: 'SKILL.md missing id or name in frontmatter',
          });
          continue;
        }
        found.push({
          manifest,
          directory: dir,
          enabled: state.enabled[manifest.id] ?? true,
        });
      } catch (e) {
        found.push({
          manifest: { id: name, name, description: '', body: '' },
          directory: dir,
          enabled: false,
          loadError: `failed to read SKILL.md: ${(e as Error).message}`,
        });
      }
    }

    found.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
    this.skills = found;
    this.broadcast();
    return found;
  }

  list(): LoadedSkill[] {
    return this.skills;
  }

  toggle(skillId: string): { ok: true; enabled: boolean } | { ok: false; error: string } {
    const s = this.skills.find((x) => x.manifest.id === skillId);
    if (!s) return { ok: false, error: 'Skill not found' };
    if (s.loadError) return { ok: false, error: 'Cannot toggle a skill that failed to load' };
    s.enabled = !s.enabled;
    const state = readState(this.stateFile);
    state.enabled[skillId] = s.enabled;
    writeState(this.stateFile, state);
    this.broadcast();
    return { ok: true, enabled: s.enabled };
  }

  createFromTemplate(input: {
    id: string;
    name: string;
    description: string;
  }): { ok: true; directory: string } | { ok: false; error: string } {
    const id = input.id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!id) return { ok: false, error: 'Invalid id' };
    const dir = path.join(this.skillsDir, id);
    if (existsSync(dir)) return { ok: false, error: 'Skill already exists' };
    try {
      mkdirSync(dir, { recursive: true });
      const body = `---\nid: ${id}\nname: ${input.name.replace(/\n/g, ' ')}\ndescription: ${input.description.replace(/\n/g, ' ')}\ndisable-model-invocation: false\n---\n\n# ${input.name}\n\n${input.description}\n\n## Steps\n\n1. Step one.\n2. Step two.\n`;
      writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf-8');
      this.reload();
      return { ok: true, directory: dir };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  openFolder(): void {
    this.ensureDir();
    shell.openPath(this.skillsDir);
  }

  buildSystemPromptSection(): string {
    const enabled = this.skills.filter(
      (s) => s.enabled && !s.loadError && !s.manifest.disableModelInvocation,
    );
    if (enabled.length === 0) return '';
    const lines = enabled.map(
      (s) => `- **${s.manifest.name}** (${s.manifest.id}): ${s.manifest.description}`,
    );
    return `\n\n## Available skills\n\nThe following user-defined skills are available. Their bodies live at <userData>/skills/<id>/SKILL.md and the user can invoke them by name.\n\n${lines.join('\n')}\n`;
  }

  private broadcast(): void {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SKILLS_CHANGED, this.skills);
    }
  }
}
