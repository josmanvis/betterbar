import { DockBar } from "./components/DockBar";
import { useConfig } from "./store";

export default function App() {
  const {
    config,
    activeSet,
    reorderItems,
    removeItem,
    renameItem,
    setItemHidden,
    setBarSize,
    setBarLength,
    switchSet,
    setFloatPosition,
    setFreeFloat,
  } = useConfig();

  return (
    <DockBar
      config={config}
      activeSet={activeSet}
      onReorder={reorderItems}
      onRemove={removeItem}
      onRenameItem={renameItem}
      onSetItemHidden={setItemHidden}
      onSetBarSize={setBarSize}
      onSetBarLength={setBarLength}
      onSwitchSet={switchSet}
      onFloatPositionChange={setFloatPosition}
      onSetFreeFloat={setFreeFloat}
    />
  );
}
