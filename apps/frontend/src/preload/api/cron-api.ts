import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import type {
  ScheduledTask,
  CreateScheduledTaskInput,
  UpdateScheduledTaskInput,
} from '../../shared/types/scheduled-task';

export interface CronFiredPayload {
  scheduledTaskId: string;
  scheduledTaskName: string;
  projectId: string;
  prompt: string;
  autoStart: boolean;
  firedAt: string;
}

export interface CronAPI {
  cron: {
    list: () => Promise<IPCResult<ScheduledTask[]>>;
    create: (input: CreateScheduledTaskInput) => Promise<IPCResult<ScheduledTask>>;
    update: (id: string, patch: UpdateScheduledTaskInput) => Promise<IPCResult<ScheduledTask>>;
    remove: (id: string) => Promise<IPCResult<{ removed: boolean }>>;
    toggle: (id: string) => Promise<IPCResult<ScheduledTask>>;
    fireNow: (id: string) => Promise<IPCResult<{ fired: true }>>;
    validate: (cron: string) => Promise<IPCResult<{ nextRunAt: string }>>;
    onChanged: (cb: (tasks: ScheduledTask[]) => void) => () => void;
    onFired: (cb: (payload: CronFiredPayload) => void) => () => void;
  };
}

export const createCronAPI = (): CronAPI => ({
  cron: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.CRON_LIST),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.CRON_CREATE, input),
    update: (id, patch) => ipcRenderer.invoke(IPC_CHANNELS.CRON_UPDATE, id, patch),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.CRON_DELETE, id),
    toggle: (id) => ipcRenderer.invoke(IPC_CHANNELS.CRON_TOGGLE, id),
    fireNow: (id) => ipcRenderer.invoke(IPC_CHANNELS.CRON_FIRE_NOW, id),
    validate: (cron) => ipcRenderer.invoke(IPC_CHANNELS.CRON_VALIDATE_EXPRESSION, cron),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, tasks: ScheduledTask[]) => cb(tasks);
      ipcRenderer.on(IPC_CHANNELS.CRON_CHANGED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CRON_CHANGED, handler);
    },
    onFired: (cb) => {
      const handler = (_e: IpcRendererEvent, payload: CronFiredPayload) => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.CRON_FIRED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CRON_FIRED, handler);
    },
  },
});
