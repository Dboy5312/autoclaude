import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import type { LoadedSkill } from '../../shared/types/skill';
import { SkillsManager } from '../skills/manager';

export function registerSkillHandlers(manager: SkillsManager): void {
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_LIST,
    (): IPCResult<LoadedSkill[]> => ({ success: true, data: manager.list() }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILLS_RELOAD,
    (): IPCResult<LoadedSkill[]> => ({ success: true, data: manager.reload() }),
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILLS_TOGGLE,
    (_e, id: string): IPCResult<{ enabled: boolean }> => {
      const r = manager.toggle(id);
      return r.ok ? { success: true, data: { enabled: r.enabled } } : { success: false, error: r.error };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILLS_OPEN_FOLDER,
    (): IPCResult<{ opened: boolean }> => {
      manager.openFolder();
      return { success: true, data: { opened: true } };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILLS_CREATE_FROM_TEMPLATE,
    (_e, input: { id: string; name: string; description: string }): IPCResult<{ directory: string }> => {
      const r = manager.createFromTemplate(input);
      return r.ok ? { success: true, data: { directory: r.directory } } : { success: false, error: r.error };
    },
  );
}
