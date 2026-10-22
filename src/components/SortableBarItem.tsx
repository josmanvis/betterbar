import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BarItemId } from "../types";

export function SortableBarItem({ id, label, normalDrag, spacer, vertical, style, maxCross, textScale, children }: {
  id: BarItemId; label: string; normalDrag?: boolean; spacer?: boolean; vertical: boolean; style?: CSSProperties; maxCross?: number; textScale?: number; children?: ReactNode;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id });
  return <div ref={setNodeRef} data-bb-item={id} className={`bb-bar-item flex ${vertical ? "flex-col" : "flex-row"} ${spacer ? "flex-1" : "shrink-0"}`}
    title={`⌘-drag to move ${label}`}
    style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .4 : 1,
      position: "relative", zIndex: isDragging ? 60 : undefined }}
    onPointerDownCapture={event => {
      if (event.button !== 0 || (!event.metaKey && !normalDrag)) return;
      listeners?.onPointerDown?.(event);
      if (event.metaKey) { event.preventDefault(); event.stopPropagation(); }
    }}
    onClickCapture={event => { if (event.metaKey) { event.preventDefault(); event.stopPropagation(); } }}>
    {!spacer && <FittedBarContent vertical={vertical} style={style} maxCross={maxCross} textScale={textScale}>{children}</FittedBarContent>}
  </div>;
}

export function fitBarScale(requested: number, naturalCross: number, maxCross?: number) {
  return maxCross && naturalCross > 0 ? Math.min(requested, maxCross / naturalCross) : requested;
}
function FittedBarContent({ vertical, style, maxCross, textScale = 1, children }: { vertical: boolean; style?: CSSProperties; maxCross?: number; textScale?: number; children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);
  const [naturalCross, setNaturalCross] = useState(0);
  const requested = Number(style?.zoom ?? 1);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    const measure = () => setNaturalCross(vertical ? node.offsetWidth : node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [vertical]);
  const scale = fitBarScale(requested, naturalCross, maxCross);
  return <div ref={element} className={`bb-bar-content flex ${vertical ? "flex-col" : "flex-row"} items-center justify-center`}
    style={{ ...style, alignSelf: "center", flex: "none", zoom: scale, "--bb-font-floor": `${8 / Math.max(.05, Math.min(requested, textScale))}px`, "--bb-tooltip-scale": 1 / scale } as CSSProperties}>{children}</div>;
}
