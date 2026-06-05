import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, FileCode, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { ArtifactView } from './ArtifactView';
import type { Artifact, RenderableFile } from '../../../shared/types/preview';
import { cn } from '../../lib/utils';

interface PreviewSidebarProps {
  /** Absolute path to the active project's working directory. */
  projectPath: string | null;
  className?: string;
  onClose?: () => void;
}

/**
 * Right-pane preview surface launched from the Kanban toolbar.
 *
 * Lists every renderable file (.html, .svg) in the active project, sorted by
 * recency (newest first). User picks one — its contents render in a sandboxed
 * iframe via the existing ArtifactView component. Refresh re-scans the project.
 */
export function PreviewSidebar({ projectPath, className, onClose }: PreviewSidebarProps) {
  const [files, setFiles] = useState<RenderableFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    if (!projectPath) {
      setFiles([]);
      setSelectedPath(null);
      return;
    }
    setIsScanning(true);
    setError(null);
    try {
      const result = await window.electronAPI.listRenderableFiles(projectPath);
      if (!result.success) {
        setError(result.error || 'Failed to scan project');
        setFiles([]);
        return;
      }
      const list = result.data || [];
      setFiles(list);
      // Pick the most recent renderable file when scan completes, unless user
      // already had one selected and it's still in the list.
      setSelectedPath((prev) => {
        if (prev && list.some((f) => f.absolutePath === prev)) return prev;
        return list[0]?.absolutePath ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setFiles([]);
    } finally {
      setIsScanning(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (!selectedPath) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setIsReading(true);
    setError(null);
    window.electronAPI
      .readFile(selectedPath)
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          setError(result.error || 'Failed to read file');
          setContent(null);
        } else {
          setContent(result.data ?? '');
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Unknown error');
        setContent(null);
      })
      .finally(() => {
        if (!cancelled) setIsReading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const selectedFile = files.find((f) => f.absolutePath === selectedPath) ?? null;

  const artifact: Artifact | null = useMemo(() => {
    if (!selectedFile || content === null) return null;
    return {
      id: selectedFile.absolutePath,
      sessionId: 'kanban-preview',
      messageId: 'file',
      blockIndex: 0,
      language: selectedFile.language,
      content,
      version: 1,
      createdAt: selectedFile.modifiedAt,
    };
  }, [selectedFile, content]);

  return (
    <div className={cn('flex h-full w-full flex-col bg-background', className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2 gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          <span className="text-xs font-medium">Preview</span>
          {files.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {files.length} file{files.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadFiles}
            disabled={isScanning || !projectPath}
            title="Rescan project for HTML/SVG files"
            className="h-7 px-2"
          >
            {isScanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              title="Close preview"
              className="h-7 px-2 text-xs"
            >
              ×
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-border px-3 py-2 shrink-0">
        {!projectPath ? (
          <div className="text-xs text-muted-foreground">No project selected</div>
        ) : files.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            {isScanning ? 'Scanning…' : 'No HTML or SVG files found in this project'}
          </div>
        ) : (
          <Select
            value={selectedPath ?? undefined}
            onValueChange={(v) => setSelectedPath(v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Pick a file" />
            </SelectTrigger>
            <SelectContent className="max-h-[60vh]">
              {files.map((f) => (
                <SelectItem key={f.absolutePath} value={f.absolutePath} className="text-xs">
                  <span className="font-mono">{f.relativePath}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex-1 min-h-0 relative">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-destructive">
            <AlertCircle className="h-6 w-6" aria-hidden />
            <div className="text-xs text-center">{error}</div>
          </div>
        ) : isReading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ArtifactView artifact={artifact} />
        )}
      </div>
    </div>
  );
}
