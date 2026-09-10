
import { useExtensions } from "./extensions-runtime";

export default function ExtensionWindowApp() {
  const extName = new URLSearchParams(window.location.search).get("ext");
  const extensions = useExtensions(extName ? [extName] : []);
  
  if (!extName) {
    return <div className="p-8 text-white font-mono">No extension specified.</div>;
  }

  if (extensions.length === 0) {
    return <div className="p-8 text-white font-mono">Loading extension...</div>;
  }
  
  const Ext = extensions[0].Component;
  
  return (
    <div className="w-screen h-screen overflow-hidden bg-[var(--bb-pane)] text-[var(--bb-text)] font-sans">
      <Ext isWindowMode={true} />
    </div>
  );
}
