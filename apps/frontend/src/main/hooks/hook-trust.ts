/**
 * Hook trust manager. Each unique hook config is hashed (SHA-256 of its JSON
 * representation, with keys sorted). The hash becomes the hook's stable id
 * AND its trust key. When the user approves a hook, we persist the hash.
 * Editing the hook changes the hash, which forces re-approval.
 *
 * Storage: `~/.config/Auto-Claude/trusted-hooks.json` — flat array of hash
 * strings. Anything not in the list is untrusted and won't fire.
 */

import { app } from 'electron';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import type { HookCommand } from '../../shared/types/hooks';

const TRUST_FILE = 'trusted-hooks.json';

function getTrustFilePath(): string {
  return path.join(app.getPath('userData'), TRUST_FILE);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Compute the stable hash of a hook config. */
export function hashHook(hookCmd: HookCommand): string {
  return createHash('sha256').update(stableStringify(hookCmd)).digest('hex');
}

class TrustStore {
  private trusted = new Set<string>();
  private loaded = false;

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const p = getTrustFilePath();
      if (!existsSync(p)) return;
      const raw = readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const h of parsed) {
          if (typeof h === 'string') this.trusted.add(h);
        }
      }
    } catch (e) {
      console.warn('[HookTrust] Failed to load trust file:', e);
    }
  }

  private save(): void {
    try {
      const p = getTrustFilePath();
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify(Array.from(this.trusted), null, 2), 'utf-8');
    } catch (e) {
      console.warn('[HookTrust] Failed to save trust file:', e);
    }
  }

  isTrusted(hash: string): boolean {
    this.load();
    return this.trusted.has(hash);
  }

  approve(hash: string): void {
    this.load();
    this.trusted.add(hash);
    this.save();
  }

  revoke(hash: string): void {
    this.load();
    this.trusted.delete(hash);
    this.save();
  }

  approveAll(hashes: string[]): void {
    this.load();
    for (const h of hashes) this.trusted.add(h);
    this.save();
  }
}

export const trustStore = new TrustStore();
