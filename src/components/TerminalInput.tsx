import { useState, useRef, useEffect } from "react";
import { TerminalApp, DockPosition } from "../types";
import { getInstalledTerminals, executeTerminalCommand } from "../tauri-bridge";
import { Terminal } from "@phosphor-icons/react";

interface TerminalInputProps {
  isVertical: boolean;
  editMode: boolean;
  onExpandedChange: (expanded: boolean) => void;
  barSize: number;
  defaultTerminal?: string;
  position: DockPosition;
}

const SUGGESTIONS = [
  "ls -la",
  "git status",
  "npm run dev",
  "npm test",
  "cargo run",
  "git commit -m \"",
  "brew update",
  "docker ps",
  "curl -I ",
  "ping google.com",
];

export function TerminalInput({
  isVertical,
  editMode,
  onExpandedChange,
  defaultTerminal,
  position,
}: TerminalInputProps) {
  const [expanded, setExpanded] = useState(false);
  const [command, setCommand] = useState("");
  const [terminals, setTerminals] = useState<TerminalApp[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = command.trim();
  const matches = trimmed
    ? SUGGESTIONS.filter(
        (s) =>
          s.toLowerCase().startsWith(trimmed.toLowerCase()) &&
          s.toLowerCase() !== trimmed.toLowerCase()
      )
    : [];

  useEffect(() => {
    onExpandedChange(expanded);
    if (expanded && terminals.length === 0) {
      getInstalledTerminals().then(setTerminals).catch(console.error);
    }
    if (expanded) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setCommand("");
      setSelecting(false);
      setSelectedIndex(0);
      setActiveSuggestionIndex(-1);
    }
  }, [expanded]);

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [command]);

  useEffect(() => {
    const handleGlobalHotKey = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        activeEl !== inputRef.current &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if (e.key === "t" || e.key === "T" || e.key === " ") {
        e.preventDefault();
        if (!expanded) {
          setExpanded(true);
        } else {
          inputRef.current?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalHotKey);
    return () => window.removeEventListener("keydown", handleGlobalHotKey);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;

    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selecting) {
          setSelecting(false);
          setTimeout(() => inputRef.current?.focus(), 50);
        } else {
          setExpanded(false);
        }
      } else if (selecting) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (terminals.length > 0) {
            executeCommand(terminals[selectedIndex]);
          }
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % terminals.length);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + terminals.length) % terminals.length);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [expanded, selecting, terminals, selectedIndex, command]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const trimmedVal = command.trim();
    if (matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex((i) => (i + 1) % matches.length);
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      } else if (e.key === "Enter" && activeSuggestionIndex >= 0) {
        e.preventDefault();
        setCommand(matches[activeSuggestionIndex]);
        setActiveSuggestionIndex(-1);
        return;
      }
    }

    if (e.key === "Enter" && trimmedVal.length > 0) {
      const terminalToUse = defaultTerminal || "com.apple.Terminal";
      executeTerminalCommand(terminalToUse, trimmedVal)
        .then(() => setExpanded(false))
        .catch(console.error);
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && trimmedVal.length > 0) {
      e.preventDefault();
      setSelecting(true);
      setSelectedIndex(0);
    }
  };

  const executeCommand = async (term: TerminalApp) => {
    try {
      await executeTerminalCommand(term.bundle_id, command);
    } catch (e) {
      console.error(e);
    }
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`
          shrink-0 flex items-center justify-center cursor-pointer focus:outline-none
          text-[9px] font-bold uppercase tracking-[0.18em]
          ${isVertical ? "w-full py-1.5 flex-col gap-0.5" : "h-full px-2 flex-row gap-1"}
          ${editMode ? "text-black bg-[var(--bb-accent)]" : "text-[var(--bb-accent)] hover:bg-[var(--bb-pane)]"}
          border-b border-[var(--bb-line)] transition-colors duration-75
        `}
        title="Run Terminal Command"
      >
        <span>BB</span>
        <span className="bb-caret">▍</span>
      </button>
    );
  }

  // Suggestions dynamic flyout direction styles
  const suggestionsStyle: React.CSSProperties =
    position === "bottom"
      ? { bottom: "calc(100% + 4px)", left: 8 }
      : position === "top"
      ? { top: "calc(100% + 4px)", left: 8 }
      : position === "left"
      ? { left: "calc(100% + 4px)", top: 0, width: "180px" }
      : { right: "calc(100% + 4px)", top: 0, width: "180px" };

  return (
    <div
      className={`
        shrink-0 flex items-center bg-[var(--bb-pane)]
        border-b border-[var(--bb-line)]
        ${isVertical ? "w-full min-h-[48px]" : "h-full min-w-[320px] px-2"}
      `}
      style={{
        width: isVertical ? "100%" : undefined,
      }}
    >
      <div className="flex-1 flex flex-col justify-center px-2 py-1 w-full h-full relative">
        {!selecting ? (
          <div className="flex items-center gap-2 w-full h-full">
            <span className="text-[var(--bb-accent)] font-bold text-sm shrink-0">&gt;</span>
            <input
              ref={inputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter shell command..."
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              className="bg-transparent text-[var(--bb-fg)] outline-none flex-1 text-xs font-mono w-full placeholder:text-[var(--bb-mute)]"
            />
            <button
              onClick={() => setExpanded(false)}
              className="text-[var(--bb-mute)] hover:text-white shrink-0 text-xs px-1 cursor-pointer"
            >
              esc
            </button>

            {/* Suggestions Flyout */}
            {matches.length > 0 && (
              <div
                style={suggestionsStyle}
                className="absolute z-[99] bg-black border border-[var(--bb-accent)] font-mono text-xs flex flex-col divide-y divide-[var(--bb-line)] shadow-lg"
              >
                <div className="text-[9px] text-[var(--bb-mute)] px-2 py-0.5 uppercase tracking-wider bg-[var(--bb-pane-2)] select-none">
                  Suggestions
                </div>
                {matches.map((match, idx) => {
                  const isHighlighted = idx === activeSuggestionIndex;
                  return (
                    <button
                      key={match}
                      onClick={() => {
                        setCommand(match);
                        setActiveSuggestionIndex(-1);
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      className={`
                        w-full text-left px-2 py-1 cursor-pointer transition-colors duration-75 text-[10px] truncate
                        ${
                          isHighlighted
                            ? "bg-[var(--bb-accent)] text-black font-bold"
                            : "text-[var(--bb-text)] hover:bg-[var(--bb-pane-2)] hover:text-white"
                        }
                      `}
                    >
                      {match}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col w-full text-xs font-mono py-1 gap-1 h-full justify-center">
            <div className="text-[var(--bb-mute)] text-[10px] truncate px-1 flex justify-between">
              <span>Run: {command}</span>
              <button onClick={() => setExpanded(false)} className="hover:text-white cursor-pointer">esc</button>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar max-w-full pb-1">
              {terminals.map((term, i) => {
                const selected = i === selectedIndex;
                return (
                  <button
                    key={term.bundle_id}
                    onClick={() => executeCommand(term)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`
                      shrink-0 flex flex-col items-center justify-center p-1 rounded gap-1 cursor-pointer
                      ${selected ? "bg-[var(--bb-accent)]/20 border-[var(--bb-accent)]" : "border-transparent hover:bg-[var(--bb-pane-2)]"}
                      border transition-colors w-[52px] h-[52px]
                    `}
                    title={term.name}
                  >
                    {term.icon ? (
                      <img src={term.icon} alt={term.name} className="w-6 h-6 object-contain" />
                    ) : (
                      <Terminal size={24} className="text-[var(--bb-accent)]" />
                    )}
                    <span className="text-[9px] text-[var(--bb-fg)] truncate w-full text-center" style={{ fontSize: "8px" }}>
                      {term.name}
                    </span>
                  </button>
                );
              })}
              {terminals.length === 0 && (
                <div className="text-[var(--bb-mute)] text-[10px] p-2">No terminals found</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
