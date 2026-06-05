/**
 * Tests for atomic-file retry behavior with mocked transient errors.
 *
 * Separated from atomic-file.test.ts because vi.mock() is hoisted and
 * would affect the integration tests that use real filesystem operations.
 */

import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import { rename as originalRename, readFile as originalReadFile } from 'fs/promises';

// Track call counts per mock
let renameCallCount = 0;
let readFileCallCount = 0;
// Control mock behavior per test
// biome-ignore lint/suspicious/noExplicitAny: mock functions need flexible types
let renameMockFn: ((...args: any[]) => Promise<void>) | null = null;
// biome-ignore lint/suspicious/noExplicitAny: mock functions need flexible types
let readFileMockFn: ((...args: any[]) => Promise<string | Buffer>) | null = null;

// Sync toggles for the writeFileAtomicSyncWithRetry tests below.
let renameSyncCallCount = 0;
// biome-ignore lint/suspicious/noExplicitAny: mock functions need flexible types
let renameSyncMockFn: ((...args: any[]) => void) | null = null;
// biome-ignore lint/suspicious/noExplicitAny: mock functions need flexible types
let writeFileSyncMockFn: ((...args: any[]) => void) | null = null;
// Captured real impl (set by the fs mock factory) so sync tests can delegate.
// biome-ignore lint/suspicious/noExplicitAny: test-only
let realRenameSync: ((...args: any[]) => void) | null = null;

vi.mock('fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs/promises')>();
  return {
    ...original,
    rename: (...args: Parameters<typeof originalRename>) => {
      renameCallCount++;
      if (renameMockFn) return renameMockFn(...args);
      return original.rename(...args);
    },
    readFile: (...args: Parameters<typeof originalReadFile>) => {
      readFileCallCount++;
      if (readFileMockFn) return readFileMockFn(...args);
      return original.readFile(...args);
    },
  };
});

vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>();
  return {
    ...original,
    // biome-ignore lint/suspicious/noExplicitAny: mock passthrough
    renameSync: (...args: any[]) => {
      renameSyncCallCount++;
      if (renameSyncMockFn) return renameSyncMockFn(...args);
      // biome-ignore lint/suspicious/noExplicitAny: passthrough
      return (original.renameSync as any)(...args);
    },
    // biome-ignore lint/suspicious/noExplicitAny: mock passthrough
    writeFileSync: (...args: any[]) => {
      if (writeFileSyncMockFn) return writeFileSyncMockFn(...args);
      // biome-ignore lint/suspicious/noExplicitAny: passthrough
      return (original.writeFileSync as any)(...args);
    },
  };
});

// Import after mock setup
import { existsSync } from 'fs';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import path from 'path';
import { readFileSync, mkdirSync } from 'fs';
import {
  writeFileWithRetry,
  readFileWithRetry,
  writeFileAtomicSyncWithRetry,
  AtomicFileError,
} from '../atomic-file';

const TEST_DIR = path.join(__dirname, '.test-atomic-retry');

describe('transient error retry behavior', () => {
  beforeEach(async () => {
    renameCallCount = 0;
    readFileCallCount = 0;
    renameMockFn = null;
    readFileMockFn = null;
    renameSyncCallCount = 0;
    renameSyncMockFn = null;
    writeFileSyncMockFn = null;

    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
    await mkdir(TEST_DIR, { recursive: true });
  });

  // afterEach handled by beforeEach cleanup of next test, plus:
  // final cleanup not strictly needed since test dir is inside __tests__

  it('should retry on EBUSY and succeed when error clears', async () => {
    const filePath = path.join(TEST_DIR, 'transient-write.txt');

    // Fail with EBUSY on first rename attempt, succeed on second
    renameMockFn = async (...args: unknown[]) => {
      if (renameCallCount === 1) {
        const err = new Error('EBUSY: resource busy') as NodeJS.ErrnoException;
        err.code = 'EBUSY';
        throw err;
      }
      renameMockFn = null; // Use real rename for subsequent calls
      const { rename } = await vi.importActual<typeof import('fs/promises')>('fs/promises');
      return rename(args[0] as string, args[1] as string);
    };

    await writeFileWithRetry(filePath, 'retry content', { retryDelay: 1 });

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe('retry content');
    // rename called at least twice: first fails, second succeeds
    expect(renameCallCount).toBeGreaterThanOrEqual(2);
  });

  it('should throw AtomicFileError after exhausting retries on transient errors', async () => {
    const filePath = path.join(TEST_DIR, 'exhaust-retries.txt');

    // Always fail with EACCES
    renameMockFn = async () => {
      const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    };

    await expect(
      writeFileWithRetry(filePath, 'content', { maxRetries: 2, retryDelay: 1 })
    ).rejects.toThrow(AtomicFileError);

    // Should have attempted 3 times (initial + 2 retries)
    expect(renameCallCount).toBe(3);
  });

  it('should retry reads on EAGAIN and succeed when error clears', async () => {
    const filePath = path.join(TEST_DIR, 'transient-read.txt');
    await writeFile(filePath, 'readable content', 'utf-8');

    // Fail with EAGAIN on first read attempt
    readFileMockFn = async (...args: unknown[]) => {
      if (readFileCallCount === 1) {
        const err = new Error('EAGAIN: resource temporarily unavailable') as NodeJS.ErrnoException;
        err.code = 'EAGAIN';
        throw err;
      }
      readFileMockFn = null;
      const { readFile: realReadFile } = await vi.importActual<typeof import('fs/promises')>('fs/promises');
      return realReadFile(args[0] as string, args[1] as { encoding: BufferEncoding });
    };

    const result = await readFileWithRetry(filePath, { encoding: 'utf-8', retryDelay: 1 });
    expect(result).toBe('readable content');
    expect(readFileCallCount).toBeGreaterThanOrEqual(2);
  });

  it('should not retry on non-transient errors like ENOENT', async () => {
    const filePath = path.join(TEST_DIR, 'does-not-exist.txt');

    // Reset to track calls - readFile will naturally throw ENOENT
    readFileCallCount = 0;

    await expect(
      readFileWithRetry(filePath, { maxRetries: 3, retryDelay: 1 })
    ).rejects.toThrow(AtomicFileError);

    // ENOENT is not transient, should fail immediately without retrying
    expect(readFileCallCount).toBe(1);
  });
});

describe('writeFileAtomicSyncWithRetry (the EPERM-on-rename fix)', () => {
  beforeAll(async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    // biome-ignore lint/suspicious/noExplicitAny: test-only capture of real impl
    realRenameSync = actual.renameSync as any;
  });

  beforeEach(() => {
    renameSyncCallCount = 0;
    renameSyncMockFn = null;
    writeFileSyncMockFn = null;
    if (!existsSync(TEST_DIR)) { mkdirSync(TEST_DIR, { recursive: true }); }
  });

  const eperm = () => {
    const e = new Error('EPERM: operation not permitted, rename') as NodeJS.ErrnoException;
    e.code = 'EPERM';
    throw e;
  };

  it('writes atomically and returns true on the happy path', () => {
    const filePath = path.join(TEST_DIR, 'sync-happy.json');
    const ok = writeFileAtomicSyncWithRetry(filePath, '{"a":1}');
    expect(ok).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('{"a":1}');
  });

  it('retries a transient EPERM rename then succeeds atomically (returns true)', () => {
    // Fail the first two rename attempts, then delegate to the real renameSync.
    renameSyncMockFn = (...args: unknown[]) => {
      if (renameSyncCallCount < 3) eperm();
      return realRenameSync!(args[0] as string, args[1] as string);
    };

    const filePath = path.join(TEST_DIR, 'sync-retry.json');
    const ok = writeFileAtomicSyncWithRetry(filePath, 'retried', { retryDelay: 1 });

    expect(ok).toBe(true);                       // ended atomically, not dropped
    expect(renameSyncCallCount).toBeGreaterThanOrEqual(3); // proves it retried
    expect(readFileSync(filePath, 'utf-8')).toBe('retried');
  });

  it('falls back to a direct write (returns false) when rename always fails, preserving data', () => {
    renameSyncMockFn = () => { eperm(); };       // every rename attempt fails
    // writeFileSyncMockFn left null -> real writeFileSync runs the fallback

    const filePath = path.join(TEST_DIR, 'sync-fallback.json');
    const ok = writeFileAtomicSyncWithRetry(filePath, 'preserved', { retryDelay: 1 });

    expect(ok).toBe(false);                      // non-atomic fallback was used
    // The guarantee the original bug violated: data is NOT lost.
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('preserved');
  });

  it('throws AtomicFileError when rename AND the direct-write fallback both fail', () => {
    renameSyncMockFn = () => { eperm(); };
    writeFileSyncMockFn = () => { eperm(); };

    const filePath = path.join(TEST_DIR, 'sync-hardfail.json');
    expect(() => writeFileAtomicSyncWithRetry(filePath, 'x', { retryDelay: 1 })).toThrow(AtomicFileError);
  });
});
