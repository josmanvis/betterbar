import { DockBar } from "./components/DockBar";
import { useConfig } from "./store";

export default function App() {
  const {
    config,
    reorderItems,
    removeItem,
    setPosition,
    setIconSize,
    toggleAutoHide,
    toggleLabels,
  } = useConfig();

  return (
    <DockBar
      config={config}
      onReorder={reorderItems}
      onRemove={removeItem}
      onSetPosition={setPosition}
      onSetIconSize={setIconSize}
      onToggleAutoHide={toggleAutoHide}
      onToggleLabels={toggleLabels}
    />
  );
}
