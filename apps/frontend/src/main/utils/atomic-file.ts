/**
 * Atomic File Operations
 * ======================
 *
 * Utilities for atomic file writes to prevent corruption.
 *
 * Uses temp file + fs.rename() pattern which is atomic on POSIX systems
 * and atomic on Windows when source and destination are on the same volume.
 *
 * Usage:
 *   import { writeFileAtomic, writeFileWithRetry } from './atomic-file';
 *
 *   await writeFileAtomic('/path/to/file.json', JSON.stringify(data));
 *   await writeFileWithRetry('/path/to/file.json', JSON.stringify(data));
 */

import { mkdir, rename, unlink, writeFile, readFile } from 'fs/promises';
import { existsSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

/** Error codes for transient filesystem errors that are safe to retry */
const TRANSIENT_ERROR_CODES = ['EBUSY', 'EACCES', 'EAGAIN', 'EPERM', 'EMFILE', 'ENFILE'] as const;

export class AtomicFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtomicFileError';
  }
}

/**
 * Write data to file atomically using temp file and rename.
 *
 * This prevents file corruption by:
 * 1. Writing to a temporary file first
 * 2. Only replacing the target file if the write succeeds
 * 3. Using fs.rename() for atomicity
 *
 * @param filepath - Target file path
 * @param data - Data to write (string or Buffer)
 * @param options - Write options (encoding, mode, etc.)
 *
 * @example
 *   await writeFileAtomic('/path/to/file.json', JSON.stringify(data));
 */
export async function writeFileAtomic(
  filepath: string,
  data: string | Buffer,
  options?: { encoding?: BufferEncoding; mode?: number }
): Promise<void> {
  const absolutePath = path.resolve(filepath);
  const dir = path.dirname(absolutePath);
  const filename = path.basename(absolutePath);

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Create temp file in same directory for atomic rename
  const tempSuffix = randomBytes(8).toString('hex');
  const tempPath = path.join(dir, `.${filename}.tmp.${tempSuffix}`);

  try {
    // Write to temp file
    await writeFile(tempPath, data, {
      encoding: options?.encoding,
      mode: options?.mode,
    });

    // Atomic replace - only happens if write succeeded
    await rename(tempPath, absolutePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      if (existsSync(tempPath)) {
        await unlink(tempPath);
      }
    } catch (cleanupError) {
      // Best-effort cleanup, log but don't mask original error
      console.warn(`Failed to cleanup temp file ${tempPath}:`, cleanupError);
    }
    throw error;
  }
}

/**
 * Synchronous variant of writeFileAtomic.
 *
 * Write data to file atomically using temp file and rename.
 * Uses randomBytes for collision-safe temp file naming.
 *
 * NOTE: Unlike writeFileAtomic, this function does NOT create parent directories.
 * The caller must ensure the target directory exists.
 *
 * @param filepath - Target file path
 * @param data - Data to write (string or Buffer)
 * @param encoding - File encoding (default: 'utf-8')
 */
export function writeFileAtomicSync(
  filepath: string,
  data: string | Buffer,
  encoding: BufferEncoding = 'utf-8'
): void {
  const absolutePath = path.resolve(filepath);
  const dir = path.dirname(absolutePath);
  const tempSuffix = randomBytes(8).toString('hex');
  const tempPath = path.join(dir, `.${path.basename(absolutePath)}.tmp.${tempSuffix}`);
  try {
    writeFileSync(tempPath, data, encoding);
    renameSync(tempPath, absolutePath);
  } catch (err) {
    try { unlinkSync(tempPath); } catch { /* ignore cleanup */ }
    throw err;
  }
}

/** Busy-wait a few ms synchronously. Used between sync write retries. */
function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  // Atomics.wait on a throwaway buffer blocks without spinning the CPU hot.
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // SharedArrayBuffer may be unavailable; fall back to a bounded busy-wait.
    while (Date.now() < end) { /* spin */ }
  }
}

/**
 * Synchronous atomic write with retry + last-resort non-atomic fallback.
 *
 * On Windows the `renameSync(tmp -> target)` step throws EPERM/EBUSY whenever
 * another handle (chokidar, antivirus, indexer, a concurrent reader) holds the
 * target — far more likely when the path contains a space. The plain
 * `writeFileAtomicSync` has a single attempt, so one transient EPERM silently
 * loses the write (this dropped the coding->validation phase persist and the
 * task got auto-corrected to human_review).
 *
 * This variant:
 *   1. Retries the whole atomic write on TRANSIENT_ERROR_CODES with backoff.
 *   2. If the rename still fails after all retries, falls back to writing
 *      directly onto the target. That is NOT atomic, but the data is preserved
 *      — strictly better than dropping the write entirely.
 *
 * @returns true if written atomically, false if written via the non-atomic
 *          fallback (caller may log/telemetry on false). Throws only if even
 *          the direct write fails.
 */
export function writeFileAtomicSyncWithRetry(
  filepath: string,
  data: string | Buffer,
  options?: { encoding?: BufferEncoding; maxRetries?: number; retryDelay?: number }
): boolean {
  const encoding = options?.encoding ?? 'utf-8';
  const maxRetries = options?.maxRetries ?? 4;
  const retryDelay = options?.retryDelay ?? 50;

  let lastError: NodeJS.ErrnoException | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      writeFileAtomicSync(filepath, data, encoding);
      return true; // atomic success
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      lastError = nodeError;
      const isTransient =
        nodeError.code && (TRANSIENT_ERROR_CODES as readonly string[]).includes(nodeError.code);
      if (!isTransient || attempt === maxRetries) break;
      // 50/100/200/400ms backoff
      sleepSync(retryDelay * 2 ** attempt);
    }
  }

  // Last resort: non-atomic direct write. Data preserved > write dropped.
  try {
    writeFileSync(path.resolve(filepath), data, encoding);
    console.warn(
      `[atomic-file] Atomic rename failed for ${filepath} (${lastError?.code ?? 'unknown'}); ` +
        `wrote directly (non-atomic fallback). Data preserved.`
    );
    return false;
  } catch (fallbackErr) {
    throw new AtomicFileError(
      `Failed to write file ${filepath} atomically (${lastError?.code ?? 'unknown'}) ` +
        `and direct fallback also failed: ${(fallbackErr as Error).message}`
    );
  }
}

/**
 * Write data to file atomically with retry logic.
 *
 * Retries on transient errors like EBUSY, EACCES, EAGAIN.
 *
 * @param filepath - Target file path
 * @param data - Data to write (string or Buffer)
 * @param options - Write and retry options
 *
 * @example
 *   await writeFileWithRetry('/path/to/file.json', JSON.stringify(data), {
 *     maxRetries: 5,
 *     retryDelay: 100
 *   });
 */
export async function writeFileWithRetry(
  filepath: string,
  data: string | Buffer,
  options?: {
    encoding?: BufferEncoding;
    mode?: number;
    maxRetries?: number;
    retryDelay?: number;
  }
): Promise<void> {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelay = options?.retryDelay ?? 100;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await writeFileAtomic(filepath, data, {
        encoding: options?.encoding,
        mode: options?.mode,
      });
      return; // Success
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      lastError = nodeError;

      // Check if this is a transient error we should retry
      const isTransient = nodeError.code && (TRANSIENT_ERROR_CODES as readonly string[]).includes(nodeError.code);

      if (!isTransient || attempt === maxRetries) {
        // Not transient or out of retries - throw
        throw new AtomicFileError(
          `Failed to write file ${filepath} after ${attempt + 1} attempts: ${nodeError.message}`
        );
      }

      // Wait before retry with exponential backoff
      const delay = retryDelay * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript doesn't know that
  throw lastError || new AtomicFileError(`Failed to write file ${filepath}`);
}

/**
 * Read file with retry logic.
 *
 * Retries on transient errors like EBUSY, EACCES, EAGAIN.
 *
 * @param filepath - File path to read
 * @param options - Read and retry options
 * @returns File contents
 *
 * @example
 *   const data = await readFileWithRetry('/path/to/file.json', {
 *     encoding: 'utf-8',
 *     maxRetries: 5
 *   });
 */
export async function readFileWithRetry(
  filepath: string,
  options?: {
    encoding?: BufferEncoding;
    maxRetries?: number;
    retryDelay?: number;
  }
): Promise<string | Buffer> {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelay = options?.retryDelay ?? 100;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const data = await readFile(filepath, { encoding: options?.encoding });
      return data;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      lastError = nodeError;

      // Check if this is a transient error we should retry
      const isTransient = nodeError.code && (TRANSIENT_ERROR_CODES as readonly string[]).includes(nodeError.code);

      if (!isTransient || attempt === maxRetries) {
        // Not transient or out of retries - throw
        throw new AtomicFileError(
          `Failed to read file ${filepath} after ${attempt + 1} attempts: ${nodeError.message}`
        );
      }

      // Wait before retry with exponential backoff
      const delay = retryDelay * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript doesn't know that
  throw lastError || new AtomicFileError(`Failed to read file ${filepath}`);
}

/**
 * Write JSON data to file atomically.
 *
 * Convenience wrapper around writeFileAtomic for JSON data.
 *
 * @param filepath - Target file path
 * @param data - Data to serialize as JSON
 * @param options - JSON formatting and write options
 *
 * @example
 *   await writeJsonAtomic('/path/to/file.json', { key: 'value' });
 */
export async function writeJsonAtomic(
  filepath: string,
  data: unknown,
  options?: {
    indent?: number;
    mode?: number;
  }
): Promise<void> {
  const indent = options?.indent ?? 2;
  const jsonString = JSON.stringify(data, null, indent);
  await writeFileAtomic(filepath, jsonString, {
    encoding: 'utf-8',
    mode: options?.mode,
  });
}

/**
 * Write JSON data to file atomically with retry logic.
 *
 * Convenience wrapper around writeFileWithRetry for JSON data.
 *
 * @param filepath - Target file path
 * @param data - Data to serialize as JSON
 * @param options - JSON formatting, write, and retry options
 *
 * @example
 *   await writeJsonWithRetry('/path/to/file.json', { key: 'value' }, {
 *     maxRetries: 5
 *   });
 */
export async function writeJsonWithRetry(
  filepath: string,
  data: unknown,
  options?: {
    indent?: number;
    mode?: number;
    maxRetries?: number;
    retryDelay?: number;
  }
): Promise<void> {
  const indent = options?.indent ?? 2;
  const jsonString = JSON.stringify(data, null, indent);
  await writeFileWithRetry(filepath, jsonString, {
    encoding: 'utf-8',
    mode: options?.mode,
    maxRetries: options?.maxRetries,
    retryDelay: options?.retryDelay,
  });
}
