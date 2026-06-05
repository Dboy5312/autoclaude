import { useMemo } from 'react';
import { Eye } from 'lucide-react';
import type { Artifact } from '../../../shared/types/preview';
import { buildArtifactSrcDoc } from '../../lib/artifact-html-builder';
import { cn } from '../../lib/utils';

interface ArtifactViewProps {
  artifact: Artifact | null;
  className?: string;
}

/**
 * Renders an Artifact in a strictly sandboxed iframe.
 *
 * Security posture:
 * - `sandbox="allow-scripts"` (NO `allow-same-origin`) → null origin, no cookies / storage / parent reach
 * - Strict CSP meta inside srcDoc (see artifact-html-builder.ts) → no external script/style sources in v1
 *
 * The iframe `key` is the artifact id, so switching artifacts remounts the iframe
 * (clean slate). Updates to the same artifact patch in place via `srcDoc` change.
 */
export function ArtifactView({ artifact, className }: ArtifactViewProps) {
  const srcDoc = useMemo(
    () => (artifact ? buildArtifactSrcDoc(artifact) : ''),
    [artifact],
  );

  if (!artifact) {
    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-3 bg-background p-6 text-muted-foreground',
          className,
        )}
      >
        <Eye className="h-8 w-8 opacity-40" aria-hidden />
        <div className="text-center text-sm">
          <div className="font-medium">No preview yet</div>
          <div className="mt-1 text-xs opacity-80">
            Ask the assistant to generate HTML or SVG and it will render here.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full w-full flex-col bg-background', className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="font-medium">Preview</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono uppercase tracking-wide text-[10px] text-muted-foreground">
            {artifact.language}
          </span>
        </div>
      </div>
      <iframe
        key={artifact.id}
        title={`Artifact preview (${artifact.language})`}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        className="h-full w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
