import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./index.css";

const winLabel = getCurrentWindow().label;
const Root = winLabel === "settings"
  ? React.lazy(() => import("./SettingsApp"))
  : winLabel.startsWith("ext_")
    ? React.lazy(() => import("./ExtensionWindowApp"))
    : React.lazy(() => import("./App"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <React.Suspense fallback={null}><Root /></React.Suspense>
  </React.StrictMode>,
);
