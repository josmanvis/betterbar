import React from "react";
import { marked } from "marked";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
declare function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
export const name = "Standup Update";

export default function StandupUpdate({ isWindowMode, iconSize, slotSize, config }: {
  isWindowMode?: boolean; iconSize?: number; slotSize?: number; config?: { barSize?: number };
}) {
  const glyphSize = iconSize ?? Math.max(20, (config?.barSize ?? 48) - 20);
  const buttonSize = slotSize ?? glyphSize + 8;
  const [content, setContent] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Only load the file if we're in the window or we want to preload
    if (isWindowMode) {
      // @ts-ignore
      invoke<string>("read_standup_file")
        .then((text: string) => {
           const html = marked(text, { async: false, breaks: true, gfm: true });
           setContent(html as string);
        })
        .catch((e: any) => setContent("Error: " + JSON.stringify(e)));
    }
  }, [isWindowMode]);

  if (isWindowMode) {
    return (
      <div className="flex flex-col h-screen w-screen bg-[var(--bb-pane)] text-[var(--bb-text)] p-6 pt-10" data-tauri-drag-region>
        <div className="flex justify-between items-center mb-4 border-b border-[var(--bb-line)] pb-3" data-tauri-drag-region>
          <span className="font-bold text-[14px] tracking-widest text-[var(--bb-accent)] pointer-events-none">TODAY'S STANDUP</span>
        </div>
        <div
          className="overflow-y-auto text-[13px] leading-[1.6] text-[var(--bb-text)] flex-1 text-left markdown-body pr-4"
          dangerouslySetInnerHTML={{ __html: content || "Loading..." }}
        />
      </div>
    );
  }

  return (
    <div
      className="shrink-0 flex items-center justify-center border border-[var(--bb-line)] text-[var(--bb-dim)] hover:border-[var(--bb-accent)] hover:text-[var(--bb-accent)] cursor-pointer transition-colors"
      style={{ width: buttonSize, height: buttonSize }}
      onClick={async () => {
        const existing = await WebviewWindow.getByLabel("ext_Standup_Update");
        if (existing) {
          await existing.show();
          await existing.setFocus();
          return;
        }
        const win = new WebviewWindow("ext_Standup_Update", {
          url: "/?ext=Standup%20Update",
          title: "Today's Standup",
          width: 500,
          height: 600,
          decorations: true,
          transparent: false,
          center: true,
        });
        win.once("tauri://error", (e) => {
           console.error("Window error", e);
           win.setFocus();
        });
      }}
      title="Standup Update"
    >
      <div className="font-bold tracking-wider uppercase transition-colors" style={{ fontSize: Math.max(8, glyphSize * 9 / 28) }}>
        SUP
      </div>
    </div>
  );
}

// Inject some markdown styles globally
if (!document.getElementById("standup-styles")) {
  const style = document.createElement("style");
  style.id = "standup-styles";
  style.innerHTML = `
    .markdown-body h1 { font-size: 1.5em; font-weight: bold; margin-bottom: 0.5em; color: var(--bb-accent); }
    .markdown-body h2 { font-size: 1.25em; font-weight: bold; margin-top: 1em; margin-bottom: 0.5em; border-bottom: 1px solid var(--bb-line); padding-bottom: 2px; }
    .markdown-body h3 { font-size: 1.1em; font-weight: bold; margin-top: 0.5em; margin-bottom: 0.25em; }
    .markdown-body p { margin-bottom: 0.5em; }
    .markdown-body ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 0.5em; }
    .markdown-body ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 0.5em; }
    .markdown-body li { margin-bottom: 0.25em; }
    .markdown-body a { color: var(--bb-accent); text-decoration: underline; }
    .markdown-body strong { font-weight: bold; color: var(--bb-text); }
    .markdown-body code { background: var(--bb-pane-2); padding: 2px 4px; border-radius: 3px; font-family: monospace; }
    .markdown-body hr { border: 0; border-top: 1px solid var(--bb-line); margin: 1em 0; }
  `;
  document.head.appendChild(style);
}

export function Settings() {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-[var(--bb-dim)] uppercase tracking-wider mb-1">Standup Update Configuration</div>
      <div className="text-[11px] text-[var(--bb-text)]">
        Path to standup files: <span className="font-mono text-[var(--bb-accent)]">~/.prep-standup/</span>
      </div>
      <div className="text-[10px] text-[var(--bb-mute)] mt-1">
        This extension automatically loads the most recent .md file from the folder above and renders it.
      </div>
    </div>
  );
}
