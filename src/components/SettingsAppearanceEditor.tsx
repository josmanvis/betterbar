import { useEffect, useState } from "react";
import type { BetterBarConfig } from "../types";
import { AppearanceEditor } from "./AppearanceEditor";

const strings = {
  appearance: "Window appearance", system: "Automatic", light: "Light", dark: "Dark",
  hint: "Automatic follows your Mac’s Light or Dark appearance. Settings and extension windows update together.",
  barControls: "Bar colors and effects", barHint: "Customize your taskbar’s saved colors, transparency, and borders.",
};

export function SettingsAppearanceEditor({ config, update, revealCustom = false }: {
  config: BetterBarConfig; update: (patch: Partial<BetterBarConfig>) => void; revealCustom?: boolean;
}) {
  const selected = config.settingsAppearance || "system";
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (revealCustom) setExpanded(true); }, [revealCustom]);
  return <div className="bb-native-appearance">
    <div className="bb-appearance-modes" role="group" aria-label={strings.appearance}>
      {(["system", "light", "dark"] as const).map(mode => <button key={mode} aria-pressed={selected === mode}
        onClick={() => update({ settingsAppearance: mode })}>
        <span className={`bb-mode-sample bb-mode-${mode}`} aria-hidden="true"><i/><span><i/><i/><i/></span></span>
        <span>{strings[mode]}</span>
      </button>)}
    </div>
    <p className="bb-appearance-hint">{strings.hint}</p>
    <details className="bb-appearance-details" open={expanded || revealCustom} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>{strings.barControls}</summary>
      <p className="bb-appearance-hint mb-4">{strings.barHint}</p>
      <AppearanceEditor config={config} update={update}/>
    </details>
  </div>;
}
