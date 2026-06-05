import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import type { LoadedSkill } from '../../shared/types/skill';

export interface OutputStyleEntry {
  id: string;
  name: string;
  description: string;
  body: string;
}

export interface SkillsExtAPI {
  skills: {
    list: () => Promise<IPCResult<LoadedSkill[]>>;
    reload: () => Promise<IPCResult<LoadedSkill[]>>;
    toggle: (id: string) => Promise<IPCResult<{ enabled: boolean }>>;
    openFolder: () => Promise<IPCResult<{ opened: boolean }>>;
    createFromTemplate: (input: {
      id: string;
      name: string;
      description: string;
    }) => Promise<IPCResult<{ directory: string }>>;
    onChanged: (cb: (skills: LoadedSkill[]) => void) => () => void;
  };
  outputStyles: {
    list: () => Promise<IPCResult<OutputStyleEntry[]>>;
    reload: () => Promise<IPCResult<OutputStyleEntry[]>>;
    openFolder: () => Promise<IPCResult<{ opened: boolean }>>;
    onChanged: (cb: (styles: OutputStyleEntry[]) => void) => () => void;
  };
  persona: {
    get: () => Promise<IPCResult<{ content: string }>>;
    save: (content: string) => Promise<IPCResult<{ saved: true }>>;
  };
  agentInstructions: {
    get: () => Promise<IPCResult<{ content: string }>>;
    save: (content: string) => Promise<IPCResult<{ saved: true }>>;
  };
}

export const createSkillsExtAPI = (): SkillsExtAPI => ({
  skills: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_LIST),
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_RELOAD),
    toggle: (id) => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_TOGGLE, id),
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_OPEN_FOLDER),
    createFromTemplate: (input) => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_CREATE_FROM_TEMPLATE, input),
    onChanged: (cb) => {
      const h = (_e: IpcRendererEvent, skills: LoadedSkill[]) => cb(skills);
      ipcRenderer.on(IPC_CHANNELS.SKILLS_CHANGED, h);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SKILLS_CHANGED, h);
    },
  },
  outputStyles: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_STYLES_LIST),
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_STYLES_RELOAD),
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_STYLES_OPEN_FOLDER),
    onChanged: (cb) => {
      const h = (_e: IpcRendererEvent, styles: OutputStyleEntry[]) => cb(styles);
      ipcRenderer.on(IPC_CHANNELS.OUTPUT_STYLES_CHANGED, h);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.OUTPUT_STYLES_CHANGED, h);
    },
  },
  persona: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.PERSONA_GET),
    save: (content) => ipcRenderer.invoke(IPC_CHANNELS.PERSONA_SAVE, content),
  },
  agentInstructions: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_INSTRUCTIONS_GET),
    save: (content) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_INSTRUCTIONS_SAVE, content),
  },
});
