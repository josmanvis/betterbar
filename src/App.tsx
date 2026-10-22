import { useEffect } from "react";
import { openSettingsWindow } from "./tauri-bridge";
import { DockBar } from "./components/DockBar";
import { useConfig } from "./store";

export default function App() {
  useEffect(() => {
    const openPreferences = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        openSettingsWindow().catch(() => {});
      }
    };
    window.addEventListener("keydown", openPreferences);
    return () => window.removeEventListener("keydown", openPreferences);
  }, []);

  const {
    config,
    activeSet,
    setBarOrder,
    removeItem,
    addItem,
    renameItem,
    setItemHidden,
    setItemIcon,
    setItemDeviceIcon,
    setItemForceGlyph,
    setItemForceNative,
    setItemDisplayType,
    setBarSize,
    setBarLength,
    switchSet,
    setFloatPosition,
    setFreeFloat,
    toggleWindowGrouping,
  } = useConfig();

  return (
    <DockBar
      config={config}
      activeSet={activeSet}
      onSetBarOrder={setBarOrder}
      onRemove={removeItem}
      onAddItem={addItem}
      onRenameItem={renameItem}
      onSetItemHidden={setItemHidden}
      onSetBarSize={setBarSize}
      onSetBarLength={setBarLength}
      onSwitchSet={switchSet}
      onFloatPositionChange={setFloatPosition}
      onSetFreeFloat={setFreeFloat}
      onToggleGrouping={toggleWindowGrouping}
      onSetItemIcon={setItemIcon}
      onSetItemDeviceIcon={setItemDeviceIcon}
      onSetItemForceGlyph={setItemForceGlyph}
      onSetItemForceNative={setItemForceNative}
      onSetItemDisplayType={setItemDisplayType}
    />
  );
}
