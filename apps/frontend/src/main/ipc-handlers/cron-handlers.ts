/**
 * Cron / Scheduled Task IPC handlers.
 *
 * The actual scheduling logic lives in `ScheduledTaskManager`. These handlers
 * are thin wrappers translating IPC requests into manager calls and shaping
 * results as `IPCResult<T>`.
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import type {
  ScheduledTask,
  CreateScheduledTaskInput,
  UpdateScheduledTaskInput,
} from '../../shared/types/scheduled-task';
import { ScheduledTaskManager } from '../scheduled-tasks/manager';

export function registerCronHandlers(manager: ScheduledTaskManager): void {
  ipcMain.handle(
    IPC_CHANNELS.CRON_LIST,
    (): IPCResult<ScheduledTask[]> => ({ success: true, data: manager.list() }),
  );

  ipcMain.handle(
    IPC_CHANNELS.CRON_CREATE,
    (_e, input: CreateScheduledTaskInput): IPCResult<ScheduledTask> => {
      const r = manager.create(input);
      return r.ok ? { success: true, data: r.task } : { success: false, error: r.error };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CRON_UPDATE,
    (_e, id: string, patch: UpdateScheduledTaskInput): IPCResult<ScheduledTask> => {
      const r = manager.update(id, patch);
      return r.ok ? { success: true, data: r.task } : { success: false, error: r.error };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CRON_DELETE,
    (_e, id: string): IPCResult<{ removed: boolean }> => {
      const removed = manager.remove(id);
      return { success: true, data: { removed } };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CRON_TOGGLE,
    (_e, id: string): IPCResult<ScheduledTask> => {
      const r = manager.toggle(id);
      return r.ok ? { success: true, data: r.task } : { success: false, error: r.error };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CRON_FIRE_NOW,
    (_e, id: string): IPCResult<{ fired: true }> => {
      const r = manager.fireNow(id);
      return r.ok ? { success: true, data: { fired: true } } : { success: false, error: r.error };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CRON_VALIDATE_EXPRESSION,
    (_e, expression: string): IPCResult<{ nextRunAt: string }> => {
      const r = manager.validateExpression(expression);
      return r.ok ? { success: true, data: { nextRunAt: r.nextRunAt } } : { success: false, error: r.error };
    },
  );
}
