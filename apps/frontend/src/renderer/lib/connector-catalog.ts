/**
 * Curated catalog of popular MCP (Model Context Protocol) servers.
 *
 * Each entry is a stencil for `CustomMcpServer`: clicking "Add" in the
 * Connectors view appends the entry to the active project's
 * `settings.customMcpServers`.
 *
 * Entries here only carry NPM-published MCP servers that can be launched via
 * `npx -y <package>`. HTTP-based MCPs require user-specific URLs and are not
 * catalogable.
 */

export type ConnectorCategory =
  | 'productivity'
  | 'dev-tools'
  | 'data'
  | 'search'
  | 'browser'
  | 'reasoning'
  | 'storage'
  | 'communication'
  | 'monitoring';

export interface ConnectorCatalogEntry {
  /** Stable id used to dedupe / mark "already added". Matches CustomMcpServer.id once installed. */
  id: string;
  /** Display name. */
  name: string;
  /** One-line summary shown on the card. */
  description: string;
  /** Longer-form details shown in the install drawer. */
  details?: string;
  category: ConnectorCategory;
  /** NPM package the MCP ships in — used to construct the `npx -y <pkg>` command. */
  packageName: string;
  /** Extra positional args after the package (e.g. allowed directories for filesystem). */
  extraArgs?: string[];
  /** Required env vars the user must set (UI surfaces this as a warning). */
  requiredEnv?: { key: string; help: string }[];
  homepage?: string;
}

export const CONNECTOR_CATEGORIES: { id: ConnectorCategory; label: string }[] = [
  { id: 'productivity', label: 'Productivity' },
  { id: 'dev-tools', label: 'Dev Tools' },
  { id: 'data', label: 'Data' },
  { id: 'search', label: 'Search' },
  { id: 'browser', label: 'Browser' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'storage', label: 'Storage' },
  { id: 'communication', label: 'Communication' },
  { id: 'monitoring', label: 'Monitoring' },
];

export const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  // Dev tools
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    description: 'Read and write files in a sandboxed directory.',
    category: 'dev-tools',
    packageName: '@modelcontextprotocol/server-filesystem',
    extraArgs: ['<allowed-directory>'],
    details: 'Replace `<allowed-directory>` in the args with an absolute path you trust the agent to read/write. Multiple directories can be listed.',
  },
  {
    id: 'mcp-github',
    name: 'GitHub',
    description: 'Search, read, and create issues/PRs across GitHub.',
    category: 'dev-tools',
    packageName: '@modelcontextprotocol/server-github',
    requiredEnv: [
      { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', help: 'Personal access token with repo/issues scopes.' },
    ],
  },
  {
    id: 'mcp-gitlab',
    name: 'GitLab',
    description: 'Search, read, and create issues/MRs across GitLab.',
    category: 'dev-tools',
    packageName: '@modelcontextprotocol/server-gitlab',
    requiredEnv: [
      { key: 'GITLAB_PERSONAL_ACCESS_TOKEN', help: 'Personal access token with api scope.' },
      { key: 'GITLAB_API_URL', help: 'e.g. https://gitlab.com/api/v4' },
    ],
  },
  {
    id: 'mcp-sentry',
    name: 'Sentry',
    description: 'Inspect Sentry issues and stacktraces from the agent.',
    category: 'monitoring',
    packageName: '@modelcontextprotocol/server-sentry',
    requiredEnv: [{ key: 'SENTRY_AUTH_TOKEN', help: 'Sentry auth token.' }],
  },

  // Data + storage
  {
    id: 'mcp-postgres',
    name: 'PostgreSQL',
    description: 'Run read-only SQL against a Postgres database.',
    category: 'data',
    packageName: '@modelcontextprotocol/server-postgres',
    extraArgs: ['<connection-string>'],
    details: 'Replace `<connection-string>` with a postgres:// URL. Server enforces read-only by default.',
  },
  {
    id: 'mcp-sqlite',
    name: 'SQLite',
    description: 'Read and write SQLite databases.',
    category: 'data',
    packageName: '@modelcontextprotocol/server-sqlite',
    extraArgs: ['--db-path', '<sqlite-file>'],
  },
  {
    id: 'mcp-gdrive',
    name: 'Google Drive',
    description: 'Search and read Google Drive files.',
    category: 'storage',
    packageName: '@modelcontextprotocol/server-gdrive',
    details: 'Requires Google OAuth setup. See package docs.',
  },
  {
    id: 'mcp-memory',
    name: 'Memory',
    description: 'Persistent knowledge graph across agent runs.',
    category: 'storage',
    packageName: '@modelcontextprotocol/server-memory',
  },

  // Search
  {
    id: 'mcp-brave-search',
    name: 'Brave Search',
    description: 'Web search via the Brave Search API.',
    category: 'search',
    packageName: '@modelcontextprotocol/server-brave-search',
    requiredEnv: [{ key: 'BRAVE_API_KEY', help: 'Brave Search API key.' }],
  },
  {
    id: 'mcp-fetch',
    name: 'Fetch',
    description: 'Fetch and convert any URL to markdown.',
    category: 'search',
    packageName: '@modelcontextprotocol/server-fetch',
  },

  // Browser / vision
  {
    id: 'mcp-puppeteer',
    name: 'Puppeteer',
    description: 'Headless browser automation: navigate, screenshot, click.',
    category: 'browser',
    packageName: '@modelcontextprotocol/server-puppeteer',
  },

  // Reasoning
  {
    id: 'mcp-sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Step-by-step reasoning scratchpad tool.',
    category: 'reasoning',
    packageName: '@modelcontextprotocol/server-sequential-thinking',
  },

  // Productivity
  {
    id: 'mcp-time',
    name: 'Time & Timezones',
    description: 'Current time and timezone conversion utilities.',
    category: 'productivity',
    packageName: '@modelcontextprotocol/server-time',
  },
  {
    id: 'mcp-slack',
    name: 'Slack',
    description: 'Post messages and read channels in Slack.',
    category: 'communication',
    packageName: '@modelcontextprotocol/server-slack',
    requiredEnv: [
      { key: 'SLACK_BOT_TOKEN', help: 'Bot token (xoxb-...).' },
      { key: 'SLACK_TEAM_ID', help: 'Team / workspace ID.' },
    ],
  },
  {
    id: 'mcp-everart',
    name: 'EverArt',
    description: 'Image generation via EverArt.',
    category: 'productivity',
    packageName: '@modelcontextprotocol/server-everart',
    requiredEnv: [{ key: 'EVERART_API_KEY', help: 'EverArt API key.' }],
  },
];
