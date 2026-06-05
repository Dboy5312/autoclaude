/**
 * Permission-rule filter for hooks. Mirrors Claude Code's `if:` clause but
 * scoped to the events AutoClaude actually emits in v1. Patterns supported:
 *
 *   `*`                     - always match
 *   `Phase(coding)`         - match if input.phase === 'coding'
 *   `Phase(coding|qa)`      - alternation
 *   `Task(spec=004-*)`      - glob match against spec_id
 *   `Task(spec=004-foo,005-bar)` - comma list
 *   `Project(/path/**)`     - glob match against project_path
 *
 * Empty / undefined filter = always match. Unknown predicate = never match
 * (fail-closed for safety; an unrecognized rule must not silently fire).
 *
 * Pure string matching only - no spawning, no shells, no IO.
 */

import type { HookInput } from '../../shared/types/hooks';

const RULE_RE = /^\s*([A-Za-z]+)\(([^)]*)\)\s*$/;

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = escaped.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.');
  return new RegExp(`^${re}$`);
}

function matchesAny(value: string | undefined, patterns: string[]): boolean {
  if (value === undefined) return false;
  return patterns.some((p) => globToRegex(p).test(value));
}

function parseKeyValueArg(args: string): { key: string; values: string[] } | null {
  const eq = args.indexOf('=');
  if (eq < 0) return null;
  const key = args.slice(0, eq).trim();
  const list = args
    .slice(eq + 1)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!key || list.length === 0) return null;
  return { key, values: list };
}

export function hookFilterMatches(filter: string | undefined, input: HookInput): boolean {
  if (!filter || filter.trim() === '' || filter.trim() === '*') return true;

  const m = RULE_RE.exec(filter);
  if (!m) return false;

  const predicate = m[1];
  const args = (m[2] ?? '').trim();

  switch (predicate) {
    case 'Phase': {
      const allowed = args.split('|').map((s) => s.trim()).filter(Boolean);
      return allowed.includes(input.phase ?? '');
    }
    case 'Task': {
      const kv = parseKeyValueArg(args);
      if (!kv) return false;
      switch (kv.key) {
        case 'spec':
          return matchesAny(input.spec_id, kv.values);
        case 'session':
          return matchesAny(input.session_id, kv.values);
        default:
          return false;
      }
    }
    case 'Project': {
      return matchesAny(input.project_path, [args]);
    }
    default:
      return false;
  }
}
