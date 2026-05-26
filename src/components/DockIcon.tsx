import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeSlash, PencilSimple, X } from "@phosphor-icons/react";
import { DockItem, DockPosition, IconStyle } from "../types";
import { launchApp, focusApp, focusWindow } from "../tauri-bridge";
import { WindowPreview } from "./WindowPreview";

interface DockIconProps {
  item: DockItem;
  isRunning: boolean;
  runningPid?: number;
  windowId?: number;
  windowTitle?: string;
  iconSize: number;
  showLabel: boolean;
  position: DockPosition;
  iconStyle?: IconStyle;
  grayscaleIdle?: boolean;
  onRemove?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onHide?: (id: string) => void;
  editMode: boolean;
}

const APP_GLYPH: Record<string, string> = {
  finder:   "FN", safari:   "SF", messages: "MS", mail:     "MA",
  calendar: "CA", terminal: "TM", notes:    "NT", photos:   "PH",
  music:    "MU", podcasts: "PC", maps:     "MP", xcode:    "XC",
};

function getFallbackGlyph(item: DockItem): string {
  const key = item.id.toLowerCase();
  for (const [k, v] of Object.entries(APP_GLYPH)) {
    if (key.includes(k)) return v;
  }
  return item.name.slice(0, 2).toUpperCase();
}

function tooltipClass(position: DockPosition) {
  switch (position) {
    case "left":   return "left-full ml-2 top-1/2 -translate-y-1/2";
    case "right":  return "right-full mr-2 top-1/2 -translate-y-1/2";
    case "top":    return "top-full mt-2 left-1/2 -translate-x-1/2";
    case "bottom": return "bottom-full mb-2 left-1/2 -translate-x-1/2";
  }
}

export function DockIcon({
  item,
  isRunning,
  runningPid,
  windowId,
  windowTitle,
  iconSize,
  showLabel,
  position,
  iconStyle = "auto",
  grayscaleIdle = true,
  onRemove,
  onRename,
  onHide,
  editMode,
}: DockIconProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.name);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close the menu on outside-click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function handleDocDown(e: MouseEvent) {
      const target = e.target as Node;
      const wrap = document.getElementById(`bb-icon-menu-${item.id}`);
      if (wrap && !wrap.contains(target)) setMenuOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setMenuOpen(false); setRenaming(false); }
    }
    document.addEventListener("mousedown", handleDocDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDocDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen, item.id]);

  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);

  function handleContextMenu(e: React.MouseEvent) {
    if (editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setRenameValue(item.name);
    setRenaming(false);
    setMenuOpen(true);
    setShowTooltip(false);
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== item.name && onRename) {
      onRename(item.id, trimmed);
    }
    setRenaming(false);
    setMenuOpen(false);
  }

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
    setTimeout(() => setPressed(false), 120);
    try {
      if (runningPid !== undefined && windowTitle) {
        await focusWindow(runningPid, windowTitle).catch(() => {
          if (item.bundleId) {
            focusApp(item.bundleId).catch(() => launchApp(item.path));
          } else {
            launchApp(item.path);
          }
        });
      } else if (item.bundleId) {
        // focusApp uses `open -b <bundleId>` which is more reliable than paths
        await focusApp(item.bundleId).catch(() => launchApp(item.path));
      } else {
        await launchApp(item.path);
      }
    } catch (e) {
      console.error("[BetterBar] Failed to launch app:", e);
    }
  }

  const isVertical = position === "left" || position === "right";

  // Brutalist running indicator: full-height 2px chartreuse stripe on the inner edge.
  const runningStripeClass =
    position === "left"   ? "left-0 top-0 bottom-0 w-[2px]"  :
    position === "right"  ? "right-0 top-0 bottom-0 w-[2px]" :
    position === "top"    ? "top-0 left-0 right-0 h-[2px]"   :
                            "bottom-0 left-0 right-0 h-[2px]";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex flex-col items-center justify-center ${isVertical ? "w-full" : "h-full"}`}
      {...(editMode ? { ...attributes, ...listeners } : {})}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Running stripe — hard 2px chartreuse on the inner edge */}
      <AnimatePresence>
        {isRunning && !editMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
            className={`absolute z-10 ${runningStripeClass} bg-[var(--bb-accent)]`}
          />
        )}
      </AnimatePresence>

      {/* Remove badge */}
      {editMode && onRemove && (
        <button
          onPointerDown={(e) => { e.stopPropagation(); onRemove(item.id); }}
          className="absolute -top-0.5 -right-0.5 z-20 w-4 h-4 bg-[var(--bb-bad)] text-black flex items-center justify-center border border-black hover:bg-red-500"
        >
          <X size={9} weight="bold" />
        </button>
      )}

      {/* Slot + icon */}
      <motion.button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        animate={{ scale: pressed ? 0.92 : 1 }}
        transition={{ duration: 0.08 }}
        style={{ width: iconSize + 8, height: iconSize + 8 }}
        className={`
          relative flex flex-col items-center justify-center gap-0.5
          rounded-none focus:outline-none select-none cursor-pointer shrink-0
          border ${hovered || isRunning || menuOpen ? "border-[var(--bb-line-2)]" : "border-transparent"}
          ${hovered || menuOpen ? "bg-[var(--bb-pane)]" : "bg-transparent"}
          transition-colors duration-75
          ${editMode ? "animate-wiggle" : ""}
        `}
      >
        <div
          style={{
            width: iconSize,
            height: iconSize,
            filter:
              !grayscaleIdle || isRunning || hovered
                ? "none"
                : "grayscale(80%) contrast(1.05) brightness(0.92)",
            transition: "filter 120ms linear",
          }}
          className="flex items-center justify-center shrink-0"
        >
          {iconStyle === "auto" && item.icon ? (
            <img
              src={item.icon}
              alt={item.name}
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center bg-[var(--bb-pane-2)] border border-[var(--bb-line-2)] text-[var(--bb-accent)] font-bold tracking-tight"
              style={{ fontSize: Math.max(10, iconSize * 0.32) }}
            >
              {getFallbackGlyph(item)}
            </div>
          )}
        </div>

        {showLabel && isVertical && (
          <span className={`
            text-[8px] uppercase tracking-wider leading-none truncate max-w-[58px] text-center font-medium
            ${isRunning ? "text-[var(--bb-accent)]" : "text-[var(--bb-dim)]"}
          `}>
            {item.name}
          </span>
        )}
      </motion.button>

      {/* Context menu (right-click) — overlays the icon slot so it stays
          within the bar's overflow-hidden bounds regardless of bar thickness. */}
      <AnimatePresence>
        {menuOpen && !editMode && (
          <motion.div
            id={`bb-icon-menu-${item.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: iconSize + 8,
              height: iconSize + 8,
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
            }}
            className="absolute z-[60] bg-black border border-[var(--bb-accent)] flex flex-col items-stretch"
          >
            {renaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") { setRenaming(false); setMenuOpen(false); }
                }}
                className="w-full h-full bg-black text-[var(--bb-text)] text-[10px] px-1 outline-none min-w-0 text-center tabular-nums"
                autoFocus
              />
            ) : (
              <>
                <button
                  onClick={() => setRenaming(true)}
                  title="Edit Display"
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[var(--bb-dim)] hover:text-[var(--bb-accent)] hover:bg-[var(--bb-pane)] border-b border-[var(--bb-line)] transition-colors"
                >
                  <PencilSimple size={14} weight="bold" />
                  <span className="text-[7px] uppercase tracking-[0.15em]">Edit</span>
                </button>
                <button
                  onClick={() => { onHide?.(item.id); setMenuOpen(false); }}
                  title="Hide (undo from settings)"
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[var(--bb-dim)] hover:text-[var(--bb-warn)] hover:bg-[var(--bb-pane)] transition-colors"
                >
                  <EyeSlash size={14} weight="bold" />
                  <span className="text-[7px] uppercase tracking-[0.15em]">Hide</span>
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip / Window Preview */}
      <AnimatePresence>
        {showTooltip && !menuOpen && !editMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
            className={`absolute z-50 bg-black border border-[var(--bb-line-2)] shadow-[3px_3px_0_0_rgba(0,0,0,1)] ${tooltipClass(position)} ${
              isRunning && runningPid !== undefined
                ? "p-1.5"
                : "px-2 py-1 pointer-events-none whitespace-nowrap"
            }`}
          >
            {isRunning && runningPid !== undefined ? (
              <WindowPreview appName={item.name} pid={runningPid} windowId={windowId} position={position} />
            ) : (
              <span className="text-[11px] text-[var(--bb-text)]">
                <span className="text-[var(--bb-accent)]">&gt;</span> {item.name}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
