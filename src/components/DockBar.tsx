import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { DockIcon } from "./DockIcon";
import { SettingsPanel } from "./SettingsPanel";
import { WorldClock } from "./WorldClock";
import { BatteryIndicator } from "./BatteryIndicator";
import { AppSet, BetterBarConfig, DockItem, DockPosition } from "../types";
import { useRunningApps } from "../hooks/useRunningApps";
import { useWindowPosition } from "../hooks/useWindowPosition";
import { useBattery } from "../hooks/useBattery";
import { checkAccessibilityPermissions, requestAccessibilityPermissions } from "../tauri-bridge";

interface DockBarProps {
  config: BetterBarConfig;
  activeSet: AppSet;
  onReorder: (items: DockItem[]) => void;
  onRemove: (id: string) => void;
  onSetPosition: (p: DockPosition) => void;
  onSetIconSize: (s: number) => void;
  onToggleAutoHide: () => void;
  onToggleLabels: () => void;
  onSwitchSet: (id: string) => void;
  onAddSet: (name: string) => void;
  onRenameSet: (id: string, name: string) => void;
  onDeleteSet: (id: string) => void;
}

export function DockBar({
  config, activeSet,
  onReorder, onRemove,
  onSetPosition, onSetIconSize, onToggleAutoHide, onToggleLabels,
  onSwitchSet, onAddSet, onRenameSet, onDeleteSet,
}: DockBarProps) {
  const [editMode, setEditMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [axGranted, setAxGranted] = useState<boolean | null>(null);
  // Label that briefly appears when swiping sets
  const [swipeLabel, setSwipeLabel] = useState<string | null>(null);
  const swipeLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const battery = useBattery();
  const runningApps = useRunningApps();
  useWindowPosition(config);

  const isVertical = config.position === "left" || config.position === "right";
  const sortedItems = [...activeSet.items].sort((a, b) => a.order - b.order);

  useEffect(() => {
    checkAccessibilityPermissions().then(setAxGranted).catch(() => setAxGranted(false));
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

  // ── Two-finger swipe to change sets ────────────────────────────────────────
  const swipeAccum = useRef(0);
  const swipeLocked = useRef(false);

  function switchToSet(targetId: string, targetName: string) {
    onSwitchSet(targetId);
    // Flash label
    setSwipeLabel(targetName);
    if (swipeLabelTimer.current) clearTimeout(swipeLabelTimer.current);
    swipeLabelTimer.current = setTimeout(() => setSwipeLabel(null), 900);
  }

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey) return; // ignore pinch
      const { sets } = config;
      if (sets.length < 2) return;

      // Use whichever axis has more movement
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

  // Panel positioning
  const edgeClass =
    config.position === "left"  ? "left-0 top-0 bottom-0" :
    config.position === "right" ? "right-0 top-0 bottom-0" :
    config.position === "top"   ? "top-0 left-0 right-0" :
                                   "bottom-0 left-0 right-0";

  const panelBorder =
    config.position === "left"  ? "border-r" :
    config.position === "right" ? "border-l" :
    config.position === "top"   ? "border-b" :
                                   "border-t";

  return (
    <>
      <div
        onWheel={handleWheel}
        className={`
          fixed ${edgeClass} z-50 flex
          ${isVertical ? "flex-col items-center" : "flex-row items-center"}
          bg-green-950/[0.88] backdrop-blur-2xl
          ${panelBorder} border-white/[0.06]
          select-none overflow-hidden
        `}
        style={{ width: isVertical ? 68 : undefined, height: isVertical ? undefined : 68 }}
      >
        {/* Accessibility banner */}
        {axGranted === false && (
          <button
            onClick={() => requestAccessibilityPermissions()}
            title="Grant Accessibility permissions"
            className={`
              shrink-0 flex items-center justify-center gap-1 text-amber-300
              bg-amber-500/15 hover:bg-amber-500/25 transition-colors
              ${isVertical ? "w-full py-2 text-[9px] flex-col" : "h-full px-3 text-[9px] flex-row"}
            `}
          >
            <span className="text-[13px]">⚠</span>
            <span className="leading-tight text-center">Needs access</span>
          </button>
        )}

        {/* App icons */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={sortedItems.map((i) => i.id)}
            strategy={isVertical ? verticalListSortingStrategy : horizontalListSortingStrategy}
          >
            <div
              className={`
                flex ${isVertical ? "flex-col" : "flex-row"} items-center
                ${isVertical
                  ? "w-full pt-2 gap-0.5 overflow-y-auto"
                  : "h-full pl-2 gap-0.5 overflow-x-auto"}
                scrollbar-none
              `}
            >
              {sortedItems.map((item) => (
                <DockIcon
                  key={item.id}
                  item={item}
                  isRunning={isRunning(item)}
                  runningPid={findRunningApp(item)?.pid}
                  iconSize={config.iconSize}
                  showLabel={config.showLabels}
                  position={config.position}
                  onRemove={onRemove}
                  editMode={editMode}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex-1" />

        {/* World clock */}
        <Divider isVertical={isVertical} />
        <WorldClock isVertical={isVertical} />

        {/* Battery */}
        <Divider isVertical={isVertical} />
        <BatteryIndicator battery={battery} isVertical={isVertical} />

        {/* Set dots + management */}
        <Divider isVertical={isVertical} />
        <DotsIndicator
          sets={config.sets}
          activeSetId={config.activeSetId}
          isVertical={isVertical}
          onSwitch={switchToSet}
          onAdd={onAddSet}
          onRename={onRenameSet}
          onDelete={onDeleteSet}
        />

        {/* Action buttons */}
        <Divider isVertical={isVertical} />
        <div className={`flex ${isVertical ? "flex-col pb-3" : "flex-row pr-3"} items-center gap-0.5`}>
          <SidebarButton
            icon={editMode ? "✓" : "✏"}
            label={editMode ? "Done" : "Edit"}
            active={editMode}
            onClick={() => { setEditMode((e) => !e); setSettingsOpen(false); }}
          />
          <SidebarButton
            icon="⚙"
            label="Settings"
            active={settingsOpen}
            onClick={() => { setSettingsOpen((s) => !s); setEditMode(false); }}
          />
        </div>

        {/* Swipe label toast */}
        <AnimatePresence>
          {swipeLabel && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.12 }}
              className={`
                absolute pointer-events-none z-50
                px-3 py-1.5 rounded-xl bg-zinc-800/90 backdrop-blur-sm
                border border-white/[0.08] shadow-xl
                text-white text-xs font-medium whitespace-nowrap
                ${isVertical
                  ? "left-full ml-3 top-1/2 -translate-y-1/2"
                  : "top-full mt-3 left-1/2 -translate-x-1/2"}
              `}
            >
              {swipeLabel}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SettingsPanel
        config={config}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSetPosition={onSetPosition}
        onSetIconSize={onSetIconSize}
        onToggleAutoHide={onToggleAutoHide}
        onToggleLabels={onToggleLabels}
      />
    </>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────────

function Divider({ isVertical }: { isVertical: boolean }) {
  return (
    <div className={`shrink-0 bg-white/[0.06] ${isVertical ? "w-10 h-px my-1" : "h-10 w-px mx-1"}`} />
  );
}

// ── iOS-style dot indicator ────────────────────────────────────────────────────

interface DotsIndicatorProps {
  sets: AppSet[];
  activeSetId: string;
  isVertical: boolean;
  onSwitch: (id: string, name: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function DotsIndicator({ sets, activeSetId, isVertical, onSwitch, onAdd, onRename, onDelete }: DotsIndicatorProps) {
  const [hovered, setHovered] = useState(false);
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commitRename() {
    if (editingId && editingName.trim()) onRename(editingId, editingName.trim());
    setEditingId(null);
  }

  return (
    <div
      className={`
        relative flex flex-col items-center w-full py-2 px-1
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
    >
      {/* Dot row */}
      <div className="flex flex-row items-center justify-center gap-[5px] h-4">
        {sets.map((set) => {
          const isActive = set.id === activeSetId;
          return (
            <motion.button
              key={set.id}
              onClick={() => onSwitch(set.id, set.name)}
              title={set.name}
              animate={{
                width:   isActive ? 7 : 5,
                height:  isActive ? 7 : 5,
                opacity: isActive ? 1 : 0.28,
              }}
              transition={{ type: "spring", stiffness: 600, damping: 38 }}
              className="rounded-full bg-white shrink-0 cursor-pointer"
            />
          );
        })}
      </div>

      {/* Hover controls — add + manage */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex flex-row items-center gap-2 mt-1.5"
          >
            {/* Add set */}
            <button
              onClick={() => onAdd(`Set ${sets.length + 1}`)}
              title="New set"
              className="w-4 h-4 rounded-full border border-white/25 flex items-center justify-center text-white/40 text-[9px] hover:border-white/60 hover:text-white/80 transition-colors leading-none"
            >
              +
            </button>

            {/* Manage sets */}
            {sets.length > 0 && (
              <button
                onClick={() => setMgmtOpen((v) => !v)}
                title="Manage sets"
                className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors leading-none"
              >
                ⋯
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Management popover */}
      <AnimatePresence>
        {mgmtOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMgmtOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, x: -4 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
              className="absolute left-full ml-2 bottom-0 z-50 bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl p-1.5 min-w-[160px]"
            >
              <p className="text-[9px] uppercase tracking-widest text-zinc-600 px-2 pt-1 pb-1.5 font-semibold">
                Manage Sets
              </p>

              {sets.map((set) => (
                <div
                  key={set.id}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1.5 group ${
                    set.id === activeSetId ? "bg-white/10" : "hover:bg-white/[0.06]"
                  }`}
                >
                  {editingId === set.id ? (
                    <input
                      ref={inputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 bg-white/10 text-white text-xs rounded px-1.5 py-0.5 outline-none border border-white/20 min-w-0"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => { onSwitch(set.id, set.name); setMgmtOpen(false); }}
                      className="flex-1 text-left text-xs text-zinc-300 hover:text-white truncate"
                    >
                      {set.name}
                    </button>
                  )}

                  {editingId !== set.id && (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(set.id);
                          setEditingName(set.name);
                          setTimeout(() => inputRef.current?.select(), 30);
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/10 text-[10px]"
                      >✏</button>
                      {sets.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(set.id); }}
                          className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-white/10 text-[10px]"
                        >×</button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <div className="mt-1 pt-1 border-t border-white/[0.06]">
                <button
                  onClick={() => { onAdd(`Set ${sets.length + 1}`); setMgmtOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
                >
                  <span className="text-base leading-none">+</span>
                  <span>New set</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sidebar button ─────────────────────────────────────────────────────────────

function SidebarButton({ icon, label, active, onClick }: {
  icon: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm transition-colors
        ${active ? "bg-white/15 text-white" : "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"}`}
    >
      {icon}
    </button>
  );
}
