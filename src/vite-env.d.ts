/// <reference types="vite/client" />

declare module "virtual:betterbar-extensions" {
  import type { ComponentType } from "react";
  interface RegistryEntry {
    name: string;
    displayName: string;
    load: () => Promise<{ default: ComponentType<any> }>;
  }
  export const registry: RegistryEntry[];
  export default registry;
}
