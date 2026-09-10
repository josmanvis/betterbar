import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import SettingsApp from "./SettingsApp";
import ExtensionWindowApp from "./ExtensionWindowApp";
import "./index.css";

const winLabel = getCurrentWindow().label;
const Root = winLabel === "settings" 
  ? SettingsApp 
  : winLabel.startsWith("ext_") 
    ? ExtensionWindowApp 
    : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
