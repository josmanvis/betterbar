import { getOnScreenWindows } from "../tauri-bridge";
import { usePollingList } from "./usePollingList";

export function useRunningWindows() {
  return usePollingList(getOnScreenWindows, 2000);
}
