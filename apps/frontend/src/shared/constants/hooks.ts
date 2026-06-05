/**
 * Hook system constants. Event names + default timeouts.
 *
 * The event set is intentionally small for v1 — only events with clean
 * insertion points in the existing pipeline. Tool-use boundaries are deferred.
 */

export const HOOK_EVENTS = [
  'PrePhasePlanning',
  'PostPhasePlanning',
  'PrePhaseCoding',
  'PostPhaseCoding',
  'PrePhaseValidation',
  'PostPhaseValidation',
  'TaskCreated',
  'TaskStarted',
  'TaskCompleted',
  'TaskStuck',
  'PRCreated',
  'WorktreeMerged',
] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

/** Default timeouts (ms) per hook type. Capped on the schema side too. */
export const HOOK_DEFAULT_TIMEOUTS = {
  command: 10_000,
  http: 10_000,
  prompt: 30_000,
} as const;

/** Hard upper bounds (ms). The schema rejects values above these. */
export const HOOK_MAX_TIMEOUTS = {
  command: 60_000,
  http: 30_000,
  prompt: 120_000,
} as const;

/** Hooks that fire in the user-global vs project-local scope. Both scopes
 * apply additively — same event in both files = both fire. */
export type HookScope = 'user' | 'project';

/** Filename used in both scopes. */
export const HOOKS_FILENAME = 'hooks.json';

/** Subdir under each project where its hooks file lives. */
export const PROJECT_HOOKS_DIR = '.auto-claude';
