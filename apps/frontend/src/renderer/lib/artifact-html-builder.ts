import type { Artifact } from '../../shared/types/preview';

/**
 * Strict CSP for the artifact iframe. Combined with `sandbox="allow-scripts"` (and
 * crucially without `allow-same-origin`), the iframe runs in a null origin with no
 * cookie / storage / parent-window access.
 *
 * - default-src 'none'   — block everything by default
 * - script-src 'unsafe-inline' — allow inline scripts (artifact may include them)
 * - style-src 'unsafe-inline'  — allow inline styles
 * - img-src data: blob:        — let artifacts use data URIs and blobs for images
 * - font-src data:             — inline fonts only
 *
 * No external script sources in v1. Mermaid (Task 2) will add a pinned CDN URL.
 */
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;">`;

const BASE_STYLES = `
<style>
  html, body { margin: 0; padding: 8px; font-family: system-ui, -apple-system, sans-serif; color: #111; background: #fff; }
  body { line-height: 1.5; }
  svg { max-width: 100%; height: auto; }
</style>
`.trim();

/**
 * Wraps an artifact's body in a minimal HTML document with strict CSP.
 *
 * For `html`: body is dropped in directly.
 * For `svg`: body is wrapped in a centered container (SVGs vary wildly in size).
 */
export function buildArtifactSrcDoc(artifact: Artifact): string {
  const body =
    artifact.language === 'svg'
      ? `<div style="display:flex;justify-content:center;align-items:center;min-height:calc(100vh - 16px)">${artifact.content}</div>`
      : artifact.content;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
${CSP_META}
${BASE_STYLES}
</head>
<body>
${body}
</body>
</html>`;
}
