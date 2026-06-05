import { app } from 'electron';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { readSettingsFile } from '../settings-utils';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { fields: {}, body: raw };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (k) fields[k] = v;
  }
  return { fields, body: m[2] ?? '' };
}

function readOutputStyleBody(styleId: string): string {
  if (!styleId || styleId === 'normal') return '';
  const file = path.join(app.getPath('userData'), 'output-styles', `${styleId}.md`);
  if (!existsSync(file)) return '';
  try {
    const raw = readFileSync(file, 'utf-8');
    const { body } = parseFrontmatter(raw);
    return body.trim();
  } catch {
    return '';
  }
}

function readTextFile(name: string): string {
  const file = path.join(app.getPath('userData'), name);
  if (!existsSync(file)) return '';
  try {
    return readFileSync(file, 'utf-8').trim();
  } catch {
    return '';
  }
}

interface SkillEntry { id: string; name: string; description: string; body: string }

function readSkillState(): { enabled: Record<string, boolean> } {
  const file = path.join(app.getPath('userData'), 'skill-state.json');
  if (!existsSync(file)) return { enabled: {} };
  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as { enabled?: Record<string, boolean> };
    return { enabled: parsed.enabled ?? {} };
  } catch {
    return { enabled: {} };
  }
}

function readEnabledSkills(): SkillEntry[] {
  const dir = path.join(app.getPath('userData'), 'skills');
  if (!existsSync(dir)) return [];
  const state = readSkillState();
  const out: SkillEntry[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { continue; }
    if (!isDir) continue;
    const skillFile = path.join(full, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    try {
      const raw = readFileSync(skillFile, 'utf-8');
      const { fields, body } = parseFrontmatter(raw);
      const id = (fields.id || name).trim();
      const enabled = state.enabled[id] !== false;
      if (!enabled) continue;
      out.push({
        id,
        name: (fields.name || id).trim(),
        description: (fields.description || '').trim(),
        body: body.trim(),
      });
    } catch {
      continue;
    }
  }
  return out;
}

function buildSkillsSection(): string {
  const skills = readEnabledSkills();
  if (skills.length === 0) return '';
  const lines: string[] = ['## Available skills'];
  lines.push(
    'You have access to the following user-defined capability packs. Apply them when their description matches the task.'
  );
  for (const s of skills) {
    lines.push(`\n### ${s.name} (\`${s.id}\`)`);
    if (s.description) lines.push(s.description);
    if (s.body) lines.push(s.body);
  }
  return lines.join('\n');
}

/**
 * Preamble for the multi-phase pipeline (planning / coding / QA).
 *
 * Safe to inject into ALL agent phases — only contains:
 *   - Enabled skill manifests (capability descriptions)
 *   - Global agent instructions from AGENT_INSTRUCTIONS.md (user-controlled, like a
 *     global CLAUDE.md)
 *
 * Output styles and the SOUL.md persona are intentionally excluded because they
 * shape response *format*, which can corrupt structured phases (planning emits
 * JSON, QA parses logs). Those go to the chat preamble instead.
 */
export function buildPipelinePreamble(): string {
  const sections: string[] = [];

  const skills = buildSkillsSection();
  if (skills) sections.push(skills);

  const globalInstructions = readTextFile('AGENT_INSTRUCTIONS.md');
  if (globalInstructions) {
    sections.push(`## Global agent instructions (AGENT_INSTRUCTIONS.md)\n\n${globalInstructions}`);
  }

  return sections.join('\n\n').trim();
}

/**
 * Preamble for the Insights chat surface.
 *
 * Only used by insights_runner.py, where free-form response shaping is safe.
 * Contains the selected output style body + SOUL.md persona.
 */
export function buildChatPreamble(): string {
  const settings = (readSettingsFile() ?? {}) as Record<string, unknown>;
  const sections: string[] = [];

  const selectedStyleId = typeof settings.selectedOutputStyleId === 'string'
    ? settings.selectedOutputStyleId
    : 'normal';
  const styleBody = readOutputStyleBody(selectedStyleId);
  if (styleBody) sections.push(styleBody);

  const persona = readTextFile('SOUL.md');
  if (persona) sections.push(`## Persona (SOUL.md)\n\n${persona}`);

  return sections.join('\n\n').trim();
}
