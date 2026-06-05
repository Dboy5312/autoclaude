import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, CustomMcpServer } from '../../shared/types';
import type { LoadedPlugin } from '../../shared/types/plugin';
import { PluginManager } from '../plugins/manager';

export function registerPluginHandlers(manager: PluginManager): void {
  ipcMain.handle(
    IPC_CHANNELS.PLUGINS_LIST,
    (): IPCResult<LoadedPlugin[]> => ({ success: true, data: manager.list() }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PLUGINS_RELOAD,
    (): IPCResult<LoadedPlugin[]> => ({ success: true, data: manager.reload() }),
  );

  ipcMain.handle(
    IPC_CHANNELS.PLUGINS_TOGGLE,
    (_e, pluginId: string): IPCResult<{ enabled: boolean }> => {
      const r = manager.toggle(pluginId);
      return r.ok ? { success: true, data: { enabled: r.enabled } } : { success: false, error: r.error };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PLUGINS_OPEN_FOLDER,
    (): IPCResult<{ opened: boolean }> => {
      manager.openFolder();
      return { success: true, data: { opened: true } };
    },
  );

  /**
   * Return the MCP-server stencils a plugin would install (namespaced ids).
   * The renderer is responsible for merging them into the project's env
   * config — keeps the persistence path single-sourced through env-handlers.
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGINS_INSTALL_TO_PROJECT,
    (_e, pluginId: string, _projectId: string): IPCResult<{ servers: CustomMcpServer[] }> => {
      const plugin = manager.list().find((p) => p.manifest.id === pluginId);
      if (!plugin) return { success: false, error: 'Plugin not found' };
      if (plugin.loadError) return { success: false, error: 'Plugin failed to load' };
      const servers: CustomMcpServer[] = (plugin.manifest.mcpServers ?? []).map((s) => ({
        ...s,
        id: `${plugin.manifest.id}:${s.id}`,
      }));
      return { success: true, data: { servers } };
    },
  );
}
