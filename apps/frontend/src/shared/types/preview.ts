/**
 * Types for the live preview pane (artifacts mode).
 *
 * The preview pane subscribes to the active Insights chat session and renders
 * fenced HTML/SVG blocks emitted by the model in a sandboxed iframe.
 */

export type ArtifactLanguage = 'html' | 'svg';

/** A renderable file discovered in the project tree, returned by the
 * PREVIEW_LIST_RENDERABLE IPC handler. */
export interface RenderableFile {
  absolutePath: string;
  relativePath: string;
  name: string;
  language: ArtifactLanguage;
  sizeBytes: number;
  modifiedAt: number;
}

export interface Artifact {
  /** Stable id: `${sessionId}:${messageId}:${blockIndex}`. Same id across versions. */
  id: string;
  /** Insights session id this artifact came from. */
  sessionId: string;
  /** Insights message id (or 'streaming' for in-flight assistant content). */
  messageId: string;
  /** Index of the fenced block within the source message (0-based). */
  blockIndex: number;
  language: ArtifactLanguage;
  /** Raw fenced-block body (no surrounding backticks). */
  content: string;
  /** Increments when content for the same id changes (used for iframe key invalidation). */
  version: number;
  createdAt: number;
}
