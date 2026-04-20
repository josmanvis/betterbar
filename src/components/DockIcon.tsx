import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DockItem, DockPosition } from "../types";
import { launchApp } from "../tauri-bridge";
import { WindowPreview } from "./WindowPreview";

interface DockIconProps {
  item: DockItem;
  isRunning: boolean;
  runningPid?: number;
  iconSize: number;
  showLabel: boolean;
  position: DockPosition;
  onRemove?: (id: string) => void;
  editMode: boolean;
}

const APP_EMOJI: Record<string, string> = {
  finder: "🗂", safari: "🧭", messages: "💬", mail: "📧",
  calendar: "📅", terminal: "⬛", notes: "📝", photos: "🖼",
  music: "🎵", podcasts: "🎙", maps: "🗺", xcode: "🔨",
};

function getFallbackEmoji(item: DockItem): string {
  const key = item.id.toLowerCase();
  for (const [k, v] of Object.entries(APP_EMOJI)) {
    if (key.includes(k)) return v;
  }
  return item.name.charAt(0).toUpperCase();
}

function tooltipClass(position: DockPosition) {
  switch (position) {
    case "left":   return "left-full ml-3 top-1/2 -translate-y-1/2";
    case "right":  return "right-full mr-3 top-1/2 -translate-y-1/2";
    case "top":    return "top-full mt-3 left-1/2 -translate-x-1/2";
    case "bottom": return "bottom-full mb-3 left-1/2 -translate-x-1/2";
  }
}

export function DockIcon({
  item,
  isRunning,
  runningPid,
  iconSize,
  showLabel,
  position,
  onRemove,
  editMode,
}: DockIconProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function handleMouseEnter() {
    setHovered(true);
    tooltipTimer.current = setTimeout(() => setShowTooltip(true), 500);
  }
  function handleMouseLeave() {
    setHovered(false);
    setShowTooltip(false);
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
  }
  async function handleClick() {
    if (editMode) return;
    setPressed(true);
    setTimeout(() => setPressed(false), 180);
    try { await launchApp(item.path); } catch (e) { console.error(e); }
  }

  const isVertical = position === "left" || position === "right";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex flex-col items-center ${isVertical ? "w-full" : "h-full"}`}
      {...(editMode ? { ...attributes, ...listeners } : {})}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Running indicator — left edge stripe (Sidebar.app style) */}
      <AnimatePresence>
        {isRunning && !editMode && (
          <motion.div
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{ scaleY: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 600, damping: 40 }}
            className={`absolute ${
              position === "left"   ? "left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" :
              position === "right"  ? "right-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-l-full" :
              position === "top"    ? "top-0 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-b-full" :
                                      "bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-t-full"
            } bg-white`}
          />
        )}
      </AnimatePresence>

      {/* Remove badge */}
      {editMode && onRemove && (
        <button
          onPointerDown={(e) => { e.stopPropagation(); onRemove(item.id); }}
          className="absolute -top-1 -right-1 z-10 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold hover:bg-red-600 transition-colors"
        >
          ×
        </button>
      )}

      {/* Hover background + icon */}
      <motion.button
        onClick={handleClick}
        animate={{ scale: pressed ? 0.82 : hovered ? 1.06 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        style={{ width: iconSize + 12, height: iconSize + 12 }}
        className={`
          relative flex flex-col items-center justify-center gap-0.5 rounded-xl
          focus:outline-none select-none cursor-pointer shrink-0
          transition-colors duration-100
          ${hovered ? "bg-white/[0.08]" : "bg-transparent"}
          ${editMode ? "animate-wiggle" : ""}
        `}
      >
        {/* App icon */}
        <div
          style={{ width: iconSize, height: iconSize }}
          className="flex items-center justify-center shrink-0"
        >
          {item.icon ? (
            <img
              src={item.icon}
              alt={item.name}
              className="w-full h-full object-contain rounded-[22%]"
              draggable={false}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center rounded-[22%] bg-gradient-to-br from-zinc-600 to-zinc-800 text-white font-semibold shadow-inner"
              style={{ fontSize: iconSize * 0.4 }}
            >
              {getFallbackEmoji(item)}
            </div>
          )}
        </div>

        {/* Label (only when enabled and sidebar is vertical) */}
        {showLabel && isVertical && (
          <span className="text-[9px] text-zinc-400 leading-none truncate max-w-[56px] text-center">
            {item.name}
          </span>
        )}
      </motion.button>

      {/* Tooltip / Window Preview */}
      <AnimatePresence>
        {showTooltip && !editMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ duration: 0.1 }}
            className={`absolute z-50 rounded-xl bg-zinc-800 border border-white/[0.08] shadow-xl ${tooltipClass(position)} ${
              isRunning && runningPid !== undefined
                ? "p-2.5"
                : "px-2.5 py-1 pointer-events-none whitespace-nowrap"
            }`}
          >
            {isRunning && runningPid !== undefined ? (
              <WindowPreview appName={item.name} pid={runningPid} position={position} />
            ) : (
              <span className="text-xs font-medium text-white">{item.name}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
