import { ipcMain } from 'electron';
import { readdirSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, FileNode } from '../../shared/types';
import type { RenderableFile } from '../../shared/types/preview';

// Maximum file size to read (1MB)
const MAX_FILE_SIZE = 1024 * 1024;

/**
 * Validates and normalizes a file path for safe reading.
 * Returns the normalized path if valid, or an error message.
 */
function validatePath(filePath: string): { valid: true; path: string } | { valid: false; error: string } {
  // Resolve to absolute path (handles .., ., etc.)
  const resolvedPath = path.resolve(filePath);

  // Must be absolute after resolution
  if (!path.isAbsolute(resolvedPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  // After resolution, path should not contain .. segments
  // This catches edge cases where resolve might not fully normalize
  const segments = resolvedPath.split(path.sep);
  if (segments.includes('..')) {
    return { valid: false, error: 'Invalid path: contains parent directory references' };
  }

  return { valid: true, path: resolvedPath };
}

// Directories to ignore when listing
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '__pycache__', 'dist', 'build',
  '.next', '.nuxt', 'coverage', '.cache', '.venv', 'venv',
  'out', '.turbo', '.worktrees',
  'vendor', 'target', '.gradle', '.maven'
]);

/**
 * Register all file-related IPC handlers
 */
export function registerFileHandlers(): void {
  // ============================================
  // File Explorer Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.FILE_EXPLORER_LIST,
    async (_, dirPath: string): Promise<IPCResult<FileNode[]>> => {
      try {
        // Validate and normalize path to prevent directory traversal
        const validation = validatePath(dirPath);
        if (!validation.valid) {
          return { success: false, error: validation.error };
        }
        const entries = readdirSync(validation.path, { withFileTypes: true });

        // Filter and map entries
        const nodes: FileNode[] = [];
        for (const entry of entries) {
          // Skip hidden files (not directories) except useful ones like .env, .gitignore
          if (!entry.isDirectory() && entry.name.startsWith('.') &&
              !['.env', '.gitignore', '.env.example', '.env.local'].includes(entry.name)) {
            continue;
          }
          // Skip ignored directories
          if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

          nodes.push({
            path: path.join(validation.path, entry.name),
            name: entry.name,
            isDirectory: entry.isDirectory()
          });
        }

        // Sort: directories first, then alphabetically
        nodes.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        return { success: true, data: nodes };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list directory'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_EXPLORER_READ,
    async (_, filePath: string): Promise<IPCResult<string>> => {
      try {
        // Validate and normalize path
        const validation = validatePath(filePath);
        if (!validation.valid) {
          return { success: false, error: validation.error };
        }
        const safePath = validation.path;

        // Check file size before reading
        const stats = statSync(safePath);
        if (stats.size > MAX_FILE_SIZE) {
          return { success: false, error: 'File too large (max 1MB)' };
        }

        // Use async file read to avoid blocking
        const content = await readFile(safePath, 'utf-8');
        return { success: true, data: content };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read file'
        };
      }
    }
  );

  // ============================================
  // Preview: list renderable files
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.PREVIEW_LIST_RENDERABLE,
    async (_, projectPath: string): Promise<IPCResult<RenderableFile[]>> => {
      try {
        const validation = validatePath(projectPath);
        if (!validation.valid) {
          return { success: false, error: validation.error };
        }
        const root = validation.path;
        const out: RenderableFile[] = [];
        // Cap to keep the list usable in projects with thousands of files.
        const MAX_RESULTS = 200;
        const RENDERABLE_EXT = new Set(['.html', '.svg']);

        // AutoClaude tasks generate files inside `.auto-claude/worktrees/tasks/{taskId}/...`
        // (a dotfile dir). The dotfile rule below would skip it entirely, so we seed the
        // scan with each task worktree as an extra root.
        const stack: string[] = [root];
        try {
          const worktreeTasks = path.join(root, '.auto-claude', 'worktrees', 'tasks');
          for (const sub of readdirSync(worktreeTasks, { withFileTypes: true })) {
            if (sub.isDirectory()) stack.push(path.join(worktreeTasks, sub.name));
          }
        } catch {
          // Project may not have any worktrees yet — non-fatal.
        }

        while (stack.length > 0 && out.length < MAX_RESULTS) {
          const dir = stack.pop()!;
          let entries;
          try {
            entries = readdirSync(dir, { withFileTypes: true });
          } catch {
            continue;
          }
          for (const entry of entries) {
            if (entry.isDirectory()) {
              if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
              stack.push(path.join(dir, entry.name));
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (!RENDERABLE_EXT.has(ext)) continue;
              const full = path.join(dir, entry.name);
              try {
                const stats = statSync(full);
                out.push({
                  absolutePath: full,
                  relativePath: path.relative(root, full).replace(/\\/g, '/'),
                  name: entry.name,
                  language: ext === '.svg' ? 'svg' : 'html',
                  sizeBytes: stats.size,
                  modifiedAt: stats.mtimeMs,
                });
              } catch {
                // Skip files we can't stat
              }
              if (out.length >= MAX_RESULTS) break;
            }
          }
        }
        // Most recently modified first — that's almost always what the user wants.
        out.sort((a, b) => b.modifiedAt - a.modifiedAt);
        return { success: true, data: out };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to scan project',
        };
      }
    }
  );
}

