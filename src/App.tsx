import { DockBar } from "./components/DockBar";
import { useConfig } from "./store";

export default function App() {
  const {
    config,
    activeSet,
    reorderItems,
    removeItem,
    setPosition,
    setIconSize,
    toggleAutoHide,
    toggleLabels,
    switchSet,
    addSet,
    renameSet,
    deleteSet,
  } = useConfig();

  return (
    <DockBar
      config={config}
      activeSet={activeSet}
      onReorder={reorderItems}
      onRemove={removeItem}
      onSetPosition={setPosition}
      onSetIconSize={setIconSize}
      onToggleAutoHide={toggleAutoHide}
      onToggleLabels={toggleLabels}
      onSwitchSet={switchSet}
      onAddSet={addSet}
      onRenameSet={renameSet}
      onDeleteSet={deleteSet}
    />
  );
}
