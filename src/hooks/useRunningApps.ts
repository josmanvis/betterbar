import { getRunningApps } from "../tauri-bridge";
import { usePollingList } from "./usePollingList";

export function useRunningApps() {
  return usePollingList(getRunningApps, 2000);
}
