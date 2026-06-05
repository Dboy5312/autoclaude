/**
 * IPC Handlers Module Index
 *
 * This module exports a single setup function that registers all IPC handlers
 * organized by domain into separate handler modules.
 */

import type { BrowserWindow } from 'electron';
import { AgentManager } from '../agent';
import { TerminalManager } from '../terminal-manager';
import { PythonEnvManager } from '../python-env-manager';

// Import all handler registration functions
import { registerProjectHandlers } from './project-handlers';
import { registerTaskHandlers } from './task-handlers';
import { registerTerminalHandlers } from './terminal-handlers';
import { registerAgenteventsHandlers } from './agent-events-handlers';
import { registerSettingsHandlers } from './settings-handlers';
import { registerFileHandlers } from './file-handlers';
import { registerRoadmapHandlers } from './roadmap-handlers';
import { registerContextHandlers } from './context-handlers';
import { registerEnvHandlers } from './env-handlers';
import { registerLinearHandlers } from './linear-handlers';
import { registerGithubHandlers } from './github-handlers';
import { registerGitlabHandlers } from './gitlab-handlers';
import { registerIdeationHandlers } from './ideation-handlers';
import { registerChangelogHandlers } from './changelog-handlers';
import { registerInsightsHandlers } from './insights-handlers';
import { registerMemoryHandlers } from './memory-handlers';
import { registerAppUpdateHandlers } from './app-update-handlers';
import { registerDebugHandlers } from './debug-handlers';
import { registerClaudeCodeHandlers } from './claude-code-handlers';
import { registerMcpHandlers } from './mcp-handlers';
import { registerProfileHandlers } from './profile-handlers';
import { registerScreenshotHandlers } from './screenshot-handlers';
import { registerTerminalWorktreeIpcHandlers } from './terminal';
import { registerHooksHandlers } from './hooks-handlers';
import { registerCronHandlers } from './cron-handlers';
import { ScheduledTaskManager } from '../scheduled-tasks/manager';
import { registerPluginHandlers } from './plugin-handlers';
import { PluginManager } from '../plugins/manager';
import { registerSkillHandlers } from './skill-handlers';
import { SkillsManager } from '../skills/manager';
import { registerOutputStyleHandlers, registerPersonaHandlers, registerAgentInstructionsHandlers } from './output-style-handlers';
import { OutputStylesManager } from '../output-styles/manager';
import { notificationService } from '../notification-service';
import { setAgentManagerRef } from './utils';

/**
 * Setup all IPC handlers across all domains
 *
 * @param agentManager - The agent manager instance
 * @param terminalManager - The terminal manager instance
 * @param getMainWindow - Function to get the main BrowserWindow
 * @param pythonEnvManager - The Python environment manager instance
 */
export function setupIpcHandlers(
  agentManager: AgentManager,
  terminalManager: TerminalManager,
  getMainWindow: () => BrowserWindow | null,
  pythonEnvManager: PythonEnvManager
): void {
  // Initialize notification service
  notificationService.initialize(getMainWindow);

  // Wire up agent manager for circuit breaker cleanup
  setAgentManagerRef(agentManager);

  // Project handlers (including Python environment setup)
  registerProjectHandlers(pythonEnvManager, agentManager, getMainWindow);

  // Task handlers
  registerTaskHandlers(agentManager, pythonEnvManager, getMainWindow);

  // Terminal and Claude profile handlers
  registerTerminalHandlers(terminalManager, getMainWindow);

  // Terminal worktree handlers (isolated development in worktrees)
  registerTerminalWorktreeIpcHandlers();

  // Agent event handlers (event forwarding from agent manager to renderer)
  registerAgenteventsHandlers(agentManager, getMainWindow);

  // Settings and dialog handlers
  registerSettingsHandlers(agentManager, getMainWindow);

  // File explorer handlers
  registerFileHandlers();

  // Roadmap handlers
  registerRoadmapHandlers(agentManager, getMainWindow);

  // Context and memory handlers
  registerContextHandlers(getMainWindow);

  // Environment configuration handlers
  registerEnvHandlers(getMainWindow);

  // Linear integration handlers
  registerLinearHandlers(agentManager, getMainWindow);

  // GitHub integration handlers
  registerGithubHandlers(agentManager, getMainWindow);

  // GitLab integration handlers
  registerGitlabHandlers(agentManager, getMainWindow);

  // Ideation handlers
  registerIdeationHandlers(agentManager, getMainWindow);

  // Changelog handlers
  registerChangelogHandlers(getMainWindow);

  // Insights handlers
  registerInsightsHandlers(getMainWindow);

  // Memory & infrastructure handlers (for Graphiti/LadybugDB)
  registerMemoryHandlers();

  // App auto-update handlers
  registerAppUpdateHandlers();

  // Debug handlers (logs, debug info, etc.)
  registerDebugHandlers();

  // Claude Code CLI handlers (version checking, installation)
  registerClaudeCodeHandlers();

  // MCP server health check handlers
  registerMcpHandlers();

  // API Profile handlers (custom Anthropic-compatible endpoints)
  registerProfileHandlers();

  // Screenshot capture handlers
  registerScreenshotHandlers();

  // Hooks system (lifecycle + phase event hooks)
  registerHooksHandlers();

  // Scheduled tasks (cron) — fires `CRON_FIRED` events to the renderer when
  // due; renderer-side handler calls the existing task-create flow.
  const scheduledTaskManager = new ScheduledTaskManager(getMainWindow);
  scheduledTaskManager.load();
  scheduledTaskManager.start();
  registerCronHandlers(scheduledTaskManager);

  // Plugin loader — discovers plugins under <userData>/plugins/<id>/plugin.json.
  // Loaded plugins are listed in the UI; the user explicitly installs each
  // plugin's MCP contributions into a project when ready.
  const pluginManager = new PluginManager(getMainWindow);
  pluginManager.reload();
  registerPluginHandlers(pluginManager);

  // Skills runtime — user-invokable capability packs at <userData>/skills/<id>/SKILL.md.
  const skillsManager = new SkillsManager(getMainWindow);
  skillsManager.reload();
  registerSkillHandlers(skillsManager);

  // Output styles — response-format presets at <userData>/output-styles/<id>.md.
  const outputStylesManager = new OutputStylesManager(getMainWindow);
  outputStylesManager.reload();
  registerOutputStyleHandlers(outputStylesManager);

  // Persona / SOUL.md — insights-chat output style + persona.
  registerPersonaHandlers();

  // AGENT_INSTRUCTIONS.md — global instructions for pipeline phases.
  registerAgentInstructionsHandlers();

  console.warn('[IPC] All handler modules registered successfully');
}

// Re-export all individual registration functions for potential custom usage
export {
  registerProjectHandlers,
  registerTaskHandlers,
  registerTerminalHandlers,
  registerTerminalWorktreeIpcHandlers,
  registerAgenteventsHandlers,
  registerSettingsHandlers,
  registerFileHandlers,
  registerRoadmapHandlers,
  registerContextHandlers,
  registerEnvHandlers,
  registerLinearHandlers,
  registerGithubHandlers,
  registerGitlabHandlers,
  registerIdeationHandlers,
  registerChangelogHandlers,
  registerInsightsHandlers,
  registerMemoryHandlers,
  registerAppUpdateHandlers,
  registerDebugHandlers,
  registerClaudeCodeHandlers,
  registerMcpHandlers,
  registerProfileHandlers,
  registerScreenshotHandlers
};
