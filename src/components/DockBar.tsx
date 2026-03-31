import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { DockIcon } from "./DockIcon";
import { SettingsPanel } from "./SettingsPanel";
import { DockItem, BetterBarConfig, DockPosition } from "../types";
import { useRunningApps } from "../hooks/useRunningApps";
import { useWindowPosition } from "../hooks/useWindowPosition";

interface DockBarProps {
  config: BetterBarConfig;
  onReorder: (items: DockItem[]) => void;
  onRemove: (id: string) => void;
  onSetPosition: (p: DockPosition) => void;
  onSetIconSize: (s: number) => void;
  onToggleAutoHide: () => void;
  onToggleLabels: () => void;
}

export function DockBar({
  config,
  onReorder,
  onRemove,
  onSetPosition,
  onSetIconSize,
  onToggleAutoHide,
  onToggleLabels,
}: DockBarProps) {
  const [editMode, setEditMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const runningApps = useRunningApps();

  useWindowPosition(config);

  const isVertical = config.position === "left" || config.position === "right";
  const sortedItems = [...config.items].sort((a, b) => a.order - b.order);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sortedItems.findIndex((i) => i.id === active.id);
      const newIndex = sortedItems.findIndex((i) => i.id === over.id);
      const reordered = arrayMove(sortedItems, oldIndex, newIndex).map((item, idx) => ({
        ...item,
        order: idx,
      }));
      onReorder(reordered);
    },
    [sortedItems, onReorder]
  );

  function isRunning(item: DockItem): boolean {
    return runningApps.some(
      (app) =>
        app.name.toLowerCase() === item.name.toLowerCase() ||
        (item.bundleId && app.bundle_id.includes(item.name.toLowerCase()))
    );
  }

  const autoHideProps = config.autoHide
    ? {
        onMouseEnter: () => setVisible(true),
        onMouseLeave: () => setVisible(false),
      }
    : {};

  return (
    <>
      <AnimatePresence>
        {(!config.autoHide || visible) && (
          <motion.div
            initial={{ opacity: 0, y: config.position === "bottom" ? 20 : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: config.position === "bottom" ? 20 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            {...autoHideProps}
            className={`fixed inset-0 flex items-center justify-center pointer-events-none`}
          >
            <div
              className={`pointer-events-auto flex ${isVertical ? "flex-col" : "flex-row"} items-center gap-2
                px-4 py-3 rounded-2xl
                bg-zinc-900/80 backdrop-blur-2xl
                border border-white/10 shadow-2xl
                ${editMode ? "ring-2 ring-white/20" : ""}
              `}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortedItems.map((i) => i.id)}
                  strategy={isVertical ? verticalListSortingStrategy : horizontalListSortingStrategy}
                >
                  <div className={`flex ${isVertical ? "flex-col" : "flex-row"} items-end gap-2`}>
                    {sortedItems.map((item) => (
                      <DockIcon
                        key={item.id}
                        item={item}
                        isRunning={isRunning(item)}
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

              {/* Divider */}
              <div className={`${isVertical ? "w-10 h-px" : "h-10 w-px"} bg-white/15 mx-1`} />

              {/* Action buttons */}
              <div className={`flex ${isVertical ? "flex-col" : "flex-row"} items-center gap-1`}>
                <ActionButton
                  icon={editMode ? "✓" : "✏"}
                  label={editMode ? "Done" : "Edit"}
                  active={editMode}
                  onClick={() => {
                    setEditMode((e) => !e);
                    setSettingsOpen(false);
                  }}
                />
                <ActionButton
                  icon="⚙"
                  label="Settings"
                  active={settingsOpen}
                  onClick={() => {
                    setSettingsOpen((s) => !s);
                    setEditMode(false);
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auto-hide trigger strip */}
      {config.autoHide && !visible && (
        <div
          className={`fixed ${
            config.position === "bottom" ? "bottom-0 left-0 right-0 h-2" :
            config.position === "top" ? "top-0 left-0 right-0 h-2" :
            config.position === "left" ? "left-0 top-0 bottom-0 w-2" :
            "right-0 top-0 bottom-0 w-2"
          } z-50`}
          onMouseEnter={() => setVisible(true)}
        />
      )}

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

function ActionButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-9 h-9 rounded-xl flex items-center justify-center text-base transition-all
        ${active ? "bg-white/25 text-white" : "bg-white/8 text-white/50 hover:bg-white/15 hover:text-white/80"}
      `}
    >
      {icon}
    </button>
  );
}
