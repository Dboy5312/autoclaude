import { Insights } from '../Insights';
import { ResizablePanels } from '../ui/resizable-panels';
import { ArtifactView } from './ArtifactView';
import { useArtifacts } from '../../hooks/useArtifacts';

interface InsightsWithPreviewProps {
  projectId: string;
}

/**
 * Renders the Insights chat with a side preview pane that activates whenever
 * the latest assistant message contains a renderable artifact (html/svg).
 *
 * When no artifact is present, Insights takes the full width — no perf cost
 * (the hook returns null, ResizablePanels is not mounted).
 */
export function InsightsWithPreview({ projectId }: InsightsWithPreviewProps) {
  const artifact = useArtifacts();

  if (!artifact) {
    return <Insights projectId={projectId} />;
  }

  return (
    <ResizablePanels
      storageKey="preview-pane-width"
      defaultLeftWidth={60}
      minLeftWidth={35}
      maxLeftWidth={75}
      leftPanel={<Insights projectId={projectId} />}
      rightPanel={<ArtifactView artifact={artifact} />}
      className="h-full"
    />
  );
}
