/**
 * Loads and merges hook configs from two scopes:
 *
 *   user:    `<userData>/hooks.json`           (e.g. ~/.config/Auto-Claude/hooks.json)
 *   project: `<projectPath>/.auto-claude/hooks.json`
 *
 * Cascade is additive — both scopes' hooks fire for the same event.
 *
 * chokidar watchers reload the in-memory list when either file is edited so
 * users don't have to restart the app. Disable toggles are stored separately
 * in `<userData>/disabled-hooks.json` keyed by hook hash.
 */

import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import chokidar, { type FSWatcher } from 'chokidar';

import type {
  HookCommand,
  HookListEntry,
  HooksConfig,
} from '../../shared/types/hooks';
import { HooksConfigSchema } from '../../shared/types/hooks';
import {
  HOOKS_FILENAME,
  HOOK_EVENTS,
  PROJECT_HOOKS_DIR,
  type HookEvent,
  type HookScope,
} from '../../shared/constants/hooks';
import { hashHook, trustStore } from './hook-trust';

interface ResolvedHook {
  hookId: string;
  scope: HookScope;
  event: HookEvent;
  hookCmd: HookCommand;
  matcher?: string;
}

const DISABLED_FILE = 'disabled-hooks.json';

function userHooksPath(): string {
  return path.join(app.getPath('userData'), HOOKS_FILENAME);
}

function projectHooksPath(projectPath: string): string {
  return path.join(projectPath, PROJECT_HOOKS_DIR, HOOKS_FILENAME);
}

function disabledFilePath(): string {
  return path.join(app.getPath('userData'), DISABLED_FILE);
}

function loadDisabledSet(): Set<string> {
  try {
    const p = disabledFilePath();
    if (!existsSync(p)) return new Set();
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    if (Array.isArray(parsed)) return new Set(parsed.filter((s) => typeof s === 'string'));
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveDisabledSet(set: Set<string>): void {
  try {
    const p = disabledFilePath();
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(Array.from(set), null, 2), 'utf-8');
  } catch (e) {
    console.warn('[HooksLoader] Failed to save disabled set:', e);
  }
}

function parseHooksFile(filePath: string): HooksConfig | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, 'utf-8');
    const json = JSON.parse(raw);
    const parsed = HooksConfigSchema.safeParse(json);
    if (!parsed.success) {
      console.warn(`[HooksLoader] Schema validation failed for ${filePath}:`, parsed.error.issues);
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.warn(`[HooksLoader] Failed to parse ${filePath}:`, e);
    return null;
  }
}

function expandConfig(
  cfg: HooksConfig,
  scope: HookScope,
): ResolvedHook[] {
  const out: ResolvedHook[] = [];
  for (const event of HOOK_EVENTS) {
    const matchers = cfg.hooks[event] ?? [];
    for (const m of matchers) {
      for (const h of m.hooks) {
        out.push({
          hookId: hashHook(h),
          scope,
          event,
          hookCmd: h,
          matcher: m.matcher,
        });
      }
    }
  }
  return out;
}

function summaryFor(h: HookCommand): string {
  switch (h.type) {
    case 'command':
      return h.command.length > 80 ? h.command.slice(0, 77) + '...' : h.command;
    case 'http':
      return h.url;
    case 'prompt':
      return h.prompt.length > 80 ? h.prompt.slice(0, 77) + '...' : h.prompt;
  }
}

class HooksLoader extends EventEmitter {
  private userHooks: ResolvedHook[] = [];
  private projectHooks = new Map<string, ResolvedHook[]>();
  private watchers: FSWatcher[] = [];
  private disabled = new Set<string>();
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.disabled = loadDisabledSet();
    this.reloadUser();

    const userPath = userHooksPath();
    const watcher = chokidar.watch(userPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });
    watcher.on('all', () => {
      this.reloadUser();
      this.emit('changed', 'user');
    });
    this.watchers.push(watcher);
  }

  reloadUser(): void {
    const cfg = parseHooksFile(userHooksPath());
    this.userHooks = cfg ? expandConfig(cfg, 'user') : [];
  }

  reloadProject(projectPath: string): void {
    const cfg = parseHooksFile(projectHooksPath(projectPath));
    if (cfg) {
      this.projectHooks.set(projectPath, expandConfig(cfg, 'project'));
    } else {
      this.projectHooks.delete(projectPath);
    }
  }

  watchProject(projectPath: string): void {
    const watchPath = projectHooksPath(projectPath);
    const watcher = chokidar.watch(watchPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });
    watcher.on('all', () => {
      this.reloadProject(projectPath);
      this.emit('changed', 'project', projectPath);
    });
    this.watchers.push(watcher);
    this.reloadProject(projectPath);
  }

  /** Returns hooks (user + project) for a given event, filtered by enabled state. */
  getHooksFor(event: HookEvent, projectPath?: string): ResolvedHook[] {
    const u = this.userHooks.filter((h) => h.event === event && !this.disabled.has(h.hookId));
    const p = projectPath
      ? (this.projectHooks.get(projectPath) ?? []).filter(
          (h) => h.event === event && !this.disabled.has(h.hookId),
        )
      : [];
    return [...u, ...p];
  }

  /** Lightweight projection for the UI listing. */
  list(projectPath?: string): HookListEntry[] {
    const all: ResolvedHook[] = [
      ...this.userHooks,
      ...(projectPath ? (this.projectHooks.get(projectPath) ?? []) : []),
    ];
    return all.map((h) => ({
      hookId: h.hookId,
      scope: h.scope,
      event: h.event,
      type: h.hookCmd.type,
      summary: summaryFor(h.hookCmd),
      trusted: trustStore.isTrusted(h.hookId),
      disabled: this.disabled.has(h.hookId),
    }));
  }

  setDisabled(hookId: string, disabled: boolean): void {
    if (disabled) this.disabled.add(hookId);
    else this.disabled.delete(hookId);
    saveDisabledSet(this.disabled);
  }

  /** Used by hooks-runner to fetch the actual command struct after filtering. */
  resolveById(hookId: string): ResolvedHook | undefined {
    return (
      this.userHooks.find((h) => h.hookId === hookId) ??
      Array.from(this.projectHooks.values())
        .flat()
        .find((h) => h.hookId === hookId)
    );
  }

  /** Returns the on-disk path so the UI can open it in the OS editor. */
  pathFor(scope: HookScope, projectPath?: string): string | null {
    if (scope === 'user') return userHooksPath();
    if (scope === 'project' && projectPath) return projectHooksPath(projectPath);
    return null;
  }

  dispose(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }
}

export const hooksLoader = new HooksLoader();
export type { ResolvedHook };
