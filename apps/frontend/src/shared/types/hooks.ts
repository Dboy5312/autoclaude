import { z } from 'zod';
import { HOOK_EVENTS } from '../constants/hooks';
import type { HookEvent, HookScope } from '../constants/hooks';

/**
 * Zod schema for the hooks system. Borrows shape from Claude Code v2.1.88's
 * `src/schemas/hooks.ts` — same JSON-on-stdin contract, exit-code semantics,
 * and three-level nesting (event → matcher → hook command). Adapted for
 * AutoClaude's smaller v1 scope: 12 events, three hook types (no `agent`).
 */

const IfFilter = z
  .string()
  .optional()
  .describe(
    'Permission-rule-style filter. v1 supports: `Phase(<name>)`, ' +
      '`Task(spec=<glob>)`, `*` (always match). Empty = always match.',
  );

const StatusMessage = z.string().max(120).optional();

const CommandHookSchema = z.object({
  type: z.literal('command'),
  command: z.string().min(1),
  if: IfFilter,
  shell: z.enum(['bash', 'powershell']).optional(),
  /** ms; capped at HOOK_MAX_TIMEOUTS.command. */
  timeout: z.number().int().positive().max(60_000).default(10_000),
  once: z.boolean().optional(),
  async: z.boolean().optional(),
  statusMessage: StatusMessage,
});

const PromptHookSchema = z.object({
  type: z.literal('prompt'),
  prompt: z.string().min(1),
  if: IfFilter,
  model: z.string().optional(),
  timeout: z.number().int().positive().max(120_000).default(30_000),
  once: z.boolean().optional(),
  statusMessage: StatusMessage,
});

const HttpHookSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  if: IfFilter,
  headers: z.record(z.string(), z.string()).optional(),
  /** Names of process env vars allowed to be forwarded into the body. */
  allowedEnvVars: z.array(z.string()).optional(),
  timeout: z.number().int().positive().max(30_000).default(10_000),
  once: z.boolean().optional(),
  statusMessage: StatusMessage,
});

export const HookCommandSchema = z.discriminatedUnion('type', [
  CommandHookSchema,
  PromptHookSchema,
  HttpHookSchema,
]);
export type HookCommand = z.infer<typeof HookCommandSchema>;

export const HookMatcherSchema = z.object({
  /** Optional glob/regex against extra event keys (currently unused — reserved
   * for v2 tool-use hooks where matcher would target tool name). */
  matcher: z.string().optional(),
  hooks: z.array(HookCommandSchema).min(1),
});
export type HookMatcher = z.infer<typeof HookMatcherSchema>;

export const HooksConfigSchema = z.object({
  hooks: z
    .partialRecord(z.enum(HOOK_EVENTS), z.array(HookMatcherSchema))
    .default({}),
});
export type HooksConfig = z.infer<typeof HooksConfigSchema>;

/** Payload passed to hooks on stdin. Always JSON. */
export interface HookInput {
  hook_event_name: HookEvent;
  /** ISO 8601 timestamp the event fired. */
  timestamp: string;
  /** AutoClaude session/task id (the spec id). Empty for non-task events. */
  session_id?: string;
  spec_id?: string;
  /** Project root (the working directory the hook was registered for). */
  project_path?: string;
  /** Worktree path if the task uses isolation. */
  worktree_path?: string;
  /** Phase name (only on phase events). */
  phase?: string;
  /** Phase status: `started` / `completed` / `failed`. */
  phase_status?: 'started' | 'completed' | 'failed';
  cwd?: string;
  user?: string;
  /** Free-form payload extension (e.g. PR url for `PRCreated`). */
  extra?: Record<string, unknown>;
}

/** Optional response shape on stdout (command/prompt hooks). */
export interface HookResponse {
  continue?: boolean;
  suppressOutput?: boolean;
  hookSpecificOutput?: {
    additionalContext?: string;
    [k: string]: unknown;
  };
}

/** Result of running a single hook (for IPC broadcast + UI badge). */
export interface HookFireResult {
  /** SHA-256 of the hook config. Used as a stable id and trust key. */
  hookId: string;
  scope: HookScope;
  event: HookEvent;
  status: 'success' | 'blocked' | 'timeout' | 'error' | 'untrusted' | 'skipped';
  exitCode: number | null;
  durationMs: number;
  message?: string;
  /** stderr captured if non-success. Truncated to 4KB for IPC. */
  stderr?: string;
  startedAt: string;
}

/** Lightweight projection of a configured hook for the UI listing. */
export interface HookListEntry {
  hookId: string;
  scope: HookScope;
  event: HookEvent;
  type: HookCommand['type'];
  summary: string;
  /** Was this hook approved by the user? */
  trusted: boolean;
  /** User toggled disabled? Disabled hooks never fire. */
  disabled: boolean;
  /** Last fire (or null if never fired this session). */
  lastFire?: HookFireResult;
}

export type { HookEvent, HookScope };
