import { ipcMain, app, shell } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { OutputStylesManager, type OutputStyle } from '../output-styles/manager';

export function registerOutputStyleHandlers(manager: OutputStylesManager): void {
  ipcMain.handle(
    IPC_CHANNELS.OUTPUT_STYLES_LIST,
    (): IPCResult<OutputStyle[]> => ({ success: true, data: manager.list() }),
  );
  ipcMain.handle(
    IPC_CHANNELS.OUTPUT_STYLES_RELOAD,
    (): IPCResult<OutputStyle[]> => ({ success: true, data: manager.reload() }),
  );
  ipcMain.handle(
    IPC_CHANNELS.OUTPUT_STYLES_OPEN_FOLDER,
    (): IPCResult<{ opened: boolean }> => {
      manager.openFolder();
      return { success: true, data: { opened: true } };
    },
  );
}

// ============================================================================
// Persona / SOUL.md — single global file with a custom system-prompt prefix.
// ============================================================================

function soulPath(): string {
  return path.join(app.getPath('userData'), 'SOUL.md');
}

export function registerPersonaHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.PERSONA_GET,
    (): IPCResult<{ content: string }> => {
      try {
        const p = soulPath();
        if (!existsSync(p)) return { success: true, data: { content: '' } };
        return { success: true, data: { content: readFileSync(p, 'utf-8') } };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PERSONA_SAVE,
    (_e, content: string): IPCResult<{ saved: true }> => {
      try {
        const p = soulPath();
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, content, 'utf-8');
        return { success: true, data: { saved: true } };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  );
  ipcMain.handle(
    `${IPC_CHANNELS.PERSONA_GET}:openFolder`,
    (): IPCResult<{ opened: boolean }> => {
      shell.openPath(path.dirname(soulPath()));
      return { success: true, data: { opened: true } };
    },
  );
}

// ============================================================================
// Global agent instructions — AGENT_INSTRUCTIONS.md, prepended to ALL pipeline
// phases (planning/coding/QA). Safe to use because pipeline phases consume
// instructions like a global CLAUDE.md; no response-shaping side effects.
// ============================================================================

function agentInstructionsPath(): string {
  return path.join(app.getPath('userData'), 'AGENT_INSTRUCTIONS.md');
}

export function registerAgentInstructionsHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.AGENT_INSTRUCTIONS_GET,
    (): IPCResult<{ content: string }> => {
      try {
        const p = agentInstructionsPath();
        if (!existsSync(p)) return { success: true, data: { content: '' } };
        return { success: true, data: { content: readFileSync(p, 'utf-8') } };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.AGENT_INSTRUCTIONS_SAVE,
    (_e, content: string): IPCResult<{ saved: true }> => {
      try {
        const p = agentInstructionsPath();
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, content, 'utf-8');
        return { success: true, data: { saved: true } };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  );
}
