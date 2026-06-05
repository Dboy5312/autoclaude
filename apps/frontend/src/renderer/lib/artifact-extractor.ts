import type { Artifact, ArtifactLanguage } from '../../shared/types/preview';

const RENDERABLE_LANGS: readonly ArtifactLanguage[] = ['html', 'svg'] as const;

/**
 * Matches CommonMark fenced code blocks: opening fence (3+ backticks or tildes),
 * info string (lang), body, closing fence with the same character.
 * Multiline + dotall via [\s\S], non-greedy body.
 */
const FENCE_RE = /(^|\n)([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`~]*)[^\n]*\n([\s\S]*?)\n[ \t]*\3[ \t]*(?=\n|$)/g;

function isRenderable(lang: string): lang is ArtifactLanguage {
  return (RENDERABLE_LANGS as readonly string[]).includes(lang);
}

interface ExtractCtx {
  sessionId: string;
  messageId: string;
}

/**
 * Extracts every renderable fenced code block (html, svg) from a markdown string,
 * in document order. Returns one Artifact per block.
 *
 * Implementation note: regex-based rather than a full markdown parser — sufficient
 * for chat output where pathological inputs (nested fences, indented blocks inside
 * lists) are rare. Edge cases that misfire produce no artifact, never throw.
 */
export function extractArtifacts(markdown: string, ctx: ExtractCtx): Artifact[] {
  if (!markdown) return [];
  const out: Artifact[] = [];
  let blockIndex = 0;
  FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(markdown)) !== null) {
    const lang = (match[4] || '').toLowerCase().trim();
    const body = match[5];
    if (!isRenderable(lang)) {
      blockIndex++;
      continue;
    }
    out.push({
      id: `${ctx.sessionId}:${ctx.messageId}:${blockIndex}`,
      sessionId: ctx.sessionId,
      messageId: ctx.messageId,
      blockIndex,
      language: lang,
      content: body,
      version: 1,
      createdAt: Date.now(),
    });
    blockIndex++;
  }
  return out;
}

/**
 * Returns the LAST renderable artifact from a markdown string, or null. This is the
 * v1 selection policy: when a message contains multiple renderable blocks, only the
 * most recent one renders. Multi-artifact picker is deferred to a later task.
 */
export function extractLatestArtifact(
  markdown: string,
  ctx: ExtractCtx,
): Artifact | null {
  const all = extractArtifacts(markdown, ctx);
  return all.length > 0 ? all[all.length - 1] : null;
}
