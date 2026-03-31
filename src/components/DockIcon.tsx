import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DockItem, DockPosition } from "../types";
import { launchApp } from "../tauri-bridge";

interface DockIconProps {
  item: DockItem;
  isRunning: boolean;
  iconSize: number;
  showLabel: boolean;
  position: DockPosition;
  onRemove?: (id: string) => void;
  editMode: boolean;
}

const APP_EMOJI: Record<string, string> = {
  finder: "🗂",
  safari: "🧭",
  messages: "💬",
  mail: "📧",
  calendar: "📅",
  terminal: "⬛",
  notes: "📝",
  photos: "🖼",
  music: "🎵",
  podcasts: "🎙",
  maps: "🗺",
  xcode: "🔨",
};

function getFallbackEmoji(item: DockItem): string {
  const key = item.id.toLowerCase();
  for (const [k, v] of Object.entries(APP_EMOJI)) {
    if (key.includes(k)) return v;
  }
  return item.name.charAt(0).toUpperCase();
}

export function DockIcon({
  item,
  isRunning,
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
    opacity: isDragging ? 0.5 : 1,
  };

  const isVertical = position === "left" || position === "right";
  const magnifiedSize = hovered ? iconSize * 1.4 : iconSize;

  function handleMouseEnter() {
    setHovered(true);
    tooltipTimer.current = setTimeout(() => setShowTooltip(true), 600);
  }

  function handleMouseLeave() {
    setHovered(false);
    setShowTooltip(false);
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
  }

  async function handleClick() {
    if (editMode) return;
    setPressed(true);
    setTimeout(() => setPressed(false), 200);
    try {
      await launchApp(item.path);
    } catch (e) {
      console.error("Failed to launch:", e);
    }
  }

  const tooltipDirection =
    position === "bottom" ? "top" :
    position === "top" ? "bottom" :
    position === "left" ? "right" : "left";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex flex-col items-center justify-center select-none ${isVertical ? "flex-col" : "flex-col"}`}
      {...(editMode ? { ...attributes, ...listeners } : {})}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && !editMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: tooltipDirection === "top" ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.12 }}
            className={`absolute z-50 px-2 py-1 rounded-md bg-black/80 text-white text-xs font-medium whitespace-nowrap backdrop-blur-sm pointer-events-none
              ${tooltipDirection === "top" ? "bottom-full mb-2" : ""}
              ${tooltipDirection === "bottom" ? "top-full mt-2" : ""}
              ${tooltipDirection === "right" ? "left-full ml-2" : ""}
              ${tooltipDirection === "left" ? "right-full mr-2" : ""}
            `}
          >
            {item.name}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remove badge in edit mode */}
      {editMode && onRemove && (
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold leading-none hover:bg-red-600 transition-colors"
        >
          ×
        </button>
      )}

      {/* Icon */}
      <motion.button
        onClick={handleClick}
        animate={{
          width: magnifiedSize,
          height: magnifiedSize,
          scale: pressed ? 0.88 : 1,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={`flex items-center justify-center rounded-xl overflow-hidden cursor-pointer
          ${editMode ? "animate-wiggle" : ""}
          focus:outline-none
        `}
        style={{ flexShrink: 0 }}
      >
        {item.icon ? (
          <img
            src={item.icon}
            alt={item.name}
            className="w-full h-full object-contain rounded-xl"
            draggable={false}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center rounded-xl bg-gradient-to-br from-zinc-600 to-zinc-800 text-white font-semibold"
            style={{ fontSize: magnifiedSize * 0.45 }}
          >
            {getFallbackEmoji(item)}
          </div>
        )}
      </motion.button>

      {/* Running indicator */}
      {isRunning && !editMode && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="mt-1 w-1 h-1 rounded-full bg-white/70"
        />
      )}

      {/* Label */}
      {showLabel && !editMode && (
        <span className="mt-0.5 text-white/80 text-[10px] font-medium truncate max-w-[64px] text-center leading-tight">
          {item.name}
        </span>
      )}
    </div>
  );
}
