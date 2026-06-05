import { ipcMain, shell } from 'electron';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, HookListEntry, HookScope } from '../../shared/types';
import { hooksLoader } from '../hooks/hooks-loader';
import { trustStore } from '../hooks/hook-trust';

const HOOKS_STARTER_TEMPLATE = `{
  "_help": "AutoClaude hooks file. Each event maps to an array of matchers; each matcher has hooks. See https://docs.autoclaude.dev/hooks for full schema.",
  "hooks": {
    "PostPhaseCoding": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \\"Coding finished for $(jq -r .spec_id) at $(date)\\""
          }
        ]
      }
    ]
  }
}
`;

/**
 * IPC handlers for the hooks UI: list active hooks, toggle disabled, approve
 * trust, reload from disk, open the hooks.json file in the OS editor.
 *
 * Hook firing itself happens directly inside agent-events-handlers,
 * task-state-manager, and worktree-handlers — those modules call fireHooks()
 * from hooks-runner. This file is just for the renderer-facing CRUD-style API.
 */
export function registerHooksHandlers(): void {
  // One-time init. Loader sets up its own user-scope chokidar watcher.
  hooksLoader.init();

  ipcMain.handle(
    IPC_CHANNELS.HOOKS_LIST,
    async (_e, projectPath?: string): Promise<IPCResult<HookListEntry[]>> => {
      try {
        return { success: true, data: hooksLoader.list(projectPath) };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'list failed' };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HOOKS_RELOAD,
    async (_e, projectPath?: string): Promise<IPCResult> => {
      try {
        hooksLoader.reloadUser();
        if (projectPath) hooksLoader.reloadProject(projectPath);
        return { success: true };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'reload failed' };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HOOKS_TOGGLE,
    async (_e, hookId: string, disabled: boolean): Promise<IPCResult> => {
      try {
        hooksLoader.setDisabled(hookId, disabled);
        return { success: true };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'toggle failed' };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HOOKS_TRUST,
    async (_e, hookId: string, approve: boolean): Promise<IPCResult> => {
      try {
        if (approve) trustStore.approve(hookId);
        else trustStore.revoke(hookId);
        return { success: true };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'trust failed' };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HOOKS_OPEN_FILE,
    async (
      _e,
      scope: HookScope,
      projectPath?: string,
    ): Promise<IPCResult<{ path: string }>> => {
      try {
        const filePath = hooksLoader.pathFor(scope, projectPath);
        if (!filePath) return { success: false, error: 'No path for scope' };
        // Ensure parent dir exists (for project hooks under .auto-claude/)
        try {
          mkdirSync(path.dirname(filePath), { recursive: true });
        } catch {
          /* ignore */
        }
        // Create file with a starter template if missing — opening a path that
        // doesn't exist silently fails on Windows, leaving the user staring
        // at the "No hooks configured" empty state with no obvious next step.
        if (!existsSync(filePath)) {
          try {
            writeFileSync(filePath, HOOKS_STARTER_TEMPLATE, { encoding: 'utf-8' });
          } catch (err) {
            return {
              success: false,
              error: `Could not create ${filePath}: ${err instanceof Error ? err.message : err}`,
            };
          }
        }
        const result = await shell.openPath(filePath);
        if (result) {
          // shell.openPath returns a non-empty string on failure
          return { success: false, error: result };
        }
        return { success: true, data: { path: filePath } };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'open failed' };
      }
    },
  );
}

/** Called by AgentManager / project-store when a project is activated. Watches
 * its `.auto-claude/hooks.json` for changes. Idempotent — safe to call multiple
 * times for the same projectPath. */
export function watchProjectHooks(projectPath: string): void {
  hooksLoader.watchProject(projectPath);
}
