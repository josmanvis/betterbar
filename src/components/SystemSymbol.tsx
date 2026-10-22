import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { systemSymbols } from "../system-symbols";

export function SystemSymbol({ name, size = 17, fallback }: { name: string; size?: number; fallback?: ReactNode }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let active = true;
    systemSymbols().then(symbols => { if (active) setSource(symbols[name]); });
    return () => { active = false; };
  }, [name]);
  return <span className="bb-system-symbol" aria-hidden="true" style={{ width: size, height: size }}>
    {source ? <span style={{ width: "100%", height: "100%", display: "block", backgroundColor: "currentColor", mask: `url("${source}") center / contain no-repeat`, WebkitMask: `url("${source}") center / contain no-repeat` } as CSSProperties}/> : fallback}
  </span>;
}
