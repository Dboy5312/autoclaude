import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Upload, X, AlertCircle, FileText, FileType, FileCode, Paperclip } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import type { FileAttachment, FileAttachmentKind } from '../../shared/types';
import {
  MAX_FILE_SIZE,
  MAX_FILES_PER_TASK,
  ALLOWED_PDF_EXTENSIONS,
  ALLOWED_PDF_MIME_TYPES,
  ALLOWED_TEXT_EXTENSIONS,
  ALLOWED_FILE_TYPES_DISPLAY,
} from '../../shared/constants';
import { formatFileSize } from './ImageUpload';

interface FileUploadProps {
  files: FileAttachment[];
  onFilesChange: (files: FileAttachment[]) => void;
  disabled?: boolean;
  className?: string;
}

function generateFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

function classifyFile(file: File): FileAttachmentKind | null {
  const ext = extOf(file.name);
  if (
    (ALLOWED_PDF_MIME_TYPES as readonly string[]).includes(file.type) ||
    (ALLOWED_PDF_EXTENSIONS as readonly string[]).includes(ext)
  ) {
    return 'pdf';
  }
  if ((ALLOWED_TEXT_EXTENSIONS as readonly string[]).includes(ext)) {
    return 'text';
  }
  // Anything else with a text/* MIME falls into text too (e.g. text/plain
  // from drag-drop of unusual extensions).
  if (file.type.startsWith('text/')) return 'text';
  return null;
}

function iconForKind(kind: FileAttachmentKind) {
  if (kind === 'pdf') return FileType;
  if (kind === 'text') return FileCode;
  return FileText;
}

async function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

async function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      // Strip "data:<mime>;base64," prefix for storage uniformity.
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Generic file upload widget — handles PDFs and text-readable files (markdown,
 * code, configs, CSVs, etc.). Images go through ImageUpload separately.
 *
 * Files are classified by extension/MIME, validated for size, and converted
 * into FileAttachment objects ready to be persisted by the backend.
 */
export function FileUpload({
  files,
  onFilesChange,
  disabled = false,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      if (arr.length === 0) return;
      setError(null);

      const remaining = MAX_FILES_PER_TASK - files.length;
      if (remaining <= 0) {
        setError(`Max ${MAX_FILES_PER_TASK} files per task.`);
        return;
      }

      const additions: FileAttachment[] = [];
      const reasons: string[] = [];

      for (const file of arr.slice(0, remaining)) {
        if (file.size > MAX_FILE_SIZE) {
          reasons.push(`${file.name}: too large (${formatFileSize(file.size)})`);
          continue;
        }
        const kind = classifyFile(file);
        if (!kind) {
          reasons.push(`${file.name}: unsupported type`);
          continue;
        }
        try {
          if (kind === 'text') {
            const textContent = await readAsText(file);
            additions.push({
              id: generateFileId(),
              filename: file.name,
              mimeType: file.type || 'text/plain',
              size: file.size,
              kind,
              textContent,
            });
          } else {
            // pdf or binary — base64
            const data = await readAsBase64(file);
            additions.push({
              id: generateFileId(),
              filename: file.name,
              mimeType: file.type || (kind === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
              size: file.size,
              kind,
              data,
            });
          }
        } catch (e) {
          reasons.push(`${file.name}: read failed (${e instanceof Error ? e.message : 'unknown'})`);
        }
      }

      if (arr.length > remaining) {
        reasons.push(`Skipped ${arr.length - remaining} extra file(s) (cap: ${MAX_FILES_PER_TASK}).`);
      }

      if (reasons.length > 0) {
        setError(reasons.join(' • '));
      }
      if (additions.length > 0) {
        onFilesChange([...files, ...additions]);
      }
    },
    [files, onFilesChange],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) void addFiles(e.target.files);
      // reset so picking the same file twice still re-fires onChange
      if (inputRef.current) inputRef.current.value = '';
    },
    [addFiles],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const dropped = e.dataTransfer.files;
      if (dropped?.length) void addFiles(dropped);
    },
    [addFiles, disabled],
  );

  const remove = useCallback(
    (id: string) => onFilesChange(files.filter((f) => f.id !== id)),
    [files, onFilesChange],
  );

  return (
    <div className={cn('space-y-2', className)}>
      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-muted/30 px-3 py-4 text-center transition-colors',
          isDragOver && 'border-primary bg-primary/5',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <Paperclip className="h-5 w-5 text-muted-foreground" aria-hidden />
        <div className="text-xs text-muted-foreground">
          Drop files here or
          <Button
            variant="link"
            size="sm"
            type="button"
            className="px-1 h-auto text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || files.length >= MAX_FILES_PER_TASK}
          >
            browse
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground/80">
          {ALLOWED_FILE_TYPES_DISPLAY} • Max {formatFileSize(MAX_FILE_SIZE)} each, {MAX_FILES_PER_TASK} total
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={[
            ...ALLOWED_PDF_EXTENSIONS,
            ...ALLOWED_TEXT_EXTENSIONS,
          ].join(',')}
          onChange={onPick}
        />
      </div>

      {error && (
        <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => {
            const Icon = iconForKind(f.kind);
            return (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1 truncate font-mono">{f.filename}</span>
                <span className="text-[10px] text-muted-foreground">{formatFileSize(f.size)}</span>
                <span className="text-[10px] uppercase text-muted-foreground/70">{f.kind}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => remove(f.id)}
                  disabled={disabled}
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Re-export Upload for potential consumers that previously imported via ImageUpload.
export { Upload };
