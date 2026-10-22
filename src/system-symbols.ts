import { getSystemSymbols } from "./tauri-bridge";

let request: Promise<Record<string, string>> | undefined;
export function systemSymbols() {
  if (!request) request = getSystemSymbols().catch(() => { request = undefined; return {}; });
  return request;
}
