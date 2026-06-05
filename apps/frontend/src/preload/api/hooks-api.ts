import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  IPCResult,
  HookListEntry,
  HookScope,
  HookFireResult,
} from '../../shared/types';

export interface HooksAPI {
  hooks: {
    list: (projectPath?: string) => Promise<IPCResult<HookListEntry[]>>;
    reload: (projectPath?: string) => Promise<IPCResult>;
    toggle: (hookId: string, disabled: boolean) => Promise<IPCResult>;
    trust: (hookId: string, approve: boolean) => Promise<IPCResult>;
    openFile: (
      scope: HookScope,
      projectPath?: string,
    ) => Promise<IPCResult<{ path: string }>>;
    onHookFired: (cb: (result: HookFireResult) => void) => () => void;
    onTrustRequired: (
      cb: (info: {
        hookId: string;
        scope: HookScope;
        event: string;
        type: 'command' | 'http' | 'prompt';
      }) => void,
    ) => () => void;
  };
}

export const createHooksAPI = (): HooksAPI => ({
  hooks: {
    list: (projectPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.HOOKS_LIST, projectPath),
    reload: (projectPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.HOOKS_RELOAD, projectPath),
    toggle: (hookId: string, disabled: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.HOOKS_TOGGLE, hookId, disabled),
    trust: (hookId: string, approve: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.HOOKS_TRUST, hookId, approve),
    openFile: (scope: HookScope, projectPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.HOOKS_OPEN_FILE, scope, projectPath),
    onHookFired: (cb) => {
      const listener = (_e: unknown, result: HookFireResult) => cb(result);
      ipcRenderer.on(IPC_CHANNELS.HOOK_FIRED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.HOOK_FIRED, listener);
    },
    onTrustRequired: (cb) => {
      const listener = (_e: unknown, info: Parameters<typeof cb>[0]) => cb(info);
      ipcRenderer.on(IPC_CHANNELS.HOOK_TRUST_REQUIRED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.HOOK_TRUST_REQUIRED, listener);
    },
  },
});
