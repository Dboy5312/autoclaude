/**
 * AutoClaude plugin manifest. Plugins live as directories under
 * `<userData>/plugins/<plugin-id>/plugin.json` and can contribute MCP servers
 * the active project can opt-in to.
 *
 * v1 contribution surface: MCP servers only. Future contributions (hooks,
 * scheduled-task templates, output styles, agent profiles) can be added by
 * extending this schema; the loader ignores fields it doesn't recognise.
 */

import type { CustomMcpServer } from './project';

export interface PluginManifest {
  /** Unique id — kebab-case, also the directory name. */
  id: string;
  /** Display name. */
  name: string;
  /** Semver. */
  version: string;
  /** One-line description. */
  description?: string;
  /** Author. */
  author?: string;
  /** Homepage / repository URL. */
  homepage?: string;
  /** MCP servers this plugin contributes. Each entry is a CustomMcpServer
   *  stencil that gets copied into the active project's settings on enable. */
  mcpServers?: CustomMcpServer[];
}

/** Loaded plugin = manifest + filesystem + state. */
export interface LoadedPlugin {
  manifest: PluginManifest;
  /** Absolute path to the plugin's directory on disk. */
  directory: string;
  /** True if the user has explicitly enabled this plugin. */
  enabled: boolean;
  /** If the manifest failed to parse, this carries the reason. */
  loadError?: string;
}
