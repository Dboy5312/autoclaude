import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { ResizablePanels } from '../ui/resizable-panels';
import { Button } from '../ui/button';
import { PreviewSidebar } from './PreviewSidebar';
import { useProjectStore } from '../../stores/project-store';

interface KanbanWithPreviewProps {
  /** The KanbanBoard (or any board content) to render in the left pane. */
  children: ReactNode;
}

const STORAGE_KEY_OPEN = 'kanban-preview-open';

/**
 * Wraps the Kanban view with a togglable right-side preview pane that lists
 * renderable files (.html, .svg) in the active project and renders the selected
 * one in a sandboxed iframe.
 *
 * - Toggle button (Eye icon) sits on the right edge of the Kanban viewport.
 * - When open, layout splits via ResizablePanels (60/40 default, draggable).
 * - When closed, the original Kanban occupies the full width — no perf cost.
 * - Open/close state and pane width both persist to localStorage.
 */
export function KanbanWithPreview({ children }: KanbanWithPreviewProps) {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_OPEN) === 'true';
    } catch {
      return false;
    }
  });

  const projectPath = useProjectStore((s) => {
    const id = s.activeProjectId || s.selectedProjectId;
    if (!id) return null;
    return s.projects.find((p) => p.id === id)?.path ?? null;
  });

  const toggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY_OPEN, String(next));
      } catch {
        // localStorage may be unavailable
      }
      return next;
    });
  };

  // Floats in the bottom-right of the Kanban viewport so it never collides with
  // the Refresh / Expand-All buttons in the Kanban header.
  const ToggleButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      title={isOpen ? 'Hide preview pane' : 'Show preview pane'}
      className="absolute bottom-4 right-4 z-10 h-9 gap-1.5 px-3 shadow-md"
    >
      {isOpen ? (
        <>
          <EyeOff className="h-3.5 w-3.5" />
          <span className="text-xs">Hide preview</span>
        </>
      ) : (
        <>
          <Eye className="h-3.5 w-3.5" />
          <span className="text-xs">Preview</span>
        </>
      )}
    </Button>
  );

  if (!isOpen) {
    return (
      <div className="relative h-full w-full">
        {children}
        {ToggleButton}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ResizablePanels
        storageKey="kanban-preview-pane-width"
        defaultLeftWidth={60}
        minLeftWidth={35}
        maxLeftWidth={75}
        leftPanel={children}
        rightPanel={
          <PreviewSidebar projectPath={projectPath} onClose={toggle} />
        }
        className="h-full"
      />
      {ToggleButton}
    </div>
  );
}
