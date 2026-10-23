import { requestExtensionReview } from "./extension-permissions";
import { useExtensions } from "./extensions-runtime";
import { useConfig } from "./store";
import { extensionThemeStyle } from "./appearance";
import { WindowAppearance } from "./components/WindowAppearance";
import "./native-theme.css";

const strings = { missing: "No extension specified.", paused: "This extension is disabled, awaiting permission approval, or unavailable.", open: "Open extension settings" };

export default function ExtensionWindowApp() {
  const { config } = useConfig();
  const extName = new URLSearchParams(window.location.search).get("ext");
  const extensions = useExtensions(extName && config.enabledExtensions.includes(extName) ? [extName] : []);
  const Ext = extensions[0]?.Component;
  return <div style={extensionThemeStyle(config, extName || "")} className="bb-extension-window bb-native-surface w-screen h-screen overflow-hidden bg-[var(--bb-pane)] text-[var(--bb-text)]">
    <WindowAppearance config={config}/>
    {!extName ? <p className="p-8" role="status">{strings.missing}</p>
      : !Ext ? <div className="p-8" role="status"><p>{strings.paused}</p><button onClick={() => { void requestExtensionReview(); }}>{strings.open}</button></div>
      : <Ext isWindowMode={true} config={config}/>}
  </div>;
}
