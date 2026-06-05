import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, CustomMcpServer } from '../../shared/types';
import type { LoadedPlugin } from '../../shared/types/plugin';

export interface PluginAPI {
  plugins: {
    list: () => Promise<IPCResult<LoadedPlugin[]>>;
    reload: () => Promise<IPCResult<LoadedPlugin[]>>;
    toggle: (pluginId: string) => Promise<IPCResult<{ enabled: boolean }>>;
    installToProject: (
      pluginId: string,
      projectId: string,
    ) => Promise<IPCResult<{ servers: CustomMcpServer[] }>>;
    openFolder: () => Promise<IPCResult<{ opened: boolean }>>;
    onChanged: (cb: (plugins: LoadedPlugin[]) => void) => () => void;
  };
}

export const createPluginAPI = (): PluginAPI => ({
  plugins: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_LIST),
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_RELOAD),
    toggle: (pluginId) => ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_TOGGLE, pluginId),
    installToProject: (pluginId, projectId) =>
      ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_INSTALL_TO_PROJECT, pluginId, projectId),
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGINS_OPEN_FOLDER),
    onChanged: (cb) => {
      const handler = (_e: IpcRendererEvent, plugins: LoadedPlugin[]) => cb(plugins);
      ipcRenderer.on(IPC_CHANNELS.PLUGINS_CHANGED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PLUGINS_CHANGED, handler);
    },
  },
});
