/**
 * Scheduled task — fires on a cron schedule, creating a regular AutoClaude task.
 *
 * Persisted at `<userData>/scheduled_tasks.json`. The main-process
 * ScheduledTaskManager polls every second, computes the next run for each enabled
 * task, and when due creates a fresh Task with `prompt` as the description (and
 * optionally auto-starts it).
 */
export interface ScheduledTask {
  /** Unique id (uuid-style). */
  id: string;
  /** User-friendly label shown in the UI. */
  name: string;
  /** 5-field cron expression, e.g. `0 9 * * 1` for Mondays 9am. */
  cron: string;
  /** Description / prompt fed to the agent when the task fires. */
  prompt: string;
  /** The project under which to create the task. */
  projectId: string;
  /** True = fires on every cron match. False = fires once, then auto-deletes. */
  recurring: boolean;
  /** Auto-kick the agent the moment a task is created. */
  autoStart: boolean;
  /** Disabled tasks are kept in the list but never fire. */
  enabled: boolean;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp of the most recent fire (for idempotency + display). */
  lastFiredAt?: string;
  /** ISO timestamp of the next scheduled fire (cached; recomputed on each tick). */
  nextRunAt?: string;
  /** ISO timestamp of last error, if firing failed. */
  lastError?: string;
}

/** Payload sent to cron:create. */
export interface CreateScheduledTaskInput {
  name: string;
  cron: string;
  prompt: string;
  projectId: string;
  recurring: boolean;
  autoStart: boolean;
}

/** Payload sent to cron:update — all fields optional. */
export type UpdateScheduledTaskInput = Partial<
  Omit<ScheduledTask, 'id' | 'createdAt' | 'lastFiredAt' | 'lastError'>
>;
