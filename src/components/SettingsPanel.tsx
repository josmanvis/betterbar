import { motion, AnimatePresence } from "framer-motion";
import { BetterBarConfig, DockPosition } from "../types";

interface SettingsPanelProps {
  config: BetterBarConfig;
  open: boolean;
  onClose: () => void;
  onSetPosition: (p: DockPosition) => void;
  onSetIconSize: (s: number) => void;
  onToggleAutoHide: () => void;
  onToggleLabels: () => void;
}

const POSITIONS: { value: DockPosition; label: string; icon: string }[] = [
  { value: "bottom", label: "Bottom", icon: "⬇" },
  { value: "top", label: "Top", icon: "⬆" },
  { value: "left", label: "Left", icon: "⬅" },
  { value: "right", label: "Right", icon: "➡" },
];

export function SettingsPanel({
  config,
  open,
  onClose,
  onSetPosition,
  onSetIconSize,
  onToggleAutoHide,
  onToggleLabels,
}: SettingsPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-72 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl p-4 text-white"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">BetterBar Settings</h2>
              <button
                onClick={onClose}
                className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs hover:bg-white/20 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Position */}
            <section className="mb-4">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Position</p>
              <div className="grid grid-cols-4 gap-1.5">
                {POSITIONS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => onSetPosition(p.value)}
                    className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-xs transition-all
                      ${config.position === p.value
                        ? "bg-white/20 text-white font-medium"
                        : "bg-white/5 text-white/50 hover:bg-white/10"
                      }`}
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Icon Size */}
            <section className="mb-4">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-2">
                Icon Size — {config.iconSize}px
              </p>
              <input
                type="range"
                min={32}
                max={96}
                step={4}
                value={config.iconSize}
                onChange={(e) => onSetIconSize(Number(e.target.value))}
                className="w-full accent-white h-1.5"
              />
              <div className="flex justify-between text-xs text-white/30 mt-1">
                <span>Small</span>
                <span>Large</span>
              </div>
            </section>

            {/* Toggles */}
            <section className="space-y-2.5">
              <Toggle
                label="Auto-hide"
                description="Hide when not in use"
                enabled={config.autoHide}
                onToggle={onToggleAutoHide}
              />
              <Toggle
                label="Show Labels"
                description="App names below icons"
                enabled={config.showLabels}
                onToggle={onToggleLabels}
              />
            </section>

            <p className="mt-4 text-xs text-white/25 text-center">
              BetterBar v0.1.0
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Toggle({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 hover:bg-white/8 transition-colors"
    >
      <div className="text-left">
        <p className="text-sm text-white font-medium">{label}</p>
        <p className="text-xs text-white/40">{description}</p>
      </div>
      <div
        className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${enabled ? "bg-white/80" : "bg-white/20"}`}
      >
        <motion.div
          animate={{ x: enabled ? 18 : 2 }}
          transition={{ type: "spring", stiffness: 700, damping: 40 }}
          className="absolute top-1 w-4 h-4 rounded-full bg-zinc-900 shadow"
        />
      </div>
    </button>
  );
}
