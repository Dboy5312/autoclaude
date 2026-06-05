/**
 * Plugin Manager
 * ==============
 *
 * Discovers plugins under `<userData>/plugins/<plugin-id>/plugin.json`, loads
 * their manifests, and tracks per-plugin enabled state. Enabled-state is
 * persisted at `<userData>/plugin-state.json`.
 *
 * Enabling a plugin doesn't auto-install its contributions globally —
 * "install to project" is an explicit action so the user controls what each
 * project sees. This keeps the loader idempotent and non-destructive.
 */

import { app, BrowserWindow, shell } from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { CustomMcpServer } from '../../shared/types';
import type { LoadedPlugin, PluginManifest } from '../../shared/types/plugin';

const STATE_FILENAME = 'plugin-state.json';

interface PluginState {
  enabled: Record<string, boolean>;
}

function readState(filePath: string): PluginState {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as PluginState;
  } catch {
    return { enabled: {} };
  }
}

function writeState(filePath: string, state: PluginState): void {
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('[PluginManager] Failed to persist state:', e);
  }
}

function isPluginManifest(value: unknown): value is PluginManifest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.version === 'string'
  );
}

export class PluginManager {
  private pluginsDir: string;
  private stateFile: string;
  private getMainWindow: () => BrowserWindow | null;
  private plugins: LoadedPlugin[] = [];

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
    this.pluginsDir = path.join(app.getPath('userData'), 'plugins');
    this.stateFile = path.join(app.getPath('userData'), STATE_FILENAME);
  }

  /** Ensures the plugins directory exists. Called once at startup. */
  ensureDir(): void {
    try {
      mkdirSync(this.pluginsDir, { recursive: true });
    } catch (e) {
      console.error('[PluginManager] Failed to create plugins dir:', e);
    }
  }

  /** Read state + scan plugin directory. Idempotent — safe to call repeatedly. */
  reload(): LoadedPlugin[] {
    this.ensureDir();
    const state = readState(this.stateFile);
    const found: LoadedPlugin[] = [];

    let entries: string[];
    try {
      entries = readdirSync(this.pluginsDir);
    } catch {
      this.plugins = [];
      return this.plugins;
    }

    for (const name of entries) {
      const dir = path.join(this.pluginsDir, name);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const manifestPath = path.join(dir, 'plugin.json');
      if (!existsSync(manifestPath)) continue;

      let manifest: PluginManifest;
      try {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        if (!isPluginManifest(raw)) {
          found.push({
            manifest: { id: name, name, version: '0.0.0' },
            directory: dir,
            enabled: false,
            loadError: 'manifest missing required fields (id/name/version)',
          });
          continue;
        }
        manifest = raw;
      } catch (e) {
        found.push({
          manifest: { id: name, name, version: '0.0.0' },
          directory: dir,
          enabled: false,
          loadError: `failed to parse plugin.json: ${(e as Error).message}`,
        });
        continue;
      }
      found.push({
        manifest,
        directory: dir,
        enabled: state.enabled[manifest.id] ?? false,
      });
    }

    found.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
    this.plugins = found;
    this.broadcast();
    return found;
  }

  list(): LoadedPlugin[] {
    return this.plugins;
  }

  toggle(pluginId: string): { ok: true; enabled: boolean } | { ok: false; error: string } {
    const plugin = this.plugins.find((p) => p.manifest.id === pluginId);
    if (!plugin) return { ok: false, error: 'Plugin not found' };
    if (plugin.loadError) return { ok: false, error: 'Cannot toggle a plugin that failed to load' };
    plugin.enabled = !plugin.enabled;
    const state = readState(this.stateFile);
    state.enabled[pluginId] = plugin.enabled;
    writeState(this.stateFile, state);
    this.broadcast();
    return { ok: true, enabled: plugin.enabled };
  }

  /** Return all MCP servers contributed by enabled plugins. */
  getEnabledMcpContributions(): CustomMcpServer[] {
    const out: CustomMcpServer[] = [];
    for (const p of this.plugins) {
      if (!p.enabled || p.loadError) continue;
      for (const s of p.manifest.mcpServers ?? []) {
        out.push({ ...s, id: `${p.manifest.id}:${s.id}` });
      }
    }
    return out;
  }

  openFolder(): void {
    this.ensureDir();
    shell.openPath(this.pluginsDir);
  }

  private broadcast(): void {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED, this.plugins);
    }
  }
}
