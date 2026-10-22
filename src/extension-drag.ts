import { useRef, useState, type PointerEvent, type MouseEvent, type DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

export type DragOutcome = "dropped" | "cancelled";

/** Start a native, copy-only file drag. Resolves when the user drops or cancels. */
export function startDrag({ paths }: { paths: string[] }): Promise<DragOutcome> {
  return invoke<DragOutcome>("start_extension_drag", { paths });
}

/** Bind to a file/app tile. Clicks stay clicks until the pointer moves 6px. */
export function useDragSource({ paths, onError, onDragEnd, onDraggingChange }: {
  paths: string[];
  onError?: (error: unknown) => void;
  onDragEnd?: (outcome: DragOutcome) => void;
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const active = useRef(false);
  const pressed = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);
  const release = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pressed.current = null;
  };
  return {
    dragging,
    dragProps: {
      draggable: false,
      onDragStart: (event: DragEvent<HTMLElement>) => event.preventDefault(),
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || !event.isPrimary || active.current) return;
        suppressClick.current = false;
        pressed.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const origin = pressed.current;
        if (!origin || origin.id !== event.pointerId || active.current) return;
        if (!(event.buttons & 1)) { release(event); return; }
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 6) return;
        event.preventDefault();
        release(event);
        active.current = true;
        suppressClick.current = true;
        setDragging(true);
        onDraggingChange?.(true);
        void startDrag({ paths }).then(outcome => onDragEnd?.(outcome)).catch(error => onError?.(error)).finally(() => {
          active.current = false;
          setDragging(false);
          onDraggingChange?.(false);
        });
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: () => { pressed.current = null; },
      onClickCapture: (event: MouseEvent<HTMLElement>) => {
        if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
      },
    },
  };
}
