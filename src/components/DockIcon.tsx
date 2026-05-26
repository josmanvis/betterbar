import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Menu, MenuItem, CheckMenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import type { ReactNode } from "react";
import { DockItem, DockPosition, IconStyle } from "../types";
import { launchApp, focusApp, focusWindow, hideApp, quitApp, zoomAppWindow } from "../tauri-bridge";
import { WindowPreview } from "./WindowPreview";

interface DockIconProps {
  item: DockItem;
  isRunning: boolean;
  isActive?: boolean;
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
  onToggleGrouping?: (bundleId: string) => void;
  onSetItemIcon?: (id: string, icon: string | undefined) => void;
  onSetItemDeviceIcon?: (id: string, deviceIcon: string | undefined) => void;
  onSetItemForceGlyph?: (id: string, forceGlyph: boolean | undefined) => void;
  onSetItemDisplayType?: (id: string, displayType: "icon" | "icon_label" | "label" | undefined) => void;
  ungroupedBundleIds?: string[];
}

const APP_GLYPH: Record<string, string> = {
  finder:   "FN", safari:   "SF", messages: "MS", mail:     "MA",
  calendar: "CA", terminal: "TM", notes:    "NT", photos:   "PH",
  music:    "MU", podcasts: "PC", maps:     "MP", xcode:    "XC",
};

const DEVICE_ICONS: Record<string, ReactNode> = {
  ipad: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <rect x="1" y="4" width="18" height="12" rx="1"/>
    </svg>
  ),
  iphone: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <rect x="5" y="1" width="10" height="18" rx="2"/>
    </svg>
  ),
  watch: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <rect x="5" y="4" width="10" height="12" rx="2.5"/>
    </svg>
  ),
  windows: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M2 2h7v7H2zM11 2h7v7h-7zM2 11h7v7H2zM11 11h7v7h-7z"/>
    </svg>
  ),
  macos: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M10 1c-2 0-3.5 1.5-4.5 3.5S4 8.5 4 10c0 2.5 1.5 5 3 6s1.5 1 3 0 4.5-4 4.5-6.5c0-2.5-1.5-6-4-7S11 1 10 1z"/>
    </svg>
  ),
  linux: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M10 2C7 2 5 4.5 5 7.5c0 1.5.5 2.5 1.5 3.5L5 14c0 0 1.5 2 5 2s5-2 5-2l-1.5-3c1-1 1.5-2 1.5-3.5C15 4.5 13 2 10 2z"/>
    </svg>
  ),
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
  isActive,
  runningPid,
  windowId,
  windowTitle,
  iconSize,
  showLabel,
  position,
  grayscaleIdle = true,
  onRemove,
  onRename,
  onHide,
  onToggleGrouping,
  onSetItemIcon,
  onSetItemDeviceIcon,
  onSetItemForceGlyph,
  onSetItemDisplayType,
  ungroupedBundleIds,
}: DockIconProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.name);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (!renaming) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRenaming(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [renaming]);

  async function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setShowTooltip(false);

    const items: (MenuItem | CheckMenuItem | PredefinedMenuItem | Submenu)[] = [];

    items.push(await MenuItem.new({
      text: "Rename",
      action: () => {
        setRenameValue(item.name);
        setRenaming(true);
      },
    }));

    // ── Running-app actions ──────────────────────────────────────────
    if (isRunning && item.bundleId) {
      items.push(await PredefinedMenuItem.new({ item: "Separator" }));

      const bid = item.bundleId;
      items.push(await MenuItem.new({
        text: "Show All Windows",
        action: () => {
          console.log("[BB] Show All Windows", bid);
          focusApp(bid).catch((e) => console.error("[BB] focusApp failed:", e));
        },
      }));

      items.push(await MenuItem.new({
        text: "Maximize",
        action: () => {
          console.log("[BB] Maximize", bid);
          zoomAppWindow(bid).catch((e) => console.error("[BB] zoomAppWindow failed:", e));
        },
      }));

      items.push(await MenuItem.new({
        text: "Hide",
        action: () => {
          console.log("[BB] Hide app", bid);
          hideApp(bid).catch((e) => console.error("[BB] hideApp failed:", e));
        },
      }));

      items.push(await MenuItem.new({
        text: "Quit",
        action: () => {
          console.log("[BB] Quit", bid);
          quitApp(bid).catch((e) => console.error("[BB] quitApp failed:", e));
        },
      }));
    }

    items.push(await PredefinedMenuItem.new({ item: "Separator" }));

    // ── Change Icon submenu ────────────────────────────────────────
    const iconItems: (MenuItem | PredefinedMenuItem)[] = [];

    iconItems.push(await MenuItem.new({
      text: "Default (native)",
      action: () => {
        onSetItemDeviceIcon?.(item.id, undefined);
        onSetItemForceGlyph?.(item.id, undefined);
      },
    }));

    iconItems.push(await MenuItem.new({
      text: "Glyph",
      action: () => onSetItemForceGlyph?.(item.id, true),
    }));

    iconItems.push(await PredefinedMenuItem.new({ item: "Separator" }));

    const deviceKeys = [
      { key: "ipad",    label: "iPad" },
      { key: "iphone",  label: "iPhone" },
      { key: "watch",   label: "Apple Watch" },
      { key: "windows", label: "Windows" },
      { key: "macos",   label: "macOS" },
      { key: "linux",   label: "Linux" },
    ];

    for (const d of deviceKeys) {
      iconItems.push(await MenuItem.new({
        text: d.label,
        action: () => onSetItemDeviceIcon?.(item.id, d.key),
      }));
    }

    iconItems.push(await PredefinedMenuItem.new({ item: "Separator" }));

    iconItems.push(await MenuItem.new({
      text: "Custom Image...",
      action: () => fileInputRef.current?.click(),
    }));

    const changeIconSubmenu = await Submenu.new({
      text: "Change Icon",
      items: iconItems,
    });

    items.push(changeIconSubmenu);

    // ── Display Type submenu ────────────────────────────────────────
    const displayTypeItems: (MenuItem | CheckMenuItem | PredefinedMenuItem)[] = [];
    const displayTypeOptions = [
      { value: "icon" as const, label: "App Icon" },
      { value: "icon_label" as const, label: "App Icon + Label" },
      { value: "label" as const, label: "Label" },
    ];
    const currentDisplayType = item.displayType ?? "icon";

    for (const opt of displayTypeOptions) {
      displayTypeItems.push(await CheckMenuItem.new({
        text: opt.label,
        checked: currentDisplayType === opt.value,
        action: () => onSetItemDisplayType?.(item.id, opt.value),
      }));
    }

    displayTypeItems.push(await PredefinedMenuItem.new({ item: "Separator" }));

    displayTypeItems.push(await MenuItem.new({
      text: "None / Hide",
      action: () => onHide?.(item.id),
    }));

    const displayTypeSubmenu = await Submenu.new({
      text: "Display Type",
      items: displayTypeItems,
    });

    items.push(displayTypeSubmenu);

    // ── Dock item management ─────────────────────────────────────────
    items.push(await PredefinedMenuItem.new({ item: "Separator" }));

    if (onRemove && item.bundleId) {
      items.push(await MenuItem.new({
        text: "Unpin",
        action: () => onRemove(item.id),
      }));
    }

    items.push(await MenuItem.new({
      text: "Hide from Dock",
      action: () => onHide?.(item.id),
    }));

    if (onRemove && !item.bundleId) {
      items.push(await MenuItem.new({
        text: "Remove from Dock",
        action: () => onRemove(item.id),
      }));
    }

    // ── Group Windows toggle ────────────────────────────────────────
    if (item.bundleId && onToggleGrouping) {
      const isGrouped = !ungroupedBundleIds?.includes(item.bundleId);
      items.push(await PredefinedMenuItem.new({ item: "Separator" }));
      items.push(await CheckMenuItem.new({
        text: "Group Windows",
        checked: isGrouped,
        action: () => onToggleGrouping(item.bundleId!),
      }));
    }

    const menu = await Menu.new({ items });
    await menu.popup();
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== item.name && onRename) {
      onRename(item.id, trimmed);
    }
    setRenaming(false);
  }

  const isFileItem = !!(!item.bundleId && item.path);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: isFileItem });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function handleMouseEnter() {
    setHovered(true);
    if (!renaming) {
      tooltipTimer.current = setTimeout(() => setShowTooltip(true), 500);
    }
  }
  function handleMouseLeave() {
    setHovered(false);
    setShowTooltip(false);
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
  }

  async function handleClick() {
    if (renaming) return;
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
        await focusApp(item.bundleId).catch(() => launchApp(item.path));
      } else {
        await launchApp(item.path);
      }
    } catch (e) {
      console.error("[BetterBar] Failed to launch app:", e);
    }
  }

  const isVertical = position === "left" || position === "right";
  const effectiveShowLabel = item.displayType
    ? item.displayType === "icon_label" || item.displayType === "label"
    : item.showLabel !== undefined
      ? item.showLabel
      : showLabel;
  const showIcon = item.displayType ? item.displayType !== "label" : true;

  const runningStripeClass =
    position === "left"   ? "left-0 top-0 bottom-0 w-[2px]"  :
    position === "right"  ? "right-0 top-0 bottom-0 w-[2px]" :
    position === "top"    ? "top-0 left-0 right-0 h-[2px]"   :
                            "bottom-0 left-0 right-0 h-[2px]";

  return (
    <div
      ref={setNodeRef}
      style={style}
      draggable={isFileItem}
      onDragStart={isFileItem ? (e: React.DragEvent) => {
        e.dataTransfer.setData('text/x-betterbar-id', item.id);
        e.dataTransfer.setData('text/uri-list', 'file://' + item.path);
        e.dataTransfer.setData('text/plain', item.path);
        e.dataTransfer.effectAllowed = 'copy';
      } : undefined}
      className={`relative flex flex-col items-center justify-center ${isVertical ? "w-full" : "h-full"}`}
      {...attributes}
      {...listeners}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
            className={`absolute z-10 ${runningStripeClass} bg-[var(--bb-accent)]`}
          />
        )}
      </AnimatePresence>

      <motion.button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        animate={{ scale: pressed ? 0.92 : 1 }}
        transition={{ duration: 0.08 }}
        style={
          renaming
            ? { minWidth: 140, minHeight: iconSize + 8 }
            : effectiveShowLabel
              ? isVertical
                ? { width: iconSize + 8 }
                : { height: iconSize + 8 }
              : { width: iconSize + 8, height: iconSize + 8 }
        }
        className={`
          relative flex ${effectiveShowLabel && !isVertical ? "flex-row items-center" : "flex-col items-center justify-center"} gap-2
          rounded-none focus:outline-none select-none cursor-pointer
          ${effectiveShowLabel ? "" : "shrink-0"}
          border ${hovered || isRunning ? "border-[var(--bb-line-2)]" : "border-transparent"}
          ${hovered ? "bg-[var(--bb-pane)]" : "bg-transparent"}
          transition-colors duration-75 ${effectiveShowLabel ? "px-3" : ""}
        `}
      >
        {renaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setRenaming(false); }
            }}
            className="w-full h-full bg-black text-[var(--bb-text)] text-[10px] px-2 outline-none min-w-[140px] text-left tabular-nums border border-[var(--bb-accent)]"
            autoFocus
          />
        ) : (
          <>
            {showIcon && (
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
                {item.forceGlyph ? (
                  <div
                    className="w-full h-full flex items-center justify-center bg-[var(--bb-pane-2)] border border-[var(--bb-line-2)] text-[var(--bb-accent)] font-bold tracking-tight"
                    style={{ fontSize: Math.max(10, iconSize * 0.32) }}
                  >
                    {getFallbackGlyph(item)}
                  </div>
                ) : item.deviceIcon && DEVICE_ICONS[item.deviceIcon] ? (
                  <div className="w-full h-full flex items-center justify-center text-[var(--bb-accent)] p-1.5">
                    {DEVICE_ICONS[item.deviceIcon]}
                  </div>
                ) : item.icon ? (
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
            )}

            {effectiveShowLabel && (
              <span className={`
                text-[9px] uppercase tracking-wider leading-none truncate font-medium
                ${isVertical ? "max-w-[58px] text-center" : "max-w-[120px] text-left"}
                ${isRunning ? "text-[var(--bb-accent)]" : "text-[var(--bb-dim)]"}
                px-1
              `}>
                {item.name}
              </span>
            )}
          </>
        )}
      </motion.button>

      <AnimatePresence>
        {showTooltip && !renaming && (
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onSetItemIcon?.(item.id, reader.result as string);
          reader.readAsDataURL(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
