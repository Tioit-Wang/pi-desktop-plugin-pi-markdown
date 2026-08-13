/// <reference types="vite/client" />

interface PluginBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>;
}

interface Window {
  pluginBridge?: PluginBridge;
}
