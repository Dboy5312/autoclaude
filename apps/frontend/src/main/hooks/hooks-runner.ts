/**
 * Hook runner. Given a fired event + payload, finds matching hooks (user + project,
 * filtered by `if:` clause + trust + enabled state) and dispatches each. Each hook
 * runs in its own child process with:
 *
 *   - JSON-on-stdin (HookInput)
 *   - JSON-on-stdout (optional HookResponse) for command/prompt hooks
 *   - Per-hook timeout (hard kill on overrun)
 *   - Restricted env (only PATH + HOME + allowedEnvVars are forwarded)
 *
 * Exit-code semantics:
 *   0   -> success
 *   2   -> blocking error (caller decides what to do; phase fails)
 *   any -> fail-open (warning logged; phase continues)
 *
 * Hook types:
 *   command -> spawn the configured shell with -c (or -Command for PowerShell)
 *   http    -> POST the HookInput as JSON body
 *   prompt  -> NOT IMPLEMENTED in v1 (needs LLM client). Skipped with status='skipped'.
 *
 * No exec/eval. spawn with explicit argv only, never shell-interpolated input.
 */

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { BrowserWindow } from 'electron';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';

import type { HookCommand, HookFireResult, HookInput } from '../../shared/types/hooks';
import { IPC_CHANNELS } from '../../shared/constants';
import { hooksLoader } from './hooks-loader';
import { hookFilterMatches } from './permission-filter';
import { trustStore } from './hook-trust';

const ALLOWED_BASE_ENV = ['PATH', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'SYSTEMROOT'];

const truncate = (s: string, max = 4096): string => (s.length > max ? s.slice(0, max) + '...[truncated]' : s);

function buildEnv(allowedEnvVars: string[] | undefined): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  const keep = new Set([...ALLOWED_BASE_ENV, ...(allowedEnvVars ?? [])]);
  for (const [k, v] of Object.entries(process.env)) {
    if (keep.has(k) && typeof v === 'string') out[k] = v;
  }
  return out;
}

function broadcast(result: HookFireResult): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.HOOK_FIRED, result);
    }
  }
}

interface RunArgs {
  hookId: string;
  hookCmd: HookCommand;
  scope: 'user' | 'project';
  input: HookInput;
}

async function runCommandHook(args: RunArgs): Promise<HookFireResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const cmd = args.hookCmd;
  if (cmd.type !== 'command') throw new Error('runCommandHook called with non-command hook');

  const cwd = args.input.project_path && existsSync(args.input.project_path)
    ? args.input.project_path
    : process.cwd();

  let argv0: string;
  let argvRest: string[];
  if (cmd.shell === 'powershell') {
    const pwsh = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    argv0 = pwsh;
    argvRest = ['-NoProfile', '-NonInteractive', '-Command', cmd.command];
  } else {
    const shellBin = process.platform === 'win32' ? 'bash.exe' : 'bash';
    argv0 = shellBin;
    argvRest = ['-lc', cmd.command];
  }

  return new Promise<HookFireResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(argv0, argvRest, {
        cwd,
        env: buildEnv(undefined),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (e) {
      resolve({
        hookId: args.hookId,
        scope: args.scope,
        event: args.input.hook_event_name,
        status: 'error',
        exitCode: null,
        durationMs: Date.now() - startMs,
        message: e instanceof Error ? e.message : String(e),
        startedAt,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timeoutMs = cmd.timeout ?? 10_000;
    const killTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve({
        hookId: args.hookId,
        scope: args.scope,
        event: args.input.hook_event_name,
        status: 'error',
        exitCode: null,
        durationMs: Date.now() - startMs,
        message: err.message,
        stderr: truncate(stderr),
        startedAt,
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      const durationMs = Date.now() - startMs;
      let status: HookFireResult['status'] = 'success';
      if (timedOut) status = 'timeout';
      else if (code === 2) status = 'blocked';
      else if (code !== 0) status = 'error';
      resolve({
        hookId: args.hookId,
        scope: args.scope,
        event: args.input.hook_event_name,
        status,
        exitCode: code,
        durationMs,
        stderr: stderr ? truncate(stderr) : undefined,
        startedAt,
      });
    });

    try {
      child.stdin?.write(JSON.stringify(args.input));
      child.stdin?.end();
    } catch (e) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      if (!settled) {
        settled = true;
        clearTimeout(killTimer);
        resolve({
          hookId: args.hookId,
          scope: args.scope,
          event: args.input.hook_event_name,
          status: 'error',
          exitCode: null,
          durationMs: Date.now() - startMs,
          message: e instanceof Error ? e.message : 'stdin write failed',
          startedAt,
        });
      }
    }
  });
}

async function runHttpHook(args: RunArgs): Promise<HookFireResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const cmd = args.hookCmd;
  if (cmd.type !== 'http') throw new Error('runHttpHook called with non-http hook');

  const url = new URL(cmd.url);
  const lib = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const body = JSON.stringify(args.input);

  // Build allowed env injections
  const envForHeaders: Record<string, string> = {};
  for (const name of cmd.allowedEnvVars ?? []) {
    if (typeof process.env[name] === 'string') envForHeaders[name] = process.env[name] as string;
  }

  return new Promise<HookFireResult>((resolve) => {
    let settled = false;
    const timeoutMs = cmd.timeout ?? 10_000;

    const req = lib(
      {
        method: 'POST',
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(cmd.headers ?? {}),
          ...Object.fromEntries(
            Object.entries(envForHeaders).map(([k, v]) => [`X-Auto-Claude-${k}`, v]),
          ),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let respBody = '';
        res.on('data', (c) => (respBody += c.toString('utf-8')));
        res.on('end', () => {
          if (settled) return;
          settled = true;
          const code = res.statusCode ?? 0;
          let status: HookFireResult['status'] = 'success';
          if (code >= 400 && code < 600) status = code === 422 ? 'blocked' : 'error';
          resolve({
            hookId: args.hookId,
            scope: args.scope,
            event: args.input.hook_event_name,
            status,
            exitCode: code,
            durationMs: Date.now() - startMs,
            stderr: status !== 'success' ? truncate(respBody, 1024) : undefined,
            startedAt,
          });
        });
      },
    );

    req.on('timeout', () => {
      if (settled) return;
      settled = true;
      try { req.destroy(); } catch { /* ignore */ }
      resolve({
        hookId: args.hookId,
        scope: args.scope,
        event: args.input.hook_event_name,
        status: 'timeout',
        exitCode: null,
        durationMs: Date.now() - startMs,
        startedAt,
      });
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      resolve({
        hookId: args.hookId,
        scope: args.scope,
        event: args.input.hook_event_name,
        status: 'error',
        exitCode: null,
        durationMs: Date.now() - startMs,
        message: err.message,
        startedAt,
      });
    });

    req.write(body);
    req.end();
  });
}

async function runOneHook(args: RunArgs): Promise<HookFireResult> {
  const cmd = args.hookCmd;
  switch (cmd.type) {
    case 'command':
      return runCommandHook(args);
    case 'http':
      return runHttpHook(args);
    case 'prompt':
      return {
        hookId: args.hookId,
        scope: args.scope,
        event: args.input.hook_event_name,
        status: 'skipped',
        exitCode: null,
        durationMs: 0,
        message: 'prompt hooks deferred to v2',
        startedAt: new Date().toISOString(),
      };
  }
}

const lastFireByHookId = new Map<string, HookFireResult>();

export function getLastFire(hookId: string): HookFireResult | undefined {
  return lastFireByHookId.get(hookId);
}

/**
 * Fire all hooks matching `event`. Returns the per-hook results. Hooks run in
 * parallel within a single event. Phase callers can inspect results to decide
 * whether to abort the phase (any `status: 'blocked'` -> abort).
 */
export async function fireHooks(
  event: HookInput['hook_event_name'],
  input: HookInput,
  projectPath?: string,
): Promise<HookFireResult[]> {
  const matches = hooksLoader.getHooksFor(event, projectPath);
  if (matches.length === 0) return [];

  const tasks: Promise<HookFireResult>[] = [];
  for (const m of matches) {
    if (!hookFilterMatches(m.hookCmd.if, input)) continue;
    if (!trustStore.isTrusted(m.hookId)) {
      const r: HookFireResult = {
        hookId: m.hookId,
        scope: m.scope,
        event,
        status: 'untrusted',
        exitCode: null,
        durationMs: 0,
        message: 'Hook not yet approved by user',
        startedAt: new Date().toISOString(),
      };
      lastFireByHookId.set(m.hookId, r);
      broadcast(r);
      // Also notify the renderer that a trust prompt is needed.
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.HOOK_TRUST_REQUIRED, {
            hookId: m.hookId,
            scope: m.scope,
            event,
            type: m.hookCmd.type,
          });
        }
      }
      tasks.push(Promise.resolve(r));
      continue;
    }
    tasks.push(
      runOneHook({
        hookId: m.hookId,
        hookCmd: m.hookCmd,
        scope: m.scope,
        input,
      }).then((res) => {
        lastFireByHookId.set(m.hookId, res);
        broadcast(res);
        return res;
      }),
    );
  }
  return Promise.all(tasks);
}
