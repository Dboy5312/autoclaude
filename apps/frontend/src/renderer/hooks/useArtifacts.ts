import { useMemo } from 'react';
import { useInsightsStore } from '../stores/insights-store';
import { extractLatestArtifact } from '../lib/artifact-extractor';
import type { Artifact } from '../../shared/types/preview';

const STREAMING_MESSAGE_ID = 'streaming';

/**
 * Returns the most recent renderable artifact (html/svg fenced block) from the
 * active Insights chat session, or null.
 *
 * Selection policy:
 *   1. If the assistant is currently streaming and `streamingContent` has a
 *      renderable block, that wins (live preview as the model writes).
 *   2. Otherwise, scan finalized assistant messages from newest → oldest and
 *      return the first message that contains a renderable block.
 *
 * Returns null when:
 *   - No Insights session is active
 *   - No assistant messages contain renderable blocks
 *
 * Re-extraction is memoized on identity of the streamingContent string and on the
 * tail of session.messages, so re-renders triggered by unrelated store fields
 * (status, isLoadingSessions, etc.) do not re-run the regex.
 */
export function useArtifacts(): Artifact | null {
  const session = useInsightsStore((s) => s.session);
  const streamingContent = useInsightsStore((s) => s.streamingContent);

  return useMemo(() => {
    if (!session) return null;
    const sessionId = session.id;

    if (streamingContent) {
      const live = extractLatestArtifact(streamingContent, {
        sessionId,
        messageId: STREAMING_MESSAGE_ID,
      });
      if (live) return live;
    }

    const messages = session.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;
      const found = extractLatestArtifact(msg.content, {
        sessionId,
        messageId: msg.id,
      });
      if (found) return found;
    }
    return null;
  }, [session, streamingContent]);
}
