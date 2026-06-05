/**
 * Output Styles Manager
 * =====================
 *
 * Discovers output styles at <userData>/output-styles/<style-id>.md. Each file
 * is a system-prompt suffix the user can pick to shape agent response format.
 * Frontmatter is optional. Built-ins seeded on first run.
 */

import { app, BrowserWindow, shell } from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';

export interface OutputStyle {
  id: string;
  name: string;
  description: string;
  body: string;
}

const BUILTINS: { id: string; name: string; description: string; body: string }[] = [
  { id: 'normal', name: 'Normal', description: 'Default — no style modification.', body: '' },
  {
    id: 'concise',
    name: 'Concise',
    description: 'Terse output. No preamble, no recap.',
    body:
      '## Output style: Concise\n\nKeep replies brief. Skip preamble and recap. Use bullets and short sentences. Code blocks only when essential. No emojis.',
  },
  {
    id: 'explanatory',
    name: 'Explanatory',
    description: 'Verbose — explain reasoning, trade-offs, and alternatives.',
    body:
      '## Output style: Explanatory\n\nExplain your reasoning as you work. Surface trade-offs you considered and alternatives you ruled out. Include 1-2 sentence justifications for non-obvious decisions.',
  },
  {
    id: 'markdown-tables',
    name: 'Markdown Tables',
    description: 'Prefer markdown tables for comparisons and config.',
    body:
      '## Output style: Markdown Tables\n\nUse markdown tables whenever comparing options, listing config, or summarizing results. Prefer tables to bulleted lists when items share columns.',
  },
  {
    id: 'junior-friendly',
    name: 'Junior-Friendly',
    description: 'Assume the reader is a junior engineer; define jargon.',
    body:
      "## Output style: Junior-Friendly\n\nAssume the reader is a junior engineer new to this codebase. Define jargon and acronyms inline on first use. Link to docs / files when referencing concepts. Don't be condescending — explain, don't lecture.",
  },
];

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

function parseHeader(raw: string): { name?: string; description?: string; body: string } {
  const m = raw.match(FRONTMATTER_RE);
  if (m) {
    const fields: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i === -1) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      if (k) fields[k] = v;
    }
    return { name: fields.name, description: fields.description, body: m[2] ?? '' };
  }
  return { body: raw };
}

export class OutputStylesManager {
  private dir: string;
  private getMainWindow: () => BrowserWindow | null;
  private styles: OutputStyle[] = [];

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
    this.dir = path.join(app.getPath('userData'), 'output-styles');
  }

  ensureDir(): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      for (const b of BUILTINS) {
        const file = path.join(this.dir, `${b.id}.md`);
        if (existsSync(file)) continue;
        const content = `---\nname: ${b.name}\ndescription: ${b.description}\n---\n\n${b.body}\n`;
        writeFileSync(file, content, 'utf-8');
      }
    } catch (e) {
      console.error('[OutputStylesManager] Failed to seed:', e);
    }
  }

  reload(): OutputStyle[] {
    this.ensureDir();
    const out: OutputStyle[] = [];
    let entries: string[];
    try {
      entries = readdirSync(this.dir);
    } catch {
      this.styles = [];
      return this.styles;
    }
    for (const name of entries) {
      if (!name.endsWith('.md')) continue;
      const filePath = path.join(this.dir, name);
      const id = name.slice(0, -3);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const { name: hName, description, body } = parseHeader(raw);
        out.push({ id, name: hName ?? id, description: description ?? '', body: body.trim() });
      } catch (e) {
        console.error(`[OutputStylesManager] Failed to read ${filePath}:`, e);
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    this.styles = out;
    this.broadcast();
    return out;
  }

  list(): OutputStyle[] {
    return this.styles;
  }

  getById(id: string): OutputStyle | undefined {
    return this.styles.find((s) => s.id === id);
  }

  openFolder(): void {
    this.ensureDir();
    shell.openPath(this.dir);
  }

  private broadcast(): void {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.OUTPUT_STYLES_CHANGED, this.styles);
    }
  }
}
