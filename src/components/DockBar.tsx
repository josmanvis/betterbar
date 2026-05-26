import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import {
  GearSix,
} from "@phosphor-icons/react";
import {
  Menu, MenuItem, CheckMenuItem, PredefinedMenuItem,
} from "@tauri-apps/api/menu";
import { DockIcon } from "./DockIcon";
import { TerminalInput } from "./TerminalInput";
import { WorldClock } from "./WorldClock";
import { BatteryIndicator } from "./BatteryIndicator";
import { MusicIndicator } from "./MusicIndicator";
import { WindowPreview } from "./WindowPreview";
import { DEVICE_GLYPHS } from "./deviceIcons";
import {
  AppSet, BAR_LENGTH_MAX, BAR_LENGTH_MIN, BAR_SIZE_MAX, BAR_SIZE_MIN,
  BetterBarConfig, DockItem, FLOAT_DRAG_EDGE, IconStyle, RunningApp, DockPosition,
} from "../types";
import { useRunningApps } from "../hooks/useRunningApps";
import { useRunningWindows } from "../hooks/useRunningWindows";
import { useWindowPosition } from "../hooks/useWindowPosition";
import { useBattery } from "../hooks/useBattery";
import { useMusic } from "../hooks/useMusic";
import { useAppIcons } from "../hooks/useAppIcons";
import {
  checkAccessibilityPermissions,
  requestAccessibilityPermissions,
  checkScreenRecordingPermission,
  requestScreenRecordingPermission,
  openSettingsWindow,
  getWindowOuterPosition,
  getScreenInfo,
  focusApp,
  focusWindow,
  launchSimulator,
} from "../tauri-bridge";

async function handleOpenSettings() {
  try {
    await openSettingsWindow();
  } catch (e) {
    console.error("[BetterBar] Failed to open settings window:", e);
  }
}

const SIM_GROUPS: ({ type: string; label: string } | "sep")[] = [
  { type: "iphone",      label: "iPhone 17" },
  { type: "iphonepro",   label: "iPhone 17 Pro" },
  { type: "iphonepromax", label: "iPhone 17 Pro Max" },
  { type: "iphoneair",   label: "iPhone Air" },
  { type: "iphonee",     label: "iPhone 17e" },
  { type: "ipad",        label: "iPad (A16)" },
  { type: "ipadpro",     label: "iPad Pro 13\" (M5)" },
  { type: "ipadpro11",   label: "iPad Pro 11\" (M5)" },
  { type: "ipadmini",    label: "iPad mini (A17 Pro)" },
  { type: "ipadair",     label: "iPad Air 13\" (M4)" },
  { type: "ipadair11",   label: "iPad Air 11\" (M4)" },
  "sep",
  { type: "windows11",   label: "Windows 11" },
  { type: "macos",       label: "Mac OS" },
];

const SIMS_DEVICES: { type: string; label: string; glyph: string }[] = [
  { type: "ipad",          label: "iPad",           glyph: "ipad" },
  { type: "iphone",        label: "iPhone",         glyph: "iphone" },
  { type: "androidphone",  label: "Android Phone",  glyph: "androidphone" },
  { type: "androidtablet", label: "Android Tablet", glyph: "androidtablet" },
  { type: "windows11",     label: "Windows",        glyph: "windows" },
  { type: "macos",         label: "Mac OS",         glyph: "macos" },
];

async function handleSimulatorMenu() {
  const items: (MenuItem | PredefinedMenuItem)[] = [];
  for (const sim of SIM_GROUPS) {
    if (sim === "sep") {
      items.push(await PredefinedMenuItem.new({ item: "Separator" }));
    } else {
      items.push(await MenuItem.new({
        text: sim.label,
        action: () => {
          console.log("[BB] Launch simulator:", sim.type);
          launchSimulator(sim.type).catch((err) => console.error("[BB] simulator failed:", err));
        },
      }));
    }
  }
  const menu = await Menu.new({ items });
  await menu.popup();
}

interface DockBarProps {
  config: BetterBarConfig;
  activeSet: AppSet;
  onReorder: (items: DockItem[]) => void;
  onRemove: (id: string) => void;
  onSetBarSize: (size: number) => void;
  onSetBarLength: (length: number) => void;
  onSwitchSet: (id: string) => void;
  onFloatPositionChange: (pos: { x: number; y: number } | null) => void;
  onSetFreeFloat: (v: boolean) => void;
  onRenameItem: (id: string, name: string) => void;
  onSetItemHidden: (id: string, hidden: boolean) => void;
  onAddItem: (item: DockItem) => void;
  onToggleGrouping: (bundleId: string) => void;
  onSetItemIcon?: (id: string, icon: string | undefined) => void;
  onSetItemDeviceIcon?: (id: string, deviceIcon: string | undefined) => void;
  onSetItemForceGlyph?: (id: string, forceGlyph: boolean | undefined) => void;
  onSetItemForceNative?: (id: string, forceNative: boolean | undefined) => void;

  onSetItemDisplayType?: (id: string, displayType: "icon" | "icon_label" | "label" | undefined) => void;
}

export function DockBar({
  config, activeSet,
  onReorder, onRemove, onSetBarSize, onSetBarLength,
  onSwitchSet,
  onFloatPositionChange, onSetFreeFloat,
  onRenameItem, onSetItemHidden,
  onAddItem, onToggleGrouping,
  onSetItemIcon, onSetItemDeviceIcon, onSetItemForceGlyph, onSetItemForceNative, onSetItemDisplayType,
}: DockBarProps) {

  const [swipeLabel, setSwipeLabel] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<BarEdge | null>(null);
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [autoLength, setAutoLength] = useState<number | null>(null);
  const [terminalExpanded, setTerminalExpanded] = useState(false);
  const swipeLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const battery = useBattery();
  const music = useMusic();
  const runningApps = useRunningApps();
  const runningWindows = useRunningWindows();
  const isVertical = config.position === "left" || config.position === "right";
  useWindowPosition(config, onFloatPositionChange, autoLength, terminalExpanded && isVertical ? 320 : undefined);

  const sortedItems = [...activeSet.items]
    .filter((i) => !i.hidden)
    .sort((a, b) => a.order - b.order);
  const displayEdge: BarEdge | null = resizing?.edge ?? hoverEdge;

  // Icons fit inside the bar's thickness. Slot = iconSize + 8 (4px gutter each side).
  const iconSize = Math.max(20, config.barSize - 20);

  // Running apps that aren't already in the pinned set (matched by bundle id or
  // name, since some items omit bundleId).
  const pinnedBundleIds = new Set(activeSet.items.map((i) => i.bundleId).filter(Boolean));
  const pinnedNames = new Set(activeSet.items.map((i) => i.name.toLowerCase()));
  const runningUnpinned = config.showRunningApps
    ? runningApps.filter((app) => {
        if (
          config.hideSelf &&
          (app.bundle_id === "com.betterbar.app" ||
            app.bundle_id === "com.google.antigravity" ||
            app.name.toLowerCase() === "betterbar" ||
            app.name.toLowerCase() === "antigravity")
        ) {
          return false;
        }
        return (
          !pinnedBundleIds.has(app.bundle_id) &&
          !pinnedNames.has(app.name.toLowerCase())
        );
      })
    : [];

  const displayRunningUnpinned: Array<{
    app: RunningApp;
    windowId?: number;
    windowTitle?: string;
    key: string;
  }> = [];

  runningUnpinned.forEach((app) => {
    const isUngrouped = app.bundle_id && config.ungroupedBundleIds?.includes(app.bundle_id);
    const appWindows = isUngrouped
      ? runningWindows.filter(
          (w) =>
            w.bundle_id === app.bundle_id ||
            w.owner_name.toLowerCase() === app.name.toLowerCase()
        )
      : [];

    if (isUngrouped && appWindows.length > 0) {
      appWindows.forEach((win) => {
        displayRunningUnpinned.push({
          app,
          windowId: win.id,
          windowTitle: win.title,
          key: `${app.pid}-win-${win.id}`,
        });
      });
    } else {
      displayRunningUnpinned.push({
        app,
        key: `${app.pid}`,
      });
    }
  });

  // Combined list of items + running apps whose icons we want resolved. Pinned
  // items are always resolved (even in GLYPH mode) so a per-item "Default
  // (native)" override has a native icon to show; running-unpinned icons only
  // matter in AUTO mode.
  const iconLookupItems: DockItem[] = [
    ...activeSet.items,
    ...(config.iconStyle === "auto"
      ? runningUnpinned.map((app) => ({
          id: `running-${app.pid}`,
          name: app.name,
          path: "",
          bundleId: app.bundle_id,
          order: 0,
        }))
      : []),
  ];
  const appIcons = useAppIcons(iconLookupItems);

  // Request missing permissions once per launch
  const initialPermsRequested = useRef(false);
  useEffect(() => {
    if (initialPermsRequested.current) return;
    initialPermsRequested.current = true;

    async function requestMissing() {
      try {
        const [ax, sr] = await Promise.all([
          checkAccessibilityPermissions(),
          checkScreenRecordingPermission(),
        ]);
        if (!ax) requestAccessibilityPermissions();
        if (!sr) requestScreenRecordingPermission();
      } catch (e) {
        console.error("[BetterBar] Failed to request permissions:", e);
      }
    }
    requestMissing();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = sortedItems.findIndex((i) => i.id === active.id);
      const newIdx = sortedItems.findIndex((i) => i.id === over.id);
      onReorder(
        arrayMove(sortedItems, oldIdx, newIdx).map((item, idx) => ({ ...item, order: idx }))
      );
    },
    [sortedItems, onReorder]
  );

  function isRunning(item: DockItem) {
    return runningApps.some(
      (app) =>
        app.name.toLowerCase() === item.name.toLowerCase() ||
        (item.bundleId && app.bundle_id.includes(item.name.toLowerCase()))
    );
  }

  function findRunningApp(item: DockItem) {
    return runningApps.find(
      (app) =>
        app.name.toLowerCase() === item.name.toLowerCase() ||
        (item.bundleId && app.bundle_id.includes(item.name.toLowerCase()))
    );
  }

  const activeApp = runningApps.find((app) => app.is_active);

  function isActiveItem(item: DockItem) {
    if (!activeApp) return false;
    return (
      activeApp.name.toLowerCase() === item.name.toLowerCase() ||
      (item.bundleId !== undefined && activeApp.bundle_id === item.bundleId)
    );
  }

  // ── Two-finger swipe to change sets ────────────────────────────────────────
  const swipeAccum = useRef(0);
  const swipeLocked = useRef(false);

  function switchToSet(targetId: string, targetName: string) {
    onSwitchSet(targetId);
    setSwipeLabel(targetName);
    if (swipeLabelTimer.current) clearTimeout(swipeLabelTimer.current);
    swipeLabelTimer.current = setTimeout(() => setSwipeLabel(null), 900);
  }

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey) return;
      const { sets } = config;
      if (sets.length < 2) return;

      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (swipeLocked.current) return;

      swipeAccum.current += delta;
      const THRESHOLD = 50;

      if (swipeAccum.current > THRESHOLD || swipeAccum.current < -THRESHOLD) {
        const forward = swipeAccum.current > 0;
        swipeAccum.current = 0;
        swipeLocked.current = true;
        setTimeout(() => { swipeLocked.current = false; }, 450);

        const idx = sets.findIndex((s) => s.id === config.activeSetId);
        const next = forward
          ? sets[(idx + 1) % sets.length]
          : sets[(idx - 1 + sets.length) % sets.length];
        switchToSet(next.id, next.name);
      }
    },
    [config, onSwitchSet]
  );

  // ── Float-mode + auto length: measure the bar's natural size ───────────────
  useEffect(() => {
    console.log("[BB.autoLengthEffect] run", {
      freeFloat: config.freeFloat, mode: config.barLengthMode,
    });
    if (!config.freeFloat || config.barLengthMode !== "auto") {
      console.log("[BB.autoLengthEffect] not auto → autoLength=null");
      setAutoLength(null);
      return;
    }
    const el = barRef.current;
    if (!el) return;
    const isVertical = config.position === "left" || config.position === "right";

    const measure = () => {
      const r = el.getBoundingClientRect();
      const measured = Math.ceil(isVertical ? r.height : r.width);
      if (measured > 0) {
        setAutoLength((prev) => {
          if (prev === measured) return prev;
          console.log("[BB.autoLengthEffect] measured", measured);
          return measured;
        });
      }
    };

    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [config.freeFloat, config.barLengthMode, config.position, config.barSize,
      config.showLabels, activeSet.items.length]);

  // ── Free-float: persist position after a native drag.
  //   In docked mode this listener is NOT active — programmatic positionWindow
  //   calls in `useWindowPosition` also fire `onMoved`, and we must not mistake
  //   those for user drags (doing so would auto-flip into free-float on boot).
  //   The docked→float transition happens explicitly in `startReposition`.
  useEffect(() => {
    if (!config.freeFloat) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    let raf = 0;

    async function persistPosition() {
      try {
        const [px, py] = await getWindowOuterPosition();
        const screen = await getScreenInfo();
        const scale = screen.scale_factor || 1;
        onFloatPositionChange({ x: px / scale, y: py / scale });
      } catch (e) {
        console.error("[BetterBar] failed to read window position:", e);
      }
    }

    getCurrentWindow()
      .onMoved(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (!cancelled) persistPosition();
        });
      })
      .then((fn) => { if (cancelled) fn(); else unlisten = fn; })
      .catch((e) => console.error("[BetterBar] onMoved listener failed:", e));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      unlisten?.();
    };
  }, [config.freeFloat, onFloatPositionChange]);

  // In float+auto mode the bar shrink-wraps to its content (so we can measure
  // its intrinsic length and resize the OS window to match). Otherwise it fills
  // the window via `inset-0`.
  const edgeClass = config.freeFloat
    ? (config.barLengthMode === "auto" ? "top-0 left-0" : "inset-0")
    : config.position === "left"  ? "left-0 top-0 bottom-0"
    : config.position === "right" ? "right-0 top-0 bottom-0"
    : config.position === "top"   ? "top-0 left-0 right-0"
    :                                "bottom-0 left-0 right-0";

  const panelBorder = config.freeFloat
    ? "border"
    : config.position === "left"  ? "border-r"
    : config.position === "right" ? "border-l"
    : config.position === "top"   ? "border-b"
    :                                "border-t";

  function handleBarMouseMove(e: React.MouseEvent) {
    if (resizing) return;  // freeze edge selection during a resize gesture
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const distTop    = dy;
    const distBottom = r.height - dy;
    const distLeft   = dx;
    const distRight  = r.width - dx;
    const min = Math.min(distTop, distBottom, distLeft, distRight);
    if (min > FLOAT_DRAG_EDGE) { setHoverEdge(null); return; }
    if      (min === distTop)    setHoverEdge("top");
    else if (min === distBottom) setHoverEdge("bottom");
    else if (min === distLeft)   setHoverEdge("left");
    else                          setHoverEdge("right");
  }

  // ── Edge gestures ────────────────────────────────────────────────────────
  // Left-click drag on an edge stripe → reposition (auto-engages free-float).
  // Right-click drag → resize: thickness (`barSize`) on perpendicular edges,
  // length (`barLength`, only in free-float + custom mode) on parallel edges.

  async function startReposition() {
    if (!config.freeFloat) {
      // Snapshot the current docked position so the bar doesn't jump when
      // useWindowPosition switches to the float branch.
      try {
        const [px, py] = await getWindowOuterPosition();
        const screen = await getScreenInfo();
        const scale = screen.scale_factor || 1;
        onFloatPositionChange({ x: px / scale, y: py / scale });
      } catch (e) {
        console.error("[BetterBar] failed to snapshot position:", e);
      }
      onSetFreeFloat(true);
      // Let React commit the state change before the OS drag begins so the
      // mode switch (and `clear_screen_insets`) happens before the move.
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    }
    try { await getCurrentWindow().startDragging(); }
    catch (e) { console.error("[BetterBar] startDragging failed:", e); }
  }

  function startResize(e: React.PointerEvent, edge: BarEdge) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setResizing({
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startSize: config.barSize,
      startLength: config.barLength,
      edge,
    });
  }

  function trackResize(e: React.PointerEvent) {
    if (!resizing || resizing.pointerId !== e.pointerId) return;
    const dx = e.clientX - resizing.startX;
    const dy = e.clientY - resizing.startY;
    const { edge, startSize, startLength } = resizing;
    const vertical = config.position === "left" || config.position === "right";
    const thicknessAxis: "x" | "y" = vertical ? "x" : "y";

    // Outward-signed delta for the grabbed edge.
    const outwardX = edge === "left" ? -dx : edge === "right"  ? dx : 0;
    const outwardY = edge === "top"  ? -dy : edge === "bottom" ? dy : 0;
    const edgeAxis: "x" | "y" = edge === "left" || edge === "right" ? "x" : "y";

    if (edgeAxis === thicknessAxis) {
      const delta = thicknessAxis === "x" ? outwardX : outwardY;
      const next = clamp(Math.round(startSize + delta), BAR_SIZE_MIN, BAR_SIZE_MAX);
      onSetBarSize(next);
    } else if (config.freeFloat && config.barLengthMode === "custom") {
      const delta = edgeAxis === "x" ? outwardX : outwardY;
      const next = clamp(Math.round(startLength + delta), BAR_LENGTH_MIN, BAR_LENGTH_MAX);
      onSetBarLength(next);
    }
  }

  function endResize(e: React.PointerEvent) {
    if (!resizing) return;
    try { (e.target as HTMLElement).releasePointerCapture(resizing.pointerId); } catch {}
    setResizing(null);
  }

  return (
    <>
      <div
        ref={barRef}
        onMouseMove={handleBarMouseMove}
        onMouseLeave={() => { if (!resizing) setHoverEdge(null); }}
        className={`
          fixed ${edgeClass} z-50 flex
          ${isVertical ? "flex-col items-stretch" : "flex-row items-stretch pl-3"}
          ${config.transparentBg ? "bg-black/35 backdrop-blur-md" : "bg-black"} ${panelBorder}
          border-[var(--bb-line)]
          select-none overflow-hidden bb-scanlines
        `}
        style={{
          width: config.freeFloat ? undefined : (isVertical ? config.barSize : undefined),
          height: config.freeFloat ? undefined : (isVertical ? undefined : config.barSize),
          "--bb-accent": config.accentColor || "#c5f500",
          "--bb-accent-d": config.accentColor || "#c5f500",
        } as any}
      >
        {displayEdge && (
          <EdgeDragStrip
            edge={displayEdge}
            showStripe={config.freeFloat || !!resizing}
            allowReposition={config.freeFloat}
            onReposition={startReposition}
            onResizeStart={(e) => startResize(e, displayEdge)}
            onResizeMove={trackResize}
            onResizeEnd={endResize}
          />
        )}

        {/* Top-of-rail terminal stamp / input */}
        {config.showTerminalIcon && (
          <TerminalInput
            isVertical={isVertical}
            onExpandedChange={setTerminalExpanded}
            barSize={config.barSize}
            defaultTerminal={config.defaultTerminal}
            position={config.position}
          />
        )}

        {/* App icons */}
        {config.showDockArea && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={sortedItems.map((i) => i.id)}
            strategy={isVertical ? verticalListSortingStrategy : horizontalListSortingStrategy}
          >
            <div
              className={`
                flex ${isVertical ? "flex-col" : "flex-row"} items-stretch
                ${isVertical ? "w-full pt-1 gap-px" : "h-full pl-1 gap-px"}
              `}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('text/x-betterbar-id')) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDrop={(e) => {
                if (e.dataTransfer.types.includes('text/x-betterbar-id')) return;
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files);
                for (const file of files) {
                  const filePath = (file as any).path;
                  if (!filePath) continue;
                  const name = filePath.split('/').pop() || 'File';
                  onAddItem({
                    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    name,
                    path: filePath,
                    order: sortedItems.length,
                  });
                }
              }}
            >
              {sortedItems.map((item) => {
                // Native icon is used when the item explicitly opts in via
                // "Default (native)" (forceNative) or when the global style is
                // AUTO. In GLYPH mode untouched items fall through to the glyph.
                const wantsNative = item.forceNative || config.iconStyle === "auto";
                const resolvedIcon =
                  item.deviceIcon || item.forceGlyph
                    ? undefined
                    : (item.icon ?? (wantsNative && item.bundleId ? appIcons[item.bundleId] : undefined));
                
                const isUngrouped = item.bundleId && config.ungroupedBundleIds?.includes(item.bundleId);
                const itemWindows = isUngrouped
                  ? runningWindows.filter(
                      (w) =>
                        (item.bundleId && w.bundle_id === item.bundleId) ||
                        w.owner_name.toLowerCase() === item.name.toLowerCase()
                    )
                  : [];

                  if (isUngrouped && itemWindows.length > 0) {
                  return itemWindows.map((win) => (
                    <DockIcon
                      key={`${item.id}-win-${win.id}`}
                      item={{
                        ...item,
                        id: `${item.id}-win-${win.id}`,
                        name: win.title || item.name,
                        icon: resolvedIcon,
                      }}
                      isRunning={true}
                      runningPid={win.pid}
                      windowId={win.id}
                      windowTitle={win.title}
                      iconSize={iconSize}
                      showLabel={config.showLabels}
                      position={config.position}
                      iconStyle={config.iconStyle}
                      grayscaleIdle={config.grayscaleIdle}
                      onRemove={onRemove}
                      onRename={onRenameItem}
                      onHide={(id) => onSetItemHidden(id, true)}
                      onToggleGrouping={onToggleGrouping}
                      onSetItemIcon={onSetItemIcon}
                      onSetItemDeviceIcon={onSetItemDeviceIcon}
                      onSetItemForceGlyph={onSetItemForceGlyph}
                      onSetItemForceNative={onSetItemForceNative}
                      onSetItemDisplayType={onSetItemDisplayType}
                      ungroupedBundleIds={config.ungroupedBundleIds}
                      isActive={isActiveItem(item)}
                    />
                  ));
                }

                return (
                  <DockIcon
                    key={item.id}
                    item={resolvedIcon ? { ...item, icon: resolvedIcon } : item}
                    isRunning={isRunning(item)}
                    isActive={isActiveItem(item)}
                    runningPid={findRunningApp(item)?.pid}
                    iconSize={iconSize}
                    showLabel={config.showLabels}
                    position={config.position}
                    iconStyle={config.iconStyle}
                    grayscaleIdle={config.grayscaleIdle}
                    onRemove={onRemove}
                    onRename={onRenameItem}
                    onHide={(id) => onSetItemHidden(id, true)}
                    onToggleGrouping={onToggleGrouping}
                    onSetItemIcon={onSetItemIcon}
                    onSetItemDeviceIcon={onSetItemDeviceIcon}
                    onSetItemForceGlyph={onSetItemForceGlyph}
                    onSetItemForceNative={onSetItemForceNative}
                    onSetItemDisplayType={onSetItemDisplayType}
                    ungroupedBundleIds={config.ungroupedBundleIds}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        )}

        {/* Running-but-not-pinned apps. Appended after the pinned section, divided
            by a labeled rail divider. Click focuses the app via `open -b`. */}
        {config.showDockArea && config.showRunningApps && runningUnpinned.length > 0 && (
          <>
            <Divider isVertical={isVertical} label="RUN" zoom={config.contentScale} />
            <div
              className={`
                flex ${isVertical ? "flex-col" : "flex-row"} items-stretch
                ${isVertical ? "w-full gap-px" : "h-full gap-px"}
              `}
            >
              {displayRunningUnpinned.map((item) => (
                <RunningAppIcon
                  key={item.key}
                  app={item.app}
                  windowId={item.windowId}
                  windowTitle={item.windowTitle}
                  position={config.position}
                  iconSize={iconSize}
                  iconStyle={config.iconStyle}
                  grayscaleIdle={config.grayscaleIdle}
                  iconUrl={appIcons[item.app.bundle_id]}
                  isVertical={isVertical}
                  onPin={onAddItem}
                  onToggleGrouping={onToggleGrouping}
                  ungroupedBundleIds={config.ungroupedBundleIds}
                  activeSetItemCount={activeSet.items.length}
                />
              ))}
            </div>
          </>
        )}

        {/* In free-float + auto mode the bar shrink-wraps to content, so we omit
            the spacer that would otherwise push the trailing widgets to the end. */}
        {!(config.freeFloat && config.barLengthMode === "auto") && (
          <div className="flex-1" />
        )}

        {/* INDICATORS (scaled by contentScale) */}
        <div style={{ zoom: config.contentScale } as any} className={`flex ${isVertical ? "flex-col" : "flex-row"} items-center justify-center`}>
          {/* World clock */}
          {config.showClocks && (
            <>
              <Divider isVertical={isVertical} label="TIME" />
              <WorldClock isVertical={isVertical} clocks={config.clocks} />
            </>
          )}

          {/* Music controls */}
          {config.showMusic && (
            <>
              <Divider isVertical={isVertical} label="MUS" />
              <MusicIndicator music={music} isVertical={isVertical} />
            </>
          )}

          {/* Battery */}
          {config.showBattery && (
            <>
              <Divider isVertical={isVertical} label="PWR" />
              <BatteryIndicator battery={battery} isVertical={isVertical} />
            </>
          )}

          {/* Set dots — quick switcher (full management lives in settings) */}
          {config.showSetSwitcher && (
            <>
              <Divider isVertical={isVertical} label="SET" />
              <DotsIndicator
                sets={config.sets}
                activeSetId={config.activeSetId}
                isVertical={isVertical}
                onSwitch={switchToSet}
                onWheel={handleWheel}
              />
            </>
          )}

          {/* SIMS — simulator quick-launch icons */}
          {config.showSimIcons && (
            <>
              <Divider isVertical={isVertical} label="SIMS" />
              <div className={`flex ${isVertical ? "flex-col" : "flex-row"} items-stretch ${isVertical ? "w-full gap-px" : "h-full gap-px"}`}>
                {SIMS_DEVICES.map((d) => (
                  <SimButton
                    key={d.type}
                    label={d.label}
                    onClick={() => {
                      console.log("[BB] Launch sim:", d.type);
                      launchSimulator(d.type).catch((err) => console.error("[BB] sim failed:", err));
                    }}
                    barSize={config.barSize}
                  >
                    <span className="w-[14px] h-[14px] flex items-center justify-center">
                      {DEVICE_GLYPHS[d.glyph]}
                    </span>
                  </SimButton>
                ))}
                {config.showSimDropdown && (
                  <SimButton
                    label="More…"
                    onClick={handleSimulatorMenu}
                    barSize={config.barSize}
                  >
                    <span className="text-[10px] font-bold leading-none tracking-wider text-[var(--bb-dim)]">+</span>
                  </SimButton>
                )}
              </div>
            </>
          )}

          {/* Action buttons */}
          <Divider isVertical={isVertical} />
          <div className={`flex ${isVertical ? "flex-col pb-1 gap-px" : "flex-row pr-1 gap-px"} items-center justify-center`}>
            <RailButton
              label="COG"
              active={false}
              onClick={handleOpenSettings}
              isVertical={isVertical}
              barSize={config.barSize}
            >
              <GearSix size={13} weight="bold" />
            </RailButton>
          </div>
        </div>

        {/* Swipe label toast */}
        <AnimatePresence>
          {swipeLabel && (
            <motion.div
              initial={{ opacity: 0, x: 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className={`
                absolute pointer-events-none z-50
                px-2 py-1 bg-black border border-[var(--bb-accent)]
                text-[var(--bb-accent)] text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap
                ${isVertical
                  ? "left-full ml-2 top-1/2 -translate-y-1/2"
                  : "top-full mt-2 left-1/2 -translate-x-1/2"}
              `}
            >
              <span className="opacity-70">SET&gt;</span>&nbsp;{swipeLabel}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ── Running-app icon (running-but-unpinned section) ───────────────────────────
// Right-click shows native context menu: Pin to Dock, Group/Ungroup toggle.

function RunningAppIcon({
  app, iconSize, iconStyle, grayscaleIdle, iconUrl, isVertical, windowId, windowTitle, position,
  onPin, onToggleGrouping, ungroupedBundleIds, activeSetItemCount,
}: {
  app: RunningApp;
  iconSize: number;
  iconStyle: IconStyle;
  grayscaleIdle: boolean;
  iconUrl?: string;
  isVertical: boolean;
  windowId?: number;
  windowTitle?: string;
  position: DockPosition;
  onPin?: (item: DockItem) => void;
  onToggleGrouping?: (bundleId: string) => void;
  ungroupedBundleIds?: string[];
  activeSetItemCount?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initials = app.name.slice(0, 2).toUpperCase();

  const handleMouseEnter = () => {
    setHovered(true);
    tooltipTimer.current = setTimeout(() => setShowTooltip(true), 500);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setShowTooltip(false);
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
  };

  const handleClick = async () => {
    if (windowId && windowTitle) {
      await focusWindow(app.pid, windowTitle).catch(() => focusApp(app.bundle_id));
    } else {
      await focusApp(app.bundle_id).catch((e) => console.error(e));
    }
  };

  async function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setShowTooltip(false);

    const items: (MenuItem | CheckMenuItem | PredefinedMenuItem)[] = [];

    if (onPin) {
      items.push(await MenuItem.new({
        text: "Pin to Dock",
        action: () => {
          const id = `pinned-${app.bundle_id || app.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
          onPin({
            id,
            name: app.name,
            path: "",
            bundleId: app.bundle_id,
            order: activeSetItemCount ?? 0,
          });
        },
      }));
    }

    if (app.bundle_id && onToggleGrouping) {
      const isGrouped = !ungroupedBundleIds?.includes(app.bundle_id);
      items.push(await PredefinedMenuItem.new({ item: "Separator" }));
      items.push(await CheckMenuItem.new({
        text: "Group Windows",
        checked: isGrouped,
        action: () => onToggleGrouping(app.bundle_id),
      }));
    }

    if (items.length === 0) return;
    const menu = await Menu.new({ items });
    await menu.popup();
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center ${isVertical ? "w-full" : "h-full"}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Active app gets a chartreuse running stripe on the inner edge */}
      {app.is_active && (
        <div className={`absolute z-10 bg-[var(--bb-accent)] ${
          isVertical ? "left-0 top-0 bottom-0 w-[2px]" : "top-0 left-0 right-0 h-[2px]"
        }`} />
      )}
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{ width: iconSize + 8, height: iconSize + 8 }}
        className={`
          relative flex items-center justify-center rounded-none focus:outline-none
          select-none cursor-pointer shrink-0
          border ${hovered ? "border-[var(--bb-line-2)] bg-[var(--bb-pane)]" : "border-transparent"}
          transition-colors duration-75
        `}
      >
        <div
          style={{
            width: iconSize,
            height: iconSize,
            filter: !grayscaleIdle || hovered ? "none" : "grayscale(60%) brightness(0.95)",
            transition: "filter 120ms linear",
          }}
          className="flex items-center justify-center shrink-0"
        >
          {iconStyle === "auto" && iconUrl ? (
            <img
              src={iconUrl}
              alt={app.name}
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center bg-[var(--bb-pane-2)] border border-[var(--bb-line-2)] text-[var(--bb-accent)] font-bold tracking-tight"
              style={{ fontSize: Math.max(10, iconSize * 0.32) }}
            >
              {initials}
            </div>
          )}
        </div>
      </button>

      {/* Tooltip / Window Preview */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
            className={`absolute z-50 bg-black border border-[var(--bb-line-2)] shadow-[3px_3px_0_0_rgba(0,0,0,1)] ${tooltipClass(position)} ${
              windowId !== undefined ? "p-1.5" : "px-2 py-1 pointer-events-none whitespace-nowrap"
            }`}
          >
            {windowId !== undefined ? (
              <WindowPreview appName={windowTitle || app.name} pid={app.pid} windowId={windowId} position={position} />
            ) : (
              <span className="text-[11px] text-[var(--bb-text)]">
                <span className="text-[var(--bb-accent)]">&gt;</span> {app.name}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function tooltipClass(position: DockPosition) {
  switch (position) {
    case "left":   return "left-full ml-2 top-1/2 -translate-y-1/2";
    case "right":  return "right-full mr-2 top-1/2 -translate-y-1/2";
    case "top":    return "top-full mt-2 left-1/2 -translate-x-1/2";
    case "bottom": return "bottom-full mb-2 left-1/2 -translate-x-1/2";
  }
}

// ── Divider with optional micro-label ──────────────────────────────────────────

function Divider({ isVertical, label, zoom }: { isVertical: boolean; label?: string; zoom?: number }) {
  if (!label) {
    return (
      <div
        className={`shrink-0 bg-[var(--bb-line)] ${
          isVertical ? "w-full h-px my-1" : "h-full w-px mx-1"
        }`}
      />
    );
  }

  return (
    <div
      className={`shrink-0 flex items-center ${
        isVertical ? "w-full justify-center" : "h-full"
      }`}
      style={zoom ? { zoom } : undefined}
    >
      <div className={`bg-[var(--bb-line)] ${isVertical ? "h-px flex-1" : "w-px h-full"}`} />
      <span
        className={`
          text-[7px] font-semibold uppercase tracking-[0.22em] text-[var(--bb-mute)]
          ${isVertical ? "px-1.5" : "px-1.5 [writing-mode:vertical-rl] rotate-180"}
        `}
      >
        {label}
      </span>
      <div className={`bg-[var(--bb-line)] ${isVertical ? "h-px flex-1" : "w-px h-full"}`} />
    </div>
  );
}

// ── Edge drag-handle: 10px hover band on each bar edge ────────────────────────
//   Left-click + drag → reposition (auto-engages free-float).
//   Right-click + drag → resize (thickness on perpendicular edges, length on
//   parallel edges in free-float + custom mode).

type BarEdge = "top" | "right" | "bottom" | "left";

interface ResizeState {
  pointerId: number;
  startX: number;
  startY: number;
  startSize: number;
  startLength: number;
  edge: BarEdge;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function EdgeDragStrip({
  edge, showStripe, allowReposition,
  onReposition, onResizeStart, onResizeMove, onResizeEnd,
}: {
  edge: BarEdge;
  showStripe: boolean;
  allowReposition: boolean;
  onReposition: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onResizeMove: (e: React.PointerEvent) => void;
  onResizeEnd: (e: React.PointerEvent) => void;
}) {
  const sizing: React.CSSProperties =
    edge === "top"    ? { top: 0,    left: 0, right: 0, height: FLOAT_DRAG_EDGE } :
    edge === "bottom" ? { bottom: 0, left: 0, right: 0, height: FLOAT_DRAG_EDGE } :
    edge === "left"   ? { left: 0,   top: 0, bottom: 0, width: FLOAT_DRAG_EDGE } :
                        { right: 0,  top: 0, bottom: 0, width: FLOAT_DRAG_EDGE };

  const stripeClass =
    edge === "top"    ? "top-0 left-0 right-0 h-[2px]" :
    edge === "bottom" ? "bottom-0 left-0 right-0 h-[2px]" :
    edge === "left"   ? "left-0 top-0 bottom-0 w-[2px]" :
                        "right-0 top-0 bottom-0 w-[2px]";

  function onPointerDown(e: React.PointerEvent) {
    if (e.button === 0) {
      if (!allowReposition) return;
      e.preventDefault();
      e.stopPropagation();
      onReposition();
    } else if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      onResizeStart(e);
    }
  }

  const cursorClass = allowReposition
    ? "cursor-grab active:cursor-grabbing"
    : (edge === "left" || edge === "right" ? "cursor-ew-resize" : "cursor-ns-resize");

  return (
    <div
      style={{ position: "absolute", ...sizing }}
      className={`z-[70] ${cursorClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onResizeMove}
      onPointerUp={onResizeEnd}
      onPointerCancel={onResizeEnd}
      onContextMenu={(e) => e.preventDefault()}
      title={allowReposition ? "Drag to move • Right-drag to resize" : "Right-drag to resize"}
    >
      {showStripe && (
        <div className={`absolute ${stripeClass} bg-[var(--bb-accent)]`} />
      )}
    </div>
  );
}

// ── Set switcher: bracketed slot indicators "[●][○][○]" ────────────────────────
// Click a dot to switch active set. Full set management (rename/delete/add) lives
// in the settings panel — open via the COG button.

interface DotsIndicatorProps {
  sets: AppSet[];
  activeSetId: string;
  isVertical: boolean;
  onSwitch: (id: string, name: string) => void;
  onWheel?: (e: React.WheelEvent) => void;
}

function DotsIndicator({ sets, activeSetId, isVertical, onSwitch, onWheel }: DotsIndicatorProps) {
  return (
    <div
      onWheel={onWheel}
      className={`
        relative flex items-center justify-center
        ${isVertical ? "w-full py-1.5 px-1" : "h-full px-1.5 py-1"}
      `}
    >
      <div className="flex flex-row items-center justify-center gap-px text-[10px] leading-none">
        <span className="text-[var(--bb-mute)]">[</span>
        {sets.map((set) => {
          const isActive = set.id === activeSetId;
          return (
            <button
              key={set.id}
              onClick={() => onSwitch(set.id, set.name)}
              title={set.name}
              className={`
                w-2 h-3 inline-flex items-center justify-center
                font-bold transition-colors
                ${isActive ? "text-[var(--bb-accent)]" : "text-[var(--bb-mute)] hover:text-[var(--bb-text)]"}
              `}
            >
              {isActive ? "■" : "·"}
            </button>
          );
        })}
        <span className="text-[var(--bb-mute)]">]</span>
      </div>
    </div>
  );
}

// ── Rail button: bracket frame + Phosphor icon ─────────────────────────────────

function RailButton({
  label,
  active,
  onClick,
  isVertical,
  barSize,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  isVertical: boolean;
  barSize: number;
  children: React.ReactNode;
}) {
  // Cross-axis (perpendicular to the bar) fits within bar thickness with a small gutter.
  // Main-axis is compact — these are utility buttons, not icon slots.
  const cross = Math.max(20, barSize - 12);
  const main = 28;
  return (
    <button
      onClick={onClick}
      title={label}
      style={
        isVertical
          ? { width: cross, height: main }
          : { width: main, height: cross }
      }
      className={`
        relative shrink-0 flex items-center justify-center
        border border-[var(--bb-line)] mx-1
        ${active
          ? "bg-[var(--bb-accent)] text-black border-[var(--bb-accent)]"
          : "text-[var(--bb-dim)] hover:text-[var(--bb-accent)] hover:border-[var(--bb-accent)]"}
        transition-colors
      `}
    >
      {children}
    </button>
  );
}

function SimButton({
  label,
  onClick,
  barSize,
  children,
}: {
  label: string;
  onClick: () => void;
  barSize: number;
  children: React.ReactNode;
}) {
  const size = Math.max(18, barSize - 10);
  return (
    <button
      onClick={onClick}
      title={label}
      style={{ width: size, height: size }}
      className="shrink-0 flex items-center justify-center border border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-accent)] hover:border-[var(--bb-accent)] transition-colors"
    >
      {children}
    </button>
  );
}

