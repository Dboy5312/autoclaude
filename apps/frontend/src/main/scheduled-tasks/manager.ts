/**
 * Scheduled Task Manager
 * ======================
 *
 * Persists user-defined cron schedules at <userData>/scheduled_tasks.json and
 * polls every second for due tasks. When a task is due, it creates a regular
 * AutoClaude task (and optionally auto-starts it) by calling into the existing
 * IPC `task:create` path.
 *
 * Design notes:
 * - 1-second polling is plenty for minute-granularity cron; matches the
 *   pattern from Claude Code's scheduler.
 * - A 60-second `lastFiredAt` floor prevents a task from firing multiple
 *   times within the same minute (cron minimum granularity).
 * - Failures are recorded in `lastError` so the UI can surface them; tasks
 *   keep running on their schedule regardless.
 */

import { app, BrowserWindow } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  ScheduledTask,
  CreateScheduledTaskInput,
  UpdateScheduledTaskInput,
} from '../../shared/types/scheduled-task';

const TICK_INTERVAL_MS = 1000;
const MIN_FIRE_GAP_MS = 60_000;

function newId(): string {
  return `sched-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class ScheduledTaskManager {
  private filePath: string;
  private tasks: Map<string, ScheduledTask> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private getMainWindow: () => BrowserWindow | null;

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
    this.filePath = path.join(app.getPath('userData'), 'scheduled_tasks.json');
  }

  load(): void {
    try {
      if (!existsSync(this.filePath)) {
        mkdirSync(path.dirname(this.filePath), { recursive: true });
        writeFileSync(this.filePath, '[]', 'utf-8');
      }
      const raw = readFileSync(this.filePath, 'utf-8');
      const arr = JSON.parse(raw) as ScheduledTask[];
      this.tasks.clear();
      for (const t of arr) this.tasks.set(t.id, t);
      this.recomputeAllNextRun();
    } catch (e) {
      console.error('[ScheduledTaskManager] Failed to load:', e);
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  list(): ScheduledTask[] {
    return Array.from(this.tasks.values()).sort((a, b) =>
      (a.nextRunAt ?? '￿').localeCompare(b.nextRunAt ?? '￿'),
    );
  }

  create(input: CreateScheduledTaskInput): { ok: true; task: ScheduledTask } | { ok: false; error: string } {
    if (!input.cron.trim()) return { ok: false, error: 'Cron expression is required' };
    try {
      CronExpressionParser.parse(input.cron);
    } catch (e) {
      return { ok: false, error: `Invalid cron: ${(e as Error).message}` };
    }
    if (!input.prompt.trim()) return { ok: false, error: 'Prompt is required' };
    if (!input.projectId) return { ok: false, error: 'Project is required' };

    const task: ScheduledTask = {
      id: newId(),
      name: input.name.trim() || `Scheduled (${input.cron})`,
      cron: input.cron,
      prompt: input.prompt,
      projectId: input.projectId,
      recurring: input.recurring,
      autoStart: input.autoStart,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    task.nextRunAt = this.computeNextRunIso(task);
    this.tasks.set(task.id, task);
    this.persist();
    this.broadcastChanged();
    return { ok: true, task };
  }

  update(
    id: string,
    patch: UpdateScheduledTaskInput,
  ): { ok: true; task: ScheduledTask } | { ok: false; error: string } {
    const existing = this.tasks.get(id);
    if (!existing) return { ok: false, error: 'Not found' };
    if (patch.cron) {
      try {
        CronExpressionParser.parse(patch.cron);
      } catch (e) {
        return { ok: false, error: `Invalid cron: ${(e as Error).message}` };
      }
    }
    const updated: ScheduledTask = { ...existing, ...patch };
    updated.nextRunAt = this.computeNextRunIso(updated);
    this.tasks.set(id, updated);
    this.persist();
    this.broadcastChanged();
    return { ok: true, task: updated };
  }

  remove(id: string): boolean {
    const removed = this.tasks.delete(id);
    if (removed) {
      this.persist();
      this.broadcastChanged();
    }
    return removed;
  }

  toggle(id: string): { ok: true; task: ScheduledTask } | { ok: false; error: string } {
    const existing = this.tasks.get(id);
    if (!existing) return { ok: false, error: 'Not found' };
    const updated: ScheduledTask = { ...existing, enabled: !existing.enabled };
    updated.nextRunAt = updated.enabled ? this.computeNextRunIso(updated) : undefined;
    this.tasks.set(id, updated);
    this.persist();
    this.broadcastChanged();
    return { ok: true, task: updated };
  }

  validateExpression(cron: string): { ok: true; nextRunAt: string } | { ok: false; error: string } {
    try {
      const it = CronExpressionParser.parse(cron);
      return { ok: true, nextRunAt: it.next().toDate().toISOString() };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Fire a task immediately, regardless of schedule. */
  fireNow(id: string): { ok: true } | { ok: false; error: string } {
    const task = this.tasks.get(id);
    if (!task) return { ok: false, error: 'Not found' };
    try {
      this.fire(task);
      task.lastFiredAt = new Date().toISOString();
      this.persist();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  // ============ internals ============

  private async tick(): Promise<void> {
    const now = Date.now();
    for (const task of Array.from(this.tasks.values())) {
      if (!task.enabled) continue;
      if (!task.nextRunAt) {
        task.nextRunAt = this.computeNextRunIso(task);
        continue;
      }
      const due = new Date(task.nextRunAt).getTime();
      if (now < due) continue;

      // 60-second floor protects against double-fire within a single cron tick
      if (task.lastFiredAt) {
        const sinceLast = now - new Date(task.lastFiredAt).getTime();
        if (sinceLast < MIN_FIRE_GAP_MS) continue;
      }

      try {
        this.fire(task);
      } catch (e) {
        console.error(`[ScheduledTaskManager] Fire failed for ${task.id}:`, e);
        task.lastError = (e as Error).message;
      }

      if (!task.recurring) {
        this.tasks.delete(task.id);
      } else {
        task.lastFiredAt = new Date(now).toISOString();
        task.nextRunAt = this.computeNextRunIso(task);
        task.lastError = undefined;
      }
    }
    this.persist();
    this.broadcastChanged();
  }

  private fire(task: ScheduledTask): void {
    // We delegate the actual task-creation to the renderer (it owns the task
    // store + UI state). The manager just emits a fire event with the payload;
    // the renderer subscribes and calls its existing createTask + startTask.
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) {
      throw new Error('No active window to handle scheduled fire');
    }
    win.webContents.send(IPC_CHANNELS.CRON_FIRED, {
      scheduledTaskId: task.id,
      scheduledTaskName: task.name,
      projectId: task.projectId,
      prompt: task.prompt,
      autoStart: task.autoStart,
      firedAt: new Date().toISOString(),
    });
  }

  private computeNextRunIso(task: ScheduledTask): string | undefined {
    try {
      return CronExpressionParser.parse(task.cron).next().toDate().toISOString();
    } catch {
      return undefined;
    }
  }

  private recomputeAllNextRun(): void {
    for (const t of this.tasks.values()) {
      t.nextRunAt = this.computeNextRunIso(t);
    }
  }

  private persist(): void {
    try {
      const arr = Array.from(this.tasks.values());
      writeFileSync(this.filePath, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (e) {
      console.error('[ScheduledTaskManager] Persist failed:', e);
    }
  }

  private broadcastChanged(): void {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.CRON_CHANGED, this.list());
    }
  }
}
